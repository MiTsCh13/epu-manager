import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, optional, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 flex items-center text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy}
        className={`block min-h-[44px] w-full rounded-lg border px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 sm:text-sm ${
          error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-primary focus:ring-primary/20'
        }`}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
});
