# Property Connect — UI/UX Specification

**Version:** v0.1
**Status:** Draft for review
**Lineage:** Structural spec inherited from Event Horizon Gallery. Visual language native to Property Connect.

---

## 1. Thesis

Property Connect is a **registry with a marketplace attached**, not a marketplace with a login. The visual language must make one promise visible on every screen:

> **The record is real. The seat is verified. The key is yours.**

Everything below — the primitives, the palette, the motion, the copy — exists to make that promise legible without a single explanatory sentence.

---

## 2. Inscription

The product's ritual line, rendered once on the landing and activation surfaces. Not a slogan. A seal.

> *Give the agent the keys.*
> *Give the regulator the ledger.*

**Treatment:** `mono.500`, uppercase, letter-spaced `0.14em`, 12px, centered, 48px below the wordmark on the landing page and above the fold on `/activate`. Never repeated elsewhere.

---

## 3. Motif

**The Registry.** Deeds, seals, keys, serials, ruled ledgers. Modern civic authority — not colonial revival, not kitsch. The room where land gets recorded.

Three native symbols carry the theme:

| Symbol | Meaning | Where it appears |
|---|---|---|
| **The Key** | Access conferred, card activated | Seal, activation state, `KeyIssued` |
| **The Ledger** | Audit chain, immutable record | Audit Hub, `RuleLine`, `SerialPlate` |
| **The Seal** | Verified state, approved identity | `Seal`, `StampBadge`, `SealCorner` |

---

## 4. The Graphite Rule

Event Horizon's constraint was **no color**. Property Connect's constraint is narrower and harder:

> **Graphite appears only where a key, card, or seal is being issued, verified, or viewed.** Never on primary buttons, links, focus rings, chart series, icons, or decoration. The moment graphite enters a surface, something official is happening.

This replaces the gold family from the business plan. Graphite is *not* a darker neutral — it is a specific material with a specific treatment (`emboss` shadow, `foil` border). A flat gray rectangle is never "graphite"; graphite is always treated.

The palette is therefore three families only:

- **White** — paper surfaces
- **Blue** — brand, interactive, accent
- **Gray** — hairlines, meta text, and (as *graphite*) the identity material

No other color exists in the system. Not warm red for errors, not green for success, not gold for cards. Error and success are expressed through **iconography and copy**, not hue.

---

## 5. Tokens

### 5.1 Color

```ts
// tailwind.config.ts
colors: {
  // ── Paper: surfaces ─────────────────────────
  paper: {
    50:  '#FCFCFD',   // page base
    100: '#F5F6F8',   // recessed panel, form rail
    200: '#ECEEF2',   // strong recess, empty state
  },

  // ── Ink: text ───────────────────────────────
  ink: {
    900: '#0A1424',   // primary text
    700: '#1B2536',   // secondary text
    500: '#4A5568',   // meta, labels
    300: '#94A0B0',   // placeholder, disabled
  },

  // ── Brand: interactive ──────────────────────
  brand: {
    50:  '#EEF3FB',   // hover background
    100: '#D9E4F5',   // selected background
    500: '#1E5FBF',   // default interactive
    700: '#0B3B8F',   // primary button, link
    900: '#052463',   // press state
  },

  // ── Graphite: identity material ─────────────
  // Used ONLY via .graphite-* utility classes.
  // Never referenced directly in component code.
  graphite: {
    100: '#EDEEF0',
    200: '#DBDDE2',
    300: '#C3C6CC',
    500: '#7E858F',
    700: '#4A4F57',
  },

  // ── Rule: hairlines ─────────────────────────
  rule: {
    default: '#DCE1E8',
    strong:  '#B8C0CC',
  },
}
```

### 5.2 Radii

```ts
borderRadius: {
  plate:   '4px',   // KeyPlate, DeedPlate, StampBadge
  control: '6px',   // buttons, inputs, chips, tabs
  seal:    '12px',  // Seal corners only
  pill:    '9999px',
}
```

Identity surfaces are **square** (`plate`). Interactive controls are **softly rounded** (`control`). This is a rule, not a preference — square = official, rounded = interactive.

### 5.3 Shadows

