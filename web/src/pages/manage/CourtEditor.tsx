import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { BOOKING_MODELS, BOOKING_MODEL_LABELS, COURT_STATUSES, courtSchema, defaultCourt, type CourtInput } from '@courtsync/shared';
import { storage } from '@/lib/firebase';
import { useSports } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Alert, Button, Card, CardHeader, Input, PageHeader, Select, Switch, Textarea } from '@/components/ui';
import { useCompany } from './context';
import { TimeInput, WeekdayPicker } from './shared';
import { HoursEditor, hoursProblems } from './HoursEditor';

const STATUS_LABEL = { active: 'Active', inactive: 'Inactive (hidden)', temporarilyClosed: 'Temporarily closed' } as const;
const INTERVALS = [10, 15, 20, 30, 45, 60, 90, 120];

export default function CourtEditor() {
  const { courtId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { companyId, company, courts, branches } = useCompany();
  const sports = useSports();
  const existing = courts.find((c) => c.id === courtId);
  const allowedSports = sports.data.filter((s) => company.allowedSportIds.includes(s.id) && (s.enabled || s.id === existing?.sportId));
  const [v, setV] = useState<CourtInput | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (v) return;
    if (courtId && !existing) return;
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, updatedAt, ...rest } = existing;
      setV({ ...defaultCourt(existing.branchId, existing.sportId, existing.timezone), ...rest } as CourtInput);
    } else if (branches.length) {
      const branch = branches.find((b) => b.isPrimary) ?? branches[0];
      const base = defaultCourt(branch.id, allowedSports[0]?.id ?? '', branch.timezone);
      setV({ ...base, bookingModel: allowedSports[0]?.defaultBookingModel ?? 'exclusive' });
    }
  }, [existing, branches, allowedSports, courtId, v]);

  const set = <K extends keyof CourtInput>(k: K, val: CourtInput[K]) => setV((s) => (s ? { ...s, [k]: val } : s));
  const durations = useMemo(() => {
    const step = v?.slotIntervalMinutes ?? 30;
    const out: number[] = [];
    for (let m = step; m <= 12 * 60; m += step) out.push(m);
    return out;
  }, [v?.slotIntervalMinutes]);

  if (!v) return <p className="text-sm text-slate-500">{courtId && !existing ? 'Court not found.' : 'Loading…'}</p>;

  const save = async () => {
    const problems = hoursProblems(v.operatingHours);
    const input = { ...v, capacity: v.bookingModel === 'shared' ? v.capacity : 1, timezone: branches.find((b) => b.id === v.branchId)?.timezone ?? v.timezone };
    const parsed = courtSchema.safeParse(input);
    if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `${i.path.join(' ')}: ${i.message}`.replace(/^: /, '')));
    setErrors(problems);
    if (problems.length || !parsed.success) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const r = await call<{ courtId: string }>('upsertCourt', { companyId, courtId, court: parsed.data });
      toast.success('Court saved');
      if (!courtId) navigate(`/manage/${companyId}/courts/${r.courtId}`, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 12 - v.photoUrls.length)) {
        if (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) {
          toast.error(`${f.name}: use an image under 5 MB.`);
          continue;
        }
        const r = storageRef(storage, `companies/${companyId}/public/courts/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`);
        await uploadBytes(r, f, { contentType: f.type });
        urls.push(await getDownloadURL(r));
      }
      set('photoUrls', [...v.photoUrls, ...urls]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader back={`/manage/${companyId}/courts`} title={courtId ? v.name || 'Court' : 'Add court'} actions={<Button loading={saving} onClick={save}>Save court</Button>} />
      {errors.length > 0 && (
        <div className="mb-4">
          <Alert tone="error" title="Please fix these before saving">
            <ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Alert>
        </div>
      )}
      {allowedSports.length === 0 && <div className="mb-4"><Alert tone="warning">No sports are enabled for your company. Ask CourtSync support to enable the sports you offer.</Alert></div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Basics" />
          <div className="space-y-3">
            <Input label="Court name" required placeholder="e.g. Court 1, Centre court" value={v.name} onChange={(e) => set('name', e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Sport" value={v.sportId} onChange={(e) => {
                const s = allowedSports.find((x) => x.id === e.target.value);
                setV({ ...v, sportId: e.target.value, ...(courtId ? {} : { bookingModel: s?.defaultBookingModel ?? v.bookingModel }) });
              }} placeholder="Choose a sport" options={allowedSports.map((s) => ({ value: s.id, label: s.name }))} />
              {branches.length > 1 && <Select label="Branch" value={v.branchId} onChange={(e) => set('branchId', e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />}
              <Select label="Environment" value={v.environment} onChange={(e) => set('environment', e.target.value as CourtInput['environment'])} options={[{ value: 'indoor', label: 'Indoor' }, { value: 'outdoor', label: 'Outdoor' }]} />
              <Select label="Status" value={v.status} onChange={(e) => set('status', e.target.value as CourtInput['status'])} options={COURT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
            </div>
            {v.status !== 'active' && <Input label="Status note shown to customers" value={v.statusNote ?? ''} onChange={(e) => set('statusNote', e.target.value || null)} />}
            <Textarea label="Description" rows={3} value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Equipment" hint="Comma separated" value={v.equipment.join(', ')} onChange={(e) => set('equipment', splitList(e.target.value))} />
              <Input label="Amenities" hint="Comma separated, e.g. Lights, Showers" value={v.amenities.join(', ')} onChange={(e) => set('amenities', splitList(e.target.value))} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Booking rules" />
          <div className="space-y-3">
            <Select label="How customers book" value={v.bookingModel} onChange={(e) => set('bookingModel', e.target.value as CourtInput['bookingModel'])} options={BOOKING_MODELS.map((m) => ({ value: m, label: BOOKING_MODEL_LABELS[m] }))}
              hint={v.bookingModel === 'shared' ? 'Several customers can book the same time until capacity is reached, e.g. a pool lane or gym.' : v.bookingModel === 'session' ? 'Customers pick one of the fixed sessions you define below.' : 'One booking holds the whole court for the chosen time.'} />
            <div className="grid gap-3 sm:grid-cols-2">
              {v.bookingModel === 'shared' && <Input label="Capacity (people at once)" type="number" min={1} value={v.capacity} onChange={(e) => set('capacity', Number(e.target.value) || 1)} />}
              <Input label="Max participants per booking" type="number" min={1} value={v.maxParticipants} onChange={(e) => set('maxParticipants', Number(e.target.value) || 1)} />
              <Select label="Booking interval" value={String(v.slotIntervalMinutes)} onChange={(e) => {
                const step = Number(e.target.value);
                const snap = (m: number) => Math.max(step, Math.round(m / step) * step);
                setV({ ...v, slotIntervalMinutes: step, minDurationMinutes: snap(v.minDurationMinutes), maxDurationMinutes: snap(v.maxDurationMinutes) });
              }} options={INTERVALS.map((m) => ({ value: String(m), label: `${m} minutes` }))} hint="Start times and durations snap to this." />
              {v.bookingModel !== 'session' && (
                <>
                  <Select label="Shortest booking" value={String(v.minDurationMinutes)} onChange={(e) => set('minDurationMinutes', Number(e.target.value))} options={durations.map((m) => ({ value: String(m), label: fmtMins(m) }))} />
                  <Select label="Longest booking" value={String(v.maxDurationMinutes)} onChange={(e) => set('maxDurationMinutes', Number(e.target.value))} options={durations.filter((m) => m >= v.minDurationMinutes).map((m) => ({ value: String(m), label: fmtMins(m) }))} />
                </>
              )}
              <Input label="Book up to (days ahead)" type="number" min={1} max={365} hint="Leave empty to use the company setting." value={v.maxAdvanceDays ?? ''} onChange={(e) => set('maxAdvanceDays', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <Textarea label="Cancellation policy for this court" rows={2} hint="Shown to customers. The company-wide deadline and charge still apply." value={v.cancellationPolicy ?? ''} onChange={(e) => set('cancellationPolicy', e.target.value)} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Pricing" description={`In ${company.currency}. Taxes are not added automatically.`} />
          <div className="space-y-3">
            {v.bookingModel === 'session' ? (
              <Input label="Price per session" type="number" min={0} step="0.01" value={v.pricing.sessionPrice} onChange={(e) => set('pricing', { ...v.pricing, sessionPrice: Number(e.target.value) || 0 })} />
            ) : (
              <Input label={v.bookingModel === 'shared' ? 'Price per person per hour' : 'Price per hour'} type="number" min={0} step="0.01" value={v.pricing.basePrice} onChange={(e) => set('pricing', { ...v.pricing, basePrice: Number(e.target.value) || 0 })} />
            )}
            {v.bookingModel !== 'session' && (
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Peak hours</p>
                <p className="mb-2 text-xs text-slate-500">A different hourly rate for busy times, e.g. weekday evenings.</p>
                <div className="space-y-3">
                  {v.pricing.peak.map((p, i) => (
                    <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <WeekdayPicker value={p.days} onChange={(days) => set('pricing', { ...v.pricing, peak: v.pricing.peak.map((x, j) => (j === i ? { ...x, days } : x)) })} />
                      <div className="flex flex-wrap items-end gap-2">
                        <TimeInput label="From" value={p.start} onChange={(m) => set('pricing', { ...v.pricing, peak: v.pricing.peak.map((x, j) => (j === i ? { ...x, start: m ?? 0 } : x)) })} />
                        <TimeInput label="To" value={p.end} allowEndOfDay onChange={(m) => set('pricing', { ...v.pricing, peak: v.pricing.peak.map((x, j) => (j === i ? { ...x, end: m ?? 0 } : x)) })} />
                        <Input label="Rate per hour" type="number" min={0} step="0.01" className="w-28" value={p.price} onChange={(e) => set('pricing', { ...v.pricing, peak: v.pricing.peak.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) || 0 } : x)) })} />
                        <Button variant="ghost" size="sm" aria-label="Remove peak window" onClick={() => set('pricing', { ...v.pricing, peak: v.pricing.peak.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set('pricing', { ...v.pricing, peak: [...v.pricing.peak, { days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: 17 * 60, end: 21 * 60, price: Math.round(v.pricing.basePrice * 1.25) }] })}>Add peak hours</Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {v.bookingModel === 'session' && (
          <Card>
            <CardHeader title="Sessions" description="Fixed sessions customers choose from. They must fall within opening hours." />
            <div className="space-y-3">
              {v.sessions.map((s, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-end gap-2">
                    <Input label="Label" value={s.label} onChange={(e) => set('sessions', v.sessions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <Button variant="ghost" size="sm" aria-label="Remove session" onClick={() => set('sessions', v.sessions.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex gap-2">
                    <TimeInput label="Starts" value={s.start} onChange={(m) => set('sessions', v.sessions.map((x, j) => (j === i ? { ...x, start: m ?? 0 } : x)))} />
                    <TimeInput label="Ends" value={s.end} allowEndOfDay onChange={(m) => set('sessions', v.sessions.map((x, j) => (j === i ? { ...x, end: m ?? 0 } : x)))} />
                  </div>
                  <WeekdayPicker value={s.days} onChange={(days) => set('sessions', v.sessions.map((x, j) => (j === i ? { ...x, days } : x)))} />
                </div>
              ))}
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set('sessions', [...v.sessions, { label: `Session ${v.sessions.length + 1}`, start: 7 * 60, end: 8 * 60, days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }])}>Add session</Button>
            </div>
          </Card>
        )}

        <Card className="xl:col-span-2">
          <CardHeader title="Opening hours" description={`Local time (${branches.find((b) => b.id === v.branchId)?.timezone ?? v.timezone}). Add more than one range for a break. Holidays and one-off closures go under Holidays and blocks.`} />
          <HoursEditor value={v.operatingHours} onChange={(h) => set('operatingHours', h)} />
        </Card>

        <Card>
          <CardHeader title="Photos" />
          <div className="grid grid-cols-3 gap-2">
            {v.photoUrls.map((u) => (
              <div key={u} className="group relative">
                <img src={u} alt="" className="aspect-video w-full rounded-md object-cover" />
                <button type="button" aria-label="Remove photo" className="absolute right-1 top-1 rounded bg-white/90 p-1 opacity-0 shadow group-hover:opacity-100 focus:opacity-100" onClick={() => set('photoUrls', v.photoUrls.filter((x) => x !== u))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {v.photoUrls.length < 12 && (
              <label className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50">
                <ImagePlus className="h-5 w-5" />
                {uploading ? 'Uploading…' : 'Add photos'}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={uploading} />
              </label>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Public calendar" description="A page anyone can open to see free times. Booking still requires signing in." />
          <div className="space-y-3">
            <Switch checked={v.publicCalendar.enabled} onChange={(on) => set('publicCalendar', { ...v.publicCalendar, enabled: on })} label="Publish this court's calendar" />
            <Switch disabled={!v.publicCalendar.enabled} checked={v.publicCalendar.showPricing} onChange={(on) => set('publicCalendar', { ...v.publicCalendar, showPricing: on })} label="Show prices" />
            <Switch disabled={!v.publicCalendar.enabled} checked={v.publicCalendar.showDescription} onChange={(on) => set('publicCalendar', { ...v.publicCalendar, showDescription: on })} label="Show description and photos" />
            {courtId && v.publicCalendar.enabled && <Input label="Link to share" readOnly value={`${window.location.origin}/p/${companyId}/${courtId}`} onFocus={(e) => e.currentTarget.select()} />}
          </div>
        </Card>
      </div>
      <div className="mt-4 flex justify-end"><Button loading={saving} onClick={save}>Save court</Button></div>
    </>
  );
}

function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
}

function fmtMins(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${m} min`;
}
