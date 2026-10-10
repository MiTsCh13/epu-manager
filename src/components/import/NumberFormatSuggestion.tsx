import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUsedInvoiceNumbers } from '@/hooks/useUsedInvoiceNumbers';
import { nextInvoiceNumber } from '@/lib/invoiceNumbers';
import { toISODate } from '@/lib/invoices';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

/** Nach dem Import: Rechnungsnummern der übernommenen Einnahmen haben ein anderes Format → übernehmen? */
export function NumberFormatSuggestion({ format, example }: { format: string; example: string }) {
  const { profile, refreshProfile } = useAuth();
  const used = useUsedInvoiceNumbers();
  const [state, setState] = useState<'ask' | 'saving' | 'done' | 'dismissed'>('ask');
  if (!profile || state === 'dismissed' || (state === 'ask' && profile.invoice_number_format === format)) return null;

  const next = used ? nextInvoiceNumber(format, toISODate(new Date()), used.numbers, [...used.formats, profile.invoice_number_format]) : null;

  async function accept() {
    setState('saving');
    const { error } = await supabase.from('profiles').update({ invoice_number_format: format }).eq('id', profile!.id);
    if (error) {
      setState('ask');
      return void toast.error('Das Format konnte nicht gespeichert werden.');
    }
    await refreshProfile();
    setState('done');
  }

  if (state === 'done') {
    return (
      <Alert type="success">
        Erledigt – deine nächste Rechnung bekommt die Nummer <strong>{next}</strong>. Ändern kannst du das jederzeit in den Einstellungen.
      </Alert>
    );
  }
  return (
    <Alert type="info" title="Rechnungsnummern wie bisher weiterführen?">
      <p>
        Deine übernommenen Rechnungsnummern sehen so aus: <strong>{example}</strong>.
        {next && (
          <>
            {' '}
            Sollen neue Rechnungen in Klaro im selben Format weiterzählen? Die nächste wäre <strong>{next}</strong>.
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button loading={state === 'saving'} disabled={!next} onClick={() => void accept()}>
          Format übernehmen
        </Button>
        <Button variant="ghost" disabled={state === 'saving'} onClick={() => setState('dismissed')}>
          Nein, danke
        </Button>
      </div>
    </Alert>
  );
}
