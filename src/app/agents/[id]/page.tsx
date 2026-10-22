import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { PropertyCard } from "@/components/property-card";
import { DeedPlate, RuleLine } from "@/components/identity";
import { CollectionFilters, PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZES, paginationWindow, requestedPage } from "@/lib/pagination";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AgentPage({ params, searchParams }: Props) {
  const { id } = await params;
  const rawQuery = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rawQuery)) if (typeof value === "string") query.set(key, value);
  const agent = await prisma.agentProfile.findFirst({
    where: { OR: [{ id }, { userId: id }], status: "ACTIVE", agency: { status: "ACTIVE" } },
    include: { agency: { select: { id: true, name: true } } },
  });
  if (!agent) notFound();
  const q = query.get("q")?.trim(); const city = query.get("city")?.trim(); const purpose = query.get("purpose"); const type = query.get("type");
  const propertyWhere = {
    agentProfileId: agent.id, status: "PUBLISHED" as const,
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }, { suburb: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    ...(purpose && ["SALE", "RENT", "SHORT_STAY"].includes(purpose) ? { purpose: purpose as "SALE" | "RENT" | "SHORT_STAY" } : {}),
    ...(type && ["HOUSE", "APARTMENT", "TOWNHOUSE", "LAND", "COMMERCIAL", "FARM", "OTHER"].includes(type) ? { propertyType: type as "HOUSE" | "APARTMENT" | "TOWNHOUSE" | "LAND" | "COMMERCIAL" | "FARM" | "OTHER" } : {}),
  };
  const totalItems = await prisma.property.count({ where: propertyWhere });
  const window = paginationWindow(totalItems, PAGE_SIZES.properties, requestedPage(query));
  const properties = await prisma.property.findMany({
    where: propertyWhere, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize,
    include: { images: { orderBy: { sortOrder: "asc" } }, agentProfile: { select: { fullName: true, status: true, eacRegistrationNumber: true, agency: { select: { name: true, status: true } } } } },
  });
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8"><Link href="/" className="inline-flex items-center gap-2 text-xs text-ink-500"><ArrowLeft size={14} /> Back to registry</Link>
    <div className="mt-7 grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><DeedPlate title={agent.fullName} serial={agent.eacRegistrationNumber}><p className="flex items-center gap-2"><BadgeCheck size={15} /> EAC registration reviewed</p><p className="mt-2">{agent.agency.name}</p>{agent.bio ? <p className="mt-4">{agent.bio}</p> : null}</DeedPlate><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-ink-500">Agent record</p><h1 className="mt-2 font-deed text-4xl text-ink-900">{agent.fullName}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-ink-500">A named professional record maintained by {agent.agency.name}.</p></div></div>
    <RuleLine label="ACTIVE LISTINGS" /><CollectionFilters action={"/agents/" + encodeURIComponent(id)} searchParams={query} fields={[{ name: "q", label: "Search", placeholder: "Property, suburb or description" }, { name: "city", label: "City" }, { name: "purpose", label: "Purpose", options: [{ value: "SALE", label: "For sale" }, { value: "RENT", label: "For rent" }, { value: "SHORT_STAY", label: "Short stay" }] }, { name: "type", label: "Property type", options: ["HOUSE", "APARTMENT", "TOWNHOUSE", "LAND", "COMMERCIAL", "FARM", "OTHER"].map((value) => ({ value, label: value.replaceAll("_", " ") })) }]} /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{properties.length ? properties.map((property) => <PropertyCard key={property.id} property={property} />) : <p className="text-sm text-ink-500">There are no active listings matching these filters.</p>}</div><PaginationControls pathname={"/agents/" + encodeURIComponent(id)} searchParams={query} page={window.page} pageSize={window.pageSize} totalItems={window.totalItems} />
  </main>;
}
