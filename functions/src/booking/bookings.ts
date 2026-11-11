/**
 * Booking lifecycle. All availability checks and slot locking happen inside Firestore
 * transactions, so two requests for the same slot can never both succeed.
 */
import type { Transaction } from 'firebase-admin/firestore';
import {
  availabilitySchema,
  createBookingSchema,
  decideBookingSchema,
  cancelBookingSchema,
  modifyBookingSchema,
  bookingRefSchema,
  checkBookingRequest,
  computeSlots,
  computeSubtotal,
  checkCreditRedemption,
  buildPricing,
  gridStarts,
  lockCapacity,
  localToInstant,
  eachDate,
  daysBetween,
  formatMinutes,
  round2,
  ACTIVE_BOOKING_STATUSES,
  type Booking,
  type BookingStatus,
  type BlockedSlot,
  type Court,
  type CompanyCustomer,
  type CompanySettings,
  type PaymentMethod,
  type SlotLock,
  type UserProfile,
} from '@courtsync/shared';
import { callable, type Caller } from '../lib/callable';
import { db, FieldValue, Timestamp } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, loadCompany, loadSettings, requireStaff, assertBranchAccess, assertCompanyOpen } from '../lib/authz';
import { checkInToken, sixDigitCode } from '../lib/tokens';
import { readLocks, writeHold, releaseHold } from './locks';
import { planRedemption, applyRedemption, restoreCredits } from '../credits/ledger';
import { notifyCompany, notifyUser } from '../notifications/notify';
import { joinCompanyInternal } from '../company/customers';
import { refundBookingPayments } from '../payments/refunds';

type CourtWithId = Court & { id: string };

