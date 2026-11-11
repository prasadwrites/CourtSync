/**
 * CourtSync Cloud Functions. Every privileged or money-related operation lives here;
 * Firestore rules block clients from writing those records directly.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: process.env.FUNCTION_REGION ?? 'us-central1', maxInstances: 20 });

// Platform administration
export { ensureProfile, sendPasswordReset, forcePasswordReset, confirmPasswordChanged, setUserStatus, setSuperAdmin, findUser, emailStatus } from './platform/users';
export { createCompany, setCompanyStatus, updateCompanyRestrictions } from './platform/companies';

// Company administration
export { addStaff, updateStaff } from './company/staff';
export { upsertBranch, upsertCourt } from './company/facility';
export { joinCompany, createCustomer, inviteCustomer, updateCustomer } from './company/customers';

// Booking engine
export { getAvailability, createBooking, decideBooking, cancelBooking, modifyBooking, markNoShow } from './booking/bookings';
export { lookupCheckIn, checkInOut } from './booking/checkin';

// Money
export { startPayment, confirmSandboxPayment, recordOfflinePayment, refundPayment, settleRefund, paymentWebhook, paymentProviderStatus } from './payments/payments';
export { adjustCredits } from './credits/credits';

// Memberships and verification
export { subscribe, renewSubscription, cancelSubscription, recordAttendance } from './memberships/subscriptions';
export { submitVerification, reviewVerification, revealIdNumber, withdrawVerification } from './verification/verification';

// Background work
export { sweepExpiredHolds, sendReminders, dailyMaintenance } from './reports/jobs';
export {
  onBookingWritten,
  onPaymentWritten,
  onCreditTxnCreated,
  onSubscriptionCreated,
  onCompanyWritten,
  auditCountries,
  auditSports,
  auditIdTypes,
  auditPaymentMethods,
  auditPlatformSettings,
  auditCompanyProfile,
  auditCompanyPrivate,
  auditCompanySettings,
  auditBlockedSlots,
  auditServices,
} from './reports/triggers';
