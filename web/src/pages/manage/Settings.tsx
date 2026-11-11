import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { bookingRulesSchema, companyProfileSchema, creditRulesSchema, defaultCompanySettings, NOTIFICATION_CHANNELS, type CompanyPrivateProfile, type CompanySettings, type NotificationChannel } from '@courtsync/shared';
import { db, storage } from '@/lib/firebase';
import { useDoc } from '@/lib/hooks';
import { useCountries, useIdTypes, usePaymentMethods, COMMON_TIMEZONES } from '@/lib/master';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Alert, Avatar, Button, Card, CardHeader, Checkbox, Input, PageHeader, Select, Switch, Tabs, Textarea } from '@/components/ui';
import { useCompany } from './context';

type Tab = 'profile' | 'booking' | 'payments' | 'credits' | 'verification' | 'notifications' | 'registration';

export default function Settings() {
  const { can } = useCompany();
  const canSettings = can('company.settings.edit');
  const [tab, setTab] = useState<Tab>(can('company.profile.edit') ? 'profile' : 'booking');
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        ...(can('company.profile.edit') ? [{ value: 'profile' as Tab, label: 'Profile' }] : []),
        ...(canSettings ? [
          { value: 'booking' as Tab, label: 'Booking rules' },
          { value: 'payments' as Tab, label: 'Payments' },
          { value: 'credits' as Tab, label: 'Credits' },
          { value: 'verification' as Tab, label: 'ID verification' },
          { value: 'notifications' as Tab, label: 'Notifications' },
          { value: 'registration' as Tab, label: 'Registration' },
        ] : []),
      ]} />
      {tab === 'profile' && <ProfileTab />}
      {tab === 'booking' && <SettingsForm section="booking" />}
      {tab === 'payments' && <SettingsForm section="payments" />}
      {tab === 'credits' && <SettingsForm section="credits" />}
      {tab === 'verification' && <SettingsForm section="verification" />}
      {tab === 'notifications' && <SettingsForm section="notifications" />}
      {tab === 'registration' && <RegistrationTab />}
    </>
  );
}

