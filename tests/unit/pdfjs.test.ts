import { describe, expect, it } from 'vitest';
import { loadPdfjs } from '@/lib/pdfjs';

describe('loadPdfjs', () => {
  it('lädt die legacy-Fassung samt Worker – die normale scheitert in älteren Safari-Versionen', async () => {
    const pdfjs = await loadPdfjs();
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain('legacy');
    expect(typeof pdfjs.getDocument).toBe('function');
  });
});
