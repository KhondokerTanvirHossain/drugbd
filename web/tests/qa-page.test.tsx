import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* §5.18, §11.2 (QA portal): the /review/qa server page. */

const getSession = vi.fn();
const apiCalls: string[] = [];
const listQaKeys = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.entries(real).map(([name, v]) => [name, typeof v !== "function" ? v : (...a: unknown[]) => {
    apiCalls.push(name);
    if (name === "listQaKeys") return listQaKeys(...a);
    throw new Error(`API ${name}`);
  }]));
});
vi.mock("@/lib/qa-key-actions", () => ({ createQaKeyAction: vi.fn(), revokeQaKeyAction: vi.fn() }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/TurnstileField", () => ({ default: ({ action, nonce }: { action: string; nonce?: string }) =>
  <div data-turnstile={action} data-nonce={nonce} /> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, useRouter: () => ({}) }));

import QaToolsPage from "@/app/review/qa/page";
import { QA_FILTERS } from "@/lib/qa-api";
import { PREAMBLE, TOOLS } from "@/lib/qa-mcp-tools";

const ENG = { email: "eng@example.org", name: "Eng Ineer", role: "engineer" as const };
const API_KEY_ROW = (id: number, over: Record<string, unknown> = {}) => ({ id, name: `Key ${id}`, createdAt: "2026-10-18T03:00:00Z",
  expiresAt: "2027-01-16T03:00:00Z", lastUsedAt: null, revokedAt: null, status: "active", ...over });
const unescape = (html: string) => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");
const render = async () => renderToStaticMarkup((await QaToolsPage())!);

beforeEach(() => {
  apiCalls.length = 0;
  getSession.mockReset();
  getSession.mockResolvedValue(ENG);
  listQaKeys.mockReset();
  listQaKeys.mockResolvedValue([API_KEY_ROW(3, { name: "CI laptop", lastUsedAt: "2026-10-18T04:00:00Z" }),
    API_KEY_ROW(2, { name: "Old", status: "expired" }), API_KEY_ROW(1, { name: "Gone", status: "revoked", revokedAt: "2026-10-18T05:00:00Z" })]);
  vi.stubEnv("SITE_HOST", "drugdb.example.org");
});

