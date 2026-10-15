import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemsPage, ReviewItem } from "@/lib/review-types";
import { pilotItem, pilotRows } from "./fixtures/pilot";

const getReviewItems = vi.fn();
const getReviewItem = vi.fn();
const getReviewDiff = vi.fn();
const listReviewBatches = vi.fn();
const getSession = vi.fn();
const logOpenOnRender = vi.fn(async () => {});
const redirect = vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`); });
const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("@/lib/api", () => ({ getReviewItems: (...a: unknown[]) => getReviewItems(...a), getReviewItem: (...a: unknown[]) => getReviewItem(...a),
  getReviewDiff: (...a: unknown[]) => getReviewDiff(...a), listReviewBatches: () => listReviewBatches() }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/desk-core", () => ({ logOpenOnRender: (...a: unknown[]) => logOpenOnRender(...(a as [])) }));
vi.mock("@/lib/desk-actions", () => ({ decideFormAction: vi.fn(), decide: vi.fn(), logRecordOpen: vi.fn(), logEvidence: vi.fn(), loadDiff: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/Turnstile", () => ({ default: ({ action }: { action: string }) => <div className="cf-turnstile" data-action={action} /> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u), notFound: () => notFound(), useRouter: () => router,
  usePathname: () => "/review/0001-pilot" }));

import BatchLayout from "@/app/review/[batchId]/layout";
import BatchPage from "@/app/review/[batchId]/page";
import RecordPage from "@/app/review/[batchId]/[conceptId]/page";
import ReviewDesk from "@/components/review/ReviewDesk";
import { useDesk } from "@/components/review/desk/context";

function SidebarSlots() {
  const { slots } = useDesk();
  return <aside>{slots.batchesNav}{slots.batchCard}</aside>;
}

const PHARMACIST = { email: "pharm@e2e.test", name: "Farhana Islam", role: "pharmacist" as const };
const ITEMS: ItemsPage = { batchId: "0001-pilot", total: 10, filterCounts: { all: 10, needs: 10, warn: 9, issue: 0, approved: 0, nodata: 1 },
  items: pilotRows() };
const RID = "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22";

beforeEach(() => {
  for (const f of [getReviewItems, getReviewItem, getReviewDiff, listReviewBatches, getSession, logOpenOnRender, redirect, notFound]) f.mockClear();
  getSession.mockResolvedValue(PHARMACIST);
  getReviewItems.mockResolvedValue(ITEMS);
  listReviewBatches.mockResolvedValue([{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17Z", itemCount: 10,
    counts: { approved: 0, issue: 0, needsReview: 10, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 9 } }]);
});

async function page(key: string, sp: Record<string, string> = {}, item: ReviewItem | null = pilotItem(key)) {
  getReviewItem.mockResolvedValue(item);
  const conceptId = item?.conceptId ?? key;
  const out = await RecordPage({ params: Promise.resolve({ batchId: "0001-pilot", conceptId }), searchParams: Promise.resolve(sp) });
  return renderToStaticMarkup(
    <ReviewDesk batchId="0001-pilot" role="pharmacist" total={10} counts={{ approved: 0, issue: 0 }} undoSeconds={8} singleKeys siteKey={null}
      account={null} batchesNav={null} batchCard={null}>{out}</ReviewDesk>);
}

describe("the record page (§5.5, §5.6, §11.2)", () => {
  it("renders header, comparison, checks, interactions and history, and logs the open on render", async () => {
    const html = await page("napa");
    for (const t of ["DGDA source against the extraction", "Automated checks", "Interactions", "History"]) expect(html).toContain(t);
    expect(html).toContain(">Napa</h1>");
    expect(getReviewItem).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", "pharm@e2e.test");
    expect(logOpenOnRender).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", expect.any(Headers));
  });

  it.each([
    ["pending", "You&#x27;re reviewing as a pharmacist."],
    ["approved", "Approved by a pharmacist."],
    ["issue", "An issue is open on this record."],
    ["engineer_checked", "You&#x27;re reviewing as a pharmacist."],
    ["back_in_review", "You&#x27;re reviewing as a pharmacist."],
  ] as const)("%s: its pill and the server-rendered promise", async (status, lead) => {
    const html = await page("napa", {}, pilotItem("napa", { displayStatus: status }));
    expect(html).toContain(`<b>${lead}</b>`);
  });

  it("the eye drop states DDInter352 and its batch block counts 28 pairs", async () => {
    const html = await page("chloramphenicol");
    expect(html).toContain('is checked against <span class="mono">DDInter352</span>');
    expect(html).toContain("None of the 28 batch pairs from DDInter 2.0 involve Chloramphenicol.");
  });

  it("a failed check: the promise says so and the native form still never approves on its own", async () => {
    const base = pilotItem("napa");
    const html = await page("napa", {}, { ...base, stages: base.stages.map((s) => (s.stage === "dgda" ? { ...s, status: "fail" as const } : s)) });
    expect(html).toContain("<b>A check failed on this record.</b> It returns to review after the fix and re-run.");
  });

  it("back in review: the card with the diff from the previous run", async () => {
    getReviewDiff.mockResolvedValue({ from: "a", to: "b", reason: "rerun", rows: [{ field: "Trade name", before: "Napa", now: "Napa Extra" }] });
    const html = await page("napa", {}, pilotItem("napa", { displayStatus: "back_in_review",
      reopen: { reason: "rerun", at: "2026-10-12T09:00:00Z", previousExtractedAt: "2026-10-11T21:28:09Z", diffAvailable: true } }));
    expect(getReviewDiff).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", "2026-10-11T21:28:09Z");
    expect(html).toContain("This record was re-run after a pharmacist approved it.");
    expect(html).toContain("Napa Extra");
  });

  it("without JavaScript: the native form carries the version and a requestId, with the implicit widget and the notice", async () => {
    const html = await page("napa");
    expect(html).toMatch(/<form[^>]*class="decision-main fallbackForm"/);
    expect(html).toContain('<input type="hidden" name="extractedAt" value="2026-10-11T21:28:09.250Z"/>');
    expect(html).toContain('<input type="hidden" name="expectedLastDecisionId" value=""/>');
    expect(html).toMatch(/<input type="hidden" name="requestId" value="[0-9a-f-]{36}"\/>/);
    expect(html).toContain('<div class="cf-turnstile" data-action="decision"></div>');
    expect(html).toContain("<noscript>");
    expect(html).toContain("Reviewing needs JavaScript for the bot check. You can still read this record.");
    expect(html).toContain('<details id="evidence"');
  });

  it("the confirm step posts the URL's version, never the current one", async () => {
    const x = pilotItem("napa").version.extractedAt!;
    const html = await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID });
    expect(html).toContain("Confirm your decision on Napa.");
    expect(html).toContain("Your browser didn&#x27;t load the undo window, so nothing is saved until you confirm. Confirming publishes this record.");
    expect(html).toContain('<input type="hidden" name="commit" value="confirmed"/>');
    expect(html).toContain(`<input type="hidden" name="requestId" value="${RID}"/>`);
    expect(html).toContain(`<input type="hidden" name="extractedAt" value="${x}"/>`);
    expect(html).toMatch(/<button type="submit" class="btn btn--primary">Confirm<\/button>/);
  });

  it("a stale confirm shows the stale title and no Confirm button", async () => {
    const html = await page("napa", { confirm: "186-0030-006--napa", x: "2026-01-01T00:00:00Z", d: "", r: RID });
    expect(html).toContain("This record changed — reload to review the latest data");
    expect(html).not.toMatch(/>Confirm<\/button>/);
  });

  it("a refused confirm explains itself", async () => {
    const x = pilotItem("napa").version.extractedAt!;
    expect(await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID, e: "captcha" }))
      .toContain("We couldn&#x27;t confirm you&#x27;re a person. Your decision is kept. Retry the check to continue.");
    expect(await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID, e: "rate_limited" })).toContain("Couldn&#x27;t save your decision.");
  });

  it("a removed or unknown record goes back to the batch, never a decision bar (Review Focus 4)", async () => {
    await expect(page("gone", {}, null)).rejects.toThrow("REDIRECT /review/0001-pilot");
    getReviewItems.mockResolvedValue(null);
    await expect(page("napa")).rejects.toThrow("NOT_FOUND");
  });

  it("a user account or no session never reaches the review API, even when only the page segment renders (§2.3)", async () => {
    for (const session of [{ ...PHARMACIST, role: "user" as const }, null]) {
      getSession.mockResolvedValue(session);
      getReviewItem.mockClear();
      getReviewItems.mockClear();
      await expect(RecordPage({ params: Promise.resolve({ batchId: "0001-pilot", conceptId: "186-0030-006--napa" }),
        searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
      await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
        .rejects.toThrow("NOT_FOUND");
      expect(getReviewItem).not.toHaveBeenCalled();
      expect(getReviewItems).not.toHaveBeenCalled();
    }
  });

  it("an open record outside the filter opens the first visible one; an empty view says so", async () => {
    getReviewItems.mockImplementation(async (_b: string, o: { show?: string }) => o?.show === "nodata"
      ? { ...ITEMS, items: ITEMS.items.filter((r) => r.hint.noData) } : o?.show === "issue" ? { ...ITEMS, items: [] } : ITEMS);
    await expect(page("napa", { show: "nodata" })).rejects.toThrow("REDIRECT /review/0001-pilot/127-0263-018--domperidone?show=nodata");
    const empty = await page("napa", { show: "issue" });
    expect(empty).toContain("<b>No records with an issue reported.</b>");
    expect(empty).toContain("Show all 10 records");
  });

  it("the list is the server's links when the island has not run, keeping the filter", async () => {
    const html = await page("napa", { q: "warfarin" });
    expect(html).toContain('href="/review/0001-pilot/185-0138-012--g-warfarin?q=warfarin"');
    expect(html).toContain('aria-current="page"');
  });
});

describe("the batch route and layout", () => {
  it("/review/[batchId] opens the first record that needs review for the viewer's role", async () => {
    const rows = pilotRows().map((r, i) => ({ ...r, displayStatus: (i < 2 ? "engineer_checked" : i < 3 ? "approved" : "pending") as never }));
    getReviewItems.mockResolvedValue({ ...ITEMS, items: rows });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${rows[0].conceptId}`);
    getSession.mockResolvedValue({ ...PHARMACIST, role: "engineer" });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${rows[3].conceptId}`);
  });

  it("a fully approved batch opens record 1 in the complete view (§5.12)", async () => {
    getReviewItems.mockResolvedValue({ ...ITEMS, items: pilotRows().map((r) => ({ ...r, displayStatus: "approved" as const })) });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${pilotRows()[0].conceptId}?view=done`);
  });

  it("an approved read that is not the whole batch is never the complete view", async () => {
    const approved = pilotRows().map((r) => ({ ...r, displayStatus: "approved" as const }));
    getReviewItems.mockResolvedValue({ ...ITEMS, total: 11, items: approved });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(new RegExp(`REDIRECT /review/0001-pilot/${approved[0].conceptId}$`));
    getReviewItem.mockResolvedValue(pilotItem("napa", { displayStatus: "approved" }));
    const regOf = async (total: number) => {
      getReviewItems.mockResolvedValue({ ...ITEMS, total, items: approved });
      const out = await RecordPage({ params: Promise.resolve({ batchId: "0001-pilot", conceptId: "186-0030-006--napa" }),
        searchParams: Promise.resolve({ view: "done" }) });
      return (out as unknown as { props: { reg: { complete: boolean } } }).props.reg;
    };
    expect((await regOf(10)).complete).toBe(true);
    expect((await regOf(11)).complete).toBe(false);
  });

  it("an unknown batch is not found; the layout gives the desk batch-level props only", async () => {
    await expect(BatchLayout({ children: <p>x</p>, params: Promise.resolve({ batchId: "nope" }) })).rejects.toThrow("NOT_FOUND");
    // The desk renders its slots through the record page's panes (DeskRecordContext), so the child reads them the same way.
    const html = renderToStaticMarkup(await BatchLayout({ children: <SidebarSlots />, params: Promise.resolve({ batchId: "0001-pilot" }) }));
    expect(html).toContain('<main id="content"');
    expect(html).toContain('id="desk" role="region"');
    expect(html).toContain('class="filter" href="/review/0001-pilot" aria-current="true"');
    expect(html).toContain("Approved when all 10 records are approved by a pharmacist.");
    expect(html).toContain("Run 11/10/2026 21:27 UTC");
    expect(html).toContain('data-desk-open="sheet"');
    expect(html).not.toContain("sourceJson");
  });
});

describe("a senior session on the review pages (§5.13: role passed through unchanged)", () => {
  const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
  it("/review/{b} opens an engineer-checked record first, as for a pharmacist", async () => {
    getSession.mockResolvedValue(SENIOR);
    const items = pilotRows().map((r, i) => ({ ...r, displayStatus: i === 2 ? "engineer_checked" as const : "approved" as const }));
    getReviewItems.mockResolvedValue({ ...ITEMS, items });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${items[2].conceptId}`);
  });
  it("the no-JavaScript confirm step says that confirming publishes", async () => {
    getSession.mockResolvedValue(SENIOR);
    const x = pilotItem("napa").version.extractedAt!;
    const html = await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID });
    expect(html).toContain("Confirming publishes this record.");
    expect(html).not.toContain("Confirming records your check.");
  });
});
