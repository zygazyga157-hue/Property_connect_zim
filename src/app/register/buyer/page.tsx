import type { Metadata } from "next";
import Link from "next/link";
import { BuyerSignupForm } from "@/components/registry-forms";
import { DeedPlate, RuleLine } from "@/components/identity";

export const metadata: Metadata = { title: "Create a buyer account" };

export default function BuyerRegistrationPage() {
  return <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.8fr_1fr]">
    <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Buyer account</p><h1 className="mt-3 font-deed text-4xl font-medium leading-tight text-ink-900">Keep your property search on the record.</h1><p className="mt-4 text-sm leading-7 text-ink-500">Save listings, keep your agent enquiries together and set your preferred search. Your email address must be verified before buyer tools are available.</p><RuleLine label="PERSONAL PROPERTY FILE" /><DeedPlate title="Your buyer tools"><p>Keep saved properties, contact history and search preferences in one private workspace.</p></DeedPlate></div>
    <section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><h2 className="mb-5 font-deed text-2xl text-ink-900">Create your named account</h2><BuyerSignupForm /><p className="mt-5 text-xs text-ink-500">Already registered? <Link href="/login?returnTo=%2Fbuyer%2Fdashboard" className="text-brand-700 underline underline-offset-4">Sign in</Link>.</p></section>
  </main>;
}
