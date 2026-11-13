/**
 * pdf.js in der „legacy“-Fassung: Die normale Fassung setzt brandneue Browser-Funktionen voraus
 * (z. B. Map.getOrInsertComputed, Promise.try) – ältere Safari-Versionen scheitern daran schon beim Öffnen eines PDFs.
 * Die legacy-Fassung bringt dafür Ersatz mit.
 */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}
