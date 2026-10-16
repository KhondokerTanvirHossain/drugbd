import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("P1C in CI (§10.6, §11.4)", () => {
  it("the e2e stack knows a senior reviewer", () => {
    expect(read("deploy/docker-compose.ci.yml")).toContain("REVIEWERS: pharm@e2e.test:pharmacist,eng@e2e.test:engineer,senior@e2e.test:senior");
  });

  it("Lighthouse checks the senior pages against the §10.6 row, signed in as the e2e senior", () => {
    const c = JSON.parse(read("web/lighthouserc.senior.json")).ci;
    expect(c.collect.url).toEqual(["http://localhost:3000/review/pairs", "http://localhost:3000/review/substances/BDS-000003"]);
    expect(c.collect.puppeteerScript).toBe("./e2e/lhci-session-senior.cjs");
    const a = c.assert.assertions;
    expect(a["categories:accessibility"]).toEqual(["error", { minScore: 1 }]);
    expect(a["resource-summary:document:size"]).toEqual(["error", { maxNumericValue: 122880 }]);
    expect(a["resource-summary:script:size"]).toEqual(["error", { maxNumericValue: 184320 }]);
    expect(a["resource-summary:stylesheet:size"]).toEqual(["error", { maxNumericValue: 25600 }]);
    expect(a["resource-summary:font:size"]).toEqual(["error", { maxNumericValue: 92160 }]);
    expect(a["largest-contentful-paint"]).toEqual(["error", { maxNumericValue: 1500 }]);
    expect(read(".github/workflows/ci.yml")).toContain("npx lhci autorun --config=./lighthouserc.senior.json");
  });

  it("the P1C fixture is applied by the spec that needs it, never seeded (Learn's live numbers stay the pilot's)", () => {
    expect(() => read("web/e2e/seed/20-p1c.sql")).toThrow();
    expect(read("web/e2e/senior.spec.ts")).toContain("applyP1cFixture()");
  });
});
