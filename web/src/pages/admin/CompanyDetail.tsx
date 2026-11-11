import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { KeyRound, MailCheck, Plus, UserX, ExternalLink } from 'lucide-react';
import { ROLE_LABELS, STAFF_ROLES, type AuditLog, type Company, type CompanyStatus, type StaffMember, type StaffRole } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc, useQuery } from '@/lib/hooks';
import { useSports } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs } from '@/lib/format';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, ErrorState, Input, KeyValue, LinkButton, Modal, PageHeader, Select, Spinner, StatCard, Tabs, Textarea, Switch } from '@/components/ui';
import { ActiveBadge, CompanyStatusBadge } from '@/components/StatusBadge';

type Tab = 'overview' | 'admins' | 'restrictions' | 'details' | 'activity';

export default function CompanyDetail() {
  const { companyId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const company = useDoc<Company>(doc(db, 'companies', companyId), `company-${companyId}`);
  if (company.loading) return <Spinner />;
  if (company.error) return <ErrorState error={company.error} />;
  if (!company.data) return <ErrorState error={new Error('Company not found')} />;
  const c = company.data;
  return (
    <>
      <PageHeader
        back="/admin/companies"
        title={<span className="flex flex-wrap items-center gap-2">{c.name} <CompanyStatusBadge status={c.status} /></span>}
        description={`${c.city ? `${c.city}, ` : ''}${c.countryCode} · ${c.currency} · ${c.timezone}`}
        actions={<LinkButton variant="secondary" to={`/manage/${companyId}`} icon={<ExternalLink className="h-4 w-4" />}>Open company admin</LinkButton>}
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'admins', label: 'Administrators' },
          { value: 'restrictions', label: 'Sports and restrictions' },
          { value: 'details', label: 'Company information' },
          { value: 'activity', label: 'Activity' },
        ]}
      />
      {tab === 'overview' && <Overview c={c} />}
      {tab === 'admins' && <Admins companyId={companyId} />}
      {tab === 'restrictions' && <Restrictions c={c} />}
      {tab === 'details' && <Details c={c} />}
      {tab === 'activity' && <Activity companyId={companyId} />}
    </>
  );
}

function Overview({ c }: { c: Company & { id: string } }) {
  const sports = useSports();
  const sportName = (id: string) => sports.data.find((s) => s.id === id)?.name ?? id;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Branches" value={c.stats?.branches ?? 0} tone="slate" />
        <StatCard label="Courts" value={c.stats?.courts ?? 0} tone="slate" />
        <StatCard label="Customers" value={c.stats?.customers ?? 0} />
        <StatCard label="Bookings" value={c.stats?.bookings ?? 0} tone="green" />
        <StatCard label="Completed" value={c.stats?.completedBookings ?? 0} tone="green" />
      </div>
      <StatusActions c={c} />
      <Card>
        <CardHeader title="Profile" />
        <KeyValue
          items={[
            { label: 'Contact email', value: c.contact?.email },
            { label: 'Phone', value: c.contact?.phone },
            { label: 'Website', value: c.contact?.website },
            { label: 'Subscription', value: `${c.subscription?.plan} (${c.subscription?.status})` },
            { label: 'Permitted sports', value: c.allowedSportIds.map(sportName).join(', ') },
            { label: 'Sports with courts', value: c.sportIds.map(sportName).join(', ') },
            { label: 'Created', value: fmtTs(c.createdAt) },
            { label: 'Status note', value: c.statusReason },
          ]}
        />
      </Card>
    </div>
  );
}

