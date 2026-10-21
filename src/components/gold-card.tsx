import type { ReactNode } from "react";
import { BadgeCheck, KeyRound } from "lucide-react";
import { SerialPlate, StampBadge } from "@/components/identity";

function CardDetail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">{label}</p><p className="mt-1 truncate text-xs font-medium text-ink-800">{children}</p></div>;
}

export function GoldCardView({
  serial, status, plan, title = "Professional seat", owner, agency, termDays, activatedAt, expiresAt,
}: {
  serial: string; status: string; plan: string; title?: string; owner?: string | null; agency?: string | null;
  termDays?: number; activatedAt?: string | null; expiresAt?: string | null;
}) {
  return <article aria-label={"Gold Card " + serial} className="relative isolate overflow-hidden rounded-2xl border border-[#b7953b] bg-gradient-to-br from-[#fff9e8] via-[#f5e5b7] to-[#fffdf5] p-5 text-ink-900 shadow-[0_16px_34px_rgba(91,71,24,.14)] sm:p-6">
    <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full border border-[#c6a64d]/30" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-10 size-44 rounded-full border border-[#c6a64d]/25" />
    <div className="relative flex items-start justify-between gap-4">
      <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-md border border-[#c9ad63] bg-white/70 text-[#755d20]"><KeyRound size={16} strokeWidth={1.7} /></span><div><p className="font-mono text-[9px] uppercase tracking-[.17em] text-ink-600">Property Connect Zimbabwe</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#725b1f]">Gold Card · {plan}</p></div></div>
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#c9ad63] bg-white/70 text-[#806720]" aria-hidden="true"><BadgeCheck size={19} strokeWidth={1.6} /></span>
    </div>
    <div className="relative mt-6 flex flex-wrap items-end justify-between gap-3">
      <div><p className="font-deed text-2xl font-medium text-ink-900 sm:text-3xl">{title}</p><div className="mt-2"><SerialPlate>{serial}</SerialPlate></div></div>
      <StampBadge state={status} />
    </div>
    <div className="relative mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-[#c5aa60]/50 pt-4 sm:grid-cols-4">
      {owner ? <CardDetail label="Cardholder">{owner}</CardDetail> : null}
      {agency ? <CardDetail label="Agency">{agency}</CardDetail> : null}
      {termDays !== undefined ? <CardDetail label="Access term">{termDays} days</CardDetail> : null}
      {activatedAt ? <CardDetail label="Activated">{activatedAt}</CardDetail> : null}
      <CardDetail label="Expires">{expiresAt ?? "Not activated"}</CardDetail>
    </div>
    <div className="relative mt-5 flex items-center justify-between border-t border-[#c5aa60]/50 pt-3"><span className="font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">Verified professional access</span><span aria-hidden="true" className="h-px w-10 bg-[#a88835]" /></div>
  </article>;
}
