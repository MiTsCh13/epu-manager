import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEuro } from '@/lib/money';

const PRIMARY = '#0f766e';

/** Umsatz (netto, nach Zahlungseingang) je Tag bzw. Monat im gewählten Zeitraum – eine Serie, Primärfarbe, Hover-Tooltip. */
export function RevenueChart({
  data,
  granularity,
  periodText,
}: {
  data: { key: string; label: string; total: number }[];
  granularity: 'day' | 'month';
  periodText: string;
}) {
  const sum = data.reduce((s, d) => s + d.total, 0);
  return (
    <section aria-labelledby="revenue-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id="revenue-heading" className="text-lg font-semibold text-slate-900">
        Umsatz in {periodText}
      </h2>
      <p className="text-sm text-slate-600">
        Bezahlte Rechnungen, netto, je {granularity === 'day' ? 'Tag' : 'Monat'} · gesamt{' '}
        <span className="tabular-nums" data-testid="revenue-sum">{formatEuro(sum, true)}</span>
      </p>
      {sum === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
          Keine bezahlten Rechnungen in diesem Zeitraum.
        </p>
      ) : (
        <>
          <div className="mt-4 h-56" role="img" aria-label={`Umsatz je ${granularity === 'day' ? 'Tag' : 'Monat'}: ${data.map((d) => `${d.label} ${formatEuro(d.total, true)}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={granularity === 'day' ? '15%' : '28%'}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(v: number) => formatEuro(v, true)}
                />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  formatter={(v) => [formatEuro(Number(v)), 'Umsatz']}
                  labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                />
                <Bar dataKey="total" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Umsatz je {granularity === 'day' ? 'Tag' : 'Monat'}</caption>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <th>{d.label}</th>
                  <td>{formatEuro(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
