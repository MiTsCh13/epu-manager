import { describe, expect, it } from 'vitest';
import { buildSvsTracker, insuredMonths, monthsElapsedInYear, svsDueDates, type TrackerInput } from '@/lib/svsTracker';

// „Lena“ aus dem Mockup: Grafikdesignerin, Gewerbe seit März 2025 (2. Jahr), Kleinunternehmerin, EÜR,
// erwarteter Umsatz 42.000 €, drei SVS-Quartale à 482,43 € bezahlt. Stichtag 4.10.2026.
const base: TrackerInput = {
  today: new Date(2026, 9, 4),
  registrationDate: new Date(2025, 2, 1),
  businessType: 'gewerbetreibend',
  exempt: false,
  isKleinunternehmer: true,
  profitMethod: 'euer',
  pauschType: null,
  industryType: null,
  quarterlyPrescription: null,
  revenueEstimate: 42000,
  current: { revenueNet: 31800, revenueGross: 31800, deductibleExpenses: 4900, svsPaid: 1447.29 },
  previous: { revenueNet: 19800, revenueGross: 19800, deductibleExpenses: 3400, svsPaid: 1608.1 },
};

describe('Hilfsfunktionen', () => {
  it('monthsElapsedInYear', () => {
    expect(monthsElapsedInYear(new Date(2026, 0, 1))).toBe(0);
    expect(monthsElapsedInYear(new Date(2026, 9, 4))).toBeCloseTo(9.07, 2);
  });

  it('insuredMonths: Anmeldemonat zählt voll', () => {
    expect(insuredMonths(new Date(2025, 2, 15), 2025)).toBe(10);
    expect(insuredMonths(new Date(2025, 2, 15), 2026)).toBe(12);
    expect(insuredMonths(new Date(2027, 0, 1), 2026)).toBe(0);
    expect(insuredMonths(null, 2026)).toBe(12);
  });

  it('svsDueDates: nur Fälligkeiten ab der Anmeldung', () => {
    expect(svsDueDates(2026, null).map((d) => d.getMonth())).toEqual([1, 4, 7, 10]);
    expect(svsDueDates(2026, new Date(2026, 5, 10)).map((d) => d.getMonth())).toEqual([7, 10]);
  });
});

