import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CheckCircle2, XCircle } from 'lucide-react';
import { FEATURE_FLAGS, type FeatureFlag, type PlatformSettings as Settings } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useAsync, useDoc } from '@/lib/hooks';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Alert, Button, Card, CardHeader, Input, PageHeader, Spinner, Switch } from '@/components/ui';

export default function PlatformSettings() {
  const toast = useToast();
  const settings = useDoc<Settings>(doc(db, 'platformSettings/general'), 'platformSettings');
  const email = useAsync(() => call<{ configured: boolean }>('emailStatus'), []);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [supportEmail, setSupportEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.loading) return;
    const f: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(FEATURE_FLAGS)) f[k] = settings.data?.features?.[k] ?? v.default;
    setFeatures(f);
    setSupportEmail(settings.data?.supportEmail ?? '');
  }, [settings.loading, settings.data]);

  if (settings.loading) return <Spinner />;

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'platformSettings/general'), { features, supportEmail: supportEmail.trim(), updatedAt: serverTimestamp() }, { merge: true });
      toast.success('Platform settings saved');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Platform settings" description="Switch features on or off for every company at once." actions={<Button loading={saving} onClick={save}>Save changes</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Features" />
          <div className="space-y-4">
            {(Object.keys(FEATURE_FLAGS) as FeatureFlag[]).map((k) => (
              <Switch key={k} checked={!!features[k]} onChange={(on) => setFeatures({ ...features, [k]: on })} label={FEATURE_FLAGS[k].label} />
            ))}
          </div>
          {features.sandboxPayments && (
            <div className="mt-4">
              <Alert tone="warning">Sandbox payments let anyone mark a booking as paid without money changing hands. The server also refuses them unless ALLOW_SANDBOX_PAYMENTS is set, so keep both off in production.</Alert>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Support contact" description="Shown to customers and company admins in help text and emails." />
            <Input type="email" label="Support email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
          </Card>
          <Card>
            <CardHeader title="Integrations" description="Configured through Secret Manager and function environment variables. See docs/configuration.md." />
            {email.loading ? (
              <Spinner />
            ) : (
              <p className="flex items-center gap-2 text-sm">
                {email.data?.configured ? <CheckCircle2 className="h-5 w-5 text-court-600" /> : <XCircle className="h-5 w-5 text-slate-400" />}
                Email delivery {email.data?.configured ? 'is configured' : 'is not configured. Invitation and reset links are shown to admins to share manually.'}
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
