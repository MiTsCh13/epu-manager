import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Laptop, Plus, ReceiptEuro, Repeat, ScanText } from 'lucide-react';
import { useAuth, useProfileFor } from '@/contexts/AuthContext';
import { useExpensesData } from '@/hooks/useExpensesData';
import { useRecurring } from '@/hooks/useRecurring';
import { countsUnder, EXPENSE_CATEGORIES } from '@/constants/expenseCategories';
import { categoryContextFor, countsAlongsidePauschal, expenseTotals, pauschalExtrasFor } from '@/lib/expenses';
import { calculateArbeitsplatzpauschale, calculatePauschaleExpenses, getPauschRate, otherIncomeAmount } from '@/lib/profit';
import { sumDepreciation } from '@/lib/assets';
import { formatEuro } from '@/lib/money';
import { deleteReceipt } from '@/lib/receipts';
import { supabase } from '@/lib/supabase';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { AssetList } from '@/components/expenses/AssetList';
import { ImportLink } from '@/components/import/ImportLink';
import { YearSelect } from '@/components/ui/YearSelect';
import { ExpenseFormModal, type ExpenseEntry, type ReceiptScan } from '@/components/expenses/ExpenseForm';
import { useReceiptScanner } from '@/components/expenses/ReceiptScanner';
import { WindowReceiptDrop } from '@/components/expenses/ReceiptDrop';
import { takePendingReceipt } from '@/lib/pendingReceipt';
import type { ReceiptPrefill } from '@/lib/receiptPrefill';
import { ExpenseBrowser } from '@/components/expenses/ExpenseBrowser';
import { SvsPaymentsSection } from '@/components/expenses/SvsPaymentsSection';
import { RecurringDueList, RecurringSection } from '@/components/expenses/Recurring';
import { ClientListSkeleton } from '@/components/clients/ClientList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Term } from '@/components/ui/Tooltip';
import type { Expense, IndustryType, OtherIncomeKind, PauschType, ProfitMethod } from '@/types';

type Tab = 'ausgaben' | 'anlagen' | 'wiederkehrend';

