// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NEW_COPY, NEW_COPY_ROWS, QA_COPY } from "@/lib/copy";

/*
 * §10.6 (QA API reference): the reference adds no client JavaScript. lib/copy.ts is imported by islands, so its reference
 * row is empty wherever `window` exists (Next compiles `typeof window` to "object" in client bundles and the minifier drops
 * the strings); server code and the node tests read the full row (qa-copy.test.ts).
 */
describe("the QA API reference copy in a browser", () => {
  it("is an empty row, still the same object in NEW_COPY and QA_COPY", () => {
    expect(QA_COPY.reference).toEqual({});
    expect(NEW_COPY[NEW_COPY_ROWS.qaReference]).toBe(QA_COPY.reference);
    expect(Object.keys(QA_COPY.page)).toContain("copied");   // the islands' own rows are untouched
  });
});
