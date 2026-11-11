import { staffInviteSchema, staffUpdateSchema, type StaffMember } from '@courtsync/shared';
import { callable } from '../lib/callable';
import { db, FieldValue } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, requireStaff } from '../lib/authz';
import { getOrCreateAccount } from './accounts';

export const addStaff = callable('addStaff', staffInviteSchema, async (input, caller) => {
  const ctx = await requireStaff(caller, input.companyId, 'staff.manage');
  if (input.role === 'owner' && !ctx.asSuper && ctx.staff?.role !== 'owner') throw fail.denied('Only owners can add owners.');
  const account = await getOrCreateAccount(input.email, input.displayName, {
    subject: `You've been added to ${ctx.company.name} on CourtSync`,
    intro: `You now have ${input.role} access to ${ctx.company.name} on CourtSync.`,
  });
  const ref = refs.staff(input.companyId, account.uid);
  const existing = await ref.get();
  if (existing.exists && (existing.data() as StaffMember).status === 'active') throw fail.exists('That person is already on the team.');
  await ref.set({
    uid: account.uid,
    role: input.role,
    displayName: input.displayName,
    email: input.email,
    status: 'active',
    branchIds: input.branchIds,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
  });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'staff.add', targetType: 'staff', targetId: account.uid, companyId: input.companyId, after: { role: input.role, email: input.email } });
  return { uid: account.uid, newAccount: account.created, inviteDelivered: account.delivered, inviteLink: account.link };
});

export const updateStaff = callable('updateStaff', staffUpdateSchema, async (input, caller) => {
  const ctx = await requireStaff(caller, input.companyId, 'staff.manage');
  const ref = refs.staff(input.companyId, input.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw fail.notFound('Staff member');
    const target = snap.data() as StaffMember;
    const actingOwner = ctx.asSuper || ctx.staff?.role === 'owner';
    if ((target.role === 'owner' || input.role === 'owner') && !actingOwner) throw fail.denied('Only owners can change owners.');
    if (input.uid === caller.uid && (input.remove || input.status === 'inactive' || input.status === 'suspended')) {
      throw fail.precondition('You cannot remove or deactivate yourself.');
    }
    const losingOwner = target.role === 'owner' && (input.remove || (input.role && input.role !== 'owner') || (input.status && input.status !== 'active'));
    if (losingOwner) {
      const owners = await tx.get(ref.parent.where('role', '==', 'owner').where('status', '==', 'active'));
      if (owners.size <= 1) throw fail.precondition('A company needs at least one active owner.');
    }
    if (input.remove) {
      tx.delete(ref);
    } else {
      const update: Record<string, unknown> = {};
      if (input.role) update.role = input.role;
      if (input.status) update.status = input.status;
      if (input.branchIds) update.branchIds = input.branchIds;
      tx.update(ref, update);
    }
    await audit(
      {
        actorUid: caller.uid,
        actorEmail: caller.email,
        action: input.remove ? 'staff.remove' : 'staff.update',
        targetType: 'staff',
        targetId: input.uid,
        companyId: input.companyId,
        before: { role: target.role, status: target.status, branchIds: target.branchIds },
        after: input.remove ? null : { role: input.role, status: input.status, branchIds: input.branchIds },
      },
      tx,
    );
  });
  return { ok: true };
});
