// Import: Dateien lesen und Daten in Supabase speichern bzw. rückgängig machen.
import { fetchAll } from './fetchAll';
import { deleteReceipt } from './receipts';
import { supabase } from './supabase';
import { parseDelimited, type Table } from './importParse';
import { buildHistory, type CategoryHistory, type ExistingEntry, type ImportRecords, type ImportSummary } from './importMapping';
import type { ImportRecord } from '@/types';

export interface Sheet {
  name: string;
  table: Table;
}

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const IMPORT_FILE_ACCEPT = '.xlsx,.csv,.txt,.tsv';

/** CSV aus deutschsprachigem Excel ist oft Windows-1252 statt UTF-8. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** Liest eine .xlsx- oder CSV-Datei. Wirft einen Fehler mit verständlicher Meldung. */
export async function readImportFile(file: File): Promise<Sheet[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Die Datei ist größer als 10 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') || name.endsWith('.ods') || name.endsWith('.numbers')) {
    throw new Error('Dieses Format kann Klaro nicht lesen. Speichere die Datei in Excel bzw. Numbers als „.xlsx“ oder „.csv“ – oder kopiere die Zeilen und füge sie unten ein.');
  }
  if (name.endsWith('.xlsx')) {
    // Erst bei Bedarf laden – hält die App klein
    try {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const sheets = await readXlsxFile(file);
      return sheets.map((s) => ({ name: s.sheet, table: s.data as Table })).filter((s) => s.table.length > 0);
    } catch {
      throw new Error('Die Excel-Datei konnte nicht gelesen werden. Ist sie vielleicht mit einem Passwort geschützt?');
    }
  }
  const text = decodeText(await file.arrayBuffer());
  return [{ name: file.name, table: parseDelimited(text) }];
}

/**
 * Was es im Zeitraum schon gibt (für die Duplikat-Erkennung): bezahlte Rechnungen und Einnahmen,
 * Ausgaben und Anlagen, SVS-Beiträge – jeweils mit Datum und Bruttobetrag.
 */
export async function fetchExisting(from: string, to: string): Promise<ExistingEntry[]> {
  const [inv, inc, exp, ast, svs] = await Promise.all([
    // Einnahmen ±7 Tage weiter, damit spätere Kontobuchungen erkannt werden (siehe markDuplicates)
    fetchAll((a, b) => supabase.from('invoices').select('total, paid_at, invoice_number').eq('status', 'paid').gte('paid_at', `${shift(from, -7)}T00:00:00`).lte('paid_at', `${shift(to, 7)}T23:59:59.999`).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('incomes').select('amount, income_date, reference').gte('income_date', shift(from, -7)).lte('income_date', shift(to, 7)).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('expenses').select('amount, expense_date').gte('expense_date', from).lte('expense_date', to).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('assets').select('amount, purchase_date').gte('purchase_date', from).lte('purchase_date', to).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('svs_payments').select('amount, payment_date').gte('payment_date', from).lte('payment_date', to).order('id').range(a, b)),
  ]);
  if (inv.error || inc.error || exp.error || ast.error || svs.error) throw new Error('Deine bestehenden Einträge konnten nicht geladen werden.');
  return [
    ...inv.data.map((i) => ({ kind: 'income' as const, date: (i.paid_at ?? '').slice(0, 10), amount: Number(i.total), reference: i.invoice_number })),
    ...inc.data.map((i) => ({ kind: 'income' as const, date: i.income_date, amount: Number(i.amount), reference: i.reference })),
    ...exp.data.map((e) => ({ kind: 'expense' as const, date: e.expense_date, amount: Number(e.amount) })),
    ...ast.data.map((a) => ({ kind: 'expense' as const, date: a.purchase_date, amount: Number(a.amount) })),
    ...svs.data.map((p) => ({ kind: 'svs' as const, date: p.payment_date, amount: Number(p.amount) })),
  ];
}

/** Deine bisherigen Ausgaben als Lernbasis für Kategorie-Vorschläge (ohne Fehler: dann eben ohne Lernen). */
export async function fetchHistory(): Promise<CategoryHistory> {
  const { data } = await fetchAll((a, b) => supabase.from('expenses').select('description, category_label').order('id').range(a, b));
  return buildHistory(data);
}

const CHUNK = 500;

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Speichert einen Import. Schlägt etwas fehl, wird der Import gelöscht – die schon gespeicherten Zeilen
 * verschwinden dank ON DELETE CASCADE mit, es bleibt also nichts halb importiert zurück.
 */
export async function saveImport(sourceName: string, records: ImportRecords, summary: ImportSummary): Promise<{ id: string | null; error: string | null }> {
  const { data: imp, error } = await supabase
    .from('imports')
    .insert({
      source_name: sourceName,
      summary: {
        incomes: summary.incomes.count,
        expenses: summary.expenses.count,
        assets: summary.assets.count,
        svs_payments: summary.svs_payments.count,
      },
    })
    .select('id')
    .single();
  if (error || !imp) return { id: null, error: 'Der Import konnte nicht gestartet werden.' };

  const tables = ['incomes', 'expenses', 'assets', 'svs_payments'] as const;
  for (const table of tables) {
    const rows = records[table].map((r) => ({ ...r, import_id: imp.id }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: err } = await supabase.from(table).insert(rows.slice(i, i + CHUNK) as never);
      if (err) {
        await supabase.from('imports').delete().eq('id', imp.id);
        return { id: null, error: 'Der Import ist fehlgeschlagen – es wurde nichts übernommen. Bitte versuch es noch einmal.' };
      }
    }
  }
  return { id: imp.id, error: null };
}

export async function listImports(): Promise<ImportRecord[]> {
  const { data, error } = await supabase.from('imports').select('*').order('created_at', { ascending: false });
  if (error) throw new Error('Deine bisherigen Importe konnten nicht geladen werden.');
  return data;
}

/** Import rückgängig machen: löscht alle Einträge dieses Imports (auch nachträglich bearbeitete) samt angehängter Belege. */
export async function undoImport(id: string): Promise<{ error: string | null }> {
  const [exp, ast] = await Promise.all([
    supabase.from('expenses').select('receipt_url').eq('import_id', id).not('receipt_url', 'is', null),
    supabase.from('assets').select('receipt_url').eq('import_id', id).not('receipt_url', 'is', null),
  ]);
  // Ohne Liste der Belege nicht löschen – sonst blieben Belegfotos verwaist im Speicher
  if (exp.error || ast.error) return { error: 'Der Import konnte nicht rückgängig gemacht werden.' };
  const { error } = await supabase.from('imports').delete().eq('id', id);
  if (error) return { error: 'Der Import konnte nicht rückgängig gemacht werden.' };
  const receipts = [...(exp.data ?? []), ...(ast.data ?? [])].map((r) => r.receipt_url!);
  await Promise.all(receipts.map(deleteReceipt));
  return { error: null };
}
