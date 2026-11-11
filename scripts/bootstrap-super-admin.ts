/**
 * Grants the first Super Admin. Later super admins are managed from the Users page.
 *
 *   npm run bootstrap:superadmin -- --project courtsync-babfe --email you@example.com
 *
 * The account must already exist (sign up in the app first). Uses Application Default
 * Credentials (`gcloud auth application-default login`) or GOOGLE_APPLICATION_CREDENTIALS.
 * No password is read, set or printed.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const project = arg('project');
const email = arg('email')?.trim().toLowerCase();
const revoke = args.includes('--revoke');
if (!project || !email) {
  console.error('Usage: npm run bootstrap:superadmin -- --project <project-id> --email <email> [--revoke]');
  process.exit(1);
}
if (project.startsWith('demo-')) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}
initializeApp({ projectId: project });

(async () => {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) throw new Error(`No account uses ${email}. Sign up in the app first, then run this again.`);
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), superAdmin: !revoke });
  await getFirestore().collection('users').doc(user.uid).set({ platformRole: revoke ? null : 'superAdmin', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await getFirestore().collection('auditLogs').add({
    actorUid: null, actorEmail: 'bootstrap-script', action: revoke ? 'user.superAdminRevoked' : 'user.superAdminGranted',
    targetType: 'user', targetId: user.uid, companyId: null, metadata: { email, via: 'bootstrap-super-admin' }, at: FieldValue.serverTimestamp(),
  });
  console.log(`${email} ${revoke ? 'is no longer' : 'is now'} a super admin on ${project}. They must sign out and back in.`);
  process.exit(0);
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
