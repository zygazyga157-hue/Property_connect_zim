import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" }, take: 250,
      select: {
        id: true, name: true, email: true, globalRole: true, isSuspended: true,
        twoFactorEnabled: true, createdAt: true,
        memberships: { where: { status: "ACTIVE" }, select: { role: true, agency: { select: { name: true, status: true } } } },
        agentProfile: { select: { fullName: true, status: true, eacRegistrationNumber: true } },
      },
    });
    return jsonOk(users);
  });
}
