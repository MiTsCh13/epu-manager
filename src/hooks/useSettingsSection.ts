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
import type { OnboardingData, OnboardingErrors } from '@/lib/validation';

/** Formularzustand eines Einstellungs-Abschnitts: bearbeiten, prüfen, nur eigene Felder speichern. */
export function useSettingsSection(section: SettingsSection) {
  const { profile, refreshProfile } = useAuth();
  const saved = useMemo(() => profileToSettingsData(profile!), [profile]);
  const [data, setData] = useState<SettingsData>(saved);
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [saving, setSaving] = useState(false);
  const dirty = isSectionDirty(section, data, saved);

  // Neuer Profilstand (eigenes Speichern oder anderer Abschnitt): übernehmen, solange nichts ungespeichert ist
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (!isSectionDirty(section, dataRef.current, saved)) setData(saved);
  }, [section, saved]);

  const update = (patch: Partial<SettingsData>) => {
    setData((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch) as (keyof OnboardingData)[]) delete next[key];
      return next;
    });
  };

  const reset = () => {
    setData(saved);
    setErrors({});
  };

  async function save() {
    const found = validateSection(section, data);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('Bitte prüfe die markierten Felder.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update(sectionPatch(section, data)).eq('id', profile!.id);
    if (error) {
      setSaving(false);
      toast.error('Speichern fehlgeschlagen. Bitte versuche es erneut.');
      return;
    }
    await refreshProfile();
    setSaving(false);
    toast.success('Gespeichert');
  }

  return { data, saved, errors, update, reset, save, saving, dirty };
}

export type SettingsSectionState = ReturnType<typeof useSettingsSection>;
