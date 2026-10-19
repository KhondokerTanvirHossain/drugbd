import AxeBuilder from "@axe-core/playwright";
import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { insertQaKey, qaKeyLastUsed, revokeQaKeysOf } from "./db";
import { PILOT_IDS } from "./review-helpers";
import { BASE_URL, E2E_EMAILS, E2E_QA_EMPTY, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

/*
 * §11.4 QA flow (QA portal, D66, D67): the qa role sees only the QA section; an engineer creates a key on /review/qa, sees it
 * once, uses it against the QA API, revokes it, and it stops working; a senior creates one too, and a sixth active key is
 * refused (by the API, then by the page); a pharmacist's page, menu and DB key. The engineer's key also drives the hosted MCP
 * server (§7.10.6) on the built app: initialize, tools/list and tools/call list_batches, then 401 once the key is revoked.
 */

const KEY = /^idqa_[A-Za-z0-9_-]{43}$/;
const NAPA = `/review/0001-pilot/${PILOT_IDS.napa}`;
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const newKey = () => `idqa_${randomBytes(32).toString("base64url")}`;
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const live = (page: Page) => page.locator("#qa-live");
const PREAMBLE_FIRST = "IntelliDrugs QA data. This is UNREVIEWED data for quality assurance only;";
const MCP_HEADERS = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
/** One JSON-RPC message to the hosted MCP server, with the key and (after initialize) the negotiated protocol version. */
const mcp = (page: Page, key: string, body: Record<string, unknown>, version?: string) => page.request.post("/api/qa/mcp", {
  headers: { ...MCP_HEADERS, ...bearer(key), ...(version ? { "MCP-Protocol-Version": version } : {}) },
  data: JSON.stringify({ jsonrpc: "2.0", ...body }),
});
/** The newest row with this name (local reruns may leave older ones). */
const keyRow = (page: Page, name: string) => page.getByRole("region", { name: "Your QA keys" }).getByRole("row").filter({ hasText: name }).first();
const cell = (page: Page, name: string, i: number) => keyRow(page, name).getByRole("cell").nth(i);

// ---- QA API reference (§5.18 section 3, §11.4): the page's own commands, run with a real key.

/** Every path of a JSON value (`a.b[]` for an array's elements) with the JSON types seen there; stored pass-throughs are opaque. */
type Tree = Map<string, Set<string>>;
const OPAQUE = new Set(["data.source.json", "data.stages[].evidence"]);
function tree(v: unknown, path = "", out: Tree = new Map()): Tree {
  const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  if (path) out.set(path, (out.get(path) ?? new Set()).add(t));
  if (OPAQUE.has(path)) return out;
  if (Array.isArray(v)) for (const e of v) tree(e, `${path}[]`, out);
  else if (t === "object") for (const [k, x] of Object.entries(v as object)) tree(x, path ? `${path}.${k}` : k, out);
  return out;
}
const parentOf = (p: string): string | null => p.endsWith("[]") ? p.slice(0, -2) : p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : null;
/** A path one tree never reached: its nearest recorded ancestor was only ever null, or an array with no element. */
function unobserved(t: Tree, p: string): boolean {
  let a = parentOf(p);
  while (a !== null && !t.has(a)) a = parentOf(a);
  if (a === null) return false;
  const types = t.get(a)!;
  return [...types].every((x) => x === "null") || (types.has("array") && !t.has(`${a}[]`));
}
/** The live answer has the example's field names and shapes (not its values): no path either side lacks, but unobserved ones. */
function expectSameShape(live: unknown, example: unknown, what: string): void {
  const a = tree(live), b = tree(example);
  const optional = (p: string) => /(^|\.)history\[\]\./.test(p);   // a history entry's optional keys (§7.9.3)
  for (const p of a.keys()) if (!b.has(p) && !optional(p)) expect(unobserved(b, p), `${what}: ${p} is not in the example`).toBe(true);
  for (const p of b.keys()) if (!a.has(p) && !optional(p)) expect(unobserved(a, p), `${what}: ${p} is missing from the answer`).toBe(true);
}
/** A command on the page as curl would send it: its URL, -H headers and -d body. */
function parseCurl(text: string) {
  const line = text.replace(/ \\\n\s*/g, " ");
  const url = new URL(/"(https:\/\/[^"]+)"/.exec(line)![1]);
  const headers = Object.fromEntries([...line.matchAll(/-H "([^"]+)"/g)].map((m) => [m[1].slice(0, m[1].indexOf(": ")), m[1].slice(m[1].indexOf(": ") + 2)]));
  return { path: url.pathname + url.search, headers, body: /-d '([^']*)'/.exec(line)?.[1] ?? null };
}
const REFERENCE_PANELS = ["qa-ref-batches", "qa-ref-batch", "qa-ref-record", "qa-ref-records", "qa-ref-pairs"];

