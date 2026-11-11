import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { CalendarPlus, Coins } from 'lucide-react';
import { ACCOUNT_STATUSES, type Booking, type CompanyCustomer, type CreditTransaction, type Subscription, type Verification, type AccountStatus } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc, useQuery } from '@/lib/hooks';
import { usePaymentMethods } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtShortDate, fmtTs, formatMoney, timeRange, todayISO } from '@/lib/format';
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, Input, KeyValue, PageHeader, Select, Spinner, Tabs, Textarea } from '@/components/ui';
import { BookingStatusBadge, SubscriptionBadge, VerificationBadge } from '@/components/StatusBadge';
import { PaymentsTable, type PaymentRow } from '@/components/PaymentsTable';
import { useCompany } from './context';
import { StaffBookingModal } from './shared';
import { VerificationPanel } from './VerificationReview';
import { AdjustCreditsModal, CreditTxnTable } from './Credits';

type Tab = 'bookings' | 'credits' | 'memberships' | 'payments' | 'verification';

export default function CustomerDetail() {
  const { uid = '' } = useParams();
  const { companyId, company, can, settings } = useCompany();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('bookings');
  const [bookOpen, setBookOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const customer = useDoc<CompanyCustomer>(doc(db, 'companies', companyId, 'customers', uid), `cust-${companyId}-${uid}`);
  const verification = useDoc<Verification>(can('verification.review') ? doc(db, 'companies', companyId, 'verifications', uid) : null, `cver-${companyId}-${uid}`);

  if (customer.loading) return <Spinner />;
  if (customer.error) return <ErrorState error={customer.error} />;
  if (!customer.data) return <ErrorState error={new Error('Customer not found')} />;
  const c = customer.data;

  return (
    <>
      <PageHeader
        back={`/manage/${companyId}/customers`}
        title={<span className="flex flex-wrap items-center gap-2">{c.displayName} <VerificationBadge status={c.verificationStatus} />{c.status !== 'active' && <Badge tone="red">{c.status}</Badge>}</span>}
        description={[c.email, c.phone].filter(Boolean).join(' · ')}
        actions={
          <div className="flex flex-wrap gap-2">
            {can('credits.manage') && settings?.credits.enabled && <Button variant="secondary" icon={<Coins className="h-4 w-4" />} onClick={() => setCreditOpen(true)}>Adjust credits</Button>}
            {can('bookings.create') && c.status === 'active' && <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setBookOpen(true)}>New booking</Button>}
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Summary" />
            <KeyValue items={[
              { label: 'Credit balance', value: settings?.credits.enabled ? `${c.creditBalance} credits` : 'Credits off' },
              { label: 'Bookings', value: c.bookingsCount },
              { label: 'Joined', value: `${fmtTs(c.joinedAt, false)} (${c.joinedVia === 'self' ? 'signed up' : c.joinedVia === 'invite' ? 'invited' : 'added by staff'})` },
            ]} />
          </Card>
          {can('customers.manage') && <CustomerAdmin c={c} />}
        </div>
        <div className="lg:col-span-2">
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[
            { value: 'bookings', label: 'Bookings' },
            ...(settings?.credits.enabled && can('credits.view') ? [{ value: 'credits' as Tab, label: 'Credits' }] : []),
            { value: 'memberships', label: 'Memberships' },
            ...(can('payments.view') ? [{ value: 'payments' as Tab, label: 'Payments' }] : []),
            ...(can('verification.review') ? [{ value: 'verification' as Tab, label: 'ID verification' }] : []),
          ]} />
          {tab === 'bookings' && <CustomerBookings uid={uid} />}
          {tab === 'credits' && <CustomerCredits uid={uid} />}
          {tab === 'memberships' && <CustomerMemberships uid={uid} />}
          {tab === 'payments' && <CustomerPayments uid={uid} />}
          {tab === 'verification' && (verification.data ? <VerificationPanel v={verification.data} /> : <Card><p className="text-sm text-slate-500">No documents submitted.</p></Card>)}
        </div>
      </div>
      {bookOpen && <StaffBookingModalFor uid={uid} date={todayISO(company.timezone)} close={() => setBookOpen(false)} onCreated={(id) => navigate(`/manage/${companyId}/bookings/${id}`)} />}
      {creditOpen && <AdjustCreditsModal uid={uid} name={c.displayName} balance={c.creditBalance} close={() => setCreditOpen(false)} />}
    </>
  );
}

