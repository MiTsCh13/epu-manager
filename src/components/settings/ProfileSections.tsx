// Abschnitte „Über dich & SVS“, „Steuer & Gewinnermittlung“, „Adresse, Bank & Rechnungen“.
// Die Felder kommen aus dem Onboarding – gleiche Bedienung, gleiche Prüfung.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, FileText, UserRound } from 'lucide-react';
import { StepAccounting, StepIdentity, StepInvoicing } from '@/components/onboarding/steps';
import { Alert } from '@/components/ui/Alert';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Term } from '@/components/ui/Tooltip';
import { useSettingsSection } from '@/hooks/useSettingsSection';
import { describeSvsChange, describeTaxChange } from '@/lib/profileSettings';
import { supabase } from '@/lib/supabase';
import { nextInvoiceNumber, validateNumberFormat } from '@/lib/invoiceNumbers';
import { toISODate } from '@/lib/invoices';
import { useUsedInvoiceNumbers } from '@/hooks/useUsedInvoiceNumbers';
import { SettingsCard } from './SettingsCard';


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
  const formatChanged = data.invoice_number_format !== saved.invoice_number_format;
  // Vergebene Nummern erst laden, wenn das Format geändert wird
  const used = useUsedInvoiceNumbers(formatChanged);

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
        {formatChanged && used && !validateNumberFormat(data.invoice_number_format) && (
          <Alert type="info">
            Deine nächste Rechnung bekommt die Nummer{' '}
            <strong>{nextInvoiceNumber(data.invoice_number_format, toISODate(new Date()), used.numbers, [...used.formats, saved.invoice_number_format])}</strong> – die Nummerierung
            läuft einfach weiter. Bereits vergebene Nummern bleiben unverändert.
          </Alert>
        )}
        <p className="text-sm text-slate-600">
          Logo, Farbe, Texte und Fußzeile deiner Rechnungen gestaltest du in den{' '}
          <a href="#vorlagen" className="font-semibold text-primary hover:underline">
            Rechnungs-Vorlagen
          </a>
          .
        </p>
      </div>
    </SettingsCard>
  );
}
