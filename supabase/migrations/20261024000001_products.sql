-- Leistungen & Produkte: gespeicherte Positionen für Rechnungen.
-- Rechnungen kopieren Text, Einheit und Preis in line_items – spätere Änderungen hier ändern keine alten Rechnungen.
CREATE TABLE public.products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  details      TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 2000),  -- weitere Zeilen der Bezeichnung
  unit         TEXT CHECK (unit IS NULL OR length(unit) <= 20),
  unit_price   NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),            -- netto
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Jede Bezeichnung nur einmal pro Person (Groß-/Kleinschreibung egal) – verhindert Doppelte beim „Als Produkt speichern“
CREATE UNIQUE INDEX products_user_name_key ON public.products (user_id, lower(btrim(name)));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_all_own" ON public.products
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Konto löschen: Produkte mit entfernen
CREATE OR REPLACE FUNCTION public.delete_user_data(p_user UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.invoices           WHERE user_id = p_user;
  DELETE FROM public.expenses           WHERE user_id = p_user;
  DELETE FROM public.recurring_expenses WHERE user_id = p_user;
  DELETE FROM public.svs_payments       WHERE user_id = p_user;
  DELETE FROM public.assets             WHERE user_id = p_user;
  DELETE FROM public.incomes            WHERE user_id = p_user;
  DELETE FROM public.imports            WHERE user_id = p_user;
  DELETE FROM public.receipt_scans      WHERE user_id = p_user;
  DELETE FROM public.products           WHERE user_id = p_user;
  DELETE FROM public.clients            WHERE user_id = p_user;
  DELETE FROM public.profiles           WHERE id = p_user;
  DELETE FROM public.invoice_templates  WHERE user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