/** Runs each endpoint panel's command and the MCP panel's two with `key`: each answers 200 in its example's shape (§11.4). */
async function expectReferenceRuns(page: Page, key: string): Promise<void> {
  const text = async (id: string) => (await page.locator(`#${id}`).textContent()) ?? "";
  for (const id of REFERENCE_PANELS) {
    const c = parseCurl(await text(`${id}-command`));
    expect(c.headers).toEqual({ Authorization: "Bearer $INTELLIDRUGS_QA_KEY" });
    const res = await page.request.get(c.path, { headers: bearer(key) });
    expect(res.status(), c.path).toBe(200);
    expectSameShape(await res.json(), JSON.parse(await text(`${id}-answer`)), c.path);
  }
  for (const [command, answer] of [["qa-ref-mcp-init-command", "qa-ref-mcp-init-answer"], ["qa-ref-mcp-call-command", "qa-ref-mcp-call-answer"]]) {
    const c = parseCurl(await text(command));
    expect(c.path).toBe("/api/qa/mcp");
    const res = await page.request.post(c.path, { headers: { ...c.headers, ...bearer(key) }, data: c.body! });
    expect(res.status(), command).toBe(200);
    const live = await res.json(), example = JSON.parse(await text(answer));
    expectSameShape(live, example, command);
    if (live.result?.content) expectSameShape(JSON.parse(live.result.content[1].text), JSON.parse(example.result.content[1].text), `${command} block 2`);
  }
}

/** Creates a key on the open /review/qa page through the form and the (fake) bot check; returns the key the panel shows. */
async function createKey(page: Page, name: string): Promise<string> {
  await page.getByLabel("Key name").fill(name);
  await expect(page.getByText("Bot check passed")).toBeVisible();
  await page.getByRole("button", { name: "Create key" }).click();
  const heading = page.getByRole("heading", { level: 3, name: "Copy your new key now" });
  await expect(heading).toBeFocused();
  const key = (await page.locator("#qa-new-key").textContent()) ?? "";
  expect(key).toMatch(KEY);
  await expect(live(page)).toHaveText(`Key ${name} created. Copy it now; it is shown only once.`);
  return key;
}

async function revokeKey(page: Page, name: string): Promise<void> {
  await keyRow(page, name).getByRole("button", { name: `Revoke key ${name}` }).click();
  const confirm = page.getByRole("button", { name: "Revoke key", exact: true });
  await expect(confirm).toBeFocused();
  await confirm.click();
  await expect(cell(page, name, 4)).toHaveText("Revoked");
  await expect(live(page)).toHaveText(`Key ${name} revoked.`);
  await expect(page.locator("#keys")).toBeFocused();
}

test.afterAll(() => {
  for (const owner of [E2E_EMAILS.engineer, E2E_EMAILS.senior, E2E_EMAILS.pharmacist, E2E_EMAILS.qa]) revokeQaKeysOf(owner);
});

