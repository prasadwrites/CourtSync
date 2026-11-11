import { round2, type Booking, type PaymentTransaction } from '@courtsync/shared';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../lib/firebase';
import { refs } from '../lib/authz';
import { audit } from '../lib/audit';
import { getProvider } from './providers';
import { paymentStatusFor } from './ledger';

/**
 * Refunds up to `amount` across a booking's successful charges, newest first.
 * Gateway refunds are requested immediately; cash refunds are created as pending for staff to settle.
 */
export async function refundBookingPayments(cid: string, bookingId: string, amount: number, reason: string, by: string | null): Promise<number> {
  const payments = refs.company(cid).collection('payments');
  const charges = await payments
    .where('purpose', '==', 'booking')
    .where('referenceId', '==', bookingId)
    .where('type', '==', 'charge')
    .where('status', '==', 'succeeded')
    .get();
  const refunds = await payments.where('referenceId', '==', bookingId).where('type', '==', 'refund').get();
  const refundedPer = new Map<string, number>();
  refunds.docs.forEach((r) => {
    if (r.get('status') === 'failed') return;
    const parent = r.get('parentPaymentId') as string;
    refundedPer.set(parent, (refundedPer.get(parent) ?? 0) + (r.get('amount') as number));
  });
  let left = round2(amount);
  let settled = 0;
  const sorted = charges.docs.sort((a, b) => (b.get('createdAt')?.toMillis?.() ?? 0) - (a.get('createdAt')?.toMillis?.() ?? 0));
  for (const c of sorted) {
    if (left <= 0) break;
    const charge = c.data() as PaymentTransaction & { providerPaymentRef?: string | null };
    const available = round2(charge.amount - (refundedPer.get(c.id) ?? 0));
    if (available <= 0) continue;
    const take = Math.min(available, left);
    left = round2(left - take);
    const refundRef = payments.doc();
    const provider = getProvider(charge.provider);
    let status: 'succeeded' | 'pending' | 'failed' = 'pending';
    let providerRef: string | null = null;
    let failureReason: string | null = null;
    try {
      if (provider) {
        const r = await provider.refund({ providerRef: charge.providerRef ?? '', providerPaymentRef: charge.providerPaymentRef, amount: take, currency: charge.currency, reason });
        status = r.status;
        providerRef = r.refundRef || null;
      }
    } catch (err) {
      logger.error('refund failed', err);
      status = 'failed';
      failureReason = (err as Error).message.slice(0, 300);
    }
    await refundRef.set({
      type: 'refund',
      status,
      companyId: cid,
      customerUid: charge.customerUid,
      purpose: 'booking',
      referenceId: bookingId,
      parentPaymentId: c.id,
      amount: take,
      currency: charge.currency,
      paymentMethodId: charge.paymentMethodId,
      provider: charge.provider,
      providerRef,
      note: reason,
      failureReason,
      recordedBy: by,
      courtId: charge.courtId ?? null,
      sportId: charge.sportId ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (status === 'succeeded') settled = round2(settled + take);
  }
  if (settled > 0) await addRefundedToBooking(cid, bookingId, settled);
  await audit({ actorUid: by, action: 'payment.refund', targetType: 'booking', targetId: bookingId, companyId: cid, metadata: { requested: amount, settled, reason } });
  return settled;
}

export async function addRefundedToBooking(cid: string, bookingId: string, amount: number) {
  const ref = refs.booking(cid, bookingId);
  await db.runTransaction(async (tx) => {
    const b = (await tx.get(ref)).data() as Booking | undefined;
    if (!b) return;
    const refunded = round2(b.amountRefunded + amount);
    tx.update(ref, { amountRefunded: refunded, paymentStatus: paymentStatusFor(b.pricing.total, b.amountPaid, refunded), updatedAt: FieldValue.serverTimestamp() });
  });
}
