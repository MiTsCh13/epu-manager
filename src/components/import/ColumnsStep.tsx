import { cellText, type Table } from '@/lib/importParse';
import { COLUMN_ROLE_LABELS, columnCount, rolesProblem, type AmountMode, type ColumnRole, type SourceRow } from '@/lib/importMapping';
import type { Sheet } from '@/lib/importData';
import { VAT_RATES } from '@/constants/tax2026';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Select } from '@/components/ui/Field';
import type { VatRate } from '@/types';

const PREVIEW_ROWS = 6;
const ROLES = Object.keys(COLUMN_ROLE_LABELS) as ColumnRole[];

export interface ColumnSettings {
  sheet: number | 'all';
  headerRow: number;
  roles: ColumnRole[];
  amountMode: AmountMode | null;
  defaultVat: VatRate;
  amountsNet: boolean; // Beträge ohne USt (nur USt-Pflichtige)
  fallbackYear: number;
}

/** Schritt 2: Blatt wählen, Überschrift und Spalten zuordnen, Bedeutung der Betragsspalte. */
export function ColumnsStep({
  sheets,
  table,
  settings,
  rows,
  isKU,
  onChange,
  onBack,
  onNext,
}: {
  sheets: Sheet[];
  table: Table;
  settings: ColumnSettings;
  rows: SourceRow[]; // live gelesen – für die Rückmeldung unten
  isKU: boolean;
  onChange: (patch: Partial<ColumnSettings>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const cols = columnCount(table);
  const { roles, headerRow } = settings;
  const header = headerRow >= 0 ? table[headerRow] : undefined;
  const preview = table.slice(headerRow + 1).filter((r) => r.some((c) => cellText(c) !== '')).slice(0, PREVIEW_ROWS);
  const singleAmount = roles.includes('amount') && !roles.includes('income') && !roles.includes('expense');
  const problem = rolesProblem(roles) ?? (singleAmount && !settings.amountMode ? 'Was steht in der Betragsspalte?' : null);
  const yearMissing = rows.some((r) => r.date?.yearMissing);
  const withProblems = rows.filter((r) => r.problem).length;
  const currentYear = new Date().getFullYear();

  function setRole(col: number, role: ColumnRole) {
    const next = [...roles];
    // Datum, Betrag & Co. gibt es nur einmal – die bisherige Spalte wird frei
    if (role !== 'description' && role !== 'ignore') next.forEach((r, i) => r === role && (next[i] = 'ignore'));
    if (role === 'income' || role === 'expense') next.forEach((r, i) => r === 'amount' && (next[i] = 'ignore'));
    if (role === 'amount') next.forEach((r, i) => (r === 'income' || r === 'expense') && (next[i] = 'ignore'));
    next[col] = role;
    onChange({ roles: next });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {sheets.length > 1 && (
            <Select
              label="Blatt"
              value={String(settings.sheet)}
              onChange={(e) => onChange({ sheet: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
              options={[
                ...sheets.map((s, i) => ({ value: String(i), label: s.name })),
                { value: 'all', label: `Alle ${sheets.length} Blätter (gleicher Aufbau)` },
              ]}
            />
          )}
          <Select
            label="Überschriften stehen in"
            value={String(headerRow)}
            onChange={(e) => onChange({ headerRow: Number(e.target.value) })}
            options={[
              { value: '-1', label: 'Keine Überschrift' },
              ...table.slice(0, 10).map((r, i) => ({
                value: String(i),
                label: `Zeile ${i + 1}: ${r.map(cellText).filter(Boolean).join(', ').slice(0, 50) || '(leer)'}`,
              })),
            ]}
          />
        </div>

        <div>
          <h2 className="font-semibold text-slate-900">Was steht in welcher Spalte?</h2>
          <p className="text-sm text-slate-600">Klaro hat einen Vorschlag gemacht. Spalten, die du nicht brauchst, bleiben auf „Nicht verwenden“.</p>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} scope="col" className="min-w-[150px] border-b border-slate-200 p-2 text-left align-bottom font-normal">
                    <span className="mb-1 block truncate text-xs font-semibold text-slate-500">{cellText(header?.[c]) || `Spalte ${c + 1}`}</span>
                    <select
                      aria-label={`Spalte ${cellText(header?.[c]) || c + 1}`}
                      value={roles[c] ?? 'ignore'}
                      onChange={(e) => setRole(c, e.target.value as ColumnRole)}
                      data-testid={`import-role-${c}`}
                      className={`min-h-[40px] w-full rounded-lg border px-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                        (roles[c] ?? 'ignore') === 'ignore' ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-primary/50 bg-primary-50 font-medium text-primary-900'
                      }`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {COLUMN_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className={`max-w-[220px] truncate border-b border-slate-100 p-2 ${(roles[c] ?? 'ignore') === 'ignore' ? 'text-slate-400' : 'text-slate-800'}`}>
                      {cellText(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {singleAmount && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
          <ChoiceCards<AmountMode>
            legend="Was steht in der Betragsspalte?"
            name="amount-mode"
            value={settings.amountMode}
            onChange={(amountMode) => onChange({ amountMode })}
            columns={3}
            options={[
              { value: 'expense', title: 'Nur Ausgaben' },
              { value: 'income', title: 'Nur Einnahmen' },
              { value: 'signed', title: 'Beides', description: 'Einnahmen positiv, Ausgaben mit Minus' },
            ]}
          />
        </section>
      )}

      {!isKU && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
          <ChoiceCards<boolean>
            legend="Sind die Beträge mit oder ohne Umsatzsteuer?"
            name="amounts-net"
            value={settings.amountsNet}
            onChange={(amountsNet) => onChange({ amountsNet })}
            columns={2}
            options={[
              { value: false, title: 'Brutto (mit USt)', description: 'So, wie es unten auf der Rechnung steht' },
              { value: true, title: 'Netto (ohne USt)', description: 'Klaro rechnet die USt dazu' },
            ]}
          />
        </section>
      )}

      {(!isKU || yearMissing) && (
        <section className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 sm:p-6">
          {!isKU && (
            <Select
              label="USt-Satz, wenn keiner angegeben ist"
              hint="Versicherungen, Bankgebühren, Zinsen und WKO-Umlage rechnet Klaro automatisch ohne USt."
              value={String(settings.defaultVat)}
              onChange={(e) => onChange({ defaultVat: Number(e.target.value) as VatRate })}
              options={[...VAT_RATES].reverse().map((v) => ({ value: String(v), label: `${v} %` }))}
            />
          )}
          {yearMissing && (
            <Select
              label="Jahr für Datumsangaben ohne Jahr"
              hint="Manche Daten stehen ohne Jahr da, z. B. „15.03.“."
              value={String(settings.fallbackYear)}
              onChange={(e) => onChange({ fallbackYear: Number(e.target.value) })}
              options={[currentYear, currentYear - 1, currentYear - 2].map((y) => ({ value: String(y), label: String(y) }))}
            />
          )}
        </section>
      )}

      {problem ? (
        <Alert type="warning">{problem}</Alert>
      ) : (
        <p className="text-sm text-slate-600" data-testid="import-row-count">
          {rows.length === 1 ? '1 Eintrag' : `${rows.length} Einträge`} erkannt
          {withProblems > 0 && ` – bei ${withProblems} stimmt etwas nicht, das siehst du gleich im Detail`}.
        </p>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          Zurück
        </Button>
        <Button onClick={onNext} disabled={!!problem || rows.length === 0}>
          Weiter
        </Button>
      </div>
    </div>
  );
}