export default function Expenses() {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  // Steuer-Einstellungen des gewählten Jahres (Gewinnermittlung, Arbeitsplatz zu Hause, …)
  const settings = useProfileFor(year);
  const data = useExpensesData(year);
  const recurring = useRecurring();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry>(null);
  const [scan, setScan] = useState<ReceiptScan | null>(null);
  const [deleting, setDeleting] = useState<ExpenseEntry>(null);
  const [tab, setTab] = useState<Tab>('ausgaben');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const openEdit = (expense: Expense) => {
    setScan(null);
    setEditing({ kind: 'expense', expense });
    setFormOpen(true);
  };
  // Gerade übernommene Zahlung einer Serie gleich bearbeiten (kann in einem anderen Jahr liegen → direkt laden)
  const openExpenseById = async (id: string) => {
    const { data: expense } = await supabase.from('expenses').select('*').eq('id', id).single();
    if (expense) openEdit(expense);
    else toast.error('Die Ausgabe konnte nicht geöffnet werden.');
  };

  // Vom Dashboard „Ausgabe erfassen“ → Formular direkt öffnen; „Anpassen“ einer Serien-Zahlung → diese bearbeiten
  useEffect(() => {
    const editId = searchParams.get('bearbeiten');
    if (searchParams.get('neu') !== null) {
      setEditing(null);
      setScan(null);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    } else if (editId) {
      void openExpenseById(editId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Sprungmarke #wiederkehrend aus der Übersicht erst nach dem Laden anspringen
  const location = useLocation();
  const { hash } = location;
  const navigate = useNavigate();
  // Bei Einnahmen-Ausgaben-Rechnung liegen die Serien im Reiter „Wiederkehrend“ → den zuerst öffnen
  useEffect(() => {
    if (hash === '#wiederkehrend' && settings?.profit_method !== 'pauschal') setTab('wiederkehrend');
  }, [hash, settings?.profit_method]);
  useEffect(() => {
    if (!data.loading && !recurring.loading && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [data.loading, recurring.loading, hash, tab]);

  const reloadAll = async () => {
    await Promise.all([recurring.reload(), data.reload()]);
  };
  const { byId } = recurring;
  const intervalOf = useCallback((e: Expense) => (e.recurring_id ? (byId.get(e.recurring_id)?.interval_months ?? null) : null), [byId]);
  const editingSeries = editing?.kind === 'expense' && editing.expense.recurring_id ? (recurring.byId.get(editing.expense.recurring_id) ?? null) : null;

  const profitMethod = (settings?.profit_method ?? 'euer') as ProfitMethod;
  const pauschType = (settings?.pausch_type ?? null) as PauschType | null;
  const industryType = (settings?.industry_code ?? null) as IndustryType | null;
  const pauschal = profitMethod === 'pauschal';
  const context = categoryContextFor(settings);

  const totals = expenseTotals(
    data.expenses.map((e) => ({ ...e, amount: Number(e.amount), deductible_amount: e.deductible_amount === null ? null : Number(e.deductible_amount) })),
  );
  const deductible = totals.deductible;
  // Pauschalierung: Satz × Umsatz (ohne weiterverrechnete Reisekosten) + was zusätzlich zählt
  const pauschRate = pauschal ? getPauschRate(pauschType ?? 'ku', industryType ?? undefined) : 0;
  const pauschaleOnly = pauschal ? calculatePauschaleExpenses(data.revenue, pauschRate, totals.reimbursedTravel) : 0;
  const pauschalExtras = pauschal ? pauschalExtrasFor(totals, pauschType) : 0;
  const svsPaid = data.svsPayments.reduce((s, p) => s + Number(p.amount), 0);
  const depreciation = sumDepreciation(
    data.assets.map((a) => ({ cost: Number(a.cost ?? a.amount_net ?? a.amount), purchase_date: a.purchase_date, useful_life_years: a.useful_life_years })),
    year,
  );
  const otherKind = (settings?.other_income_kind ?? null) as OtherIncomeKind | null;
  const app = calculateArbeitsplatzpauschale({
    homeOffice: settings?.home_office ?? null,
    otherIncomeKind: otherKind,
    otherIncomeAmount: otherIncomeAmount(otherKind, settings?.other_income_amount == null ? null : Number(settings.other_income_amount)),
    year,
    registrationDate: profile?.svs_registration_date ? new Date(profile.svs_registration_date) : null,
  });

  // Alles, was den Gewinn mindert: Ausgaben (bzw. Pauschale + Extras), Abschreibung, SVS, Arbeitsplatzpauschale
  const totalDeductible = (pauschal ? pauschaleOnly + pauschalExtras : deductible + depreciation) + svsPaid + app.amount;
  // Kacheln vor „Gesamt absetzbar“ – bestimmt, ob die Gesamt-Kachel eine Lücke füllt oder eine eigene Zeile bekommt
  const partTiles = 2 + (!pauschal && depreciation > 0 ? 1 : 0) + (app.amount > 0 ? 1 : 0);

  // Was bei der gewählten Pauschalierung zusätzlich zählt (Reisekosten nur weiterverrechnet)
  const pauschalAllowed = EXPENSE_CATEGORIES.filter((c) => countsUnder(c, 'pauschal', pauschType)).map((c) =>
    c.pauschalOnlyReimbursed ? `${c.label} (nur weiterverrechnet)` : c.label,
  );

  const openNew = () => {
    setEditing(null);
    setScan(null);
    setFormOpen(true);
  };
  const openScan = (s: ReceiptScan) => {
    setEditing(null);
    setScan(s);
    setFormOpen(true);
  };
  const scanner = useReceiptScanner({ onExpense: openScan, onAddSvs: data.addSvsPayment });
  // Beleg im offenen Formular importiert: Formular schließen, auslesen, mit Vorschlag wieder öffnen
  const importFromForm = (file: File) => {
    setFormOpen(false);
    scanner.start(file);
  };

  // Beleg aus der Übersicht (Drag & Drop oder „Beleg importieren“) → gleich auslesen
  useEffect(() => {
    const file = takePendingReceipt();
    if (file) scanner.start(file);
  }, []); // nur beim Öffnen der Seite

  // Vom Assistenten: Fahrt als vorausgefülltes Formular öffnen (auch wenn die Seite schon offen ist)
  useEffect(() => {
    const prefill = (location.state as { assistantExpense?: ReceiptPrefill } | null)?.assistantExpense;
    if (!prefill) return;
    openScan({ file: null, prefill, source: 'assistant', id: crypto.randomUUID() });
    // Zustand verbrauchen – sonst öffnet „Zurück“ bzw. Neuladen das Formular noch einmal
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.key]);

  const deletingRecord = deleting?.kind === 'asset' ? deleting.asset : (deleting?.expense ?? null);

  async function handleDelete() {
    if (!deleting || !deletingRecord) return;
    setDeleteBusy(true);
    const r = deleting.kind === 'asset' ? await data.deleteAsset(deletingRecord.id) : await data.deleteExpense(deletingRecord.id);
    setDeleteBusy(false);
    if (r.error) toast.error(r.error);
    else {
      if (deletingRecord.receipt_url) await deleteReceipt(deletingRecord.receipt_url);
      toast.success(deleting.kind === 'asset' ? 'Anlage gelöscht' : 'Ausgabe gelöscht');
    }
    setDeleting(null);
  }


  return (
    <PageWrapper
      title="Ausgaben"
      description={
        pauschal
          ? 'Bei Pauschalierung gilt ein fixer Prozentsatz als Ausgaben. Einzeln erfasst du nur, was zusätzlich zählt.'
          : 'Alles, was du für dein Business ausgibst – und was davon absetzbar ist.'
      }
      actions={
        <>
          <YearSelect value={year} onChange={setYear} extraYears={data.years} />
          <ImportLink />
          <Button
            variant="secondary"
            icon={<ScanText className="h-4 w-4" />}
            onClick={scanner.pick}
            title="Foto oder PDF – Klaro liest Betrag, Datum und Kategorie automatisch aus"
          >
            Beleg importieren
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            Ausgabe erfassen
          </Button>
        </>
      }
    >
      {data.loading ? (
        <ClientListSkeleton />
      ) : data.error ? (
        <div className="space-y-3">
          <Alert type="critical">{data.error}</Alert>
          <Button variant="secondary" onClick={() => void data.reload()}>
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          <RecurringDueList due={recurring.due} onChanged={reloadAll} onAdjust={(id) => void openExpenseById(id)} />

          <section aria-label={`Summe Ausgaben ${year}`} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
            {/* Zahlen unten bündig: Kacheln strecken sich auf gleiche Höhe, die Zahl sitzt am unteren Rand.
                Breiter Bildschirm: alle Kacheln gleich breit in einer Reihe; sonst je zwei, „Gesamt absetzbar“ füllt die
                Lücke bzw. die ganze Zeile. */}
            <div className="-mx-3 grid grid-cols-2 gap-x-3 gap-y-1 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none">
              <SumTile
                label={pauschal ? `Ausgaben ${year}` : <><Term k="absetzbar">Absetzbare</Term> Ausgaben {year}</>}
                value={pauschal ? pauschaleOnly + pauschalExtras : deductible}
                testId="expenses-total"
              />
              {!pauschal && depreciation > 0 && (
                <SumTile label={<><Term k="abschreibung">Abschreibung</Term> {year}</>} value={depreciation} testId="depreciation-total" />
              )}
              <SumTile label={<><Term k="svs">SVS-Beiträge</Term> {year}</>} value={svsPaid} />
              {app.amount > 0 && (
                <SumTile
                  label={<><Term k="arbeitsplatzpauschale" />{app.months < 12 && ` (${app.months} Monate)`}</>}
                  value={app.amount}
                  testId="arbeitsplatzpauschale"
                />
              )}
              <SumTile
                label={<><Term k="gesamtAbsetzbar" /> {year}</>}
                value={totalDeductible}
                highlight
                wide={partTiles % 2 === 0}
                testId="expenses-grand-total"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {settings?.home_office === null ? (
                <p className="text-sm text-slate-600 sm:max-w-md">
                  Arbeitest du von zu Hause?{' '}
                  <Link to="/einstellungen#steuer" className="font-semibold text-primary hover:underline">
                    In den Einstellungen angeben
                  </Link>{' '}
                  – dann zieht Klaro die <Term k="arbeitsplatzpauschale" /> automatisch ab.
                </p>
              ) : (
                <span />
              )}
              <Link to="/gewinn" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Gewinn & Hochrechnung ansehen
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          {pauschal ? (
            <div className="space-y-6">
              <RecurringSection series={recurring.series} onChanged={reloadAll} />
              <PauschalCard
                year={year}
                revenue={data.revenue}
                rate={pauschRate}
                reimbursedTravel={totals.reimbursedTravel}
                pauschaleExpenses={pauschaleOnly}
                extras={pauschalExtras}
              />
              <section className="space-y-3" aria-labelledby="pauschal-extras-heading">
                <div>
                  <h2 id="pauschal-extras-heading" className="text-lg font-semibold text-slate-900">
                    Zusätzlich absetzbar {year}: {formatEuro(pauschalExtras)}
                  </h2>
                  <p className="text-sm text-slate-600">
                    Neben der Pauschale zählen nur: {pauschalAllowed.join(', ')}. Dazu kommen SVS-Beiträge und die{' '}
                    <Term k="arbeitsplatzpauschale" />.
                  </p>
                </div>
                <ExpenseBrowser
                  expenses={data.expenses}
                  context={context}
                  counts={(e) => countsAlongsidePauschal(e, pauschType ?? 'ku')}
                  onEdit={openEdit}
                  intervalOf={intervalOf}
                  onDelete={(expense) => setDeleting({ kind: 'expense', expense })}
                  onRecategorize={data.recategorizeExpenses}
                  onDeleteMany={data.deleteExpenses}
                  empty={
                    <EmptyState
                      icon={ReceiptEuro}
                      title="Nichts Zusätzliches erfasst"
                      description="Hast du eine Öffi-Karte, die du auch beruflich nutzt? Dann erfasse sie – die Hälfte zählt zusätzlich zur Pauschale."
                      action={
                        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
                          Ausgabe erfassen
                        </Button>
                      }
                    />
                  }
                />
              </section>
            </div>
          ) : (
            <section className="space-y-3" aria-label={`Ausgaben und Anlagen ${year}`}>
              <div role="tablist" aria-label="Ansicht" className="flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1 sm:inline-flex">
                {(
                  [
                    ['ausgaben', 'Ausgaben', data.expenses.length],
                    ['anlagen', 'Anlagen', data.assets.length],
                    ['wiederkehrend', 'Wiederkehrend', recurring.series.length],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`tab-${value}`}
                    aria-selected={tab === value}
                    aria-controls={value === 'wiederkehrend' ? 'wiederkehrend' : `panel-${value}`}
                    onClick={() => setTab(value)}
                    className={`min-h-[36px] flex-1 whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-3 ${
                      tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>

              {tab === 'ausgaben' ? (
                <div role="tabpanel" id="panel-ausgaben" aria-labelledby="tab-ausgaben" className="space-y-3">
                  <p className="text-sm text-slate-600">
                    <Term k="absetzbar">Absetzbar</Term> {year}: {formatEuro(deductible)}
                  </p>
                  <ExpenseBrowser
                    expenses={data.expenses}
                    context={context}
                    onEdit={openEdit}
                    intervalOf={intervalOf}
                    onDelete={(expense) => setDeleting({ kind: 'expense', expense })}
                    onRecategorize={data.recategorizeExpenses}
                    onDeleteMany={data.deleteExpenses}
                    empty={
                      <EmptyState
                        icon={ReceiptEuro}
                        title={`Noch keine Ausgaben ${year === currentYear ? 'dieses Jahr' : `in ${year}`}`}
                        description="Erfasse deine erste Ausgabe – am besten gleich nach dem Kauf, mit Foto vom Beleg."
                        action={
                          <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
                            Ausgabe erfassen
                          </Button>
                        }
                      />
                    }
                  />
                </div>
              ) : tab === 'wiederkehrend' ? (
                <div role="tabpanel" id="wiederkehrend" aria-labelledby="tab-wiederkehrend" className="space-y-3">
                  {recurring.series.length === 0 ? (
                    <EmptyState
                      icon={Repeat}
                      title="Noch keine wiederkehrenden Ausgaben"
                      description="Miete, Software-Abo, Versicherung? Hak beim Erfassen „Wiederkehrende Ausgabe“ an – dann erinnert Klaro dich an jede Zahlung oder bucht sie automatisch."
                      action={
                        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
                          Ausgabe erfassen
                        </Button>
                      }
                    />
                  ) : (
                    <RecurringSection series={recurring.series} onChanged={reloadAll} inTab />
                  )}
                </div>
              ) : (
                <div role="tabpanel" id="panel-anlagen" aria-labelledby="tab-anlagen" className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Geräte über 1.000 € setzt du nicht auf einmal ab: Klaro verteilt den Kaufpreis auf die Jahre, in denen du
                    sie nutzt. Absetzbar {year}: <span className="font-semibold tabular-nums text-slate-900">{formatEuro(depreciation)}</span>
                  </p>
                  {data.assets.length === 0 ? (
                    <EmptyState
                      icon={Laptop}
                      title="Noch keine Anlagen"
                      description="Kaufst du ein Gerät über 1.000 €, erfasst du es ganz normal als Ausgabe. Klaro erkennt es und legt es hier an."
                      action={
                        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
                          Ausgabe erfassen
                        </Button>
                      }
                    />
                  ) : (
                    <AssetList
                      assets={data.assets}
                      year={year}
                      onEdit={(asset) => {
                        setScan(null);
                        setEditing({ kind: 'asset', asset });
                        setFormOpen(true);
                      }}
                      onDelete={(asset) => setDeleting({ kind: 'asset', asset })}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          <SvsPaymentsSection
            year={year}
            payments={data.svsPayments}
            onAdd={data.addSvsPayment}
            onUpdate={data.updateSvsPayment}
            onDelete={data.deleteSvsPayment}
          />
        </div>
      )}

      <ExpenseFormModal
        key={editing ? `${editing.kind}-${editing.kind === 'asset' ? editing.asset.id : editing.expense.id}` : scan ? (scan.file ? `scan-${scan.file.name}-${scan.file.lastModified}` : `scan-${scan.id}`) : 'new'}
        open={formOpen}
        entry={editing}
        scan={scan}
        series={editingSeries}
        onSeriesChanged={() => void recurring.reload()}
        onImportReceipt={importFromForm}
        onClose={() => setFormOpen(false)}
        onSaveExpense={data.saveExpense}
        onSaveAsset={data.saveAsset}
        onDeleteExpense={data.deleteExpense}
        onDeleteAsset={data.deleteAsset}
      />

      {scanner.elements}
      <WindowReceiptDrop onFile={scanner.start} enabled={!formOpen && !scanner.busy && !deleting} />

      <Modal
        open={!!deleting}
        onClose={() => !deleteBusy && setDeleting(null)}
        size="sm"
        title={deleting?.kind === 'asset' ? 'Anlage löschen?' : 'Ausgabe löschen?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={() => void handleDelete()}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          „{deletingRecord?.description}“ über {deletingRecord && formatEuro(Number(deletingRecord.amount))} wird gelöscht
          {deletingRecord?.receipt_url ? ' – inklusive Beleg' : ''}.
          {deleting?.kind === 'expense' && deleting.expense.recurring_id && ' Sie gehört zu einer Serie – Klaro schlägt diese Zahlung nicht noch einmal vor.'}
        </p>
      </Modal>
    </PageWrapper>
  );
}

function PauschalCard({
  year,
  revenue,
  rate,
  reimbursedTravel,
  pauschaleExpenses,
  extras,
}: {
  year: number;
  revenue: number;
  rate: number;
  reimbursedTravel: number;
  pauschaleExpenses: number;
  extras: number;
}) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" aria-labelledby="pauschal-heading">
      <h2 id="pauschal-heading" className="text-lg font-semibold text-slate-900">
        <Term k="pauschalierung">Pauschale</Term> Ausgaben {year}: {formatEuro(pauschaleExpenses)}
      </h2>
      <p className="text-sm text-slate-600" data-testid="pauschal-basis">
        {Math.round(rate * 100)} % von {formatEuro(Math.max(revenue - reimbursedTravel, 0))} Einnahmen
        {reimbursedTravel > 0 && ` (ohne ${formatEuro(reimbursedTravel)} weiterverrechnete Reisekosten)`}
        {extras > 0 && ` · dazu ${formatEuro(extras)} einzeln erfasst`}
      </p>
      <Alert type="info">
        Für die Pauschale brauchst du keine Belege – das Finanzamt akzeptiert den Prozentsatz automatisch. Belege brauchst
        du nur für das, was du unten zusätzlich erfasst.
      </Alert>
    </section>
  );
}

function SumTile({ label, value, highlight, wide, testId }: { label: ReactNode; value: number; highlight?: boolean; wide?: boolean; testId?: string }) {
  return (
    <div className={`flex flex-col justify-between gap-1 rounded-xl p-3 ${wide ? 'col-span-2 xl:col-span-1' : ''} ${highlight ? 'bg-primary-50 ring-1 ring-primary-100' : ''}`}>
      <p className={`text-sm ${highlight ? 'font-medium text-primary-900' : 'text-slate-600'}`}>{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${highlight ? 'text-primary-900' : 'text-slate-900'}`} data-testid={testId}>
        {formatEuro(value)}
      </p>
    </div>
  );
}
