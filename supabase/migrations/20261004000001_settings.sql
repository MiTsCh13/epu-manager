-- Einstellungen (Schritt 13)
--
-- 1. Konsistenzregeln für steuerliche/SVS-Einstellungen – auch wenn sie nachträglich geändert werden
-- 2. Entwürfe folgen Profiländerungen (Adresse, IBAN, Kleinunternehmer-Status …);
--    ausgestellte Rechnungen bleiben über ihre Snapshots unverändert
-- 3. Kontolöschung (DSGVO Art. 17): löscht alle Daten eines Nutzers in einer Transaktion

-- ─── 1. Konsistenzregeln ────────────────────────────────────
ALTER TABLE public.profiles
  -- Kleinunternehmerpauschalierung gibt es nur für Kleinunternehmer
  ADD CONSTRAINT profiles_ku_pausch_requires_ku
    CHECK (pausch_type IS DISTINCT FROM 'ku' OR is_kleinunternehmer),
  -- Eine Pauschalierungsart nur bei Gewinnermittlung per Pauschalierung
  ADD CONSTRAINT profiles_pausch_type_requires_pauschal
    CHECK (pausch_type IS NULL OR profit_method = 'pauschal'),
  ADD CONSTRAINT profiles_industry_code_check
    CHECK (industry_code IS NULL OR industry_code IN ('service', 'trade')),
  -- Ausnahme von der Pflichtversicherung (Kleinstunternehmerregelung) gibt es nur im GSVG
  ADD CONSTRAINT profiles_svs_exempt_requires_gsvg
    CHECK (NOT svs_exempt OR business_type = 'gewerbetreibend');

-- ─── 2. Entwürfe aktualisieren ──────────────────────────────
-- Ein (leeres) Update reicht: invoices_prepare berechnet USt/Summen neu und erneuert die Snapshots.
CREATE FUNCTION public.profiles_refresh_draft_invoices()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE public.invoices SET vat_rate = vat_rate
  WHERE user_id = NEW.id AND status = 'draft';
  RETURN NULL;
END;
$$;

CREATE TRIGGER profiles_refresh_draft_invoices
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    (OLD.full_name, OLD.business_name, OLD.address, OLD.zip_code, OLD.city, OLD.country,
     OLD.uid_number, OLD.iban, OLD.account_holder, OLD.is_kleinunternehmer)
    IS DISTINCT FROM
    (NEW.full_name, NEW.business_name, NEW.address, NEW.zip_code, NEW.city, NEW.country,
     NEW.uid_number, NEW.iban, NEW.account_holder, NEW.is_kleinunternehmer)
  )
  EXECUTE FUNCTION public.profiles_refresh_draft_invoices();

-- ─── 3. Kontolöschung ───────────────────────────────────────
-- Explizite Reihenfolge, weil invoices → clients ON DELETE RESTRICT ist.
-- Nur für die Edge Function „delete-account“ (service_role); danach löscht sie den Auth-Nutzer.
CREATE FUNCTION public.delete_user_data(p_user UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.invoices     WHERE user_id = p_user;
  DELETE FROM public.expenses     WHERE user_id = p_user;
  DELETE FROM public.svs_payments WHERE user_id = p_user;
  DELETE FROM public.clients      WHERE user_id = p_user;
  DELETE FROM public.profiles     WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
