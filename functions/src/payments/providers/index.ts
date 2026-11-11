import type { PaymentProvider } from './types';
import { stripeProvider } from './stripe';
import { razorpayProvider } from './razorpay';
import { sandboxProvider, offlineProvider } from './sandbox';

/** Register new gateways here. Payment methods in Firestore reference them by id. */
const PROVIDERS: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
  razorpay: razorpayProvider,
  sandbox: sandboxProvider,
  offline: offlineProvider,
};

export function getProvider(id: string): PaymentProvider | null {
  return PROVIDERS[id] ?? null;
}

export function providerIds(): string[] {
  return Object.keys(PROVIDERS);
}
