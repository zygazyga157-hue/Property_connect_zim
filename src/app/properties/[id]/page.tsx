import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, MapPin } from "lucide-react";
import { getPublicProperty } from "@/lib/services/properties";
import { DeedPlate, RuleLine, StampBadge } from "@/components/identity";
import { EnquiryForm } from "@/components/registry-forms";
import { SavePropertyButton } from "@/components/buyer-actions";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function PropertyPage({ params }: Props) {
  const { id } = await params;
  let property;
  try { property = await getPublicProperty(id); } catch { notFound(); }
  const hero = property.images[0]?.publicUrl;
  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12"><Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-ink-500 hover:text-brand-700"><ArrowLeft size={14} /> Back to registry</Link>
    <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_.8fr]"><div><div className="relative aspect-[16/10] overflow-hidden border border-graphite-200 bg-paper-200">{hero ? <div role="img" aria-label={property.images[0]?.altText ?? property.title} className="size-full bg-cover bg-center" style={{ backgroundImage: "url(\"" + hero + "\")" }} /> : <div className="paper-grid grid size-full place-items-center font-mono text-xs uppercase tracking-[.15em] text-ink-500">Property record</div>}<div className="absolute left-4 top-4"><StampBadge state={property.purpose} /></div></div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-ink-500">{property.propertyType.replaceAll("_", " ")}</p><h1 className="mt-2 max-w-3xl font-deed text-3xl font-medium text-ink-900 sm:text-4xl">{property.title}</h1><p className="mt-3 flex items-center gap-2 text-sm text-ink-500"><MapPin size={16} />{[property.address, property.suburb, property.city, property.province].filter(Boolean).join(", ")}</p></div><div className="space-y-3"><p className="font-deed text-2xl text-ink-900">{property.priceAmount ? (property.priceCurrency ?? "USD") + " " + Number(property.priceAmount.toString()).toLocaleString("en-US") : "Price on enquiry"}</p><SavePropertyButton propertyId={property.id} /></div></div>
      <RuleLine label="PROPERTY RECORD" /><div className="grid gap-3 sm:grid-cols-3">{[["Bedrooms", property.bedrooms], ["Bathrooms", property.bathrooms], ["Floor area", property.floorAreaSqm ? property.floorAreaSqm.toString() + " m²" : null], ["Land area", property.landAreaSqm ? property.landAreaSqm.toString() + " m²" : null]].filter(([, value]) => value !== null).map(([label, value]) => <div key={String(label)} className="border border-graphite-200 bg-paper-50 p-3"><p className="text-xs text-ink-500">{label}</p><p className="mt-1 font-mono text-sm text-ink-900">{value}</p></div>)}</div><div className="mt-6 max-w-3xl whitespace-pre-line text-sm leading-7 text-ink-700">{property.description}</div></div>
      <aside className="space-y-5"><DeedPlate title={property.agentProfile.fullName} serial={property.agentProfile.eacRegistrationNumber}><p className="flex items-center gap-2"><BadgeCheck size={15} /> EAC registration reviewed</p><p className="mt-2">{property.agentProfile.agency.name}</p><Link href={"/agents/" + property.agentProfile.id} className="mt-3 inline-block text-xs font-medium text-brand-700 underline underline-offset-4">View agent record</Link></DeedPlate>
        <section className="border border-graphite-200 bg-paper-100 p-5"><h2 className="font-deed text-xl text-ink-900">Enquire about this property</h2><p className="mt-2 text-xs leading-5 text-ink-500">Your message goes directly to the named agent on this record.</p><div className="mt-5"><EnquiryForm propertyId={property.id} /></div></section></aside>
    </div>
    {property.images.length > 1 ? <section className="mt-10"><h2 className="font-deed text-2xl text-ink-900">Property photographs</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{property.images.slice(1).map((image) => <div key={image.id} role="img" aria-label={image.altText ?? property.title} className="aspect-[4/3] border border-graphite-200 bg-cover bg-center" style={{ backgroundImage: image.publicUrl ? "url(\"" + image.publicUrl + "\")" : undefined }} />)}</div></section> : null}
  </main>;
}
