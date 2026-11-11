import { useState } from 'react';
import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { CheckSquare, Plus, RefreshCw, UserPlus, Wallet, XCircle } from 'lucide-react';
import { serviceSchema, type Service, type Subscription } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { useSports } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtShortDate, formatMoney, todayISO } from '@/lib/format';
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, EmptyState, Input, Modal, PageHeader, Select, Spinner, Switch, Textarea } from '@/components/ui';
import { SubscriptionBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import { useCompany, type WithId } from './context';
import { CustomerPicker } from './shared';
import { RecordPaymentModal } from './BookingDetail';

type Svc = WithId<Service>;
type Sub = WithId<Subscription>;

export default function Services() {
  const { companyId, company, can } = useCompany();
  const services = useQuery<Service>(query(collection(db, 'companies', companyId, 'services'), orderBy('name')), `services-${companyId}`);
  const [editing, setEditing] = useState<Svc | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const current = services.data.find((s) => s.id === selected) ?? null;
  return (
    <>
      <PageHeader title="Memberships and services" description="Monthly coaching, swimming classes, gym access and other plans customers subscribe to." actions={can('services.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add service</Button>} />
      {services.loading ? <Spinner /> : services.data.length === 0 ? (
        <EmptyState title="No services yet" description="Create a plan such as Monthly badminton coaching, with a price and number of sessions." action={can('services.manage') && <Button onClick={() => setEditing('new')}>Add service</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            {services.data.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected(s.id)} className={`w-full rounded-xl border p-3 text-left ${selected === s.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="flex items-center justify-between gap-2"><span className="font-medium">{s.name}</span>{!s.active && <Badge>Inactive</Badge>}</span>
                <span className="block text-sm text-slate-500">{formatMoney(s.price, company.currency)} · {s.durationMonths} month{s.durationMonths === 1 ? '' : 's'} · {s.enrolled} enrolled{s.maxParticipants ? ` of ${s.maxParticipants}` : ''}</span>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {current ? <ServicePanel s={current} onEdit={() => setEditing(current)} /> : <Card><p className="py-8 text-center text-sm text-slate-500">Choose a service to see its members.</p></Card>}
          </div>
        </div>
      )}
      {editing && <ServiceEditor s={editing === 'new' ? null : editing} close={() => setEditing(null)} />}
    </>
  );
}

function ServicePanel({ s, onEdit }: { s: Svc; onEdit: () => void }) {
  const toast = useToast();
  const { companyId, company, can, sportName } = useCompany();
  const subs = useQuery<Subscription>(query(collection(db, 'companies', companyId, 'subscriptions'), where('serviceId', '==', s.id), orderBy('createdAt', 'desc'), limit(500)), `subs-${s.id}`);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [pay, setPay] = useState<Sub | null>(null);
  const [cancel, setCancel] = useState<Sub | null>(null);
  const [busy, setBusy] = useState('');
  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Card padded={false}>
      <div className="p-4">
        <CardHeader title={s.name} description={[s.sportId ? sportName(s.sportId) : null, s.sessionsPerPeriod ? `${s.sessionsPerPeriod} sessions` : 'Unlimited sessions', s.weeklyFrequency ? `${s.weeklyFrequency}× a week` : null, s.renewal === 'auto' ? 'Auto-renews' : 'Manual renewal'].filter(Boolean).join(' · ')}
          action={<div className="flex gap-2">{can('services.manage') && <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>}{can('subscriptions.manage') && s.active && <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setEnrollOpen(true)}>Enrol</Button>}</div>} />
        {s.description && <p className="text-sm text-slate-600">{s.description}</p>}
      </div>
      <DataTable loading={subs.loading} rows={subs.data} empty="Nobody has subscribed yet." columns={[
        { key: 'name', header: 'Member', render: (x) => <span className="font-medium">{x.customerName}</span> },
        { key: 'period', header: 'Period', render: (x) => `${fmtShortDate(x.startDate)} – ${fmtShortDate(x.endDate)}`, hideOnMobile: true },
        { key: 'used', header: 'Sessions', render: (x) => (x.sessionsTotal ? `${x.sessionsUsed}/${x.sessionsTotal}` : x.sessionsUsed) },
        { key: 'pay', header: 'Payment', render: (x) => <PaymentStatusBadge status={x.paymentStatus} />, hideOnMobile: true },
        { key: 'status', header: 'Status', render: (x) => <SubscriptionBadge status={x.status} /> },
        { key: 'act', header: '', render: (x) => can('subscriptions.manage') && (
          <div className="flex justify-end gap-1">
            {x.status === 'active' && <Button size="sm" variant="ghost" title="Record attendance" aria-label="Record attendance" loading={busy === `att-${x.id}`} onClick={() => run(`att-${x.id}`, () => call('recordAttendance', { companyId, subscriptionId: x.id }), `Attendance recorded for ${x.customerName}`)}><CheckSquare className="h-4 w-4" /></Button>}
            {x.status === 'pendingPayment' && can('payments.record') && <Button size="sm" variant="ghost" title="Record payment" aria-label="Record payment" onClick={() => setPay(x)}><Wallet className="h-4 w-4" /></Button>}
            {(x.status === 'active' || x.status === 'expired') && <Button size="sm" variant="ghost" title="Renew" aria-label="Renew" loading={busy === `ren-${x.id}`} onClick={() => run(`ren-${x.id}`, () => call('renewSubscription', { companyId, subscriptionId: x.id }), 'Renewal created')}><RefreshCw className="h-4 w-4" /></Button>}
            {(x.status === 'active' || x.status === 'pendingPayment') && <Button size="sm" variant="ghost" title="Cancel" aria-label="Cancel" onClick={() => setCancel(x)}><XCircle className="h-4 w-4" /></Button>}
          </div>
        ) },
      ]} />
      {enrollOpen && <EnrollModal s={s} close={() => setEnrollOpen(false)} />}
      {pay && <RecordPaymentModal purpose="subscription" referenceId={pay.id} due={pay.price} currency={pay.currency || company.currency} close={() => setPay(null)} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} tone="danger" loading={busy === 'cancel'} title="Cancel membership?" message="The member loses access at once. Refunds, if any, are handled under Payments." confirmLabel="Cancel membership"
        onConfirm={() => cancel && run('cancel', () => call('cancelSubscription', { companyId, subscriptionId: cancel.id }), 'Membership cancelled').then(() => setCancel(null))} />
    </Card>
  );
}

function EnrollModal({ s, close }: { s: Svc; close: () => void }) {
  const toast = useToast();
  const { companyId, company } = useCompany();
  const [uid, setUid] = useState('');
  const [startDate, setStartDate] = useState(todayISO(company.timezone));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={close} title={`Enrol in ${s.name}`} description={`${formatMoney(s.price, company.currency)} for ${s.durationMonths} month${s.durationMonths === 1 ? '' : 's'}. Record payment afterwards if it's paid at the desk.`}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} disabled={!uid} onClick={async () => {
        setBusy(true);
        try {
          await call('subscribe', { companyId, serviceId: s.id, customerUid: uid, startDate });
          toast.success('Enrolled');
          close();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}>Enrol</Button></>}>
      <div className="space-y-3">
        <CustomerPicker value={uid} onChange={setUid} />
        <Input type="date" label="Start date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
      </div>
    </Modal>
  );
}

function ServiceEditor({ s, close }: { s: Svc | null; close: () => void }) {
  const toast = useToast();
  const { companyId, company, branches } = useCompany();
  const sports = useSports();
  const [v, setV] = useState({
    name: s?.name ?? '',
    description: s?.description ?? '',
    sportId: s?.sportId ?? '',
    branchId: s?.branchId ?? '',
    price: s?.price ?? 0,
    durationMonths: s?.durationMonths ?? 1,
    sessionsPerPeriod: s?.sessionsPerPeriod ?? null as number | null,
    weeklyFrequency: s?.weeklyFrequency ?? null as number | null,
    sessionDurationMinutes: s?.sessionDurationMinutes ?? null as number | null,
    maxParticipants: s?.maxParticipants ?? null as number | null,
    eligibility: s?.eligibility ?? '',
    renewal: s?.renewal ?? 'manual' as 'manual' | 'auto',
    cancellationPolicy: s?.cancellationPolicy ?? '',
    active: s?.active ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const num = (x: string) => (x === '' ? null : Number(x));
  const save = async () => {
    setError('');
    const parsed = serviceSchema.safeParse({ ...v, sportId: v.sportId || null, branchId: v.branchId || null, description: v.description || undefined, eligibility: v.eligibility || undefined, cancellationPolicy: v.cancellationPolicy || undefined });
    if (!parsed.success) return setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
    setBusy(true);
    try {
      if (s) await updateDoc(doc(db, 'companies', companyId, 'services', s.id), { ...parsed.data, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, 'companies', companyId, 'services'), { ...parsed.data, enrolled: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      toast.success('Service saved');
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={close} size="lg" title={s ? `Edit ${s.name}` : 'Add service'} footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <Input label="Name" required placeholder="e.g. Monthly swimming classes" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Textarea label="Description" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label={`Price (${company.currency})`} type="number" min={0} step="0.01" value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) || 0 })} />
          <Input label="Length (months)" type="number" min={1} max={36} value={v.durationMonths} onChange={(e) => setV({ ...v, durationMonths: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
          <Select label="Renewal" value={v.renewal} onChange={(e) => setV({ ...v, renewal: e.target.value as 'manual' | 'auto' })} options={[{ value: 'manual', label: 'Manual' }, { value: 'auto', label: 'Remind to renew' }]} />
          <Input label="Sessions included" type="number" min={1} hint="Empty means unlimited." value={v.sessionsPerPeriod ?? ''} onChange={(e) => setV({ ...v, sessionsPerPeriod: num(e.target.value) })} />
          <Input label="Sessions per week" type="number" min={1} value={v.weeklyFrequency ?? ''} onChange={(e) => setV({ ...v, weeklyFrequency: num(e.target.value) })} />
          <Input label="Session length (min)" type="number" min={5} value={v.sessionDurationMinutes ?? ''} onChange={(e) => setV({ ...v, sessionDurationMinutes: num(e.target.value) })} />
          <Input label="Maximum members" type="number" min={1} hint="Empty means no limit." value={v.maxParticipants ?? ''} onChange={(e) => setV({ ...v, maxParticipants: num(e.target.value) })} />
          <Select label="Sport" value={v.sportId} onChange={(e) => setV({ ...v, sportId: e.target.value })} placeholder="Any" options={sports.data.filter((x) => company.allowedSportIds.includes(x.id)).map((x) => ({ value: x.id, label: x.name }))} />
          {branches.length > 1 && <Select label="Branch" value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value })} placeholder="All branches" options={branches.map((b) => ({ value: b.id, label: b.name }))} />}
        </div>
        <Textarea label="Who can join" rows={2} placeholder="e.g. Ages 8 to 14" value={v.eligibility} onChange={(e) => setV({ ...v, eligibility: e.target.value })} />
        <Textarea label="Cancellation policy" rows={2} value={v.cancellationPolicy} onChange={(e) => setV({ ...v, cancellationPolicy: e.target.value })} />
        <Switch checked={v.active} onChange={(on) => setV({ ...v, active: on })} label="Open for new members" />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
