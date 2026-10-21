"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DialogInput, RegistrySelect } from "@/components/form-controls";

type ResultState = { text: string; error?: boolean } | null;
type ReviewDecision = "approve" | "reject" | "suspend" | "restore";

export function ReviewControls({ endpoint, onDone, actions = ["approve", "reject"] }: { endpoint: string; onDone?: () => void; actions?: ReviewDecision[] }) {
  const [busy, setBusy] = useState(false); const [state, setState] = useState<ResultState>(null);
  const [dialogDecision, setDialogDecision] = useState<ReviewDecision | null>(null);
  const router = useRouter();
  async function decide(decision: ReviewDecision, notes?: string) {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, ...(notes ? { notes } : {}) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "The record could not be updated.");
      setState({ text: "Review decision recorded." }); setDialogDecision(null); onDone?.(); router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The record could not be updated.";
      if (!notes) setState({ text: message, error: true });
      else throw new Error(message);
    }
    finally { setBusy(false); }
  }
  const labels: Record<ReviewDecision, string> = { approve: "Approve", reject: "Reject", suspend: "Suspend", restore: "Restore" };
  const dialogTitle = dialogDecision ? labels[dialogDecision] + " this record" : "Record review decision";
  return <div className="flex flex-wrap items-center gap-2">{actions.map((decision) => <button key={decision} type="button" disabled={busy} onClick={() => decision === "approve" ? void decide(decision) : setDialogDecision(decision)} className="min-h-9 border border-graphite-300 px-3 text-xs font-medium hover:bg-paper-100 disabled:opacity-60">{labels[decision]}</button>)}{state ? <span role={state.error ? "alert" : "status"} className="text-xs text-ink-500">{state.text}</span> : null}<DialogInput open={Boolean(dialogDecision)} title={dialogTitle} description="Record the reason for this status change. It will be retained in the audit history and sent to the named account." label="Review reason" submitLabel={dialogDecision ? labels[dialogDecision] : "Continue"} busy={busy} onCancel={() => setDialogDecision(null)} onSubmit={(notes) => dialogDecision ? decide(dialogDecision, notes) : Promise.resolve()} /></div>;
}

export function RevokeCardButton({ endpoint }: { endpoint: string }) {
  const [state, setState] = useState<ResultState>(null); const [busy, setBusy] = useState(false); const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();
  async function revoke(reason: string) {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "The card could not be revoked.");
      setState({ text: "Card revoked." }); setDialogOpen(false); router.refresh();
    } catch (error) { throw new Error(error instanceof Error ? error.message : "The card could not be revoked."); }
    finally { setBusy(false); }
  }
  return <div className="flex items-center gap-3"><button type="button" disabled={busy} onClick={() => setDialogOpen(true)} className="min-h-9 border border-graphite-300 px-3 text-xs hover:bg-paper-100">{busy ? "Revoking…" : "Revoke card"}</button>{state ? <span role={state.error ? "alert" : "status"} className="text-xs text-ink-500">{state.text}</span> : null}<DialogInput open={dialogOpen} title="Revoke this card" description="Record why this professional card is being revoked. This reason becomes part of the audit record." label="Revocation reason" submitLabel="Revoke card" busy={busy} onCancel={() => setDialogOpen(false)} onSubmit={revoke} /></div>;
}

type AdminCardActionName = "assign" | "rotate_activation_code" | "suspend" | "restore" | "revoke";
const cardActionTitle: Record<AdminCardActionName, string> = {
  assign: "Assign or reassign this card",
  rotate_activation_code: "Replace activation code",
  suspend: "Suspend this card",
  restore: "Restore this card",
  revoke: "Revoke this card",
};

