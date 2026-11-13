/**
 * pdf.js in der „legacy“-Fassung: Die normale Fassung setzt brandneue Browser-Funktionen voraus
 * (z. B. Map.getOrInsertComputed, Promise.try) – ältere Safari-Versionen scheitern daran schon beim Öffnen eines PDFs.
 * Die legacy-Fassung bringt dafür Ersatz mit – bis auf die Schleife über Datenströme, die rüsten wir selbst nach.
 */
export async function loadPdfjs() {
  addReadableStreamIteration();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

/**
 * `for await (… of stream)` – pdf.js liest so die Texte eines PDFs (getTextContent). Ältere Safari-Versionen können
 * das nicht („undefined is not a function“); nachgerüstet über den gewöhnlichen Reader.
 */
export function addReadableStreamIteration() {
  if (typeof ReadableStream === 'undefined' || Symbol.asyncIterator in ReadableStream.prototype) return;
  async function* values(this: ReadableStream<unknown>) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
  if (!('values' in ReadableStream.prototype)) {
    Object.defineProperty(ReadableStream.prototype, 'values', { value: values, writable: true, configurable: true });
  }
}
