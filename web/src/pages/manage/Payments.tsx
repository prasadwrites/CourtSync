import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { usePaymentMethods } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs, formatMoney } from '@/lib/format';
import { Button, Card, ConfirmDialog, ErrorState, PageHeader, StatCard, Tabs } from '@/components/ui';
import { PaymentsTable, type PaymentRow } from '@/components/PaymentsTable';
import { ExportButtons } from '@/components/ExportButtons';
import { useCompany } from './context';
import { useCustomers } from './shared';

type Filter = 'all' | 'pendingRefunds' | 'failed';

export default function Payments() {
  const toast = useToast();
  const { companyId, company, can } = useCompany();
  const navigate = useNavigate();
  const methods = usePaymentMethods();
  const customers = useCustomers();
  const [filter, setFilter] = useState<Filter>('all');
  const [count, setCount] = useState(200);
  const [settle, setSettle] = useState<PaymentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const c: QueryConstraint[] =
    filter === 'pendingRefunds' ? [where('type', '==', 'refund'), where('status', '==', 'pending')] : filter === 'failed' ? [where('status', '==', 'failed')] : [];
  const list = useQuery<PaymentRow>(query(collection(db, 'companies', companyId, 'payments'), ...c, orderBy('createdAt', 'desc'), limit(count)), `payments-${companyId}-${filter}-${count}`);
  const methodName = (id: string) => methods.data.find((m) => m.id === id)?.name ?? id;
  const customerName = (uid: string) => customers.data.find((x) => x.id === uid)?.displayName ?? uid.slice(0, 8);
  const received = list.data.filter((p) => p.type === 'charge' && p.status === 'succeeded').reduce((s, p) => s + p.amount, 0);
  const refunded = list.data.filter((p) => p.type === 'refund' && p.status === 'succeeded').reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader title="Payments" description="Online payments are confirmed by the payment gateway. Card details are never stored by CourtSync." actions={
        <ExportButtons fileName="payments" rows={list.data} columns={[
          { header: 'Date', value: (p) => fmtTs(p.createdAt) },
          { header: 'Type', value: (p) => p.type },
          { header: 'Purpose', value: (p) => p.purpose },
          { header: 'Reference', value: (p) => p.referenceId },
          { header: 'Customer', value: (p) => customerName(p.customerUid) },
          { header: 'Method', value: (p) => methodName(p.paymentMethodId) },
          { header: 'Provider', value: (p) => p.provider },
          { header: 'Provider reference', value: (p) => p.providerPaymentRef ?? p.providerRef ?? '' },
          { header: 'Amount', value: (p) => p.amount },
          { header: 'Currency', value: (p) => p.currency },
          { header: 'Status', value: (p) => p.status },
          { header: 'Note', value: (p) => p.note ?? p.failureReason ?? '' },
        ]} />
      } />
      {filter === 'all' && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label={`Received (last ${list.data.length})`} value={formatMoney(received, company.currency)} tone="green" />
          <StatCard label="Refunded" value={formatMoney(refunded, company.currency)} tone="amber" />
        </div>
      )}
      <Tabs<Filter> value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All' }, { value: 'pendingRefunds', label: 'Refunds to hand back' }, { value: 'failed', label: 'Failed' }]} />
      <Card padded={false}>
        {list.error ? <ErrorState error={list.error} /> : (
          <PaymentsTable rows={list.data} loading={list.loading} methodName={methodName} showCustomer={customerName}
            onRowClick={(p) => p.purpose === 'booking' && navigate(`/manage/${companyId}/bookings/${p.referenceId}`)}
            actions={(p) => p.type === 'refund' && p.status === 'pending' && can('payments.refund') ? <Button size="sm" variant="secondary" onClick={() => setSettle(p)}>Mark handed back</Button> : null} />
        )}
        {list.data.length >= count && <div className="border-t border-slate-100 p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setCount(count + 200)}>Load more</Button></div>}
      </Card>
      <ConfirmDialog open={!!settle} onClose={() => setSettle(null)} loading={busy} title="Refund handed back?" confirmLabel="Confirm" message={settle ? `Confirm that ${formatMoney(settle.amount, settle.currency)} was returned to ${customerName(settle.customerUid)}.` : ''}
        onConfirm={async () => {
          if (!settle) return;
          setBusy(true);
          try {
            await call('settleRefund', { companyId, paymentId: settle.id });
            toast.success('Refund settled');
            setSettle(null);
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }} />
    </>
  );
}
