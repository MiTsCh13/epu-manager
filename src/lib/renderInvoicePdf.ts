// PDF erzeugen (Vorschau + Download). @react-pdf/renderer (~1,2 MB) und qrcode werden erst bei Bedarf geladen.
import { createElement } from 'react';
import { buildInvoicePdfData } from './invoicePdf';
import { normalizeTemplate } from './invoiceTemplates';
import type { PdfImages } from '@/components/invoices/InvoicePDF';
import type { Invoice } from '@/types';

export interface PdfRenderOptions {
  /** Ordner der Schriftdateien (Standard: /fonts/ der App; im Test ein Dateipfad) */
  fontBase?: string;
  /** Logo und Kopfbild als URL bzw. data:-URL (Standard: aus dem Speicher laden) */
  images?: PdfImages;
}

/** Rechnung → <Document>-Element inkl. EPC-QR-Code. Auch im Node-Test verwendbar. */
export async function createInvoicePdfElement(invoice: Invoice, options: PdfRenderOptions = {}) {
  const [{ InvoicePDF }, { registerPdfFonts }, QRCode] = await Promise.all([
    import('@/components/invoices/InvoicePDF'),
    import('@/components/invoices/pdfFonts'),
    import('qrcode'),
  ]);
  registerPdfFonts(options.fontBase ?? `${window.location.origin}/fonts/`);
  const data = buildInvoicePdfData(invoice);
  const epc = data.payment && data.qr ? data.payment.epcPayload : null;
  // margin 2 = weißer Rand (Ruhezone), den Scanner zum Erkennen brauchen
  const qrDataUrl = epc ? await QRCode.toDataURL(epc, { errorCorrectionLevel: 'M', margin: 2, width: 300 }) : null;
  return { element: createElement(InvoicePDF, { data, qrDataUrl, images: options.images ?? {} }), fileName: data.fileName };
}

/**
 * Logo und Kopfbild der Vorlage einer Rechnung laden. Fehlt ein Bild, das die Vorlage verlangt (z. B. offline),
 * gibt es einen Fehler statt einer Rechnung ohne Logo.
 */
export async function loadTemplateImages(template: unknown): Promise<PdfImages> {
  const t = normalizeTemplate(template);
  const { brandingDataUrl } = await import('./branding');
  const headerPath = t.header.style === 'image' ? t.header.imagePath : null;
  const [header, logo] = await Promise.all([brandingDataUrl(headerPath), brandingDataUrl(t.header.logoPath)]);
  if ((headerPath && !header) || (t.header.logoPath && !logo)) throw new Error('Logo bzw. Kopfbild konnte nicht geladen werden');
  return { header, logo };
}

export async function renderInvoicePdf(invoice: Invoice, options: PdfRenderOptions = {}): Promise<{ blob: Blob; fileName: string }> {
  const images = options.images ?? (await loadTemplateImages(invoice.template_snapshot));
  const [{ pdf }, { element, fileName }] = await Promise.all([
    import('@react-pdf/renderer'),
    createInvoicePdfElement(invoice, { ...options, images }),
  ]);
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  return { blob, fileName };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
