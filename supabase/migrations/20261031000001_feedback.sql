-- Feedback & Wünsche aus der App. Nutzer können nur eigenes Feedback anlegen – lesen, ändern und löschen kann nur der
-- Betreiber (Dashboard / service_role). Die E-Mail-Adresse kommt nur mit, wenn man einer Antwort zustimmt, und wird
-- dann von der Datenbank aus dem Konto übernommen (nicht frei eingebbar).
CREATE TABLE public.feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('wish', 'bug', 'praise', 'other')),
  message    TEXT NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 4000),
  page       TEXT CHECK (page IS NULL OR length(page) <= 200),   -- Seite, auf der das Feedback geschrieben wurde
  contact_ok BOOLEAN NOT NULL DEFAULT false,
  email      TEXT,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'planned', 'done', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX feedback_created_at_idx ON public.feedback (created_at DESC);
CREATE INDEX feedback_user_id_idx ON public.feedback (user_id, created_at);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_insert_own" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Vor dem Speichern: E-Mail nur bei Zustimmung (aus dem Konto), Status immer „neu“, höchstens 20 Meldungen pro Tag
CREATE FUNCTION public.feedback_prepare()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT count(*) FROM public.feedback WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'Du hast heute schon sehr viel Feedback geschickt – danke! Bitte versuch es morgen wieder.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.status := 'new';
  NEW.created_at := now();
  NEW.email := CASE WHEN NEW.contact_ok THEN (SELECT email FROM auth.users WHERE id = NEW.user_id) ELSE NULL END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER feedback_prepare
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.feedback_prepare();

-- Konto löschen: Feedback mit entfernen
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
  DELETE FROM public.products           WHERE user_id = p_user;
  DELETE FROM public.clients            WHERE user_id = p_user;
  DELETE FROM public.tax_years          WHERE user_id = p_user;
  DELETE FROM public.feedback           WHERE user_id = p_user;
  DELETE FROM public.profiles           WHERE id = p_user;
  DELETE FROM public.invoice_templates  WHERE user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
