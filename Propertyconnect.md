Property Connect Zimbabwe — project_plan.md

"Give the agent the keys."
A professional digital property office for Zimbabwean estate agents — affordable, prepaid, self-service, and auditable.

---

1. Executive Summary

Property Connect Zimbabwe (PCZ) is not another property listing website. It is a professional digital workspace for estate agents, subagents, and agencies operating in Zimbabwe. The platform replaces the "pay-per-advert" model with a prepaid annual Gold Card that grants one professional seat 365 days of marketplace access, a personal portfolio, direct buyer enquiries, and a verifiable digital identity tied to the Estate Agents Council (EAC) of Zimbabwe.

Three pillars differentiate PCZ:

1. Agent-centric control — the agent owns their listings, profile, and leads. No admin gatekeeping between them and the marketplace.
2. Prepaid Gold Card economy — a tangible, scratch-to-activate card worth $10/month or $90/year, per seat. No recurring SaaS fatigue.
3. Regulatory-grade Audit Hub — an immutable, forensically-queryable ledger that turns the platform into a trust authority for the Zimbabwean property market.

---

2. Business Model

2.1 Hierarchy

```
Platform (Property Connect Zimbabwe)
 └── Agency            (e.g. "Knight Frank Zimbabwe")  — EAC registered
      └── Agent        (EAC registered, holds a Gold Card)
           └── Subagent (holds their own Gold Card)
```

Every person who publishes on the marketplace — Agent or Subagent — occupies one professional seat and therefore one Gold Card.

2.2 Pricing

Plan Price Duration Notes
Monthly Gold Card USD 10.00 30 days Auto-expires; manual renewal
Annual Gold Card USD 90.00 365 days 25% saving vs monthly
Agency Bundle (10+ cards) Contact sales 365 days Volume tier, invoiced

Pricing is per seat, not per agency. A single agency with 1 agent and 4 subagents requires 5 active cards.

2.3 Revenue Surfaces

· Gold Card sales (primary)
· Featured listing placement (secondary, opt-in, never mandatory)
· Agency bundle invoicing (enterprise)

---

3. Technology Stack

The table below records the initial proposal. Use the decisions in Section 12.1 as the current recommendation where they differ; confirm exact versions and providers during Stage 1.

Layer Choice Rationale
Language TypeScript (strict) Non-negotiable type safety across client + server
Framework Next.js 14+ (App Router) RSC, route handlers, edge middleware
Runtime Node.js 20 LTS Long-term support, native fetch
Database PostgreSQL 16 Relational integrity for agency/agent hierarchies
ORM Prisma Type-safe schema, migrations, audit hooks
Auth jose (RS256 JWT) + httpOnly cookies Asymmetric signing, Edge-compatible
Hashing argon2id for passwords, HMAC-SHA256 for card tokens Modern, memory-hard
UI Tailwind CSS + shadcn/ui + Radix Primitives White + deep-blue brand system
Forms react-hook-form + Zod Shared validation between client & server
State Zustand (client) + RSC (server) Minimal, no Redux ceremony
Payments Paynow Zimbabwe (primary) + Stripe (fallback for diaspora) Local rails + international
Queue BullMQ (Redis) Async: card minting, audit checkpointing, email
Email Resend Transactional only (no marketing spam)
Observability Sentry + Axiom Errors + structured logs
Hosting Vercel (app) + Neon (Postgres) + Upstash (Redis) Managed, zero-ops

---

4. Roles & Permissions

Role Scope Can Do Cannot Do
platform_admin Global Manage agencies, revoke cards, view audit hub, mint cards Publish listings on behalf of agents
agency_admin One agency Add/remove agents, view agency-wide listings & leads, purchase cards, manage billing Edit another agency's data
agent Own seat + subagents Publish listings, manage own profile, invite subagents, view own leads Access other agents' leads
subagent Own seat only Publish listings, manage own profile, view own leads Invite subagents, view agency billing
buyer Public Browse, search, contact agent Any write action

Role is embedded in the JWT and re-checked server-side on every write.

---

5. Data Model (Prisma)

