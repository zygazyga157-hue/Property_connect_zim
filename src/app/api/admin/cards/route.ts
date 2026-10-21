import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { mintCardSchema } from "@/lib/schemas";
import { mintAdminCard } from "@/lib/services/cards";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const cards = await prisma.goldCard.findMany({
      orderBy: { createdAt: "desc" }, take: 200,
      include: { plan: { select: { code: true, name: true } }, owner: { select: { id: true, name: true, email: true } }, agency: { select: { id: true, name: true } }, agentProfile: { select: { id: true, fullName: true, eacRegistrationNumber: true } }, payments: { select: { id: true, status: true, amount: true, currency: true, createdAt: true } } },
    });
    return jsonOk(cards.map((card) => Object.fromEntries(Object.entries(card).filter(([key]) => key !== "activationCodeHash"))));
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requirePlatformAdmin(request.headers);
    const body = await parseJson(request, mintCardSchema);
    return jsonOk(await mintAdminCard(user.id, body), { status: 201 });
  });
}
