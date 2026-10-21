import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { PropertyCard } from "@/components/property-card";
import { DeedPlate, RuleLine } from "@/components/identity";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AgentPage({ params }: Props) {
  const { id } = await params;
  const agent = await prisma.agentProfile.findFirst({
    where: { OR: [{ id }, { userId: id }], status: "ACTIVE", agency: { status: "ACTIVE" } },
    include: {
      agency: { select: { id: true, name: true } },
      properties: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 24,
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          agentProfile: {
            select: {
              fullName: true, status: true, eacRegistrationNumber: true,
              agency: { select: { name: true, status: true } },
            },
          },
        },
      },
    },
  });
  if (!agent) notFound();
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8"><Link href="/" className="inline-flex items-center gap-2 text-xs text-ink-500"><ArrowLeft size={14} /> Back to registry</Link>
    <div className="mt-7 grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><DeedPlate title={agent.fullName} serial={agent.eacRegistrationNumber}><p className="flex items-center gap-2"><BadgeCheck size={15} /> EAC registration reviewed</p><p className="mt-2">{agent.agency.name}</p>{agent.bio ? <p className="mt-4">{agent.bio}</p> : null}</DeedPlate><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-ink-500">Agent record</p><h1 className="mt-2 font-deed text-4xl text-ink-900">{agent.fullName}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-ink-500">A named professional record maintained by {agent.agency.name}.</p></div></div>
    <RuleLine label="ACTIVE LISTINGS" /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{agent.properties.length ? agent.properties.map((property) => <PropertyCard key={property.id} property={property} />) : <p className="text-sm text-ink-500">There are no active listings on this agent record.</p>}</div>
  </main>;
}
