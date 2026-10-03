import { Term } from '@/components/ui/Tooltip';
import { Alert } from '@/components/ui/Alert';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Field } from '@/components/ui/Field';
import { formatIban, type OnboardingData, type OnboardingErrors } from '@/lib/validation';
import type { BusinessType, IndustryType, InvoiceNumberFormat, PauschType, ProfitMethod } from '@/types';

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
            description: 'Du hast einen Gewerbeschein.',
          },
          {
            value: 'neue_selbstaendige',
            title: <Term k="neueSelbstaendige" />,
            description: 'Ohne Gewerbeschein – z. B. Fotograf:in, Trainer:in, Entwickler:in.',
          },
        ]}
      />
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
            { value: true, title: 'Ja', description: 'Unter 55.000 € Umsatz, keine USt' },
            { value: false, title: 'Nein', description: 'Ich verrechne Umsatzsteuer' },
          ]}
        />
        {data.is_kleinunternehmer && (
          <Alert type="info">
            Auf deinen Rechnungen muss der Hinweis <strong>„§ 6 Abs. 1 Z 27 UStG“</strong> stehen. Keine Sorge – Klaro
            fügt ihn automatisch ein.
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
              description: data.is_kleinunternehmer === false ? 'Nur für Kleinunternehmer möglich.' : '45 % bzw. 20 % deiner Einnahmen',
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
          legend="Was verkaufst du hauptsächlich?"
          name="industry_code"
          value={data.industry_code}
          error={errors.industry_code}
          columns={2}
          onChange={(industry_code) => update({ industry_code })}
          options={[
            { value: 'service', title: 'Dienstleistungen', description: '45 % pauschale Ausgaben' },
            { value: 'trade', title: 'Waren / Produktion', description: '20 % pauschale Ausgaben' },
          ]}
        />
      )}
    </div>
  );
}

// ─── Schritt 3: Bankdaten & Rechnungsformat ─────────────────

export function StepInvoicing({ data, errors, update }: StepProps) {
  const year = new Date().getFullYear();
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
        label={<Term k="uid" />}
        optional
        placeholder="ATU12345678"
        hint={data.is_kleinunternehmer ? 'Als Kleinunternehmer brauchst du meist keine.' : 'Brauchst du, wenn du Umsatzsteuer verrechnest.'}
        value={data.uid_number}
        error={errors.uid_number}
        onChange={(e) => update({ uid_number: e.target.value })}
      />
      <ChoiceCards<InvoiceNumberFormat>
        legend="Format deiner Rechnungsnummern"
        name="invoice_number_format"
        value={data.invoice_number_format}
        columns={2}
        onChange={(invoice_number_format) => update({ invoice_number_format })}
        options={[
          { value: 'YYYY-NNN', title: `${year}-001`, description: 'Jahr + laufende Nummer' },
          { value: 'KL-YYYY-NNN', title: `KL-${year}-001`, description: 'Mit Kürzel davor' },
        ]}
      />
    </div>
  );
}
