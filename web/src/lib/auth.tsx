import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { StaffRole, UserProfile } from '@courtsync/shared';
import { auth, db } from './firebase';
import { call } from './api';

export interface StaffMembership {
  companyId: string;
  companyName: string;
  companyStatus: string;
  role: StaffRole;
}

interface Session {
  user: User | null;
  profile: (UserProfile & { id: string }) | null;
  superAdmin: boolean;
  staffOf: StaffMembership[];
  mustChangePassword: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

interface EnsureResult {
  superAdmin: boolean;
  staffOf: StaffMembership[];
  mustChangePassword: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Session['profile']>(null);
  const [info, setInfo] = useState<EnsureResult>({ superAdmin: false, staffOf: [], mustChangePassword: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (u: User) => {
    try {
      // Always fetch a fresh token so a newly granted Super Admin claim shows up at sign-in.
      const token = await u.getIdTokenResult(true);
      const res = await call<EnsureResult>('ensureProfile', {});
      setInfo({ ...res, superAdmin: token.claims.superAdmin === true });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsubProfile?.();
      unsubProfile = null;
      setUser(u);
      if (!u) {
        setProfile(null);
        setInfo({ superAdmin: false, staffOf: [], mustChangePassword: false });
        setLoading(false);
        return;
      }
      setLoading(true);
      await load(u);
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => setProfile(snap.exists() ? ({ ...(snap.data() as UserProfile), id: snap.id }) : null),
        () => setProfile(null),
      );
      setLoading(false);
    });
    return () => {
      unsub();
      unsubProfile?.();
    };
  }, [load]);

  const value = useMemo<Session>(
    () => ({
      user,
      profile,
      superAdmin: info.superAdmin,
      staffOf: info.staffOf,
      mustChangePassword: profile?.mustChangePassword ?? info.mustChangePassword,
      loading,
      error,
      refresh: async () => {
        if (auth.currentUser) await load(auth.currentUser);
      },
      signOut: async () => {
        await fbSignOut(auth);
      },
    }),
    [user, profile, info, loading, error, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside AuthProvider');
  return s;
}

/** Role of the signed-in user in a company, or "super" for platform admins. */
export function useCompanyRole(companyId: string | undefined): StaffRole | 'super' | null {
  const { superAdmin, staffOf } = useSession();
  if (!companyId) return null;
  const m = staffOf.find((s) => s.companyId === companyId);
  if (m) return m.role;
  return superAdmin ? 'super' : null;
}
