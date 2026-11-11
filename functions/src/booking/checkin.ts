/**
 * QR and code based check-in/check-out. Staff scan the booking's random token
 * (or type its 6-digit code); nothing personal is encoded in the QR.
 */
import type { Transaction } from 'firebase-admin/firestore';
import { checkInLookupSchema, checkInActionSchema, todayIn, roleCan, type Booking, type StaffMember } from '@courtsync/shared';
import { callable } from '../lib/callable';
import { db, FieldValue, Timestamp } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, requireStaff, assertBranchAccess, loadSettings, type StaffContext } from '../lib/authz';
import { releaseHold } from './locks';
import { notifyCompany } from '../notifications/notify';

const EARLY_CHECKIN_MINUTES = 30;

async function findBooking(cid: string, q: { token?: string; code?: string; bookingId?: string }, tz: string) {
  const col = refs.company(cid).collection('bookings');
  if (q.bookingId) {
    const snap = await col.doc(q.bookingId).get();
    return snap.exists ? snap : null;
  }
  if (q.token) {
    const snap = await col.where('checkInToken', '==', q.token).limit(1).get();
    return snap.docs[0] ?? null;
  }
  // Codes are unique per company and day, so look them up for today and yesterday (late sessions).
  const today = todayIn(tz);
  const snap = await col.where('verificationCode', '==', q.code).where('date', '<=', today).orderBy('date', 'desc').limit(3).get();
  return snap.docs.find((d) => ['confirmed', 'approved', 'checkedIn'].includes(d.get('status'))) ?? snap.docs[0] ?? null;
}

function summarize(id: string, b: Booking) {
  return {
    id,
    courtName: b.courtName,
    customerName: b.customerName,
    date: b.date,
    startMin: b.startMin,
    endMin: b.endMin,
    participants: b.participants,
    status: b.status,
    paymentStatus: b.paymentStatus,
    total: b.pricing.total,
    amountPaid: b.amountPaid,
    currency: b.pricing.currency,
    checkIn: b.checkIn ?? null,
  };
}

/** Problems that block a normal check-in; an override with a reason can bypass them. */
function checkInIssues(b: Booking, requirePrepayment: boolean): string[] {
  const issues: string[] = [];
  const now = Date.now();
  if (!['confirmed', 'approved'].includes(b.status)) issues.push(`Booking is ${b.status}.`);
  if (b.date !== todayIn(b.timezone)) issues.push(`Booking is for ${b.date}, not today.`);
  if (now < b.startAt.toMillis() - EARLY_CHECKIN_MINUTES * 60_000) issues.push('Too early to check in.');
  if (now > b.endAt.toMillis()) issues.push('The booking time has ended.');
  if (requirePrepayment && !['paid', 'partiallyPaid'].includes(b.paymentStatus)) issues.push('Payment has not been received.');
  return issues;
}

export const lookupCheckIn = callable('lookupCheckIn', checkInLookupSchema, async (input, caller) => {
  const ctx = await requireStaff(caller, input.companyId, 'checkin.operate');
  const snap = await findBooking(input.companyId, input, ctx.company.timezone);
  if (!snap) throw fail.notFound('Booking');
  const b = snap.data() as Booking;
  assertBranchAccess(ctx, b.branchId);
  const settings = await loadSettings(input.companyId);
  const issues = b.status === 'checkedIn' ? [] : checkInIssues(b, settings.booking.requirePrepayment);
  const balanceDue = Math.max(0, b.pricing.total - (b.amountPaid - b.amountRefunded));
  return { booking: summarize(snap.id, b), issues, balanceDue, canCheckOut: b.status === 'checkedIn' };
});

function canOverride(ctx: StaffContext) {
  return ctx.asSuper || roleCan((ctx.staff as StaffMember).role, 'checkin.override');
}

