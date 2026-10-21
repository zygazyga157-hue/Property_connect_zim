import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireUser } from "@/lib/authz";
import { TwoFactorSetup } from "@/components/registry-forms";
import { DeedPlate } from "@/components/identity";

export const metadata: Metadata = { title: "Account security" };
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const user = await requireUser(await headers());
  return <main className="mx-auto grid max-w-4xl gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.8fr_1fr]"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Account security</p><h1 className="mt-3 font-deed text-4xl text-ink-900">Protect your named account.</h1><p className="mt-4 text-sm leading-7 text-ink-500">Platform administrator access requires a verified authenticator factor.</p><div className="mt-7"><DeedPlate title="Signed in as">{user.email}</DeedPlate></div></div><section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><TwoFactorSetup enabled={user.twoFactorEnabled} /></section></main>;
}
