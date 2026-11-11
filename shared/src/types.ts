/**
 * Firestore document shapes. Both the client and admin SDK Timestamp classes
 * satisfy `Ts`, so these types work on either side.
 */
import type {
  AccountStatus,
  BookingModel,
  BookingStatus,
  CompanyStatus,
  CourtStatus,
  CreditTxnType,
  NotificationChannel,
  PaymentStatus,
  PaymentTxnStatus,
  PaymentTxnType,
  StaffRole,
  SubscriptionStatus,
  VerificationStatus,
  Weekday,
} from './enums';

export interface Ts {
  seconds: number;
  nanoseconds: number;
  toMillis(): number;
  toDate(): Date;
}

export type WithId<T> = T & { id: string };

// ---------------------------------------------------------------- Platform ---

export interface Country {
  name: string;
  /** ISO 3166-1 alpha-2, also used as the document id. */
  code: string;
  dialCode: string;
  currency: string;
  currencySymbol: string;
  /** Ids from the `paymentMethods` collection. */
  paymentMethodIds: string[];
  timezones: string[];
  /** Ids from `identificationTypes` that apply to companies registering here. */
  businessVerification: { label: string; required: boolean }[];
  enabled: boolean;
  createdAt?: Ts;
  updatedAt?: Ts;
}

export interface Sport {
  name: string;
  /** Short description shown in pickers. */
  description?: string;
  icon?: string;
  defaultBookingModel: BookingModel;
  enabled: boolean;
  createdAt?: Ts;
  updatedAt?: Ts;
}

export interface IdFieldRequirement {
  /** Whether the field is collected at all. */
  enabled: boolean;
  required: boolean;
}

export interface IdentificationType {
  name: string;
  countryCode: string;
  /** Whether it can be used to verify companies, customers, or both. */
  appliesTo: { company: boolean; customer: boolean };
  /** Mandatory for the subject type; companies can still choose to request optional ones. */
  mandatoryFor: { company: boolean; customer: boolean };
  fields: {
    number: IdFieldRequirement & { pattern?: string; hint?: string };
    image: IdFieldRequirement;
    expiryDate: IdFieldRequirement;
    issuingRegion: IdFieldRequirement;
  };
  /** Highly sensitive identifiers (SSN, Aadhaar) get extra warnings and are never shown unmasked by default. */
  highlySensitive: boolean;
  enabled: boolean;
  createdAt?: Ts;
  updatedAt?: Ts;
}

export interface PaymentMethod {
  name: string;
  /** Adapter id implemented in functions/src/payments/providers. */
  provider: string;
  /** Online methods go through a gateway; offline ones (cash) are recorded by staff. */
  kind: 'online' | 'offline';
  enabled: boolean;
  description?: string;
}

export interface PlatformSettings {
  /** Feature flags, toggled by the Super Admin. */
  features: Record<string, boolean>;
  supportEmail?: string;
  updatedAt?: Ts;
}

export interface UserProfile {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  countryCode?: string | null;
  city?: string | null;
  status: AccountStatus;
  /** Set by an administrator; the web app forces a password change on next sign-in. */
  mustChangePassword?: boolean;
  platformRole?: 'superAdmin' | null;
  createdAt?: Ts;
  updatedAt?: Ts;
}

export interface AuditLog {
  actorUid: string | null;
  actorEmail?: string | null;
  action: string;
  /** e.g. "company", "user", "booking" */
  targetType: string;
  targetId: string;
  companyId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  at: Ts;
}

// ----------------------------------------------------------------- Company ---

export interface DayHours {
  /** Minutes after local midnight. Several sessions per day are allowed. */
  sessions: { start: number; end: number }[];
}

export type WeeklyHours = Record<Weekday, DayHours>;

