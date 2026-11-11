import { z } from 'zod';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import {
  startPaymentSchema,
  recordPaymentSchema,
  refundSchema,
  round2,
  type Booking,
  type PaymentMethod,
  type PaymentTransaction,
  type Subscription,
  type UserProfile,
} from '@courtsync/shared';
import { callable } from '../lib/callable';
import { db, FieldValue } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, loadCompany, loadSettings, requireStaff, assertCompanyOpen } from '../lib/authz';
import { getProvider } from './providers';
import { sandboxAllowed } from './providers/sandbox';
import { applyPaymentFailure, applyPaymentSuccess, paymentRef } from './ledger';
import { addRefundedToBooking } from './refunds';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

async function loadMethod(id: string): Promise<PaymentMethod> {
  const m = (await db.collection('paymentMethods').doc(id).get()).data() as PaymentMethod | undefined;
  if (!m || !m.enabled) throw fail.invalid('That payment method is unavailable.');
  return m;
}

/** Amount the customer owes now for a booking or subscription. */
async function amountDue(cid: string, purpose: 'booking' | 'subscription', referenceId: string) {
  const settings = await loadSettings(cid);
  if (purpose === 'booking') {
    const b = (await refs.booking(cid, referenceId).get()).data() as Booking | undefined;
    if (!b) throw fail.notFound('Booking');
    if (!['paymentPending', 'pendingApproval', 'approved', 'confirmed', 'checkedIn'].includes(b.status)) {
      throw fail.precondition(`A ${b.status} booking cannot be paid.`);
    }
    const net = b.amountPaid - b.amountRefunded;
    const target = b.status === 'paymentPending' ? round2((b.pricing.total * settings.booking.depositPct) / 100) : b.pricing.total;
    const due = round2(Math.max(0, target - net));
    return { due, currency: b.pricing.currency, customerUid: b.customerUid, description: `${b.courtName} on ${b.date}`, courtId: b.courtId, sportId: b.sportId, settings };
  }
  const s = (await refs.company(cid).collection('subscriptions').doc(referenceId).get()).data() as (Subscription & { amountPaid?: number }) | undefined;
  if (!s) throw fail.notFound('Subscription');
  if (!['pendingPayment', 'active'].includes(s.status)) throw fail.precondition(`A ${s.status} membership cannot be paid.`);
  const due = round2(Math.max(0, s.price - (s.amountPaid ?? 0)));
  return { due, currency: s.currency, customerUid: s.customerUid, description: s.serviceName, courtId: null, sportId: null, settings };
}

