import { useEffect, useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Paperclip, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { countsUnder, findCategoryByLabel, type CategoryContext } from '@/constants/expenseCategories';
import { KILOMETERGELD_PER_KM, NAECHTIGUNG_PAUSCHAL, TAGESGELD, VAT_RATES } from '@/constants/tax2026';
import { depreciationSchedule, GWG_LIMIT, USEFUL_LIFE_PRESETS } from '@/lib/assets';
import {
  computeAssetValues,
  computeExpenseValues,
  entryKind,
  findCategory,
  validateExpenseForm,
  validateReceiptFile,
  type ExpenseFormErrors,
  type ExpenseFormInput,
} from '@/lib/expenses';
import { toISODate } from '@/lib/invoices';
import { calculateArbeitsplatzpauschale, otherIncomeAmount } from '@/lib/profit';
import { formatDecimalInput, formatEuro } from '@/lib/money';
import { deleteReceipt, getReceiptUrl, uploadReceipt } from '@/lib/receipts';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Field, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CategoryGrid } from './CategoryGrid';
import type { Asset, AssetInsert, BusinessType, Expense, ExpenseInsert, OtherIncomeKind, PauschType, ProfitMethod, VatRate } from '@/types';

/** Was gerade bearbeitet wird: eine Ausgabe, eine Anlage oder nichts (neu erfassen). */
export type ExpenseEntry = { kind: 'expense'; expense: Expense } | { kind: 'asset'; asset: Asset } | null;

type Result = Promise<{ error: string | null }>;

function vatRateOf(amount: number, net: number | null): VatRate {
  const rate = net ? Math.round((amount / net - 1) * 100) : 0;
  return ((VAT_RATES as readonly number[]).includes(rate) ? rate : 20) as VatRate;
}

function toForm(entry: ExpenseEntry, isKU: boolean): ExpenseFormInput {
  if (!entry) {
    return {
      categoryId: '',
      amount: '',
      km: '',
      hours: '',
      nights: '',
      reimbursed: false,
      vatRate: isKU ? 0 : 20,
      date: toISODate(new Date()),
      description: '',
      spread: null,
      usefulLife: '',
    };
  }
  if (entry.kind === 'asset') {
    const a = entry.asset;
    return {
      categoryId: findCategoryByLabel(a.category_label)?.id ?? 'geraete',
      amount: formatDecimalInput(Number(a.amount)),
      km: '',
      hours: '',
      nights: '',
      reimbursed: false,
      vatRate: vatRateOf(Number(a.amount), a.amount_net === null ? null : Number(a.amount_net)),
      date: a.purchase_date,
      description: a.description,
      spread: true,
      usefulLife: String(a.useful_life_years),
    };
  }
  const e = entry.expense;
  return {
    categoryId: findCategoryByLabel(e.category_label)?.id ?? 'sonstiges',
    // Bei Pauschalen (Kilometergeld, Tagesgeld, Nächtigung) rechnet Klaro den Betrag
    amount: e.km_driven || e.trip_hours || e.nights ? '' : formatDecimalInput(Number(e.amount)),
    km: e.km_driven ? formatDecimalInput(Number(e.km_driven)) : '',
    hours: e.trip_hours ? formatDecimalInput(Number(e.trip_hours)) : '',
    nights: e.nights ? String(e.nights) : '',
    reimbursed: e.reimbursed,
    vatRate: vatRateOf(Number(e.amount), e.amount_net === null ? null : Number(e.amount_net)),
    date: e.expense_date,
    description: e.description,
    // Eine Ausgabe über 1.000 € wurde bewusst sofort abgesetzt
    spread: false,
    usefulLife: '',
  };
}

const CUSTOM_LIFE = 'andere';

/**
 * Ausgabe erfassen bzw. bearbeiten (inkl. Beleg-Upload). Über 1.000 € wird daraus eine Anlage, die Klaro über die
 * Nutzungsdauer abschreibt. Wechselt ein Eintrag die Art (z. B. Betrag geändert), wird er in die andere Tabelle verschoben.
 */
