// Steuer-Einstellungen pro Jahr: Auswahl „Ab wann gilt das?“ beim Speichern und Verlauf der Änderungen.
import { useState } from 'react';
import toast from 'react-hot-toast';
import { History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { SettingsSectionState } from '@/hooks/useSettingsSection';
import { supabase } from '@/lib/supabase';
import { laterSettings, settingSince, taxChangeLog } from '@/lib/taxYears';

type Choice = 'current' | 'next' | 'past' | 'fix';

/** Frühere Jahre zur Auswahl: ab der SVS-Anmeldung, höchstens fünf Jahre zurück. */
function pastYears(registration: string | null, currentYear: number): number[] {
  const regYear = registration ? Number(registration.slice(0, 4)) : NaN;
  const first = Math.max(currentYear - 5, Number.isInteger(regYear) ? regYear : currentYear - 5);
  const years: number[] = [];
  for (let y = currentYear - 1; y >= first; y--) years.push(y);
  return years;
}

/** Erscheint, sobald sich Steuer-Einstellungen ändern: ab wann gilt die Änderung? */
export function TaxStartChoice({ id, state }: { id: string; state: SettingsSectionState }) {
  const { profile, taxYears } = useAuth();
  const { currentYear, start, setStart } = state;
  const past = pastYears(profile?.svs_registration_date ?? null, currentYear);
  const since = settingSince(taxYears, currentYear);

  const choice: Choice | null = !start
    ? null
    : start.kind === 'fix'
      ? 'fix'
      : start.year === currentYear
        ? 'current'
        : start.year === currentYear + 1
          ? 'next'
          : 'past';
  const pick = (c: Choice) =>
    setStart(
      c === 'fix'
        ? { kind: 'fix' }
        : { kind: 'from', year: c === 'current' ? currentYear : c === 'next' ? currentYear + 1 : (past[0] ?? currentYear - 1) },
    );

  // Eigene Einstellungen ab dem Startjahr, in die Klaro die Änderung ebenfalls übernimmt
  const startYear = start?.kind === 'from' ? start.year : since;
  const alsoChanged = !start ? [] : startYear === null ? taxYears.map((t) => t.year).sort((a, b) => a - b) : laterSettings(taxYears, startYear);

  return (
    <div id={id} className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" data-testid={id}>
      <ChoiceCards<Choice>
        legend="Ab wann gilt das?"
        name={`${id}-choice`}
        value={choice}
        columns={2}
        onChange={pick}
        options={[
          { value: 'current', title: `Ab ${currentYear}`, description: 'Gilt fürs ganze laufende Jahr und danach.' },
          {
            value: 'next',
            title: `Ab ${currentYear + 1}`,
            description: `${currentYear} rechnet Klaro weiter wie bisher – z. B. bei einem Wechsel zum Jahreswechsel.`,
          },
          ...(past.length > 0
            ? [
                {
                  value: 'past' as const,
                  title: 'Ab einem früheren Jahr',
                  description: 'Gilt ab dem gewählten Jahr bis heute – z. B. wenn du etwas zu spät eingetragen hast.',
                },
              ]
            : []),
          // Gilt die Angabe erst seit heuer, wäre „korrigieren“ dasselbe wie „ab heuer“
          ...(since === currentYear
            ? []
            : [
                {
                  value: 'fix' as const,
                  title: 'Nur korrigieren',
                  description:
                    since === null
                      ? 'Ich hatte mich vertan – die Korrektur gilt für alle Jahre.'
                      : `Ich hatte mich vertan – die Korrektur gilt ab ${since}, so wie die bisherige Angabe.`,
                },
              ]),
        ]}
      />
      {choice === 'past' && start?.kind === 'from' && (
        <Select
          label="Ab welchem Jahr?"
          value={String(start.year)}
          options={past.map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(e) => setStart({ kind: 'from', year: Number(e.target.value) })}
        />
      )}
      {alsoChanged.length > 0 && (
        <Alert type="info">
          Für {alsoChanged.join(', ')} hast du schon eigene Einstellungen. Klaro übernimmt dort nur, was du hier geändert
          hast – alles andere bleibt je Jahr, wie es ist. Passt die geänderte Gewinnermittlung in einem dieser Jahre nicht dazu, bleibt sie dort, wie sie ist.
        </Alert>
      )}
    </div>
  );
}

/** Verlauf: welche Steuer-Einstellung ab welchem Jahr gilt – mit „Zurücknehmen“. */
export function TaxHistory() {
  const { profile, taxYears, refreshProfile } = useAuth();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const log = taxChangeLog(profile, taxYears);
  if (log.length === 0) return null;

  async function remove(year: number) {
    setBusy(true);
    const { error } = await supabase.from('tax_years').delete().eq('user_id', profile!.id).eq('year', year);
    await refreshProfile();
    setBusy(false);
    setConfirm(null);
    if (error) toast.error('Zurücknehmen fehlgeschlagen. Bitte versuche es erneut.');
    else toast.success(`Änderung ab ${year} zurückgenommen`);
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-4" data-testid="tax-history">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <History className="h-4 w-4 text-slate-500" aria-hidden="true" />
        Was sich wann geändert hat
      </h3>
      <p className="mt-1 text-xs text-slate-500">Jedes Jahr rechnet Klaro mit den Einstellungen, die damals gegolten haben.</p>
      <ul className="mt-3 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {log.map((e) => (
          <li key={e.year} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">Ab {e.year}</p>
              <p className="text-sm text-slate-600">{e.changes.join(' · ')}</p>
            </div>
            <Button variant="ghost" onClick={() => setConfirm(e.year)} disabled={busy} aria-label={`Änderung ab ${e.year} zurücknehmen`}>
              Zurücknehmen
            </Button>
          </li>
        ))}
      </ul>

      <Modal
        open={confirm !== null}
        onClose={() => !busy && setConfirm(null)}
        title={`Änderung ab ${confirm ?? ''} zurücknehmen?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button loading={busy} onClick={() => confirm !== null && void remove(confirm)}>
              Zurücknehmen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Ab {confirm} gelten dann wieder die Einstellungen davor. Offene Entwürfe passt Klaro automatisch an, ausgestellte
          Rechnungen bleiben unverändert.
        </p>
      </Modal>
    </div>
  );
}
