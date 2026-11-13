import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import type { Booking } from '@courtsync/shared';
import { formatMinutes } from '@/lib/format';
import { BookingStatusBadge } from './StatusBadge';

export function BookingCard({ b, companyName }: { b: Booking & { id: string }; companyName?: string }) {
  const d = DateTime.fromISO(b.date);
  return (
    <Link to={`/bookings/${b.companyId}/${b.id}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-card hover:border-brand-300">
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-50 text-brand-800">
        <span className="text-[11px] font-medium uppercase">{d.toFormat('LLL')}</span>
        <span className="text-xl font-semibold leading-none">{d.toFormat('d')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{b.courtName}</p>
        <p className="truncate text-sm text-slate-500">{d.toFormat('cccc')} · {formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}{companyName ? ` · ${companyName}` : ''}</p>
      </div>
      <BookingStatusBadge status={b.status} />
    </Link>
  );
}
