import { useState } from 'react';
import { Compass } from 'lucide-react';
import { ACTIVE_BOOKING_STATUSES } from '@courtsync/shared';
import { useSession } from '@/lib/auth';
import { useMyBookings, useMyCompanies } from '@/lib/customer';
import { Card, EmptyState, ErrorState, LinkButton, Spinner, Tabs, Button } from '@/components/ui';
import { BookingCard } from '@/components/BookingCard';

export default function MyBookings() {
  const { user } = useSession();
  const [max, setMax] = useState(100);
  const bookings = useMyBookings(user?.uid, max);
  const companies = useMyCompanies(user?.uid);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const now = Date.now();
  const upcoming = bookings.data.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status) && b.endAt.toMillis() > now).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
  const past = bookings.data.filter((b) => !upcoming.includes(b));
  const rows = tab === 'upcoming' ? upcoming : past;
  const name = (id: string) => companies.data.find((c) => c.companyId === id)?.companyName;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My bookings</h1>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'upcoming', label: 'Upcoming', count: upcoming.length }, { value: 'past', label: 'Past and cancelled' }]} />
      {bookings.loading ? <Spinner /> : bookings.error ? <ErrorState error={bookings.error} /> : rows.length === 0 ? (
        <Card><EmptyState title={tab === 'upcoming' ? 'Nothing booked' : 'No past bookings'} action={tab === 'upcoming' && <LinkButton to="/explore" icon={<Compass className="h-4 w-4" />}>Find a court</LinkButton>} /></Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">{rows.map((b) => <BookingCard key={`${b.companyId}/${b.id}`} b={b} companyName={name(b.companyId)} />)}</div>
      )}
      {bookings.data.length >= max && <div className="text-center"><Button variant="ghost" onClick={() => setMax(max + 100)}>Load more</Button></div>}
    </div>
  );
}
