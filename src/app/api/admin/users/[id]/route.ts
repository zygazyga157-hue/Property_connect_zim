import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { appendAuditEvent } from "@/lib/audit/chain";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { userStatusSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return withApiErrors(async () => {
    const actor = await requirePlatformAdmin(request.headers);
    const body = await parseJson(request, userStatusSchema);
    const id = (await context.params).id;
    if (id === actor.id && body.isSuspended) throw new ApiError(409, "CANNOT_SUSPEND_SELF", "You cannot suspend the administrator account in use.");
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
      const user = await tx.user.update({ where: { id }, data: { isSuspended: body.isSuspended } });
      if (body.isSuspended) await tx.session.deleteMany({ where: { userId: id } });
      await appendAuditEvent(tx, {
        actorUserId: actor.id, action: body.isSuspended ? "user.suspended" : "user.restored",
        entityType: "User", entityId: id, payload: { email: target.email, reason: body.reason },
      });
      return { id: user.id, email: user.email, isSuspended: user.isSuspended };
    });
    return jsonOk(result);
  });
}
