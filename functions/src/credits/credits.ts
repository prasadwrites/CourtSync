import { adjustCreditsSchema, type CompanyCustomer } from '@courtsync/shared';
import { callable } from '../lib/callable';
import { db, Timestamp } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, requireStaff, loadSettings } from '../lib/authz';
import { addCredits, planRedemption, applyRedemption } from './ledger';
import { notifyUser } from '../notifications/notify';

export const adjustCredits = callable('adjustCredits', adjustCreditsSchema, async (input, caller) => {
  const ctx = await requireStaff(caller, input.companyId, 'credits.manage');
  const settings = await loadSettings(input.companyId);
  if (!settings.credits.enabled) throw fail.precondition('Turn on credits in Settings first.');
  const custRef = refs.customer(input.companyId, input.uid);
  const balanceAfter = await db.runTransaction(async (tx) => {
    const snap = await tx.get(custRef);
    if (!snap.exists) throw fail.notFound('Customer');
    const c = snap.data() as CompanyCustomer;
    const balance = c.creditBalance ?? 0;
    if (input.type === 'deduct') {
      if (input.amount > balance) throw fail.precondition(`The customer only has ${balance} credits.`);
      const plan = await planRedemption(tx, input.companyId, input.uid, input.amount, balance);
      applyRedemption(tx, plan, input.reason, '', caller.uid, 'deduct');
      return balance - input.amount;
    }
    const days = input.expiresInDays === undefined ? settings.credits.defaultExpiryDays : input.expiresInDays;
    const expiresAt = days ? Timestamp.fromMillis(Date.now() + days * 86_400_000) : null;
    addCredits(tx, input.companyId, input.uid, input.amount, balance, input.type, input.reason, expiresAt, caller.uid);
    return balance + input.amount;
  });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: `credits.${input.type}`, targetType: 'customer', targetId: input.uid, companyId: input.companyId, after: { amount: input.amount, balanceAfter }, metadata: { reason: input.reason } });
  await notifyUser(input.uid, {
    title: input.type === 'deduct' ? 'Credits deducted' : 'Credits awarded',
    body: `${input.type === 'deduct' ? '-' : '+'}${input.amount} credits at ${ctx.company.name}. ${input.reason}`,
    type: input.type === 'deduct' ? 'credits.deducted' : 'credits.awarded',
    link: '/credits',
    companyId: input.companyId,
  });
  return { balance: balanceAfter };
});
