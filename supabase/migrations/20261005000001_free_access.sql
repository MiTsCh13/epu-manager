-- Klaro ist vorerst kostenlos: keine Testphase, keine Paywall (Frontend: VITE_BILLING_ENABLED nicht gesetzt).
-- Die Abo-Logik (Stripe, Webhook, Trigger) bleibt bestehen; nur die Zugangsprüfung erlaubt immer.
--
-- Abo-Pflicht wieder einschalten: neue Migration mit der ursprünglichen Prüfung aus
-- 20261003000008_paywall.sql (aktives Abo oder laufende Testphase) – und vorher trial_ends_at
-- bestehender Nutzer verlängern, sonst landen sie sofort hinter der Paywall.
CREATE OR REPLACE FUNCTION public.has_active_access(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user);
$$;
