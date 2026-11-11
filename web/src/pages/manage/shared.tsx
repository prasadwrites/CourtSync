import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import clsx from 'clsx';
import { blockedSlotSchema, parseHHMM, toHHMM, WEEKDAYS, WEEKDAY_LABELS, type BlockedSlot, type CompanyCustomer, type Weekday } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useAsync, useQuery } from '@/lib/hooks';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useSession } from '@/lib/auth';
import { getAvailability, unitsFor, type CreateBookingResult } from '@/lib/booking';
import { formatMoney } from '@/lib/format';
import { Alert, Button, Checkbox, ErrorState, Input, Modal, SearchInput, Select, Spinner, Textarea } from '@/components/ui';
import { SlotPicker, type SlotSelection } from '@/components/SlotPicker';
import { useCompany, type WithId } from './context';

// ------------------------------------------------------------- inputs

export function TimeInput({ label, value, onChange, error, allowEndOfDay }: { label?: string; value: number | null; onChange: (m: number | null) => void; error?: string; allowEndOfDay?: boolean }) {
  const shown = value == null ? '' : value >= 24 * 60 ? '23:59' : toHHMM(value);
  return (
    <Input
      type="time"
      label={label}
      error={error}
      value={shown}
      step={300}
      onChange={(e) => {
        if (!e.target.value) return onChange(null);
        const m = parseHHMM(e.target.value);
        onChange(allowEndOfDay && m === 23 * 60 + 59 ? 24 * 60 : m);
      }}
    />
  );
}