function StaffBookingModalFor({ uid, date, close, onCreated }: { uid: string; date: string; close: () => void; onCreated: (id: string) => void }) {
  return <StaffBookingModal initial={{ date, customerUid: uid }} onClose={close} onCreated={onCreated} />;
}

function CustomerAdmin({ c }: { c: CompanyCustomer & { id: string } }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [status, setStatus] = useState<AccountStatus>(c.status);
  const [notes, setNotes] = useState(c.notes ?? '');
  const [tags, setTags] = useState((c.tags ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Manage" description="Suspended customers can't book with you. Their CourtSync account is not affected elsewhere." />
      <div className="space-y-3">
        <Select label="Status with your company" value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)} options={ACCOUNT_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
        <Input label="Tags" hint="Comma separated, e.g. coaching, corporate" value={tags} onChange={(e) => setTags(e.target.value)} />
        <Textarea label="Internal notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await call('updateCustomer', { companyId, uid: c.uid, status, notes, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) });
            toast.success('Saved');
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}>Save</Button>
      </div>
    </Card>
  );
}

function CustomerBookings({ uid }: { uid: string }) {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const list = useQuery<Booking>(query(collection(db, 'companies', companyId, 'bookings'), where('customerUid', '==', uid), orderBy('startAt', 'desc'), limit(200)), `cb-${companyId}-${uid}`);
  return (
    <Card padded={false}>
      <DataTable loading={list.loading} rows={list.data} onRowClick={(b) => navigate(`/manage/${companyId}/bookings/${b.id}`)} empty="No bookings yet." columns={[
        { key: 'when', header: 'When', render: (b) => <span className="whitespace-nowrap">{fmtShortDate(b.date)} <span className="text-slate-500">{timeRange(b.startMin, b.endMin)}</span></span> },
        { key: 'court', header: 'Court', render: (b) => b.courtName },
        { key: 'total', header: 'Total', render: (b) => formatMoney(b.pricing.total, b.pricing.currency), hideOnMobile: true },
        { key: 'status', header: 'Status', render: (b) => <BookingStatusBadge status={b.status} /> },
      ]} />
    </Card>
  );
}

function CustomerCredits({ uid }: { uid: string }) {
  const { companyId } = useCompany();
  const list = useQuery<CreditTransaction>(query(collection(db, 'companies', companyId, 'creditTransactions'), where('uid', '==', uid), orderBy('at', 'desc'), limit(200)), `cc-${companyId}-${uid}`);
  return <Card padded={false}><CreditTxnTable rows={list.data} loading={list.loading} /></Card>;
}

function CustomerMemberships({ uid }: { uid: string }) {
  const { companyId } = useCompany();
  const list = useQuery<Subscription>(query(collection(db, 'companies', companyId, 'subscriptions'), where('customerUid', '==', uid), orderBy('createdAt', 'desc'), limit(100)), `cs-${companyId}-${uid}`);
  return (
    <Card padded={false}>
      <DataTable loading={list.loading} rows={list.data} empty="No memberships." columns={[
        { key: 'name', header: 'Service', render: (s) => <span className="font-medium">{s.serviceName}</span> },
        { key: 'period', header: 'Period', render: (s) => `${fmtShortDate(s.startDate)} – ${fmtShortDate(s.endDate)}` },
        { key: 'sessions', header: 'Sessions', render: (s) => (s.sessionsTotal ? `${s.sessionsUsed} / ${s.sessionsTotal}` : `${s.sessionsUsed} used`), hideOnMobile: true },
        { key: 'status', header: 'Status', render: (s) => <SubscriptionBadge status={s.status} /> },
      ]} />
    </Card>
  );
}

function CustomerPayments({ uid }: { uid: string }) {
  const { companyId } = useCompany();
  const methods = usePaymentMethods();
  const list = useQuery<PaymentRow>(query(collection(db, 'companies', companyId, 'payments'), where('customerUid', '==', uid), orderBy('createdAt', 'desc'), limit(200)), `cp-${companyId}-${uid}`);
  return <Card padded={false}><PaymentsTable rows={list.data} loading={list.loading} methodName={(id) => methods.data.find((m) => m.id === id)?.name ?? id} /></Card>;
}
