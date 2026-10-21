import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { ApiError } from "@/lib/errors";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return withApiErrors(async () => {
    const id = (await context.params).id;
    const agent = await prisma.agentProfile.findFirst({
      where: { OR: [{ id }, { userId: id }], status: "ACTIVE", agency: { status: "ACTIVE" } },
      select: {
        id: true, fullName: true, bio: true, photoUrl: true, eacRegistrationNumber: true,
        agency: { select: { id: true, name: true } },
        properties: {
          where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 24,
          select: {
            id: true, slug: true, title: true, propertyType: true, purpose: true, city: true, suburb: true,
            priceAmount: true, priceCurrency: true, bedrooms: true, floorAreaSqm: true,
            images: { orderBy: { sortOrder: "asc" }, select: { publicUrl: true, altText: true } },
            agentProfile: { select: { fullName: true, status: true, eacRegistrationNumber: true, agency: { select: { name: true, status: true } } } },
          },
        },
      },
    });
    if (!agent) throw new ApiError(404, "NOT_FOUND", "This agent profile could not be found.");
    return jsonOk(agent);
  });
}
