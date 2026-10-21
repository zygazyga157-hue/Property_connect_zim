import Link from "next/link";
import { RuleLine } from "@/components/identity";

export function SiteFooter() {
  return <footer className="mt-20 border-t border-graphite-200 bg-paper-100"><div className="mx-auto max-w-7xl px-5 py-10 sm:px-8"><RuleLine label="PROPERTY CONNECT ZIMBABWE" /><div className="flex flex-col justify-between gap-4 text-xs text-ink-500 sm:flex-row"><p>The record is real. The seat is verified. The key is yours.</p><div className="flex flex-wrap gap-5"><Link href="/register/buyer">For buyers</Link><Link href="/register/agency">For agencies</Link><Link href="/register/agent">For agents</Link><Link href="/login">Account access</Link></div></div></div></footer>;
}