```ts
boxShadow: {
  // identity treatment — the only way graphite is rendered
  emboss: 'inset 0 1px 0 rgba(255,255,255,.72), 0 1px 2px rgba(10,20,36,.06)',
  foil:   '0 0 0 1px rgba(126,133,143,.28), 0 1px 2px rgba(10,20,36,.06)',

  // interactive
  control: '0 1px 2px rgba(10,20,36,.06)',
  focus:   '0 0 0 2px #EEF3FB, 0 0 0 4px #1E5FBF',

  // elevated surfaces
  plate:   '0 1px 2px rgba(10,20,36,.06)',
  panel:   '0 2px 8px rgba(10,20,36,.08)',
}
```

### 5.4 Spacing

4px baseline. Steps: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`. No off-grid values.

---

## 6. Typography

Four families, each with a defined *jurisdiction*. Cross-jurisdiction use is a bug.

| Role | Family | Used on | Weight / size |
|---|---|---|---|
| **Display** | Sora | Marketing headlines, dashboard section headers, page titles | 600, -0.02em tracking |
| **Deed** | Fraunces | `DeedPlate` headers, `Seal` labels, Gold Card surfaces, activation copy | 500, optical sizing on |
| **Serial** | JetBrains Mono | `SerialPlate`, EAC numbers, audit sequence numbers, timestamps, IP addresses | 500, uppercase, 0.08em tracking |
| **Body** | Inter | Everything else — UI copy, forms, tables, prose | 400 / 500 / 600 |

**The serif rule:** Fraunces appears **only** where a record, seal, or card is being displayed or conferred. It is a signal, like graphite. Body copy is never Fraunces.

**Fallbacks:** Sora → `ui-sans-serif, system-ui`; Fraunces → `Georgia, serif`; JetBrains Mono → `ui-monospace, monospace`; Inter → `system-ui, sans-serif`.

**If Fraunces feels too warm in practice**, substitute **Newsreader** or **Source Serif 4** — both hold the civic register with less personality.

---

## 7. Component Grammar

Five primitives define the system. Everything else composes from these.

### 7.1 `KeyPlate`

The universal frame for a curated object — a property card, an agent card, a ledger row, a checkpoint.

- Square corners (`plate` radius)
- 1px border in `rule.default`
- Background `paper.50`
- **Keyhole notch** in the top-right corner (12×12px, cut out of the border)
- Optional `SealCorner` (see 7.7) for verified states
- Hover: border → `brand.500/40`, no shadow shift
- Motion on mount: `plate-slide`

```tsx
<KeyPlate sealed>  {/* sealed = shows SealCorner */}
  {/* content */}
</KeyPlate>
```

### 7.2 `DeedPlate`

The registry-entry equivalent of Event Horizon's placard. Used in agent profiles, card views, agency binders, audit timelines.

- Square corners (`plate`)
- Header in `font-deed` (Fraunces), `ink.900`
- Below header: a `SerialPlate` line for any machine-readable ID
- Body: 1–3 sentences in `Inter`, `ink.700`
- Trailing meta: `ink.500`, 12px
- Left padding 20px, right padding 20px, top 16px, bottom 16px

### 7.3 `StampBadge`

The status surface. Approvals, states, verification.

- Square (`plate` radius)
- `graphite` treatment: `bg-graphite.100` + `shadow-emboss` + `border` `graphite.300`
- Text: `font-mono`, uppercase, 11px, `0.14em` tracking, `ink.700`
- Optional 2° rotation for "stamped" feel (see motion `stamp`)
- States are conveyed by label and icon, never color

```tsx
<StampBadge state="ACTIVATED" />
<StampBadge state="PENDING" />
<StampBadge state="SUSPENDED" />
```

### 7.4 `SeatMeter`

The live active-seat counter (analogue of Event Horizon's `OccupancyBadge`).

- Framed as a small registry dial
- Two-digit monospace value + label
- Renders only when a session is live
- Never animated between values — values **stamp** into place (see `stamp` motion)

### 7.5 `RuleLine`

The hairline divider.

- 1px `rule.default`
- Draws left-to-right on mount (`rule-draw` motion, 240ms)
- Variants: `inset` (16px each side), `full`, `short` (48px), `dotted`
- Used as form rail, section separator, list separator

### 7.6 `SerialPlate`

Any machine-readable identifier.

- `font-mono`, uppercase, 0.08em tracking, 12px
- Background `paper.100`, 1px inset border `rule.default`
- Padding 4px 8px, radius `plate`
- Optional **stamped** appearance: `shadow-emboss` inset
- Examples: `PCZ-2025-A7K9-3312`, `EAC/2024/01837`, audit `#00184729`

