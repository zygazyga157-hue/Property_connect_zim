import "server-only";

import { createPublicKey, verify as verifySignature } from "node:crypto";
import { prisma } from "@/lib/db";
import { merkleRoot } from "@/lib/audit/merkle";
import { getCheckpointSigner } from "@/lib/audit/signer";
import { enqueueOutbox } from "@/lib/outbox";

export function checkpointSigningPayload(input: {
  fromSequence: bigint;
  toSequence: bigint;
  merkleRoot: string;
  previousRoot: string | null;
}) {
  return JSON.stringify({
    version: 1,
    fromSequence: input.fromSequence.toString(),
    toSequence: input.toSequence.toString(),
    merkleRoot: input.merkleRoot,
    previousRoot: input.previousRoot,
  });
}

export function verifyCheckpointSignature(input: {
  fromSequence: bigint;
  toSequence: bigint;
  merkleRoot: string;
  previousRoot: string | null;
  signature: string;
  signingAlgorithm: string;
  signingPublicKey: string;
}) {
  try {
    if (input.signingAlgorithm !== "ECDSA_SHA_256") return false;
    const publicKey = createPublicKey({
      key: Buffer.from(input.signingPublicKey, "base64"),
      format: "der",
      type: "spki",
    });
    return verifySignature(
      "sha256",
      Buffer.from(checkpointSigningPayload(input)),
      { key: publicKey, dsaEncoding: "der" },
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export async function createDailyCheckpoint() {
  const signer = getCheckpointSigner();
  const last = await prisma.auditCheckpoint.findFirst({ orderBy: { toSequence: "desc" } });
  const head = await prisma.auditChainHead.findUnique({ where: { id: "global" }, select: { sequence: true } });
  const fromSequence = (last?.toSequence ?? 0n) + 1n;
  const toSequence = head?.sequence ?? 0n;
  if (toSequence < fromSequence) return null;

  const events = await prisma.auditEvent.findMany({
    where: { sequence: { gte: fromSequence, lte: toSequence } },
    orderBy: { sequence: "asc" },
    select: { hash: true },
  });
  if (BigInt(events.length) !== toSequence - fromSequence + 1n) throw new Error("AUDIT_CHECKPOINT_SEQUENCE_GAP");
  const root = merkleRoot(events.map((event) => event.hash));
  if (!root) return null;
  const previousRoot = last?.merkleRoot ?? null;
  const signingPayload = checkpointSigningPayload({ fromSequence, toSequence, merkleRoot: root, previousRoot });
  const signed = await signer.sign(new TextEncoder().encode(signingPayload));

  return prisma.$transaction(async (tx) => {
    const currentLast = await tx.auditCheckpoint.findFirst({
      orderBy: { toSequence: "desc" },
      select: { toSequence: true },
    });
    if ((currentLast?.toSequence ?? 0n) + 1n !== fromSequence) return null;
    const checkpoint = await tx.auditCheckpoint.create({
      data: {
        fromSequence,
        toSequence,
        merkleRoot: root,
        signature: signed.signature,
        signingKeyId: signed.keyId,
        signingAlgorithm: signed.algorithm,
        signingPublicKey: signed.publicKey,
        previousRoot,
      },
    });
    await enqueueOutbox(tx, {
      topic: "audit.checkpoint.archive",
      aggregateType: "AuditCheckpoint",
      aggregateId: checkpoint.id,
      payload: {
        checkpointId: checkpoint.id,
        fromSequence: fromSequence.toString(),
        toSequence: toSequence.toString(),
        merkleRoot: root,
        previousRoot,
        signature: signed.signature,
        signingKeyId: signed.keyId,
        signingAlgorithm: signed.algorithm,
        signingPublicKey: signed.publicKey,
        createdAt: checkpoint.createdAt.toISOString(),
      },
    });
    return checkpoint;
  });
}

export async function verifyStoredCheckpoints() {
  const checkpoints = await prisma.auditCheckpoint.findMany({ orderBy: { fromSequence: "asc" } });
  let expectedPreviousRoot: string | null = null;
  const results = [];
  for (const checkpoint of checkpoints) {
    const events = await prisma.auditEvent.findMany({
      where: { sequence: { gte: checkpoint.fromSequence, lte: checkpoint.toSequence } },
      orderBy: { sequence: "asc" },
      select: { hash: true },
    });
    const completeRange = BigInt(events.length) === checkpoint.toSequence - checkpoint.fromSequence + 1n;
    const actualRoot = completeRange ? merkleRoot(events.map((event) => event.hash)) : null;
    const rootValid = actualRoot === checkpoint.merkleRoot;
    const checkpointLinkValid = checkpoint.previousRoot === expectedPreviousRoot;
    const signatureValid = verifyCheckpointSignature(checkpoint);
    results.push({
      id: checkpoint.id,
      fromSequence: checkpoint.fromSequence,
      toSequence: checkpoint.toSequence,
      merkleRoot: checkpoint.merkleRoot,
      previousRoot: checkpoint.previousRoot,
      archivedAt: checkpoint.archivedAt,
      completeRange,
      rootValid,
      checkpointLinkValid,
      signatureValid,
      valid: completeRange && rootValid && checkpointLinkValid && signatureValid,
    });
    expectedPreviousRoot = checkpoint.merkleRoot;
  }
  return results;
}
