import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { DeedPlate } from "@/components/identity";

type Props = { searchParams: Promise<{ reference?: string }> };

export default async function PaymentReturnPage({ searchParams }: Props) {
  const { reference } = await searchParams;
  return <main className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-20"><div className="border border-graphite-200 bg-paper-50 p-6 sm:p-8"><ReceiptText size={22} className="text-ink-700" /><p className="mt-5 font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Payment return</p><h1 className="mt-2 font-deed text-3xl text-ink-900">We are confirming your payment.</h1><p className="mt-3 text-sm leading-6 text-ink-500">Paynow confirms card activation separately. Your card will appear in the workspace after a verified result reaches the registry.</p>{reference ? <div className="mt-5"><DeedPlate title="Payment reference" serial={reference}><p>Keep this reference if you need to contact support.</p></DeedPlate></div> : null}<div className="mt-6 flex gap-4 text-sm"><Link href="/agent/card" className="text-brand-700 underline underline-offset-4">View my card</Link><Link href="/" className="text-ink-500 underline underline-offset-4">Return to registry</Link></div></div></main>;
}
