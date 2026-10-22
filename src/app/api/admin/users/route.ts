import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim();
    const status = params.get("status");
    const where = {
      ...(status === "ACTIVE" ? { isSuspended: false } : status === "SUSPENDED" ? { isSuspended: true } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    };
    const totalItems = await prisma.user.count({ where });
    const window = paginationWindow(totalItems, PAGE_SIZES.workspace, requestedPage(params));
    const users = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize,
      select: {
        id: true, name: true, email: true, globalRole: true, isSuspended: true,
        twoFactorEnabled: true, createdAt: true,
        memberships: { where: { status: "ACTIVE" }, select: { role: true, agency: { select: { name: true, status: true } } } },
        agentProfile: { select: { fullName: true, status: true, eacRegistrationNumber: true } },
      },
    });
    return jsonOk(paginationEnvelope(users, window));
  });
}
