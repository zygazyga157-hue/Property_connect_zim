import { z } from "zod";

export const transitionStates = {
  agencySignup: z.enum(["idle", "validating", "creating", "seeding", "done", "error_duplicate_eac", "error_invalid"]),
  agentSignup: z.enum(["idle", "validating", "uploading_photo", "pending_approval", "approved", "error_duplicate_eac", "error_invalid"]),
  cardActivation: z.enum(["idle", "scanning", "verifying", "minting", "activating", "sealed", "error_code", "error_locked", "error_already_used", "error_expired_card"]),
  login: z.enum(["idle", "identifying", "verifying", "sealing", "routing", "error_invalid", "error_pending", "error_suspended", "error_card_expired"]),
  logout: z.enum(["idle", "revoking", "clearing", "done"]),
  payment: z.enum(["idle", "initiating", "redirecting", "awaiting", "confirmed", "receipt", "error_declined", "error_timeout", "error_duplicate"]),
  session: z.enum(["active", "reuse_detected", "fp_mismatch", "expired"]),
} as const;

export type TransitionFlow = keyof typeof transitionStates;
export type TransitionState<F extends TransitionFlow> = z.infer<(typeof transitionStates)[F]>;

export const transitionResponseSchema = z.object({
  state: z.string(),
  message: z.string().optional(),
  redirect: z.string().optional(),
});

export type TransitionResponse = z.infer<typeof transitionResponseSchema>;

export function transitionResult(
  state: string,
  message?: string,
  redirect?: string,
): TransitionResponse {
  return transitionResponseSchema.parse({ state, message, redirect });
}
