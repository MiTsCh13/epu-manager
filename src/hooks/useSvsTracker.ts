import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { calculateArbeitsplatzpauschale, otherIncomeAmount } from '@/lib/profit';
import { buildSvsTracker } from '@/lib/svsTracker';
import { useYearFigures } from './useYearFigures';
import type { BusinessType, IndustryType, OtherIncomeKind, PauschType, Profile, ProfitMethod } from '@/types';

const otherIncomeOf = (p: Profile) =>
  otherIncomeAmount(p.other_income_kind as OtherIncomeKind | null, p.other_income_amount === null ? null : Number(p.other_income_amount));

/** SVS-Tracker-Modell für das laufende Jahr (gemeinsam für /svs und das Dashboard). */
export function useSvsTracker() {
  const { profile, profileFor } = useAuth();
  const year = new Date().getFullYear();
  const { current, previous, loading, error, reload } = useYearFigures(year);

  const model = useMemo(() => {
    // Steuer-Einstellungen gelten pro Jahr – laufendes Jahr und Vorjahr können sich unterscheiden
    const now = profileFor(year);
    const prev = profileFor(year - 1);
    if (!profile || !now || !prev) return null;
    const registrationDate = profile.svs_registration_date ? new Date(profile.svs_registration_date) : null;
    const app = (p: Profile, y: number) =>
      calculateArbeitsplatzpauschale({
        homeOffice: p.home_office,
        otherIncomeKind: p.other_income_kind as OtherIncomeKind | null,
        otherIncomeAmount: otherIncomeOf(p),
        year: y,
        registrationDate,
      }).amount;
    return buildSvsTracker({
      today: new Date(),
      registrationDate,
      businessType: profile.business_type as BusinessType | null,
      exempt: now.svs_exempt,
      isKleinunternehmer: now.is_kleinunternehmer,
      profitMethod: now.profit_method as ProfitMethod,
      pauschType: now.pausch_type as PauschType | null,
      industryType: now.industry_code as IndustryType | null,
      quarterlyPrescription: profile.svs_quarterly_prescription === null ? null : Number(profile.svs_quarterly_prescription),
      arbeitsplatzpauschale: app(now, year),
      arbeitsplatzpauschalePrevious: app(prev, year - 1),
      otherIncome: otherIncomeOf(now),
      estPrepaymentQuarterly: profile.est_prepayment_quarterly === null ? null : Number(profile.est_prepayment_quarterly),
      // Eigene Umsatz-Schätzung gilt nur für das Jahr, für das sie eingegeben wurde
      revenueEstimate:
        profile.revenue_estimate !== null && profile.revenue_estimate_year === year ? Number(profile.revenue_estimate) : null,
      assessedThroughYear: profile.assessed_through_year,
      current,
      previous,
      previousSettings: {
        exempt: prev.svs_exempt,
        profitMethod: prev.profit_method as ProfitMethod,
        pauschType: prev.pausch_type as PauschType | null,
        industryType: prev.industry_code as IndustryType | null,
        otherIncome: otherIncomeOf(prev),
      },
    });
  }, [profile, profileFor, current, previous, year]);

  return { model, year, current, loading, error, reload };
}