test("a qa account: /review lands on /review/qa; every other review page is the QA account view; versions is 403 (§2.1, §5.12)", async ({ context, page }) => {
  await signInAs(context, "qa", "Quinn QA");
  await page.goto("/review");
  await expect(page).toHaveURL(/\/review\/qa$/);
  await expect(page.getByRole("heading", { level: 1, name: "QA tools" })).toBeVisible();
  for (const path of [NAPA, "/review/0001-pilot", "/review/flags", "/review/pairs", "/review/substances"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Your account has QA access, not reviewer access." })).toBeVisible();
    // No record data in the HTML (the trade name, the DGDA source); the ids appear only as the URL's own route params.
    const html = await page.content();
    expect(html, path).not.toContain("Napa");
    expect(html, path).not.toContain("Paracetamol");
    const main = (await page.locator("main").textContent()) ?? "";
    expect(main, path).not.toContain(PILOT_IDS.napa);
    expect(main, path).not.toContain("0001-pilot");
    await expect(page.locator("header")).not.toContainText("0001-pilot");
  }
  expect((await page.request.get("/review/0001-pilot/versions")).status()).toBe(403);
  // "QA tools" in the account menu opens the page.
  await page.locator("header details summary").click();
  await page.locator("details").getByRole("link", { name: "QA tools" }).click();
  await expect(page).toHaveURL(/\/review\/qa$/);
  await expect(page.locator("header .role-badge").first()).toHaveText("QA");
});

test("an engineer creates a key, sees it once, uses it, revokes it, and it stops working (§5.18, §7.10)", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE_URL });
  await installTurnstileFake(page, "pass");
  await signInAs(context, "engineer", "Eng Ineer");
  await page.goto("/review/flags");
  await page.getByRole("link", { name: "QA tools" }).first().click();   // the toolbar link
  await expect(page).toHaveURL(/\/review\/qa$/);
  await expect(page.getByRole("link", { name: "QA tools" }).first()).toHaveAttribute("aria-current", "page");

  const key = await createKey(page, "CI laptop");
  await page.getByRole("button", { name: "Copy key" }).click();
  await expect(live(page)).toHaveText(/^(Copied\.|Couldn't copy\. The text is selected; press Ctrl C \(Cmd C on Mac\) to copy it\.)$/);
  await page.getByRole("button", { name: "I've saved it" }).click();
  await expect(page.locator("#keys")).toBeFocused();
  await expect(page.locator("#qa-new-key")).toHaveCount(0);
  expect(await page.content()).not.toContain(key);
  await expect(cell(page, "CI laptop", 4)).toHaveText("Active");
  await expect(cell(page, "CI laptop", 3)).toHaveText("Never");

  // The key reads the QA API like an env key; its use shows as "Last used" (at most once a minute, not awaited).
  const ok = await page.request.get("/api/qa/v1/batches", { headers: bearer(key) });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.success).toBe(true);
  expect(JSON.stringify(body)).not.toContain(E2E_EMAILS.engineer);
  await expect(async () => {
    await page.reload();
    await expect(cell(page, "CI laptop", 3)).not.toHaveText("Never", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(cell(page, "CI laptop", 3)).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} Dhaka$/);
  expect(await page.content()).not.toContain(key);

  // The same key drives the hosted MCP server (§7.10.6): initialize → notifications/initialized → tools/list → tools/call.
  const init = await mcp(page, key, { id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1.0.0" } } });
  expect(init.status()).toBe(200);
  expect(init.headers()["mcp-session-id"]).toBeUndefined();
  const initBody = await init.json();
  expect(initBody.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "intellidrugs-qa", version: "1.0.0" } });
  expect(initBody.result.instructions.startsWith(PREAMBLE_FIRST)).toBe(true);
  expect((await mcp(page, key, { method: "notifications/initialized" }, "2025-06-18")).status()).toBe(202);
  const list = await mcp(page, key, { id: 2, method: "tools/list" }, "2025-06-18");
  expect(list.status()).toBe(200);
  expect((await list.json()).result.tools.map((t: { name: string }) => t.name))
    .toEqual(["list_batches", "get_batch", "get_record", "find_records", "get_pairs"]);
  const callRes = await mcp(page, key, { id: 3, method: "tools/call", params: { name: "list_batches", arguments: {} } }, "2025-06-18");
  expect(callRes.status()).toBe(200);
  const call = (await callRes.json()).result;
  expect(call.isError).toBeUndefined();
  expect(call.content[0].text.startsWith(PREAMBLE_FIRST)).toBe(true);
  const listed = JSON.parse(call.content[1].text);
  expect(listed.success).toBe(true);
  expect(listed.data.batches.map((b: { batchId: string }) => b.batchId)).toContain("0001-pilot");
  const callText = JSON.stringify(call);
  expect(callText).not.toContain(key);
  expect(callText).not.toContain(E2E_EMAILS.engineer);
  // A browser origin other than the site's own is refused.
  expect((await page.request.post("/api/qa/mcp", { headers: { ...MCP_HEADERS, ...bearer(key), Origin: "https://evil.example" },
    data: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "ping" }) })).status()).toBe(403);

  // QA API reference (§11.4): each endpoint panel's command, and the MCP panel's two, run as written with this key.
  await expectReferenceRuns(page, key);

  // Revoke: the next request with it is 401.
  await expect(page.getByText("Bot check passed")).toBeVisible();
  await revokeKey(page, "CI laptop");
  expect((await page.request.get("/api/qa/v1/batches", { headers: bearer(key) })).status()).toBe(401);
  const revoked = await mcp(page, key, { id: 5, method: "tools/list" }, "2025-06-18");
  expect(revoked.status()).toBe(401);
  expect(revoked.headers()["www-authenticate"]).toBe("Bearer");
  expect(await revoked.json()).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } });
});

