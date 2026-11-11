/**
 * Seeds CourtSync master data, and optionally a demo venue.
 *
 *   npm run seed                         # emulator (default): master data + demo venue
 *   npm run seed -- --project courtsync-babfe --no-demo   # real project: master data only
 *
 * Against a real project it uses Application Default Credentials
 * (`gcloud auth application-default login`). The demo venue is built through the
 * deployed Cloud Functions, so it needs WEB_API_KEY for that project as well.
 * Master data writes are idempotent merges and never delete anything.
 */
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { DateTime } from 'luxon';
import { countries, identificationTypes, paymentMethods, sports } from './seed-data';
import { FEATURE_FLAGS } from '../shared/src/defaults';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const project = arg('project') ?? 'demo-courtsync';
const emulator = project.startsWith('demo-') || !!process.env.FIRESTORE_EMULATOR_HOST;
const withDemo = args.includes('--no-demo') ? false : emulator || args.includes('--demo');
const region = process.env.FUNCTION_REGION ?? 'us-central1';

if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
}
process.env.GCLOUD_PROJECT = project;
adminInit({ projectId: project });
const db = getFirestore();
const auth = getAuth();

async function seedMasterData() {
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  for (const [id, m] of Object.entries(paymentMethods)) {
    batch.set(db.collection('paymentMethods').doc(id), { ...m, enabled: id === 'sandbox' ? emulator : m.enabled, updatedAt: now }, { merge: true });
  }
  for (const c of countries) batch.set(db.collection('countries').doc(c.code), { ...c, updatedAt: now, createdAt: now }, { merge: true });
  for (const [id, s] of Object.entries(sports)) batch.set(db.collection('sports').doc(id), { ...s, updatedAt: now, createdAt: now }, { merge: true });
  for (const [id, t] of Object.entries(identificationTypes)) batch.set(db.collection('identificationTypes').doc(id), { ...t, updatedAt: now, createdAt: now }, { merge: true });
  const features = Object.fromEntries(Object.entries(FEATURE_FLAGS).map(([k, v]) => [k, k === 'sandboxPayments' ? emulator : v.default]));
  const existing = await db.doc('platformSettings/general').get();
  if (!existing.exists) batch.set(db.doc('platformSettings/general'), { features, supportEmail: '', updatedAt: now });
  await batch.commit();
  console.log(`Master data: ${Object.keys(paymentMethods).length} payment methods, ${countries.length} countries, ${Object.keys(sports).length} sports, ${Object.keys(identificationTypes).length} ID types.`);
}

async function ensureUser(email: string, password: string, displayName: string, claims?: Record<string, unknown>) {
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch {
    uid = (await auth.createUser({ email, password, displayName, emailVerified: true })).uid;
  }
  if (claims) await auth.setCustomUserClaims(uid, claims);
  return uid;
}

function clientFor(email: string, password: string) {
  const apiKey = emulator ? 'fake-api-key' : process.env.WEB_API_KEY;
  if (!apiKey) throw new Error('Set WEB_API_KEY to the web API key of the project to seed the demo venue.');
  const app = initializeApp({ apiKey, projectId: project, authDomain: `${project}.firebaseapp.com` }, email);
  const a = clientAuth(app);
  const fns = getFunctions(app, region);
  if (emulator) {
    connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }
  return {
    signIn: () => signInWithEmailAndPassword(a, email, password),
    call: async <T = any>(name: string, data: unknown) => (await httpsCallable(fns, name)(data)).data as T,
  };
}

const minutes = (h: number, m = 0) => h * 60 + m;
const daily = (start: number, end: number) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { sessions: [{ start, end }] }]));

