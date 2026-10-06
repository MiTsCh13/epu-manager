-- Kilometergeld nicht nur fürs Auto: Motorrad/Moped und Fahrrad haben einen eigenen amtlichen Satz.
-- NULL = Auto (bisherige Einträge).
ALTER TABLE public.expenses
  ADD COLUMN vehicle TEXT CHECK (vehicle IS NULL OR vehicle IN ('car', 'motorbike', 'bike'));

COMMENT ON COLUMN public.expenses.vehicle IS
  'Nur bei Kilometergeld (km_driven): car | motorbike | bike – bestimmt den amtlichen Satz pro km.';
