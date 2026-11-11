import { useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { BOOKING_MODELS, BOOKING_MODEL_LABELS, sportSchema, type Sport } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useSports } from '@/lib/master';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { slugId } from '@/lib/slug';
import { Button, Card, DataTable, ErrorState, Input, Modal, PageHeader, SearchInput, Select, Switch } from '@/components/ui';
import { ActiveBadge } from '@/components/StatusBadge';

type Row = Sport & { id: string };
const blank: Sport = { name: '', description: '', icon: '', defaultBookingModel: 'exclusive', enabled: true };

export default function Sports() {
  const sports = useSports();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; value: Sport } | null>(null);
  const rows = sports.data.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader
        title="Sports"
        description="The master list of sports. Each company is permitted a subset, set on the company's page."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: null, value: { ...blank } })}>Add sport</Button>}
      />
      {sports.error ? (
        <ErrorState error={sports.error} />
      ) : (
        <Card padded={false}>
          <div className="border-b border-slate-100 p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search sports" className="max-w-sm" />
          </div>
          <DataTable<Row>
            loading={sports.loading}
            rows={rows}
            onRowClick={(r) => setEditing({ id: r.id, value: r })}
            empty="No sports yet."
            columns={[
              { key: 'name', header: 'Sport', render: (r) => <span className="font-medium">{r.icon ? `${r.icon} ` : ''}{r.name}</span> },
              { key: 'desc', header: 'Description', render: (r) => r.description, hideOnMobile: true },
              { key: 'model', header: 'Default booking model', render: (r) => BOOKING_MODEL_LABELS[r.defaultBookingModel], hideOnMobile: true },
              { key: 'status', header: 'Status', render: (r) => <ActiveBadge active={r.enabled} labels={['Enabled', 'Disabled']} /> },
            ]}
          />
        </Card>
      )}
      {editing && <SportEditor id={editing.id} initial={editing.value} onClose={() => setEditing(null)} />}
    </>
  );
}

function SportEditor({ id, initial, onClose }: { id: string | null; initial: Sport; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Sport>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Sport>(k: K, val: Sport[K]) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    const parsed = sportSchema.safeParse({ ...v, description: v.description || undefined, icon: v.icon || undefined });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setSaving(true);
    try {
      let docId = id;
      if (!docId) {
        docId = slugId(parsed.data.name);
        if (!docId) throw new Error('Use letters or numbers in the name.');
        if ((await getDoc(doc(db, 'sports', docId))).exists()) throw new Error('A sport with this name already exists.');
      }
      await setDoc(doc(db, 'sports', docId), { ...parsed.data, updatedAt: serverTimestamp(), ...(id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
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
      title={id ? `Edit ${initial.name}` : 'Add sport'}
      description={id ? 'Disabling a sport hides it from new courts. Existing courts keep working until a company changes them.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save sport</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Input label="Name" required value={v.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Icon" hint="An emoji" value={v.icon ?? ''} maxLength={4} onChange={(e) => set('icon', e.target.value)} />
        </div>
        <Input label="Description" value={v.description ?? ''} error={errors.description} onChange={(e) => set('description', e.target.value)} />
        <Select
          label="Default booking model"
          hint="Courts for this sport start with this model. Companies can change it per court."
          value={v.defaultBookingModel}
          onChange={(e) => set('defaultBookingModel', e.target.value as Sport['defaultBookingModel'])}
          options={BOOKING_MODELS.map((m) => ({ value: m, label: BOOKING_MODEL_LABELS[m] }))}
        />
        <Switch checked={v.enabled} onChange={(on) => set('enabled', on)} label="Enabled" />
      </div>
    </Modal>
  );
}
