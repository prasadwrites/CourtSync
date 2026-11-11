import { z } from 'zod';
import { profileSchema, userRefSchema, userStatusSchema, superAdminGrantSchema, type UserProfile, type StaffMember, type Invitation } from '@courtsync/shared';
import { callable, type Caller } from '../lib/callable';
import { auth, db, FieldValue, Timestamp } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { requireSuper, refs } from '../lib/authz';
import { bumpPlatform } from '../lib/stats';
import { sendEmail } from '../notifications/notify';
import { emailConfigured } from '../notifications/channels';
import { joinCompanyInternal } from '../company/customers';

/**
 * Creates the universal profile on first sign-in, accepts pending invitations and
 * returns what the web app needs to route the user.
 */
export const ensureProfile = callable(
  'ensureProfile',
  profileSchema.partial(),
  async (input, caller) => {
    const record = await auth.getUser(caller.uid);
    const ref = refs.user(caller.uid);
    const created = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      const profile: Omit<UserProfile, 'createdAt' | 'updatedAt'> & Record<string, unknown> = {
        displayName: input.displayName || record.displayName || record.email?.split('@')[0] || record.phoneNumber || 'CourtSync user',
        email: record.email ?? null,
        phone: input.phone ?? record.phoneNumber ?? null,
        photoURL: record.photoURL ?? null,
        countryCode: input.countryCode ?? null,
        city: input.city ?? null,
        status: 'active',
        mustChangePassword: false,
        platformRole: caller.superAdmin ? 'superAdmin' : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(ref, profile);
      bumpPlatform({ users: 1 }, tx);
      return true;
    });

    // Keep email in sync if it changed in Auth (e.g. after verification).
    if (!created && record.email) {
      const current = (await ref.get()).data() as UserProfile;
      if (current.email !== record.email) await ref.update({ email: record.email, updatedAt: FieldValue.serverTimestamp() });
    }

    // Accept pending invitations addressed to this email or phone.
    const accepted: string[] = [];
    const lookups: [string, string | undefined | null][] = [
      ['email', record.email?.toLowerCase()],
      ['phone', record.phoneNumber],
    ];
    for (const [field, value] of lookups) {
      if (!value) continue;
      const invites = await db.collectionGroup('invitations').where(field, '==', value).where('status', '==', 'pending').limit(20).get();
      for (const inv of invites.docs) {
        const data = inv.data() as Invitation;
        try {
          await joinCompanyInternal(data.companyId, caller.uid, 'invite');
          await inv.ref.update({ status: 'accepted', acceptedBy: caller.uid, acceptedAt: FieldValue.serverTimestamp() });
          accepted.push(data.companyId);
        } catch {
          // The company may be suspended; leave the invitation pending.
        }
      }
    }

    const profile = (await ref.get()).data() as UserProfile;
    if (profile.status !== 'active') throw fail.denied('This account has been deactivated. Contact support.');
    const staffSnap = await db.collectionGroup('staff').where('uid', '==', caller.uid).where('status', '==', 'active').get();
    const staffOf = await Promise.all(
      staffSnap.docs.map(async (d) => {
        const cid = d.ref.parent.parent!.id;
        const company = (await refs.company(cid).get()).data();
        return { companyId: cid, role: (d.data() as StaffMember).role, companyName: company?.name ?? cid, companyStatus: company?.status ?? 'unknown' };
      }),
    );
    return { created, acceptedInvitations: accepted, superAdmin: caller.superAdmin, staffOf, mustChangePassword: !!profile.mustChangePassword };
  },
  { rateLimit: 30 },
);

/** Whether the caller may manage another person's credentials. */
async function assertCredentialAuthority(caller: Caller, uid: string, companyId?: string) {
  if (caller.superAdmin) return;
  if (!companyId) throw fail.denied();
  const me = (await refs.staff(companyId, caller.uid).get()).data() as StaffMember | undefined;
  if (!me || me.status !== 'active' || !['owner', 'admin'].includes(me.role)) throw fail.denied();
  // Company admins can reset passwords for their own staff only. Customer accounts are shared
  // across companies, so customers reset their own passwords.
  const target = (await refs.staff(companyId, uid).get()).data() as StaffMember | undefined;
  if (!target) throw fail.denied('Company admins can only reset passwords for their own staff.');
  if (target.role === 'owner' && me.role !== 'owner') throw fail.denied();
}

/**
 * Sends a Firebase password reset email. Existing passwords are never readable by anyone.
 * When no email provider is configured the link is returned so the admin can deliver it securely.
 */
