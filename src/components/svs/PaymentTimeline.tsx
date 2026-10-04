import type { SvsTrackerModel, TimelineEvent } from '@/lib/svsTracker';
import { Money, PayeeTag, StepCard } from './parts';

const CHIP: Partial<Record<TimelineEvent['status'], { label: string; className: string }>> = {
  paid: { label: 'bezahlt', className: 'bg-slate-100 text-slate-500' },
  next: { label: 'als Nächstes', className: 'bg-primary-50 text-primary-800 ring-1 ring-inset ring-primary-100' },
  estimate: { label: 'geschätzt', className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' },
};

const DOT: Record<TimelineEvent['status'], string> = {
  paid: 'border-slate-400 bg-slate-400',
  next: 'border-primary bg-primary ring-4 ring-primary-50',
  open: 'border-slate-400 bg-white',
  estimate: 'border-amber-500 bg-white',
  info: 'border-slate-300 bg-white',
};

/** 5 · Zeitplan: wann was an wen zu zahlen ist. */
export function PaymentTimeline({ model }: { model: SvsTrackerModel }) {
  const groups = [...new Set(model.timeline.map((e) => e.group))];

  return (
    <StepCard step={5} eyebrow="Zeitplan" title="Wann du was zahlen musst">
      <div className="space-y-6">
        {groups.map((group) => {
          const events = model.timeline.filter((e) => e.group === group);
          return (
            <div key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
              <ol>
                {events.map((e, i) => {
                  const chip = CHIP[e.status];
                  const done = e.status === 'paid';
                  return (
                    <li key={e.id} className="grid grid-cols-[5.5rem_1rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[7.5rem_1rem_minmax(0,1fr)]">
                      <span className="pt-px text-xs tabular-nums text-slate-500 sm:text-sm">{e.dateLabel}</span>
                      <span className="relative flex justify-center" aria-hidden="true">
                        <span className={`absolute top-0 w-0.5 bg-slate-200 ${i === events.length - 1 ? 'h-3' : 'bottom-0'}`} />
                        <span className={`relative mt-1 h-3 w-3 rounded-full border-2 ${DOT[e.status]}`} />
                      </span>
                      <div className="min-w-0 pb-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className={done ? 'text-slate-500' : 'font-medium text-slate-900'}>
                            {e.payee && <PayeeTag payee={e.payee} />}
                            {e.title}
                            {chip && <span className={`ml-2 rounded-full px-2 py-px align-[1px] text-[11px] font-medium ${chip.className}`}>{chip.label}</span>}
                          </span>
                          {e.amount !== null && (
                            <span className={`whitespace-nowrap tabular-nums ${done ? 'text-slate-500' : 'font-semibold text-slate-900'}`}>
                              {e.status === 'estimate' && 'ca. '}
                              <Money value={e.amount} />
                            </span>
                          )}
                        </div>
                        {e.note && <p className="mt-0.5 text-sm text-slate-500">{e.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </StepCard>
  );
}
