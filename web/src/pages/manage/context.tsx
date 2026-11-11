import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { roleCan, type Branch, type Company, type CompanySettings, type Court, type Permission, type StaffRole } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc, useQuery } from '@/lib/hooks';
import { useCompanyRole } from '@/lib/auth';
import { useSports } from '@/lib/master';

export type WithId<T> = T & { id: string };

interface CompanyCtx {
  companyId: string;
  company: WithId<Company>;
  settings: WithId<CompanySettings> | null;
  role: StaffRole | 'super';
  can: (p: Permission) => boolean;
  branches: WithId<Branch>[];
  courts: WithId<Court>[];
  sportName: (id: string) => string;
  courtName: (id: string) => string;
  branchName: (id: string) => string;
  /** Company is suspended or inactive: reads work, writes are refused by the server. */
  readOnly: boolean;
}

const Ctx = createContext<CompanyCtx | null>(null);

export function useCompany(): CompanyCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCompany outside CompanyProvider');
  return c;
}

export function useCompanyData(companyId: string) {
  const role = useCompanyRole(companyId);
  const company = useDoc<Company>(role ? doc(db, 'companies', companyId) : null, `mc-${companyId}-${!!role}`);
  const settings = useDoc<CompanySettings>(role ? doc(db, 'companies', companyId, 'settings', 'general') : null, `ms-${companyId}-${!!role}`);
  const branches = useQuery<Branch>(role ? query(collection(db, 'companies', companyId, 'branches'), orderBy('name')) : null, `mb-${companyId}-${!!role}`);
  const courts = useQuery<Court>(role ? query(collection(db, 'companies', companyId, 'courts'), orderBy('name')) : null, `mcourts-${companyId}-${!!role}`);
  const sports = useSports();
  const value = useMemo<CompanyCtx | null>(() => {
    if (!role || !company.data) return null;
    const by = <T extends { id: string; name: string }>(rows: T[]) => {
      const m = new Map(rows.map((r) => [r.id, r.name]));
      return (id: string) => m.get(id) ?? id;
    };
    return {
      companyId,
      company: company.data,
      settings: settings.data,
      role,
      can: (p) => role === 'super' || roleCan(role, p),
      branches: branches.data,
      courts: courts.data,
      sportName: by(sports.data),
      courtName: by(courts.data),
      branchName: by(branches.data),
      readOnly: company.data.status !== 'active',
    };
  }, [role, company.data, settings.data, branches.data, courts.data, sports.data, companyId]);
  return { role, value, loading: company.loading || settings.loading, error: company.error };
}

export function CompanyProvider({ value, children }: { value: CompanyCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