export const sendPasswordReset = callable(
  'sendPasswordReset',
  userRefSchema,
  async ({ uid, companyId }, caller) => {
    await assertCredentialAuthority(caller, uid, companyId);
    const user = await auth.getUser(uid);
    if (!user.email) throw fail.precondition('This account has no email address. It signs in with a phone number.');
    const link = await auth.generatePasswordResetLink(user.email, { url: `${process.env.APP_URL ?? 'http://localhost:5173'}/login` });
    const delivered = await sendEmail(
      user.email,
      'Reset your CourtSync password',
      `A CourtSync administrator started a password reset for your account.\n\nSet a new password here:\n${link}\n\nIf you did not expect this, contact your administrator.`,
    );
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'user.passwordResetSent', targetType: 'user', targetId: uid, companyId: companyId ?? null });
    return { delivered, link: delivered ? null : link };
  },
  { rateLimit: 10 },
);

/** Requires a password change at next sign-in and signs the user out everywhere. */
export const forcePasswordReset = callable(
  'forcePasswordReset',
  userRefSchema,
  async ({ uid, companyId }, caller) => {
    await assertCredentialAuthority(caller, uid, companyId);
    await auth.revokeRefreshTokens(uid);
    const user = await auth.getUser(uid);
    const validAfter = new Date(user.tokensValidAfterTime ?? Date.now()).getTime();
    await refs.user(uid).set(
      { mustChangePassword: true, mustChangePasswordAt: Timestamp.fromMillis(validAfter + 1000), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'user.forcePasswordReset', targetType: 'user', targetId: uid, companyId: companyId ?? null });
    return { ok: true };
  },
  { rateLimit: 10 },
);

/** Clears the forced-change flag once the user has actually changed their password. */
export const confirmPasswordChanged = callable('confirmPasswordChanged', z.object({}), async (_input, caller) => {
  const user = await auth.getUser(caller.uid);
  const profile = (await refs.user(caller.uid).get()).data() as (UserProfile & { mustChangePasswordAt?: Timestamp }) | undefined;
  if (!profile?.mustChangePassword) return { ok: true };
  const changedAt = new Date(user.tokensValidAfterTime ?? 0).getTime();
  const requiredAfter = profile.mustChangePasswordAt?.toMillis() ?? 0;
  if (changedAt < requiredAfter) throw fail.precondition('Please set a new password first.');
  await refs.user(caller.uid).update({ mustChangePassword: false, mustChangePasswordAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'user.passwordChanged', targetType: 'user', targetId: caller.uid });
  return { ok: true };
});

/** Super Admin: activate, deactivate or suspend a universal account. */
export const setUserStatus = callable(
  'setUserStatus',
  userStatusSchema,
  async ({ uid, status, reason }, caller) => {
    requireSuper(caller);
    if (uid === caller.uid) throw fail.precondition('You cannot change your own account status.');
    const before = (await refs.user(uid).get()).data();
    await auth.updateUser(uid, { disabled: status !== 'active' });
    if (status !== 'active') await auth.revokeRefreshTokens(uid);
    await refs.user(uid).set({ status, statusReason: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'user.status', targetType: 'user', targetId: uid, before: { status: before?.status }, after: { status }, metadata: { reason } });
    return { ok: true };
  },
);

/** Super Admin: grant or revoke the platform administrator role. */
export const setSuperAdmin = callable('setSuperAdmin', superAdminGrantSchema, async ({ email, enabled }, caller) => {
  requireSuper(caller);
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) throw fail.notFound('A user with that email');
  if (user.uid === caller.uid && !enabled) throw fail.precondition('You cannot remove your own Super Admin access.');
  const claims = { ...(user.customClaims ?? {}), superAdmin: enabled };
  if (!enabled) delete (claims as Record<string, unknown>).superAdmin;
  await auth.setCustomUserClaims(user.uid, claims);
  await auth.revokeRefreshTokens(user.uid);
  await refs.user(user.uid).set({ platformRole: enabled ? 'superAdmin' : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: enabled ? 'superAdmin.grant' : 'superAdmin.revoke', targetType: 'user', targetId: user.uid, metadata: { email } });
  return { ok: true, uid: user.uid };
});

/** Super Admin: search accounts by email or phone. */
export const findUser = callable('findUser', z.object({ query: z.string().trim().min(3).max(254) }), async ({ query }, caller) => {
  requireSuper(caller);
  const record = query.includes('@')
    ? await auth.getUserByEmail(query.toLowerCase()).catch(() => null)
    : query.startsWith('+')
      ? await auth.getUserByPhoneNumber(query).catch(() => null)
      : await auth.getUser(query).catch(() => null);
  if (!record) return { user: null };
  const profile = (await refs.user(record.uid).get()).data() ?? null;
  return {
    user: {
      uid: record.uid,
      email: record.email ?? null,
      phone: record.phoneNumber ?? null,
      displayName: record.displayName ?? profile?.displayName ?? null,
      disabled: record.disabled,
      superAdmin: record.customClaims?.superAdmin === true,
      lastSignIn: record.metadata.lastSignInTime ?? null,
      created: record.metadata.creationTime,
      providers: record.providerData.map((p) => p.providerId),
      profile,
    },
  };
});

export const emailStatus = callable('emailStatus', z.object({}), async (_i, caller) => {
  requireSuper(caller);
  return { configured: await emailConfigured() };
});
