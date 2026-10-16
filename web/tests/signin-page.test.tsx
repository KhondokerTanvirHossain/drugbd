import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1" }), cookies: async () => ({ get: () => undefined }) }));
const listReviewBatches = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()), listReviewBatches: () => listReviewBatches() }));
vi.mock("@/app/signin/SignInButton", () => ({
  default: (props: Record<string, unknown>) => <pre data-testid="island">{JSON.stringify(props)}</pre> }));

import SignInPage from "@/app/signin/page";

const configure = () => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIza-public-key");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "drugdb.eliooo.org");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
  vi.stubEnv("FIREBASE_PROJECT_ID", "intellidrugs-kb");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-site");
};
const render = async (returnTo?: string | string[]) =>
  renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(returnTo === undefined ? {} : { returnTo }) }));
const islandProps = (html: string) =>
  JSON.parse(html.match(/<pre data-testid="island">(.*?)<\/pre>/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue(null);
  listReviewBatches.mockReset();
  listReviewBatches.mockResolvedValue([{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:00Z", itemCount: 10,
    counts: { approved: 0, issue: 0, needsReview: 10, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 9 } }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("/signin (§6.2)", () => {
  it("offers Continue with Google with the bot check, the site origin and the nonce", async () => {
    configure();
    const html = await render();
    expect(html).toContain("<h1");
    expect(html).toContain("Sign in to IntelliDrugs");
    expect(html).toContain("New here? The same button creates your account.");
    expect(islandProps(html)).toEqual({
      config: { apiKey: "AIza-public-key", authDomain: "drugdb.eliooo.org", projectId: "intellidrugs-kb", appId: "1:123:web:abc" },
      siteKey: "0x4AAAAAAA-site", returnTo: null, siteOrigin: "http://localhost:3000", nonce: "n1",
    });
    expect(html).toContain("<noscript><p>Sign-in needs JavaScript for Google and the bot check.</p></noscript>");
  });

  it("passes only a safe returnTo to the island", async () => {
    configure();
    expect(islandProps(await render("/review/0001-pilot?show=needs")).returnTo).toBe("/review/0001-pilot?show=needs");
    expect(islandProps(await render("/\\evil.com")).returnTo).toBeNull();
    expect(islandProps(await render("https://drugdb.eliooo.org.evil.com")).returnTo).toBeNull();
    expect(islandProps(await render(["/a", "/b"])).returnTo).toBe("/a");
  });

  it("says sign-in is not available when Firebase or Turnstile is not configured", async () => {
    for (const missing of ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_APP_ID",
      "FIREBASE_PROJECT_ID", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]) {
      configure();
      vi.stubEnv(missing, "");
      const html = await render();
      expect(html).toContain('<p class="banner-title">Sign-in is not available right now.</p>');
      expect(html).toContain("Searching and checking interactions don&#x27;t need an account.");
      expect(html).not.toContain('data-testid="island"');
    }
  });
});

describe("/signin card and welcome states (§6.2, Board P section 2)", () => {
  it("the card: icon and wordmark, h1, sub, invite note and the privacy text with its link", async () => {
    configure();
    const html = await render();
    expect(html).toContain('<svg width="32" height="32"');
    expect(html).toContain("<b>Reviewing for the pilot?</b> Pharmacists and engineers join by invite.");
    expect(html).toContain("We use your Google name and email address only to sign you in and, for reviewers, to record each decision.");
    expect(html).toContain('<a href="/privacy">Privacy</a>');
  });

  it("a reader's welcome: own name and email once, the heading, Search medicines and Sign out", async () => {
    getSession.mockResolvedValue({ email: "nusrat@example.org", name: "Nusrat Jahan", role: "user" });
    const html = await render();
    expect(html).toContain("You&#x27;re signed in as a reader");
    expect(html.match(/nusrat@example\.org/g)).toHaveLength(1);
    expect(html).toContain('<span aria-hidden="true" class="avatar">NJ</span>');
    expect(html).toContain('href="/search">Search medicines</a>');
    // React's server renderer writes a form's action and method after its other attributes (Task 19 ruling).
    expect(html).toContain('<form action="/signout" method="post">');
    expect(html).not.toContain('data-testid="island"');
    expect(listReviewBatches).not.toHaveBeenCalled();
  });

  it("a reader with no Google name: the email is the name line, printed once", async () => {
    getSession.mockResolvedValue({ email: "nusrat@example.org", role: "user" });
    const html = await render();
    expect(html.match(/nusrat@example\.org/g)).toHaveLength(1);
    expect(html).toContain('<span aria-hidden="true" class="avatar">NE</span>');
  });

  it("a pharmacist's welcome: badge, batch heading, the three steps with the undo window, the desk button", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    const html = await render();
    expect(html).toContain('<span class="role-badge">Pharmacist</span>');
    expect(html).toContain("Signed in as Farhana Islam");
    expect(html).toContain("You&#x27;re a pharmacist reviewer for batch 0001-pilot");
    expect(html).toContain("10 records are waiting. Each shows <span class=\"rv rv--pending\">Not yet reviewed by a pharmacist</span> until a pharmacist approves it.");
    expect(html).toContain("You have 8 seconds to undo with");
    expect(html).toContain("Your approval publishes the record.");
    expect(html).toContain('href="/review">Open the review desk</a>');
    expect(html).toContain("Shortcuts work inside the desk only, and pause while you type.");
    expect(html).not.toContain("pharm@example.org");
  });

  it("an engineer's third step is the engineer step; a senior gets the senior heading and the pair-queue step", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", name: "Eng", role: "engineer" });
    const eng = await render();
    expect(eng).toContain("You&#x27;re a engineer reviewer for batch 0001-pilot");
    expect(eng).toContain("Your check is recorded but does not publish. A pharmacist approves each record.");
    expect(eng).not.toContain("Your approval publishes the record.");
    expect(eng).toContain('<span class="role-badge">Engineer</span>');
    expect(eng).toContain("Signed in as Eng");
    expect(eng).not.toContain("eng@example.org");
    getSession.mockResolvedValue({ email: "senior@example.org", name: "Senior", role: "senior" });
    const sen = await render();
    expect(sen).toContain("You&#x27;re a senior pharmacist reviewer for batch 0001-pilot");
    expect(sen).toContain("Your approval publishes the record.");
    expect(sen).toContain("Senior review shows every interaction pair between the medicines we hold, from all batches.");
    expect(sen).toContain('href="/review/pairs">Open the pair queue</a>');
  });

  it("no batch in review (or the list fails): no batch heading and no waiting step, never 'for batch ' with no id", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    for (const fail of [false, true]) {
      if (fail) listReviewBatches.mockRejectedValue(new Error("down")); else listReviewBatches.mockResolvedValue([]);
      const html = await render();
      expect(html).not.toContain("reviewer for batch");
      expect(html).not.toContain("records are waiting");
      expect(html).toContain("Signed in as Farhana Islam");
      expect(html).toContain('href="/review">Open the review desk</a>');
    }
  });
});