function StatusActions({ c }: { c: Company & { id: string } }) {
  const toast = useToast();
  const [target, setTarget] = useState<CompanyStatus | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const labels: Record<CompanyStatus, string> = { active: c.status === 'suspended' ? 'Revoke suspension' : 'Activate', inactive: 'Deactivate', suspended: 'Suspend', disabled: 'Permanently disable' };
  const options = (['active', 'inactive', 'suspended', 'disabled'] as CompanyStatus[]).filter((s) => s !== c.status);
  if (c.status === 'disabled') return <Alert tone="error" title="Permanently disabled">This company can no longer be used. {c.statusReason}</Alert>;
  return (
    <Card>
      <CardHeader title="Account status" description="Suspended and disabled companies can't take bookings, and their staff can't make changes." />
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Button key={s} variant={s === 'disabled' ? 'danger' : s === 'active' ? 'success' : 'secondary'} onClick={() => setTarget(s)}>
            {labels[s]}
          </Button>
        ))}
      </div>
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? `${labels[target]}?` : ''}
        tone={target === 'disabled' || target === 'suspended' ? 'danger' : 'primary'}
        confirmLabel={target ? labels[target] : ''}
        loading={busy}
        message={target === 'disabled' ? 'This cannot be undone. The company and its staff lose access permanently.' : 'The company administrators will be notified.'}
        onConfirm={async () => {
          if (!target) return;
          setBusy(true);
          try {
            await call('setCompanyStatus', { companyId: c.id, status: target, reason });
            toast.success('Status updated');
            setTarget(null);
            setReason('');
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Textarea label="Reason" className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} hint="Recorded in the audit log and shared with the company." />
      </ConfirmDialog>
    </Card>
  );
}

function Admins({ companyId }: { companyId: string }) {
  const toast = useToast();
  const staff = useQuery<StaffMember>(query(collection(db, `companies/${companyId}/staff`), orderBy('displayName')), `staff-${companyId}`);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'admin' as StaffRole });
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      const res = (await fn()) as { link?: string | null } | undefined;
      if (res?.link) setLink(res.link);
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add administrator</Button>
      </div>
      {link && (
        <div className="mb-3">
          <Alert tone="warning" title="Email isn't configured, so share this reset link securely">
            <input readOnly value={link} className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs" onFocus={(e) => e.target.select()} />
          </Alert>
        </div>
      )}
      <DataTable
        rows={staff.data}
        loading={staff.loading}
        columns={[
          { key: 'name', header: 'Name', render: (s) => <div><p className="font-medium text-slate-900">{s.displayName}</p><p className="text-xs text-slate-500">{s.email}</p></div> },
          { key: 'role', header: 'Role', render: (s) => <Badge tone="brand">{ROLE_LABELS[s.role]}</Badge> },
          { key: 'status', header: 'Status', render: (s) => <ActiveBadge active={s.status === 'active'} /> },
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            render: (s) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" title="Send password reset email" loading={busy === `r-${s.id}`} icon={<MailCheck className="h-4 w-4" />} onClick={() => act(`r-${s.id}`, () => call('sendPasswordReset', { uid: s.uid, companyId }), 'Password reset sent')}>
                  <span className="hidden sm:inline">Reset</span>
                </Button>
                <Button size="sm" variant="ghost" title="Require a new password at next sign-in" loading={busy === `f-${s.id}`} icon={<KeyRound className="h-4 w-4" />} onClick={() => act(`f-${s.id}`, () => call('forcePasswordReset', { uid: s.uid, companyId }), 'They must set a new password next time')}>
                  <span className="hidden sm:inline">Force change</span>
                </Button>
                <Button size="sm" variant="ghost" title={s.status === 'active' ? 'Deactivate' : 'Reactivate'} loading={busy === `s-${s.id}`} icon={<UserX className="h-4 w-4" />} onClick={() => act(`s-${s.id}`, () => call('updateStaff', { companyId, uid: s.uid, status: s.status === 'active' ? 'inactive' : 'active' }), 'Updated')}>
                  <span className="hidden sm:inline">{s.status === 'active' ? 'Deactivate' : 'Reactivate'}</span>
                </Button>
              </div>
            ),
          },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">Passwords are managed by Firebase Authentication. Nobody, including CourtSync administrators, can see an existing password.</p>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add administrator"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              loading={busy === 'add'}
              onClick={() =>
                act('add', async () => {
                  const r = await call<{ inviteLink: string | null }>('addStaff', { companyId, ...form, branchIds: [] });
                  setAdding(false);
                  setForm({ email: '', displayName: '', role: 'admin' });
                  return { link: r.inviteLink };
                }, 'Administrator added')
              }
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Full name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })} options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
        </div>
      </Modal>
    </>
  );
}

