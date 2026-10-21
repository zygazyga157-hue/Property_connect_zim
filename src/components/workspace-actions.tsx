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

type LeadActivity = { id: string; action: string; note: string | null; details: unknown; createdAt: Date | string; actorUser: { name: string } | null };
type LeadAgent = { id: string; fullName: string };

function localDateTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const activityLabels: Record<string, string> = {
  ENQUIRY_RECEIVED: "Enquiry received", NOTE_ADDED: "Internal note", STATUS_CHANGED: "Status changed",
  ASSIGNED: "Assignment changed", FOLLOW_UP_SET: "Follow-up scheduled", FOLLOW_UP_CLEARED: "Follow-up cleared",
};

function activityDetail(activity: LeadActivity) {
  if (!activity.details || typeof activity.details !== "object") return null;
  const details = activity.details as Record<string, unknown>;
  if (activity.action === "STATUS_CHANGED" && typeof details.from === "string" && typeof details.to === "string") {
    return details.from.replaceAll("_", " ") + " → " + details.to.replaceAll("_", " ");
  }
  if (activity.action === "ASSIGNED" && typeof details.to === "string") return "Assigned to " + details.to;
  if (activity.action === "FOLLOW_UP_SET" && typeof details.at === "string") return "Due " + new Date(details.at).toLocaleString();
  return null;
}

