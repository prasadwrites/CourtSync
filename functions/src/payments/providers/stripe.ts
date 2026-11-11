/**
 * Stripe adapter: cards and Google Pay / Apple Pay through the Payment Element.
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Env: STRIPE_PUBLISHABLE_KEY.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret } from '../../lib/secrets';
import { fromMinor, header, toMinor, type PaymentProvider, type WebhookEvent } from './types';

async function api(path: string, params: Record<string, string>, idempotencyKey?: string) {
  const key = await getSecret('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe is not configured');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

export function verifyStripeSignature(payload: Buffer, signatureHeader: string, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  const sigs = signatureHeader.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload.toString('utf8')}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export const stripeProvider: PaymentProvider = {
  id: 'stripe',
  online: true,
  async isConfigured() {
    return !!(await getSecret('STRIPE_SECRET_KEY')) && !!process.env.STRIPE_PUBLISHABLE_KEY;
  },
  async createCheckout(req) {
    const pi = await api(
      'payment_intents',
      {
        amount: String(toMinor(req.amount, req.currency)),
        currency: req.currency.toLowerCase(),
        description: req.description,
        'automatic_payment_methods[enabled]': 'true',
        'metadata[reference]': req.reference,
        ...(req.customer.email ? { receipt_email: req.customer.email } : {}),
      },
      req.reference,
    );
    return {
      providerRef: pi.id as string,
      checkout: { kind: 'stripe', clientSecret: pi.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY, returnUrl: req.returnUrl },
    };
  },
  async parseWebhook(headers, rawBody) {
    const secret = await getSecret('STRIPE_WEBHOOK_SECRET');
    const sig = header(headers, 'stripe-signature');
    if (!secret || !sig || !verifyStripeSignature(rawBody, sig, secret)) throw new Error('Invalid Stripe signature');
    const event = JSON.parse(rawBody.toString('utf8')) as { type: string; data: { object: Record<string, any> } };
    const obj = event.data.object;
    const out: WebhookEvent[] = [];
    if (event.type === 'payment_intent.succeeded') {
      out.push({ reference: obj.metadata?.reference ?? null, providerRef: obj.id, status: 'succeeded', amount: fromMinor(obj.amount_received, obj.currency.toUpperCase()) });
    } else if (event.type === 'payment_intent.payment_failed') {
      out.push({ reference: obj.metadata?.reference ?? null, providerRef: obj.id, status: 'failed', amount: null, failureReason: obj.last_payment_error?.message ?? 'Payment failed' });
    }
    return out;
  },
  async refund({ providerRef, amount, currency, reason }) {
    const r = await api('refunds', { payment_intent: providerRef, amount: String(toMinor(amount, currency)), 'metadata[reason]': reason.slice(0, 400) });
    return { refundRef: r.id as string, status: r.status === 'succeeded' ? 'succeeded' : 'pending' };
  },
};
