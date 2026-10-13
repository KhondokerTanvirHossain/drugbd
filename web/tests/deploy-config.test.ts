import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const webService = () => {
  const c = repo("deploy/docker-compose.yml");
  return c.slice(c.indexOf("\n  web:"), c.indexOf("\n  etl:"));
};

describe("deploy configuration (§12.4)", () => {
  it("passes SITE_HOST and HERO_CONCEPT_ID to the web container", () => {
    expect(webService()).toContain("SITE_HOST: ${SITE_HOST}\n");
    expect(webService()).toContain("HERO_CONCEPT_ID: ${HERO_CONCEPT_ID:-}\n");
  });
  it("deploy/docker-compose.yml never sets INTELLIDRUGS_E2E (§11.4)", () => {
    expect(repo("deploy/docker-compose.yml")).not.toContain("INTELLIDRUGS_E2E");
  });
  it(".env.example lists both new variables with their production values", () => {
    const env = repo("deploy/.env.example");
    expect(env).toMatch(/^SITE_HOST=drugdb\.eliooo\.org$/m);
    expect(env).toMatch(/^HERO_CONCEPT_ID=186-0030-006--napa$/m);
  });
  it("the web image checks /healthz every 30 s", () => {
    expect(repo("web/Dockerfile")).toContain("HEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1");
  });
  it("deploy requires SITE_HOST, smoke-checks /healthz, and copies only the production compose file", () => {
    const d = repo(".github/workflows/deploy.yml");
    expect(d).toContain(`grep -q '^SITE_HOST=..*' .env`);
    expect(d).toContain('"$PUBLIC_URL/healthz"');
    expect(d).not.toContain('"$PUBLIC_URL/batches"');
    expect(d).toContain('source: "deploy/docker-compose.yml,db/migrations,batches"');
  });
});
