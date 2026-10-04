import type { ReactNode } from 'react';
import { Calculator } from 'lucide-react';
import { formatEuro } from '@/lib/money';
import { Term } from '@/components/ui/Tooltip';
import type { BreakdownColumn } from '@/lib/svsTracker';

type Row = {
  op: '' | '−' | '=';
  label: ReactNode;
  key: keyof BreakdownColumn;
  strong?: boolean;
  hint?: string;
};

/** Jahresrechnung von den Einnahmen bis „was dir bleibt“ – bisher und hochgerechnet. */
export function YearBreakdown({
  ytd,
  projected,
  year,
  pauschal,
}: {
  ytd: BreakdownColumn;
  projected: BreakdownColumn;
  year: number;
  pauschal: boolean;
}) {
  const rows: Row[] = [
    { op: '', label: 'Einnahmen (bezahlte Rechnungen, netto)', key: 'revenue' },
    { op: '−', label: pauschal ? <Term k="pauschalierung">Pauschale Ausgaben</Term> : <Term k="absetzbar">Absetzbare Ausgaben</Term>, key: 'expenses' },
    { op: '=', label: <Term k="berechnungsbasis">Berechnungsbasis für die SVS</Term>, key: 'basis', strong: true, hint: 'Gewinn vor SVS' },
    { op: '−', label: <Term k="svs">SVS-Beiträge</Term>, key: 'svs', hint: 'bisher bezahlt bzw. ganzes Jahr' },
    { op: '=', label: 'Jahresgewinn', key: 'profit', strong: true },
    { op: '−', label: <Term k="grundfreibetrag" />, key: 'grundfreibetrag', hint: '15 %, max. 4.950 €' },
    { op: '=', label: 'Zu versteuerndes Einkommen', key: 'taxable', strong: true },
    { op: '−', label: 'Einkommensteuer (ca.)', key: 'incomeTax', hint: 'Tarif 2026, ohne andere Einkünfte; bisher anteilig nach deinem Jahres-Steuersatz' },
  ];

  const cell = (v: number | null) => (v === null ? <span className="text-slate-400">–</span> : formatEuro(v, true));

  return (
    <section aria-labelledby="breakdown-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id="breakdown-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
        Deine Jahresrechnung {year}
      </h2>
      <p className="mt-1 text-sm text-slate-600">Von den Einnahmen bis zu dem, was dir wirklich bleibt.</p>

      <div className="-mx-5 mt-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[22rem] text-sm" data-testid="breakdown">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th scope="col" className="py-2 pl-5 text-left font-medium sm:pl-0">
                <span className="sr-only">Position</span>
              </th>
              <th scope="col" className="py-2 text-right font-medium">Bisher</th>
              <th scope="col" className="py-2 pl-3 pr-5 text-right font-medium sm:pr-0">Hochgerechnet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.op === '=' ? 'border-t border-slate-200' : ''}>
                <th scope="row" className={`py-2 pl-5 text-left font-normal sm:pl-0 ${r.strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                  <div className="flex gap-1.5">
                    <span className="w-3 shrink-0 text-slate-400" aria-hidden="true">
                      {r.op}
                    </span>
                    <div>
                      {r.label}
                      {r.hint && <span className="block text-xs font-normal text-slate-500">{r.hint}</span>}
                    </div>
                  </div>
                </th>
                <td className={`py-2 text-right align-top tabular-nums ${r.strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`} data-testid={`ytd-${r.key}`}>{cell(ytd[r.key])}</td>
                <td className={`py-2 pl-3 pr-5 text-right align-top tabular-nums sm:pr-0 ${r.strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`} data-testid={`projected-${r.key}`}>
                  {cell(projected[r.key])}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-900">
              <th scope="row" className="py-3 pl-5 text-left text-base font-bold text-slate-900 sm:pl-0">
                <div className="flex gap-1.5">
                  <span className="w-3 shrink-0 text-slate-400" aria-hidden="true">
                    =
                  </span>
                  Was dir wirklich bleibt
                </div>
              </th>
              <td className="py-3 text-right align-top tabular-nums">{cell(ytd.remaining)}</td>
              <td className="py-3 pl-3 pr-5 text-right align-top text-base font-bold tabular-nums text-primary-800 sm:pr-0" data-testid="projected-remaining">
                {cell(projected.remaining)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        „Bisher“ = Stand heute. „Hochgerechnet“ = aufs ganze Jahr {year} hochgerechnet. Die Einkommensteuer wird immer fürs
        ganze Jahr berechnet und ist deshalb nur hochgerechnet sinnvoll.
      </p>
    </section>
  );
}
