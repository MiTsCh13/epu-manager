// Logos und Kopfbilder der Rechnungs-Vorlagen (privater Bucket „branding“, Ordner = User-ID).
// Dateien werden nie überschrieben: ausgestellte Rechnungen zeigen auf ihren Pfad und sollen gleich aussehen.
import { supabase } from './supabase';

const BUCKET = 'branding';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // größere Fotos würden das Handy beim Umwandeln überfordern
export type BrandingKind = 'logo' | 'header';

/** Bild fürs PDF vorbereiten: Logo als PNG (Transparenz bleibt), Kopfbild als JPG; beides verkleinert. */
async function prepare(file: File, kind: BrandingKind): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = kind === 'header' ? 2400 : 1200;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = kind === 'logo' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  if (!blob) throw new Error('Bild konnte nicht umgewandelt werden');
  return blob;
}

export function validateBrandingFile(file: { type: string }): string | null {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ? null : 'Bitte wähle ein Bild im Format PNG oder JPG.';
}

export async function uploadBrandingImage(file: File, userId: string, kind: BrandingKind): Promise<{ path: string } | { error: string }> {
  const invalid = validateBrandingFile(file);
  if (invalid) return { error: invalid };
  if (file.size > MAX_INPUT_BYTES) return { error: 'Das Bild ist zu groß (über 25 MB) – bitte eine kleinere Version wählen.' };
  let body: Blob;
  try {
    body = await prepare(file, kind);
  } catch {
    return { error: 'Das Bild konnte nicht gelesen werden.' };
  }
  if (body.size > MAX_BYTES) return { error: 'Das Bild ist größer als 5 MB.' };
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${body.type === 'image/png' ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: body.type });
  if (error) return { error: 'Das Bild konnte nicht hochgeladen werden.' };
  dataUrls.set(path, blobToDataUrl(body));
  return { path };
}

const dataUrls = new Map<string, Promise<string | null>>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Bild als data:-URL (fürs PDF, im Speicher zwischengespeichert). null, wenn es nicht geladen werden kann. */
export function brandingDataUrl(path: string | null): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  let p = dataUrls.get(path);
  if (!p) {
    p = supabase.storage
      .from(BUCKET)
      .download(path)
      .then(({ data }) => (data ? blobToDataUrl(data) : null))
      .catch(() => null);
    dataUrls.set(path, p);
    // Fehler nicht dauerhaft merken
    void p.then((v) => v === null && dataUrls.delete(path));
  }
  return p;
}

/**
 * Akzentfarbe aus einem Logo vorschlagen: häufigste kräftige Farbe (Weiß, Schwarz, Grau und Transparenz zählen nicht).
 * null, wenn das Logo keine kräftige Farbe hat.
 */
export async function suggestColor(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (a < 128 || max - min < 50 || max < 40) continue; // transparent, grau oder fast schwarz
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, { n: e.n + 1, r: e.r + r, g: e.g + g, b: e.b + b });
    }
    const top = [...buckets.values()].sort((x, y) => y.n - x.n)[0];
    if (!top || top.n < 20) return null;
    const hex = (v: number) => Math.round(v / top.n).toString(16).padStart(2, '0');
    return `#${hex(top.r)}${hex(top.g)}${hex(top.b)}`;
  } catch {
    return null;
  }
}
