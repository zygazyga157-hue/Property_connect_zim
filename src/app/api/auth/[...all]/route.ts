import { toNextJsHandler } from "better-auth/next-js";
import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { emailAddress } from "@/lib/schemas";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;

export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/sign-up/email")) {
    const body = await request.clone().json().catch(() => null) as { email?: unknown; callbackURL?: unknown } | null;
    const parsedEmail = emailAddress.safeParse(body?.email);
    let allowed = false;
    if (parsedEmail.success && typeof body?.callbackURL === "string") {
      try {
        const callback = new URL(body.callbackURL, env.appUrl);
        if (callback.origin === new URL(env.appUrl).origin && callback.pathname === "/verify-email") {
          const returnTo = callback.searchParams.get("returnTo");
          if (returnTo === "/register/agency" || returnTo === "/buyer/dashboard") allowed = true;
          else if (returnTo) {
            const target = new URL(returnTo, env.appUrl);
            const token = target.pathname === "/register/agent" ? target.searchParams.get("invite") : null;
            if (token) {
              const tokenHash = createHash("sha256").update(token).digest("hex");
              const invitation = await prisma.agentInvitation.findUnique({ where: { tokenHash }, include: { agency: { select: { status: true } } } });
              allowed = Boolean(invitation && !invitation.acceptedAt && !invitation.revokedAt && invitation.expiresAt > new Date() && invitation.email.toLowerCase() === parsedEmail.data && invitation.agency.status === "ACTIVE");
            }
          }
        }
      } catch {
        allowed = false;
      }
    }
    if (!allowed) return Response.json({ error: { code: "SIGNUP_FLOW_REQUIRED", message: "Create an agency applicant account or use a current agent invitation." } }, { status: 403 });
  }
  return handlers.POST(request);
}
