import { CalendarRange } from 'lucide-react';
import { PERIOD_OPTIONS, type DateRange, type PeriodPreset } from '@/lib/period';
import { formatDate, toISODate } from '@/lib/invoices';

/** Zeitraum-Filter für die Diagramme: eine Zeile Chips (horizontal scrollbar am Handy) + eigene Zeitspanne. */
export function PeriodFilter({
  preset,
  range,
  custom,
  onPreset,
  onCustom,
}: {
  preset: PeriodPreset;
  range: DateRange;
  custom: DateRange;
  onPreset: (p: PeriodPreset) => void;
  onCustom: (r: DateRange) => void;
}) {
  const today = toISODate(new Date());
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CalendarRange className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" aria-hidden="true" />
        <div role="radiogroup" aria-label="Zeitraum für die Diagramme" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={preset === o.value}
              onClick={() => onPreset(o.value)}
              className={`min-h-[36px] shrink-0 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors ${
                preset === o.value ? 'bg-primary text-white ring-primary' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {preset === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate-600">Von</span>
            <input
              type="date"
              value={custom.from}
              max={today}
              onChange={(e) => onCustom({ ...custom, from: e.target.value })}
              className="min-h-[40px] rounded-lg border border-slate-300 px-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-600">bis</span>
            <input
              type="date"
              value={custom.to}
              max={today}
              onChange={(e) => onCustom({ ...custom, to: e.target.value })}
              className="min-h-[40px] rounded-lg border border-slate-300 px-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
      ) : (
        <p className="text-xs text-slate-500" data-testid="period-range">
          {formatDate(range.from)} – {formatDate(range.to)}
        </p>
      )}
    </div>
  );
}
