import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowRight, BadgeCheck, ChevronDown, CreditCard, Files, Fingerprint, Gauge, KeyRound, ListChecks, Users } from "lucide-react";
import { ApiError } from "@/lib/errors";
import { requirePlatformAdmin, requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit/chain";
import { listCardPlans } from "@/lib/services/cards";
import { AgencyPropertyControl, AuditLiveFeed, LeadStatusControl, AdminCardControls, ReviewControls, ChainVerifyAction, UserSuspensionControl } from "@/components/workspace-actions";
import { AdminMintForm, AgentProfileEditor, AgentResubmissionForm, CardPlanForm, CheckoutButton, InvitationForm, PropertyEditor } from "@/components/registry-forms";
import { AgencyCardPanel } from "@/components/card-workflows";
import { DeedPlate, KeyPlate, RuleLine, SeatMeter, SerialPlate, StampBadge, SecurityBanner } from "@/components/identity";
import type { Prisma } from "@/generated/prisma/client";

type Kind = "agent" | "agency" | "admin";
type AgentWorkspaceProfile = Prisma.AgentProfileGetPayload<{ include: { agency: true; subagents: true } }>;
type Props = { kind: Kind; section?: string[] };
type DisplayRecord = { title: string; subtitle: string; status?: string; href?: string; meta?: string; reviewEndpoint?: string; reviewActions?: ("approve" | "reject" | "suspend" | "restore")[] };

const navByKind: Record<Kind, { href: string; label: string; icon: typeof Gauge }[]> = {
  agent: [
    { href: "/agent/dashboard", label: "Dashboard", icon: Gauge },
    { href: "/agent/listings", label: "My listings", icon: Files },
    { href: "/agent/listings/new", label: "Create listing", icon: ListChecks },
    { href: "/agent/leads", label: "Enquiries", icon: Users },
    { href: "/agent/card", label: "Gold Card", icon: CreditCard },
    { href: "/agent/subagents", label: "Subagents", icon: BadgeCheck },
    { href: "/agent/profile", label: "My profile", icon: Fingerprint },
  ],
  agency: [
    { href: "/agency/dashboard", label: "Dashboard", icon: Gauge },
    { href: "/agency/agents", label: "Agents", icon: Users },
    { href: "/agency/properties", label: "Properties", icon: Files },
    { href: "/agency/leads", label: "Enquiries", icon: ListChecks },
    { href: "/agency/cards", label: "Cards", icon: CreditCard },
    { href: "/agency/billing", label: "Billing", icon: KeyRound },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Overview", icon: Gauge },
    { href: "/admin/agencies", label: "Agencies", icon: Users },
    { href: "/admin/agents", label: "Agents", icon: BadgeCheck },
    { href: "/admin/users", label: "User accounts", icon: Fingerprint },
    { href: "/admin/cards", label: "Cards", icon: CreditCard },
    { href: "/admin/cards/mint", label: "Mint card", icon: KeyRound },
    { href: "/admin/audit", label: "Live audit", icon: ListChecks },
    { href: "/admin/audit/timeline", label: "Timeline", icon: Files },
    { href: "/admin/audit/anomalies", label: "Anomalies", icon: Fingerprint },
    { href: "/admin/audit/integrity", label: "Integrity", icon: BadgeCheck },
    { href: "/admin/audit/exports", label: "Exports", icon: Files },
  ],
};

const titles: Record<string, string> = {
  dashboard: "Workspace overview", agencies: "Agency applications", agents: "Agent records", users: "User accounts",
  cards: "Gold Card register", "cards/mint": "Mint a digital card", audit: "Live audit feed",
  "audit/timeline": "Audit timeline", "audit/anomalies": "Audit anomalies",
  "audit/integrity": "Audit integrity", "audit/exports": "Audit exports",
  listings: "My property records", "listings/new": "Create a listing", leads: "Enquiries",
  card: "Gold Card", subagents: "Subagent records", profile: "Your professional record",
  properties: "Agency properties", billing: "Agency billing",
};

function WorkspaceRecords({ rows, empty = "No records are available." }: { rows: DisplayRecord[]; empty?: string }) {
  if (!rows.length) return <div className="border border-graphite-200 bg-paper-100 p-6 text-sm text-ink-500">{empty}</div>;
  return <div className="divide-y divide-graphite-200 border-y border-graphite-200">{rows.map((row) => <article key={row.title + row.subtitle} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium text-ink-900">{row.href ? <Link href={row.href} className="underline decoration-graphite-300 underline-offset-4 hover:text-brand-700">{row.title}</Link> : row.title}</h3>{row.status ? <StampBadge state={row.status} /> : null}</div><p className="mt-1 text-xs text-ink-500">{row.subtitle}{row.meta ? " · " + row.meta : ""}</p></div>{row.reviewEndpoint ? <ReviewControls endpoint={row.reviewEndpoint} actions={row.reviewActions} /> : null}</article>)}</div>;
}

function StatTile({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="border border-graphite-200 bg-paper-50 p-4"><p className="text-xs text-ink-500">{label}</p><p className="mt-2 font-deed text-3xl text-ink-900">{value}</p><p className="mt-1 text-xs text-ink-500">{detail}</p></div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className="mb-7"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">{eyebrow}</p><h1 className="mt-2 font-deed text-3xl font-medium text-ink-900 sm:text-4xl">{title}</h1>{description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">{description}</p> : null}</div>;
}

export async function WorkspacePage({ kind, section = ["dashboard"] }: Props) {
  const path = section.length ? section.join("/") : "dashboard";
  const requestHeaders = await headers();
  let user;
  try { user = await requireUser(requestHeaders); } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }

  let profile: AgentWorkspaceProfile | null = null;
  let memberships: { agencyId: string; role: "AGENCY_ADMIN" | "AGENCY_STAFF"; agency: { id: string; name: string; status: string } }[] = [];
  if (kind === "admin") {
    if (user.globalRole !== "platform_admin") return <Denied title="Platform administrator access required." />;
    if (!user.twoFactorEnabled) return <Denied title="Two-factor authentication is required." detail="Enable your authenticator before opening the platform administration workspace." link="/account/security" />;
    await requirePlatformAdmin(requestHeaders);
  } else if (kind === "agent") {
    profile = await prisma.agentProfile.findUnique({ where: { userId: user.id }, include: { agency: true, subagents: true } });
    if (!profile) return <Denied title="No agent profile is linked to this account." detail="Use your agency invitation to submit an agent profile." link="/register/agent" />;
  } else {
    memberships = await prisma.agencyMembership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { agency: { select: { id: true, name: true, status: true } } },
    });
    if (!memberships.length) return <Denied title="Agency administrator access required." detail="This workspace is available to an active named agency administrator account." />;
  }

  const agencyIds = kind === "agency" ? memberships.map((membership) => membership.agencyId) : profile ? [profile.agencyId] : [];
  const displayTitle = titles[path] ?? (path.startsWith("cards/") ? "Gold Card forensics" : path.startsWith("agents/") ? "Agent record" : "Workspace record");
  const agencyRole = memberships[0]?.role;
  const nav = kind === "agency" && agencyRole === "AGENCY_STAFF" ? navByKind.agency.filter((item) => item.href !== "/agency/billing") : navByKind[kind];
  const renderNavItems = () => nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={href === "/" + kind + "/" + path ? "page" : undefined} className="flex min-h-11 items-center gap-2 px-3 text-sm text-ink-700 hover:bg-paper-50 aria-[current=page]:bg-paper-50 aria-[current=page]:font-semibold"><Icon size={16} strokeWidth={1.6} />{label}</Link>);
  return <div className="mx-auto grid min-h-[70vh] max-w-[1440px] gap-6 px-4 py-5 sm:px-7 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-9">
    <aside className="border border-graphite-200 bg-paper-100 p-3 lg:sticky lg:top-[88px] lg:h-fit">
      <div className="flex items-center justify-between px-2 py-1"><div><p className="font-mono text-[9px] uppercase tracking-[.15em] text-ink-500">Property Connect</p><p className="mt-1 truncate text-xs font-semibold text-ink-900">{user.name}</p></div><span className="font-mono text-[9px] uppercase tracking-[.1em] text-ink-500 lg:hidden">{kind}</span></div>
      <details className="group mt-2 border-t border-graphite-200 pt-2 lg:hidden">
        <summary aria-label="Open workspace navigation" className="flex min-h-11 list-none cursor-pointer items-center justify-between gap-3 px-3 text-sm font-medium text-ink-800 hover:bg-paper-50 focus-visible:bg-paper-50 [&::-webkit-details-marker]:hidden"><span className="truncate">{displayTitle}</span><ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" /></summary>
        <nav aria-label="Workspace navigation" className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">{renderNavItems()}</nav>
      </details>
      <nav aria-label="Workspace navigation" className="mt-3 hidden grid-cols-1 gap-1 lg:grid">{renderNavItems()}</nav>
    </aside>
    <main className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-graphite-200 pb-4"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">{kind === "admin" ? "Platform register" : kind === "agency" ? memberships[0]?.agency.name : profile?.agency.name}</p><p className="mt-1 text-xs text-ink-500">{user.email}</p></div><span className="font-mono text-[10px] uppercase tracking-[.12em] text-ink-500">{kind === "admin" ? "PLATFORM ADMIN" : kind === "agency" ? agencyRole?.replace("_", " ") : "AGENT SEAT"}</span></header>
      <div className="pt-7"><PageContent kind={kind} path={path} user={user} profile={profile} agencyIds={agencyIds} title={displayTitle} agencyRole={agencyRole} /></div>
    </main>
  </div>;
}

