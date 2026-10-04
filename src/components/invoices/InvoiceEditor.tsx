import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Eye, Plus, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useClients } from '@/hooks/useClients';
import { invoiceErrorMessage } from '@/hooks/useInvoices';
import { supabase } from '@/lib/supabase';
import { getAccessState } from '@/lib/subscription';
import {
  addDays,
  DEFAULT_PAYMENT_DAYS,
  hasFormErrors,
  invoiceYear,
  parseLineItems,
  toISODate,
  validateInvoiceForm,
  type InvoiceFormErrors,
} from '@/lib/invoices';
import { formatDecimalInput, formatEuro } from '@/lib/money';
import { calculateInvoiceTotals, generateInvoiceNumber, validateInvoiceUStG11 } from '@/lib/tax';
import type { ClientFormData } from '@/lib/validation';
import { KLEINUNTERNEHMER_NOTE, VAT_RATES } from '@/constants/tax2026';
import { countryName } from '@/constants/countries';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { ClientFormModal } from '@/components/clients/ClientForm';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Term } from '@/components/ui/Tooltip';
import { LineItemsEditor, newRow, type LineItemRow } from './LineItemsEditor';
import { PdfPreviewModal } from './PdfPreviewModal';
import type { Invoice, InvoiceNumberFormat, LineItem, VatRate } from '@/types';

interface FormState {
  clientId: string;
  invoiceNumber: string;
  numberTouched: boolean;
  invoiceDate: string;
  dueDate: string;
  dueTouched: boolean;
  serviceFrom: string;
  serviceTouched: boolean;
  serviceTo: string;
  isPeriod: boolean;
  isHonorarnote: boolean;
  rows: LineItemRow[];
  vatRate: VatRate;
  notes: string;
  footer: string;
}

function initialState(invoice: Invoice | null, footerDefault: string, isKU: boolean): FormState {
  const today = toISODate(new Date());
  if (!invoice) {
    return {
      clientId: '',
      invoiceNumber: '',
      numberTouched: false,
      invoiceDate: today,
      dueDate: addDays(today, DEFAULT_PAYMENT_DAYS),
      dueTouched: false,
      serviceFrom: today,
      serviceTouched: false,
      serviceTo: '',
      isPeriod: false,
      isHonorarnote: false,
      rows: [newRow()],
      vatRate: isKU ? 0 : 20,
      notes: '',
      footer: footerDefault,
    };
  }
  const items = (invoice.line_items as unknown as LineItem[]) ?? [];
  return {
    clientId: invoice.client_id ?? '',
    invoiceNumber: invoice.invoice_number,
    numberTouched: true,
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date ?? '',
    dueTouched: true,
    serviceFrom: invoice.service_date_from ?? invoice.invoice_date,
    serviceTouched: true,
    serviceTo: invoice.service_date_to ?? '',
    isPeriod: !!invoice.service_date_to,
    isHonorarnote: invoice.is_honorarnote,
    rows: items.length
      ? items.map((i) => ({
          key: crypto.randomUUID(),
          description: i.description,
          quantity: formatDecimalInput(i.quantity),
          unit_price: formatDecimalInput(i.unit_price),
        }))
      : [newRow()],
    vatRate: Number(invoice.vat_rate) as VatRate,
    notes: invoice.notes ?? '',
    footer: invoice.footer_text ?? '',
  };
}

