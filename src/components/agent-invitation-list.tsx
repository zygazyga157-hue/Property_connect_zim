"use client";

import { useEffect, useState } from "react";
import { DialogInput } from "@/components/form-controls";

type InvitationType = "agency" | "subagent";
type Invitation = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
};
type ResultState = { message: string; error?: boolean } | null;

async function readError(response: Response, fallback: string) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? fallback);
  return result?.data;
}

export function AgentInvitationList({ invitationType, refreshKey, canManage = true, canResend = true, manageMessage }: { invitationType: InvitationType; refreshKey: number; canManage?: boolean; canResend?: boolean; manageMessage?: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [state, setState] = useState<ResultState>(null);

  useEffect(() => {
    let current = true;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/agency/invitations?type=" + invitationType, { cache: "no-store" });
        const data = await readError(response, "Invitations could not be loaded.");
        if (current) setInvitations(data as Invitation[]);
      } catch (error) {
        if (current) setState({ message: error instanceof Error ? error.message : "Invitations could not be loaded.", error: true });
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, [invitationType, refreshKey, localRefresh]);

  async function resend(invitation: Invitation) {
    setBusyId(invitation.id);
    setState(null);
    try {
      const response = await fetch(`/api/agency/invitations/${encodeURIComponent(invitation.id)}/resend?type=${invitationType}`, { method: "POST" });
      await readError(response, "The invitation could not be resent.");
      setState({ message: "A replacement invitation has been queued for email delivery." });
      setLocalRefresh((value) => value + 1);
    } catch (error) {
      setState({ message: error instanceof Error ? error.message : "The invitation could not be resent.", error: true });
    } finally { setBusyId(null); }
  }

  async function revoke(reason: string) {
    if (!revokeId) return;
    setBusyId(revokeId);
    try {
      const response = await fetch(`/api/agency/invitations/${encodeURIComponent(revokeId)}?type=${invitationType}`, {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }),
      });
      await readError(response, "The invitation could not be revoked.");
      setRevokeId(null);
      setState({ message: "Invitation revoked." });
      setLocalRefresh((value) => value + 1);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "The invitation could not be revoked.");
    } finally { setBusyId(null); }
  }

  return <section className="mt-5 border-t border-graphite-200 pt-4" aria-labelledby="agent-invitations-heading">
    <h3 id="agent-invitations-heading" className="font-deed text-lg text-ink-900">Invitation register</h3>
    <p className="mt-1 text-xs leading-5 text-ink-500">Resending replaces the previous link. Revoked and expired invitations cannot be used.</p>
    {!canManage ? <p className="mt-2 text-xs text-ink-600">{manageMessage ?? "Invitation changes require an active professional card."}</p> : null}
    {canManage && !canResend ? <p className="mt-2 text-xs text-ink-600">This agency is not accepting new agent registrations. Pending invitations can still be revoked.</p> : null}
    {state ? <p role={state.error ? "alert" : "status"} className="mt-3 text-xs text-ink-700">{state.message}</p> : null}
    {loading ? <p className="mt-3 text-xs text-ink-500" role="status">Loading invitations…</p> : invitations.length ? <ul className="mt-3 divide-y divide-graphite-200 border-y border-graphite-200">
      {invitations.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="break-all text-xs font-medium text-ink-900">{invitation.email}</p>
          <p className="mt-1 text-[11px] text-ink-500">{invitation.status.replace("_", " ")} · sent {new Date(invitation.createdAt).toLocaleDateString()} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && invitation.status === "PENDING" ? <button type="button" disabled={busyId === invitation.id} onClick={() => setRevokeId(invitation.id)} className="min-h-9 border border-graphite-300 px-3 text-xs hover:bg-paper-100 disabled:opacity-60">Revoke</button> : null}
          {canManage && canResend && (invitation.status === "PENDING" || invitation.status === "EXPIRED") ? <button type="button" disabled={busyId === invitation.id} onClick={() => void resend(invitation)} className="min-h-9 border border-brand-700 px-3 text-xs text-brand-800 hover:bg-paper-100 disabled:opacity-60">{busyId === invitation.id ? "Working…" : "Resend"}</button> : null}
        </div>
      </li>)}
    </ul> : !state?.error ? <p className="mt-3 text-xs text-ink-500">No invitations have been sent yet.</p> : null}
    <DialogInput open={Boolean(revokeId)} title="Revoke this invitation" description="The recipient will no longer be able to use this registration link. Record a reason for the audit history." label="Revocation reason" submitLabel="Revoke invitation" busy={Boolean(revokeId && busyId === revokeId)} onCancel={() => setRevokeId(null)} onSubmit={revoke} />
  </section>;
}
