// Beleg aus der Übersicht (Drag & Drop oder Auswahl) an die Ausgaben-Seite weiterreichen.
// Bewusst nur im Speicher: Dateien gehören nicht in die URL oder in den Browser-Speicher.
// Nur kurz gültig – landet man (z. B. per Umleitung) nicht gleich bei den Ausgaben, soll der Beleg
// nicht Stunden später beim nächsten Besuch ungefragt ausgelesen werden.
const MAX_AGE_MS = 15_000;

let pending: { file: File; at: number } | null = null;

export function setPendingReceipt(file: File): void {
  pending = { file, at: Date.now() };
}

/** Holt den wartenden Beleg (einmalig) – danach ist er weg. */
export function takePendingReceipt(): File | null {
  const entry = pending;
  pending = null;
  return entry && Date.now() - entry.at <= MAX_AGE_MS ? entry.file : null;
}
