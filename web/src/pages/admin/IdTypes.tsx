import { useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, ShieldAlert } from 'lucide-react';
import { identificationTypeSchema, type IdentificationType } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useCountries, useIdTypes } from '@/lib/master';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { slugId } from '@/lib/slug';
import { Alert, Badge, Button, Card, Checkbox, DataTable, ErrorState, Input, Modal, PageHeader, Select, Switch } from '@/components/ui';
import { ActiveBadge } from '@/components/StatusBadge';

type Row = IdentificationType & { id: string };
type FieldKey = keyof IdentificationType['fields'];
const FIELD_LABELS: Record<FieldKey, string> = { number: 'Document number', image: 'Document image', expiryDate: 'Expiry date', issuingRegion: 'Issuing state or region' };

const blank = (countryCode: string): IdentificationType => ({
  name: '',
  countryCode,
  appliesTo: { company: false, customer: true },
  mandatoryFor: { company: false, customer: false },
  fields: {
    number: { enabled: true, required: true, pattern: '', hint: '' },
    image: { enabled: true, required: false },
    expiryDate: { enabled: false, required: false },
    issuingRegion: { enabled: false, required: false },
  },
  highlySensitive: false,
  enabled: true,
});

export default function IdTypes() {
  const types = useIdTypes();
  const countries = useCountries();
  const [country, setCountry] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; value: IdentificationType } | null>(null);
  const rows = types.data.filter((t) => !country || t.countryCode === country);
  const countryName = (code: string) => countries.data.find((c) => c.code === code)?.name ?? code;

  return (
    <>
      <PageHeader
        title="Identity configuration"
        description="Identification documents each country accepts, which fields they collect, and whether they are mandatory. Nothing is mandatory unless you set it here."
        actions={<Button icon={<Plus className="h-4 w-4" />} disabled={countries.data.length === 0} onClick={() => setEditing({ id: null, value: blank(country || countries.data[0]?.code || '') })}>Add document type</Button>}
      />
      <Alert tone="info">
        Document numbers are encrypted at rest and shown masked. Mark national identifiers such as SSN or Aadhaar as highly sensitive so staff see extra warnings and every reveal is audited.
      </Alert>
      {types.error ? (
        <ErrorState error={types.error} />
      ) : (
        <Card padded={false} className="mt-4">
          <div className="border-b border-slate-100 p-3">
            <Select className="max-w-xs" aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="All countries" options={countries.data.map((c) => ({ value: c.code, label: c.name }))} />
          </div>
          <DataTable<Row>
            loading={types.loading}
            rows={rows}
            onRowClick={(r) => setEditing({ id: r.id, value: r })}
            empty="No identification types configured."
            columns={[
              { key: 'name', header: 'Document', render: (r) => <span className="flex items-center gap-1.5 font-medium">{r.name}{r.highlySensitive && <ShieldAlert className="h-4 w-4 text-amber-600" aria-label="Highly sensitive" />}</span> },
              { key: 'country', header: 'Country', render: (r) => countryName(r.countryCode) },
              { key: 'applies', header: 'Used for', render: (r) => <div className="flex gap-1">{r.appliesTo.customer && <Badge tone="brand">Customers{r.mandatoryFor.customer ? ' (required)' : ''}</Badge>}{r.appliesTo.company && <Badge tone="purple">Companies{r.mandatoryFor.company ? ' (required)' : ''}</Badge>}</div>, hideOnMobile: true },
              { key: 'status', header: 'Status', render: (r) => <ActiveBadge active={r.enabled} labels={['Enabled', 'Disabled']} /> },
            ]}
          />
        </Card>
      )}
      {editing && <IdTypeEditor id={editing.id} initial={editing.value} countries={countries.data} onClose={() => setEditing(null)} />}
    </>
  );
}

