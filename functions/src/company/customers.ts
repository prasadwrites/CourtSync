import { z } from 'zod';
import {
  joinCompanySchema,
  createCustomerSchema,
  updateCustomerSchema,
  todayIn,
  type Company,
  type UserProfile,
} from '@courtsync/shared';
import { callable } from '../lib/callable';
import { auth, db, FieldValue } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, requireStaff } from '../lib/authz';
import { bumpDaily } from '../lib/stats';
import { getOrCreateAccount } from './accounts';
import { notifyCompany, sendEmail } from '../notifications/notify';

/** Links a universal account to a company. Idempotent. */
export async function joinCompanyInternal(companyId: string, uid: string, via: 'self' | 'invite' | 'staff'): Promise<boolean> {
  const created = await db.runTransaction(async (tx) => {
    const companySnap = await tx.get(refs.company(companyId));
    const company = companySnap.data() as Company | undefined;
    if (!company) throw fail.notFound('Company');
    if (company.status !== 'active' && via === 'self') throw fail.precondition('This facility is not accepting new customers right now.');
    const ref = refs.customer(companyId, uid);
    const existing = await tx.get(ref);
    if (existing.exists) return false;
    const profile = (await tx.get(refs.user(uid))).data() as UserProfile | undefined;
    const record = profile ? null : await auth.getUser(uid);
    tx.set(ref, {
      uid,
      companyId,
      companyName: company.name,
      displayName: profile?.displayName ?? record?.displayName ?? record?.email ?? record?.phoneNumber ?? 'Customer',
      email: profile?.email ?? record?.email ?? null,
      phone: profile?.phone ?? record?.phoneNumber ?? null,
      status: 'active',
      verificationStatus: 'notSubmitted',
      creditBalance: 0,
      bookingsCount: 0,
      joinedVia: via,
      joinedAt: FieldValue.serverTimestamp(),
      tags: [],
    });
    tx.update(refs.company(companyId), { 'stats.customers': FieldValue.increment(1) });
    return { name: company.name, timezone: company.timezone, displayName: profile?.displayName ?? 'A customer' };
  });
  if (created) {
    await bumpDaily(companyId, todayIn(created.timezone), { newCustomers: 1 });
    await notifyCompany(companyId, { title: 'New customer', body: `${created.displayName} joined ${created.name}.`, type: 'customer.joined', link: `/manage/${companyId}/customers/${uid}`, companyId });
  }
  return !!created;
}

export const joinCompany = callable('joinCompany', joinCompanySchema, async ({ companyId }, caller) => {
  const profile = await refs.user(caller.uid).get();
  if (!profile.exists) throw fail.precondition('Finish setting up your profile first.');
  const created = await joinCompanyInternal(companyId, caller.uid, 'self');
  return { joined: true, created };
});

export const createCustomer = callable(
  'createCustomer',
  createCustomerSchema,
  async (input, caller) => {
    const ctx = await requireStaff(caller, input.companyId, 'customers.manage');
    let uid: string;
    let inviteLink: string | null = null;
    let delivered = false;
    if (input.email) {
      const account = await getOrCreateAccount(input.email, input.displayName, {
        subject: `${ctx.company.name} invited you to CourtSync`,
        intro: `${ctx.company.name} added you as a customer on CourtSync, where you can book courts and manage memberships.`,
      });
      uid = account.uid;
      inviteLink = account.link;
      delivered = account.delivered;
    } else {
      const existing = await auth.getUserByPhoneNumber(input.phone!).catch(() => null);
      uid = existing?.uid ?? (await auth.createUser({ phoneNumber: input.phone!, displayName: input.displayName })).uid;
    }
    const userRef = refs.user(uid);
    if (!(await userRef.get()).exists) {
      await userRef.set({
        displayName: input.displayName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        photoURL: null,
        countryCode: ctx.company.countryCode,
        city: null,
        status: 'active',
        mustChangePassword: false,
        platformRole: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('platformStats').doc('summary').set({ users: FieldValue.increment(1) }, { merge: true });
    }
    const created = await joinCompanyInternal(input.companyId, uid, 'staff');
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'customer.create', targetType: 'customer', targetId: uid, companyId: input.companyId, after: { displayName: input.displayName, email: input.email, phone: input.phone } });
    return { uid, alreadyCustomer: !created, inviteDelivered: delivered, inviteLink };
  },
  { rateLimit: 30 },
);

/** Invites someone without creating an account. The invitation is accepted when they sign up. */
export const inviteCustomer = callable(
  'inviteCustomer',
  z.object({
    companyId: z.string().min(1),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/).optional(),
    displayName: z.string().trim().max(200).optional(),
  }).refine((v) => v.email || v.phone, 'Provide an email or a phone number'),
  async (input, caller) => {
    const ctx = await requireStaff(caller, input.companyId, 'customers.manage');
    const ref = refs.company(input.companyId).collection('invitations').doc();
    await ref.set({
      companyId: input.companyId,
      companyName: ctx.company.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      displayName: input.displayName ?? '',
      status: 'pending',
      createdBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    let delivered = false;
    if (input.email) {
      delivered = await sendEmail(
        input.email,
        `${ctx.company.name} invited you to CourtSync`,
        `${ctx.company.name} invited you to book courts on CourtSync.\n\nCreate your account with this email address at ${process.env.APP_URL ?? 'http://localhost:5173'}/register and you'll be connected automatically.`,
      );
    }
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'customer.invite', targetType: 'invitation', targetId: ref.id, companyId: input.companyId, after: { email: input.email, phone: input.phone } });
    return { invitationId: ref.id, delivered };
  },
  { rateLimit: 30 },
);

export const updateCustomer = callable('updateCustomer', updateCustomerSchema, async (input, caller) => {
  await requireStaff(caller, input.companyId, 'customers.manage');
  const ref = refs.customer(input.companyId, input.uid);
  const snap = await ref.get();
  if (!snap.exists) throw fail.notFound('Customer');
  const update: Record<string, unknown> = {};
  if (input.status) update.status = input.status;
  if (input.notes !== undefined) update.notes = input.notes;
  if (input.tags) update.tags = input.tags;
  await ref.update(update);
  await audit({
    actorUid: caller.uid,
    actorEmail: caller.email,
    action: 'customer.update',
    targetType: 'customer',
    targetId: input.uid,
    companyId: input.companyId,
    before: { status: snap.get('status') },
    after: update,
  });
  return { ok: true };
});
