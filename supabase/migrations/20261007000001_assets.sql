-- Anlagen: Geräte über 1.000 € (netto, bei Kleinunternehmern brutto) werden über die Nutzungsdauer abgeschrieben.
-- Die Abschreibung pro Jahr berechnet der Client (linear, Halbjahresregel) – E1a KZ 9130.
CREATE TABLE public.assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  description       TEXT NOT NULL DEFAULT '',
  category_label    TEXT NOT NULL,
  amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),  -- Brutto
  amount_net        NUMERIC(10,2) CHECK (amount_net IS NULL OR (amount_net > 0 AND amount_net <= amount)),
  -- Anschaffungskosten: netto (Vorsteuer holt man sich zurück), bei Kleinunternehmern brutto
  cost              NUMERIC(10,2) GENERATED ALWAYS AS (COALESCE(amount_net, amount)) STORED,
  useful_life_years INTEGER NOT NULL CHECK (useful_life_years BETWEEN 2 AND 50),
  purchase_date     DATE NOT NULL,  -- Kauf bzw. Inbetriebnahme
  receipt_url       TEXT,  -- Pfad im Storage-Bucket 'receipts'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assets_user_date_idx ON public.assets (user_id, purchase_date DESC);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_all_own" ON public.assets
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Kategorie heißt jetzt ohne Fachbegriff „Geräte & Ausrüstung“
UPDATE public.expenses
SET category_label = 'Geräte & Ausrüstung'
WHERE category_label = 'Geräte & Ausrüstung (AfA)';

-- Bisher sofort abgesetzte Geräte über 1.000 € waren falsch: als Anlage mit 3 Jahren Nutzungsdauer übernehmen
WITH moved AS (
  DELETE FROM public.expenses
  WHERE category_label = 'Geräte & Ausrüstung'
    AND COALESCE(amount_net, amount) > 1000
  RETURNING user_id, description, category_label, amount, amount_net, expense_date, receipt_url, created_at
)
INSERT INTO public.assets (user_id, description, category_label, amount, amount_net, useful_life_years, purchase_date, receipt_url, created_at)
SELECT user_id, description, category_label, amount, amount_net, 3, expense_date, receipt_url, created_at
FROM moved;