test("a senior creates a key from the account menu; a sixth active key is refused by the API, then by the page (§5.18, §7.10.2)", async ({ context, page }) => {
  revokeQaKeysOf(E2E_EMAILS.senior);
  for (let i = 1; i <= 3; i++) insertQaKey(E2E_EMAILS.senior, `Seeded ${i}`, sha256(newKey()));
  await installTurnstileFake(page, "pass");
  await signInAs(context, "senior", "Sabina Rahman");
  await page.goto("/review/pairs");
  await page.locator("header details summary").click();
  await page.locator("details").getByRole("link", { name: "QA tools" }).click();
  await expect(page).toHaveURL(/\/review\/qa$/);

  // A senior can create a key (the fourth active one).
  const key = await createKey(page, "Senior laptop");
  await page.getByRole("button", { name: "I've saved it" }).click();
  await expect(cell(page, "Senior laptop", 4)).toHaveText("Active");
  expect((await page.request.get("/api/qa/v1/batches", { headers: bearer(key) })).status()).toBe(200);

  // A fifth key appears behind the page's back (another tab): the page still counts four, so the press reaches the API,
  // whose creation transaction refuses the sixth active key. No key is shown.
  insertQaKey(E2E_EMAILS.senior, "Other tab", sha256(newKey()));
  await page.getByLabel("Key name").fill("Sixth");
  await expect(page.getByText("Bot check passed")).toBeVisible();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("You already have 5 active keys.", { exact: true })).toBeVisible();
  await expect(page.getByText("No key was created. Revoke one, then create another.", { exact: true })).toBeVisible();
  await expect(live(page)).toContainText("You already have 5 active keys.");
  await expect(page.locator("#qa-new-key")).toHaveCount(0);
  await expect(page.getByLabel("Key name")).toHaveValue("Sixth");

  // With five active keys listed, Create key is aria-disabled and a press sends nothing.
  await page.reload();
  const create = page.getByRole("button", { name: "Create key" });
  await expect(create).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("You have 5 active keys. Revoke one to create another.")).toBeVisible();
  const actions: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) actions.push(r.url()); });
  await page.getByLabel("Key name").fill("Sixth");
  await create.click({ force: true });   // aria-disabled, not disabled: the press reaches the island, which sends nothing
  await expect(live(page)).toHaveText("You have 5 active keys. Revoke one to create another.");
  expect(actions).toEqual([]);
  revokeQaKeysOf(E2E_EMAILS.senior);
});

