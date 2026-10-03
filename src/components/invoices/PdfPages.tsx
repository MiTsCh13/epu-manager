import { useEffect, useRef, useState } from 'react';

/**
 * Zeichnet alle Seiten eines PDFs als Canvas (pdf.js) – funktioniert in jedem Browser,
 * auch dort, wo eingebettete PDFs nicht angezeigt werden (z. B. Chrome auf Android).
 */
export function PdfPages({ blob, onError }: { blob: Blob; onError: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;

    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      destroy = () => void task.destroy();
      const doc = await task.promise;
      if (cancelled) return destroy();
      setPageCount(doc.numPages);

      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();
      const width = container.clientWidth;
      const ratio = window.devicePixelRatio || 1;

      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * ratio });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.className = 'block bg-white shadow-sm ring-1 ring-slate-200';
        canvas.setAttribute('aria-label', `Seite ${n} von ${doc.numPages}`);
        container.appendChild(canvas);
        await page.render({ canvas, viewport }).promise;
      }
    })().catch(() => !cancelled && onError());

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [blob, onError]);

  return (
    <div>
      <div ref={containerRef} className="space-y-4" role="img" aria-label={`PDF-Vorschau, ${pageCount} Seite(n)`} />
    </div>
  );
}
