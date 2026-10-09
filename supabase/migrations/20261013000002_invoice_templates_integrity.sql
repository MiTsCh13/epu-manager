-- Rechnungs-Vorlagen absichern:
-- 1) Standard-Vorlage wechseln in einer Transaktion (sonst gäbe es kurz – oder bei Fehlern dauerhaft – keine)
-- 2) Die Standard-Vorlage lässt sich nicht löschen (außer beim Löschen des Kontos)
-- 3) Logos und Kopfbilder sind unveränderlich: ausgestellte Rechnungen zeigen auf sie (Löschen nur per Kontolöschung)
-- 4) Indizes für ON DELETE SET NULL beim Löschen einer Vorlage

CREATE FUNCTION public.set_default_template(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.invoice_templates WHERE id = p_id) THEN
    RAISE EXCEPTION 'Vorlage nicht gefunden' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE public.invoice_templates SET is_default = false WHERE is_default AND id <> p_id;
  UPDATE public.invoice_templates SET is_default = true WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_template(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_template(UUID) TO authenticated;

CREATE FUNCTION public.invoice_templates_keep_default()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Solange das Profil existiert, muss es eine Standard-Vorlage geben
  IF OLD.is_default AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.user_id) THEN
    RAISE EXCEPTION 'Die Standard-Vorlage kann nicht gelöscht werden.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER invoice_templates_keep_default
  BEFORE DELETE ON public.invoice_templates
  FOR EACH ROW EXECUTE FUNCTION public.invoice_templates_keep_default();

DROP POLICY "branding_delete_own" ON storage.objects;

CREATE INDEX clients_template_idx ON public.clients (template_id) WHERE template_id IS NOT NULL;
CREATE INDEX invoices_template_idx ON public.invoices (template_id) WHERE template_id IS NOT NULL;

-- Konto löschen: Profil vor den Vorlagen entfernen (sonst schützt der Trigger die Standard-Vorlage)
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
  DELETE FROM public.invoice_templates  WHERE user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
