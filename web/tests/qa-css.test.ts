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

  it("the request path wraps, may break anywhere and keeps a 16ch minimum, beating the cell rule's specificity", () => {
    const r = rule(".table .request");
    expect(r).toMatch(/white-space:\s*normal/);
    expect(r).toMatch(/overflow-wrap:\s*anywhere/);
    expect(r).toMatch(/min-width:\s*16ch/);
  });

  it("nothing in the tables is held on one line except the column headers", () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const nowrap = [...body.matchAll(/([^{}]+)\{[^}]*white-space:\s*nowrap/g)].map((m) => m[1].trim());
    expect(nowrap).toEqual([".table thead th"]);
  });
});
