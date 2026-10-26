-- Kleinunternehmer-Status einer Rechnung nach dem Leistungsdatum statt dem Rechnungsdatum:
-- Für die Kleinunternehmergrenze zählen die im Kalenderjahr ausgeführten Umsätze (UStR 2000 Rz 995).
-- Leistungszeitraum → Ende des Zeitraums; ohne Leistungsdatum → Rechnungsdatum.
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

  -- Maßgeblich ist das Jahr, in dem die Leistung ausgeführt wurde (UStR Rz 995), nicht das Rechnungsdatum
  v_is_ku := public.is_kleinunternehmer_on(NEW.user_id, COALESCE(NEW.service_date_to, NEW.service_date_from, NEW.invoice_date));
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

-- Hilfsfunktion nur für angemeldete Nutzer und den Server
REVOKE ALL ON FUNCTION public.is_kleinunternehmer_on(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_kleinunternehmer_on(UUID, DATE) TO authenticated, service_role;
