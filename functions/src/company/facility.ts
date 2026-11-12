import { z } from 'zod';
import { branchSchema, courtSchema, type Branch, type Court, type Sport } from '@courtsync/shared';
import { callable } from '../lib/callable';
import { db, FieldValue } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, requireStaff, assertBranchAccess } from '../lib/authz';
import { bumpPlatform } from '../lib/stats';

const idRe = /^[A-Za-z0-9_-]+$/;

export const upsertBranch = callable(
  'upsertBranch',
  z.object({ companyId: z.string().regex(idRe), branchId: z.string().regex(idRe).optional(), branch: branchSchema }),
  async ({ companyId, branchId, branch }, caller) => {
    const ctx = await requireStaff(caller, companyId, 'branches.manage');
    const companyRef = refs.company(companyId);
    const id = await db.runTransaction(async (tx) => {
      if (branchId) {
        const ref = refs.branch(companyId, branchId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw fail.notFound('Branch');
        const before = snap.data() as Branch;
        if (before.isPrimary && !branch.active) throw fail.precondition('The primary branch cannot be deactivated.');
        tx.update(ref, { ...branch, updatedAt: FieldValue.serverTimestamp() });
        await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'branch.update', targetType: 'branch', targetId: branchId, companyId, before, after: branch }, tx);
        return branchId;
      }
      const max = ctx.company.restrictions?.maxBranches;
      if (max != null && (ctx.company.stats?.branches ?? 0) >= max) {
        throw fail.precondition(`Your plan allows ${max} branches. Contact CourtSync to raise the limit.`);
      }
      const ref = companyRef.collection('branches').doc();
      tx.set(ref, { ...branch, isPrimary: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(companyRef, { 'stats.branches': FieldValue.increment(1) });
      bumpPlatform({ branches: 1 }, tx);
      await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'branch.create', targetType: 'branch', targetId: ref.id, companyId, after: branch }, tx);
      return ref.id;
    });
    return { branchId: id };
  },
);

export const upsertCourt = callable(
  'upsertCourt',
  z.object({ companyId: z.string().regex(idRe), courtId: z.string().regex(idRe).nullish(), court: courtSchema }),
  async ({ companyId, courtId, court }, caller) => {
    const ctx = await requireStaff(caller, companyId, 'courts.manage');
    assertBranchAccess(ctx, court.branchId);
    if (!ctx.company.allowedSportIds.includes(court.sportId)) {
      throw fail.denied('Your company is not permitted to create courts for this sport. Contact CourtSync.');
    }
    const sport = (await db.collection('sports').doc(court.sportId).get()).data() as Sport | undefined;
    if (!sport?.enabled) throw fail.invalid('That sport is not available.');
    const branchSnap = await refs.branch(companyId, court.branchId).get();
    if (!branchSnap.exists) throw fail.notFound('Branch');
    const branch = branchSnap.data() as Branch;
    // Courts always use their branch's time zone so calendars agree.
    const data = { ...court, timezone: branch.timezone, updatedAt: FieldValue.serverTimestamp() };
    const companyRef = refs.company(companyId);

    const id = await db.runTransaction(async (tx) => {
      let ref;
      let before: Court | null = null;
      if (courtId) {
        ref = refs.court(companyId, courtId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw fail.notFound('Court');
        before = snap.data() as Court;
        assertBranchAccess(ctx, before.branchId);
        tx.update(ref, data);
      } else {
        const max = ctx.company.restrictions?.maxCourts;
        if (max != null && (ctx.company.stats?.courts ?? 0) >= max) {
          throw fail.precondition(`Your plan allows ${max} courts. Contact CourtSync to raise the limit.`);
        }
        ref = companyRef.collection('courts').doc();
        tx.set(ref, { ...data, createdAt: FieldValue.serverTimestamp() });
        tx.update(companyRef, { 'stats.courts': FieldValue.increment(1) });
        bumpPlatform({ courts: 1 }, tx);
      }
      if (!ctx.company.sportIds.includes(court.sportId)) {
        tx.update(companyRef, { sportIds: FieldValue.arrayUnion(court.sportId) });
      }
      await audit(
        {
          actorUid: caller.uid,
          actorEmail: caller.email,
          action: courtId ? 'court.update' : 'court.create',
          targetType: 'court',
          targetId: ref.id,
          companyId,
          before: before ? { name: before.name, status: before.status, pricing: before.pricing, bookingModel: before.bookingModel } : null,
          after: { name: court.name, status: court.status, pricing: court.pricing, bookingModel: court.bookingModel },
        },
        tx,
      );
      return ref.id;
    });

    // Drop sports from discovery when their last court moves to another sport.
    if (courtId) {
      const remaining = await companyRef.collection('courts').select('sportId').get();
      const sportIds = [...new Set(remaining.docs.map((d) => d.get('sportId') as string))];
      await companyRef.update({ sportIds });
    }
    return { courtId: id };
  },
);
