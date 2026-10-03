import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    // Kein await im Callback (Supabase-Empfehlung) – Profil wird separat per Effekt geladen
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true);
    setProfileError(null);
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (error) {
      setProfileError('Dein Profil konnte nicht geladen werden.');
      setProfile(null);
    } else {
      setProfile(data);
    }
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (userId) void loadProfile(userId);
    else setProfile(null);
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

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, profile, loading, profileError, refreshProfile, signOut }),
    [session, profile, loading, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden');
  return ctx;
}
