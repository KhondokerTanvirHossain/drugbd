import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPublic, getProductInteractions, getPublicProduct, getSubstanceInteractions, isStub, requestPartnerAccess,
  searchMedicines, suggestProducts } from "@/lib/api";

const fetchMock = vi.fn();
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", "x".repeat(40));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const url = () => String(fetchMock.mock.calls[0][0]);
const headers = () => (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;

describe("public reads (§2.2: scope=public, never the token)", () => {
  it("search, product, interactions, substance pairs and suggest send scope=public and no token", async () => {
    for (const call of [() => searchMedicines("napa", 2), () => getPublicProduct("a/b"), () => getProductInteractions("N-1", 1),
      () => getSubstanceInteractions("BDS-1", "major", 3), () => suggestProducts("na", ["A", "B"])]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(ok({}));
      await call();
      expect(url()).toContain("scope=public");
      expect(headers()["X-Internal-Token"]).toBeUndefined();
    }
  });

  it("builds each path and query exactly", async () => {
    fetchMock.mockResolvedValue(ok({}));
    await searchMedicines("100% napa", 2);
    expect(url()).toBe("http://api:8080/v1/search?q=100%25+napa&page=2&scope=public");
    fetchMock.mockClear();
    await getPublicProduct("a/b");
    expect(url()).toBe("http://api:8080/v1/products/a%2Fb?scope=public");
    fetchMock.mockClear();
    await getSubstanceInteractions("BDS-1", null, 0);
    expect(url()).toBe("http://api:8080/v1/substances/BDS-1/interactions?page=0&scope=public");
    fetchMock.mockClear();
    await suggestProducts("na", ["A", "B"]);
    expect(url()).toBe("http://api:8080/v1/products/suggest?q=na&exclude=A&exclude=B&scope=public");
  });

  it("answers status codes, network failures and malformed bodies as Read failures", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await getPublicProduct("x")).toEqual({ ok: false, status: 404 });
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await getPublicProduct("x")).toEqual({ ok: false, status: 0 });
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));
    expect(await getPublicProduct("x")).toEqual({ ok: false, status: 502 });
  });

  it("isStub reads the hidden flag only", () => {
    expect(isStub({ conceptId: "a", tradeName: "A", status: "removed", batchId: null, hidden: true })).toBe(true);
    expect(isStub({ conceptId: "a" })).toBe(false);
  });
});

describe("checkPublic (§6.7.3 API errors)", () => {
  it("names the unknown id from a 404 so the page can drop it", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false,
      errors: [{ field: "conceptIds", code: "NOT_FOUND", message: "Product not found: gone-1" }] }), { status: 404 }));
    expect(await checkPublic(["N-1", "gone-1"])).toEqual({ ok: false, status: 404, unknownId: "gone-1" });
  });
  it("posts the ids with scope=public and no token", async () => {
    fetchMock.mockResolvedValue(ok({ summary: {}, products: [], alerts: [], noInteraction: [], notChecked: [], duplicates: [], noData: [],
      notReviewed: [] }));
    const r = await checkPublic(["A", "B"]);
    expect(r.ok).toBe(true);
    expect(url()).toBe("http://api:8080/v1/interactions/check?scope=public");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ conceptIds: ["A", "B"] });
    expect(headers()["X-Internal-Token"]).toBeUndefined();
  });
  it("a 5xx or a body without the §7.4 lists is a failure without an id", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    expect(await checkPublic(["A", "B"])).toEqual({ ok: false, status: 503, unknownId: null });
    fetchMock.mockResolvedValue(ok({ alerts: [] }));
    expect(await checkPublic(["A", "B"])).toEqual({ ok: false, status: 502, unknownId: null });
  });
});

describe("partner request (§6.9, D17)", () => {
  it("is a flag other/partner-access with the token", async () => {
    fetchMock.mockResolvedValue(ok({ id: 1 }));
    await requestPartnerAccess("Organisation: Acme", "me@example.org", "11111111-1111-4111-8111-111111111111");
    expect(url()).toBe("http://api:8080/v1/flags");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ targetType: "other", targetId: "partner-access",
      message: "Organisation: Acme", reporterEmail: "me@example.org", requestId: "11111111-1111-4111-8111-111111111111" });
    expect(headers()["X-Internal-Token"]).toBe("x".repeat(40));
  });
});
