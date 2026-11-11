/**
 * Zod schemas for every Cloud Function input and for the main admin forms.
 * Functions parse their input with these, so the client and server share one contract.
 */
import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  BOOKING_MODELS,
  COMPANY_STATUSES,
  COURT_STATUSES,
  STAFF_ROLES,
  WEEKDAYS,
} from './enums';
import { DATE_RE } from './time';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Invalid id');
const date = z.string().regex(DATE_RE, 'Use YYYY-MM-DD');
const minute = z.number().int().min(0).max(1440);
const money = z.number().min(0).max(10_000_000);
const shortText = z.string().trim().max(200);
const longText = z.string().trim().max(4000);
const email = z.string().trim().toLowerCase().email().max(254);
const phone = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +919876543210');
const weekday = z.enum(WEEKDAYS);

export const timeRangeSchema = z
  .object({ start: minute, end: minute })
  .refine((r) => r.end > r.start, 'End must be after start');

export const weeklyHoursSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((d) => [d, z.object({ sessions: z.array(timeRangeSchema).max(6) })])) as Record<
    (typeof WEEKDAYS)[number],
    z.ZodObject<{ sessions: z.ZodArray<typeof timeRangeSchema> }>
  >,
);

// ----------------------------------------------------------- Super Admin ---

export const countrySchema = z.object({
  name: shortText.min(2),
  code: z.string().trim().toUpperCase().length(2),
  dialCode: z.string().trim().regex(/^\+\d{1,4}$/, 'e.g. +91'),
  currency: z.string().trim().toUpperCase().length(3),
  currencySymbol: z.string().trim().min(1).max(5),
  paymentMethodIds: z.array(id).max(30),
  timezones: z.array(z.string().min(3).max(64)).min(1).max(30),
  businessVerification: z.array(z.object({ label: shortText.min(2), required: z.boolean() })).max(20),
  enabled: z.boolean(),
});

export const sportSchema = z.object({
  name: shortText.min(2),
  description: shortText.optional(),
  icon: z.string().max(40).optional(),
  defaultBookingModel: z.enum(BOOKING_MODELS),
  enabled: z.boolean(),
});

const idField = z.object({ enabled: z.boolean(), required: z.boolean() });
export const identificationTypeSchema = z.object({
  name: shortText.min(2),
  countryCode: z.string().trim().toUpperCase().length(2),
  appliesTo: z.object({ company: z.boolean(), customer: z.boolean() }),
  mandatoryFor: z.object({ company: z.boolean(), customer: z.boolean() }),
  fields: z.object({
    number: idField.extend({ pattern: z.string().max(200).optional(), hint: shortText.optional() }),
    image: idField,
    expiryDate: idField,
    issuingRegion: idField,
  }),
  highlySensitive: z.boolean(),
  enabled: z.boolean(),
});

export const paymentMethodSchema = z.object({
  name: shortText.min(2),
  provider: id,
  kind: z.enum(['online', 'offline']),
  enabled: z.boolean(),
  description: shortText.optional(),
});

