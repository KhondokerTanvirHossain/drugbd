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

describe("check.module.css: the active combobox option keeps its problem line and pill readable (WCAG 1.4.3)", () => {
  // ProblemLine.css paints .problem-line in --fg; on the active option's --accent that is about 2.7:1 (light) and 1.9:1 (dark).
  it(".s-opt[aria-selected=true] .problem-line is --on-accent, and its warn glyph follows the text colour", () => {
    const text = css.match(/^\.s-opt\[aria-selected="true"\] :global\(\.problem-line\)\s*\{([^}]*)\}/m);
    expect(text, '.s-opt[aria-selected="true"] :global(.problem-line) rule').not.toBeNull();
    expect(text![1]).toMatch(/color:\s*var\(--on-accent\)/);
    const glyph = css.match(/^\.s-opt\[aria-selected="true"\] :global\(\.problem-line\)::before\s*\{([^}]*)\}/m);
    expect(glyph, '.s-opt[aria-selected="true"] :global(.problem-line)::before rule').not.toBeNull();
    expect(glyph![1]).toMatch(/background:\s*currentColor/);
  });

  // The show-mode pill in the same option: tokens.css .rv--pending is --fg-2 on transparent, 1.29:1 on --accent (e2e axe).
  // Mirrors tokens.css .rec[aria-selected="true"] .rv.
  it(".s-opt[aria-selected=true] .rv is a hollow --on-accent pill", () => {
    const pill = css.match(/^\.s-opt\[aria-selected="true"\] :global\(\.rv\)\s*\{([^}]*)\}/m);
    expect(pill, '.s-opt[aria-selected="true"] :global(.rv) rule').not.toBeNull();
    expect(pill![1]).toMatch(/background:\s*transparent/);
    expect(pill![1]).toMatch(/color:\s*var\(--on-accent\)/);
    expect(pill![1]).toMatch(/border-color:\s*var\(--on-accent\)/);
  });
});
