import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Info, Radar, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatDecimalInput, formatEuro, parseDecimal, round2 } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Term } from '@/components/ui/Tooltip';
import type { SvsTrackerModel } from '@/lib/svsTracker';

const URGENCY = {
  info: { Icon: Info, box: 'bg-sky-50 text-sky-900 ring-sky-200', label: 'Hinweis' },
  warning: { Icon: AlertTriangle, box: 'bg-amber-50 text-amber-900 ring-amber-200', label: 'Achtung' },
  critical: { Icon: XCircle, box: 'bg-red-50 text-red-900 ring-red-200', label: 'Wichtig' },
} as const;

function Bar({ label, value, max, muted }: { label: string; value: number; max: number; muted?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-slate-900">{formatEuro(value, true)}</span>
      </div>
      <div className="mt-1 h-3 rounded-full bg-slate-100">
        <div className={`h-3 rounded-full ${muted ? 'bg-slate-400' : 'bg-primary'}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** Vorläufige vs. zu erwartende Berechnungsbasis → geschätzte Nachzahlung. */
export function NachzahlungsRadar({ model }: { model: SvsTrackerModel }) {
  const { profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile?.svs_quarterly_prescription ? formatDecimalInput(Number(profile.svs_quarterly_prescription)) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const max = Math.max(model.provisionalBasis, model.expectedBasis, 1);
  const { warning } = model;
  const u = URGENCY[warning.urgency];

  async function save(e: FormEvent) {
    e.preventDefault();
    const amount = value.trim() === '' ? null : parseDecimal(value);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) return setError('Bitte gib einen gültigen Betrag ein.');
    setSaving(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({ svs_quarterly_prescription: amount === null ? null : round2(amount) })
      .eq('id', profile!.id);
    setSaving(false);
    if (err) return void toast.error('Speichern fehlgeschlagen.');
    await refreshProfile();
    setEditing(false);
    setError(null);
    toast.success('Vorschreibung gespeichert – Berechnung aktualisiert');
  }

  return (
    <section aria-labelledby="radar-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id="radar-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Radar className="h-5 w-5 text-primary" aria-hidden="true" />
        <Term k="nachbemessung">Nachzahlungs-Radar</Term>
      </h2>

      {model.notInsured ? (
        <p className="mt-3 text-sm text-slate-600">
          Nach aktuellem Stand bist du nicht pflichtversichert (Ausnahme bzw. unter der Versicherungsgrenze) – es ist keine
          Nachbemessung zu erwarten.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-3" role="group" aria-label="Vergleich der Berechnungsbasis">
            <Bar label="Vorläufig vorgeschrieben (Jahresbasis)" value={model.provisionalBasis} max={max} muted />
            <Bar label={`Erwartet nach deinem Gewinn`} value={model.expectedBasis} max={max} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <Term k="berechnungsbasis">Berechnungsbasis für deine SVS-Beiträge</Term> pro Jahr.
            {!model.prescriptionKnown && ' Die vorläufige Basis ist geschätzt.'}
          </p>

          {warning.hasWarning ? (
            <div className={`mt-4 flex gap-3 rounded-lg p-3 text-sm ring-1 ring-inset ${u.box}`} role={warning.urgency === 'critical' ? 'alert' : 'status'}>
              <u.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  {u.label}: Erwartete Nachzahlung{' '}
                  <span className="tabular-nums" data-testid="nachzahlung">
                    {formatEuro(warning.estimatedNachzahlung, true)}
                  </span>
                </p>
                <p className="mt-1 leading-relaxed">{warning.message}</p>
              </div>
            </div>
          ) : (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Nach aktuellem Stand ist keine Nachzahlung zu erwarten.
            </p>
          )}
        </>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        {editing ? (
          <form onSubmit={save} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field
              className="flex-1"
              label="Betrag deiner aktuellen Quartals-Vorschreibung (€)"
              inputMode="decimal"
              placeholder="z. B. 1.250,00"
              hint="Steht auf dem letzten SVS-Brief. Leer lassen, um wieder zu schätzen."
              value={value}
              error={error ?? undefined}
              onChange={(e) => setValue(e.target.value)}
            />
            <div className="flex gap-2 sm:pb-6">
              <Button type="submit" loading={saving}>
                Speichern
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Abbrechen
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-600">
            {model.prescriptionKnown ? (
              <>Berechnet mit deiner <Term k="vorschreibung" /> von {formatEuro(model.quarterlyAmount)} pro Quartal. </>
            ) : (
              <>Für eine genauere Berechnung trag den Betrag deiner aktuellen <Term k="vorschreibung" /> ein. </>
            )}
            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>
              {model.prescriptionKnown ? 'Ändern' : 'Vorschreibung eintragen'}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
