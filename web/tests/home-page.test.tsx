import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchProducts = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  searchProducts: (...args: unknown[]) => searchProducts(...args),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import Home from "@/app/page";

const item = (conceptId: string) => ({ conceptId, tradeName: `T-${conceptId}`, dosageForm: "Tablet",
  genericContentRaw: "X 5 mg", company: "Co" });
const render = async () => renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ q: "napa" }) }));

beforeEach(() => {
  searchProducts.mockReset(); searchProducts.mockResolvedValue({ items: [item("A"), item("B")], error: null });
  getSession.mockReset();
});

describe("search page visibility (spec §2.2: public scope for every session)", () => {
  it.each([null, { email: "someone@gmail.com", role: "user" }, { email: "eng@example.org", role: "engineer" },
    { email: "pharm@example.org", role: "pharmacist" }])("searches with public scope only (%o)", async (session) => {
    getSession.mockResolvedValue(session);
    const html = await render();
    expect(searchProducts).toHaveBeenCalledWith("napa", 0);
    expect(html).toContain("T-A");
    expect(html).not.toContain("unreviewed");
    expect(html).not.toContain("@example.org");
  });
});
