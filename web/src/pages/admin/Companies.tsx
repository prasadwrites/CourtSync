import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, orderBy, query } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { COMPANY_STATUSES, type Company, type CreateCompanyInput } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { useCountries, useSports } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs } from '@/lib/format';
import { Button, DataTable, Input, Modal, PageHeader, SearchInput, Select, Checkbox, Alert, EmptyState } from '@/components/ui';
import { CompanyStatusBadge } from '@/components/StatusBadge';

export default function Companies() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const companies = useQuery<Company>(query(collection(db, 'companies'), orderBy('name')), 'companies-by-name');
  const countries = useCountries();
  const rows = useMemo(
    () =>
      companies.data.filter(
        (c) =>
          (!status || c.status === status) &&
          (!country || c.countryCode === country) &&
          (!search || `${c.name} ${c.city ?? ''} ${c.contact?.email ?? ''}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [companies.data, status, country, search],
  );
  const creating = params.get('new') === '1';

  return (
    <>
      <PageHeader title="Companies" description="Every sports business on CourtSync." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>New company</Button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, city or email" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" placeholder="All statuses" options={COMPANY_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
        <Select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country" placeholder="All countries" options={countries.data.map((c) => ({ value: c.code, label: c.name }))} />
      </div>
      <DataTable
        rows={rows}
        loading={companies.loading}
        onRowClick={(c) => navigate(`/admin/companies/${c.id}`)}
        empty={<EmptyState title="No companies yet" description="Create the first sports business to get started." action={<Button onClick={() => setParams({ new: '1' })}>New company</Button>} />}
        columns={[
          { key: 'name', header: 'Company', render: (c) => <div><p className="font-medium text-slate-900">{c.name}</p><p className="text-xs text-slate-500">{c.city || c.countryCode}</p></div> },
          { key: 'status', header: 'Status', render: (c) => <CompanyStatusBadge status={c.status} /> },
          { key: 'courts', header: 'Courts', render: (c) => c.stats?.courts ?? 0, hideOnMobile: true },
          { key: 'customers', header: 'Customers', render: (c) => c.stats?.customers ?? 0, hideOnMobile: true },
          { key: 'bookings', header: 'Bookings', render: (c) => c.stats?.bookings ?? 0, hideOnMobile: true },
          { key: 'plan', header: 'Subscription', render: (c) => `${c.subscription?.plan ?? ''} (${c.subscription?.status ?? ''})`, hideOnMobile: true },
          { key: 'created', header: 'Created', render: (c) => fmtTs(c.createdAt, false), hideOnMobile: true },
        ]}
      />
      <CreateCompanyModal open={creating} onClose={() => setParams({})} onCreated={(id) => navigate(`/admin/companies/${id}`)} />
    </>
  );
}

function CreateCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const countries = useCountries();
  const sports = useSports();
  const toast = useToast();
  const [form, setForm] = useState<CreateCompanyInput>({ name: '', countryCode: '', timezone: '', city: '', allowedSportIds: [], admin: { email: '', displayName: '' }, plan: 'standard' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ id: string; link: string | null; delivered: boolean } | null>(null);
  const country = countries.data.find((c) => c.code === form.countryCode);
  useEffect(() => {
    if (country && !country.timezones.includes(form.timezone)) setForm((f) => ({ ...f, timezone: country.timezones[0] ?? '' }));
  }, [country, form.timezone]);
  const set = <K extends keyof CreateCompanyInput>(k: K, v: CreateCompanyInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    setInvite(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={invite ? 'Company created' : 'New company'}
      size="lg"
      footer={
        invite ? (
          <Button onClick={() => onCreated(invite.id)}>Open company</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const res = await call<{ companyId: string; inviteLink: string | null; inviteDelivered: boolean }>('createCompany', {
                    ...form,
                    city: form.city || undefined,
                  });
                  toast.success(`${form.name} created`);
                  setInvite({ id: res.companyId, link: res.inviteLink, delivered: res.inviteDelivered });
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create company
            </Button>
          </>
        )
      }
    >
      {invite ? (
        invite.delivered ? (
          <Alert tone="success" title="Invitation sent">The company administrator got an email to set their password.</Alert>
        ) : invite.link ? (
          <Alert tone="warning" title="Email isn't configured yet">
            <p>Send this one-time link to the administrator through a secure channel. It lets them set their own password.</p>
            <input readOnly value={invite.link} className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs" onFocus={(e) => e.target.select()} />
          </Alert>
        ) : (
          <Alert tone="success" title="Administrator added">That person already had a CourtSync account, so they can sign in now.</Alert>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Company name" required value={form.name} onChange={(e) => set('name', e.target.value)} className="" />
          <Input label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <Select label="Country" required value={form.countryCode} onChange={(e) => set('countryCode', e.target.value)} placeholder="Choose a country" options={countries.data.filter((c) => c.enabled).map((c) => ({ value: c.code, label: c.name }))} />
          <Select label="Time zone" required value={form.timezone} onChange={(e) => set('timezone', e.target.value)} options={(country?.timezones ?? []).map((t) => ({ value: t, label: t }))} placeholder={country ? undefined : 'Pick a country first'} />
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-700">Permitted sports</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sports.data.filter((s) => s.enabled).map((s) => (
                <Checkbox key={s.id} label={s.name} checked={form.allowedSportIds.includes(s.id)} onChange={(v) => set('allowedSportIds', v ? [...form.allowedSportIds, s.id] : form.allowedSportIds.filter((x) => x !== s.id))} />
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-900">Company administrator</p>
            <p className="text-xs text-slate-500">They'll get a link to set their own password. Nobody else ever sees it.</p>
          </div>
          <Input label="Full name" required value={form.admin.displayName} onChange={(e) => set('admin', { ...form.admin, displayName: e.target.value })} />
          <Input label="Email" type="email" required value={form.admin.email} onChange={(e) => set('admin', { ...form.admin, email: e.target.value })} />
          <Input label="Plan" value={form.plan} onChange={(e) => set('plan', e.target.value)} hint="Used for subscription tracking." />
          {error && <div className="sm:col-span-2"><Alert tone="error">{error}</Alert></div>}
        </div>
      )}
    </Modal>
  );
}
