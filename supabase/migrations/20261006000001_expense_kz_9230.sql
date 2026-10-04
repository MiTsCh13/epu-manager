-- „Sonstige Ausgaben“ war auf KZ 9090 gemappt – das ist im E1a „Übrige Erträge“ (eine Einnahme).
-- Richtig ist KZ 9230 „Übrige Betriebsausgaben“.
UPDATE public.expenses
SET e1a_kz = '9230'
WHERE e1a_kz = '9090';
