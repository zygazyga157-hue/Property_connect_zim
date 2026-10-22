import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpenCheck, Search, ShieldCheck } from "lucide-react";
import { PropertyCard } from "@/components/property-card";
import { RuleLine, Seal } from "@/components/identity";
import { RegistrySelect } from "@/components/form-controls";
import { listPublicProperties } from "@/lib/services/properties";
import { PaginationControls } from "@/components/pagination-controls";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ q?: string; city?: string; purpose?: string; type?: string; page?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const filters = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  let listingResult: Awaited<ReturnType<typeof listPublicProperties>> | null = null;
  try { listingResult = await listPublicProperties(params); } catch { listingResult = null; }
  return <main>
    <section className="paper-grid border-b border-graphite-200">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_.78fr] lg:items-end">
        <div className="max-w-2xl"><p className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.16em] text-ink-500"><span className="h-px w-8 bg-brand-700" /> Zimbabwe&apos;s property registry</p>
          <h1 className="mt-5 font-deed text-[clamp(2.8rem,6vw,5.2rem)] font-medium leading-[.98] tracking-[-.04em] text-ink-900">The record is real.<br /><span className="text-brand-700">The seat is verified.</span></h1>
          <p className="mt-6 max-w-xl text-sm leading-7 text-ink-500 sm:text-base">Find property listed by EAC-reviewed professionals. Every listing connects to a named agent and an accountable agency.</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="#registry" className="inline-flex min-h-12 items-center gap-2 border border-brand-700 bg-brand-700 px-5 text-sm font-medium text-white hover:bg-brand-900">Search the registry <ArrowRight size={16} /></a><Link href="/register/buyer" className="inline-flex min-h-12 items-center gap-2 border border-graphite-300 bg-paper-50 px-5 text-sm font-medium text-ink-700 hover:bg-paper-100">Create buyer account <ArrowUpRight size={15} /></Link><Link href="/register/agency" className="inline-flex min-h-12 items-center gap-2 border border-graphite-300 bg-paper-50 px-5 text-sm font-medium text-ink-700 hover:bg-paper-100">Register an agency <ArrowUpRight size={15} /></Link></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="border border-graphite-200 bg-paper-50 p-5"><div className="flex items-center gap-3"><Seal kind="check" /><div><p className="font-deed text-lg text-ink-900">Verified professionals</p><p className="mt-1 text-xs leading-5 text-ink-500">EAC registration reviewed before a profile appears.</p></div></div></div>
          <div className="border border-graphite-200 bg-paper-50 p-5"><div className="flex items-center gap-3"><Seal kind="ledger" /><div><p className="font-deed text-lg text-ink-900">A record you can follow</p><p className="mt-1 text-xs leading-5 text-ink-500">Named ownership and a transactionally ordered audit ledger.</p></div></div></div>
        </div>
      </div>
    </section>
    <section id="registry" className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Property registry · Zimbabwe</p><h2 className="mt-2 font-deed text-3xl font-medium text-ink-900">Listings on the record</h2><p className="mt-2 text-sm text-ink-500">Search active properties from approved agents.</p></div>
        <form action="/" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_.8fr_1fr_1fr_auto]"><label className="sr-only" htmlFor="search">Search by area or property</label><div className="relative"><Search size={16} className="absolute left-3 top-3.5 text-ink-500" /><input id="search" name="q" defaultValue={filters.q} placeholder="Area, suburb or property" className="min-h-11 w-full border border-graphite-300 bg-paper-50 pl-9 pr-3 text-sm" /></div><label className="sr-only" htmlFor="city">City</label><input id="city" name="city" defaultValue={filters.city} placeholder="City" className="min-h-11 border border-graphite-300 bg-paper-50 px-3 text-sm" /><label className="sr-only" htmlFor="purpose">Listing purpose</label><RegistrySelect id="purpose" name="purpose" defaultValue={filters.purpose ?? ""}><option value="">Any purpose</option><option value="SALE">For sale</option><option value="RENT">For rent</option><option value="SHORT_STAY">Short stay</option></RegistrySelect><label className="sr-only" htmlFor="type">Property type</label><RegistrySelect id="type" name="type" defaultValue={filters.type ?? ""}><option value="">Any type</option><option value="HOUSE">House</option><option value="APARTMENT">Apartment</option><option value="TOWNHOUSE">Townhouse</option><option value="LAND">Land</option><option value="COMMERCIAL">Commercial</option><option value="FARM">Farm</option><option value="OTHER">Other</option></RegistrySelect><button type="submit" className="min-h-11 border border-brand-700 bg-brand-700 px-5 text-sm font-medium text-white hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">Search</button></form>
      </div>
      <RuleLine label="CURRENT REGISTER" />
      {listingResult?.items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{listingResult.items.map((property) => <PropertyCard key={property.id} property={property} />)}</div> : <div className="border border-graphite-200 bg-paper-100 px-6 py-12 text-center"><BookOpenCheck className="mx-auto text-ink-500" size={23} strokeWidth={1.5} /><h3 className="mt-4 font-deed text-xl text-ink-900">{listingResult ? "No properties match this search." : "The property registry is being prepared."}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-500">{listingResult ? "Adjust the area or search terms to view other listings." : "Approved listings will appear here once agencies and agents complete review."}</p></div>}
      <p className="mt-5 text-xs text-ink-500">{listingResult ? listingResult.totalItems + " active records" : "PROPERTY CONNECT · REGISTRY"}</p>
      {listingResult ? <PaginationControls pathname="/" searchParams={params} page={listingResult.page} pageSize={listingResult.pageSize} totalItems={listingResult.totalItems} /> : null}
    </section>
    <section className="border-y border-graphite-200 bg-paper-100"><div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 md:grid-cols-3">{[["01", "Named access", "Every agent signs in with their own verified account."], ["02", "Reviewed identity", "Agency and EAC information is reviewed before publishing."], ["03", "Direct enquiries", "Buyers contact the professional responsible for each record."]].map(([number, title, copy]) => <article key={number} className="border-l border-graphite-300 pl-4"><span className="font-mono text-[10px] tracking-[.14em] text-ink-500">{number}</span><h3 className="mt-3 font-deed text-xl text-ink-900">{title}</h3><p className="mt-2 text-sm leading-6 text-ink-500">{copy}</p></article>)}</div></section>
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8"><div className="flex flex-col justify-between gap-5 border border-graphite-200 bg-paper-50 p-6 sm:flex-row sm:items-center sm:p-8"><div><p className="flex items-center gap-2 text-xs text-ink-500"><ShieldCheck size={15} /> EAC review · named agent accounts</p><h2 className="mt-3 font-deed text-2xl text-ink-900">Build your professional record.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Agencies can apply for review. Agents join through a named invitation and manage their own listings and enquiries.</p></div><Link href="/register/agency" className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-graphite-300 px-4 text-sm font-medium hover:bg-paper-100">Start agency application <ArrowRight size={15} /></Link></div></section>
  </main>;
}
