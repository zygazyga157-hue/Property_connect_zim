import "server-only";

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { archiveCheckpoint } from "@/lib/r2";
import { ApiError } from "@/lib/errors";

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid outbox payload");
  }
  return value as Payload;
}

export async function dispatchOutboxMessage(topic: string, value: unknown): Promise<void> {
  const payload = asPayload(value);
  if (topic === "email.send") {
    await sendEmail({
      to: String(payload.to),
      subject: String(payload.subject),
      text: String(payload.text),
    });
    return;
  }

  if (topic === "audit.checkpoint.archive") {
    const checkpointId = String(payload.checkpointId);
    const objectKey = `audit/checkpoints/${String(payload.createdAt).slice(0, 10)}/${String(payload.fromSequence)}-${String(payload.toSequence)}-${checkpointId}.json`;
    const body = JSON.stringify(payload);
    await archiveCheckpoint(objectKey, body);
    await prisma.auditCheckpoint.update({
      where: { id: checkpointId },
      data: { archiveObjectKey: objectKey, archivedAt: new Date() },
    });
    return;
  }

  if (topic === "payment.reconcile") {
    // The Paynow status-check endpoint is wired when a payment is created; this item
    // intentionally fails closed until it has a valid persisted poll URL.
    const paymentId = String(payload.paymentId);
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.pollUrl) throw new Error("Payment has no provider poll URL");
    const { reconcilePaynowPayment } = await import("@/lib/payments/service");
    await reconcilePaynowPayment(payment.id);
    return;
  }

  throw new ApiError(500, "UNKNOWN_OUTBOX_TOPIC", `No handler registered for ${topic}.`);
}
