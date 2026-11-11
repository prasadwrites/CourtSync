/**
 * Typed wrappers around the Cloud Functions callables, with readable error messages.
 */
import { httpsCallable, type FunctionsError } from 'firebase/functions';
import { functions } from './firebase';

export class ApiError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
  }
}

const FALLBACK: Record<string, string> = {
  unauthenticated: 'Please sign in again.',
  'permission-denied': "You don't have permission to do that.",
  'resource-exhausted': 'Too many attempts. Wait a moment and try again.',
  unavailable: 'The service is unavailable right now. Try again shortly.',
  internal: 'Something went wrong. Please try again.',
  'deadline-exceeded': 'That took too long. Check your connection and try again.',
};

export async function call<T = unknown>(name: string, data: unknown = {}): Promise<T> {
  try {
    const res = await httpsCallable(functions, name)(data);
    return res.data as T;
  } catch (e) {
    const err = e as FunctionsError;
    const code = (err.code ?? 'internal').replace('functions/', '');
    const message = err.message && !/^(INTERNAL|internal)$/.test(err.message) ? err.message : FALLBACK[code] ?? FALLBACK.internal;
    throw new ApiError(message, code, err.details);
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) {
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('permission-denied')) return FALLBACK['permission-denied'];
    if (code.startsWith('auth/')) return authMessage(code);
    return e.message;
  }
  return 'Something went wrong.';
}

function authMessage(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account uses that email.',
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use at least 8 characters for your password.',
    'auth/too-many-requests': 'Too many attempts. Try again later or reset your password.',
    'auth/invalid-phone-number': 'Enter the phone number in international format, e.g. +919876543210.',
    'auth/invalid-verification-code': 'That code is not right. Check the SMS and try again.',
    'auth/user-disabled': 'This account has been deactivated.',
    'auth/popup-closed-by-user': 'The sign-in window was closed.',
    'auth/requires-recent-login': 'For security, sign in again before changing your password.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/unauthorized-domain': 'This website address is not authorised for sign-in. Add it under Authentication > Settings > Authorized domains in the Firebase console.',
    'auth/operation-not-allowed': 'This sign-in method is not turned on. Enable it under Authentication > Sign-in method in the Firebase console.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    'auth/cancelled-popup-request': 'The sign-in window was closed.',
    'auth/invalid-api-key': 'The Firebase API key is wrong. Check VITE_FIREBASE_API_KEY and redeploy.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase API key is wrong. Check VITE_FIREBASE_API_KEY and redeploy.',
    'auth/configuration-not-found': 'Sign-in is not set up for this project. Open Authentication in the Firebase console and click Get started.',
    'auth/internal-error': 'Sign-in hit an internal error. Check the Firebase web config and sign-in settings.',
  };
  return map[code] ?? `Sign-in failed (${code}). Please try again.`;
}
