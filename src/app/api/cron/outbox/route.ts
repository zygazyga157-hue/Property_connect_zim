import { timingSafeEqual } from "node:crypto";
import { env, requireConfig } from "@/lib/env";
import { jsonOk, withApiErrors } from "@/lib/http";
import { processOutboxBatch } from "@/lib/outbox";
import { createDailyCheckpoint } from "@/lib/audit/checkpoint";

function validSecret(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = requireConfig(env.cronSecret, "CRON_SECRET");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    if (!validSecret(request)) return Response.json({ error: { code: "UNAUTHORIZED", message: "A valid cron secret is required." } }, { status: 401 });
    const outbox = await processOutboxBatch(50);
    const createCheckpoint = new URL(request.url).searchParams.get("checkpoint") === "daily";
    if (!createCheckpoint) return jsonOk({ outbox, checkpointCreated: false });
    try {
      const checkpoint = await createDailyCheckpoint();
      return jsonOk({ outbox, checkpointCreated: Boolean(checkpoint) });
    } catch {
      return jsonOk({ outbox, checkpointCreated: false, checkpointError: "SIGNING_OR_ARCHIVE_UNAVAILABLE" }, { status: 503 });
    }
  });
}
