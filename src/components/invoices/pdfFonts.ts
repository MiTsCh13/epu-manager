// Schriften fürs Rechnungs-PDF. Helvetica und Times sind in jedem PDF eingebaut; Inter und Lora (SIL Open Font
// License) liefert Klaro selbst aus (public/fonts) – keine Anfrage an Google.
import { Font } from '@react-pdf/renderer';
import type { FontId } from '@/lib/invoiceTemplates';

export const FONT_FAMILY: Record<FontId, string> = {
  helvetica: 'Helvetica',
  inter: 'Inter',
  times: 'Times-Roman',
  lora: 'Lora',
};

let registeredBase: string | null = null;

/** `base`: Ordner mit den TTF-Dateien – im Browser „/fonts/“, im Test der Pfad zu public/fonts. */
export function registerPdfFonts(base: string) {
  if (registeredBase === base) return;
  for (const [family, file] of [['Inter', 'inter'], ['Lora', 'lora']] as const) {
    Font.register({
      family,
      fonts: (['normal', 'italic'] as const).flatMap((fontStyle) =>
        ([400, 700] as const).map((fontWeight) => ({ src: `${base}${file}-${fontWeight}-${fontStyle}.ttf`, fontWeight, fontStyle })),
      ),
    });
  }
  // Keine Silbentrennung – Wörter wie „Kleinunternehmer-Regelung“ bleiben ganz
  Font.registerHyphenationCallback((word) => [word]);
  registeredBase = base;
}
