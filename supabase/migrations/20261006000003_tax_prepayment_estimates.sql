-- Gewinn & Rücklagen: Einkommensteuer-Vorauszahlung, erwarteter Jahresumsatz, erledigte Steuerbescheide.
ALTER TABLE public.profiles
  ADD COLUMN est_prepayment_quarterly NUMERIC(10,2) CHECK (est_prepayment_quarterly >= 0),
  ADD COLUMN revenue_estimate NUMERIC(12,2) CHECK (revenue_estimate >= 0),
  ADD COLUMN revenue_estimate_year INTEGER,
  ADD COLUMN assessed_through_year INTEGER;

COMMENT ON COLUMN public.profiles.est_prepayment_quarterly IS
  'Einkommensteuer-Vorauszahlung pro Quartal laut Bescheid (keine Betriebsausgabe, daher nicht in expenses).';
COMMENT ON COLUMN public.profiles.revenue_estimate IS
  'Vom Nutzer geschätzter Jahresumsatz (netto) für revenue_estimate_year – ersetzt die lineare Hochrechnung.';
COMMENT ON COLUMN public.profiles.assessed_through_year IS
  'Steuerbescheid und SVS-Nachbemessung sind bis einschließlich dieses Jahres erledigt.';
