-- Stornieren absichern (Review): Storno-Felder und Status „storniert“ setzt nur cancel_invoice() – auch nicht beim
-- direkten Anlegen bzw. in Entwürfen. Stornodatum mit Obergrenze, damit das Minus nicht in einem künftigen Jahr zählt.

CREATE FUNCTION public.invoices_guard_storno_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' OR OLD.status = 'draft')
     AND (NEW.status = 'cancelled' OR NEW.cancelled_at IS NOT NULL
          OR NEW.cancels_invoice_number IS NOT NULL OR NEW.cancels_invoice_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Stornieren geht nur bei ausgestellten Rechnungen über „Stornieren“.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Name mit „0_“: läuft vor invoices_prepare und invoices_a_protect_issued (Trigger laufen alphabetisch)
CREATE TRIGGER invoices_0_guard_storno_fields
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_guard_storno_fields();

CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice UUID, p_number TEXT, p_date DATE)
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

  INSERT INTO public.invoices (user_id, cancels_invoice_id, invoice_number, invoice_date, status, paid_at)
  VALUES (
    v_user, p_invoice, trim(p_number), p_date,
    -- bezahltes Original: Storno zählt am Stornodatum negativ; offenes Original: beide zählen nicht
    CASE WHEN v_orig.status = 'paid' THEN 'paid' ELSE 'cancelled' END,
    CASE WHEN v_orig.status = 'paid' THEN p_date::timestamp AT TIME ZONE 'UTC' ELSE NULL END
  )
  RETURNING id INTO v_id;

  UPDATE public.invoices
     SET cancelled_at = now(),
         status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'cancelled' END
   WHERE id = p_invoice;

  RETURN v_id;
END;
$$;
