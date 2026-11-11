import { DateTime } from 'luxon';
import { formatMoney, formatMinutes, type Ts } from '@courtsync/shared';

export { formatMoney, formatMinutes };

export function fmtDate(date: string): string {
  return DateTime.fromISO(date).toFormat('ccc, d LLL yyyy');
}

export function fmtShortDate(date: string): string {
  return DateTime.fromISO(date).toFormat('d LLL');
}

export function fmtTs(ts: Ts | null | undefined, withTime = true): string {
  if (!ts) return '';
  const dt = DateTime.fromMillis(ts.toMillis());
  return withTime ? dt.toFormat('d LLL yyyy, h:mm a') : dt.toFormat('d LLL yyyy');
}

export function fmtRelative(ts: Ts | null | undefined): string {
  if (!ts) return '';
  return DateTime.fromMillis(ts.toMillis()).toRelative() ?? '';
}

export function timeRange(start: number, end: number): string {
  return `${formatMinutes(start)} – ${formatMinutes(end)}`;
}

export function todayISO(tz?: string): string {
  return (tz ? DateTime.now().setZone(tz) : DateTime.now()).toISODate()!;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
