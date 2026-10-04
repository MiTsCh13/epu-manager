-- Arbeitsplatzpauschale und andere Einkünfte (für die Einkommensteuer-Schätzung).
-- NULL = noch nicht beantwortet (bestehende Profile werden in den Einstellungen danach gefragt).
ALTER TABLE public.profiles
  ADD COLUMN home_office BOOLEAN,
  ADD COLUMN other_income_kind TEXT CHECK (other_income_kind IN ('none', 'employment', 'pension')),
  ADD COLUMN other_income_amount NUMERIC(12,2) CHECK (other_income_amount >= 0);

COMMENT ON COLUMN public.profiles.home_office IS
  'Arbeitet von zu Hause, kein anderer Arbeitsraum außer Haus → Arbeitsplatzpauschale (300 € bzw. 1.200 €).';
COMMENT ON COLUMN public.profiles.other_income_kind IS
  'Andere Einkünfte neben der Selbständigkeit: none | employment (Gehalt) | pension.';
COMMENT ON COLUMN public.profiles.other_income_amount IS
  'Zu versteuerndes Jahreseinkommen aus Gehalt/Pension (Lohnzettel KZ 245), ungefähr.';
