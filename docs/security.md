# Security

How CourtSync handles the sensitive parts of the spec.

## Passwords and accounts

- Passwords are handled only by Firebase Authentication. CourtSync never receives, stores or logs them, and no screen or API can show one, including to a Super Admin.
- Support actions are limited to sending a reset email, generating a one-time reset link (`sendPasswordReset`), forcing a reset on next sign-in (`forcePasswordReset`), and disabling an account. Each is audited.
- Company admins cannot reset a customer's password; only the platform can.
- Super Admin is a custom claim granted by the bootstrap script or by another Super Admin, and every grant or revoke is audited.

## Data isolation

- All company data lives under `companies/{cid}`. Firestore and Storage rules check the caller's `staff/{uid}` role in that company, or that the document belongs to the caller as a customer.
- Business writes (bookings, payments, credits, memberships, staff, verification) are denied to clients by the rules and go through callables that re-check the role and validate input.
- A suspended or closed company becomes read-only for staff and stops taking bookings.
- `tests/emulator/rules.test.ts` covers cross-tenant reads and writes, and customer access to other customers' data.

## Payments

- CourtSync never sees or stores card numbers, CVVs or wallet credentials. Customers pay in the gateway's hosted UI (Stripe Payment Element, Razorpay Checkout).
- Only a webhook with a valid provider signature can mark an online payment as paid. The amount and currency are compared with the payment document before confirming. The browser's success callback only waits for that to happen.
- Gateway secrets live in Secret Manager. Only public keys are in env files.
- The sandbox provider is available only on the emulator, or when both `ALLOW_SANDBOX_PAYMENTS=true` and the `sandboxPayments` flag are on.

## Identity documents

- ID numbers are encrypted with AES-256-GCM using `ID_ENCRYPTION_KEY` from Secret Manager, with the company and customer bound in as associated data so a ciphertext can't be moved to another record.
- Staff see only a masked value. Revealing the full number needs the `verification.reveal` permission and a written reason, and is audited.
- Document images are stored under `companies/{cid}/verifications/{uid}/`, readable only by the customer and the company's staff.
- No ID type is mandatory by default. US SSN is seeded but disabled, and Aadhaar and Emirates ID are marked highly sensitive. Companies choose which types they accept and whether one is required, and customers give explicit consent.

## Abuse and app integrity

- App Check can be enforced on every callable (`ENFORCE_APP_CHECK=true`).
- Every callable is rate limited per caller, with tighter limits on sensitive ones such as password resets, bookings and verification.
- CSV exports neutralise spreadsheet formulas so exported data can't run code in Excel.
- Hosting sends strict security headers (HSTS, no framing, nosniff, a restrictive permissions policy).

## Audit

Every change to companies, settings, staff, courts, blocks, bookings, payments, credits, memberships and verification is recorded in `auditLogs` with actor, time and a before/after diff. The Super Admin can filter and export it, and each company sees its own activity.
