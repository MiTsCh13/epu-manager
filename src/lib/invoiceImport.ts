// Rechnung übernehmen (Browser): erste Seite des PDFs lesen – Seitenbild, Texte mit Position, eingebettete Bilder
// (Logo, Kopfbild) samt Lage auf der Seite und Farbkandidaten –, an read-invoice-design schicken und daraus eine
// Vorlage bauen. Die Rechnung selbst wird nicht gespeichert; hochgeladen werden nur die übernommenen Bilder.
import type { DesignImage, DesignLine, DesignRequest, Box } from '../../supabase/functions/read-invoice-design/design';
import { uploadBrandingImage } from './branding';
import { invokeFunction } from './functions';
import { adoptedSummary, designToTemplate, dominantColors, type DesignResult } from './invoiceDesign';
import type { TemplateSettings } from './invoiceTemplates';

const MAX_RENDER_SCALE = 2; // A4 → ca. 1190 × 1684 Pixel – gut lesbar für Claude, scharf genug zum Ausschneiden
const MAX_RENDER_SIDE = 1700; // auch bei übergroßen Seiten (Scanner-Apps) unter den Canvas-Grenzen der Handys
const MAX_IMAGE_SIDE = 2400; // herausgelöste Bilder höchstens so groß
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const NOT_READABLE = 'Dieses PDF kann Klaro nicht öffnen – ist es vielleicht passwortgeschützt?';

export interface FoundImage extends DesignImage {
  blob: Blob;
}

export interface InvoiceAnalysis {
  request: DesignRequest;
  pageUrl: string; // Seitenbild für den Vergleich (data:-URL)
  images: FoundImage[];
  canvas: HTMLCanvasElement; // gerenderte Seite zum Ausschneiden
}

const canvasBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), type, quality));

