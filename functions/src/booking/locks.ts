import type { Transaction } from 'firebase-admin/firestore';
import { lockId, type SlotLock } from '@courtsync/shared';
import { FieldValue, Timestamp } from '../lib/firebase';
import { refs } from '../lib/authz';

const lockRef = (cid: string, courtId: string, date: string, startMin: number) =>
  refs.court(cid, courtId).collection('slotLocks').doc(lockId(date, startMin));

/** Reads the lock documents for the given cells inside a transaction. */
export async function readLocks(tx: Transaction, cid: string, courtId: string, date: string, cells: number[]): Promise<SlotLock[]> {
  if (!cells.length) return [];
  const snaps = await tx.getAll(...cells.map((c) => lockRef(cid, courtId, date, c)));
  return snaps.filter((s) => s.exists).map((s) => s.data() as SlotLock);
}

/** Adds or replaces this booking's hold on each cell. */
export function writeHold(
  tx: Transaction,
  cid: string,
  courtId: string,
  date: string,
  cells: number[],
  capacity: number,
  bookingId: string,
  units: number,
  expiresAt: Timestamp | null,
) {
  for (const c of cells) {
    tx.set(lockRef(cid, courtId, date, c), { date, startMin: c, capacity, holds: { [bookingId]: { units, expiresAt } } }, { merge: true });
  }
}

export function releaseHold(tx: Transaction, cid: string, courtId: string, date: string, cells: number[], bookingId: string) {
  for (const c of cells) {
    tx.set(lockRef(cid, courtId, date, c), { holds: { [bookingId]: FieldValue.delete() } }, { merge: true });
  }
}
