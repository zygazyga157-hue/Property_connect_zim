"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function signOut() {
    setBusy(true);
    try { await authClient.signOut(); router.replace("/"); router.refresh(); }
    finally { setBusy(false); }
  }
  return <button type="button" disabled={busy} onClick={signOut} className="min-h-9 px-3 text-xs text-ink-500 underline underline-offset-4">{busy ? "Closing your session…" : "Sign out"}</button>;
}
