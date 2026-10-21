import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { auditDigest } from "@/lib/audit/canonical";

export type AuditInput = {
  actorUserId?: string | null;
  agencyId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload: Prisma.InputJsonValue;
};

export async function appendAuditEvent(tx: Prisma.TransactionClient, input: AuditInput) {
  await tx.$executeRaw`INSERT INTO "AuditChainHead" ("id", "sequence", "lastHash", "updatedAt") VALUES ('global', 0, '', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`;

  const heads = await tx.$queryRaw<Array<{ sequence: bigint; lastHash: string }>>`
    SELECT "sequence", "lastHash" FROM "AuditChainHead" WHERE "id" = 'global' FOR UPDATE
  `;
  const head = heads[0];
  if (!head) throw new Error("AUDIT_CHAIN_HEAD_MISSING");

  const sequence = head.sequence + 1n;
  const occurredAt = new Date();
  const eventInput = {
    sequence,
    previousHash: head.lastHash,
    occurredAt,
    actorUserId: input.actorUserId ?? null,
    agencyId: input.agencyId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload,
  };
  const hash = auditDigest(eventInput);

  const event = await tx.auditEvent.create({
    data: { ...eventInput, hash },
  });
  await tx.auditChainHead.update({
    where: { id: "global" },
    data: { sequence, lastHash: hash },
  });
  return event;
}

export async function verifyAuditChain(fromSequence = 1n, toSequence?: bigint) {
  const { prisma } = await import("@/lib/db");
  const events = await prisma.auditEvent.findMany({
    where: {
      sequence: {
        gte: fromSequence,
        ...(toSequence === undefined ? {} : { lte: toSequence }),
      },
    },
    orderBy: { sequence: "asc" },
  });

  const previous = fromSequence > 1n
    ? await prisma.auditEvent.findUnique({ where: { sequence: fromSequence - 1n }, select: { hash: true } })
    : null;
  let previousHash = previous?.hash ?? "";
  let expectedSequence = fromSequence;
  for (const event of events) {
    if (event.sequence !== expectedSequence || event.previousHash !== previousHash) {
      return { valid: false, checked: expectedSequence - fromSequence, failedAt: event.sequence };
    }
    const expectedHash = auditDigest({
      sequence: event.sequence,
      previousHash: event.previousHash,
      occurredAt: event.occurredAt,
      actorUserId: event.actorUserId,
      agencyId: event.agencyId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
    });
    if (expectedHash !== event.hash) {
      return { valid: false, checked: expectedSequence - fromSequence, failedAt: event.sequence };
    }
    previousHash = event.hash;
    expectedSequence += 1n;
  }
  return { valid: true, checked: BigInt(events.length), lastHash: previousHash };
}
