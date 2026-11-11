import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { adjustCreditsSchema, type CreditTransaction } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs, formatMoney } from '@/lib/format';
import { Alert, Badge, Button, Card, CardHeader, DataTable, ErrorState, Input, KeyValue, Modal, PageHeader, Select, type BadgeTone } from '@/components/ui';
import { ExportButtons } from '@/components/ExportButtons';
import { useCompany } from './context';
import { useCustomers } from './shared';

type Row = CreditTransaction & { id: string };

const TXN_LABEL: Record<string, [string, BadgeTone]> = {
  award: ['Awarded', 'green'],
  promotion: ['Promotion', 'green'],
  loyalty: ['Loyalty', 'green'],
  refund: ['Restored', 'brand'],
  redeem: ['Used', 'slate'],
  deduct: ['Deducted', 'red'],
  expire: ['Expired', 'amber'],
};

export function CreditTxnTable({ rows, loading, customerName }: { rows: Row[]; loading?: boolean; customerName?: (uid: string) => string }) {
  return (
    <DataTable<Row> loading={loading} rows={rows} empty="No credit activity yet." columns={[
      { key: 'at', header: 'When', render: (t) => <span className="whitespace-nowrap text-slate-600">{fmtTs(t.at)}</span> },
      ...(customerName ? [{ key: 'cust', header: 'Customer', render: (t: Row) => customerName(t.uid) }] : []),
      { key: 'type', header: 'Type', render: (t) => <Badge tone={TXN_LABEL[t.type]?.[1] ?? 'slate'}>{TXN_LABEL[t.type]?.[0] ?? t.type}</Badge> },
      { key: 'amount', header: 'Credits', render: (t) => <span className={t.amount < 0 ? 'text-red-700' : 'text-court-700'}>{t.amount > 0 ? '+' : ''}{t.amount}</span> },
      { key: 'balance', header: 'Balance', render: (t) => t.balanceAfter, hideOnMobile: true },
      { key: 'reason', header: 'Reason', render: (t) => <span className="text-slate-600">{t.reason}{t.expiresAt ? ` · expires ${fmtTs(t.expiresAt, false)}` : ''}</span>, hideOnMobile: true },
    ]} />
  );
}

export function AdjustCreditsModal({ uid, name, balance, close }: { uid: string; name: string; balance: number; close: () => void }) {
  const toast = useToast();
  const { companyId, company, settings } = useCompany();
  const [type, setType] = useState<'award' | 'promotion' | 'loyalty' | 'deduct'>('award');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState(settings?.credits.defaultExpiryDays ? String(settings.credits.defaultExpiryDays) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError('');
    const parsed = adjustCreditsSchema.safeParse({ companyId, uid, type, amount: Number(amount), reason, expiresInDays: type === 'deduct' || !expires ? null : Number(expires) });
    if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join('. '));
    setBusy(true);
    try {
      const r = await call<{ balance: number }>('adjustCredits', parsed.data);
      toast.success(`New balance: ${r.balance} credits`);
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={close} size="sm" title={`Adjust credits for ${name}`} description={`Current balance ${balance}. Credits only work at your company.`}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}>
      <div className="space-y-3">
        <Select label="Action" value={type} onChange={(e) => setType(e.target.value as typeof type)} options={[
          { value: 'award', label: 'Award credits' },
          { value: 'promotion', label: 'Promotional credits' },
          { value: 'loyalty', label: 'Loyalty reward' },
          { value: 'deduct', label: 'Deduct credits' },
        ]} />
        <Input label="Credits" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} hint={settings ? `1 credit is worth ${formatMoney(settings.credits.creditValue, company.currency)}.` : undefined} />
        {type !== 'deduct' && <Input label="Expires after (days)" type="number" min={1} hint="Leave empty for no expiry." value={expires} onChange={(e) => setExpires(e.target.value)} />}
        <Input label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

export default function Credits() {
  const { companyId, company, settings } = useCompany();
  const [count, setCount] = useState(200);
  const list = useQuery<CreditTransaction>(query(collection(db, 'companies', companyId, 'creditTransactions'), orderBy('at', 'desc'), limit(count)), `credits-${companyId}-${count}`);
  const customers = useCustomers();
  const name = (uid: string) => customers.data.find((c) => c.id === uid)?.displayName ?? uid.slice(0, 8);
  const outstanding = customers.data.reduce((s, c) => s + (c.creditBalance ?? 0), 0);
  return (
    <>
      <PageHeader title="Credits" description="Every credit awarded, used, restored or expired. Adjust a customer's credits from their page." actions={
        <ExportButtons fileName="credit-ledger" rows={list.data} columns={[
          { header: 'When', value: (t) => fmtTs(t.at) },
          { header: 'Customer', value: (t) => name(t.uid) },
          { header: 'Type', value: (t) => t.type },
          { header: 'Credits', value: (t) => t.amount },
          { header: 'Balance after', value: (t) => t.balanceAfter },
          { header: 'Reason', value: (t) => t.reason },
          { header: 'Reference', value: (t) => t.referenceId ?? '' },
        ]} />
      } />
      {!settings?.credits.enabled && <div className="mb-4"><Alert tone="info">Credits are switched off. Turn them on in Settings, under Credits.</Alert></div>}
      <Card className="mb-4">
        <CardHeader title="Outstanding" />
        <KeyValue items={[
          { label: 'Credits held by customers', value: outstanding },
          { label: 'Value', value: settings ? formatMoney(outstanding * settings.credits.creditValue, company.currency) : '' },
        ]} />
      </Card>
      <Card padded={false}>
        {list.error ? <ErrorState error={list.error} /> : <CreditTxnTable rows={list.data} loading={list.loading} customerName={name} />}
        {list.data.length >= count && <div className="border-t border-slate-100 p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setCount(count + 200)}>Load more</Button></div>}
      </Card>
    </>
  );
}