```prisma
// ─── Identity ────────────────────────────────────────────────
model Agency {
  id            String   @id @default(uuid())
  name          String
  eacRegNumber  String   @unique              // Estate Agents Council reg.
  email         String   @unique
  phone         String
  passwordHash  String
  logoUrl       String?
  address       String?
  status        AgencyStatus @default(PENDING)
  createdAt     DateTime @default(now())
  agents        Agent[]
  cards         GoldCard[]
  audits        AuditEvent[]
}

enum AgencyStatus { PENDING  ACTIVE  SUSPENDED  DEREGISTERED }

model Agent {
  id            String   @id @default(uuid())
  fullName      String
  email         String   @unique
  phone         String                        // +263 format validated
  passwordHash  String
  photoUrl      String?                       // required at onboarding
  eacRegNumber  String   @unique              // e.g. "EAC/2024/01837"
  role          Role     @default(AGENT)
  status        AgentStatus @default(PENDING)
  agencyId      String
  parentAgentId String?                       // null = top-level agent
  agency        Agency   @relation(fields: [agencyId], references: [id])
  parentAgent   Agent?   @relation("AgentTree", fields: [parentAgentId], references: [id])
  subagents     Agent[]  @relation("AgentTree")
  card          GoldCard?
  properties    Property[]
  leads         Lead[]
  sessions      Session[]
  createdAt     DateTime @default(now())
}

enum Role       { AGENT  SUBAGENT }
enum AgentStatus { PENDING  ACTIVE  SUSPENDED  DEREGISTERED }

// ─── Gold Cards ──────────────────────────────────────────────
model GoldCard {
  id             String   @id @default(uuid())
  serial         String   @unique             // human-readable: PCZ-2025-A7K9-3312
  codeHash       String                       // HMAC-SHA256(code, pepper)
  codeSalt       String
  plan           CardPlan
  priceCents     Int
  currency       String   @default("USD")
  status         CardStatus @default(MINTED)
  issuedToAgency String?
  issuedToAgent  String?   @unique
  mintedBy       String                       // platform_admin id
  mintedAt       DateTime @default(now())
  issuedAt       DateTime?
  activatedAt    DateTime?
  expiresAt      DateTime?
  revokedAt      DateTime?
  revokeReason   String?
  paymentRef     String?                      // Paynow/Stripe reference
  agency         Agency?  @relation(fields: [issuedToAgency], references: [id])
  agent          Agent?   @relation(fields: [issuedToAgent],  references: [id])
  events         CardEvent[]
}

enum CardPlan   { MONTHLY  ANNUAL }
enum CardStatus { MINTED  ISSUED  ACTIVATED  EXPIRED  SUSPENDED  REVOKED }

model CardEvent {
  id         String   @id @default(uuid())
  cardId     String
  type       CardEventType
  actorId    String?
  actorRole  Role?
  ip         String?
  userAgent  String?
  metadata   Json?
  createdAt  DateTime @default(now())
  card       GoldCard @relation(fields: [cardId], references: [id])
}

enum CardEventType {
  MINTED  ISSUED  ACTIVATED  RENEWED
  SUSPENDED  REVOKED  EXPIRED
  ACTIVATION_FAILED  ACTIVATION_ATTEMPT
}

// ─── Listings & Leads ────────────────────────────────────────
model Property {
  id          String   @id @default(uuid())
  title       String
  description String
  priceCents  BigInt
  currency    String   @default("USD")
  suburb      String
  city        String
  bedrooms    Int
  bathrooms   Int
  propertyType PropertyType
  agentId     String
  agencyId    String
  status      ListingStatus @default(DRAFT)
  publishedAt DateTime?
  createdAt   DateTime @default(now())
  media       PropertyMedia[]
  leads       Lead[]
}

enum PropertyType  { HOUSE  APARTMENT  TOWNHOUSE  LAND  COMMERCIAL  FARM }
enum ListingStatus { DRAFT  ACTIVE  PAUSED  SOLD  RENTED  ARCHIVED }

model PropertyMedia {
  id         String   @id @default(uuid())
  propertyId String
  url        String
  sortOrder  Int      @default(0)
  property   Property @relation(fields: [propertyId], references: [id])
}

model Lead {
  id         String   @id @default(uuid())
  propertyId String
  agentId    String
  name       String
  phone      String
  email      String?
  message    String?
  status     LeadStatus @default(NEW)
  createdAt  DateTime @default(now())
  property   Property @relation(fields: [propertyId], references: [id])
  agent      Agent    @relation(fields: [agentId], references: [id])
}

enum LeadStatus { NEW  CONTACTED  VIEWING  CLOSED  LOST }

// ─── Sessions & Security ─────────────────────────────────────
model Session {
  id             String   @id @default(uuid())
  agentId        String
  refreshHash    String                       // argon2id of refresh token
  deviceFp       String                       // hashed UA + IP + accept-lang
  ip             String
  userAgent      String
  createdAt      DateTime @default(now())
  lastSeenAt     DateTime @default(now())
  expiresAt      DateTime
  revokedAt      DateTime?
  revokedReason  String?
  agent          Agent    @relation(fields: [agentId], references: [id])
}

model RefreshToken {
  id          String   @id @default(uuid())
  sessionId   String
  tokenHash   String   @unique                // argon2id
  jti         String   @unique
  rotatedFrom String?
  usedAt      DateTime?
  expiresAt   DateTime
}

// ─── Audit Ledger (append-only, hash-chained) ────────────────
model AuditEvent {
  id          String   @id @default(uuid())
  seq         BigInt   @unique                // monotonic
  actorId     String?
  actorRole   Role?
  agencyId    String?
  action      String                          // "card.revoked", "agent.login", etc.
  targetType  String?
  targetId    String?
  ip          String?
  userAgent   String?
  metadata    Json?
  prevHash    String                          // SHA-256 of previous event
  hash        String                          // SHA-256 of this event + prevHash
  createdAt   DateTime @default(now())
  agency      Agency?  @relation(fields: [agencyId], references: [id])

  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@index([targetType, targetId])
}

model AuditCheckpoint {
  id          String   @id @default(uuid())
  fromSeq     BigInt
  toSeq       BigInt
  merkleRoot  String
  signature   String                          // signed by platform key
  createdAt   DateTime @default(now())
}
```

