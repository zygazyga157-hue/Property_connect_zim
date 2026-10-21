"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";

export function SavePropertyButton({ propertyId, initialSaved = false, className = "", refreshOnToggle = false }: { propertyId: string; initialSaved?: boolean; className?: string; refreshOnToggle?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState(initialSaved);
  const [statusKnown, setStatusKnown] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [requiredFlow, setRequiredFlow] = useState<"sign-in" | "verification" | null>(null);

  async function toggle() {
    setBusy(true); setMessage(""); setRequiredFlow(null);
    try {
      let currentSaved = saved;
      if (!statusKnown) {
        const check = await fetch("/api/buyer/saved-properties/" + encodeURIComponent(propertyId));
        const checkResult = await check.json().catch(() => ({}));
        if (!check.ok) {
          if (check.status === 401 || check.status === 403 && checkResult?.error?.code === "EMAIL_VERIFICATION_REQUIRED") {
            setRequiredFlow(check.status === 401 ? "sign-in" : "verification");
            setMessage(check.status === 401 ? "Sign in to save properties." : "Verify your email to save properties.");
            return;
          }
          throw new Error(checkResult?.error?.message ?? "This property could not be checked.");
        }
        currentSaved = Boolean(checkResult?.data?.saved);
        setSaved(currentSaved); setStatusKnown(true);
      }
      const response = await fetch(currentSaved ? "/api/buyer/saved-properties/" + encodeURIComponent(propertyId) : "/api/buyer/saved-properties", {
        method: currentSaved ? "DELETE" : "POST",
        headers: currentSaved ? undefined : { "content-type": "application/json" },
        body: currentSaved ? undefined : JSON.stringify({ propertyId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 && result?.error?.code === "EMAIL_VERIFICATION_REQUIRED") {
          setRequiredFlow(response.status === 401 ? "sign-in" : "verification");
          setMessage(response.status === 401 ? "Sign in to save properties." : "Verify your email to save properties.");
          return;
        }
        throw new Error(result?.error?.message ?? "This property could not be updated.");
      }
      setSaved(!currentSaved); setStatusKnown(true);
      setMessage(currentSaved ? "Removed from saved properties." : "Property saved.");
      if (refreshOnToggle) router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "This property could not be updated."); }
    finally { setBusy(false); }
  }

  return <div className={"flex flex-col items-start gap-1 " + className}>
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} aria-label={saved ? "Remove saved property" : "Save property"} className="inline-flex min-h-10 items-center gap-2 border border-graphite-300 bg-paper-50 px-3 text-xs font-medium text-ink-800 shadow-sm hover:bg-paper-100 disabled:opacity-60">
      {saved ? <BookmarkCheck aria-hidden="true" size={15} /> : <Bookmark aria-hidden="true" size={15} />}{busy ? "Updating…" : saved ? "Saved" : "Save property"}
    </button>
    {message ? <span role="status" className="max-w-56 bg-paper-50/95 px-2 py-1 text-[11px] text-ink-700">{message}{requiredFlow === "sign-in" ? <> <Link className="underline underline-offset-2" href={"/login?returnTo=" + encodeURIComponent(pathname || "/buyer/dashboard")}>Sign in</Link> · <Link className="underline underline-offset-2" href="/register/buyer">Create account</Link></> : null}{requiredFlow === "verification" ? <> <Link className="underline underline-offset-2" href="/verify-email">Verify email</Link></> : null}</span> : null}
  </div>;
}
