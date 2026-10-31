// Feedback & Wünsche: Arten, Prüfung und Datensatz für die Tabelle `feedback`.
export type FeedbackKind = 'wish' | 'bug' | 'praise' | 'other';

export const FEEDBACK_KINDS: { value: FeedbackKind; title: string; placeholder: string }[] = [
  { value: 'wish', title: 'Wunsch', placeholder: 'Was soll Klaro können? Wofür würdest du es verwenden?' },
  { value: 'bug', title: 'Fehler', placeholder: 'Was hast du gemacht, was ist passiert und was hättest du erwartet?' },
  { value: 'praise', title: 'Lob', placeholder: 'Was gefällt dir an Klaro?' },
  { value: 'other', title: 'Sonstiges', placeholder: 'Was möchtest du uns sagen?' },
];

export const FEEDBACK_MAX = 4000;

export interface FeedbackDraft {
  kind: FeedbackKind | null;
  message: string;
  contactOk: boolean;
}

export interface FeedbackErrors {
  kind?: string;
  message?: string;
}

/** Fehlermeldungen je Feld – leeres Objekt, wenn alles passt. */
export function feedbackErrors(d: FeedbackDraft): FeedbackErrors {
  const errors: FeedbackErrors = {};
  if (!d.kind) errors.kind = 'Wähl bitte aus, worum es geht.';
  if (!d.message.trim()) errors.message = 'Schreib bitte ein paar Worte.';
  else if (d.message.length > FEEDBACK_MAX) errors.message = `Bitte höchstens ${FEEDBACK_MAX.toLocaleString('de-AT')} Zeichen.`;
  return errors;
}

/**
 * Datensatz zum Speichern. Die Seite hilft beim Nachvollziehen von Fehlern; IDs in der Adresse (z. B. einer Rechnung)
 * werden entfernt – es reicht zu wissen, welche Art Seite es war.
 */
export function feedbackRow(d: FeedbackDraft & { kind: FeedbackKind }, pathname: string) {
  const page = pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').slice(0, 200);
  return { kind: d.kind, message: d.message.trim(), contact_ok: d.contactOk, page };
}
