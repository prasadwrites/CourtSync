/**
 * Starting master data for CourtSync. None of this is hardcoded in the app: Super Admins
 * edit, extend or disable every entry from the administration screens after seeding.
 */
import type { Country, IdentificationType, PaymentMethod, Sport } from '../shared/src/types';

type IdField = { enabled: boolean; required: boolean };
const on = (required = false): IdField => ({ enabled: true, required });
const off: IdField = { enabled: false, required: false };

export const paymentMethods: Record<string, PaymentMethod> = {
  razorpay_upi: { name: 'UPI', provider: 'razorpay', kind: 'online', enabled: true, description: 'Google Pay, PhonePe, Paytm and any UPI app' },
  razorpay_card: { name: 'Cards and netbanking', provider: 'razorpay', kind: 'online', enabled: true, description: 'Debit cards, credit cards, netbanking and wallets' },
  stripe_card: { name: 'Card', provider: 'stripe', kind: 'online', enabled: true, description: 'Debit and credit cards' },
  stripe_wallets: { name: 'Apple Pay or Google Pay', provider: 'stripe', kind: 'online', enabled: true, description: 'Shown when the device supports it' },
  cash: { name: 'Cash at the venue', provider: 'offline', kind: 'offline', enabled: true },
  card_terminal: { name: 'Card at the venue', provider: 'offline', kind: 'offline', enabled: true },
  sandbox: { name: 'Test payment', provider: 'sandbox', kind: 'online', enabled: true, description: 'Development and staging only' },
};

export const countries: Country[] = [
  {
    code: 'IN', name: 'India', dialCode: '+91', currency: 'INR', currencySymbol: '₹',
    paymentMethodIds: ['razorpay_upi', 'razorpay_card', 'cash', 'card_terminal', 'sandbox'],
    timezones: ['Asia/Kolkata'],
    businessVerification: [{ label: 'GST certificate', required: false }, { label: 'Shop and establishment licence', required: false }, { label: 'PAN of the business', required: true }],
    enabled: true,
  },
  {
    code: 'US', name: 'United States', dialCode: '+1', currency: 'USD', currencySymbol: '$',
    paymentMethodIds: ['stripe_card', 'stripe_wallets', 'cash', 'card_terminal', 'sandbox'],
    timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'],
    businessVerification: [{ label: 'Employer Identification Number (EIN)', required: true }, { label: 'State business registration', required: false }],
    enabled: true,
  },
  {
    code: 'AE', name: 'United Arab Emirates', dialCode: '+971', currency: 'AED', currencySymbol: 'AED',
    paymentMethodIds: ['stripe_card', 'stripe_wallets', 'cash', 'card_terminal', 'sandbox'],
    timezones: ['Asia/Dubai'],
    businessVerification: [{ label: 'Trade licence', required: true }, { label: 'VAT registration (TRN)', required: false }],
    enabled: true,
  },
  {
    code: 'GB', name: 'United Kingdom', dialCode: '+44', currency: 'GBP', currencySymbol: '£',
    paymentMethodIds: ['stripe_card', 'stripe_wallets', 'cash', 'card_terminal', 'sandbox'],
    timezones: ['Europe/London'],
    businessVerification: [{ label: 'Companies House number', required: false }, { label: 'VAT number', required: false }],
    enabled: true,
  },
];

export const sports: Record<string, Sport> = {
  badminton: { name: 'Badminton', icon: '🏸', defaultBookingModel: 'exclusive', enabled: true },
  tennis: { name: 'Tennis', icon: '🎾', defaultBookingModel: 'exclusive', enabled: true },
  pickleball: { name: 'Pickleball', icon: '🏓', defaultBookingModel: 'exclusive', enabled: true },
  padel: { name: 'Padel', icon: '🎾', defaultBookingModel: 'exclusive', enabled: true },
  squash: { name: 'Squash', icon: '🟢', defaultBookingModel: 'exclusive', enabled: true },
  table_tennis: { name: 'Table tennis', icon: '🏓', defaultBookingModel: 'exclusive', enabled: true },
  basketball: { name: 'Basketball', icon: '🏀', defaultBookingModel: 'exclusive', enabled: true },
  volleyball: { name: 'Volleyball', icon: '🏐', defaultBookingModel: 'exclusive', enabled: true },
  football: { name: 'Football', description: '5-a-side and 7-a-side turf', icon: '⚽', defaultBookingModel: 'exclusive', enabled: true },
  cricket: { name: 'Cricket', description: 'Nets and turf', icon: '🏏', defaultBookingModel: 'exclusive', enabled: true },
  swimming: { name: 'Swimming', description: 'Lane or pool sessions', icon: '🏊', defaultBookingModel: 'shared', enabled: true },
  gym: { name: 'Gym', icon: '🏋️', defaultBookingModel: 'shared', enabled: true },
  yoga: { name: 'Yoga', icon: '🧘', defaultBookingModel: 'session', enabled: true },
};

