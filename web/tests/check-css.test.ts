import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §10.4 / WCAG 1.4.10: no two-dimensional scrolling at 320 CSS px. The no-data block's chips carry the full
// "{brand} + {partner brand} ({partner substance})" label, and tokens.css .sev is nowrap with a fixed 24 px
// height: at 320x640 "Napa Extend + Seclo 20 (Omeprazole)" measured scrollWidth 355 > 320. The check page must
// let those chips wrap (scoped under .results, where CheckResults renders NoDataBlock's p.nodata-pairs).
const css = readFileSync(join(__dirname, "..", "components/check/check.module.css"), "utf8");

describe("check.module.css reflows the no-data chips at 320 px (§10.4, WCAG 1.4.10)", () => {
  it(".results .nodata-pairs .sev wraps, grows in height and breaks a long word", () => {
    const m = css.match(/^\.results :global\(\.nodata-pairs \.sev\)\s*\{([^}]*)\}/m);
    expect(m, ".results :global(.nodata-pairs .sev) rule").not.toBeNull();
    const body = m![1];
    expect(body).toMatch(/white-space:\s*normal/);
    expect(body).toMatch(/height:\s*auto/);
    expect(body).toMatch(/min-height:\s*24px/);
    expect(body).toMatch(/padding-block:\s*4px/);
    expect(body).toMatch(/line-height:\s*1\.25/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
