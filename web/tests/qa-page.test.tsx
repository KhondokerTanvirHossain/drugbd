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
// The island's props never reach the server HTML; the stub shows its target and context, so the tests can pin them.
vi.mock("@/components/qa/CopyButton", () => ({ default: ({ target, label, context }: { target: string; label: string; context?: string }) =>
  <button type="button" data-target={target}>{label}{context ? <span className="sr-only">{context}</span> : null}</button> }));

import QaToolsPage from "@/app/review/qa/page";
import { QA_FILTERS } from "@/lib/qa-api";
import { codeBlocks, qaReference } from "@/lib/qa-api-reference";
import { GUIDE, GUIDE_TOPICS } from "@/lib/qa-guide";
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
    expect(TOOLS).toHaveLength(6);
    expect(html).toContain(`The server has six read-only tools: ${tools.slice(0, 5).join(", ")} and ${tools[5]}. ${tools[5]} gives your AI the QA guide: how the data is built, which source to check each field against, and how to report a finding. A local version that runs on your computer is in <code class="mono">tools/qa-mcp</code>.`);
    const filters = html.slice(html.indexOf('<h3 id="qa-api-filters">'), html.indexOf("</dl>", html.indexOf('<h3 id="qa-api-filters">')));
    const dts = [...filters.matchAll(/<dt>([a-z_]+)<\/dt>/g)].map((m) => m[1]);
    expect(dts).toEqual([...QA_FILTERS]);
    expect(html).toContain('<dt>no_ddinter_data</dt><dd>A substance has DDInter coverage "none". This never means a combination is safe.</dd>');
    const rules = html.slice(html.indexOf('<ol class="rules">'), html.indexOf("</ol>"));
    expect([...rules.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1])).toEqual(PREAMBLE.split("\n"));
    expect(html).toContain("Use only your own keys. Never paste a key into a chat, a ticket or a file under version control. If a key may have leaked, revoke it at once.");
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
    // The QaKeys island draws it, so the refresh after a create never unmounts the island and its one-time panel.
    expect(html).toContain('<div class="keys"><div class="banner banner--crit"><p class="banner-title">Couldn&#x27;t load your keys.</p>');
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

// ---- §5.18 section 3 "API" (QA API reference, D72), §11.2

const HOST = "drugdb.example.org";
/** Text of already-unescaped HTML: only the markup's own tags are removed, so a literal <key> stays. */
const strip = (h: string) => h.replace(/<\/?(code|span|td|th|tr|p|a|div|button)( [^>]*)?>/g, "");
/** The API section's HTML: from its h2 to the Rules section. */
const apiSection = (html: string) => html.slice(html.indexOf('<h2 id="api">'), html.indexOf('aria-labelledby="rules"'));
/** One element's outer HTML by its opening tag (no nesting of the same tag inside). */
const element = (html: string, open: string, close: string) => {
  const at = html.indexOf(open);
  expect(at, open).toBeGreaterThanOrEqual(0);
  return html.slice(at, html.indexOf(close, at) + close.length);
};
const panel = (html: string, id: string) => element(html, `<details id="${id}"`, "</details>");
/** Each table row's cells as text. */
const rows = (table: string) => [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
  .map((c) => strip(c[1])));
const tableBy = (html: string, caption: string) => element(html, `<div class="scroll" role="region" aria-label="${caption}" tabindex="0">`, "</table>");
const REQUESTS = ["GET /api/qa/v1/batches", "GET /api/qa/v1/batches/{batchId}", "GET /api/qa/v1/batches/{batchId}/records/{conceptId}",
  "GET /api/qa/v1/records", "GET /api/qa/v1/substances/{bdsId}/pairs"];
const IDS = ["qa-ref-batches", "qa-ref-batch", "qa-ref-record", "qa-ref-records", "qa-ref-pairs"];

