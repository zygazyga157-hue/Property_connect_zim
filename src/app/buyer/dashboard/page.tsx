import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Bookmark, MessageSquareText, SlidersHorizontal } from "lucide-react";
import { ApiError } from "@/lib/errors";
import { requireBuyer } from "@/lib/authz";
import { getBuyerProfile, listBuyerEnquiries, listSavedProperties } from "@/lib/services/buyer";
import { BuyerPreferencesForm } from "@/components/buyer-forms";
import { SavePropertyButton } from "@/components/buyer-actions";
import { SignOutButton } from "@/components/sign-out-button";
import { DeedPlate, RuleLine, StampBadge } from "@/components/identity";

export const metadata: Metadata = { title: "Buyer dashboard" };
export const dynamic = "force-dynamic";

export default async function BuyerDashboardPage() {
  let user;
  try { user = await requireBuyer(await headers()); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login?returnTo=%2Fbuyer%2Fdashboard");
    if (error instanceof ApiError && error.code === "EMAIL_VERIFICATION_REQUIRED") redirect("/verify-email?returnTo=%2Fbuyer%2Fdashboard");
    throw error;
  }

  const [preferences, saved, enquiries] = await Promise.all([
    getBuyerProfile(user.id), listSavedProperties(user.id), listBuyerEnquiries(user.id),
  ]);

  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Personal property file</p><h1 className="mt-3 font-deed text-4xl font-medium text-ink-900">Welcome, {user.name}.</h1><p className="mt-2 text-sm text-ink-500">Signed in as {user.email}. Your saved homes and agent messages are private to this account.</p></div><SignOutButton /></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><DeedPlate title="Saved properties"><p className="font-mono text-2xl">{saved.length}</p><p>Records kept in your shortlist.</p></DeedPlate><DeedPlate title="Enquiry history"><p className="font-mono text-2xl">{enquiries.length}</p><p>Messages linked to this verified account.</p></DeedPlate><DeedPlate title="Email record"><p className="text-sm">Verified</p><p>Use this named account to manage your buyer activity.</p></DeedPlate></div>
    <RuleLine label="BUYER WORKSPACE" />
    <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
      <div className="space-y-8">
        <section className="border border-graphite-200 bg-paper-50 p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><SlidersHorizontal size={17} /><h2 className="font-deed text-xl">Search preferences</h2></div><p className="mb-4 text-xs leading-5 text-ink-500">These preferences match the filters available in the public property registry.</p><BuyerPreferencesForm initial={preferences} /></section>
        <section><div className="mb-4 flex items-center gap-3"><MessageSquareText size={17} /><h2 className="font-deed text-2xl text-ink-900">Enquiry history</h2></div>{enquiries.length ? <div className="divide-y divide-graphite-200 border-y border-graphite-200">{enquiries.map((enquiry) => <article key={enquiry.id} className="py-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-ink-900"><Link href={"/properties/" + enquiry.property.slug} className="underline decoration-graphite-300 underline-offset-4">{enquiry.property.title}</Link></h3><StampBadge state={enquiry.status} /></div><p className="mt-1 text-xs text-ink-500">{enquiry.agentProfile.fullName} · {enquiry.agentProfile.agency.name} · {enquiry.createdAt.toLocaleDateString()}</p><p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink-700">{enquiry.message}</p></article>)}</div> : <div className="border border-graphite-200 bg-paper-100 p-5 text-sm text-ink-500">Enquiries you send while signed in will appear here. <Link href="/" className="text-brand-700 underline underline-offset-4">Browse properties</Link>.</div>}</section>
      </div>
      <section><div className="mb-4 flex items-center gap-3"><Bookmark size={17} /><h2 className="font-deed text-2xl text-ink-900">Saved properties</h2></div>{saved.length ? <div className="grid gap-4 sm:grid-cols-2">{saved.map(({ property }) => <article key={property.id} className="relative border border-graphite-200 bg-paper-50"><Link href={"/properties/" + property.slug} className="block"><div className="aspect-[4/3] bg-paper-200">{property.images[0]?.publicUrl ? <div role="img" aria-label={property.images[0].altText ?? property.title} className="size-full bg-cover bg-center" style={{ backgroundImage: "url(\"" + property.images[0].publicUrl + "\")" }} /> : <div className="paper-grid grid size-full place-items-center font-mono text-[10px] uppercase text-ink-500">Property record</div>}</div><div className="p-4"><p className="font-mono text-[10px] uppercase tracking-[.12em] text-ink-500">{property.propertyType.replaceAll("_", " ")} · {property.purpose.replaceAll("_", " ")}</p><h3 className="mt-2 text-sm font-semibold text-ink-900">{property.title}</h3><p className="mt-1 text-xs text-ink-500">{[property.suburb, property.city].filter(Boolean).join(", ")}</p><p className="mt-3 text-sm font-medium text-ink-900">{property.priceAmount ? (property.priceCurrency ?? "USD") + " " + Number(property.priceAmount.toString()).toLocaleString("en-US") : "Price on enquiry"}</p></div></Link><div className="px-4 pb-4"><SavePropertyButton propertyId={property.id} initialSaved refreshOnToggle /></div></article>)}</div> : <div className="border border-graphite-200 bg-paper-100 p-6 text-sm text-ink-500">Save a property from the registry to keep it here. <Link href="/" className="text-brand-700 underline underline-offset-4">Browse properties</Link>.</div>}</section>
    </div>
  </main>;
}
