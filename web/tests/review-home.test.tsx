import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewBatchSummary } from "@/lib/review-types";

const getSession = vi.fn();
const listReviewBatches = vi.fn();
const redirect = vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`); });
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ listReviewBatches: () => listReviewBatches() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u), useRouter: () => ({}) }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import ReviewHome from "@/app/review/page";

const counts = (approved: number, n: number) =>
  ({ approved, issue: 0, needsReview: n - approved, engineerChecked: 0, backInReview: 0, noData: 0, warnings: 0 });
const batch = (batchId: string, status: ReviewBatchSummary["status"], runAt: string, approved: number, n: number): ReviewBatchSummary =>
  ({ batchId, status, runAt, itemCount: n, counts: counts(approved, n) });

beforeEach(() => {
  getSession.mockResolvedValue({ email: "pharm@e2e.test", name: "Farhana Islam", role: "pharmacist" });
  redirect.mockClear();
});

describe("/review (§2.1, §5.16)", () => {
  it("exactly one batch in review: redirect to it", async () => {
    listReviewBatches.mockResolvedValue([batch("0001-pilot", "in_review", "2026-10-11T21:27:17Z", 0, 10),
      batch("0000-old", "approved", "2026-09-01T10:00:00Z", 4, 4)]);
    await expect(ReviewHome()).rejects.toThrow("REDIRECT /review/0001-pilot");
  });

  it("two in review: a banner each, the list in_review first then newest run, and the flags link", async () => {
    listReviewBatches.mockResolvedValue([
      batch("0000-old", "approved", "2026-09-01T10:00:00Z", 4, 4),
      batch("0002-b", "in_review", "2026-10-01T08:00:00Z", 2, 3),
      batch("0003-c", "in_review", "2026-10-12T08:00:00Z", 0, 12),
    ]);
    const html = renderToStaticMarkup(await ReviewHome());
    expect(html).toContain("<h1>Batches</h1>");
    expect(html).toContain('Batch <span class="mono">0002-b</span> has 1 record waiting for a pharmacist.');
    expect(html).toContain('Batch <span class="mono">0003-c</span> has 12 records waiting for a pharmacist.');
    expect(html).toContain("The batch is approved when every record is approved by a pharmacist.");
    const order = [...html.matchAll(/href="\/review\/(0\d{3}-[a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["0003-c", "0002-b", "0000-old"]);
    expect(html).toContain("2 of 3 approved");
    expect(html).toContain("Batch status: <b>In review</b>");
    expect(html).toContain("Batch status: <b>Approved</b>");
    expect(html).toContain("Run 12/10/2026 08:00 UTC");
    expect(html).toContain('<a href="/review/flags">Problem reports and partner requests</a>');
    expect(html).not.toContain("pharm@e2e.test</a>");
  });

  it("none in review: the sentence instead of banners, and the list still shows", async () => {
    listReviewBatches.mockResolvedValue([batch("0000-old", "approved", "2026-09-01T10:00:00Z", 4, 4)]);
    const html = renderToStaticMarkup(await ReviewHome());
    expect(html).toContain("No batches are in review.");
    expect(html).not.toContain("banner--info");
    expect(html).toContain('href="/review/0000-old"');
  });
});
