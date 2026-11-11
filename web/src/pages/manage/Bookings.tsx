import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS, type Booking, type BookingStatus } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDebounced, useQuery } from '@/lib/hooks';
import { fmtShortDate, formatMoney, timeRange, todayISO } from '@/lib/format';
import { Card, DataTable, ErrorState, Input, PageHeader, SearchInput, Select } from '@/components/ui';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import { ExportButtons } from '@/components/ExportButtons';
import { useCompany } from './context';

export default function Bookings() {
  const { companyId, company, courts, courtName, sportName } = useCompany();
  const navigate = useNavigate();
  const today = todayISO(company.timezone);
  const [from, setFrom] = useState(DateTime.fromISO(today).minus({ days: 7 }).toISODate()!);
  const [to, setTo] = useState(DateTime.fromISO(today).plus({ days: 30 }).toISODate()!);
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [courtId, setCourtId] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim().toLowerCase());

  const c: QueryConstraint[] = [];
  if (status) c.push(where('status', '==', status));
  c.push(where('date', '>=', from), where('date', '<=', to), orderBy('date', 'desc'), limit(1000));
  const bookings = useQuery<Booking>(query(collection(db, 'companies', companyId, 'bookings'), ...c), `bookings-${companyId}-${status}-${from}-${to}`);
  const rows = bookings.data
    .filter((b) => (!courtId || b.courtId === courtId) && (!q || `${b.customerName} ${b.customerContact ?? ''} ${b.verificationCode} ${b.id}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? 1 : -1));

  return (
    <>
      <PageHeader
        title="Bookings"
        actions={
          <ExportButtons
            fileName={`bookings-${from}-to-${to}`}
            rows={rows}
            columns={[
              { header: 'Booking id', value: (b) => b.id },
              { header: 'Date', value: (b) => b.date },
              { header: 'Start', value: (b) => timeRange(b.startMin, b.endMin).split(' – ')[0] },
              { header: 'End', value: (b) => timeRange(b.startMin, b.endMin).split(' – ')[1] },
              { header: 'Court', value: (b) => b.courtName },
              { header: 'Sport', value: (b) => sportName(b.sportId) },
              { header: 'Customer', value: (b) => b.customerName },
              { header: 'Contact', value: (b) => b.customerContact ?? '' },
              { header: 'Participants', value: (b) => b.participants },
              { header: 'Status', value: (b) => BOOKING_STATUS_LABELS[b.status] },
              { header: 'Payment', value: (b) => b.paymentStatus },
              { header: 'Total', value: (b) => b.pricing.total },
              { header: 'Paid', value: (b) => b.amountPaid },
              { header: 'Refunded', value: (b) => b.amountRefunded },
              { header: 'Currency', value: (b) => b.pricing.currency },
              { header: 'Source', value: (b) => b.source },
            ]}
          />
        }
      />
      <Card padded={false}>
        <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={search} onChange={setSearch} placeholder="Customer, code or id" />
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} placeholder="Any status" options={BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABELS[s] }))} />
          <Select aria-label="Court" value={courtId} onChange={(e) => setCourtId(e.target.value)} placeholder="All courts" options={courts.map((c) => ({ value: c.id, label: c.name }))} />
          <Input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <Input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
        {bookings.error ? (
          <ErrorState error={bookings.error} />
        ) : (
          <DataTable
            loading={bookings.loading}
            rows={rows}
            onRowClick={(b) => navigate(`/manage/${companyId}/bookings/${b.id}`)}
            empty="No bookings match these filters."
            columns={[
              { key: 'when', header: 'When', render: (b) => <span className="whitespace-nowrap"><span className="font-medium">{fmtShortDate(b.date)}</span> <span className="text-slate-500">{timeRange(b.startMin, b.endMin)}</span></span> },
              { key: 'customer', header: 'Customer', render: (b) => <span className="font-medium">{b.customerName}</span> },
              { key: 'court', header: 'Court', render: (b) => courtName(b.courtId) || b.courtName, hideOnMobile: true },
              { key: 'total', header: 'Total', render: (b) => formatMoney(b.pricing.total, b.pricing.currency), hideOnMobile: true },
              { key: 'payment', header: 'Payment', render: (b) => <PaymentStatusBadge status={b.paymentStatus} />, hideOnMobile: true },
              { key: 'status', header: 'Status', render: (b) => <BookingStatusBadge status={b.status} /> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
