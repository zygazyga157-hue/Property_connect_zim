import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return <footer className="mt-20 border-t border-graphite-200 bg-paper-100"><div className="mx-auto max-w-7xl px-5 py-10 sm:px-8"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><Image src="/brand/property-connect-logo.png" alt="Property Connect Zimbabwe" width={736} height={586} className="h-16 w-20 object-contain" /><p className="max-w-xs text-xs leading-5 text-ink-500">The record is real. The seat is verified. The key is yours.</p></div><div className="flex flex-wrap gap-5 text-xs text-ink-500"><Link href="/register/buyer">For buyers</Link><Link href="/register/agency">For agencies</Link><Link href="/register/agent">For agents</Link><Link href="/login">Account access</Link></div></div></div></footer>;
}
