import { Link } from 'react-router-dom';
import { Compass, Search } from 'lucide-react';
import { ACTIVE_BOOKING_STATUSES } from '@courtsync/shared';
import { useSession } from '@/lib/auth';
import { useMyBookings, useMyCompanies, useMySubscriptions } from '@/lib/customer';
import { Avatar, Card, CardHeader, EmptyState, LinkButton, Spinner } from '@/components/ui';
import { BookingCard } from '@/components/BookingCard';
import { SubscriptionBadge } from '@/components/StatusBadge';

export default function Home() {
  const { user, profile } = useSession();
  const bookings = useMyBookings(user?.uid, 50);
  const companies = useMyCompanies(user?.uid);
  const subs = useMySubscriptions(user?.uid);
  const now = Date.now();
  const upcoming = bookings.data.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status) && b.endAt.toMillis() > now).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
  const companyName = (id: string) => companies.data.find((c) => c.companyId === id)?.companyName;
  const activeSubs = subs.data.filter((s) => s.status === 'active' || s.status === 'pendingPayment');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hi {profile?.displayName?.split(' ')[0] ?? 'there'}</h1>
        <p className="text-slate-600">Find a court and book in a few taps.</p>
      </div>
      <Link to="/explore" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-500 shadow-card hover:border-brand-300">
        <Search className="h-5 w-5" /> Search venues, sports or cities
      </Link>
      <section>
        <h2 className="mb-2 font-semibold">Upcoming</h2>
        {bookings.loading ? <Spinner /> : upcoming.length === 0 ? (
          <Card><EmptyState title="No upcoming bookings" description="Your next game will show here." action={<LinkButton to="/explore" icon={<Compass className="h-4 w-4" />}>Find a court</LinkButton>} /></Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">{upcoming.slice(0, 6).map((b) => <BookingCard key={`${b.companyId}/${b.id}`} b={b} companyName={companyName(b.companyId)} />)}</div>
        )}
      </section>
      {activeSubs.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Memberships</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {activeSubs.map((s) => (
              <Link key={s.id} to="/memberships" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-card">
                <span><span className="block font-medium">{s.serviceName}</span><span className="text-sm text-slate-500">{companyName(s.companyId)} · until {s.endDate}</span></span>
                <SubscriptionBadge status={s.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-2 font-semibold">Your venues</h2>
        {companies.data.length === 0 ? (
          <Card><p className="text-sm text-slate-500">You haven't joined any venue yet. <Link to="/explore" className="font-medium text-brand-700">Explore venues</Link>.</p></Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {companies.data.map((c) => (
              <Link key={c.companyId} to={`/c/${c.companyId}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-card hover:border-brand-300">
                <Avatar name={c.companyName} />
                <span className="min-w-0"><span className="block truncate font-medium">{c.companyName}</span><span className="text-xs text-slate-500">{c.creditBalance > 0 ? `${c.creditBalance} credits` : c.status !== 'active' ? c.status : 'Member'}</span></span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <Card>
        <CardHeader title="Run a sports facility?" description="CourtSync helps venues manage courts, bookings and payments. Contact us to get your venue listed." />
      </Card>
    </div>
  );
}
