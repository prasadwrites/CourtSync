import type { BookingRules, CompanySettings, CourtInput, CreditRules, WeeklyHours } from './index';
import { WEEKDAYS } from './enums';

export const DEFAULT_BOOKING_RULES: BookingRules = {
  minAdvanceMinutes: 60,
  maxAdvanceDays: 30,
  cancellationDeadlineHours: 24,
  lateCancellationChargePct: 50,
  refundPolicy: 'Cancellations made before the deadline are refunded in full. Later cancellations are charged the late cancellation fee.',
  requireApproval: true,
  slotHoldMinutes: 30,
  approvalHoldMinutes: 24 * 60,
  maxActiveBookingsPerCustomer: 0,
  requirePrepayment: false,
  depositPct: 100,
};

export const DEFAULT_CREDIT_RULES: CreditRules = {
  enabled: true,
  creditValue: 1,
  minRedeem: 0,
  maxRedeemPerTransaction: 0,
  eligible: { bookings: true, services: true },
  defaultExpiryDays: 365,
};

export function defaultCompanySettings(paymentMethodIds: string[]): CompanySettings {
  return {
    booking: DEFAULT_BOOKING_RULES,
    credits: DEFAULT_CREDIT_RULES,
    notifications: { channels: ['inApp', 'email', 'push'] },
    verification: { requiredTypeIds: [], optionalTypeIds: [], requireBeforeBooking: false },
    paymentMethodIds,
  };
}

export function uniformHours(start: number, end: number): WeeklyHours {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, { sessions: [{ start, end }] }])) as WeeklyHours;
}

export function defaultCourt(branchId: string, sportId: string, timezone: string): CourtInput {
  return {
    branchId,
    sportId,
    name: '',
    description: '',
    photoUrls: [],
    environment: 'indoor',
    status: 'active',
    statusNote: null,
    bookingModel: 'exclusive',
    capacity: 1,
    maxParticipants: 4,
    minDurationMinutes: 60,
    maxDurationMinutes: 180,
    slotIntervalMinutes: 30,
    pricing: { basePrice: 0, sessionPrice: 0, peak: [] },
    sessions: [],
    equipment: [],
    amenities: [],
    operatingHours: uniformHours(6 * 60, 22 * 60),
    timezone,
    cancellationPolicy: '',
    maxAdvanceDays: null,
    publicCalendar: { enabled: false, showPricing: true, showDescription: true },
  };
}

/** Platform feature flags and their defaults. Super Admins toggle them in Platform settings. */
export const FEATURE_FLAGS = {
  phoneSignIn: { label: 'Phone number sign-in', default: true },
  googleSignIn: { label: 'Google sign-in', default: true },
  publicCalendars: { label: 'Public court calendars', default: true },
  memberships: { label: 'Monthly services and memberships', default: true },
  credits: { label: 'Customer credit wallets', default: true },
  identityVerification: { label: 'Customer identity verification', default: true },
  sandboxPayments: { label: 'Sandbox payment provider (never enable in production)', default: false },
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;
