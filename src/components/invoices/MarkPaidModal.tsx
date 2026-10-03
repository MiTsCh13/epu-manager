import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { toISODate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';

export function MarkPaidModal({
  invoice,
  onClose,
  onConfirm,
}: {
  invoice: { invoice_number: string; total: number } | null;
  onClose: () => void;
  onConfirm: (paidAt: string) => Promise<void>;
}) {
  const [date, setDate] = useState(toISODate(new Date()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (invoice) setDate(toISODate(new Date()));
  }, [invoice]);

  return (
    <Modal
      open={!!invoice}
      onClose={() => !busy && onClose()}
      size="sm"
      title="Als bezahlt markieren"
      description={invoice && `Rechnung ${invoice.invoice_number} über ${formatEuro(invoice.total)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            loading={busy}
            disabled={!date}
            onClick={async () => {
              setBusy(true);
              await onConfirm(date);
              setBusy(false);
            }}
          >
            Bezahlt
          </Button>
        </>
      }
    >
      <Field
        label="Zahlungseingang am"
        type="date"
        value={date}
        max={toISODate(new Date())}
        onChange={(e) => setDate(e.target.value)}
        hint="Zählt ab diesem Tag zu deinen Einnahmen."
      />
    </Modal>
  );
}
