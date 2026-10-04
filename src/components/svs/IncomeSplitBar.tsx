import { useState } from 'react';
import { formatEuro } from '@/lib/money';
import { buildIncomeSplit, type IncomeSplitKey } from '@/lib/incomeSplit';
import type { BreakdownColumn } from '@/lib/svsTracker';

// Feste Reihenfolge, geprüft auf Farbsehschwächen (Palette-Validator: alle Checks bestanden)
const COLORS: Record<IncomeSplitKey, string> = {
  expenses: '#2a78d6',
  svs: '#eb6834',
  incomeTax: '#9a6bd6',
  remaining: '#0d9488',
};

const percent = (share: number) => `${Math.round(share * 100)} %`;

/** Gestapelter Balken: wohin jeder Euro Umsatz geht – mit Legende als Tabelle und Hover-Details. */
export function IncomeSplitBar({ column, expensesLabel }: { column: BreakdownColumn; expensesLabel: string }) {
  const [active, setActive] = useState<IncomeSplitKey | null>(null);
  const split = buildIncomeSplit(column);

  if (!split) {
    return <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">Noch keine Einnahmen – sobald eine Rechnung bezahlt ist, siehst du hier, wohin dein Geld geht.</p>;
  }

  const labels: Record<IncomeSplitKey, string> = {
    expenses: expensesLabel,
    svs: 'SVS-Beiträge',
    incomeTax: 'Einkommensteuer',
    remaining: 'Dir bleibt netto',
  };
  const remaining = split.segments.find((s) => s.key === 'remaining')!;
  const visible = split.segments.filter((s) => s.value > 0);

  return (
    <figure className="space-y-3" aria-label={`Aufteilung deiner Einnahmen von ${formatEuro(split.revenue, true)}`}>
      <p className="text-sm text-slate-700">
        {split.deficit ? (
          <>Deine Kosten sind höher als deine Einnahmen – es bleibt dir nichts übrig.</>
        ) : (
          <>
            Von jedem Euro Umsatz bleiben dir{' '}
            <strong className="text-base text-slate-900" data-testid="remaining-share">
              {Math.round(remaining.share * 100)} Cent
            </strong>
            .
          </>
        )}
      </p>

      <div className="flex h-8 w-full gap-0.5" role="img" aria-label={visible.map((s) => `${labels[s.key]} ${percent(s.share)}`).join(', ')}>
        {visible.map((s, i) => (
          <div
            key={s.key}
            className={`h-full transition-opacity ${i === 0 ? 'rounded-l' : ''} ${i === visible.length - 1 ? 'rounded-r' : ''} ${
              active && active !== s.key ? 'opacity-40' : ''
            }`}
            style={{ width: `${s.share * 100}%`, backgroundColor: COLORS[s.key], minWidth: 2 }}
            onPointerEnter={() => setActive(s.key)}
            onPointerLeave={() => setActive(null)}
            title={`${labels[s.key]}: ${formatEuro(s.value, true)} (${percent(s.share)})`}
          />
        ))}
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Aufteilung der Einnahmen</caption>
        <tbody>
          {split.segments.map((s) => (
            <tr
              key={s.key}
              className={`${s.key === 'remaining' ? 'text-slate-900' : 'text-slate-700'} ${active === s.key ? 'bg-slate-100/70' : ''}`}
              onPointerEnter={() => setActive(s.key)}
              onPointerLeave={() => setActive(null)}
            >
              <th scope="row" className={`py-1 text-left ${s.key === 'remaining' ? 'font-semibold' : 'font-normal'}`}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[s.key] }} aria-hidden="true" />
                  {labels[s.key]}
                </span>
              </th>
              <td className={`py-1 text-right tabular-nums ${s.key === 'remaining' ? 'font-semibold' : ''}`}>{formatEuro(s.value, true)}</td>
              <td className="w-14 py-1 text-right tabular-nums text-slate-500">{percent(s.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