export function AdminCardControls({
  endpoint, status, agents,
}: { endpoint: string; status: string; agents: { id: string; fullName: string; agencyName: string }[] }) {
  const [action, setAction] = useState<AdminCardActionName | null>(null);
  const [agentProfileId, setAgentProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ResultState>(null);
  const [activationCode, setActivationCode] = useState("");
  const router = useRouter();
  const canAssign = status === "MINTED" || status === "ASSIGNED";

  async function perform(reason: string) {
    if (!action) return;
    if (action === "assign" && !agentProfileId) throw new Error("Choose an active agent first.");
    setBusy(true);
    try {
      const body = { action, reason, ...(action === "assign" ? { agentProfileId } : {}) };
      const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "The card action could not be completed.");
      setActivationCode(result.data.activationCode ?? "");
      setMessage({ text: action === "revoke" ? "Card revoked." : action === "suspend" ? "Card suspended. Paid time is paused." : action === "restore" ? "Card restored." : action === "assign" ? "Card assigned. Deliver the activation code securely; it will not be shown again." : "Activation code replaced. Deliver it securely; it will not be shown again." });
      setAction(null);
      router.refresh();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "The card action could not be completed.");
    } finally { setBusy(false); }
  }

  const options: AdminCardActionName[] = [
    ...(canAssign ? ["assign"] as AdminCardActionName[] : []),
    ...(status === "ASSIGNED" ? ["rotate_activation_code"] as AdminCardActionName[] : []),
    ...(status === "ACTIVE" ? ["suspend"] as AdminCardActionName[] : []),
    ...(status === "SUSPENDED" ? ["restore"] as AdminCardActionName[] : []),
    ...(status !== "REVOKED" ? ["revoke"] as AdminCardActionName[] : []),
  ];

  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-2">
      {canAssign ? <label className="min-w-52 space-y-1.5 text-xs font-medium text-ink-700">Assign to active agent<RegistrySelect value={agentProfileId} onChange={(event) => setAgentProfileId(event.target.value)}>
        <option value="">Choose agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName} · {agent.agencyName}</option>)}
      </RegistrySelect></label> : null}
      {options.map((item) => <button key={item} type="button" disabled={busy || (item === "assign" && !agentProfileId)} onClick={() => setAction(item)} className="min-h-10 border border-graphite-300 px-3 text-xs font-medium text-ink-700 hover:bg-paper-100 disabled:opacity-50">{cardActionTitle[item]}</button>)}
    </div>
    {message ? <p role={message.error ? "alert" : "status"} className="text-xs text-ink-600">{message.text}</p> : null}
    {activationCode ? <p className="break-all border border-graphite-300 bg-paper-100 p-3 font-mono text-xs">One-time activation code: <strong>{activationCode}</strong></p> : null}
    <DialogInput
      open={Boolean(action)} title={action ? cardActionTitle[action] : "Card action"}
      description={action === "restore" ? "Record why this card is being restored. Its paid time resumes from its paused expiry." : action === "revoke" ? "Revocation is permanent. Record the reason for this action." : action === "suspend" ? "Suspension blocks the professional seat and pauses its paid time until restoration." : action === "assign" ? "This card has not been activated. Record why it is being assigned to the selected agent." : "This replacement code invalidates the previous code. Record why it is being replaced."}
      label="Reason" submitLabel={action ? cardActionTitle[action] : "Continue"} busy={busy}
      onCancel={() => setAction(null)} onSubmit={perform}
    />
  </div>;
}

export function AgencyPropertyControl({ endpoint, status }: { endpoint: string; status: string }) {
  const [state, setState] = useState<ResultState>(null); const [busy, setBusy] = useState(false); const router = useRouter();
  const nextStatus = status === "ARCHIVED" ? "PUBLISHED" : "ARCHIVED";
  async function update() {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "The listing could not be updated.");
      setState({ text: nextStatus === "ARCHIVED" ? "Listing archived." : "Listing republished." }); router.refresh();
    } catch (error) { setState({ text: error instanceof Error ? error.message : "The listing could not be updated.", error: true }); }
    finally { setBusy(false); }
  }
  return <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={update} className="min-h-9 border border-graphite-300 px-3 text-xs hover:bg-paper-100">{busy ? "Saving…" : nextStatus === "ARCHIVED" ? "Archive" : "Republish"}</button>{state ? <span role={state.error ? "alert" : "status"} className="text-xs text-ink-500">{state.text}</span> : null}</div>;
}

