import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { Compass } from 'lucide-react';
import type { CompanySettings, Subscription } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc } from '@/lib/hooks';
import { usePaymentMethods } from '@/lib/master';
import { useSession } from '@/lib/auth';
import { useMyCompanies, useMySubscriptions } from '@/lib/customer';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtShortDate, formatMoney } from '@/lib/format';
import type { StartPaymentResult } from '@/lib/booking';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LinkButton, Spinner } from '@/components/ui';
import { PaymentStatusBadge, SubscriptionBadge } from '@/components/StatusBadge';
import { PaymentDialog } from '@/components/PaymentDialog';

type Sub = Subscription & { id: string };

export default function Memberships() {
  const { user } = useSession();
  const subs = useMySubscriptions(user?.uid);
  const companies = useMyCompanies(user?.uid);
  const name = (id: string) => companies.data.find((c) => c.companyId === id)?.companyName ?? '';
  if (subs.loading) return <Spinner />;
  if (subs.error) return <ErrorState error={subs.error} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Memberships</h1>
      {subs.data.length === 0 ? (
        <Card><EmptyState title="No memberships" description="Venues list their monthly classes and memberships on their page." action={<LinkButton to="/explore" icon={<Compass className="h-4 w-4" />}>Explore venues</LinkButton>} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">{subs.data.map((s) => <SubCard key={`${s.companyId}/${s.id}`} s={s} companyName={name(s.companyId)} />)}</div>
      )}
    </div>
  );
}

function SubCard({ s, companyName }: { s: Sub; companyName: string }) {
  const toast = useToast();
  const settings = useDoc<CompanySettings>(doc(db, 'companies', s.companyId, 'settings', 'general'), `sub-set-${s.companyId}`);
  const methods = usePaymentMethods();
  const online = methods.data.filter((m) => m.enabled && m.kind === 'online' && settings.data?.paymentMethodIds.includes(m.id));
  const [payment, setPayment] = useState<StartPaymentResult | null>(null);
  const [busy, setBusy] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{s.serviceName}</p>
          <Link to={`/c/${s.companyId}`} className="text-sm text-brand-700">{companyName}</Link>
        </div>
        <SubscriptionBadge status={s.status} />
      </div>
      <p className="mt-2 text-sm text-slate-600">{fmtShortDate(s.startDate)} – {fmtShortDate(s.endDate)} · {formatMoney(s.price, s.currency)}</p>
      <p className="text-sm text-slate-600">{s.sessionsTotal ? `${s.sessionsUsed} of ${s.sessionsTotal} sessions used` : `${s.sessionsUsed} sessions attended`}</p>
      <div className="mt-1"><PaymentStatusBadge status={s.paymentStatus} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        {s.status === 'pendingPayment' && online.map((m) => (
          <Button key={m.id} size="sm" loading={busy === m.id} onClick={() => run(m.id, async () => setPayment(await call<StartPaymentResult>('startPayment', { companyId: s.companyId, purpose: 'subscription', referenceId: s.id, paymentMethodId: m.id })))}>Pay with {m.name}</Button>
        ))}
        {(s.status === 'active' || s.status === 'expired') && <Button size="sm" variant="secondary" loading={busy === 'renew'} onClick={() => run('renew', async () => { await call('renewSubscription', { companyId: s.companyId, subscriptionId: s.id }); toast.success('Renewal created. Pay to activate it.'); })}>Renew</Button>}
        {(s.status === 'active' || s.status === 'pendingPayment') && <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>Cancel</Button>}
      </div>
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} tone="danger" loading={busy === 'cancel'} title="Cancel membership?" confirmLabel="Cancel membership" message="Refunds follow the venue's policy. Contact the venue if you have questions."
        onConfirm={() => run('cancel', async () => { await call('cancelSubscription', { companyId: s.companyId, subscriptionId: s.id }); toast.success('Membership cancelled'); setCancelOpen(false); })} />
      {payment && <PaymentDialog companyId={s.companyId} payment={payment} paid={s.paymentStatus === 'paid'} title={s.serviceName} onClose={() => setPayment(null)} />}
    </Card>
  );
}
