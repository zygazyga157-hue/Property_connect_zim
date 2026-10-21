import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function WorkspaceRedirect() {
  const user = await requireUser(await headers());
  if (user.globalRole === "platform_admin") redirect(user.twoFactorEnabled ? "/admin/dashboard" : "/account/security");
  const [agent, agency] = await Promise.all([
    prisma.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.agencyMembership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, select: { agencyId: true } }),
  ]);
  if (agent && agency) redirect("/workspace/choose");
  if (agent) redirect("/agent/dashboard");
  if (agency) redirect("/agency/dashboard");
  redirect("/buyer/dashboard");
}
