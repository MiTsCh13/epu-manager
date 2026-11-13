import { describe, expect, it } from 'vitest';
import { loadPdfjs } from '@/lib/pdfjs';

describe('loadPdfjs', () => {
  it('lädt die legacy-Fassung samt Worker – die normale scheitert in älteren Safari-Versionen', async () => {
    const pdfjs = await loadPdfjs();
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain('legacy');
    expect(typeof pdfjs.getDocument).toBe('function');
  });
});

describe('addReadableStreamIteration', () => {
  it('rüstet „for await … of“ über Datenströme nach, wenn der Browser es nicht kann (ältere Safari-Versionen)', async () => {
    const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
    const original = proto[Symbol.asyncIterator];
    delete proto[Symbol.asyncIterator];
    try {
      const { addReadableStreamIteration } = await import('@/lib/pdfjs');
      addReadableStreamIteration();
      const stream = new ReadableStream<number>({
        start(c) {
          c.enqueue(1);
          c.enqueue(2);
          c.close();
        },
      });
      const seen: number[] = [];
      for await (const v of stream as unknown as AsyncIterable<number>) seen.push(v);
      expect(seen).toEqual([1, 2]);
    } finally {
      Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: original, writable: true, configurable: true });
    }
  });
});
