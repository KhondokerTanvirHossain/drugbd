import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pairRecord, pillOf, rendersUnreviewed, worst } from "@/lib/public-mode";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const real = () => vi.importActual<typeof import("@/lib/public-mode-read")>("@/lib/public-mode-read");

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("getPublicMode() (§7.4.1, §6.10)", () => {
  it("reads GET /v1/public-mode with no-store, no scope and never the token", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "x".repeat(40));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { mode: "show_unreviewed" } })));
    vi.stubGlobal("fetch", fetchMock);
    const { getPublicMode } = await real();
    expect(await getPublicMode()).toBe("show_unreviewed");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/public-mode");
    expect(url).not.toContain("scope");
    expect(init.cache).toBe("no-store");
    expect(JSON.stringify(init.headers ?? {})).not.toContain("x".repeat(40));
  });

  it("a failed or malformed answer is an error, never a default mode", async () => {
    const { getPublicMode } = await real();
    for (const res of [new Response("", { status: 503 }), new Response(JSON.stringify({ data: { mode: "yes" } })),
        new Response("not json"), new Response(JSON.stringify({ data: null }))]) {
      vi.stubGlobal("fetch", vi.fn(async () => res));
      await expect(getPublicMode()).rejects.toThrow(/API error/);
    }
  });

  it("is deduped per render by React cache() and keeps no module-level copy", () => {
    const src = readFileSync(join(WEB, "lib/public-mode-read.ts"), "utf8");
    expect(src).toContain("export const getPublicMode = cache(async");
    expect(src).not.toMatch(/^let\s/m);
  });

  it("no web source reads PUBLIC_SHOWS_UNREVIEWED: the API owns the switch", () => {
    function* files(dir: string): Generator<string> {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (n === "node_modules" || n === ".next" || n === "tests" || n === "test-results") continue;
        if (statSync(p).isDirectory()) yield* files(p); else if (/\.(ts|tsx|mjs|js)$/.test(n)) yield relative(WEB, p);
      }
    }
    expect([...files(WEB)].filter((f) => readFileSync(join(WEB, f), "utf8").includes("PUBLIC_SHOWS_UNREVIEWED"))).toEqual([]);
  });
});

describe("labels, pair lines and the caution rule (§6.10)", () => {
  it("worst and the pair line: problem wins, then not reviewed", () => {
    expect(worst(["approved", "not_reviewed"])).toBe("not_reviewed");
    expect(worst(["not_reviewed", "problem", "approved"])).toBe("problem");
    expect(worst([null, undefined])).toBeNull();
    expect(pairRecord("approved", "approved")).toBeNull();
    expect(pairRecord("approved", "not_reviewed")).toBe("unreviewed");
    expect(pairRecord("problem", "not_reviewed")).toBe("problem");
    expect(pairRecord(undefined, null)).toBeNull();
  });

  it("the pill: approved, otherwise the not-reviewed pill", () => {
    expect([pillOf("approved"), pillOf("not_reviewed"), pillOf("problem"), pillOf(undefined)]).toEqual(["approved", "pending", "pending", "pending"]);
  });

  it("rendersUnreviewed is true exactly when a rendered record is not approved, and never in approved-only mode", () => {
    expect(rendersUnreviewed("show_unreviewed", ["approved", "approved"])).toBe(false);
    expect(rendersUnreviewed("show_unreviewed", ["approved", "not_reviewed"])).toBe(true);
    expect(rendersUnreviewed("show_unreviewed", ["problem"])).toBe(true);
    expect(rendersUnreviewed("show_unreviewed", [undefined, null])).toBe(false);
    expect(rendersUnreviewed("approved_only", ["not_reviewed", "problem"])).toBe(false);
  });
});
