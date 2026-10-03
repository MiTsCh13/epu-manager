-- Kunden mit Rechnungen dürfen nicht gelöscht werden:
-- Der Empfänger ist Pflichtangabe nach § 11 UStG und muss auf alten Rechnungen erhalten bleiben.
ALTER TABLE public.invoices DROP CONSTRAINT invoices_client_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients (id) ON DELETE RESTRICT;
