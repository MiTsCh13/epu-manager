import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfilePatch } from '@/hooks/useProfilePatch';
import { formatEuro } from '@/lib/money';
import type { SvsTrackerModel, YearColumn } from '@/lib/svsTracker';
import { InfoTip, Term } from '@/components/ui/Tooltip';
import { AmountForm, StepCard } from './parts';

// Farben je Posten (auf Farbsehschwächen geprüft); Grundfreibetrag schraffiert, weil kein Geld abfließt
const COLORS = { revenue: '#94a3b8', expenses: '#2a78d6', depreciation: '#1e5aa8', app: '#6aa3e8', svs: '#eb6834', einkuenfte: '#0d9488' } as const;
const HATCH = 'repeating-linear-gradient(-45deg, transparent 0 4px, rgba(13,148,136,.45) 4px 6px)';

interface Row {
  key: keyof YearColumn;
  op: '' | '−' | '=';
  label: ReactNode;
  sub: string;
  info: ReactNode;
  from: number;
  width: number;
  color?: string;
  hatch?: boolean;
  total?: boolean;
}

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)} %`;

/** 1 · Jahresrechnung: Umsatz − Ausgaben − Abschreibung − SVS − Grundfreibetrag = Einkünfte, darauf die Einkommensteuer. */
export function YearBreakdown({ model }: { model: SvsTrackerModel }) {
  const { profile } = useAuth();
  const patch = useProfilePatch();
  const [view, setView] = useState<'ytd' | 'full'>('ytd');
  const [editRevenue, setEditRevenue] = useState(false);
  const isYtd = view === 'ytd';
  const c = isYtd ? model.ytd : model.full;
  const base = c.revenue > 0 ? c.revenue : 1;
  const ns = profile?.business_type === 'neue_selbstaendige';
  const einkLabel = ns ? 'Einkünfte aus selbständiger Arbeit' : 'Einkünfte aus Gewerbebetrieb';
  const otherIncome = profile?.other_income_kind && profile.other_income_kind !== 'none' ? Number(profile.other_income_amount ?? 0) : 0;
  const year = model.year;

  // Wasserfall: jeder Abzug beginnt dort, wo der vorige aufgehört hat
  const afterExpenses = c.revenue - c.expenses;
  const afterDepreciation = afterExpenses - c.depreciation;
  const afterApp = afterDepreciation - c.arbeitsplatzpauschale;
  const afterSvs = afterApp - c.svs;
  const rows: Row[] = [
    {
      key: 'revenue',
      op: '',
      label: 'Umsatz',
      sub: profile?.is_kleinunternehmer ? 'bezahlte Rechnungen' : 'bezahlte Rechnungen, ohne USt',
      info: isYtd ? `Summe deiner bezahlten Rechnungen seit 1.1.${year}.` : 'Dein erwarteter Umsatz für das ganze Jahr (siehe oben).',
      from: 0,
      width: c.revenue,
      color: COLORS.revenue,
    },
    {
      key: 'expenses',
      op: '−',
      label: model.pauschRate !== null ? `Ausgaben, pauschal ${Math.round(model.pauschRate * 100)} %` : 'Betriebsausgaben',
      sub: model.pauschRate !== null ? 'statt einzelner Belege' : 'was du absetzen kannst',
      info:
        model.pauschRate !== null
          ? `Bei der Pauschalierung gelten ${Math.round(model.pauschRate * 100)} % deines Umsatzes als Ausgaben. Einzelne Belege brauchst du dafür nicht. Enthalten ist auch, was neben der Pauschale zusätzlich zählt, z. B. die halbe Öffi-Karte.`
          : isYtd
            ? 'Deine erfassten absetzbaren Ausgaben bis heute (Geschäftsessen nur zur Hälfte).'
            : 'Deine Ausgaben bis heute, aufs ganze Jahr hochgerechnet.',
      from: afterExpenses,
      width: c.expenses,
      color: COLORS.expenses,
    },
    ...(c.depreciation > 0
      ? [
          {
            key: 'depreciation' as const,
            op: '−' as const,
            label: <Term k="abschreibung" />,
            sub: isYtd ? 'deiner Anlagen, anteilig bis heute' : `deiner Anlagen, Anteil ${year}`,
            info: 'Geräte über 1.000 € verteilt Klaro auf mehrere Jahre. Hier steht der Teil für dieses Jahr.',
            from: afterDepreciation,
            width: c.depreciation,
            color: COLORS.depreciation,
          },
        ]
      : []),
    ...(c.arbeitsplatzpauschale > 0
      ? [
          {
            key: 'arbeitsplatzpauschale' as const,
            op: '−' as const,
            label: <Term k="arbeitsplatzpauschale" />,
            sub: isYtd ? 'anteilig bis heute' : 'fixer Betrag fürs Arbeiten zu Hause',
            info: 'Ein fixer Betrag, den Klaro automatisch abzieht. Du brauchst dafür keine Belege.',
            from: afterApp,
            width: c.arbeitsplatzpauschale,
            color: COLORS.app,
          },
        ]
      : []),
    {
      key: 'svs',
      op: '−',
      label: 'SVS-Beiträge',
      sub: isYtd ? 'bisher bezahlt' : `${year} bezahlt`,
      info: (
        <>
          Steuerlich zählt, was du im Jahr tatsächlich an die SVS zahlst – auch Nachzahlungen für frühere Jahre. Eine
          Nachzahlung für {year} setzt du in dem Jahr ab, in dem du sie zahlst.
          {model.svs.extraPaid > 0 && <> Enthält {formatEuro(model.svs.extraPaid, true)} Nachzahlung für Vorjahre.</>}
        </>
      ),
      from: afterSvs,
      width: c.svs,
      color: COLORS.svs,
    },
    {
      key: 'grundfreibetrag',
      op: '−',
      label: <Term k="grundfreibetrag" />,
      sub: `15 % vom Gewinn (${formatEuro(c.gewinn, true)}), steuerfrei`,
      info: 'Kein Geld, das du zahlst: Dieser Teil deines Gewinns bleibt einfach steuerfrei. Er senkt auch die Berechnungsbasis der SVS.',
      from: c.einkuenfte,
      width: c.grundfreibetrag,
      hatch: true,
    },
    {
      key: 'einkuenfte',
      op: '=',
      label: <Term k="einkuenfte">{einkLabel}</Term>,
      sub: isYtd ? 'bis heute' : `erwartet für ${year}`,
      info: 'Diese Zahl steht später in deinem Steuerbescheid. Darauf berechnen Finanzamt und SVS ihre Beträge.',
      from: 0,
      width: Math.max(0, c.einkuenfte),
      color: COLORS.einkuenfte,
      total: true,
    },
  ];

  const pct = (v: number) => `${Math.min(Math.max(v / base, 0), 1) * 100}%`;

  return (
    <StepCard step={1} eyebrow="Deine Jahresrechnung" title="Von deinem Umsatz zu deinen Einkünften">
      <p className="-mt-2 text-sm text-slate-600">Auf deine Einkünfte rechnen Finanzamt und SVS. So kommen sie zustande:</p>

      <div role="radiogroup" aria-label="Zeitraum" className="inline-flex rounded-lg bg-slate-100 p-1">
        {(
          [
            ['ytd', 'Bis heute'],
            ['full', 'Ganzes Jahr (erwartet)'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={view === value}
            onClick={() => setView(value)}
            className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors ${
              view === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isYtd ? (
        <p className="text-sm text-slate-500">
          Stand heute. SVS und Einkommensteuer gelten fürs ganze Jahr – wie es bis Jahresende aussieht, siehst du unter
          „Ganzes Jahr“.
        </p>
      ) : editRevenue ? (
        <AmountForm
          label={`Erwarteter Umsatz ${year} (€)`}
          hint="Leer lassen, um wieder die Hochrechnung zu verwenden."
          initial={model.revenue.expected}
          allowEmpty
          onCancel={() => setEditRevenue(false)}
          onSave={(value) =>
            patch(
              value === null ? { revenue_estimate: null, revenue_estimate_year: null } : { revenue_estimate: value, revenue_estimate_year: year },
              value === null ? 'Klaro rechnet wieder hoch' : 'Erwarteter Umsatz gespeichert',
            )
          }
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-sm text-slate-600 ring-1 ring-slate-200">
          <span>
            Erwarteter Umsatz {year}: <strong className="tabular-nums text-slate-900">{formatEuro(model.revenue.expected, true)}</strong>
          </span>
          <span>{model.revenue.estimated ? 'von dir geschätzt' : `hochgerechnet aus ${formatEuro(model.ytd.revenue, true)} bis heute`}</span>
          <InfoTip
            content={`Klaro rechnet deinen bisherigen Umsatz auf 12 Monate hoch. Weißt du es besser – z. B. ein großer Auftrag im Dezember –, trag deinen eigenen Wert ein.`}
          />
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setEditRevenue(true)}>
            anpassen
          </button>
        </div>
      )}

      <div className="space-y-0.5" data-testid="breakdown">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`grid grid-cols-[1rem_minmax(0,1fr)_6.5rem] items-center gap-x-2 gap-y-1.5 rounded-lg px-1 py-2 sm:grid-cols-[1rem_minmax(0,15rem)_minmax(0,1fr)_7rem] ${
              r.total ? 'mt-1 border-t-2 border-slate-900 pt-3' : ''
            }`}
          >
            <span className="text-center font-semibold text-slate-400" aria-hidden="true">
              {r.op}
            </span>
            <span className={`min-w-0 text-sm ${r.total ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
              <span className="inline-flex items-center">
                {r.label}
                {typeof r.label === 'string' && <InfoTip content={r.info} label={`Was zählt zu ${r.label}?`} />}
              </span>
              <span className="block text-xs font-normal text-slate-500">{r.sub}</span>
            </span>
            <span className="relative col-span-2 col-start-2 h-3 overflow-hidden rounded bg-slate-100 sm:col-span-1 sm:col-start-3" aria-hidden="true">
              <span
                className={`absolute inset-y-0 rounded-sm ${r.hatch ? 'ring-1 ring-inset ring-teal-600/60' : ''}`}
                style={{ left: pct(r.from), width: pct(r.width), background: r.hatch ? HATCH : r.color }}
              />
            </span>
            <span className="col-start-3 row-start-1 text-right tabular-nums sm:col-start-4" data-testid={`${view}-${r.key}`}>
              <span className={`block ${r.total ? 'font-semibold text-slate-900' : 'text-slate-900'}`}>{formatEuro(c[r.key], true)}</span>
              <span className="block text-xs text-slate-500">{percent(c[r.key], base)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl bg-slate-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-slate-700">
            Darauf zahlst du Einkommensteuer{isYtd && <span className="text-sm text-slate-500"> (anteilig bis heute)</span>}
            <InfoTip
              content={
                isYtd
                  ? `Die Einkommensteuer wird fürs ganze Jahr berechnet. Für „bis heute“ nimmt Klaro deinen erwarteten Durchschnittssteuersatz (${Math.round(model.averageTaxRate * 100)} %) mal deine Einkünfte bis heute.`
                  : `Tarif ${year}: bis 13.539 € steuerfrei, darüber 20 %, 30 %, 40 % … für jeden weiteren Euro. Vereinfacht, ohne Absetzbeträge.`
              }
            />
          </span>
          <span className="text-xl font-bold tabular-nums text-slate-900" data-testid={`${view}-incomeTax`}>
            ca. {formatEuro(c.incomeTax, true)}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {c.incomeTax > 0
            ? `Das sind im Schnitt ${Math.round(model.averageTaxRate * 100)} % deiner Einkünfte.`
            : 'Unter 13.539 € Einkommen im Jahr fällt keine Einkommensteuer an.'}{' '}
          {otherIncome > 0 ? (
            <>
              Mitgerechnet: dein {profile?.other_income_kind === 'pension' ? 'Pension' : 'Gehalt'} mit ca. {formatEuro(otherIncome, true)} im Jahr – es
              nutzt den steuerfreien Teil schon, deshalb zahlst du auf jeden Euro aus der Selbständigkeit mehr.{' '}
              <Link to="/einstellungen#steuer" className="font-medium text-primary hover:underline">
                ändern
              </Link>
            </>
          ) : (
            <>
              Hast du daneben ein Gehalt oder eine Pension?{' '}
              <Link to="/einstellungen#steuer" className="font-medium text-primary hover:underline">
                In den Einstellungen eintragen
              </Link>
              , sonst ist die Steuer zu niedrig geschätzt.
            </>
          )}
        </p>
      </div>

      {model.svs.unrecorded > 0 && (
        <p className="text-xs text-slate-500">
          Klaro geht davon aus, dass du die fälligen SVS-Quartale bezahlt hast, auch wenn {formatEuro(model.svs.unrecorded, true)} davon nicht
          erfasst sind.{' '}
          <Link to="/ausgaben" className="font-medium text-primary hover:underline">
            SVS-Zahlungen erfassen
          </Link>
        </p>
      )}
    </StepCard>
  );
}