export const checkInOut = callable('checkInOut', checkInActionSchema, async (input, caller) => {
  const ctx = await requireStaff(caller, input.companyId, 'checkin.operate');
  if (input.override && !canOverride(ctx)) throw fail.denied('Only managers can override check-in rules.');
  const found = await findBooking(input.companyId, input, ctx.company.timezone);
  if (!found) throw fail.notFound('Booking');
  const settings = await loadSettings(input.companyId);
  const ref = found.ref;

  const result = await db.runTransaction(async (tx: Transaction) => {
    const b = (await tx.get(ref)).data() as Booking;
    assertBranchAccess(ctx, b.branchId);
    const now = Date.now();
    if (input.action === 'checkIn') {
      if (b.status === 'checkedIn') throw fail.precondition('Already checked in.');
      const issues = checkInIssues(b, settings.booking.requirePrepayment);
      if (issues.length && !input.override) throw fail.precondition(issues.join(' '), { issues });
      const lateMinutes = Math.max(0, Math.round((now - b.startAt.toMillis()) / 60_000));
      tx.update(ref, {
        status: 'checkedIn',
        checkIn: { at: Timestamp.fromMillis(now), by: caller.uid, manual: input.override, lateMinutes },
        history: FieldValue.arrayUnion({ status: 'checkedIn', at: Timestamp.now(), by: caller.uid, ...(input.override ? { note: `Override: ${input.reason}` } : {}) }),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { b, status: 'checkedIn' as const, issues, lateMinutes };
    }
    if (b.status !== 'checkedIn' && !input.override) throw fail.precondition('This booking is not checked in.');
    const checkedInAt = b.checkIn?.at?.toMillis() ?? b.startAt.toMillis();
    const durationMinutes = Math.max(0, Math.round((now - checkedInAt) / 60_000));
    const earlyMinutes = Math.max(0, Math.round((b.endAt.toMillis() - now) / 60_000));
    const overstayMinutes = Math.max(0, Math.round((now - b.endAt.toMillis()) / 60_000));
    // Leaving early frees the rest of the slot for walk-ins.
    releaseHold(tx, input.companyId, b.courtId, b.date, b.lockCells.filter((c) => {
      const cellStart = b.startAt.toMillis() + (c - b.startMin) * 60_000;
      return cellStart >= now;
    }), ref.id);
    tx.update(ref, {
      status: 'completed',
      checkOut: { at: Timestamp.fromMillis(now), by: caller.uid, manual: input.override, durationMinutes, earlyMinutes, overstayMinutes },
      history: FieldValue.arrayUnion(
        { status: 'checkedOut', at: Timestamp.now(), by: caller.uid, ...(input.override ? { note: `Override: ${input.reason}` } : {}) },
        { status: 'completed', at: Timestamp.now(), by: caller.uid },
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { b, status: 'completed' as const, issues: [] as string[], durationMinutes, overstayMinutes, earlyMinutes };
  });

  await audit({
    actorUid: caller.uid,
    actorEmail: caller.email,
    action: input.override ? `booking.${input.action}.override` : `booking.${input.action}`,
    targetType: 'booking',
    targetId: ref.id,
    companyId: input.companyId,
    before: { status: result.b.status },
    after: { status: result.status },
    metadata: input.override ? { reason: input.reason, bypassed: result.issues } : {},
  });
  await notifyCompany(
    input.companyId,
    { title: input.action === 'checkIn' ? 'Customer checked in' : 'Customer checked out', body: `${result.b.customerName}, ${result.b.courtName}`, type: `booking.${input.action}`, link: `/manage/${input.companyId}/bookings/${ref.id}`, companyId: input.companyId },
    ['owner', 'admin'],
  );
  return { status: result.status, bookingId: ref.id, ...('durationMinutes' in result ? { durationMinutes: result.durationMinutes, overstayMinutes: result.overstayMinutes, earlyMinutes: result.earlyMinutes } : { lateMinutes: result.lateMinutes }) };
});
