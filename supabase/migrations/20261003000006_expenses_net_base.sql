-- Bewirtungsregel auf Basis des Nettobetrags (USt-Pflichtige ziehen Vorsteuer separat ab).
-- Kleinunternehmer haben kein amount_net → Basis bleibt der Bruttobetrag.
CREATE OR REPLACE FUNCTION public.expenses_set_deductible()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.is_bewirtung THEN
    NEW.deductible_amount := round(COALESCE(NEW.amount_net, NEW.amount) * 0.5, 2);
  ELSIF NEW.deductible_amount IS NULL THEN
    NEW.deductible_amount := COALESCE(NEW.amount_net, NEW.amount);
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_amount_net_check CHECK (amount_net IS NULL OR (amount_net >= 0 AND amount_net <= amount)),
  ADD CONSTRAINT expenses_deductible_check CHECK (deductible_amount IS NULL OR deductible_amount >= 0);

CREATE INDEX svs_payments_user_date_idx ON public.svs_payments (user_id, payment_date DESC);
