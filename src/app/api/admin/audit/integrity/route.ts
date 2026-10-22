import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { verifyAuditChain } from "@/lib/audit/chain";
import { verifyStoredCheckpoints } from "@/lib/audit/checkpoint";
import { merkleRoot } from "@/lib/audit/merkle";
import { z } from "zod";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";

const verifySchema = z.object({
  fromSequence: z.string().regex(/^\d+$/).optional(),
  toSequence: z.string().regex(/^\d+$/).optional(),
});

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const params = new URL(request.url).searchParams;
    const totalItems = await prisma.auditCheckpoint.count();
    const window = paginationWindow(totalItems, PAGE_SIZES.dense, requestedPage(params));
    const [head, checkpoints, checkpointVerification] = await Promise.all([
      prisma.auditChainHead.findUnique({ where: { id: "global" } }),
      prisma.auditCheckpoint.findMany({ orderBy: [{ toSequence: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize }),
      verifyStoredCheckpoints(),
    ]);
    const verification = await verifyAuditChain();
    return jsonOk({
      chain: { sequence: (head?.sequence ?? 0n).toString(), lastHash: head?.lastHash ?? "", verification: { ...verification, checked: verification.checked.toString(), failedAt: verification.failedAt?.toString() } },
      checkpoints: paginationEnvelope(checkpoints.map((item) => {
        const verification = checkpointVerification.find((result) => result.id === item.id);
        return {
          ...item,
          fromSequence: item.fromSequence.toString(),
          toSequence: item.toSequence.toString(),
          verification: verification ? {
            ...verification,
            fromSequence: verification.fromSequence.toString(),
            toSequence: verification.toSequence.toString(),
          } : null,
        };
      }), window),
    });
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const input = verifySchema.parse(await request.json());
    const result = await verifyAuditChain(input.fromSequence ? BigInt(input.fromSequence) : 1n, input.toSequence ? BigInt(input.toSequence) : undefined);
    if (result.valid && input.fromSequence && input.toSequence) {
      const hashes = await prisma.auditEvent.findMany({
        where: { sequence: { gte: BigInt(input.fromSequence), lte: BigInt(input.toSequence) } },
        orderBy: { sequence: "asc" }, select: { hash: true },
      });
      return jsonOk({ ...result, checked: result.checked.toString(), lastHash: result.lastHash, merkleRoot: merkleRoot(hashes.map((item) => item.hash)) });
    }
    return jsonOk({ ...result, checked: result.checked.toString(), failedAt: result.failedAt?.toString() });
  });
}
