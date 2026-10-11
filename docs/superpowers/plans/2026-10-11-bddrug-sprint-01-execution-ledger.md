# SDD ledger — plan: docs/superpowers/plans/2026-10-11-bddrug-sprint-01.md

Spec: docs/design/2026-10-11-bd-drug-kb-design.md (+ docs/design/2026-10-11-implementation-plan.md)
Branch: feature/sprint-01-walking-skeleton (base 928155d on main)
Task order: 1, 2, 3, 4, 5, 6, 6A, 7, 8

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T4, T5, T6A | V1 schema tables/columns → loader SQL, R2DBC SQL, batch join | Column names consistent (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag, xm_code, ingredient_name) |
| T2 → T4 | `OclClient.get_concept(owner, source, id) -> dict\|None` → `run_batch` client duck-type | Consistent |
| T3 → T4 | `concept_to_product`, `ProductRow`, `Ingredient` → `load_products` | Consistent |
| T4 (V2) → T6A | `ops.batch(batch_id,status,run_at,item_count)`, `ops.batch_item(batch_id,source,concept_id,review,note)` → R2dbcBatchAdapter SQL | Consistent |
| T5 → T6 | JSON envelope `data`, `errors[0].message` → `lib/api.ts` | Consistent |
| T5 → T6A | `Product`, `Ingredient`, `ApiResponse`, `ApiExceptionHandler` → Batch types/controller | Consistent; 6A modifies T5's integration test seed (adds raw/ops rows) — intended |
| T6 → T6A | `lib/api.ts` `base()` → appended `listBatches`/`getBatch` | Consistent |
| T4 CLI → T7 → T8 | `bddrug-etl --batch <path>`; compose mounts `../batches:/app/batches:ro` → workflow passes `/app/batches/<name>` | Consistent |
| T7 → T8 | compose `IMAGE_TAG`, `GHCR_OWNER`, image names `bddrug-{etl,api,web}` → deploy builds/pushes same names | Consistent; deploy builds each with context `$s` dir — etl Dockerfile copies only etl files (batches mounted, not copied) — consistent |
| T1 self | Step 1 runs `git init` + writes .gitignore | Already done by controller (repo + .gitignore committed in 928155d) |
| T2 self | tests (5) vs code | Consistent |
| T3 self | tests (6) vs code | Consistent |
| T4 self | tests (2 + 3) vs code; Step 11 needs pharmacist; Step 12 hits live OCL | See rulings |
| T5 self | gradle wrapper via `gradle wrapper` but gradle not installed locally | See rulings |
| T6 self | vitest alias `server-only` → `/dev/null` may not resolve under Vite | See rulings |
| T6A self | tests vs code | Consistent (HashMap typing fixed in plan before approval) |
| T7 self | compose validate only | Consistent |
| T8 self | Steps 4–5 need GitHub repo, secrets, VM, DNS (external) | See rulings |
| Env | Python 3.12 not installed (3.13 present); uv available; Docker running; Java 21; Node 24 | See rulings |

## Rulings

- Ruling: Task 1 Step 1 (`git init`, `.gitignore`) is already satisfied by commit 928155d; implementer skips it and keeps the existing .gitignore — why: controller had to commit docs first — cost if wrong: none.
- Ruling: Python 3.12 via `uv venv --python 3.12 etl/.venv` (uv downloads it) instead of `python3.12 -m venv` — why: 3.12 not installed; plan pins 3.12 — cost if wrong: trivial.
- Ruling: Gradle wrapper generated with Docker image `gradle:8.11.1-jdk21` (`docker run --rm -v $PWD/api:/w -w /w gradle:8.11.1-jdk21 gradle wrapper --gradle-version 8.11.1`) — why: gradle not installed locally — cost if wrong: trivial.
- Ruling: if the vitest alias to `/dev/null` fails to resolve, alias `server-only` to an empty stub `web/tests/stubs/server-only.ts` instead — why: equivalent intent (neutralise server-only guard in unit tests) — cost if wrong: none.
- Ruling: Pilot batch IDs (Task 4 Step 11) are chosen by the implementer from read-only OCL searches and written to `batches/0001-pilot.txt` with a header line `# PROPOSED — pending pharmacist confirmation`; the pharmacist confirms before the VM run — why: plan requires pharmacist sign-off, which can't happen inside this session — cost if wrong: one batch file edit.
- Ruling: Task 4 Step 12 local pilot run against the live public OCL API is allowed (read-only, 10 requests, 0.5 s pause) — why: it is the plan's verification — cost if wrong: none.
- Ruling: Task 8 creates the three workflow files and README bootstrap only; Steps 4–5 (create GitHub repo, set secrets, push, deploy to VM, load on VM) are NOT executed — they are external side effects needing the owner's accounts — validated locally with a YAML parse instead — cost if wrong: deploy verification deferred to the owner.
- Ruling: Tasks run on branch feature/sprint-01-walking-skeleton in the main checkout (no separate worktree) — why: fresh repo, nothing else checked out — cost if wrong: none.

