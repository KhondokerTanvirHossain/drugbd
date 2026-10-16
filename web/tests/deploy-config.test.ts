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
  it("caps the web container's json-file logs, so 429 log lines cannot grow the shared host's disk without limit", () => {
    expect(webService()).toContain('\n    logging: {driver: json-file, options: {max-size: "10m", max-file: "5"}}\n');
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

describe("CI-only compose override (§11.4)", () => {
  it("builds api and web from source, runs web in e2e mode on localhost, and makes edge a local network", () => {
    const ci = repo("deploy/docker-compose.ci.yml");
    expect(ci).toContain('INTELLIDRUGS_E2E: "1"');
    expect(ci).toContain("SITE_HOST: localhost:3000");
    expect(ci).toContain("context: ../web");
    expect(ci).toContain("context: ../api");
    expect(ci).toMatch(/edge: \{external: false/);
    expect(ci).not.toContain("drugdb.eliooo.org");
  });
  it("runs as its own compose project, so it never touches the bddrug containers or the bddrug_dbdata volume", () => {
    expect(repo("deploy/docker-compose.ci.yml")).toMatch(/^name: bddrug-ci$/m);
  });
  it("CI's GITHUB_TOKEN is read-only for every job (npm install scripts, Docker builds and lhci run with it)", () => {
    const yml = repo(".github/workflows/ci.yml");
    expect(yml).toMatch(/^permissions: \{contents: read\}$/m);
    expect(yml.match(/^\s*permissions:/gm)).toHaveLength(1);
  });
  it("the e2e job runs Playwright and Lighthouse CI against both compose files", () => {
    const yml = repo(".github/workflows/ci.yml");
    expect(yml).toContain("-f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml");
    expect(yml).toContain("npx playwright test");
    expect(yml).toContain("npx lhci autorun");
  });
  it("e2e renders the landing lookup card with the production hero product (D26)", () => {
    const ci = repo("deploy/docker-compose.ci.yml");
    expect(ci.slice(ci.indexOf("\n  web:"), ci.indexOf("\n  seed:"))).toContain("HERO_CONCEPT_ID: 186-0030-006--napa\n");
  });
});
