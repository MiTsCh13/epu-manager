import { formatEuro } from '@/lib/money';

export interface Threshold {
  value: number;
  label: string;
}

/**
 * Horizontaler Balken mit Schwellenwerten: dunkel = Stand heute, hell = Hochrechnung bis Jahresende.
 * Ein Farbton (Primärfarbe), Werte und Schwellen direkt beschriftet.
 */
export function ThresholdMeter({
  label,
  current,
  projected,
  thresholds,
  max,
}: {
  label: string;
  current: number;
  projected?: number;
  thresholds: Threshold[];
  max?: number;
}) {
  const scaleMax = max ?? Math.max(...thresholds.map((t) => t.value), projected ?? 0, current) * 1.1;
  const pct = (v: number) => `${Math.min(Math.max(v / scaleMax, 0), 1) * 100}%`;
  const summary = `${label}: ${formatEuro(current, true)} bisher${projected ? `, hochgerechnet ${formatEuro(projected, true)}` : ''}. Schwellen: ${thresholds
    .map((t) => `${t.label} bei ${formatEuro(t.value, true)}`)
    .join(', ')}.`;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-600">
          <strong className="tabular-nums text-slate-900">{formatEuro(current, true)}</strong> bisher
          {projected !== undefined && (
            <>
              {' · '}
              <span className="tabular-nums">{formatEuro(projected, true)}</span> hochgerechnet
            </>
          )}
        </span>
      </figcaption>
      {/* Bei mehreren Schwellen Beschriftungen abwechselnd versetzt – sonst überlappen sie auf schmalen Bildschirmen */}
      <div className={`relative ${thresholds.length > 1 ? 'pb-[4.5rem]' : 'pb-10'}`} role="img" aria-label={summary}>
        <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
          {projected !== undefined && projected > current && (
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: pct(projected) }} />
          )}
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(current) }} />
        </div>
        {thresholds.map((t, i) => (
          <div key={t.label} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(t.value) }}>
            <span className={`w-0.5 -translate-y-1 bg-slate-500 ${i % 2 === 1 ? 'h-12' : 'h-5'}`} aria-hidden="true" />
            <span
              className={`mt-0.5 whitespace-nowrap text-[11px] leading-tight text-slate-500 ${
                i === thresholds.length - 1 ? '-translate-x-1/3 text-right' : 'text-center'
              }`}
            >
              {formatEuro(t.value, true)}
              <br />
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
