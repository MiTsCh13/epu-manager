import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { buildSvsTracker } from '@/lib/svsTracker';
import { useYearFigures } from './useYearFigures';
import type { BusinessType, IndustryType, PauschType, ProfitMethod } from '@/types';

/** SVS-Tracker-Modell für das laufende Jahr (gemeinsam für /svs und das Dashboard). */
export function useSvsTracker() {
  const { profile } = useAuth();
  const year = new Date().getFullYear();
  const { current, previous, loading, error, reload } = useYearFigures(year);

  const model = useMemo(
    () =>
      profile
        ? buildSvsTracker({
            today: new Date(),
            registrationDate: profile.svs_registration_date ? new Date(profile.svs_registration_date) : null,
            businessType: profile.business_type as BusinessType | null,
            exempt: profile.svs_exempt,
            isKleinunternehmer: profile.is_kleinunternehmer,
            profitMethod: profile.profit_method as ProfitMethod,
            pauschType: profile.pausch_type as PauschType | null,
            industryType: profile.industry_code as IndustryType | null,
            quarterlyPrescription: profile.svs_quarterly_prescription === null ? null : Number(profile.svs_quarterly_prescription),
            current,
            previous,
          })
        : null,
    [profile, current, previous],
  );

  return { model, year, current, loading, error, reload };
}
