/**
 * Status and role enumerations shared by the web app, Cloud Functions and tests.
 * Values are persisted in Firestore, so never rename an existing value.
 */

export const COMPANY_STATUSES = ['active', 'inactive', 'suspended', 'disabled'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

/** Roles a person can hold inside one company. Ordered from most to least privileged. */
export const STAFF_ROLES = ['owner', 'admin', 'manager', 'frontDesk'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const BOOKING_STATUSES = [
  'pendingApproval',
  'approved',
  'rejected',
  'paymentPending',
  'confirmed',
  'checkedIn',
  'checkedOut',
  'completed',
  'cancelled',
  'noShow',
  'expired',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that hold court capacity. Anything else releases its slot locks. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'pendingApproval',
  'approved',
  'paymentPending',
  'confirmed',
  'checkedIn',
];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pendingApproval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  paymentPending: 'Payment pending',
  confirmed: 'Confirmed',
  checkedIn: 'Checked in',
  checkedOut: 'Checked out',
  completed: 'Completed',
  cancelled: 'Cancelled',
  noShow: 'No show',
  expired: 'Expired',
};

export const PAYMENT_STATUSES = ['unpaid', 'partiallyPaid', 'paid', 'refunded', 'partiallyRefunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const VERIFICATION_STATUSES = ['notSubmitted', 'pending', 'verified', 'rejected', 'expired'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * Booking models drive the configurable booking engine.
 * - exclusive: one booking takes the whole court for its time range (badminton, turf, tennis).
 * - session: fixed sessions defined on the court; one booking takes the whole court for a session (cricket nets, grounds).
 * - shared: many bookings share the court up to its capacity, priced per participant (swimming lanes, skating).
 */
export const BOOKING_MODELS = ['exclusive', 'session', 'shared'] as const;
export type BookingModel = (typeof BOOKING_MODELS)[number];

export const BOOKING_MODEL_LABELS: Record<BookingModel, string> = {
  exclusive: 'Whole court, by time (per hour)',
  session: 'Whole court, fixed sessions',
  shared: 'Shared capacity, per participant',
};

export const COURT_STATUSES = ['active', 'inactive', 'temporarilyClosed'] as const;
export type CourtStatus = (typeof COURT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['pendingPayment', 'active', 'expired', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const CREDIT_TXN_TYPES = ['award', 'promotion', 'loyalty', 'deduct', 'redeem', 'refund', 'expire'] as const;
export type CreditTxnType = (typeof CREDIT_TXN_TYPES)[number];

export const PAYMENT_TXN_TYPES = ['charge', 'refund'] as const;
export type PaymentTxnType = (typeof PAYMENT_TXN_TYPES)[number];

export const PAYMENT_TXN_STATUSES = ['created', 'pending', 'succeeded', 'failed', 'cancelled'] as const;
export type PaymentTxnStatus = (typeof PAYMENT_TXN_STATUSES)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const NOTIFICATION_CHANNELS = ['inApp', 'email', 'push', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
