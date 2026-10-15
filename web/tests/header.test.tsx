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

describe("Header", () => {
  it("anonymous: the wordmark links home, the checker link, and a tonal Sign in", () => {
    const html = renderToStaticMarkup(<Header session={null} theme="system" />);
    expect(html).toMatch(/<a class="home" href="\/"><span class="wordmark s20"/);
    expect(html).toContain('<a href="/check">Interaction checker</a>');
    expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/signin">Sign in</a>');
    expect(html).not.toContain("<details");
    expect(html).not.toContain("/batches");
  });

  it("signed in: a <details> account menu with own name and email, role badge, theme control and sign-out form", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="dark" />);
    expect(html).toContain('<details class="menu">');
    expect(html).toContain('<span aria-hidden="true">FI</span><span class="sr-only">Account menu for Farhana Islam</span>');
    expect(html.match(/pharm@example\.org/g)).toHaveLength(1);
    expect(html.indexOf("pharm@example.org")).toBeGreaterThan(html.indexOf("<details"));
    expect(html).toContain('<span class="role-badge">Pharmacist</span>');
    expect(html).toContain('aria-label="Colour theme"');
    expect(html).toContain('<form action="/signout" method="post"><button type="submit" class="btn btn--plain btn--sm">Sign out</button></form>');
    expect(html).not.toMatch(/href="\/(batches|flags)"/);
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(html).toContain('<a href="/review/flags">Problem reports and partner requests</a>');
  });

  it("a reader gets no role badge and no reviewer links; a missing name falls back to the email", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "someone@gmail.com", role: "user" }} theme="system" />);
    expect(html).not.toContain("role-badge");
    expect(html).not.toContain('href="/review');
    expect(html).toContain("Account menu for someone@gmail.com");
    expect(html).toContain('<span aria-hidden="true">SG</span>');
  });

  it("a reviewer's menu names the newest batch in review next to the role badge", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="system" batchId="0001-pilot" />);
    expect(html).toContain('<span class="role-badge">Pharmacist</span> Batch <span class="mono">0001-pilot</span>');
    expect(renderToStaticMarkup(<Header session={PHARMACIST} theme="system" batchId={null} />)).not.toContain("Batch <span");
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
