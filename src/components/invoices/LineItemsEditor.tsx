import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { BookmarkPlus, ListPlus, Plus, Trash2 } from 'lucide-react';
import type { LineItemInput, InvoiceFormErrors } from '@/lib/invoices';
import { formatEuro, parseDecimal, round2 } from '@/lib/money';
import { UNIT_SUGGESTIONS } from '@/lib/invoiceTemplates';
import { canSaveAsProduct, productKey, productToLine, searchProducts, splitDescription } from '@/lib/products';
import { ProductPicker } from '@/components/products/ProductPicker';
import { priceLabel } from '@/components/products/ProductList';
import type { Product } from '@/types';

/** productId: aus „Leistungen & Produkte“ übernommen (für „zuletzt verwendet“) – landet nicht auf der Rechnung. */
export type LineItemRow = LineItemInput & { key: string; productId?: string };

const MAX_SUGGESTIONS = 6;

const inputClass = (error?: string) =>
  `block min-h-[44px] w-full rounded-lg border px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 sm:text-sm ${
    error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-primary focus:ring-primary/20'
  }`;

function rowTotal(row: LineItemInput): number {
  const q = parseDecimal(row.quantity);
  const p = parseDecimal(row.unit_price);
  return Number.isNaN(q) || Number.isNaN(p) ? 0 : round2(q * p);
}

export function newRow(): LineItemRow {
  return { key: crypto.randomUUID(), description: '', quantity: '1', unit_price: '', unit: '' };
}

const isBlank = (r: LineItemInput) => !r.description.trim() && !r.unit_price.trim();

