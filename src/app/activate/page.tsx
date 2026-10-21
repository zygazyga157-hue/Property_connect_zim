import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { KeyRound } from "lucide-react";
import { ActivationForm } from "@/components/registry-forms";
import { DeedPlate } from "@/components/identity";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Activate a Gold Card" };

export default async function ActivatePage() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const account = session?.user?.id ? await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, isSuspended: true, agentProfile: { select: { status: true, agency: { select: { status: true } } } } },
  }) : null;
  const canActivate = Boolean(account?.emailVerified && !account.isSuspended && account.agentProfile?.status === "ACTIVE" && account.agentProfile.agency.status === "ACTIVE");
  return <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 sm:py-16 lg:grid-cols-[.8fr_1fr]">
    <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Digital Gold Card</p><h1 className="mt-3 font-deed text-4xl font-medium leading-tight text-ink-900">A key to your professional seat.</h1><p className="mt-4 max-w-lg text-sm leading-7 text-ink-500">Agency-assigned cards are activated by the named, approved agent. Your access period starts when the card is sealed.</p><div className="mt-8"><DeedPlate title="Activation record"><p className="flex items-center gap-2"><KeyRound size={15} /> Keep your serial and code private.</p><p className="mt-2">Five unsuccessful attempts lock a card for one hour. Contact your agency administrator if you need help.</p></DeedPlate></div></div>
    <section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7">
      {canActivate ? <ActivationForm /> : !session?.user?.id ? <div className="space-y-4"><p className="text-sm leading-6 text-ink-600">Sign in with the verified account attached to your approved agent profile to activate an assigned card.</p><Link href="/login?returnTo=%2Factivate" className="inline-flex min-h-11 items-center border border-brand-700 bg-brand-700 px-5 text-sm font-medium text-white">Sign in to activate</Link></div>
        : !account?.emailVerified ? <div className="space-y-3"><p className="text-sm leading-6 text-ink-600">Verify your email before activating a professional card.</p><Link href="/verify-email" className="text-sm text-brand-700 underline underline-offset-4">Verify your email</Link></div>
          : account?.isSuspended ? <p className="text-sm leading-6 text-ink-600">This account is suspended. Contact platform support before activating a card.</p>
            : account?.agentProfile?.status !== "ACTIVE" || account.agentProfile.agency.status !== "ACTIVE" ? <p className="text-sm leading-6 text-ink-600">Card activation is available after your agent profile and agency are approved and active.</p>
              : <p className="text-sm leading-6 text-ink-600">An active agent account is required to activate this card.</p>}
    </section>
  </main>;
}
