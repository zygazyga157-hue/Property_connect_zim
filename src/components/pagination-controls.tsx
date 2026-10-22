import Link from "next/link";
import { paginationWindow } from "@/lib/pagination";

export function PaginationControls({
  pathname,
  searchParams,
  page,
  pageSize,
  totalItems,
  pageKey = "page",
}: {
  pathname: string;
  searchParams: URLSearchParams;
  page: number;
  pageSize: number;
  totalItems: number;
  pageKey?: string;
}) {
  const { page: currentPage, totalPages } = paginationWindow(totalItems, pageSize, page);
  if (totalPages <= 1) return null;
  const baseParams = new URLSearchParams(searchParams);
  baseParams.delete(pageKey);
  const hrefFor = (target: number) => {
    const next = new URLSearchParams(baseParams);
    if (target > 1) next.set(pageKey, String(target));
    const query = next.toString();
    return query ? pathname + "?" + query : pathname;
  };
  const middleStart = Math.max(2, currentPage - 2);
  const middleEnd = Math.min(totalPages - 1, currentPage + 2);
  const pages: (number | "left-gap" | "right-gap")[] = totalPages <= 7
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [1, ...(middleStart > 2 ? ["left-gap" as const] : []), ...Array.from({ length: Math.max(0, middleEnd - middleStart + 1) }, (_, index) => middleStart + index), ...(middleEnd < totalPages - 1 ? ["right-gap" as const] : []), totalPages];
  const linkClass = "inline-flex min-h-9 min-w-9 items-center justify-center border border-graphite-300 px-3 text-xs text-ink-700 hover:bg-paper-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";
  return <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3">
    <p className="text-xs text-ink-500">Showing {Math.min((currentPage - 1) * pageSize + 1, totalItems)}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems}</p>
    <div className="flex flex-wrap items-center gap-1">
      {currentPage > 1 ? <Link className={linkClass} href={hrefFor(currentPage - 1)} rel="prev">Previous</Link> : <span aria-disabled="true" className={linkClass + " cursor-not-allowed opacity-40"}>Previous</span>}
      {pages.map((number) => typeof number !== "number"
        ? <span key={number} aria-hidden="true" className="inline-flex min-h-9 items-center px-1 text-xs text-ink-500">…</span>
        : number === currentPage
          ? <span key={number} aria-current="page" className="inline-flex min-h-9 min-w-9 items-center justify-center border border-brand-700 bg-brand-700 px-3 text-xs font-medium text-white">{number}</span>
          : <Link key={number} aria-label={"Go to page " + number} className={linkClass} href={hrefFor(number)}>{number}</Link>)}
      {currentPage < totalPages ? <Link className={linkClass} href={hrefFor(currentPage + 1)} rel="next">Next</Link> : <span aria-disabled="true" className={linkClass + " cursor-not-allowed opacity-40"}>Next</span>}
    </div>
  </nav>;
}

export function CollectionFilters({
  action,
  searchParams,
  fields,
  submitLabel = "Apply filters",
  preserve = [],
}: {
  action: string;
  searchParams: URLSearchParams;
  fields: { name: string; label: string; placeholder?: string; type?: "text" | "date"; options?: { value: string; label: string }[] }[];
  submitLabel?: string;
  preserve?: string[];
}) {
  const clearParams = new URLSearchParams();
  for (const key of preserve) {
    const value = searchParams.get(key);
    if (value) clearParams.set(key, value);
  }
  const clearHref = clearParams.size ? action + "?" + clearParams.toString() : action;
  return <form action={action} method="get" className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
    {preserve.map((key) => searchParams.get(key) ? <input key={key} type="hidden" name={key} value={searchParams.get(key) ?? ""} /> : null)}
    {fields.map((field) => <label key={field.name} className="grid gap-1 text-[11px] text-ink-500">
      <span>{field.label}</span>
      {field.options ? <select name={field.name} defaultValue={searchParams.get(field.name) ?? ""} className="min-h-10 border border-graphite-300 bg-paper-50 px-3 text-sm text-ink-800"><option value="">All</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        : <input type={field.type ?? "text"} name={field.name} defaultValue={searchParams.get(field.name) ?? ""} placeholder={field.placeholder} className="min-h-10 border border-graphite-300 bg-paper-50 px-3 text-sm text-ink-800" />}
    </label>)}
    <div className="flex items-end gap-2"><button type="submit" className="min-h-10 border border-brand-700 bg-brand-700 px-4 text-xs font-medium text-white hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">{submitLabel}</button><Link href={clearHref} className="inline-flex min-h-10 items-center border border-graphite-300 px-3 text-xs text-ink-700 hover:bg-paper-100">Clear</Link></div>
  </form>;
}
