// Beleg auslesen lassen: Datei aufbereiten (verkleinern, HEIC → JPG) und an die Edge Function read-receipt schicken.
import type { CategoryContext } from '@/constants/expenseCategories';
import { buildHistory, type CategoryHistory } from './importMapping';
import { invokeFunction } from './functions';
import { scanCategories, type ScanResult } from './receiptPrefill';
import { compressImage } from './receipts';
import { supabase } from './supabase';

const READABLE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function scanReceipt(file: File, ctx: CategoryContext, today: string): Promise<{ result: ScanResult } | { error: string }> {
  const body = file.type === 'application/pdf' ? file : await compressImage(file);
  if (!READABLE.includes(body.type)) {
    return { error: 'Dieses Fotoformat kann Klaro hier nicht lesen. Stell die Kamera auf „Maximale Kompatibilität“ (JPG) oder trag den Beleg selbst ein.' };
  }
  const response = await invokeFunction<{ result: ScanResult }>(
    'read-receipt',
    'Klaro kann den Beleg gerade nicht lesen. Bitte versuche es später erneut.',
    { mediaType: body.type, data: await toBase64(body), categories: scanCategories(ctx), today },
  );
  return response.error !== null ? { error: response.error } : { result: response.data.result };
}

/** Kategorie-Vorschläge aus deinen bisherigen Ausgaben (alle Jahre, die letzten 1.000) – Fehler = ohne Verlauf. */
export async function loadHistory(): Promise<CategoryHistory | undefined> {
  const { data } = await supabase
    .from('expenses')
    .select('description, category_label')
    .order('expense_date', { ascending: false })
    .limit(1000);
  return data ? buildHistory(data) : undefined;
}
