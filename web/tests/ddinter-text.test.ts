import { describe, expect, it } from "vitest";
import { ddinterText } from "../lib/ddinter-text";
import { severityLabel, severityText } from "../lib/severity";

describe("ddinterText", () => {
  it.each(["None", "none", " NONE ", "null", "NULL", "N/A", "n/a", "NA", "na", "-", "--", "", "   ", "\tNone\n"])(
    "treats the placeholder %j as missing", (v) => {
      expect(ddinterText(v)).toBeNull();
    });
  it("treats null and undefined as missing", () => {
    expect(ddinterText(null)).toBeNull();
    expect(ddinterText(undefined)).toBeNull();
  });
  it.each(["Monitor INR.", "None of the above", "No interaction expected.", "-1 dose"])("keeps the real text %j", (v) => {
    expect(ddinterText(v)).toBe(v);
  });
  it("trims real text", () => {
    expect(ddinterText("  Monitor INR.  ")).toBe("Monitor INR.");
  });
});

describe("severity wording", () => {
  it("never shows the bare word unknown", () => {
    expect(severityLabel("unknown")).toBe("Severity not classified by DDInter");
    expect(severityText("unknown")).toBe("Severity not classified by DDInter");
    expect(severityText("weird")).toBe("Severity not classified by DDInter");
    expect(severityText("")).toBe("Severity not classified by DDInter");
  });
  it("keeps the DDInter severities", () => {
    expect(severityLabel("major")).toBe("Major");
    expect(severityText("major")).toBe("major");
    expect(severityText("moderate")).toBe("moderate");
  });
});