/** Bilddaten aus pdf.js (ImageBitmap oder Rohdaten) → Canvas. */
/** Verkleinert ein Canvas, wenn eine Seite länger als `max` Pixel ist. */
function shrink(canvas: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const scale = max / Math.max(canvas.width, canvas.height);
  if (scale >= 1) return canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

function imageToCanvas(img: { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array; kind?: number }): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return canvas;
  }
  if (!img.data) return null;
  const rgba = new Uint8ClampedArray(img.width * img.height * 4);
  const channels = img.kind === 3 ? 4 : img.kind === 2 ? 3 : 0;
  if (!channels) return null; // 1-Bit-Masken (kind 1) brauchen wir nicht
  for (let p = 0, q = 0; p < rgba.length; p += 4, q += channels) {
    rgba[p] = img.data[q]!;
    rgba[p + 1] = img.data[q + 1]!;
    rgba[p + 2] = img.data[q + 2]!;
    rgba[p + 3] = channels === 4 ? img.data[q + 3]! : 255;
  }
  ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  return canvas;
}

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4 * 7) if (data[i]! < 250) return true;
  return false;
}

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Erste Seite des PDFs auslesen. */
export async function analyzeInvoicePdf(file: File): Promise<InvoiceAnalysis | { error: string }> {
  // Manche Systeme liefern beim Ziehen keinen Dateityp → zusätzlich am Inhalt erkennen
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdf = file.type === 'application/pdf' || String.fromCharCode(...head) === '%PDF-';
  if (!isPdf) return { error: 'Bitte wähle eine Rechnung als PDF.' };
  if (file.size > MAX_PDF_BYTES) return { error: 'Das PDF ist größer als 15 MB.' };
  let task: { destroy: () => Promise<void> } | null = null;
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    task = loading;
    let doc;
    try {
      doc = await loading.promise;
    } catch {
      return { error: NOT_READABLE };
    }
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(MAX_RENDER_SCALE, MAX_RENDER_SIDE / Math.max(base.width, base.height)) });

    // Seitenbild (weißer Hintergrund – transparente PDFs sähen sonst schwarz aus)
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    const jpeg = canvas.toDataURL('image/jpeg', 0.82);

    // Texte: Schnipsel einer Zeile zusammenfassen, Schriftname für die Wahl der Schrift
    const content = await page.getTextContent();
    const fontName = (id: string): string => {
      try {
        return page.commonObjs.has(id) ? ((page.commonObjs.get(id) as { name?: string }).name ?? '') : '';
      } catch {
        return '';
      }
    };
    // pdf.js legt seitenübergreifende Objekte (Präfix „g_“) in commonObjs ab; nie ewig warten
    const getObject = (name: string) =>
      new Promise<Parameters<typeof imageToCanvas>[0] | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        try {
          (name.startsWith('g_') ? page.commonObjs : page.objs).get(name, (o: unknown) => {
            clearTimeout(timer);
            resolve(o as Parameters<typeof imageToCanvas>[0]);
          });
        } catch {
          clearTimeout(timer);
          resolve(null);
        }
      });
    const lines: DesignLine[] = [];
    let prevEnd = 0; // rechtes Ende des zuletzt angehängten Schnipsels
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [x, y] = base.convertToViewportPoint(item.transform[4], item.transform[5]) as [number, number];
      const size = Math.round(Math.hypot(item.transform[2], item.transform[3]) * 10) / 10 || item.height;
      const font = fontName(item.fontName);
      const top = Math.round((y - size) * 10) / 10;
      const prev = lines[lines.length - 1];
      const end = x + item.width; // Maßstab 1: schon in Punkt
      // gleiche Zeile, gleiche Schrift, kaum Abstand (also kein eigener Block wie „Datum:“ ganz rechts) → anhängen
      if (prev && Math.abs(prev.y - top) < 2 && prev.font.endsWith(font.replace(/^[A-Z]{6}\+/, '')) && x >= prevEnd - 1 && x - prevEnd < size * 1.5 && prev.text.length < 200) {
        prev.text = `${prev.text}${item.str.startsWith(' ') || prev.text.endsWith(' ') || x - prevEnd < size * 0.15 ? '' : ' '}${item.str}`.replace(/\s+/g, ' ');
        prevEnd = end;
        continue;
      }
      prevEnd = end;
      lines.push({ x: Math.round(x * 10) / 10, y: top, size, bold: /bold|black|heavy|semibold/i.test(font), font: font.replace(/^[A-Z]{6}\+/, ''), text: item.str.trim() });
    }

    // Eingebettete Bilder mit Lage: Transformationsmatrix durch die Zeichenbefehle verfolgen
    const ops = await page.getOperatorList();
    const images: FoundImage[] = [];
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    for (let i = 0; i < ops.fnArray.length && images.length < 12; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      if (fn === pdfjs.OPS.save) stack.push(ctm);
      else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === pdfjs.OPS.transform) ctm = multiply(ctm, args as Matrix);
      // Form-XObjects (z. B. Logos aus Canva, InDesign, Briefpapier) bringen eine eigene Matrix mit
      else if (fn === pdfjs.OPS.paintFormXObjectBegin) {
        stack.push(ctm);
        if (Array.isArray(args[0]) && args[0].length === 6) ctm = multiply(ctm, args[0] as Matrix);
      } else if (fn === pdfjs.OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
      else if (fn === pdfjs.OPS.paintImageXObject) {
        const img = await getObject(args[0] as string);
        if (!img) continue;
        // Einheitsquadrat des Bildes → Seitenkoordinaten (oben links, Punkt)
        const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) =>
          base.convertToViewportPoint(ctm[0] * u! + ctm[2] * v! + ctm[4], ctm[1] * u! + ctm[3] * v! + ctm[5]) as [number, number],
        );
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        if (box.width * box.height < 300 || img.width * img.height < 400) continue; // Symbole, Linien
        // Ganzseitige Bilder (Scans) sind weder Logo noch Kopfbild – und enthalten Kundendaten
        if (box.width * box.height > base.width * base.height * 0.5) continue;
        try {
          const full = imageToCanvas(img);
          if (!full) continue;
          const c = shrink(full, MAX_IMAGE_SIDE);
          const transparent = hasTransparency(c);
          const blob = await canvasBlob(c, transparent || c.width * c.height < 400_000 ? 'image/png' : 'image/jpeg', 0.9);
          const r = (v: number) => Math.round(v * 10) / 10;
          images.push({ id: `bild${images.length + 1}`, x: r(box.x), y: r(box.y), width: r(box.width), height: r(box.height), pixelWidth: c.width, pixelHeight: c.height, transparent, blob });
        } catch {
          // Ein Bild, das sich nicht lesen lässt, überspringen – der Rest der Rechnung zählt trotzdem
        }
      }
    }

    // Farbkandidaten aus einer verkleinerten Seite
    const small = document.createElement('canvas');
    small.width = 300;
    small.height = Math.round((300 * canvas.height) / canvas.width);
    small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
    const colors = dominantColors(small.getContext('2d')!.getImageData(0, 0, small.width, small.height).data);

    const request: DesignRequest = {
      page: jpeg.slice(jpeg.indexOf(',') + 1),
      pageWidth: Math.round(base.width * 10) / 10,
      pageHeight: Math.round(base.height * 10) / 10,
      lines: lines.slice(0, 300),
      images: images.map(({ blob: _blob, ...i }) => i),
      colors,
    };
    return { request, pageUrl: jpeg, images, canvas };
  } catch {
    return { error: 'Klaro konnte diese Rechnung nicht vorbereiten. Bitte versuche es erneut oder starte mit einem Design.' };
  } finally {
    void task?.destroy();
  }
}

