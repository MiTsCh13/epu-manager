import { Term } from '@/components/ui/Tooltip';
import { Alert } from '@/components/ui/Alert';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Field } from '@/components/ui/Field';
import { NumberFormatField } from '@/components/invoices/NumberFormatField';
import { SVS_2026 } from '@/constants/svs2026';
import { formatEuro, parseDecimal } from '@/lib/money';
import { calculateArbeitsplatzpauschale } from '@/lib/profit';
import { formatIban, type OnboardingData, type OnboardingErrors } from '@/lib/validation';
import type { BusinessType, IndustryType, OtherIncomeKind, PauschType, ProfitMethod } from '@/types';

interface StepProps {
  data: OnboardingData;
  errors: OnboardingErrors;
  update: (patch: Partial<OnboardingData>) => void;
}

// ─── Schritt 1: Wer bist du? ────────────────────────────────

export function StepIdentity({ data, errors, update }: StepProps) {
  return (
    <div className="space-y-5">
      <Field
        label="Dein Name"
        autoComplete="name"
        value={data.full_name}
        error={errors.full_name}
        onChange={(e) => update({ full_name: e.target.value })}
      />
      <Field
        label="Unternehmensname"
        optional
        hint="Erscheint auf deinen Rechnungen. Leer lassen, wenn du unter deinem Namen auftrittst."
        autoComplete="organization"
        value={data.business_name}
        onChange={(e) => update({ business_name: e.target.value })}
      />
      <div className="space-y-2">
        <ChoiceCards<BusinessType>
          legend="Wie bist du selbständig?"
          name="business_type"
          value={data.business_type}
          error={errors.business_type}
          onChange={(business_type) => update({ business_type })}
          options={[
            {
              value: 'gewerbetreibend',
              title: <Term k="gsvg" />,
              description: (
                <>
                  Du hast ein Gewerbe angemeldet: Du bist im Gewerberegister (GISA) eingetragen und zahlst die
                  Grundumlage an die Wirtschaftskammer (WKO).
                  <span className="mt-1 block text-xs">
                    Typisch: IT-Dienstleistung und Programmierung, Fotografie, Grafikdesign, Unternehmensberatung,
                    Handel, Handwerk.
                  </span>
                </>
              ),
            },
            {
              value: 'neue_selbstaendige',
              title: <Term k="neueSelbstaendige" />,
              description: (
                <>
                  Du bist ohne Gewerbe selbständig: kein Eintrag im Gewerberegister, keine Post von der WKO.
                  <span className="mt-1 block text-xs">
                    Typisch: Vortragende, Trainer:innen in der Erwachsenenbildung, Psychotherapeut:innen,
                    Journalist:innen, Autor:innen, Künstler:innen.
                  </span>
                </>
              ),
            },
          ]}
        />
        <details className="group rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <summary className="cursor-pointer list-none font-medium text-primary [&::-webkit-details-marker]:hidden">
            Nicht sicher? So findest du es heraus
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Such deinen Namen in der{' '}
              <a href="https://www.gisa.gv.at/abfrage" target="_blank" rel="noreferrer" className="font-medium text-primary underline">
                GISA-Abfrage
              </a>{' '}
              (öffentlich und kostenlos). Findest du dort eine Gewerbeberechtigung, bist du gewerbetreibend.
            </li>
            <li>Bekommst du jedes Jahr eine Vorschreibung der Grundumlage von der Wirtschaftskammer, bist du gewerbetreibend.</li>
            <li>
              Auch ohne Prüfung braucht man für viele Tätigkeiten ein Gewerbe, z. B. für Fotografie oder IT-Dienstleistungen
              (sogenannte freie Gewerbe).
            </li>
            <li>
              Ärzt:innen, Anwält:innen, Notar:innen und Ziviltechniker:innen sind anders versichert. Für sie passt Klaro
              derzeit nicht.
            </li>
          </ul>
        </details>
      </div>
      <Field
        label={
          <>
            Seit wann bist du bei der&nbsp;<Term k="svs" />&nbsp;angemeldet?
          </>
        }
        type="date"
        hint="Datum deiner Gewerbeanmeldung bzw. SVS-Anmeldung. Daraus berechnet Klaro, wann Nachzahlungen kommen."
        value={data.svs_registration_date}
        error={errors.svs_registration_date}
        onChange={(e) => update({ svs_registration_date: e.target.value })}
      />
    </div>
  );
}

// ─── Schritt 2: Wie rechnest du ab? ─────────────────────────

