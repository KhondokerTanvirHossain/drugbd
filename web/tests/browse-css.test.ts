import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §6.11.2 the letter bar's current choice must show whether it is a link or, with no medicine, a span; and in forced
// colours, where backgrounds and box shadows are dropped (tokens.css maps .filter[aria-current] the same way).
const css = readFileSync(join(__dirname, "..", "components/public/search.module.css"), "utf8");
const rule = (block: string, selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = block.match(new RegExp(`^\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, selector).not.toBeNull();
  return m![1];
};

describe("search.module.css: the letter bar (§6.11.2)", () => {
  it("marks the current choice that has no medicine with a ring", () => {
    expect(rule(css, '.s-letters span[aria-current="page"]')).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--accent\)/);
  });

  it("in forced colours, outlines the links and marks the current choice with Highlight or a border", () => {
    const at = css.indexOf("@media (forced-colors: active)");
    expect(at).toBeGreaterThan(-1);
    const forced = css.slice(at);
    expect(rule(forced, ".s-letters a")).toMatch(/border:\s*1px solid LinkText/);
    const current = rule(forced, '.s-letters a[aria-current="page"]');
    for (const p of [/forced-color-adjust:\s*none/, /background:\s*Highlight/, /color:\s*HighlightText/]) expect(current).toMatch(p);
    expect(rule(forced, '.s-letters span[aria-current="page"]')).toMatch(/border:\s*2px solid CanvasText/);
  });
});
