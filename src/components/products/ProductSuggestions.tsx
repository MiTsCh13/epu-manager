import { useState } from 'react';
import { Check, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatEuro, parseDecimal } from '@/lib/money';
import type { ProductFormData, ProductSuggestion } from '@/lib/products';

/** Häufige Positionen aus bisherigen Rechnungen – mit Häkchen auswählen und auf einmal übernehmen. */
export function ProductSuggestions({
  suggestions,
  onAdd,
}: {
  suggestions: ProductSuggestion[];
  onAdd: (forms: ProductFormData[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestions.map((s) => s.key)));
  const [busy, setBusy] = useState(false);
  if (suggestions.length === 0) return null;

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function add() {
    setBusy(true);
    const forms = suggestions.filter((s) => selected.has(s.key)).map(({ name, details, unit, unit_price }) => ({ name, details, unit, unit_price }));
    await onAdd(forms);
    setBusy(false);
  }

  const count = suggestions.filter((s) => selected.has(s.key)).length;

  return (
    <section className="rounded-2xl bg-primary-50/60 p-4 ring-1 ring-primary-100 sm:p-5" aria-labelledby="product-suggestions-title">
      <h2 id="product-suggestions-title" className="flex items-center gap-2 font-semibold text-slate-900">
        <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
        Aus deinen bisherigen Rechnungen
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Diese Positionen hast du schon öfter verrechnet. Übernimm sie, dann wählst du sie beim nächsten Mal einfach aus.
      </p>
      <ul className="mt-3 space-y-1">
        {suggestions.map((s) => (
          <li key={s.key}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-white/70">
              <input
                type="checkbox"
                checked={selected.has(s.key)}
                onChange={() => toggle(s.key)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{s.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{s.count}×</span>
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-slate-700">
                {formatEuro(parseDecimal(s.unit_price))}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button className="mt-3" icon={<Check className="h-4 w-4" />} onClick={() => void add()} loading={busy} disabled={count === 0}>
        {count === 1 ? '1 übernehmen' : `${count} übernehmen`}
      </Button>
    </section>
  );
}
