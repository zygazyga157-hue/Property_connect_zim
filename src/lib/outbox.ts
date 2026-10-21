import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type OutboxInput = {
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
};

export async function enqueueOutbox(tx: Prisma.TransactionClient, input: OutboxInput) {
  return tx.outboxMessage.create({ data: input });
}

export async function processOutboxBatch(limit = 20): Promise<{ processed: number; retried: number }> {
  const messages = await prisma.$transaction(async (tx) => {
    await tx.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
    });
    await tx.outboxMessage.updateMany({
      where: { status: "PROCESSING", lockedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      data: { status: "PENDING", lockedAt: null, availableAt: new Date() },
    });
    const claimed = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "OutboxMessage"
      WHERE "status" = 'PENDING' AND "availableAt" <= CURRENT_TIMESTAMP
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    if (claimed.length === 0) return [];
    const ids = claimed.map((item) => item.id);
    await tx.outboxMessage.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { status: "PROCESSING", lockedAt: new Date() },
    });
    return tx.outboxMessage.findMany({ where: { id: { in: ids }, status: "PROCESSING" } });
  });

  let processed = 0;
  let retried = 0;
  for (const message of messages) {
    try {
      const { dispatchOutboxMessage } = await import("@/lib/outbox-handlers");
      await dispatchOutboxMessage(message.topic, message.payload);
      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: { status: "COMPLETED", lockedAt: null, lastError: null },
      });
      processed += 1;
    } catch {
      const attempts = message.attempts + 1;
      const delaySeconds = Math.min(3600, 15 * 2 ** Math.min(attempts, 8));
      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: attempts >= 12 ? "FAILED" : "PENDING",
          attempts,
          availableAt: new Date(Date.now() + delaySeconds * 1000),
          lockedAt: null,
          lastError: "Delivery failed; retry scheduled.",
        },
      });
      retried += 1;
    }
  }
  return { processed, retried };
}
