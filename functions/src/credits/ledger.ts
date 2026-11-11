/**
 * Company-scoped credit ledger. Balances live on companies/{cid}/customers/{uid}.creditBalance,
 * backed by creditLots (for expiry) and an append-only creditTransactions log.
 * Every change runs inside a Firestore transaction; customers can never write any of it.
 */
import type { Transaction } from 'firebase-admin/firestore';
import { consumeLots, type CreditTxnType } from '@courtsync/shared';
import { db, FieldValue, Timestamp } from '../lib/firebase';
import { fail } from '../lib/errors';
import { refs } from '../lib/authz';

const lotsCol = (cid: string) => refs.company(cid).collection('creditLots');
const txnCol = (cid: string) => refs.company(cid).collection('creditTransactions');

export interface RedemptionPlan {
  cid: string;
  uid: string;
  amount: number;
  balance: number;
  takes: { id: string; take: number }[];
}

/** Reads phase: plan which lots to consume. Call before any writes in the transaction. */
export async function planRedemption(tx: Transaction, cid: string, uid: string, amount: number, balance: number): Promise<RedemptionPlan> {
  if (amount <= 0) return { cid, uid, amount: 0, balance, takes: [] };
  const lots = await tx.get(lotsCol(cid).where('uid', '==', uid).where('remaining', '>', 0));
  try {
    const takes = consumeLots(
      lots.docs.map((d) => ({ id: d.id, remaining: d.get('remaining') as number, expiresAtMs: (d.get('expiresAt') as Timestamp | null)?.toMillis() ?? null })),
      amount,
      Date.now(),
    );
    return { cid, uid, amount, balance, takes };
  } catch {
    throw fail.precondition('Not enough credits.');
  }
}

/** Writes phase for a redemption. */
export function applyRedemption(tx: Transaction, plan: RedemptionPlan, reason: string, referenceId: string, by: string, type: 'redeem' | 'deduct' = 'redeem') {
  if (plan.amount <= 0) return;
  for (const t of plan.takes) tx.update(lotsCol(plan.cid).doc(t.id), { remaining: FieldValue.increment(-t.take) });
  tx.update(refs.customer(plan.cid, plan.uid), { creditBalance: FieldValue.increment(-plan.amount) });
  tx.set(txnCol(plan.cid).doc(), {
    uid: plan.uid,
    companyId: plan.cid,
    type,
    amount: -plan.amount,
    balanceAfter: plan.balance - plan.amount,
    reason,
    referenceId,
    by,
    at: FieldValue.serverTimestamp(),
  });
}

/** Puts consumed credits back into the lots they came from (write-only). */
export function restoreCredits(
  tx: Transaction,
  cid: string,
  uid: string,
  takes: { id: string; take: number }[],
  balance: number,
  reason: string,
  referenceId: string,
  by: string | null,
) {
  const total = takes.reduce((s, t) => s + t.take, 0);
  if (total <= 0) return 0;
  for (const t of takes) tx.update(lotsCol(cid).doc(t.id), { remaining: FieldValue.increment(t.take) });
  tx.update(refs.customer(cid, uid), { creditBalance: FieldValue.increment(total) });
  tx.set(txnCol(cid).doc(), {
    uid,
    companyId: cid,
    type: 'refund',
    amount: total,
    balanceAfter: balance + total,
    reason,
    referenceId,
    by,
    at: FieldValue.serverTimestamp(),
  });
  return total;
}

/** Adds a new lot (award, promotion, loyalty). */
export function addCredits(
  tx: Transaction,
  cid: string,
  uid: string,
  amount: number,
  balance: number,
  type: CreditTxnType,
  reason: string,
  expiresAt: Timestamp | null,
  by: string | null,
  referenceId: string | null = null,
) {
  tx.set(lotsCol(cid).doc(), { uid, amount, remaining: amount, expiresAt, createdAt: FieldValue.serverTimestamp(), type });
  tx.update(refs.customer(cid, uid), { creditBalance: FieldValue.increment(amount) });
  tx.set(txnCol(cid).doc(), { uid, companyId: cid, type, amount, balanceAfter: balance + amount, reason, referenceId, expiresAt, by, at: FieldValue.serverTimestamp() });
}

export { db };
