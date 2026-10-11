import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchProducts = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  searchProducts: (q: string, page: number, scope?: string) => searchProducts(q, page, scope),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import Home from "@/app/page";

const item = (conceptId: string, reviewStatus?: string) => ({ conceptId, tradeName: `T-${conceptId}`, dosageForm: "Tablet",
  genericContentRaw: "X 5 mg", company: "Co", reviewStatus });
const render = async () => renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ q: "napa" }) }));

beforeEach(() => {
  searchProducts.mockReset(); searchProducts.mockResolvedValue({ items: [item("A", "ok"), item("B", "pending")], error: null });
  getSession.mockReset();
});

describe("search page visibility", () => {
  it("anonymous search uses scope=public and shows no badges", async () => {
    getSession.mockResolvedValue(null);
    const html = await render();
    expect(searchProducts).toHaveBeenCalledWith("napa", 0, "public");
    expect(html).not.toContain("unreviewed");
  });

  it("reviewer search uses scope=all and badges unapproved products", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", role: "engineer" });
    const html = await render();
    expect(searchProducts).toHaveBeenCalledWith("napa", 0, "all");
    expect(html.match(/>unreviewed</g)).toHaveLength(1);
    expect(html).toMatch(/T-B<\/a> <span class="badge"[^>]*>unreviewed<\/span>/);
    expect(html).not.toContain("eng@example.org");
  });
});