export interface Company {
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string;
  countryCode: string;
  currency: string;
  timezone: string;
  city?: string;
  status: CompanyStatus;
  statusReason?: string | null;
  /** Sports the Super Admin allows this company to create courts for. */
  allowedSportIds: string[];
  /** Denormalised from courts for discovery filters. */
  sportIds: string[];
  contact: { email?: string; phone?: string; website?: string };
  address?: { line1?: string; line2?: string; city?: string; region?: string; postalCode?: string };
  location?: { lat: number; lng: number } | null;
  socialLinks?: Record<string, string>;
  photoUrls?: string[];
  operatingHoursNote?: string;
  /** Restrictions set by the Super Admin. */
  restrictions: { maxCourts?: number | null; maxBranches?: number | null; bookingsDisabled?: boolean };
  subscription: { plan: string; status: 'trial' | 'active' | 'pastDue' | 'cancelled'; renewsAt?: Ts | null };
  stats: { courts: number; customers: number; bookings: number; completedBookings: number; branches: number };
  /** Lowercase search tokens built by functions. */
  searchTokens?: string[];
  createdAt?: Ts;
  createdBy?: string;
  updatedAt?: Ts;
}

/** companies/{cid}/private/profile - visible to company staff and Super Admins only. */
export interface CompanyPrivateProfile {
  registration: { legalName?: string; registrationNumber?: string; taxId?: string };
  verification: { label: string; value?: string; provided: boolean }[];
  notes?: string;
  updatedAt?: Ts;
}

export interface StaffMember {
  uid: string;
  role: StaffRole;
  displayName: string;
  email: string;
  status: AccountStatus;
  /** Restricts staff to some branches; empty means all. */
  branchIds: string[];
  createdAt?: Ts;
  createdBy?: string;
}

export interface Branch {
  name: string;
  timezone: string;
  address?: { line1?: string; city?: string; region?: string; postalCode?: string };
  location?: { lat: number; lng: number } | null;
  phone?: string;
  isPrimary: boolean;
  active: boolean;
  createdAt?: Ts;
  updatedAt?: Ts;
}

export interface CompanySettings {
  booking: BookingRules;
  credits: CreditRules;
  notifications: { channels: NotificationChannel[] };
  /** Identification types this company asks customers for. */
  verification: { requiredTypeIds: string[]; optionalTypeIds: string[]; requireBeforeBooking: boolean };
  /** Payment method ids enabled for this company (subset of the country's). */
  paymentMethodIds: string[];
  updatedAt?: Ts;
}

export interface BookingRules {
  /** Minimum minutes between now and the start of a booking. */
  minAdvanceMinutes: number;
  /** Maximum days ahead a customer can book. */
  maxAdvanceDays: number;
  cancellationDeadlineHours: number;
  /** Percentage of the booking price charged when cancelled after the deadline. */
  lateCancellationChargePct: number;
  refundPolicy: string;
  requireApproval: boolean;
  /** How long an unpaid booking holds its slot while the customer pays online. */
  slotHoldMinutes: number;
  /** How long a request waiting for approval holds its slot. Never past the booking's start. */
  approvalHoldMinutes: number;
  /** Max active future bookings per customer; 0 means unlimited. */
  maxActiveBookingsPerCustomer: number;
  /** Requires online payment before a booking is confirmed. */
  requirePrepayment: boolean;
  /** Deposit percentage taken online when prepayment is required. 100 means full payment. */
  depositPct: number;
}

export interface CreditRules {
  enabled: boolean;
  /** Currency value of one credit. */
  creditValue: number;
  minRedeem: number;
  maxRedeemPerTransaction: number;
  eligible: { bookings: boolean; services: boolean };
  defaultExpiryDays: number | null;
}

// ------------------------------------------------------------------ Courts ---

export interface PeakWindow {
  days: Weekday[];
  start: number;
  end: number;
  /** Replaces the base hourly or per-participant price inside the window. */
  price: number;
}

export interface CourtSession {
  label: string;
  start: number;
  end: number;
  days: Weekday[];
}