test("a pharmacist: the info banner and no key read; a key row owned by a pharmacist is 401 (§5.18, §7.10.4)", async ({ context, page }) => {
  const key = newKey();
  const id = insertQaKey(E2E_EMAILS.pharmacist, "Pharmacist key", sha256(key));
  const res401 = await page.request.get("/api/qa/v1/batches", { headers: bearer(key) });
  expect(res401.status()).toBe(401);
  expect(await res401.text()).not.toContain(E2E_EMAILS.pharmacist);
  expect(qaKeyLastUsed(id)).toBe("");   // a key that does not authenticate is never touched (§7.10.4)
  await signInAs(context, "pharmacist", "Farhana Islam");
  const res = await page.goto("/review/qa");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "QA tools are for QA team members, engineers and senior pharmacists." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the review desk" })).toHaveAttribute("href", "/review");
  await expect(page.getByText("Your keys")).toHaveCount(0);
  // No "QA tools" anywhere: not in the toolbar and not in the (closed or open) account menu.
  await expect(page.locator('a[href="/review/qa"]')).toHaveCount(0);
  await page.locator("header details summary").click();
  await expect(page.locator("details").getByRole("link", { name: "Review desk" })).toBeVisible();
  await expect(page.locator('a[href="/review/qa"]')).toHaveCount(0);
  revokeQaKeysOf(E2E_EMAILS.pharmacist);
});

test("320 px: no horizontal page scroll with the key panel open (§10.4)", async ({ context, page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await installTurnstileFake(page, "pass");
  await signInAs(context, "qa", "Quinn QA");
  await page.goto("/review/qa");
  await createKey(page, "Phone");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "I've saved it" }).click();
  await expectTablesReadable(page);
  await revokeKey(page, "Phone");
});

/**
 * §5.18/§11.4 reflow: no page scroll is not enough, the tables must stay readable: no word in any table cell breaks across
 * lines ('18/10/2' / '026'). Code (a pattern, a header name) never breaks at all, not even at a hyphen, since
 * `^[A-Za-z0-9._-]{1,100}$` split at its hyphen reads as another pattern; prose may break after a hyphen ("plain-" / "text"),
 * as text does. Every table sits in its own labelled region, which scrolls when a long pattern needs it. Regions are found by
 * role, never by class: the production build hashes CSS-module class names.
 */
async function expectTablesReadable(page: Page): Promise<void> {
  const regions = page.locator("main [role=region]:has(> table)");
  expect(await regions.count()).toBeGreaterThan(1);
  for (const region of await regions.all()) {
    const name = (await region.getAttribute("aria-label")) ?? "";
    const split = await region.evaluate((el) => {
      const out: string[] = [];
      for (const td of el.querySelectorAll("tbody td")) {
        if (td.querySelector("button")) continue;
        const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const code = n.parentElement?.closest("code") !== null;
          for (const m of (n.textContent ?? "").matchAll(code ? /\S+/g : /[^\s-]+/g)) {
            const range = document.createRange();
            range.setStart(n, m.index!);
            range.setEnd(n, m.index! + m[0].length);
            const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
            if (lines.size > 1) out.push(m[0]);
          }
        }
      }
      return out;
    });
    expect(split, `${name}: words broken across lines`).toEqual([]);
  }
}