/** Customer starts an online payment. Returns gateway checkout data for the client UI. */
export const startPayment = callable(
  'startPayment',
  startPaymentSchema,
  async ({ companyId, purpose, referenceId, paymentMethodId }, caller) => {
    const company = await loadCompany(companyId);
    assertCompanyOpen(company);
    const due = await amountDue(companyId, purpose, referenceId);
    if (due.customerUid !== caller.uid) throw fail.denied();
    if (due.due <= 0) throw fail.precondition('Nothing is due.');
    if (!due.settings.paymentMethodIds.includes(paymentMethodId)) throw fail.invalid('That payment method is not accepted here.');
    const method = await loadMethod(paymentMethodId);
    if (method.kind !== 'online') throw fail.invalid('Pay for this at the venue.');
    const provider = getProvider(method.provider);
    if (!provider || !(await provider.isConfigured())) throw fail.unavailable('Online payments are not set up for this method yet.');
    if (provider.id === 'sandbox') {
      const flags = (await db.collection('platformSettings').doc('general').get()).get('features') as Record<string, boolean> | undefined;
      if (!sandboxAllowed() || !(flags?.sandboxPayments || process.env.FUNCTIONS_EMULATOR === 'true')) throw fail.unavailable('Sandbox payments are disabled.');
    }
    const profile = (await refs.user(caller.uid).get()).data() as UserProfile | undefined;
    const ref = refs.company(companyId).collection('payments').doc();
    const base = {
      type: 'charge',
      status: 'created',
      companyId,
      customerUid: caller.uid,
      purpose,
      referenceId,
      amount: due.due,
      currency: due.currency,
      paymentMethodId,
      provider: provider.id,
      providerRef: null,
      checkout: null,
      courtId: due.courtId,
      sportId: due.sportId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(base);
    try {
      const checkout = await provider.createCheckout({
        reference: `${companyId}:${ref.id}`,
        amount: due.due,
        currency: due.currency,
        description: `${company.name}: ${due.description}`,
        customer: { uid: caller.uid, name: profile?.displayName ?? '', email: profile?.email, phone: profile?.phone },
        returnUrl: `${appUrl()}/${purpose === 'booking' ? `bookings/${companyId}/${referenceId}` : 'memberships'}?payment=${ref.id}`,
      });
      await ref.update({ status: 'pending', providerRef: checkout.providerRef, checkout: checkout.checkout, updatedAt: FieldValue.serverTimestamp() });
      return { paymentId: ref.id, amount: due.due, currency: due.currency, provider: provider.id, checkout: checkout.checkout };
    } catch (err) {
      logger.error('createCheckout failed', err);
      await ref.update({ status: 'failed', failureReason: 'Could not start checkout', updatedAt: FieldValue.serverTimestamp() });
      throw fail.unavailable('The payment provider could not start checkout. Please try again.');
    }
  },
  { rateLimit: 20 },
);

/** Development only: completes a sandbox checkout the way a gateway webhook would. */
export const confirmSandboxPayment = callable(
  'confirmSandboxPayment',
  z.object({ companyId: z.string().min(1), paymentId: z.string().min(1), outcome: z.enum(['succeeded', 'failed']) }),
  async ({ companyId, paymentId, outcome }, caller) => {
    if (!sandboxAllowed()) throw fail.denied('Sandbox payments are disabled.');
    const p = (await paymentRef(companyId, paymentId).get()).data() as PaymentTransaction | undefined;
    if (!p || p.customerUid !== caller.uid || p.provider !== 'sandbox') throw fail.notFound('Payment');
    if (outcome === 'succeeded') await applyPaymentSuccess(companyId, paymentId, { actor: null });
    else await applyPaymentFailure(companyId, paymentId, 'Sandbox payment declined');
    return { ok: true };
  },
);

/** Staff record a cash or other offline payment. */
export const recordOfflinePayment = callable('recordOfflinePayment', recordPaymentSchema, async (input, caller) => {
  await requireStaff(caller, input.companyId, 'payments.record');
  const settings = await loadSettings(input.companyId);
  if (!settings.paymentMethodIds.includes(input.paymentMethodId)) throw fail.invalid('That payment method is not enabled for this company.');
  const method = await loadMethod(input.paymentMethodId);
  if (method.kind !== 'offline') throw fail.invalid('Online payments are confirmed by the gateway, not recorded manually.');
  const due = await amountDue(input.companyId, input.purpose, input.referenceId);
  if (input.amount > due.due + 0.001) throw fail.invalid(`Only ${due.currency} ${due.due.toFixed(2)} is due.`);
  const ref = refs.company(input.companyId).collection('payments').doc();
  await ref.set({
    type: 'charge',
    status: 'pending',
    companyId: input.companyId,
    customerUid: due.customerUid,
    purpose: input.purpose,
    referenceId: input.referenceId,
    amount: round2(input.amount),
    currency: due.currency,
    paymentMethodId: input.paymentMethodId,
    provider: 'offline',
    providerRef: null,
    recordedBy: caller.uid,
    note: input.note ?? null,
    courtId: due.courtId,
    sportId: due.sportId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await applyPaymentSuccess(input.companyId, ref.id, { actor: caller.uid });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'payment.recordOffline', targetType: 'payment', targetId: ref.id, companyId: input.companyId, after: { amount: input.amount, method: input.paymentMethodId, referenceId: input.referenceId } });
  return { paymentId: ref.id };
});

/** Staff refund part or all of a specific charge. */
export const refundPayment = callable('refundPayment', refundSchema, async (input, caller) => {
  await requireStaff(caller, input.companyId, 'payments.refund');
  const charge = (await paymentRef(input.companyId, input.paymentId).get()).data() as PaymentTransaction | undefined;
  if (!charge || charge.type !== 'charge' || charge.status !== 'succeeded') throw fail.precondition('Only successful charges can be refunded.');
  if (charge.purpose !== 'booking') throw fail.precondition('Membership refunds are handled by cancelling the membership.');
  const { refundBookingPayments } = await import('./refunds');
  const settled = await refundBookingPayments(input.companyId, charge.referenceId, input.amount, input.reason, caller.uid);
  return { settled };
});

/** Staff confirm a pending (cash) refund was handed back. */
export const settleRefund = callable('settleRefund', z.object({ companyId: z.string().min(1), paymentId: z.string().min(1) }), async ({ companyId, paymentId }, caller) => {
  await requireStaff(caller, companyId, 'payments.refund');
  const ref = paymentRef(companyId, paymentId);
  const r = await db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data() as PaymentTransaction | undefined;
    if (!p || p.type !== 'refund' || p.status !== 'pending') throw fail.precondition('Only pending refunds can be settled.');
    tx.update(ref, { status: 'succeeded', recordedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
    return p;
  });
  if (r.purpose === 'booking') await addRefundedToBooking(companyId, r.referenceId, r.amount);
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'payment.refundSettled', targetType: 'payment', targetId: paymentId, companyId, after: { amount: r.amount } });
  return { ok: true };
});

