import { DateTime } from 'luxon';
import { subscribeSchema, subscriptionRefSchema, checkCreditRedemption, round2, todayIn, type Service, type Subscription, type CompanyCustomer, type UserProfile } from '@courtsync/shared';
import { callable } from '../lib/callable';
import { db, FieldValue, Timestamp } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, loadCompany, loadSettings, requireStaff, assertCompanyOpen } from '../lib/authz';
import { planRedemption, applyRedemption } from '../credits/ledger';
import { joinCompanyInternal } from '../company/customers';
import { notifyCompany, notifyUser } from '../notifications/notify';

const subs = (cid: string) => refs.company(cid).collection('subscriptions');
const services = (cid: string) => refs.company(cid).collection('services');

function periodEnd(start: string, months: number): string {
  return DateTime.fromISO(start, { zone: 'UTC' }).plus({ months }).minus({ days: 1 }).toISODate()!;
}

async function createSubscription(opts: {
  cid: string;
  serviceId: string;
  customerUid: string;
  startDate: string;
  credits: number;
  actor: string;
  renewalOf?: string;
}) {
  const company = await loadCompany(opts.cid);
  assertCompanyOpen(company);
  const settings = await loadSettings(opts.cid);
  const ref = subs(opts.cid).doc();
  const result = await db.runTransaction(async (tx) => {
    const svcSnap = await tx.get(services(opts.cid).doc(opts.serviceId));
    if (!svcSnap.exists) throw fail.notFound('Service');
    const svc = svcSnap.data() as Service;
    if (!svc.active) throw fail.precondition('This service is not open for sign-ups.');
    if (svc.endDate && opts.startDate > svc.endDate) throw fail.precondition('This service has ended.');
    if (svc.maxParticipants && svc.enrolled >= svc.maxParticipants) throw fail.precondition('This service is full.');
    const customer = (await tx.get(refs.customer(opts.cid, opts.customerUid))).data() as CompanyCustomer | undefined;
    if (!customer || customer.status !== 'active') throw fail.precondition('This customer is not active at this facility.');
    const profile = (await tx.get(refs.user(opts.customerUid))).data() as UserProfile | undefined;
    const credit = checkCreditRedemption(opts.credits, customer.creditBalance ?? 0, svc.price, settings.credits, 'services');
    if (!credit.ok) throw fail.invalid(credit.message);
    const plan = await planRedemption(tx, opts.cid, opts.customerUid, credit.credits, customer.creditBalance ?? 0);

    const price = round2(svc.price - credit.value);
    applyRedemption(tx, plan, `Membership: ${svc.name}`, ref.id, opts.actor);
    const sub: Record<string, unknown> = {
      serviceId: opts.serviceId,
      serviceName: svc.name,
      companyId: opts.cid,
      customerUid: opts.customerUid,
      customerName: profile?.displayName ?? customer.displayName,
      status: price <= 0 ? 'active' : 'pendingPayment',
      startDate: opts.startDate,
      endDate: periodEnd(opts.startDate, svc.durationMonths),
      price,
      listPrice: svc.price,
      creditsApplied: credit.credits,
      creditLots: plan.takes,
      currency: company.currency,
      sessionsTotal: svc.sessionsPerPeriod,
      sessionsUsed: 0,
      paymentStatus: price <= 0 ? 'paid' : 'unpaid',
      amountPaid: 0,
      autoRenew: svc.renewal === 'auto',
      attendance: [],
      renewalOf: opts.renewalOf ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, sub);
    tx.update(services(opts.cid).doc(opts.serviceId), { enrolled: FieldValue.increment(1) });
    return { svc, sub };
  });
  await notifyCompany(opts.cid, {
    title: opts.renewalOf ? 'Membership renewal' : 'New membership',
    body: `${result.sub.customerName} ${opts.renewalOf ? 'renewed' : 'joined'} ${result.svc.name}.`,
    type: opts.renewalOf ? 'membership.renewed' : 'membership.subscribed',
    link: `/manage/${opts.cid}/memberships`,
    companyId: opts.cid,
  });
  return { subscriptionId: ref.id, status: result.sub.status as string, price: result.sub.price as number };
}

