import { BOOKING_STATUS_LABELS, type BookingStatus, type CompanyStatus, type PaymentStatus, type VerificationStatus, type SubscriptionStatus } from '@courtsync/shared';
import { Badge, type BadgeTone } from './ui';

const bookingTones: Record<BookingStatus, BadgeTone> = {
  pendingApproval: 'amber',
  approved: 'brand',
  rejected: 'red',
  paymentPending: 'amber',
  confirmed: 'green',
  checkedIn: 'purple',
  checkedOut: 'slate',
  completed: 'slate',
  cancelled: 'red',
  noShow: 'red',
  expired: 'slate',
};

/** Colours used in calendars, kept in sync with the badges. */
export const bookingCellClass: Record<BookingStatus, string> = {
  pendingApproval: 'bg-amber-100 border-amber-300 text-amber-900',
  approved: 'bg-brand-100 border-brand-300 text-brand-900',
  rejected: 'bg-red-50 border-red-200 text-red-800 line-through',
  paymentPending: 'bg-amber-50 border-amber-300 text-amber-900 border-dashed',
  confirmed: 'bg-court-100 border-court-500/50 text-court-700',
  checkedIn: 'bg-violet-100 border-violet-300 text-violet-900',
  checkedOut: 'bg-slate-100 border-slate-300 text-slate-700',
  completed: 'bg-slate-100 border-slate-300 text-slate-700',
  cancelled: 'bg-red-50 border-red-200 text-red-800 line-through',
  noShow: 'bg-red-50 border-red-200 text-red-800',
  expired: 'bg-slate-50 border-slate-200 text-slate-500 line-through',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={bookingTones[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const t: Record<CompanyStatus, BadgeTone> = { active: 'green', inactive: 'slate', suspended: 'amber', disabled: 'red' };
  const l: Record<CompanyStatus, string> = { active: 'Active', inactive: 'Inactive', suspended: 'Suspended', disabled: 'Disabled' };
  return <Badge tone={t[status]}>{l[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t: Record<PaymentStatus, BadgeTone> = { unpaid: 'amber', partiallyPaid: 'brand', paid: 'green', refunded: 'slate', partiallyRefunded: 'slate' };
  const l: Record<PaymentStatus, string> = { unpaid: 'Unpaid', partiallyPaid: 'Part paid', paid: 'Paid', refunded: 'Refunded', partiallyRefunded: 'Part refunded' };
  return <Badge tone={t[status]}>{l[status]}</Badge>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const t: Record<VerificationStatus, BadgeTone> = { notSubmitted: 'slate', pending: 'amber', verified: 'green', rejected: 'red', expired: 'slate' };
  const l: Record<VerificationStatus, string> = { notSubmitted: 'Not submitted', pending: 'Pending review', verified: 'Verified', rejected: 'Rejected', expired: 'Expired' };
  return <Badge tone={t[status]}>{l[status]}</Badge>;
}

export function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  const t: Record<SubscriptionStatus, BadgeTone> = { pendingPayment: 'amber', active: 'green', expired: 'slate', cancelled: 'red' };
  const l: Record<SubscriptionStatus, string> = { pendingPayment: 'Awaiting payment', active: 'Active', expired: 'Expired', cancelled: 'Cancelled' };
  return <Badge tone={t[status]}>{l[status]}</Badge>;
}

export function ActiveBadge({ active, labels = ['Active', 'Inactive'] }: { active: boolean; labels?: [string, string] }) {
  return <Badge tone={active ? 'green' : 'slate'}>{active ? labels[0] : labels[1]}</Badge>;
}
