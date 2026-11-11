import type { BookingModel, Court, CourtStatus } from '@courtsync/shared';
import type { AvailSlot } from '@/components/SlotPicker';
import { call } from './api';

export interface Availability {
  company: { id: string; name: string; logoUrl: string | null; currency: string; city: string };
  court: {
    id: string;
    name: string;
    sportName: string;
    description: string;
    photoUrls: string[];
    environment: 'indoor' | 'outdoor';
    bookingModel: BookingModel;
    timezone: string;
    slotIntervalMinutes: number;
    minDurationMinutes: number;
    maxDurationMinutes: number;
    maxParticipants: number;
    capacity: number;
    pricing: Court['pricing'] | null;
    amenities: string[];
    equipment: string[];
    cancellationPolicy: string;
    status: CourtStatus;
  };
  rules: { requireApproval: boolean; requirePrepayment: boolean; cancellationDeadlineHours: number; refundPolicy: string };
  days: { date: string; slots: AvailSlot[] }[];
}

export function getAvailability(companyId: string, courtId: string, startDate: string, endDate = startDate) {
  return call<Availability>('getAvailability', { companyId, courtId, startDate, endDate });
}

export interface CreateBookingResult {
  bookingId: string;
  status: string;
  pricing: { total: number; currency: string; subtotal: number; creditsApplied: number };
}

export interface StartPaymentResult {
  paymentId: string;
  amount: number;
  currency: string;
  provider: string;
  checkout: Record<string, unknown>;
}

/** Units a booking consumes: participants on shared courts, otherwise the whole court. */
export function unitsFor(model: BookingModel, participants: number): number {
  return model === 'shared' ? participants : 1;
}
