import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { ProfileUpdate } from '@/types';

/** Einzelne Profilfelder speichern (z. B. Vorauszahlung, Umsatz-Schätzung) und das Profil neu laden. */
export function useProfilePatch() {
  const { profile, refreshProfile } = useAuth();
  return useCallback(
    async (patch: ProfileUpdate, success: string): Promise<boolean> => {
      if (!profile) return false;
      const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
      if (error) {
        toast.error('Speichern fehlgeschlagen. Bitte versuche es erneut.');
        return false;
      }
      await refreshProfile();
      toast.success(success);
      return true;
    },
    [profile, refreshProfile],
  );
}
