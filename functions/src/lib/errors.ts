import { HttpsError } from 'firebase-functions/v2/https';
import type { ZodError } from 'zod';

export const fail = {
  unauthenticated: (msg = 'Please sign in first.') => new HttpsError('unauthenticated', msg),
  denied: (msg = 'You do not have permission to do that.') => new HttpsError('permission-denied', msg),
  notFound: (what: string) => new HttpsError('not-found', `${what} was not found.`),
  invalid: (msg: string, details?: unknown) => new HttpsError('invalid-argument', msg, details),
  precondition: (msg: string, details?: unknown) => new HttpsError('failed-precondition', msg, details),
  exists: (msg: string) => new HttpsError('already-exists', msg),
  conflict: (msg: string, details?: unknown) => new HttpsError('aborted', msg, details),
  limited: (msg = 'Too many attempts. Please wait a moment and try again.') => new HttpsError('resource-exhausted', msg),
  internal: (msg = 'Something went wrong. Please try again.') => new HttpsError('internal', msg),
  unavailable: (msg: string) => new HttpsError('unavailable', msg),
};

export function zodToHttps(err: ZodError): HttpsError {
  const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = issues[0];
  return fail.invalid(first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input.', { issues });
}
