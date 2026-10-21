import Link from "next/link";
import { ArrowUpRight, BedDouble, MapPin, Ruler } from "lucide-react";
import { StampBadge, VerifiedSeal } from "@/components/identity";
import { SavePropertyButton } from "@/components/buyer-actions";

type PropertyCardData = {
  id: string; slug: string; title: string; propertyType: string; purpose: string; city: string; suburb: string | null;
  priceAmount: { toString(): string } | null; priceCurrency: string | null; bedrooms: number | null; floorAreaSqm: { toString(): string } | null;
  images: { publicUrl: string | null; altText: string | null }[];
  agentProfile: { fullName: string; status: string; eacRegistrationNumber: string; agency: { name: string; status: string } };
};

export function PropertyCard({ property }: { property: PropertyCardData }) {
  const image = property.images[0]?.publicUrl;
  return <article className="group relative overflow-hidden rounded-[4px] border border-graphite-200 bg-paper-50 transition-shadow hover:shadow-[0_14px_34px_rgba(10,20,36,.10)]">
    <div className="relative aspect-[4/3] bg-paper-200">
      <Link href={"/properties/" + property.slug} aria-label={"View " + property.title} className="absolute inset-0 rounded-t-[4px] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-700">
        {image ? <div role="img" aria-label={property.images[0]?.altText ?? property.title} className="size-full bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.02]" style={{ backgroundImage: "url(\"" + image + "\")" }} /> : <div className="paper-grid grid size-full place-items-center"><span className="font-mono text-[10px] uppercase tracking-[.16em] text-ink-500">Property record</span></div>}
      </Link>
      <span className="pointer-events-none absolute left-3 top-3"><StampBadge state={property.purpose} /></span>
      {property.agentProfile.status === "ACTIVE" && property.agentProfile.agency.status === "ACTIVE" ? <span className="pointer-events-none absolute right-3 top-3"><VerifiedSeal /></span> : null}
      <SavePropertyButton propertyId={property.id} className="absolute bottom-3 right-3 z-10" />
    </div>
    <div className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-500">{property.propertyType.replaceAll("_", " ")}</p><h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-ink-900"><Link href={"/properties/" + property.slug} className="rounded-sm focus-visible:outline-2 focus-visible:outline-brand-700">{property.title}</Link></h2></div><ArrowUpRight size={16} className="mt-1 shrink-0 text-ink-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
      <p className="flex items-center gap-1.5 text-xs text-ink-500"><MapPin size={14} />{[property.suburb, property.city].filter(Boolean).join(", ")}</p><div className="flex flex-wrap items-center gap-3 border-t border-graphite-200 pt-3 text-xs text-ink-500">{property.bedrooms !== null ? <span className="inline-flex items-center gap-1"><BedDouble size={14} />{property.bedrooms}</span> : null}{property.floorAreaSqm ? <span className="inline-flex items-center gap-1"><Ruler size={14} />{property.floorAreaSqm.toString()} m²</span> : null}<span className="ml-auto font-semibold text-ink-900">{property.priceAmount ? (property.priceCurrency ?? "USD") + " " + Number(property.priceAmount.toString()).toLocaleString("en-US") : "Price on enquiry"}</span></div>
    </div>
  </article>;
}
