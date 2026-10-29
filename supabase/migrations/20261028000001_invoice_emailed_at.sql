-- Rechnung per E-Mail verschickt: Zeitpunkt merken (Teilen-Menü bzw. Bestätigung nach Mail-Programm).
-- invoices_protect_issued vergleicht nur die Rechnungsinhalte – emailed_at bleibt bei ausgestellten Rechnungen änderbar.
ALTER TABLE public.invoices
  ADD COLUMN emailed_at TIMESTAMPTZ;
