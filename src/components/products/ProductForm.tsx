import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { UNIT_SUGGESTIONS } from '@/lib/invoiceTemplates';
import {
  EMPTY_PRODUCT_FORM,
  PRODUCT_DETAILS_MAX,
  PRODUCT_UNIT_MAX,
  productToForm,
  validateProduct,
  type ProductFormData,
  type ProductFormErrors,
} from '@/lib/products';
import type { Product } from '@/types';

/**
 * Produkt anlegen oder bearbeiten (Modal). `product = null` → neues Produkt, optional vorbefüllt mit `initial`
 * (z. B. „Als Produkt speichern“ aus dem Rechnungs-Editor). `others` = bestehende Produkte gegen Doppelte.
 */
export function ProductFormModal({
  open,
  product,
  initial,
  others,
  onClose,
  onSubmit,
}: {
  open: boolean;
  product: Product | null;
  initial?: ProductFormData;
  others: Product[];
  onClose: () => void;
  onSubmit: (data: ProductFormData) => Promise<boolean>;
}) {
  const { profile } = useAuth();
  const start = product ? productToForm(product) : (initial ?? EMPTY_PRODUCT_FORM);
  const [form, setForm] = useState<ProductFormData>(start);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(product ? productToForm(product) : (initial ?? EMPTY_PRODUCT_FORM));
      setErrors({});
    }
  }, [open, product, initial]);

  const set = (patch: Partial<ProductFormData>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof ProductFormData)[]) delete next[k];
      return next;
    });
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateProduct(form, others.filter((p) => p.id !== product?.id));
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    const ok = await onSubmit(form);
    setSaving(false);
    if (ok) onClose();
  }

  const formId = 'product-form';
  const isKU = profile?.is_kleinunternehmer ?? false;

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={product ? 'Produkt bearbeiten' : 'Neue Leistung / neues Produkt'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {product ? 'Änderungen speichern' : 'Speichern'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          label="Bezeichnung"
          placeholder="z. B. Beratung, Website-Wartung, DJ-Set 4 Stunden"
          hint="So steht es auf der Rechnung."
          maxLength={200}
          value={form.name}
          error={errors.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <TextArea
          label="Weitere Zeilen"
          optional
          rows={3}
          maxLength={PRODUCT_DETAILS_MAX}
          hint="Erscheinen unter der Bezeichnung. „- “ am Zeilenanfang wird ein Aufzählungspunkt."
          value={form.details}
          error={errors.details}
          onChange={(e) => set({ details: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Einheit"
            optional
            list="product-unit-suggestions"
            placeholder="Std."
            maxLength={PRODUCT_UNIT_MAX}
            value={form.unit}
            error={errors.unit}
            onChange={(e) => set({ unit: e.target.value })}
          />
          <Field
            label={isKU ? 'Preis pro Einheit (€)' : 'Preis pro Einheit netto (€)'}
            inputMode="decimal"
            placeholder="0,00"
            value={form.unit_price}
            error={errors.unit_price}
            onChange={(e) => set({ unit_price: e.target.value })}
          />
        </div>
        <datalist id="product-unit-suggestions">
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <p className="text-xs text-slate-500">
          Änderungen gelten für neue Rechnungen. Bestehende Rechnungen bleiben, wie sie sind.
        </p>
      </form>
    </Modal>
  );
}
