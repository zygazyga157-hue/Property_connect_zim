import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, ChevronDown, Compass, Menu, UserRound } from "lucide-react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SignOutButton } from "@/components/sign-out-button";

type HeaderWorkspace = { href: string; label: string };

async function getHeaderAccount(): Promise<{ name: string; email: string; verified: boolean; suspended: boolean; workspaces: HeaderWorkspace[] } | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        globalRole: true,
        emailVerified: true,
        isSuspended: true,
        twoFactorEnabled: true,
        agentProfile: { select: { id: true } },
        memberships: { where: { status: "ACTIVE" }, select: { agency: { select: { name: true } } } },
      },
    });
    if (!user) return null;

    const workspaces: HeaderWorkspace[] = [];
    if (user.globalRole === "platform_admin") {
      if (user.twoFactorEnabled) workspaces.push({ href: "/admin/dashboard", label: "Platform admin" });
    } else {
      if (user.globalRole === "buyer") workspaces.push({ href: "/buyer/dashboard", label: "Buyer" });
      if (user.agentProfile) workspaces.push({ href: "/agent/dashboard", label: "Agent" });
      if (user.memberships.length) workspaces.push({ href: "/agency/dashboard", label: user.memberships[0].agency.name });
    }

    return { name: user.name, email: user.email, verified: user.emailVerified, suspended: user.isSuspended, workspaces };
  } catch {
    // The header is navigation, not an authorization boundary. Role pages and APIs
    // perform their own checks if the account lookup is unavailable.
    return null;
  }
}

const menuLinkClass = "flex min-h-11 items-center justify-between gap-3 px-3 text-sm text-ink-700 hover:bg-paper-100 hover:text-brand-700 focus-visible:bg-paper-100";
const summaryClass = "inline-flex min-h-10 list-none cursor-pointer items-center gap-2 border border-transparent px-3 text-sm text-ink-700 hover:border-graphite-200 hover:bg-paper-100 focus-visible:border-brand-500 [&::-webkit-details-marker]:hidden";

function BrowseLinks() {
  return <>
    <Link href="/?purpose=SALE" className={menuLinkClass}>Buy a property <ArrowUpRight size={14} /></Link>
    <Link href="/?purpose=RENT" className={menuLinkClass}>Rent a property <ArrowUpRight size={14} /></Link>
    <Link href="/" className={menuLinkClass}>Browse all properties <ArrowUpRight size={14} /></Link>
  </>;
}