function Denied({ title, detail, link }: { title: string; detail?: string; link?: string }) {
  return <main className="mx-auto max-w-2xl px-5 py-16"><DeedPlate title={title}><p>{detail ?? "Your account does not have permission to open this record."}</p>{link ? <Link href={link} className="mt-4 inline-flex items-center gap-2 font-sans text-xs font-medium text-brand-700 underline underline-offset-4">Continue <ArrowRight size={14} /></Link> : null}</DeedPlate></main>;
}

async function PageContent({ kind, path, user, profile, agencyIds, title, agencyRole }: {
  kind: Kind; path: string; user: { id: string; name: string; email: string }; profile: AgentWorkspaceProfile | null; agencyIds: string[]; title: string; agencyRole?: "AGENCY_ADMIN" | "AGENCY_STAFF";
}) {
  if (kind === "admin") return adminContent(path, user, title);
  if (kind === "agency") return agencyContent(path, agencyIds, title, agencyRole);
  if (!profile) return null;
  return agentContent(path, user, profile, title);
}

async function adminContent(path: string, user: { id: string; name: string; email: string }, title: string) {
  if (path === "dashboard") {
    const [agencies, agents, properties, cards, head, pending] = await Promise.all([
      prisma.agency.count(), prisma.agentProfile.count(), prisma.property.count(), prisma.goldCard.count(),
      prisma.auditChainHead.findUnique({ where: { id: "global" } }),
      prisma.agency.count({ where: { status: "PENDING_REVIEW" } }),
    ]);
    return <><PageHeading eyebrow="Platform record" title={title} description="Review agency and agent registrations, manage digital seats and inspect the integrity log." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatTile label="Agencies" value={agencies} detail={pending + " awaiting review"} /><StatTile label="Agent profiles" value={agents} detail="Named professional records" /><StatTile label="Property records" value={properties} detail="All listing states" /><StatTile label="Digital cards" value={cards} detail="Minted, assigned and active" /></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_.8fr]"><DeedPlate title="Audit chain head" serial={"#" + (head?.sequence ?? 0n).toString().padStart(8, "0")}><p className="break-all font-mono text-[10px]">{head?.lastHash || "No audited writes recorded yet."}</p></DeedPlate><DeedPlate title="Administrator account"><p>{user.name} · {user.email}</p><p className="mt-2">Authenticator MFA is enabled for this session.</p></DeedPlate></div></>;
  }
  if (path === "agencies") {
    const agencies = await prisma.agency.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, include: { _count: { select: { agents: true, properties: true } } } });
    const rows = agencies.map((item) => ({ title: item.name, subtitle: item.eacRegistrationNumber + " · " + item.email, status: item.status, meta: item._count.agents + " agents, " + item._count.properties + " properties", reviewEndpoint: item.status === "PENDING_REVIEW" ? "/api/admin/agencies/" + item.id + "/review" : undefined }));
    return <><PageHeading eyebrow="Manual EAC review" title={title} description="Agency applications are reviewed by a platform administrator before an agency can invite named staff." /><WorkspaceRecords rows={rows} empty="No agency records have been submitted." /></>;
  }
  if (path === "agents") {
    const agents = await prisma.agentProfile.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, include: { agency: { select: { name: true } } } });
    const rows = agents.map((item) => ({
      title: item.fullName,
      subtitle: item.eacRegistrationNumber + " · " + item.agency.name,
      status: item.status,
      meta: item.phone,
      reviewEndpoint: item.status === "REJECTED" ? undefined : "/api/admin/agents/" + item.id + "/review",
      reviewActions: item.status === "PENDING_REVIEW" ? ["approve", "reject"] as ("approve" | "reject")[]
        : item.status === "ACTIVE" ? ["suspend"] as ("suspend")[]
          : item.status === "SUSPENDED" ? ["restore"] as ("restore")[] : undefined,
    }));
    return <><PageHeading eyebrow="Manual EAC review" title={title} description="Review agent registration against the submitted EAC details and active agency membership." /><WorkspaceRecords rows={rows} empty="No agent applications have been submitted." /></>;
  }
  if (path === "cards") {
    const [cards, plans] = await Promise.all([
      prisma.goldCard.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { plan: { select: { name: true } }, owner: { select: { name: true, email: true } }, agentProfile: { select: { fullName: true } } } }),
      listCardPlans(true),
    ]);
    const rows = cards.map((card) => ({ title: card.serial, subtitle: card.owner?.name ?? card.agentProfile?.fullName ?? card.owner?.email ?? "Unassigned digital card", status: card.status, meta: card.plan.name, href: "/admin/cards/" + card.serial }));
    return <><PageHeading eyebrow="Card register" title={title} description="Manage plan availability and approved prices, then inspect card ownership and state. Activation codes are stored only as keyed hashes." /><div className="mb-7 grid gap-4 xl:grid-cols-2"><div className="border border-graphite-200 bg-paper-50 p-5"><h2 className="mb-4 font-deed text-xl">Create card plan</h2><CardPlanForm /></div>{plans.length ? <div className="space-y-4">{plans.map((plan) => <details key={plan.id} className="border border-graphite-200 bg-paper-50 p-5"><summary className="cursor-pointer text-sm font-medium">{plan.name} · {plan.code} · {plan.priceApproved ? "Price approved" : "Price pending"}</summary><div className="mt-4"><CardPlanForm plan={{ ...plan, description: plan.description, priceAmount: plan.priceAmount?.toString() ?? null }} /></div></details>)}</div> : null}</div><WorkspaceRecords rows={rows} empty="No digital cards have been minted." /></>;
  }
  if (path === "users") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" }, take: 250,
      select: {
        id: true, name: true, email: true, globalRole: true, isSuspended: true,
        twoFactorEnabled: true, createdAt: true,
        memberships: { where: { status: "ACTIVE" }, select: { role: true, agency: { select: { name: true } } } },
        agentProfile: { select: { fullName: true, status: true } },
      },
    });
    return <><PageHeading eyebrow="Named account register" title={title} description="Suspend compromised or ineligible accounts, or restore access after review. Suspending clears active sessions and records an audit event." /><div className="divide-y divide-graphite-200 border-y border-graphite-200">{users.map((account) => <article key={account.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-medium text-ink-900">{account.name}</h2><StampBadge state={account.isSuspended ? "SUSPENDED" : "ACTIVE"} /></div><p className="mt-1 text-xs text-ink-500">{account.email} · {account.globalRole} · MFA {account.twoFactorEnabled ? "enabled" : "not enabled"}</p><p className="mt-1 text-xs text-ink-500">{account.agentProfile ? account.agentProfile.fullName + " · agent " + account.agentProfile.status : account.memberships.map((membership) => membership.agency.name + " · " + membership.role).join(", ") || "Buyer account"} · joined {account.createdAt.toLocaleDateString()}</p></div><UserSuspensionControl endpoint={"/api/admin/users/" + account.id} isSuspended={account.isSuspended} /></article>)}</div></>;
  }
  if (path === "cards/mint") {
    const [agencies, agents] = await Promise.all([
      prisma.agency.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.agentProfile.findMany({ where: { status: "ACTIVE", agency: { status: "ACTIVE" }, user: { emailVerified: true, isSuspended: false } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, eacRegistrationNumber: true, agencyId: true } }),
    ]);
    return <><PageHeading eyebrow="Platform action" title={title} description="The activation code is shown once after minting. Deliver it through a secure channel to the intended agent or agency administrator." /><div className="max-w-2xl border border-graphite-200 bg-paper-50 p-5 sm:p-7"><AdminMintForm agencies={agencies} agents={agents} /></div></>;
  }
  if (path.startsWith("cards/")) {
    const serial = path.slice("cards/".length);
    const [card, agents] = await Promise.all([
      prisma.goldCard.findUnique({ where: { serial }, include: { plan: true, owner: { select: { name: true, email: true } }, agency: { select: { name: true } }, agentProfile: { select: { id: true, fullName: true, eacRegistrationNumber: true } }, payments: { include: { plan: true, term: true }, orderBy: { createdAt: "desc" } }, terms: { orderBy: { startsAt: "asc" } } } }),
      prisma.agentProfile.findMany({ where: { status: "ACTIVE", agency: { status: "ACTIVE" }, user: { emailVerified: true, isSuspended: false } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, agency: { select: { name: true } } } }),
    ]);
    if (!card) return <Denied title="Card record not found." />;
    const events = await prisma.auditEvent.findMany({ where: { entityType: "GoldCard", entityId: card.id }, orderBy: { sequence: "asc" } });
    return <><PageHeading eyebrow="Card forensics" title={card.serial} description="Recorded card issuance, activation, renewals, assignment, suspension and payment state." /><div className="grid gap-5 lg:grid-cols-2"><KeyPlate sealed={card.status === "ACTIVE"}><p className="font-mono text-[10px] uppercase tracking-[.14em] text-paper-300">Digital Gold Card · {card.plan.name}</p><p className="mt-10 font-deed text-3xl">Professional seat</p><div className="mt-3"><SerialPlate>{card.serial}</SerialPlate></div><div className="mt-6"><StampBadge state={card.status === "ACTIVE" && card.expiresAt && card.expiresAt <= new Date() ? "EXPIRED" : card.status} /></div></KeyPlate><DeedPlate title="Ownership record"><p>Owner: {card.owner?.name ?? "Unassigned"}</p><p className="mt-2">Agent: {card.agentProfile?.fullName ?? "Unassigned"}</p><p className="mt-2">Agency: {card.agency?.name ?? "—"}</p><p className="mt-2">Created: {card.createdAt.toLocaleString()}</p><p className="mt-2">Plan term: {card.durationDaysSnapshot} days</p><p className="mt-2">Activated: {card.activatedAt?.toLocaleString() ?? "Not activated"}</p><p className="mt-2">Expires: {card.expiresAt?.toLocaleString() ?? "Not activated"}</p><p className="mt-2">Suspended: {card.suspendedAt?.toLocaleString() ?? "No"}</p></DeedPlate></div><RuleLine label="PAYMENT & TERM HISTORY" /><WorkspaceRecords rows={card.payments.map((payment) => ({ title: payment.plan.name + " · " + payment.currency + " " + payment.amount.toString(), subtitle: payment.providerReference ?? payment.id, status: payment.status, meta: payment.paidAt?.toLocaleString() ?? payment.createdAt.toLocaleString() }))} empty="No payments are attached to this card." />{card.terms.length ? <div className="mt-5"><WorkspaceRecords rows={card.terms.map((term) => ({ title: term.source.replaceAll("_", " ") + " · " + term.durationDays + " days", subtitle: term.startsAt.toLocaleString() + " → " + term.endsAt.toLocaleString(), status: term.status }))} /></div> : null}<RuleLine label="CARD TIMELINE" /><WorkspaceRecords rows={events.map((event) => ({ title: event.action, subtitle: event.occurredAt.toLocaleString(), meta: "#" + event.sequence.toString().padStart(8, "0") }))} empty="No card events have been written." /><div className="mt-5"><AdminCardControls endpoint={"/api/admin/cards/" + card.serial} status={card.status === "ACTIVE" && card.expiresAt && card.expiresAt <= new Date() ? "EXPIRED" : card.status} agents={agents.map((agent) => ({ id: agent.id, fullName: agent.fullName, agencyName: agent.agency.name }))} /></div></>;
  }
  if (path === "audit" || path === "audit/timeline") {
    const events = await prisma.auditEvent.findMany({ orderBy: { sequence: "desc" }, take: 100 });
    const initial = events.map((event) => ({ sequence: event.sequence.toString(), action: event.action, entityType: event.entityType, entityId: event.entityId, occurredAt: event.occurredAt.toISOString(), hash: event.hash }));
    return <><PageHeading eyebrow="Registry of record" title={path === "audit" ? "Live audit feed" : title} description="Transactionally ordered events from the canonical hash chain." />{path === "audit" ? <SecurityBanner /> : null}<div className="mt-5 border border-graphite-200 bg-paper-50 px-4"><AuditLiveFeed initial={initial} /></div></>;
  }
  if (path === "audit/integrity") {
    const [head, checkpoints, verification] = await Promise.all([
      prisma.auditChainHead.findUnique({ where: { id: "global" } }),
      prisma.auditCheckpoint.findMany({ orderBy: { toSequence: "desc" }, take: 90 }),
      verifyAuditChain(),
    ]);
    return <><PageHeading eyebrow="Proof and verification" title={title} description="Signed Merkle checkpoints are queued for a managed KMS signature and a retention-locked archive." /><div className="grid gap-4 md:grid-cols-2"><DeedPlate title="Current chain" serial={"#" + (head?.sequence ?? 0n).toString().padStart(8, "0")}><p className="break-all font-mono text-[10px]">{head?.lastHash || "No events yet."}</p></DeedPlate><DeedPlate title="Current verification"><p>{verification.valid ? "Hash chain intact" : "Verification failed"}</p><p className="mt-2 font-mono text-xs">{verification.checked.toString()} events checked</p></DeedPlate></div><div className="mt-5"><ChainVerifyAction /></div><RuleLine label="SIGNED CHECKPOINTS" /><WorkspaceRecords rows={checkpoints.map((item) => ({ title: item.merkleRoot, subtitle: "Sequences " + item.fromSequence + "–" + item.toSequence, meta: item.archivedAt ? "Archived " + item.archivedAt.toLocaleDateString() : "Archive pending", status: item.archivedAt ? "ARCHIVED" : "PENDING" }))} empty="No signed checkpoints have been created." /></>;
  }
  if (path === "audit/anomalies") {
    const events = await prisma.auditEvent.findMany({ where: { action: { in: ["payment.requires_review", "card.activation_code_rejected", "card.revoked", "agency.suspend", "agent.suspend", "audit.chain_verification_failed"] } }, orderBy: { sequence: "desc" }, take: 200 });
    return <><PageHeading eyebrow="Review queue" title={title} description="Events requiring operator attention. State is conveyed with labels and record details." /><WorkspaceRecords rows={events.map((event) => ({ title: event.action, subtitle: event.entityType + " · " + event.entityId, status: "REVIEW", meta: event.occurredAt.toLocaleString() }))} empty="No audit anomalies are currently recorded." /></>;
  }
  if (path === "audit/exports") return <><PageHeading eyebrow="Audit archive" title={title} description="Export the signed event records as JSON together with the current chain verification result." /><a href="/api/admin/audit/exports" className="inline-flex min-h-11 items-center border border-ink-900 bg-ink-900 px-4 text-sm font-medium text-white hover:bg-brand-900">Download audit export</a></>;
  return <Denied title="This administration route is not available." />;
}

async function agencyContent(path: string, agencyIds: string[], title: string, agencyRole?: "AGENCY_ADMIN" | "AGENCY_STAFF") {
  const whereAgency = { agencyId: { in: agencyIds } };
  if (agencyRole === "AGENCY_STAFF" && path === "billing") return <Denied title="Agency administrator access required." />;
  if (path === "dashboard") {
    const [agents, properties, leads, cards] = await Promise.all([
      prisma.agentProfile.count({ where: whereAgency }), prisma.property.count({ where: whereAgency }),
      prisma.enquiry.count({ where: whereAgency }), prisma.goldCard.count({ where: whereAgency }),
    ]);
    const activeCards = await prisma.goldCard.count({ where: { ...whereAgency, status: "ACTIVE", expiresAt: { gt: new Date() } } });
    return <><PageHeading eyebrow="Agency register" title={title} description="Manage named agency staff and review your properties, enquiries, and digital seat inventory." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatTile label="Agent records" value={agents} detail="Named staff profiles" /><StatTile label="Property records" value={properties} detail="Across your agencies" /><StatTile label="Buyer enquiries" value={leads} detail="Visible to your administrators" /><StatTile label="Active cards" value={activeCards} detail={cards + " total cards"} /></div><div className="mt-6"><SeatMeter used={activeCards} capacity={cards || 1} label="Active card seats" /></div></>;
  }
  if (path === "agents") {
    const [agents, agencies] = await Promise.all([
      prisma.agentProfile.findMany({ where: whereAgency, orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { email: true } }, _count: { select: { properties: true, enquiries: true } } } }),
      prisma.agency.findMany({ where: { id: { in: agencyIds } }, select: { id: true, name: true, status: true } }),
    ]);
    const canInvite = agencies.some((agency) => agency.status === "ACTIVE");
    return <><PageHeading eyebrow="Agency binder" title={title} description="Named staff membership, EAC status and the records associated with each agent." />{agencyRole === "AGENCY_ADMIN" ? <div className="mb-6 max-w-xl border border-graphite-200 bg-paper-50 p-5"><h2 className="mb-3 font-deed text-xl">Invite a named agent</h2><InvitationForm invitationType="agency" canSend={canInvite} canResend={canInvite} canManage disabledReason="Agent invitations can be sent after the agency is approved and active." manageMessage="The agency is not active. You can review or revoke existing invitations, but cannot resend them." /></div> : null}<WorkspaceRecords rows={agents.map((agent) => ({ title: agent.fullName, subtitle: agent.eacRegistrationNumber + " · " + agent.user.email, status: agent.status, meta: agent._count.properties + " listings · " + agent._count.enquiries + " enquiries", href: "/agency/agents/" + agent.id, reviewEndpoint: agencyRole === "AGENCY_ADMIN" && (agent.status === "ACTIVE" || agent.status === "SUSPENDED") ? "/api/agency/agents/" + agent.id + "/status" : undefined, reviewActions: agent.status === "ACTIVE" ? ["suspend"] as ("suspend")[] : agent.status === "SUSPENDED" ? ["restore"] as ("restore")[] : undefined }))} empty={"No named agents in " + agencies.map((agency) => agency.name).join(", ") + " yet."} /></>;
  }
  if (path.startsWith("agents/")) {
    const id = path.slice("agents/".length);
    const agent = await prisma.agentProfile.findFirst({ where: { id, agencyId: { in: agencyIds } }, include: { user: { select: { name: true, email: true } }, properties: { orderBy: { createdAt: "desc" }, take: 30 }, cards: { orderBy: { createdAt: "desc" }, take: 10 } } });
    if (!agent) return <Denied title="Agent record not found in this agency." />;
    return <><PageHeading eyebrow="Agency agent record" title={agent.fullName} description={agent.eacRegistrationNumber} /><div className="grid gap-5 lg:grid-cols-2"><DeedPlate title="Named account"><p>{agent.user.name} · {agent.user.email}</p><p className="mt-2">Phone: {agent.phone}</p><p className="mt-2">Joined: {agent.createdAt.toLocaleDateString()}</p></DeedPlate><DeedPlate title="EAC review"><p>Status: {agent.status}</p><p className="mt-2">{agent.reviewNotes ?? "No review notes recorded."}</p></DeedPlate></div><RuleLine label="LISTINGS & CARDS" /><WorkspaceRecords rows={[...agent.properties.map((item) => ({ title: item.title, subtitle: item.city, status: item.status })), ...agent.cards.map((card) => ({ title: card.serial, subtitle: "Digital Gold Card", status: card.status }))]} empty="No listings or cards are attached." /></>;
  }
  if (path === "properties") {
    const properties = await prisma.property.findMany({ where: whereAgency, orderBy: { updatedAt: "desc" }, take: 200, include: { agentProfile: { select: { fullName: true } } } });
    return <><PageHeading eyebrow="Agency property register" title={title} description="Listings remain owned by their named agent. Agency staff can edit, archive, or republish records; publishing requires the owner to have an active professional card." /><div className="divide-y divide-graphite-200 border-y border-graphite-200">{properties.map((item) => <article key={item.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><h2 className="text-sm font-medium text-ink-900"><Link href={"/agency/properties/" + item.id} className="underline decoration-graphite-300 underline-offset-4">{item.title}</Link></h2><p className="mt-1 text-xs text-ink-500">{item.city} · {item.agentProfile.fullName} · {item.status}</p></div><AgencyPropertyControl endpoint={"/api/agency/properties/" + item.id} status={item.status} /></article>)}</div></>;
  }
  if (path.startsWith("properties/")) {
    const id = path.slice("properties/".length);
    const property = await prisma.property.findFirst({ where: { id, agencyId: { in: agencyIds } } });
    if (!property) return <Denied title="This listing is not part of your agency." />;
    return <><PageHeading eyebrow="Agency listing operations" title="Edit listing" description={property.title + " · Listing ownership remains assigned to its named agent."} /><div className="max-w-3xl border border-graphite-200 bg-paper-50 p-5 sm:p-7"><PropertyEditor propertyId={property.id} initial={property as unknown as Record<string, unknown>} agencyMode /></div></>;
  }
  if (path === "leads") {
    const enquiries = await prisma.enquiry.findMany({ where: whereAgency, orderBy: { createdAt: "desc" }, take: 200, include: { property: { select: { title: true } }, agentProfile: { select: { fullName: true } } } });
    return <><PageHeading eyebrow="Agency enquiries" title={title} description="Agency administrators and staff can update enquiry progress for their own agency records." /><div className="divide-y divide-graphite-200 border-y border-graphite-200">{enquiries.map((item) => <article key={item.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><h2 className="text-sm font-medium text-ink-900">{item.buyerName} · {item.property.title}</h2><p className="mt-1 text-xs text-ink-500">{item.buyerEmail} → {item.agentProfile.fullName} · {item.createdAt.toLocaleString()}</p></div><LeadStatusControl endpoint={"/api/leads/" + item.id} status={item.status} /></article>)}</div></>;
  }
  if (path === "cards") {
    const [cards, agents, plans] = await Promise.all([
      prisma.goldCard.findMany({ where: whereAgency, orderBy: { createdAt: "desc" }, take: 200, include: { plan: { select: { name: true } }, agentProfile: { select: { id: true, fullName: true } }, payments: { orderBy: { createdAt: "desc" }, take: 10, select: { status: true, amount: true, currency: true, termDays: true, createdAt: true } } } }),
      prisma.agentProfile.findMany({ where: { agencyId: { in: agencyIds }, status: "ACTIVE", agency: { status: "ACTIVE" }, user: { emailVerified: true, isSuspended: false } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, eacRegistrationNumber: true } }),
      listCardPlans(),
    ]);
    const effectiveStatus = (status: string, expiresAt: Date | null) => status === "ACTIVE" && expiresAt && expiresAt <= new Date() ? "EXPIRED" : status;
    return <><PageHeading eyebrow="Digital seat inventory" title={title} description="Agency administrators can sponsor an agent’s card or manage unassigned inventory. Staff have read-only access to card and payment status." /><AgencyCardPanel
      canManage={agencyRole === "AGENCY_ADMIN"}
      plans={plans.map((plan) => ({ code: plan.code, name: plan.name, durationDays: plan.durationDays, price: plan.priceAmount?.toString() ?? null, currency: plan.currency, priceApproved: plan.priceApproved }))}
      agents={agents}
      cards={cards.map((card) => ({ serial: card.serial, status: effectiveStatus(card.status, card.expiresAt), planName: card.plan.name, agentName: card.agentProfile?.fullName ?? null, agentProfileId: card.agentProfile?.id ?? null, expiresAt: card.expiresAt?.toISOString() ?? null, payments: card.payments.map((payment) => ({ status: payment.status, amount: payment.amount.toString(), currency: payment.currency, termDays: payment.termDays, createdAt: payment.createdAt.toISOString() })) }))}
    /></>;
  }
  if (path === "billing") {
    const payments = await prisma.payment.findMany({ where: { OR: [{ payerAgencyId: { in: agencyIds } }, { targetAgentProfile: { agencyId: { in: agencyIds } } }] }, orderBy: { createdAt: "desc" }, take: 200, include: { plan: { select: { name: true } }, user: { select: { name: true } }, payerAgency: { select: { name: true } }, targetAgentProfile: { select: { fullName: true } } } });
    return <><PageHeading eyebrow="Payment ledger" title={title} description="Agent-paid and agency-sponsored card payments. Live checkout remains closed until product pricing is approved." /><SecurityBanner /><div className="mt-5"><WorkspaceRecords rows={payments.map((payment) => ({ title: (payment.targetAgentProfile?.fullName ?? payment.user.name) + " · " + payment.plan.name, subtitle: (payment.payerAgency?.name ? payment.payerAgency.name + " sponsored · " : "Agent paid · ") + (payment.providerReference ?? payment.id), status: payment.status, meta: payment.currency + " " + payment.amount.toString() }))} empty="No card payments recorded." /></div></>;
  }
  return <Denied title="This agency route is not available." />;
}

async function agentContent(path: string, user: { id: string; name: string; email: string }, profile: AgentWorkspaceProfile, title: string) {
  if (path === "dashboard") {
    const [properties, leads, card] = await Promise.all([
      prisma.property.count({ where: { agentProfileId: profile.id } }),
      prisma.enquiry.count({ where: { agentProfileId: profile.id } }),
      prisma.goldCard.findFirst({ where: { agentProfileId: profile.id, status: "ACTIVE", expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "desc" } }),
    ]);
    const statusDescription = profile.status === "ACTIVE"
      ? "Your named agent record and professional seat."
      : profile.status === "PENDING_REVIEW"
        ? "Your EAC registration is awaiting review. Publishing becomes available after your agency and profile are approved."
        : profile.status === "REJECTED"
          ? "Your registration needs corrections. Update the details requested by the reviewer and resubmit them for EAC review."
          : "Your agent profile is suspended. Contact your agency administrator or platform support for next steps.";
    return <>
      <PageHeading eyebrow="Agent workspace" title={"Welcome, " + profile.fullName} description={statusDescription} />
      {profile.status === "REJECTED" ? <div className="mb-6 max-w-2xl border border-graphite-200 bg-paper-50 p-5">
        <h2 className="font-deed text-xl text-ink-900">Correct and resubmit your registration</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">Reviewer notes: {profile.reviewNotes ?? "No correction notes were supplied. Confirm your EAC registration details before resubmitting."}</p>
        {profile.agency.status === "ACTIVE" ? <div className="mt-4"><AgentResubmissionForm initial={{ fullName: profile.fullName, eacRegistrationNumber: profile.eacRegistrationNumber, phone: profile.phone }} /></div> : <p className="mt-4 border border-graphite-200 bg-paper-100 p-3 text-xs text-ink-600">The agency must be active before this registration can be resubmitted.</p>}
      </div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><StatTile label="My listings" value={properties} detail="Listings you own" /><StatTile label="My enquiries" value={leads} detail="Plus your one-level subagents" /><StatTile label="Gold Card" value={card ? "Active" : "Not active"} detail={card ? "Expires " + card.expiresAt?.toLocaleDateString() : "An active seat is required to publish"} /></div>
      <div className="mt-6"><SeatMeter used={card ? 1 : 0} capacity={1} label="Your professional seat" /></div>
      <div className="mt-6 grid gap-5 md:grid-cols-2"><KeyPlate sealed={Boolean(card)}><p className="font-mono text-[10px] uppercase tracking-[.14em] text-paper-300">DIGITAL GOLD CARD</p><p className="mt-7 font-deed text-2xl">Your professional seat</p><p className="mt-2 font-mono text-xs">{card?.serial ?? "AWAITING ACTIVATION"}</p><Link href="/agent/card" className="mt-5 inline-flex items-center gap-2 text-xs text-white underline underline-offset-4">Open card record <ArrowRight size={14} /></Link></KeyPlate><DeedPlate title="Agency record"><p>{profile.agency.name}</p><p className="mt-2">Agent EAC: {profile.eacRegistrationNumber}</p><p className="mt-2">Profile status: {profile.status}</p></DeedPlate></div>
    </>;
  }
  if (path === "listings" || path === "listings/") {
    const properties = await prisma.property.findMany({ where: { agentProfileId: profile.id }, orderBy: { updatedAt: "desc" }, take: 100 });
    return <><PageHeading eyebrow="Named listing ownership" title={title} description="Only your own property records appear here." /><Link href="/agent/listings/new" className="mb-5 inline-flex min-h-10 items-center gap-2 border border-ink-900 bg-ink-900 px-4 text-xs font-medium text-white">Create listing <ArrowRight size={14} /></Link><WorkspaceRecords rows={properties.map((item) => ({ title: item.title, subtitle: item.city + " · updated " + item.updatedAt.toLocaleDateString(), status: item.status, href: "/agent/listings/" + item.id + "/edit" }))} empty="You have not added a property record." /></>;
  }
  if (path === "listings/new") return <><PageHeading eyebrow="Property record" title={title} description="An active approved Gold Card is required to publish. Your listing is assigned to your named agent profile." /><div className="max-w-3xl border border-graphite-200 bg-paper-50 p-5 sm:p-7"><PropertyEditor /></div></>;
  if (path.startsWith("listings/") && path.endsWith("/edit")) {
    const id = path.split("/")[1];
    const property = await prisma.property.findFirst({ where: { id, agentProfileId: profile.id } });
    if (!property) return <Denied title="This listing is not owned by your agent profile." />;
    return <><PageHeading eyebrow="Owned property record" title="Edit listing" description={property.title} /><div className="max-w-3xl border border-graphite-200 bg-paper-50 p-5 sm:p-7"><PropertyEditor propertyId={property.id} initial={property as unknown as Record<string, unknown>} /></div></>;
  }
  if (path === "leads") {
    if (profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE") return <Denied title="Agent enquiries are unavailable." detail="An active agent profile in an active agency is required to view agent enquiries." />;
    const leads = await prisma.enquiry.findMany({ where: { OR: [{ agentProfileId: profile.id }, { agentProfileId: { in: profile.subagents.map((subagent) => subagent.id) } }] }, orderBy: { createdAt: "desc" }, take: 100, include: { property: { select: { title: true } }, agentProfile: { select: { fullName: true } } } });
    return <><PageHeading eyebrow="Buyer correspondence" title={title} description="Your leads and the enquiries for your one-level subagents." /><div className="divide-y divide-graphite-200 border-y border-graphite-200">{leads.map((lead) => <article key={lead.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><h2 className="text-sm font-medium text-ink-900">{lead.buyerName} · {lead.property.title}</h2><p className="mt-1 text-xs text-ink-500">{lead.buyerEmail} → {lead.agentProfile.fullName} · {lead.createdAt.toLocaleString()}</p></div><LeadStatusControl endpoint={"/api/leads/" + lead.id} status={lead.status} /></article>)}</div></>;
  }
  if (path === "card") {
    const [card, plans] = await Promise.all([
      prisma.goldCard.findFirst({ where: { OR: [{ agentProfileId: profile.id }, { ownerUserId: user.id }] }, orderBy: { updatedAt: "desc" }, include: { plan: true, payments: { orderBy: { createdAt: "desc" }, take: 20, include: { plan: { select: { name: true } }, term: true } }, terms: { orderBy: { startsAt: "asc" } } } }),
      listCardPlans(),
    ]);
    const effectiveStatus = card?.status === "ACTIVE" && card.expiresAt && card.expiresAt <= new Date() ? "EXPIRED" : card?.status;
    const canRenew = !card || effectiveStatus === "ACTIVE" || effectiveStatus === "EXPIRED" || effectiveStatus === "REVOKED";
    return <><PageHeading eyebrow="Seat record" title={title} description="Your Gold Card and its verified payment terms determine access to professional publishing." />{card ? <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><KeyPlate sealed={effectiveStatus === "ACTIVE"}><p className="font-mono text-[10px] uppercase tracking-[.14em] text-paper-300">PROPERTY CONNECT · DIGITAL GOLD CARD</p><p className="mt-10 font-deed text-3xl">Professional seat</p><div className="mt-3"><SerialPlate>{card.serial}</SerialPlate></div><div className="mt-6"><StampBadge state={effectiveStatus ?? card.status} /></div><p className="mt-5 text-xs text-paper-300">{card.durationDaysSnapshot} days · {card.expiresAt ? "Expires " + card.expiresAt.toLocaleDateString() : "Not yet active"}</p></KeyPlate><DeedPlate title="Card status"><p>{effectiveStatus}</p><p className="mt-2">Issued {card.createdAt.toLocaleDateString()}</p><p className="mt-2">Your professional seat is checked on every publish action.</p>{effectiveStatus === "SUSPENDED" ? <p className="mt-2">Paid time is paused while the card is suspended. Contact platform support for next steps.</p> : null}{effectiveStatus === "ASSIGNED" ? <p className="mt-2">Enter the serial and one-time code to activate this card.</p> : null}</DeedPlate></div> : <div className="border border-graphite-200 bg-paper-100 p-5"><p className="text-sm text-ink-700">No Gold Card is attached to your agent record.</p><p className="mt-2 text-xs text-ink-500">Choose an approved plan below to purchase your professional seat.</p></div>}{effectiveStatus === "ASSIGNED" ? <Link href="/activate" className="mt-5 inline-block text-sm text-brand-700 underline underline-offset-4">Activate your assigned card</Link> : null}<RuleLine label="PAYMENT & TERM HISTORY" /><WorkspaceRecords rows={card?.payments.map((payment) => ({ title: payment.plan.name + " · " + payment.currency + " " + payment.amount.toString(), subtitle: payment.providerReference ?? payment.id, status: payment.status, meta: payment.paidAt?.toLocaleString() ?? payment.createdAt.toLocaleString() })) ?? []} empty="No card payments have been recorded." /><div className="mt-5"><WorkspaceRecords rows={card?.terms.map((term) => ({ title: term.source.replaceAll("_", " ") + " · " + term.durationDays + " days", subtitle: term.startsAt.toLocaleString() + " → " + term.endsAt.toLocaleString(), status: term.status })) ?? []} empty="No access terms have been recorded." /></div><RuleLine label={canRenew ? "AVAILABLE DIGITAL PLANS" : "CARD CHECKOUT"} /><div className="grid gap-4 sm:grid-cols-2">{plans.map((plan) => <DeedPlate key={plan.code} title={plan.name} serial={plan.code}><p>{plan.durationDays} days of seat access.</p><p className="mt-2">{plan.priceApproved && plan.priceAmount ? plan.currency + " " + plan.priceAmount.toString() : "Price pending product approval"}</p>{canRenew && plan.priceApproved && plan.priceAmount ? <div className="mt-4"><CheckoutButton planCode={plan.code} label={effectiveStatus === "REVOKED" ? "Purchase a new card" : card ? "Renew with Paynow" : undefined} /></div> : !canRenew ? <p className="mt-4 text-xs text-ink-500">Checkout is unavailable while this card is assigned or suspended.</p> : <p className="mt-4 text-xs text-ink-500">Checkout is closed until pricing is approved.</p>}</DeedPlate>)}</div></>;
  }
  if (path === "subagents") {
    if (profile.parentAgentId) return <Denied title="Subagent invitations are restricted to lead agents." />;
    const children = await prisma.agentProfile.findMany({ where: { parentAgentId: profile.id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { properties: true } } } });
    const agencyActive = profile.agency.status === "ACTIVE";
    const activeCard = profile.status === "ACTIVE" && agencyActive ? await prisma.goldCard.findFirst({
      where: { OR: [{ ownerUserId: user.id }, { agentProfileId: profile.id }], status: "ACTIVE", expiresAt: { gt: new Date() } },
      select: { id: true },
    }) : null;
    return <><PageHeading eyebrow="Agent binder" title={title} description="One-level subagent relationships. Subagents have their own EAC record and Gold Card." />{profile.status === "ACTIVE" ? <div className="mb-6 max-w-xl border border-graphite-200 bg-paper-50 p-5"><h2 className="mb-3 font-deed text-xl">Invite a subagent</h2><InvitationForm invitationType="subagent" canSend={Boolean(activeCard)} canManage={Boolean(activeCard)} canResend={Boolean(activeCard)} disabledReason={agencyActive ? "An active Gold Card is required to invite subagents." : "Subagent invitations are unavailable while the agency is inactive."} manageMessage={agencyActive ? "Invitation changes require an active Gold Card." : "The agency is not active, so invitation changes are disabled."} /></div> : <div className="mb-6 border border-graphite-200 bg-paper-100 p-4 text-sm text-ink-600">Subagent invitations are available after your agent profile is approved and active.</div>}<WorkspaceRecords rows={children.map((agent) => ({ title: agent.fullName, subtitle: agent.eacRegistrationNumber, status: agent.status, meta: agent._count.properties + " listings" }))} empty="No subagents have joined your binder." /></>;
  }
  if (path === "profile") return <><PageHeading eyebrow="Public professional record" title={profile.fullName} description="Edit the details buyers see on your public agent profile. Your EAC registration remains part of its manual review record." /><AgentProfileEditor initial={{ fullName: profile.fullName, phone: profile.phone, bio: profile.bio, photoUrl: profile.photoUrl }} /></>;
  return <Denied title="This agent route is not available." />;
}
