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
import { get } from '../lib/api';
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
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  roles: [],
  identity: null,
  loading: true,
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
  // Invalidate any in-flight /api/me response when the session changes,
  // particularly when a user signs out before a previous request finishes.
  const sessionVersion = useRef(0);

  const clearSession = useCallback(() => {
    setSession(null);
    setRoles([]);
    setIdentity(null);
    setLoading(false);
  }, []);

  const loadStaff = useCallback(async (currentSession: Session, version: number) => {
    try {
      const me = await get<MeResponse>('me');
      if (version !== sessionVersion.current) return;
      setRoles(me.roles);
      setIdentity(getIdentity(me, currentSession));
    } catch {
      if (version !== sessionVersion.current) return;
      setRoles([]);
      setIdentity(null);
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
    setLoading(true);
    await loadStaff(data.session, version);
  }, [clearSession, loadStaff]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const version = ++sessionVersion.current;
      if (!nextSession) {
        // Clear immediately so protected pages cannot keep displaying stale data.
        clearSession();
        return;
      }

      setSession(nextSession);
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
    <AuthContext.Provider value={{ session, roles, identity, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
