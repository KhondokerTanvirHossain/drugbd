import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getProduct: vi.fn(async (id: string) => ({
    conceptId: id, darNumber: "D1", tradeName: "Napa", company: "Beximco", dosageForm: "Tablet",
    genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [],
  })),
}));
import ProductPage from "@/app/products/[id]/page";

describe("product page", () => {
  it("says there is no ingredient mapping when ingredients are empty", async () => {
    const html = renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: "x" }) }));
    expect(html).toContain("No ingredient mapping from DGDA");
  });
  it("calls notFound for a malformed percent-encoded id", async () => {
    await expect(ProductPage({ params: Promise.resolve({ id: "%E0%A4%A" }) })).rejects.toSatisfy(
      (e: { digest?: string }) => !(e instanceof URIError) && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(e.digest)));
  });
});
