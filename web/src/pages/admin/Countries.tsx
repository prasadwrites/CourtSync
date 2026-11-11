import { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { countrySchema, type Country } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useCountries, usePaymentMethods, COMMON_TIMEZONES } from '@/lib/master';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Alert, Badge, Button, Card, Checkbox, DataTable, ErrorState, Input, Modal, PageHeader, SearchInput, Switch } from '@/components/ui';
import { ActiveBadge } from '@/components/StatusBadge';

type Row = Country & { id: string };

const blank: Country = {
  name: '',
  code: '',
  dialCode: '+',
  currency: '',
  currencySymbol: '',
  paymentMethodIds: [],
  timezones: [],
  businessVerification: [],
  enabled: true,
};

export default function Countries() {
  const countries = useCountries();
  const methods = usePaymentMethods();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ value: Country; isNew: boolean } | null>(null);
  const methodName = (id: string) => methods.data.find((m) => m.id === id)?.name ?? id;
  const rows = countries.data.filter((c) => `${c.name} ${c.code} ${c.currency}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Countries"
        description="Countries decide currency, dialing code, time zones, payment methods, and business verification for companies registered there."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ value: { ...blank }, isNew: true })}>Add country</Button>}
      />
      {countries.error ? (
        <ErrorState error={countries.error} />
      ) : (
        <Card padded={false}>
          <div className="border-b border-slate-100 p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search countries" className="max-w-sm" />
          </div>
          <DataTable<Row>
            loading={countries.loading}
            rows={rows}
            onRowClick={(r) => setEditing({ value: r, isNew: false })}
            empty="No countries yet. Add the first country your companies operate in."
            columns={[
              { key: 'name', header: 'Country', render: (r) => <span className="font-medium">{r.name} <span className="text-slate-400">{r.code}</span></span> },
              { key: 'currency', header: 'Currency', render: (r) => `${r.currency} (${r.currencySymbol})` },
              { key: 'dial', header: 'Dial code', render: (r) => r.dialCode, hideOnMobile: true },
              { key: 'methods', header: 'Payment methods', render: (r) => <div className="flex flex-wrap gap-1">{r.paymentMethodIds.map((m) => <Badge key={m}>{methodName(m)}</Badge>)}</div>, hideOnMobile: true },
              { key: 'tz', header: 'Time zones', render: (r) => r.timezones.length, hideOnMobile: true },
              { key: 'status', header: 'Status', render: (r) => <ActiveBadge active={r.enabled} /> },
            ]}
          />
        </Card>
      )}
      {editing && <CountryEditor initial={editing.value} isNew={editing.isNew} onClose={() => setEditing(null)} methods={methods.data} />}
    </>
  );
}

function CountryEditor({ initial, isNew, onClose, methods }: { initial: Country; isNew: boolean; onClose: () => void; methods: { id: string; name: string; enabled: boolean }[] }) {
  const toast = useToast();
  const [v, setV] = useState<Country>(initial);
  const [tzInput, setTzInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Country>(k: K, val: Country[K]) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    const parsed = countrySchema.safeParse(v);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setSaving(true);
    try {
      const data = parsed.data;
      await setDoc(doc(db, 'countries', data.code), { ...data, updatedAt: serverTimestamp(), ...(isNew ? { createdAt: serverTimestamp() } : {}) }, { merge: true });
      toast.success(`${data.name} saved`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const addTz = (tz: string) => {
    const t = tz.trim();
    if (t && !v.timezones.includes(t)) set('timezones', [...v.timezones, t]);
    setTzInput('');
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Add country' : `Edit ${initial.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save country</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" required value={v.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="ISO code" hint="Two letters, e.g. IN" required disabled={!isNew} value={v.code} error={errors.code} maxLength={2} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          <Input label="Dialing code" required value={v.dialCode} error={errors.dialCode} onChange={(e) => set('dialCode', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Currency" hint="ISO 4217" required value={v.currency} maxLength={3} error={errors.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
            <Input label="Symbol" required value={v.currencySymbol} error={errors.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} />
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Payment methods</legend>
          {methods.length === 0 ? (
            <p className="text-sm text-slate-500">Add payment methods first, then enable them here.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map((m) => (
                <Checkbox
                  key={m.id}
                  checked={v.paymentMethodIds.includes(m.id)}
                  onChange={(on) => set('paymentMethodIds', on ? [...v.paymentMethodIds, m.id] : v.paymentMethodIds.filter((x) => x !== m.id))}
                  label={<>{m.name}{!m.enabled && <span className="text-slate-400"> (disabled)</span>}</>}
                />
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Time zones</legend>
          {errors.timezones && <p className="mb-1 text-xs text-red-600">Add at least one time zone.</p>}
          <div className="mb-2 flex flex-wrap gap-1">
            {v.timezones.map((tz) => (
              <Badge key={tz} tone="brand">
                {tz}
                <button type="button" aria-label={`Remove ${tz}`} onClick={() => set('timezones', v.timezones.filter((x) => x !== tz))}>×</button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input list="tz-list" placeholder="e.g. Asia/Kolkata" value={tzInput} onChange={(e) => setTzInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTz(tzInput))} />
            <datalist id="tz-list">{(Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone').map((t) => <option key={t} value={t} />) ?? COMMON_TIMEZONES.map((t) => <option key={t} value={t} />)}</datalist>
            <Button variant="secondary" onClick={() => addTz(tzInput)}>Add</Button>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Business verification documents</legend>
          <p className="mb-2 text-xs text-slate-500">What companies registering in this country must provide, e.g. GST certificate or trade licence.</p>
          <div className="space-y-2">
            {v.businessVerification.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label="Document" value={b.label} onChange={(e) => set('businessVerification', v.businessVerification.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Checkbox checked={b.required} onChange={(on) => set('businessVerification', v.businessVerification.map((x, j) => (j === i ? { ...x, required: on } : x)))} label="Required" />
                <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => set('businessVerification', v.businessVerification.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set('businessVerification', [...v.businessVerification, { label: '', required: false }])}>Add document</Button>
          </div>
        </fieldset>

        <Switch checked={v.enabled} onChange={(on) => set('enabled', on)} label="Enabled" description="Disabled countries are hidden when creating companies and in customer search." />
        {Object.keys(errors).length > 0 && <Alert tone="error">Check the highlighted fields.</Alert>}
      </div>
    </Modal>
  );
}
