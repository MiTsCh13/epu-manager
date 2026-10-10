import { useRef } from 'react';
import { Field } from '@/components/ui/Field';
import { toISODate } from '@/lib/invoices';
import { formatInvoiceNumber, NUMBER_FORMAT_PRESETS, NUMBER_TOKENS, validateNumberFormat } from '@/lib/invoiceNumbers';

/** Format der Rechnungsnummern: fertige Vorschläge zum Anklicken oder eigenes Format mit Bausteinen. */
export function NumberFormatField({ value, error, onChange }: { value: string; error?: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const today = toISODate(new Date());
  const valid = !validateNumberFormat(value);

  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-slate-700">Format deiner Rechnungsnummern</legend>
      <div className="flex flex-wrap gap-1.5">
        {NUMBER_FORMAT_PRESETS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={value === f}
            onClick={() => onChange(f)}
            className={`min-h-[36px] rounded-lg px-3 text-sm font-medium ring-1 ring-inset ${
              value === f ? 'bg-primary-50 text-primary ring-primary' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {formatInvoiceNumber(f, today, 1)}
          </button>
        ))}
      </div>
      <Field
        ref={ref}
        label="Eigenes Format"
        value={value}
        error={error}
        spellCheck={false}
        autoCapitalize="off"
        placeholder="{JJJJ}-{NNN}"
        hint={
          valid ? (
            <>
              Erste Nummer: <strong className="font-semibold text-slate-700">{formatInvoiceNumber(value, today, 1)}</strong>, dann{' '}
              {formatInvoiceNumber(value, today, 2)} … Mit Jahr beginnt die Zählung jedes Jahr neu.
            </>
          ) : undefined
        }
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5" aria-label="Baustein einfügen">
        {NUMBER_TOKENS.map((t) => (
          <button
            key={t.token}
            type="button"
            title={t.hint}
            onClick={() => insert(t.token)}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-primary-50 hover:text-primary"
          >
            + {t.token} <span className="font-normal text-slate-500">{t.hint.split(',')[0]}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
