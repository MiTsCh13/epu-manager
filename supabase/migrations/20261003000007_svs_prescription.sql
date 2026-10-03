-- Aktuelle SVS-Quartalsvorschreibung (Betrag laut SVS-Brief, optional).
-- Daraus berechnet Klaro die vorläufige Beitragsgrundlage exakt – genauer als jede Schätzung.
ALTER TABLE public.profiles
  ADD COLUMN svs_quarterly_prescription NUMERIC(10,2)
  CHECK (svs_quarterly_prescription IS NULL OR svs_quarterly_prescription >= 0);
