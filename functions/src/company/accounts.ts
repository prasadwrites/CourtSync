import { auth } from '../lib/firebase';
import { randomPassword } from '../lib/tokens';
import { sendEmail } from '../notifications/notify';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

/**
 * Finds the universal account for an email or creates one with an unusable random password.
 * New accounts get a "set your password" link (Firebase password reset), so nobody ever
 * sees or chooses a password on someone else's behalf.
 */
export async function getOrCreateAccount(
  email: string,
  displayName: string,
  invite: { subject: string; intro: string },
): Promise<{ uid: string; created: boolean; delivered: boolean; link: string | null }> {
  const existing = await auth.getUserByEmail(email).catch(() => null);
  if (existing) {
    const delivered = await sendEmail(email, invite.subject, `${invite.intro}\n\nSign in at ${appUrl()}/login with your existing CourtSync account.`);
    return { uid: existing.uid, created: false, delivered, link: null };
  }
  const user = await auth.createUser({ email, displayName, password: randomPassword(), emailVerified: false });
  const link = await auth.generatePasswordResetLink(email, { url: `${appUrl()}/login` });
  const delivered = await sendEmail(
    email,
    invite.subject,
    `${invite.intro}\n\nSet your password to activate your CourtSync account:\n${link}\n\nThe link expires after a while. If it does, use "Forgot password" on the sign-in page.`,
  );
  return { uid: user.uid, created: true, delivered, link: delivered ? null : link };
}