### 7.7 `Seal`

Verified state marker. The most ceremonial primitive.

- Square (`plate` radius), 32×32 or 48×48
- `graphite` treatment
- A keyhole or checkmark glyph embossed within
- Emboss motion on appearance (`emboss`, 320ms)
- **Only appears on:** activated card, approved agent, signed audit checkpoint, verified EAC record, sealed session

```tsx
<Seal kind="key" size="md" />
<Seal kind="check" size="sm" />
<Seal kind="ledger" size="md" />
```

### 7.8 `Keyhole`

The access glyph. Used as icon frame, input affix, and transition anchor.

- 12px, 16px, 20px, 24px sizes
- Stroke: 1.5px, `ink.700` or `brand.700`
- Used at: password field affix, activation serial input, "access granted" states, wait states

### 7.9 `KeyIssued`

The "you're in" surface — analogue of Event Horizon's `GrantedPass`.

- Full-width plate with `Seal` on left, message on right
- Appears on: activation success, session sealed, role approved
- Copy example: *"Your Gold Card is live. Welcome, {name}."*
- Dismisses into the page — never a modal

### 7.10 `RegistryForm`

The form primitives. Fields read like registry entries, not web forms.

- Label above field, `ink.700`, 12px, uppercase tracked
- Field: 1px bottom border `rule.default`, no box; focus → `brand.700`
- Helper text: `ink.500`, 12px, below field
- Error: icon (warning glyph) + text in `ink.900`; **no red**
- Success: `Seal` in field's trailing slot when validated
- Section breaks: `RuleLine` with an inline label

### 7.11 `RegistryQueue`

The waiting-state surface (analogue of `QueueTicker`).

- A small `DeedPlate` with sequence number, position, estimated wait
- Sequence in `font-mono`
- Copy is civic, not chatty: *"You are 12th in line. The registry will notify you when a seat opens."*

### 7.12 `SeatSentinel`

Invisible client. No UI unless a session event fires. On event, raises a `SecurityBanner`.

### 7.13 `SecurityBanner`

Top-of-viewport trust strip. Appears on sensitive surfaces (login, activation, payment, session management).

- Full-width, 40px tall
- Left: `Seal` (kind: check) + short trust copy: *"You're on a verified session."*
- Right: `SerialPlate` with current session ID prefix + `RuleLine`
- Never dismissible — it's a fact, not a notification

---

## 8. Motion

Motion vocabulary is **deliberate and weighty**. No springs, no bounce, no parallax, no gradient sweeps. If it feels like a consumer app, it's wrong.

Every motion below is one of five named effects. Use the token, not ad-hoc curves.

| Motion | Curve | Duration | Use |
|---|---|---|---|
| **Stamp** | `cubic-bezier(.2,0,.2,1)` | 180ms down, 120ms hold, 180ms up | Status changes, approvals, activation success, `StampBadge` landing, `SeatMeter` value updates |
| **Emboss** | `cubic-bezier(.2,0,0,1)` | 320ms | `Seal` appearance, `KeyIssued` reveal, card verification |
| **Key-turn** | `cubic-bezier(.4,0,.2,1)` | 240ms | Loading-state anchors, lock/unlock glyphs, activation state `minting` → `sealed` |
| **Rule-draw** | `cubic-bezier(.2,0,.2,1)` | 240ms | `RuleLine` entry, ledger row reveal, form rail appearance |
| **Plate-slide** | `cubic-bezier(.2,0,0,1)` | 280ms, overshoot ≤2% | `KeyPlate` entry, card reveal, list item entry |

