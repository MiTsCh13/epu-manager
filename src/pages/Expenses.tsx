import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, ReceiptEuro } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useExpensesData } from '@/hooks/useExpensesData';
import { calculateProfit, getPauschRate, sumDeductibleExpenses } from '@/lib/profit';
import { formatEuro } from '@/lib/money';
import { deleteReceipt } from '@/lib/receipts';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { ExpenseFormModal } from '@/components/expenses/ExpenseForm';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { ProfitSummary } from '@/components/expenses/ProfitSummary';
import { SvsPaymentsSection } from '@/components/expenses/SvsPaymentsSection';
import { ClientListSkeleton } from '@/components/clients/ClientList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Term } from '@/components/ui/Tooltip';
import type { Expense, IndustryType, PauschType, ProfitMethod } from '@/types';

export default function Expenses() {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const data = useExpensesData(year);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const profitMethod = (profile?.profit_method ?? 'euer') as ProfitMethod;
  const pauschType = (profile?.pausch_type ?? null) as PauschType | null;
  const industryType = (profile?.industry_code ?? null) as IndustryType | null;
  const pauschal = profitMethod === 'pauschal';

  const deductible = sumDeductibleExpenses(
    data.expenses.map((e) => ({ amount: Number(e.amount), deductible_amount: e.deductible_amount === null ? null : Number(e.deductible_amount), is_bewirtung: e.is_bewirtung })),
  );
  const svsPaid = data.svsPayments.reduce((s, p) => s + Number(p.amount), 0);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const r = await data.deleteExpense(deleting.id);
    setDeleteBusy(false);
    if (r.error) toast.error(r.error);
    else {
      if (deleting.receipt_url) await deleteReceipt(deleting.receipt_url);
      toast.success('Ausgabe gelöscht');
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
      description={pauschal ? 'Bei Pauschalierung erfasst du nur deine SVS-Beiträge.' : 'Alles, was du für dein Business ausgibst – und was davon absetzbar ist.'}
      actions={
        <>
          {yearSelect}
          {!pauschal && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
              Ausgabe erfassen
            </Button>
          )}
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
          <ProfitSummary
            year={year}
            profitMethod={profitMethod}
            pauschType={pauschType}
            industryType={industryType}
            revenue={data.revenue}
            deductibleExpenses={deductible}
            svsPaid={svsPaid}
          />

          {pauschal ? (
            <PauschalCard year={year} revenue={data.revenue} pauschType={pauschType} industryType={industryType} />
          ) : (
            <section className="space-y-3" aria-labelledby="expenses-heading">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h2 id="expenses-heading" className="text-lg font-semibold text-slate-900">
                    Ausgaben {year}
                  </h2>
                  <p className="text-sm text-slate-600">
                    <Term k="absetzbar">Absetzbar</Term>: {formatEuro(deductible)}
                  </p>
                </div>
              </div>
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
                  onEdit={(e) => {
                    setEditing(e);
                    setFormOpen(true);
                  }}
                  onDelete={setDeleting}
                />
              )}
            </section>
          )}

          <SvsPaymentsSection year={year} payments={data.svsPayments} onAdd={data.addSvsPayment} onDelete={data.deleteSvsPayment} />
        </div>
      )}

      <ExpenseFormModal key={editing?.id ?? 'new'} open={formOpen} expense={editing} onClose={() => setFormOpen(false)} onSave={data.saveExpense} />

      <Modal
        open={!!deleting}
        onClose={() => !deleteBusy && setDeleting(null)}
        size="sm"
        title="Ausgabe löschen?"
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
          „{deleting?.description}“ über {deleting && formatEuro(Number(deleting.amount))} wird gelöscht
          {deleting?.receipt_url ? ' – inklusive Beleg' : ''}.
        </p>
      </Modal>
    </PageWrapper>
  );
}

function PauschalCard({
  year,
  revenue,
  pauschType,
  industryType,
}: {
  year: number;
  revenue: number;
  pauschType: PauschType | null;
  industryType: IndustryType | null;
}) {
  const rate = getPauschRate(pauschType ?? 'ku', industryType ?? undefined);
  const { pauschaleExpenses = 0 } = calculateProfit({
    profitMethod: 'pauschal',
    pauschType: pauschType ?? undefined,
    industryType: industryType ?? undefined,
    totalRevenue: revenue,
    totalExpenses: 0,
    svsPayments: 0,
  });
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" aria-labelledby="pauschal-heading">
      <h2 id="pauschal-heading" className="text-lg font-semibold text-slate-900">
        <Term k="pauschalierung">Pauschalierte</Term> Ausgaben {year}: {formatEuro(pauschaleExpenses)}
      </h2>
      <p className="text-sm text-slate-600">
        {Math.round(rate * 100)} % von {formatEuro(revenue)} Einnahmen
      </p>
      <Alert type="info">
        Bei Pauschalierung musst du keine einzelnen Ausgaben erfassen – das Finanzamt akzeptiert den Pauschalbetrag
        automatisch.
      </Alert>
    </section>
  );
}
