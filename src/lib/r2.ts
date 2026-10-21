import "server-only";

import { randomUUID } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, requireConfig } from "@/lib/env";

let mediaClient: S3Client | undefined;
let auditClient: S3Client | undefined;

function getR2Client(purpose: "media" | "audit"): S3Client {
  if (purpose === "media" && mediaClient) return mediaClient;
  if (purpose === "audit" && auditClient) return auditClient;
  const accountId = requireConfig(env.r2AccountId, "R2_ACCOUNT_ID");
  const client = new S3Client({
    region: "auto",
    endpoint: "https://" + accountId + ".r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: purpose === "media"
        ? requireConfig(env.r2MediaAccessKeyId, "R2_MEDIA_ACCESS_KEY_ID")
        : requireConfig(env.r2AuditAccessKeyId, "R2_AUDIT_ACCESS_KEY_ID"),
      secretAccessKey: purpose === "media"
        ? requireConfig(env.r2MediaSecretAccessKey, "R2_MEDIA_SECRET_ACCESS_KEY")
        : requireConfig(env.r2AuditSecretAccessKey, "R2_AUDIT_SECRET_ACCESS_KEY"),
    },
  });
  if (purpose === "media") mediaClient = client;
  else auditClient = client;
  return client;
}

export function createMediaKey(userId: string, contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
  };
  const extension = extensions[contentType] ?? ".bin";
  return "media/" + userId + "/" + randomUUID() + extension;
}

export function publicMediaUrl(key: string): string {
  return requireConfig(env.r2PublicBaseUrl, "R2_PUBLIC_BASE_URL").replace(/\/$/, "") + "/" + key;
}

export async function createMediaUpload(key: string, contentType: string, sizeBytes: number) {
  const bucket = requireConfig(env.r2MediaBucket, "R2_MEDIA_BUCKET");
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  const uploadUrl = await getSignedUrl(getR2Client("media"), command, { expiresIn: 5 * 60 });
  return { uploadUrl, objectKey: key, publicUrl: publicMediaUrl(key) };
}

export async function archiveCheckpoint(objectKey: string, body: string): Promise<void> {
  const bucket = requireConfig(env.r2AuditBucket, "R2_AUDIT_BUCKET");
  const client = getR2Client("audit");
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: "application/json",
      IfNoneMatch: "*",
      Metadata: { "record-class": "audit-checkpoint" },
    }));
  } catch (error) {
    const statusCode = error && typeof error === "object" && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
    if (statusCode !== 412) throw error;
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  }
}
