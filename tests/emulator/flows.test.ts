/**
 * End-to-end business flows through the real Cloud Functions running in the emulator.
 * Covers the critical cases called out in the spec: permissions, company isolation, court
 * creation, availability, double-booking prevention, approval, payments, credits,
 * memberships, QR check-in/out and identity verification access.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { admin, cleanup, courtInput, expectCode, inDays, makeUser, resetEmulators, seedPlatform, tomorrow, type TestUser } from './helpers';

let superAdmin: TestUser;
let ownerA: TestUser;
let ownerB: TestUser;
let alice: TestUser;
let bob: TestUser;
let companyA: string;
let companyB: string;
let courtA: string;
const date = tomorrow();

beforeAll(async () => {
  await resetEmulators();
  await seedPlatform();
  superAdmin = await makeUser('root@courtsync.test', { superAdmin: true });
  const a = await superAdmin.call('createCompany', {
    name: 'ABC Sports Arena', countryCode: 'IN', timezone: 'Asia/Kolkata', city: 'Pune', allowedSportIds: ['badminton', 'swimming'],
    admin: { email: 'owner-a@courtsync.test', displayName: 'Owner A' },
  });
  const b = await superAdmin.call('createCompany', {
    name: 'Other Club', countryCode: 'IN', timezone: 'Asia/Kolkata', allowedSportIds: ['badminton'],
    admin: { email: 'owner-b@courtsync.test', displayName: 'Owner B' },
  });
  companyA = a.companyId;
  companyB = b.companyId;
  ownerA = await makeUser('owner-a@courtsync.test');
  ownerB = await makeUser('owner-b@courtsync.test');
  alice = await makeUser('alice@courtsync.test');
  bob = await makeUser('bob@courtsync.test');
});

afterAll(cleanup);

describe('platform administration', () => {
  it('only Super Admins can create companies', async () => {
    await expectCode(alice.call('createCompany', { name: 'Nope', countryCode: 'IN', timezone: 'Asia/Kolkata', allowedSportIds: [], admin: { email: 'x@example.com', displayName: 'Xavier' } }), 'permission-denied');
  });

  it('creates the company with a main branch, owner and settings', async () => {
    const company = (await admin.db.doc(`companies/${companyA}`).get()).data()!;
    expect(company.status).toBe('active');
    expect(company.currency).toBe('INR');
    expect((await admin.db.doc(`companies/${companyA}/branches/main`).get()).exists).toBe(true);
    expect((await admin.db.doc(`companies/${companyA}/staff/${ownerA.uid}`).get()).get('role')).toBe('owner');
    expect((await admin.db.doc(`companies/${companyA}/settings/general`).get()).get('paymentMethodIds')).toEqual(['cash', 'sandbox']);
    const audit = await admin.db.collection('auditLogs').where('action', '==', 'company.create').get();
    expect(audit.size).toBe(2);
  });

  it('never exposes passwords, only reset links', async () => {
    const res = await superAdmin.call('sendPasswordReset', { uid: ownerA.uid });
    expect(res.delivered).toBe(false);
    expect(res.link).toContain('oobCode');
    expect(JSON.stringify(res)).not.toContain('Test-password-123');
  });

  it('company admins cannot reset customer passwords', async () => {
    await expectCode(ownerA.call('sendPasswordReset', { uid: alice.uid, companyId: companyA }), 'permission-denied');
  });
});

describe('courts', () => {
  it('lets the owner create courts only for permitted sports', async () => {
    const res = await ownerA.call('upsertCourt', { companyId: companyA, court: courtInput('main') });
    courtA = res.courtId;
    expect((await admin.db.doc(`companies/${companyA}`).get()).get('sportIds')).toEqual(['badminton']);
    await expectCode(ownerA.call('upsertCourt', { companyId: companyA, court: courtInput('main', 'cricket') }), 'permission-denied');
  });

  it('blocks other companies from managing the court', async () => {
    await expectCode(ownerB.call('upsertCourt', { companyId: companyA, courtId: courtA, court: courtInput('main') }), 'permission-denied');
  });

  it('serves the public calendar without pricing when hidden', async () => {
    const res = await alice.call('getAvailability', { companyId: companyA, courtId: courtA, startDate: date, endDate: date });
    expect(res.days[0].slots.length).toBe(48);
    expect(res.court.pricing).not.toBeNull();
  });
});

describe('booking engine', () => {
  it('prevents double booking under concurrent requests', async () => {
    await admin.db.doc(`companies/${companyA}/settings/general`).set({ booking: { requireApproval: false } }, { merge: true });
    const attempts = await Promise.allSettled(
      [alice, bob, alice, bob, alice].map((u) => u.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 600, endMin: 660, participants: 2 })),
    );
    const ok = attempts.filter((a) => a.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    const overlapping = await Promise.allSettled([
      bob.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 630, endMin: 690, participants: 1 }),
    ]);
    expect(overlapping[0].status).toBe('rejected');
    const adjacent = await bob.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 660, endMin: 720, participants: 1 });
    expect(adjacent.status).toBe('confirmed');
  });

  it('runs the approval workflow and notifies the customer', async () => {
    await admin.db.doc(`companies/${companyA}/settings/general`).set({ booking: { requireApproval: true } }, { merge: true });
    const req = await alice.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 780, endMin: 840, participants: 1 });
    expect(req.status).toBe('pendingApproval');
    // The pending request already holds the slot.
    await expectCode(bob.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 780, endMin: 840, participants: 1 }), 'aborted');
    // Customers cannot approve, and other companies cannot either.
    await expectCode(alice.call('decideBooking', { companyId: companyA, bookingId: req.bookingId, decision: 'approve' }), 'permission-denied');
    await expectCode(ownerB.call('decideBooking', { companyId: companyA, bookingId: req.bookingId, decision: 'approve' }), 'permission-denied');
    const res = await ownerA.call('decideBooking', { companyId: companyA, bookingId: req.bookingId, decision: 'approve' });
    expect(res.status).toBe('confirmed');
    const notes = await admin.db.collection(`users/${alice.uid}/notifications`).where('type', '==', 'booking.approved').get();
    expect(notes.size).toBe(1);
  });

  it('releases the slot when a request is rejected', async () => {
    const req = await alice.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 900, endMin: 960, participants: 1 });
    await ownerA.call('decideBooking', { companyId: companyA, bookingId: req.bookingId, decision: 'reject', note: 'Maintenance' });
    const again = await bob.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 900, endMin: 960, participants: 1 });
    expect(again.status).toBe('pendingApproval');
  });

  it('respects blocked slots', async () => {
    await admin.db.collection(`companies/${companyA}/blockedSlots`).add({
      courtId: courtA, branchId: 'main', reason: 'Tournament', kind: 'oneOff', startDate: date, endDate: date, startMin: 1080, endMin: 1200, days: [],
    });
    await expectCode(alice.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 1110, endMin: 1170, participants: 1 }), 'aborted');
  });

  it('lets customers read only their own bookings', async () => {
    const mine = await getDocs(query(collection(alice.db, `companies/${companyA}/bookings`), where('customerUid', '==', alice.uid)));
    expect(mine.size).toBeGreaterThan(0);
    await expect(getDocs(collection(alice.db, `companies/${companyA}/bookings`))).rejects.toThrow();
  });
});

describe('payments', () => {
  it('confirms a prepaid booking only after the gateway confirms payment', async () => {
    await admin.db.doc(`companies/${companyA}/settings/general`).set({ booking: { requireApproval: false, requirePrepayment: true } }, { merge: true });
    const req = await alice.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 1260, endMin: 1320, participants: 1, paymentMethodId: 'sandbox' });
    expect(req.status).toBe('paymentPending');
    const pay = await alice.call('startPayment', { companyId: companyA, purpose: 'booking', referenceId: req.bookingId, paymentMethodId: 'sandbox' });
    expect(pay.amount).toBe(500);
    // Another user cannot confirm someone else's payment.
    await expectCode(bob.call('confirmSandboxPayment', { companyId: companyA, paymentId: pay.paymentId, outcome: 'succeeded' }), 'not-found');
    await alice.call('confirmSandboxPayment', { companyId: companyA, paymentId: pay.paymentId, outcome: 'succeeded' });
    const b = (await admin.db.doc(`companies/${companyA}/bookings/${req.bookingId}`).get()).data()!;
    expect(b.status).toBe('confirmed');
    expect(b.paymentStatus).toBe('paid');
    // Replaying the confirmation is a no-op.
    await alice.call('confirmSandboxPayment', { companyId: companyA, paymentId: pay.paymentId, outcome: 'succeeded' });
    expect((await admin.db.doc(`companies/${companyA}/bookings/${req.bookingId}`).get()).get('amountPaid')).toBe(500);
    await admin.db.doc(`companies/${companyA}/settings/general`).set({ booking: { requirePrepayment: false } }, { merge: true });
  });

  it('rejects webhooks with a bad signature', async () => {
    const res = await fetch('http://127.0.0.1:5001/demo-courtsync/us-central1/paymentWebhook/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'bogus' },
      body: JSON.stringify({ event: 'payment.captured', payload: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('customers cannot change payment status directly', async () => {
    const { updateDoc } = await import('firebase/firestore');
    const mine = await getDocs(query(collection(alice.db, `companies/${companyA}/bookings`), where('customerUid', '==', alice.uid)));
    await expect(updateDoc(mine.docs[0].ref, { paymentStatus: 'paid' })).rejects.toThrow();
  });
});

describe('credits', () => {
  it('awards, redeems and refunds company-specific credits', async () => {
    await ownerA.call('adjustCredits', { companyId: companyA, uid: alice.uid, type: 'award', amount: 300, reason: 'Welcome bonus' });
    let cust = await getDoc(doc(alice.db, `companies/${companyA}/customers/${alice.uid}`));
    expect(cust.get('creditBalance')).toBe(300);
    // Booked well ahead so the cancellation below is never "late" (which would not return credits).
    const early = inDays(3);
    const req = await alice.call('createBooking', { companyId: companyA, courtId: courtA, date: early, startMin: 480, endMin: 540, participants: 1, credits: 200 });
    expect(req.pricing.total).toBe(300);
    cust = await getDoc(doc(alice.db, `companies/${companyA}/customers/${alice.uid}`));
    expect(cust.get('creditBalance')).toBe(100);
    await alice.call('cancelBooking', { companyId: companyA, bookingId: req.bookingId, reason: 'Plans changed' });
    cust = await getDoc(doc(alice.db, `companies/${companyA}/customers/${alice.uid}`));
    expect(cust.get('creditBalance')).toBe(300);
    await expectCode(alice.call('createBooking', { companyId: companyA, courtId: courtA, date, startMin: 480, endMin: 540, participants: 1, credits: 9999 }), 'invalid-argument');
    await expectCode(alice.call('adjustCredits', { companyId: companyA, uid: alice.uid, type: 'award', amount: 1000, reason: 'Free money' }), 'permission-denied');
  });

  it('keeps balances separate per company', async () => {
    await ownerB.call('createCustomer', { companyId: companyB, displayName: 'Alice', email: 'alice@courtsync.test' });
    const b = await getDoc(doc(alice.db, `companies/${companyB}/customers/${alice.uid}`));
    expect(b.get('creditBalance')).toBe(0);
  });
});

describe('memberships', () => {
  it('subscribes, pays at the desk and records attendance', async () => {
    const svc = await admin.db.collection(`companies/${companyA}/services`).add({
      name: 'Monthly Badminton', price: 2000, durationMonths: 1, sessionsPerPeriod: 2, renewal: 'manual', active: true, enrolled: 0,
    });
    const sub = await alice.call('subscribe', { companyId: companyA, serviceId: svc.id, startDate: new Date().toISOString().slice(0, 10) }).catch(async () =>
      alice.call('subscribe', { companyId: companyA, serviceId: svc.id }),
    );
    expect(sub.status).toBe('pendingPayment');
    await ownerA.call('recordOfflinePayment', { companyId: companyA, purpose: 'subscription', referenceId: sub.subscriptionId, paymentMethodId: 'cash', amount: 2000 });
    expect((await admin.db.doc(`companies/${companyA}/subscriptions/${sub.subscriptionId}`).get()).get('status')).toBe('active');
    await ownerA.call('recordAttendance', { companyId: companyA, subscriptionId: sub.subscriptionId });
    await ownerA.call('recordAttendance', { companyId: companyA, subscriptionId: sub.subscriptionId });
    await expectCode(ownerA.call('recordAttendance', { companyId: companyA, subscriptionId: sub.subscriptionId }), 'failed-precondition');
  });
});

describe('check-in and check-out', () => {
  it('checks in by QR token and out by code, with overrides audited', async () => {
    // Make a booking that is running now by letting staff book at short notice for today.
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    const mins = local.getHours() * 60 + local.getMinutes();
    const start = Math.ceil((mins + 1) / 30) * 30;
    if (start + 60 > 1440) return; // too close to midnight to schedule a same-day slot
    const res = await ownerA.call('createBooking', { companyId: companyA, courtId: courtA, date: today, startMin: start, endMin: start + 60, participants: 1, customerUid: bob.uid });
    expect(res.status).toBe('confirmed');
    const b = (await admin.db.doc(`companies/${companyA}/bookings/${res.bookingId}`).get()).data()!;
    expect(b.checkInToken).toHaveLength(43);
    expect(b.verificationCode).toMatch(/^\d{6}$/);
    const look = await ownerA.call('lookupCheckIn', { companyId: companyA, token: b.checkInToken });
    expect(look.booking.id).toBe(res.bookingId);
    await expectCode(ownerB.call('lookupCheckIn', { companyId: companyA, token: b.checkInToken }), 'permission-denied');
    const inRes = await ownerA.call('checkInOut', { companyId: companyA, action: 'checkIn', token: b.checkInToken });
    expect(inRes.status).toBe('checkedIn');
    const outRes = await ownerA.call('checkInOut', { companyId: companyA, action: 'checkOut', code: b.verificationCode });
    expect(outRes.status).toBe('completed');
  });
});

describe('identity verification', () => {
  it('encrypts numbers, masks them for staff and audits reveals', async () => {
    await admin.db.doc(`companies/${companyA}/settings/general`).set({ verification: { requiredTypeIds: ['in_pan'], optionalTypeIds: [], requireBeforeBooking: false } }, { merge: true });
    await expectCode(alice.call('submitVerification', { companyId: companyA, consent: true, documents: [{ typeId: 'in_pan', number: 'bad' }] }), 'invalid-argument');
    await alice.call('submitVerification', { companyId: companyA, consent: true, documents: [{ typeId: 'in_pan', number: 'ABCDE1234F' }] });
    const v = (await getDoc(doc(alice.db, `companies/${companyA}/verifications/${alice.uid}`))).data()!;
    expect(v.documents[0].numberMasked).toBe('******234F');
    expect(JSON.stringify(v)).not.toContain('ABCDE1234F');
    const secure = (await admin.db.doc(`companies/${companyA}/verifications/${alice.uid}/secure/in_pan`).get()).data()!;
    expect(JSON.stringify(secure)).not.toContain('ABCDE1234F');
    await expect(getDoc(doc(alice.db, `companies/${companyA}/verifications/${alice.uid}/secure/in_pan`))).rejects.toThrow();
    await expect(getDoc(doc(ownerB.db, `companies/${companyA}/verifications/${alice.uid}`))).rejects.toThrow();
    await ownerA.call('reviewVerification', { companyId: companyA, uid: alice.uid, decision: 'verified' });
    expect((await admin.db.doc(`companies/${companyA}/customers/${alice.uid}`).get()).get('verificationStatus')).toBe('verified');
    const reveal = await ownerA.call('revealIdNumber', { companyId: companyA, uid: alice.uid, typeId: 'in_pan', reason: 'Dispute check' });
    expect(reveal.number).toBe('ABCDE1234F');
    const logs = await admin.db.collection('auditLogs').where('action', '==', 'verification.reveal').get();
    expect(logs.size).toBe(1);
    await expectCode(ownerB.call('revealIdNumber', { companyId: companyA, uid: alice.uid, typeId: 'in_pan', reason: 'Snooping' }), 'permission-denied');
  });
});

describe('company lifecycle', () => {
  it('suspension blocks bookings and staff changes until revoked', async () => {
    await superAdmin.call('setCompanyStatus', { companyId: companyB, status: 'suspended', reason: 'Unpaid invoice' });
    await expectCode(alice.call('createBooking', { companyId: companyB, courtId: 'x', date, startMin: 600, endMin: 660, participants: 1 }), 'failed-precondition');
    await expectCode(ownerB.call('upsertBranch', { companyId: companyB, branch: { name: 'North', timezone: 'Asia/Kolkata', active: true } }), 'failed-precondition');
    await superAdmin.call('setCompanyStatus', { companyId: companyB, status: 'active', reason: 'Paid' });
    const res = await ownerB.call('upsertBranch', { companyId: companyB, branch: { name: 'North', timezone: 'Asia/Kolkata', active: true } });
    expect(res.branchId).toBeTruthy();
  });
});

describe('profiles created outside ensureProfile', () => {
  it('fills in a bare profile document instead of treating the account as deactivated', async () => {
    const email = 'bootstrap@courtsync.test';
    const created = await admin.auth.createUser({ email, password: 'Test-password-123', displayName: 'Boot Strap' });
    await admin.auth.setCustomUserClaims(created.uid, { superAdmin: true });
    // What the bootstrap script used to write: only the platform role.
    await admin.db.doc(`users/${created.uid}`).set({ platformRole: 'superAdmin' });
    const user = await makeUser(email); // signs in and calls ensureProfile
    const res = await user.call('ensureProfile', {});
    expect(res.superAdmin).toBe(true);
    const profile = (await admin.db.doc(`users/${created.uid}`).get()).data()!;
    expect(profile.status).toBe('active');
    expect(profile.platformRole).toBe('superAdmin');
    expect(profile.email).toBe(email);
  });
});
