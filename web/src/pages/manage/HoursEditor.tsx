import { Copy, Plus, Trash2 } from 'lucide-react';
import { WEEKDAYS, WEEKDAY_LABELS, type WeeklyHours, type Weekday } from '@courtsync/shared';
import { Button } from '@/components/ui';
import { TimeInput } from './shared';

/** Weekly opening hours with any number of sessions per day (e.g. a lunch break). */
export function HoursEditor({ value, onChange }: { value: WeeklyHours; onChange: (v: WeeklyHours) => void }) {
  const setDay = (d: Weekday, sessions: { start: number; end: number }[]) => onChange({ ...value, [d]: { sessions } });
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {WEEKDAYS.map((d) => {
        const sessions = value[d]?.sessions ?? [];
        return (
          <div key={d} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
            <div className="flex w-32 shrink-0 items-center justify-between sm:pt-2">
              <span className="text-sm font-medium">{WEEKDAY_LABELS[d]}</span>
              {sessions.length === 0 && <span className="text-xs text-slate-400 sm:hidden">Closed</span>}
            </div>
            <div className="flex-1 space-y-2">
              {sessions.length === 0 && <p className="hidden pt-2 text-sm text-slate-400 sm:block">Closed</p>}
              {sessions.map((s, i) => (
                <div key={i} className="flex items-end gap-2">
                  <TimeInput value={s.start} onChange={(m) => setDay(d, sessions.map((x, j) => (j === i ? { ...x, start: m ?? 0 } : x)))} />
                  <span className="pb-2 text-slate-400">to</span>
                  <TimeInput value={s.end} allowEndOfDay onChange={(m) => setDay(d, sessions.map((x, j) => (j === i ? { ...x, end: m ?? 0 } : x)))} />
                  <Button variant="ghost" size="sm" aria-label="Remove hours" onClick={() => setDay(d, sessions.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => {
                const last = sessions[sessions.length - 1];
                const start = last ? Math.min(last.end + 60, 23 * 60) : 6 * 60;
                setDay(d, [...sessions, { start, end: Math.min(start + 4 * 60, 24 * 60) }]);
              }}>Hours</Button>
              <Button variant="ghost" size="sm" aria-label={`Copy ${WEEKDAY_LABELS[d]} to every day`} title="Copy to every day" onClick={() => onChange(Object.fromEntries(WEEKDAYS.map((x) => [x, { sessions: sessions.map((s) => ({ ...s })) }])) as WeeklyHours)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Problems a server-side schema can't phrase well: overlapping or inverted ranges. */
export function hoursProblems(h: WeeklyHours): string[] {
  const out: string[] = [];
  for (const d of WEEKDAYS) {
    const s = [...(h[d]?.sessions ?? [])].sort((a, b) => a.start - b.start);
    s.forEach((x, i) => {
      if (x.end <= x.start) out.push(`${WEEKDAY_LABELS[d]}: closing time must be after opening time.`);
      if (i > 0 && x.start < s[i - 1].end) out.push(`${WEEKDAY_LABELS[d]}: opening hours overlap.`);
    });
  }
  return out;
}
