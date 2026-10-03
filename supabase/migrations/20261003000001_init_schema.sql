-- Klaro – Initiales Schema
-- Tabellen: profiles, clients, invoices, expenses, svs_payments
-- RLS auf allen Tabellen: jeder Nutzer sieht ausschließlich eigene Daten.

-- ─────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name             TEXT,
  business_name         TEXT,
  address               TEXT,
  zip_code              TEXT,
  city                  TEXT,
  country               TEXT NOT NULL DEFAULT 'AT',
  uid_number            TEXT,
  iban                  TEXT,

  -- Steuerliche Einstellungen
  is_kleinunternehmer   BOOLEAN NOT NULL DEFAULT true,
  profit_method         TEXT NOT NULL DEFAULT 'pauschal'
                          CHECK (profit_method IN ('pauschal', 'euer')),
  pausch_type           TEXT DEFAULT 'ku'
                          CHECK (pausch_type IN ('ku', 'basis_15', 'basis_6')),
  business_type         TEXT
                          CHECK (business_type IN ('gewerbetreibend', 'neue_selbstaendige')),
  industry_code         TEXT,  -- Wirtschaftszweig; bestimmt KU-Pauschalsatz (Dienstleistung 45 % / Handel 20 %)

  -- SVS
  svs_registration_date DATE,
  svs_exempt            BOOLEAN NOT NULL DEFAULT false,

  -- Rechnungen
  invoice_number_format TEXT NOT NULL DEFAULT 'YYYY-NNN'
                          CHECK (invoice_number_format IN ('YYYY-NNN', 'KL-YYYY-NNN')),
  invoice_footer_text   TEXT,

  -- Subscription (nur serverseitig änderbar, siehe Trigger unten)
  stripe_customer_id    TEXT,
  subscription_status   TEXT NOT NULL DEFAULT 'trial'
                          CHECK (subscription_status IN ('trial', 'active', 'expired')),
  trial_ends_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),

  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email        TEXT,
  address      TEXT,
  zip_code     TEXT,
  city         TEXT,
  country      TEXT NOT NULL DEFAULT 'AT',
  uid_number   TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_user_id_idx ON public.clients (user_id);

-- ─────────────────────────────────────────────────────────────
-- invoices
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  client_id       UUID REFERENCES public.clients ON DELETE SET NULL,
  invoice_number  TEXT NOT NULL,
  invoice_date    DATE NOT NULL,
  due_date        DATE,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  is_honorarnote  BOOLEAN NOT NULL DEFAULT false,
  line_items      JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(line_items) = 'array'),
  -- line_items: [{description, quantity, unit_price, total}]
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (vat_rate IN (0, 10, 13, 20)),
  vat_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- §11 UStG: fortlaufende, eindeutige Rechnungsnummer pro Unternehmer
  CONSTRAINT invoices_user_number_unique UNIQUE (user_id, invoice_number)
);
CREATE INDEX invoices_user_date_idx ON public.invoices (user_id, invoice_date DESC);
CREATE INDEX invoices_client_id_idx ON public.invoices (client_id);

-- ─────────────────────────────────────────────────────────────
-- expenses
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  description       TEXT NOT NULL DEFAULT '',
  amount            NUMERIC(10,2) NOT NULL CHECK (amount >= 0),  -- Brutto
  amount_net        NUMERIC(10,2),

  e1a_kz            TEXT NOT NULL,
  category_label    TEXT NOT NULL,

  is_bewirtung      BOOLEAN NOT NULL DEFAULT false,
  km_driven         NUMERIC(6,1) CHECK (km_driven IS NULL OR km_driven >= 0),
  deductible_amount NUMERIC(10,2),

  expense_date      DATE NOT NULL,
  receipt_url       TEXT,  -- Pfad im Storage-Bucket 'receipts'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_user_date_idx ON public.expenses (user_id, expense_date DESC);

-- Bewirtungsregel serverseitig erzwingen: nur 50 % absetzbar.
-- Ohne explizit gesetzten Wert ist der volle Betrag absetzbar.
CREATE FUNCTION public.expenses_set_deductible()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.is_bewirtung THEN
    NEW.deductible_amount := round(NEW.amount * 0.5, 2);
  ELSIF NEW.deductible_amount IS NULL THEN
    NEW.deductible_amount := NEW.amount;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_set_deductible
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_set_deductible();

-- ─────────────────────────────────────────────────────────────
-- svs_payments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.svs_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  payment_date DATE NOT NULL,
  quarter      TEXT CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  year         INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX svs_payments_user_year_idx ON public.svs_payments (user_id, year);

-- ─────────────────────────────────────────────────────────────
-- Profil automatisch bei Registrierung anlegen
-- ─────────────────────────────────────────────────────────────
CREATE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Subscription-Felder vor Manipulation durch den Client schützen.
-- Nur service_role (Stripe-Webhook) bzw. postgres darf sie ändern.
-- ─────────────────────────────────────────────────────────────
CREATE FUNCTION public.protect_subscription_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.stripe_customer_id  := OLD.stripe_customer_id;
    NEW.subscription_status := OLD.subscription_status;
    NEW.trial_ends_at       := OLD.trial_ends_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_subscription
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_fields();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svs_payments ENABLE ROW LEVEL SECURITY;

-- profiles: lesen + bearbeiten nur eigenes Profil (Anlage per Trigger, kein Löschen)
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

-- clients, expenses, svs_payments: volle CRUD-Rechte auf eigene Zeilen
CREATE POLICY "clients_all_own" ON public.clients
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "expenses_all_own" ON public.expenses
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "svs_payments_all_own" ON public.svs_payments
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- invoices: zusätzlich darf client_id nur auf einen eigenen Kunden zeigen
CREATE POLICY "invoices_all_own" ON public.invoices
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_id AND c.user_id = (SELECT auth.uid())
      )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Storage: Belegfotos (privat, max. 5 MB, Ordner = User-ID)
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts', 'receipts', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "receipts_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "receipts_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "receipts_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "receipts_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
