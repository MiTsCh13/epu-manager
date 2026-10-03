import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, ExternalLink } from 'lucide-react';
import { downloadBlob, renderInvoicePdf } from '@/lib/renderInvoicePdf';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import type { Invoice } from '@/types';
import { PdfPages } from './PdfPages';

/** PDF-Vorschau im Dialog (Seiten als Bild via pdf.js) mit Download und „In neuem Tab öffnen“. */
export function PdfPreviewModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const [pdf, setPdf] = useState<{ blob: Blob; fileName: string; url: string } | null>(null);
  const [error, setError] = useState(false);
  const onRenderError = useCallback(() => setError(true), []);

  useEffect(() => {
    if (!invoice) return;
    let url: string | null = null;
    let cancelled = false;
    setPdf(null);
    setError(false);
    renderInvoicePdf(invoice)
      .then(({ blob, fileName }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdf({ blob, fileName, url });
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [invoice]);

  const title = invoice ? `${invoice.status === 'draft' ? 'Vorschau Entwurf' : 'Vorschau'} ${invoice.invoice_number}` : 'Vorschau';

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      size="xl"
      title={title}
      footer={
        <>
          <a
            href={pdf?.url}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!pdf}
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ring-1 ring-inset ring-slate-300 hover:bg-slate-50 ${pdf ? 'text-slate-700' : 'pointer-events-none text-slate-400'}`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Neuer Tab
          </a>
          <Button
            icon={<Download className="h-4 w-4" />}
            disabled={!pdf}
            onClick={() => {
              if (!pdf) return;
              downloadBlob(pdf.blob, pdf.fileName);
              toast.success(`${pdf.fileName} heruntergeladen`);
            }}
          >
            Herunterladen
          </Button>
        </>
      }
    >
      <div className="-mx-5 -my-4 min-h-[60vh] bg-slate-100 p-3 sm:p-6">
        {error ? (
          <p className="p-6 text-center text-sm text-red-700">Das PDF konnte nicht erstellt werden. Bitte versuche es erneut.</p>
        ) : !pdf ? (
          <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-slate-500" role="status">
            <Spinner className="h-8 w-8 text-primary" />
            <span className="text-sm">PDF wird erstellt …</span>
          </div>
        ) : (
          <PdfPages blob={pdf.blob} onError={onRenderError} />
        )}
      </div>
    </Modal>
  );
}