export interface Court {
  branchId: string;
  sportId: string;
  name: string;
  description?: string;
  photoUrls: string[];
  environment: 'indoor' | 'outdoor';
  status: CourtStatus;
  statusNote?: string | null;
  bookingModel: BookingModel;
  /** For shared courts: participants that can book at the same time. */
  capacity: number;
  maxParticipants: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  /** Booking grid granularity. Start times align to it. */
  slotIntervalMinutes: number;
  pricing: {
    /** exclusive: per hour; shared: per participant per hour; session: ignored. */
    basePrice: number;
    /** session model price; also an alternative flat price for exclusive courts when > 0. */
    sessionPrice: number;
    peak: PeakWindow[];
  };
  sessions: CourtSession[];
  equipment: string[];
  amenities: string[];
  operatingHours: WeeklyHours;
  timezone: string;
  cancellationPolicy?: string;
  /** Overrides company rule when set. */
  maxAdvanceDays?: number | null;
  publicCalendar: { enabled: boolean; showPricing: boolean; showDescription: boolean };
  createdAt?: Ts;
  updatedAt?: Ts;
}

/**
 * companies/{cid}/blockedSlots. Applies to one court or, with courtId null, the whole branch.
 * Either a one-off date range or a weekly recurrence.
 */
export interface BlockedSlot {
  courtId: string | null;
  branchId: string;
  reason: string;
  kind: 'oneOff' | 'weekly' | 'holiday';
  /** oneOff and holiday: inclusive local dates. */
  startDate: string;
  endDate: string;
  /** Minutes after midnight. null start and end block the whole day. */
  startMin: number | null;
  endMin: number | null;
  /** weekly recurrences only. */
  days: Weekday[];
  createdBy?: string;
  createdAt?: Ts;
}

/** companies/{cid}/courts/{courtId}/slotLocks/{date_startMin}. Written only by functions. */
export interface SlotLock {
  date: string;
  startMin: number;
  capacity: number;
  holds: Record<string, { units: number; expiresAt: Ts | null }>;
}

// ---------------------------------------------------------------- Bookings ---

export interface BookingPricing {
  currency: string;
  subtotal: number;
  discount: number;
  creditsApplied: number;
  creditValue: number;
  total: number;
  lines: { label: string; amount: number }[];
}

export interface StatusChange {
  status: BookingStatus;
  at: Ts;
  by: string | null;
  note?: string;
}

export interface Booking {
  companyId: string;
  branchId: string;
  courtId: string;
  courtName: string;
  sportId: string;
  customerUid: string;
  customerName: string;
  customerContact?: string | null;
  date: string;
  startMin: number;
  endMin: number;
  timezone: string;
  startAt: Ts;
  endAt: Ts;
  participants: number;
  status: BookingStatus;
  pricing: BookingPricing;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountRefunded: number;
  paymentMethodId?: string | null;
  holdExpiresAt?: Ts | null;
  /** Random token encoded in the QR code. Never contains personal data. */
  checkInToken: string;
  /** 6-digit fallback code, unique per company and date. */
  verificationCode: string;
  checkIn?: { at: Ts; by: string; manual: boolean; lateMinutes: number } | null;
  checkOut?: { at: Ts; by: string; manual: boolean; durationMinutes: number; earlyMinutes: number; overstayMinutes: number } | null;
  source: 'customer' | 'staff';
  notes?: string;
  history: StatusChange[];
  /** Lock cells this booking holds, so they can be released even if the court's grid changes. */
  lockCells: number[];
  /** Credit lots consumed, restored on cancellation or rejection. */
  creditLots: { id: string; take: number }[];
  cancellation?: { at: Ts; by: string; reason: string; late: boolean; charge: number } | null;
  createdAt: Ts;
  updatedAt: Ts;
}

// ---------------------------------------------------------------- Customers ---

/** companies/{cid}/customers/{uid} - the per-company relationship for a universal account. */
export interface CompanyCustomer {
  uid: string;
  companyId: string;
  companyName: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  status: AccountStatus;
  verificationStatus: VerificationStatus;
  creditBalance: number;
  bookingsCount: number;
  joinedAt?: Ts;
  joinedVia: 'self' | 'invite' | 'staff';
  notes?: string;
  tags?: string[];
}

export interface Invitation {
  companyId: string;
  companyName: string;
  email?: string | null;
  phone?: string | null;
  displayName?: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdBy: string;
  createdAt?: Ts;
}

// ----------------------------------------------------------- Verification ---

