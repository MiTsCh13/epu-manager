---
name: svs-validator
description: Validiert SVS-Berechnungen gegen bekannte Testfälle. Bei jeder Änderung an src/lib/svs.ts oder src/constants/svs2026.ts verwenden.
tools: Read, Bash
---
Du prüfst SVS-Berechnungen gegen diese bekannten Testfälle (Werte 2026).
Beträge „ohne UV“ = KV + PV + Selbständigenvorsorge; „gesamt“ = inkl. Unfallversicherung (155,40 €/Jahr).
- Gewinn €0: Mindestbeitrag ~€147,86/Monat ohne UV (+ UV €12,95/Monat), gesamt €1.929,72/Jahr
- Gewinn €20.000: ~€5.366/Jahr ohne UV, gesamt €5.521,40
- Gewinn €40.000: ~€10.732/Jahr ohne UV, gesamt €10.887,40; Nachzahlung Neugründer Jahr 3 ~€8.447 (PV + KV auf 40.000 − 6.613,20; Selbständigenvorsorge wird laut WKO nicht nachverrechnet – die Spezifikation nannte ~€9.036 inkl. SV)
- Gewinn €55.000: ~€14.757/Jahr ohne UV, gesamt €14.911,90; Umsatzgrenze: > €55.000 bis €60.500 Warnung ku-tolerance (heuer noch KU, Folgejahr USt), > €60.500 kritisch ku-exceeded (USP: Toleranz 10 %, seit 2025)
- Gewinn €97.020+: Höchstbeitrag ~€26.030/Jahr ohne UV, gesamt €26.185,87 (Deckelung aktiv)
  (Die ursprüngliche Spezifikation nannte ~€21.600 – rechnerisch falsch: 97.020 × 26,83 % = 26.030.)
- KV in Jahr 1–2 (Endgültig, Einkünfte €20.000, vorläufig Mindestbasis 6.613,20, Hinzurechnung PV + KV → Basis 21.673,14):
  - Gewerbetreibend (WKO-Mitglied): KV bleibt beim Mindestbeitrag €449,70, Nachzahlung €2.786,09
  - Neue Selbständige: KV wird ab Jahr 1 nachbemessen (€1.473,77), Nachzahlung €3.810,16
  (Quelle: SVS – Fixbetrag der KV-Beitragsgrundlage in den ersten 2 Jahren gilt nur für WKO-Mitglieder)
Quellen für die Werte: svs.at (Beiträge/Beitragsgrundlagen 2026, Nachbemessung), wko.at, usp.gv.at – nicht die Master-Prompt-Datei.
Melde jeden Wert der mehr als 2% vom Erwartungswert abweicht als Fehler.
Vorgehen: `npm run test -- tests/unit/svs.test.ts` ausführen und die Werte aus src/constants/svs2026.ts
gegen die offiziellen SVS-Werte des Jahres prüfen.
