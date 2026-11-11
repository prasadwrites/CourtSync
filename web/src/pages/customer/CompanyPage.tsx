import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import { Globe, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import type { Branch, Company, CompanyCustomer, CompanySettings, Court, Service, Verification } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc, useQuery } from '@/lib/hooks';
import { usePaymentMethods, useSports } from '@/lib/master';
import { useSession } from '@/lib/auth';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatMoney } from '@/lib/format';
import { Alert, Avatar, Badge, Button, Card, CardHeader, ErrorState, Modal, Spinner } from '@/components/ui';
import { VerificationBadge } from '@/components/StatusBadge';
import { PaymentDialog } from '@/components/PaymentDialog';
import type { StartPaymentResult } from '@/lib/booking';

export default function CompanyPage() {
  const { companyId = '' } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const company = useDoc<Company>(doc(db, 'companies', companyId), `cp-${companyId}`);
  const me = useDoc<CompanyCustomer>(user ? doc(db, 'companies', companyId, 'customers', user.uid) : null, `cp-me-${companyId}-${user?.uid}`);
  const settings = useDoc<CompanySettings>(doc(db, 'companies', companyId, 'settings', 'general'), `cp-set-${companyId}`);
  const courts = useQuery<Court>(query(collection(db, 'companies', companyId, 'courts'), where('status', 'in', ['active', 'temporarilyClosed']), orderBy('name')), `cp-courts-${companyId}`);
  const branches = useQuery<Branch>(query(collection(db, 'companies', companyId, 'branches'), where('active', '==', true)), `cp-br-${companyId}`);
  const services = useQuery<Service>(query(collection(db, 'companies', companyId, 'services'), where('active', '==', true), orderBy('name')), `cp-svc-${companyId}`);
  const verification = useDoc<Verification>(user ? doc(db, 'companies', companyId, 'verifications', user.uid) : null, `cp-ver-${companyId}-${user?.uid}`);
  const sports = useSports();
  const [joining, setJoining] = useState(false);
  const [subscribing, setSubscribing] = useState<(Service & { id: string }) | null>(null);

  if (company.loading) return <Spinner />;
  if (company.error || !company.data) return <ErrorState error={company.error ?? new Error('This venue is not available.')} />;
  const c = company.data;
  const member = me.data && me.data.status === 'active';
  const sportName = (id: string) => sports.data.find((s) => s.id === id)?.name ?? id;
  const bySport = new Map<string, (Court & { id: string })[]>();
  for (const ct of courts.data) bySport.set(ct.sportId, [...(bySport.get(ct.sportId) ?? []), ct]);
  const v = settings.data?.verification;
  const needsVerification = !!v && (v.requiredTypeIds.length > 0 || v.optionalTypeIds.length > 0);

  const join = async () => {
    setJoining(true);
    try {
      await call('joinCompany', { companyId });
      toast.success(`You joined ${c.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-5">
      {c.photoUrls?.[0] && <img src={c.photoUrls[0]} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />}
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={c.name} src={c.logoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <p className="flex items-center gap-1 text-slate-600"><MapPin className="h-4 w-4" />{[c.address?.line1, c.city, c.countryCode].filter(Boolean).join(', ')}</p>
          {c.operatingHoursNote && <p className="text-sm text-slate-500">{c.operatingHoursNote}</p>}
        </div>
        {me.data ? (
          <div className="text-right">
            <Badge tone={member ? 'green' : 'red'}>{member ? 'Member' : `Account ${me.data.status}`}</Badge>
            {settings.data?.credits.enabled && <p className="mt-1 text-sm text-slate-600">{me.data.creditBalance} credits</p>}
          </div>
        ) : (
          <Button loading={joining} onClick={join}>Join to book</Button>
        )}
      </div>
      {c.description && <p className="whitespace-pre-line text-slate-700">{c.description}</p>}
      {me.data && !member && <Alert tone="error">Your account at this venue is {me.data.status}. Contact the venue for help.</Alert>}
      {member && needsVerification && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand-700" />
              <div>
                <p className="font-medium">Identity verification</p>
                <p className="text-sm text-slate-500">{v!.requireBeforeBooking ? 'Required before you can book here.' : 'This venue may ask for ID.'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <VerificationBadge status={verification.data?.status ?? 'notSubmitted'} />
              <Link to={`/c/${companyId}/verify`} className="text-sm font-medium text-brand-700">{verification.data ? 'View' : 'Verify now'}</Link>
            </div>
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Courts</h2>
        {courts.loading ? <Spinner /> : courts.data.length === 0 ? <p className="text-sm text-slate-500">No courts are open for booking yet.</p> : (
          [...bySport.entries()].map(([sid, list]) => (
            <div key={sid}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{sportName(sid)}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((ct) => {
                  const closed = ct.status !== 'active';
                  const card = (
                    <div className={`h-full overflow-hidden rounded-xl border bg-white shadow-card ${closed ? 'border-slate-200 opacity-70' : 'border-slate-200 hover:border-brand-300'}`}>
                      {ct.photoUrls?.[0] ? <img src={ct.photoUrls[0]} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] w-full bg-gradient-to-br from-court-50 to-brand-50" />}
                      <div className="p-3">
                        <p className="font-medium">{ct.name}</p>
                        <p className="text-sm text-slate-500">
                          {ct.environment === 'indoor' ? 'Indoor' : 'Outdoor'}
                          {branches.data.length > 1 && ` · ${branches.data.find((b) => b.id === ct.branchId)?.name ?? ''}`}
                          {' · '}
                          {ct.bookingModel === 'session' ? `${formatMoney(ct.pricing.sessionPrice, c.currency)} per session` : `from ${formatMoney(ct.pricing.basePrice, c.currency)}/h${ct.bookingModel === 'shared' ? ' per person' : ''}`}
                        </p>
                        {closed && <p className="mt-1 text-sm text-amber-700">Temporarily closed{ct.statusNote ? `: ${ct.statusNote}` : ''}</p>}
                      </div>
                    </div>
                  );
                  return closed ? <div key={ct.id}>{card}</div> : <Link key={ct.id} to={`/c/${companyId}/court/${ct.id}`}>{card}</Link>;
                })}
              </div>
            </div>
          ))
        )}
      </section>

      {services.data.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Memberships and classes</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.data.map((s) => (
              <Card key={s.id}>
                <CardHeader title={s.name} description={`${formatMoney(s.price, c.currency)} for ${s.durationMonths} month${s.durationMonths === 1 ? '' : 's'}${s.sessionsPerPeriod ? ` · ${s.sessionsPerPeriod} sessions` : ''}`}
                  action={member && <Button size="sm" disabled={!!s.maxParticipants && s.enrolled >= s.maxParticipants} onClick={() => setSubscribing(s)}>{s.maxParticipants && s.enrolled >= s.maxParticipants ? 'Full' : 'Subscribe'}</Button>} />
                {s.description && <p className="text-sm text-slate-600">{s.description}</p>}
                {s.eligibility && <p className="mt-1 text-xs text-slate-500">Who can join: {s.eligibility}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      <Card>
        <CardHeader title="Contact" />
        <ul className="space-y-1 text-sm">
          {c.contact?.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /><a href={`tel:${c.contact.phone}`}>{c.contact.phone}</a></li>}
          {c.contact?.email && <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /><a href={`mailto:${c.contact.email}`}>{c.contact.email}</a></li>}
          {c.contact?.website && <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" /><a href={c.contact.website} target="_blank" rel="noreferrer">{c.contact.website}</a></li>}
          {c.location && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /><a className="text-brand-700" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${c.location.lat},${c.location.lng}`}>Open in maps</a></li>}
        </ul>
        {settings.data?.booking.refundPolicy && <p className="mt-3 text-xs text-slate-500">Cancellation and refunds: {settings.data.booking.refundPolicy}</p>}
      </Card>
      {subscribing && <SubscribeModal companyId={companyId} currency={c.currency} service={subscribing} credits={settings.data?.credits.enabled && settings.data.credits.eligible.services ? me.data?.creditBalance ?? 0 : 0} methodIds={settings.data?.paymentMethodIds ?? []} close={() => setSubscribing(null)} />}
    </div>
  );
}

