/**
 * Notification dispatcher. Writes in-app notifications and fans out to push, email and SMS.
 * Delivery failures are logged and never fail the business operation that triggered them.
 */
import { logger } from 'firebase-functions/v2';
import type { NotificationChannel, UserProfile } from '@courtsync/shared';
import { db, FieldValue, messaging } from '../lib/firebase';
import { emailProvider, smsProvider } from './channels';

export interface NotificationInput {
  title: string;
  body: string;
  type: string;
  link?: string | null;
  companyId?: string | null;
}

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

async function pushTo(uids: string[], n: NotificationInput) {
  const tokens: { uid: string; token: string }[] = [];
  for (const uid of uids) {
    const snap = await db.collection('users').doc(uid).collection('fcmTokens').limit(10).get();
    snap.forEach((d) => tokens.push({ uid, token: d.id }));
  }
  if (!tokens.length) return;
  const res = await messaging().sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title: n.title, body: n.body },
    webpush: n.link ? { fcmOptions: { link: `${appUrl()}${n.link}` } } : undefined,
    data: { type: n.type, link: n.link ?? '' },
  });
  // Remove tokens that are no longer registered.
  await Promise.all(
    res.responses.map((r, i) =>
      !r.success && r.error?.code === 'messaging/registration-token-not-registered'
        ? db.collection('users').doc(tokens[i].uid).collection('fcmTokens').doc(tokens[i].token).delete()
        : null,
    ),
  );
}

async function safe(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    logger.warn(`notification channel ${label} failed`, err);
  }
}

/** Notify one universal user account (customer or staff member). */
export async function notifyUser(
  uid: string,
  n: NotificationInput,
  channels: NotificationChannel[] = ['inApp', 'push', 'email'],
): Promise<void> {
  if (channels.includes('inApp')) {
    await db.collection('users').doc(uid).collection('notifications').add({
      ...n,
      link: n.link ?? null,
      companyId: n.companyId ?? null,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  const needProfile = channels.includes('email') || channels.includes('sms');
  const profile = needProfile ? ((await db.collection('users').doc(uid).get()).data() as UserProfile | undefined) : undefined;
  await Promise.all([
    channels.includes('push') ? safe('push', () => pushTo([uid], n)) : null,
    channels.includes('email') && profile?.email
      ? safe('email', async () =>
          (await emailProvider()).send({
            to: profile.email!,
            subject: n.title,
            text: `${n.body}${n.link ? `\n\n${appUrl()}${n.link}` : ''}`,
          }),
        )
      : null,
    channels.includes('sms') && profile?.phone
      ? safe('sms', async () => (await smsProvider()).send({ to: profile.phone!, body: `${n.title}: ${n.body}` }))
      : null,
  ]);
}

/** Notify a company's staff inbox and push to active staff with the given roles. */
export async function notifyCompany(companyId: string, n: NotificationInput, roles = ['owner', 'admin', 'manager']): Promise<void> {
  await db.collection('companies').doc(companyId).collection('notifications').add({
    ...n,
    link: n.link ?? null,
    companyId,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  const staff = await db
    .collection('companies')
    .doc(companyId)
    .collection('staff')
    .where('status', '==', 'active')
    .where('role', 'in', roles)
    .limit(50)
    .get();
  await safe('push', () => pushTo(staff.docs.map((d) => d.id), n));
}

export async function notifyPlatform(n: NotificationInput): Promise<void> {
  await db.collection('platformNotifications').add({
    ...n,
    link: n.link ?? null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Sends a one-off email, e.g. account invitations. Returns false when only logged. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const provider = await emailProvider();
  await provider.send({ to, subject, text });
  return provider.id !== 'log';
}
