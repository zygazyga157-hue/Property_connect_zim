import { ZodError, type ZodType } from "zod";
import { ApiError, asApiError } from "@/lib/errors";

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const field = issue.path.map(String).join(".") || "form";
        (fields[field] ??= []).push(issue.message);
      }
      throw new ApiError(422, "VALIDATION_ERROR", "Some submitted fields need attention.", { fields });
    }
    throw error;
  }
}

export function apiErrorResponse(error: unknown): Response {
  const apiError = asApiError(error);
  if (apiError.status >= 500) {
    console.error("Request failed", apiError.code);
  }
  return Response.json(
    { error: { code: apiError.code, message: apiError.message, ...(apiError.details ? { details: apiError.details } : {}) } },
    { status: apiError.status },
  );
}

export async function withApiErrors(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}
