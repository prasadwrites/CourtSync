# Architecture

## Overview

```
 web (React PWA) ──► Firebase Auth
        │
        ├──► Firestore (reads, plus simple writes that rules allow)
        ├──► Cloud Functions callables (every write with business rules)
        └──► Storage (court photos, verification documents)

 Payment gateway ──► Hosting /api/webhooks/{provider} ──► paymentWebhook function
 Scheduled jobs: sweepExpiredHolds (5 min), sendReminders (hourly), dailyMaintenance (02:00 UTC)
 Firestore triggers: audit log, daily stats, notifications
```

The client never decides money, availability or status. Anything that touches bookings, payments, credits, memberships, staff, customers or verification goes through a callable that checks the caller's role, validates input with the shared zod schemas, and writes inside a transaction. Firestore rules deny those writes from the client.

## Tenancy

Every company is a document `companies/{cid}`, and everything it owns lives in subcollections under it, so data isolation follows the path:

- `private/*`: sensitive company settings, visible only to company admins.
- `settings/*`: booking, payment, credit, verification, notification and registration settings.
- `staff/{uid}`: the caller's role in this company (`owner`, `admin`, `manager`, `frontDesk`). Rules and functions read it on each request, so a role change takes effect immediately.
- `branches`, `courts` (with `slotLocks`), `blockedSlots`, `services`.
- `customers/{uid}`: the company's view of a customer (status, tags, notes, credit balance).
- `bookings`, `payments`, `creditTransactions`, `creditLots`, `subscriptions`, `verifications` (with an admin-only `secure` subdocument), `notifications`, `stats`.

Platform-level collections hold master data (`countries`, `sports`, `identificationTypes`, `paymentMethods`), `platformSettings`, `auditLogs`, and `users/{uid}`.

A customer has one Firebase account and one `users/{uid}` profile, and joins companies as needed. Their portal uses collection-group queries filtered by `customerUid` to list bookings and memberships across every company.

**Super Admin** is a custom auth claim (`superAdmin: true`), granted only by `scripts/bootstrap-super-admin.ts` or by another Super Admin through `setSuperAdmin`.

## Permissions

`shared/src/permissions.ts` maps each staff role to a list of permissions such as `bookings.manage` or `verification.reveal`. Cloud Functions check permissions with `roleCan`, `firestore.rules` mirrors the same role lists, and the web app hides navigation and actions that the role can't use.

## Booking engine

The engine in `shared/src/availability.ts` and `pricing.ts` is a set of pure functions, unit tested and used both by the server and to render calendars:

- A court has weekly opening hours, a slot model (fixed grid or fixed sessions), allowed durations, capacity (1 for exclusive courts, more for shared courts such as pools), and peak pricing windows.
- `computeSlots` combines hours, blocks (one-off or recurring, court- or branch-wide) and existing holds into bookable slots.
- `checkBookingRequest` validates lead time, horizon, duration, and per-customer limits.

**No double booking.** Each grid cell of a court has a lock document `courts/{courtId}/slotLocks/{date_startMin}` holding a map of booking ids to units. `createBooking` runs a Firestore transaction that reads every cell the booking covers, sums the units held, and fails if capacity would be exceeded. Two concurrent requests for the same slot therefore cannot both commit. Unpaid holds carry an expiry, and `sweepExpiredHolds` releases them.

**Statuses.** A new booking becomes `confirmed`, `pendingApproval` (when the court or company requires approval), or `paymentPending` (when prepayment is required). It then moves through `checkedIn` and `completed`, or ends as `cancelled`, `rejected`, `noShow` or `expired`.

**Check-in** uses a QR code (`courtsync:{companyId}:{token}`) or a 6-digit code, looked up by `lookupCheckIn` and applied by `checkInOut`. Early or late check-in needs an override reason, which is audited.

## Payments

`functions/src/payments/providers/` contains one adapter per gateway (`stripe`, `razorpay`, and `sandbox` for development), behind a common interface: create a checkout, parse and verify a webhook, and refund. Master data payment methods name the provider they use, and companies choose which methods they accept.

1. The client calls `startPayment`, which creates a `payments` document (`pending`) and returns a provider checkout payload.
2. The customer pays in the gateway's own UI (Stripe Payment Element, Razorpay Checkout). Card data never touches CourtSync.
3. The gateway calls `POST /api/webhooks/{provider}`. The adapter verifies the signature, the function checks the amount and currency against the payment document, and only then marks it `paid` and confirms the booking.

Offline payments (cash, card terminal) are recorded by staff with `recordOfflinePayment`. Refunds go back through the provider adapter, or are settled manually for offline methods.

## Credits and memberships

Credits are a company-scoped ledger: `creditTransactions` is append-only, and `creditLots` track expiry so the oldest credits are spent first. The balance on `customers/{uid}` is updated in the same transaction as each ledger entry.

Services (`services`) describe memberships, packages and classes. `subscriptions` track a customer's enrolment, sessions used, renewals and attendance.

## ID verification

Customers upload a document image to Storage and submit the ID number through `submitVerification`. The number is encrypted with AES-256-GCM (`functions/src/lib/crypto.ts`) and stored in `verifications/{uid}/secure`, while the readable document only holds a masked value. Staff with `verification.reveal` can call `revealIdNumber`, which requires a reason and writes an audit entry. Which ID types are accepted, and whether any is mandatory, is configured per country and per company; none is mandatory by default.

## Notifications

`functions/src/notifications/` sends in-app notifications (Firestore), email (SendGrid), SMS (Twilio) and web push (FCM), each behind a channel adapter. A channel without credentials is skipped. Customers control push on their profile; companies choose which events notify.

## Reports

Firestore triggers maintain daily stats documents `companies/{cid}/stats/day_YYYY-MM-DD` with counters by court, sport, hour, payment method and customer. Company reports read a date range of these documents; the Super Admin reports read them with a collection-group query. Tables export to CSV and Excel in the browser.

## Audit

Triggers on sensitive collections write `auditLogs` entries with actor, target, action and a diff. Callables add entries for actions that triggers can't see, such as password resets and ID reveals.
