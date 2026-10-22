import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { createDailyCheckpoint } from "@/lib/audit/checkpoint";
import { ApiError } from "@/lib/errors";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const params = new URL(request.url).searchParams;
    const totalItems = await prisma.auditCheckpoint.count();
    const window = paginationWindow(totalItems, PAGE_SIZES.dense, requestedPage(params));
    const checkpoints = await prisma.auditCheckpoint.findMany({ orderBy: [{ toSequence: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize });
    return jsonOk(paginationEnvelope(checkpoints.map((item) => ({ ...item, fromSequence: item.fromSequence.toString(), toSequence: item.toSequence.toString() })), window));
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    try {
      const result = await createDailyCheckpoint();
      return jsonOk(result ? { ...result, fromSequence: result.fromSequence.toString(), toSequence: result.toSequence.toString() } : null, { status: result ? 201 : 200 });
    } catch {
      throw new ApiError(503, "CHECKPOINT_SIGNER_UNAVAILABLE", "The managed checkpoint signer is not available.");
    }
  });
}