export const createCompanySchema = z.object({
  name: shortText.min(2),
  countryCode: z.string().trim().toUpperCase().length(2),
  timezone: z.string().min(3).max(64),
  city: shortText.optional(),
  allowedSportIds: z.array(id).max(100),
  contactEmail: email.optional(),
  contactPhone: phone.optional(),
  admin: z.object({ email, displayName: shortText.min(2) }),
  plan: shortText.default('standard'),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const companyStatusSchema = z.object({
  companyId: id,
  status: z.enum(COMPANY_STATUSES),
  reason: shortText.default(''),
});

export const companyRestrictionsSchema = z.object({
  companyId: id,
  allowedSportIds: z.array(id).max(100).optional(),
  restrictions: z
    .object({
      maxCourts: z.number().int().min(0).nullable().optional(),
      maxBranches: z.number().int().min(0).nullable().optional(),
      bookingsDisabled: z.boolean().optional(),
    })
    .optional(),
  subscription: z
    .object({ plan: shortText, status: z.enum(['trial', 'active', 'pastDue', 'cancelled']) })
    .optional(),
});

export const staffInviteSchema = z.object({
  companyId: id,
  email,
  displayName: shortText.min(2),
  role: z.enum(STAFF_ROLES),
  branchIds: z.array(id).max(50).default([]),
});

export const staffUpdateSchema = z.object({
  companyId: id,
  uid: id,
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  branchIds: z.array(id).max(50).optional(),
  remove: z.boolean().optional(),
});

export const userRefSchema = z.object({ uid: id, companyId: id.optional() });
export const userStatusSchema = z.object({ uid: id, status: z.enum(ACCOUNT_STATUSES), reason: shortText.default('') });
export const superAdminGrantSchema = z.object({ email, enabled: z.boolean() });

export const profileSchema = z.object({
  displayName: shortText.min(1),
  phone: phone.nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
  city: shortText.nullable().optional(),
});

// ------------------------------------------------------- Company setup ---

export const companyProfileSchema = z.object({
  name: shortText.min(2),
  description: longText.optional(),
  city: shortText.optional(),
  timezone: z.string().min(3).max(64),
  contact: z.object({
    email: email.optional().or(z.literal('')),
    phone: phone.optional().or(z.literal('')),
    website: z.string().trim().url().max(300).optional().or(z.literal('')),
  }),
  address: z.object({
    line1: shortText.optional(),
    line2: shortText.optional(),
    city: shortText.optional(),
    region: shortText.optional(),
    postalCode: z.string().max(20).optional(),
  }),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
  socialLinks: z.record(z.string().max(30), z.string().url().max(300)).optional(),
  operatingHoursNote: shortText.optional(),
});

export const branchSchema = z.object({
  name: shortText.min(2),
  timezone: z.string().min(3).max(64),
  address: z
    .object({ line1: shortText.optional(), city: shortText.optional(), region: shortText.optional(), postalCode: z.string().max(20).optional() })
    .optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  phone: z.string().max(20).optional(),
  active: z.boolean(),
});

export const bookingRulesSchema = z.object({
  minAdvanceMinutes: z.number().int().min(0).max(60 * 24 * 30),
  maxAdvanceDays: z.number().int().min(1).max(365),
  cancellationDeadlineHours: z.number().int().min(0).max(24 * 30),
  lateCancellationChargePct: z.number().min(0).max(100),
  refundPolicy: longText,
  requireApproval: z.boolean(),
  slotHoldMinutes: z.number().int().min(5).max(60 * 24 * 7),
  approvalHoldMinutes: z.number().int().min(15).max(60 * 24 * 14),
  maxActiveBookingsPerCustomer: z.number().int().min(0).max(1000),
  requirePrepayment: z.boolean(),
  depositPct: z.number().min(0).max(100),
});

export const creditRulesSchema = z.object({
  enabled: z.boolean(),
  creditValue: z.number().min(0).max(100000),
  minRedeem: z.number().int().min(0),
  maxRedeemPerTransaction: z.number().int().min(0),
  eligible: z.object({ bookings: z.boolean(), services: z.boolean() }),
  defaultExpiryDays: z.number().int().min(1).max(3650).nullable(),
});

const peakWindowSchema = z
  .object({ days: z.array(weekday).min(1), start: minute, end: minute, price: money })
  .refine((p) => p.end > p.start, 'Peak window end must be after start');

const courtSessionSchema = z
  .object({ label: shortText.min(1), start: minute, end: minute, days: z.array(weekday).min(1) })
  .refine((s) => s.end > s.start, 'Session end must be after start');

export const courtSchema = z
  .object({
    branchId: id,
    sportId: id,
    name: shortText.min(2),
    description: longText.optional(),
    photoUrls: z.array(z.string().url()).max(12).default([]),
    environment: z.enum(['indoor', 'outdoor']),
    status: z.enum(COURT_STATUSES),
    statusNote: shortText.nullable().optional(),
    bookingModel: z.enum(BOOKING_MODELS),
    capacity: z.number().int().min(1).max(1000),
    maxParticipants: z.number().int().min(1).max(1000),
    minDurationMinutes: z.number().int().min(5).max(1440),
    maxDurationMinutes: z.number().int().min(5).max(1440),
    slotIntervalMinutes: z.number().int().min(5).max(240),
    pricing: z.object({ basePrice: money, sessionPrice: money, peak: z.array(peakWindowSchema).max(20) }),
    sessions: z.array(courtSessionSchema).max(50),
    equipment: z.array(shortText).max(50),
    amenities: z.array(shortText).max(50),
    operatingHours: weeklyHoursSchema,
    timezone: z.string().min(3).max(64),
    cancellationPolicy: longText.optional(),
    maxAdvanceDays: z.number().int().min(1).max(365).nullable().optional(),
    publicCalendar: z.object({ enabled: z.boolean(), showPricing: z.boolean(), showDescription: z.boolean() }),
  })
  .superRefine((c, ctx) => {
    if (c.maxDurationMinutes < c.minDurationMinutes) {
      ctx.addIssue({ code: 'custom', path: ['maxDurationMinutes'], message: 'Must be at least the minimum duration' });
    }
    if (c.minDurationMinutes % c.slotIntervalMinutes !== 0 || c.maxDurationMinutes % c.slotIntervalMinutes !== 0) {
      ctx.addIssue({ code: 'custom', path: ['slotIntervalMinutes'], message: 'Durations must be multiples of the booking interval' });
    }
    if (c.bookingModel === 'session') {
      if (c.sessions.length === 0) ctx.addIssue({ code: 'custom', path: ['sessions'], message: 'Add at least one session' });
      c.sessions.forEach((s, i) => {
        if (s.start % c.slotIntervalMinutes !== 0 || s.end % c.slotIntervalMinutes !== 0) {
          ctx.addIssue({ code: 'custom', path: ['sessions', i], message: 'Sessions must align to the booking interval' });
        }
      });
    }
    if (c.bookingModel !== 'shared' && c.capacity !== 1) {
      ctx.addIssue({ code: 'custom', path: ['capacity'], message: 'Whole-court models have a capacity of 1' });
    }
  });
export type CourtInput = z.infer<typeof courtSchema>;

export const blockedSlotSchema = z
  .object({
    courtId: id.nullable(),
    branchId: id,
    reason: shortText.min(1),
    kind: z.enum(['oneOff', 'weekly', 'holiday']),
    startDate: date,
    endDate: date.or(z.literal('')),
    startMin: minute.nullable(),
    endMin: minute.nullable(),
    days: z.array(weekday),
  })
  .superRefine((b, ctx) => {
    if ((b.startMin == null) !== (b.endMin == null)) {
      ctx.addIssue({ code: 'custom', path: ['endMin'], message: 'Set both start and end, or neither for a full day' });
    }
    if (b.startMin != null && b.endMin != null && b.endMin <= b.startMin) {
      ctx.addIssue({ code: 'custom', path: ['endMin'], message: 'End must be after start' });
    }
    if (b.endDate && b.endDate < b.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date is before start date' });
    if (b.kind === 'weekly' && b.days.length === 0) ctx.addIssue({ code: 'custom', path: ['days'], message: 'Pick at least one day' });
  });

export const serviceSchema = z.object({
  name: shortText.min(2),
  description: longText.optional(),
  sportId: id.nullable().optional(),
  branchId: id.nullable().optional(),
  price: money,
  durationMonths: z.number().int().min(1).max(36),
  startDate: date.nullable().optional(),
  endDate: date.nullable().optional(),
  sessionsPerPeriod: z.number().int().min(1).max(1000).nullable(),
  weeklyFrequency: z.number().int().min(1).max(14).nullable().optional(),
  sessionDurationMinutes: z.number().int().min(5).max(600).nullable().optional(),
  maxParticipants: z.number().int().min(1).max(10000).nullable().optional(),
  eligibility: longText.optional(),
  renewal: z.enum(['manual', 'auto']),
  cancellationPolicy: longText.optional(),
  active: z.boolean(),
});

// --------------------------------------------------------- Customers ---

export const joinCompanySchema = z.object({ companyId: id });
export const createCustomerSchema = z
  .object({
    companyId: id,
    displayName: shortText.min(2),
    email: email.optional(),
    phone: phone.optional(),
    sendInvite: z.boolean().default(true),
  })
  .refine((v) => v.email || v.phone, 'Provide an email or a phone number');
export const updateCustomerSchema = z.object({
  companyId: id,
  uid: id,
  status: z.enum(ACCOUNT_STATUSES).optional(),
  notes: longText.optional(),
  tags: z.array(shortText).max(20).optional(),
});

// ----------------------------------------------------------- Bookings ---

export const availabilitySchema = z.object({
  companyId: id,
  courtId: id,
  startDate: date,
  endDate: date,
});

export const createBookingSchema = z.object({
  companyId: id,
  courtId: id,
  date,
  startMin: minute,
  endMin: minute,
  participants: z.number().int().min(1).max(1000),
  credits: z.number().int().min(0).default(0),
  paymentMethodId: id.optional(),
  notes: shortText.optional(),
  /** Staff only: book on behalf of a customer. */
  customerUid: id.optional(),
  /** Staff only: skip approval and confirm. */
  confirmNow: z.boolean().optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const decideBookingSchema = z.object({
  companyId: id,
  bookingId: id,
  decision: z.enum(['approve', 'reject']),
  note: shortText.optional(),
});

export const cancelBookingSchema = z.object({ companyId: id, bookingId: id, reason: shortText.default('') });

export const modifyBookingSchema = z.object({
  companyId: id,
  bookingId: id,
  date,
  startMin: minute,
  endMin: minute,
  participants: z.number().int().min(1).max(1000),
  note: shortText.optional(),
});

export const bookingRefSchema = z.object({ companyId: id, bookingId: id, note: shortText.optional() });

// ------------------------------------------------------------ Check-in ---

export const checkInLookupSchema = z
  .object({
    companyId: id,
    token: z.string().min(16).max(128).optional(),
    code: z.string().regex(/^\d{6}$/).optional(),
    bookingId: id.optional(),
  })
  .refine((v) => v.token || v.code || v.bookingId, 'Scan a QR code or enter a booking code');

export const checkInActionSchema = z
  .object({
    companyId: id,
    action: z.enum(['checkIn', 'checkOut']),
    token: z.string().min(16).max(128).optional(),
    code: z.string().regex(/^\d{6}$/).optional(),
    bookingId: id.optional(),
    /** Overrides time, payment and status checks. Requires checkin.override and a reason. */
    override: z.boolean().default(false),
    reason: shortText.optional(),
  })
  .refine((v) => v.token || v.code || v.bookingId, 'Scan a QR code or enter a booking code')
  .refine((v) => !v.override || (v.reason && v.reason.length >= 3), 'Give a reason for the override');

// ------------------------------------------------------------ Payments ---

export const startPaymentSchema = z.object({
  companyId: id,
  purpose: z.enum(['booking', 'subscription']),
  referenceId: id,
  paymentMethodId: id,
});

export const recordPaymentSchema = z.object({
  companyId: id,
  purpose: z.enum(['booking', 'subscription']),
  referenceId: id,
  paymentMethodId: id,
  amount: money.positive(),
  note: shortText.optional(),
});

export const refundSchema = z.object({
  companyId: id,
  paymentId: id,
  amount: money.positive(),
  reason: shortText.min(3),
});

// -------------------------------------------------------- Verification ---

export const submitVerificationSchema = z.object({
  companyId: id,
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
  documents: z
    .array(
      z.object({
        typeId: id,
        number: z.string().trim().min(2).max(64).optional(),
        expiryDate: date.optional(),
        issuingRegion: shortText.optional(),
        imagePath: z.string().max(512).optional(),
      }),
    )
    .min(1)
    .max(5),
});

export const reviewVerificationSchema = z.object({
  companyId: id,
  uid: id,
  decision: z.enum(['verified', 'rejected']),
  reason: shortText.optional(),
});

export const revealIdSchema = z.object({ companyId: id, uid: id, typeId: id, reason: shortText.min(3) });

// ------------------------------------------------------ Memberships ---

export const subscribeSchema = z.object({
  companyId: id,
  serviceId: id,
  startDate: date.optional(),
  credits: z.number().int().min(0).default(0),
  /** Staff only. */
  customerUid: id.optional(),
});

export const subscriptionRefSchema = z.object({ companyId: id, subscriptionId: id, note: shortText.optional() });

// ----------------------------------------------------------- Credits ---

export const adjustCreditsSchema = z
  .object({
    companyId: id,
    uid: id,
    type: z.enum(['award', 'promotion', 'loyalty', 'deduct']),
    amount: z.number().int().positive().max(1_000_000),
    reason: shortText.min(3),
    expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  });
