import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { collection, collectionGroup, getDocs, orderBy, query, where, limit } from 'firebase/firestore';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Company, DailyStats } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useAsync, useQuery } from '@/lib/hooks';
import { useSports } from '@/lib/master';
import { formatMoney } from '@/lib/format';
import { Card, CardHeader, DataTable, ErrorState, Input, PageHeader, Select, Spinner, StatCard } from '@/components/ui';
import { ExportButtons } from '@/components/ExportButtons';

interface StatRow extends DailyStats {
  companyId: string;
}

export default function Reports() {
  const [from, setFrom] = useState(DateTime.now().minus({ days: 29 }).toISODate()!);
  const [to, setTo] = useState(DateTime.now().toISODate()!);
  const [country, setCountry] = useState('');
  const companies = useQuery<Company>(query(collection(db, 'companies'), orderBy('name'), limit(1000)), 'report-companies');
  const sports = useSports();
  const stats = useAsync(async () => {
    const snap = await getDocs(query(collectionGroup(db, 'stats'), where('date', '>=', from), where('date', '<=', to)));
    return snap.docs.map((d) => ({ ...(d.data() as DailyStats), companyId: d.ref.parent.parent!.id }) as StatRow);
  }, [from, to]);

  const companyById = useMemo(() => Object.fromEntries(companies.data.map((c) => [c.id, c])), [companies.data]);
  const rows = (stats.data ?? []).filter((r) => !country || companyById[r.companyId]?.countryCode === country);
  const countries = [...new Set(companies.data.map((c) => c.countryCode))].sort();

  const byDate = useMemo(() => {
    const m = new Map<string, { date: string; bookings: number; completed: number; cancelled: number; noShows: number }>();
    for (const d of eachDay(from, to)) m.set(d, { date: d, bookings: 0, completed: 0, cancelled: 0, noShows: 0 });
    for (const r of rows) {
      const e = m.get(r.date);
      if (!e) continue;
      e.bookings += r.bookings ?? 0;
      e.completed += r.completed ?? 0;
      e.cancelled += r.cancelled ?? 0;
      e.noShows += r.noShows ?? 0;
    }
    return [...m.values()].map((e) => ({ ...e, label: DateTime.fromISO(e.date).toFormat('d LLL') }));
  }, [rows, from, to]);

  const byCompany = useMemo(() => {
    const m = new Map<string, { id: string; name: string; currency: string; bookings: number; completed: number; cancelled: number; noShows: number; revenue: number; refunds: number; newCustomers: number }>();
    for (const r of rows) {
      const c = companyById[r.companyId];
      const e = m.get(r.companyId) ?? { id: r.companyId, name: c?.name ?? r.companyId, currency: c?.currency ?? '', bookings: 0, completed: 0, cancelled: 0, noShows: 0, revenue: 0, refunds: 0, newCustomers: 0 };
      e.bookings += r.bookings ?? 0;
      e.completed += r.completed ?? 0;
      e.cancelled += r.cancelled ?? 0;
      e.noShows += r.noShows ?? 0;
      e.revenue += r.revenue ?? 0;
      e.refunds += r.refunds ?? 0;
      e.newCustomers += r.newCustomers ?? 0;
      m.set(r.companyId, e);
    }
    return [...m.values()].sort((a, b) => b.bookings - a.bookings);
  }, [rows, companyById]);

  const bySport = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) for (const [s, v] of Object.entries(r.bySport ?? {})) m[s] = (m[s] ?? 0) + (v.bookings ?? 0);
    return Object.entries(m)
      .map(([id, bookings]) => ({ name: sports.data.find((s) => s.id === id)?.name ?? id, bookings }))
      .sort((a, b) => b.bookings - a.bookings);
  }, [rows, sports.data]);

  const revenueByCurrency = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of byCompany) if (c.currency) m[c.currency] = (m[c.currency] ?? 0) + c.revenue - c.refunds;
    return m;
  }, [byCompany]);

  const totals = byCompany.reduce((t, c) => ({ bookings: t.bookings + c.bookings, completed: t.completed + c.completed, cancelled: t.cancelled + c.cancelled, newCustomers: t.newCustomers + c.newCustomers }), { bookings: 0, completed: 0, cancelled: 0, newCustomers: 0 });

  return (
    <>
      <PageHeader
        title="Platform reports"
        description="Activity across every company, from the daily statistics each company records."
        actions={
          <ExportButtons
            fileName={`courtsync-platform-${from}-to-${to}`}
            rows={byCompany}
            columns={[
              { header: 'Company', value: (r) => r.name },
              { header: 'Currency', value: (r) => r.currency },
              { header: 'Bookings', value: (r) => r.bookings },
              { header: 'Completed', value: (r) => r.completed },
              { header: 'Cancelled', value: (r) => r.cancelled },
              { header: 'No-shows', value: (r) => r.noShows },
              { header: 'Revenue', value: (r) => r.revenue },
              { header: 'Refunds', value: (r) => r.refunds },
              { header: 'New customers', value: (r) => r.newCustomers },
            ]}
          />
        }
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input type="date" label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <Input type="date" label="To" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          <Select label="Country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="All countries" options={countries.map((c) => ({ value: c, label: c }))} />
        </div>
      </Card>
      {stats.loading ? (
        <Spinner />
      ) : stats.error ? (
        <ErrorState error={stats.error} retry={stats.reload} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Bookings" value={totals.bookings} />
            <StatCard label="Completed" value={totals.completed} tone="green" />
            <StatCard label="Cancelled" value={totals.cancelled} tone="amber" />
            <StatCard label="New customers" value={totals.newCustomers} tone="slate" />
          </div>
          {Object.keys(revenueByCurrency).length > 0 && (
            <Card>
              <CardHeader title="Net revenue" description="Payments received less refunds, per currency." />
              <div className="flex flex-wrap gap-6">
                {Object.entries(revenueByCurrency).map(([cur, v]) => (
                  <p key={cur} className="text-xl font-semibold">{formatMoney(v, cur)}</p>
                ))}
              </div>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Bookings per day" />
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={byDate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke="#16a34a" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke="#d97706" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardHeader title="Bookings by sport" />
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={bySport} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} fontSize={12} />
                    <YAxis type="category" dataKey="name" width={90} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="bookings" name="Bookings" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
          <Card padded={false}>
            <div className="p-4 pb-0">
              <CardHeader title="By company" />
            </div>
            <DataTable
              rows={byCompany}
              empty="No activity in this period."
              columns={[
                { key: 'name', header: 'Company', render: (r) => <span className="font-medium">{r.name}</span> },
                { key: 'bookings', header: 'Bookings', render: (r) => r.bookings },
                { key: 'completed', header: 'Completed', render: (r) => r.completed, hideOnMobile: true },
                { key: 'cancelled', header: 'Cancelled', render: (r) => r.cancelled, hideOnMobile: true },
                { key: 'revenue', header: 'Revenue', render: (r) => (r.currency ? formatMoney(r.revenue - r.refunds, r.currency) : r.revenue) },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(from);
  const end = DateTime.fromISO(to);
  while (d <= end && out.length < 400) {
    out.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return out;
}