## Progress
Task 1: minor (deferred): README psql -U hardcoded vs DB_USER; flyway password on CLI (use FLYWAY_* env later); flyway /flyway/sql location warning; pg_trgm needs superuser on managed PG; trigram indexes need lower(col) in queries (Task 5)
Task 1: complete (commits 928155d..7fdd90d, review clean)
Task 2: minor (deferred): get_concept 5xx path untested; time.sleep branches uncovered (pause_s=0); first-page params not asserted; concept_id not URL-quoted (batch file IDs with / ? #); hardcoded 60s timeout / no retry; import pytest inside test fn
Task 2: complete (commits 7fdd90d..4123aa5, review clean)
Task 3: Ruling: plan-mandated dedupe on (xm_code, name) conflicts with PK (concept_id, xm_code) — dedupe on _clean(xm_code), keep first non-empty cleaned name, sort by xm_code; add same-code-two-names and whitespace-code tests — why: spec requires idempotent, non-crashing loads; duplicate keys would abort Task 4 runs — cost if wrong: a dropped alternate ingredient name (still visible in the raw snapshot)
Task 3: minor (deferred): concept["id"] KeyError on malformed concept; empty-string fields possible (dar_number etc.); missing "mappings" key untested
Task 3: fix round 1/5 (2 addressed, 0 open; commits b45b7a8..213b459)
Task 3: minor (deferred): all-empty-names and empty-code branches untested
Task 3: complete (commits 4123aa5..213b459, review clean)
Task 4: Ruling: (plan-mandated) found-but-non-Drug concepts must be recorded as review='issue', note='not a registered Drug product' instead of 'pending' — why: spec's batch gate must never silently accept a record with nothing extracted — cost if wrong: an extra issue row reviewers dismiss
Task 4: Ruling: (plan-mandated) run_batch must be atomic — load_products gains `commit: bool = True`; run_batch passes commit=False and commits once after bookkeeping — why: batch page must never show curated rows without batch rows — cost if wrong: none (batches ≤100 rows)
Task 4: minor (deferred): batch_item keyed on payload id not requested id; duplicate IDs via direct run_batch call; re-run of approved batch resets status/notes undocumented; KeyError on missing DATABASE_URL; no partial-failure test; httpx INFO logs full URLs
Task 4: fix round 1/5 (2 addressed, 0 open; commits 9e955b6..217bf82)
Task 4: complete (commits 213b459..217bf82, review clean)
Task 5: Ruling: accept change of wildcard test to uri-template vars ("{q}", "100%" / "%%") — why: WebTestClient re-encodes a literal %25 in a raw URI string; template form still sends q=100% and q=%% to the server, so the literal-match behaviour is tested as intended — cost if wrong: none
Task 5: minor (deferred): `_` and `\` wildcard escapes untested (only %); no HTTP-level test for q>100/page=501/page=abc (ServerWebInputException handler untested); no generic Exception handler → DB errors return non-envelope 500 (global constraint!) + null getReason(); unused HttpStatus import; product+ingredient reads not a snapshot; no api/.dockerignore
Task 5: complete (commits 217bf82..e4e371f, review clean)
Task 6: Ruling: plan's pinned next 15.1.6 / react 19.0.0 have critical advisories (incl. RCE in React flight protocol GHSA-9qr9-h5gf-34mp, middleware auth bypass GHSA-f82v-jwr5-mffw); upgrade to next 15.5.27 (npm audit's fix, same major) and react/react-dom 19.0.8; acceptance: npm audit --omit=dev shows no critical/high — why: site is public on the internet; security beats exact pin — cost if wrong: minor API differences within Next 15, caught by build + tests
Task 6: Ruling: also fix two minors in round 1 — malformed %-sequence in /products/[id] must give 404 not 500; web Dockerfile sets ENV HOSTNAME=0.0.0.0 (Next standalone binds to $HOSTNAME) — why: both break the public deploy cheaply — cost if wrong: none
Task 6: minor (deferred): pagination heuristic ===20, no Previous link; parseInt("1abc") accepted; same <title> on every page; plain <a> not next/link; tsconfig is verbose tsc --init output; no Docker HEALTHCHECK
Task 6: Ruling: accept package.json overrides postcss 8.5.29 — why: same security ruling (npm audit high in bundled postcss) — cost if wrong: postcss minor-version drift in build tooling only
Task 6: fix round 1/5 (7 addressed, 0 open; commits 7ed136a..615b86a)
Task 6: complete (commits e4e371f..615b86a, review clean)
Task 6A: Ruling: accept Sonnet co-author trailer on 576603e/78e862a — why: that model authored them; history rewrite not worth it — cost if wrong: cosmetic
Task 6A: minor (deferred, FINAL REVIEW SHOULD TRIAGE #1): batch page shows "not found at source" and hides raw text when sourceJson exists but is unparseable; summariseSource doesn't validate mappings array / id type; zipWith runs item queries before 404; list test can't verify order/empty items; duplicate ingredient code React key; no page-level tests for /batches pages
Task 6A: complete (commits 615b86a..78e862a, review clean)
Task 7: minor (deferred, FINAL REVIEW SHOULD TRIAGE first item): traefik:v3.2 may fail against Docker 29 engine API min 1.44 → bump to current v3.x before first deploy; socket :ro still root-equivalent (socket proxy later); no healthchecks/depends_on conditions; HSTS-only headers middleware; ratelimit sourcecriterion if CDN added
Task 7: complete (commits 78e862a..fbd60a1, review clean)
Task 8: Ruling: accept deviations — workflow_run head_sha for checkout/tag (github.sha would deploy untested default-branch head), lowercase GHCR owner, envs-passed TAG/BATCH, set -e — why: correctness/security of deploy — cost if wrong: none
Task 8: Ruling: (plan-mandated) deploy must require workflow_run.event == 'push' and head_repository == github.repository; VM checks out exact $TAG (detached) instead of pull; load-dgda fetches and checks out origin/main detached (batches are bind-mounted); fail if .env lacks IMAGE_TAG; add deploy concurrency group + curl retries + README notes — why: deploy must ship exactly the CI-tested commit and only from pushes to main — cost if wrong: none
Task 8: minor (deferred): third-party actions pinned by tag not SHA; ci runs twice on same-repo PR branches (plan-mandated on: [pull_request, push])
Task 8: fix round 1/5 (6 addressed, 0 open; commits f8a72d8..3576253)
Task 8: minor (deferred, FINAL REVIEW SHOULD TRIAGE): load-dgda checks out origin/main whole tree → compose files can drift ahead of deployed images; prefer `git checkout origin/main -- batches/` only
Task 8: complete (commits fbd60a1..3576253, review clean)
Final review: With fixes — Critical 1 (traefik v3.2 vs Docker 29), Important 5 (catch-all envelope; load-dgda tree drift; smoke check; DB password in URL; ssh-action tag pin). Deferred triage: all other minors "leave" per final reviewer; T6A triage#1 leave (sourceJson always valid JSONB).
Ruling: one fix wave covers final findings 1-6 plus cheap minors #10 (CI image build) and #11 (React key); #7-9 (stale snapshots, cross-batch review scope, raw history) deferred to Sprint 4 batch design — why: they need schema design, not hotfixes — cost if wrong: S1 batches are disjoint so no live impact
Final fix wave: 8/8 addressed (commits 3576253..ad33ed1); re-review clean. Parked: catch-all logs e.getMessage() (no patient data in this system) — Ruling: leave, revisit if PHI ever enters; DB_PASSWORD alphanumeric rule doc-only — Ruling: leave
