"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DialogInput, RegistrySelect } from "@/components/form-controls";

type PlanOption = { code: string; name: string; durationDays: number; price: string | null; currency: string; priceApproved: boolean };
type AgentOption = { id: string; fullName: string; eacRegistrationNumber: string };
type CardRow = {
  serial: string; status: string; planName: string; agentName: string | null; agentProfileId: string | null; expiresAt: string | null;
  payments: { status: string; amount: string; currency: string; termDays: number; createdAt: string }[];
};
type Message = { text: string; error?: boolean } | null;

async function requestJson(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? "The card request could not be completed.");
  return result.data;
}

export function AgencyCardPanel({
  plans, agents, cards, canManage,
}: { plans: PlanOption[]; agents: AgentOption[]; cards: CardRow[]; canManage: boolean }) {
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "");
  const [agentProfileId, setAgentProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const router = useRouter();
  const checkoutPlan = plans.find((plan) => plan.code === planCode);

  async function checkout() {
    if (!checkoutPlan?.priceApproved || !checkoutPlan.price) return;
    setBusy(true); setMessage({ text: "Preparing agency checkout…" });
    try {
      const result = await requestJson("/api/agency/cards/checkout", {
        planCode, idempotencyKey: crypto.randomUUID(), agentProfileId: agentProfileId || undefined,
      });
      window.location.assign(result.redirectUrl);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Checkout could not be started.", error: true });
      setBusy(false);
    }
  }

  return <div className="space-y-7">
    {canManage ? <section className="border border-graphite-200 bg-paper-50 p-5">
      <h2 className="font-deed text-xl text-ink-900">Purchase a sponsored card</h2>
      <p className="mt-2 text-sm leading-6 text-ink-500">Choose an agent for automatic activation after payment, or leave the recipient blank to buy unassigned inventory.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5 text-xs font-medium text-ink-700">Card plan<RegistrySelect value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
          {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {plan.durationDays} days</option>)}
        </RegistrySelect></label>
        <label className="space-y-1.5 text-xs font-medium text-ink-700">Assign to agent (optional)<RegistrySelect value={agentProfileId} onChange={(event) => setAgentProfileId(event.target.value)}>
          <option value="">Unassigned agency inventory</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}
        </RegistrySelect></label>
        <div className="flex flex-col justify-end gap-2">
          <p className="text-xs text-ink-500">{checkoutPlan?.priceApproved && checkoutPlan.price ? `${checkoutPlan.currency} ${checkoutPlan.price}` : "Checkout is closed until pricing is approved."}</p>
          <button type="button" onClick={checkout} disabled={busy || !checkoutPlan?.priceApproved || !checkoutPlan.price} className="min-h-11 border border-brand-700 bg-brand-700 px-4 text-xs font-medium text-white hover:bg-brand-900 disabled:opacity-50">{busy ? "Preparing checkout…" : "Continue to Paynow"}</button>
        </div>
      </div>
      {message ? <p role={message.error ? "alert" : "status"} className="mt-3 text-xs text-ink-600">{message.text}</p> : null}
    </section> : <p className="border border-graphite-200 bg-paper-100 p-4 text-sm text-ink-600">Agency staff can view the card register and payments. Card purchases and assignments require an agency administrator.</p>}

    {!cards.length ? <div className="border border-graphite-200 bg-paper-100 p-6 text-sm text-ink-500">No cards have been issued to this agency.</div> : <div className="divide-y divide-graphite-200 border-y border-graphite-200">
      {cards.map((card) => <AgencyCardRow key={card.serial} card={card} agents={agents} canManage={canManage} />)}
    </div>}
  </div>;
}

function AgencyCardRow({ card, agents, canManage }: { card: CardRow; agents: AgentOption[]; canManage: boolean }) {
  const [agentProfileId, setAgentProfileId] = useState(card.agentProfileId ?? "");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [activationCode, setActivationCode] = useState("");
  const router = useRouter();
  const assignable = card.status === "MINTED" || card.status === "ASSIGNED";

  async function assign(reason: string) {
    if (!agentProfileId) throw new Error("Choose an active agent in this agency.");
    setBusy(true);
    try {
      const result = await requestJson(`/api/agency/cards/${encodeURIComponent(card.serial)}/assign`, { agentProfileId, reason });
      setActivationCode(result.activationCode);
      setMessage({ text: "Card assigned. Deliver the activation code securely; it will not be shown again." });
      setReasonOpen(false);
      router.refresh();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "The card could not be assigned.");
    } finally { setBusy(false); }
  }

  return <article className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,.7fr)] md:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-mono text-xs text-ink-900">{card.serial}</h3><span className="border border-graphite-300 px-2 py-1 font-mono text-[9px] uppercase tracking-[.1em] text-ink-600">{card.status}</span></div>
      <p className="mt-1 text-xs text-ink-500">{card.agentName ?? "Unassigned agency inventory"} · {card.planName}{card.expiresAt ? " · Expires " + new Date(card.expiresAt).toLocaleDateString() : ""}</p>
      {card.payments.map((payment, index) => <p key={payment.createdAt + index} className="mt-1 text-[11px] text-ink-500">Payment {payment.status.toLowerCase()} · {payment.currency} {payment.amount} · {payment.termDays} days · {new Date(payment.createdAt).toLocaleDateString()}</p>)}
      {activationCode ? <p className="mt-2 break-all border border-graphite-300 bg-paper-100 p-2 font-mono text-xs">Activation code: <strong>{activationCode}</strong></p> : null}
    </div>
    {canManage && assignable ? <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-40 flex-1 space-y-1 text-xs font-medium text-ink-700">Assign or reassign<RegistrySelect value={agentProfileId} onChange={(event) => setAgentProfileId(event.target.value)}>
        <option value="">Choose active agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}
      </RegistrySelect></label>
      <button type="button" disabled={busy || !agentProfileId} onClick={() => setReasonOpen(true)} className="min-h-11 border border-graphite-300 px-3 text-xs font-medium hover:bg-paper-100 disabled:opacity-50">{busy ? "Assigning…" : card.status === "ASSIGNED" ? "Reassign" : "Assign"}</button>
      {message ? <p role={message.error ? "alert" : "status"} className="w-full text-xs text-ink-600">{message.text}</p> : null}
      <DialogInput open={reasonOpen} title="Assign this card" description="The agent must activate this card with the one-time code. Record why the inventory assignment is being made." label="Assignment reason" submitLabel="Assign card" busy={busy} onCancel={() => setReasonOpen(false)} onSubmit={assign} />
    </div> : null}
  </article>;
}
