/**
 * Sandbox provider for development and automated tests. It only works in the emulator, or when
 * ALLOW_SANDBOX_PAYMENTS=true and the Super Admin enables the sandboxPayments feature flag.
 * Never enable it in production.
 */
import { randomBytes } from 'node:crypto';
import type { PaymentProvider } from './types';
import { isEmulator } from '../../lib/firebase';

export const sandboxAllowed = () => isEmulator || process.env.ALLOW_SANDBOX_PAYMENTS === 'true';

export const sandboxProvider: PaymentProvider = {
  id: 'sandbox',
  online: true,
  async isConfigured() {
    return sandboxAllowed();
  },
  async createCheckout(req) {
    return { providerRef: `sbx_${randomBytes(8).toString('hex')}`, checkout: { kind: 'sandbox', amount: req.amount, currency: req.currency } };
  },
  async parseWebhook() {
    throw new Error('The sandbox provider has no webhooks');
  },
  async refund() {
    return { refundRef: `sbx_rf_${randomBytes(6).toString('hex')}`, status: 'succeeded' };
  },
};

export const offlineProvider: PaymentProvider = {
  id: 'offline',
  online: false,
  async isConfigured() {
    return true;
  },
  async createCheckout() {
    throw new Error('Offline payments are recorded by staff');
  },
  async parseWebhook() {
    throw new Error('Offline payments have no webhooks');
  },
  async refund() {
    // Cash refunds are handed back at the desk and settled by staff.
    return { refundRef: '', status: 'pending' };
  },
};
