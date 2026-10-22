export const PAGE_SIZES = {
  properties: 12,
  enquiries: 10,
  workspace: 25,
  dense: 50,
  cardHistory: 25,
} as const;

export type PaginationWindow = {
  page: number;
  pageSize: number;
  skip: number;
  totalItems: number;
  totalPages: number;
};

export function requestedPage(params: URLSearchParams, key = "page") {
  const value = params.get(key);
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function filterDate(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const input = endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T23:59:59.999Z" : value;
  const timestamp = Date.parse(input);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
}

export function paginationWindow(totalItems: number, pageSize: number, page: number): PaginationWindow {
  const totalPages = Math.ceil(totalItems / pageSize);
  const boundedPage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  return {
    page: boundedPage,
    pageSize,
    skip: (boundedPage - 1) * pageSize,
    totalItems,
    totalPages,
  };
}

export function paginationParams(params: URLSearchParams, pageSize: number, key = "page") {
  return { requestedPage: requestedPage(params, key), pageSize };
}

export function paginationEnvelope<T>(items: T[], window: PaginationWindow) {
  return {
    items,
    page: window.page,
    pageSize: window.pageSize,
    totalItems: window.totalItems,
    totalPages: window.totalPages,
  };
}
