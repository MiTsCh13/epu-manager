import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight } from 'lucide-react';
import { formatEuro } from '@/lib/money';

// Kategoriale Palette (validiert: CVD/Normalsicht bestanden; Kontrast-Relief über beschriftete Legende) + neutral für „Weitere“
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTHER = '#a8a29e';

/** Top-5-Ausgabenkategorien des Monats als Donut mit beschrifteter Legende (Betrag + Anteil). */
export function ExpenseDonut({
  data,
  monthLabel,
  pauschal,
}: {
  data: { label: string; total: number }[];
  monthLabel: string;
  pauschal: boolean;
}) {
  const sum = data.reduce((s, d) => s + d.total, 0);
  const color = (label: string, i: number) => (label === 'Weitere' ? OTHER : COLORS[i] ?? OTHER);

  return (
    <section aria-labelledby="donut-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="donut-heading" className="text-lg font-semibold text-slate-900">
            Ausgaben im {monthLabel}
          </h2>
          <p className="text-sm text-slate-600">{pauschal ? 'Pauschalierung' : `Absetzbar · gesamt ${formatEuro(sum, true)}`}</p>
        </div>
        <Link to="/ausgaben" className="inline-flex min-h-[40px] shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Alle Ausgaben
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {pauschal ? (
        <p className="mt-6 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Bei Pauschalierung erfasst du keine Einzelausgaben – Klaro rechnet automatisch mit dem Pauschalsatz.
        </p>
      ) : sum === 0 ? (
        <Link
          to="/ausgaben"
          className="mt-6 block rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 hover:border-primary hover:text-primary"
        >
          Noch keine Ausgaben diesen Monat – erfasse deine erste Ausgabe →
        </Link>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-44 w-44 shrink-0" role="img" aria-label={`Ausgaben nach Kategorie: ${data.map((d) => `${d.label} ${formatEuro(d.total, true)}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="total" nameKey="label" innerRadius="62%" outerRadius="100%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell key={d.label} fill={color(d.label, i)} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [formatEuro(Number(v)), String(name)]}
                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-1.5 text-sm" aria-label="Legende">
            {data.map((d, i) => (
              <li key={d.label} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color(d.label, i) }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-slate-700">{d.label}</span>
                <span className="tabular-nums text-slate-900">{formatEuro(d.total, true)}</span>
                <span className="w-10 text-right tabular-nums text-slate-500">{Math.round((d.total / sum) * 100)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
