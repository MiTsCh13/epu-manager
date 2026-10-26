import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  isSectionDirty,
  profileToSettingsData,
  sectionPatch,
  validateSection,
  type SettingsData,
  type SettingsSection,
} from '@/lib/profileSettings';
import { planTaxChange, sameTaxSettings, TAX_FIELDS, taxSettingsFor, type TaxChangeStart, type TaxSettings } from '@/lib/taxYears';
import type { OnboardingData, OnboardingErrors } from '@/lib/validation';
import type { ProfileUpdate } from '@/types';

const isTaxField = (key: string) => (TAX_FIELDS as readonly string[]).includes(key);

/**
 * Formularzustand eines Einstellungs-Abschnitts: bearbeiten, prüfen, nur eigene Felder speichern.
 * Das Formular zeigt die Steuer-Einstellungen des laufenden Jahres. Ändern sie sich, fragt Klaro „Ab wann gilt das?“
 * und legt dafür eine Jahres-Einstellung an (Tabelle tax_years) – vergangene Jahre rechnen unverändert weiter.
 */
export function useSettingsSection(section: SettingsSection) {
  const { profile, taxYears, refreshProfile } = useAuth();
  const currentYear = new Date().getFullYear();
  const current = useMemo(() => taxSettingsFor(profile!, taxYears, currentYear), [profile, taxYears, currentYear]);
  const saved = useMemo(() => profileToSettingsData({ ...profile!, ...current }), [profile, current]);
  const [data, setData] = useState<SettingsData>(saved);
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [start, setStart] = useState<TaxChangeStart | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = isSectionDirty(section, data, saved);

  // Neue Steuer-Einstellungen aus dem Formular (nur die Felder dieses Abschnitts, der Rest wie heuer)
  const patch = sectionPatch(section, data);
  const taxNext = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) if (isTaxField(key)) taxNext[key] = value;
  // Neue Selbständige haben keine Kleinstunternehmer-Ausnahme – das erzwungene „nein“ ist keine Änderung pro Jahr
  // (die Berechnung beachtet die Ausnahme nur bei Gewerbetreibenden)
  if (section === 'identity' && data.business_type !== 'gewerbetreibend') taxNext.svs_exempt = current.svs_exempt;
  const taxChanged = !sameTaxSettings(current, taxNext as TaxSettings);

  // Änderung wieder zurückgenommen → Auswahl „Ab wann“ vergessen, damit sie nicht unbemerkt vorausgewählt bleibt
  useEffect(() => {
    if (!taxChanged) setStart(null);
  }, [taxChanged]);

  // Neuer Profilstand (eigenes Speichern oder anderer Abschnitt): übernehmen, solange nichts ungespeichert ist
  // Nach eigenem Speichern immer übernehmen – bei „ab nächstem Jahr“ zeigt das Formular wieder die Werte von heuer
  const dataRef = useRef(data);
  dataRef.current = data;
  const resync = useRef(false);
  useEffect(() => {
    if (resync.current || !isSectionDirty(section, dataRef.current, saved)) setData(saved);
    resync.current = false;
  }, [section, saved]);

  const update = (next: Partial<SettingsData>) => {
    setData((d) => ({ ...d, ...next }));
    setErrors((e) => {
      const copy = { ...e };
      for (const key of Object.keys(next) as (keyof OnboardingData)[]) delete copy[key];
      return copy;
    });
  };

  const reset = () => {
    setData(saved);
    setErrors({});
    setStart(null);
  };

  async function save() {
    const found = validateSection(section, data);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('Bitte prüfe die markierten Felder.');
      return;
    }
    if (taxChanged && !start) {
      toast.error('Bitte wähle, ab wann die Änderung gilt.');
      document.getElementById(`${section}-tax-start`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setSaving(true);
    const plan = taxChanged && start ? planTaxChange(profile!, taxYears, current, taxNext as TaxSettings, start, currentYear) : null;
    const profilePatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) if (!isTaxField(key)) profilePatch[key] = value;
    if (plan?.profile) Object.assign(profilePatch, plan.profile);

    const failed = async () => {
      setSaving(false);
      toast.error('Speichern fehlgeschlagen. Bitte versuche es erneut.');
      await refreshProfile();
    };
    // Reihenfolge: Jahres-Einstellungen schreiben → Profil → überflüssige Zeilen löschen. Bricht es ab, zeigt das Formular
    // die Änderung noch als ungespeichert (Profil = Stand fürs laufende Jahr ohne eigene Zeile) und man kann es erneut versuchen;
    // wegfallende Zeilen gleichen dem Jahr davor, jedes Jahr rechnet also richtig.
    if (plan && plan.upsert.length > 0) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('tax_years')
        .upsert(plan.upsert.map((r) => ({ ...r, user_id: profile!.id, updated_at: now })), { onConflict: 'user_id,year' });
      if (error) return failed();
    }
    if (Object.keys(profilePatch).length > 0) {
      const { error } = await supabase.from('profiles').update(profilePatch as ProfileUpdate).eq('id', profile!.id);
      if (error) return failed();
    }
    if (plan && plan.remove.length > 0) {
      const { error } = await supabase.from('tax_years').delete().eq('user_id', profile!.id).in('year', plan.remove);
      if (error) return failed();
    }
    resync.current = true;
    await refreshProfile();
    setSaving(false);
    setStart(null);
    toast.success(start?.kind === 'from' && start.year > currentYear ? `Gespeichert – gilt ab ${start.year}` : 'Gespeichert');
  }

  return { section, data, saved, errors, update, reset, save, saving, dirty, taxChanged, start, setStart, currentYear };
}

export type SettingsSectionState = ReturnType<typeof useSettingsSection>;
