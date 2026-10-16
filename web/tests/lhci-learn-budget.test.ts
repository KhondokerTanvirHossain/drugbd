import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Result = { auditId: string; auditProperty?: string; passed: boolean; level: string };
const { getAllAssertionResults } = require("@lhci/utils/src/assertions.js") as {
  getAllAssertionResults: (options: object, lhrs: object[]) => Result[];
};
const config = JSON.parse(readFileSync(join(__dirname, "..", "lighthouserc.learn.json"), "utf8")) as {
  ci: { assert: { assertions: Record<string, [string, Record<string, unknown>]> } };
};
const assertions = config.ci.assert.assertions;
const URL = "http://localhost:3000/learn/start";

// The numeric budgets of §10.6 for Learn, keyed as lhci reports them.
const NUMERIC = {
  "server-response-time": 600,
  "resource-summary:document:size": 61440,
  "resource-summary:script:size": 143360,
  "resource-summary:stylesheet:size": 25600,
  "resource-summary:font:size": 92160,
  "largest-contentful-paint": 2800,
} as const;

/** One synthetic Lighthouse run in which every numeric metric is `factor` times its budget. */
function lhr(factor: number) {
  const v = (k: keyof typeof NUMERIC) => Math.round(NUMERIC[k] * factor);
  return {
    finalUrl: URL,
    categories: { accessibility: { score: 1 }, performance: { score: 1 } },
    audits: {
      "server-response-time": { numericValue: v("server-response-time") },
      "largest-contentful-paint": { numericValue: v("largest-contentful-paint") },
      "resource-summary": {
        details: {
          items: (["document", "script", "stylesheet", "font"] as const).map((t) => ({
            resourceType: t,
            size: v(`resource-summary:${t}:size`),
          })),
        },
      },
    },
  };
}

const failedKeys = (runs: object[]) =>
  getAllAssertionResults({ assertions }, runs)
    .filter((r) => !r.passed)
    .map((r) => (r.auditProperty ? `${r.auditId}:${r.auditProperty.replace(".", ":")}` : r.auditId))
    .sort();

describe("the Learn Lighthouse budget (§10.6, median of 3 runs)", () => {
  it("asserts every numeric budget on the median run value", () => {
    for (const [key, budget] of Object.entries(NUMERIC)) {
      expect(assertions[key], key).toEqual(["error", { maxNumericValue: budget, aggregationMethod: "median" }]);
    }
  });

  it("fails every numeric budget when two of three runs are over it, though one run is under", () => {
    expect(failedKeys([lhr(0.5), lhr(1.2), lhr(1.3)])).toEqual(Object.keys(NUMERIC).sort());
  });

  it("passes when one noisy run of three is over budget", () => {
    expect(failedKeys([lhr(0.5), lhr(0.9), lhr(1.5)])).toEqual([]);
  });
});
