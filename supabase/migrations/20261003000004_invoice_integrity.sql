-- Rechnungen: §11-Pflichtangaben, Unveränderbarkeit nach Ausstellung, serverseitige Summen
--
-- 1. Leistungsdatum/-zeitraum (§ 11 Abs. 1 Z 4 UStG) und Fußzeile je Rechnung
-- 2. Snapshots von Kunde und Aussteller: werden beim Ausstellen eingefroren,
--    damit spätere Adressänderungen alte Rechnungen nicht verändern
-- 3. Ausgestellte Rechnungen (status <> 'draft') sind inhaltlich unveränderbar;
--    nur Status und Zahlungsdatum dürfen sich ändern. Löschen nur für Entwürfe.
-- 4. Summen werden in der DB aus den Positionen berechnet (Client-Werte werden überschrieben)

ALTER TABLE public.invoices
  ADD COLUMN service_date_from DATE,
  ADD COLUMN service_date_to   DATE,
  ADD COLUMN footer_text       TEXT,
  ADD COLUMN client_snapshot   JSONB,
  ADD COLUMN issuer_snapshot   JSONB,
  ADD CONSTRAINT invoices_service_period_check
    CHECK (service_date_to IS NULL OR service_date_from IS NULL OR service_date_to >= service_date_from);

-- Bestehende Rechnungen: Leistungsdatum = Rechnungsdatum
UPDATE public.invoices SET service_date_from = invoice_date WHERE service_date_from IS NULL;

-- Bestehende Rechnungen: Snapshots nachtragen (vor Anlage der Schutz-Trigger)
UPDATE public.invoices i SET
  client_snapshot = (SELECT to_jsonb(c) - 'user_id' - 'created_at' - 'notes' FROM public.clients c WHERE c.id = i.client_id),
  issuer_snapshot = (
    SELECT jsonb_build_object(
             'full_name', p.full_name, 'business_name', p.business_name,
             'address', p.address, 'zip_code', p.zip_code, 'city', p.city, 'country', p.country,
             'uid_number', p.uid_number, 'iban', p.iban, 'is_kleinunternehmer', p.is_kleinunternehmer)
    FROM public.profiles p WHERE p.id = i.user_id);

-- ─── Summen + Snapshots ─────────────────────────────────────
CREATE FUNCTION public.invoices_prepare()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_subtotal NUMERIC(12,2) := 0;
  v_item     JSONB;
  v_is_ku    BOOLEAN;
BEGIN
  -- Nur Entwürfe und der Übergang Entwurf → ausgestellt werden neu berechnet
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Positionen normalisieren: total = round(quantity × unit_price, 2)
  SELECT COALESCE(jsonb_agg(
           item || jsonb_build_object(
             'total', round((item->>'quantity')::numeric * (item->>'unit_price')::numeric, 2))
           ORDER BY ord), '[]'::jsonb)
    INTO NEW.line_items
    FROM jsonb_array_elements(NEW.line_items) WITH ORDINALITY AS t(item, ord);

  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.line_items) LOOP
    v_subtotal := v_subtotal + (v_item->>'total')::numeric;
  END LOOP;

  -- Kleinunternehmer dürfen keine USt ausweisen
  SELECT is_kleinunternehmer INTO v_is_ku FROM public.profiles WHERE id = NEW.user_id;
  IF v_is_ku THEN
    NEW.vat_rate := 0;
  END IF;

  NEW.subtotal   := v_subtotal;
  NEW.vat_amount := round(v_subtotal * NEW.vat_rate / 100, 2);
  NEW.total      := NEW.subtotal + NEW.vat_amount;

  -- Snapshots aktualisieren (bei Entwürfen laufend, beim Ausstellen ein letztes Mal)
  SELECT to_jsonb(c) - 'user_id' - 'created_at' - 'notes'
    INTO NEW.client_snapshot
    FROM public.clients c WHERE c.id = NEW.client_id;

  SELECT jsonb_build_object(
           'full_name', p.full_name, 'business_name', p.business_name,
           'address', p.address, 'zip_code', p.zip_code, 'city', p.city, 'country', p.country,
           'uid_number', p.uid_number, 'iban', p.iban, 'is_kleinunternehmer', p.is_kleinunternehmer)
    INTO NEW.issuer_snapshot
    FROM public.profiles p WHERE p.id = NEW.user_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_prepare
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_prepare();

-- ─── Unveränderbarkeit ausgestellter Rechnungen ─────────────
CREATE FUNCTION public.invoices_protect_issued()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Eine ausgestellte Rechnung kann nicht wieder zum Entwurf werden.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.invoice_number, NEW.invoice_date, NEW.due_date, NEW.client_id, NEW.is_honorarnote,
      NEW.line_items, NEW.subtotal, NEW.vat_rate, NEW.vat_amount, NEW.total, NEW.notes,
      NEW.service_date_from, NEW.service_date_to, NEW.footer_text, NEW.client_snapshot, NEW.issuer_snapshot)
     IS DISTINCT FROM
     (OLD.invoice_number, OLD.invoice_date, OLD.due_date, OLD.client_id, OLD.is_honorarnote,
      OLD.line_items, OLD.subtotal, OLD.vat_rate, OLD.vat_amount, OLD.total, OLD.notes,
      OLD.service_date_from, OLD.service_date_to, OLD.footer_text, OLD.client_snapshot, OLD.issuer_snapshot)
  THEN
    RAISE EXCEPTION 'Ausgestellte Rechnungen können nicht mehr geändert werden.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Läuft vor invoices_prepare (Trigger feuern alphabetisch)
CREATE TRIGGER invoices_a_protect_issued
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_protect_issued();

-- ─── RLS: Löschen nur für Entwürfe ──────────────────────────
DROP POLICY "invoices_all_own" ON public.invoices;

CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY "invoices_insert_own" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (client_id IS NULL OR EXISTS (
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = (SELECT auth.uid())))
  );

CREATE POLICY "invoices_update_own" ON public.invoices
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (client_id IS NULL OR EXISTS (
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = (SELECT auth.uid())))
  );

CREATE POLICY "invoices_delete_own_drafts" ON public.invoices
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status = 'draft');
