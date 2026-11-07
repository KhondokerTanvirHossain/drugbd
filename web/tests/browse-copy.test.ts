import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browseCount, browseHref } from "@/components/public/BrowseList";
import { browseMedicines } from "@/lib/api";
import { BROWSE_COPY, HEADER_SEARCH, fill } from "@/lib/copy";
import * as LEAF from "@/lib/header-search-copy";
import { NAV } from "@/lib/public-copy";
import { BROWSE_DIGITS, BROWSE_LETTERS, parseLetter } from "@/lib/public-params";

describe("BROWSE_COPY and HEADER_SEARCH (§6.11), verbatim", () => {
  it("pins the header search strings", () => {
    expect(HEADER_SEARCH).toEqual({
      help: "Suggestions appear as you type. Up and down arrows to move, Enter to open, Esc to close.",
      allResults: "All results for “{q}”",
    });
    expect(fill(HEADER_SEARCH.allResults, { q: "nap" })).toBe("All results for “nap”");
    // the island's light module (§10.6) is the one source: lib/copy re-exports it, NAV reads its search field
    expect(HEADER_SEARCH).toBe(LEAF.HEADER_SEARCH);
    expect(LEAF.SEARCH_FIELD).toEqual({ label: "Search medicines", placeholder: "Brand, substance or DAR number" });
    expect([NAV.searchLabel, NAV.searchPlaceholder]).toEqual([LEAF.SEARCH_FIELD.label, LEAF.SEARCH_FIELD.placeholder]);
  });

  it("pins the medicine list strings", () => {
    expect(BROWSE_COPY).toEqual({
      h1: "Medicines",
      lede: "Every medicine on IntelliDrugs, A to Z. To find one by brand, substance or DAR number, use the search above.",
      countOne: "{n} medicine",
      countMany: "{n} medicines",
      countLetterOne: "{n} medicine starting with {letter}",
      countLetterMany: "{n} medicines starting with {letter}",
      digitsPhrase: "a number or symbol",
      barLabel: "Browse by first letter",
      all: "All",
      digits: "0–9",
      capAll: "Showing the first 500 medicines. Choose a letter or search to find the others.",
      capLetter: "Showing the first 500 medicines starting with {letter}. Search to find the others.",
      emptyAll: "No medicines on IntelliDrugs yet.",
      emptyLetter: "No medicine on IntelliDrugs starts with {letter} yet.",
    });
  });

  it("the count lines, with one and many, for all letters, a letter and 0-9", () => {
    expect(browseCount(1, null)).toBe("1 medicine");
    expect(browseCount(0, null)).toBe("0 medicines");
    expect(browseCount(240, null)).toBe("240 medicines");
    expect(browseCount(1, "N")).toBe("1 medicine starting with N");
    expect(browseCount(55, "N")).toBe("55 medicines starting with N");
    expect(browseCount(1, "0-9")).toBe("1 medicine starting with a number or symbol");
    expect(browseCount(3, "0-9")).toBe("3 medicines starting with a number or symbol");
  });

  it("list URLs keep the letter and drop the page unless one is given", () => {
    expect(browseHref(null)).toBe("/search");
    expect(browseHref("A")).toBe("/search?letter=A");
    expect(browseHref("0-9")).toBe("/search?letter=0-9");
    expect(browseHref("A", 2)).toBe("/search?letter=A&page=2");
    expect(browseHref(null, 1)).toBe("/search?page=1");
  });
});

describe("parseLetter (§6.11.2)", () => {
  it("reads A–Z in either case as upper case, and 0-9", () => {
    expect(parseLetter("A")).toBe("A");
    expect(parseLetter("z")).toBe("Z");
    expect(parseLetter("0-9")).toBe("0-9");
    expect(parseLetter(["b", "C"])).toBe("B");
  });

  it("any other value reads as no letter", () => {
    for (const raw of [undefined, "", " ", "AB", " A", "A ", "1", "0–9", "0-9 ", "09", "-", "É", "প", "%41", "\u0000", "a\u0000"])
      expect(parseLetter(raw), JSON.stringify(raw)).toBeNull();
    expect(parseLetter([])).toBeNull();
  });

  it("the bar's keys: A to Z, then 0-9, as the API's 27 keys", () => {
    expect(BROWSE_LETTERS).toHaveLength(27);
    expect(BROWSE_LETTERS[0]).toBe("A");
    expect(BROWSE_LETTERS[25]).toBe("Z");
    expect(BROWSE_LETTERS[26]).toBe(BROWSE_DIGITS);
    for (const l of BROWSE_LETTERS) expect(parseLetter(l)).toBe(l);
  });
});

describe("browseMedicines (P17, §7.4)", () => {
  const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
  let f: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("API_URL", "http://api:8080");
    vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token-0123456789abcdef");
    f = vi.fn().mockImplementation(async () => ok({ letter: null, total: 0, page: 0, hasMore: false, letters: [], products: [] }));
    vi.stubGlobal("fetch", f);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("reads with scope=public and no token; the letter only when one is chosen", async () => {
    expect((await browseMedicines(null, 0)).ok).toBe(true);
    await browseMedicines("0-9", 3);
    expect(String(f.mock.calls[0][0])).toBe("http://api:8080/v1/products/browse?page=0&scope=public");
    expect(String(f.mock.calls[1][0])).toBe("http://api:8080/v1/products/browse?letter=0-9&page=3&scope=public");
    for (const [, init] of f.mock.calls) expect(new Headers(init?.headers).get("X-Internal-Token")).toBeNull();
  });

  it("an API error is not ok, with its status", async () => {
    f.mockResolvedValue(new Response("{}", { status: 503 }));
    expect(await browseMedicines("A", 0)).toEqual({ ok: false, status: 503 });
  });
});
