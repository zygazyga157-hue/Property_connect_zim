import "server-only";

import { env, requireConfig } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { jsonOk, withApiErrors } from "@/lib/http";
import { receivePaynowResult } from "@/lib/payments/service";
import { verifyPaynowHash } from "@/lib/payments/paynow";

export async function handlePaynowResult(request: Request) {
  return withApiErrors(async () => {
    const raw = await request.text();
    if (raw.length > 16_384) throw new ApiError(413, "CALLBACK_TOO_LARGE", "The payment callback is invalid.");
    const fields = new URLSearchParams(raw);
    if (!verifyPaynowHash(fields, requireConfig(env.paynowIntegrationKey, "PAYNOW_INTEGRATION_KEY"))) {
      throw new ApiError(401, "PAYNOW_SIGNATURE_INVALID", "The payment callback could not be verified.");
    }
    const result = await receivePaynowResult(fields);
    return jsonOk({ accepted: true, state: result.state ?? "received" });
  });
}