function SubscribeModal({ companyId, currency, service, credits, methodIds, close }: { companyId: string; currency: string; service: Service & { id: string }; credits: number; methodIds: string[]; close: () => void }) {
  const toast = useToast();
  const [useCredits, setUseCredits] = useState(0);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<StartPaymentResult | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const sub = useDoc<{ paymentStatus: string }>(subId ? doc(db, 'companies', companyId, 'subscriptions', subId) : null, `sub-${subId}`);
  const online = useOnlineMethods(methodIds);

  const go = async (methodId?: string) => {
    setBusy(true);
    try {
      const r = await call<{ subscriptionId: string; status: string; price: number }>('subscribe', { companyId, serviceId: service.id, credits: useCredits });
      setSubId(r.subscriptionId);
      if (r.status === 'active') {
        toast.success(`You're subscribed to ${service.name}`);
        return close();
      }
      if (methodId) {
        const p = await call<StartPaymentResult>('startPayment', { companyId, purpose: 'subscription', referenceId: r.subscriptionId, paymentMethodId: methodId });
        setPayment(p);
      } else {
        toast.success('Subscribed. Pay at the venue to activate it.');
        close();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (payment) return <PaymentDialog companyId={companyId} payment={payment} paid={sub.data?.paymentStatus === 'paid'} title={service.name} onClose={close} />;
  return (
    <Modal open onClose={close} title={`Subscribe to ${service.name}`} description={`${formatMoney(service.price, currency)} for ${service.durationMonths} month${service.durationMonths === 1 ? '' : 's'}.`}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button>{online.length === 0 && <Button loading={busy} onClick={() => go()}>Subscribe, pay at venue</Button>}</>}>
      <div className="space-y-3">
        {service.cancellationPolicy && <p className="text-sm text-slate-600">{service.cancellationPolicy}</p>}
        {credits > 0 && (
          <label className="block text-sm">Use credits (you have {credits})
            <input type="number" min={0} max={credits} value={useCredits} onChange={(e) => setUseCredits(Math.max(0, Math.min(credits, Math.round(Number(e.target.value) || 0))))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" />
          </label>
        )}
        {online.map((m) => <Button key={m.id} className="w-full" loading={busy} onClick={() => go(m.id)}>Pay with {m.name}</Button>)}
        {online.length > 0 && <Button variant="ghost" className="w-full" disabled={busy} onClick={() => go()}>Pay at the venue instead</Button>}
      </div>
    </Modal>
  );
}

function useOnlineMethods(ids: string[]) {
  const methods = usePaymentMethods();
  return methods.data.filter((m) => m.enabled && m.kind === 'online' && ids.includes(m.id));
}
