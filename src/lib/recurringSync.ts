// Wiederkehrende Ausgaben in Supabase: Zahlungen buchen, überspringen, Serien ändern und löschen.
// Doppelte Buchungen verhindert die Datenbank (UNIQUE recurring_id + expense_date) – z. B. bei zwei offenen Tabs.
import toast from 'react-hot-toast';
import type { RecurringExpense, RecurringExpenseInsert, RecurringExpenseUpdate } from '@/types';
import { fetchAll } from './fetchAll';
import { toISODate } from './invoices';
import { deleteReceipt } from './receipts';
import { advance, dueDates } from './recurring';
import { supabase } from './supabase';

type Result = { error: string | null };

export const todayIso = () => toISODate(new Date());

export async function fetchSeries(): Promise<{ data: RecurringExpense[]; error: string | null }> {
  const r = await fetchAll((a, b) => supabase.from('recurring_expenses').select('*').order('next_date').order('id').range(a, b));
  return { data: r.data, error: r.error ? 'Deine wiederkehrenden Ausgaben konnten nicht geladen werden.' : null };
}

const STALE = 'Diese Zahlung wurde inzwischen schon erledigt – die Liste ist jetzt aktuell.';

/**
 * Bucht die Termine `dates` (aufsteigend, ab next_date) einer Serie und schiebt next_date dahinter – in einer
 * Transaktion und nur, wenn next_date noch stimmt. So bucht ein veralteter Stand (zweiter Tab) nichts doppelt
 * und eine gelöschte Zahlung kommt nicht wieder.
 */
async function bookDates(s: RecurringExpense, dates: readonly string[]): Promise<{ id: string | null } & Result> {
  if (dates.length === 0) return { id: null, error: null };
  const { data, error } = await supabase.rpc('book_recurring', {
    p_id: s.id,
    p_expected: s.next_date,
    p_dates: [...dates],
    p_next: advance(s, dates[dates.length - 1]!),
  });
  if (error) return { id: null, error: 'Die Zahlung konnte nicht gebucht werden.' };
  if (!data) return { id: null, error: STALE };
  return { id: data, error: null };
}

/** Nächste fällige Zahlung übernehmen. Liefert die ID der neuen Ausgabe (zum Anpassen). */
export function bookNext(s: RecurringExpense) {
  return bookDates(s, [s.next_date]);
}

/** Alle fälligen Zahlungen einer Serie übernehmen. */
export function bookAllDue(s: RecurringExpense, today = todayIso()) {
  return bookDates(s, dueDates(s, today));
}

/** Nächste fällige Zahlung überspringen (z. B. Abo pausiert, Abbuchung ausgefallen). */
export async function skipNext(s: RecurringExpense): Promise<Result> {
  const { data, error } = await supabase
    .from('recurring_expenses')
    .update({ next_date: advance(s, s.next_date) })
    .eq('id', s.id)
    .eq('next_date', s.next_date)
    .select('id');
  if (error) return { error: 'Die Zahlung konnte nicht übersprungen werden.' };
  return { error: data.length === 0 ? STALE : null };
}

export async function createSeries(values: RecurringExpenseInsert): Promise<{ id: string | null } & Result> {
  const { data, error } = await supabase.from('recurring_expenses').insert(values).select('id').single();
  if (error || !data) return { id: null, error: 'Die wiederkehrende Ausgabe konnte nicht angelegt werden.' };
  resetAutoBooking();
  return { id: data.id, error: null };
}

export async function updateSeries(id: string, values: RecurringExpenseUpdate): Promise<Result> {
  const { error } = await supabase.from('recurring_expenses').update(values).eq('id', id);
  if (error) return { error: 'Die Serie konnte nicht gespeichert werden.' };
  resetAutoBooking();
  return { error: null };
}

/** Serie löschen (in einer Transaktion). Ohne `withBookings` bleiben die bisherigen Zahlungen als normale Ausgaben. */
export async function deleteSeries(id: string, withBookings: boolean): Promise<Result> {
  const { data, error } = await supabase.rpc('delete_recurring', { p_id: id, p_with_bookings: withBookings });
  if (error) return { error: 'Die Serie konnte nicht gelöscht werden.' };
  await Promise.all((data ?? []).flatMap((e) => (e.receipt_url ? [deleteReceipt(e.receipt_url)] : [])));
  return { error: null };
}

// ─── Automatisch buchen ─────────────────────────────────────

let autoRun: { key: string; promise: Promise<number> } | null = null;

/** Nach Änderungen an Serien erneut prüfen (z. B. „automatisch buchen“ gerade eingeschaltet). */
export function resetAutoBooking() {
  autoRun = null;
}

/**
 * Bucht fällige Zahlungen aller Serien mit „automatisch buchen“ – einmal pro Tag und Sitzung, alle Aufrufer
 * warten auf denselben Lauf. Fehler werden still übergangen (dann eben beim nächsten Mal).
 */
export function bookDueRecurring(): Promise<number> {
  const key = todayIso();
  if (autoRun?.key === key) return autoRun.promise;
  const promise = (async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return 0;
    const { data, error } = await fetchSeries();
    let failed = !!error;
    let booked = 0;
    for (const s of data.filter((x) => x.auto_book)) {
      const dates = dueDates(s, key);
      if (!dates.length) continue;
      const r = await bookDates(s, dates);
      if (r.error) failed = true;
      else booked += dates.length;
    }
    // Fehlgeschlagen (z. B. kurz offline): beim nächsten Laden nochmal versuchen; bis dahin erscheinen sie als „fällig“
    if (failed && autoRun?.key === key) autoRun = null;
    if (booked > 0) toast.success(booked === 1 ? 'Klaro hat 1 wiederkehrende Ausgabe gebucht' : `Klaro hat ${booked} wiederkehrende Ausgaben gebucht`);
    return booked;
  })();
  autoRun = { key, promise };
  return promise;
}
