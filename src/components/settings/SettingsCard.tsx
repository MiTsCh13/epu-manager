import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { SettingsSectionState } from '@/hooks/useSettingsSection';
import type { ChangeNotice } from '@/lib/profileSettings';
import { TaxStartChoice } from './TaxYearParts';

/** Karte für einen Einstellungs-Abschnitt mit eigenem Speichern/Verwerfen. */
export function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  state,
  notices = [],
  children,
  after,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  state: SettingsSectionState;
  notices?: ChangeNotice[];
  children: ReactNode;
  /** Unter dem Formular (eigene Bedienelemente, z. B. Verlauf) */
  after?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}

      <form
        noValidate
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void state.save();
        }}
      >
        {children}

        {state.dirty && state.taxChanged && <TaxStartChoice id={`${state.section}-tax-start`} state={state} />}

        {state.dirty && notices.length > 0 && (
          <div className="mt-5 space-y-2" data-testid={`${id}-notices`}>
            {notices.map((n) => (
              <Alert key={n.id} type={n.type} title={n.title}>
                {n.text}
              </Alert>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
          {state.dirty && (
            <Button variant="ghost" onClick={state.reset} disabled={state.saving}>
              Verwerfen
            </Button>
          )}
          <Button type="submit" loading={state.saving} disabled={!state.dirty}>
            {state.dirty ? 'Änderungen speichern' : 'Gespeichert'}
          </Button>
        </div>
      </form>
      {after}
    </section>
  );
}
