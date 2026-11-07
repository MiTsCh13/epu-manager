-- Zurück zum Entwurf absichern (Review): Die Sperren für verschickte und bezahlte Rechnungen dürfen sich nicht per
-- direktem API-Aufruf umgehen lassen; reopened_at lässt sich auch beim Anlegen nicht selbst setzen.
CREATE OR REPLACE FUNCTION public.invoices_protect_issued()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Zeitpunkt des Zurückholens setzt nur reopen_invoice()
  IF current_user IN ('authenticated', 'anon') AND NEW.reopened_at IS DISTINCT FROM OLD.reopened_at THEN
    RAISE EXCEPTION 'Zurück zum Entwurf geht nur über „Zurück zum Entwurf“.' USING ERRCODE = 'check_violation';
  END IF;
  -- „Verschickt“ und „bezahlt“ lassen sich nicht zurücknehmen – sonst wären die Sperren von reopen_invoice() umgehbar
  -- (neuer Zeitpunkt bei erneutem Versand bleibt erlaubt)
  IF current_user IN ('authenticated', 'anon') AND OLD.emailed_at IS NOT NULL AND NEW.emailed_at IS NULL THEN
    RAISE EXCEPTION 'Eine verschickte Rechnung bleibt verschickt.' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user IN ('authenticated', 'anon') AND OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'Eine bezahlte Rechnung bleibt bezahlt.' USING ERRCODE = 'check_violation';
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

CREATE OR REPLACE FUNCTION public.invoices_guard_storno_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.reopened_at IS NOT NULL THEN
    RAISE EXCEPTION 'Zurück zum Entwurf geht nur über „Zurück zum Entwurf“.' USING ERRCODE = 'check_violation';
  END IF;
  IF (TG_OP = 'INSERT' OR OLD.status = 'draft')
     AND (NEW.status = 'cancelled' OR NEW.cancelled_at IS NOT NULL
          OR NEW.cancels_invoice_number IS NOT NULL OR NEW.cancels_invoice_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Stornieren geht nur bei ausgestellten Rechnungen über „Stornieren“.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
