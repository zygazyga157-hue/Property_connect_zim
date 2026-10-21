import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const status = new URL(request.url).searchParams.get("status");
    const agencies = await prisma.agency.findMany({
      where: status && ["PENDING_REVIEW", "ACTIVE", "SUSPENDED", "REJECTED", "DEREGISTERED"].includes(status)
        ? { status: status as "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "REJECTED" | "DEREGISTERED" }
        : undefined,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { _count: { select: { agents: true, properties: true } } },
    });
    return jsonOk(agencies);
  });
}
