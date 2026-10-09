-- Rechnungs-Vorlagen: Aussehen und Zusatztexte der Rechnung (Logo, Kopfbild, Farbe, Schrift, Texte, Fußzeile,
-- Zahlungsziel). Die Pflichtangaben nach § 11 UStG setzt Klaro immer selbst – die Vorlage steuert nur die Gestaltung.
-- `settings` ist ein JSON-Objekt; Aufbau und Standardwerte stehen in src/lib/invoiceTemplates.ts.
CREATE TABLE public.invoice_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  settings    JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(settings) = 'object'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_templates_id_user_key UNIQUE (id, user_id)
);
-- Höchstens eine Standard-Vorlage pro Person
CREATE UNIQUE INDEX invoice_templates_one_default ON public.invoice_templates (user_id) WHERE is_default;

ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_templates_all_own" ON public.invoice_templates
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Vorlage pro Kunde (optional) und pro Rechnung. Nur eigene Vorlagen (FK über id + user_id).
ALTER TABLE public.clients ADD COLUMN template_id UUID;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_template_fkey FOREIGN KEY (template_id, user_id)
  REFERENCES public.invoice_templates (id, user_id) ON DELETE SET NULL (template_id);

-- template_snapshot: Vorlage zum Zeitpunkt des Ausstellens (Entwürfe: laufend aktualisiert) – alte Rechnungen
-- sehen auch nach Änderungen an der Vorlage aus wie beim Versand. intro_text: Einleitung über den Positionen.
ALTER TABLE public.invoices
  ADD COLUMN template_id       UUID,
  ADD COLUMN template_snapshot JSONB,
  ADD COLUMN intro_text        TEXT;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_template_fkey FOREIGN KEY (template_id, user_id)
  REFERENCES public.invoice_templates (id, user_id) ON DELETE SET NULL (template_id);

-- ─── Standard-Vorlage für alle (bestehende Fußzeile aus den Einstellungen übernehmen) ───
INSERT INTO public.invoice_templates (user_id, name, is_default, settings)
SELECT p.id, 'Standard', true,
       CASE WHEN COALESCE(p.invoice_footer_text, '') <> ''
            THEN jsonb_build_object('footer', jsonb_build_object('text', p.invoice_footer_text))
            ELSE '{}'::jsonb END
FROM public.profiles p;

CREATE FUNCTION public.profiles_create_default_template()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.invoice_templates (user_id, name, is_default) VALUES (NEW.id, 'Standard', true);
  RETURN NULL;
END;
$$;

CREATE TRIGGER profiles_create_default_template
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_create_default_template();

-- ─── Snapshot der Vorlage in invoices_prepare ───────────────
-- Gewählte Vorlage, sonst die Standard-Vorlage. Bild-Pfade bleiben gültig, weil Klaro Bilder nie überschreibt.
CREATE OR REPLACE FUNCTION public.invoices_prepare()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_subtotal NUMERIC(12,2) := 0;
  v_item     JSONB;
  v_is_ku    BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(
           item || jsonb_build_object(
             'total', round((item->>'quantity')::numeric * (item->>'unit_price')::numeric, 2))
           ORDER BY ord), '[]'::jsonb)
    INTO NEW.line_items
    FROM jsonb_array_elements(NEW.line_items) WITH ORDINALITY AS t(item, ord);

  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.line_items) LOOP
    v_subtotal := v_subtotal + (v_item->>'total')::numeric;
  END LOOP;

  SELECT is_kleinunternehmer INTO v_is_ku FROM public.profiles WHERE id = NEW.user_id;
  IF v_is_ku THEN
    NEW.vat_rate := 0;
  END IF;

  NEW.subtotal   := v_subtotal;
  NEW.vat_amount := round(v_subtotal * NEW.vat_rate / 100, 2);
  NEW.total      := NEW.subtotal + NEW.vat_amount;

  SELECT to_jsonb(c) - 'user_id' - 'created_at' - 'notes' - 'template_id'
    INTO NEW.client_snapshot
    FROM public.clients c WHERE c.id = NEW.client_id;

  SELECT jsonb_build_object(
           'full_name', p.full_name, 'business_name', p.business_name,
           'address', p.address, 'zip_code', p.zip_code, 'city', p.city, 'country', p.country,
           'uid_number', p.uid_number, 'iban', p.iban, 'account_holder', p.account_holder,
           'is_kleinunternehmer', p.is_kleinunternehmer)
    INTO NEW.issuer_snapshot
    FROM public.profiles p WHERE p.id = NEW.user_id;

  SELECT t.settings INTO NEW.template_snapshot
    FROM public.invoice_templates t
    WHERE t.user_id = NEW.user_id AND (t.id = NEW.template_id OR (NEW.template_id IS NULL AND t.is_default))
    ORDER BY (t.id = NEW.template_id) DESC
    LIMIT 1;

  RETURN NEW;
END;
$$;

-- ─── Ausgestellte Rechnungen: auch Vorlage und Einleitung sind unveränderbar ───
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
      NEW.template_snapshot, NEW.intro_text)
     IS DISTINCT FROM
     (OLD.invoice_number, OLD.invoice_date, OLD.due_date, OLD.client_id, OLD.is_honorarnote,
      OLD.line_items, OLD.subtotal, OLD.vat_rate, OLD.vat_amount, OLD.total, OLD.notes,
      OLD.service_date_from, OLD.service_date_to, OLD.footer_text, OLD.client_snapshot, OLD.issuer_snapshot,
      OLD.template_snapshot, OLD.intro_text)
  THEN
    RAISE EXCEPTION 'Ausgestellte Rechnungen können nicht mehr geändert werden.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Bisherige Rechnungen: Snapshot der Standard-Vorlage nachtragen (sieht aus wie bisher, nur mit Fußzeile)
ALTER TABLE public.invoices DISABLE TRIGGER invoices_a_protect_issued;
UPDATE public.invoices i SET template_snapshot = t.settings
FROM public.invoice_templates t
WHERE t.user_id = i.user_id AND t.is_default AND i.template_snapshot IS NULL;
ALTER TABLE public.invoices ENABLE TRIGGER invoices_a_protect_issued;

-- ─── Entwürfe folgen Änderungen an Vorlagen ─────────────────
CREATE FUNCTION public.invoice_templates_refresh_drafts()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE public.invoices SET vat_rate = vat_rate
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND status = 'draft';
  RETURN NULL;
END;
$$;

CREATE TRIGGER invoice_templates_refresh_drafts
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_templates
  FOR EACH ROW EXECUTE FUNCTION public.invoice_templates_refresh_drafts();

CREATE FUNCTION public.invoice_templates_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_templates_touch
  BEFORE UPDATE ON public.invoice_templates
  FOR EACH ROW EXECUTE FUNCTION public.invoice_templates_touch();

-- ─── Storage: Logos und Kopfbilder (privat, Ordner = User-ID, nie überschrieben) ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding', 'branding', false, 5242880, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "branding_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'branding' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "branding_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "branding_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ─── Konto löschen: Vorlagen mit entfernen (nach Rechnungen und Kunden, die auf sie zeigen) ───
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
  DELETE FROM public.invoice_templates  WHERE user_id = p_user;
  DELETE FROM public.profiles           WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
