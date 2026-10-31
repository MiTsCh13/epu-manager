import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX, feedbackErrors, feedbackRow } from '@/lib/feedback';

describe('feedbackErrors', () => {
  it('verlangt eine Art und Text – Meldung beim jeweiligen Feld', () => {
    expect(feedbackErrors({ kind: null, message: '   ', contactOk: false })).toEqual({
      kind: 'Wähl bitte aus, worum es geht.',
      message: 'Schreib bitte ein paar Worte.',
    });
    expect(feedbackErrors({ kind: 'wish', message: 'Export als Excel', contactOk: false })).toEqual({});
  });

  it('begrenzt die Länge wie die Datenbank', () => {
    expect(feedbackErrors({ kind: 'bug', message: 'x'.repeat(FEEDBACK_MAX), contactOk: false })).toEqual({});
    expect(feedbackErrors({ kind: 'bug', message: 'x'.repeat(FEEDBACK_MAX + 1), contactOk: false }).message).toMatch(/höchstens/);
  });
});

describe('feedbackRow', () => {
  it('kürzt den Text und entfernt IDs aus der Seitenadresse', () => {
    const row = feedbackRow(
      { kind: 'bug', message: '  PDF leer  ', contactOk: true },
      '/rechnungen/3f2b1c4d-1234-4abc-9def-0123456789ab/bearbeiten',
    );
    expect(row).toEqual({ kind: 'bug', message: 'PDF leer', contact_ok: true, page: '/rechnungen/:id/bearbeiten' });
  });

  it('schickt keine E-Mail-Adresse mit – die setzt nur die Datenbank bei Zustimmung', () => {
    expect(feedbackRow({ kind: 'praise', message: 'Super', contactOk: true }, '/')).not.toHaveProperty('email');
  });
});
