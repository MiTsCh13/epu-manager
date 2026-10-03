// PDF erzeugen (Vorschau + Download). @react-pdf/renderer (~1,2 MB) und qrcode werden erst bei Bedarf geladen.
import { createElement } from 'react';
import { buildInvoicePdfData } from './invoicePdf';
import type { Invoice } from '@/types';

/** Rechnung → <Document>-Element inkl. EPC-QR-Code. Auch im Node-Test verwendbar. */
export async function createInvoicePdfElement(invoice: Invoice) {
  const [{ InvoicePDF }, QRCode] = await Promise.all([import('@/components/invoices/InvoicePDF'), import('qrcode')]);
  const data = buildInvoicePdfData(invoice);
  const epc = data.payment?.epcPayload;
  // margin 2 = weißer Rand (Ruhezone), den Scanner zum Erkennen brauchen
  const qrDataUrl = epc ? await QRCode.toDataURL(epc, { errorCorrectionLevel: 'M', margin: 2, width: 300 }) : null;
  return { element: createElement(InvoicePDF, { data, qrDataUrl }), fileName: data.fileName };
}

export async function renderInvoicePdf(invoice: Invoice): Promise<{ blob: Blob; fileName: string }> {
  const [{ pdf }, { element, fileName }] = await Promise.all([import('@react-pdf/renderer'), createInvoicePdfElement(invoice)]);
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
