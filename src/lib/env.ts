import "server-only";

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  appUrl: process.env.APP_URL ?? (nodeEnv === "production" && !isProductionBuild ? "" : "http://localhost:3000"),
  authSecret:
    process.env.BETTER_AUTH_SECRET ??
    (nodeEnv === "production" && !isProductionBuild
      ? ""
      : "local-development-only-secret-change-before-deploy-000000000000"),
  databaseUrl: process.env.DATABASE_URL ?? (isProductionBuild ? "postgresql://build:build@127.0.0.1:5432/build" : ""),
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "Property Connect <no-reply@example.com>",
  paynowIntegrationId: process.env.PAYNOW_INTEGRATION_ID ?? "",
  paynowIntegrationKey: process.env.PAYNOW_INTEGRATION_KEY ?? "",
  paynowMerchantEmail: process.env.PAYNOW_MERCHANT_EMAIL ?? "",
  paynowResultUrl: process.env.PAYNOW_RESULT_URL ?? "",
  paynowReturnUrl: process.env.PAYNOW_RETURN_URL ?? "",
  paynowMode: process.env.PAYNOW_MODE ?? "test",
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2MediaAccessKeyId: process.env.R2_MEDIA_ACCESS_KEY_ID ?? "",
  r2MediaSecretAccessKey: process.env.R2_MEDIA_SECRET_ACCESS_KEY ?? "",
  r2MediaBucket: process.env.R2_MEDIA_BUCKET ?? "",
  r2AuditAccessKeyId: process.env.R2_AUDIT_ACCESS_KEY_ID ?? "",
  r2AuditSecretAccessKey: process.env.R2_AUDIT_SECRET_ACCESS_KEY ?? "",
  r2AuditBucket: process.env.R2_AUDIT_BUCKET ?? "",
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
  auditSignerProvider: process.env.AUDIT_SIGNER_PROVIDER ?? "",
  auditSignerKeyId: process.env.AUDIT_SIGNER_KEY_ID ?? "",
  auditSignerRegion: process.env.AUDIT_SIGNER_REGION ?? process.env.AWS_REGION ?? "",
  ipHashSecret:
    process.env.IP_HASH_SECRET ??
    (nodeEnv === "production" ? "" : "development-ip-hash-secret-only"),
  cardCodePepper:
    process.env.CARD_CODE_PEPPER ??
    (nodeEnv === "production" ? "" : "local-card-code-pepper-change-before-deploy"),
  cronSecret: process.env.CRON_SECRET ?? "",
};

export function requireConfig(value: string, name: string): string {
  if (value) return value;
  throw new Error(`Missing required environment variable: ${name}`);
}

export function assertProductionConfiguration(): void {
  if (!env.isProduction) return;
  requireConfig(env.authSecret, "BETTER_AUTH_SECRET");
  requireConfig(env.databaseUrl, "DATABASE_URL");
  requireConfig(env.appUrl, "APP_URL");
  requireConfig(env.ipHashSecret, "IP_HASH_SECRET");
  requireConfig(env.cardCodePepper, "CARD_CODE_PEPPER");
  requireConfig(env.r2AccountId, "R2_ACCOUNT_ID");
  requireConfig(env.r2MediaAccessKeyId, "R2_MEDIA_ACCESS_KEY_ID");
  requireConfig(env.r2MediaSecretAccessKey, "R2_MEDIA_SECRET_ACCESS_KEY");
  requireConfig(env.r2MediaBucket, "R2_MEDIA_BUCKET");
  requireConfig(env.r2AuditAccessKeyId, "R2_AUDIT_ACCESS_KEY_ID");
  requireConfig(env.r2AuditSecretAccessKey, "R2_AUDIT_SECRET_ACCESS_KEY");
  requireConfig(env.r2AuditBucket, "R2_AUDIT_BUCKET");
  requireConfig(env.r2PublicBaseUrl, "R2_PUBLIC_BASE_URL");
  requireConfig(env.auditSignerProvider, "AUDIT_SIGNER_PROVIDER");
  requireConfig(env.auditSignerRegion, "AUDIT_SIGNER_REGION");
  requireConfig(env.auditSignerKeyId, "AUDIT_SIGNER_KEY_ID");
  requireConfig(env.cronSecret, "CRON_SECRET");
  requireConfig(env.smtpHost, "SMTP_HOST");
  requireConfig(env.smtpUser, "SMTP_USER");
  requireConfig(env.smtpPass, "SMTP_PASS");
}
