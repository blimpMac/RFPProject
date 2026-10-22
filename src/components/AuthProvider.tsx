import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);

    if (!data.session) {
      setRoles([]);
      setIdentity(null);
      setLoading(false);
      return;
    }

    try {
      const me = await get<MeResponse>('me');
      setRoles(me.roles);
      setIdentity(getIdentity(me, data.session));
    } catch {
      setRoles([]);
      setIdentity(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, roles, identity, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
