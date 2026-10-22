import { describe, expect, it } from "vitest";
import { PAGE_SIZES, filterDate, paginationEnvelope, paginationWindow, requestedPage } from "./pagination";

describe("pagination helpers", () => {
  it("uses the first page for missing, malformed, zero, and unsafe page values", () => {
    expect(requestedPage(new URLSearchParams())).toBe(1);
    expect(requestedPage(new URLSearchParams("page=0"))).toBe(1);
    expect(requestedPage(new URLSearchParams("page=-3"))).toBe(1);
    expect(requestedPage(new URLSearchParams("page=abc"))).toBe(1);
    expect(requestedPage(new URLSearchParams("page=9007199254740992"))).toBe(1);
  });

  it("clamps out of range pages and reports an empty collection as page one", () => {
    expect(paginationWindow(51, 25, 8)).toMatchObject({ page: 3, skip: 50, totalPages: 3 });
    expect(paginationWindow(0, 25, 99)).toMatchObject({ page: 1, skip: 0, totalItems: 0, totalPages: 0 });
  });

  it("keeps stable adjacent windows without overlap or gaps", () => {
    const ids = Array.from({ length: 61 }, (_, index) => `row-${index}`);
    const slice = (page: number) => {
      const window = paginationWindow(ids.length, 25, page);
      return ids.slice(window.skip, window.skip + window.pageSize);
    };
    expect(slice(1)).toHaveLength(25);
    expect(slice(2)).toHaveLength(25);
    expect(slice(3)).toHaveLength(11);
    expect([...slice(1), ...slice(2), ...slice(3)]).toEqual(ids);
  });

  it("uses the agreed fixed sizes and emits the consistent collection envelope", () => {
    expect(PAGE_SIZES).toEqual({ properties: 12, enquiries: 10, workspace: 25, dense: 50, cardHistory: 25 });
    const window = paginationWindow(26, 25, 1);
    expect(paginationEnvelope(["a"], window)).toEqual({ items: ["a"], page: 1, pageSize: 25, totalItems: 26, totalPages: 2 });
  });

  it("parses date filters and includes the full end date", () => {
    expect(filterDate("not-a-date")).toBeUndefined();
    expect(filterDate("2026-10-22")?.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(filterDate("2026-10-22", true)?.toISOString()).toBe("2026-10-22T23:59:59.999Z");
    expect(filterDate("2026-10-22T10:00:00.000Z", true)?.toISOString()).toBe("2026-10-22T10:00:00.000Z");
  });
});
