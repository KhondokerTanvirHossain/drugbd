import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listFlags = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listFlags: (status?: string) => listFlags(status),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import FlagsPage from "@/app/flags/page";

const render = async (sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await FlagsPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  listFlags.mockReset();
  listFlags.mockResolvedValue([
    { id: 3, targetType: "product", targetId: "P-1", message: "Wrong <company>", status: "open", createdAt: "2026-10-12T10:00:00Z" },
    { id: 4, targetType: "check", targetId: "P-1,P-2", message: "Missing alert", status: "open", createdAt: "2026-10-12T11:00:00Z" },
  ]);
  getSession.mockReset();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("/flags", () => {
  it("is for reviewers only: anonymous visitors and role user get no list and no API call", async () => {
    for (const s of [null, { email: "someone@gmail.com", role: "user" }]) {
      getSession.mockResolvedValue(s);
      const html = await render();
      expect(html).toContain("Only pharmacists and engineers can see flags.");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("someone@gmail.com");
    }
    expect(listFlags).not.toHaveBeenCalled();
  });

  it("lists open flags for a reviewer with a resolve form (Turnstile) each, and no emails", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    const html = await render();
    expect(listFlags).toHaveBeenCalledWith("open");
    expect(html).toContain('<a href="/products/P-1">product P-1</a>');
    expect(html).toContain('<a href="/check?ids=P-1&amp;ids=P-2">check P-1,P-2</a>');
    expect(html).toContain("Wrong &lt;company&gt;");
    const forms = html.match(/<form[\s\S]*?<\/form>/g) ?? [];
    expect(forms).toHaveLength(2);
    expect(forms[0]).toContain('name="flagId" value="3"');
    expect(forms[0]).toContain(">Resolve</button>");
    expect(forms[0]).toContain('class="cf-turnstile"');
    expect(html).not.toContain("@");
  });

  it("says when there are no open flags, when the list is unavailable, and shows the resolve outcome", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", role: "engineer" });
    listFlags.mockResolvedValue([]);
    expect(await render({ resolve: "resolved" })).toContain("The flag was resolved.");
    expect(await render({ resolve: "invalid" })).toContain("That flag is no longer open.");
    expect(await render()).toContain("No open flags.");
    listFlags.mockRejectedValue(new Error("API error 500"));
    expect(await render()).toContain("The flag list is temporarily unavailable.");
  });
});
