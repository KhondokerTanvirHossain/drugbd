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
