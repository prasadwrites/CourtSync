# Deployment

## Environments

`.firebaserc` defines three aliases. Each should be a separate Firebase project so data, users and secrets never mix.

| Alias | Project | Notes |
| --- | --- | --- |
| `dev` (and `default`) | `courtsync-babfe` | Development. Sandbox payments may be allowed here. |
| `staging` | `courtsync-staging` | Create this project, or change the id in `.firebaserc`. |
| `prod` | `courtsync-prod` | Create this project, or change the id in `.firebaserc`. |

Each project needs the **Blaze** plan (Cloud Functions, Secret Manager and scheduled jobs require billing).

## First deploy to `courtsync-babfe`

1. **Enable products** in the Firebase console:
   - Authentication: Email/Password, plus Google and Phone if you keep those feature flags on. Add your hosting domain to Authorized domains.
   - Firestore (production mode), Storage, Hosting, Cloud Messaging.
   - App Check with reCAPTCHA Enterprise (see [configuration.md](configuration.md#app-check)).
2. **Web config:** register a web app, then copy `web/.env.example` to `web/.env.local` and fill in its values. For staging and prod use `web/.env.staging` / `web/.env.production`.
3. **Functions config:** copy `functions/.env.example` to `functions/.env.courtsync-babfe` and fill it in.
4. **Secrets:** at minimum set `ID_ENCRYPTION_KEY`, and grant the runtime service account `roles/secretmanager.secretAccessor` (see [configuration.md](configuration.md#secrets)). Add payment, email and SMS secrets when you have accounts.
5. **Deploy:**
   ```bash
   firebase login
   npm install
   npm run deploy:dev        # builds everything, then deploys rules, indexes, functions and hosting
   ```
   Index builds can take a few minutes after the first deploy.
6. **Seed master data** (countries, sports, ID types, payment methods). Uses Application Default Credentials:
   ```bash
   gcloud auth application-default login
   npm run seed -- --project courtsync-babfe --no-demo
   ```
   Add `--demo` with `WEB_API_KEY=<web api key>` to also create the demo venue and demo users on a dev project. Never do that on prod.
7. **Create the first Super Admin.** Sign up in the app with your email, then:
   ```bash
   npm run bootstrap:superadmin -- --project courtsync-babfe --email you@example.com
   ```
   Sign out and back in to pick up the new claim. Further Super Admins can be granted from the Users page.
8. **Payment webhooks:** register `https://<domain>/api/webhooks/stripe` and/or `/api/webhooks/razorpay` with the gateway (see [configuration.md](configuration.md#payment-providers)).
9. **Onboard a company** from Super Admin > Companies. The owner gets an invite email (or a link you can pass on if email isn't configured yet).

## Staging and production

Repeat the steps above for each project with its own env files and secrets, then use `npm run deploy:staging` or `npm run deploy:prod`. For production:

- Keep `ALLOW_SANDBOX_PAYMENTS=false` and the `sandboxPayments` flag off.
- Set `ENFORCE_APP_CHECK=true` once App Check metrics look healthy.
- Use live gateway keys and live webhook secrets.
- Restrict the Maps API key to the production domain.
- Turn on Firestore point-in-time recovery and scheduled backups.

## Local emulators

See the Quick start in the [README](../README.md). The emulators use the project id `demo-courtsync`, so they never touch a real project. Two things to know:

- The Firestore emulator needs Java 17 or newer.
- `npm run emulators:persist` saves data to `./emulator-data` on exit and loads it on start.

## Tests

```bash
npm run typecheck
npm test     # unit tests, then rules tests and flow tests, each in their own emulator run
```

The flow tests exercise the real callables end to end: company onboarding, court permissions, concurrent requests for the same slot, approvals, blocks, payments confirmed only by a signed webhook, credits per company, memberships, check-in and out, ID verification, and company suspension.
