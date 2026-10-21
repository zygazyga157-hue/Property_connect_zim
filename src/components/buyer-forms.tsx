"use client";

import { useState } from "react";
import { RegistrySelect } from "@/components/form-controls";

type Preferences = { searchQuery: string | null; city: string | null; propertyType: string | null; purpose: string | null };

export function BuyerPreferencesForm({ initial }: { initial: Preferences }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ text: "Saving your preferences…" });
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/buyer/profile", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ searchQuery: data.get("searchQuery") || null, city: data.get("city") || null, propertyType: data.get("propertyType") || null, purpose: data.get("purpose") || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message ?? "Your preferences could not be saved.");
      setStatus({ text: "Your property preferences are saved." });
    } catch (error) { setStatus({ text: error instanceof Error ? error.message : "Your preferences could not be saved.", error: true }); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-1.5 sm:col-span-2"><label htmlFor="buyer-search" className="block text-xs font-medium text-ink-700">Property or area keywords</label><input id="buyer-search" name="searchQuery" defaultValue={initial.searchQuery ?? ""} maxLength={120} className="min-h-11 w-full rounded-[4px] border border-graphite-300 bg-paper-50 px-3 text-sm" /></div>
    <div className="space-y-1.5"><label htmlFor="buyer-city" className="block text-xs font-medium text-ink-700">City</label><input id="buyer-city" name="city" defaultValue={initial.city ?? ""} maxLength={120} className="min-h-11 w-full rounded-[4px] border border-graphite-300 bg-paper-50 px-3 text-sm" /></div>
    <div className="space-y-1.5"><label htmlFor="buyer-purpose" className="block text-xs font-medium text-ink-700">Purpose</label><RegistrySelect id="buyer-purpose" name="purpose" defaultValue={initial.purpose ?? ""}><option value="">Any purpose</option><option value="SALE">For sale</option><option value="RENT">For rent</option><option value="SHORT_STAY">Short stay</option></RegistrySelect></div>
    <div className="space-y-1.5"><label htmlFor="buyer-type" className="block text-xs font-medium text-ink-700">Property type</label><RegistrySelect id="buyer-type" name="propertyType" defaultValue={initial.propertyType ?? ""}><option value="">Any type</option><option value="HOUSE">House</option><option value="APARTMENT">Apartment</option><option value="TOWNHOUSE">Townhouse</option><option value="LAND">Land</option><option value="COMMERCIAL">Commercial</option><option value="FARM">Farm</option><option value="OTHER">Other</option></RegistrySelect></div>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" disabled={busy} className="min-h-10 border border-brand-700 bg-brand-700 px-4 text-xs font-medium text-white hover:bg-brand-900 disabled:opacity-60">{busy ? "Saving…" : "Save preferences"}</button>{status ? <span role={status.error ? "alert" : "status"} className="text-xs text-ink-600">{status.text}</span> : null}</div>
  </form>;
}
