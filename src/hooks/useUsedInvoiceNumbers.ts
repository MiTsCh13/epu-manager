import { useEffect, useState } from 'react';
import { fetchAll } from '@/lib/fetchAll';
import { formatsOf } from '@/lib/invoiceNumbers';
import { supabase } from '@/lib/supabase';

export interface UsedInvoiceNumbers {
  numbers: string[]; // Rechnungen inkl. Entwürfe und übernommene Einnahmen
  formats: string[]; // Formate der bisherigen Klaro-Rechnungen – damit läuft die Zählung nach einem Formatwechsel weiter
}

/**
 * Alle vergebenen Rechnungsnummern – Grundlage für die nächste fortlaufende Nummer. Lädt erst, wenn `enabled`;
 * null solange nicht geladen oder wenn das Laden fehlschlägt (dann lieber keine Nummer vorschlagen als eine doppelte).
 */
export function useUsedInvoiceNumbers(enabled = true): UsedInvoiceNumbers | null {
  const [used, setUsed] = useState<UsedInvoiceNumbers | null>(null);
  useEffect(() => {
    if (!enabled || used) return;
    let cancelled = false;
    // Nummern aus übernommenen Einnahmen zählen mit – sonst ginge die Nummerierung von vorne los
    void Promise.all([
      fetchAll((a, b) => supabase.from('invoices').select('invoice_number, invoice_date').order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('incomes').select('reference').not('reference', 'is', null).order('id').range(a, b)),
    ]).then(([inv, inc]) => {
      if (cancelled || inv.error || inc.error) return;
      setUsed({
        numbers: [...inv.data.map((r) => r.invoice_number), ...inc.data.map((r) => r.reference ?? '')],
        formats: formatsOf(inv.data.map((r) => ({ reference: r.invoice_number, date: r.invoice_date }))),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, used]);
  return used;
}
