-- Assistent (Edge Function „assistant“): Befehle zählen wie Belege im Protokoll receipt_scans – eigenes Tageslimit je Art.
ALTER TABLE public.receipt_scans DROP CONSTRAINT receipt_scans_kind_check;
ALTER TABLE public.receipt_scans
  ADD CONSTRAINT receipt_scans_kind_check CHECK (kind IN ('receipt', 'invoice_design', 'assistant'));
