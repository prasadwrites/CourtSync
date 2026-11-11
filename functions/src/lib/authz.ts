import type { Transaction, DocumentReference } from 'firebase-admin/firestore';
import { roleCan, type Company, type CompanySettings, type Permission, type StaffMember, defaultCompanySettings } from '@courtsync/shared';
import { db } from './firebase';
import { fail } from './errors';
import type { Caller } from './callable';

export const refs = {
  company: (cid: string) => db.collection('companies').doc(cid),
  settings: (cid: string) => db.collection('companies').doc(cid).collection('settings').doc('general'),
  staff: (cid: string, uid: string) => db.collection('companies').doc(cid).collection('staff').doc(uid),
  customer: (cid: string, uid: string) => db.collection('companies').doc(cid).collection('customers').doc(uid),
  court: (cid: string, courtId: string) => db.collection('companies').doc(cid).collection('courts').doc(courtId),
  branch: (cid: string, branchId: string) => db.collection('companies').doc(cid).collection('branches').doc(branchId),
  booking: (cid: string, id: string) => db.collection('companies').doc(cid).collection('bookings').doc(id),
  user: (uid: string) => db.collection('users').doc(uid),
};

async function read<T>(ref: DocumentReference, tx?: Transaction): Promise<T | null> {
  const snap = tx ? await tx.get(ref) : await ref.get();
  return snap.exists ? (snap.data() as T) : null;
}

export function requireSuper(caller: Caller): void {
  if (!caller.superAdmin) throw fail.denied('Only CourtSync platform administrators can do that.');
}

export async function loadCompany(cid: string, tx?: Transaction): Promise<Company> {
  const company = await read<Company>(refs.company(cid), tx);
  if (!company) throw fail.notFound('Company');
  return company;
}

export async function loadSettings(cid: string, tx?: Transaction): Promise<CompanySettings> {
  const s = await read<CompanySettings>(refs.settings(cid), tx);
  const defaults = defaultCompanySettings([]);
  return {
    ...defaults,
    ...s,
    booking: { ...defaults.booking, ...(s?.booking ?? {}) },
    credits: { ...defaults.credits, ...(s?.credits ?? {}) },
    verification: { ...defaults.verification, ...(s?.verification ?? {}) },
  };
}

/** Company must be operating for anything customer-facing. */
export function assertCompanyOpen(company: Company): void {
  if (company.status !== 'active') throw fail.precondition('This facility is not accepting bookings right now.');
}

export interface StaffContext {
  company: Company;
  staff: StaffMember | null;
  /** True when a Super Admin acts on the company. */
  asSuper: boolean;
}

/**
 * Resolves the caller's staff membership and checks a permission.
 * Super Admins pass every check. Suspended and disabled companies block staff writes.
 */
export async function requireStaff(
  caller: Caller,
  cid: string,
  permission: Permission,
  opts: { tx?: Transaction; allowWhileSuspended?: boolean } = {},
): Promise<StaffContext> {
  const company = await loadCompany(cid, opts.tx);
  if (caller.superAdmin) return { company, staff: null, asSuper: true };
  const staff = await read<StaffMember>(refs.staff(cid, caller.uid), opts.tx);
  if (!staff || staff.status !== 'active') throw fail.denied();
  if (!roleCan(staff.role, permission)) throw fail.denied();
  if (!opts.allowWhileSuspended && !['active', 'inactive'].includes(company.status)) {
    throw fail.precondition(`This company is ${company.status}. Contact CourtSync support.`);
  }
  return { company, staff, asSuper: false };
}

/** Branch-scoped staff can only act on their branches. */
export function assertBranchAccess(ctx: StaffContext, branchId: string): void {
  if (ctx.asSuper || !ctx.staff || ctx.staff.branchIds.length === 0) return;
  if (!ctx.staff.branchIds.includes(branchId)) throw fail.denied('You do not have access to this branch.');
}
