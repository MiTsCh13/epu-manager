// Abschnitte „Über dich & SVS“, „Steuer & Gewinnermittlung“, „Adresse, Bank & Rechnungen“.
// Die Felder kommen aus dem Onboarding – gleiche Bedienung, gleiche Prüfung.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, FileText, UserRound } from 'lucide-react';
import { StepAccounting, StepIdentity, StepInvoicing } from '@/components/onboarding/steps';
import { Alert } from '@/components/ui/Alert';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { TextArea } from '@/components/ui/Field';
import { Term } from '@/components/ui/Tooltip';
import { useSettingsSection } from '@/hooks/useSettingsSection';
import { describeSvsChange, describeTaxChange } from '@/lib/profileSettings';
import { supabase } from '@/lib/supabase';
import { generateInvoiceNumber } from '@/lib/tax';
import { SettingsCard } from './SettingsCard';

const FOOTER_MAX_LENGTH = 500;

export function IdentitySection() {
  const state = useSettingsSection('identity');
  const { data, errors, update } = state;

  return (
    <SettingsCard
      id="profil"
      icon={UserRound}
      title="Über dich & SVS"
      description="Daraus berechnet Klaro deine SVS-Beiträge, Rücklagen und mögliche Nachzahlungen."
      state={state}
      notices={describeSvsChange(state.saved, data)}
    >
      <div className="space-y-5">
        <StepIdentity data={data} errors={errors} update={update} />
        {data.business_type === 'gewerbetreibend' && (
          <ChoiceCards<boolean>
            legend={
              <>
                Hat dir die SVS eine&nbsp;<Term k="kleinstunternehmer" />&nbsp;bewilligt?
              </>
            }
            name="svs_exempt"
            value={data.svs_exempt}
            columns={2}
            onChange={(svs_exempt) => update({ svs_exempt })}
            options={[
              { value: false, title: 'Nein', description: 'Ich bin ganz normal bei der SVS versichert.' },
              { value: true, title: 'Ja, bewilligt', description: 'Ich zahle nur die Unfallversicherung.' },
            ]}
          />
        )}
        <p className="text-xs text-slate-500">
          Deine aktuelle <Term k="vorschreibung">SVS-Vorschreibung</Term> trägst du unter{' '}
          <Link to="/gewinn" className="font-medium text-primary hover:underline">
            Gewinn & Rücklagen
          </Link>{' '}
          ein.
        </p>
      </div>
    </SettingsCard>
  );
}

export function AccountingSection() {
  const state = useSettingsSection('accounting');
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft')
      .then(({ count }) => {
        if (!cancelled) setDraftCount(count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsCard
      id="steuer"
      icon={Calculator}
      title="Steuer & Gewinnermittlung"
      description="Bestimmt, wie Klaro deine Rechnungen schreibt und deinen Gewinn berechnet."
      state={state}
      notices={describeTaxChange(state.saved, state.data, draftCount)}
    >
      <StepAccounting data={state.data} errors={state.errors} update={state.update} />
    </SettingsCard>
  );
}

export function InvoicingSection() {
  const state = useSettingsSection('invoicing');
  const { data, saved, errors, update } = state;
  const year = new Date().getFullYear();
  const [yearNumbers, setYearNumbers] = useState<string[] | null>(null);
  const formatChanged = data.invoice_number_format !== saved.invoice_number_format;

  // Rechnungsnummern des Jahres erst laden, wenn das Format geändert wird
  useEffect(() => {
    if (!formatChanged || yearNumbers) return;
    let cancelled = false;
    void supabase
      .from('invoices')
      .select('invoice_number')
      .gte('invoice_date', `${year}-01-01`)
      .lte('invoice_date', `${year}-12-31`)
      .then(({ data: rows }) => {
        if (!cancelled) setYearNumbers((rows ?? []).map((r) => r.invoice_number));
      });
    return () => {
      cancelled = true;
    };
  }, [formatChanged, yearNumbers, year]);

  return (
    <SettingsCard
      id="rechnungen"
      icon={FileText}
      title="Adresse, Bank & Rechnungen"
      description="Ausgestellte Rechnungen behalten die Angaben von damals – offene Entwürfe werden automatisch aktualisiert."
      state={state}
    >
      <div className="space-y-5">
        <StepInvoicing data={data} errors={errors} update={update} />
        {formatChanged && yearNumbers && (
          <Alert type="info">
            Deine nächste Rechnung bekommt die Nummer{' '}
            <strong>{generateInvoiceNumber(data.invoice_number_format, year, yearNumbers)}</strong> – die Nummerierung
            läuft einfach weiter. Bereits vergebene Nummern bleiben unverändert.
          </Alert>
        )}
        <TextArea
          label="Standard-Fußzeile für Rechnungen"
          optional
          rows={3}
          maxLength={FOOTER_MAX_LENGTH}
          placeholder="z. B. Vielen Dank für die gute Zusammenarbeit!"
          hint="Wird bei jeder neuen Rechnung vorausgefüllt und lässt sich dort pro Rechnung anpassen."
          value={data.invoice_footer_text}
          onChange={(e) => update({ invoice_footer_text: e.target.value })}
        />
      </div>
    </SettingsCard>
  );
}