async function loadCourt(cid: string, courtId: string, tx?: Transaction): Promise<CourtWithId> {
  const ref = refs.court(cid, courtId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw fail.notFound('Court');
  return { ...(snap.data() as Court), id: snap.id };
}

async function loadBlocks(cid: string, branchId: string, tx?: Transaction): Promise<BlockedSlot[]> {
  const q = refs.company(cid).collection('blockedSlots').where('branchId', '==', branchId).limit(1000);
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs.map((d) => d.data() as BlockedSlot);
}

async function paymentMethod(id: string | null | undefined): Promise<PaymentMethod | null> {
  if (!id) return null;
  const snap = await db.collection('paymentMethods').doc(id).get();
  return snap.exists ? (snap.data() as PaymentMethod) : null;
}

function engineRules(settings: CompanySettings, isStaff: boolean) {
  // Staff can book at short notice and further ahead than customers.
  return isStaff
    ? { minAdvanceMinutes: 0, maxAdvanceDays: 365 }
    : { minAdvanceMinutes: settings.booking.minAdvanceMinutes, maxAdvanceDays: settings.booking.maxAdvanceDays };
}

function historyEntry(status: BookingStatus, by: string | null, note?: string) {
  return { status, at: Timestamp.now(), by, ...(note ? { note } : {}) };
}

/** Resolves how a new booking enters the lifecycle. */
function initialStatus(opts: { staffConfirm: boolean; total: number; settings: CompanySettings }): {
  status: BookingStatus;
  holdMinutes: number | null;
} {
  if (opts.staffConfirm) return { status: 'confirmed', holdMinutes: null };
  if (opts.total > 0 && opts.settings.booking.requirePrepayment) return { status: 'paymentPending', holdMinutes: opts.settings.booking.slotHoldMinutes };
  if (opts.settings.booking.requireApproval) return { status: 'pendingApproval', holdMinutes: opts.settings.booking.approvalHoldMinutes };
  return { status: 'confirmed', holdMinutes: null };
}

/** Hold expiry never runs past the booking start. */
function holdExpiry(holdMinutes: number | null, startAt: Date): Timestamp | null {
  if (holdMinutes == null) return null;
  return Timestamp.fromMillis(Math.min(Date.now() + holdMinutes * 60_000, startAt.getTime()));
}

// -------------------------------------------------------------- availability

export const getAvailability = callable(
  'getAvailability',
  availabilitySchema,
  async ({ companyId, courtId, startDate, endDate }, caller) => {
    if (endDate < startDate || daysBetween(startDate, endDate) > 41) throw fail.invalid('Choose a range of at most six weeks.');
    const company = await loadCompany(companyId);
    const court = await loadCourt(companyId, courtId);
    let isStaff = caller.superAdmin;
    if (caller.uid && !isStaff) {
      const staff = await refs.staff(companyId, caller.uid).get();
      isStaff = staff.exists && staff.get('status') === 'active';
    }
    if (!isStaff) {
      if (company.status !== 'active') throw fail.precondition('This facility is not available.');
      if (!caller.uid && !court.publicCalendar?.enabled) throw fail.unauthenticated('Sign in to see this calendar.');
      if (court.status === 'inactive') throw fail.notFound('Court');
    }
    const settings = await loadSettings(companyId);
    const [blocks, lockSnap] = await Promise.all([
      loadBlocks(companyId, court.branchId),
      refs.court(companyId, courtId).collection('slotLocks').where('date', '>=', startDate).where('date', '<=', endDate).get(),
    ]);
    const locks = lockSnap.docs.map((d) => d.data() as SlotLock);
    const ctx = { court, blocks, locks, now: new Date(), rules: engineRules(settings, isStaff) };
    const showPricing = !!caller.uid || court.publicCalendar?.showPricing;
    const days = eachDate(startDate, endDate).map((date) => ({
      date,
      slots: computeSlots(ctx, date).map((s) => ({
        ...s,
        price: showPricing ? computeSubtotal(court, date, s.startMin, s.endMin, 1).subtotal : undefined,
      })),
    }));
    const sport = (await db.collection('sports').doc(court.sportId).get()).data();
    return {
      company: { id: companyId, name: company.name, logoUrl: company.logoUrl ?? null, currency: company.currency, city: company.city ?? '' },
      court: {
        id: court.id,
        name: court.name,
        sportName: sport?.name ?? '',
        description: caller.uid || court.publicCalendar?.showDescription ? court.description ?? '' : '',
        photoUrls: caller.uid || court.publicCalendar?.showDescription ? court.photoUrls ?? [] : [],
        environment: court.environment,
        bookingModel: court.bookingModel,
        timezone: court.timezone,
        slotIntervalMinutes: court.slotIntervalMinutes,
        minDurationMinutes: court.minDurationMinutes,
        maxDurationMinutes: court.maxDurationMinutes,
        maxParticipants: court.maxParticipants,
        capacity: court.capacity,
        pricing: showPricing ? court.pricing : null,
        amenities: court.amenities ?? [],
        equipment: court.equipment ?? [],
        cancellationPolicy: court.cancellationPolicy ?? '',
        status: court.status,
      },
      rules: {
        requireApproval: settings.booking.requireApproval,
        requirePrepayment: settings.booking.requirePrepayment,
        cancellationDeadlineHours: settings.booking.cancellationDeadlineHours,
        refundPolicy: settings.booking.refundPolicy,
      },
      days,
    };
  },
  { allowAnonymous: true, rateLimit: 120 },
);

// ------------------------------------------------------------------- create

export const createBooking = callable(
  'createBooking',
  createBookingSchema,
  async (input, caller) => {
    const { companyId } = input;
    const company = await loadCompany(companyId);
    const onBehalf = !!input.customerUid && input.customerUid !== caller.uid;
    let staffCtx = null;
    if (onBehalf || input.confirmNow) {
      staffCtx = await requireStaff(caller, companyId, 'bookings.create');
    }
    assertCompanyOpen(company);
    if (company.restrictions?.bookingsDisabled) throw fail.precondition('Bookings are paused for this facility.');
    const customerUid = input.customerUid ?? caller.uid;

    // Customers are linked to a company the first time they book there.
    if (!onBehalf) {
      const profile = await refs.user(caller.uid).get();
      if (!profile.exists) throw fail.precondition('Finish setting up your profile first.');
      await joinCompanyInternal(companyId, caller.uid, 'self');
    }

    const method = await paymentMethod(input.paymentMethodId);
    const bookingRef = refs.company(companyId).collection('bookings').doc();

    const result = await db.runTransaction(async (tx) => {
      // ---- reads
      const court = await loadCourt(companyId, input.courtId, tx);
      if (staffCtx) assertBranchAccess(staffCtx, court.branchId);
      if (!company.allowedSportIds.includes(court.sportId)) throw fail.precondition('This court is not available for booking.');
      const settings = await loadSettings(companyId, tx);
      const customerSnap = await tx.get(refs.customer(companyId, customerUid));
      if (!customerSnap.exists) throw fail.precondition('That person is not a customer of this company yet.');
      const customer = customerSnap.data() as CompanyCustomer;
      if (customer.status !== 'active') throw fail.denied('This customer account is not active at this facility.');
      const profile = (await tx.get(refs.user(customerUid))).data() as UserProfile | undefined;
      if (
        !staffCtx &&
        settings.verification.requireBeforeBooking &&
        customer.verificationStatus !== 'verified'
      ) {
        throw fail.precondition('This facility asks you to verify your identity before booking.');
      }
      if (input.paymentMethodId && !settings.paymentMethodIds.includes(input.paymentMethodId)) {
        throw fail.invalid('That payment method is not accepted here.');
      }
      if (input.paymentMethodId && (!method || !method.enabled)) throw fail.invalid('That payment method is unavailable.');

      const blocks = await loadBlocks(companyId, court.branchId, tx);
      const cells = gridStarts(court, input.startMin, input.endMin);
      const locks = await readLocks(tx, companyId, court.id, input.date, cells);
      const check = checkBookingRequest(
        { court, blocks, locks, now: new Date(), rules: engineRules(settings, !!staffCtx) },
        { date: input.date, startMin: input.startMin, endMin: input.endMin, participants: input.participants },
      );
      if (!check.ok) throw fail.conflict(check.message, { code: check.code });

      if (!staffCtx && settings.booking.maxActiveBookingsPerCustomer > 0) {
        const active = await tx.get(
          refs.company(companyId).collection('bookings')
            .where('customerUid', '==', customerUid)
            .where('status', 'in', [...ACTIVE_BOOKING_STATUSES])
            .where('startAt', '>=', Timestamp.now())
            .limit(settings.booking.maxActiveBookingsPerCustomer),
        );
        if (active.size >= settings.booking.maxActiveBookingsPerCustomer) {
          throw fail.precondition(`You can have at most ${settings.booking.maxActiveBookingsPerCustomer} upcoming bookings here.`);
        }
      }

      const { subtotal, lines } = computeSubtotal(court, input.date, input.startMin, input.endMin, input.participants);
      const credit = checkCreditRedemption(input.credits, customer.creditBalance ?? 0, subtotal, settings.credits, 'bookings');
      if (!credit.ok) throw fail.invalid(credit.message);
      const plan = await planRedemption(tx, companyId, customerUid, credit.credits, customer.creditBalance ?? 0);

      // ---- writes
      const pricing = buildPricing(company.currency, subtotal, lines, credit, settings.credits.creditValue);
      const startAt = localToInstant(input.date, input.startMin, court.timezone);
      const endAt = localToInstant(input.date, input.endMin, court.timezone);
      const confirmNow = !!staffCtx && input.confirmNow !== false;
      const { status, holdMinutes } = initialStatus({ staffConfirm: confirmNow, total: pricing.total, settings });
      const expiresAt = holdExpiry(holdMinutes, startAt);
      writeHold(tx, companyId, court.id, input.date, check.cells, check.capacity, bookingRef.id, check.units, expiresAt);
      applyRedemption(tx, plan, `Booking ${court.name} ${input.date}`, bookingRef.id, caller.uid);

      const booking: Omit<Booking, 'createdAt' | 'updatedAt' | 'startAt' | 'endAt'> & Record<string, unknown> = {
        companyId,
        branchId: court.branchId,
        courtId: court.id,
        courtName: court.name,
        sportId: court.sportId,
        customerUid,
        customerName: profile?.displayName ?? customer.displayName,
        customerContact: profile?.phone ?? profile?.email ?? null,
        date: input.date,
        startMin: input.startMin,
        endMin: input.endMin,
        timezone: court.timezone,
        startAt: Timestamp.fromDate(startAt),
        endAt: Timestamp.fromDate(endAt),
        participants: input.participants,
        status,
        pricing,
        paymentStatus: pricing.total === 0 ? 'paid' : 'unpaid',
        amountPaid: 0,
        amountRefunded: 0,
        paymentMethodId: input.paymentMethodId ?? null,
        holdExpiresAt: expiresAt,
        checkInToken: checkInToken(),
        verificationCode: sixDigitCode(),
        checkIn: null,
        checkOut: null,
        source: staffCtx ? 'staff' : 'customer',
        notes: input.notes ?? '',
        history: [historyEntry(status, caller.uid)],
        lockCells: check.cells,
        creditLots: plan.takes,
        cancellation: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(bookingRef, booking);
      tx.update(refs.customer(companyId, customerUid), { bookingsCount: FieldValue.increment(1) });
      tx.update(refs.company(companyId), { 'stats.bookings': FieldValue.increment(1) });
      return { status, court, pricing };
    });

    const when = `${input.date} ${formatMinutes(input.startMin)}`;
    if (result.status === 'pendingApproval') {
      await notifyCompany(companyId, { title: 'New booking request', body: `${result.court.name}, ${when}`, type: 'booking.requested', link: `/manage/${companyId}/bookings/${bookingRef.id}`, companyId }, ['owner', 'admin', 'manager', 'frontDesk']);
    } else if (result.status === 'confirmed' && !staffCtx) {
      await notifyCompany(companyId, { title: 'New booking', body: `${result.court.name}, ${when}`, type: 'booking.confirmed', link: `/manage/${companyId}/bookings/${bookingRef.id}`, companyId }, ['owner', 'admin', 'manager', 'frontDesk']);
    }
    const customerMsg: Partial<Record<BookingStatus, string>> = {
      pendingApproval: `Your request for ${result.court.name} on ${when} was sent to ${company.name} for approval.`,
      paymentPending: `Complete payment to secure ${result.court.name} on ${when}.`,
      confirmed: `${result.court.name} on ${when} is confirmed.`,
    };
    await notifyUser(customerUid, { title: 'Booking submitted', body: customerMsg[result.status] ?? '', type: 'booking.submitted', link: `/bookings/${companyId}/${bookingRef.id}`, companyId });
    return { bookingId: bookingRef.id, status: result.status, pricing: result.pricing };
  },
  { rateLimit: 20 },
);

// ------------------------------------------------------------------- decide

export const decideBooking = callable('decideBooking', decideBookingSchema, async ({ companyId, bookingId, decision, note }, caller) => {
  const ctx = await requireStaff(caller, companyId, 'bookings.approve');
  const ref = refs.booking(companyId, bookingId);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw fail.notFound('Booking');
    const b = snap.data() as Booking;
    assertBranchAccess(ctx, b.branchId);
    if (b.status !== 'pendingApproval') throw fail.precondition(`This booking is ${b.status}, not waiting for approval.`);
    if (decision === 'approve') {
      const court = await loadCourt(companyId, b.courtId, tx);
      const blocks = await loadBlocks(companyId, court.branchId, tx);
      const locks = await readLocks(tx, companyId, b.courtId, b.date, b.lockCells);
      // Re-check without our own hold: it may have expired and been taken by someone else.
      const check = checkBookingRequest(
        { court, blocks, locks, now: new Date(0), rules: { minAdvanceMinutes: 0, maxAdvanceDays: 100000 } },
        { date: b.date, startMin: b.startMin, endMin: b.endMin, participants: b.participants, ignoreHoldId: bookingId },
      );
      const realConflict = !check.ok && ['conflict', 'blocked'].includes(check.code);
      if (realConflict) throw fail.conflict('That time is no longer free. Reject the request or move it to another slot.');
      const method = await paymentMethod(b.paymentMethodId);
      const status: BookingStatus = b.paymentStatus === 'paid' || b.paymentStatus === 'partiallyPaid' || method?.kind !== 'online' ? 'confirmed' : 'approved';
      writeHold(tx, companyId, b.courtId, b.date, b.lockCells, lockCapacity(court), bookingId, court.bookingModel === 'shared' ? b.participants : 1, null);
      tx.update(ref, {
        status,
        holdExpiresAt: null,
        history: FieldValue.arrayUnion(historyEntry(status, caller.uid, note)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { b, status, refund: false };
    }
    const customer = (await tx.get(refs.customer(companyId, b.customerUid))).data() as CompanyCustomer;
    releaseHold(tx, companyId, b.courtId, b.date, b.lockCells, bookingId);
    restoreCredits(tx, companyId, b.customerUid, b.creditLots ?? [], customer.creditBalance ?? 0, 'Booking rejected', bookingId, caller.uid);
    tx.update(ref, {
      status: 'rejected',
      holdExpiresAt: null,
      history: FieldValue.arrayUnion(historyEntry('rejected', caller.uid, note)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { b, status: 'rejected' as BookingStatus, refund: b.amountPaid > 0 };
  });
  if (outcome.refund) await refundBookingPayments(companyId, bookingId, outcome.b.amountPaid, 'Booking rejected', caller.uid);
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: `booking.${decision}`, targetType: 'booking', targetId: bookingId, companyId, before: { status: 'pendingApproval' }, after: { status: outcome.status }, metadata: { note } });
  const when = `${outcome.b.date} ${formatMinutes(outcome.b.startMin)}`;
  await notifyUser(outcome.b.customerUid, {
    title: decision === 'approve' ? 'Booking approved' : 'Booking rejected',
    body:
      decision === 'approve'
        ? `${outcome.b.courtName} on ${when} is ${outcome.status === 'approved' ? 'approved. Complete payment to confirm it.' : 'confirmed.'}`
        : `${outcome.b.courtName} on ${when} was not approved.${note ? ` ${note}` : ''}`,
    type: `booking.${decision === 'approve' ? 'approved' : 'rejected'}`,
    link: `/bookings/${companyId}/${bookingId}`,
    companyId,
  });
  return { status: outcome.status };
});

// ------------------------------------------------------------------- cancel

const CANCELLABLE: BookingStatus[] = ['pendingApproval', 'approved', 'paymentPending', 'confirmed'];

export const cancelBooking = callable('cancelBooking', cancelBookingSchema, async ({ companyId, bookingId, reason }, caller) => {
  const ref = refs.booking(companyId, bookingId);
  const pre = (await ref.get()).data() as Booking | undefined;
  if (!pre) throw fail.notFound('Booking');
  const byCustomer = pre.customerUid === caller.uid;
  let ctx = null;
  if (!byCustomer) {
    ctx = await requireStaff(caller, companyId, 'bookings.cancel');
    assertBranchAccess(ctx, pre.branchId);
  }
  const settings = await loadSettings(companyId);

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const b = snap.data() as Booking;
    if (!CANCELLABLE.includes(b.status)) throw fail.precondition(`A ${b.status} booking cannot be cancelled.`);
    const customer = (await tx.get(refs.customer(companyId, b.customerUid))).data() as CompanyCustomer;
    const hoursBefore = (b.startAt.toMillis() - Date.now()) / 3_600_000;
    if (byCustomer && hoursBefore < 0) throw fail.precondition('This booking has already started.');
    // Late cancellation charges apply to confirmed customer cancellations only.
    const late = byCustomer && ['confirmed', 'approved'].includes(b.status) && hoursBefore < settings.booking.cancellationDeadlineHours;
    const charge = late ? round2((b.pricing.total * settings.booking.lateCancellationChargePct) / 100) : 0;
    const refundable = round2(Math.max(0, b.amountPaid - b.amountRefunded - charge));
    releaseHold(tx, companyId, b.courtId, b.date, b.lockCells, bookingId);
    // Credits come back unless the cancellation is late.
    if (!late) restoreCredits(tx, companyId, b.customerUid, b.creditLots ?? [], customer.creditBalance ?? 0, 'Booking cancelled', bookingId, caller.uid);
    tx.update(ref, {
      status: 'cancelled',
      holdExpiresAt: null,
      cancellation: { at: Timestamp.now(), by: caller.uid, reason, late, charge },
      history: FieldValue.arrayUnion(historyEntry('cancelled', caller.uid, reason)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { b, late, charge, refundable };
  });
  if (outcome.refundable > 0) await refundBookingPayments(companyId, bookingId, outcome.refundable, reason || 'Booking cancelled', caller.uid);
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'booking.cancel', targetType: 'booking', targetId: bookingId, companyId, before: { status: outcome.b.status }, after: { status: 'cancelled' }, metadata: { reason, late: outcome.late, charge: outcome.charge, refund: outcome.refundable } });
  const when = `${outcome.b.date} ${formatMinutes(outcome.b.startMin)}`;
  if (byCustomer) {
    await notifyCompany(companyId, { title: 'Booking cancelled', body: `${outcome.b.customerName} cancelled ${outcome.b.courtName}, ${when}.`, type: 'booking.cancelled', link: `/manage/${companyId}/bookings/${bookingId}`, companyId }, ['owner', 'admin', 'manager', 'frontDesk']);
  }
  await notifyUser(outcome.b.customerUid, { title: 'Booking cancelled', body: `${outcome.b.courtName} on ${when} was cancelled.${outcome.refundable > 0 ? ' A refund has been started.' : ''}`, type: 'booking.cancelled', link: `/bookings/${companyId}/${bookingId}`, companyId });
  return { ok: true, late: outcome.late, charge: outcome.charge, refund: outcome.refundable };
});

// ------------------------------------------------------------------- modify

export const modifyBooking = callable('modifyBooking', modifyBookingSchema, async (input, caller) => {
  const ctx = await requireStaff(caller, input.companyId, 'bookings.modify');
  const ref = refs.booking(input.companyId, input.bookingId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw fail.notFound('Booking');
    const b = snap.data() as Booking;
    assertBranchAccess(ctx, b.branchId);
    if (!['pendingApproval', 'approved', 'confirmed', 'paymentPending'].includes(b.status)) throw fail.precondition(`A ${b.status} booking cannot be changed.`);
    const court = await loadCourt(input.companyId, b.courtId, tx);
    const blocks = await loadBlocks(input.companyId, court.branchId, tx);
    const cells = gridStarts(court, input.startMin, input.endMin);
    const locks = await readLocks(tx, input.companyId, court.id, input.date, cells);
    const check = checkBookingRequest(
      { court, blocks, locks, now: new Date(), rules: { minAdvanceMinutes: 0, maxAdvanceDays: 365 } },
      { date: input.date, startMin: input.startMin, endMin: input.endMin, participants: input.participants, ignoreHoldId: input.bookingId },
    );
    if (!check.ok) throw fail.conflict(check.message, { code: check.code });
    const { subtotal, lines } = computeSubtotal(court, input.date, input.startMin, input.endMin, input.participants);
    const creditValue = round2(b.pricing.creditsApplied * b.pricing.creditValue);
    const pricing = buildPricing(b.pricing.currency, subtotal, lines, { credits: b.pricing.creditsApplied, value: Math.min(creditValue, subtotal) }, b.pricing.creditValue);
    const paid = b.amountPaid - b.amountRefunded;
    const paymentStatus = pricing.total === 0 || paid >= pricing.total ? 'paid' : paid > 0 ? 'partiallyPaid' : 'unpaid';
    releaseHold(tx, input.companyId, b.courtId, b.date, b.lockCells, input.bookingId);
    writeHold(tx, input.companyId, court.id, input.date, check.cells, check.capacity, input.bookingId, check.units, (b.holdExpiresAt as Timestamp | null) ?? null);
    const startAt = localToInstant(input.date, input.startMin, court.timezone);
    tx.update(ref, {
      date: input.date,
      startMin: input.startMin,
      endMin: input.endMin,
      participants: input.participants,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(localToInstant(input.date, input.endMin, court.timezone)),
      pricing,
      paymentStatus,
      lockCells: check.cells,
      history: FieldValue.arrayUnion(historyEntry(b.status, caller.uid, `Moved from ${b.date} ${formatMinutes(b.startMin)}${input.note ? `: ${input.note}` : ''}`)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { before: b, pricing };
  });
  await audit({
    actorUid: caller.uid,
    actorEmail: caller.email,
    action: 'booking.modify',
    targetType: 'booking',
    targetId: input.bookingId,
    companyId: input.companyId,
    before: { date: result.before.date, startMin: result.before.startMin, endMin: result.before.endMin, participants: result.before.participants, total: result.before.pricing.total },
    after: { date: input.date, startMin: input.startMin, endMin: input.endMin, participants: input.participants, total: result.pricing.total },
  });
  await notifyUser(result.before.customerUid, { title: 'Booking changed', body: `${result.before.courtName} moved to ${input.date} ${formatMinutes(input.startMin)}.`, type: 'booking.modified', link: `/bookings/${input.companyId}/${input.bookingId}`, companyId: input.companyId });
  return { ok: true, pricing: result.pricing };
});

export const markNoShow = callable('markNoShow', bookingRefSchema, async ({ companyId, bookingId, note }, caller) => {
  const ctx = await requireStaff(caller, companyId, 'checkin.operate');
  const ref = refs.booking(companyId, bookingId);
  const b = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw fail.notFound('Booking');
    const b = snap.data() as Booking;
    assertBranchAccess(ctx, b.branchId);
    if (!['confirmed', 'approved'].includes(b.status)) throw fail.precondition('Only confirmed bookings can be marked as no-show.');
    if (b.startAt.toMillis() > Date.now()) throw fail.precondition('The booking has not started yet.');
    releaseHold(tx, companyId, b.courtId, b.date, b.lockCells, bookingId);
    tx.update(ref, { status: 'noShow', history: FieldValue.arrayUnion(historyEntry('noShow', caller.uid, note)), updatedAt: FieldValue.serverTimestamp() });
    return b;
  });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'booking.noShow', targetType: 'booking', targetId: bookingId, companyId, before: { status: b.status }, after: { status: 'noShow' } });
  return { ok: true };
});

/** Releases a booking whose hold expired. Used by the scheduled sweeper. */
export async function expireBooking(companyId: string, bookingId: string): Promise<boolean> {
  const ref = refs.booking(companyId, bookingId);
  const expired = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const b = snap.data() as Booking | undefined;
    if (!b || !['pendingApproval', 'paymentPending'].includes(b.status)) return null;
    if (!b.holdExpiresAt || b.holdExpiresAt.toMillis() > Date.now()) return null;
    const customer = (await tx.get(refs.customer(companyId, b.customerUid))).data() as CompanyCustomer;
    releaseHold(tx, companyId, b.courtId, b.date, b.lockCells, bookingId);
    restoreCredits(tx, companyId, b.customerUid, b.creditLots ?? [], customer.creditBalance ?? 0, 'Booking request expired', bookingId, null);
    tx.update(ref, { status: 'expired', holdExpiresAt: null, history: FieldValue.arrayUnion(historyEntry('expired', null)), updatedAt: FieldValue.serverTimestamp() });
    return b;
  });
  if (expired) {
    if (expired.amountPaid > 0) await refundBookingPayments(companyId, bookingId, expired.amountPaid, 'Booking request expired', null);
    await notifyUser(expired.customerUid, {
      title: 'Booking request expired',
      body: `${expired.courtName} on ${expired.date} ${formatMinutes(expired.startMin)} was released because it was not ${expired.status === 'paymentPending' ? 'paid' : 'approved'} in time.`,
      type: 'booking.expired',
      link: `/bookings/${companyId}/${bookingId}`,
      companyId,
    });
  }
  return !!expired;
}

export type { Caller };
