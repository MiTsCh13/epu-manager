// Aufteilung der Einnahmen: Ausgaben, SVS, Einkommensteuer und was bleibt (für den Balken im Tracker)
import type { BreakdownColumn } from './svsTracker';

export type IncomeSplitKey = 'expenses' | 'svs' | 'incomeTax' | 'remaining';

export interface IncomeSplitSegment {
  key: IncomeSplitKey;
  value: number;
  /** Anteil an den Einnahmen (0–1) */
  share: number;
}

export interface IncomeSplit {
  revenue: number;
  segments: IncomeSplitSegment[];
  /** Kosten höher als die Einnahmen – es bleibt nichts */
  deficit: boolean;
}

const ORDER: IncomeSplitKey[] = ['expenses', 'svs', 'incomeTax', 'remaining'];

/** Einnahmen = Ausgaben + SVS + Einkommensteuer + was bleibt. Ohne Einnahmen: null. */
export function buildIncomeSplit(column: BreakdownColumn): IncomeSplit | null {
  if (column.revenue <= 0) return null;
  const values: Record<IncomeSplitKey, number> = {
    expenses: Math.max(0, column.expenses),
    svs: Math.max(0, column.svs),
    incomeTax: Math.max(0, column.incomeTax),
    remaining: Math.max(0, column.remaining),
  };
  // Bei einem Verlust übersteigen die Abzüge die Einnahmen – dann auf die Summe der Teile skalieren
  const total = Math.max(column.revenue, ORDER.reduce((sum, k) => sum + values[k], 0));
  return {
    revenue: column.revenue,
    segments: ORDER.map((key) => ({ key, value: values[key], share: values[key] / total })),
    deficit: column.remaining < 0,
  };
}
