import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { ApiError } from "@/lib/errors";
import { AgentInviteAccountForm, AgentRegistrationForm } from "@/components/registry-forms";
import { DeedPlate } from "@/components/identity";

export const metadata: Metadata = { title: "Agent registration" };
type Props = { searchParams: Promise<{ invite?: string }> };

export default async function AgentRegistrationPage({ searchParams }: Props) {
  const { invite = "" } = await searchParams;
  let signedIn = false;
  let verificationNeeded = false;
  try { await requireUser(await headers()); signedIn = true; } catch (error) {
    if (!(error instanceof ApiError && [401, 403].includes(error.status))) throw error;
    verificationNeeded = error.code === "EMAIL_VERIFICATION_REQUIRED";
  }
  const invitationReturnTo = "/register/agent?invite=" + encodeURIComponent(invite);
  return <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.8fr_1fr]">
    <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Agent application</p><h1 className="mt-3 font-deed text-4xl font-medium leading-tight text-ink-900">Put your name on the record.</h1><p className="mt-4 text-sm leading-7 text-ink-500">Agent accounts are named and linked to an active agency by invitation. Your EAC registration is reviewed before your public profile is enabled.</p><div className="mt-7"><DeedPlate title="Review state"><p>Applications remain private while awaiting agency and EAC review.</p></DeedPlate></div></div>
    <section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><h2 className="mb-5 font-deed text-2xl text-ink-900">Agent details</h2>{!invite ? <div className="space-y-4"><p className="text-sm leading-6 text-ink-500">Agent registration requires a current invitation from an active agency or eligible lead agent.</p><Link href="/login" className="inline-flex min-h-11 items-center border border-brand-700 bg-brand-700 px-4 text-sm text-white">Sign in</Link></div> : verificationNeeded ? <div className="space-y-4"><p className="text-sm leading-6 text-ink-500">Verify this account before accepting the invitation. The invitation link is preserved through email recovery.</p><Link href={"/verify-email?returnTo=" + encodeURIComponent(invitationReturnTo)} className="inline-flex min-h-11 items-center border border-brand-700 bg-brand-700 px-4 text-sm text-white">Continue to email verification</Link></div> : signedIn ? <AgentRegistrationForm invitationToken={invite} /> : <div className="space-y-6"><p className="text-sm leading-6 text-ink-500">Create your named account using the invited email, verify it, then sign in to complete your professional record.</p><AgentInviteAccountForm invitationToken={invite} /><div className="border-t border-graphite-200 pt-4"><Link href={"/login?returnTo=" + encodeURIComponent(invitationReturnTo)} className="inline-flex min-h-11 items-center border border-brand-700 bg-brand-700 px-4 text-sm text-white">Already have an account? Sign in</Link></div></div>}</section>
  </main>;
}
