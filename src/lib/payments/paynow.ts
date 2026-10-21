import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { env, requireConfig } from "@/lib/env";
import { ApiError } from "@/lib/errors";

export type PaynowFields = URLSearchParams;

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

function assertPaynowConfigured(): { integrationId: string; key: string } {
  return {
    integrationId: requireConfig(env.paynowIntegrationId, "PAYNOW_INTEGRATION_ID"),
    key: requireConfig(env.paynowIntegrationKey, "PAYNOW_INTEGRATION_KEY"),
  };
}

export async function initiatePaynowPayment(input: {
  reference: string;
  amount: string;
  email: string;
  name: string;
}): Promise<{ redirectUrl: string; pollUrl: string }> {
  const { integrationId, key } = assertPaynowConfigured();
  const resultUrl = requireConfig(env.paynowResultUrl, "PAYNOW_RESULT_URL");
  const returnUrl = requireConfig(env.paynowReturnUrl, "PAYNOW_RETURN_URL");
  const returnUrlWithReference = new URL(returnUrl);
  returnUrlWithReference.searchParams.set("reference", input.reference);
  const fields = new URLSearchParams();
  fields.set("id", integrationId);
  fields.set("reference", input.reference);
  fields.set("amount", input.amount);
  fields.set("additionalinfo", "Property Connect Gold Card");
  fields.set("returnurl", returnUrlWithReference.toString());
  fields.set("resulturl", resultUrl);
  fields.set("authemail", input.email);
  fields.set("authname", input.name);
  fields.set("status", "Message");
  fields.set("hash", generatePaynowHash(fields.entries(), key));

  const response = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: fields.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new ApiError(502, "PAYNOW_UNAVAILABLE", "Paynow could not start this payment.");

  const result = new URLSearchParams(await response.text());
  if (!verifyPaynowHash(result, key)) {
    throw new ApiError(502, "PAYNOW_RESPONSE_INVALID", "Paynow returned an unverified response.");
  }
  if (getPaynowField(result, "status")?.toLowerCase() !== "ok") {
    throw new ApiError(502, "PAYNOW_REJECTED", "Paynow did not accept this payment request.");
  }

  const redirectUrl = getPaynowField(result, "browserurl");
  const pollUrl = getPaynowField(result, "pollurl");
  if (!redirectUrl || !pollUrl || !isPaynowUrl(redirectUrl) || !isPaynowUrl(pollUrl)) {
    throw new ApiError(502, "PAYNOW_RESPONSE_INVALID", "Paynow returned incomplete payment details.");
  }
  return { redirectUrl, pollUrl };
}

function isPaynowUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.paynow.co.zw", "staging.paynow.co.zw"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function pollPaynow(pollUrl: string): Promise<URLSearchParams> {
  if (!isPaynowUrl(pollUrl)) throw new ApiError(400, "INVALID_POLL_URL", "The payment reference is invalid.");
  const { key } = assertPaynowConfigured();
  const response = await fetch(pollUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "",
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(502, "PAYNOW_UNAVAILABLE", "Payment status is temporarily unavailable.");
  const fields = new URLSearchParams(await response.text());
  if (!verifyPaynowHash(fields, key)) {
    throw new ApiError(502, "PAYNOW_RESPONSE_INVALID", "Paynow returned an unverified payment status.");
  }
  return fields;
}
