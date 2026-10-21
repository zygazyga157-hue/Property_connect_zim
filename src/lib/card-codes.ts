import { createHmac, timingSafeEqual } from "node:crypto";
import { env, requireConfig } from "@/lib/env";

export function hashActivationCode(code: string): string {
  return createHmac("sha256", requireConfig(env.cardCodePepper, "CARD_CODE_PEPPER")).update(code).digest("hex");
}

export function activationCodeMatches(code: string, storedHash: string): boolean {
  const actual = Buffer.from(hashActivationCode(code), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
