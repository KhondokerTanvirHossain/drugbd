import { describe, expect, it } from "vitest";
import { POLL_MS, compareRows, pollVerdict } from "@/components/review/desk/poll";
import { batchHref, isDeskPath, recordHref, signInHref, versionsHref } from "@/components/review/desk/hrefs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const row = (conceptId: string, extractedAt: string | null, lastDecisionId: number | null = null, displayStatus = "pending") =>
  ({ conceptId, extractedAt, lastDecisionId, displayStatus });

describe("versions poll (§5.11)", () => {
  it("polls every 20 s", () => expect(POLL_MS).toBe(20_000));

  it("a failed poll is ignored, a 401 signs out (Review Focus 3)", async () => {
    expect(await pollVerdict(null)).toEqual({ kind: "ignore" });
    for (const status of [429, 500, 502, 503, 404]) expect(await pollVerdict(json([], status))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(new Response("<html>bad gateway</html>", { status: 200 }))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(json({ rows: [] }))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(json([{ nope: 1 }]))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(json({}, 401))).toEqual({ kind: "signedOut" });
    expect(await pollVerdict(json({}, 403))).toEqual({ kind: "forbidden" });
    expect(await pollVerdict(json([row("a", "t1")]))).toEqual({ kind: "rows", rows: [row("a", "t1")] });
  });

  it("compares the open record and the other rows separately", () => {
    const known = [row("a", "t1"), row("b", "t1")].map((r) => ({ conceptId: r.conceptId,
      version: { extractedAt: r.extractedAt, lastDecisionId: r.lastDecisionId }, displayStatus: r.displayStatus }));
    expect(compareRows(known, [row("a", "t1"), row("b", "t1")], "a")).toEqual({ open: row("a", "t1"), othersChanged: false });
    expect(compareRows(known, [row("a", "t2"), row("b", "t1")], "a")).toEqual({ open: row("a", "t2"), othersChanged: false });
    expect(compareRows(known, [row("a", "t1"), row("b", "t1", 9, "engineer_checked")], "a").othersChanged).toBe(true);
    expect(compareRows(known, [row("a", "t1"), row("b", "t1"), row("c", "t1")], "a").othersChanged).toBe(true);
    expect(compareRows(known, [row("b", "t1")], "a")).toEqual({ open: null, othersChanged: false });
  });
});

describe("desk links", () => {
  it("encode ids and keep the filter in the query", () => {
    expect(recordHref("0001-pilot", "186-0030-006--napa")).toBe("/review/0001-pilot/186-0030-006--napa");
    expect(recordHref("a b", "c/d", { show: "needs", q: "napa 500" })).toBe("/review/a%20b/c%2Fd?show=needs&q=napa+500");
    expect(recordHref("b", "c", { show: "all", q: "", pane: "list" })).toBe("/review/b/c?pane=list");
    expect(batchHref("0001-pilot")).toBe("/review/0001-pilot");
    expect(versionsHref("0001-pilot")).toBe("/review/0001-pilot/versions");
    expect(signInHref("/review/0001-pilot/x?show=needs")).toBe("/signin?returnTo=%2Freview%2F0001-pilot%2Fx%3Fshow%3Dneeds");
  });

  it("isDeskPath is true only inside this batch's desk", () => {
    expect(isDeskPath("/review/0001-pilot/napa", "0001-pilot")).toBe(true);
    expect(isDeskPath("/review/0001-pilot", "0001-pilot")).toBe(false);
    expect(isDeskPath("/review/0002/napa", "0001-pilot")).toBe(false);
    expect(isDeskPath("/review/flags", "0001-pilot")).toBe(false);
    expect(isDeskPath("/search", "0001-pilot")).toBe(false);
  });
});
