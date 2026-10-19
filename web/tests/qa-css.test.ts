import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * /review/qa tables at 320 CSS px (§5.18, §10.4, §11.4 reflow). `overflow-wrap: anywhere` on every cell lets each cell's
 * min-content width fall to one character, so the auto table layout starves the wrapping columns (the endpoints' Returns
 * column was 68 px and off screen; key dates broke inside numbers). Ordinary cells wrap at spaces (break-word does not lower
 * min-content); only the request path may break anywhere, it wraps instead of staying on one line, and keeps at least 16ch.
 */
const css = readFileSync(join(__dirname, "..", "app/review/qa/qa.module.css"), "utf8");
const rule = (selector: string) => {
  const m = css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, selector).not.toBeNull();
  return m![1];
};

describe("qa.module.css: the two tables stay readable at 320 px", () => {
  it("table cells wrap at spaces (break-word), never anywhere", () => {
    expect(rule(".table td")).toMatch(/overflow-wrap:\s*break-word/);
    expect(rule(".table td")).not.toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("the endpoints table's request rule and its 40em one-line rule are gone; the only nowrap rule left is the column headers", () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).not.toMatch(/\.request\b/);
    expect(body).not.toMatch(/min-width:\s*40em/);
    const nowrap = [...body.matchAll(/([^{}]+)\{[^{}]*white-space:\s*nowrap/g)].map((m) => m[1].trim());
    expect(nowrap).toEqual([".table thead th"]);
  });

  it("mono code inside a table cell wraps at spaces too, so a long pattern never starves the other columns", () => {
    expect(rule(".table .mono")).toMatch(/overflow-wrap:\s*break-word/);
  });
});

describe("qa.module.css: the API reference (QA API reference, §5.18)", () => {
  it("each code block scrolls in its own region: overflow auto with a max-height; the pre keeps its lines (white-space: pre)", () => {
    expect(rule(".codeRegion")).toMatch(/overflow:\s*auto/);
    expect(rule(".codeRegion")).toMatch(/max-height:\s*28em/);
    expect(rule(".codeRegion")).toMatch(/min-width:\s*0/);
    expect(rule(".codeRegion:focus-visible")).toMatch(/outline:\s*2px solid var\(--focus\)/);
    expect(rule(".codeBlock")).toMatch(/white-space:\s*pre;/);
  });

  it("the summary keeps the native disclosure marker, is at least 24 px tall and shows focus; its path wraps anywhere", () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of body.matchAll(/\.summary(?![A-Za-z])[^{]*\{([^}]*)\}/g)) {
      const d = /display:\s*([a-z-]+)/.exec(m[1]);
      if (d) expect(d[1]).toBe("list-item");
    }
    expect(rule(".summary")).toMatch(/min-height:\s*24px/);
    expect(rule(".summary:focus-visible")).toMatch(/outline:\s*2px solid var\(--focus\)/);
    expect(rule(".summaryPath")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".summaryText")).toMatch(/display:\s*block/);
  });

  it("a long key-field path (extraction.ingredients[].ddinter.chosen[]) wraps inside its dt, so the page never scrolls sideways at 320 px", () => {
    expect(rule(".filters dt")).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("every class the reference uses is defined", () => {
    for (const c of ["endpoint", "summary", "summaryPath", "summaryText", "endpointBody", "codeHead", "codeLabel", "codeRegion", "codeBlock"]) {
      expect(css, c).toMatch(new RegExp(`\\.${c}\\s*\\{`));
    }
  });

  it("tokens only: no colour literal and no inline style", () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(body).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });
});