**Reduced motion:** all five collapse to a 120ms opacity fade. Nothing else changes.

---

## 9. Layout & Grid

- **Baseline grid:** 4px
- **Content max-width:** 1200px (marketplace, marketing, workspace); 1440px (Audit Hub)
- **Gutters:** 24px (mobile), 32px (tablet), 48px (desktop)
- **Columns:** 12 on desktop, 6 on tablet, 2 on mobile
- **Vertical rhythm:** section gaps of 48/64/96 only
- **Containers:** `KeyPlate` always sits inside a grid cell — never full-bleed
- **Full-bleed surfaces** (hero, banner, audit feed) may break the grid but keep the gutter

The **Audit Hub** uses a 10-column monospace-aligned grid so sequence numbers, timestamps, and actor IDs line up vertically across rows.

---

## 10. Role Registers

One institution, four desks. Each role surface shifts the visual register without breaking the system.

| Surface | Register | Density | Graphite presence | Serif presence |
|---|---|---|---|---|
| **Buyer / marketplace** | Paper-forward, quiet | Medium | Only on verified-agent seals | Never |
| **Agent / subagent** | Ink-forward, working | High | On own Gold Card view + activation | On own card + seals |
| **Agency admin** | Ink-forward, binder-like | High | On agent binder entries + card assignment | On binder headers |
| **Platform admin / Audit Hub** | Ink-heavy, ledger | Very high | On every checkpoint seal + integrity view | On checkpoint headers |

**The Audit Hub is the theme's proof point.** If the audit surface looks like a data table with a nice font, the theme is decoration. If it looks like a *registry of record* — ruled rows, sequence numbers in mono, sealed checkpoints — the theme is doing its job.

---

## 11. Screen Inventory

### 11.1 Public

| Route | Primitive composition |
|---|---|
| `/` (marketplace) | Filter rail (`RuleLine` + `RegistryForm` selects) · `KeyPlate` grid · `Seal` on verified-agent cards only |
| `/properties/[id]` | `KeyPlate` hero · `DeedPlate` placard · agent `DeedPlate` · lead `RegistryForm` |
| `/agents/[id]` | `DeedPlate` profile · `Seal` for EAC verified · `KeyPlate` listing grid |
| `/activate` | `SecurityBanner` · `RegistryForm` (serial + code) · `KeyIssued` on success |

### 11.2 Auth

| Route | Composition |
|---|---|
| `/login` | `SecurityBanner` · `RegistryForm` · `Keyhole` in password field |
| `/register/agency` | `RegistryForm` multi-step · `RuleLine` between steps · `Seal` on step complete |
| `/register/agent` | Same + photo upload with `KeyPlate` preview |
| `/forgot-password` | `RegistryForm` only |

### 11.3 Agent workspace

| Route | Composition |
|---|---|
| `/agent/dashboard` | `SeatMeter` · `StampBadge` (card status) · recent leads as `KeyPlate` rows |
| `/agent/listings` | `KeyPlate` grid · `StampBadge` per state · `RegistryQueue` if pending |
| `/agent/listings/new` | `RegistryForm` · `RuleLine` sections |
| `/agent/leads` | Ledger-style rows: `RuleLine` separators, mono timestamps |
| `/agent/card` | Full `KeyPlate` Gold Card surface · `Seal` if activated · `SerialPlate` for serial |
| `/agent/subagents` | Agent-only. Binder list with `SealCorner` on approved. |
| `/agent/profile` | `DeedPlate` preview (how buyers see them) + edit form |

### 11.4 Agency admin

| Route | Composition |
|---|---|
| `/agency/dashboard` | `SeatMeter` per card tier · `KeyPlate` summary tiles |
| `/agency/agents` | Binder list — `DeedPlate` per agent, `SealCorner` on approved, `SerialPlate` for EAC |
| `/agency/cards` | Card inventory — every `KeyPlate` shows status via `StampBadge` |
| `/agency/billing` | Ledger-style invoice list |

### 11.5 Platform admin / Audit Hub

