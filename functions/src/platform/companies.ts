import {
  createCompanySchema,
  companyStatusSchema,
  companyRestrictionsSchema,
  defaultCompanySettings,
  isValidTimezone,
  type Company,
  type Country,
  type Sport,
  type CompanyStatus,
} from '@courtsync/shared';
import { callable } from '../lib/callable';
import { db, FieldValue } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit, auditDoc } from '../lib/audit';
import { requireSuper, refs, loadCompany } from '../lib/authz';
import { bumpPlatform } from '../lib/stats';
import { slugify } from '../lib/tokens';
import { getOrCreateAccount } from '../company/accounts';
import { notifyCompany, notifyPlatform } from '../notifications/notify';

async function assertSportsAllowed(sportIds: string[]) {
  if (!sportIds.length) return;
  const snaps = await db.getAll(...sportIds.map((id) => db.collection('sports').doc(id)));
  const missing = snaps.filter((s) => !s.exists || !(s.data() as Sport).enabled).map((s) => s.id);
  if (missing.length) throw fail.invalid(`Unknown or disabled sports: ${missing.join(', ')}`);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'company';
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const clash = await db.collection('companies').where('slug', '==', slug).limit(1).get();
    if (clash.empty) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const createCompany = callable(
  'createCompany',
  createCompanySchema,
  async (input, caller) => {
    requireSuper(caller);
    const countrySnap = await db.collection('countries').doc(input.countryCode).get();
    const country = countrySnap.data() as Country | undefined;
    if (!country || !country.enabled) throw fail.invalid('That country is not enabled on CourtSync.');
    if (!isValidTimezone(input.timezone)) throw fail.invalid('Unknown time zone.');
    await assertSportsAllowed(input.allowedSportIds);

    const companyRef = db.collection('companies').doc();
    const account = await getOrCreateAccount(input.admin.email, input.admin.displayName, {
      subject: `You're the administrator of ${input.name} on CourtSync`,
      intro: `${input.name} has been set up on CourtSync and you are its company administrator.`,
    });

    const company: Omit<Company, 'createdAt' | 'updatedAt'> & Record<string, unknown> = {
      name: input.name,
      slug: await uniqueSlug(input.name),
      logoUrl: null,
      description: '',
      countryCode: country.code,
      currency: country.currency,
      timezone: input.timezone,
      city: input.city ?? '',
      status: 'active',
      statusReason: null,
      allowedSportIds: input.allowedSportIds,
      sportIds: [],
      contact: { email: input.contactEmail ?? input.admin.email, phone: input.contactPhone ?? '' },
      address: { city: input.city ?? '' },
      location: null,
      photoUrls: [],
      restrictions: { maxCourts: null, maxBranches: null, bookingsDisabled: false },
      subscription: { plan: input.plan, status: 'trial', renewsAt: null },
      stats: { courts: 0, customers: 0, bookings: 0, completedBookings: 0, branches: 1 },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(companyRef, company);
    batch.set(companyRef.collection('private').doc('profile'), {
      registration: {},
      verification: country.businessVerification.map((v) => ({ label: v.label, provided: false })),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(refs.settings(companyRef.id), { ...defaultCompanySettings(country.paymentMethodIds), updatedAt: FieldValue.serverTimestamp() });
    batch.set(companyRef.collection('branches').doc('main'), {
      name: 'Main branch',
      timezone: input.timezone,
      address: { city: input.city ?? '' },
      location: null,
      isPrimary: true,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(refs.staff(companyRef.id, account.uid), {
      uid: account.uid,
      role: 'owner',
      displayName: input.admin.displayName,
      email: input.admin.email,
      status: 'active',
      branchIds: [],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
    });
    batch.set(db.collection('auditLogs').doc(), auditDoc({
      actorUid: caller.uid,
      actorEmail: caller.email,
      action: 'company.create',
      targetType: 'company',
      targetId: companyRef.id,
      companyId: companyRef.id,
      after: { name: input.name, countryCode: input.countryCode, allowedSportIds: input.allowedSportIds, admin: input.admin.email },
    }));
    bumpPlatform({ companies: 1, activeCompanies: 1, branches: 1 }, batch);
    await batch.commit();

    await notifyPlatform({ title: 'New company', body: `${input.name} was created.`, type: 'company.created', link: `/admin/companies/${companyRef.id}` });
    return { companyId: companyRef.id, adminUid: account.uid, newAccount: account.created, inviteDelivered: account.delivered, inviteLink: account.link };
  },
  { rateLimit: 20 },
);

const STATUS_COUNTER: Partial<Record<CompanyStatus, string>> = { active: 'activeCompanies', suspended: 'suspendedCompanies' };

export const setCompanyStatus = callable('setCompanyStatus', companyStatusSchema, async ({ companyId, status, reason }, caller) => {
  requireSuper(caller);
  const ref = refs.company(companyId);
  const before = await db.runTransaction(async (tx) => {
    const company = await loadCompany(companyId, tx);
    if (company.status === 'disabled') throw fail.precondition('This company was permanently disabled and cannot be changed.');
    if (company.status === status) return company.status;
    if (status === 'disabled' && reason.trim().length < 3) throw fail.invalid('Give a reason for permanently disabling the company.');
    tx.update(ref, { status, statusReason: reason || null, updatedAt: FieldValue.serverTimestamp() });
    const counters: Record<string, number> = {};
    const from = STATUS_COUNTER[company.status];
    const to = STATUS_COUNTER[status];
    if (from) counters[from] = -1;
    if (to) counters[to] = (counters[to] ?? 0) + 1;
    bumpPlatform(counters, tx);
    return company.status;
  });
  if (before !== status) {
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'company.status', targetType: 'company', targetId: companyId, companyId, before: { status: before }, after: { status }, metadata: { reason } });
    const label = { active: 'reactivated', inactive: 'deactivated', suspended: 'suspended', disabled: 'permanently disabled' }[status];
    await notifyCompany(companyId, { title: `Company ${label}`, body: reason ? `Reason: ${reason}` : `Your company was ${label} by CourtSync.`, type: 'company.status', companyId }, ['owner', 'admin']);
    if (status === 'suspended' || status === 'disabled') {
      await notifyPlatform({ title: `Company ${label}`, body: reason || companyId, type: 'company.status', link: `/admin/companies/${companyId}` });
    }
  }
  return { ok: true, status };
});

export const updateCompanyRestrictions = callable('updateCompanyRestrictions', companyRestrictionsSchema, async (input, caller) => {
  requireSuper(caller);
  if (input.allowedSportIds) await assertSportsAllowed(input.allowedSportIds);
  const ref = refs.company(input.companyId);
  const result = await db.runTransaction(async (tx) => {
    const company = await loadCompany(input.companyId, tx);
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    let removedSports: string[] = [];
    if (input.allowedSportIds) {
      update.allowedSportIds = input.allowedSportIds;
      removedSports = company.allowedSportIds.filter((s) => !input.allowedSportIds!.includes(s));
    }
    if (input.restrictions) update.restrictions = { ...company.restrictions, ...input.restrictions };
    if (input.subscription) update.subscription = { ...company.subscription, ...input.subscription };
    tx.update(ref, update);
    return { company, removedSports };
  });

  // Courts for sports that are no longer allowed stop taking bookings.
  let closedCourts = 0;
  for (const sportId of result.removedSports) {
    const courts = await ref.collection('courts').where('sportId', '==', sportId).where('status', '==', 'active').get();
    for (const c of courts.docs) {
      await c.ref.update({ status: 'inactive', statusNote: 'Sport no longer permitted by CourtSync', updatedAt: FieldValue.serverTimestamp() });
      closedCourts++;
    }
  }
  await audit({
    actorUid: caller.uid,
    actorEmail: caller.email,
    action: 'company.restrictions',
    targetType: 'company',
    targetId: input.companyId,
    companyId: input.companyId,
    before: { allowedSportIds: result.company.allowedSportIds, restrictions: result.company.restrictions, subscription: result.company.subscription },
    after: { allowedSportIds: input.allowedSportIds, restrictions: input.restrictions, subscription: input.subscription },
    metadata: { closedCourts },
  });
  return { ok: true, closedCourts };
});