---

6. Gold Card System

6.1 Physical Card → Digital Seat

```
 ┌───────────────────────────────────────────┐
 │   PROPERTY CONNECT ZIMBABWE  •  GOLD CARD │
 │                                           │
 │   SERIAL   PCZ-2025-A7K9-3312             │
 │   PLAN     ANNUAL  •  USD 90.00           │
 │                                           │
 │   ▓▓▓▓▓▓▓▓▓▓  scratch here  ▓▓▓▓▓▓▓▓▓▓    │
 │                                           │
 │   pcz.co.zw/activate                      │
 └───────────────────────────────────────────┘
```

6.2 Card Lifecycle (state machine)

```
MINTED ──issue──▶ ISSUED ──activate──▶ ACTIVATED ──expire──▶ EXPIRED
  │                 │                     │
  │                 │                     ├──suspend──▶ SUSPENDED ──resume──▶ ACTIVATED
  └───revoke────────┴─────revoke──────────┴──revoke──▶ REVOKED
```

Transition Trigger Guard
MINTED → ISSUED Platform admin assigns to agency/agent Caller is platform_admin
ISSUED → ACTIVATED Agent submits serial + code Code HMAC matches, card not expired, agent not already holding an active card
ACTIVATED → EXPIRED Cron at expiresAt —
ACTIVATED → SUSPENDED Admin action (fraud, non-payment) Reason required
any → REVOKED Admin action Reason required, irreversible

6.3 Card Code Security

· 20-character Crockford Base32 code, no ambiguous glyphs (0/O, 1/I/L removed)
· Stored as HMAC-SHA256(code, pepper) — the plaintext code is never persisted after mint
· Activation requires serial + code (both factors)
· Rate-limited: 5 failed attempts per IP per hour → 1 hour lockout
· Activation attempts are audited with IP + UA (both success and failure)
· QR code on card encodes a signed URL: pcz.co.zw/activate?t=<signed-token> — prevents URL forgery

6.4 Renewal

· On expiry, card status → EXPIRED; agent dashboard enters read-only mode
· Renewal flow: purchase new card → activate → extends expiresAt from max(now, currentExpiry)
· Stacking is allowed up to 24 months to prevent indefinite hoarding

---

7. Security Framework

7.1 Token Architecture

Token Type TTL Storage Purpose
Access JWT (RS256) 15 min httpOnly cookie API authorization
Refresh Opaque (256-bit random) 30 days httpOnly cookie + argon2 hash in DB Session continuity
CSRF Signed double-submit 2 h Non-httpOnly cookie + header Form protection
Card activation Signed one-time token 10 min Query param (QR) Prevent URL forgery
Password reset Signed one-time token 30 min Email link Account recovery

Access token payload:

```json
{
  "sub": "agent_uuid",
  "role": "agent",
  "agency_id": "agency_uuid",
  "sid": "session_uuid",
  "jti": "unique_token_id",
  "fp": "sha256(ua + ip_prefix + al)",
  "iat": 1735900800,
  "exp": 1735901700,
  "iss": "pcz.co.zw",
  "aud": "pcz-api"
}
```