describe('buildSvsTracker – Lena', () => {
  const m = buildSvsTracker(base);
  // Ausgaben bis heute (4.900 €) aufs Jahr hochgerechnet: 6.481,05 € (die Sommerzeit kürzt das Jahr bis 4.10. um eine Stunde)
  const expenses = Math.round(((4900 * 12) / monthsElapsedInYear(base.today)) * 100) / 100;

  it('Jahr und Umsatz-Erwartung', () => {
    expect(m.svsYear).toBe(2);
    expect(m.revenue).toMatchObject({ expected: 42000, estimated: true });
  });

  it('1 Jahresrechnung ganzes Jahr: Umsatz − Ausgaben − SVS − Grundfreibetrag = Einkünfte, darauf ESt', () => {
    expect(m.full).toEqual({
      revenue: 42000,
      expenses: 6481.05,
      arbeitsplatzpauschale: 0,
      svs: 1929.72, // 4 Quartale à 482,43 €
      gewinn: 33589.23,
      grundfreibetrag: 4950,
      einkuenfte: 28639.23,
      incomeTax: 3684.77, // 1.690,60 + (28.639,23 − 21.992) × 30 %
    });
    expect(m.full.expenses).toBe(expenses);
  });

  it('1 Jahresrechnung bis heute: ESt anteilig mit dem Jahres-Durchschnittssteuersatz', () => {
    expect(m.ytd).toMatchObject({ revenue: 31800, expenses: 4900, svs: 1447.29, grundfreibetrag: 3817.91, einkuenfte: 21634.8 });
    expect(m.ytd.incomeTax).toBeCloseTo(21634.8 * (3684.77 / 28639.23), 0);
  });

  it('2 SVS: Basis = Einkünfte + PV/KV, KV und Selbständigenvorsorge bleiben vorläufig (Jahr 2)', () => {
    expect(m.svs.provisionalReason).toBe('minimum');
    expect(m.svs.quarterlyAmount).toBe(482.43);
    expect(m.svs.hinzurechnung).toBe(1673.14);
    expect(m.svs.basis).toBe(30312.37);
    expect(m.svs.final.total).toBe(6314.07); // PV 18,5 % von 30.312,37 + KV/SV vorläufig + UV
    expect(m.svs.provisional.total).toBe(1929.72);
    expect(m.svs.difference).toBe(4384.35);
    expect(m.svs.unrecorded).toBe(0);
  });

  it('3 Einkommensteuer ohne Vorauszahlungen: alles noch offen', () => {
    expect(m.incomeTax).toEqual({ total: 3684.77, prepaymentQuarterly: 0, prepaymentTotal: 0, prepaymentPaid: 0, open: 3684.77 });
  });

  it('Vorjahr 2025 noch offen: SVS-Nachzahlung (10 Monate, Mindestbasis vorläufig), keine ESt unter der Grenze', () => {
    expect(m.previous?.year).toBe(2025);
    expect(m.previous?.svs?.provisional.total).toBe(1608.1);
    expect(m.previous?.svs?.difference).toBeCloseTo(1564.4, 0);
    expect(m.previous?.incomeTax).toBe(0);
  });

  it('4 Rücklage getrennt nach SVS und Finanzamt', () => {
    expect(m.reserve.items.map((i) => [i.id, i.payee])).toEqual([
      ['svs-quarters', 'svs'],
      ['svs-previous', 'svs'],
      ['svs-current', 'svs'],
      ['est-current', 'finanzamt'],
    ]);
    expect(m.reserve.items[0]).toMatchObject({ label: '4. Quartal 2026', amount: 482.43 });
    expect(m.reserve.finanzamt).toBe(3684.77);
    expect(m.reserve.total).toBeCloseTo(482.43 + m.previous!.svs!.difference + 4384.35 + 3684.77, 2);
  });

  it('was bleibt: Umsatz − Ausgaben − SVS endgültig − ESt', () => {
    expect(m.remaining).toBe(Math.round((42000 - 6481.05 - 6314.07 - 3684.77) * 100) / 100);
  });

  it('5 Zeitplan: Quartale, nächster Termin, Vorjahr, Folgejahr', () => {
    const ids = m.timeline.map((e) => e.id);
    expect(ids.slice(0, 4)).toEqual(['svs-q0', 'svs-q1', 'svs-q2', 'svs-q3']);
    expect(m.timeline.filter((e) => e.status === 'paid')).toHaveLength(3);
    expect(m.timeline.find((e) => e.status === 'next')?.id).toBe('svs-q3');
    expect(ids).toContain('prev-svs');
    expect(ids.slice(-4)).toEqual(['tax-return', 'est-current', 'svs-current', 'outlook']);
    expect(m.timeline.at(-1)?.note).toContain('3. Jahr');
    expect(m.timeline.at(-1)?.note).toContain('Vorauszahlungen');
  });

  it('keine Phasen-Hinweise mehr (ersetzt durch den Zeitplan)', () => {
    expect(m.alerts.some((a) => a.id.startsWith('phase-'))).toBe(false);
  });
});

