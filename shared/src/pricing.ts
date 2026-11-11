import type { BookingPricing, Court, CreditRules } from './types';
import { weekdayOf, formatMinutes } from './time';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Hourly (or per-participant hourly) rate in effect for a minute on a date. */
export function rateAt(court: Pick<Court, 'pricing'>, date: string, minute: number): { rate: number; peak: boolean } {
  const wd = weekdayOf(date);
  const peak = court.pricing.peak?.find((p) => p.days.includes(wd) && minute >= p.start && minute < p.end);
  return peak ? { rate: peak.price, peak: true } : { rate: court.pricing.basePrice, peak: false };
}

/** Price before discounts and credits. */
export function computeSubtotal(
  court: Pick<Court, 'pricing' | 'bookingModel' | 'slotIntervalMinutes'>,
  date: string,
  startMin: number,
  endMin: number,
  participants: number,
): { subtotal: number; lines: { label: string; amount: number }[] } {
  if (court.bookingModel === 'session') {
    const amount = round2(court.pricing.sessionPrice);
    return { subtotal: amount, lines: [{ label: `Session ${formatMinutes(startMin)} to ${formatMinutes(endMin)}`, amount }] };
  }
  const step = Math.max(5, court.slotIntervalMinutes);
  let regular = 0;
  let peak = 0;
  for (let t = startMin; t < endMin; t += step) {
    const span = Math.min(step, endMin - t);
    const r = rateAt(court, date, t);
    const amount = (r.rate * span) / 60;
    if (r.peak) peak += amount;
    else regular += amount;
  }
  const mult = court.bookingModel === 'shared' ? Math.max(1, participants) : 1;
  const lines: { label: string; amount: number }[] = [];
  const suffix = mult > 1 ? ` x ${mult} participants` : '';
  if (regular > 0) lines.push({ label: `Standard time${suffix}`, amount: round2(regular * mult) });
  if (peak > 0) lines.push({ label: `Peak time${suffix}`, amount: round2(peak * mult) });
  return { subtotal: round2((regular + peak) * mult), lines };
}

export type CreditCheck =
  | { ok: true; credits: number; value: number }
  | { ok: false; message: string };

/** Validates a credit redemption request against company rules and the payable amount. */
export function checkCreditRedemption(
  requested: number,
  balance: number,
  payable: number,
  rules: CreditRules,
  purpose: 'bookings' | 'services',
): CreditCheck {
  if (!requested) return { ok: true, credits: 0, value: 0 };
  if (!rules.enabled) return { ok: false, message: 'Credits are not enabled for this company.' };
  if (!rules.eligible[purpose]) return { ok: false, message: `Credits can't be used for ${purpose}.` };
  if (!Number.isInteger(requested) || requested < 0) return { ok: false, message: 'Credits must be a whole number.' };
  if (requested > balance) return { ok: false, message: 'Not enough credits.' };
  if (rules.minRedeem && requested < rules.minRedeem) {
    return { ok: false, message: `Redeem at least ${rules.minRedeem} credits.` };
  }
  if (rules.maxRedeemPerTransaction && requested > rules.maxRedeemPerTransaction) {
    return { ok: false, message: `Redeem at most ${rules.maxRedeemPerTransaction} credits per transaction.` };
  }
  const value = round2(requested * rules.creditValue);
  if (value > payable + 0.0001) return { ok: false, message: 'Credits exceed the amount payable.' };
  return { ok: true, credits: requested, value };
}

export function buildPricing(
  currency: string,
  subtotal: number,
  lines: { label: string; amount: number }[],
  credits: { credits: number; value: number },
  creditValue: number,
): BookingPricing {
  const total = round2(Math.max(0, subtotal - credits.value));
  const all = [...lines];
  if (credits.credits > 0) all.push({ label: `${credits.credits} credits`, amount: -credits.value });
  return { currency, subtotal, discount: 0, creditsApplied: credits.credits, creditValue, total, lines: all };
}

export interface LotLike {
  id: string;
  remaining: number;
  expiresAtMs: number | null;
}

/** Consumes credits from lots that expire soonest first. Returns the per-lot deductions. */
export function consumeLots(lots: LotLike[], amount: number, nowMs: number): { id: string; take: number }[] {
  const usable = lots
    .filter((l) => l.remaining > 0 && (l.expiresAtMs === null || l.expiresAtMs > nowMs))
    .sort((a, b) => (a.expiresAtMs ?? Infinity) - (b.expiresAtMs ?? Infinity));
  const out: { id: string; take: number }[] = [];
  let left = amount;
  for (const lot of usable) {
    if (left <= 0) break;
    const take = Math.min(lot.remaining, left);
    out.push({ id: lot.id, take });
    left -= take;
  }
  if (left > 0) throw new Error('Insufficient credits');
  return out;
}

export function formatMoney(amount: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
