// Belegfotos in Supabase Storage (privater Bucket „receipts“, Ordner = User-ID, max. 5 MB)
import { MAX_RECEIPT_BYTES } from './expenses';
import { supabase } from './supabase';

const BUCKET = 'receipts';
const COMPRESS_ABOVE = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 2000;

/**
 * Große Fotos (JPG/PNG/WebP) vor dem Upload verkleinern – Handyfotos haben oft 3–8 MB.
 * HEIC (iPhone) wird – wo der Browser es lesen kann, z. B. Safari – immer in JPG umgewandelt.
 */
export async function compressImage(file: File): Promise<Blob> {
  const heic = file.type === 'image/heic' || file.type === 'image/heif';
  if (!heic && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= COMPRESS_ABOVE)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob && (heic || blob.size < file.size) ? blob : file;
  } catch {
    return file; // z. B. Format nicht dekodierbar → Original hochladen
  }
}

export async function uploadReceipt(file: File, userId: string): Promise<{ path: string } | { error: string }> {
  const body = await compressImage(file);
  if (body.size > MAX_RECEIPT_BYTES) return { error: 'Der Beleg ist größer als 5 MB – bitte ein kleineres Foto wählen.' };
  const ext = body.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'bin').toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: body.type || file.type });
  if (error) return { error: 'Der Beleg konnte nicht hochgeladen werden.' };
  return { path };
}

/** Zeitlich begrenzter Link (privater Bucket). */
export async function getReceiptUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function deleteReceipt(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
