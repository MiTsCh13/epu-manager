-- Weniger Kategorien (Kacheln mit Unterauswahl), Diäten und Nächtigung, Ausgaben neben der Pauschalierung.

-- Tagesgeld: Reisedauer in Stunden; Nächtigung pauschal: Anzahl Nächte (Betrag berechnet der Client)
-- reimbursed: an Kund:innen weiterverrechnete Reisekosten – bei Pauschalierung zusätzlich absetzbar (§ 17 EStG)
ALTER TABLE public.expenses
  ADD COLUMN trip_hours NUMERIC(6,1) CHECK (trip_hours IS NULL OR trip_hours > 0),
  ADD COLUMN nights     INTEGER CHECK (nights IS NULL OR nights > 0),
  ADD COLUMN reimbursed BOOLEAN NOT NULL DEFAULT false;

-- Bestehende Ausgaben auf die neuen Kategorien umstellen (Label = Anzeigename, e1a_kz = Kennzahl im E1a)
UPDATE public.expenses SET category_label = 'Büro & Software', e1a_kz = '9230'
  WHERE category_label IN ('Software & Abos', 'Büromaterial', 'Telefon & Internet');
UPDATE public.expenses SET category_label = 'Fahrten & Reisen', e1a_kz = '9160'
  WHERE category_label = 'Reisen & Fahrtkosten';
UPDATE public.expenses SET category_label = 'Werbung', e1a_kz = '9200'
  WHERE category_label = 'Marketing & Werbung';
UPDATE public.expenses SET category_label = 'Geschäftsessen (50 %)', e1a_kz = '9200'
  WHERE category_label = 'Bewirtung (50%)';
UPDATE public.expenses SET category_label = 'Öffi-Karte (50 %)', e1a_kz = '9165'
  WHERE category_label = 'Öffi-Jahreskarte (50%)';
UPDATE public.expenses SET category_label = 'Waren & Material', e1a_kz = '9100'
  WHERE category_label = 'Waren & Materialien';
UPDATE public.expenses SET category_label = 'Versicherung & Beratung', e1a_kz = '9230'
  WHERE category_label IN ('Versicherungen', 'Steuerberatung');
UPDATE public.expenses SET category_label = 'Kurse & Fachbücher', e1a_kz = '9230'
  WHERE category_label = 'Fortbildung & Kurse';
-- „Bankspesen & Zinsen“ lag komplett auf 9220 (Zinsen). Gebühren gehören auf 9230.
UPDATE public.expenses SET category_label = 'Kreditzinsen', e1a_kz = '9220'
  WHERE category_label = 'Bankspesen & Zinsen' AND description ILIKE '%zins%'
    AND description <> 'Bankspesen & Zinsen';  -- leere Beschreibung wurde mit dem Kategorienamen gefüllt
UPDATE public.expenses SET category_label = 'Bankgebühren', e1a_kz = '9230'
  WHERE category_label = 'Bankspesen & Zinsen';

-- Anlagen aus „Software & Abos“ (Rückfrage „mehrere Jahre nutzen“)
UPDATE public.assets SET category_label = 'Büro & Software'
  WHERE category_label IN ('Software & Abos', 'Büromaterial', 'Telefon & Internet');

COMMENT ON COLUMN public.profiles.industry_code IS
  'Nur KU-Pauschalierung: service = Dienstleistungsbetrieb laut Verordnung BGBl. II 615/2020 (20 %), trade = anderer Betrieb (45 %).';
