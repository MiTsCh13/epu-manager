import { useEffect, useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Paperclip, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { findCategoryByLabel } from '@/constants/expenseCategories';
import { KILOMETERGELD_PER_KM, VAT_RATES } from '@/constants/tax2026';
import {
  computeExpenseValues,
  findCategory,
  validateExpenseForm,
  validateReceiptFile,
  type ExpenseFormErrors,
  type ExpenseFormInput,
} from '@/lib/expenses';
import { toISODate } from '@/lib/invoices';
import { formatDecimalInput, formatEuro } from '@/lib/money';
import { deleteReceipt, getReceiptUrl, uploadReceipt } from '@/lib/receipts';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CategoryGrid } from './CategoryGrid';
import type { Expense, ExpenseInsert, VatRate } from '@/types';

function toForm(expense: Expense | null, isKU: boolean): ExpenseFormInput {
  if (!expense) {
    return { categoryId: '', amount: '', km: '', vatRate: isKU ? 0 : 20, date: toISODate(new Date()), description: '' };
  }
  const net = expense.amount_net === null ? null : Number(expense.amount_net);
  const rate = net ? Math.round((Number(expense.amount) / net - 1) * 100) : 0;
  return {
    categoryId: findCategoryByLabel(expense.category_label)?.id ?? 'sonstiges',
    amount: expense.km_driven ? '' : formatDecimalInput(Number(expense.amount)),
    km: expense.km_driven ? formatDecimalInput(Number(expense.km_driven)) : '',
    vatRate: ((VAT_RATES as readonly number[]).includes(rate) ? rate : 20) as VatRate,
    date: expense.expense_date,
    description: expense.description,
  };
}

/** Ausgabe erfassen bzw. bearbeiten (inkl. Beleg-Upload). */
export function ExpenseFormModal({
  open,
  expense,
  onClose,
  onSave,
}: {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSave: (values: ExpenseInsert, id?: string) => Promise<{ error: string | null }>;
}) {
  const { user, profile } = useAuth();
  const isKU = profile?.is_kleinunternehmer ?? true;
  // Direkt mit den Werten initialisieren (Aufrufer setzt key je Ausgabe) – kein leeres Aufblitzen
  const [form, setForm] = useState<ExpenseFormInput>(() => toForm(expense, isKU));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(expense, isKU));
    setErrors({});
    setFile(null);
    setFileError(null);
    setRemoveReceipt(false);
  }, [open, expense, isKU]);

  const set = (patch: Partial<ExpenseFormInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof ExpenseFormErrors)[]) delete next[k];
      return next;
    });
  };

  const today = toISODate(new Date());
  const category = findCategory(form.categoryId);
  const usesKm = !!category?.hasKm && form.km.trim() !== '';
  const preview = useMemo(
    () => (Object.keys(validateExpenseForm(form, today)).length === 0 ? computeExpenseValues(form, isKU) : null),
    [form, today, isKU],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateExpenseForm(form, today);
    setErrors(errs);
    if (Object.keys(errs).length > 0 || fileError || !user) return;

    setSaving(true);
    let receiptPath = removeReceipt ? null : (expense?.receipt_url ?? null);
    if (file) {
      const upload = await uploadReceipt(file, user.id);
      if ('error' in upload) {
        setSaving(false);
        toast.error(upload.error);
        return;
      }
      receiptPath = upload.path;
    }

    const values = computeExpenseValues(form, isKU);
    const result = await onSave(
      { ...values, expense_date: form.date, description: form.description.trim() || values.category_label, receipt_url: receiptPath },
      expense?.id,
    );
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      if (file && receiptPath) await deleteReceipt(receiptPath);
      return;
    }
    // Ersetzten/entfernten alten Beleg löschen
    if (expense?.receipt_url && expense.receipt_url !== receiptPath) await deleteReceipt(expense.receipt_url);
    toast.success(expense ? 'Ausgabe gespeichert' : 'Ausgabe erfasst');
    onClose();
  }

  const formId = 'expense-form';
  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={expense ? 'Ausgabe bearbeiten' : 'Ausgabe erfassen'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-5">
        <CategoryGrid value={form.categoryId} onChange={(categoryId) => set({ categoryId })} error={errors.categoryId} />

        {category?.hasKm && (
          <Field
            label="Gefahrene Kilometer"
            optional
            inputMode="decimal"
            placeholder="z. B. 180"
            hint={`Mit eigenem Auto? Dann gilt das Kilometergeld: ${formatEuro(KILOMETERGELD_PER_KM)} pro km. Für Tickets einfach den Betrag eingeben.`}
            value={form.km}
            error={errors.km}
            onChange={(e) => set({ km: e.target.value })}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Betrag (brutto, €)"
            inputMode="decimal"
            placeholder="0,00"
            value={usesKm ? (preview ? formatDecimalInput(preview.amount) : '') : form.amount}
            disabled={usesKm}
            error={errors.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
          <Field label="Datum" type="date" max={today} value={form.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
        </div>

        {!isKU && !usesKm && (
          <Select
            label="Enthaltene Umsatzsteuer"
            hint="Die Vorsteuer holst du dir vom Finanzamt zurück – absetzbar ist der Nettobetrag."
            value={String(form.vatRate)}
            options={VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }))}
            onChange={(e) => set({ vatRate: Number(e.target.value) as VatRate })}
          />
        )}

        {category?.isBewirtung && (
          <Alert type="info">
            Geschäftsessen sind nur zur Hälfte absetzbar. Klaro speichert den vollen Betrag und rechnet automatisch mit 50 %.
          </Alert>
        )}

        {preview && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="deductible-preview">
            Absetzbar: <strong className="tabular-nums">{formatEuro(preview.deductible_amount)}</strong>
            {preview.deductible_amount !== preview.amount && <span className="text-slate-500"> von {formatEuro(preview.amount)}</span>}
          </p>
        )}

        <Field
          label="Beschreibung"
          optional
          placeholder={category ? `z. B. ${category.label}` : 'Wofür war die Ausgabe?'}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Beleg <span className="font-normal text-slate-400">(optional)</span>
          </span>
          {expense?.receipt_url && !removeReceipt && !file ? (
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                onClick={async () => {
                  const url = await getReceiptUrl(expense.receipt_url!);
                  if (url) window.open(url, '_blank', 'noopener');
                  else toast.error('Beleg konnte nicht geöffnet werden.');
                }}
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                Beleg ansehen
              </button>
              <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setRemoveReceipt(true)}>
                entfernen
              </button>
            </div>
          ) : file ? (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button type="button" aria-label="Beleg entfernen" onClick={() => setFile(null)} className="text-slate-500 hover:text-red-600">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-600 hover:border-primary hover:text-primary">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              Foto oder PDF hinzufügen
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  // Große Fotos werden vor dem Upload verkleinert → erst danach 5-MB-Grenze prüfen (nur PDFs streng)
                  const err = validateReceiptFile(f.type.startsWith('image/') ? { ...f, type: f.type, size: Math.min(f.size, 1) } : f);
                  setFileError(err);
                  if (!err) setFile(f);
                }}
              />
            </label>
          )}
          {fileError && <p className="mt-1 text-sm text-red-600">{fileError}</p>}
        </div>
      </form>
    </Modal>
  );
}
