-- Abo-Details für die Anzeige (Verlängerung bzw. Kündigung zum Periodenende) – nur serverseitig (Webhook) änderbar
ALTER TABLE public.profiles
  ADD COLUMN subscription_renews_at TIMESTAMPTZ,
  ADD COLUMN subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_subscription_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.stripe_customer_id                := OLD.stripe_customer_id;
    NEW.subscription_status               := OLD.subscription_status;
    NEW.trial_ends_at                     := OLD.trial_ends_at;
    NEW.subscription_renews_at            := OLD.subscription_renews_at;
    NEW.subscription_cancel_at_period_end := OLD.subscription_cancel_at_period_end;
  END IF;
  RETURN NEW;
END;
$$;