function Restrictions({ c }: { c: Company & { id: string } }) {
  const sports = useSports();
  const toast = useToast();
  const [allowed, setAllowed] = useState<string[]>(c.allowedSportIds);
  const [maxCourts, setMaxCourts] = useState(c.restrictions?.maxCourts?.toString() ?? '');
  const [maxBranches, setMaxBranches] = useState(c.restrictions?.maxBranches?.toString() ?? '');
  const [bookingsDisabled, setBookingsDisabled] = useState(!!c.restrictions?.bookingsDisabled);
  const [plan, setPlan] = useState(c.subscription?.plan ?? 'standard');
  const [subStatus, setSubStatus] = useState(c.subscription?.status ?? 'trial');
  const [busy, setBusy] = useState(false);
  const removed = c.allowedSportIds.filter((s) => !allowed.includes(s) && c.sportIds.includes(s));
  return (
    <Card>
      <CardHeader title="Permitted sports" description="Company administrators only see these sports and can only create courts for them." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sports.data.map((s) => (
          <Checkbox key={s.id} disabled={!s.enabled && !allowed.includes(s.id)} label={`${s.name}${s.enabled ? '' : ' (disabled)'}`} checked={allowed.includes(s.id)} onChange={(v) => setAllowed(v ? [...allowed, s.id] : allowed.filter((x) => x !== s.id))} />
        ))}
      </div>
      {removed.length > 0 && <div className="mt-3"><Alert tone="warning">Courts for removed sports will be deactivated and stop taking bookings.</Alert></div>}
      <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <Input label="Maximum courts" type="number" min={0} value={maxCourts} onChange={(e) => setMaxCourts(e.target.value)} hint="Leave empty for no limit." />
        <Input label="Maximum branches" type="number" min={0} value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} hint="Leave empty for no limit." />
        <Input label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} />
        <Select label="Subscription status" value={subStatus} onChange={(e) => setSubStatus(e.target.value as typeof subStatus)} options={['trial', 'active', 'pastDue', 'cancelled'].map((s) => ({ value: s, label: s }))} />
        <div className="sm:col-span-2">
          <Switch checked={bookingsDisabled} onChange={setBookingsDisabled} label="Pause new bookings" description="Customers can't book while this is on. Existing bookings stay." />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))));
              const r = await call<{ closedCourts: number }>('updateCompanyRestrictions', {
                companyId: c.id,
                allowedSportIds: allowed,
                restrictions: { maxCourts: num(maxCourts), maxBranches: num(maxBranches), bookingsDisabled },
                subscription: { plan, status: subStatus },
              });
              toast.success(r.closedCourts ? `Saved. ${r.closedCourts} courts were deactivated.` : 'Saved');
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save restrictions
        </Button>
      </div>
    </Card>
  );
}

function Details({ c }: { c: Company & { id: string } }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: c.name, description: c.description ?? '', city: c.city ?? '', email: c.contact?.email ?? '', phone: c.contact?.phone ?? '', website: c.contact?.website ?? '' });
  useEffect(() => setForm({ name: c.name, description: c.description ?? '', city: c.city ?? '', email: c.contact?.email ?? '', phone: c.contact?.phone ?? '', website: c.contact?.website ?? '' }), [c]);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <Input label="Contact email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        <div className="sm:col-span-2">
          <Textarea label="Description" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await updateDoc(doc(db, 'companies', c.id), {
                name: form.name.trim(),
                description: form.description,
                city: form.city,
                contact: { email: form.email, phone: form.phone, website: form.website },
                updatedAt: serverTimestamp(),
              });
              toast.success('Company updated');
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function Activity({ companyId }: { companyId: string }) {
  const logs = useQuery<AuditLog>(query(collection(db, 'auditLogs'), where('companyId', '==', companyId), orderBy('at', 'desc'), limit(100)), `audit-${companyId}`);
  return (
    <DataTable
      rows={logs.data}
      loading={logs.loading}
      columns={[
        { key: 'at', header: 'When', render: (l) => fmtTs(l.at) },
        { key: 'action', header: 'Action', render: (l) => <span className="font-medium">{l.action}</span> },
        { key: 'target', header: 'Target', render: (l) => `${l.targetType} ${l.targetId.slice(0, 12)}`, hideOnMobile: true },
        { key: 'actor', header: 'By', render: (l) => l.actorEmail ?? l.actorUid?.slice(0, 10) ?? 'system', hideOnMobile: true },
      ]}
    />
  );
}
