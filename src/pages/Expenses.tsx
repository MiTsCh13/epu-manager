import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Laptop, Plus, ReceiptEuro, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useExpensesData } from '@/hooks/useExpensesData';
import { countsUnder, EXPENSE_CATEGORIES } from '@/constants/expenseCategories';
import { countsAlongsidePauschal, expenseTotals, pauschalExtrasFor } from '@/lib/expenses';
import { calculateArbeitsplatzpauschale, calculatePauschaleExpenses, getPauschRate, otherIncomeAmount } from '@/lib/profit';
import { sumDepreciation } from '@/lib/assets';
import { formatEuro } from '@/lib/money';
import { deleteReceipt } from '@/lib/receipts';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { AssetList } from '@/components/expenses/AssetList';
import { ExpenseFormModal, type ExpenseEntry } from '@/components/expenses/ExpenseForm';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { SvsPaymentsSection } from '@/components/expenses/SvsPaymentsSection';
import { ClientListSkeleton } from '@/components/clients/ClientList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Term } from '@/components/ui/Tooltip';
import type { IndustryType, OtherIncomeKind, PauschType, ProfitMethod } from '@/types';

type Tab = 'ausgaben' | 'anlagen';

export default function Expenses() {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const data = useExpensesData(year);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry>(null);
  const [deleting, setDeleting] = useState<ExpenseEntry>(null);
  const [tab, setTab] = useState<Tab>('ausgaben');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Vom Dashboard „Ausgabe erfassen“ → Formular direkt öffnen
  useEffect(() => {
    if (searchParams.get('neu') !== null) {
      setEditing(null);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const profitMethod = (profile?.profit_method ?? 'euer') as ProfitMethod;
  const pauschType = (profile?.pausch_type ?? null) as PauschType | null;
  const industryType = (profile?.industry_code ?? null) as IndustryType | null;
  const pauschal = profitMethod === 'pauschal';

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
  const otherKind = (profile?.other_income_kind ?? null) as OtherIncomeKind | null;
  const app = calculateArbeitsplatzpauschale({
    homeOffice: profile?.home_office ?? null,
    otherIncomeKind: otherKind,
    otherIncomeAmount: otherIncomeAmount(otherKind, profile?.other_income_amount == null ? null : Number(profile.other_income_amount)),
    year,
    registrationDate: profile?.svs_registration_date ? new Date(profile.svs_registration_date) : null,
  });

  // Was bei der gewählten Pauschalierung zusätzlich zählt (Reisekosten nur weiterverrechnet)
  const pauschalAllowed = EXPENSE_CATEGORIES.filter((c) => countsUnder(c, 'pauschal', pauschType)).map((c) =>
    c.pauschalOnlyReimbursed ? `${c.label} (nur weiterverrechnet)` : c.label,
  );

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

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

  const yearSelect = (
    <select
      aria-label="Jahr"
      value={year}
      onChange={(e) => setYear(Number(e.target.value))}
      className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );

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
          {yearSelect}
          <Link
            to="/importieren"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Aus Excel übernehmen
          </Link>
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
          <section aria-label={`Summe Ausgaben ${year}`} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className={`grid gap-6 ${!pauschal && depreciation > 0 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
              <div>
                <p className="text-sm text-slate-600">{pauschal ? `Ausgaben ${year}` : <><Term k="absetzbar">Absetzbare</Term> Ausgaben {year}</>}</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900" data-testid="expenses-total">
                  {formatEuro(pauschal ? pauschaleOnly + pauschalExtras : deductible)}
                </p>
              </div>
              {!pauschal && depreciation > 0 && (
                <div>
                  <p className="text-sm text-slate-600"><Term k="abschreibung">Abschreibung</Term> {year}</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900" data-testid="depreciation-total">
                    {formatEuro(depreciation)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-slate-600"><Term k="svs">SVS-Beiträge</Term> {year}</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{formatEuro(svsPaid)}</p>
              </div>
            </div>
            {app.amount > 0 && (
              <p className="text-sm text-slate-600 sm:max-w-xs" data-testid="arbeitsplatzpauschale">
                Dazu zieht Klaro automatisch die <Term k="arbeitsplatzpauschale" /> ab:{' '}
                <span className="font-semibold tabular-nums text-slate-900">{formatEuro(app.amount)}</span>
                {app.months < 12 && ` (${app.months} Monate)`}
              </p>
            )}
            {profile?.home_office === null && (
              <p className="text-sm text-slate-600 sm:max-w-xs">
                Arbeitest du von zu Hause?{' '}
                <Link to="/einstellungen#steuer" className="font-semibold text-primary hover:underline">
                  In den Einstellungen angeben
                </Link>{' '}
                – dann zieht Klaro die <Term k="arbeitsplatzpauschale" /> automatisch ab.
              </p>
            )}
            <Link to="/gewinn" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Gewinn & Hochrechnung ansehen
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          {pauschal ? (
            <div className="space-y-6">
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
                {data.expenses.length > 0 ? (
                  <ExpenseList
                    expenses={data.expenses}
                    counts={(e) => countsAlongsidePauschal(e, pauschType ?? 'ku')}
                    onEdit={(expense) => {
                      setEditing({ kind: 'expense', expense });
                      setFormOpen(true);
                    }}
                    onDelete={(expense) => setDeleting({ kind: 'expense', expense })}
                  />
                ) : (
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
                )}
              </section>
            </div>
          ) : (
            <section className="space-y-3" aria-label={`Ausgaben und Anlagen ${year}`}>
              <div role="tablist" aria-label="Ansicht" className="inline-flex rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ['ausgaben', `Ausgaben (${data.expenses.length})`],
                    ['anlagen', `Anlagen (${data.assets.length})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`tab-${value}`}
                    aria-selected={tab === value}
                    aria-controls={`panel-${value}`}
                    onClick={() => setTab(value)}
                    className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors ${
                      tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'ausgaben' ? (
                <div role="tabpanel" id="panel-ausgaben" aria-labelledby="tab-ausgaben" className="space-y-3">
                  <p className="text-sm text-slate-600">
                    <Term k="absetzbar">Absetzbar</Term> {year}: {formatEuro(deductible)}
                  </p>
                  {data.expenses.length === 0 ? (
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
                  ) : (
                    <ExpenseList
                      expenses={data.expenses}
                      onEdit={(expense) => {
                        setEditing({ kind: 'expense', expense });
                        setFormOpen(true);
                      }}
                      onDelete={(expense) => setDeleting({ kind: 'expense', expense })}
                    />
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

          <SvsPaymentsSection year={year} payments={data.svsPayments} onAdd={data.addSvsPayment} onDelete={data.deleteSvsPayment} />
        </div>
      )}

      <ExpenseFormModal
        key={editing ? `${editing.kind}-${editing.kind === 'asset' ? editing.asset.id : editing.expense.id}` : 'new'}
        open={formOpen}
        entry={editing}
        onClose={() => setFormOpen(false)}
        onSaveExpense={data.saveExpense}
        onSaveAsset={data.saveAsset}
        onDeleteExpense={data.deleteExpense}
        onDeleteAsset={data.deleteAsset}
      />

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
