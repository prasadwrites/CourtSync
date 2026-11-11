import { describe, expect, it } from 'vitest';
import {
  checkBookingRequest,
  computeSlots,
  computeSubtotal,
  checkCreditRedemption,
  consumeLots,
  lockId,
  uniformHours,
  courtSchema,
  defaultCourt,
  DEFAULT_CREDIT_RULES,
  type EngineContext,
  type SlotLock,
  type BlockedSlot,
} from '../src';

const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: () => ms, toDate: () => new Date(ms) });

// 2030-01-07 is a Monday. "now" is 2030-01-06 12:00 UTC.
const NOW = new Date('2030-01-06T12:00:00Z');
const DATE = '2030-01-07';

function ctx(overrides: Partial<EngineContext> = {}, court: Partial<EngineContext['court']> = {}): EngineContext {
  return {
    court: {
      id: 'c1',
      branchId: 'b1',
      bookingModel: 'exclusive',
      capacity: 1,
      slotIntervalMinutes: 30,
      operatingHours: uniformHours(6 * 60, 22 * 60),
      sessions: [],
      timezone: 'UTC',
      minDurationMinutes: 60,
      maxDurationMinutes: 180,
      maxParticipants: 4,
      status: 'active',
      ...court,
    },
    blocks: [],
    locks: [],
    now: NOW,
    rules: { minAdvanceMinutes: 60, maxAdvanceDays: 30 },
    ...overrides,
  };
}

function lock(startMin: number, holds: SlotLock['holds'], capacity = 1): SlotLock {
  return { date: DATE, startMin, capacity, holds };
}

