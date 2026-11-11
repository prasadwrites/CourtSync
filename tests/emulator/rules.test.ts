/**
 * Firestore and Storage security rules, tested directly against the emulator with
 * @firebase/rules-unit-testing. Data is seeded with rules disabled.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, collectionGroup, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-courtsync',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const company = (status: string) => ({ name: 'Co', status, allowedSportIds: ['badminton'], sportIds: [], stats: { courts: 0 }, restrictions: {}, countryCode: 'IN' });
    await setDoc(doc(db, 'companies/A'), company('active'));
    await setDoc(doc(db, 'companies/B'), company('active'));
    await setDoc(doc(db, 'companies/S'), company('suspended'));
    await setDoc(doc(db, 'companies/A/staff/ownerA'), { uid: 'ownerA', role: 'owner', status: 'active', branchIds: [] });
    await setDoc(doc(db, 'companies/A/staff/deskA'), { uid: 'deskA', role: 'frontDesk', status: 'active', branchIds: [] });
    await setDoc(doc(db, 'companies/A/staff/managerA'), { uid: 'managerA', role: 'manager', status: 'active', branchIds: [] });
    await setDoc(doc(db, 'companies/A/staff/exA'), { uid: 'exA', role: 'admin', status: 'inactive', branchIds: [] });
    await setDoc(doc(db, 'companies/B/staff/ownerB'), { uid: 'ownerB', role: 'owner', status: 'active', branchIds: [] });
    await setDoc(doc(db, 'companies/S/staff/ownerS'), { uid: 'ownerS', role: 'owner', status: 'active', branchIds: [] });
    await setDoc(doc(db, 'companies/A/branches/main'), { name: 'Main', timezone: 'Asia/Kolkata', isPrimary: true, active: true });
    await setDoc(doc(db, 'companies/A/courts/c1'), { name: 'Court 1', branchId: 'main', status: 'active', publicCalendar: { enabled: true } });
    await setDoc(doc(db, 'companies/A/bookings/b1'), { customerUid: 'alice', status: 'confirmed', paymentStatus: 'unpaid' });
    await setDoc(doc(db, 'companies/A/bookings/b2'), { customerUid: 'bob', status: 'confirmed', paymentStatus: 'unpaid' });
    await setDoc(doc(db, 'companies/A/customers/alice'), { uid: 'alice', creditBalance: 10 });
    await setDoc(doc(db, 'companies/A/verifications/alice'), { uid: 'alice', status: 'pending' });
    await setDoc(doc(db, 'companies/A/verifications/alice/secure/pan'), { sealed: { data: 'x' } });
    await setDoc(doc(db, 'companies/A/settings/general'), { booking: { slotHoldMinutes: 30, maxAdvanceDays: 30, requireApproval: true }, credits: { creditValue: 1 }, paymentMethodIds: [] });
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice', status: 'active', mustChangePassword: false });
    await setDoc(doc(db, 'auditLogs/l1'), { companyId: 'A', action: 'x' });
    await setDoc(doc(db, 'auditLogs/l2'), { companyId: null, action: 'platform' });
    await setDoc(doc(db, 'sports/badminton'), { name: 'Badminton', enabled: true, defaultBookingModel: 'exclusive' });
  });
});

const as = (uid: string, claims: Record<string, unknown> = {}) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const superAdmin = () => as('root', { superAdmin: true });

describe('platform master data', () => {
  it('anyone reads sports; only Super Admins write them', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'sports/badminton')));
    await assertFails(setDoc(doc(as('ownerA'), 'sports/tennis'), { name: 'Tennis', enabled: true, defaultBookingModel: 'exclusive' }));
    await assertSucceeds(setDoc(doc(superAdmin(), 'sports/tennis'), { name: 'Tennis', enabled: true, defaultBookingModel: 'exclusive' }));
  });

  it('a forged superAdmin field in a user profile grants nothing', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { platformRole: 'superAdmin' }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { mustChangePassword: true, status: 'inactive' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { displayName: 'Alice B' }));
  });

  it('audit logs are readable by Super Admins and the company admin only, and never writable', async () => {
    await assertSucceeds(getDoc(doc(superAdmin(), 'auditLogs/l2')));
    await assertSucceeds(getDoc(doc(as('ownerA'), 'auditLogs/l1')));
    await assertFails(getDoc(doc(as('ownerB'), 'auditLogs/l1')));
    await assertFails(getDoc(doc(as('deskA'), 'auditLogs/l1')));
    await assertFails(setDoc(doc(superAdmin(), 'auditLogs/l3'), { action: 'fake' }));
  });
});

describe('company isolation', () => {
  it('staff cannot read another company’s private records', async () => {
    await assertSucceeds(getDoc(doc(as('ownerA'), 'companies/A/bookings/b1')));
    await assertFails(getDoc(doc(as('ownerB'), 'companies/A/bookings/b1')));
    await assertFails(getDoc(doc(as('ownerB'), 'companies/A/customers/alice')));
    await assertFails(getDocs(collection(as('ownerB'), 'companies/A/bookings')));
  });

  it('inactive staff lose access', async () => {
    await assertFails(getDoc(doc(as('exA'), 'companies/A/bookings/b1')));
  });

  it('company admins cannot change status, sports or counters', async () => {
    await assertSucceeds(updateDoc(doc(as('ownerA'), 'companies/A'), { name: 'ABC Arena' }));
    await assertFails(updateDoc(doc(as('ownerA'), 'companies/A'), { status: 'active', allowedSportIds: ['badminton', 'cricket'] }));
    await assertFails(updateDoc(doc(as('ownerA'), 'companies/A'), { 'stats.courts': 99 }));
    await assertFails(updateDoc(doc(as('managerA'), 'companies/A'), { name: 'Manager rename' }));
  });

  it('suspended companies cannot be edited by their staff', async () => {
    await assertFails(updateDoc(doc(as('ownerS'), 'companies/S'), { name: 'Still here' }));
  });

  it('courts and staff are written only by functions', async () => {
    await assertFails(setDoc(doc(as('ownerA'), 'companies/A/courts/c2'), { name: 'Sneaky', branchId: 'main' }));
    await assertFails(setDoc(doc(as('ownerA'), 'companies/A/staff/eve'), { uid: 'eve', role: 'owner', status: 'active' }));
  });
});

describe('customers', () => {
  it('read only their own bookings, including across companies', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'companies/A/bookings/b1')));
    await assertFails(getDoc(doc(as('alice'), 'companies/A/bookings/b2')));
    await assertSucceeds(getDocs(query(collectionGroup(as('alice'), 'bookings'), where('customerUid', '==', 'alice'))));
    await assertFails(getDocs(query(collectionGroup(as('alice'), 'bookings'), where('customerUid', '==', 'bob'))));
  });

  it('can never modify bookings, payment status or credit balances', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'companies/A/bookings/b1'), { paymentStatus: 'paid' }));
    await assertFails(updateDoc(doc(as('alice'), 'companies/A/customers/alice'), { creditBalance: 9999 }));
    await assertFails(addDoc(collection(as('alice'), 'companies/A/creditTransactions'), { uid: 'alice', amount: 100 }));
    await assertFails(addDoc(collection(as('alice'), 'companies/A/bookings'), { customerUid: 'alice', status: 'confirmed' }));
  });

  it('cannot read encrypted identity data, even their own', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'companies/A/verifications/alice')));
    await assertFails(getDoc(doc(as('alice'), 'companies/A/verifications/alice/secure/pan')));
    await assertFails(getDoc(doc(as('ownerA'), 'companies/A/verifications/alice/secure/pan')));
    await assertFails(getDoc(doc(as('deskA'), 'companies/A/verifications/alice')));
    await assertSucceeds(getDoc(doc(as('managerA'), 'companies/A/verifications/alice')));
  });
});

describe('public access', () => {
  it('anonymous visitors see active companies but not courts or suspended companies', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'companies/A')));
    await assertFails(getDoc(doc(anon(), 'companies/S')));
    await assertFails(getDoc(doc(anon(), 'companies/A/courts/c1')));
    await assertSucceeds(getDoc(doc(as('alice'), 'companies/A/courts/c1')));
  });
});

describe('calendar blocks and settings', () => {
  const block = { courtId: 'c1', branchId: 'main', reason: 'Repairs', kind: 'oneOff', startDate: '2030-01-01', endDate: '2030-01-01', startMin: 600, endMin: 660, days: [] };

  it('managers block slots; front desk and customers cannot', async () => {
    await assertSucceeds(addDoc(collection(as('managerA'), 'companies/A/blockedSlots'), block));
    await assertFails(addDoc(collection(as('deskA'), 'companies/A/blockedSlots'), block));
    await assertFails(addDoc(collection(as('alice'), 'companies/A/blockedSlots'), block));
    await assertFails(addDoc(collection(as('managerA'), 'companies/A/blockedSlots'), { ...block, endMin: 500 }));
    await assertFails(addDoc(collection(as('managerA'), 'companies/A/blockedSlots'), { ...block, courtId: 'nope' }));
  });

  it('only admins edit settings, with validation', async () => {
    const settings = { booking: { slotHoldMinutes: 15, maxAdvanceDays: 60, requireApproval: false }, credits: { creditValue: 2 }, paymentMethodIds: [] };
    await assertSucceeds(setDoc(doc(as('ownerA'), 'companies/A/settings/general'), settings));
    await assertFails(setDoc(doc(as('managerA'), 'companies/A/settings/general'), settings));
    await assertFails(setDoc(doc(as('ownerA'), 'companies/A/settings/general'), { ...settings, booking: { ...settings.booking, maxAdvanceDays: 9999 } }));
    await assertFails(deleteDoc(doc(as('ownerA'), 'companies/A/settings/general')).then(() => setDoc(doc(as('ownerA'), 'companies/A/settings/other'), settings)));
  });
});

describe('storage', () => {
  it('identity documents are private to the customer and company reviewers', async () => {
    const file = new Uint8Array([1, 2, 3]);
    const path = 'companies/A/verifications/alice/pan.png';
    await assertSucceeds(uploadBytes(ref(env.authenticatedContext('alice').storage(), path), file, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(env.authenticatedContext('bob').storage(), path), file, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(env.authenticatedContext('alice').storage(), 'companies/A/verifications/alice/x.exe'), file, { contentType: 'application/x-msdownload' }));
    await assertSucceeds(getBytes(ref(env.authenticatedContext('managerA').storage(), path)));
    await assertFails(getBytes(ref(env.authenticatedContext('ownerB').storage(), path)));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path)));
  });

  it('public company media is world-readable and written by managers only', async () => {
    const file = new Uint8Array([1]);
    await assertSucceeds(uploadBytes(ref(env.authenticatedContext('managerA').storage(), 'companies/A/public/logo.png'), file, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(env.authenticatedContext('deskA').storage(), 'companies/A/public/logo2.png'), file, { contentType: 'image/png' }));
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), 'companies/A/public/logo.png')));
  });
});
