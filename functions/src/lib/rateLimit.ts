import { db, FieldValue, Timestamp } from './firebase';
import { fail } from './errors';

/**
 * Fixed one-minute window counter per action and caller, stored in rateLimits/{action}_{key}.
 * Cheap protection for sensitive operations; App Check and Cloud Armor cover bulk abuse.
 */
export async function checkRateLimit(action: string, key: string, perMinute: number): Promise<void> {
  if (perMinute <= 0) return;
  const ref = db.collection('rateLimits').doc(`${action}_${key}`.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 1400));
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { windowStart?: number; count?: number } | undefined;
    if (!data || data.windowStart !== windowStart) {
      tx.set(ref, { windowStart, count: 1, expireAt: Timestamp.fromMillis(windowStart + 3_600_000) });
      return true;
    }
    if ((data.count ?? 0) >= perMinute) return false;
    tx.update(ref, { count: FieldValue.increment(1) });
    return true;
  });
  if (!allowed) throw fail.limited();
}
