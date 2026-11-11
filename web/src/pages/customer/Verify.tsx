import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { Lock, ShieldAlert, Upload } from 'lucide-react';
import type { Company, CompanySettings, Verification } from '@courtsync/shared';
import { db, storage } from '@/lib/firebase';
import { useDoc } from '@/lib/hooks';
import { useIdTypes } from '@/lib/master';
import { useSession } from '@/lib/auth';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs } from '@/lib/format';
import { Alert, Button, Card, CardHeader, Checkbox, ConfirmDialog, ErrorState, Input, KeyValue, PageHeader, Spinner } from '@/components/ui';
import { VerificationBadge } from '@/components/StatusBadge';

interface DocInput {
  number: string;
  expiryDate: string;
  issuingRegion: string;
  imagePath: string;
  fileName: string;
}

export default function Verify() {
  const { companyId = '' } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const company = useDoc<Company>(doc(db, 'companies', companyId), `v-c-${companyId}`);
  const settings = useDoc<CompanySettings>(doc(db, 'companies', companyId, 'settings', 'general'), `v-s-${companyId}`);
  const mine = useDoc<Verification>(user ? doc(db, 'companies', companyId, 'verifications', user.uid) : null, `v-me-${companyId}-${user?.uid}`);
  const types = useIdTypes();
  const [docs, setDocs] = useState<Record<string, DocInput>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  if (company.loading || settings.loading || mine.loading || types.loading) return <Spinner />;
  if (!company.data || !settings.data || !user) return <ErrorState error={company.error ?? new Error('Venue not found')} />;
  const cfg = settings.data.verification;
  const country = company.data.countryCode;
  const platformRequired = types.data.filter((t) => t.enabled && t.countryCode === country && t.appliesTo.customer && t.mandatoryFor.customer).map((t) => t.id);
  const required = [...new Set([...cfg.requiredTypeIds, ...platformRequired])];
  const accepted = types.data.filter((t) => t.enabled && t.countryCode === country && t.appliesTo.customer && (required.includes(t.id) || cfg.optionalTypeIds.includes(t.id)));
  const v = mine.data;
  const showForm = !v || editing || v.status === 'rejected' || v.status === 'expired' || v.status === 'notSubmitted';
  const blank: DocInput = { number: '', expiryDate: '', issuingRegion: '', imagePath: '', fileName: '' };
  const set = (typeId: string, patch: Partial<DocInput>) => setDocs((d) => ({ ...d, [typeId]: { ...blank, ...d[typeId], ...patch } }));

  const upload = async (typeId: string, file: File | undefined) => {
    if (!file) return;
    if (!(file.type.startsWith('image/') || file.type === 'application/pdf') || file.size > 10 * 1024 * 1024) return toast.error('Use a photo or PDF under 10 MB.');
    setUploading(typeId);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `companies/${companyId}/verifications/${user.uid}/${typeId}-${Date.now()}.${ext}`;
      await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      set(typeId, { imagePath: path, fileName: file.name });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading('');
    }
  };

  const submit = async () => {
    setError('');
    const list = accepted
      .map((t) => ({ t, d: docs[t.id] }))
      .filter(({ t, d }) => required.includes(t.id) || (d && (d.number || d.imagePath)))
      .map(({ t, d }) => ({ typeId: t.id, number: d?.number.trim() || undefined, expiryDate: d?.expiryDate || undefined, issuingRegion: d?.issuingRegion.trim() || undefined, imagePath: d?.imagePath || undefined }));
    if (list.length === 0) return setError('Fill in at least one document.');
    for (const item of list) {
      const t = accepted.find((x) => x.id === item.typeId)!;
      if (item.number && t.fields.number.pattern && !new RegExp(t.fields.number.pattern).test(item.number)) return setError(`${t.name}: the number format looks wrong.${t.fields.number.hint ? ` ${t.fields.number.hint}` : ''}`);
    }
    setBusy(true);
    try {
      await call('submitVerification', { companyId, consent: true, documents: list });
      toast.success('Submitted for review');
      setEditing(false);
      setDocs({});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader back={`/c/${companyId}`} title="Identity verification" description={company.data.name} />
      <Alert tone="info" title="How your information is protected">
        <span className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0" />Document numbers are encrypted and staff see them masked. Only this venue can see what you submit here, and you can withdraw it at any time, which deletes the numbers and images.</span>
      </Alert>
      {accepted.length === 0 && <Alert tone="info">This venue doesn't ask for identity documents.</Alert>}
      {v && !showForm && (
        <Card>
          <CardHeader title="Your submission" action={<VerificationBadge status={v.status} />} description={v.submittedAt ? `Submitted ${fmtTs(v.submittedAt)}` : undefined} />
          {v.documents.map((d) => (
            <div key={d.typeId} className="mb-2 rounded-lg border border-slate-200 p-3">
              <p className="mb-1 text-sm font-medium">{d.typeName}</p>
              <KeyValue items={[{ label: 'Number', value: d.numberMasked }, { label: 'Expires', value: d.expiryDate }, { label: 'Photo', value: d.imagePath ? 'Uploaded' : null }].filter((i) => i.value)} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Update documents</Button>
            <Button variant="ghost" className="text-red-700" onClick={() => setWithdrawOpen(true)}>Withdraw and delete</Button>
          </div>
        </Card>
      )}
      {v?.status === 'rejected' && <Alert tone="error" title="Not accepted">{v.rejectionReason}</Alert>}
      {showForm && accepted.length > 0 && (
        <Card>
          <CardHeader title="Your documents" description={required.length ? 'Documents marked required must be provided.' : 'Provide any one of these.'} />
          <div className="space-y-4">
            {accepted.map((t) => {
              const d = docs[t.id];
              const f = t.fields;
              return (
                <fieldset key={t.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">{t.name}{required.includes(t.id) ? <span className="text-xs font-normal text-red-600">required</span> : <span className="text-xs font-normal text-slate-500">optional</span>}</legend>
                  {t.highlySensitive && <p className="flex items-center gap-1.5 text-xs text-amber-800"><ShieldAlert className="h-4 w-4" />Highly sensitive. Only share it if you're comfortable; ask the venue if another document will do.</p>}
                  {f.number.enabled && <Input label={`Document number${f.number.required ? '' : ' (optional)'}`} autoComplete="off" hint={f.number.hint} value={d?.number ?? ''} onChange={(e) => set(t.id, { number: e.target.value })} />}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {f.expiryDate.enabled && <Input type="date" label={`Expiry date${f.expiryDate.required ? '' : ' (optional)'}`} value={d?.expiryDate ?? ''} onChange={(e) => set(t.id, { expiryDate: e.target.value })} />}
                    {f.issuingRegion.enabled && <Input label={`Issued in${f.issuingRegion.required ? '' : ' (optional)'}`} value={d?.issuingRegion ?? ''} onChange={(e) => set(t.id, { issuingRegion: e.target.value })} />}
                  </div>
                  {f.image.enabled && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                      <Upload className="h-4 w-4" />
                      {uploading === t.id ? 'Uploading…' : d?.fileName ? `Uploaded: ${d.fileName}` : `Photo or PDF of the document${f.image.required ? '' : ' (optional)'}`}
                      <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={!!uploading} onChange={(e) => upload(t.id, e.target.files?.[0])} />
                    </label>
                  )}
                </fieldset>
              );
            })}
            <Checkbox checked={consent} onChange={setConsent} label={`I agree that ${company.data.name} may store and review these documents to verify my identity.`} />
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex gap-2">
              <Button loading={busy} disabled={!consent || !!uploading} onClick={submit}>Submit for review</Button>
              {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
            </div>
          </div>
        </Card>
      )}
      <ConfirmDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} tone="danger" loading={busy} title="Withdraw your documents?" confirmLabel="Withdraw and delete" message="Your document numbers and images are deleted. The venue may not let you book until you verify again."
        onConfirm={async () => {
          setBusy(true);
          try {
            await call('withdrawVerification', { companyId });
            toast.success('Your documents were deleted');
            setWithdrawOpen(false);
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }} />
    </div>
  );
}
