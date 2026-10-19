import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * §2.1, §5.12, §5.13 (QA portal, D66): a qa session sees only the QA section. Every page and layout under app/review/ is
 * walked: /review redirects 307 to /review/qa, the review layout passes its children through (it cannot see the path),
 * /review/qa is the QA tools page itself, and every other page and layout renders the §5.12 QA account view with no review
 * data, no review API call and no audit row.
 */

const getSession = vi.fn();
const recordAudit = vi.fn(async () => true);
const apiCalls: string[] = [];
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/audit", () => ({ recordAudit: () => recordAudit() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.entries(real).map(([name, v]) => [name, typeof v !== "function" ? v : (..._a: unknown[]) => {
    apiCalls.push(name);
    throw new Error(`API ${name}`);
  }]));
});
vi.mock("@/lib/desk-core", () => ({ logOpenOnRender: async () => { apiCalls.push("logOpenOnRender"); } }));
vi.mock("@/lib/desk-actions", () => ({ decideFormAction: vi.fn(), decide: vi.fn(), logRecordOpen: vi.fn(), logEvidence: vi.fn(), loadDiff: vi.fn() }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: vi.fn(), logSeniorOpen: vi.fn() }));
vi.mock("@/lib/review-actions", () => ({ resolveFlagAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/TurnstileField", () => ({ default: () => null }));
vi.mock("@/components/Turnstile", () => ({ default: () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/review",
}));

const WEB = fileURLToPath(new URL("..", import.meta.url));
function* files(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (name === "page.tsx" || name === "layout.tsx") yield relative(WEB, p).split("\\").join("/");
  }
}
const SURFACES = [...files(join(WEB, "app/review"))].sort();

const QA = { email: "qa.member@e2e.test", name: "Q", role: "qa" as const };
const CHILD = "child-page-marker";
const props = {
  params: Promise.resolve({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", bdsId: "BDS-000003" }),
  searchParams: Promise.resolve({}),
  children: <p>{CHILD}</p>,
};

type Surface = (p: typeof props) => Promise<ReactElement | null> | ReactElement | null;
async function render(file: string): Promise<string> {
  const mod = (await import(/* @vite-ignore */ `../${file}`)) as { default: Surface };
  const el = await mod.default(props);
  return el === null ? "" : renderToStaticMarkup(el);
}

beforeEach(() => {
  apiCalls.length = 0;
  getSession.mockReset();
  getSession.mockResolvedValue(QA);
  recordAudit.mockClear();
});

describe("a qa session on every /review page and layout (§5.12, D66)", () => {
  it("the walk finds the review pages and layouts", () => {
    expect(SURFACES).toEqual(expect.arrayContaining(["app/review/layout.tsx", "app/review/page.tsx", "app/review/[batchId]/layout.tsx",
      "app/review/[batchId]/page.tsx", "app/review/[batchId]/[conceptId]/page.tsx", "app/review/flags/page.tsx",
      "app/review/pairs/page.tsx", "app/review/substances/page.tsx", "app/review/substances/[bdsId]/page.tsx"]));
  });

  it("/review redirects to /review/qa without a read", async () => {
    await expect(render("app/review/page.tsx")).rejects.toThrow("REDIRECT /review/qa");
    expect(apiCalls).toEqual([]);
  });

  it("the review layout admits a qa session and passes its children through", async () => {
    expect(await render("app/review/layout.tsx")).toBe(`<p>${CHILD}</p>`);
    expect(apiCalls).toEqual([]);
  });

  const others = SURFACES.filter((f) => !["app/review/layout.tsx", "app/review/page.tsx", "app/review/qa/page.tsx"].includes(f));
  it.each(others)("%s renders the QA account view with no review data, read or audit row", async (file) => {
    const html = await render(file);
    expect(html).toContain("Your account has QA access, not reviewer access.");
    expect(html).toContain("QA accounts read data through QA tools. Reviewing records needs a reviewer invite.");
    expect(html).toMatch(/<a class="btn btn--tonal" href="\/review\/qa">Open QA tools<\/a>/);
    expect(html).toContain('<a class="btn btn--plain" href="/search">Search medicines</a>');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    // no warn banner: the account is on REVIEWERS, so "isn't on the reviewer list" would be false (§5.12)
    expect(html).not.toContain("banner--warn");
    expect(html).not.toContain("isn&#x27;t on the reviewer list");
    expect(html).not.toContain(CHILD);
    expect(html).not.toContain("0001-pilot");
    expect(html).not.toContain("186-0030-006--napa");
    expect(html).not.toContain("BDS-000003");
    expect(apiCalls).toEqual([]);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("other roles keep their gates", () => {
  it("a reader still gets the not-authorised page from the layout, and an anonymous visitor the sign-in redirect", async () => {
    getSession.mockResolvedValue({ email: "someone@gmail.com", name: "", role: "user" });
    const html = await render("app/review/layout.tsx");
    expect(html).toContain("This Google account isn&#x27;t on the reviewer list.");
    expect(html).not.toContain(CHILD);
    getSession.mockResolvedValue(null);
    await expect(render("app/review/layout.tsx")).rejects.toThrow("REDIRECT /signin");
  });
});