export function WeekdayPicker({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || value.includes(x)))}
            className={clsx('h-8 w-11 rounded-md border text-xs font-medium', on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}
          >
            {WEEKDAY_LABELS[d].slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------- customer picker

export function useCustomers() {
  const { companyId } = useCompany();
  return useQuery<CompanyCustomer>(query(collection(db, 'companies', companyId, 'customers'), orderBy('displayName'), limit(2000)), `customers-${companyId}`);
}

export function CustomerPicker({ value, onChange }: { value: string; onChange: (uid: string, c?: WithId<CompanyCustomer>) => void }) {
  const { companyId } = useCompany();
  const customers = useCustomers();
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const matches = q ? customers.data.filter((c) => `${c.displayName} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const selected = customers.data.find((c) => c.id === value);
  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
        <div>
          <p className="text-sm font-medium">{selected.displayName}</p>
          <p className="text-xs text-slate-500">{selected.email ?? selected.phone}{selected.status !== 'active' && ` · ${selected.status}`}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange('')}>Change</Button>
      </div>
    );
  }
  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search customers by name, email or phone" />
      {q && (
        <ul className="mt-1 max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">
              No match. <Link className="font-medium text-brand-700" to={`/manage/${companyId}/customers?new=1`}>Add a customer</Link>
            </li>
          )}
          {matches.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={c.status !== 'active'} className="w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50" onClick={() => onChange(c.id, c)}>
                <span className="block text-sm font-medium">{c.displayName}</span>
                <span className="block text-xs text-slate-500">{c.email ?? c.phone}{c.status !== 'active' && ` · ${c.status}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------ staff booking

export function StaffBookingModal({ initial, onClose, onCreated }: { initial: { courtId?: string; date: string; startMin?: number; customerUid?: string }; onClose: () => void; onCreated?: (id: string) => void }) {
  const toast = useToast();
  const { companyId, company, courts, can, settings } = useCompany();
  const bookable = courts.filter((c) => c.status === 'active');
  const [courtId, setCourtId] = useState(initial.courtId ?? bookable[0]?.id ?? '');
  const [date, setDate] = useState(initial.date);
  const [customerUid, setCustomerUid] = useState(initial.customerUid ?? '');
  const [participants, setParticipants] = useState(1);
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [notes, setNotes] = useState('');
  const [confirmNow, setConfirmNow] = useState(can('bookings.approve'));
  const [saving, setSaving] = useState(false);
  const avail = useAsync(() => (courtId ? getAvailability(companyId, courtId, date) : Promise.resolve(null)), [courtId, date]);
  const court = avail.data?.court;
  const slots = avail.data?.days[0]?.slots ?? [];

  // Preselect the clicked cell once availability arrives.
  useEffect(() => {
    if (initial.startMin == null || !court || slot) return;
    const cell = slots.find((s) => s.startMin === initial.startMin);
    if (cell && (cell.state === 'available' || cell.state === 'limited')) {
      const len = court.bookingModel === 'session' ? cell.endMin - cell.startMin : court.minDurationMinutes;
      setSlot({ startMin: cell.startMin, endMin: cell.startMin + len });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [court?.id, slots.length]);

  const submit = async () => {
    if (!customerUid || !slot) return;
    setSaving(true);
    try {
      const res = await call<CreateBookingResult>('createBooking', { companyId, courtId, date, startMin: slot.startMin, endMin: slot.endMin, participants, customerUid, notes: notes || undefined, confirmNow });
      toast.success(res.status === 'confirmed' ? 'Booking confirmed' : 'Booking created');
      onCreated?.(res.bookingId);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      avail.reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New booking"
      description="Book on behalf of a customer. The same availability and double-booking checks apply."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!customerUid || !slot} onClick={submit}>Create booking</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Customer</p>
          <CustomerPicker value={customerUid} onChange={(uid) => setCustomerUid(uid)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Court" value={courtId} onChange={(e) => { setCourtId(e.target.value); setSlot(null); }} options={bookable.map((c) => ({ value: c.id, label: c.name }))} />
          <Input type="date" label="Date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setSlot(null); } }} />
          <Input type="number" label="Participants" min={1} max={court?.maxParticipants ?? 100} value={participants} onChange={(e) => setParticipants(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        {avail.loading ? (
          <Spinner />
        ) : avail.error ? (
          <ErrorState error={avail.error} retry={avail.reload} />
        ) : court ? (
          <SlotPicker court={court} slots={slots} units={unitsFor(court.bookingModel, participants)} value={slot} onChange={setSlot} currency={company.currency} />
        ) : (
          <Alert tone="info">Add an active court first.</Alert>
        )}
        {slot?.estimate !== undefined && <p className="text-sm text-slate-600">Estimated price {formatMoney(slot.estimate * (court?.bookingModel === 'shared' ? participants : 1), company.currency)}. The final price is calculated when the booking is saved.</p>}
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {can('bookings.approve') && (
          <Checkbox checked={confirmNow} onChange={setConfirmNow} label={settings?.booking.requirePrepayment ? 'Confirm now and collect payment at the desk' : 'Confirm now without approval'} />
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- blocks

export function BlockEditor({ initial, onClose }: { initial?: WithId<BlockedSlot> | Partial<BlockedSlot>; onClose: () => void }) {
  const toast = useToast();
  const { user } = useSession();
  const { companyId, branches, courts, branchName } = useCompany();
  const existing = initial && 'id' in initial ? (initial as WithId<BlockedSlot>) : null;
  const [v, setV] = useState<BlockedSlot>({
    courtId: null,
    branchId: branches[0]?.id ?? '',
    reason: '',
    kind: 'oneOff',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    startMin: null,
    endMin: null,
    days: [],
    ...(initial ?? {}),
  } as BlockedSlot);
  const [fullDay, setFullDay] = useState(v.startMin == null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const branchCourts = useMemo(() => courts.filter((c) => c.branchId === v.branchId), [courts, v.branchId]);

  const save = async () => {
    const data = {
      courtId: v.courtId || null,
      branchId: v.branchId,
      reason: v.reason.trim(),
      kind: v.kind,
      startDate: v.startDate,
      endDate: v.kind === 'oneOff' && !v.endDate ? v.startDate : v.endDate,
      startMin: fullDay ? null : v.startMin,
      endMin: fullDay ? null : v.endMin,
      days: v.kind === 'weekly' ? v.days : [],
    };
    const parsed = blockedSlotSchema.safeParse(data);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setSaving(true);
    try {
      if (existing) await updateDoc(doc(db, 'companies', companyId, 'blockedSlots', existing.id), { ...parsed.data });
      else await addDoc(collection(db, 'companies', companyId, 'blockedSlots'), { ...parsed.data, createdBy: user?.uid ?? null, createdAt: serverTimestamp() });
      toast.success('Saved. Customers can no longer book that time.');
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
      title={existing ? 'Edit block' : 'Block time'}
      description="Existing bookings are not cancelled. Review them in the calendar."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Type"
          value={v.kind}
          onChange={(e) => setV({ ...v, kind: e.target.value as BlockedSlot['kind'] })}
          options={[
            { value: 'oneOff', label: 'One-off (maintenance, private event)' },
            { value: 'holiday', label: 'Holiday' },
            { value: 'weekly', label: 'Repeats every week' },
          ]}
        />
        <Input label="Reason" required placeholder="e.g. Resurfacing, Diwali, Coaching block" value={v.reason} error={errors.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          {branches.length > 1 && <Select label="Branch" value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value, courtId: null })} options={branches.map((b) => ({ value: b.id, label: b.name }))} />}
          <Select label="Applies to" value={v.courtId ?? ''} onChange={(e) => setV({ ...v, courtId: e.target.value || null })} options={[{ value: '', label: `Every court at ${branchName(v.branchId)}` }, ...branchCourts.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="date" label={v.kind === 'weekly' ? 'From' : 'Start date'} value={v.startDate} error={errors.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
          <Input type="date" label={v.kind === 'weekly' ? 'Until (optional)' : 'End date'} hint={v.kind === 'weekly' ? 'Leave empty to repeat indefinitely.' : 'Same as start for a single day.'} value={v.endDate} error={errors.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
        </div>
        {v.kind === 'weekly' && (
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Days</p>
            <WeekdayPicker value={v.days} onChange={(days) => setV({ ...v, days })} />
            {errors.days && <p className="mt-1 text-xs text-red-600">{errors.days}</p>}
          </div>
        )}
        <Checkbox checked={fullDay} onChange={setFullDay} label="Whole day" />
        {!fullDay && (
          <div className="grid grid-cols-2 gap-3">
            <TimeInput label="From" value={v.startMin} onChange={(m) => setV({ ...v, startMin: m })} />
            <TimeInput label="To" value={v.endMin} allowEndOfDay error={errors.endMin} onChange={(m) => setV({ ...v, endMin: m })} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function blockSummary(b: BlockedSlot): string {
  const time = b.startMin == null ? 'All day' : `${toHHMM(b.startMin)}–${b.endMin! >= 1440 ? '24:00' : toHHMM(b.endMin!)}`;
  if (b.kind === 'weekly') return `Every ${b.days.map((d) => WEEKDAY_LABELS[d].slice(0, 3)).join(', ')} · ${time} · from ${b.startDate}${b.endDate ? ` to ${b.endDate}` : ''}`;
  return `${b.startDate}${b.endDate && b.endDate !== b.startDate ? ` to ${b.endDate}` : ''} · ${time}`;
}

export function useBlocks() {
  const { companyId } = useCompany();
  return useQuery<BlockedSlot>(query(collection(db, 'companies', companyId, 'blockedSlots'), limit(1000)), `blocks-${companyId}`);
}

export { formatMoney };
