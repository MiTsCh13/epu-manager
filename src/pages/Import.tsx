import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { findCategoryById, isCategoryOffered, type CategoryContext } from '@/constants/expenseCategories';
import { fetchExisting, saveImport, type Sheet } from '@/lib/importData';
import {
  buildRecords,
  buildReviewRows,
  categoryValues,
  combineTables,
  findHeaderRow,
  guessAmountMode,
  guessCategoryValue,
  guessRoles,
  amountsLookNet,
  markDuplicates,
  readRows,
  summarize,
  targetCategoryId,
  type ImportSummary,
  type CategoryChoice,
  type ReviewRow,
} from '@/lib/importMapping';
import type { Table } from '@/lib/importParse';
import { toISODate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { calculateArbeitsplatzpauschale, otherIncomeAmount } from '@/lib/profit';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { CategoriesStep } from '@/components/import/CategoriesStep';
import { ColumnsStep, type ColumnSettings } from '@/components/import/ColumnsStep';
import { describeCounts, ImportHistory } from '@/components/import/ImportHistory';
import { ReviewStep } from '@/components/import/ReviewStep';
import { SourceStep } from '@/components/import/SourceStep';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { BusinessType, OtherIncomeKind, PauschType, ProfitMethod } from '@/types';

type Step = 'source' | 'columns' | 'categories' | 'review' | 'done';

const STEPS: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'source', label: 'Daten holen' },
  { id: 'columns', label: 'Spalten' },
  { id: 'categories', label: 'Kategorien' },
  { id: 'review', label: 'Prüfen' },
];

function tableOf(sheets: Sheet[], sheet: number | 'all'): Table {
  return sheet === 'all' ? combineTables(sheets.map((s) => s.table)) : (sheets[sheet]?.table ?? []);
}

/** Vorschläge für Überschrift, Spalten und Betragsspalte – neu, sobald Blatt oder Überschrift wechseln. */
function guessSettings(sheets: Sheet[], sheet: number | 'all', headerRow?: number): Pick<ColumnSettings, 'headerRow' | 'roles' | 'amountMode' | 'amountsNet'> {
  const table = tableOf(sheets, sheet);
  const header = headerRow ?? findHeaderRow(table);
  const roles = guessRoles(table, header);
  const sheetName = sheet === 'all' ? (sheets[0]?.name ?? '') : (sheets[sheet]?.name ?? '');
  return { headerRow: header, roles, amountMode: guessAmountMode(table, header, roles, sheetName), amountsNet: amountsLookNet(table, header, roles) };
}

