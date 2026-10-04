import { useState, type ReactNode } from 'react';
import { Calculator } from 'lucide-react';
import { formatEuro } from '@/lib/money';
import { Term } from '@/components/ui/Tooltip';
import type { BreakdownColumn } from '@/lib/svsTracker';
import { IncomeSplitBar } from './IncomeSplitBar';

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
  const [view, setView] = useState<'ytd' | 'projected'>('projected');

  // Hauptrechnung: Was abgeht, bis zu dem, was bleibt
  const rows: Row[] = [
    { op: '', label: 'Einnahmen (bezahlte Rechnungen, netto)', key: 'revenue' },
    { op: '−', label: pauschal ? <Term k="pauschalierung">Pauschale Ausgaben</Term> : <Term k="absetzbar">Absetzbare Ausgaben</Term>, key: 'expenses' },
    { op: '=', label: <Term k="berechnungsbasis">Berechnungsbasis für die SVS</Term>, key: 'basis', strong: true, hint: 'Gewinn vor SVS' },
    { op: '−', label: <Term k="svs">SVS-Beiträge</Term>, key: 'svs', hint: 'bisher bezahlt bzw. ganzes Jahr' },
    { op: '=', label: 'Jahresgewinn', key: 'profit', strong: true },
  ];
  // Nebenrechnung: nur zur Ermittlung der Steuer – wird nicht vom Geld abgezogen
  const taxRows: Row[] = [
    { op: '', label: <Term k="grundfreibetrag">davon steuerfrei: Grundfreibetrag</Term>, key: 'grundfreibetrag', hint: '15 %, max. 4.950 €' },
    { op: '', label: 'zu versteuerndes Einkommen', key: 'taxable' },
  ];

  const cell = (v: number) => formatEuro(v, true);
  const valueCells = (key: keyof BreakdownColumn, className: string) => (
    <>
      <td className={`py-2 text-right align-top tabular-nums ${className}`} data-testid={`ytd-${key}`}>
        {cell(ytd[key])}
      </td>
      <td className={`py-2 pl-3 pr-5 text-right align-top tabular-nums sm:pr-0 ${className}`} data-testid={`projected-${key}`}>
        {cell(projected[key])}
      </td>
    </>
  );
  const mainRow = (r: Row) => (
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
      {valueCells(r.key, r.strong ? 'font-semibold text-slate-900' : 'text-slate-700')}
    </tr>
  );

  return (
    <section aria-labelledby="breakdown-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id="breakdown-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
        Deine Jahresrechnung {year}
      </h2>
      <p className="mt-1 text-sm text-slate-600">Von den Einnahmen bis zu dem, was dir nach allen Abzügen bleibt.</p>

      {/* Balken: wohin dein Umsatz geht */}
      <div className="mt-5 rounded-xl bg-slate-50/60 p-4 ring-1 ring-slate-100">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Wohin deine Einnahmen gehen</h3>
          <div role="radiogroup" aria-label="Zeitraum" className="inline-flex rounded-lg bg-slate-100 p-1">
            {(
              [
                ['ytd', 'Bisher'],
                ['projected', 'Hochgerechnet'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                onClick={() => setView(value)}
                className={`min-h-[32px] rounded-md px-3 text-xs font-medium transition-colors ${
                  view === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <IncomeSplitBar column={view === 'ytd' ? ytd : projected} expensesLabel={pauschal ? 'Pauschale Ausgaben' : 'Absetzbare Ausgaben'} />
      </div>

      <div className="-mx-5 mt-6 overflow-x-auto sm:mx-0">
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
            {rows.map(mainRow)}

            {/* Nebenrechnung Steuer: eingerückt, ohne Rechenzeichen */}
            <tr>
              <td colSpan={3} className="pb-0.5 pl-10 pt-2 text-xs font-medium text-slate-500 sm:pl-[1.125rem]">
                So entsteht die Einkommensteuer:
              </td>
            </tr>
            {taxRows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="py-1 pl-10 text-left text-xs font-normal text-slate-500 sm:pl-[1.125rem]">
                  <div className="flex gap-1">
                    <span aria-hidden="true">↳</span>
                    <div>
                      {r.label}
                      {r.hint && <span className="block text-[11px] text-slate-400">{r.hint}</span>}
                    </div>
                  </div>
                </th>
                {valueCells(r.key, 'py-1 text-xs text-slate-500')}
              </tr>
            ))}

            {mainRow({ op: '−', label: 'Einkommensteuer (ca.)', key: 'incomeTax', hint: 'Tarif 2026 · bisher anteilig' })}

            <tr className="border-t-2 border-slate-900 bg-primary-50/60">
              <th scope="row" className="py-3 pl-5 text-left sm:pl-0">
                <div className="flex gap-1.5">
                  <span className="w-3 shrink-0 text-slate-400" aria-hidden="true">
                    =
                  </span>
                  <div>
                    <span className="text-base font-bold text-slate-900">Dir bleibt netto</span>
                    <span className="block text-xs font-normal text-slate-600">Endergebnis: Jahresgewinn minus Einkommensteuer</span>
                  </div>
                </div>
              </th>
              <td className="py-3 text-right align-top text-base font-bold tabular-nums text-slate-900" data-testid="ytd-remaining">
                {cell(ytd.remaining)}
              </td>
              <td className="py-3 pl-3 pr-5 text-right align-top text-base font-bold tabular-nums text-primary-800 sm:pr-0" data-testid="projected-remaining">
                {cell(projected.remaining)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        „Bisher“ = Stand heute. „Hochgerechnet“ = aufs ganze Jahr {year} hochgerechnet. Die Einkommensteuer gilt fürs
        ganze Jahr (ohne andere Einkünfte); „bisher“ ist sie anteilig mit deinem Jahres-Steuersatz gerechnet. Der Grundfreibetrag ist kein Geld,
        das du zahlst – er senkt nur den Betrag, auf den die Einkommensteuer berechnet wird. Deshalb wird er beim Ergebnis
        nicht abgezogen.
      </p>
    </section>
  );
}