export function StepAccounting({ data, errors, update }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <ChoiceCards<boolean>
          legend={
            <>
              Bist du&nbsp;<Term k="kleinunternehmer" />?
            </>
          }
          name="is_kleinunternehmer"
          value={data.is_kleinunternehmer}
          error={errors.is_kleinunternehmer}
          columns={2}
          onChange={(is_kleinunternehmer) =>
            update({
              is_kleinunternehmer,
              // KU-Pauschalierung ist nur für Kleinunternehmer möglich
              ...(!is_kleinunternehmer && data.pausch_type === 'ku' && { pausch_type: null, industry_code: null }),
            })
          }
          options={[
            { value: true, title: 'Ja', description: `Bis ${formatEuro(SVS_2026.kleinunternehmerThreshold, true)} Umsatz, keine USt` },
            { value: false, title: 'Nein', description: 'Ich verrechne Umsatzsteuer' },
          ]}
        />
        {data.is_kleinunternehmer && (
          <Alert type="info">
            Auf deinen Rechnungen muss der Hinweis <strong>„§ 6 Abs. 1 Z 27 UStG“</strong> stehen. Keine Sorge – Klaro
            fügt ihn automatisch ein.
            <br />
            <br />
            Gut zu wissen: Klaro rechnet den Kleinunternehmer-Status immer für das ganze Kalenderjahr. Steigt dein
            Umsatz über {formatEuro(SVS_2026.kleinunternehmerToleranceLimit, true)} (Grenze plus 10 % Toleranz), musst
            du schon ab der Rechnung, mit der du darüber kommst, Umsatzsteuer verrechnen. Diesen Wechsel mitten im Jahr
            bildet Klaro nicht ab – sprich dann mit deiner Steuerberatung.
          </Alert>
        )}
      </div>

      <ChoiceCards<ProfitMethod>
        legend="Wie ermittelst du deinen Gewinn?"
        name="profit_method"
        value={data.profit_method}
        error={errors.profit_method}
        onChange={(profit_method) => update({ profit_method })}
        options={[
          {
            value: 'pauschal',
            title: <Term k="pauschalierung" />,
            description: 'Fixer Prozentsatz statt einzelner Belege – weniger Aufwand.',
          },
          {
            value: 'euer',
            title: <Term k="euer" />,
            description: 'Du erfasst jede Ausgabe einzeln.',
          },
        ]}
      />

      {data.profit_method === 'pauschal' && (
        <ChoiceCards<PauschType>
          legend="Welche Pauschalierung?"
          name="pausch_type"
          value={data.pausch_type}
          error={errors.pausch_type}
          onChange={(pausch_type) => update({ pausch_type, ...(pausch_type !== 'ku' && { industry_code: null }) })}
          options={[
            {
              value: 'ku',
              title: <Term k="kuPauschalierung" />,
              description: data.is_kleinunternehmer === false ? 'Nur für Kleinunternehmer möglich.' : '20 % bzw. 45 % deiner Einnahmen',
              disabled: data.is_kleinunternehmer === false,
            },
            { value: 'basis_15', title: <Term k="basisPauschalierung">Basispauschalierung 15 %</Term>, description: 'Allgemein' },
            {
              value: 'basis_6',
              title: <Term k="basisPauschalierung">Basispauschalierung 6 %</Term>,
              description: 'Beratung, Vorträge, Unterricht, Schreiben, Wissenschaft',
            },
          ]}
        />
      )}

      {data.profit_method === 'pauschal' && data.pausch_type === 'ku' && (
        <ChoiceCards<IndustryType>
          legend="Welche Art von Betrieb hast du?"
          name="industry_code"
          value={data.industry_code}
          error={errors.industry_code}
          columns={2}
          onChange={(industry_code) => update({ industry_code })}
          options={[
            {
              value: 'service',
              title: 'Dienstleistungsbetrieb',
              description: '20 % pauschale Ausgaben. Z. B. IT, Fotografie, Design, Werbung, Beratung, Unterricht, Übersetzung, Gesundheit, Kunst.',
            },
            {
              value: 'trade',
              title: 'Anderer Betrieb',
              description: '45 % pauschale Ausgaben. Z. B. Handel, Handwerk, Bau, Produktion, Gastronomie, Transport.',
            },
          ]}
        />
      )}

      <HomeOfficeAndOtherIncome data={data} errors={errors} update={update} />
    </div>
  );
}

