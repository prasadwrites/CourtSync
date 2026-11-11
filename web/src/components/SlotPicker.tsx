import { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import type { BookingModel, Slot } from '@courtsync/shared';
import { formatMinutes, formatMoney } from '@/lib/format';

export interface AvailSlot extends Slot {
  price?: number;
}

export interface SlotCourt {
  bookingModel: BookingModel;
  slotIntervalMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
}

export interface SlotSelection {
  startMin: number;
  endMin: number;
  estimate?: number;
}

const OPEN = new Set(['available', 'limited']);

/** Durations that fit from a start cell, given the court's limits and free capacity. */
export function durationsFrom(court: SlotCourt, slots: AvailSlot[], start: number, units: number): { minutes: number; estimate?: number }[] {
  if (court.bookingModel === 'session') {
    const s = slots.find((x) => x.startMin === start);
    return s && OPEN.has(s.state) && s.remaining >= units ? [{ minutes: s.endMin - s.startMin, estimate: s.price }] : [];
  }
  const byStart = new Map(slots.map((s) => [s.startMin, s]));
  const out: { minutes: number; estimate?: number }[] = [];
  let t = start;
  let sum = 0;
  let priced = true;
  while (t - start < court.maxDurationMinutes) {
    const cell = byStart.get(t);
    if (!cell || !OPEN.has(cell.state) || cell.remaining < units) break;
    if (cell.price === undefined) priced = false;
    sum += cell.price ?? 0;
    t = cell.endMin;
    const minutes = t - start;
    if (minutes >= court.minDurationMinutes && minutes % court.slotIntervalMinutes === 0) out.push({ minutes, estimate: priced ? Math.round(sum * 100) / 100 : undefined });
  }
  return out;
}

const stateClass: Record<string, string> = {
  available: 'border-court-500/40 bg-white text-slate-900 hover:border-court-600 hover:bg-court-50',
  limited: 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500',
  full: 'border-slate-200 bg-slate-100 text-slate-400 line-through',
  blocked: 'border-slate-200 bg-slate-100 text-slate-400',
  closed: 'border-slate-200 bg-slate-50 text-slate-300',
  past: 'border-slate-200 bg-slate-50 text-slate-300',
};

/**
 * Pick a start slot and a duration. Units are 1 for whole-court bookings and the number
 * of participants for shared courts, so the picker only offers times with enough room.
 */
export function SlotPicker({
  court, slots, units, value, onChange, currency,
}: { court: SlotCourt; slots: AvailSlot[]; units: number; value: SlotSelection | null; onChange: (v: SlotSelection | null) => void; currency?: string }) {
  const visible = slots.filter((s) => s.state !== 'closed');
  const durations = useMemo(() => (value ? durationsFrom(court, slots, value.startMin, units) : []), [court, slots, value, units]);

  // Drop the selection if it no longer fits (participants changed, or availability refreshed).
  useEffect(() => {
    if (!value) return;
    const fits = durationsFrom(court, slots, value.startMin, units).some((d) => d.minutes === value.endMin - value.startMin);
    if (!fits) onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, units]);

  if (visible.length === 0) return <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">Closed on this day.</p>;

  return (
    <div className="space-y-4">
      <div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {visible.map((s) => {
            const open = OPEN.has(s.state) && s.remaining >= units;
            const selected = value && s.startMin >= value.startMin && s.startMin < value.endMin;
            return (
              <button
                key={s.startMin}
                type="button"
                disabled={!open}
                onClick={() => {
                  const d = durationsFrom(court, slots, s.startMin, units);
                  if (d.length) onChange({ startMin: s.startMin, endMin: s.startMin + d[0].minutes, estimate: d[0].estimate });
                }}
                className={clsx(
                  'rounded-lg border px-2 py-2 text-center text-sm transition disabled:cursor-not-allowed',
                  selected ? 'border-brand-700 bg-brand-700 text-white' : stateClass[open ? s.state : s.state === 'available' || s.state === 'limited' ? 'full' : s.state],
                )}
                aria-pressed={!!selected}
              >
                <span className="block font-medium tabular-nums">{formatMinutes(s.startMin)}</span>
                {s.label && <span className="block truncate text-[11px] opacity-80">{s.label}</span>}
                {court.bookingModel === 'shared' && open && !selected && <span className="block text-[11px] opacity-70">{s.remaining} left</span>}
                {s.state === 'blocked' && <span className="block text-[11px]">Unavailable</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          <Legend className="border-court-500/40 bg-white" label="Available" />
          {court.bookingModel === 'shared' && <Legend className="border-amber-300 bg-amber-50" label="Filling up" />}
          <Legend className="border-slate-200 bg-slate-100" label="Booked or unavailable" />
        </div>
      </div>
      {value && court.bookingModel !== 'session' && durations.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Duration</p>
          <div className="flex flex-wrap gap-2">
            {durations.map((d) => {
              const active = value.endMin - value.startMin === d.minutes;
              return (
                <button
                  key={d.minutes}
                  type="button"
                  onClick={() => onChange({ startMin: value.startMin, endMin: value.startMin + d.minutes, estimate: d.estimate })}
                  className={clsx('rounded-full border px-3 py-1.5 text-sm', active ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50')}
                >
                  {fmtDuration(d.minutes)}
                  {d.estimate !== undefined && currency && <span className="ml-1 opacity-80">· {formatMoney(d.estimate, currency)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('h-3 w-3 rounded border', className)} />
      {label}
    </span>
  );
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
