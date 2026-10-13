import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listBatches = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBatches: () => listBatches(),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import Batches from "@/app/batches/page";

beforeEach(() => {
  listBatches.mockReset();
  listBatches.mockResolvedValue([{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-12T09:00:00Z", itemCount: 10, items: [] }]);
  getSession.mockReset();
});

describe("/batches (spec §12.1, phase 0)", () => {
  it.each([null, { email: "someone@gmail.com", role: "user" }])("shows only the gate line to %o, with no API call", async (s) => {
    getSession.mockResolvedValue(s);
    const html = renderToStaticMarkup(await Batches());
    expect(html).toContain("Only pharmacists and engineers can see batches.");
    expect(html).not.toContain("0001-pilot");
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("lists the batches for a reviewer", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", role: "engineer" });
    const html = renderToStaticMarkup(await Batches());
    expect(html).toContain('<a href="/batches/0001-pilot">0001-pilot</a>');
    expect(html).not.toContain("eng@example.org");
  });
});
