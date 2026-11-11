import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Bell, KeyRound, LogOut } from 'lucide-react';
import { profileSchema } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useCountries } from '@/lib/master';
import { useMyCompanies } from '@/lib/customer';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { disablePush, enablePush, pushEnabledHere, pushSupported } from '@/lib/push';
import { Alert, Avatar, Button, Card, CardHeader, Input, LinkButton, Select, Switch } from '@/components/ui';
import { VerificationBadge } from '@/components/StatusBadge';

export default function Profile() {
  const toast = useToast();
  const { user, profile, signOut, staffOf, superAdmin, refresh } = useSession();
  const countries = useCountries();
  const companies = useMyCompanies(user?.uid);
  const [v, setV] = useState({ displayName: profile?.displayName ?? '', phone: profile?.phone ?? '', countryCode: profile?.countryCode ?? '', city: profile?.city ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [push, setPush] = useState(pushEnabledHere());
  const [pushBusy, setPushBusy] = useState(false);
  if (!user) return null;
  const hasPassword = user.providerData.some((p) => p.providerId === 'password');

  const save = async () => {
    setError('');
    const parsed = profileSchema.safeParse({ displayName: v.displayName, phone: v.phone || null, countryCode: v.countryCode || null, city: v.city || null });
    if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join('. '));
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { ...parsed.data, updatedAt: serverTimestamp() });
      await refresh();
      toast.success('Profile saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={profile?.displayName ?? user.email ?? 'You'} src={profile?.photoURL ?? user.photoURL} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold">{profile?.displayName}</h1>
          <p className="text-slate-500">{user.email ?? user.phoneNumber}</p>
        </div>
      </div>
      {(staffOf.length > 0 || superAdmin) && (
        <Card>
          <CardHeader title="Work" />
          <div className="flex flex-wrap gap-2">
            {superAdmin && <LinkButton variant="secondary" to="/admin">Platform administration</LinkButton>}
            {staffOf.map((s) => <LinkButton key={s.companyId} variant="secondary" to={`/manage/${s.companyId}`}>Manage {s.companyName ?? 'company'}</LinkButton>)}
          </div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" description="One account works at every venue on CourtSync." />
          <div className="space-y-3">
            <Input label="Name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
            <Input label="Mobile number" hint="International format, e.g. +919876543210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Country" value={v.countryCode} onChange={(e) => setV({ ...v, countryCode: e.target.value })} placeholder="Choose" options={countries.data.filter((c) => c.enabled).map((c) => ({ value: c.code, label: c.name }))} />
              <Input label="City" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button loading={busy} onClick={save}>Save</Button>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Notifications" />
            {pushSupported() ? (
              <Switch checked={push} disabled={pushBusy} label={<span className="flex items-center gap-1.5"><Bell className="h-4 w-4" />Push notifications on this device</span>} description="Booking confirmations and reminders."
                onChange={async (on) => {
                  setPushBusy(true);
                  try {
                    if (on) await enablePush(user.uid);
                    else await disablePush(user.uid);
                    setPush(on);
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setPushBusy(false);
                  }
                }} />
            ) : <p className="text-sm text-slate-500">Push notifications aren't available in this browser. You'll still get in-app and email updates.</p>}
          </Card>
          <Card>
            <CardHeader title="Security" />
            <div className="flex flex-wrap gap-2">
              {hasPassword && <LinkButton variant="secondary" to="/change-password" icon={<KeyRound className="h-4 w-4" />}>Change password</LinkButton>}
              <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={signOut}>Sign out</Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Your venues" />
            {companies.data.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {companies.data.map((c) => (
                  <li key={c.companyId} className="flex items-center justify-between py-2 text-sm">
                    <Link className="font-medium text-brand-700" to={`/c/${c.companyId}`}>{c.companyName}</Link>
                    <span className="flex items-center gap-2"><VerificationBadge status={c.verificationStatus} /><Link className="text-xs text-slate-500" to={`/c/${c.companyId}/verify`}>ID</Link></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