describe("/review/qa API reference (§5.18 section 3)", () => {
  it("the section holds, in order, the lead, the base address and the four h3 parts; no endpoints table and no standalone curl", async () => {
    const api = apiSection(await render());
    const marks = ["The same data over HTTPS, for scripts.", 'id="qa-api-address"', '<h3 id="qa-api-common">Every request and answer</h3>',
      '<h3 id="qa-api-endpoints">Endpoints</h3>', '<h3 id="qa-api-filters">Problem filters</h3>', '<h3 id="qa-api-mcp">MCP over HTTP</h3>'];
    const at = marks.map((m) => api.indexOf(m));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(api).not.toContain("QA API endpoints");
    expect(api).not.toContain('id="qa-curl"');
    expect(api).not.toContain('class="request"');
    expect(api).not.toMatch(/style="/);
  });

  it("Every request and answer: the header, the envelope, the error example, the Example note, headers, paging and 404", async () => {
    const api = unescape(apiSection(await render()));
    expect(api).toContain('<p>Send GET requests with one header, <code class="mono">Authorization: Bearer <key></code>, where <code class="mono"><key></code> is one of your keys. The examples read the key from the INTELLIDRUGS_QA_KEY environment variable, so it stays out of your shell history.</p>');
    expect(api).toContain("<p>Every answer uses the same envelope: success, data, message, errors and metadata. Quote metadata.requestId with each finding, so the team can find the exact read.</p>");
    const env = element(api, '<dl class="filters">', "</dl>");
    expect([...env.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map((m) => [m[1], m[2]])).toEqual([
      ["success", "true for a 200 answer, false for every error."],
      ["data", "The endpoint's data, shown in each panel below. null on an error."],
      ["message", "OK, or the error's fixed message."],
      ["errors", "Empty on success. On an error, one entry: field (the input that was refused or not found, or null), code and message."],
      ["metadata", "timestamp (UTC) and requestId. Quote requestId when you report a finding or a problem."],
    ]);
    expect(api).toContain('<p>Anything marked <span class="example">Example</span> is an illustration, not a stored record. Its field names and shapes are the API\'s own.</p>');
    expect(api).toContain('<p>Answers are JSON and never cached. A 401 answer has the header <code class="mono">WWW-Authenticate: Bearer</code>; a 429 answer has <code class="mono">Retry-After: 60</code>, the seconds to wait.</p>');
    expect(api).toContain('<p><code class="mono">page</code> counts from 0. A list answer has <code class="mono">total</code> and <code class="mono">size</code>: the last page is <code class="mono">total</code> divided by <code class="mono">size</code>, rounded up, minus 1.</p>');
    expect(api).toContain("<p>A path that is not one of the five endpoints answers 404 with no field. No QA answer is ever a 500.</p>");
    expect(api.indexOf('id="qa-ref-error"')).toBeLessThan(api.indexOf('<h3 id="qa-api-endpoints">'));
  });

  it("five endpoint details then the MCP one, only the first open; each summary the mono request and its Returns sentence", async () => {
    const api = unescape(apiSection(await render()));
    expect([...api.matchAll(/<details id="([^"]+)" class="endpoint"( open="")?>/g)].map((m) => [m[1], m[2] !== undefined]))
      .toEqual([...IDS.map((id, i) => [id, i === 0]), ["qa-ref-mcp", false]]);
    const returns = ["Every batch, with its status and counts.", "One batch's current records, with each pipeline stage's result.",
      "One record in full: DGDA source, extraction, codes with source links, stages, pairs and decision history.",
      "Records with a problem, 100 a page. Optional: stage (with stage_warn only), batch and page.",
      "One substance's DDInter pairs, 50 a page. Optional: page.",
      "JSON-RPC 2.0 for AI clients and scripts: initialize, then list and call the six tools and read the QA guide."];
    expect([...api.matchAll(/<summary class="summary"><code class="summaryPath">([^<]+)<\/code><span class="summaryText">([^<]+)<\/span><\/summary>/g)]
      .map((m) => [m[1], m[2]])).toEqual([...REQUESTS, "POST /api/qa/mcp"].map((r, i) => [r, returns[i]]));
  });

  it("inside each panel, h4 headings with the sr-only request; h1, h2, h3, h4 never skip a level", async () => {
    const html = await render();
    const api = unescape(apiSection(html));
    const h4 = (id: string) => [...panel(api, id).matchAll(/<h4>([^<]+)<span class="sr-only">([^<]+)<\/span><\/h4>/g)].map((m) => m[1] + m[2]);
    IDS.forEach((id, i) => expect(h4(id)).toEqual(["Request", "Response", "Errors"].map((h) => `${h} for ${REQUESTS[i]}`)));
    expect(h4("qa-ref-mcp")).toEqual(["Request", "Initialize", "Call a tool", "Read the QA guide", "Tools", "Errors"]
      .map((h) => `${h} for POST /api/qa/mcp`));
    const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    levels.forEach((l, i) => { if (i > 0) expect(l, `heading ${i}`).toBeLessThanOrEqual(levels[i - 1] + 1); });
    expect(levels).toContain(4);
    const summaries = [...api.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => m[1]);
    expect(summaries).toHaveLength(6);
    for (const sm of summaries) expect(sm).not.toMatch(/<h[1-6]/);
  });

  it("every table: a labelled tabindex region, a caption and th scope=col", async () => {
    const api = unescape(apiSection(await render()));
    const tables = [...api.matchAll(/<div class="scroll" role="region" aria-label="([^"]+)" tabindex="0"><table class="table"><caption class="sr-only">([^<]+)<\/caption>/g)];
    expect(tables.map((m) => m[1])).toEqual(tables.map((m) => m[2]));
    expect(tables.map((m) => m[1])).toEqual([
      "Parameters for GET /api/qa/v1/batches/{batchId}", "Errors for GET /api/qa/v1/batches", "Errors for GET /api/qa/v1/batches/{batchId}",
      "Parameters for GET /api/qa/v1/batches/{batchId}/records/{conceptId}", "Errors for GET /api/qa/v1/batches/{batchId}/records/{conceptId}",
      "Parameters for GET /api/qa/v1/records", "Errors for GET /api/qa/v1/records",
      "Parameters for GET /api/qa/v1/substances/{bdsId}/pairs", "Errors for GET /api/qa/v1/substances/{bdsId}/pairs",
      "Headers for POST /api/qa/mcp", "MCP tools", "Errors for POST /api/qa/mcp",
    ].sort((a, b) => api.indexOf(`aria-label="${a}"`) - api.indexOf(`aria-label="${b}"`)));
    expect((api.match(/<table/g) ?? []).length).toBe(tables.length);
    expect([...api.matchAll(/<th( [^>]*)?>/g)].every((m) => m[1] === ' scope="col"')).toBe(true);
  });

  it("every command and example answer is qaReference(SITE_HOST)'s, in its labelled region, with Example and a copy button that targets it", async () => {
    const api = unescape(apiSection(await render()));
    const blocks = codeBlocks(qaReference(HOST));
    expect(blocks).toHaveLength(17);
    for (const b of blocks) {
      expect(api).toContain(`<div class="codeRegion" role="region" tabindex="0" aria-label="${b.region}"><pre id="${b.id}" class="codeBlock">${b.text}</pre></div>`);
      const context = b.context ? `<span class="sr-only">${b.context}</span>` : "";
      expect(api).toContain(`<div class="codeHead"><span class="codeLabel">${b.label}</span><span class="example">Example</span><button type="button" data-target="${b.id}">${b.copyLabel}${context}</button></div><div class="codeRegion"`);
    }
    expect(api).toContain('aria-label="Command for GET /api/qa/v1/batches"');
    expect(api).toContain('aria-label="Answer for initialize"');
    expect(api).toContain('aria-label="Command for resources/list"');
    expect(api).toContain('aria-label="Answer for resources/list"');
    expect(api).toContain('aria-label="Error answer"');
    expect(api).toContain('<pre id="qa-ref-batches-command" class="codeBlock">curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://drugdb.example.org/api/qa/v1/batches"</pre>');
    expect(api).toContain('<pre id="qa-ref-records-command" class="codeBlock">curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://drugdb.example.org/api/qa/v1/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=0"</pre>');
    expect(api).toContain(`<pre id="qa-ref-mcp-call-command" class="codeBlock">curl "https://drugdb.example.org/api/qa/mcp" \\
  -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "MCP-Protocol-Version: 2025-11-25" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_batches","arguments":{}}}'</pre>`);
  });

  it("each endpoint's request line, required header, other-parameters line and parameters table (§5.18 Parameters)", async () => {
    const api = unescape(apiSection(await render()));
    IDS.forEach((id, i) => {
      const p = panel(api, id);
      expect(p).toContain(`<p><code class="mono">GET https://drugdb.example.org${REQUESTS[i].slice(4)}</code></p>`);
      expect(p).toContain('<p>Required header: <code class="mono">Authorization: Bearer <key></code>.</p>');
      expect(p).toContain("<p>Any other query parameter, or one sent twice, is refused with 400.</p>");
    });
    expect(panel(api, "qa-ref-batches")).toContain("<p>This endpoint takes no parameters.</p>");
    expect(panel(api, "qa-ref-batches")).not.toContain("Parameters for");
    const params = (id: string, i: number) => rows(tableBy(panel(api, id), `Parameters for ${REQUESTS[i]}`));
    const head = ["Parameter", "In", "Required", "Rule"];
    const batchId = ["batchId", "Path", "Yes", "1 to 100 letters, digits, dots, underscores or hyphens (^[A-Za-z0-9._-]{1,100}$), as GET /api/qa/v1/batches lists it."];
    const page = (n: number) => ["page", "Query", "No", `A whole number from 0 to 999; 0 when left out. ${n} a page.`];
    expect(params("qa-ref-batch", 1)).toEqual([head, batchId]);
    expect(params("qa-ref-record", 2)).toEqual([head, batchId, ["conceptId", "Path", "Yes", "1 to 200 characters, with no control characters, exactly as GET /api/qa/v1/batches/{batchId} lists it. Percent-encode any character other than a letter, digit, dot, underscore, hyphen or tilde."]]);
    expect(params("qa-ref-records", 3)).toEqual([head,
      ["filter", "Query", "Yes", "One of strength_missing, parse_partial, route_assumed, no_ddinter_data, unaligned, stage_warn, stage_fail. Problem filters, below, says what each one matches."],
      ["stage", "Query", "No", "One of dgda, substances, clinical, ddinter, and only with filter=stage_warn. With any other filter it is refused."],
      ["batch", "Query", "No", "A batch id, by the batchId rule (^[A-Za-z0-9._-]{1,100}$). Only that batch's records are listed."],
      page(100)]);
    expect(params("qa-ref-pairs", 4)).toEqual([head,
      ["bdsId", "Path", "Yes", "BDS- and six digits (^BDS-[0-9]{6}$), as a record's extraction.ingredients[].bdsId gives it."], page(50)]);
    expect(panel(api, "qa-ref-batch")).toContain('<td><code class="mono">batchId</code></td>');
  });

  it("each endpoint's key fields (§5.18 Key fields)", async () => {
    const api = unescape(apiSection(await render()));
    const fields = (id: string) => {
      const p = panel(api, id);
      expect(p).toContain('<p class="codeLabel">Key fields</p>');
      return [...element(p, '<dl class="filters">', "</dl>").matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
    };
    expect(fields("qa-ref-batches")).toEqual(["batches[].batchId", "batches[].status", "batches[].itemCount", "batches[].approvedCount", "batches[].runAt"]);
    expect(fields("qa-ref-batch")).toEqual(["items[].conceptId", "items[].displayStatus", "items[].stages[].stage", "items[].stages[].status", "items[].stages[].note"]);
    expect(fields("qa-ref-record")).toEqual(["source.json", "source.link", "extraction.ingredients[].strengthValue", "extraction.ingredients[].codes[]",
      "extraction.ingredients[].coverage", "extraction.ingredients[].ddinter.chosen[]", "ddinterRoute", "stages[].evidence",
      "pairs.inBatch.pairs[].textMissing", "pairs.otherBatches.pairs[]", "history[]"]);
    expect(fields("qa-ref-records")).toEqual(["total", "page", "stage", "batch", "items[]", "items[].stages"]);
    expect(fields("qa-ref-pairs")).toEqual(["total", "pairs[].entry", "pairs[].partner", "pairs[].severity", "pairs[].interaction", "pairs[].applies",
      "pairs[].review", "pairs[].changes[]"]);
    expect(panel(api, "qa-ref-pairs")).toContain("<dt>pairs[].applies</dt><dd>true when a medicine we hold is checked against both entries for its route.</dd>");
  });

  it("each endpoint's errors table (§5.18 Errors)", async () => {
    const api = unescape(apiSection(await render()));
    const errors = (id: string, i: number) => rows(tableBy(panel(api, id), `Errors for ${REQUESTS[i]}`));
    const head = ["Status", "Code", "When", "What to do"];
    const r400 = (fields: string) => ["400", "INVALID_QUERY", `errors[0].field is the first input refused: ${fields}, or a query parameter this endpoint doesn't take, or one sent twice.`,
      "Fix that input by the rule in Parameters, then send again."];
    const r401 = ["401", "UNAUTHORIZED", "The Authorization header is missing or malformed, the key is unknown, expired or revoked, or your account no longer has QA access. The answer never says which.",
      "Check the header is Authorization: Bearer and your key. In Your keys, check the key is Active; if it isn't, create a new one."];
    const r404 = (fields: string) => ["404", "NOT_FOUND", `errors[0].field names the id that wasn't found: ${fields}.`, "Check the id. Ids are case-sensitive: copy them from another answer."];
    const r429 = ["429", "RATE_LIMITED", "Your key made more than 60 requests in a minute, counting the API and the MCP server together.",
      "Wait the seconds in Retry-After, then send again. A plain-text 429 without the envelope is the site's per-address limit: send fewer requests a second."];
    const r502 = ["502", "UNAVAILABLE", "IntelliDrugs couldn't read the data, or couldn't record the read.", "Try again in a minute. If it keeps failing, report it with metadata.requestId."];
    expect(errors("qa-ref-batches", 0)).toEqual([head, ["400", "INVALID_QUERY", "errors[0].field is the query parameter you sent: this endpoint takes none.",
      "Fix that input by the rule in Parameters, then send again."], r401, r429, r502]);
    expect(errors("qa-ref-batch", 1)).toEqual([head, r400("batchId"), r401, r404("batchId"), r429, r502]);
    expect(errors("qa-ref-record", 2)).toEqual([head, r400("batchId, conceptId"), r401, r404("batchId, conceptId"), r429, r502]);
    expect(errors("qa-ref-records", 3)).toEqual([head, r400("filter, stage, batch, page"), r401, r404("batch"), r429, r502]);
    expect(errors("qa-ref-pairs", 4)).toEqual([head, r400("bdsId, page"), r401, r404("bdsId"), r429, r502]);
    expect(panel(api, "qa-ref-batch")).toContain('<td><code class="mono">INVALID_QUERY</code></td>');
  });

  it("MCP over HTTP: lead, address, headers, the three lines, initialize, call a tool, the QA guide, the tools from TOOLS and the errors", async () => {
    const api = unescape(apiSection(await render()));
    expect(api).toContain("<p>The MCP server address takes the same keys and returns the same data over JSON-RPC 2.0. Your AI client sends these requests for you; use this to test the server from a script.</p>");
    const p = panel(api, "qa-ref-mcp");
    expect(p).toContain('<p><code class="mono">POST https://drugdb.example.org/api/qa/mcp</code></p>');
    expect(rows(tableBy(p, "Headers for POST /api/qa/mcp"))).toEqual([["Header", "Value", "Required"], ["Authorization", "Bearer <key>", "Yes"],
      ["Content-Type", "application/json", "Yes"], ["Accept", "application/json, text/event-stream", "No"], ["MCP-Protocol-Version", "2025-11-25", "No"]]);
    expect(p).toContain("<p>Accept may be left out; if you send it, it must allow application/json.</p>");
    expect(strip(p)).toContain("Send MCP-Protocol-Version on every request after initialize, with the version initialize returned. Without it the server assumes 2025-03-26. Supported versions: 2025-11-25, 2025-06-18, 2025-03-26.");
    expect(strip(p)).toContain("Send one JSON-RPC 2.0 message per request, at most 64 KiB, and get one JSON answer. A batch (a JSON array) is refused. The server answers initialize, ping, tools/list, tools/call, resources/list, resources/templates/list, resources/read; a notification gets 202 with no body. It keeps no session between requests.");
    expect(p).toContain("<p>Ask for a protocol version. The answer gives the version to send in MCP-Protocol-Version, the server's name and version, and the rules as instructions.</p>");
    expect(p).toContain('<p>The result has two text blocks: the rules, then the answer of the matching endpoint as indented JSON, here the same envelope as <code class="mono">GET /api/qa/v1/batches</code>. Parse the second block\'s text as JSON.</p>');
    expect(p).toContain('<p>The QA guide tells your AI how IntelliDrugs data is built, which source to check each field against, the known traps and how to report a finding. List its topics with resources/list, then read one with resources/read and its uri, or call <code class="mono">get_qa_guide</code> with a <code class="mono">topic</code>. Each topic is Markdown, and <code class="mono">guideVersion</code> changes whenever the guide does.</p>');
    expect(strip(p)).toContain("A get_qa_guide result has the same two text blocks as any tool; the second is JSON with guideVersion, topic, title, text, related.");
    // only the topic list: the guide's own text is never on the page (§5.18, §7.11; §11.2: a fixed 80-character excerpt of each)
    const whole = unescape(await render());
    for (const t of GUIDE_TOPICS) {
      expect(p).toContain(GUIDE[t].summary);
      expect(GUIDE[t].text.length).toBeGreaterThan(80);
      expect(whole).not.toContain(GUIDE[t].text.slice(0, 80));
      for (const line of GUIDE[t].text.split("\n").filter((l) => l.length > 40)) expect(whole).not.toContain(line);
    }
    const tools = rows(tableBy(p, "MCP tools"));
    expect(tools[0]).toEqual(["Tool", "Arguments", "Same data as"]);
    expect(tools.slice(1)).toEqual([
      ["list_batches", "No arguments.", "GET /api/qa/v1/batches"],
      ["get_batch", "batchId required", "GET /api/qa/v1/batches/{batchId}"],
      ["get_record", "batchId required, conceptId required", "GET /api/qa/v1/batches/{batchId}/records/{conceptId}"],
      ["find_records", "filter required, stage optional, batch optional, page optional", "GET /api/qa/v1/records"],
      ["get_pairs", "bdsId required, page optional", "GET /api/qa/v1/substances/{bdsId}/pairs"],
      ["get_qa_guide", "topic optional", "intellidrugs://qa-guide/{topic}"],
    ]);
    expect(tools.slice(1).map((r) => r[0])).toEqual(TOOLS.map((t) => t.name));
    expect(strip(p)).toContain("Arguments follow the rules in each endpoint's Parameters. page is a JSON integer, not text. topic is one of overview, data_model, sources, checks, pitfalls, reporting, or left out. A tool refuses any argument it doesn't list, and a batchId, batch or conceptId of . or ...");
    const errors = rows(tableBy(p, "Errors for POST /api/qa/mcp"));
    expect(errors[0]).toEqual(["Status", "JSON-RPC code", "Message", "What to do"]);
    expect(errors.slice(1).map((r) => r.slice(0, 3))).toEqual([
      ["405", "-32000", "Method not allowed"], ["403", "-32002", "Forbidden"], ["401", "-32001", "Unauthorized"], ["502", "-32004", "Unavailable"],
      ["429", "-32003", "Too many requests"], ["415", "-32000", "Unsupported media type"], ["406", "-32000", "Not acceptable"],
      ["413", "-32000", "Request too large"], ["400", "-32700", "Parse error"], ["400", "-32600", "Invalid Request"],
      ["400", "-32600", "Unsupported protocol version"], ["200", "-32602", "Invalid params"], ["200", "-32002", "Resource not found"],
      ["200", "-32601", "Method not found"],
      ["200", "-32603", "Internal error"], ["200", "isError: true", "Invalid input {name}"], ["200", "isError: true", "Unknown tool"],
      ["200", "isError: true", "QA API error {status} {code}"],
    ]);
    expect(errors[8][3]).toBe("Keep the body under 64 KiB.");
    expect(errors[3][3]).toBe("Check the header is Authorization: Bearer and your key. In Your keys, check the key is Active; if it isn't, create a new one.");
    expect(errors[12].slice(2)).toEqual(["Invalid params", "initialize needs params.protocolVersion; tools/call needs params.name, and arguments must be an object; resources/read needs params.uri."]);
    expect(errors[13].slice(2)).toEqual(["Resource not found", "Use a uri from resources/list."]);
    expect(errors[14][3]).toBe("Use initialize, ping, tools/list, tools/call, resources/list, resources/templates/list or resources/read.");
    expect(errors[16][3]).toBe("Fix that argument by the rule of the endpoint's parameter. For topic, use one of the guide's topics.");
  });
});