export function ExpenseFormModal({
  open,
  entry,
  onClose,
  onSaveExpense,
  onSaveAsset,
  onDeleteExpense,
  onDeleteAsset,
}: {
  open: boolean;
  entry: ExpenseEntry;
  onClose: () => void;
  onSaveExpense: (values: ExpenseInsert, id?: string) => Result;
  onSaveAsset: (values: AssetInsert, id?: string) => Result;
  onDeleteExpense: (id: string) => Result;
  onDeleteAsset: (id: string) => Result;
}) {
  const { user, profile } = useAuth();
  const isKU = profile?.is_kleinunternehmer ?? true;
  const otherKind = (profile?.other_income_kind ?? null) as OtherIncomeKind | null;
  const context: CategoryContext = {
    businessType: (profile?.business_type as BusinessType | null) ?? null,
    profitMethod: (profile?.profit_method ?? 'euer') as ProfitMethod,
    pauschType: (profile?.pausch_type ?? null) as PauschType | null,
    smallApp:
      calculateArbeitsplatzpauschale({
        homeOffice: profile?.home_office ?? null,
        otherIncomeKind: otherKind,
        otherIncomeAmount: otherIncomeAmount(otherKind, profile?.other_income_amount == null ? null : Number(profile.other_income_amount)),
        year: new Date().getFullYear(),
      }).size === 'klein',
  };
  const pauschal = context.profitMethod === 'pauschal';
  const record = entry?.kind === 'asset' ? entry.asset : (entry?.expense ?? null);
  const existingReceipt = record?.receipt_url ?? null;
  // Direkt mit den Werten initialisieren (Aufrufer setzt key je Eintrag) – kein leeres Aufblitzen
  const [form, setForm] = useState<ExpenseFormInput>(() => toForm(entry, isKU));
  const [customLife, setCustomLife] = useState(() => !!form.usefulLife && !USEFUL_LIFE_PRESETS.some((p) => String(p.years) === form.usefulLife));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = toForm(entry, isKU);
    setForm(initial);
    setCustomLife(!!initial.usefulLife && !USEFUL_LIFE_PRESETS.some((p) => String(p.years) === initial.usefulLife));
    setErrors({});
    setFile(null);
    setFileError(null);
    setRemoveReceipt(false);
  }, [open, entry, isKU]);

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
  const calculated = usesKm || !!category?.calc; // Betrag rechnet Klaro (Kilometergeld, Tagesgeld, Nächtigung)
  // Bei Pauschalierung zählen Reisekosten nur, wenn sie weiterverrechnet werden
  const reimbursedOnly = pauschal && !!category?.pauschalOnlyReimbursed;
  const notCounted = pauschal && !!category && !countsUnder(category, 'pauschal', context.pauschType);
  const kind = entryKind(form, isKU);
  // Die Frage bleibt sichtbar, solange der Betrag über der Grenze liegt – so kann man die Antwort ändern
  const askSpread = category?.asset === 'ask' && entryKind({ ...form, spread: null }, isKU) === 'ask';
  const valid = Object.keys(validateExpenseForm(form, today, isKU)).length === 0;
  const preview = useMemo(() => (valid && kind === 'expense' ? computeExpenseValues(form, isKU) : null), [valid, kind, form, isKU]);
  const plan = useMemo(() => {
    if (!valid || kind !== 'asset') return null;
    const a = computeAssetValues(form, isKU);
    return depreciationSchedule({ cost: a.amount_net ?? a.amount, purchaseDate: form.date, usefulLifeYears: a.useful_life_years });
  }, [valid, kind, form, isKU]);
  const [firstYear, secondYear] = plan ?? [];
  const lastYear = plan?.at(-1);
  const lifeSelectValue = customLife ? CUSTOM_LIFE : form.usefulLife;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateExpenseForm(form, today, isKU);
    setErrors(errs);
    if (Object.keys(errs).length > 0 || fileError || !user) return;

    setSaving(true);
    let receiptPath = removeReceipt ? null : existingReceipt;
    if (file) {
      const upload = await uploadReceipt(file, user.id);
      if ('error' in upload) {
        setSaving(false);
        toast.error(upload.error);
        return;
      }
      receiptPath = upload.path;
    }

    const asAsset = entryKind(form, isKU) === 'asset';
    const sameKind = entry?.kind === (asAsset ? 'asset' : 'expense');
    let result: { error: string | null };
    if (asAsset) {
      const values = computeAssetValues(form, isKU);
      result = await onSaveAsset(
        { ...values, purchase_date: form.date, description: form.description.trim() || values.category_label, receipt_url: receiptPath },
        sameKind ? record?.id : undefined,
      );
    } else {
      const values = computeExpenseValues(form, isKU);
      result = await onSaveExpense(
        { ...values, expense_date: form.date, description: form.description.trim() || values.category_label, receipt_url: receiptPath },
        sameKind ? record?.id : undefined,
      );
    }
    if (result.error) {
      setSaving(false);
      toast.error(result.error);
      if (file && receiptPath) await deleteReceipt(receiptPath);
      return;
    }
    // Art gewechselt: alten Eintrag entfernen (der Beleg gehört jetzt zum neuen)
    if (entry && !sameKind) {
      const removed = entry.kind === 'asset' ? await onDeleteAsset(entry.asset.id) : await onDeleteExpense(entry.expense.id);
      if (removed.error) toast.error(removed.error);
    }
    setSaving(false);
    // Ersetzten/entfernten alten Beleg löschen
    if (existingReceipt && existingReceipt !== receiptPath) await deleteReceipt(existingReceipt);
    toast.success(
      asAsset
        ? `${entry ? 'Gespeichert' : 'Erfasst'} – Klaro verteilt den Kaufpreis auf ${form.usefulLife.trim()} Jahre`
        : entry
          ? 'Ausgabe gespeichert'
          : 'Ausgabe erfasst',
    );
    onClose();
  }

  const formId = 'expense-form';
  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={entry?.kind === 'asset' ? 'Anlage bearbeiten' : entry ? 'Ausgabe bearbeiten' : 'Ausgabe erfassen'}
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
        <CategoryGrid
          value={form.categoryId}
          onChange={(categoryId) => set({ categoryId })}
          error={errors.categoryId}
          context={context}
        />

        {reimbursedOnly && (
          <ChoiceCards<boolean>
            legend="Verrechnest du diese Kosten deiner Kundin oder deinem Kunden weiter?"
            name="reimbursed"
            value={form.reimbursed}
            columns={2}
            onChange={(reimbursed) => set({ reimbursed })}
            options={[
              {
                value: true,
                title: 'Ja, in gleicher Höhe',
                description: 'Dann zählen sie zusätzlich zur Pauschale. Klaro rechnet sie aus dem Umsatz für die Pauschale heraus.',
              },
              { value: false, title: 'Nein', description: 'Dann sind sie im Pauschalsatz schon enthalten und zählen nicht extra.' },
            ]}
          />
        )}
        {(notCounted || (reimbursedOnly && !form.reimbursed)) && (
          <Alert type="warning">Das zählt bei Pauschalierung nicht extra – es ist im Pauschalsatz schon enthalten.</Alert>
        )}

        {category?.calc === 'tagesgeld' && (
          <Field
            label="Wie lange warst du unterwegs? (Stunden)"
            inputMode="decimal"
            placeholder="z. B. 9,5"
            hint={`Von der Abfahrt bis zur Rückkehr. Ab mehr als ${TAGESGELD.minHours} Stunden ${formatEuro(TAGESGELD.perStartedHour)} pro angefangener Stunde, höchstens ${formatEuro(TAGESGELD.perDay)} pro Tag.`}
            value={form.hours}
            error={errors.hours}
            onChange={(e) => set({ hours: e.target.value })}
          />
        )}
        {category?.calc === 'naechtigung' && (
          <Field
            label="Wie viele Nächte?"
            inputMode="numeric"
            placeholder="z. B. 2"
            hint={`${formatEuro(NAECHTIGUNG_PAUSCHAL)} pro Nacht inklusive Frühstück, ohne Beleg.`}
            value={form.nights}
            error={errors.nights}
            onChange={(e) => set({ nights: e.target.value })}
          />
        )}

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
            value={calculated ? (preview ? formatDecimalInput(preview.amount) : '') : form.amount}
            disabled={calculated}
            error={errors.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
          <Field label="Datum" type="date" max={today} value={form.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
        </div>

        {!isKU && !calculated && (
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

        {category?.asset === 'always' && kind === 'asset' && (
          <Alert type="info">
            Über {formatEuro(GWG_LIMIT)} ({isKU ? 'brutto' : 'netto'}) setzt du ein Gerät nicht auf einmal ab. Klaro verteilt den
            Kaufpreis auf die Jahre, in denen du es nutzt. Das nennt man Abschreibung.
          </Alert>
        )}

        {askSpread && (
          <ChoiceCards<boolean>
            legend="Auf mehrere Jahre verteilen?"
            name="spread"
            value={form.spread}
            error={errors.spread}
            onChange={(spread) => set({ spread })}
            options={[
              {
                value: true,
                title: 'Ja, ich nutze es mehrere Jahre',
                description: `Zum Beispiel eine gekaufte Lizenz oder Einrichtung. Über ${formatEuro(GWG_LIMIT)} verteilt Klaro den Kaufpreis dann auf die Nutzungsdauer.`,
              },
              {
                value: false,
                title: 'Nein, sofort absetzen',
                description: 'Zum Beispiel ein Jahresabo, eine Dienstleistung oder Material, das schnell verbraucht ist.',
              },
            ]}
          />
        )}

        {kind === 'asset' && (
          <div className="space-y-3">
            <Select
              label="Wie lange nutzt du es?"
              hint="Die übliche Nutzungsdauer. Klaro verteilt den Kaufpreis gleichmäßig auf diese Jahre."
              value={lifeSelectValue}
              error={customLife ? undefined : errors.usefulLife}
              options={[
                { value: '', label: 'Bitte wählen …' },
                ...USEFUL_LIFE_PRESETS.map((p) => ({ value: String(p.years), label: `${p.label}: ${p.years} Jahre` })),
                { value: CUSTOM_LIFE, label: 'Andere Nutzungsdauer' },
              ]}
              onChange={(e) => {
                const custom = e.target.value === CUSTOM_LIFE;
                setCustomLife(custom);
                set({ usefulLife: custom ? '' : e.target.value });
              }}
            />
            {customLife && (
              <Field
                label="Nutzungsdauer in Jahren"
                inputMode="numeric"
                placeholder="z. B. 4"
                value={form.usefulLife}
                error={errors.usefulLife}
                onChange={(e) => set({ usefulLife: e.target.value })}
              />
            )}
          </div>
        )}

        {firstYear && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="depreciation-preview">
            <p>
              Absetzbar {firstYear.year}: <strong className="tabular-nums">{formatEuro(firstYear.amount)}</strong>
              {secondYear && lastYear && (
                <>
                  {' '}
                  · danach {formatEuro(secondYear.amount)} pro Jahr bis {lastYear.year}
                </>
              )}
            </p>
            {firstYear.half && (
              <p className="mt-1 text-xs text-slate-500">
                Im ersten Jahr nur die Hälfte, weil du es erst ab Juli nutzt. Die andere Hälfte kommt im letzten Jahr.
              </p>
            )}
          </div>
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
          {existingReceipt && !removeReceipt && !file ? (
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                onClick={async () => {
                  const url = await getReceiptUrl(existingReceipt);
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
