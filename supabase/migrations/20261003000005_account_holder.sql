-- Kontoinhaber (Name exakt wie bei der Bank): Seit der EU-Empfängerüberprüfung
-- (Verification of Payee) gleicht die Bank des Zahlers Name und IBAN ab.
-- Der Name steht deshalb ausdrücklich im Zahlungshinweis und im QR-Code der Rechnung.
ALTER TABLE public.profiles ADD COLUMN account_holder TEXT;

UPDATE public.profiles
SET account_holder = COALESCE(NULLIF(business_name, ''), full_name)
WHERE account_holder IS NULL AND iban IS NOT NULL;

-- Snapshot des Ausstellers um account_holder erweitern
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

  SELECT is_kleinunternehmer INTO v_is_ku FROM public.profiles WHERE id = NEW.user_id;
  IF v_is_ku THEN
    NEW.vat_rate := 0;
  END IF;

  NEW.subtotal   := v_subtotal;
  NEW.vat_amount := round(v_subtotal * NEW.vat_rate / 100, 2);
  NEW.total      := NEW.subtotal + NEW.vat_amount;

  SELECT to_jsonb(c) - 'user_id' - 'created_at' - 'notes'
    INTO NEW.client_snapshot
    FROM public.clients c WHERE c.id = NEW.client_id;

  SELECT jsonb_build_object(
           'full_name', p.full_name, 'business_name', p.business_name,
           'address', p.address, 'zip_code', p.zip_code, 'city', p.city, 'country', p.country,
           'uid_number', p.uid_number, 'iban', p.iban, 'account_holder', p.account_holder,
           'is_kleinunternehmer', p.is_kleinunternehmer)
    INTO NEW.issuer_snapshot
    FROM public.profiles p WHERE p.id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Bestehende (Test-)Rechnungen: Kontoinhaber im Snapshot nachtragen.
-- Schutz-Trigger dafür kurz deaktivieren – ändert nur den Snapshot, keine Rechnungsinhalte.
ALTER TABLE public.invoices DISABLE TRIGGER invoices_a_protect_issued;
UPDATE public.invoices i
SET issuer_snapshot = i.issuer_snapshot || jsonb_build_object('account_holder', p.account_holder)
FROM public.profiles p
WHERE p.id = i.user_id AND i.issuer_snapshot IS NOT NULL AND NOT (i.issuer_snapshot ? 'account_holder');
ALTER TABLE public.invoices ENABLE TRIGGER invoices_a_protect_issued;
