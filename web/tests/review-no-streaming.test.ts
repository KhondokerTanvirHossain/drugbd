import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REVIEW = join(__dirname, "..", "app", "review");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

describe("a reviewer record reads without JavaScript (§4.4, §5.8.6)", () => {
  it("no route under app/review has a loading.tsx", () => {
    // A loading.tsx makes Next stream the page: the finished desk then sits in React's hidden Suspense container
    // (<div hidden id="S:0">), which only a script reveals, so with scripting off the reviewer sees a skeleton forever.
    expect(existsSync(REVIEW)).toBe(true);
    expect(walk(REVIEW).filter((f) => /(^|[\\/])loading\.(tsx|jsx|ts|js)$/.test(f))).toEqual([]);
  });
});