export function LineItemsEditor({
  rows,
  onChange,
  errors,
  listError,
  products = [],
  onSaveProduct,
}: {
  rows: LineItemRow[];
  onChange: (rows: LineItemRow[]) => void;
  errors?: InvoiceFormErrors['itemErrors'];
  listError?: string;
  /** Gespeicherte Leistungen & Produkte – Vorschläge beim Tippen und „Aus Liste wählen“ */
  products?: Product[];
  /** „Als Produkt speichern“ – der Aufrufer öffnet das Formular */
  onSaveProduct?: (row: LineItemRow) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const update = (key: string, patch: Partial<LineItemRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Text geändert: Verbindung zum Produkt nur behalten, solange die erste Zeile noch dessen Name ist
  const updateDescription = (row: LineItemRow, description: string) => {
    const product = row.productId ? products.find((p) => p.id === row.productId) : undefined;
    const keep = product && productKey(splitDescription(description).name) === productKey(product.name);
    update(row.key, { description, productId: keep ? row.productId : undefined });
  };

  const applyProduct = (row: LineItemRow, p: Product) =>
    update(row.key, { ...productToLine(p), productId: p.id, quantity: row.quantity.trim() ? row.quantity : '1' });

  // „Aus Liste wählen“: leere letzte Zeile füllen, sonst neue Zeile anhängen
  const pickProduct = (p: Product) => {
    const last = rows[rows.length - 1];
    if (last && isBlank(last)) applyProduct(last, p);
    else onChange([...rows, { ...newRow(), ...productToLine(p), productId: p.id }]);
    setPickerOpen(false);
  };

  return (
    <div>
      {/* Spaltenköpfe nur am Desktop */}
      <datalist id="unit-suggestions">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="mb-1 hidden grid-cols-[1fr_5rem_6rem_7.5rem_6.5rem_2.5rem] gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
        <span>Bezeichnung</span>
        <span>Menge</span>
        <span>Einheit</span>
        <span>Einzelpreis (€)</span>
        <span className="text-right">Summe</span>
        <span />
      </div>
      <ol className="space-y-3 sm:space-y-2">
        {rows.map((row, idx) => {
          const err = errors?.[idx];
          return (
            <li
              key={row.key}
              className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[1fr_5rem_6rem_7.5rem_6.5rem_5.25rem] sm:items-start sm:bg-transparent sm:p-0 sm:ring-0"
            >
              {/* kein <label> drumherum: sonst würde die Vorschlagsliste Teil des Feldnamens */}
              <div className="col-span-3 sm:col-span-1">
                <span id={`${row.key}-desc-label`} className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">
                  Bezeichnung<span className="sr-only"> (Position {idx + 1})</span>
                </span>
                <DescriptionInput
                  row={row}
                  products={products}
                  labelId={`${row.key}-desc-label`}
                  onChange={(description) => updateDescription(row, description)}
                  onPick={(p) => applyProduct(row, p)}
                />
              </div>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Menge<span className="sr-only"> (Position {idx + 1})</span></span>
                <input
                  className={inputClass(err?.quantity)}
                  inputMode="decimal"
                  value={row.quantity}
                  aria-invalid={!!err?.quantity || undefined}
                  onChange={(e) => update(row.key, { quantity: e.target.value })}
                />
                {err?.quantity && <span className="mt-0.5 block text-xs text-red-600">{err.quantity}</span>}
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Einheit<span className="sr-only"> (Position {idx + 1})</span></span>
                <input
                  className={inputClass()}
                  list="unit-suggestions"
                  placeholder="Std."
                  maxLength={20}
                  value={row.unit ?? ''}
                  onChange={(e) => update(row.key, { unit: e.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Einzelpreis in €<span className="sr-only"> (Position {idx + 1})</span></span>
                <input
                  className={inputClass(err?.unit_price)}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={row.unit_price}
                  aria-invalid={!!err?.unit_price || undefined}
                  onChange={(e) => update(row.key, { unit_price: e.target.value })}
                />
                {err?.unit_price && <span className="mt-0.5 block text-xs text-red-600">{err.unit_price}</span>}
              </label>
              <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:block sm:pt-3 sm:text-right">
                <span className="text-xs text-slate-500 sm:hidden">Summe</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{formatEuro(rowTotal(row))}</span>
              </div>
              <div className="flex justify-end gap-1">
                {onSaveProduct && canSaveAsProduct(row, products) && (
                  <button
                    type="button"
                    onClick={() => onSaveProduct(row)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Position ${idx + 1} als Produkt speichern`}
                    title="Als Produkt speichern – beim nächsten Mal einfach auswählen"
                  >
                    <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChange(rows.length > 1 ? rows.filter((r) => r.key !== row.key) : [newRow()])}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  aria-label={`Position ${idx + 1} entfernen`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {listError && <p className="mt-2 text-sm text-red-600">{listError}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onChange([...rows, newRow()])}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Position hinzufügen
        </button>
        {onSaveProduct && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            Aus Liste wählen
          </button>
        )}
      </div>
      <ProductPicker open={pickerOpen} products={products} onClose={() => setPickerOpen(false)} onPick={pickProduct} />
    </div>
  );
}

/**
 * Bezeichnung mit Vorschlägen aus „Leistungen & Produkte“ (Combobox). Leeres Feld → zuletzt verwendete,
 * sonst Treffer zur ersten Zeile. Pfeiltasten + Enter wählen, Esc schließt; ohne Auswahl macht Enter eine neue Zeile.
 */
function DescriptionInput({
  row,
  products,
  labelId,
  onChange,
  onPick,
}: {
  row: LineItemRow;
  products: Product[];
  labelId: string;
  onChange: (description: string) => void;
  onPick: (p: Product) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const firstLine = splitDescription(row.description).name;
  const matches = useMemo(() => {
    // Mehrzeilig getippt oder schon übernommen → keine Vorschläge mehr
    if (row.productId || row.description.includes('\n')) return [];
    return searchProducts(products, firstLine).slice(0, MAX_SUGGESTIONS);
  }, [products, firstLine, row.productId, row.description]);
  const show = open && matches.length > 0;
  const recent = !firstLine && matches.some((p) => p.last_used_at);

  const pick = (p: Product) => {
    onPick(p);
    setOpen(false);
    setActive(-1);
  };

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!show || e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0 && matches[active]) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      {/* Mehrzeilig: Zeilen mit „-“ werden auf der Rechnung zu Aufzählungspunkten */}
      <textarea
        className={`${inputClass()} resize-none`}
        rows={Math.min(6, Math.max(1, row.description.split('\n').length))}
        placeholder={products.length > 0 ? 'Tippen oder Produkt wählen …' : 'z. B. Website-Gestaltung'}
        title="Mehrere Zeilen möglich – „- “ am Zeilenanfang wird auf der Rechnung ein Aufzählungspunkt"
        value={row.description}
        aria-labelledby={labelId}
        role={products.length > 0 ? 'combobox' : undefined}
        aria-autocomplete={products.length > 0 ? 'list' : undefined}
        aria-expanded={products.length > 0 ? show : undefined}
        aria-controls={show ? listId : undefined}
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label={recent ? 'Zuletzt verwendet' : 'Leistungen und Produkte'}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          {recent && <li className="px-3 pb-1 pt-1.5 text-xs font-medium text-slate-500" aria-hidden="true">Zuletzt verwendet</li>}
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown statt click: sonst verliert das Textfeld vorher den Fokus und die Liste ist weg
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                i === active ? 'bg-primary-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="min-w-0 truncate text-slate-900">{p.name}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{priceLabel(p)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
