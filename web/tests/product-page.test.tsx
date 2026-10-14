import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/api";

const base: Product = {
  conceptId: "x", darNumber: "D1", tradeName: "Napa", company: "Beximco", dosageForm: "Tablet",
  genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [],
  parseStatus: null, parseNote: null, clinicalDrug: null,
};
const getProduct = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getProduct: (...args: unknown[]) => getProduct(...args),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import ProductPage from "@/app/products/[id]/page";

const render = async (id = "x", flag?: string) => renderToStaticMarkup(await ProductPage({
  params: Promise.resolve({ id }), searchParams: Promise.resolve(flag ? { flag } : {}) }));

beforeEach(() => {
  getProduct.mockReset(); getProduct.mockImplementation(async (id: string) => ({ ...base, conceptId: id }));
  getSession.mockReset(); getSession.mockResolvedValue(null);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("product page visibility (spec §2.2: public scope for every session)", () => {
  const hidden = { conceptId: "H-1", tradeName: "Secretname", reviewStatus: "pending", hidden: true };

  it("asks the API with the id only, which reads public scope", async () => {
    await render("x");
    expect(getProduct).toHaveBeenCalledWith("x");
  });

  it("anonymous: a hidden product shows only 'Not yet reviewed by a pharmacist', no data", async () => {
    getProduct.mockResolvedValue(hidden);
    const html = await render("H-1");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["Secretname", "DAR number", "Company", "Active ingredients", "Clinical drug", "Flag a problem"])
      expect(html).not.toContain(absent);
  });

  it("a signed-in user can flag the hidden product", async () => {
    getSession.mockResolvedValue({ email: "someone@gmail.com", role: "user" });
    getProduct.mockResolvedValue(hidden);
    const html = await render("H-1");
    expect(getProduct).toHaveBeenCalledWith("H-1");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).toContain("Flag a problem");
    expect(html).not.toContain("someone@gmail.com");
  });

  it("a pharmacist sees the same stub on an unapproved product page (phase 0 exit criterion)", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    getProduct.mockResolvedValue(hidden);
    const html = await render("H-1");
    expect(getProduct).toHaveBeenCalledWith("H-1");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["Secretname", "DAR number", "unreviewed", "pharm@example.org"]) expect(html).not.toContain(absent);
  });

  it("an approved product shows no badge for any session", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    expect(await render("x")).not.toContain("unreviewed");
    getSession.mockResolvedValue(null);
    expect(await render("x")).not.toContain("unreviewed");
  });

  it("shows the flag form to signed-in visitors only, and the outcome after a flag", async () => {
    expect(await render("x")).not.toContain("Flag a problem");
    getSession.mockResolvedValue({ email: "someone@gmail.com", role: "user" });
    const html = await render("x", "sent");
    expect(html).toContain("Flag a problem");
    expect(html).toContain('name="targetType" value="product"');
    expect(html).toContain("Thank you. Your flag was sent to the reviewers.");
  });
});

describe("product page", () => {
  it("says there is no ingredient mapping when ingredients are empty", async () => {
    const html = await render();
    expect(html).toContain("No ingredient mapping from DGDA");
  });
  it("calls notFound for a malformed percent-encoded id", async () => {
    await expect(ProductPage({ params: Promise.resolve({ id: "%E0%A4%A" }) })).rejects.toSatisfy(
      (e: { digest?: string }) => !(e instanceof URIError) && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(e.digest)));
  });

  it("shows the clinical drug with a route badge, linked ingredients and the ophthalmic DDInter entry", async () => {
    getProduct.mockResolvedValue({ ...base, tradeName: "Chloramphenicol eye drops", dosageForm: "Eye Drop",
      parseStatus: "parsed", parseNote: null,
      clinicalDrug: { bdcId: "BDC-000003", displayName: "Chloramphenicol 0.5% Eye Drop", doseForm: "Eye Drop",
        route: "ophthalmic", ingredients: [{ bdsId: "BDS-000003", name: "Chloramphenicol", strengthValue: 0.5,
          strengthUnit: "%", perValue: null, perUnit: null,
          ddinter: [{ ddinterId: "DDInter352", name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic",
            routeAssumed: false }] }] } });
    const html = await render();
    expect(html).toContain("Chloramphenicol 0.5% Eye Drop");
    expect(html).toContain("BDC-000003");
    expect(html).toMatch(/<span class="badge[^"]*"[^>]*>ophthalmic<\/span>/);
    expect(html).toContain('<a href="/substances/BDS-000003">Chloramphenicol</a>');
    expect(html).toContain("Chloramphenicol</a> 0.5%");
    expect(html).toContain("DDInter352 Chloramphenicol (ophthalmic)");
    expect(html).not.toContain("route assumed");
    expect(html).toContain("parsed");
  });

  it("shows each ingredient's own strength for a combination product", async () => {
    getProduct.mockResolvedValue({ ...base, parseStatus: "parsed",
      clinicalDrug: { bdcId: "BDC-000002", displayName: "Amoxicillin 500 mg / Clavulanic acid 125 mg Tablet",
        doseForm: "Tablet", route: "oral", ingredients: [
          { bdsId: "BDS-000010", name: "Amoxicillin", strengthValue: 500, strengthUnit: "mg", perValue: null,
            perUnit: null, ddinter: [] },
          { bdsId: "BDS-000011", name: "Clavulanic acid", strengthValue: 125, strengthUnit: "mg", perValue: 5,
            perUnit: "mL", ddinter: [{ ddinterId: "DDInter9", name: "Clavulanic acid", routeScope: "systemic",
              routeAssumed: true }] }] } });
    const html = await render();
    expect(html).toContain("<li><a href=\"/substances/BDS-000010\">Amoxicillin</a> 500 mg");
    expect(html).toContain("<a href=\"/substances/BDS-000011\">Clavulanic acid</a> 125 mg per 5 mL");
    expect(html).toContain("No DDInter entry for this route: no interaction data.");
    expect(html).toContain("DDInter9 Clavulanic acid (route assumed: general entry)");
  });

  it("never prints a DDInter placeholder as an entry name", async () => {
    getProduct.mockResolvedValue({ ...base, parseStatus: "parsed",
      clinicalDrug: { bdcId: "BDC-000001", displayName: "Warfarin 5 mg Tablet", doseForm: "Tablet", route: "oral",
        ingredients: [{ bdsId: "BDS-000001", name: "Warfarin", strengthValue: 5, strengthUnit: "mg", perValue: null,
          perUnit: null, ddinter: [
            { ddinterId: "DDInter1951", name: "None", routeScope: "systemic", routeAssumed: false },
            { ddinterId: "DDInter1952", name: " - ", routeScope: "systemic", routeAssumed: false }] }] } });
    const html = await render();
    expect(html).toContain("DDInter: DDInter1951; DDInter1952</small>");
    expect(html).not.toMatch(/\bNone\b/);
  });

  it("shows parse status and note when there is no clinical drug", async () => {
    getProduct.mockResolvedValue({ ...base, parseStatus: "partial", parseNote: "strength not found for Caffeine" });
    const html = await render();
    expect(html).toContain("partial: strength not found for Caffeine");
    expect(html).toContain("No clinical drug yet.");
  });

  it("says when the content has not been parsed yet", async () => {
    const html = await render();
    expect(html).toContain("not parsed yet");
  });
});
