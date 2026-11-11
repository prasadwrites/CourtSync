/**
 * Payment gateway adapter contract. The booking engine never talks to a gateway directly;
 * it creates a ledger entry and asks the adapter for a checkout. Gateways confirm payments
 * through signed webhooks only, never through the client.
 */
export interface CheckoutRequest {
  /** "{companyId}:{paymentId}", echoed back in webhooks. */
  reference: string;
  amount: number;
  currency: string;
  description: string;
  customer: { uid: string; name: string; email?: string | null; phone?: string | null };
  returnUrl: string;
}

export interface CheckoutResult {
  providerRef: string;
  /** Public data for the client checkout UI (client secret, order id, publishable key). */
  checkout: Record<string, unknown>;
}

export interface WebhookEvent {
  reference: string | null;
  providerRef: string;
  /** Gateway id of the captured payment, used for refunds when it differs from providerRef. */
  providerPaymentRef?: string;
  status: 'succeeded' | 'failed';
  amount: number | null;
  failureReason?: string;
}

export interface RefundResult {
  refundRef: string;
  status: 'succeeded' | 'pending';
}

export interface PaymentProvider {
  id: string;
  /** Online providers need credentials; offline ones are recorded by staff. */
  online: boolean;
  isConfigured(): Promise<boolean>;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Verifies the signature and returns normalised events. Throws on an invalid signature. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<WebhookEvent[]>;
  refund(args: { providerRef: string; providerPaymentRef?: string | null; amount: number; currency: string; reason: string }): Promise<RefundResult>;
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'XAF', 'XOF', 'UGX', 'RWF', 'PYG', 'ISK']);

export function toMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

export function fromMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : amount / 100;
}

export function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
