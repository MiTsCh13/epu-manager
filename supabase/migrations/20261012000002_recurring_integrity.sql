-- Wiederkehrende Ausgaben absichern:
-- 1) Eine Ausgabe kann nur auf eine EIGENE Serie zeigen (FK über id + user_id; FK-Prüfungen umgehen sonst RLS).
-- 2) Buchen und Löschen als Transaktion: erst den Termin der Serie weiterschieben, nur dann buchen – ein veralteter
--    Stand (zweiter Tab, schon übersprungen/gelöscht) bucht nichts mehr.
ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.expenses DROP CONSTRAINT expenses_recurring_id_fkey;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_recurring_id_fkey FOREIGN KEY (recurring_id, user_id)
  REFERENCES public.recurring_expenses (id, user_id) ON DELETE SET NULL (recurring_id);

-- Termine p_dates buchen, wenn next_date noch p_expected ist; danach next_date = p_next.
-- Liefert die ID der ersten gebuchten Ausgabe, NULL bei veraltetem Stand. Läuft mit den Rechten des Nutzers (RLS).
CREATE FUNCTION public.book_recurring(p_id UUID, p_expected DATE, p_dates DATE[], p_next DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  s public.recurring_expenses;
  first_id UUID;
BEGIN
  UPDATE public.recurring_expenses SET next_date = p_next
  WHERE id = p_id AND next_date = p_expected
  RETURNING * INTO s;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.expenses (user_id, recurring_id, expense_date, description, category_label, e1a_kz,
                               amount, amount_net, deductible_amount, is_bewirtung, reimbursed)
  SELECT s.user_id, s.id, d, CASE WHEN s.description = '' THEN s.category_label ELSE s.description END,
         s.category_label, s.e1a_kz, s.amount, s.amount_net, s.deductible_amount, s.is_bewirtung, s.reimbursed
  FROM unnest(p_dates) AS d
  ON CONFLICT (recurring_id, expense_date) DO NOTHING;

  SELECT id INTO first_id FROM public.expenses WHERE recurring_id = p_id AND expense_date = p_dates[1];
  RETURN first_id;
END;
$$;

-- Serie löschen, optional mit allen Zahlungen. Liefert die Belege der gelöschten Zahlungen (zum Aufräumen im Storage).
CREATE FUNCTION public.delete_recurring(p_id UUID, p_with_bookings BOOLEAN)
RETURNS TABLE (receipt_url TEXT) LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_with_bookings THEN
    RETURN QUERY DELETE FROM public.expenses e WHERE e.recurring_id = p_id RETURNING e.receipt_url;
  END IF;
  DELETE FROM public.recurring_expenses WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.book_recurring(UUID, DATE, DATE[], DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_recurring(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_recurring(UUID, DATE, DATE[], DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_recurring(UUID, BOOLEAN) TO authenticated;
