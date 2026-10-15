import { describe, expect, it } from "vitest";
import { advance, needsFor, type AdvanceRow } from "@/components/review/desk/advance";

const rows = (statuses: AdvanceRow["status"][]): AdvanceRow[] =>
  statuses.map((status, i) => ({ conceptId: `c${i + 1}`, name: `Brand ${i + 1}`, index: i + 1, status }));
const base = { role: "pharmacist" as const, batchId: "0001-pilot", reportOpen: false, saved: "Saved. Brand 2 is approved by a pharmacist and published." };

describe("auto-advance (§5.9)", () => {
  it("needs-review sets per role", () => {
    expect(["pending", "back_in_review", "engineer_checked"].every((s) => needsFor("pharmacist", s as AdvanceRow["status"]))).toBe(true);
    expect(needsFor("engineer", "engineer_checked")).toBe(false);
    expect(needsFor("engineer", "back_in_review")).toBe(true);
    expect(needsFor("pharmacist", "issue")).toBe(false);
    expect(needsFor("senior", "engineer_checked")).toBe(true);
    expect(needsFor("senior", "issue")).toBe(false);
  });

  it("opens the next record that needs review in the visible order, wrapping", () => {
    const all = rows(["approved", "approved", "pending", "approved"]);
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "open", target: all[2], clearFilter: false,
        announce: "Saved. Brand 2 is approved by a pharmacist and published. Opened Brand 3, record 3 of 4." });
    const wrap = rows(["pending", "approved", "approved", "approved"]);
    expect(advance({ ...base, committedId: "c3", openId: "c3", visible: wrap, all: wrap })).toMatchObject({ kind: "open", target: wrap[0] });
  });

  it("an engineer skips records an engineer already checked", () => {
    const all = rows(["engineer_checked", "engineer_checked", "engineer_checked", "pending"]);
    expect(advance({ ...base, role: "engineer", committedId: "c2", openId: "c2", visible: all, all }))
      .toMatchObject({ kind: "open", target: all[3] });
  });

  it("clears the filter when the only record left is outside the view", () => {
    const all = rows(["approved", "approved", "issue", "pending"]);
    const visible = [all[0], all[1]];
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible, all })).toMatchObject({ kind: "open", target: all[3], clearFilter: true });
  });

  it("stays when the report panel is open, or when the committed record is not the open one", () => {
    const all = rows(["pending", "approved", "pending"]);
    expect(advance({ ...base, reportOpen: true, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "stay", announce: base.saved });
    expect(advance({ ...base, committedId: "c2", openId: "c1", visible: all, all })).toEqual({ kind: "stay", announce: base.saved });
  });

  it("says so when nothing else needs review", () => {
    const all = rows(["approved", "approved", "issue"]);
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "stay", announce: `${base.saved} No other record needs your review.` });
  });

  it("switches to the complete view when every record is approved, only if the committed record is open", () => {
    const all = rows(["approved", "approved"]);
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "complete", switchView: true, announce: `${base.saved} Every record in batch 0001-pilot is approved.` });
    expect(advance({ ...base, committedId: "c2", openId: "c1", visible: all, all })).toMatchObject({ kind: "complete", switchView: false });
  });
});
