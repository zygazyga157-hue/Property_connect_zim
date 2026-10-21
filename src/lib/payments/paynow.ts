import "server-only";

import { env, requireConfig } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import {
  buildPaynowRequestFields,
  isPaynowPollUrl,
  parsePaynowInitiationResponse,
  PaynowProtocolError,
  sanitizePaynowProviderReason,
  verifyPaynowHash,
  type PaynowCheckoutInput,
  type PaynowInitiationResult,
} from "@/lib/payments/paynow-protocol";

export { generatePaynowHash, getPaynowField, verifyPaynowHash } from "@/lib/payments/paynow-protocol";
export type PaynowFields = URLSearchParams;

export class PaynowRejectedError extends ApiError {
  constructor(readonly providerReason: string) {
    super(502, "PAYNOW_REJECTED", "Paynow did not accept this payment request.");
    this.name = "PaynowRejectedError";
  }
}

class PaynowInvalidResponseError extends ApiError {
  constructor(readonly failureReason: string, message: string) {
    super(502, "PAYNOW_RESPONSE_INVALID", message);
    this.name = "PaynowInvalidResponseError";
  }
}

function assertPaynowConfigured(): { integrationId: string; key: string } {
  return {
    integrationId: requireConfig(env.paynowIntegrationId, "PAYNOW_INTEGRATION_ID"),
    key: requireConfig(env.paynowIntegrationKey, "PAYNOW_INTEGRATION_KEY"),
  };
}

export async function initiatePaynowPayment(input: PaynowCheckoutInput): Promise<{ redirectUrl: string; pollUrl: string }> {
  const { integrationId, key } = assertPaynowConfigured();
  const resultUrl = requireConfig(env.paynowResultUrl, "PAYNOW_RESULT_URL");
  const returnUrl = requireConfig(env.paynowReturnUrl, "PAYNOW_RETURN_URL");
  const fields = buildPaynowRequestFields(input, {
    integrationId,
    integrationKey: key,
    resultUrl,
    returnUrl,
    mode: env.paynowMode,
    merchantEmail: env.paynowMerchantEmail,
  });

  const response = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: fields.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new ApiError(502, "PAYNOW_UNAVAILABLE", "Paynow could not start this payment.");

  let result: PaynowInitiationResult;
  try {
    result = parsePaynowInitiationResponse(await response.text(), key);
  } catch (error) {
    throw paynowProtocolError(error);
  }
  if (result.status === "error") {
    throw new PaynowRejectedError(result.providerReason);
  }
  return { redirectUrl: result.redirectUrl, pollUrl: result.pollUrl };
}

export function paynowProtocolError(error: unknown): ApiError {
  if (!(error instanceof PaynowProtocolError)) return new PaynowInvalidResponseError("unknown_protocol_failure", "Paynow returned an invalid response.");
  const message = error.reason === "INVALID_HASH"
    ? "Paynow returned an unverified response."
    : error.reason === "UNTRUSTED_URL"
      ? "Paynow returned an untrusted payment URL."
      : error.reason === "INCOMPLETE_DETAILS"
        ? "Paynow returned incomplete payment details."
        : "Paynow returned an invalid response status.";
  return new PaynowInvalidResponseError(error.reason.toLowerCase(), message);
}

export function paynowFailureForDiagnostics(error: unknown): string | undefined {
  if (error instanceof PaynowRejectedError) return sanitizePaynowProviderReason(error.providerReason);
  if (error instanceof PaynowInvalidResponseError) return `Response validation failed: ${error.failureReason}`;
  return undefined;
}

export async function pollPaynow(pollUrl: string): Promise<URLSearchParams> {
  if (!isPaynowPollUrl(pollUrl)) throw new ApiError(400, "INVALID_POLL_URL", "The payment reference is invalid.");
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
