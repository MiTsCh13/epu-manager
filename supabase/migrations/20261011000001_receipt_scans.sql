-- Belege auslesen (Edge Function read-receipt): Protokoll je Lesevorgang.
-- Dient dem Tageslimit pro Person und der Kostenkontrolle. Der Beleg selbst wird hier nicht gespeichert –
-- er geht nur zum Auslesen an Claude (Anthropic) und landet erst beim Speichern der Ausgabe im Bucket „receipts“.
CREATE TABLE public.receipt_scans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('ok', 'refusal', 'error')),
  model          TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX receipt_scans_user_created_idx ON public.receipt_scans (user_id, created_at DESC);

-- Lesen darf man die eigenen Einträge; schreiben nur die Edge Function (Service-Role, umgeht RLS)
ALTER TABLE public.receipt_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipt_scans_select_own" ON public.receipt_scans
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Konto löschen: Protokoll mit entfernen
CREATE OR REPLACE FUNCTION public.delete_user_data(p_user UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.invoices      WHERE user_id = p_user;
  DELETE FROM public.expenses      WHERE user_id = p_user;
  DELETE FROM public.svs_payments  WHERE user_id = p_user;
  DELETE FROM public.assets        WHERE user_id = p_user;
  DELETE FROM public.incomes       WHERE user_id = p_user;
  DELETE FROM public.imports       WHERE user_id = p_user;
  DELETE FROM public.receipt_scans WHERE user_id = p_user;
  DELETE FROM public.clients       WHERE user_id = p_user;
  DELETE FROM public.profiles      WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
