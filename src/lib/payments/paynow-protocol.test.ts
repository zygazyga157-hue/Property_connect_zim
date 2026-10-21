import { describe, expect, it } from "vitest";
import {
  buildPaynowRequestFields,
  generatePaynowHash,
  parsePaynowInitiationResponse,
  PaynowProtocolError,
} from "./paynow-protocol";

const key = "3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977";
const checkout = { reference: "PCZ-123", amount: "1.00", email: "buyer@example.com", name: "Buyer" };
const config = {
  integrationId: "1234",
  integrationKey: key,
  resultUrl: "https://example.test/api/paynow/result",
  returnUrl: "https://example.test/payment/return",
  mode: "test",
  merchantEmail: "merchant@example.com",
};

function signedResponse(fields: URLSearchParams): string {
  fields.set("hash", generatePaynowHash(fields.entries(), key));
  return fields.toString();
}

function expectProtocolFailure(body: string, reason: PaynowProtocolError["reason"]): void {
  try {
    parsePaynowInitiationResponse(body, key);
  } catch (error) {
    expect(error).toBeInstanceOf(PaynowProtocolError);
    expect(error).toMatchObject({ reason });
    return;
  }
  throw new Error(`Expected Paynow protocol failure: ${reason}`);
}

describe("Paynow checkout protocol", () => {
  it("classifies documented unsigned provider error responses and sanitizes their reason", () => {
    expect(parsePaynowInitiationResponse("Status=Error&Error=Invalid+amount+field", key)).toEqual({
      status: "error",
      providerReason: "Invalid amount field",
    });
    expect(parsePaynowInitiationResponse("status=Error&error=Bad+buyer+buyer%40example.com+https%3A%2F%2Fprivate.example%2Fpath", key)).toEqual({
      status: "error",
      providerReason: "Bad buyer [email] [url]",
    });
  });

  it("accepts a valid signed response with trusted Paynow URLs", () => {
    const documentedResponse = "status=Ok&browserurl=https%3A%2F%2Fstaging.paynow.co.zw%2FPayment%2FConfirmPayment%2F9510&pollurl=https%3A%2F%2Fstaging.paynow.co.zw%2FInterface%2FCheckPayment%2F%3Fguid%3Dc7ed41da-0159-46da-b428-69549f770413&paynowreference=9510&hash=750DD0B0DF374678707BB5AF915AF81C228B9058AD57BB7120569EC68BBB9C2EFC1B26C6375D2BC562AC909B3CD6B2AF1D42E1A5E479FFAC8F4FB3FDCE71DF4D";
    expect(parsePaynowInitiationResponse(documentedResponse, key)).toEqual({
      status: "ok",
      redirectUrl: "https://staging.paynow.co.zw/Payment/ConfirmPayment/9510",
      pollUrl: "https://staging.paynow.co.zw/Interface/CheckPayment/?guid=c7ed41da-0159-46da-b428-69549f770413",
    });
  });

  it("rejects invalid hashes, missing details, and untrusted URLs", () => {
    const valid = new URLSearchParams("status=Ok&browserurl=https%3A%2F%2Fwww.paynow.co.zw%2Fpay&pollurl=https%3A%2F%2Fwww.paynow.co.zw%2Fpoll");
    const invalidHash = new URLSearchParams(signedResponse(new URLSearchParams(valid)));
    invalidHash.set("browserurl", "https://attacker.example/pay");
    expectProtocolFailure(invalidHash.toString(), "INVALID_HASH");

    const incomplete = new URLSearchParams("status=Ok&browserurl=https%3A%2F%2Fwww.paynow.co.zw%2Fpay");
    expectProtocolFailure(signedResponse(incomplete), "INCOMPLETE_DETAILS");

    const untrusted = new URLSearchParams("status=Ok&browserurl=https%3A%2F%2Fattacker.example%2Fpay&pollurl=https%3A%2F%2Fwww.paynow.co.zw%2Fpoll");
    expectProtocolFailure(signedResponse(untrusted), "UNTRUSTED_URL");
  });

  it("uses the merchant email in test mode and the payer email in live mode", () => {
    const testFields = buildPaynowRequestFields(checkout, config);
    expect(testFields.get("authemail")).toBe("merchant@example.com");

    const liveFields = buildPaynowRequestFields(checkout, { ...config, mode: "live" });
    expect(liveFields.get("authemail")).toBe("buyer@example.com");
  });

  it("requires a valid merchant email for test mode", () => {
    expect(() => buildPaynowRequestFields(checkout, { ...config, merchantEmail: "" })).toThrow(
      "PAYNOW_MERCHANT_EMAIL must be a valid email address in test mode.",
    );
    expect(() => buildPaynowRequestFields(checkout, { ...config, mode: "sandbox" })).toThrow(
      "PAYNOW_MODE must be either test or live.",
    );
  });
});
