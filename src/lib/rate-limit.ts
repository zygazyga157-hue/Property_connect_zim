import "server-only";

import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { env, requireConfig } from "@/lib/env";
import { ApiError } from "@/lib/errors";

export function hashClientIp(ip: string): string {
  return createHmac("sha256", requireConfig(env.ipHashSecret, "IP_HASH_SECRET"))
    .update(ip || "unknown")
    .digest("hex");
}

export async function enforceRateLimit(key: string, maximum: number, windowMs: number) {
  const resetAt = new Date(Date.now() + windowMs);
  const result = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN ${resetAt}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count", "resetAt"
  `;
  const bucket = result[0];
  if (bucket && bucket.count > maximum) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt.getTime() - Date.now()) / 1000));
    throw new ApiError(429, "RATE_LIMITED", `Try again in ${retryAfter} seconds.`);
  }
}

export function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
}
