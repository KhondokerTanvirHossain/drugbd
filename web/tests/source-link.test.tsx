import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SourceLink, { SourceOf } from "@/components/ui/SourceLink";

describe("SourceLink (§3.4, §5.6.6, §11.1)", () => {
  it("is a plain link that opens in a new tab, with the sr-only notice", () => {
    expect(r(<SourceLink url="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=161" label="RxNav" />)).toBe(
      '<a class="src-link" href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161" target="_blank" rel="noopener noreferrer">'
      + 'RxNav<span class="sr-only"> (opens in a new tab)</span></a>');
  });
  it("adds the Dhaka date only when a fetch time is stored", () => {
    expect(r(<SourceLink url="https://x.test/" label="DDInter 2.0" fetchedAt="2026-10-11T19:00:00Z" />)).toMatch(/<\/a> fetched on 12\/10\/2026$/);
    expect(r(<SourceLink url="https://x.test/" label="DDInter 2.0" fetchedAt={null} />)).not.toContain("fetched on");
  });
  it("renders nothing without a URL, and never a button", () => {
    expect(r(<SourceLink url={null} label="RxNav" fetchedAt="2026-10-11T19:00:00Z" />)).toBe("");
    expect(r(<SourceOf source={null} />)).toBe("");
    expect(r(<SourceOf source={{ url: "https://x.test/", label: "x", fetchedAt: null }} />)).not.toMatch(/btn|<button/);
  });
});

describe("SourceLink is a 24 × 24 px target (§10.4, WCAG 2.5.8)", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  it("its component stylesheet gives .src-link a 24 px line, inline-block so it stays in its line of text (never flex)", () => {
    const rule = /(?:^|\})\s*\.src-link\s*\{([^}]*)\}/.exec(read("components/ui/SourceLink.css").replace(/\/\*[\s\S]*?\*\//g, ""));
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/display:\s*inline-block/);
    expect(rule![1]).toMatch(/min-height:\s*24px/);
    expect(rule![1]).toMatch(/line-height:\s*24px/);
  });
  it("SourceLink imports that stylesheet, and tokens.css stays without a .src-link rule", () => {
    expect(read("components/ui/SourceLink.tsx")).toMatch(/^import "\.\/SourceLink\.css";$/m);
    expect(read("styles/tokens.css")).not.toContain(".src-link");
  });
});
