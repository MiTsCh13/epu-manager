-- read-receipt: Lesevorgang vor dem Aufruf als „pending“ eintragen – so zählen auch gleichzeitige Anfragen
-- sofort gegen das Tageslimit. Index auf created_at für das globale Limit über alle Konten.
ALTER TABLE public.receipt_scans DROP CONSTRAINT receipt_scans_status_check;
ALTER TABLE public.receipt_scans ADD CONSTRAINT receipt_scans_status_check CHECK (status IN ('pending', 'ok', 'refusal', 'error'));
CREATE INDEX receipt_scans_created_idx ON public.receipt_scans (created_at DESC);
