import type { Transaction, WriteBatch } from 'firebase-admin/firestore';
import { db, FieldValue } from './firebase';

export const platformStatsRef = () => db.collection('platformStats').doc('summary');

export function inc(n = 1) {
  return FieldValue.increment(n);
}

/** Increments platform counters. Pass a transaction or batch to keep them consistent with the change. */
export function bumpPlatform(fields: Record<string, number>, writer?: Transaction | WriteBatch) {
  const data: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [k, v] of Object.entries(fields)) if (v) data[k] = FieldValue.increment(v);
  if (writer) (writer as WriteBatch).set(platformStatsRef(), data, { merge: true });
  else return platformStatsRef().set(data, { merge: true });
}

export function dailyStatsRef(companyId: string, date: string) {
  return db.collection('companies').doc(companyId).collection('stats').doc(`day_${date}`);
}

/** Merges nested increments such as { bookings: 1, 'byCourt.c1.bookings': 1 } into a daily stats doc. */
export async function bumpDaily(companyId: string, date: string, fields: Record<string, number>) {
  const update: Record<string, unknown> = { date };
  for (const [path, value] of Object.entries(fields)) {
    if (!value) continue;
    const parts = path.split('.');
    let cursor = update;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor[parts[i]] = (cursor[parts[i]] as Record<string, unknown>) ?? {};
      cursor = cursor[parts[i]] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = FieldValue.increment(value);
  }
  await dailyStatsRef(companyId, date).set(update, { merge: true });
}

/** Firestore map keys cannot contain dots or slashes. */
export function statKey(value: string): string {
  return value.replace(/[./]/g, '_');
}
