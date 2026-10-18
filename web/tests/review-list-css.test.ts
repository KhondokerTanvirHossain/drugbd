import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CSS-module class lookups resolve to undefined when a selector is missing, so nothing else catches an unstyled list.
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const css = read("app/review/review.module.css");
const defined = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
const used = (file: string) => [...new Set([...read(file).matchAll(/styles\.([A-Za-z_]\w*)/g)].map((m) => m[1]))];

describe("review.module.css covers the list and flag components", () => {
  for (const file of ["components/review/BatchList.tsx", "components/review/FlagSection.tsx"]) {
    it(`defines every styles.X used by ${file}`, () => {
      const names = used(file);
      expect(names.length).toBeGreaterThan(0);
      expect(names.filter((n) => !defined.has(n))).toEqual([]);
    });
  }

  it("defines the brief's list-row and flag-item selectors", () => {
    for (const n of ["list", "row", "rowMeta", "flag", "flagHead", "flagWhen", "paging", "section"]) {
      expect(css).toMatch(new RegExp(`^\\.${n}\\s*\\{`, "m"));
    }
  });

  it("shows the flag message with its line breaks (§5.16 .raw pre-wrap)", () => {
    expect(css).toMatch(/\.flag\s+:global\(\.raw\)\s*\{[^}]*white-space:\s*pre-wrap/);
  });
});

describe("the reviewer toolbar reflows at 320 CSS px (§5.18, §10.4)", () => {
  const narrow = (bp: number) => {
    const at = css.indexOf(`@media (max-width: ${bp}px)`);
    expect(at, `@media (max-width: ${bp}px)`).toBeGreaterThanOrEqual(0);
    let depth = 0;
    for (let i = css.indexOf("{", at); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) return css.slice(at, i + 1);
    }
    return "";
  };

  it("the wordmark keeps its width and the right cluster may shrink", () => {
    expect(css).toMatch(/^\.wordmark\s*\{[^}]*flex-shrink:\s*0/m);
    expect(css).toMatch(/^\.toolbarRight\s*\{[^}]*min-width:\s*0/m);
  });

  it("under 420 px: tighter gaps, \"QA tools\" and the role badge may wrap onto two lines", () => {
    const m = narrow(419);
    expect(m).toMatch(/\.toolbar\s*\{[^}]*gap:\s*var\(--s2\)/);
    expect(m).toMatch(/\.toolbarRight\s*\{[^}]*gap:\s*var\(--s2\)/);
    expect(m).toMatch(/\.toolbarLink\s*\{[^}]*white-space:\s*normal[^}]*\}/);
    expect(m).toMatch(/\.toolbarRight\s+:global\(\.role-badge\)\s*\{[^}]*height:\s*auto[^}]*min-height:\s*24px/);
  });

  it("under 360 px: the wordmark's \"Review\" is visually hidden but stays in the link's name", () => {
    const m = narrow(359);
    expect(m).toMatch(/\.wordmark\s+:global\(\.wordmark-sub\)\s*\{[^}]*position:\s*absolute[^}]*width:\s*1px[^}]*overflow:\s*hidden/);
    expect(m).not.toMatch(/display:\s*none/);
  });
});
