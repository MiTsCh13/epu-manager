import { useEffect, useState, type FormEvent } from 'react';
import { COUNTRIES } from '@/constants/countries';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Term } from '@/components/ui/Tooltip';
import { EMPTY_CLIENT_FORM, validateClient, type ClientFormData, type ClientFormErrors } from '@/lib/validation';
import type { Client } from '@/types';

function toForm(client: Client | null): ClientFormData {
  if (!client) return EMPTY_CLIENT_FORM;
  return {
    name: client.name,
    email: client.email ?? '',
    phone: client.phone ?? '',
    address: client.address ?? '',
    zip_code: client.zip_code ?? '',
    city: client.city ?? '',
    country: client.country || 'AT',
    uid_number: client.uid_number ?? '',
    notes: client.notes ?? '',
  };
}

/** Kunde anlegen oder bearbeiten (Modal). `client = null` → neuer Kunde. */
export function ClientFormModal({
  open,
  client,
  onClose,
  onSubmit,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSubmit: (data: ClientFormData) => Promise<boolean>;
}) {
  const [form, setForm] = useState<ClientFormData>(EMPTY_CLIENT_FORM);
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(toForm(client));
      setErrors({});
    }
  }, [open, client]);

  const set = (patch: Partial<ClientFormData>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof ClientFormData)[]) delete next[k];
      return next;
    });
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateClient(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    const ok = await onSubmit(form);
    setSaving(false);
    if (ok) onClose();
  }

  const formId = 'client-form';

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={client ? 'Kunde bearbeiten' : 'Neuer Kunde'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {client ? 'Änderungen speichern' : 'Kunde anlegen'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          label="Name bzw. Firma"
          autoComplete="organization"
          value={form.name}
          error={errors.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <Field
          label="E-Mail"
          optional
          type="email"
          inputMode="email"
          autoComplete="email"
          value={form.email}
          error={errors.email}
          onChange={(e) => set({ email: e.target.value })}
        />
        <Field
          label="Telefon"
          optional
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+43 660 1234567"
          value={form.phone}
          error={errors.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <Field
          label="Straße und Hausnummer"
          optional
          hint="Auf Rechnungen über 400 € muss die Anschrift deines Kunden stehen."
          autoComplete="street-address"
          value={form.address}
          error={errors.address}
          onChange={(e) => set({ address: e.target.value })}
        />
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field
            label="PLZ"
            optional
            autoComplete="postal-code"
            value={form.zip_code}
            error={errors.zip_code}
            onChange={(e) => set({ zip_code: e.target.value })}
          />
          <Field
            label="Ort"
            optional
            autoComplete="address-level2"
            value={form.city}
            error={errors.city}
            onChange={(e) => set({ city: e.target.value })}
          />
        </div>
        <Select label="Land" value={form.country} options={COUNTRIES} onChange={(e) => set({ country: e.target.value })} />
        <Field
          label={<Term k="uid" />}
          optional
          placeholder="ATU12345678"
          hint="Nur bei Firmen. Pflicht auf Rechnungen über 10.000 €."
          value={form.uid_number}
          error={errors.uid_number}
          onChange={(e) => set({ uid_number: e.target.value })}
        />
        <TextArea
          label="Notizen"
          optional
          hint="Nur für dich – erscheint nicht auf Rechnungen."
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </form>
    </Modal>
  );
}