export const subscribe = callable('subscribe', subscribeSchema, async (input, caller) => {
  const onBehalf = !!input.customerUid && input.customerUid !== caller.uid;
  if (onBehalf) await requireStaff(caller, input.companyId, 'subscriptions.manage');
  else await joinCompanyInternal(input.companyId, caller.uid, 'self');
  const company = await loadCompany(input.companyId);
  const start = input.startDate ?? todayIn(company.timezone);
  if (start < todayIn(company.timezone) && !onBehalf) throw fail.invalid('The start date has passed.');
  return createSubscription({ cid: input.companyId, serviceId: input.serviceId, customerUid: input.customerUid ?? caller.uid, startDate: start, credits: input.credits, actor: caller.uid });
});

export const renewSubscription = callable('renewSubscription', subscriptionRefSchema, async ({ companyId, subscriptionId }, caller) => {
  const s = (await subs(companyId).doc(subscriptionId).get()).data() as Subscription | undefined;
  if (!s) throw fail.notFound('Membership');
  if (s.customerUid !== caller.uid) await requireStaff(caller, companyId, 'subscriptions.manage');
  if (!['active', 'expired'].includes(s.status)) throw fail.precondition(`A ${s.status} membership cannot be renewed.`);
  const existing = await subs(companyId).where('renewalOf', '==', subscriptionId).where('status', 'in', ['pendingPayment', 'active']).limit(1).get();
  if (!existing.empty) throw fail.exists('This membership has already been renewed.');
  const company = await loadCompany(companyId);
  const today = todayIn(company.timezone);
  const next = DateTime.fromISO(s.endDate, { zone: 'UTC' }).plus({ days: 1 }).toISODate()!;
  return createSubscription({ cid: companyId, serviceId: s.serviceId, customerUid: s.customerUid, startDate: next < today ? today : next, credits: 0, actor: caller.uid, renewalOf: subscriptionId });
});

export const cancelSubscription = callable('cancelSubscription', subscriptionRefSchema, async ({ companyId, subscriptionId, note }, caller) => {
  const ref = subs(companyId).doc(subscriptionId);
  const s = (await ref.get()).data() as Subscription | undefined;
  if (!s) throw fail.notFound('Membership');
  const byCustomer = s.customerUid === caller.uid;
  if (!byCustomer) await requireStaff(caller, companyId, 'subscriptions.manage');
  if (!['pendingPayment', 'active'].includes(s.status)) throw fail.precondition(`A ${s.status} membership cannot be cancelled.`);
  await db.runTransaction(async (tx) => {
    tx.update(ref, { status: 'cancelled', autoRenew: false, cancelledAt: FieldValue.serverTimestamp(), cancelledBy: caller.uid, cancelNote: note ?? null, updatedAt: FieldValue.serverTimestamp() });
    tx.update(services(companyId).doc(s.serviceId), { enrolled: FieldValue.increment(-1) });
  });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'membership.cancel', targetType: 'subscription', targetId: subscriptionId, companyId, before: { status: s.status }, after: { status: 'cancelled' }, metadata: { note } });
  if (byCustomer) await notifyCompany(companyId, { title: 'Membership cancelled', body: `${s.customerName} cancelled ${s.serviceName}.`, type: 'membership.cancelled', link: `/manage/${companyId}/memberships`, companyId });
  else await notifyUser(s.customerUid, { title: 'Membership cancelled', body: `${s.serviceName} was cancelled.${note ? ` ${note}` : ''}`, type: 'membership.cancelled', link: '/memberships', companyId });
  return { ok: true };
});

export const recordAttendance = callable('recordAttendance', subscriptionRefSchema, async ({ companyId, subscriptionId }, caller) => {
  await requireStaff(caller, companyId, 'checkin.operate');
  const ref = subs(companyId).doc(subscriptionId);
  const used = await db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() as Subscription | undefined;
    if (!s) throw fail.notFound('Membership');
    if (s.status !== 'active') throw fail.precondition(`This membership is ${s.status}.`);
    const company = await loadCompany(companyId, tx);
    const today = todayIn(company.timezone);
    if (today < s.startDate || today > s.endDate) throw fail.precondition('This membership is not valid today.');
    if (s.sessionsTotal != null && s.sessionsUsed >= s.sessionsTotal) throw fail.precondition('All sessions for this period are used.');
    tx.update(ref, { sessionsUsed: FieldValue.increment(1), attendance: FieldValue.arrayUnion({ at: Timestamp.now(), by: caller.uid }), updatedAt: FieldValue.serverTimestamp() });
    return s.sessionsUsed + 1;
  });
  return { sessionsUsed: used };
});
