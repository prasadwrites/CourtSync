/**
 * The booking engine's pure core. Cloud Functions run it inside a Firestore
 * transaction, and the web app runs it to render calendars. Keeping it free of
 * I/O lets the same rules be unit tested exhaustively.
 */
import type { BlockedSlot, Court, SlotLock } from './types';
import { weekdayOf, daysBetween, todayIn, localToInstant } from './time';

export type SlotState = 'available' | 'limited' | 'full' | 'blocked' | 'closed' | 'past';

export interface Slot {
  startMin: number;
  endMin: number;
  state: SlotState;
  /** Units still free: 1 or 0 for whole-court models, seats for shared courts. */
  remaining: number;
  capacity: number;
  /** For session courts, the session label. */
  label?: string;
}

export interface EngineContext {
  court: Pick<
    Court,
    | 'bookingModel'
    | 'capacity'
    | 'slotIntervalMinutes'
    | 'operatingHours'
    | 'sessions'
    | 'timezone'
    | 'minDurationMinutes'
    | 'maxDurationMinutes'
    | 'maxParticipants'
    | 'status'
    | 'branchId'
  > & { id: string; maxAdvanceDays?: number | null };
  blocks: (BlockedSlot & { id?: string })[];
  locks: SlotLock[];
  now: Date;
  rules: { minAdvanceMinutes: number; maxAdvanceDays: number };
}

/** Units a whole-court booking consumes against a capacity of 1. */
export function lockCapacity(court: Pick<Court, 'bookingModel' | 'capacity'>): number {
  return court.bookingModel === 'shared' ? Math.max(1, court.capacity) : 1;
}

export function lockId(date: string, startMin: number): string {
  return `${date}_${startMin.toString().padStart(4, '0')}`;
}

export function activeUnits(lock: SlotLock | undefined, nowMs: number, ignoreHoldId?: string): number {
  if (!lock) return 0;
  let used = 0;
  for (const [holdId, hold] of Object.entries(lock.holds ?? {})) {
    if (holdId === ignoreHoldId) continue;
    if (hold.expiresAt && hold.expiresAt.toMillis() <= nowMs) continue;
    used += hold.units;
  }
  return used;
}

