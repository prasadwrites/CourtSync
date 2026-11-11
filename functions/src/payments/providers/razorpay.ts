/**
 * Razorpay adapter for India: UPI (including Google Pay, PhonePe and other UPI apps), cards,
 * net banking and wallets through Razorpay Checkout.
 * Secrets: RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET. Env: RAZORPAY_KEY_ID.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret } from '../../lib/secrets';
import { fromMinor, header, toMinor, type PaymentProvider, type WebhookEvent } from './types';

async function api(method: 'POST' | 'GET', path: string, body?: unknown) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = await getSecret('RAZORPAY_KEY_SECRET');
  if (!keyId || !secret) throw new Error('Razorpay is not configured');
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

export function verifyRazorpaySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export const razorpayProvider: PaymentProvider = {
  id: 'razorpay',
  online: true,
  async isConfigured() {
    return !!process.env.RAZORPAY_KEY_ID && !!(await getSecret('RAZORPAY_KEY_SECRET'));
  },
  async createCheckout(req) {
    const order = await api('POST', 'orders', {
      amount: toMinor(req.amount, req.currency),
      currency: req.currency,
      receipt: req.reference.slice(-40),
      notes: { reference: req.reference },
    });
    return {
      providerRef: order.id as string,
      checkout: {
        kind: 'razorpay',
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        description: req.description,
        prefill: { name: req.customer.name, email: req.customer.email ?? undefined, contact: req.customer.phone ?? undefined },
      },
    };
  },
  async parseWebhook(headers, rawBody) {
    const secret = await getSecret('RAZORPAY_WEBHOOK_SECRET');
    const sig = header(headers, 'x-razorpay-signature');
    if (!secret || !sig || !verifyRazorpaySignature(rawBody, sig, secret)) throw new Error('Invalid Razorpay signature');
    const event = JSON.parse(rawBody.toString('utf8')) as { event: string; payload: Record<string, { entity: Record<string, any> }> };
    const payment = event.payload.payment?.entity;
    const out: WebhookEvent[] = [];
    if (!payment) return out;
    const reference = payment.notes?.reference ?? null;
    if (event.event === 'payment.captured') {
      out.push({ reference, providerRef: payment.order_id, providerPaymentRef: payment.id, status: 'succeeded', amount: fromMinor(payment.amount, payment.currency) });
    } else if (event.event === 'payment.failed') {
      out.push({ reference, providerRef: payment.order_id, providerPaymentRef: payment.id, status: 'failed', amount: null, failureReason: payment.error_description ?? 'Payment failed' });
    }
    return out;
  },
  async refund({ providerPaymentRef, amount, currency, reason }) {
    if (!providerPaymentRef) throw new Error('Razorpay refund needs the captured payment id');
    const r = await api('POST', `payments/${providerPaymentRef}/refund`, { amount: toMinor(amount, currency), notes: { reason: reason.slice(0, 250) } });
    return { refundRef: r.id as string, status: r.status === 'processed' ? 'succeeded' : 'pending' };
  },
};
