import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const status = new URL(request.url).searchParams.get("status");
    const agents = await prisma.agentProfile.findMany({
      where: status && ["PENDING_REVIEW", "ACTIVE", "SUSPENDED", "REJECTED"].includes(status)
        ? { status: status as "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "REJECTED" }
        : undefined,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { agency: { select: { id: true, name: true, eacRegistrationNumber: true, status: true } }, user: { select: { id: true, name: true, email: true } } },
    });
    return jsonOk(agents);
  });
}
