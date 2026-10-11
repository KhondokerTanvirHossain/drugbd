import { describe, expect, it } from "vitest";
import { groupBySeverity } from "../lib/severity";

describe("groupBySeverity", () => {
  it("groups most severe first, keeps input order inside a group and drops empty groups", () => {
    const xs = [
      { severity: "minor", n: 1 }, { severity: "major", n: 2 }, { severity: "minor", n: 3 }, { severity: "major", n: 4 },
    ];
    expect(groupBySeverity(xs)).toEqual([
      ["major", [{ severity: "major", n: 2 }, { severity: "major", n: 4 }]],
      ["minor", [{ severity: "minor", n: 1 }, { severity: "minor", n: 3 }]],
    ]);
  });
  it("puts any other severity under unknown", () => {
    expect(groupBySeverity([{ severity: "weird" }, { severity: "unknown" }])).toEqual(
      [["unknown", [{ severity: "weird" }, { severity: "unknown" }]]]);
  });
});