export function LeadWorkflowPanel({ endpoint, status, assignedAgentProfileId, followUpAt, followUpOverdue = false, buyerName, buyerEmail, buyerPhone, message, activities, agents = [], canAssign = false }: {
  endpoint: string; status: string; assignedAgentProfileId: string | null; followUpAt: string | Date | null;
  followUpOverdue?: boolean;
  buyerName: string; buyerEmail: string; buyerPhone: string | null; message: string; activities: LeadActivity[];
  agents?: LeadAgent[]; canAssign?: boolean;
}) {
  const [value, setValue] = useState(status);
  const [assignee, setAssignee] = useState(assignedAgentProfileId ?? "");
  const [followUp, setFollowUp] = useState(localDateTime(followUpAt));
  const [note, setNote] = useState("");
  const [state, setState] = useState<ResultState>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function update() {
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: value, followUpAt: followUp ? new Date(followUp).toISOString() : null, ...(canAssign ? { assignedAgentProfileId: assignee || null } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "The enquiry could not be updated.");
      setNote(""); setState({ text: "Enquiry updated." }); router.refresh();
    } catch (error) { setState({ text: error instanceof Error ? error.message : "The enquiry could not be updated.", error: true }); }
    finally { setBusy(false); }
  }

  return <section className="border border-graphite-200 bg-paper-50 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-sm font-semibold text-ink-900">{buyerName}</h2><p className="mt-1 text-xs text-ink-500">{buyerEmail}{buyerPhone ? " · " + buyerPhone : ""}</p></div>
      <div className="flex flex-wrap gap-2"><a className="inline-flex min-h-9 items-center border border-graphite-300 px-3 text-xs font-medium text-ink-700 hover:bg-paper-100 focus-visible:outline-2 focus-visible:outline-brand-700" href={"mailto:" + encodeURIComponent(buyerEmail)}>Email buyer</a>{buyerPhone ? <a className="inline-flex min-h-9 items-center border border-graphite-300 px-3 text-xs font-medium text-ink-700 hover:bg-paper-100 focus-visible:outline-2 focus-visible:outline-brand-700" href={"tel:" + encodeURIComponent(buyerPhone)}>Call buyer</a> : null}</div>
    </div>
    <blockquote className="mt-4 whitespace-pre-line border-l-2 border-[#c4a44d] bg-paper-100 px-4 py-3 text-sm leading-6 text-ink-700">{message}</blockquote>
    {followUpAt ? <p className={"mt-3 inline-flex items-center gap-2 border px-2.5 py-1 text-xs font-medium " + (followUpOverdue ? "border-red-300 bg-red-50 text-red-800" : "border-[#dfcc91] bg-[#fff9e9] text-ink-800")}>{followUpOverdue ? "Follow-up overdue" : "Follow-up due"} · {new Date(followUpAt).toLocaleString()}</p> : null}
    <div className="mt-5 grid gap-4 border-t border-graphite-200 pt-4 lg:grid-cols-[1fr_1fr]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1.5 block text-xs font-medium text-ink-700" htmlFor={"lead-status-" + endpoint}>Status</label><RegistrySelect id={"lead-status-" + endpoint} value={value} onChange={(event) => setValue(event.target.value)} className="min-h-10 w-full px-2 pr-8 text-xs"><option value="NEW">New</option><option value="CONTACTED">Contacted</option><option value="QUALIFIED">Qualified</option><option value="CLOSED_WON">Won</option><option value="CLOSED_LOST">Lost</option><option value="SPAM">Spam</option></RegistrySelect></div>
        {canAssign ? <div><label className="mb-1.5 block text-xs font-medium text-ink-700" htmlFor={"lead-agent-" + endpoint}>Assigned agent</label><RegistrySelect id={"lead-agent-" + endpoint} value={assignee} onChange={(event) => setAssignee(event.target.value)} className="min-h-10 w-full px-2 pr-8 text-xs"><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</RegistrySelect></div> : null}
        <div><label className="mb-1.5 block text-xs font-medium text-ink-700" htmlFor={"lead-follow-up-" + endpoint}>Follow-up date</label><input id={"lead-follow-up-" + endpoint} type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)} className="min-h-10 w-full border border-graphite-300 bg-paper-50 px-2 text-xs text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-700" /></div>
        <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-medium text-ink-700" htmlFor={"lead-note-" + endpoint}>Add internal note</label><textarea id={"lead-note-" + endpoint} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={2} placeholder="Record a call, viewing, or next step…" className="w-full border border-graphite-300 bg-paper-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline-2 focus-visible:outline-brand-700" /></div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button type="button" disabled={busy} onClick={update} className="inline-flex min-h-10 items-center justify-center border border-brand-700 bg-brand-700 px-4 text-xs font-medium text-white transition-colors hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Saving…" : "Save enquiry"}</button>{state ? <span role={state.error ? "alert" : "status"} className={"text-xs " + (state.error ? "text-red-800" : "text-ink-500")}>{state.text}</span> : null}</div>
      </div>
      <div><h3 className="font-mono text-[10px] uppercase tracking-[.14em] text-ink-500">Activity timeline</h3>{activities.length ? <ol className="mt-3 space-y-3 border-l border-graphite-200 pl-4">{activities.map((activity) => <li key={activity.id} className="relative text-xs"><span className="absolute -left-[21px] top-1 size-2 rounded-full border border-[#b3943c] bg-[#fff7dc]" /><p className="font-medium text-ink-800">{activityLabels[activity.action] ?? activity.action.replaceAll("_", " ").toLowerCase()}</p>{activityDetail(activity) ? <p className="mt-1 text-ink-700">{activityDetail(activity)}</p> : null}{activity.note ? <p className="mt-1 whitespace-pre-line leading-5 text-ink-700">{activity.note}</p> : null}<p className="mt-1 text-ink-500">{activity.actorUser?.name ?? "System"} · {new Date(activity.createdAt).toLocaleString()}</p></li>)}</ol> : <p className="mt-3 text-xs text-ink-500">No follow-up activity has been recorded.</p>}</div>
    </div>
  </section>;
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
  return <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={verify} disabled={busy} className="min-h-10 border border-brand-700 bg-brand-700 px-4 text-xs font-medium text-white hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Verifying chain…" : "Verify chain"}</button>{state ? <p role={state.error ? "alert" : "status"} className="text-xs text-ink-700">{state.text}</p> : null}</div>;
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

