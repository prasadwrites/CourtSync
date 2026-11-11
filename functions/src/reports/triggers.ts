/**
 * Keeps reporting counters and search fields up to date. Reports read small daily documents
 * (companies/{cid}/stats/day_YYYY-MM-DD) instead of scanning bookings.
 */
import { onDocumentWritten, onDocumentCreated, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { todayIn, type Booking, type Company, type PaymentTransaction, type CreditTransaction } from '@courtsync/shared';
import { db, FieldValue } from '../lib/firebase';
import { bumpDaily, bumpPlatform, statKey } from '../lib/stats';
import { auditDoc } from '../lib/audit';

export const onBookingWritten = onDocumentWritten('companies/{cid}/bookings/{bid}', async (event) => {
  const before = event.data?.before.exists ? (event.data.before.data() as Booking) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as Booking) : null;
  if (!after) return;
  const cid = event.params.cid;
  const court = statKey(after.courtId);
  const sport = statKey(after.sportId);
  const daily: Record<string, number> = {};
  const platform: Record<string, number> = {};
  if (!before) {
    daily.bookings = 1;
    daily[`byHour.${Math.floor(after.startMin / 60)}`] = 1;
    daily[`byCourt.${court}.bookings`] = 1;
    daily[`bySport.${sport}.bookings`] = 1;
    platform.bookings = 1;
  }
  const was = before?.status;
  const now = after.status;
  if (was !== now) {
    if (now === 'pendingApproval') platform.pendingBookings = (platform.pendingBookings ?? 0) + 1;
    if (was === 'pendingApproval') platform.pendingBookings = (platform.pendingBookings ?? 0) - 1;
    if (now === 'completed') {
      const minutes = after.endMin - after.startMin;
      daily.completed = 1;
      daily.bookedMinutes = minutes;
      daily[`byCourt.${court}.minutes`] = minutes;
      platform.completedBookings = 1;
      await db.collection('companies').doc(cid).update({ 'stats.completedBookings': FieldValue.increment(1) });
    }
    if (now === 'cancelled') daily.cancelled = 1;
    if (now === 'noShow') daily.noShows = 1;
  }
  if (Object.keys(daily).length) await bumpDaily(cid, after.date, daily);
  if (Object.keys(platform).length) await bumpPlatform(platform);
});

export const onPaymentWritten = onDocumentWritten('companies/{cid}/payments/{pid}', async (event) => {
  const before = event.data?.before.exists ? (event.data.before.data() as PaymentTransaction & { courtId?: string; sportId?: string }) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as PaymentTransaction & { courtId?: string; sportId?: string }) : null;
  if (!after || after.status !== 'succeeded' || before?.status === 'succeeded') return;
  const cid = event.params.cid;
  const company = (await db.collection('companies').doc(cid).get()).data() as Company | undefined;
  const date = todayIn(company?.timezone ?? 'UTC');
  const sign = after.type === 'refund' ? -1 : 1;
  const fields: Record<string, number> = {};
  if (after.type === 'charge') {
    fields.revenue = after.amount;
    fields[`byMethod.${statKey(after.paymentMethodId)}`] = after.amount;
    fields[`byCustomer.${statKey(after.customerUid)}`] = after.amount;
  } else {
    fields.refunds = after.amount;
    fields[`byCustomer.${statKey(after.customerUid)}`] = -after.amount;
  }
  if (after.courtId) fields[`byCourt.${statKey(after.courtId)}.revenue`] = sign * after.amount;
  if (after.sportId) fields[`bySport.${statKey(after.sportId)}.revenue`] = sign * after.amount;
  await bumpDaily(cid, date, fields);
  await bumpPlatform({ [`revenueByCurrency.${after.currency}`]: sign * after.amount });
});

