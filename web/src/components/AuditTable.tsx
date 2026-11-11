import { useState } from 'react';
import type { AuditLog } from '@courtsync/shared';
import { fmtTs } from '@/lib/format';
import { Button, DataTable, Modal } from '@/components/ui';

type Row = AuditLog & { id: string };

export function actionLabel(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
}

/** Read-only audit trail with a detail view of the before and after values. */
export function AuditTable({ rows, loading, showCompany, companyName }: { rows: Row[]; loading?: boolean; showCompany?: boolean; companyName?: (id: string) => string }) {
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <>
      <DataTable<Row>
        loading={loading}
        rows={rows}
        onRowClick={setOpen}
        empty="No activity recorded yet."
        columns={[
          { key: 'at', header: 'When', render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtTs(r.at)}</span> },
          { key: 'action', header: 'Action', render: (r) => <span className="font-medium">{actionLabel(r.action)}</span> },
          { key: 'actor', header: 'By', render: (r) => r.actorEmail ?? (r.actorUid ? r.actorUid.slice(0, 8) : 'System'), hideOnMobile: true },
          { key: 'target', header: 'Record', render: (r) => <span className="text-slate-600">{r.targetType} · {r.targetId.slice(0, 24)}</span>, hideOnMobile: true },
          ...(showCompany ? [{ key: 'company', header: 'Company', render: (r: Row) => (r.companyId ? companyName?.(r.companyId) ?? r.companyId : 'Platform'), hideOnMobile: true }] : []),
        ]}
      />
      {open && (
        <Modal open onClose={() => setOpen(null)} size="lg" title={actionLabel(open.action)} description={`${fmtTs(open.at)} by ${open.actorEmail ?? open.actorUid ?? 'system'}`} footer={<Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
          <div className="space-y-3 text-sm">
            <p><span className="text-slate-500">Record:</span> {open.targetType} / {open.targetId}</p>
            {open.metadata && <JsonBlock label="Details" value={open.metadata} />}
            {open.before !== undefined && open.before !== null && <JsonBlock label="Before" value={open.before} />}
            {open.after !== undefined && open.after !== null && <JsonBlock label="After" value={open.after} />}
          </div>
        </Modal>
      )}
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v ? new Date(v.seconds * 1000).toISOString() : v), 2)}</pre>
    </div>
  );
}