| Route | Composition |
|---|---|
| `/admin/audit` (live feed) | Full-width ledger rows · `SerialPlate` sequence · `RuleLine` between rows · SSE stream |
| `/admin/audit/timeline` | Vertical `RuleLine` spine · `DeedPlate` per event |
| `/admin/audit/integrity` | `Seal` on signed checkpoints · mono Merkle roots · one-click "verify chain" → `Stamp` |
| `/admin/audit/anomalies` | `StampBadge` per rule · severity by icon, not color |
| `/admin/cards/[serial]` | Full forensics: `SerialPlate` header · `RuleLine` timeline · `Seal` on every activation |
| `/admin/cards/mint` | `RegistryForm` · `KeyIssued` on mint complete |

---

## 12. Transition States

Every transition is narrative. States are defined as a small state machine per flow; each state has its own copy, motion, and error path. **No state lasts >30s without progressing or erroring.**

### 12.1 Copy table (extends plan §9)

| Flow | State | Copy | Motion |
|---|---|---|---|
| Signup (agency) | `validating` | "Checking your EAC registration…" | `rule-draw` on progress |
| | `creating` | "Registering your agency…" | `key-turn` on anchor glyph |
| | `seeding` | "Preparing your agency workspace…" | `rule-draw` sequential |
| | `done` | "Welcome. Your workspace is ready." | `emboss` on `Seal` |
| | `error_duplicate_eac` | "This EAC number is already on file. Contact support." | `stamp` on error badge |
| Signup (agent) | `uploading_photo` | "Uploading your professional photo…" | `key-turn` |
| | `pending_approval` | "Your agency has been notified. Approval usually takes under 24 hours." | `stamp` on pending badge |
| Card activation | `scanning` | "Reading your Gold Card…" | `key-turn` |
| | `verifying` | "Verifying serial and code…" | `rule-draw` on progress |
| | `minting` | "Minting your digital seat…" | `key-turn` |
| | `activating` | "Activating 365 days of access…" | `rule-draw` full |
| | `sealed` | "Your Gold Card is live. Welcome." | `emboss` on `KeyIssued` |
| | `error_code` | "That code didn't match. 4 attempts left." | `stamp` |
| | `error_locked` | "Too many attempts. Try again in 1 hour." | `stamp` |
| Login | `identifying` | "Identifying your account…" | `rule-draw` |
| | `verifying` | "Verifying credentials…" | `key-turn` |
| | `sealing` | "Sealing your session…" | `key-turn` full |
| | `routing` | "Taking you to your dashboard…" | `plate-slide` |
| | `error_invalid` | "Email or password is incorrect." | `stamp` |
| | `error_card_expired` | "Your Gold Card has expired. Renew to continue." | `stamp` |
| Logout | `revoking` | "Closing your session…" | `key-turn` |
| | `clearing` | "Clearing local data…" | `rule-draw` |
| | `done` | "You're signed out. See you soon." | `emboss` on `Seal` |
| Payment | `initiating` | "Preparing your secure checkout…" | `rule-draw` |
| | `redirecting` | "Taking you to Paynow…" | `key-turn` |
| | `awaiting` | "Waiting for confirmation from Paynow…" | `key-turn` loop, 90s cap |
| | `confirmed` | "Payment confirmed. Minting your Gold Card…" | `stamp` |
| | `receipt` | "A receipt has been emailed to you." | `emboss` |
| | `error_timeout` | "We didn't hear back from Paynow. Check your email — we'll confirm within 5 minutes." | `stamp` |
| Session | `reuse_detected` | "For your security, we've signed you out. Please sign in again." | Modal, non-dismissible, `SecurityBanner` |
| | `fp_mismatch` | "We noticed a change in your device. Please confirm your password." | Modal, `SecurityBanner` |
| | `expired` | "Your session ended. Sign in to continue." | `stamp` |

### 12.2 Implementation contract

Every state has:

- A React component: `<Transition flow="card.activation" state="minting" />`
- A Zod enum shared client ↔ server
- A server action returning `{ state, message?, redirect? }`
- A timeout guard (30s → error state)
- A safe escape (user can navigate away except during `sealing` and `minting`, which take <1s)

---

## 13. Accessibility

