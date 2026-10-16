import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Result = { auditId: string; auditProperty?: string; passed: boolean; url: string };
const { getAllAssertionResults } = require("@lhci/utils/src/assertions.js") as {
  getAllAssertionResults: (options: object, lhrs: object[]) => Result[];
};
type Assertions = Record<string, [string, Record<string, unknown>]>;
const config = JSON.parse(readFileSync(join(__dirname, "..", "lighthouserc.public.json"), "utf8")) as {
  ci: { collect: { url: string[]; numberOfRuns: number; settings: { blockedUrlPatterns: string[] } };
        assert: { assertMatrix: { matchingUrlPattern: string; assertions: Assertions }[] } };
};
const matrix = config.ci.assert.assertMatrix;

const COMMON = {
  "server-response-time": 600,
  "resource-summary:stylesheet:size": 20480,
  "resource-summary:font:size": 92160,
  "largest-contentful-paint": 2500,
} as const;
/** §10.6, gzip: `/` HTML 30 KB, JS 130 KB; search, product and substance HTML 50 KB, JS 130 KB; `/check` HTML 50 KB, JS 145 KB. */
const GROUPS = [
  { url: "http://localhost:3000/", numeric: { ...COMMON, "resource-summary:document:size": 30720, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/search?q=paracetamol", numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/products/186-0030-006--napa", numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/substances/BDS-000001", numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/check?ids=185-0138-012--g-warfarin&ids=076-0028-006--aspirin&ids=127-0263-018--domperidone",
    numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 148480 } },
];

function lhr(url: string, numeric: Record<string, number>, factor: number) {
  const v = (k: string) => Math.round(numeric[k] * factor);
  return {
    finalUrl: url,
    categories: { accessibility: { score: 1 }, performance: { score: 1 } },
    audits: {
      "server-response-time": { numericValue: v("server-response-time") },
      "largest-contentful-paint": { numericValue: v("largest-contentful-paint") },
      "resource-summary": { details: { items: (["document", "script", "stylesheet", "font"] as const)
        .map((t) => ({ resourceType: t, size: v(`resource-summary:${t}:size`) })) } },
    },
  };
}
const failedKeys = (runs: object[]) => getAllAssertionResults({ assertMatrix: matrix }, runs).filter((r) => !r.passed)
  .map((r) => (r.auditProperty ? `${r.auditId}:${r.auditProperty.replace(".", ":")}` : r.auditId)).sort();

describe("the public Lighthouse budget (§1.4 S5, §10.6, median of 3 runs)", () => {
  it("collects the five S5 pages three times each, with Turnstile blocked", () => {
    expect(config.ci.collect.url).toEqual(GROUPS.map((g) => g.url));
    expect(config.ci.collect.numberOfRuns).toBe(3);
    expect(config.ci.collect.settings.blockedUrlPatterns).toEqual(["https://challenges.cloudflare.com/*"]);
  });

  it("each page matches exactly one matrix entry, which asserts its §10.6 budgets on the median and S5's scores", () => {
    for (const g of GROUPS) {
      const entries = matrix.filter((m) => new RegExp(m.matchingUrlPattern).test(g.url));
      expect(entries, g.url).toHaveLength(1);
      const a = entries[0].assertions;
      for (const [key, budget] of Object.entries(g.numeric))
        expect(a[key], `${g.url} ${key}`).toEqual(["error", { maxNumericValue: budget, aggregationMethod: "median" }]);
      expect(a["categories:accessibility"]).toEqual(["error", { minScore: 1, aggregationMethod: "median" }]);
      // Global Constraints, S5 house rule (P1B, P3): the score is a warning; every byte budget and accessibility fail the run
      expect(a["categories:performance"]).toEqual(["warn", { minScore: 0.9, aggregationMethod: "median" }]);
    }
  });

  it("fails every numeric budget of a page when two of three runs are over it", () => {
    for (const g of GROUPS)
      expect(failedKeys([lhr(g.url, g.numeric, 0.5), lhr(g.url, g.numeric, 1.2), lhr(g.url, g.numeric, 1.3)]), g.url)
        .toEqual(Object.keys(g.numeric).sort());
  });

  it("passes when one noisy run of three is over budget", () => {
    for (const g of GROUPS)
      expect(failedKeys([lhr(g.url, g.numeric, 0.5), lhr(g.url, g.numeric, 0.9), lhr(g.url, g.numeric, 1.5)]), g.url).toEqual([]);
  });

  it("the landing page's 30 KB HTML budget is its own: 40 KB fails / and passes a product page", () => {
    const at = (url: string, bytes: number) => ({ ...lhr(url, GROUPS[0].numeric, 0.5),
      audits: { ...lhr(url, GROUPS[0].numeric, 0.5).audits, "resource-summary": { details: { items: [{ resourceType: "document", size: bytes }] } } } });
    expect(failedKeys([at(GROUPS[0].url, 40960), at(GROUPS[0].url, 40960), at(GROUPS[0].url, 40960)])).toContain("resource-summary:document:size");
    expect(failedKeys([at(GROUPS[2].url, 40960), at(GROUPS[2].url, 40960), at(GROUPS[2].url, 40960)])).not.toContain("resource-summary:document:size");
  });
});
