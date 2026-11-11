/** Scheduled maintenance: hold expiry, reminders, credit/membership/verification expiry, no-shows. */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { formatMinutes, todayIn, addDays, type Booking, type Subscription } from '@courtsync/shared';
import { db, FieldValue, Timestamp } from '../lib/firebase';
import { expireBooking } from '../booking/bookings';
import { releaseHold } from '../booking/locks';
import { notifyUser } from '../notifications/notify';
import { purgeVerification } from '../verification/verification';

export const sweepExpiredHolds = onSchedule({ schedule: 'every 5 minutes', timeoutSeconds: 300 }, async () => {
  const due = await db
    .collectionGroup('bookings')
    .where('status', 'in', ['pendingApproval', 'paymentPending'])
    .where('holdExpiresAt', '<=', Timestamp.now())
    .limit(300)
    .get();
  let n = 0;
  for (const d of due.docs) if (await expireBooking(d.ref.parent.parent!.id, d.id)) n++;
  if (n) logger.info(`expired ${n} booking holds`);
});

export const sendReminders = onSchedule({ schedule: 'every 60 minutes', timeoutSeconds: 300 }, async () => {
  const from = Timestamp.fromMillis(Date.now() + 23 * 3_600_000);
  const to = Timestamp.fromMillis(Date.now() + 24 * 3_600_000);
  const snap = await db.collectionGroup('bookings').where('status', '==', 'confirmed').where('startAt', '>=', from).where('startAt', '<', to).limit(1000).get();
  for (const d of snap.docs) {
    const b = d.data() as Booking & { reminderSent?: boolean };
    if (b.reminderSent) continue;
    await d.ref.update({ reminderSent: true });
    await notifyUser(b.customerUid, { title: 'Booking tomorrow', body: `${b.courtName} at ${formatMinutes(b.startMin)} on ${b.date}. Show your QR code at the desk.`, type: 'booking.reminder', link: `/bookings/${b.companyId}/${d.id}`, companyId: b.companyId }, ['inApp', 'push', 'email', 'sms']);
  }
});

export const dailyMaintenance = onSchedule({ schedule: 'every day 02:00', timeZone: 'UTC', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const now = Timestamp.now();

  // 1. Expire credit lots.
  const lots = await db.collectionGroup('creditLots').where('expiresAt', '<=', now).where('remaining', '>', 0).limit(2000).get();
  for (const lot of lots.docs) {
    const cid = lot.ref.parent.parent!.id;
    const uid = lot.get('uid') as string;
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(lot.ref);
      const remaining = fresh.get('remaining') as number;
      if (!remaining) return;
      const custRef = db.collection('companies').doc(cid).collection('customers').doc(uid);
      const balance = ((await tx.get(custRef)).get('creditBalance') as number) ?? 0;
      tx.update(lot.ref, { remaining: 0 });
      tx.update(custRef, { creditBalance: FieldValue.increment(-remaining) });
      tx.set(db.collection('companies').doc(cid).collection('creditTransactions').doc(), {
        uid, companyId: cid, type: 'expire', amount: -remaining, balanceAfter: balance - remaining, reason: 'Credits expired', referenceId: lot.id, by: null, at: FieldValue.serverTimestamp(),
      });
    });
  }

  // 2. Memberships: expire ended ones and remind those ending in 3 days.
  const today = new Date().toISOString().slice(0, 10);
  const ended = await db.collectionGroup('subscriptions').where('status', '==', 'active').where('endDate', '<', today).limit(2000).get();
  for (const s of ended.docs) {
    await s.ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() });
    const sub = s.data() as Subscription;
    await db.collection('companies').doc(sub.companyId).collection('services').doc(sub.serviceId).update({ enrolled: FieldValue.increment(-1) }).catch(() => null);
  }
  const soon = await db.collectionGroup('subscriptions').where('status', '==', 'active').where('endDate', '==', addDays(today, 3)).limit(2000).get();
  for (const s of soon.docs) {
    const sub = s.data() as Subscription;
    await notifyUser(sub.customerUid, { title: 'Membership ending soon', body: `${sub.serviceName} ends on ${sub.endDate}. Renew to keep your access.`, type: 'membership.expiring', link: '/memberships', companyId: sub.companyId });
  }

  // 3. Verifications whose documents expired.
  const vers = await db.collectionGroup('verifications').where('status', '==', 'verified').where('expiresOn', '<', today).limit(1000).get();
  for (const v of vers.docs) {
    const cid = v.ref.parent.parent!.id;
    await purgeVerification(cid, v.id, 'expired');
    await notifyUser(v.id, { title: 'Identity verification expired', body: 'One of your documents expired. Please submit a current one.', type: 'verification.updated', link: `/c/${cid}/verify`, companyId: cid });
  }

  // 4. Close out stale bookings: no-shows and forgotten check-outs.
  const cutoff = Timestamp.fromMillis(Date.now() - 6 * 3_600_000);
  const stale = await db.collectionGroup('bookings').where('status', 'in', ['confirmed', 'approved', 'checkedIn']).where('endAt', '<=', cutoff).limit(2000).get();
  for (const d of stale.docs) {
    const b = d.data() as Booking;
    const cid = d.ref.parent.parent!.id;
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(d.ref)).data() as Booking;
      if (fresh.status !== b.status) return;
      releaseHold(tx, cid, b.courtId, b.date, b.lockCells, d.id);
      const next = b.status === 'checkedIn' ? 'completed' : 'noShow';
      tx.update(d.ref, {
        status: next,
        ...(next === 'completed' ? { checkOut: { at: b.endAt, by: 'system', manual: true, durationMinutes: Math.round((b.endAt.toMillis() - (b.checkIn?.at.toMillis() ?? b.startAt.toMillis())) / 60_000), earlyMinutes: 0, overstayMinutes: 0 } } : {}),
        history: FieldValue.arrayUnion({ status: next, at: Timestamp.now(), by: null, note: 'Closed automatically' }),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  // 5. Old rate limit counters (also covered by a TTL policy when configured).
  const old = await db.collection('rateLimits').where('expireAt', '<=', now).limit(500).get();
  const batch = db.batch();
  old.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  logger.info('daily maintenance done', { lots: lots.size, ended: ended.size, verifications: vers.size, stale: stale.size, today: todayIn('UTC') });
});
