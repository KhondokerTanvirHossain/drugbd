import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const cookieStore = { get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));

import Header from "@/components/Header";
import RootLayout from "@/app/layout";

const PHARMACIST = { email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" as const };
beforeEach(() => { getSession.mockReset(); cookieStore.get.mockReset(); });

describe("Header (§6.1)", () => {
  it("anonymous: wordmark home, the four sections, a tonal and a plain Sign in (narrow), no account menu", () => {
    const html = renderToStaticMarkup(<Header session={null} theme="system" path="/" />);
    expect(html).toMatch(/<a class="home" href="\/"><span class="wordmark s20"/);
    for (const [href, label] of [["/search", "Medicines"], ["/check", "Interaction checker"], ["/learn", "Learn"], ["/partners", "For partners"]])
      expect(html).toContain(`href="${href}">${label}</a>`);
    expect(html).toContain('<nav aria-label="Main"');
    expect(html.match(/<nav /g)).toHaveLength(1);
    expect(html).toContain('<span class="sr-only">Menu</span>');
    expect(html).toContain('<a class="btn btn--tonal btn--sm signInWide" href="/signin">Sign in</a>');
    expect(html).toContain('<a class="btn btn--plain btn--sm signInNarrow" href="/signin">Sign in</a>');
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain("aria-current");
  });

  it("marks the current section and shows the material search bar on search, product, substance and checker pages", () => {
    for (const [path, label] of [["/search", "Medicines"], ["/products/x", "Medicines"], ["/substances/BDS-1", "Medicines"],
      ["/check", "Interaction checker"]]) {
      const html = renderToStaticMarkup(<Header session={null} theme="system" path={path} q="napa" />);
      expect(html, path).toContain(`aria-current="page">${label}</a>`);
      expect(html, path).toContain('class="bar material');
      // React 19's server renderer writes a form's action and method after its other attributes.
      expect(html, path).toMatch(/<form role="search" [^>]*action="\/search" method="get"/);
      expect(html, path).toContain('placeholder="Brand, substance or DAR number"');
    }
    expect(renderToStaticMarkup(<Header session={null} theme="system" path="/search" q="napa" />)).toContain('value="napa"');
    expect(renderToStaticMarkup(<Header session={null} theme="system" path="/learn/start" />)).toContain('aria-current="page">Learn</a>');
    expect(renderToStaticMarkup(<Header session={null} theme="system" path="/partners" />)).toContain('aria-current="page">For partners</a>');
  });

  it("signed in: a <details> account menu with own name and email, role badge, theme control and sign-out form", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="dark" path="/" />);
    expect(html).toContain('<details class="menu">');
    expect(html).toContain('<span aria-hidden="true">FI</span><span class="sr-only">Account menu for Farhana Islam</span>');
    expect(html.match(/pharm@example\.org/g)).toHaveLength(1);
    expect(html).toContain('<span class="role-badge">Pharmacist</span>');
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(html).not.toContain('href="/signin"');
  });

  it("a reader gets no role badge and no reviewer links", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "someone@gmail.com", role: "user" }} theme="system" path="/" />);
    expect(html).not.toContain("role-badge");
    expect(html).not.toContain('href="/review');
  });

  it("a reviewer's menu names the newest batch in review next to the role badge", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="system" batchId="0001-pilot" path="/" />);
    expect(html).toContain('<span class="role-badge">Pharmacist</span> Batch <span class="mono">0001-pilot</span>');
  });

  it("a senior pharmacist keeps P1C's menu: the Senior pharmacist badge and Senior review (§6.2, §5.13); a pharmacist has no such link", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "senior@example.org", name: "Sabina Rahman", role: "senior" }} theme="system" path="/" />);
    expect(html).toContain('<span class="role-badge">Senior pharmacist</span>');
    expect(html).toMatch(/<a [^>]*href="\/review\/pairs"[^>]*>Senior review<\/a>/);
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(renderToStaticMarkup(<Header session={PHARMACIST} theme="system" path="/" />)).not.toContain('href="/review/pairs"');
    expect(renderToStaticMarkup(<Header session={{ email: "eng@example.org", role: "engineer" }} theme="system" path="/" />))
      .not.toContain('href="/review/pairs"');
  });
});

describe("RootLayout chrome", () => {
  it("renders the header, the page and the footer with its line and the theme control", async () => {
    getSession.mockResolvedValue(null);
    const html = renderToStaticMarkup(await RootLayout({ children: <p>page</p> }));
    expect(html).toContain("<header");
    expect(html).toContain("<p>page</p>");
    expect(html).toMatch(/<footer[^>]*>[\s\S]*A drug knowledge base for Bangladesh\. Decision support, not a substitute for clinical judgement\.[\s\S]*aria-label="Colour theme"/);
  });

  it("shows the owner's email once, inside the account menu, and nowhere else", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    const html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html.match(/pharm@example\.org/g)).toHaveLength(1);
  });
});

describe("Header for a senior pharmacist (§6.2)", () => {
  it("the badge reads Senior pharmacist, and the menu adds Senior review", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "s@example.org", name: "S", role: "senior" }} theme="light" />);
    expect(html).toContain('<span class="role-badge">Senior pharmacist</span>');
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(html).toContain('<a href="/review/pairs">Senior review</a>');
  });
  it("a pharmacist has no Senior review item", () => {
    expect(renderToStaticMarkup(<Header session={PHARMACIST} theme="light" />)).not.toContain("/review/pairs");
  });
});
