import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/registry-forms";
import { RuleLine } from "@/components/identity";

export const metadata: Metadata = { title: "Reset your password" };
type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token = "" } = await searchParams;
  return <main className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-20"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Account recovery</p><h1 className="mt-3 font-deed text-4xl text-ink-900">Set a new password.</h1><p className="mt-3 text-sm leading-6 text-ink-500">Choose a password with at least 12 characters and confirm it below.</p><RuleLine label="RESET RECORD" /><section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><ResetPasswordForm token={token} /></section><Link href="/forgot-password" className="mt-5 inline-block text-xs text-brand-700 underline underline-offset-4">Request another reset link</Link></main>;
}
