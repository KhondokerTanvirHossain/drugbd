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
