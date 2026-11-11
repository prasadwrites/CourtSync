import { Link } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { CalendarPlus, ScanLine, UserPlus, CalendarOff } from 'lucide-react';
import type { Booking, DailyStats, Verification } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc, useQuery } from '@/lib/hooks';
import { formatMoney, timeRange, todayISO, fmtShortDate } from '@/lib/format';
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard } from '@/components/ui';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import { useCompany } from './context';

export default function Dashboard() {
  const { companyId, company, can, courts } = useCompany();
  const today = todayISO(company.timezone);
  const base = `/manage/${companyId}`;
  const todays = useQuery<Booking>(can('bookings.view') ? query(collection(db, 'companies', companyId, 'bookings'), where('date', '==', today), orderBy('startMin'), limit(200)) : null, `dash-today-${companyId}-${today}`);
  const pending = useQuery<Booking>(can('bookings.view') ? query(collection(db, 'companies', companyId, 'bookings'), where('status', '==', 'pendingApproval'), orderBy('startAt'), limit(20)) : null, `dash-pending-${companyId}`);
  const stats = useDoc<DailyStats>(can('reports.view') ? doc(db, 'companies', companyId, 'stats', `day_${today}`) : null, `dash-stats-${companyId}-${today}`);
  const verifs = useQuery<Verification>(can('verification.review') ? query(collection(db, 'companies', companyId, 'verifications'), where('status', '==', 'pending'), orderBy('submittedAt', 'desc'), limit(20)) : null, `dash-verif-${companyId}`);
  const live = todays.data.filter((b) => !['cancelled', 'rejected', 'expired'].includes(b.status));
  const checkedIn = live.filter((b) => b.status === 'checkedIn').length;

  return (
    <>
      <PageHeader
        title={`Today at ${company.name}`}
        description={fmtShortDate(today)}
        actions={
          <div className="flex flex-wrap gap-2">
            {can('checkin.operate') && <LinkButton variant="secondary" to={`${base}/check-in`} icon={<ScanLine className="h-4 w-4" />}>Check in</LinkButton>}
            {can('bookings.create') && <LinkButton to={`${base}/calendar?new=1`} icon={<CalendarPlus className="h-4 w-4" />}>New booking</LinkButton>}
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bookings today" value={live.length} />
        <StatCard label="Checked in now" value={checkedIn} tone="green" />
        <StatCard label="Waiting for approval" value={pending.data.length} tone="amber" />
        <StatCard label="Revenue today" value={stats.data ? formatMoney(stats.data.revenue ?? 0, company.currency) : formatMoney(0, company.currency)} tone="slate" hint={`${company.stats?.customers ?? 0} customers in total`} />
      </div>
      {courts.length === 0 && can('courts.manage') && (
        <Card className="mb-4">
          <EmptyState title="Add your first court" description="Customers can book once a court has operating hours and prices." action={<LinkButton to={`${base}/courts/new`}>Add a court</LinkButton>} />
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="p-4 pb-2">
            <CardHeader title="Today's schedule" action={<Link className="text-sm font-medium text-brand-700" to={`${base}/calendar`}>Open calendar</Link>} />
          </div>
          {live.length === 0 ? (
            <p className="px-4 pb-6 text-sm text-slate-500">No bookings today.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {live.map((b) => (
                <li key={b.id}>
                  <Link to={`${base}/bookings/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="w-28 shrink-0 text-sm font-medium tabular-nums">{timeRange(b.startMin, b.endMin)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{b.customerName}</span>
                      <span className="block truncate text-xs text-slate-500">{b.courtName} · {b.participants} {b.participants === 1 ? 'player' : 'players'}</span>
                    </span>
                    <span className="hidden sm:block"><PaymentStatusBadge status={b.paymentStatus} /></span>
                    <BookingStatusBadge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card padded={false}>
            <div className="p-4 pb-2">
              <CardHeader title="Needs approval" />
            </div>
            {pending.data.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-500">Nothing waiting.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.data.map((b) => (
                  <li key={b.id}>
                    <Link to={`${base}/bookings/${b.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                      <span className="block text-sm font-medium">{b.customerName}</span>
                      <span className="block text-xs text-slate-500">{b.courtName} · {fmtShortDate(b.date)} · {timeRange(b.startMin, b.endMin)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {can('verification.review') && verifs.data.length > 0 && (
            <Card>
              <CardHeader title="ID checks waiting" description={`${verifs.data.length} customer${verifs.data.length === 1 ? '' : 's'} submitted documents.`} action={<Link className="text-sm font-medium text-brand-700" to={`${base}/verifications`}>Review</Link>} />
            </Card>
          )}
          <Card>
            <CardHeader title="Shortcuts" />
            <div className="grid gap-2">
              {can('customers.manage') && <LinkButton variant="secondary" to={`${base}/customers?new=1`} icon={<UserPlus className="h-4 w-4" />}>Add a customer</LinkButton>}
              {can('calendar.block') && <LinkButton variant="secondary" to={`${base}/availability`} icon={<CalendarOff className="h-4 w-4" />}>Block time or add a holiday</LinkButton>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
