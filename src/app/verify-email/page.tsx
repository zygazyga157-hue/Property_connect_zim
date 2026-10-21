import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerificationForm } from "@/components/registry-forms";
import { RuleLine } from "@/components/identity";

export const metadata: Metadata = { title: "Verify your email" };
type Props = { searchParams: Promise<{ verified?: string; returnTo?: string }> };

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { verified, returnTo } = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/workspace";
  return <main className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-20"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Account verification</p><h1 className="mt-3 font-deed text-4xl text-ink-900">{verified === "1" ? "Email address verified." : "Check your email."}</h1><p className="mt-3 text-sm leading-6 text-ink-500">{verified === "1" ? "Your named account is ready. Continue to finish registration or open your workspace." : "Use the secure link we sent to confirm your email address. Verification links expire; you can request another below."}</p>{verified === "1" ? <Link href={safeReturnTo} className="mt-5 inline-flex min-h-11 items-center border border-brand-700 bg-brand-700 px-4 text-sm text-white">Continue</Link> : null}<RuleLine label="VERIFICATION RECORD" />{verified !== "1" ? <section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><ResendVerificationForm returnTo={safeReturnTo} /></section> : null}<Link href="/login" className="mt-5 inline-block text-xs text-brand-700 underline underline-offset-4">Return to sign in</Link></main>;
}
