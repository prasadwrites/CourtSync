# CourtSync

CourtSync is a multi-tenant platform for running sports facilities and courts. It has three experiences in one installable web app (PWA):

- **Super Admin**: onboards and manages companies, master data (countries, sports, ID types, payment methods), users, feature flags, platform reports and the audit log.
- **Company Admin**: branches, courts, hours and blocks, calendars, bookings and approvals, check-in, customers, ID verification, credits, memberships and classes, payments and refunds, staff and roles, reports and settings.
- **Customer portal**: one login across every venue. Customers explore venues, book courts, pay, check in with a QR or 6-digit code, and manage memberships, credits and verification.

Stack: React 18, TypeScript, Tailwind and Vite on the web; Firebase Auth, Firestore, Cloud Functions (Node 22), Storage, Hosting, Cloud Messaging and App Check on the backend.

## Repository layout

| Path | What it holds |
| --- | --- |
| `shared/` | Types, zod schemas, permissions and the pure booking engine (slots, pricing, conflict checks). Used by both web and functions. |
| `functions/` | Cloud Functions: callables, payment webhooks, Firestore triggers and scheduled jobs. |
| `web/` | The React PWA. Pages live in `web/src/pages/{admin,manage,customer,public}`. |
| `scripts/` | Seeding and super admin bootstrap. |
| `tests/emulator/` | Security rules tests and end-to-end flow tests against the emulators. |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | Security rules and indexes. |
| `docs/` | Architecture, configuration, deployment and security notes. |

## Quick start (local, no cloud account needed)

Requirements: Node 20 or newer, Java 17+ (for the Firestore emulator) and the Firebase CLI (`npm i -g firebase-tools`).

```bash
npm install
cp web/.env.development.example web/.env.development.local

# Terminal 1: build functions and start the emulators (Auth, Firestore, Functions, Storage)
npm run emulators            # or: npm run emulators:persist  (keeps data in ./emulator-data)

# Terminal 2: load master data and a demo venue, then start the web app
npm run seed
npm run dev                  # http://localhost:5173
```

Demo logins created by the seed (password `CourtSync-demo-1`):

| Email | Role |
| --- | --- |
| `admin@courtsync.test` | Super Admin |
| `owner@smashpoint.test` | Company owner of "SmashPoint Sports Arena" |
| `desk@smashpoint.test` | Front desk staff |
| `player@courtsync.test` | Customer with 200 credits and an upcoming booking |

On the emulator, payments use the built-in **sandbox** provider, so you can complete a checkout without a gateway account. The Emulator UI is at http://localhost:4000.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server for the web app. |
| `npm run typecheck` | Type-check shared, functions and web. |
| `npm run build` | Build all three workspaces. |
| `npm test` | Unit tests, security rules tests and flow tests (starts emulators itself). |
| `npm run emulators` / `emulators:persist` | Start the Firebase emulators. |
| `npm run seed` | Seed master data, plus the demo venue on the emulator. See [docs/deployment.md](docs/deployment.md) for real projects. |
| `npm run bootstrap:superadmin -- --project <id> --email <email>` | Grant (or `--revoke`) Super Admin on a real project. |
| `npm run deploy:dev` / `deploy:staging` / `deploy:prod` | Build and deploy to an environment from `.firebaserc`. |

## Documentation

- [Architecture](docs/architecture.md): data model, tenancy, roles, booking engine, payments.
- [Configuration](docs/configuration.md): environment variables, secrets, payment providers, email, SMS, push, App Check.
- [Deployment](docs/deployment.md): environments, first deploy to `courtsync-babfe`, seeding, the first Super Admin.
- [Security](docs/security.md): how passwords, payments and ID numbers are protected.