7.2 Token Rotation & Reuse Detection

Every refresh triggers rotation:

1. Old refresh token marked usedAt
2. New refresh token issued, linked via rotatedFrom
3. If a used refresh token is presented again → session is compromised
4. Response: revoke entire session, force re-login, emit AuditEvent of type session.reuse_detected
5. User is notified by email

7.3 Password Policy

· Minimum 12 characters, must contain: upper, lower, digit, symbol
· Checked against HaveIBeenPwned k-anonymity API on signup
· Hashed with argon2id (memory: 64 MB, iterations: 3, parallelism: 4)
· Never logged, never returned in responses, never in error messages

7.4 Session Binding

Each session is bound to a device fingerprint (fp claim):

· Hash of: User-Agent + /24 IP prefix + Accept-Language
· Mismatch on any request → step-up auth required (re-enter password)
· Changing networks (e.g. mobile → WiFi) triggers soft re-auth, not logout
· Changing UA strings triggers hard logout

7.5 Route Guards

Layer Responsibility
middleware.ts (Edge) Verifies JWT signature, expiry, role vs route prefix. Redirects on mismatch.
requireRole() (Server) Re-verifies role against live DB — protects against stale tokens
requireActiveCard() (Server) For agent/subagent write actions: checks GoldCard.status = ACTIVATED and expiresAt > now()
Zod schemas (Route + Action) Every input validated before touching DB
Rate limiter (Upstash) Per-IP and per-user on auth, activation, payment routes

7.6 Secrets & Key Management

· JWT signing: RS256 keypair. Private key in Vercel encrypted env. Public key embedded in middleware.
· Card code pepper: separate 32-byte secret, rotate quarterly via versioned prefix
· All secrets in .env.local (dev) and Vercel Environment (prod); never in git
· Every secret has an owner and a rotation cadence in SECRETS.md

---

8. Administration Audit & Forensics Hub

The Audit Hub is the regulatory conscience of PCZ — an immutable ledger of every security-relevant event, queryable by admins, exportable for EAC and law-enforcement.

8.1 Design Principles

1. Append-only — no UPDATE, no DELETE on AuditEvent
2. Hash-chained — each event hashes its predecessor; tampering breaks the chain
3. Signed checkpoints — every 24 h, the Merkle root of new events is signed and archived
4. Structured — every event carries actor, action, target, metadata
5. Query-first — designed for forensic investigation, not just compliance theatre

8.2 Event Taxonomy

Category Events
Identity agency.registered, agency.suspended, agent.registered, agent.approved, agent.suspended, agent.deleted
Auth login.success, login.failed, logout, session.reuse_detected, password.changed, password.reset_requested
Card card.minted, card.issued, card.activated, card.activation_failed, card.renewed, card.suspended, card.revoked, card.expired
Listing listing.created, listing.published, listing.edited, listing.archived, listing.flagged
Lead lead.received, lead.status_changed
Payment payment.initiated, payment.succeeded, payment.failed, payment.refunded
Admin admin.impersonation_start, admin.impersonation_end, admin.export_requested, admin.checkpoint_created

8.3 The Hub — Admin Surface

Route: /admin/audit (protected by platform_admin + hardware 2FA)

Modules:

· Live Feed — real-time event stream (Server-Sent Events), filterable by actor, action, agency, IP
· Timeline — reconstruct a full narrative for any agent, card, or agency
· Card Forensics — full lifecycle of a single card: mint, print batch, issue, every activation attempt, every renewal, every IP
· Anomaly Board — rule-based detection:
  · 10 failed logins for one email in 1 h
  · 5 failed card activations from one IP in 1 h
  · A card activated from a country outside Zimbabwe/SADC
  · An agent whose session IP changed continent mid-session
  · A refund followed within 24 h by a chargeback
· Chain Integrity — one-click verification: recompute the hash chain and compare to the last signed Merkle root. If mismatch → incident.
· Exports — signed PDF/CSV for EAC compliance requests. Each export is itself audited.

8.4 Hash Chain Construction

```
event.hash = SHA256(
  event.seq          ||
  event.actorId      ||
  event.action       ||
  event.targetType   ||
  event.targetId     ||
  JSON.stringify(event.metadata) ||
  event.createdAt    ||
  event.prevHash
)
```

The first event uses prevHash = "GENESIS". Checkpoints sign the Merkle root of events [fromSeq..toSeq] with the platform's Ed25519 key, giving external verifiability (EAC can hold the public key).

8.5 Retention