describe('checkBookingRequest', () => {
  it('accepts a valid exclusive booking and returns the cells to lock', () => {
    const r = checkBookingRequest(ctx(), { date: DATE, startMin: 600, endMin: 690, participants: 2 });
    expect(r).toEqual({ ok: true, units: 1, cells: [600, 630, 660], capacity: 1 });
  });

  it('rejects overlapping bookings (double booking)', () => {
    const locks = [lock(630, { b1: { units: 1, expiresAt: null } })];
    const r = checkBookingRequest(ctx({ locks }), { date: DATE, startMin: 600, endMin: 690, participants: 1 });
    expect(r).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('treats expired holds as free', () => {
    const locks = [lock(630, { b1: { units: 1, expiresAt: ts(NOW.getTime() - 1000) } })];
    const r = checkBookingRequest(ctx({ locks }), { date: DATE, startMin: 600, endMin: 690, participants: 1 });
    expect(r.ok).toBe(true);
  });

  it('ignores its own hold when modifying', () => {
    const locks = [lock(600, { me: { units: 1, expiresAt: null } })];
    const r = checkBookingRequest(ctx({ locks }), { date: DATE, startMin: 600, endMin: 660, participants: 1, ignoreHoldId: 'me' });
    expect(r.ok).toBe(true);
  });

  it('allows back-to-back bookings', () => {
    const locks = [lock(540, { b1: { units: 1, expiresAt: null } }), lock(570, { b1: { units: 1, expiresAt: null } })];
    const r = checkBookingRequest(ctx({ locks }), { date: DATE, startMin: 600, endMin: 660, participants: 1 });
    expect(r.ok).toBe(true);
  });

  it('enforces operating hours, duration, alignment and participants', () => {
    expect(checkBookingRequest(ctx(), { date: DATE, startMin: 300, endMin: 420, participants: 1 })).toMatchObject({ code: 'closed' });
    expect(checkBookingRequest(ctx(), { date: DATE, startMin: 600, endMin: 630, participants: 1 })).toMatchObject({ code: 'duration' });
    expect(checkBookingRequest(ctx(), { date: DATE, startMin: 610, endMin: 670, participants: 1 })).toMatchObject({ code: 'invalidTime' });
    expect(checkBookingRequest(ctx(), { date: DATE, startMin: 600, endMin: 660, participants: 5 })).toMatchObject({ code: 'participants' });
  });

  it('enforces the advance window', () => {
    expect(checkBookingRequest(ctx(), { date: '2030-01-05', startMin: 600, endMin: 660, participants: 1 })).toMatchObject({ code: 'past' });
    expect(checkBookingRequest(ctx(), { date: '2030-03-01', startMin: 600, endMin: 660, participants: 1 })).toMatchObject({ code: 'tooFar' });
    const soon = ctx({ now: new Date('2030-01-07T09:30:00Z') });
    expect(checkBookingRequest(soon, { date: DATE, startMin: 600, endMin: 660, participants: 1 })).toMatchObject({ code: 'tooSoon' });
  });

  it('respects one-off, weekly and branch-wide blocks', () => {
    const base: BlockedSlot = { courtId: 'c1', branchId: 'b1', reason: 'Maintenance', kind: 'oneOff', startDate: DATE, endDate: DATE, startMin: 600, endMin: 660, days: [] };
    expect(checkBookingRequest(ctx({ blocks: [base] }), { date: DATE, startMin: 630, endMin: 690, participants: 1 })).toMatchObject({ code: 'blocked' });
    const weekly: BlockedSlot = { ...base, kind: 'weekly', startDate: '2030-01-01', endDate: '', days: ['mon'] };
    expect(checkBookingRequest(ctx({ blocks: [weekly] }), { date: DATE, startMin: 600, endMin: 660, participants: 1 })).toMatchObject({ code: 'blocked' });
    expect(checkBookingRequest(ctx({ blocks: [{ ...weekly, days: ['tue'] }] }), { date: DATE, startMin: 600, endMin: 660, participants: 1 }).ok).toBe(true);
    const holiday: BlockedSlot = { ...base, courtId: null, kind: 'holiday', startMin: null, endMin: null };
    expect(checkBookingRequest(ctx({ blocks: [holiday] }), { date: DATE, startMin: 900, endMin: 960, participants: 1 })).toMatchObject({ code: 'blocked' });
    expect(checkBookingRequest(ctx({ blocks: [{ ...holiday, branchId: 'other' }] }), { date: DATE, startMin: 900, endMin: 960, participants: 1 }).ok).toBe(true);
  });

  it('shares capacity on shared courts', () => {
    const shared = { bookingModel: 'shared' as const, capacity: 10, maxParticipants: 10 };
    const locks = [lock(600, { b1: { units: 7, expiresAt: null } }, 10)];
    expect(checkBookingRequest(ctx({ locks }, shared), { date: DATE, startMin: 600, endMin: 660, participants: 3 })).toMatchObject({ ok: true, units: 3 });
    expect(checkBookingRequest(ctx({ locks }, shared), { date: DATE, startMin: 600, endMin: 660, participants: 4 })).toMatchObject({ code: 'conflict' });
  });

  it('only allows defined sessions on session courts', () => {
    const session = {
      bookingModel: 'session' as const,
      sessions: [{ label: 'Morning nets', start: 360, end: 480, days: ['mon' as const] }],
    };
    expect(checkBookingRequest(ctx({}, session), { date: DATE, startMin: 360, endMin: 480, participants: 1 }).ok).toBe(true);
    expect(checkBookingRequest(ctx({}, session), { date: DATE, startMin: 360, endMin: 420, participants: 1 })).toMatchObject({ code: 'session' });
  });

  it('refuses inactive courts', () => {
    expect(checkBookingRequest(ctx({}, { status: 'temporarilyClosed' }), { date: DATE, startMin: 600, endMin: 660, participants: 1 })).toMatchObject({ code: 'courtUnavailable' });
  });

  it('works in non-UTC time zones', () => {
    // 2030-01-07 10:00 in Kolkata is 04:30 UTC, after NOW.
    const r = checkBookingRequest(ctx({}, { timezone: 'Asia/Kolkata' }), { date: DATE, startMin: 600, endMin: 660, participants: 1 });
    expect(r.ok).toBe(true);
  });
});

describe('computeSlots', () => {
  it('marks booked, blocked and available cells', () => {
    const locks = [lock(600, { b1: { units: 1, expiresAt: null } })];
    const blocks: BlockedSlot[] = [{ courtId: 'c1', branchId: 'b1', reason: 'x', kind: 'oneOff', startDate: DATE, endDate: DATE, startMin: 720, endMin: 780, days: [] }];
    const slots = computeSlots(ctx({ locks, blocks }), DATE);
    const at = (m: number) => slots.find((s) => s.startMin === m)!;
    expect(slots).toHaveLength(32);
    expect(at(600).state).toBe('full');
    expect(at(630).state).toBe('available');
    expect(at(720).state).toBe('blocked');
  });

  it('supports several operating sessions per day', () => {
    const hours = uniformHours(6 * 60, 9 * 60);
    hours.mon = { sessions: [{ start: 360, end: 480 }, { start: 1020, end: 1080 }] };
    const slots = computeSlots(ctx({}, { operatingHours: hours }), DATE);
    expect(slots.map((s) => s.startMin)).toEqual([360, 390, 420, 450, 1020, 1050]);
  });

  it('lockId sorts lexically by time', () => {
    expect(lockId(DATE, 90) < lockId(DATE, 600)).toBe(true);
  });
});

describe('pricing', () => {
  const court = {
    bookingModel: 'exclusive' as const,
    slotIntervalMinutes: 30,
    pricing: { basePrice: 400, sessionPrice: 0, peak: [{ days: ['mon' as const], start: 1080, end: 1320, price: 600 }] },
  };
  it('splits standard and peak time', () => {
    const r = computeSubtotal(court, DATE, 1020, 1140, 1);
    expect(r.subtotal).toBe(400 + 600);
    expect(r.lines).toHaveLength(2);
  });
  it('multiplies by participants on shared courts', () => {
    expect(computeSubtotal({ ...court, bookingModel: 'shared' }, DATE, 600, 660, 3).subtotal).toBe(1200);
  });
  it('charges a flat session price', () => {
    expect(computeSubtotal({ ...court, bookingModel: 'session', pricing: { ...court.pricing, sessionPrice: 750 } }, DATE, 360, 480, 1).subtotal).toBe(750);
  });
});

describe('credits', () => {
  const rules = { ...DEFAULT_CREDIT_RULES, creditValue: 2, minRedeem: 10, maxRedeemPerTransaction: 100 };
  it('validates redemption limits', () => {
    expect(checkCreditRedemption(0, 0, 100, rules, 'bookings')).toEqual({ ok: true, credits: 0, value: 0 });
    expect(checkCreditRedemption(5, 50, 100, rules, 'bookings').ok).toBe(false);
    expect(checkCreditRedemption(60, 50, 100, rules, 'bookings').ok).toBe(false);
    expect(checkCreditRedemption(150, 500, 1000, rules, 'bookings').ok).toBe(false);
    expect(checkCreditRedemption(60, 500, 100, rules, 'bookings').ok).toBe(false);
    expect(checkCreditRedemption(50, 500, 100, rules, 'bookings')).toEqual({ ok: true, credits: 50, value: 100 });
    expect(checkCreditRedemption(50, 500, 100, { ...rules, eligible: { bookings: false, services: true } }, 'bookings').ok).toBe(false);
  });
  it('consumes the soonest-expiring lots first and skips expired ones', () => {
    const lots = [
      { id: 'never', remaining: 100, expiresAtMs: null },
      { id: 'soon', remaining: 30, expiresAtMs: 2000 },
      { id: 'expired', remaining: 50, expiresAtMs: 500 },
    ];
    expect(consumeLots(lots, 50, 1000)).toEqual([{ id: 'soon', take: 30 }, { id: 'never', take: 20 }]);
    expect(() => consumeLots(lots, 200, 1000)).toThrow();
  });
});

describe('court schema', () => {
  it('accepts the default court once named', () => {
    const c = { ...defaultCourt('b1', 's1', 'Asia/Kolkata'), name: 'Court 1' };
    expect(courtSchema.safeParse(c).success).toBe(true);
  });
  it('rejects misaligned durations and capacity on whole-court models', () => {
    const c = { ...defaultCourt('b1', 's1', 'UTC'), name: 'Court', minDurationMinutes: 45 };
    expect(courtSchema.safeParse(c).success).toBe(false);
    expect(courtSchema.safeParse({ ...c, minDurationMinutes: 60, capacity: 4 }).success).toBe(false);
  });
});
