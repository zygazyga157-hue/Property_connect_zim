import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/registry-forms";
import { RuleLine } from "@/components/identity";

export const metadata: Metadata = { title: "Recover your account" };

export default function ForgotPasswordPage() {
  return <main className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-20"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Account recovery</p><h1 className="mt-3 font-deed text-4xl text-ink-900">Recover access to your account.</h1><p className="mt-3 text-sm leading-6 text-ink-500">Enter the email address on your named account. If it is registered, we will send a secure reset link.</p><RuleLine label="RECOVERY RECORD" /><section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><ForgotPasswordForm /></section><Link href="/login" className="mt-5 inline-block text-xs text-brand-700 underline underline-offset-4">Return to sign in</Link></main>;
}
