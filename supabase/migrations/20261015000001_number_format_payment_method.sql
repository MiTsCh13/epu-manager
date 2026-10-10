-- 1) Eigenes Format für Rechnungsnummern, z. B. „RE_{JJ}{NNNN}“ (statt fest 2026-001 / KL-2026-001).
--    Die Bausteine prüft die App; die DB verlangt nur eine laufende Nummer und eine vernünftige Länge.
-- 2) Zahlungsart pro Rechnung: Überweisung oder bar (bar bezahlt = beim Ausstellen gleich bezahlt).

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_invoice_number_format_check;

UPDATE public.profiles SET invoice_number_format = CASE invoice_number_format
  WHEN 'KL-YYYY-NNN' THEN 'KL-{JJJJ}-{NNN}'
  ELSE '{JJJJ}-{NNN}'
END
WHERE invoice_number_format IN ('YYYY-NNN', 'KL-YYYY-NNN');

ALTER TABLE public.profiles
  ALTER COLUMN invoice_number_format SET DEFAULT '{JJJJ}-{NNN}',
  ADD CONSTRAINT profiles_invoice_number_format_check
    CHECK (char_length(invoice_number_format) BETWEEN 3 AND 60 AND invoice_number_format ~ '\{[Nn]{1,8}\}');

ALTER TABLE public.invoices
  ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'transfer'
    CHECK (payment_method IN ('transfer', 'cash'));

-- Ausgestellte Rechnungen: auch die Zahlungsart ist unveränderbar
CREATE OR REPLACE FUNCTION public.invoices_protect_issued()
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
      NEW.service_date_from, NEW.service_date_to, NEW.footer_text, NEW.client_snapshot, NEW.issuer_snapshot,
      NEW.template_snapshot, NEW.intro_text, NEW.payment_method)
     IS DISTINCT FROM
     (OLD.invoice_number, OLD.invoice_date, OLD.due_date, OLD.client_id, OLD.is_honorarnote,
      OLD.line_items, OLD.subtotal, OLD.vat_rate, OLD.vat_amount, OLD.total, OLD.notes,
      OLD.service_date_from, OLD.service_date_to, OLD.footer_text, OLD.client_snapshot, OLD.issuer_snapshot,
      OLD.template_snapshot, OLD.intro_text, OLD.payment_method)
  THEN
    RAISE EXCEPTION 'Ausgestellte Rechnungen können nicht mehr geändert werden.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