/** Neue Rechnung bzw. Entwurf bearbeiten. Ausgestellte Rechnungen zeigt InvoiceDetail. */
export function InvoiceEditor({ invoice }: { invoice: Invoice | null }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isKU = profile?.is_kleinunternehmer ?? true;
  const expired = !!profile && getAccessState(profile).kind === 'expired';
  const { clients, loading: clientsLoading, create: createClient } = useClients();

  const [form, setForm] = useState<FormState>(() => initialState(invoice, profile?.invoice_footer_text ?? '', isKU));
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const [ustErrors, setUstErrors] = useState<string[]>([]);
  const [ustWarnings, setUstWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState<'draft' | 'sent' | 'delete' | 'pdf' | null>(null);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [yearNumbers, setYearNumbers] = useState<{ year: number; numbers: string[] } | null>(null);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Bestehende Nummern des Rechnungsjahres laden → nächste fortlaufende Nummer vorschlagen
  const year = invoiceYear(form.invoiceDate || toISODate(new Date()));
  useEffect(() => {
    if (invoice || yearNumbers?.year === year) return;
    let cancelled = false;
    void supabase
      .from('invoices')
      .select('invoice_number')
      .gte('invoice_date', `${year}-01-01`)
      .lte('invoice_date', `${year}-12-31`)
      .then(({ data }) => {
        if (!cancelled) setYearNumbers({ year, numbers: (data ?? []).map((d) => d.invoice_number) });
      });
    return () => {
      cancelled = true;
    };
  }, [invoice, year, yearNumbers?.year]);

  useEffect(() => {
    if (!yearNumbers || form.numberTouched) return;
    const format = (profile?.invoice_number_format ?? 'YYYY-NNN') as InvoiceNumberFormat;
    set({ invoiceNumber: generateInvoiceNumber(format, yearNumbers.year, yearNumbers.numbers) });
    // Wurde schon vor dem Laden der Nummer geprüft, die Fehlermeldung wieder ausblenden
    setErrors((e) => ({ ...e, invoiceNumber: undefined }));
  }, [yearNumbers, form.numberTouched, profile?.invoice_number_format]);

  const lineItems = useMemo(() => parseLineItems(form.rows), [form.rows]);
  const totals = useMemo(
    () => calculateInvoiceTotals({ lineItems, vatRate: form.vatRate, isKleinunternehmer: isKU }),
    [lineItems, form.vatRate, isKU],
  );
  const client = clients.find((c) => c.id === form.clientId) ?? null;

  function onInvoiceDateChange(date: string) {
    set({
      invoiceDate: date,
      ...(!form.dueTouched && date && { dueDate: addDays(date, DEFAULT_PAYMENT_DAYS) }),
      ...(!form.serviceTouched && { serviceFrom: date }),
    });
  }

  function payload(status: 'draft' | 'sent') {
    return {
      client_id: form.clientId || null,
      invoice_number: form.invoiceNumber.trim(),
      invoice_date: form.invoiceDate,
      due_date: form.dueDate || null,
      service_date_from: form.serviceFrom || null,
      service_date_to: form.isPeriod && form.serviceTo ? form.serviceTo : null,
      is_honorarnote: form.isHonorarnote,
      line_items: lineItems as unknown as Invoice['line_items'],
      vat_rate: totals.vatRate,
      subtotal: totals.subtotal,
      vat_amount: totals.vatAmount,
      total: totals.total,
      notes: form.notes.trim() || null,
      footer_text: form.footer.trim() || null,
      status,
    };
  }

  function validateForm(): boolean {
    const e = validateInvoiceForm({
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      serviceFrom: form.serviceFrom,
      serviceTo: form.isPeriod ? form.serviceTo : '',
      items: form.rows,
    });
    setErrors(e);
    return !hasFormErrors(e);
  }

  /** Speichert und liefert die gespeicherte Zeile (null bei Fehler). */
  async function persist(status: 'draft' | 'sent'): Promise<Invoice | null> {
    const data = payload(status);
    const { data: saved, error } = invoice
      ? await supabase.from('invoices').update(data).eq('id', invoice.id).select().single()
      : await supabase.from('invoices').insert(data).select().single();
    if (error) {
      toast.error(invoiceErrorMessage(error, 'Die Rechnung konnte nicht gespeichert werden.'));
      return null;
    }
    return saved;
  }

  async function save(status: 'draft' | 'sent') {
    setSaving(status);
    const saved = await persist(status);
    setSaving(null);
    if (!saved) return;
    if (status === 'draft') {
      toast.success('Entwurf gespeichert');
      if (!invoice) navigate(`/rechnungen/${saved.id}`, { replace: true });
    } else {
      toast.success(`${form.invoiceNumber} ausgestellt`);
      navigate(`/rechnungen/${saved.id}`, { replace: true, state: { refreshed: Date.now() } });
    }
  }

  /** Entwurf speichern und PDF-Vorschau (mit Wasserzeichen „ENTWURF“) öffnen. */
  async function handlePreview() {
    setUstErrors([]);
    if (!validateForm()) return;
    setSaving('pdf');
    const saved = await persist('draft');
    setSaving(null);
    if (saved) setPreview(saved);
  }

  function handleSaveDraft() {
    setUstErrors([]);
    if (validateForm()) void save('draft');
  }

  function handleIssue() {
    if (!validateForm()) {
      setUstErrors([]);
      return;
    }
    const check = validateInvoiceUStG11({
      issuer: {
        name: profile?.business_name || profile?.full_name,
        address: profile?.address,
        zip_code: profile?.zip_code,
        city: profile?.city,
        uid_number: profile?.uid_number,
        iban: profile?.iban,
        isKleinunternehmer: isKU,
      },
      recipient: client,
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      serviceDate: form.serviceFrom,
      lineItems,
      total: totals.total,
    });
    setUstErrors(check.errors);
    setUstWarnings(check.warnings);
    if (check.valid) setConfirmIssue(true);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete() {
    if (!invoice) return;
    setSaving('delete');
    const { data, error } = await supabase.from('invoices').delete().eq('id', invoice.id).eq('status', 'draft').select('id');
    setSaving(null);
    if (error || data.length === 0) {
      toast.error('Der Entwurf konnte nicht gelöscht werden.');
      return;
    }
    toast.success('Entwurf gelöscht');
    navigate('/rechnungen', { replace: true });
  }

  async function handleCreateClient(data: ClientFormData): Promise<boolean> {
    const result = await createClient(data);
    if (result.error !== null) {
      toast.error(result.error);
      return false;
    }
    set({ clientId: result.data.id });
    toast.success(`${result.data.name} angelegt`);
    return true;
  }

  const docLabel = form.isHonorarnote ? 'Honorarnote' : 'Rechnung';
  const clientOptions = [
    { value: '', label: clientsLoading ? 'Kunden werden geladen …' : 'Kunde auswählen …' },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];
  const clientAddress = client && [client.address, [client.zip_code, client.city].filter(Boolean).join(' '), client.country !== 'AT' ? countryName(client.country) : '']
    .filter(Boolean)
    .join(', ');

  return (
    <PageWrapper
      title={invoice ? `Entwurf ${invoice.invoice_number}` : `Neue ${docLabel}`}
      description="Klaro prüft alle Pflichtangaben nach § 11 UStG, bevor du die Rechnung ausstellst."
      actions={
        <Link to="/rechnungen" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Alle Rechnungen
        </Link>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveDraft();
        }}
        className="space-y-6 pb-24 lg:pb-0"
      >
        {expired && (
          <Alert type="warning" title="Deine Testphase ist abgelaufen">
            Entwürfe kannst du weiter bearbeiten. Zum Ausstellen brauchst du{' '}
            <Link to="/einstellungen" className="font-semibold underline">
              Klaro Pro
            </Link>
            .
          </Alert>
        )}

        {ustErrors.length > 0 && (
          <Alert type="critical" title="Bevor du die Rechnung ausstellen kannst, fehlt noch:">
            <ul className="list-disc space-y-0.5 pl-5">
              {ustErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            {ustErrors.some((e) => e.startsWith('Dein') || e.startsWith('Deine') || e.startsWith('IBAN')) && (
              <p className="mt-2">
                Deine eigenen Angaben ergänzt du in den{' '}
                <Link to="/einstellungen" className="font-semibold underline">
                  Einstellungen
                </Link>
                .
              </p>
            )}
          </Alert>
        )}

        {/* Art + Kunde */}
        <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
          <div role="radiogroup" aria-label="Art des Dokuments" className="inline-flex rounded-lg bg-slate-100 p-1">
            {[
              { value: false, label: 'Rechnung' },
              { value: true, label: 'Honorarnote' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={form.isHonorarnote === opt.value}
                onClick={() => set({ isHonorarnote: opt.value })}
                className={`min-h-[40px] rounded-md px-4 text-sm font-medium transition-colors ${
                  form.isHonorarnote === opt.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Honorarnote ist die übliche Bezeichnung bei freiberuflicher Tätigkeit (z. B. Vortragende, Therapeut:innen) –
            rechtlich gelten dieselben Regeln.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Select
              className="flex-1"
              label="Kunde"
              value={form.clientId}
              options={clientOptions}
              onChange={(e) => set({ clientId: e.target.value })}
            />
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setClientModal(true)}>
              Neuer Kunde
            </Button>
          </div>
          {client && (
            <p className="text-sm text-slate-600">
              {clientAddress || <span className="text-amber-700">Keine Adresse hinterlegt – bei Rechnungen über 400 € Pflicht.</span>}
              {client.uid_number && <span className="text-slate-500"> · {client.uid_number}</span>}
            </p>
          )}
        </section>

        {/* Nummer + Daten */}
        <section className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          <Field
            label={`${docLabel}snummer`}
            value={form.invoiceNumber}
            error={errors.invoiceNumber}
            hint="Fortlaufend vergeben – du kannst sie anpassen."
            onChange={(e) => set({ invoiceNumber: e.target.value, numberTouched: true })}
          />
          <Field
            label="Rechnungsdatum"
            type="date"
            value={form.invoiceDate}
            error={errors.invoiceDate}
            onChange={(e) => onInvoiceDateChange(e.target.value)}
          />
          <Field
            label="Zahlbar bis"
            type="date"
            value={form.dueDate}
            error={errors.dueDate}
            hint={`Standard: ${DEFAULT_PAYMENT_DAYS} Tage`}
            onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Leistungsdatum</span>
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  checked={form.isPeriod}
                  onChange={(e) => set({ isPeriod: e.target.checked })}
                />
                Zeitraum
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={form.isPeriod ? 'Von' : 'Tag der Leistung'}
                type="date"
                value={form.serviceFrom}
                hint="Pflichtangabe: wann du die Leistung erbracht hast."
                onChange={(e) => set({ serviceFrom: e.target.value, serviceTouched: true })}
              />
              {form.isPeriod && (
                <Field
                  label="Bis"
                  type="date"
                  value={form.serviceTo}
                  error={errors.serviceTo}
                  onChange={(e) => set({ serviceTo: e.target.value })}
                />
              )}
            </div>
          </div>
        </section>

        {/* Positionen */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Positionen</h2>
          <LineItemsEditor
            rows={form.rows}
            onChange={(rows) => set({ rows })}
            errors={errors.itemErrors}
            listError={errors.items}
          />

          <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="sm:max-w-xs">
              {isKU ? (
                <Alert type="info">
                  <Term k="kleinunternehmer">Als Kleinunternehmer</Term> verrechnest du keine USt. Auf der Rechnung steht
                  automatisch: „{KLEINUNTERNEHMER_NOTE}“
                </Alert>
              ) : (
                <Select
                  label="Umsatzsteuer"
                  value={String(form.vatRate)}
                  options={VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }))}
                  onChange={(e) => set({ vatRate: Number(e.target.value) as VatRate })}
                />
              )}
            </div>
            <dl className="w-full space-y-1 text-sm sm:w-72">
              <div className="flex justify-between text-slate-600">
                <dt>Summe netto</dt>
                <dd className="tabular-nums">{formatEuro(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>USt {totals.vatRate} %</dt>
                <dd className="tabular-nums">{formatEuro(totals.vatAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <dt>Gesamt</dt>
                <dd className="tabular-nums" data-testid="invoice-total">
                  {formatEuro(totals.total)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Texte */}
        <section className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6 lg:grid-cols-2">
          <TextArea
            label="Anmerkung"
            optional
            placeholder="z. B. Vielen Dank für Ihren Auftrag!"
            hint="Steht auf der Rechnung unter den Positionen."
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
          <TextArea
            label="Fußzeile"
            optional
            placeholder="z. B. Zahlbar ohne Abzug. Bankverbindung siehe oben."
            hint="Erscheint ganz unten auf der Rechnung."
            value={form.footer}
            onChange={(e) => set({ footer: e.target.value })}
          />
        </section>

        {/* Aktionen – am Handy fixiert über der Bottom-Navigation */}
        <div className="fixed inset-x-0 bottom-16 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 lg:justify-end">
            {invoice && (
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmDelete(true)}
                disabled={!!saving}
              >
                <span className="hidden sm:inline">Entwurf löschen</span>
                <span className="sr-only sm:hidden">Entwurf löschen</span>
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<Eye className="h-4 w-4" />}
              loading={saving === 'pdf'}
              disabled={!!saving}
              onClick={() => void handlePreview()}
              title="Entwurf speichern und PDF-Vorschau öffnen"
            >
              <span className="hidden sm:inline">Vorschau</span>
              <span className="sr-only sm:hidden">Vorschau</span>
            </Button>
            <Button type="submit" variant="secondary" className="flex-1 lg:flex-none" loading={saving === 'draft'} disabled={!!saving}>
              Entwurf speichern
            </Button>
            <Button className="flex-1 lg:flex-none" icon={<Send className="h-4 w-4" />} onClick={handleIssue} disabled={!!saving || expired}>
              Ausstellen
            </Button>
          </div>
        </div>
      </form>

      <PdfPreviewModal
        invoice={preview}
        onClose={() => {
          // Neue Rechnung: nach dem ersten Speichern zur Entwurfs-URL wechseln
          if (!invoice && preview) navigate(`/rechnungen/${preview.id}`, { replace: true });
          setPreview(null);
        }}
      />

      <ClientFormModal open={clientModal} client={null} onClose={() => setClientModal(false)} onSubmit={handleCreateClient} />

      <Modal
        open={confirmIssue}
        onClose={() => saving !== 'sent' && setConfirmIssue(false)}
        size="sm"
        title={`${docLabel} ausstellen?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmIssue(false)} disabled={saving === 'sent'}>
              Abbrechen
            </Button>
            <Button loading={saving === 'sent'} onClick={() => void save('sent')}>
              Jetzt ausstellen
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <strong>{form.invoiceNumber}</strong> an <strong>{client?.name ?? 'ohne Kunde'}</strong> über{' '}
            <strong>{formatEuro(totals.total)}</strong>.
          </p>
          <p>
            Nach dem Ausstellen ist die {docLabel} unveränderbar – so verlangt es das Gesetz. Fehler korrigierst du später
            mit einer Stornorechnung.
          </p>
          {ustWarnings.map((w) => (
            <Alert key={w} type="warning">
              {w}
            </Alert>
          ))}
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => saving !== 'delete' && setConfirmDelete(false)}
        size="sm"
        title="Entwurf löschen?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={saving === 'delete'}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={saving === 'delete'} onClick={() => void handleDelete()}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">Der Entwurf {invoice?.invoice_number} wird endgültig gelöscht.</p>
      </Modal>
    </PageWrapper>
  );
}
