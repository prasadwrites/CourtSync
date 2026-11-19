import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BookingModel } from '@courtsync/shared';
import { formatMinutes, formatMoney } from '@/lib/format';
import { Button } from '@/components/ui';
import { Legend, slotStateClass, type AvailSlot } from './SlotPicker';

const OPEN = new Set(['available', 'limited']);
const WEEK = 7;

export interface WeekPick {
  date: string;
  startMin: number;
  endMin?: number;
}

/**
 * Seven days of slots side by side: one column per day, one row per start time.
 * Read-only unless `onPick` is given. `days` may span several weeks; arrows page through them.
 */
export function WeekSlotGrid({
  days, focusDate, bookingModel, units = 1, value, onPick, currency,
}: {
  days: { date: string; slots: AvailSlot[] }[];
  focusDate?: string;
  bookingModel: BookingModel;
  units?: number;
  value?: WeekPick | null;
  onPick?: (date: string, slot: AvailSlot) => void;
  currency?: string;
}) {
  const weeks = Math.max(1, Math.ceil(days.length / WEEK));
  const [week, setWeek] = useState(() => {
    const i = focusDate ? days.findIndex((d) => d.date === focusDate) : 0;
    return i > 0 ? Math.floor(i / WEEK) : 0;
  });
  const shown = days.slice(week * WEEK, week * WEEK + WEEK);
  const rows = useMemo(() => {
    const set = new Set<number>();
    for (const d of shown) for (const s of d.slots) if (s.state !== 'closed') set.add(s.startMin);
    return [...set].sort((a, b) => a - b);
  }, [shown]);

  const title = shown.length
    ? `${DateTime.fromISO(shown[0].date).toFormat('d LLL')} – ${DateTime.fromISO(shown[shown.length - 1].date).toFormat('d LLL yyyy')}`
    : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-label="Previous week" disabled={week === 0} onClick={() => setWeek((w) => w - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" aria-label="Next week" disabled={week >= weeks - 1} onClick={() => setWeek((w) => w + 1)}><ChevronRight className="h-4 w-4" /></Button>
        <p className="px-1 text-sm font-semibold">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">Closed all week.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="w-12" />
                {shown.map((d) => {
                  const dt = DateTime.fromISO(d.date);
                  return (
                    <th key={d.date} scope="col" className="font-medium text-slate-600">
                      <span className="block text-[11px] uppercase">{dt.toFormat('ccc')}</span>
                      <span className="block text-sm text-slate-900">{dt.toFormat('d')}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((min) => (
                <tr key={min}>
                  <th scope="row" className="pr-1 text-right text-[11px] font-normal tabular-nums text-slate-400">{formatMinutes(min)}</th>
                  {shown.map((d) => {
                    const s = d.slots.find((x) => x.startMin === min);
                    if (!s || s.state === 'closed') return <td key={d.date} className="rounded-md bg-slate-50" />;
                    const open = OPEN.has(s.state) && s.remaining >= units;
                    const selected = !!value && value.date === d.date && min >= value.startMin && min < (value.endMin ?? value.startMin + 1);
                    const label = open
                      ? s.price !== undefined && currency ? formatMoney(s.price, currency) : bookingModel === 'shared' ? `${s.remaining} left` : 'Free'
                      : s.state === 'past' ? '—' : s.state === 'blocked' ? 'Unavailable' : 'Booked';
                    const cls = clsx(
                      'block w-full rounded-md border px-1 py-1.5',
                      selected ? 'border-brand-700 bg-brand-700 text-white' : slotStateClass[open ? s.state : OPEN.has(s.state) ? 'full' : s.state],
                    );
                    return (
                      <td key={d.date} className="p-0">
                        {onPick ? (
                          <button type="button" disabled={!open} aria-pressed={selected} aria-label={`${DateTime.fromISO(d.date).toFormat('ccc d LLL')} ${formatMinutes(min)}`} onClick={() => onPick(d.date, s)} className={clsx(cls, 'transition disabled:cursor-not-allowed')}>
                            {s.label && <span className="block truncate opacity-80">{s.label}</span>}
                            {label}
                          </button>
                        ) : (
                          <span className={cls}>
                            {s.label && <span className="block truncate opacity-80">{s.label}</span>}
                            {label}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <Legend className="border-court-500/40 bg-white" label="Available" />
        {bookingModel === 'shared' && <Legend className="border-amber-300 bg-amber-50" label="Filling up" />}
        <Legend className="border-slate-200 bg-slate-100" label="Booked or unavailable" />
      </div>
    </div>
  );
}
