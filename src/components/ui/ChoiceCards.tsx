import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface Choice<T extends string | boolean> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** Große, gut tippbare Radio-Auswahl (mobile-first). */
export function ChoiceCards<T extends string | boolean>({
  legend,
  name,
  value,
  options,
  onChange,
  error,
  columns = 1,
}: {
  legend: ReactNode;
  name: string;
  value: T | null;
  options: Choice<T>[];
  onChange: (value: T) => void;
  error?: string;
  columns?: 1 | 2 | 3;
}) {
  const grid = columns === 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : '';
  return (
    <fieldset>
      <legend className="mb-2 flex items-center text-sm font-medium text-slate-700">{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={String(opt.value)}
              className={`relative flex min-h-[44px] cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                opt.disabled
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                  : selected
                    ? 'border-primary bg-primary-50 ring-1 ring-primary'
                    : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={selected}
                disabled={opt.disabled}
                onChange={() => onChange(opt.value)}
              />
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  selected ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white'
                }`}
                aria-hidden="true"
              >
                {selected && <Check className="h-3 w-3" />}
              </span>
              <span className="text-sm">
                <span className="block font-medium text-slate-900">{opt.title}</span>
                {opt.description && <span className="mt-0.5 block text-slate-500">{opt.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}