const idType = (t: Partial<IdentificationType> & Pick<IdentificationType, 'name' | 'countryCode'>): IdentificationType => ({
  appliesTo: { company: false, customer: true },
  mandatoryFor: { company: false, customer: false },
  fields: { number: { ...on(true) }, image: on(), expiryDate: off, issuingRegion: off },
  highlySensitive: false,
  enabled: true,
  ...t,
});

/** Nothing is mandatory by default. National identifiers are marked highly sensitive. */
export const identificationTypes: Record<string, IdentificationType> = {
  in_aadhaar: idType({ name: 'Aadhaar', countryCode: 'IN', highlySensitive: true, fields: { number: { ...on(true), pattern: '^[0-9]{12}$', hint: '12 digits, no spaces' }, image: on(), expiryDate: off, issuingRegion: off } }),
  in_pan: idType({ name: 'PAN card', countryCode: 'IN', appliesTo: { company: true, customer: true }, fields: { number: { ...on(true), pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', hint: 'e.g. ABCDE1234F' }, image: on(), expiryDate: off, issuingRegion: off } }),
  in_driving_licence: idType({ name: 'Driving licence', countryCode: 'IN', fields: { number: on(true), image: on(), expiryDate: on(), issuingRegion: on() } }),
  in_passport: idType({ name: 'Passport', countryCode: 'IN', fields: { number: { ...on(true), pattern: '^[A-Z][0-9]{7}$', hint: 'One letter and 7 digits' }, image: on(), expiryDate: on(true), issuingRegion: off } }),
  in_voter_id: idType({ name: 'Voter ID (EPIC)', countryCode: 'IN' }),
  us_driver_license: idType({ name: "Driver's license", countryCode: 'US', fields: { number: on(true), image: on(), expiryDate: on(true), issuingRegion: on(true) } }),
  us_state_id: idType({ name: 'State ID card', countryCode: 'US', fields: { number: on(true), image: on(), expiryDate: on(true), issuingRegion: on(true) } }),
  us_passport: idType({ name: 'Passport', countryCode: 'US', fields: { number: on(true), image: on(), expiryDate: on(true), issuingRegion: off } }),
  // Disabled by default: venues rarely need it and it carries the highest risk.
  us_ssn: idType({ name: 'Social Security number', countryCode: 'US', highlySensitive: true, enabled: false, fields: { number: { ...on(true), pattern: '^[0-9]{3}-?[0-9]{2}-?[0-9]{4}$', hint: 'e.g. 123-45-6789' }, image: off, expiryDate: off, issuingRegion: off } }),
  ae_emirates_id: idType({ name: 'Emirates ID', countryCode: 'AE', highlySensitive: true, fields: { number: { ...on(true), pattern: '^784-?[0-9]{4}-?[0-9]{7}-?[0-9]$', hint: '784-XXXX-XXXXXXX-X' }, image: on(), expiryDate: on(true), issuingRegion: off } }),
  ae_passport: idType({ name: 'Passport', countryCode: 'AE', fields: { number: on(true), image: on(), expiryDate: on(true), issuingRegion: off } }),
  gb_driving_licence: idType({ name: 'Driving licence', countryCode: 'GB', fields: { number: on(true), image: on(), expiryDate: on(), issuingRegion: off } }),
  gb_passport: idType({ name: 'Passport', countryCode: 'GB', fields: { number: on(true), image: on(), expiryDate: on(true), issuingRegion: off } }),
};
