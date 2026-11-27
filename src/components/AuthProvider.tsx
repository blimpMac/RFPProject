import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Role } from '../types';

type StaffIdentity = { fullName: string; email: string };
type MeResponse = {
  ok: true;
  user: { email?: string | null };
  roles: Role[];
  profile?: { fullName?: string | null } | null;
};
type AuthValue = {
  session: Session | null;
  roles: Role[];
  identity: StaffIdentity | null;
  loading: boolean;
  loadError: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  roles: [],
  identity: null,
  loading: true,
  loadError: false,
  refresh: async () => {},
});

function getIdentity(me: MeResponse, session: Session): StaffIdentity {
  const email = me.user.email || session.user.email || '';
  const metadataName = session.user.user_metadata.full_name || session.user.user_metadata.name;
  const fullName =
    me.profile?.fullName?.trim() ||
    String(metadataName || '').trim() ||
    email.split('@')[0] ||
    'Staff account';

  return { fullName, email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Invalidate any in-flight /api/me response when the session changes,
  // particularly when a user signs out before a previous request finishes.
  const sessionVersion = useRef(0);

  const clearSession = useCallback(() => {
    setSession(null);
    setRoles([]);
    setIdentity(null);
    setLoadError(false);
    setLoading(false);
  }, []);

  const loadStaff = useCallback(async (currentSession: Session, version: number) => {
    try {
      // Use the session already supplied by Supabase instead of acquiring its auth
      // lock again while initialization is in progress.
      const response = await fetch('/api/me', {
        headers: { authorization: `Bearer ${currentSession.access_token}` },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Unable to load staff permissions.');
      const me = (await response.json()) as MeResponse;
      if (!me.ok) throw new Error('Unable to load staff permissions.');
      if (version !== sessionVersion.current) return;
      setRoles(me.roles);
      setLoadError(false);
      setIdentity(getIdentity(me, currentSession));
    } catch {
      if (version !== sessionVersion.current) return;
      setRoles([]);
      setIdentity(null);
      setLoadError(true);
    } finally {
      if (version === sessionVersion.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const version = ++sessionVersion.current;
    const { data, error } = await supabase.auth.getSession();
    if (version !== sessionVersion.current) return;

    if (error || !data.session) {
      clearSession();
      return;
    }

    setSession(data.session);
    setLoadError(false);
    setLoading(true);
    await loadStaff(data.session, version);
  }, [clearSession, loadStaff]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Supabase emits TOKEN_REFRESHED when a backgrounded tab becomes active.
      // Keep the current staff identity and page state; only replace the token.
      // Treating this as a new login caused the whole admin shell to show loading.
      if (event === 'TOKEN_REFRESHED' && nextSession) {
        setSession(nextSession);
        return;
      }

      const version = ++sessionVersion.current;
      if (!nextSession) {
        // Clear immediately so protected pages cannot keep displaying stale data.
        clearSession();
        return;
      }

      setSession(nextSession);
      setLoadError(false);
      setRoles([]);
      setIdentity(null);
      setLoading(true);

      // Do not call Supabase auth APIs (including getSession via /api/me)
      // inside onAuthStateChange: the auth lock can deadlock on sign-out.
      window.setTimeout(() => {
        if (version !== sessionVersion.current) return;
        void loadStaff(nextSession, version);
      }, 0);
    });

    return () => {
      sessionVersion.current += 1;
      data.subscription.unsubscribe();
    };
  }, [clearSession, loadStaff]);

  return (
    <AuthContext.Provider value={{ session, roles, identity, loading, loadError, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
