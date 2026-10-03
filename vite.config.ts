/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Projektpfad mit Sonderzeichen (OneDrive „Persönlich (… 12:14)“) bricht Vites fs-Allowlist → 403.
  // Betrifft nur den lokalen Dev-Server. Entfernen, sobald das Projekt in einem einfachen Pfad liegt.
  server: { fs: { strict: false } },
  plugins: [react()],
  // @react-pdf/renderer (~1,2 MB) wird nur bei PDF-Download nachgeladen – eigener Chunk, Warnung angepasst
  build: { chunkSizeWarningLimit: 1300 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/svs.ts', 'src/lib/profit.ts', 'src/lib/tax.ts', 'src/lib/money.ts', 'src/lib/validation.ts', 'src/lib/subscription.ts', 'src/lib/invoices.ts', 'src/lib/invoicePdf.ts', 'src/lib/epcQr.ts', 'src/lib/expenses.ts', 'src/lib/svsTracker.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
