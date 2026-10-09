import { useCallback, useEffect, useMemo, useState } from 'react';
import { dueDates } from '@/lib/recurring';
import { bookDueRecurring, fetchSeries, todayIso } from '@/lib/recurringSync';
import type { RecurringExpense } from '@/types';

export interface DueSeries {
  series: RecurringExpense;
  dates: string[]; // fällige Termine, ältester zuerst
}

/** Alle wiederkehrenden Ausgaben und was davon fällig ist. Serien mit „automatisch buchen“ sind hier nur, wenn das Buchen scheiterte. */
export function useRecurring() {
  const [series, setSeries] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    await bookDueRecurring();
    const r = await fetchSeries();
    setError(r.error);
    if (!r.error) setSeries(r.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayIso();
  const due = useMemo<DueSeries[]>(
    () =>
      series
        .map((s) => ({ series: s, dates: dueDates(s, today) }))
        .filter((d) => d.dates.length > 0),
    [series, today],
  );
  const byId = useMemo(() => new Map(series.map((s) => [s.id, s])), [series]);

  return { series, due, byId, loading, error, reload: load };
}
