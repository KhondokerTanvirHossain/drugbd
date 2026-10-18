import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* QA portal in CI (§10.6, §11.4): the e2e stack has a qa account, and Lighthouse measures /review/qa with 50 keys. */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("QA portal in CI (§10.6, §11.4)", () => {
  it("the e2e stack lists a qa account on REVIEWERS, and the e2e sessions can sign in as it", () => {
    expect(read("deploy/docker-compose.ci.yml")).toMatch(/REVIEWERS: [^\n]*\bqa@e2e\.test:qa\b/);
    expect(read("web/e2e/session.ts")).toContain('qa: "qa@e2e.test"');
  });

  it("Lighthouse checks /review/qa against the §10.6 row, signed in as the e2e QA account, after the 50-key seed", () => {
    const c = JSON.parse(read("web/lighthouserc.qa.json")).ci;
    expect(c.collect.url).toEqual(["http://localhost:3000/review/qa"]);
    expect(c.collect.puppeteerScript).toBe("./e2e/lhci-session-qa.cjs");
    expect(c.collect.settings.blockedUrlPatterns).toEqual(["https://challenges.cloudflare.com/*"]);   // the Turnstile script is excluded
    const a = c.assert.assertions;
    expect(a["categories:accessibility"]).toEqual(["error", { minScore: 1 }]);
    expect(a["resource-summary:document:size"]).toEqual(["error", { maxNumericValue: 51200 }]);
    expect(a["resource-summary:script:size"]).toEqual(["error", { maxNumericValue: 163840 }]);
    expect(a["resource-summary:stylesheet:size"]).toEqual(["error", { maxNumericValue: 25600 }]);
    expect(a["largest-contentful-paint"]).toEqual(["error", { maxNumericValue: 1500 }]);
    const ci = read(".github/workflows/ci.yml");
    const seed = ci.indexOf("web/e2e/lhci-qa.sql"), run = ci.indexOf("npx lhci autorun --config=./lighthouserc.qa.json");
    expect(seed).toBeGreaterThan(ci.indexOf("npx playwright test"));
    expect(run).toBeGreaterThan(seed);
    expect(read("web/e2e/lhci-qa.sql")).toContain("generate_series(1, 50)");
  });
});
