-- Import: Einnahmen und Ausgaben aus einer bisherigen Tabelle (meist Excel) übernehmen.
--
-- 1. imports: ein Import-Vorgang. Löschen = Import rückgängig machen (alle Zeilen hängen per ON DELETE CASCADE dran).
-- 2. incomes: Einnahmen ohne Klaro-Rechnung (z. B. importierte Einnahmen aus der Zeit vor Klaro).
--    Zählen wie bezahlte Rechnungen nach dem Zuflussprinzip: im Jahr von income_date, netto = COALESCE(amount_net, amount).
-- 3. import_id an expenses, svs_payments und assets.

-- ─── 1. imports ─────────────────────────────────────────────
CREATE TABLE public.imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  source_name  TEXT NOT NULL DEFAULT '',  -- Dateiname bzw. „Eingefügt aus Excel“
  -- Zusammenfassung für die Anzeige: {"incomes": n, "expenses": n, "svs_payments": n, "assets": n}
  summary      JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(summary) = 'object'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX imports_user_created_idx ON public.imports (user_id, created_at DESC);

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports_all_own" ON public.imports
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── 2. incomes ─────────────────────────────────────────────
CREATE TABLE public.incomes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  description  TEXT NOT NULL DEFAULT '',
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),  -- Brutto
  amount_net   NUMERIC(10,2) CHECK (amount_net IS NULL OR (amount_net > 0 AND amount_net <= amount)),  -- nur USt-Pflichtige
  income_date  DATE NOT NULL,  -- Zahlungseingang
  reference    TEXT,           -- z. B. Rechnungsnummer aus der alten Tabelle (zählt für die fortlaufende Nummer mit)
  import_id    UUID REFERENCES public.imports ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX incomes_user_date_idx ON public.incomes (user_id, income_date DESC);
CREATE INDEX incomes_import_idx ON public.incomes (import_id);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incomes_all_own" ON public.incomes
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── 3. Herkunft bestehender Tabellen ───────────────────────
ALTER TABLE public.expenses     ADD COLUMN import_id UUID REFERENCES public.imports ON DELETE CASCADE;
ALTER TABLE public.svs_payments ADD COLUMN import_id UUID REFERENCES public.imports ON DELETE CASCADE;
ALTER TABLE public.assets       ADD COLUMN import_id UUID REFERENCES public.imports ON DELETE CASCADE;
CREATE INDEX expenses_import_idx     ON public.expenses (import_id);
CREATE INDEX svs_payments_import_idx ON public.svs_payments (import_id);
CREATE INDEX assets_import_idx       ON public.assets (import_id);

-- Ein Import darf nur Zeilen des eigenen Nutzers enthalten (RLS prüft import_id nicht von selbst)
CREATE FUNCTION public.check_import_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.import_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.imports i WHERE i.id = NEW.import_id AND i.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Ungültiger Import.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER incomes_check_import      BEFORE INSERT OR UPDATE OF import_id ON public.incomes      FOR EACH ROW EXECUTE FUNCTION public.check_import_owner();
CREATE TRIGGER expenses_check_import     BEFORE INSERT OR UPDATE OF import_id ON public.expenses     FOR EACH ROW EXECUTE FUNCTION public.check_import_owner();
CREATE TRIGGER svs_payments_check_import BEFORE INSERT OR UPDATE OF import_id ON public.svs_payments FOR EACH ROW EXECUTE FUNCTION public.check_import_owner();
CREATE TRIGGER assets_check_import       BEFORE INSERT OR UPDATE OF import_id ON public.assets       FOR EACH ROW EXECUTE FUNCTION public.check_import_owner();

-- ─── Kontolöschung um die neuen Tabellen ergänzen ───────────
CREATE OR REPLACE FUNCTION public.delete_user_data(p_user UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.invoices     WHERE user_id = p_user;
  DELETE FROM public.expenses     WHERE user_id = p_user;
  DELETE FROM public.svs_payments WHERE user_id = p_user;
  DELETE FROM public.assets       WHERE user_id = p_user;
  DELETE FROM public.incomes      WHERE user_id = p_user;
  DELETE FROM public.imports      WHERE user_id = p_user;
  DELETE FROM public.clients      WHERE user_id = p_user;
  DELETE FROM public.profiles     WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
