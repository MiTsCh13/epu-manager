import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { calculateArbeitsplatzpauschale, otherIncomeAmount } from '@/lib/profit';
import { buildSvsTracker } from '@/lib/svsTracker';
import { useYearFigures } from './useYearFigures';
import type { BusinessType, IndustryType, OtherIncomeKind, PauschType, ProfitMethod } from '@/types';

/** SVS-Tracker-Modell für das laufende Jahr (gemeinsam für /svs und das Dashboard). */
export function useSvsTracker() {
  const { profile } = useAuth();
  const year = new Date().getFullYear();
  const { current, previous, loading, error, reload } = useYearFigures(year);

  const model = useMemo(() => {
    if (!profile) return null;
    const registrationDate = profile.svs_registration_date ? new Date(profile.svs_registration_date) : null;
    const kind = profile.other_income_kind as OtherIncomeKind | null;
    const otherIncome = otherIncomeAmount(kind, profile.other_income_amount === null ? null : Number(profile.other_income_amount));
    const app = (y: number) =>
      calculateArbeitsplatzpauschale({
        homeOffice: profile.home_office,
        otherIncomeKind: kind,
        otherIncomeAmount: otherIncome,
        year: y,
        registrationDate,
      }).amount;
    return buildSvsTracker({
      today: new Date(),
      registrationDate,
      businessType: profile.business_type as BusinessType | null,
      exempt: profile.svs_exempt,
      isKleinunternehmer: profile.is_kleinunternehmer,
      profitMethod: profile.profit_method as ProfitMethod,
      pauschType: profile.pausch_type as PauschType | null,
      industryType: profile.industry_code as IndustryType | null,
      quarterlyPrescription: profile.svs_quarterly_prescription === null ? null : Number(profile.svs_quarterly_prescription),
      arbeitsplatzpauschale: app(year),
      arbeitsplatzpauschalePrevious: app(year - 1),
      otherIncome,
      estPrepaymentQuarterly: profile.est_prepayment_quarterly === null ? null : Number(profile.est_prepayment_quarterly),
      // Eigene Umsatz-Schätzung gilt nur für das Jahr, für das sie eingegeben wurde
      revenueEstimate:
        profile.revenue_estimate !== null && profile.revenue_estimate_year === year ? Number(profile.revenue_estimate) : null,
      assessedThroughYear: profile.assessed_through_year,
      current,
      previous,
    });
  }, [profile, current, previous, year]);

  return { model, year, current, loading, error, reload };
}
