# Property Connect Zimbabwe

Property Connect is a property marketplace and named-agent registry. The application is built with Next.js App Router, TypeScript, Tailwind CSS, Better Auth, Prisma, and PostgreSQL. Business and UI behavior follow [Project_spec.md](Project_spec.md); [Propertyconnect.md](Propertyconnect.md) provides business-flow context. The implementation plan and deployment decisions are documented in [docs/deployment-spike.md](docs/deployment-spike.md).

## Local setup

Requirements: Node.js 22.12 or newer and PostgreSQL 14 or newer.

1. Create an empty PostgreSQL database, then copy `.env.example` to `.env` and set `DATABASE_URL` and `DIRECT_URL` to that database, plus a long random `BETTER_AUTH_SECRET` and `CARD_ACTIVATION_PEPPER`. Prisma migrations create the schema inside a database; they do not create the database itself.
2. Install dependencies with `npm ci`.
3. Generate the Prisma client and validate the schema with `npm run db:generate` and `npm run db:validate`.
4. Apply the checked-in migrations with `npm run db:deploy`, then seed the unpriced, inactive-for-checkout card plans with `npm run db:seed`.
5. Start the development server with `npm run dev`.

The initial migration is generated from an empty PostgreSQL database. `DIRECT_URL` is for Prisma migrations; the application uses `DATABASE_URL`, which can be a pooled PostgreSQL connection string.

The seed always creates the unpriced card plans. It also has an optional Sentinel X development fixture; fill the `FILL_IN_` values in `prisma/seed.ts` to enable it. First create and verify the named admin and CEO accounts through the app, then bootstrap the admin, fill the seed details, and rerun `npm run db:seed`. The fixture approves the agency and CEO agent for development and assigns the CEO one active annual card. It does not create or set passwords for either account.

## Authentication and administrator bootstrap

Users sign in with named accounts through Better Auth. Agency applications are public; agents create named accounts from an agency invitation; buyers can enquire without accounts. Email verification and password recovery require working SMTP settings. Passwords must contain at least 12 characters, and phone numbers use international E.164 format (for example `+263771234567`).

To establish the first platform administrator, start the app and configure SMTP, then run the operator-only account command. It defaults to the administrator email configured for the development seed (`sentinelx@admin.com`); press Enter to use it, or provide a different email when prompted. The account name defaults to `Platform Administrator`. The command assigns a random temporary password and requests verification and password setup emails, so no password is entered into the terminal.

```sh
npm run admin:create-account
```

It creates an unprivileged Better Auth account and sends an email verification link. Verify that account, then assign the platform role once with:

```sh
npm run admin:bootstrap -- admin@example.com
```

The bootstrap command refuses to run after a platform administrator has already been assigned. Sign in and enable authenticator MFA at `/account/security` before using `/admin`. Keep the operator terminal and email account under trusted control.

Users can request verification emails at `/verify-email`, recover passwords at `/forgot-password`, and choose a new password at `/reset-password`. Invite recipients create their account from `/register/agent?invite=...`; the invitation email must match the account email. Accounts with both agency and agent records select a workspace at `/workspace/choose`.

Authentication emails use branded responsive HTML with a plain-text fallback. Verification and password recovery have dedicated templates; transactional outbox emails use the same visual wrapper. The sign-in page offers role-specific destinations, and the shared header displays the workspaces available to the signed-in account.

## Payment and card activation

Paynow is the initial checkout provider. Plans are seeded without prices and with `priceApproved = false`, so public checkout remains closed. A platform administrator must set a price, approve it, and activate the plan in `/admin/cards` before checkout opens. In test mode, set `PAYNOW_MERCHANT_EMAIL` to the Paynow merchant account email so the merchant can complete fake test payments. Verified callbacks are idempotent; payment recovery and side effects are delivered through the transactional outbox. Admin-minted cards continue to use `/activate`.

Keep Paynow in test mode until merchant credentials and pricing are approved. Configure its callback URL to `/api/paynow/result` and the return URL to `/payment/return`.

## Storage, audit, and background work

Property/profile media and audit checkpoint archives use separate R2 buckets and credentials. Create distinct least-privilege credentials and set the bucket names in deployment secrets. Allow browser `PUT` uploads from the deployed application origin on the media bucket. Configure the audit bucket's retention lock in Cloudflare before enabling production checkpoint archival; the application cannot apply R2 retention through the S3 API.

Audit checkpoints are signed through AWS KMS. Create an asymmetric ECC P-256 signing key with `SIGN_VERIFY` and grant the application only the required signing and public-key permissions. A scheduled caller must send `Authorization: Bearer $CRON_SECRET` to `/api/cron/outbox` every minute for retries, and once daily to `/api/cron/outbox?checkpoint=daily` to create a checkpoint when there are uncheckpointed events. Configure SMTP for delivery and keep every provider credential in a secret manager, never in source control.

## Deployment

The current compatibility spike selects a Node.js web service on Render, Neon PostgreSQL, Resend SMTP, AWS KMS, and Cloudflare R2. See [docs/deployment-spike.md](docs/deployment-spike.md) for setup details, version compatibility, and the pending records-retention decision. Production server startup validates required configuration and refuses to serve without the required auth, database, storage, mail, signing, and cron secrets. Build-time compilation does not need live service credentials.

Build with `npm run build` and start with `npm start`. Configure `npm run db:deploy` as the release migration command. Do not run migrations against a shared or production database until its target has been reviewed.

# Agents debug cli cmd
$after = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
# Create the invitation, then:
npm run outbox:drain:agent-invitations -- --after $after