/** Arbeitsplatzpauschale und andere Einkünfte – beides beeinflusst Gewinn bzw. Einkommensteuer. */
function HomeOfficeAndOtherIncome({ data, errors, update }: StepProps) {
  const year = new Date().getFullYear();
  const registration = data.svs_registration_date ? new Date(data.svs_registration_date) : null;
  const amount = parseDecimal(data.other_income_amount);
  const app = calculateArbeitsplatzpauschale({
    homeOffice: data.home_office,
    otherIncomeKind: data.other_income_kind,
    otherIncomeAmount: Number.isNaN(amount) ? 0 : amount,
    year,
    registrationDate: registration && !Number.isNaN(registration.getTime()) ? registration : null,
  });

  return (
    <div className="space-y-6 border-t border-slate-100 pt-6">
      <div className="space-y-3">
        <ChoiceCards<boolean>
          legend="Arbeitest du von zu Hause aus?"
          name="home_office"
          value={data.home_office}
          error={errors.home_office}
          columns={2}
          onChange={(home_office) => update({ home_office })}
          options={[
            { value: true, title: 'Ja, von zu Hause', description: 'Ich habe kein Büro, Atelier und keine Praxis außer Haus.' },
            { value: false, title: 'Nein', description: 'Ich habe einen eigenen Arbeitsraum außer Haus, z. B. ein gemietetes Büro.' },
          ]}
        />
      </div>

      <div className="space-y-3">
        <ChoiceCards<OtherIncomeKind>
          legend="Hast du daneben ein Gehalt oder eine Pension?"
          name="other_income_kind"
          value={data.other_income_kind}
          error={errors.other_income_kind}
          columns={3}
          onChange={(other_income_kind) => update({ other_income_kind })}
          options={[
            { value: 'none', title: 'Nein', description: 'Nur meine Selbständigkeit' },
            { value: 'employment', title: 'Ja, ein Gehalt', description: 'Ich bin auch angestellt' },
            { value: 'pension', title: 'Ja, eine Pension', description: 'Ich bin in Pension' },
          ]}
        />
        <p className="text-xs text-slate-500">
          Dein Gehalt bzw. deine Pension ist über die Lohnsteuer schon versteuert. Es erhöht aber den Steuersatz auf
          deinen Gewinn – ohne diese Angabe schätzt Klaro deine Einkommensteuer zu niedrig.
        </p>
        {data.other_income_kind && data.other_income_kind !== 'none' && (
          <Field
            label="Zu versteuerndes Einkommen daraus pro Jahr (ungefähr, in €)"
            inputMode="decimal"
            placeholder="z. B. 18.000"
            hint="Steht auf deinem Lohnzettel (L16) bei Kennzahl 245. Grob geschätzt: Monatsbrutto × 12 × 0,8 – das 13. und 14. Gehalt zählen nicht mit."
            value={data.other_income_amount}
            error={errors.other_income_amount}
            onChange={(e) => update({ other_income_amount: e.target.value })}
          />
        )}
      </div>

      {data.home_office && data.other_income_kind && (
        <Alert type="info">
          Klaro zieht automatisch eine <Term k="arbeitsplatzpauschale" /> von{' '}
          <strong>{formatEuro(app.size === 'klein' ? 300 : 1200, true)} pro Jahr</strong> ab, auch bei Pauschalierung.
          {app.months > 0 && app.months < 12 && <> Im ersten Jahr anteilig: {formatEuro(app.amount, true)} für {year}.</>}
          {app.size === 'klein' && <> Dazu kannst du ergonomische Büromöbel bis 300 € im Jahr als Ausgabe erfassen.</>}
        </Alert>
      )}
    </div>
  );
}

// ─── Schritt 3: Bankdaten & Rechnungsformat ─────────────────

export function StepInvoicing({ data, errors, update }: StepProps) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Diese Angaben müssen laut <Term k="ustg11" /> auf jeder Rechnung stehen.
      </p>
      <Field
        label="Straße und Hausnummer"
        autoComplete="street-address"
        value={data.address}
        error={errors.address}
        onChange={(e) => update({ address: e.target.value })}
      />
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field
          label="PLZ"
          inputMode="numeric"
          autoComplete="postal-code"
          value={data.zip_code}
          error={errors.zip_code}
          onChange={(e) => update({ zip_code: e.target.value })}
        />
        <Field
          label="Ort"
          autoComplete="address-level2"
          value={data.city}
          error={errors.city}
          onChange={(e) => update({ city: e.target.value })}
        />
      </div>
      <Field
        label={<Term k="iban" />}
        autoComplete="off"
        placeholder="AT12 3456 7890 1234 5678"
        value={data.iban}
        error={errors.iban}
        onChange={(e) => update({ iban: e.target.value })}
        onBlur={() => data.iban && update({ iban: formatIban(data.iban) })}
      />
      <Field
        label="Kontoinhaber"
        autoComplete="cc-name"
        hint="Genau wie bei deiner Bank. Seit 2025 prüfen Banken bei jeder Überweisung, ob Name und IBAN zusammenpassen – steht so auch auf deinen Rechnungen."
        value={data.account_holder}
        error={errors.account_holder}
        onChange={(e) => update({ account_holder: e.target.value })}
      />
      <Field
        label={<Term k="uid" />}
        optional
        placeholder="ATU12345678"
        hint={data.is_kleinunternehmer ? 'Als Kleinunternehmer brauchst du meist keine.' : 'Brauchst du, wenn du Umsatzsteuer verrechnest.'}
        value={data.uid_number}
        error={errors.uid_number}
        onChange={(e) => update({ uid_number: e.target.value })}
      />
      <NumberFormatField
        value={data.invoice_number_format}
        error={errors.invoice_number_format}
        onChange={(invoice_number_format) => update({ invoice_number_format })}
      />
    </div>
  );
}
