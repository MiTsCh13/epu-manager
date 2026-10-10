-- Lese-Protokoll für zwei Arten: Belege (read-receipt) und Rechnungs-Vorlagen aus einem PDF (read-invoice-design).
-- Die Tageslimits zählen je Art getrennt; das globale Limit über alle Konten zählt beide zusammen.
ALTER TABLE public.receipt_scans
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'receipt' CHECK (kind IN ('receipt', 'invoice_design'));
CREATE INDEX receipt_scans_user_kind_created_idx ON public.receipt_scans (user_id, kind, created_at DESC);
