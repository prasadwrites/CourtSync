# Configuration

CourtSync has no hardcoded companies, countries, sports, ID types or payment methods. Those are master data that the Super Admin manages in the app (the seed script loads a starting set). This page covers the technical configuration: environment variables, secrets and third-party providers.

## Web app (`web/.env.*`)

Copy `web/.env.example` to `web/.env.local` (dev against a real project), `web/.env.staging` or `web/.env.production`. For the emulators, copy `web/.env.development.example` to `web/.env.development.local`.

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_*` | Firebase web app config, from Firebase console > Project settings > Your apps. These values are public by design. |
| `VITE_FUNCTIONS_REGION` | Region of the Cloud Functions. Must match `FUNCTION_REGION`. |
| `VITE_USE_EMULATORS` | `true` to talk to the local emulators. |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | Enables App Check. Leave empty in development. |
| `VITE_FCM_VAPID_KEY` | Web push key pair (Cloud Messaging > Web Push certificates). Without it, the push toggle is hidden. |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional, for maps on venue pages. Restrict it to your domains. |

## Cloud Functions parameters (`functions/.env.<project>`)

Copy `functions/.env.example` to `functions/.env.courtsync-babfe` (or the id of each project). The Firebase CLI loads it on deploy.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public URL of the web app, used in emails, invites and payment return URLs. |
| `EMAIL_FROM` | Sender for transactional email. |
| `TWILIO_FROM_NUMBER` | Sender for SMS. Empty disables SMS. |
| `STRIPE_PUBLISHABLE_KEY`, `RAZORPAY_KEY_ID` | Public provider keys. Empty keeps the provider disabled. |
| `ENFORCE_APP_CHECK` | `true` rejects callable requests without a valid App Check token. Turn on in staging and prod. |
| `FUNCTION_REGION` | Region for all functions (default `us-central1`). If you change it, also change the `/api/webhooks/**` rewrite region in `firebase.json`. |
| `ALLOW_SANDBOX_PAYMENTS` | Allows the sandbox payment provider outside the emulator. Use only in dev; the Super Admin must also turn on the `sandboxPayments` feature flag. |

## Secrets

Secrets live in Google Secret Manager and are read at runtime by `functions/src/lib/secrets.ts` (cached for 10 minutes). They are never stored in Firestore, env files or client code. A missing secret disables the feature that needs it rather than failing the deploy, and the Super Admin's Payment methods and Platform settings pages show which providers are configured.

| Secret | Needed for |
| --- | --- |
| `ID_ENCRYPTION_KEY` | ID verification. 32 random bytes, base64: `openssl rand -base64 32`. Keep a backup; losing it makes stored ID numbers unreadable. |
| `SENDGRID_API_KEY` | Email. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe payments and refunds. |
| `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay payments and refunds. |

Create a secret and let the functions read it:

```bash
firebase functions:secrets:set ID_ENCRYPTION_KEY --project courtsync-babfe

# The functions runtime service account needs read access to secrets:
gcloud projects add-iam-policy-binding courtsync-babfe \
  --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

To rotate `ID_ENCRYPTION_KEY`, add `ID_ENCRYPTION_KEY_V2` and bump `CURRENT_KEY_VERSION` in `functions/src/lib/crypto.ts`. Existing ciphertexts record their key version, so both keys keep working.

For the emulators, put test values in `functions/.secret.local` (gitignored) as `NAME=value` lines.

## Payment providers

Webhook URL for each provider: `https://<your hosting domain>/api/webhooks/<provider>`.

**Stripe**
1. Set `STRIPE_PUBLISHABLE_KEY` and the `STRIPE_SECRET_KEY` secret.
2. In the Stripe dashboard, add a webhook endpoint `/api/webhooks/stripe` for `payment_intent.succeeded` and `payment_intent.payment_failed`, then store its signing secret as `STRIPE_WEBHOOK_SECRET`.

**Razorpay**
1. Set `RAZORPAY_KEY_ID` and the `RAZORPAY_KEY_SECRET` secret.
2. In the Razorpay dashboard, add a webhook `/api/webhooks/razorpay` for `payment.captured` and `payment.failed` with a secret, and store it as `RAZORPAY_WEBHOOK_SECRET`.

Then, as Super Admin, enable the matching payment methods (Master data > Payment methods), and as a company admin, choose which ones the venue accepts (Settings > Payments).

**Adding a provider.** Implement the adapter interface in `functions/src/payments/providers/types.ts`, register it in `providers/index.ts`, and add a payment method in master data that references it. No other code needs to change.

## Email, SMS and push

- **Email:** set `SENDGRID_API_KEY` and `EMAIL_FROM`, and verify the sender in SendGrid. Without it, password reset links are still generated and shown to the Super Admin so they can be passed on.
- **SMS:** set the Twilio secrets and `TWILIO_FROM_NUMBER`.
- **Push:** set `VITE_FCM_VAPID_KEY` in the web env. Customers turn push on in their profile.

## App Check

1. In the Firebase console, register the web app with reCAPTCHA Enterprise and copy the site key into `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.
2. Deploy with `ENFORCE_APP_CHECK=false`, check the App Check metrics show verified requests, then set it to `true` and redeploy.
3. Optionally enforce App Check for Firestore and Storage in the console as well.

## Feature flags

Platform feature flags (Super Admin > Platform settings) switch features on or off for every company: phone and Google sign-in, public court calendars, memberships, credits, identity verification, and sandbox payments. Company-level options live in each company's settings.
