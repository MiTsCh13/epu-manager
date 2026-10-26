-- Steuer-Einstellungen pro Kalenderjahr.
-- Eine Zeile für ein Jahr gilt ab diesem Jahr bis zur nächsten Zeile. Ohne frühere Zeile gelten die Felder im Profil
-- (Stand aus dem Onboarding) – bestehende Konten rechnen also unverändert weiter, bis jemand etwas ändert.
-- Art der Tätigkeit und SVS-Anmeldedatum bleiben im Profil und gelten für alle Jahre.
CREATE TABLE public.tax_years (
  user_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  year                INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  is_kleinunternehmer BOOLEAN NOT NULL,
  profit_method       TEXT NOT NULL CHECK (profit_method IN ('euer', 'pauschal')),
  pausch_type         TEXT CHECK (pausch_type IS NULL OR pausch_type IN ('ku', 'basis_15', 'basis_6')),
  industry_code       TEXT CHECK (industry_code IS NULL OR industry_code IN ('service', 'trade')),
  svs_exempt          BOOLEAN NOT NULL DEFAULT false,
  home_office         BOOLEAN,
  other_income_kind   TEXT CHECK (other_income_kind IS NULL OR other_income_kind IN ('none', 'employment', 'pension')),
  other_income_amount NUMERIC(12,2) CHECK (other_income_amount IS NULL OR other_income_amount >= 0),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year),
  -- Dieselben Regeln wie im Profil
  CONSTRAINT tax_years_ku_pausch_requires_ku CHECK (pausch_type IS DISTINCT FROM 'ku' OR is_kleinunternehmer),
  CONSTRAINT tax_years_pausch_type_requires_pauschal CHECK (pausch_type IS NULL OR profit_method = 'pauschal')
);

ALTER TABLE public.tax_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_years_all_own" ON public.tax_years
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Kleinunternehmer-Status an einem Tag: letzte Jahres-Einstellung bis dahin, sonst das Profil
CREATE FUNCTION public.is_kleinunternehmer_on(p_user UUID, p_date DATE)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(
    (SELECT t.is_kleinunternehmer FROM public.tax_years t
      WHERE t.user_id = p_user AND t.year <= extract(year FROM COALESCE(p_date, current_date))
      ORDER BY t.year DESC LIMIT 1),
    (SELECT p.is_kleinunternehmer FROM public.profiles p WHERE p.id = p_user)
  );
$$;

-- ─── Rechnungen: USt und Kleinunternehmer-Hinweis nach dem Status im Jahr des Rechnungsdatums ───
CREATE OR REPLACE FUNCTION public.invoices_prepare()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_subtotal NUMERIC(12,2) := 0;
  v_item     JSONB;
  v_is_ku    BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(
           item || jsonb_build_object(
             'total', round((item->>'quantity')::numeric * (item->>'unit_price')::numeric, 2))
           ORDER BY ord), '[]'::jsonb)
    INTO NEW.line_items
    FROM jsonb_array_elements(NEW.line_items) WITH ORDINALITY AS t(item, ord);

  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.line_items) LOOP
    v_subtotal := v_subtotal + (v_item->>'total')::numeric;
  END LOOP;

  v_is_ku := public.is_kleinunternehmer_on(NEW.user_id, NEW.invoice_date);
  IF v_is_ku THEN
    NEW.vat_rate := 0;
  END IF;

  NEW.subtotal   := v_subtotal;
  NEW.vat_amount := round(v_subtotal * NEW.vat_rate / 100, 2);
  NEW.total      := NEW.subtotal + NEW.vat_amount;

  SELECT to_jsonb(c) - 'user_id' - 'created_at' - 'notes' - 'template_id'
    INTO NEW.client_snapshot
    FROM public.clients c WHERE c.id = NEW.client_id;

  SELECT jsonb_build_object(
           'full_name', p.full_name, 'business_name', p.business_name,
           'address', p.address, 'zip_code', p.zip_code, 'city', p.city, 'country', p.country,
           'uid_number', p.uid_number, 'iban', p.iban, 'account_holder', p.account_holder,
           'is_kleinunternehmer', v_is_ku)
    INTO NEW.issuer_snapshot
    FROM public.profiles p WHERE p.id = NEW.user_id;

  SELECT t.settings INTO NEW.template_snapshot
    FROM public.invoice_templates t
    WHERE t.user_id = NEW.user_id AND (t.id = NEW.template_id OR (NEW.template_id IS NULL AND t.is_default))
    ORDER BY (t.id = NEW.template_id) DESC
    LIMIT 1;

  RETURN NEW;
END;
$$;

-- Entwürfe folgen auch Änderungen der Jahres-Einstellungen (wie bei Profiländerungen)
CREATE FUNCTION public.tax_years_refresh_draft_invoices()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE public.invoices SET vat_rate = vat_rate
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND status = 'draft';
  RETURN NULL;
END;
$$;

CREATE TRIGGER tax_years_refresh_draft_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.tax_years
  FOR EACH ROW EXECUTE FUNCTION public.tax_years_refresh_draft_invoices();

-- Konto löschen: Jahres-Einstellungen mit entfernen
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
  DELETE FROM public.tax_years          WHERE user_id = p_user;
  DELETE FROM public.profiles           WHERE id = p_user;
  DELETE FROM public.invoice_templates  WHERE user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
