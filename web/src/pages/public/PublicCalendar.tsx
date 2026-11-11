import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import clsx from 'clsx';
import { useSession } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { getAvailability } from '@/lib/booking';
import { formatMinutes, formatMoney, todayISO } from '@/lib/format';
import { Logo } from '@/components/Logo';
import { Badge, Card, ErrorState, LinkButton, Spinner } from '@/components/ui';
import { DateStrip } from '@/components/DateStrip';

const DAYS = 14;

/** Read-only calendar anyone can open. Booking needs an account. */
export default function PublicCalendar() {
  const { companyId = '', courtId = '' } = useParams();
  const { user } = useSession();
  const [start] = useState(() => todayISO());
  const end = DateTime.fromISO(start).plus({ days: DAYS - 1 }).toISODate()!;
  const avail = useAsync(() => getAvailability(companyId, courtId, start, end), [companyId, courtId, start, !!user]);
  const [date, setDate] = useState(start);
  const free = useMemo(() => {
    const m = new Map((avail.data?.days ?? []).map((d) => [d.date, d.slots.filter((s) => s.state === 'available' || s.state === 'limited').length]));
    return (d: string) => m.get(d) ?? 0;
  }, [avail.data]);
  const bookPath = `/c/${companyId}/court/${courtId}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Logo />
          {user ? <LinkButton size="sm" to={bookPath}>Book this court</LinkButton> : <LinkButton size="sm" to="/login" variant="secondary">Sign in</LinkButton>}
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {avail.loading ? <Spinner /> : avail.error ? <ErrorState error={avail.error} /> : avail.data && (() => {
          const { company, court, days } = avail.data;
          const day = days.find((d) => d.date === date);
          return (
            <>
              <div>
                <p className="text-sm text-slate-500">{company.name}{company.city ? ` · ${company.city}` : ''}</p>
                <h1 className="text-2xl font-semibold">{court.name}</h1>
                <div className="mt-1 flex flex-wrap gap-1"><Badge>{court.sportName}</Badge><Badge>{court.environment === 'indoor' ? 'Indoor' : 'Outdoor'}</Badge>{court.status !== 'active' && <Badge tone="amber">Temporarily closed</Badge>}</div>
                {court.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{court.description}</p>}
                {court.pricing && <p className="mt-1 text-sm text-slate-600">{court.bookingModel === 'session' ? `${formatMoney(court.pricing.sessionPrice, company.currency)} per session` : `From ${formatMoney(court.pricing.basePrice, company.currency)} per hour${court.bookingModel === 'shared' ? ' per person' : ''}`}</p>}
              </div>
              {court.photoUrls.length > 0 && <div className="flex gap-2 overflow-x-auto">{court.photoUrls.map((u) => <img key={u} src={u} alt="" className="h-32 rounded-lg object-cover" />)}</div>}
              <Card><DateStrip dates={days.map((d) => d.date)} value={date} onChange={setDate} freeCount={free} /></Card>
              <Card>
                <p className="mb-3 font-medium">{DateTime.fromISO(date).toFormat('cccc, d LLLL')}</p>
                {!day || day.slots.filter((s) => s.state !== 'closed').length === 0 ? <p className="text-sm text-slate-500">Closed.</p> : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {day.slots.filter((s) => s.state !== 'closed').map((s) => {
                      const open = s.state === 'available' || s.state === 'limited';
                      return (
                        <div key={s.startMin} className={clsx('rounded-lg border px-2 py-2 text-center text-sm', open ? 'border-court-500/40 bg-white' : 'border-slate-200 bg-slate-100 text-slate-400')}>
                          <span className="block font-medium">{formatMinutes(s.startMin)}</span>
                          <span className="block text-[11px]">{open ? (s.price !== undefined ? formatMoney(s.price, company.currency) : court.bookingModel === 'shared' ? `${s.remaining} left` : 'Free') : s.state === 'past' ? '—' : 'Booked'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">{user ? 'Pick a time and book in a few taps.' : 'Create a free account or sign in to book.'}</p>
                {user ? <LinkButton to={bookPath}>Book now</LinkButton> : (
                  <div className="flex gap-2">
                    <Link to="/register" state={{ from: bookPath }} className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white">Create account</Link>
                    <Link to="/login" state={{ from: bookPath }} className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium">Sign in</Link>
                  </div>
                )}
              </Card>
            </>
          );
        })()}
      </main>
    </div>
  );
}