export const onCreditTxnCreated = onDocumentCreated('companies/{cid}/creditTransactions/{tid}', async (event) => {
  const t = event.data?.data() as CreditTransaction | undefined;
  if (!t) return;
  const company = (await db.collection('companies').doc(event.params.cid).get()).data() as Company | undefined;
  const date = todayIn(company?.timezone ?? 'UTC');
  if (['award', 'promotion', 'loyalty'].includes(t.type)) await bumpDaily(event.params.cid, date, { creditsIssued: t.amount });
  if (t.type === 'redeem') await bumpDaily(event.params.cid, date, { creditsRedeemed: -t.amount });
  if (t.type === 'refund') await bumpDaily(event.params.cid, date, { creditsRedeemed: -t.amount });
});

export const onSubscriptionCreated = onDocumentCreated('companies/{cid}/subscriptions/{sid}', async (event) => {
  const company = (await db.collection('companies').doc(event.params.cid).get()).data() as Company | undefined;
  await bumpDaily(event.params.cid, todayIn(company?.timezone ?? 'UTC'), { newSubscriptions: 1 });
});

/** Lowercase tokens and prefixes for company search (Firestore has no full-text search). */
export function searchTokens(c: Pick<Company, 'name' | 'city' | 'countryCode'>): string[] {
  const words = `${c.name} ${c.city ?? ''}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const w of words) for (let i = 2; i <= Math.min(w.length, 12); i++) out.add(w.slice(0, i));
  if (c.countryCode) out.add(c.countryCode.toLowerCase());
  return [...out].slice(0, 100);
}

export const onCompanyWritten = onDocumentWritten('companies/{cid}', async (event) => {
  const after = event.data?.after.exists ? (event.data.after.data() as Company) : null;
  if (!after) return;
  const tokens = searchTokens(after);
  const same = after.searchTokens && after.searchTokens.length === tokens.length && after.searchTokens.every((t, i) => t === tokens[i]);
  if (!same) await event.data!.after.ref.update({ searchTokens: tokens });
});

/**
 * Audit trail for configuration that admins edit directly through Firestore (allowed by rules).
 * Writes made by Cloud Functions are skipped because those functions audit themselves.
 */
function auditDirectWrites(path: string, targetType: string, companyParam?: string) {
  return onDocumentWrittenWithAuthContext(path, async (event) => {
    if (event.authType === 'service_account' || event.authType === 'system') return;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    if (before && after && JSON.stringify({ ...before, updatedAt: null, searchTokens: null }) === JSON.stringify({ ...after, updatedAt: null, searchTokens: null })) return;
    const params = event.params as Record<string, string>;
    const targetId = Object.values(params).pop() ?? '';
    await db.collection('auditLogs').add(
      auditDoc({
        actorUid: event.authId ?? null,
        action: `${targetType}.${!before ? 'create' : !after ? 'delete' : 'update'}`,
        targetType,
        targetId,
        companyId: companyParam ? params[companyParam] : null,
        before,
        after,
        metadata: { path: event.document },
      }),
    );
  });
}

export const auditCountries = auditDirectWrites('countries/{id}', 'country');
export const auditSports = auditDirectWrites('sports/{id}', 'sport');
export const auditIdTypes = auditDirectWrites('identificationTypes/{id}', 'identificationType');
export const auditPaymentMethods = auditDirectWrites('paymentMethods/{id}', 'paymentMethod');
export const auditPlatformSettings = auditDirectWrites('platformSettings/{id}', 'platformSettings');
export const auditCompanyProfile = auditDirectWrites('companies/{cid}', 'companyProfile', 'cid');
export const auditCompanyPrivate = auditDirectWrites('companies/{cid}/private/{id}', 'companyPrivate', 'cid');
export const auditCompanySettings = auditDirectWrites('companies/{cid}/settings/{id}', 'companySettings', 'cid');
export const auditBlockedSlots = auditDirectWrites('companies/{cid}/blockedSlots/{id}', 'blockedSlot', 'cid');
export const auditServices = auditDirectWrites('companies/{cid}/services/{id}', 'service', 'cid');
