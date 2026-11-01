-- Stornorechnung mit eigenem „Text unten“: Klaro schlägt beim Stornieren einen passenden Text vor (bezahlt → Rückzahlung
-- bzw. Verrechnung, offen → bitte nicht mehr bezahlen), den man ändern oder leeren kann. Die Zahlungsaufforderung
-- der Originalrechnung wird weiterhin nie übernommen.

CREATE OR REPLACE FUNCTION public.invoices_prepare()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_subtotal NUMERIC(12,2) := 0;
  v_item     JSONB;
  v_is_ku    BOOLEAN;
  v_orig     public.invoices;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.cancels_invoice_id IS NOT NULL THEN
    IF TG_OP <> 'INSERT' OR current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Stornorechnungen entstehen nur über „Stornieren“.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_orig FROM public.invoices WHERE id = NEW.cancels_invoice_id AND user_id = NEW.user_id;
    IF NOT FOUND OR v_orig.status = 'draft' OR v_orig.cancels_invoice_id IS NOT NULL OR v_orig.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'Diese Rechnung kann nicht storniert werden.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.client_id         := v_orig.client_id;
    NEW.client_snapshot   := v_orig.client_snapshot;
    NEW.issuer_snapshot   := v_orig.issuer_snapshot;
    NEW.template_snapshot := v_orig.template_snapshot;
    NEW.template_id       := v_orig.template_id;
    NEW.is_honorarnote    := v_orig.is_honorarnote;
    NEW.vat_rate          := v_orig.vat_rate;
    NEW.service_date_from := v_orig.service_date_from;
    NEW.service_date_to   := v_orig.service_date_to;
    NEW.payment_method    := v_orig.payment_method;
    NEW.due_date          := NULL;
    -- Text unten: nur was „Stornieren“ mitgibt (Vorschlag aus der App), nie die Zahlungsaufforderung des Originals
    NEW.notes             := NULLIF(btrim(left(NEW.notes, 2000)), '');
    NEW.intro_text        := NULL;
    NEW.footer_text       := v_orig.footer_text;
    NEW.cancels_invoice_number := v_orig.invoice_number;
    NEW.cancels_invoice_date   := v_orig.invoice_date;
    SELECT COALESCE(jsonb_agg(
             item || jsonb_build_object('unit_price', -(item->>'unit_price')::numeric, 'total', -(item->>'total')::numeric)
             ORDER BY ord), '[]'::jsonb)
      INTO NEW.line_items
      FROM jsonb_array_elements(v_orig.line_items) WITH ORDINALITY AS t(item, ord);
    NEW.subtotal   := -v_orig.subtotal;
    NEW.vat_amount := -v_orig.vat_amount;
    NEW.total      := -v_orig.total;
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

-- Neuer Parameter p_notes: alte Fassung (3 Parameter) ersetzen, sonst gäbe es zwei Funktionen gleichen Namens
DROP FUNCTION public.cancel_invoice(UUID, TEXT, DATE);

CREATE FUNCTION public.cancel_invoice(p_invoice UUID, p_number TEXT, p_date DATE, p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user UUID := auth.uid();
  v_orig public.invoices;
  v_id   UUID;
BEGIN
  SELECT * INTO v_orig FROM public.invoices WHERE id = p_invoice AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig.status = 'draft' OR v_orig.cancels_invoice_id IS NOT NULL OR v_orig.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Diese Rechnung kann nicht storniert werden.' USING ERRCODE = 'check_violation';
  END IF;
  -- Heute (in Wien ist es nach Mitternacht schon einen Tag weiter als in UTC), bei vordatierten Rechnungen deren Datum
  IF p_date < v_orig.invoice_date OR p_date > GREATEST(v_orig.invoice_date, current_date + 1) THEN
    RAISE EXCEPTION 'Das Datum der Stornorechnung passt nicht.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(trim(coalesce(p_number, ''))) = 0 THEN
    RAISE EXCEPTION 'Nummer fehlt.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.invoices (user_id, cancels_invoice_id, invoice_number, invoice_date, status, paid_at, notes)
  VALUES (
    v_user, p_invoice, trim(p_number), p_date,
    -- bezahltes Original: Storno zählt am Stornodatum negativ; offenes Original: beide zählen nicht
    CASE WHEN v_orig.status = 'paid' THEN 'paid' ELSE 'cancelled' END,
    CASE WHEN v_orig.status = 'paid' THEN p_date::timestamp AT TIME ZONE 'UTC' ELSE NULL END,
    p_notes
  )
  RETURNING id INTO v_id;

  UPDATE public.invoices
     SET cancelled_at = now(),
         status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'cancelled' END
   WHERE id = p_invoice;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invoice(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(UUID, TEXT, DATE, TEXT) TO authenticated;
