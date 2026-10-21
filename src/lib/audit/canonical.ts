import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function auditDigest(input: {
  sequence: bigint;
  previousHash: string;
  occurredAt: Date;
  actorUserId: string | null;
  agencyId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload: unknown;
}): string {
  return sha256(canonicalJson(input));
}
