import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { resetAutoBooking } from '@/lib/recurringSync';
import { supabase } from '@/lib/supabase';
import { profileForYear } from '@/lib/taxYears';
import type { Profile, TaxYear } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Steuer-Einstellungen pro Jahr (gelten ab ihrem Jahr) */
  taxYears: TaxYear[];
  /** Profil mit den Steuer-Einstellungen eines Kalenderjahres (Kleinunternehmer, Gewinnermittlung, …) */
  profileFor: (year: number) => Profile | null;
  /** true, solange Session oder Profil initial geladen werden */
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [taxYears, setTaxYears] = useState<TaxYear[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    // Kein await im Callback (Supabase-Empfehlung) – Profil wird separat per Effekt geladen
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Anderes Konto → wiederkehrende Ausgaben dieses Kontos neu prüfen
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') resetAutoBooking();
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true);
    setProfileError(null);
    const [{ data, error }, years] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('tax_years').select('*').eq('user_id', id).order('year'),
    ]);
    if (error || years.error) {
      setProfileError('Dein Profil konnte nicht geladen werden.');
      setProfile(null);
      setTaxYears([]);
    } else {
      setTaxYears(years.data);
      setProfile(data);
    }
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (userId) void loadProfile(userId);
    else {
      setProfile(null);
      setTaxYears([]);
    }
  }, [userId, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Blockierend ist nur das erste Laden: bis das Profil zur aktuellen Session passt.
  // Ein refreshProfile() lässt die Seite stehen (sonst würden Formulare ihren Zustand verlieren).
  const loading =
    sessionLoading || (!!userId && profile?.id !== userId && !profileError) || (profileLoading && !profile);

  const profileFor = useCallback((year: number) => (profile ? profileForYear(profile, taxYears, year) : null), [profile, taxYears]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, profile, taxYears, profileFor, loading, profileError, refreshProfile, signOut }),
    [session, profile, taxYears, profileFor, loading, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden');
  return ctx;
}

/** Profil mit den Steuer-Einstellungen eines Jahres – stabil, solange sich Profil und Jahres-Einstellungen nicht ändern. */
export function useProfileFor(year: number): Profile | null {
  const { profileFor } = useAuth();
  return useMemo(() => profileFor(year), [profileFor, year]);
}
