import { DateTime } from 'luxon';
import clsx from 'clsx';

/** Horizontal day picker; `counts` marks days that still have free slots. */
export function DateStrip({ dates, value, onChange, freeCount }: { dates: string[]; value: string; onChange: (d: string) => void; freeCount?: (d: string) => number }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dates.map((d) => {
        const dt = DateTime.fromISO(d);
        const free = freeCount?.(d);
        const active = d === value;
        return (
          <button key={d} type="button" onClick={() => onChange(d)} aria-pressed={active}
            className={clsx('flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-sm', active ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white hover:border-brand-300', free === 0 && !active && 'text-slate-400')}>
            <span className="text-[11px] uppercase">{dt.toFormat('ccc')}</span>
            <span className="text-lg font-semibold leading-tight">{dt.toFormat('d')}</span>
            <span className="text-[10px]">{free === undefined ? dt.toFormat('LLL') : free === 0 ? 'Full' : `${free} free`}</span>
          </button>
        );
      })}
    </div>
  );
}
