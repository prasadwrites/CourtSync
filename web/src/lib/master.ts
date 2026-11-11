import { collection, doc, orderBy, query } from 'firebase/firestore';
import type { Country, IdentificationType, PaymentMethod, PlatformSettings, Sport } from '@courtsync/shared';
import { FEATURE_FLAGS, type FeatureFlag } from '@courtsync/shared';
import { db } from './firebase';
import { useDoc, useQuery } from './hooks';

export const useCountries = () => useQuery<Country>(query(collection(db, 'countries'), orderBy('name')), 'countries');
export const useSports = () => useQuery<Sport>(query(collection(db, 'sports'), orderBy('name')), 'sports');
export const usePaymentMethods = () => useQuery<PaymentMethod>(query(collection(db, 'paymentMethods'), orderBy('name')), 'paymentMethods');
export const useIdTypes = (enabled = true) => useQuery<IdentificationType>(enabled ? query(collection(db, 'identificationTypes'), orderBy('countryCode'), orderBy('name')) : null, `idTypes-${enabled}`);

export function useFeatures(): Record<FeatureFlag, boolean> {
  const { data } = useDoc<PlatformSettings>(doc(db, 'platformSettings/general'), 'platformSettings');
  const out = {} as Record<FeatureFlag, boolean>;
  for (const [k, v] of Object.entries(FEATURE_FLAGS)) out[k as FeatureFlag] = data?.features?.[k] ?? v.default;
  return out;
}

export function nameMap<T extends { id: string; name: string }>(rows: T[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Common IANA time zones for pickers; countries configure their own list. */
export const COMMON_TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Berlin', 'America/New_York',
  'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'UTC',
];