export default function Import() {
  const { profile } = useAuth();
  const isKU = profile?.is_kleinunternehmer ?? true;
  const today = toISODate(new Date());
  const otherKind = (profile?.other_income_kind ?? null) as OtherIncomeKind | null;
  const context: CategoryContext = {
    businessType: (profile?.business_type as BusinessType | null) ?? null,
    profitMethod: (profile?.profit_method ?? 'euer') as ProfitMethod,
    pauschType: (profile?.pausch_type ?? null) as PauschType | null,
    smallApp:
      calculateArbeitsplatzpauschale({
        homeOffice: profile?.home_office ?? null,
        otherIncomeKind: otherKind,
        otherIncomeAmount: otherIncomeAmount(otherKind, profile?.other_income_amount == null ? null : Number(profile.other_income_amount)),
        year: new Date().getFullYear(),
      }).size === 'klein',
  };

  const [step, setStep] = useState<Step>('source');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [settings, setSettings] = useState<ColumnSettings | null>(null);
  const [categoryMap, setCategoryMap] = useState<Record<string, CategoryChoice>>({});
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const table = useMemo(() => (settings ? tableOf(sheets, settings.sheet) : []), [sheets, settings]);
  const rows = useMemo(
    () => (settings ? readRows(table, { ...settings, amountMode: settings.amountMode ?? 'expense', today }) : []),
    [table, settings, today],
  );
  const values = useMemo(() => categoryValues(rows), [rows]);

  function onLoaded(loaded: Sheet[], name: string) {
    // Erstes Blatt mit Daten vorauswählen
    const first = Math.max(0, loaded.findIndex((s) => s.table.length > 1));
    setSheets(loaded);
    setSourceName(name);
    setSettings({ sheet: first, defaultVat: 20, fallbackYear: new Date().getFullYear(), ...guessSettings(loaded, first) });
    setCategoryMap({});
    setStep('columns');
  }

  function changeSettings(patch: Partial<ColumnSettings>) {
    setSettings((s) => {
      if (!s) return s;
      if (patch.sheet !== undefined && patch.sheet !== s.sheet) return { ...s, ...patch, ...guessSettings(sheets, patch.sheet) };
      if (patch.headerRow !== undefined && patch.headerRow !== s.headerRow) return { ...s, ...patch, ...guessSettings(sheets, s.sheet, patch.headerRow) };
      return { ...s, ...patch };
    });
  }

  /** Vorschlag für einen Kategorie-Wert, passend zu dem, was der Nutzer erfassen kann. */
  function initialTarget(value: string, directions: Set<'in' | 'out'>): CategoryChoice {
    const guess = guessCategoryValue(value, directions);
    const onlyIncome = directions.size === 1 && directions.has('in');
    if (onlyIncome) return guess === 'skip' ? 'skip' : 'income';
    if (guess === 'auto') return guess;
    const cat = findCategoryById(targetCategoryId(guess) ?? '');
    if (!cat || isCategoryOffered(cat, context)) return guess;
    // Steckt bei Pauschalierung im Pauschalsatz; sonst (z. B. WKO bei Neuen Selbständigen) die Beschreibung entscheiden lassen
    return context.profitMethod === 'pauschal' ? 'skip' : 'auto';
  }

  function goCategories() {
    setCategoryMap((m) => Object.fromEntries(values.map((v) => [v.value, m[v.value] ?? initialTarget(v.value, v.directions)])));
    if (values.length > 0) setStep('categories');
    else void goReview();
  }

  async function goReview(map = categoryMap) {
    if (!settings) return;
    setBusy(true);
    const built = buildReviewRows(rows, map, context, { isKU, defaultVat: settings.defaultVat, amountsNet: settings.amountsNet });
    const dates = built.flatMap((r) => (r.date ? [r.date.iso] : [])).sort();
    try {
      const existing = dates.length ? await fetchExisting(dates[0]!, dates[dates.length - 1]!) : [];
      setReviewRows(markDuplicates(built, existing, isKU));
      setStep('review');
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.');
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    const summary = summarize(reviewRows, isKU);
    const { error } = await saveImport(sourceName, buildRecords(reviewRows, isKU), summary);
    setBusy(false);
    if (error) return void toast.error(error);
    setResult(summary);
    setHistoryKey((k) => k + 1);
    setStep('done');
    window.scrollTo({ top: 0 });
  }

  function restart() {
    setSheets([]);
    setSettings(null);
    setReviewRows([]);
    setResult(null);
    setStep('source');
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <PageWrapper
      title="Daten übernehmen"
      description="Bisherige Einnahmen und Ausgaben aus Excel übernehmen – und nahtlos in Klaro weitermachen."
    >
      <div className="space-y-8">
        {step !== 'done' && (
          <nav aria-label="Fortschritt">
            <ol className="grid grid-cols-4 gap-1.5">
              {STEPS.filter((s) => s.id !== 'categories' || values.length > 0 || step === 'source').map((s, i) => {
                const active = s.id === step;
                const doneStep = STEPS.findIndex((x) => x.id === s.id) < stepIndex;
                return (
                  <li key={s.id} aria-current={active ? 'step' : undefined}>
                    <span className={`block h-1.5 rounded-full ${active || doneStep ? 'bg-primary' : 'bg-slate-200'}`} />
                    <span className={`mt-1 block text-xs ${active ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                      {i + 1}. {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {step === 'source' && <SourceStep onLoaded={onLoaded} />}

        {step === 'columns' && settings && (
          <ColumnsStep
            sheets={sheets}
            table={table}
            settings={settings}
            rows={rows}
            isKU={isKU}
            onChange={changeSettings}
            onBack={restart}
            onNext={goCategories}
          />
        )}

        {step === 'categories' && (
          <CategoriesStep
            values={values}
            map={categoryMap}
            context={context}
            busy={busy}
            onChange={(value, target) => setCategoryMap((m) => ({ ...m, [value]: target }))}
            onBack={() => setStep('columns')}
            onNext={() => void goReview()}
          />
        )}

        {busy && step !== 'review' && <p className="text-sm text-slate-600">Klaro prüft, was es schon gibt …</p>}

        {step === 'review' && (
          <ReviewStep
            rows={reviewRows}
            isKU={isKU}
            context={context}
            saving={busy}
            onChange={(id, patch) => setReviewRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
            onBack={() => setStep(values.length > 0 ? 'categories' : 'columns')}
            onImport={() => void runImport()}
          />
        )}

        {step === 'done' && result && (
          <section className="space-y-4">
            <Alert type="success" title="Übernommen!">
              {describeCounts({
                incomes: result.incomes.count,
                expenses: result.expenses.count,
                assets: result.assets.count,
                svs_payments: result.svs_payments.count,
              })}
              {result.incomes.count > 0 && ` · Einnahmen ${formatEuro(result.incomes.total)}`}
              {result.expenses.count + result.assets.count > 0 && ` · Ausgaben ${formatEuro(result.expenses.total + result.assets.total)}`}
            </Alert>
            <div className="flex flex-wrap gap-2">
              <DoneLink to="/gewinn">Gewinn & Rücklagen ansehen</DoneLink>
              <DoneLink to="/ausgaben">Zu den Ausgaben</DoneLink>
              {result.incomes.count > 0 && <DoneLink to="/rechnungen">Zu den Einnahmen</DoneLink>}
              <Button variant="ghost" onClick={restart}>
                Weitere Datei übernehmen
              </Button>
            </div>
            <p className="text-sm text-slate-600">Etwas passt nicht? Unten kannst du den Import mit einem Klick rückgängig machen.</p>
          </section>
        )}

        {(step === 'source' || step === 'done') && <ImportHistory refreshKey={historyKey} />}
      </div>
    </PageWrapper>
  );
}

function DoneLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-white px-4 text-sm font-semibold text-primary ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
