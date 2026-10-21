import type { ReactNode } from "react";
import { BadgeCheck, BookOpenCheck, Check, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";

export function Seal({ kind = "check", size = "md" }: { kind?: "key" | "check" | "ledger"; size?: "sm" | "md" }) {
  const Icon = kind === "key" ? KeyRound : kind === "ledger" ? BookOpenCheck : ShieldCheck;
  const dimension = size === "sm" ? "size-8" : "size-10";
  return <span aria-hidden="true" className={"inline-flex shrink-0 items-center justify-center rounded-[12px] border border-graphite-300 bg-paper-50 text-ink-700 " + dimension}><Icon size={size === "sm" ? 15 : 18} strokeWidth={1.6} /></span>;
}

export function StampBadge({ state }: { state: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[4px] border border-graphite-300 bg-paper-50 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[.14em] text-ink-700">
      <span aria-hidden="true" className="grid size-3 place-items-center border border-graphite-500">
        {["ACTIVE", "PUBLISHED", "APPROVED", "PAID"].includes(state) ? <Check size={9} strokeWidth={2.5} /> : null}
      </span>
      {state.replaceAll("_", " ")}
    </span>
  );
}

export function SerialPlate({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-[.08em] text-ink-500">{children}</span>;
}

export function RuleLine({ label }: { label?: string }) {
  return <div className="my-5 flex items-center gap-3" aria-hidden={label ? undefined : true}><span className="h-px flex-1 bg-graphite-200 rule-draw" />{label ? <span className="font-mono text-[10px] uppercase tracking-[.14em] text-ink-500">{label}</span> : null}{label ? <span className="h-px flex-1 bg-graphite-200 rule-draw" /> : null}</div>;
}

export function DeedPlate({ title, serial, children }: { title: string; serial?: string; children?: ReactNode }) {
  return <section className="border border-graphite-200 bg-paper-50 p-5"><h2 className="font-deed text-xl font-medium text-ink-900">{title}</h2>{serial ? <div className="mt-2"><SerialPlate>{serial}</SerialPlate></div> : null}{children ? <div className="mt-4 text-sm leading-6 text-ink-700">{children}</div> : null}</section>;
}

export function KeyPlate({ children, sealed = false, className = "" }: { children: ReactNode; sealed?: boolean; className?: string }) {
  return <article className={"relative overflow-hidden rounded-[4px] border border-graphite-700 bg-[#171b22] p-5 text-paper-50 shadow-[0_12px_32px_rgba(10,20,36,.12)] " + className}>{sealed ? <span className="absolute right-4 top-4"><Seal kind="check" size="sm" /></span> : null}{children}</article>;
}

export function SeatMeter({ used, capacity, label = "Professional seats" }: { used: number; capacity: number; label?: string }) {
  const percent = capacity > 0 ? Math.min(100, Math.round(used / capacity * 100)) : 0;
  return <div aria-label={label + ": " + used + " of " + capacity} className="border border-graphite-200 bg-paper-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs text-ink-500">{label}</span><span className="font-mono text-xs text-ink-700">{used} / {capacity}</span></div><div className="mt-3 h-1.5 bg-paper-200" aria-hidden="true"><div className="h-1.5 bg-brand-700 transition-[width]" style={{ width: percent + "%" }} /></div><span className="sr-only" aria-live="polite">{percent}% of seats in use</span></div>;
}

export function SecurityBanner({ sessionId = "VERIFIED SESSION" }: { sessionId?: string }) {
  return <aside className="flex flex-wrap items-center justify-between gap-3 border border-graphite-200 bg-paper-100 px-4 py-3" aria-label="Session security"><span className="flex items-center gap-2 text-xs text-ink-700"><Seal kind="check" size="sm" /> You&apos;re on a verified session.</span><SerialPlate>{sessionId}</SerialPlate></aside>;
}

export function KeyIssued({ serial, message = "Your Gold Card is live. Welcome." }: { serial: string; message?: string }) {
  return <div className="emboss flex gap-4 border border-graphite-300 bg-paper-100 p-5" role="status" aria-live="polite"><Seal kind="key" /><div><p className="font-deed text-lg text-ink-900">{message}</p><div className="mt-1"><SerialPlate>{serial}</SerialPlate></div></div></div>;
}

export function Keyhole() {
  return <LockKeyhole aria-hidden="true" size={17} strokeWidth={1.6} className="text-ink-500" />;
}

export function RegistryQueue({ sequence, position }: { sequence: string; position: number }) {
  return <div className="border border-graphite-200 bg-paper-100 p-4"><SerialPlate>{sequence}</SerialPlate><p className="mt-2 text-sm text-ink-700">Your application is in the manual review queue.</p><p className="mt-1 text-xs text-ink-500" aria-live="polite">Queue position {position}</p></div>;
}

export function RegistryForm({ children, onSubmit, className = "" }: { children: ReactNode; onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void; className?: string }) {
  return <form onSubmit={onSubmit} className={"space-y-4 " + className}>{children}</form>;
}

export function VerifiedSeal({ label = "EAC verified" }: { label?: string }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-ink-700"><BadgeCheck size={15} strokeWidth={1.7} />{label}</span>;
}
