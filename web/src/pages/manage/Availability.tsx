import { useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import type { BlockedSlot } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { todayISO } from '@/lib/format';
import { Badge, Button, Card, ConfirmDialog, DataTable, ErrorState, PageHeader, Tabs } from '@/components/ui';
import { useCompany, type WithId } from './context';
import { BlockEditor, blockSummary, useBlocks } from './shared';

export default function Availability() {
  const toast = useToast();
  const { companyId, company, courtName, branchName, branches } = useCompany();
  const blocks = useBlocks();
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const [editing, setEditing] = useState<WithId<BlockedSlot> | Partial<BlockedSlot> | null>(null);
  const [removing, setRemoving] = useState<WithId<BlockedSlot> | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayISO(company.timezone);
  const rows = blocks.data
    .filter((b) => (tab === 'current' ? !b.endDate || b.endDate >= today : b.endDate && b.endDate < today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const kindLabel = { oneOff: 'One-off', holiday: 'Holiday', weekly: 'Weekly' } as const;
  return (
    <>
      <PageHeader title="Holidays and blocks" description="Times when courts can't be booked: holidays, maintenance, private events or recurring coaching." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ startDate: today, kind: 'holiday', branchId: branches[0]?.id })}>Add block</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'current', label: 'Current and upcoming' }, { value: 'past', label: 'Past' }]} />
      <Card padded={false}>
        {blocks.error ? <ErrorState error={blocks.error} /> : (
          <DataTable loading={blocks.loading} rows={rows} onRowClick={(b) => setEditing(b)} empty="No blocks." columns={[
            { key: 'reason', header: 'Reason', render: (b) => <span className="font-medium">{b.reason}</span> },
            { key: 'kind', header: 'Type', render: (b) => <Badge tone={b.kind === 'holiday' ? 'purple' : b.kind === 'weekly' ? 'brand' : 'slate'}>{kindLabel[b.kind]}</Badge> },
            { key: 'when', header: 'When', render: (b) => blockSummary(b) },
            { key: 'scope', header: 'Applies to', render: (b) => (b.courtId ? courtName(b.courtId) : `All courts at ${branchName(b.branchId)}`), hideOnMobile: true },
            { key: 'x', header: '', render: (b) => <Button size="sm" variant="ghost" aria-label="Delete" onClick={(e) => { e.stopPropagation(); setRemoving(b); }}><Trash2 className="h-4 w-4" /></Button> },
          ]} />
        )}
      </Card>
      {editing && <BlockEditor initial={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} loading={busy} tone="danger" title="Remove this block?" message="Those times become bookable again." confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          try {
            await deleteDoc(doc(db, 'companies', companyId, 'blockedSlots', removing.id));
            toast.success('Block removed');
            setRemoving(null);
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }} />
    </>
  );
}
