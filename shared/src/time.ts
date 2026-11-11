import { DateTime } from 'luxon';
import { WEEKDAYS, type Weekday } from './enums';

/** Calendar dates are stored as local "YYYY-MM-DD" strings in the court's time zone. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

export function weekdayOf(date: string): Weekday {
  const dt = DateTime.fromISO(date, { zone: 'UTC' });
  if (!dt.isValid) throw new Error(`Invalid date ${date}`);
  return WEEKDAYS[dt.weekday - 1];
}

/** Converts a local date and minutes-after-midnight in `tz` to an absolute instant. */
export function localToInstant(date: string, minutes: number, tz: string): Date {
  const dt = DateTime.fromISO(date, { zone: tz }).startOf('day').plus({ minutes });
  if (!dt.isValid) throw new Error(`Invalid date/time ${date} ${minutes} ${tz}`);
  return dt.toJSDate();
}

export function todayIn(tz: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(tz).toISODate()!;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'UTC' }).plus({ days }).toISODate()!;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    DateTime.fromISO(to, { zone: 'UTC' }).diff(DateTime.fromISO(from, { zone: 'UTC' }), 'days').days,
  );
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 && h < 24 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

/** "06:30" -> 390 */
export function parseHHMM(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid time ${value}`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) throw new Error(`Invalid time ${value}`);
  return h * 60 + m;
}

/** 390 -> "06:30" */
export function toHHMM(min: number): string {
  return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`;
}

export function monthRange(date: string): { start: string; end: string } {
  const dt = DateTime.fromISO(date, { zone: 'UTC' });
  return { start: dt.startOf('month').toISODate()!, end: dt.endOf('month').toISODate()! };
}

export function weekRange(date: string): { start: string; end: string } {
  const dt = DateTime.fromISO(date, { zone: 'UTC' });
  return { start: dt.startOf('week').toISODate()!, end: dt.endOf('week').toISODate()! };
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
