import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { mediaUploadSchema } from "@/lib/schemas";
import { createMediaKey, createMediaUpload } from "@/lib/r2";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    await enforceRateLimit("media-upload:" + user.id, 30, 60 * 60 * 1000);
    const body = await parseJson(request, mediaUploadSchema);
    const key = createMediaKey(user.id, body.contentType);
    return jsonOk(await createMediaUpload(key, body.contentType, body.sizeBytes), { status: 201 });
  });
}
