import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PairCard } from "@/components/ui";
import { UNKNOWN_PAIR_LINE } from "@/lib/copy";

describe("PairCard (§3.4)", () => {
  it("renders the DDInter text unclamped on the server, so it reads in full without JavaScript", () => {
    const html = r(<PairCard id="p1" severity="major" names="Warfarin + Acetylsalicylic acid" meta="Action: synergy"
      text={{ kind: "management", body: "This combination should generally be avoided." }}
      source="Management, truncated. Full text from DDInter 2.0." surface="public" />);
    expect(html).toBe('<article class="pair"><div class="pair-head"><span class="sev sev--major">Major</span>' +
      '<span class="pair-names">Warfarin + Acetylsalicylic acid</span></div><p class="pair-meta">Action: synergy</p>' +
      '<p class="pair-text open" id="p1-text">This combination should generally be avoided.</p>' +
      '<p class="pair-source">Management, truncated. Full text from DDInter 2.0. </p></article>');
  });

  it("an unknown pair with no text has no text block and no expander", () => {
    const html = r(<PairCard id="p2" severity="unknown" names="Warfarin + Amlodipine" source={UNKNOWN_PAIR_LINE} surface="reviewer" />);
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter</span>');
    expect(html).not.toContain("pair-text");
    expect(html).toContain(`<p class="pair-source">${UNKNOWN_PAIR_LINE.replace(/"/g, "&quot;")}</p>`);
  });
});