describe('buildSvsTracker – Varianten', () => {
  it('ohne eigene Schätzung: lineare Hochrechnung', () => {
    const m = buildSvsTracker({ ...base, revenueEstimate: null });
    expect(m.revenue.estimated).toBe(false);
    expect(m.revenue.expected).toBeCloseTo((31800 / monthsElapsedInYear(base.today)) * 12, 1);
  });

  it('nicht erfasste SVS-Zahlungen: Klaro rechnet mit den fälligen Quartalen', () => {
    const m = buildSvsTracker({ ...base, current: { ...base.current, svsPaid: 0 } });
    expect(m.svs.unrecorded).toBe(1447.29);
    expect(m.ytd.svs).toBe(1447.29);
  });

  it('bezahlte Nachzahlung für Vorjahre: steuerlich abzugsfähig und Teil der Hinzurechnung', () => {
    const m = buildSvsTracker({ ...base, current: { ...base.current, svsPaid: 2447.29 } });
    expect(m.svs.extraPaid).toBe(1000);
    expect(m.full.svs).toBe(2929.72);
    expect(m.svs.hinzurechnung).toBe(2673.14);
  });

  it('Vorschreibung laut SVS-Brief hat Vorrang', () => {
    const m = buildSvsTracker({ ...base, quarterlyPrescription: 900 });
    expect(m.svs).toMatchObject({ provisionalReason: 'prescription', quarterlyAmount: 900, prescriptionKnown: true });
  });

  it('ab Jahr 4: vorläufige Basis aus dem Vorjahr', () => {
    const m = buildSvsTracker({ ...base, registrationDate: new Date(2021, 4, 1) });
    expect(m.svs.provisionalReason).toBe('previous');
    expect(m.previous?.svs).toBeNull(); // vorläufige Basis des Vorjahres unbekannt
  });

  it('Vorauszahlungen: bezahlte, offene und Rest-Steuer; Termine nach Datum sortiert', () => {
    const m = buildSvsTracker({ ...base, estPrepaymentQuarterly: 800 });
    expect(m.incomeTax).toMatchObject({ prepaymentTotal: 3200, prepaymentPaid: 2400, open: 484.77 });
    expect(m.reserve.items.find((i) => i.id === 'est-prepayments')?.amount).toBe(800);
    expect(m.previous?.incomeTax).toBeNull();
    // 15.11. (Vorauszahlung) kommt vor 30.11. (SVS)
    expect(m.timeline.find((e) => e.status === 'next')?.id).toBe('est-q3');
  });

  it('Vorjahr als erledigt markiert: keine offenen Vorjahresbeträge', () => {
    const m = buildSvsTracker({ ...base, assessedThroughYear: 2025 });
    expect(m.previous).toBeNull();
    expect(m.reserve.items.some((i) => i.id.endsWith('previous'))).toBe(false);
  });

  it('Arbeitsplatzpauschale und andere Einkünfte', () => {
    const m = buildSvsTracker({ ...base, arbeitsplatzpauschale: 1200, otherIncome: 18000 });
    expect(m.full.arbeitsplatzpauschale).toBe(1200);
    // Gewinn 32.389,23 € liegt jetzt unter 33.000 € → Grundfreibetrag 15 % = 4.858,38 €
    expect(m.full.einkuenfte).toBe(27530.85);
    expect(m.incomeTax.total).toBeGreaterThan(buildSvsTracker(base).incomeTax.total);
    expect(m.ytd.arbeitsplatzpauschale).toBeCloseTo((1200 * monthsElapsedInYear(base.today)) / 12, 1);
  });

  it('Pauschalierung: Ausgaben = Satz × Umsatz, kein „was bleibt“', () => {
    const m = buildSvsTracker({ ...base, profitMethod: 'pauschal', pauschType: 'ku', industryType: 'service' });
    expect(m.full.expenses).toBe(18900);
    expect(m.ytd.expenses).toBe(14310);
    expect(m.remaining).toBeNull();
  });

  it('Neue Selbständige unter der Versicherungsgrenze: nicht versichert, keine SVS-Nachzahlung in der Rücklage', () => {
    const m = buildSvsTracker({
      ...base,
      businessType: 'neue_selbstaendige',
      revenueEstimate: 4000,
      current: { revenueNet: 3000, revenueGross: 3000, deductibleExpenses: 0, svsPaid: 0 },
      previous: null,
    });
    expect(m.svs.notInsured).toBe(true);
    expect(m.reserve.items.some((i) => i.id === 'svs-current')).toBe(false);
  });

  it('Kleinstunternehmer-Ausnahme: nur UV; fällt weg, wenn die Grenze überschritten wird', () => {
    const small = { revenueNet: 3000, revenueGross: 3000, deductibleExpenses: 0, svsPaid: 0 };
    const exempt = buildSvsTracker({ ...base, exempt: true, revenueEstimate: 4000, current: small });
    expect(exempt.svs.exempt).toBe(true);
    expect(exempt.svs.final.total).toBe(155.4);
    const lost = buildSvsTracker({ ...base, exempt: true });
    expect(lost.exemptionLost).toBe(true);
    expect(lost.svs.exempt).toBe(false);
    expect(lost.alerts.map((a) => a.id)).toContain('exemption-lost');
  });

  it('Anmeldung im laufenden Jahr: Quartale ab Anmeldung, kein Vorjahr', () => {
    const m = buildSvsTracker({ ...base, registrationDate: new Date(2026, 5, 10), previous: null });
    expect(m.insuredMonths).toBe(7);
    expect(m.svs.quartersDue + m.svs.quartersOpen).toBe(2);
    expect(m.previous).toBeNull();
  });

  it('Umsatzgrenze: Hinweis ab 45.000 € brutto (nur Kleinunternehmer)', () => {
    const m = buildSvsTracker({ ...base, current: { ...base.current, revenueGross: 47000 } });
    expect(m.alerts.map((a) => a.id)).toContain('ku-approaching');
  });
});
