// Live-Vorschau einer Vorlage: Beispielrechnung als echtes PDF (pdf.js), darüber anklickbare Bereiche
// (Kopf, Text oben, Positionen, Text unten, Zahlung, Fußzeile). Die Bereiche ermittelt Klaro aus den
// Textpositionen im PDF – so passen sie zu jedem Design.
import { useEffect, useRef, useState } from 'react';
import { buildInvoicePdfData } from '@/lib/invoicePdf';
import { loadTemplateImages, renderInvoicePdf } from '@/lib/renderInvoicePdf';
import type { PdfImages } from '@/components/invoices/InvoicePDF';
import { addDays, toISODate } from '@/lib/invoices';
import { DEFAULT_NUMBER_FORMAT, formatInvoiceNumber } from '@/lib/invoiceNumbers';
import type { TemplateSettings } from '@/lib/invoiceTemplates';
import { Spinner } from '@/components/ui/Spinner';
import type { Invoice, Profile } from '@/types';

export type TemplatePart = 'kopf' | 'pflicht' | 'oben' | 'positionen' | 'unten' | 'zahlung' | 'fuss';

export const PART_LABELS: Record<TemplatePart, string> = {
  kopf: 'Kopf',
  pflicht: 'Pflichtangaben',
  oben: 'Text oben',
  positionen: 'Positionen',
  unten: 'Text unten',
  zahlung: 'Zahlung',
  fuss: 'Fußzeile',
};

/** Beispielrechnung mit deinen Angaben und der Vorlage. */
export function sampleInvoice(profile: Profile | null, settings: TemplateSettings): Invoice {
  const today = toISODate(new Date());
  const isKU = profile?.is_kleinunternehmer ?? true;
  const items = [
    { description: 'Beratung und Konzept', quantity: 4, unit_price: 90, total: 360, unit: 'Std.' },
    { description: 'Projektpauschale\n• Umsetzung\n• Abstimmung und Übergabe', quantity: 1, unit_price: 650, total: 650, unit: 'pauschal' },
  ];
  const subtotal = 1010;
  const vat = isKU ? 0 : 20;
  return {
    id: 'vorschau',
    user_id: profile?.id ?? '',
    client_id: null,
    template_id: null,
    invoice_number: formatInvoiceNumber(profile?.invoice_number_format ?? DEFAULT_NUMBER_FORMAT, today, 1),
    payment_method: 'transfer',
    invoice_date: today,
    due_date: addDays(today, settings.payment.days),
    service_date_from: today,
    service_date_to: null,
    status: 'sent',
    is_honorarnote: profile?.business_type === 'neue_selbstaendige',
    line_items: items,
    subtotal,
    vat_rate: vat,
    vat_amount: (subtotal * vat) / 100,
    total: subtotal + (subtotal * vat) / 100,
    intro_text: settings.intro || null,
    notes: settings.closing.text || null,
    footer_text: settings.footer.text || null,
    paid_at: null,
    created_at: today,
    client_snapshot: { name: 'Muster GmbH', address: 'Hauptstraße 1', zip_code: '1010', city: 'Wien', country: 'AT' },
    issuer_snapshot: {
      full_name: profile?.full_name || 'Dein Name',
      business_name: profile?.business_name,
      address: profile?.address || 'Deine Straße 1',
      zip_code: profile?.zip_code || '1010',
      city: profile?.city || 'Wien',
      country: profile?.country ?? 'AT',
      uid_number: profile?.uid_number,
      iban: profile?.iban || 'AT00 0000 0000 0000 0000',
      account_holder: profile?.account_holder,
      is_kleinunternehmer: isKU,
    },
    template_snapshot: settings,
  } as unknown as Invoice;
}

interface Band {
  part: TemplatePart;
  top: number; // Anteil der Seitenhöhe (0–1)
  bottom: number;
}

