import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { DateTime } from 'luxon';
import clsx from 'clsx';
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { blockRangeOn, eachDate, monthRange, openRanges, weekRange, type BlockedSlot, type Booking, type Court } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { formatMinutes, todayISO } from '@/lib/format';
import { Button, Card, ErrorState, PageHeader, Select, Spinner, Tabs } from '@/components/ui';
import { bookingCellClass } from '@/components/StatusBadge';
import { useCompany, type WithId } from './context';
import { BlockEditor, StaffBookingModal, useBlocks } from './shared';

type View = 'day' | 'week' | 'month';
const PX_PER_MIN = 1;
const HIDDEN = new Set(['cancelled', 'rejected', 'expired']);

export default function Calendar() {
  const { companyId, company, courts, branches, can } = useCompany();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const view = (params.get('view') as View) || 'day';
  const date = params.get('date') || todayISO(company.timezone);
  const [branchId, setBranchId] = useState(params.get('branch') || '');
  const activeCourts = courts.filter((c) => c.status !== 'inactive' && (!branchId || c.branchId === branchId));
  const courtId = params.get('court') || activeCourts[0]?.id || '';
  const [showCancelled, setShowCancelled] = useState(false);
  const [newBooking, setNewBooking] = useState<{ courtId?: string; date: string; startMin?: number } | null>(params.get('new') ? { date } : null);
  const [blockOpen, setBlockOpen] = useState<Partial<BlockedSlot> | null>(null);
  const blocks = useBlocks();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
    next.delete('new');
    setParams(next, { replace: true });
  };

  const range = view === 'day' ? { start: date, end: date } : view === 'week' ? weekRange(date) : monthRange(date);
  const bookingsQ =
    view === 'day'
      ? query(collection(db, 'companies', companyId, 'bookings'), where('date', '==', date), orderBy('startMin'), limit(1000))
      : courtId
        ? query(collection(db, 'companies', companyId, 'bookings'), where('courtId', '==', courtId), where('date', '>=', range.start), where('date', '<=', range.end), limit(2000))
        : null;
  const bookings = useQuery<Booking>(bookingsQ, `cal-${companyId}-${view}-${date}-${view === 'day' ? '' : courtId}`);
  const visible = bookings.data.filter((b) => showCancelled || !HIDDEN.has(b.status));

  const step = (dir: 1 | -1) => {
    const d = DateTime.fromISO(date);
    const next = view === 'day' ? d.plus({ days: dir }) : view === 'week' ? d.plus({ weeks: dir }) : d.plus({ months: dir });
    set({ date: next.toISODate()! });
  };
  const title =
    view === 'day'
      ? DateTime.fromISO(date).toFormat('cccc, d LLLL yyyy')
      : view === 'week'
        ? `${DateTime.fromISO(range.start).toFormat('d LLL')} – ${DateTime.fromISO(range.end).toFormat('d LLL yyyy')}`
        : DateTime.fromISO(date).toFormat('LLLL yyyy');

  const onCellClick = (court: WithId<Court>, d: string, minute: number) => {
    if (!can('bookings.create')) return;
    setNewBooking({ courtId: court.id, date: d, startMin: minute });
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        actions={
          <div className="flex flex-wrap gap-2">
            {can('calendar.block') && <Button variant="secondary" icon={<CalendarOff className="h-4 w-4" />} onClick={() => setBlockOpen({ startDate: date, courtId: view === 'day' ? null : courtId, branchId: branchId || courts.find((c) => c.id === courtId)?.branchId || branches[0]?.id })}>Block time</Button>}
            {can('bookings.create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewBooking({ date, courtId: view === 'day' ? undefined : courtId })}>New booking</Button>}
          </div>
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="secondary" size="sm" onClick={() => set({ date: todayISO(company.timezone) })}>Today</Button>
            <Button variant="ghost" size="sm" aria-label="Next" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <input type="date" aria-label="Go to date" className="h-8 rounded-md border border-slate-300 px-2 text-sm" value={date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          <p className="mr-auto px-1 text-sm font-semibold">{title}</p>
          {branches.length > 1 && (
            <Select aria-label="Branch" className="h-8 w-40" value={branchId} onChange={(e) => { setBranchId(e.target.value); set({ branch: e.target.value || null, court: null }); }} placeholder="All branches" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          {view !== 'day' && <Select aria-label="Court" className="h-8 w-44" value={courtId} onChange={(e) => set({ court: e.target.value })} options={activeCourts.map((c) => ({ value: c.id, label: c.name }))} />}
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled
          </label>
        </div>
        <div className="px-3 pt-2">
          <Tabs<View> value={view} onChange={(v) => set({ view: v })} tabs={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </div>
        {bookings.error ? (
          <ErrorState error={bookings.error} />
        ) : bookings.loading && bookings.data.length === 0 ? (
          <Spinner />
        ) : activeCourts.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No courts to show.</p>
        ) : view === 'month' ? (
          <MonthGrid date={date} court={activeCourts.find((c) => c.id === courtId)} bookings={visible} blocks={blocks.data} onPick={(d) => set({ view: 'day', date: d })} />
        ) : (
          <TimeGrid
            columns={
              view === 'day'
                ? activeCourts.map((c) => ({ key: c.id, label: c.name, court: c, date }))
                : (() => {
                    const c = activeCourts.find((x) => x.id === courtId);
                    return c ? eachDate(range.start, range.end).map((d) => ({ key: d, label: DateTime.fromISO(d).toFormat('ccc d'), court: c, date: d })) : [];
                  })()
            }
            bookings={visible}
            blocks={blocks.data}
            onBookingClick={(b) => navigate(`/manage/${companyId}/bookings/${b.id}`)}
            onCellClick={onCellClick}
          />
        )}
      </Card>
      {newBooking && <StaffBookingModal initial={newBooking} onClose={() => setNewBooking(null)} onCreated={(id) => navigate(`/manage/${companyId}/bookings/${id}`)} />}
      {blockOpen && <BlockEditor initial={blockOpen} onClose={() => setBlockOpen(null)} />}
    </>
  );
}

interface Column {
  key: string;
  label: string;
  court: WithId<Court>;
  date: string;
}

function TimeGrid({ columns, bookings, blocks, onBookingClick, onCellClick }: { columns: Column[]; bookings: WithId<Booking>[]; blocks: WithId<BlockedSlot>[]; onBookingClick: (b: WithId<Booking>) => void; onCellClick: (c: WithId<Court>, date: string, minute: number) => void }) {
  const { from, to } = useMemo(() => {
    let lo = 24 * 60;
    let hi = 0;
    for (const col of columns) {
      for (const r of openRanges(col.court, col.date)) {
        lo = Math.min(lo, r.start);
        hi = Math.max(hi, r.end);
      }
    }
    for (const b of bookings) {
      lo = Math.min(lo, b.startMin);
      hi = Math.max(hi, b.endMin);
    }
    if (hi <= lo) return { from: 6 * 60, to: 22 * 60 };
    return { from: Math.floor(lo / 60) * 60, to: Math.min(24 * 60, Math.ceil(hi / 60) * 60) };
  }, [columns, bookings]);
  const height = (to - from) * PX_PER_MIN;
  const hours: number[] = [];
  for (let h = from; h < to; h += 60) hours.push(h);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-10 w-14 shrink-0 bg-white">
          <div className="h-10 border-b border-slate-200" />
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: (h - from) * PX_PER_MIN }}>{formatMinutes(h)}</span>
            ))}
          </div>
        </div>
        {columns.map((col) => {
          const open = openRanges(col.court, col.date);
          const closed = invert(open, from, to);
          const blockRanges = blocks.map((b) => ({ b, r: blockRangeOn(b, col.court.id, col.court.branchId, col.date) })).filter((x) => x.r);
          const colBookings = bookings.filter((b) => b.courtId === col.court.id && b.date === col.date);
          const lanes = assignLanes(colBookings);
          const step = col.court.bookingModel === 'session' ? 30 : col.court.slotIntervalMinutes;
          return (
            <div key={col.key} className="w-40 shrink-0 border-l border-slate-200 sm:w-48">
              <div className="flex h-10 items-center justify-center truncate border-b border-slate-200 px-2 text-xs font-semibold">{col.label}</div>
              <div
                className="relative cursor-pointer"
                style={{ height }}
                onClick={(e) => {
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  const minute = from + Math.floor(y / PX_PER_MIN / step) * step;
                  onCellClick(col.court, col.date, minute);
                }}
              >
                {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: (h - from) * PX_PER_MIN }} />)}
                {closed.map((r, i) => <div key={i} className="absolute inset-x-0 bg-slate-100/80" style={{ top: (r.start - from) * PX_PER_MIN, height: (r.end - r.start) * PX_PER_MIN }} />)}
                {blockRanges.map(({ b, r }) => {
                  const s = Math.max(r!.start, from);
                  const e = Math.min(r!.end, to);
                  if (e <= s) return null;
                  return (
                    <div key={b.id} className="absolute inset-x-0 overflow-hidden bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] p-1 text-[11px] text-slate-600" style={{ top: (s - from) * PX_PER_MIN, height: (e - s) * PX_PER_MIN }} title={b.reason}>
                      {b.reason}
                    </div>
                  );
                })}
                {colBookings.map((b) => {
                  const lane = lanes.get(b.id)!;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookingClick(b);
                      }}
                      className={clsx('absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:z-20 hover:shadow', bookingCellClass[b.status])}
                      style={{ top: (b.startMin - from) * PX_PER_MIN + 1, height: Math.max(18, (b.endMin - b.startMin) * PX_PER_MIN - 2), left: `calc(${(lane.index / lane.count) * 100}% + 2px)`, width: `calc(${100 / lane.count}% - 4px)` }}
                    >
                      <span className="block truncate font-semibold">{b.customerName}</span>
                      <span className="block truncate">{formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}{b.participants > 1 ? ` · ${b.participants}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function invert(open: { start: number; end: number }[], from: number, to: number) {
  const out: { start: number; end: number }[] = [];
  let t = from;
  for (const r of open) {
    if (r.start > t) out.push({ start: t, end: Math.min(r.start, to) });
    t = Math.max(t, r.end);
  }
  if (t < to) out.push({ start: t, end: to });
  return out.filter((r) => r.end > r.start);
}

/** Side-by-side lanes for overlapping bookings (shared courts or history). */
function assignLanes(list: WithId<Booking>[]): Map<string, { index: number; count: number }> {
  const sorted = [...list].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out = new Map<string, { index: number; count: number }>();
  let group: WithId<Booking>[] = [];
  let groupEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    const count = Math.max(1, laneEnds.length);
    for (const b of group) out.set(b.id, { index: out.get(b.id)!.index, count });
    group = [];
    laneEnds.length = 0;
  };
  for (const b of sorted) {
    if (b.startMin >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endMin);
    } else laneEnds[lane] = b.endMin;
    out.set(b.id, { index: lane, count: 1 });
    group.push(b);
    groupEnd = Math.max(groupEnd, b.endMin);
  }
  if (group.length) flush();
  return out;
}

function MonthGrid({ date, court, bookings, blocks, onPick }: { date: string; court?: WithId<Court>; bookings: WithId<Booking>[]; blocks: WithId<BlockedSlot>[]; onPick: (d: string) => void }) {
  const { start, end } = monthRange(date);
  const gridStart = weekRange(start).start;
  const gridEnd = weekRange(end).end;
  const days = eachDate(gridStart, gridEnd);
  const byDate = new Map<string, WithId<Booking>[]>();
  for (const b of bookings) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="p-3">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-xs">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-slate-50 py-1.5 text-center font-medium text-slate-500">{d}</div>)}
        {days.map((d) => {
          const inMonth = d >= start && d <= end;
          const list = byDate.get(d) ?? [];
          const closed = court ? openRanges(court, d).length === 0 : false;
          const blocked = court ? blocks.some((b) => { const r = blockRangeOn(b, court.id, court.branchId, d); return r && r.start === 0 && r.end >= 1440; }) : false;
          const minutes = list.reduce((s, b) => s + (b.endMin - b.startMin), 0);
          return (
            <button key={d} type="button" onClick={() => onPick(d)} className={clsx('min-h-20 bg-white p-1.5 text-left align-top hover:bg-brand-50', !inMonth && 'bg-slate-50 text-slate-400', (closed || blocked) && 'bg-[repeating-linear-gradient(45deg,#fff,#fff_6px,#f1f5f9_6px,#f1f5f9_12px)]')}>
              <span className={clsx('inline-flex h-6 w-6 items-center justify-center rounded-full font-medium', d === today && 'bg-brand-700 text-white')}>{Number(d.slice(8))}</span>
              {list.length > 0 && <span className="mt-1 block rounded bg-court-100 px-1 py-0.5 text-[11px] text-court-700">{list.length} booking{list.length === 1 ? '' : 's'} · {Math.round(minutes / 60)}h</span>}
              {blocked && <span className="mt-1 block text-[11px] text-slate-500">Blocked</span>}
              {!blocked && closed && inMonth && <span className="mt-1 block text-[11px] text-slate-400">Closed</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

