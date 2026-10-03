-- Weicher Paywall: Nach Ablauf der Testphase ohne aktives Abo bleiben alle Daten sichtbar,
-- aber neue Rechnungen können weder angelegt noch ausgestellt werden. Serverseitig erzwungen.

CREATE FUNCTION public.has_active_access(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user
      AND (p.subscription_status = 'active'
           OR (p.subscription_status = 'trial' AND p.trial_ends_at > now()))
  );
$$;

-- Neue Rechnungen nur mit Zugang
DROP POLICY "invoices_insert_own" ON public.invoices;
CREATE POLICY "invoices_insert_own" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.has_active_access((SELECT auth.uid()))
    AND (client_id IS NULL OR EXISTS (
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = (SELECT auth.uid())))
  );

-- Entwurf ausstellen nur mit Zugang (Status ändern bei bestehenden Rechnungen, z. B. „bezahlt“, bleibt erlaubt)
CREATE FUNCTION public.invoices_require_access_to_issue()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status <> 'draft'
     AND current_user IN ('authenticated', 'anon')
     AND NOT public.has_active_access(NEW.user_id) THEN
    RAISE EXCEPTION 'Deine Testphase ist abgelaufen. Mit Klaro Pro kannst du wieder Rechnungen ausstellen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_b_require_access
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_require_access_to_issue();

CREATE INDEX profiles_stripe_customer_idx ON public.profiles (stripe_customer_id);