export interface VerificationDocumentSummary {
  typeId: string;
  typeName: string;
  /** e.g. "XXXX-XXXX-1234". The full number is encrypted in the secure subcollection. */
  numberMasked?: string | null;
  expiryDate?: string | null;
  issuingRegion?: string | null;
  imagePath?: string | null;
}

export interface Verification {
  uid: string;
  companyId: string;
  status: VerificationStatus;
  documents: VerificationDocumentSummary[];
  consentAt?: Ts | null;
  submittedAt?: Ts | null;
  reviewedAt?: Ts | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  /** Earliest document expiry, used to expire verifications. */
  expiresOn?: string | null;
}

// ------------------------------------------------------------------ Money ----

export interface PaymentTransaction {
  type: PaymentTxnType;
  status: PaymentTxnStatus;
  companyId: string;
  customerUid: string;
  /** What it pays for. */
  purpose: 'booking' | 'subscription';
  referenceId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  provider: string;
  providerRef?: string | null;
  providerPaymentRef?: string | null;
  /** Denormalised for revenue reports. */
  courtId?: string | null;
  sportId?: string | null;
  /** Refunds point at the charge they refund. */
  parentPaymentId?: string | null;
  /** Data the client needs to complete a gateway checkout (never secrets). */
  checkout?: Record<string, unknown> | null;
  recordedBy?: string | null;
  note?: string | null;
  failureReason?: string | null;
  createdAt: Ts;
  updatedAt: Ts;
}

export interface CreditLot {
  amount: number;
  remaining: number;
  expiresAt: Ts | null;
  createdAt: Ts;
}

export interface CreditTransaction {
  uid: string;
  companyId: string;
  type: CreditTxnType;
  /** Positive for additions, negative for deductions. */
  amount: number;
  balanceAfter: number;
  reason: string;
  referenceId?: string | null;
  expiresAt?: Ts | null;
  by: string | null;
  at: Ts;
}

// ------------------------------------------------------------ Memberships ---

export interface Service {
  name: string;
  description?: string;
  sportId?: string | null;
  branchId?: string | null;
  price: number;
  /** Billing period in months. */
  durationMonths: number;
  startDate?: string | null;
  endDate?: string | null;
  sessionsPerPeriod: number | null;
  weeklyFrequency?: number | null;
  sessionDurationMinutes?: number | null;
  maxParticipants?: number | null;
  eligibility?: string;
  renewal: 'manual' | 'auto';
  cancellationPolicy?: string;
  active: boolean;
  enrolled: number;
  createdAt?: Ts;
  updatedAt?: Ts;
}

export interface Subscription {
  serviceId: string;
  serviceName: string;
  companyId: string;
  customerUid: string;
  customerName: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  price: number;
  currency: string;
  sessionsTotal: number | null;
  sessionsUsed: number;
  paymentStatus: PaymentStatus;
  autoRenew: boolean;
  attendance: { at: Ts; by: string }[];
  createdAt: Ts;
  updatedAt: Ts;
}

// ---------------------------------------------------------- Notifications ---

export interface AppNotification {
  title: string;
  body: string;
  type: string;
  link?: string | null;
  companyId?: string | null;
  read: boolean;
  createdAt: Ts;
}

// --------------------------------------------------------------- Reporting ---

export interface DailyStats {
  date: string;
  bookings: number;
  completed: number;
  cancelled: number;
  noShows: number;
  revenue: number;
  refunds: number;
  newCustomers: number;
  creditsIssued: number;
  creditsRedeemed: number;
  newSubscriptions: number;
  bookedMinutes: number;
  byCourt: Record<string, { bookings: number; revenue: number; minutes: number }>;
  bySport: Record<string, { bookings: number; revenue: number }>;
  byHour: Record<string, number>;
  byMethod: Record<string, number>;
  byCustomer: Record<string, number>;
}

export interface PlatformStats {
  companies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  users: number;
  branches: number;
  courts: number;
  bookings: number;
  completedBookings: number;
  pendingBookings: number;
  revenueByCurrency: Record<string, number>;
  updatedAt?: Ts;
}
