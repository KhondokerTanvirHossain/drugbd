# IntelliDrugs P0 "Safety prerequisites" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live pilot safe to review before any new UI ships: the ETL checks each product against the DDInter entry for its own route, stores complete pair lists, snapshots every re-stamp, keeps removed items that have history; the API hides batch evidence and decision history behind the internal token and refuses every unsafe decision (stale page, another reviewer's decision, removed record, failed or missing check, open issue, already approved, duplicate engineer check) with idempotent retries and an append-only audit trail; the current web app keeps working against that API; and the pilot is re-run on the shared host.

**Architecture:** One additive migration (V6) adds `ops.item_snapshot` and `ops.audit_event`, both append-only by trigger. The Python ETL (`bddrug_etl`) gains a route rule twin of the API's `RouteRule`, a complete `interact-with` read, pair-list reconciliation, and a snapshot writer called by every code path that stamps `extracted_at`, sharing one `run_id` per invocation. The Java API (hexagonal: `domain` / `application` / `adapter` / `presentation`) gains two pure domain rules (`ApprovalRule.displayStatus`, `DecisionGuard`) used by the R2DBC review adapter inside the existing decision transaction. The Next.js 15 app router pages read public data with public scope only, and the old `/batches` pages become reviewer-only and echo the new version and request fields.

**Tech Stack:** Python 3.12, psycopg 3.2.3, httpx 0.27.2, pytest 8.3.4, respx 0.21.1, testcontainers 4.8.2 · Java 21, Spring Boot 3.4.2 (WebFlux, R2DBC), JUnit 5, Testcontainers 1.20.4, Flyway 10.20.1 (tests only) · Next.js 15.5.27, React 19.0.8, TypeScript 5.7.3, vitest 2.1.8 · PostgreSQL 16 · GitHub Actions, `docker-compose` on the shared EC2 host.

**Spec:** `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md` — this plan implements §7.1, §7.2, §7.6, §8 (8.1, 8.2, 8.3), the phase-0 web adjustments in §12.1, and their §11.3 tests (§12.2, plan "P0 Safety prerequisites"). Read §1.5–§1.7, §2.2, §5.2, §5.15, §7, §8, §9, §11.3 and §12 before starting.

## Global Constraints

Copied from the spec; every task's requirements include these.

- "Every change keeps the `ApiResponse` envelope and the error mapping in `ApiExceptionHandler`. New errors use the existing codes (`INVALID_QUERY`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`) with a `field`." (§7)
- "The migration is purely additive. Existing rows are untouched." The PR must "add the `db/migrations.lock` line; explain the change under the four headings `database.md` requires; update `docs/design/database.md` and the data model page; tag `db-schema-v1.1`." (§7.6)
- "**Retention (Decision)**: audit rows and snapshots are kept indefinitely. Both are append-only and small." (§7.6)
- "RouteRule is unchanged. There is **no** fallback to systemic when the exact entry exists but has no pair. That fallback would bring back the "false alerts" risk the design document calls out." (§8.2)
- "The route notes never match `DDInter text not found for …`, never contain `"; "`, and set stage status `warn`." "Python's `None` is never printed." (§8.1)
- "**Decision: public routes always read with public scope.**" (§2.2)
- "Audit rows hold `actor_email` (team-only, like `review_decision`), `actor_role` and `request_id`. There are no IP addresses and no free text from forms." (§5.15)
- "Emails: stored for the team only, in `review_decision`, `flag` and `audit_event`; never in public responses, never in logs" (§9.7)
- "`INTERNAL_API_TOKEN` stays at 32 or more characters on both sides. The web falls back to public scope when it is missing (existing)." (§9.1)
- "The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted." "The `drugdb.eliooo.org` Caddy block is unchanged" (§12.4). Non-goal: "Changing anything on the shared EC2 host outside the `bddrug` compose project and its existing Caddy block." (§1.3)
- "Manual commands on the host (adding a reviewer §5.13, the re-run §8.3, rollback §12.5) run from `~/drugdb/deploy` with the `docker-compose` binary; the compose file sets the project name `bddrug`." (§12.4)
- "These stay unchanged, to avoid recreating containers or volumes on the shared host: the compose project `bddrug`; image names, the volume `dbdata`, the Caddy alias `bddrug-web`; the database name; the Java package and the ETL package." (§9.8)
- "**Decision: no runtime feature flags.** … P0 and P1A are the exceptions that may merge to `main` on their own, because each is a complete release" (§12.3)
- New phase-0 copy, verbatim: "Only pharmacists and engineers can see batches." (§12.1)
- "Dates: `DD/MM/YYYY`, 24-hour clock, zone always named. Dhaka is UTC+6 with no daylight saving." (spec conventions) This applies to new surfaces; the phase-0 `/batches` pages keep their existing `formatUtc` output (`YYYY-MM-DD HH:mm UTC`) and raw `runAt` text until P1B deletes them, and Task 11's tests pin that existing output.
- Healthcare data (CLAUDE.md): never log PHI or reviewer emails; every decision is audited.
- Commits: `type(scope): description`, scope one of `etl`, `api`, `web`, `db`, `deploy`; every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

Five inputs the spec implies but its listed tests do not exercise. Each one has its test in the owning task.

1. **Two sends of one decision race each other** (double click, or a retry while the first request is still in flight): exactly one `review_decision` row and one `decision` audit row; one caller gets 201, the other 200 `replayed:true`. Pinned in Task 8b (`concurrentSendsOfOneRequestIdWriteOneDecision`).
2. **DDInter's `interact-with` returns the right row count but repeats a row** (paging overlap) while silently dropping another partner: the list must count as incomplete, never as "no interaction listed". Pinned in Task 2 (`test_interact_with_is_incomplete_when_a_repeated_row_makes_up_the_count`).
3. **A snapshot payload with a `NUMERIC` strength (`0.50`) and a Bengali company name**: must serialise (no `Decimal` crash that would abort the stage) and round-trip unchanged. Pinned in Task 5 (`test_payload_holds_the_fields_the_api_diff_reads`).
4. **An item removed from the batch file, then put back in a later run**: the run must not fail on the snapshot foreign key; the item is stamped again with a `rerun` snapshot and loses the "removed" note. Pinned in Task 5 (`test_removed_item_readded_to_the_file_is_restamped_with_a_rerun_snapshot`).
5. **An anonymous visitor opens `/batches/<unknown id>`**: gets the 200 reviewers-only page, never a 404 that would reveal which batch ids exist, and no API call is made. Pinned in Task 11 (`an anonymous visitor gets the gate even for an unknown batch, with no API call`).

---

## Before you start

- [ ] Create the phase branch from `main` with the approved spec and boards:

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
git fetch origin
git switch main && git pull --ff-only
git switch -c phase-0
git merge --no-ff design/directions -m "docs: bring in the IntelliDrugs UX spec and boards

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] Commit this plan on the phase branch. The three IntelliDrugs plans are untracked files in the working tree (not part of `design/directions`), so the merge does not bring them in; the P0 pull request and the P1B plan cite this file, so it must be in the repository:

```bash
git add docs/superpowers/plans/2026-10-12-intellidrugs-p0-safety.md
git commit -m "docs(db): IntelliDrugs P0 safety implementation plan

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] Amend the phase-0 exit criterion for S7 in the spec before any code (§12.2: a plan may not change a Decision without amending the spec first). S7 says the eye drop's checker result with G Warfarin "names `DDInter352`", but the checker names the chosen entry only through `products[].substances[].ddinter`, which ships with §7.4 in P2; today's `CheckResult.SubstanceCoverage(bdsId, name, coverage)` has no such field. In `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md`, §12.1, phase 0 "Exit criteria" cell, replace

```
S7 holds on production;
```

with

```
S7 on production in phase 0: stage note OK, no alert, product page names `DDInter352`. The checker's own `products[].substances[].ddinter` naming is verified in P2 (§7.4);
```

and commit:

```bash
git add docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md
git commit -m "docs(etl): scope the phase-0 S7 exit criterion to what P0 ships

The checker names the chosen DDInter entry only once P2 adds products[].substances[].ddinter
(spec 7.4). Phase 0 verifies the stage note, the absent alert and the product page's entry.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Task 14 Step 7 and Step 8 verify this amended criterion on production.

- [ ] Tooling (Docker must be running; every integration test uses Testcontainers):

```bash
python3.12 -m venv .venv && . .venv/bin/activate && pip install -e './etl[test]'
(cd web && npm ci)
(cd api && ./gradlew --version)
```

- [ ] Baseline: all three suites green before any change.

```bash
python -m pytest etl/tests -q
(cd api && ./gradlew test --no-daemon)
(cd web && API_URL=http://api:8080 npm test)
```

Expected: every suite passes. If one does not, stop and report it; do not start Task 1 on a red baseline.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `db/migrations/V6__item_snapshot_and_audit.sql` (new) | `ops.item_snapshot`, `ops.audit_event`, decision `request_id` unique index, append-only triggers | 1 |
| `db/migrations.lock` | V6 checksum line; header names `db-schema-v1.1` | 1 |
| `docs/design/database.md`, `docs/artifacts/2026-10-12-data-model.html`, `README.md` | Schema docs for v1.1; re-run procedure | 1, 12 |
| `etl/tests/test_schema_v6.py` (new) | V6 constraints, FK, unique index | 1 |
| `api/src/test/java/com/niramoy/bddrug/AuditAppendOnlyIntegrationTest.java` (new) | UPDATE / DELETE / TRUNCATE refused on both tables | 1 |
| `etl/src/bddrug_etl/ddinter/client.py` | `InteractWithRow`, `InteractWithList`, `interact_with()` with completeness | 2 |
| `etl/src/bddrug_etl/stages/ddinter.py` | `choose()`, route notes, route-scoped `text_missing` and `pair_count`, evidence keys; pair-list reconciliation and the incomplete-list failure | 3, 4 |
| `etl/src/bddrug_etl/load/snapshots.py` (new) | `build_payload()`, `write_snapshots()` | 5 |
| `etl/src/bddrug_etl/load/batches.py` | snapshots on every stamp, `run_id`, removed-item rule | 5 |
| `etl/src/bddrug_etl/jobs/run_pipeline.py` | one `run_id` per invocation, passed to every stamp | 5 |
| `api/.../domain/ApprovalRule.java` | `displayStatus()` (§5.2) | 6 |
| `api/.../domain/DecisionGuard.java` (new) | §7.2 steps 2–8 as a pure function | 6 |
| `api/.../presentation/BatchController.java`, `BatchReportController.java`, `ReviewController.java` | A1 and A2: token on batch reads and history | 7, 8a |
| `api/.../domain/BatchItem.java`, `adapter/persistence/R2dbcBatchAdapter.java` | `lastDecisionId` per item | 7 |
| `api/.../application/ReviewService.java`, `application/port/ReviewPort.java`, `adapter/persistence/R2dbcReviewAdapter.java` | new request keys, guards, new `Outcome` (8a); idempotency, backstop, audit rows (8b) | 8a, 8b |
| `api/src/test/java/com/niramoy/bddrug/PilotSeed.java` and the check, placeholder and substance tests | §8.2 seed fix | 9 |
| `web/lib/api.ts` | public reads without a scope parameter; reviewer reads with the token; new decision fields | 10, 11 |
| `web/app/page.tsx`, `web/app/products/[id]/page.tsx`, `web/app/substances/[id]/page.tsx`, `web/app/check/page.tsx`, `web/app/flags/page.tsx`, `web/components/badges.tsx`, `web/lib/reviewers.ts` | public scope only; `isReviewer()` | 10 |
| `web/app/batches/page.tsx`, `web/app/batches/[id]/page.tsx`, `web/lib/actions-core.ts`, `web/lib/copy.ts` | reviewer-only batch pages, version and request echo, 409 field mapping (Task 10 only drops `scopeFor` from `batches/[id]/page.tsx`) | 10, 11 |
| `.github/workflows/load-dgda.yml`, `.github/workflows/ci.yml`, `deploy/check-stages.sh` (new), `deploy/check-stages.test.sh` (new) | optional `stages` input, validated | 12 |

Task order: 1 → 2 → 3 → 4 → 5 (ETL, needs V6) · 6 → 7 → 8a → 8b → 9 (API; 8a needs 6 and 7, 8b needs 1 and 8a) · 10 → 11 (web; 11 needs 7, 8a and 8b) · 12 (load-dgda `stages` input and the re-run runbook) · 13 (local pilot dry run against live sources) · 14 (release, host re-run, tag).

---

### Task 1: V6 migration — item snapshots and the append-only audit trail (schema lock policy)

Implements §7.6 and D18. The SQL is verbatim from the spec.

**Files:**
- Create: `db/migrations/V6__item_snapshot_and_audit.sql`
- Modify: `db/migrations.lock` (header comment and one new line)
- Create: `etl/tests/test_schema_v6.py`
- Create: `api/src/test/java/com/niramoy/bddrug/AuditAppendOnlyIntegrationTest.java`
- Modify: `docs/design/database.md` (whole file replaced below)
- Modify: `docs/artifacts/2026-10-12-data-model.html` (five snippets below)
- Modify: `README.md` ("Database changes" section)

**Interfaces:**
- Consumes: nothing.
- Produces (later tasks and P1A/P1B rely on these exact names):
  - table `ops.item_snapshot(batch_id TEXT, concept_id TEXT, extracted_at TIMESTAMPTZ, run_id UUID, reason TEXT CHECK IN ('run','rerun','shared_change'), payload JSONB, created_at TIMESTAMPTZ)`, PK `(batch_id, concept_id, extracted_at)`, FK `(batch_id, concept_id) → ops.batch_item` (NO ACTION);
  - table `ops.audit_event(id BIGSERIAL, at, event, actor_email, actor_role, target_type, target_id, outcome, request_id UUID)`, events `sign_in, sign_in_denied, sign_out, review_open, evidence_open, decision, decision_rejected, decision_denied, flag_created, flag_resolved, partner_request`;
  - unique index `audit_event_decision_request_uq ON ops.audit_event (request_id) WHERE event = 'decision'`;
  - function `ops.reject_change()` and triggers `audit_event_append_only`, `audit_event_no_truncate`, `item_snapshot_append_only`, `item_snapshot_no_truncate` (SQLSTATE `42501` on UPDATE, DELETE, TRUNCATE).

- [ ] **Step 1: Write the failing ETL schema test**

Create `etl/tests/test_schema_v6.py`:

```python
"""V6 (spec §7.6): ops.item_snapshot and ops.audit_event. Additive: rows written before V6 are untouched."""
import pathlib
import uuid

import psycopg
import pytest
from psycopg import errors
from psycopg.types.json import Jsonb
from testcontainers.postgres import PostgresContainer

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "db/migrations").glob("V*.sql"), key=lambda f: int(f.name[1:].split("__")[0]))


@pytest.fixture(scope="module")
def conn():
    """Migrated up to V5 with a reviewed item, then V6 and later applied on top of it."""
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            before = [f for f in MIGRATIONS if int(f.name[1:].split("__")[0]) < 6]
            for f in before:
                c.execute(f.read_text())
            c.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES ('0600-v6', 2)")
            c.execute("""INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
                         ('0600-v6', 'DGDA-Drugs', 'c-1', now()), ('0600-v6', 'DGDA-Drugs', 'c-2', now())""")
            c.execute("""INSERT INTO ops.review_decision (batch_id, concept_id, decision, reviewer_email, reviewer_role)
                         VALUES ('0600-v6', 'c-1', 'ok', 'r@example.test', 'pharmacist')""")
            c.commit()
            for f in MIGRATIONS[len(before):]:
                c.execute(f.read_text())
            c.commit()
            yield c


def snapshot(conn, concept_id, reason="run"):
    conn.execute(
        """INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
           SELECT batch_id, concept_id, extracted_at, %s, %s, %s FROM ops.batch_item
            WHERE batch_id = '0600-v6' AND concept_id = %s""",
        (uuid.uuid4(), reason, Jsonb({"version": 1}), concept_id))


def audit(conn, event, request_id, actor_role="pharmacist"):
    conn.execute(
        """INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
           VALUES (%s, 'r@example.test', %s, 'batch_item', '0600-v6/c-1', 'ok', %s)""",
        (event, actor_role, request_id))


def test_v6_exists():
    assert any(f.name == "V6__item_snapshot_and_audit.sql" for f in MIGRATIONS)


def test_existing_rows_are_untouched(conn):
    assert conn.execute("SELECT count(*) FROM ops.batch_item WHERE batch_id = '0600-v6'").fetchone()[0] == 2
    assert conn.execute("SELECT count(*) FROM ops.review_decision WHERE batch_id = '0600-v6'").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM ops.item_snapshot").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM ops.audit_event").fetchone()[0] == 0


def test_a_snapshot_needs_a_known_reason(conn):
    with pytest.raises(errors.CheckViolation):
        snapshot(conn, "c-2", reason="manual")
    conn.rollback()


def test_a_snapshot_needs_its_batch_item(conn):
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute("""INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
                        VALUES ('0600-v6', 'nope', now(), %s, 'run', '{}')""", (uuid.uuid4(),))
    conn.rollback()


def test_an_item_with_a_snapshot_cannot_be_deleted(conn):
    snapshot(conn, "c-2")
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute("DELETE FROM ops.batch_item WHERE batch_id = '0600-v6' AND concept_id = 'c-2'")
    conn.rollback()


def test_audit_event_names_and_roles_are_checked(conn):
    with pytest.raises(errors.CheckViolation):
        audit(conn, "page_view", uuid.uuid4())
    conn.rollback()
    with pytest.raises(errors.CheckViolation):
        audit(conn, "decision", uuid.uuid4(), actor_role="admin")
    conn.rollback()


def test_one_decision_row_per_request_id(conn):
    rid = uuid.uuid4()
    audit(conn, "decision", rid)
    audit(conn, "decision_rejected", rid)
    audit(conn, "decision_rejected", rid)   # rejections may repeat an id; only 'decision' is unique
    with pytest.raises(errors.UniqueViolation):
        audit(conn, "decision", rid)
    conn.rollback()
```

- [ ] **Step 2: Write the failing API append-only test**

Create `api/src/test/java/com/niramoy/bddrug/AuditAppendOnlyIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Spec §7.6: ops.audit_event and ops.item_snapshot are append-only. Every service connects as the owning role, so
 * a REVOKE alone would not hold; the V6 triggers do. Only a reviewed migration that drops them can change past rows.
 */
@Testcontainers
class AuditAppendOnlyIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        TestSupport.exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('AU', 1);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES ('AU', 'DGDA-Drugs', 'W-1', now());
            INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
              SELECT batch_id, concept_id, extracted_at, '00000000-0000-4000-8000-000000000001', 'run', '{}'
                FROM ops.batch_item WHERE batch_id = 'AU';
            INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
              VALUES ('decision', 'p@example.org', 'pharmacist', 'batch_item', 'AU/W-1', 'ok',
                      '00000000-0000-4000-8000-000000000002');
            """);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "UPDATE ops.audit_event SET outcome = 'issue'",
        "DELETE FROM ops.audit_event",
        "TRUNCATE ops.audit_event",
        "UPDATE ops.item_snapshot SET reason = 'rerun'",
        "DELETE FROM ops.item_snapshot",
        "TRUNCATE ops.item_snapshot",
    })
    void changingPastRowsFailsWithInsufficientPrivilege(String sql) {
        assertThatThrownBy(() -> TestSupport.exec(pg, sql))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("42501"));
    }

    @Test void theRowsAreStillThere() throws Exception {
        assertThat(TestSupport.count(pg, "SELECT count(*) FROM ops.audit_event WHERE target_id = 'AU/W-1'")).isEqualTo(1);
        assertThat(TestSupport.count(pg, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = 'AU'")).isEqualTo(1);
    }
}
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `python -m pytest etl/tests/test_schema_v6.py -v`
Expected: FAIL — `test_v6_exists` fails with `assert False`, the others with `psycopg.errors.UndefinedTable: relation "ops.item_snapshot" does not exist`.

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.AuditAppendOnlyIntegrationTest'`
Expected: FAIL — `@BeforeAll` throws `org.postgresql.util.PSQLException: ERROR: relation "ops.item_snapshot" does not exist`.

- [ ] **Step 4: Write the migration**

Create `db/migrations/V6__item_snapshot_and_audit.sql` (the SQL below the comment is §7.6 verbatim):

```sql
-- db-schema-v1.1 (spec 2026-10-12 §7.6, D18). Purely additive: no existing row is changed.
-- ops.item_snapshot: one row per pipeline stamp of a batch item (extracted_at), grouped by run_id, so a re-run can
-- show "what changed" and the history can say why a record is back in review.
-- ops.audit_event: the healthcare-data audit trail (Docker logs rotate, so they are not one).
-- Both tables are append-only by trigger. Rollback = a new migration that drops both tables and ops.reject_change().
CREATE TABLE ops.item_snapshot (
  batch_id     TEXT        NOT NULL,
  concept_id   TEXT        NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL,
  run_id       UUID        NOT NULL,   -- one value per ETL invocation; groups the stamps of one run (§5.6.5)
  reason       TEXT        NOT NULL CHECK (reason IN ('run','rerun','shared_change')),
  payload      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, concept_id, extracted_at),
  FOREIGN KEY (batch_id, concept_id) REFERENCES ops.batch_item (batch_id, concept_id)
);

CREATE TABLE ops.audit_event (
  id          BIGSERIAL   PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  event       TEXT        NOT NULL CHECK (event IN ('sign_in','sign_in_denied','sign_out','review_open','evidence_open',
                                                    'decision','decision_rejected','decision_denied',
                                                    'flag_created','flag_resolved','partner_request')),
  actor_email TEXT,
  actor_role  TEXT        CHECK (actor_role IN ('pharmacist','engineer','user')),
  target_type TEXT,
  target_id   TEXT,
  outcome     TEXT        NOT NULL,
  request_id  UUID
);
CREATE INDEX audit_event_at_idx ON ops.audit_event (at DESC);
CREATE INDEX audit_event_target_idx ON ops.audit_event (target_type, target_id, at DESC);
CREATE UNIQUE INDEX audit_event_decision_request_uq ON ops.audit_event (request_id) WHERE event = 'decision';

-- Append-only. Every service connects as the same database role, which owns these tables,
-- so a REVOKE alone would not hold (an owner can grant itself the privilege back). Triggers do.
CREATE FUNCTION ops.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON ops.audit_event
  FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON ops.audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER item_snapshot_append_only BEFORE UPDATE OR DELETE ON ops.item_snapshot
  FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER item_snapshot_no_truncate BEFORE TRUNCATE ON ops.item_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
REVOKE UPDATE, DELETE, TRUNCATE ON ops.audit_event, ops.item_snapshot FROM PUBLIC;
```

- [ ] **Step 5: Run both tests to verify they pass**

Run: `python -m pytest etl/tests/test_schema_v6.py -v`
Expected: 7 passed.

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.AuditAppendOnlyIntegrationTest'`
Expected: BUILD SUCCESSFUL, 7 tests passed (6 parameterised cases and `theRowsAreStillThere`).

- [ ] **Step 6: Lock the migration (schema lock policy)**

Run: `./db/check-migration-lock.sh`
Expected: exit 1 with `MIGRATION NOT IN LOCK FILE: V6__item_snapshot_and_audit.sql (add its checksum line to db/migrations.lock in the same PR)`.

Replace the two header comment lines of `db/migrations.lock` with:

```
# Database schema lock — db-schema-v1.1 (V1-V5 approved by the product owner on 2026-10-12; V6 added by the IntelliDrugs P0 plan).
# sha256  file. Applied migrations are immutable. A schema change = new V<n>__name.sql + its line here, in one reviewed PR.
```

Then append the checksum line (the command prints `<sha256>  V6__item_snapshot_and_audit.sql`, the lock file's own format):

```bash
(cd db/migrations && shasum -a 256 V6__item_snapshot_and_audit.sql) >> db/migrations.lock
./db/check-migration-lock.sh
```

Expected: `schema lock OK: 6 locked migrations unchanged`.

- [ ] **Step 7: Update the schema documents**

Replace the whole of `docs/design/database.md` with:

````markdown
# Database design and schema lock

**Status:** locked as `db-schema-v1.1`. The product owner approved `db-schema-v1.0` (V1–V5) on 2026-10-12; V6 is the additive change in the IntelliDrugs UX spec (§7.6).
**Schema:** migrations `V1`–`V6` in `db/migrations/`, applied on drugdb.eliooo.org.
**Reference:** [Data model page](../artifacts/2026-10-12-data-model.html) (repo copy) · live version: https://claude.ai/artifact/5axV32KDeM55TrSUNF4qGc

## What "locked" means
1. **Applied migrations are immutable.** `V1`–`V6` are never edited, renamed or removed. Their SHA-256 checksums are recorded in `db/migrations.lock`.
2. **CI enforces it.** The `schema-lock` job runs `db/check-migration-lock.sh` on every push and pull request. The job fails when:
   - a locked file changed, is missing, or was renamed;
   - a migration exists that is not in the lock file;
   - two migrations share a version number.

   Flyway also refuses to start the stack if an applied migration's checksum differs (`validateOnMigrate`).
3. **Every schema change is a deliberate decision.** To change the schema:
   - add a **new** migration `db/migrations/V<next>__<what>.sql` (additive where possible, and never destructive to live data without a written migration plan);
   - add its line to `db/migrations.lock` (`shasum -a 256 V<next>__<what>.sql`);
   - in the PR description, explain the change, why it is needed, what it does to existing rows, and how to roll it back;
   - have it reviewed. A change to the data model also updates the data model page and this document.
4. **Version tags.** Each approved schema state gets a git tag: `db-schema-v1.0` = V1–V5, `db-schema-v1.1` = V1–V6. Bump the minor version for additive changes. Bump the major version for changes that alter or remove existing structures.

## The design in one paragraph
Three PostgreSQL schemas:
- **`raw`** holds verbatim source responses: the DGDA/OCL concepts plus every RxNav and DDInter HTTP response.
- **`curated`** holds the drug master. It has three levels: a brand (`brand_product`), its clinical drug (`clinical_drug`, ID `BDC-`), and its substances (`substance`, ID `BDS-`). Substances carry names, crosswalk codes (ICD-11 XM, RxCUI, ATC, DrugBank, SNOMED CT, DDInter, with route scope) and interaction coverage. `curated` also holds a mirror of DDInter's drug–drug, drug–disease and drug–food data, joined to our substances through `DDINTER` codes.
- **`ops`** holds batches, per-stage evidence, run history, append-only review decisions, flags, a snapshot of every record at each pipeline stamp (`item_snapshot`) and the audit trail (`audit_event`). The public approval gate is computed from these: a record is public only after a pharmacist's OK made since its latest extraction.

## Rules enforced by the database
- One substance per ICD-11 XM code (partial unique index).
- `BDS-` and `BDC-` IDs come from sequences capped at 999,999 with no cycling, so they are never reused.
- A clinical drug is unique by signature (dose form, route, sorted strengths).
- Each DDInter pair is stored once (`ddinter_a < ddinter_b`).
- Interaction coverage is stored explicitly (`full` or `none`). "No data" is never inferred.
- Missing DDInter text is NULL. A text row needs at least one of interaction or management.
- Review decisions are append-only. A reviewed record cannot be deleted (foreign key with NO ACTION).
- Item snapshots and audit events are append-only: triggers reject UPDATE, DELETE and TRUNCATE (SQLSTATE 42501). A batch item with a snapshot cannot be deleted (foreign key with NO ACTION), so the ETL keeps it and marks it "removed from batch file".
- One `decision` audit row per `request_id` (partial unique index), the backstop for idempotent decision retries.
- Enumerations and confidence (0–1) are enforced by CHECK constraints.

## Change log

### V6 `item_snapshot_and_audit` (db-schema-v1.1)
- **The change:** two new tables, `ops.item_snapshot` and `ops.audit_event`, a partial unique index on `audit_event (request_id) WHERE event = 'decision'`, two other indexes, the function `ops.reject_change()` and four triggers that make both tables append-only.
- **Why it is needed:** a pipeline run deletes `ops.stage_result` and overwrites curated rows, so without a snapshot the previous state of a record is gone ("See what changed", the Back-in-review reason). Healthcare data needs an audit trail that does not rotate like Docker logs. Decisions need a stored `request_id` so a retried decision is answered once.
- **What it does to existing rows:** nothing. The migration only creates objects. Retention: audit rows and snapshots are kept indefinitely.
- **How to roll it back:** a new migration that drops both tables and `ops.reject_change()`. Nothing in V1–V5 depends on them, so on an application rollback V6 stays. The older API and web images run unchanged against V6. The pre-P0 ETL image must not re-run a batch whose file dropped an item that already has a snapshot: its `_upsert_batch` deletes a removed item that has no decision, and the `ops.item_snapshot` foreign key (NO ACTION) refuses that delete, aborting the whole run. Re-run such a batch with the P0 ETL image only.
````

In `docs/artifacts/2026-10-12-data-model.html` make these five edits:

1. Replace `<h2>Three schemas, 21 tables</h2>` with `<h2>Three schemas, 23 tables</h2>`.
2. Replace

```html
          <li><code>review_decision</code> <span>0</span></li>
          <li><code>flag</code> <span>0</span></li>
        </ul>
```

with

```html
          <li><code>review_decision</code> <span>0</span></li>
          <li><code>flag</code> <span>0</span></li>
          <li><code>item_snapshot</code> <span>0</span></li>
          <li><code>audit_event</code> <span>0</span></li>
        </ul>
```

3. In Diagram 3, replace `  batch ||..o{ batch_run : "run history"` with

```
  batch ||..o{ batch_run : "run history"
  batch_item ||--o{ item_snapshot : "one per pipeline stamp, append-only"
  audit_event }o..o| batch_item : "target_type, target_id"
```

and add these two entities directly after the `flag { … }` entity block:

```
  item_snapshot {
    text batch_id PK, FK
    text concept_id PK, FK
    timestamptz extracted_at PK "the stamp it records"
    uuid run_id "one per ETL invocation"
    text reason "run | rerun | shared_change"
    jsonb payload "brand, clinical drug, ingredients, stages"
    timestamptz created_at
  }
  audit_event {
    bigint id PK
    timestamptz at
    text event "sign_in decision decision_rejected ..."
    text actor_email "never public"
    text actor_role "pharmacist | engineer | user"
    text target_type
    text target_id
    text outcome
    uuid request_id "unique for event = decision"
  }
```

4. Directly after the rule `<div class="rule"><h3>Review history cannot be deleted</h3>…</div>` add:

```html
      <div class="rule"><h3>Snapshots and the audit trail are append-only</h3><p>Triggers reject UPDATE, DELETE and TRUNCATE on <code>item_snapshot</code> and <code>audit_event</code>. A batch item with a snapshot cannot be deleted, so an item that leaves the batch file is kept and marked “removed from batch file”.</p><span class="where">ops.reject_change() triggers</span></div>
```

5. Directly after the table row `<tr><td class="t">flag</td>…</tr>` add:

```html
          <tr><td class="t">item_snapshot</td><td class="mono">batch_id, concept_id, extracted_at</td><td>The record as each pipeline stamp left it, grouped by run. Append-only.</td><td class="n">0</td></tr>
          <tr><td class="t">audit_event</td><td class="mono">id</td><td>Who did what and when: sign-ins, decisions, rejections, flags. Append-only.</td><td class="n">0</td></tr>
```

In `README.md`, section "Database changes", replace `The schema is **locked** (\`db-schema-v1.0\`, migrations V1–V5).` with `The schema is **locked** (\`db-schema-v1.1\`, migrations V1–V6).`

- [ ] **Step 8: Run the ETL suite once more and commit**

Run: `python -m pytest etl/tests/test_schema_v3.py etl/tests/test_schema_v4.py etl/tests/test_schema_v5.py etl/tests/test_schema_v6.py -q`
Expected: all pass (V6 is applied on top in every schema test).

```bash
git add db/migrations/V6__item_snapshot_and_audit.sql db/migrations.lock etl/tests/test_schema_v6.py \
  api/src/test/java/com/niramoy/bddrug/AuditAppendOnlyIntegrationTest.java docs/design/database.md \
  docs/artifacts/2026-10-12-data-model.html README.md
git commit -m "feat(db): V6 item snapshots and append-only audit events (db-schema-v1.1)

The change: ops.item_snapshot, ops.audit_event, a unique decision request_id index and
append-only triggers. Why: re-runs erase the previous state and Docker logs are not an
audit trail. Existing rows: untouched. Rollback: a new migration dropping both tables.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: ETL client — read DDInter's `interact-with` list in full and say whether it is complete

Implements §8.1 item 5 (client side) and Review Focus 2.

**Files:**
- Modify: `etl/src/bddrug_etl/ddinter/client.py`
- Test: `etl/tests/test_ddinter_client.py`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `InteractWithRow(partner_id: str, partner_name: str, interaction_id: str, severity: str)` (frozen dataclass; `severity` already mapped through `severity()` to `major|moderate|minor|unknown`);
  - `InteractWithList(rows: tuple[InteractWithRow, ...], complete: bool)`;
  - `DDInterClient.interact_with(ddinter_id: str) -> InteractWithList` — never raises for an HTTP, JSON or shape problem (it answers `complete=False`); database errors from the snapshot store still propagate;
  - `DDInterClient.interact_with_map()` and `pair_interaction_id()` keep their signatures and share the same memoised read.

- [ ] **Step 1: Write the failing tests**

In `etl/tests/test_ddinter_client.py`, change the import line to

```python
from bddrug_etl.ddinter.client import DDInterClient, DDInterPairRow, InteractWithList, InteractWithRow, severity
```

and append:

```python
def _start(request) -> str:
    return dict(httpx.QueryParams(request.content.decode()))["start"]


@respx.mock
def test_interact_with_is_complete_when_every_row_is_read(client, monkeypatch):
    mock_session()
    p1, p2 = fxj("interact_with_p1.json"), fxj("interact_with_p2.json")
    p1["recordsTotal"] = p2["recordsTotal"] = 6
    monkeypatch.setattr(mod, "PAGE", 4)
    respx.post(f"{B}/server/interact-with/DDInter1951/").mock(
        side_effect=lambda r: httpx.Response(200, json=p1 if _start(r) == "0" else p2))
    listed = client.interact_with("DDInter1951")
    assert listed.complete is True and len(listed.rows) == 6
    assert listed.rows[0] == InteractWithRow("DDInter9", "Acalabrutinib", "3039", "major")
    assert listed.rows[4] == InteractWithRow("DDInter1388", "Pantoprazole", "122526", "moderate")
    # one memoised read serves the text lookups too: session GET + two pages, nothing more
    assert client.pair_interaction_id("DDInter1951", "DDInter20") == "34056"
    assert respx.calls.call_count == 3


@respx.mock
def test_interact_with_is_incomplete_when_rows_are_missing(client):
    mock_session()
    p1, p2 = fxj("interact_with_p1.json"), fxj("interact_with_p2.json")   # 6 rows of a real recordsTotal of 936
    respx.post(f"{B}/server/interact-with/DDInter1951/").mock(
        side_effect=lambda r: httpx.Response(200, json=p1 if _start(r) == "0" else p2))
    listed = client.interact_with("DDInter1951")
    assert listed.complete is False and len(listed.rows) == 6


@respx.mock
def test_interact_with_is_incomplete_when_a_page_fails(client):
    mock_session()
    p1 = fxj("interact_with_p1.json")
    respx.post(f"{B}/server/interact-with/DDInter1951/").mock(
        side_effect=lambda r: httpx.Response(200, json=p1) if _start(r) == "0" else httpx.Response(500, text="boom"))
    assert client.interact_with("DDInter1951") == InteractWithList((), False)


@respx.mock
def test_interact_with_is_incomplete_when_a_repeated_row_makes_up_the_count(client, monkeypatch):
    """Review Focus 2: a paging overlap repeats rows; the count matches recordsTotal but partners are missing."""
    mock_session()
    p1 = fxj("interact_with_p1.json")
    p1["recordsTotal"] = 6
    p2 = {**p1, "data": p1["data"][:2]}   # page 2 repeats the first two rows of page 1
    monkeypatch.setattr(mod, "PAGE", 4)
    respx.post(f"{B}/server/interact-with/DDInter1951/").mock(
        side_effect=lambda r: httpx.Response(200, json=p1 if _start(r) == "0" else p2))
    listed = client.interact_with("DDInter1951")
    assert len(listed.rows) == 6 and listed.complete is False


@respx.mock
def test_interact_with_is_incomplete_when_a_page_is_json_but_not_an_object(client):
    mock_session()
    respx.post(f"{B}/server/interact-with/DDInter1951/").mock(return_value=httpx.Response(200, json=[{"drug_id": "x"}]))
    assert client.interact_with("DDInter1951") == InteractWithList((), False)


@respx.mock
def test_interact_with_row_without_a_level_is_unknown(client):
    mock_session()
    page = {"recordsTotal": 1, "data": [{"drug_id": "DDInter5", "drug_name": "Alpha", "interaction_id": 77}]}
    respx.post(f"{B}/server/interact-with/DDInter1/").mock(return_value=httpx.Response(200, json=page))
    assert client.interact_with("DDInter1") == InteractWithList((InteractWithRow("DDInter5", "Alpha", "77", "unknown"),), True)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest etl/tests/test_ddinter_client.py -v`
Expected: collection error `ImportError: cannot import name 'InteractWithList' from 'bddrug_etl.ddinter.client'`.

- [ ] **Step 3: Implement**

In `etl/src/bddrug_etl/ddinter/client.py`:

Replace the import block at the top with

```python
"""DDInter 2.0 client. Every request goes through SnapshotHttp (paced, stored in raw.http_snapshot)."""
import re
from dataclasses import dataclass

import httpx

from bddrug_etl.ddinter.html import DDInterDrug, InteractionText, clean_text, parse_drug_detail, parse_interaction
```

Add after the `DDInterPairRow` dataclass:

```python
@dataclass(frozen=True)
class InteractWithRow:
    """One row of a drug's interact-with list: the partner, the interaction id and the mapped severity."""
    partner_id: str
    partner_name: str
    interaction_id: str
    severity: str


@dataclass(frozen=True)
class InteractWithList:
    """A drug's interact-with list. ``complete`` is False when a page failed, when fewer or more rows were read than
    ``recordsTotal``, or when a row came back twice (paging overlap). An incomplete list must never be used to say
    "no interaction listed" (spec §6.7.2, §8.1 item 5)."""
    rows: tuple[InteractWithRow, ...]
    complete: bool
```

In `DDInterClient.__init__`, replace `self._interact_maps: dict[str, dict[str, str]] = {}` with

```python
        self._interact_rows: dict[str, tuple[list[dict], int]] = {}
        self._interact_maps: dict[str, dict[str, str]] = {}
```

Replace the whole `interact_with_map` method with these three methods:

```python
    def _read_interact_with(self, ddinter_id: str) -> tuple[list[dict], int]:
        """Every row of the drug's interact-with list and the server's recordsTotal, read once per drug (memoised).

        The server ignores search[value] (verified 2026-10-11), so the whole list is read. Raises on a failed page.
        """
        if ddinter_id not in self._interact_rows:
            path, referer = f"/server/interact-with/{ddinter_id}/", f"/server/drug-detail/{ddinter_id}/"
            rows: list[dict] = []
            start = 0
            while True:
                body = self._post_page(path, referer, start, {"severity": "", "mechanism": ""})
                try:
                    total = int(body["recordsTotal"])
                except (KeyError, TypeError, ValueError):
                    raise ValueError(f"DDInter POST {path}: missing or non-integer recordsTotal") from None
                page = body["data"]
                if not page:
                    break
                rows.extend(page)
                start += PAGE
                if start >= total:
                    break
            self._interact_rows[ddinter_id] = (rows, total)
        return self._interact_rows[ddinter_id]

    def interact_with(self, ddinter_id: str) -> InteractWithList:
        """The drug's full interact-with list, with ``complete`` saying whether it can be trusted as the whole list."""
        try:
            raw, total = self._read_interact_with(ddinter_id)
            rows = tuple(InteractWithRow(str(r["drug_id"]), str(r.get("drug_name") or r["drug_id"]),
                                         str(r["interaction_id"]), severity(r.get("level"))) for r in raw)
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError, TypeError, AttributeError):
            # AttributeError: a page that is valid JSON but not an object (``_post_page`` calls ``body.get``)
            return InteractWithList((), False)
        distinct = {(row.partner_id, row.interaction_id) for row in rows}
        return InteractWithList(rows, len(rows) == total and len(distinct) == total)

    def interact_with_map(self, ddinter_id: str) -> dict[str, str]:
        """partner drug id -> interaction id, from the same memoised read as ``interact_with``. Raises on a failed page."""
        if ddinter_id not in self._interact_maps:
            m: dict[str, str] = {}
            for r in self._read_interact_with(ddinter_id)[0]:
                m.setdefault(r["drug_id"], str(r["interaction_id"]))
            self._interact_maps[ddinter_id] = m
        return self._interact_maps[ddinter_id]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest etl/tests/test_ddinter_client.py -v`
Expected: all pass, including the existing `test_pair_interaction_id_pages_and_matches_drug_id` and `test_interact_with_map_is_memoised_per_drug`.

- [ ] **Step 5: Commit**

```bash
git add etl/src/bddrug_etl/ddinter/client.py etl/tests/test_ddinter_client.py
git commit -m "feat(etl): read DDInter interact-with in full and report whether the list is complete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ETL — route-scoped DDInter selection, route notes and route-scoped `text_missing`

Implements §8.1 items 1–3 and the ETL part of S7 as the phase-0 exit criterion reads after the "Before you start" amendment of §12.1 (stage note OK, no alert, product page names `DDInter352`; the checker's own naming of the chosen entry ships in P2, §7.4): the eye drop is checked against `DDInter352` and its note no longer lists `DDInter351` pairs. Mapping, coverage and the stored DDInter rows stay the same for **all** candidate entries (shared substance facts).

**Files:**
- Modify: `etl/src/bddrug_etl/stages/ddinter.py`
- Test: `etl/tests/test_stage_ddinter.py`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `choose(entries, route: str | None) -> tuple[list, bool]` in `bddrug_etl.stages.ddinter` — the Python twin of the API's `RouteRule.choose`; works on any objects with `ddinter_id` and `route_scope` attributes; the list is sorted by the numeric part of the id; `([], False)` when nothing fits;
  - `route_assumed_note(ddinter_id: str, scope: str, route: str | None) -> str` and `no_route_entry_note(route: str | None) -> str`;
  - stage evidence for a processed product gains `"route": str | None`, `"chosen": [{"bds_id", "ddinter_id", "route_scope", "route_assumed"}]`, `"route_assumed": bool`; `"pair_count"` now counts the chosen entries' pairs only;
  - `_ProductPlan(route, subs)` replaces the bare `list[_Sub]` plan (internal).

- [ ] **Step 1: Give the test products routes and add the route tests**

In `etl/tests/test_stage_ddinter.py`:

Add to the imports, and change the stage import:

```python
from bddrug_etl.parse.names import route_for_dosage_form
from bddrug_etl.stages.ddinter import _mapped_chosen, map_and_load_ddinter, plan_ddinter
```

Append to `SUBSTANCES` (inside the list, after the `BDS-000013` line):

```python
    ("BDS-000014", "Ciprofloxacin", "XMCIP1", [("Ciprofloxacin", "icd11")], ["DB00537"]),
```

Replace the `PRODUCTS` list's closing lines

```python
    ("noing", "Tablet", []),
    ("nosub", "Tablet", ["XMNONE"]),
]
```

with

```python
    ("noing", "Tablet", []),
    ("nosub", "Tablet", ["XMNONE"]),
    ("chlor_nocd", "Eye Drops", ["XM2TE7"]),   # no clinical drug: the route is unknown
    ("warf_eye", "Eye Drops", ["XM86W0"]),     # a route that has no warfarin entry of its own
    ("cipro_eye", "Eye Drops", ["XMCIP1"]),
    ("cipro_nocd", "Tablet", ["XMCIP1"]),      # no clinical drug
]
# Every other product gets a clinical drug whose route comes from its dosage form, as the clinical stage would set it.
NO_CLINICAL = {"chlor_nocd", "cipro_nocd"}
CIPRO = "BDS-000014"
```

In the `conn` fixture, replace

```python
                for xm in xms:
                    c.execute("INSERT INTO curated.brand_product_ingredient VALUES (%s, %s, %s)", (cid, xm, xm))
```

with

```python
                for xm in xms:
                    c.execute("INSERT INTO curated.brand_product_ingredient VALUES (%s, %s, %s)", (cid, xm, xm))
                if cid not in NO_CLINICAL:
                    bdc = c.execute(
                        """INSERT INTO curated.clinical_drug (signature, display_name, dose_form, route)
                           VALUES (%s, %s, %s, %s) RETURNING bdc_id""",
                        (f"test|{cid}", cid, form, route_for_dosage_form(form))).fetchone()[0]
                    c.execute("UPDATE curated.brand_product SET bdc_id = %s WHERE concept_id = %s", (bdc, cid))
```

Give `FakeDDInter` a `graph_extra` parameter. Replace its `__init__` signature line and add the attribute, and replace `graph`:

```python
    def __init__(self, extra_drugs=None, fail=None, one_sided=None, graph_extra=None):
        self.extra = extra_drugs or {}  # id -> (name, drugbank)
        self.fail = fail or {}
        # directed (ddinter_id, partner_id) lookups that find nothing: DDInter's per-drug interact-with
        # lists are not provably symmetric (warfarin: graph 934 rows, interact-with recordsTotal 936)
        self.one_sided = set(one_sided or ())
        self.graph_extra = graph_extra or {}  # id -> extra graph rows (partner_id, name, severity, actions)
        self.drug_list_calls = 0
        self.detail_calls, self.graph_calls, self.disease_calls, self.food_calls = [], [], [], []
        self.pair_calls, self.text_calls = [], []
```

```python
    def graph(self, ddinter_id):
        self.graph_calls.append(ddinter_id)
        self._boom("graph", ddinter_id)
        return [DDInterPairRow(*r) for r in GRAPH.get(ddinter_id, []) + self.graph_extra.get(ddinter_id, [])]
```

Change `EMPTY`'s use for a processed product. In `test_domperidone_not_in_ddinter_is_none_and_warn` replace

```python
    assert r.evidence == EMPTY | {"coverage": [{"bds_id": DOMP, "coverage": "none"}]}
```

with

```python
    assert r.evidence == EMPTY | {"coverage": [{"bds_id": DOMP, "coverage": "none"}],
                                  "route": "systemic", "chosen": [], "route_assumed": False}
```

In `test_chloramphenicol_maps_all_three_route_scopes` replace the last line `assert res[0].evidence == res[1].evidence` with

```python
    shared = lambda ev: {k: v for k, v in ev.items() if k not in ("route", "chosen", "route_assumed")}
    assert shared(res[0].evidence) == shared(res[1].evidence)
    # each product is checked against the entry for its own route
    assert [c["ddinter_id"] for c in res[0].evidence["chosen"]] == ["DDInter352"]
    assert [c["ddinter_id"] for c in res[1].evidence["chosen"]] == ["DDInter351"]
```

Append the new tests at the end of the file:

```python
# --- route-scoped selection (spec §8.1) ------------------------------------------------------------

# Real DDInter: warfarin has a pair with systemic chloramphenicol (DDInter351) only, and DDInter has no text for it here.
CHLOR_WARF = {
    "DDInter1951": [("DDInter351", "Chloramphenicol", "moderate", (M,))],
    "DDInter351": [("DDInter1951", "Warfarin", "moderate", (M,))],
}
NOTE_351 = "DDInter text not found for DDInter1951/DDInter351"


def test_eye_drop_note_uses_ophthalmic_entry(conn):
    r_eye, r_warf = map_and_load_ddinter(conn, FakeDDInter(graph_extra=CHLOR_WARF), ["chlor_eye", "warf"])
    assert (r_eye.status, r_eye.note) == ("ok", ""), r_eye
    assert r_eye.evidence["route"] == "ophthalmic" and r_eye.evidence["route_assumed"] is False
    assert r_eye.evidence["chosen"] == [
        {"bds_id": CHLOR, "ddinter_id": "DDInter352", "route_scope": "ophthalmic", "route_assumed": False}]
    assert r_eye.evidence["pair_count"] == 0 and r_eye.evidence["text_missing"] == []
    # warfarin's pair with DDInter351 has no text, but no product in scope chose DDInter351
    assert (r_warf.status, r_warf.note) == ("ok", ""), r_warf
    # shared facts stay complete: DDInter351 is mapped and its pair stored, for a future chloramphenicol capsule
    assert ("DDInter351", "systemic", "drugbank", Decimal("1.00")) in ddinter_codes(conn, CHLOR)
    assert conn.execute("SELECT severity FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1951' "
                        "AND ddinter_b = 'DDInter351'").fetchone() == ("moderate",)


def test_capsule_note_uses_systemic_entry(conn):
    r_cap, r_warf = map_and_load_ddinter(conn, FakeDDInter(graph_extra=CHLOR_WARF), ["chlor_cap", "warf"])
    assert (r_cap.status, r_cap.note) == ("warn", NOTE_351)
    assert (r_warf.status, r_warf.note) == ("warn", NOTE_351)
    assert r_cap.evidence["chosen"] == [
        {"bds_id": CHLOR, "ddinter_id": "DDInter351", "route_scope": "systemic", "route_assumed": False}]
    assert r_cap.evidence["pair_count"] == 1 and r_cap.evidence["text_missing"] == [["DDInter1951", "DDInter351"]]


def test_no_clinical_drug_falls_back_to_systemic_assumed(conn):
    [r] = map_and_load_ddinter(conn, FakeDDInter(), ["chlor_nocd"])
    assert (r.status, r.note) == ("warn", "DDInter route assumed: DDInter351 (systemic) used for unknown route")
    assert r.evidence["route"] is None and r.evidence["route_assumed"] is True
    assert r.evidence["chosen"] == [
        {"bds_id": CHLOR, "ddinter_id": "DDInter351", "route_scope": "systemic", "route_assumed": True}]


def test_only_other_route_entry_notes_no_route_entry(conn):
    client = FakeDDInter(extra_drugs={"DDInter9300": ("Ciprofloxacin (otic)", "DB00537")})
    r_eye, r_nocd = map_and_load_ddinter(conn, client, ["cipro_eye", "cipro_nocd"])
    assert (r_eye.status, r_eye.note) == ("warn", "No DDInter entry for route ophthalmic")
    assert (r_nocd.status, r_nocd.note) == ("warn", "No DDInter entry for unknown route")
    for r in (r_eye, r_nocd):
        assert r.evidence["chosen"] == [] and r.evidence["route_assumed"] is False and r.evidence["pair_count"] == 0
    # the otic entry is still a shared fact of the substance
    assert coverage(conn, CIPRO) == ("full", "DDInter DDInter9300")


def test_note_formats(conn):
    r_warf_eye, r_chlor_nocd = map_and_load_ddinter(conn, FakeDDInter(), ["warf_eye", "chlor_nocd"])
    assert r_warf_eye.note == "DDInter route assumed: DDInter1951 (systemic) used for ophthalmic"
    assert r_chlor_nocd.note == "DDInter route assumed: DDInter351 (systemic) used for unknown route"
    client = FakeDDInter(extra_drugs={"DDInter9300": ("Ciprofloxacin (otic)", "DB00537")})
    r_eye, r_nocd = map_and_load_ddinter(conn, client, ["cipro_eye", "cipro_nocd"])
    assert r_eye.note == "No DDInter entry for route ophthalmic"
    assert r_nocd.note == "No DDInter entry for unknown route"
    for r in (r_warf_eye, r_chlor_nocd, r_eye, r_nocd):
        assert r.status == "warn" and "None" not in r.note and "; " not in r.note
        assert not r.note.startswith("DDInter text not found for ")


@pytest.mark.parametrize("batch, missing", [
    (["warf", "chlor_eye"], False),   # the eye drop chose DDInter352
    (["warf", "chlor_cap"], True),    # the capsule chose DDInter351
], ids=["eye", "capsule"])
def test_text_missing_requires_partner_chosen_in_scope(conn, batch, missing):
    res = dict(zip(batch, map_and_load_ddinter(conn, FakeDDInter(graph_extra=CHLOR_WARF), batch)))
    assert res["warf"].evidence["text_missing"] == ([["DDInter1951", "DDInter351"]] if missing else [])
    assert (NOTE_351 in res["warf"].note) is missing


def test_mapped_products_choose_by_their_own_route(conn):
    """Products mapped by earlier batches count with the entries THEIR route picks (every fixture product is loaded)."""
    map_and_load_ddinter(conn, FakeDDInter(), ["chlor_eye"])   # maps chloramphenicol's three entries
    chosen = _mapped_chosen(conn)
    assert {"DDInter351", "DDInter352"} <= chosen   # the capsule and the no-route product pick 351, the eye drop 352
    assert "DDInter353" not in chosen               # no otic product: the otic entry is never chosen
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest etl/tests/test_stage_ddinter.py -v`
Expected: FAIL — collection error `ImportError: cannot import name '_mapped_chosen' from 'bddrug_etl.stages.ddinter'`. (Once Step 3 adds the function, the remaining failures before the rest of Step 3 would be `KeyError: 'route'` and `('warn', 'DDInter text not found for DDInter1951/DDInter351') != ('ok', '')` for the eye drop.)

- [ ] **Step 3: Implement the route rule in the stage**

In `etl/src/bddrug_etl/stages/ddinter.py`:

Replace the import block's first lines

```python
from __future__ import annotations

import re
from dataclasses import dataclass, field
```

with

```python
from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import TypeVar
```

After the line `_NAME_TYPES = ("icd11", "rxnorm", "dgda_content")` add:

```python
GENERAL_SCOPES = ("systemic", "any")
E = TypeVar("E")


def route_assumed_note(ddinter_id: str, scope: str, route: str | None) -> str:
    """§8.1 item 3: the general entry stands in for the product's route (NULL route: "unknown route", never None)."""
    return f"DDInter route assumed: {ddinter_id} ({scope}) used for {route if route is not None else 'unknown route'}"


def no_route_entry_note(route: str | None) -> str:
    """§8.1 item 3: the substance has DDInter entries, but none for this route and no general one."""
    return f"No DDInter entry for route {route}" if route is not None else "No DDInter entry for unknown route"


def choose(entries: Iterable[E], route: str | None) -> tuple[list[E], bool]:
    """Which DDInter entries speak for a substance in a product: the Python twin of the API's ``RouteRule.choose``.

    Entries whose ``route_scope`` equals the product's route (not assumed); otherwise the ``systemic`` or ``any``
    entries (assumed); otherwise none. A NULL route never matches exactly. Sorted by the numeric part of the id.
    Works on any objects with ``ddinter_id`` and ``route_scope`` attributes.
    """
    items = list(entries)
    by_id = lambda e: _idkey(e.ddinter_id)  # noqa: E731
    if route is not None:
        exact = sorted((e for e in items if e.route_scope == route), key=by_id)
        if exact:
            return exact, False
    general = sorted((e for e in items if e.route_scope in GENERAL_SCOPES), key=by_id)
    return (general, True) if general else ([], False)


def _applies(pair: Pair, chosen_ids: set[str], scope_chosen: set[str]) -> bool:
    """§8.1 item 3: a missing text concerns this product only when one side is an entry it chose and the other side
    is an entry chosen by an in-scope product (this run, or a product mapped by an earlier batch, by its own route)."""
    a, b = pair
    return (a in chosen_ids and b in scope_chosen) or (b in chosen_ids and a in scope_chosen)
```

(`_idkey` and `Pair` are defined further down the module; both are only looked up when the functions run.)

After the `_Sub` dataclass add:

```python
@dataclass(frozen=True)
class _ProductPlan:
    route: str | None  # the clinical drug's route; None when the product has no clinical drug
    subs: list[_Sub]
```

In `_Run.__init__`, after `self.scope_ids: set[str] = set()  # …` add:

```python
        self.scope_chosen: set[str] = set()  # entries chosen by the route rule for some in-scope product
```

Replace the whole `_plan` function with:

```python
def _plan(conn: psycopg.Connection, cid: str) -> _ProductPlan | StageResult:
    rows = conn.execute(
        """SELECT bpi.xm_code, c.bds_id
             FROM curated.brand_product_ingredient bpi
             LEFT JOIN curated.substance_code c ON c.system = 'ICD11_XM' AND c.code = bpi.xm_code
            WHERE bpi.concept_id = %s ORDER BY bpi.xm_code""",
        (cid,),
    ).fetchall()
    if not rows:
        return _fail(cid, "no ICD-11 ingredient mapping from DGDA")
    missing = [xm for xm, bds in rows if bds is None]
    if missing:
        return _fail(cid, f"no substance for {', '.join(missing)}; run the substances stage first")
    subs = []
    for bds_id in sorted({bds for _, bds in rows}):
        names = conn.execute(
            "SELECT name FROM curated.substance_name WHERE bds_id = %s AND name_type = ANY(%s)",
            (bds_id, list(_NAME_TYPES)),
        ).fetchall()
        codes = conn.execute(
            "SELECT code FROM curated.substance_code WHERE bds_id = %s AND system = 'DRUGBANK'", (bds_id,)
        ).fetchall()
        keys = frozenset(k for (n,) in names if (k := normalize_name(n)))
        subs.append(_Sub(bds_id, keys, frozenset(c.strip().upper() for (c,) in codes)))
    route = conn.execute(
        """SELECT cd.route FROM curated.brand_product bp
           LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
           WHERE bp.concept_id = %s""",
        (cid,),
    ).fetchone()
    return _ProductPlan(route[0] if route else None, subs)
```

Replace the whole `_process` function with:

```python
def _process(conn: psycopg.Connection, run: _Run, cid: str, plan: _ProductPlan, pending: _Pending) -> StageResult:
    mappings: list[dict] = []
    coverage: list[dict] = []
    notes: list[str] = []
    ids: set[str] = set()         # every candidate entry: shared substance facts, stored whatever the route
    chosen_ids: set[str] = set()  # the entries the route rule picks for this product (§8.1 item 2)
    chosen: list[dict] = []
    route_assumed = False
    for sub in plan.subs:
        entries = run.candidates(sub.keys)
        if not entries:
            if _upsert_coverage(conn, sub.bds_id, "none", NONE_NOTE):
                pending.changed.bds_ids.add(sub.bds_id)
            coverage.append({"bds_id": sub.bds_id, "coverage": "none"})
            notes.append(NONE_NOTE)
            continue
        for e in entries:
            d = run.detail(e.ddinter_id)
            confirmed = d.drugbank_id is not None and d.drugbank_id.strip().upper() in sub.drugbank
            method, confidence = ("drugbank", 1.0) if confirmed else ("name", 0.7)
            if _upsert_drug(conn, d, e.route_scope):
                pending.changed.ddinter_ids.add(e.ddinter_id)
            if _upsert_code(conn, sub.bds_id, e.ddinter_id, e.route_scope, method, confidence):
                pending.changed.bds_ids.add(sub.bds_id)
            if _upsert_name(conn, sub.bds_id, d.name):
                pending.changed.bds_ids.add(sub.bds_id)
            mappings.append({"bds_id": sub.bds_id, "ddinter_id": e.ddinter_id, "name": d.name,
                             "route_scope": e.route_scope, "method": method, "confidence": confidence})
            if not confirmed:
                notes.append(f"DDInter {e.ddinter_id} matched by name only")
            ids.add(e.ddinter_id)
        if _upsert_coverage(conn, sub.bds_id, "full", "DDInter " + ", ".join(e.ddinter_id for e in entries)):
            pending.changed.bds_ids.add(sub.bds_id)
        coverage.append({"bds_id": sub.bds_id, "coverage": "full"})
        picked, assumed = choose(entries, plan.route)
        if not picked:
            notes.append(no_route_entry_note(plan.route))
        for e in picked:
            if assumed:
                notes.append(route_assumed_note(e.ddinter_id, e.route_scope, plan.route))
            chosen_ids.add(e.ddinter_id)
            chosen.append({"bds_id": sub.bds_id, "ddinter_id": e.ddinter_id, "route_scope": e.route_scope,
                           "route_assumed": assumed})
        route_assumed = route_assumed or (assumed and bool(picked))

    pairs: set[Pair] = set()
    fetchable: set[Pair] = set()
    disease_count = food_count = 0
    for ddinter_id in sorted(ids, key=_idkey):
        if ddinter_id not in run.stored_ids:
            pending.changed.ddinter_ids |= _store_id_data(conn, run, ddinter_id)
            pending.ids.add(ddinter_id)
        mine = run.pairs(ddinter_id)
        if ddinter_id in chosen_ids:
            pairs.update(mine)
        disease_count += len(run.diseases(ddinter_id))
        food_count += len(run.foods(ddinter_id))
        for pair in sorted(mine):
            other = pair[1] if pair[0] == ddinter_id else pair[0]
            # Texts only where both sides are in scope (this batch or mapped by an earlier one); pairs with
            # an unmapped drug keep severity/actions and get their text once that drug is mapped.
            if other in run.scope_ids:
                fetchable.add(pair)
                if pair not in run.stored_texts and pair not in pending.texts:
                    _ensure_text(conn, run, pair, pending)

    # A pair without text is reported only on the products it applies to (§8.1 item 3): one side chosen by this
    # product, the other chosen by an in-scope product. Fetching texts stays as wide as before (shared facts).
    text_missing = sorted(p for p in fetchable
                          if p in run.texts and run.texts[p] is None and _applies(p, chosen_ids, run.scope_chosen))
    notes.extend(f"DDInter text not found for {a}/{b}" for a, b in text_missing)

    evidence = {"mappings": mappings, "coverage": coverage, "pair_count": len(pairs),
                "disease_count": disease_count, "food_count": food_count,
                "text_fetch_count": len(pairs & run.fetched), "text_missing": [list(p) for p in text_missing],
                "route": plan.route, "chosen": chosen, "route_assumed": route_assumed}
    return StageResult(cid, "warn" if notes else "ok", "; ".join(notes), evidence)
```

In `DDInterPlan`, change the type hints `dict[str, list[_Sub] | StageResult]` to `dict[str, _ProductPlan | StageResult]` (in `__init__`).

Replace the whole `plan_ddinter` function with:

```python
def plan_ddinter(conn: psycopg.Connection, client: DDInterClient, concept_ids: list[str]) -> DDInterPlan:
    """Fetch the drug list once and plan every product of the run (read-only, apart from snapshots)."""
    run = _Run(client, client.drug_list())  # once per run; a failure here is run-level and propagates
    # DDInter ids mapped by earlier batches: pairs between them and this batch's drugs get texts too
    run.scope_ids.update(code for (code,) in conn.execute(
        "SELECT DISTINCT code FROM curated.substance_code WHERE system = 'DDINTER'").fetchall())
    run.scope_chosen.update(_mapped_chosen(conn))

    plans: dict[str, _ProductPlan | StageResult] = {}
    for cid in dict.fromkeys(concept_ids):
        try:
            with conn.transaction():
                plans[cid] = _plan(conn, cid)
        except (psycopg.OperationalError, psycopg.InterfaceError):
            raise
        except Exception as e:
            plans[cid] = _fail(cid, error_note(e))
    for plan in plans.values():
        if isinstance(plan, _ProductPlan):
            for sub in plan.subs:
                entries = run.candidates(sub.keys)
                run.scope_ids.update(e.ddinter_id for e in entries)
                run.scope_chosen.update(e.ddinter_id for e in choose(entries, plan.route)[0])
    return DDInterPlan(run, plans)


def _mapped_chosen(conn: psycopg.Connection) -> set[str]:
    """The DDInter entries the route rule picks for every product already mapped (earlier batches), each by its own
    route. Read before this run writes anything, so it describes the earlier batches only."""
    rows = conn.execute(
        """SELECT bp.concept_id, cd.route, xm.bds_id, dd.code, dd.route_scope
             FROM curated.brand_product bp
             LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
             JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
             JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
             JOIN curated.substance_code dd ON dd.bds_id = xm.bds_id AND dd.system = 'DDINTER'""").fetchall()
    groups: dict[tuple[str, str], tuple[str | None, list[_Entry]]] = {}
    for concept_id, route, bds_id, code, scope in rows:
        groups.setdefault((concept_id, bds_id), (route, []))[1].append(_Entry(code, "", scope))
    out: set[str] = set()
    for route, entries in groups.values():
        out.update(e.ddinter_id for e in choose(entries, route)[0])
    return out
```

Update the module docstring's third paragraph (the one starting "Interaction texts are fetched …") by appending:

```
Route scope (spec §8.1): each product is checked against the entries the route rule (``choose``, the twin of the API's
RouteRule) picks for its clinical drug's route. ``pair_count`` counts those entries' pairs, ``text_missing`` lists a pair
only when one side is chosen by this product and the other by an in-scope product, and the route notes ("DDInter route
assumed: …", "No DDInter entry for route …") explain an assumed or missing route. Mapping, coverage and the stored
DDInter rows still cover every candidate entry: they are shared substance facts.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest etl/tests/test_stage_ddinter.py -v`
Expected: all pass (the existing tests and the 8 new route cases).

Run: `python -m pytest etl/tests/test_run_pipeline.py etl/tests/test_pipeline_scale.py etl/tests/test_shared_reopen.py -q`
Expected: all pass. Those products are loaded through the clinical stage (or a full run) before the DDInter stage, so they have a route. The only test that runs the DDInter stage without the clinical stage, `test_run_pipeline.py::test_stages_subset_runs_only_those_in_canonical_order` (`--stages ddinter,substances`), asserts nothing about the DDInter stage's status (only that its rows exist and the substances status is `ok` or `warn`), so the `warn` that the unknown-route note now produces there changes no assertion.

- [ ] **Step 5: Commit**

```bash
git add etl/src/bddrug_etl/stages/ddinter.py etl/tests/test_stage_ddinter.py
git commit -m "fix(etl): check each product against the DDInter entry for its route

The eye drop now uses DDInter352: no DDInter351 'text not found' pairs in its note. Route
notes explain an assumed or missing route; pair_count and text_missing follow the chosen
entries. Mapping, coverage and stored DDInter rows still cover every candidate entry.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ETL — reconcile the stored pair list with `interact-with`, and fail an entry whose list is incomplete

Implements §8.1 item 5 and D41: the stored partner set is the union of the graph and `interact-with`; an incomplete read writes no `ddinter_drug` or pair rows for that entry (not even from a complete partner's list in the same run) and fails every product that chose it. A partner present only in `interact-with` is inserted and never overwrites a row that a graph wrote, so the stored severity and actions, and the "changed" report that re-opens approved records, do not depend on processing order.

**Files:**
- Modify: `etl/src/bddrug_etl/stages/ddinter.py`
- Modify (test fakes gain `interact_with`): `etl/tests/test_stage_ddinter.py`, `etl/tests/test_run_pipeline.py`, `etl/tests/test_pipeline_scale.py`, `etl/tests/test_shared_reopen.py`

**Interfaces:**
- Consumes: `DDInterClient.interact_with(ddinter_id) -> InteractWithList` (Task 2); `_process`, `choose`, `plan_ddinter` (Task 3).
- Produces:
  - `INCOMPLETE_NOTE = "DDInter pair list incomplete for {}"` (formatted with the id); a product that chose an incomplete entry gets stage status `fail` with that note (one per incomplete chosen entry, joined by `"; "`);
  - `PairData = tuple[str, str, str, list[str]]` (name_a, name_b, severity, actions) and `_PairList(graph: dict[Pair, PairData], extra: dict[Pair, PairData])` with `all() -> dict[Pair, PairData]` (internal);
  - `_Run.listing(ddinter_id) -> InteractWithList` (memoised), `_Run.incomplete: set[str]` (filled by `plan_ddinter` from every candidate entry's listing, before any product is processed), `_Run.pair_list(ddinter_id) -> _PairList | None` (None = incomplete; pairs with an incomplete entry are left out);
  - a `curated.ddinter_drug` row exists only for an entry whose full pair list was stored at least once (the API's "checked" rule, §7.4).

- [ ] **Step 1: Give every test fake an `interact_with` and write the failing tests**

In `etl/tests/test_stage_ddinter.py`:

Change the client import to

```python
from bddrug_etl.ddinter.client import DDInterPairRow, InteractWithList, InteractWithRow, severity
```

Extend `FakeDDInter.__init__`'s signature and body:

```python
    def __init__(self, extra_drugs=None, fail=None, one_sided=None, graph_extra=None, interact_extra=None,
                 incomplete=None):
```

and after `self.graph_extra = graph_extra or {}  # …` add

```python
        self.interact_extra = interact_extra or {}  # id -> rows only interact-with lists: (partner_id, name, level)
        self.incomplete = set(incomplete or ())     # ids whose interact-with list cannot be read in full
        self.interact_calls = []
```

Add this method to `FakeDDInter` (after `graph`):

```python
    def interact_with(self, ddinter_id):
        """The graph's partners (same severity) plus ``interact_extra``; incomplete for ids in ``incomplete``."""
        self.interact_calls.append(ddinter_id)
        self._boom("interact_with", ddinter_id)
        if ddinter_id in self.incomplete:
            return InteractWithList((), False)
        rows = [InteractWithRow(p, n, INTERACTION_ID.get(frozenset((ddinter_id, p)), "0"), sev)
                for p, n, sev, _ in GRAPH.get(ddinter_id, []) + self.graph_extra.get(ddinter_id, [])]
        rows += [InteractWithRow(p, n, "0", severity(level)) for p, n, level in self.interact_extra.get(ddinter_id, [])]
        return InteractWithList(tuple(rows), True)
```

Append the tests:

```python
# --- pair-list reconciliation (spec §8.1 item 5) ----------------------------------------------------


def test_graph_and_interact_with_partner_sets_reconciled(conn):
    client = FakeDDInter(interact_extra={"DDInter1951": [("DDInter777", "Extradrug", 1), ("DDInter778", "Nolevel", None)]})
    [r] = map_and_load_ddinter(conn, client, ["warf"])
    assert r.status == "ok" and r.evidence["pair_count"] == 5   # 3 graph partners + 2 only in interact-with
    assert conn.execute(
        """SELECT ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b FROM curated.ddinter_pair
            WHERE ddinter_b IN ('DDInter777', 'DDInter778') ORDER BY ddinter_b""").fetchall() == [
        ("DDInter1951", "DDInter777", "minor", [], "Warfarin", "Extradrug"),
        ("DDInter1951", "DDInter778", "unknown", [], "Warfarin", "Nolevel")]
    # a partner the graph lists keeps the graph's severity and actions
    assert conn.execute("SELECT severity, actions FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1951' "
                        "AND ddinter_b = 'DDInter20'").fetchone() == ("major", ["synergy"])
    # spec §11.3: an incomplete interact-with read fails the stage and writes no ddinter_drug row
    [r_clar] = map_and_load_ddinter(conn, FakeDDInter(incomplete={"DDInter393"}), ["clar"])
    assert (r_clar.status, r_clar.note) == ("fail", "DDInter pair list incomplete for DDInter393")
    assert conn.execute("SELECT count(*) FROM curated.ddinter_drug WHERE ddinter_id = 'DDInter393'").fetchone()[0] == 0


def test_an_interact_with_only_row_never_overwrites_a_graph_row(conn):
    """Warfarin's graph lists metformin with actions; metformin's graph does not list warfarin, but its interact-with
    does, at another level. The graph row wins whatever the order, and the extra row reports no change."""
    one_sided = {"DDInter1951": [("DDInter1164", "Metformin", "moderate", (S,))]}
    map_and_load_ddinter(conn, FakeDDInter(graph_extra=one_sided), ["warf"])
    stored = "SELECT severity, actions FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1164' AND ddinter_b = 'DDInter1951'"
    assert conn.execute(stored).fetchone() == ("moderate", ["synergy"])
    metf_only = FakeDDInter(interact_extra={"DDInter1164": [("DDInter1951", "Warfarin", 1)]})   # level 1 = minor
    changes = SharedChanges()
    [r] = map_and_load_ddinter(conn, metf_only, ["metf"], changes)
    assert r.status in ("ok", "warn")
    assert conn.execute(stored).fetchone() == ("moderate", ["synergy"])
    # the pair was not changed, so warfarin's products are not re-opened (no shared_change snapshot)
    assert "DDInter1951" not in changes.ddinter_ids
    again = SharedChanges()
    map_and_load_ddinter(conn, metf_only, ["metf"], again)
    assert again == SharedChanges()


def test_an_incomplete_entry_writes_no_pair_rows_even_from_a_complete_partner(conn):
    res = dict(zip(["warf", "asa"], map_and_load_ddinter(conn, FakeDDInter(incomplete={"DDInter1951"}), ["warf", "asa"])))
    assert res["warf"].status == "fail"
    assert res["asa"].status != "fail"
    assert conn.execute("SELECT count(*) FROM curated.ddinter_pair "
                        "WHERE 'DDInter1951' IN (ddinter_a, ddinter_b)").fetchone()[0] == 0


def test_a_failing_lookup_on_an_incomplete_entry_does_not_fail_another_product(conn):
    """The interact-with read of an incomplete entry is not memoised by the client, so a text lookup through it would
    raise again; no product may look up a text through an entry that is incomplete in this run."""
    client = FakeDDInter(incomplete={"DDInter1951"},
                         fail={("pair_interaction_id", ("DDInter1951", "DDInter20")): RuntimeError("page 3 failed")})
    r_warf, r_asa = map_and_load_ddinter(conn, client, ["warf", "asa"])
    assert (r_warf.status, r_warf.note) == ("fail", "DDInter pair list incomplete for DDInter1951")
    assert r_asa.status != "fail", r_asa
    assert ("DDInter1951", "DDInter20") not in client.pair_calls


def test_incomplete_interact_with_fails_the_products_that_chose_it(conn):
    [r] = map_and_load_ddinter(conn, FakeDDInter(incomplete={"DDInter1951"}), ["warf"])
    assert (r.status, r.note) == ("fail", "DDInter pair list incomplete for DDInter1951")
    assert conn.execute("SELECT count(*) FROM curated.ddinter_drug WHERE ddinter_id = 'DDInter1951'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM curated.ddinter_pair "
                        "WHERE 'DDInter1951' IN (ddinter_a, ddinter_b)").fetchone()[0] == 0
    # the substance mapping is still written (a shared fact); with no ddinter_drug row the API never counts it checked
    assert ddinter_codes(conn, WARF)[0][0] == "DDInter1951"


def test_an_earlier_complete_list_stays_when_a_later_read_is_incomplete(conn):
    map_and_load_ddinter(conn, FakeDDInter(), ["warf"])
    conn.commit()
    pairs_before = conn.execute("SELECT count(*) FROM curated.ddinter_pair").fetchone()[0]
    [r] = map_and_load_ddinter(conn, FakeDDInter(incomplete={"DDInter1951"}), ["warf"])
    assert r.status == "fail"
    assert conn.execute("SELECT count(*) FROM curated.ddinter_drug WHERE ddinter_id = 'DDInter1951'").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM curated.ddinter_pair").fetchone()[0] == pairs_before


def test_an_incomplete_entry_the_product_did_not_choose_does_not_fail_it(conn):
    [r] = map_and_load_ddinter(conn, FakeDDInter(incomplete={"DDInter351"}), ["chlor_eye"])
    assert (r.status, r.note) == ("ok", "")
    assert conn.execute("SELECT ddinter_id FROM curated.ddinter_drug ORDER BY ddinter_id").fetchall() == [
        ("DDInter352",), ("DDInter353",)]


def test_ddinter352_pair_list_is_stored_without_text_fetches(conn):
    """Regression fixture (spec §11.3): DDInter352 has 112 pairs (1 major, 111 moderate) and no pilot partner."""
    eye = [(f"DDInter{5000 + i}", f"Partner {i}", "major" if i == 0 else "moderate", ()) for i in range(112)]
    client = FakeDDInter(graph_extra={"DDInter352": eye})
    r_eye = map_and_load_ddinter(conn, client, ["chlor_eye", "warf", "asa"])[0]
    assert (r_eye.status, r_eye.note) == ("ok", "")
    assert r_eye.evidence["pair_count"] == 112 and r_eye.evidence["text_fetch_count"] == 0
    assert conn.execute("""SELECT count(*), count(*) FILTER (WHERE severity = 'major') FROM curated.ddinter_pair
                            WHERE 'DDInter352' IN (ddinter_a, ddinter_b)""").fetchone() == (112, 1)
    assert not any("DDInter352" in call for call in client.pair_calls)
```

In `etl/tests/test_run_pipeline.py`, change the client import to

```python
from bddrug_etl.ddinter.client import DDInterClient, DDInterPairRow, InteractWithList, InteractWithRow
```

and add to its `FakeDDInter` (after `graph`):

```python
    def interact_with(self, ddinter_id):
        return InteractWithList(tuple(InteractWithRow(r.partner_id, r.partner_name, "50001", r.severity)
                                      for r in self.graph(ddinter_id)), True)
```

In `etl/tests/test_pipeline_scale.py`, add `InteractWithList, InteractWithRow` to its `from bddrug_etl.ddinter.client import …` line and add to its `FakeDDInter` (after `graph`):

```python
    def interact_with(self, ddinter_id):
        return InteractWithList(tuple(InteractWithRow(r.partner_id, r.partner_name, "0", r.severity)
                                      for r in self.graph(ddinter_id)), True)
```

In `etl/tests/test_shared_reopen.py`, change `from bddrug_etl.ddinter.client import DDInterPairRow` to `from bddrug_etl.ddinter.client import DDInterPairRow, InteractWithList, InteractWithRow` and add to its `FakeDDInter` (after `graph`):

```python
    def interact_with(self, ddinter_id):
        return InteractWithList(tuple(InteractWithRow(r.partner_id, r.partner_name, "0", r.severity)
                                      for r in self.graph(ddinter_id)), True)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest etl/tests/test_stage_ddinter.py -v -k "reconciled or incomplete or ddinter352 or overwrites or failing_lookup"`
Expected: FAIL — `test_graph_and_interact_with_partner_sets_reconciled` (`pair_count` 3 != 5); the incomplete tests (status `ok` or `warn` instead of `fail`, or a `ddinter_drug` or pair row present); `test_a_failing_lookup_on_an_incomplete_entry_does_not_fail_another_product` (warf is `('fail', 'error: RuntimeError: page 3 failed')`, not the incomplete note). Two tests pass already, and that is expected: `test_ddinter352_…` pins the graph path, and `test_an_interact_with_only_row_never_overwrites_a_graph_row` pins that the union added in Step 3 never overwrites a graph row (an upsert of the extra row would fail it with `('minor', []) != ('moderate', ['synergy'])`).

- [ ] **Step 3: Implement**

In `etl/src/bddrug_etl/stages/ddinter.py`:

Change the client import line `from bddrug_etl.ddinter.client import DDInterClient` to

```python
from bddrug_etl.ddinter.client import DDInterClient, InteractWithList
```

After `NONE_NOTE = …` add:

```python
INCOMPLETE_NOTE = "DDInter pair list incomplete for {}"
```

After the `_Pending` dataclass add:

```python
PairData = tuple[str, str, str, list[str]]  # (name_a, name_b, severity, actions)


@dataclass(frozen=True)
class _PairList:
    """An entry's full pair list (§8.1 item 5).

    ``graph``: rows of the graph endpoint; they carry actions and are upserted. ``extra``: partners only
    ``interact-with`` lists; they are inserted with no actions and never overwrite a stored row, because the partner's
    own graph may hold that pair with actions (DDInter's lists are not symmetric). So the stored row, and the "changed"
    report that re-opens approved records, do not depend on the order in which entries are processed."""
    graph: dict[Pair, PairData]
    extra: dict[Pair, PairData]

    def all(self) -> dict[Pair, PairData]:
        return {**self.extra, **self.graph}
```

In `_Run.__init__`, after `self._graph: dict[...] = {}` add:

```python
        self.incomplete: set[str] = set()  # candidate entries whose interact-with list was not read in full
        self._listings: dict[str, InteractWithList] = {}
        self._pair_lists: dict[str, _PairList | None] = {}
```

Add these two methods to `_Run`, directly after `pairs`:

```python
    def listing(self, ddinter_id: str) -> InteractWithList:
        """The entry's interact-with list, read once per run (the client never raises for an HTTP or shape problem)."""
        if ddinter_id not in self._listings:
            self._listings[ddinter_id] = self.client.interact_with(ddinter_id)
        return self._listings[ddinter_id]

    def pair_list(self, ddinter_id: str) -> _PairList | None:
        """The entry's full pair list (§8.1 item 5): every graph pair, plus each interact-with partner the graph lacks
        (its ``drug_name``, its level's severity, no actions). None when interact-with could not be read in full.

        Pairs with an entry in ``incomplete`` are left out: no pair row of an incomplete entry is written in this run,
        not even from its partner's complete list, and no text is looked up through it (its read would fail again)."""
        if ddinter_id not in self._pair_lists:
            listed = self.listing(ddinter_id)
            if ddinter_id in self.incomplete or not listed.complete:
                self._pair_lists[ddinter_id] = None
            else:
                skip = lambda pair: pair[0] in self.incomplete or pair[1] in self.incomplete  # noqa: E731
                all_graph = self.pairs(ddinter_id)
                graph = {p: v for p, v in all_graph.items() if not skip(p)}
                me = self.detail(ddinter_id).name
                extra: dict[Pair, PairData] = {}
                for row in listed.rows:
                    if row.partner_id == ddinter_id:
                        continue
                    pair = (ddinter_id, row.partner_id) if ddinter_id < row.partner_id else (row.partner_id, ddinter_id)
                    if pair in all_graph or skip(pair):
                        continue
                    sev = row.severity if row.severity in _SEVERITIES else "unknown"
                    extra.setdefault(pair, (me, row.partner_name, sev, []) if pair[0] == ddinter_id
                                     else (row.partner_name, me, sev, []))
                self._pair_lists[ddinter_id] = _PairList(graph, extra)
        return self._pair_lists[ddinter_id]
```

Change `_store_id_data`'s signature and its pair rows. Replace

```python
def _store_id_data(conn, run: _Run, ddinter_id: str) -> set[str]:
    """Pairs, diseases and foods of one mapped DDInter drug (idempotent upserts; an identical row is not
    rewritten). Returns the DDInter ids whose rows were inserted or changed: both sides of a changed pair."""
```

with

```python
def _store_id_data(conn, run: _Run, ddinter_id: str, pair_list: _PairList | None) -> set[str]:
    """Pairs, diseases and foods of one mapped DDInter drug (idempotent upserts; an identical row is not
    rewritten). ``pair_list`` None (incomplete) writes no pair row; its ``extra`` pairs are inserted only where no row
    exists. Returns the DDInter ids whose rows were inserted or changed: both sides of a changed pair."""
```

In its body, replace the pair rows argument

```python
            [(a, b, sev, actions, na, nb) for (a, b), (na, nb, sev, actions) in run.pairs(ddinter_id).items()],
        )
```

with

```python
            [] if pair_list is None else
            [(a, b, sev, actions, na, nb) for (a, b), (na, nb, sev, actions) in pair_list.graph.items()],
        )
        # interact-with-only partners: never overwrite a row a graph wrote, and an existing row is not "changed"
        pairs += _upsert_many(
            cur,
            """INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (ddinter_a, ddinter_b) DO NOTHING
               RETURNING ddinter_a, ddinter_b""",
            [] if pair_list is None else
            [(a, b, sev, actions, na, nb) for (a, b), (na, nb, sev, actions) in pair_list.extra.items()],
        )
```

In `_process` replace

```python
            if _upsert_drug(conn, d, e.route_scope):
                pending.changed.ddinter_ids.add(e.ddinter_id)
```

with

```python
            # the drug row means "this entry's full pair list is stored": written only from a complete list
            if run.pair_list(e.ddinter_id) is not None and _upsert_drug(conn, d, e.route_scope):
                pending.changed.ddinter_ids.add(e.ddinter_id)
```

In `_process` replace

```python
        if ddinter_id not in run.stored_ids:
            pending.changed.ddinter_ids |= _store_id_data(conn, run, ddinter_id)
            pending.ids.add(ddinter_id)
        mine = run.pairs(ddinter_id)
```

with

```python
        listed = run.pair_list(ddinter_id)
        if ddinter_id not in run.stored_ids:
            pending.changed.ddinter_ids |= _store_id_data(conn, run, ddinter_id, listed)
            pending.ids.add(ddinter_id)
        mine = listed.all() if listed is not None else {}
```

In `_process`'s text loop replace

```python
            if other in run.scope_ids:
```

with

```python
            # (pair_list already leaves out pairs with an incomplete entry; the second test keeps that explicit)
            if other in run.scope_ids and other not in run.incomplete:
```

In `_process` replace the final

```python
    return StageResult(cid, "warn" if notes else "ok", "; ".join(notes), evidence)
```

with

```python
    incomplete = sorted((i for i in chosen_ids if run.pair_list(i) is None), key=_idkey)
    if incomplete:
        # "No interaction listed" must never come from a partial list: the product cannot be approved (§7.2 step 5)
        return StageResult(cid, "fail", "; ".join(INCOMPLETE_NOTE.format(i) for i in incomplete), evidence)
    return StageResult(cid, "warn" if notes else "ok", "; ".join(notes), evidence)
```

In `plan_ddinter` (as Task 3 left it), replace

```python
    for plan in plans.values():
        if isinstance(plan, _ProductPlan):
            for sub in plan.subs:
                entries = run.candidates(sub.keys)
                run.scope_ids.update(e.ddinter_id for e in entries)
                run.scope_chosen.update(e.ddinter_id for e in choose(entries, plan.route)[0])
    return DDInterPlan(run, plans)
```

with

```python
    candidate_ids: set[str] = set()
    for plan in plans.values():
        if isinstance(plan, _ProductPlan):
            for sub in plan.subs:
                entries = run.candidates(sub.keys)
                candidate_ids.update(e.ddinter_id for e in entries)
                run.scope_ids.update(e.ddinter_id for e in entries)
                run.scope_chosen.update(e.ddinter_id for e in choose(entries, plan.route)[0])
    # §8.1 item 5: read every candidate's interact-with list now (memoised; no detail or graph read), so an incomplete
    # entry is known before any product writes a pair row that touches it
    run.incomplete = {i for i in sorted(candidate_ids, key=_idkey) if not run.listing(i).complete}
    return DDInterPlan(run, plans)
```

(Only the interact-with list is read at planning time. Detail and graph reads stay in the per-product savepoints, so a client error on one entry still fails only its product, as `test_a_crash_at_product_7_keeps_committed_chunks_and_fails_the_rest` requires.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest etl/tests/test_stage_ddinter.py etl/tests/test_run_pipeline.py etl/tests/test_pipeline_scale.py etl/tests/test_shared_reopen.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add etl/src/bddrug_etl/stages/ddinter.py etl/tests/test_stage_ddinter.py etl/tests/test_run_pipeline.py \
  etl/tests/test_pipeline_scale.py etl/tests/test_shared_reopen.py
git commit -m "feat(etl): store the union of the DDInter graph and interact-with; fail on an incomplete list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ETL — a snapshot on every stamp, one `run_id` per invocation, and the removed-item rule

Implements §8.1 items 4 and 6, D40, and Review Focus 3 and 4.

**Files:**
- Create: `etl/src/bddrug_etl/load/snapshots.py`
- Modify: `etl/src/bddrug_etl/load/batches.py`
- Modify: `etl/src/bddrug_etl/jobs/run_pipeline.py`
- Create: `etl/tests/test_snapshots.py`
- Modify: `etl/tests/test_batches.py`, `etl/tests/test_run_pipeline.py`, `etl/tests/test_shared_reopen.py`

**Interfaces:**
- Consumes: V6 tables (Task 1); `choose(entries, route)` (Task 3).
- Produces (P1B's history and `/diff` read these):
  - `write_snapshots(conn, items: list[tuple[str, str]], run_id: uuid.UUID, *, shared: bool = False) -> int` in `bddrug_etl.load.snapshots` — one row per stamped item at its current `extracted_at`; reason `shared_change` when `shared`, else `run` for the item's first snapshot and `rerun` after; items with no stamp are skipped;
  - `build_payload(conn, batch_id, concept_id, extracted_at) -> dict`, payload version 1:

    ```
    {"version": 1, "extracted_at": "<ISO-8601 with offset>",
     "brand": {"dar_number", "trade_name", "company", "dosage_form", "generic_content_raw"} | null,
     "clinical_drug": {"bdc_id", "display_name", "dose_form", "route"} | null,
     "ingredients": [{"xm_code", "name", "bds_id" | null, "substance" | null,
                      "strength": {"raw", "value", "unit", "per_value", "per_unit"} | null,   # numbers as strings
                      "codes": [{"system", "code", "route_scope"}], "ddinter_chosen": ["DDInter…"], "route_assumed": bool}],
     "stages": {"dgda" | "substances" | "clinical" | "ddinter": {"status", "note"}}}
    ```

  - `run_batch(conn, client, batch_id, concept_ids, run_id=None)`, `run_batch_items(conn, client, batch_id, concept_ids, run_id=None)`, `reopen_review(conn, batch_id, concept_ids, changes=None, run_id=None)` (all keep their old positional arguments; `None` means a fresh `uuid4`);
  - `run_pipeline(conn, clients, batch_id, ids, stages=STAGES, *, subset=False, ddinter_chunk=DDINTER_CHUNK, run_id=None)`; `main()` creates one `run_id` per invocation and logs `batch=<id> run_id=<uuid>` at start;
  - `_upsert_batch` deletes an item that left the batch file only when it has no decision **and** no snapshot.

- [ ] **Step 1: Write the failing snapshot module tests**

Create `etl/tests/test_snapshots.py`:

```python
"""Item snapshots (spec §7.6, §8.1 item 4): one per stamp, grouped by run_id, payload for the API diff."""
import pathlib
import uuid

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.load.snapshots import write_snapshots

ROOT = pathlib.Path(__file__).resolve().parents[2]
CID = "127-0163-052--chloramphenicol"
SEED = """
INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000001', 'Chloramphenicol');
INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
 ('BDS-000001', 'ICD11_XM', 'XM7HA7', 'any', 'dgda-ocl', 'xm', 1.0),
 ('BDS-000001', 'DDINTER', 'DDInter351', 'systemic', 'ddinter2', 'drugbank', 1.0),
 ('BDS-000001', 'DDINTER', 'DDInter352', 'ophthalmic', 'ddinter2', 'drugbank', 1.0);
INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES
 ('BDC-000001', 'eye drops|ophthalmic|BDS-000001:0.5%/', 'Chloramphenicol 0.5% eye drops', 'Eye Drops', 'ophthalmic');
INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text)
 VALUES ('BDC-000001', 'BDS-000001', 0.50, '%', NULL, NULL, 'Chloramphenicol 0.5%');
INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id)
 VALUES ('127-0163-052--chloramphenicol', '127-0163-052', 'Chloramphenicol', 'ইডিসিএল', 'Eye Drops',
         'Chloramphenicol 5 mg/ml', 'BDC-000001');
INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
 VALUES ('127-0163-052--chloramphenicol', 'XM7HA7', 'Chloramphenicol');
INSERT INTO ops.batch (batch_id, item_count) VALUES ('0700-snap', 2);
INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
 ('0700-snap', 'DGDA-Drugs', '127-0163-052--chloramphenicol', now()), ('0700-snap', 'DGDA-Drugs', 'no-stamp', NULL);
INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
 ('0700-snap', '127-0163-052--chloramphenicol', 'ddinter', 'ok', ''),
 ('0700-snap', '127-0163-052--chloramphenicol', 'dgda', 'ok', '');
"""


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql"), key=lambda f: int(f.name[1:].split("__")[0])):
                c.execute(f.read_text())
            c.execute(SEED)
            c.commit()
            yield c


def stamp(conn):
    conn.execute("UPDATE ops.batch_item SET extracted_at = clock_timestamp() "
                 "WHERE batch_id = '0700-snap' AND concept_id = %s", (CID,))


def test_payload_holds_the_fields_the_api_diff_reads(conn):
    """Review Focus 3: a NUMERIC strength and a Bengali company name serialise and round-trip unchanged."""
    run_id = uuid.uuid4()
    assert write_snapshots(conn, [("0700-snap", CID)], run_id) == 1
    reason, rid, payload, at = conn.execute(
        "SELECT reason, run_id, payload, extracted_at FROM ops.item_snapshot WHERE concept_id = %s", (CID,)).fetchone()
    assert (reason, rid) == ("run", run_id)
    assert payload["version"] == 1 and payload["extracted_at"] == at.isoformat()
    assert payload["brand"] == {"dar_number": "127-0163-052", "trade_name": "Chloramphenicol", "company": "ইডিসিএল",
                                "dosage_form": "Eye Drops", "generic_content_raw": "Chloramphenicol 5 mg/ml"}
    assert payload["clinical_drug"] == {"bdc_id": "BDC-000001", "display_name": "Chloramphenicol 0.5% eye drops",
                                        "dose_form": "Eye Drops", "route": "ophthalmic"}
    [ing] = payload["ingredients"]
    assert (ing["xm_code"], ing["name"], ing["bds_id"], ing["substance"]) == (
        "XM7HA7", "Chloramphenicol", "BDS-000001", "Chloramphenicol")
    assert ing["strength"] == {"raw": "Chloramphenicol 0.5%", "value": "0.5", "unit": "%", "per_value": None,
                               "per_unit": None}
    assert ing["ddinter_chosen"] == ["DDInter352"] and ing["route_assumed"] is False
    assert {"system": "DDINTER", "code": "DDInter351", "route_scope": "systemic"} in ing["codes"]
    assert payload["stages"] == {"dgda": {"status": "ok", "note": ""}, "ddinter": {"status": "ok", "note": ""}}
    conn.rollback()


def test_reasons_run_then_rerun_then_shared_change(conn):
    run1, run2 = uuid.uuid4(), uuid.uuid4()
    write_snapshots(conn, [("0700-snap", CID)], run1)
    stamp(conn)
    write_snapshots(conn, [("0700-snap", CID)], run1)
    stamp(conn)
    write_snapshots(conn, [("0700-snap", CID)], run2, shared=True)
    assert conn.execute("SELECT reason, run_id FROM ops.item_snapshot WHERE concept_id = %s ORDER BY extracted_at",
                        (CID,)).fetchall() == [("run", run1), ("rerun", run1), ("shared_change", run2)]
    conn.rollback()


def test_items_without_a_stamp_and_unknown_items_are_skipped(conn):
    assert write_snapshots(conn, [("0700-snap", "no-stamp"), ("0700-snap", "not-an-item")], uuid.uuid4()) == 0
    conn.rollback()
```

- [ ] **Step 2: Write the failing batch and pipeline tests**

In `etl/tests/test_batches.py` replace the test `test_removed_item_without_decisions_is_deleted_with_its_stage_results` with:

```python
def test_removed_item_without_decisions_or_snapshots_is_deleted_with_its_stage_results(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0009-removed", [FIX["id"]])
    # an item from before V6: no snapshot and no decision
    conn.execute("INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) "
                 "VALUES ('0009-removed', 'DGDA-Drugs', 'gone-5', now())")
    conn.execute("INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) "
                 "VALUES ('0009-removed', 'gone-5', 'dgda', 'fail', 'not found at source')")
    conn.commit()
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0009-removed", [FIX["id"]])
    assert items(conn, "0009-removed") == {FIX["id"]: ("pending", None)}
    assert stage_rows(conn, "0009-removed") == {FIX["id"]: ("ok", "")}
```

and append:

```python
def snapshot_reasons(conn, batch_id, cid):
    return [r for (r,) in conn.execute(
        "SELECT reason FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s ORDER BY extracted_at",
        (batch_id, cid)).fetchall()]


def test_run_batch_writes_one_snapshot_per_item(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0012-snap", [FIX["id"], "gone-7"])
    assert snapshot_reasons(conn, "0012-snap", FIX["id"]) == ["run"]
    assert snapshot_reasons(conn, "0012-snap", "gone-7") == ["run"]
    payload = conn.execute("SELECT payload FROM ops.item_snapshot WHERE batch_id = '0012-snap' AND concept_id = %s",
                           (FIX["id"],)).fetchone()[0]
    assert payload["brand"]["trade_name"] == "Tericin"
    assert payload["stages"] == {"dgda": {"status": "ok", "note": ""}}


def test_removed_item_with_snapshot_is_kept_and_marked(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0013-snapkept", [FIX["id"], "gone-8"])   # gone-8 gets a snapshot
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0013-snapkept", [FIX["id"]])             # must not fail on the FK
    assert items(conn, "0013-snapkept") == {FIX["id"]: ("pending", None), "gone-8": ("issue", "removed from batch file")}
    assert snapshot_reasons(conn, "0013-snapkept", "gone-8") == ["run"]


def test_removed_item_readded_to_the_file_is_restamped_with_a_rerun_snapshot(conn):
    """Review Focus 4: removed, then back in a later run."""
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0014-back", [FIX["id"], "gone-9"])
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0014-back", [FIX["id"]])
    assert items(conn, "0014-back")["gone-9"] == ("issue", "removed from batch file")
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0014-back", [FIX["id"], "gone-9"])
    assert items(conn, "0014-back")["gone-9"] == ("issue", "not found at source")
    assert snapshot_reasons(conn, "0014-back", "gone-9") == ["run", "rerun"]
    assert snapshot_reasons(conn, "0014-back", FIX["id"]) == ["run", "rerun", "rerun"]
```

In `etl/tests/test_run_pipeline.py` append:

```python
def test_snapshot_written_on_stamp_with_one_run_id_per_invocation(url, tmp_path):
    f = batch_file(tmp_path, "0120-snapshots", [WARF, MISSING])
    assert Harness(url).main("--batch", f) == 0
    rows = q(url, """SELECT concept_id, reason, run_id, extracted_at, payload FROM ops.item_snapshot
                     WHERE batch_id = '0120-snapshots' ORDER BY concept_id, extracted_at""")
    warf = [r for r in rows if r[0] == WARF]
    assert [r[1] for r in warf] == ["run", "rerun", "rerun", "rerun"]   # dgda, substances, clinical, ddinter
    assert [r[1] for r in rows if r[0] == MISSING] == ["run"]          # only the dgda stage stamps it
    assert len({r[2] for r in rows}) == 1                              # one run_id for the whole invocation
    current = q(url, "SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0120-snapshots' AND concept_id = %s",
                (WARF,))[0][0]
    assert warf[-1][3] == current
    payload = warf[-1][4]
    assert payload["brand"]["trade_name"] == WARF
    assert payload["clinical_drug"]["route"] == "systemic"
    assert payload["ingredients"][0]["ddinter_chosen"] == ["DDInter1951"]
    assert set(payload["stages"]) == {"dgda", "substances", "clinical", "ddinter"}

    first_run = warf[0][2]
    assert Harness(url).main("--batch", f, "--stages", "ddinter") == 0
    again = q(url, """SELECT reason, run_id FROM ops.item_snapshot WHERE batch_id = '0120-snapshots'
                      AND concept_id = %s ORDER BY extracted_at""", (WARF,))
    assert len(again) == 5 and again[-1][0] == "rerun" and again[-1][1] != first_run
```

In `etl/tests/test_shared_reopen.py`, in the `clean` fixture, insert these lines as the first statements inside `with psycopg.connect(url) as c:` (before the `for t in (...)` loop that deletes `ops.batch_item`):

```python
        # V6 snapshots are append-only and hold a foreign key to ops.batch_item. Only this throwaway test database
        # switches the trigger off to start each test empty; no application code ever does.
        c.execute("ALTER TABLE ops.item_snapshot DISABLE TRIGGER item_snapshot_append_only")
        c.execute("DELETE FROM ops.item_snapshot")
        c.execute("ALTER TABLE ops.item_snapshot ENABLE TRIGGER item_snapshot_append_only")
```

and append:

```python
def test_a_shared_change_writes_a_shared_change_snapshot_with_the_run_id_of_the_run_that_caused_it(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0310-a", [X]) == 0
    approve(url, "0310-a", X)
    h = Harness(url, dd, concepts(y_content="Shared-alias 5 mg"))   # a new dgda_content name for the shared substance
    assert run(h, tmp_path, "0310-b", [Y], "--stages", "dgda,substances") == 0
    reason, run_id = q(url, """SELECT reason, run_id FROM ops.item_snapshot WHERE batch_id = '0310-a' AND concept_id = %s
                               ORDER BY extracted_at DESC LIMIT 1""", (X,))[0]
    y_runs = {r for (r,) in q(url, "SELECT run_id FROM ops.item_snapshot WHERE batch_id = '0310-b' AND concept_id = %s", (Y,))}
    assert reason == "shared_change"
    assert y_runs == {run_id}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `python -m pytest etl/tests/test_snapshots.py etl/tests/test_batches.py etl/tests/test_run_pipeline.py etl/tests/test_shared_reopen.py -q`
Expected: FAIL — `test_snapshots.py` has a collection error (`ModuleNotFoundError: No module named 'bddrug_etl.load.snapshots'`); the new batch and pipeline tests fail with empty snapshot lists (`[] == ['run']`).

- [ ] **Step 4: Write the snapshot module**

Create `etl/src/bddrug_etl/load/snapshots.py`:

```python
"""Item snapshots (V6 ``ops.item_snapshot``; spec §7.6, §8.1 item 4).

Every code path that stamps ``ops.batch_item.extracted_at`` writes one snapshot per stamped item, in the same
transaction, after that stage's results are written. A snapshot records the run stamp, the run it belongs to
(``run_id``: one per ETL invocation, so the up to four stamps of one run share it) and a payload with the fields the
API's "See what changed" compares. The table is append-only (V6 triggers): nothing here updates or deletes a row.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import NamedTuple

import psycopg
from psycopg.types.json import Jsonb

from bddrug_etl.stages.ddinter import choose

PAYLOAD_VERSION = 1
STAGES = ("dgda", "substances", "clinical", "ddinter")


class _Code(NamedTuple):
    ddinter_id: str
    route_scope: str


def _num(value: Decimal | None) -> str | None:
    """A NUMERIC as plain text ("0.5", "500"): JSON has no Decimal, and floats would round."""
    return None if value is None else format(value.normalize(), "f")


def build_payload(conn: psycopg.Connection, batch_id: str, concept_id: str, extracted_at: datetime) -> dict:
    """The record as it stands now: brand, clinical drug, ingredients with codes and chosen DDInter entries, stages."""
    brand = conn.execute(
        """SELECT dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id
             FROM curated.brand_product WHERE concept_id = %s""", (concept_id,)).fetchone()
    bdc_id = brand[5] if brand else None
    clinical, route = None, None
    if bdc_id:
        row = conn.execute("SELECT bdc_id, display_name, dose_form, route FROM curated.clinical_drug WHERE bdc_id = %s",
                           (bdc_id,)).fetchone()
        if row:
            clinical = {"bdc_id": row[0], "display_name": row[1], "dose_form": row[2], "route": row[3]}
            route = row[3]
    ingredients = []
    for xm_code, name, bds_id, substance in conn.execute(
            """SELECT bpi.xm_code, bpi.ingredient_name, xm.bds_id, s.preferred_name
                 FROM curated.brand_product_ingredient bpi
                 LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                 LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                WHERE bpi.concept_id = %s ORDER BY bpi.xm_code""", (concept_id,)).fetchall():
        codes: list[dict] = []
        strength = None
        chosen: list[str] = []
        assumed = False
        if bds_id:
            codes = [{"system": s, "code": c, "route_scope": r} for s, c, r in conn.execute(
                "SELECT system, code, route_scope FROM curated.substance_code WHERE bds_id = %s ORDER BY system, code",
                (bds_id,)).fetchall()]
            picked, assumed = choose([_Code(c["code"], c["route_scope"]) for c in codes if c["system"] == "DDINTER"],
                                     route)
            chosen = [p.ddinter_id for p in picked]
            if bdc_id:
                srow = conn.execute(
                    """SELECT raw_text, strength_value, strength_unit, per_value, per_unit
                         FROM curated.clinical_drug_ingredient WHERE bdc_id = %s AND bds_id = %s""",
                    (bdc_id, bds_id)).fetchone()
                if srow:
                    strength = {"raw": srow[0], "value": _num(srow[1]), "unit": srow[2], "per_value": _num(srow[3]),
                                "per_unit": srow[4]}
        ingredients.append({"xm_code": xm_code, "name": name, "bds_id": bds_id, "substance": substance,
                            "strength": strength, "codes": codes, "ddinter_chosen": chosen,
                            "route_assumed": assumed and bool(chosen)})
    stages = {stage: {"status": status, "note": note} for stage, status, note in conn.execute(
        "SELECT stage, status, note FROM ops.stage_result WHERE batch_id = %s AND concept_id = %s",
        (batch_id, concept_id)).fetchall()}
    return {
        "version": PAYLOAD_VERSION,
        "extracted_at": extracted_at.isoformat(),
        "brand": None if brand is None else {"dar_number": brand[0], "trade_name": brand[1], "company": brand[2],
                                             "dosage_form": brand[3], "generic_content_raw": brand[4]},
        "clinical_drug": clinical,
        "ingredients": ingredients,
        "stages": {s: stages[s] for s in STAGES if s in stages},
    }


def write_snapshots(conn: psycopg.Connection, items: list[tuple[str, str]], run_id: uuid.UUID, *,
                    shared: bool = False) -> int:
    """One snapshot per (batch_id, concept_id) at the item's current ``extracted_at``; returns how many were written.

    Reason: ``shared_change`` when ``shared`` (re-opened because shared substance data changed); otherwise ``run`` for
    the item's first snapshot and ``rerun`` after. Items without a stamp, or unknown, are skipped. The caller commits.
    """
    written = 0
    for batch_id, concept_id in items:
        row = conn.execute(
            """SELECT bi.extracted_at,
                      EXISTS (SELECT 1 FROM ops.item_snapshot s
                               WHERE s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id)
                 FROM ops.batch_item bi WHERE bi.batch_id = %s AND bi.concept_id = %s""",
            (batch_id, concept_id)).fetchone()
        if row is None or row[0] is None:
            continue
        extracted_at, seen = row
        reason = "shared_change" if shared else ("rerun" if seen else "run")
        conn.execute(
            """INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (batch_id, concept_id, extracted_at, run_id, reason,
             Jsonb(build_payload(conn, batch_id, concept_id, extracted_at))))
        written += 1
    return written
```

- [ ] **Step 5: Call it from every stamp and keep removed items with snapshots**

In `etl/src/bddrug_etl/load/batches.py`:

Replace the imports with

```python
"""Batch runs: fetch an explicit list of DGDA concepts, load them, and record per-item review status."""
import pathlib
import uuid

import psycopg

from bddrug_etl.load.products import LoadStats, load_products
from bddrug_etl.load.snapshots import write_snapshots
from bddrug_etl.ocl.transform import concept_to_product
from bddrug_etl.stages.results import SharedChanges, StageResult, write_stage_results
```

In `_upsert_batch`, replace the delete statement

```python
    cur.execute(
        """DELETE FROM ops.batch_item bi
           WHERE bi.batch_id = %s AND NOT (bi.concept_id = ANY(%s))
             AND NOT EXISTS (SELECT 1 FROM ops.review_decision rd
                             WHERE rd.batch_id = bi.batch_id AND rd.concept_id = bi.concept_id)""",
        (batch_id, concept_ids),
    )
```

with

```python
    # §8.1 item 6: a snapshot can never be deleted (append-only, NO ACTION foreign key), so an item that has one is
    # kept and marked removed, like an item with decisions.
    cur.execute(
        """DELETE FROM ops.batch_item bi
           WHERE bi.batch_id = %s AND NOT (bi.concept_id = ANY(%s))
             AND NOT EXISTS (SELECT 1 FROM ops.review_decision rd
                             WHERE rd.batch_id = bi.batch_id AND rd.concept_id = bi.concept_id)
             AND NOT EXISTS (SELECT 1 FROM ops.item_snapshot s
                             WHERE s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id)""",
        (batch_id, concept_ids),
    )
```

and in the `_upsert_batch` docstring, where the sentence is wrapped over two lines, replace these two lines

```python
    with the reason when it could not be loaded). Items no longer in the file are deleted only when
    nobody has reviewed them; the others stay, marked ``removed from batch file``. The batch's stage
```

with

```python
    with the reason when it could not be loaded). Items no longer in the file are deleted only when
    nobody has reviewed them and they have no snapshot; the others stay, marked ``removed from batch
    file``. The batch's stage
```

Replace `reopen_review` with:

```python
def reopen_review(conn: psycopg.Connection, batch_id: str, concept_ids: list[str],
                  changes: SharedChanges | None = None, run_id: uuid.UUID | None = None) -> list[tuple[str, str]]:
    """Stamp ``extracted_at`` and put the items' review back to ``pending`` (Review Focus 3).

    Call it last, inside the same transaction as the curated writes and stage results for ``concept_ids``, so the
    stamp commits (or rolls back) with them. ``clock_timestamp()`` is used rather than ``now()``: a decision
    recorded while that transaction was open saw the old data, so it must be older than the stamp.
    The decision history (``ops.review_decision``) is untouched; the batches go back to ``in_review``.

    ``changes``: the shared rows this transaction changed (``SharedChanges``). Every other product that
    shows them is re-opened too (``_reopen_dependents``) and returned as (batch_id, concept_id) pairs.
    All item rows are locked before any ``ops.batch`` row, the same order as the API's decision
    transaction, so the two cannot deadlock.

    Every stamped item gets a snapshot (V6) with ``run_id`` (one per ETL invocation; a new one when None): the
    targets with reason ``run``/``rerun``, the re-opened dependents with ``shared_change``.
    """
    run_id = run_id or uuid.uuid4()
    if concept_ids:
        conn.execute(
            """UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
               WHERE batch_id = %s AND concept_id = ANY(%s)""",
            (batch_id, concept_ids),
        )
    others = _reopen_dependents(conn, changes, batch_id, concept_ids) if changes else []
    batches = sorted(({batch_id} if concept_ids else set()) | {b for b, _ in others})
    if batches:
        conn.execute("UPDATE ops.batch SET status = 'in_review' WHERE batch_id = ANY(%s)", (batches,))
    write_snapshots(conn, [(batch_id, cid) for cid in concept_ids], run_id)
    write_snapshots(conn, others, run_id, shared=True)
    return others
```

Replace `run_batch` and `run_batch_items` with:

```python
def run_batch(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str],
              run_id: uuid.UUID | None = None) -> LoadStats:
    """Load the batch and record its items, 'dgda' stage results and snapshots in one transaction (committed here).

    Re-running a batch keeps its review history: see ``_upsert_batch``.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        _upsert_batch(cur, batch_id, concept_ids, issues)
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    write_snapshots(conn, [(batch_id, cid) for cid in concept_ids], run_id or uuid.uuid4())
    conn.commit()
    return stats


def run_batch_items(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str],
                    run_id: uuid.UUID | None = None) -> LoadStats:
    """Re-load only ``concept_ids`` of an already loaded batch (single-record re-run), committed here.

    Only these items are touched: they are re-extracted (``_upsert_items``), their stage results are
    cleared and their 'dgda' results and snapshots written, all in one transaction. The other items, the batch's
    ``item_count`` and ``run_at`` stay as they are; the batch goes back to ``in_review``. Never call
    ``run_batch`` with a subset: it would treat every other item as removed from the batch file.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        _upsert_items(cur, batch_id, concept_ids, issues)
        cur.execute("UPDATE ops.batch SET status = 'in_review' WHERE batch_id = %s", (batch_id,))
        cur.execute("DELETE FROM ops.stage_result WHERE batch_id = %s AND concept_id = ANY(%s)",
                    (batch_id, concept_ids))
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    write_snapshots(conn, [(batch_id, cid) for cid in concept_ids], run_id or uuid.uuid4())
    conn.commit()
    return stats
```

In `etl/src/bddrug_etl/jobs/run_pipeline.py`:

Add `import uuid` to the imports (after `import pathlib`).

Append this paragraph to the module docstring, before the closing `"""`:

```
Every invocation has one ``run_id`` (logged at start). Every stamp of ``extracted_at`` writes an ``ops.item_snapshot``
row with it, in the stamping transaction, after that stage's results: so the up to four stamps of one run share one
``run_id``, and a record's history shows one "pipeline re-ran this record" entry per run (spec §5.6.5, §8.1 item 4).
```

Replace `_reopen`, `_run_dgda`, `_run_product_stage` and the `_run_ddinter` signature and its two `_reopen` call sites so `run_id` is passed positionally (a test wraps `reopen_review` with `(conn, b, ids, *rest)`):

```python
def _reopen(conn: psycopg.Connection, stage: str, batch_id: str, ids: list[str], changes: SharedChanges,
            run_id: uuid.UUID) -> None:
    """Re-open ``ids`` and every other product showing a shared row in ``changes`` (last, in the caller's transaction)."""
    others = reopen_review(conn, batch_id, ids, changes, run_id)
    if others:
        log.info("stage %s for batch %s changed shared substance data; re-opened the review of %d other record(s): %s",
                 stage, batch_id, len(others), ", ".join(f"{b}/{c}" for b, c in others))


def _run_dgda(conn: psycopg.Connection, clients: Clients, batch_id: str, ids: list[str],
              subset: bool, run_id: uuid.UUID) -> list[StageResult]:
    # one transaction incl. the 'dgda' results and snapshots; commits itself. A subset never goes through run_batch,
    # which would treat every other item as removed from the batch file.
    (run_batch_items if subset else run_batch)(conn, clients.ocl, batch_id, ids, run_id)
    rows = conn.execute(
        """SELECT concept_id, status, note FROM ops.stage_result
           WHERE batch_id = %s AND stage = 'dgda' AND concept_id = ANY(%s)""", (batch_id, ids)
    ).fetchall()
    conn.commit()
    return [StageResult(cid, status, note) for cid, status, note in rows]


def _run_product_stage(conn: psycopg.Connection, clients: Clients, stage: str, batch_id: str,
                       targets: list[str], skipped: list[StageResult], run_id: uuid.UUID) -> list[StageResult]:
    with conn.transaction():  # the stage's own transaction; its per-product savepoints nest inside
        changes = SharedChanges()
        results = _call_stage(stage, conn, clients, targets, changes)
        write_stage_results(conn, batch_id, stage, results + skipped)
        _reopen(conn, stage, batch_id, targets, changes, run_id)  # last: the approvals covering this data stop counting
    return results + skipped
```

In `_run_ddinter`, change the signature to

```python
def _run_ddinter(conn: psycopg.Connection, clients: Clients, batch_id: str, targets: list[str],
                 skipped: list[StageResult], chunk_size: int, run_id: uuid.UUID) -> list[StageResult]:
```

and its call `_reopen(conn, "ddinter", batch_id, chunk, changes)` to `_reopen(conn, "ddinter", batch_id, chunk, changes, run_id)`.

In `run_pipeline`, change the signature and the three stage calls:

```python
def run_pipeline(conn: psycopg.Connection, clients: Clients, batch_id: str, ids: list[str],
                 stages: tuple[str, ...] = STAGES, *, subset: bool = False,
                 ddinter_chunk: int = DDINTER_CHUNK,
                 run_id: uuid.UUID | None = None) -> tuple[dict[str, list[StageResult]], bool]:
    """Run ``stages`` in canonical order, committing after each one (the DDInter stage after each chunk).

    ``subset``: ``ids`` are some items of an already loaded batch (``--concept``); only they are touched.
    ``run_id``: shared by every snapshot this call writes (a new one when None).
    Returns (results of every stage that ran, True when no stage raised).
    """
    run_id = run_id or uuid.uuid4()
```

(the rest of the body unchanged except these calls)

```python
                done[stage] = _run_dgda(conn, clients, batch_id, ids, subset, run_id)
```

```python
                done[stage] = _run_ddinter(conn, clients, batch_id, targets, skipped, ddinter_chunk, run_id)
            else:
                done[stage] = _run_product_stage(conn, clients, stage, batch_id, targets, skipped, run_id)
```

In `main`, after `batch_id = args.batch.stem` add

```python
    run_id = uuid.uuid4()
    log.info("batch=%s run_id=%s", batch_id, run_id)
```

and change the `run_pipeline(...)` call to pass `run_id=run_id`:

```python
        done, ok = run_pipeline(conn, clients, batch_id, selected or ids, args.stages,
                                subset=bool(selected), ddinter_chunk=args.ddinter_chunk, run_id=run_id)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `python -m pytest etl/tests/test_snapshots.py etl/tests/test_batches.py etl/tests/test_run_pipeline.py etl/tests/test_shared_reopen.py -v`
Expected: all pass.

Run: `python -m pytest etl/tests -q`
Expected: the whole ETL suite passes.

- [ ] **Step 7: Commit**

```bash
git add etl/src/bddrug_etl/load/snapshots.py etl/src/bddrug_etl/load/batches.py etl/src/bddrug_etl/jobs/run_pipeline.py \
  etl/tests/test_snapshots.py etl/tests/test_batches.py etl/tests/test_run_pipeline.py etl/tests/test_shared_reopen.py
git commit -m "feat(etl): snapshot every stamped item with one run_id per invocation; keep removed items with snapshots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: API domain — `displayStatus` and the decision guards as pure rules

Implements §5.2 (D12) and §7.2 steps 2–8 (D11) as pure functions, so the adapter (Task 8a) only loads state and writes. Replaces `ApprovalRuleTest.okAfterIssueNeedsAPharmacist` with the step-6 test, as §7.2 and §11.3 require.

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java` (whole file below)
- Create: `api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java`
- Modify: `api/src/test/java/com/niramoy/bddrug/ApprovalRuleTest.java` (whole file below)
- Create: `api/src/test/java/com/niramoy/bddrug/DecisionGuardTest.java`

**Interfaces:**
- Consumes: `ReviewDecision(long id, String decision, String note, String reviewerEmail, String reviewerRole, Instant decidedAt)`.
- Produces:
  - `ApprovalRule.displayStatus(List<ReviewDecision> decisions, Instant extractedAt, String review) -> String`, one of `"pending" | "approved" | "engineer_checked" | "issue" | "back_in_review"` (constants `ApprovalRule.PENDING`, `APPROVED`, `ENGINEER_CHECKED`, `ISSUE`, `BACK_IN_REVIEW`; also `ENGINEER`, `PHARMACIST`, `OK`);
  - `DecisionGuard.check(DecisionGuard.Item item, DecisionGuard.Attempt attempt) -> Optional<DecisionGuard.Refusal>` with
    `Item(Instant extractedAt, Long lastDecisionId, String review, String note, Map<String,String> stages, String displayStatus)`,
    `Attempt(String decision, String reviewerRole, Instant expectedExtractedAt, Long expectedLastDecisionId)`,
    `Refusal(String field, String message)`; message constants `STALE_RUN`, `OTHER_REVIEWER`, `REMOVED`, `CHECK_FAILED`, `ISSUE_OPEN`, `ALREADY_APPROVED`, `ALREADY_CHECKED` (the §7.2 strings verbatim).

- [ ] **Step 1: Write the failing tests**

Replace `api/src/test/java/com/niramoy/bddrug/ApprovalRuleTest.java` with:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;

class ApprovalRuleTest {
    static final Instant RUN = Instant.parse("2026-10-12T10:00:00Z");
    private long nextId = 1;

    private ReviewDecision d(String decision, String role, int minutesAfterRun) {
        return new ReviewDecision(nextId++, decision, "", "r@example.org", role, RUN.plusSeconds(60L * minutesAfterRun));
    }

    @Test void noDecisionsSinceTheRunLeavesThePipelineValue() {
        assertThat(ApprovalRule.review(List.of(), RUN)).isEmpty();
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", -5)), RUN)).isEmpty();
    }

    @Test void engineerOkAloneDoesNotApprove() {
        assertThat(ApprovalRule.review(List.of(d("ok", "engineer", 1)), RUN)).contains("pending");
    }

    @Test void pharmacistOkApproves() {
        assertThat(ApprovalRule.review(List.of(d("ok", "engineer", 1), d("ok", "pharmacist", 2)), RUN)).contains("ok");
    }

    @Test void issueAfterOkIsIssue() {
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2)), RUN)).contains("issue");
    }

    @Test void decisionsBeforeTheRunDoNotCount() {
        // Review Focus 3: a pharmacist ok before the latest run no longer approves; an engineer ok after it doesn't either.
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", -10), d("ok", "engineer", 1)), RUN)).contains("pending");
        // a decision stamped exactly at the run time saw the old data
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", 0)), RUN)).isEmpty();
        // an issue before the run is forgotten too
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", -10), d("ok", "pharmacist", 1)), RUN)).contains("ok");
    }

    @Test void orderIsByTimeThenIdWhateverTheInputOrder() {
        List<ReviewDecision> list = new ArrayList<>(List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2)));
        java.util.Collections.reverse(list);
        assertThat(ApprovalRule.review(list, RUN)).contains("issue");
        ReviewDecision first = new ReviewDecision(1, "issue", "x", "a@b", "engineer", RUN.plusSeconds(60));
        ReviewDecision second = new ReviewDecision(2, "ok", "", "a@b", "pharmacist", RUN.plusSeconds(60));
        assertThat(ApprovalRule.review(List.of(second, first), RUN)).contains("ok");
    }

    @Test void itemWithoutExtractedAtCountsEveryDecision() {
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", -100)), null)).contains("ok");
        assertThat(ApprovalRule.review(List.of(), null)).isEqualTo(Optional.empty());
    }

    // ---- displayStatus (spec §5.2): five states, in this order of precedence

    @Test void displayStatusIsPendingWithoutDecisions() {
        assertThat(ApprovalRule.displayStatus(List.of(), RUN, "pending")).isEqualTo("pending");
    }

    @Test void displayStatusIsApprovedWhenTheItemIsOk() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", 1)), RUN, "ok")).isEqualTo("approved");
    }

    @Test void displayStatusIsEngineerCheckedForACountedEngineerOkWithNoIssueAfterIt() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", 1)), RUN, "pending")).isEqualTo("engineer_checked");
        // an engineer ok before the run does not count
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", -1)), RUN, "pending")).isEqualTo("pending");
    }

    @Test void displayStatusIsIssueOnlyForACountedIssueDecision() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", 1), d("issue", "pharmacist", 2)), RUN, "issue"))
            .isEqualTo("issue");
        // the pipeline's own issue ("not found at source") has no decision: it is pending, with its failed check
        assertThat(ApprovalRule.displayStatus(List.of(), RUN, "issue")).isEqualTo("pending");
    }

    @Test void displayStatusIsBackInReviewWhenTheRecordWasApprovedBeforeItsLatestExtraction() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", -5)), RUN, "pending")).isEqualTo("back_in_review");
        // an engineer check before the run is not an approval; an issue fixed and re-run returns to pending
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", -5)), RUN, "pending")).isEqualTo("pending");
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", -9), d("issue", "pharmacist", -5)), RUN, "pending"))
            .isEqualTo("pending");
        // without a run stamp nothing is "before" it
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", -5)), null, "pending")).isEqualTo("pending");
    }
}
```

Create `api/src/test/java/com/niramoy/bddrug/DecisionGuardTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.DecisionGuard;
import com.niramoy.bddrug.domain.DecisionGuard.Attempt;
import com.niramoy.bddrug.domain.DecisionGuard.Item;
import com.niramoy.bddrug.domain.DecisionGuard.Refusal;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.2, steps 2 to 8, in order. */
class DecisionGuardTest {
    static final Instant RUN = Instant.parse("2026-10-12T10:00:00Z");
    static final Map<String, String> ALL_RAN = Map.of("dgda", "ok", "substances", "ok", "clinical", "warn", "ddinter", "warn");

    static Item item(String review, String note, Map<String, String> stages, String display) {
        return new Item(RUN, 7L, review, note, stages, display);
    }
    static Item pending() { return item("pending", null, ALL_RAN, "pending"); }
    static Attempt ok(String role) { return new Attempt("ok", role, RUN, 7L); }
    static Attempt issue() { return new Attempt("issue", "pharmacist", RUN, 7L); }
    static Optional<Refusal> refused(String field, String message) { return Optional.of(new Refusal(field, message)); }

    @Test void aCurrentRecordWithEveryCheckRunTakesEitherDecision() {
        assertThat(DecisionGuard.check(pending(), ok("pharmacist"))).isEmpty();
        assertThat(DecisionGuard.check(pending(), ok("engineer"))).isEmpty();
        assertThat(DecisionGuard.check(pending(), issue())).isEmpty();
    }

    @Test void step2AStaleRunStampIsRefusedFirst() {
        Item removedAndFailed = item("issue", "removed from batch file", Map.of(), "issue");
        assertThat(DecisionGuard.check(removedAndFailed, new Attempt("ok", "pharmacist", RUN.minusSeconds(1), 7L)))
            .isEqualTo(refused("extractedAt", DecisionGuard.STALE_RUN));
        // null = null matches; null against a stamp does not
        assertThat(DecisionGuard.check(pending(), new Attempt("issue", "pharmacist", null, 7L)))
            .isEqualTo(refused("extractedAt", DecisionGuard.STALE_RUN));
        assertThat(DecisionGuard.check(new Item(null, 7L, "pending", null, ALL_RAN, "pending"),
                                       new Attempt("issue", "pharmacist", null, 7L))).isEmpty();
    }

    @Test void step3AnotherReviewersDecisionIsRefused() {
        assertThat(DecisionGuard.check(pending(), new Attempt("ok", "pharmacist", RUN, 6L)))
            .isEqualTo(refused("lastDecisionId",
                "Another reviewer decided on this record after the page was loaded; reload it and review again"));
        assertThat(DecisionGuard.check(pending(), new Attempt("issue", "pharmacist", RUN, null)))
            .isEqualTo(refused("lastDecisionId", DecisionGuard.OTHER_REVIEWER));
        assertThat(DecisionGuard.check(new Item(RUN, null, "pending", null, ALL_RAN, "pending"),
                                       new Attempt("ok", "pharmacist", RUN, null))).isEmpty();
    }

    @Test void step4ARemovedRecordRefusesBothDecisions() {
        Item removed = item("pending", "removed from batch file", ALL_RAN, "pending");
        assertThat(DecisionGuard.check(removed, ok("pharmacist")))
            .isEqualTo(refused("conceptId", "This record was removed from the batch file"));
        assertThat(DecisionGuard.check(removed, issue())).isEqualTo(refused("conceptId", DecisionGuard.REMOVED));
    }

    @Test void step5OkNeedsAllFourChecksRunWithoutAFailureAndARunStamp() {
        String failed = "A check failed on this record. It returns to review after the fix and re-run.";
        Map<String, String> missingDdinter = new HashMap<>(ALL_RAN);
        missingDdinter.remove("ddinter");
        Map<String, String> dgdaFailed = new HashMap<>(ALL_RAN);
        dgdaFailed.put("dgda", "fail");
        for (Map<String, String> stages : java.util.List.of(missingDdinter, dgdaFailed, Map.<String, String>of())) {
            assertThat(DecisionGuard.check(item("pending", null, stages, "pending"), ok("pharmacist")))
                .isEqualTo(refused("stages", failed));
            assertThat(DecisionGuard.check(item("pending", null, stages, "pending"), issue())).isEmpty();
        }
        Item noStamp = new Item(null, 7L, "pending", null, ALL_RAN, "pending");
        assertThat(DecisionGuard.check(noStamp, new Attempt("ok", "pharmacist", null, 7L))).isEqualTo(refused("stages", failed));
        // the pipeline's own issue (not found at source) fails at step 5, before the issue guard
        Item pipelineIssue = item("issue", "not found at source", Map.of("dgda", "fail"), "pending");
        assertThat(DecisionGuard.check(pipelineIssue, ok("pharmacist"))).isEqualTo(refused("stages", failed));
    }

    @Test void step6OkWhileAnIssueIsOpenIsRefused() {
        // replaces ApprovalRuleTest.okAfterIssueNeedsAPharmacist: an ok can no longer clear an open issue
        Item open = item("issue", null, ALL_RAN, "issue");
        String msg = "An issue is open on this record. It returns to review after the fix and re-run.";
        assertThat(DecisionGuard.check(open, ok("pharmacist"))).isEqualTo(refused("review", msg));
        assertThat(DecisionGuard.check(open, ok("engineer"))).isEqualTo(refused("review", msg));
        assertThat(DecisionGuard.check(open, issue())).isEmpty();
    }

    @Test void step7AnApprovedRecordRefusesAnotherOk() {
        Item approved = item("ok", null, ALL_RAN, "approved");
        assertThat(DecisionGuard.check(approved, ok("pharmacist")))
            .isEqualTo(refused("review", "This record is already approved by a pharmacist"));
        assertThat(DecisionGuard.check(approved, ok("engineer"))).isEqualTo(refused("review", DecisionGuard.ALREADY_APPROVED));
        assertThat(DecisionGuard.check(approved, issue())).isEmpty();
    }

    @Test void step8ASecondEngineerCheckIsRefusedButAPharmacistMayApprove() {
        Item checked = item("pending", null, ALL_RAN, "engineer_checked");
        assertThat(DecisionGuard.check(checked, ok("engineer")))
            .isEqualTo(refused("review", "Your check is already recorded for this record"));
        assertThat(DecisionGuard.check(checked, ok("pharmacist"))).isEmpty();
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ApprovalRuleTest' --tests 'com.niramoy.bddrug.DecisionGuardTest'`
Expected: compilation FAILS — `cannot find symbol: method displayStatus(...)` and `package com.niramoy.bddrug.domain.DecisionGuard does not exist`.

- [ ] **Step 3: Implement**

Replace `api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java` with:

```java
package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * The approval rule for one batch record. Only decisions made after the record's latest pipeline run
 * ({@code extracted_at}) count; older ones stay in the history but no longer decide anything.
 * <ul>
 *   <li>{@code issue} when the latest counted decision is an issue;</li>
 *   <li>{@code ok} when a pharmacist recorded ok and no issue came after that ok;</li>
 *   <li>{@code pending} otherwise (an engineer's ok alone never approves).</li>
 * </ul>
 * No counted decision at all gives empty: the pipeline's own value (pending, or issue with its reason) stays.
 * {@link #displayStatus} is the five-state status reviewers see (spec §5.2), computed once, here.
 */
public final class ApprovalRule {
    private ApprovalRule() {}
    public static final String OK = "ok", ISSUE = "issue", PENDING = "pending", PHARMACIST = "pharmacist", ENGINEER = "engineer";
    public static final String APPROVED = "approved", ENGINEER_CHECKED = "engineer_checked", BACK_IN_REVIEW = "back_in_review";

    private static final Comparator<ReviewDecision> CHRONOLOGICAL =
        Comparator.comparing(ReviewDecision::decidedAt).thenComparingLong(ReviewDecision::id);

    /** A decision counts when it was made after the latest run; without a run stamp every decision counts. */
    private static boolean counts(ReviewDecision d, Instant extractedAt) {
        return extractedAt == null || d.decidedAt().isAfter(extractedAt);
    }

    public static Optional<String> review(List<ReviewDecision> decisions, Instant extractedAt) {
        List<ReviewDecision> counted = decisions.stream().filter(d -> counts(d, extractedAt)).sorted(CHRONOLOGICAL).toList();
        if (counted.isEmpty()) return Optional.empty();
        if (ISSUE.equals(counted.get(counted.size() - 1).decision())) return Optional.of(ISSUE);
        int lastPharmacistOk = -1;
        for (int i = 0; i < counted.size(); i++)
            if (OK.equals(counted.get(i).decision()) && PHARMACIST.equals(counted.get(i).reviewerRole())) lastPharmacistOk = i;
        if (lastPharmacistOk < 0) return Optional.of(PENDING);
        for (int i = lastPharmacistOk + 1; i < counted.size(); i++)
            if (ISSUE.equals(counted.get(i).decision())) return Optional.of(PENDING);
        return Optional.of(OK);
    }

    /**
     * Spec §5.2, in this order of precedence. {@code review} is the item's stored {@code batch_item.review}.
     * <ol>
     *   <li>{@code issue}: review is issue and the counted decisions contain an issue (the pipeline's own issue,
     *       "not found at source", has none and falls through to pending);</li>
     *   <li>{@code approved}: review is ok;</li>
     *   <li>{@code engineer_checked}: review is pending and a counted engineer ok has no issue after it;</li>
     *   <li>{@code back_in_review}: review is pending, nothing counted, and the decisions at or before the run
     *       stamp had approved it;</li>
     *   <li>{@code pending}: everything else.</li>
     * </ol>
     */
    public static String displayStatus(List<ReviewDecision> decisions, Instant extractedAt, String review) {
        List<ReviewDecision> counted = decisions.stream().filter(d -> counts(d, extractedAt)).sorted(CHRONOLOGICAL).toList();
        if (ISSUE.equals(review) && counted.stream().anyMatch(d -> ISSUE.equals(d.decision()))) return ISSUE;
        if (OK.equals(review)) return APPROVED;
        if (PENDING.equals(review)) {
            int lastIssue = -1;
            for (int i = 0; i < counted.size(); i++) if (ISSUE.equals(counted.get(i).decision())) lastIssue = i;
            for (int i = lastIssue + 1; i < counted.size(); i++)
                if (OK.equals(counted.get(i).decision()) && ENGINEER.equals(counted.get(i).reviewerRole())) return ENGINEER_CHECKED;
            if (counted.isEmpty() && extractedAt != null) {
                List<ReviewDecision> before = decisions.stream().filter(d -> !counts(d, extractedAt)).toList();
                if (review(before, null).filter(OK::equals).isPresent()) return BACK_IN_REVIEW;
            }
        }
        return PENDING;
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java`:

```java
package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * The decision guards of spec §7.2, steps 2 to 8, as one pure function (step 1, requestId idempotency, needs the audit
 * table and lives in the adapter). The first failing step wins. An {@code issue} passes every step after step 4: a
 * reviewer can always report a problem on a current, non-removed record, even one whose checks failed.
 */
public final class DecisionGuard {
    private DecisionGuard() {}

    public static final List<String> STAGES = List.of("dgda", "substances", "clinical", "ddinter");
    public static final String REMOVED_NOTE = "removed from batch file";

    public static final String STALE_RUN = "This record was re-run after the page was loaded; reload it and review again";
    public static final String OTHER_REVIEWER =
        "Another reviewer decided on this record after the page was loaded; reload it and review again";
    public static final String REMOVED = "This record was removed from the batch file";
    public static final String CHECK_FAILED = "A check failed on this record. It returns to review after the fix and re-run.";
    public static final String ISSUE_OPEN = "An issue is open on this record. It returns to review after the fix and re-run.";
    public static final String ALREADY_APPROVED = "This record is already approved by a pharmacist";
    public static final String ALREADY_CHECKED = "Your check is already recorded for this record";

    /** The locked item as the decision transaction sees it; {@code stages} maps a stage name to its status. */
    public record Item(Instant extractedAt, Long lastDecisionId, String review, String note,
                       Map<String, String> stages, String displayStatus) {}
    /** What the reviewer sent: the decision, their role, and the version their page showed. */
    public record Attempt(String decision, String reviewerRole, Instant expectedExtractedAt, Long expectedLastDecisionId) {}
    /** A refused decision: the error's {@code field} and message (409 CONFLICT). */
    public record Refusal(String field, String message) {}

    public static Optional<Refusal> check(Item item, Attempt a) {
        if (!Objects.equals(a.expectedExtractedAt(), item.extractedAt())) return refuse("extractedAt", STALE_RUN);
        if (!Objects.equals(a.expectedLastDecisionId(), item.lastDecisionId())) return refuse("lastDecisionId", OTHER_REVIEWER);
        if (REMOVED_NOTE.equals(item.note())) return refuse("conceptId", REMOVED);
        if (!ApprovalRule.OK.equals(a.decision())) return Optional.empty();
        boolean checksFailed = item.extractedAt() == null || STAGES.stream()
            .anyMatch(s -> !item.stages().containsKey(s) || "fail".equals(item.stages().get(s)));
        if (checksFailed) return refuse("stages", CHECK_FAILED);
        if (ApprovalRule.ISSUE.equals(item.review())) return refuse("review", ISSUE_OPEN);
        if (ApprovalRule.OK.equals(item.review())) return refuse("review", ALREADY_APPROVED);
        if (ApprovalRule.ENGINEER.equals(a.reviewerRole()) && ApprovalRule.ENGINEER_CHECKED.equals(item.displayStatus()))
            return refuse("review", ALREADY_CHECKED);
        return Optional.empty();
    }

    private static Optional<Refusal> refuse(String field, String message) {
        return Optional.of(new Refusal(field, message));
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ApprovalRuleTest' --tests 'com.niramoy.bddrug.DecisionGuardTest'`
Expected: BUILD SUCCESSFUL; 12 `ApprovalRuleTest` and 8 `DecisionGuardTest` tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java \
  api/src/test/java/com/niramoy/bddrug/ApprovalRuleTest.java api/src/test/java/com/niramoy/bddrug/DecisionGuardTest.java
git commit -m "feat(api): display status and decision guards as pure domain rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: API access fixes A1 and A2, and `lastDecisionId` on batch items

Implements §7.1 (A1, A2; D2) and the `lastDecisionId` the phase-0 web echoes (§12.1). Updates the existing tests A1 breaks (§11.3).

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/presentation/BatchController.java`, `BatchReportController.java`, `ReviewController.java` (history only; the POST changes in Tasks 8a and 8b)
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/BatchItem.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcBatchAdapter.java`
- Test: `api/src/test/java/com/niramoy/bddrug/BatchReportApiIntegrationTest.java`, `ProductApiIntegrationTest.java`, `ApiExceptionHandlerTest.java`, `VisibilityApiIntegrationTest.java`, `ReviewApiIntegrationTest.java` (the tokenless reads; fully rewritten in Task 8a)

**Interfaces:**
- Consumes: `InternalAuth.require(String header)`.
- Produces:
  - `GET /v1/batches`, `GET /v1/batches/{id}`, `GET /v1/batches/{id}/report`, `GET /v1/batches/{b}/items/{c}/decisions` answer 401 `UNAUTHORIZED` without `X-Internal-Token`;
  - history items are `ReviewController.ReviewerDecision(decision, note, role, decidedAt, reviewerEmail)`; `PublicDecision` no longer exists;
  - `BatchItem(String conceptId, String review, String note, Product extracted, String sourceJson, List<StageResult> stages, Instant extractedAt, Long lastDecisionId)` — `lastDecisionId` = `max(review_decision.id)` of the item, JSON `null` when none.

- [ ] **Step 1: Update the existing tests and add the A1 tests**

In `BatchReportApiIntegrationTest.java`:
- change every `web.get().uri("/v1/batches/` call to `internal(web).get().uri("/v1/batches/` (five calls);
- add to the seed SQL, after the `INSERT INTO ops.stage_result …;` statement:

```sql
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) VALUES
             ('RP','W-1','ok','','p@example.org','pharmacist'), ('RP','W-1','issue','label differs','p@example.org','pharmacist');
```

- add imports `import java.util.Collections;` and `import java.util.List;` and these tests:

```java
    @Test void batchReadsNeedTheToken() {
        for (String uri : List.of("/v1/batches", "/v1/batches/RP", "/v1/batches/RP/report"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
    }

    @Test void batchItemsCarryTheirLastDecisionId() throws Exception {
        long last = count(pg, "SELECT max(id) FROM ops.review_decision WHERE batch_id = 'RP' AND concept_id = 'W-1'");
        internal(web).get().uri("/v1/batches/RP").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.items[?(@.conceptId == 'W-1')].lastDecisionId").isEqualTo(List.of((int) last))
            .jsonPath("$.data.items[?(@.conceptId == 'A-1')].lastDecisionId").isEqualTo(Collections.singletonList(null));
    }
```

In `ProductApiIntegrationTest.java`:
- in `batchShowsSourceBesideExtractedData`, `batchListAndUnknownBatch` and `batchItemsCarryStageResultsInPipelineOrder`, change `web.get().uri("/v1/batches` to `all().get().uri("/v1/batches`;
- add to `batchShowsSourceBesideExtractedData`, after `.jsonPath("$.data.items[0].conceptId").isEqualTo("341-0160-020--tericin")`:

```java
            .jsonPath("$.data.items[0].lastDecisionId").value(v -> org.assertj.core.api.Assertions.assertThat(v).isNull())
```

- add the test:

```java
    @Test void batchReadsAnswer401WithoutTheToken() {
        web.get().uri("/v1/batches").exchange().expectStatus().isUnauthorized();
        web.get().uri("/v1/batches/0001-pilot").exchange().expectStatus().isUnauthorized();
    }
```

Replace `ApiExceptionHandlerTest.java` with:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.presentation.ApiExceptionHandler;
import com.niramoy.bddrug.presentation.BatchController;
import com.niramoy.bddrug.presentation.InternalAuth;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.WebFluxTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@WebFluxTest(BatchController.class)
@Import({ApiExceptionHandler.class, InternalAuth.class})
@TestPropertySource(properties = "bddrug.internal-api-token=" + TestSupport.TOKEN)
class ApiExceptionHandlerTest {
    @Autowired WebTestClient web;
    @MockitoBean BatchQueryPort batches;

    @Test void unexpectedErrorUsesEnvelope() {
        when(batches.list()).thenReturn(Flux.error(new RuntimeException("boom")));
        web.get().uri("/v1/batches").header(TestSupport.HEADER, TestSupport.TOKEN).exchange()
            .expectStatus().isEqualTo(500)
            .expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("INTERNAL_ERROR")
            .jsonPath("$.message").isEqualTo("Unexpected error");
    }

    @Test void aBatchReadWithoutTheTokenIs401AndNeverReachesThePort() {
        web.get().uri("/v1/batches").exchange()
            .expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        verifyNoInteractions(batches);
    }
}
```

In `VisibilityApiIntegrationTest.java` add:

```java
    // ---- batch evidence (A1, A2)

    @Test void batchEvidenceAndDecisionHistoryNeedTheToken() {
        for (String uri : List.of("/v1/batches", "/v1/batches/V-1", "/v1/batches/V-1/report",
                                  "/v1/batches/V-1/items/W-1/decisions"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
    }
```

In `ReviewApiIntegrationTest.java` (until Task 8a rewrites it), change the batch reads to use the token: in `shownExtractedAt` it already uses `internal(web)`; in `batchStatusFollowsItsItems` change `web.get().uri("/v1/batches/R-flow")` to `internal(web).get().uri("/v1/batches/R-flow")`; in `staleExtractedAtIsRejectedWith409` change `web.get().uri("/v1/batches/R-stale")` to `internal(web).get().uri("/v1/batches/R-stale")`; in `reRunInvalidatesApprovalButKeepsHistory` change `web.get().uri("/v1/batches/R-rerun/items/N-1/decisions")` to `internal(web).get().uri("/v1/batches/R-rerun/items/N-1/decisions")`; in `missingOrWrongTokenIs401AndWritesNothing` nothing changes; and replace the whole test `decisionHistoryIsNewestFirstWithRoleOnlyUnlessTokenGiven` with:

```java
    @Test void decisionHistoryNeedsTheTokenAndIsNewestFirst() throws Exception {
        decide("R-hist", "C-CAP", body("ok", null, ENGINEER, "engineer")).expectStatus().isCreated();
        decide("R-hist", "C-CAP", body("issue", "dose form mismatch", PHARMACIST, "pharmacist")).expectStatus().isCreated();

        // A1 and A2: no batch evidence and no decision history without the token
        for (String uri : new String[]{"/v1/batches/R-hist/items/C-CAP/decisions", "/v1/batches/R-hist",
                                       "/v1/batches/R-hist/report", "/v1/batches"})
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");

        internal(web).get().uri("/v1/batches/R-hist/items/C-CAP/decisions").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(2)
            .jsonPath("$.data[0].decision").isEqualTo("issue")
            .jsonPath("$.data[0].note").isEqualTo("dose form mismatch")
            .jsonPath("$.data[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data[0].reviewerEmail").isEqualTo(PHARMACIST)
            .jsonPath("$.data[1].reviewerEmail").isEqualTo(ENGINEER);

        // public product and substance pages never carry emails
        for (String uri : new String[]{"/v1/products/C-CAP", "/v1/substances/BDS-000003"}) {
            byte[] page = web.get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            assertThat(new String(page, StandardCharsets.UTF_8)).as(uri).doesNotContain("@");
        }
    }
```

and in `missingOrWrongTokenIs401AndWritesNothing`, after the `header(HEADER, "wrong")` GET, add:

```java
        web.get().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").exchange().expectStatus().isUnauthorized();
```

and in `unknownBatchItemIs404` change `web.get().uri("/v1/batches/R-val/items/nope/decisions")` to `internal(web).get().uri("/v1/batches/R-val/items/nope/decisions")` (with the token an unknown item is still a 404).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.BatchReportApiIntegrationTest' --tests 'com.niramoy.bddrug.ProductApiIntegrationTest' --tests 'com.niramoy.bddrug.ApiExceptionHandlerTest' --tests 'com.niramoy.bddrug.VisibilityApiIntegrationTest' --tests 'com.niramoy.bddrug.ReviewApiIntegrationTest'`
Expected: FAIL — `batchReadsNeedTheToken`, `batchReadsAnswer401WithoutTheToken`, `batchEvidenceAndDecisionHistoryNeedTheToken` and `decisionHistoryNeedsTheTokenAndIsNewestFirst` get 200 instead of 401; `aBatchReadWithoutTheTokenIs401AndNeverReachesThePort` gets 500 instead of 401 (the unstubbed `@MockitoBean` returns `null` for `list()`, so the controller's `collectList()` throws a `NullPointerException` that the handler maps to `INTERNAL_ERROR`); `batchItemsCarryTheirLastDecisionId` fails with `JSON path "$.data.items[?(@.conceptId == 'W-1')].lastDecisionId" expected:<[N]> but was:<[]>` (a filter on a missing key yields an empty list).

- [ ] **Step 3: Implement**

Replace `BatchController.java` with:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.Batch;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import java.util.List;

/** Batch evidence shows unreviewed records, so it is for reviewers only: every read needs the internal token (A1). */
@RestController
@RequestMapping("/v1/batches")
public class BatchController {
    private final BatchQueryPort batches;
    private final InternalAuth auth;
    public BatchController(BatchQueryPort batches, InternalAuth auth) {
        this.batches = batches;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<List<Batch>>> list(@RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return batches.list().collectList().map(ApiResponse::ok);
    }

    @GetMapping("/{batchId}")
    public Mono<ApiResponse<Batch>> get(@PathVariable String batchId,
                                        @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return batches.find(batchId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
    }
}
```

Replace `BatchReportController.java` with:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.BatchReport;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

/** The batch report is batch evidence: reviewers only, with the internal token (A1). It holds no emails. */
@RestController
@RequestMapping("/v1/batches")
public class BatchReportController {
    private final BatchQueryPort batches;
    private final InternalAuth auth;
    public BatchReportController(BatchQueryPort batches, InternalAuth auth) {
        this.batches = batches;
        this.auth = auth;
    }

    @GetMapping("/{batchId}/report")
    public Mono<ApiResponse<BatchReport>> report(@PathVariable String batchId,
                                                 @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return batches.report(batchId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
    }
}
```

In `ReviewController.java`, delete the `PublicDecision` record and the `publicView` method, and replace the `history` method with:

```java
    /** Decision notes and history are never served without the token (A2); with it, emails are included. */
    @GetMapping
    public Mono<ApiResponse<List<ReviewerDecision>>> history(@PathVariable String batchId, @PathVariable String conceptId,
                                                             @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.history(batchId, conceptId, true)
            .map(list -> list.stream().map(ReviewController::reviewerView).toList())
            .map(ApiResponse::ok);
    }
```

and change the class Javadoc to `/** Review decisions per batch record. Writing and reading the history both need the internal token. */`.

Replace `BatchItem.java` with:

```java
package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;

/**
 * extractedAt is the record's latest pipeline run and lastDecisionId the newest decision's id (null when none); the
 * review form echoes both, so the API can refuse a decision on a re-run record or after another reviewer's decision.
 */
public record BatchItem(String conceptId, String review, String note, Product extracted, String sourceJson,
                        List<StageResult> stages, Instant extractedAt, Long lastDecisionId) {}
```

In `R2dbcBatchAdapter.java`:
- change the `ItemRow` record to

```java
    private record ItemRow(String conceptId, String review, String note, String sourceJson,
                           R2dbcProductAdapter.Row product, Instant extractedAt, Long lastDecisionId) {}
```

- in the items query, replace `bi.extracted_at,` with

```sql
                       bi.extracted_at,
                       (SELECT max(rd.id) FROM ops.review_decision rd
                         WHERE rd.batch_id = bi.batch_id AND rd.concept_id = bi.concept_id) AS last_decision_id,
```

- in the row mapping, replace `instant(r.get("extracted_at", OffsetDateTime.class))))` with `instant(r.get("extracted_at", OffsetDateTime.class)), r.get("last_decision_id", Long.class)))`;
- in the `BatchItem` construction, replace `List.copyOf(t.getT2().getOrDefault(i.conceptId(), List.of())), i.extractedAt());` with `List.copyOf(t.getT2().getOrDefault(i.conceptId(), List.of())), i.extractedAt(), i.lastDecisionId());`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the Step 2 command.
Expected: BUILD SUCCESSFUL, all five classes pass.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/presentation/BatchController.java \
  api/src/main/java/com/niramoy/bddrug/presentation/BatchReportController.java \
  api/src/main/java/com/niramoy/bddrug/presentation/ReviewController.java \
  api/src/main/java/com/niramoy/bddrug/domain/BatchItem.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcBatchAdapter.java \
  api/src/test/java/com/niramoy/bddrug/BatchReportApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/ProductApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/ApiExceptionHandlerTest.java \
  api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java
git commit -m "fix(api): batch evidence and decision history need the internal token (A1, A2)

Batch items also carry lastDecisionId for the stale-decision guard.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8a: API decision endpoint, part 1 — version keys, `requestId` validation, the guards and the new `Outcome`

Implements §7.2 steps 2–8 (D10, D11, D29) and the request keys of step 1 (the body must carry `extractedAt`, `expectedLastDecisionId` and a UUID `requestId`). Rewrites `ReviewApiIntegrationTest` as §11.3 lists, except the idempotency, backstop and audit-row tests, which Task 8b adds. A reviewer can approve or reject the guards here independently of Task 8b's replay and audit logic.

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/ReviewPort.java` (whole file)
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ReviewService.java` (whole file)
- Modify: `api/src/main/java/com/niramoy/bddrug/presentation/ReviewController.java` (whole file)
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java` (whole file)
- Test: `api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java` (whole file)

**Interfaces:**
- Consumes: `ApprovalRule.displayStatus`, `DecisionGuard.check` and its constants (Task 6); `BatchItem.lastDecisionId` (Task 7).
- Produces (Task 8b, the web in Task 11, and P1B's desk rely on these):
  - request body of `POST /v1/batches/{b}/items/{c}/decisions`: `{decision, note, reviewerEmail, reviewerRole, extractedAt: string|null, expectedLastDecisionId: number|null, requestId: string(UUID)}` — all three version/request keys required (absent: 400 with `field` = that key; `requestId` not a UUID: 400 `field=requestId`);
  - response: 201 for a new decision, body `Outcome{batchId, conceptId, review, displayStatus, batchStatus, version:{extractedAt, lastDecisionId}, replayed}`; the controller already answers 200 when `replayed` is true (Task 8b produces such outcomes);
  - 409 `field` values: `extractedAt`, `lastDecisionId`, `conceptId`, `stages`, `review`;
  - `ReviewPort.decide(String, String, NewDecision) -> Mono<Outcome>`;
  - `NewDecision(decision, note, reviewerEmail, reviewerRole, Instant expectedExtractedAt, Long expectedLastDecisionId, UUID requestId)` (`requestId` validated and carried for Task 8b), `Version(Instant extractedAt, Long lastDecisionId)`, `Outcome(batchId, conceptId, review, displayStatus, batchStatus, Version version, boolean replayed)`;
  - `ReviewService.Request(...)` and the package-private `static NewDecision validate(Request)`; adapter helpers `R2dbcReviewAdapter.target(batchId, conceptId)` (`"{batchId}/{conceptId}"`), `current(batchId, conceptId, boolean replayed)`, `TARGET_TYPE = "batch_item"`.

- [ ] **Step 1: Write the failing integration test**

Replace `api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java` with:

```java
package com.niramoy.bddrug;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** Review decisions (spec §7.2): guards in order, idempotent requestId, audit rows, the approval rule, A1/A2. */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
@ExtendWith(OutputCaptureExtension.class)
class ReviewApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String PHARMACIST = "pharma.reviewer@example.org", ENGINEER = "eng.reviewer@example.org";
    static final String CHECK_FAILED = "A check failed on this record. It returns to review after the fix and re-run.";
    static final String ISSUE_OPEN = "An issue is open on this record. It returns to review after the fix and re-run.";

    /** Each test owns its batch so the tests stay independent. */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at)
            SELECT b, 1, now() - interval '1 hour' FROM unnest(ARRAY['R-eng','R-flow','R-iss','R-appr','R-rerun','R-val',
              'R-hist','R-rm','R-stale','R-tok','R-log','R-req','R-null','R-race','R-other','R-chk','R-pipe','R-idem',
              'R-conc','R-rej','R-bk','R-pend','R-back']) AS b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
             ('R-eng','DGDA-Drugs','D-1', now() - interval '1 hour'),
             ('R-flow','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-flow','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-iss','DGDA-Drugs','C-EYE', now() - interval '1 hour'),
             ('R-appr','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-rerun','DGDA-Drugs','N-1', now() - interval '1 hour'),
             ('R-val','DGDA-Drugs','W-2', now() - interval '1 hour'),
             ('R-hist','DGDA-Drugs','C-CAP', now() - interval '1 hour'),
             ('R-rm','DGDA-Drugs','X-NOSUB', now() - interval '1 hour'),
             ('R-stale','DGDA-Drugs','A-NOBDC', '2026-01-01T08:00:00.123456Z'),
             ('R-tok','DGDA-Drugs','X-NOMAP', now() - interval '1 hour'),
             ('R-log','DGDA-Drugs','X-NOMAP', now() - interval '1 hour'),
             ('R-req','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-null','DGDA-Drugs','W-1', NULL),
             ('R-race','DGDA-Drugs','C-EYE', now() - interval '1 hour'),
             ('R-other','DGDA-Drugs','W-2', now() - interval '1 hour'),
             ('R-chk','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-chk','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-idem','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-idem','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-conc','DGDA-Drugs','N-1', now() - interval '1 hour'),
             ('R-rej','DGDA-Drugs','W-1', now() - interval '1 hour'),
             -- R-idem, R-conc, R-rej, R-bk, R-pend and R-back are used by the tests Task 8b adds
             ('R-bk','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-pend','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-back','DGDA-Drugs','W-1', now() - interval '1 hour');
            -- an item that left the batch file but has history, and an item the pipeline could not load
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('R-rm','DGDA-Drugs','gone-id','issue','removed from batch file', now() - interval '2 hour'),
             ('R-pipe','DGDA-Drugs','typo-id','issue','not found at source', now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('R-rm','gone-id','issue','wrong product listed', 'old@example.org','pharmacist', now() - interval '90 minute');
            -- every current item ran its four checks without a failure, except the R-chk items below
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '' FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical'), ('ddinter')) AS s(stage)
            WHERE bi.note IS NULL AND bi.batch_id <> 'R-chk';
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
             ('R-chk','W-1','dgda','fail','error: RuntimeError: boom'), ('R-chk','W-1','substances','ok',''),
             ('R-chk','W-1','clinical','ok',''), ('R-chk','W-1','ddinter','ok',''),
             ('R-chk','A-1','dgda','ok',''), ('R-chk','A-1','substances','ok',''), ('R-chk','A-1','clinical','ok',''),
             ('R-pipe','typo-id','dgda','fail','not found at source');
            """);
    }

    @Autowired WebTestClient web;

    /** The version a reviewer's batch page shows for an item: its run stamp and newest decision id (nulls when none). */
    private record Shown(String extractedAt, Long lastDecisionId) {}

    private Shown shown(String batch, String concept) {
        var res = internal(web).get().uri("/v1/batches/{b}", batch).exchange().expectBody().returnResult();
        if (res.getStatus().value() != 200) return new Shown(null, null);
        String json = new String(res.getResponseBody(), StandardCharsets.UTF_8);
        String filter = "$.data.items[?(@.conceptId == '" + concept + "')].";
        List<String> stamps = JsonPath.read(json, filter + "extractedAt");
        List<Number> ids = JsonPath.read(json, filter + "lastDecisionId");
        return new Shown(stamps.isEmpty() ? null : stamps.get(0),
                         ids.isEmpty() || ids.get(0) == null ? null : ids.get(0).longValue());
    }

    /** Posts as the review form does: the shown version and a fresh requestId, unless the body already has the key. */
    private WebTestClient.ResponseSpec decide(String batch, String concept, Map<String, ?> body) {
        Map<String, Object> sent = new HashMap<>(body);
        Shown s = shown(batch, concept);
        if (!sent.containsKey("extractedAt")) sent.put("extractedAt", s.extractedAt());
        if (!sent.containsKey("expectedLastDecisionId")) sent.put("expectedLastDecisionId", s.lastDecisionId());
        if (!sent.containsKey("requestId")) sent.put("requestId", UUID.randomUUID().toString());
        return decideRaw(batch, concept, sent);
    }

    /** Posts the body exactly as given. */
    private WebTestClient.ResponseSpec decideRaw(String batch, String concept, Object body) {
        return internal(web).post().uri("/v1/batches/{b}/items/{c}/decisions", batch, concept)
            .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private static Map<String, Object> body(String decision, String note, String email, String role) {
        Map<String, Object> m = new HashMap<>();
        m.put("decision", decision);
        if (note != null) m.put("note", note);
        m.put("reviewerEmail", email);
        m.put("reviewerRole", role);
        return m;
    }

    private WebTestClient.BodyContentSpec expectDecision(String batch, String concept, Map<String, ?> body,
                                                         String review, String batchStatus) {
        return decide(batch, concept, body).expectStatus().isCreated().expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.batchId").isEqualTo(batch)
            .jsonPath("$.data.conceptId").isEqualTo(concept)
            .jsonPath("$.data.review").isEqualTo(review)
            .jsonPath("$.data.batchStatus").isEqualTo(batchStatus)
            .jsonPath("$.data.replayed").isEqualTo(false);
    }

    private void expectConflict(String batch, String concept, Map<String, ?> body, String field, String message) {
        decide(batch, concept, body).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("CONFLICT")
            .jsonPath("$.errors[0].field").isEqualTo(field)
            .jsonPath("$.errors[0].message").isEqualTo(message);
    }

    private String itemReview(String batch, String concept) throws Exception {
        return text(pg, "SELECT review FROM ops.batch_item WHERE batch_id = '" + batch + "' AND concept_id = '" + concept + "'");
    }

    private long decisions(String batch) throws Exception {
        return count(pg, "SELECT count(*) FROM ops.review_decision WHERE batch_id = '" + batch + "'");
    }

    // ---- the approval rule and the Outcome

    @Test void engineerOkDoesNotApproveAndASecondEngineerCheckIsRefused() throws Exception {
        Shown before = shown("R-eng", "D-1");
        byte[] res = expectDecision("R-eng", "D-1", body("ok", null, ENGINEER, "engineer"), "pending", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("engineer_checked")
            .returnResult().getResponseBody();
        String json = new String(res, StandardCharsets.UTF_8);
        assertThat((String) JsonPath.read(json, "$.data.version.extractedAt")).isEqualTo(before.extractedAt());
        assertThat(((Number) JsonPath.read(json, "$.data.version.lastDecisionId")).longValue())
            .isEqualTo(count(pg, "SELECT max(id) FROM ops.review_decision WHERE batch_id = 'R-eng'"));
        expectConflict("R-eng", "D-1", body("ok", null, "other.eng@example.org", "engineer"), "review",
            "Your check is already recorded for this record");
        assertThat(decisions("R-eng")).isEqualTo(1);
        assertThat(itemReview("R-eng", "D-1")).isEqualTo("pending");
        web.get().uri("/v1/products/D-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true);
    }

    @Test void batchStatusFollowsItsItems() throws Exception {
        expectDecision("R-flow", "W-1", body("ok", "", PHARMACIST, "pharmacist"), "ok", "in_review");
        expectDecision("R-flow", "A-1", body("ok", "label matches", PHARMACIST, "pharmacist"), "ok", "approved")
            .jsonPath("$.data.displayStatus").isEqualTo("approved");
        internal(web).get().uri("/v1/batches/R-flow").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.status").isEqualTo("approved")
            .jsonPath("$.data.items[0].review").isEqualTo("ok").jsonPath("$.data.items[1].review").isEqualTo("ok");
        // an issue is accepted on an approved record and reopens the item and the batch
        expectDecision("R-flow", "A-1", body("issue", "strength looks wrong", ENGINEER, "engineer"), "issue", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("issue");
        assertThat(itemReview("R-flow", "W-1")).isEqualTo("ok");
    }

    /** Step 6; replaces issueAfterOkIsIssueAndOnlyAPharmacistClearsIt. */
    @Test void okWhileAnIssueIsOpenIsRefused() throws Exception {
        expectDecision("R-iss", "C-EYE", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        expectDecision("R-iss", "C-EYE", body("issue", "route should be otic", PHARMACIST, "pharmacist"), "issue", "in_review");
        expectConflict("R-iss", "C-EYE", body("ok", null, ENGINEER, "engineer"), "review", ISSUE_OPEN);
        expectConflict("R-iss", "C-EYE", body("ok", "fixed upstream", PHARMACIST, "pharmacist"), "review", ISSUE_OPEN);
        assertThat(decisions("R-iss")).isEqualTo(2);
        assertThat(itemReview("R-iss", "C-EYE")).isEqualTo("issue");
    }

    /** Step 7. */
    @Test void okOnAnApprovedRecordIsRefused() throws Exception {
        expectDecision("R-appr", "A-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        expectConflict("R-appr", "A-1", body("ok", null, PHARMACIST, "pharmacist"), "review",
            "This record is already approved by a pharmacist");
        expectConflict("R-appr", "A-1", body("ok", null, ENGINEER, "engineer"), "review",
            "This record is already approved by a pharmacist");
        assertThat(decisions("R-appr")).isEqualTo(1);
    }

    @Test void reRunInvalidatesApprovalButKeepsHistory() throws Exception {
        expectDecision("R-rerun", "N-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").doesNotExist().jsonPath("$.data.tradeName").isEqualTo("Napa");

        // what bddrug_etl.load.batches.reopen_review does when the record is re-run
        exec(pg, """
            UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
             WHERE batch_id = 'R-rerun' AND concept_id = 'N-1';
            UPDATE ops.batch SET status = 'in_review' WHERE batch_id = 'R-rerun';""");

        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true).jsonPath("$.data.genericContentRaw").doesNotExist();
        internal(web).get().uri("/v1/batches/R-rerun/items/N-1/decisions").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(1).jsonPath("$.data[0].decision").isEqualTo("ok");

        expectDecision("R-rerun", "N-1", body("ok", null, ENGINEER, "engineer"), "pending", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("engineer_checked");
        expectDecision("R-rerun", "N-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        assertThat(decisions("R-rerun")).isEqualTo(3);
    }

    // ---- guards (steps 2 to 5)

    @Test void removedItemsDoNotHoldTheBatchBack() throws Exception {
        expectDecision("R-rm", "X-NOSUB", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        assertThat(itemReview("R-rm", "gone-id")).isEqualTo("issue");
    }

    /** Step 4. */
    @Test void decisionsOnARemovedRecordAreRefused() throws Exception {
        expectConflict("R-rm", "gone-id", body("ok", null, PHARMACIST, "pharmacist"), "conceptId",
            "This record was removed from the batch file");
        expectConflict("R-rm", "gone-id", body("issue", "still the wrong product", PHARMACIST, "pharmacist"), "conceptId",
            "This record was removed from the batch file");
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE concept_id = 'gone-id'")).isEqualTo(1);
    }

    /** Step 3. */
    @Test void anotherReviewersDecisionAfterThePageLoadedIsRefused() throws Exception {
        Shown before = shown("R-other", "W-2");
        expectDecision("R-other", "W-2", body("ok", null, ENGINEER, "engineer"), "pending", "in_review");
        Map<String, Object> late = body("ok", null, PHARMACIST, "pharmacist");
        late.put("expectedLastDecisionId", before.lastDecisionId());   // the page was loaded before the engineer's check
        expectConflict("R-other", "W-2", late, "lastDecisionId",
            "Another reviewer decided on this record after the page was loaded; reload it and review again");
        assertThat(decisions("R-other")).isEqualTo(1);
        // after a reload the pharmacist's approval is accepted
        expectDecision("R-other", "W-2", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
    }

    /** Step 5: a failed or missing check blocks ok but never an issue. */
    @Test void okWithAFailedOrMissingCheckIsRefusedButAnIssueIsAccepted() throws Exception {
        for (String concept : List.of("W-1", "A-1")) {
            expectConflict("R-chk", concept, body("ok", null, PHARMACIST, "pharmacist"), "stages", CHECK_FAILED);
            expectDecision("R-chk", concept, body("issue", "a check failed upstream", PHARMACIST, "pharmacist"),
                "issue", "in_review");
        }
        assertThat(decisions("R-chk")).isEqualTo(2);
    }

    /** The pipeline's own issue (not found at source) is pending with a failed check: ok is a 409 on stages. */
    @Test void aPipelineSetIssueRefusesOkOnStagesAndTakesAReviewersIssue() throws Exception {
        expectConflict("R-pipe", "typo-id", body("ok", null, PHARMACIST, "pharmacist"), "stages", CHECK_FAILED);
        expectDecision("R-pipe", "typo-id", body("issue", "concept id is a typo", PHARMACIST, "pharmacist"), "issue", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("issue");
    }

    @Test void anItemWithNoRunStampCannotBeApprovedButTakesAnIssue() throws Exception {
        Map<String, Object> stamped = body("ok", null, PHARMACIST, "pharmacist");
        stamped.put("extractedAt", "2026-01-01T08:00:00Z");
        expectConflict("R-null", "W-1", stamped, "extractedAt",
            "This record was re-run after the page was loaded; reload it and review again");
        Map<String, Object> explicitNull = body("ok", null, PHARMACIST, "pharmacist");
        explicitNull.put("extractedAt", null);
        expectConflict("R-null", "W-1", explicitNull, "stages", CHECK_FAILED);
        Map<String, Object> issue = body("issue", "no pipeline run recorded", PHARMACIST, "pharmacist");
        issue.put("extractedAt", null);
        decide("R-null", "W-1", issue).expectStatus().isCreated().expectBody().jsonPath("$.data.review").isEqualTo("issue");
        assertThat(decisions("R-null")).isEqualTo(1);
    }

    @Test void staleExtractedAtIsRejectedWith409() throws Exception {
        Map<String, Object> stale = body("ok", null, PHARMACIST, "pharmacist");
        stale.put("extractedAt", "2026-01-01T07:00:00Z");
        decide("R-stale", "A-NOBDC", stale).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("CONFLICT").jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        assertThat(decisions("R-stale")).isZero();
        internal(web).get().uri("/v1/batches/R-stale").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.items[0].extractedAt").isEqualTo("2026-01-01T08:00:00.123456Z");
        Map<String, Object> current = body("ok", null, PHARMACIST, "pharmacist");
        current.put("extractedAt", "2026-01-01T08:00:00.123456Z");
        expectDecision("R-stale", "A-NOBDC", current, "ok", "approved");
    }

    @Test void anExplicitNullOnAStampedItemIs409() throws Exception {
        Map<String, Object> explicitNull = body("ok", null, PHARMACIST, "pharmacist");
        explicitNull.put("extractedAt", null);
        decide("R-req", "W-1", explicitNull).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        assertThat(decisions("R-req")).isZero();
    }

    /** The page is loaded, the ETL re-runs the record and commits, then the pharmacist presses ok. */
    @Test void okOnAPageLoadedBeforeAReRunIs409AndPublishesNothing() throws Exception {
        String onScreen = shown("R-race", "C-EYE").extractedAt();
        assertThat(onScreen).isNotNull();
        exec(pg, """
            UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
             WHERE batch_id = 'R-race' AND concept_id = 'C-EYE';
            UPDATE ops.batch SET status = 'in_review' WHERE batch_id = 'R-race';""");
        Map<String, Object> stale = body("ok", null, PHARMACIST, "pharmacist");
        stale.put("extractedAt", onScreen);
        decide("R-race", "C-EYE", stale).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        // leaving the field out is no way around it
        decideRaw("R-race", "C-EYE", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isBadRequest();
        assertThat(decisions("R-race")).isZero();
        assertThat(text(pg, "SELECT status FROM ops.batch WHERE batch_id = 'R-race'")).isEqualTo("in_review");
        expectDecision("R-race", "C-EYE", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
    }

    // ---- validation

    private void expectInvalid(Map<String, ?> body, String field) {
        decide("R-val", "W-2", body).expectStatus().isBadRequest().expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
            .jsonPath("$.errors[0].field").isEqualTo(field);
    }

    @Test void validationRejectsBadDecisionsWithoutWriting() throws Exception {
        expectInvalid(body("issue", null, PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("issue", "bad", PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("issue", "    x    ", PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("issue", "n".repeat(1001), PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("ok", "n".repeat(1001), PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("ok", null, "not-an-email", "pharmacist"), "reviewerEmail");
        expectInvalid(body("ok", null, null, "pharmacist"), "reviewerEmail");
        expectInvalid(body("ok", null, PHARMACIST, "user"), "reviewerRole");
        expectInvalid(body("ok", null, PHARMACIST, null), "reviewerRole");
        expectInvalid(body("maybe", null, PHARMACIST, "pharmacist"), "decision");
        decideRaw("R-val", "W-2", Map.of()).expectStatus().isBadRequest();
        internal(web).post().uri("/v1/batches/R-val/items/W-2/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{not json").exchange().expectStatus().isBadRequest();

        Shown s = shown("R-val", "W-2");
        Map<String, Object> noId = body("ok", null, PHARMACIST, "pharmacist");
        noId.put("extractedAt", s.extractedAt());
        noId.put("requestId", UUID.randomUUID().toString());
        decideRaw("R-val", "W-2", noId).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("expectedLastDecisionId");
        for (Object bad : new Object[]{"7", 1.5, 0, -3, true}) {
            Map<String, Object> m = new HashMap<>(noId);
            m.put("expectedLastDecisionId", bad);
            decideRaw("R-val", "W-2", m).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("expectedLastDecisionId");
        }
        Map<String, Object> noRequest = body("ok", null, PHARMACIST, "pharmacist");
        noRequest.put("extractedAt", s.extractedAt());
        noRequest.put("expectedLastDecisionId", null);
        decideRaw("R-val", "W-2", noRequest).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        for (Object bad : new Object[]{"not-a-uuid", "", "1-1-1-1-1", 12345}) {
            Map<String, Object> m = new HashMap<>(noRequest);
            m.put("requestId", bad);
            decideRaw("R-val", "W-2", m).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        }
        assertThat(decisions("R-val")).isZero();
        // boundaries are accepted
        expectDecision("R-val", "W-2", body("issue", "12345", PHARMACIST, "pharmacist"), "issue", "in_review");
        expectDecision("R-val", "W-2", body("issue", "n".repeat(1000), ENGINEER, "engineer"), "issue", "in_review");
        assertThat(decisions("R-val")).isEqualTo(2);
    }

    @Test void missingExtractedAtIs400AndWritesNothing() throws Exception {
        for (Map<String, Object> b : List.of(body("ok", null, PHARMACIST, "pharmacist"),
                                             body("issue", "strength looks wrong", PHARMACIST, "pharmacist"))) {
            decideRaw("R-req", "W-1", b).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
                .jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        }
        assertThat(decisions("R-req")).isZero();
        assertThat(itemReview("R-req", "W-1")).isEqualTo("pending");
    }

    @Test void malformedExtractedAtIs400() throws Exception {
        for (Object bad : new Object[]{"yesterday", "", 1767254400, true, List.of("2026-01-01T08:00:00Z")}) {
            Map<String, Object> b = body("ok", null, PHARMACIST, "pharmacist");
            b.put("extractedAt", bad);
            decideRaw("R-req", "W-1", b).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        }
        assertThat(decisions("R-req")).isZero();
    }

    @Test void unknownBatchItemIs404() throws Exception {
        decide("R-val", "nope", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
        decide("nope", "W-2", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isNotFound();
        internal(web).get().uri("/v1/batches/R-val/items/nope/decisions").exchange().expectStatus().isNotFound();
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE concept_id = 'nope' OR batch_id = 'nope'")).isZero();
    }

    // ---- token and privacy

    @Test void missingOrWrongTokenIs401AndWritesNothing() throws Exception {
        var ok = body("ok", null, PHARMACIST, "pharmacist");
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(ok).exchange().expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED").jsonPath("$.metadata.requestId").exists();
        for (String wrong : new String[]{TOKEN + "x", TOKEN.substring(1), ""})
            web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, wrong)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(ok).exchange().expectStatus().isUnauthorized();
        // the token is checked before validation: an invalid body without a token is still 401
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of()).exchange().expectStatus().isUnauthorized();
        web.get().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, "wrong")
            .exchange().expectStatus().isUnauthorized();
        web.get().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").exchange().expectStatus().isUnauthorized();
        assertThat(decisions("R-tok")).isZero();
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE target_id = 'R-tok/X-NOMAP'")).isZero();
    }

    @Test void decisionHistoryNeedsTheTokenAndIsNewestFirst() throws Exception {
        decide("R-hist", "C-CAP", body("ok", null, ENGINEER, "engineer")).expectStatus().isCreated();
        decide("R-hist", "C-CAP", body("issue", "dose form mismatch", PHARMACIST, "pharmacist")).expectStatus().isCreated();
        for (String uri : new String[]{"/v1/batches/R-hist/items/C-CAP/decisions", "/v1/batches/R-hist",
                                       "/v1/batches/R-hist/report", "/v1/batches"})
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        internal(web).get().uri("/v1/batches/R-hist/items/C-CAP/decisions").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(2)
            .jsonPath("$.data[0].decision").isEqualTo("issue")
            .jsonPath("$.data[0].note").isEqualTo("dose form mismatch")
            .jsonPath("$.data[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data[0].reviewerEmail").isEqualTo(PHARMACIST)
            .jsonPath("$.data[1].reviewerEmail").isEqualTo(ENGINEER);
        for (String uri : new String[]{"/v1/products/C-CAP", "/v1/substances/BDS-000003"}) {
            byte[] page = web.get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            assertThat(new String(page, StandardCharsets.UTF_8)).as(uri).doesNotContain("@");
        }
    }

    @Test void reviewerEmailsNeverReachTheLogs(CapturedOutput output) throws Exception {
        String email = "log.canary.reviewer@example.org";
        decide("R-log", "X-NOMAP", body("ok", null, email, "pharmacist")).expectStatus().isCreated();
        decide("R-log", "X-NOMAP", body("ok", null, email, "pharmacist")).expectStatus().isEqualTo(409);
        decide("R-log", "unknown-item", body("ok", null, email, "pharmacist")).expectStatus().isNotFound();
        decide("R-log", "X-NOMAP", body("issue", "abc", email, "pharmacist")).expectStatus().isBadRequest();
        decide("R-log", "X-NOMAP", body("ok", null, email, "admin")).expectStatus().isBadRequest();
        web.post().uri("/v1/batches/R-log/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body("ok", null, email, "pharmacist")).exchange().expectStatus().isUnauthorized();
        internal(web).get().uri("/v1/batches/R-log/items/X-NOMAP/decisions").exchange().expectStatus().isOk();
        assertThat(output.getAll()).doesNotContain(email).doesNotContain(TOKEN);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewApiIntegrationTest'`
Expected: FAIL — e.g. `engineerOkDoesNotApproveAndASecondEngineerCheckIsRefused` (`No value at JSON path "$.data.displayStatus"`), `okWhileAnIssueIsOpenIsRefused` (status 201 instead of 409), `validationRejectsBadDecisionsWithoutWriting` (201 instead of 400 for a missing `expectedLastDecisionId`).

- [ ] **Step 3: Rewrite the port**

Replace `api/src/main/java/com/niramoy/bddrug/application/port/ReviewPort.java` with:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Appends review decisions and keeps batch_item.review / batch.status in step with the approval rule. */
public interface ReviewPort {
    /**
     * Spec §7.2 steps 2–8, in one transaction after locking the item: {@code DecisionGuard} refusals as
     * ConflictException; otherwise append the decision, recompute the item's review and the batch status.
     * NotFoundException for an unknown batch item. {@code NewDecision.requestId} is validated and carried; this version
     * does not replay it yet (step 1).
     */
    Mono<Outcome> decide(String batchId, String conceptId, NewDecision decision);

    /** Newest first; emails are read only when {@code withEmails}. Errors with NotFoundException for an unknown item. */
    Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails);

    record NewDecision(String decision, String note, String reviewerEmail, String reviewerRole,
                       Instant expectedExtractedAt, Long expectedLastDecisionId, UUID requestId) {}
    /** The stale-detection token: the run stamp and the newest decision id (null when none). */
    record Version(Instant extractedAt, Long lastDecisionId) {}
    record Outcome(String batchId, String conceptId, String review, String displayStatus, String batchStatus,
                   Version version, boolean replayed) {}
}
```

- [ ] **Step 4: Rewrite the service**

Replace `api/src/main/java/com/niramoy/bddrug/application/ReviewService.java` with:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.application.port.ReviewPort.NewDecision;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Review decisions: validated here, guarded, appended and applied by the port. */
@Service
public class ReviewService {
    public static final Set<String> DECISIONS = Set.of("ok", "issue"), ROLES = Set.of("pharmacist", "engineer");
    public static final int ISSUE_NOTE_MIN = 5, NOTE_MAX = 1000;
    private static final Pattern UUID_TEXT =
        Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final ReviewPort port;
    public ReviewService(ReviewPort port) { this.port = port; }

    /**
     * {@code extractedAt} and {@code expectedLastDecisionId} are the version the reviewer's page showed (null when it
     * showed none); the {@code …Sent} flags are false when the key was left out. Both keys and {@code requestId} are
     * required: a decision must say which version it reviewed, and a retry must be recognisable (spec §7.2).
     * {@code expectedLastDecisionId} arrives as text: digits, null, or anything else (refused).
     */
    public record Request(String decision, String note, String reviewerEmail, String reviewerRole,
                          boolean extractedAtSent, String extractedAt,
                          boolean lastDecisionIdSent, String expectedLastDecisionId, String requestId) {}

    public Mono<Outcome> decide(String batchId, String conceptId, Request r) {
        return Mono.fromCallable(() -> validate(r)).flatMap(d -> port.decide(batchId, conceptId, d));
    }

    static NewDecision validate(Request r) {
        String decision = Validate.oneOf(r.decision(), DECISIONS, "decision");
        String note = Validate.text(r.note(), "issue".equals(decision) ? ISSUE_NOTE_MIN : 0, NOTE_MAX, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        String role = Validate.oneOf(r.reviewerRole(), ROLES, "reviewerRole");
        Instant extractedAt = runStamp(r);
        Long lastDecisionId = lastDecisionId(r);
        UUID requestId = requestId(r.requestId());
        return new NewDecision(decision, note, email, role, extractedAt, lastDecisionId, requestId);
    }

    private static Instant runStamp(Request r) {
        if (!r.extractedAtSent())
            throw new InvalidQueryException("extractedAt",
                "extractedAt is required: send the item's extractedAt as the page showed it (null when it has none)");
        if (r.extractedAt() == null) return null;
        try {
            return Instant.parse(r.extractedAt());
        } catch (DateTimeParseException e) {
            throw new InvalidQueryException("extractedAt", "extractedAt must be an ISO-8601 instant or null");
        }
    }

    private static Long lastDecisionId(Request r) {
        if (!r.lastDecisionIdSent())
            throw new InvalidQueryException("expectedLastDecisionId",
                "expectedLastDecisionId is required: send the item's lastDecisionId as the page showed it (null when it has none)");
        if (r.expectedLastDecisionId() == null) return null;
        try {
            long id = Long.parseLong(r.expectedLastDecisionId());
            if (id < 1) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException e) {
            throw new InvalidQueryException("expectedLastDecisionId", "expectedLastDecisionId must be a positive integer or null");
        }
    }

    private static UUID requestId(String value) {
        if (value == null || !UUID_TEXT.matcher(value).matches())
            throw new InvalidQueryException("requestId", "requestId must be a UUID, reused unchanged on every retry");
        return UUID.fromString(value);
    }

    public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return port.history(batchId, conceptId, withEmails);
    }
}
```

- [ ] **Step 5: Rewrite the controller**

Replace `api/src/main/java/com/niramoy/bddrug/presentation/ReviewController.java` with:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ReviewService;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;

/** Review decisions per batch record. Writing and reading the history both need the internal token. */
@RestController
@RequestMapping("/v1/batches/{batchId}/items/{conceptId}/decisions")
public class ReviewController {
    private final ReviewService service;
    private final InternalAuth auth;
    public ReviewController(ReviewService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    /** For internal-token callers (reviewers) only. */
    public record ReviewerDecision(String decision, String note, String role, Instant decidedAt, String reviewerEmail) {}

    /**
     * The decision body. {@code extractedAt} and {@code expectedLastDecisionId} are JsonNodes so a left-out key (null)
     * can be told apart from an explicit JSON null (NullNode); the service requires both keys and validates the values.
     */
    public record DecisionBody(String decision, String note, String reviewerEmail, String reviewerRole,
                               JsonNode extractedAt, JsonNode expectedLastDecisionId, String requestId) {
        ReviewService.Request toRequest() {
            boolean stampSent = extractedAt != null;
            String stamp = !stampSent || extractedAt.isNull() ? null
                : extractedAt.isTextual() ? extractedAt.textValue() : extractedAt.toString();
            boolean idSent = expectedLastDecisionId != null;
            String id = !idSent || expectedLastDecisionId.isNull() ? null
                : expectedLastDecisionId.isIntegralNumber() ? expectedLastDecisionId.asText()
                : "invalid:" + expectedLastDecisionId.getNodeType();
            return new ReviewService.Request(decision, note, reviewerEmail, reviewerRole, stampSent, stamp, idSent, id, requestId);
        }
    }

    /** 201 for a new decision, 200 for a replay of a known requestId. The token is checked before the body is read. */
    @PostMapping
    public Mono<ResponseEntity<ApiResponse<Outcome>>> decide(@PathVariable String batchId, @PathVariable String conceptId,
                                                             @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                                             @RequestBody Mono<DecisionBody> body) {
        auth.require(token);
        return body.flatMap(b -> service.decide(batchId, conceptId, b.toRequest()))
            .map(o -> ResponseEntity.status(o.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(ApiResponse.ok(o)));
    }

    /** Decision notes and history are never served without the token (A2); with it, emails are included. */
    @GetMapping
    public Mono<ApiResponse<List<ReviewerDecision>>> history(@PathVariable String batchId, @PathVariable String conceptId,
                                                             @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.history(batchId, conceptId, true)
            .map(list -> list.stream().map(ReviewController::reviewerView).toList())
            .map(ApiResponse::ok);
    }

    private static ReviewerDecision reviewerView(ReviewDecision d) {
        return new ReviewerDecision(d.decision(), d.note(), d.reviewerRole(), d.decidedAt(), d.reviewerEmail());
    }
}
```

- [ ] **Step 6: Rewrite the adapter**

Replace `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java` with:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.DecisionGuard;
import com.niramoy.bddrug.domain.ReviewDecision;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Review decisions. {@code ops.review_decision} is append-only: rows are inserted, never updated or deleted. Lock order
 * is batch_item, then batch, the same as the pipeline's {@code reopen_review}, so the two serialize instead of
 * deadlocking.
 */
@Component
public class R2dbcReviewAdapter implements ReviewPort {
    static final String TARGET_TYPE = "batch_item";

    private final DatabaseClient db;
    private final TransactionalOperator tx;
    public R2dbcReviewAdapter(DatabaseClient db, TransactionalOperator tx) {
        this.db = db;
        this.tx = tx;
    }

    private record LockedItem(Instant extractedAt, String review, String note) {}
    private record CurrentItem(Instant extractedAt, String review, String batchStatus) {}

    /** The audit target of a batch item (spec §5.15). */
    static String target(String batchId, String conceptId) { return batchId + "/" + conceptId; }

    @Override public Mono<Outcome> decide(String batchId, String conceptId, NewDecision d) {
        return tx.transactional(lockItem(batchId, conceptId).flatMap(item -> fresh(batchId, conceptId, d, item)));
    }

    private Mono<LockedItem> lockItem(String batchId, String conceptId) {
        return db.sql("SELECT extracted_at, review, note FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c FOR UPDATE")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new LockedItem(instant(r.get("extracted_at", OffsetDateTime.class)), r.get("review", String.class),
                                     r.get("note", String.class)))
            .one()
            .switchIfEmpty(Mono.error(() -> new NotFoundException("conceptId", "Batch item not found")));
    }

    /** Steps 2 to 8, then the writes. */
    private Mono<Outcome> fresh(String batchId, String conceptId, NewDecision d, LockedItem item) {
        return decisions(batchId, conceptId, false).flatMap(list -> stageStatuses(batchId, conceptId).flatMap(stages -> {
            var state = new DecisionGuard.Item(item.extractedAt(), lastDecisionId(list), item.review(), item.note(), stages,
                ApprovalRule.displayStatus(list, item.extractedAt(), item.review()));
            var attempt = new DecisionGuard.Attempt(d.decision(), d.reviewerRole(), d.expectedExtractedAt(),
                d.expectedLastDecisionId());
            return DecisionGuard.check(state, attempt)
                .<Mono<Outcome>>map(no -> Mono.error(new ConflictException(no.field(), no.message())))
                .orElseGet(() -> lockBatch(batchId)
                    .then(insert(batchId, conceptId, d))
                    .then(recomputeItem(batchId, conceptId, item.extractedAt()))
                    .then(recomputeBatch(batchId))
                    .then(current(batchId, conceptId, false)));
        }));
    }

    private Mono<Map<String, String>> stageStatuses(String batchId, String conceptId) {
        return db.sql("SELECT stage, status FROM ops.stage_result WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> Map.entry(r.get("stage", String.class), r.get("status", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    private Mono<Outcome> current(String batchId, String conceptId, boolean replayed) {
        return db.sql("""
                SELECT bi.extracted_at, bi.review, b.status AS batch_status
                FROM ops.batch_item bi JOIN ops.batch b ON b.batch_id = bi.batch_id
                WHERE bi.batch_id = :b AND bi.concept_id = :c""")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new CurrentItem(instant(r.get("extracted_at", OffsetDateTime.class)), r.get("review", String.class),
                                      r.get("batch_status", String.class)))
            .one()
            .flatMap(it -> decisions(batchId, conceptId, false).map(list -> new Outcome(batchId, conceptId, it.review(),
                ApprovalRule.displayStatus(list, it.extractedAt(), it.review()), it.batchStatus(),
                new Version(it.extractedAt(), lastDecisionId(list)), replayed)));
    }

    private Mono<Void> lockBatch(String batchId) {
        return db.sql("SELECT batch_id FROM ops.batch WHERE batch_id = :b FOR UPDATE").bind("b", batchId)
            .map(r -> 1).all().then();
    }

    private Mono<Void> insert(String batchId, String conceptId, NewDecision d) {
        return db.sql("""
                INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
                VALUES (:b, :c, :decision, :note, :email, :role)""")
            .bind("b", batchId).bind("c", conceptId).bind("decision", d.decision()).bind("note", d.note())
            .bind("email", d.reviewerEmail()).bind("role", d.reviewerRole())
            .fetch().rowsUpdated().then();
    }

    /** Applies the approval rule; with no decision since the latest run the pipeline's value stays. */
    private Mono<Void> recomputeItem(String batchId, String conceptId, Instant extractedAt) {
        return decisions(batchId, conceptId, false).flatMap(list -> ApprovalRule.review(list, extractedAt)
            .map(review -> db.sql("UPDATE ops.batch_item SET review = :r WHERE batch_id = :b AND concept_id = :c")
                .bind("r", review).bind("b", batchId).bind("c", conceptId).fetch().rowsUpdated().then())
            .orElse(Mono.empty()));
    }

    /** approved when every item still in the batch file is ok (and there is at least one); otherwise in_review. */
    private Mono<String> recomputeBatch(String batchId) {
        return db.sql("""
                UPDATE ops.batch b SET status = CASE
                  WHEN EXISTS (SELECT 1 FROM ops.batch_item bi WHERE bi.batch_id = b.batch_id AND %1$s)
                   AND NOT EXISTS (SELECT 1 FROM ops.batch_item bi
                                   WHERE bi.batch_id = b.batch_id AND %1$s AND bi.review <> 'ok')
                  THEN 'approved' ELSE 'in_review' END
                WHERE b.batch_id = :b
                RETURNING b.status""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId).map(r -> r.get("status", String.class)).one();
    }

    @Override public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return db.sql("SELECT EXISTS (SELECT 1 FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c) AS found")
            .bind("b", batchId).bind("c", conceptId).map(r -> r.get("found", Boolean.class)).one()
            .flatMap(found -> found ? decisions(batchId, conceptId, withEmails)
                : Mono.error(new NotFoundException("conceptId", "Batch item not found")));
    }

    /** Newest first. The email column is selected only when it is going to be returned. */
    private Mono<List<ReviewDecision>> decisions(String batchId, String conceptId, boolean withEmails) {
        return db.sql("SELECT id, decision, note, reviewer_role, decided_at" + (withEmails ? ", reviewer_email" : "") +
                      " FROM ops.review_decision WHERE batch_id = :b AND concept_id = :c ORDER BY decided_at DESC, id DESC")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> toDecision(r, withEmails)).all().collectList();
    }

    static Long lastDecisionId(List<ReviewDecision> list) {
        return list.stream().map(ReviewDecision::id).max(Long::compare).orElse(null);
    }

    private static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }

    private static ReviewDecision toDecision(Readable r, boolean withEmails) {
        return new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), r.get("note", String.class),
            withEmails ? r.get("reviewer_email", String.class) : null, r.get("reviewer_role", String.class),
            r.get("decided_at", OffsetDateTime.class).toInstant());
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewApiIntegrationTest'`
Expected: BUILD SUCCESSFUL, all tests pass.

Run: `cd api && ./gradlew test --no-daemon`
Expected: BUILD SUCCESSFUL (every API test, including Tasks 1, 6 and 7).

- [ ] **Step 8: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/application/port/ReviewPort.java \
  api/src/main/java/com/niramoy/bddrug/application/ReviewService.java \
  api/src/main/java/com/niramoy/bddrug/presentation/ReviewController.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java \
  api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java
git commit -m "feat(api): version keys and guards on review decisions (spec 7.2 steps 2-8)

Refuses ok on a stale page, after another reviewer's decision, on a removed record, with a
failed or missing check, with an open issue, on an approved record, and a second engineer
check. Decisions carry a validated requestId and return displayStatus and the version.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8b: API decision endpoint, part 2 — idempotent `requestId`, the unique-index backstop and the audit rows

Implements §7.2 step 1 and its backstop, and D35 for `decision` and `decision_rejected`, plus Review Focus 1. Builds on Task 8a's files.

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/ReviewPort.java` (whole file)
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ReviewService.java` (whole file)
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java` (whole file)
- Test: `api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java` (imports, and a block of tests inserted)

**Interfaces:**
- Consumes: Task 8a's `NewDecision.requestId`, `Outcome`, `Version`, `ReviewService.Request`, `validate`, the adapter's `target()`, `current()` and `TARGET_TYPE`; V6 `ops.audit_event` and its unique index `audit_event_decision_request_uq` (Task 1).
- Produces (the web in Task 11 and P1B's desk rely on these):
  - 200 with `Outcome.replayed = true` when the `requestId` was already recorded for this item and decision, writing nothing; 400 `field=requestId` when the id was used for another target or decision;
  - a unique-index hit (`DuplicateKeyException`) is answered as a replay in a fresh transaction;
  - `ReviewPort.recordRejection(Rejection) -> Mono<Void>`, `Rejection(batchId, conceptId, actorEmail, actorRole, outcome, UUID requestId)`; `ReviewService.rejection(batchId, conceptId, Request, Throwable) -> Rejection` (package-private);
  - audit rows: `decision` (same transaction as the decision; `actor_email`, `actor_role`, `target_type='batch_item'`, `target_id='{batchId}/{conceptId}'`, `outcome` = `ok|issue`, `request_id`) and `decision_rejected` (own transaction; `outcome` = `CONFLICT` or `INVALID_QUERY`; email and role only when valid; `request_id` only when it is a UUID).

- [ ] **Step 1: Write the failing tests**

In `api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java`, replace the import line `import java.nio.charset.StandardCharsets;` with

```java
import org.springframework.test.web.reactive.server.EntityExchangeResult;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
```

and insert this block directly before the line `    // ---- token and privacy`:

```java
    // ---- step 1: idempotency, and the audit rows

    @Test void aRepeatedRequestIdIsAnsweredOnceAndBelongsToItsDecision() throws Exception {
        String rid = UUID.randomUUID().toString();
        Shown s = shown("R-idem", "W-1");
        Map<String, Object> ok = body("ok", null, PHARMACIST, "pharmacist");
        ok.put("extractedAt", s.extractedAt());
        ok.put("expectedLastDecisionId", s.lastDecisionId());
        ok.put("requestId", rid);
        decideRaw("R-idem", "W-1", ok).expectStatus().isCreated().expectBody().jsonPath("$.data.replayed").isEqualTo(false);
        // a retry after a lost response: 200, the current outcome, nothing written
        decideRaw("R-idem", "W-1", ok).expectStatus().isOk().expectBody()
            .jsonPath("$.data.replayed").isEqualTo(true)
            .jsonPath("$.data.review").isEqualTo("ok")
            .jsonPath("$.data.displayStatus").isEqualTo("approved");
        // the same id in upper case is the same UUID
        Map<String, Object> upper = new HashMap<>(ok);
        upper.put("requestId", rid.toUpperCase());
        decideRaw("R-idem", "W-1", upper).expectStatus().isOk().expectBody().jsonPath("$.data.replayed").isEqualTo(true);
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE batch_id = 'R-idem' AND concept_id = 'W-1'"))
            .isEqualTo(1);
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision' AND request_id = '" + rid + "'"))
            .isEqualTo(1);
        assertThat(text(pg, "SELECT actor_email || '|' || actor_role || '|' || target_type || '|' || target_id || '|' || outcome"
                            + " FROM ops.audit_event WHERE event = 'decision' AND request_id = '" + rid + "'"))
            .isEqualTo(PHARMACIST + "|pharmacist|batch_item|R-idem/W-1|ok");
        // the id belongs to that decision: another item or another decision is a 400
        Map<String, Object> otherItem = body("ok", null, PHARMACIST, "pharmacist");
        otherItem.put("requestId", rid);
        decide("R-idem", "A-1", otherItem).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        Map<String, Object> otherDecision = body("issue", "another decision", PHARMACIST, "pharmacist");
        otherDecision.put("requestId", rid);
        decide("R-idem", "W-1", otherDecision).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        assertThat(decisions("R-idem")).isEqualTo(1);
    }

    /** Review Focus 1: two sends of one decision race; they serialise on the item lock and step 1 answers the second. */
    @Test void concurrentSendsOfOneRequestIdWriteOneDecision() throws Exception {
        Shown s = shown("R-conc", "N-1");
        Map<String, Object> ok = body("ok", null, PHARMACIST, "pharmacist");
        ok.put("extractedAt", s.extractedAt());
        ok.put("expectedLastDecisionId", s.lastDecisionId());
        ok.put("requestId", UUID.randomUUID().toString());
        Callable<Integer> send = () -> decideRaw("R-conc", "N-1", ok).expectBody().returnResult().getStatus().value();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(List.of(send, send))) statuses.add(f.get());
            assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        } finally {
            pool.shutdownNow();
        }
        assertThat(decisions("R-conc")).isEqualTo(1);
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision' AND target_id = 'R-conc/N-1'"))
            .isEqualTo(1);
    }

    @Test void a409AndA400EachLeaveExactlyOneDecisionRejectedRow() throws Exception {
        String r409 = UUID.randomUUID().toString(), r400 = UUID.randomUUID().toString();
        Map<String, Object> stale = body("ok", null, PHARMACIST, "pharmacist");
        stale.put("extractedAt", "2020-01-01T00:00:00Z");
        stale.put("requestId", r409);
        decide("R-rej", "W-1", stale).expectStatus().isEqualTo(409);
        Map<String, Object> badNote = body("issue", "bad", PHARMACIST, "pharmacist");
        badNote.put("requestId", r400);
        decide("R-rej", "W-1", badNote).expectStatus().isBadRequest();
        String row = "SELECT actor_email || '|' || actor_role || '|' || target_id || '|' || outcome FROM ops.audit_event"
                     + " WHERE event = 'decision_rejected' AND request_id = '%s'";
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision_rejected' AND request_id = '" + r409 + "'"))
            .isEqualTo(1);
        assertThat(text(pg, row.formatted(r409))).isEqualTo(PHARMACIST + "|pharmacist|R-rej/W-1|CONFLICT");
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision_rejected' AND request_id = '" + r400 + "'"))
            .isEqualTo(1);
        assertThat(text(pg, row.formatted(r400))).isEqualTo(PHARMACIST + "|pharmacist|R-rej/W-1|INVALID_QUERY");
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision' AND target_id = 'R-rej/W-1'")).isZero();
        assertThat(decisions("R-rej")).isZero();
    }

    /** §7.2 backstop: a send whose step-1 read missed a concurrent commit hits the unique request index and is answered
     *  as a replay in a fresh transaction. The racing row is an audit row alone: a review_decision row would lock the
     *  item through its foreign key and send this request down the step-1 path instead. */
    @Test void aUniqueIndexHitIsAnsweredAsAReplay() throws Exception {
        String rid = UUID.randomUUID().toString();
        Shown s = shown("R-bk", "W-1");
        Map<String, Object> ok = body("ok", null, PHARMACIST, "pharmacist");
        ok.put("extractedAt", s.extractedAt());
        ok.put("expectedLastDecisionId", s.lastDecisionId());
        ok.put("requestId", rid);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try (Connection c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())) {
            c.setAutoCommit(false);
            try (var st = c.createStatement()) {
                st.execute("INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome,"
                    + " request_id) VALUES ('decision', 'p@example.org', 'pharmacist', 'batch_item', 'R-bk/W-1', 'ok', '"
                    + rid + "')");
            }
            Future<EntityExchangeResult<byte[]>> sent =
                pool.submit(() -> decideRaw("R-bk", "W-1", ok).expectBody().returnResult());
            Thread.sleep(500);   // the request now waits on the uncommitted index entry
            assertThat(sent.isDone()).isFalse();
            c.commit();
            EntityExchangeResult<byte[]> res = sent.get(30, TimeUnit.SECONDS);
            assertThat(res.getStatus().value()).isEqualTo(200);
            String json = new String(res.getResponseBody(), StandardCharsets.UTF_8);
            assertThat((Boolean) JsonPath.read(json, "$.data.replayed")).isTrue();
        } finally {
            pool.shutdownNow();
        }
        // the request's own decision rolled back with its transaction; the index holds one decision row for the id
        assertThat(decisions("R-bk")).isZero();
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision' AND request_id = '" + rid + "'"))
            .isEqualTo(1);
    }

    /** A retry of an approval sent before a re-run reports the current state: back in review, nothing written. */
    @Test void aRetryOfAnApprovalAfterAReRunReportsBackInReview() throws Exception {
        Shown s = shown("R-back", "W-1");
        Map<String, Object> approval = body("ok", null, PHARMACIST, "pharmacist");
        approval.put("extractedAt", s.extractedAt());
        approval.put("expectedLastDecisionId", s.lastDecisionId());
        approval.put("requestId", UUID.randomUUID().toString());
        decideRaw("R-back", "W-1", approval).expectStatus().isCreated();
        // what bddrug_etl.load.batches.reopen_review does when the record is re-run
        exec(pg, """
            UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
             WHERE batch_id = 'R-back' AND concept_id = 'W-1';
            UPDATE ops.batch SET status = 'in_review' WHERE batch_id = 'R-back';""");
        decideRaw("R-back", "W-1", approval).expectStatus().isOk().expectBody()
            .jsonPath("$.data.replayed").isEqualTo(true)
            .jsonPath("$.data.review").isEqualTo("pending")
            .jsonPath("$.data.displayStatus").isEqualTo("back_in_review");
        assertThat(decisions("R-back")).isEqualTo(1);
    }

    /** §5.2: an issue fixed and re-run is pending; a retry of the issue reports that and writes nothing. */
    @Test void anIssueFixedAndReRunIsPending() throws Exception {
        Shown s = shown("R-pend", "W-1");
        Map<String, Object> issue = body("issue", "strength looks wrong", PHARMACIST, "pharmacist");
        issue.put("extractedAt", s.extractedAt());
        issue.put("expectedLastDecisionId", s.lastDecisionId());
        issue.put("requestId", UUID.randomUUID().toString());
        decideRaw("R-pend", "W-1", issue).expectStatus().isCreated().expectBody()
            .jsonPath("$.data.displayStatus").isEqualTo("issue");
        exec(pg, """
            UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
             WHERE batch_id = 'R-pend' AND concept_id = 'W-1';
            UPDATE ops.batch SET status = 'in_review' WHERE batch_id = 'R-pend';""");
        decideRaw("R-pend", "W-1", issue).expectStatus().isOk().expectBody()
            .jsonPath("$.data.replayed").isEqualTo(true)
            .jsonPath("$.data.review").isEqualTo("pending")
            .jsonPath("$.data.displayStatus").isEqualTo("pending");
        assertThat(decisions("R-pend")).isEqualTo(1);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewApiIntegrationTest'`
Expected: FAIL — `aRepeatedRequestIdIsAnsweredOnceAndBelongsToItsDecision` (the retry gets 409 `review` instead of 200), `concurrentSendsOfOneRequestIdWriteOneDecision` (statuses `[201, 409]`), `aUniqueIndexHitIsAnsweredAsAReplay` (201 without waiting: no audit row is inserted, so `sent.isDone()` is already true), `a409AndA400EachLeaveExactlyOneDecisionRejectedRow` (0 rows instead of 1), `aRetryOfAnApprovalAfterAReRunReportsBackInReview` and `anIssueFixedAndReRunIsPending` (201 instead of 200). Every Task 8a test still passes.

- [ ] **Step 3: Rewrite the port**

Replace `api/src/main/java/com/niramoy/bddrug/application/port/ReviewPort.java` with:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Appends review decisions and keeps batch_item.review / batch.status in step with the approval rule. */
public interface ReviewPort {
    /**
     * Spec §7.2, in one transaction after locking the item: (1) a {@code requestId} already recorded for this item and
     * decision answers with the current Outcome, {@code replayed=true}, writing nothing (another target or decision:
     * InvalidQueryException on {@code requestId}); (2–8) {@code DecisionGuard} refusals as ConflictException; otherwise
     * append the decision and its {@code decision} audit row, recompute the item's review and the batch status.
     * NotFoundException for an unknown batch item.
     */
    Mono<Outcome> decide(String batchId, String conceptId, NewDecision decision);

    /** One {@code decision_rejected} audit row, in its own transaction (the decision's transaction rolled back). */
    Mono<Void> recordRejection(Rejection rejection);

    /** Newest first; emails are read only when {@code withEmails}. Errors with NotFoundException for an unknown item. */
    Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails);

    record NewDecision(String decision, String note, String reviewerEmail, String reviewerRole,
                       Instant expectedExtractedAt, Long expectedLastDecisionId, UUID requestId) {}
    /** The stale-detection token: the run stamp and the newest decision id (null when none). */
    record Version(Instant extractedAt, Long lastDecisionId) {}
    record Outcome(String batchId, String conceptId, String review, String displayStatus, String batchStatus,
                   Version version, boolean replayed) {}
    /** {@code outcome} is the error code (CONFLICT or INVALID_QUERY); email and role only when they were valid. */
    record Rejection(String batchId, String conceptId, String actorEmail, String actorRole, String outcome, UUID requestId) {}
}
```

- [ ] **Step 4: Rewrite the service**

Replace `api/src/main/java/com/niramoy/bddrug/application/ReviewService.java` with:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.application.port.ReviewPort.NewDecision;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.application.port.ReviewPort.Rejection;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Review decisions: validated here, guarded, appended and applied by the port; every 400 and 409 is audited. */
@Service
public class ReviewService {
    private static final Logger log = LoggerFactory.getLogger(ReviewService.class);
    public static final Set<String> DECISIONS = Set.of("ok", "issue"), ROLES = Set.of("pharmacist", "engineer");
    public static final int ISSUE_NOTE_MIN = 5, NOTE_MAX = 1000;
    private static final Pattern UUID_TEXT =
        Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final ReviewPort port;
    public ReviewService(ReviewPort port) { this.port = port; }

    /**
     * {@code extractedAt} and {@code expectedLastDecisionId} are the version the reviewer's page showed (null when it
     * showed none); the {@code …Sent} flags are false when the key was left out. Both keys and {@code requestId} are
     * required: a decision must say which version it reviewed, and a retry must be recognisable (spec §7.2).
     * {@code expectedLastDecisionId} arrives as text: digits, null, or anything else (refused).
     */
    public record Request(String decision, String note, String reviewerEmail, String reviewerRole,
                          boolean extractedAtSent, String extractedAt,
                          boolean lastDecisionIdSent, String expectedLastDecisionId, String requestId) {}

    public Mono<Outcome> decide(String batchId, String conceptId, Request r) {
        return Mono.fromCallable(() -> validate(r))
            .flatMap(d -> port.decide(batchId, conceptId, d))
            .onErrorResume(e -> e instanceof InvalidQueryException || e instanceof ConflictException,
                e -> port.recordRejection(rejection(batchId, conceptId, r, e))
                    .onErrorResume(x -> {
                        log.error("decision_rejected audit row not written: {}", x.getClass().getName());
                        return Mono.empty();
                    })
                    .then(Mono.<Outcome>error(e)));
    }

    static NewDecision validate(Request r) {
        String decision = Validate.oneOf(r.decision(), DECISIONS, "decision");
        String note = Validate.text(r.note(), "issue".equals(decision) ? ISSUE_NOTE_MIN : 0, NOTE_MAX, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        String role = Validate.oneOf(r.reviewerRole(), ROLES, "reviewerRole");
        Instant extractedAt = runStamp(r);
        Long lastDecisionId = lastDecisionId(r);
        UUID requestId = requestId(r.requestId());
        return new NewDecision(decision, note, email, role, extractedAt, lastDecisionId, requestId);
    }

    private static Instant runStamp(Request r) {
        if (!r.extractedAtSent())
            throw new InvalidQueryException("extractedAt",
                "extractedAt is required: send the item's extractedAt as the page showed it (null when it has none)");
        if (r.extractedAt() == null) return null;
        try {
            return Instant.parse(r.extractedAt());
        } catch (DateTimeParseException e) {
            throw new InvalidQueryException("extractedAt", "extractedAt must be an ISO-8601 instant or null");
        }
    }

    private static Long lastDecisionId(Request r) {
        if (!r.lastDecisionIdSent())
            throw new InvalidQueryException("expectedLastDecisionId",
                "expectedLastDecisionId is required: send the item's lastDecisionId as the page showed it (null when it has none)");
        if (r.expectedLastDecisionId() == null) return null;
        try {
            long id = Long.parseLong(r.expectedLastDecisionId());
            if (id < 1) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException e) {
            throw new InvalidQueryException("expectedLastDecisionId", "expectedLastDecisionId must be a positive integer or null");
        }
    }

    private static UUID requestId(String value) {
        if (value == null || !UUID_TEXT.matcher(value).matches())
            throw new InvalidQueryException("requestId", "requestId must be a UUID, reused unchanged on every retry");
        return UUID.fromString(value);
    }

    /** What a rejection may record: never free text; the email and role only when they were valid. */
    static Rejection rejection(String batchId, String conceptId, Request r, Throwable e) {
        String email = Validate.stripped(r.reviewerEmail());
        boolean emailOk = !email.isEmpty() && email.contains("@") && email.length() <= Validate.MAX_EMAIL;
        String role = r.reviewerRole() != null && ROLES.contains(r.reviewerRole()) ? r.reviewerRole() : null;
        UUID requestId = r.requestId() != null && UUID_TEXT.matcher(r.requestId()).matches() ? UUID.fromString(r.requestId()) : null;
        return new Rejection(batchId, conceptId, emailOk ? email : null, role,
            e instanceof ConflictException ? "CONFLICT" : "INVALID_QUERY", requestId);
    }

    public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return port.history(batchId, conceptId, withEmails);
    }
}
```

- [ ] **Step 5: Rewrite the adapter**

Replace `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java` with:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.DecisionGuard;
import com.niramoy.bddrug.domain.ReviewDecision;
import io.r2dbc.spi.Readable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Review decisions. {@code ops.review_decision} and {@code ops.audit_event} are append-only: rows are inserted, never
 * updated or deleted. Lock order is batch_item, then batch, the same as the pipeline's {@code reopen_review}, so the two
 * serialize instead of deadlocking; two sends of one requestId serialize on the item lock, so step 1 answers the second.
 */
@Component
public class R2dbcReviewAdapter implements ReviewPort {
    static final String TARGET_TYPE = "batch_item";

    private final DatabaseClient db;
    private final TransactionalOperator tx;
    public R2dbcReviewAdapter(DatabaseClient db, TransactionalOperator tx) {
        this.db = db;
        this.tx = tx;
    }

    private record LockedItem(Instant extractedAt, String review, String note) {}
    private record CurrentItem(Instant extractedAt, String review, String batchStatus) {}
    private record AuditHit(String targetId, String outcome) {}

    /** The audit target of a batch item (spec §5.15). */
    static String target(String batchId, String conceptId) { return batchId + "/" + conceptId; }

    @Override public Mono<Outcome> decide(String batchId, String conceptId, NewDecision d) {
        return tx.transactional(lockItem(batchId, conceptId)
                .flatMap(item -> replay(batchId, conceptId, d)
                    .switchIfEmpty(Mono.defer(() -> fresh(batchId, conceptId, d, item)))))
            // backstop (§7.2): if the unique request index is ever hit, answer with step 1 in a fresh transaction
            .onErrorResume(DuplicateKeyException.class, e -> tx.transactional(
                replay(batchId, conceptId, d).switchIfEmpty(Mono.error(e))));
    }

    private Mono<LockedItem> lockItem(String batchId, String conceptId) {
        return db.sql("SELECT extracted_at, review, note FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c FOR UPDATE")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new LockedItem(instant(r.get("extracted_at", OffsetDateTime.class)), r.get("review", String.class),
                                     r.get("note", String.class)))
            .one()
            .switchIfEmpty(Mono.error(() -> new NotFoundException("conceptId", "Batch item not found")));
    }

    /** Step 1: empty when the requestId is new. */
    private Mono<Outcome> replay(String batchId, String conceptId, NewDecision d) {
        return db.sql("SELECT target_id, outcome FROM ops.audit_event WHERE event = 'decision' AND request_id = :r")
            .bind("r", d.requestId())
            .map(r -> new AuditHit(r.get("target_id", String.class), r.get("outcome", String.class)))
            .one()
            .flatMap(hit -> target(batchId, conceptId).equals(hit.targetId()) && d.decision().equals(hit.outcome())
                ? current(batchId, conceptId, true)
                : Mono.error(new InvalidQueryException("requestId",
                    "requestId was already used for another decision; send a new requestId for a new decision")));
    }

    /** Steps 2 to 8, then the writes. */
    private Mono<Outcome> fresh(String batchId, String conceptId, NewDecision d, LockedItem item) {
        return decisions(batchId, conceptId, false).flatMap(list -> stageStatuses(batchId, conceptId).flatMap(stages -> {
            var state = new DecisionGuard.Item(item.extractedAt(), lastDecisionId(list), item.review(), item.note(), stages,
                ApprovalRule.displayStatus(list, item.extractedAt(), item.review()));
            var attempt = new DecisionGuard.Attempt(d.decision(), d.reviewerRole(), d.expectedExtractedAt(),
                d.expectedLastDecisionId());
            return DecisionGuard.check(state, attempt)
                .<Mono<Outcome>>map(no -> Mono.error(new ConflictException(no.field(), no.message())))
                .orElseGet(() -> lockBatch(batchId)
                    .then(insert(batchId, conceptId, d))
                    .then(audit(batchId, conceptId, d))
                    .then(recomputeItem(batchId, conceptId, item.extractedAt()))
                    .then(recomputeBatch(batchId))
                    .then(current(batchId, conceptId, false)));
        }));
    }

    private Mono<Map<String, String>> stageStatuses(String batchId, String conceptId) {
        return db.sql("SELECT stage, status FROM ops.stage_result WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> Map.entry(r.get("stage", String.class), r.get("status", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    private Mono<Outcome> current(String batchId, String conceptId, boolean replayed) {
        return db.sql("""
                SELECT bi.extracted_at, bi.review, b.status AS batch_status
                FROM ops.batch_item bi JOIN ops.batch b ON b.batch_id = bi.batch_id
                WHERE bi.batch_id = :b AND bi.concept_id = :c""")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new CurrentItem(instant(r.get("extracted_at", OffsetDateTime.class)), r.get("review", String.class),
                                      r.get("batch_status", String.class)))
            .one()
            .flatMap(it -> decisions(batchId, conceptId, false).map(list -> new Outcome(batchId, conceptId, it.review(),
                ApprovalRule.displayStatus(list, it.extractedAt(), it.review()), it.batchStatus(),
                new Version(it.extractedAt(), lastDecisionId(list)), replayed)));
    }

    private Mono<Void> lockBatch(String batchId) {
        return db.sql("SELECT batch_id FROM ops.batch WHERE batch_id = :b FOR UPDATE").bind("b", batchId)
            .map(r -> 1).all().then();
    }

    private Mono<Void> insert(String batchId, String conceptId, NewDecision d) {
        return db.sql("""
                INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
                VALUES (:b, :c, :decision, :note, :email, :role)""")
            .bind("b", batchId).bind("c", conceptId).bind("decision", d.decision()).bind("note", d.note())
            .bind("email", d.reviewerEmail()).bind("role", d.reviewerRole())
            .fetch().rowsUpdated().then();
    }

    /** The {@code decision} audit row, in the decision's own transaction (§5.15). */
    private Mono<Void> audit(String batchId, String conceptId, NewDecision d) {
        return db.sql("""
                INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                VALUES ('decision', :email, :role, :type, :target, :outcome, :rid)""")
            .bind("email", d.reviewerEmail()).bind("role", d.reviewerRole()).bind("type", TARGET_TYPE)
            .bind("target", target(batchId, conceptId)).bind("outcome", d.decision()).bind("rid", d.requestId())
            .fetch().rowsUpdated().then();
    }

    @Override public Mono<Void> recordRejection(Rejection r) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                VALUES ('decision_rejected', :email, :role, :type, :target, :outcome, :rid)""")
            .bind("type", TARGET_TYPE).bind("target", target(r.batchId(), r.conceptId())).bind("outcome", r.outcome());
        spec = r.actorEmail() == null ? spec.bindNull("email", String.class) : spec.bind("email", r.actorEmail());
        spec = r.actorRole() == null ? spec.bindNull("role", String.class) : spec.bind("role", r.actorRole());
        spec = r.requestId() == null ? spec.bindNull("rid", UUID.class) : spec.bind("rid", r.requestId());
        return tx.transactional(spec.fetch().rowsUpdated()).then();
    }

    /** Applies the approval rule; with no decision since the latest run the pipeline's value stays. */
    private Mono<Void> recomputeItem(String batchId, String conceptId, Instant extractedAt) {
        return decisions(batchId, conceptId, false).flatMap(list -> ApprovalRule.review(list, extractedAt)
            .map(review -> db.sql("UPDATE ops.batch_item SET review = :r WHERE batch_id = :b AND concept_id = :c")
                .bind("r", review).bind("b", batchId).bind("c", conceptId).fetch().rowsUpdated().then())
            .orElse(Mono.empty()));
    }

    /** approved when every item still in the batch file is ok (and there is at least one); otherwise in_review. */
    private Mono<String> recomputeBatch(String batchId) {
        return db.sql("""
                UPDATE ops.batch b SET status = CASE
                  WHEN EXISTS (SELECT 1 FROM ops.batch_item bi WHERE bi.batch_id = b.batch_id AND %1$s)
                   AND NOT EXISTS (SELECT 1 FROM ops.batch_item bi
                                   WHERE bi.batch_id = b.batch_id AND %1$s AND bi.review <> 'ok')
                  THEN 'approved' ELSE 'in_review' END
                WHERE b.batch_id = :b
                RETURNING b.status""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId).map(r -> r.get("status", String.class)).one();
    }

    @Override public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return db.sql("SELECT EXISTS (SELECT 1 FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c) AS found")
            .bind("b", batchId).bind("c", conceptId).map(r -> r.get("found", Boolean.class)).one()
            .flatMap(found -> found ? decisions(batchId, conceptId, withEmails)
                : Mono.error(new NotFoundException("conceptId", "Batch item not found")));
    }

    /** Newest first. The email column is selected only when it is going to be returned. */
    private Mono<List<ReviewDecision>> decisions(String batchId, String conceptId, boolean withEmails) {
        return db.sql("SELECT id, decision, note, reviewer_role, decided_at" + (withEmails ? ", reviewer_email" : "") +
                      " FROM ops.review_decision WHERE batch_id = :b AND concept_id = :c ORDER BY decided_at DESC, id DESC")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> toDecision(r, withEmails)).all().collectList();
    }

    static Long lastDecisionId(List<ReviewDecision> list) {
        return list.stream().map(ReviewDecision::id).max(Long::compare).orElse(null);
    }

    private static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }

    private static ReviewDecision toDecision(Readable r, boolean withEmails) {
        return new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), r.get("note", String.class),
            withEmails ? r.get("reviewer_email", String.class) : null, r.get("reviewer_role", String.class),
            r.get("decided_at", OffsetDateTime.class).toInstant());
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewApiIntegrationTest'`
Expected: BUILD SUCCESSFUL, all tests pass.

Run: `cd api && ./gradlew test --no-daemon`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/application/port/ReviewPort.java \
  api/src/main/java/com/niramoy/bddrug/application/ReviewService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java \
  api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java
git commit -m "feat(api): idempotent and audited review decisions (spec 7.2 step 1)

A requestId replays its decision once, also when the unique request index is hit; every
decision and every rejection is written to ops.audit_event.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: API test seed — the fake warfarin pair moves to the systemic chloramphenicol entry

Implements §8.2 (`PilotSeed` fix) and `RouteRuleTest.exactEntryWinsEvenWithoutPairs` (§11.3). RouteRule itself is unchanged.

**Files:**
- Modify: `api/src/test/java/com/niramoy/bddrug/PilotSeed.java`
- Modify: `api/src/test/java/com/niramoy/bddrug/RouteRuleTest.java`, `CheckApiIntegrationTest.java`, `PlaceholderTextApiIntegrationTest.java`, `SubstanceApiIntegrationTest.java`

**Interfaces:**
- Consumes: nothing new.
- Produces: the shared seed now holds `('DDInter1951','DDInter351','moderate','{Monitor}','Warfarin','Chloramphenicol','IA-2')` (as in real DDInter); P2's `CheckApiIntegrationTest` cases (eye drops + warfarin: no alert; capsule + warfarin: one moderate alert) build on it.

- [ ] **Step 1: Write the failing tests**

In `RouteRuleTest.java` add:

```java
    @Test void exactEntryWinsEvenWithoutPairs() {
        // §8.2: the ophthalmic entry is used although DDInter lists no pair for it with the pilot drugs. There is no
        // fallback to the systemic entry: that would bring back the false alerts on eye drops.
        var choice = RouteRule.choose(CHLORAMPHENICOL, "ophthalmic").orElseThrow();
        assertThat(choice.codes()).extracting(DdinterCode::code).containsExactly("DDInter352");
        assertThat(choice.routeAssumed()).isFalse();
    }
```

In `CheckApiIntegrationTest.java` replace the test `chloramphenicolEyeDropsUseTheOphthalmicEntry` with:

```java
    @Test void chloramphenicolEyeDropsUseTheOphthalmicEntry() {
        // §1.5, §8.2: DDInter lists warfarin against DDInter351 (systemic) only. The eye drop uses DDInter352: no alert.
        check("C-EYE", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0);
        // the systemic capsule uses DDInter351 and gets the moderate alert
        check("C-CAP", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].a.conceptId").isEqualTo("C-CAP")
            .jsonPath("$.data.alerts[0].a.bdsId").isEqualTo("BDS-000003")
            .jsonPath("$.data.alerts[0].interaction").isEqualTo("Chloramphenicol may increase the serum concentration of warfarin.")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(false);
    }
```

In `PlaceholderTextApiIntegrationTest.java`, in `placeholderInteractionAndManagementAreNullOnTheChecker`, change `check("C-EYE", "W-1")` to `check("C-CAP", "W-1")`.

In `SubstanceApiIntegrationTest.java`:
- in `interactionsAreSortedBySeverityThenPartnerName` change `.jsonPath("$.data.interactions[2].partnerName").isEqualTo("Chloramphenicol (ophthalmic)")` to `.jsonPath("$.data.interactions[2].partnerName").isEqualTo("Chloramphenicol")`;
- in `partnerSideIsChosenFromEitherPairColumn` change the comment to `// Chloramphenicol is ddinter_b of its only pair; its partner is warfarin (ddinter_a), via the systemic entry.` and `.jsonPath("$.data.interactions[0].routeScope").isEqualTo("ophthalmic")` to `.jsonPath("$.data.interactions[0].routeScope").isEqualTo("systemic")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.CheckApiIntegrationTest' --tests 'com.niramoy.bddrug.PlaceholderTextApiIntegrationTest' --tests 'com.niramoy.bddrug.SubstanceApiIntegrationTest' --tests 'com.niramoy.bddrug.RouteRuleTest'`
Expected: FAIL — `chloramphenicolEyeDropsUseTheOphthalmicEntry` (eye drop alerts 1, expected 0), the placeholder test (capsule alerts 0) and both substance tests. `exactEntryWinsEvenWithoutPairs` passes already: it pins RouteRule, which does not change.

- [ ] **Step 3: Fix the seed**

In `PilotSeed.java` replace

```
         ('DDInter1951','DDInter352','moderate','{Monitor}','Warfarin','Chloramphenicol (ophthalmic)','IA-2'),
```

with

```
         ('DDInter1951','DDInter351','moderate','{Monitor}','Warfarin','Chloramphenicol','IA-2'),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon`
Expected: BUILD SUCCESSFUL, every API test passes.

- [ ] **Step 5: Commit**

```bash
git add api/src/test/java/com/niramoy/bddrug/PilotSeed.java api/src/test/java/com/niramoy/bddrug/RouteRuleTest.java \
  api/src/test/java/com/niramoy/bddrug/CheckApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/PlaceholderTextApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/SubstanceApiIntegrationTest.java
git commit -m "test(api): seed the warfarin pair on systemic chloramphenicol, as in DDInter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Web — public pages always read with public scope

Implements the §12.1 item "public pages stop sending `scope=all`" (§2.2, D28): `/`, `/products/[id]`, `/substances/[id]` and `/check` read with `scope=public` whatever the session; `UnreviewedBadge` and `scopeFor` are removed. Exit criterion: "a pharmacist sees the stub on an unapproved product page".

**Files:**
- Modify: `web/lib/api.ts` (whole file below; the batch and write sections are unchanged here and change in Task 11)
- Modify: `web/lib/reviewers.ts`, `web/components/badges.tsx`
- Modify: `web/app/page.tsx`, `web/app/products/[id]/page.tsx`, `web/app/substances/[id]/page.tsx`, `web/app/check/page.tsx`, `web/app/flags/page.tsx`
- Modify: `web/app/batches/[id]/page.tsx` (two lines: it imports and calls `scopeFor`, which the new `api.ts` no longer exports; Task 11 then replaces the whole file)
- Test: `web/tests/api-scope.test.ts` (whole file below), `web/tests/home-page.test.tsx` (whole file below), `web/tests/product-page.test.tsx`, `web/tests/substance-page.test.tsx`, `web/tests/check-page.test.tsx`, `web/tests/reviewers.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `searchProducts(q: string, page: number)`, `getProduct(id: string)`, `listLoadedProducts()`, `getSubstance(id: string)`, `checkInteractions(conceptIds: string[])` — no scope parameter; every call sends `scope=public` and never the token;
  - `Product` and `Substance.products[]` lose `reviewStatus`; the `Scope` type and `scopeFor()` no longer exist;
  - `isReviewer<S extends { role: string }>(session: S | null | undefined): session is S & { role: ReviewerRole }` in `web/lib/reviewers.ts`.

- [ ] **Step 1: Write the failing tests**

Replace `web/tests/home-page.test.tsx` with:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchProducts = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  searchProducts: (...args: unknown[]) => searchProducts(...args),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import Home from "@/app/page";

const item = (conceptId: string) => ({ conceptId, tradeName: `T-${conceptId}`, dosageForm: "Tablet",
  genericContentRaw: "X 5 mg", company: "Co" });
const render = async () => renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ q: "napa" }) }));

beforeEach(() => {
  searchProducts.mockReset(); searchProducts.mockResolvedValue({ items: [item("A"), item("B")], error: null });
  getSession.mockReset();
});

describe("search page visibility (spec §2.2: public scope for every session)", () => {
  it.each([null, { email: "someone@gmail.com", role: "user" }, { email: "eng@example.org", role: "engineer" },
    { email: "pharm@example.org", role: "pharmacist" }])("searches with public scope only (%o)", async (session) => {
    getSession.mockResolvedValue(session);
    const html = await render();
    expect(searchProducts).toHaveBeenCalledWith("napa", 0);
    expect(html).toContain("T-A");
    expect(html).not.toContain("unreviewed");
    expect(html).not.toContain("@example.org");
  });
});
```

Replace `web/tests/api-scope.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkInteractions, createFlag, getBatchReport, getDecisions, getProduct, getSubstance, isHidden, listFlags,
  listLoadedProducts, postDecision, resolveFlag, searchProducts,
} from "../lib/api";

/** A test-only internal token (never a real one). The client-bundle scan also looks for this value. */
const TOKEN = "test-internal-token-0123456789abcdef";
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ success: false, data: null, errors: [{ message }] }), { status });
const headerOf = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

let f: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  f = vi.fn().mockResolvedValue(ok([]));
  vi.stubGlobal("fetch", f);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("public reads (spec §2.2: always scope=public, never the token)", () => {
  it("search sends scope=public and no internal token, even with a token configured", async () => {
    await searchProducts("napa", 1);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products?q=napa&page=1&scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
  });

  it("getProduct reads with public scope and returns the hidden shape as-is", async () => {
    const hidden = { conceptId: "P-1", tradeName: "Napa", reviewStatus: "pending", hidden: true };
    f.mockImplementation(async () => ok(hidden));
    const p = await getProduct("P/1");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products/P%2F1?scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    expect(p).toEqual(hidden);
    expect(isHidden(p)).toBe(true);
  });

  it("isHidden is false for a full record and for null", () => {
    expect(isHidden({ conceptId: "x", tradeName: "y" })).toBe(false);
    expect(isHidden(null)).toBe(false);
  });

  it("getSubstance reads with public scope", async () => {
    f.mockImplementation(async () => ok({ bdsId: "BDS-1", preferredName: "X", reviewStatus: "pending", hidden: true }));
    expect(isHidden(await getSubstance("BDS-1"))).toBe(true);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/substances/BDS-1?scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
  });

  it("checkInteractions reads with public scope and requires the notReviewed array", async () => {
    const data = { products: [], alerts: [], duplicates: [], noData: [], notReviewed: [{ conceptId: "P-2" }] };
    f.mockResolvedValue(ok(data));
    expect(await checkInteractions(["P-1", "P-2"])).toEqual({ result: data, error: null });
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/interactions/check?scope=public");
    expect(headerOf(f.mock.calls[0][1], "Content-Type")).toBe("application/json");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    f.mockResolvedValue(ok({ products: [], alerts: [], duplicates: [], noData: [] }));
    expect(await checkInteractions(["P-1", "P-2"])).toEqual({ result: null, error: "Interaction check failed" });
  });

  it("listLoadedProducts reads the light list with public scope", async () => {
    const rows = [{ conceptId: "P-1", tradeName: "Ace", dosageForm: "Tablet" }];
    f.mockImplementation(async () => ok(rows));
    expect(await listLoadedProducts()).toEqual(rows);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products/loaded?scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    expect(f.mock.calls[0][1].cache).toBe("no-store");
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    f.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(listLoadedProducts()).rejects.toThrow("API error 500");
  });

  it("no public read ever asks for scope=all", async () => {
    f.mockImplementation(async () => ok([]));
    await searchProducts("napa", 0); await getProduct("P"); await getSubstance("S"); await listLoadedProducts();
    await checkInteractions(["A", "B"]);
    for (const [url] of f.mock.calls) expect(String(url)).not.toContain("scope=all");
  });
});

describe("batch report and decision history", () => {
  it("getBatchReport reads the report without a token; null on 404", async () => {
    const report = { counts: {}, review: { pending: 1, ok: 0, issue: 0 }, warnings: [], fails: [], runs: [], deltaVsPrevious: {} };
    f.mockResolvedValue(ok(report));
    expect(await getBatchReport("0001 pilot")).toEqual(report);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/batches/0001%20pilot/report");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    f.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await getBatchReport("nope")).toBeNull();
  });

  it("getDecisions never sends the token and keeps only decision, note, role and time", async () => {
    f.mockResolvedValue(ok([
      { decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T10:00:00Z", reviewerEmail: "pharm@example.org" },
    ]));
    const list = await getDecisions("0001-pilot", "N/1");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/batches/0001-pilot/items/N%2F1/decisions");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    expect(list).toEqual([{ decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T10:00:00Z" }]);
    expect(JSON.stringify(list)).not.toContain("pharm@example.org");
  });
});

describe("writes (internal token, JSON body)", () => {
  it("postDecision POSTs the decision with the token, the reviewer's email and role", async () => {
    f.mockResolvedValue(ok({ batchId: "B", conceptId: "N-1", review: "ok", batchStatus: "approved" }, 201));
    const r = await postDecision("B 1", "N/1", { decision: "ok", note: "", reviewerEmail: "pharm@example.org",
      reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00Z" });
    expect(r).toEqual({ ok: true, data: { review: "ok", batchStatus: "approved" } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/batches/B%201/items/N%2F1/decisions");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Internal-Token")).toBe(TOKEN);
    expect(headerOf(init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ decision: "ok", note: "", reviewerEmail: "pharm@example.org",
      reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00Z" });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("postDecision always sends extractedAt, as an explicit null when the item has none (the API requires the field)", async () => {
    f.mockResolvedValue(ok({ review: "pending", batchStatus: "in_review" }, 201));
    await postDecision("B", "N", { decision: "issue", note: "wrong strength", reviewerEmail: "e@x.org", reviewerRole: "engineer",
      extractedAt: null });
    expect(f.mock.calls[0][1].body).toBe(JSON.stringify(
      { decision: "issue", note: "wrong strength", reviewerEmail: "e@x.org", reviewerRole: "engineer", extractedAt: null }));
  });

  it("postDecision reports the status and API message on failure, and a network error as status 0", async () => {
    f.mockResolvedValue(fail(409, "The record was re-run"));
    expect(await postDecision("B", "N", { decision: "ok", note: "", reviewerEmail: "a@b", reviewerRole: "pharmacist", extractedAt: null }))
      .toEqual({ ok: false, status: 409, error: "The record was re-run" });
    f.mockRejectedValue(new TypeError("fetch failed"));
    expect(await postDecision("B", "N", { decision: "ok", note: "", reviewerEmail: "a@b", reviewerRole: "pharmacist", extractedAt: null }))
      .toEqual({ ok: false, status: 0, error: "The API is unavailable" });
  });

  it("writes refuse to run without a configured internal token (no API call)", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    expect(await postDecision("B", "N", { decision: "ok", note: "", reviewerEmail: "a@b", reviewerRole: "pharmacist", extractedAt: null }))
      .toEqual({ ok: false, status: 0, error: "The internal API token is not configured" });
    expect(await createFlag({ targetType: "product", targetId: "P", message: "hello", reporterEmail: "a@b" }))
      .toMatchObject({ ok: false, status: 0 });
    expect(await resolveFlag(1, "a@b")).toMatchObject({ ok: false, status: 0 });
    await expect(listFlags()).rejects.toThrow("internal API token");
    expect(f).not.toHaveBeenCalled();
  });

  it("createFlag POSTs the flag with the token", async () => {
    f.mockResolvedValue(ok({ id: 7 }, 201));
    expect(await createFlag({ targetType: "product", targetId: "P-1", message: "Wrong company", reporterEmail: "u@gmail.com" }))
      .toEqual({ ok: true, data: { id: 7 } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual(
      { targetType: "product", targetId: "P-1", message: "Wrong company", reporterEmail: "u@gmail.com" });
  });

  it("listFlags reads open flags with the token and drops emails", async () => {
    f.mockResolvedValue(ok([{ id: 3, targetType: "substance", targetId: "BDS-1", message: "Name typo",
      reporterEmail: "u@gmail.com", status: "open", createdAt: "2026-10-12T10:00:00Z", resolvedAt: null, resolvedBy: null }]));
    const flags = await listFlags();
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/flags?status=open");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBe(TOKEN);
    expect(flags).toEqual([{ id: 3, targetType: "substance", targetId: "BDS-1", message: "Name typo", status: "open",
      createdAt: "2026-10-12T10:00:00Z" }]);
    expect(JSON.stringify(flags)).not.toContain("@");
  });

  it("resolveFlag passes the API status through (404 unknown, 409 already resolved)", async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ success: false, errors: [{ message: "Flag already resolved" }] }), { status: 409 }));
    expect(await resolveFlag(3, "p@x.org")).toEqual({ ok: false, status: 409, error: "Flag already resolved" });
  });

  it("resolveFlag POSTs resolvedBy with the token", async () => {
    f.mockResolvedValue(ok({ id: 3, status: "resolved" }));
    expect((await resolveFlag(3, "pharm@example.org")).ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags/3/resolve");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ resolvedBy: "pharm@example.org" });
  });
});
```

In `web/tests/product-page.test.tsx`:
- change the mock line `getProduct: (id: string, scope?: string) => getProduct(id, scope),` to `getProduct: (...args: unknown[]) => getProduct(...args),`;
- replace the whole `describe("product page visibility", () => { … });` block (up to, not including, `describe("product page", () => {`) with:

```tsx
describe("product page visibility (spec §2.2: public scope for every session)", () => {
  const hidden = { conceptId: "H-1", tradeName: "Secretname", reviewStatus: "pending", hidden: true };

  it("asks the API with the id only, which reads public scope", async () => {
    await render("x");
    expect(getProduct).toHaveBeenCalledWith("x");
  });

  it("anonymous: a hidden product shows only 'Not yet reviewed by a pharmacist', no data", async () => {
    getProduct.mockResolvedValue(hidden);
    const html = await render("H-1");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["Secretname", "DAR number", "Company", "Active ingredients", "Clinical drug", "Flag a problem"])
      expect(html).not.toContain(absent);
  });

  it("a signed-in user can flag the hidden product", async () => {
    getSession.mockResolvedValue({ email: "someone@gmail.com", role: "user" });
    getProduct.mockResolvedValue(hidden);
    const html = await render("H-1");
    expect(getProduct).toHaveBeenCalledWith("H-1");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).toContain("Flag a problem");
    expect(html).not.toContain("someone@gmail.com");
  });

  it("a pharmacist sees the same stub on an unapproved product page (phase 0 exit criterion)", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    getProduct.mockResolvedValue(hidden);
    const html = await render("H-1");
    expect(getProduct).toHaveBeenCalledWith("H-1");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["Secretname", "DAR number", "unreviewed", "pharm@example.org"]) expect(html).not.toContain(absent);
  });

  it("an approved product shows no badge for any session", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    expect(await render("x")).not.toContain("unreviewed");
    getSession.mockResolvedValue(null);
    expect(await render("x")).not.toContain("unreviewed");
  });

  it("shows the flag form to signed-in visitors only, and the outcome after a flag", async () => {
    expect(await render("x")).not.toContain("Flag a problem");
    getSession.mockResolvedValue({ email: "someone@gmail.com", role: "user" });
    const html = await render("x", "sent");
    expect(html).toContain("Flag a problem");
    expect(html).toContain('name="targetType" value="product"');
    expect(html).toContain("Thank you. Your flag was sent to the reviewers.");
  });
});
```

In `web/tests/substance-page.test.tsx`:
- change the mock line `getSubstance: (id: string, scope?: string) => getSubstance(id, scope),` to `getSubstance: (...args: unknown[]) => getSubstance(...args),`;
- change `expect(getSubstance).toHaveBeenCalledWith("BDS-000004", "public");` to `expect(getSubstance).toHaveBeenCalledWith("BDS-000004");`;
- replace the whole `describe("substance page visibility", () => { … });` block (up to, not including, `describe("substance page", () => {`) with:

```tsx
describe("substance page visibility (spec §2.2: public scope for every session)", () => {
  it("shows only the not-reviewed text for a hidden substance", async () => {
    getSubstance.mockResolvedValue({ bdsId: "BDS-000009", preferredName: "Secretine", reviewStatus: "pending", hidden: true });
    const html = await render("BDS-000009");
    expect(getSubstance).toHaveBeenCalledWith("BDS-000009");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["Secretine", "Names", "Codes", "Drug interactions", "Products using it", NONE_SENTENCE])
      expect(html).not.toContain(absent);
  });

  it("a reviewer reads the same public page: no badge, and the flag form", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", role: "engineer" });
    getSubstance.mockResolvedValue(warfarin);
    const html = await render("BDS-000001");
    expect(getSubstance).toHaveBeenCalledWith("BDS-000001");
    expect(html).not.toContain("unreviewed");
    expect(html).toContain('<a href="/products/W-1">Warin</a> (Acme)</li>');
    expect(html).toContain("Flag a problem");
    expect(html).not.toContain("eng@example.org");
  });

  it("anonymous visitors see no badge and no flag form", async () => {
    getSubstance.mockResolvedValue(warfarin);
    const html = await render("BDS-000001");
    expect(html).not.toContain("unreviewed");
    expect(html).not.toContain("Flag a problem");
  });
});
```

In `web/tests/check-page.test.tsx`:
- change the two mock lines to `listLoadedProducts: (...args: unknown[]) => listLoadedProducts(...args),` and `checkInteractions: (...args: unknown[]) => checkInteractions(...args),`;
- change `expect(listLoadedProducts).toHaveBeenCalledWith("public");` to `expect(listLoadedProducts).toHaveBeenCalledWith();`;
- replace the test `it("uses scope=all for reviewers, for the list and the check", …)` with:

```tsx
  it("reads the public list and checks with public scope for reviewers too (spec §2.2)", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    checkInteractions.mockResolvedValue({ result: emptyResult({}), error: null });
    const html = await render(["W-1", "A-1"]);
    expect(listLoadedProducts).toHaveBeenCalledWith();
    expect(checkInteractions).toHaveBeenCalledWith(["W-1", "A-1"]);
    expect(html).toContain("Products reviewed by a pharmacist");
    expect(html).not.toContain("reviewer view");
    expect(html).not.toContain("pharm@example.org");
  });
```

- remove the `, "public"` second argument from the remaining `checkInteractions` expectations:

```bash
perl -pi -e 's/(expect\(checkInteractions\)\.toHaveBeenCalledWith\(\[[^\]]*\]), "public"\)/$1)/g' web/tests/check-page.test.tsx
```

In `web/tests/reviewers.test.ts` change `import { parseReviewers, roleFor } from "../lib/reviewers";` to `import { isReviewer, parseReviewers, roleFor } from "../lib/reviewers";` and append:

```ts
describe("isReviewer", () => {
  it("is true for pharmacists and engineers only", () => {
    expect(isReviewer({ role: "pharmacist" })).toBe(true);
    expect(isReviewer({ role: "engineer" })).toBe(true);
    expect(isReviewer({ role: "user" })).toBe(false);
    expect(isReviewer(null)).toBe(false);
    expect(isReviewer(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/api-scope.test.ts tests/home-page.test.tsx tests/product-page.test.tsx tests/substance-page.test.tsx tests/check-page.test.tsx tests/reviewers.test.ts`
Expected: FAIL — reviewer sessions still call with `"all"` (e.g. `expected "spy" to be called with arguments: [ 'napa', 0 ]` but received `[ 'napa', 0, 'all' ]`), `isReviewer is not a function`.

- [ ] **Step 3: Implement**

Replace `web/lib/api.ts` with:

```ts
import "server-only";

/**
 * The BDDrug API client. Server-only: it reads INTERNAL_API_TOKEN, which must never reach a client bundle
 * (scripts/check-client-bundle.mjs fails the build if it does).
 *
 * Visibility (spec §2.2, Decision): every public page reads with `scope=public`, whatever the session, so a reviewer
 * sees exactly what a reader sees there. Public reads never send the internal token. Unapproved data is read only by
 * the reviewer pages, through token-gated endpoints.
 */

export type ReviewStatus = "pending" | "ok" | "issue";

export type Ingredient = { xmCode: string; name: string };
/** A DDInter entry chosen for the product's route; routeAssumed = the general entry stands in for the route. */
export type DdinterRef = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type ClinicalIngredient = {
  bdsId: string; name: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null; ddinter: DdinterRef[];
};
export type ClinicalDrug = { bdcId: string; displayName: string; doseForm: string; route: string; ingredients: ClinicalIngredient[] };
export type Product = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string;
  genericContentRaw: string; qualityFlag: string | null; ingredients: Ingredient[];
  parseStatus: "parsed" | "partial" | "failed" | null; parseNote: string | null; clinicalDrug: ClinicalDrug | null;
};
/** What the API returns under public scope for a record no pharmacist has approved: no data fields. */
export type HiddenProduct = { conceptId: string; tradeName?: string; reviewStatus: "pending" | "issue"; hidden: true };
export type HiddenSubstance = { bdsId: string; preferredName?: string; reviewStatus?: string; hidden: true };
export type SearchResult = { items: Product[]; error: string | null };

export function isHidden(x: unknown): x is { hidden: true } {
  return typeof x === "object" && x !== null && (x as { hidden?: unknown }).hidden === true;
}

const base = () => process.env.API_URL ?? "http://api:8080";
const MIN_TOKEN_LENGTH = 32;
const TOKEN_HEADER = "X-Internal-Token";

/** The internal API token, or null when it is not configured (the API refuses tokens under 32 characters). */
function internalToken(): string | null {
  const token = process.env.INTERNAL_API_TOKEN ?? "";
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

const read = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });

export async function searchProducts(q: string, page: number): Promise<SearchResult> {
  const term = q.trim();
  if (term.length < 2) return { items: [], error: null };
  const params = new URLSearchParams({ q: term, page: String(page), scope: "public" });
  let res: Response;
  try {
    res = await read(`${base()}/v1/products?${params}`);
  } catch {
    return { items: [], error: "Search is temporarily unavailable. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { items: [], error: body?.errors?.[0]?.message ?? "Search failed" };
  if (!Array.isArray(body?.data)) return { items: [], error: "Search failed" };
  return { items: body.data, error: null };
}

export async function getProduct(id: string): Promise<Product | HiddenProduct | null> {
  const res = await read(`${base()}/v1/products/${encodeURIComponent(id)}?scope=public`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Product | HiddenProduct;
}

export type LoadedProduct = { conceptId: string; tradeName: string; dosageForm: string };

/** The light product list for the checker's picker (approved products only), sorted by trade name. */
export async function listLoadedProducts(): Promise<LoadedProduct[]> {
  const res = await read(`${base()}/v1/products/loaded?scope=public`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no product list");
  return data as LoadedProduct[];
}

export type StageResult = { stage: string; status: "ok" | "warn" | "fail"; note: string; evidence: unknown };
export type BatchItem = { conceptId: string; review: ReviewStatus; note: string | null;
  extracted: Product | null; sourceJson: string | null; stages: StageResult[];
  /** The record's latest pipeline run; the review form echoes it so the API can refuse a decision on stale data. */
  extractedAt?: string | null };
export type Batch = { batchId: string; status: string; runAt: string; itemCount: number; items: BatchItem[] };

export async function listBatches(): Promise<Batch[]> {
  const res = await read(`${base()}/v1/batches`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch[];
}

export async function getBatch(id: string): Promise<Batch | null> {
  const res = await read(`${base()}/v1/batches/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch;
}

export type StageCounts = { ok: number; warn: number; fail: number };
export type ItemNote = { conceptId: string; stage: string; note: string };
export type BatchRun = { id?: number; runAt: string; stages: string[]; counts: Record<string, StageCounts>; conceptIds: string[] };
export type BatchReport = {
  counts: Record<string, StageCounts>;
  review: { pending: number; ok: number; issue: number };
  warnings: ItemNote[];
  fails: ItemNote[];
  /** The last 5 pipeline runs; conceptIds is empty for a full run. */
  runs: BatchRun[];
  /** Latest full run minus the one before, per stage; null when there are fewer than two full runs. */
  deltaVsPrevious: Record<string, StageCounts> | null;
};

/** null for an unknown batch. */
export async function getBatchReport(id: string): Promise<BatchReport | null> {
  const res = await read(`${base()}/v1/batches/${encodeURIComponent(id)}/report`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as BatchReport;
}

/** One decision as shown on the batch page: the role, never the reviewer's email. */
export type PublicDecision = { decision: "ok" | "issue"; note: string; role: string; decidedAt: string };

/** The decision history, newest first. The mapping keeps only the fields a page may show, never an email. */
export async function getDecisions(batchId: string, conceptId: string): Promise<PublicDecision[]> {
  const res = await read(`${base()}/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no decision list");
  return data.map((d: PublicDecision) => ({ decision: d.decision, note: d.note ?? "", role: d.role, decidedAt: d.decidedAt }));
}

export type Substance = {
  bdsId: string; preferredName: string;
  names: { name: string; nameType: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; source: string; method: string; confidence: number }[];
  coverage: { coverage: "full" | "none"; note: string };
  products: { conceptId: string; tradeName: string; company: string }[];
  interactions: { partnerName: string; partnerBdsId: string | null; severity: string; actions: string[];
    interactionId: string | null; routeScope: string }[];
  diseases: { diseaseName: string; severity: string; text: string | null; refs: string[]; interactionId: string;
    routeScope: string }[];
  foods: { food: string; severity: string; mechanism: string | null; description: string | null; management: string | null;
    refs: string[]; interactionId: string; routeScope: string }[];
};

export async function getSubstance(id: string): Promise<Substance | HiddenSubstance | null> {
  const res = await read(`${base()}/v1/substances/${encodeURIComponent(id)}?scope=public`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Substance | HiddenSubstance;
}

export type AlertSide = { conceptId: string; bdsId: string; name: string };
export type Alert = {
  severity: string; a: AlertSide; b: AlertSide; actions: string[]; interaction: string | null;
  management: string | null; routeAssumed: boolean; source: string;
};
export type CheckResult = {
  products: { conceptId: string; tradeName: string; substances: { bdsId: string | null; name: string; coverage: string }[] }[];
  alerts: Alert[];
  duplicates: { bdsId: string; name: string; conceptIds: string[] }[];
  /** Substances the checker has no interaction data for: never to be read as "no interactions". */
  noData: { conceptId: string; bdsId: string | null; name: string }[];
  /** Products left out because no pharmacist has approved them yet: never to be read as "no interactions". */
  notReviewed: { conceptId: string }[];
};
export type CheckOutcome = { result: CheckResult | null; error: string | null };

export async function checkInteractions(conceptIds: string[]): Promise<CheckOutcome> {
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/interactions/check?scope=public`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptIds }),
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { result: null, error: "The interaction checker is temporarily unavailable. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { result: null, error: body?.errors?.[0]?.message ?? "Interaction check failed" };
  const d = body?.data;
  if (!d || !["products", "alerts", "duplicates", "noData", "notReviewed"].every((k) => Array.isArray(d[k])))
    return { result: null, error: "Interaction check failed" };
  return { result: d as CheckResult, error: null };
}

// ---- Writes: every one carries the internal token; the web server makes them only from checked server actions. ----

export type WriteResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function write<T>(path: string, payload: unknown): Promise<WriteResult<T>> {
  const token = internalToken();
  if (!token) return { ok: false, status: 0, error: "The internal API token is not configured" };
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 0, error: "The API is unavailable" };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: body?.errors?.[0]?.message ?? `API error ${res.status}` };
  return { ok: true, data: body?.data as T };
}

export type DecisionRequest = {
  decision: "ok" | "issue"; note: string; reviewerEmail: string; reviewerRole: "pharmacist" | "engineer";
  /**
   * The item's extractedAt as shown on the page (null when it has none). Required by the API: it refuses (409) a
   * decision when the record was re-run since, and (400) a body without the field.
   */
  extractedAt: string | null;
};

export async function postDecision(batchId: string, conceptId: string, d: DecisionRequest):
    Promise<WriteResult<{ review: string; batchStatus: string }>> {
  const payload = { decision: d.decision, note: d.note, reviewerEmail: d.reviewerEmail, reviewerRole: d.reviewerRole,
    extractedAt: d.extractedAt };
  const r = await write<{ review: string; batchStatus: string }>(
    `/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`, payload);
  return r.ok ? { ok: true, data: { review: r.data?.review, batchStatus: r.data?.batchStatus } } : r;
}

export type FlagTarget = "product" | "substance" | "check";
export type FlagRequest = { targetType: FlagTarget; targetId: string; message: string; reporterEmail: string };
/** A flag as the /flags page shows it: no reporter or resolver email. */
export type Flag = { id: number; targetType: string; targetId: string; message: string; status: string; createdAt: string };

export async function createFlag(f: FlagRequest): Promise<WriteResult<unknown>> {
  return write<unknown>("/v1/flags", f);
}

/** Open (or resolved) flags; needs the token. Emails are dropped here so no page can render them. */
export async function listFlags(status: "open" | "resolved" = "open"): Promise<Flag[]> {
  const token = internalToken();
  if (!token) throw new Error("The internal API token is not configured");
  const res = await read(`${base()}/v1/flags?status=${status}`, { [TOKEN_HEADER]: token });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no flag list");
  return data.map((f: Flag) => ({ id: f.id, targetType: f.targetType, targetId: f.targetId, message: f.message,
    status: f.status, createdAt: f.createdAt }));
}

export async function resolveFlag(id: number, resolvedBy: string): Promise<WriteResult<unknown>> {
  return write<unknown>(`/v1/flags/${encodeURIComponent(String(id))}/resolve`, { resolvedBy });
}
```

In `web/lib/reviewers.ts` append:

```ts
/** True for a pharmacist or engineer session; every other session (and none) sees public data only. */
export function isReviewer<S extends { role: string }>(session: S | null | undefined): session is S & { role: ReviewerRole } {
  return session?.role === "pharmacist" || session?.role === "engineer";
}
```

In `web/components/badges.tsx` delete the whole `UnreviewedBadge` function and its comment.

Replace `web/app/page.tsx` with:

```tsx
import { searchProducts } from "@/lib/api";
import { firstParam } from "@/lib/params";
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const page = firstParam(sp.page) || "0";
  const pageNum = Math.max(0, Number.parseInt(page, 10) || 0);
  // Public scope for every session, reviewers included (spec §2.2): only approved products are listed.
  const { items, error } = await searchProducts(q, pageNum);
  return (
    <>
      <form method="get" role="search">
        <input name="q" defaultValue={q} placeholder="Brand or ingredient, e.g. napa, amphotericin" minLength={2} maxLength={100} />
        <button type="submit">Search</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {q.trim().length >= 2 && !error && items.length === 0 && <p>No products found.</p>}
      <ul>
        {items.map((p) => (
          <li key={p.conceptId}>
            <a href={`/products/${encodeURIComponent(p.conceptId)}`}>{p.tradeName}</a>{" "}
            {p.dosageForm}: {p.genericContentRaw} <small>({p.company})</small>
          </li>
        ))}
      </ul>
      {items.length === 20 && <a href={`/?q=${encodeURIComponent(q)}&page=${pageNum + 1}`}>Next page</a>}
    </>
  );
}
```

In `web/app/products/[id]/page.tsx`:
- `import { Badge, UnreviewedBadge } from "@/components/badges";` → `import { Badge } from "@/components/badges";`
- `import { getProduct, isHidden, scopeFor, type DdinterRef } from "@/lib/api";` → `import { getProduct, isHidden, type DdinterRef } from "@/lib/api";`
- replace

```tsx
  const scope = scopeFor(session);
  const p = await getProduct(decoded, scope);
```

with

```tsx
  const p = await getProduct(decoded);   // public scope for every session (spec §2.2)
```

- `<h1>{p.tradeName}<UnreviewedBadge scope={scope} reviewStatus={p.reviewStatus} /></h1>` → `<h1>{p.tradeName}</h1>`

In `web/app/substances/[id]/page.tsx`:
- `import { Badge, UnreviewedBadge } from "@/components/badges";` → `import { Badge } from "@/components/badges";`
- `import { getSubstance, isHidden, scopeFor } from "@/lib/api";` → `import { getSubstance, isHidden } from "@/lib/api";`
- replace

```tsx
  const scope = scopeFor(session);
  const s = await getSubstance(decoded, scope);
```

with

```tsx
  const s = await getSubstance(decoded);   // public scope for every session (spec §2.2)
```

- replace

```tsx
          <li key={p.conceptId}><a href={`/products/${encodeURIComponent(p.conceptId)}`}>{p.tradeName}</a>{` (${p.company})`}
            <UnreviewedBadge scope={scope} reviewStatus={p.reviewStatus} /></li>))}</ul>)}
```

with

```tsx
          <li key={p.conceptId}><a href={`/products/${encodeURIComponent(p.conceptId)}`}>{p.tradeName}</a>{` (${p.company})`}</li>))}</ul>)}
```

In `web/app/check/page.tsx`:
- `import { checkInteractions, listLoadedProducts, scopeFor, type AlertSide, type CheckOutcome, type CheckResult } from "@/lib/api";` → `import { checkInteractions, listLoadedProducts, type AlertSide, type CheckOutcome, type CheckResult } from "@/lib/api";`
- replace `async function loadOptions(scope: "public" | "all"): Promise<Option[] | null> {` with `async function loadOptions(): Promise<Option[] | null> {` and `return (await listLoadedProducts(scope)).map(` with `return (await listLoadedProducts()).map(`;
- delete the line `  const scope = scopeFor(session);`;
- replace

```tsx
    loadOptions(scope),
    checkable ? checkInteractions(ids, scope) : Promise.resolve<CheckOutcome | null>(null),
```

with

```tsx
    loadOptions(),   // public scope for every session (spec §2.2)
    checkable ? checkInteractions(ids) : Promise.resolve<CheckOutcome | null>(null),
```

- replace `<legend>{scope === "all" ? "Loaded products (reviewer view: includes unreviewed products)" : "Products reviewed by a pharmacist"}</legend>` with `<legend>Products reviewed by a pharmacist</legend>`.

In `web/app/flags/page.tsx`:
- `import { listFlags, scopeFor, type Flag } from "@/lib/api";` → `import { listFlags, type Flag } from "@/lib/api";` and add `import { isReviewer } from "@/lib/reviewers";`;
- `if (scopeFor(session) !== "all") {` → `if (!isReviewer(session)) {`.

In `web/app/batches/[id]/page.tsx` (it still imports `scopeFor`; without this edit `next build` fails with TS2305 "Module '@/lib/api' has no exported member 'scopeFor'", and `tests/batch-page.test.tsx`, which mocks `@/lib/api` through `importOriginal`, fails with `scopeFor is not a function`):
- in the `@/lib/api` import, `getBatch, getBatchReport, getDecisions, scopeFor, type BatchReport,` → `getBatch, getBatchReport, getDecisions, type BatchReport,`;
- `import { ROLE_LABEL, type Role } from "@/lib/reviewers";` → `import { ROLE_LABEL, isReviewer, type Role } from "@/lib/reviewers";`;
- `const reviewer = scopeFor(session) === "all" && session ? session : null;` → `const reviewer = isReviewer(session) ? session : null;`.

- [ ] **Step 4: Run the tests and the build to verify they pass**

Run: `cd web && API_URL=http://api:8080 npm test && npm run build`
Expected: every vitest file passes; `next build` completes (type check included) and the postbuild client-bundle scan passes.

- [ ] **Step 5: Commit**

```bash
git add web/lib/api.ts web/lib/reviewers.ts web/components/badges.tsx web/app/page.tsx "web/app/products/[id]/page.tsx" \
  "web/app/substances/[id]/page.tsx" web/app/check/page.tsx web/app/flags/page.tsx "web/app/batches/[id]/page.tsx" \
  web/tests/api-scope.test.ts web/tests/home-page.test.tsx web/tests/product-page.test.tsx web/tests/substance-page.test.tsx \
  web/tests/check-page.test.tsx web/tests/reviewers.test.ts
git commit -m "fix(web): public pages read with public scope for every session

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Web — reviewer-only `/batches` pages that echo the version and a `requestId`

Implements the §12.1 phase-0 adjustments for the current batch pages: data only for pharmacist and engineer sessions (others get status 200 and "Only pharmacists and engineers can see batches."), reads with the token (A1, A2), review forms echo `expectedLastDecisionId` and a server-rendered `requestId` (§7.2), and every new 409 field maps to its own fixed message. Review Focus 5.

**Files:**
- Modify: `web/lib/api.ts` (batch reads and writes), `web/lib/actions-core.ts`, `web/lib/copy.ts`
- Modify: `web/app/batches/page.tsx` (whole file), `web/app/batches/[id]/page.tsx` (whole file)
- Test: `web/tests/batch-page.test.tsx` (whole file), `web/tests/batches-page.test.tsx` (new), `web/tests/review-actions.test.ts`, `web/tests/api-scope.test.ts`, `web/tests/api.test.ts`

**Interfaces:**
- Consumes: `isReviewer()` (Task 10); API: A1/A2 token reads, `BatchItem.lastDecisionId` (Task 7), the §7.2 body keys, `Outcome` and 409 fields (Task 8a), the 200 replay and `requestId` 400 (Task 8b).
- Produces:
  - `listBatches()`, `getBatch(id)`, `getBatchReport(id)`, `getDecisions(batchId, conceptId)` send the token and throw `"The internal API token is not configured"` without one (no API call);
  - `BatchItem.lastDecisionId?: number | null`;
  - `DecisionRequest` adds `expectedLastDecisionId: number | null` and `requestId: string`; `postDecision(...)` returns `WriteResult<DecisionOutcome>`, `DecisionOutcome = { review: string; displayStatus: string; batchStatus: string; replayed: boolean }`;
  - `WriteResult` failure carries `field: string | null`;
  - `ReviewCode = "saved" | "forbidden" | "captcha" | "invalid" | "stale" | "decided" | "checks" | "issue_open" | "approved" | "checked" | "removed" | "failed"`;
  - `BATCHES_REVIEWERS_ONLY = "Only pharmacists and engineers can see batches."` in `web/lib/copy.ts`;
  - module-private helpers in `web/lib/api.ts` whose names and signatures P1B relies on (its prerequisite check greps `async function reviewerRead`), so they must not be renamed or inlined: `async function reviewerRead(path: string): Promise<Response>`, `const read = (url: string, headers: Record<string, string> = {}) => …`, `async function write<T>(path: string, payload: unknown): Promise<WriteResult<T>>`, `function internalToken(): string | null`, `const base = () => …`, `const TOKEN_HEADER = "X-Internal-Token"`.

- [ ] **Step 1: Write the failing tests**

Replace `web/tests/batch-page.test.tsx` with:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Batch, BatchReport } from "@/lib/api";

const batch: Batch = {
  batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T00:00:00Z", itemCount: 1,
  items: [{
    conceptId: "N-1", review: "pending", note: null, sourceJson: null, extractedAt: "2026-10-12T09:00:00.123456Z",
    lastDecisionId: 41,
    extracted: { conceptId: "N-1", darNumber: "D", tradeName: "Napa", company: "Beximco", dosageForm: "Tablet",
      genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [], parseStatus: "parsed", parseNote: null,
      clinicalDrug: null },
    stages: [
      { stage: "dgda", status: "ok", note: "loaded", evidence: { concept: "N-1" } },
      { stage: "substances", status: "warn", note: "approx RxNav match", evidence: { rxcui: "161", method: "rxnav-approx" } },
      { stage: "clinical", status: "fail", note: "error: ValueError: <bad>", evidence: {} },
    ],
  }],
};
const report: BatchReport = {
  counts: { dgda: { ok: 9, warn: 0, fail: 1 }, substances: { ok: 7, warn: 2, fail: 0 } },
  review: { pending: 8, ok: 1, issue: 1 },
  warnings: [{ conceptId: "N-1", stage: "substances", note: "approx RxNav match" }],
  fails: [{ conceptId: "N-7", stage: "dgda", note: "not found at source" }],
  runs: [{ runAt: "2026-10-12T09:00:00Z", stages: ["dgda", "substances"], counts: {}, conceptIds: [] }],
  deltaVsPrevious: { dgda: { ok: 2, warn: 0, fail: -2 }, substances: { ok: 0, warn: 0, fail: 0 } },
};
const getBatch = vi.fn();
const getBatchReport = vi.fn();
const getDecisions = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBatch: (id: string) => getBatch(id),
  getBatchReport: (id: string) => getBatchReport(id),
  getDecisions: (b: string, c: string) => getDecisions(b, c),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import BatchPage from "@/app/batches/[id]/page";

const GATE = "Only pharmacists and engineers can see batches.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHARMACIST = { email: "pharm@example.org", role: "pharmacist" };
const render = async (sp: Record<string, string> = {}, id = "0001-pilot") => renderToStaticMarkup(await BatchPage({
  params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));
const forms = (html: string) => html.match(/<form[\s\S]*?<\/form>/g) ?? [];
const fieldValue = (form: string, name: string) =>
  form.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`))?.[1]
  ?? form.match(new RegExp(`<input[^>]*value="([^"]*)"[^>]*name="${name}"`))?.[1];

beforeEach(() => {
  getBatch.mockReset(); getBatch.mockResolvedValue(batch);
  getBatchReport.mockReset(); getBatchReport.mockResolvedValue(report);
  getDecisions.mockReset();
  getDecisions.mockResolvedValue([
    { decision: "issue", note: "Strength wrong", role: "engineer", decidedAt: "2026-10-12T10:05:00Z" },
    { decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T09:30:00Z" },
  ]);
  getSession.mockReset(); getSession.mockResolvedValue(PHARMACIST);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("batch page gate (spec §12.1, phase 0)", () => {
  it.each([null, { email: "someone@gmail.com", role: "user" }])("shows only the gate line to %o, with no API call", async (s) => {
    getSession.mockResolvedValue(s);
    const html = await render();
    expect(html).toContain(GATE);
    for (const absent of ["Napa", "Paracetamol", "Batch report", "Mark OK", "someone@gmail.com"]) expect(html).not.toContain(absent);
    expect(getBatch).not.toHaveBeenCalled();
    expect(getBatchReport).not.toHaveBeenCalled();
    expect(getDecisions).not.toHaveBeenCalled();
  });

  it("an anonymous visitor gets the gate even for an unknown batch, with no API call", async () => {
    getSession.mockResolvedValue(null);
    getBatch.mockResolvedValue(null);
    expect(await render({}, "no-such-batch")).toContain(GATE);
    expect(getBatch).not.toHaveBeenCalled();
  });

  it("a reviewer gets a 404 for an unknown batch", async () => {
    getBatch.mockResolvedValue(null);
    await expect(render({}, "no-such-batch")).rejects.toThrow();
  });
});

describe("batch page (reviewers)", () => {
  it("shows a stage table in pipeline order with status pills, notes and collapsible evidence", async () => {
    const html = await render();
    const order = ["dgda", "substances", "clinical", "ddinter"].map((s) => html.search(new RegExp(`<td[^>]*>${s}</td>`)));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/<span class="pill pill-ok"[^>]*>ok<\/span>/);
    expect(html).toMatch(/<span class="pill pill-warn"[^>]*>warn<\/span>/);
    expect(html).toMatch(/<span class="pill pill-fail"[^>]*>fail<\/span>/);
    expect(html).toMatch(/<span class="pill pill-none"[^>]*>not run<\/span>/);
    expect(html).toContain("error: ValueError: &lt;bad&gt;");
    expect(html).toContain("<details><summary>Evidence</summary>");
  });

  it("shows the approval status and the report: stage counts, review counts, warnings, fails and the delta", async () => {
    const html = await render();
    expect(getBatchReport).toHaveBeenCalledWith("0001-pilot");
    expect(html).toContain("Approval: in review");
    expect(html).toMatch(/<tr><td>dgda<\/td><td>9<\/td><td>0<\/td><td>1<\/td><td>\+2 \/ 0 \/ −2<\/td><\/tr>/);
    expect(html).toContain("Review: 1 OK · 1 issue · 8 pending");
    expect(html).toMatch(/<h3>Fails \(1\)<\/h3><ul><li><a href="#N-7">N-7<\/a> · dgda: not found at source<\/li><\/ul>/);
  });

  it("copes without a report or a previous run", async () => {
    getBatchReport.mockRejectedValue(new Error("API error 500"));
    expect(await render()).toContain("The batch report is temporarily unavailable.");
    getBatchReport.mockResolvedValue({ ...report, deltaVsPrevious: {} });
    expect(await render()).toContain("No previous full run to compare with.");
  });

  it("shows the decision history with decision, role and time, never an email", async () => {
    const html = await render();
    expect(getDecisions).toHaveBeenCalledWith("0001-pilot", "N-1");
    expect(html).toContain("Issue · Engineer · 2026-10-12 10:05 UTC: Strength wrong");
    expect(html).toContain("OK · Pharmacist · 2026-10-12 09:30 UTC");
    expect(html).not.toContain("@");
  });

  it("review forms echo extractedAt, lastDecisionId and a server-rendered requestId per form", async () => {
    const fs = forms(await render());
    expect(fs).toHaveLength(2);
    const [okForm, issueForm] = fs;
    expect(okForm).toContain(">Mark OK</button>");
    expect(issueForm).toContain(">Report issue</button>");
    for (const f of fs) {
      expect(fieldValue(f, "batchId")).toBe("0001-pilot");
      expect(fieldValue(f, "conceptId")).toBe("N-1");
      expect(fieldValue(f, "extractedAt")).toBe("2026-10-12T09:00:00.123456Z");
      expect(fieldValue(f, "expectedLastDecisionId")).toBe("41");
      expect(fieldValue(f, "requestId")).toMatch(UUID);
      expect(f).toContain('class="cf-turnstile"');
      expect(f).not.toContain("reviewerEmail");
    }
    expect(fieldValue(okForm, "requestId")).not.toBe(fieldValue(issueForm, "requestId"));
  });

  it("echoes a null extractedAt and a null lastDecisionId as empty fields", async () => {
    getBatch.mockResolvedValue({ ...batch, items: [{ ...batch.items[0], extractedAt: null, lastDecisionId: null }] });
    for (const f of forms(await render())) {
      expect(fieldValue(f, "extractedAt")).toBe("");
      expect(fieldValue(f, "expectedLastDecisionId")).toBe("");
    }
  });

  it("shows the outcome of a review next to the item, for known codes only", async () => {
    const cases: [string, string][] = [
      ["saved", "Your decision was recorded."],
      ["stale", "re-run after you opened the page"],
      ["decided", "Another reviewer decided on this record after you opened the page"],
      ["checks", "A check failed on this record. It returns to review after the fix and re-run."],
      ["issue_open", "An issue is open on this record. It returns to review after the fix and re-run."],
      ["approved", "This record is already approved by a pharmacist."],
      ["checked", "Your check is already recorded for this record."],
      ["removed", "This record was removed from the batch file."],
    ];
    for (const [code, text] of cases) expect(await render({ review: code, item: "N-1" })).toContain(text);
    const weird = await render({ review: "<script>x</script>", item: "N-1" });
    expect(weird).not.toContain("<script>x");
    expect(weird).not.toContain('role="alert"');
  });
});
```

Create `web/tests/batches-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listBatches = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBatches: () => listBatches(),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import Batches from "@/app/batches/page";

beforeEach(() => {
  listBatches.mockReset();
  listBatches.mockResolvedValue([{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-12T09:00:00Z", itemCount: 10, items: [] }]);
  getSession.mockReset();
});

describe("/batches (spec §12.1, phase 0)", () => {
  it.each([null, { email: "someone@gmail.com", role: "user" }])("shows only the gate line to %o, with no API call", async (s) => {
    getSession.mockResolvedValue(s);
    const html = renderToStaticMarkup(await Batches());
    expect(html).toContain("Only pharmacists and engineers can see batches.");
    expect(html).not.toContain("0001-pilot");
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("lists the batches for a reviewer", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", role: "engineer" });
    const html = renderToStaticMarkup(await Batches());
    expect(html).toContain('<a href="/batches/0001-pilot">0001-pilot</a>');
    expect(html).not.toContain("eng@example.org");
  });
});
```

In `web/tests/review-actions.test.ts`:
- after `const USER = …;` add `const REQ = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";`;
- replace the `review` helper with

```ts
const review = (over: Record<string, string> = {}) => form({ batchId: "0001-pilot", conceptId: "N-1", decision: "ok",
  note: "", extractedAt: "2026-10-12T09:00:00Z", expectedLastDecisionId: "41", requestId: REQ,
  "cf-turnstile-response": "ts-token", ...over });
```

- in "a pharmacist's OK calls the API …" change the expected body to

```ts
    expect(JSON.parse(init.body)).toEqual({ decision: "ok", note: "", reviewerEmail: "pharm@example.org",
      reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00Z", expectedLastDecisionId: 41, requestId: REQ });
```

- in "takes the reviewer's email and role from the session …" change the expected body to

```ts
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: "issue", note: "Strength is 250 mg, not 500 mg",
      reviewerEmail: "eng@example.org", reviewerRole: "engineer", extractedAt: "2026-10-12T09:00:00Z",
      expectedLastDecisionId: 41, requestId: REQ });
```

- append inside `describe("submitReview (review decision server action)", …)`:

```ts
  it("sends expectedLastDecisionId as null when the item has no decision, and refuses a malformed one or requestId", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    expect(await submitReview(review({ expectedLastDecisionId: "" }))).toMatchObject({ status: 200 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedLastDecisionId).toBeNull();
    for (const bad of [{ expectedLastDecisionId: "abc" }, { expectedLastDecisionId: "0" }, { expectedLastDecisionId: "-1" },
      { expectedLastDecisionId: "1".repeat(16) }, { requestId: "" }, { requestId: "not-a-uuid" }])
      expect(await submitReview(review(bad))).toMatchObject({ status: 400, code: "invalid" });
    const noId = review(); noId.delete("expectedLastDecisionId");
    expect(await submitReview(noId)).toMatchObject({ status: 400, code: "invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a replayed decision (the same form sent again) is reported as saved", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    fetchMock.mockResolvedValue(ok({ review: "ok", displayStatus: "approved", batchStatus: "approved", replayed: true }, 200));
    expect(await submitReview(review())).toMatchObject({ status: 200, code: "saved" });
  });

  it("maps each 409 field from the API to its own outcome code", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    const cases: [string, string, string][] = [
      ["extractedAt", "This record was re-run after the page was loaded; reload it and review again", "stale"],
      ["lastDecisionId", "Another reviewer decided on this record after the page was loaded; reload it and review again", "decided"],
      ["stages", "A check failed on this record. It returns to review after the fix and re-run.", "checks"],
      ["review", "An issue is open on this record. It returns to review after the fix and re-run.", "issue_open"],
      ["review", "This record is already approved by a pharmacist", "approved"],
      ["review", "Your check is already recorded for this record", "checked"],
      ["conceptId", "This record was removed from the batch file", "removed"],
    ];
    for (const [field, message, code] of cases) {
      fetchMock.mockResolvedValueOnce(new Response(
        JSON.stringify({ success: false, errors: [{ field, code: "CONFLICT", message }] }), { status: 409 }));
      expect(await submitReview(review())).toMatchObject({ status: 409, code });
    }
  });
```

In `web/tests/api-scope.test.ts`:
- change the import to

```ts
import {
  checkInteractions, createFlag, getBatch, getBatchReport, getDecisions, getProduct, getSubstance, isHidden, listBatches,
  listFlags, listLoadedProducts, postDecision, resolveFlag, searchProducts,
} from "../lib/api";
```

- replace the whole `describe("batch report and decision history", …)` block with

```ts
describe("batch reads (reviewers only, A1 and A2)", () => {
  it("listBatches, getBatch and getBatchReport send the internal token; null on 404", async () => {
    await listBatches();
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/batches");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBe(TOKEN);
    f.mockResolvedValue(ok({ batchId: "0001 pilot", items: [] }));
    await getBatch("0001 pilot");
    expect(f.mock.calls[1][0]).toBe("http://api:8080/v1/batches/0001%20pilot");
    expect(headerOf(f.mock.calls[1][1], "X-Internal-Token")).toBe(TOKEN);
    const report = { counts: {}, review: { pending: 1, ok: 0, issue: 0 }, warnings: [], fails: [], runs: [], deltaVsPrevious: {} };
    f.mockResolvedValue(ok(report));
    expect(await getBatchReport("0001 pilot")).toEqual(report);
    expect(f.mock.calls[2][0]).toBe("http://api:8080/v1/batches/0001%20pilot/report");
    expect(headerOf(f.mock.calls[2][1], "X-Internal-Token")).toBe(TOKEN);
    f.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await getBatchReport("nope")).toBeNull();
    expect(await getBatch("nope")).toBeNull();
  });

  it("refuses batch reads without a configured token (no API call)", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    await expect(listBatches()).rejects.toThrow("internal API token");
    await expect(getBatch("B")).rejects.toThrow("internal API token");
    await expect(getBatchReport("B")).rejects.toThrow("internal API token");
    await expect(getDecisions("B", "N")).rejects.toThrow("internal API token");
    expect(f).not.toHaveBeenCalled();
  });

  it("getDecisions reads with the token and keeps only decision, note, role and time", async () => {
    f.mockResolvedValue(ok([
      { decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T10:00:00Z", reviewerEmail: "pharm@example.org" },
    ]));
    const list = await getDecisions("0001-pilot", "N/1");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/batches/0001-pilot/items/N%2F1/decisions");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBe(TOKEN);
    expect(list).toEqual([{ decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T10:00:00Z" }]);
    expect(JSON.stringify(list)).not.toContain("pharm@example.org");
  });
});
```

- replace the three `postDecision` tests ("postDecision POSTs the decision …", "postDecision always sends extractedAt …", "postDecision reports the status …") with

```ts
  const DECISION = { decision: "ok" as const, note: "", reviewerEmail: "pharm@example.org", reviewerRole: "pharmacist" as const,
    extractedAt: "2026-10-12T09:00:00Z", expectedLastDecisionId: 41, requestId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" };

  it("postDecision POSTs the decision, the version and the requestId with the token", async () => {
    f.mockResolvedValue(ok({ batchId: "B", conceptId: "N-1", review: "ok", displayStatus: "approved", batchStatus: "approved",
      version: { extractedAt: "2026-10-12T09:00:00Z", lastDecisionId: 42 }, replayed: false }, 201));
    const r = await postDecision("B 1", "N/1", DECISION);
    expect(r).toEqual({ ok: true, data: { review: "ok", displayStatus: "approved", batchStatus: "approved", replayed: false } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/batches/B%201/items/N%2F1/decisions");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Internal-Token")).toBe(TOKEN);
    expect(headerOf(init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(DECISION);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("postDecision always sends extractedAt and expectedLastDecisionId, as explicit nulls when the item has none", async () => {
    f.mockResolvedValue(ok({ review: "pending", displayStatus: "pending", batchStatus: "in_review", replayed: false }, 201));
    await postDecision("B", "N", { ...DECISION, decision: "issue", note: "wrong strength", extractedAt: null,
      expectedLastDecisionId: null });
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent).toHaveProperty("extractedAt", null);
    expect(sent).toHaveProperty("expectedLastDecisionId", null);
  });

  it("postDecision reports the status, message and field on failure, and a network error as status 0", async () => {
    f.mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ field: "stages", message: "A check failed" }] }),
      { status: 409 }));
    expect(await postDecision("B", "N", DECISION)).toEqual({ ok: false, status: 409, error: "A check failed", field: "stages" });
    f.mockResolvedValue(fail(409, "The record was re-run"));
    expect(await postDecision("B", "N", DECISION)).toEqual({ ok: false, status: 409, error: "The record was re-run", field: null });
    f.mockRejectedValue(new TypeError("fetch failed"));
    expect(await postDecision("B", "N", DECISION)).toEqual({ ok: false, status: 0, error: "The API is unavailable", field: null });
  });
```

- in "writes refuse to run without a configured internal token" change the first expectation to

```ts
    expect(await postDecision("B", "N", { decision: "ok", note: "", reviewerEmail: "a@b", reviewerRole: "pharmacist",
      extractedAt: null, expectedLastDecisionId: null, requestId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }))
      .toEqual({ ok: false, status: 0, error: "The internal API token is not configured", field: null });
```

- in "resolveFlag passes the API status through" change the expectation to `.toEqual({ ok: false, status: 409, error: "Flag already resolved", field: null });`.

In `web/tests/api.test.ts`:
- change `beforeEach(() => vi.stubEnv("API_URL", "http://api:8080"));` to

```ts
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token-0123456789abcdef");
});
```

- in "getBatch URL-encodes the id and passes timeout and no-store" add after the URL assertion:

```ts
    expect(new Headers(f.mock.calls[0][1].headers).get("X-Internal-Token")).toBe("test-internal-token-0123456789abcdef");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/batch-page.test.tsx tests/batches-page.test.tsx tests/review-actions.test.ts tests/api-scope.test.ts tests/api.test.ts`
Expected: FAIL — the gate tests (data is rendered for anonymous visitors), the form tests (`expectedLastDecisionId` field missing), the new outcome codes, the token assertions on batch reads (`null` instead of the token), and `field` missing from failure results.

- [ ] **Step 3: Implement the API client changes**

In `web/lib/api.ts`:

Replace the `BatchItem` type with

```ts
export type BatchItem = { conceptId: string; review: ReviewStatus; note: string | null;
  extracted: Product | null; sourceJson: string | null; stages: StageResult[];
  /** The record's latest pipeline run; the review form echoes it so the API can refuse a decision on stale data. */
  extractedAt?: string | null;
  /** The newest decision's id (null when none); the review form echoes it as expectedLastDecisionId (§7.2 step 3). */
  lastDecisionId?: number | null };
```

Replace `listBatches` and `getBatch` with

```ts
/** Batch evidence shows unreviewed records: reviewers only (A1). These reads carry the token and fail without one. */
async function reviewerRead(path: string): Promise<Response> {
  const token = internalToken();
  if (!token) throw new Error("The internal API token is not configured");
  return read(`${base()}${path}`, { [TOKEN_HEADER]: token });
}

export async function listBatches(): Promise<Batch[]> {
  const res = await reviewerRead("/v1/batches");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch[];
}

export async function getBatch(id: string): Promise<Batch | null> {
  const res = await reviewerRead(`/v1/batches/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch;
}
```

Replace `getBatchReport` and `getDecisions` (with their comments) with

```ts
/** Reviewers only, with the token (A1). null for an unknown batch. */
export async function getBatchReport(id: string): Promise<BatchReport | null> {
  const res = await reviewerRead(`/v1/batches/${encodeURIComponent(id)}/report`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as BatchReport;
}

/** One decision as shown on the batch page: the role, never the reviewer's email. */
export type PublicDecision = { decision: "ok" | "issue"; note: string; role: string; decidedAt: string };

/**
 * The decision history, newest first. The API serves it only with the token (A2), and then includes emails; the
 * mapping keeps only the fields a page may show, so no email can reach a page.
 */
export async function getDecisions(batchId: string, conceptId: string): Promise<PublicDecision[]> {
  const res = await reviewerRead(`/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no decision list");
  return data.map((d: PublicDecision) => ({ decision: d.decision, note: d.note ?? "", role: d.role, decidedAt: d.decidedAt }));
}
```

Replace `WriteResult` and `write` with

```ts
export type WriteResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; field: string | null };

async function write<T>(path: string, payload: unknown): Promise<WriteResult<T>> {
  const token = internalToken();
  if (!token) return { ok: false, status: 0, error: "The internal API token is not configured", field: null };
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 0, error: "The API is unavailable", field: null };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: body?.errors?.[0]?.message ?? `API error ${res.status}`,
    field: body?.errors?.[0]?.field ?? null };
  return { ok: true, data: body?.data as T };
}
```

Replace `DecisionRequest` and `postDecision` with

```ts
export type DecisionRequest = {
  decision: "ok" | "issue"; note: string; reviewerEmail: string; reviewerRole: "pharmacist" | "engineer";
  /** The version the page showed (spec §7.2): both required by the API, null when the item has none. */
  extractedAt: string | null;
  expectedLastDecisionId: number | null;
  /** A UUID rendered with the form and reused on every resend, so a retry is answered once (§7.2 step 1). */
  requestId: string;
};
export type DecisionOutcome = { review: string; displayStatus: string; batchStatus: string; replayed: boolean };

export async function postDecision(batchId: string, conceptId: string, d: DecisionRequest):
    Promise<WriteResult<DecisionOutcome>> {
  const payload = { decision: d.decision, note: d.note, reviewerEmail: d.reviewerEmail, reviewerRole: d.reviewerRole,
    extractedAt: d.extractedAt, expectedLastDecisionId: d.expectedLastDecisionId, requestId: d.requestId };
  const r = await write<DecisionOutcome>(
    `/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`, payload);
  return r.ok ? { ok: true, data: { review: r.data?.review, displayStatus: r.data?.displayStatus,
    batchStatus: r.data?.batchStatus, replayed: r.data?.replayed === true } } : r;
}
```

Append to `web/lib/copy.ts`:

```ts
/** Phase 0 (spec §12.1): what anonymous and `user` sessions see on /batches and /batches/[id] (status 200). */
export const BATCHES_REVIEWERS_ONLY = "Only pharmacists and engineers can see batches.";
```

- [ ] **Step 4: Implement the action changes**

In `web/lib/actions-core.ts`:

Replace `export type ReviewCode = "saved" | "forbidden" | "captcha" | "invalid" | "stale" | "failed";` with

```ts
export type ReviewCode = "saved" | "forbidden" | "captcha" | "invalid" | "stale" | "decided" | "checks" | "issue_open"
  | "approved" | "checked" | "removed" | "failed";
```

After `const ID_MAX = 200;` add

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISION_ID_RE = /^[1-9][0-9]{0,14}$/;
/** The API's step 6 to 8 messages (spec §7.2), which share the field `review`. */
const REVIEW_REFUSALS: Record<string, ReviewCode> = {
  "An issue is open on this record. It returns to review after the fix and re-run.": "issue_open",
  "This record is already approved by a pharmacist": "approved",
  "Your check is already recorded for this record": "checked",
};

/** A 409 from the decision endpoint, by its `field` (spec §7.2). Anything unknown asks for a reload. */
function conflictCode(field: string | null, message: string): ReviewCode {
  switch (field) {
    case "lastDecisionId": return "decided";
    case "stages": return "checks";
    case "conceptId": return "removed";
    case "review": return REVIEW_REFUSALS[message] ?? "stale";
    default: return "stale";
  }
}
```

In `submitReview`, replace

```ts
  const extractedAt = rawExtractedAt || null;
```

with

```ts
  const extractedAt = rawExtractedAt || null;
  // The form also carries the newest decision id ("" when none, sent as null) and a requestId rendered with the page.
  const rawLast = fd.get("expectedLastDecisionId");
  if (typeof rawLast !== "string" || (rawLast !== "" && !DECISION_ID_RE.test(rawLast))) return { status: 400, code: "invalid" };
  const expectedLastDecisionId = rawLast === "" ? null : Number(rawLast);
  const requestId = field(fd, "requestId");
  if (!UUID_RE.test(requestId)) return { status: 400, code: "invalid" };
```

and replace

```ts
  const r = await postDecision(batchId, conceptId, { decision, note, reviewerEmail: session.email,
    reviewerRole: session.role, extractedAt });
  if (r.ok || r.status === 409) revalidatePath(batchPath(batchId));
  if (r.ok) return { status: 200, code: "saved" };
  if (r.status === 409) return { status: 409, code: "stale" };
```

with

```ts
  const r = await postDecision(batchId, conceptId, { decision, note, reviewerEmail: session.email,
    reviewerRole: session.role, extractedAt, expectedLastDecisionId, requestId });
  if (r.ok || r.status === 409) revalidatePath(batchPath(batchId));
  if (r.ok) return { status: 200, code: "saved" };   // a replayed request (200) is the same saved decision
  if (r.status === 409) return { status: 409, code: conflictCode(r.field, r.error) };
```

- [ ] **Step 5: Implement the pages**

Replace `web/app/batches/page.tsx` with:

```tsx
import { listBatches } from "@/lib/api";
import { BATCHES_REVIEWERS_ONLY } from "@/lib/copy";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
export const dynamic = "force-dynamic";

export default async function Batches() {
  // Batch evidence shows unreviewed records: reviewers only (spec §12.1). Status 200, so the deploy smoke check passes.
  if (!isReviewer(await getSession())) return <><h1>Batches</h1><p role="status">{BATCHES_REVIEWERS_ONLY}</p></>;
  const batches = await listBatches();
  return (
    <>
      <h1>Batches</h1>
      <table>
        <thead><tr><th>Batch</th><th>Status</th><th>Items</th><th>Run at (UTC)</th></tr></thead>
        <tbody>{batches.map((b) => (
          <tr key={b.batchId}><td><a href={`/batches/${encodeURIComponent(b.batchId)}`}>{b.batchId}</a></td><td>{b.status}</td>
            <td>{b.itemCount}</td><td>{b.runAt}</td></tr>))}</tbody>
      </table>
    </>
  );
}
```

Replace `web/app/batches/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import { StatusPill } from "@/components/badges";
import { ISSUE_NOTE_MIN, NOTE_MAX } from "@/lib/actions-core";
import {
  getBatch, getBatchReport, getDecisions, type BatchReport, type PublicDecision, type StageCounts, type StageResult,
} from "@/lib/api";
import { BATCHES_REVIEWERS_ONLY } from "@/lib/copy";
import { summariseSource } from "@/lib/evidence";
import { formatUtc } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { ROLE_LABEL, isReviewer, type Role } from "@/lib/reviewers";
import { reviewAction } from "@/lib/review-actions";
import { getSession } from "@/lib/session";
export const dynamic = "force-dynamic";

const cell = { verticalAlign: "top", border: "1px solid #ccc", padding: 8, width: "50%" } as const;
const stageCell = { verticalAlign: "top", border: "1px solid #ccc", padding: 6 } as const;
const STAGES = ["dgda", "substances", "clinical", "ddinter"] as const;

/** Fixed messages for the review action's outcome codes; anything else in the URL is ignored. */
const REVIEW_OUTCOME: Record<string, { text: string; ok: boolean }> = {
  saved: { text: "Your decision was recorded.", ok: true },
  forbidden: { text: "Only pharmacists and engineers can review. Sign in with a reviewer account.", ok: false },
  captcha: { text: "The verification check failed. Please try again.", ok: false },
  invalid: { text: `An issue needs a note of ${ISSUE_NOTE_MIN} to ${NOTE_MAX} characters.`, ok: false },
  stale: { text: "This record was re-run after you opened the page, so your decision was not recorded. Review the new result.", ok: false },
  decided: { text: "Another reviewer decided on this record after you opened the page, so your decision was not recorded. Review the record again.", ok: false },
  checks: { text: "A check failed on this record. It returns to review after the fix and re-run.", ok: false },
  issue_open: { text: "An issue is open on this record. It returns to review after the fix and re-run.", ok: false },
  approved: { text: "This record is already approved by a pharmacist.", ok: false },
  checked: { text: "Your check is already recorded for this record.", ok: false },
  removed: { text: "This record was removed from the batch file.", ok: false },
  failed: { text: "The decision could not be saved. Please try again.", ok: false },
};

const approvalLabel = (status: string) => status === "approved" ? "approved" : status === "in_review" ? "in review" : status;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const deltaText = (d: StageCounts | undefined) => d ? `${signed(d.ok)} / ${signed(d.warn)} / ${signed(d.fail)}` : "—";
const roleLabel = (role: string) => ROLE_LABEL[role as Role] ?? "Reviewer";
/** Pipeline stages first, in order, then any other stage by name. */
const stageOrder = (names: string[]) => [...new Set(names)].sort((a, b) => {
  const ia = (STAGES as readonly string[]).indexOf(a), ib = (STAGES as readonly string[]).indexOf(b);
  return (ia < 0 ? STAGES.length : ia) - (ib < 0 ? STAGES.length : ib) || a.localeCompare(b);
});

function Report({ report }: { report: BatchReport | null }) {
  if (!report) return <p role="alert">The batch report is temporarily unavailable.</p>;
  const delta = report.deltaVsPrevious ?? {};
  const hasDelta = Object.keys(delta).length > 0;
  const stages = stageOrder([...Object.keys(report.counts ?? {}), ...Object.keys(delta)]);
  const notes = (title: string, list: BatchReport["warnings"]) => (<>
    <h3>{`${title} (${list.length})`}</h3>
    {list.length === 0 ? <p>None.</p> : <ul>{list.map((w, n) => (
      <li key={`${w.conceptId}|${w.stage}|${n}`}><a href={`#${w.conceptId}`}>{w.conceptId}</a>{` · ${w.stage}: ${w.note}`}</li>))}</ul>}
  </>);
  return (
    <section>
      <h2>Batch report</h2>
      <p>{`Review: ${report.review.ok} OK · ${report.review.issue} issue · ${report.review.pending} pending`}</p>
      <table style={{ borderCollapse: "collapse" }}>
        <thead><tr><th>Stage</th><th>OK</th><th>Warn</th><th>Fail</th><th>Change vs previous full run (ok / warn / fail)</th></tr></thead>
        <tbody>{stages.map((name) => {
          const c = report.counts?.[name] ?? { ok: 0, warn: 0, fail: 0 };
          return <tr key={name}><td>{name}</td><td>{c.ok}</td><td>{c.warn}</td><td>{c.fail}</td><td>{deltaText(delta[name])}</td></tr>;
        })}</tbody>
      </table>
      {!hasDelta && <p><small>No previous full run to compare with.</small></p>}
      {notes("Warnings", report.warnings ?? [])}
      {notes("Fails", report.fails ?? [])}
      {(report.runs ?? []).length > 0 && (
        <details><summary>Recent runs</summary><ul>{report.runs.map((r, n) => (
          <li key={n}>{`${formatUtc(r.runAt)}: ${r.stages.join(", ")} · ${r.conceptIds.length === 0
            ? "full run" : `records ${r.conceptIds.join(", ")}`}`}</li>))}</ul></details>)}
    </section>
  );
}

/** Decision, role and time; never the reviewer's email (getDecisions drops it). */
function History({ decisions }: { decisions: PublicDecision[] | null }) {
  return (<>
    <h3>Review history</h3>
    {decisions === null ? <p>The review history is temporarily unavailable.</p>
      : decisions.length === 0 ? <p>No decisions yet.</p>
      : <ul>{decisions.map((d, n) => (
        <li key={n}>{`${d.decision === "ok" ? "OK" : "Issue"} · ${roleLabel(d.role)} · ${formatUtc(d.decidedAt)}${d.note ? `: ${d.note}` : ""}`}</li>))}</ul>}
  </>);
}

type ItemVersion = { extractedAt: string | null | undefined; lastDecisionId: number | null | undefined };

/** The item, the version the page shows (spec §7.2) and a requestId rendered once per form, reused if it is resent. */
function ItemFields({ batchId, conceptId, version, decision }:
    { batchId: string; conceptId: string; version: ItemVersion; decision: "ok" | "issue" }) {
  return (<>
    <input type="hidden" name="batchId" value={batchId} />
    <input type="hidden" name="conceptId" value={conceptId} />
    {/* Always present: "" stands for "none" (sent to the API as null). */}
    <input type="hidden" name="extractedAt" value={version.extractedAt ?? ""} />
    <input type="hidden" name="expectedLastDecisionId" value={version.lastDecisionId == null ? "" : String(version.lastDecisionId)} />
    <input type="hidden" name="requestId" value={crypto.randomUUID()} />
    <input type="hidden" name="decision" value={decision} />
  </>);
}

/** Reviewer controls. The server action re-checks the session, the role and Turnstile before calling the API. */
function ReviewForms({ batchId, conceptId, version, role }:
    { batchId: string; conceptId: string; version: ItemVersion; role: Role }) {
  return (
    <div>
      <form action={reviewAction}>
        <ItemFields batchId={batchId} conceptId={conceptId} version={version} decision="ok" />
        <Turnstile />
        <button type="submit">Mark OK</button>
      </form>
      <form action={reviewAction}>
        <ItemFields batchId={batchId} conceptId={conceptId} version={version} decision="issue" />
        <label>
          {`What is wrong? (${ISSUE_NOTE_MIN} to ${NOTE_MAX} characters)`}
          <br />
          <textarea name="note" required minLength={ISSUE_NOTE_MIN} maxLength={NOTE_MAX} rows={3} cols={60} />
        </label>
        <Turnstile />
        <button type="submit">Report issue</button>
      </form>
      {role === "engineer" && <p><small>An engineer&apos;s OK is recorded, but only a pharmacist&apos;s OK approves a record.</small></p>}
    </div>
  );
}

function Outcome({ code }: { code: string }) {
  const o = REVIEW_OUTCOME[code];
  return o ? <p role={o.ok ? "status" : "alert"}>{o.text}</p> : null;
}

function StageTable({ stages }: { stages: StageResult[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead><tr><th style={stageCell}>Stage</th><th style={stageCell}>Status</th><th style={stageCell}>Note</th></tr></thead>
      <tbody>{STAGES.map((name) => {
        const r = stages.find((x) => x.stage === name);
        return (
          <tr key={name}>
            <td style={stageCell}>{name}</td>
            <td style={stageCell}><StatusPill status={r?.status ?? null} /></td>
            <td style={stageCell}>{r ? (<>
              {r.note}
              <details><summary>Evidence</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(r.evidence ?? {}, null, 2)}</pre></details>
            </>) : "This stage has not run for this item."}</td>
          </tr>);
      })}</tbody>
    </table>
  );
}

export default async function BatchPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams?: Promise<{ review?: string | string[]; item?: string | string[] }> }) {
  // Batch evidence shows unreviewed records: reviewers only (spec §12.1). Checked before any API call, so an
  // anonymous visitor learns nothing, not even whether the batch exists (status 200, never 404).
  const session = await getSession();
  if (!isReviewer(session)) return <><h1>Batches</h1><p role="status">{BATCHES_REVIEWERS_ONLY}</p></>;
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const batch = await getBatch(decoded);
  if (!batch) notFound();
  const [report, histories] = await Promise.all([
    getBatchReport(batch.batchId).catch(() => null),
    Promise.all(batch.items.map((i) => getDecisions(batch.batchId, i.conceptId).catch(() => null))),
  ]);
  const outcome = firstParam(sp.review), outcomeItem = firstParam(sp.item);
  const itemIds = new Set(batch.items.map((i) => i.conceptId));
  return (
    <>
      <h1>Batch {batch.batchId}</h1>
      <p>{`Approval: ${approvalLabel(batch.status)} · ${batch.itemCount} requested · run ${batch.runAt} UTC`}</p>
      <p><small>Left: exactly what the DGDA register returned. Right: what we extracted. Pharmacists and engineers mark
        each record OK or report an issue with it. A record is public once a pharmacist marks it OK.</small></p>
      {!itemIds.has(outcomeItem) && <Outcome code={outcome} />}
      <Report report={report} />
      {batch.items.map((item, n) => {
        const src = summariseSource(item.sourceJson);
        const p = item.extracted;
        return (
          <section key={item.conceptId} id={item.conceptId}>
            <h2>{item.conceptId} <small>[{item.review}{item.note ? `: ${item.note}` : ""}]</small></h2>
            {outcomeItem === item.conceptId && <Outcome code={outcome} />}
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
              <td style={cell}>
                <strong>Source (DGDA via OCL)</strong>
                {src ? (<>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(src.extras, null, 2)}</pre>
                  <ul>{src.ingredients.map((i, n) => <li key={`${i.code}-${n}`}>{i.name} <code>{i.code}</code>{i.retired ? " (retired)" : ""}</li>)}</ul>
                  <a href={src.oclUrl} rel="noopener noreferrer" target="_blank">Open original record</a>
                  <details><summary>Full raw JSON</summary><pre style={{ whiteSpace: "pre-wrap" }}>{item.sourceJson}</pre></details>
                </>) : <p>No source snapshot (not found at source).</p>}
              </td>
              <td style={cell}>
                <strong>Extracted</strong>
                {p ? (<dl>
                  <dt>Trade name</dt><dd>{p.tradeName}</dd>
                  <dt>DAR number</dt><dd>{p.darNumber}</dd>
                  <dt>Company</dt><dd>{p.company}</dd>
                  <dt>Dosage form</dt><dd>{p.dosageForm}</dd>
                  <dt>Generic content</dt><dd>{p.genericContentRaw}</dd>
                  <dt>Ingredients</dt><dd>{p.ingredients.length ? p.ingredients.map((i) => `${i.name} (${i.xmCode})`).join(", ") : "none mapped"}</dd>
                </dl>) : <p>Nothing extracted.</p>}
              </td>
            </tr></tbody></table>
            <StageTable stages={item.stages ?? []} />
            <History decisions={histories[n]} />
            <ReviewForms batchId={batch.batchId} conceptId={item.conceptId}
              version={{ extractedAt: item.extractedAt, lastDecisionId: item.lastDecisionId }} role={session.role} />
          </section>
        );
      })}
    </>
  );
}
```

- [ ] **Step 6: Run the tests and the build to verify they pass**

Run: `cd web && API_URL=http://api:8080 npm test && npm run build`
Expected: every vitest file passes; `next build` completes and the postbuild client-bundle scan passes.

- [ ] **Step 7: Commit**

```bash
git add web/lib/api.ts web/lib/actions-core.ts web/lib/copy.ts web/app/batches/page.tsx "web/app/batches/[id]/page.tsx" \
  web/tests/batch-page.test.tsx web/tests/batches-page.test.tsx web/tests/review-actions.test.ts \
  web/tests/api-scope.test.ts web/tests/api.test.ts
git commit -m "fix(web): batch pages for reviewers only; review forms echo the version and a requestId

Anonymous and user sessions get 200 with 'Only pharmacists and engineers can see batches.'
Batch reads send the internal token. Every 409 field maps to its own message.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `load-dgda` gains a validated `stages` input; the re-run runbook in the README

Implements §8.3's "P0 also adds an optional `stages` input to `load-dgda.yml` (passed as `--stages`, validated against `dgda,substances,clinical,ddinter`)" and documents the re-run.

**Files:**
- Create: `deploy/check-stages.sh`, `deploy/check-stages.test.sh`
- Modify: `.github/workflows/load-dgda.yml` (whole file), `.github/workflows/ci.yml` (one job), `README.md`

**Interfaces:**
- Consumes: the ETL's `--stages` option (unchanged; it validates again).
- Produces: workflow input `stages` (empty runs all four stages); `deploy/check-stages.sh "<stages>"` exits 0 for an empty value or a comma-separated subset of `dgda,substances,clinical,ddinter` with no spaces, 1 otherwise.

- [ ] **Step 1: Write the failing test**

Create `deploy/check-stages.test.sh`:

```bash
#!/usr/bin/env bash
# Tests for deploy/check-stages.sh (the load-dgda workflow's `stages` input). Run: bash deploy/check-stages.test.sh
set -uo pipefail
cd "$(dirname "$0")"
fail=0
accept() { if ./check-stages.sh "$1" 2>/dev/null; then :; else echo "should accept: '$1'"; fail=1; fi; }
refuse() { if ./check-stages.sh "$1" 2>/dev/null; then echo "should refuse: '$1'"; fail=1; fi; }
accept ""
accept "ddinter"
accept "dgda,substances,clinical,ddinter"
accept "substances,ddinter"
refuse "foo"
refuse "dgda,foo"
refuse "dgda, ddinter"
refuse ",ddinter"
refuse "ddinter,"
refuse "dgda,,ddinter"
refuse "DDINTER"
refuse "ddinter;rm -rf /"
refuse 'ddinter$(id)'
[ "$fail" -eq 0 ] && echo "check-stages OK"
exit "$fail"
```

Run: `chmod +x deploy/check-stages.test.sh && bash deploy/check-stages.test.sh`
Expected: FAIL — every `accept` line prints `should accept: …` (the script does not exist yet), exit 1.

- [ ] **Step 2: Write the validator**

Create `deploy/check-stages.sh`:

```bash
#!/usr/bin/env bash
# Validates the optional `stages` input of the load-dgda workflow (spec §8.3): empty (all four stages), or a
# comma-separated subset of dgda,substances,clinical,ddinter with no spaces. Prints nothing and exits 0 when valid.
set -euo pipefail
stages="${1-}"
[ -z "$stages" ] && exit 0
case "$stages" in
  *[!a-z,]*|,*|*,|*,,*) echo "stages must be comma-separated stage names with no spaces, got '$stages'" >&2; exit 1;;
esac
IFS=, read -r -a parts <<< "$stages"
for s in "${parts[@]}"; do
  case "$s" in
    dgda|substances|clinical|ddinter) ;;
    *) echo "unknown stage '$s'; choose from dgda,substances,clinical,ddinter" >&2; exit 1;;
  esac
done
```

Run: `chmod +x deploy/check-stages.sh && bash deploy/check-stages.test.sh`
Expected: `check-stages OK`, exit 0.

- [ ] **Step 3: Wire it into the workflows**

Replace `.github/workflows/load-dgda.yml` with:

```yaml
name: load-dgda
on:
  workflow_dispatch:
    inputs:
      batch: {description: "Batch file name in batches/, e.g. 0001-pilot.txt", required: true}
      stages:
        description: "Optional: comma-separated subset of dgda,substances,clinical,ddinter (empty runs all four), e.g. ddinter"
        required: false
        default: ""
concurrency: {group: deploy, cancel-in-progress: false}
jobs:
  load:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: Validate the stages input
        env:
          STAGES: ${{ inputs.stages }}
        run: ./deploy/check-stages.sh "$STAGES"
      - uses: appleboy/ssh-action@7eaf76671a0d7eec5d98ee897acda4f968735a17 # v1.2.0
        env:
          BATCH: ${{ inputs.batch }}
          STAGES: ${{ inputs.stages }}
          APP_DIR: /home/ec2-user/drugdb
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: BATCH,STAGES,APP_DIR
          command_timeout: 60m
          script: |
            set -e
            case "$BATCH" in *[!A-Za-z0-9._-]*|"") echo "bad batch name"; exit 1;; esac
            # defence in depth: the host has no checkout, so it repeats the character check (the ETL validates names)
            case "$STAGES" in *[!a-z,]*) echo "bad stages"; exit 1;; esac
            test -f "$APP_DIR/batches/$BATCH" || { echo "batch $BATCH is not on the host; merge it to main and let deploy run first" >&2; exit 1; }
            cd "$APP_DIR/deploy"
            # Only the bddrug compose project's etl job runs; no other container is touched. Non-zero exit fails the job.
            if [ -n "$STAGES" ]; then
              docker-compose --profile jobs run --rm etl --batch "/app/batches/$BATCH" --stages "$STAGES"
            else
              docker-compose --profile jobs run --rm etl --batch "/app/batches/$BATCH"
            fi
```

In `.github/workflows/ci.yml`, add this job after the `schema-lock` job:

```yaml
  deploy-scripts:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: load-dgda stages validator
        run: bash deploy/check-stages.test.sh
```

Run (if `actionlint` is installed; `brew install actionlint`): `actionlint .github/workflows/load-dgda.yml .github/workflows/ci.yml`
Expected: no output, exit 0.

- [ ] **Step 4: Document the re-run**

In `README.md`, after the "Run order: …" paragraph, add:

````markdown
### Re-run one stage (the pilot DDInter re-run, spec §8.3)

Run it only after the image that contains the change is deployed. Either start `load-dgda` from the Actions tab with
`batch=0001-pilot.txt` and `stages=ddinter`, or run the same command on the host (it has no git checkout):

```bash
cd ~/drugdb/deploy && docker-compose --profile jobs run --rm etl --batch /app/batches/0001-pilot.txt --stages ddinter
```

What it does to review state:
- every re-processed item gets a new `extracted_at`, its review goes back to `pending`, the batch goes back to
  `in_review`, and a snapshot is written (`ops.item_snapshot`, one `run_id` for the whole command);
- a decision made at or before the new stamp stops counting: an approved record is back in review and leaves public
  view until a pharmacist approves it again; a record with an issue returns to "Not yet reviewed by a pharmacist";
- a reviewer page open during the run must be reloaded before its decision is accepted (the API answers 409).

Prefer `--concept ID` (repeatable) for later re-runs, so approved records are not re-opened needlessly. Only the
`bddrug` project's `etl` job runs: medscribe, baymax, medioo, n8n and Caddy are never restarted.
````

- [ ] **Step 5: Commit**

```bash
git add deploy/check-stages.sh deploy/check-stages.test.sh .github/workflows/load-dgda.yml .github/workflows/ci.yml README.md
git commit -m "feat(deploy): optional, validated stages input for load-dgda; document the stage re-run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Local pilot dry run against the live sources, and the triage check

Verifies, before anything ships, that the reconciled pair lists give the §1.6 item 7 triage (the spec says the P0 PR updates §1.6 items 7, 10 and 11 from the re-run's notes if the reconciliation stores a pilot pair the graph lacked). This calls OCL, RxNav and DDInter politely (DDInter at 1 request per second, so the run takes tens of minutes).

**Files:**
- Modify only if the counts differ: `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md` (§1.6 items 5, 7, 10, 11)

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: the confirmed (or corrected) pilot triage list that P1B's and P3's acceptance tests use.

Every compose command in this task runs under the throwaway project name `bddrug-p0dry` (`-p` overrides the compose file's `name: bddrug`), so the developer's own local `bddrug` project and its `bddrug_dbdata` volume, with any local review or test data, are never touched. The override file publishes the database on host port 5433, so stop a running local `bddrug` database first (`docker compose -p bddrug stop db`; nothing is deleted).

- [ ] **Step 1: Start an empty local database with V1–V6**

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2/deploy
[ -f .env ] || cp .env.example .env          # local only: DB_USER=bddrug, DB_PASSWORD=change-me
docker compose -p bddrug stop db 2>/dev/null || true   # frees port 5433; keeps its volume
docker compose -p bddrug-p0dry down -v && docker compose -p bddrug-p0dry up -d db \
  && docker compose -p bddrug-p0dry run --rm flyway
```

Expected: Flyway reports `Successfully applied 6 migrations to schema "public", now at version v6`.

- [ ] **Step 2: Run the full pilot**

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2 && . .venv/bin/activate
DATABASE_URL=postgresql://bddrug:change-me@localhost:5433/bddrug bddrug-etl --batch batches/0001-pilot.txt
```

Expected: exit 0; the last log line `batch=0001-pilot dgda=10/0/0 substances=…/…/0 clinical=…/…/0 ddinter=1/9/0` (one OK — Chloramphenicol — and nine warnings).

- [ ] **Step 3: Compare the DDInter notes with §1.6 item 7**

```bash
cd deploy && docker compose -p bddrug-p0dry exec -T db psql -U bddrug -d bddrug -At -F ' | ' -c "
SELECT bp.trade_name, sr.status,
       (length(sr.note) - length(replace(sr.note, 'DDInter text not found for', ''))) / length('DDInter text not found for') AS pairs_without_text,
       sr.note LIKE '%DDInter351%' AS mentions_351
  FROM ops.stage_result sr JOIN curated.brand_product bp USING (concept_id)
 WHERE sr.batch_id = '0001-pilot' AND sr.stage = 'ddinter' ORDER BY bp.trade_name"
```

Expected (§1.6 item 7):

```
Amlodipine-5 | warn | 4 | f
Amoxycillin Clavulanic Acid | warn | 5 | f
Aspirin | warn | 5 | f
Chloramphenicol | ok | 0 | f
Clarith | warn | 2 | f
Domperidone | warn | 0 | f
G Warfarin | warn | 1 | f
G-Metformin | warn | 5 | f
Napa | warn | 6 | f
Simvastatin | warn | 4 | f
```

(Trade names are as DGDA spells them; match rows by product. Domperidone's note is `No interaction data in DDInter for this substance`.)

Then the pilot pair counts (§1.6 items 5 and 11: 28 pairs, Major 4, Moderate 6, Minor 2, unknown 16):

```bash
docker compose -p bddrug-p0dry exec -T db psql -U bddrug -d bddrug -At -c "
WITH chosen AS (
  SELECT DISTINCT c->>'ddinter_id' AS id FROM ops.stage_result sr, jsonb_array_elements(sr.evidence->'chosen') c
   WHERE sr.batch_id = '0001-pilot' AND sr.stage = 'ddinter')
SELECT severity, count(*) FROM curated.ddinter_pair
 WHERE ddinter_a IN (SELECT id FROM chosen) AND ddinter_b IN (SELECT id FROM chosen) GROUP BY severity ORDER BY severity"
```

Expected: `major|4`, `minor|2`, `moderate|6`, `unknown|16`.

And the snapshots:

```bash
docker compose -p bddrug-p0dry exec -T db psql -U bddrug -d bddrug -At -c "
SELECT count(*) FILTER (WHERE reason <> 'shared_change'), count(DISTINCT run_id), count(DISTINCT concept_id)
  FROM ops.item_snapshot WHERE batch_id = '0001-pilot'"
```

Expected: `40|1|10` (four stamps per item, one run, ten items). Extra `shared_change` rows are expected and not counted: the DDInter stage commits in chunks of 5 (`DDINTER_CHUNK`), and `_reopen_dependents` skips only the current chunk, so a shared row first written in chunk 2 re-opens chunk-1 items of the same batch with a `shared_change` snapshot (same `run_id`).

- [ ] **Step 4: If anything differs, amend the spec in this PR**

Only when Step 3's output differs from the expected lists: edit §1.6 item 7 (the ten row hints and the "Warnings" count), item 10 (the "None of the {N} batch pairs" N) and item 11 (the chapter 6 counts and glossary lines), and item 5 (the 28 pairs and the severity mix), copying the observed values. Commit:

```bash
git add docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md
git commit -m "docs(etl): pilot triage counts from the reconciled DDInter pair lists

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

When everything matches, there is nothing to commit; record "§1.6 item 7 confirmed locally on <DD/MM/YYYY HH:mm Dhaka>" in the PR description (Task 14).

- [ ] **Step 5: Stop the local database**

Run: `cd deploy && docker compose -p bddrug-p0dry down -v`
Expected: the `bddrug-p0dry` containers and its volume are removed; the developer's own `bddrug` project is untouched (restart it with `docker compose -p bddrug start db` if it was running).

---

### Task 14: Release P0, re-run the pilot on the shared host, verify the exit criteria, tag the schema

Implements §8.3, §12.1 (phase 0 exit criteria), §12.4 and the `db-schema-v1.1` tag (§7.6). This task changes nothing on the host outside the `bddrug` compose project.

**Files:**
- none in the repository (a pull request, a workflow run, host commands, a tag)

**Interfaces:**
- Consumes: Tasks 1–13 merged.
- Produces: production on the P0 images; the pilot re-run with route-scoped notes; tag `db-schema-v1.1` on the merge commit.

- [ ] **Step 1: Full suites on the branch**

```bash
./db/check-migration-lock.sh
python -m pytest etl/tests -q
(cd api && ./gradlew test --no-daemon)
(cd web && API_URL=http://api:8080 npm test && npm run build)
bash deploy/check-stages.test.sh
```

Expected: `schema lock OK: 6 locked migrations unchanged`; every suite passes; `check-stages OK`.

- [ ] **Step 2: Open the pull request (P0 may merge to `main` on its own, §12.3)**

```bash
git push -u origin phase-0
gh pr create --base main --head phase-0 --title "P0 safety prerequisites (IntelliDrugs)" --body-file - <<'EOF'
Implements plan docs/superpowers/plans/2026-10-12-intellidrugs-p0-safety.md (spec §7.1, §7.2, §7.6, §8, §12.1).

## Schema change V6 (db-schema-v1.1)
- **The change:** ops.item_snapshot, ops.audit_event, a unique decision request_id index, append-only triggers.
- **Why it is needed:** re-runs erase the previous state of a record; Docker logs are not an audit trail; decision retries must be idempotent.
- **What it does to existing rows:** nothing (purely additive).
- **How to roll it back:** a new migration dropping both tables and ops.reject_change(). Older API and web images run unchanged against V6; the pre-P0 ETL image must not re-run a batch whose file dropped an item that already has a snapshot (the snapshot foreign key refuses the delete and the run aborts), so re-run such a batch with the P0 ETL image only.

## After merge
Deploy runs by itself. Then: load-dgda with batch=0001-pilot.txt, stages=ddinter. Local dry run: <paste Task 13 result>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Expected: CI green (`schema-lock`, `deploy-scripts`, `etl`, `api`, `web`, `images`). The schema change needs the product owner's approval on the PR before merge (§7.6, database.md "Every schema change is a deliberate decision").

- [ ] **Step 3: Just before merging, record when every other container on the host started**

```bash
ssh ec2-user@<EC2_HOST>
docker ps --format '{{.Names}}' | grep -Ev '^bddrug' | xargs docker inspect -f '{{.Name}} {{.State.StartedAt}}' \
  | sort > ~/p0-before.txt
cat ~/p0-before.txt
```

Expected: one line per medscribe, baymax, medioo, n8n and Caddy container with its start time. This runs before the merge, so the deploy has not touched anything yet.

- [ ] **Step 4: After merge, confirm the deploy**

The `deploy` workflow runs on the merge to `main` (Flyway applies V6 first through `depends_on`). Its last step requests `$PUBLIC_URL/batches` with `curl -f`.

Run: `curl -fsS https://drugdb.eliooo.org/batches | grep -c "Only pharmacists and engineers can see batches."`
Expected: `1` (status 200, no batch data).

Run: `curl -fsS https://drugdb.eliooo.org/batches/0001-pilot | grep -Eci "napa|paracetamol|warfarin"`
Expected: `0` (anonymous `GET /batches/0001-pilot` shows no unreviewed data — exit criterion).

- [ ] **Step 5: On the host, confirm V6**

```bash
ssh ec2-user@<EC2_HOST>
cd ~/drugdb/deploy
docker-compose exec -T db psql -U "$(grep '^DB_USER=' .env | cut -d= -f2)" -d bddrug -At \
  -c "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1" \
  -c "SELECT to_regclass('ops.item_snapshot') IS NOT NULL, to_regclass('ops.audit_event') IS NOT NULL"
```

Expected: `6` and `t|t`.

- [ ] **Step 6: Re-run the pilot's DDInter stage**

From the Actions tab: run `load-dgda` with `batch=0001-pilot.txt` and `stages=ddinter`. (Equivalent on the host: `cd ~/drugdb/deploy && docker-compose --profile jobs run --rm etl --batch /app/batches/0001-pilot.txt --stages ddinter`.)
Expected: the job succeeds; its log ends with `batch=0001-pilot dgda=- substances=- clinical=- ddinter=1/9/0`.

- [ ] **Step 7: Verify the ETL part of S7 and the triage on production**

On the host, run the Task 13 Step 3 queries with `docker-compose exec -T db psql -U "$(grep '^DB_USER=' .env | cut -d= -f2)" -d bddrug …` in place of `docker compose -p bddrug-p0dry exec -T db psql -U bddrug -d bddrug …`.
Expected: the same ten rows as Task 13 (Chloramphenicol `ok | 0 | f`; no note mentions `DDInter351`), the same severity counts, and one new `run_id` in `ops.item_snapshot` for this re-run (`SELECT count(DISTINCT run_id) FROM ops.item_snapshot WHERE batch_id = '0001-pilot'` grows by 1).

If production differs from Task 13 (DDInter's data can change between the dry run and the host re-run): before P1B starts, open a docs pull request to `main` that updates §1.6 items 5, 7, 10 and 11 with the production values, by the same procedure as Task 13 Step 4 (branch `docs/p0-pilot-triage`, commit `docs(etl): pilot triage counts from the production re-run`), and link it in the P0 pull request. P1B's and P3's acceptance tests read those items, so they must match production, not the local dry run.

- [ ] **Step 8: Verify the API part of S7 on production (the amended §12.1 exit criterion)**

On the host, from `~/drugdb/deploy` (the web container has `INTERNAL_API_TOKEN` and reaches the API on the internal network; nothing is published):

```bash
docker-compose exec -T web node -e 'fetch("http://api:8080/v1/interactions/check?scope=all",{method:"POST",headers:{"X-Internal-Token":process.env.INTERNAL_API_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({conceptIds:["127-0163-052--chloramphenicol","185-0138-012--g-warfarin"]})}).then(r=>r.json()).then(b=>console.log(b.data.alerts.length))'
```

Expected: `0` (the eye drop with G Warfarin raises no alert).

```bash
docker-compose exec -T web node -e 'fetch("http://api:8080/v1/products/127-0163-052--chloramphenicol?scope=all",{headers:{"X-Internal-Token":process.env.INTERNAL_API_TOKEN}}).then(r=>r.json()).then(b=>console.log(b.data.clinicalDrug.ingredients[0].ddinter.map(d=>d.ddinterId+":"+d.routeAssumed).join(",")))'
```

Expected: `DDInter352:false` (the product page's data names the ophthalmic entry, not assumed). The checker's own `products[].substances[].ddinter` naming does not exist before P2 (§7.4); the amended §12.1 moves that check to P2.

- [ ] **Step 9: Verify nothing else on the host moved**

```bash
docker ps --format '{{.Names}}' | grep -Ev '^bddrug' | xargs docker inspect -f '{{.Name}} {{.State.StartedAt}}' \
  | sort > ~/p0-after.txt
diff ~/p0-before.txt ~/p0-after.txt && echo "no other container restarted"
rm ~/p0-before.txt ~/p0-after.txt
```

Expected: `no other container restarted` (same containers, same start times: medscribe, baymax, medioo, n8n and Caddy were not restarted, §12.4). Any diff line is a §12.4 violation: stop and report it.

- [ ] **Step 10: Verify the reviewer path by hand**

Sign in at https://drugdb.eliooo.org/signin with a pharmacist account from `REVIEWERS`:
- `/products/186-0030-006--napa` shows "Not yet reviewed by a pharmacist" and nothing else (exit criterion: a pharmacist sees the stub);
- `/batches/0001-pilot` shows the ten records; the Chloramphenicol record's ddinter stage note is empty and its status `ok`;
- do **not** approve anything here: the pharmacist's first sitting is on the P1B workspace (§12.1).

- [ ] **Step 11: Tag the schema**

```bash
git switch main && git pull --ff-only
git tag -a db-schema-v1.1 -m "Database schema v1.1: V1-V6 (adds ops.item_snapshot and ops.audit_event)" HEAD
git push origin db-schema-v1.1
```

Expected: the tag points at the P0 merge commit.

- [ ] **Step 12: Update the live data model page**

`docs/design/database.md` links the live page https://claude.ai/artifact/5axV32KDeM55TrSUNF4qGc. Republish the repo copy `docs/artifacts/2026-10-12-data-model.html` (edited in Task 1) to that URL with the Artifact tool (read it first, then publish with `url` set to that link). If no session with the Artifact tool is available, ask the product owner to do it; the repo copy is the reference until then.

---

## Self-review notes

- **Spec coverage (§12.2 P0 scope):** §8.1 items 1–3 → Task 3; item 4 → Task 5; item 5 → Tasks 2 and 4; item 6 → Task 5; §8.2 → Tasks 3 (twin rule) and 9 (seed); §8.3 → Tasks 12, 13, 14; §7.1 → Task 7; §7.2 → Tasks 6, 8a and 8b; §7.6 → Task 1 (and the tag in Task 14); §12.1 web adjustments → Tasks 10 and 11; §11.3 P0 tests → Tasks 1, 3, 4, 5, 6, 7, 8a, 8b, 9.
- **Spec amendment:** the phase-0 S7 exit criterion is narrowed in the spec itself ("Before you start", §12.2 rule) to what P0 ships: stage note OK, no alert, product page names `DDInter352` (Task 14 Steps 7 and 8). The checker's `products[].substances[].ddinter` naming is P2's to verify (§7.4).
- **Names used across tasks:** `choose`, `_mapped_chosen`, `INCOMPLETE_NOTE`, `_PairList`, `_Run.listing`, `_Run.incomplete`, `_Run.pair_list`, `InteractWithList`, `InteractWithRow`, `write_snapshots`, `build_payload`, `ApprovalRule.displayStatus`, `DecisionGuard.check`, `ReviewPort.Outcome/Version/NewDecision` (Task 8a), `ReviewPort.Rejection/recordRejection` (Task 8b), `BatchItem.lastDecisionId`, `DecisionRequest.expectedLastDecisionId/requestId`, `WriteResult.field`, `BATCHES_REVIEWERS_ONLY`, `isReviewer`, `reviewerRead` — each is defined in the task listed in its Interfaces block and used with the same signature later.
- **§11.3 test map** (where a spec test name was split, renamed or moved, the plan's tests and files that carry it):

| Spec §11.3 test | Plan test(s) | File | Task |
|---|---|---|---|
| `test_eye_drop_note_uses_ophthalmic_entry`, `test_capsule_note_uses_systemic_entry`, `test_no_clinical_drug_falls_back_to_systemic_assumed`, `test_only_other_route_entry_notes_no_route_entry`, `test_text_missing_requires_partner_chosen_in_scope`, `test_note_formats` | same names | `etl/tests/test_stage_ddinter.py` | 3 |
| `test_snapshot_written_on_stamp` (reasons `run`, `rerun`, `shared_change`; one snapshot per stage with one shared `run_id`; the dgda stage writes one from `_upsert_items`) | `test_snapshot_written_on_stamp_with_one_run_id_per_invocation` (run, rerun, one `run_id`, dgda stamp); `test_reasons_run_then_rerun_then_shared_change`; `test_a_shared_change_writes_a_shared_change_snapshot_with_the_run_id_of_the_run_that_caused_it`; `test_run_batch_writes_one_snapshot_per_item` | `etl/tests/test_run_pipeline.py`; `etl/tests/test_snapshots.py`; `etl/tests/test_shared_reopen.py`; `etl/tests/test_batches.py` | 5 |
| `test_graph_and_interact_with_partner_sets_reconciled` (union with the level's severity; an incomplete read fails with `DDInter pair list incomplete for {id}` and writes no `ddinter_drug` row) | same name, covering both halves; plus `test_incomplete_interact_with_fails_the_products_that_chose_it`, `test_an_earlier_complete_list_stays_when_a_later_read_is_incomplete`, `test_an_incomplete_entry_the_product_did_not_choose_does_not_fail_it`, `test_an_interact_with_only_row_never_overwrites_a_graph_row`, `test_an_incomplete_entry_writes_no_pair_rows_even_from_a_complete_partner`, `test_a_failing_lookup_on_an_incomplete_entry_does_not_fail_another_product` | `etl/tests/test_stage_ddinter.py` | 4 |
| `test_removed_item_without_decisions_is_deleted_with_its_stage_results` ("without decisions or snapshots") | `test_removed_item_without_decisions_or_snapshots_is_deleted_with_its_stage_results` | `etl/tests/test_batches.py` | 5 |
| `test_removed_item_with_snapshot_is_kept_and_marked` | same name (plus `test_removed_item_readded_to_the_file_is_restamped_with_a_rerun_snapshot`) | `etl/tests/test_batches.py` | 5 |
| Regression fixture: `DDInter352` with 112 rows, no pilot partner, no text fetch (listed under `test_batches.py`) | `test_ddinter352_pair_list_is_stored_without_text_fetches` — it exercises the DDInter stage and its fake client, which live in the stage's test module | `etl/tests/test_stage_ddinter.py` | 4 |
| `ReviewApiIntegrationTest`: 409 `lastDecisionId`; 409 `review`; 409 `conceptId`; 409 `stages`; `IS DISTINCT FROM`; `Outcome.version`; `displayStatus` engineer_checked, approved, issue, pipeline-set issue | `anotherReviewersDecisionAfterThePageLoadedIsRefused`; `engineerOkDoesNotApproveAndASecondEngineerCheckIsRefused`, `okWhileAnIssueIsOpenIsRefused`, `okOnAnApprovedRecordIsRefused`; `decisionsOnARemovedRecordAreRefused`; `okWithAFailedOrMissingCheckIsRefusedButAnIssueIsAccepted`, `anItemWithNoRunStampCannotBeApprovedButTakesAnIssue`; `staleExtractedAtIsRejectedWith409`, `anExplicitNullOnAStampedItemIs409`; `batchStatusFollowsItsItems`, `aPipelineSetIssueRefusesOkOnStagesAndTakesAReviewersIssue` | `api/src/test/java/com/niramoy/bddrug/ReviewApiIntegrationTest.java` | 8a |
| `ReviewApiIntegrationTest`: idempotency (200 `replayed`, 400 `requestId` for another item, missing `requestId` 400); `displayStatus` back_in_review and pending; one `decision_rejected` row per 409 and 400 | `aRepeatedRequestIdIsAnsweredOnceAndBelongsToItsDecision` (missing and malformed `requestId`: `validationRejectsBadDecisionsWithoutWriting`, Task 8a); `aRetryOfAnApprovalAfterAReRunReportsBackInReview`, `anIssueFixedAndReRunIsPending`; `a409AndA400EachLeaveExactlyOneDecisionRejectedRow`; also `concurrentSendsOfOneRequestIdWriteOneDecision`, `aUniqueIndexHitIsAnsweredAsAReplay` | same file | 8b |

  Not in P0 (other plans own them, §12.2): the `CheckApiIntegrationTest` assertions on `products[].substances[].ddinter`, `noInteraction`, `notChecked` reasons and counts, `InteractionCheckServiceTest`, `VisibilityApiIntegrationTest`'s public-endpoint matrix and `SearchApiIntegrationTest` (P2); `ReviewQueryIntegrationTest` (P1B). P0's Task 9 moves the seed pair and pins `alerts` for the eye drop and the capsule only.
