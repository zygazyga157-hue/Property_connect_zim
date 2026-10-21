import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { createDailyCheckpoint } from "@/lib/audit/checkpoint";
import { ApiError } from "@/lib/errors";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const checkpoints = await prisma.auditCheckpoint.findMany({ orderBy: { toSequence: "desc" }, take: 90 });
    return jsonOk(checkpoints.map((item) => ({ ...item, fromSequence: item.fromSequence.toString(), toSequence: item.toSequence.toString() })));
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