· Hot (0–90 days): queryable in the Hub, indexed for fast search
· Warm (90 days–2 years): Postgres, compressed, slower queries
· Cold (2+ years): S3-compatible object storage (Wasabi), encrypted, exported on demand
· Never deleted while the associated agency or agent is under regulatory review

---

9. Transition State System

PCZ rejects generic loaders. Every transition is a narrative moment that reinforces trust, professionalism, and the Gold Card identity. States are defined as a small state machine per flow, and each state has its own copy, animation, and error handling.

9.1 State Taxonomy

Tier Purpose Examples
Micro Sub-second feedback on an action "Sealing your session…"
Flow Multi-step process feedback "Verifying your EAC credentials…"
Recovery Error + retry, never dead-ends "That code didn't match. 4 attempts left."
Security High-trust moments, slightly slower, deliberate "Minting your Gold Card…"

9.2 Signup — Agency

State Trigger Copy Duration
idle Form displayed — —
validating On submit "Checking your EAC registration…" 300 ms
creating DB insert "Registering your agency…" 800 ms
seeding Agency created "Preparing your agency workspace…" 500 ms
done Redirect "Welcome. Your workspace is ready." 1.2 s
error_duplicate_email Email exists "This email is already registered. Sign in instead?" —
error_duplicate_eac EAC number exists "This EAC number is already on file. Contact support." —
error_invalid_eac Format mismatch "EAC numbers look like EAC/YYYY/NNNNN. Please check." —

9.3 Signup — Agent

State Copy
validating "Verifying your EAC number against the register…"
uploading_photo "Uploading your professional photo…"
pending_approval "Your agency has been notified. Approval usually takes under 24 hours."
approved "Approved. Activate your Gold Card to go live."

9.4 Card Activation

State Copy Guard
scanning "Reading your Gold Card…" QR or manual entry
verifying "Verifying serial and code…" HMAC check
minting "Minting your digital seat…" DB write
activating "Activating 365 days of access…" expiresAt set
sealed "Your Gold Card is live. Welcome." Redirect to dashboard
error_code "That code didn't match. 4 attempts left." Decrement counter
error_locked "Too many attempts. Try again in 1 hour." IP lockout
error_already_used "This card has already been activated." —
error_expired_card "This card was minted over 24 months ago. Contact support." —

9.5 Login

State Copy
identifying "Identifying your account…" — after email field blurs
verifying "Verifying credentials…"
sealing "Sealing your session…" — after JWT issued
routing "Taking you to your dashboard…"
error_invalid "Email or password is incorrect." (Never disclose which.)
error_pending "Your account is awaiting agency approval."
error_suspended "Your account has been suspended. Contact your agency."
error_card_expired "Your Gold Card has expired. Renew to continue."

9.6 Logout

State Copy
revoking "Closing your session…"
clearing "Clearing local data…"
done "You're signed out. See you soon."

9.7 Payment

State Copy
initiating "Preparing your secure checkout…"
redirecting "Taking you to Paynow…"
awaiting "Waiting for confirmation from Paynow…" (poll, up to 90 s)
confirmed "Payment confirmed. Minting your Gold Card…"
receipt "A receipt has been emailed to you."
error_declined "Your payment was declined. No charge was made."
error_timeout "We didn't hear back from Paynow. Check your email — we'll confirm within 5 minutes."
error_duplicate "This payment was already processed. Check your email."

9.8 Session Management

State Copy
refreshing (silent) —
reuse_detected "For your security, we've signed you out. Please sign in again." (modal, non-dismissible)
fp_mismatch "We noticed a change in your device. Please confirm your password."
expired "Your session ended. Sign in to continue."

9.9 Role-Based Actions

Action Non-Permitted User Sees
Agent → /agency/dashboard "This area is for agency administrators." → redirect to agent dashboard
Subagent → "Invite subagent" Button hidden. Direct URL → "Only top-level agents can invite subagents."
Agency admin → edit another agency's agent 404 (never disclose existence)
Anyone → write with expired card Banner + modal: "Renew your Gold Card to publish."

9.10 Implementation Contract

Every state above has:

· A React transition component (<TransitionState flow="card.activation" state="minting" />)
· A Zod enum shared between client and server
· A Server Action returning { state, message?, redirect? }
· A timeout (no state lasts >30 s without either progressing or erroring)
· A safe escape (user can always navigate away except during sealing and minting, which take <1 s)

---

10. UX & Design System

10.1 Brand