/** Bereiche aus den Textpositionen der ersten Seite (PDF-Punkte, y von oben). */
function computeBands(items: { str: string; top: number; bottom: number }[], data: ReturnType<typeof buildInvoicePdfData>, height: number): Band[] {
  const first = (pred: (s: string) => boolean) => items.find((i) => pred(i.str));
  const last = (pred: (s: string) => boolean) => [...items].reverse().find((i) => pred(i.str));
  const sender = first((s) => s.startsWith(data.senderLine.slice(0, 20)));
  // Genau der Titel („Rechnung 2026-001“), nicht das Label „Rechnungsnummer“
  const title = first((s) => s === `${data.title} ${data.meta[0]?.[1] ?? ''}`.trim());
  const head = first((s) => s === 'Pos.');
  const total = first((s) => s === 'Gesamtbetrag');
  const footerMarker = data.footerColumns ? data.footerColumns[0]?.[0] : data.footerLines[0];
  const footer = footerMarker ? last((s) => s.startsWith(footerMarker.slice(0, 20))) : undefined;
  const payIntro = data.payment ? first((s) => s === data.payment!.intro) : undefined;
  const payEnd = data.payment ? last((s) => s === data.payment!.rows[data.payment!.rows.length - 1]![1]) : undefined;
  if (!sender || !title || !head || !total) return [];

  const footerTop = footer ? footer.top - 10 : height - 60;
  const bands: Band[] = [
    { part: 'kopf', top: 0, bottom: sender.top - 6 },
    { part: 'pflicht', top: sender.top - 6, bottom: title.top - 8 },
    { part: 'oben', top: title.top - 8, bottom: head.top - 4 },
    { part: 'positionen', top: head.top - 4, bottom: total.bottom + 6 },
    { part: 'unten', top: total.bottom + 6, bottom: footerTop },
    { part: 'fuss', top: footerTop, bottom: height },
  ];
  if (payIntro && payEnd) bands.push({ part: 'zahlung', top: payIntro.top - 12, bottom: payEnd.bottom + 12 });
  return bands
    .filter((b) => b.bottom > b.top)
    .map((b) => ({ ...b, top: Math.max(0, b.top / height), bottom: Math.min(1, b.bottom / height) }));
}

export function TemplatePreview({
  profile,
  settings,
  active,
  onSelect,
  images: givenImages,
}: {
  profile: Profile | null;
  settings: TemplateSettings;
  active: TemplatePart | null;
  onSelect?: (part: TemplatePart) => void;
  /** Bilder direkt (z. B. vor dem Hochladen beim Übernehmen einer Rechnung) statt aus dem Speicher */
  images?: PdfImages;
}) {
  const canvasBox = useRef<HTMLDivElement>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<TemplatePart | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    // Kurz warten, damit nicht jeder Tastendruck ein PDF erzeugt
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const invoice = sampleInvoice(profile, settings);
        const images = givenImages ?? (await loadTemplateImages(settings));
        const { blob } = await renderInvoicePdf(invoice, { images });
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        const loading = pdfjs.getDocument({ data: bytes });
        task = loading;
        const doc = await loading.promise;
        const page = await doc.getPage(1);
        const box = canvasBox.current;
        if (cancelled || !box) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (box.clientWidth / base.width) * (window.devicePixelRatio || 1) });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'block h-auto w-full';
        await page.render({ canvas, viewport }).promise;
        const text = await page.getTextContent();
        if (cancelled) return;
        box.replaceChildren(canvas);
        const items = text.items.flatMap((i) =>
          'str' in i && i.str.trim() ? [{ str: i.str.trim(), top: base.height - i.transform[5] - i.height, bottom: base.height - i.transform[5] + 2 }] : [],
        );
        setBands(computeBands(items, buildInvoicePdfData(invoice), base.height));
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      void task?.destroy();
    };
  }, [profile, settings, givenImages]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200" data-testid="template-preview">
      <div ref={canvasBox} className="aspect-[210/297] w-full" />
      {/* Bereiche: Zahlung liegt über „Text unten“ und kommt deshalb zuletzt */}
      {onSelect && bands.map((b) => {
        const on = active === b.part;
        const hovered = hover === b.part;
        return (
          <button
            key={b.part}
            type="button"
            onClick={() => onSelect(b.part)}
            onMouseEnter={() => setHover(b.part)}
            onMouseLeave={() => setHover((h) => (h === b.part ? null : h))}
            onFocus={() => setHover(b.part)}
            onBlur={() => setHover(null)}
            aria-label={`${PART_LABELS[b.part]} bearbeiten`}
            className={`absolute inset-x-0 rounded-sm transition-colors focus:outline-none ${
              on ? 'bg-primary/5 ring-2 ring-inset ring-primary' : hovered ? 'bg-primary/5 ring-1 ring-inset ring-primary/60' : ''
            }`}
            style={{ top: `${b.top * 100}%`, height: `${(b.bottom - b.top) * 100}%` }}
          >
            {(on || hovered) && (
              <span className="absolute right-2 top-1 rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
                {PART_LABELS[b.part]}
              </span>
            )}
          </button>
        );
      })}
      {busy && (
        <div className="pointer-events-none absolute right-3 top-3 text-primary" role="status" aria-label="Vorschau wird erstellt">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {error && <p className="absolute inset-x-0 top-1/3 p-6 text-center text-sm text-red-700">Die Vorschau konnte nicht erstellt werden.</p>}
    </div>
  );
}
