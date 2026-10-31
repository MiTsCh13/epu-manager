-- Feedback absichern (Review): Der Trigger läuft vor der RLS-Prüfung – deshalb nur mit der eigenen ID arbeiten,
-- parallel gesendete Meldungen sperren, damit das Tageslimit hält, und ein eigener Fehlercode für das Limit
-- (check_violation nutzen auch die CHECK-Regeln, deren englischer Text nicht in der App landen soll).
CREATE OR REPLACE FUNCTION public.feedback_prepare()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Feedback nur für das eigene Konto.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('feedback:' || NEW.user_id::text));
  IF (SELECT count(*) FROM public.feedback WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'Du hast heute schon sehr viel Feedback geschickt – danke! Bitte versuch es morgen wieder.'
      USING ERRCODE = 'P0001', HINT = 'feedback_limit';
  END IF;
  NEW.status := 'new';
  NEW.created_at := now();
  NEW.email := CASE WHEN NEW.contact_ok THEN (SELECT email FROM auth.users WHERE id = NEW.user_id) ELSE NULL END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_prepare() FROM PUBLIC, anon, authenticated;
