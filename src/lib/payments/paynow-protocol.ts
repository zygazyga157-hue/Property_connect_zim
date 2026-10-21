import { createHash, timingSafeEqual } from "node:crypto";

export type PaynowCheckoutInput = {
  reference: string;
  amount: string;
  email: string;
  name: string;
};

export type PaynowRequestConfig = {
  integrationId: string;
  integrationKey: string;
  resultUrl: string;
  returnUrl: string;
  mode: string;
  merchantEmail: string;
};

export type PaynowInitiationResult =
  | { status: "ok"; redirectUrl: string; pollUrl: string }
  | { status: "error"; providerReason: string };

export type PaynowProtocolFailure = "INVALID_HASH" | "INVALID_STATUS" | "INCOMPLETE_DETAILS" | "UNTRUSTED_URL";

export class PaynowProtocolError extends Error {
  constructor(readonly reason: PaynowProtocolFailure) {
    super(reason);
    this.name = "PaynowProtocolError";
  }
}

function sha512Upper(value: string): string {
  return createHash("sha512").update(value, "utf8").digest("hex").toUpperCase();
}

export function generatePaynowHash(fields: Iterable<[string, string]>, integrationKey: string): string {
  const content = Array.from(fields)
    .filter(([key]) => key.toLowerCase() !== "hash")
    .map(([, value]) => value)
    .join("");
  return sha512Upper(content + integrationKey);
}

export function verifyPaynowHash(fields: URLSearchParams, integrationKey: string): boolean {
  const supplied = Array.from(fields.entries()).find(([key]) => key.toLowerCase() === "hash")?.[1];
  if (!supplied || !/^[A-Fa-f0-9]{128}$/.test(supplied)) return false;
  const expected = generatePaynowHash(fields.entries(), integrationKey);
  const expectedBytes = Buffer.from(expected, "hex");
  const suppliedBytes = Buffer.from(supplied, "hex");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function getPaynowField(fields: URLSearchParams, name: string): string | undefined {
  const target = name.toLowerCase();
  return Array.from(fields.entries()).find(([key]) => key.toLowerCase() === target)?.[1];
}

export function sanitizePaynowProviderReason(value: string | undefined): string {
  if (!value?.trim()) return "Paynow rejected the checkout request without providing a reason.";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(password|secret|token|key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 300);
}

function isPaynowUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.paynow.co.zw", "staging.paynow.co.zw"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function buildPaynowRequestFields(input: PaynowCheckoutInput, config: PaynowRequestConfig): URLSearchParams {
  const mode = config.mode.trim().toLowerCase();
  if (mode !== "test" && mode !== "live") throw new Error("PAYNOW_MODE must be either test or live.");
  const authEmail = mode === "test" ? config.merchantEmail.trim().toLowerCase() : input.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
    throw new Error(mode === "test" ? "PAYNOW_MERCHANT_EMAIL must be a valid email address in test mode." : "The payer email address is invalid.");
  }

  const returnUrlWithReference = new URL(config.returnUrl);
  returnUrlWithReference.searchParams.set("reference", input.reference);
  const fields = new URLSearchParams();
  fields.set("id", config.integrationId);
  fields.set("reference", input.reference);
  fields.set("amount", input.amount);
  fields.set("additionalinfo", "Property Connect Gold Card");
  fields.set("returnurl", returnUrlWithReference.toString());
  fields.set("resulturl", config.resultUrl);
  fields.set("authemail", authEmail);
  fields.set("authname", input.name);
  fields.set("status", "Message");
  fields.set("hash", generatePaynowHash(fields.entries(), config.integrationKey));
  return fields;
}

export function parsePaynowInitiationResponse(body: string, integrationKey: string): PaynowInitiationResult {
  const fields = new URLSearchParams(body);
  const status = getPaynowField(fields, "status")?.toLowerCase();
  if (status === "error") {
    return { status: "error", providerReason: sanitizePaynowProviderReason(getPaynowField(fields, "error")) };
  }
  if (!verifyPaynowHash(fields, integrationKey)) throw new PaynowProtocolError("INVALID_HASH");
  if (status !== "ok") throw new PaynowProtocolError("INVALID_STATUS");

  const redirectUrl = getPaynowField(fields, "browserurl");
  const pollUrl = getPaynowField(fields, "pollurl");
  if (!redirectUrl || !pollUrl) throw new PaynowProtocolError("INCOMPLETE_DETAILS");
  if (!isPaynowUrl(redirectUrl) || !isPaynowUrl(pollUrl)) throw new PaynowProtocolError("UNTRUSTED_URL");
  return { status: "ok", redirectUrl, pollUrl };
}

export function isPaynowPollUrl(value: string): boolean {
  return isPaynowUrl(value);
}