/** Bereich der gerenderten Seite ausschneiden (Punkt-Koordinaten) – für gezeichnete Logos bzw. Kopfgrafiken. */
async function crop(analysis: InvoiceAnalysis, box: Box): Promise<Blob> {
  const k = analysis.canvas.width / analysis.request.pageWidth;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(box.width * k));
  c.height = Math.max(1, Math.round(box.height * k));
  c.getContext('2d')!.drawImage(analysis.canvas, box.x * k, box.y * k, box.width * k, box.height * k, 0, 0, c.width, c.height);
  return canvasBlob(c, 'image/png');
}

export interface ImportedDesign {
  result: DesignResult;
  settings: TemplateSettings; // ohne Bild-Pfade (die gibt es erst nach dem Hochladen)
  images: { header: Blob | null; logo: Blob | null };
  previewImages: { header: string | null; logo: string | null }; // data:-URLs für die Vorschau
  adopted: string[];
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Ausgelesene Rechnung an Claude schicken und die Vorlage samt Bildern vorbereiten. */
export async function readInvoiceDesign(analysis: InvoiceAnalysis): Promise<ImportedDesign | { error: string }> {
  const response = await invokeFunction<{ result: DesignResult }>(
    'read-invoice-design',
    'Klaro kann deine Rechnung gerade nicht lesen. Bitte versuche es später erneut.',
    analysis.request as unknown as Record<string, unknown>,
  );
  if (response.error !== null) return { error: response.error };
  const result = response.data.result;
  if (!result.is_invoice) return { error: 'Das sieht nicht nach einer Rechnung aus. Wähle eine Rechnung, die du selbst geschrieben hast.' };

  const find = (id: string | null) => analysis.images.find((i) => i.id === id)?.blob ?? null;
  const header =
    result.header_style !== 'image'
      ? null
      : (find(result.header_image_id) ??
        (result.header_crop_bottom ? await crop(analysis, { x: 0, y: 0, width: analysis.request.pageWidth, height: result.header_crop_bottom }) : null));
  const logo = find(result.logo_image_id) ?? (result.logo_crop ? await crop(analysis, result.logo_crop) : null);
  const previewImages = { header: header ? await toDataUrl(header) : null, logo: logo ? await toDataUrl(logo) : null };
  // Für die Vorschau Platzhalter-Pfade, damit Logo und Kopfbild angezeigt werden
  const settings = designToTemplate(result, { header: header ? 'vorschau/kopf' : null, logo: logo ? 'vorschau/logo' : null });
  return { result, settings, images: { header, logo }, previewImages, adopted: adoptedSummary(settings, result) };
}

/** Bilder hochladen und die endgültigen Einstellungen liefern. */
export async function finalizeImport(imported: ImportedDesign, userId: string): Promise<{ settings: TemplateSettings } | { error: string }> {
  const upload = async (blob: Blob | null, kind: 'header' | 'logo') => {
    if (!blob) return null;
    const r = await uploadBrandingImage(new File([blob], `${kind}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type }), userId, kind);
    if ('error' in r) throw new Error(r.error);
    return r.path;
  };
  try {
    const [header, logo] = await Promise.all([upload(imported.images.header, 'header'), upload(imported.images.logo, 'logo')]);
    return { settings: { ...imported.settings, header: { ...imported.settings.header, imagePath: header, logoPath: logo } } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Die Bilder konnten nicht hochgeladen werden.' };
  }
}