describe("/review/qa for qa, engineer and senior (§5.18)", () => {
  it("one h1, then the four sections in order, each an h2 with an id; the one polite live region", async () => {
    const html = await render();
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain("<h1>QA tools</h1>");
    expect(html).toContain("Read IntelliDrugs data for quality checks from your AI assistant or a script. Everything here is read-only.");
    const h2 = [...html.matchAll(/<h2 id="([a-z]+)"[^>]*>([^<]+)<\/h2>/g)].map((m) => [m[1], m[2]]);
    expect(h2).toEqual([["connect", "Connect your AI"], ["keys", "Your keys"], ["api", "API"], ["rules", "Rules"]]);
    expect(html).toContain('<h2 id="keys" tabindex="-1">Your keys</h2>');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('<div id="qa-live" role="status" class="sr-only"></div>');
    expect(html).not.toContain("aria-live=\"assertive\"");
    expect(html).not.toMatch(/style="/);
  });

  it("the toolbar's QA tools link is current; the address and the snippets are built from SITE_HOST exactly", async () => {
    const html = await render();
    expect(html).toMatch(/<a class="toolbarLink" href="\/review\/qa" aria-current="page">QA tools<\/a>/);
    const text = unescape(html);
    expect(text).toContain('<code id="qa-mcp-address" class="mono">https://drugdb.example.org/api/qa/mcp</code>');
    expect(text).toContain('<pre id="qa-claude-code" class="pre">claude mcp add --transport http intellidrugs-qa https://drugdb.example.org/api/qa/mcp --header "Authorization: Bearer $INTELLIDRUGS_QA_KEY"</pre>');
    expect(text).toContain(`<pre id="qa-cursor" class="pre">{
  "mcpServers": {
    "intellidrugs-qa": {
      "url": "https://drugdb.example.org/api/qa/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}</pre>`);
    expect(text).toContain('<code id="qa-api-address" class="mono">https://drugdb.example.org/api/qa/v1</code>');
    expect(text).toContain('<pre id="qa-curl" class="pre">curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://drugdb.example.org/api/qa/v1/records?filter=strength_missing"</pre>');
    for (const label of ["Copy address", "Copy command", "Copy configuration", "Copy example"]) expect(html).toContain(`>${label}</button>`);
    expect(text).toContain("Never add it with --scope project, which writes the key into the project's files.");
    expect(text).toContain("Their connectors sign in with OAuth, which IntelliDrugs does not offer.");
  });

  it("no key, label or hash anywhere in the HTML, and no email but the viewer's own (account menu)", async () => {
    const html = await render();
    expect(html).not.toMatch(/idqa_[A-Za-z0-9_-]{10,}/);
    expect(html).not.toMatch(/[0-9a-f]{64}/);
    expect(html).not.toContain("key.3");
    expect(html.match(/@/g)).toHaveLength(1);
  });

  it("the tool names come from TOOLS and the filter names from QA_FILTERS; the Rules list is the PREAMBLE, line by line", async () => {
    const html = unescape(await render());
    const tools = TOOLS.map((t) => `<code class="mono">${t.name}</code>`);
    expect(html).toContain(`The server has five read-only tools: ${tools.slice(0, 4).join(", ")} and ${tools[4]}. A local version that runs on your computer is in <code class="mono">tools/qa-mcp</code>.`);
    const dts = [...html.matchAll(/<dt>([a-z_]+)<\/dt>/g)].map((m) => m[1]);
    expect(dts).toEqual([...QA_FILTERS]);
    expect(html).toContain('<dt>no_ddinter_data</dt><dd>A substance has DDInter coverage "none". This never means a combination is safe.</dd>');
    const rules = html.slice(html.indexOf('<ol class="rules">'), html.indexOf("</ol>"));
    expect([...rules.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1])).toEqual(PREAMBLE.split("\n"));
    expect(html).toContain("Use only your own keys. Never paste a key into a chat, a ticket or a file under version control. If a key may have leaked, revoke it at once.");
  });

  it("the endpoints table: a labelled scroll region, a caption and the five requests", async () => {
    const html = unescape(await render());
    expect(html).toContain('<div class="scroll" role="region" aria-label="QA API endpoints" tabindex="0">');
    expect(html).toContain('<caption class="sr-only">QA API endpoints</caption>');
    const requests = [...html.matchAll(/<td class="request">([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(requests).toEqual(["GET /batches", "GET /batches/{batchId}", "GET /batches/{batchId}/records/{conceptId}",
      "GET /records?filter={filter}", "GET /substances/{bdsId}/pairs"]);
  });

  it("the key list with each status, Never, Revoke on the active row only; the widget is qakey with the nonce", async () => {
    listQaKeys.mockResolvedValueOnce([API_KEY_ROW(3, { name: "CI laptop" }), API_KEY_ROW(2, { name: "Old", status: "expired" }),
      API_KEY_ROW(1, { name: "Gone", status: "revoked" })]);
    const html = await render();
    expect(listQaKeys).toHaveBeenCalledWith("eng@example.org");
    for (const word of ["Active", "Expired", "Revoked"]) expect(html).toContain(`<td>${word}</td>`);
    expect(html).toContain("<td>Never</td>");
    expect(html.match(/Revoke<span class="sr-only"> key [^<]+<\/span>/g)).toEqual(['Revoke<span class="sr-only"> key CI laptop</span>']);
    expect(html).toContain('data-turnstile="qakey" data-nonce="n0nce"');
    expect(html).not.toContain("revokedAt");
  });

  it("the empty list", async () => {
    listQaKeys.mockResolvedValueOnce([]);
    expect(await render()).toContain("You have no keys yet.");
  });

  it("the 5-active state: Create key is aria-disabled with its hint", async () => {
    listQaKeys.mockResolvedValueOnce([1, 2, 3, 4, 5].map((i) => API_KEY_ROW(i)));
    const html = await render();
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Create key<\/button>/);
    expect(html).toContain("You have 5 active keys. Revoke one to create another.");
  });

  it("the load error: the crit banner with Try again, and no create form", async () => {
    listQaKeys.mockRejectedValueOnce(new Error("API error 503"));
    const html = await render();
    expect(html).toContain('<div class="banner banner--crit"><p class="banner-title">Couldn&#x27;t load your keys.</p>');
    expect(html).toContain("Nothing was changed. Check your connection and try again.");
    expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/review/qa">Try again</a>');
    const main = html.slice(html.indexOf("<main"));
    expect(main).not.toContain("<form");   // the account menu's own forms aside
    expect(main).not.toContain("Create key");
    expect(html).toContain("<h2 id=\"api\">API</h2>");   // the other sections still read
  });

  it("a qa session makes only the key-list read; a senior gets the page too", async () => {
    getSession.mockResolvedValueOnce({ email: "qa@example.org", name: "Q", role: "qa" });
    const html = await render();
    expect(apiCalls).toEqual(["listQaKeys"]);
    expect(html).toContain('<span class="role-badge">QA</span>');
    expect(html).not.toContain("Review desk");
    apiCalls.length = 0;
    getSession.mockResolvedValueOnce({ email: "s@example.org", name: "S", role: "senior" });
    expect(await render()).toContain("<h1>QA tools</h1>");
    expect(apiCalls).toEqual(["listQaKeys"]);
  });
});

describe("other roles (§5.18 Access)", () => {
  it("a pharmacist: status 200, the info banner as the h1, Open the review desk, and no key read", async () => {
    getSession.mockResolvedValueOnce({ email: "pharm@example.org", name: "P", role: "pharmacist" });
    const html = await render();
    expect(html).toContain('<div class="banner banner--info"><h1 class="banner-title">QA tools are for QA team members, engineers and senior pharmacists.</h1>');
    expect(html).toContain("Your account reviews batches. Ask the IntelliDrugs team if you need QA access.");
    expect(html).toContain('<a class="btn btn--tonal" href="/review">Open the review desk</a>');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(apiCalls).toEqual([]);
    expect(html).not.toContain("Your keys");
    expect(html).not.toContain("/review/qa\"");   // no QA tools link or item for a pharmacist
  });

  it("no session and a reader render nothing here: app/review/layout.tsx answers them", async () => {
    getSession.mockResolvedValueOnce(null);
    expect(await QaToolsPage()).toBeNull();
    getSession.mockResolvedValueOnce({ email: "r@example.org", name: "R", role: "user" });
    expect(await QaToolsPage()).toBeNull();
    expect(apiCalls).toEqual([]);
  });
});
