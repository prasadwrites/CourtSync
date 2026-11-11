import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { eachDate, openRanges, type DailyStats } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useAsync } from '@/lib/hooks';
import { usePaymentMethods } from '@/lib/master';
import { formatMoney, todayISO } from '@/lib/format';
import { Card, CardHeader, DataTable, ErrorState, Input, PageHeader, Select, Spinner, StatCard } from '@/components/ui';
import { ExportButtons } from '@/components/ExportButtons';
import { useCompany } from './context';
import { useCustomers } from './shared';

const PRESETS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

export default function Reports() {
  const { companyId, company, courts, sportName, courtName } = useCompany();
  const methods = usePaymentMethods();
  const customers = useCustomers();
  const today = todayISO(company.timezone);
  const [preset, setPreset] = useState('30');
  const [from, setFrom] = useState(DateTime.fromISO(today).minus({ days: 29 }).toISODate()!);
  const [to, setTo] = useState(today);
  const applyPreset = (p: string) => {
    setPreset(p);
    if (p === 'custom') return;
    if (p === 'month') {
      setFrom(DateTime.fromISO(today).startOf('month').toISODate()!);
      setTo(today);
    } else {
      setFrom(DateTime.fromISO(today).minus({ days: Number(p) - 1 }).toISODate()!);
      setTo(today);
    }
  };
  const stats = useAsync(async () => {
    const snap = await getDocs(query(collection(db, 'companies', companyId, 'stats'), where('date', '>=', from), where('date', '<=', to)));
    return snap.docs.map((d) => d.data() as DailyStats);
  }, [companyId, from, to]);

  const days = useMemo(() => {
    const m = new Map((stats.data ?? []).map((s) => [s.date, s]));
    return eachDate(from, to).map((date) => {
      const s = m.get(date);
      return {
        id: date,
        date,
        label: DateTime.fromISO(date).toFormat('d LLL'),
        bookings: s?.bookings ?? 0,
        completed: s?.completed ?? 0,
        cancelled: s?.cancelled ?? 0,
        noShows: s?.noShows ?? 0,
        revenue: s?.revenue ?? 0,
        refunds: s?.refunds ?? 0,
        net: (s?.revenue ?? 0) - (s?.refunds ?? 0),
        newCustomers: s?.newCustomers ?? 0,
        creditsIssued: s?.creditsIssued ?? 0,
        creditsRedeemed: s?.creditsRedeemed ?? 0,
        newSubscriptions: s?.newSubscriptions ?? 0,
        bookedHours: Math.round(((s?.bookedMinutes ?? 0) / 60) * 10) / 10,
      };
    });
  }, [stats.data, from, to]);

  const sum = <K extends keyof (typeof days)[number]>(k: K) => days.reduce((t, d) => t + (d[k] as number), 0);
  const agg = useMemo(() => {
    const byCourt: Record<string, { bookings: number; revenue: number; minutes: number }> = {};
    const bySport: Record<string, { bookings: number; revenue: number }> = {};
    const byHour: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    const byCustomer: Record<string, number> = {};
    for (const s of stats.data ?? []) {
      for (const [k, v] of Object.entries(s.byCourt ?? {})) { const e = (byCourt[k] ??= { bookings: 0, revenue: 0, minutes: 0 }); e.bookings += v.bookings ?? 0; e.revenue += v.revenue ?? 0; e.minutes += v.minutes ?? 0; }
      for (const [k, v] of Object.entries(s.bySport ?? {})) { const e = (bySport[k] ??= { bookings: 0, revenue: 0 }); e.bookings += v.bookings ?? 0; e.revenue += v.revenue ?? 0; }
      for (const [k, v] of Object.entries(s.byHour ?? {})) byHour[k] = (byHour[k] ?? 0) + v;
      for (const [k, v] of Object.entries(s.byMethod ?? {})) byMethod[k] = (byMethod[k] ?? 0) + v;
      for (const [k, v] of Object.entries(s.byCustomer ?? {})) byCustomer[k] = (byCustomer[k] ?? 0) + v;
    }
    // Utilisation: booked minutes against opening minutes in the period.
    const dates = eachDate(from, to);
    const courtRows = courts.map((c) => {
      const open = dates.reduce((t, d) => t + openRanges(c, d).reduce((x, r) => x + (r.end - r.start), 0), 0);
      const e = byCourt[c.id] ?? { bookings: 0, revenue: 0, minutes: 0 };
      const capacity = c.bookingModel === 'shared' ? Math.max(1, c.capacity) : 1;
      return { id: c.id, name: c.name, sport: sportName(c.sportId), ...e, utilisation: open ? Math.min(100, Math.round((e.minutes / (open * capacity)) * 100)) : 0 };
    });
    for (const [id, e] of Object.entries(byCourt)) if (!courts.some((c) => c.id === id)) courtRows.push({ id, name: courtName(id), sport: '', ...e, utilisation: 0 });
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, bookings: byHour[String(h)] ?? 0 })).filter((_, h) => h >= 5 || byHour[String(h)]);
    return {
      courtRows: courtRows.sort((a, b) => b.bookings - a.bookings),
      sports: Object.entries(bySport).map(([id, e]) => ({ name: sportName(id), ...e })).sort((a, b) => b.bookings - a.bookings),
      hours,
      methods: Object.entries(byMethod).map(([id, v]) => ({ id, name: methods.data.find((m) => m.id === id)?.name ?? id, amount: v })).sort((a, b) => b.amount - a.amount),
      customers: Object.entries(byCustomer).map(([id, v]) => ({ id, name: customers.data.find((c) => c.id === id)?.displayName ?? id.slice(0, 8), spent: v })).filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 15),
    };
  }, [stats.data, courts, from, to, sportName, courtName, methods.data, customers.data]);

  const money = (v: number) => formatMoney(v, company.currency);
  return (
    <>
      <PageHeader title="Reports" actions={
        <ExportButtons fileName={`report-${from}-to-${to}`} rows={days} columns={[
          { header: 'Date', value: (d) => d.date },
          { header: 'Bookings', value: (d) => d.bookings },
          { header: 'Completed', value: (d) => d.completed },
          { header: 'Cancelled', value: (d) => d.cancelled },
          { header: 'No-shows', value: (d) => d.noShows },
          { header: 'Booked hours', value: (d) => d.bookedHours },
          { header: `Revenue (${company.currency})`, value: (d) => d.revenue },
          { header: `Refunds (${company.currency})`, value: (d) => d.refunds },
          { header: `Net (${company.currency})`, value: (d) => d.net },
          { header: 'New customers', value: (d) => d.newCustomers },
          { header: 'New memberships', value: (d) => d.newSubscriptions },
          { header: 'Credits issued', value: (d) => d.creditsIssued },
          { header: 'Credits redeemed', value: (d) => d.creditsRedeemed },
        ]} />
      } />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Period" value={preset} onChange={(e) => applyPreset(e.target.value)} options={PRESETS} />
          <Input type="date" label="From" value={from} max={to} onChange={(e) => { if (e.target.value) { setPreset('custom'); setFrom(e.target.value); } }} />
          <Input type="date" label="To" value={to} min={from} onChange={(e) => { if (e.target.value) { setPreset('custom'); setTo(e.target.value); } }} />
        </div>
      </Card>
      {stats.loading ? <Spinner /> : stats.error ? <ErrorState error={stats.error} retry={stats.reload} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Bookings" value={sum('bookings')} hint={`${sum('bookedHours').toFixed(1)} hours booked`} />
            <StatCard label="Net revenue" value={money(sum('net'))} tone="green" hint={`${money(sum('refunds'))} refunded`} />
            <StatCard label="Cancellations" value={sum('cancelled')} tone="amber" hint={`${sum('noShows')} no-shows`} />
            <StatCard label="New customers" value={sum('newCustomers')} tone="slate" hint={`${sum('newSubscriptions')} new memberships`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Bookings per day">
              <LineChart data={days}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartCard>
            <ChartCard title={`Revenue per day (${company.currency})`}>
              <BarChart data={days}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} /><Tooltip formatter={(v: number) => money(v)} /><Legend />
                <Bar dataKey="revenue" name="Received" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="refunds" name="Refunded" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="Busiest hours">
              <BarChart data={agg.hours}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="hour" fontSize={11} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip />
                <Bar dataKey="bookings" name="Bookings starting" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="Bookings by sport">
              <BarChart data={agg.sports} layout="vertical" margin={{ left: 24 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} fontSize={12} /><YAxis type="category" dataKey="name" width={90} fontSize={12} /><Tooltip />
                <Bar dataKey="bookings" name="Bookings" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>
          </div>
          <Card padded={false}>
            <div className="flex items-center justify-between p-4 pb-0"><CardHeader title="Courts" description="Utilisation is booked time against opening hours." />
              <ExportButtons fileName={`courts-${from}-to-${to}`} rows={agg.courtRows} columns={[
                { header: 'Court', value: (r) => r.name }, { header: 'Sport', value: (r) => r.sport }, { header: 'Bookings', value: (r) => r.bookings },
                { header: 'Booked hours', value: (r) => Math.round(r.minutes / 6) / 10 }, { header: 'Utilisation %', value: (r) => r.utilisation }, { header: 'Revenue', value: (r) => r.revenue },
              ]} />
            </div>
            <DataTable rows={agg.courtRows} empty="No court activity in this period." columns={[
              { key: 'name', header: 'Court', render: (r) => <span className="font-medium">{r.name}</span> },
              { key: 'bookings', header: 'Bookings', render: (r) => r.bookings },
              { key: 'hours', header: 'Hours', render: (r) => (r.minutes / 60).toFixed(1), hideOnMobile: true },
              { key: 'util', header: 'Utilisation', render: (r) => <span className="flex items-center gap-2"><span className="h-2 w-20 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-court-600" style={{ width: `${r.utilisation}%` }} /></span>{r.utilisation}%</span> },
              { key: 'revenue', header: 'Revenue', render: (r) => money(r.revenue), hideOnMobile: true },
            ]} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card padded={false}>
              <div className="p-4 pb-0"><CardHeader title="Payment methods" /></div>
              <DataTable rows={agg.methods} empty="No payments in this period." columns={[
                { key: 'name', header: 'Method', render: (r) => r.name },
                { key: 'amount', header: 'Received', render: (r) => money(r.amount) },
              ]} />
            </Card>
            <Card padded={false}>
              <div className="p-4 pb-0"><CardHeader title="Top customers by spend" /></div>
              <DataTable rows={agg.customers} empty="No payments in this period." columns={[
                { key: 'name', header: 'Customer', render: (r) => r.name },
                { key: 'spent', header: 'Paid', render: (r) => money(r.spent) },
              ]} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="h-64"><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </Card>
  );
}
