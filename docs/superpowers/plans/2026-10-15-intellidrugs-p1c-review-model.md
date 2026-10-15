# IntelliDrugs P1C "Review model and source links" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A senior pharmacist can dismiss a mistaken issue on a record and review every DDInter pair between the medicines we hold, across all batches, by substance and as a pair queue; the pipeline re-opens a record only when something its approval covered changed; the desk shows each record's pairs with medicines in other batches, splits the text-missing notes honestly, keeps a combination product's pairs when one ingredient has no data, and links every code to its source.

**Architecture:** The schema gains V7 (`db-schema-v1.2`): wider decision and role checks, a `dismiss` decision that only a senior may write, and the append-only `ops.pair_review` table. The Java API (hexagonal) adds four pure domain rules (`ApprovalRule`'s dismissal boundary and carried approval, `PairContent`, `PairReviewRule`, `SourceLinks`, `PairQueue`) and a linear `BatchPairs.computeFor`, a token-gated `SeniorReviewController` (pair queue, substances, substance page, pair decisions with their own audit rows), and additive `ReviewItem` fields (`otherPairs`, `openIssues`, `partnerScope`, `source`, `pairReview`, history `uncountedBy`/`carriedFrom`). The ETL replaces unconditional stamping with `settle()`: it stamps an item only when its `approval_view` (a pure function of the snapshot payload, now version 2) differs from the view its stamp recorded, always stamps a DGDA failure and a record that comes back into its batch file, carries an approval to a product listed again with an unchanged view, recomputes batch status, and honours an engineer's `--reopen` for non-approved targets only. The Next.js web app teaches every role gate the `senior` role, adds Dismiss issue to the desk on the existing report channel of the commit machine, renders "With other medicines" (in batch, in other batches), the `partnerScope` note split and source links on the desk, and adds the three senior pages, server-rendered, with the `SeniorDesk` island for keys and pair decisions.

**Tech Stack:** Java 21, Spring Boot 3.4.2 (WebFlux, R2DBC), JUnit 5, Testcontainers 1.20.4, Flyway 10.20.1 (tests only) · Python 3.12, psycopg 3.2.3, pytest 8.3.4, testcontainers 4.8.2 · Next.js 15.5.27 (app router), React 19.0.8, TypeScript 5.7.3, vitest 2.1.8 (+ jsdom 26.1.0, Testing Library 16.3.3) · Playwright 1.64.0 with `@axe-core/playwright` 4.13.0, Lighthouse CI 0.15 · PostgreSQL 16 · GitHub Actions, `docker-compose` on the shared EC2 host.

**Spec:** `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md` as amended for P1C (header "Changes in P1C"), and by Task 0 of this plan. This plan is row "P1C Review model and source links" of §12.2: the senior role (§2.2; §5.13, every role gate listed there; `AuditService` in §7.5); Dismiss issue (§5.2, §5.6.5, §5.7, §5.8, §5.10a, §7.2); senior review (§5.17, §7.7, the `SeniorDesk` island, §4.2); the reopen rule (§8.1 item 4, §8.3.1: `settle`, `approval_view`, `--reopen`, batch status); the desk's cross-batch pairs, the `partnerScope` note split and the `Interactions.tsx` combination fix (§5.5.3, §5.6.1, §5.6.2, §7.3 `otherPairs`); source links on the desk (§5.5.2, §5.6.3, §5.6.6, `SourceLinks.java`); the PO D7 visibility tests (§7.4); V7 and `db-schema-v1.2` (§7.8); the P1C §1.7 copy; and the P1C rows of §11. Read the "Changes in P1C" note, §1.2, §1.4 (S8, S9), §1.6 item 17, §1.7, §2, §3.4–§3.6, §4.2, §5 (all P1C-marked text), §7.2–§7.8, §8.1, §8.3, §9.2, §9.3, §9.7, §10.6, §11, §12 and §13.1 Q4–Q13 before starting. Visual sources: Board R `docs/artifacts/2026-10-12-intellidrugs-reviewer.html` and Board DS `docs/artifacts/2026-10-12-intellidrugs-design-system.html`; no board draws the senior pages or Dismiss issue, so their copy is the spec's (§1.7).

**Depends on:** P0, P1A, P1B and P3 merged to `main` (§12.2 P1C row: "P0, P1A, P1B, P3; ships before P2"). P1C needs P3's `ReviewSql.statusOf` removed-item fix and `ReviewSql.LATEST_PUBLIC` (PO D7). **Not** P2: the public pages are P2's, and P2 builds on P1C.

**Branch:** `feature/intellidrugs-p1c-review-model` from `main` after P3 has merged. P1C is the whole of phase 1C and merges to `main` on its own (§12.3); merging deploys, and V7 runs through Flyway on deploy (§12.4). The P1C pilot check (§8.3.1) follows the deploy (Task 26).

**Note for executors:** `next build` type-checks every file `web/tsconfig.json` includes (`**/*.ts`, `**/*.tsx`: `tests/`, `e2e/` and `content/` too), and the target is `es2016`, so a regular expression must not use the `s` flag. In JSX text, `{` `}` `<` `>` must be escaped. P1A's `copy.test.ts` fails when a file under `app/`, `components/`, `lib/` or `content/` other than `lib/copy.ts` contains a `NEW_COPY` value (a value of 20 or more characters anywhere; a shorter one as a whole string literal or JSX text), so every new string is imported from `lib/copy.ts`; Task 13 explains the handful of single words that other modules already print and that therefore live in `lib/review-copy.ts` instead. Every API integration test starts its own Postgres container (Docker must be running).

## Global Constraints

Copied from the spec unless marked *P1C plan rule*. Every task's requirements include this section.

- "**Decision (P1C, PO D2, D49).** `senior` is a pharmacist role. Every rule in this spec that names the pharmacist also applies to the senior pharmacist: approval, the promise's consequence, the "needs review" set, Report issue, history, and access to every pharmacist route. The senior also has the senior review surfaces (§5.17) and Dismiss issue (§5.10a). Wherever this spec writes "pharmacist" for a power, read "pharmacist or senior pharmacist". Wherever it writes "pharmacist" for a label shown to reviewers, the senior's label is "senior pharmacist"." (§2.2)
- "**Every role gate learns `senior` (Decision).** The web hard-codes `pharmacist | engineer` in many places, and a senior session breaks at each one unless it changes. P1C changes all of them, and none may keep its own role list" (§5.13). "A new helper `actsAsPharmacist(role)` (true for `pharmacist` and `senior`) is the one test for pharmacist powers" (§5.13).
- "**Decision (P1C, D49).** Every route above that is open to "pharmacist, engineer" is also open to `senior`. The three senior routes are open to `senior` only." (§2.1) "Pharmacists and engineers get status 200 and an info `Banner` … These pages carry no data for those roles" (§5.17).
- "**Publishing is unchanged.** Any pharmacist's (or senior's) "Looks correct" approves and publishes its record, batch by batch, as today." (§5.13) "A senior's approval reads "Approved by a pharmacist" in public (D49)." (§2.2)
- "**Dismissed issues (P1C, Decision, PO D10, D57).** A counted `dismiss` decision (§5.10a) is a review boundary, like a re-run stamp. Decisions at or before it no longer count. So after a dismissal the record's `review` is `pending` and its display status is `pending`, even when a pharmacist's `ok` came before the issue; a pharmacist (or senior) approves it again." (§5.2) "The PO's alternative, "restore the prior approval", is not chosen (§13.1 Q4)."
- "A dismissal is a new append-only decision, `decision = 'dismiss'`, in `ops.review_decision` (V7, §7.8). It has a required note of 5–1000 characters. It is audited, version-guarded and idempotent by `requestId`, like every decision (§7.2)." "Only role `senior` may dismiss: the web refuses other roles with `forbidden`, and the API refuses them with 400 `field=reviewerRole` (§7.2). The reporter's note stays in the history (§5.6.5)." (§5.10a)
- "**Dismissal uses the report channel (Decision).** … there is no third channel. … There is no undo window (the panel and its note are the confirm step, §5.10a)." (§5.8.2)
- "Every alert is returned with its DDInter text, whatever its senior-review state." (§7.4) "It **never** hides the pair, its severity or its text, anywhere. Hiding an interaction would show the absence of data as safety (G3)." (§5.17) "an interaction is never hidden because no senior pharmacist has reviewed it yet. Senior review of pairs comes after the fact; it is not a gate" (G3).
- "*(P1C)* A pair's senior-review state is plain text (`PairReviewState`). A senior's review of a pair is not a pharmacist's approval of a record, so it never uses green, the seal icon or a review-status pill." (§3.4 mark exclusivity) Green, the hatch, square chips and material keep their P1A meanings.
- §3.6 additions, verbatim: `PROMISE_SENIOR` = `**You're reviewing as a senior pharmacist.** "Looks correct" publishes this record after an {n}-second undo window.`; `FROM_DDINTER` = `From DDInter 2.0`; `PAIR_REVIEWED` = `Pair reviewed by a senior pharmacist on {date}` ("`{date}` = `DD/MM/YYYY` of the counting pair review, Dhaka"); `PAIR_NOT_REVIEWED` = `Pair not yet reviewed by a senior pharmacist`.
- `SourceLink`: "`<a class="src-link" href={url} target="_blank" rel="noopener noreferrer">{label}<span class="sr-only"> (opens in a new tab)</span></a>`, plus " fetched on {DD/MM/YYYY}" (Dhaka date) when `fetchedAt` is set | Never rendered without a `url`. Never says "fetched on" without a stored time. Plain link style, never a button." (§3.4) "The URL is built **only** by the API (`$API/domain/SourceLinks.java`) … The web renders it with `SourceLink` and never builds a source URL itself. The code is checked against its system's pattern before a URL is built. A code that fails the check gets no link and is still shown." (§5.6.6) "CI asserts the hrefs only and never calls the external sites." (§5.6.6)
- "The reopen rule. A record goes back to review **only** when something its approval covered changes." (§8.3.1) "**Not covered** (they never re-open a record): DDInter pairs, severities, actions, interaction and management texts, diseases, foods, DDInter entry names, substance synonyms (`substance_name`, §13.1 Q7), stage statuses and notes." "re-runs never publish (§12.5)" (G3).
- "**Linear, never quadratic (Decision).** … `computeFor` iterates only `me × partners` (O(n)), never partner × partner, and computes no batch-wide count" (§7.3). "The queries are set-based … never one query per batch." (§7.3) "`PairReviewRule` … is computed for a page of pairs with one query over `ops.pair_review` (no N+1)." (§7.7)
- "Every change keeps the `ApiResponse` envelope and the error mapping in `ApiExceptionHandler`. New errors use the existing codes (`INVALID_QUERY`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`) with a `field`." (§7)
- "**Removed items are never public (PO D7).** `ReviewSql.statusOf` reads a latest item marked "removed from batch file" as `pending`, and `ReviewSql.LATEST_PUBLIC` excludes it. … It adds no second rule" (§7.4).
- V7 (§7.8), verbatim SQL in Task 1; "add the `db/migrations.lock` line for V7 and change the lock's header to `db-schema-v1.2`; explain the change under the four headings `database.md` requires; update `docs/design/database.md` and the data model page; tag `db-schema-v1.2`." "**Retention (Decision)**: pair reviews are kept indefinitely, like decisions."
- Audit (§5.15): `pair_decision` and `pair_decision_rejected` are written by the API only; `senior_open` by the web ("At most one per actor, page and 10 minutes"); "There are no IP addresses and no free text from forms." "The web container's stdout logs never contain emails, notes, flag messages".
- Bot protection and limits (§9.2, §9.3 rows, verbatim): "Dismissals and pair decisions | Turnstile `action=decision` (one widget per desk or senior page), session role `senior` re-checked by the web action, and `reviewerRole` checked by the API"; "Decision and report actions, per account (*P1C*: including dismissals and pair decisions, one shared budget) | 60 per minute".
- Privacy (§9.7): the dismissal note and "the pair-issue note (`pair_review.note`, shown to every reviewer role …; never in public)" carry `NO_PHI_HELP`. "Emails: stored for the team only, in `review_decision`, `flag`, `audit_event` and (*P1C*) `pair_review`; never in public responses, never in logs".
- §4.2 island row, verbatim: "SeniorDesk *(P1C)* | `components/review/senior/SeniorDesk.tsx` plus `components/review/senior/*` | Keyboard model of the senior pages (J, K, M, R, ?, Esc), pair decisions with Turnstile and `requestId`, the pair-issue note drafts, row-level 409 banners, live region | role, page kind (`queue` or `substance`), the visible pair order with each pair's `{ddinterA, ddinterB, version}`, desk settings (single-key shortcuts). No clinical text and no emails in props; the rows are server-rendered." "*(P1C)* ReviewDesk's `role` prop also takes `senior`".
- §10.6 row, verbatim: "*(P1C)* `/review/pairs`, `/review/substances/[id]` (laptop, broadband; 50 pairs per page) | ≤ 120 KB | ≤ 180 KB | ≤ 25 KB | same | ≤ 1.5 s". "Server: API p95 ≤ 300 ms per call (existing target)."
- §3.5 voice: "Say what was and wasn't saved. Never write a bare "Something went wrong"." "**Dates follow Bangladesh conventions.**" "**Em dash.** The only em dash in the product is in the stale-page title."
- "**Decision: no runtime feature flags.**" "*(P1C)* P1C is the whole of phase 1C and may merge to `main` on its own, after P3." (§12.3) "The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted." (§12.4) "These stay unchanged …: the compose project `bddrug`; image names …; the database name; the Java package and the ETL package." (§9.8)
- Healthcare data (CLAUDE.md): never log PHI, notes or reviewer emails.
- *P1C plan rule (copy keys).* `NEW_COPY` is keyed by the §1.7 row text with the markdown marker `*(P1C)* ` removed, so the P1C rows of §1.7 and the amended History row read exactly as their spec text without that marker (Task 13 lists all eight).
- Commits: `type(scope): description`, scope one of `etl`, `api`, `web`, `db`, `deploy`, `docs`; every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Test-first in every task.

## Review Focus

Five inputs the spec implies but its listed tests do not exercise, most likely to bite a person using this software first. Each is pinned by a test in the task named.

1. **The P1C pilot re-run against the pilot's version-1 snapshots.** Every pilot item's current snapshot was written before P1C, with payload `version: 1` and no `coverage` key. The first post-deploy DDInter re-run (§8.3.1 "The P1C pilot check") compares a version-2 view with those snapshots; if coverage is compared, every approved pilot record leaves public view on deploy day. An unchanged re-run against a version-1 snapshot must stamp nothing. Pinned in Task 11 (`test_reopen_rule.py`, "test_rerun_against_a_v1_snapshot_stamps_nothing").
2. **Other batches whose products are all also in this batch.** The CI seed (and any batch re-listed whole) has other batches but no product outside this batch, so `otherPairs` is empty. The desk must not then say "DDInter 2.0 lists no interaction between {trade name} and the medicines in other batches." (a no-interaction claim about medicines that do not exist); it says "There are no other batches yet." because `otherBatches` counts only batches that hold a partner. Pinned in Task 7b (`ReviewQueryCrossBatchIntegrationTest.otherBatchesCountsOnlyBatchesWithAPartner`) and Task 18 (`review-interactions.test.tsx`, "no partners in other batches: no no-interaction claim").
3. **DDInter placeholder text in a reviewed pair.** P0's ETL stores DDInter's "None" or "-" as NULL; rows stored earlier may still hold the placeholder. If the content hash used the raw text, cleaning a row would turn every reviewed pair into "changed" with no clinical change. The hash is taken after `DdinterText.clean`, so "None", "-", blank and NULL hash alike. Pinned in Task 5 (`PairContentTest.placeholderTextHashesLikeNull`).
4. **A dismissal note written in emoji or Bengali.** The API counts the 5-to-1000 rule in code points; "😀😀😀😀" is 8 UTF-16 units but 4 characters. The desk must show the field error for it and accept "অবৈধ রিপোর্ট" (code points ≥ 5), or the API answers 400 and the senior sees "not saved" for a note the page called valid. Pinned in Task 16 (`desk-keys.test.tsx`, "the dismissal note is counted in code points").
5. **A senior page URL with a page past the end or unknown filters** (`/review/pairs?page=40`, `?show=bogus&severity=urgent`). The web keeps the defaults for unknown values, the API answers a page past the end with no items and the true total, and the page then shows "Previous page" (to the last page), never the empty-state sentence ("No pairs to review." would be false). Pinned in Task 8a (`PairQueueIntegrationTest.aPagePastTheEndIsEmptyWithTheTrueTotal`) and Task 23 (`senior-pages.test.tsx`, "a page past the end shows Previous page, not the empty copy").

---

## Before you start

- [ ] Branch from `main` once P3 has merged (the branch may already exist locally, so switch to it and rebase, or create it):

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
git fetch origin
git switch main && git pull --ff-only
test -f web/app/learn/\[chapter\]/page.tsx && grep -q "LATEST_PUBLIC" api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java && echo "P3 is on main"
git switch feature/intellidrugs-p1c-review-model 2>/dev/null && git rebase origin/main || git switch -c feature/intellidrugs-p1c-review-model origin/main
```

Expected: `P3 is on main`, then the branch checked out on top of `origin/main`. If the line is missing, P3 has not merged: stop.

- [ ] Commit this plan on the branch, so the plan the commits cite is in the history:

```bash
git add docs/superpowers/plans/2026-10-15-intellidrugs-p1c-review-model.md
git commit -m "docs(web): IntelliDrugs P1C implementation plan" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] Confirm the P0, P1A, P1B and P3 names this plan builds on (each command prints at least one line; alternations use `grep -E`):

```bash
grep -n "public static String displayStatus" api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java
grep -n "public static Optional<Refusal> check" api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java
grep -nE "static String statusOf|static final String LATEST_PUBLIC" api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java
grep -n "public static Result compute" api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java
grep -n "public static Result build" api/src/main/java/com/niramoy/bddrug/domain/ItemHistory.java
grep -n "public static String sourceUrl" api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java
grep -n "public static final Set<String> WEB_EVENTS" api/src/main/java/com/niramoy/bddrug/application/AuditService.java
grep -n "def reopen_review" etl/src/bddrug_etl/load/batches.py
grep -n "PAYLOAD_VERSION = 1" etl/src/bddrug_etl/load/snapshots.py
grep -n "export const ROLES" web/lib/reviewers.ts
grep -n "export function runDecide" web/lib/desk-core.ts
grep -n "export function step" web/components/review/desk/commit-machine.ts
grep -n "export function promise" web/components/review/desk/bar-state.ts
grep -n "export default function Interactions" web/components/review/detail/Interactions.tsx
grep -n "export const NEW_COPY_ROWS" web/lib/copy.ts
grep -n "export const ISLAND_DIRS" web/scripts/check-client-islands.mjs
grep -n "export const MATERIAL_ALLOWED" web/tests/marks.test.ts
grep -n "export async function signInAs" web/e2e/session.ts
grep -n "lighthouserc.learn.json" .github/workflows/ci.yml
```

- [ ] Tooling and a green baseline (Docker must be running):

```bash
(cd web && npm ci)
(cd etl && python3.12 -m venv .venv && . .venv/bin/activate && pip install -e '.[test]' && pytest -q)
(cd api && ./gradlew test --no-daemon)
(cd web && API_URL=http://api:8080 npm test && npm run build)
```

Expected: every suite passes; the build ends with `client island check: … all on the §4.2 allowlist`. On a red baseline, stop and report it. Later ETL commands assume `etl/.venv` is active (`. etl/.venv/bin/activate`).

## File Structure

```
docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md   MODIFY (Task 0) §7.4 checker pairReview in P1C, §11.4, §12.2
db/migrations/V7__senior_review.sql             CREATE (Task 1) the §7.8 migration, verbatim
db/migrations.lock                              MODIFY V7 line, header db-schema-v1.2
docs/design/database.md                         MODIFY V7 change log, rules, tags
docs/artifacts/2026-10-12-data-model.html       MODIFY pair_review, widened checks, audit events

api/src/main/java/com/niramoy/bddrug/
  domain/ApprovalRule.java                      MODIFY senior acts as pharmacist; dismissal boundary; carried approval; openIssues
  domain/DecisionGuard.java                     MODIFY step 6d (dismiss needs an open issue)
  domain/ItemHistory.java                       MODIFY uncountedBy ("rerun" | "dismiss"), carriedFrom
  domain/SourceLinks.java                       CREATE §5.6.6 URL builder (validated codes only)
  domain/PairContent.java                       CREATE canonical JSON and SHA-256 of a pair's content
  domain/PairReviewRule.java                    CREATE the four pair states, public form, history, changes
  domain/PairQueue.java                         CREATE §5.17.1 filters, counts, order (pure)
  domain/BatchPairs.java                        MODIFY computeFor (linear), PairRow.interactionId, Pair source/pairReview,
                                                       partnerScope
  domain/ReviewItem.java                        MODIFY brand.source, TextMissingPair.partnerScope, otherPairs, openIssues
  domain/IngredientSummary.java                 MODIFY Code.source, Entry.source
  domain/SeniorViews.java                       CREATE §7.7 response records
  domain/InteractionAlert.java, CheckResult.java MODIFY (Task 9) ddinterA/ddinterB and the public pairReview
  application/ReviewService.java                MODIFY senior role, dismiss validation
  application/ReviewQueryService.java           MODIFY otherPairs, openIssues, partnerScope, sources, pairReview
  application/SeniorReviewService.java          CREATE pair queue, substances, substance page, pair decisions
  application/AuditService.java                 MODIFY senior_open, senior, substance and pair_queue targets
  application/InteractionCheckService.java      MODIFY (Task 9) public pairReview on alerts
  application/port/ReviewQueryPort.java         MODIFY otherProducts, held-batch count, pair reviews
  application/port/SeniorReviewPort.java        CREATE what the senior service reads and writes
  application/port/CheckQueryPort.java          MODIFY CheckData.reviews
  adapter/persistence/R2dbcReviewAdapter.java   MODIFY carried approval in recomputeItem
  adapter/persistence/R2dbcReviewQueryAdapter.java MODIFY interaction_id, sources, other products, snapshots carriedFrom
  adapter/persistence/IngredientSummaryReader.java MODIFY code and entry sources (fetchedAt)
  adapter/persistence/PairReviewReader.java     CREATE one query over ops.pair_review for a set of entries
  adapter/persistence/R2dbcSeniorReviewAdapter.java CREATE held products, pairs, substance page, pair decision tx
  adapter/persistence/R2dbcCheckAdapter.java    MODIFY (Task 9) pair reviews for the loaded pairs
  presentation/SeniorReviewController.java      CREATE /v1/review/pairs, /v1/review/substances…
api/src/test/java/com/niramoy/bddrug/
  V7MigrationIntegrationTest.java               CREATE   AuditAppendOnlyIntegrationTest.java  MODIFY
  AuditApiIntegrationTest.java                  MODIFY   ApprovalRuleTest.java, DecisionGuardTest.java  MODIFY
  ReviewDismissApiIntegrationTest.java          CREATE   ItemHistoryTest.java  MODIFY
  SourceLinksTest.java, PairContentTest.java, PairReviewRuleTest.java, PairQueueTest.java  CREATE
  BatchPairsTest.java                           MODIFY   ReviewQueryIntegrationTest.java  MODIFY
  OtherPairsScaleIntegrationTest.java           CREATE   PairQueueIntegrationTest.java  CREATE
  ReviewQueryCrossBatchIntegrationTest.java     CREATE   PairDecisionIntegrationTest.java  CREATE
  VisibilityApiIntegrationTest.java             MODIFY   PublicStatusGuardTest.java  CREATE
  InteractionCheckServiceTest.java, DdinterTextTest.java  MODIFY (secondary constructors only)

etl/src/bddrug_etl/
  load/snapshots.py                             MODIFY payload version 2 (coverage, carried_from), approval_view, same_view
  load/batches.py                               MODIFY settle(), DgdaTargets, BatchStats; no unconditional stamps
  jobs/run_pipeline.py                          MODIFY settle per stage, --reopen, settle log lines
  stages/results.py, stages/substances.py       MODIFY docstrings (ddinter_ids no longer select anyone)
etl/tests/
  test_reopen_rule.py                           CREATE §11.3 "ETL, P1C reopen rule"
  test_snapshots.py, test_batches.py, test_shared_reopen.py, test_run_pipeline.py, test_pipeline_scale.py  MODIFY
.github/workflows/load-dgda.yml                 MODIFY reopen input

web/
  lib/copy.ts                                   MODIFY §3.6 P1C constants, the P1C §1.7 rows, P1C_COPY (Task 13)
  lib/review-copy.ts                            MODIFY SHARED_WORDS, senior history lines, doneBody (§1.6 item 17), keyRow,
                                                       SHEET_ROWS(n, role), SENIOR_SHEET_ROWS
  lib/format.ts                                 MODIFY fmtDhakaDate()
  lib/reviewers.ts                              MODIFY senior; ROLES; ROLE_LABEL.senior; isReviewer; re-exports actsAsPharmacist
  lib/review-types.ts                           MODIFY senior role, actsAsPharmacist (client-safe), Source, PairReview,
                                                       partnerScope, otherPairs, openIssues, history fields
  lib/senior-types.ts                           CREATE §7.7 shapes and the pair action's types (client-safe)
  lib/senior-params.ts                          CREATE senior page parameters and links (defaults for unknown values)
  lib/api.ts                                    MODIFY decision body (senior, dismiss); senior reads; postPairDecision
  lib/audit.ts                                  MODIFY senior_open; substance and pair_queue targets
  lib/actions-core.ts, lib/desk-core.ts         MODIFY isReviewer everywhere; dismiss (senior only, no_issue)
  lib/senior-core.ts                            CREATE runPairDecide, logSenior (server-only)
  lib/senior-actions.ts                         CREATE "use server": pairDecide, logSeniorOpen
  lib/request-log.ts                            MODIFY /review/pairs, /review/substances, /review/substances/[bdsId]
  components/ui/SourceLink.tsx, PairReviewState.tsx  CREATE
  components/ui/CodeChip.tsx, PairCard.tsx, Severity.tsx, index.ts  MODIFY source; heading levels, details/link/review
                                                       slots, PairText; SEVERITY_LABEL
  components/Header.tsx, components/review/ReviewAccount.tsx, ReviewToolbar.tsx  MODIFY senior label, "Senior review" item
  components/review/SeniorLinks.tsx             CREATE sidebar "Senior review" block
  components/review/desk/commit-machine.ts      MODIFY SEND_DISMISS on the report channel; no_issue
  components/review/desk/bar-state.ts           MODIFY senior promise, dismiss rows, dismissHint, dismissDisabled, sendDismissHint
  components/review/desk/keys.ts                MODIFY D, the dismiss field
  components/review/desk/drafts.ts              MODIFY dismiss and pair drafts; clearAllDrafts covers them
  components/review/desk/context.ts             MODIFY DeskApi dismiss members, slots.seniorLinks; RecordRegistration.openIssues
  components/review/desk/DecisionBar.tsx        MODIFY Dismiss issue button and panel; report-channel copy by op
  components/review/desk/advance.ts             MODIFY needsFor via actsAsPharmacist
  components/review/desk/ShortcutsSheet.tsx     MODIFY senior row
  components/review/desk/StagePairs.tsx         MODIFY fk per group
  components/review/desk/DeskRecordContext.tsx  MODIFY the seniorLinks slot
  components/review/desk.module.css             MODIFY dismiss panel
  components/review/ReviewDesk.tsx              MODIFY dismiss panel state, D key, seniorLinks slot
  components/review/detail/Interactions.tsx     MODIFY "With other medicines", combination fix, sources, review state
  components/review/detail/AutomatedChecks.tsx  MODIFY partnerScope note split
  components/review/detail/ComparisonTable.tsx  MODIFY source links
  components/review/detail/EvidenceContent.tsx  MODIFY "Sources"
  components/review/detail/History.tsx, detail.module.css  MODIFY carried-approval line; other-batch partner list
  components/review/detail/ConfirmPanel.tsx     MODIFY actsAsPharmacist
  components/review/senior/                     CREATE the SeniorDesk island (SeniorDesk, PairActions, PairStateLine, SeniorSheet,
                                                       keys.ts, pair-machine.ts, context.ts, senior.module.css) and the
                                                       server parts (SeniorShell, PairRow, PairList, PairFilters, pages.module.css)
  app/review/pairs/page.tsx                     CREATE   app/review/substances/page.tsx  CREATE
  app/review/substances/[bdsId]/page.tsx, not-found.tsx  CREATE (no loading.tsx: P1B's no-streaming rule)
  app/review/[batchId]/layout.tsx, page.tsx, [conceptId]/page.tsx, app/review/flags/page.tsx, app/review/error.tsx  MODIFY
  scripts/check-client-islands.mjs              MODIFY components/review/senior/
  e2e/p1c-fixture.sql                           CREATE batch e2e-p1c (applied by senior.spec.ts, not seeded: Learn's numbers)
  e2e/senior.spec.ts, e2e/lhci-session-senior.cjs, lighthouserc.senior.json  CREATE
  e2e/db.ts, e2e/session.ts                     MODIFY fixture and audit helpers; the senior e2e account
  tests/…                                       see each task
deploy/docker-compose.ci.yml                    MODIFY senior@e2e.test:senior in REVIEWERS
docs/runbooks/reviewer-invite.md                MODIFY senior invite template, rollback query
.github/workflows/ci.yml                        MODIFY senior Lighthouse step
```

Responsibilities: every rule that decides a state lives in one pure domain function with its own unit test (`ApprovalRule`, `PairReviewRule`, `PairContent`, `PairQueue`, `SourceLinks`, `BatchPairs`, `approval_view`); adapters only read and write; services assemble. On the web, every role decision goes through `isReviewer` or `actsAsPharmacist`; the desk's dismissal reuses the report channel (`commit-machine.ts`); the senior pages are server components with one island whose outcomes are a pure reducer (`pair-machine.ts`).

---
### Task 0: Amend the spec — the checker's `pairReview` field ships with P1C, and the e2e senior check reads the API

§12.2 says a plan "may not change a Decision here without amending this spec first". Two P1C tests in §11.3 (`PairQueueIntegrationTest.changedPairReturnsToQueue`: "its public `pairReview` is `not_reviewed`"; `VisibilityApiIntegrationTest`: "public `pairReview` never shows `changed` or `issue`") need a public endpoint that carries `pairReview`, while §12.2 gives "`pairReview` in the check result and P9" to P2. The only public endpoint P1C can add it to without building a P2 surface is `POST /v1/interactions/check` (an additive field on each alert; P9 does not exist yet). §11.4's senior e2e step "the public checker then shows `PAIR_REVIEWED`" needs P2's checker page. This task records both moves before any code.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md`

**Interfaces:**
- Produces: the amended §7.4 P1C rules, §11.4 "Senior pages" bullet, §12.2 P1C and P2 rows. Task 9 implements the checker field; Task 25 implements the amended e2e step.

- [ ] **Step 1: Make the edits** (each `old` string occurs once in the spec; use the Edit tool)

1. §7.4 "P1C public rules", after the first bullet (the one ending `and it is served only for pairs between public products.`), add a new bullet:

```markdown
- **Where it ships (amended by the P1C plan, 15/10/2026).** P1C adds `ddinterA`, `ddinterB` and `pairReview` to each alert of the existing `POST /v1/interactions/check` (additive; the other alert fields stay as they are until P2 reshapes the result). P2 renders it, and adds it to P9.
```

2. §11.4, in the bullet that starts `- *(P1C)* **Senior pages**:`, replace

```markdown
M marks it reviewed, and the public checker then shows `PAIR_REVIEWED`; the test updates the pair text in the database, and the pair is back under "Changed since review" while the public checker shows `PAIR_NOT_REVIEWED` and the approved record stays approved;
```

with

```markdown
M marks it reviewed, and its row reads `PAIR_REVIEWED`; the test updates the pair text in the database, and the pair is back under "Changed since review" while the approved record stays approved (P1C pins the public `pairReview` of the checker at API level, `PairQueueIntegrationTest`; P2's checker e2e asserts `PAIR_REVIEWED` and `PAIR_NOT_REVIEWED` on the page);
```

3. §12.2, P1C row: replace

```markdown
the PO D7 visibility tests (§7.4); V7 and `db-schema-v1.2` (§7.8);
```

with

```markdown
the PO D7 visibility tests (§7.4); the checker alerts' `ddinterA`, `ddinterB` and public `pairReview` (§7.4, API only); V7 and `db-schema-v1.2` (§7.8);
```

and in the P2 row replace

```markdown
`pairReview` in the check result and P9;
```

with

```markdown
the check result's `pairReview` rendered on the page (P1C ships the API field) and P9;
```

- [ ] **Step 2: Check every edit landed**

```bash
S=docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md
grep -c "Where it ships (amended by the P1C plan" $S
grep -c "P1C pins the public \`pairReview\` of the checker at API level" $S
grep -c "the checker alerts' \`ddinterA\`, \`ddinterB\` and public \`pairReview\`" $S
grep -c "rendered on the page (P1C ships the API field)" $S
```

Expected: `1` from every line.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md
git commit -m "docs(web): spec §7.4, §11.4, §12.2 — the checker's pairReview field ships with P1C (API only)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 1: V7 migration, `db-schema-v1.2`, and the audit service's senior events

**Files:**
- Create: `db/migrations/V7__senior_review.sql`, `api/src/test/java/com/niramoy/bddrug/V7MigrationIntegrationTest.java`
- Modify: `db/migrations.lock`, `docs/design/database.md`, `docs/artifacts/2026-10-12-data-model.html`, `api/src/main/java/com/niramoy/bddrug/application/AuditService.java`, `api/src/test/java/com/niramoy/bddrug/AuditAppendOnlyIntegrationTest.java`, `api/src/test/java/com/niramoy/bddrug/AuditApiIntegrationTest.java`

**Interfaces:**
- Consumes: `PilotSeed.migrateAndSeed`, `TestSupport.exec/count/text` (existing); V4's implicit constraint names `review_decision_decision_check`, `review_decision_reviewer_role_check`; V6's `audit_event_event_check`, `audit_event_actor_role_check`, `ops.reject_change()`.
- Produces: table `ops.pair_review (id, ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at)`; `ops.review_decision.decision ∈ {ok, issue, dismiss}` and `reviewer_role ∈ {pharmacist, engineer, senior}` with `review_decision_dismiss_by_senior`; `ops.audit_event.event` adds `pair_decision`, `pair_decision_rejected`, `senior_open`, `actor_role` adds `senior`; unique index `audit_event_pair_decision_request_uq`. `AuditService.WEB_EVENTS` adds `senior_open`, `ROLES` adds `senior`, `TARGET_TYPES` adds `substance` and `pair_queue`.

- [ ] **Step 1: Write the failing migration test**

Create `api/src/test/java/com/niramoy/bddrug/V7MigrationIntegrationTest.java`:

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
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Spec §7.8: V7 widens the decision and role checks, adds ops.pair_review and the new audit events (db-schema-v1.2). */
@Testcontainers
class V7MigrationIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    static final String HASH = "7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f";

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('V7', 1);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES ('V7', 'DGDA-Drugs', 'W-1', now());
            """);
    }

    private static void decision(String decision, String note, String role) throws Exception {
        exec(pg, "INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) " +
                 "VALUES ('V7', 'W-1', '" + decision + "', '" + note + "', 's@example.org', '" + role + "')");
    }

    @Test void theConstraintsHaveTheNamesTheMigrationDropsAndAdds() throws Exception {
        assertThat(text(pg, """
            SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint
             WHERE conname IN ('review_decision_decision_check', 'review_decision_reviewer_role_check',
                               'review_decision_dismiss_by_senior', 'audit_event_event_check', 'audit_event_actor_role_check')"""))
            .isEqualTo("audit_event_actor_role_check,audit_event_event_check,review_decision_decision_check," +
                       "review_decision_dismiss_by_senior,review_decision_reviewer_role_check");
        assertThat(count(pg, "SELECT count(*) FROM pg_indexes WHERE indexname = 'audit_event_pair_decision_request_uq'")).isEqualTo(1);
        assertThat(count(pg, "SELECT count(*) FROM pg_indexes WHERE indexname = 'pair_review_pair_idx'")).isEqualTo(1);
    }

    @Test void aSeniorMayDecideAndDismissWithANote() throws Exception {
        decision("ok", "", "senior");
        decision("issue", "strength is wrong", "senior");
        decision("dismiss", "the report misread the register", "senior");
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE reviewer_role = 'senior'")).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "dismiss|a note long enough|pharmacist",   // only a senior dismisses
        "dismiss|abcd|senior",                     // under 5 characters
        "dismiss|      |senior",                   // blank once trimmed
        "approve||pharmacist",                     // not a decision
        "ok||admin",                               // not a role
    })
    void theWidenedChecksStillRefuseTheRest(String row) {
        String[] f = row.split("\\|", -1);
        assertThatThrownBy(() -> decision(f[0], f[1], f[2]))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("23514"));
    }

    private static String pairReview(String a, String b, String decision, String note, String hash, String role) {
        return "INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role) " +
               "VALUES ('" + a + "', '" + b + "', '" + decision + "', '" + note + "', '" + hash + "', '{}', 's@example.org', '" + role + "')";
    }

    @Test void aPairReviewIsStoredForAStoredPair() throws Exception {
        exec(pg, pairReview("DDInter14", "DDInter1951", "reviewed", "", HASH, "senior"));
        exec(pg, pairReview("DDInter14", "DDInter1951", "issue", "text contradicts the severity", HASH, "senior"));
        assertThat(count(pg, "SELECT count(*) FROM ops.pair_review WHERE ddinter_a = 'DDInter14'")).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "DDInter14|DDInter1951|issue|abcd|senior|" + HASH + "|23514",            // an issue needs 5 characters
        "DDInter1951|DDInter14|reviewed||senior|" + HASH + "|23514",             // a < b in text order
        "DDInter14|DDInter1951|reviewed||pharmacist|" + HASH + "|23514",         // senior only
        "DDInter14|DDInter1951|reviewed||senior|not-a-hash|23514",               // 64 lower-case hex
        "DDInter14|DDInter1951|approved||senior|" + HASH + "|23514",             // reviewed or issue
        "DDInter14|DDInter9999|reviewed||senior|" + HASH + "|23503",             // the pair must be stored (FK)
    })
    void pairReviewRowsAreChecked(String row) {
        String[] f = row.split("\\|", -1);
        assertThatThrownBy(() -> exec(pg, pairReview(f[0], f[1], f[2], f[3], f[5], f[4])))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo(f[6]));
    }

    @Test void theNewAuditEventsAndTheSeniorRoleAreAccepted() throws Exception {
        exec(pg, """
            INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) VALUES
             ('pair_decision', 's@example.org', 'senior', 'ddinter_pair', 'DDInter14/DDInter1951', 'reviewed', '00000000-0000-4000-8000-0000000000a1'),
             ('pair_decision_rejected', 's@example.org', 'senior', 'ddinter_pair', 'DDInter14/DDInter1951', 'CONFLICT', '00000000-0000-4000-8000-0000000000a2'),
             ('senior_open', 's@example.org', 'senior', 'pair_queue', 'todo', 'shown', '00000000-0000-4000-8000-0000000000a3');
            """);
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE actor_role = 'senior' AND request_id IN " +
            "('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3')"))
            .isEqualTo(3);
    }

    @Test void onePairDecisionAuditRowPerRequestId() throws Exception {
        String row = "INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) " +
                     "VALUES ('pair_decision', 's@example.org', 'senior', 'ddinter_pair', 'DDInter14/DDInter1951', 'reviewed', " +
                     "'00000000-0000-4000-8000-0000000000b1')";
        exec(pg, row);
        assertThatThrownBy(() -> exec(pg, row))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("23505"));
    }
}
```

The hash constant is `PairContent.hash` of the PilotSeed pair `DDInter14/DDInter1951` (moderate, no actions, no text); Task 5 pins the same value. The CHECK only needs 64 lower-case hex characters.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests V7MigrationIntegrationTest`
Expected: FAIL. `theConstraintsHaveTheNamesTheMigrationDropsAndAdds` reads a list without `review_decision_dismiss_by_senior`; the senior and pair-review tests fail with SQLState `23514` or `42P01` (`relation "ops.pair_review" does not exist`).

- [ ] **Step 3: Write the migration**

Create `db/migrations/V7__senior_review.sql` (spec §7.8, verbatim):

```sql
-- IntelliDrugs P1C (spec §7.8, db-schema-v1.2): the senior pharmacist role, the dismiss decision, append-only pair
-- reviews, and the new audit events. Additive in effect: every existing row satisfies the widened checks.

-- V4 named these column CHECKs implicitly; the migration test asserts the names in pg_constraint before dropping.
ALTER TABLE ops.review_decision DROP CONSTRAINT review_decision_decision_check;
ALTER TABLE ops.review_decision ADD CONSTRAINT review_decision_decision_check
  CHECK (decision IN ('ok','issue','dismiss'));
ALTER TABLE ops.review_decision DROP CONSTRAINT review_decision_reviewer_role_check;
ALTER TABLE ops.review_decision ADD CONSTRAINT review_decision_reviewer_role_check
  CHECK (reviewer_role IN ('pharmacist','engineer','senior'));
ALTER TABLE ops.review_decision ADD CONSTRAINT review_decision_dismiss_by_senior
  CHECK (decision <> 'dismiss' OR (reviewer_role = 'senior' AND length(btrim(note)) BETWEEN 5 AND 1000));

CREATE TABLE ops.pair_review (
  id             BIGSERIAL   PRIMARY KEY,
  ddinter_a      TEXT        NOT NULL,
  ddinter_b      TEXT        NOT NULL,
  decision       TEXT        NOT NULL CHECK (decision IN ('reviewed','issue')),
  note           TEXT        NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  content_hash   TEXT        NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  content        JSONB       NOT NULL,      -- severity, actions, interaction, management as reviewed
  reviewer_email TEXT        NOT NULL,      -- team-only, like review_decision
  reviewer_role  TEXT        NOT NULL CHECK (reviewer_role = 'senior'),
  decided_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ddinter_a < ddinter_b),
  CHECK (decision <> 'issue' OR length(btrim(note)) >= 5),
  FOREIGN KEY (ddinter_a, ddinter_b) REFERENCES curated.ddinter_pair (ddinter_a, ddinter_b)
);
CREATE INDEX pair_review_pair_idx ON ops.pair_review (ddinter_a, ddinter_b, decided_at DESC, id DESC);

CREATE TRIGGER pair_review_append_only BEFORE UPDATE OR DELETE ON ops.pair_review
  FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER pair_review_no_truncate BEFORE TRUNCATE ON ops.pair_review
  FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
REVOKE UPDATE, DELETE, TRUNCATE ON ops.pair_review FROM PUBLIC;

ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_event_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_event_check CHECK (event IN (
  'sign_in','sign_in_denied','sign_out','review_open','evidence_open',
  'decision','decision_rejected','decision_denied',
  'flag_created','flag_resolved','partner_request',
  'pair_decision','pair_decision_rejected','senior_open'));
ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_actor_role_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_actor_role_check
  CHECK (actor_role IN ('pharmacist','engineer','senior','user'));
CREATE UNIQUE INDEX audit_event_pair_decision_request_uq ON ops.audit_event (request_id) WHERE event = 'pair_decision';
```

- [ ] **Step 4: Lock it**

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
sed -i.bak '1s/.*/# Database schema lock — db-schema-v1.2 (V1-V5 approved by the product owner on 2026-10-12; V6 added by the IntelliDrugs P0 plan; V7 by the P1C plan)./' db/migrations.lock && rm db/migrations.lock.bak
printf '%s  V7__senior_review.sql\n' "$(shasum -a 256 db/migrations/V7__senior_review.sql | cut -d' ' -f1)" >> db/migrations.lock
./db/check-migration-lock.sh
```

Expected: `schema lock OK: 7 locked migrations unchanged`.

- [ ] **Step 5: Run the migration test**

Run: `cd api && ./gradlew test --no-daemon --tests V7MigrationIntegrationTest`
Expected: PASS (16 tests).

- [ ] **Step 6: Extend the append-only test**

In `api/src/test/java/com/niramoy/bddrug/AuditAppendOnlyIntegrationTest.java`, change the class Javadoc's first sentence to `Spec §7.6, §7.8: ops.audit_event, ops.item_snapshot and ops.pair_review are append-only.`; append to the `seed()` SQL (inside the text block, after the `audit_event` insert):

```sql
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
              VALUES ('DDInter14', 'DDInter1951', 'reviewed', '',
                      '7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f', '{}', 's@example.org', 'senior');
```

add three entries to the `@ValueSource` list:

```java
        "UPDATE ops.pair_review SET note = 'changed'",
        "DELETE FROM ops.pair_review",
        "TRUNCATE ops.pair_review",
```

and one line to `theRowsAreStillThere()`:

```java
        assertThat(TestSupport.count(pg, "SELECT count(*) FROM ops.pair_review")).isEqualTo(1);
```

Run: `cd api && ./gradlew test --no-daemon --tests AuditAppendOnlyIntegrationTest`
Expected: PASS (10 tests).

- [ ] **Step 7: Write the failing audit API tests**

In `api/src/test/java/com/niramoy/bddrug/AuditApiIntegrationTest.java`, add at the end of the class:

```java
    // ---- P1C (§7.5): senior_open, the senior role; pair decisions are the API's own

    @Test void seniorOpenWithEachTargetTypeIs201() throws Exception {
        for (String[] t : new String[][]{{"substance", "BDS-000001"}, {"pair_queue", "todo"}, {"pair_queue", "issue"}}) {
            String rid = UUID.randomUUID().toString();
            Map<String, Object> body = event("senior_open", "shown", rid);
            body.put("actorEmail", "senior.reviewer@example.org");
            body.put("actorRole", "senior");
            body.put("targetType", t[0]);
            body.put("targetId", t[1]);
            post(internal(web), body).expectStatus().isCreated();
            assertThat(text(pg, "SELECT event || '|' || actor_role || '|' || target_type || '|' || target_id FROM ops.audit_event " +
                "WHERE request_id = '" + rid + "'")).isEqualTo("senior_open|senior|" + t[0] + "|" + t[1]);
        }
    }

    @Test void aSeniorSignInIs201() {
        Map<String, Object> body = event("sign_in", "ok", UUID.randomUUID().toString());
        body.put("actorEmail", "senior.reviewer@example.org");
        body.put("actorRole", "senior");
        post(internal(web), body).expectStatus().isCreated();
    }

    @Test void pairDecisionsAreNotTheWebsToPost() throws Exception {
        long before = rows();
        for (String e : List.of("pair_decision", "pair_decision_rejected"))
            post(internal(web), event(e, "reviewed", UUID.randomUUID().toString())).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("event");
        Map<String, Object> body = event("senior_open", "shown", UUID.randomUUID().toString());
        body.put("targetType", "ddinter_pair");
        body.put("targetId", "DDInter14/DDInter1951");
        post(internal(web), body).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("targetType");
        assertThat(rows()).isEqualTo(before);
    }
```

Run: `cd api && ./gradlew test --no-daemon --tests AuditApiIntegrationTest`
Expected: FAIL. `seniorOpenWithEachTargetTypeIs201` and `aSeniorSignInIs201` get 400 (`event` or `actorRole`).

- [ ] **Step 8: Widen the audit service**

In `api/src/main/java/com/niramoy/bddrug/application/AuditService.java`, replace the three set constants with:

```java
    /** §5.15, §7.5: the web's events. pair_decision and pair_decision_rejected are the API's own (pair decision path). */
    public static final Set<String> WEB_EVENTS =
        Set.of("sign_in", "sign_in_denied", "sign_out", "review_open", "evidence_open", "decision_denied", "senior_open");
    public static final Set<String> ROLES = Set.of("pharmacist", "engineer", "senior", "user");
    /** senior_open targets a substance (`BDS-…`) or the pair queue (its `show` value). ddinter_pair is written by the API only. */
    public static final Set<String> TARGET_TYPES = Set.of("batch_item", "flag", "substance", "pair_queue");
```

- [ ] **Step 9: Run the audit tests**

Run: `cd api && ./gradlew test --no-daemon --tests AuditApiIntegrationTest --tests V7MigrationIntegrationTest --tests AuditAppendOnlyIntegrationTest`
Expected: PASS.

- [ ] **Step 10: Document V7**

In `docs/design/database.md`:

1. Replace the two header lines (`**Status:** locked as \`db-schema-v1.1\`…` and `**Schema:** migrations \`V1\`–\`V6\`…`) with:

```markdown
**Status:** locked as `db-schema-v1.2`. The product owner approved `db-schema-v1.0` (V1–V5) on 2026-10-12; V6 is the additive change in the IntelliDrugs UX spec (§7.6); V7 is the additive P1C change (§7.8).
**Schema:** migrations `V1`–`V7` in `db/migrations/`, applied on drugdb.eliooo.org.
```

2. In "What "locked" means", item 1, replace `` `V1`–`V6` are never edited`` with `` `V1`–`V7` are never edited``; in item 4 replace `` `db-schema-v1.1` = V1–V6.`` with `` `db-schema-v1.1` = V1–V6, `db-schema-v1.2` = V1–V7.``

3. In "The design in one paragraph", in the `ops` bullet, replace `the audit trail (\`audit_event\`).` with `the audit trail (\`audit_event\`), and senior pharmacists' pair reviews (\`pair_review\`).`

4. In "Rules enforced by the database", after the bullet starting `- Item snapshots and audit events are append-only`, add:

```markdown
- Pair reviews (`pair_review`) are append-only (the same triggers). A reviewed pair cannot be deleted (foreign key to `ddinter_pair`, NO ACTION), and the ETL never deletes a pair row.
- Only a senior pharmacist may dismiss an issue, with a note of 5–1000 characters (`review_decision_dismiss_by_senior`).
- One `pair_decision` audit row per `request_id` (partial unique index), the backstop for idempotent pair decisions.
```

5. Under "## Change log", before `### V6`, add:

```markdown
### V7 `senior_review` (db-schema-v1.2)
- **The change:** widens `review_decision.decision` to `ok | issue | dismiss` and `review_decision.reviewer_role` to `pharmacist | engineer | senior`, and adds `review_decision_dismiss_by_senior` (a dismiss is a senior's, with a 5–1000 character note). Adds the append-only table `ops.pair_review` (one row per senior pair decision, with the content hash and the content reviewed), its index, two triggers on `ops.reject_change()`, and a REVOKE. Widens `audit_event.event` with `pair_decision`, `pair_decision_rejected` and `senior_open`, and `audit_event.actor_role` with `senior`, and adds a partial unique index on `audit_event (request_id) WHERE event = 'pair_decision'`.
- **Why it is needed:** the product owner's decisions of 15/10/2026 (PO D2, D3, D5, D10) add the senior pharmacist, who dismisses mistaken issues and reviews DDInter pairs across all batches; the V4 checks refuse the new role and decision, no table can hold a pair review with the content it covered, and the new audit events need the V6 checks widened.
- **What it does to existing rows:** nothing. Every existing row satisfies the widened checks; constraint changes are DDL, so the V6 append-only triggers are not involved. Retention: pair reviews are kept indefinitely.
- **How to roll it back:** a new migration that drops `ops.pair_review` and restores the narrower checks; it works only while no `senior` or `dismiss` row exists. Otherwise V7 stays: older images never write `senior`, `dismiss` or pair reviews. Before rolling the API below P1C, run the runbook query in `docs/runbooks/reviewer-invite.md` ("Before a rollback below P1C"): a pre-P1C `ApprovalRule` ignores a `dismiss` row, so a counted dismissal must first be followed by a fresh approval or report.
```

In `docs/artifacts/2026-10-12-data-model.html`:

1. Replace `<span>Migrations V1–V6 (V1–V5 live on drugdb.eliooo.org; V6 goes live with the P0 release)</span>` with `<span>Migrations V1–V7 (V7, db-schema-v1.2, goes live with the P1C release)</span>`.
2. After `<li><code>audit_event</code> <span>0</span></li>` add `<li><code>pair_review</code> <span>0</span></li>`.
3. In the `erDiagram`, after the line `  audit_event }o..o| batch_item : "target_type, target_id"`, add `  pair_review }o--|| ddinter_pair : "append-only senior pair decisions"`; in `review_decision {`, change `text decision "ok | issue"` to `text decision "ok | issue | dismiss"` and `text reviewer_role "pharmacist | engineer"` to `text reviewer_role "pharmacist | engineer | senior"`; in `audit_event {`, change `text event "sign_in decision decision_rejected ..."` to `text event "sign_in decision pair_decision senior_open ..."` and `text actor_role "pharmacist | engineer | user"` to `text actor_role "pharmacist | engineer | senior | user"`; after the closing `}` of `audit_event` add:

```
  pair_review {
    bigint id PK
    text ddinter_a FK
    text ddinter_b FK
    text decision "reviewed | issue"
    text note "issue: 5 to 1000 chars"
    text content_hash "sha256 of the pair content"
    jsonb content "severity, actions, texts as reviewed"
    text reviewer_email "never public"
    text reviewer_role "senior"
    timestamptz decided_at
  }
```

4. After the rule `<div class="rule"><h3>Snapshots and the audit trail are append-only</h3>…</div>` add:

```html
      <div class="rule"><h3>Pair reviews are append-only and keep what they reviewed</h3><p>A senior pharmacist's pair decision stores the pair's content and its hash, so the API can tell when DDInter changed a reviewed pair. Triggers reject UPDATE, DELETE and TRUNCATE on <code>pair_review</code>.</p><span class="where">pair_review, ops.reject_change() triggers</span></div>
```

5. After the table row `<tr><td class="t">audit_event</td>…</tr>` add:

```html
          <tr><td class="t">pair_review</td><td class="mono">id</td><td>Senior pharmacists' pair decisions (reviewed or issue) with the content reviewed. Append-only.</td><td class="n">0</td></tr>
```

6. In the footer, replace `Generated from <code>db/migrations/V1–V6</code>` with `Generated from <code>db/migrations/V1–V7</code>`.

- [ ] **Step 11: Commit**

```bash
git add db/migrations/V7__senior_review.sql db/migrations.lock docs/design/database.md docs/artifacts/2026-10-12-data-model.html \
  api/src/main/java/com/niramoy/bddrug/application/AuditService.java \
  api/src/test/java/com/niramoy/bddrug/V7MigrationIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/AuditAppendOnlyIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/AuditApiIntegrationTest.java
git commit -m "feat(db): V7 senior review (db-schema-v1.2): dismiss, senior role, ops.pair_review, new audit events" \
  -m "Spec §7.8 verbatim; AuditService accepts senior_open, the senior role and the substance and pair_queue targets (§7.5)." \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

The tag `db-schema-v1.2` is created on the merge commit in Task 26, as `db-schema-v1.1` was for P0.

---
### Task 2: Approval rule — senior approves, a dismissal is a review boundary, a carried approval counts at the stamp

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java`, `api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ApprovalRuleTest.java`, `api/src/test/java/com/niramoy/bddrug/DecisionGuardTest.java`

**Interfaces:**
- Consumes: `ReviewDecision(long id, String decision, String note, String reviewerEmail, String reviewerRole, Instant decidedAt)`.
- Produces: `ApprovalRule.SENIOR = "senior"`, `ApprovalRule.DISMISS = "dismiss"`, `ApprovalRule.actsAsPharmacist(String role)`, `ApprovalRule.review(List<ReviewDecision>, Instant extractedAt, boolean carried)` (the two-argument form delegates with `carried = false`), `ApprovalRule.displayStatus(List<ReviewDecision>, Instant, String review)` (now applies the dismissal boundary), `ApprovalRule.openIssues(List<ReviewDecision>, Instant)` (counted issues after the latest counted dismiss, oldest first). `DecisionGuard.NO_ISSUE = "No issue is open on this record"`; `DecisionGuard.check` refuses a `dismiss` whose `displayStatus` is not `issue` with `Refusal("review", NO_ISSUE)` after steps 2–4, and never applies steps 5–8 to it.

- [ ] **Step 1: Write the failing tests**

Append to `api/src/test/java/com/niramoy/bddrug/ApprovalRuleTest.java`, before the final `}`:

```java
    // ---- P1C: the senior role, dismissals (§5.2, D57) and carried approvals (§8.3.1 item 8)

    @Test void aSeniorOkApproves() {
        assertThat(ApprovalRule.review(List.of(d("ok", "senior", 1)), RUN)).contains("ok");
        assertThat(ApprovalRule.review(List.of(d("ok", "senior", 1), d("issue", "engineer", 2)), RUN)).contains("issue");
        assertThat(ApprovalRule.actsAsPharmacist("senior")).isTrue();
        assertThat(ApprovalRule.actsAsPharmacist("pharmacist")).isTrue();
        assertThat(ApprovalRule.actsAsPharmacist("engineer")).isFalse();
    }

    @Test void aCarriedApprovalWithNoLaterDecisionApprovesAndAnIssueAfterItIsAnIssue() {
        assertThat(ApprovalRule.review(List.of(), RUN, true)).contains("ok");
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1)), RUN, true)).contains("issue");
        // an engineer's check after a carried approval leaves it approved
        assertThat(ApprovalRule.review(List.of(d("ok", "engineer", 1)), RUN, true)).contains("ok");
        // a decision before the stamp is not the carried approval
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", -1)), RUN, true)).contains("ok");
    }

    @Test void aDismissalAfterAnIssueIsPendingEvenWhenAPharmacistApprovedBeforeTheIssue() {
        List<ReviewDecision> ds = List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2), d("dismiss", "senior", 3));
        assertThat(ApprovalRule.review(ds, RUN)).contains("pending");
        assertThat(ApprovalRule.displayStatus(ds, RUN, "pending")).isEqualTo("pending");
    }

    @Test void reviewIsPendingNeverEmptyWhenTheNewestDecisionIsADismissal() {
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2)), RUN)).contains("pending");
    }

    @Test void decisionsAtOrBeforeADismissalDoNotCount() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2), d("ok", "engineer", 3));
        assertThat(ApprovalRule.review(ds, RUN)).contains("pending");
        assertThat(ApprovalRule.displayStatus(ds, RUN, "pending")).isEqualTo("engineer_checked");
        // a senior approves again after the dismissal
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2), d("ok", "senior", 3)), RUN))
            .contains("ok");
    }

    @Test void aNewIssueAfterADismissalIsAnIssue() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2), d("issue", "engineer", 3));
        assertThat(ApprovalRule.review(ds, RUN)).contains("issue");
        assertThat(ApprovalRule.displayStatus(ds, RUN, "issue")).isEqualTo("issue");
    }

    @Test void aDismissalNeverShowsBackInReview() {
        // approved before the latest run, then an issue and its dismissal after it
        List<ReviewDecision> ds = List.of(d("ok", "pharmacist", -5), d("issue", "pharmacist", 1), d("dismiss", "senior", 2));
        assertThat(ApprovalRule.displayStatus(ds, RUN, "pending")).isEqualTo("pending");
    }

    @Test void aDismissalUndoesACarriedApprovalToo() {
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2)), RUN, true)).contains("pending");
    }

    @Test void aDismissalBeforeTheRunStampIsForgottenLikeAnyDecision() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", -9), d("dismiss", "senior", -8), d("issue", "engineer", 1));
        assertThat(ApprovalRule.review(ds, RUN)).contains("issue");
    }

    @Test void openIssuesAreTheCountedIssuesAfterTheLatestDismissal() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", -3), d("issue", "engineer", 1), d("dismiss", "senior", 2),
            d("issue", "senior", 3), d("issue", "pharmacist", 4));
        assertThat(ApprovalRule.openIssues(ds, RUN)).extracting(ReviewDecision::reviewerRole).containsExactly("senior", "pharmacist");
        assertThat(ApprovalRule.openIssues(List.of(d("issue", "engineer", 1)), RUN)).hasSize(1);
        assertThat(ApprovalRule.openIssues(List.of(d("issue", "engineer", 1), d("dismiss", "senior", 2)), RUN)).isEmpty();
    }
```

Append to `api/src/test/java/com/niramoy/bddrug/DecisionGuardTest.java`, before the final `}`:

```java
    // ---- P1C step 6d: a dismissal needs an open reviewer issue; steps 5-8 never apply to it (§7.2)

    static Attempt dismiss() { return new Attempt("dismiss", "senior", RUN, 7L); }

    @Test void aDismissalOfAnOpenIssuePassesEvenWithAFailedCheck() {
        Map<String, String> failed = new HashMap<>(ALL_RAN);
        failed.put("dgda", "fail");
        assertThat(DecisionGuard.check(item("issue", null, ALL_RAN, "issue"), dismiss())).isEmpty();
        assertThat(DecisionGuard.check(item("issue", null, failed, "issue"), dismiss())).isEmpty();
    }

    @Test void aDismissalWithoutAnOpenReviewerIssueIsRefusedOnReview() {
        assertThat(DecisionGuard.check(pending(), dismiss())).isEqualTo(refused("review", DecisionGuard.NO_ISSUE));
        assertThat(DecisionGuard.check(item("ok", null, ALL_RAN, "approved"), dismiss())).isEqualTo(refused("review", DecisionGuard.NO_ISSUE));
        // the pipeline's own issue ("not found at source") has display status pending: only a re-run clears it
        assertThat(DecisionGuard.check(item("issue", "not found at source", Map.of("dgda", "fail"), "pending"), dismiss()))
            .isEqualTo(refused("review", DecisionGuard.NO_ISSUE));
    }

    @Test void aDismissalStillMeetsStepsTwoToFourFirst() {
        assertThat(DecisionGuard.check(item("issue", null, ALL_RAN, "issue"), new Attempt("dismiss", "senior", RUN.minusSeconds(1), 7L)))
            .isEqualTo(refused("extractedAt", DecisionGuard.STALE_RUN));
        assertThat(DecisionGuard.check(item("issue", null, ALL_RAN, "issue"), new Attempt("dismiss", "senior", RUN, 6L)))
            .isEqualTo(refused("lastDecisionId", DecisionGuard.OTHER_REVIEWER));
        assertThat(DecisionGuard.check(item("issue", "removed from batch file", ALL_RAN, "issue"), dismiss()))
            .isEqualTo(refused("conceptId", DecisionGuard.REMOVED));
    }

    @Test void aSeniorOkMeetsThePharmacistGuards() {
        assertThat(DecisionGuard.check(pending(), ok("senior"))).isEmpty();
        assertThat(DecisionGuard.check(item("ok", null, ALL_RAN, "approved"), ok("senior")))
            .isEqualTo(refused("review", DecisionGuard.ALREADY_APPROVED));
        // step 8 stays engineer-only
        assertThat(DecisionGuard.check(item("pending", null, ALL_RAN, "engineer_checked"), ok("senior"))).isEmpty();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests ApprovalRuleTest --tests DecisionGuardTest`
Expected: FAIL to compile: `cannot find symbol` for `ApprovalRule.review(List, Instant, boolean)`, `ApprovalRule.actsAsPharmacist`, `ApprovalRule.openIssues` and `DecisionGuard.NO_ISSUE`.

- [ ] **Step 3: Implement the rule**

Replace `api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java` with:

```java
package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * The approval rule for one batch record. Only decisions made after the record's latest pipeline run
 * ({@code extracted_at}) count, and only those after the latest dismissal made since that run (spec §5.2, D57): a
 * dismissal is a review boundary like a re-run stamp. Older decisions stay in the history but decide nothing.
 * <ul>
 *   <li>{@code issue} when the latest counted decision is an issue;</li>
 *   <li>{@code ok} when a pharmacist or senior pharmacist recorded ok and no issue came after that ok (a carried approval,
 *       §8.3.1 item 8, counts as such an ok at the stamp, unless a dismissal came since);</li>
 *   <li>{@code pending} otherwise (an engineer's ok alone never approves), and whenever the newest decision since the
 *       stamp is a dismissal.</li>
 * </ul>
 * No counted decision, no dismissal and no carried approval gives empty: the pipeline's own value stays.
 * {@link #displayStatus} is the five-state status reviewers see (spec §5.2), computed once, here.
 */
public final class ApprovalRule {
    private ApprovalRule() {}
    public static final String OK = "ok", ISSUE = "issue", PENDING = "pending", PHARMACIST = "pharmacist", ENGINEER = "engineer";
    public static final String SENIOR = "senior", DISMISS = "dismiss";
    public static final String APPROVED = "approved", ENGINEER_CHECKED = "engineer_checked", BACK_IN_REVIEW = "back_in_review";

    private static final Comparator<ReviewDecision> CHRONOLOGICAL =
        Comparator.comparing(ReviewDecision::decidedAt).thenComparingLong(ReviewDecision::id);

    /** The one test for pharmacist powers (§5.13): a senior pharmacist is a pharmacist. */
    public static boolean actsAsPharmacist(String role) {
        return PHARMACIST.equals(role) || SENIOR.equals(role);
    }

    /** A decision counts when it was made after the latest run; without a run stamp every decision counts. */
    private static boolean counts(ReviewDecision d, Instant extractedAt) {
        return extractedAt == null || d.decidedAt().isAfter(extractedAt);
    }

    /** The decisions since the run stamp, oldest first (time, then id). */
    private static List<ReviewDecision> sinceStamp(List<ReviewDecision> decisions, Instant extractedAt) {
        return decisions.stream().filter(d -> counts(d, extractedAt)).sorted(CHRONOLOGICAL).toList();
    }

    private static int lastDismissal(List<ReviewDecision> since) {
        for (int i = since.size() - 1; i >= 0; i--) if (DISMISS.equals(since.get(i).decision())) return i;
        return -1;
    }

    /** The counted decisions: those since the stamp and after its latest dismissal, oldest first. */
    private static List<ReviewDecision> counted(List<ReviewDecision> decisions, Instant extractedAt) {
        List<ReviewDecision> since = sinceStamp(decisions, extractedAt);
        int last = lastDismissal(since);
        return last < 0 ? since : since.subList(last + 1, since.size());
    }

    public static Optional<String> review(List<ReviewDecision> decisions, Instant extractedAt) {
        return review(decisions, extractedAt, false);
    }

    /** {@code carried}: the item's stamp carried an approval from another batch (§8.3.1 item 8). */
    public static Optional<String> review(List<ReviewDecision> decisions, Instant extractedAt, boolean carried) {
        boolean dismissed = lastDismissal(sinceStamp(decisions, extractedAt)) >= 0;
        List<ReviewDecision> counted = counted(decisions, extractedAt);
        boolean carriedCounts = carried && !dismissed;
        if (counted.isEmpty())
            return dismissed ? Optional.of(PENDING) : carriedCounts ? Optional.of(OK) : Optional.empty();
        if (ISSUE.equals(counted.get(counted.size() - 1).decision())) return Optional.of(ISSUE);
        int lastApproval = carriedCounts ? 0 : -1;   // 1-based position in counted; 0 is the carried approval at the stamp
        for (int i = 0; i < counted.size(); i++)
            if (OK.equals(counted.get(i).decision()) && actsAsPharmacist(counted.get(i).reviewerRole())) lastApproval = i + 1;
        if (lastApproval < 0) return Optional.of(PENDING);
        for (int i = lastApproval; i < counted.size(); i++)
            if (ISSUE.equals(counted.get(i).decision())) return Optional.of(PENDING);
        return Optional.of(OK);
    }

    /**
     * Spec §5.2, in this order of precedence. {@code review} is the item's stored {@code batch_item.review}. "Counted"
     * means decided after max(the run stamp, the latest dismissal since it).
     * <ol>
     *   <li>{@code issue}: review is issue and the counted decisions contain an issue (the pipeline's own issue,
     *       "not found at source", has none and falls through to pending);</li>
     *   <li>{@code approved}: review is ok;</li>
     *   <li>{@code engineer_checked}: review is pending and a counted engineer ok has no issue after it;</li>
     *   <li>{@code back_in_review}: review is pending, nothing counted, no dismissal since the stamp, and the decisions
     *       at or before the run stamp had approved it;</li>
     *   <li>{@code pending}: everything else.</li>
     * </ol>
     */
    public static String displayStatus(List<ReviewDecision> decisions, Instant extractedAt, String review) {
        List<ReviewDecision> counted = counted(decisions, extractedAt);
        boolean dismissed = lastDismissal(sinceStamp(decisions, extractedAt)) >= 0;
        if (ISSUE.equals(review) && counted.stream().anyMatch(d -> ISSUE.equals(d.decision()))) return ISSUE;
        if (OK.equals(review)) return APPROVED;
        if (PENDING.equals(review)) {
            int lastIssue = -1;
            for (int i = 0; i < counted.size(); i++) if (ISSUE.equals(counted.get(i).decision())) lastIssue = i;
            for (int i = lastIssue + 1; i < counted.size(); i++)
                if (OK.equals(counted.get(i).decision()) && ENGINEER.equals(counted.get(i).reviewerRole())) return ENGINEER_CHECKED;
            if (counted.isEmpty() && extractedAt != null && !dismissed) {
                List<ReviewDecision> before = decisions.stream().filter(d -> !counts(d, extractedAt)).toList();
                if (review(before, null).filter(OK::equals).isPresent()) return BACK_IN_REVIEW;
            }
        }
        return PENDING;
    }

    /** §7.3 {@code openIssues}: the counted issue decisions (after the latest dismissal since the stamp), oldest first. */
    public static List<ReviewDecision> openIssues(List<ReviewDecision> decisions, Instant extractedAt) {
        return counted(decisions, extractedAt).stream().filter(d -> ISSUE.equals(d.decision())).toList();
    }
}
```

In `api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java`:

1. After the constant `ALREADY_CHECKED`, add:

```java
    /** §7.2 step 6d: a dismissal needs a counted reviewer issue (display status issue). */
    public static final String NO_ISSUE = "No issue is open on this record";
```

2. In the class Javadoc, after the sentence ending `even one whose checks failed.`, add: ` A {@code dismiss} passes steps 2–4 like any decision, then step 6d only: the display status must be {@code issue}.`

3. In `check`, replace the line

```java
        if (!ApprovalRule.OK.equals(a.decision())) return Optional.empty();
```

with

```java
        if (ApprovalRule.DISMISS.equals(a.decision()))
            return ApprovalRule.ISSUE.equals(item.displayStatus()) ? Optional.empty() : refuse("review", NO_ISSUE);
        if (!ApprovalRule.OK.equals(a.decision())) return Optional.empty();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests ApprovalRuleTest --tests DecisionGuardTest`
Expected: PASS (every existing test unchanged, plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java \
  api/src/test/java/com/niramoy/bddrug/ApprovalRuleTest.java api/src/test/java/com/niramoy/bddrug/DecisionGuardTest.java
git commit -m "feat(api): approval rule: a senior approves, a dismissal is a review boundary, a carried approval counts (§5.2, §8.3.1)" \
  -m "DecisionGuard step 6d: a dismiss needs a counted reviewer issue; steps 5-8 never apply to it (§7.2)." \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Decision endpoint — `senior` and `dismiss` (§7.2)

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ReviewService.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java`
- Create: `api/src/test/java/com/niramoy/bddrug/ReviewDismissApiIntegrationTest.java`

**Interfaces:**
- Consumes: Task 2's `ApprovalRule.review(…, carried)` and `DecisionGuard` step 6d; Task 1's V7 checks.
- Produces: `POST /v1/batches/{b}/items/{c}/decisions` accepts `reviewerRole: "senior"` and `decision: "dismiss"`; a dismiss from another role is 400 `field=reviewerRole` ("Only a senior pharmacist can dismiss an issue"); a dismiss note under 5 characters is 400 `field=note`; no open issue is 409 `field=review` ("No issue is open on this record"); a saved dismiss sets the item's `review` to `pending`, writes one `decision` audit row with `outcome='dismiss'`, `actor_role='senior'`, and answers the usual `Outcome`. `recomputeItem` passes `carried` (the item's snapshot at its stamp has `carried_from`) to `ApprovalRule.review`. `ReviewService.ROLES = {pharmacist, engineer, senior}`, `ReviewService.DECISIONS = {ok, issue, dismiss}`.

- [ ] **Step 1: Write the failing integration test**

Create `api/src/test/java/com/niramoy/bddrug/ReviewDismissApiIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
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

/** §7.2 P1C: the senior role and the dismiss decision (§5.10a, D57), §11.3 "ReviewApiIntegrationTest (dismiss)". */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ReviewDismissApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org", PHARMACIST = "pharma.reviewer@example.org";
    static final String NOTE = "The strength matches the register; the report misread it";

    /** Each test owns its batch. X-* items carry an open reviewer issue reported after the stamp. */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at)
            SELECT b, 1, now() - interval '1 hour' FROM unnest(ARRAY['X-ok','X-role','X-note','X-pend','X-appr','X-pipe',
              'X-rm','X-stale','X-other','X-replay','X-again','X-rej']) AS b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('X-ok','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-role','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-note','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-pend','DGDA-Drugs','W-1','pending',NULL, now() - interval '1 hour'),
             ('X-appr','DGDA-Drugs','A-1','ok',NULL, now() - interval '1 hour'),
             ('X-pipe','DGDA-Drugs','typo-id','issue','not found at source', now() - interval '1 hour'),
             ('X-rm','DGDA-Drugs','gone-id','issue','removed from batch file', now() - interval '1 hour'),
             ('X-stale','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-other','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-replay','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-again','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-rej','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at)
            SELECT b, c, 'issue', 'strength should read 10 mg', 'eng.reviewer@example.org', 'engineer', now() - interval '30 minute'
              FROM (VALUES ('X-ok','W-1'), ('X-role','W-1'), ('X-note','W-1'), ('X-rm','gone-id'), ('X-stale','W-1'),
                           ('X-other','W-1'), ('X-replay','W-1'), ('X-again','W-1'), ('X-rej','W-1')) AS v(b, c);
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('X-appr','A-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '30 minute'),
             ('X-ok','W-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '40 minute');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '' FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical'), ('ddinter')) AS s(stage)
            WHERE bi.note IS NULL AND bi.batch_id LIKE 'X-%';
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
             ('X-pipe','typo-id','dgda','fail','not found at source');
            """);
    }

    @Autowired WebTestClient web;

    private record Shown(String extractedAt, Long lastDecisionId) {}

    /** The version the reviewer's page shows, read from the token-gated batch read (as ReviewApiIntegrationTest does). */
    private Shown shown(String batch, String concept) {
        var res = internal(web).get().uri("/v1/batches/{b}", batch).exchange().expectBody().returnResult();
        String json = new String(res.getResponseBody(), StandardCharsets.UTF_8);
        String filter = "$.data.items[?(@.conceptId == '" + concept + "')].";
        List<String> stamps = JsonPath.read(json, filter + "extractedAt");
        List<Number> ids = JsonPath.read(json, filter + "lastDecisionId");
        return new Shown(stamps.isEmpty() ? null : stamps.get(0), ids.isEmpty() || ids.get(0) == null ? null : ids.get(0).longValue());
    }

    private static Map<String, Object> body(String decision, String note, String email, String role) {
        Map<String, Object> m = new HashMap<>();
        m.put("decision", decision);
        m.put("note", note);
        m.put("reviewerEmail", email);
        m.put("reviewerRole", role);
        return m;
    }

    private WebTestClient.ResponseSpec decide(String batch, String concept, Map<String, Object> body) {
        Shown s = shown(batch, concept);
        body.putIfAbsent("extractedAt", s.extractedAt());
        body.putIfAbsent("expectedLastDecisionId", s.lastDecisionId());
        body.putIfAbsent("requestId", UUID.randomUUID().toString());
        return internal(web).post().uri("/v1/batches/{b}/items/{c}/decisions", batch, concept)
            .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private String review(String batch, String concept) throws Exception {
        return text(pg, "SELECT review FROM ops.batch_item WHERE batch_id = '" + batch + "' AND concept_id = '" + concept + "'");
    }

    @Test void aSeniorDismissesAnOpenIssueAndTheRecordIsPendingNotApproved() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> b = body("dismiss", NOTE, SENIOR, "senior");
        b.put("requestId", rid);
        decide("X-ok", "W-1", b).expectStatus().isCreated().expectBody()
            .jsonPath("$.data.review").isEqualTo("pending")
            .jsonPath("$.data.displayStatus").isEqualTo("pending")
            .jsonPath("$.data.replayed").isEqualTo(false)
            .jsonPath("$.data.version.lastDecisionId").isNumber();
        assertThat(review("X-ok", "W-1")).isEqualTo("pending");   // the pharmacist's ok before the issue does not come back
        assertThat(text(pg, "SELECT decision || '|' || reviewer_role || '|' || note FROM ops.review_decision " +
            "WHERE batch_id = 'X-ok' ORDER BY id DESC LIMIT 1")).isEqualTo("dismiss|senior|" + NOTE);
        assertThat(text(pg, "SELECT outcome || '|' || actor_role || '|' || target_id FROM ops.audit_event " +
            "WHERE event = 'decision' AND request_id = '" + rid + "'")).isEqualTo("dismiss|senior|X-ok/W-1");
    }

    @Test void onlyASeniorMayDismiss() throws Exception {
        for (String role : List.of("pharmacist", "engineer"))
            decide("X-role", "W-1", body("dismiss", NOTE, PHARMACIST, role)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
                .jsonPath("$.errors[0].field").isEqualTo("reviewerRole")
                .jsonPath("$.errors[0].message").isEqualTo("Only a senior pharmacist can dismiss an issue");
        assertThat(review("X-role", "W-1")).isEqualTo("issue");
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision_rejected' AND target_id = 'X-role/W-1'"))
            .isEqualTo(2);
    }

    @Test void aDismissalNeedsFiveCharactersCountedInCodePoints() {
        decide("X-note", "W-1", body("dismiss", "abcd", SENIOR, "senior")).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("note");
        decide("X-note", "W-1", body("dismiss", "😀😀😀😀", SENIOR, "senior")).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("note");
        decide("X-note", "W-1", body("dismiss", "ভুল রিপোর্ট", SENIOR, "senior")).expectStatus().isCreated();
    }

    @Test void noOpenReviewerIssueIs409Review() throws Exception {
        for (String[] t : new String[][]{{"X-pend", "W-1"}, {"X-appr", "A-1"}, {"X-pipe", "typo-id"}})
            decide(t[0], t[1], body("dismiss", NOTE, SENIOR, "senior")).expectStatus().isEqualTo(409).expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("review")
                .jsonPath("$.errors[0].message").isEqualTo("No issue is open on this record");
        assertThat(review("X-appr", "A-1")).isEqualTo("ok");
        assertThat(review("X-pipe", "typo-id")).isEqualTo("issue");
    }

    @Test void aRemovedRecordIs409ConceptId() {
        decide("X-rm", "gone-id", body("dismiss", NOTE, SENIOR, "senior")).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("conceptId");
    }

    @Test void aStalePageIs409OnTheVersionFields() {
        Map<String, Object> b = body("dismiss", NOTE, SENIOR, "senior");
        b.put("extractedAt", "2020-01-01T00:00:00Z");
        decide("X-stale", "W-1", b).expectStatus().isEqualTo(409).expectBody().jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        Map<String, Object> o = body("dismiss", NOTE, SENIOR, "senior");
        o.put("expectedLastDecisionId", 1);
        decide("X-other", "W-1", o).expectStatus().isEqualTo(409).expectBody().jsonPath("$.errors[0].field").isEqualTo("lastDecisionId");
    }

    @Test void aRepeatedRequestIdIsAReplayWithOneRow() throws Exception {
        Map<String, Object> b = body("dismiss", NOTE, SENIOR, "senior");
        b.put("requestId", UUID.randomUUID().toString());
        Shown s = shown("X-replay", "W-1");
        b.put("extractedAt", s.extractedAt());
        b.put("expectedLastDecisionId", s.lastDecisionId());
        decide("X-replay", "W-1", new HashMap<>(b)).expectStatus().isCreated();
        decide("X-replay", "W-1", new HashMap<>(b)).expectStatus().isOk().expectBody().jsonPath("$.data.replayed").isEqualTo(true);
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE batch_id = 'X-replay' AND decision = 'dismiss'")).isEqualTo(1);
        // the same requestId for another decision is refused
        Map<String, Object> other = new HashMap<>(b);
        other.put("decision", "issue");
        decide("X-replay", "W-1", other).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
    }

    @Test void afterADismissalASeniorApprovesWithA() throws Exception {
        decide("X-again", "W-1", body("dismiss", NOTE, SENIOR, "senior")).expectStatus().isCreated();
        decide("X-again", "W-1", body("ok", "", SENIOR, "senior")).expectStatus().isCreated().expectBody()
            .jsonPath("$.data.review").isEqualTo("ok").jsonPath("$.data.displayStatus").isEqualTo("approved")
            .jsonPath("$.data.batchStatus").isEqualTo("approved");
        assertThat(review("X-again", "W-1")).isEqualTo("ok");
    }

    @Test void aRefusedDismissalLeavesExactlyOneRejectedRow() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> b = body("dismiss", "abc", SENIOR, "senior");
        b.put("requestId", rid);
        decide("X-rej", "W-1", b).expectStatus().isBadRequest();
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision_rejected' AND request_id = '" + rid + "'"))
            .isEqualTo(1);
        assertThat(text(pg, "SELECT actor_role FROM ops.audit_event WHERE request_id = '" + rid + "'")).isEqualTo("senior");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests ReviewDismissApiIntegrationTest`
Expected: FAIL. Every dismiss answers 400 `field=decision` ("decision must be one of issue, ok"), and the senior `ok` answers 400 `field=reviewerRole`.

- [ ] **Step 3: Accept the role and the decision**

In `api/src/main/java/com/niramoy/bddrug/application/ReviewService.java`:

1. Replace the constants line with:

```java
    public static final Set<String> DECISIONS = Set.of("ok", "issue", "dismiss"), ROLES = Set.of("pharmacist", "engineer", "senior");
```

2. Replace the first five lines of `validate` (from `String decision = …` to `String role = …`) with:

```java
        String decision = Validate.oneOf(r.decision(), DECISIONS, "decision");
        boolean needsNote = "issue".equals(decision) || "dismiss".equals(decision);
        String note = Validate.text(r.note(), needsNote ? ISSUE_NOTE_MIN : 0, NOTE_MAX, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        String role = Validate.oneOf(r.reviewerRole(), ROLES, "reviewerRole");
        if ("dismiss".equals(decision) && !"senior".equals(role))
            throw new InvalidQueryException("reviewerRole", "Only a senior pharmacist can dismiss an issue");
```

3. Change the class Javadoc to: `/** Review decisions (§7.2): validated here (a dismiss is a senior's, with a 5–1000 character note), guarded, appended and applied by the port; every 400 and 409 is audited. */`

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java`:

1. Add the import `import java.time.ZoneOffset;`.
2. Replace `recomputeItem` with:

```java
    /**
     * Applies the approval rule; with no decision since the latest run (and no dismissal or carried approval) the pipeline's
     * value stays. A dismissal sets pending (§5.2); a carried approval (§8.3.1 item 8) counts as an ok at the stamp.
     */
    private Mono<Void> recomputeItem(String batchId, String conceptId, Instant extractedAt) {
        return Mono.zip(decisions(batchId, conceptId, false), carried(batchId, conceptId, extractedAt))
            .flatMap(t -> ApprovalRule.review(t.getT1(), extractedAt, t.getT2())
                .map(review -> db.sql("UPDATE ops.batch_item SET review = :r WHERE batch_id = :b AND concept_id = :c")
                    .bind("r", review).bind("b", batchId).bind("c", conceptId).fetch().rowsUpdated().then())
                .orElse(Mono.empty()));
    }

    /** True when the snapshot at the item's stamp carried an approval from another batch (payload key carried_from). */
    private Mono<Boolean> carried(String batchId, String conceptId, Instant extractedAt) {
        if (extractedAt == null) return Mono.just(false);
        return db.sql("""
                SELECT EXISTS (SELECT 1 FROM ops.item_snapshot WHERE batch_id = :b AND concept_id = :c AND extracted_at = :t
                               AND payload -> 'carried_from' IS NOT NULL) AS carried""")
            .bind("b", batchId).bind("c", conceptId).bind("t", extractedAt.atOffset(ZoneOffset.UTC))
            .map(r -> Boolean.TRUE.equals(r.get("carried", Boolean.class))).one();
    }
```

The `decision` audit row already records `outcome = d.decision()` and `actor_role = d.reviewerRole()`, so a dismissal is written as `dismiss` / `senior` with no further change; `recordRejection` keeps the role because `ReviewService.rejection` checks it against `ROLES`, which now holds `senior`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests ReviewDismissApiIntegrationTest --tests ReviewApiIntegrationTest`
Expected: PASS (the P0 decision tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/application/ReviewService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewAdapter.java \
  api/src/test/java/com/niramoy/bddrug/ReviewDismissApiIntegrationTest.java
git commit -m "feat(api): decisions accept the senior role and dismiss: senior only, 5-1000 note, 409 no open issue (§7.2)" \
  -m "recomputeItem passes a carried approval (snapshot carried_from at the stamp) to ApprovalRule.review (§8.3.1 item 8)." \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: `SourceLinks` — one place that builds a source URL (§5.6.6)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/SourceLinks.java`, `api/src/test/java/com/niramoy/bddrug/SourceLinksTest.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java` (`sourceUrl` delegates)

**Interfaces:**
- Produces: `SourceLinks.Source(String url, String label, Instant fetchedAt)`; `SourceLinks.code(String system, String code, Instant fetchedAt) → Optional<Source>` for `RXCUI`, `ATC`, `DRUGBANK`, `SNOMEDCT`, `ICD11_XM`, `DDINTER` (empty for any other system or a code that fails its pattern); `SourceLinks.brand(String conceptId, Instant fetchedAt) → Source` ("DGDA register (OCL)"); `SourceLinks.pair(String interactionId) → Optional<Source>` ("Full record in DDInter 2.0", `fetchedAt` null); `SourceLinks.oclUrl(String conceptId)` (the existing encoder, moved). `ReviewQueryService.sourceUrl(conceptId)` returns `SourceLinks.oclUrl(conceptId)`.

- [ ] **Step 1: Write the failing test**

Create `api/src/test/java/com/niramoy/bddrug/SourceLinksTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.application.ReviewQueryService;
import com.niramoy.bddrug.domain.SourceLinks;
import com.niramoy.bddrug.domain.SourceLinks.Source;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.time.Instant;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.6.6, every pattern with the pilot codes (§11.3 SourceLinksTest). No test ever calls the sites. */
class SourceLinksTest {
    static final Instant AT = Instant.parse("2026-10-12T21:40:00Z");

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "RXCUI|161|https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=161|RxNav",
        "ATC|N02BE01|https://atcddd.fhi.no/atc_ddd_index/?code=N02BE01&showdescription=no|WHO ATC/DDD Index",
        "ATC|B01AA03|https://atcddd.fhi.no/atc_ddd_index/?code=B01AA03&showdescription=no|WHO ATC/DDD Index",
        "ATC|N02|https://atcddd.fhi.no/atc_ddd_index/?code=N02&showdescription=no|WHO ATC/DDD Index",
        "DRUGBANK|DB00316|https://go.drugbank.com/drugs/DB00316|DrugBank",
        "SNOMEDCT|387517004|https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm=387517004|RxNav (SNOMED CT search)",
        "ICD11_XM|XM5DJ7|https://icd.who.int/browse/latest-release/mms/en|Search ICD-11 for XM5DJ7",
        "DDINTER|DDInter14|https://ddinter2.scbdd.com/server/drug-detail/DDInter14/|DDInter 2.0",
        "DDINTER|DDInter352|https://ddinter2.scbdd.com/server/drug-detail/DDInter352/|DDInter 2.0",
    })
    void everyPatternLinksThePageTheSpecNames(String system, String code, String url, String label) {
        assertThat(SourceLinks.code(system, code, AT)).contains(new Source(url, label, AT));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "RXCUI|161 ", "RXCUI|12345678901", "RXCUI|16a", "ATC|n02be01", "ATC|N02BE0", "DRUGBANK|DB0031", "DRUGBANK|db00316",
        "SNOMEDCT|12345", "ICD11_XM|XM5DJ", "ICD11_XM|xm5dj7", "DDINTER|DDINTER14", "DDINTER|DDInter1234567", "DDINTER|DDInter14/../x",
        "LOINC|1234-5",
    })
    void aCodeThatFailsItsPatternGetsNoLink(String system, String code) {
        assertThat(SourceLinks.code(system, code, AT)).isEmpty();
        assertThat(SourceLinks.code(system, null, AT)).isEmpty();
    }

    @Test void thePairLinkNeedsANumericInteractionIdAndHasNoFetchTime() {
        assertThat(SourceLinks.pair("3039")).contains(new Source("https://ddinter2.scbdd.com/server/interact/3039/",
            "Full record in DDInter 2.0", null));
        assertThat(SourceLinks.pair(null)).isEmpty();
        assertThat(SourceLinks.pair("IA-1")).isEmpty();
        assertThat(SourceLinks.pair("1234567890")).isEmpty();
    }

    @Test void theBrandLinkIsTheOclConceptEncodedAsEncodeUriComponentDoes() {
        assertThat(SourceLinks.brand("186-0030-006--napa", AT)).isEqualTo(new Source(
            "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/", "DGDA register (OCL)", AT));
        assertThat(SourceLinks.oclUrl("a b(c)~!'")).endsWith("/concepts/a%20b(c)~!'/");
        assertThat(SourceLinks.oclUrl("x/y?z")).endsWith("/concepts/x%2Fy%3Fz/");
        assertThat(ReviewQueryService.sourceUrl("x/y?z")).isEqualTo(SourceLinks.oclUrl("x/y?z"));
        assertThat(SourceLinks.brand("W-1", null).fetchedAt()).isNull();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests SourceLinksTest`
Expected: FAIL to compile (`package com.niramoy.bddrug.domain.SourceLinks does not exist`).

- [ ] **Step 3: Write `SourceLinks`**

Create `api/src/main/java/com/niramoy/bddrug/domain/SourceLinks.java`:

```java
package com.niramoy.bddrug.domain;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Spec §5.6.6: the only place a source URL is built. A code is checked against its system's pattern first; a code that
 * fails gets no link (it is still shown). {@code fetchedAt} is the stored fetch time, or null when none is stored
 * ("fetched on" is never shown without one). Nothing here calls a site: CI asserts the hrefs only.
 */
public final class SourceLinks {
    private SourceLinks() {}

    public record Source(String url, String label, Instant fetchedAt) {}

    public static final String OCL_CONCEPT = "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/";
    static final String ICD11_HOME = "https://icd.who.int/browse/latest-release/mms/en";

    private record Rule(Pattern pattern, String url, String label) {}

    private static final Map<String, Rule> RULES = Map.of(
        "RXCUI", new Rule(Pattern.compile("^[0-9]{1,10}$"),
            "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm={c}", "RxNav"),
        "ATC", new Rule(Pattern.compile("^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$"),
            "https://atcddd.fhi.no/atc_ddd_index/?code={c}&showdescription=no", "WHO ATC/DDD Index"),
        "DRUGBANK", new Rule(Pattern.compile("^DB[0-9]{5}$"), "https://go.drugbank.com/drugs/{c}", "DrugBank"),
        "SNOMEDCT", new Rule(Pattern.compile("^[0-9]{6,18}$"),
            "https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm={c}", "RxNav (SNOMED CT search)"),
        "ICD11_XM", new Rule(Pattern.compile("^XM[0-9A-Z]{4}$"), ICD11_HOME, "Search ICD-11 for {c}"),
        "DDINTER", new Rule(Pattern.compile("^DDInter[0-9]{1,6}$"),
            "https://ddinter2.scbdd.com/server/drug-detail/{c}/", "DDInter 2.0"));
    private static final Pattern INTERACTION_ID = Pattern.compile("^[0-9]{1,9}$");

    /** The link for one code of a substance, or empty when the system has no rule or the code fails its pattern. */
    public static Optional<Source> code(String system, String code, Instant fetchedAt) {
        Rule rule = RULES.get(system);
        if (rule == null || code == null || !rule.pattern().matcher(code).matches()) return Optional.empty();
        String c = URLEncoder.encode(code, StandardCharsets.UTF_8);
        return Optional.of(new Source(rule.url().replace("{c}", c), rule.label().replace("{c}", code), fetchedAt));
    }

    /** The DDInter pair page, only for a stored numeric interaction_id; no per-pair fetch time is stored. */
    public static Optional<Source> pair(String interactionId) {
        if (interactionId == null || !INTERACTION_ID.matcher(interactionId).matches()) return Optional.empty();
        return Optional.of(new Source("https://ddinter2.scbdd.com/server/interact/" + interactionId + "/", "Full record in DDInter 2.0", null));
    }

    /** The DGDA register (OCL) page of a brand: the existing S-key target (§5.14). */
    public static Source brand(String conceptId, Instant fetchedAt) {
        return new Source(oclUrl(conceptId), "DGDA register (OCL)", fetchedAt);
    }

    /**
     * The OCL concept URL, as web/lib/evidence.ts builds it with encodeURIComponent. URLEncoder escapes five characters
     * that encodeURIComponent keeps (! ' ( ) ~) and writes a space as "+", so both are undone here.
     */
    public static String oclUrl(String conceptId) {
        String encoded = URLEncoder.encode(conceptId, StandardCharsets.UTF_8).replace("+", "%20")
            .replace("%21", "!").replace("%27", "'").replace("%28", "(").replace("%29", ")").replace("%7E", "~");
        return OCL_CONCEPT + encoded + "/";
    }
}
```

In `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`, replace the `OCL_CONCEPT` constant and the whole `sourceUrl` method (with its Javadoc) by:

```java
    public static final String OCL_CONCEPT = SourceLinks.OCL_CONCEPT;

    /** The OCL concept URL (§7.3 sourceUrl); built by SourceLinks, the one URL builder (§5.6.6). */
    public static String sourceUrl(String conceptId) {
        return SourceLinks.oclUrl(conceptId);
    }
```

and add `import com.niramoy.bddrug.domain.SourceLinks;`; remove the now unused imports `java.net.URLEncoder` and `java.nio.charset.StandardCharsets`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests SourceLinksTest --tests ReviewQueryIntegrationTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/SourceLinks.java api/src/test/java/com/niramoy/bddrug/SourceLinksTest.java \
  api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java
git commit -m "feat(api): SourceLinks builds every source URL from a validated code (§5.6.6)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: `PairContent` and `PairReviewRule` — the pair's hash and its four review states (§5.17, §7.7)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/PairContent.java`, `api/src/main/java/com/niramoy/bddrug/domain/PairReviewRule.java`
- Test: `api/src/test/java/com/niramoy/bddrug/PairContentTest.java`, `api/src/test/java/com/niramoy/bddrug/PairReviewRuleTest.java`

**Interfaces:**
- Consumes: `DdinterText.clean(String)`.
- Produces: `PairContent.Content(String severity, List<String> actions, String interaction, String management)` (the compact constructor sorts actions and cleans both texts; `null` actions become empty); `PairContent.canonical(String a, String b, Content c) → String`; `PairContent.hash(String a, String b, Content c) → String` (64 lower-case hex). `PairReviewRule.Decision(long id, String decision, String note, String contentHash, PairContent.Content content, Instant decidedAt, boolean mine)`; `PairReviewRule.Review(String state, Instant at, boolean mine, String note)` with states `not_reviewed | reviewed | changed | issue`; `PairReviewRule.PublicReview(String state, Instant reviewedAt)` with `reviewed | not_reviewed`; `PairReviewRule.Change(String field, String atReview, String now)`; `PairReviewRule.HistoryEntry(String decision, Instant at, String note, boolean mine, boolean changedAfter)`; static `review(List<Decision>, String currentHash)`, `publicReview(List<Decision>, String currentHash)`, `changes(List<Decision>, PairContent.Content now, String currentHash)`, `history(List<Decision>, String currentHash)`, `lastId(List<Decision>) → Long` (null when none). Decisions may come in any order; the rule sorts by `decidedAt`, then `id`.

- [ ] **Step 1: Write the failing tests**

Create `api/src/test/java/com/niramoy/bddrug/PairContentTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairContent.Content;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.7: SHA-256 hex of the UTF-8 canonical JSON [a, b, severity, sorted(actions), interaction|null, management|null]. */
class PairContentTest {
    @Test void theCanonicalBytesArePinned() {
        Content c = new Content("moderate", List.of("Synergy", "Metabolism"), "Paracetamol may \"increase\" INR.\nMonitor.", null);
        assertThat(PairContent.canonical("DDInter14", "DDInter1951", c))
            .isEqualTo("[\"DDInter14\",\"DDInter1951\",\"moderate\",[\"Metabolism\",\"Synergy\"],"
                + "\"Paracetamol may \\\"increase\\\" INR.\\nMonitor.\",null]");
        assertThat(PairContent.hash("DDInter14", "DDInter1951", c))
            .isEqualTo("31357de0f95b7cf382acf4bd81d89620f7b689cc456ffab154140c884aea1652");
    }

    @Test void thePilotSeedPairsHashAsPinned() {
        assertThat(PairContent.hash("DDInter14", "DDInter1951", new Content("moderate", List.of(), null, null)))
            .isEqualTo("7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f");
        assertThat(PairContent.hash("DDInter1951", "DDInter20", new Content("major", List.of("Monitor", "Avoid"),
            "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
            "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")))
            .isEqualTo("b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043");
    }

    @Test void bengaliTextIsHashedAsUtf8() {
        assertThat(PairContent.hash("DDInter20", "DDInter83", new Content("moderate", List.of("Sinergy"), "বাংলা টেক্সট", null)))
            .isEqualTo("505c5b143577c2be26e448698db232a222d26b0e4c3d009ec24fd5e21adc34af");
    }

    /** Review Focus 3: P0's ETL stores DDInter's "None" as NULL; a cleaned row must not look changed. */
    @Test void placeholderTextHashesLikeNull() {
        String none = PairContent.hash("DDInter14", "DDInter1951", new Content("moderate", List.of(), null, null));
        for (String placeholder : new String[]{"None", " none ", "-", "--", "n/a", "", "   "})
            assertThat(PairContent.hash("DDInter14", "DDInter1951", new Content("moderate", null, placeholder, placeholder)))
                .as(placeholder).isEqualTo(none);
        // surrounding white space is not a change either
        assertThat(PairContent.hash("a", "b", new Content("minor", List.of(), "  text ", null)))
            .isEqualTo(PairContent.hash("a", "b", new Content("minor", List.of(), "text", null)));
    }

    @Test void controlCharactersAreEscapedAsJsonDoes() {
        assertThat(PairContent.canonical("a", "b", new Content("minor", List.of("x\ty"), "\u0001\\", null)))
            .isEqualTo("[\"a\",\"b\",\"minor\",[\"x\\ty\"],\"\\u0001\\\\\",null]");
    }
}
```

Create `api/src/test/java/com/niramoy/bddrug/PairReviewRuleTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairContent.Content;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PairReviewRule.Decision;
import com.niramoy.bddrug.domain.PairReviewRule.Review;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.17 "Pair review state": the latest pair decision L and the current content hash give the state (§11.3). */
class PairReviewRuleTest {
    static final Instant T = Instant.parse("2026-10-16T05:00:00Z");
    static final Content V1 = new Content("moderate", List.of("Metabolism"), "Text one.", null);
    static final Content V2 = new Content("major", List.of("Metabolism"), "Text one.", null);
    static final String H1 = PairContent.hash("DDInter14", "DDInter1951", V1), H2 = PairContent.hash("DDInter14", "DDInter1951", V2);

    static Decision d(long id, String decision, String note, Content c, int minutes, boolean mine) {
        return new Decision(id, decision, note, PairContent.hash("DDInter14", "DDInter1951", c), c, T.plusSeconds(60L * minutes), mine);
    }

    @Test void noDecisionIsNotReviewed() {
        assertThat(PairReviewRule.review(List.of(), H1)).isEqualTo(new Review("not_reviewed", null, false, null));
        assertThat(PairReviewRule.publicReview(List.of(), H1)).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
        assertThat(PairReviewRule.lastId(List.of())).isNull();
    }

    @Test void reviewedWhileTheHashIsUnchanged() {
        List<Decision> ds = List.of(d(1, "reviewed", "", V1, 0, true));
        assertThat(PairReviewRule.review(ds, H1)).isEqualTo(new Review("reviewed", T, true, null));
        assertThat(PairReviewRule.publicReview(ds, H1)).isEqualTo(new PairReviewRule.PublicReview("reviewed", T));
        assertThat(PairReviewRule.changes(ds, V1, H1)).isEmpty();
    }

    @Test void aSeverityActionOrTextChangeIsChanged() {
        List<Decision> ds = List.of(d(1, "reviewed", "", V1, 0, false));
        assertThat(PairReviewRule.review(ds, H2)).isEqualTo(new Review("changed", T, false, null));
        assertThat(PairReviewRule.publicReview(ds, H2)).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
        assertThat(PairReviewRule.changes(ds, V2, H2)).containsExactly(new PairReviewRule.Change("Severity", "moderate", "major"));
        Content texts = new Content("moderate", List.of("Metabolism", "Synergy"), "Text two.", "Monitor.");
        assertThat(PairReviewRule.changes(ds, texts, PairContent.hash("DDInter14", "DDInter1951", texts))).containsExactly(
            new PairReviewRule.Change("Actions", "Metabolism", "Metabolism, Synergy"),
            new PairReviewRule.Change("Interaction text", "Text one.", "Text two."),
            new PairReviewRule.Change("Management text", null, "Monitor."));
    }

    @Test void aPartnerNameChangeIsNotAChange() {
        // partner display names are not part of the content: the same content hashes the same
        assertThat(PairReviewRule.review(List.of(d(1, "reviewed", "", V1, 0, false)), PairContent.hash("DDInter14", "DDInter1951",
            new Content("moderate", List.of("Metabolism"), "Text one.", null))).state()).isEqualTo("reviewed");
    }

    @Test void anIssueStaysAnIssueAfterAChangeAndCarriesItsNote() {
        List<Decision> ds = List.of(d(1, "reviewed", "", V1, 0, false), d(2, "issue", "Text says avoid; severity is Minor", V1, 5, true));
        assertThat(PairReviewRule.review(ds, H1)).isEqualTo(new Review("issue", T.plusSeconds(300), true, "Text says avoid; severity is Minor"));
        assertThat(PairReviewRule.review(ds, H2).state()).isEqualTo("issue");
        assertThat(PairReviewRule.publicReview(ds, H1)).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
    }

    @Test void theLatestDecisionWinsByTimeThenIdWhateverTheInputOrder() {
        List<Decision> ds = List.of(d(3, "reviewed", "", V1, 9, false), d(2, "issue", "first an issue", V1, 1, false));
        assertThat(PairReviewRule.review(ds, H1).state()).isEqualTo("reviewed");
        assertThat(PairReviewRule.lastId(ds)).isEqualTo(3L);
        Decision sameTimeLowerId = d(4, "issue", "same time, later id", V1, 9, false);
        assertThat(PairReviewRule.review(List.of(sameTimeLowerId, d(3, "reviewed", "", V1, 9, false)), H1).state()).isEqualTo("issue");
    }

    @Test void historyIsOldestFirstAndMarksReviewsTheDataChangedAfter() {
        List<Decision> ds = List.of(d(2, "issue", "check the text", V1, 5, false), d(1, "reviewed", "", V1, 0, true));
        assertThat(PairReviewRule.history(ds, H2)).containsExactly(
            new PairReviewRule.HistoryEntry("reviewed", T, null, true, true),
            new PairReviewRule.HistoryEntry("issue", T.plusSeconds(300), "check the text", false, false));
        assertThat(PairReviewRule.history(ds, H1).get(0).changedAfter()).isFalse();
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests PairContentTest --tests PairReviewRuleTest`
Expected: FAIL to compile (`PairContent` and `PairReviewRule` do not exist).

- [ ] **Step 3: Write the two classes**

Create `api/src/main/java/com/niramoy/bddrug/domain/PairContent.java`:

```java
package com.niramoy.bddrug.domain;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Spec §5.17, §7.7: a DDInter pair's reviewable content and its hash. The canonical form is the JSON array
 * [ddinterA, ddinterB, severity, sorted(actions), interaction or null, management or null], compact, with the texts
 * passed through DdinterText.clean (so "None", "-" and blank equal NULL), encoded as UTF-8. Partner display names are
 * not part of it. PairContentTest pins the bytes.
 */
public final class PairContent {
    private PairContent() {}

    public record Content(String severity, List<String> actions, String interaction, String management) {
        public Content {
            actions = actions == null ? List.of() : actions.stream().sorted().toList();
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }

    public static String canonical(String a, String b, Content c) {
        return "[" + quote(a) + "," + quote(b) + "," + quote(c.severity()) + ","
            + c.actions().stream().map(PairContent::quote).collect(Collectors.joining(",", "[", "]")) + ","
            + quoteOrNull(c.interaction()) + "," + quoteOrNull(c.management()) + "]";
    }

    public static String hash(String a, String b, Content c) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(canonical(a, b, c).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String quoteOrNull(String s) { return s == null ? "null" : quote(s); }

    /** JSON string escaping: quote, backslash and control characters; everything else literal (RFC 8259). */
    private static String quote(String s) {
        StringBuilder out = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                default -> {
                    if (ch < 0x20) out.append(String.format("\\u%04x", (int) ch));
                    else out.append(ch);
                }
            }
        }
        return out.append('"').toString();
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/domain/PairReviewRule.java`:

```java
package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * Spec §5.17 "Pair review state": the one pure function that maps a pair's decisions (ops.pair_review) and its current
 * content hash to its state. Every reviewer and public endpoint uses it. The latest decision L (by time, then id):
 * none → not_reviewed; L reviewed with an equal hash → reviewed; L reviewed with another hash → changed (DDInter changed
 * the severity, actions or text after the review, PO D5); L issue → issue, whatever changed since. The public form is
 * coarse (D53): reviewed only when reviewed; changed, issue and not_reviewed are all not_reviewed, with no date.
 */
public final class PairReviewRule {
    private PairReviewRule() {}

    public static final String NOT_REVIEWED = "not_reviewed", REVIEWED = "reviewed", CHANGED = "changed", ISSUE = "issue";

    /** One ops.pair_review row; {@code mine} is decided by the caller (the reviewer email equals the viewer's). */
    public record Decision(long id, String decision, String note, String contentHash, PairContent.Content content,
                           Instant decidedAt, boolean mine) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Review(String state, Instant at, boolean mine, String note) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PublicReview(String state, Instant reviewedAt) {}
    public record Change(String field, String atReview, String now) {}
    public record HistoryEntry(String decision, Instant at, String note, boolean mine, boolean changedAfter) {}

    private static final Comparator<Decision> ORDER = Comparator.comparing(Decision::decidedAt).thenComparingLong(Decision::id);

    private static Decision latest(List<Decision> decisions) {
        return decisions.stream().max(ORDER).orElse(null);
    }

    public static Review review(List<Decision> decisions, String currentHash) {
        Decision l = latest(decisions);
        if (l == null) return new Review(NOT_REVIEWED, null, false, null);
        if (ISSUE.equals(l.decision())) return new Review(ISSUE, l.decidedAt(), l.mine(), l.note());
        return new Review(l.contentHash().equals(currentHash) ? REVIEWED : CHANGED, l.decidedAt(), l.mine(), null);
    }

    public static PublicReview publicReview(List<Decision> decisions, String currentHash) {
        Review r = review(decisions, currentHash);
        return REVIEWED.equals(r.state()) ? new PublicReview(REVIEWED, r.at()) : new PublicReview(NOT_REVIEWED, null);
    }

    /** "What changed in DDInter" (§5.17.2 item 6): the fields that differ between L's stored content and now. */
    public static List<Change> changes(List<Decision> decisions, PairContent.Content now, String currentHash) {
        Decision l = latest(decisions);
        if (l == null || !CHANGED.equals(review(decisions, currentHash).state()) || l.content() == null) return List.of();
        PairContent.Content then = l.content();
        List<Change> out = new ArrayList<>();
        if (!Objects.equals(then.severity(), now.severity())) out.add(new Change("Severity", then.severity(), now.severity()));
        if (!then.actions().equals(now.actions()))
            out.add(new Change("Actions", String.join(", ", then.actions()), String.join(", ", now.actions())));
        if (!Objects.equals(then.interaction(), now.interaction()))
            out.add(new Change("Interaction text", then.interaction(), now.interaction()));
        if (!Objects.equals(then.management(), now.management()))
            out.add(new Change("Management text", then.management(), now.management()));
        return List.copyOf(out);
    }

    /** "Pair history", oldest first; {@code changedAfter} when the pair's content differs from what that decision saw. */
    public static List<HistoryEntry> history(List<Decision> decisions, String currentHash) {
        return decisions.stream().sorted(ORDER).map(d -> new HistoryEntry(d.decision(), d.decidedAt(),
            ISSUE.equals(d.decision()) ? d.note() : null, d.mine(), REVIEWED.equals(d.decision()) && !d.contentHash().equals(currentHash)))
            .toList();
    }

    /** The newest pair_review id (the version's lastPairReviewId), or null. */
    public static Long lastId(List<Decision> decisions) {
        return decisions.stream().map(Decision::id).max(Long::compare).orElse(null);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests PairContentTest --tests PairReviewRuleTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/PairContent.java api/src/main/java/com/niramoy/bddrug/domain/PairReviewRule.java \
  api/src/test/java/com/niramoy/bddrug/PairContentTest.java api/src/test/java/com/niramoy/bddrug/PairReviewRuleTest.java
git commit -m "feat(api): PairContent hash and PairReviewRule: reviewed, changed, issue, not reviewed (§5.17, §7.7)" \
  -m "The hash is taken after DdinterText.clean, so a placeholder stored as NULL is not a change (Review Focus 3)." \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: `BatchPairs.computeFor` (linear, shared with `compute`) and `partnerScope` (§7.3)

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java`
- Test: `api/src/test/java/com/niramoy/bddrug/BatchPairsTest.java`

**Interfaces:**
- Consumes: `RouteRule.choose`, `DdinterCode`, Task 4's `SourceLinks.Source`, Task 5's `PairReviewRule.Review`.
- Produces:
  - `BatchPairs.PairRow` gains a ninth component `String interactionId` (the eight-argument constructor stays, with `interactionId = null`).
  - `BatchPairs.Pair` gains `@JsonIgnore String interactionId`, `SourceLinks.Source source`, `PairReviewRule.Review pairReview` (null from `compute`) and `Pair with(SourceLinks.Source, PairReviewRule.Review)`.
  - `BatchPairs.OtherProduct(String conceptId, String tradeName, String batchId, boolean approved, String route, List<Substance> substances)`; `BatchPairs.OtherPartner(String conceptId, String tradeName, String batchId, boolean approved)`; `BatchPairs.OtherPair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance, String partnerBdsId, String severity, List<String> actions, String interaction, String management, @JsonIgnore String interactionId, SourceLinks.Source source, PairReviewRule.Review pairReview, List<OtherPartner> partners, int partnerCount)` with `with(source, review)`; `BatchPairs.OtherNotChecked(String substance, String partnerSubstance, String partnerBdsId, List<OtherPartner> partners, int partnerCount, String reason, String side, String route)`; `BatchPairs.OtherResult(List<OtherPair> pairs, List<OtherNotChecked> notChecked, int otherBatches)`.
  - `BatchPairs.computeFor(Product me, List<OtherProduct> partners, List<PairRow> rows, Set<String> complete) → OtherResult`: pairs and not-checked lines are grouped per pair (or line) **and** per partner status (`approved`), so every entry's partners share one status; `partners` holds at most `PARTNERS_SHOWN = 5`, ordered by batch id, then trade name, then concept id; `partnerCount` is the total; `otherBatches` counts the distinct batches of the given partners. No `same_product` line. Pairs are ordered as `compute` orders them, approved before not approved on a tie.
  - `BatchPairs.partnerScope(String a, String b, Set<String> mine, Set<String> others) → "batch" | "same_product" | "other"` (§7.3).

- [ ] **Step 1: Write the failing tests**

Append to `api/src/test/java/com/niramoy/bddrug/BatchPairsTest.java`, before the final `}` (add the imports `com.niramoy.bddrug.domain.BatchPairs.OtherProduct`, `com.niramoy.bddrug.domain.BatchPairs.OtherResult`, `java.util.ArrayList` and `java.util.stream.IntStream`):

```java
    // ---- P1C: computeFor over other batches (§7.3 otherPairs) and partnerScope (§5.5.3)

    static OtherProduct other(Product q, String batch, boolean approved) {
        return new OtherProduct(q.conceptId(), q.tradeName(), batch, approved, q.route(), q.substances());
    }

    /** §11.3 BatchPairsTest.computeForMatchesCompute: for one partner set, the same pairs and not-checked lines. */
    @Test void computeForMatchesCompute() {
        for (String id : List.of("W", "EYE", "CAP", "D", "COMBO", "NASAL")) {
            Product me = BATCH.stream().filter(p -> p.conceptId().equals(id)).findFirst().orElseThrow();
            BatchPairs.Result batch = BatchPairs.compute(id, BATCH, ROWS, COMPLETE);
            List<OtherProduct> partners = BATCH.stream().filter(p -> p != me).map(p -> other(p, "B-2", false)).toList();
            OtherResult others = BatchPairs.computeFor(me, partners, ROWS, COMPLETE);
            assertThat(others.pairs()).extracting(BatchPairs.OtherPair::ddinterA, BatchPairs.OtherPair::ddinterB,
                    BatchPairs.OtherPair::severity, p -> p.partners().stream().map(BatchPairs.OtherPartner::conceptId).sorted().toList())
                .as(id).containsExactlyElementsOf(batch.pairs().stream().map(p -> org.assertj.core.groups.Tuple.tuple(p.ddinterA(),
                    p.ddinterB(), p.severity(), p.partners().stream().map(PartnerRef::conceptId).sorted().toList())).toList());
            assertThat(others.notChecked()).extracting(BatchPairs.OtherNotChecked::substance, BatchPairs.OtherNotChecked::partnerSubstance,
                    BatchPairs.OtherNotChecked::reason, BatchPairs.OtherNotChecked::side, BatchPairs.OtherNotChecked::route,
                    n -> n.partners().stream().map(BatchPairs.OtherPartner::conceptId).sorted().toList())
                .as(id).containsExactlyInAnyOrderElementsOf(batch.notChecked().stream().filter(n -> !n.reason().equals("same_product"))
                    .map(n -> org.assertj.core.groups.Tuple.tuple(n.substance(), n.partnerSubstance(), n.reason(), n.side(), n.route(),
                        n.partners().stream().map(PartnerRef::conceptId).sorted().toList())).toList());
            assertThat(others.otherBatches()).isEqualTo(1);
        }
    }

    @Test void partnersAreSplitByStatusOrderedByBatchThenNameAndCappedAtFive() {
        Product me = BATCH.get(0);   // W: warfarin
        List<OtherProduct> partners = new ArrayList<>();
        IntStream.rangeClosed(1, 7).forEach(i -> partners.add(new OtherProduct("A" + i, "Aspra " + i, i % 2 == 0 ? "B-2" : "B-3",
            false, "systemic", List.of(ASPIRIN))));
        partners.add(new OtherProduct("A-OK", "Ecosprin", "B-9", true, "systemic", List.of(ASPIRIN)));
        OtherResult r = BatchPairs.computeFor(me, partners, ROWS, COMPLETE);
        assertThat(r.pairs()).hasSize(2);
        BatchPairs.OtherPair approved = r.pairs().get(0), pending = r.pairs().get(1);
        assertThat(approved.partners()).extracting(BatchPairs.OtherPartner::conceptId).containsExactly("A-OK");
        assertThat(approved.partnerCount()).isEqualTo(1);
        assertThat(pending.partnerCount()).isEqualTo(7);
        assertThat(pending.partners()).extracting(BatchPairs.OtherPartner::tradeName)
            .containsExactly("Aspra 2", "Aspra 4", "Aspra 6", "Aspra 1", "Aspra 3");   // B-2 first, then B-3
        assertThat(pending.partners()).allMatch(p -> !p.approved());
        assertThat(pending.partnerBdsId()).isEqualTo("BDS-2");
        assertThat(r.otherBatches()).isEqualTo(3);
    }

    @Test void noPartnersMeansNoPairsAndNoOtherBatches() {
        OtherResult r = BatchPairs.computeFor(BATCH.get(0), List.of(), ROWS, COMPLETE);
        assertThat(r.pairs()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
        assertThat(r.otherBatches()).isZero();
    }

    @Test void theInteractionIdTravelsWithThePairButIsNotSerialised() throws Exception {
        PairRow row = new PairRow("DDInter1951", "DDInter20", "Warfarin", "Acetylsalicylic acid", "major", List.of(), "t", "m", "3039");
        BatchPairs.Result r = BatchPairs.compute("W", BATCH, List.of(row), COMPLETE);
        assertThat(r.pairs().get(0).interactionId()).isEqualTo("3039");
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules().writeValueAsString(r.pairs().get(0)))
            .doesNotContain("3039").contains("\"source\":null").contains("\"pairReview\":null");
    }

    /** §7.3 partnerScope: the partner side is the id that is not one of mine. */
    @Test void partnerScopeIsBatchSameProductOrOther() {
        Set<String> mine = Set.of("DDInter1951"), others = Set.of("DDInter14");
        assertThat(BatchPairs.partnerScope("DDInter14", "DDInter1951", mine, others)).isEqualTo("batch");
        assertThat(BatchPairs.partnerScope("DDInter1951", "DDInter20", mine, others)).isEqualTo("other");
        Set<String> combo = Set.of("DDInter394", "DDInter83");
        assertThat(BatchPairs.partnerScope("DDInter394", "DDInter83", combo, Set.of())).isEqualTo("same_product");
        // both mine, and another product of this batch chooses one of them: the batch note
        assertThat(BatchPairs.partnerScope("DDInter394", "DDInter83", combo, Set.of("DDInter83"))).isEqualTo("batch");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests BatchPairsTest`
Expected: FAIL to compile (`OtherProduct`, `computeFor`, `partnerScope` and the nine-argument `PairRow` do not exist).

- [ ] **Step 3: Implement**

Replace `api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java` with:

```java
package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Spec §5.6.2: the open record's DDInter pairs with the other current records of its batch ({@link #compute}) and with
 * the latest current item of every product held in another batch ({@link #computeFor}), with RouteRule applied on both
 * sides per record route (D14), and the pairs it cannot check (§6.7.2 rules 1–4). Both walk the same per-partner rule
 * ({@link #walk}), so they never disagree. A pair of usable sides with no stored row is "no interaction listed" and is
 * not returned here; only the batch count needs it.
 */
public final class BatchPairs {
    private BatchPairs() {}

    public record Substance(String bdsId, String name, String coverage, List<DdinterCode> codes) {}
    public record Product(String conceptId, String tradeName, int index, String route, List<Substance> substances) {}
    public record PairRow(String ddinterA, String ddinterB, String nameA, String nameB, String severity, List<String> actions,
                          String interaction, String management, String interactionId) {
        public PairRow(String ddinterA, String ddinterB, String nameA, String nameB, String severity, List<String> actions,
                       String interaction, String management) {
            this(ddinterA, ddinterB, nameA, nameB, severity, actions, interaction, management, null);
        }
    }
    public record PartnerRef(String conceptId, String tradeName, int index) {}
    public record Pair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance,
                       String severity, List<String> actions, String interaction, String management, List<PartnerRef> partners,
                       @JsonIgnore String interactionId, SourceLinks.Source source, PairReviewRule.Review pairReview) {
        public Pair with(SourceLinks.Source source, PairReviewRule.Review pairReview) {
            return new Pair(ddinterA, ddinterB, nameA, nameB, substance, partnerSubstance, severity, actions, interaction,
                management, partners, interactionId, source, pairReview);
        }
    }
    public record NotChecked(String substance, String partnerSubstance, List<PartnerRef> partners, String reason, String side,
                             String route) {}
    public record Result(int totalBatchPairs, List<Pair> pairs, List<NotChecked> notChecked) {}

    // ---- §7.3 otherPairs
    public record OtherProduct(String conceptId, String tradeName, String batchId, boolean approved, String route,
                               List<Substance> substances) {}
    public record OtherPartner(String conceptId, String tradeName, String batchId, boolean approved) {}
    public record OtherPair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance,
                            String partnerBdsId, String severity, List<String> actions, String interaction, String management,
                            @JsonIgnore String interactionId, SourceLinks.Source source, PairReviewRule.Review pairReview,
                            List<OtherPartner> partners, int partnerCount) {
        public OtherPair with(SourceLinks.Source source, PairReviewRule.Review pairReview) {
            return new OtherPair(ddinterA, ddinterB, nameA, nameB, substance, partnerSubstance, partnerBdsId, severity, actions,
                interaction, management, interactionId, source, pairReview, partners, partnerCount);
        }
    }
    public record OtherNotChecked(String substance, String partnerSubstance, String partnerBdsId, List<OtherPartner> partners,
                                  int partnerCount, String reason, String side, String route) {}
    public record OtherResult(List<OtherPair> pairs, List<OtherNotChecked> notChecked, int otherBatches) {}

    /** §5.6.2: at most this many partners per pair or line are sent; partnerCount gives the total. */
    public static final int PARTNERS_SHOWN = 5;

    /** When both sides are unusable, the first reason in this list wins (this side on a tie). */
    public static final List<String> REASON_ORDER = List.of("no_data", "unmapped", "not_run", "no_route");
    private static final List<String> SEVERITY_ORDER = List.of("major", "moderate", "minor");

    private record Use(List<String> chosen, String reason) {}

    static Use use(Substance s, String route, Set<String> complete) {
        if (s.bdsId() == null) return new Use(List.of(), "unmapped");
        if ("none".equals(s.coverage())) return new Use(List.of(), "no_data");
        if (!"full".equals(s.coverage())) return new Use(List.of(), "not_run");
        Optional<RouteRule.Choice> choice = RouteRule.choose(s.codes(), route);
        if (choice.isEmpty()) return new Use(List.of(), "no_route");
        List<String> ids = choice.get().codes().stream().map(DdinterCode::code).toList();
        return complete.containsAll(ids) ? new Use(ids, null) : new Use(List.of(), "not_run");
    }

    private static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }
    private static boolean sameSubstance(Substance s, Substance t) { return s.bdsId() != null && s.bdsId().equals(t.bdsId()); }
    private static int severityRank(String s) { int i = SEVERITY_ORDER.indexOf(s); return i < 0 ? SEVERITY_ORDER.size() : i; }

    /** What one partner product contributes: a stored pair, or a line it cannot check. */
    private interface Visitor {
        void pair(PairRow row, Substance mine, Substance theirs);
        void notChecked(Substance mine, Substance theirs, String reason, boolean thisSide, String route);
    }

    /** The one per-partner rule: RouteRule on both sides, REASON_ORDER for unusable sides, the same substance skipped. */
    private static void walk(Product me, String partnerRoute, List<Substance> partnerSubstances, Map<String, PairRow> byKey,
                             Set<String> complete, Visitor v) {
        for (Substance s : me.substances())
            for (Substance t : partnerSubstances) {
                if (sameSubstance(s, t)) continue;
                Use us = use(s, me.route(), complete), ut = use(t, partnerRoute, complete);
                if (us.reason() == null && ut.reason() == null) {
                    for (String a : us.chosen())
                        for (String b : ut.chosen()) {
                            PairRow row = byKey.get(key(a, b));
                            if (row != null) v.pair(row, s, t);
                        }
                    continue;
                }
                boolean thisSide = ut.reason() == null || (us.reason() != null
                    && REASON_ORDER.indexOf(us.reason()) <= REASON_ORDER.indexOf(ut.reason()));
                v.notChecked(s, t, thisSide ? us.reason() : ut.reason(), thisSide, thisSide ? me.route() : partnerRoute);
            }
    }

    private static Map<String, PairRow> byKey(List<PairRow> rows) {
        Map<String, PairRow> out = new LinkedHashMap<>();
        for (PairRow r : rows) out.put(key(r.ddinterA(), r.ddinterB()), r);
        return out;
    }

    public static Result compute(String conceptId, List<Product> products, List<PairRow> rows, Set<String> complete) {
        Map<String, PairRow> byKey = byKey(rows);

        Set<String> batch = new HashSet<>();
        for (int i = 0; i < products.size(); i++)
            for (int j = i + 1; j < products.size(); j++)
                for (Substance s : products.get(i).substances())
                    for (Substance t : products.get(j).substances()) {
                        if (sameSubstance(s, t)) continue;
                        Use us = use(s, products.get(i).route(), complete), ut = use(t, products.get(j).route(), complete);
                        if (us.reason() != null || ut.reason() != null) continue;
                        for (String a : us.chosen()) for (String b : ut.chosen()) if (byKey.containsKey(key(a, b))) batch.add(key(a, b));
                    }

        Product me = products.stream().filter(p -> p.conceptId().equals(conceptId)).findFirst().orElse(null);
        if (me == null) return new Result(batch.size(), List.of(), List.of());

        Map<String, Pair> pairs = new LinkedHashMap<>();
        Map<String, NotChecked> notChecked = new LinkedHashMap<>();
        for (Product q : products) {
            if (q == me) continue;
            PartnerRef partner = new PartnerRef(q.conceptId(), q.tradeName(), q.index());
            walk(me, q.route(), q.substances(), byKey, complete, new Visitor() {
                @Override public void pair(PairRow row, Substance s, Substance t) {
                    String k = key(row.ddinterA(), row.ddinterB());
                    Pair old = pairs.get(k);
                    pairs.put(k, old == null
                        ? new Pair(row.ddinterA(), row.ddinterB(), row.nameA(), row.nameB(), s.name(), t.name(), row.severity(),
                            row.actions(), row.interaction(), row.management(), List.of(partner), row.interactionId(), null, null)
                        : withPartner(old, partner));
                }
                @Override public void notChecked(Substance s, Substance t, String reason, boolean thisSide, String route) {
                    String side = thisSide ? "this" : "partner";
                    // Spec §5.6.2/§6.7.3: the line names the route of the record the reason applies to, so partners that
                    // differ by route must not merge (a null route stays apart from a named one).
                    String k = s.name() + "|" + t.name() + "|" + reason + "|" + side + (thisSide ? "" : "|" + String.valueOf(q.route()));
                    NotChecked old = notChecked.get(k);
                    notChecked.put(k, old == null
                        ? new NotChecked(s.name(), t.name(), List.of(partner), reason, side, route)
                        : new NotChecked(old.substance(), old.partnerSubstance(), plus(old.partners(), partner), reason, side, old.route()));
                }
            });
        }
        List<Substance> own = me.substances();
        for (int i = 0; i < own.size(); i++)
            for (int j = i + 1; j < own.size(); j++)
                if (!sameSubstance(own.get(i), own.get(j)))
                    notChecked.put(own.get(i).name() + "|" + own.get(j).name() + "|same_product",
                        new NotChecked(own.get(i).name(), own.get(j).name(), List.of(), "same_product", "this", me.route()));

        List<Pair> sorted = new ArrayList<>(pairs.values());
        sorted.sort(Comparator.comparingInt((Pair x) -> severityRank(x.severity()))
            .thenComparing(x -> x.partnerSubstance().toLowerCase(Locale.ROOT))
            .thenComparing(Pair::ddinterA).thenComparing(Pair::ddinterB));
        return new Result(batch.size(), List.copyOf(sorted), List.copyOf(notChecked.values()));
    }

    /** A pair or line of {@link #computeFor} while it collects its partners (all of one status). */
    private static final class Acc {
        final PairRow row; final Substance mine, theirs; final String reason, side, route; final boolean approved;
        final List<OtherPartner> partners = new ArrayList<>();
        final Set<String> seen = new HashSet<>();
        Acc(PairRow row, Substance mine, Substance theirs, String reason, String side, String route, boolean approved) {
            this.row = row; this.mine = mine; this.theirs = theirs; this.reason = reason; this.side = side; this.route = route;
            this.approved = approved;
        }
        void add(OtherPartner p) { if (seen.add(p.conceptId())) partners.add(p); }
        List<OtherPartner> shown() {
            return partners.stream().sorted(PARTNER_ORDER).limit(PARTNERS_SHOWN).toList();
        }
    }

    private static final Comparator<OtherPartner> PARTNER_ORDER = Comparator.comparing(OtherPartner::batchId)
        .thenComparing(p -> p.tradeName().toLowerCase(Locale.ROOT)).thenComparing(OtherPartner::conceptId);

    /**
     * §7.3 otherPairs, linear: only me × partners, never partner × partner, and no batch-wide count. {@code partners} is the
     * latest current item of every product held in another batch (none of them in this batch). Entries are kept apart by
     * partner status, so the desk's two groups ("With approved medicines", "… not yet approved") read them as given.
     */
    public static OtherResult computeFor(Product me, List<OtherProduct> partners, List<PairRow> rows, Set<String> complete) {
        Map<String, PairRow> byKey = byKey(rows);
        Map<String, Acc> pairs = new LinkedHashMap<>(), lines = new LinkedHashMap<>();
        for (OtherProduct q : partners) {
            OtherPartner ref = new OtherPartner(q.conceptId(), q.tradeName(), q.batchId(), q.approved());
            walk(me, q.route(), q.substances(), byKey, complete, new Visitor() {
                @Override public void pair(PairRow row, Substance s, Substance t) {
                    pairs.computeIfAbsent(key(row.ddinterA(), row.ddinterB()) + "|" + q.approved(),
                        k -> new Acc(row, s, t, null, null, null, q.approved())).add(ref);
                }
                @Override public void notChecked(Substance s, Substance t, String reason, boolean thisSide, String route) {
                    String side = thisSide ? "this" : "partner";
                    String k = s.name() + "|" + t.name() + "|" + reason + "|" + side + (thisSide ? "" : "|" + String.valueOf(route))
                        + "|" + q.approved();
                    lines.computeIfAbsent(k, x -> new Acc(null, s, t, reason, side, route, q.approved())).add(ref);
                }
            });
        }
        List<OtherPair> outPairs = pairs.values().stream()
            .map(a -> new OtherPair(a.row.ddinterA(), a.row.ddinterB(), a.row.nameA(), a.row.nameB(), a.mine.name(), a.theirs.name(),
                a.theirs.bdsId(), a.row.severity(), a.row.actions(), a.row.interaction(), a.row.management(), a.row.interactionId(),
                null, null, a.shown(), a.partners.size()))
            .sorted(Comparator.comparingInt((OtherPair x) -> severityRank(x.severity()))
                .thenComparing(x -> x.partnerSubstance().toLowerCase(Locale.ROOT))
                .thenComparing(OtherPair::ddinterA).thenComparing(OtherPair::ddinterB)
                .thenComparing(x -> !x.partners().get(0).approved()))
            .toList();
        List<OtherNotChecked> outLines = lines.values().stream()
            .map(a -> new OtherNotChecked(a.mine.name(), a.theirs.name(), a.theirs.bdsId(), a.shown(), a.partners.size(), a.reason,
                a.side, a.route))
            .toList();
        int batches = (int) partners.stream().map(OtherProduct::batchId).distinct().count();
        return new OtherResult(outPairs, outLines, batches);
    }

    /**
     * §7.3 partnerScope of a text-missing pair (a, b) for a record that chooses {@code mine}, where {@code others} are the
     * ids chosen by the other current products of its batch: batch when others hold the partner side (either side when
     * mine holds both); else same_product when mine holds both; else other.
     */
    public static String partnerScope(String a, String b, Set<String> mine, Set<String> others) {
        boolean bothMine = mine.contains(a) && mine.contains(b);
        String partner = mine.contains(a) ? b : a;
        boolean inBatch = bothMine ? others.contains(a) || others.contains(b) : others.contains(partner);
        if (inBatch) return "batch";
        return bothMine ? "same_product" : "other";
    }

    private static Pair withPartner(Pair p, PartnerRef ref) {
        return new Pair(p.ddinterA(), p.ddinterB(), p.nameA(), p.nameB(), p.substance(), p.partnerSubstance(), p.severity(),
            p.actions(), p.interaction(), p.management(), plus(p.partners(), ref), p.interactionId(), p.source(), p.pairReview());
    }

    private static List<PartnerRef> plus(List<PartnerRef> list, PartnerRef ref) {
        if (list.contains(ref)) return list;
        List<PartnerRef> out = new ArrayList<>(list);
        out.add(ref);
        out.sort(Comparator.comparingInt(PartnerRef::index));
        return List.copyOf(out);
    }
}
```

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`, `pairRows`: add `p.interaction_id` to the `SELECT` list (after `t.management`) and pass `r.get("interaction_id", String.class)` as the ninth constructor argument of `BatchPairs.PairRow`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests BatchPairsTest --tests ReviewQueryIntegrationTest`
Expected: PASS (every existing `compute` test unchanged).

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java api/src/test/java/com/niramoy/bddrug/BatchPairsTest.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java
git commit -m "feat(api): BatchPairs.computeFor over other batches, linear and sharing compute's rule; partnerScope (§7.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7a: Reviewer item — `partnerScope`, `openIssues`, the dismissal and carried history, and code sources (§7.3)

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/ItemHistory.java`, `api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java`, `api/src/main/java/com/niramoy/bddrug/domain/IngredientSummary.java`, `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/IngredientSummaryReader.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ItemHistoryTest.java`, `api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java`; Create: `api/src/test/java/com/niramoy/bddrug/ReviewQueryCrossBatchIntegrationTest.java`

**Interfaces:**
- Consumes: Task 2's `ApprovalRule.openIssues`; Task 4's `SourceLinks`; Task 6's `BatchPairs.partnerScope`.
- Produces:
  - `ItemHistory.Snapshot(Instant extractedAt, UUID runId, String reason, String carriedFrom)` (three-argument constructor kept); `ItemHistory.Entry(…, Boolean counts, Boolean mine, String uncountedBy, String carriedFrom)` (eight-argument constructor kept; `@JsonInclude(NON_NULL)` so absent fields are not sent). `uncountedBy` is `"rerun"` for a decision at or before the run stamp, `"dismiss"` for one after the stamp but at or before the latest dismissal since it; the dismissal itself counts. An `extract` entry carries `carriedFrom` (a batch id) when a snapshot of its run has `carried_from`.
  - `ReviewItem.TextMissingPair(…, boolean inBatch, String partnerScope)`; `ReviewItem.Brand(…, String parseNote, SourceLinks.Source source)`; `ReviewItem.OpenIssue(String role, Instant at, String note, boolean mine)`; `ReviewItem` gains the last component `List<OpenIssue> openIssues`.
  - `IngredientSummary.Code(…, double confidence, SourceLinks.Source source)`; `IngredientSummary.Entry(…, int foodCount, SourceLinks.Source source)`.
  - `ReviewQueryPort.snapshots` reads `payload -> 'carried_from' ->> 'batchId'`; `ReviewQueryPort.ItemDetail` builds the brand's `source` from `raw.ocl_concept.fetched_at`.
  - `IngredientSummaryReader.codesSql(String icd11FetchedAt)` (package-private) and `entries(String[] ids)` (package-private, `EntryRow` gains `Instant fetchedAt`) for Task 8a.

- [ ] **Step 1: Write the failing tests**

In `api/src/test/java/com/niramoy/bddrug/ItemHistoryTest.java`, change the expected decision entry in `aLaterRunIsARerunAndReopensTheRecord` to

```java
            new Entry("decision", t(10), null, "pharmacist", "ok", "", false, true, "rerun", null),
```

and append, before the final `}`:

```java
    // ---- P1C: why a decision no longer counts (§5.6.5), and the carried approval line (§8.3.1 item 8)

    @Test void decisionsAtOrBeforeTheLatestDismissalNoLongerCountButTheDismissalDoes() {
        List<Snapshot> one = List.of(new Snapshot(t(1), RUN_1, "run"));
        List<Decision> ds = List.of(new Decision(1, "ok", "", "pharmacist", t(0), false),
            new Decision(2, "ok", "", "pharmacist", t(5), false),
            new Decision(3, "issue", "route should be otic", "engineer", t(6), false),
            new Decision(4, "dismiss", "the report misread it", "senior", t(7), true),
            new Decision(5, "issue", "a second report", "pharmacist", t(8), false));
        List<Entry> h = ItemHistory.build(List.of(), one, ds, t(1)).history().stream().filter(e -> e.kind().equals("decision")).toList();
        assertThat(h).extracting(Entry::decision, Entry::counts, Entry::uncountedBy).containsExactly(
            org.assertj.core.groups.Tuple.tuple("ok", false, "rerun"),        // before the stamp: the re-run suffix wins
            org.assertj.core.groups.Tuple.tuple("ok", false, "dismiss"),
            org.assertj.core.groups.Tuple.tuple("issue", false, "dismiss"),
            org.assertj.core.groups.Tuple.tuple("dismiss", true, null),
            org.assertj.core.groups.Tuple.tuple("issue", true, null));
        assertThat(h.get(2).note()).isEqualTo("route should be otic");   // the reporter's note stays
        assertThat(h.get(3).mine()).isTrue();
    }

    @Test void aCarriedApprovalNamesItsBatchOnTheExtractEntry() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run", "0001-pilot"));
        assertThat(ItemHistory.build(List.of(), snaps, List.of(), t(1)).history())
            .containsExactly(new Entry("extract", t(1), "run", null, null, null, null, null, null, "0001-pilot"));
    }
```

In `api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java`, in `warfarinCarriesPairsCodesNotesHistoryAndSource`, after the line `.jsonPath("$.data.stages[3].textMissing[0].inBatch").isEqualTo(true)` add `.jsonPath("$.data.stages[3].textMissing[0].partnerScope").isEqualTo("batch")`, and after `.jsonPath("$.data.stages[3].textMissing[1].inBatch").isEqualTo(false)` add `.jsonPath("$.data.stages[3].textMissing[1].partnerScope").isEqualTo("other")`.

Create `api/src/test/java/com/niramoy/bddrug/ReviewQueryCrossBatchIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.3 P1C additions to the reviewer item, read-only over one shared seed:
 * K-THIS (W-1 Warin, N-1 Napa) is the open batch. Partners in other batches: K-OLD (A-1 Ecosprin approved, C-CAP, D-1, W-2,
 * six more aspirin brands), K-NEW (A-NOBDC, no route), K-COMBO (COMBO-1, warfarin + acetaminophen), K-CARRY (X-NOMAP, a
 * carried approval). Not partners: C-EYE (latest item removed, K-RM) and N-1's newer item in K-TWIN (N-1 is in K-THIS).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ReviewQueryCrossBatchIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org";

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              SELECT 'A-' || i, '10' || i, 'Aspra ' || i, 'Test Pharma', 'Tablet', 'Aspirin 75 mg', 'BDC-000002', 'parsed'
              FROM generate_series(2, 7) i;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('COMBO-1', '120', 'Warinol', 'Test Pharma', 'Tablet', 'Warfarin 5 mg + Paracetamol 500 mg', NULL, 'parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'A-' || i, 'XM2ZT1', 'Aspirin' FROM generate_series(2, 7) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES
             ('COMBO-1', 'XM5S93', 'Warfarin'), ('COMBO-1', 'XM6XF8', 'Acetaminophen');
            INSERT INTO raw.ocl_concept (source, concept_id, payload, fetched_at) VALUES ('DGDA-Drugs', 'W-1', '{}', '2026-10-11T21:20:00Z');
            INSERT INTO raw.http_snapshot (source, request_key, status, body, fetched_at) VALUES
             ('rxnav', 'GET /REST/rxcui/161/properties.json', 200, '{}', '2026-10-11T22:00:00Z'),
             ('rxnav', 'GET /REST/rxcui/161/allProperties.json?prop=codes', 200, '{}', '2026-10-11T22:01:00Z');
            UPDATE curated.ddinter_drug SET fetched_at = '2026-10-12T01:00:00Z' WHERE ddinter_id IN ('DDInter14', 'DDInter1951');

            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('K-THIS','in_review',2,'2026-10-12T08:00:00Z'), ('K-OLD','in_review',11,'2026-10-10T08:00:00Z'),
             ('K-NEW','in_review',1,'2026-10-13T08:00:00Z'), ('K-RM','in_review',0,'2026-10-09T08:00:00Z'),
             ('K-COMBO','in_review',1,'2026-10-11T08:00:00Z'), ('K-TWIN','in_review',1,'2026-10-14T08:00:00Z'),
             ('K-CARRY','approved',1,'2026-10-08T08:00:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('K-THIS','DGDA-Drugs','W-1','pending',NULL,'2026-10-12T09:00:00Z'),
             ('K-THIS','DGDA-Drugs','N-1','issue',NULL,'2026-10-12T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','A-1','ok',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','C-CAP','pending',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','D-1','pending',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','W-2','pending',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','N-1','ok',NULL,'2026-10-10T09:00:00Z'),
             ('K-NEW','DGDA-Drugs','A-NOBDC','pending',NULL,'2026-10-13T09:00:00Z'),
             ('K-RM','DGDA-Drugs','C-EYE','ok','removed from batch file','2026-10-09T09:00:00Z'),
             ('K-COMBO','DGDA-Drugs','COMBO-1','pending',NULL,'2026-10-11T09:00:00Z'),
             ('K-TWIN','DGDA-Drugs','N-1','pending',NULL,'2026-10-14T09:00:00Z'),
             ('K-CARRY','DGDA-Drugs','X-NOMAP','ok',NULL,'2026-10-08T09:00:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'K-OLD', 'DGDA-Drugs', 'A-' || i, 'pending', NULL, '2026-10-10T09:00:00Z' FROM generate_series(2, 7) i;
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('K-THIS','N-1','ok','','pharma.reviewer@example.org','pharmacist','2026-10-12T10:00:00Z'),
             ('K-THIS','N-1','issue','route should be otic','eng.reviewer@example.org','engineer','2026-10-12T10:05:00Z'),
             ('K-THIS','N-1','dismiss','the report misread the register','senior.reviewer@example.org','senior','2026-10-12T10:10:00Z'),
             ('K-THIS','N-1','issue','strength should read 650 mg','pharma.reviewer@example.org','pharmacist','2026-10-12T10:15:00Z'),
             ('K-OLD','A-1','ok','','pharma.reviewer@example.org','pharmacist','2026-10-10T10:00:00Z');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '', '{"text_missing":[]}'::jsonb FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical'), ('ddinter')) AS s(stage)
            WHERE bi.batch_id LIKE 'K-%' AND bi.note IS NULL;
            UPDATE ops.stage_result SET status = 'warn',
              note = 'DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter1951/DDInter20; DDInter text not found for DDInter1951/DDInter352',
              evidence = '{"text_missing":[["DDInter14","DDInter1951"],["DDInter1951","DDInter20"],["DDInter1951","DDInter352"]]}'
             WHERE batch_id = 'K-THIS' AND concept_id = 'W-1' AND stage = 'ddinter';
            UPDATE ops.stage_result SET status = 'warn', note = 'DDInter text not found for DDInter14/DDInter1951',
              evidence = '{"text_missing":[["DDInter14","DDInter1951"]]}'
             WHERE batch_id = 'K-COMBO' AND concept_id = 'COMBO-1' AND stage = 'ddinter';
            INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES
             ('K-CARRY','X-NOMAP','2026-10-08T09:00:00Z','00000000-0000-4000-8000-0000000000c1','run',
              '{"version":2,"carried_from":{"batchId":"K-PREV","extractedAt":"2026-10-07T09:00:00+00:00"}}');
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at)
              VALUES ('DDInter1951', 'DDInter20', 'reviewed', '', 'b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043',
                      '{"severity":"major","actions":["Avoid","Monitor"],"interaction":null,"management":null}',
                      'senior.reviewer@example.org', 'senior', '2026-10-15T08:00:00Z');
            """);
    }

    @Autowired WebTestClient web;

    WebTestClient.BodyContentSpec item(String batch, String concept) {
        return internal(web).get().uri("/v1/review/batches/{b}/items/{c}", batch, concept).header("X-Viewer-Email", SENIOR)
            .exchange().expectStatus().isOk().expectBody();
    }

    @Test void partnerScopeSplitsThisBatchThisProductAndOutside() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.stages[3].textMissing[*].partnerScope").isEqualTo(List.of("batch", "other", "other"))
            .jsonPath("$.data.stages[3].textMissing[*].inBatch").isEqualTo(List.of(true, false, false));
        item("K-COMBO", "COMBO-1")
            .jsonPath("$.data.stages[3].textMissing[0].partnerScope").isEqualTo("same_product")
            .jsonPath("$.data.stages[3].textMissing[0].inBatch").isEqualTo(false);
    }

    @Test void historyKeepsTheReportersNoteAndSaysWhyADecisionNoLongerCounts() {
        item("K-THIS", "N-1")
            .jsonPath("$.data.displayStatus").isEqualTo("issue")
            .jsonPath("$.data.history[?(@.kind == 'decision')].decision").isEqualTo(List.of("ok", "issue", "dismiss", "issue"))
            .jsonPath("$.data.history[?(@.kind == 'decision')].counts").isEqualTo(List.of(false, false, true, true))
            .jsonPath("$.data.history[?(@.kind == 'decision')].uncountedBy").isEqualTo(List.of("dismiss", "dismiss"))
            .jsonPath("$.data.history[?(@.kind == 'decision')].note")
                .isEqualTo(List.of("", "route should be otic", "the report misread the register", "strength should read 650 mg"))
            .jsonPath("$.data.history[?(@.decision == 'dismiss')].mine").isEqualTo(List.of(true))
            .jsonPath("$.data.history[?(@.decision == 'dismiss')].role").isEqualTo(List.of("senior"));
    }

    @Test void openIssuesQuoteTheCountedIssuesAfterTheLatestDismissal() {
        byte[] body = item("K-THIS", "N-1")
            .jsonPath("$.data.openIssues.length()").isEqualTo(1)
            .jsonPath("$.data.openIssues[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data.openIssues[0].note").isEqualTo("strength should read 650 mg")
            .jsonPath("$.data.openIssues[0].at").isEqualTo("2026-10-12T10:15:00Z")
            .jsonPath("$.data.openIssues[0].mine").isEqualTo(false)
            .returnResult().getResponseBody();
        assertThat(new String(body, StandardCharsets.UTF_8)).doesNotContain("@example.org");
        item("K-THIS", "W-1").jsonPath("$.data.openIssues.length()").isEqualTo(0);
    }

    @Test void aCarriedApprovalIsApprovedAndItsExtractEntryNamesTheBatch() {
        item("K-CARRY", "X-NOMAP")
            .jsonPath("$.data.displayStatus").isEqualTo("approved")
            .jsonPath("$.data.history[?(@.kind == 'extract')].carriedFrom").isEqualTo(List.of("K-PREV"));
        item("K-THIS", "W-1").jsonPath("$.data.history[?(@.kind == 'extract')].carriedFrom").isEqualTo(List.of());
    }

    @Test void everyCodeAndTheBrandCarryTheirSourceWithTheStoredFetchTime() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.brand.source.url").isEqualTo("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/W-1/")
            .jsonPath("$.data.brand.source.label").isEqualTo("DGDA register (OCL)")
            .jsonPath("$.data.brand.source.fetchedAt").isEqualTo("2026-10-11T21:20:00Z")
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ICD11_XM')].source.fetchedAt").isEqualTo(List.of("2026-10-11T21:20:00Z"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'DRUGBANK')].source.url").isEqualTo(List.of("https://go.drugbank.com/drugs/DB00682"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'DDINTER')].source.fetchedAt").isEqualTo(List.of("2026-10-12T01:00:00Z"))
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].source.url").isEqualTo("https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/");
        item("K-THIS", "N-1")
            .jsonPath("$.data.brand.source.fetchedAt").isEmpty()
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'RXCUI')].source.fetchedAt").isEqualTo(List.of("2026-10-11T22:00:00Z"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ATC')].source.fetchedAt").isEqualTo(List.of("2026-10-11T22:01:00Z"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ATC')].source.label").isEqualTo(List.of("WHO ATC/DDD Index"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ICD11_XM')].source.label").isEqualTo(List.of("Search ICD-11 for XM6XF8"));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests ItemHistoryTest --tests ReviewQueryIntegrationTest --tests ReviewQueryCrossBatchIntegrationTest`
Expected: FAIL. `ItemHistoryTest` does not compile (no ten-argument `Entry`, no four-argument `Snapshot`); the integration tests find no `partnerScope`, `openIssues`, `uncountedBy` or `source`.

- [ ] **Step 3: Implement the history rule**

In `api/src/main/java/com/niramoy/bddrug/domain/ItemHistory.java`:

1. Replace the `Snapshot`, `Entry` and `Group` records with:

```java
    /** {@code carriedFrom}: the batch whose approval the stamp carried (payload carried_from, §8.3.1 item 8), or null. */
    public record Snapshot(Instant extractedAt, UUID runId, String reason, String carriedFrom) {
        public Snapshot(Instant extractedAt, UUID runId, String reason) { this(extractedAt, runId, reason, null); }
    }
    /** {@code mine} is decided by the caller (the decision's email equals the viewer's, case-insensitively). */
    public record Decision(long id, String decision, String note, String role, Instant decidedAt, boolean mine) {}
    /**
     * {@code uncountedBy} says why {@code counts} is false: "rerun" (at or before the run stamp) or "dismiss" (after the
     * stamp, at or before the latest dismissal since it, §5.6.5). {@code carriedFrom} is set on an extract entry.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Entry(String kind, Instant at, String reason, String role, String decision, String note, Boolean counts,
                        Boolean mine, String uncountedBy, String carriedFrom) {
        public Entry(String kind, Instant at, String reason, String role, String decision, String note, Boolean counts, Boolean mine) {
            this(kind, at, reason, role, decision, note, counts, mine, null, null);
        }
    }
    public record Reopen(String reason, Instant at, Instant previousExtractedAt, boolean diffAvailable) {}
    public record Result(List<Entry> history, Reopen reopen) {}

    private record Group(Instant at, String reason, String carriedFrom) {}
    private static final Comparator<Decision> CHRONOLOGICAL = Comparator.comparing(Decision::decidedAt).thenComparingLong(Decision::id);
```

2. In `build`, replace the two loops that add `extract` and `decision` entries with:

```java
        for (Group g : groups) out.add(new Entry("extract", g.at(), g.reason(), null, null, null, null, null, null, g.carriedFrom()));
        Decision boundary = decisions.stream()
            .filter(d -> "dismiss".equals(d.decision()) && (extractedAt == null || d.decidedAt().isAfter(extractedAt)))
            .max(CHRONOLOGICAL).orElse(null);
        for (Decision d : decisions) {
            boolean afterStamp = extractedAt == null || d.decidedAt().isAfter(extractedAt);
            boolean beforeBoundary = boundary != null && d.id() != boundary.id() && CHRONOLOGICAL.compare(d, boundary) < 0;
            boolean counts = afterStamp && !beforeBoundary;
            String uncountedBy = !afterStamp ? "rerun" : beforeBoundary ? "dismiss" : null;
            out.add(new Entry("decision", d.decidedAt(), null, d.role(), d.decision(), d.note(), counts, d.mine(), uncountedBy, null));
        }
```

3. In `groups`, the empty-snapshot case becomes `List.of(new Group(extractedAt, "run", null))`, and the group construction becomes:

```java
            String carried = run.stream().map(Snapshot::carriedFrom).filter(java.util.Objects::nonNull).findFirst().orElse(null);
            out.add(new Group(last, reason, carried));
```

- [ ] **Step 4: Add the item fields and sources**

In `api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java`, change the record header's last line to

```java
                         List<ItemHistory.Entry> history, ItemHistory.Reopen reopen, List<OpenIssue> openIssues) {
```

and replace the `Brand` and `TextMissingPair` records, adding `OpenIssue`:

```java
    public record Brand(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                        String genericContentRaw, String qualityFlag, String parseStatus, String parseNote,
                        SourceLinks.Source source) {}
    /** partnerScope (P1C): batch, same_product or other; inBatch stays for compatibility (= partnerScope is batch). */
    public record TextMissingPair(String ddinterA, String nameA, String ddinterB, String nameB, String severity, boolean inBatch,
                                  String partnerScope) {}
    /** A counted issue the dismiss panel quotes (§5.10a): role, time, note, and "(you)"; never an email. */
    public record OpenIssue(String role, Instant at, String note, boolean mine) {}
```

In `api/src/main/java/com/niramoy/bddrug/domain/IngredientSummary.java`, replace `Code` and `Entry` with:

```java
    public record Code(String system, String code, String routeScope, String method, double confidence, SourceLinks.Source source) {}
    public record Entry(String ddinterId, String name, String routeScope, Counts counts, int diseaseCount, int foodCount,
                        SourceLinks.Source source) {}
```

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/IngredientSummaryReader.java`:

1. Add imports `com.niramoy.bddrug.domain.SourceLinks`, `java.time.Instant`, `java.time.OffsetDateTime`.
2. Replace `EntryRow` with `record EntryRow(String id, String name, int major, int moderate, int minor, int unknown, int total, int disease, int food, Instant fetchedAt) {}` (package-private).
3. Replace `codes(String[] ids)` with:

```java
    /**
     * §5.6.6 "fetched on": RxCUI from its RxNav properties snapshot; ATC, DrugBank and SNOMED CT from the allProperties
     * snapshot of the substance's RxCUI; DDInter from curated.ddinter_drug; ICD-11 from {@code icd11FetchedAt} (the DGDA
     * register, raw.ocl_concept). Correlated reads over a handful of codes per record.
     */
    static String codesSql(String icd11FetchedAt) {
        return """
            SELECT c.bds_id, c.system, c.code, c.route_scope, c.method, c.confidence,
                   CASE c.system
                     WHEN 'RXCUI' THEN (SELECT h.fetched_at FROM raw.http_snapshot h
                                         WHERE h.source = 'rxnav' AND h.request_key = 'GET /REST/rxcui/' || c.code || '/properties.json')
                     WHEN 'DDINTER' THEN (SELECT d.fetched_at FROM curated.ddinter_drug d WHERE d.ddinter_id = c.code)
                     WHEN 'ICD11_XM' THEN (%s)
                     ELSE (SELECT max(h.fetched_at) FROM raw.http_snapshot h
                             JOIN curated.substance_code rx ON rx.bds_id = c.bds_id AND rx.system = 'RXCUI'
                            WHERE h.source = 'rxnav' AND h.request_key = 'GET /REST/rxcui/' || rx.code || '/allProperties.json?prop=codes')
                   END AS fetched_at
            FROM curated.substance_code c WHERE c.bds_id = ANY(:ids) ORDER BY c.bds_id, %s, c.code"""
            .formatted(icd11FetchedAt, SYSTEM_RANK);
    }

    static Code code(io.r2dbc.spi.Readable r) {
        String system = r.get("system", String.class), code = r.get("code", String.class);
        OffsetDateTime at = r.get("fetched_at", OffsetDateTime.class);
        return new Code(system, code, r.get("route_scope", String.class), r.get("method", String.class),
            r.get("confidence", BigDecimal.class).doubleValue(), SourceLinks.code(system, code, at == null ? null : at.toInstant()).orElse(null));
    }

    private Mono<Map<String, List<Code>>> codes(String conceptId, String[] ids) {
        return db.sql(codesSql("SELECT max(rc.fetched_at) FROM raw.ocl_concept rc WHERE rc.concept_id = :c"))
            .bind("ids", ids).bind("c", conceptId)
            .map(r -> Map.entry(r.get("bds_id", String.class), code(r)))
            .all().collect(LinkedHashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }
```

and in `read`, call `codes(conceptId, ids)` instead of `codes(ids)`.

`SYSTEM_RANK` refers to the unqualified column `system`; in `codesSql` the outer query has only `c` in scope, so it resolves to `c.system`.

4. In `entries(String[] ids)`, make the method package-private (`Mono<Map<String, EntryRow>> entries(String[] ids)`), add to the `SELECT` list after `AS name` the column `(SELECT d.fetched_at FROM curated.ddinter_drug d WHERE d.ddinter_id = e.id) AS fetched_at`, and build `EntryRow` with the extra argument `at(r.get("fetched_at", OffsetDateTime.class))`, where

```java
    private static Instant at(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
```

5. In `assemble`, build each `Entry` with its source:

```java
                return new Entry(c.code(), name(entries, c.code()), c.routeScope(), counts, e == null ? 0 : e.disease(), e == null ? 0 : e.food(),
                    SourceLinks.code("DDINTER", c.code(), e == null ? null : e.fetchedAt()).orElse(null));
```

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`:

1. In `itemDetail`, add `rc.fetched_at AS ocl_fetched_at` to the `SELECT` list, and build the brand as

```java
                OffsetDateTime fetched = r.get("ocl_fetched_at", OffsetDateTime.class);
                ReviewItem.Brand brand = brandId == null ? null : new ReviewItem.Brand(brandId, r.get("dar_number", String.class),
                    r.get("trade_name", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
                    r.get("generic_content_raw", String.class), r.get("quality_flag", String.class),
                    r.get("parse_status", String.class), r.get("parse_note", String.class),
                    SourceLinks.brand(brandId, fetched == null ? null : fetched.toInstant()));
```

(import `com.niramoy.bddrug.domain.SourceLinks`).

2. Replace `snapshots` with:

```java
    @Override public Mono<List<ItemHistory.Snapshot>> snapshots(String batchId, String conceptId) {
        return db.sql("""
                SELECT extracted_at, run_id, reason, payload -> 'carried_from' ->> 'batchId' AS carried_from
                FROM ops.item_snapshot WHERE batch_id = :b AND concept_id = :c ORDER BY extracted_at""")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new ItemHistory.Snapshot(r.get("extracted_at", OffsetDateTime.class).toInstant(), r.get("run_id", UUID.class),
                r.get("reason", String.class), r.get("carried_from", String.class)))
            .all().collectList();
    }
```

In `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`:

1. In `stages(…)`, replace the construction of the text-missing pair with:

```java
                            String scope = BatchPairs.partnerScope(m[0], m[1], mine, others);
                            pairs.add(new ReviewItem.TextMissingPair(m[0], name(t.getT1(), row, m[0], true), m[1],
                                name(t.getT1(), row, m[1], false), row == null ? null : row.severity(), "batch".equals(scope), scope));
```

(and delete the now unused local `String other = …` line).

2. In `item(…)`, replace the `return new ReviewItem(…)` statement with:

```java
                            List<ReviewItem.OpenIssue> openIssues = ApprovalRule.openIssues(me.facts().decisions(), me.facts().extractedAt())
                                .stream().map(x -> new ReviewItem.OpenIssue(x.reviewerRole(), x.decidedAt(), x.note(),
                                    isMine(x.reviewerEmail(), viewerEmail))).toList();
                            return new ReviewItem(batchId, conceptId, me.index(), all.size(), me.displayStatus(), me.facts().review(),
                                me.version(), new ReviewItem.BatchInfo(batch.runAt(), all.size(), batch.status()), d.brand(),
                                d.dgdaIngredients(), d.clinical(), t.getT1(), stages, t.getT2().result(), d.sourceJson(),
                                sourceUrl(conceptId), history.history(), history.reopen(), openIssues);
```

and replace the `mine` computation inside the history mapping (`viewerEmail != null && x.reviewerEmail() != null && x.reviewerEmail().equalsIgnoreCase(viewerEmail.strip())`) with `isMine(x.reviewerEmail(), viewerEmail)`, adding:

```java
    /** §7.3 mine: the decision's email equals X-Viewer-Email, case-insensitively. */
    static boolean isMine(String reviewerEmail, String viewerEmail) {
        return viewerEmail != null && reviewerEmail != null && reviewerEmail.equalsIgnoreCase(viewerEmail.strip());
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests ItemHistoryTest --tests ReviewQueryIntegrationTest --tests ReviewQueryCrossBatchIntegrationTest --tests ProductApiIntegrationTest --tests SubstanceApiIntegrationTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/ItemHistory.java api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java \
  api/src/main/java/com/niramoy/bddrug/domain/IngredientSummary.java api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/IngredientSummaryReader.java \
  api/src/test/java/com/niramoy/bddrug/ItemHistoryTest.java api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/ReviewQueryCrossBatchIntegrationTest.java
git commit -m "feat(api): reviewer item gains partnerScope, openIssues, uncountedBy, carriedFrom and code sources (§7.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7b: Reviewer item — `otherPairs` across batches and each pair's review state and link (§5.6.2, §7.3)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/PairReviewReader.java`, `api/src/test/java/com/niramoy/bddrug/OtherPairsScaleIntegrationTest.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`, `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`, `api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ReviewQueryCrossBatchIntegrationTest.java`

**Interfaces:**
- Consumes: Task 5's `PairContent`, `PairReviewRule`; Task 6's `BatchPairs.computeFor`, `OtherProduct`, `Pair.with`, `OtherPair.with`.
- Produces: `PairReviewReader.forCodes(Collection<String> codes, String viewerEmail) → Mono<Map<String, List<PairReviewRule.Decision>>>` keyed `"{ddinterA}|{ddinterB}"` (one query; `mine` when the reviewer email equals the viewer's, case-insensitively; the email never leaves the method) and `PairReviewReader.key(String, String)`. `ReviewQueryPort.otherProducts(String batchId) → Mono<List<BatchPairs.OtherProduct>>` (latest current item of every product held outside this batch and not current in it, ordered by batch, trade name), `pairRowsTouching(Collection<String> mine, Collection<String> theirs)`, `pairReviews(Collection<String> codes, String viewerEmail)`. `ReviewItem` gains its last component `BatchPairs.OtherResult otherPairs`; every `batchPairs.pairs[]` and `otherPairs.pairs[]` carries `source` (`SourceLinks.pair(interactionId)`) and `pairReview` (`PairReviewRule.review`).

- [ ] **Step 1: Write the failing tests**

Append to `api/src/test/java/com/niramoy/bddrug/ReviewQueryCrossBatchIntegrationTest.java`, before the final `}`:

```java
    // ---- §7.3 otherPairs

    @Test void otherPairsCoverEveryOtherBatchSplitByThePartnersStatus() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.otherPairs.pairs[*].ddinterB").isEqualTo(List.of("DDInter20", "DDInter20", "DDInter1951", "DDInter351"))
            .jsonPath("$.data.otherPairs.pairs[*].severity").isEqualTo(List.of("major", "major", "moderate", "moderate"))
            .jsonPath("$.data.otherPairs.pairs[0].partners[*].conceptId").isEqualTo(List.of("A-1"))
            .jsonPath("$.data.otherPairs.pairs[0].partners[0].approved").isEqualTo(true)
            .jsonPath("$.data.otherPairs.pairs[0].partners[0].batchId").isEqualTo("K-OLD")
            .jsonPath("$.data.otherPairs.pairs[0].management")
                .isEqualTo("Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")
            .jsonPath("$.data.otherPairs.pairs[0].partnerBdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.otherPairs.pairs[2].partners[*].conceptId").isEqualTo(List.of("COMBO-1"))
            .jsonPath("$.data.otherPairs.pairs[3].partners[*].conceptId").isEqualTo(List.of("C-CAP"))
            .jsonPath("$.data.otherPairs.notChecked.length()").isEqualTo(1)
            .jsonPath("$.data.otherPairs.notChecked[0].partnerSubstance").isEqualTo("Domperidone")
            .jsonPath("$.data.otherPairs.notChecked[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.otherPairs.notChecked[0].side").isEqualTo("partner")
            .jsonPath("$.data.otherPairs.notChecked[0].partnerBdsId").isEqualTo("BDS-000004")
            .jsonPath("$.data.otherPairs.notChecked[0].partners[*].conceptId").isEqualTo(List.of("D-1"));
    }

    @Test void overFivePartnersSendsTheFirstFiveInBatchThenNameOrderAndTheTotal() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.otherPairs.pairs[1].partnerCount").isEqualTo(7)
            .jsonPath("$.data.otherPairs.pairs[1].partners.length()").isEqualTo(5)
            .jsonPath("$.data.otherPairs.pairs[1].partners[*].tradeName")
                .isEqualTo(List.of("Asprin Plus", "Aspra 2", "Aspra 3", "Aspra 4", "Aspra 5"))
            .jsonPath("$.data.otherPairs.pairs[1].partners[0].batchId").isEqualTo("K-NEW")
            .jsonPath("$.data.otherPairs.pairs[1].partners[0].approved").isEqualTo(false);
    }

    @Test void aRemovedProductAndAProductAlsoInThisBatchAreNeverPartners() {
        byte[] body = item("K-THIS", "W-1").returnResult().getResponseBody();
        String json = new String(body, StandardCharsets.UTF_8);
        String others = json.substring(json.indexOf("\"otherPairs\""));
        assertThat(others).doesNotContain("C-EYE", "Optimycin", "\"N-1\"", "W-2");
    }

    /** Review Focus 2: K-TWIN holds only N-1, which is in this batch; K-RM holds only a removed item. */
    @Test void otherBatchesCountsOnlyBatchesWithAPartner() {
        item("K-THIS", "W-1").jsonPath("$.data.otherPairs.otherBatches").isEqualTo(4);
    }

    @Test void everyPairCarriesItsReviewStateAndItsLinkOnlyForANumericInteractionId() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.otherPairs.pairs[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.otherPairs.pairs[0].pairReview.at").isEqualTo("2026-10-15T08:00:00Z")
            .jsonPath("$.data.otherPairs.pairs[0].pairReview.mine").isEqualTo(true)
            .jsonPath("$.data.otherPairs.pairs[0].source").isEmpty()           // interaction id IA-1 is not numeric
            .jsonPath("$.data.batchPairs.pairs[0].pairReview.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.batchPairs.pairs[0].pairReview.mine").isEqualTo(false);
    }
```

The seeded pair review stores the hash of the pair's current content (`PairContentTest` pins it), so its state is `reviewed`; its stored `content` (texts null) matters only for a `changed` pair's "What changed" table, and the hash alone decides the state.

Create `api/src/test/java/com/niramoy/bddrug/OtherPairsScaleIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.3 "Scale test": 40,000 held products across 20 batches; a record open answers within the §10.6 API p95 (300 ms). */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class OtherPairsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at)
              SELECT 'S-' || b, 'in_review', 2000, now() - b * interval '1 hour' FROM generate_series(1, 20) b;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              SELECT 'S-' || i, lpad(i::text, 9, '0'), 'Scale ' || i, 'Scale Pharma', 'Tablet', 'Scale 1 mg', 'BDC-000002', 'parsed'
              FROM generate_series(1, 40000) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'S-' || i, CASE i % 4 WHEN 0 THEN 'XM2ZT1' WHEN 1 THEN 'XM6XF8' WHEN 2 THEN 'XM7HA7' ELSE 'XM3R26' END, 'Scale'
              FROM generate_series(1, 40000) i;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'S-' || (1 + i % 20), 'DGDA-Drugs', 'S-' || i, CASE WHEN i % 5 = 0 THEN 'ok' ELSE 'pending' END, NULL,
                     now() - (1 + i % 20) * interval '1 hour'
              FROM generate_series(1, 40000) i;
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES ('S-0', 'in_review', 1, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES ('S-0', 'DGDA-Drugs', 'W-1', 'pending', NULL, now());
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note)
              SELECT 'S-0', 'W-1', s, 'ok', '' FROM unnest(ARRAY['dgda','substances','clinical','ddinter']) s;
            ANALYZE;
            """);
    }

    @Autowired WebTestClient web;

    @Test void aRecordOpenWithFortyThousandPartnersIsLinearAndFast() {
        internal(web).get().uri("/v1/review/batches/S-0/items/W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.otherPairs.otherBatches").isEqualTo(20)
            .jsonPath("$.data.otherPairs.pairs[?(@.ddinterB == 'DDInter20')].partnerCount").isEqualTo(List.of(2000, 8000))
            .jsonPath("$.data.otherPairs.pairs[0].partners.length()").isEqualTo(5)
            .jsonPath("$.data.otherPairs.notChecked[?(@.partners[0].approved == true)].partnerCount").isEqualTo(List.of(2000))
            .jsonPath("$.data.otherPairs.notChecked[?(@.partners[0].approved == false)].partnerCount").isEqualTo(List.of(8000));
        List<Long> ms = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            long t = System.nanoTime();
            internal(web).get().uri("/v1/review/batches/S-0/items/W-1").exchange().expectStatus().isOk().expectBody().returnResult();
            ms.add((System.nanoTime() - t) / 1_000_000);
        }
        Collections.sort(ms);
        assertThat(ms.get(18)).as("p95 of 20 record opens, ms").isLessThan(300L);
    }
}
```

The 10,000 aspirin brands split 2,000 approved (`i % 5 = 0` among `i % 4 = 0`: every 20th product) and 8,000 not approved; domperidone (`XM3R26`) has coverage `none`, so its 10,000 brands are two not-checked lines, one per partner status (2,000 and 8,000).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests ReviewQueryCrossBatchIntegrationTest --tests OtherPairsScaleIntegrationTest`
Expected: FAIL (`$.data.otherPairs` does not exist; `pairReview` is null).

- [ ] **Step 3: Write the pair-review reader**

Create `api/src/main/java/com/niramoy/bddrug/adapter/persistence/PairReviewReader.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Every senior pair decision (ops.pair_review) among a set of DDInter entries, in one query (§7.7: no N+1). The reviewer
 * email is read only to decide {@code mine} and never leaves this method.
 */
@Component
public class PairReviewReader {
    private final DatabaseClient db;
    private final ObjectMapper json;
    public PairReviewReader(DatabaseClient db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    /** ddinter_pair stores a < b in text order; so does ops.pair_review. */
    public static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }

    public Mono<Map<String, List<PairReviewRule.Decision>>> forCodes(Collection<String> codes, String viewerEmail) {
        if (codes.isEmpty()) return Mono.just(Map.of());
        String[] ids = codes.stream().distinct().toArray(String[]::new);
        String viewer = viewerEmail == null ? null : viewerEmail.strip();
        return db.sql("""
                SELECT id, ddinter_a, ddinter_b, decision, note, content_hash, content::text AS content, reviewer_email, decided_at
                FROM ops.pair_review WHERE ddinter_a = ANY(:ids) AND ddinter_b = ANY(:ids) ORDER BY decided_at, id""")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("ddinter_a", String.class) + "|" + r.get("ddinter_b", String.class),
                new PairReviewRule.Decision(r.get("id", Long.class), r.get("decision", String.class), r.get("note", String.class),
                    r.get("content_hash", String.class), content(r.get("content", String.class)),
                    r.get("decided_at", OffsetDateTime.class).toInstant(),
                    viewer != null && viewer.equalsIgnoreCase(r.get("reviewer_email", String.class)))))
            .all()
            .collect(HashMap<String, List<PairReviewRule.Decision>>::new,
                (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()))
            .map(m -> (Map<String, List<PairReviewRule.Decision>>) m);
    }

    /** The content as reviewed ({"severity", "actions", "interaction", "management"}); null when unreadable. */
    PairContent.Content content(String text) {
        try {
            JsonNode n = json.readTree(text);
            List<String> actions = new ArrayList<>();
            n.path("actions").forEach(a -> actions.add(a.asText()));
            return new PairContent.Content(n.path("severity").asText(null), actions,
                n.path("interaction").isTextual() ? n.get("interaction").asText() : null,
                n.path("management").isTextual() ? n.get("management").asText() : null);
        } catch (Exception e) {
            return null;
        }
    }
}
```

- [ ] **Step 4: Read the partners and wire the item**

In `api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java`, add (import `com.niramoy.bddrug.domain.PairReviewRule`):

```java
    /**
     * §7.3 otherPairs: the latest current item of every product held outside this batch (never one marked removed, never a
     * product with a current item in this batch), with its substances and DDInter codes, ordered by batch, then trade name.
     * {@code approved} is true when that item's review is ok (display status approved).
     */
    Mono<List<BatchPairs.OtherProduct>> otherProducts(String batchId);
    /** Stored pairs between one of {@code mine} and one of {@code theirs} (both orders); placeholder text removed. */
    Mono<List<BatchPairs.PairRow>> pairRowsTouching(Collection<String> mine, Collection<String> theirs);
    /** Every senior pair decision among {@code codes}, keyed "{a}|{b}" (PairReviewReader). */
    Mono<Map<String, List<PairReviewRule.Decision>>> pairReviews(Collection<String> codes, String viewerEmail);
```

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`:

1. Add a `PairReviewReader pairReviews` field, constructor parameter (`public R2dbcReviewQueryAdapter(DatabaseClient db, IngredientSummaryReader ingredientsReader, PairReviewReader pairReviews)`), and import `com.niramoy.bddrug.domain.PairReviewRule`.
2. Add:

```java
    private record OtherRow(String batchId, String conceptId, String tradeName, String route, boolean approved, String xmCode,
                            String ingredientName, String bdsId, String substance, String coverage) {}

    @Override public Mono<List<BatchPairs.OtherProduct>> otherProducts(String batchId) {
        return db.sql("""
                WITH latest AS (SELECT DISTINCT ON (concept_id) batch_id, concept_id, review, note FROM ops.batch_item
                                ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC)
                SELECT l.batch_id, l.concept_id, coalesce(bp.trade_name, l.concept_id) AS trade_name, cd.route,
                       l.review = 'ok' AS approved, bpi.xm_code, bpi.ingredient_name, xm.bds_id, s.preferred_name,
                       CASE WHEN xm.bds_id IS NULL THEN NULL ELSE coalesce(ic.coverage, 'not_run') END AS coverage
                FROM latest l
                LEFT JOIN curated.brand_product bp ON bp.concept_id = l.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE l.note IS DISTINCT FROM '%1$s' AND l.batch_id <> :b
                  AND NOT EXISTS (SELECT 1 FROM ops.batch_item t WHERE t.batch_id = :b AND t.concept_id = l.concept_id
                                  AND t.note IS DISTINCT FROM '%1$s')
                ORDER BY l.batch_id COLLATE "C", trade_name, l.concept_id COLLATE "C", bpi.xm_code COLLATE "C\"""".formatted(ReviewSql.REMOVED_NOTE))
            .bind("b", batchId)
            .map(r -> new OtherRow(r.get("batch_id", String.class), r.get("concept_id", String.class), r.get("trade_name", String.class),
                r.get("route", String.class), Boolean.TRUE.equals(r.get("approved", Boolean.class)), r.get("xm_code", String.class),
                r.get("ingredient_name", String.class), r.get("bds_id", String.class), r.get("preferred_name", String.class),
                r.get("coverage", String.class)))
            .all().collectList()
            .flatMap(rows -> {
                String[] bds = rows.stream().map(OtherRow::bdsId).filter(Objects::nonNull).distinct().toArray(String[]::new);
                return ddinterCodes(bds).map(codes -> {
                    Map<String, List<OtherRow>> byConcept = new LinkedHashMap<>();
                    for (OtherRow r : rows) byConcept.computeIfAbsent(r.conceptId(), k -> new ArrayList<>()).add(r);
                    List<BatchPairs.OtherProduct> out = new ArrayList<>();
                    for (List<OtherRow> group : byConcept.values()) {
                        OtherRow first = group.get(0);
                        List<BatchPairs.Substance> subs = new ArrayList<>();
                        Set<String> seen = new HashSet<>();
                        for (OtherRow r : group) {
                            if (r.xmCode() == null || (r.bdsId() != null && !seen.add(r.bdsId()))) continue;
                            subs.add(new BatchPairs.Substance(r.bdsId(), r.substance() != null ? r.substance() : r.ingredientName(),
                                r.coverage(), r.bdsId() == null ? List.of() : List.copyOf(codes.getOrDefault(r.bdsId(), List.of()))));
                        }
                        out.add(new BatchPairs.OtherProduct(first.conceptId(), first.tradeName(), first.batchId(), first.approved(),
                            first.route(), List.copyOf(subs)));
                    }
                    return List.copyOf(out);
                });
            });
    }

    /** The DDINTER codes of these substances, by bds_id (one query). */
    private Mono<Map<String, List<DdinterCode>>> ddinterCodes(String[] bds) {
        if (bds.length == 0) return Mono.just(Map.of());
        return db.sql("SELECT bds_id, code, route_scope FROM curated.substance_code WHERE system = 'DDINTER' AND bds_id = ANY(:ids)")
            .bind("ids", bds)
            .map(r -> Map.entry(r.get("bds_id", String.class), new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class))))
            .all().collect(HashMap<String, List<DdinterCode>>::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()))
            .map(m -> (Map<String, List<DdinterCode>>) m);
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairRowsTouching(Collection<String> mine, Collection<String> theirs) {
        if (mine.isEmpty() || theirs.isEmpty()) return Mono.just(List.of());
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management,
                       p.interaction_id
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE (p.ddinter_a = ANY(:mine) AND p.ddinter_b = ANY(:theirs)) OR (p.ddinter_b = ANY(:mine) AND p.ddinter_a = ANY(:theirs))""")
            .bind("mine", mine.stream().distinct().toArray(String[]::new)).bind("theirs", theirs.stream().distinct().toArray(String[]::new))
            .map(R2dbcReviewQueryAdapter::pairRow)
            .all().collectList();
    }

    static BatchPairs.PairRow pairRow(Readable r) {
        return new BatchPairs.PairRow(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class),
            r.get("partner_name_a", String.class), r.get("partner_name_b", String.class), r.get("severity", String.class),
            R2dbcSubstanceAdapter.list(r, "actions"), DdinterText.clean(r.get("interaction", String.class)),
            DdinterText.clean(r.get("management", String.class)), r.get("interaction_id", String.class));
    }

    @Override public Mono<Map<String, List<PairReviewRule.Decision>>> pairReviews(Collection<String> codes, String viewerEmail) {
        return pairReviews.forCodes(codes, viewerEmail);
    }
```

and make `pairRows` map rows with `.map(R2dbcReviewQueryAdapter::pairRow)` (its `SELECT` already lists `p.interaction_id` since Task 6).

In `api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java`, change the header's last line to

```java
                         List<ItemHistory.Entry> history, ItemHistory.Reopen reopen, List<OpenIssue> openIssues,
                         BatchPairs.OtherResult otherPairs) {
```

In `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`:

1. Add imports `com.niramoy.bddrug.domain.PairContent`, `com.niramoy.bddrug.domain.PairReviewRule`, `com.niramoy.bddrug.domain.SourceLinks`.
2. Replace the `return Mono.zip(port.ingredients(…), pairs(batchId, conceptId), port.snapshots(…), port.fullRuns(batchId))` chain in `item(…)` with:

```java
                    return Mono.zip(port.ingredients(conceptId, d.bdcId(), route), pairs(batchId, conceptId), port.snapshots(batchId, conceptId),
                            port.fullRuns(batchId))
                        .flatMap(t -> Mono.zip(stages(me, t.getT2().products(), conceptId),
                                crossBatch(batchId, conceptId, t.getT2(), viewerEmail))
                            .map(u -> {
                                List<Instant> runs = t.getT4().isEmpty() ? List.of(batch.runAt()) : t.getT4();
                                List<ItemHistory.Decision> decisions = me.facts().decisions().stream().map(x -> new ItemHistory.Decision(
                                    x.id(), x.decision(), x.note(), x.reviewerRole(), x.decidedAt(), isMine(x.reviewerEmail(), viewerEmail))).toList();
                                ItemHistory.Result history = ItemHistory.build(runs, t.getT3(), decisions, me.facts().extractedAt());
                                List<ReviewItem.OpenIssue> openIssues = ApprovalRule.openIssues(me.facts().decisions(), me.facts().extractedAt())
                                    .stream().map(x -> new ReviewItem.OpenIssue(x.reviewerRole(), x.decidedAt(), x.note(),
                                        isMine(x.reviewerEmail(), viewerEmail))).toList();
                                return new ReviewItem(batchId, conceptId, me.index(), all.size(), me.displayStatus(), me.facts().review(),
                                    me.version(), new ReviewItem.BatchInfo(batch.runAt(), all.size(), batch.status()), d.brand(),
                                    d.dgdaIngredients(), d.clinical(), t.getT1(), u.getT1(), u.getT2().batch(), d.sourceJson(),
                                    sourceUrl(conceptId), history.history(), history.reopen(), openIssues, u.getT2().other());
                            }));
```

3. Add:

```java
    /** batchPairs and otherPairs with each pair's link and senior-review state, from one pair-review query. */
    private record Cross(BatchPairs.Result batch, BatchPairs.OtherResult other) {}

    private Mono<Cross> crossBatch(String batchId, String conceptId, PairsAndProducts inBatch, String viewerEmail) {
        BatchPairs.Product me = inBatch.products().stream().filter(p -> p.conceptId().equals(conceptId)).findFirst().orElse(null);
        if (me == null) return Mono.just(new Cross(inBatch.result(), new BatchPairs.OtherResult(List.of(), List.of(), 0)));
        Set<String> mine = new HashSet<>();
        for (BatchPairs.Substance s : me.substances()) for (DdinterCode c : s.codes()) mine.add(c.code());
        return port.otherProducts(batchId).flatMap(partners -> {
            Set<String> theirs = new HashSet<>();
            for (BatchPairs.OtherProduct q : partners)
                for (BatchPairs.Substance s : q.substances()) for (DdinterCode c : s.codes()) theirs.add(c.code());
            Set<String> every = new HashSet<>(mine);
            every.addAll(theirs);
            for (BatchPairs.Pair p : inBatch.result().pairs()) { every.add(p.ddinterA()); every.add(p.ddinterB()); }
            return Mono.zip(port.pairRowsTouching(mine, theirs), port.entryNames(every), port.pairReviews(every, viewerEmail))
                .map(t -> {
                    BatchPairs.OtherResult other = BatchPairs.computeFor(me, partners, t.getT1(), t.getT2().keySet());
                    Map<String, List<PairReviewRule.Decision>> reviews = t.getT3();
                    List<BatchPairs.Pair> batchPairs = inBatch.result().pairs().stream().map(p -> p.with(
                        SourceLinks.pair(p.interactionId()).orElse(null),
                        reviewOf(reviews, p.ddinterA(), p.ddinterB(), p.severity(), p.actions(), p.interaction(), p.management()))).toList();
                    List<BatchPairs.OtherPair> otherPairs = other.pairs().stream().map(p -> p.with(
                        SourceLinks.pair(p.interactionId()).orElse(null),
                        reviewOf(reviews, p.ddinterA(), p.ddinterB(), p.severity(), p.actions(), p.interaction(), p.management()))).toList();
                    return new Cross(new BatchPairs.Result(inBatch.result().totalBatchPairs(), batchPairs, inBatch.result().notChecked()),
                        new BatchPairs.OtherResult(otherPairs, other.notChecked(), other.otherBatches()));
                });
        });
    }

    static PairReviewRule.Review reviewOf(Map<String, List<PairReviewRule.Decision>> reviews, String a, String b, String severity,
                                          List<String> actions, String interaction, String management) {
        String hash = PairContent.hash(a, b, new PairContent.Content(severity, actions, interaction, management));
        return PairReviewRule.review(reviews.getOrDefault(a + "|" + b, List.of()), hash);
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests ReviewQueryCrossBatchIntegrationTest --tests OtherPairsScaleIntegrationTest --tests ReviewQueryIntegrationTest`
Expected: PASS. If the scale test's p95 fails, run `EXPLAIN ANALYZE` on the `otherProducts` SQL against the seeded container (the `latest` CTE must use `batch_item_concept_latest_idx`); do not loosen the 300 ms bound.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/adapter/persistence/PairReviewReader.java \
  api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java \
  api/src/test/java/com/niramoy/bddrug/ReviewQueryCrossBatchIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/OtherPairsScaleIntegrationTest.java
git commit -m "feat(api): reviewer item lists pairs with medicines in other batches, and each pair's link and review state (§5.6.2, §7.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8a: Senior review reads — the pair queue, the substances list and the substance page (§5.17, §7.7)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/PairQueue.java`, `api/src/main/java/com/niramoy/bddrug/domain/SeniorViews.java`, `api/src/main/java/com/niramoy/bddrug/application/port/SeniorReviewPort.java`, `api/src/main/java/com/niramoy/bddrug/application/SeniorReviewService.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSeniorReviewAdapter.java`, `api/src/main/java/com/niramoy/bddrug/presentation/SeniorReviewController.java`
- Test: `api/src/test/java/com/niramoy/bddrug/PairQueueTest.java`, `api/src/test/java/com/niramoy/bddrug/PairQueueIntegrationTest.java`

**Interfaces:**
- Consumes: Task 5's `PairContent`, `PairReviewRule`; Task 4's `SourceLinks`; Task 7a's `IngredientSummaryReader.codesSql`, `entries`, `code(Readable)`, `NAME_RANK`; Task 7b's `PairReviewReader`, `R2dbcReviewQueryAdapter.pairRow`; `RouteRule`, `ApprovalRule.displayStatus`, `ReviewQueryService.number`, `ReviewSql.REMOVED_NOTE`, `ClinicalDrugReader.plain`.
- Produces:
  - `PairQueue.Entry(String ddinterA, String ddinterB, String severity, String bdsA, String nameA, String bdsB, String nameB, boolean applies, String state)`; `PairQueue.SHOWS = [todo, changed, issue, reviewed, all]`, `SCOPES = [all, applies]`, `SEVERITIES = [major, moderate, minor, unknown]`; `inShow`, `inScope`, `severityOf`, `counts(entries, scope)`, `select(entries, show, scope, severity)`, `ORDER`.
  - `SeniorViews.PairView(ddinterA, ddinterB, Side substanceA, Side substanceB, EntryRef entryA, EntryRef entryB, severity, actions, interaction, management, SourceLinks.Source source, boolean applies, List<Brand> brands, BrandCounts brandCounts, PairReviewRule.Review review, List<PairReviewRule.Change> changes, List<PairReviewRule.HistoryEntry> history, PairVersion version)` with `Side(bdsId, name)`, `EntryRef(name, routeScope, SourceLinks.Source source)`, `Brand(conceptId, tradeName, batchId, displayStatus, side)`, `BrandCounts(a, b, batches)`, `PairVersion(contentHash, Long lastPairReviewId)`; `PairsPage(total, counts, items)`; `SubstanceRow(bdsId, name, brands, batches, pairsToReview, majorPairsToReview)`; `SubstancesPage(total, items)`; `SubstanceDetail(bdsId, name, names, codes, coverage, entries, brands, PairList pairs)` with `Name(name, type, source)`, `BrandRow(conceptId, tradeName, batchId, displayStatus, Clinical clinicalDrug, strengthText, List<Chosen> chosen, String reason)`, `Clinical(bdcId, displayName, route)`, `Chosen(ddinterId, routeScope, routeAssumed)`, `PairList(total, items)`; `PairOutcome(ddinterA, ddinterB, review, version, replayed)` (used by Task 8b).
  - `GET /v1/review/pairs?show=&pairs=&severity=&page=&size=` → `PairsPage`; `GET /v1/review/substances?q=&page=&size=` → `SubstancesPage`; `GET /v1/review/substances/{bdsId}?pairs=&severity=&page=&size=` → `SubstanceDetail` (404 `field=bdsId` when not held). All need the token; `X-Viewer-Email` sets `mine`. Defaults: `show=todo`, `pairs=all`, `page=0`, `size=50` (1–100); an unknown value is 400 with its field; a page past the end answers no items and the true total.
  - "Held": the latest current item of a product (`ReviewSql.statusOf` semantics), never one marked removed. Brands per pair side are the held products whose RouteRule choice includes that side's entry: at most 10 per side, by batch, then trade name; `brandCounts` are the full totals.

- [ ] **Step 1: Write the failing unit test**

Create `api/src/test/java/com/niramoy/bddrug/PairQueueTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairQueue;
import com.niramoy.bddrug.domain.PairQueue.Entry;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.17.1: filters, counts that follow the scope, and the order (severity, applying first, state, names). */
class PairQueueTest {
    static Entry e(String a, String b, String severity, String nameA, String nameB, boolean applies, String state) {
        return new Entry(a, b, severity, "BDS-" + a, nameA, "BDS-" + b, nameB, applies, state);
    }

    static final List<Entry> ALL = List.of(
        e("DDInter1951", "DDInter351", "moderate", "Warfarin", "Chloramphenicol", false, "not_reviewed"),
        e("DDInter14", "DDInter1951", "moderate", "Acetaminophen", "Warfarin", true, "reviewed"),
        e("DDInter1951", "DDInter20", "major", "Warfarin", "Aspirin", true, "changed"),
        e("DDInter20", "DDInter83", "moderate", "Aspirin", "Amoxicillin", true, "issue"),
        e("DDInter1951", "DDInter5", "weird", "Warfarin", "Alpha", true, "not_reviewed"),
        e("DDInter1951", "DDInter999", "minor", "Warfarin", "Herb", true, "not_reviewed"));

    @Test void theOrderIsSeverityThenApplyingThenStateThenNames() {
        assertThat(PairQueue.select(ALL, "all", "all", null)).extracting(Entry::ddinterB).containsExactly(
            "DDInter20", "DDInter83", "DDInter1951", "DDInter351", "DDInter999", "DDInter5");
    }

    @Test void todoIsNotReviewedAndChanged() {
        assertThat(PairQueue.select(ALL, "todo", "all", null)).extracting(Entry::ddinterB)
            .containsExactly("DDInter20", "DDInter351", "DDInter999", "DDInter5");
        assertThat(PairQueue.select(ALL, "issue", "all", null)).extracting(Entry::ddinterB).containsExactly("DDInter83");
        assertThat(PairQueue.select(ALL, "reviewed", "all", null)).extracting(Entry::ddinterB).containsExactly("DDInter1951");
        assertThat(PairQueue.select(ALL, "changed", "all", null)).extracting(Entry::ddinterB).containsExactly("DDInter20");
    }

    @Test void theScopeHidesNonApplyingPairsAndTheCountsFollowIt() {
        assertThat(PairQueue.select(ALL, "all", "applies", null)).extracting(Entry::ddinterB).doesNotContain("DDInter351");
        assertThat(PairQueue.counts(ALL, "all")).containsExactly(java.util.Map.entry("todo", 4), java.util.Map.entry("changed", 1),
            java.util.Map.entry("issue", 1), java.util.Map.entry("reviewed", 1), java.util.Map.entry("all", 6));
        assertThat(PairQueue.counts(ALL, "applies").get("todo")).isEqualTo(3);
        assertThat(PairQueue.counts(ALL, "applies").get("all")).isEqualTo(5);
    }

    @Test void anyOtherSeverityIsUnknownAndNeverMinor() {
        assertThat(PairQueue.select(ALL, "all", "all", "unknown")).extracting(Entry::ddinterB).containsExactly("DDInter5");
        assertThat(PairQueue.select(ALL, "all", "all", "minor")).extracting(Entry::ddinterB).containsExactly("DDInter999");
        assertThat(PairQueue.severityOf("weird")).isEqualTo("unknown");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests PairQueueTest`
Expected: FAIL to compile (`PairQueue` does not exist).

- [ ] **Step 3: Write `PairQueue` and the views**

Create `api/src/main/java/com/niramoy/bddrug/domain/PairQueue.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Spec §5.17.1, pure: which pairs a filter shows, the counts per filter (they follow the scope, not the severity), and the
 * order: severity rank (Major, Moderate, Minor, unknown), applying before non-applying, state (changed, issue, not
 * reviewed, reviewed), then substance A's name, then substance B's name.
 */
public final class PairQueue {
    private PairQueue() {}

    public static final List<String> SHOWS = List.of("todo", "changed", "issue", "reviewed", "all");
    public static final List<String> SCOPES = List.of("all", "applies");
    public static final List<String> SEVERITIES = List.of("major", "moderate", "minor", "unknown");
    private static final List<String> STATE_ORDER = List.of("changed", "issue", "not_reviewed", "reviewed");

    public record Entry(String ddinterA, String ddinterB, String severity, String bdsA, String nameA, String bdsB, String nameB,
                        boolean applies, String state) {
        public String key() { return ddinterA + "|" + ddinterB; }
    }

    /** Any value other than major, moderate or minor is unknown (never merged with Minor). */
    public static String severityOf(String severity) {
        return "major".equals(severity) || "moderate".equals(severity) || "minor".equals(severity) ? severity : "unknown";
    }

    public static boolean inShow(String show, String state) {
        return switch (show) {
            case "todo" -> "not_reviewed".equals(state) || "changed".equals(state);
            case "all" -> true;
            default -> show.equals(state);
        };
    }

    public static boolean inScope(String scope, Entry e) { return !"applies".equals(scope) || e.applies(); }

    public static final Comparator<Entry> ORDER = Comparator
        .comparingInt((Entry e) -> SEVERITIES.indexOf(severityOf(e.severity())))
        .thenComparing(e -> !e.applies())
        .thenComparingInt(e -> STATE_ORDER.indexOf(e.state()))
        .thenComparing(e -> e.nameA().toLowerCase(Locale.ROOT))
        .thenComparing(e -> e.nameB().toLowerCase(Locale.ROOT))
        .thenComparing(Entry::ddinterA).thenComparing(Entry::ddinterB);

    public static Map<String, Integer> counts(List<Entry> entries, String scope) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (String show : SHOWS)
            out.put(show, (int) entries.stream().filter(e -> inScope(scope, e) && inShow(show, e.state())).count());
        return out;
    }

    public static List<Entry> select(List<Entry> entries, String show, String scope, String severity) {
        return entries.stream().filter(e -> inScope(scope, e)).filter(e -> inShow(show, e.state()))
            .filter(e -> severity == null || severityOf(e.severity()).equals(severity)).sorted(ORDER).toList();
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/domain/SeniorViews.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.List;
import java.util.Map;

/** Response shapes of the senior review endpoints (spec §7.7). None carries an email. */
public final class SeniorViews {
    private SeniorViews() {}

    public record Side(String bdsId, String name) {}
    /** One side's DDInter entry; {@code source} is its DDInter link (§5.17.2 item 2: "Each id carries its DDInter SourceLink"). */
    public record EntryRef(String name, String routeScope, SourceLinks.Source source) {}
    public record Brand(String conceptId, String tradeName, String batchId, String displayStatus, String side) {}
    public record BrandCounts(int a, int b, int batches) {}
    public record PairVersion(String contentHash, Long lastPairReviewId) {}
    public record PairView(String ddinterA, String ddinterB, Side substanceA, Side substanceB, EntryRef entryA, EntryRef entryB,
                           String severity, List<String> actions, String interaction, String management, SourceLinks.Source source,
                           boolean applies, List<Brand> brands, BrandCounts brandCounts, PairReviewRule.Review review,
                           List<PairReviewRule.Change> changes, List<PairReviewRule.HistoryEntry> history, PairVersion version) {}
    public record PairsPage(int total, Map<String, Integer> counts, List<PairView> items) {}

    public record SubstanceRow(String bdsId, String name, int brands, int batches, int pairsToReview, int majorPairsToReview) {}
    public record SubstancesPage(int total, List<SubstanceRow> items) {}

    public record Name(String name, String type, String source) {}
    public record Clinical(String bdcId, String displayName, String route) {}
    public record Chosen(String ddinterId, String routeScope, boolean routeAssumed) {}
    /** {@code reason}: no_data, not_run or no_route when nothing is chosen; null otherwise. */
    public record BrandRow(String conceptId, String tradeName, String batchId, String displayStatus, Clinical clinicalDrug,
                           String strengthText, List<Chosen> chosen, String reason) {}
    public record PairList(int total, List<PairView> items) {}
    public record SubstanceDetail(String bdsId, String name, List<Name> names, List<IngredientSummary.Code> codes, String coverage,
                                  List<IngredientSummary.Entry> entries, List<BrandRow> brands, PairList pairs) {}

    public record PairOutcome(String ddinterA, String ddinterB, PairReviewRule.Review review, PairVersion version, boolean replayed) {}
}
```

- [ ] **Step 4: Run the unit test**

Run: `cd api && ./gradlew test --no-daemon --tests PairQueueTest`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

Create `api/src/test/java/com/niramoy/bddrug/PairQueueIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §5.17, §7.7 reads (§11.3 PairQueueIntegrationTest). Held: W-1 Warin and N-1 Napa (approved), A-1 Ecosprin, C-EYE
 * Optimycin (eye drop) and D-1 Motigut, all in Q-A. C-CAP's latest item is removed (Q-RM), so the systemic DDInter351 pairs apply to no
 * held product. Pairs between held substances: DDInter1951/DDInter20 (major), DDInter14/DDInter1951 and
 * DDInter1951/DDInter351 (moderate; the second does not apply). The tests that write run last (@Order).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PairQueueIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org";
    static final int LAST = Integer.MAX_VALUE - 1;

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('Q-A','in_review',5, now() - interval '2 hour'), ('Q-RM','in_review',0, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('Q-A','DGDA-Drugs','W-1','ok',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','A-1','pending',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','C-EYE','pending',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','D-1','pending',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','N-1','ok',NULL, now() - interval '2 hour'),
             ('Q-RM','DGDA-Drugs','C-CAP','ok','removed from batch file', now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('Q-A','W-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '90 minute'),
             ('Q-A','N-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '90 minute');
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.BodyContentSpec ok(String uri) {
        return internal(web).get().uri(uri).header("X-Viewer-Email", SENIOR).exchange().expectStatus().isOk().expectBody();
    }

    @Test void everySeniorReadNeedsTheToken() {
        for (String uri : List.of("/v1/review/pairs", "/v1/review/substances", "/v1/review/substances/BDS-000001"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized();
    }

    /** PO D3(b): every stored pair between held substances, the non-applying one after the applying pairs of its severity. */
    @Test void everyStoredPairBetweenHeldSubstancesIsQueuedByDefault() {
        ok("/v1/review/pairs")
            .jsonPath("$.data.total").isEqualTo(3)
            .jsonPath("$.data.counts.todo").isEqualTo(3)
            .jsonPath("$.data.counts.reviewed").isEqualTo(0)
            .jsonPath("$.data.counts.all").isEqualTo(3)
            .jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter1951", "DDInter14", "DDInter1951"))
            .jsonPath("$.data.items[*].ddinterB").isEqualTo(List.of("DDInter20", "DDInter1951", "DDInter351"))
            .jsonPath("$.data.items[*].applies").isEqualTo(List.of(true, true, false))
            .jsonPath("$.data.items[0].substanceA.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.items[0].substanceB.name").isEqualTo("Aspirin")
            .jsonPath("$.data.items[0].entryA.name").isEqualTo("Warfarin")
            .jsonPath("$.data.items[0].entryA.routeScope").isEqualTo("systemic")
            .jsonPath("$.data.items[0].entryA.source.url").isEqualTo("https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/")
            .jsonPath("$.data.items[0].entryB.name").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.items[0].management").isEqualTo("Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")
            .jsonPath("$.data.items[0].actions").isEqualTo(List.of("Monitor", "Avoid"))
            .jsonPath("$.data.items[0].source").isEmpty()
            .jsonPath("$.data.items[0].review.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.items[0].version.contentHash").isEqualTo("b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043")
            .jsonPath("$.data.items[0].version.lastPairReviewId").isEmpty()
            .jsonPath("$.data.items[1].version.contentHash").isEqualTo("7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f");
    }

    @Test void brandsAreTheHeldProductsThatChooseEachSide() {
        ok("/v1/review/pairs")
            .jsonPath("$.data.items[0].brands[*].conceptId").isEqualTo(List.of("W-1", "A-1"))
            .jsonPath("$.data.items[0].brands[*].side").isEqualTo(List.of("a", "b"))
            .jsonPath("$.data.items[0].brands[0].displayStatus").isEqualTo("approved")
            .jsonPath("$.data.items[0].brands[1].displayStatus").isEqualTo("pending")
            .jsonPath("$.data.items[0].brandCounts.a").isEqualTo(1)
            .jsonPath("$.data.items[0].brandCounts.b").isEqualTo(1)
            .jsonPath("$.data.items[0].brandCounts.batches").isEqualTo(1)
            .jsonPath("$.data.items[2].brands[*].conceptId").isEqualTo(List.of("W-1"))   // nobody held chooses DDInter351
            .jsonPath("$.data.items[2].brandCounts.b").isEqualTo(0);
    }

    @Test void theScopeAndTheSeverityFilterNarrowTheQueue() {
        ok("/v1/review/pairs?pairs=applies").jsonPath("$.data.total").isEqualTo(2).jsonPath("$.data.counts.all").isEqualTo(2);
        ok("/v1/review/pairs?severity=major").jsonPath("$.data.total").isEqualTo(1).jsonPath("$.data.counts.all").isEqualTo(3);
        ok("/v1/review/pairs?severity=unknown").jsonPath("$.data.total").isEqualTo(0).jsonPath("$.data.items.length()").isEqualTo(0);
        ok("/v1/review/pairs?show=all&size=1&page=1").jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter14"));
    }

    /** Review Focus 5 (API side). */
    @Test void aPagePastTheEndIsEmptyWithTheTrueTotal() {
        ok("/v1/review/pairs?page=40").jsonPath("$.data.total").isEqualTo(3).jsonPath("$.data.items.length()").isEqualTo(0);
    }

    @Test void unknownParametersAre400WithTheirField() {
        for (String[] t : new String[][]{{"/v1/review/pairs?show=bogus", "show"}, {"/v1/review/pairs?pairs=some", "pairs"},
                {"/v1/review/pairs?severity=urgent", "severity"}, {"/v1/review/pairs?page=-1", "page"}, {"/v1/review/pairs?size=101", "size"},
                {"/v1/review/substances?q=" + "x".repeat(101), "q"}, {"/v1/review/substances/BDS-000001?pairs=x", "pairs"}})
            internal(web).get().uri(t[0]).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(t[1]);
    }

    @Test void substancesAreOrderedByPairsToReview() {
        ok("/v1/review/substances")
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.items[*].bdsId").isEqualTo(List.of("BDS-000001", "BDS-000005", "BDS-000002", "BDS-000003", "BDS-000004"))
            .jsonPath("$.data.items[0].pairsToReview").isEqualTo(3)
            .jsonPath("$.data.items[0].majorPairsToReview").isEqualTo(1)
            .jsonPath("$.data.items[0].brands").isEqualTo(1)
            .jsonPath("$.data.items[0].batches").isEqualTo(1)
            .jsonPath("$.data.items[4].pairsToReview").isEqualTo(0);
        ok("/v1/review/substances?q=WAR").jsonPath("$.data.items[*].bdsId").isEqualTo(List.of("BDS-000001"));
        ok("/v1/review/substances?q=bds-000005").jsonPath("$.data.items[*].name").isEqualTo(List.of("Acetaminophen"));
        ok("/v1/review/substances?q=%25").jsonPath("$.data.total").isEqualTo(0);
    }

    @Test void theSubstancePageListsBrandsCodesEntriesAndPairs() {
        byte[] body = ok("/v1/review/substances/BDS-000003")
            .jsonPath("$.data.name").isEqualTo("Chloramphenicol")
            .jsonPath("$.data.coverage").isEqualTo("full")
            .jsonPath("$.data.brands[*].conceptId").isEqualTo(List.of("C-EYE"))
            .jsonPath("$.data.brands[0].batchId").isEqualTo("Q-A")
            .jsonPath("$.data.brands[0].displayStatus").isEqualTo("pending")
            .jsonPath("$.data.brands[0].clinicalDrug.route").isEqualTo("ophthalmic")
            .jsonPath("$.data.brands[0].strengthText").isEqualTo("0.5 %")
            .jsonPath("$.data.brands[0].chosen[*].ddinterId").isEqualTo(List.of("DDInter352"))
            .jsonPath("$.data.brands[0].reason").isEmpty()
            .jsonPath("$.data.codes[*].system").isEqualTo(List.of("ICD11_XM", "DDINTER", "DDINTER", "DDINTER"))
            .jsonPath("$.data.codes[1].source.url").isEqualTo("https://ddinter2.scbdd.com/server/drug-detail/DDInter351/")
            .jsonPath("$.data.entries[*].ddinterId").isEqualTo(List.of("DDInter351", "DDInter352", "DDInter353"))
            .jsonPath("$.data.entries[0].counts.moderate").isEqualTo(1)
            .jsonPath("$.data.names[*].type").isEqualTo(List.of("icd11", "ddinter"))
            .jsonPath("$.data.pairs.total").isEqualTo(1)
            .jsonPath("$.data.pairs.items[0].applies").isEqualTo(false)
            .returnResult().getResponseBody();
        assertThat(new String(body, StandardCharsets.UTF_8)).doesNotContain("C-CAP", "@");
        ok("/v1/review/substances/BDS-000003?pairs=applies").jsonPath("$.data.pairs.total").isEqualTo(0);
    }

    @Test void aNoDataSubstanceSaysWhyItsBrandsAreNotChecked() {
        ok("/v1/review/substances/BDS-000004")
            .jsonPath("$.data.coverage").isEqualTo("none")
            .jsonPath("$.data.brands[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.brands[0].chosen.length()").isEqualTo(0)
            .jsonPath("$.data.pairs.total").isEqualTo(0);
    }

    @Test void aSubstanceWeDoNotHoldIs404() {
        internal(web).get().uri("/v1/review/substances/BDS-404").exchange().expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("bdsId");
    }

    // ---- writes, last

    /** §11.3 changedPairReturnsToQueue (queue side; Task 9 adds the public checker's not_reviewed). */
    @Test @Order(LAST) void changedPairReturnsToQueue() throws Exception {
        String items = text(pg, "SELECT string_agg(batch_id || concept_id || review || extracted_at, ',' ORDER BY batch_id, concept_id) FROM ops.batch_item");
        exec(pg, """
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
              VALUES ('DDInter14', 'DDInter1951', 'reviewed', '', '7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f',
                      '{"severity":"moderate","actions":[],"interaction":null,"management":null}', 'senior.reviewer@example.org', 'senior');
            """);
        ok("/v1/review/pairs?show=reviewed").jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter14"))
            .jsonPath("$.data.items[0].review.mine").isEqualTo(true);
        exec(pg, "UPDATE curated.ddinter_pair SET severity = 'major' WHERE ddinter_a = 'DDInter14' AND ddinter_b = 'DDInter1951'");
        ok("/v1/review/pairs?show=changed")
            .jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter14"))
            .jsonPath("$.data.items[0].review.state").isEqualTo("changed")
            .jsonPath("$.data.items[0].changes[0].field").isEqualTo("Severity")
            .jsonPath("$.data.items[0].changes[0].atReview").isEqualTo("moderate")
            .jsonPath("$.data.items[0].changes[0].now").isEqualTo("major")
            .jsonPath("$.data.items[0].history[0].changedAfter").isEqualTo(true);
        ok("/v1/review/pairs").jsonPath("$.data.counts.changed").isEqualTo(1).jsonPath("$.data.counts.todo").isEqualTo(3);
        assertThat(text(pg, "SELECT string_agg(batch_id || concept_id || review || extracted_at, ',' ORDER BY batch_id, concept_id) FROM ops.batch_item"))
            .isEqualTo(items);   // no record re-opened (S8)
    }

    @Test @Order(LAST) void aPairIssueIsListedWithItsNoteAndStaysAnIssue() throws Exception {
        exec(pg, """
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
              VALUES ('DDInter1951', 'DDInter351', 'issue', 'text says avoid; severity is moderate',
                      '0000000000000000000000000000000000000000000000000000000000000000', '{}', 'other.senior@example.org', 'senior');
            """);
        ok("/v1/review/pairs?show=issue")
            .jsonPath("$.data.items[*].ddinterB").isEqualTo(List.of("DDInter351"))
            .jsonPath("$.data.items[0].review.state").isEqualTo("issue")
            .jsonPath("$.data.items[0].review.note").isEqualTo("text says avoid; severity is moderate")
            .jsonPath("$.data.items[0].review.mine").isEqualTo(false)
            .jsonPath("$.data.items[0].interaction").isEqualTo("Chloramphenicol may increase the serum concentration of warfarin.");
    }
}
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests PairQueueIntegrationTest`
Expected: FAIL: every request is 404 (`No static resource v1/review/pairs`).

- [ ] **Step 7: Write the port, the adapter, the service and the controller**

Create `api/src/main/java/com/niramoy/bddrug/application/port/SeniorReviewPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SeniorViews;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/** What the senior review service reads (§7.7). "Held" = the latest current item of a product, never one marked removed. */
public interface SeniorReviewPort {
    /** One row per held product and DGDA ingredient (a product with none has one row with null ingredient columns). */
    record HeldRow(String conceptId, String batchId, String tradeName, String review, Instant extractedAt, String bdcId,
                   String clinicalName, String route, String xmCode, String ingredientName, String bdsId, String substance,
                   String coverage) {}
    record Code(String bdsId, String code, String routeScope) {}
    record PairLite(String ddinterA, String ddinterB, String severity) {}
    record EntryInfo(String name, Instant fetchedAt) {}
    record SubstanceFacts(String bdsId, String name, List<SeniorViews.Name> names, List<IngredientSummary.Code> codes,
                          String coverage, List<IngredientSummary.Entry> entries) {}

    /** Held products in batch, trade-name order. */
    Mono<List<HeldRow>> held();
    Mono<List<Code>> ddinterCodes(Collection<String> bdsIds);
    /** Every stored pair whose two sides are both in {@code codes}: ids and severity only. */
    Mono<List<PairLite>> pairsAmong(Collection<String> codes);
    /** Stored pairs with ddinter_a in {@code as} and ddinter_b in {@code bs}, with their (cleaned) texts. */
    Mono<List<BatchPairs.PairRow>> pairDetails(Collection<String> as, Collection<String> bs);
    Mono<Map<String, List<PairReviewRule.Decision>>> reviews(Collection<String> codes, String viewerEmail);
    Mono<Map<String, EntryInfo>> entries(Collection<String> codes);
    /** Decisions (no emails) of these items, keyed "{batchId}|{conceptId}", oldest first. */
    Mono<Map<String, List<ReviewDecision>>> decisions(Collection<String> itemKeys);
    /** Empty when the substance does not exist. */
    Mono<SubstanceFacts> substance(String bdsId);
    /** The strength text of {@code bdsId} in each clinical drug, by bdc_id. */
    Mono<Map<String, String>> strengths(Collection<String> bdcIds, String bdsId);
}
```

Create `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSeniorReviewAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.SeniorReviewPort;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SeniorViews;
import com.niramoy.bddrug.domain.SourceLinks;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Senior review SQL (§7.7). Held products come from the latest current item only (statusOf semantics, PO D7). */
@Component
public class R2dbcSeniorReviewAdapter implements SeniorReviewPort {
    static final String LATEST = "latest AS (SELECT DISTINCT ON (concept_id) batch_id, concept_id, review, note, extracted_at "
        + "FROM ops.batch_item ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC)";

    protected final DatabaseClient db;
    protected final IngredientSummaryReader ingredients;
    protected final PairReviewReader pairReviews;
    public R2dbcSeniorReviewAdapter(DatabaseClient db, IngredientSummaryReader ingredients, PairReviewReader pairReviews) {
        this.db = db;
        this.ingredients = ingredients;
        this.pairReviews = pairReviews;
    }

    private static Instant at(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
    private static String[] arr(Collection<String> c) { return c.stream().distinct().toArray(String[]::new); }

    @Override public Mono<List<HeldRow>> held() {
        return db.sql("WITH " + LATEST + """
                SELECT l.batch_id, l.concept_id, coalesce(bp.trade_name, l.concept_id) AS trade_name, l.review, l.extracted_at,
                       bp.bdc_id, cd.display_name, cd.route, bpi.xm_code, bpi.ingredient_name, xm.bds_id, s.preferred_name,
                       CASE WHEN xm.bds_id IS NULL THEN NULL ELSE coalesce(ic.coverage, 'not_run') END AS coverage
                FROM latest l
                LEFT JOIN curated.brand_product bp ON bp.concept_id = l.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE l.note IS DISTINCT FROM '%s'
                ORDER BY l.batch_id COLLATE "C", trade_name, l.concept_id COLLATE "C", bpi.xm_code COLLATE "C\"""".formatted(ReviewSql.REMOVED_NOTE))
            .map(r -> new HeldRow(r.get("concept_id", String.class), r.get("batch_id", String.class), r.get("trade_name", String.class),
                r.get("review", String.class), at(r.get("extracted_at", OffsetDateTime.class)), r.get("bdc_id", String.class),
                r.get("display_name", String.class), r.get("route", String.class), r.get("xm_code", String.class),
                r.get("ingredient_name", String.class), r.get("bds_id", String.class), r.get("preferred_name", String.class),
                r.get("coverage", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<Code>> ddinterCodes(Collection<String> bdsIds) {
        if (bdsIds.isEmpty()) return Mono.just(List.of());
        return db.sql("SELECT bds_id, code, route_scope FROM curated.substance_code WHERE system = 'DDINTER' AND bds_id = ANY(:ids) " +
                      "ORDER BY bds_id, code")
            .bind("ids", arr(bdsIds))
            .map(r -> new Code(r.get("bds_id", String.class), r.get("code", String.class), r.get("route_scope", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<PairLite>> pairsAmong(Collection<String> codes) {
        if (codes.isEmpty()) return Mono.just(List.of());
        return db.sql("SELECT ddinter_a, ddinter_b, severity FROM curated.ddinter_pair WHERE ddinter_a = ANY(:c) AND ddinter_b = ANY(:c)")
            .bind("c", arr(codes))
            .map(r -> new PairLite(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("severity", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairDetails(Collection<String> as, Collection<String> bs) {
        if (as.isEmpty() || bs.isEmpty()) return Mono.just(List.of());
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management,
                       p.interaction_id
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE p.ddinter_a = ANY(:as) AND p.ddinter_b = ANY(:bs)""")
            .bind("as", arr(as)).bind("bs", arr(bs))
            .map(R2dbcReviewQueryAdapter::pairRow).all().collectList();
    }

    @Override public Mono<Map<String, List<PairReviewRule.Decision>>> reviews(Collection<String> codes, String viewerEmail) {
        return pairReviews.forCodes(codes, viewerEmail);
    }

    @Override public Mono<Map<String, EntryInfo>> entries(Collection<String> codes) {
        if (codes.isEmpty()) return Mono.just(Map.of());
        return db.sql("SELECT ddinter_id, name, fetched_at FROM curated.ddinter_drug WHERE ddinter_id = ANY(:ids)")
            .bind("ids", arr(codes))
            .map(r -> Map.entry(r.get("ddinter_id", String.class),
                new EntryInfo(r.get("name", String.class), at(r.get("fetched_at", OffsetDateTime.class)))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    @Override public Mono<Map<String, List<ReviewDecision>>> decisions(Collection<String> itemKeys) {
        if (itemKeys.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT batch_id, concept_id, id, decision, reviewer_role, decided_at FROM ops.review_decision
                WHERE batch_id || '|' || concept_id = ANY(:keys) ORDER BY decided_at, id""")
            .bind("keys", arr(itemKeys))
            .map(r -> Map.entry(r.get("batch_id", String.class) + "|" + r.get("concept_id", String.class),
                new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
                    r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant())))
            .all()
            .collect(HashMap<String, List<ReviewDecision>>::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()))
            .map(m -> (Map<String, List<ReviewDecision>>) m);
    }

    @Override public Mono<SubstanceFacts> substance(String bdsId) {
        Mono<List<SeniorViews.Name>> names = db.sql("SELECT name, name_type, source FROM curated.substance_name WHERE bds_id = :id " +
                                                    "ORDER BY " + IngredientSummaryReader.NAME_RANK + ", name")
            .bind("id", bdsId)
            .map(r -> new SeniorViews.Name(r.get("name", String.class), r.get("name_type", String.class), r.get("source", String.class)))
            .all().collectList();
        // ICD-11 comes from the DGDA register: the latest OCL fetch of any product carrying the XM code (§5.6.6).
        Mono<List<IngredientSummary.Code>> codes = db.sql(IngredientSummaryReader.codesSql(
                "SELECT max(rc.fetched_at) FROM curated.brand_product_ingredient bpi JOIN raw.ocl_concept rc ON rc.concept_id = bpi.concept_id " +
                "WHERE bpi.xm_code = c.code"))
            .bind("ids", new String[]{bdsId})
            .map(IngredientSummaryReader::code).all().collectList();
        Mono<String> coverage = db.sql("SELECT coverage FROM curated.interaction_coverage WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("coverage", String.class)).one().defaultIfEmpty("not_run");
        return db.sql("SELECT bds_id, preferred_name FROM curated.substance WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("preferred_name", String.class)).one()
            .flatMap(name -> Mono.zip(names, codes, coverage).flatMap(t -> {
                String[] dd = t.getT2().stream().filter(c -> "DDINTER".equals(c.system())).map(IngredientSummary.Code::code).toArray(String[]::new);
                Mono<Map<String, IngredientSummaryReader.EntryRow>> rows = dd.length == 0 ? Mono.just(Map.of()) : ingredients.entries(dd);
                return rows.map(e -> {
                    List<IngredientSummary.Entry> list = t.getT2().stream().filter(c -> "DDINTER".equals(c.system())).map(c -> {
                        IngredientSummaryReader.EntryRow x = e.get(c.code());
                        IngredientSummary.Counts counts = x == null ? new IngredientSummary.Counts(0, 0, 0, 0, 0)
                            : new IngredientSummary.Counts(x.major(), x.moderate(), x.minor(), x.unknown(), x.total());
                        return new IngredientSummary.Entry(c.code(), x == null ? null : x.name(), c.routeScope(), counts,
                            x == null ? 0 : x.disease(), x == null ? 0 : x.food(),
                            SourceLinks.code("DDINTER", c.code(), x == null ? null : x.fetchedAt()).orElse(null));
                    }).toList();
                    return new SubstanceFacts(bdsId, name, t.getT1(), t.getT2(), t.getT3(), list);
                });
            }));
    }

    @Override public Mono<Map<String, String>> strengths(Collection<String> bdcIds, String bdsId) {
        if (bdcIds.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT bdc_id, strength_value, strength_unit, per_value, per_unit FROM curated.clinical_drug_ingredient
                WHERE bdc_id = ANY(:bdc) AND bds_id = :bds""")
            .bind("bdc", arr(bdcIds)).bind("bds", bdsId)
            .map(r -> Map.entry(r.get("bdc_id", String.class), strengthText(r.get("strength_value", BigDecimal.class),
                r.get("strength_unit", String.class), r.get("per_value", BigDecimal.class), r.get("per_unit", String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** "{value} {unit}[ per {perValue} {perUnit}]", numbers without trailing zeros (web/lib/relations.ts strengthText). */
    static String strengthText(BigDecimal value, String unit, BigDecimal per, String perUnit) {
        if (value == null) return "";
        String base = (ClinicalDrugReader.plain(value).toPlainString() + " " + (unit == null ? "" : unit)).trim();
        return per == null ? base : (base + " per " + ClinicalDrugReader.plain(per).toPlainString() + " " + (perUnit == null ? "" : perUnit)).trim();
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/application/SeniorReviewService.java`:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.SeniorReviewPort;
import com.niramoy.bddrug.application.port.SeniorReviewPort.HeldRow;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairQueue;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.RouteRule;
import com.niramoy.bddrug.domain.SeniorViews;
import com.niramoy.bddrug.domain.SeniorViews.PairView;
import com.niramoy.bddrug.domain.SourceLinks;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

/**
 * Senior clinical review (spec §5.17, §7.7). Every read covers all batches at once: the held products (latest current
 * item, never removed), every stored pair between held substances (PO D3(b)), each pair's state from PairReviewRule.
 * The universe is assembled from a fixed number of set-based queries; only the shown page gets texts, brands and history.
 */
@Service
public class SeniorReviewService {
    public static final int SIZE_DEFAULT = 50, SIZE_MAX = 100, PAGE_MAX = 10_000, BRANDS_SHOWN = 10, Q_MAX = 100;

    protected final SeniorReviewPort port;
    public SeniorReviewService(SeniorReviewPort port) { this.port = port; }

    record Product(String conceptId, String batchId, String tradeName, String review, Instant extractedAt, String bdcId,
                   String clinicalName, String route, List<BatchPairs.Substance> substances) {}
    record Universe(Map<String, Product> products, Map<String, String> substanceNames, Map<String, String> bdsOfCode,
                    Map<String, DdinterCode> codeInfo, Map<String, List<Product>> choosers, List<PairQueue.Entry> entries,
                    Map<String, List<PairReviewRule.Decision>> reviews) {}

    private static final Comparator<Product> BRAND_ORDER = Comparator.comparing(Product::batchId)
        .thenComparing(p -> p.tradeName().toLowerCase(Locale.ROOT)).thenComparing(Product::conceptId);

    // ---- parameters

    static String oneOf(String value, String fallback, List<String> allowed, String field) {
        String v = value == null ? fallback : value;
        if (v == null) return null;
        if (!allowed.contains(v)) throw new InvalidQueryException(field, field + " must be one of " + String.join(", ", allowed));
        return v;
    }

    private record Paging(int page, int size) {
        <T> List<T> slice(List<T> all) { return all.stream().skip((long) page * size).limit(size).toList(); }
    }

    private static Paging paging(String page, String size) {
        return new Paging(ReviewQueryService.number(page, 0, 0, PAGE_MAX, "page"),
            ReviewQueryService.number(size, SIZE_DEFAULT, 1, SIZE_MAX, "size"));
    }

    // ---- the universe

    Mono<Universe> universe(String viewerEmail) {
        return port.held().flatMap(rows -> {
            Set<String> bds = new HashSet<>();
            for (HeldRow r : rows) if (r.bdsId() != null) bds.add(r.bdsId());
            return port.ddinterCodes(bds).flatMap(codes -> {
                Map<String, List<DdinterCode>> byBds = new HashMap<>();
                Map<String, String> bdsOfCode = new TreeMap<>();
                Map<String, DdinterCode> codeInfo = new HashMap<>();
                for (SeniorReviewPort.Code c : codes) {
                    DdinterCode dc = new DdinterCode(c.code(), c.routeScope());
                    byBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(dc);
                    bdsOfCode.merge(c.code(), c.bdsId(), (x, y) -> x.compareTo(y) <= 0 ? x : y);
                    codeInfo.putIfAbsent(c.code(), dc);
                }
                Map<String, Product> products = products(rows, byBds);
                Map<String, String> names = new HashMap<>();
                for (Product p : products.values())
                    for (BatchPairs.Substance s : p.substances()) if (s.bdsId() != null) names.putIfAbsent(s.bdsId(), s.name());
                Map<String, List<Product>> choosers = new HashMap<>();
                for (Product p : products.values())
                    for (BatchPairs.Substance s : p.substances())
                        RouteRule.choose(s.codes(), p.route()).ifPresent(choice ->
                            choice.codes().forEach(c -> choosers.computeIfAbsent(c.code(), k -> new ArrayList<>()).add(p)));
                return Mono.zip(port.pairsAmong(bdsOfCode.keySet()), port.reviews(bdsOfCode.keySet(), viewerEmail)).flatMap(t -> {
                    Map<String, List<PairReviewRule.Decision>> reviews = t.getT2();
                    Set<String> as = new HashSet<>(), bs = new HashSet<>();
                    for (String k : reviews.keySet()) { String[] ab = k.split("\\|"); as.add(ab[0]); bs.add(ab[1]); }
                    return port.pairDetails(as, bs).map(rowsWithText -> {
                        Map<String, String> hashes = new HashMap<>();
                        for (BatchPairs.PairRow r : rowsWithText) hashes.put(r.ddinterA() + "|" + r.ddinterB(), hash(r));
                        List<PairQueue.Entry> entries = new ArrayList<>();
                        for (SeniorReviewPort.PairLite p : t.getT1()) {
                            String bdsA = bdsOfCode.get(p.ddinterA()), bdsB = bdsOfCode.get(p.ddinterB()), key = p.ddinterA() + "|" + p.ddinterB();
                            List<PairReviewRule.Decision> ds = reviews.getOrDefault(key, List.of());
                            String state = ds.isEmpty() ? PairReviewRule.NOT_REVIEWED : PairReviewRule.review(ds, hashes.get(key)).state();
                            entries.add(new PairQueue.Entry(p.ddinterA(), p.ddinterB(), p.severity(), bdsA, names.getOrDefault(bdsA, bdsA),
                                bdsB, names.getOrDefault(bdsB, bdsB), choosers.containsKey(p.ddinterA()) && choosers.containsKey(p.ddinterB()),
                                state));
                        }
                        return new Universe(products, names, bdsOfCode, codeInfo, choosers, List.copyOf(entries), reviews);
                    });
                });
            });
        });
    }

    private static Map<String, Product> products(List<HeldRow> rows, Map<String, List<DdinterCode>> byBds) {
        Map<String, List<HeldRow>> byConcept = new LinkedHashMap<>();
        for (HeldRow r : rows) byConcept.computeIfAbsent(r.conceptId(), k -> new ArrayList<>()).add(r);
        Map<String, Product> out = new LinkedHashMap<>();
        for (List<HeldRow> group : byConcept.values()) {
            HeldRow f = group.get(0);
            List<BatchPairs.Substance> subs = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (HeldRow r : group) {
                if (r.xmCode() == null || (r.bdsId() != null && !seen.add(r.bdsId()))) continue;
                subs.add(new BatchPairs.Substance(r.bdsId(), r.substance() != null ? r.substance() : r.ingredientName(), r.coverage(),
                    r.bdsId() == null ? List.of() : List.copyOf(byBds.getOrDefault(r.bdsId(), List.of()))));
            }
            out.put(f.conceptId(), new Product(f.conceptId(), f.batchId(), f.tradeName(), f.review(), f.extractedAt(), f.bdcId(),
                f.clinicalName(), f.route(), List.copyOf(subs)));
        }
        return out;
    }

    static String hash(BatchPairs.PairRow r) {
        return PairContent.hash(r.ddinterA(), r.ddinterB(), content(r));
    }

    static PairContent.Content content(BatchPairs.PairRow r) {
        return new PairContent.Content(r.severity(), r.actions(), r.interaction(), r.management());
    }

    // ---- views of one page of pairs

    private record Sides(List<Product> a, List<Product> b) {}

    private Sides sides(Universe u, PairQueue.Entry e) {
        return new Sides(u.choosers().getOrDefault(e.ddinterA(), List.of()).stream().sorted(BRAND_ORDER).toList(),
            u.choosers().getOrDefault(e.ddinterB(), List.of()).stream().sorted(BRAND_ORDER).toList());
    }

    private static String itemKey(Product p) { return p.batchId() + "|" + p.conceptId(); }

    private static String displayStatus(Product p, Map<String, List<ReviewDecision>> decisions) {
        return ApprovalRule.displayStatus(decisions.getOrDefault(itemKey(p), List.of()), p.extractedAt(), p.review());
    }

    Mono<List<PairView>> views(Universe u, List<PairQueue.Entry> page) {
        if (page.isEmpty()) return Mono.just(List.of());
        Set<String> as = new HashSet<>(), bs = new HashSet<>(), codes = new HashSet<>(), items = new HashSet<>();
        Map<String, Sides> sides = new HashMap<>();
        for (PairQueue.Entry e : page) {
            as.add(e.ddinterA()); bs.add(e.ddinterB()); codes.add(e.ddinterA()); codes.add(e.ddinterB());
            Sides s = sides(u, e);
            sides.put(e.key(), s);
            s.a().stream().limit(BRANDS_SHOWN).forEach(p -> items.add(itemKey(p)));
            s.b().stream().limit(BRANDS_SHOWN).forEach(p -> items.add(itemKey(p)));
        }
        return Mono.zip(port.pairDetails(as, bs), port.entries(codes), port.decisions(items)).map(t -> {
            Map<String, BatchPairs.PairRow> rows = new HashMap<>();
            for (BatchPairs.PairRow r : t.getT1()) rows.put(r.ddinterA() + "|" + r.ddinterB(), r);
            List<PairView> out = new ArrayList<>();
            for (PairQueue.Entry e : page) {
                BatchPairs.PairRow row = rows.get(e.key());
                if (row == null) continue;   // deleted since the universe was read: never happens (the ETL never deletes pairs)
                PairContent.Content content = content(row);
                String hash = PairContent.hash(e.ddinterA(), e.ddinterB(), content);
                List<PairReviewRule.Decision> ds = u.reviews().getOrDefault(e.key(), List.of());
                Sides s = sides.get(e.key());
                List<SeniorViews.Brand> brands = new ArrayList<>();
                s.a().stream().limit(BRANDS_SHOWN).forEach(p -> brands.add(new SeniorViews.Brand(p.conceptId(), p.tradeName(), p.batchId(),
                    displayStatus(p, t.getT3()), "a")));
                s.b().stream().limit(BRANDS_SHOWN).forEach(p -> brands.add(new SeniorViews.Brand(p.conceptId(), p.tradeName(), p.batchId(),
                    displayStatus(p, t.getT3()), "b")));
                Set<String> batches = new HashSet<>();
                s.a().forEach(p -> batches.add(p.batchId()));
                s.b().forEach(p -> batches.add(p.batchId()));
                out.add(new PairView(e.ddinterA(), e.ddinterB(), new SeniorViews.Side(e.bdsA(), e.nameA()),
                    new SeniorViews.Side(e.bdsB(), e.nameB()), entryRef(u, t.getT2(), e.ddinterA(), row.nameA()),
                    entryRef(u, t.getT2(), e.ddinterB(), row.nameB()), row.severity(), content.actions(), content.interaction(),
                    content.management(), SourceLinks.pair(row.interactionId()).orElse(null), e.applies(), List.copyOf(brands),
                    new SeniorViews.BrandCounts(s.a().size(), s.b().size(), batches.size()), PairReviewRule.review(ds, hash),
                    PairReviewRule.changes(ds, content, hash), PairReviewRule.history(ds, hash),
                    new SeniorViews.PairVersion(hash, PairReviewRule.lastId(ds))));
            }
            return List.copyOf(out);
        });
    }

    private static SeniorViews.EntryRef entryRef(Universe u, Map<String, SeniorReviewPort.EntryInfo> entries, String id, String partnerName) {
        SeniorReviewPort.EntryInfo info = entries.get(id);
        DdinterCode code = u.codeInfo().get(id);
        return new SeniorViews.EntryRef(info != null && info.name() != null ? info.name() : partnerName, code == null ? null : code.routeScope(),
            SourceLinks.code("DDINTER", id, info == null ? null : info.fetchedAt()).orElse(null));
    }

    // ---- GET /v1/review/pairs

    public Mono<SeniorViews.PairsPage> pairs(String show, String scope, String severity, String page, String size, String viewerEmail) {
        return Mono.fromCallable(() -> new Object[]{oneOf(show, "todo", PairQueue.SHOWS, "show"), oneOf(scope, "all", PairQueue.SCOPES, "pairs"),
                oneOf(severity, null, PairQueue.SEVERITIES, "severity"), paging(page, size)})
            .flatMap(v -> universe(viewerEmail).flatMap(u -> {
                List<PairQueue.Entry> selected = PairQueue.select(u.entries(), (String) v[0], (String) v[1], (String) v[2]);
                return views(u, ((Paging) v[3]).slice(selected))
                    .map(items -> new SeniorViews.PairsPage(selected.size(), PairQueue.counts(u.entries(), (String) v[1]), items));
            }));
    }

    // ---- GET /v1/review/substances

    public Mono<SeniorViews.SubstancesPage> substances(String q, String page, String size) {
        return Mono.fromCallable(() -> {
                String needle = q == null ? "" : q.strip();
                if (Validate.length(needle) > Q_MAX) throw new InvalidQueryException("q", "q must be at most " + Q_MAX + " characters");
                return new Object[]{needle.toLowerCase(Locale.ROOT), paging(page, size)};
            })
            .flatMap(v -> universe(null).map(u -> {
                String needle = (String) v[0];
                Map<String, List<Product>> carrying = carrying(u);
                List<SeniorViews.SubstanceRow> rows = new ArrayList<>();
                for (Map.Entry<String, List<Product>> c : carrying.entrySet()) {
                    String bds = c.getKey(), name = u.substanceNames().getOrDefault(bds, bds);
                    if (!needle.isEmpty() && !name.toLowerCase(Locale.ROOT).contains(needle) && !bds.toLowerCase(Locale.ROOT).contains(needle)) continue;
                    List<PairQueue.Entry> todo = u.entries().stream().filter(e -> PairQueue.inShow("todo", e.state())
                        && (bds.equals(e.bdsA()) || bds.equals(e.bdsB()))).toList();
                    rows.add(new SeniorViews.SubstanceRow(bds, name, c.getValue().size(),
                        (int) c.getValue().stream().map(Product::batchId).distinct().count(), todo.size(),
                        (int) todo.stream().filter(e -> "major".equals(e.severity())).count()));
                }
                rows.sort(Comparator.comparingInt(SeniorViews.SubstanceRow::pairsToReview).reversed()
                    .thenComparing(r -> r.name().toLowerCase(Locale.ROOT)).thenComparing(SeniorViews.SubstanceRow::bdsId));
                return new SeniorViews.SubstancesPage(rows.size(), ((Paging) v[1]).slice(rows));
            }));
    }

    /** Held products by substance (bds_id), in the held order. */
    private static Map<String, List<Product>> carrying(Universe u) {
        Map<String, List<Product>> out = new LinkedHashMap<>();
        for (Product p : u.products().values())
            for (BatchPairs.Substance s : p.substances()) if (s.bdsId() != null) out.computeIfAbsent(s.bdsId(), k -> new ArrayList<>()).add(p);
        return out;
    }

    // ---- GET /v1/review/substances/{bdsId}

    public Mono<SeniorViews.SubstanceDetail> substance(String bdsId, String scope, String severity, String page, String size,
                                                       String viewerEmail) {
        return Mono.fromCallable(() -> new Object[]{oneOf(scope, "all", PairQueue.SCOPES, "pairs"),
                oneOf(severity, null, PairQueue.SEVERITIES, "severity"), paging(page, size)})
            .flatMap(v -> universe(viewerEmail).flatMap(u -> {
                List<Product> brands = carrying(u).get(bdsId);
                if (brands == null) return Mono.error(new NotFoundException("bdsId", "No substance with this id is held"));
                List<Product> sorted = brands.stream().sorted(BRAND_ORDER).toList();
                List<PairQueue.Entry> selected = PairQueue.select(u.entries().stream()
                    .filter(e -> bdsId.equals(e.bdsA()) || bdsId.equals(e.bdsB())).toList(), "all", (String) v[0], (String) v[1]);
                Set<String> bdc = new HashSet<>();
                sorted.forEach(p -> { if (p.bdcId() != null) bdc.add(p.bdcId()); });
                return Mono.zip(port.substance(bdsId), port.strengths(bdc, bdsId),
                        port.decisions(sorted.stream().map(SeniorReviewService::itemKey).toList()),
                        views(u, ((Paging) v[2]).slice(selected)))
                    .map(t -> new SeniorViews.SubstanceDetail(bdsId, t.getT1().name(), t.getT1().names(), t.getT1().codes(),
                        t.getT1().coverage(), t.getT1().entries(),
                        sorted.stream().map(p -> brandRow(p, bdsId, t.getT2(), t.getT3())).toList(),
                        new SeniorViews.PairList(selected.size(), t.getT4())));
            }));
    }

    private static SeniorViews.BrandRow brandRow(Product p, String bdsId, Map<String, String> strengths,
                                                 Map<String, List<ReviewDecision>> decisions) {
        BatchPairs.Substance s = p.substances().stream().filter(x -> bdsId.equals(x.bdsId())).findFirst().orElseThrow();
        Optional<RouteRule.Choice> choice = RouteRule.choose(s.codes(), p.route());
        List<SeniorViews.Chosen> chosen = choice.map(c -> c.codes().stream()
            .map(x -> new SeniorViews.Chosen(x.code(), x.routeScope(), c.routeAssumed())).toList()).orElse(List.of());
        String reason = "none".equals(s.coverage()) ? "no_data" : !"full".equals(s.coverage()) ? "not_run" : chosen.isEmpty() ? "no_route" : null;
        return new SeniorViews.BrandRow(p.conceptId(), p.tradeName(), p.batchId(), displayStatus(p, decisions),
            p.bdcId() == null ? null : new SeniorViews.Clinical(p.bdcId(), p.clinicalName(), p.route()),
            p.bdcId() == null ? "" : strengths.getOrDefault(p.bdcId(), ""), reason == null ? chosen : List.of(), reason);
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/presentation/SeniorReviewController.java`:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.SeniorReviewService;
import com.niramoy.bddrug.domain.SeniorViews;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/**
 * Senior review (spec §7.7): unreviewed data from every batch, so every endpoint needs the internal token. The web calls
 * these only for a senior session (§5.17). {@code X-Viewer-Email} marks the viewer's own pair decisions; never echoed.
 */
@RestController
@RequestMapping("/v1/review")
public class SeniorReviewController {
    protected final SeniorReviewService service;
    protected final InternalAuth auth;
    public SeniorReviewController(SeniorReviewService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping("/pairs")
    public Mono<ApiResponse<SeniorViews.PairsPage>> pairs(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestHeader(value = "X-Viewer-Email", required = false) String viewer,
            @RequestParam(required = false) String show, @RequestParam(required = false) String pairs,
            @RequestParam(required = false) String severity, @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.pairs(show, pairs, severity, page, size, viewer).map(ApiResponse::ok);
    }

    @GetMapping("/substances")
    public Mono<ApiResponse<SeniorViews.SubstancesPage>> substances(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestParam(required = false) String q, @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.substances(q, page, size).map(ApiResponse::ok);
    }

    @GetMapping("/substances/{bdsId}")
    public Mono<ApiResponse<SeniorViews.SubstanceDetail>> substance(@PathVariable String bdsId,
            @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestHeader(value = "X-Viewer-Email", required = false) String viewer,
            @RequestParam(required = false) String pairs, @RequestParam(required = false) String severity,
            @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        auth.require(token);
        return service.substance(bdsId, pairs, severity, page, size, viewer).map(ApiResponse::ok);
    }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests PairQueueTest --tests PairQueueIntegrationTest`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/PairQueue.java api/src/main/java/com/niramoy/bddrug/domain/SeniorViews.java \
  api/src/main/java/com/niramoy/bddrug/application/port/SeniorReviewPort.java api/src/main/java/com/niramoy/bddrug/application/SeniorReviewService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSeniorReviewAdapter.java \
  api/src/main/java/com/niramoy/bddrug/presentation/SeniorReviewController.java \
  api/src/test/java/com/niramoy/bddrug/PairQueueTest.java api/src/test/java/com/niramoy/bddrug/PairQueueIntegrationTest.java
git commit -m "feat(api): senior review reads: pair queue, substances, substance page across all batches (§5.17, §7.7)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8b: Pair decisions — mark reviewed, report a pair issue (§7.7)

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/SeniorReviewPort.java`, `api/src/main/java/com/niramoy/bddrug/application/SeniorReviewService.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSeniorReviewAdapter.java`, `api/src/main/java/com/niramoy/bddrug/presentation/SeniorReviewController.java`
- Create: `api/src/test/java/com/niramoy/bddrug/PairDecisionIntegrationTest.java`

**Interfaces:**
- Consumes: Task 8a's port, adapter and `SeniorViews.PairOutcome`, `PairVersion`; Task 5's rules; Task 1's `ops.pair_review` and audit index.
- Produces: `POST /v1/review/pairs/{ddinterA}/{ddinterB}/decisions` with body `{decision: "reviewed"|"issue", note, reviewerEmail, reviewerRole: "senior", expectedContentHash, expectedLastPairReviewId: number|null, requestId}` → 201 `PairOutcome{…, replayed:false}`, 200 on a replay; the §7.7 steps in order: 400 (`reviewerRole` "Only a senior pharmacist can review pairs", `decision`, `note`, `reviewerEmail`, `requestId`, `expectedContentHash`, `expectedLastPairReviewId`), 400 `requestId` for a reused id, 404 `pair` (not stored, `a ≥ b`, or a side not held), 409 `contentHash`, 409 `lastPairReviewId`, 409 `state` ("This pair is already reviewed"). One `pair_decision` audit row in the transaction; one `pair_decision_rejected` row in its own transaction after a 400 or 409. Port: `NewPairDecision(decision, note, reviewerEmail, expectedContentHash, Long expectedLastPairReviewId, UUID requestId)`, `PairRejection(ddinterA, ddinterB, actorEmail, actorRole, outcome, requestId)`, `decide(a, b, NewPairDecision)`, `recordRejection(PairRejection)`. Service: `SeniorReviewService.PairRequest(decision, note, reviewerEmail, reviewerRole, expectedContentHash, boolean lastIdSent, String expectedLastPairReviewId, requestId)` and `decide(a, b, PairRequest)`.

- [ ] **Step 1: Write the failing test**

Create `api/src/test/java/com/niramoy/bddrug/PairDecisionIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.7 pair decisions (§11.3 PairQueueIntegrationTest "decisions"). Held: W-1, A-1, N-1, C-CAP, so every pilot pair between
 * warfarin, aspirin, acetaminophen and systemic chloramphenicol is held. DDInter1951/DDInter999 is stored but DDInter999
 * maps to no substance. Each test decides on its own pair.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class PairDecisionIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org";
    static final String H_1951_20 = "b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043";
    static final String H_14_1951 = "7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f";

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('PD', 4);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
             ('PD','DGDA-Drugs','W-1', now()), ('PD','DGDA-Drugs','A-1', now()), ('PD','DGDA-Drugs','N-1', now()),
             ('PD','DGDA-Drugs','C-CAP', now());
            """);
    }

    @Autowired WebTestClient web;

    static Map<String, Object> body(String decision, String note, String hash, Long lastId) {
        Map<String, Object> m = new HashMap<>();
        m.put("decision", decision);
        m.put("note", note);
        m.put("reviewerEmail", SENIOR);
        m.put("reviewerRole", "senior");
        m.put("expectedContentHash", hash);
        m.put("expectedLastPairReviewId", lastId);
        m.put("requestId", UUID.randomUUID().toString());
        return m;
    }

    WebTestClient.ResponseSpec post(String a, String b, Object body) {
        return internal(web).post().uri("/v1/review/pairs/{a}/{b}/decisions", a, b).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body).exchange();
    }

    long rejected(String rid) throws Exception {
        return count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'pair_decision_rejected' AND request_id = '" + rid + "'");
    }

    @Test void markReviewedStoresTheContentAndOneAuditRow() throws Exception {
        Map<String, Object> b = body("reviewed", "", H_1951_20, null);
        post("DDInter1951", "DDInter20", b).expectStatus().isCreated().expectBody()
            .jsonPath("$.data.review.state").isEqualTo("reviewed")
            .jsonPath("$.data.review.mine").isEqualTo(true)
            .jsonPath("$.data.version.contentHash").isEqualTo(H_1951_20)
            .jsonPath("$.data.version.lastPairReviewId").isNumber()
            .jsonPath("$.data.replayed").isEqualTo(false);
        assertThat(text(pg, "SELECT decision || '|' || content_hash || '|' || (content ->> 'severity') || '|' || reviewer_role " +
            "FROM ops.pair_review WHERE ddinter_b = 'DDInter20'")).isEqualTo("reviewed|" + H_1951_20 + "|major|senior");
        assertThat(text(pg, "SELECT outcome || '|' || actor_role || '|' || target_type || '|' || target_id FROM ops.audit_event " +
            "WHERE event = 'pair_decision' AND request_id = '" + b.get("requestId") + "'"))
            .isEqualTo("reviewed|senior|ddinter_pair|DDInter1951/DDInter20");
        // a second Mark reviewed with the right version: already reviewed
        Long last = Long.valueOf(text(pg, "SELECT max(id) FROM ops.pair_review WHERE ddinter_b = 'DDInter20'"));
        post("DDInter1951", "DDInter20", body("reviewed", "", H_1951_20, last)).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("state").jsonPath("$.errors[0].message").isEqualTo("This pair is already reviewed");
        // an issue after a review is accepted, with its note
        post("DDInter1951", "DDInter20", body("issue", "management says avoid; severity is fine", H_1951_20, last)).expectStatus().isCreated()
            .expectBody().jsonPath("$.data.review.state").isEqualTo("issue")
            .jsonPath("$.data.review.note").isEqualTo("management says avoid; severity is fine");
    }

    @Test void aRepeatedRequestIdIsAReplayWithOneRow() throws Exception {
        Map<String, Object> b = body("issue", "the text contradicts the severity", H_14_1951, null);
        post("DDInter14", "DDInter1951", b).expectStatus().isCreated();
        post("DDInter14", "DDInter1951", b).expectStatus().isOk().expectBody().jsonPath("$.data.replayed").isEqualTo(true);
        assertThat(count(pg, "SELECT count(*) FROM ops.pair_review WHERE ddinter_a = 'DDInter14'")).isEqualTo(1);
        Map<String, Object> other = new HashMap<>(b);
        other.put("decision", "reviewed");
        post("DDInter14", "DDInter1951", other).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
    }

    @SuppressWarnings("unchecked")
    @Test void validationIs400WithTheFieldAndOneRejectedRow() throws Exception {
        Object[][] cases = {
            {"reviewerRole", Map.of("reviewerRole", "pharmacist")},
            {"decision", Map.of("decision", "approve")},
            {"note", Map.of("decision", "issue", "note", "abcd")},
            {"expectedContentHash", Map.of("expectedContentHash", "ABC")},
            {"requestId", Map.of("requestId", "not-a-uuid")},
        };
        for (Object[] c : cases) {
            Map<String, Object> b = body("reviewed", "", H_14_1951, null);
            b.putAll((Map<String, Object>) c[1]);
            post("DDInter14", "DDInter1951", b).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo(c[0]);
        }
        Map<String, Object> missing = body("reviewed", "", H_14_1951, null);
        missing.remove("expectedLastPairReviewId");
        post("DDInter14", "DDInter1951", missing).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("expectedLastPairReviewId");
        Map<String, Object> wrongRole = body("reviewed", "", H_14_1951, null);
        wrongRole.put("reviewerRole", "engineer");
        post("DDInter14", "DDInter1951", wrongRole).expectStatus().isBadRequest().expectBody()
            .jsonPath("$.errors[0].message").isEqualTo("Only a senior pharmacist can review pairs");
        assertThat(rejected((String) wrongRole.get("requestId"))).isEqualTo(1);
    }

    @Test void aPairThatIsNotStoredOrNotHeldIs404() {
        post("DDInter1951", "DDInter999", body("reviewed", "", H_14_1951, null)).expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("pair");
        post("DDInter1951", "DDInter14", body("reviewed", "", H_14_1951, null)).expectStatus().isNotFound();   // a > b
        post("DDInter20", "DDInter7777", body("reviewed", "", H_14_1951, null)).expectStatus().isNotFound();
    }

    @Test void aStalePageIs409OnTheContentOrTheLastReview() throws Exception {
        Map<String, Object> wrong = body("reviewed", "", "f".repeat(64), null);
        post("DDInter1951", "DDInter351", wrong).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("contentHash");
        assertThat(rejected((String) wrong.get("requestId"))).isEqualTo(1);
        String queue = internal(web).get().uri("/v1/review/pairs?show=all&severity=moderate").exchange().expectBody(String.class)
            .returnResult().getResponseBody();
        String current = com.jayway.jsonpath.JsonPath.<java.util.List<String>>read(queue,
            "$.data.items[?(@.ddinterB == 'DDInter351')].version.contentHash").get(0);
        post("DDInter1951", "DDInter351", body("issue", "the route looks wrong for this entry", current, null)).expectStatus().isCreated();
        post("DDInter1951", "DDInter351", body("reviewed", "", current, null)).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("lastPairReviewId");
    }
}
```

The second part of `aStalePageIs409OnTheContentOrTheLastReview` reads the pair's current hash from the queue, as the page does.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests PairDecisionIntegrationTest`
Expected: FAIL: every POST answers 404 or 405 (no mapping).

- [ ] **Step 3: Add the write path**

In `api/src/main/java/com/niramoy/bddrug/application/port/SeniorReviewPort.java`, add (import `java.util.UUID`):

```java
    record NewPairDecision(String decision, String note, String reviewerEmail, String expectedContentHash,
                           Long expectedLastPairReviewId, java.util.UUID requestId) {}
    /** {@code outcome} is the error code (CONFLICT or INVALID_QUERY); email, role and target only when they were valid. */
    record PairRejection(String ddinterA, String ddinterB, String actorEmail, String actorRole, String outcome, java.util.UUID requestId) {}

    /**
     * §7.7, one transaction, SELECT … FOR UPDATE on the pair row: (1) a requestId already used for a pair decision answers
     * replayed for the same pair and decision, else InvalidQueryException(requestId); (2) NotFoundException(pair) when the
     * pair is not stored, a ≥ b, or a side is not held; (3) ConflictException(contentHash); (4) ConflictException(lastPairReviewId);
     * (5) ConflictException(state) for reviewed on a reviewed pair; then the pair_review row and its pair_decision audit row.
     */
    Mono<SeniorViews.PairOutcome> decide(String ddinterA, String ddinterB, NewPairDecision decision);
    /** One pair_decision_rejected audit row, in its own transaction. */
    Mono<Void> recordRejection(PairRejection rejection);
```

In `api/src/main/java/com/niramoy/bddrug/application/SeniorReviewService.java`, add (imports `org.slf4j.Logger`, `org.slf4j.LoggerFactory`, `java.util.UUID`, `java.util.regex.Pattern`):

```java
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SeniorReviewService.class);
    public static final java.util.Set<String> PAIR_DECISIONS = java.util.Set.of("reviewed", "issue");
    private static final java.util.regex.Pattern HASH = java.util.regex.Pattern.compile("^[0-9a-f]{64}$");
    private static final java.util.regex.Pattern UUID_TEXT =
        java.util.regex.Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final java.util.regex.Pattern DDINTER_ID = java.util.regex.Pattern.compile("^DDInter[0-9]{1,6}$");

    /** {@code lastIdSent} is false when the key was left out; the id arrives as text (digits, null, or anything else). */
    public record PairRequest(String decision, String note, String reviewerEmail, String reviewerRole, String expectedContentHash,
                              boolean lastIdSent, String expectedLastPairReviewId, String requestId) {}

    public Mono<SeniorViews.PairOutcome> decide(String a, String b, PairRequest r) {
        return Mono.fromCallable(() -> validate(r))
            .flatMap(d -> port.decide(a, b, d))
            .onErrorResume(e -> e instanceof InvalidQueryException || e instanceof ConflictException,
                e -> port.recordRejection(rejection(a, b, r, e))
                    .onErrorResume(x -> {
                        log.error("pair_decision_rejected audit row not written: {}", x.getClass().getName());
                        return Mono.empty();
                    })
                    .then(Mono.<SeniorViews.PairOutcome>error(e)));
    }

    static SeniorReviewPort.NewPairDecision validate(PairRequest r) {
        if (!"senior".equals(r.reviewerRole()))
            throw new InvalidQueryException("reviewerRole", "Only a senior pharmacist can review pairs");
        String decision = Validate.oneOf(r.decision(), PAIR_DECISIONS, "decision");
        String note = Validate.text(r.note(), "issue".equals(decision) ? 5 : 0, 1000, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        if (r.requestId() == null || !UUID_TEXT.matcher(r.requestId()).matches())
            throw new InvalidQueryException("requestId", "requestId must be a UUID, reused unchanged on every retry");
        if (r.expectedContentHash() == null || !HASH.matcher(r.expectedContentHash()).matches())
            throw new InvalidQueryException("expectedContentHash", "expectedContentHash must be 64 lower-case hex characters");
        if (!r.lastIdSent())
            throw new InvalidQueryException("expectedLastPairReviewId",
                "expectedLastPairReviewId is required: send the pair's lastPairReviewId as the page showed it (null when none)");
        Long last = null;
        if (r.expectedLastPairReviewId() != null) {
            try {
                last = Long.parseLong(r.expectedLastPairReviewId());
                if (last < 1) throw new NumberFormatException();
            } catch (NumberFormatException e) {
                throw new InvalidQueryException("expectedLastPairReviewId", "expectedLastPairReviewId must be a positive integer or null");
            }
        }
        return new SeniorReviewPort.NewPairDecision(decision, note, email, r.expectedContentHash(), last, UUID.fromString(r.requestId()));
    }

    static SeniorReviewPort.PairRejection rejection(String a, String b, PairRequest r, Throwable e) {
        String email = Validate.stripped(r.reviewerEmail());
        boolean ids = a != null && b != null && DDINTER_ID.matcher(a).matches() && DDINTER_ID.matcher(b).matches();
        UUID rid = r.requestId() != null && UUID_TEXT.matcher(r.requestId()).matches() ? UUID.fromString(r.requestId()) : null;
        return new SeniorReviewPort.PairRejection(ids ? a : null, ids ? b : null, Validate.isEmail(email) ? email : null,
            "senior".equals(r.reviewerRole()) ? "senior" : null, e instanceof ConflictException ? "CONFLICT" : "INVALID_QUERY", rid);
    }
```

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSeniorReviewAdapter.java`, add the transactional operator and Jackson mapper to the constructor (`public R2dbcSeniorReviewAdapter(DatabaseClient db, IngredientSummaryReader ingredients, PairReviewReader pairReviews, TransactionalOperator tx, ObjectMapper json)`, fields `tx`, `json`; imports `org.springframework.transaction.reactive.TransactionalOperator`, `com.fasterxml.jackson.databind.ObjectMapper`, `com.niramoy.bddrug.application.ConflictException`, `com.niramoy.bddrug.application.InvalidQueryException`, `com.niramoy.bddrug.application.NotFoundException`, `com.niramoy.bddrug.domain.PairContent`, `org.springframework.dao.DuplicateKeyException`, `java.util.LinkedHashMap`, `java.util.Optional`, `java.util.UUID`), and:

```java
    static final String TARGET_TYPE = "ddinter_pair";
    private record Locked(String severity, List<String> actions, String interactionId) {}
    private record AuditHit(String targetId, String outcome) {}

    private static String target(String a, String b) { return a + "/" + b; }

    @Override public Mono<SeniorViews.PairOutcome> decide(String a, String b, NewPairDecision d) {
        Mono<Optional<Locked>> lock = a.compareTo(b) >= 0 ? Mono.just(Optional.empty()) : db.sql("""
                SELECT severity, actions, interaction_id FROM curated.ddinter_pair WHERE ddinter_a = :a AND ddinter_b = :b FOR UPDATE""")
            .bind("a", a).bind("b", b)
            .map(r -> Optional.of(new Locked(r.get("severity", String.class), R2dbcSubstanceAdapter.list(r, "actions"),
                r.get("interaction_id", String.class))))
            .one().defaultIfEmpty(Optional.empty());
        return tx.transactional(lock.flatMap(locked -> replay(a, b, d).switchIfEmpty(Mono.defer(() -> locked.isEmpty()
                ? Mono.error(notFound())
                : held(a, b).flatMap(h -> h ? fresh(a, b, d, locked.get()) : Mono.<SeniorViews.PairOutcome>error(notFound()))))))
            .onErrorResume(DuplicateKeyException.class, e -> tx.transactional(replay(a, b, d).switchIfEmpty(Mono.error(e))));
    }

    private static NotFoundException notFound() {
        return new NotFoundException("pair", "No stored DDInter pair with these entries between substances we hold");
    }

    /** Step 1: empty when the requestId is new. */
    private Mono<SeniorViews.PairOutcome> replay(String a, String b, NewPairDecision d) {
        return db.sql("SELECT target_id, outcome FROM ops.audit_event WHERE event = 'pair_decision' AND request_id = :r")
            .bind("r", d.requestId())
            .map(r -> new AuditHit(r.get("target_id", String.class), r.get("outcome", String.class))).one()
            .flatMap(hit -> target(a, b).equals(hit.targetId()) && d.decision().equals(hit.outcome())
                ? current(a, b, d.reviewerEmail(), true)
                : Mono.error(new InvalidQueryException("requestId",
                    "requestId was already used for another pair decision; send a new requestId for a new decision")));
    }

    /** Step 2's "held": both entries map to a substance of a held product. */
    private Mono<Boolean> held(String a, String b) {
        return db.sql("WITH " + LATEST + """
                , held AS (SELECT DISTINCT xm.bds_id FROM latest l
                           JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                           JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                           WHERE l.note IS DISTINCT FROM '%s')
                SELECT EXISTS (SELECT 1 FROM curated.substance_code c JOIN held h ON h.bds_id = c.bds_id WHERE c.system = 'DDINTER' AND c.code = :a)
                   AND EXISTS (SELECT 1 FROM curated.substance_code c JOIN held h ON h.bds_id = c.bds_id WHERE c.system = 'DDINTER' AND c.code = :b)
                   AS held""".formatted(ReviewSql.REMOVED_NOTE))
            .bind("a", a).bind("b", b).map(r -> Boolean.TRUE.equals(r.get("held", Boolean.class))).one();
    }

    private Mono<PairContent.Content> content(Locked l) {
        if (l.interactionId() == null) return Mono.just(new PairContent.Content(l.severity(), l.actions(), null, null));
        return db.sql("SELECT interaction, management FROM curated.ddinter_interaction_text WHERE interaction_id = :i")
            .bind("i", l.interactionId())
            .map(r -> new PairContent.Content(l.severity(), l.actions(), r.get("interaction", String.class), r.get("management", String.class)))
            .one().defaultIfEmpty(new PairContent.Content(l.severity(), l.actions(), null, null));
    }

    private Mono<List<PairReviewRule.Decision>> decisionsOf(String a, String b, String viewer) {
        return pairReviews.forCodes(List.of(a, b), viewer).map(m -> m.getOrDefault(a + "|" + b, List.of()));
    }

    /** Steps 3–5, then the writes. */
    private Mono<SeniorViews.PairOutcome> fresh(String a, String b, NewPairDecision d, Locked locked) {
        return content(locked).flatMap(content -> decisionsOf(a, b, d.reviewerEmail()).flatMap(ds -> {
            String hash = PairContent.hash(a, b, content);
            if (!hash.equals(d.expectedContentHash()))
                return Mono.error(new ConflictException("contentHash",
                    "This pair changed in DDInter after the page was loaded; reload it and review again"));
            if (!java.util.Objects.equals(PairReviewRule.lastId(ds), d.expectedLastPairReviewId()))
                return Mono.error(new ConflictException("lastPairReviewId",
                    "Another senior pharmacist decided on this pair after the page was loaded; reload it"));
            if ("reviewed".equals(d.decision()) && PairReviewRule.REVIEWED.equals(PairReviewRule.review(ds, hash).state()))
                return Mono.error(new ConflictException("state", "This pair is already reviewed"));
            Map<String, Object> stored = new LinkedHashMap<>();
            stored.put("severity", content.severity());
            stored.put("actions", content.actions());
            stored.put("interaction", content.interaction());
            stored.put("management", content.management());
            String json;
            try {
                json = this.json.writeValueAsString(stored);
            } catch (Exception e) {
                return Mono.error(new IllegalStateException("pair content is not serialisable", e));
            }
            return db.sql("""
                    INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
                    VALUES (:a, :b, :decision, :note, :hash, CAST(:content AS jsonb), :email, 'senior')""")
                .bind("a", a).bind("b", b).bind("decision", d.decision()).bind("note", d.note()).bind("hash", hash)
                .bind("content", json).bind("email", d.reviewerEmail())
                .fetch().rowsUpdated()
                .then(db.sql("""
                        INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                        VALUES ('pair_decision', :email, 'senior', :type, :target, :outcome, :rid)""")
                    .bind("email", d.reviewerEmail()).bind("type", TARGET_TYPE).bind("target", target(a, b))
                    .bind("outcome", d.decision()).bind("rid", d.requestId()).fetch().rowsUpdated())
                .then(current(a, b, d.reviewerEmail(), false));
        }));
    }

    private Mono<SeniorViews.PairOutcome> current(String a, String b, String viewer, boolean replayed) {
        Locked none = new Locked(null, List.of(), null);
        return db.sql("SELECT severity, actions, interaction_id FROM curated.ddinter_pair WHERE ddinter_a = :a AND ddinter_b = :b")
            .bind("a", a).bind("b", b)
            .map(r -> new Locked(r.get("severity", String.class), R2dbcSubstanceAdapter.list(r, "actions"), r.get("interaction_id", String.class)))
            .one().defaultIfEmpty(none)
            .flatMap(this::content)
            .flatMap(content -> decisionsOf(a, b, viewer).map(ds -> {
                String hash = PairContent.hash(a, b, content);
                return new SeniorViews.PairOutcome(a, b, PairReviewRule.review(ds, hash),
                    new SeniorViews.PairVersion(hash, PairReviewRule.lastId(ds)), replayed);
            }));
    }

    @Override public Mono<Void> recordRejection(PairRejection r) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                VALUES ('pair_decision_rejected', :email, :role, :type, :target, :outcome, :rid)""")
            .bind("outcome", r.outcome());
        spec = r.actorEmail() == null ? spec.bindNull("email", String.class) : spec.bind("email", r.actorEmail());
        spec = r.actorRole() == null ? spec.bindNull("role", String.class) : spec.bind("role", r.actorRole());
        spec = r.ddinterA() == null ? spec.bindNull("type", String.class).bindNull("target", String.class)
            : spec.bind("type", TARGET_TYPE).bind("target", target(r.ddinterA(), r.ddinterB()));
        spec = r.requestId() == null ? spec.bindNull("rid", UUID.class) : spec.bind("rid", r.requestId());
        return tx.transactional(spec.fetch().rowsUpdated()).then();
    }
```

In `api/src/main/java/com/niramoy/bddrug/presentation/SeniorReviewController.java`, add (imports `com.fasterxml.jackson.databind.JsonNode`, `org.springframework.http.HttpStatus`, `org.springframework.http.ResponseEntity`):

```java
    /** The pair decision body; expectedLastPairReviewId is a JsonNode so a left-out key can be told from an explicit null. */
    public record PairDecisionBody(String decision, String note, String reviewerEmail, String reviewerRole, String expectedContentHash,
                                   JsonNode expectedLastPairReviewId, String requestId) {
        SeniorReviewService.PairRequest toRequest() {
            boolean sent = expectedLastPairReviewId != null;
            String id = !sent || expectedLastPairReviewId.isNull() ? null
                : expectedLastPairReviewId.isIntegralNumber() ? expectedLastPairReviewId.asText() : "invalid:" + expectedLastPairReviewId.getNodeType();
            return new SeniorReviewService.PairRequest(decision, note, reviewerEmail, reviewerRole, expectedContentHash, sent, id, requestId);
        }
    }

    /** 201 for a new pair decision, 200 for a replay of a known requestId. The token is checked before the body is read. */
    @PostMapping("/pairs/{ddinterA}/{ddinterB}/decisions")
    public Mono<ResponseEntity<ApiResponse<SeniorViews.PairOutcome>>> decide(@PathVariable String ddinterA, @PathVariable String ddinterB,
            @RequestHeader(value = InternalAuth.HEADER, required = false) String token, @RequestBody Mono<PairDecisionBody> body) {
        auth.require(token);
        return body.flatMap(b -> service.decide(ddinterA, ddinterB, b.toRequest()))
            .map(o -> ResponseEntity.status(o.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(ApiResponse.ok(o)));
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests PairDecisionIntegrationTest --tests PairQueueIntegrationTest --tests AuditAppendOnlyIntegrationTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/application/port/SeniorReviewPort.java \
  api/src/main/java/com/niramoy/bddrug/application/SeniorReviewService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSeniorReviewAdapter.java \
  api/src/main/java/com/niramoy/bddrug/presentation/SeniorReviewController.java \
  api/src/test/java/com/niramoy/bddrug/PairDecisionIntegrationTest.java
git commit -m "feat(api): senior pair decisions: append-only, versioned by content hash and last review, idempotent, audited (§7.7)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: Public rules — the checker's coarse `pairReview`, removed items never public (PO D7), and the status guard

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/InteractionAlert.java`, `api/src/main/java/com/niramoy/bddrug/application/port/CheckQueryPort.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java`, `api/src/main/java/com/niramoy/bddrug/application/InteractionCheckService.java`
- Test: `api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java`, `api/src/test/java/com/niramoy/bddrug/PairQueueIntegrationTest.java`; Create: `api/src/test/java/com/niramoy/bddrug/PublicStatusGuardTest.java`

**Interfaces:**
- Consumes: Task 5's `PairContent`, `PairReviewRule.publicReview`; Task 7b's `PairReviewReader`; P3's `ReviewSql.statusOf`, `ReviewSql.LATEST_PUBLIC`.
- Produces: each alert of `POST /v1/interactions/check` adds `ddinterA`, `ddinterB` and `pairReview: {state: "reviewed"|"not_reviewed", reviewedAt: ISO|null}` (Task 0's amended §7.4); `InteractionAlert`'s eight-argument constructor stays (the three new fields null). `CheckQueryPort.CheckData` gains `Map<String, List<PairReviewRule.Decision>> reviews` (its five-argument constructor stays, with no reviews). `PublicStatusGuardTest` fails when an adapter outside the reviewer list mentions `batch_item` without `ReviewSql.statusOf(` or `ReviewSql.LATEST_PUBLIC`.

- [ ] **Step 1: Write the failing tests**

In `api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java`:

1. In the class Javadoc, after "and every product without a batch item.", add: ` D-1 (Motigut) was approved and then removed from its batch file: its latest item is ok and marked removed (PO D7).`
2. Append to the `seed()` SQL text block, after the last `INSERT`:

```sql
            -- PO D7: approved, then removed from its batch file (the product's latest item): never public anywhere
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('V-rm', 0, now() - interval '4 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('V-rm','DGDA-Drugs','D-1','ok','removed from batch file', now() - interval '4 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('V-rm','D-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '230 minute');
```

3. In `unapprovedProductDetailIsTheHiddenShape`, change the comment on the `D-1` line to `// approved, then removed from its batch file (PO D7)`.
4. Append, before the final `}`:

```java
    // ---- PO D7 (§7.4, §11.3): the approved-then-removed fixture on every public endpoint of the matrix

    @Test void anApprovedThenRemovedProductIsNeverPublicOnAnyEndpoint() {
        expectHidden("D-1", "Motigut", "pending");
        web.get().uri("/v1/products?q=motigut").exchange().expectStatus().isOk().expectBody().jsonPath("$.data.length()").isEqualTo(0);
        String loaded = str(web.get().uri("/v1/products/loaded").exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody());
        assertThat(loaded).doesNotContain("D-1", "Motigut");
        web.get().uri("/v1/substances/BDS-000004").exchange().expectStatus().isOk().expectBody().jsonPath("$.data.hidden").isEqualTo(true);
        String checked = str(check(web, null, "W-1", "D-1").expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("W-1"))
            .jsonPath("$.data.notReviewed[*].conceptId").isEqualTo(List.of("D-1"))
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0)
            .returnResult().getResponseBody());
        assertThat(checked).doesNotContain("Motigut", "Domperidone", "BDS-000004");
        web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.approvedProducts").isEqualTo(3)
            .jsonPath("$.data.batches[?(@.batchId == 'V-rm')].items[0].status").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.batches[?(@.batchId == 'V-rm')].items[0].exampleUsable").isEqualTo(List.of(false));
    }

    // ---- P1C public pairReview (§7.4, D53): coarse, never changed or issue, never a note, role or email

    @Test void publicPairReviewIsReviewedOnlyForACurrentReview() throws Exception {
        check(web, null, "N-1", "W-1").expectStatus().isOk().expectBody()
            .jsonPath("$.data.alerts[0].ddinterA").isEqualTo("DDInter14")
            .jsonPath("$.data.alerts[0].ddinterB").isEqualTo("DDInter1951")
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.alerts[0].pairReview.reviewedAt").isEmpty();
        String row = "INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role) " +
                     "VALUES ('DDInter14', 'DDInter1951', '%s', '%s', '%s', '{}', 'senior.reviewer@example.org', 'senior')";
        String current = com.niramoy.bddrug.domain.PairContent.hash("DDInter14", "DDInter1951",
            new com.niramoy.bddrug.domain.PairContent.Content("moderate", List.of(), null, null));
        exec(pg, row.formatted("reviewed", "", "f".repeat(64)));                         // reviewed, then DDInter changed it
        exec(pg, row.formatted("issue", "Text contradicts the severity; check", current));   // then a senior reported an issue
        String body = str(check(web, null, "N-1", "W-1").expectStatus().isOk().expectBody()
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.alerts[0].interaction").isEmpty()
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")   // the alert is never hidden (G3)
            .returnResult().getResponseBody());
        assertThat(body).doesNotContain("contradicts", "senior", "issue", "changed", "@example.org");
        exec(pg, row.formatted("reviewed", "", current));
        check(web, null, "N-1", "W-1").expectStatus().isOk().expectBody()
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.alerts[0].pairReview.reviewedAt").isNotEmpty();
    }
```

In `api/src/test/java/com/niramoy/bddrug/PairQueueIntegrationTest.java`, in `changedPairReturnsToQueue`, after the `?show=reviewed` assertion add:

```java
        internal(web).post().uri("/v1/interactions/check").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .bodyValue(java.util.Map.of("conceptIds", List.of("W-1", "N-1"))).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("reviewed");
```

and after the `UPDATE curated.ddinter_pair …` line's `?show=changed` assertion block add:

```java
        web.post().uri("/v1/interactions/check").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .bodyValue(java.util.Map.of("conceptIds", List.of("W-1", "N-1"))).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("not_reviewed");   // S8: the public line, no record re-opened
```

Create `api/src/test/java/com/niramoy/bddrug/PublicStatusGuardTest.java`:

```java
package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.4 PO D7, §11.3: every public adapter reads a product's status through ReviewSql.statusOf or ReviewSql.LATEST_PUBLIC,
 * the one rule (a latest item marked "removed from batch file" is never public). Reviewer adapters read batch items
 * directly and are listed by name, so a new adapter must either use the rule or be added here in review.
 */
class PublicStatusGuardTest {
    static final Path DIR = Path.of("src/main/java/com/niramoy/bddrug/adapter/persistence");
    static final Set<String> REVIEWER_ONLY = Set.of("R2dbcReviewAdapter.java", "R2dbcReviewQueryAdapter.java", "R2dbcBatchAdapter.java",
        "R2dbcSeniorReviewAdapter.java", "R2dbcFlagAdapter.java", "R2dbcAuditAdapter.java", "ReviewSql.java", "PairReviewReader.java");

    static boolean readsStatusWithoutTheRule(String source) {
        return source.contains("batch_item") && !source.contains("ReviewSql.statusOf(") && !source.contains("ReviewSql.LATEST_PUBLIC");
    }

    @Test void everyPublicAdapterReadsStatusThroughTheOneRule() throws IOException {
        List<String> offenders = new ArrayList<>(), ruled = new ArrayList<>();
        try (Stream<Path> files = Files.list(DIR)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".java")).sorted().toList()) {
                String name = f.getFileName().toString(), src = Files.readString(f);
                if (REVIEWER_ONLY.contains(name)) continue;
                if (readsStatusWithoutTheRule(src)) offenders.add(name);
                if (src.contains("ReviewSql.statusOf(") || src.contains("ReviewSql.LATEST_PUBLIC")) ruled.add(name);
            }
        }
        assertThat(offenders).isEmpty();
        assertThat(ruled).contains("R2dbcProductAdapter.java", "R2dbcSubstanceAdapter.java", "R2dbcCheckAdapter.java", "R2dbcStatsAdapter.java");
    }

    @Test void theReviewerListNamesFilesThatExist() {
        for (String name : REVIEWER_ONLY) assertThat(DIR.resolve(name)).as(name).exists();
    }

    @Test void theGuardCatchesARawRead() {
        assertThat(readsStatusWithoutTheRule("SELECT bi.review FROM ops.batch_item bi WHERE bi.concept_id = :c")).isTrue();
        assertThat(readsStatusWithoutTheRule("SELECT " + "ReviewSql.statusOf(" + "\"bp.concept_id\") FROM ops.batch_item")).isFalse();
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests VisibilityApiIntegrationTest --tests PairQueueIntegrationTest --tests PublicStatusGuardTest`
Expected: FAIL. `anApprovedThenRemovedProductIsNeverPublicOnAnyEndpoint` passes already (P3's rule); the `pairReview` assertions fail (`$.data.alerts[0].pairReview` does not exist). `PublicStatusGuardTest` passes (it pins the current state).

- [ ] **Step 3: Add the field**

Replace `api/src/main/java/com/niramoy/bddrug/domain/InteractionAlert.java` with:

```java
package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * One DDInter alert of the checker. P1C adds the pair's entries and its coarse public review state (§7.4, D53): every
 * alert is returned with its DDInter text whatever its senior-review state; senior review is never a gate.
 */
public record InteractionAlert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                               boolean routeAssumed, String source, String ddinterA, String ddinterB,
                               PairReviewRule.PublicReview pairReview) {
    /** A DDInter placeholder ("None", "-", blank) is no text: null, never shown as if it were advice. */
    public InteractionAlert {
        interaction = DdinterText.clean(interaction);
        management = DdinterText.clean(management);
    }

    public InteractionAlert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                            boolean routeAssumed, String source) {
        this(severity, a, b, actions, interaction, management, routeAssumed, source, null, null, null);
    }

    public record Side(String conceptId, String bdsId, String name) {}
}
```

In `api/src/main/java/com/niramoy/bddrug/application/port/CheckQueryPort.java`, replace `CheckData` with (import `com.niramoy.bddrug.domain.PairReviewRule`):

```java
    record CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                     Set<String> listedCodes, List<PairRow> pairs, Map<String, List<PairReviewRule.Decision>> reviews) {
        public CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                         Set<String> listedCodes, List<PairRow> pairs) {
            this(products, ingredients, codesByBds, listedCodes, pairs, Map.of());
        }
    }
```

(and extend its Javadoc with: `{@code reviews}: the senior pair decisions among the loaded codes, keyed "{a}|{b}", for the public pairReview (§7.4).`)

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java`, add a `PairReviewReader pairReviews` constructor parameter and field, and replace the last line of `load` (`return codes(bds).flatMap(…)`) with:

```java
            return codes(bds).flatMap(codes -> Mono.zip(pairs(codes.byBds()),
                    pairReviews.forCodes(codes.byBds().values().stream().flatMap(List::stream).map(DdinterCode::code).toList(), null))
                .map(p -> new CheckData(t.getT1(), t.getT2(), codes.byBds(), codes.listed(), p.getT1(), p.getT2())));
```

In `api/src/main/java/com/niramoy/bddrug/application/InteractionCheckService.java` (imports `com.niramoy.bddrug.domain.PairContent`, `com.niramoy.bddrug.domain.PairReviewRule`):

1. In `compute`, change the call `alertsFor(a, b, pairs, alerts)` to `alertsFor(a, b, pairs, data.reviews(), alerts)`.
2. Replace `alertsFor` with:

```java
    private static void alertsFor(Usable a, Usable b, Map<String, PairRow> pairs, Map<String, List<PairReviewRule.Decision>> reviews,
                                  List<InteractionAlert> out) {
        boolean assumed = a.choice().routeAssumed() || b.choice().routeAssumed();
        Set<String> seen = new HashSet<>();
        for (DdinterCode ca : a.choice().codes())
            for (DdinterCode cb : b.choice().codes()) {
                if (ca.code().equals(cb.code())) continue;
                String key = pairKey(ca.code(), cb.code());
                PairRow pair = pairs.get(key);
                if (pair == null || !seen.add(key)) continue;
                String hash = PairContent.hash(pair.ddinterA(), pair.ddinterB(),
                    new PairContent.Content(pair.severity(), pair.actions(), pair.interaction(), pair.management()));
                out.add(new InteractionAlert(pair.severity(),
                    new InteractionAlert.Side(a.conceptId(), a.bdsId(), a.name()),
                    new InteractionAlert.Side(b.conceptId(), b.bdsId(), b.name()),
                    pair.actions(), pair.interaction(), pair.management(), assumed, SOURCE, pair.ddinterA(), pair.ddinterB(),
                    PairReviewRule.publicReview(reviews.getOrDefault(pair.ddinterA() + "|" + pair.ddinterB(), List.of()), hash)));
            }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests VisibilityApiIntegrationTest --tests PairQueueIntegrationTest --tests PublicStatusGuardTest --tests CheckApiIntegrationTest --tests InteractionCheckServiceTest --tests DdinterTextTest`
Expected: PASS.

- [ ] **Step 5: Run the whole API suite**

Run: `cd api && ./gradlew test --no-daemon`
Expected: PASS (every API task of this plan is in).

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/InteractionAlert.java api/src/main/java/com/niramoy/bddrug/application/port/CheckQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/InteractionCheckService.java \
  api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java api/src/test/java/com/niramoy/bddrug/PairQueueIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/PublicStatusGuardTest.java
git commit -m "feat(api): checker alerts carry the coarse public pairReview; PO D7 fixture on every public endpoint; status guard (§7.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: ETL snapshot payload version 2 and `approval_view` (§8.1 item 4, §8.3.1)

**Files:**
- Modify: `etl/src/bddrug_etl/load/snapshots.py`
- Test: `etl/tests/test_snapshots.py`

**Interfaces:**
- Consumes: `choose` from `bddrug_etl.stages.ddinter`.
- Produces: `PAYLOAD_VERSION = 2`; each payload ingredient gains `coverage` (`full`, `none`, `not_run` when no coverage row, `None` for an ingredient with no substance); a payload may carry `carried_from: {batchId, extractedAt}`; `build_payload(conn, batch_id, concept_id, extracted_at: datetime | None, *, carried_from: dict | None = None)` (`extracted_at` None is written as null); `write_snapshots(conn, items, run_id, *, shared=False, carried_from=None)`; `approval_view(payload) → dict` (brand fields, clinical drug, per ingredient ordered by XM code: XM code, BDS id, substance, strength, non-DDInter codes, chosen DDInter entries with their route scope, `route_assumed`, and `coverage` when the payload has it); `same_view(a, b) → bool` (coverage left out of the comparison when either side lacks it); `view_at(conn, batch_id, concept_id, extracted_at) → dict | None` (the approval view of the snapshot at that stamp, None when there is none).

- [ ] **Step 1: Write the failing tests**

In `etl/tests/test_snapshots.py`:

1. In `test_payload_holds_the_fields_the_api_diff_reads`, replace `assert payload["version"] == 1 and …` with `assert payload["version"] == 2 and payload["extracted_at"] == at.isoformat()` and after the `ing["ddinter_chosen"] …` line add `assert ing["coverage"] == "not_run"   # no interaction_coverage row in the seed` and `assert "carried_from" not in payload`.
2. Change the import line to `from bddrug_etl.load.snapshots import approval_view, build_payload, same_view, view_at, write_snapshots`.
3. Append:

```python
# --- the approval view (§8.3.1): what an approval covers, as a pure function of the payload ---

def payload(**over):
    p = {
        "version": 2, "extracted_at": "2026-10-12T09:00:00+00:00",
        "brand": {"dar_number": "127-0163-052", "trade_name": "Chloramphenicol", "company": "ইডিসিএল", "dosage_form": "Eye Drops",
                  "generic_content_raw": "Chloramphenicol 5 mg/ml"},
        "clinical_drug": {"bdc_id": "BDC-000001", "display_name": "Chloramphenicol 0.5% eye drops", "dose_form": "Eye Drops",
                          "route": "ophthalmic"},
        "ingredients": [{"xm_code": "XM7HA7", "name": "Chloramphenicol", "bds_id": "BDS-000001", "substance": "Chloramphenicol",
                         "strength": {"raw": "Chloramphenicol 0.5%", "value": "0.5", "unit": "%", "per_value": None, "per_unit": None},
                         "codes": [{"system": "ICD11_XM", "code": "XM7HA7", "route_scope": "any"},
                                   {"system": "ATC", "code": "S01AA01", "route_scope": "any"},
                                   {"system": "DDINTER", "code": "DDInter351", "route_scope": "systemic"},
                                   {"system": "DDINTER", "code": "DDInter352", "route_scope": "ophthalmic"}],
                         "ddinter_chosen": ["DDInter352"], "route_assumed": False, "coverage": "full"}],
        "stages": {"ddinter": {"status": "ok", "note": ""}},
    }
    p.update(over)
    return p


def with_ingredient(**over):
    p = payload()
    p["ingredients"] = [{**p["ingredients"][0], **over}]
    return p


def test_the_view_ignores_what_an_approval_does_not_cover():
    base = approval_view(payload())
    assert same_view(base, approval_view(payload(extracted_at="2026-10-13T00:00:00+00:00")))
    assert same_view(base, approval_view(payload(stages={"ddinter": {"status": "warn", "note": "DDInter text not found for a/b"}})))
    assert same_view(base, approval_view(with_ingredient(name="Chloramphenicol palmitate")))   # the DGDA ingredient name
    # a new DDInter entry for another route changes no chosen entry (§8.3.1 "not covered")
    otic = payload()["ingredients"][0]["codes"] + [{"system": "DDINTER", "code": "DDInter353", "route_scope": "otic"}]
    assert same_view(base, approval_view(with_ingredient(codes=otic)))


def test_the_view_changes_with_every_covered_field():
    base = approval_view(payload())
    changed = [
        payload(brand={**payload()["brand"], "company": "Other Co"}),
        payload(clinical_drug={**payload()["clinical_drug"], "route": "otic"}),
        with_ingredient(strength={**payload()["ingredients"][0]["strength"], "value": "1"}),
        with_ingredient(codes=payload()["ingredients"][0]["codes"] + [{"system": "ATC", "code": "J01BA01", "route_scope": "any"}]),
        with_ingredient(ddinter_chosen=["DDInter351"]),
        with_ingredient(route_assumed=True),
        with_ingredient(coverage="none"),
        with_ingredient(bds_id="BDS-000002"),
    ]
    for p in changed:
        assert not same_view(base, approval_view(p)), p


def test_v1_payload_compares_without_coverage():
    v1 = payload(version=1)
    v1["ingredients"] = [{k: v for k, v in v1["ingredients"][0].items() if k != "coverage"}]
    assert same_view(approval_view(v1), approval_view(payload()))
    assert same_view(approval_view(payload()), approval_view(v1))
    # the chosen entries still catch a full-to-none change against a version-1 snapshot
    none = with_ingredient(coverage="none", ddinter_chosen=[], codes=[c for c in payload()["ingredients"][0]["codes"] if c["system"] != "DDINTER"])
    assert not same_view(approval_view(v1), approval_view(none))


def test_ingredient_order_does_not_matter():
    two = payload()
    second = {**two["ingredients"][0], "xm_code": "XM0001", "bds_id": "BDS-000009", "substance": "Other"}
    a, b = payload(ingredients=[two["ingredients"][0], second]), payload(ingredients=[second, two["ingredients"][0]])
    assert same_view(approval_view(a), approval_view(b))


def test_a_carried_approval_is_written_into_the_snapshot_and_view_at_reads_the_stamp(conn):
    run_id = uuid.uuid4()
    stamp(conn)
    carried = {"batchId": "0001-pilot", "extractedAt": "2026-10-11T21:28:41.231692+00:00"}
    assert write_snapshots(conn, [("0700-snap", CID)], run_id, carried_from=carried) == 1
    at = conn.execute("SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0700-snap' AND concept_id = %s", (CID,)).fetchone()[0]
    p = conn.execute("SELECT payload FROM ops.item_snapshot WHERE concept_id = %s AND extracted_at = %s", (CID, at)).fetchone()[0]
    assert p["carried_from"] == carried
    assert same_view(view_at(conn, "0700-snap", CID, at), approval_view(build_payload(conn, "0700-snap", CID, at)))
    assert view_at(conn, "0700-snap", CID, None) is None
    assert build_payload(conn, "0700-snap", CID, None)["extracted_at"] is None
    conn.rollback()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd etl && pytest tests/test_snapshots.py -q`
Expected: FAIL (`ImportError: cannot import name 'approval_view'`).

- [ ] **Step 3: Implement**

In `etl/src/bddrug_etl/load/snapshots.py`:

1. Change the module docstring's last sentence to: `The table is append-only (V6 triggers): nothing here updates or deletes a row. Since P1C (§8.3.1) the payload (version 2) also records each ingredient's coverage, and ``approval_view`` is the part of it a pharmacist's approval covers.`
2. Replace `PAYLOAD_VERSION = 1` with:

```python
PAYLOAD_VERSION = 2
COVERED_SYSTEMS = ("ICD11_XM", "RXCUI", "ATC", "DRUGBANK", "SNOMEDCT")
BRAND_KEYS = ("dar_number", "trade_name", "company", "dosage_form", "generic_content_raw")
CLINICAL_KEYS = ("bdc_id", "display_name", "dose_form", "route")
STRENGTH_KEYS = ("raw", "value", "unit", "per_value", "per_unit")
```

3. Change the signature of `build_payload` to

```python
def build_payload(conn: psycopg.Connection, batch_id: str, concept_id: str, extracted_at: datetime | None, *,
                  carried_from: dict | None = None) -> dict:
```

inside its ingredient loop, before `ingredients.append(…)`, add

```python
        coverage = None
        if bds_id:
            crow = conn.execute("SELECT coverage FROM curated.interaction_coverage WHERE bds_id = %s", (bds_id,)).fetchone()
            coverage = crow[0] if crow else "not_run"
```

add `"coverage": coverage` to the appended dict (after `"route_assumed": …`), and replace the `return {…}` with:

```python
    payload = {
        "version": PAYLOAD_VERSION,
        "extracted_at": None if extracted_at is None else extracted_at.isoformat(),
        "brand": None if brand is None else {"dar_number": brand[0], "trade_name": brand[1], "company": brand[2],
                                             "dosage_form": brand[3], "generic_content_raw": brand[4]},
        "clinical_drug": clinical,
        "ingredients": ingredients,
        "stages": {s: stages[s] for s in STAGES if s in stages},
    }
    if carried_from is not None:
        payload["carried_from"] = carried_from
    return payload
```

4. Change `write_snapshots` to accept and pass `carried_from`:

```python
def write_snapshots(conn: psycopg.Connection, items: list[tuple[str, str]], run_id: uuid.UUID, *,
                    shared: bool = False, carried_from: dict | None = None) -> int:
```

and in its `INSERT`, build the payload with `build_payload(conn, batch_id, concept_id, extracted_at, carried_from=carried_from)`.

5. Append:

```python
def approval_view(payload: dict) -> dict:
    """§8.3.1: what an approval covers, from a snapshot payload. Brand fields, the clinical drug and, per ingredient (by
    XM code), the substance, its strength, its non-DDInter codes, its chosen DDInter entries with their route scope and
    whether the route was assumed, and its coverage (version 2 payloads only). Never stage notes, DDInter pairs, texts,
    diseases, foods, entry names or synonyms."""
    brand, clinical = payload.get("brand"), payload.get("clinical_drug")
    ingredients = []
    for ing in sorted(payload.get("ingredients") or [], key=lambda i: i.get("xm_code") or ""):
        codes = ing.get("codes") or []
        scopes = {c.get("code"): c.get("route_scope") for c in codes if c.get("system") == "DDINTER"}
        strength = ing.get("strength")
        view = {
            "xm_code": ing.get("xm_code"), "bds_id": ing.get("bds_id"), "substance": ing.get("substance"),
            "strength": None if strength is None else {k: strength.get(k) for k in STRENGTH_KEYS},
            "codes": sorted([c.get("system"), c.get("code")] for c in codes if c.get("system") in COVERED_SYSTEMS),
            "chosen": sorted([cid, scopes.get(cid)] for cid in ing.get("ddinter_chosen") or []),
            "route_assumed": bool(ing.get("route_assumed")),
        }
        if "coverage" in ing:
            view["coverage"] = ing["coverage"]
        ingredients.append(view)
    return {
        "brand": None if brand is None else {k: brand.get(k) for k in BRAND_KEYS},
        "clinical_drug": None if clinical is None else {k: clinical.get(k) for k in CLINICAL_KEYS},
        "ingredients": ingredients,
    }


def same_view(a: dict, b: dict) -> bool:
    """Equal approval views. A version-1 payload has no coverage: then coverage is left out of this one comparison, and
    the chosen entries still catch a full-to-none change (§8.3.1 step 3)."""
    if any("coverage" not in i for i in a["ingredients"] + b["ingredients"]):
        def strip(v: dict) -> dict:
            return {**v, "ingredients": [{k: x for k, x in i.items() if k != "coverage"} for i in v["ingredients"]]}
        return strip(a) == strip(b)
    return a == b


def view_at(conn: psycopg.Connection, batch_id: str, concept_id: str, extracted_at: datetime | None) -> dict | None:
    """The approval view of the snapshot written at this stamp; None when there is no stamp or no snapshot at it."""
    if extracted_at is None:
        return None
    row = conn.execute(
        "SELECT payload FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s AND extracted_at = %s",
        (batch_id, concept_id, extracted_at)).fetchone()
    return None if row is None else approval_view(row[0])
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd etl && pytest tests/test_snapshots.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add etl/src/bddrug_etl/load/snapshots.py etl/tests/test_snapshots.py
git commit -m "feat(etl): snapshot payload version 2 (coverage, carried_from) and approval_view (§8.1 item 4, §8.3.1)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: ETL `settle()` — the reopen rule replaces unconditional stamping (§8.3.1)

**Files:**
- Modify: `etl/src/bddrug_etl/load/batches.py`, `etl/src/bddrug_etl/jobs/run_pipeline.py`, `etl/src/bddrug_etl/stages/results.py` (docstring), `etl/src/bddrug_etl/stages/substances.py` (docstring)
- Create: `etl/tests/test_reopen_rule.py`
- Modify tests: `etl/tests/test_batches.py`, `etl/tests/test_shared_reopen.py`, `etl/tests/test_run_pipeline.py`, `etl/tests/test_pipeline_scale.py`

**Interfaces:**
- Consumes: Task 10's `approval_view`, `same_view`, `view_at`, `build_payload`, `write_snapshots(…, carried_from=…)`.
- Produces: in `bddrug_etl.load.batches`: `DgdaTargets(new, readded, recovered, issues)`; `Settled(stamped, reopened, carried, skipped)` (lists of `(batch_id, concept_id)`, `skipped` of concept ids); `BatchStats(LoadStats)` with `settled`; `REOPEN_SKIPPED = "skipped: approved, --reopen not confirmed"`; `settle(conn, batch_id, targets, changes=None, run_id=None, *, reopen=False, dgda=None) → Settled`; `run_batch(…, run_id=None, *, reopen=False) → BatchStats` and `run_batch_items(…)` likewise. `reopen_review` and `_reopen_dependents` are removed. In `run_pipeline`: `run_pipeline(…, reopen: bool = False)`; each stage settles its targets last in its transaction and logs `stage {stage} for batch {id} re-opened {n} record(s)[: b/c, …]`, `stage {stage} for batch {id} carried the approval of {n} record(s): …` and `stage {stage} for batch {id}: {concept} skipped: approved, --reopen not confirmed`.
- Rule, in order, per target: a DGDA load failure is stamped `issue` with its reason (and its note); an item back in its batch file after it was marked removed is stamped `pending` and its marker cleared in the same statement; an item whose DGDA load recovered (its note was a DGDA failure) is stamped `pending`; with `reopen`, a target whose `review = 'ok'` is skipped and every other target is stamped `pending`; otherwise the target is stamped only when its approval view now differs from the view of its snapshot at its current stamp (or it has no stamp or no snapshot there), and a new item of a product already approved elsewhere with the same view is stamped `ok` with `carried_from`. Dependents (other products with an ingredient in `changes.bds_ids`, latest current item only) are stamped `pending` with a `shared_change` snapshot only when their view changed; `changes.ddinter_ids` selects no one. The batch of every stamp, and the target batch, get their status recomputed (`approved` when every current item is `ok`).

- [ ] **Step 1: Write the failing tests**

Create `etl/tests/test_reopen_rule.py`:

```python
"""Spec §8.3.1, the P1C reopen rule (PO D5, D54): a record goes back to review only when something its approval covered
changes. Uses the products and fakes of test_shared_reopen: X and Y share substance XMSH1 (Sharedium, DDInter SH), Z has
Otherium (OT), W Wexium."""
import logging

import psycopg
from psycopg.types.json import Jsonb

from bddrug_etl.rxnav.client import RxCodes
from test_shared_reopen import (  # noqa: F401  (url and clean are fixtures)
    ALIAS, BOTH, OT, SH, X, Y, Z, FakeDDInter, FakeRxNav, Harness, approve, batch_status, clean, concept, concepts, coverage,
    ddinter_codes, item, q, run, url)


def snapshots(url, batch_id, cid):
    return q(url, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))[0][0]


def stage_time(url, batch_id, cid):
    return q(url, "SELECT max(updated_at) FROM ops.stage_result WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))[0][0]


def note(url, batch_id, cid):
    return q(url, "SELECT note FROM ops.batch_item WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))[0][0]


def reopened_lines(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "run_pipeline" and " re-opened " in r.getMessage()]


class NoText(FakeDDInter):
    """DDInter gives the pairs no interaction id: no text is fetched."""

    def pair_interaction_id(self, ddinter_id, partner_id):
        return None


class Richer(FakeDDInter):
    """The same entries, now with an interaction text, a disease and a food for each entry."""

    def diseases(self, ddinter_id):
        return [{"interaction_id": f"D-{ddinter_id}", "disease_name": "Liver disease", "severity": "moderate",
                 "text": "Check the dose.", "references": []}]

    def foods(self, ddinter_id):
        return [{"interaction_id": f"F-{ddinter_id}", "food_name": "Grapefruit", "severity": "minor", "mechanism": None,
                 "interaction": "Raises levels.", "management": "Avoid.", "references": []}]


class RxWithAtc(FakeRxNav):
    """RxNav now knows Sharedium, with an ATC code."""

    def rxcui_for_name(self, name):
        return ("90001", "rxnav-exact") if name == "Sharedium" else None

    def codes_for_rxcui(self, rxcui):
        return RxCodes(rxcui, "sharedium", "IN", ("N02BE01",), (), ())


def with_content(cid, content):
    table = concepts()
    c = table[cid]
    table[cid] = {**c, "extras": {**c["extras"], "generic_content_raw": content}}
    return table


def with_form(cid, form):
    table = concepts()
    c = table[cid]
    table[cid] = {**c, "extras": {**c["extras"], "dosage_form": form}}
    return table


# --- unchanged re-runs (S8) ----------------------------------------------------------------------

def test_unchanged_rerun_stamps_nothing(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter(BOTH, {frozenset((SH, OT)): "major"})
    assert run(Harness(url, dd), tmp_path, "0400-a", [X, Z]) == 0
    approve(url, "0400-a", X)
    before, snaps, stages = item(url, "0400-a", X), snapshots(url, "0400-a", X), stage_time(url, "0400-a", X)
    caplog.clear()
    assert run(Harness(url, dd), tmp_path, "0400-a", [X, Z]) == 0
    assert item(url, "0400-a", X) == before                      # still ok, same stamp
    assert snapshots(url, "0400-a", X) == snaps                  # no snapshot without a stamp
    assert stage_time(url, "0400-a", X) > stages                 # stage results are still replaced
    assert reopened_lines(caplog) and all(" re-opened 0 record(s)" in line for line in reopened_lines(caplog))


def test_rerun_against_a_v1_snapshot_stamps_nothing(url, tmp_path):
    """Review Focus 1: the pilot's snapshots are version 1 (no coverage). The P1C pilot check must stamp nothing."""
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0401-a", [X]) == 0
    approve(url, "0401-a", X)
    before = item(url, "0401-a", X)
    with psycopg.connect(url) as c:
        payload = c.execute("SELECT payload FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s AND extracted_at = %s",
                            ("0401-a", X, before[1])).fetchone()[0]
        payload["version"] = 1
        for ing in payload["ingredients"]:
            ing.pop("coverage", None)
        # Only this throwaway test database switches the append-only trigger off, to stand in for a pre-P1C snapshot.
        c.execute("ALTER TABLE ops.item_snapshot DISABLE TRIGGER item_snapshot_append_only")
        c.execute("UPDATE ops.item_snapshot SET payload = %s WHERE batch_id = %s AND concept_id = %s AND extracted_at = %s",
                  (Jsonb(payload), "0401-a", X, before[1]))
        c.execute("ALTER TABLE ops.item_snapshot ENABLE TRIGGER item_snapshot_append_only")
    assert run(Harness(url, dd), tmp_path, "0401-a", [X], "--stages", "ddinter") == 0
    assert item(url, "0401-a", X) == before


def test_batch_status_recomputed_not_forced(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0402-a", [X]) == 0
    approve(url, "0402-a", X)
    assert batch_status(url, "0402-a") == "approved"
    assert run(Harness(url, dd), tmp_path, "0402-a", [X]) == 0
    assert batch_status(url, "0402-a") == "approved"


# --- what is not covered ---------------------------------------------------------------------------

def test_pair_change_reopens_no_record(url, tmp_path):
    pair = frozenset((SH, OT))
    assert run(Harness(url, NoText(BOTH, {pair: "major"})), tmp_path, "0403-a", [X, Z]) == 0
    approve(url, "0403-a", X)
    approve(url, "0403-a", Z)
    before = q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0403-a' ORDER BY 1")
    snaps = q(url, "SELECT count(*) FROM ops.item_snapshot")[0][0]
    # DDInter changes the pair's severity, gives it a text, and adds a disease and a food to each entry
    assert run(Harness(url, Richer(BOTH, {pair: "minor"})), tmp_path, "0403-a", [X, Z], "--stages", "ddinter") == 0
    assert q(url, "SELECT severity FROM curated.ddinter_pair") == [("minor",)]
    assert q(url, "SELECT count(*) FROM curated.ddinter_interaction_text")[0][0] == 1
    assert q(url, "SELECT count(*) FROM curated.ddinter_disease")[0][0] == 2
    assert q(url, "SELECT count(*) FROM curated.ddinter_food")[0][0] == 2
    assert q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0403-a' ORDER BY 1") == before
    assert q(url, "SELECT count(*) FROM ops.item_snapshot")[0][0] == snaps
    assert batch_status(url, "0403-a") == "approved"


def test_other_route_entry_is_not_covered(url, tmp_path):
    assert run(Harness(url, FakeDDInter({SH: "Sharedium"})), tmp_path, "0404-a", [X]) == 0
    approve(url, "0404-a", X)
    before = item(url, "0404-a", X)
    # Y's run maps a new otic DDInter entry for the shared substance; X is systemic, so its chosen entry stays SH
    otic = FakeDDInter({SH: "Sharedium", "DDInter7005": "Sharedium (otic)"})
    assert run(Harness(url, otic), tmp_path, "0404-b", [Y]) == 0
    assert "DDInter7005" in [code for code, _ in ddinter_codes(url, X)]
    assert item(url, "0404-a", X) == before


# --- what is covered -------------------------------------------------------------------------------

def test_covered_change_reopens_a_strength_change_stamps_the_target_only(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0405-a", [X]) == 0
    assert run(Harness(url, dd), tmp_path, "0405-b", [Y]) == 0
    decided = approve(url, "0405-a", X)
    approve(url, "0405-b", Y)
    y_before = item(url, "0405-b", Y)
    assert run(Harness(url, dd, with_content(X, "Sharedium 10 mg")), tmp_path, "0405-a", [X]) == 0
    review, stamp = item(url, "0405-a", X)
    assert review == "pending" and stamp > decided
    assert item(url, "0405-b", Y) == y_before


def test_covered_change_reopens_a_route_change(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0406-a", [X]) == 0
    decided = approve(url, "0406-a", X)
    assert run(Harness(url, dd, with_form(X, "Eye Drops")), tmp_path, "0406-a", [X]) == 0
    review, stamp = item(url, "0406-a", X)
    assert review == "pending" and stamp > decided


def test_covered_change_reopens_a_new_atc_code_through_another_batch(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0407-a", [X]) == 0
    decided = approve(url, "0407-a", X)
    assert run(Harness(url, dd, rxnav=RxWithAtc()), tmp_path, "0407-b", [Y]) == 0
    review, stamp = item(url, "0407-a", X)
    assert review == "pending" and stamp > decided
    assert q(url, """SELECT reason FROM ops.item_snapshot WHERE batch_id = '0407-a' AND concept_id = %s
                     ORDER BY extracted_at DESC LIMIT 1""", (X,)) == [("shared_change",)]


def test_covered_change_reopens_a_chosen_entry_change(url, tmp_path):
    assert run(Harness(url, FakeDDInter({SH: "Sharedium"})), tmp_path, "0408-a", [X]) == 0
    decided = approve(url, "0408-a", X)
    dd = FakeDDInter({SH: "Sharedium", ALIAS: "Shared-alias"})
    assert run(Harness(url, dd, concepts(y_content="Shared-alias 5 mg")), tmp_path, "0408-b", [Y]) == 0
    review, stamp = item(url, "0408-a", X)
    assert review == "pending" and stamp > decided


def test_covered_change_reopens_coverage_full_to_none(url, tmp_path):
    assert run(Harness(url, FakeDDInter(BOTH)), tmp_path, "0409-a", [X]) == 0
    decided = approve(url, "0409-a", X)
    assert run(Harness(url, FakeDDInter({})), tmp_path, "0409-b", [Y]) == 0
    assert coverage(url, X) == [("none",)]
    review, stamp = item(url, "0409-a", X)
    assert review == "pending" and stamp > decided


# --- always stamped (§8.3.1 item 5) -----------------------------------------------------------------

def test_dgda_failure_still_stamps_issue(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0410-a", [X]) == 0
    decided = approve(url, "0410-a", X)
    gone = {k: v for k, v in concepts().items() if k != X}
    run(Harness(url, dd, gone), tmp_path, "0410-a", [X])
    review, stamp = item(url, "0410-a", X)
    assert (review, note(url, "0410-a", X)) == ("issue", "not found at source") and stamp > decided


def test_readded_item_is_stamped(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0411-a", [X, Z]) == 0
    approve(url, "0411-a", X)
    stamp = item(url, "0411-a", X)[1]
    assert run(Harness(url, dd), tmp_path, "0411-a", [Z]) == 0
    assert (item(url, "0411-a", X), note(url, "0411-a", X)) == (("ok", stamp), "removed from batch file")
    # statusOf reads a removed latest item as pending: never public while removed
    assert run(Harness(url, dd), tmp_path, "0411-a", [X, Z]) == 0
    review, again = item(url, "0411-a", X)
    assert (review, note(url, "0411-a", X)) == ("pending", None) and again > stamp


def test_note_written_without_stamp(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0412-a", [X, Z]) == 0
    approve(url, "0412-a", X)
    approve(url, "0412-a", Z)
    x_before, z_before = item(url, "0412-a", X), item(url, "0412-a", Z)
    assert run(Harness(url, dd), tmp_path, "0412-a", [Z]) == 0
    assert item(url, "0412-a", X) == x_before and note(url, "0412-a", X) == "removed from batch file"
    assert item(url, "0412-a", Z) == z_before and note(url, "0412-a", Z) is None
    assert batch_status(url, "0412-a") == "approved"   # Z is the batch's only current item, and it is ok


def test_a_dgda_load_that_recovers_reopens_the_pipelines_issue(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0413-a", [X]) == 0
    gone = {k: v for k, v in concepts().items() if k != X}
    run(Harness(url, dd, gone), tmp_path, "0413-a", [X])
    assert item(url, "0413-a", X)[0] == "issue"
    assert run(Harness(url, dd), tmp_path, "0413-a", [X]) == 0
    assert (item(url, "0413-a", X)[0], note(url, "0413-a", X)) == ("pending", None)


# --- a product listed again in a new batch (§8.3.1 item 8) ------------------------------------------

def test_relisted_product_carries_approval(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0414-a", [X]) == 0
    approve(url, "0414-a", X)
    a_before = item(url, "0414-a", X)
    assert run(Harness(url, dd), tmp_path, "0414-b", [X]) == 0
    assert item(url, "0414-b", X)[0] == "ok"
    carried = q(url, "SELECT reason, payload -> 'carried_from' FROM ops.item_snapshot WHERE batch_id = '0414-b' AND concept_id = %s", (X,))
    assert len(carried) == 1 and carried[0][0] == "run" and carried[0][1]["batchId"] == "0414-a"
    assert item(url, "0414-a", X) == a_before
    assert batch_status(url, "0414-b") == "approved"
    assert any("carried the approval of 1 record(s)" in r.getMessage() for r in caplog.records if r.name == "run_pipeline")


def test_relisted_product_with_changed_view_is_pending(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0415-a", [X]) == 0
    approve(url, "0415-a", X)
    assert run(Harness(url, dd, with_content(X, "Sharedium 10 mg")), tmp_path, "0415-b", [X]) == 0
    assert item(url, "0415-b", X)[0] == "pending"
    assert q(url, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = '0415-b' AND payload ? 'carried_from'")[0][0] == 0
```

In `etl/tests/test_batches.py`:

1. Replace `test_rerun_resets_review_to_pending` with:

```python
def test_unchanged_rerun_keeps_the_review_and_marks_what_left_the_file(conn):
    """§8.3.1: nothing the approval covered changed, so the review and the stamp stay; the note is still written."""
    keep = {**FIX, "id": "keep-1"}   # its own product: an approval here must not carry into the other tests' batches
    run_batch(conn, MultiClient({"keep-1": keep}), "0015-keep", ["keep-1", "keep-gone"])
    conn.execute("UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = '0015-keep' AND concept_id = 'keep-1'")
    conn.commit()
    before = conn.execute("SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0015-keep' AND concept_id = 'keep-1'").fetchone()[0]
    run_batch(conn, MultiClient({"keep-1": keep}), "0015-keep", ["keep-1"])
    assert items(conn, "0015-keep") == {"keep-1": ("ok", None), "keep-gone": ("issue", "removed from batch file")}
    assert conn.execute("SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0015-keep' AND concept_id = 'keep-1'"
                        ).fetchone()[0] == before
```

and move it below the definition of `items` (after `test_new_items_get_extracted_at`), since it uses that helper.

2. In `test_removed_item_readded_to_the_file_is_restamped_with_a_rerun_snapshot`, replace the last assertion with:

```python
    assert snapshot_reasons(conn, "0014-back", FIX["id"]) == ["run"]   # unchanged on both re-runs: no stamp, no snapshot (§8.3.1)
```

In `etl/tests/test_shared_reopen.py`:

1. Replace the module docstring with:

```python
"""Approval vs shared rows, under the P1C reopen rule (spec §8.3.1): a stage that changes substance-level rows for product Y
re-opens another product X only when something X's approval covered changed (codes, chosen DDInter entries, coverage).
Pairs, texts, diseases, foods and synonyms never re-open a record (PO D5).
"""
```

2. Replace `from bddrug_etl.load.batches import reopen_review` with `from bddrug_etl.load.batches import settle`.
3. Replace `test_a_substances_stage_change_alone_reopens_dependents` with:

```python
def test_a_new_synonym_alone_reopens_no_dependent(url, tmp_path):
    """§13.1 Q7: a new dgda_content name for the shared substance is not covered."""
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0301-a", [X]) == 0
    approve(url, "0301-a", X)
    before = item(url, "0301-a", X)
    h = Harness(url, dd, concepts(y_content="Shared-alias 5 mg"))
    assert run(h, tmp_path, "0301-b", [Y], "--stages", "dgda,substances") == 0
    assert item(url, "0301-a", X) == before
```

4. Replace `test_a_changed_pair_reopens_the_products_on_both_sides` with:

```python
def test_a_changed_pair_reopens_neither_side(url, tmp_path):
    """PO D5: a pair change makes the pair "changed" in the senior queue (API); no record re-opens."""
    pair = frozenset((SH, OT))
    assert run(Harness(url, FakeDDInter(BOTH, {pair: "major"})), tmp_path, "0303-a", [X, Z]) == 0
    approve(url, "0303-a", X)
    approve(url, "0303-a", Z)
    before = q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0303-a' ORDER BY 1")
    assert run(Harness(url, FakeDDInter(BOTH, {pair: "minor"})), tmp_path, "0303-b", [Y]) == 0
    assert q(url, "SELECT severity FROM curated.ddinter_pair") == [("minor",)]
    assert q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0303-a' ORDER BY 1") == before
    assert batch_status(url, "0303-a") == "approved"
```

5. Replace `test_reopen_review_with_changes_reopens_dependents_and_returns_them` with:

```python
def test_settle_stamps_a_dependent_only_when_its_view_changed(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0308-a", [X, Z]) == 0
    approve(url, "0308-a", X)
    approve(url, "0308-a", Z)
    assert run(Harness(url, dd), tmp_path, "0308-b", [Y]) == 0
    sh = q(url, "SELECT bds_id FROM curated.substance_code WHERE system = 'ICD11_XM' AND code = 'XMSH1'")[0][0]
    with psycopg.connect(url) as c:
        # nothing changed: neither the target nor the dependents are stamped; DDInter ids select no one any more
        s = settle(c, "0308-b", [Y], SharedChanges(bds_ids={sh}, ddinter_ids={OT}))
        assert (s.stamped, s.reopened) == ([], [])
    assert item(url, "0308-a", X)[0] == item(url, "0308-a", Z)[0] == "ok"
    with psycopg.connect(url) as c:
        c.execute("DELETE FROM curated.interaction_coverage WHERE bds_id = %s", (sh,))   # coverage full -> not_run: covered
        s = settle(c, "0308-b", [Y], SharedChanges(bds_ids={sh}))
    assert s.reopened == [("0308-b", Y), ("0308-a", X)]   # the target first, then the dependent
    assert item(url, "0308-a", X)[0] == "pending" and item(url, "0308-a", Z)[0] == "ok"
    assert batch_status(url, "0308-a") == "in_review"
```

6. Replace `test_a_shared_change_writes_a_shared_change_snapshot_with_the_run_id_of_the_run_that_caused_it` with:

```python
def test_a_shared_change_writes_a_shared_change_snapshot_with_the_run_id_of_the_run_that_caused_it(url, tmp_path):
    assert run(Harness(url, FakeDDInter({})), tmp_path, "0310-a", [X]) == 0
    approve(url, "0310-a", X)
    assert run(Harness(url, FakeDDInter(BOTH)), tmp_path, "0310-b", [Y]) == 0   # coverage none -> full: covered
    reason, run_id = q(url, """SELECT reason, run_id FROM ops.item_snapshot WHERE batch_id = '0310-a' AND concept_id = %s
                               ORDER BY extracted_at DESC LIMIT 1""", (X,))[0]
    y_runs = {r for (r,) in q(url, "SELECT run_id FROM ops.item_snapshot WHERE batch_id = '0310-b' AND concept_id = %s", (Y,))}
    assert reason == "shared_change"
    assert y_runs == {run_id}
```

In `etl/tests/test_run_pipeline.py`:

1. After the `url` fixture, add the per-test wipe (approvals now carry over to a product listed again in a new batch, so one test's approval must not reach the next test's batch):

```python
@pytest.fixture(autouse=True)
def clean(url):
    """Every test starts from an empty database (P1C: a carried approval, §8.3.1 item 8, would cross tests otherwise)."""
    with psycopg.connect(url) as c:
        # V6 snapshots are append-only; only this throwaway test database switches the trigger off to start each test empty.
        c.execute("ALTER TABLE ops.item_snapshot DISABLE TRIGGER item_snapshot_append_only")
        c.execute("DELETE FROM ops.item_snapshot")
        c.execute("ALTER TABLE ops.item_snapshot ENABLE TRIGGER item_snapshot_append_only")
        for t in ("ops.review_decision", "ops.stage_result", "ops.batch_run", "ops.batch_item", "ops.batch",
                  "curated.ddinter_pair", "curated.ddinter_interaction_text", "curated.ddinter_disease",
                  "curated.ddinter_food", "curated.ddinter_drug", "curated.interaction_coverage",
                  "curated.clinical_drug_ingredient", "curated.brand_product_ingredient"):
            c.execute(f"DELETE FROM {t}")
        c.execute("UPDATE curated.brand_product SET bdc_id = NULL")
        for t in ("curated.clinical_drug", "curated.brand_product", "curated.substance_name",
                  "curated.substance_code", "curated.substance"):
            c.execute(f"DELETE FROM {t}")
```

2. Replace `test_stage_only_rerun_after_an_ok_reopens_the_review_and_keeps_history` and `test_each_product_stage_alone_reopens_the_review` with:

```python
def test_stage_only_rerun_without_a_covered_change_keeps_the_approval_and_history(url, tmp_path):
    """S8 (§8.3.1): a re-run that changes nothing an approval covered leaves every approved record approved."""
    f = batch_file(tmp_path, "0115-stage-rerun", [WARF, ASA, MISSING])
    assert Harness(url).main("--batch", f) == 0
    approve(url, "0115-stage-rerun", WARF)
    before = {cid: item(url, "0115-stage-rerun", cid) for cid in (WARF, ASA, MISSING)}
    assert Harness(url).main("--batch", f, "--stages", "substances,clinical,ddinter") == 0
    assert {cid: item(url, "0115-stage-rerun", cid) for cid in (WARF, ASA, MISSING)} == before
    assert decisions(url, "0115-stage-rerun") == 1  # history kept


@pytest.mark.parametrize("stage", ["substances", "clinical", "ddinter"])
def test_each_product_stage_alone_keeps_an_unchanged_approval(url, tmp_path, stage):
    batch_id = f"0116-only-{stage}"
    f = batch_file(tmp_path, batch_id, [WARF])
    assert Harness(url).main("--batch", f) == 0
    approve(url, batch_id, WARF)
    before = item(url, batch_id, WARF)
    assert Harness(url).main("--batch", f, "--stages", stage) == 0
    assert item(url, batch_id, WARF) == before


def test_a_run_that_changes_covered_data_reopens_the_review(url, tmp_path, monkeypatch):
    f = batch_file(tmp_path, "0116-changed", [WARF])
    assert Harness(url).main("--batch", f) == 0
    decided_at = approve(url, "0116-changed", WARF)
    monkeypatch.setitem(CONCEPTS, WARF, concept(WARF, "Tablet", "Warfarin Sodium 2 mg", [("XM86W0", "Warfarin")]))
    assert Harness(url).main("--batch", f) == 0
    review, extracted_at = item(url, "0116-changed", WARF)
    assert (review, extracted_at > decided_at) == ("pending", True)
    assert decisions(url, "0116-changed") == 1
```

3. In `test_an_ok_recorded_while_dgda_loads_does_not_approve_its_output`, before the second `Harness(url).main(…)` call, add (the stamp now needs covered data that changed, §8.3.1):

```python
    monkeypatch.setitem(CONCEPTS, WARF, {**CONCEPTS[WARF], "extras": {**CONCEPTS[WARF]["extras"], "company": "New Co"}})
```

4. In `test_snapshot_written_on_stamp_with_one_run_id_per_invocation`, replace the last four lines (from `first_run = warf[0][2]`) with:

```python
    assert Harness(url).main("--batch", f, "--stages", "ddinter") == 0
    again = q(url, """SELECT reason, run_id FROM ops.item_snapshot WHERE batch_id = '0120-snapshots'
                      AND concept_id = %s ORDER BY extracted_at""", (WARF,))
    assert again == [(r[1], r[2]) for r in warf]   # §8.3.1: an unchanged re-run stamps nothing and writes no snapshot
```

In `etl/tests/test_pipeline_scale.py`:

1. Replace the body of the `clean` fixture with the same full wipe as `test_run_pipeline.py`'s (above), and its docstring with `"""Every test starts from an empty database (P1C: a carried approval would cross tests otherwise)."""`.
2. Replace `test_concept_runs_only_that_item_and_resets_only_its_review` with:

```python
def test_concept_runs_only_that_item_and_settles_only_its_review(url, tmp_path):
    batch_id = "0210-single"
    f = batch_file(tmp_path, batch_id, [P[1], P[2], P[3], MISSING])
    assert Harness(url).main("--batch", f) == 0
    approve(url, batch_id, P[1])
    approve(url, batch_id, P[2])
    batch_before = q(url, "SELECT item_count, run_at FROM ops.batch WHERE batch_id = %s", (batch_id,))
    items_before = items(url, batch_id)
    stage_before = {(c, s): t for c, s, t in q(
        url, "SELECT concept_id, stage, updated_at FROM ops.stage_result WHERE batch_id = %s", (batch_id,))}

    h = Harness(url)
    assert h.main("--batch", f, "--concept", P[2]) == 0
    assert h.ocl.asked == [P[2]]
    assert h.ddinter.detail_calls == [DD[2]]
    assert items(url, batch_id) == items_before   # nothing P2's approval covered changed: it keeps its ok and its stamp
    stage_after = {(c, s): t for c, s, t in q(
        url, "SELECT concept_id, stage, updated_at FROM ops.stage_result WHERE batch_id = %s", (batch_id,))}
    assert stage_after.keys() == stage_before.keys()
    for (c, s), t in stage_after.items():
        assert (t > stage_before[(c, s)]) == (c == P[2]), (c, s)
    assert q(url, "SELECT item_count, run_at FROM ops.batch WHERE batch_id = %s", (batch_id,)) == batch_before
    assert q(url, "SELECT status FROM ops.batch WHERE batch_id = %s", (batch_id,)) == [("in_review",)]
    assert q(url, "SELECT count(*) FROM ops.review_decision WHERE batch_id = %s", (batch_id,)) == [(2,)]
```

3. In `test_concept_with_later_stages_only_rewrites_only_that_item`, replace the last line with:

```python
    assert after[P[3]] == before[P[3]]   # stage results rewritten; an unchanged view is not re-stamped (§8.3.1)
    assert q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = %s AND concept_id = %s AND stage = 'ddinter'",
             (batch_id, P[3])) == [(1,)]
```

4. In `test_an_exception_while_committing_a_chunk_fails_it_and_marks_later_chunks_not_run`, replace `run_pipeline.reopen_review` with `run_pipeline.settle` (both places), and the inner function header with `def boom_on_third_chunk(conn, b, ids, *rest, **kw):` returning `real(conn, b, ids, *rest, **kw)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd etl && pytest tests/test_reopen_rule.py tests/test_shared_reopen.py tests/test_batches.py -q`
Expected: FAIL (`ImportError: cannot import name 'settle' from 'bddrug_etl.load.batches'`).

- [ ] **Step 3: Write `settle()`**

Replace `etl/src/bddrug_etl/load/batches.py` with:

```python
"""Batch runs: fetch an explicit list of DGDA concepts, load them, record per-item review status, and settle each item's
review under the reopen rule (spec §8.3.1): an item is stamped (re-opened) only when something its approval covered
changed, plus the three cases that are always stamped (a DGDA failure, a return to the batch file after removal, and an
engineer's --reopen of a non-approved target)."""
import pathlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime

import psycopg

from bddrug_etl.load.products import LoadStats, load_products
from bddrug_etl.load.snapshots import approval_view, build_payload, same_view, view_at, write_snapshots
from bddrug_etl.ocl.transform import concept_to_product
from bddrug_etl.stages.results import SharedChanges, StageResult, write_stage_results

OWNER, SOURCE = "MoHFW", "DGDA-Drugs"
NOT_FOUND, NOT_A_DRUG = "not found at source", "not a registered Drug product"
REMOVED = "removed from batch file"
REOPEN_SKIPPED = "skipped: approved, --reopen not confirmed"
_KEEP = object()


@dataclass(frozen=True)
class DgdaTargets:
    """What the dgda stage learned while upserting its items (consumed by ``settle``)."""
    new: frozenset[str] = frozenset()        # no item in this batch before this run
    readded: frozenset[str] = frozenset()    # back in the batch file after it was marked removed
    recovered: frozenset[str] = frozenset()  # its previous note was a DGDA failure and it loaded now
    issues: dict[str, str] = field(default_factory=dict)  # concept_id -> DGDA failure note


@dataclass
class Settled:
    """What one ``settle`` call wrote: every stamp, the stamps of items that already had one (re-opened), the carried
    approvals, and the --reopen targets left alone because they are approved."""
    stamped: list[tuple[str, str]] = field(default_factory=list)
    reopened: list[tuple[str, str]] = field(default_factory=list)
    carried: list[tuple[str, str]] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class BatchStats(LoadStats):
    settled: Settled = field(default_factory=Settled)


def read_batch_file(path: pathlib.Path) -> list[str]:
    ids: list[str] = []
    for line in path.read_text().splitlines():
        concept_id = line.split("#", 1)[0].strip()
        if concept_id and concept_id not in ids:
            ids.append(concept_id)
    return ids


def _dgda_results(concept_ids: list[str], found: list[dict], missing: list[str], not_products: list[str]) -> list[StageResult]:
    """One 'dgda' stage result per requested concept, in request order: ok when loaded, else fail."""
    classes = {c["id"]: c.get("concept_class") for c in found}
    missing_set, not_set = set(missing), set(not_products)
    out = []
    for cid in concept_ids:
        if cid in missing_set:
            out.append(StageResult(cid, "fail", NOT_FOUND, {"source": SOURCE, "concept_class": None}))
        elif cid in not_set:
            out.append(StageResult(cid, "fail", NOT_A_DRUG, {"source": SOURCE, "concept_class": classes.get(cid)}))
        else:
            out.append(StageResult(cid, "ok", "", {"source": SOURCE, "concept_class": classes.get(cid)}))
    return out


def _upsert_items(cur: psycopg.Cursor, batch_id: str, concept_ids: list[str], issues: dict[str, str]) -> DgdaTargets:
    """Insert the new items (no stamp yet: ``settle`` stamps them) and write the note of the items still in the file.

    §8.3.1 step 2: the note is written whether or not the item is stamped. An item that comes back into the file after it
    was marked removed keeps its marker here; ``settle`` clears it in the statement that stamps it (§8.3.1 item 5), so the
    approval made before the removal never counts again without a stamp in between."""
    cur.execute("SELECT concept_id, note FROM ops.batch_item WHERE batch_id = %s AND concept_id = ANY(%s)", (batch_id, concept_ids))
    existing = dict(cur.fetchall())
    new = [cid for cid in concept_ids if cid not in existing]
    readded = frozenset(cid for cid, note in existing.items() if note == REMOVED)
    recovered = frozenset(cid for cid, note in existing.items() if note in (NOT_FOUND, NOT_A_DRUG) and cid not in issues)
    if new:
        cur.executemany(
            """INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
               VALUES (%s, %s, %s, 'pending', %s, NULL)""",
            [(batch_id, SOURCE, cid, issues.get(cid)) for cid in new])
    kept = [cid for cid in concept_ids if cid in existing and cid not in readded]
    if kept:
        cur.executemany("UPDATE ops.batch_item SET source = %s, note = %s WHERE batch_id = %s AND concept_id = %s",
                        [(SOURCE, issues.get(cid), batch_id, cid) for cid in kept])
    return DgdaTargets(frozenset(new), readded, recovered, dict(issues))


def _upsert_batch(cur: psycopg.Cursor, batch_id: str, concept_ids: list[str], issues: dict[str, str]) -> DgdaTargets:
    """Upsert the batch and its items without deleting review history (ops.review_decision).

    The batch status is not forced: ``settle`` recomputes it (§8.3.1 item 6). Items no longer in the file are deleted only
    when nobody has reviewed them and they have no snapshot; the others stay, marked ``removed from batch file``. The
    batch's stage results are cleared, as the old delete-and-recreate did; this run's stages write them again.
    """
    cur.execute(
        """INSERT INTO ops.batch (batch_id, item_count) VALUES (%s, %s)
           ON CONFLICT (batch_id) DO UPDATE SET item_count = EXCLUDED.item_count, run_at = now()""",
        (batch_id, len(concept_ids)),
    )
    targets = _upsert_items(cur, batch_id, concept_ids, issues)
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
    cur.execute(
        "UPDATE ops.batch_item SET note = %s WHERE batch_id = %s AND NOT (concept_id = ANY(%s))",
        (REMOVED, batch_id, concept_ids),
    )
    cur.execute("DELETE FROM ops.stage_result WHERE batch_id = %s", (batch_id,))
    return targets


def _stamp(conn: psycopg.Connection, done: Settled, batch_id: str, cid: str, before: datetime | None, run_id: uuid.UUID, *,
           review: str, note=_KEEP, shared: bool = False, carried: dict | None = None) -> None:
    """Stamp ``extracted_at`` with ``clock_timestamp()`` (a decision recorded while this transaction was open saw the old
    data, so it must be older than the stamp), set the review, and write the snapshot, in the caller's transaction.
    With ``note``, the note is written in the same statement (the return to the file clears its marker here)."""
    if note is _KEEP:
        conn.execute("UPDATE ops.batch_item SET review = %s, extracted_at = clock_timestamp() WHERE batch_id = %s AND concept_id = %s",
                     (review, batch_id, cid))
    else:
        conn.execute("""UPDATE ops.batch_item SET review = %s, note = %s, extracted_at = clock_timestamp()
                        WHERE batch_id = %s AND concept_id = %s""", (review, note, batch_id, cid))
    write_snapshots(conn, [(batch_id, cid)], run_id, shared=shared, carried_from=carried)
    done.stamped.append((batch_id, cid))
    if before is not None:
        done.reopened.append((batch_id, cid))
    if carried is not None:
        done.carried.append((batch_id, cid))


def _unchanged(conn: psycopg.Connection, batch_id: str, cid: str, at: datetime | None) -> bool:
    then = view_at(conn, batch_id, cid, at)
    return then is not None and same_view(then, approval_view(build_payload(conn, batch_id, cid, at)))


def _approved_elsewhere(conn: psycopg.Connection, batch_id: str, cid: str) -> tuple[str, datetime] | None:
    """§8.3.1 item 8: the product's latest current item in another batch, when the gate (statusOf) reads it as ok."""
    row = conn.execute(
        """SELECT batch_id, extracted_at, review, note FROM ops.batch_item WHERE concept_id = %s AND batch_id <> %s
           ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1""", (cid, batch_id)).fetchone()
    if row is None or row[1] is None or row[2] != "ok" or row[3] == REMOVED:
        return None
    return row[0], row[1]


def _dependents(conn: psycopg.Connection, changes: SharedChanges, batch_id: str,
                targets: list[str]) -> list[tuple[str, str, datetime | None]]:
    """The latest current item of every other product whose ingredients carry a changed ``bds_id`` (the item the gate
    reads, never one marked removed). ``changes.ddinter_ids`` selects no one any more (§8.3.1 step 1): DDInter rows are
    not covered by an approval."""
    return conn.execute(
        """WITH products AS (
             SELECT DISTINCT bpi.concept_id
               FROM curated.brand_product_ingredient bpi
               JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
              WHERE xm.bds_id = ANY(%(bds)s::text[])
           ), latest AS (
             SELECT DISTINCT ON (bi.concept_id) bi.batch_id, bi.concept_id, bi.extracted_at, bi.note
               FROM ops.batch_item bi JOIN products p ON p.concept_id = bi.concept_id
              ORDER BY bi.concept_id, bi.extracted_at DESC NULLS LAST, bi.batch_id DESC
           )
           SELECT batch_id, concept_id, extracted_at FROM latest
            WHERE note IS DISTINCT FROM %(removed)s
              AND NOT (batch_id = %(batch)s AND concept_id = ANY(%(targets)s::text[]))
            ORDER BY batch_id, concept_id""",
        {"bds": sorted(changes.bds_ids), "removed": REMOVED, "batch": batch_id, "targets": list(targets)},
    ).fetchall()


def _recompute_batches(conn: psycopg.Connection, batch_ids: list[str]) -> None:
    """§8.3.1 item 6, as the API's recomputeBatch: approved when every current item is ok (and there is one)."""
    conn.execute(
        """UPDATE ops.batch b SET status = CASE
             WHEN EXISTS (SELECT 1 FROM ops.batch_item bi WHERE bi.batch_id = b.batch_id AND bi.note IS DISTINCT FROM %(removed)s)
              AND NOT EXISTS (SELECT 1 FROM ops.batch_item bi
                              WHERE bi.batch_id = b.batch_id AND bi.note IS DISTINCT FROM %(removed)s AND bi.review <> 'ok')
             THEN 'approved' ELSE 'in_review' END
           WHERE b.batch_id = ANY(%(ids)s)""",
        {"removed": REMOVED, "ids": batch_ids})


def settle(conn: psycopg.Connection, batch_id: str, targets: list[str], changes: SharedChanges | None = None,
           run_id: uuid.UUID | None = None, *, reopen: bool = False, dgda: DgdaTargets | None = None) -> Settled:
    """Spec §8.3.1: call it last in each stage's transaction, after that stage's results are written.

    Targets are locked first (items before any ops.batch row, the API's decision order). Per target: a DGDA failure is
    stamped ``issue`` with its reason; an item back in the file, or whose DGDA load recovered, is stamped ``pending``;
    with ``reopen`` an approved target is skipped (§13.1 Q12) and any other stamped ``pending``; otherwise the target is
    stamped only when its approval view differs from the view of its snapshot at its current stamp (or it has no stamp or
    snapshot there), and a new item of a product approved elsewhere with the same view carries that approval. Dependents
    of ``changes.bds_ids`` are stamped ``pending`` (``shared_change``) only when their view changed; never with ``reopen``.
    """
    run_id = run_id or uuid.uuid4()
    dgda = dgda or DgdaTargets()
    done = Settled()
    rows = {cid: (review, at) for cid, review, at in conn.execute(
        """SELECT concept_id, review, extracted_at FROM ops.batch_item
           WHERE batch_id = %s AND concept_id = ANY(%s) ORDER BY concept_id FOR UPDATE""",
        (batch_id, list(targets))).fetchall()}
    for cid in targets:
        if cid not in rows:
            continue
        review, at = rows[cid]
        if cid in dgda.issues:
            _stamp(conn, done, batch_id, cid, at, run_id, review="issue", note=dgda.issues[cid])
        elif cid in dgda.readded:
            _stamp(conn, done, batch_id, cid, at, run_id, review="pending", note=None)
        elif cid in dgda.recovered:
            _stamp(conn, done, batch_id, cid, at, run_id, review="pending")
        elif reopen:
            if review == "ok":
                done.skipped.append(cid)
            else:
                _stamp(conn, done, batch_id, cid, at, run_id, review="pending")
        elif not _unchanged(conn, batch_id, cid, at):
            origin = _approved_elsewhere(conn, batch_id, cid) if cid in dgda.new else None
            if origin is not None and _unchanged_since(conn, origin, batch_id, cid, at):
                _stamp(conn, done, batch_id, cid, at, run_id, review="ok",
                       carried={"batchId": origin[0], "extractedAt": origin[1].isoformat()})
            else:
                _stamp(conn, done, batch_id, cid, at, run_id, review="pending")
    if changes is not None and changes.bds_ids and not reopen:
        for b, cid, at in _dependents(conn, changes, batch_id, targets):
            if not _unchanged(conn, b, cid, at):
                _stamp(conn, done, b, cid, at, run_id, review="pending", shared=True)
    _recompute_batches(conn, sorted({batch_id} | {b for b, _ in done.stamped}))
    return done


def _unchanged_since(conn: psycopg.Connection, origin: tuple[str, datetime], batch_id: str, cid: str, at: datetime | None) -> bool:
    """The new item's view now equals the view the approved item's snapshot (at its stamp) recorded."""
    then = view_at(conn, origin[0], cid, origin[1])
    return then is not None and same_view(then, approval_view(build_payload(conn, batch_id, cid, at)))


def _load(conn: psycopg.Connection, client, concept_ids: list[str]):
    """Fetch and load the concepts (not committed); returns (stats, found, missing, not_products, issues)."""
    found, missing = [], []
    for concept_id in concept_ids:
        concept = client.get_concept(OWNER, SOURCE, concept_id)
        (found.append(concept) if concept else missing.append(concept_id))
    stats = load_products(conn, found, source=SOURCE, commit=False)  # the caller's single commit keeps it atomic
    not_products = [c["id"] for c in found if concept_to_product(c) is None]
    issues = {**{cid: NOT_FOUND for cid in missing}, **{cid: NOT_A_DRUG for cid in not_products}}
    return stats, found, missing, not_products, issues


def run_batch(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str],
              run_id: uuid.UUID | None = None, *, reopen: bool = False) -> BatchStats:
    """Load the batch, record its items and 'dgda' stage results, and settle them, in one transaction (committed here).

    Re-running a batch keeps its review history: see ``_upsert_batch`` and ``settle``.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        targets = _upsert_batch(cur, batch_id, concept_ids, issues)
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    settled = settle(conn, batch_id, concept_ids, None, run_id, reopen=reopen, dgda=targets)
    conn.commit()
    return BatchStats(stats.seen, stats.loaded, stats.skipped, settled)


def run_batch_items(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str],
                    run_id: uuid.UUID | None = None, *, reopen: bool = False) -> BatchStats:
    """Re-load only ``concept_ids`` of an already loaded batch (single-record re-run), committed here.

    Only these items are touched: their notes and 'dgda' results are rewritten and they are settled, in one transaction.
    The other items, the batch's ``item_count`` and ``run_at`` stay as they are. Never call ``run_batch`` with a subset:
    it would treat every other item as removed from the batch file.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        targets = _upsert_items(cur, batch_id, concept_ids, issues)
        cur.execute("DELETE FROM ops.stage_result WHERE batch_id = %s AND concept_id = ANY(%s)", (batch_id, concept_ids))
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    settled = settle(conn, batch_id, concept_ids, None, run_id, reopen=reopen, dgda=targets)
    conn.commit()
    return BatchStats(stats.seen, stats.loaded, stats.skipped, settled)
```

In `etl/src/bddrug_etl/jobs/run_pipeline.py`:

1. Replace the import of `bddrug_etl.load.batches` with `from bddrug_etl.load.batches import REOPEN_SKIPPED, Settled, read_batch_file, run_batch, run_batch_items, settle`.
2. In the module docstring, replace the sentences from "Every stage that processes a record also stamps its" to "and the re-opened records are logged." with:

```text
Every stage settles the records it processed last in its transaction (spec §8.3.1, ``load.batches.settle``): a record is
stamped (``extracted_at``, review back to ``pending``) only when something its approval covered changed, or when its DGDA
load failed or recovered, or it came back into the batch file. The substances and DDInter stages also write rows shared
by every product with that substance; a product that shows a changed substance-level row is re-checked the same way. A
product listed again in a new batch with an unchanged view carries its approval. Each stage logs how many records it
re-opened (``re-opened N record(s)``), any carried approvals, and the ``--reopen`` targets it skipped.
```

and replace the paragraph starting "Every invocation has one ``run_id``" with:

```text
Every invocation has one ``run_id`` (logged at start). Every stamp writes an ``ops.item_snapshot`` row with it, in the
stamping transaction, after that stage's results; an unchanged record is not stamped and gets no snapshot.

``--reopen`` stamps the named targets whatever changed, never their dependents, and skips a target that is approved
(``skipped: approved, --reopen not confirmed``, §13.1 Q12).
```

3. Replace `_reopen` with:

```python
def _log_settled(stage: str, batch_id: str, s: Settled) -> None:
    reopened = ": " + ", ".join(f"{b}/{c}" for b, c in s.reopened) if s.reopened else ""
    log.info("stage %s for batch %s re-opened %d record(s)%s", stage, batch_id, len(s.reopened), reopened)
    if s.carried:
        log.info("stage %s for batch %s carried the approval of %d record(s): %s", stage, batch_id, len(s.carried),
                 ", ".join(f"{b}/{c}" for b, c in s.carried))
    for cid in s.skipped:
        log.info("stage %s for batch %s: %s %s", stage, batch_id, cid, REOPEN_SKIPPED)


def _settle(conn: psycopg.Connection, stage: str, batch_id: str, ids: list[str], changes: SharedChanges,
            run_id: uuid.UUID, reopen: bool) -> None:
    """Settle ``ids`` and every other product showing a changed substance row (last, in the caller's transaction)."""
    _log_settled(stage, batch_id, settle(conn, batch_id, ids, changes, run_id, reopen=reopen))
```

4. Give `_run_dgda`, `_run_product_stage` and `_run_ddinter` a last parameter `reopen: bool`; in `_run_dgda` replace the `(run_batch_items if subset else run_batch)(…)` line with

```python
    stats = (run_batch_items if subset else run_batch)(conn, clients.ocl, batch_id, ids, run_id, reopen=reopen)
    _log_settled("dgda", batch_id, stats.settled)
```

in `_run_product_stage` replace `_reopen(conn, stage, batch_id, targets, changes, run_id)` with `_settle(conn, stage, batch_id, targets, changes, run_id, reopen)`, and in `_run_ddinter` replace `_reopen(conn, "ddinter", batch_id, chunk, changes, run_id)` with `_settle(conn, "ddinter", batch_id, chunk, changes, run_id, reopen)` (keep the trailing comments, now reading `# last: settle under the reopen rule`).
5. `run_pipeline` gains `reopen: bool = False` after `run_id` and passes `reopen` to the three stage functions; its docstring adds "``reopen``: the engineer's --reopen (§8.3.1 item 5)."

In `etl/src/bddrug_etl/stages/results.py`, change the `SharedChanges` docstring's last sentence to: `Every product with such a substance shows these rows; since P1C only bds_ids select products to re-check under the reopen rule (load.batches.settle), and ddinter_ids is kept for the run log.` In `etl/src/bddrug_etl/stages/substances.py`, change "other products that show them (``reopen_review(..., changes)``)." to "other products that show them (``load.batches.settle``, which re-opens one only when its approval view changed)."

- [ ] **Step 4: Run the ETL suite**

Run: `cd etl && pytest -q`
Expected: PASS (every test, the new `test_reopen_rule.py` included).

- [ ] **Step 5: Commit**

```bash
git add etl/src/bddrug_etl/load/batches.py etl/src/bddrug_etl/jobs/run_pipeline.py etl/src/bddrug_etl/stages/results.py \
  etl/src/bddrug_etl/stages/substances.py etl/tests/test_reopen_rule.py etl/tests/test_batches.py etl/tests/test_shared_reopen.py \
  etl/tests/test_run_pipeline.py etl/tests/test_pipeline_scale.py
git commit -m "feat(etl): settle() re-opens a record only when its approval view changed; carried approvals; batch status recomputed (§8.3.1)" \
  -m "DGDA failures, a return to the batch file and a recovered load are always stamped; pair, text, disease, food and synonym changes re-open nothing (PO D5)." \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: `--reopen` on the command line and in `load-dgda.yml`; no code path deletes a DDInter pair

**Files:**
- Modify: `etl/src/bddrug_etl/jobs/run_pipeline.py`, `.github/workflows/load-dgda.yml`
- Test: `etl/tests/test_reopen_rule.py`, `etl/tests/test_run_pipeline.py`

**Interfaces:**
- Consumes: Task 11's `run_pipeline(…, reopen=…)`, `REOPEN_SKIPPED`.
- Produces: `bddrug-etl --batch FILE [--stages …] [--concept ID …] [--reopen]`; the workflow input `reopen` (boolean, default false) appends `--reopen`.

- [ ] **Step 1: Write the failing tests**

Append to `etl/tests/test_reopen_rule.py`:

```python
# --- the engineer's override (§8.3.1 item 5, §13.1 Q12) ----------------------------------------------

def test_reopen_flag_stamps_targets_only(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0416-a", [X, Z]) == 0
    assert run(Harness(url, dd), tmp_path, "0416-b", [Y]) == 0
    approve(url, "0416-a", X)
    with psycopg.connect(url) as c:   # a reviewer reported an issue on Z
        c.execute("""INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
                     VALUES ('0416-a', %s, 'issue', 'strength is wrong', 'eng@example.test', 'engineer')""", (Z,))
        c.execute("UPDATE ops.batch_item SET review = 'issue' WHERE batch_id = '0416-a' AND concept_id = %s", (Z,))
    x_before, z_before, y_before = item(url, "0416-a", X), item(url, "0416-a", Z), item(url, "0416-b", Y)
    assert run(Harness(url, dd), tmp_path, "0416-a", [X, Z], "--reopen") == 0
    assert item(url, "0416-a", X) == x_before                     # approved: skipped until the PO confirms (§13.1 Q12)
    review, stamp = item(url, "0416-a", Z)
    assert review == "pending" and stamp > z_before[1]           # the open issue goes back to review after the fix
    assert item(url, "0416-b", Y) == y_before                     # never a dependent
    assert any(f"{X} skipped: approved, --reopen not confirmed" in r.getMessage() for r in caplog.records if r.name == "run_pipeline")


def test_no_code_path_deletes_ddinter_pair():
    """§7.8: ops.pair_review references curated.ddinter_pair (NO ACTION), so the ETL only ever inserts or updates pairs."""
    import pathlib
    src = pathlib.Path(__file__).resolve().parents[1] / "src"
    hits = [str(p) for p in src.rglob("*.py") if "delete from curated.ddinter_pair" in p.read_text().lower()]
    assert hits == []
```

In `etl/tests/test_run_pipeline.py`, extend `test_workflow_command_is_unchanged`:

```python
def test_workflow_command_is_unchanged():
    wf = (ROOT / ".github/workflows/load-dgda.yml").read_text()
    assert 'docker-compose --profile jobs run --rm etl --batch "/app/batches/$BATCH"' in wf
    assert "reopen:" in wf and "--reopen" in wf          # §8.3.1 item 5: the override is reachable from GitHub Actions
    assert 'case "$REOPEN" in true|false) ;;' in wf      # the host repeats the check
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd etl && pytest tests/test_reopen_rule.py::test_reopen_flag_stamps_targets_only tests/test_reopen_rule.py::test_no_code_path_deletes_ddinter_pair tests/test_run_pipeline.py::test_workflow_command_is_unchanged -q`
Expected: FAIL: `--reopen` is an unrecognised argument (exit 2), and the workflow has no `reopen` input. `test_no_code_path_deletes_ddinter_pair` passes (it pins the current code).

- [ ] **Step 3: Implement**

In `etl/src/bddrug_etl/jobs/run_pipeline.py`, in `_parser()` add before `return parser`:

```python
    parser.add_argument("--reopen", action="store_true",
                        help="re-open the named records whatever changed (never their dependents; approved records are "
                             "skipped until the product owner confirms, spec §13.1 Q12)")
```

update the usage line at the top of the docstring to `bddrug-etl --batch FILE [--stages dgda,substances,clinical,ddinter] [--concept ID ...] [--ddinter-chunk N] [--reopen]`, and in `main` pass `reopen=args.reopen` to `run_pipeline`.

In `.github/workflows/load-dgda.yml`, add to `inputs` (after `stages`):

```yaml
      reopen:
        description: "Re-open the batch's records whatever changed (spec §8.3.1 item 5); approved records are skipped"
        type: boolean
        required: false
        default: false
```

add `REOPEN: ${{ inputs.reopen }}` to the `env` of the ssh step, `REOPEN` to its `envs` (`envs: BATCH,STAGES,REOPEN,APP_DIR`), and replace the script's `if … fi` block with:

```bash
            case "$REOPEN" in true|false) ;; *) echo "bad reopen"; exit 1;; esac
            REOPEN_FLAG=""; [ "$REOPEN" = "true" ] && REOPEN_FLAG="--reopen"
            # Only the bddrug compose project's etl job runs; no other container is touched. Non-zero exit fails the job.
            if [ -n "$STAGES" ]; then
              docker-compose --profile jobs run --rm etl --batch "/app/batches/$BATCH" --stages "$STAGES" $REOPEN_FLAG
            else
              docker-compose --profile jobs run --rm etl --batch "/app/batches/$BATCH" $REOPEN_FLAG
            fi
```

(the existing comment line above the `if` moves into this block, as shown).

- [ ] **Step 4: Run the ETL suite**

Run: `cd etl && pytest -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add etl/src/bddrug_etl/jobs/run_pipeline.py etl/tests/test_reopen_rule.py etl/tests/test_run_pipeline.py .github/workflows/load-dgda.yml
git commit -m "feat(etl): --reopen override for non-approved targets, also a load-dgda input; pin that no code deletes a pair (§8.3.1, §7.8)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Web copy — the §3.6 P1C constants, the eight P1C §1.7 rows, `SHARED_WORDS`, `fmtDhakaDate`

Every string the web tasks below render is defined here once, verbatim from the spec, and pinned by a test. P1A's copy guard (`tests/copy.test.ts`) fails when a file under `app/`, `components/`, `lib/` or `content/` other than `lib/copy.ts` retypes a `NEW_COPY` value, so the later tasks import from `P1C_COPY`. A handful of words the senior pages and the evidence drawer need are already printed as literals by other modules ("Status", "Substance", "Reload", "Sources", "DrugBank", "ICD-11", "DDInter 2.0", …: found with the guard's own rule); they cannot become `NEW_COPY` values without failing the guard on those modules, so they live in `SHARED_WORDS` in `lib/review-copy.ts`. The plural words "pair"/"pairs", "brand"/"brands" and "batch"/"batches" stay literals in `plural()` calls, as P1B's "pair"/"pairs" do.

**Files:**
- Modify: `web/lib/copy.ts`, `web/lib/format.ts`, `web/lib/review-copy.ts`
- Modify: `web/tests/copy.test.ts`, `web/tests/review-copy.test.tsx`
- Create: `web/tests/p1c-copy.test.ts`, `web/tests/format-date.test.ts`

**Interfaces:**
- Produces (`lib/copy.ts`): `PROMISE_SENIOR {lead, body(n)}`, `FROM_DDINTER`, `PAIR_REVIEWED` (`{date}`), `PAIR_NOT_REVIEWED`; `NEW_COPY_ROWS` keys `seniorRole`, `seniorReview`, `pairLines`, `deskOtherMedicines`, `dismissIssue`, `sourceLinks`, `productOtherApproved` and the amended `history` row; `P1C_COPY = { senior, review, pair, other, dismiss, sources }` (exact `as const` objects, keys listed in Step 3); `DESK_NEW.history` gains `carriedOver`, `approvedSenior`, `approvedSeniorMine`, `issueSenior`.
- Produces (`lib/format.ts`): `fmtDhakaDate(iso) → "DD/MM/YYYY"` (Dhaka date; the raw value when unparseable).
- Produces (`lib/review-copy.ts`): `SHARED_WORDS` with `status`, `substance`, `substances`, `reload`, `bdsId`, `ddinterEntries`, `sources`, `names`, `codes`, `route`, `strength`, `all`, `ddinter`, `drugbank`, `icd11`, `clinicalDrug`, `severity`.

- [ ] **Step 1: Write the failing tests**

In `web/tests/copy.test.ts`:

1. In `SPEC_ROWS`, replace the line

```ts
  "History: role variants, the \"No longer counts\" suffix, shared-change entries",
```

with

```ts
  "History: role variants, the \"No longer counts\" suffix, shared-change entries; the carried-approval line \"Approval carried over from batch {batchId}: nothing it covered changed.\"",
```

and append, after `"Route assumed because the product has no route",`:

```ts
  // P1C rows (the spec's "*(P1C)* " marker removed: P1C plan rule, Global Constraints)
  "Senior pharmacist role: role badge, promise (`PROMISE_SENIOR`), welcome step, invite role, account-menu and sidebar links",
  "Senior review: substance list, substance page, pair queue, the scope filter (\"All pairs\", \"Applies to our brands\"), pair row, the non-applying pair line, the brand list cap (\"and {n} more.\", \"All brands of {substance}\"), pair actions and their outcomes, pair history, keyboard sheet, empty, loading, error and not-authorised states, announcements",
  "Pair label and pair review state lines: `FROM_DDINTER`, `PAIR_REVIEWED`, `PAIR_NOT_REVIEWED` (public and reviewer), and the reviewer-only \"changed\" and \"issue\" lines",
  "Desk: \"With other medicines\" groups, cross-batch partner lines, the partner `<details>` summaries (\"All {n} medicines\", \"{s} of {n} medicines\"), \"and {k} more.\" and \"See every brand of {partner substance}\", the outside-this-batch text-missing note, the same-product text-missing note, the no-data line for other batches, \"no other batches\" lines",
  "Dismiss issue: control, panel, consequence sentence, hints, 409 outcomes, the not-saved and unconfirmed failure banners (report channel), announcements, history entries and the dismissal \"No longer counts\" suffix",
  "Source links: link labels, \"fetched on {date}\", the ICD-11 search link, the evidence drawer's \"Sources\" section, the product page's \"Source\" column",
  "Product page \"With other approved medicines\" (cross-batch, grouped by partner substance) and its paging",
```

2. In the `it.each` of `"§3.6 fixed safety strings"`, after the `NOT_RUN` row add:

```ts
    ["FROM_DDINTER", "From DDInter 2.0"],
    ["PAIR_REVIEWED", "Pair reviewed by a senior pharmacist on {date}"],
    ["PAIR_NOT_REVIEWED", "Pair not yet reviewed by a senior pharmacist"],
```

3. In `"the decision-bar promises keep the bold lead and the body apart"`, before its closing `});` add:

```ts
    expect(copy.PROMISE_SENIOR.lead).toBe("You're reviewing as a senior pharmacist.");
    expect(copy.PROMISE_SENIOR.body(8)).toBe('"Looks correct" publishes this record after an 8-second undo window.');
    expect(copy.PROMISE_SENIOR.body(20)).toBe('"Looks correct" publishes this record after an 20-second undo window.');
```

In `web/tests/review-copy.test.tsx`, in the `expect(NEW_COPY[NEW_COPY_ROWS.history]).toEqual({ … })` object, after the `backSharedChange` line add:

```ts
      carriedOver: "Approval carried over from batch {batchId}: nothing it covered changed.",
      approvedSenior: "Approved by a senior pharmacist. Published.",
      approvedSeniorMine: "Approved by a senior pharmacist (you). Published.",
      issueSenior: "Issue reported by a senior pharmacist. Note:",
```

Create `web/tests/format-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fmtDhakaDate } from "@/lib/format";

describe("fmtDhakaDate (§3.6 PAIR_REVIEWED, §5.6.6 fetched on)", () => {
  it("is the Dhaka calendar date, DD/MM/YYYY", () => {
    expect(fmtDhakaDate("2026-10-15T09:00:00Z")).toBe("15/10/2026");
    expect(fmtDhakaDate("2026-10-14T18:30:00Z")).toBe("15/10/2026");   // 00:30 next day in Dhaka (UTC+6)
    expect(fmtDhakaDate("2026-10-14T17:59:00Z")).toBe("14/10/2026");
  });
  it("returns the raw value when it does not parse", () => {
    expect(fmtDhakaDate("not a date")).toBe("not a date");
  });
});
```

Create `web/tests/p1c-copy.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NEW_COPY, NEW_COPY_ROWS, NOT_REVIEWED, P1C_COPY } from "@/lib/copy";
import { SHARED_WORDS } from "@/lib/review-copy";

const WEB = fileURLToPath(new URL("..", import.meta.url));

describe("the P1C rows of §1.7, verbatim", () => {
  it("each P1C row is a NEW_COPY entry, and P1C_COPY is the same object", () => {
    expect(NEW_COPY[NEW_COPY_ROWS.seniorRole]).toBe(P1C_COPY.senior);
    expect(NEW_COPY[NEW_COPY_ROWS.seniorReview]).toBe(P1C_COPY.review);
    expect(NEW_COPY[NEW_COPY_ROWS.pairLines]).toBe(P1C_COPY.pair);
    expect(NEW_COPY[NEW_COPY_ROWS.deskOtherMedicines]).toBe(P1C_COPY.other);
    expect(NEW_COPY[NEW_COPY_ROWS.dismissIssue]).toBe(P1C_COPY.dismiss);
    expect(NEW_COPY[NEW_COPY_ROWS.sourceLinks]).toBe(P1C_COPY.sources);
    expect(NEW_COPY[NEW_COPY_ROWS.productOtherApproved]).toEqual({});   // P2 fills it (§6.5)
  });

  it("senior role (§2.2, §5.1, §5.13, §6.2)", () => {
    expect(P1C_COPY.senior).toEqual({
      badge: "Senior pharmacist",
      seniorReview: "Senior review",
      pairQueue: "Pair queue",
      welcomeHeading: "You're a senior pharmacist reviewer for batch {id}",
      welcomeStep: "Senior review shows every interaction pair between the medicines we hold, from all batches. Mark each pair reviewed, or report a pair issue.",
      welcomeLink: "Open the pair queue",
      invite: "Role: Senior pharmacist. You review batches as a pharmacist, and the interaction pairs of every batch in Senior review. Sign in at drugdb.eliooo.org with this Google account.",
    });
  });

  it("senior review pages (§5.16, §5.17)", () => {
    expect(P1C_COPY.review).toEqual({
      pairsToReviewOne: "{t} pair to review",
      pairsToReviewMany: "{t} pairs to review",
      queueSub: "Every DDInter 2.0 pair between substances we hold, from all batches. Major first.",
      showTodo: "To review",
      showChanged: "Changed since review",
      showReviewed: "Reviewed",
      allPairs: "All pairs",
      emptyTodo: "No pairs to review.",
      emptyChanged: "No pair changed in DDInter since its review.",
      emptyIssue: "No pair issues reported.",
      emptyReviewed: "No pairs reviewed yet.",
      emptyAll: "No pairs between the substances we hold.",
      showAllPairs: "Show all pairs",
      applies: "Applies to our brands",
      range: "{from}–{to} of {total} pairs",
      notApplies: "Does not apply to the medicines we hold: none of them is checked against {id} for its route.",
      eitherId: "{a} or {b}",
      brandsLine: "{a} {brandsA} of {substanceA} and {b} {brandsB} of {substanceB}, in {k} {batches}.",
      brands: "Brands",
      andMore: "and {n} more.",
      allBrandsOf: "All brands of {substance}",
      markReviewed: "Mark reviewed",
      reportPairIssue: "Report pair issue",
      alreadyReviewed: "This pair is already reviewed.",
      noteLabel: "What's wrong with this pair? Pharmacists, engineers and senior pharmacists read this note.",
      notePlaceholder: "For example: the management text says to avoid the combination but the severity is Minor",
      noteError: "Add at least 5 characters so the team knows what to check.",
      changedSummary: "What changed in DDInter",
      atReview: "At review",
      historySummary: "Pair history",
      historyReviewed: "Reviewed by a senior pharmacist",
      historyReviewedMine: "Reviewed by a senior pharmacist (you)",
      historyChangedAfter: "DDInter data changed after this review",
      announceReviewed: "Pair {a} + {b} marked reviewed.",
      announceIssue: "Pair issue reported for {a} + {b}.",
      contentTitle: "This pair changed in DDInter after you opened the page.",
      contentBody: "Nothing was saved. Reload to review the latest text.",
      otherTitle: "Another senior pharmacist decided on this pair after you opened the page.",
      otherBody: "Nothing was saved. Reload to see their decision.",
      netTitle: "Couldn't save your pair review.",
      unconfirmedTitle: "Couldn't confirm your pair review.",
      unconfirmedBody: "Try again to find out; it will not be saved twice.",
      substancesSub: "Every substance carried by a medicine we hold, from all batches.",
      filterLabel: "Filter substances by name or BDS id",
      filterPlaceholder: "Filter by name or BDS id",
      noMatch: "No substances match “{q}”.",
      showAllSubstances: "Show all substances",
      substancesCaption: "Substances we hold",
      colPairsToReview: "Pairs to review",
      colMajorToReview: "Major pairs to review",
      substanceMeta: "{k} {brands} in {b} {batches}",
      brandsCaption: "Brands of {name} in every batch",
      colBrand: "Brand",
      colChecked: "Checked against",
      pairsHeading: "Pairs with substances we hold",
      pairsEmpty: "No stored DDInter pair links {name} with another substance we hold.",
      notChecked: "Pairs with {name} are not checked.",
      loading: "Loading senior review",
      errorTitle: "Couldn't load senior review.",
      notFound: "No substance with the id {id}.",
      openSubstances: "Open the substances list",
      notAuthTitle: "Senior review is for senior pharmacists.",
      notAuthBody: "Your account reviews batches. Ask the IntelliDrugs team if you need senior access.",
      regionPlain: "IntelliDrugs senior review.",
      regionLabel: "IntelliDrugs senior review. Shortcuts work while focus is inside. Press question mark for the list.",
      lastPair: "This is the last pair on this page.",
      firstPair: "This is the first pair on this page.",
      sheetNext: "Next and previous pair",
      sheetMark: "Mark the pair reviewed",
      sheetReport: "Report a pair issue",
      sheetClose: "Close the sheet or the note",
      sheetEnter: "Never marks a pair reviewed",
      enterBlocked: "Enter does not mark a pair reviewed. Press M, or Space on this button.",
      noScript: "Reviewing pairs needs JavaScript for the bot check.",
      flagsLine: "Pair issues reported by senior pharmacists: {k}",
    });
  });

  it("pair label and state lines (§3.6, §5.17)", () => {
    expect(P1C_COPY.pair).toEqual({
      you: " (you)",
      changed: "Pair changed in DDInter after a senior pharmacist reviewed it on {date}.",
      issue: "Pair issue reported by a senior pharmacist on {date}{you}. Note:",
    });
  });

  it("the desk's other medicines (§5.5.3, §5.6.1, §5.6.2)", () => {
    expect(P1C_COPY.other).toEqual({
      title: "With other medicines",
      inBatch: "In batch {batchId}",
      inOther: "In other batches",
      withApproved: "With approved medicines",
      withNotApproved: "With medicines not yet approved",
      chips: "Pairs with other batches by severity",
      partnerRef: "{name} (batch {batchId})",
      andMoreInline: "and {k} more",
      detailsAll: "All {n} medicines",
      detailsSome: "{s} of {n} medicines",
      andMoreList: "and {k} more.",
      seeEveryBrand: "See every brand of {substance}",
      noDataOther: "Not checked, {j} {pairs} with medicines in other batches:",
      noOtherBatches: "There are no other batches yet.",
      noneOther: "DDInter 2.0 lists no interaction between {name} and the medicines in other batches. This is not a guarantee that they are safe to combine.",
      textMissingSame: "DDInter text not found for {n} {pairs} between ingredients of this product.",
      textMissingOther: "DDInter text not found for {n} {pairs} with medicines outside this batch.",
    });
  });

  it("Dismiss issue (§5.6.5, §5.7, §5.8.4, §5.10a)", () => {
    expect(P1C_COPY.dismiss).toEqual({
      button: "Dismiss issue",
      keyRow: "dismiss issue",
      sheetRow: "Dismiss an open issue",
      title: "Dismiss this issue",
      quote: "Reported by {who} on {date}:",
      byPharmacist: "a pharmacist",
      bySenior: "a senior pharmacist",
      byEngineer: "an engineer",
      byYou: "you",
      consequence: `Dismissing records that the report was a mistake. The record goes back to “${NOT_REVIEWED}”, and a pharmacist approves it again. The report stays in the history.`,
      noteLabel: "Why was the report a mistake? Pharmacists and engineers read this note.",
      notePlaceholder: "For example: the strength matches the DGDA register; the report misread it",
      noteError: "Add at least 5 characters so the team knows why the report was dismissed.",
      busy: "Dismissing",
      paused: "Dismissing is paused until you reload the record. Your note is kept.",
      promiseSavingLead: "Dismissing the issue.",
      promiseSavingBody: "Saving now.",
      promiseSeniorIssueBody: "If the report was a mistake, dismiss it. Otherwise it returns to review after the fix and re-run.",
      hintNoIssue: "No issue is open on this record.",
      hintFinish: "Finish or undo your decision on this record first.",
      conflictNoIssue: "No issue is open on this record any more. Nothing was saved.",
      announceDismissed: "Issue dismissed for {name}. The record is back in review for a pharmacist.",
      failedTitle: "Couldn't send your dismissal.",
      unconfirmedTitle: "Couldn't confirm your dismissal.",
      unconfirmedBody: "We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice.",
      historyDismissed: "Issue dismissed by a senior pharmacist. Note:",
      historyDismissedMine: "Issue dismissed (you). Note:",
      noLongerCountsDismiss: "No longer counts: a senior pharmacist dismissed the issue after it.",
    });
    expect(P1C_COPY.dismiss.consequence).toContain("“Not yet reviewed by a pharmacist”");
  });

  it("source links (§5.6.3, §5.6.6)", () => {
    expect(P1C_COPY.sources).toEqual({
      fetchedOn: " fetched on {date}",
      newTab: " (opens in a new tab)",
      sourcesNote: "Where each value came from. Links open the source's own page.",
      dgda: "DGDA register (OCL)",
      rxnav: "RxNav",
      who: "WHO ATC/DDD Index",
    });
  });

  it("the words other modules already print stay out of NEW_COPY (SHARED_WORDS)", () => {
    expect(SHARED_WORDS).toEqual({
      status: "Status", substance: "Substance", substances: "Substances", reload: "Reload", bdsId: "BDS id",
      ddinterEntries: "DDInter entries", sources: "Sources", names: "Names", codes: "Codes", route: "Route", strength: "Strength",
      all: "All", ddinter: "DDInter 2.0", drugbank: "DrugBank", icd11: "ICD-11", clinicalDrug: "Clinical drug", severity: "Severity",
    });
    const values = Object.values(NEW_COPY).flatMap((r) => Object.values(r));
    for (const w of Object.values(SHARED_WORDS)) expect(values).not.toContain(w);
  });
});

// The review modules import the P1C copy; a 16-character fragment of a P1C value in their code is a retyped string.
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}

describe("review modules never retype P1C copy", () => {
  it("no literal fragment of a P1C row appears in app/review, components/review or components/ui", () => {
    const fragments = Object.values(P1C_COPY).flatMap((row) => Object.values(row))
      .map((v) => v.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0].trim())
      .filter((f) => f.length >= 16);
    const files = ["app/review", "components/review", "components/ui"].flatMap((d) => { try { return [...sources(join(WEB, d))]; } catch { return []; } });
    const hits = files.flatMap((f) => {
      const text = readFileSync(join(WEB, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      return fragments.filter((frag) => text.includes(frag)).map((frag) => `${f}: ${frag}`);
    });
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/copy.test.ts tests/review-copy.test.tsx tests/p1c-copy.test.ts tests/format-date.test.ts`
Expected: FAIL — `P1C_COPY`, `PROMISE_SENIOR`, `FROM_DDINTER`, `fmtDhakaDate` and `SHARED_WORDS` are not exported, and `NEW_COPY` has no P1C rows.

- [ ] **Step 3: Implement**

In `web/lib/copy.ts`:

1. After the `NOT_RUN` line add:

```ts
// ---- §3.6 P1C additions (each pinned by copy.test.ts) ----
/** Decision bar for role `senior` (§5.7). Same consequence as the pharmacist's: a senior's approval publishes (D49). */
export const PROMISE_SENIOR = {
  lead: "You're reviewing as a senior pharmacist.",
  body: PROMISE_PHARMACIST.body,
} as const;
/** The label on every pair card whose text or severity comes from DDInter (§5.6.2, §6.5, §6.6, §6.7.3). */
export const FROM_DDINTER = "From DDInter 2.0";
/** `{date}` = DD/MM/YYYY of the counting pair review, Dhaka (fmtDhakaDate). Plain text, never green (§3.4). */
export const PAIR_REVIEWED = "Pair reviewed by a senior pharmacist on {date}";
/** Never hides the pair or its text (G3); the copy test allows it next to NOT_REVIEWED: it is not a paraphrase of it. */
export const PAIR_NOT_REVIEWED = "Pair not yet reviewed by a senior pharmacist";
```

2. In `NEW_COPY_ROWS`, replace the `history:` line with

```ts
  history: "History: role variants, the \"No longer counts\" suffix, shared-change entries; the carried-approval line \"Approval carried over from batch {batchId}: nothing it covered changed.\"",
```

and after the `routeAssumed:` line add:

```ts
  // P1C (the spec's "*(P1C)* " marker removed from each key: P1C plan rule)
  seniorRole: "Senior pharmacist role: role badge, promise (`PROMISE_SENIOR`), welcome step, invite role, account-menu and sidebar links",
  seniorReview: "Senior review: substance list, substance page, pair queue, the scope filter (\"All pairs\", \"Applies to our brands\"), pair row, the non-applying pair line, the brand list cap (\"and {n} more.\", \"All brands of {substance}\"), pair actions and their outcomes, pair history, keyboard sheet, empty, loading, error and not-authorised states, announcements",
  pairLines: "Pair label and pair review state lines: `FROM_DDINTER`, `PAIR_REVIEWED`, `PAIR_NOT_REVIEWED` (public and reviewer), and the reviewer-only \"changed\" and \"issue\" lines",
  deskOtherMedicines: "Desk: \"With other medicines\" groups, cross-batch partner lines, the partner `<details>` summaries (\"All {n} medicines\", \"{s} of {n} medicines\"), \"and {k} more.\" and \"See every brand of {partner substance}\", the outside-this-batch text-missing note, the same-product text-missing note, the no-data line for other batches, \"no other batches\" lines",
  dismissIssue: "Dismiss issue: control, panel, consequence sentence, hints, 409 outcomes, the not-saved and unconfirmed failure banners (report channel), announcements, history entries and the dismissal \"No longer counts\" suffix",
  sourceLinks: "Source links: link labels, \"fetched on {date}\", the ICD-11 search link, the evidence drawer's \"Sources\" section, the product page's \"Source\" column",
  productOtherApproved: "Product page \"With other approved medicines\" (cross-batch, grouped by partner substance) and its paging",
```

3. Directly after the `export type NewCopyState = …` line, add the P1C row objects:

```ts
// ---- P1C §1.7 rows. Each object is the NEW_COPY entry for its row; P1C_COPY (below) is the typed view. ----
const SENIOR_ROLE = {
  badge: "Senior pharmacist",
  seniorReview: "Senior review",
  pairQueue: "Pair queue",
  welcomeHeading: "You're a senior pharmacist reviewer for batch {id}",
  welcomeStep: "Senior review shows every interaction pair between the medicines we hold, from all batches. Mark each pair reviewed, or report a pair issue.",
  welcomeLink: "Open the pair queue",
  invite: "Role: Senior pharmacist. You review batches as a pharmacist, and the interaction pairs of every batch in Senior review. Sign in at drugdb.eliooo.org with this Google account.",
} as const;

const SENIOR_REVIEW = {
  pairsToReviewOne: "{t} pair to review",
  pairsToReviewMany: "{t} pairs to review",
  queueSub: "Every DDInter 2.0 pair between substances we hold, from all batches. Major first.",
  showTodo: "To review",
  showChanged: "Changed since review",
  showReviewed: "Reviewed",
  allPairs: "All pairs",
  emptyTodo: "No pairs to review.",
  emptyChanged: "No pair changed in DDInter since its review.",
  emptyIssue: "No pair issues reported.",
  emptyReviewed: "No pairs reviewed yet.",
  emptyAll: "No pairs between the substances we hold.",
  showAllPairs: "Show all pairs",
  applies: "Applies to our brands",
  range: "{from}–{to} of {total} pairs",
  notApplies: "Does not apply to the medicines we hold: none of them is checked against {id} for its route.",
  eitherId: "{a} or {b}",
  brandsLine: "{a} {brandsA} of {substanceA} and {b} {brandsB} of {substanceB}, in {k} {batches}.",
  brands: "Brands",
  andMore: "and {n} more.",
  allBrandsOf: "All brands of {substance}",
  markReviewed: "Mark reviewed",
  reportPairIssue: "Report pair issue",
  alreadyReviewed: "This pair is already reviewed.",
  noteLabel: "What's wrong with this pair? Pharmacists, engineers and senior pharmacists read this note.",
  notePlaceholder: "For example: the management text says to avoid the combination but the severity is Minor",
  noteError: "Add at least 5 characters so the team knows what to check.",
  changedSummary: "What changed in DDInter",
  atReview: "At review",
  historySummary: "Pair history",
  historyReviewed: "Reviewed by a senior pharmacist",
  historyReviewedMine: "Reviewed by a senior pharmacist (you)",
  historyChangedAfter: "DDInter data changed after this review",
  announceReviewed: "Pair {a} + {b} marked reviewed.",
  announceIssue: "Pair issue reported for {a} + {b}.",
  contentTitle: "This pair changed in DDInter after you opened the page.",
  contentBody: "Nothing was saved. Reload to review the latest text.",
  otherTitle: "Another senior pharmacist decided on this pair after you opened the page.",
  otherBody: "Nothing was saved. Reload to see their decision.",
  netTitle: "Couldn't save your pair review.",
  unconfirmedTitle: "Couldn't confirm your pair review.",
  unconfirmedBody: "Try again to find out; it will not be saved twice.",
  substancesSub: "Every substance carried by a medicine we hold, from all batches.",
  filterLabel: "Filter substances by name or BDS id",
  filterPlaceholder: "Filter by name or BDS id",
  noMatch: "No substances match “{q}”.",
  showAllSubstances: "Show all substances",
  substancesCaption: "Substances we hold",
  colPairsToReview: "Pairs to review",
  colMajorToReview: "Major pairs to review",
  substanceMeta: "{k} {brands} in {b} {batches}",
  brandsCaption: "Brands of {name} in every batch",
  colBrand: "Brand",
  colChecked: "Checked against",
  pairsHeading: "Pairs with substances we hold",
  pairsEmpty: "No stored DDInter pair links {name} with another substance we hold.",
  notChecked: "Pairs with {name} are not checked.",
  loading: "Loading senior review",
  errorTitle: "Couldn't load senior review.",
  notFound: "No substance with the id {id}.",
  openSubstances: "Open the substances list",
  notAuthTitle: "Senior review is for senior pharmacists.",
  notAuthBody: "Your account reviews batches. Ask the IntelliDrugs team if you need senior access.",
  regionPlain: "IntelliDrugs senior review.",
  regionLabel: "IntelliDrugs senior review. Shortcuts work while focus is inside. Press question mark for the list.",
  lastPair: "This is the last pair on this page.",
  firstPair: "This is the first pair on this page.",
  sheetNext: "Next and previous pair",
  sheetMark: "Mark the pair reviewed",
  sheetReport: "Report a pair issue",
  sheetClose: "Close the sheet or the note",
  sheetEnter: "Never marks a pair reviewed",
  enterBlocked: "Enter does not mark a pair reviewed. Press M, or Space on this button.",
  noScript: "Reviewing pairs needs JavaScript for the bot check.",
  flagsLine: "Pair issues reported by senior pharmacists: {k}",
} as const;

const PAIR_LINES = {
  you: " (you)",
  changed: "Pair changed in DDInter after a senior pharmacist reviewed it on {date}.",
  issue: "Pair issue reported by a senior pharmacist on {date}{you}. Note:",
} as const;

const OTHER_MEDICINES = {
  title: "With other medicines",
  inBatch: "In batch {batchId}",
  inOther: "In other batches",
  withApproved: "With approved medicines",
  withNotApproved: "With medicines not yet approved",
  chips: "Pairs with other batches by severity",
  partnerRef: "{name} (batch {batchId})",
  andMoreInline: "and {k} more",
  detailsAll: "All {n} medicines",
  detailsSome: "{s} of {n} medicines",
  andMoreList: "and {k} more.",
  seeEveryBrand: "See every brand of {substance}",
  noDataOther: "Not checked, {j} {pairs} with medicines in other batches:",
  noOtherBatches: "There are no other batches yet.",
  noneOther: "DDInter 2.0 lists no interaction between {name} and the medicines in other batches. This is not a guarantee that they are safe to combine.",
  textMissingSame: "DDInter text not found for {n} {pairs} between ingredients of this product.",
  textMissingOther: "DDInter text not found for {n} {pairs} with medicines outside this batch.",
} as const;

const DISMISS = {
  button: "Dismiss issue",
  keyRow: "dismiss issue",
  sheetRow: "Dismiss an open issue",
  title: "Dismiss this issue",
  quote: "Reported by {who} on {date}:",
  byPharmacist: "a pharmacist",
  bySenior: "a senior pharmacist",
  byEngineer: "an engineer",
  byYou: "you",
  consequence: `Dismissing records that the report was a mistake. The record goes back to “${NOT_REVIEWED}”, and a pharmacist approves it again. The report stays in the history.`,
  noteLabel: "Why was the report a mistake? Pharmacists and engineers read this note.",
  notePlaceholder: "For example: the strength matches the DGDA register; the report misread it",
  noteError: "Add at least 5 characters so the team knows why the report was dismissed.",
  busy: "Dismissing",
  paused: "Dismissing is paused until you reload the record. Your note is kept.",
  promiseSavingLead: "Dismissing the issue.",
  promiseSavingBody: "Saving now.",
  promiseSeniorIssueBody: "If the report was a mistake, dismiss it. Otherwise it returns to review after the fix and re-run.",
  hintNoIssue: "No issue is open on this record.",
  hintFinish: "Finish or undo your decision on this record first.",
  conflictNoIssue: "No issue is open on this record any more. Nothing was saved.",
  announceDismissed: "Issue dismissed for {name}. The record is back in review for a pharmacist.",
  failedTitle: "Couldn't send your dismissal.",
  unconfirmedTitle: "Couldn't confirm your dismissal.",
  unconfirmedBody: "We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice.",
  historyDismissed: "Issue dismissed by a senior pharmacist. Note:",
  historyDismissedMine: "Issue dismissed (you). Note:",
  noLongerCountsDismiss: "No longer counts: a senior pharmacist dismissed the issue after it.",
} as const;

const SOURCE_LINKS = {
  fetchedOn: " fetched on {date}",
  newTab: " (opens in a new tab)",
  sourcesNote: "Where each value came from. Links open the source's own page.",
  dgda: "DGDA register (OCL)",
  rxnav: "RxNav",
  who: "WHO ATC/DDD Index",
} as const;
```

4. In `NEW_COPY`, in the `[NEW_COPY_ROWS.history]` object after `backSharedChange: …,` add

```ts
    carriedOver: "Approval carried over from batch {batchId}: nothing it covered changed.",
    approvedSenior: "Approved by a senior pharmacist. Published.",
    approvedSeniorMine: "Approved by a senior pharmacist (you). Published.",
    issueSenior: "Issue reported by a senior pharmacist. Note:",
```

and after the `[NEW_COPY_ROWS.routeAssumed]: { … },` entry add

```ts
  [NEW_COPY_ROWS.seniorRole]: SENIOR_ROLE,
  [NEW_COPY_ROWS.seniorReview]: SENIOR_REVIEW,
  [NEW_COPY_ROWS.pairLines]: PAIR_LINES,
  [NEW_COPY_ROWS.deskOtherMedicines]: OTHER_MEDICINES,
  [NEW_COPY_ROWS.dismissIssue]: DISMISS,
  [NEW_COPY_ROWS.sourceLinks]: SOURCE_LINKS,
  [NEW_COPY_ROWS.productOtherApproved]: {},
```

5. In `DESK_NEW`, change the `history:` cast to

```ts
  history: NEW_COPY[NEW_COPY_ROWS.history] as Record<"run" | "sharedChange" | "engineerChecked" | "engineerCheckedMine"
    | "issuePharmacist" | "issueEngineer" | "noLongerCounts" | "backSharedChange" | "carriedOver" | "approvedSenior"
    | "approvedSeniorMine" | "issueSenior", string>,
```

6. After the `DESK_NEW` object add:

```ts
/** Typed views of the P1C rows (§1.7), so modules never index NEW_COPY by row text. */
export const P1C_COPY = {
  senior: SENIOR_ROLE, review: SENIOR_REVIEW, pair: PAIR_LINES, other: OTHER_MEDICINES, dismiss: DISMISS, sources: SOURCE_LINKS,
} as const;
```

In `web/lib/format.ts`, after `fmtDhakaOn` add:

```ts
/** "15/10/2026": the Dhaka date alone, for PAIR_REVIEWED (§3.6) and "fetched on {date}" (§5.6.6). */
export function fmtDhakaDate(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? z.date : iso;
}
```

In `web/lib/review-copy.ts`, after the `REVIEW_LISTS` object add:

```ts
/**
 * Short labels the P1C surfaces need that other modules already print as literals (the substance page, Learn, CodeChip,
 * the desk). As NEW_COPY values they would fail P1A's retyping guard on those modules, so they are shared words here.
 */
export const SHARED_WORDS = {
  status: "Status", substance: "Substance", substances: "Substances", reload: "Reload", bdsId: "BDS id",
  ddinterEntries: "DDInter entries", sources: "Sources", names: "Names", codes: "Codes", route: "Route", strength: "Strength",
  all: "All", ddinter: "DDInter 2.0", drugbank: "DrugBank", icd11: "ICD-11", clinicalDrug: "Clinical drug", severity: "Severity",
} as const;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/copy.test.ts tests/review-copy.test.tsx tests/p1c-copy.test.ts tests/format-date.test.ts`
Expected: PASS (the guard tests included: no module retypes a P1C value yet).

- [ ] **Step 5: Commit**

```bash
git add web/lib/copy.ts web/lib/format.ts web/lib/review-copy.ts web/tests/copy.test.ts web/tests/review-copy.test.tsx \
  web/tests/p1c-copy.test.ts web/tests/format-date.test.ts
git commit -m "feat(web): P1C copy: PROMISE_SENIOR, FROM_DDINTER, PAIR_REVIEWED, PAIR_NOT_REVIEWED and the P1C §1.7 rows (§3.6, §1.7)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Every role gate learns `senior`; the P1C reviewer types (§5.13, §2.2, §6.2)

§5.13 lists every place that hard-codes `pharmacist | engineer`. This task changes all of them, adds the one helper `actsAsPharmacist`, and adds every additive P1C field of `ReviewItem` (§7.3) to `lib/review-types.ts`, so the later desk tasks share one set of shapes. `actsAsPharmacist` lives in the client-safe `lib/review-types.ts` (the desk island, `bar-state.ts` and `review-copy.ts` need it, and `lib/reviewers.ts` is `server-only`); `lib/reviewers.ts` re-exports it, so §5.13's "`$WEB/lib/reviewers.ts` … `actsAsPharmacist(role)`" holds. The additive P1C fields on objects that tests build by hand (`source` on codes, entries and brand; `source` and `pairReview` on a batch pair) are optional in the web types and render nothing when absent; the API always sends them.

**Files:**
- Modify: `web/lib/review-types.ts`, `web/lib/reviewers.ts`, `web/lib/review-copy.ts`, `web/lib/actions-core.ts`, `web/lib/desk-core.ts`, `web/lib/api.ts`
- Modify: `web/components/Header.tsx`, `web/components/review/ReviewAccount.tsx`, `web/components/review/ReviewToolbar.tsx`
- Modify: `web/components/review/desk/bar-state.ts`, `web/components/review/desk/advance.ts`, `web/components/review/detail/ConfirmPanel.tsx`, `web/components/review/detail/History.tsx`, `web/components/review/detail/detail.module.css`
- Modify: `web/app/review/[batchId]/page.tsx`, `web/app/review/[batchId]/[conceptId]/page.tsx`
- Modify: `web/tests/fixtures/pilot.ts`, `web/tests/reviewers.test.ts`, `web/tests/session.test.ts`, `web/tests/review-copy.test.tsx`, `web/tests/advance.test.ts`, `web/tests/bar-state.test.ts`, `web/tests/desk-actions.test.ts`, `web/tests/review-actions.test.ts`, `web/tests/header.test.tsx`, `web/tests/record-page.test.tsx`, `web/tests/review-detail.test.tsx`

**Interfaces:**
- Consumes: Task 13's `P1C_COPY`, `PROMISE_SENIOR`, `DESK_NEW.history.*`.
- Produces (`lib/review-types.ts`, client-safe): `ReviewerRole = "pharmacist" | "engineer" | "senior"`; `actsAsPharmacist(role: string | null | undefined): boolean`; `Source = {url, label, fetchedAt: string | null}`; `PairReviewStateName = "not_reviewed" | "reviewed" | "changed" | "issue"`; `PairReview = {state, at: string | null, mine: boolean, note: string | null}`; `PartnerScope = "batch" | "same_product" | "other"`; `TextMissingPair.partnerScope`; `OtherPartner`, `OtherPair`, `OtherNotChecked`, `OtherPairs = {pairs, notChecked, otherBatches}`; `OpenIssue = {role, at, note, mine}`; `HistoryEntry.decision` adds `"dismiss"`, plus `uncountedBy?: "rerun" | "dismiss"`, `carriedFrom?: string`; `ReviewItem.otherPairs`, `ReviewItem.openIssues`; optional `source?` on `IngredientSummary.codes[]`, `EntrySummary`, `ReviewBrand`, `BatchPair`, and `pairReview?` on `BatchPair`.
- Produces (`lib/reviewers.ts`): `ROLES = ["pharmacist", "engineer", "senior", "user"]`, `ROLE_LABEL.senior = "Senior pharmacist"`, `parseReviewers` accepts `senior`, `isReviewer` accepts it, `actsAsPharmacist` re-exported. `ROLE_LABEL_DESK.senior` (`lib/review-copy.ts`); `historyText` senior, dismiss and `uncountedBy: "dismiss"` lines; `toastSub`/`savedText` give the pharmacist strings for a senior.

- [ ] **Step 1: Write the failing tests**

In `web/tests/reviewers.test.ts`, change the import to `import { ROLES, ROLE_LABEL, actsAsPharmacist, isReviewer, parseReviewers, roleFor } from "../lib/reviewers";` and append:

```ts
describe("the senior pharmacist role (§5.13, P1C)", () => {
  it("parses as a role, in any case, and is in ROLES with its label", () => {
    expect([...parseReviewers("s@x.org:Senior,p@x.org:pharmacist").entries()]).toEqual([["s@x.org", "senior"], ["p@x.org", "pharmacist"]]);
    expect(ROLES).toEqual(["pharmacist", "engineer", "senior", "user"]);
    expect(ROLE_LABEL.senior).toBe("Senior pharmacist");
    expect(roleFor("s@x.org", "s@x.org:senior")).toBe("senior");
  });
  it("any other role token is still skipped", () => {
    expect(parseReviewers("a@x.org:seniorpharmacist,b@x.org:admin,c@x.org:senior ").size).toBe(1);
  });
  it("isReviewer accepts it; actsAsPharmacist is true for pharmacist and senior only", () => {
    expect(isReviewer({ role: "senior" })).toBe(true);
    expect(actsAsPharmacist("senior")).toBe(true);
    expect(actsAsPharmacist("pharmacist")).toBe(true);
    for (const r of ["engineer", "user", null, undefined]) expect(actsAsPharmacist(r)).toBe(false);
  });
});
```

In `web/tests/session.test.ts`, append:

```ts
describe("a senior session (§5.13: ROLES includes senior, or it decodes to null)", () => {
  it("decodes to role senior while REVIEWERS lists the email as senior", async () => {
    vi.stubEnv("REVIEWERS", "senior@example.org:senior");
    const token = await createSessionCookie({ email: "senior@example.org", name: "S", role: "senior" });
    expect(await verifySessionToken(token)).toMatchObject({ email: "senior@example.org", role: "senior" });
  });
  it("falls back to user when the list no longer names the email as senior", async () => {
    vi.stubEnv("REVIEWERS", "senior@example.org:pharmacist");
    const token = await createSessionCookie({ email: "senior@example.org", name: "S", role: "senior" });
    expect(await verifySessionToken(token)).toMatchObject({ role: "user" });
  });
});
```

In `web/tests/review-copy.test.tsx`, change the copy import to `import { DESK, ROLE_LABEL_DESK, fillNodes, historyText, plural, savedText, toastSub } from "@/lib/review-copy";` and, inside `describe("P1B rows of the §1.7 table", …)`, append:

```ts
  it("P1C: a senior's lines are a pharmacist's, never an engineer's (§5.6.5, §5.13)", () => {
    const at = "2026-10-15T09:00:00Z";
    expect(ROLE_LABEL_DESK.senior).toBe("Senior pharmacist");
    expect(toastSub("senior", 8)).toBe("Publishes in 8 seconds.");
    expect(savedText("senior", "Napa")).toBe("Saved. Napa is approved by a pharmacist and published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "senior", counts: true, mine: false }, "b"))
      .toBe("Approved by a senior pharmacist. Published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "senior", counts: true, mine: true }, "b"))
      .toBe("Approved by a senior pharmacist (you). Published.");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "senior", counts: true, mine: false }, "b"))
      .toBe("Issue reported by a senior pharmacist. Note:");
    expect(historyText({ kind: "decision", at, decision: "dismiss", role: "senior", counts: true, mine: false }, "b"))
      .toBe("Issue dismissed by a senior pharmacist. Note:");
    expect(historyText({ kind: "decision", at, decision: "dismiss", role: "senior", counts: true, mine: true }, "b"))
      .toBe("Issue dismissed (you). Note:");
  });

  it("P1C: the complete view says what re-opens a record now (§1.6 item 17, §5.12, D54)", () => {
    expect(DESK.doneBody).toBe("Each record was approved by a pharmacist. If the pipeline changes data a record's approval covered, it goes back in review and leaves public view until a pharmacist approves it again.");
  });

  it("P1C: the dismissal's No longer counts suffix, and the re-run suffix when both apply (§5.6.5)", () => {
    const at = "2026-10-15T09:00:00Z";
    expect(historyText({ kind: "decision", at, decision: "issue", role: "pharmacist", counts: false, uncountedBy: "dismiss", mine: false }, "b"))
      .toBe("Issue reported by a pharmacist. Note: No longer counts: a senior pharmacist dismissed the issue after it.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: false, uncountedBy: "rerun", mine: false }, "b"))
      .toBe("Approved by a pharmacist. Published. No longer counts: the record was re-run after it.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: false, mine: false }, "b"))
      .toBe("Approved by a pharmacist. Published. No longer counts: the record was re-run after it.");
  });
```

In `web/tests/advance.test.ts`, inside `it("needs-review sets per role", …)` add:

```ts
    expect(needsFor("senior", "engineer_checked")).toBe(true);
    expect(needsFor("senior", "issue")).toBe(false);
```

In `web/tests/bar-state.test.ts`, in the `it.each([...])` table of `"the promise, first match wins (§5.7)"`, before the `[{ role: "engineer" }, …]` row add:

```ts
    [{ role: "senior" }, ["You're reviewing as a senior pharmacist.", '"Looks correct" publishes this record after an 8-second undo window.']],
    [{ role: "senior", machine: machine({ commit: { kind: "committing", op: op({ role: "senior" }) } }) }, ["Marked correct.", "Publishing now."]],
```

In `web/tests/desk-actions.test.ts` (its mocks, `input()` and `OUTCOME` are reused), append:

```ts
describe("a senior session (§5.13)", () => {
  it("decides like a pharmacist, with reviewerRole senior sent unchanged", async () => {
    getSession.mockResolvedValue({ email: "senior@e2e.test", name: "S", role: "senior" });
    postDeskDecision.mockResolvedValue({ ok: true, data: OUTCOME });
    const r = await runDecide(input());
    expect(r).toEqual({ ok: true, outcome: OUTCOME });
    expect(postDeskDecision.mock.calls[0][2]).toMatchObject({ reviewerRole: "senior", reviewerEmail: "senior@e2e.test" });
  });
});
```

In `web/tests/review-actions.test.ts`, append:

```ts
describe("a senior session resolves flags (§5.13)", () => {
  it("is a reviewer for submitResolve", async () => {
    getSession.mockResolvedValue({ email: "senior@example.org", role: "senior" });
    expect(await submitResolve(form({ flagId: "12", "cf-turnstile-response": "ts-token" }))).toEqual({ status: 200, code: "resolved" });
  });
});
```

In `web/tests/header.test.tsx`, append:

```ts
describe("Header for a senior pharmacist (§6.2)", () => {
  it("the badge reads Senior pharmacist, and the menu adds Senior review", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "s@example.org", name: "S", role: "senior" }} theme="light" />);
    expect(html).toContain('<span class="role-badge">Senior pharmacist</span>');
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(html).toContain('<a href="/review/pairs">Senior review</a>');
  });
  it("a pharmacist has no Senior review item", () => {
    expect(renderToStaticMarkup(<Header session={PHARMACIST} theme="light" />)).not.toContain("/review/pairs");
  });
});
```

In `web/tests/record-page.test.tsx`, append:

```ts
describe("a senior session on the review pages (§5.13: role passed through unchanged)", () => {
  const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
  it("/review/{b} opens an engineer-checked record first, as for a pharmacist", async () => {
    getSession.mockResolvedValue(SENIOR);
    const items = pilotRows().map((r, i) => ({ ...r, displayStatus: i === 2 ? "engineer_checked" as const : "approved" as const }));
    getReviewItems.mockResolvedValue({ ...ITEMS, items });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${items[2].conceptId}`);
  });
  it("the no-JavaScript confirm step says that confirming publishes", async () => {
    getSession.mockResolvedValue(SENIOR);
    const x = pilotItem("napa").version.extractedAt!;
    const html = await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID });
    expect(html).toContain("Confirming publishes this record.");
    expect(html).not.toContain("Confirming records your check.");
  });
});
```

In `web/tests/review-detail.test.tsx`, inside `describe("History (§5.6.5)", …)` append:

```ts
  it("P1C: a carried approval adds its second line; a dismissal keeps the reporter's note and marks it", () => {
    const item = pilotItem("napa", { history: [
      { kind: "extract", at: "2026-10-15T08:00:00Z", reason: "run", carriedFrom: "0001-pilot" },
      { kind: "decision", at: "2026-10-15T09:00:00Z", decision: "issue", role: "pharmacist", note: "strength should read 5 mg",
        counts: false, uncountedBy: "dismiss", mine: false },
      { kind: "decision", at: "2026-10-15T09:30:00Z", decision: "dismiss", role: "senior", note: "the register says 500 mg",
        counts: true, mine: true },
    ] });
    const html = r(<History item={item} />);
    expect(html).toContain('Pipeline extracted this record<span class="histSub">Approval carried over from batch 0001-pilot: nothing it covered changed.</span>');
    expect(html).toContain('Issue reported by a pharmacist. Note: No longer counts: a senior pharmacist dismissed the issue after it. <span class="raw">strength should read 5 mg</span>');
    expect(html).toContain('Issue dismissed (you). Note: <span class="raw">the register says 500 mg</span>');
    expect(html).not.toContain("@");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/reviewers.test.ts tests/session.test.ts tests/review-copy.test.tsx tests/advance.test.ts tests/bar-state.test.ts tests/desk-actions.test.ts tests/review-actions.test.ts tests/header.test.tsx tests/record-page.test.tsx tests/review-detail.test.tsx`
Expected: FAIL — `senior` is skipped by `parseReviewers`, `actsAsPharmacist` is not exported, a senior's `ok` reads as an engineer's, `runDecide` answers a senior `forbidden`, the record page passes `pharmacist`, and the complete view still says "re-runs a record".

- [ ] **Step 3: Implement the types and the role helpers**

Replace the first line of `web/lib/review-types.ts`'s declarations (`export type ReviewerRole = "pharmacist" | "engineer";`) with:

```ts
export type ReviewerRole = "pharmacist" | "engineer" | "senior";
/**
 * §5.13: the one test for pharmacist powers (approval publishes, the promise's consequence, the "needs review" set).
 * A senior pharmacist is a pharmacist (PO D2, D49). Client-safe; lib/reviewers.ts re-exports it.
 */
export const actsAsPharmacist = (role: string | null | undefined): boolean => role === "pharmacist" || role === "senior";

/** §5.6.6: a source link, built only by the API (SourceLinks.java). `fetchedAt` is null when no fetch time is stored. */
export type Source = { url: string; label: string; fetchedAt: string | null };
/** §5.17, §7.3: a pair's senior-review state. Reviewer surfaces show all four. */
export type PairReviewStateName = "not_reviewed" | "reviewed" | "changed" | "issue";
export type PairReview = { state: PairReviewStateName; at: string | null; mine: boolean; note: string | null };
/** §5.5.3, §7.3: where a text-missing pair's partner entry is chosen. */
export type PartnerScope = "batch" | "same_product" | "other";
```

and change these declarations:

```ts
export type TextMissingPair = {
  ddinterA: string; nameA: string; ddinterB: string; nameB: string; severity: string | null; inBatch: boolean; partnerScope: PartnerScope;
};
```

```ts
export type EntrySummary = {
  ddinterId: string; name: string | null; routeScope: string;
  counts: { major: number; moderate: number; minor: number; unknown: number; total: number }; diseaseCount: number; foodCount: number;
  source?: Source | null;
};
```

In `IngredientSummary`, the `codes` line becomes:

```ts
  codes: { system: string; code: string; routeScope: string; method: string; confidence: number; source?: Source | null }[];
```

`BatchPair` becomes:

```ts
export type BatchPair = {
  ddinterA: string; ddinterB: string; nameA: string; nameB: string; substance: string; partnerSubstance: string;
  severity: string; actions: string[]; interaction: string | null; management: string | null; partners: PartnerRef[];
  source?: Source | null; pairReview?: PairReview;
};
```

After the `BatchPairs` type add:

```ts
/** §7.3 otherPairs: partners are the latest current items of products held in other batches (never a removed item). */
export type OtherPartner = { conceptId: string; tradeName: string; batchId: string; approved: boolean };
export type OtherPair = {
  ddinterA: string; ddinterB: string; nameA: string; nameB: string; substance: string; partnerSubstance: string;
  partnerBdsId: string | null; severity: string; actions: string[]; interaction: string | null; management: string | null;
  source: Source | null; pairReview: PairReview; partners: OtherPartner[]; partnerCount: number;
};
export type OtherNotChecked = {
  substance: string; partnerSubstance: string; partnerBdsId: string | null; partners: OtherPartner[]; partnerCount: number;
  reason: Exclude<NotCheckedReason, "same_product">; side: "this" | "partner"; route: string | null;
};
export type OtherPairs = { pairs: OtherPair[]; notChecked: OtherNotChecked[]; otherBatches: number };
/** §5.10a: the counted issues a dismissal would close, oldest first. Roles only, never an email. */
export type OpenIssue = { role: ReviewerRole; at: string; note: string; mine: boolean };
```

`HistoryEntry` becomes:

```ts
export type HistoryEntry = {
  kind: "run" | "extract" | "decision"; at: string; reason?: "run" | "rerun" | "shared_change"; role?: ReviewerRole;
  decision?: "ok" | "issue" | "dismiss"; note?: string; counts?: boolean; mine?: boolean;
  /** Why `counts` is false (§5.6.5 suffix): the re-run stamp, or a later dismissal. */
  uncountedBy?: "rerun" | "dismiss";
  /** The batch an approval was carried from (§8.3.1 item 8), on an `extract` entry. */
  carriedFrom?: string;
};
```

`ReviewBrand` gains `source?: Source | null;` (after `parseNote`), and `ReviewItem`'s last line becomes:

```ts
  history: HistoryEntry[]; reopen: Reopen | null; otherPairs: OtherPairs; openIssues: OpenIssue[];
```

Replace `web/lib/reviewers.ts` with:

```ts
import "server-only";
import { P1C_COPY } from "./copy";
import { actsAsPharmacist, type ReviewerRole } from "./review-types";

export type { ReviewerRole };
/** §5.13: the one test for pharmacist powers. Defined client-safe in review-types (the desk island needs it). */
export { actsAsPharmacist };
export type Role = ReviewerRole | "user";
/** lib/session.ts rejects a role outside this list: without `senior`, a senior session would decode to null (§5.13). */
export const ROLES: readonly Role[] = ["pharmacist", "engineer", "senior", "user"];
const REVIEWER_ROLES: readonly string[] = ["pharmacist", "engineer", "senior"];

/** Public label for a role. Pages show this, never the email (Global Constraints). */
export const ROLE_LABEL: Record<Role, string> = { pharmacist: "Pharmacist", engineer: "Engineer", senior: P1C_COPY.senior.badge, user: "User" };

const EMAIL = /^[^\s@:,]+@[^\s@:,]+$/;

/**
 * Parses `REVIEWERS` (`email:role,email:role`). Emails are lower-cased; roles are pharmacist, engineer or senior (P1C).
 * Malformed entries are skipped; when an email is listed twice the first entry wins.
 * The list holds personal data, so nothing here is ever logged.
 */
export function parseReviewers(raw: string | undefined): Map<string, ReviewerRole> {
  const reviewers = new Map<string, ReviewerRole>();
  for (const entry of (raw ?? "").split(",")) {
    const parts = entry.split(":");
    if (parts.length !== 2) continue;
    const email = parts[0].trim().toLowerCase();
    const role = parts[1].trim().toLowerCase();
    if (!EMAIL.test(email) || !REVIEWER_ROLES.includes(role)) continue;
    if (!reviewers.has(email)) reviewers.set(email, role as ReviewerRole);
  }
  return reviewers;
}

/** The role for a verified email: its `REVIEWERS` entry, case-insensitive, else `user`. */
export function roleFor(email: string, raw: string | undefined = process.env.REVIEWERS): Role {
  return parseReviewers(raw).get(email.trim().toLowerCase()) ?? "user";
}

/** True for a pharmacist, engineer or senior session; every other session (and none) sees public data only. */
export function isReviewer<S extends { role: string }>(session: S | null | undefined): session is S & { role: ReviewerRole } {
  return session !== null && session !== undefined && REVIEWER_ROLES.includes(session.role);
}
```

- [ ] **Step 4: Implement the copy, the actions and the components**

In `web/lib/review-copy.ts`:

1. Change the imports to

```ts
import { APPROVED, DESK_NEW, P1C_COPY, UNCLASSIFIED_NOT_LOW_RISK, fill } from "./copy";
import { actsAsPharmacist, type HistoryEntry, type ReviewerRole, type StageKey } from "./review-types";
```

2. Replace `ROLE_LABEL_DESK`, `toastSub`, `savedText` and `historyText` with:

```ts
export const ROLE_LABEL_DESK: Record<ReviewerRole, string> = { pharmacist: "Pharmacist", engineer: "Engineer", senior: P1C_COPY.senior.badge };
```

```ts
/** A senior's toast and saved text are a pharmacist's (§5.13): a senior's approval publishes. */
export const toastSub = (role: ReviewerRole, n: number) =>
  actsAsPharmacist(role) ? `Publishes in ${n} seconds.` : `Your check saves in ${n} seconds. It does not publish.`;

export const savedText = (role: ReviewerRole, name: string) =>
  actsAsPharmacist(role) ? `Saved. ${name} is approved by a pharmacist and published.` : `Saved. Your check on ${name} is recorded. It does not publish.`;
```

```ts
/** One history line (§5.6.5). The note itself is rendered separately, in .raw; a carried approval's line by History. */
export function historyText(e: HistoryEntry, batchId: string): string {
  const h = DESK_NEW.history, d = P1C_COPY.dismiss;
  let text: string;
  if (e.kind === "run") return fill(h.run, { id: batchId });
  if (e.kind === "extract") return e.reason === "shared_change" ? h.sharedChange : e.reason === "rerun" ? DESK.reran : DESK.extracted;
  if (e.decision === "dismiss") {
    text = e.mine ? d.historyDismissedMine : d.historyDismissed;
  } else if (e.decision === "ok") {
    if (e.role === "senior") text = e.mine ? h.approvedSeniorMine : h.approvedSenior;
    else if (e.role === "pharmacist") text = e.mine ? DESK.approvedHistoryMine : DESK.approvedHistory;
    else text = e.mine ? h.engineerCheckedMine : h.engineerChecked;
  } else {
    text = e.mine ? DESK.issueMine : e.role === "senior" ? h.issueSenior : e.role === "pharmacist" ? h.issuePharmacist : h.issueEngineer;
  }
  if (e.counts !== false) return text;
  // §5.6.5: when a decision is at or before both a dismissal and the current stamp, the re-run suffix wins (the API sends "rerun").
  return `${text} ${e.uncountedBy === "dismiss" ? d.noLongerCountsDismiss : h.noLongerCounts}`;
}
```

3. In `DESK`, replace the `doneBody` value with `"Each record was approved by a pharmacist. If the pipeline changes data a record's approval covered, it goes back in review and leaves public view until a pharmacist approves it again."` (§1.6 item 17: the reopen rule changed, D54; Board R's sentence said "re-runs a record").

In `web/lib/actions-core.ts`, delete the local `isReviewer` const and change `import type { ReviewerRole } from "./reviewers";` to `import { isReviewer } from "./reviewers";` (the `Session` import stays; `submitResolve` keeps calling `isReviewer(session)`).

In `web/lib/desk-core.ts`, replace

```ts
  if (!isReviewer(session) || (session.role !== "pharmacist" && session.role !== "engineer")) {
```

with

```ts
  if (!isReviewer(session)) {
```

In `web/lib/api.ts`, add `ReviewerRole` to the `import type { … } from "./review-types";` list and change `DecisionRequest`'s first line to

```ts
  decision: "ok" | "issue"; note: string; reviewerEmail: string; reviewerRole: ReviewerRole;
```

In `web/components/review/desk/bar-state.ts`:

1. Change the copy import to `import { DESK_NEW, PROMISE_ENGINEER, PROMISE_PAUSED, PROMISE_PHARMACIST, PROMISE_SENIOR, fill } from "@/lib/copy";` and the types import to `import { actsAsPharmacist, type DisplayStatus, type ReviewerRole } from "@/lib/review-types";`.
2. In `promise`, replace `pharmacist = ctx.role === "pharmacist"` with `pharmacist = actsAsPharmacist(ctx.role)` and its last line with

```ts
  if (ctx.role === "senior") return p(PROMISE_SENIOR.lead, PROMISE_SENIOR.body(ctx.undoSeconds));
  return pharmacist ? p(PROMISE_PHARMACIST.lead, PROMISE_PHARMACIST.body(ctx.undoSeconds)) : p(PROMISE_ENGINEER.lead, PROMISE_ENGINEER.body);
```

In `web/components/review/desk/advance.ts`, change the types import to `import { actsAsPharmacist, type DisplayStatus, type ReviewerRole } from "@/lib/review-types";` and `needsFor`'s body to

```ts
  return status === "pending" || status === "back_in_review" || (actsAsPharmacist(role) && status === "engineer_checked");
```

In `web/components/review/detail/ConfirmPanel.tsx`, change the types import to `import { actsAsPharmacist, type ReviewItem, type ReviewerRole } from "@/lib/review-types";` and `role === "pharmacist" ? m.confirmPharmacist : m.confirmEngineer` to `actsAsPharmacist(role) ? m.confirmPharmacist : m.confirmEngineer`.

In `web/app/review/[batchId]/page.tsx`, delete `const role = session.role === "engineer" ? "engineer" : "pharmacist";` and change `needsFor(role, r.displayStatus)` to `needsFor(session.role, r.displayStatus)`.

In `web/app/review/[batchId]/[conceptId]/page.tsx`, change `role={session.role === "engineer" ? "engineer" : "pharmacist"}` to `role={session.role}`.

Replace `web/components/review/ReviewToolbar.tsx`'s body lines

```ts
  const reviewer = session.role === "pharmacist" || session.role === "engineer";
```

and

```tsx
        {reviewer && <span className="role-badge">{ROLE_LABEL_DESK[session.role as "pharmacist" | "engineer"]}</span>}
```

with

```ts
  const reviewer = isReviewer(session);
```

and

```tsx
        {reviewer && <span className="role-badge">{ROLE_LABEL_DESK[session.role]}</span>}
```

adding `import { isReviewer } from "@/lib/reviewers";`.

In `web/components/review/ReviewAccount.tsx`: add `import { P1C_COPY } from "@/lib/copy";` (merge into the existing `DESK_NEW` import: `import { DESK_NEW, P1C_COPY } from "@/lib/copy";`) and `import { isReviewer } from "@/lib/reviewers";`; replace `const reviewer = session.role === "pharmacist" || session.role === "engineer";` with `const reviewer = isReviewer(session);`; replace `ROLE_LABEL_DESK[session.role as "pharmacist" | "engineer"]` with `ROLE_LABEL_DESK[session.role]`; and after the `/review/flags` link line add

```tsx
        {reviewer && session.role === "senior" && <a className={styles.menuLink} href="/review/pairs">{P1C_COPY.senior.seniorReview}</a>}
```

In `web/components/Header.tsx`: change `import { DESK_NEW } from "@/lib/copy";` to `import { DESK_NEW, P1C_COPY } from "@/lib/copy";` and `import { ROLE_LABEL } from "@/lib/reviewers";` to `import { ROLE_LABEL, isReviewer } from "@/lib/reviewers";`; replace `const reviewer = session?.role === "pharmacist" || session?.role === "engineer";` with `const reviewer = isReviewer(session);`; after the `/review/flags` link line add

```tsx
              {reviewer && session.role === "senior" && <a href="/review/pairs">{P1C_COPY.senior.seniorReview}</a>}
```

In `web/components/review/detail/History.tsx`, replace the `<span>{historyText(e, item.batchId)}…</span>` line with

```tsx
            <span>{historyText(e, item.batchId)}{e.kind === "extract" && e.carriedFrom ? (
              <span className={s.histSub}>{fill(DESK_NEW.history.carriedOver, { batchId: e.carriedFrom })}</span>
            ) : null}{e.kind === "decision" && e.note ? <> <span className="raw">{e.note}</span></> : null}</span>
```

and add `import { DESK_NEW, fill } from "@/lib/copy";`. In `web/components/review/detail/detail.module.css`, after the `.histT span { … }` line add:

```css
/* §5.6.5: a carried approval's second line. */
.histSub { display: block; margin-top: 2px; font-size: 12.5px; color: var(--fg-2); }
```

In `web/tests/fixtures/pilot.ts`:

1. In `stages()`, change the `textMissing` map's object to `({ ddinterA: m[1], nameA: m[1], ddinterB: m[2], nameB: m[2], severity: "unknown", inBatch: true, partnerScope: "batch" as const })`.
2. In `pilotItem`, after `reopen: null,` add `otherPairs: { pairs: [], notChecked: [], otherBatches: 0 }, openIssues: [],`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/reviewers.test.ts tests/session.test.ts tests/review-copy.test.tsx tests/advance.test.ts tests/bar-state.test.ts tests/desk-actions.test.ts tests/review-actions.test.ts tests/header.test.tsx tests/record-page.test.tsx tests/review-detail.test.tsx && npx tsc --noEmit -p .`
Expected: PASS, and `tsc` reports no error (every `pharmacist | engineer` literal type is gone; `grep -rnE '"pharmacist" \| "engineer"|role === "pharmacist"|=== "engineer" \? "engineer"' web/app web/components web/lib` prints only `ROLE_LABEL`/`ROLE_LABEL_DESK` and `bar-state.ts`'s engineer checks).

- [ ] **Step 6: Commit**

```bash
git add web/lib/review-types.ts web/lib/reviewers.ts web/lib/review-copy.ts web/lib/actions-core.ts web/lib/desk-core.ts web/lib/api.ts \
  web/components/Header.tsx web/components/review/ReviewAccount.tsx web/components/review/ReviewToolbar.tsx \
  web/components/review/desk/bar-state.ts web/components/review/desk/advance.ts web/components/review/detail/ConfirmPanel.tsx \
  web/components/review/detail/History.tsx web/components/review/detail/detail.module.css \
  "web/app/review/[batchId]/page.tsx" "web/app/review/[batchId]/[conceptId]/page.tsx" web/tests/fixtures/pilot.ts \
  web/tests/reviewers.test.ts web/tests/session.test.ts web/tests/review-copy.test.tsx web/tests/advance.test.ts web/tests/bar-state.test.ts \
  web/tests/desk-actions.test.ts web/tests/review-actions.test.ts web/tests/header.test.tsx web/tests/record-page.test.tsx web/tests/review-detail.test.tsx
git commit -m "feat(web): every role gate learns senior; actsAsPharmacist; the P1C ReviewItem shapes (§5.13, §7.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Dismissals on the report channel of the commit machine, and in the `decide` action (§5.8.2, §5.10a, §7.2)

§5.8.2 (Decision): a dismissal is an op with `decision: "dismiss"` on the existing **report** channel; there is no third channel and no undo window. This task changes the pure reducer and the server action only; Task 16 puts the control on the desk.

**Files:**
- Modify: `web/components/review/desk/commit-machine.ts`, `web/lib/desk-core.ts`, `web/lib/api.ts`
- Test: `web/tests/commit-machine.test.ts`, `web/tests/desk-actions.test.ts`

**Interfaces:**
- Consumes: Task 13's `P1C_COPY.dismiss`, `DESK_NEW.deskMisc.reportFailedBody`; Task 14's `ReviewerRole` with `senior`.
- Produces: `Op.decision: "ok" | "issue" | "dismiss"`; `DecideCode` adds `"no_issue"` (a conflict code); event `{ type: "SEND_DISMISS"; op: Op; token: "held" | "pending" | "failed" }` (ignored unless `op.role === "senior"`, `op.decision === "dismiss"` and the report channel is idle; it never touches the commit channel); on the report channel an OK announces `P1C_COPY.dismiss.announceDismissed` for a dismiss op, and the not-saved and unconfirmed announcements use the dismissal titles and bodies. `DecideInput.decision` adds `"dismiss"`; `runDecide` answers `forbidden` (with a `decision_denied` row) for a dismissal from any role but `senior`, enforces the 5–1000 code-point note, and maps a 409 `field=review` on a dismissal to `no_issue`. `DecisionRequest.decision` adds `"dismiss"`.

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/commit-machine.test.ts`:

```ts
describe("dismissals on the report channel (§5.8.2, §5.10a)", () => {
  const dop = (over: Partial<Op> = {}): Op => op({ role: "senior", decision: "dismiss", note: "the register says 500 mg",
    requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6", ...over });
  const PENDING = { ...OUT, review: "pending", displayStatus: "pending" as const };
  const sent = () => run(initialMachine(8), { type: "SEND_DISMISS", op: dop(), token: "held" }).state;

  it("sends at once on the report channel: no undo window, and an open window elsewhere is untouched", () => {
    const armedElsewhere = run(initialMachine(8),
      { type: "PRESS_A", op: op({ conceptId: "other", name: "Other", role: "senior" }), token: "held", now: 0 }).state;
    const r = run(armedElsewhere, { type: "SEND_DISMISS", op: dop(), token: "held" });
    expect(r.state.report).toEqual({ kind: "sending", op: dop() });
    expect(r.state.commit.kind).toBe("armed");
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "report", op: dop() }]);
  });

  it("only a senior's dismiss op, and only while the report channel is idle (a report blocks it, and the reverse)", () => {
    expect(run(initialMachine(8), { type: "SEND_DISMISS", op: dop({ role: "pharmacist" }), token: "held" }).state.report.kind).toBe("idle");
    expect(run(initialMachine(8), { type: "SEND_DISMISS", op: dop({ decision: "issue" }), token: "held" }).state.report.kind).toBe("idle");
    const reporting = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state;
    expect(run(reporting, { type: "SEND_DISMISS", op: dop(), token: "held" }).state).toEqual(reporting);
    expect(run(sent(), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state).toEqual(sent());
  });

  it("OK: saved on the report channel, announced with the dismissal sentence, and the outcome becomes the viewed version", () => {
    const r = run(sent(), { type: "RESULT", channel: "report", result: { type: "OK", outcome: PENDING } });
    expect(r.state.report).toEqual({ kind: "idle" });
    const saved = r.effects.find((e) => e.type === "saved")!;
    expect(saved).toEqual({ type: "saved", channel: "report", op: dop(), outcome: PENDING });
    expect(texts(r.effects, "announce")).toEqual(["Issue dismissed for Napa. The record is back in review for a pharmacist."]);
    expect(applySaved({}, saved)).toEqual({ [dop().conceptId]: PENDING.version });
  });

  it("409 no_issue gives its hint and a refresh; the stale codes give the stale banner", () => {
    const r = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "no_issue" }) });
    expect(texts(r.effects, "hint")).toEqual(["No issue is open on this record any more. Nothing was saved."]);
    expect(r.effects).toContainEqual({ type: "refresh" });
    const removed = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "removed" }) });
    expect(texts(removed.effects, "hint")).toEqual(["This record was removed from the batch file. Nothing was saved."]);
    const s = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "stale_decision" }) });
    expect(s.effects).toContainEqual({ type: "stale", conceptId: dop().conceptId, reason: "other", cancelled: true });
  });

  it("captcha: the report channel's bot hold keeps the dismiss op, and Retry check resends it with the same requestId", () => {
    const held = run(initialMachine(8), { type: "SEND_DISMISS", op: dop(), token: "failed" }).state;
    expect(held.report).toEqual({ kind: "botHold", op: dop() });
    expect(sends(run(held, { type: "RETRY_OK", now: 5 }).effects)).toEqual([{ type: "send", channel: "report", op: dop() }]);
    const viaCaptcha = run(sent(), { type: "RESULT", channel: "report", result: { type: "CAPTCHA" } }).state;
    expect(viaCaptcha.report).toEqual({ kind: "botHold", op: dop() });
  });

  it("429 is netErr saved:no and a lost answer saved:unknown, with the dismissal copy; TRY_AGAIN resends the same op, never an approval", () => {
    const no = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "rate_limited" }) });
    expect(no.state.report).toEqual({ kind: "netErr", op: dop(), saved: "no" });
    expect(texts(no.effects, "announce")).toEqual(["Couldn't send your dismissal. Nothing was saved. Check your connection and try again."]);
    const unknown = run(sent(), { type: "RESULT", channel: "report", result: toOutcome("network") });
    expect(unknown.state.report).toEqual({ kind: "netErr", op: dop(), saved: "unknown" });
    expect(texts(unknown.effects, "announce")).toEqual([
      "Couldn't confirm your dismissal. We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice."]);
    expect(unknown.state.commit).toEqual({ kind: "idle" });
    expect(unconfirmedOn(unknown.state, dop().conceptId)).toBe(true);
    const again = run(unknown.state, { type: "TRY_AGAIN", channel: "report" });
    expect(sends(again.effects)).toEqual([{ type: "send", channel: "report", op: dop() }]);
    expect(run(unknown.state, { type: "TRY_AGAIN", channel: "commit" }).effects).toEqual([]);
  });
});
```

Append to `web/tests/desk-actions.test.ts`:

```ts
describe("dismiss (§5.10a, §7.2 P1C)", () => {
  const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
  const dismiss = (over = {}) => input({ decision: "dismiss", note: "the register says 500 mg", ...over });

  it("a senior's dismissal goes to the API with decision dismiss, the note and the viewed version", async () => {
    getSession.mockResolvedValue(SENIOR);
    expect(await runDecide(dismiss())).toEqual({ ok: true, outcome: OUTCOME });
    expect(postDeskDecision).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", { decision: "dismiss",
      note: "the register says 500 mg", reviewerEmail: "senior@e2e.test", reviewerRole: "senior",
      extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: 41, requestId: RID });
  });

  it("any other role is forbidden in the web, with a decision_denied row and no API call", async () => {
    for (const role of ["pharmacist", "engineer"] as const) {
      getSession.mockResolvedValue({ ...PHARMACIST, role });
      expect(await runDecide(dismiss())).toEqual({ ok: false, code: "forbidden" });
    }
    expect(postDeskDecision).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ event: "decision_denied", outcome: "forbidden", actorRole: "engineer",
      targetType: "batch_item", targetId: "0001-pilot/186-0030-006--napa" }));
  });

  it("the note is 5 to 1000 code points after trimming", async () => {
    getSession.mockResolvedValue(SENIOR);
    expect(await runDecide(dismiss({ note: "  abcd  " }))).toEqual({ ok: false, code: "invalid" });
    expect(await runDecide(dismiss({ note: "😀😀😀😀" }))).toEqual({ ok: false, code: "invalid" });
    expect(await runDecide(dismiss({ note: "x".repeat(1001) }))).toEqual({ ok: false, code: "invalid" });
    expect(await runDecide(dismiss({ note: "অবৈধ রিপোর্ট" }))).toEqual({ ok: true, outcome: OUTCOME });
  });

  it("a 409 on review is no_issue for a dismissal; the other fields keep their codes", async () => {
    getSession.mockResolvedValue(SENIOR);
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "No issue is open on this record", field: "review" });
    expect(await runDecide(dismiss())).toEqual({ ok: false, code: "no_issue" });
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "Another reviewer decided", field: "lastDecisionId" });
    expect(await runDecide(dismiss())).toEqual({ ok: false, code: "stale_decision" });
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "This record was removed from the batch file", field: "conceptId" });
    expect(await runDecide(dismiss())).toEqual({ ok: false, code: "removed" });
    expect(decideStatus({ ok: false, code: "no_issue" })).toBe(409);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/commit-machine.test.ts tests/desk-actions.test.ts`
Expected: FAIL — `SEND_DISMISS` is not an event, `"dismiss"` is not a decision, and `no_issue` is not a code.

- [ ] **Step 3: Implement the machine**

In `web/components/review/desk/commit-machine.ts`:

1. Change the copy import to `import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";`.
2. In `Op`, change `decision: "ok" | "issue";` to `decision: "ok" | "issue" | "dismiss";` and its JSDoc first line to `conceptId: string; name: string; role: ReviewerRole; /** "dismiss" travels on the report channel only (§5.8.2). */`.
3. Add `"no_issue"` to `DecideCode` (after `"removed"`) and to `ConflictCode`'s `Extract<…>` list.
4. Add to `Event`: `| { type: "SEND_DISMISS"; op: Op; token: TokenState }`.
5. Add to `CONFLICT_HINT`: `no_issue: () => P1C_COPY.dismiss.conflictNoIssue,`.
6. Replace `outcome()` and `reportFailed` with:

```ts
/** The report channel's announcements, by what the op was: a report (§5.10) or a dismissal (§5.10a). */
function reportOk(op: Op): string {
  return op.decision === "dismiss" ? fill(P1C_COPY.dismiss.announceDismissed, { name: op.name }) : fill(DESK.reported, { name: op.name });
}
function reportFailed(op: Op, saved: "no" | "unknown"): string {
  const d = P1C_COPY.dismiss;
  if (op.decision !== "dismiss") return `${DESK_NEW.deskMisc.reportFailedTitle} ${DESK_NEW.deskMisc.reportFailedBody}`;
  return saved === "no" ? `${d.failedTitle} ${DESK_NEW.deskMisc.reportFailedBody}` : `${d.unconfirmedTitle} ${d.unconfirmedBody}`;
}

function outcome(s: MachineState, channel: "commit" | "report", op: Op, r: Outcome): { state: MachineState; effects: Effect[] } {
  const clear = channel === "commit" ? { ...s, commit: IDLE } : { ...s, report: { kind: "idle" } as Report };
  const failed = (saved: "no" | "unknown") => channel === "commit"
    ? { ...s, commit: { kind: "netErr", op, saved } as Commit } : { ...s, report: { kind: "netErr", op, saved } as Report };
  switch (r.type) {
    case "OK":
      return { state: clear, effects: [{ type: "saved", channel, op, outcome: r.outcome },
        ...(channel === "report" ? [announce(reportOk(op))] : [])] };
    case "CONFLICT":
      if (r.code === "stale_rerun" || r.code === "stale_decision")
        return { state: clear, effects: [{ type: "stale", conceptId: op.conceptId, reason: r.code === "stale_rerun" ? "rerun" : "other",
          cancelled: true }] };
      return { state: clear, effects: [hint(CONFLICT_HINT[r.code]()), { type: "refresh" }] };
    case "CAPTCHA":
      return { state: channel === "commit" ? { ...s, commit: { kind: "botHold", hold: "commit", op } } : { ...s, report: { kind: "botHold", op } },
        effects: [announce(DESK.botFailedAnnounce)] };
    case "FORBIDDEN":
      return { state: { ...clear, auth: "forbidden" }, effects: [announce(fill(DESK.noAuthAnnounce, { name: op.name }))] };
    case "UNAUTHENTICATED":
      return { state: { ...clear, auth: "signedOut" }, effects: [announce(fill(DESK_NEW.sessionExpired.block, { name: op.name }))] };
    case "NOT_SAVED":
      return { state: failed("no"), effects: [announce(channel === "commit" ? DESK.netAnnounce : reportFailed(op, "no"))] };
    case "UNCONFIRMED":
      return { state: failed("unknown"), effects: [announce(channel === "commit" ? DESK_NEW.decisionUnconfirmed.announce : reportFailed(op, "unknown"))] };
  }
}
```

7. In `step`, after the `case "SEND_REPORT": { … }` block add:

```ts
    case "SEND_DISMISS": {
      // §5.8.2 (P1C): a senior's dismissal is a report-channel op. No undo window, and the commit channel is never touched:
      // the bar refuses D while a window or a failed commit is open on this record (bar-state dismissHint).
      if (s.report.kind !== "idle" || e.op.role !== "senior" || e.op.decision !== "dismiss") return { state: s, effects: [] };
      if (e.token === "failed") return { state: { ...s, report: { kind: "botHold", op: e.op } }, effects: [announce(DESK.botFailedAnnounce)] };
      return { state: { ...s, report: { kind: "sending", op: e.op } }, effects: [{ type: "send", channel: "report", op: e.op }] };
    }
```

- [ ] **Step 4: Implement the action and the API body**

In `web/lib/api.ts`, `DecisionRequest`'s first line becomes:

```ts
  decision: "ok" | "issue" | "dismiss"; note: string; reviewerEmail: string; reviewerRole: ReviewerRole;
```

In `web/lib/desk-core.ts`:

1. `DecideInput`'s first line becomes `batchId: string; conceptId: string; decision: "ok" | "issue" | "dismiss"; note: string; extractedAt: string | null;`.
2. In `parse`, replace

```ts
  if (i.decision !== "ok" && i.decision !== "issue") return null;
  if (typeof i.note !== "string") return null;
  const note = i.note.trim();
  if (codePoints(note) > NOTE_MAX || (i.decision === "issue" && codePoints(note) < ISSUE_MIN)) return null;
```

with

```ts
  if (i.decision !== "ok" && i.decision !== "issue" && i.decision !== "dismiss") return null;
  if (typeof i.note !== "string") return null;
  const note = i.note.trim();
  // A report and a dismissal both need 5 to 1000 code points (§5.10, §5.10a), counted as the API counts them.
  if (codePoints(note) > NOTE_MAX || (i.decision !== "ok" && codePoints(note) < ISSUE_MIN)) return null;
```

3. In `runDecide`, after `if (!d) return { ok: false, code: "invalid" };` add

```ts
  // §5.10a: only a senior may dismiss. The web refuses other roles itself (the API would answer 400 reviewerRole).
  if (d.decision === "dismiss" && session.role !== "senior") {
    await deny("forbidden", session, target);
    return { ok: false, code: "forbidden" };
  }
```

and replace `if (r.status === 409) return { ok: false, code: conflictCode(r.field, r.error) };` with

```ts
  // §5.11: for a dismissal, 409 field=review is the API's step 6d, "No issue is open on this record" (no_issue).
  if (r.status === 409) return { ok: false, code: d.decision === "dismiss" && r.field === "review" ? "no_issue" : conflictCode(r.field, r.error) };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/commit-machine.test.ts tests/desk-actions.test.ts && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/review/desk/commit-machine.ts web/lib/desk-core.ts web/lib/api.ts web/tests/commit-machine.test.ts web/tests/desk-actions.test.ts
git commit -m "feat(web): dismissals ride the report channel of the commit machine; decide accepts dismiss from seniors only (§5.8.2, §5.10a)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Dismiss issue on the desk — the D key, the button, the panel and its failures (§5.7, §5.10a, §5.14)

**Files:**
- Modify: `web/components/review/desk/bar-state.ts`, `web/components/review/desk/keys.ts`, `web/components/review/desk/drafts.ts`, `web/components/review/desk/context.ts`, `web/components/review/desk/DecisionBar.tsx`, `web/components/review/desk/ShortcutsSheet.tsx`, `web/components/review/ReviewDesk.tsx`, `web/components/review/desk.module.css`, `web/lib/review-copy.ts`
- Modify: `web/app/review/[batchId]/[conceptId]/page.tsx`
- Modify: `web/tests/desk-reg.ts`, `web/tests/desk-stub.tsx`, `web/tests/desk-harness.tsx`
- Test: `web/tests/desk-keys.test.tsx`, `web/tests/bar-state.test.ts`, `web/tests/desk-keymap.test.ts`, `web/tests/account-menu-drafts.test.tsx`

**Interfaces:**
- Consumes: Task 15's `SEND_DISMISS`, `Op.decision: "dismiss"`; Task 14's `OpenIssue`; Task 13's `P1C_COPY.dismiss`.
- Produces: `BarCtx.dismissOpen?: boolean`; `dismissHint(ctx) → {block, text}` (no text for a non-senior: D does nothing), `dismissDisabled(ctx)`, `sendDismissHint(ctx)`; promise rows "Dismissing the issue." and the senior issue body. `keyAction` maps `d` to `"dismiss"`, and in the dismiss field (`data-desk="dismiss-note"`, target `"dismissNote"`) Ctrl/Cmd+Enter to `"sendDismiss"` and Esc to `"closeDismiss"`; Esc elsewhere closes the dismiss panel after the drawer and the report panel. `drafts.ts`: `DISMISS_DRAFT_PREFIX = "intellidrugs-dismiss-draft:"`, `PAIR_DRAFT_PREFIX = "intellidrugs-pair-draft:"`, `dismissDraftKey(b, c)`, `pairDraftKey(a, b)`, `loadDraftAt(key)`, `saveDraftAt(key, value)`; `clearAllDrafts` removes all three prefixes. `RecordRegistration.openIssues: OpenIssue[]`; `DeskApi` adds `dismissOpen`, `dismissNote`, `dismissError`, `clickDismiss()`, `closeDismiss(focusBack, discard)`, `setDismissNote(v)`, `sendDismiss()`. `review-copy.ts`: `keyRow(role, status)` and `SHEET_ROWS(n, role = "pharmacist")`.

- [ ] **Step 1: Write the failing tests**

In `web/tests/desk-reg.ts`, in the returned object, after `complete: false,` add `openIssues: [],`.

In `web/tests/desk-stub.tsx`, in `stubDesk`'s returned object, after `noteError: false,` add `dismissOpen: false, dismissNote: "", dismissError: false,` and after `registerSearchClear: vi.fn(),` add `clickDismiss: vi.fn(), closeDismiss: vi.fn(), setDismissNote: vi.fn(), sendDismiss: vi.fn(),`.

In `web/tests/desk-harness.tsx`, change the `role` prop type to `role?: "pharmacist" | "engineer" | "senior"`.

Append to `web/tests/bar-state.test.ts` (change its first import to also import `dismissDisabled, dismissHint, sendDismissHint`):

```ts
describe("Dismiss issue (§5.7, §5.8.4, §5.10a)", () => {
  const senior = (over: Partial<BarCtx> = {}) => ctx({ role: "senior", record: rec({ status: "issue" }), ...over });
  const dismissOp = op({ role: "senior", decision: "dismiss", note: "the register says 500 mg" });

  it("the promise: a senior on an issue, a dismissal saving, and a failed dismissal that keeps the senior row", () => {
    expect(promise(senior())).toEqual({ lead: "An issue is open on this record.",
      body: "If the report was a mistake, dismiss it. Otherwise it returns to review after the fix and re-run." });
    expect(promise(ctx({ record: rec({ status: "issue" }) })).body).toBe("It returns to review after the fix and re-run.");
    expect(promise(senior({ machine: machine({ report: { kind: "sending", op: dismissOp } }) })))
      .toEqual({ lead: "Dismissing the issue.", body: "Saving now." });
    expect(promise(senior({ machine: machine({ report: { kind: "netErr", op: dismissOp, saved: "unknown" } }) })).lead)
      .toBe("An issue is open on this record.");
  });

  it.each([
    ["pharmacist: D does nothing, no hint", { role: "pharmacist" as const }, { block: true, text: null }],
    ["drawer open", { drawerOpen: true }, { block: true, text: "Close the evidence first (Esc)." }],
    ["stale", { stale: true }, { block: true, text: "Decisions are paused. Reload the record first." }],
    ["no open issue", { record: rec({ status: "pending" }) }, { block: true, text: "No issue is open on this record." }],
    ["undo window here", { machine: machine({ commit: { kind: "armed", op: op({ role: "senior" }), deadline: 1 } }) },
      { block: true, text: "Finish or undo your decision on this record first." }],
    ["saving commit here", { machine: machine({ commit: { kind: "committing", op: op({ role: "senior" }) } }) },
      { block: true, text: "Finish or undo your decision on this record first." }],
    ["failed commit here", { machine: machine({ commit: { kind: "netErr", op: op({ role: "senior" }), saved: "no" } }) },
      { block: true, text: "Finish or undo your decision on this record first." }],
    ["ready", {}, { block: false, text: null }],
  ] as [string, Partial<BarCtx>, { block: boolean; text: string | null }][])("D: %s", (_name, over, want) => {
    expect(dismissHint(senior(over))).toEqual(want);
  });

  it("Dismiss is aria-disabled when stale, drawer open, a window or failed commit here, a bot hold, or no auth", () => {
    expect(dismissDisabled(senior())).toBe(false);
    for (const over of [{ stale: true }, { drawerOpen: true },
      { machine: machine({ commit: { kind: "armed", op: op({ role: "senior" }), deadline: 1 } }) },
      { machine: machine({ commit: { kind: "netErr", op: op({ role: "senior" }), saved: "unknown" } }) },
      { machine: machine({ report: { kind: "botHold", op: dismissOp } }) }, { machine: machine({ auth: "signedOut" }) }] as Partial<BarCtx>[])
      expect(dismissDisabled(senior(over))).toBe(true);
  });

  it("Send dismissal: paused while stale, held during a bot hold; Looks correct is disabled while the panel is open", () => {
    expect(sendDismissHint(senior({ stale: true }))).toBe("Dismissing is paused until you reload the record. Your note is kept.");
    expect(sendDismissHint(senior({ machine: machine({ report: { kind: "botHold", op: dismissOp } }) })))
      .toBe("Retry the bot check first. Your earlier decision is kept.");
    expect(sendDismissHint(senior())).toBeNull();
    expect(approveDisabled(ctx({ role: "senior", dismissOpen: true }))).toBe(true);
  });
});
```

In `web/tests/desk-keymap.test.ts`, add `// @vitest-environment jsdom` as the first line (`targetKind` needs `document`), change its keys import to `import { keyAction, targetKind, type KeyTarget } from "@/components/review/desk/keys";`, and append:

```ts
describe("D and the dismiss field (§5.14 P1C)", () => {
  const base = { singleKeys: true, sheetOpen: false, target: "other" as const, searchHasText: false, drawerOpen: false, reportOpen: false };
  const ev = (key: string, mods = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it("d and D are dismiss; with single keys off they do nothing", () => {
    expect(keyAction(ev("d"), base)).toBe("dismiss");
    expect(keyAction(ev("D"), base)).toBe("dismiss");
    expect(keyAction(ev("d"), { ...base, singleKeys: false })).toBeNull();
  });
  it("in the dismiss field: Ctrl or Cmd Enter sends, Esc closes, Enter alone and letters do nothing", () => {
    const f = { ...base, target: "dismissNote" as const, dismissOpen: true };
    expect(keyAction(ev("Enter", { ctrlKey: true }), f)).toBe("sendDismiss");
    expect(keyAction(ev("Enter", { metaKey: true }), f)).toBe("sendDismiss");
    expect(keyAction(ev("Enter"), f)).toBeNull();
    expect(keyAction(ev("a"), f)).toBeNull();
    expect(keyAction(ev("Escape"), f)).toBe("closeDismiss");
  });
  it("Esc outside the field closes the drawer, then the report, then the dismiss panel", () => {
    expect(keyAction(ev("Escape"), { ...base, dismissOpen: true })).toBe("closeDismiss");
    expect(keyAction(ev("Escape"), { ...base, drawerOpen: true, dismissOpen: true })).toBe("closeDrawer");
  });
  it("the dismiss textarea is its own target", () => {
    const t = document.createElement("textarea");
    t.setAttribute("data-desk", "dismiss-note");
    expect(targetKind(t)).toBe("dismissNote");
  });
});
```


Append to `web/tests/account-menu-drafts.test.tsx`:

```ts
describe("sign-out clears the P1C drafts too (§5.10a, §5.17.2)", () => {
  it("dismiss and pair drafts go with the report drafts", async () => {
    const { clearAllDrafts, dismissDraftKey, pairDraftKey, saveDraftAt } = await import("@/components/review/desk/drafts");
    saveDraftAt(dismissDraftKey("0001-pilot", "napa"), "the register says 500 mg");
    saveDraftAt(pairDraftKey("DDInter14", "DDInter1951"), "text contradicts the severity");
    sessionStorage.setItem("unrelated", "kept");
    clearAllDrafts();
    expect(sessionStorage.getItem("intellidrugs-dismiss-draft:0001-pilot:napa")).toBeNull();
    expect(sessionStorage.getItem("intellidrugs-pair-draft:DDInter14:DDInter1951")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("kept");
  });
});
```

Append to `web/tests/desk-keys.test.tsx`:

```ts
describe("Dismiss issue on the desk (§5.7, §5.10a, §5.14)", () => {
  const ISSUE = { role: "pharmacist" as const, at: "2026-10-15T03:00:00Z", note: "strength should read 5 mg", mine: false };
  const PENDING = { review: "pending", displayStatus: "pending", batchStatus: "in_review",
    version: { extractedAt: "2026-10-11T21:28:09.250Z", lastDecisionId: 50 }, replayed: false };
  async function mountIssue(role: "senior" | "pharmacist" | "engineer" = "senior") {
    const reg = makeReg("napa", { displayStatus: "issue", openIssues: [ISSUE] });
    render(<Desk reg={reg} role={role}><DetailTools reg={reg} /><p>napa detail</p></Desk>);
    await act(async () => {});
    act(() => turnstile.props!.onToken!("tok-1"));
  }
  const panel = () => document.getElementById("bar-dismiss");
  const field = () => document.getElementById("dismiss-note") as HTMLTextAreaElement;
  const button = () => document.querySelector<HTMLButtonElement>('[data-fk="dismiss"]');
  const live = () => document.querySelector('[data-desk="live"]')!.textContent;
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

  it("a senior on an issue: the button, the D key row entry, and D opens the panel quoting the report", async () => {
    await mountIssue();
    expect(button()!.textContent).toBe("Dismiss issue D");
    expect(button()!.getAttribute("aria-keyshortcuts")).toBe("D");
    expect(button()!.getAttribute("aria-controls")).toBe("bar-dismiss");
    expect(document.querySelector(".decision-keys")!.textContent).toContain("R reportD dismiss issueE evidence");
    key("d");
    expect(button()!.getAttribute("aria-expanded")).toBe("true");
    expect(panel()!.getAttribute("role")).toBe("group");
    expect(document.activeElement).toBe(field());
    expect(panel()!.textContent).toContain("Dismiss this issue");
    expect(panel()!.textContent).toContain("Reported by a pharmacist on 15/10/2026 09:00 Dhaka: strength should read 5 mg");
    expect(panel()!.textContent).toContain("Dismissing records that the report was a mistake.");
    expect(panel()!.textContent).toContain("5 to 1000 characters. Don't include patient names or other personal health details.");
    desk().focus();
    key("d");
    expect(document.activeElement).toBe(field());
  });

  it("a pharmacist or an engineer sees the issue but no Dismiss control; D does nothing and shows no hint", async () => {
    for (const role of ["pharmacist", "engineer"] as const) {
      await mountIssue(role);
      expect(button()).toBeNull();
      key("d");
      expect(panel()).toBeNull();
      expect(hint()).toBe("");
      expect(document.querySelector(".decision-keys")!.textContent).not.toContain("dismiss issue");
      cleanup();
    }
  });

  it("Esc keeps the draft and Cancel discards it; focus returns to Dismiss issue each time", async () => {
    await mountIssue();
    key("d");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    key("Escape", field());
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(sessionStorage.getItem("intellidrugs-dismiss-draft:0001-pilot:186-0030-006--napa")).toBe("the register says 500 mg");
    key("d");
    expect(field().value).toBe("the register says 500 mg");
    fireEvent.click(within(panel()!).getByRole("button", { name: /^Cancel/ }));
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
    key("d");
    expect(field().value).toBe("");
  });

  it("opening Dismiss closes Report and keeps its draft; a click on Dismiss while open closes it, focus staying on it", async () => {
    await mountIssue();
    key("r");
    fireEvent.change(document.getElementById("note")!, { target: { value: "another report" } });
    fireEvent.click(button()!);
    expect(document.getElementById("bar-report")).toBeNull();
    expect(panel()).not.toBeNull();
    expect(sessionStorage.getItem("intellidrugs-draft:0001-pilot:186-0030-006--napa")).toBe("another report");
    button()!.focus();
    fireEvent.click(button()!);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("Ctrl or Cmd Enter sends, Enter alone never does, and under 5 characters shows the error", async () => {
    await mountIssue();
    actions.decide.mockResolvedValue({ ok: true, outcome: PENDING });
    key("d");
    fireEvent.change(field(), { target: { value: "abcd" } });
    key("Enter", field());
    expect(actions.decide).not.toHaveBeenCalled();
    key("Enter", field(), { ctrlKey: true });
    expect(panel()!.querySelector(".field-error")?.textContent).toBe("Add at least 5 characters so the team knows why the report was dismissed.");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    expect(panel()!.querySelector(".field-error")).toBeNull();
    await act(async () => { key("Enter", field(), { metaKey: true }); });
    expect(actions.decide).toHaveBeenCalledTimes(1);
    expect(actions.decide.mock.calls[0][0]).toMatchObject({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", decision: "dismiss",
      note: "the register says 500 mg", extractedAt: "2026-10-11T21:28:09.250Z", expectedLastDecisionId: null, turnstileToken: "tok-1" });
  });

  it("the dismissal note is counted in code points (Review Focus 4)", async () => {
    await mountIssue();
    actions.decide.mockResolvedValue({ ok: true, outcome: PENDING });
    key("d");
    fireEvent.change(field(), { target: { value: "😀😀😀😀" } });
    expect(panel()!.textContent).toContain("4 / 1000");
    key("Enter", field(), { ctrlKey: true });
    expect(panel()!.querySelector(".field-error")?.textContent).toBe("Add at least 5 characters so the team knows why the report was dismissed.");
    expect(actions.decide).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "অবৈধ রিপোর্ট" } });
    expect(panel()!.textContent).toContain("12 / 1000");
    await act(async () => { key("Enter", field(), { ctrlKey: true }); });
    expect(actions.decide).toHaveBeenCalledTimes(1);
    expect(actions.decide.mock.calls[0][0].note).toBe("অবৈধ রিপোর্ট");
  });

  it("on success: the panel closes, the button goes, focus is on Looks correct, it is announced and nothing advances", async () => {
    await mountIssue();
    actions.decide.mockResolvedValue({ ok: true, outcome: PENDING });
    key("d");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    await act(async () => { key("Enter", field(), { ctrlKey: true }); });
    expect(panel()).toBeNull();
    expect(button()).toBeNull();
    expect(document.activeElement?.getAttribute("data-fk")).toBe("approve");
    expect(router.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intellidrugs-dismiss-draft:0001-pilot:186-0030-006--napa")).toBeNull();
    await settle();
    expect(live()).toBe("Issue dismissed for Napa. The record is back in review for a pharmacist.");
  });

  it("a lost answer: the report channel's banner with the dismissal copy, never the approval banner; Try again resends the same op", async () => {
    await mountIssue();
    actions.decide.mockRejectedValueOnce(new Error("network"));
    key("d");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    await act(async () => { key("Enter", field(), { ctrlKey: true }); });
    const bar = document.getElementById("decision-bar")!;
    expect(within(bar).getByText("Couldn't confirm your dismissal.")).toBeTruthy();
    expect(within(bar).getByText("We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice.")).toBeTruthy();
    expect(bar.textContent).not.toContain("Decision: Looks correct on");
    expect(bar.querySelector(".decision-promise")!.textContent)
      .toBe("An issue is open on this record. If the report was a mistake, dismiss it. Otherwise it returns to review after the fix and re-run.");
    expect(panel()).not.toBeNull();
    actions.decide.mockResolvedValueOnce({ ok: true, outcome: PENDING });
    act(() => turnstile.props!.onToken!("tok-2"));
    await act(async () => { fireEvent.click(within(bar).getByRole("button", { name: "Try again" })); });
    const [first, second] = actions.decide.mock.calls.map((c) => c[0]);
    expect(second).toMatchObject({ decision: "dismiss", note: first.note, requestId: first.requestId, extractedAt: first.extractedAt,
      expectedLastDecisionId: first.expectedLastDecisionId, turnstileToken: "tok-2" });
  });

  it("the shortcuts sheet lists D for a senior only", async () => {
    await mountIssue();
    key("?");
    expect(within(screen.getByRole("dialog")).getByText("Dismiss an open issue")).toBeTruthy();
    cleanup();
    await mountIssue("pharmacist");
    key("?");
    expect(within(screen.getByRole("dialog")).queryByText("Dismiss an open issue")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/bar-state.test.ts tests/desk-keymap.test.ts tests/account-menu-drafts.test.tsx tests/desk-keys.test.tsx`
Expected: FAIL — `dismissHint` is not exported, `d` maps to nothing, the drafts helpers do not exist, and no Dismiss control renders.

- [ ] **Step 3: Implement the pure parts**

In `web/components/review/desk/bar-state.ts`:

1. Change the copy import to `import { DESK_NEW, P1C_COPY, PROMISE_ENGINEER, PROMISE_PAUSED, PROMISE_PHARMACIST, PROMISE_SENIOR, fill } from "@/lib/copy";`.
2. In `BarCtx`, after `reportOpen: boolean;` add `/** §5.10a, seniors only; absent reads as closed. */ dismissOpen?: boolean;`.
3. After `netErrHere` add:

```ts
const dismissingHere = (ctx: BarCtx) => ctx.machine.report.kind === "sending" && ctx.machine.report.op.decision === "dismiss"
  && onRecord(ctx, ctx.machine.report.op.conceptId);
/** §5.10a: D is refused while a decision on this record is open, saving or failed (the commit channel). */
const commitHere = (ctx: BarCtx) => {
  const open = windowOn(ctx.machine);
  return (open !== null && onRecord(ctx, open.conceptId)) || netErrHere(ctx) !== null;
};
```

4. In `promise`, replace

```ts
  if (r?.status === "issue") return p(DESK.promiseIssue, DESK.promiseIssueBody);
```

with

```ts
  if (dismissingHere(ctx)) return p(P1C_COPY.dismiss.promiseSavingLead, P1C_COPY.dismiss.promiseSavingBody);
  if (r?.status === "issue") return p(DESK.promiseIssue, ctx.role === "senior" ? P1C_COPY.dismiss.promiseSeniorIssueBody : DESK.promiseIssueBody);
```

5. In `approveDisabled`, change the first condition to include the panel and a saving dismissal:

```ts
  if (r === null || ctx.loading || ctx.complete || ctx.stale || ctx.drawerOpen || ctx.reportOpen || ctx.dismissOpen || m.auth !== "ok") return true;
  if (dismissingHere(ctx)) return true;
```

6. Append:

```ts
/** D, and the Dismiss issue button while the panel is closed (§5.8.4 P1C rows). Not a senior: nothing, and no hint (§5.14). */
export function dismissHint(ctx: BarCtx): Hint {
  if (ctx.role !== "senior") return { block: true, text: null };
  if (ctx.machine.auth === "forbidden") return say(DESK.noAuthTitle);
  if (ctx.machine.auth === "signedOut") return say(DESK_NEW.sessionExpired.hint);
  if (ctx.loading || ctx.complete || ctx.record === null) return { block: true, text: null };
  if (ctx.drawerOpen) return say(DESK_NEW.drawerOpen.hint);
  if (ctx.stale) return say(DESK.paused);
  if (ctx.record.status !== "issue") return say(P1C_COPY.dismiss.hintNoIssue);
  if (commitHere(ctx)) return say(P1C_COPY.dismiss.hintFinish);
  if (ctx.machine.commit.kind === "botHold" || ctx.machine.report.kind === "botHold") return say(DESK.botFirst);
  return allow;
}

/** §5.7: "Dismiss issue" stays focusable but is aria-disabled in these states. */
export function dismissDisabled(ctx: BarCtx): boolean {
  const m = ctx.machine;
  return ctx.stale || ctx.drawerOpen || commitHere(ctx) || m.commit.kind === "botHold" || m.report.kind === "botHold" || m.auth !== "ok";
}

/** §5.10a "While stale" and the bot hold, for the panel's Dismiss issue button and Ctrl/Cmd+Enter. */
export function sendDismissHint(ctx: BarCtx): string | null {
  if (ctx.stale) return P1C_COPY.dismiss.paused;
  if (ctx.machine.report.kind === "botHold" || ctx.machine.commit.kind === "botHold") return DESK.botFirst;
  return null;
}
```

Replace `web/components/review/desk/keys.ts` with:

```ts
/** §5.14 keyboard model as a pure mapping from a key event and its context to one desk action. */
export type KeyTarget = "note" | "dismissNote" | "approve" | "search" | "listbox" | "field" | "other";
export type KeyAction = "approve" | "undo" | "report" | "dismiss" | "next" | "prev" | "first" | "last" | "evidence" | "source" | "sheet"
  | "closeSheet" | "closeDrawer" | "closeReport" | "closeDismiss" | "clearSearch" | "sendReport" | "sendDismiss" | "enterBlocked";

export const IS_MAC_RE = /Mac|iPhone|iPad/;

const LETTERS: Record<string, KeyAction> = {
  a: "approve", u: "undo", r: "report", d: "dismiss", j: "next", k: "prev", e: "evidence", s: "source",
};
const LIST: Record<string, KeyAction> = { ArrowDown: "next", ArrowUp: "prev", Home: "first", End: "last" };

export function keyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
    ctx: { singleKeys: boolean; sheetOpen: boolean; target: KeyTarget; searchHasText: boolean; drawerOpen: boolean; reportOpen: boolean;
      dismissOpen?: boolean }): KeyAction | null {
  if (ctx.sheetOpen) {
    if (e.key === "Escape") return "closeSheet";
    if (e.key === "?" && ctx.singleKeys) return "closeSheet";
    return null;
  }
  if (e.key === "Enter" && ctx.target === "approve") return "enterBlocked";
  if (ctx.target === "note" || ctx.target === "dismissNote") {
    const dismiss = ctx.target === "dismissNote";
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return dismiss ? "sendDismiss" : "sendReport";
    if (e.key === "Escape") return dismiss ? "closeDismiss" : "closeReport";
    return null;
  }
  if (e.key === "Escape") {
    if (ctx.drawerOpen) return "closeDrawer";
    if (ctx.reportOpen) return "closeReport";
    if (ctx.dismissOpen) return "closeDismiss";
    if (ctx.target === "search" && ctx.searchHasText) return "clearSearch";
    return null;
  }
  if (ctx.target === "field" || ctx.target === "search" || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (ctx.target === "listbox" && e.key in LIST) return LIST[e.key];
  if (!ctx.singleKeys) return null;
  if (e.key === "?") return "sheet";
  return e.key.length === 1 ? LETTERS[e.key.toLowerCase()] ?? null : null;
}

/** What the key event's target is, for keyAction. */
export function targetKind(el: Element | null): KeyTarget {
  if (!el) return "other";
  const desk = el.getAttribute("data-desk");
  if (desk === "note") return "note";
  if (desk === "dismiss-note") return "dismissNote";
  if (desk === "approve") return "approve";
  if (desk === "search") return "search";
  if (el.getAttribute("role") === "listbox") return "listbox";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable) return "field";
  return "other";
}
```

Replace `web/components/review/desk/drafts.ts` with:

```ts
/**
 * Note drafts: per record (§5.10 reports, §5.10a dismissals) or per pair (§5.17.2), in memory, mirrored to
 * sessionStorage; never outliving the session.
 */
export const DRAFT_PREFIX = "intellidrugs-draft:";
export const DISMISS_DRAFT_PREFIX = "intellidrugs-dismiss-draft:";
export const PAIR_DRAFT_PREFIX = "intellidrugs-pair-draft:";
const PREFIXES = [DRAFT_PREFIX, DISMISS_DRAFT_PREFIX, PAIR_DRAFT_PREFIX];
export const draftKey = (batchId: string, conceptId: string) => `${DRAFT_PREFIX}${batchId}:${conceptId}`;
export const dismissDraftKey = (batchId: string, conceptId: string) => `${DISMISS_DRAFT_PREFIX}${batchId}:${conceptId}`;
export const pairDraftKey = (ddinterA: string, ddinterB: string) => `${PAIR_DRAFT_PREFIX}${ddinterA}:${ddinterB}`;
const memory = new Map<string, string>();

export function loadDraftAt(k: string): string {
  try {
    const v = window.sessionStorage.getItem(k);
    if (v !== null) return v;
  } catch {
    // storage blocked: memory only
  }
  return memory.get(k) ?? "";
}

export function saveDraftAt(k: string, value: string): void {
  if (value) memory.set(k, value); else memory.delete(k);
  try {
    if (value) window.sessionStorage.setItem(k, value); else window.sessionStorage.removeItem(k);
  } catch {
    // storage blocked: memory only
  }
}

export const loadDraft = (batchId: string, conceptId: string) => loadDraftAt(draftKey(batchId, conceptId));
export const saveDraft = (batchId: string, conceptId: string, value: string) => saveDraftAt(draftKey(batchId, conceptId), value);
export const clearDraft = (batchId: string, conceptId: string) => saveDraft(batchId, conceptId, "");

/** Sign-out removes every draft (§5.10, §5.10a, §5.17.2); POST /signout's Clear-Site-Data covers the no-JavaScript case. */
export function clearAllDrafts(): void {
  memory.clear();
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k && PREFIXES.some((p) => k.startsWith(p))) window.sessionStorage.removeItem(k);
    }
  } catch {
    // nothing stored
  }
}
```

In `web/lib/review-copy.ts`:

1. Change the types import to `import { actsAsPharmacist, type DisplayStatus, type HistoryEntry, type ReviewerRole, type StageKey } from "./review-types";`.
2. Replace `SHEET_ROWS` with:

```ts
/** The shortcuts sheet rows (Board R); the first uses the reviewer's undo window. A senior also gets D (§5.14 P1C). */
export const SHEET_ROWS = (n: number, role: ReviewerRole = "pharmacist"): [string, string][] => [
  ["A", `Looks correct, then an ${n}-second undo window`], ["U", "Undo during the window"], ["R", "Report an issue"],
  ...(role === "senior" ? [["D", P1C_COPY.dismiss.sheetRow] as [string, string]] : []),
  ["J K", "Next and previous record"], ["E", "Evidence: raw DGDA row and pipeline notes"], ["S", "Open the DGDA source"],
  ["?", "This sheet"], ["Esc", "Close the sheet, the evidence or the note"], ["SEND", "Send the report, inside the note field"],
  ["Enter", "Never approves"],
];
```

3. After `KEY_ROW` add:

```ts
/** §5.7 item 8: for a senior on an `issue` record, "D dismiss issue" follows "R report". */
export function keyRow(role: ReviewerRole, status: DisplayStatus | undefined): [string[], string][] {
  if (role !== "senior" || status !== "issue") return KEY_ROW;
  const at = KEY_ROW.findIndex(([keys]) => keys[0] === "R") + 1;
  return [...KEY_ROW.slice(0, at), [["D"], P1C_COPY.dismiss.keyRow], ...KEY_ROW.slice(at)];
}
```

In `web/components/review/desk/context.ts`:

1. Change the types import to `import type { DiffRow, DisplayStatus, FilterKey, ItemHint, OpenIssue, ReviewerRole, Version } from "@/lib/review-types";`.
2. In `RecordRegistration`, after `complete: boolean;` add:

```ts
  /** §5.10a: the counted issues the dismiss panel quotes, oldest first (roles only, never an email). */
  openIssues: OpenIssue[];
```

3. In `DeskApi`, after `note: string; noteError: boolean;` add `dismissOpen: boolean; dismissNote: string; dismissError: boolean;`, and after `registerSearchClear(fn: (() => void) | null): void;` add:

```ts
  /** §5.10a, seniors only: the dismiss panel shares the report channel (§5.8.2). */
  clickDismiss(): void; closeDismiss(focusBack: boolean, discard: boolean): void; setDismissNote(v: string): void; sendDismiss(): void;
```

4. In `barFromRegistration`, after `reportOpen: false,` add `dismissOpen: false,`.

In `web/app/review/[batchId]/[conceptId]/page.tsx`, in the `reg` object after `complete: …,` add `openIssues: item.openIssues,`.

- [ ] **Step 4: Implement the bar and the desk**

In `web/components/review/desk.module.css` append:

```css
/* §5.10a dismiss panel: the report panel's frame, the quoted reports before the field. */
.dismissTitle { font: 600 14px/1.4 var(--font-ui); }
.dismissQuote { font-size: 13px; color: var(--fg-2); }
.dismissQuote :global(.raw) { color: var(--fg); white-space: pre-wrap; }
```

In `web/components/review/desk/DecisionBar.tsx`:

1. Change imports: `import { DESK_NEW, NO_PHI_HELP, P1C_COPY, fill } from "@/lib/copy";`, add `import { fmtDhaka } from "@/lib/format";`, `import { DESK, keyRow } from "@/lib/review-copy";` (replacing the `KEY_ROW` import), `import type { OpenIssue } from "@/lib/review-types";`, and `import { approveDisabled, dismissDisabled, noteLength, promise, reportDisabled, sendDisabled } from "./bar-state";`.
2. Above `export default function DecisionBar` add:

```tsx
const d = P1C_COPY.dismiss;
/** "Reported by {a pharmacist|a senior pharmacist|an engineer|you}" (§5.10a). */
const reporter = (i: OpenIssue) => (i.mine ? d.byYou : i.role === "senior" ? d.bySenior : i.role === "pharmacist" ? d.byPharmacist : d.byEngineer);
```

3. Replace the `{!commitErr && reportErr && ( … )}` block with:

```tsx
      {!commitErr && reportErr && (reportErr.op.decision === "dismiss" ? (
        <Banner tone="crit" title={reportErr.saved === "no" ? d.failedTitle : d.unconfirmedTitle}
          body={reportErr.saved === "no" ? DESK_NEW.deskMisc.reportFailedBody : d.unconfirmedBody}
          action={<Button variant="tonal" size="sm" busyLabel={d.busy} onClick={desk.tryAgain}>{DESK.tryAgain}</Button>} />
      ) : (
        <Banner tone="crit" title={DESK_NEW.deskMisc.reportFailedTitle} body={DESK_NEW.deskMisc.reportFailedBody}
          action={<Button variant="tonal" size="sm" busyLabel={DESK.sending} onClick={desk.tryAgain}>{DESK.tryAgain}</Button>} />
      ))}
```

4. After the report panel block (`{desk.reportOpen && m.auth === "ok" && ( … )}`) add:

```tsx
      {desk.dismissOpen && m.auth === "ok" && (
        <div className={styles.report} id="bar-dismiss" role="group" aria-labelledby="bar-dismiss-h">
          <p className={styles.dismissTitle} id="bar-dismiss-h">{d.title}</p>
          {reg.openIssues.map((i, n) => (
            <p className={styles.dismissQuote} key={n}>{fill(d.quote, { who: reporter(i), date: fmtDhaka(i.at) })} <span className="raw">{i.note}</span></p>
          ))}
          <p>{d.consequence}</p>
          <Field id="dismiss-note" label={d.noteLabel}
            control={<textarea className="textarea" maxLength={1000} placeholder={d.notePlaceholder} value={desk.dismissNote} data-desk="dismiss-note"
              onChange={(e) => desk.setDismissNote(e.target.value)} />}
            help={<>{!desk.dismissError && `${DESK.noteHelp} `}{NO_PHI_HELP}</>}
            error={desk.dismissError ? d.noteError : undefined}
            counter={fill(DESK.noteCount, { len: noteLength(desk.dismissNote) })} />
          <div className={styles.reportActs}>
            {ctx.stale && <span className={styles.reportPaused}>{d.paused}</span>}
            <Button variant="tonal" size="sm" onClick={() => desk.closeDismiss(true, true)}>{DESK.cancel} <Kbd keys="Esc" /></Button>
            <Button variant="primary" size="sm" aria-disabled={ctx.stale}
              busy={m.report.kind === "sending" && m.report.op.decision === "dismiss"} busyLabel={d.busy}
              onClick={desk.sendDismiss}>{d.button} <Kbd keys={sendKeys} /></Button>
          </div>
        </div>
      )}
```

5. In `decision-actions`, between `<BotCheck … />` and the Report issue button add:

```tsx
            {desk.role === "senior" && ctx.record?.status === "issue" && (
              <Button variant="tonal" data-fk="dismiss" data-desk="dismiss" aria-disabled={dismissDisabled(ctx)} aria-expanded={desk.dismissOpen}
                aria-controls="bar-dismiss" aria-keyshortcuts={k ? "D" : undefined} onClick={desk.clickDismiss}>
                {d.button}{k && <> <Kbd keys="D" /></>}
              </Button>
            )}
```

6. Replace `{KEY_ROW.map(` with `{keyRow(desk.role, ctx.record?.status).map(`.

In `web/components/review/desk/ShortcutsSheet.tsx`: add an optional `role` to the props (`role?: ReviewerRole`, default `"pharmacist"` in the destructuring, with `import type { ReviewerRole } from "@/lib/review-types";`) and call `SHEET_ROWS(undoSeconds, role)`.

In `web/components/review/ReviewDesk.tsx`:

1. Imports: `import { DESK_NEW, P1C_COPY, STALE_TITLE, fill } from "@/lib/copy";`; `import { NOTE_MIN, approveHint, dismissHint, noteLength, reportHint, sendDismissHint, sendHint, type BarCtx } from "./desk/bar-state";`; `import { clearDraft, dismissDraftKey, loadDraft, loadDraftAt, saveDraft, saveDraftAt } from "./desk/drafts";`.
2. After the `noteError` state add:

```ts
  const [dismissOpen, setDismissOpen] = useState(false);
  const dismissRef = useRef(false);
  const [dismissNote, setDismissNoteText] = useState("");
  const [dismissError, setDismissError] = useState(false);
```

and after `const setReport = …` add `const setDismiss = (v: boolean) => { dismissRef.current = v; setDismissOpen(v); };`.
3. In `barNow()`, after `reportOpen: reportRef.current,` add `dismissOpen: dismissRef.current,`.
4. In `onSaved`, replace the report branch

```ts
    if (fx.channel === "report") {
      clearDraft(batchId, id);
      if (o?.conceptId === id) { setNoteText(""); setNoteError(false); setReport(false); requestFocus("report"); }
      router.refresh();
      return;
    }
```

with

```ts
    if (fx.channel === "report") {
      if (fx.op.decision === "dismiss") {
        // §5.10a on success: draft cleared, panel closed, focus to Looks correct (the Dismiss button is gone), no auto-advance.
        saveDraftAt(dismissDraftKey(batchId, id), "");
        if (o?.conceptId === id) { setDismissNoteText(""); setDismissError(false); setDismiss(false); requestFocus("approve"); }
      } else {
        clearDraft(batchId, id);
        if (o?.conceptId === id) { setNoteText(""); setNoteError(false); setReport(false); requestFocus("report"); }
      }
      router.refresh();
      return;
    }
```

5. In `register()`, after `setNoteText(loadDraft(batchId, reg.conceptId));` add:

```ts
    setDismiss(false);
    setDismissError(false);
    setDismissNoteText(loadDraftAt(dismissDraftKey(batchId, reg.conceptId)));
```

6. Change `newOp`'s `decision` parameter type to `"ok" | "issue" | "dismiss"`.
7. In `keyReport()`, before `setNoteText(loadDraft(batchId, o.conceptId));` add `if (dismissRef.current) setDismiss(false);   // one panel at a time; the dismiss draft stays (§5.7)`.
8. After `sendReport()` add:

```ts
  /** D and the Dismiss issue button (§5.10a). For any role but senior, D does nothing and shows no hint. */
  function keyDismiss() {
    const o = openRef.current;
    if (role !== "senior") return;
    if (dismissRef.current) { requestFocus("dismiss-note"); return; }
    const h = dismissHint(barNow());
    if (h.block || !o) { if (h.text) showHint(h.text); return; }
    if (reportRef.current) setReport(false);   // opening Dismiss closes Report; its draft stays in storage
    setDismissNoteText(loadDraftAt(dismissDraftKey(batchId, o.conceptId)));
    setDismissError(false);
    setDismiss(true);
    requestFocus("dismiss-note");
  }

  function closeDismiss(focusBack: boolean, discard: boolean) {
    const o = openRef.current;
    if (discard && o) { saveDraftAt(dismissDraftKey(batchId, o.conceptId), ""); setDismissNoteText(""); }
    setDismiss(false);
    setDismissError(false);
    if (focusBack) requestFocus("dismiss");
  }

  function setDismissNote(v: string) {
    setDismissNoteText(v);
    const o = openRef.current;
    if (o) saveDraftAt(dismissDraftKey(batchId, o.conceptId), v);
    if (noteLength(v) >= NOTE_MIN) setDismissError(false);
  }

  function sendDismiss() {
    const o = openRef.current;
    if (!o) return;
    const h = sendDismissHint(barNow());
    if (h) { showHint(h); return; }
    if (noteLength(dismissNote) < NOTE_MIN) {
      setDismissError(true);
      announce(P1C_COPY.dismiss.noteError);
      requestFocus("dismiss-note");
      return;
    }
    fire({ type: "SEND_DISMISS", op: newOp(o, "dismiss", dismissNote.trim()), token: tokenState() });
  }
```

9. In `finishReload`, change `requestFocus(reportRef.current ? "note" : "approve");` to `requestFocus(reportRef.current ? "note" : dismissRef.current ? "dismiss-note" : "approve");`.
10. In `onKeyDown`, add `dismissOpen: dismissRef.current,` to the `keyAction` context, and add the cases `case "dismiss": keyDismiss(); break;`, `case "closeDismiss": closeDismiss(true, false); break;`, `case "sendDismiss": sendDismiss(); break;`.
11. In the focus effect, change `: focusReq.key === "note" ? document.getElementById("note")` to `: focusReq.key === "note" || focusReq.key === "dismiss-note" ? document.getElementById(focusReq.key)`.
12. In `api`, add `dismissOpen, dismissNote, dismissError,` after `noteError,`, and after `closeReport, setNote, sendReport,` add `clickDismiss: () => (dismissRef.current ? setDismiss(false) : keyDismiss()), closeDismiss, setDismissNote, sendDismiss,`.
13. Pass the role to the sheet: `<ShortcutsSheet open={sheetOpen} … role={role} … />`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/bar-state.test.ts tests/desk-keymap.test.ts tests/account-menu-drafts.test.tsx tests/desk-keys.test.tsx tests/desk-flow.test.tsx tests/decision-bar.test.tsx tests/decision-bar-states.test.tsx tests/desk-parts.test.tsx tests/desk-settings.test.ts && npx tsc --noEmit -p .`
Expected: PASS (the P1B desk suites stay green: a pharmacist's bar is unchanged), and no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/review/desk/bar-state.ts web/components/review/desk/keys.ts web/components/review/desk/drafts.ts \
  web/components/review/desk/context.ts web/components/review/desk/DecisionBar.tsx web/components/review/desk/ShortcutsSheet.tsx \
  web/components/review/ReviewDesk.tsx web/components/review/desk.module.css web/lib/review-copy.ts \
  "web/app/review/[batchId]/[conceptId]/page.tsx" web/tests/desk-reg.ts web/tests/desk-stub.tsx web/tests/desk-harness.tsx \
  web/tests/desk-keys.test.tsx web/tests/bar-state.test.ts web/tests/desk-keymap.test.ts web/tests/account-menu-drafts.test.tsx
git commit -m "feat(web): Dismiss issue on the desk: D, the panel with the quoted report, report-channel failures (§5.10a, §5.14)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: UI — `SourceLink`, `PairReviewState`, `CodeChip` source, `PairCard` slots (§3.4)

**Files:**
- Create: `web/components/ui/SourceLink.tsx`, `web/components/ui/PairReviewState.tsx`
- Modify: `web/components/ui/CodeChip.tsx`, `web/components/ui/PairCard.tsx`, `web/components/ui/Severity.tsx`, `web/components/ui/index.ts`
- Test: `web/tests/source-link.test.tsx` (create), `web/tests/pair-review-state.test.tsx` (create), `web/tests/pair-card.test.tsx`

**Interfaces:**
- Consumes: Task 13's `P1C_COPY.sources`, `P1C_COPY.pair`, `PAIR_REVIEWED`, `PAIR_NOT_REVIEWED`, `fmtDhakaDate`; Task 14's `Source`, `PairReviewStateName`.
- Produces: `SourceLink({url, label, fetchedAt?})` (nothing without a `url`) and `SourceOf({source})`; `PairReviewState({state, at, mine, note, surface})`, a `<p class="pair-review">`; `CodeChip` prop `source?: Source | null` (the link follows the chip); `PairCard` props `heading?: "h2" | "h3" | "h4" | "h5" | "h6"`, `details?` (after the meta line), `link?` (in the footer, after the source line), `review?` (last); exported `PairText({id, text?, source, sourceOpen?, link?, surface})` for the senior pair row; `SEVERITY_LABEL` exported from `Severity.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/source-link.test.tsx`:

```tsx
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SourceLink, { SourceOf } from "@/components/ui/SourceLink";

describe("SourceLink (§3.4, §5.6.6, §11.1)", () => {
  it("is a plain link that opens in a new tab, with the sr-only notice", () => {
    expect(r(<SourceLink url="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=161" label="RxNav" />)).toBe(
      '<a class="src-link" href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161" target="_blank" rel="noopener noreferrer">'
      + 'RxNav<span class="sr-only"> (opens in a new tab)</span></a>');
  });
  it("adds the Dhaka date only when a fetch time is stored", () => {
    expect(r(<SourceLink url="https://x.test/" label="DDInter 2.0" fetchedAt="2026-10-11T19:00:00Z" />)).toMatch(/<\/a> fetched on 12\/10\/2026$/);
    expect(r(<SourceLink url="https://x.test/" label="DDInter 2.0" fetchedAt={null} />)).not.toContain("fetched on");
  });
  it("renders nothing without a URL, and never a button", () => {
    expect(r(<SourceLink url={null} label="RxNav" fetchedAt="2026-10-11T19:00:00Z" />)).toBe("");
    expect(r(<SourceOf source={null} />)).toBe("");
    expect(r(<SourceOf source={{ url: "https://x.test/", label: "x", fetchedAt: null }} />)).not.toMatch(/btn|<button/);
  });
});
```

Create `web/tests/pair-review-state.test.tsx`:

```tsx
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PairReviewState from "@/components/ui/PairReviewState";

const AT = "2026-10-15T03:00:00Z";   // 09:00 Dhaka, 15/10/2026
const line = (html: string) => html.replace(/^<p class="pair-review">|<\/p>$/g, "");

describe("PairReviewState (§3.4, §5.17)", () => {
  it("reviewer: the four states as plain text, with (you) and the issue note", () => {
    expect(r(<PairReviewState state="not_reviewed" at={null} mine={false} note={null} surface="reviewer" />))
      .toBe('<p class="pair-review">Pair not yet reviewed by a senior pharmacist</p>');
    expect(line(r(<PairReviewState state="reviewed" at={AT} mine={false} note={null} surface="reviewer" />)))
      .toBe("Pair reviewed by a senior pharmacist on 15/10/2026");
    expect(line(r(<PairReviewState state="reviewed" at={AT} mine note={null} surface="reviewer" />)))
      .toBe("Pair reviewed by a senior pharmacist on 15/10/2026 (you)");
    expect(line(r(<PairReviewState state="changed" at={AT} mine={false} note={null} surface="reviewer" />)))
      .toBe("Pair changed in DDInter after a senior pharmacist reviewed it on 15/10/2026.");
    expect(line(r(<PairReviewState state="issue" at={AT} mine={false} note="text contradicts the severity" surface="reviewer" />)))
      .toBe('Pair issue reported by a senior pharmacist on 15/10/2026. Note: <span class="raw">text contradicts the severity</span>');
    expect(line(r(<PairReviewState state="issue" at={AT} mine note="x y z w v" surface="reviewer" />)))
      .toContain("on 15/10/2026 (you). Note:");
  });
  it("public: only reviewed and not reviewed; changed and issue read not reviewed, and never (you) or a note (D53)", () => {
    expect(line(r(<PairReviewState state="reviewed" at={AT} mine note={null} surface="public" />))).toBe("Pair reviewed by a senior pharmacist on 15/10/2026");
    for (const state of ["changed", "issue", "not_reviewed"] as const)
      expect(line(r(<PairReviewState state={state} at={AT} mine note="secret" surface="public" />))).toBe("Pair not yet reviewed by a senior pharmacist");
  });
  it("never green, a pill, a seal or a chip (mark exclusivity)", () => {
    for (const state of ["not_reviewed", "reviewed", "changed", "issue"] as const)
      expect(r(<PairReviewState state={state} at={AT} mine={false} note="n" surface="reviewer" />)).not.toMatch(/rv--|rv |sev|seal|ok|chip/);
  });
});
```

Append to `web/tests/pair-card.test.tsx`, inside the `describe`:

```tsx
  it("P1C: heading level, details after the meta, the pair link after the source line, and the review state last", () => {
    const html = r(<PairCard id="p4" severity="major" names="Warfarin + Ibuprofen" heading="h5" meta="From DDInter 2.0."
      details={<details><summary>All 2 medicines</summary></details>}
      text={{ kind: "management", body: "Avoid." }} source="Management, truncated."
      link={<a className="src-link" href="https://ddinter2.scbdd.com/server/interact/3039/">Full record in DDInter 2.0</a>}
      review={<p className="pair-review">state</p>} surface="reviewer" />);
    expect(html).toContain('<h5 class="pair-names">Warfarin + Ibuprofen</h5>');
    expect(html.indexOf("pair-meta")).toBeLessThan(html.indexOf("<details>"));
    expect(html.indexOf("<details>")).toBeLessThan(html.indexOf("pair-text"));
    expect(html).toContain('<p class="pair-source">Management, truncated. <a class="src-link"');
    expect(html.indexOf("pair-review")).toBeGreaterThan(html.indexOf("pair-source"));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/source-link.test.tsx tests/pair-review-state.test.tsx tests/pair-card.test.tsx`
Expected: FAIL — the two components do not exist and `PairCard` has no `details`, `link` or `review`.

- [ ] **Step 3: Implement**

Create `web/components/ui/SourceLink.tsx`:

```tsx
import { P1C_COPY, fill } from "@/lib/copy";
import { fmtDhakaDate } from "@/lib/format";
import type { Source } from "@/lib/review-types";

/**
 * §3.4 SourceLink: a plain link to the source page the API built (SourceLinks.java; the web never builds a source URL),
 * opening in a new tab, then " fetched on {DD/MM/YYYY}" (Dhaka) when a fetch time is stored. Nothing without a URL.
 */
export default function SourceLink({ url, label, fetchedAt }: { url: string | null | undefined; label: string; fetchedAt?: string | null }) {
  if (!url) return null;
  const s = P1C_COPY.sources;
  return (
    <>
      <a className="src-link" href={url} target="_blank" rel="noopener noreferrer">{label}<span className="sr-only">{s.newTab}</span></a>
      {fetchedAt ? fill(s.fetchedOn, { date: fmtDhakaDate(fetchedAt) }) : null}
    </>
  );
}

/** The API's `source` field, or nothing (a code that failed its system's pattern has no link, §5.6.6). */
export function SourceOf({ source }: { source: Source | null | undefined }) {
  return source ? <SourceLink url={source.url} label={source.label} fetchedAt={source.fetchedAt} /> : null;
}
```

Create `web/components/ui/PairReviewState.tsx`:

```tsx
import { P1C_COPY, PAIR_NOT_REVIEWED, PAIR_REVIEWED, fill } from "@/lib/copy";
import { fmtDhakaDate } from "@/lib/format";
import type { PairReviewStateName } from "@/lib/review-types";

/**
 * §3.4, §5.17: a pair's senior-review state as one plain-text line. A senior's review of a pair is not a pharmacist's
 * approval of a record, so it is never green, never a pill, never a chip. Public shows `reviewed` and `not_reviewed`
 * only (D53); `changed` and `issue` read as not reviewed there, with no note.
 */
export default function PairReviewState({ state, at, mine, note, surface }: {
  state: PairReviewStateName; at: string | null; mine: boolean; note: string | null; surface: "reviewer" | "public";
}) {
  const p = P1C_COPY.pair;
  const date = at ? fmtDhakaDate(at) : "";
  const you = surface === "reviewer" && mine ? p.you : "";
  if (state === "reviewed" && at) return <p className="pair-review">{`${fill(PAIR_REVIEWED, { date })}${you}`}</p>;
  if (surface === "reviewer" && state === "changed" && at) return <p className="pair-review">{fill(p.changed, { date })}</p>;
  if (surface === "reviewer" && state === "issue" && at)
    return <p className="pair-review">{fill(p.issue, { date, you })}{note ? <> <span className="raw">{note}</span></> : null}</p>;
  return <p className="pair-review">{PAIR_NOT_REVIEWED}</p>;
}
```

Replace `web/components/ui/CodeChip.tsx` with:

```tsx
import type { Source } from "@/lib/review-types";
import { SourceOf } from "./SourceLink";

const SYSTEM: Record<string, string> = { ICD11_XM: "ICD-11", RXCUI: "RxCUI", ATC: "ATC", DRUGBANK: "DrugBank",
  SNOMEDCT: "SNOMED CT", DDINTER: "DDInter" };
export type CodeMeta = { method: string; confidence: number; route?: string };
const conf = (c: number) => (Number.isInteger(c) ? c.toFixed(1) : String(c));

/**
 * §3.4 CodeChip. Reviewer screens pass `meta`; public pages show the method in the codes table instead. *(P1C)* `source`
 * comes from the API only (§5.6.6); its SourceLink follows the chip.
 */
export default function CodeChip({ system, code, meta, source }: { system: string; code: string; meta?: CodeMeta; source?: Source | null }) {
  const chip = (
    <span className="code">
      <span className="code-sys">{SYSTEM[system] ?? system}</span>{code}
      {meta && <span className="code-meta">{[meta.method, conf(meta.confidence), meta.route].filter(Boolean).join(", ")}</span>}
    </span>
  );
  return source ? <>{chip} <SourceOf source={source} /></> : chip;
}
```

Replace `web/components/ui/PairCard.tsx` with:

```tsx
import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import Severity from "./Severity";
import styles from "./PairCard.module.css";

export type PairHeading = "h2" | "h3" | "h4" | "h5" | "h6";
type Text = { kind: "management" | "interaction"; body: string };

/**
 * §3.4 PairCard. DDInter text is passed through as given (truncated by CSS, never rewritten). The server renders it
 * unclamped; the Expander island clamps it once JavaScript runs and offers the toggle. With `sourceOpen`, the footer
 * reads `source` while clamped and `sourceOpen` while open (Board R's "…, truncated." / "…, in full."). *(P1C)* `details`
 * follows the meta line, `link` (the DDInter pair SourceLink) follows the source line, and `review` (PairReviewState) is last.
 */
export default function PairCard({ id, severity, names, meta, details, text, source, sourceOpen, link, review, surface, heading }: {
  id: string; severity: string; names: string; meta?: ReactNode; details?: ReactNode; text?: Text; source: ReactNode;
  sourceOpen?: ReactNode; link?: ReactNode; review?: ReactNode; surface: "reviewer" | "public"; heading?: PairHeading;
}) {
  const H = heading;
  return (
    <article className="pair">
      <div className="pair-head">
        <Severity level={severity} />
        {H ? <H className="pair-names">{names}</H> : <span className="pair-names">{names}</span>}
      </div>
      {meta && <p className="pair-meta">{meta}</p>}
      {details}
      <PairText id={id} text={text} source={source} sourceOpen={sourceOpen} link={link} surface={surface} />
      {review}
    </article>
  );
}

/** The text block and its footer, shared by PairCard and the senior pair row (§5.17.2 item 4). */
export function PairText({ id, text, source, sourceOpen, link, surface }: {
  id: string; text?: Text; source: ReactNode; sourceOpen?: ReactNode; link?: ReactNode; surface: "reviewer" | "public";
}) {
  const textId = `${id}-text`;
  return (
    <>
      {text && <p className={`pair-text ${styles.open}`} id={textId}>{text.body}</p>}
      <p className="pair-source">
        {text && sourceOpen !== undefined
          ? <><span className={styles.whenClosed}>{source}</span><span className={styles.whenOpen}>{sourceOpen}</span></>
          : source}
        {link && <> {link}</>}
        {text && <> <Expander targetId={textId} label={surface} /></>}
      </p>
    </>
  );
}
```

In `web/components/ui/Severity.tsx`, rename `const LABEL` to `export const SEVERITY_LABEL` (and its one use).

In `web/components/ui/index.ts` append:

```ts
export { default as SourceLink, SourceOf } from "./SourceLink";
export { default as PairReviewState } from "./PairReviewState";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/source-link.test.tsx tests/pair-review-state.test.tsx tests/pair-card.test.tsx tests/ui-marks.test.tsx tests/marks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/ui/SourceLink.tsx web/components/ui/PairReviewState.tsx web/components/ui/CodeChip.tsx web/components/ui/PairCard.tsx \
  web/components/ui/Severity.tsx web/components/ui/index.ts web/tests/source-link.test.tsx web/tests/pair-review-state.test.tsx web/tests/pair-card.test.tsx
git commit -m "feat(web): SourceLink, PairReviewState, CodeChip source and PairCard slots (§3.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: "With other medicines" — in this batch and in other batches, and the combination fix (§5.6.1, §5.6.2)

**Files:**
- Modify: `web/components/review/detail/Interactions.tsx`, `web/components/review/detail/detail.module.css`
- Modify: `web/app/review/[batchId]/[conceptId]/page.tsx`
- Test: `web/tests/review-interactions.test.tsx`

**Interfaces:**
- Consumes: Task 14's `OtherPairs`, `OtherPair`, `OtherNotChecked`, `OtherPartner`, `BatchPair.source/pairReview`, `ReviewerRole`; Task 17's `PairCard` slots, `PairReviewState`, `SourceOf`; Task 13's `P1C_COPY.other`, `FROM_DDINTER`.
- Produces: `Interactions({ item, role? })`. The section shows when at least one ingredient has a chosen entry; it is `<h3>` "With other medicines" with `<h4>` "In batch {batchId}" and `<h4>` "In other batches"; other-batch subgroups are `<h5>`; pair cards are `<h5>` in the batch group and `<h6>` in the subgroups. Pair card ids are `pair-{a}-{b}` (batch) and `other-{a|n}-{a}-{b}` (other batches), so one pair in both subgroups never repeats an id.

- [ ] **Step 1: Write the failing tests**

In `web/tests/review-interactions.test.tsx`:

1. Change the type import to `import type { BatchPairs, IngredientSummary, OtherPair, OtherPairs, OtherPartner, ReviewItem } from "@/lib/review-types";`.
2. In `"no data: the hatch block …"`, change `expect(html).not.toContain("With the other medicines in this batch");` to `expect(html).not.toContain("With other medicines");`.
3. In `"summary and chips"`, replace `expect(text).toContain("With the other medicines in this batch");` with

```ts
    expect(html).toContain('<h3 class="withH">With other medicines</h3>');
    expect(html).toContain('<h4 class="subH">In batch 0001-pilot</h4>');
```

4. In `"pairs with text are cards …"`, replace the first two expectations and the ordering line with

```ts
    expect(html).toContain('<h5 class="pair-names">Warfarin + Acetylsalicylic acid</h5>');
    expect(html).toContain('<p class="pair-meta">From DDInter 2.0. With Aspirin (record 2). Action in DDInter: synergy. <span class="mono">DDInter1951/DDInter20</span></p>');
```

and

```ts
    expect(html.indexOf("Acetylsalicylic acid</h5>")).toBeLessThan(html.indexOf("Clarithromycin</h5>"));
```

5. Append:

```tsx
describe("P1C: the combination fix (§5.6.2)", () => {
  it("one no-data ingredient no longer hides the other ingredient's pairs; its own pairs are not checked", () => {
    const base = pilotItem("amoxycillin");
    const [clav, amox] = base.ingredients;
    const g = (n: string, i: number) => ({ conceptId: n, tradeName: n, index: i });
    const item = pilotItem("amoxycillin", {
      ingredients: [{ ...clav, coverage: { coverage: "none", note: "" }, ddinter: { chosen: [], entries: [] } }, amox],
      batchPairs: { totalBatchPairs: 28,
        pairs: [{ ddinterA: "DDInter1951", ddinterB: "DDInter83", nameA: "Warfarin", nameB: "Amoxicillin", substance: "Amoxicillin",
          partnerSubstance: "Warfarin", severity: "moderate", actions: ["synergy"], interaction: "May increase the INR.",
          management: "Monitor the INR.", partners: [g("G Warfarin", 6)] }],
        notChecked: [{ substance: "Clavulanic acid", partnerSubstance: "Warfarin", partners: [g("G Warfarin", 6)], reason: "no_data",
          side: "this", route: "systemic" }] } });
    const html = r(<Interactions item={item} />);
    expect(html).toContain('<h3 class="withH">With other medicines</h3>');
    expect(html).toContain('<h5 class="pair-names">Amoxicillin + Warfarin</h5>');
    expect(strip(html)).toContain(`Not checked. Clavulanic acid: ${NO_DATA_SENTENCE}`);
    expect(html).toContain('<span class="sev sev--nodata">Clavulanic acid + Warfarin</span>');
  });
});

describe("P1C: every pair card says it is from DDInter and shows its senior-review state (§5.6.2)", () => {
  const card = (over: Partial<BatchPairs["pairs"][number]>) => pilotItem("g-warfarin", { batchPairs: { totalBatchPairs: 28, notChecked: [],
    pairs: [{ ddinterA: "DDInter1951", ddinterB: "DDInter20", nameA: "Warfarin", nameB: "Acetylsalicylic acid", substance: "Warfarin",
      partnerSubstance: "Acetylsalicylic acid", severity: "major", actions: ["synergy"], interaction: "May increase bleeding.",
      management: "Avoid the combination.", partners: [{ conceptId: "a", tradeName: "Aspirin", index: 2 }], ...over }] } });

  it("the pair link follows the source line and the state line is last; never green", () => {
    const html = r(<Interactions item={card({
      source: { url: "https://ddinter2.scbdd.com/server/interact/3039/", label: "Full record in DDInter 2.0", fetchedAt: null },
      pairReview: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: false, note: null } })} />);
    expect(html).toContain('Management, truncated.</span><span class="whenOpen">Management, in full.</span> <a class="src-link" href="https://ddinter2.scbdd.com/server/interact/3039/" target="_blank" rel="noopener noreferrer">Full record in DDInter 2.0<span class="sr-only"> (opens in a new tab)</span></a>');
    expect(html).toContain('<p class="pair-review">Pair reviewed by a senior pharmacist on 15/10/2026</p></article>');
    expect(html).not.toMatch(/rv--approved/);
  });

  it("an open pair issue shows its note to every reviewer; the pair, its severity and its text stay (G3)", () => {
    const html = r(<Interactions item={card({ pairReview: { state: "issue", at: "2026-10-15T03:00:00Z", mine: false, note: "severity looks low" } })} />);
    expect(strip(html)).toContain("Pair issue reported by a senior pharmacist on 15/10/2026. Note: severity looks low");
    expect(html).toContain('<span class="sev sev--major">Major</span>');
    expect(html).toContain("Avoid the combination.");
  });
});

describe("P1C: In other batches (§5.6.2)", () => {
  const partner = (n: number, approved: boolean): OtherPartner => ({ conceptId: `c${n}`, tradeName: `Brand ${n}`, batchId: `b-${n}`, approved });
  const other = (approved: boolean, count: number, over: Partial<OtherPair> = {}): OtherPair => ({
    ddinterA: "DDInter14", ddinterB: "DDInter926", nameA: "Acetaminophen", nameB: "Ibuprofen", substance: "Acetaminophen",
    partnerSubstance: "Ibuprofen", partnerBdsId: "BDS-000012", severity: "moderate", actions: ["synergy"],
    interaction: "May increase the risk of bleeding.", management: null, source: null,
    pairReview: { state: "not_reviewed", at: null, mine: false, note: null },
    partners: Array.from({ length: Math.min(count, 5) }, (_, i) => partner(i + 1, approved)), partnerCount: count, ...over });
  const napa = (otherPairs: OtherPairs) => pilotItem("napa", { otherPairs });

  it("two subgroups by the partner's status, each with its summary and chips", () => {
    const html = r(<Interactions item={napa({ otherBatches: 2, notChecked: [], pairs: [other(true, 1), other(false, 2, { severity: "minor" })] })} />);
    expect(html).toContain('<h4 class="subH">In other batches</h4>');
    expect(html).toContain('<h5 class="subH">With approved medicines</h5>');
    expect(html).toContain('<h5 class="subH">With medicines not yet approved</h5>');
    expect(html.match(/aria-label="Pairs with other batches by severity"/g)).toHaveLength(2);
    expect(html).toContain('<h6 class="pair-names">Acetaminophen + Ibuprofen</h6>');
    expect(html).toContain('id="other-a-DDInter14-DDInter926-text"');
    expect(html).toContain('id="other-n-DDInter14-DDInter926-text"');
    expect(strip(html)).not.toContain("None of the");
  });

  it("partner lines show three, then 'and {k} more'; the details list the five returned and say '{s} of {n} medicines'", () => {
    const html = r(<Interactions item={napa({ otherBatches: 7, notChecked: [], pairs: [other(true, 7)] })} />);
    expect(strip(html)).toContain("With Brand 1 (batch b-1), Brand 2 (batch b-2), Brand 3 (batch b-3) and 4 more. ");
    expect(html).toContain("<summary>5 of 7 medicines</summary>");
    for (let n = 1; n <= 5; n++) expect(html).toContain(`<a href="/review/b-${n}/c${n}">Brand ${n} (batch <span class="mono">b-${n}</span>)</a>`);
    expect(strip(html)).toContain("and 2 more.");
    expect(html).not.toContain("See every brand");
    const senior = r(<Interactions item={napa({ otherBatches: 7, notChecked: [], pairs: [other(true, 7)] })} role="senior" />);
    expect(senior).toContain('<a href="/review/substances/BDS-000012">See every brand of Ibuprofen</a>');
    for (const role of ["pharmacist", "engineer"] as const)
      expect(r(<Interactions item={napa({ otherBatches: 7, notChecked: [], pairs: [other(true, 7)] })} role={role} />)).not.toContain("See every brand");
    expect(r(<Interactions item={napa({ otherBatches: 1, notChecked: [], pairs: [other(false, 2)] })} />)).toContain("<summary>All 2 medicines</summary>");
  });

  it("no partners in other batches: no no-interaction claim (Review Focus 2)", () => {
    const html = strip(r(<Interactions item={napa({ otherBatches: 0, pairs: [], notChecked: [] })} />));
    expect(html).toContain("There are no other batches yet.");
    expect(html).not.toContain("DDInter 2.0 lists no interaction between");
  });

  it("other batches exist and every pair with them was checked: the no-interaction line with its caveat", () => {
    expect(strip(r(<Interactions item={napa({ otherBatches: 2, pairs: [], notChecked: [] })} />))).toContain(
      "DDInter 2.0 lists no interaction between Napa and the medicines in other batches. This is not a guarantee that they are safe to combine.");
  });

  it("a no-data substance names its pairs with other batches on a second line, each pair once", () => {
    const nc = (approved: boolean) => ({ substance: "Domperidone", partnerSubstance: "Ibuprofen", partnerBdsId: "BDS-000012",
      partners: [partner(1, approved)], partnerCount: 1, reason: "no_data" as const, side: "this" as const, route: "systemic" });
    const item = pilotItem("domperidone", { otherPairs: { otherBatches: 1, pairs: [], notChecked: [nc(true), nc(false)] } });
    const html = r(<Interactions item={item} />);
    expect(strip(html)).toContain("Not checked, 1 pair with medicines in other batches:");
    expect(html.match(/<span class="sev sev--nodata">Domperidone \+ Ibuprofen<\/span>/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/review-interactions.test.tsx`
Expected: FAIL — the old section title, the no-data rule that hides a combination product's pairs, and no other-batch groups.

- [ ] **Step 3: Implement**

In `web/components/review/detail/detail.module.css` append:

```css
/* §5.6.2 (P1C): the "With other medicines" heading and the partner list under a cross-batch pair. */
.withH { font: 600 15px/1.3 var(--font-ui); letter-spacing: -.008em; }
.partners { font-size: 13px; color: var(--fg-2); }
.partners ul { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
```

Replace `web/components/review/detail/Interactions.tsx` with:

```tsx
import { Fragment, type ReactNode } from "react";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import PairCard, { type PairHeading } from "@/components/ui/PairCard";
import PairReviewState from "@/components/ui/PairReviewState";
import Severity from "@/components/ui/Severity";
import { SourceOf } from "@/components/ui/SourceLink";
import { DESK_NEW, FROM_DDINTER, NO_DATA_SENTENCE, NOT_RUN, P1C_COPY, fill } from "@/lib/copy";
import { strengthText } from "@/lib/relations";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import type {
  BatchPair, IngredientSummary, NotCheckedPair, OtherNotChecked, OtherPair, OtherPartner, ReviewItem, ReviewerRole,
} from "@/lib/review-types";
import { SEVERITIES, severityOf } from "@/lib/severity";
import { recordHref } from "../desk/hrefs";
import s from "./detail.module.css";

const mono = (t: ReactNode) => <span className="mono">{t}</span>;
const ra = DESK_NEW.routeAware;
const o = P1C_COPY.other;
const pairWord = (n: number) => plural(n, "pair", "pairs");
type AnyPair = BatchPair | OtherPair;

/** "Chloramphenicol (ophthalmic)" names the route already; the statement adds it once (§5.6.4). */
const baseName = (name: string | null, id: string, route: string) =>
  (name ?? id).replace(new RegExp(` \\(${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), "");

function Statements({ item, route }: { item: ReviewItem; route: string | null }) {
  const lines: ReactNode[] = [];
  for (const g of item.ingredients)
    for (const c of g.ddinter.chosen) {
      if (c.routeAssumed) {
        lines.push(route === null
          ? fillNodes(DESK_NEW.routeAssumed.noRouteStatement, { id: mono(c.ddinterId) })
          : fillNodes(ra.assumedStatement, { route, substance: g.name, id: mono(c.ddinterId) }));
      } else if (route !== "systemic") {
        lines.push(fillNodes(ra.checkedAgainst, { substance: g.name, id: mono(c.ddinterId),
          ddinterName: baseName(c.name, c.ddinterId, c.routeScope), route: c.routeScope }));
      }
    }
  return <>{lines.map((l, i) => <p className={s.ingP} key={i}>{l}</p>)}</>;
}

function chips(counts: Record<"major" | "moderate" | "minor" | "unknown", number>, label: string) {
  return (
    <div className={s.chipRow} role="group" aria-label={label}>
      {SEVERITIES.map((sev) => <Severity key={sev} level={sev} count={counts[sev]} />)}
    </div>
  );
}

function Ingredient({ g, item, route, brand }: { g: IngredientSummary; item: ReviewItem; route: string | null; brand: string }) {
  const head = <div className={s.ingH}><h3>{g.name}</h3>{g.bdsId && <span className="mono">{g.bdsId}</span>}<span>{strengthText(g)}</span></div>;
  let body: ReactNode;
  if (g.bdsId === null) {
    body = <p className={s.ingP}>{fill(ra.notCheckedUnmapped, { ingredient: g.name, brand })}</p>;
  } else if (g.coverage.coverage === "none") {
    const nc = item.batchPairs.notChecked.filter((n) => n.reason === "no_data" && n.side === "this" && n.substance === g.name);
    // §5.6.1 (P1C): the pairs with other batches follow on their own line; a pair split by partner status is listed once.
    const other = [...new Set(item.otherPairs.notChecked
      .filter((n) => n.reason === "no_data" && n.side === "this" && n.substance === g.name).map((n) => n.partnerSubstance))];
    body = <NoDataBlock title={g.name} extra={<>
      <p className="nodata-text">{DESK.noDataLine}</p>
      <div className="nodata-pairs"><span>{fill(DESK.notCheckedWithBatch, { k: nc.length })}</span>
        {nc.map((n) => <NoDataChip key={n.partnerSubstance} label={`${n.substance} + ${n.partnerSubstance}`} />)}</div>
      {other.length > 0 && (
        <div className="nodata-pairs"><span>{fill(o.noDataOther, { j: other.length, pairs: pairWord(other.length) })}</span>
          {other.map((p) => <NoDataChip key={p} label={`${g.name} + ${p}`} />)}</div>
      )}
    </>} />;
  } else if (g.coverage.coverage === "not_run") {
    body = <p className={s.ingP}>{NOT_RUN}</p>;
  } else if (g.ddinter.chosen.length === 0) {
    body = <p className={s.ingP}>{route === null ? ra.noRouteEntryNoRoute : fill(ra.noRouteEntry, { route })}</p>;
  } else {
    const chosen = g.ddinter.entries.filter((e) => g.ddinter.chosen.some((c) => c.ddinterId === e.ddinterId));
    const sum = (f: (e: (typeof chosen)[number]) => number) => chosen.reduce((t, e) => t + f(e), 0);
    const counts = { major: sum((e) => e.counts.major), moderate: sum((e) => e.counts.moderate), minor: sum((e) => e.counts.minor),
      unknown: sum((e) => e.counts.unknown) };
    const d = sum((e) => e.diseaseCount), f = sum((e) => e.foodCount);
    const assumed = g.ddinter.chosen.some((c) => c.routeAssumed);
    // §5.6.6: each chosen entry id carries its DDInter link.
    const linkOf = (id: string) => g.ddinter.entries.find((e) => e.ddinterId === id)?.source ?? null;
    const ids = g.ddinter.chosen.map((c, i) => (
      <Fragment key={c.ddinterId}>{i > 0 && ", "}{mono(`${c.ddinterId} (${c.routeScope})`)}{linkOf(c.ddinterId) && <> <SourceOf source={linkOf(c.ddinterId)} /></>}</Fragment>
    ));
    body = <>
      <p className={s.ingP}>{route === null ? fillNodes(ra.dataFoundNoRoute, { ids })
        : <>{fillNodes(ra.dataFound, { route, ids })}{assumed && ra.routeAssumedSuffix}</>}</p>
      {chips(counts, DESK.severityGroup)}
      <p className={s.ingQ}>{fill(DESK.totals, { total: sum((e) => e.counts.total), d, dWord: plural(d, "interaction", "interactions"),
        f, fWord: plural(f, "interaction", "interactions") })}</p>
      {g.ddinter.entries.length > g.ddinter.chosen.length && (
        <p className={s.ingQ}>{fillNodes(ra.allEntries, { name: g.name,
          ids: g.ddinter.entries.map((e, i) => <span key={e.ddinterId}>{i > 0 && ", "}{mono(e.ddinterId)} ({e.routeScope})</span>),
          total: g.ddinter.entries.reduce((t, e) => t + e.counts.total, 0) })}</p>
      )}
    </>;
  }
  return <div className={s.ing}>{head}{body}</div>;
}

// ---- partners: "{name} (record {k})" in this batch; "{name} (batch b)", three then "and {k} more", in other batches

const recordsOf = (p: { partners: { tradeName: string; index: number }[] }): ReactNode =>
  p.partners.map((x) => fill(DESK.record, { name: x.tradeName, k: x.index })).join(", ");
const ref = (x: OtherPartner) => fillNodes(o.partnerRef, { name: x.tradeName, batchId: mono(x.batchId) });
const refText = (x: OtherPartner) => fill(o.partnerRef, { name: x.tradeName, batchId: x.batchId });

function inlinePartners(partners: OtherPartner[], count: number): ReactNode {
  const shown = partners.slice(0, 3);
  return (
    <>
      {shown.map((x, i) => <Fragment key={`${x.batchId}/${x.conceptId}`}>{i > 0 && ", "}{ref(x)}</Fragment>)}
      {count > shown.length && <> {fill(o.andMoreInline, { k: count - shown.length })}</>}
    </>
  );
}

/** §5.6.2: the partners the API returned (at most 5), with "and {k} more." and, for a senior, the substance page. */
function PartnerList({ partners, count, substance, bdsId, senior }:
    { partners: OtherPartner[]; count: number; substance: string; bdsId: string | null; senior: boolean }) {
  return (
    <details className={s.partners}>
      <summary>{count <= 5 ? fill(o.detailsAll, { n: count }) : fill(o.detailsSome, { s: partners.length, n: count })}</summary>
      <ul>
        {partners.map((x) => <li key={`${x.batchId}/${x.conceptId}`}><a href={recordHref(x.batchId, x.conceptId)}>{ref(x)}</a></li>)}
        {count > partners.length && (
          <li>{fill(o.andMoreList, { k: count - partners.length })}
            {senior && bdsId && <> <a href={`/review/substances/${encodeURIComponent(bdsId)}`}>{fill(o.seeEveryBrand, { substance })}</a></>}</li>
        )}
      </ul>
    </details>
  );
}

// ---- the parts every group shares

function Card({ p, id, heading, partners, details }: { p: AnyPair; id: string; heading: PairHeading; partners: ReactNode; details?: ReactNode }) {
  const management = p.management !== null;
  const kind = management ? "management" : "interaction";
  const suffix = management ? "" : DESK.noManagementForPair;
  return (
    <PairCard id={id} severity={p.severity} names={`${p.substance} + ${p.partnerSubstance}`} heading={heading}
      meta={<>{FROM_DDINTER}. {fillNodes(DESK.pairWith, { partners })}{p.actions.length > 0 && fill(DESK.actionIn, { actions: p.actions.join(", ") })}
        {mono(`${p.ddinterA}/${p.ddinterB}`)}</>}
      details={details}
      text={{ kind, body: (p.management ?? p.interaction)! }}
      source={`${management ? DESK.managementTruncated : DESK.interactionTruncated}${suffix}`}
      sourceOpen={`${management ? DESK.managementFull : DESK.interactionFull}${suffix}`}
      link={p.source ? <SourceOf source={p.source} /> : undefined}
      review={p.pairReview ? <PairReviewState {...p.pairReview} surface="reviewer" /> : undefined} surface="reviewer" />
  );
}

function NoText<P extends AnyPair>({ pairs, withOf, detailsOf }: { pairs: P[]; withOf: (p: P) => ReactNode; detailsOf?: (p: P) => ReactNode }) {
  const groups = SEVERITIES.map((sev) => [sev, pairs.filter((p) => severityOf(p.severity) === sev)] as const).filter(([, g]) => g.length > 0);
  const actions = [...new Set(pairs.flatMap((p) => p.actions))];
  const n = pairs.length;
  return (
    <div className={s.ntx}>
      <p className={s.subH}>{fill(DESK.noTextHeading, { k: n, pairs: pairWord(n) })}</p>
      {groups.map(([sev, g]) => (
        <div className={s.ntxG} key={sev}>
          <Severity level={sev} count={g.length} />
          <ul className={s.ntxList}>{g.map((p) => (
            <li key={`${p.ddinterA}/${p.ddinterB}`}><b>{p.substance} + {p.partnerSubstance}</b>{" "}
              <span className={s.ntxWith}>{fillNodes(DESK.noTextWith, { records: withOf(p) })}</span> {mono(`${p.ddinterA}/${p.ddinterB}`)}
              {p.source && <> <SourceOf source={p.source} /></>}
              {detailsOf?.(p)}
              {p.pairReview && <PairReviewState {...p.pairReview} surface="reviewer" />}</li>
          ))}</ul>
        </div>
      ))}
      <p className={s.ingQ}>{fill(DESK.noTextClosing, { actions: actions.length ? fill(DESK.actionIn, { actions: actions.join(", ") }) : "",
        this: n === 1 ? "this pair" : "these pairs" })}{groups.some(([sev]) => sev === "unknown") && DESK.noTextUnknown}</p>
    </div>
  );
}

type Line = { substance: string; partnerSubstance: string; reason: string; side: "this" | "partner"; route: string | null };
function reasonLine(n: Line, brand: string, substance: string): string {
  return n.reason === "no_route"
    ? (n.route === null ? fill(ra.notCheckedNoRouteNoRoute, { brand, substance }) : fill(ra.notCheckedNoRoute, { brand, route: n.route, substance }))
    : n.reason === "unmapped" ? fill(ra.notCheckedUnmapped, { ingredient: substance, brand })
    : fill(DESK_NEW.notRun.notCheckedNotRun, { substance, brand });
}
function otherLines(n: NotCheckedPair, brand: string): string[] {
  const brands = n.side === "this" ? [brand] : n.partners.map((p) => p.tradeName);
  return brands.map((b) => reasonLine(n, b, n.side === "this" ? n.substance : n.partnerSubstance));
}
function crossLines(n: OtherNotChecked, brand: string): string[] {
  if (n.side === "this") return [reasonLine(n, brand, n.substance)];
  const lines = n.partners.map((x) => reasonLine(n, refText(x), n.partnerSubstance));
  return n.partnerCount > n.partners.length ? [...lines, fill(o.andMoreList, { k: n.partnerCount - n.partners.length })] : lines;
}

function NoDataLines({ list }: { list: Line[] }) {
  const names = [...new Set(list.map((n) => (n.side === "this" ? n.substance : n.partnerSubstance)))];
  const labels = [...new Set(list.map((n) => `${n.substance} + ${n.partnerSubstance}`))];
  return (
    <div className={s.nc}>
      <p><b>{DESK.notCheckedLead}</b> {names.join(", ")}: {NO_DATA_SENTENCE}</p>
      <div className={s.chipRow}>{labels.map((l) => <NoDataChip key={l} label={l} />)}</div>
    </div>
  );
}

const severityCounts = (pairs: AnyPair[]) => {
  const counts = { major: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const p of pairs) counts[severityOf(p.severity)]++;
  return counts;
};
const hasText = (p: AnyPair) => p.management !== null || p.interaction !== null;

// ---- "In batch {batchId}" (§5.6.2, as before P1C)

function BatchBlock({ item, brand }: { item: ReviewItem; brand: string }) {
  const { pairs, notChecked, totalBatchPairs } = item.batchPairs;
  const nc = notChecked.filter((n) => n.reason !== "same_product");
  const noData = nc.filter((n) => n.reason === "no_data");
  const others = [...new Set(nc.filter((n) => n.reason !== "no_data").flatMap((n) => otherLines(n, brand)))];
  const same = notChecked.filter((n) => n.reason === "same_product");
  return (
    <div className={s.sec}>
      <h4 className={s.subH}>{fill(o.inBatch, { batchId: item.batchId })}</h4>
      <p className={s.ingQ}>{fill(DESK.batchFound, { p: pairs.length, pairs: pairWord(pairs.length) })}
        {nc.length > 0 && fill(DESK.batchNotChecked, { nc: nc.length, pairs: pairWord(nc.length) })}</p>
      {chips(severityCounts(pairs), DESK.batchChips)}
      {item.ingredients.filter((g) => g.ddinter.chosen.length > 0 && !pairs.some((p) => p.substance === g.name)).map((g) => (
        <p className={s.ingQ} key={g.name}>{fill(DESK.noneInvolve, { n: totalBatchPairs, name: g.name })}</p>
      ))}
      {pairs.some(hasText) && <div className={s.pairs}>{pairs.filter(hasText).map((p) => (
        <Card key={`${p.ddinterA}/${p.ddinterB}`} p={p} id={`pair-${p.ddinterA}-${p.ddinterB}`} heading="h5" partners={recordsOf(p)} />
      ))}</div>}
      {pairs.some((p) => !hasText(p)) && <NoText pairs={pairs.filter((p) => !hasText(p))} withOf={recordsOf} />}
      {noData.length > 0 && <NoDataLines list={noData} />}
      {others.map((line) => <p className={s.ingQ} key={line}>{line}</p>)}
      {same.map((n) => <p className={s.ingQ} key={`${n.substance}+${n.partnerSubstance}`}>{fill(ra.notCheckedSameProduct, { a: n.substance, b: n.partnerSubstance })}</p>)}
    </div>
  );
}

// ---- "In other batches" (§5.6.2 P1C): the latest current item of every product held in another batch

function OtherGroup({ item, brand, approved, senior }: { item: ReviewItem; brand: string; approved: boolean; senior: boolean }) {
  // computeFor groups every entry by partner status, so its partners share one status (§7.3).
  const of = (x: { partners: OtherPartner[] }) => (x.partners[0]?.approved ?? false) === approved;
  const pairs = item.otherPairs.pairs.filter(of);
  const nc = item.otherPairs.notChecked.filter(of);
  if (pairs.length === 0 && nc.length === 0) return null;
  const tag = approved ? "a" : "n";
  const details = (p: OtherPair) => <PartnerList partners={p.partners} count={p.partnerCount} substance={p.partnerSubstance}
    bdsId={p.partnerBdsId} senior={senior} />;
  const noData = nc.filter((n) => n.reason === "no_data");
  const others = [...new Set(nc.filter((n) => n.reason !== "no_data").flatMap((n) => crossLines(n, brand)))];
  return (
    <div className={s.sec}>
      <h5 className={s.subH}>{approved ? o.withApproved : o.withNotApproved}</h5>
      <p className={s.ingQ}>{fill(DESK.batchFound, { p: pairs.length, pairs: pairWord(pairs.length) })}
        {nc.length > 0 && fill(DESK.batchNotChecked, { nc: nc.length, pairs: pairWord(nc.length) })}</p>
      {chips(severityCounts(pairs), o.chips)}
      {pairs.some(hasText) && <div className={s.pairs}>{pairs.filter(hasText).map((p) => (
        <Card key={`${p.ddinterA}/${p.ddinterB}`} p={p} id={`other-${tag}-${p.ddinterA}-${p.ddinterB}`} heading="h6"
          partners={inlinePartners(p.partners, p.partnerCount)} details={details(p)} />
      ))}</div>}
      {pairs.some((p) => !hasText(p)) && (
        <NoText pairs={pairs.filter((p) => !hasText(p))} withOf={(p) => inlinePartners(p.partners, p.partnerCount)} detailsOf={details} />
      )}
      {noData.length > 0 && <NoDataLines list={noData} />}
      {others.map((line) => <p className={s.ingQ} key={line}>{line}</p>)}
    </div>
  );
}

function OtherBlock({ item, brand, senior }: { item: ReviewItem; brand: string; senior: boolean }) {
  const op = item.otherPairs;
  const none = op.pairs.length === 0 && op.notChecked.length === 0;
  return (
    <div className={s.sec}>
      <h4 className={s.subH}>{o.inOther}</h4>
      {/* otherBatches counts only batches that hold a partner (Review Focus 2): 0 never claims "no interaction". */}
      {op.otherBatches === 0 ? <p className={s.ingQ}>{o.noOtherBatches}</p>
        : none ? <p className={s.ingQ}>{fill(o.noneOther, { name: brand })}</p>
        : <>
            <OtherGroup item={item} brand={brand} approved senior={senior} />
            <OtherGroup item={item} brand={brand} approved={false} senior={senior} />
          </>}
    </div>
  );
}

/**
 * §5.6 "Interactions": the chosen-entry statement, one block per ingredient, then "With other medicines" (route-aware,
 * D14). *(P1C)* The section shows when at least one ingredient has a chosen entry: a combination product with one no-data
 * ingredient keeps its other ingredient's pairs (§5.6.2, the Interactions.tsx fix).
 */
export default function Interactions({ item, role }: { item: ReviewItem; role?: ReviewerRole }) {
  const route = item.clinicalDrug?.route ?? null;
  const brand = item.brand?.tradeName ?? item.conceptId;
  const hasData = item.ingredients.some((g) => g.ddinter.chosen.length > 0);
  return (
    <section className={s.sec} aria-labelledby="sec-ix">
      <div className={s.secT}><h2 id="sec-ix">{DESK.interactionsTitle}</h2><span>{DESK.interactionsSub}</span></div>
      <Statements item={item} route={route} />
      {item.ingredients.map((g, i) => <Ingredient key={i} g={g} item={item} route={route} brand={brand} />)}
      {hasData && (
        <div className={s.sec}>
          <h3 className={s.withH}>{o.title}</h3>
          <BatchBlock item={item} brand={brand} />
          <OtherBlock item={item} brand={brand} senior={role === "senior"} />
        </div>
      )}
    </section>
  );
}
```

In `web/app/review/[batchId]/[conceptId]/page.tsx`, change `<Interactions item={item} />` to `<Interactions item={item} role={session.role} />`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/review-interactions.test.tsx tests/record-page.test.tsx tests/p1c-copy.test.ts tests/copy.test.ts tests/marks.test.ts`
Expected: PASS (the copy guards included: every new string comes from `P1C_COPY` or `FROM_DDINTER`).

- [ ] **Step 5: Commit**

```bash
git add web/components/review/detail/Interactions.tsx web/components/review/detail/detail.module.css \
  "web/app/review/[batchId]/[conceptId]/page.tsx" web/tests/review-interactions.test.tsx
git commit -m "feat(web): With other medicines: in this batch and in other batches; a no-data ingredient no longer hides the pairs (§5.6.2)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: The DDInter stage's text-missing notes split by `partnerScope` (§5.5.3)

**Files:**
- Modify: `web/components/review/detail/AutomatedChecks.tsx`, `web/components/review/desk/StagePairs.tsx`
- Test: `web/tests/review-detail.test.tsx`

**Interfaces:**
- Consumes: Task 14's `TextMissingPair.partnerScope`; Task 13's `P1C_COPY.other.textMissingSame`, `textMissingOther`.
- Produces: up to three groups, in the order batch, same product, other; each with its note, its own `StagePairs` toggle (`fk` = `pairs-{scope}`) and list (`stage-pairs-{conceptId}` for the batch group, as before; `stage-pairs-{conceptId}-{scope}` for the others). `StagePairs` gains an optional `fk` prop (default `"pairs"`).

- [ ] **Step 1: Write the failing test**

Append inside `describe("AutomatedChecks (§5.5.3)", …)` in `web/tests/review-detail.test.tsx`:

```tsx
  it("P1C: text-missing pairs split by partnerScope, each group with its own note and list (§5.5.3)", () => {
    const base = pilotItem("amoxycillin");
    const tm = (a: string, b: string, partnerScope: "batch" | "same_product" | "other") =>
      ({ ddinterA: a, nameA: a, ddinterB: b, nameB: b, severity: "unknown", inBatch: partnerScope === "batch", partnerScope });
    const item = { ...base, stages: base.stages.map((st) => (st.stage === "ddinter" ? { ...st, textMissing: [
      tm("DDInter14", "DDInter83", "batch"), tm("DDInter394", "DDInter83", "same_product"),
      tm("DDInter83", "DDInter926", "other"), tm("DDInter83", "DDInter990", "other")] } : st)) };
    const html = r(<AutomatedChecks item={item} />);
    const batch = html.indexOf("DDInter text not found for 1 pair with other medicines in this batch.");
    const same = html.indexOf("DDInter text not found for 1 pair between ingredients of this product.");
    const other = html.indexOf("DDInter text not found for 2 pairs with medicines outside this batch.");
    expect(batch).toBeGreaterThan(-1);
    expect(same).toBeGreaterThan(batch);
    expect(other).toBeGreaterThan(same);
    expect(html.slice(batch, same)).toContain("DDInter14/DDInter83");
    expect(html.slice(batch, same)).not.toContain("DDInter926");
    expect(html.slice(other)).toContain("DDInter83/DDInter990");
    expect(html).toContain(`<ul class="stage-pairs" id="stage-pairs-${base.conceptId}">`);
    expect(html).toContain(`<ul class="stage-pairs" id="stage-pairs-${base.conceptId}-other">`);
  });

  it("P1C: a group with no pairs shows no note", () => {
    const html = r(<AutomatedChecks item={pilotItem("napa")} />);
    expect(html).not.toContain("between ingredients of this product");
    expect(html).not.toContain("with medicines outside this batch");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/review-detail.test.tsx`
Expected: FAIL — every text-missing pair sits under the "in this batch" note.

- [ ] **Step 3: Implement**

In `web/components/review/desk/StagePairs.tsx`, change the signature to `export default function StagePairs({ targetId, count, fk = "pairs" }: { targetId: string; count: number; fk?: string })` and `data-fk="pairs"` to `data-fk={fk}`.

In `web/components/review/detail/AutomatedChecks.tsx`:

1. Imports: `import { Fragment } from "react";`, `import { NO_DATA_SENTENCE, P1C_COPY, fill } from "@/lib/copy";`, and `import { STAGE_KEYS, type PartnerScope, type ReviewItem, type ReviewStage } from "@/lib/review-types";`.
2. Above `function body(…)` add:

```ts
/** §5.5.3 (P1C, PO D6): the notes in this order; the web reads partnerScope only, never inBatch. */
const SCOPES: [PartnerScope, string][] = [
  ["batch", DESK.textMissing], ["same_product", P1C_COPY.other.textMissingSame], ["other", P1C_COPY.other.textMissingOther],
];
```

3. In `body`, replace `const pairs = ddinter ? st.textMissing : [];`, `const listId = …;` and the `{pairs.length > 0 && ( … )}` block with:

```tsx
  const groups = ddinter ? SCOPES.map(([scope, note]) => ({ scope, note, pairs: st.textMissing.filter((p) => p.partnerScope === scope) }))
    .filter((g) => g.pairs.length > 0) : [];
  return (
    <>
      {ddinter && noData && <p className="stage-note">{NO_DATA_SENTENCE}</p>}
      {groups.map(({ scope, note, pairs }) => {
        const listId = scope === "batch" ? `stage-pairs-${item.conceptId}` : `stage-pairs-${item.conceptId}-${scope}`;
        return (
          <Fragment key={scope}>
            <p className="stage-note">{fill(note, { n: pairs.length, pairs: plural(pairs.length, "pair", "pairs") })}</p>
            <StagePairs targetId={listId} count={pairs.length} fk={`pairs-${scope}`} />
            <ul className="stage-pairs" id={listId}>
              {pairs.map((p) => (
                <li className="stage-pair" key={`${p.ddinterA}/${p.ddinterB}`}>
                  {p.nameA} + {p.nameB} <span className="mono">{p.ddinterA}/{p.ddinterB}</span>{p.severity !== null && <Severity level={p.severity} />}
                </li>
              ))}
            </ul>
          </Fragment>
        );
      })}
      {lines.map((n, i) => <p className="stage-note" key={i}>{n.text}</p>)}
    </>
  );
```

(the function's earlier `return (<> … </>)` is replaced by this one; `lines` is computed as before).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/review-detail.test.tsx tests/desk-parts.test.tsx tests/row-hint.test.ts`
Expected: PASS (§5.4's row hint still counts every text-missing pair: it reads the API's `hint.pairsWithoutText`).

- [ ] **Step 5: Commit**

```bash
git add web/components/review/detail/AutomatedChecks.tsx web/components/review/desk/StagePairs.tsx web/tests/review-detail.test.tsx
git commit -m "fix(web): DDInter text-missing notes split by partnerScope: in this batch, between ingredients, outside this batch (§5.5.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Source links on the desk — comparison table, ingredient block, evidence "Sources" (§5.5.2, §5.6.3, §5.6.6)

**Files:**
- Modify: `web/components/review/detail/ComparisonTable.tsx`, `web/components/review/detail/EvidenceContent.tsx`
- Test: `web/tests/review-sources.test.tsx` (create)

**Interfaces:**
- Consumes: Task 14's `Source` fields on `brand`, `codes[]`, `entries[]`; Task 17's `SourceOf`, `CodeChip` `source`; Task 13's `P1C_COPY.sources`, `SHARED_WORDS`.
- Produces: the "DGDA source" header cell carries the brand's link; each "DGDA ingredient code" row links its XM code (the ICD-11 search link of the ingredient's `ICD11_XM` code); every `CodeChip` in "Codes n" and "DDInter mapping n" carries its source; the evidence drawer ends with "Sources" (a `dl` with the rows "DGDA register (OCL)", "RxNav", "WHO ATC/DDD Index", "DrugBank", "ICD-11", "DDInter 2.0", each listing its codes with their links; a row with no link is left out).

- [ ] **Step 1: Write the failing test**

Create `web/tests/review-sources.test.tsx`:

```tsx
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComparisonTable from "@/components/review/detail/ComparisonTable";
import EvidenceContent from "@/components/review/detail/EvidenceContent";
import Interactions from "@/components/review/detail/Interactions";
import type { ReviewItem, Source } from "@/lib/review-types";
import { pilotItem } from "./fixtures/pilot";

/*
 * The API builds every URL (SourceLinks.java, pinned by SourceLinksTest with the same pilot codes). This fixture carries the
 * §5.6.6 links for Napa's codes as the API sends them; the web must render exactly these hrefs and never build one.
 */
const FETCHED = "2026-10-11T19:00:00Z";   // 12/10/2026 in Dhaka
const SRC: Record<string, (c: string) => Source> = {
  RXCUI: (c) => ({ url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${c}`, label: "RxNav", fetchedAt: FETCHED }),
  ATC: (c) => ({ url: `https://atcddd.fhi.no/atc_ddd_index/?code=${c}&showdescription=no`, label: "WHO ATC/DDD Index", fetchedAt: FETCHED }),
  DRUGBANK: (c) => ({ url: `https://go.drugbank.com/drugs/${c}`, label: "DrugBank", fetchedAt: FETCHED }),
  SNOMEDCT: (c) => ({ url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm=${c}`, label: "RxNav (SNOMED CT search)", fetchedAt: FETCHED }),
  ICD11_XM: (c) => ({ url: "https://icd.who.int/browse/latest-release/mms/en", label: `Search ICD-11 for ${c}`, fetchedAt: FETCHED }),
  DDINTER: (c) => ({ url: `https://ddinter2.scbdd.com/server/drug-detail/${c}/`, label: "DDInter 2.0", fetchedAt: FETCHED }),
};
function napaWithSources(): ReviewItem {
  const item = pilotItem("napa");
  return { ...item, brand: { ...item.brand!, source: { url: item.sourceUrl, label: "DGDA register (OCL)", fetchedAt: FETCHED } },
    ingredients: item.ingredients.map((g) => ({ ...g, codes: g.codes.map((c) => ({ ...c, source: SRC[c.system](c.code) })),
      ddinter: { ...g.ddinter, entries: g.ddinter.entries.map((e) => ({ ...e, source: SRC.DDINTER(e.ddinterId) })) } })) };
}
const link = (href: string, label: string) =>
  `<a class="src-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> (opens in a new tab)</span></a>`;

describe("source links on the desk (§5.6.6, §11.2)", () => {
  const item = napaWithSources();

  it("the comparison table: the DGDA register in the header, the XM code's ICD-11 search, every code chip", () => {
    const html = r(<ComparisonTable item={item} />);
    expect(html).toContain(`DGDA source ${link("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/", "DGDA register (OCL)")} fetched on 12/10/2026`);
    expect(html).toContain(`<span class="mono">XM5DJ7</span> ${link("https://icd.who.int/browse/latest-release/mms/en", "Search ICD-11 for XM5DJ7")}`);
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161"');
    expect(html).toContain('href="https://atcddd.fhi.no/atc_ddd_index/?code=N02BE01&amp;showdescription=no"');
    expect(html).toContain('href="https://go.drugbank.com/drugs/DB00316"');
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&amp;searchTerm=387517004"');
    expect(html).toContain(`DDInter14<span class="code-meta">drugbank, 1.0, systemic</span></span> ${link("https://ddinter2.scbdd.com/server/drug-detail/DDInter14/", "DDInter 2.0")} fetched on 12/10/2026`);
  });

  it("the ingredient block: the chosen entry carries its DDInter link", () => {
    expect(r(<Interactions item={item} />)).toContain(
      `<span class="mono">DDInter14 (systemic)</span> ${link("https://ddinter2.scbdd.com/server/drug-detail/DDInter14/", "DDInter 2.0")}`);
  });

  it("the evidence drawer's Sources: one row per source the record uses, with codes and dates", () => {
    const html = r(<EvidenceContent item={item} />);
    expect(html).toContain("<h5>Sources</h5><p class=\"dr-note\">Where each value came from. Links open the source&#x27;s own page.</p>");
    for (const label of ["DGDA register (OCL)", "RxNav", "WHO ATC/DDD Index", "DrugBank", "ICD-11", "DDInter 2.0"])
      expect(html).toContain(`<dt>${label}</dt>`);
    expect(html).toContain(`<span class="mono">161</span> ${link("https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161", "RxNav")} fetched on 12/10/2026`);
  });

  it("without sources from the API nothing links and no Sources section shows (a code that failed its pattern)", () => {
    const plain = pilotItem("napa");
    expect(r(<ComparisonTable item={plain} />)).not.toContain("src-link");
    expect(r(<EvidenceContent item={plain} />)).not.toContain("<h5>Sources</h5>");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/review-sources.test.tsx`
Expected: FAIL — no `src-link` anywhere and no "Sources" section.

- [ ] **Step 3: Implement**

In `web/components/review/detail/ComparisonTable.tsx`:

1. Add `import { SourceOf } from "@/components/ui/SourceLink";`.
2. In `mapping()`, change the `CodeChip` to `<CodeChip key={c.code} system={c.system} code={c.code} meta={meta(c)} source={c.source} />`.
3. Change the header cell to `<th scope="col" className={`cmp-src ${s.srcHead}`}>{DESK.cmpSource}{b?.source && <> <SourceOf source={b.source} /></>}</th>`.
4. In the `item.dgdaIngredients.map(…)` row, compute the XM code's link and put it after the code:

```tsx
            {item.dgdaIngredients.map((x) => {
              const { relation, match } = xmRelation(x.xmCode, ings);
              const xmSource = ings.flatMap((g) => g.codes).find((c) => c.system === "ICD11_XM" && c.code === x.xmCode)?.source ?? null;
              return (
                <Row key={x.xmCode} th="DGDA ingredient code"
                  src={<><span className="mono">{x.xmCode}</span>{xmSource && <> <SourceOf source={xmSource} /></>}<span className="cmp-sub">{x.name}</span></>}
                  rel={<Rel r={relation} />}
                  ext={match ? <><span className="mono">{match.bdsId}</span> {match.name}<span className={s.cmpNames}>{fill(DESK.names, {
                    names: match.names.map((nm) => `${nm.name} (${NAME_TYPE_LABEL[nm.type] ?? nm.type})`).join(", ") })}</span></>
                    : DESK.noMatchingSubstance} />
              );
            })}
```

5. In the "Codes n" rows, change the `CodeChip` to `<CodeChip key={`${c.system}${c.code}`} system={c.system} code={c.code} meta={meta(c)} source={c.source} />`.

In `web/components/review/detail/EvidenceContent.tsx`:

1. Imports become:

```tsx
import { Fragment } from "react";
import { SourceOf } from "@/components/ui/SourceLink";
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, SHARED_WORDS, STAGE_NAME } from "@/lib/review-copy";
import { STAGE_KEYS, type ReviewItem, type Source } from "@/lib/review-types";
```

2. Above the component add:

```tsx
/** §5.6.3 item 6: the source rows, in this order, by the code systems each source gives. */
const SOURCE_ROWS: [string, string[]][] = [
  [P1C_COPY.sources.rxnav, ["RXCUI", "SNOMEDCT"]], [P1C_COPY.sources.who, ["ATC"]], [SHARED_WORDS.drugbank, ["DRUGBANK"]],
  [SHARED_WORDS.icd11, ["ICD11_XM"]], [SHARED_WORDS.ddinter, ["DDINTER"]],
];
type SourceRow = { label: string; links: { code: string; source: Source }[] };

function sourceRows(item: ReviewItem): SourceRow[] {
  const rows: SourceRow[] = [];
  if (item.brand?.source) rows.push({ label: P1C_COPY.sources.dgda, links: [{ code: item.conceptId, source: item.brand.source }] });
  for (const [label, systems] of SOURCE_ROWS) {
    const seen = new Set<string>();
    const links: SourceRow["links"] = [];
    for (const g of item.ingredients)
      for (const c of g.codes)
        if (systems.includes(c.system) && c.source && !seen.has(`${c.system}:${c.code}`)) {
          seen.add(`${c.system}:${c.code}`);
          links.push({ code: c.code, source: c.source });
        }
    if (links.length > 0) rows.push({ label, links });
  }
  return rows;
}
```

3. At the end of the returned fragment, after the "Pipeline" `dl`, add:

```tsx
      {sourceRows(item).length > 0 && (
        <>
          <h5>{SHARED_WORDS.sources}</h5>
          <p className="dr-note">{P1C_COPY.sources.sourcesNote}</p>
          <dl className="dr-dl">
            {sourceRows(item).map((row) => [
              <dt key={`t${row.label}`}>{row.label}</dt>,
              <dd key={`d${row.label}`}>{row.links.map((l, i) => (
                <Fragment key={`${l.code}${l.source.url}`}>{i > 0 && <br />}<span className="mono">{l.code}</span> <SourceOf source={l.source} /></Fragment>
              ))}</dd>,
            ])}
          </dl>
        </>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/review-sources.test.tsx tests/review-detail.test.tsx tests/review-interactions.test.tsx tests/p1c-copy.test.ts tests/copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/review/detail/ComparisonTable.tsx web/components/review/detail/EvidenceContent.tsx web/tests/review-sources.test.tsx
git commit -m "feat(web): source links on the desk: DGDA register, every code chip, the ICD-11 search and the evidence Sources (§5.6.6)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Senior review on the web server — types, API client, the pair decision action and `senior_open` (§5.15, §7.7, §9.2, §9.3)

**Files:**
- Create: `web/lib/senior-types.ts`, `web/lib/senior-params.ts`, `web/lib/senior-core.ts`, `web/lib/senior-actions.ts`
- Modify: `web/lib/api.ts`, `web/lib/audit.ts`
- Test: `web/tests/senior-api.test.ts` (create), `web/tests/senior-actions.test.ts` (create), `web/tests/senior-params.test.ts` (create)

**Interfaces:**
- Consumes: Task 8a's `GET /v1/review/pairs`, `/v1/review/substances`, `/v1/review/substances/{bdsId}`; Task 8b's `POST /v1/review/pairs/{a}/{b}/decisions`; Task 1's `senior_open` event and `substance`/`pair_queue` targets.
- Produces (`lib/senior-types.ts`, client-safe, imports types only): `PairShow`, `PAIR_SHOWS`, `PairScope`, `PAIR_SCOPES`, `SeverityFilter`, `SEVERITY_FILTERS`, `PairQuery = {show, pairs, severity: SeverityFilter | null, page}`, `SENIOR_PAGE_SIZE = 50`, `PairVersion`, `PairChange`, `PairHistoryEntry`, `PairBrand`, `PairView`, `PairsPage`, `SubstanceRow`, `SubstancesPage`, `SubstanceBrand`, `SubstanceDetail`, `PairOutcome`, `PairRef = {ddinterA, ddinterB, nameA, nameB, version, state}`, `pairKey(a, b)`, `PairDecideInput`, `PairCode`, `PairDecideResult`.
- Produces (`lib/senior-params.ts`, pure): `parsePairQuery(sp)`, `parseSubstanceQuery(sp) → {pairs, severity, page}`, `parseSubstancesQuery(sp) → {q, page}` (unknown values fall back to the defaults: Review Focus 5); `pairsHref(q)`, `substanceHref(bdsId, q?)`, `substancesHref(q, page)` (defaults left out).
- Produces (`lib/api.ts`): `getPairQueue(q, viewerEmail, size = 50) → PairsPage` (throws on any failure), `listSeniorSubstances(q, page) → SubstancesPage`, `getSeniorSubstance(bdsId, q, viewerEmail) → SubstanceDetail | null` (null on 404), `postPairDecision(a, b, PairDecisionRequest) → WriteResult<PairOutcome>`.
- Produces (`lib/senior-core.ts`, server-only): `runPairDecide(input) → PairDecideResult` (session → `unauthenticated`; role not `senior` → `forbidden`; input → `invalid`; the shared per-account decision budget → `rate_limited`; Turnstile `decision` → `captcha`; 409 `contentHash` → `content_changed`, `lastPairReviewId` → `other_senior`, `state` → `already_reviewed`; 404 → `not_found`; 400 → `invalid`; else `failed`), `pairDecideStatus(r)`, `runPairDecideLogged(input)` (one `action:pair-decide` log line), `logSenior(type, id)` (one `senior_open` audit row per actor, page and 10 minutes; seniors only). `lib/senior-actions.ts` ("use server"): `pairDecide(input)`, `logSeniorOpen(type, id)`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/senior-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pairsHref, parsePairQuery, parseSubstanceQuery, parseSubstancesQuery, substanceHref, substancesHref } from "@/lib/senior-params";

describe("senior page parameters (§5.17.1, Review Focus 5)", () => {
  it("defaults: show todo, all pairs, any severity, page 0", () => {
    expect(parsePairQuery({})).toEqual({ show: "todo", pairs: "all", severity: null, page: 0 });
  });
  it("keeps known values and falls back to the default for each unknown one", () => {
    expect(parsePairQuery({ show: "changed", pairs: "applies", severity: "major", page: "3" }))
      .toEqual({ show: "changed", pairs: "applies", severity: "major", page: 3 });
    expect(parsePairQuery({ show: "bogus", pairs: "x", severity: "urgent", page: "-1" })).toEqual({ show: "todo", pairs: "all", severity: null, page: 0 });
    expect(parsePairQuery({ page: "10001" }).page).toBe(0);
    expect(parsePairQuery({ page: ["2", "5"] }).page).toBe(2);
  });
  it("the substance page and the substances list", () => {
    expect(parseSubstanceQuery({ pairs: "applies", severity: "unknown", page: "1" })).toEqual({ pairs: "applies", severity: "unknown", page: 1 });
    expect(parseSubstanceQuery({ show: "todo" })).toEqual({ pairs: "all", severity: null, page: 0 });
    expect(parseSubstancesQuery({ q: "  para  ", page: "2" })).toEqual({ q: "para", page: 2 });
    expect([...parseSubstancesQuery({ q: "😀".repeat(150) }).q]).toHaveLength(100);
  });
  it("links leave the defaults out", () => {
    expect(pairsHref({})).toBe("/review/pairs");
    expect(pairsHref({ show: "all", pairs: "applies", severity: "minor", page: 2 })).toBe("/review/pairs?show=all&pairs=applies&severity=minor&page=2");
    expect(substanceHref("BDS-000003")).toBe("/review/substances/BDS-000003");
    expect(substanceHref("BDS-000003", { pairs: "applies", page: 1 })).toBe("/review/substances/BDS-000003?pairs=applies&page=1");
    expect(substancesHref("", 0)).toBe("/review/substances");
    expect(substancesHref("war", 1)).toBe("/review/substances?q=war&page=1");
  });
});
```

Create `web/tests/senior-api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPairQueue, getSeniorSubstance, listSeniorSubstances, postPairDecision } from "@/lib/api";

const TOKEN = "test-internal-token-0123456789abcdef";
let fetchMock: ReturnType<typeof vi.fn>;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  fetchMock = vi.fn().mockResolvedValue(ok({ total: 0, counts: { todo: 0, changed: 0, issue: 0, reviewed: 0, all: 0 }, items: [] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("senior review reads and the pair decision write (§7.7)", () => {
  it("the queue carries the token and the viewer, and its query", async () => {
    await getPairQueue({ show: "issue", pairs: "applies", severity: "major", page: 2 }, "senior@e2e.test");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/review/pairs?show=issue&pairs=applies&page=2&size=50&severity=major");
    expect(init.headers).toMatchObject({ "X-Internal-Token": TOKEN, "X-Viewer-Email": "senior@e2e.test" });
  });
  it("a failed read throws, so the page's error boundary shows (§5.17.5)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(getPairQueue({ show: "todo", pairs: "all", severity: null, page: 0 }, "s@x.org")).rejects.toThrow("API error 500");
  });
  it("substances list and page; an unknown substance is null", async () => {
    fetchMock.mockResolvedValueOnce(ok({ total: 0, items: [] }));
    await listSeniorSubstances("war", 1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://api:8080/v1/review/substances?page=1&size=50&q=war");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await getSeniorSubstance("BDS-999999", { pairs: "all", severity: null, page: 0 }, "s@x.org")).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("http://api:8080/v1/review/substances/BDS-999999?pairs=all&page=0&size=50");
  });
  it("the pair decision posts the session's email and role with the version and requestId", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ddinterA: "DDInter14", ddinterB: "DDInter1951", review: { state: "reviewed", at: "2026-10-15T03:00:00Z",
      mine: true, note: null }, version: { contentHash: "a".repeat(64), lastPairReviewId: 9 }, replayed: false }, 201));
    const r = await postPairDecision("DDInter14", "DDInter1951", { decision: "reviewed", note: "", reviewerEmail: "senior@e2e.test",
      reviewerRole: "senior", expectedContentHash: "b".repeat(64), expectedLastPairReviewId: null, requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6" });
    expect(r).toEqual({ ok: true, data: { ddinterA: "DDInter14", ddinterB: "DDInter1951",
      review: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: true, note: null }, version: { contentHash: "a".repeat(64), lastPairReviewId: 9 },
      replayed: false } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/review/pairs/DDInter14/DDInter1951/decisions");
    expect(JSON.parse(init.body)).toEqual({ decision: "reviewed", note: "", reviewerEmail: "senior@e2e.test", reviewerRole: "senior",
      expectedContentHash: "b".repeat(64), expectedLastPairReviewId: null, requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6" });
  });
});
```

Create `web/tests/senior-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const allowAccountAction = vi.fn((_k: string, _e: string) => true);
const verifyTurnstile = vi.fn(async (_t: unknown, _ip: unknown, _a: string) => true);
const postPairDecision = vi.fn();
const recordAudit = vi.fn(async (_e: unknown) => true);
const logRequest = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/limits", () => ({ allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (t: unknown, ip: unknown, a: string) => verifyTurnstile(t, ip, a) }));
vi.mock("@/lib/api", () => ({ postPairDecision: (...a: unknown[]) => postPairDecision(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));
vi.mock("@/lib/request-log", () => ({ logRequest: (l: unknown) => logRequest(l) }));
vi.mock("@/lib/request-id", () => ({ requestId: async () => "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));

import { logSenior, pairDecideStatus, runPairDecide, runPairDecideLogged } from "@/lib/senior-core";

const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
const HASH = "c".repeat(64);
const RID = "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6";
const input = (over = {}) => ({ ddinterA: "DDInter14", ddinterB: "DDInter1951", decision: "reviewed", note: "", expectedContentHash: HASH,
  expectedLastPairReviewId: null, requestId: RID, turnstileToken: "tok", ...over });
const OUTCOME = { ddinterA: "DDInter14", ddinterB: "DDInter1951", review: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: true, note: null },
  version: { contentHash: HASH, lastPairReviewId: 3 }, replayed: false };

beforeEach(() => {
  for (const f of [getSession, allowAccountAction, verifyTurnstile, postPairDecision, recordAudit, logRequest]) f.mockClear();
  getSession.mockResolvedValue(SENIOR);
  allowAccountAction.mockReturnValue(true);
  verifyTurnstile.mockResolvedValue(true);
  postPairDecision.mockResolvedValue({ ok: true, data: OUTCOME });
});

describe("the pair decision action (§5.17.2, §7.7, §9.2, §9.3)", () => {
  it("a senior's decision goes to the API with the session's own email and role, never values from the client", async () => {
    expect(await runPairDecide({ ...input(), reviewerEmail: "forged@x.org", reviewerRole: "pharmacist" })).toEqual({ ok: true, outcome: OUTCOME });
    expect(postPairDecision).toHaveBeenCalledWith("DDInter14", "DDInter1951", { decision: "reviewed", note: "", reviewerEmail: "senior@e2e.test",
      reviewerRole: "senior", expectedContentHash: HASH, expectedLastPairReviewId: null, requestId: RID });
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "203.0.113.9", "decision");
    expect(allowAccountAction).toHaveBeenCalledWith("decision", "senior@e2e.test");   // one shared budget with record decisions
  });
  it("no session, then any other role, are refused before the API", async () => {
    getSession.mockResolvedValueOnce(null);
    expect(await runPairDecide(input())).toEqual({ ok: false, code: "unauthenticated" });
    for (const role of ["pharmacist", "engineer", "user"]) {
      getSession.mockResolvedValueOnce({ ...SENIOR, role });
      expect(await runPairDecide(input())).toEqual({ ok: false, code: "forbidden" });
    }
    expect(postPairDecision).not.toHaveBeenCalled();
  });
  it.each([
    ["pair ids in the wrong order", { ddinterA: "DDInter1951", ddinterB: "DDInter14" }],
    ["a bad id", { ddinterA: "DDInter14x" }],
    ["an issue note under 5 code points", { decision: "issue", note: "😀😀😀😀" }],
    ["a note over 1000", { note: "x".repeat(1001) }],
    ["a bad hash", { expectedContentHash: "z".repeat(64) }],
    ["a bad last id", { expectedLastPairReviewId: 0 }],
    ["a bad requestId", { requestId: "nope" }],
    ["a bad decision", { decision: "ok" }],
  ])("invalid: %s", async (_name, over) => {
    expect(await runPairDecide(input(over))).toEqual({ ok: false, code: "invalid" });
    expect(postPairDecision).not.toHaveBeenCalled();
  });
  it("the shared decision budget, then the bot check", async () => {
    allowAccountAction.mockReturnValueOnce(false);
    expect(await runPairDecide(input())).toEqual({ ok: false, code: "rate_limited" });
    verifyTurnstile.mockResolvedValueOnce(false);
    expect(await runPairDecide(input())).toEqual({ ok: false, code: "captcha" });
  });
  it.each([
    [{ ok: false, status: 409, error: "x", field: "contentHash" }, "content_changed"],
    [{ ok: false, status: 409, error: "x", field: "lastPairReviewId" }, "other_senior"],
    [{ ok: false, status: 409, error: "x", field: "state" }, "already_reviewed"],
    [{ ok: false, status: 404, error: "x", field: "pair" }, "not_found"],
    [{ ok: false, status: 400, error: "x", field: "note" }, "invalid"],
    [{ ok: false, status: 0, error: "x", field: null }, "failed"],
  ])("API %j → %s", async (answer, code) => {
    postPairDecision.mockResolvedValueOnce(answer);
    expect(await runPairDecide(input({ decision: "issue", note: "text contradicts the severity" }))).toEqual({ ok: false, code });
  });
  it("one log line with the status, never a note or an email", async () => {
    await runPairDecideLogged(input({ decision: "issue", note: "secret note" }));
    expect(logRequest).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(logRequest.mock.calls[0][0]);
    expect(logRequest.mock.calls[0][0]).toMatchObject({ route: "action:pair-decide", method: "POST", status: 200 });
    expect(line).not.toContain("secret");
    expect(line).not.toContain("@");
    expect(pairDecideStatus({ ok: false, code: "content_changed" })).toBe(409);
    expect(pairDecideStatus({ ok: false, code: "forbidden" })).toBe(403);
  });
});

describe("senior_open (§5.15)", () => {
  it("one row per actor, page and 10 minutes, seniors only, with the substance or the queue filter as target", async () => {
    await logSenior("substance", "BDS-000003");
    await logSenior("substance", "BDS-000003");
    await logSenior("pair_queue", "todo");
    expect(recordAudit.mock.calls.map((c) => c[0])).toEqual([
      { event: "senior_open", outcome: "shown", actorEmail: "senior@e2e.test", actorRole: "senior", targetType: "substance", targetId: "BDS-000003" },
      { event: "senior_open", outcome: "shown", actorEmail: "senior@e2e.test", actorRole: "senior", targetType: "pair_queue", targetId: "todo" },
    ]);
    getSession.mockResolvedValue({ ...SENIOR, role: "pharmacist" });
    await logSenior("pair_queue", "all");
    await logSenior("pair_queue", "bogus");
    await logSenior("other", "x");
    expect(recordAudit).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/senior-params.test.ts tests/senior-api.test.ts tests/senior-actions.test.ts`
Expected: FAIL — the modules and the API functions do not exist.

- [ ] **Step 3: Implement the types and the parameters**

Create `web/lib/senior-types.ts`:

```ts
/*
 * Shapes of the senior review endpoints (spec §7.7) and of the pair decision action, shared by the senior pages (server)
 * and the SeniorDesk island (client). Type imports only, so an island may import it.
 */
import type { DisplayStatus, EntrySummary, IngredientSummary, PairReview, Source } from "./review-types";

export type PairShow = "todo" | "changed" | "issue" | "reviewed" | "all";
export const PAIR_SHOWS: readonly PairShow[] = ["todo", "changed", "issue", "reviewed", "all"];
export type PairScope = "all" | "applies";
export const PAIR_SCOPES: readonly PairScope[] = ["all", "applies"];
export type SeverityFilter = "major" | "moderate" | "minor" | "unknown";
export const SEVERITY_FILTERS: readonly SeverityFilter[] = ["major", "moderate", "minor", "unknown"];
export type PairQuery = { show: PairShow; pairs: PairScope; severity: SeverityFilter | null; page: number };
export const SENIOR_PAGE_SIZE = 50;

export type PairVersion = { contentHash: string; lastPairReviewId: number | null };
export type PairChange = { field: string; atReview: string | null; now: string | null };
export type PairHistoryEntry = { decision: "reviewed" | "issue"; at: string; note: string | null; mine: boolean; changedAfter: boolean };
export type PairBrand = { conceptId: string; tradeName: string; batchId: string; displayStatus: DisplayStatus; side: "a" | "b" };
export type PairView = {
  ddinterA: string; ddinterB: string; substanceA: { bdsId: string; name: string }; substanceB: { bdsId: string; name: string };
  entryA: { name: string | null; routeScope: string; source: Source | null }; entryB: { name: string | null; routeScope: string; source: Source | null };
  severity: string; actions: string[]; interaction: string | null; management: string | null; source: Source | null; applies: boolean;
  brands: PairBrand[]; brandCounts: { a: number; b: number; batches: number }; review: PairReview; changes: PairChange[];
  history: PairHistoryEntry[]; version: PairVersion;
};
export type PairsPage = { total: number; counts: Record<PairShow, number>; items: PairView[] };
export type SubstanceRow = { bdsId: string; name: string; brands: number; batches: number; pairsToReview: number; majorPairsToReview: number };
export type SubstancesPage = { total: number; items: SubstanceRow[] };
export type SubstanceBrand = {
  conceptId: string; tradeName: string; batchId: string; displayStatus: DisplayStatus;
  clinicalDrug: { bdcId: string; displayName: string; route: string | null } | null; strengthText: string;
  chosen: { ddinterId: string; routeScope: string; routeAssumed: boolean }[]; reason: "no_data" | "not_run" | "no_route" | null;
};
export type SubstanceDetail = {
  bdsId: string; name: string; names: { name: string; type: string; source: string }[]; codes: IngredientSummary["codes"];
  coverage: "full" | "none" | "not_run"; entries: EntrySummary[]; brands: SubstanceBrand[]; pairs: { total: number; items: PairView[] };
};
export type PairOutcome = { ddinterA: string; ddinterB: string; review: PairReview; version: PairVersion; replayed: boolean };

/** What SeniorDesk receives per row (§4.2): ids, substance names for announcements, version and state. Never text or emails. */
export type PairRef = { ddinterA: string; ddinterB: string; nameA: string; nameB: string; version: PairVersion; state: PairReview["state"] };
export const pairKey = (ddinterA: string, ddinterB: string) => `${ddinterA}|${ddinterB}`;

export type PairDecideInput = {
  ddinterA: string; ddinterB: string; decision: "reviewed" | "issue"; note: string; expectedContentHash: string;
  expectedLastPairReviewId: number | null; requestId: string; turnstileToken: string;
};
export type PairCode = "content_changed" | "other_senior" | "already_reviewed" | "not_found" | "captcha" | "forbidden"
  | "unauthenticated" | "rate_limited" | "invalid" | "failed";
export type PairDecideResult = { ok: true; outcome: PairOutcome } | { ok: false; code: PairCode };
```

Create `web/lib/senior-params.ts`:

```ts
import { PAIR_SCOPES, PAIR_SHOWS, SEVERITY_FILTERS, type PairQuery, type PairScope, type PairShow, type SeverityFilter } from "./senior-types";

/*
 * Query parameters of the senior pages (§5.17). An unknown or malformed value falls back to its default, so a stale or
 * hand-edited link still shows a page (Review Focus 5); the API would answer 400 for it.
 */
type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const oneOf = <T extends string>(v: string, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(v) ? (v as T) : fallback);
const PAGE_MAX = 10_000, Q_MAX = 100;
const page = (v: string) => (/^\d{1,5}$/.test(v) && Number(v) <= PAGE_MAX ? Number(v) : 0);
const severity = (v: string): SeverityFilter | null => ((SEVERITY_FILTERS as readonly string[]).includes(v) ? (v as SeverityFilter) : null);

export function parsePairQuery(sp: SP): PairQuery {
  return { show: oneOf<PairShow>(first(sp.show), PAIR_SHOWS, "todo"), pairs: oneOf<PairScope>(first(sp.pairs), PAIR_SCOPES, "all"),
    severity: severity(first(sp.severity)), page: page(first(sp.page)) };
}

export function parseSubstanceQuery(sp: SP): Omit<PairQuery, "show"> {
  return { pairs: oneOf<PairScope>(first(sp.pairs), PAIR_SCOPES, "all"), severity: severity(first(sp.severity)), page: page(first(sp.page)) };
}

export function parseSubstancesQuery(sp: SP): { q: string; page: number } {
  return { q: [...first(sp.q).trim()].slice(0, Q_MAX).join(""), page: page(first(sp.page)) };
}

const query = (entries: [string, string | number | null | undefined, string | number | null][]) => {
  const p = new URLSearchParams();
  for (const [k, v, dflt] of entries) if (v !== undefined && v !== null && v !== "" && v !== dflt) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export function pairsHref(q: Partial<PairQuery>): string {
  return `/review/pairs${query([["show", q.show, "todo"], ["pairs", q.pairs, "all"], ["severity", q.severity, null], ["page", q.page, 0]])}`;
}
export function substanceHref(bdsId: string, q: Partial<Omit<PairQuery, "show">> = {}): string {
  return `/review/substances/${encodeURIComponent(bdsId)}${query([["pairs", q.pairs, "all"], ["severity", q.severity, null], ["page", q.page, 0]])}`;
}
export function substancesHref(q: string, pageNo: number): string {
  return `/review/substances${query([["q", q, ""], ["page", pageNo, 0]])}`;
}
```

- [ ] **Step 4: Implement the API client, the audit event and the action**

In `web/lib/api.ts`:

1. Add `import type { PairOutcome, PairQuery, PairsPage, SubstanceDetail, SubstancesPage } from "./senior-types";` and `import { SENIOR_PAGE_SIZE } from "./senior-types";` after the `review-types` import.
2. After `getReviewDiff` add:

```ts
// ---- Senior review (spec §7.7): unreviewed data from every batch; the pages call these for a senior session only. ----

function seniorParams(q: Partial<PairQuery>, size = SENIOR_PAGE_SIZE): URLSearchParams {
  const p = new URLSearchParams();
  if (q.show) p.set("show", q.show);
  if (q.pairs) p.set("pairs", q.pairs);
  p.set("page", String(q.page ?? 0));
  p.set("size", String(size));
  if (q.severity) p.set("severity", q.severity);
  return p;
}

/**
 * The pair queue. Any failure throws: the page shows "Couldn't load senior review." (§5.17.5). `size` 1 reads only the
 * counts (the desk sidebar and /review/flags, Task 24).
 */
export async function getPairQueue(q: PairQuery, viewerEmail: string, size = SENIOR_PAGE_SIZE): Promise<PairsPage> {
  const data = await reviewData<PairsPage>(`/v1/review/pairs?${seniorParams(q, size)}`, { "X-Viewer-Email": viewerEmail });
  if (!data) throw new Error("API error 404");
  return data;
}

export async function listSeniorSubstances(q: string, page: number): Promise<SubstancesPage> {
  const p = new URLSearchParams({ page: String(page), size: String(SENIOR_PAGE_SIZE) });
  if (q) p.set("q", q);
  const data = await reviewData<SubstancesPage>(`/v1/review/substances?${p}`);
  if (!data) throw new Error("API error 404");
  return data;
}

/** One substance from every batch; null when it is not held (404, §7.7). */
export async function getSeniorSubstance(bdsId: string, q: Omit<PairQuery, "show">, viewerEmail: string): Promise<SubstanceDetail | null> {
  return reviewData<SubstanceDetail>(`/v1/review/substances/${enc(bdsId)}?${seniorParams(q)}`, { "X-Viewer-Email": viewerEmail });
}
```

3. After `postDeskDecision` add:

```ts
export type PairDecisionRequest = {
  decision: "reviewed" | "issue"; note: string; reviewerEmail: string; reviewerRole: "senior"; expectedContentHash: string;
  expectedLastPairReviewId: number | null; requestId: string;
};

/** The pair decision write (§7.7): 201 or a 200 replay, with the pair's new state and version. */
export async function postPairDecision(a: string, b: string, d: PairDecisionRequest): Promise<WriteResult<PairOutcome>> {
  const r = await write<PairOutcome>(`/v1/review/pairs/${enc(a)}/${enc(b)}/decisions`, d);
  if (!r.ok) return r;
  return { ok: true, data: { ddinterA: r.data?.ddinterA, ddinterB: r.data?.ddinterB, review: r.data?.review,
    version: { contentHash: r.data?.version?.contentHash, lastPairReviewId: r.data?.version?.lastPairReviewId ?? null },
    replayed: r.data?.replayed === true } };
}
```

In `web/lib/audit.ts`, change the two type lines to:

```ts
export type WebAuditEvent = "sign_in" | "sign_in_denied" | "sign_out" | "review_open" | "evidence_open" | "decision_denied" | "senior_open";
export type AuditInput = {
  event: WebAuditEvent; outcome: string; actorEmail?: string | null; actorRole?: Role | null;
  targetType?: "batch_item" | "flag" | "substance" | "pair_queue" | null; targetId?: string | null;
};
```

Create `web/lib/senior-core.ts`:

```ts
import "server-only";
import { headers } from "next/headers";
import { postPairDecision } from "./api";
import { recordAudit } from "./audit";
import { AUDIT_ONCE } from "./audit-once";
import { allowAccountAction } from "./limits";
import { accountKey, clientIp } from "./rate-limit";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";
import { PAIR_SHOWS, type PairDecideInput, type PairDecideResult } from "./senior-types";
import { getSession } from "./session";
import { verifyTurnstile } from "./turnstile";

/*
 * The pair decision action behind the senior pages (§5.17.2, §7.7). In order: the session (none: unauthenticated; not a
 * senior: forbidden), input bounds, the per-account decision budget shared with record decisions (§9.3), the bot check
 * (action "decision", §9.2), then the API with the session's own email and role. The API writes pair_decision and
 * pair_decision_rejected (§5.15). Emails and notes are personal data and are never logged.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^DDInter[0-9]{1,6}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const NOTE_MAX = 1000, ISSUE_MIN = 5, TOKEN_MAX = 2048;
const codePoints = (s: string) => [...s].length;

function parse(x: unknown): PairDecideInput | null {
  if (typeof x !== "object" || x === null) return null;
  const i = x as Record<string, unknown>;
  if (typeof i.ddinterA !== "string" || typeof i.ddinterB !== "string" || !ID_RE.test(i.ddinterA) || !ID_RE.test(i.ddinterB)) return null;
  if (!(i.ddinterA < i.ddinterB)) return null;   // the API stores each pair once, in text order (§7.7 step 2)
  if (i.decision !== "reviewed" && i.decision !== "issue") return null;
  if (typeof i.note !== "string") return null;
  const note = i.note.trim();
  if (codePoints(note) > NOTE_MAX || (i.decision === "issue" && codePoints(note) < ISSUE_MIN)) return null;
  if (typeof i.expectedContentHash !== "string" || !HASH_RE.test(i.expectedContentHash)) return null;
  const last = i.expectedLastPairReviewId;
  if (last !== null && (typeof last !== "number" || !Number.isSafeInteger(last) || last < 1)) return null;
  if (typeof i.requestId !== "string" || !UUID_RE.test(i.requestId)) return null;
  if (typeof i.turnstileToken !== "string" || i.turnstileToken.length > TOKEN_MAX) return null;
  return { ddinterA: i.ddinterA, ddinterB: i.ddinterB, decision: i.decision, note, expectedContentHash: i.expectedContentHash,
    expectedLastPairReviewId: last as number | null, requestId: i.requestId, turnstileToken: i.turnstileToken };
}

const CONFLICT: Record<string, "content_changed" | "other_senior" | "already_reviewed"> = {
  contentHash: "content_changed", lastPairReviewId: "other_senior", state: "already_reviewed",
};

export async function runPairDecide(input: unknown): Promise<PairDecideResult> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "senior") return { ok: false, code: "forbidden" };
  const d = parse(input);
  if (!d) return { ok: false, code: "invalid" };
  if (!allowAccountAction("decision", session.email)) return { ok: false, code: "rate_limited" };
  if (!(await verifyTurnstile(d.turnstileToken, clientIp(await headers()), "decision"))) return { ok: false, code: "captcha" };
  const r = await postPairDecision(d.ddinterA, d.ddinterB, { decision: d.decision, note: d.note, reviewerEmail: session.email,
    reviewerRole: "senior", expectedContentHash: d.expectedContentHash, expectedLastPairReviewId: d.expectedLastPairReviewId,
    requestId: d.requestId });
  if (r.ok) return { ok: true, outcome: r.data };
  if (r.status === 409) return { ok: false, code: CONFLICT[r.field ?? ""] ?? "already_reviewed" };
  if (r.status === 404) return { ok: false, code: "not_found" };
  if (r.status === 400) return { ok: false, code: "invalid" };
  return { ok: false, code: "failed" };
}

export function pairDecideStatus(r: PairDecideResult): number {
  if (r.ok) return 200;
  switch (r.code) {
    case "invalid": return 400;
    case "unauthenticated": return 401;
    case "forbidden": case "captcha": return 403;
    case "not_found": return 404;
    case "rate_limited": return 429;
    case "failed": return 502;
    default: return 409;
  }
}

/** runPairDecide plus its one log line: action name, status, duration and the web request id (§9.7). */
export async function runPairDecideLogged(input: unknown): Promise<PairDecideResult> {
  const started = performance.now();
  const result = await runPairDecide(input);
  logRequest({ route: "action:pair-decide", method: "POST", status: pairDecideStatus(result), ms: performance.now() - started,
    requestId: await requestId() });
  return result;
}

/** §5.15 senior_open: a senior page shown (never a prefetch: the island calls this on mount). At most once per actor, page and 10 minutes. */
export async function logSenior(type: unknown, id: unknown): Promise<void> {
  if ((type !== "pair_queue" && type !== "substance") || typeof id !== "string") return;
  if (type === "pair_queue" ? !(PAIR_SHOWS as readonly string[]).includes(id) : !/^[A-Za-z0-9-]{1,64}$/.test(id)) return;
  const session = await getSession();
  if (!session || session.role !== "senior") return;
  if (!AUDIT_ONCE(`senior_open|${accountKey(session.email)}|${type}/${id}`)) return;
  await recordAudit({ event: "senior_open", outcome: "shown", actorEmail: session.email, actorRole: "senior", targetType: type, targetId: id });
}
```

Create `web/lib/senior-actions.ts`:

```ts
"use server";
import { logSenior, runPairDecideLogged } from "./senior-core";
import type { PairDecideInput, PairDecideResult } from "./senior-types";

/*
 * Server actions of the senior pages. Every export of a "use server" module is a callable endpoint, so this file exports
 * only these two. The checks live in senior-core (server-only); this module has no "server-only" import, so the SeniorDesk
 * island may import it (scripts/check-client-islands.mjs).
 */
export async function pairDecide(input: PairDecideInput): Promise<PairDecideResult> {
  return runPairDecideLogged(input);
}

export async function logSeniorOpen(type: "pair_queue" | "substance", id: string): Promise<void> {
  await logSenior(type, id);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/senior-params.test.ts tests/senior-api.test.ts tests/senior-actions.test.ts tests/audit.test.ts tests/api.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/senior-types.ts web/lib/senior-params.ts web/lib/senior-core.ts web/lib/senior-actions.ts web/lib/api.ts web/lib/audit.ts \
  web/tests/senior-params.test.ts web/tests/senior-api.test.ts web/tests/senior-actions.test.ts
git commit -m "feat(web): senior review reads, the pair decision action and senior_open (§7.7, §5.15, §9.2)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: The `SeniorDesk` island — keys, pair decisions, row banners, drafts (§4.2, §5.17.2, §5.17.5)

The senior pages are server-rendered (Task 23). This island wraps their pair rows: it owns the keyboard model, the one Turnstile widget, the pair decisions and their outcomes, the pair-issue notes and their drafts, and the page's one polite live region. Each server-rendered row holds two small client parts that read the island's context: `PairStateLine` (the state line, which a decision updates in place, because the row stays where it is until the page reloads, §5.17.2) and `PairActions` (Mark reviewed, Report pair issue, the note panel, the row banners). Neither renders an action until the island has hydrated: without JavaScript the rows read fully and deciding needs the bot check (§5.17.5).

**Files:**
- Create: `web/components/review/senior/pair-machine.ts`, `web/components/review/senior/keys.ts`, `web/components/review/senior/context.ts`, `web/components/review/senior/SeniorDesk.tsx`, `web/components/review/senior/PairActions.tsx`, `web/components/review/senior/PairStateLine.tsx`, `web/components/review/senior/SeniorSheet.tsx`, `web/components/review/senior/senior.module.css`
- Modify: `web/lib/review-copy.ts`, `web/scripts/check-client-islands.mjs`
- Test: `web/tests/senior-harness.tsx` (create), `web/tests/pair-machine.test.ts` (create), `web/tests/senior-keys.test.tsx` (create), `web/tests/senior-desk.test.tsx` (create), `web/tests/client-islands.test.ts`

**Interfaces:**
- Consumes: Task 21's `pairDecide`, `logSeniorOpen`, `PairRef`, `pairKey`, `PairDecideResult`, `PairOutcome`, `PairVersion`; Task 16's `pairDraftKey`, `loadDraftAt`, `saveDraftAt`, `noteLength`, `NOTE_MIN`; Task 17's `PairReviewState`; Task 13's `P1C_COPY.review`.
- Produces: `SeniorDesk({ role: "senior", kind, target, pairs: PairRef[], singleKeys, siteKey, nonce?, children })` (region `#senior`); `PairStateLine({ddinterA, ddinterB, review})`; `PairActions({ddinterA, ddinterB})`. A row is an `<article class="pair-row" id="pair-{a}-{b}">` whose heading has `id="pair-{a}-{b}-h"` and `tabIndex={-1}` (Task 23 renders it). Buttons carry `data-sk="mark-{a}-{b}"` and `data-sk="report-{a}-{b}"`; the note field is `#pair-note-{a}-{b}` with `data-senior="note"`. `pairStep` (pure) and `seniorKeyAction` (pure). `SENIOR_SHEET_ROWS` in `lib/review-copy.ts`. The island allowlist gains `components/review/senior/`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/pair-machine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialPairs, pairStep, type PairEffect, type PairEvent, type PairOp, type PairState } from "@/components/review/senior/pair-machine";

const op = (over: Partial<PairOp> = {}): PairOp => ({ key: "DDInter14|DDInter1951", ddinterA: "DDInter14", ddinterB: "DDInter1951",
  a: "Acetaminophen", b: "Warfarin", decision: "reviewed", note: "", version: { contentHash: "a".repeat(64), lastPairReviewId: null },
  requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6", ...over });
const OUT = { ddinterA: "DDInter14", ddinterB: "DDInter1951", review: { state: "reviewed" as const, at: "2026-10-15T03:00:00Z", mine: true, note: null },
  version: { contentHash: "a".repeat(64), lastPairReviewId: 9 }, replayed: false };
function run(s: PairState, ...events: PairEvent[]) {
  let state = s;
  const effects: PairEffect[] = [];
  for (const e of events) { const r = pairStep(state, e); state = r.state; effects.push(...r.effects); }
  return { state, effects };
}
const said = (fx: PairEffect[]) => fx.filter((e) => e.type === "announce" || e.type === "hint").map((e) => (e as { text: string }).text);
const sent = () => run(initialPairs(), { type: "SEND", op: op(), token: "held" });

describe("pair decisions (§5.17.2 outcomes)", () => {
  it("sends at once, with no undo window, one decision per page at a time", () => {
    const r = sent();
    expect(r.state.rows[op().key]).toEqual({ kind: "sending", op: op() });
    expect(r.effects).toEqual([{ type: "send", op: op() }]);
    const other = op({ key: "DDInter1951|DDInter20", ddinterA: "DDInter1951", ddinterB: "DDInter20" });
    expect(run(r.state, { type: "SEND", op: other, token: "held" }).effects).toEqual([]);
  });
  it("reviewed and issue: saved and announced by name", () => {
    const ok = run(sent().state, { type: "RESULT", key: op().key, result: { ok: true, outcome: OUT } });
    expect(ok.state.rows[op().key]).toEqual({ kind: "idle" });
    expect(ok.effects[0]).toEqual({ type: "saved", op: op(), outcome: OUT });
    expect(said(ok.effects)).toEqual(["Pair Acetaminophen + Warfarin marked reviewed."]);
    const issue = run(initialPairs(), { type: "SEND", op: op({ decision: "issue", note: "text contradicts the severity" }), token: "held" },
      { type: "RESULT", key: op().key, result: { ok: true, outcome: OUT } });
    expect(said(issue.effects)).toEqual(["Pair issue reported for Acetaminophen + Warfarin."]);
  });
  it("409 contentHash and lastPairReviewId pause the row until Reload; 409 state is a hint", () => {
    const c = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "content_changed" } });
    expect(c.state.rows[op().key]).toEqual({ kind: "paused", reason: "content" });
    expect(said(c.effects)).toEqual(["This pair changed in DDInter after you opened the page. Nothing was saved. Reload to review the latest text."]);
    expect(run(c.state, { type: "SEND", op: op(), token: "held" }).effects).toEqual([]);
    expect(run(c.state, { type: "RELOADED", key: op().key }).state.rows[op().key]).toEqual({ kind: "idle" });
    const o = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "other_senior" } });
    expect(said(o.effects)).toEqual(["Another senior pharmacist decided on this pair after you opened the page. Nothing was saved. Reload to see their decision."]);
    const s = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "already_reviewed" } });
    expect(s.effects).toEqual([{ type: "hint", text: "This pair is already reviewed." }]);
  });
  it("429 is not saved, a lost answer unconfirmed; Try again resends the same op", () => {
    const no = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "rate_limited" } });
    expect(no.state.rows[op().key]).toEqual({ kind: "netErr", op: op(), saved: "no" });
    expect(said(no.effects)).toEqual(["Couldn't save your pair review. Nothing was saved. Check your connection and try again."]);
    const lost = run(sent().state, { type: "RESULT", key: op().key, result: "network" });
    expect(said(lost.effects)).toEqual(["Couldn't confirm your pair review. Try again to find out; it will not be saved twice."]);
    expect(run(lost.state, { type: "TRY_AGAIN", key: op().key }).effects).toEqual([{ type: "send", op: op() }]);
  });
  it("captcha holds the op for Retry check; forbidden and unauthenticated stop the page", () => {
    const held = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "captcha" } });
    expect(held.state.rows[op().key]).toEqual({ kind: "botHold", op: op() });
    expect(run(held.state, { type: "RETRY_OK" }).effects).toContainEqual({ type: "send", op: op() });
    expect(run(initialPairs(), { type: "SEND", op: op(), token: "failed" }).state.rows[op().key]).toEqual({ kind: "botHold", op: op() });
    expect(run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "forbidden" } }).state.auth).toBe("forbidden");
    const out = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "unauthenticated" } });
    expect(out.state.auth).toBe("signedOut");
    expect(said(out.effects)).toEqual(["Your sign-in expired. Your decision on Acetaminophen + Warfarin was not saved."]);
  });
});
```

Create `web/tests/senior-harness.tsx` (the shared mocks and rows, as `desk-harness.tsx` is for the desk):

```tsx
import { act, fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";
import PairActions from "@/components/review/senior/PairActions";
import PairStateLine from "@/components/review/senior/PairStateLine";
import SeniorDesk from "@/components/review/senior/SeniorDesk";
import type { TurnstileFieldProps } from "@/components/TurnstileField";
import type { PairReview } from "@/lib/review-types";
import type { PairRef } from "@/lib/senior-types";

export const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
export const pairDecide = vi.fn();
export const logSeniorOpen = vi.fn(async (..._a: unknown[]) => {});
export const turnstile: { props: TurnstileFieldProps | null } = { props: null };

export const HASH = "a".repeat(64);
export const REFS: PairRef[] = [
  { ddinterA: "DDInter14", ddinterB: "DDInter1951", nameA: "Acetaminophen", nameB: "Warfarin",
    version: { contentHash: HASH, lastPairReviewId: null }, state: "not_reviewed" },
  { ddinterA: "DDInter1951", ddinterB: "DDInter20", nameA: "Warfarin", nameB: "Acetylsalicylic acid",
    version: { contentHash: "b".repeat(64), lastPairReviewId: 4 }, state: "reviewed" },
];
const NOT: PairReview = { state: "not_reviewed", at: null, mine: false, note: null };
const DONE: PairReview = { state: "reviewed", at: "2026-10-14T03:00:00Z", mine: false, note: null };

/** A pair row as PairRow (Task 23) renders it, reduced to what the island reads: the article, its heading and the two parts. */
export function Row({ r, review }: { r: PairRef; review: PairReview }) {
  const id = `pair-${r.ddinterA}-${r.ddinterB}`;
  return (
    <article className="pair-row" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} tabIndex={-1}>{r.nameA} + {r.nameB}</h2>
      <PairStateLine ddinterA={r.ddinterA} ddinterB={r.ddinterB} review={review} />
      <PairActions ddinterA={r.ddinterA} ddinterB={r.ddinterB} />
    </article>
  );
}

/** The queue with the two rows; the bot check passes with "tok-1". */
export async function mount(singleKeys = true) {
  render(
    <SeniorDesk role="senior" kind="queue" target={{ type: "pair_queue", id: "todo" }} pairs={REFS} singleKeys={singleKeys}
      siteKey="1x00000000000000000000AA">
      <Row r={REFS[0]} review={NOT} /><Row r={REFS[1]} review={DONE} />
    </SeniorDesk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok-1"));
}
export const region = () => document.getElementById("senior")!;
export const key = (k: string, target: Element = region(), mods = {}) => fireEvent.keyDown(target, { key: k, ...mods });
export const hint = () => document.querySelector('[data-senior="hint"]')?.textContent ?? "";
```

Create `web/tests/senior-keys.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileFieldProps } from "@/components/TurnstileField";
import { logSeniorOpen, pairDecide, router, turnstile } from "./senior-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: (i: unknown) => pairDecide(i), logSeniorOpen: (...a: unknown[]) => logSeniorOpen(...a) }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: TurnstileFieldProps) => { turnstile.props = p; return null; } }));

import { HASH, hint, key, mount, region } from "./senior-harness";

beforeEach(() => { pairDecide.mockReset(); logSeniorOpen.mockClear(); router.refresh.mockClear(); sessionStorage.clear(); });
afterEach(() => cleanup());

describe("senior keyboard model (§5.17.5, §11.1 senior-keys)", () => {
  it("J and K move between rows: the heading takes focus and the row is aria-current; the ends say so", async () => {
    await mount();
    key("j");
    expect(document.activeElement?.id).toBe("pair-DDInter14-DDInter1951-h");
    expect(document.getElementById("pair-DDInter14-DDInter1951")!.getAttribute("aria-current")).toBe("true");
    key("J");
    expect(document.activeElement?.id).toBe("pair-DDInter1951-DDInter20-h");
    expect(document.getElementById("pair-DDInter14-DDInter1951")!.hasAttribute("aria-current")).toBe(false);
    key("j");
    expect(hint()).toBe("This is the last pair on this page.");
    key("k");
    key("k");
    expect(hint()).toBe("This is the first pair on this page.");
  });

  it("M marks the current row, with its version, a requestId and the token", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "already_reviewed" });
    key("j");
    await act(async () => { key("m"); });
    expect(pairDecide).toHaveBeenCalledTimes(1);
    expect(pairDecide.mock.calls[0][0]).toMatchObject({ ddinterA: "DDInter14", ddinterB: "DDInter1951", decision: "reviewed", note: "",
      expectedContentHash: HASH, expectedLastPairReviewId: null, turnstileToken: "tok-1" });
    expect(pairDecide.mock.calls[0][0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("Enter on Mark reviewed is blocked with its hint", async () => {
    await mount();
    const mark = document.querySelector<HTMLButtonElement>('[data-sk="mark-DDInter14-DDInter1951"]')!;
    for (const mods of [{}, { ctrlKey: true }]) key("Enter", mark, mods);
    expect(pairDecide).not.toHaveBeenCalled();
    expect(hint()).toBe("Enter does not mark a pair reviewed. Press M, or Space on this button.");
  });

  it("R opens the current row's panel and focuses its field; Esc closes it and keeps the draft", async () => {
    await mount();
    key("j");
    key("r");
    const field = document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(field);
    expect(document.querySelector('[data-sk="report-DDInter14-DDInter1951"]')!.getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(field, { target: { value: "text contradicts the severity" } });
    key("Escape", field);
    expect(document.getElementById("pair-note-DDInter14-DDInter1951")).toBeNull();
    expect(document.activeElement?.getAttribute("data-sk")).toBe("report-DDInter14-DDInter1951");
    expect(sessionStorage.getItem("intellidrugs-pair-draft:DDInter14:DDInter1951")).toBe("text contradicts the severity");
    key("r");
    expect((document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement).value).toBe("text contradicts the severity");
  });

  it("? opens the sheet with the senior rows; Esc closes it", async () => {
    await mount();
    key("?");
    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect([...sheet.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["Next and previous pair", "Mark the pair reviewed",
      "Report a pair issue", "This sheet", "Close the sheet or the note", "Send the report, inside the note field", "Never marks a pair reviewed"]);
    key("Escape", within(sheet).getByRole("button"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("single-key shortcuts Off: J, K, M, R and ? do nothing; no aria-keyshortcuts; the plain region label", async () => {
    await mount(false);
    for (const k of ["j", "k", "m", "r", "?"]) key(k);
    expect(pairDecide).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[id^="pair-note-"]')).toBeNull();
    expect(region().getAttribute("aria-label")).toBe("IntelliDrugs senior review.");
    expect(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!.hasAttribute("aria-keyshortcuts")).toBe(false);
  });
});
```

Create `web/tests/senior-desk.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileFieldProps } from "@/components/TurnstileField";
import { logSeniorOpen, pairDecide, router, turnstile } from "./senior-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: (i: unknown) => pairDecide(i), logSeniorOpen: (...a: unknown[]) => logSeniorOpen(...a) }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: TurnstileFieldProps) => { turnstile.props = p; return null; } }));

import { HASH, hint, key, mount } from "./senior-harness";

beforeEach(() => { pairDecide.mockReset(); logSeniorOpen.mockClear(); router.refresh.mockClear(); sessionStorage.clear(); });
afterEach(() => cleanup());
const live = () => document.querySelector('[data-senior="live"]')!.textContent;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const state = (id: string) => document.getElementById(id)!.querySelector(".pair-review")!.textContent;
const ROW1 = "pair-DDInter14-DDInter1951";
const OUT = (over = {}) => ({ ddinterA: "DDInter14", ddinterB: "DDInter1951",
  review: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: true, note: null }, version: { contentHash: HASH, lastPairReviewId: 9 },
  replayed: false, ...over });

describe("pair decisions on the senior pages (§5.17.2)", () => {
  it("logs senior_open once, with the page's target", async () => {
    await mount();
    expect(logSeniorOpen).toHaveBeenCalledWith("pair_queue", "todo");
    expect(logSeniorOpen).toHaveBeenCalledTimes(1);
  });

  it("Mark reviewed: the state line becomes PAIR_REVIEWED in place, it is announced, and the page is not refreshed", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: true, outcome: OUT() });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    expect(state(ROW1)).toBe("Pair reviewed by a senior pharmacist on 15/10/2026 (you)");
    expect(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!.getAttribute("aria-disabled")).toBe("true");
    expect(router.refresh).not.toHaveBeenCalled();
    await settle();
    expect(live()).toBe("Pair Acetaminophen + Warfarin marked reviewed.");
  });

  it("a reviewed pair: M says so and sends nothing", async () => {
    await mount();
    key("j"); key("j");
    key("m");
    expect(pairDecide).not.toHaveBeenCalled();
    expect(hint()).toBe("This pair is already reviewed.");
  });

  it("Report pair issue: under 5 characters the error; sent: the issue line with the note, the panel closed, the draft cleared", async () => {
    await mount();
    fireEvent.click(document.querySelector('[data-sk="report-DDInter14-DDInter1951"]')!);
    const field = document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "abcd" } });
    key("Enter", field, { ctrlKey: true });
    expect(document.querySelector(`#${ROW1} .field-error`)?.textContent).toBe("Add at least 5 characters so the team knows what to check.");
    expect(pairDecide).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "text contradicts the severity" } });
    pairDecide.mockResolvedValue({ ok: true, outcome: OUT({ review: { state: "issue", at: "2026-10-15T03:00:00Z", mine: true,
      note: "text contradicts the severity" } }) });
    await act(async () => { key("Enter", field, { metaKey: true }); });
    expect(pairDecide.mock.calls[0][0]).toMatchObject({ decision: "issue", note: "text contradicts the severity" });
    expect(state(ROW1)).toBe("Pair issue reported by a senior pharmacist on 15/10/2026 (you). Note: text contradicts the severity");
    expect(document.getElementById("pair-note-DDInter14-DDInter1951")).toBeNull();
    expect(sessionStorage.getItem("intellidrugs-pair-draft:DDInter14:DDInter1951")).toBeNull();
    await settle();
    expect(live()).toBe("Pair issue reported for Acetaminophen + Warfarin.");
  });

  it("the next decision on a row sends the version its last save returned", async () => {
    await mount();
    pairDecide.mockResolvedValueOnce({ ok: true, outcome: OUT() });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    fireEvent.click(document.querySelector('[data-sk="report-DDInter14-DDInter1951"]')!);
    const field = document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "second thoughts on this pair" } });
    act(() => turnstile.props!.onToken!("tok-2"));
    pairDecide.mockResolvedValueOnce({ ok: false, code: "already_reviewed" });
    await act(async () => { key("Enter", field, { ctrlKey: true }); });
    expect(pairDecide.mock.calls[1][0]).toMatchObject({ expectedContentHash: HASH, expectedLastPairReviewId: 9 });
  });

  it("409 contentHash: the row's warn banner with Reload; the row pauses; Reload refreshes and clears it; the draft stays", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "content_changed" });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    const row = document.getElementById(ROW1)!;
    expect(within(row).getByText("This pair changed in DDInter after you opened the page.")).toBeTruthy();
    expect(within(row).getByText("Nothing was saved. Reload to review the latest text.")).toBeTruthy();
    fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!);
    expect(pairDecide).toHaveBeenCalledTimes(1);
    expect(hint()).toBe("This pair changed in DDInter after you opened the page.");
    fireEvent.click(within(row).getByRole("button", { name: "Reload" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(within(row).queryByText("This pair changed in DDInter after you opened the page.")).toBeNull();
  });

  it("409 lastPairReviewId: the other-senior banner", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "other_senior" });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    expect(within(document.getElementById(ROW1)!).getByText("Another senior pharmacist decided on this pair after you opened the page.")).toBeTruthy();
  });

  it("a lost answer: the unconfirmed banner; Try again resends the same requestId and version with a fresh token", async () => {
    await mount();
    pairDecide.mockRejectedValueOnce(new Error("network"));
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    const row = document.getElementById(ROW1)!;
    expect(within(row).getByText("Couldn't confirm your pair review.")).toBeTruthy();
    expect(within(row).getByText("Try again to find out; it will not be saved twice.")).toBeTruthy();
    act(() => turnstile.props!.onToken!("tok-2"));
    pairDecide.mockResolvedValueOnce({ ok: true, outcome: OUT({ replayed: true }) });
    await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Try again" })); });
    const [first, second] = pairDecide.mock.calls.map((c) => c[0]);
    expect(second).toMatchObject({ requestId: first.requestId, expectedContentHash: first.expectedContentHash,
      expectedLastPairReviewId: first.expectedLastPairReviewId, turnstileToken: "tok-2" });
    expect(state(ROW1)).toBe("Pair reviewed by a senior pharmacist on 15/10/2026 (you)");
  });
});
```

In `web/tests/client-islands.test.ts`, change the import to `import { ISLANDS, ISLAND_DIRS, checkIslands, clientFiles, importsOf } from "../scripts/check-client-islands.mjs";` and add after the `"allows any file under components/review/desk/"` test:

```ts
  it("P1C: SeniorDesk plus components/review/senior/* (§4.2)", () => {
    expect(ISLAND_DIRS).toEqual(["components/review/desk/", "components/review/senior/"]);
    expect(checkIslands(fixture({ "components/review/senior/SeniorDesk.tsx": '"use client";\nexport default 1;\n' }))).toEqual([]);
    expect(checkIslands(fixture({ "components/review/senior/X.tsx": '"use client";\nimport "@/lib/api";\n' })))
      .toEqual(["components/review/senior/X.tsx: imports @/lib/api"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/pair-machine.test.ts tests/senior-keys.test.tsx tests/senior-desk.test.tsx tests/client-islands.test.ts`
Expected: FAIL — the senior components do not exist and the allowlist has one island directory.

- [ ] **Step 3: Implement the pure parts and the copy rows**

In `web/lib/review-copy.ts`, replace `SHEET_ROWS` (Task 16's version) with:

```ts
const THIS_SHEET = "This sheet";
const SEND_IN_FIELD = "Send the report, inside the note field";
/** The shortcuts sheet rows (Board R); the first uses the reviewer's undo window. A senior also gets D (§5.14 P1C). */
export const SHEET_ROWS = (n: number, role: ReviewerRole = "pharmacist"): [string, string][] => [
  ["A", `Looks correct, then an ${n}-second undo window`], ["U", "Undo during the window"], ["R", "Report an issue"],
  ...(role === "senior" ? [["D", P1C_COPY.dismiss.sheetRow] as [string, string]] : []),
  ["J K", "Next and previous record"], ["E", "Evidence: raw DGDA row and pipeline notes"], ["S", "Open the DGDA source"],
  ["?", THIS_SHEET], ["Esc", "Close the sheet, the evidence or the note"], ["SEND", SEND_IN_FIELD],
  ["Enter", "Never approves"],
];

/** §5.17.5 senior shortcuts sheet. "SEND" is the platform's Ctrl/Cmd Enter. */
export const SENIOR_SHEET_ROWS: [string, string][] = [
  ["J K", P1C_COPY.review.sheetNext], ["M", P1C_COPY.review.sheetMark], ["R", P1C_COPY.review.sheetReport], ["?", THIS_SHEET],
  ["Esc", P1C_COPY.review.sheetClose], ["SEND", SEND_IN_FIELD], ["Enter", P1C_COPY.review.sheetEnter],
];
```

Create `web/components/review/senior/pair-machine.ts`:

```ts
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { PairDecideResult, PairOutcome, PairVersion } from "@/lib/senior-types";

/*
 * §5.17.2 outcomes as a pure reducer, one status per pair row. Decisions are sent at once (no undo window: marking
 * reviewed publishes nothing), one at a time per page, like the desk's report channel. A 409 on the content or from
 * another senior pauses the row until Reload; a lost answer leaves the row in netErr until Try again, which resends the
 * same op (same requestId and version), so the API saves it once or reports the earlier save.
 */
export type PairOp = {
  key: string; ddinterA: string; ddinterB: string; a: string; b: string; decision: "reviewed" | "issue"; note: string;
  version: PairVersion; requestId: string;
};
export type RowStatus =
  | { kind: "idle" }
  | { kind: "sending"; op: PairOp }
  | { kind: "botHold"; op: PairOp }
  | { kind: "netErr"; op: PairOp; saved: "no" | "unknown" }
  | { kind: "paused"; reason: "content" | "other" };
export type PairState = { rows: Record<string, RowStatus>; auth: "ok" | "forbidden" | "signedOut" };
export type PairEvent =
  | { type: "SEND"; op: PairOp; token: "held" | "pending" | "failed" }
  | { type: "RESULT"; key: string; result: PairDecideResult | "network" | "timeout" }
  | { type: "RETRY_OK" }
  | { type: "RETRY_FAIL" }
  | { type: "TRY_AGAIN"; key: string }
  | { type: "RELOADED"; key: string };
export type PairEffect =
  | { type: "send"; op: PairOp }
  | { type: "announce"; text: string }
  | { type: "hint"; text: string }
  | { type: "saved"; op: PairOp; outcome: PairOutcome };

const IDLE: RowStatus = { kind: "idle" };
const r = P1C_COPY.review;
export const initialPairs = (): PairState => ({ rows: {}, auth: "ok" });
export const rowStatus = (s: PairState, key: string): RowStatus => s.rows[key] ?? IDLE;
const put = (s: PairState, key: string, row: RowStatus): PairState => ({ ...s, rows: { ...s.rows, [key]: row } });
const announce = (text: string): PairEffect => ({ type: "announce", text });
/** A decision is in flight, or waits for the bot check, somewhere on the page. */
export const pairBusy = (s: PairState) => Object.values(s.rows).some((x) => x.kind === "sending" || x.kind === "botHold");

function failed(s: PairState, op: PairOp, saved: "no" | "unknown") {
  return { state: put(s, op.key, { kind: "netErr", op, saved }), effects: [announce(saved === "no"
    ? `${r.netTitle} ${DESK_NEW.deskMisc.reportFailedBody}` : `${r.unconfirmedTitle} ${r.unconfirmedBody}`)] };
}

export function pairStep(s: PairState, e: PairEvent): { state: PairState; effects: PairEffect[] } {
  switch (e.type) {
    case "SEND": {
      if (s.auth !== "ok" || rowStatus(s, e.op.key).kind !== "idle" || pairBusy(s)) return { state: s, effects: [] };
      if (e.token === "failed") return { state: put(s, e.op.key, { kind: "botHold", op: e.op }), effects: [announce(DESK.botFailedAnnounce)] };
      return { state: put(s, e.op.key, { kind: "sending", op: e.op }), effects: [{ type: "send", op: e.op }] };
    }
    case "RESULT": {
      const row = rowStatus(s, e.key);
      if (row.kind !== "sending") return { state: s, effects: [] };
      const op = row.op, res = e.result;
      if (res === "network" || res === "timeout") return failed(s, op, "unknown");
      if (res.ok) return { state: put(s, op.key, IDLE), effects: [{ type: "saved", op, outcome: res.outcome },
        announce(fill(op.decision === "reviewed" ? r.announceReviewed : r.announceIssue, { a: op.a, b: op.b }))] };
      switch (res.code) {
        case "content_changed":
        case "not_found":   // the pair or a side is no longer held: the page is out of date, as for a content change
          return { state: put(s, op.key, { kind: "paused", reason: "content" }), effects: [announce(`${r.contentTitle} ${r.contentBody}`)] };
        case "other_senior":
          return { state: put(s, op.key, { kind: "paused", reason: "other" }), effects: [announce(`${r.otherTitle} ${r.otherBody}`)] };
        case "already_reviewed":
          return { state: put(s, op.key, IDLE), effects: [{ type: "hint", text: r.alreadyReviewed }] };
        case "captcha":
          return { state: put(s, op.key, { kind: "botHold", op }), effects: [announce(DESK.botFailedAnnounce)] };
        case "forbidden":
          return { state: { ...put(s, op.key, IDLE), auth: "forbidden" }, effects: [announce(r.notAuthTitle)] };
        case "unauthenticated":
          return { state: { ...put(s, op.key, IDLE), auth: "signedOut" },
            effects: [announce(fill(DESK_NEW.sessionExpired.block, { name: `${op.a} + ${op.b}` }))] };
        case "rate_limited":
        case "invalid":
          return failed(s, op, "no");
        case "failed":
          return failed(s, op, "unknown");
      }
      return { state: s, effects: [] };
    }
    case "RETRY_OK": {
      const held = Object.values(s.rows).find((x): x is Extract<RowStatus, { kind: "botHold" }> => x.kind === "botHold");
      if (!held) return { state: s, effects: [] };
      return { state: put(s, held.op.key, { kind: "sending", op: held.op }),
        effects: [announce(DESK.botPassedAnnounce), { type: "send", op: held.op }] };
    }
    case "RETRY_FAIL":
      return { state: s, effects: [announce(DESK.botFailedAnnounce)] };
    case "TRY_AGAIN": {
      const row = rowStatus(s, e.key);
      if (row.kind !== "netErr" || pairBusy(s)) return { state: s, effects: [] };
      return { state: put(s, e.key, { kind: "sending", op: row.op }), effects: [{ type: "send", op: row.op }] };
    }
    case "RELOADED":
      return rowStatus(s, e.key).kind === "paused" ? { state: put(s, e.key, IDLE), effects: [] } : { state: s, effects: [] };
  }
}
```

Create `web/components/review/senior/keys.ts`:

```ts
/** §5.17.5 keyboard model of the senior pages, as a pure mapping (the §5.14 rules on fields, modifiers and case apply). */
export type SeniorTarget = "note" | "mark" | "field" | "other";
export type SeniorAction = "next" | "prev" | "mark" | "report" | "sheet" | "closeSheet" | "closeNote" | "sendNote" | "enterBlocked";

const LETTERS: Record<string, SeniorAction> = { j: "next", k: "prev", m: "mark", r: "report" };

export function seniorKeyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
    ctx: { singleKeys: boolean; sheetOpen: boolean; target: SeniorTarget; noteOpen: boolean }): SeniorAction | null {
  if (ctx.sheetOpen) {
    if (e.key === "Escape") return "closeSheet";
    if (e.key === "?" && ctx.singleKeys) return "closeSheet";
    return null;
  }
  if (e.key === "Enter" && ctx.target === "mark") return "enterBlocked";
  if (ctx.target === "note") {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return "sendNote";
    if (e.key === "Escape") return "closeNote";
    return null;
  }
  if (e.key === "Escape") return ctx.noteOpen ? "closeNote" : null;
  if (ctx.target === "field" || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (!ctx.singleKeys) return null;
  if (e.key === "?") return "sheet";
  return e.key.length === 1 ? LETTERS[e.key.toLowerCase()] ?? null : null;
}

export function seniorTarget(el: Element | null): SeniorTarget {
  if (!el) return "other";
  const k = el.getAttribute("data-senior");
  if (k === "note") return "note";
  if (k === "mark") return "mark";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable) return "field";
  return "other";
}
```

Create `web/components/review/senior/context.ts`:

```ts
import { createContext, useContext } from "react";
import type { PairReview, PairReviewStateName } from "@/lib/review-types";
import type { RowStatus } from "./pair-machine";

/** One row as the island sees it: its decision status, the senior's own outcome (if any) and its note panel. */
export type RowView = {
  status: RowStatus; review: PairReview | null; state: PairReviewStateName; panelOpen: boolean; note: string; noteError: boolean;
};
export type SeniorApi = {
  ready: boolean; singleKeys: boolean; auth: "ok" | "forbidden" | "signedOut"; sendKeys: string;
  row(key: string): RowView;
  mark(key: string): void; clickReport(key: string): void; closeNote(key: string, focusBack: boolean, discard: boolean): void;
  setNote(key: string, v: string): void; sendNote(key: string): void; tryAgain(key: string): void; reload(key: string): void;
};

export const SeniorCtx = createContext<SeniorApi | null>(null);
/** Null outside SeniorDesk (and before it renders): the row parts then render the server's state and no actions. */
export const useSenior = () => useContext(SeniorCtx);
```

- [ ] **Step 4: Implement the island and the row parts**

Create `web/components/review/senior/senior.module.css`:

```css
/* §5.17: the senior pages' island and its row parts. No green, no hatch, no material (§3.4 mark exclusivity). */
.region { display: flex; flex-direction: column; gap: var(--s4); outline-offset: 4px; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3); }
.hint { font-size: 13px; color: var(--fg-2); }
.turnstile { min-height: 0; }
.actions { display: flex; flex-direction: column; gap: var(--s3); }
.buttons { display: flex; flex-wrap: wrap; gap: var(--s2); }
.panel { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-1); }
.panelActs { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; align-items: center; }
.paused { font-size: 12.5px; color: var(--warn); font-weight: 500; margin-right: auto; }
```

Create `web/components/review/senior/PairStateLine.tsx`:

```tsx
"use client";
import PairReviewState from "@/components/ui/PairReviewState";
import type { PairReview } from "@/lib/review-types";
import { pairKey } from "@/lib/senior-types";
import { useSenior } from "./context";

/** §5.17.2 item 5: the server's state line, replaced in place by the outcome of the senior's own decision. */
export default function PairStateLine({ ddinterA, ddinterB, review }: { ddinterA: string; ddinterB: string; review: PairReview }) {
  const s = useSenior();
  const shown = s?.row(pairKey(ddinterA, ddinterB)).review ?? review;
  return <PairReviewState state={shown.state} at={shown.at} mine={shown.mine} note={shown.note} surface="reviewer" />;
}
```

Create `web/components/review/senior/PairActions.tsx`:

```tsx
"use client";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Kbd from "@/components/ui/Kbd";
import { DESK_NEW, NO_PHI_HELP, P1C_COPY, fill } from "@/lib/copy";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import { pairKey } from "@/lib/senior-types";
import { noteLength } from "../desk/bar-state";
import { useSenior } from "./context";
import styles from "./senior.module.css";

/**
 * §5.17.2 items 7 and 8, and the row-level outcomes: Mark reviewed (M), Report pair issue (R) with its note panel, the warn
 * banner of a 409 and the crit banner of a failed send. Nothing until the island has hydrated (§5.17.5 "No JavaScript").
 */
export default function PairActions({ ddinterA, ddinterB }: { ddinterA: string; ddinterB: string }) {
  const s = useSenior();
  if (!s || !s.ready) return null;
  const r = P1C_COPY.review;
  const key = pairKey(ddinterA, ddinterB), id = `${ddinterA}-${ddinterB}`;
  const v = s.row(key), st = v.status, k = s.singleKeys;
  const paused = st.kind === "paused";
  const sending = st.kind === "sending" ? st.op.decision : null;
  return (
    <div className={styles.actions}>
      {st.kind === "paused" && (
        <Banner tone="warn" title={st.reason === "content" ? r.contentTitle : r.otherTitle} body={st.reason === "content" ? r.contentBody : r.otherBody}
          action={<Button variant="tonal" size="sm" data-sk={`reload-${id}`} onClick={() => s.reload(key)}>{SHARED_WORDS.reload}</Button>} />
      )}
      {st.kind === "netErr" && (
        <Banner tone="crit" title={st.saved === "no" ? r.netTitle : r.unconfirmedTitle}
          body={st.saved === "no" ? DESK_NEW.deskMisc.reportFailedBody : r.unconfirmedBody}
          action={<Button variant="tonal" size="sm" busyLabel={DESK.saving} onClick={() => s.tryAgain(key)}>{DESK.tryAgain}</Button>} />
      )}
      {s.auth === "ok" && (
        <div className={styles.buttons}>
          <Button variant="primary" size="sm" data-senior="mark" data-sk={`mark-${id}`}
            aria-disabled={v.state === "reviewed" || st.kind !== "idle"} busy={sending === "reviewed"} busyLabel={DESK.saving}
            aria-keyshortcuts={k ? "M" : undefined} onClick={() => s.mark(key)}>
            {r.markReviewed}{k && <> <Kbd keys="M" /></>}
          </Button>
          <Button variant="tonal" size="sm" data-sk={`report-${id}`} aria-expanded={v.panelOpen} aria-controls={`pair-issue-${id}`}
            aria-keyshortcuts={k ? "R" : undefined} onClick={() => s.clickReport(key)}>
            {r.reportPairIssue}{k && <> <Kbd keys="R" /></>}
          </Button>
        </div>
      )}
      {v.panelOpen && s.auth === "ok" && (
        <div className={styles.panel} id={`pair-issue-${id}`}>
          <Field id={`pair-note-${id}`} label={r.noteLabel}
            control={<textarea className="textarea" maxLength={1000} placeholder={r.notePlaceholder} value={v.note} data-senior="note"
              data-pair={key} onChange={(e) => s.setNote(key, e.target.value)} />}
            help={<>{!v.noteError && `${DESK.noteHelp} `}{NO_PHI_HELP}</>}
            error={v.noteError ? r.noteError : undefined}
            counter={fill(DESK.noteCount, { len: noteLength(v.note) })} />
          <div className={styles.panelActs}>
            {paused && <span className={styles.paused}>{DESK.reportPaused}</span>}
            <Button variant="tonal" size="sm" onClick={() => s.closeNote(key, true, true)}>{DESK.cancel} <Kbd keys="Esc" /></Button>
            <Button variant="primary" size="sm" aria-disabled={paused} busy={sending === "issue"} busyLabel={DESK.sending}
              onClick={() => s.sendNote(key)}>{DESK.sendReport} <Kbd keys={s.sendKeys} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Create `web/components/review/senior/SeniorSheet.tsx`:

```tsx
"use client";
import { Fragment, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import Button from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import { DESK, SENIOR_SHEET_ROWS } from "@/lib/review-copy";

/** §5.17.5 shortcuts sheet: a modal dialog whose one control is Close, so Tab stays on it. */
export default function SeniorSheet({ open, onClose, sendKeys }: { open: boolean; onClose: () => void; sendKeys: string }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) sheet.current?.querySelector<HTMLElement>('[data-sk="sheet-close"]')?.focus();
  }, [open]);
  if (!open) return null;
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    sheet.current?.querySelector<HTMLElement>('[data-sk="sheet-close"]')?.focus();
  };
  const scrim = (e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } };
  return (
    <div className="sheet-scrim" onMouseDown={scrim}>
      <div className="sheet" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="senior-sheet-h" aria-describedby="senior-sheet-note"
        tabIndex={-1} onKeyDown={trap}>
        <div className="sheet-h"><h2 id="senior-sheet-h">{DESK.sheetTitle}</h2>
          <Button variant="plain" size="sm" data-sk="sheet-close" onClick={onClose}>{DESK.close} <Kbd keys="Esc" /></Button></div>
        <p className="sheet-note" id="senior-sheet-note">{DESK.sheetNote}</p>
        <dl>
          {SENIOR_SHEET_ROWS.map(([k, text]) => (
            <Fragment key={text}>
              <dt>{(k === "SEND" ? [sendKeys] : k.split(" ")).map((x) => <Kbd key={x} keys={x} />)}</dt>
              <dd>{text}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
```

Create `web/components/review/senior/SeniorDesk.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import TurnstileField from "@/components/TurnstileField";
import Banner from "@/components/ui/Banner";
import BotCheck from "@/components/ui/BotCheck";
import Button from "@/components/ui/Button";
import { DESK_NEW, P1C_COPY } from "@/lib/copy";
import { DESK_SETTINGS_EVENT } from "@/lib/desk-settings";
import { announce as announceTo } from "@/lib/live-region";
import { DESK } from "@/lib/review-copy";
import type { PairReview } from "@/lib/review-types";
import { logSeniorOpen, pairDecide } from "@/lib/senior-actions";
import { pairKey, type PairDecideResult, type PairOutcome, type PairRef, type PairVersion } from "@/lib/senior-types";
import { NOTE_MIN, noteLength } from "../desk/bar-state";
import { loadDraftAt, pairDraftKey, saveDraftAt } from "../desk/drafts";
import { signInHref } from "../desk/hrefs";
import { IS_MAC_RE } from "../desk/keys";
import { SeniorCtx, type RowView, type SeniorApi } from "./context";
import { seniorKeyAction, seniorTarget } from "./keys";
import { initialPairs, pairBusy, pairStep, rowStatus, type PairEffect, type PairEvent, type PairOp, type PairState } from "./pair-machine";
import SeniorSheet from "./SeniorSheet";
import styles from "./senior.module.css";

export type SeniorDeskProps = {
  role: "senior"; kind: "queue" | "substance"; target: { type: "pair_queue" | "substance"; id: string }; pairs: PairRef[];
  singleKeys: boolean; siteKey: string | null; nonce?: string; children: ReactNode;
};

const TOKEN_WAIT_MS = 10_000, TOKEN_MAX_AGE_MS = 270_000;
type Panel = { open: boolean; note: string; error: boolean };
const CLOSED: Panel = { open: false, note: "", error: false };
const rowId = (p: { ddinterA: string; ddinterB: string }) => `pair-${p.ddinterA}-${p.ddinterB}`;

/**
 * Island (§4.2): the keyboard model of the senior pages (J, K, M, R, ?, Esc), pair decisions with Turnstile and a
 * requestId, the pair-issue drafts, row-level 409 banners and the page's one polite live region. Its props carry ids,
 * versions and states only: the rows (clinical text, notes) are server-rendered children.
 */
export default function SeniorDesk(props: SeniorDeskProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const cancelLive = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [singleKeys, setSingleKeys] = useState(props.singleKeys);
  const [machine, setMachine] = useState<PairState>(initialPairs);
  const m = useRef(machine);
  const [current, setCurrent] = useState(-1);
  const [overrides, setOverrides] = useState<Record<string, { review: PairReview; version: PairVersion }>>({});
  const overridesRef = useRef(overrides);
  const [panels, setPanels] = useState<Record<string, Panel>>({});
  const panelsRef = useRef(panels);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetReturn = useRef<Element | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  const token = useRef<{ value: string; at: number } | null>(null);
  const waiters = useRef<{ resolve: (t: string | null) => void; timer: number }[]>([]);
  const retrying = useRef(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [botState, setBotState] = useState<"checking" | "passed" | "failed">(props.siteKey ? "checking" : "failed");
  const [focusReq, setFocusReq] = useState<{ sel: string; n: number } | null>(null);
  const pairs = props.pairs;

  // ---- helpers
  const announce = (text: string) => { cancelLive.current(); cancelLive.current = announceTo(liveRef.current, text); };
  const showHint = (text: string) => {
    setHint(text);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 5000);
    announce(text);
  };
  const focus = (sel: string) => setFocusReq((f) => ({ sel, n: (f?.n ?? 0) + 1 }));
  const refOf = (key: string) => pairs.find((p) => pairKey(p.ddinterA, p.ddinterB) === key) ?? null;
  const stateOf = (key: string) => overridesRef.current[key]?.review.state ?? refOf(key)?.state ?? "not_reviewed";
  const versionOf = (ref: PairRef) => overridesRef.current[pairKey(ref.ddinterA, ref.ddinterB)]?.version ?? ref.version;
  const panelOf = (key: string) => panelsRef.current[key] ?? CLOSED;
  const setPanel = (key: string, p: Partial<Panel>) => {
    panelsRef.current = { ...panelsRef.current, [key]: { ...panelOf(key), ...p } };
    setPanels(panelsRef.current);
  };
  const currentKey = () => {
    const ref = pairs[Math.max(current, 0)];
    return ref ? pairKey(ref.ddinterA, ref.ddinterB) : null;
  };

  // ---- the machine
  function fire(e: PairEvent) {
    const r = pairStep(m.current, e);
    m.current = r.state;
    setMachine(r.state);
    for (const fx of r.effects) effect(fx);
  }
  function effect(fx: PairEffect) {
    if (fx.type === "send") void send(fx.op);
    else if (fx.type === "announce") announce(fx.text);
    else if (fx.type === "hint") showHint(fx.text);
    else onSaved(fx.op, fx.outcome);
  }
  /** The row stays in place and in order (§5.17.2 "Outcomes"): its state line and version change, nothing is refetched. */
  function onSaved(op: PairOp, outcome: PairOutcome) {
    overridesRef.current = { ...overridesRef.current, [op.key]: { review: outcome.review, version: outcome.version } };
    setOverrides(overridesRef.current);
    if (op.decision === "issue") {
      saveDraftAt(pairDraftKey(op.ddinterA, op.ddinterB), "");
      setPanel(op.key, CLOSED);
      focus(`[data-sk="report-${op.ddinterA}-${op.ddinterB}"]`);
    }
  }

  // ---- Turnstile (§5.8.5, §5.17.5): one widget per page, a single-use token per send, at most 10 s to get one
  function freshToken(): Promise<string | null> {
    const held = token.current;
    if (held && performance.now() - held.at < TOKEN_MAX_AGE_MS) { token.current = null; return Promise.resolve(held.value); }
    token.current = null;
    setResetKey((k) => k + 1);
    setBotState("checking");
    return new Promise((resolve) => {
      const w = { resolve, timer: window.setTimeout(() => { waiters.current = waiters.current.filter((x) => x !== w); resolve(null); }, TOKEN_WAIT_MS) };
      waiters.current.push(w);
    });
  }
  function onToken(t: string | null) {
    if (t === null) { token.current = null; setBotState((s) => (s === "failed" ? s : "checking")); return; }
    const w = waiters.current.shift();
    if (w) { window.clearTimeout(w.timer); w.resolve(t); setBotState("passed"); return; }
    setBotState("passed");
    token.current = { value: t, at: performance.now() };
    if (retrying.current) { retrying.current = false; setRetryBusy(false); fire({ type: "RETRY_OK" }); }
  }
  function onWidgetError() {
    token.current = null;
    setBotState("failed");
    const ws = waiters.current;
    waiters.current = [];
    for (const w of ws) { window.clearTimeout(w.timer); w.resolve(null); }
    if (retrying.current) { retrying.current = false; setRetryBusy(false); fire({ type: "RETRY_FAIL" }); }
  }
  async function send(op: PairOp) {
    const t = await freshToken();
    if (t === null) { fire({ type: "RESULT", key: op.key, result: { ok: false, code: "captcha" } }); return; }
    let timer: number | undefined;
    const timeout = new Promise<"timeout">((resolve) => { timer = window.setTimeout(() => resolve("timeout"), TOKEN_WAIT_MS); });
    let result: PairDecideResult | "network" | "timeout";
    try {
      result = await Promise.race([pairDecide({ ddinterA: op.ddinterA, ddinterB: op.ddinterB, decision: op.decision, note: op.note,
        expectedContentHash: op.version.contentHash, expectedLastPairReviewId: op.version.lastPairReviewId, requestId: op.requestId,
        turnstileToken: t }), timeout]);
    } catch {
      result = "network";
    } finally {
      window.clearTimeout(timer);
    }
    setResetKey((k) => k + 1);   // a token is single-use
    setBotState((s) => (s === "failed" ? s : "checking"));
    fire({ type: "RESULT", key: op.key, result });
  }
  const tokenState = () => (token.current ? "held" : botState === "failed" ? "failed" : "pending") as "held" | "pending" | "failed";
  const newOp = (ref: PairRef, decision: "reviewed" | "issue", note: string): PairOp => ({
    key: pairKey(ref.ddinterA, ref.ddinterB), ddinterA: ref.ddinterA, ddinterB: ref.ddinterB, a: ref.nameA, b: ref.nameB,
    decision, note, version: versionOf(ref), requestId: crypto.randomUUID() });

  /** Why no decision may start on this row now (§5.17.2 outcomes, §5.8.2 handling), or null. */
  function blocked(key: string): string | null {
    const s = m.current, st = rowStatus(s, key);
    if (s.auth === "forbidden") return P1C_COPY.review.notAuthTitle;
    if (s.auth === "signedOut") return DESK_NEW.sessionExpired.hint;
    if (st.kind === "paused") return st.reason === "content" ? P1C_COPY.review.contentTitle : P1C_COPY.review.otherTitle;
    if (st.kind === "netErr") return st.saved === "no" ? DESK.notSavedHint : DESK_NEW.decisionUnconfirmed.hint;
    if (Object.values(s.rows).some((x) => x.kind === "botHold")) return DESK.botFirst;
    return null;
  }

  // ---- actions
  function mark(key: string) {
    const ref = refOf(key);
    if (!ref) return;
    const why = blocked(key);
    if (why) { showHint(why); return; }
    if (stateOf(key) === "reviewed") { showHint(P1C_COPY.review.alreadyReviewed); return; }
    if (pairBusy(m.current)) return;
    fire({ type: "SEND", op: newOp(ref, "reviewed", ""), token: tokenState() });
  }
  function openNote(key: string) {
    const ref = refOf(key);
    if (!ref) return;
    if (m.current.auth !== "ok") { showHint(blocked(key)!); return; }
    if (!panelOf(key).open) setPanel(key, { open: true, note: loadDraftAt(pairDraftKey(ref.ddinterA, ref.ddinterB)), error: false });
    focus(`#pair-note-${ref.ddinterA}-${ref.ddinterB}`);
  }
  function closeNote(key: string, focusBack: boolean, discard: boolean) {
    const ref = refOf(key);
    if (!ref) return;
    if (discard) { saveDraftAt(pairDraftKey(ref.ddinterA, ref.ddinterB), ""); setPanel(key, CLOSED); }
    else setPanel(key, { open: false, error: false });
    if (focusBack) focus(`[data-sk="report-${ref.ddinterA}-${ref.ddinterB}"]`);
  }
  function setNote(key: string, v: string) {
    const ref = refOf(key);
    if (!ref) return;
    saveDraftAt(pairDraftKey(ref.ddinterA, ref.ddinterB), v);
    setPanel(key, noteLength(v) >= NOTE_MIN ? { note: v, error: false } : { note: v });
  }
  function sendNote(key: string) {
    const ref = refOf(key);
    if (!ref) return;
    if (rowStatus(m.current, key).kind === "paused") { showHint(DESK.reportPaused); return; }
    const why = blocked(key);
    if (why) { showHint(why); return; }
    const note = panelOf(key).note;
    if (noteLength(note) < NOTE_MIN) {
      setPanel(key, { error: true });
      announce(P1C_COPY.review.noteError);
      focus(`#pair-note-${ref.ddinterA}-${ref.ddinterB}`);
      return;
    }
    if (pairBusy(m.current)) return;
    fire({ type: "SEND", op: newOp(ref, "issue", note.trim()), token: tokenState() });
  }
  /** Reload (§5.17.2 409 banners): the latest pair from the server, and the row's decisions resume. The draft stays. */
  function reload(key: string) {
    const { [key]: _gone, ...rest } = overridesRef.current;
    overridesRef.current = rest;
    setOverrides(rest);
    fire({ type: "RELOADED", key });
    router.refresh();
  }
  function move(delta: 1 | -1) {
    if (pairs.length === 0) return;
    const at = current + delta;
    if (at >= pairs.length) { showHint(P1C_COPY.review.lastPair); return; }
    if (at < 0) { showHint(P1C_COPY.review.firstPair); return; }
    setCurrent(at);
    focus(`#${rowId(pairs[at])}-h`);
  }
  function closeSheet() {
    setSheetOpen(false);
    const r = sheetReturn.current;
    sheetReturn.current = null;
    if (r instanceof HTMLElement) r.focus(); else root.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const key = currentKey();
    const action = seniorKeyAction(e, { singleKeys, sheetOpen, target: seniorTarget(t), noteOpen: key ? panelOf(key).open : false });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "next": move(1); break;
      case "prev": move(-1); break;
      case "mark": if (key) mark(key); break;
      case "report": if (key) openNote(key); break;
      case "sheet": sheetReturn.current = document.activeElement; setSheetOpen(true); break;
      case "closeSheet": closeSheet(); break;
      case "closeNote": { const k = t.getAttribute("data-pair") ?? key; if (k) closeNote(k, true, false); break; }
      case "sendNote": { const k = t.getAttribute("data-pair"); if (k) sendNote(k); break; }
      case "enterBlocked": showHint(P1C_COPY.review.enterBlocked); break;
    }
  }
  /** Tab or a click into a row makes it the current one, so M and R act where the senior is. */
  function onFocusIn(e: FocusEvent<HTMLDivElement>) {
    const article = (e.target as Element).closest?.("article.pair-row");
    if (!article) return;
    const at = pairs.findIndex((p) => rowId(p) === article.id);
    if (at >= 0 && at !== current) setCurrent(at);
  }

  // ---- effects
  useEffect(() => { setReady(true); void logSeniorOpen(props.target.type, props.target.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focusReq) return;
    document.querySelector<HTMLElement>(focusReq.sel)?.focus();
  }, [focusReq]);
  useEffect(() => {
    root.current?.querySelectorAll("article.pair-row[aria-current]").forEach((el) => el.removeAttribute("aria-current"));
    if (current >= 0 && pairs[current]) document.getElementById(rowId(pairs[current]))?.setAttribute("aria-current", "true");
  }, [current, pairs]);
  useEffect(() => {
    const onSettings = (e: globalThis.Event) => {
      const d = (e as CustomEvent<{ keys?: "on" | "off" }>).detail ?? {};
      if (d.keys) setSingleKeys(d.keys === "on");
    };
    window.addEventListener(DESK_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(DESK_SETTINGS_EVENT, onSettings);
  }, []);

  // ---- render
  const sendKeys = ready && IS_MAC_RE.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘ Enter" : "Ctrl Enter";
  const api: SeniorApi = {
    ready, singleKeys, auth: machine.auth, sendKeys,
    row: (key): RowView => {
      const p = panels[key] ?? CLOSED;
      return { status: rowStatus(machine, key), review: overrides[key]?.review ?? null,
        state: overrides[key]?.review.state ?? refOf(key)?.state ?? "not_reviewed", panelOpen: p.open, note: p.note, noteError: p.error };
    },
    mark, clickReport: (key) => (panelOf(key).open ? setPanel(key, { open: false }) : openNote(key)), closeNote, setNote, sendNote,
    tryAgain: (key) => fire({ type: "TRY_AGAIN", key }), reload,
  };
  const r = P1C_COPY.review;
  const botHold = Object.values(machine.rows).some((x) => x.kind === "botHold");
  const here = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/review/pairs";
  return (
    <SeniorCtx.Provider value={api}>
      <div className={styles.region} id="senior" role="region" tabIndex={0} aria-label={singleKeys ? r.regionLabel : r.regionPlain}
        ref={root} onKeyDown={onKeyDown} onFocus={onFocusIn}>
        {machine.auth === "signedOut" && (
          <Banner tone="info" title={DESK_NEW.sessionExpired.hint} body={<a href={signInHref(here)}>{DESK_NEW.sessionExpired.signInAgain}</a>} />
        )}
        {machine.auth === "forbidden" && <Banner tone="info" title={r.notAuthTitle} body={r.notAuthBody} />}
        {ready && (
          <div className={styles.bar}>
            <BotCheck state={botState} />
            {botHold && <>
              <p className="field-error">{DESK.botError}</p>
              <Button variant="tonal" size="sm" busy={retryBusy} busyLabel={DESK.checking} onClick={() => {
                retrying.current = true; setRetryBusy(true); token.current = null; setBotState("checking"); setResetKey((k) => k + 1);
              }}>{DESK.retryCheck}</Button>
            </>}
          </div>
        )}
        <div inert={sheetOpen || undefined}>{props.children}</div>
        <p className={styles.hint} data-senior="hint" hidden={!hint}>{hint}</p>
        <SeniorSheet open={sheetOpen} onClose={closeSheet} sendKeys={sendKeys} />
        {props.siteKey && (
          <div className={styles.turnstile}>
            <TurnstileField siteKey={props.siteKey} action="decision" nonce={props.nonce} resetKey={resetKey} appearance="interaction-only"
              refreshExpired="auto" hideStatus onToken={onToken} onError={onWidgetError} />
          </div>
        )}
        {/* No React children: lib/live-region's announce() owns this node's text. The page's one polite region (§10.2). */}
        <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" data-senior="live" />
      </div>
    </SeniorCtx.Provider>
  );
}
```

In `web/scripts/check-client-islands.mjs`, change `ISLAND_DIRS` to:

```js
/** "ReviewDesk.tsx plus components/review/desk/*" and, P1C, "SeniorDesk.tsx plus components/review/senior/*" (§4.2). */
export const ISLAND_DIRS = ["components/review/desk/", "components/review/senior/"];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/pair-machine.test.ts tests/senior-keys.test.tsx tests/senior-desk.test.tsx tests/client-islands.test.ts tests/desk-settings.test.ts tests/p1c-copy.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/review/senior/ web/lib/review-copy.ts web/scripts/check-client-islands.mjs \
  web/tests/senior-harness.tsx web/tests/pair-machine.test.ts web/tests/senior-keys.test.tsx web/tests/senior-desk.test.tsx \
  web/tests/client-islands.test.ts
git commit -m "feat(web): the SeniorDesk island: J K M R ?, pair decisions with Turnstile, row banners and drafts (§4.2, §5.17)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: The three senior pages — pair queue, substances, substance page (§2.1, §5.17)

Server-rendered, one column of at most 960 px under the reviewer toolbar, with the `SeniorDesk` island around the pair rows (Task 22). There is no `loading.tsx`: P1B's `tests/review-no-streaming.test.ts` forbids one under `app/review` (a streamed page shows only its skeleton without JavaScript, §4.4), and every filter and page link here is a document navigation, so §5.17.5's loading state has no in-page moment to show; its string stays pinned for a later in-island transition (recorded as a spec gap).

**Files:**
- Create: `web/components/review/senior/SeniorShell.tsx`, `web/components/review/senior/PairRow.tsx`, `web/components/review/senior/PairList.tsx`, `web/components/review/senior/PairFilters.tsx`, `web/components/review/senior/pages.module.css`
- Create: `web/app/review/pairs/page.tsx`, `web/app/review/substances/page.tsx`, `web/app/review/substances/[bdsId]/page.tsx`, `web/app/review/substances/[bdsId]/not-found.tsx`
- Modify: `web/app/review/error.tsx`, `web/lib/request-log.ts`
- Test: `web/tests/fixtures/senior.ts` (create), `web/tests/senior-pages.test.tsx` (create), `web/tests/review-error.test.tsx`, `web/tests/request-log.test.ts`

**Interfaces:**
- Consumes: Task 21's API reads, `senior-params`, `senior-types`; Task 22's `SeniorDesk`, `PairActions`, `PairStateLine`; Task 17's `PairText`, `SourceOf`, `SEVERITY_LABEL`, `CodeChip` with `source`; Task 14's `isReviewer`; P1B's `ReviewToolbar` (its `center` slot), `ReviewStatus`, `NoDataBlock`, `NoDataChip`.
- Produces: `PairRow({ p, heading: "h2" | "h3" })` (the §5.17.2 row, shared by both pages); `PairList` (range, rows inside SeniorDesk, paging, empty state, the `<noscript>` line); `SeniorShell` and `NotSenior`; the three routes, open with data to `senior` only (pharmacists and engineers: status 200 and the info banner, no API call); `app/review/error.tsx` shows "Couldn't load senior review." on `/review/pairs` and `/review/substances/*`; request-log templates `/review/pairs`, `/review/substances`, `/review/substances/[bdsId]`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/fixtures/senior.ts`:

```ts
import type { PairView, PairsPage, SubstanceDetail } from "@/lib/senior-types";

export const HASH = "a".repeat(64);
const FETCHED = "2026-10-11T19:00:00Z";

/** Warfarin + Acetylsalicylic acid as the API's PairView carries it (the pilot's Major pair, §1.5). */
export function pairView(over: Partial<PairView> = {}): PairView {
  return {
    ddinterA: "DDInter1951", ddinterB: "DDInter20",
    substanceA: { bdsId: "BDS-000003", name: "Warfarin" }, substanceB: { bdsId: "BDS-000004", name: "Acetylsalicylic acid" },
    entryA: { name: "Warfarin", routeScope: "systemic",
      source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: FETCHED } },
    entryB: { name: "Acetylsalicylic acid", routeScope: "systemic",
      source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter20/", label: "DDInter 2.0", fetchedAt: FETCHED } },
    severity: "major", actions: ["synergy"], interaction: "Aspirin may increase the risk of bleeding.", management: "Avoid the combination.",
    source: { url: "https://ddinter2.scbdd.com/server/interact/3039/", label: "Full record in DDInter 2.0", fetchedAt: null },
    applies: true,
    brands: [
      { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", batchId: "0001-pilot", displayStatus: "approved", side: "a" },
      { conceptId: "076-0028-006--aspirin", tradeName: "Aspirin", batchId: "e2e-p1c", displayStatus: "pending", side: "b" },
    ],
    brandCounts: { a: 1, b: 1, batches: 2 },
    review: { state: "not_reviewed", at: null, mine: false, note: null }, changes: [], history: [],
    version: { contentHash: HASH, lastPairReviewId: null }, ...over,
  };
}

export const pairsPage = (items: PairView[], over: Partial<PairsPage> = {}): PairsPage => ({
  total: items.length, counts: { todo: items.length, changed: 0, issue: 0, reviewed: 0, all: items.length }, items, ...over });

export function substanceDetail(over: Partial<SubstanceDetail> = {}): SubstanceDetail {
  return {
    bdsId: "BDS-000003", name: "Warfarin",
    names: [{ name: "Warfarin", type: "icd11", source: "dgda-ocl" }, { name: "warfarin", type: "rxnorm", source: "rxnav" }],
    codes: [
      { system: "RXCUI", code: "11289", routeScope: "any", method: "rxnav-exact", confidence: 1,
        source: { url: "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=11289", label: "RxNav", fetchedAt: FETCHED } },
      { system: "DDINTER", code: "DDInter1951", routeScope: "systemic", method: "drugbank", confidence: 1,
        source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: FETCHED } },
    ],
    coverage: "full",
    entries: [{ ddinterId: "DDInter1951", name: "Warfarin", routeScope: "systemic",
      counts: { major: 120, moderate: 300, minor: 20, unknown: 60, total: 500 }, diseaseCount: 12, foodCount: 7,
      source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: FETCHED } }],
    brands: [
      { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", batchId: "0001-pilot", displayStatus: "approved",
        clinicalDrug: { bdcId: "BDC-000003", displayName: "Warfarin 5 mg tablet", route: "systemic" }, strengthText: "5 mg",
        chosen: [{ ddinterId: "DDInter1951", routeScope: "systemic", routeAssumed: false }], reason: null },
      { conceptId: "900-0001-001--warin", tradeName: "Warin", batchId: "e2e-p1c", displayStatus: "pending",
        clinicalDrug: { bdcId: "BDC-000020", displayName: "Warfarin 2 mg tablet", route: "systemic" }, strengthText: "2 mg",
        chosen: [{ ddinterId: "DDInter1951", routeScope: "systemic", routeAssumed: false }], reason: null },
    ],
    pairs: { total: 1, items: [pairView()] }, ...over,
  };
}
```

Create `web/tests/senior-pages.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairView, pairsPage, substanceDetail } from "./fixtures/senior";

const getSession = vi.fn();
const getPairQueue = vi.fn();
const listSeniorSubstances = vi.fn();
const getSeniorSubstance = vi.fn();
const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ getPairQueue: (...a: unknown[]) => getPairQueue(...a), listSeniorSubstances: (...a: unknown[]) => listSeniorSubstances(...a),
  getSeniorSubstance: (...a: unknown[]) => getSeniorSubstance(...a) }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: vi.fn(), logSeniorOpen: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/TurnstileField", () => ({ default: () => null }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ notFound: () => notFound(), redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));

import PairQueuePage from "@/app/review/pairs/page";
import SubstancesPage from "@/app/review/substances/page";
import SubstancePage from "@/app/review/substances/[bdsId]/page";

const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const queue = async (o: Record<string, string> = {}) => renderToStaticMarkup(await PairQueuePage({ searchParams: sp(o) }));
const substancePage = async (o: Record<string, string> = {}, bdsId = "BDS-000003") =>
  renderToStaticMarkup(await SubstancePage({ params: Promise.resolve({ bdsId }), searchParams: sp(o) }));
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

beforeEach(() => {
  for (const f of [getSession, getPairQueue, listSeniorSubstances, getSeniorSubstance, notFound]) f.mockClear();
  getSession.mockResolvedValue(SENIOR);
  getPairQueue.mockResolvedValue(pairsPage([pairView()]));
  getSeniorSubstance.mockResolvedValue(substanceDetail());
  listSeniorSubstances.mockResolvedValue({ total: 1, items: [{ bdsId: "BDS-000003", name: "Warfarin", brands: 2, batches: 2, pairsToReview: 5, majorPairsToReview: 2 }] });
});

describe("access (§5.17: role senior only)", () => {
  it.each(["pharmacist", "engineer"])("a %s gets status 200, the info banner and no data", async (role) => {
    getSession.mockResolvedValue({ ...SENIOR, role });
    for (const html of [await queue(), renderToStaticMarkup(await SubstancesPage({ searchParams: sp() })), await substancePage()]) {
      expect(html).toContain("Senior review is for senior pharmacists.");
      expect(html).toContain("Your account reviews batches. Ask the IntelliDrugs team if you need senior access.");
      expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/review">Open the review desk</a>');
      expect(html).not.toContain("pair-row");
    }
    expect(getPairQueue).not.toHaveBeenCalled();
    expect(listSeniorSubstances).not.toHaveBeenCalled();
    expect(getSeniorSubstance).not.toHaveBeenCalled();
  });
});

describe("the pair queue (§5.17.1, §5.17.2)", () => {
  it("reads every batch with the defaults and the viewer; the toolbar, the nav and the filters", async () => {
    const html = await queue();
    expect(getPairQueue).toHaveBeenCalledWith({ show: "todo", pairs: "all", severity: null, page: 0 }, "senior@e2e.test");
    expect(html).toContain("<h1>Pair queue</h1>");
    expect(html).toContain("Every DDInter 2.0 pair between substances we hold, from all batches. Major first.");
    expect(strip(html)).toContain("Senior review1 pair to review");
    expect(html).toContain('<nav class="nav" aria-label="Senior review"><a href="/review/pairs" aria-current="page">Pair queue</a><a href="/review/substances">Substances</a></nav>');
    expect(html).toContain('<a class="filter" href="/review/pairs" aria-current="true">To review<span class="filter-n">1</span></a>');
    expect(html).toContain('<a class="filter" href="/review/pairs?show=issue">Issue reported<span class="filter-n">0</span></a>');
    expect(html).toContain('<a href="/review/pairs?pairs=applies">Applies to our brands</a>');
    expect(html).toContain('<a href="/review/pairs?severity=unknown">Severity not classified by DDInter</a>');
    expect(html).toContain("1–1 of 1 pairs");
    expect(html).toContain("Reviewing pairs needs JavaScript for the bot check.");
  });

  it("a pair row: heading with substance links, FROM_DDINTER and entry links, text, pair link, state line; no action without JavaScript", async () => {
    const html = await queue();
    expect(html).toContain('<article class="pair-row row" id="pair-DDInter1951-DDInter20" aria-labelledby="pair-DDInter1951-DDInter20-h"');
    expect(html).toContain('<h2 class="rowTitle" id="pair-DDInter1951-DDInter20-h" tabindex="-1"><a href="/review/substances/BDS-000003">Warfarin</a> + <a href="/review/substances/BDS-000004">Acetylsalicylic acid</a></h2>');
    expect(strip(html)).toContain("From DDInter 2.0. DDInter1951 DDInter 2.0 (opens in a new tab) fetched on 12/10/2026 Warfarin (systemic) + DDInter20");
    expect(html).toContain("Avoid the combination.");
    expect(html).toContain('href="https://ddinter2.scbdd.com/server/interact/3039/"');
    expect(html).toContain('<p class="pair-review">Pair not yet reviewed by a senior pharmacist</p>');
    expect(html).not.toContain("Mark reviewed");
    expect(strip(html)).toContain("1 brand of Warfarin and 1 brand of Acetylsalicylic acid, in 2 batches.");
    expect(html).toContain('<a href="/review/0001-pilot/185-0138-012--g-warfarin">G Warfarin (batch <span class="mono">0001-pilot</span>)</a>');
    expect(html).not.toContain("banner--warn");
  });

  it("a pair that does not apply: one plain line, never a warning tone; either id when neither side is chosen", async () => {
    getPairQueue.mockResolvedValue(pairsPage([pairView({ applies: false, brands: [pairView().brands[1]], brandCounts: { a: 0, b: 1, batches: 1 } })]));
    let html = await queue();
    expect(html).toContain('Does not apply to the medicines we hold: none of them is checked against <span class="mono">DDInter1951</span> for its route.');
    expect(html).not.toMatch(/banner--warn|stage--warn|hatch/);
    getPairQueue.mockResolvedValue(pairsPage([pairView({ applies: false, brands: [], brandCounts: { a: 0, b: 0, batches: 0 } })]));
    html = await queue();
    expect(html).toContain('checked against <span class="mono">DDInter1951</span> or <span class="mono">DDInter20</span> for its route.');
  });

  it("more than 10 brands on a side: and {n} more. and the link to every brand of that substance", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ conceptId: `c${i}`, tradeName: `Warin ${i}`, batchId: "e2e-p1c",
      displayStatus: "pending" as const, side: "a" as const }));
    getPairQueue.mockResolvedValue(pairsPage([pairView({ brands: [...many, pairView().brands[1]], brandCounts: { a: 13, b: 1, batches: 2 } })]));
    const html = await queue();
    expect(strip(html)).toContain("13 brands of Warfarin and 1 brand of Acetylsalicylic acid, in 2 batches.");
    expect(strip(html)).toContain("and 3 more.");
    expect(html).toContain('<a href="/review/substances/BDS-000003">All brands of Warfarin</a>');
  });

  it("changed: the reviewer line and What changed in DDInter; history oldest first with (you) and the changed-after line", async () => {
    getPairQueue.mockResolvedValue(pairsPage([pairView({
      review: { state: "changed", at: "2026-10-14T03:00:00Z", mine: false, note: null },
      changes: [{ field: "Severity", atReview: "moderate", now: "major" }],
      history: [{ decision: "reviewed", at: "2026-10-14T03:00:00Z", note: null, mine: true, changedAfter: true },
        { decision: "issue", at: "2026-10-14T04:00:00Z", note: "text contradicts the severity", mine: false, changedAfter: false }] })]));
    const html = await queue();
    expect(html).toContain("Pair changed in DDInter after a senior pharmacist reviewed it on 14/10/2026.");
    expect(html).toContain("<summary>What changed in DDInter</summary>");
    expect(html).toContain('<th scope="col">At review</th><th scope="col">Now</th>');
    expect(html).toContain('<tr><th scope="row">Severity</th><td>moderate</td><td>major</td></tr>');
    expect(html).toContain("<summary>Pair history</summary>");
    expect(strip(html)).toContain("Reviewed by a senior pharmacist (you)DDInter data changed after this review");
    expect(strip(html)).toContain("Issue reported by a senior pharmacist. Note: text contradicts the severity");
    expect(html).not.toContain("@");
  });

  it.each([
    ["todo", "No pairs to review."], ["changed", "No pair changed in DDInter since its review."], ["issue", "No pair issues reported."],
    ["reviewed", "No pairs reviewed yet."], ["all", "No pairs between the substances we hold."],
  ])("empty %s: its sentence and Show all pairs", async (show, text) => {
    getPairQueue.mockResolvedValue(pairsPage([], { counts: { todo: 0, changed: 0, issue: 0, reviewed: 0, all: 0 } }));
    const html = await queue({ show });
    expect(html).toContain(text);
    expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/review/pairs?show=all">Show all pairs</a>');
  });

  it("a page past the end shows Previous page, not the empty copy (Review Focus 5)", async () => {
    getPairQueue.mockResolvedValue(pairsPage([], { total: 31, counts: { todo: 31, changed: 0, issue: 0, reviewed: 0, all: 31 } }));
    const html = await queue({ page: "40" });
    expect(getPairQueue).toHaveBeenCalledWith({ show: "todo", pairs: "all", severity: null, page: 40 }, "senior@e2e.test");
    expect(html).toContain('<a href="/review/pairs">Previous page</a>');
    expect(html).not.toContain("No pairs to review.");
    expect(html).not.toContain("Show all pairs");
  });

  it("unknown filters fall back to the defaults (Review Focus 5)", async () => {
    await queue({ show: "bogus", severity: "urgent", pairs: "x", page: "-3" });
    expect(getPairQueue).toHaveBeenCalledWith({ show: "todo", pairs: "all", severity: null, page: 0 }, "senior@e2e.test");
  });

  it("51 pairs: Next page from the first page, Previous page from the second", async () => {
    const items = Array.from({ length: 50 }, (_, i) => pairView({ ddinterA: `DDInter${100 + i}`, ddinterB: "DDInter999" }));
    getPairQueue.mockResolvedValue(pairsPage(items, { total: 51 }));
    let html = await queue();
    expect(html).toContain("1–50 of 51 pairs");
    expect(html).toContain('<a href="/review/pairs?page=1">Next page</a>');
    getPairQueue.mockResolvedValue(pairsPage([pairView()], { total: 51 }));
    html = await queue({ page: "1" });
    expect(html).toContain("51–51 of 51 pairs");
    expect(html).toContain('<a href="/review/pairs">Previous page</a>');
  });
});

describe("substances (§5.17.3)", () => {
  it("the list: filter, table with its caption and columns, linked names", async () => {
    const html = renderToStaticMarkup(await SubstancesPage({ searchParams: sp({ q: " war " }) }));
    expect(listSeniorSubstances).toHaveBeenCalledWith("war", 0);
    expect(html).toContain("<h1>Substances</h1>");
    expect(html).toContain('<label class="sr-only" for="sub-q">Filter substances by name or BDS id</label>');
    expect(html).toContain('placeholder="Filter by name or BDS id"');
    expect(html).toContain('<caption class="sr-only">Substances we hold</caption>');
    expect(strip(html)).toContain("SubstanceBDS idBrandsBatchesPairs to reviewMajor pairs to review");
    expect(html).toContain('<a href="/review/substances/BDS-000003">Warfarin</a>');
  });
  it("no match: the sentence and Show all substances", async () => {
    listSeniorSubstances.mockResolvedValue({ total: 0, items: [] });
    const html = renderToStaticMarkup(await SubstancesPage({ searchParams: sp({ q: "zzz" }) }));
    expect(html).toContain("No substances match “zzz”.");
    expect(html).toContain('<a href="/review/substances">Show all substances</a>');
  });
});

describe("the substance page (§5.17.4)", () => {
  it("brands from two batches, names, codes with source links, entries, and the pairs as h3 rows", async () => {
    const html = await substancePage({ pairs: "applies" });
    expect(getSeniorSubstance).toHaveBeenCalledWith("BDS-000003", { pairs: "applies", severity: null, page: 0 }, "senior@e2e.test");
    expect(html).toContain('<h1>Warfarin <span class="mono">BDS-000003</span></h1>');
    expect(strip(html)).toContain("2 brands in 2 batches");
    expect(html).toContain('<caption class="sr-only">Brands of Warfarin in every batch</caption>');
    expect(html).toContain('<a href="/review/e2e-p1c/900-0001-001--warin">Warin</a>');
    expect(html).toContain('<span class="rv rv--approved">Approved by a pharmacist</span>');
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=11289"');
    expect(strip(html)).toContain("500 drug pairs in total. 12 drug and disease interactions, 7 drug and food interactions.");
    expect(html).toContain("<h2 id=\"sub-pairs\">Pairs with substances we hold</h2>");
    expect(html).toContain('<h3 class="rowTitle" id="pair-DDInter1951-DDInter20-h"');
    expect(html).toContain('<a href="/review/substances/BDS-000003?pairs=applies" aria-current="true">Applies to our brands</a>');
  });
  it("coverage none: the no-data block and the not-checked line, and no pair list", async () => {
    getSeniorSubstance.mockResolvedValue(substanceDetail({ coverage: "none", entries: [], pairs: { total: 0, items: [] } }));
    const html = await substancePage();
    expect(html).toContain('<div class="nodata-block hatch" role="note">');
    expect(html).toContain("Pairs with Warfarin are not checked.");
    expect(html).not.toContain("pair-row");
  });
  it("no pair: its sentence", async () => {
    getSeniorSubstance.mockResolvedValue(substanceDetail({ pairs: { total: 0, items: [] } }));
    expect(await substancePage()).toContain("No stored DDInter pair links Warfarin with another substance we hold.");
  });
  it("a substance that is not held is a 404", async () => {
    getSeniorSubstance.mockResolvedValue(null);
    await expect(substancePage({}, "BDS-999999")).rejects.toThrow("NOT_FOUND");
  });
});
```

In `web/tests/review-error.test.tsx`, append inside the `describe`:

```tsx
  it.each(["/review/pairs", "/review/substances", "/review/substances/BDS-000003"])("on %s: Couldn't load senior review. (§5.17.5)", (p) => {
    pathname = p;
    const { container } = render(<ReviewError error={new Error("boom")} reset={() => {}} />);
    expect(container.querySelector(".banner-title")?.textContent).toBe("Couldn't load senior review.");
    expect(container.querySelector(".banner-body")?.textContent).toBe("Nothing was changed. Check your connection and try again.");
  });
```

In `web/tests/request-log.test.ts`, add to the `it.each` table of `routeTemplate`:

```ts
    ["/review/pairs", "/review/pairs"], ["/review/substances", "/review/substances"],
    ["/review/substances/BDS-000003", "/review/substances/[bdsId]"],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/senior-pages.test.tsx tests/review-error.test.tsx tests/request-log.test.ts`
Expected: FAIL — the routes do not exist, the error boundary names "batch pairs", and `/review/pairs` logs as `/review/[batchId]`.

- [ ] **Step 3: Implement the shell, the row and the list**

Create `web/components/review/senior/pages.module.css`:

```css
/* §5.17: the senior pages: the reviewer toolbar, a nav row, one column of at most 960 px. Server-rendered parts. */
.center { display: flex; align-items: center; gap: var(--s3); margin-inline: auto; font-size: 13px; }
.nav { display: flex; gap: var(--s4); padding: var(--s2) var(--s4); border-bottom: 1px solid var(--line); }
.nav a[aria-current="page"] { font-weight: 600; color: var(--fg); }
.page { width: 100%; max-width: 960px; margin: 0 auto; padding: var(--s6) var(--s4) var(--s7); display: flex; flex-direction: column; gap: var(--s5); }
.page h1 { font: var(--t-title1); letter-spacing: var(--tr-title1); overflow-wrap: anywhere; }
.page h2 { font: var(--t-title3); letter-spacing: var(--tr-title3); }
.sub { font-size: 13.5px; color: var(--fg-2); }
.filters { display: flex; flex-wrap: wrap; gap: 4px; }
.filters :global(.filter) { width: auto; }
.links { display: flex; flex-wrap: wrap; gap: var(--s2) var(--s4); font-size: 13px; }
.links a[aria-current="true"] { font-weight: 600; color: var(--fg); }
.range { font-size: 13px; color: var(--fg-2); font-variant-numeric: tabular-nums; }
.paging { display: flex; gap: var(--s4); }
.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3); }
.rows { display: flex; flex-direction: column; gap: var(--s4); }
.row { display: flex; flex-direction: column; gap: 10px; padding: var(--s4); border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-1); }
.row[aria-current="true"] { box-shadow: inset 3px 0 0 var(--accent), var(--shadow-1); }
.rowHead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.rowTitle { font: 600 15px/1.3 var(--font-ui); }
.plain { font-size: 13px; color: var(--fg-2); }
.brands summary, .details summary { cursor: pointer; font-size: 13px; }
.brands ul { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.side { font-weight: 600; font-size: 13px; margin-top: 6px; }
.changes { border-collapse: collapse; font-size: 13px; margin-top: 6px; }
.changes th, .changes td { padding: 4px 10px 4px 0; text-align: left; vertical-align: top; }
.hist { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.hist li { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 4px 12px; }
.histT { color: var(--fg-2); font-variant-numeric: tabular-nums; }
.histT span, .histSub { display: block; }
.histSub { color: var(--fg-2); }
.section { display: flex; flex-direction: column; gap: var(--s3); }
.entries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s3); font-size: 13px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 560px) { .hist li { grid-template-columns: minmax(0, 1fr); } }
```

Create `web/components/review/senior/SeniorShell.tsx`:

```tsx
import type { ReactNode } from "react";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { P1C_COPY, fill } from "@/lib/copy";
import type { KeysSetting } from "@/lib/desk-settings";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import shell from "@/app/review/review.module.css";
import s from "./pages.module.css";

/**
 * §5.17: the reviewer toolbar with "Senior review" and "{t} pair[s] to review" in place of the batch centre, the nav row,
 * and one column of at most 960 px. `toReview` is null when the page has no count to show (and for non-seniors).
 */
export default function SeniorShell({ session, theme, keys, current, toReview, children }: {
  session: Session; theme: Theme; keys: KeysSetting; current: "queue" | "substances" | null; toReview: number | null; children: ReactNode;
}) {
  const r = P1C_COPY.review, sr = P1C_COPY.senior;
  const center = (
    <div className={s.center}>
      <span>{sr.seniorReview}</span>
      {toReview !== null && <span className="num">{fill(toReview === 1 ? r.pairsToReviewOne : r.pairsToReviewMany, { t: toReview })}</span>}
    </div>
  );
  return (
    <div className={shell.shell}>
      <ReviewToolbar session={session} theme={theme} batchId={null} keys={keys} center={center} />
      <nav className={s.nav} aria-label={sr.seniorReview}>
        <a href="/review/pairs" aria-current={current === "queue" ? "page" : undefined}>{sr.pairQueue}</a>
        <a href="/review/substances" aria-current={current === "substances" ? "page" : undefined}>{SHARED_WORDS.substances}</a>
      </nav>
      <main id="content" className={s.page}>{children}</main>
    </div>
  );
}

/** §5.17 "Access": pharmacists and engineers get this banner, with status 200 and no data (§13.1 Q8). */
export function NotSenior() {
  const r = P1C_COPY.review;
  return <Banner tone="info" title={r.notAuthTitle} body={r.notAuthBody}
    action={<a className={buttonClass("tonal", "sm")} href="/review">{DESK.openDesk}</a>} />;
}
```

Create `web/components/review/senior/PairRow.tsx`:

```tsx
import type { ReactNode } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PairText } from "@/components/ui/PairCard";
import Severity from "@/components/ui/Severity";
import { SourceOf } from "@/components/ui/SourceLink";
import { DESK_NEW, FROM_DDINTER, NO_TEXT, P1C_COPY, UNKNOWN_PAIR_LINE, fill } from "@/lib/copy";
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import { pairKey, type PairBrand, type PairView } from "@/lib/senior-types";
import { substanceHref } from "@/lib/senior-params";
import { severityOf } from "@/lib/severity";
import { recordHref } from "../desk/hrefs";
import PairActions from "./PairActions";
import PairStateLine from "./PairStateLine";
import s from "./pages.module.css";

const mono = (t: ReactNode) => <span className="mono">{t}</span>;
const r = P1C_COPY.review;

function Entry({ id, entry }: { id: string; entry: PairView["entryA"] }) {
  return <>{mono(id)}{entry.source && <> <SourceOf source={entry.source} /></>}{entry.name ? ` ${entry.name}` : ""} ({entry.routeScope})</>;
}

function Side({ side, total, list }: { side: PairView["substanceA"]; total: number; list: PairBrand[] }) {
  return (
    <>
      <p className={s.side}>{side.name}</p>
      <ul>
        {list.map((b) => (
          <li key={`${b.batchId}/${b.conceptId}`}>
            <a href={recordHref(b.batchId, b.conceptId)}>{fillNodes(P1C_COPY.other.partnerRef, { name: b.tradeName, batchId: mono(b.batchId) })}</a>{" "}
            <ReviewStatus status={b.displayStatus} />
          </li>
        ))}
      </ul>
      {total > list.length && (
        <p>{fill(r.andMore, { n: total - list.length })} <a href={substanceHref(side.bdsId)}>{fill(r.allBrandsOf, { substance: side.name })}</a></p>
      )}
    </>
  );
}

/**
 * §5.17.2 pair row, the same on the queue (`h2`) and the substance page (`h3`). Server-rendered: the text, brands, changes
 * and history read without JavaScript. PairStateLine and PairActions are the SeniorDesk island's parts.
 */
export default function PairRow({ p, heading }: { p: PairView; heading: "h2" | "h3" }) {
  const id = `pair-${p.ddinterA}-${p.ddinterB}`;
  const H = heading;
  const sideA = p.brands.filter((b) => b.side === "a"), sideB = p.brands.filter((b) => b.side === "b");
  // §5.17.2 item 2: the entry no held product is checked against; both when neither is.
  const notChosen = p.brandCounts.a === 0 && p.brandCounts.b === 0
    ? fillNodes(r.eitherId, { a: mono(p.ddinterA), b: mono(p.ddinterB) }) : mono(p.brandCounts.a === 0 ? p.ddinterA : p.ddinterB);
  const body = p.management ?? p.interaction;
  const management = p.management !== null;
  const suffix = management ? "" : DESK.noManagementForPair;
  const footer = body === null ? (severityOf(p.severity) === "unknown" ? UNKNOWN_PAIR_LINE : NO_TEXT)
    : `${management ? DESK.managementTruncated : DESK.interactionTruncated}${suffix}`;
  return (
    <article className={`pair-row ${s.row}`} id={id} aria-labelledby={`${id}-h`} data-pair={pairKey(p.ddinterA, p.ddinterB)}>
      <div className={s.rowHead}>
        <Severity level={p.severity} />
        <H className={s.rowTitle} id={`${id}-h`} tabIndex={-1}>
          <a href={substanceHref(p.substanceA.bdsId)}>{p.substanceA.name}</a> + <a href={substanceHref(p.substanceB.bdsId)}>{p.substanceB.name}</a>
        </H>
      </div>
      <p className="pair-meta">
        {FROM_DDINTER}. <Entry id={p.ddinterA} entry={p.entryA} /> + <Entry id={p.ddinterB} entry={p.entryB} />.{" "}
        {p.actions.length > 0 && fill(DESK.actionIn, { actions: p.actions.join(", ") })}
      </p>
      {!p.applies && <p className={s.plain}>{fillNodes(r.notApplies, { id: notChosen })}</p>}
      <p className={s.plain}>{fill(r.brandsLine, { a: p.brandCounts.a, brandsA: plural(p.brandCounts.a, "brand", "brands"),
        substanceA: p.substanceA.name, b: p.brandCounts.b, brandsB: plural(p.brandCounts.b, "brand", "brands"), substanceB: p.substanceB.name,
        k: p.brandCounts.batches, batches: plural(p.brandCounts.batches, "batch", "batches") })}</p>
      <details className={s.brands}>
        <summary>{r.brands}</summary>
        <Side side={p.substanceA} total={p.brandCounts.a} list={sideA} />
        <Side side={p.substanceB} total={p.brandCounts.b} list={sideB} />
      </details>
      <PairText id={id} text={body === null ? undefined : { kind: management ? "management" : "interaction", body }} source={footer}
        sourceOpen={body === null ? undefined : `${management ? DESK.managementFull : DESK.interactionFull}${suffix}`}
        link={p.source ? <SourceOf source={p.source} /> : undefined} surface="reviewer" />
      <PairStateLine ddinterA={p.ddinterA} ddinterB={p.ddinterB} review={p.review} />
      {p.review.state === "changed" && p.changes.length > 0 && (
        <details className={s.details}>
          <summary>{r.changedSummary}</summary>
          <table className={s.changes}>
            <thead><tr><th scope="col"><span className="sr-only">{DESK.cmpField}</span></th><th scope="col">{r.atReview}</th><th scope="col">{DESK.diffNow}</th></tr></thead>
            <tbody>{p.changes.map((c) => <tr key={c.field}><th scope="row">{c.field}</th><td>{c.atReview ?? ""}</td><td>{c.now ?? ""}</td></tr>)}</tbody>
          </table>
        </details>
      )}
      <PairActions ddinterA={p.ddinterA} ddinterB={p.ddinterB} />
      {p.history.length > 0 && (
        <details className={s.details}>
          <summary>{r.historySummary}</summary>
          <ol className={s.hist}>
            {p.history.map((h, i) => (
              <li key={i}>
                <span className={s.histT}>{fmtUtc(h.at)}<span>{fmtDhaka(h.at)}</span></span>
                <span>
                  {h.decision === "reviewed" ? (h.mine ? r.historyReviewedMine : r.historyReviewed) : (h.mine ? DESK.issueMine : DESK_NEW.history.issueSenior)}
                  {h.note ? <> <span className="raw">{h.note}</span></> : null}
                  {h.changedAfter && <span className={s.histSub}>{r.historyChangedAfter}</span>}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

```

Create `web/components/review/senior/PairFilters.tsx`:

```tsx
import { SEVERITY_LABEL } from "@/components/ui/Severity";
import { ISSUE_REPORTED, P1C_COPY } from "@/lib/copy";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import { PAIR_SHOWS, SEVERITY_FILTERS, type PairScope, type PairShow, type SeverityFilter } from "@/lib/senior-types";
import s from "./pages.module.css";

const r = P1C_COPY.review;
export const SHOW_LABEL: Record<PairShow, string> = {
  todo: r.showTodo, changed: r.showChanged, issue: ISSUE_REPORTED, reviewed: r.showReviewed, all: r.allPairs,
};

/** §5.17.1 show filters (GET links with tabular counts; the counts follow the scope). */
export function ShowLinks({ show, counts, href }: { show: PairShow; counts: Record<PairShow, number>; href: (v: PairShow) => string }) {
  return (
    <div className={s.filters} role="group" aria-label={DESK.showHeading}>
      {PAIR_SHOWS.map((k) => (
        <a key={k} className="filter" href={href(k)} aria-current={k === show ? "true" : undefined}>
          {SHOW_LABEL[k]}<span className="filter-n">{counts[k]}</span>
        </a>
      ))}
    </div>
  );
}

/** "All pairs" / "Applies to our brands" (PO D3) and the severity filter, as GET links. */
export function ScopeAndSeverity({ pairs, severity, scopeHref, severityHref }: {
  pairs: PairScope; severity: SeverityFilter | null; scopeHref: (v: PairScope) => string; severityHref: (v: SeverityFilter | null) => string;
}) {
  return (
    <>
      <p className={s.links}>
        <a href={scopeHref("all")} aria-current={pairs === "all" ? "true" : undefined}>{r.allPairs}</a>
        <a href={scopeHref("applies")} aria-current={pairs === "applies" ? "true" : undefined}>{r.applies}</a>
      </p>
      <p className={s.links}>
        <a href={severityHref(null)} aria-current={severity === null ? "true" : undefined}>{SHARED_WORDS.all}</a>
        {SEVERITY_FILTERS.map((v) => (
          <a key={v} href={severityHref(v)} aria-current={severity === v ? "true" : undefined}>{SEVERITY_LABEL[v]}</a>
        ))}
      </p>
    </>
  );
}
```

Create `web/components/review/senior/PairList.tsx`:

```tsx
import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { SENIOR_PAGE_SIZE, pairKey, type PairRef, type PairView } from "@/lib/senior-types";
import PairRow from "./PairRow";
import SeniorDesk, { type SeniorDeskProps } from "./SeniorDesk";
import s from "./pages.module.css";

const toRef = (p: PairView): PairRef => ({ ddinterA: p.ddinterA, ddinterB: p.ddinterB, nameA: p.substanceA.name, nameB: p.substanceB.name,
  version: p.version, state: p.review.state });

/**
 * One page of pair rows inside the SeniorDesk island, with "{from}–{to} of {total} pairs" and the paging links. A page past
 * the end (stale link, Review Focus 5) shows "Previous page" to the last page, never the empty-state sentence.
 */
export default function PairList({ items, total, page, heading, emptyText, emptyLink, pageHref, desk }: {
  items: PairView[]; total: number; page: number; heading: "h2" | "h3"; emptyText: string; emptyLink: string | null;
  pageHref: (page: number) => string; desk: Omit<SeniorDeskProps, "pairs" | "children" | "role">;
}) {
  const r = P1C_COPY.review, t = DESK_NEW.reviewLists;
  if (total === 0) {
    return (
      <div className={s.empty}>
        <p>{emptyText}</p>
        {emptyLink && <a className={buttonClass("tonal", "sm")} href={emptyLink}>{r.showAllPairs}</a>}
      </div>
    );
  }
  const last = Math.max(0, Math.ceil(total / SENIOR_PAGE_SIZE) - 1);
  const prev = items.length === 0 ? Math.min(last, page - 1) : page > 0 ? page - 1 : null;
  const next = (page + 1) * SENIOR_PAGE_SIZE < total && items.length > 0 ? page + 1 : null;
  return (
    <>
      {items.length > 0 && (
        <>
          <p className={s.range}>{fill(r.range, { from: page * SENIOR_PAGE_SIZE + 1, to: page * SENIOR_PAGE_SIZE + items.length, total })}</p>
          <SeniorDesk role="senior" {...desk} pairs={items.map(toRef)}>
            <div className={s.rows}>{items.map((p) => <PairRow key={pairKey(p.ddinterA, p.ddinterB)} p={p} heading={heading} />)}</div>
          </SeniorDesk>
          <noscript><p>{r.noScript}</p></noscript>
        </>
      )}
      {(prev !== null || next !== null) && (
        <p className={s.paging}>
          {prev !== null && <a href={pageHref(prev)}>{t.previousPage}</a>}
          {next !== null && <a href={pageHref(next)}>{t.nextPage}</a>}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 4: Implement the routes, the error copy and the log templates**

Create `web/app/review/pairs/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { ScopeAndSeverity, ShowLinks } from "@/components/review/senior/PairFilters";
import PairList from "@/components/review/senior/PairList";
import SeniorShell, { NotSenior } from "@/components/review/senior/SeniorShell";
import s from "@/components/review/senior/pages.module.css";
import { getPairQueue } from "@/lib/api";
import { P1C_COPY } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { isReviewer } from "@/lib/reviewers";
import { pairsHref, parsePairQuery } from "@/lib/senior-params";
import type { PairShow } from "@/lib/senior-types";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const r = P1C_COPY.review;
const EMPTY: Record<PairShow, string> = { todo: r.emptyTodo, changed: r.emptyChanged, issue: r.emptyIssue, reviewed: r.emptyReviewed, all: r.emptyAll };

/** §5.17.1: every DDInter pair between substances we hold, from all batches, Major first. Seniors only. */
export default async function PairQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered these
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value), keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  if (session.role !== "senior")
    return <SeniorShell session={session} theme={theme} keys={keys} current="queue" toReview={null}><NotSenior /></SeniorShell>;
  const q = parsePairQuery(await searchParams);
  const data = await getPairQueue(q, session.email);
  return (
    <SeniorShell session={session} theme={theme} keys={keys} current="queue" toReview={data.counts.todo}>
      <h1>{P1C_COPY.senior.pairQueue}</h1>
      <p className={s.sub}>{r.queueSub}</p>
      <ShowLinks show={q.show} counts={data.counts} href={(show) => pairsHref({ ...q, show, page: 0 })} />
      <ScopeAndSeverity pairs={q.pairs} severity={q.severity} scopeHref={(pairs) => pairsHref({ ...q, pairs, page: 0 })}
        severityHref={(severity) => pairsHref({ ...q, severity, page: 0 })} />
      <PairList items={data.items} total={data.total} page={q.page} heading="h2" emptyText={EMPTY[q.show]}
        emptyLink={pairsHref({ show: "all" })} pageHref={(page) => pairsHref({ ...q, page })}
        desk={{ kind: "queue", target: { type: "pair_queue", id: q.show }, singleKeys: keys === "on", siteKey: turnstileSiteKey(),
          nonce: await cspNonce() }} />
    </SeniorShell>
  );
}
```

Create `web/app/review/substances/page.tsx`:

```tsx
import { cookies } from "next/headers";
import SeniorShell, { NotSenior } from "@/components/review/senior/SeniorShell";
import s from "@/components/review/senior/pages.module.css";
import { listSeniorSubstances } from "@/lib/api";
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import { isReviewer } from "@/lib/reviewers";
import { parseSubstancesQuery, substanceHref, substancesHref } from "@/lib/senior-params";
import { SENIOR_PAGE_SIZE } from "@/lib/senior-types";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

/** §5.17.3: every substance carried by a medicine we hold, from all batches, by pairs to review. Seniors only. */
export default async function SubstancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value), keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  if (session.role !== "senior")
    return <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={null}><NotSenior /></SeniorShell>;
  const { q, page } = parseSubstancesQuery(await searchParams);
  const data = await listSeniorSubstances(q, page);
  const r = P1C_COPY.review, t = DESK_NEW.reviewLists;
  const next = (page + 1) * SENIOR_PAGE_SIZE < data.total ? page + 1 : null;
  return (
    <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={null}>
      <h1>{SHARED_WORDS.substances}</h1>
      <p className={s.sub}>{r.substancesSub}</p>
      <form method="get" action="/review/substances" role="search">
        <label className="sr-only" htmlFor="sub-q">{r.filterLabel}</label>
        <input className="input" id="sub-q" name="q" defaultValue={q} placeholder={r.filterPlaceholder} maxLength={100} />
      </form>
      {data.total === 0 && q ? (
        <div className={s.empty}><p>{fill(r.noMatch, { q })}</p><a href="/review/substances">{r.showAllSubstances}</a></div>
      ) : (
        <div className="cmp-wrap" tabIndex={0} role="region" aria-label={r.substancesCaption}>
          <table className="cmp">
            <caption className="sr-only">{r.substancesCaption}</caption>
            <thead><tr>
              <th scope="col">{SHARED_WORDS.substance}</th><th scope="col">{SHARED_WORDS.bdsId}</th><th scope="col">{r.brands}</th>
              <th scope="col">{DESK.batchesHeading}</th><th scope="col">{r.colPairsToReview}</th><th scope="col">{r.colMajorToReview}</th>
            </tr></thead>
            <tbody>{data.items.map((row) => (
              <tr key={row.bdsId}>
                <th scope="row"><a href={substanceHref(row.bdsId)}>{row.name}</a></th><td className="mono">{row.bdsId}</td>
                <td className="num">{row.brands}</td><td className="num">{row.batches}</td><td className="num">{row.pairsToReview}</td>
                <td className="num">{row.majorPairsToReview}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(page > 0 || next !== null) && (
        <p className={s.paging}>
          {page > 0 && <a href={substancesHref(q, page - 1)}>{t.previousPage}</a>}
          {next !== null && <a href={substancesHref(q, next)}>{t.nextPage}</a>}
        </p>
      )}
    </SeniorShell>
  );
}
```

Create `web/app/review/substances/[bdsId]/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ScopeAndSeverity } from "@/components/review/senior/PairFilters";
import PairList from "@/components/review/senior/PairList";
import SeniorShell, { NotSenior } from "@/components/review/senior/SeniorShell";
import s from "@/components/review/senior/pages.module.css";
import { recordHref } from "@/components/review/desk/hrefs";
import CodeChip from "@/components/ui/CodeChip";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { SourceOf } from "@/components/ui/SourceLink";
import { getSeniorSubstance } from "@/lib/api";
import { DESK_NEW, NOT_RUN, P1C_COPY, fill } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { NAME_TYPE_LABEL } from "@/lib/relations";
import { DESK, SHARED_WORDS, plural } from "@/lib/review-copy";
import { isReviewer } from "@/lib/reviewers";
import { parseSubstanceQuery, substanceHref } from "@/lib/senior-params";
import type { SubstanceBrand } from "@/lib/senior-types";
import { getSession } from "@/lib/session";
import { SEVERITIES } from "@/lib/severity";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const ra = DESK_NEW.routeAware;

/** §5.17.4 "Checked against": the chosen entries, or why there is none (never the hatch except for coverage none). */
function checked(b: SubstanceBrand) {
  if (b.chosen.length > 0)
    return b.chosen.map((c, i) => (
      <Fragment key={c.ddinterId}>{i > 0 && ", "}<span className="mono">{c.ddinterId}</span> ({c.routeScope}){c.routeAssumed && ra.routeAssumedSuffix}</Fragment>
    ));
  if (b.reason === "no_data") return <NoDataChip label="No data" />;
  if (b.reason === "not_run") return NOT_RUN;
  const route = b.clinicalDrug?.route ?? null;
  return route === null ? ra.noRouteEntryNoRoute : fill(ra.noRouteEntry, { route });
}

/** §5.17.4: one substance from every batch: brands, names, codes with sources, DDInter entries and its pairs. Seniors only. */
export default async function SubstancePage({ params, searchParams }: {
  params: Promise<{ bdsId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value), keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  if (session.role !== "senior")
    return <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={null}><NotSenior /></SeniorShell>;
  const { bdsId } = await params;
  if (bdsId.length > 64) notFound();
  const q = parseSubstanceQuery(await searchParams);
  const d = await getSeniorSubstance(bdsId, q, session.email);
  if (!d) notFound();
  const r = P1C_COPY.review;
  const batches = new Set(d.brands.map((b) => b.batchId)).size;
  return (
    <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={null}>
      <h1>{d.name} <span className="mono">{d.bdsId}</span></h1>
      <p className={s.sub}>{fill(r.substanceMeta, { k: d.brands.length, brands: plural(d.brands.length, "brand", "brands"), b: batches,
        batches: plural(batches, "batch", "batches") })}</p>

      <section className={s.section} aria-labelledby="sub-brands">
        <h2 id="sub-brands">{r.brands}</h2>
        <div className="cmp-wrap" tabIndex={0} role="region" aria-labelledby="sub-brands">
          <table className="cmp">
            <caption className="sr-only">{fill(r.brandsCaption, { name: d.name })}</caption>
            <thead><tr>
              <th scope="col">{r.colBrand}</th><th scope="col">{DESK.batchPrefix}</th><th scope="col">{SHARED_WORDS.status}</th>
              <th scope="col">{SHARED_WORDS.clinicalDrug}</th><th scope="col">{SHARED_WORDS.strength}</th><th scope="col">{SHARED_WORDS.route}</th>
              <th scope="col">{r.colChecked}</th>
            </tr></thead>
            <tbody>{d.brands.map((b) => (
              <tr key={`${b.batchId}/${b.conceptId}`}>
                <th scope="row"><a href={recordHref(b.batchId, b.conceptId)}>{b.tradeName}</a></th>
                <td className="mono">{b.batchId}</td>
                <td><ReviewStatus status={b.displayStatus} /></td>
                <td>{b.clinicalDrug && <>{b.clinicalDrug.displayName} <span className="mono">{b.clinicalDrug.bdcId}</span></>}</td>
                <td>{b.strengthText}</td>
                <td>{b.clinicalDrug?.route ?? ""}</td>
                <td>{checked(b)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className={s.section} aria-labelledby="sub-names">
        <h2 id="sub-names">{SHARED_WORDS.names}</h2>
        <ul>{d.names.map((n, i) => <li key={i}>{n.name} ({NAME_TYPE_LABEL[n.type] ?? n.type}), {n.source}</li>)}</ul>
      </section>

      <section className={s.section} aria-labelledby="sub-codes">
        <h2 id="sub-codes">{SHARED_WORDS.codes}</h2>
        <div className="codes">{d.codes.map((c) => (
          <CodeChip key={`${c.system}${c.code}`} system={c.system} code={c.code} source={c.source}
            meta={{ method: c.method, confidence: c.confidence, route: c.system === "DDINTER" ? c.routeScope : undefined }} />
        ))}</div>
      </section>

      <section className={s.section} aria-labelledby="sub-entries">
        <h2 id="sub-entries">{SHARED_WORDS.ddinterEntries}</h2>
        {d.coverage === "none" ? <NoDataBlock title={d.name} bdsId={d.bdsId} />
          : d.coverage === "not_run" ? <p>{NOT_RUN}</p>
          : (
            <ul className={s.entries}>{d.entries.map((e) => (
              <li key={e.ddinterId}>
                <p><span className="mono">{e.ddinterId}</span> {e.name} ({e.routeScope}){e.source && <> <SourceOf source={e.source} /></>}</p>
                <div className={s.chips} role="group" aria-label={DESK.severityGroup}>
                  {SEVERITIES.map((sev) => <Severity key={sev} level={sev} count={e.counts[sev]} />)}
                </div>
                <p>{fill(DESK.totals, { total: e.counts.total, d: e.diseaseCount, dWord: plural(e.diseaseCount, "interaction", "interactions"),
                  f: e.foodCount, fWord: plural(e.foodCount, "interaction", "interactions") })}</p>
              </li>
            ))}</ul>
          )}
      </section>

      <section className={s.section} aria-labelledby="sub-pairs">
        <h2 id="sub-pairs">{r.pairsHeading}</h2>
        {d.coverage === "none" ? <p>{fill(r.notChecked, { name: d.name })}</p> : (
          <>
            <ScopeAndSeverity pairs={q.pairs} severity={q.severity} scopeHref={(pairs) => substanceHref(d.bdsId, { ...q, pairs, page: 0 })}
              severityHref={(severity) => substanceHref(d.bdsId, { ...q, severity, page: 0 })} />
            <PairList items={d.pairs.items} total={d.pairs.total} page={q.page} heading="h3" emptyText={fill(r.pairsEmpty, { name: d.name })}
              emptyLink={null} pageHref={(page) => substanceHref(d.bdsId, { ...q, page })}
              desk={{ kind: "substance", target: { type: "substance", id: d.bdsId }, singleKeys: keys === "on", siteKey: turnstileSiteKey(),
                nonce: await cspNonce() }} />
          </>
        )}
      </section>
    </SeniorShell>
  );
}
```

Create `web/app/review/substances/[bdsId]/not-found.tsx`:

```tsx
import { headers } from "next/headers";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { P1C_COPY, fill } from "@/lib/copy";
import { SHARED_WORDS } from "@/lib/review-copy";
import styles from "@/app/review/review.module.css";

/** §5.17.5 unknown bdsId: "No substance with the id {id}." with "Open the substances list". No data. */
export default async function SubstanceNotFound() {
  const id = decodeURIComponent((await headers()).get("x-pathname")?.split("/")[3] ?? "");
  return (
    <main id="content" className={styles.page}>
      <h1>{SHARED_WORDS.substances}</h1>
      <Banner tone="info" title={fill(P1C_COPY.review.notFound, { id })}
        action={<a className={buttonClass("tonal", "sm")} href="/review/substances">{P1C_COPY.review.openSubstances}</a>} />
    </main>
  );
}
```

In `web/app/review/error.tsx`:

1. Change the copy import to `import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";`.
2. Replace

```ts
  const named = id !== "" && id !== "flags";
  const title = named ? fill(t.errorTitle, { id }) : t.errorBody;
```

with

```ts
  // §5.17.5: /review/pairs and /review/substances/* are the senior pages (no batch is named "pairs" or "substances":
  // those static routes win over /review/[batchId]).
  const senior = id === "pairs" || id === "substances";
  const named = id !== "" && id !== "flags" && !senior;
  const title = senior ? P1C_COPY.review.errorTitle : named ? fill(t.errorTitle, { id }) : t.errorBody;
```

and the banner's `body={named ? t.errorBody : undefined}` with `body={named || senior ? t.errorBody : undefined}`.

In `web/lib/request-log.ts`, add `"/review/pairs", "/review/substances"` to `STATIC_ROUTES`, and as the first entry of `DYNAMIC_ROUTES`:

```ts
  [/^\/review\/substances\/[^/]+$/, "/review/substances/[bdsId]"],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/senior-pages.test.tsx tests/review-error.test.tsx tests/request-log.test.ts tests/review-no-streaming.test.ts tests/client-islands.test.ts tests/marks.test.ts tests/copy.test.ts tests/p1c-copy.test.ts && npx tsc --noEmit -p .`
Expected: PASS (no `loading.tsx` under `app/review`, the island allowlist holds, no material or green outside the allowed files, no retyped copy), no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/review/senior/SeniorShell.tsx web/components/review/senior/PairRow.tsx web/components/review/senior/PairList.tsx \
  web/components/review/senior/PairFilters.tsx web/components/review/senior/pages.module.css web/app/review/pairs web/app/review/substances \
  web/app/review/error.tsx web/lib/request-log.ts web/tests/fixtures/senior.ts web/tests/senior-pages.test.tsx web/tests/review-error.test.tsx \
  web/tests/request-log.test.ts
git commit -m "feat(web): senior review pages: the pair queue, substances and the substance page, across all batches (§5.17)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: The desk sidebar's "Senior review" links, the pair-issue line on `/review/flags`, and the runbook (§5.1, §5.16, §5.13, §12.5)

**Files:**
- Create: `web/components/review/SeniorLinks.tsx`
- Modify: `web/app/review/[batchId]/layout.tsx`, `web/components/review/ReviewDesk.tsx`, `web/components/review/desk/context.ts`, `web/components/review/desk/DeskRecordContext.tsx`, `web/app/review/flags/page.tsx`
- Modify: `docs/runbooks/reviewer-invite.md`
- Test: `web/tests/record-page.test.tsx`, `web/tests/review-flags-page.test.tsx`, `web/tests/runbook.test.ts`

**Interfaces:**
- Consumes: Task 21's `getPairQueue(q, viewer, size)`; Task 13's `P1C_COPY.senior`, `P1C_COPY.review.flagsLine`, `SHARED_WORDS.substances`.
- Produces: `SeniorLinks({ toReview: number | null })` (sidebar heading "Senior review", "Pair queue" with its count, "Substances"); `ReviewDesk` prop `seniorLinks?: ReactNode` and `DeskApi.slots.seniorLinks?`; the sidebar order Batches, Show, Senior review, batch card. A failed count read never fails the desk: the link shows without a count. `/review/flags` shows "Pair issues reported by senior pharmacists: {k}" (linking to `/review/pairs?show=issue`) for a senior when k > 0.

- [ ] **Step 1: Write the failing tests**

In `web/tests/record-page.test.tsx`: add `const getPairQueue = vi.fn();` next to the other mocks, add `getPairQueue: (...a: unknown[]) => getPairQueue(...a),` to the `vi.mock("@/lib/api", …)` factory, and in `SidebarSlots` render `{slots.batchesNav}{slots.seniorLinks}{slots.batchCard}`. Append:

```tsx
describe("the desk sidebar for a senior (§5.1)", () => {
  it("adds Senior review: the pair queue with its count, and Substances; a pharmacist has neither", async () => {
    getSession.mockResolvedValue({ email: "senior@e2e.test", name: "S", role: "senior" });
    getPairQueue.mockResolvedValue({ total: 0, counts: { todo: 12, changed: 1, issue: 2, reviewed: 3, all: 15 }, items: [] });
    const html = renderToStaticMarkup(await BatchLayout({ children: <SidebarSlots />, params: Promise.resolve({ batchId: "0001-pilot" }) }));
    expect(getPairQueue).toHaveBeenCalledWith({ show: "todo", pairs: "all", severity: null, page: 0 }, "senior@e2e.test", 1);
    expect(html).toContain('<p class="chrome-heading">Senior review</p>');
    expect(html).toContain('<a class="filter" href="/review/pairs">Pair queue<span class="filter-n">12</span></a>');
    expect(html).toContain('<a class="filter" href="/review/substances">Substances</a>');
    expect(html).toContain('<span class="role-badge">Senior pharmacist</span>');
  });
  it("a failed count still shows the links", async () => {
    getSession.mockResolvedValue({ email: "senior@e2e.test", name: "S", role: "senior" });
    getPairQueue.mockRejectedValue(new Error("API error 500"));
    const html = renderToStaticMarkup(await BatchLayout({ children: <SidebarSlots />, params: Promise.resolve({ batchId: "0001-pilot" }) }));
    expect(html).toContain('<a class="filter" href="/review/pairs">Pair queue</a>');
  });
  it("a pharmacist gets no Senior review block and no count read", async () => {
    getPairQueue.mockClear();
    const html = renderToStaticMarkup(await BatchLayout({ children: <SidebarSlots />, params: Promise.resolve({ batchId: "0001-pilot" }) }));
    expect(html).not.toContain("/review/pairs");
    expect(getPairQueue).not.toHaveBeenCalled();
  });
});
```

In `web/tests/review-flags-page.test.tsx`: add `const getPairQueue = vi.fn();` and `getPairQueue: (...a: unknown[]) => getPairQueue(...a),` to the `@/lib/api` mock factory, then append:

```tsx
describe("/review/flags for seniors (§5.16 P1C)", () => {
  const counts = (issue: number) => ({ total: 0, counts: { todo: 0, changed: 0, issue, reviewed: 0, all: 0 }, items: [] });
  it("a senior with open pair issues gets the line under the heading, linking to the issue filter", async () => {
    getSession.mockResolvedValue({ email: "senior@e2e.test", name: "S", role: "senior" });
    getPairQueue.mockResolvedValue(counts(2));
    const html = await render();
    expect(getPairQueue).toHaveBeenCalledWith({ show: "issue", pairs: "all", severity: null, page: 0 }, "senior@e2e.test", 1);
    expect(html).toContain('<h1>Problem reports and partner requests</h1><p><a href="/review/pairs?show=issue">Pair issues reported by senior pharmacists: 2</a></p>');
  });
  it("none open, or a failed read: no line", async () => {
    getSession.mockResolvedValue({ email: "senior@e2e.test", name: "S", role: "senior" });
    getPairQueue.mockResolvedValue(counts(0));
    expect(await render()).not.toContain("Pair issues reported");
    getPairQueue.mockRejectedValue(new Error("API error 500"));
    expect(await render()).not.toContain("Pair issues reported");
  });
  it("pharmacists and engineers never get the line, and no count is read", async () => {
    getPairQueue.mockClear();
    for (const role of ["pharmacist", "engineer"]) {
      getSession.mockResolvedValue({ email: "x@e2e.test", name: "X", role });
      expect(await render()).not.toContain("Pair issues reported");
    }
    expect(getPairQueue).not.toHaveBeenCalled();
  });
});
```

In `web/tests/runbook.test.ts`, add `import { P1C_COPY } from "@/lib/copy";` and append inside the first `describe`:

```ts
  it("P1C: the senior invite template, the senior role token, and the pre-rollback dismissal check (§5.13, §12.5)", () => {
    const md = readFileSync(path, "utf8");
    expect(md).toContain(P1C_COPY.senior.invite);
    expect(md).toContain(":senior");
    expect(md).toContain("decision = 'dismiss'");
    expect(md).toContain("d.decided_at > bi.extracted_at");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/record-page.test.tsx tests/review-flags-page.test.tsx tests/runbook.test.ts`
Expected: FAIL — no `seniorLinks` slot, no flags line, and the runbook has no senior template.

- [ ] **Step 3: Implement**

Create `web/components/review/SeniorLinks.tsx`:

```tsx
import { P1C_COPY } from "@/lib/copy";
import { SHARED_WORDS } from "@/lib/review-copy";

/** §5.1 (P1C, seniors only): the sidebar's "Senior review" block. The count is the pairs to review; absent when unread. */
export default function SeniorLinks({ toReview }: { toReview: number | null }) {
  const sr = P1C_COPY.senior;
  return (
    <div>
      <p className="chrome-heading">{sr.seniorReview}</p>
      <div className="filters" role="group" aria-label={sr.seniorReview}>
        <a className="filter" href="/review/pairs">{sr.pairQueue}{toReview !== null && <span className="filter-n">{toReview}</span>}</a>
        <a className="filter" href="/review/substances">{SHARED_WORDS.substances}</a>
      </div>
    </div>
  );
}
```

In `web/components/review/desk/context.ts`, change the `slots` member of `DeskApi` to `slots: { batchesNav: ReactNode; batchCard: ReactNode; seniorLinks?: ReactNode };`.

In `web/components/review/ReviewDesk.tsx`: add `seniorLinks?: ReactNode;` to `ReviewDeskProps` (after `batchCard: ReactNode;`), and change the `slots` entry of `api` to `slots: { batchesNav: props.batchesNav, batchCard: props.batchCard, seniorLinks: props.seniorLinks },`.

In `web/components/review/desk/DeskRecordContext.tsx`, change the sidebar to `{desk.slots.batchesNav}{filters}{desk.slots.seniorLinks}{desk.slots.batchCard}` and the narrow disclosure to `{desk.slots.batchesNav}{filters}{desk.slots.seniorLinks}`.

In `web/app/review/[batchId]/layout.tsx`: add `import SeniorLinks from "@/components/review/SeniorLinks";` and `getPairQueue` to the `@/lib/api` import; after `const keys = …;` add

```ts
  // §5.1: a senior's sidebar counts the pairs to review (all batches, both scopes). A failed read never fails the desk.
  const toReview = session.role === "senior"
    ? (await getPairQueue({ show: "todo", pairs: "all", severity: null, page: 0 }, session.email, 1).catch(() => null))?.counts.todo ?? null
    : null;
```

and pass `seniorLinks={session.role === "senior" ? <SeniorLinks toReview={toReview} /> : null}` to `ReviewDesk`.

In `web/app/review/flags/page.tsx`: change the api import to `import { getPairQueue, listFlagPage, listReviewBatches } from "@/lib/api";` and the copy import to `import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";`; add `pairIssues` to the `Promise.all`:

```ts
  const [reports, partner, batches, pairIssues] = await Promise.all([
    listFlagPage("reports", paging.rp).catch(() => null), listFlagPage("partner", paging.pp).catch(() => null),
    listReviewBatches().catch(() => []),
    // §5.16 (P1C): seniors see how many pair issues are open; engineers have no list of them (§5.17).
    session.role === "senior"
      ? getPairQueue({ show: "issue", pairs: "all", severity: null, page: 0 }, session.email, 1).then((p) => p.counts.issue).catch(() => 0)
      : Promise.resolve(0),
  ]);
```

and directly after `<h1>{t.flagsLink}</h1>`:

```tsx
        {pairIssues > 0 && <p><a href="/review/pairs?show=issue">{fill(P1C_COPY.review.flagsLine, { k: pairIssues })}</a></p>}
```

In `docs/runbooks/reviewer-invite.md`:

1. In the first paragraph, change "Pharmacists and engineers review IntelliDrugs batches on `/review`." to "Pharmacists, engineers and senior pharmacists review IntelliDrugs batches on `/review`; senior pharmacists also review every DDInter pair in Senior review (`/review/pairs`)."
2. In step 2, change the `vi .env` comment to `# append ,their.address@example.com:pharmacist (or :engineer, or :senior) to REVIEWERS` and the first bullet to "The `REVIEWERS` line is comma-separated `email:role` pairs with no spaces; the role is `pharmacist`, `engineer` or `senior` (spec §5.13; anything else is skipped)."
3. In step 3, after the pharmacist example, add:

```markdown
For a senior pharmacist the body is, word for word:

> Role: Senior pharmacist. You review batches as a pharmacist, and the interaction pairs of every batch in Senior review. Sign in at drugdb.eliooo.org with this Google account.
```

4. In step 4, add the bullet: "A senior pharmacist's "Looks correct" publishes like a pharmacist's. They can also dismiss an issue that was reported by mistake (D on the desk), and review pairs in Senior review from the account menu or the desk sidebar."
5. Append:

````markdown
## Before rolling back below P1C (spec §12.5)

Images before P1C ignore a `dismiss` decision, so a record whose issue a senior dismissed would read as "Issue reported" again, or worse, as approved by an approval the dismissal had set aside. Before setting `IMAGE_TAG` below the P1C release, list every dismissal that still counts on a current item:

```bash
cd ~/drugdb/deploy && docker-compose exec -T db psql -U "$DB_USER" -d bddrug -At -c "
SELECT bi.batch_id, bi.concept_id
FROM ops.batch_item bi
JOIN ops.review_decision d ON d.batch_id = bi.batch_id AND d.concept_id = bi.concept_id
WHERE d.decision = 'dismiss'
  AND (bi.extracted_at IS NULL OR d.decided_at > bi.extracted_at)
  AND bi.note IS DISTINCT FROM 'removed from batch file'
GROUP BY bi.batch_id, bi.concept_id;"
```

The query prints ids only, never an email or a note. When it prints nothing, roll back. Otherwise a senior re-approves or re-reports each listed record on the desk first, then run it again.
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/record-page.test.tsx tests/review-flags-page.test.tsx tests/runbook.test.ts tests/desk-parts.test.tsx tests/review-layout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/review/SeniorLinks.tsx "web/app/review/[batchId]/layout.tsx" web/components/review/ReviewDesk.tsx \
  web/components/review/desk/context.ts web/components/review/desk/DeskRecordContext.tsx web/app/review/flags/page.tsx \
  docs/runbooks/reviewer-invite.md web/tests/record-page.test.tsx web/tests/review-flags-page.test.tsx web/tests/runbook.test.ts
git commit -m "feat(web): Senior review in the desk sidebar and on /review/flags; senior invite and pre-rollback check in the runbook (§5.1, §5.16, §12.5)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: End to end — the senior flow, the senior pages, the desk's cross-batch pairs, axe, and the senior Lighthouse budget (§10.6, §11.4)

The P1C fixture is **not** a seed file: `e2e/learn.spec.ts` asserts the live pilot numbers (`/learn/start`: 10 products, 11 substances, "Nothing from the pilot is public yet."), and a second batch at seed time would change them. `e2e/senior.spec.ts` applies it in `beforeAll`; it runs after Learn and the review specs (files run in name order, `workers: 1`) and before `zy-review-single-batch.spec.ts`, which parks every other in-review batch for its one test and so parks `e2e-p1c` too. The fixture's run is older than the pilot's, so `/review` still lists `0001-pilot` first (`review-lists.spec.ts`).

**Files:**
- Create: `web/e2e/p1c-fixture.sql`, `web/e2e/senior.spec.ts`, `web/e2e/lhci-session-senior.cjs`, `web/lighthouserc.senior.json`
- Modify: `web/e2e/db.ts`, `web/e2e/session.ts`, `deploy/docker-compose.ci.yml`, `.github/workflows/ci.yml`
- Test: `web/tests/p1c-ci.test.ts` (create), `web/tests/lhci-session.test.ts`

**Interfaces:**
- Consumes: every earlier task; P1B's e2e helpers (`openRecord`, `deskReady`, `interceptActions`, `shown`, `installTurnstileFake`, `signInAs`).
- Produces: batch `e2e-p1c` with Ibufen 400 (`901-0001-001--ibufen-400`, Ibuprofen `BDS-000101`/`DDInter926`, approved), Warin (`900-0001-001--warin`, Warfarin `BDS-000003`, approved) and Cafergot (`901-0002-001--cafergot`, Caffeine `BDS-000102`/`DDInter272` + Ergotamine `BDS-000103`/`DDInter700`, pending); pairs `DDInter1951/DDInter926` (Major, text, interaction id `19990`), `DDInter14/DDInter926` (text missing; its partner entry is chosen only in other batches), `DDInter272/DDInter700` (text missing, between Cafergot's own ingredients), `DDInter14/DDInter272` (Moderate, text, `19991`). `E2E_EMAILS.senior = "senior@e2e.test"`; db helpers `applyP1cFixture()`, `otherReviewerReports(b, c, note)`, `pairReviews(a, b)`, `auditOutcomes(event, targetId)`.

- [ ] **Step 1: Write the failing config tests**

Create `web/tests/p1c-ci.test.ts`:

```ts
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
```

In `web/tests/lhci-session.test.ts`, append inside the `describe`:

```ts
  it("mints the e2e senior's cookie for the senior pages' budget (P1C)", async () => {
    const token = await mintSession({ email: "senior@e2e.test", name: "E2E Senior", role: "senior" }, SECRET);
    expect(await decryptSession(token, SECRET)).toMatchObject({ email: "senior@e2e.test", role: "senior" });
    expect(require("../e2e/lhci-session-senior.cjs")).toBeTypeOf("function");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/p1c-ci.test.ts tests/lhci-session.test.ts`
Expected: FAIL — no senior in `REVIEWERS`, no `lighthouserc.senior.json`, no senior spec.

- [ ] **Step 3: Write the fixture, the helpers and the CI files**

Create `web/e2e/p1c-fixture.sql`:

```sql
-- P1C e2e fixture (spec §11.4). Applied once by e2e/senior.spec.ts (applyP1cFixture), not a seed file: Learn's live
-- numbers are the pilot seed's. Batch e2e-p1c holds three products outside the pilot: Ibufen 400 and Warin, approved by
-- a pharmacist, and Cafergot, pending. Its run is older than the pilot's, so /review lists 0001-pilot first.
INSERT INTO curated.substance (bds_id, preferred_name) VALUES
 ('BDS-000101','Ibuprofen'), ('BDS-000102','Caffeine'), ('BDS-000103','Ergotamine');
INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
 ('BDS-000101','ICD11_XM','XM1P01','any','dgda-ocl','xm',1),
 ('BDS-000101','RXCUI','5640','any','rxnav','rxnav-exact',1),
 ('BDS-000101','DDINTER','DDInter926','systemic','ddinter2','drugbank',1),
 ('BDS-000102','ICD11_XM','XM2C02','any','dgda-ocl','xm',1),
 ('BDS-000102','DDINTER','DDInter272','systemic','ddinter2','drugbank',1),
 ('BDS-000103','ICD11_XM','XM3E03','any','dgda-ocl','xm',1),
 ('BDS-000103','DDINTER','DDInter700','systemic','ddinter2','drugbank',1);
INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES
 ('BDS-000101','Ibuprofen','icd11','dgda-ocl'), ('BDS-000102','Caffeine','icd11','dgda-ocl'), ('BDS-000103','Ergotamine','icd11','dgda-ocl');
INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES
 ('BDS-000101','full','DDInter DDInter926'), ('BDS-000102','full','DDInter DDInter272'), ('BDS-000103','full','DDInter DDInter700');
INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES
 ('BDC-000101','tablet|systemic|BDS-000101:400mg/','Ibuprofen 400 mg tablet','Tablet','systemic'),
 ('BDC-000102','tablet|systemic|BDS-000102:100mg/;BDS-000103:1mg/','Caffeine 100 mg + Ergotamine 1 mg tablet','Tablet','systemic'),
 ('BDC-000103','tablet|systemic|BDS-000003:2mg/','Warfarin 2 mg tablet','Tablet','systemic');
INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text) VALUES
 ('BDC-000101','BDS-000101',400,'mg',NULL,NULL,'Ibuprofen 400 mg'),
 ('BDC-000102','BDS-000102',100,'mg',NULL,NULL,'Caffeine 100 mg'),
 ('BDC-000102','BDS-000103',1,'mg',NULL,NULL,'Ergotamine 1 mg'),
 ('BDC-000103','BDS-000003',2,'mg',NULL,NULL,'Warfarin 2 mg');
INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag, bdc_id, parse_status, parse_note) VALUES
 ('901-0001-001--ibufen-400','901-0001-001','Ibufen 400','E2E Pharma Ltd.','Tablet','Ibuprofen 400 mg',NULL,'BDC-000101','parsed',NULL),
 ('901-0002-001--cafergot','901-0002-001','Cafergot','E2E Pharma Ltd.','Tablet','Caffeine 100 mg + Ergotamine 1 mg',NULL,'BDC-000102','parsed',NULL),
 ('900-0001-001--warin','900-0001-001','Warin','E2E Pharma Ltd.','Tablet','Warfarin 2 mg',NULL,'BDC-000103','parsed',NULL);
INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES
 ('901-0001-001--ibufen-400','XM1P01','Ibuprofen'),
 ('901-0002-001--cafergot','XM2C02','Caffeine'), ('901-0002-001--cafergot','XM3E03','Ergotamine'),
 ('900-0001-001--warin','XM86W0','Warfarin');
INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES
 ('DGDA-Drugs','901-0001-001--ibufen-400','{"id":"901-0001-001--ibufen-400","concept_class":"Drug","display_name":"Ibufen 400","extras":{"dar_number":"901-0001-001","company":"E2E Pharma Ltd.","dosage_form":"Tablet","generic_content":"Ibuprofen 400 mg"}}'),
 ('DGDA-Drugs','901-0002-001--cafergot','{"id":"901-0002-001--cafergot","concept_class":"Drug","display_name":"Cafergot","extras":{"dar_number":"901-0002-001","company":"E2E Pharma Ltd.","dosage_form":"Tablet","generic_content":"Caffeine 100 mg + Ergotamine 1 mg"}}'),
 ('DGDA-Drugs','900-0001-001--warin','{"id":"900-0001-001--warin","concept_class":"Drug","display_name":"Warin","extras":{"dar_number":"900-0001-001","company":"E2E Pharma Ltd.","dosage_form":"Tablet","generic_content":"Warfarin 2 mg"}}');
INSERT INTO curated.ddinter_drug (ddinter_id, name, drugbank_id, route_scope) VALUES
 ('DDInter926','Ibuprofen','DB01050','systemic'), ('DDInter272','Caffeine','DB00201','systemic'), ('DDInter700','Ergotamine','DB00696','systemic');
INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management) VALUES
 ('19990','Ibuprofen may increase the anticoagulant effect of warfarin.','Avoid the combination; if used, monitor the INR and for bleeding.'),
 ('19991','Caffeine may reduce the clearance of acetaminophen.','Monitor for adverse effects.');
INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) VALUES
 ('DDInter1951','DDInter926','major','{"synergy"}','Warfarin','Ibuprofen','19990'),
 ('DDInter14','DDInter926','unknown','{"unknown"}','Acetaminophen','Ibuprofen',NULL),
 ('DDInter272','DDInter700','major','{"synergy"}','Caffeine','Ergotamine',NULL),
 ('DDInter14','DDInter272','moderate','{"metabolism"}','Acetaminophen','Caffeine','19991');

INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES ('e2e-p1c','in_review',3,'2026-10-01T08:00:00+00:00');
INSERT INTO ops.batch_run (batch_id, run_at, stages, counts, concept_ids) VALUES ('e2e-p1c','2026-10-01T08:00:00+00:00','{dgda,substances,clinical,ddinter}','{}','{}');
INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
 ('e2e-p1c','DGDA-Drugs','901-0001-001--ibufen-400','ok',NULL,'2026-10-01T08:01:00+00:00'),
 ('e2e-p1c','DGDA-Drugs','901-0002-001--cafergot','pending',NULL,'2026-10-01T08:01:00+00:00'),
 ('e2e-p1c','DGDA-Drugs','900-0001-001--warin','ok',NULL,'2026-10-01T08:01:00+00:00');
INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
 ('e2e-p1c','901-0001-001--ibufen-400','dgda','ok','','{}'), ('e2e-p1c','901-0001-001--ibufen-400','substances','ok','','{}'),
 ('e2e-p1c','901-0001-001--ibufen-400','clinical','ok','','{}'),
 ('e2e-p1c','901-0001-001--ibufen-400','ddinter','warn','DDInter text not found for DDInter14/DDInter926','{"text_missing":[["DDInter14","DDInter926"]]}'),
 ('e2e-p1c','901-0002-001--cafergot','dgda','ok','','{}'), ('e2e-p1c','901-0002-001--cafergot','substances','ok','','{}'),
 ('e2e-p1c','901-0002-001--cafergot','clinical','ok','','{}'),
 ('e2e-p1c','901-0002-001--cafergot','ddinter','warn','DDInter text not found for DDInter272/DDInter700','{"text_missing":[["DDInter272","DDInter700"]]}'),
 ('e2e-p1c','900-0001-001--warin','dgda','ok','','{}'), ('e2e-p1c','900-0001-001--warin','substances','ok','','{}'),
 ('e2e-p1c','900-0001-001--warin','clinical','ok','','{}'), ('e2e-p1c','900-0001-001--warin','ddinter','ok','','{}');
INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES
 ('e2e-p1c','901-0001-001--ibufen-400','2026-10-01T08:01:00+00:00','00000000-0000-4000-8000-0000000000c1','run','{"version":2,"extracted_at":"2026-10-01T08:01:00+00:00"}'),
 ('e2e-p1c','901-0002-001--cafergot','2026-10-01T08:01:00+00:00','00000000-0000-4000-8000-0000000000c1','run','{"version":2,"extracted_at":"2026-10-01T08:01:00+00:00"}'),
 ('e2e-p1c','900-0001-001--warin','2026-10-01T08:01:00+00:00','00000000-0000-4000-8000-0000000000c1','run','{"version":2,"extracted_at":"2026-10-01T08:01:00+00:00"}');
INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) VALUES
 ('e2e-p1c','901-0001-001--ibufen-400','ok','','other.pharmacist@e2e.test','pharmacist'),
 ('e2e-p1c','900-0001-001--warin','ok','','other.pharmacist@e2e.test','pharmacist');
```

In `web/e2e/db.ts`, add `import { readFileSync } from "node:fs";` and `import { join } from "node:path";` at the top, and append:

```ts
/** The P1C fixture (batch e2e-p1c), once: senior.spec.ts calls it in beforeAll. */
export function applyP1cFixture(): void {
  if (sql("SELECT count(*) FROM ops.batch WHERE batch_id = 'e2e-p1c'") === "0") sql(readFileSync(join(__dirname, "p1c-fixture.sql"), "utf8"));
}

/** Another pharmacist reports an issue on the record (an open issue for the dismiss panel). */
export function otherReviewerReports(b: string, c: string, note: string): void {
  sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
       VALUES (${lit(b)}, ${lit(c)}, 'issue', ${lit(note)}, 'other.pharmacist@e2e.test', 'pharmacist');
       UPDATE ops.batch_item SET review = 'issue' WHERE ${item(b, c)};`);
}

export const pairReviews = (a: string, b: string): number =>
  Number(sql(`SELECT count(*) FROM ops.pair_review WHERE ddinter_a = ${lit(a)} AND ddinter_b = ${lit(b)}`));

/** The audit rows of one event on one target, oldest first, as "outcome|actor_role". Never an email. */
export const auditOutcomes = (event: string, targetId: string): string =>
  sql(`SELECT coalesce(string_agg(outcome || '|' || actor_role, ',' ORDER BY id), '') FROM ops.audit_event
       WHERE event = ${lit(event)} AND target_id = ${lit(targetId)}`);
```

In `web/e2e/session.ts`, change `E2E_EMAILS` to `{ pharmacist: "pharm@e2e.test", engineer: "eng@e2e.test", senior: "senior@e2e.test", user: "reader@e2e.test" } as const`.

In `deploy/docker-compose.ci.yml`, change the web `REVIEWERS` line to `REVIEWERS: pharm@e2e.test:pharmacist,eng@e2e.test:engineer,senior@e2e.test:senior`.

Create `web/e2e/lhci-session-senior.cjs`:

```js
// Mints the e2e senior's session cookie (as lhci-session.cjs does for the pharmacist) before Lighthouse loads the senior
// pages (§10.6). tests/lhci-session.test.ts pins that lib/session-crypto decrypts it as role senior.
const { mintSession } = require("./lhci-session.cjs");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

module.exports = async (browser) => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/healthz`);
  await page.setCookie({ name: "__Host-intellidrugs_session", url: BASE, httpOnly: true, secure: true, sameSite: "Lax",
    value: await mintSession({ email: "senior@e2e.test", name: "E2E Senior", role: "senior" }) });
  await page.close();
};
```

Create `web/lighthouserc.senior.json`:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/review/pairs", "http://localhost:3000/review/substances/BDS-000003"],
      "numberOfRuns": 3,
      "puppeteerScript": "./e2e/lhci-session-senior.cjs",
      "settings": { "preset": "desktop", "disableStorageReset": true, "blockedUrlPatterns": ["https://challenges.cloudflare.com/*"] }
    },
    "assert": {
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 1 }],
        "resource-summary:document:size": ["error", { "maxNumericValue": 122880 }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 184320 }],
        "resource-summary:stylesheet:size": ["error", { "maxNumericValue": 25600 }],
        "resource-summary:font:size": ["error", { "maxNumericValue": 92160 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 1500 }]
      }
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci-senior" }
  }
}
```

In `.github/workflows/ci.yml`, after the line `- run: cd web && npx lhci autorun --config=./lighthouserc.review.json` add:

```yaml
      - run: cd web && npx lhci autorun --config=./lighthouserc.senior.json
```

- [ ] **Step 4: Write the e2e spec**

Create `web/e2e/senior.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { applyP1cFixture, auditOutcomes, lastDecision, otherReviewerReports, pairReviews, sql } from "./db";
import { PILOT_IDS, deskReady, interceptActions, openRecord, shown } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

/*
 * P1C end to end (§11.4, as amended by the P1C plan's Task 0): the senior review flow with Dismiss issue, the senior
 * pages, and the desk's cross-batch pairs. The fixture batch e2e-p1c is applied here, not seeded (Learn's live numbers).
 */
const B = "e2e-p1c";
const P1C = { ibufen: "901-0001-001--ibufen-400", cafergot: "901-0002-001--cafergot", warin: "900-0001-001--warin" } as const;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
type Look = { name: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [{ name: "light", theme: "light", forced: false }, { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true }];

test.describe.configure({ timeout: 300_000 });
test.beforeAll(() => applyP1cFixture());

async function as(browser: Browser, role: "senior" | "pharmacist", look?: Look): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL,
    ...(look ? { colorScheme: look.theme, forcedColors: look.forced ? ("active" as const) : ("none" as const) } : {}) });
  if (look) await context.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
  await signInAs(context, role, role === "senior" ? "E2E Senior" : "E2E Reviewer");
  const page = await context.newPage();
  await installTurnstileFake(page, "pass");
  return { context, page };
}
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(500);
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}
const botPassed = (page: Page) => expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });

test("desk: In other batches with both subgroups; text-missing notes split by partnerScope (§5.5.3, §5.6.2)", async ({ browser }) => {
  const { context, page } = await as(browser, "pharmacist");
  await openRecord(page, "0001-pilot", PILOT_IDS.napa);
  const ix = page.locator('section[aria-labelledby="sec-ix"]');
  await expect(ix.getByRole("heading", { level: 3, name: "With other medicines" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 4, name: "In batch 0001-pilot" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 4, name: "In other batches" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 5, name: "With approved medicines" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 5, name: "With medicines not yet approved" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 6, name: "Acetaminophen + Caffeine" })).toBeVisible();
  await expect(ix).toContainText("Cafergot (batch e2e-p1c)");
  await expect(ix).toContainText("Ibufen 400 (batch e2e-p1c)");
  await expect(ix).toContainText("From DDInter 2.0.");

  const checks = page.locator('section[aria-labelledby="sec-checks"]');
  await openRecord(page, B, P1C.ibufen);
  await expect(checks).toContainText("DDInter text not found for 1 pair with medicines outside this batch.");
  await expect(checks).not.toContainText("with other medicines in this batch");
  await openRecord(page, B, P1C.cafergot);
  await expect(checks).toContainText("DDInter text not found for 1 pair between ingredients of this product.");
  await context.close();
});

test("review flow (senior): badge and promise; A publishes; R withdraws; D dismisses and keeps the reporter's note (§5.10a)", async ({ browser }) => {
  const { context, page } = await as(browser, "senior");
  await openRecord(page, B, P1C.cafergot);
  await expect(page.locator(".role-badge").first()).toHaveText("Senior pharmacist");
  await expect(page.locator(".decision-promise")).toContainText("You're reviewing as a senior pharmacist.");
  await botPassed(page);
  await page.keyboard.press("a");
  await expect.poll(() => lastDecision(B, P1C.cafergot), { timeout: 30_000 }).toBe("ok|senior|");

  await page.locator("#desk").focus();
  await page.keyboard.press("r");
  await page.locator("#note").fill("Strength should read Ergotamine 1 mg");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => lastDecision(B, P1C.cafergot), { timeout: 30_000 }).toBe("issue|senior|Strength should read Ergotamine 1 mg");

  const ph = await as(browser, "pharmacist");
  await openRecord(ph.page, B, P1C.cafergot);
  await expect(ph.page.locator(".decision-promise")).toContainText("An issue is open on this record.");
  await expect(ph.page.locator('[data-fk="dismiss"]')).toHaveCount(0);
  await ph.page.keyboard.press("d");
  await expect(ph.page.locator("#bar-dismiss")).toHaveCount(0);
  await ph.context.close();

  await page.reload();
  await deskReady(page);
  await botPassed(page);
  await page.keyboard.press("d");
  const panel = page.locator("#bar-dismiss");
  await expect(panel).toContainText("Reported by you on");
  await expect(panel).toContainText("Strength should read Ergotamine 1 mg");
  await page.locator("#dismiss-note").fill("abcd");
  await page.keyboard.press("Control+Enter");
  await expect(panel.locator(".field-error")).toHaveText("Add at least 5 characters so the team knows why the report was dismissed.");
  await page.locator("#dismiss-note").fill("The register lists Ergotamine 1 mg; the report misread it");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => lastDecision(B, P1C.cafergot), { timeout: 30_000 })
    .toBe("dismiss|senior|The register lists Ergotamine 1 mg; the report misread it");
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-fk="approve"]')).toBeFocused();
  await expect(page.locator("#record .rv").first()).toHaveText("Not yet reviewed by a pharmacist");
  const history = page.locator('section[aria-labelledby="sec-hist"]');
  await expect(history).toContainText("Strength should read Ergotamine 1 mg");
  await expect(history).toContainText("No longer counts: a senior pharmacist dismissed the issue after it.");
  await expect(history).toContainText("Issue dismissed (you). Note: The register lists Ergotamine 1 mg; the report misread it");
  expect(sql(`SELECT count(*) FROM ops.review_decision WHERE batch_id = '${B}' AND concept_id = '${P1C.cafergot}' AND decision = 'dismiss'`)).toBe("1");
  expect(auditOutcomes("decision", `${B}/${P1C.cafergot}`)).toBe("ok|senior,issue|senior,dismiss|senior");
  expect(await page.content()).not.toContain("other.pharmacist@e2e.test");
  await context.close();
});

test("senior pages: M marks a cross-batch pair reviewed, a DDInter change brings it back, a pair issue keeps the text public (§5.17)", async ({ browser }) => {
  const ph = await as(browser, "pharmacist");
  const res = await ph.page.goto("/review/pairs");
  expect(res?.status()).toBe(200);
  await expect(ph.page.getByText("Senior review is for senior pharmacists.")).toBeVisible();
  await expect(ph.page.locator(".pair-row")).toHaveCount(0);
  await ph.context.close();

  const { context, page } = await as(browser, "senior");
  await page.goto("/review/pairs");
  const row = page.locator("#pair-DDInter1951-DDInter926");
  await expect(row.getByRole("heading", { level: 2 })).toHaveText("Warfarin + Ibuprofen");
  await expect(row).toContainText("Pair not yet reviewed by a senior pharmacist");
  await botPassed(page);
  await row.getByRole("heading", { level: 2 }).focus();
  await page.keyboard.press("m");
  await expect(row.locator(".pair-review")).toHaveText(/^Pair reviewed by a senior pharmacist on \d{2}\/\d{2}\/\d{4} \(you\)$/);
  expect(pairReviews("DDInter1951", "DDInter926")).toBe(1);

  sql("UPDATE curated.ddinter_interaction_text SET management = management || ' Re-check the INR within 3 days.' WHERE interaction_id = '19990'");
  await page.goto("/review/pairs?show=changed");
  const changed = page.locator("#pair-DDInter1951-DDInter926");
  await expect(changed.locator(".pair-review")).toHaveText(/^Pair changed in DDInter after a senior pharmacist reviewed it on /);
  expect(sql(`SELECT review FROM ops.batch_item WHERE batch_id = '${B}' AND concept_id = '${P1C.ibufen}'`)).toBe("ok");

  await botPassed(page);
  await changed.getByRole("button", { name: /^Report pair issue/ }).click();
  await page.locator("#pair-note-DDInter1951-DDInter926").fill("The management text reads stronger than the severity");
  await page.keyboard.press("Control+Enter");
  await expect(changed.locator(".pair-review")).toHaveText(/^Pair issue reported by a senior pharmacist on .* \(you\)\. Note: The management text/);
  await expect(changed).toContainText("Re-check the INR within 3 days.");
  expect(pairReviews("DDInter1951", "DDInter926")).toBe(2);

  await page.goto(`/check?ids=${P1C.ibufen}&ids=${P1C.warin}`);
  await expect(page.getByText("Ibuprofen may increase the anticoagulant effect of warfarin.")).toBeVisible();
  await context.close();
});

for (const look of LOOKS) {
  test(`axe (${look.name}): the dismiss panel, the senior pages and the not-authorised banner (§11.4)`, async ({ browser }) => {
    otherReviewerReports(B, P1C.cafergot, "Strength looks wrong on the pack");
    const { context, page } = await as(browser, "senior", look);
    await openRecord(page, B, P1C.cafergot);
    await botPassed(page);
    await page.keyboard.press("d");
    await expect(page.locator("#bar-dismiss")).toBeVisible();
    await axe(page, "dismiss panel");
    await page.locator("#dismiss-note").fill("abc");
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#bar-dismiss .field-error")).toBeVisible();
    await axe(page, "dismiss error");
    const release = await interceptActions(page, B, "hold");
    await page.locator("#dismiss-note").fill("The pack and the register agree");
    await page.keyboard.press("Control+Enter");
    await expect(page.locator('#bar-dismiss [aria-busy="true"]')).toBeVisible();
    await axe(page, "dismiss sending");
    await release();
    await expect(shown(page, "Couldn't confirm your dismissal.")).toBeVisible({ timeout: 25_000 });

    for (const show of ["todo", "changed", "issue", "reviewed", "all"]) {
      await page.goto(`/review/pairs?show=${show}`);
      await axe(page, `queue ${show}`);
    }
    await page.goto("/review/pairs?show=all");
    await botPassed(page);
    const row = page.locator("#pair-DDInter272-DDInter700");
    await row.getByRole("button", { name: /^Report pair issue/ }).click();
    await expect(page.locator("#pair-note-DDInter272-DDInter700")).toBeVisible();
    await axe(page, "pair issue panel");
    sql("UPDATE curated.ddinter_pair SET actions = array_append(actions, 'others') WHERE ddinter_a = 'DDInter272' AND ddinter_b = 'DDInter700'");
    await row.getByRole("button", { name: /^Mark reviewed/ }).click();
    await expect(row.getByText("This pair changed in DDInter after you opened the page.")).toBeVisible({ timeout: 20_000 });
    await axe(page, "row 409 banner");
    await page.goto("/review/substances/BDS-000003");
    await axe(page, "substance page");
    await page.goto("/review/substances");
    await axe(page, "substances");
    await context.close();

    const ph = await as(browser, "pharmacist", look);
    await ph.page.goto("/review/pairs");
    await expect(ph.page.getByText("Senior review is for senior pharmacists.")).toBeVisible();
    await axe(ph.page, "not authorised");
    await ph.context.close();
  });
}
```

- [ ] **Step 5: Run the config tests, then the full e2e stack**

Run: `cd web && npx vitest run tests/p1c-ci.test.ts tests/lhci-session.test.ts`
Expected: PASS.

Then the CI stack locally (Docker running; the same commands as `.github/workflows/ci.yml`; the project is `bddrug-ci`, so no `bddrug` container is touched):

```bash
COMPOSE="docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml"
$COMPOSE up -d --build db flyway api web && $COMPOSE --profile seed run --rm seed
curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz
(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test)
(cd web && npx lhci autorun --config=./lighthouserc.senior.json)
$COMPOSE down -v
```

Expected: every spec passes (Learn's live numbers unchanged: the fixture is applied after it); the senior Lighthouse run passes its budgets. If the review desk's own budget (`lighthouserc.review.json`) grows past 80 KB of document on Napa because of "In other batches", that is a real budget failure: report it rather than raising the budget.

- [ ] **Step 6: Commit**

```bash
git add web/e2e/p1c-fixture.sql web/e2e/senior.spec.ts web/e2e/lhci-session-senior.cjs web/lighthouserc.senior.json web/e2e/db.ts web/e2e/session.ts \
  deploy/docker-compose.ci.yml .github/workflows/ci.yml web/tests/p1c-ci.test.ts web/tests/lhci-session.test.ts
git commit -m "test(web): P1C end to end: senior review flow with Dismiss issue, senior pages, cross-batch desk, axe and the senior budget (§11.4, §10.6)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Finish — full suites, the build, the source-link browser check, the PR, and the P1C pilot check after deploy

**Files:** none new (the PR description records the §5.6.6 browser check, S9).

- [ ] **Step 1: Every suite and the production build**

```bash
(cd etl && . .venv/bin/activate && pytest -q)
(cd api && ./gradlew test --no-daemon)
(cd web && API_URL=http://api:8080 npm test && npx tsc --noEmit -p . && npm run build)
```

Expected: all green; the build ends with `client island check: … all on the §4.2 allowlist` (now including `components/review/senior/*`) and the client-bundle scan passes (no `INTERNAL_API_TOKEN` in a client chunk).

- [ ] **Step 2: No leftovers**

```bash
grep -rnF '"pharmacist" | "engineer"' web/app web/components web/lib || echo "no two-role lists"
test -z "$(find web/app/review -name 'loading.*')" && echo "no loading.tsx under app/review"
grep -rnE "TODO|TBD|FIXME" web/app/review/pairs web/app/review/substances web/components/review/senior api/src/main/java/com/niramoy/bddrug/domain/SourceLinks.java etl/src/bddrug_etl/load/batches.py || echo "clean"
```

Expected: `no two-role lists`, `no loading.tsx under app/review`, `clean`.

- [ ] **Step 3: The §5.6.6 browser check (S9), by hand, read-only**

With the API running against a copy of the pilot data (or production after deploy), open one desk record per pattern and follow each link in a real browser: RxNav `161` ("acetaminophen [RxCUI 161]"), WHO ATC/DDD `N02BE01`, DrugBank `DB00316`, RxNav SNOMED CT search `387517004`, ICD-11 search (the browser root; search `XM5DJ7`), DDInter entries `DDInter14` and `DDInter352`, and a pair with a numeric `interaction_id` (`3039`). Record date, browser and the page title each link opened in the PR description under "S9 source-link check". CI never calls these sites.

- [ ] **Step 4: Push the branch and open the PR into `main`**

```bash
git push -u origin feature/intellidrugs-p1c-review-model
gh pr create --base main --title "IntelliDrugs P1C: review model and source links" --body-file - <<'EOF'
Implements §12.2 row "P1C Review model and source links" of docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md
(as amended for P1C and by this plan's Task 0), following docs/superpowers/plans/2026-10-15-intellidrugs-p1c-review-model.md.

- V7 (db-schema-v1.2): dismiss decisions, the senior role, ops.pair_review, the new audit events
- Senior pharmacist role at every gate; Dismiss issue on the desk (report channel)
- Senior review: pair queue, substances, substance page, across all batches; pair decisions with their own audit rows
- Reopen rule in the ETL (settle, approval_view, --reopen for non-approved targets only); carried approvals
- Desk: With other medicines (in batch, in other batches), the partnerScope note split, the combination fix, source links
- Removed items never public (PO D7); the checker alerts carry ddinterA, ddinterB and the public pairReview

S9 source-link check: (fill in from Task 26 Step 3)

After merge: V7 runs through Flyway on deploy; then the P1C pilot check (§8.3.1).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 5: After the merge deploys — the P1C pilot check (§8.3.1, S8)**

Run the `load-dgda` workflow for `0001-pilot.txt` with stages `ddinter` and `reopen` left false (GitHub → Actions → load-dgda → Run workflow). Expected in the job log: `stage ddinter for batch 0001-pilot re-opened 0 record(s)`, no `carried` or `skipped` line for an approved record, and every approved pilot record still approved (`/review/0001-pilot` shows the same "{a} of 10 approved" as before the run). Then check that `db-schema-v1.2` is tagged on the merge commit (Task 1) and that a senior has opened `/review/pairs` and reviewed at least the pilot's Major pairs (§12.1 exit). The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted (§12.4).