/**
 * Gateway webhooks: POST /api/webhooks/{provider}. The only path that confirms online payments.
 * Signatures are verified by each adapter before anything is trusted.
 */
export const paymentWebhook = onRequest({ cors: false, timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  const providerId = req.path.split('/').filter(Boolean).pop() ?? '';
  const provider = getProvider(providerId);
  if (!provider || !provider.online || providerId === 'sandbox') {
    res.status(404).send('Unknown provider');
    return;
  }
  let events;
  try {
    events = await provider.parseWebhook(req.headers, req.rawBody);
  } catch (err) {
    logger.warn('webhook rejected', { provider: providerId, error: (err as Error).message });
    res.status(400).send('Invalid signature');
    return;
  }
  for (const e of events) {
    const [cid, paymentId] = (e.reference ?? '').split(':');
    if (!cid || !paymentId) {
      logger.warn('webhook event without reference', { provider: providerId, providerRef: e.providerRef });
      continue;
    }
    const p = (await paymentRef(cid, paymentId).get()).data() as PaymentTransaction | undefined;
    if (!p || p.provider !== providerId || (p.providerRef && p.providerRef !== e.providerRef)) {
      logger.warn('webhook event does not match a payment', { cid, paymentId });
      continue;
    }
    if (e.status === 'succeeded') {
      if (e.amount != null && Math.abs(e.amount - p.amount) > 0.01) {
        logger.error('webhook amount mismatch', { cid, paymentId, expected: p.amount, got: e.amount });
      }
      await applyPaymentSuccess(cid, paymentId, { amount: e.amount, providerRef: e.providerRef, providerPaymentRef: e.providerPaymentRef });
    } else {
      await applyPaymentFailure(cid, paymentId, e.failureReason ?? 'Payment failed');
    }
  }
  res.status(200).json({ received: true });
});

/** Lists which payment providers are configured, for the Super Admin settings page. */
export const paymentProviderStatus = callable('paymentProviderStatus', z.object({}), async (_i, caller) => {
  if (!caller.superAdmin) throw fail.denied();
  const { providerIds } = await import('./providers');
  const out: Record<string, boolean> = {};
  for (const id of providerIds()) out[id] = (await getProvider(id)!.isConfigured());
  return { providers: out };
});
