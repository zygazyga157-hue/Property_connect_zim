# Property Connect: Backend-First Build Plan

## Summary

Build and validate the complete backend before implementing the UI. The checkout currently has the two planning documents but no app source or `package.json`, so start with the application scaffold.

Use [Project_spec.md](</C:/Users/DELL/Development/SMEs/Property_connect_zim/Project_spec.md>) as the UI authority and [Propertyconnect.md](</C:/Users/DELL/Development/SMEs/Property_connect_zim/Propertyconnect.md>) as business-flow context. Your stack and decisions here take precedence over older recommendations in that document.

## Implementation

- Scaffold strict TypeScript, Next.js App Router, Tailwind, Better Auth, Prisma, and PostgreSQL. Select current supported versions and a managed Node host/database in a short compatibility and deployment spike.
- Use Better Auth for named human accounts, sessions, recovery, and admin MFA. Model agencies separately, with named staff memberships, agent profiles, EAC status, and one-level subagent relationships. Do not duplicate auth credentials in business tables.
- Build backend services and route handlers for manual EAC review, agency and agent onboarding, listings and media, public enquiries and lead management, card plans, payments, and admin operations. Enforce role, agency ownership, and active-card rules on every server-side write.
- Use Paynow as the initial checkout provider. A verified, idempotent payment callback mints and activates the digital card; keep `/activate` for admin-minted cards. Defer physical card inventory, Stripe, and automated EAC checks. Keep prices configurable and block live checkout until the pricing decision is approved.
- Record writes in a transactionally ordered audit log with a canonical hash chain. Produce signed daily checkpoints through an external managed KMS and archive them in a separately permissioned, retention-locked R2 bucket. Configure R2 retention through Cloudflare’s controls; its S3-compatible API does not support S3 Object Lock operations. [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- Add a transactional outbox for payment, audit, email, and notification work that needs retrying. Use R2 for property and profile media. Keep provider credentials out of source control.

## UI After Backend Acceptance

Implement the complete route inventory in `Project_spec.md` across public, auth, agent, agency, and platform-admin surfaces. Apply its recommended defaults: graphite digital cards, registry-hall marketplace, Fraunces, detailed audit integrity/card-forensics surfaces, and `SecurityBanner` only on sensitive screens. Build its Tailwind tokens and primitives, including `KeyPlate`, `DeedPlate`, `StampBadge`, `Seal`, `SerialPlate`, `RegistryForm`, and `RuleLine`.

Use shared Zod transition states and the specified loading, error, and recovery copy. Include the live audit feed and checkpoint verification views. Follow the spec’s reduced-motion, keyboard, contrast, and icon-and-copy status rules.

## Acceptance Checks

- Migrations work from an empty database; Better Auth signup, login, logout, recovery, and admin MFA work with the Prisma-backed schema.
- Verify unauthenticated, wrong-role, cross-agency, suspended-user, and expired-card access cases; confirm users cannot access another agency’s records.
- Verify manual EAC approval, listing ownership, enquiry delivery, and lead visibility rules.
- Verify Paynow signature checks, duplicate callbacks, delayed or failed payment recovery, single card activation, and the live-pricing gate.
- Verify audit ordering under concurrent writes, hash-chain tamper detection, checkpoint signatures, KMS retry behavior, and R2 retention controls.
- After backend acceptance, check each UI route on mobile and desktop, including keyboard access, reduced motion, form errors, and transition recovery states.

## Assumptions and Defaults

- Agency staff use named accounts; there are no shared agency credentials.
- Manual EAC review and Paynow are the initial operating model. Pricing remains a product decision before live sales.
- The app runs on a standard Node.js host; Cloudflare provides DNS and R2. Cloudflare currently recommends its beta `vinext` path for new Next.js apps on Workers, so this plan avoids depending on it. [Cloudflare Next.js guidance](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- Choose the Node host, PostgreSQL provider, email service, and external KMS during the deployment spike; keep their interfaces provider-neutral until then.

# Property Connect: Authentication, Roles, and Agent Completion Plan

## Summary

Complete the missing account and recovery flows, fix the Better Auth/Prisma signup failure, and finish the agent experience while preserving the existing agency build. Use `Project_spec.md` for route and UI behavior and `Propertyconnect.md` for business-flow context.

## Implementation Changes

- **Repair authentication and bootstrap.** Align Better Auth’s UUID configuration with Prisma defaults on its auth models (`User`, `Session`, `Account`, `Verification`, and `TwoFactor`). Regenerate the client and update migrations as needed; verify the fix through real account creation. Add an operator-only first-admin CLI flow that creates a normal Better Auth account, sends email verification, and allows promotion only after verification. Keep credentials out of seeds and source control. Require SMTP for verification and recovery emails in development and production, and report missing or failed delivery clearly.
- **Finish account flows.** Keep agency applications public and agent registration invitation-only. Let an invited agent create a named account, verify their email, and resume invitation acceptance. Add verification status/resend UI and a `/reset-password` page that consumes Better Auth’s recovery link. Keep `/forgot-password` enumeration-safe and wire it to the complete reset flow.
- **Validate inputs consistently.** Share Zod validation rules across form and server boundaries, show accessible field-level errors, and keep server validation authoritative. Require passwords of at least 12 characters plus matching confirmation on signup and reset, without composition rules. Normalize and validate email addresses. Accept valid international E.164 phone numbers, using a phone-number parser instead of the current permissive digit regex.
- **Complete role and agent behavior.** Keep platform admin as the global role; represent agency admin/staff through memberships and agents/subagents through profiles. Centralize these checks across pages, APIs, and services. Staff can view agency dashboard, agents, properties, and cards; manage agency leads and listings for a selected agent while preserving agent ownership. Staff cannot invite agents, manage billing, control cards, or perform EAC review. Finish and connect the spec’s agent routes: dashboard, listings and editing, leads, card, profile, and one-level subagents. Support an account holding both agency-admin and agent contexts, with a clear workspace choice. Preserve the agency UI and cover it with regression checks.
- **Follow the UI spec.** Apply the specified loading, error, and recovery states and accessible form behavior to these flows. The “family routes” request is interpreted as forgot-password and related recovery routes; no separate family feature is included.

## Interfaces and Acceptance Checks

- Add `/verify-email` and `/reset-password` UI routes; retain Better Auth’s existing auth API and add the operator CLI account-creation step. Define shared password, email, and phone schemas for client and server validation.
- Verify signup persists all Better Auth records with generated IDs; email verification and reset links work, expire, and cannot be reused; resend and SMTP failures recover cleanly.
- Verify first-admin setup cannot promote an unverified account or run after an administrator already exists; admin access still requires MFA.
- Verify role boundaries for platform admins, agency admins, operational staff, agents, and subagents, including cross-agency listing/lead access and dual agency-admin/agent accounts.
- Check invalid and valid email, international phone, password length, and password mismatch cases produce field-level feedback and server rejection where appropriate. Review auth and agent routes at mobile and desktop sizes with keyboard and reduced-motion behavior.

## Assumptions and Defaults

- Buyers can enquire without accounts; there is no general public buyer signup.
- Agency applications are open; agents join by invitation; first platform admin is provisioned by an operator.
- Agency EAC review and pricing approval remain manual; live checkout remains closed until pricing is approved.
- Agency features already present are retained; work focuses on auth, validation, role enforcement, agent completion, and targeted agency access changes.

# Property Connect Card Activation and Seat Lifecycle

## Summary

Card activation is on its own `/activate` page; the public site header links to it, but the landing page content does not contain the form. Keep that public link and add the existing agent workspace entry point, with a sign-in handoff for visitors.

Complete card management for agents, agencies, and platform admins. Preserve automatic activation after verified Paynow payments to a named agent, and require agent code entry for assigned inventory cards.

## Implementation Changes

- **Agent and agency flows:** Only an active, verified agent in an active agency can activate a card. Agency administrators can buy a card for a named agent or purchase unassigned inventory; agency staff can view inventory and payment status but cannot purchase or assign cards. For inventory, payment creates an unactivated card. An agency administrator assigns it to an active agent in the same agency, receives a one-time activation code, and the agent activates it. Never expose the code again after it is issued.
- **Seat and payment lifecycle:** Keep one current professional seat per agent. Renewals extend that seat from the later of today or its existing expiry, preserving its serial and recording each payment separately. Record agency payer and target agent for sponsored purchases. A verified Paynow callback must be idempotent; refunds remove the refunded term and recalculate coverage, retaining access covered by other valid payments.
- **Platform admin actions:** Keep card administration behind the existing platform-admin MFA check. Admins can mint cards, assign or reassign unactivated cards, replace a lost activation code before activation, suspend and restore active cards, and revoke cards. Require a reason for state-changing actions and record every change in the audit history. Suspension pauses paid time; restoration adds the paused duration to expiry. Revocation is terminal, and active cards cannot be reassigned.
- **Data, APIs, and UI:** Add a `SUSPENDED` card state and suspension timing data. Change payment-to-card storage to support multiple payments per seat and preserve each term for renewal and refund calculations. Add agency-sponsored checkout and card-assignment actions, and make admin card actions explicit state transitions. Update agency inventory, the agent card view, admin minting, and card forensics to show assignments, activation, renewals, suspensions, payments, and history. The activation page should guide signed-out visitors through sign-in and return them safely to activation; buyers and ineligible agents should receive clear next steps. Keep the existing pricing approval gate for live checkout.

## Test Plan

- Confirm `/activate` is discoverable from both the public header and agent workspace; signed-out users return to activation after sign-in.
- Verify only active, verified agents in active agencies can activate; test buyer, suspended, unverified, pending-agent, wrong-agency, duplicate activation, invalid-code, lockout, and concurrent-activation cases.
- Verify agency admins can buy and assign only within their agency, staff remain read-only, and activation codes are shown once and rotated on reassignment.
- Verify named-agent payments auto-activate after callback; unassigned inventory waits for assignment and agent activation. Test callback signature validation, duplicate and delayed callbacks, renewals on the same seat, price gating, and refund recalculation.
- Verify admin MFA, required reasons, valid state transitions, suspension time preservation, terminal revocation, audit events, and migration handling for existing payment links and duplicate active seats.

## Assumptions and Defaults

- Each agent profile has at most one current card; an unrevoked expired card can be renewed, while a revoked card remains historical and may be replaced with a new serial.
- Agency-sponsored inventory is purchased one card per payment. Assignment codes are delivered by the agency administrator through a secure channel.
- Existing records are preserved during migration. Conflicting current cards for an agent must be identified and reconciled rather than silently deleted.
