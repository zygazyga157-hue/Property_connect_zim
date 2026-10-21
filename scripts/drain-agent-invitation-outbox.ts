import "dotenv/config";

const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseAfterTimestamp(args: string[]): Date {
  if (args.length !== 2 || args[0] !== "--after" || !timestampPattern.test(args[1])) {
    throw new Error("Usage: npm run outbox:drain:agent-invitations -- --after <ISO-8601 timestamp with timezone>");
  }
  const after = new Date(args[1]);
  if (!Number.isFinite(after.getTime())) throw new Error("The --after timestamp is invalid.");
  return after;
}

function redactError(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@")
    .slice(0, 500);
}

async function main(): Promise<void> {
  const after = parseAfterTimestamp(process.argv.slice(2));
  const { processOutboxBatch } = await import("../src/lib/outbox");
  const { prisma } = await import("../src/lib/db");
  let processed = 0;
  let retried = 0;

  try {
    while (true) {
      const batch = await processOutboxBatch(50, {
        filter: { topic: "email.send", aggregateType: "AgentInvitation", createdAtOrAfter: after },
        includeFailures: true,
        requireEmailDelivery: true,
      });
      processed += batch.processed;
      retried += batch.retried;
      for (const failure of batch.failures ?? []) {
        console.error(`Invitation email ${failure.aggregateId} failed: ${redactError(failure.error)}`);
      }
      if (batch.processed + batch.retried === 0) break;
    }

    console.info(`Invitation email drain finished: ${processed} delivered, ${retried} failed and scheduled for retry.`);
    if (retried > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Invitation email drain failed.");
  console.error(error instanceof Error ? redactError(error.message) : "Unknown error");
  process.exitCode = 1;
});
