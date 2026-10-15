import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const listReviewBatches = vi.fn(async () => []);
const headerMap = new Map<string, string>();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ listReviewBatches: () => listReviewBatches() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers([...headerMap]), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
const redirect = vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u), useRouter: () => ({}) }));

import RootLayout from "@/app/layout";
import ReviewLayout from "@/app/review/layout";

beforeEach(() => { getSession.mockReset(); headerMap.clear(); });

describe("the review layout gate (§2.3, §5.12)", () => {
  it("no session: redirect to sign-in (the middleware normally does this first)", async () => {
    getSession.mockResolvedValue(null);
    await expect(ReviewLayout({ children: <p>data</p> })).rejects.toThrow("REDIRECT /signin?returnTo=%2Freview");
  });

  it("a reader gets the not-authorised page, never the data, with their own email once", async () => {
    getSession.mockResolvedValue({ email: "someone@gmail.com", name: "Some One", role: "user" });
    const html = renderToStaticMarkup(await ReviewLayout({ children: <p>secret batch data</p> }));
    expect(html).not.toContain("secret batch data");
    expect(html).toContain("Your account can&#x27;t review this batch.");
    expect(html).toContain("Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account.");
    expect(html).toContain("This Google account isn&#x27;t on the reviewer list.");
    expect(html).toContain("You&#x27;re signed in as someone@gmail.com. Reviewer tools need the account your invite was sent to.");
    expect(html).toMatch(/<form action="\/signout" method="post"><input type="hidden" name="returnTo" value="\/review"\/><button type="submit" class="btn btn--tonal">Use another Google account<\/button><\/form>/);
    expect(html).toContain('<a class="btn btn--plain" href="/search">Search medicines</a>');
    expect(html.match(/someone@gmail\.com/g)).toHaveLength(2);   // the banner and the owner's own account menu
    expect(html).not.toContain("role-badge");
  });

  it("a reviewer gets the page", async () => {
    getSession.mockResolvedValue({ email: "pharm@e2e.test", name: "P", role: "pharmacist" });
    expect(renderToStaticMarkup(await ReviewLayout({ children: <p>desk</p> }))).toBe("<p>desk</p>");
  });
});

describe("the root layout leaves its chrome out on /review (x-pathname)", () => {
  it("public pages keep the header, main and footer; review pages do not", async () => {
    getSession.mockResolvedValue(null);
    headerMap.set("x-pathname", "/search");
    const site = renderToStaticMarkup(await RootLayout({ children: <p>page</p> }));
    expect(site).toContain("<header");
    expect(site).toContain('<main id="content"');
    headerMap.set("x-pathname", "/review/0001-pilot/napa");
    const review = renderToStaticMarkup(await RootLayout({ children: <p>desk</p> }));
    expect(review).not.toContain("<header");
    expect(review).not.toContain("<footer");
    expect(review).not.toContain('id="content"');
    expect(review).toContain("<p>desk</p>");
  });
});
