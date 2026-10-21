# Compatibility and deployment spike

Reviewed 20 October 2026 for this repository. The application targets a standard Node.js server, not Next.js on Cloudflare Workers.

## Selected deployment

| Layer | Selection | Compatibility notes |
|---|---|---|
| Node runtime | Node.js 22.12 or newer | Prisma ORM 7 requires Node 20.19+, 22.12+ or 24+; Next.js 16 requires Node 20.9+. The project pins a 22.12 minimum in package.json. |
| Web host | Render Node web service | Render documents Next.js SSR as a Node web service. Use a paid, always-on service for production traffic and the scheduled outbox/checkpoint job. |
| PostgreSQL | Neon PostgreSQL | Use Neon's pooled hostname for DATABASE_URL at runtime and the direct hostname for DIRECT_URL when Prisma runs migrations. The Prisma CLI reads DIRECT_URL; the pg driver adapter reads DATABASE_URL. |
| Auth | Better Auth + Prisma adapter | Email/password, verification, recovery, sessions and TOTP MFA use the relational PostgreSQL schema. Admin routes also re-check the user role and MFA state server-side. |
| Payments | Paynow | Live checkout stays blocked until a product administrator approves an amount and activates a priced plan. |
| Email | Resend SMTP | Uses the existing Nodemailer SMTP boundary; configure host smtp.resend.com, port 465, username resend, and a Resend API key as the SMTP password. |
| Checkpoint signing | AWS KMS | Create an asymmetric ECC_NIST_P256 key with SIGN_VERIFY. The application requests ECDSA_SHA_256 signatures; the private key remains in KMS. |
| Object storage | Cloudflare R2 | Use separate media and audit archive buckets/credentials. Apply a bucket lock rule to audit/checkpoints/ in Cloudflare's controls before production checkpointing. |

Sources: [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app), [Neon and Prisma connection setup](https://github.com/neondatabase/website/blob/main/content/docs/guides/prisma.md), [Resend SMTP](https://www.resend.com/changelog/smtp-service), [AWS KMS signing](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html), [AWS KMS key specs](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html), [Cloudflare R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).

## Version baseline

The scaffold pins the installed compatible stack: Next.js 16.3.8, React 19.2, TypeScript 5.9, Tailwind CSS 4.3, Better Auth 1.7.7 and Prisma 7.10.1. Prisma packages are kept on major version 7. The Node engine minimum is 22.12.

## Production wiring

1. Add the Render service with build command npm ci && npm run build, start command npm start, and Node 22.12 or newer.
2. Set DATABASE_URL to the Neon pooled connection and DIRECT_URL to the direct connection. Run npm run db:deploy as the deployment migration command and npm run db:seed once after the first migration.
3. Configure Resend SMTP credentials in the host's secret settings. Do not commit provider keys.
4. Create the AWS KMS asymmetric signing key. Grant the application credential only kms:Sign and kms:GetPublicKey on this key, limited to ECDSA_SHA_256. Set AUDIT_SIGNER_PROVIDER=aws-kms, AUDIT_SIGNER_REGION, and AUDIT_SIGNER_KEY_ID.
5. Configure dedicated R2 buckets and separate access credentials. Allow browser `PUT` uploads from the deployed application origin on the media bucket. In Cloudflare's dashboard, set a retention-locked rule for the audit checkpoint prefix using the approved records-retention period. R2's S3-compatible API does not implement S3 Object Lock operations, so the application does not attempt to set retention over S3.
6. Set CRON_SECRET and call `/api/cron/outbox` every minute for delivery/reconciliation. Call `/api/cron/outbox?checkpoint=daily` once per day for signed checkpoints; that invocation also processes due outbox work. Checkpoints are created only when there are uncheckpointed events.
7. Create and verify the named first administrator account, run npm run admin:bootstrap -- email@example.com, sign in, and enable authenticator MFA at /account/security.
8. Configure Paynow result and return URLs. Keep the Paynow integration in test mode and do not approve CardPlan.priceApproved until pricing has been decided.

Bucket lock duration is a records-retention decision. Set the Cloudflare rule to the approved duration before production; it is not inferred from the business plan.