export function LeadStatusControl({ endpoint, status }: { endpoint: string; status: string }) {
  const [value, setValue] = useState(status); const [state, setState] = useState<ResultState>(null); const [busy, setBusy] = useState(false); const router = useRouter();
  async function update() {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: value }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "The enquiry could not be updated.");
      setState({ text: "Enquiry updated." }); router.refresh();
    } catch (error) { setState({ text: error instanceof Error ? error.message : "The enquiry could not be updated.", error: true }); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={"lead-status-" + endpoint}>Enquiry status</label><RegistrySelect id={"lead-status-" + endpoint} value={value} onChange={(event) => setValue(event.target.value)} className="min-h-9 min-w-32 px-2 pr-8 text-xs"><option value="NEW">New</option><option value="CONTACTED">Contacted</option><option value="QUALIFIED">Qualified</option><option value="CLOSED_WON">Won</option><option value="CLOSED_LOST">Lost</option><option value="SPAM">Spam</option></RegistrySelect><button type="button" disabled={busy || value === status} onClick={update} className="min-h-9 border border-graphite-300 px-3 text-xs disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>{state ? <span role={state.error ? "alert" : "status"} className="text-xs text-ink-500">{state.text}</span> : null}</div>;
}

export function UserSuspensionControl({ endpoint, isSuspended }: { endpoint: string; isSuspended: boolean }) {
  const [suspended, setSuspended] = useState(isSuspended);
  const [state, setState] = useState<ResultState>(null); const [busy, setBusy] = useState(false); const [dialogOpen, setDialogOpen] = useState(false);
  async function update(reason: string) {
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ isSuspended: !suspended, reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "The account could not be updated.");
      setSuspended(!suspended);
      setState({ text: suspended ? "Account restored." : "Account suspended." });
      setDialogOpen(false);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "The account could not be updated.");
    } finally { setBusy(false); }
  }
  return <div className="flex items-center gap-3"><button type="button" disabled={busy} onClick={() => setDialogOpen(true)} className="min-h-9 border border-graphite-300 px-3 text-xs hover:bg-paper-100">{busy ? "Updating…" : suspended ? "Restore account" : "Suspend account"}</button>{state ? <span role={state.error ? "alert" : "status"} className="text-xs text-ink-500">{state.text}</span> : null}<DialogInput open={dialogOpen} title={suspended ? "Restore this account" : "Suspend this account"} description={suspended ? "Record why this account can regain access." : "Record why this account is losing access."} label={suspended ? "Restoration reason" : "Suspension reason"} submitLabel={suspended ? "Restore account" : "Suspend account"} busy={busy} onCancel={() => setDialogOpen(false)} onSubmit={update} /></div>;
}

export function ChainVerifyAction() {
  const [busy, setBusy] = useState(false); const [state, setState] = useState<ResultState>(null);
  async function verify() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/audit/integrity", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "Chain verification could not complete.");
      setState({ text: result.data.valid ? "The hash chain is intact. " + result.data.checked + " events verified." : "Verification stopped at sequence " + result.data.failedAt + "." , error: !result.data.valid });
    } catch (error) { setState({ text: error instanceof Error ? error.message : "Verification could not complete.", error: true }); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={verify} disabled={busy} className="min-h-10 border border-ink-900 bg-ink-900 px-4 text-xs font-medium text-white hover:bg-brand-900">{busy ? "Verifying chain…" : "Verify chain"}</button>{state ? <p role={state.error ? "alert" : "status"} className="text-xs text-ink-700">{state.text}</p> : null}</div>;
}

export function AuditLiveFeed({ initial }: { initial: { sequence: string; action: string; entityType: string; entityId: string; occurredAt: string; hash: string }[] }) {
  const [events, setEvents] = useState(initial);
  useEffect(() => {
    const after = initial[0]?.sequence ?? "0";
    const stream = new EventSource("/api/admin/audit/stream?after=" + encodeURIComponent(after));
    stream.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as (typeof initial)[number];
        setEvents((current) => [event, ...current].slice(0, 120));
      } catch { /* Ignore malformed stream frames and keep the feed open. */ }
    };
    return () => stream.close();
  }, [initial]);
  return <div aria-live="polite" className="divide-y divide-graphite-200">{events.map((event) => <div key={event.sequence} className="grid gap-3 py-4 sm:grid-cols-[130px_1fr_150px]"><span className="font-mono text-[11px] text-ink-500">#{event.sequence.padStart(8, "0")}</span><div><p className="text-sm font-medium text-ink-900">{event.action.replaceAll(".", " ")}</p><p className="mt-1 text-xs text-ink-500">{event.entityType} · {event.entityId}</p></div><span className="font-mono text-[10px] text-ink-500">{new Date(event.occurredAt).toLocaleString()}</span></div>)}</div>;
}