/** Whether a block applies to this court on this date, and which minutes it covers. */
export function blockRangeOn(
  block: BlockedSlot,
  courtId: string,
  branchId: string,
  date: string,
): { start: number; end: number } | null {
  if (block.courtId && block.courtId !== courtId) return null;
  if (!block.courtId && block.branchId !== branchId) return null;
  const end = block.endDate || '9999-12-31';
  if (date < block.startDate || date > end) return null;
  if (block.kind === 'weekly' && !block.days.includes(weekdayOf(date))) return null;
  if (block.startMin == null || block.endMin == null) return { start: 0, end: 24 * 60 };
  return { start: block.startMin, end: block.endMin };
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** Operating sessions for a weekday, clipped to the day. */
export function openRanges(court: EngineContext['court'], date: string): { start: number; end: number }[] {
  const day = court.operatingHours?.[weekdayOf(date)];
  return (day?.sessions ?? [])
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(24 * 60, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

function isOpen(court: EngineContext['court'], date: string, start: number, end: number): boolean {
  return openRanges(court, date).some((r) => r.start <= start && end <= r.end);
}

export function dateWithinWindow(ctx: EngineContext, date: string): 'past' | 'tooFar' | null {
  const today = todayIn(ctx.court.timezone, ctx.now);
  if (date < today) return 'past';
  const maxDays = ctx.court.maxAdvanceDays ?? ctx.rules.maxAdvanceDays;
  if (maxDays > 0 && daysBetween(today, date) > maxDays) return 'tooFar';
  return null;
}

/** Grid cells for a date, with their state. Used for calendars and slot pickers. */
export function computeSlots(ctx: EngineContext, date: string): Slot[] {
  const { court } = ctx;
  const cap = lockCapacity(court);
  const nowMs = ctx.now.getTime();
  const earliest = nowMs + ctx.rules.minAdvanceMinutes * 60_000;
  const windowIssue = dateWithinWindow(ctx, date);
  const lockMap = new Map(ctx.locks.filter((l) => l.date === date).map((l) => [l.startMin, l]));
  const blockRanges = ctx.blocks
    .map((b) => blockRangeOn(b, court.id, court.branchId, date))
    .filter((r): r is { start: number; end: number } => r !== null);

  const cells: { start: number; end: number; label?: string }[] = [];
  if (court.bookingModel === 'session') {
    const wd = weekdayOf(date);
    for (const s of court.sessions ?? []) {
      if (s.days.includes(wd)) cells.push({ start: s.start, end: s.end, label: s.label });
    }
    cells.sort((a, b) => a.start - b.start);
  } else {
    const step = Math.max(5, court.slotIntervalMinutes);
    for (const r of openRanges(court, date)) {
      for (let t = r.start; t + step <= r.end; t += step) cells.push({ start: t, end: t + step });
    }
  }

  return cells.map(({ start, end, label }) => {
    const base = { startMin: start, endMin: end, capacity: cap, label };
    if (court.status !== 'active') return { ...base, state: 'closed' as const, remaining: 0 };
    if (court.bookingModel === 'session' && !isOpen(court, date, start, end)) {
      return { ...base, state: 'closed' as const, remaining: 0 };
    }
    if (windowIssue || localToInstant(date, start, court.timezone).getTime() < earliest) {
      return { ...base, state: 'past' as const, remaining: 0 };
    }
    if (blockRanges.some((r) => overlaps(start, end, r.start, r.end))) {
      return { ...base, state: 'blocked' as const, remaining: 0 };
    }
    let remaining = cap;
    for (const t of gridStarts(court, start, end)) {
      remaining = Math.min(remaining, cap - activeUnits(lockMap.get(t), nowMs));
    }
    remaining = Math.max(0, remaining);
    const state: SlotState = remaining === 0 ? 'full' : remaining < cap ? 'limited' : 'available';
    return { ...base, state, remaining };
  });
}

/** Lock cell starts covered by [start, end). Every model locks on the interval grid. */
export function gridStarts(court: Pick<Court, 'slotIntervalMinutes'>, start: number, end: number): number[] {
  const step = Math.max(5, court.slotIntervalMinutes);
  const out: number[] = [];
  const first = Math.floor(start / step) * step;
  for (let t = first; t < end; t += step) out.push(t);
  return out;
}

export interface BookingRequestCheck {
  date: string;
  startMin: number;
  endMin: number;
  participants: number;
  /** Ignore an existing hold when re-validating a modification of the same booking. */
  ignoreHoldId?: string;
}

export type BookingCheckResult =
  | { ok: true; units: number; cells: number[]; capacity: number }
  | { ok: false; code: BookingRejection; message: string };

export type BookingRejection =
  | 'courtUnavailable'
  | 'invalidTime'
  | 'past'
  | 'tooSoon'
  | 'tooFar'
  | 'closed'
  | 'blocked'
  | 'duration'
  | 'participants'
  | 'conflict'
  | 'session';

/** Authoritative validation for a booking request. Runs in the booking transaction. */
export function checkBookingRequest(ctx: EngineContext, req: BookingRequestCheck): BookingCheckResult {
  const { court } = ctx;
  const fail = (code: BookingRejection, message: string): BookingCheckResult => ({ ok: false, code, message });
  if (court.status !== 'active') return fail('courtUnavailable', 'This court is not accepting bookings right now.');
  const { date, startMin, endMin } = req;
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin) || startMin < 0 || endMin > 24 * 60 || endMin <= startMin) {
    return fail('invalidTime', 'The selected time range is invalid.');
  }
  const step = Math.max(5, court.slotIntervalMinutes);

  if (court.bookingModel === 'session') {
    const wd = weekdayOf(date);
    const match = (court.sessions ?? []).find((s) => s.start === startMin && s.end === endMin && s.days.includes(wd));
    if (!match) return fail('session', 'Pick one of the sessions offered for this day.');
  } else {
    if (startMin % step !== 0 || endMin % step !== 0) {
      return fail('invalidTime', `Bookings start and end on ${step}-minute boundaries.`);
    }
    const duration = endMin - startMin;
    if (duration < court.minDurationMinutes || duration > court.maxDurationMinutes) {
      return fail('duration', `Bookings must be between ${court.minDurationMinutes} and ${court.maxDurationMinutes} minutes.`);
    }
  }

  const participants = Math.floor(req.participants);
  if (participants < 1 || participants > Math.max(1, court.maxParticipants)) {
    return fail('participants', `Participants must be between 1 and ${court.maxParticipants}.`);
  }

  const windowIssue = dateWithinWindow(ctx, date);
  if (windowIssue === 'past') return fail('past', 'That date has already passed.');
  if (windowIssue === 'tooFar') return fail('tooFar', 'That date is too far in advance.');
  const startInstant = localToInstant(date, startMin, court.timezone).getTime();
  if (startInstant < ctx.now.getTime()) return fail('past', 'That time has already passed.');
  if (startInstant < ctx.now.getTime() + ctx.rules.minAdvanceMinutes * 60_000) {
    return fail('tooSoon', `Bookings need at least ${ctx.rules.minAdvanceMinutes} minutes notice.`);
  }

  if (!isOpen(court, date, startMin, endMin)) return fail('closed', 'The court is closed for part of that time.');

  for (const b of ctx.blocks) {
    const r = blockRangeOn(b, court.id, court.branchId, date);
    if (r && overlaps(startMin, endMin, r.start, r.end)) {
      return fail('blocked', `That time is blocked${b.reason ? `: ${b.reason}` : ''}.`);
    }
  }

  const capacity = lockCapacity(court);
  const units = court.bookingModel === 'shared' ? participants : 1;
  const lockMap = new Map(ctx.locks.filter((l) => l.date === date).map((l) => [l.startMin, l]));
  const cells = gridStarts(court, startMin, endMin);
  const nowMs = ctx.now.getTime();
  for (const t of cells) {
    const used = activeUnits(lockMap.get(t), nowMs, req.ignoreHoldId);
    if (used + units > capacity) return fail('conflict', 'Someone has already booked part of that time.');
  }
  return { ok: true, units, cells, capacity };
}
