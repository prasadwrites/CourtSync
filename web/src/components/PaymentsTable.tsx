import type { PaymentTransaction } from '@courtsync/shared';
import { fmtTs, formatMoney } from '@/lib/format';
import { Badge, DataTable, type BadgeTone } from '@/components/ui';

export type PaymentRow = PaymentTransaction & { id: string };

const tone: Record<string, BadgeTone> = { succeeded: 'green', pending: 'amber', created: 'slate', failed: 'red', cancelled: 'slate' };

export function PaymentStatus({ p }: { p: PaymentTransaction }) {
  return <Badge tone={tone[p.status] ?? 'slate'}>{p.status === 'created' ? 'started' : p.status}</Badge>;
}

export function PaymentsTable({ rows, loading, methodName, actions, onRowClick, showCustomer }: { rows: PaymentRow[]; loading?: boolean; methodName: (id: string) => string; actions?: (p: PaymentRow) => React.ReactNode; onRowClick?: (p: PaymentRow) => void; showCustomer?: (uid: string) => string }) {
  return (
    <DataTable<PaymentRow>
      loading={loading}
      rows={rows}
      onRowClick={onRowClick}
      empty="No payments yet."
      columns={[
        { key: 'when', header: 'When', render: (p) => <span className="whitespace-nowrap text-slate-600">{fmtTs(p.createdAt)}</span> },
        { key: 'type', header: 'Type', render: (p) => (p.type === 'refund' ? <Badge tone="purple">Refund</Badge> : <span className="capitalize">{p.purpose}</span>) },
        ...(showCustomer ? [{ key: 'customer', header: 'Customer', render: (p: PaymentRow) => showCustomer(p.customerUid), hideOnMobile: true }] : []),
        { key: 'method', header: 'Method', render: (p) => methodName(p.paymentMethodId), hideOnMobile: true },
        { key: 'amount', header: 'Amount', render: (p) => <span className={p.type === 'refund' ? 'text-violet-700' : ''}>{p.type === 'refund' ? '−' : ''}{formatMoney(p.amount, p.currency)}</span> },
        { key: 'status', header: 'Status', render: (p) => <span title={p.failureReason ?? p.note ?? ''}><PaymentStatus p={p} /></span> },
        ...(actions ? [{ key: 'actions', header: '', render: (p: PaymentRow) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>{actions(p)}</div> }] : []),
      ]}
    />
  );
}
