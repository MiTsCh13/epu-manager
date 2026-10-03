import { calculateProfit, getPauschRate } from '@/lib/profit';
import { formatEuro } from '@/lib/money';
import { Term } from '@/components/ui/Tooltip';
import type { IndustryType, PauschType, ProfitMethod } from '@/types';

/** Gewinn des Jahres bisher: Einnahmen − Ausgaben (absetzbar bzw. pauschal) − SVS. */
export function ProfitSummary({
  year,
  profitMethod,
  pauschType,
  industryType,
  revenue,
  deductibleExpenses,
  svsPaid,
}: {
  year: number;
  profitMethod: ProfitMethod;
  pauschType: PauschType | null;
  industryType: IndustryType | null;
  revenue: number;
  deductibleExpenses: number;
  svsPaid: number;
}) {
  const result = calculateProfit({
    profitMethod,
    pauschType: pauschType ?? undefined,
    industryType: industryType ?? undefined,
    totalRevenue: revenue,
    totalExpenses: deductibleExpenses,
    svsPayments: svsPaid,
  });
  const pauschal = profitMethod === 'pauschal';
  const rate = pauschal ? getPauschRate(pauschType ?? 'ku', industryType ?? undefined) : 0;
  const expenses = pauschal ? (result.pauschaleExpenses ?? 0) : deductibleExpenses;

  const rows: [string, number, string?][] = [
    ['Einnahmen (bezahlt, netto)', revenue],
    [pauschal ? `Pauschale Ausgaben (${Math.round(rate * 100)} %)` : 'Ausgaben (absetzbar)', -expenses],
    ['SVS-Beiträge', -svsPaid],
  ];

  return (
    <section aria-label={`Gewinn ${year}`} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">Gewinn {year} bisher</p>
          <p className={`text-3xl font-bold tabular-nums ${result.netProfit < 0 ? 'text-red-700' : 'text-slate-900'}`} data-testid="profit-value">
            {formatEuro(result.netProfit)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Nach <Term k="grundfreibetrag" />: {formatEuro(Math.max(result.taxableIncome, 0))} zu versteuern
          </p>
        </div>
        <dl className="grid gap-1 text-sm sm:min-w-[18rem]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 text-slate-600">
              <dt>{label}</dt>
              <dd className="tabular-nums">{value < 0 ? `− ${formatEuro(-value)}` : formatEuro(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
