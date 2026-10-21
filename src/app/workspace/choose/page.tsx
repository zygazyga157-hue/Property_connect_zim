import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { DeedPlate } from "@/components/identity";

export const dynamic = "force-dynamic";

export default async function ChooseWorkspacePage() {
  const user = await requireUser(await headers());
  if (user.globalRole === "platform_admin") redirect(user.twoFactorEnabled ? "/admin/dashboard" : "/account/security");
  const [profile, memberships] = await Promise.all([
    prisma.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true, fullName: true, agency: { select: { name: true } } } }),
    prisma.agencyMembership.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { role: true, agency: { select: { name: true } } } }),
  ]);
  if (!profile || !memberships.length) redirect("/workspace");
  return <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-20"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Named account workspaces</p><h1 className="mt-3 font-deed text-4xl text-ink-900">Choose a workspace.</h1><p className="mt-3 text-sm leading-6 text-ink-500">This account has an agency role and a professional agent profile. Choose the records you need to work with.</p><div className="mt-7 grid gap-4 sm:grid-cols-2">{user.globalRole === "buyer" ? <Link href="/buyer/dashboard" className="group"><DeedPlate title="BUYER FILE"><p>Manage saved properties, enquiries and personal search preferences.</p></DeedPlate></Link> : null}<Link href="/agency/dashboard" className="group"><DeedPlate title={memberships[0].role.replace("_", " ")} serial={memberships[0].agency.name}><p>Manage agency operations and shared records.</p></DeedPlate></Link><Link href="/agent/dashboard" className="group"><DeedPlate title="AGENT SEAT" serial={profile.agency.name}><p>Manage your professional listing, leads, profile, and card.</p></DeedPlate></Link></div></main>;
}
