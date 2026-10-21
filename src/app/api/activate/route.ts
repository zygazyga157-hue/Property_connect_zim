import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { activateCardSchema } from "@/lib/schemas";
import { activateAdminCard } from "@/lib/services/cards";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, activateCardSchema);
    return jsonOk(await activateAdminCard(user, body.serial, body.code));
  });
}
