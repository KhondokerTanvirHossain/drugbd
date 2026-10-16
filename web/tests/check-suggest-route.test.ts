import { beforeEach, describe, expect, it, vi } from "vitest";
const suggestProducts = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  suggestProducts: (q: string, ex: string[]) => suggestProducts(q, ex) }));
import { GET } from "@/app/check/suggest/route";

const call = (qs: string) => GET(new Request(`http://localhost/check/suggest${qs}`));
beforeEach(() => { suggestProducts.mockReset(); });

describe("/check/suggest (§4.3, §6.7.1)", () => {
  it("passes q and the current ids, and answers only the row fields the combobox prints", async () => {
    suggestProducts.mockResolvedValue({ ok: true, data: [{ conceptId: "N", tradeName: "Napa", dosageForm: "Tablet", status: "approved",
      clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: null, extra: "never forwarded" }] });
    const res = await call("?q=na&ids=A&ids=B");
    expect(suggestProducts).toHaveBeenCalledWith("na", ["A", "B"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual([{ conceptId: "N", tradeName: "Napa", status: "approved", clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: null }]);
  });
  it("a short or long q is an empty list without an API call; at most 20 ids are forwarded; an API failure is 502", async () => {
    expect(await (await call("?q=n")).json()).toEqual([]);
    expect(await (await call(`?q=${"x".repeat(101)}`)).json()).toEqual([]);
    expect(suggestProducts).not.toHaveBeenCalled();
    suggestProducts.mockResolvedValue({ ok: true, data: [] });
    await call(`?q=na${Array.from({ length: 25 }, (_, i) => `&ids=P${i}`).join("")}`);
    expect(suggestProducts.mock.calls[0][1]).toHaveLength(20);
    suggestProducts.mockResolvedValue({ ok: false, status: 503 });
    const res = await call("?q=na");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual([]);
  });
});
