/**
 * Test harness for the Firebase emulators. Admin SDK seeds and inspects data;
 * each test user gets its own client SDK app so callables run with real auth.
 */
import { initializeApp as adminInit, getApps as adminApps } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminDb } from 'firebase-admin/firestore';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { DateTime } from 'luxon';

export const PROJECT = 'demo-courtsync';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

if (!adminApps().length) adminInit({ projectId: PROJECT });
export const admin = { auth: adminAuth(), db: adminDb() };

const apps: FirebaseApp[] = [];
let n = 0;

export interface TestUser {
  uid: string;
  email: string;
  call<T = any>(name: string, data?: unknown): Promise<T>;
  db: Firestore;
}

export async function makeUser(email: string, opts: { superAdmin?: boolean; name?: string } = {}): Promise<TestUser> {
  const password = 'Test-password-123';
  let uid: string;
  try {
    uid = (await admin.auth.createUser({ email, password, displayName: opts.name ?? email.split('@')[0] })).uid;
  } catch {
    const u = await admin.auth.getUserByEmail(email);
    uid = u.uid;
    await admin.auth.updateUser(uid, { password });
  }
  if (opts.superAdmin) await admin.auth.setCustomUserClaims(uid, { superAdmin: true });
  const app = initializeApp({ apiKey: 'fake-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `u${n++}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  await signInWithEmailAndPassword(auth, email, password);
  const user: TestUser = {
    uid,
    email,
    db,
    async call(name, data = {}) {
      const res = await httpsCallable(fns, name)(data);
      return res.data as any;
    },
  };
  await user.call('ensureProfile', {});
  return user;
}

export async function cleanup() {
  await Promise.all(apps.splice(0).map((a) => deleteApp(a)));
}

export async function resetEmulators() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Seeds the platform master data a company needs. */
export async function seedPlatform() {
  const db = admin.db;
  await db.doc('paymentMethods/cash').set({ name: 'Cash', provider: 'offline', kind: 'offline', enabled: true });
  await db.doc('paymentMethods/sandbox').set({ name: 'Sandbox', provider: 'sandbox', kind: 'online', enabled: true });
  await db.doc('countries/IN').set({
    name: 'India', code: 'IN', dialCode: '+91', currency: 'INR', currencySymbol: '₹', paymentMethodIds: ['cash', 'sandbox'],
    timezones: ['Asia/Kolkata'], businessVerification: [{ label: 'GSTIN', required: false }], enabled: true,
  });
  await db.doc('sports/badminton').set({ name: 'Badminton', defaultBookingModel: 'exclusive', enabled: true });
  await db.doc('sports/swimming').set({ name: 'Swimming', defaultBookingModel: 'shared', enabled: true });
  await db.doc('sports/cricket').set({ name: 'Cricket', defaultBookingModel: 'session', enabled: true });
  await db.doc('identificationTypes/in_pan').set({
    name: 'PAN card', countryCode: 'IN', appliesTo: { company: true, customer: true }, mandatoryFor: { company: false, customer: false },
    fields: { number: { enabled: true, required: true, pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$' }, image: { enabled: true, required: false }, expiryDate: { enabled: false, required: false }, issuingRegion: { enabled: false, required: false } },
    highlySensitive: false, enabled: true,
  });
  await db.doc('platformSettings/general').set({ features: { sandboxPayments: true } });
}

export const tomorrow = (tz = 'Asia/Kolkata') => DateTime.now().setZone(tz).plus({ days: 1 }).toISODate()!;

export function courtInput(branchId: string, sportId = 'badminton', overrides: Record<string, unknown> = {}) {
  const day = { sessions: [{ start: 0, end: 1440 }] };
  return {
    branchId, sportId, name: 'Court 1', description: 'Test court', photoUrls: [], environment: 'indoor', status: 'active', statusNote: null,
    bookingModel: 'exclusive', capacity: 1, maxParticipants: 4, minDurationMinutes: 60, maxDurationMinutes: 180, slotIntervalMinutes: 30,
    pricing: { basePrice: 500, sessionPrice: 0, peak: [] }, sessions: [], equipment: [], amenities: [],
    operatingHours: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day },
    timezone: 'Asia/Kolkata', cancellationPolicy: '', maxAdvanceDays: null,
    publicCalendar: { enabled: true, showPricing: false, showDescription: true },
    ...overrides,
  };
}

/** Expects a callable to fail with a given Firebase error code (e.g. "permission-denied"). */
export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const got = (e as { code?: string }).code ?? '';
    if (!got.endsWith(code)) throw new Error(`Expected ${code}, got ${got}: ${(e as Error).message}`);
    return;
  }
  throw new Error(`Expected ${code}, but the call succeeded`);
}
