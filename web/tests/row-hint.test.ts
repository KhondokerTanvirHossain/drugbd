import { describe, expect, it } from "vitest";
import { rowHint } from "@/components/review/desk/row-hint";

const h = (over = {}) => ({ failed: 0, warnings: 0, pairsWithoutText: 0, noData: false, notRun: false, ...over });
const clean = { netErr: null, stale: false };

describe("row hints, the first rule wins (§5.4)", () => {
  it("in rule order", () => {
    expect(rowHint(h({ noData: true }), { netErr: "no", stale: true })).toEqual({ text: "Decision not saved", tone: "warn" });
    expect(rowHint(h(), { netErr: "unknown", stale: true })).toEqual({ text: "Decision not confirmed", tone: "warn" });
    expect(rowHint(h({ noData: true }), { netErr: null, stale: true })).toEqual({ text: "Changed since you opened it", tone: "warn" });
    expect(rowHint(h({ noData: true, failed: 2 }), clean)).toEqual({ text: "No DDInter data", tone: "nodata" });
    expect(rowHint(h({ notRun: true, failed: 2 }), clean)).toEqual({ text: "DDInter not run yet", tone: "warn" });
    expect(rowHint(h({ failed: 1, warnings: 3 }), clean)).toEqual({ text: "1 check failed", tone: "warn" });
    expect(rowHint(h({ failed: 2 }), clean)).toEqual({ text: "2 checks failed", tone: "warn" });
    expect(rowHint(h({ warnings: 1 }), clean)).toEqual({ text: "1 check warning", tone: "warn" });
    expect(rowHint(h({ warnings: 2, pairsWithoutText: 1 }), clean)).toEqual({ text: "2 check warnings, 1 pair without text", tone: "warn" });
    expect(rowHint(h({ warnings: 1, pairsWithoutText: 6 }), clean)).toEqual({ text: "1 check warning, 6 pairs without text", tone: "warn" });
    expect(rowHint(h(), clean)).toEqual({ text: "All checks OK", tone: null });
  });

  it("gives the pilot triage of §1.6 item 7", async () => {
    const { pilotRows } = await import("./fixtures/pilot");
    expect(pilotRows().map((r) => `${r.tradeName}: ${rowHint(r.hint, clean).text}`)).toEqual([
      "Amlodipine-5: 1 check warning, 4 pairs without text", "Aspirin: 1 check warning, 5 pairs without text",
      "Simvastatin: 1 check warning, 4 pairs without text", "Chloramphenicol: All checks OK", "Domperidone: No DDInter data",
      "G Warfarin: 1 check warning, 1 pair without text", "G-Metformin: 1 check warning, 5 pairs without text",
      "Napa: 1 check warning, 6 pairs without text", "Clarith: 1 check warning, 2 pairs without text",
      "Amoxycillin Clavulanic Acid: 1 check warning, 5 pairs without text",
    ]);
  });
});