function ProfileTab() {
  const toast = useToast();
  const { companyId, company } = useCompany();
  const countries = useCountries();
  const zones = countries.data.find((c) => c.code === company.countryCode)?.timezones ?? COMMON_TIMEZONES;
  const [v, setV] = useState({
    name: company.name,
    description: company.description ?? '',
    city: company.city ?? '',
    timezone: company.timezone,
    contact: { email: company.contact?.email ?? '', phone: company.contact?.phone ?? '', website: company.contact?.website ?? '' },
    address: { line1: company.address?.line1 ?? '', line2: company.address?.line2 ?? '', city: company.address?.city ?? '', region: company.address?.region ?? '', postalCode: company.address?.postalCode ?? '' },
    location: company.location ?? null,
    operatingHoursNote: company.operatingHoursNote ?? '',
    socialLinks: company.socialLinks ?? {},
  });
  const [lat, setLat] = useState(company.location ? String(company.location.lat) : '');
  const [lng, setLng] = useState(company.location ? String(company.location.lng) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    setError('');
    const location = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
    const social = Object.fromEntries(Object.entries(v.socialLinks).filter(([, url]) => url));
    const parsed = companyProfileSchema.safeParse({ ...v, location, socialLinks: social });
    if (!parsed.success) return setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
    setBusy(true);
    try {
      await updateDoc(doc(db, 'companies', companyId), { ...parsed.data, updatedAt: serverTimestamp() });
      toast.success('Profile saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return toast.error('Use an image under 5 MB.');
    setUploading(true);
    try {
      const r = storageRef(storage, `companies/${companyId}/public/logo-${Date.now()}`);
      await uploadBytes(r, file, { contentType: file.type });
      await updateDoc(doc(db, 'companies', companyId), { logoUrl: await getDownloadURL(r), updatedAt: serverTimestamp() });
      toast.success('Logo updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const setSocial = (k: string, url: string) => setV({ ...v, socialLinks: { ...v.socialLinks, [k]: url } });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Public profile" description="Shown to customers when they find your company." />
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={company.name} src={company.logoUrl} size="lg" />
            <label className="cursor-pointer text-sm font-medium text-brand-700">
              {uploading ? 'Uploading…' : 'Change logo'}
              <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
          </div>
          <Input label="Company name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <Textarea label="About" rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="City" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
            <Select label="Time zone" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} options={[...new Set([...zones, v.timezone])].map((z) => ({ value: z, label: z }))} />
          </div>
          <Input label="Opening hours note" placeholder="e.g. Open daily 6 am to 10 pm" value={v.operatingHoursNote} onChange={(e) => setV({ ...v, operatingHoursNote: e.target.value })} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Contact and location" />
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" value={v.contact.email} onChange={(e) => setV({ ...v, contact: { ...v.contact, email: e.target.value } })} />
            <Input label="Phone" hint="International format" value={v.contact.phone} onChange={(e) => setV({ ...v, contact: { ...v.contact, phone: e.target.value } })} />
          </div>
          <Input label="Website" placeholder="https://" value={v.contact.website} onChange={(e) => setV({ ...v, contact: { ...v.contact, website: e.target.value } })} />
          <Input label="Address line 1" value={v.address.line1} onChange={(e) => setV({ ...v, address: { ...v.address, line1: e.target.value } })} />
          <Input label="Address line 2" value={v.address.line2} onChange={(e) => setV({ ...v, address: { ...v.address, line2: e.target.value } })} />
          <div className="grid grid-cols-3 gap-2">
            <Input label="City" value={v.address.city} onChange={(e) => setV({ ...v, address: { ...v.address, city: e.target.value } })} />
            <Input label="Region" value={v.address.region} onChange={(e) => setV({ ...v, address: { ...v.address, region: e.target.value } })} />
            <Input label="Postal code" value={v.address.postalCode} onChange={(e) => setV({ ...v, address: { ...v.address, postalCode: e.target.value } })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
            <Input label="Longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} hint="For the map link customers see." />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {['instagram', 'facebook', 'youtube', 'x'].map((k) => <Input key={k} label={k[0].toUpperCase() + k.slice(1)} placeholder="https://" value={v.socialLinks[k] ?? ''} onChange={(e) => setSocial(k, e.target.value)} />)}
          </div>
        </div>
      </Card>
      <div className="xl:col-span-2">
        {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
        <Button loading={busy} onClick={save}>Save profile</Button>
      </div>
    </div>
  );
}

function SettingsForm({ section }: { section: 'booking' | 'payments' | 'credits' | 'verification' | 'notifications' }) {
  const toast = useToast();
  const { companyId, company, settings } = useCompany();
  const [v, setV] = useState<CompanySettings>(() => strip(settings) ?? defaultCompanySettings([]));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (settings) setV(strip(settings)!);
  }, [settings]);
  const methods = usePaymentMethods();
  const countries = useCountries();
  const idTypes = useIdTypes();
  const country = countries.data.find((c) => c.code === company.countryCode);
  const countryMethods = methods.data.filter((m) => m.enabled && country?.paymentMethodIds.includes(m.id));
  const customerTypes = idTypes.data.filter((t) => t.enabled && t.countryCode === company.countryCode && t.appliesTo.customer);

  const save = async () => {
    setError('');
    const b = bookingRulesSchema.safeParse(v.booking);
    const c = creditRulesSchema.safeParse(v.credits);
    if (!b.success) return setError(b.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
    if (!c.success) return setError(c.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
    if (v.paymentMethodIds.length === 0) return setError('Enable at least one payment method.');
    setBusy(true);
    try {
      await setDoc(doc(db, 'companies', companyId, 'settings', 'general'), { ...v, booking: b.data, credits: c.data, updatedAt: serverTimestamp() });
      toast.success('Settings saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const bk = v.booking;
  const setB = (patch: Partial<CompanySettings['booking']>) => setV({ ...v, booking: { ...bk, ...patch } });
  const cr = v.credits;
  const setC = (patch: Partial<CompanySettings['credits']>) => setV({ ...v, credits: { ...cr, ...patch } });
  const int = (s: string) => Math.max(0, Math.round(Number(s) || 0));

  return (
    <Card>
      {section === 'booking' && (
        <div className="space-y-4">
          <CardHeader title="Booking rules" description="Apply to every court unless a court overrides them." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="Minimum notice (minutes)" type="number" min={0} value={bk.minAdvanceMinutes} onChange={(e) => setB({ minAdvanceMinutes: int(e.target.value) })} hint="How soon before start customers can still book." />
            <Input label="Book up to (days ahead)" type="number" min={1} max={365} value={bk.maxAdvanceDays} onChange={(e) => setB({ maxAdvanceDays: Math.max(1, int(e.target.value)) })} />
            <Input label="Bookings per customer" type="number" min={0} value={bk.maxActiveBookingsPerCustomer} onChange={(e) => setB({ maxActiveBookingsPerCustomer: int(e.target.value) })} hint="Upcoming bookings at once. 0 means no limit." />
            <Input label="Free cancellation until (hours before)" type="number" min={0} value={bk.cancellationDeadlineHours} onChange={(e) => setB({ cancellationDeadlineHours: int(e.target.value) })} />
            <Input label="Late cancellation charge (%)" type="number" min={0} max={100} value={bk.lateCancellationChargePct} onChange={(e) => setB({ lateCancellationChargePct: Math.min(100, Number(e.target.value) || 0) })} />
            <Input label="Payment window (minutes)" type="number" min={5} value={bk.slotHoldMinutes} onChange={(e) => setB({ slotHoldMinutes: Math.max(5, int(e.target.value)) })} hint="Time is held this long while the customer pays." />
          </div>
          <Switch checked={bk.requireApproval} onChange={(on) => setB({ requireApproval: on })} label="Staff approve every booking" description="When off, bookings are confirmed instantly (after payment if required)." />
          {bk.requireApproval && <Input label="Approval window (minutes)" type="number" min={15} className="max-w-xs" value={bk.approvalHoldMinutes} onChange={(e) => setB({ approvalHoldMinutes: Math.max(15, int(e.target.value)) })} hint="Unanswered requests expire after this, or at the booking start." />}
          <Switch checked={bk.requirePrepayment} onChange={(on) => setB({ requirePrepayment: on })} label="Require payment before the booking is confirmed" />
          {bk.requirePrepayment && <Input label="Deposit (% of price)" type="number" min={0} max={100} className="max-w-xs" value={bk.depositPct} onChange={(e) => setB({ depositPct: Math.min(100, Number(e.target.value) || 0) })} />}
          <Textarea label="Refund policy" rows={3} value={bk.refundPolicy} onChange={(e) => setB({ refundPolicy: e.target.value })} />
        </div>
      )}
      {section === 'payments' && (
        <div className="space-y-3">
          <CardHeader title="Payment methods" description={`Methods available in ${country?.name ?? company.countryCode}. Online payments are confirmed only by the gateway.`} />
          {countryMethods.length === 0 && <Alert tone="warning">No payment methods are configured for your country yet. Contact CourtSync support.</Alert>}
          {countryMethods.map((m) => (
            <Checkbox key={m.id} checked={v.paymentMethodIds.includes(m.id)} onChange={(on) => setV({ ...v, paymentMethodIds: on ? [...v.paymentMethodIds, m.id] : v.paymentMethodIds.filter((x) => x !== m.id) })} label={<>{m.name} <span className="text-slate-500">{m.kind === 'offline' ? '(recorded by staff)' : '(online)'}</span></>} />
          ))}
        </div>
      )}
      {section === 'credits' && (
        <div className="space-y-4">
          <CardHeader title="Credits" description="Credits belong to your company only. Customers can't use them elsewhere." />
          <Switch checked={cr.enabled} onChange={(on) => setC({ enabled: on })} label="Use credits" />
          {cr.enabled && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input label={`Value of 1 credit (${company.currency})`} type="number" min={0} step="0.01" value={cr.creditValue} onChange={(e) => setC({ creditValue: Number(e.target.value) || 0 })} />
                <Input label="Minimum to redeem" type="number" min={0} value={cr.minRedeem} onChange={(e) => setC({ minRedeem: int(e.target.value) })} />
                <Input label="Maximum per payment" type="number" min={0} value={cr.maxRedeemPerTransaction} onChange={(e) => setC({ maxRedeemPerTransaction: int(e.target.value) })} hint="0 means no limit." />
                <Input label="Expire after (days)" type="number" min={1} value={cr.defaultExpiryDays ?? ''} onChange={(e) => setC({ defaultExpiryDays: e.target.value ? Math.max(1, int(e.target.value)) : null })} hint="Empty means never." />
              </div>
              <div className="flex gap-6">
                <Checkbox checked={cr.eligible.bookings} onChange={(on) => setC({ eligible: { ...cr.eligible, bookings: on } })} label="Use on court bookings" />
                <Checkbox checked={cr.eligible.services} onChange={(on) => setC({ eligible: { ...cr.eligible, services: on } })} label="Use on memberships" />
              </div>
            </>
          )}
        </div>
      )}
      {section === 'verification' && (
        <div className="space-y-3">
          <CardHeader title="Customer ID verification" description="Ask only for what you need. Numbers are encrypted and shown masked to staff." />
          {customerTypes.length === 0 ? <Alert tone="info">No identity documents are configured for your country.</Alert> : customerTypes.map((t) => {
            const req = v.verification.requiredTypeIds.includes(t.id);
            const opt = v.verification.optionalTypeIds.includes(t.id);
            const value = req ? 'required' : opt ? 'optional' : 'off';
            return (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <span className="text-sm font-medium">{t.name}{t.highlySensitive && <span className="ml-2 text-xs text-amber-700">Highly sensitive</span>}{t.mandatoryFor.customer && <span className="ml-2 text-xs text-slate-500">Required by the platform</span>}</span>
                <Select aria-label={`${t.name} requirement`} className="w-40" value={t.mandatoryFor.customer ? 'required' : value} disabled={t.mandatoryFor.customer} onChange={(e) => {
                  const val = e.target.value;
                  const rq = v.verification.requiredTypeIds.filter((x) => x !== t.id);
                  const op = v.verification.optionalTypeIds.filter((x) => x !== t.id);
                  setV({ ...v, verification: { ...v.verification, requiredTypeIds: val === 'required' ? [...rq, t.id] : rq, optionalTypeIds: val === 'optional' ? [...op, t.id] : op } });
                }} options={[{ value: 'off', label: 'Not used' }, { value: 'optional', label: 'Accepted' }, { value: 'required', label: 'Required' }]} />
              </div>
            );
          })}
          <Switch checked={v.verification.requireBeforeBooking} onChange={(on) => setV({ ...v, verification: { ...v.verification, requireBeforeBooking: on } })} label="Customers must be verified before booking" />
        </div>
      )}
      {section === 'notifications' && (
        <div className="space-y-3">
          <CardHeader title="Notifications" description="How customers and staff hear about bookings, approvals and reminders. Email, push and SMS need the platform to have them configured." />
          {NOTIFICATION_CHANNELS.map((ch) => (
            <Checkbox key={ch} checked={v.notifications.channels.includes(ch)} disabled={ch === 'inApp'} onChange={(on) => setV({ ...v, notifications: { channels: on ? [...v.notifications.channels, ch] : v.notifications.channels.filter((x) => x !== ch) as NotificationChannel[] } })} label={{ inApp: 'In the app (always on)', email: 'Email', push: 'Push notifications', sms: 'SMS' }[ch]} />
          ))}
        </div>
      )}
      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
      <div className="mt-4"><Button loading={busy} onClick={save}>Save</Button></div>
    </Card>
  );
}

function strip(s: (CompanySettings & { id?: string }) | null): CompanySettings | null {
  if (!s) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, updatedAt, ...rest } = s;
  return rest as CompanySettings;
}

function RegistrationTab() {
  const toast = useToast();
  const { companyId, company } = useCompany();
  const countries = useCountries();
  const required = countries.data.find((c) => c.code === company.countryCode)?.businessVerification ?? [];
  const priv = useDoc<CompanyPrivateProfile>(doc(db, 'companies', companyId, 'private', 'profile'), `priv-${companyId}`);
  const [v, setV] = useState<CompanyPrivateProfile>({ registration: {}, verification: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (priv.data) setV({ registration: priv.data.registration ?? {}, verification: priv.data.verification ?? [], notes: priv.data.notes });
  }, [priv.data]);
  const docs = required.map((r) => v.verification.find((x) => x.label === r.label) ?? { label: r.label, value: '', provided: false });
  const setDocVal = (label: string, value: string) => setV({ ...v, verification: [...v.verification.filter((x) => x.label !== label), { label, value, provided: !!value.trim() }] });
  return (
    <Card>
      <CardHeader title="Business registration" description="Private. Visible only to your owners and admins and to CourtSync administrators." />
      <div className="space-y-3">
        <Input label="Legal name" value={v.registration.legalName ?? ''} onChange={(e) => setV({ ...v, registration: { ...v.registration, legalName: e.target.value } })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Registration number" value={v.registration.registrationNumber ?? ''} onChange={(e) => setV({ ...v, registration: { ...v.registration, registrationNumber: e.target.value } })} />
          <Input label="Tax id" value={v.registration.taxId ?? ''} onChange={(e) => setV({ ...v, registration: { ...v.registration, taxId: e.target.value } })} />
        </div>
        {docs.map((d) => <Input key={d.label} label={`${d.label}${required.find((r) => r.label === d.label)?.required ? ' (required)' : ''}`} value={d.value ?? ''} onChange={(e) => setDocVal(d.label, e.target.value)} />)}
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await setDoc(doc(db, 'companies', companyId, 'private', 'profile'), { ...v, updatedAt: serverTimestamp() }, { merge: true });
            toast.success('Saved');
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}>Save</Button>
      </div>
    </Card>
  );
}
