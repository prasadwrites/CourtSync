import { useState } from 'react';
import { Plus } from 'lucide-react';
import { branchSchema, type Branch } from '@courtsync/shared';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { COMMON_TIMEZONES, useCountries } from '@/lib/master';
import { Alert, Badge, Button, Card, DataTable, Input, Modal, PageHeader, Select, Switch } from '@/components/ui';
import { ActiveBadge } from '@/components/StatusBadge';
import { useCompany, type WithId } from './context';

export default function Branches() {
  const { company, branches, courts } = useCompany();
  const [editing, setEditing] = useState<WithId<Branch> | 'new' | null>(null);
  const max = company.restrictions?.maxBranches;
  const atLimit = max != null && branches.filter((b) => b.active).length >= max;
  return (
    <>
      <PageHeader title="Branches" description="Locations of your company. Each has its own time zone, courts and staff access." actions={!atLimit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add branch</Button>} />
      <Card padded={false}>
        <DataTable rows={branches} onRowClick={(b) => setEditing(b)} columns={[
          { key: 'name', header: 'Branch', render: (b) => <span className="font-medium">{b.name}{b.isPrimary && <Badge tone="brand" className="ml-2">Main</Badge>}</span> },
          { key: 'city', header: 'City', render: (b) => b.address?.city, hideOnMobile: true },
          { key: 'tz', header: 'Time zone', render: (b) => b.timezone, hideOnMobile: true },
          { key: 'courts', header: 'Courts', render: (b) => courts.filter((c) => c.branchId === b.id).length },
          { key: 'status', header: 'Status', render: (b) => <ActiveBadge active={b.active} /> },
        ]} />
      </Card>
      {editing && <BranchEditor branch={editing === 'new' ? null : editing} close={() => setEditing(null)} />}
    </>
  );
}

function BranchEditor({ branch, close }: { branch: WithId<Branch> | null; close: () => void }) {
  const toast = useToast();
  const { companyId, company } = useCompany();
  const countries = useCountries();
  const zones = countries.data.find((c) => c.code === company.countryCode)?.timezones ?? COMMON_TIMEZONES;
  const [v, setV] = useState({
    name: branch?.name ?? '',
    timezone: branch?.timezone ?? company.timezone,
    address: { line1: branch?.address?.line1 ?? '', city: branch?.address?.city ?? '', region: branch?.address?.region ?? '', postalCode: branch?.address?.postalCode ?? '' },
    phone: branch?.phone ?? '',
    active: branch?.active ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setError('');
    const parsed = branchSchema.safeParse({ ...v, phone: v.phone || undefined, location: branch?.location ?? null });
    if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join('. '));
    setBusy(true);
    try {
      await call('upsertBranch', { companyId, branchId: branch?.id, branch: parsed.data });
      toast.success('Branch saved');
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={close} title={branch ? `Edit ${branch.name}` : 'Add branch'} footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <Input label="Name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Select label="Time zone" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} options={[...new Set([...zones, v.timezone])].map((z) => ({ value: z, label: z }))} />
        <Input label="Address" value={v.address.line1} onChange={(e) => setV({ ...v, address: { ...v.address, line1: e.target.value } })} />
        <div className="grid grid-cols-3 gap-2">
          <Input label="City" value={v.address.city} onChange={(e) => setV({ ...v, address: { ...v.address, city: e.target.value } })} />
          <Input label="State or region" value={v.address.region} onChange={(e) => setV({ ...v, address: { ...v.address, region: e.target.value } })} />
          <Input label="Postal code" value={v.address.postalCode} onChange={(e) => setV({ ...v, address: { ...v.address, postalCode: e.target.value } })} />
        </div>
        <Input label="Phone" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        {!branch?.isPrimary && <Switch checked={v.active} onChange={(on) => setV({ ...v, active: on })} label="Active" description="Courts at an inactive branch can't be booked." />}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
