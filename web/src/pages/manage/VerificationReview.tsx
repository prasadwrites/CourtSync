import { useState } from 'react';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { Eye, ShieldAlert } from 'lucide-react';
import type { Verification } from '@courtsync/shared';
import { storage } from '@/lib/firebase';
import { useAsync } from '@/lib/hooks';
import { useIdTypes } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs } from '@/lib/format';
import { Alert, Button, Card, CardHeader, Input, KeyValue, Modal, Textarea } from '@/components/ui';
import { VerificationBadge } from '@/components/StatusBadge';
import { useCompany } from './context';

/** Staff view of a customer's submitted documents, with review and audited number reveal. */
export function VerificationPanel({ v, customerName }: { v: Verification & { id: string }; customerName?: string }) {
  const toast = useToast();
  const { companyId, can } = useCompany();
  const types = useIdTypes();
  const [decision, setDecision] = useState<'verified' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ typeId: string; name: string } | null>(null);

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      await call('reviewVerification', { companyId, uid: v.uid, decision, reason: reason || undefined });
      toast.success(decision === 'verified' ? 'Customer verified' : 'Verification rejected');
      setDecision(null);
      setReason('');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={customerName ? `${customerName}'s documents` : 'Identity documents'} action={<VerificationBadge status={v.status} />} description={v.submittedAt ? `Submitted ${fmtTs(v.submittedAt)}` : undefined} />
      <div className="space-y-3">
        {v.documents.map((d) => {
          const t = types.data.find((x) => x.id === d.typeId);
          return (
            <div key={d.typeId} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">{d.typeName}{t?.highlySensitive && <ShieldAlert className="h-4 w-4 text-amber-600" aria-label="Highly sensitive" />}</p>
              <KeyValue
                items={[
                  { label: 'Number', value: d.numberMasked ? <span className="flex items-center gap-2 font-mono">{d.numberMasked}{can('verification.reveal') && <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setReveal({ typeId: d.typeId, name: d.typeName })}>Reveal</Button>}</span> : null },
                  { label: 'Expires', value: d.expiryDate },
                  { label: 'Issued in', value: d.issuingRegion },
                ].filter((i) => i.value)}
              />
              {d.imagePath && <DocImage path={d.imagePath} />}
            </div>
          );
        })}
        {v.rejectionReason && v.status === 'rejected' && <Alert tone="error" title="Rejection reason">{v.rejectionReason}</Alert>}
        {v.reviewedAt && <p className="text-xs text-slate-500">Reviewed {fmtTs(v.reviewedAt)}</p>}
        {v.status === 'pending' && can('verification.review') && (
          <div className="flex gap-2">
            <Button variant="success" onClick={() => setDecision('verified')}>Verify</Button>
            <Button variant="danger" onClick={() => setDecision('rejected')}>Reject</Button>
          </div>
        )}
      </div>
      {decision && (
        <Modal open onClose={() => setDecision(null)} size="sm" title={decision === 'verified' ? 'Mark as verified?' : 'Reject verification?'}
          footer={<><Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision === 'verified' ? 'success' : 'danger'} loading={busy} disabled={decision === 'rejected' && reason.trim().length < 3} onClick={submit}>Confirm</Button></>}>
          <Textarea label={decision === 'rejected' ? 'Reason shown to the customer' : 'Note (optional)'} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Modal>
      )}
      {reveal && <RevealModal uid={v.uid} typeId={reveal.typeId} name={reveal.name} close={() => setReveal(null)} />}
    </Card>
  );
}

function DocImage({ path }: { path: string }) {
  const url = useAsync(() => getDownloadURL(storageRef(storage, path)), [path]);
  if (url.loading) return <p className="mt-2 text-xs text-slate-400">Loading image…</p>;
  if (url.error || !url.data) return <p className="mt-2 text-xs text-red-600">The document image could not be loaded.</p>;
  const isPdf = path.toLowerCase().endsWith('.pdf');
  return isPdf ? (
    <a href={url.data} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-brand-700">Open PDF</a>
  ) : (
    <a href={url.data} target="_blank" rel="noreferrer"><img src={url.data} alt="Identity document" className="mt-2 max-h-64 rounded-md border border-slate-200 object-contain" /></a>
  );
}

function RevealModal({ uid, typeId, name, close }: { uid: string; typeId: string; name: string; close: () => void }) {
  const { companyId } = useCompany();
  const [reason, setReason] = useState('');
  const [number, setNumber] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={close} size="sm" title={`Reveal ${name} number`} description="Every reveal is recorded with your name and reason. Only reveal when you need the full number."
      footer={number ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} disabled={reason.trim().length < 3} onClick={async () => {
        setBusy(true);
        setError('');
        try {
          const r = await call<{ number: string }>('revealIdNumber', { companyId, uid, typeId, reason });
          setNumber(r.number);
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}>Reveal</Button></>}>
      {number ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center font-mono text-lg tracking-wider">{number}</p>
      ) : (
        <div className="space-y-2">
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Matching ID at the front desk" />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