test("320 px, QA API reference: every panel open, no page scroll; code scrolls in its own region; Enter and Space toggle a panel (§5.18, §11.4)", async ({ context, page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInAs(context, "qa", "Quinn QA");
  await page.goto("/review/qa");
  const panels = page.locator("main details[id^=qa-ref-]");
  await expect(panels).toHaveCount(6);
  await expect(page.locator("#qa-ref-batches")).toHaveAttribute("open", "");
  // Keyboard: the native disclosure (no JavaScript needed).
  const summary = page.locator("#qa-ref-batch > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#qa-ref-batch")).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(page.locator("#qa-ref-batch")).not.toHaveAttribute("open", "");
  expect(await summary.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(24);
  await panels.evaluateAll((all) => all.forEach((d) => { (d as HTMLDetailsElement).open = true; }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // The record's command is wider than 320 px: its region scrolls sideways, the page does not; Tab reaches the region.
  const region = page.getByRole("region", { name: "Command for GET /api/qa/v1/batches/{batchId}/records/{conceptId}" });
  expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expectTablesReadable(page);
});

for (const role of ["engineer", "senior"] as const) {
  test(`320 px: the toolbar's "QA tools" link, badge and avatar fit for ${role} (§5.18, §10.4)`, async ({ context, page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await signInAs(context, role);
    for (const path of ["/review/qa", "/review/flags", "/review"]) {
      await page.goto(path);
      await expect(page.locator("header").getByRole("link", { name: "QA tools" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${role} ${path}`).toBeLessThanOrEqual(320);
    }
  });
}

// ---- axe (§11.4): the QA page's states and the QA account view, in light, dark and forced colours.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(300);
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}
type Look = { name: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [{ name: "light", theme: "light", forced: false }, { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true }];
async function contextFor(browser: Browser, look: Look, role: "engineer" | "pharmacist" | "qa", email?: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
  await context.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
  await signInAs(context, role, "E2E Reviewer", email);
  return context;
}

for (const look of LOOKS) {
  test(`axe (${look.name}): /review/qa states, the pharmacist banner and the QA account view`, async ({ browser }) => {
    // The empty list: the second qa account never owns a key.
    const empty = await contextFor(browser, look, "qa", E2E_QA_EMPTY);
    const p0 = await empty.newPage();
    await installTurnstileFake(p0, "pass");
    await p0.goto("/review/qa");
    await expect(p0.getByText("You have no keys yet.")).toBeVisible();
    await axe(p0, "empty list");
    await empty.close();

    // A qa account makes the keys here (the engineer's budget of 10 a day is the flow test's). Its list holds a key of
    // every status: an active and an expired seeded row, and a revoked one.
    insertQaKey(E2E_EMAILS.qa, `Axe active ${look.name}`, sha256(newKey()));
    insertQaKey(E2E_EMAILS.qa, `Axe expired ${look.name}`, sha256(newKey()), { ageHours: 2161 });
    insertQaKey(E2E_EMAILS.qa, `Axe revoked ${look.name}`, sha256(newKey()), { revoked: true });
    const eng = await contextFor(browser, look, "qa");
    const page = await eng.newPage();
    await installTurnstileFake(page, "pass");
    await page.goto("/review/qa");
    await expect(page.getByText("Bot check passed")).toBeVisible();
    await expect(cell(page, `Axe active ${look.name}`, 4)).toHaveText("Active");
    await expect(cell(page, `Axe expired ${look.name}`, 4)).toHaveText("Expired");
    await expect(cell(page, `Axe revoked ${look.name}`, 4)).toHaveText("Revoked");
    await expect(keyRow(page, `Axe expired ${look.name}`).getByRole("button")).toHaveCount(0);   // Revoke on active rows only
    await expect(keyRow(page, `Axe revoked ${look.name}`).getByRole("button")).toHaveCount(0);
    await axe(page, "list with every status");
    await page.locator("main details[id^=qa-ref-]").evaluateAll((all) => all.forEach((d) => { (d as HTMLDetailsElement).open = true; }));
    await axe(page, "every API reference panel open");
    const name = `Axe ${look.name}`;
    await createKey(page, name);
    await axe(page, "new-key panel");
    await page.getByRole("button", { name: "I've saved it" }).click();
    await keyRow(page, name).getByRole("button", { name: `Revoke key ${name}` }).click();
    await axe(page, "revoke confirmation");
    await page.getByRole("button", { name: "Revoke key", exact: true }).click();
    await expect(cell(page, name, 4)).toHaveText("Revoked");
    revokeQaKeysOf(E2E_EMAILS.qa);
    await eng.close();

    const failing = await contextFor(browser, look, "engineer");
    const errorPage = await failing.newPage();
    await installTurnstileFake(errorPage, "error");
    await errorPage.goto("/review/qa");
    await errorPage.getByLabel("Key name").fill("Never made");
    await errorPage.getByRole("button", { name: "Create key" }).click();
    await expect(errorPage.getByText("We couldn't confirm you're a person.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await axe(errorPage, "create error banner");
    await failing.close();

    const pharm = await contextFor(browser, look, "pharmacist");
    const p2 = await pharm.newPage();
    await p2.goto("/review/qa");
    await axe(p2, "pharmacist banner");
    await pharm.close();

    const qa = await contextFor(browser, look, "qa");
    const p3 = await qa.newPage();
    await p3.goto("/review/flags");
    await expect(p3.getByRole("heading", { level: 1, name: "Your account has QA access, not reviewer access." })).toBeVisible();
    await axe(p3, "QA account view");
    await qa.close();
  });
}
