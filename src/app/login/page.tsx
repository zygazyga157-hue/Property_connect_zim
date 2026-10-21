import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { LoginForm } from "@/components/registry-forms";
import { RuleLine, Seal } from "@/components/identity";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ returnTo?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { returnTo = "/workspace" } = await searchParams;
  return <main className="mx-auto grid max-w-5xl gap-9 px-5 py-10 sm:px-8 sm:py-16 lg:grid-cols-[.8fr_1fr]">
    <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Account access</p><h1 className="mt-3 font-deed text-4xl font-medium text-ink-900">Your property and professional records, in one place.</h1><p className="mt-4 max-w-lg text-sm leading-7 text-ink-500">Sign in to manage saved properties, enquiries, listings, agency records and Gold Card status.</p><RuleLine label="IDENTITY & ACCESS" /><div className="flex items-start gap-3"><Seal kind="key" size="sm" /><p className="text-xs leading-5 text-ink-500">Your agency and personal profile use separate records. Credentials are managed by the secure account service.</p></div><div className="mt-7"><p className="text-xs font-medium text-ink-700">Choose where to continue after sign-in</p><nav aria-label="Sign-in workspace destinations" className="mt-3 grid grid-cols-2 gap-2">{[{ href: "/buyer/dashboard", label: "Buyer workspace" }, { href: "/agent/dashboard", label: "Agent workspace" }, { href: "/agency/dashboard", label: "Agency workspace" }, { href: "/workspace", label: "Platform administration" }].map((destination) => <Link key={destination.href} href={"/login?returnTo=" + encodeURIComponent(destination.href)} className="inline-flex min-h-10 items-center border border-graphite-300 bg-paper-50 px-3 text-xs text-ink-700 hover:border-brand-500 hover:text-brand-700">{destination.label}</Link>)}</nav></div><p className="mt-6 text-sm text-ink-500">Looking for a home? <Link href="/register/buyer" className="font-medium text-brand-700 underline underline-offset-4">Create a buyer account</Link>.</p><p className="mt-3 text-sm text-ink-500">Applying as an agency? <Link href="/register/agency" className="font-medium text-brand-700 underline underline-offset-4">Start an agency application</Link>.</p></div>
    <section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><KeyRound size={18} className="text-ink-700" /><h2 className="font-deed text-2xl text-ink-900">Sign in</h2></div><LoginForm returnTo={returnTo} /><Link href="/forgot-password" className="mt-5 inline-block text-xs text-brand-700 underline underline-offset-4">Forgot your password?</Link></section>
  </main>;
}
