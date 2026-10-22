import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { mintCardSchema } from "@/lib/schemas";
import { mintAdminCard } from "@/lib/services/cards";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const q = params.get("q")?.trim();
    const now = new Date();
    const statusWhere: Prisma.GoldCardWhereInput = status === "EXPIRED" ? { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }] }
      : status === "ACTIVE" ? { status: "ACTIVE", expiresAt: { gt: now } }
        : status && ["MINTED", "ASSIGNED", "SUSPENDED", "REVOKED"].includes(status) ? { status: status as "MINTED" | "ASSIGNED" | "SUSPENDED" | "REVOKED" } : {};
    const where: Prisma.GoldCardWhereInput = { AND: [statusWhere, ...(q ? [{ OR: [{ serial: { contains: q, mode: "insensitive" as const } }, { owner: { name: { contains: q, mode: "insensitive" as const } } }, { agentProfile: { fullName: { contains: q, mode: "insensitive" as const } } }] }] : [])] };
    const totalItems = await prisma.goldCard.count({ where });
    const window = paginationWindow(totalItems, PAGE_SIZES.workspace, requestedPage(params));
    const cards = await prisma.goldCard.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize,
      include: { plan: { select: { code: true, name: true } }, owner: { select: { id: true, name: true, email: true } }, agency: { select: { id: true, name: true } }, agentProfile: { select: { id: true, fullName: true, eacRegistrationNumber: true } }, payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { id: true, status: true, amount: true, currency: true, createdAt: true } } },
    });
    return jsonOk(paginationEnvelope(cards.map((card) => Object.fromEntries(Object.entries(card).filter(([key]) => key !== "activationCodeHash"))), window));
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requirePlatformAdmin(request.headers);
    const body = await parseJson(request, mintCardSchema);
    return jsonOk(await mintAdminCard(user.id, body), { status: 201 });
  });
}
