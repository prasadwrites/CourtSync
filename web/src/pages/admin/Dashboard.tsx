import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, limit, orderBy, query } from 'firebase/firestore';
import { Building2, Users, LayoutGrid, CalendarCheck, Clock, PauseCircle, CheckCircle2, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import type { AuditLog, Company, PlatformStats } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc, useQuery } from '@/lib/hooks';
import { fmtRelative, formatMoney } from '@/lib/format';
import { Card, CardHeader, PageHeader, StatCard, Spinner, DataTable, LinkButton } from '@/components/ui';
import { CompanyStatusBadge } from '@/components/StatusBadge';

const COLORS = ['#1d4ed8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];

export default function Dashboard() {
  const stats = useDoc<PlatformStats>(doc(db, 'platformStats/summary'), 'platformStats');
  const companies = useQuery<Company>(query(collection(db, 'companies'), orderBy('createdAt', 'desc'), limit(200)), 'companies-all');
  const audit = useQuery<AuditLog>(query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(8)), 'audit-recent');
  const s = stats.data;

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    companies.data.forEach((c) => m.set(c.countryCode, (m.get(c.countryCode) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [companies.data]);
  const topCompanies = useMemo(() => [...companies.data].sort((a, b) => (b.stats?.bookings ?? 0) - (a.stats?.bookings ?? 0)).slice(0, 8), [companies.data]);

  if (stats.loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Platform overview" description="Everything happening across CourtSync." actions={<LinkButton to="/admin/companies?new=1">New company</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Companies" value={s?.companies ?? 0} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Active companies" value={s?.activeCompanies ?? 0} tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Suspended" value={s?.suspendedCompanies ?? 0} tone="amber" icon={<PauseCircle className="h-5 w-5" />} />
        <StatCard label="Registered users" value={s?.users ?? 0} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Facilities (branches)" value={s?.branches ?? 0} tone="slate" icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Courts" value={s?.courts ?? 0} tone="slate" icon={<LayoutGrid className="h-5 w-5" />} />
        <StatCard label="Total bookings" value={s?.bookings ?? 0} hint={`${s?.completedBookings ?? 0} completed`} tone="green" icon={<CalendarCheck className="h-5 w-5" />} />
        <StatCard label="Pending requests" value={s?.pendingBookings ?? 0} tone="amber" icon={<Clock className="h-5 w-5" />} />
      </div>

      {s?.revenueByCurrency && Object.keys(s.revenueByCurrency).length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Platform revenue" description="Net payments processed through CourtSync, by currency." />
          <div className="flex flex-wrap gap-6">
            {Object.entries(s.revenueByCurrency).map(([cur, v]) => (
              <div key={cur} className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-400" />
                <span className="text-lg font-semibold tabular-nums">{formatMoney(v, cur)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Company performance" description="Bookings per company." action={<Link to="/admin/reports" className="text-sm font-medium text-brand-700">Reports</Link>} />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={topCompanies.map((c) => ({ name: c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name, bookings: c.stats?.bookings ?? 0, completed: c.stats?.completedBookings ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Companies by country" />
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byCountry} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} label={(e) => e.name}>
                  {byCountry.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent registrations</h2>
          <DataTable
            rows={companies.data.slice(0, 6)}
            loading={companies.loading}
            pageSize={6}
            columns={[
              { key: 'name', header: 'Company', render: (c) => <Link className="font-medium text-slate-900 hover:text-brand-700" to={`/admin/companies/${c.id}`}>{c.name}</Link> },
              { key: 'country', header: 'Country', render: (c) => c.countryCode, hideOnMobile: true },
              { key: 'status', header: 'Status', render: (c) => <CompanyStatusBadge status={c.status} /> },
              { key: 'created', header: 'Created', render: (c) => fmtRelative(c.createdAt), hideOnMobile: true },
            ]}
          />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent account activity</h2>
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {audit.data.map((a) => (
                <li key={a.id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-slate-800">{a.action}</p>
                  <p className="text-xs text-slate-500">
                    {a.targetType} {a.targetId.slice(0, 10)} · {a.actorEmail ?? a.actorUid?.slice(0, 8) ?? 'system'} · {fmtRelative(a.at)}
                  </p>
                </li>
              ))}
              {!audit.data.length && <li className="px-4 py-6 text-center text-sm text-slate-500">No activity yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
