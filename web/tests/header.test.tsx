import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const cookieStore = { get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import Header from "@/components/Header";
import RootLayout from "@/app/layout";

beforeEach(() => { getSession.mockReset(); cookieStore.delete.mockReset(); });

describe("Header", () => {
  it("shows the role and a sign-out form, never the email, for a pharmacist", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "pharm@example.org", role: "pharmacist" }} />);
    expect(html).toContain("Signed in as Pharmacist");
    expect(html).toMatch(/<form[^>]*>.*<button[^>]*type="submit"[^>]*>Sign out<\/button><\/form>/);
    expect(html).toContain('<form class="inlineForm" action="/signout" method="post">');
    expect(html).not.toContain("pharm@example.org");
    expect(html).not.toContain("Reviewer sign-in");
  });

  it("labels the engineer and user roles", () => {
    expect(renderToStaticMarkup(<Header session={{ email: "e@x.org", role: "engineer" }} />)).toContain("Signed in as Engineer");
    const user = renderToStaticMarkup(<Header session={{ email: "someone@gmail.com", role: "user" }} />);
    expect(user).toContain("Signed in as User");
    expect(user).not.toContain("someone@gmail.com");
  });

  it("links /flags for reviewers only", () => {
    expect(renderToStaticMarkup(<Header session={{ email: "p@x.org", role: "pharmacist" }} />)).toContain('<a href="/flags">Flags</a>');
    expect(renderToStaticMarkup(<Header session={{ email: "e@x.org", role: "engineer" }} />)).toContain('<a href="/flags">Flags</a>');
    expect(renderToStaticMarkup(<Header session={{ email: "u@x.org", role: "user" }} />)).not.toContain("/flags");
    expect(renderToStaticMarkup(<Header session={null} />)).not.toContain("/flags");
  });

  it("shows a Reviewer sign-in link when signed out", () => {
    const html = renderToStaticMarkup(<Header session={null} />);
    expect(html).toContain('<a href="/signin">Reviewer sign-in</a>');
    expect(html).not.toContain("Signed in as");
    expect(html).not.toContain("Sign out");
  });

  it("keeps the existing navigation", () => {
    const html = renderToStaticMarkup(<Header session={null} />);
    for (const href of ["/", "/batches", "/check"]) expect(html).toContain(`href="${href}"`);
  });
});

describe("RootLayout", () => {
  it("renders the signed-in role from the session and never the email", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    const html = renderToStaticMarkup(await RootLayout({ children: <p>page</p> }));
    expect(html).toContain("Signed in as Pharmacist");
    expect(html).not.toContain("pharm@example.org");
    expect(html).toContain("<p>page</p>");
  });

  it("renders the sign-in link for an anonymous visitor", async () => {
    getSession.mockResolvedValue(null);
    expect(renderToStaticMarkup(await RootLayout({ children: null }))).toContain("Reviewer sign-in");
  });
});
