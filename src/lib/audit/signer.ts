import "server-only";

import { createPublicKey, verify as verifySignature } from "node:crypto";
import { GetPublicKeyCommand, KMSClient, SignCommand } from "@aws-sdk/client-kms";
import { env, requireConfig } from "@/lib/env";

export type SignedCheckpoint = {
  keyId: string;
  algorithm: string;
  signature: string;
  publicKey: string;
};

export interface CheckpointSigner {
  sign(message: Uint8Array): Promise<SignedCheckpoint>;
  verify(message: Uint8Array, signature: SignedCheckpoint): Promise<boolean>;
}

export class SignerNotConfiguredError extends Error {
  constructor() {
    super("A managed checkpoint signer has not been configured.");
    this.name = "SignerNotConfiguredError";
  }
}

/**
 * Provider adapters implement this contract after the deployment spike selects a KMS.
 * The private key must remain in the managed service; only signatures and public keys
 * may leave it. No local private-key fallback is provided in production.
 */
const algorithm = "ECDSA_SHA_256";

class AwsKmsCheckpointSigner implements CheckpointSigner {
  private client?: KMSClient;
  private getClient() {
    if (this.client) return this.client;
    this.client = new KMSClient({ region: requireConfig(env.auditSignerRegion, "AUDIT_SIGNER_REGION") });
    return this.client;
  }

  async sign(message: Uint8Array): Promise<SignedCheckpoint> {
    const keyId = requireConfig(env.auditSignerKeyId, "AUDIT_SIGNER_KEY_ID");
    const client = this.getClient();
    const [signed, publicKey] = await Promise.all([
      client.send(new SignCommand({ KeyId: keyId, Message: message, MessageType: "RAW", SigningAlgorithm: algorithm })),
      client.send(new GetPublicKeyCommand({ KeyId: keyId })),
    ]);
    if (!signed.Signature || !signed.KeyId || !publicKey.PublicKey || publicKey.KeyUsage !== "SIGN_VERIFY" ||
        !publicKey.SigningAlgorithms?.includes(algorithm)) throw new Error("AWS_KMS_SIGNER_RESPONSE_INVALID");
    return {
      keyId: signed.KeyId, algorithm,
      signature: Buffer.from(signed.Signature).toString("base64"),
      publicKey: Buffer.from(publicKey.PublicKey).toString("base64"),
    };
  }

  async verify(message: Uint8Array, signature: SignedCheckpoint): Promise<boolean> {
    try {
      if (signature.algorithm !== algorithm) return false;
      const key = createPublicKey({ key: Buffer.from(signature.publicKey, "base64"), format: "der", type: "spki" });
      return verifySignature("sha256", Buffer.from(message), { key, dsaEncoding: "der" }, Buffer.from(signature.signature, "base64"));
    } catch {
      return false;
    }
  }
}

export function getCheckpointSigner(): CheckpointSigner {
  if (env.auditSignerProvider !== "aws-kms") throw new SignerNotConfiguredError();
  return new AwsKmsCheckpointSigner();
}
