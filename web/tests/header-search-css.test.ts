import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §6.11.1: the HeaderSearch list hangs under the field in the sticky bar, and its active option keeps the problem line and
// the pill readable (WCAG 1.4.3), as check.module.css does for the checker's options (check-css.test.ts).
const css = readFileSync(join(__dirname, "..", "components/Header.module.css"), "utf8");
const rule = (selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`^${esc}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, selector).not.toBeNull();
  return m![1];
};

describe("Header.module.css: the header search list (§6.11.1)", () => {
  it("is positioned on the search form, the field's full width, over the page, and scrolls when long", () => {
    expect(rule(".searchForm")).toMatch(/position:\s*relative/);
    const list = rule(".hsList");
    for (const p of [/position:\s*absolute/, /left:\s*0/, /right:\s*0/, /z-index:\s*40/, /overflow:\s*auto/, /max-height:/, /background:\s*var\(--surface\)/])
      expect(list).toMatch(p);
    expect(rule(".hsList[hidden]")).toMatch(/display:\s*none/);
  });

  it("the active option is --accent with --on-accent text, sub line, problem line, glyph and hollow pill", () => {
    expect(rule('.hsOpt[aria-selected="true"]')).toMatch(/background:\s*var\(--accent\);\s*color:\s*var\(--on-accent\)/);
    expect(rule('.hsOpt[aria-selected="true"] .hsOptSub')).toMatch(/color:\s*var\(--on-accent\)/);
    expect(rule('.hsOpt[aria-selected="true"] :global(.problem-line)')).toMatch(/color:\s*var\(--on-accent\)/);
    expect(rule('.hsOpt[aria-selected="true"] :global(.problem-line)::before')).toMatch(/background:\s*currentColor/);
    const pill = rule('.hsOpt[aria-selected="true"] :global(.rv)');
    expect(pill).toMatch(/background:\s*transparent/);
    expect(pill).toMatch(/color:\s*var\(--on-accent\)/);
    expect(pill).toMatch(/border-color:\s*var\(--on-accent\)/);
  });
});
