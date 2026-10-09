-- Wiederkehrende Ausgaben: eine Serie ist die Vorlage, jede Zahlung eine normale Zeile in expenses (recurring_id).
-- Termine rechnet der Client (Stichtag = Tag von start_date, kürzere Monate → letzter Tag).
-- next_date = nächster noch nicht erledigter Termin; Übernehmen oder Überspringen schiebt ihn weiter.
CREATE TABLE public.recurring_expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  description       TEXT NOT NULL DEFAULT '',
  category_label    TEXT NOT NULL,
  e1a_kz            TEXT NOT NULL,
  amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),  -- Brutto
  amount_net        NUMERIC(10,2) CHECK (amount_net IS NULL OR (amount_net >= 0 AND amount_net <= amount)),
  deductible_amount NUMERIC(10,2) NOT NULL CHECK (deductible_amount >= 0),
  is_bewirtung      BOOLEAN NOT NULL DEFAULT false,
  reimbursed        BOOLEAN NOT NULL DEFAULT false,
  interval_months   SMALLINT NOT NULL CHECK (interval_months IN (1, 3, 6, 12)),
  start_date        DATE NOT NULL,  -- erste Zahlung, bestimmt den Stichtag
  next_date         DATE NOT NULL CHECK (next_date > start_date),
  end_date          DATE CHECK (end_date IS NULL OR end_date >= start_date),
  paused            BOOLEAN NOT NULL DEFAULT false,
  auto_book         BOOLEAN NOT NULL DEFAULT false,  -- fällige Zahlungen ohne Nachfrage buchen
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recurring_expenses_user_idx ON public.recurring_expenses (user_id, next_date);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring_expenses_all_own" ON public.recurring_expenses
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Serie löschen: bisherige Zahlungen bleiben (echte Ausgaben), nur die Verbindung fällt weg.
-- Eine Zahlung pro Termin – schützt vor doppelten Buchungen (z. B. zwei offene Tabs).
-- NULL zählt nicht als gleich → normale Ausgaben sind nicht betroffen.
ALTER TABLE public.expenses
  ADD COLUMN recurring_id UUID REFERENCES public.recurring_expenses ON DELETE SET NULL,
  ADD CONSTRAINT expenses_recurring_date_key UNIQUE (recurring_id, expense_date);

-- Konto löschen: Serien mit entfernen
CREATE OR REPLACE FUNCTION public.delete_user_data(p_user UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.invoices           WHERE user_id = p_user;
  DELETE FROM public.expenses           WHERE user_id = p_user;
  DELETE FROM public.recurring_expenses WHERE user_id = p_user;
  DELETE FROM public.svs_payments       WHERE user_id = p_user;
  DELETE FROM public.assets             WHERE user_id = p_user;
  DELETE FROM public.incomes            WHERE user_id = p_user;
  DELETE FROM public.imports            WHERE user_id = p_user;
  DELETE FROM public.receipt_scans      WHERE user_id = p_user;
  DELETE FROM public.clients            WHERE user_id = p_user;
  DELETE FROM public.profiles           WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
