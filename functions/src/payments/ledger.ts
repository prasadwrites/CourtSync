/**
 * Applies verified payment outcomes to the ledger and to what was paid for.
 * Idempotent: replaying the same webhook does nothing the second time.
 */
import { round2, formatMinutes, type Booking, type PaymentTransaction, type Subscription, type PaymentStatus, type BookingStatus } from '@courtsync/shared';
import { db, FieldValue, Timestamp } from '../lib/firebase';
import { refs, loadSettings } from '../lib/authz';
import { audit } from '../lib/audit';
import { writeHold } from '../booking/locks';
import { notifyCompany, notifyUser } from '../notifications/notify';

export const paymentRef = (cid: string, id: string) => refs.company(cid).collection('payments').doc(id);

export function paymentStatusFor(total: number, paid: number, refunded: number): PaymentStatus {
  const net = round2(paid - refunded);
  if (refunded > 0 && net <= 0) return 'refunded';
  if (refunded > 0) return 'partiallyRefunded';
  if (total <= 0 || net >= total - 0.001) return 'paid';
  if (net > 0) return 'partiallyPaid';
  return 'unpaid';
}

export async function applyPaymentSuccess(
  cid: string,
  paymentId: string,
  opts: { amount?: number | null; providerRef?: string; providerPaymentRef?: string; actor?: string | null } = {},
): Promise<boolean> {
  const ref = paymentRef(cid, paymentId);
  const settings = await loadSettings(cid);
  const done = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const p = snap.data() as PaymentTransaction;
    if (p.status === 'succeeded' || p.type !== 'charge') return null;
    const amount = opts.amount != null ? round2(opts.amount) : p.amount;
    const target = p.purpose === 'booking' ? refs.booking(cid, p.referenceId) : refs.company(cid).collection('subscriptions').doc(p.referenceId);
    const targetSnap = await tx.get(target);
    let courtCapacity = 1;
    let courtShared = false;
    if (p.purpose === 'booking' && targetSnap.exists) {
      const court = await tx.get(refs.court(cid, targetSnap.get('courtId')));
      courtShared = court.get('bookingModel') === 'shared';
      courtCapacity = courtShared ? (court.get('capacity') as number) : 1;
    }

    tx.update(ref, {
      status: 'succeeded',
      amount,
      providerRef: opts.providerRef ?? p.providerRef ?? null,
      providerPaymentRef: opts.providerPaymentRef ?? null,
      checkout: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!targetSnap.exists) return { p, amount, target: null };

    if (p.purpose === 'booking') {
      const b = targetSnap.data() as Booking;
      const amountPaid = round2(b.amountPaid + amount);
      const update: Record<string, unknown> = {
        amountPaid,
        paymentStatus: paymentStatusFor(b.pricing.total, amountPaid, b.amountRefunded),
        paymentMethodId: p.paymentMethodId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      let next: BookingStatus | null = null;
      if (b.status === 'paymentPending') next = settings.booking.requireApproval ? 'pendingApproval' : 'confirmed';
      else if (b.status === 'approved') next = 'confirmed';
      if (next) {
        update.status = next;
        update.history = FieldValue.arrayUnion({ status: next, at: Timestamp.now(), by: opts.actor ?? null, note: 'Payment received' });
        // A paid booking keeps its slot while it waits for approval.
        update.holdExpiresAt = null;
        writeHold(tx, cid, b.courtId, b.date, b.lockCells, courtCapacity, p.referenceId, courtShared ? b.participants : 1, null);
      }
      tx.update(target, update);
      return { p, amount, target: { kind: 'booking' as const, b, next } };
    }
    const s = targetSnap.data() as Subscription;
    const paid = round2(((targetSnap.get('amountPaid') as number) ?? 0) + amount);
    const update: Record<string, unknown> = { amountPaid: paid, paymentStatus: paymentStatusFor(s.price, paid, 0), updatedAt: FieldValue.serverTimestamp() };
    if (s.status === 'pendingPayment' && paid >= s.price - 0.001) update.status = 'active';
    tx.update(target, update);
    return { p, amount, target: { kind: 'subscription' as const, s } };
  });
  if (!done) return false;

  // Money that arrives after a booking was released goes straight back.
  if (done.target?.kind === 'booking' && ['cancelled', 'expired', 'rejected'].includes(done.target.b.status)) {
    const { refundBookingPayments } = await import('./refunds');
    await refundBookingPayments(cid, done.p.referenceId, done.amount, `Payment received after the booking was ${done.target.b.status}`, null);
  }

  await audit({ actorUid: opts.actor ?? null, action: 'payment.succeeded', targetType: 'payment', targetId: paymentId, companyId: cid, after: { amount: done.amount, purpose: done.p.purpose, referenceId: done.p.referenceId, provider: done.p.provider } });
  const money = `${done.p.currency} ${done.amount.toFixed(2)}`;
  await notifyUser(done.p.customerUid, { title: 'Payment successful', body: `We received ${money}.`, type: 'payment.succeeded', link: done.p.purpose === 'booking' ? `/bookings/${cid}/${done.p.referenceId}` : '/memberships', companyId: cid });
  await notifyCompany(cid, { title: 'Payment received', body: `${money} for a ${done.p.purpose}.`, type: 'payment.received', link: `/manage/${cid}/payments`, companyId: cid }, ['owner', 'admin', 'manager']);
  if (done.target?.kind === 'booking' && done.target.next === 'pendingApproval') {
    const b = done.target.b;
    await notifyCompany(cid, { title: 'New booking request', body: `${b.courtName}, ${b.date} ${formatMinutes(b.startMin)} (paid)`, type: 'booking.requested', link: `/manage/${cid}/bookings/${done.p.referenceId}`, companyId: cid }, ['owner', 'admin', 'manager', 'frontDesk']);
  }
  return true;
}

export async function applyPaymentFailure(cid: string, paymentId: string, reason: string): Promise<void> {
  const ref = paymentRef(cid, paymentId);
  const p = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const p = snap.data() as PaymentTransaction | undefined;
    if (!p || p.status === 'succeeded' || p.status === 'failed') return null;
    tx.update(ref, { status: 'failed', failureReason: reason, checkout: null, updatedAt: FieldValue.serverTimestamp() });
    return p;
  });
  if (p) {
    await notifyUser(p.customerUid, { title: 'Payment failed', body: `${reason}. You can try again from your booking.`, type: 'payment.failed', link: p.purpose === 'booking' ? `/bookings/${cid}/${p.referenceId}` : '/memberships', companyId: cid });
  }
}
