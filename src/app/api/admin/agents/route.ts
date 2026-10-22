import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const q = params.get("q")?.trim();
    const where = {
      ...(status && ["PENDING_REVIEW", "ACTIVE", "SUSPENDED", "REJECTED"].includes(status) ? { status: status as "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "REJECTED" } : {}),
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { eacRegistrationNumber: { contains: q, mode: "insensitive" as const } }, { agency: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
    };
    const totalItems = await prisma.agentProfile.count({ where });
    const window = paginationWindow(totalItems, PAGE_SIZES.workspace, requestedPage(params));
    const agents = await prisma.agentProfile.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: window.skip, take: window.pageSize,
      include: { agency: { select: { id: true, name: true, eacRegistrationNumber: true, status: true } }, user: { select: { id: true, name: true, email: true } } },
    });
    return jsonOk(paginationEnvelope(agents, window));
  });
}
