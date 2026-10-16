import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §10.4 / §11.4: no two-dimensional scrolling at 320 CSS px. q may be up to 100 characters inside
// 'Results for "{q}"' and 'No medicines match "{q}"', and names can be one long word, so the
// heading and hit text must be able to break inside a word.
const css = readFileSync(join(__dirname, "..", "components/public/search.module.css"), "utf8");
const rule = (sel: string) => {
  const m = css.match(new RegExp(`^\\.${sel}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, `.${sel} rule`).not.toBeNull();
  return m![1];
};

describe("search.module.css reflows at 320 px (§10.4, WCAG 1.4.10)", () => {
  it(".h1 can shrink inside the flex header and break inside q", () => {
    const body = rule("h1");
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  for (const sel of ["s-res-name", "s-hit", "s-res-meta"]) {
    it(`.${sel} breaks a long word`, () => {
      expect(rule(sel)).toMatch(/overflow-wrap:\s*anywhere/);
    });
  }
});
