import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

describe("reviewer-invite runbook (§5.13)", () => {
  const path = repo("docs/runbooks/reviewer-invite.md");

  it("holds the fixed template, word for word", () => {
    expect(existsSync(path)).toBe(true);
    const md = readFileSync(path, "utf8");
    expect(md).toContain("You're invited to review medicines on IntelliDrugs");
    expect(md).toContain("Role: {Pharmacist|Engineer}. Batch {id}, {n} records. Sign in at drugdb.eliooo.org with this Google account.");
  });

  it("gives the exact host steps and never an email address", () => {
    const md = readFileSync(path, "utf8");
    expect(md).toContain("cd ~/drugdb/deploy && docker-compose up -d --no-deps web");
    expect(md).not.toMatch(/up -d web\b/);
    expect(md).not.toMatch(/[A-Za-z0-9._%+-]+@(?!example\.com\b)[A-Za-z0-9.-]+\.[a-z]{2,}/);
  });

  it("the README links to it and recreates services with --no-deps, as the runbook does", () => {
    const readme = readFileSync(repo("README.md"), "utf8");
    expect(readme).toContain("docs/runbooks/reviewer-invite.md");
    expect(readme).not.toMatch(/docker-compose up -d (api |)web\b/);
    expect(readme).toContain("docker-compose up -d --no-deps web");
    expect(readme).toContain("docker-compose up -d --no-deps api web");
  });
});