async function seedDemo() {
  const password = process.env.DEMO_PASSWORD ?? 'CourtSync-demo-1';
  const superEmail = 'admin@courtsync.test';
  const ownerEmail = 'owner@smashpoint.test';
  const deskEmail = 'desk@smashpoint.test';
  const playerEmail = 'player@courtsync.test';
  await ensureUser(superEmail, password, 'Platform Admin', { superAdmin: true });
  await ensureUser(ownerEmail, password, 'Asha Rao');
  await ensureUser(playerEmail, password, 'Rohan Mehta');

  const existing = await db.collection('companies').where('slug', '==', 'smashpoint-sports-arena').limit(1).get();
  if (!existing.empty) {
    console.log('Demo venue already exists; skipping.');
    return;
  }

  const sa = clientFor(superEmail, password);
  await sa.signIn();
  await sa.call('ensureProfile', {});
  const created = await sa.call<{ companyId: string }>('createCompany', {
    name: 'SmashPoint Sports Arena',
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    city: 'Bengaluru',
    allowedSportIds: ['badminton', 'swimming', 'yoga', 'pickleball'],
    contactEmail: ownerEmail,
    plan: 'standard',
    admin: { email: ownerEmail, displayName: 'Asha Rao' },
  });
  const cid = created.companyId;

  const owner = clientFor(ownerEmail, password);
  await owner.signIn();
  await owner.call('ensureProfile', {});
  const base = {
    branchId: 'main', description: '', photoUrls: [], environment: 'indoor', status: 'active', statusNote: null,
    equipment: [], amenities: ['Changing rooms', 'Drinking water'], timezone: 'Asia/Kolkata', cancellationPolicy: '', maxAdvanceDays: null,
    publicCalendar: { enabled: true, showPricing: true, showDescription: true },
  };
  for (const n of [1, 2]) {
    await owner.call('upsertCourt', { companyId: cid, court: { ...base, sportId: 'badminton', name: `Badminton court ${n}`, description: 'Wooden floor, BWF-approved mats, LED lighting.', bookingModel: 'exclusive', capacity: 1, maxParticipants: 4, minDurationMinutes: 60, maxDurationMinutes: 180, slotIntervalMinutes: 30, pricing: { basePrice: 500, sessionPrice: 0, peak: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: minutes(18), end: minutes(22), price: 700 }, { days: ['sat', 'sun'], start: minutes(6), end: minutes(22), price: 700 }] }, sessions: [], equipment: ['Rackets on hire', 'Shuttles'], operatingHours: daily(minutes(6), minutes(22)) } });
  }
  await owner.call('upsertCourt', { companyId: cid, court: { ...base, sportId: 'swimming', name: 'Swimming pool', description: '25 m pool, 6 lanes.', bookingModel: 'shared', capacity: 30, maxParticipants: 5, minDurationMinutes: 60, maxDurationMinutes: 60, slotIntervalMinutes: 60, pricing: { basePrice: 200, sessionPrice: 0, peak: [] }, sessions: [], operatingHours: { ...daily(minutes(6), minutes(21)), mon: { sessions: [] } } } });
  await owner.call('upsertCourt', { companyId: cid, court: { ...base, sportId: 'yoga', name: 'Yoga studio', bookingModel: 'session', capacity: 1, maxParticipants: 15, minDurationMinutes: 60, maxDurationMinutes: 60, slotIntervalMinutes: 30, pricing: { basePrice: 0, sessionPrice: 1500, peak: [] }, sessions: [{ label: 'Morning batch', start: minutes(6, 30), end: minutes(7, 30), days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }, { label: 'Evening batch', start: minutes(18), end: minutes(19), days: ['mon', 'tue', 'wed', 'thu', 'fri'] }], operatingHours: daily(minutes(6), minutes(21)) } });

  await owner.call('addStaff', { companyId: cid, email: deskEmail, displayName: 'Front Desk', role: 'frontDesk', branchIds: [] });
  await auth.updateUser((await auth.getUserByEmail(deskEmail)).uid, { password });

  const player = clientFor(playerEmail, password);
  await player.signIn();
  await player.call('ensureProfile', {});
  await player.call('joinCompany', { companyId: cid });
  const playerUid = (await auth.getUserByEmail(playerEmail)).uid;
  await owner.call('adjustCredits', { companyId: cid, uid: playerUid, type: 'promotion', amount: 200, reason: 'Welcome credits', expiresInDays: 90 });

  // A confirmed booking tomorrow evening, booked by staff for the player.
  const tomorrow = DateTime.now().setZone('Asia/Kolkata').plus({ days: 1 }).toISODate()!;
  const courts = await db.collection('companies').doc(cid).collection('courts').where('sportId', '==', 'badminton').limit(1).get();
  await owner.call('createBooking', { companyId: cid, courtId: courts.docs[0].id, date: tomorrow, startMin: minutes(19), endMin: minutes(20), participants: 2, customerUid: playerUid, confirmNow: true });

  await db.collection('companies').doc(cid).collection('services').add({
    name: 'Monthly badminton coaching', description: 'Three evening sessions a week with a certified coach.', sportId: 'badminton', branchId: null,
    price: 3500, durationMonths: 1, sessionsPerPeriod: 12, weeklyFrequency: 3, sessionDurationMinutes: 60, maxParticipants: 12,
    eligibility: 'Ages 8 and up', renewal: 'manual', cancellationPolicy: 'Cancel before the start date for a full refund.', active: true, enrolled: 0,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`Demo venue ${cid} created. Sign in with any of these (password ${password}):`);
  console.log(`  Super admin   ${superEmail}\n  Venue owner   ${ownerEmail}\n  Front desk    ${deskEmail}\n  Player        ${playerEmail}`);
}

(async () => {
  console.log(`Seeding ${project}${emulator ? ' (emulator)' : ''}`);
  await seedMasterData();
  if (withDemo) await seedDemo();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
