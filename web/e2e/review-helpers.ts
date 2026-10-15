import { expect, type Locator, type Page, type Route } from "@playwright/test";

/** The ten pilot records in concept order (COLLATE "C"). */
export const PILOT_IDS = {
  amlodipine: "071-0098-022--amlodipine-5", aspirin: "076-0028-006--aspirin", simvastatin: "096-0265-061--simvastatin",
  chloramphenicol: "127-0163-052--chloramphenicol", domperidone: "127-0263-018--domperidone", warfarin: "185-0138-012--g-warfarin",
  metformin: "185-0241-015--g-metformin", napa: "186-0030-006--napa", clarith: "239-0407-023--clarith",
  amoxiclav: "420-0026-023--amoxycillin-clavulanic-acid",
} as const;

export async function openRecord(page: Page, batchId: string, conceptId: string, query = ""): Promise<void> {
  await page.goto(`/review/${batchId}/${conceptId}${query}`);
  await deskReady(page);
}

/** The desk island has hydrated: the drawer replaces the no-JavaScript evidence details. */
export async function deskReady(page: Page): Promise<void> {
  await expect(page.locator("#drawer")).toBeAttached({ timeout: 20_000 });
  await page.locator("#desk").focus();
}

/** The record's version as the desk polls it (the confirm step posts exactly this). */
export async function versionOf(page: Page, batchId: string, conceptId: string) {
  const rows = (await (await page.request.get(`/review/${batchId}/versions`)).json()) as
    { conceptId: string; extractedAt: string | null; lastDecisionId: number | null }[];
  const row = rows.find((r) => r.conceptId === conceptId);
  if (!row) throw new Error(`no version for ${conceptId}`);
  return row;
}

export const STALE = "This record changed — reload to review the latest data";

/** A POST of the desk's `decide` server action (logRecordOpen and logEvidence carry no "decision" argument). */
const isDecide = (route: Route) => {
  const req = route.request();
  return req.method() === "POST" && !!req.headers()["next-action"] && (req.postData() ?? "").includes('"decision"');
};

/**
 * Intercepts the desk's decide POSTs on a batch's pages. "abort": each is lost before the server sees it. "hold": each
 * waits (the desk times out after 10 s). The returned function aborts anything held and removes the interception.
 */
export async function interceptActions(page: Page, batchId: string, mode: "abort" | "hold"): Promise<() => Promise<void>> {
  const pattern = `**/review/${batchId}/**`;
  const held: Route[] = [];
  const handler = async (route: Route) => {
    if (!isDecide(route)) return route.continue();
    if (mode === "abort") return route.abort("internetdisconnected");
    held.push(route);
  };
  await page.route(pattern, handler);
  return async () => {
    await page.unroute(pattern, handler);
    for (const r of held.splice(0)) await r.abort("internetdisconnected").catch(() => {});
  };
}

/**
 * The next decide POST runs on the server for real, and the value it returned is swapped for `result` in the flight
 * response (its last JSON row). Used to reach the action's rate_limited and forbidden outcomes without exhausting a
 * limit or changing a role.
 */
export async function replaceNextActionResult(page: Page, batchId: string, result: unknown): Promise<void> {
  let done = false;
  await page.route(`**/review/${batchId}/**`, async (route) => {
    if (done || !isDecide(route)) return route.continue();
    done = true;
    const res = await route.fetch();
    const rows = (await res.text()).split("\n");
    const at = rows.map((r, i) => (/^\d+:\{/.test(r) ? i : -1)).filter((i) => i >= 0).pop();
    if (at === undefined) throw new Error("no JSON row in the server action response");
    rows[at] = rows[at].replace(/^(\d+):.*$/, `$1:${JSON.stringify(result)}`);
    await route.fulfill({ response: res, body: rows.join("\n") });
  });
}

/** Blocks every Next client chunk, so no island hydrates: the page behaves as if JavaScript failed to load (§5.8.6). */
export async function blockIslands(page: Page): Promise<void> {
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
}

/**
 * Visible text on the page, not the desk's polite live region: the region repeats every banner title so a screen reader
 * hears it (§10.2), so a bare getByText on a banner would match both elements.
 */
export const shown = (page: Page, text: string | RegExp, options?: { exact?: boolean }): Locator =>
  page.getByText(text, options).and(page.locator(':not([data-desk="live"])'));
