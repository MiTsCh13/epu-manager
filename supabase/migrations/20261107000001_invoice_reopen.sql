-- Ausgestellte, noch nicht verschickte Rechnung zurück zum Entwurf holen (Fehler vor dem Versand ausbessern): Die Nummer
-- bleibt, es entsteht keine Lücke und keine Stornorechnung. Nur über reopen_invoice(); bezahlte, verschickte und
-- stornierte Rechnungen sowie Stornorechnungen bleiben gesperrt. reopened_at hält fest, wann das zuletzt geschehen ist.
ALTER TABLE public.invoices ADD COLUMN reopened_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.invoices_protect_issued()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Zeitpunkt des Zurückholens setzt nur reopen_invoice()
  IF current_user IN ('authenticated', 'anon') AND NEW.reopened_at IS DISTINCT FROM OLD.reopened_at THEN
    RAISE EXCEPTION 'Zurück zum Entwurf geht nur über „Zurück zum Entwurf“.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'draft' THEN
    IF NEW.status = 'cancelled' OR NEW.cancelled_at IS NOT NULL OR NEW.cancels_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Entwürfe kannst du löschen – stornieren geht nur bei ausgestellten Rechnungen.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'draft' AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Eine ausgestellte Rechnung kann nicht wieder zum Entwurf werden.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.invoice_number, NEW.invoice_date, NEW.due_date, NEW.client_id, NEW.is_honorarnote,
      NEW.line_items, NEW.subtotal, NEW.vat_rate, NEW.vat_amount, NEW.total, NEW.notes,
      NEW.service_date_from, NEW.service_date_to, NEW.footer_text, NEW.client_snapshot, NEW.issuer_snapshot,
      NEW.template_snapshot, NEW.intro_text, NEW.payment_method,
      NEW.cancels_invoice_id, NEW.cancels_invoice_number, NEW.cancels_invoice_date)
     IS DISTINCT FROM
     (OLD.invoice_number, OLD.invoice_date, OLD.due_date, OLD.client_id, OLD.is_honorarnote,
      OLD.line_items, OLD.subtotal, OLD.vat_rate, OLD.vat_amount, OLD.total, OLD.notes,
      OLD.service_date_from, OLD.service_date_to, OLD.footer_text, OLD.client_snapshot, OLD.issuer_snapshot,
      OLD.template_snapshot, OLD.intro_text, OLD.payment_method,
      OLD.cancels_invoice_id, OLD.cancels_invoice_number, OLD.cancels_invoice_date)
  THEN
    RAISE EXCEPTION 'Ausgestellte Rechnungen können nicht mehr geändert werden.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Storno-Status und -Zeitpunkt setzt nur cancel_invoice(); einmal storniert bleibt storniert
  IF current_user IN ('authenticated', 'anon') AND
     ((NEW.status = 'cancelled') IS DISTINCT FROM (OLD.status = 'cancelled')
      OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'Stornieren geht nur über „Stornieren“, und eine Stornierung lässt sich nicht zurücknehmen.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Stornierte Rechnungen und Stornorechnungen werden nicht mehr bezahlt
  IF (OLD.cancelled_at IS NOT NULL OR OLD.cancels_invoice_id IS NOT NULL)
     AND (NEW.status, NEW.paid_at) IS DISTINCT FROM (OLD.status, OLD.paid_at)
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Stornierte Rechnungen lassen sich nicht mehr ändern.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.reopen_invoice(p_invoice UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user UUID := auth.uid();
  v_orig public.invoices;
BEGIN
  SELECT * INTO v_orig FROM public.invoices WHERE id = p_invoice AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig.status NOT IN ('sent', 'overdue') OR v_orig.cancels_invoice_id IS NOT NULL OR v_orig.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Nur offene Rechnungen können zurück zum Entwurf.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_orig.emailed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Diese Rechnung wurde schon verschickt – korrigieren geht nur noch über „Stornieren“.' USING ERRCODE = 'check_violation';
  END IF;
  -- Ohne Zugang ließe sich der Entwurf nicht wieder ausstellen
  IF NOT public.has_active_access(v_user) THEN
    RAISE EXCEPTION 'Deine Testphase ist abgelaufen. Mit Klaro Pro kannst du wieder Rechnungen ausstellen.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.invoices SET status = 'draft', reopened_at = now() WHERE id = p_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_invoice(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_invoice(UUID) TO authenticated;
