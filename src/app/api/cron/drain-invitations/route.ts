// src/app/api/cron/drain-invitations/route.ts
import { timingSafeEqual } from "node:crypto";
import { env, requireConfig } from "@/lib/env";
import { jsonOk, withApiErrors } from "@/lib/http";
import { processOutboxBatch } from "@/lib/outbox";

export const maxDuration = 60;

function validSecret(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = requireConfig(env.cronSecret, "CRON_SECRET");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function redactError(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@")
    .slice(0, 500);
}

async function drain(request: Request) {
  if (!validSecret(request)) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "A valid cron secret is required." } },
      { status: 401 }
    );
  }

  // Optional one-off backfill: ?after=2025-03-01T00:00:00Z
  const afterParam = new URL(request.url).searchParams.get("after");
  let after: Date | undefined;
  if (afterParam) {
    after = new Date(afterParam);
    if (!Number.isFinite(after.getTime())) {
      return Response.json(
        {
          error: {
            code: "INVALID_AFTER",
            message: "The ?after parameter must be an ISO-8601 timestamp.",
          },
        },
        { status: 400 }
      );
    }
  }
  const createdAtOrAfter = after ?? new Date(0);

  const startedAt = Date.now();
  const MAX_ITERATIONS = 200;
  const TIME_BUDGET_MS = 50_000;
  const BATCH_SIZE = 50;

  let processed = 0;
  let retried = 0;
  let iterations = 0;
  let failureCount = 0;
  let truncated = false;

  while (iterations < MAX_ITERATIONS) {
    if (Date.now() - startedAt >= TIME_BUDGET_MS) {
      truncated = true;
      break;
    }
    iterations += 1;

    const batch = await processOutboxBatch(BATCH_SIZE, {
      filter: {
        topic: "email.send",
        aggregateType: "AgentInvitation",
        createdAtOrAfter,
      },
      includeFailures: true,
      requireEmailDelivery: true,
    });

    processed += batch.processed;
    retried += batch.retried;

    for (const failure of batch.failures ?? []) {
      failureCount += 1;
      console.error(
        `Invitation email ${failure.aggregateId} failed: ${redactError(failure.error)}`
      );
    }

    if (batch.processed + batch.retried === 0) break;
  }

  return jsonOk({
    ok: true,
    processed,
    retried,
    failureCount,
    iterations,
    durationMs: Date.now() - startedAt,
    truncated,
  });
}

export async function GET(request: Request) {
  return withApiErrors(() => drain(request));
}

export async function POST(request: Request) {
  return withApiErrors(() => drain(request));
}
