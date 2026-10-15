import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PairReviewState from "@/components/ui/PairReviewState";

const AT = "2026-10-15T03:00:00Z";   // 09:00 Dhaka, 15/10/2026
const line = (html: string) => html.replace(/^<p class="pair-review">|<\/p>$/g, "");

describe("PairReviewState (§3.4, §5.17)", () => {
  it("reviewer: the four states as plain text, with (you) and the issue note", () => {
    expect(r(<PairReviewState state="not_reviewed" at={null} mine={false} note={null} surface="reviewer" />))
      .toBe('<p class="pair-review">Pair not yet reviewed by a senior pharmacist</p>');
    expect(line(r(<PairReviewState state="reviewed" at={AT} mine={false} note={null} surface="reviewer" />)))
      .toBe("Pair reviewed by a senior pharmacist on 15/10/2026");
    expect(line(r(<PairReviewState state="reviewed" at={AT} mine note={null} surface="reviewer" />)))
      .toBe("Pair reviewed by a senior pharmacist on 15/10/2026 (you)");
    expect(line(r(<PairReviewState state="changed" at={AT} mine={false} note={null} surface="reviewer" />)))
      .toBe("Pair changed in DDInter after a senior pharmacist reviewed it on 15/10/2026.");
    expect(line(r(<PairReviewState state="issue" at={AT} mine={false} note="text contradicts the severity" surface="reviewer" />)))
      .toBe('Pair issue reported by a senior pharmacist on 15/10/2026. Note: <span class="raw">text contradicts the severity</span>');
    expect(line(r(<PairReviewState state="issue" at={AT} mine note="x y z w v" surface="reviewer" />)))
      .toContain("on 15/10/2026 (you). Note:");
  });
  it("public: only reviewed and not reviewed; changed and issue read not reviewed, and never (you) or a note (D53)", () => {
    expect(line(r(<PairReviewState state="reviewed" at={AT} mine note={null} surface="public" />))).toBe("Pair reviewed by a senior pharmacist on 15/10/2026");
    for (const state of ["changed", "issue", "not_reviewed"] as const)
      expect(line(r(<PairReviewState state={state} at={AT} mine note="secret" surface="public" />))).toBe("Pair not yet reviewed by a senior pharmacist");
  });
  it("never green, a pill, a seal or a chip (mark exclusivity)", () => {
    for (const state of ["not_reviewed", "reviewed", "changed", "issue"] as const)
      expect(r(<PairReviewState state={state} at={AT} mine={false} note="n" surface="reviewer" />)).not.toMatch(/rv--|rv |sev|seal|ok|chip/);
  });
});