function IdTypeEditor({ id, initial, countries, onClose }: { id: string | null; initial: IdentificationType; countries: { code: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<IdentificationType>(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const setField = (k: FieldKey, patch: Partial<IdentificationType['fields'][FieldKey]>) =>
    setV((s) => {
      const next = { ...s.fields[k], ...patch };
      if (!next.enabled) next.required = false;
      return { ...s, fields: { ...s.fields, [k]: next } };
    });

  const save = async () => {
    setError('');
    if (v.fields.number.pattern) {
      try {
        new RegExp(v.fields.number.pattern);
      } catch {
        setError('The number pattern is not a valid regular expression.');
        return;
      }
    }
    const cleaned = { ...v, fields: { ...v.fields, number: { ...v.fields.number, pattern: v.fields.number.pattern || undefined, hint: v.fields.number.hint || undefined } } };
    const parsed = identificationTypeSchema.safeParse(cleaned);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    if (!parsed.data.fields.number.enabled && !parsed.data.fields.image.enabled) {
      setError('Collect at least the document number or an image.');
      return;
    }
    setSaving(true);
    try {
      let docId = id;
      if (!docId) {
        docId = `${parsed.data.countryCode.toLowerCase()}_${slugId(parsed.data.name)}`;
        if ((await getDoc(doc(db, 'identificationTypes', docId))).exists()) throw new Error('This document type already exists for that country.');
      }
      await setDoc(doc(db, 'identificationTypes', docId), { ...parsed.data, updatedAt: serverTimestamp(), ...(id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
      toast.success(`${parsed.data.name} saved`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={id ? `Edit ${initial.name}` : 'Add identification type'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" required placeholder="e.g. Driving licence" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <Select label="Country" disabled={!!id} value={v.countryCode} onChange={(e) => setV({ ...v, countryCode: e.target.value })} options={countries.map((c) => ({ value: c.code, label: c.name }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="space-y-2">
            <p className="text-sm font-medium">Customers</p>
            <Checkbox checked={v.appliesTo.customer} onChange={(on) => setV({ ...v, appliesTo: { ...v.appliesTo, customer: on }, mandatoryFor: { ...v.mandatoryFor, customer: on && v.mandatoryFor.customer } })} label="Can be used to verify customers" />
            <Checkbox disabled={!v.appliesTo.customer} checked={v.mandatoryFor.customer} onChange={(on) => setV({ ...v, mandatoryFor: { ...v.mandatoryFor, customer: on } })} label="Mandatory for customers" />
          </Card>
          <Card className="space-y-2">
            <p className="text-sm font-medium">Companies</p>
            <Checkbox checked={v.appliesTo.company} onChange={(on) => setV({ ...v, appliesTo: { ...v.appliesTo, company: on }, mandatoryFor: { ...v.mandatoryFor, company: on && v.mandatoryFor.company } })} label="Can be used to verify companies" />
            <Checkbox disabled={!v.appliesTo.company} checked={v.mandatoryFor.company} onChange={(on) => setV({ ...v, mandatoryFor: { ...v.mandatoryFor, company: on } })} label="Mandatory for companies" />
          </Card>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Fields collected</p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm">{FIELD_LABELS[k]}</span>
                <div className="flex gap-4">
                  <Checkbox checked={v.fields[k].enabled} onChange={(on) => setField(k, { enabled: on })} label="Collect" />
                  <Checkbox disabled={!v.fields[k].enabled} checked={v.fields[k].required} onChange={(on) => setField(k, { required: on })} label="Required" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {v.fields.number.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Number format (regular expression)" hint="Optional, e.g. ^[A-Z]{5}[0-9]{4}[A-Z]$" value={v.fields.number.pattern ?? ''} onChange={(e) => setField('number', { pattern: e.target.value })} />
            <Input label="Hint shown to customers" value={v.fields.number.hint ?? ''} onChange={(e) => setField('number', { hint: e.target.value })} />
          </div>
        )}
        <Switch checked={v.highlySensitive} onChange={(on) => setV({ ...v, highlySensitive: on })} label="Highly sensitive" description="For national identifiers. Staff see a warning, and revealing the number needs a reason and is audited." />
        <Switch checked={v.enabled} onChange={(on) => setV({ ...v, enabled: on })} label="Enabled" />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
