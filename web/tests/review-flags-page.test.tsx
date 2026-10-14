import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlagPage } from "@/lib/review-types";

const getSession = vi.fn();
const listFlagPage = vi.fn();
const listReviewBatches = vi.fn(async () => []);
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ listFlagPage: (k: string, p: number) => listFlagPage(k, p), listReviewBatches: () => listReviewBatches() }));
vi.mock("@/lib/review-actions", () => ({ resolveFlagAction: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/TurnstileField", () => ({ default: ({ action }: { action: string }) => <div data-turnstile={action} /> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({}) }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import FlagsPage from "@/app/review/flags/page";

const REPORTS: FlagPage = { page: 0, size: 50, hasMore: true, items: [
  { id: 11, targetType: "product", targetId: "186-0030-006--napa", message: "Wrong strength\nfor <b>Napa</b>", status: "open", createdAt: "2026-10-11T21:27:00Z" },
  { id: 12, targetType: "check", targetId: "check", message: "Missing pair", status: "open", createdAt: "2026-10-11T21:30:00Z" },
] };
const PARTNER: FlagPage = { page: 0, size: 50, hasMore: false, items: [
  { id: 21, targetType: "other", targetId: "partner-access", message: "Clinic X wants access", status: "open", createdAt: "2026-10-12T02:00:00Z" },
] };
const render = async (sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await FlagsPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  getSession.mockResolvedValue({ email: "pharm@e2e.test", name: "P", role: "pharmacist" });
  listFlagPage.mockReset();
  listFlagPage.mockImplementation(async (k: string) => (k === "partner" ? PARTNER : REPORTS));
});

describe("/review/flags (§5.16)", () => {
  it("two sections with their headings, targets, messages and Dhaka dates; no email anywhere", async () => {
    const html = await render();
    expect(html).toContain("<h1>Problem reports and partner requests</h1>");
    expect(html).toContain("<h2>Problem reports</h2>");
    expect(html).toContain("<h2>Partner access requests</h2>");
    expect(html).toContain('<a href="/products/186-0030-006--napa">186-0030-006--napa</a>');
    expect(html).toContain("Interaction check");
    expect(html).toContain('<p class="raw">Wrong strength\nfor &lt;b&gt;Napa&lt;/b&gt;</p>');
    expect(html).toContain("Reported 12/10/2026 03:27 Dhaka");
    expect(html).toContain("Clinic X wants access");
    expect(html.match(/@/g)).toHaveLength(1);   // only the viewer's own email, in their account menu (§2.2)
  });

  it("one form, one widget with action resolve, and a Resolve button per item that targets it", async () => {
    const html = await render();
    expect(html.match(/<form id="resolve-form"/g)).toHaveLength(1);   // the account menu's own forms aside
    expect(html.match(/data-turnstile="resolve"/g)).toHaveLength(1);
    expect(html).not.toContain('name="requestId"');   // the action sends the web request id (§5.15)
    expect(html.match(/form="resolve-form"/g)).toHaveLength(3);
    // React 19 writes a submit button's name after its other attributes, so match the tag, not an attribute order.
    expect(html).toMatch(/<button[^>]*\bvalue="21"[^>]*\bname="flagId"[^>]*>Resolve<\/button>/);
    expect(html).toContain("<noscript><p>Resolving needs JavaScript for the bot check.</p></noscript>");
  });

  it("paging: 50 per section, Next page while hasMore, Previous page after the first", async () => {
    expect(await render()).toContain('<a href="/review/flags?rp=1&amp;pp=0">Next page</a>');
    listFlagPage.mockImplementation(async (k: string, p: number) => (k === "partner" ? PARTNER : { ...REPORTS, page: p, hasMore: false }));
    const html = await render({ rp: "2", pp: "0" });
    expect(listFlagPage).toHaveBeenCalledWith("reports", 2);
    expect(html).toContain('<a href="/review/flags?rp=1&amp;pp=0">Previous page</a>');
    expect(html).not.toContain("Next page");
    await render({ rp: "-1", pp: "abc" });
    expect(listFlagPage).toHaveBeenCalledWith("reports", 0);
    expect(listFlagPage).toHaveBeenCalledWith("partner", 0);
  });

  it("empty sections say so", async () => {
    listFlagPage.mockResolvedValue({ page: 0, size: 50, hasMore: false, items: [] });
    const html = await render();
    expect(html).toContain("No open problem reports.");
    expect(html).toContain("No open partner requests.");
    expect(html).not.toContain('id="resolve-form"');
  });

  it("outcomes: resolved names the kind; the other codes keep their messages; unknown codes show nothing", async () => {
    expect(await render({ resolve: "resolved", kind: "reports" })).toContain('<p role="status" class="outcome">Report resolved.</p>');
    expect(await render({ resolve: "resolved", kind: "partner" })).toContain("Request resolved.");
    expect(await render({ resolve: "captcha" })).toContain("The verification check failed. Please try again.");
    expect(await render({ resolve: "invalid" })).toContain("That flag is no longer open.");
    const odd = await render({ resolve: "<script>" });
    expect(odd).not.toContain("&lt;script&gt;");
    expect(odd).not.toContain('class="outcome"');
  });

  it("an API error: the crit banner with Try again, and no sections", async () => {
    listFlagPage.mockRejectedValue(new Error("API error 502"));
    const html = await render({ rp: "1" });
    expect(html).toContain("Couldn&#x27;t load the reports.");
    expect(html).toContain("Nothing was changed. Check your connection and try again.");
    expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/review/flags?rp=1&amp;pp=0">Try again</a>');
    expect(html).not.toContain("<h2>Problem reports</h2>");
    // §10.2 (Task 18 Ruling): no assertive region; the page's one polite region (Announce) carries the banner title.
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("aria-live=\"assertive\"");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('<p role="status" class="sr-only">Couldn&#x27;t load the reports.</p>');
    // A resolve outcome on a failed load stays visible as plain text, never a second region.
    listFlagPage.mockRejectedValue(new Error("API error 502"));
    const both = await render({ resolve: "resolved", kind: "reports" });
    expect(both).toContain('<p class="outcome">Report resolved.</p>');
    expect(both.match(/role="status"/g)).toHaveLength(1);
  });
});
