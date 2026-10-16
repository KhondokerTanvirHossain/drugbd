import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { P1C_COPY } from "@/lib/copy";

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

  it("P1C: the senior invite template, the senior role token, and the pre-rollback dismissal check (§5.13, §12.5)", () => {
    const md = readFileSync(path, "utf8");
    expect(md).toContain(P1C_COPY.senior.invite);
    expect(md).toContain(":senior");
    expect(md).toContain("decision = 'dismiss'");
    expect(md).toContain("d.decided_at > bi.extracted_at");
  });

  it("P1C: a dismissal followed by a counted issue, or by a pharmacist's ok, is no longer listed (§12.5)", () => {
    const md = readFileSync(path, "utf8");
    const q = md.slice(md.indexOf("## Before rolling back below P1C"));
    // the later decision is compared on (decided_at, id), the order ApprovalRule uses
    expect(q).toContain("AND NOT EXISTS (");
    expect(q).toContain("(l.decided_at, l.id) > (d.decided_at, d.id)");
    // an issue from anyone clears it; an ok clears it only from a pharmacist (a pre-P1C ApprovalRule ignores a senior's ok)
    expect(q).toContain("l.decision = 'issue' OR (l.decision = 'ok' AND l.reviewer_role = 'pharmacist')");
    expect(q).toContain("a pharmacist re-approves, or anyone re-reports, each listed record");
    expect(q).not.toContain("a senior re-approves");
  });

  it("P1C: the pre-rollback check runs as the container's database user, read-only, and fails loudly (§12.4, §12.5)", () => {
    const md = readFileSync(path, "utf8");
    const q = md.slice(md.indexOf("## Before rolling back below P1C"));
    // DB_USER lives only in deploy/.env (read by compose, never exported to the host shell); an empty -U would fail with no stdout, read as "prints nothing"
    expect(q).not.toContain("$DB_USER");
    expect(q).toContain(`docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d bddrug -At' <<'SQL'`);
    expect(q).toContain("ON_ERROR_STOP=1");
  });

  it("the README links to it and recreates services with --no-deps, as the runbook does", () => {
    const readme = readFileSync(repo("README.md"), "utf8");
    expect(readme).toContain("docs/runbooks/reviewer-invite.md");
    expect(readme).not.toMatch(/docker-compose up -d (api |)web\b/);
    expect(readme).toContain("docker-compose up -d --no-deps web");
    expect(readme).toContain("docker-compose up -d --no-deps api web");
  });
});

describe("partner-requests runbook (§2.2, §6.9)", () => {
  const path = repo("docs/runbooks/partner-requests.md");
  it("reads the requests with a read-only query on the host, and never holds an email address", () => {
    expect(existsSync(path)).toBe(true);
    const md = readFileSync(path, "utf8");
    expect(md).toContain("default_transaction_read_only=on");
    expect(md).toContain("target_type = 'other' AND target_id = 'partner-access'");
    expect(md).toContain("reporter_email");
    expect(md).toContain("/review/flags");
    expect(md).not.toMatch(/[A-Za-z0-9._%+-]+@(?!example\.com\b)[A-Za-z0-9.-]+\.[a-z]{2,}/);
  });
  it("the README links to it", () => {
    expect(readFileSync(repo("README.md"), "utf8")).toContain("docs/runbooks/partner-requests.md");
  });
});
