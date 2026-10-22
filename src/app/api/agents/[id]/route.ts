import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { ApiError } from "@/lib/errors";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return withApiErrors(async () => {
    const id = (await context.params).id;
    const params = new URL(request.url).searchParams;
    const agent = await prisma.agentProfile.findFirst({
      where: { OR: [{ id }, { userId: id }], status: "ACTIVE", agency: { status: "ACTIVE" } },
      select: {
        id: true, fullName: true, bio: true, photoUrl: true, eacRegistrationNumber: true,
        agency: { select: { id: true, name: true } },
      },
    });
    if (!agent) throw new ApiError(404, "NOT_FOUND", "This agent profile could not be found.");
    const q = params.get("q")?.trim(); const city = params.get("city")?.trim(); const purpose = params.get("purpose"); const type = params.get("type");
    const where = {
      agentProfileId: agent.id, status: "PUBLISHED" as const,
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }, { suburb: { contains: q, mode: "insensitive" as const } }] } : {}),
      ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
      ...(purpose && ["SALE", "RENT", "SHORT_STAY"].includes(purpose) ? { purpose: purpose as "SALE" | "RENT" | "SHORT_STAY" } : {}),
      ...(type && ["HOUSE", "APARTMENT", "TOWNHOUSE", "LAND", "COMMERCIAL", "FARM", "OTHER"].includes(type) ? { propertyType: type as "HOUSE" | "APARTMENT" | "TOWNHOUSE" | "LAND" | "COMMERCIAL" | "FARM" | "OTHER" } : {}),
    };
    const totalItems = await prisma.property.count({ where }); const window = paginationWindow(totalItems, PAGE_SIZES.properties, requestedPage(params));
    const properties = await prisma.property.findMany({
      where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize,
      select: {
        id: true, slug: true, title: true, propertyType: true, purpose: true, city: true, suburb: true,
        priceAmount: true, priceCurrency: true, bedrooms: true, floorAreaSqm: true,
        images: { orderBy: { sortOrder: "asc" }, select: { publicUrl: true, altText: true } },
        agentProfile: { select: { fullName: true, status: true, eacRegistrationNumber: true, agency: { select: { name: true, status: true } } } },
      },
    });
    return jsonOk({ ...agent, properties: paginationEnvelope(properties, window) });
  });
}
