-- Klaro – Testdaten (NUR Entwicklung)
-- Login: test@example.com / KlaroTest2026!
-- Profil: Klaro Test GmbH · Kleinunternehmer · EÜR · SVS-Anmeldung 01.03.2024 (2026 = SVS-Jahr 3)
-- Idempotent: feste UUIDs + ON CONFLICT DO NOTHING.

-- Testnutzer
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'test@example.com',
  extensions.crypt('KlaroTest2026!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Max Mustermann"}',
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"test@example.com","email_verified":true}',
  'email', now(), now(), now()
) ON CONFLICT DO NOTHING;

-- Profil (vom Trigger angelegt, hier befüllt)
UPDATE public.profiles SET
  full_name             = 'Max Mustermann',
  business_name         = 'Klaro Test GmbH',
  address               = 'Mariahilfer Straße 1',
  zip_code              = '1060',
  city                  = 'Wien',
  iban                  = 'AT61 1904 3002 3457 3201',
  is_kleinunternehmer   = true,
  profit_method         = 'euer',
  pausch_type           = NULL,
  business_type         = 'neue_selbstaendige',
  industry_code         = 'service',
  svs_registration_date = '2024-03-01',
  invoice_number_format = 'YYYY-NNN',
  onboarding_completed  = true
WHERE id = '11111111-1111-4111-8111-111111111111';

-- Kunden
INSERT INTO public.clients (id, user_id, name, email, address, zip_code, city, uid_number) VALUES
  ('22222222-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Alpenblick Hotel GmbH', 'office@alpenblick.example', 'Hauptplatz 5', '6020', 'Innsbruck', 'ATU12345678'),
  ('22222222-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Sonnenschein Werbeagentur OG', 'hallo@sonnenschein.example', 'Landstraße 12', '4020', 'Linz', NULL),
  ('22222222-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'Mag. Anna Huber', 'anna.huber@example.com', 'Getreidegasse 9', '5020', 'Salzburg', NULL)
ON CONFLICT (id) DO NOTHING;

-- Rechnungen 2026 (Kleinunternehmer → 0 % USt)
INSERT INTO public.invoices
  (id, user_id, client_id, invoice_number, invoice_date, due_date, status, line_items, subtotal, vat_rate, vat_amount, total, paid_at)
VALUES
  ('33333333-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000001',
   '2026-001', '2026-01-15', '2026-01-29', 'paid',
   '[{"description":"Website-Relaunch","quantity":1,"unit_price":4200,"total":4200}]', 4200, 0, 0, 4200, '2026-01-27'),
  ('33333333-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000002',
   '2026-002', '2026-02-20', '2026-03-06', 'paid',
   '[{"description":"UX-Workshop","quantity":2,"unit_price":950,"total":1900}]', 1900, 0, 0, 1900, '2026-03-02'),
  ('33333333-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000001',
   '2026-003', '2026-04-10', '2026-04-24', 'paid',
   '[{"description":"Wartung & Support Q2","quantity":20,"unit_price":95,"total":1900},{"description":"Buchungsmodul","quantity":1,"unit_price":2800,"total":2800}]', 4700, 0, 0, 4700, '2026-04-22'),
  ('33333333-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000003',
   '2026-004', '2026-05-18', '2026-06-01', 'paid',
   '[{"description":"Logo & Visitenkarten","quantity":1,"unit_price":1350,"total":1350}]', 1350, 0, 0, 1350, '2026-05-30'),
  ('33333333-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000002',
   '2026-005', '2026-06-25', '2026-07-09', 'paid',
   '[{"description":"Kampagnen-Landingpages","quantity":3,"unit_price":1100,"total":3300}]', 3300, 0, 0, 3300, '2026-07-07'),
  ('33333333-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000001',
   '2026-006', '2026-08-05', '2026-08-19', 'overdue',
   '[{"description":"Wartung & Support Q3","quantity":24,"unit_price":95,"total":2280}]', 2280, 0, 0, 2280, NULL),
  ('33333333-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000003',
   '2026-007', '2026-09-22', '2026-10-06', 'sent',
   '[{"description":"Fotoshooting Portraits","quantity":1,"unit_price":890,"total":890}]', 890, 0, 0, 890, NULL),
  ('33333333-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000002',
   '2026-008', '2026-10-01', '2026-10-15', 'draft',
   '[{"description":"Social-Media-Templates","quantity":10,"unit_price":120,"total":1200}]', 1200, 0, 0, 1200, NULL)
ON CONFLICT (id) DO NOTHING;

-- Ausgaben (deductible_amount setzt der Trigger; Bewirtung → 50 %)
INSERT INTO public.expenses (id, user_id, description, amount, e1a_kz, category_label, is_bewirtung, km_driven, expense_date) VALUES
  ('44444444-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Adobe Creative Cloud (Jahresabo)', 714.00, '9230', 'Büro & Software', false, NULL, '2026-01-08'),
  ('44444444-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Druckerpapier & Toner', 86.40, '9230', 'Büro & Software', false, NULL, '2026-02-03'),
  ('44444444-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Kundentermin Innsbruck (180 km)', 90.00, '9160', 'Fahrten & Reisen', false, 180.0, '2026-03-12'),
  ('44444444-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Geschäftsessen Alpenblick', 124.50, '9200', 'Geschäftsessen (50 %)', true, NULL, '2026-04-10'),
  ('44444444-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'LinkedIn-Anzeigen', 250.00, '9200', 'Werbung', false, NULL, '2026-05-20'),
  ('44444444-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Magenta Mobil & Internet', 49.90, '9230', 'Büro & Software', false, NULL, '2026-09-01'),
  ('44444444-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'Online-Kurs Figma Advanced', 189.00, '9230', 'Kurse & Fachbücher', false, NULL, '2026-09-15'),
  ('44444444-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'Kaffee mit Neukundin', 18.60, '9200', 'Geschäftsessen (50 %)', true, NULL, '2026-09-28')
ON CONFLICT (id) DO NOTHING;

-- SVS-Vorschreibungen 2026 (vorläufige Beiträge auf Mindestbasis)
INSERT INTO public.svs_payments (id, user_id, amount, payment_date, quarter, year) VALUES
  ('55555555-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 482.44, '2026-02-27', 'Q1', 2026),
  ('55555555-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 482.44, '2026-05-29', 'Q2', 2026),
  ('55555555-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 482.44, '2026-08-31', 'Q3', 2026)
ON CONFLICT (id) DO NOTHING;

-- Zweiter Testnutzer OHNE abgeschlossenes Onboarding (zum Durchklicken des Wizards)
-- Login: neu@example.com / KlaroTest2026!
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-222222222222',
  'authenticated', 'authenticated', 'neu@example.com',
  extensions.crypt('KlaroTest2026!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Nora Neu"}',
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  '11111111-1111-4111-8111-222222222222',
  '11111111-1111-4111-8111-222222222222',
  '11111111-1111-4111-8111-222222222222',
  '{"sub":"11111111-1111-4111-8111-222222222222","email":"neu@example.com","email_verified":true}',
  'email', now(), now(), now()
) ON CONFLICT DO NOTHING;
