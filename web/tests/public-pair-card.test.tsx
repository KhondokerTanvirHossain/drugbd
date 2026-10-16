import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PublicPairCard from "@/components/public/PublicPairCard";

const reviewed = { state: "reviewed" as const, reviewedAt: "2026-10-16T05:20:00Z" };
const notReviewed = { state: "not_reviewed" as const, reviewedAt: null };
const card = (over: Partial<Parameters<typeof PublicPairCard>[0]> = {}) => renderToStaticMarkup(<PublicPairCard id="p1" severity="moderate"
  names="Napa + G Warfarin" review={reviewed} text={{ kind: "management", body: "Monitor INR." }} source="Source: DDInter 2.0" heading="h4" {...over} />);

describe("PublicPairCard (§6.5, §6.7.3, P1C D53)", () => {
  it("labels the pair From DDInter 2.0 with its public review state, plain text, never green", () => {
    const html = card();
    expect(html).toContain("From DDInter 2.0");
    expect(html).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
    expect(html).not.toMatch(/rv--approved|--ok|seal/);
    expect(card({ review: notReviewed })).toContain("Pair not yet reviewed by a senior pharmacist");
  });
  it("short management text is in full; long text is truncated with Show full text", () => {
    expect(card()).toContain("Management, full text from DDInter 2.0.");
    const long = card({ text: { kind: "management", body: "x".repeat(201) } });
    expect(long).toContain("Management, truncated. Full text from DDInter 2.0.");
  });
  it("interaction only, no text, and unknown severity with no text", () => {
    const inter = card({ text: { kind: "interaction", body: "Raises levels." } });
    expect(inter).toContain("DDInter 2.0 gives no management text for this pair.");
    expect(inter).toContain("Interaction description, full text from DDInter 2.0.");
    expect(card({ text: null })).toContain("DDInter 2.0 gives no text for this pair.");
    const unknown = card({ severity: "unknown", text: null });
    expect(unknown).toContain("DDInter 2.0 lists this pair with action &quot;unknown&quot; and no text. It is not treated as low risk.");
    expect(unknown).toContain("Severity not classified by DDInter");
  });
  it("puts the label first when asked (checker: directly under the head)", () => {
    const html = card({ reviewFirst: true, meta: "Acetaminophen + Warfarin. Action: synergy" });
    expect(html.indexOf("From DDInter 2.0")).toBeLessThan(html.indexOf("Action: synergy"));
    expect(card({ meta: "Acetaminophen + Warfarin. Action: synergy" }).indexOf("From DDInter 2.0"))
      .toBeGreaterThan(card({ meta: "Acetaminophen + Warfarin. Action: synergy" }).indexOf("Action: synergy"));
  });
});
