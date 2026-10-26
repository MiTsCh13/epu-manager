import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useProfileFor } from '@/contexts/AuthContext';
import { INCOME_TAX_BRACKETS_2026 } from '@/constants/tax2026';
import { useProfilePatch } from '@/hooks/useProfilePatch';
import { formatEuro } from '@/lib/money';
import type { SvsTrackerModel } from '@/lib/svsTracker';
import { InfoTip, Term } from '@/components/ui/Tooltip';
import { AmountForm, Money, StepCard, SumLine } from './parts';

/** 3 · Einkommensteuer: Steuer fürs Jahr − Vorauszahlungen = noch offen. Getrennt von der SVS. */
export function IncomeTaxSection({ model }: { model: SvsTrackerModel }) {
  const patch = useProfilePatch();
  const [editing, setEditing] = useState(false);
  const { incomeTax: t, year, previous } = model;
  const profile = useProfileFor(year);
  const hasPrepayments = t.prepaymentQuarterly > 0;
  const taxFree = formatEuro(INCOME_TAX_BRACKETS_2026[0].upTo, true);
  const otherKind = profile?.other_income_kind;
  const otherIncome = otherKind && otherKind !== 'none' ? Number(profile?.other_income_amount ?? 0) : 0;

  return (
    <StepCard step={3} eyebrow="Einkommensteuer" title={`Was das Finanzamt für ${year} verlangt`}>
      <div className="max-w-xl">
        <SumLine
          label={
            <span className="inline-flex items-center">
              Einkommensteuer {year}
              <InfoTip
                content={`Tarif ${year}: bis ${taxFree} steuerfrei, darüber 20 %, 30 %, 40 % … für jeden weiteren Euro. Vereinfacht, ohne Absetzbeträge.`}
              />
            </span>
          }
          sub={
            t.total > 0
              ? `auf deine Einkünfte aus Schritt 1, ganzes Jahr · im Schnitt ${Math.round(model.averageTaxRate * 100)} %`
              : `unter ${taxFree} Einkommen im Jahr fällt keine an`
          }
          amount={formatEuro(t.total, true)}
        />
        {hasPrepayments && (
          <SumLine
            op="−"
            label={<Term k="vorauszahlung">Vorauszahlungen {year}</Term>}
            sub={`4 × ${formatEuro(t.prepaymentQuarterly)} laut Bescheid · ${t.prepaymentPaid > 0 ? `${formatEuro(t.prepaymentPaid, true)} schon bezahlt` : 'noch nichts bezahlt'}`}
            amount={formatEuro(t.prepaymentTotal, true)}
          />
        )}
        <SumLine
          op="="
          total
          label={t.open >= 0 ? `Noch offen für ${year}` : `Gutschrift für ${year}`}
          sub={hasPrepayments ? `kommt nach deinem Steuerbescheid ${year}` : `die ganze Steuer, nach deinem Steuerbescheid ${year}`}
          amount={<Money value={t.open} />}
          testId="income-tax-open"
        />
      </div>

      <p className="text-sm text-slate-600">
        {otherIncome > 0 ? (
          <>
            Mitgerechnet: dein {otherKind === 'pension' ? 'Pension' : 'Gehalt'} mit ca. {formatEuro(otherIncome, true)} im Jahr – es nutzt
            den steuerfreien Teil schon, deshalb zahlst du auf jeden Euro aus der Selbständigkeit mehr.{' '}
            <Link to="/einstellungen#steuer" className="font-semibold text-primary hover:underline">
              Ändern
            </Link>
          </>
        ) : (
          <>
            Hast du daneben ein Gehalt oder eine Pension?{' '}
            <Link to="/einstellungen#steuer" className="font-semibold text-primary hover:underline">
              In den Einstellungen eintragen
            </Link>
            , sonst ist die Steuer zu niedrig geschätzt.
          </>
        )}
      </p>

      {editing ? (
        <AmountForm
          label="Vorauszahlung pro Quartal laut Bescheid (€)"
          hint="Steht auf deinem letzten Einkommensteuerbescheid bzw. Vorauszahlungsbescheid. Leer lassen, wenn du keine zahlst."
          initial={hasPrepayments ? t.prepaymentQuarterly : null}
          allowEmpty
          onCancel={() => setEditing(false)}
          onSave={(value) =>
            patch({ est_prepayment_quarterly: value && value > 0 ? value : null }, value ? 'Vorauszahlung gespeichert' : 'Keine Vorauszahlungen')
          }
        />
      ) : (
        <p className="text-sm text-slate-600">
          {hasPrepayments ? `Vorauszahlung: ${formatEuro(t.prepaymentQuarterly)} pro Quartal. ` : 'Du zahlst keine Vorauszahlungen. '}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>
            {hasPrepayments ? 'Ändern' : 'Ich zahle Vorauszahlungen'}
          </button>
        </p>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        {hasPrepayments
          ? 'Vorauszahlungen sind keine Betriebsausgabe und senken deinen Gewinn nicht – deshalb erfasst du sie nicht bei den Ausgaben. Du trägst hier einmal den Quartalsbetrag aus deinem Bescheid ein; Klaro geht davon aus, dass du pünktlich zahlst (15.2., 15.5., 15.8., 15.11.).'
          : 'Vorauszahlungen verlangt das Finanzamt erst, wenn ein Steuerbescheid Einkommensteuer ergeben hat. Bis dahin zahlst du die ganze Steuer auf einmal, einen Monat nach dem Bescheid. Bekommst du einen Vorauszahlungsbescheid, trag den Quartalsbetrag hier ein – nicht bei den Ausgaben, denn die Einkommensteuer ist keine Betriebsausgabe.'}
      </p>

      {previous?.incomeTax != null && previous.incomeTax >= 1 && (
        <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>
              Aus {previous.year} noch offen: ca. {formatEuro(previous.incomeTax, true)}
            </strong>
            <br />
            Einkommensteuer {previous.year}, fällig einen Monat nach deinem Steuerbescheid {previous.year}.
          </span>
        </p>
      )}
    </StepCard>
  );
}
