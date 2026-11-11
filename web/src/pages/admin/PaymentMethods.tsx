import { useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CheckCircle2, Plus, XCircle } from 'lucide-react';
import { paymentMethodSchema, type PaymentMethod } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { usePaymentMethods } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { slugId } from '@/lib/slug';
import { Alert, Badge, Button, Card, CardHeader, DataTable, ErrorState, Input, Modal, PageHeader, Select, Spinner, Switch } from '@/components/ui';
import { ActiveBadge } from '@/components/StatusBadge';

type Row = PaymentMethod & { id: string };
const blank: PaymentMethod = { name: '', provider: 'razorpay', kind: 'online', enabled: true, description: '' };

const PROVIDER_NOTES: Record<string, string> = {
  razorpay: 'UPI, cards, netbanking and wallets in India. Needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET.',
  stripe: 'Cards, Apple Pay and Google Pay in most countries. Needs STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
  sandbox: 'Test payments for development and staging only. Works in the emulator or when ALLOW_SANDBOX_PAYMENTS is set.',
  offline: 'Cash, card terminals and bank transfers recorded by company staff.',
};

export default function PaymentMethods() {
  const methods = usePaymentMethods();
  const status = useAsync(() => call<{ providers: Record<string, boolean> }>('paymentProviderStatus'), []);
  const [editing, setEditing] = useState<{ id: string | null; value: PaymentMethod } | null>(null);
  const providers = Object.keys(status.data?.providers ?? PROVIDER_NOTES);

  return (
    <>
      <PageHeader
        title="Payment methods"
        description="Each method uses a provider adapter. Enable methods per country on the Countries page, and companies pick from those."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: null, value: { ...blank } })}>Add payment method</Button>}
      />
      <Card className="mb-4">
        <CardHeader title="Provider adapters" description="Credentials live in Secret Manager or function configuration, never in the database." />
        {status.loading ? (
          <Spinner />
        ) : status.error ? (
          <ErrorState error={status.error} retry={status.reload} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {providers.map((p) => {
              const ok = status.data?.providers[p];
              return (
                <li key={p} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                  {ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-court-600" /> : <XCircle className="h-5 w-5 shrink-0 text-slate-400" />}
                  <div>
                    <p className="text-sm font-medium capitalize">{p} <span className="font-normal text-slate-500">{ok ? 'configured' : 'not configured'}</span></p>
                    <p className="text-xs text-slate-500">{PROVIDER_NOTES[p] ?? ''}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {methods.error ? (
        <ErrorState error={methods.error} />
      ) : (
        <Card padded={false}>
          <DataTable<Row>
            loading={methods.loading}
            rows={methods.data}
            onRowClick={(r) => setEditing({ id: r.id, value: r })}
            empty="No payment methods yet."
            columns={[
              { key: 'name', header: 'Method', render: (r) => <span className="font-medium">{r.name}</span> },
              { key: 'provider', header: 'Provider', render: (r) => <span className="capitalize">{r.provider}</span> },
              { key: 'kind', header: 'Type', render: (r) => <Badge tone={r.kind === 'online' ? 'brand' : 'slate'}>{r.kind === 'online' ? 'Online' : 'Recorded by staff'}</Badge>, hideOnMobile: true },
              { key: 'status', header: 'Status', render: (r) => <ActiveBadge active={r.enabled} labels={['Enabled', 'Disabled']} /> },
            ]}
          />
        </Card>
      )}
      {editing && <MethodEditor id={editing.id} initial={editing.value} providers={providers} onClose={() => setEditing(null)} />}
    </>
  );
}

function MethodEditor({ id, initial, providers, onClose }: { id: string | null; initial: PaymentMethod; providers: string[]; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<PaymentMethod>(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const parsed = paymentMethodSchema.safeParse({ ...v, description: v.description || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    setSaving(true);
    try {
      let docId = id;
      if (!docId) {
        docId = slugId(parsed.data.name);
        if ((await getDoc(doc(db, 'paymentMethods', docId))).exists()) throw new Error('A method with this name already exists.');
      }
      await setDoc(doc(db, 'paymentMethods', docId), { ...parsed.data, updatedAt: serverTimestamp() }, { merge: true });
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
      title={id ? `Edit ${initial.name}` : 'Add payment method'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Name shown to customers" required placeholder="e.g. UPI" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Select
          label="Provider adapter"
          value={v.provider}
          onChange={(e) => {
            const provider = e.target.value;
            setV({ ...v, provider, kind: provider === 'offline' ? 'offline' : 'online' });
          }}
          options={providers.map((p) => ({ value: p, label: p }))}
          hint={PROVIDER_NOTES[v.provider]}
        />
        <Input label="Description" value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <Switch checked={v.enabled} onChange={(on) => setV({ ...v, enabled: on })} label="Enabled" description="Disabled methods are hidden at checkout everywhere." />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