· White base — clean, professional, regulatory-safe
· Deep blue primary (#0B3B8F) — trust, authority
· Fading blue gradient (from-[#0B3B8F] via-[#1E5FBF] to-[#3B82F6]) — used on heroes, dashboard headers, transition states
· Gold accent (#C9A227) — reserved exclusively for Gold Card surfaces. Never decorative.

10.2 Tailwind Tokens

```ts
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      brand: {
        50:  "#EFF6FF",
        100: "#DBEAFE",
        500: "#1E5FBF",
        700: "#0B3B8F",
        900: "#052463",
      },
      gold: {
        400: "#E0BC4A",
        500: "#C9A227",
        700: "#9A7A14",
      },
    },
    backgroundImage: {
      "brand-fade": "linear-gradient(135deg, #0B3B8F 0%, #1E5FBF 55%, #3B82F6 100%)",
    },
    fontFamily: {
      sans: ["Inter", "system-ui", "sans-serif"],
      display: ["Sora", "Inter", "sans-serif"],
    },
  },
}
```

10.3 Component Primitives (shadcn/ui + custom)

· <GoldCard /> — flippable 3D card component
· <TransitionState /> — narrative state renderer
· <AuditTimeline /> — chronological event viewer
· <RoleBadge /> — agent / subagent / agency / admin
· <CardStatusPill /> — MINTED / ISSUED / ACTIVATED / …
· <SecurityBanner /> — top-of-page trust indicator (session, IP, device)

---

11. Route Architecture

```
app/
  (public)/
    page.tsx                       # marketplace
    properties/[id]/page.tsx
    activate/page.tsx              # Gold Card activation
  (auth)/
    login/page.tsx
    register/agency/page.tsx
    register/agent/page.tsx
    forgot-password/page.tsx

  agency/                          # agency_admin only
    dashboard/page.tsx
    agents/page.tsx
    agents/[id]/page.tsx
    properties/page.tsx
    leads/page.tsx
    billing/page.tsx
    cards/page.tsx                 # purchase & assign

  agent/                           # agent + subagent
    dashboard/page.tsx
    listings/page.tsx
    listings/new/page.tsx
    listings/[id]/edit/page.tsx
    leads/page.tsx
    subagents/page.tsx             # agent only
    profile/page.tsx
    card/page.tsx                  # view own Gold Card

  admin/                           # platform_admin only, 2FA
    dashboard/page.tsx
    agencies/page.tsx
    agents/page.tsx
    cards/
      page.tsx
      mint/page.tsx
      [serial]/page.tsx            # card forensics
    audit/
      page.tsx                     # live feed
      timeline/page.tsx
      anomalies/page.tsx
      integrity/page.tsx
      exports/page.tsx

  api/
    auth/
      login/route.ts
      logout/route.ts
      refresh/route.ts
      register/agency/route.ts
      register/agent/route.ts
    cards/
      activate/route.ts
      renew/route.ts
      mint/route.ts                # admin
      revoke/route.ts              # admin
    payments/
      initiate/route.ts
      webhook/paynow/route.ts
      webhook/stripe/route.ts
    agency/
      agents/[id]/approve/route.ts
      agents/[id]/suspend/route.ts
    agent/
      listings/route.ts
      listings/[id]/route.ts
      subagents/invite/route.ts
    admin/
      audit/stream/route.ts        # SSE
      audit/export/route.ts
      audit/checkpoint/route.ts

lib/
  auth/
    jwt.ts          # sign, verify (RS256)
    session.ts      # create, rotate, revoke
    fingerprint.ts  # device fp computation
    password.ts     # argon2id wrapper
    guard.ts        # requireRole, requireActiveCard
  cards/
    mint.ts         # serial + code generation, HMAC
    activate.ts     # activation state machine
    renew.ts
  audit/
    emit.ts         # every write calls this
    chain.ts        # hash chain construction
    checkpoint.ts   # daily Merkle root + signature
    anomaly.ts      # rule engine
  payments/
    paynow.ts
    stripe.ts
  db.ts             # Prisma singleton
  ratelimit.ts      # Upstash wrapper

middleware.ts       # edge route protection
prisma/schema.prisma
```

---

12. Recommended Delivery Plan (Staged)

The seven-day schedule below is a feature inventory, not a credible delivery commitment. This product includes identity verification, role and agency boundaries, payments, card activation, listings, lead handling, and security auditing. Build it in stages, with a working review point at the end of each stage. Do not start the next stage until its exit checks pass and the product decisions it depends on are settled.

12.1 Framework and service decisions

| Area | Recommendation | Why / boundary |
|---|---|---|
| Web app | TypeScript in strict mode, Next.js App Router, React Server Components for read-heavy pages | One web application can serve public listings and private workspaces. Keep authorization and writes in server-only modules; do not treat middleware as the security boundary. |
| Runtime | Current supported Node.js LTS that satisfies the selected framework and ORM | The brief's Node 20 target will age out; select and pin the supported LTS when implementation begins rather than fixing an old major version in the plan. |
| Database | Managed PostgreSQL | Relational constraints suit agencies, seats, cards, properties, and leads. PostgreSQL remains the source of truth. |
| Database access | Prisma ORM, after a short proof of compatibility with the selected Next.js and hosting versions | Prisma is a reasonable fit for a TypeScript team. Keep migrations reviewed and use SQL for constraints or append-only protections that the ORM schema cannot express clearly. Pin one supported major version; do not mix setup instructions across Prisma versions. |
| Authentication | Use a maintained authentication library or managed identity service; choose after checking deployment, recovery, MFA, and data-location needs | Do not hand-roll JWT issuance, refresh rotation, device fingerprinting, or password reset in the first stage. Server-side permission checks still apply to every write. |
| Validation and forms | Zod at server boundaries; React Hook Form for complex client forms | A shared schema can improve form feedback, but server validation remains mandatory. |
| UI | Tailwind CSS plus accessible Radix-based components (shadcn/ui where useful) | Establish a small design system; build the real marketplace and workspace flows before decorative transitions. |
| Payments | Paynow integration behind a small provider interface; Stripe only after a confirmed diaspora use case | Store provider references and idempotency keys. Confirm payment through verified server-side callbacks/reconciliation, never a browser redirect alone. |
| Media | S3-compatible object storage with upload limits and image processing | Avoid putting listing photos in the relational database or relying on app-server disk. Choose vendor after pricing and regional access checks. |
| Background jobs | Begin with scheduled jobs and a database-backed outbox; add a managed Redis queue only when measured workload needs it | Audit writes and payment state changes must not be silently lost if an external service is down. Avoid operating Redis/BullMQ before there is a real async workload. |
| Email | Transactional email provider behind an adapter | Use for verification, recovery, and essential notices; confirm delivery and local support needs before selecting a vendor. |
| Hosting | Choose a managed Node-compatible app host and PostgreSQL provider after a deployment spike | Validate Zimbabwe user latency, payment callbacks, backups, data location, cost, and preview environments. Avoid committing to Vercel + Neon + Upstash as a package before those checks. |
| Observability | Structured application logs, error reporting, and uptime checks from the first deployed stage | Minimize personal data in logs; define retention and access for operational events. |

12.2 Delivery stages

| Stage | Scope | Exit check |
|---|---|---|
| 0. Product and risk decisions | Confirm launch market and users; define EAC verification process, agency/agent onboarding, card sale and assignment rules, payment reconciliation, support/refund path, privacy notice, moderation policy, and first launch area. Reduce the data model to fields needed for these flows. | A reviewed MVP scope, user journeys, permissions matrix, data map, and list of unresolved operational/legal decisions. No framework coding decisions should depend on unverified EAC or payment assumptions. |
| 1. Technical foundation | Scaffold app, database migrations, environments/secrets, deployment preview, error reporting, basic design tokens, and an initial accessibility baseline. Prove one public page and one protected server-side write. | A deployed preview can connect to the database safely; migration/rollback and secret handling are documented; one authorization boundary is demonstrated. |
| 2. Identity and agency workspace | Agency registration, manual review/approval, agent invitation or registration, account recovery, role-based workspace, and agency membership rules. Defer custom token machinery and automated register integration. | Agency admin can onboard an agent; users cannot read or change another agency's records; pending/suspended states have clear recovery steps. |
| 3. Listings and public discovery | Agent profile, create/edit/pause/archive listing, image upload, basic search and filters, property detail page, and contact enquiry form. Start with a bounded launch geography and a modest filter set. | A verified agent can publish a complete listing; buyers can find it and submit a lead; spam, invalid data, and unauthorized edits are handled. |
| 4. Leads and operating workflow | Agent lead inbox, status updates, notifications, agency visibility rules, report/flag flow, and basic platform support tools. | Lead ownership and agency access rules are verified; enquiry delivery is observable and retryable; moderation/support can resolve a reported listing. |
| 5. Gold Card and payments | Decide physical vs digital-first issuance, mint/assign/activate, Paynow payment flow, webhook verification, idempotency, receipts, expiry, renewal, and admin reconciliation. Pilot with test cards and a small cohort before physical batches. | Payment and activation reconcile in a ledger; duplicate callbacks cannot issue duplicate access; failed/ambiguous payments have a human resolution path; expired seats have the agreed read-only behavior. |
| 6. Trust, audit, and launch hardening | Record security and business events; restrict audit mutation at the database/service level; add admin search/export, backup restore exercise, rate limits, accessibility and mobile checks, incident runbook, and launch monitoring. Add hash chaining/checkpoints only if the verification and key-custody model is specified. | Restore and access-control exercises pass; key workflows have operational owners; audit records are useful and protected; launch cohort issues can be detected and supported. |
| 7. Scale and expansion | Evaluate automated EAC checks, agency bundles, featured listings, advanced anomaly detection, external signed checkpoints, retention tiers, diaspora payments, and regional expansion from usage and support evidence. | Each expansion has a measured need, cost/benefit, and assigned owner. |

Each stage should be split into small reviewable increments and sized with the actual team after Stage 0. A stage can take days or weeks; the original seven-day estimate should not be used as a delivery promise.

12.3 MVP feature priority

Must ship: agency and agent accounts with manual EAC review; public agent profiles and property listings; responsive search/detail pages; enquiry capture and agent lead inbox; agency/agent access boundaries; basic moderation and support; secure payment reconciliation before selling cards; essential audit trail and backups.

Pilot before broad launch: Gold Card physical fulfillment, agency bundle invoicing, and any policy that depends on real payment/refund behavior.

Defer until evidence supports the cost: Stripe, subagent tree depth beyond one level, realtime audit stream, anomaly scoring, Merkle checkpoints, cold audit archive automation, country-based session alerts, and elaborate per-transition animations. Keep meaningful loading, success, and recovery states from the start.

12.4 Important design corrections before implementation

· The data model needs a platform-admin identity instead of relying on agent roles for admins; agencies and people should have separate authentication identities or a clear shared identity model.
· A single `Agent.card` and unique `issuedToAgent` cannot support renewal stacking or history cleanly. Model card ownership/assignment and activation history explicitly before migrations.
· `RefreshToken` is not related to `Session` in the proposed schema. Prefer the selected auth library's supported session model unless there is a concrete reason to own token rotation.
· Enforce tenant ownership in server queries and database constraints where practical; hiding routes or checking a JWT role is insufficient. Define whether an agency admin may access leads created for its agents.
· The audit hash input must use canonical serialization and a transactionally assigned sequence. A hash chain alone is not tamper-proof if the same operator can rewrite the database and signing key; external checkpoints need separately controlled key custody and archive storage.
· IP location, continent changes, device fingerprints, and signed exports create privacy and false-positive risks. Collect only what has a defined security purpose, document retention, and provide human review.
· Do not promise EAC verification, legal compliance, or regulatory-grade immutability until the processes and technical controls have been validated with appropriate local stakeholders.

13. Risk Register

Risk Likelihood Impact Mitigation
Paynow webhook unreliability High High Polling fallback + idempotency keys + manual reconciliation view
EAC number fraud Medium High Manual review queue for first 90 days, then automated
Card code leak before activation Medium Medium Codes HMAC'd at rest, batch minting audited, activation rate-limited
Admin key compromise Low Critical Hardware 2FA, IP allowlist, impersonation audited, key rotation
Subagent abuse (spam listings) Medium Medium Rate limits per card, agency admin can suspend, audit trail
Session reuse undetected Low High Rotation with reuse detection, anomaly board

---

14. Compliance & Governance

· EAC Zimbabwe — agency and agent EAC numbers verified against the register; platform provides signed compliance exports on demand
· Data Protection Act (Zimbabwe, 2021) — data subject access requests handled through /admin/audit/exports
· POPIA (if SADC expansion) — data residency configured per region
· PCI-DSS — no card data touches PCZ servers; Paynow/Stripe handle all PAN storage
· Retention — audit events never deleted while under review; all other data retained 7 years

---

15. Definition of Done

A feature ships only when:

1. Every transition state is defined and implemented
2. Every write path emits an audit event
3. Every input is Zod-validated
4. Every role-gated route is tested for the three negative cases (wrong role, expired card, no session)
5. Every error state has a recovery path
6. The hash chain verifies cleanly after the feature's tests run

---

Core principle, unchanged:

"Give the agent the keys."
— and give the regulator the ledger.
