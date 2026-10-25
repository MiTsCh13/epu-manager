import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { useProfilePatch } from '@/hooks/useProfilePatch';
import { SVS_2026 } from '@/constants/svs2026';
import { formatEuro } from '@/lib/money';
import type { SvsTrackerModel } from '@/lib/svsTracker';
import { InfoTip, Term } from '@/components/ui/Tooltip';
import { AmountForm, Money, StepCard, SumLine } from './parts';

/** Ab dieser Nachzahlung lohnt der Tipp, die vorläufige Basis erhöhen zu lassen. */
const TIP_FROM = 300;

/** 2 · SVS: Berechnungsbasis → endgültig − vorläufig = Nachzahlung bzw. Gutschrift. */
export function SvsSection({ model }: { model: SvsTrackerModel }) {
  const patch = useProfilePatch();
  const [editing, setEditing] = useState(false);
  const { svs, year, full } = model;
  const quarters = svs.quartersDue + svs.quartersOpen;
  const diff = svs.difference;

  const provisionalSource =
    svs.provisionalReason === 'prescription'
      ? 'laut deinem SVS-Brief'
      : svs.provisionalReason === 'previous'
        ? 'geschätzt aus deinen Einkünften im Vorjahr'
        : `geschätzt: Mindestbeitrag im ${model.svsYear}. Jahr`;

  const editor = editing ? (
    <AmountForm
      label="Betrag deiner aktuellen Quartals-Vorschreibung (€)"
      hint="Steht auf dem letzten SVS-Brief. Leer lassen, um wieder zu schätzen."
      initial={svs.prescriptionKnown ? svs.quarterlyAmount : null}
      allowEmpty
      onCancel={() => setEditing(false)}
      onSave={(value) => patch({ svs_quarterly_prescription: value }, 'Vorschreibung gespeichert – Berechnung aktualisiert')}
    />
  ) : (
    <p className="text-sm text-slate-600">
      {svs.prescriptionKnown
        ? <>Berechnet mit deiner <Term k="vorschreibung" /> von {formatEuro(svs.quarterlyAmount)} pro Quartal. </>
        : <>Genauer wird es mit dem Betrag deiner aktuellen <Term k="vorschreibung" />. </>}
      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>
        {svs.prescriptionKnown ? 'Ändern' : 'Vorschreibung eintragen'}
      </button>
    </p>
  );

  if (svs.exempt) {
    return (
      <StepCard step={2} eyebrow="SVS-Beiträge" title={`Was die SVS für ${year} verlangt`}>
        <p className="text-sm text-slate-700">
          Du bist von der Pflichtversicherung ausgenommen (<Term k="kleinstunternehmer" />). Du zahlst nur die
          Unfallversicherung: <strong className="tabular-nums">{formatEuro(svs.final.total, true)}</strong> im Jahr. Eine Nachzahlung gibt es
          nicht, solange du unter den Grenzen bleibst.
        </p>
      </StepCard>
    );
  }

  const finalBreakdown = (
    <>
      Was die SVS nach deinem Steuerbescheid endgültig für {year} festlegt: <strong>{formatEuro(svs.final.total)}</strong>
      <br />
      Pensionsversicherung 18,5 % von {formatEuro(svs.basis, true)}: {formatEuro(svs.final.pv)}
      <br />
      Krankenversicherung 6,8 %: {formatEuro(svs.final.kv)}
      {svs.kvFixed
        ? ' (als Gewerbetreibende:r bleibt es in Jahr 1 und 2 beim Mindestbeitrag)'
        : model.svsYear <= 2 && ' (als Neue:r Selbständige:r wird sie schon ab dem 1. Jahr nachberechnet)'}
      <br />
      Selbständigenvorsorge 1,53 %: {formatEuro(svs.final.sv)} (wird nie nachverrechnet)
      <br />
      Unfallversicherung: {formatEuro(svs.final.uv)}
    </>
  );

  return (
    <StepCard step={2} eyebrow="SVS-Beiträge" title={`Was die SVS für ${year} verlangt`}>
      <p className="-mt-2 text-sm text-slate-600">
        Die <Term k="svs" /> rechnet mit deinen Einkünften aus Schritt 1. Die Pensions- und Krankenversicherungsbeiträge, die
        du dort abgezogen hast, zählt sie wieder dazu – sonst würden die Beiträge sich selbst kleiner rechnen.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
        <div className="rounded-xl p-3 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Einkünfte {year}</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{formatEuro(full.einkuenfte, true)}</p>
          <p className="text-xs text-slate-500">aus Schritt 1, ganzes Jahr</p>
        </div>
        <span className="self-center text-center font-semibold text-slate-400" aria-hidden="true">+</span>
        <div className="rounded-xl p-3 ring-1 ring-slate-200">
          <p className="flex items-center text-xs text-slate-500">
            wieder dazugezählt
            <InfoTip
              content={`Pensions- und Krankenversicherung, die du ${year} vorgeschrieben bekommst${svs.extraPaid > 0 ? ', inkl. Nachzahlung für Vorjahre' : ''}. Selbständigenvorsorge und Unfallversicherung bleiben abgezogen.`}
            />
          </p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{formatEuro(svs.hinzurechnung, true)}</p>
          <p className="text-xs text-slate-500">PV- und KV-Beiträge</p>
        </div>
        <span className="self-center text-center font-semibold text-slate-400" aria-hidden="true">=</span>
        <div className="rounded-xl bg-primary-50 p-3 ring-1 ring-primary-100">
          <p className="text-xs text-primary-900">
            <Term k="berechnungsbasis">Berechnungsbasis für die SVS</Term>
          </p>
          <p className="text-lg font-semibold tabular-nums text-primary-800" data-testid="svs-basis">
            {formatEuro(svs.notInsured ? svs.basisRaw : svs.basis, true)}
          </p>
          <p className="text-xs text-primary-900/80">
            {svs.basisRaw > svs.maxBasis
              ? `Gedeckelt: mehr als ${formatEuro(svs.maxBasis, true)} zählt nicht.`
              : svs.basisRaw < svs.minBasis && !svs.notInsured
                ? `Angehoben auf den Mindestbetrag von ${formatEuro(svs.minBasis, true)}.`
                : `mind. ${formatEuro(svs.minBasis, true)}, höchstens ${formatEuro(svs.maxBasis, true)}`}
          </p>
        </div>
      </div>

      <div className="max-w-xl">
        <SumLine
          label={
            <span className="inline-flex items-center">
              SVS {year} endgültig
              <InfoTip content={finalBreakdown} label="Wie setzt sich der Betrag zusammen?" />
            </span>
          }
          sub="rund 27 % der Berechnungsbasis plus Unfallversicherung"
          amount={formatEuro(svs.final.total, true)}
          testId="svs-final"
        />
        <SumLine
          op="−"
          label={<Term k="vorlaeufig">Vorläufig verrechnet</Term>}
          sub={`${quarters} Quartale à ${formatEuro(svs.quarterlyAmount)} · ${provisionalSource}`}
          amount={formatEuro(svs.provisional.total, true)}
        />
        <SumLine op="=" total label={diff >= 0 ? 'Nachzahlung' : 'Gutschrift'} amount={formatEuro(Math.abs(diff), true)} testId="nachzahlung" />
      </div>
      {editor}

      {svs.notInsured ? (
        <p className="flex gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Unter der Versicherungsgrenze.</strong> Als Neue:r Selbständige:r bist du erst ab{' '}
            {formatEuro(SVS_2026.registrationThreshold)} Berechnungsbasis im Jahr versichert. Bereits bezahlte Beiträge bekommst du zurück.
          </span>
        </p>
      ) : diff >= 1 ? (
        <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>
              <Term k="nachbemessung">Nachzahlung</Term> für {year}: ca. <Money value={diff} />
            </strong>
            <br />
            Kommt, sobald dein Steuerbescheid {year} da ist – voraussichtlich {year + 1}.
          </span>
        </p>
      ) : diff <= -1 ? (
        <p className="flex gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Gutschrift für {year}: ca. {formatEuro(-diff, true)}.</strong> Deine Einkünfte liegen unter der vorläufigen Basis. Die SVS
            zahlt dir die Differenz nach dem Steuerbescheid zurück.
          </span>
        </p>
      ) : (
        <p className="flex gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Keine Nachzahlung zu erwarten – die vorläufigen Beiträge passen zu deinen Einkünften.
        </p>
      )}

      <details className="group rounded-xl ring-1 ring-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          Warum verrechnet die SVS erst zu wenig und dann nach?
          <span className="text-slate-400 group-open:rotate-45" aria-hidden="true">+</span>
        </summary>
        <ol className="space-y-3 px-4 pb-4 text-sm text-slate-700">
          <li>
            <strong>1. Vorläufig zahlen.</strong> Jedes Quartal schickt dir die SVS eine Vorschreibung (fällig Ende Februar, Mai, August,
            November). Sie kennt deine aktuellen Einkünfte noch nicht. In den ersten drei Jahren rechnet sie mit dem Mindestbetrag, danach
            mit deinen Einkünften von vor drei Jahren.
          </li>
          <li>
            <strong>2. Steuerbescheid.</strong> Du gibst deine Steuererklärung ab, das Finanzamt stellt deine Einkünfte fest und meldet sie
            automatisch an die SVS.
          </li>
          <li>
            <strong>3. Nachbemessung.</strong> Die SVS rechnet das Jahr mit deinen echten Einkünften nach. Waren sie höher, zahlst du nach.
            Waren sie niedriger, bekommst du Geld zurück.
          </li>
        </ol>
      </details>

      {diff > TIP_FROM && !svs.notInsured && (
        <p className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong>Tipp: Nachzahlung vermeiden.</strong> Du kannst bei der SVS beantragen, dass sie schon jetzt mit einer höheren Basis
            rechnet. Dann zahlst du laufend mehr statt später auf einmal und setzt die Beiträge gleich im selben Jahr von der Steuer ab.
          </span>
        </p>
      )}
    </StepCard>
  );
}