- **Contrast:** all text ≥4.5:1; `ink.500` on `paper.50` verified at 7.1:1; `brand.700` on `paper.50` at 9.8:1
- **Focus:** `shadow-focus` ring (2px `brand.50` + 2px `brand.500`); never removed, never `outline: none`
- **Color independence:** every state (active, pending, error, success, verified) is conveyed by icon + label + shape, never hue alone. This is not optional — the palette forbids it.
- **Motion:** all five motions honor `prefers-reduced-motion` (collapse to 120ms fade)
- **Live regions:** `SeatMeter` updates, `RegistryQueue` position changes, and `KeyIssued` appearance announce via `aria-live="polite"`
- **Forms:** every field has a visible label; `aria-describedby` for helper and error; error icon paired with text
- **Modals:** focus trap; `Escape` closes except for security modals (12.1 Session), which require sign-in

---

## 14. Iconography

- **Library:** Lucide, 1.5px stroke
- **Sizes:** 12, 16, 20, 24
- **Color:** `ink.700` default, `brand.700` when interactive
- **Custom glyphs:** `keyhole`, `seal-key`, `seal-check`, `seal-ledger` — drawn to the same 1.5px stroke spec, 24×24 viewBox
- **Never** use an icon to convey state without a label; icons decorate, labels inform

---

## 15. Anti-patterns

Explicitly forbidden. Reviewers should reject PRs that introduce any of these:

1. **Gold, brass, warm metallic, or any yellow/orange accent.** The card is called Gold; it renders in graphite. (See §16 decision 1.)
2. **Red or green semantic colors.** Errors and success are iconographic.
3. **Gradients** on any surface, except `brand-fade` for hero headers only — never on identity surfaces.
4. **Rounded identity surfaces.** `KeyPlate`, `DeedPlate`, `StampBadge`, `Seal`, `SerialPlate` are square.
5. **Serif outside deed contexts.** Fraunces in body copy, buttons, or nav is a bug.
6. **Bounce / spring / parallax.** Motion is one of the five named effects.
7. **Graphite on a button, link, focus ring, or icon** unless the element is itself a key, card, or seal.
8. **Emoji.** Anywhere.
9. **Full-bleed identity surfaces.** A `KeyPlate` is never wider than its grid container.
10. **"Delightful" microcopy.** Copy is civic. *"Sealing your session…"*, not *"Almost there! 🎉"*.

---

## 16. Open Decisions

Marked `[decision pending]` until resolved. Do not ship a screen that depends on one.

1. **Gold Card visual identity.** The physical card is named "Gold." Its digital representation in this spec is graphite on paper. Two options:
   - **A. Digital = graphite** (recommended — palette discipline holds; the name refers to the physical edition)
   - **B. Digital = brand blue plate with graphite seals** (the card is a *blue* artifact; keeps a distinct "card" feel without breaking the palette)
   - `[decision pending]`

2. **Landing page default.** Does `/` open as a **registry hall** (paper, ruled filter rail, quiet `KeyPlate` grid — recommended) or a **showcase** (imagery-forward, `KeyPlate` tiles with property photos dominating)? `[decision pending]`

3. **Fraunces lock-in.** If the serif reads too warm in practice, do we swap to Newsreader or Source Serif 4 — or drop serif entirely and rely on mono + Sora? `[decision pending]`

4. **Audit Hub density.** Full registry treatment (ruled ledger, sealed checkpoints, mono sequence) from day one, or "readable tables first, dress later"? Recommended: full registry treatment on `/admin/audit/integrity` and `/admin/cards/[serial]` at minimum — these are the surfaces that earn external trust. `[decision pending]`

5. **`SecurityBanner` scope.** Appears on login, activation, payment, session management. Should it also appear on the agent dashboard (persistent trust signal) or be limited to sensitive moments? Recommended: limited to sensitive moments. `[decision pending]`

---

## 17. Changelog

- **v0.1** — First draft. Theme: The Registry. Palette: white + brand blue + graphite (replaces gold). Five-primitive grammar. Five-motion vocabulary. Four role registers. Screen inventory, transition states, accessibility, anti-patterns, open decisions.

---

**End of specification.**
Reviewers: read §1, §4, and §16 first. Everything else follows from those three.