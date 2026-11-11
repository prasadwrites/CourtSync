import { collectionGroup, limit, orderBy, query, where } from 'firebase/firestore';
import type { Booking, CompanyCustomer, Subscription } from '@courtsync/shared';
import { db } from './firebase';
import { useQuery } from './hooks';

/** Companies the signed-in customer has joined, with their credit balance at each. */
export function useMyCompanies(uid: string | undefined) {
  return useQuery<CompanyCustomer>(uid ? query(collectionGroup(db, 'customers'), where('uid', '==', uid), limit(200)) : null, `my-companies-${uid}`);
}

export function useMyBookings(uid: string | undefined, max = 200) {
  return useQuery<Booking>(uid ? query(collectionGroup(db, 'bookings'), where('customerUid', '==', uid), orderBy('startAt', 'desc'), limit(max)) : null, `my-bookings-${uid}-${max}`);
}

export function useMySubscriptions(uid: string | undefined) {
  return useQuery<Subscription>(uid ? query(collectionGroup(db, 'subscriptions'), where('customerUid', '==', uid), orderBy('createdAt', 'desc'), limit(100)) : null, `my-subs-${uid}`);
}

/** Booking ids are unique per company only, so the list key combines both. */
export const bookingKey = (b: { companyId: string; id: string }) => `${b.companyId}/${b.id}`;