export async function SiteHeader() {
  const account = await getHeaderAccount();
  const canOpenWorkspace = Boolean(account && account.verified && !account.suspended);
  const workspaces = canOpenWorkspace ? account?.workspaces ?? [] : [];

  return <header className="sticky top-0 z-40 border-b border-graphite-200 bg-paper-50/95 backdrop-blur">
    <div className="relative mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
      <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3 rounded-[4px]" aria-label="Property Connect home">
        <Image src="/brand/property-connect-logo.png" alt="Property Connect Zimbabwe" width={736} height={586} priority className="h-12 w-[60px] shrink-0 object-contain sm:h-[54px] sm:w-[68px]" />
        <span className="hidden whitespace-nowrap text-[13px] font-semibold tracking-[-.02em] text-ink-900 min-[400px]:inline">PROPERTY CONNECT <span className="ml-1 font-mono text-[9px] font-normal tracking-[.12em] text-ink-500">ZIMBABWE</span></span>
      </Link>

      <nav aria-label="Main navigation" className="ml-auto hidden items-center gap-1 md:flex">
        <details className="group relative">
          <summary className={summaryClass}><Compass size={15} />Explore<ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 border border-graphite-200 bg-paper-50 p-2 shadow-lg">
            <p className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">Property marketplace</p>
            <BrowseLinks />
          </div>
        </details>

        {workspaces.length === 1 ? <Link href={workspaces[0].href} title={workspaces[0].label} className="inline-flex min-h-10 max-w-48 items-center gap-2 truncate border border-graphite-300 bg-paper-50 px-3 text-sm font-medium text-ink-700 hover:border-brand-500 hover:text-brand-700"><span className="truncate">{workspaces[0].label}</span><ArrowUpRight size={14} className="shrink-0" /></Link> : workspaces.length > 1 ? <details className="group relative">
          <summary className={summaryClass}>Workspaces<ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 border border-graphite-200 bg-paper-50 p-2 shadow-lg">
            <p className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">Choose a workspace</p>
            {workspaces.map((workspace) => <Link key={workspace.href} href={workspace.href} className={menuLinkClass}>{workspace.label}<ArrowUpRight size={14} /></Link>)}
          </div>
        </details> : null}

        {account ? <details className="group relative">
          <summary className={summaryClass}><UserRound size={15} />Account<ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 border border-graphite-200 bg-paper-50 p-2 shadow-lg">
            <div className="border-b border-graphite-200 px-3 pb-3 pt-2">
              <p className="truncate text-sm font-medium text-ink-900">{account.name}</p>
              <p className="mt-1 truncate text-xs text-ink-500">{account.email}</p>
            </div>
            {account.suspended ? <p className="px-3 py-3 text-xs text-ink-500">Account access is unavailable.</p> : !account.verified ? <Link href="/verify-email" className={menuLinkClass}>Verify your email <ArrowUpRight size={14} /></Link> : null}
            <Link href="/account/security" className={menuLinkClass}>Account security <ArrowUpRight size={14} /></Link>
            <div className="border-t border-graphite-200 pt-1"><SignOutButton /></div>
          </div>
        </details> : <>
          <details className="group relative">
            <summary className={summaryClass}>More<ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 border border-graphite-200 bg-paper-50 p-2 shadow-lg">
              <Link href="/register/buyer" className={menuLinkClass}>For buyers <ArrowUpRight size={14} /></Link>
              <Link href="/register/agency" className={menuLinkClass}>For agencies <ArrowUpRight size={14} /></Link>
              <Link href="/activate" className={menuLinkClass}>Activate a card <ArrowUpRight size={14} /></Link>
            </div>
          </details>
          <Link href="/login" className="inline-flex min-h-10 items-center gap-2 border border-brand-700 bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-900">Sign in<ArrowUpRight size={14} /></Link>
        </>}
      </nav>

      <details className="group relative ml-auto md:hidden">
        <summary aria-label="Open main menu" className="inline-flex min-h-11 list-none cursor-pointer items-center gap-2 border border-graphite-300 bg-paper-50 px-3 text-sm font-medium text-ink-700 hover:bg-paper-100 focus-visible:border-brand-500 [&::-webkit-details-marker]:hidden"><Menu size={17} /><span>Menu</span><ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(75vh,40rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto border border-graphite-200 bg-paper-50 p-2 shadow-xl">
          <section aria-labelledby="mobile-explore-heading">
            <h2 id="mobile-explore-heading" className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">Explore</h2>
            <BrowseLinks />
          </section>
          {workspaces.length ? <section aria-labelledby="mobile-workspace-heading" className="mt-2 border-t border-graphite-200 pt-2">
            <h2 id="mobile-workspace-heading" className="px-3 pb-1 pt-1 font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">Workspaces</h2>
            {workspaces.map((workspace) => <Link key={workspace.href} href={workspace.href} className={menuLinkClass}>{workspace.label}<ArrowUpRight size={14} /></Link>)}
          </section> : null}
          {account ? <section aria-labelledby="mobile-account-heading" className="mt-2 border-t border-graphite-200 pt-2">
            <h2 id="mobile-account-heading" className="px-3 pb-1 pt-1 font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">{account.name}</h2>
            {account.suspended ? <p className="px-3 py-2 text-xs text-ink-500">Account access is unavailable.</p> : !account.verified ? <Link href="/verify-email" className={menuLinkClass}>Verify your email <ArrowUpRight size={14} /></Link> : null}
            <Link href="/account/security" className={menuLinkClass}>Account security <ArrowUpRight size={14} /></Link>
            <div className="border-t border-graphite-200 pt-1"><SignOutButton /></div>
          </section> : <section aria-labelledby="mobile-join-heading" className="mt-2 border-t border-graphite-200 pt-2">
            <h2 id="mobile-join-heading" className="px-3 pb-1 pt-1 font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">Join Property Connect</h2>
            <Link href="/register/buyer" className={menuLinkClass}>Create a buyer account <ArrowUpRight size={14} /></Link>
            <Link href="/register/agency" className={menuLinkClass}>For agencies <ArrowUpRight size={14} /></Link>
            <Link href="/activate" className={menuLinkClass}>Activate a card <ArrowUpRight size={14} /></Link>
            <Link href="/login" className="mx-3 my-2 inline-flex min-h-11 items-center gap-2 border border-brand-700 bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-900">Sign in<ArrowUpRight size={14} /></Link>
          </section>}
        </div>
      </details>
    </div>
  </header>;
}
