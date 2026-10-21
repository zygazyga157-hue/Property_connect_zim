import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { AgencyRegistrationForm } from "@/components/registry-forms";
import { DeedPlate, RuleLine } from "@/components/identity";

export const metadata: Metadata = { title: "Agency application" };

export default function AgencyRegistrationPage() {
  return <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.7fr_1fr]">
    <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Agency application</p><h1 className="mt-3 font-deed text-4xl font-medium leading-tight text-ink-900">Create a named agency record.</h1><p className="mt-4 text-sm leading-7 text-ink-500">Submit your agency and EAC registration details. A platform administrator reviews applications manually before the workspace is activated.</p><RuleLine label="REVIEW PROCESS" /><div className="space-y-3"><DeedPlate title="01 · Account"><p>A named agency administrator account is created for the person submitting this application.</p></DeedPlate><DeedPlate title="02 · EAC review"><p>Registration details stay private while the application is pending review.</p></DeedPlate></div></div>
    <section className="border border-graphite-200 bg-paper-50 p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><CheckCircle2 size={18} className="text-ink-700" /><h2 className="font-deed text-2xl text-ink-900">Application details</h2></div><AgencyRegistrationForm /></section>
  </main>;
}
