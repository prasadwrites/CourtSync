import type { Transaction } from 'firebase-admin/firestore';
import { db, FieldValue } from './firebase';

export interface AuditEntry {
  actorUid: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  companyId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

const SECRET_KEYS = /password|secret|token|number|cipher|sealed|iv|tag/i;

/** Strips values that must never appear in an audit trail. */
function scrub(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 6) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) && k !== 'numberMasked' ? '[redacted]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function auditDoc(entry: AuditEntry) {
  return {
    ...entry,
    companyId: entry.companyId ?? null,
    before: scrub(entry.before),
    after: scrub(entry.after),
    metadata: scrub(entry.metadata ?? {}),
    at: FieldValue.serverTimestamp(),
  };
}

export async function audit(entry: AuditEntry, tx?: Transaction): Promise<void> {
  const ref = db.collection('auditLogs').doc();
  if (tx) tx.set(ref, auditDoc(entry));
  else await ref.set(auditDoc(entry));
}
