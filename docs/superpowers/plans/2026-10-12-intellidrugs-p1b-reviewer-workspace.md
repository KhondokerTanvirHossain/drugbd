# IntelliDrugs P1B "Reviewer workspace" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pharmacist or engineer reviews a batch record by record in `/review`, with the keyboard, on live data: compare the DGDA source with the extraction, read the checks and the route-aware interactions, then press A ("Looks correct", committed after an 8, 20 or 60 second undo window) or R ("Report issue"), with stale detection, idempotent retries, bot checks and an audit trail; plus the batch list, the problem-report and partner-request list, the `/batches` and `/flags` redirects and the reviewer-invite runbook.

**Architecture:** The Java API (hexagonal) gains a token-gated `ReviewQueryController` (`/v1/review/batches…`) whose service applies five new pure domain rules (`StageNotes`, `ReviewTriage`, `ItemHistory`, `SnapshotDiff`, `BatchPairs`) to facts read by one R2DBC adapter and a reusable `IngredientSummaryReader`; `GET /v1/flags` gains paging and target filters, and flag writes append `flag_created`, `partner_request` and `flag_resolved` audit rows. The Next.js 15 app renders `/review/*` on the server: `app/review/[batchId]/layout.tsx` holds the `ReviewDesk` island (batch-level props, toolbar, toast, sheet, live region, Turnstile, keyboard, the commit-delayed approval) and survives record navigation; `app/review/[batchId]/[conceptId]/page.tsx` renders filters, list and detail and hands record data to the desk through the `DeskRecordContext` island, which also holds the subtree the reviewer was shown while a record is stale. Every pure piece of desk logic (commit machine, advance, bar state, keys, row hints, poll verdict, relations) is a separate module with its own unit test; a native-POST fallback with a confirm step works when the island fails to load.

**Tech Stack:** Java 21, Spring Boot 3.4.2 (WebFlux, R2DBC), JUnit 5, Testcontainers 1.20.4, Flyway 10.20.1 (tests only) · Next.js 15.5.27 (app router, Node middleware), React 19.0.8, TypeScript 5.7.3, vitest 2.1.8 (+ jsdom 26.1.0, Testing Library 16.3.3), Stylelint 16 · Playwright 1.64.0 with `@axe-core/playwright` 4.13.0 · PostgreSQL 16 · GitHub Actions, `docker-compose` on the shared EC2 host.

**Spec:** `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md`. This plan is row "P1B Reviewer workspace" of §12.2: all of §5 (§5.1–§5.16), all of §7.3 (including its coverage `not_run` rule in `R2dbcSubstanceAdapter` and `InteractionCheckService`, Task 6b; §7.4's `notChecked` reasons stay P2's), the §7.5 flag paging that `/review/flags` needs, `/review` and `/review/flags`, the `/batches` and `/flags` redirects (§2.3), `docs/runbooks/reviewer-invite.md` (new), and the review parts of §11. Read §1, §1.6, §1.7, §2, §3, §4, §5, §7.3, §7.5, §9, §10, §11 and §12 before starting. Visual and string sources: Board R `docs/artifacts/2026-10-12-intellidrugs-reviewer.html`, Board DS `docs/artifacts/2026-10-12-intellidrugs-design-system.html`, Board P `docs/artifacts/2026-10-12-intellidrugs-public.html` (not-authorised banner, "Open the review desk"), `docs/design/intellidrugs/tokens.css`.

**Depends on:** P0 (`docs/superpowers/plans/2026-10-12-intellidrugs-p0-safety.md`) and P1A (`docs/superpowers/plans/2026-10-12-intellidrugs-p1a-foundation.md`) merged. Names this plan consumes from them are listed in each task's **Interfaces** block; where this plan quotes a line P0 or P1A wrote, it quotes their plan's text.

**Branch:** P1B merges into the `phase-1` integration branch (§12.3, D42). Create `feature/intellidrugs-p1b-reviewer-workspace` from `phase-1`; only the phase-complete merge of `phase-1` into `main` deploys.

**Note for executors:** `next build` type-checks every file that `web/tsconfig.json` includes, tests and e2e specs too, so test code must type-check as strictly as app code. Islands are fixed (§4.2): every `"use client"` file in this plan is `components/review/ReviewDesk.tsx`, a file under `components/review/desk/`, or `app/review/error.tsx`.

## Global Constraints

Copied from the spec. Every task's requirements include this section.

- "Every route is an async server component with `dynamic = "force-dynamic"`. Data is fetched on the server from the internal API." (§4.1)
- "A build check, `scripts/check-client-islands.mjs` … fails if a file is missing from this table, or if a file in the table imports `@/lib/api`, `@/lib/session` or any other `server-only` module." ReviewDesk: "Batch-level props only … No source JSON and no clinical text in props." (§4.2)
- "Only what the page renders, plus the props listed above. There is never a bulk JSON endpoint." Browser-callable route handlers: "`/review/[batchId]/versions`: `conceptId`, version and display status per current item, reviewers only". (§4.3)
- "Anonymous access to any `/review/*` route redirects 307 to `/signin?returnTo=…`, and `user` access returns status 200 with the not-authorised page in §5.12. Neither ever shows the data." (§2.3)
- "**Decision: public routes always read with public scope.** … Unapproved data is readable only under `/review/*`, through the token-gated endpoints in §7.3." (§2.2)
- "Stored emails ("Emails of anyone else") are never rendered by any route." (§2.2; the §2.2 table row "Emails of anyone else" reads "never" for every role) "Emails are never shown. "(you)" comes from the API's `mine` flag." (§5.6.5)
- "Green (`--ok`, `.rv--approved`) means "approved by a pharmacist" and nothing else. The hatch (`NoDataBlock`, `NoDataChip`) means "no interaction data" (coverage `none`) and nothing else. … Translucent material (`.material`, `.decision-bar`) is used only on the toolbar, the sidebar and the decision bar." (§3.4)
- "Each §3.6 safety string is rendered from its constant in `$WEB/lib/copy.ts`, never retyped." New copy (§1.7) lives in `NEW_COPY`, keyed by its §1.7 row. (§3.6, §11.1)
- "Remove every inline `style={{…}}` object in `$WEB`. The only allowed inline styles are CSS custom properties: a measured value … and `--dur-commit` on the desk toast, set to the reviewer's undo window." (§3.1) P1A's `tests/inline-styles.test.ts` allows exactly two JSX inline properties, `--w` (meters) and `--dur-commit` (the desk toast); P1B adds no other `style=` attribute. The one other inline custom property is `--bar-h`, the decision bar's measured height, which ReviewDesk sets on `<html>` with `style.setProperty` (§3.1 "a measured value", §5.1 scroll padding), never in JSX. `Wordmark` takes `size: 13 | 16 | 17 | 19 | 20 | 28` (P1A), mapped to its own classes; review CSS never sets the wordmark's font size.
- "Modules use tokens only, never raw colour values." (§3.1)
- "**Say what the action does, and keep the name through the flow.** … **Say what was and wasn't saved.** Never write a bare "Something went wrong". … **No hedging and no apology.** … The only em dash in the product is in the stale-page title." (§3.5)
- "**Dates follow Bangladesh conventions.** "11/10/2026 21:27 UTC", "12/10/2026 03:27 Dhaka" (reviewer surfaces), "12/10/2026 03:28 Dhaka time" (public surfaces)." "Formatters: `fmtUtc(iso)`, `fmtDhaka(iso)`, `fmtDhakaTime(iso)`, `fmtDhakaOn(iso)`." (§3.5)
- "Enter never approves in the desk." (G3) "An engineer's check never publishes." (G3)
- "`COMMIT_MS = 8000`, read from `--dur-commit`, is the **default** undo window." "It is stored in the cookie `intellidrugs-undo` = `8` | `20` | `60` (Max-Age 1 year, `SameSite=Lax`, `Path=/`, `Secure` in production, not httpOnly; any other value reads as `8`)." "The decision is held **in the browser**. The server receives it only when the window closes, through the `decide` server action." (§5.8.1) "It is stored in the cookie `intellidrugs-keys` = `on` | `off` (same attributes as `intellidrugs-undo`, §5.8.1; any other value reads as `on`)." (§5.14)
- "The countdown uses a deadline on the monotonic clock (`performance.now() + n × 1000`), not a decrementing counter and not `Date.now()`." (§5.8.1)
- "If the page is unloaded anyway … the decision is **discarded**. Nothing is sent: no `sendBeacon`, no keepalive." (§5.8.3)
- "**Own saves never make the record stale (Decision).**" (§5.8.2) "**Refresh never swaps the open record silently.**" (§5.11)
- "One polite, `sr-only` live region per page … Messages are set by clearing the region and writing after 60 ms. No assertive regions. No per-second countdowns." (§10.2)
- "Every action is reachable by keyboard. … Focus is always visible … After any re-render or navigation, focus is restored to the same control (`data-fk`), otherwise to the workspace region, never to `<body>`." (§10.1)
- Audit: "Undo and discarded windows are **not** audit events. … Audit rows hold `actor_email` … `actor_role` and `request_id`. There are no IP addresses and no free text from forms." "The web container's stdout logs never contain emails, notes, flag messages". (§5.15)
- Rate limits (§9.3 table rows, verbatim): "Decision and report actions, per account | 60 per minute | the action returns `rate_limited`. The desk shows the "not saved" network banner (§5.7), and a `decision_denied` audit event is written." "`/review/*/versions`, per account | 1 per 5 s, burst 3 | 429. The 20 s poll carries on unchanged. A 429 on the pre-commit call does not block the commit; the server's version guards decide (§5.11, §7.2)."
- "Add `Cache-Control: private, no-store` to every response that depends on the session." (§9.4; P1A's middleware sets it, and every `/review/*` response and `/review/[batchId]/versions` depends on the session.)
- "Interactive targets are at least 24 × 24 px (WCAG 2.5.8). Primary decision buttons are 36 px." (§10.4)
- §10.6 budget row, verbatim: "`/review/[b]/[c]` (laptop, broadband) | ≤ 80 KB | ≤ 200 KB | ≤ 25 KB | same | ≤ 1.5 s; J/K to next record painted ≤ 300 ms with prefetch" (columns: HTML, JS (all, incl. Next runtime), CSS, Fonts, LCP; "same" is ≤ 90 KB of fonts). "Performance budgets (gzip, measured in CI on the production build)". Pinned by Task 21 (`lighthouserc.review.json`, `review-perf.spec.ts`).
- "Every change keeps the `ApiResponse` envelope and the error mapping in `ApiExceptionHandler`. New errors use the existing codes (`INVALID_QUERY`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`) with a `field`." (§7)
- The schema is locked (`db-schema-v1.1` after P0). P1B adds no migration.
- "These stay unchanged …: the compose project `bddrug`; image names, the volume `dbdata`, the Caddy alias `bddrug-web`; the database name; the Java package and the ETL package." (§9.8) "`INTELLIDRUGS_E2E` is never added here (§11.4)." (§12.4, of `deploy/docker-compose.yml`) "The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted." (§12.4)
- "**Decision: no runtime feature flags.**" P1B merges into `phase-1`. (§12.3)
- Healthcare data (CLAUDE.md): never log PHI, notes or reviewer emails.
- Request log line (P1A Task 25, §5.15, §9.7): every route handler is exported as `withRequestLog(routeTemplate, handle)`; every server action writes one `logRequest({ route: "action:…", method: "POST", status, ms, requestId })` line with the web request id (`requestId()` from `@/lib/request-id`); the middleware's own redirects are logged by P1A's outer `middleware` wrapper. A log line never carries a path parameter, a query string, a note, an email or any other form field.
- Layout files export only the default component and `metadata` (Next.js 15.5 rejects other layout exports at build time); `ONEST_URL` comes from `@/lib/fonts` (P1A Task 2).
- Every `NEW_COPY` string is imported, never retyped: P1A's `copy.test.ts` fails when a file under `app/`, `components/` or `lib/` other than `lib/copy.ts` contains one (Task 9 narrows only how a value under 20 characters is matched, and adds exactly three named legacy files to P1A's `LEGACY_EXEMPT`: `app/page.tsx` until P2, `app/flags/page.tsx` and `app/batches/[id]/page.tsx` until Task 20 deletes them).
- Live announcements go through `announce(region, text)` from `@/lib/live-region` (P1A): one polite region per page; the desk's is `[data-desk="live"]`, reached by `DeskApi.announce`.
- Commits: `type(scope): description`, scope one of `etl`, `api`, `web`, `db`, `deploy`; every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Test-first in every task.

## Review Focus

Five inputs the spec implies but its listed tests do not exercise, most likely to bite a reviewer first. Each is pinned by a test in the task named.

1. **A background tab commits late with an old Turnstile token.** Browsers throttle timers in hidden tabs, so a 60-second window can close minutes later, after the held token has expired (Cloudflare tokens live 300 s). The desk must refresh the token (reset and wait, at most 10 s) instead of sending a stale one, and fall into a commit bot hold, not a network error, when none arrives. Pinned in Task 17c (`desk-flow.test.tsx`, "Turnstile at commit": "a token older than 270 s is never sent…" and "the fresh token that arrives within 10 s is the one sent"); Task 10's `tokenPlan` case pins only the thresholds.
2. **A report note written in emoji or Bengali.** The API counts the 5-to-1000 rule in code points; JavaScript's `length` counts UTF-16 units, so "😀😀😀😀" is 8 units but 4 characters. The desk must apply the minimum and the counter in code points, or the API answers 400 and the reviewer sees "not saved" for a note the page called valid. Pinned in Task 11 (`bar-state.test.ts`, "counts note characters in code points").
3. **The versions poll fails.** A 502 from the web server, a dropped connection or a body that is not JSON must change nothing: no stale banner, no sign-out, no refresh and no announcement, and the 20 s poll carries on; only a 401 means the session ended. Pinned in Task 11 (`poll.test.ts`, "a failed poll is ignored, a 401 signs out").
4. **A record removed from the batch file while a reviewer has its URL** (a bookmark, a shared link, an open tab). It must disappear from the list, the filter counts, the totals and `/versions`; its detail answers 404 from the API, and the record URL sends the reviewer to the batch (whose first record that needs review opens) instead of rendering stale data or a decision bar for it. Pinned in Task 5 (`ReviewQueryIntegrationTest.removedItemsAreNotListedOrServed`), Task 6 (`removedAndUnknownRecordsAre404`) and Task 18 (`record-page.test.tsx`, "a removed or unknown record goes back to the batch, never a decision bar").
5. **A search string with SQL or regular-expression characters.** The record filter is a case-insensitive literal substring: `%`, `_`, `\` and `.*` match only those characters, and a 101-character `q` is a 400 that the web never sends (it clamps to 100). Pinned in Task 5 (`ReviewQueryIntegrationTest.searchIsALiteralSubstring`) and Task 7 (`review-api.test.ts`, "clamps q to 100 characters").

---

## Before you start

- [ ] Branch from the phase branch. No earlier plan creates `phase-1` (P0 used `phase-0`; P1A branches from and merges to `main`), so the first phase-1 plan to start creates it from `main` after P1A has merged:

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
git fetch origin
git switch phase-1 2>/dev/null || (git switch -c phase-1 origin/main && git push -u origin phase-1)
git pull --ff-only
git switch -c feature/intellidrugs-p1b-reviewer-workspace
```

- [ ] Commit this plan on the branch, as P0 did with its own ("Before you start"), so the plan the commits cite is in the history. This plan's header and Interfaces blocks also cite the P1A plan; if P1A's branch did not commit it (`git ls-files --error-unmatch` fails), commit it here too:

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
git add docs/superpowers/plans/2026-10-12-intellidrugs-p1b-reviewer-workspace.md
git ls-files --error-unmatch docs/superpowers/plans/2026-10-12-intellidrugs-p1a-foundation.md >/dev/null 2>&1 \
  || git add docs/superpowers/plans/2026-10-12-intellidrugs-p1a-foundation.md
git commit -m "docs(web): IntelliDrugs P1B implementation plan

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git ls-files docs/superpowers/plans | grep -c "intellidrugs-p1[ab]"   # prints 2
```

- [ ] Confirm the P0 and P1A names this plan builds on exist (each command prints at least one line):

```bash
grep -n "public static String displayStatus" api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java
grep -n "public static Optional<Refusal> check" api/src/main/java/com/niramoy/bddrug/domain/DecisionGuard.java
grep -n "Mono<Long> append" api/src/main/java/com/niramoy/bddrug/application/port/AuditPort.java
grep -n "async function reviewerRead" web/lib/api.ts
grep -n "export function allowAccountAction" web/lib/limits.ts
grep -n "export async function recordAudit" web/lib/audit.ts
grep -n "components/review/ReviewDesk.tsx" web/scripts/check-client-islands.mjs
grep -n "export const MATERIAL_ALLOWED" web/tests/marks.test.ts
grep -n "export function nextWithSecurityHeaders" web/lib/security-headers.ts
grep -n "export function createMiddleware" web/middleware.ts
grep -n "export async function signInAs" web/e2e/session.ts
grep -n 'export const ONEST_URL' web/lib/fonts.ts
grep -n "const handle = async (request: NextRequest)" web/middleware.ts
grep -n "if (!limits.perIp.allow(ip)) return tooMany(1);" web/middleware.ts
grep -n "const account = email ? accountKey(email) : null;" web/middleware.ts
grep -n "export function logRequest\|export function withRequestLog" web/lib/request-log.ts
grep -n 'logged("action:resolve", () => submitResolve(formData))' web/lib/review-actions.ts
grep -n "async function denyDecision" web/lib/actions-core.ts
grep -n "export function announce\|export const ANNOUNCE_DELAY_MS" web/lib/live-region.ts
grep -n "no source file retypes a NEW_COPY string" web/tests/copy.test.ts
grep -n "async function reviewerRead(path: string)" web/lib/api.ts
```

- [ ] Read the pilot triage from `main` as it is today (P0 Task 14 Step 7): if the production re-run's triage differed from the local dry run, a docs PR (`docs(etl): pilot triage counts from the production re-run`, branch `docs/p0-pilot-triage`) updated spec §1.6 items 5, 7, 10 and 11 before P1B starts, and P1B's acceptance tests must follow `main`, not the copy quoted in this plan:

```bash
git fetch origin
git log --oneline origin/main -- docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md | head -5
git show origin/main:docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md | sed -n '/^### 1.6/,/^### 1.7/p'
git diff HEAD origin/main -- docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md   # empty when phase-1 already has it
```

If the diff is not empty (the docs PR merged after `phase-1` was cut), merge `origin/main` into `phase-1` through a PR first (§12.3), then rebase this branch on it. If items 7 or 10 on `main` differ from the values below, the tests that quote them take `main`'s values, never this plan's: Task 2 (`ReviewTriageTest`, "checked against the expected pilot triage after the route fix (§1.6 item 7)"), Task 8 (`web/tests/fixtures/pilot.ts`, the post-fix notes and hints of item 7), Task 11 (`"gives the pilot triage of §1.6 item 7"`), Task 16 (the route-aware statements of item 10) and Task 21 (`build-pilot-seed.mjs`'s `DROPPED` entry and the e2e counts). Items 5 and 11 are Learn counts (P3); P1B only confirms they did not change anything above.

- [ ] Tooling (Docker must be running; API integration tests use Testcontainers):

```bash
(cd web && npm ci)
(cd api && ./gradlew --version)
```

- [ ] Baseline: both suites green before any change.

```bash
(cd api && ./gradlew test --no-daemon)
(cd web && API_URL=http://api:8080 npm test && npm run build)
```

Expected: every test passes and the build ends with `client island check: … all on the §4.2 allowlist`. If not, stop and report it; do not start Task 1 on a red baseline.

## File Structure

```
api/src/main/java/com/niramoy/bddrug/
  domain/FlagPage.java                       CREATE one page of flags
  domain/FlagAudit.java                      CREATE flag audit event names (pure)
  domain/StageNotes.java                     CREATE §7.3 note split + classification (pure)
  domain/ReviewTriage.java                   CREATE filters, hints, counts (pure)
  domain/ItemHistory.java                    CREATE history entries + reopen from snapshots (pure)
  domain/SnapshotDiff.java                   CREATE §7.3 /diff field list over two payloads (pure)
  domain/BatchPairs.java                     CREATE route-aware batch pairs + not-checked reasons (pure)
  domain/IngredientSummary.java              CREATE §7.3 IngredientSummary
  domain/ReviewItem.java                     CREATE §7.3 ReviewItem
  domain/ReviewViews.java                    CREATE batch summary, items page, versions, diff records
  application/port/FlagPort.java             MODIFY paged list
  application/FlagService.java               MODIFY paging, filters, request ids (validation only)
  application/InteractionCheckService.java   MODIFY a missing coverage row is not_run (Task 6b)
  adapter/persistence/R2dbcSubstanceAdapter.java MODIFY a missing coverage row is not_run (Task 6b)
  application/port/ReviewQueryPort.java      CREATE facts the review service reads
  application/ReviewQueryService.java        CREATE assembles the §7.3 responses
  adapter/persistence/R2dbcFlagAdapter.java  MODIFY paged, filtered list; flag write + audit row in one transaction
  adapter/persistence/IngredientSummaryReader.java CREATE ingredients with names, codes, coverage, entries
  adapter/persistence/R2dbcReviewQueryAdapter.java CREATE all review SQL
  presentation/FlagController.java           MODIFY paging params, requestId
  presentation/ReviewQueryController.java    CREATE /v1/review/batches…
api/src/test/java/com/niramoy/bddrug/
  StageNotesTest, ReviewTriageTest, ItemHistoryTest, SnapshotDiffTest, BatchPairsTest   CREATE unit tests
  ReviewQueryIntegrationTest.java            CREATE §11.3 review read endpoints
  FlagApiIntegrationTest.java                MODIFY paged list, filters, audit rows, rollback
  SubstanceApiIntegrationTest.java, InteractionCheckServiceTest.java   MODIFY not_run coverage (Task 6b)
web/
  lib/review-types.ts                        CREATE client-safe types for review pages and islands
  lib/api.ts                                 MODIFY review reads, desk decision write, flag page, requestId on flags
  lib/relations.ts                           CREATE §5.5.2 relation rules (pure)
  lib/desk-settings.ts                       CREATE undo/keys cookies (client-safe)
  lib/review-copy.ts                         CREATE Board R strings and their fill helpers (client-safe)
  lib/copy.ts                                MODIFY fills the P1B §1.7 rows of NEW_COPY
  lib/desk-core.ts                           CREATE decide / confirm / audit logic, decision_denied, action log line (server-only)
  lib/desk-actions.ts                        CREATE "use server": decide, decideFormAction, logRecordOpen, logEvidence, loadDiff, setDeskSettingAction
  lib/audit-once.ts                          CREATE at-most-once-per-10-minutes guard (server-only)
  lib/surface.ts                             CREATE review-surface and legacy-redirect rules (pure)
  lib/security-headers.ts                    MODIFY sets x-pathname
  lib/actions-core.ts, lib/review-actions.ts MODIFY resolve outcome kinds, requestId (keeps P1A's logged("action:resolve", …)); remove reviewAction, submitReview, denyDecision, REVIEW_REFUSALS, conflictCode
  middleware.ts                              MODIFY legacy redirects, anonymous /review gate
  app/layout.tsx                             MODIFY no site chrome on /review/*
  components/Header.tsx                      MODIFY "Review desk", "Problem reports and partner requests", "Batch {id}"
  components/AccountMenu.tsx                 MODIFY sign-out clears note drafts
  app/review/layout.tsx                      CREATE session and role gate
  app/review/error.tsx                       CREATE island: "Couldn't load batch {id}."
  app/review/page.tsx                        CREATE §5.16 batch list
  app/review/review.module.css               CREATE one-column 860 px pages
  app/review/flags/page.tsx                  CREATE §5.16 problem reports and partner requests
  app/review/[batchId]/layout.tsx            CREATE batch layout with ReviewDesk
  app/review/[batchId]/page.tsx              CREATE redirect to the first record that needs review
  app/review/[batchId]/loading.tsx           CREATE skeleton (renders desk/LoadingPanes)
  app/review/not-found.tsx                   CREATE "No batch with the id {id}." (notFound() in the batch layout lands here)
  app/review/[batchId]/versions/route.ts     CREATE version tokens (JSON)
  app/review/[batchId]/[conceptId]/page.tsx  CREATE the workspace record page
  components/review/ReviewDesk.tsx           CREATE island (batch-level)
  components/review/desk.module.css          CREATE ported Board R layout for the desk
  components/review/ReviewToolbar.tsx        CREATE toolbar for /review and /review/flags
  components/review/ReviewAccount.tsx        CREATE account menu content for reviewer pages
  components/review/NotAuthorised.tsx        CREATE §5.12 not-authorised page
  components/review/BatchesNav.tsx, BatchCard.tsx, ShowFilters.tsx, record-helpers.ts, sidebar.module.css   CREATE sidebar parts
  components/review/BatchList.tsx, FlagSection.tsx   CREATE /review and /review/flags bodies
  components/review/detail/*.tsx             CREATE header info, comparison table, checks, interactions, history, evidence, back card, confirm panel
  components/review/desk/*.ts(x)             CREATE desk logic and client parts (allowlisted directory)
  e2e/seed/build-pilot-seed.mjs (+ .d.mts), e2e/seed/10-pilot.sql   CREATE pilot seed generated from Board R's live data
  e2e/turnstile-fake.ts, e2e/db.ts, e2e/review-helpers.ts, e2e/review-*.spec.ts, e2e/zy-review-single-batch.spec.ts  CREATE review e2e
  e2e/lhci-session.cjs, lighthouserc.review.json   CREATE §10.6 desk budget in Lighthouse CI
  tests/desk-reg.ts, tests/desk-stub.tsx, tests/desk-harness.tsx   CREATE desk test helpers (not test files)
  tests/*.test.ts(x)                         CREATE/MODIFY unit and component tests (incl. P1A's copy.test.ts NEW_COPY guard, Task 9)
  app/batches/**, app/flags/**, tests/batch-page.test.tsx, tests/batches-page.test.tsx, tests/flags-page.test.tsx   DELETE
(deploy/docker-compose.ci.yml is unchanged: its seed service already runs every web/e2e/seed/*.sql, now including 10-pilot.sql)
.github/workflows/ci.yml                     MODIFY e2e job runs lighthouserc.review.json
docs/runbooks/reviewer-invite.md             CREATE invite template and steps
README.md                                    MODIFY link to the runbook
```

Task order: 1 (flags API) → 2, 3, 4 (pure domain) → 5, 6 (review API) → 6b (coverage `not_run` on the substance and check endpoints) · 7 (web API client) → 8 (relations) → 9 (copy and settings) → 10, 11 (desk logic) → 12 (server actions) → 13 (versions route) → 14 (surface, gate, redirects) → 15, 16 (detail sections) → 17a (desk parts) → 17b (decision bar, DeskRecordContext) → 17c (ReviewDesk) → 18 (pages) → 19 (`/review`, `/review/flags`) → 20 (legacy removal, header, guards) → 21 (e2e) → 22 (runbook, finish).

---

### Task 1: API flags — paging, target filters and the flag audit rows (§7.5, §5.15)

`/review/flags` lists "every open flag except partner requests" and "partner access requests" separately, 50 per section, and §5.15 says the API writes `flag_created`, `partner_request` and `flag_resolved`. Today `GET /v1/flags` returns at most 500 flags with no filter, and no flag write is audited.

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/FlagPage.java`, `api/src/main/java/com/niramoy/bddrug/domain/FlagAudit.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/FlagPort.java` (whole file), `api/src/main/java/com/niramoy/bddrug/application/FlagService.java` (whole file), `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcFlagAdapter.java` (whole file), `api/src/main/java/com/niramoy/bddrug/presentation/FlagController.java` (whole file)
- Test: `api/src/test/java/com/niramoy/bddrug/FlagApiIntegrationTest.java`

**Interfaces:**
- Consumes: `AuditPort.append(AuditEvent): Mono<Long>` and `AuditEvent(String event, String actorEmail, String actorRole, String targetType, String targetId, String outcome, UUID requestId)` (P1A Task 17); `TransactionalOperator` (Spring Boot auto-configured, already injected by `R2dbcReviewAdapter`). Transaction control stays in the persistence adapter, as P0's decision path does (CLAUDE.md hexagonal rule): `R2dbcFlagAdapter` runs the flag write and its audit row inside one `tx.transactional`.
- Produces:
  - `GET /v1/flags?status=open|resolved&targetType=<one or more of product,substance,batch_item,check,other, comma-separated>&targetId=&excludeTargetId=&page=0&size=50` (token) → `ApiResponse<FlagPage>`; `FlagPage(List<Flag> items, int page, int size, boolean hasMore)`; newest first; `size` 1–50 (default 50), `page` 0–10000 (default 0); `excludeTargetId` drops every flag whose `target_id` equals it (the problem-reports section sends `excludeTargetId=partner-access`, so an `other` flag with any other target is still listed, §5.16); 400 `INVALID_QUERY` with `field` ∈ `status`, `targetType`, `targetId`, `excludeTargetId`, `page`, `size`.
  - `FlagPort`: `create(String targetType, String targetId, String message, String reporterEmail, UUID requestId): Mono<Flag>`, `list(String status, List<String> targetTypes, String targetId, String excludeTargetId, int page, int size): Mono<FlagPage>`, `resolve(long id, String resolvedBy, UUID requestId): Mono<Flag>`; each write appends its audit row in the same transaction.
  - `FlagAudit.PARTNER_TARGET = "partner-access"`, `FlagAudit.createdEvent(String targetType, String targetId): String` (domain, pure).
  - `POST /v1/flags` body adds optional `requestId` (UUID); `POST /v1/flags/{id}/resolve` body `{resolvedBy, requestId?}`. An absent `requestId` is replaced by a fresh UUID; a malformed one is 400 `field=requestId`.
  - Audit rows written in the same transaction as the flag write: `flag_created` (or `partner_request` when `targetType=other` and `targetId=partner-access`), `actor_email` = reporter, `target_type='flag'`, `target_id` = flag id, `outcome='accepted'`; `flag_resolved`, `actor_email` = resolver, `outcome='resolved'`.
  - `FlagService.PARTNER_TARGET` (= `FlagAudit.PARTNER_TARGET`), `FlagService.PAGE_SIZE_MAX = 50`.

- [ ] **Step 1: Update the integration test**

In `api/src/test/java/com/niramoy/bddrug/FlagApiIntegrationTest.java`:

Add imports and two injected beans (the rollback test builds an adapter whose audit write fails):

```java
import com.niramoy.bddrug.adapter.persistence.R2dbcFlagAdapter;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
```

```java
    @Autowired DatabaseClient db;
    @Autowired TransactionalOperator tx;
```

In `createListAndResolve`, replace the statement

```java
        internal(web).get().uri("/v1/flags?status=open").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data[?(@.targetId == 'W-1')].message").isEqualTo("Strength on the pack is 2 mg")
            .jsonPath("$.data[0].targetId").isEqualTo("W-1,A-1");    // newest first
```

with

```java
        internal(web).get().uri("/v1/flags?status=open").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.items[?(@.targetId == 'W-1')].message").isEqualTo("Strength on the pack is 2 mg")
            .jsonPath("$.data.items[0].targetId").isEqualTo("W-1,A-1")     // newest first
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.size").isEqualTo(50);
```

and replace the two statements after `assertThat(text(pg, "SELECT status FROM ops.flag WHERE id = " + id)).isEqualTo("resolved");` with

```java
        internal(web).get().uri("/v1/flags").exchange().expectStatus().isOk()     // open is the default
            .expectBody().jsonPath("$.data.items[?(@.targetId == 'W-1')]").isEmpty();
        internal(web).get().uri("/v1/flags?status=resolved").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.items[?(@.targetId == 'W-1')].status").isEqualTo("resolved");
```

Append these tests to the class:

```java
    @Test void pagesOfFiftyAndTargetFiltersSeparateProblemReportsFromPartnerRequests() throws Exception {
        // An `other` flag that is not a partner request belongs in "Problem reports" (§5.16: every open flag except partner requests).
        create(internal(web), flag("other", "general-feedback", "The search misses brand spellings", "user.two@example.org"))
            .expectStatus().isCreated();
        for (int i = 0; i < 55; i++)
            create(internal(web), flag("substance", "PAGE-" + i, "Name is spelled wrong here", "pager@example.org"))
                .expectStatus().isCreated();
        for (int i = 0; i < 2; i++)
            create(internal(web), flag("other", "partner-access", "We build a clinic app " + i, "partner@example.org"))
                .expectStatus().isCreated();

        // Other tests in this class also write flags, so the expectations are relative to what the table holds.
        long reportsOpen = count(pg, "SELECT count(*) FROM ops.flag WHERE status = 'open' AND target_id <> 'partner-access'");
        long partnersOpen = count(pg, "SELECT count(*) FROM ops.flag WHERE status = 'open' AND target_type = 'other'"
                                      + " AND target_id = 'partner-access'");
        assertThat(reportsOpen).isBetween(56L, 101L);

        String reports = "/v1/flags?status=open&excludeTargetId=partner-access";
        internal(web).get().uri(reports).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.items.length()").isEqualTo(50)
            .jsonPath("$.data.hasMore").isEqualTo(true)
            .jsonPath("$.data.items[0].targetId").isEqualTo("PAGE-54")
            .jsonPath("$.data.items[?(@.targetId == 'partner-access')]").isEmpty();
        internal(web).get().uri(reports + "&page=1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.page").isEqualTo(1)
            .jsonPath("$.data.items.length()").isEqualTo((int) reportsOpen - 50)
            .jsonPath("$.data.hasMore").isEqualTo(false)
            .jsonPath("$.data.items[?(@.targetId == 'PAGE-0')].targetId").isEqualTo(java.util.List.of("PAGE-0"))
            .jsonPath("$.data.items[?(@.targetId == 'general-feedback')].targetType").isEqualTo(java.util.List.of("other"))
            .jsonPath("$.data.items[?(@.targetId == 'partner-access')]").isEmpty();
        internal(web).get().uri("/v1/flags?targetType=other&targetId=partner-access").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.items.length()").isEqualTo((int) partnersOpen)
            .jsonPath("$.data.items[0].message").isEqualTo("We build a clinic app 1");
    }

    @Test void pagingAndFilterValuesAreValidated() {
        for (String[] bad : new String[][]{{"size=0", "size"}, {"size=51", "size"}, {"size=x", "size"}, {"page=-1", "page"},
                                           {"page=10001", "page"}, {"page=1.5", "page"}, {"targetType=report", "targetType"},
                                           {"targetType=product,", "targetType"}, {"targetId=" + "x".repeat(201), "targetId"},
                                           {"excludeTargetId=" + "x".repeat(201), "excludeTargetId"}})
            internal(web).get().uri("/v1/flags?" + bad[0]).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo(bad[1]);
    }

    @Test void flagWritesAndTheirAuditRowCommitTogether() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> report = flag("product", "AUD-1", "Pack shows 10 mg, record says 5 mg", "audit.user@example.org");
        report.put("requestId", rid);
        create(internal(web), report).expectStatus().isCreated();
        long id = flagId("AUD-1");
        assertThat(text(pg, "SELECT event || '|' || actor_email || '|' || target_type || '|' || target_id || '|' || outcome || '|' || request_id"
                            + " FROM ops.audit_event WHERE target_type = 'flag' AND target_id = '" + id + "'"))
            .isEqualTo("flag_created|audit.user@example.org|flag|" + id + "|accepted|" + rid);

        create(internal(web), flag("other", "partner-access", "Hospital pharmacy integration", "partner.two@example.org"))
            .expectStatus().isCreated();
        long partner = count(pg, "SELECT max(id) FROM ops.flag WHERE target_id = 'partner-access'");
        assertThat(text(pg, "SELECT event FROM ops.audit_event WHERE target_type = 'flag' AND target_id = '" + partner + "'"))
            .isEqualTo("partner_request");

        internal(web).post().uri("/v1/flags/{id}/resolve", id).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "pharma.reviewer@example.org")).exchange().expectStatus().isOk();
        assertThat(text(pg, "SELECT actor_email || '|' || outcome FROM ops.audit_event WHERE event = 'flag_resolved'"
                            + " AND target_id = '" + id + "'"))
            .isEqualTo("pharma.reviewer@example.org|resolved");
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'flag_resolved' AND request_id IS NULL")).isZero();
        // the message is never copied into the audit trail
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE outcome LIKE '%mg%' OR target_id LIKE '%mg%'")).isZero();
    }

    @Test void whenTheAuditRowFailsTheFlagWriteRollsBack() throws Exception {
        R2dbcFlagAdapter failingAudit = new R2dbcFlagAdapter(db, tx, e -> Mono.error(new IllegalStateException("audit insert failed")));
        assertThatThrownBy(() -> failingAudit.create("product", "AUD-ROLLBACK", "Pack shows 10 mg, record says 5 mg",
                                                     "audit.user@example.org", UUID.randomUUID()).block())
            .hasMessageContaining("audit insert failed");
        assertThat(count(pg, "SELECT count(*) FROM ops.flag WHERE target_id = 'AUD-ROLLBACK'")).isZero();

        create(internal(web), flag("product", "AUD-RESOLVE", "Pack shows 10 mg, record says 5 mg", "audit.user@example.org"))
            .expectStatus().isCreated();
        long id = flagId("AUD-RESOLVE");
        assertThatThrownBy(() -> failingAudit.resolve(id, "pharma.reviewer@example.org", UUID.randomUUID()).block())
            .hasMessageContaining("audit insert failed");
        assertThat(text(pg, "SELECT status FROM ops.flag WHERE id = " + id)).isEqualTo("open");
    }

    @Test void aMalformedRequestIdIsRefusedAndNothingIsWritten() throws Exception {
        Map<String, Object> report = flag("product", "AUD-BAD", "Pack shows 10 mg, record says 5 mg", "audit.user@example.org");
        report.put("requestId", "not-a-uuid");
        create(internal(web), report).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        assertThat(count(pg, "SELECT count(*) FROM ops.flag WHERE target_id = 'AUD-BAD'")).isZero();
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.FlagApiIntegrationTest'`
Expected: FAIL — `createListAndResolve` finds no `$.data.items`, `pagesOfFifty…` gets 400-free lists without `hasMore`, `flagWritesAndTheirAuditRowCommitTogether` finds no audit row (`expected "flag_created|…" but was null`), and `whenTheAuditRowFails…` does not compile (no `R2dbcFlagAdapter(DatabaseClient, TransactionalOperator, AuditPort)` constructor).

- [ ] **Step 3: Implement**

Create `api/src/main/java/com/niramoy/bddrug/domain/FlagPage.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.List;

/** One page of flags, newest first. {@code hasMore} is true when another page exists. Holds emails: token callers only. */
public record FlagPage(List<Flag> items, int page, int size, boolean hasMore) {}
```

Create `api/src/main/java/com/niramoy/bddrug/domain/FlagAudit.java`:

```java
package com.niramoy.bddrug.domain;

/** §5.15 audit event names for flag writes (pure). The flag message is never audited. */
public final class FlagAudit {
    private FlagAudit() {}

    /** A partner access request is the flag (other, partner-access) (spec §6.9, D17). */
    public static final String PARTNER_TARGET = "partner-access";

    public static String createdEvent(String targetType, String targetId) {
        return "other".equals(targetType) && PARTNER_TARGET.equals(targetId) ? "partner_request" : "flag_created";
    }
}
```

Replace `api/src/main/java/com/niramoy/bddrug/application/port/FlagPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagPage;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.UUID;

public interface FlagPort {
    /** Inserts the flag and its flag_created / partner_request audit row in one transaction (§5.15). */
    Mono<Flag> create(String targetType, String targetId, String message, String reporterEmail, UUID requestId);
    /** Newest first. An empty {@code targetTypes} list and a null {@code targetId} or {@code excludeTargetId} mean "any". */
    Mono<FlagPage> list(String status, List<String> targetTypes, String targetId, String excludeTargetId, int page, int size);
    /**
     * Resolves the flag and appends its flag_resolved audit row in one transaction. Errors with NotFoundException for an
     * unknown flag and ConflictException when it is already resolved.
     */
    Mono<Flag> resolve(long id, String resolvedBy, UUID requestId);
}
```

Replace `api/src/main/java/com/niramoy/bddrug/application/FlagService.java`:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.FlagPort;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagAudit;
import com.niramoy.bddrug.domain.FlagPage;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Problem reports and partner access requests (both are flags, D17). Validation only: the port writes each flag and its
 * audit row (flag_created, partner_request or flag_resolved, spec §5.15) in one transaction. The message is never audited.
 */
@Service
public class FlagService {
    public static final Set<String> TARGET_TYPES = Set.of("product", "substance", "batch_item", "check", "other");
    public static final Set<String> STATUSES = Set.of("open", "resolved");
    public static final int MESSAGE_MIN = 5, MESSAGE_MAX = 2000, TARGET_ID_MAX = 200;
    public static final int PAGE_SIZE_MAX = 50, PAGE_MAX = 10_000;
    public static final String PARTNER_TARGET = FlagAudit.PARTNER_TARGET;
    private static final Pattern UUID_TEXT =
        Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern DIGITS = Pattern.compile("^[0-9]{1,6}$");

    private final FlagPort port;
    public FlagService(FlagPort port) { this.port = port; }

    public record Request(String targetType, String targetId, String message, String reporterEmail, String requestId) {}

    public Mono<Flag> create(Request r) {
        return Mono.fromCallable(() -> {
            String type = Validate.oneOf(r.targetType(), TARGET_TYPES, "targetType");
            String target = Validate.text(r.targetId(), 1, TARGET_ID_MAX, "targetId");
            String message = Validate.text(r.message(), MESSAGE_MIN, MESSAGE_MAX, "message");
            String email = Validate.email(r.reporterEmail(), "reporterEmail");
            UUID rid = requestId(r.requestId());
            return new Object[]{type, target, message, email, rid};
        }).flatMap(v -> port.create((String) v[0], (String) v[1], (String) v[2], (String) v[3], (UUID) v[4]));
    }

    /** All parameters arrive as text so every malformed value is a 400 on its own field. */
    public Mono<FlagPage> list(String status, String targetType, String targetId, String excludeTargetId, String page,
                               String size) {
        return Mono.fromCallable(() -> new Object[]{
                Validate.oneOf(status == null ? "open" : status, STATUSES, "status"),
                targetTypes(targetType),
                targetId == null ? null : Validate.text(targetId, 1, TARGET_ID_MAX, "targetId"),
                excludeTargetId == null ? null : Validate.text(excludeTargetId, 1, TARGET_ID_MAX, "excludeTargetId"),
                number(page, 0, 0, PAGE_MAX, "page"),
                number(size, PAGE_SIZE_MAX, 1, PAGE_SIZE_MAX, "size")})
            .flatMap(v -> {
                @SuppressWarnings("unchecked") List<String> types = (List<String>) v[1];
                return port.list((String) v[0], types, (String) v[2], (String) v[3], (Integer) v[4], (Integer) v[5]);
            });
    }

    public Mono<Flag> resolve(long id, String resolvedBy, String requestId) {
        return Mono.fromCallable(() -> new Object[]{Validate.email(resolvedBy, "resolvedBy"), requestId(requestId)})
            .flatMap(v -> port.resolve(id, (String) v[0], (UUID) v[1]));
    }

    private static List<String> targetTypes(String value) {
        if (value == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String t : value.split(",", -1)) out.add(Validate.oneOf(t, TARGET_TYPES, "targetType"));
        return List.copyOf(out);
    }

    private static int number(String value, int fallback, int min, int max, String field) {
        if (value == null) return fallback;
        if (!DIGITS.matcher(value).matches()) throw new InvalidQueryException(field, field + " must be a whole number");
        int n = Integer.parseInt(value);
        if (n < min || n > max) throw new InvalidQueryException(field, field + " must be " + min + "-" + max);
        return n;
    }

    /** The web's request id (spec §5.15); a fresh one when the caller sent none. */
    private static UUID requestId(String value) {
        if (value == null) return UUID.randomUUID();
        if (!UUID_TEXT.matcher(value).matches()) throw new InvalidQueryException("requestId", "requestId must be a UUID");
        return UUID.fromString(value);
    }
}
```

Replace `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcFlagAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.AuditPort;
import com.niramoy.bddrug.application.port.FlagPort;
import com.niramoy.bddrug.domain.AuditEvent;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagAudit;
import com.niramoy.bddrug.domain.FlagPage;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Flags and their §5.15 audit rows. The transaction lives here, as in P0's R2dbcReviewAdapter: the flag write and the
 * audit row commit together or not at all. The audit adapter shares the connection through the transaction context.
 */
@Component
public class R2dbcFlagAdapter implements FlagPort {
    private static final String COLS =
        "id, target_type, target_id, message, reporter_email, status, created_at, resolved_at, resolved_by";

    private final DatabaseClient db;
    private final TransactionalOperator tx;
    private final AuditPort audit;
    public R2dbcFlagAdapter(DatabaseClient db, TransactionalOperator tx, AuditPort audit) {
        this.db = db;
        this.tx = tx;
        this.audit = audit;
    }

    @Override public Mono<Flag> create(String targetType, String targetId, String message, String reporterEmail,
                                       UUID requestId) {
        return tx.transactional(db.sql("INSERT INTO ops.flag (target_type, target_id, message, reporter_email) " +
                      "VALUES (:type, :target, :message, :email) RETURNING " + COLS)
            .bind("type", targetType).bind("target", targetId).bind("message", message).bind("email", reporterEmail)
            .map(R2dbcFlagAdapter::toFlag).one()
            .flatMap(f -> audit.append(new AuditEvent(FlagAudit.createdEvent(f.targetType(), f.targetId()), f.reporterEmail(),
                    null, "flag", String.valueOf(f.id()), "accepted", requestId)).thenReturn(f)));
    }

    /** One extra row tells whether another page exists. */
    @Override public Mono<FlagPage> list(String status, List<String> targetTypes, String targetId, String excludeTargetId,
                                         int page, int size) {
        String where = "status = :s" + (targetTypes.isEmpty() ? "" : " AND target_type = ANY(:types)")
            + (targetId == null ? "" : " AND target_id = :tid")
            + (excludeTargetId == null ? "" : " AND target_id <> :xtid");
        DatabaseClient.GenericExecuteSpec spec = db.sql("SELECT " + COLS + " FROM ops.flag WHERE " + where +
                " ORDER BY created_at DESC, id DESC LIMIT :n OFFSET :o")
            .bind("s", status).bind("n", size + 1).bind("o", (long) page * size);
        if (!targetTypes.isEmpty()) spec = spec.bind("types", targetTypes.toArray(String[]::new));
        if (targetId != null) spec = spec.bind("tid", targetId);
        if (excludeTargetId != null) spec = spec.bind("xtid", excludeTargetId);
        return spec.map(R2dbcFlagAdapter::toFlag).all().collectList()
            .map(rows -> new FlagPage(List.copyOf(rows.subList(0, Math.min(size, rows.size()))), page, size, rows.size() > size));
    }

    @Override public Mono<Flag> resolve(long id, String resolvedBy, UUID requestId) {
        return tx.transactional(db.sql("UPDATE ops.flag SET status = 'resolved', resolved_at = now(), resolved_by = :by " +
                      "WHERE id = :id AND status = 'open' RETURNING " + COLS)
            .bind("by", resolvedBy).bind("id", id).map(R2dbcFlagAdapter::toFlag).one()
            .switchIfEmpty(Mono.defer(() -> db.sql("SELECT EXISTS (SELECT 1 FROM ops.flag WHERE id = :id) AS found")
                .bind("id", id).map(r -> r.get("found", Boolean.class)).one()
                .flatMap(found -> Mono.error(found ? new ConflictException("id", "Flag is already resolved")
                                                   : new NotFoundException("id", "Flag not found")))))
            .flatMap(f -> audit.append(new AuditEvent("flag_resolved", resolvedBy, null, "flag", String.valueOf(f.id()),
                    "resolved", requestId)).thenReturn(f)));
    }

    private static Flag toFlag(Readable r) {
        OffsetDateTime resolved = r.get("resolved_at", OffsetDateTime.class);
        return new Flag(r.get("id", Long.class), r.get("target_type", String.class), r.get("target_id", String.class),
            r.get("message", String.class), r.get("reporter_email", String.class), r.get("status", String.class),
            r.get("created_at", OffsetDateTime.class).toInstant(), resolved == null ? null : resolved.toInstant(),
            r.get("resolved_by", String.class));
    }
}
```

Replace `api/src/main/java/com/niramoy/bddrug/presentation/FlagController.java`:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.FlagService;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagPage;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** Problem reports and partner requests. Every endpoint needs the internal token: flags carry reporter emails. */
@RestController
@RequestMapping("/v1/flags")
public class FlagController {
    private final FlagService service;
    private final InternalAuth auth;
    public FlagController(FlagService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    public record ResolveRequest(String resolvedBy, String requestId) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ApiResponse<Flag>> create(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                          @RequestBody Mono<FlagService.Request> body) {
        auth.require(token);
        return body.flatMap(service::create).map(ApiResponse::ok);
    }

    @GetMapping
    public Mono<ApiResponse<FlagPage>> list(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                            @RequestParam(required = false) String status,
                                            @RequestParam(required = false) String targetType,
                                            @RequestParam(required = false) String targetId,
                                            @RequestParam(required = false) String excludeTargetId,
                                            @RequestParam(required = false) String page,
                                            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.list(status, targetType, targetId, excludeTargetId, page, size).map(ApiResponse::ok);
    }

    @PostMapping("/{id}/resolve")
    public Mono<ApiResponse<Flag>> resolve(@PathVariable long id,
                                           @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                           @RequestBody Mono<ResolveRequest> body) {
        auth.require(token);
        return body.flatMap(r -> service.resolve(id, r.resolvedBy(), r.requestId())).map(ApiResponse::ok);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.FlagApiIntegrationTest'`
Expected: BUILD SUCCESSFUL; every `FlagApiIntegrationTest` test passes.

Run: `cd api && ./gradlew test --no-daemon`
Expected: BUILD SUCCESSFUL (no other test reads `GET /v1/flags`).

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/FlagPage.java \
  api/src/main/java/com/niramoy/bddrug/domain/FlagAudit.java \
  api/src/main/java/com/niramoy/bddrug/application/port/FlagPort.java \
  api/src/main/java/com/niramoy/bddrug/application/FlagService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcFlagAdapter.java \
  api/src/main/java/com/niramoy/bddrug/presentation/FlagController.java \
  api/src/test/java/com/niramoy/bddrug/FlagApiIntegrationTest.java
git commit -m "feat(api): paged, filtered flag list and audited flag writes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: API domain — stage notes and triage as pure rules (§5.3, §5.4, §5.5.3, §7.3 "Stage notes")

The web never parses pipeline notes (D13). `StageNotes` splits and classifies them exactly as §7.3 lists; `ReviewTriage` decides filter membership, row hints and the sidebar counts from a record's facts.

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/StageNotes.java`, `api/src/main/java/com/niramoy/bddrug/domain/ReviewTriage.java`
- Test: `api/src/test/java/com/niramoy/bddrug/StageNotesTest.java`, `api/src/test/java/com/niramoy/bddrug/ReviewTriageTest.java`

**Interfaces:**
- Consumes: `ApprovalRule.PENDING`, `APPROVED`, `ENGINEER_CHECKED`, `ISSUE`, `BACK_IN_REVIEW` and `DecisionGuard.STAGES` (P0 Task 6).
- Produces:
  - `StageNotes.parse(String stage, String status, String note) -> List<StageNotes.Note>`, `Note(String kind, String text, String ddinterId, String route)`; kinds `TEXT_MISSING="text_missing"`, `NAME_ONLY="name_only"`, `NO_DATA="no_data"`, `ROUTE_ASSUMED="route_assumed"`, `NO_ROUTE_ENTRY="no_route_entry"`, `OTHER="other"`.
  - `ReviewTriage.SHOWS = List.of("all","needs","warn","issue","approved","nodata")`; `ReviewTriage.Facts(String displayStatus, Map<String,String> stages, int pairsWithoutText, List<String> coverages)` (`coverages` holds `full|none|not_run` for each mapped ingredient); `ReviewTriage.Hint(int failed, int warnings, int pairsWithoutText, boolean noData, boolean notRun)`; `needsReview(String displayStatus)`, `inFilter(String show, Facts)`, `hint(Facts)`, `filterCounts(List<Facts>) -> Map<String,Integer>` (keys in `SHOWS` order).

- [ ] **Step 1: Write the failing tests**

Create `api/src/test/java/com/niramoy/bddrug/StageNotesTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.StageNotes;
import com.niramoy.bddrug.domain.StageNotes.Note;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.3 "Stage notes": split on "; " only for a warn DDInter note; classify each part; fail notes stay whole. */
class StageNotesTest {
    @Test void aWarnDdinterNoteIsSplitAndEachPartClassified() {
        String note = "DDInter text not found for DDInter14/DDInter79; DDInter DDInter20 matched by name only; "
            + "DDInter route assumed: DDInter351 (systemic) used for topical; No DDInter entry for route otic; "
            + "something the pipeline added later";
        assertThat(StageNotes.parse("ddinter", "warn", note)).containsExactly(
            new Note("text_missing", "DDInter text not found for DDInter14/DDInter79", null, null),
            new Note("name_only", "DDInter DDInter20 matched by name only", "DDInter20", null),
            new Note("route_assumed", "DDInter route assumed: DDInter351 (systemic) used for topical", "DDInter351", "topical"),
            new Note("no_route_entry", "No DDInter entry for route otic", null, "otic"),
            new Note("other", "something the pipeline added later", null, null));
    }

    @Test void unknownRouteNotesCarryANullRoute() {
        assertThat(StageNotes.parse("ddinter", "warn",
                "DDInter route assumed: DDInter1951 (systemic) used for unknown route; No DDInter entry for unknown route"))
            .containsExactly(
                new Note("route_assumed", "DDInter route assumed: DDInter1951 (systemic) used for unknown route", "DDInter1951", null),
                new Note("no_route_entry", "No DDInter entry for unknown route", null, null));
    }

    @Test void theNoDataSentenceIsItsOwnKind() {
        assertThat(StageNotes.parse("ddinter", "warn", "No interaction data in DDInter for this substance"))
            .containsExactly(new Note("no_data", "No interaction data in DDInter for this substance", null, null));
    }

    @Test void failNotesAndOtherStagesAreKeptWhole() {
        assertThat(StageNotes.parse("ddinter", "fail", "error: RuntimeError: a; b"))
            .containsExactly(new Note("other", "error: RuntimeError: a; b", null, null));
        assertThat(StageNotes.parse("ddinter", "fail", "DDInter pair list incomplete for DDInter352"))
            .containsExactly(new Note("other", "DDInter pair list incomplete for DDInter352", null, null));
        assertThat(StageNotes.parse("substances", "warn", "approx RxNav match; second clause"))
            .containsExactly(new Note("other", "approx RxNav match; second clause", null, null));
    }

    @Test void emptyNotesGiveNoNotes() {
        assertThat(StageNotes.parse("dgda", "ok", "")).isEmpty();
        assertThat(StageNotes.parse("dgda", "ok", null)).isEmpty();
        assertThat(StageNotes.parse("ddinter", "warn", "   ")).isEmpty();
    }

    @Test void aPatternMustMatchTheWholePart() {
        assertThat(StageNotes.parse("ddinter", "warn", "Note: DDInter text not found for DDInter14/DDInter79").get(0).kind())
            .isEqualTo("other");
        assertThat(StageNotes.parse("ddinter", "warn", "DDInter text not found for DDInter14/DDInter79 (retry)").get(0).kind())
            .isEqualTo("other");
        assertThat(List.of(StageNotes.TEXT_MISSING, StageNotes.NAME_ONLY, StageNotes.NO_DATA, StageNotes.ROUTE_ASSUMED,
            StageNotes.NO_ROUTE_ENTRY, StageNotes.OTHER))
            .containsExactly("text_missing", "name_only", "no_data", "route_assumed", "no_route_entry", "other");
    }
}
```

Create `api/src/test/java/com/niramoy/bddrug/ReviewTriageTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.ReviewTriage;
import com.niramoy.bddrug.domain.ReviewTriage.Facts;
import com.niramoy.bddrug.domain.ReviewTriage.Hint;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §5.3 filters and §5.4 hints, checked against the expected pilot triage after the route fix (§1.6 item 7). */
class ReviewTriageTest {
    static Map<String, String> stages(String ddinter) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("dgda", "ok"); m.put("substances", "ok"); m.put("clinical", "ok"); m.put("ddinter", ddinter);
        return m;
    }
    static Facts pending(String ddinter, int pairs, String... coverages) {
        return new Facts("pending", stages(ddinter), pairs, List.of(coverages));
    }

    /** The 10 pilot records after the P0 re-run, in DAR order. */
    static final List<Facts> PILOT = List.of(
        pending("warn", 4, "full"),          // Amlodipine-5
        pending("warn", 5, "full"),          // Aspirin
        pending("warn", 4, "full"),          // Simvastatin
        pending("ok", 0, "full"),            // Chloramphenicol eye drops
        pending("warn", 0, "none"),          // Domperidone
        pending("warn", 1, "full"),          // G Warfarin
        pending("warn", 5, "full"),          // G-Metformin
        pending("warn", 6, "full"),          // Napa
        pending("warn", 2, "full"),          // Clarith
        pending("warn", 5, "full", "full")); // Amoxycillin Clavulanic Acid

    @Test void thePilotTriageMatchesTheSpec() {
        assertThat(PILOT.stream().map(ReviewTriage::hint).toList()).containsExactly(
            new Hint(0, 1, 4, false, false), new Hint(0, 1, 5, false, false), new Hint(0, 1, 4, false, false),
            new Hint(0, 0, 0, false, false), new Hint(0, 1, 0, true, false), new Hint(0, 1, 1, false, false),
            new Hint(0, 1, 5, false, false), new Hint(0, 1, 6, false, false), new Hint(0, 1, 2, false, false),
            new Hint(0, 1, 5, false, false));
        Map<String, Integer> counts = ReviewTriage.filterCounts(PILOT);
        assertThat(counts.keySet()).containsExactly("all", "needs", "warn", "issue", "approved", "nodata");
        assertThat(counts).containsEntry("all", 10).containsEntry("needs", 10).containsEntry("warn", 9)
            .containsEntry("issue", 0).containsEntry("approved", 0).containsEntry("nodata", 1);
    }

    @Test void needsReviewIsPendingBackInReviewOrEngineerChecked() {
        for (String s : List.of("pending", "back_in_review", "engineer_checked")) assertThat(ReviewTriage.needsReview(s)).isTrue();
        for (String s : List.of("approved", "issue")) assertThat(ReviewTriage.needsReview(s)).isFalse();
    }

    @Test void filtersFollowTheTable() {
        Facts approved = new Facts("approved", stages("ok"), 0, List.of("full"));
        Facts issue = new Facts("issue", stages("ok"), 0, List.of("full"));
        Facts missingStage = new Facts("pending", Map.of("dgda", "ok"), 0, List.of());
        Facts notRun = pending("ok", 0, "not_run");
        assertThat(ReviewTriage.inFilter("approved", approved)).isTrue();
        assertThat(ReviewTriage.inFilter("needs", approved)).isFalse();
        assertThat(ReviewTriage.inFilter("issue", issue)).isTrue();
        assertThat(ReviewTriage.inFilter("warn", missingStage)).as("a stage with no result is not OK").isTrue();
        assertThat(ReviewTriage.inFilter("nodata", notRun)).as("not_run is never no-data").isFalse();
        assertThat(ReviewTriage.hint(notRun)).isEqualTo(new Hint(0, 0, 0, false, true));
        assertThat(ReviewTriage.inFilter("all", issue)).isTrue();
    }

    @Test void failedAndWarningStagesAreCountedSeparately() {
        Map<String, String> s = new LinkedHashMap<>(stages("warn"));
        s.put("dgda", "fail");
        s.put("clinical", "fail");
        assertThat(ReviewTriage.hint(new Facts("pending", s, 3, new ArrayList<>(List.of("full")))))
            .isEqualTo(new Hint(2, 1, 3, false, false));
    }

    @Test void aStageWithNoResultCountsAsFailedNeverAllOk() {
        // Same rule as hasWarning, the Failed row in "Automated checks" and DecisionGuard step 5: a missing stage blocks.
        assertThat(ReviewTriage.hint(new Facts("pending", Map.of("dgda", "ok"), 0, List.of())))
            .isEqualTo(new Hint(3, 0, 0, false, false));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.StageNotesTest' --tests 'com.niramoy.bddrug.ReviewTriageTest'`
Expected: compilation FAILS — `package com.niramoy.bddrug.domain.StageNotes does not exist`, `cannot find symbol: class ReviewTriage`.

- [ ] **Step 3: Implement**

Create `api/src/main/java/com/niramoy/bddrug/domain/StageNotes.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The pipeline's stage note, split and classified for the web (spec §7.3 "Stage notes", D13). Only a DDInter note whose
 * stage status is {@code warn} is split on "; "; every other note, including every fail note, is one part. Each part is
 * matched against the whole-string patterns below; anything else is {@code other} and is shown verbatim.
 */
public final class StageNotes {
    private StageNotes() {}

    public static final String TEXT_MISSING = "text_missing", NAME_ONLY = "name_only", NO_DATA = "no_data",
        ROUTE_ASSUMED = "route_assumed", NO_ROUTE_ENTRY = "no_route_entry", OTHER = "other";

    /** {@code ddinterId} for name_only and route_assumed; {@code route} for route_assumed and no_route_entry (null = unknown). */
    public record Note(String kind, String text, String ddinterId, String route) {}

    private static final Pattern TEXT = Pattern.compile("^DDInter text not found for (DDInter\\d+)/(DDInter\\d+)$");
    private static final Pattern NAME = Pattern.compile("^DDInter (DDInter\\d+) matched by name only$");
    private static final Pattern NODATA = Pattern.compile("^No interaction data in DDInter for this substance$");
    private static final Pattern ASSUMED_UNKNOWN =
        Pattern.compile("^DDInter route assumed: (DDInter\\d+) \\((\\w+)\\) used for unknown route$");
    private static final Pattern ASSUMED = Pattern.compile("^DDInter route assumed: (DDInter\\d+) \\((\\w+)\\) used for (\\w+)$");
    private static final Pattern NO_ROUTE_UNKNOWN = Pattern.compile("^No DDInter entry for unknown route$");
    private static final Pattern NO_ROUTE = Pattern.compile("^No DDInter entry for route (\\w+)$");

    public static List<Note> parse(String stage, String status, String note) {
        if (note == null || note.isBlank()) return List.of();
        String[] parts = "ddinter".equals(stage) && "warn".equals(status) ? note.split("; ") : new String[]{note};
        List<Note> out = new ArrayList<>();
        for (String p : parts) if (!p.isBlank()) out.add(classify(p));
        return List.copyOf(out);
    }

    static Note classify(String text) {
        Matcher m;
        if (TEXT.matcher(text).matches()) return new Note(TEXT_MISSING, text, null, null);
        if ((m = NAME.matcher(text)).matches()) return new Note(NAME_ONLY, text, m.group(1), null);
        if (NODATA.matcher(text).matches()) return new Note(NO_DATA, text, null, null);
        if ((m = ASSUMED_UNKNOWN.matcher(text)).matches()) return new Note(ROUTE_ASSUMED, text, m.group(1), null);
        if ((m = ASSUMED.matcher(text)).matches()) return new Note(ROUTE_ASSUMED, text, m.group(1), m.group(3));
        if (NO_ROUTE_UNKNOWN.matcher(text).matches()) return new Note(NO_ROUTE_ENTRY, text, null, null);
        if ((m = NO_ROUTE.matcher(text)).matches()) return new Note(NO_ROUTE_ENTRY, text, null, m.group(1));
        return new Note(OTHER, text, null, null);
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/domain/ReviewTriage.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Spec §5.3 filters and §5.4 row hints, from one record's facts. The web turns a {@link Hint} into words; the order of
 * the hint rules (failed, then warnings) is the web's (§5.4), this class only counts.
 */
public final class ReviewTriage {
    private ReviewTriage() {}

    public static final List<String> SHOWS = List.of("all", "needs", "warn", "issue", "approved", "nodata");

    /**
     * {@code stages} maps a stage to its status (a stage with no result is absent); {@code pairsWithoutText} is the
     * DDInter stage's {@code evidence.text_missing} count; {@code coverages} holds one of full, none, not_run per mapped
     * ingredient (an ingredient with no substance is left out: it is unmapped, not "not run").
     */
    public record Facts(String displayStatus, Map<String, String> stages, int pairsWithoutText, List<String> coverages) {}
    public record Hint(int failed, int warnings, int pairsWithoutText, boolean noData, boolean notRun) {}

    public static boolean needsReview(String displayStatus) {
        return ApprovalRule.PENDING.equals(displayStatus) || ApprovalRule.BACK_IN_REVIEW.equals(displayStatus)
            || ApprovalRule.ENGINEER_CHECKED.equals(displayStatus);
    }

    /** Any of the four stages whose status is not ok, a missing result included. */
    static boolean hasWarning(Facts f) {
        return DecisionGuard.STAGES.stream().anyMatch(s -> !"ok".equals(f.stages().get(s)));
    }

    public static boolean inFilter(String show, Facts f) {
        return switch (show) {
            case "needs" -> needsReview(f.displayStatus());
            case "warn" -> hasWarning(f);
            case "issue" -> ApprovalRule.ISSUE.equals(f.displayStatus());
            case "approved" -> ApprovalRule.APPROVED.equals(f.displayStatus());
            case "nodata" -> f.coverages().contains("none");
            default -> true;
        };
    }

    public static Hint hint(Facts f) {
        int failed = 0, warnings = 0;
        for (String s : DecisionGuard.STAGES) {
            String status = f.stages().get(s);
            if (status == null || "fail".equals(status)) failed++;      // no result blocks approval like a failure (§7.2 step 5)
            else if ("warn".equals(status)) warnings++;
        }
        return new Hint(failed, warnings, f.pairsWithoutText(), f.coverages().contains("none"), f.coverages().contains("not_run"));
    }

    public static Map<String, Integer> filterCounts(List<Facts> all) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (String show : SHOWS) out.put(show, (int) all.stream().filter(f -> inFilter(show, f)).count());
        return out;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.StageNotesTest' --tests 'com.niramoy.bddrug.ReviewTriageTest'`
Expected: BUILD SUCCESSFUL; 6 `StageNotesTest` and 4 `ReviewTriageTest` tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/StageNotes.java api/src/main/java/com/niramoy/bddrug/domain/ReviewTriage.java \
  api/src/test/java/com/niramoy/bddrug/StageNotesTest.java api/src/test/java/com/niramoy/bddrug/ReviewTriageTest.java
git commit -m "feat(api): stage notes and review triage as pure rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: API domain — history, the reopen reason and the snapshot diff (§5.6.5, §5.11, §7.3)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/ItemHistory.java`, `api/src/main/java/com/niramoy/bddrug/domain/SnapshotDiff.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ItemHistoryTest.java`, `api/src/test/java/com/niramoy/bddrug/SnapshotDiffTest.java`

**Interfaces:**
- Consumes: the V6 snapshot payload v1 (P0 Task 5): `{version:1, extracted_at, brand:{dar_number,trade_name,company,dosage_form,generic_content_raw}|null, clinical_drug:{bdc_id,display_name,dose_form,route}|null, ingredients:[{xm_code,name,bds_id,substance,strength:{raw,value,unit,per_value,per_unit}|null,codes:[{system,code,route_scope}],ddinter_chosen:[ids],route_assumed}], stages:{stage:{status,note}}}`; Jackson `JsonNode`.
- Produces:
  - `ItemHistory.build(List<Instant> fullRuns, List<ItemHistory.Snapshot> snapshots, List<ItemHistory.Decision> decisions, Instant extractedAt) -> ItemHistory.Result`;
    `Snapshot(Instant extractedAt, UUID runId, String reason)`, `Decision(long id, String decision, String note, String role, Instant decidedAt, boolean mine)`,
    `Entry(String kind, Instant at, String reason, String role, String decision, String note, Boolean counts, Boolean mine)` (JSON omits nulls),
    `Reopen(String reason, Instant at, Instant previousExtractedAt, boolean diffAvailable)`, `Result(List<Entry> history, Reopen reopen)`.
  - `SnapshotDiff.diff(JsonNode before, JsonNode now) -> List<SnapshotDiff.Row>`, `Row(String field, String before, String now)`; field names exactly "Trade name", "Company", "Dosage form", "Generic content", "Clinical drug", "Route", "Substance n", "Strength n", "Codes n", "DDInter entries n" (the " n" suffix only when either side has more than one ingredient), "{Stage} check", "{Stage} note" for DGDA load, Substances, Clinical drug, DDInter, and "Pipeline extracted at".

- [ ] **Step 1: Write the failing tests**

Create `api/src/test/java/com/niramoy/bddrug/ItemHistoryTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.ItemHistory;
import com.niramoy.bddrug.domain.ItemHistory.Decision;
import com.niramoy.bddrug.domain.ItemHistory.Entry;
import com.niramoy.bddrug.domain.ItemHistory.Reopen;
import com.niramoy.bddrug.domain.ItemHistory.Snapshot;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §5.6.5: one extract entry per run_id, at the last stamp of that run; reopen from the last two groups. */
class ItemHistoryTest {
    static final Instant T0 = Instant.parse("2026-10-11T21:27:17Z");
    static Instant t(int minutes) { return T0.plusSeconds(60L * minutes); }
    static final UUID RUN_1 = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID RUN_2 = UUID.fromString("00000000-0000-0000-0000-000000000002");
    static final UUID RUN_3 = UUID.fromString("00000000-0000-0000-0000-000000000003");

    @Test void aFullRunWritesFourSnapshotsAndShowsOneExtractEntry() {
        List<Snapshot> four = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(2), RUN_1, "rerun"),
            new Snapshot(t(3), RUN_1, "rerun"), new Snapshot(t(4), RUN_1, "rerun"));
        ItemHistory.Result r = ItemHistory.build(List.of(t(0)), four, List.of(), t(4));
        assertThat(r.history()).containsExactly(
            new Entry("run", t(0), null, null, null, null, null, null),
            new Entry("extract", t(4), "run", null, null, null, null, null));
        assertThat(r.reopen()).isNull();
    }

    @Test void aLaterRunIsARerunAndReopensTheRecord() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(2), RUN_1, "rerun"),
            new Snapshot(t(30), RUN_2, "rerun"));
        List<Decision> decisions = List.of(new Decision(7, "ok", "", "pharmacist", t(10), true));
        ItemHistory.Result r = ItemHistory.build(List.of(t(0)), snaps, decisions, t(30));
        assertThat(r.history()).containsExactly(
            new Entry("run", t(0), null, null, null, null, null, null),
            new Entry("extract", t(2), "run", null, null, null, null, null),
            new Entry("decision", t(10), null, "pharmacist", "ok", "", false, true),
            new Entry("extract", t(30), "rerun", null, null, null, null, null));
        assertThat(r.reopen()).isEqualTo(new Reopen("rerun", t(30), t(2), true));
    }

    @Test void aGroupOfSharedChangesKeepsThatReason() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(20), RUN_2, "shared_change"));
        ItemHistory.Result r = ItemHistory.build(List.of(), snaps, List.of(), t(20));
        assertThat(r.history().get(1)).isEqualTo(new Entry("extract", t(20), "shared_change", null, null, null, null, null));
        assertThat(r.reopen()).isEqualTo(new Reopen("shared_change", t(20), t(1), true));
    }

    @Test void aMixedGroupIsARerun() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"),
            new Snapshot(t(20), RUN_3, "shared_change"), new Snapshot(t(21), RUN_3, "rerun"));
        assertThat(ItemHistory.build(List.of(), snaps, List.of(), t(21)).reopen().reason()).isEqualTo("rerun");
    }

    @Test void decisionsAfterTheStampCountAndOnlyTheViewersAreMine() {
        List<Snapshot> one = List.of(new Snapshot(t(1), RUN_1, "run"));
        List<Decision> ds = List.of(new Decision(1, "ok", "", "engineer", t(5), false),
            new Decision(2, "issue", "strength should read 5 mg", "pharmacist", t(6), true));
        List<Entry> h = ItemHistory.build(List.of(), one, ds, t(1)).history();
        assertThat(h).extracting(Entry::kind).containsExactly("extract", "decision", "decision");
        assertThat(h.get(1).counts()).isTrue();
        assertThat(h.get(1).mine()).isFalse();
        assertThat(h.get(2).note()).isEqualTo("strength should read 5 mg");
        assertThat(h.get(2).mine()).isTrue();
    }

    @Test void anItemWithAStampButNoSnapshotShowsOneExtractEntry() {
        ItemHistory.Result r = ItemHistory.build(List.of(), List.of(), List.of(), t(3));
        assertThat(r.history()).containsExactly(new Entry("extract", t(3), "run", null, null, null, null, null));
        assertThat(r.reopen()).isNull();
    }

    @Test void diffIsUnavailableWhenTheCurrentStampHasNoSnapshot() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(9), RUN_2, "rerun"));
        assertThat(ItemHistory.build(List.of(), snaps, List.of(), t(12)).reopen())
            .isEqualTo(new Reopen("rerun", t(12), t(1), false));
    }

    @Test void entriesAtTheSameInstantKeepRunExtractDecisionOrder() {
        List<Snapshot> one = List.of(new Snapshot(t(1), RUN_1, "run"));
        List<Decision> ds = List.of(new Decision(1, "ok", "", "pharmacist", t(1), false));
        assertThat(ItemHistory.build(List.of(t(1)), one, ds, null).history())
            .extracting(Entry::kind).containsExactly("run", "extract", "decision");
    }
}
```

Create `api/src/test/java/com/niramoy/bddrug/SnapshotDiffTest.java`:

```java
package com.niramoy.bddrug;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.domain.SnapshotDiff;
import com.niramoy.bddrug.domain.SnapshotDiff.Row;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.3 /diff: a fixed field list compared between two snapshot payloads (v1). */
class SnapshotDiffTest {
    static final ObjectMapper JSON = new ObjectMapper();

    static JsonNode payload(String tradeName, String strengthValue, String ddinterNote, String chosen, String extractedAt,
                            String secondIngredient) throws Exception {
        String ing = """
            {"xm_code":"XM2TE7","name":"Chloramphenicol","bds_id":"BDS-000009","substance":"Chloramphenicol",
             "strength":{"raw":"Chloramphenicol 5 mg/ml","value":"%s","unit":"mg","per_value":"1","per_unit":"ml"},
             "codes":[{"system":"ICD11_XM","code":"XM2TE7","route_scope":"any"},{"system":"ATC","code":"S01AA01","route_scope":"any"},
                      {"system":"DDINTER","code":"DDInter352","route_scope":"ophthalmic"}],
             "ddinter_chosen":[%s],"route_assumed":false}""".formatted(strengthValue, chosen);
        return JSON.readTree("""
            {"version":1,"extracted_at":"%s",
             "brand":{"dar_number":"127-0163-052","trade_name":"%s","company":"EDCL (Dhaka)","dosage_form":"Eye Drops",
                      "generic_content_raw":"Chloramphenicol 5 mg/ml"},
             "clinical_drug":{"bdc_id":"BDC-000008","display_name":"Chloramphenicol 5 mg/ml eye drops","dose_form":"Eye Drops","route":"ophthalmic"},
             "ingredients":[%s%s],
             "stages":{"dgda":{"status":"ok","note":""},"ddinter":{"status":"warn","note":"%s"}}}"""
            .formatted(extractedAt, tradeName, ing, secondIngredient == null ? "" : "," + secondIngredient, ddinterNote));
    }

    @Test void identicalPayloadsHaveNoRows() throws Exception {
        JsonNode a = payload("Chloramphenicol", "5", "n", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        assertThat(SnapshotDiff.diff(a, a)).isEmpty();
    }

    @Test void changedCellsAreListedInTheFixedOrder() throws Exception {
        JsonNode before = payload("Chloramphenicol", "5", "DDInter text not found for DDInter14/DDInter351", "\"DDInter351\"",
            "2026-10-11T21:30:00Z", null);
        JsonNode now = payload("Chloramphenicol Eye", "5.0", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(
            new Row("Trade name", "Chloramphenicol", "Chloramphenicol Eye"),
            new Row("DDInter entries", "DDInter351", "DDInter352"),
            new Row("DDInter note", "DDInter text not found for DDInter14/DDInter351", ""),
            new Row("Pipeline extracted at", "2026-10-11T21:30:00Z", "2026-10-12T09:00:00Z"));
    }

    @Test void strengthsAreComparedAsNumbersAndWrittenWithTheirPer() throws Exception {
        JsonNode before = payload("C", "5", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        JsonNode now = payload("C", "0.50", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(new Row("Strength", "5 mg per 1 ml", "0.5 mg per 1 ml"));
    }

    @Test void severalIngredientsAreNumberedAndAnAddedOneHasNoBefore() throws Exception {
        String second = """
            {"xm_code":"XM7CM1","name":"Amoxicillin","bds_id":"BDS-000008","substance":"Amoxicillin","strength":null,
             "codes":[],"ddinter_chosen":[],"route_assumed":false}""";
        JsonNode before = payload("C", "5", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        JsonNode now = payload("C", "5", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", second);
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(
            new Row("Substance 2", null, "Amoxicillin (BDS-000008)"),
            new Row("Strength 2", null, ""),
            new Row("Codes 2", null, ""),
            new Row("DDInter entries 2", null, ""));
    }

    @Test void stageStatusChangesUseTheStageName() throws Exception {
        JsonNode before = JSON.readTree("{\"version\":1,\"extracted_at\":\"x\",\"brand\":null,\"clinical_drug\":null,\"ingredients\":[],"
            + "\"stages\":{\"clinical\":{\"status\":\"fail\",\"note\":\"no strength\"}}}");
        JsonNode now = JSON.readTree("{\"version\":1,\"extracted_at\":\"x\",\"brand\":null,\"clinical_drug\":null,\"ingredients\":[],"
            + "\"stages\":{\"clinical\":{\"status\":\"ok\",\"note\":\"\"}}}");
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(
            new Row("Clinical drug check", "fail", "ok"), new Row("Clinical drug note", "no strength", ""));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ItemHistoryTest' --tests 'com.niramoy.bddrug.SnapshotDiffTest'`
Expected: compilation FAILS — `cannot find symbol: class ItemHistory`, `class SnapshotDiff`.

- [ ] **Step 3: Implement**

Create `api/src/main/java/com/niramoy/bddrug/domain/ItemHistory.java`:

```java
package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A record's history (spec §5.6.5) and its reopen reason (§5.11, §7.3), from snapshots and decisions.
 * Every stage of one ETL invocation stamps the item with the same run_id, so the snapshots of a run collapse into one
 * {@code extract} entry at the run's last stamp. Its reason: {@code run} when the group holds the item's first snapshot,
 * {@code shared_change} when every snapshot in it is shared_change, {@code rerun} otherwise.
 */
public final class ItemHistory {
    private ItemHistory() {}

    public record Snapshot(Instant extractedAt, UUID runId, String reason) {}
    /** {@code mine} is decided by the caller (the decision's email equals the viewer's, case-insensitively). */
    public record Decision(long id, String decision, String note, String role, Instant decidedAt, boolean mine) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Entry(String kind, Instant at, String reason, String role, String decision, String note, Boolean counts,
                        Boolean mine) {}
    public record Reopen(String reason, Instant at, Instant previousExtractedAt, boolean diffAvailable) {}
    public record Result(List<Entry> history, Reopen reopen) {}

    private record Group(Instant at, String reason) {}

    private static final Map<String, Integer> KIND_ORDER = Map.of("run", 0, "extract", 1, "decision", 2);

    public static Result build(List<Instant> fullRuns, List<Snapshot> snapshots, List<Decision> decisions, Instant extractedAt) {
        List<Group> groups = groups(snapshots, extractedAt);
        List<Entry> out = new ArrayList<>();
        for (Instant at : fullRuns) out.add(new Entry("run", at, null, null, null, null, null, null));
        for (Group g : groups) out.add(new Entry("extract", g.at(), g.reason(), null, null, null, null, null));
        for (Decision d : decisions) {
            boolean counts = extractedAt == null || d.decidedAt().isAfter(extractedAt);
            out.add(new Entry("decision", d.decidedAt(), null, d.role(), d.decision(), d.note(), counts, d.mine()));
        }
        out.sort(Comparator.comparing(Entry::at).thenComparing(e -> KIND_ORDER.get(e.kind())));
        Reopen reopen = null;
        if (groups.size() >= 2) {
            Group current = groups.get(groups.size() - 1), previous = groups.get(groups.size() - 2);
            boolean currentHasSnapshot = snapshots.stream().anyMatch(s -> s.extractedAt().equals(extractedAt));
            reopen = new Reopen("shared_change".equals(current.reason()) ? "shared_change" : "rerun",
                extractedAt == null ? current.at() : extractedAt, previous.at(), currentHasSnapshot);
        }
        return new Result(List.copyOf(out), reopen);
    }

    private static List<Group> groups(List<Snapshot> snapshots, Instant extractedAt) {
        if (snapshots.isEmpty()) return extractedAt == null ? List.of() : List.of(new Group(extractedAt, "run"));
        Instant first = snapshots.stream().map(Snapshot::extractedAt).min(Comparator.naturalOrder()).orElseThrow();
        Map<UUID, List<Snapshot>> byRun = new LinkedHashMap<>();
        for (Snapshot s : snapshots) byRun.computeIfAbsent(s.runId(), k -> new ArrayList<>()).add(s);
        List<Group> out = new ArrayList<>();
        for (List<Snapshot> run : byRun.values()) {
            Instant last = run.stream().map(Snapshot::extractedAt).max(Comparator.naturalOrder()).orElseThrow();
            String reason = run.stream().anyMatch(s -> s.extractedAt().equals(first)) ? "run"
                : run.stream().allMatch(s -> "shared_change".equals(s.reason())) ? "shared_change" : "rerun";
            out.add(new Group(last, reason));
        }
        out.sort(Comparator.comparing(Group::at));
        return out;
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/domain/SnapshotDiff.java`:

```java
package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Spec §7.3 /diff: the cells that differ between two snapshot payloads (v1), over a fixed field list. A cell that is
 * absent on one side (an ingredient added or dropped) is null there. Numbers are compared as numbers ("5" = "5.0").
 */
public final class SnapshotDiff {
    private SnapshotDiff() {}

    public record Row(String field, String before, String now) {}

    private static final List<String[]> STAGES = List.of(new String[]{"dgda", "DGDA load"}, new String[]{"substances", "Substances"},
        new String[]{"clinical", "Clinical drug"}, new String[]{"ddinter", "DDInter"});

    public static List<Row> diff(JsonNode before, JsonNode now) {
        List<Row> rows = new ArrayList<>();
        add(rows, "Trade name", text(before, "brand", "trade_name"), text(now, "brand", "trade_name"));
        add(rows, "Company", text(before, "brand", "company"), text(now, "brand", "company"));
        add(rows, "Dosage form", text(before, "brand", "dosage_form"), text(now, "brand", "dosage_form"));
        add(rows, "Generic content", text(before, "brand", "generic_content_raw"), text(now, "brand", "generic_content_raw"));
        add(rows, "Clinical drug", clinical(before), clinical(now));
        add(rows, "Route", text(before, "clinical_drug", "route"), text(now, "clinical_drug", "route"));
        JsonNode ib = before.path("ingredients"), in = now.path("ingredients");
        int n = Math.max(ib.size(), in.size());
        for (int i = 0; i < n; i++) {
            String suffix = n > 1 ? " " + (i + 1) : "";
            JsonNode a = i < ib.size() ? ib.get(i) : null, b = i < in.size() ? in.get(i) : null;
            add(rows, "Substance" + suffix, substance(a), substance(b));
            add(rows, "Strength" + suffix, strength(a), strength(b));
            add(rows, "Codes" + suffix, codes(a), codes(b));
            add(rows, "DDInter entries" + suffix, entries(a), entries(b));
        }
        for (String[] s : STAGES) {
            add(rows, s[1] + " check", text(before, "stages", s[0], "status"), text(now, "stages", s[0], "status"));
            add(rows, s[1] + " note", text(before, "stages", s[0], "note"), text(now, "stages", s[0], "note"));
        }
        add(rows, "Pipeline extracted at", text(before, "extracted_at"), text(now, "extracted_at"));
        return List.copyOf(rows);
    }

    private static void add(List<Row> rows, String field, String before, String now) {
        if (!Objects.equals(before, now)) rows.add(new Row(field, before, now));
    }

    private static String text(JsonNode root, String... path) {
        JsonNode n = root;
        for (String p : path) n = n == null ? null : n.get(p);
        return n == null || n.isNull() ? null : n.asText();
    }

    private static String clinical(JsonNode p) {
        String name = text(p, "clinical_drug", "display_name"), id = text(p, "clinical_drug", "bdc_id");
        return name == null ? null : name + " (" + id + ")";
    }

    private static String substance(JsonNode ing) {
        if (ing == null) return null;
        String name = text(ing, "substance") != null ? text(ing, "substance") : text(ing, "name");
        String bds = text(ing, "bds_id");
        return bds == null ? name : name + " (" + bds + ")";
    }

    private static String strength(JsonNode ing) {
        if (ing == null) return null;
        JsonNode s = ing.get("strength");
        if (s == null || s.isNull()) return "";
        String text = number(text(s, "value")) + " " + text(s, "unit");
        String per = number(text(s, "per_value"));
        return per == null ? text : text + " per " + per + " " + text(s, "per_unit");
    }

    private static String number(String v) {
        if (v == null) return null;
        try {
            BigDecimal d = new BigDecimal(v).stripTrailingZeros();
            return (d.scale() < 0 ? d.setScale(0) : d).toPlainString();
        } catch (NumberFormatException e) {
            return v;
        }
    }

    private static String codes(JsonNode ing) {
        if (ing == null) return null;
        List<String> out = new ArrayList<>();
        for (JsonNode c : ing.path("codes")) if (!"DDINTER".equals(text(c, "system"))) out.add(text(c, "system") + " " + text(c, "code"));
        out.sort(String::compareTo);
        return String.join(", ", out);
    }

    private static String entries(JsonNode ing) {
        if (ing == null) return null;
        List<String> out = new ArrayList<>();
        for (JsonNode id : ing.path("ddinter_chosen")) out.add(id.asText());
        String text = String.join(", ", out);
        return ing.path("route_assumed").asBoolean(false) && !out.isEmpty() ? text + ", route assumed" : text;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ItemHistoryTest' --tests 'com.niramoy.bddrug.SnapshotDiffTest'`
Expected: BUILD SUCCESSFUL; 8 `ItemHistoryTest` and 5 `SnapshotDiffTest` tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/ItemHistory.java api/src/main/java/com/niramoy/bddrug/domain/SnapshotDiff.java \
  api/src/test/java/com/niramoy/bddrug/ItemHistoryTest.java api/src/test/java/com/niramoy/bddrug/SnapshotDiffTest.java
git commit -m "feat(api): record history, reopen reason and snapshot diff as pure rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: API domain — route-aware batch pairs and not-checked reasons (§5.6.2, §6.7.2 rules 1–4, D14, D15, D46)

"`batchPairs` applies RouteRule on both sides, per record route" (§7.3). One pure function computes, for the open record, the DDInter pairs with the other current records of its batch, the pairs it cannot check and why, and the batch-wide pair count `totalBatchPairs` that "None of the {N} batch pairs…" uses.

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java`
- Test: `api/src/test/java/com/niramoy/bddrug/BatchPairsTest.java`

**Interfaces:**
- Consumes: `RouteRule.choose(Collection<DdinterCode>, String route) -> Optional<RouteRule.Choice>`, `DdinterCode(String code, String routeScope)` (existing).
- Produces: `BatchPairs.compute(String conceptId, List<BatchPairs.Product> products, List<BatchPairs.PairRow> rows, Set<String> completeIds) -> BatchPairs.Result` with
  - `Substance(String bdsId, String name, String coverage, List<DdinterCode> codes)` — `coverage` ∈ `full|none|not_run`, `bdsId` null = unmapped;
  - `Product(String conceptId, String tradeName, int index, String route, List<Substance> substances)`;
  - `PairRow(String ddinterA, String ddinterB, String nameA, String nameB, String severity, List<String> actions, String interaction, String management)`;
  - `PartnerRef(String conceptId, String tradeName, int index)`;
  - `Pair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance, String severity, List<String> actions, String interaction, String management, List<PartnerRef> partners)`;
  - `NotChecked(String substance, String partnerSubstance, List<PartnerRef> partners, String reason, String side, String route)` — `reason` ∈ `no_data|not_run|no_route|unmapped|same_product`, `side` ∈ `this|partner` (whose substance the reason applies to), `route` = that product's route;
  - `Result(int totalBatchPairs, List<Pair> pairs, List<NotChecked> notChecked)`.
  - Rules: a substance is usable only when it has a BDS (`unmapped`), coverage `full` (`none` → `no_data`, anything else → `not_run`), RouteRule finds an entry for its product's route (`no_route`), and every chosen entry has a `curated.ddinter_drug` row (`completeIds`; otherwise `not_run`, §7.4 "checked only when both chosen entries have a row"). When both sides are unusable, the reason is the first of `no_data`, `unmapped`, `not_run`, `no_route` (this side wins a tie). The same BDS in two products is never paired (§6.7.2 rule 4). Pairs are ordered by severity rank (major, moderate, minor, then anything else), then partner substance, then ids; partners by record index.

- [ ] **Step 1: Write the failing test**

Create `api/src/test/java/com/niramoy/bddrug/BatchPairsTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.BatchPairs.NotChecked;
import com.niramoy.bddrug.domain.BatchPairs.Pair;
import com.niramoy.bddrug.domain.BatchPairs.PairRow;
import com.niramoy.bddrug.domain.BatchPairs.PartnerRef;
import com.niramoy.bddrug.domain.BatchPairs.Product;
import com.niramoy.bddrug.domain.BatchPairs.Substance;
import com.niramoy.bddrug.domain.DdinterCode;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.6.2 batch pairs with RouteRule on both sides; the eye drop is checked against DDInter352 (§1.5). */
class BatchPairsTest {
    static DdinterCode dd(String id, String scope) { return new DdinterCode(id, scope); }
    static Substance sub(String bds, String name, String coverage, DdinterCode... codes) {
        return new Substance(bds, name, coverage, List.of(codes));
    }
    static Product p(String id, int index, String route, Substance... s) { return new Product(id, id + " brand", index, route, List.of(s)); }

    static final Substance WARFARIN = sub("BDS-1", "Warfarin", "full", dd("DDInter1951", "systemic"));
    static final Substance ASPIRIN = sub("BDS-2", "Acetylsalicylic acid", "full", dd("DDInter20", "systemic"));
    static final Substance CHLORAMPHENICOL = sub("BDS-3", "Chloramphenicol", "full",
        dd("DDInter351", "systemic"), dd("DDInter352", "ophthalmic"), dd("DDInter353", "otic"));
    static final Substance DOMPERIDONE = sub("BDS-4", "Domperidone", "none");
    static final Substance NEWMOL = sub(null, "Newmol", "not_run");
    static final Substance MUPIROCIN = sub("BDS-6", "Mupirocin", "full", dd("DDInter900", "topical"));
    static final Substance NEWCILLIN = sub("BDS-7", "Newcillin", "not_run");
    static final Substance AMOXICILLIN = sub("BDS-8", "Amoxicillin", "full", dd("DDInter83", "systemic"));
    static final Substance CLAVULANIC = sub("BDS-9", "Clavulanic acid", "full", dd("DDInter394", "systemic"));

    static final List<Product> BATCH = List.of(
        p("W", 1, "systemic", WARFARIN), p("W2", 2, "systemic", WARFARIN), p("A", 3, "systemic", ASPIRIN),
        p("EYE", 4, "ophthalmic", CHLORAMPHENICOL), p("CAP", 5, "systemic", CHLORAMPHENICOL), p("D", 6, "systemic", DOMPERIDONE),
        p("NEW", 7, "systemic", NEWMOL), p("NASAL", 8, "nasal", MUPIROCIN), p("NR", 9, "systemic", NEWCILLIN),
        p("COMBO", 10, "systemic", AMOXICILLIN, CLAVULANIC));

    static final List<PairRow> ROWS = List.of(
        new PairRow("DDInter1951", "DDInter20", "Warfarin", "Acetylsalicylic acid", "major", List.of("synergy"),
            "Aspirin may increase the anticoagulant effect of warfarin.", "Avoid the combination; monitor INR."),
        new PairRow("DDInter1951", "DDInter351", "Warfarin", "Chloramphenicol", "moderate", List.of("metabolism"), null, null),
        new PairRow("DDInter1951", "DDInter83", "Warfarin", "Amoxicillin", "minor", List.of(), null, null),
        new PairRow("DDInter20", "DDInter83", "Acetylsalicylic acid", "Amoxicillin", "unknown", List.of("unknown"), null, null),
        new PairRow("DDInter14", "DDInter1951", "Acetaminophen", "Warfarin", "moderate", List.of(), null, null));

    static final Set<String> COMPLETE = Set.of("DDInter1951", "DDInter20", "DDInter351", "DDInter352", "DDInter353",
        "DDInter83", "DDInter394");

    static PartnerRef ref(String id, int index) { return new PartnerRef(id, id + " brand", index); }

    @Test void theEyeDropIsCheckedAgainstTheOphthalmicEntryAndHasNoPilotPair() {
        BatchPairs.Result r = BatchPairs.compute("EYE", BATCH, ROWS, COMPLETE);
        assertThat(r.totalBatchPairs()).isEqualTo(4);
        assertThat(r.pairs()).isEmpty();
        assertThat(r.notChecked()).containsExactly(
            new NotChecked("Chloramphenicol", "Domperidone", List.of(ref("D", 6)), "no_data", "partner", "systemic"),
            new NotChecked("Chloramphenicol", "Newmol", List.of(ref("NEW", 7)), "unmapped", "partner", "systemic"),
            new NotChecked("Chloramphenicol", "Mupirocin", List.of(ref("NASAL", 8)), "no_route", "partner", "nasal"),
            new NotChecked("Chloramphenicol", "Newcillin", List.of(ref("NR", 9)), "not_run", "partner", "systemic"));
    }

    @Test void warfarinPairsAreRouteChosenOrderedBySeverityAndNeverWithItsOwnSubstance() {
        BatchPairs.Result r = BatchPairs.compute("W", BATCH, ROWS, COMPLETE);
        assertThat(r.pairs()).extracting(Pair::ddinterA, Pair::ddinterB, Pair::severity, Pair::partnerSubstance)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("DDInter1951", "DDInter20", "major", "Acetylsalicylic acid"),
                org.assertj.core.groups.Tuple.tuple("DDInter1951", "DDInter351", "moderate", "Chloramphenicol"),
                org.assertj.core.groups.Tuple.tuple("DDInter1951", "DDInter83", "minor", "Amoxicillin"));
        assertThat(r.pairs().get(1).partners()).as("the capsule, never the eye drop").containsExactly(ref("CAP", 5));
        assertThat(r.pairs().get(0).substance()).isEqualTo("Warfarin");
        assertThat(r.pairs().get(0).management()).isEqualTo("Avoid the combination; monitor INR.");
        assertThat(r.pairs()).noneMatch(x -> x.partners().contains(ref("W2", 2)));
    }

    @Test void onePairIsListedOnceWithEveryRecordThatCarriesThePartner() {
        BatchPairs.Result r = BatchPairs.compute("A", BATCH, ROWS, COMPLETE);
        assertThat(r.pairs()).hasSize(2);
        assertThat(r.pairs().get(0).partners()).containsExactly(ref("W", 1), ref("W2", 2));
        assertThat(r.pairs().get(1).severity()).isEqualTo("unknown");
        assertThat(r.pairs().get(1).partners()).containsExactly(ref("COMBO", 10));
    }

    @Test void aNoDataRecordListsEveryPartnerAsNotCheckedOnItsOwnSide() {
        BatchPairs.Result r = BatchPairs.compute("D", BATCH, ROWS, COMPLETE);
        assertThat(r.pairs()).isEmpty();
        assertThat(r.notChecked()).allMatch(n -> n.reason().equals("no_data") && n.side().equals("this"));
        assertThat(r.notChecked()).extracting(NotChecked::partnerSubstance).containsExactly("Warfarin", "Acetylsalicylic acid",
            "Chloramphenicol", "Newmol", "Mupirocin", "Newcillin", "Amoxicillin", "Clavulanic acid");
        assertThat(r.notChecked().get(0).partners()).containsExactly(ref("W", 1), ref("W2", 2));
        assertThat(r.notChecked().get(2).partners()).containsExactly(ref("EYE", 4), ref("CAP", 5));
    }

    @Test void aCombinationProductListsItsOwnPairAsSameProduct() {
        BatchPairs.Result r = BatchPairs.compute("COMBO", BATCH, ROWS, COMPLETE);
        assertThat(r.notChecked()).contains(
            new NotChecked("Amoxicillin", "Clavulanic acid", List.of(), "same_product", "this", "systemic"));
        assertThat(r.pairs()).extracting(Pair::substance).containsOnly("Amoxicillin");
    }

    @Test void anEntryWithoutACompletePairListIsNotRun() {
        Set<String> incomplete = Set.of("DDInter20", "DDInter351", "DDInter352", "DDInter353", "DDInter83", "DDInter394");
        BatchPairs.Result r = BatchPairs.compute("A", BATCH, ROWS, incomplete);
        assertThat(r.pairs()).extracting(Pair::ddinterA).containsExactly("DDInter20");
        assertThat(r.notChecked()).contains(
            new NotChecked("Acetylsalicylic acid", "Warfarin", List.of(ref("W", 1), ref("W2", 2)), "not_run", "partner", "systemic"));
    }

    @Test void anAbsentRecordGetsOnlyTheBatchCount() {
        BatchPairs.Result r = BatchPairs.compute("NOPE", BATCH, ROWS, COMPLETE);
        assertThat(r.totalBatchPairs()).isEqualTo(4);
        assertThat(r.pairs()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.BatchPairsTest'`
Expected: compilation FAILS — `cannot find symbol: class BatchPairs`.

- [ ] **Step 3: Implement**

Create `api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java`:

```java
package com.niramoy.bddrug.domain;
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
 * Spec §5.6.2: the open record's DDInter pairs with the other current records of its batch, with RouteRule applied on
 * both sides per record route (D14), and the pairs it cannot check (§6.7.2 rules 1–4). A pair of usable sides with no
 * stored row is "no interaction listed" and is not returned here; only the batch count needs it.
 */
public final class BatchPairs {
    private BatchPairs() {}

    public record Substance(String bdsId, String name, String coverage, List<DdinterCode> codes) {}
    public record Product(String conceptId, String tradeName, int index, String route, List<Substance> substances) {}
    public record PairRow(String ddinterA, String ddinterB, String nameA, String nameB, String severity, List<String> actions,
                          String interaction, String management) {}
    public record PartnerRef(String conceptId, String tradeName, int index) {}
    public record Pair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance,
                       String severity, List<String> actions, String interaction, String management, List<PartnerRef> partners) {}
    public record NotChecked(String substance, String partnerSubstance, List<PartnerRef> partners, String reason, String side,
                             String route) {}
    public record Result(int totalBatchPairs, List<Pair> pairs, List<NotChecked> notChecked) {}

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

    public static Result compute(String conceptId, List<Product> products, List<PairRow> rows, Set<String> complete) {
        Map<String, PairRow> byKey = new LinkedHashMap<>();
        for (PairRow r : rows) byKey.put(key(r.ddinterA(), r.ddinterB()), r);

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
            for (Substance s : me.substances())
                for (Substance t : q.substances()) {
                    if (sameSubstance(s, t)) continue;
                    Use us = use(s, me.route(), complete), ut = use(t, q.route(), complete);
                    if (us.reason() == null && ut.reason() == null) {
                        for (String a : us.chosen())
                            for (String b : ut.chosen()) {
                                PairRow row = byKey.get(key(a, b));
                                if (row == null) continue;
                                Pair old = pairs.get(key(a, b));
                                pairs.put(key(a, b), old == null
                                    ? new Pair(row.ddinterA(), row.ddinterB(), row.nameA(), row.nameB(), s.name(), t.name(), row.severity(),
                                        row.actions(), row.interaction(), row.management(), List.of(partner))
                                    : withPartner(old, partner));
                            }
                        continue;
                    }
                    boolean thisSide = ut.reason() == null || (us.reason() != null
                        && REASON_ORDER.indexOf(us.reason()) <= REASON_ORDER.indexOf(ut.reason()));
                    String reason = thisSide ? us.reason() : ut.reason();
                    String side = thisSide ? "this" : "partner";
                    String k = s.name() + "|" + t.name() + "|" + reason + "|" + side;
                    NotChecked old = notChecked.get(k);
                    notChecked.put(k, old == null
                        ? new NotChecked(s.name(), t.name(), List.of(partner), reason, side, thisSide ? me.route() : q.route())
                        : new NotChecked(old.substance(), old.partnerSubstance(), plus(old.partners(), partner), reason, side, old.route()));
                }
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

    private static Pair withPartner(Pair p, PartnerRef ref) {
        return new Pair(p.ddinterA(), p.ddinterB(), p.nameA(), p.nameB(), p.substance(), p.partnerSubstance(), p.severity(),
            p.actions(), p.interaction(), p.management(), plus(p.partners(), ref));
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.BatchPairsTest'`
Expected: BUILD SUCCESSFUL; 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java api/src/test/java/com/niramoy/bddrug/BatchPairsTest.java
git commit -m "feat(api): route-aware batch pairs and not-checked reasons as a pure rule

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: API review reads — batches, items with filters and hints, versions (§7.3, §5.2–§5.4)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/ReviewViews.java`, `api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java`, `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`, `api/src/main/java/com/niramoy/bddrug/presentation/ReviewQueryController.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java`

**Interfaces:**
- Consumes: `ApprovalRule.displayStatus(List<ReviewDecision>, Instant, String)` (P0 Task 6); `ReviewTriage` (Task 2); `ReviewSql.CURRENT_ITEM` (existing, package `adapter.persistence`); `InternalAuth.require`, `NotFoundException(field, message)`, `InvalidQueryException(field, message)` (existing); `PilotSeed.migrateAndSeed` (with P0 Task 9's seed: the fake warfarin pair is `DDInter1951/DDInter351`).
- Produces (all need `X-Internal-Token`; 401 `UNAUTHORIZED` without it):
  - `GET /v1/review/batches` → `ApiResponse<List<ReviewViews.BatchSummary>>`, newest `runAt` first; `BatchSummary(String batchId, String status, Instant runAt, int itemCount, Counts counts)`, `Counts(int approved, int issue, int needsReview, int engineerChecked, int backInReview, int noData, int warnings)`, current items only.
  - `GET /v1/review/batches/{b}/items?show=&q=&page=0&size=100` → `ItemsPage(String batchId, int total, Map<String,Integer> filterCounts, List<ItemRow> items)`, `ItemRow(int index, String conceptId, String tradeName, String clinicalDisplayName, String displayStatus, ReviewTriage.Hint hint, Version version)`, `Version(Instant extractedAt, Long lastDecisionId)`. Items in `concept_id` order (`COLLATE "C"`), `index` 1-based over all current items, `filterCounts` ignore `q`; `show` ∈ `ReviewTriage.SHOWS` (default `all`), `q` ≤ 100 characters (literal, case-insensitive substring of trade name, clinical display name, generic content, DAR number, company, substance and DGDA ingredient names, BDS ids), `page` 0–10000, `size` 1–500; 400 `INVALID_QUERY` with that `field`; 404 `NOT_FOUND` `field=batchId` for an unknown batch.
  - `GET /v1/review/batches/{b}/versions` → `List<VersionRow(String conceptId, Instant extractedAt, Long lastDecisionId, String displayStatus)>`.
  - `ReviewQueryPort` with `batches()`, `batch(batchId)`, `items(batchId)` and the records `BatchRow(String batchId, String status, Instant runAt)`, `StageRow(String stage, String status, String note, String evidence)`, `IngredientFact(String bdsId, String name, String dgdaName, String coverage)`, `ItemFacts(...)` (Task 6 adds detail methods).
  - `ReviewQueryService.batches()`, `items(batchId, show, q, page, size)`, `versions(batchId)`, and the package-visible `assess(List<ItemFacts>) -> List<Assessed>` Task 6 reuses.

- [ ] **Step 1: Write the failing integration test**

Create `api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java`:

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

/** Spec §7.3 reviewer read endpoints (§11.3 ReviewQueryIntegrationTest). Read-only: the seed is shared by every test. */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ReviewQueryIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    /**
     * Batch Q-1, seven current items in concept order: A-1 approved, C-EYE back in review (approved before its stamp),
     * D-1 issue (no DDInter data), N-1 engineer checked, T-NR pending (DDInter never run), W-1 pending (re-run),
     * X-NOSUB pending (unmapped, three failed checks); plus "gone", removed from the batch file.
     */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000099', 'Testmol');
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
             ('BDS-000099','ICD11_XM','XM9TST','any','dgda-ocl','xm',1.0),
             ('BDS-000099','DDINTER','DDInter777','systemic','ddinter2','drugbank',1.0);
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              VALUES ('T-NR','011','Testa','Test Pharma','Tablet','Testmol 1 mg','parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('T-NR','XM9TST','Testmol');
            INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES ('DGDA-Drugs','W-1','{"id":"W-1","extras":{"x":1}}');

            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('Q-1','in_review',8,'2026-10-11T21:27:17Z'), ('Q-2','approved',1,'2026-10-10T08:00:00Z'),
             ('Q-EMPTY','in_review',0,'2026-10-09T08:00:00Z');
            INSERT INTO ops.batch_run (batch_id, run_at, stages, counts, concept_ids) VALUES
             ('Q-1','2026-10-11T21:27:17Z','{dgda,substances,clinical,ddinter}','{}','{}');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('Q-1','DGDA-Drugs','A-1','ok',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','C-EYE','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','D-1','issue',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','N-1','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','T-NR','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','W-1','pending',NULL,'2026-10-12T09:30:00.123456Z'),
             ('Q-1','DGDA-Drugs','X-NOSUB','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','gone','issue','removed from batch file','2026-10-11T21:30:00Z'),
             ('Q-2','DGDA-Drugs','W-2','ok',NULL,'2026-10-10T08:05:00Z');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('Q-1','A-1','ok','','pharma.reviewer@example.org','pharmacist','2026-10-12T10:00:00Z'),
             ('Q-1','C-EYE','ok','','pharma.reviewer@example.org','pharmacist','2026-10-12T08:00:00Z'),
             ('Q-1','D-1','issue','route should be otic','Eng.Reviewer@example.org','engineer','2026-10-12T10:05:00Z'),
             ('Q-1','N-1','ok','','eng.reviewer@example.org','engineer','2026-10-12T10:10:00Z'),
             ('Q-1','gone','issue','wrong product listed','old@example.org','pharmacist','2026-10-11T22:00:00Z'),
             ('Q-2','W-2','ok','','pharma.reviewer@example.org','pharmacist','2026-10-10T09:00:00Z');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '', '{}'::jsonb FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical')) AS s(stage)
            WHERE bi.concept_id NOT IN ('X-NOSUB', 'gone');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
             ('Q-1','A-1','ddinter','ok','','{"text_missing":[]}'),
             ('Q-1','C-EYE','ddinter','ok','','{"text_missing":[],"route":"ophthalmic"}'),
             ('Q-1','D-1','ddinter','warn','No interaction data in DDInter for this substance','{"text_missing":[]}'),
             ('Q-1','N-1','ddinter','warn','DDInter text not found for DDInter14/DDInter1951','{"text_missing":[["DDInter14","DDInter1951"]]}'),
             ('Q-1','T-NR','ddinter','ok','','{"text_missing":[]}'),
             ('Q-1','W-1','ddinter','warn','DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter1951/DDInter5',
              '{"text_missing":[["DDInter14","DDInter1951"],["DDInter1951","DDInter5"]]}'),
             ('Q-1','X-NOSUB','dgda','ok','','{}'),
             ('Q-1','X-NOSUB','substances','fail','error: ValueError: no substance; unmapped xm','{}'),
             ('Q-1','X-NOSUB','clinical','fail','no clinical drug','{}'),
             ('Q-1','X-NOSUB','ddinter','fail','not run: stage aborted at chunk 1','{}'),
             ('Q-2','W-2','ddinter','ok','','{}');
            INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES
             ('Q-1','W-1','2026-10-12T09:00:00Z','00000000-0000-0000-0000-00000000000a','run',
              '{"version":1,"extracted_at":"2026-10-12T09:00:00+00:00","brand":{"dar_number":"001","trade_name":"Warin","company":"Test Pharma","dosage_form":"Tablet","generic_content_raw":"Warfarin Sodium 5 mg"},"clinical_drug":{"bdc_id":"BDC-000001","display_name":"Warfarin 5 mg tablet","dose_form":"Tablet","route":"systemic"},"ingredients":[],"stages":{"ddinter":{"status":"warn","note":"DDInter text not found for DDInter14/DDInter1951"}}}'),
             ('Q-1','W-1','2026-10-12T09:30:00.123456Z','00000000-0000-0000-0000-00000000000b','rerun',
              '{"version":1,"extracted_at":"2026-10-12T09:30:00.123456+00:00","brand":{"dar_number":"001","trade_name":"Warin","company":"Test Pharma","dosage_form":"Tablet","generic_content_raw":"Warfarin Sodium 5 mg"},"clinical_drug":{"bdc_id":"BDC-000001","display_name":"Warfarin 5 mg tablet","dose_form":"Tablet","route":"systemic"},"ingredients":[],"stages":{"ddinter":{"status":"warn","note":"DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter1951/DDInter5"}}}');
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.BodyContentSpec ok(String uri) {
        return internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody();
    }

    /** The search value is sent strictly encoded, so "%" and "\\" arrive as typed. */
    private WebTestClient.ResponseSpec searchQ1(String q) {
        return internal(web).get().uri(b -> b.path("/v1/review/batches/Q-1/items").queryParam("q", "{q}").build(q)).exchange();
    }

    @Test void everyReviewReadNeedsTheToken() {
        for (String uri : List.of("/v1/review/batches", "/v1/review/batches/Q-1/items", "/v1/review/batches/Q-1/versions"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
    }

    @Test void batchesCarryCountsOfCurrentItemsNewestFirst() {
        ok("/v1/review/batches")
            .jsonPath("$.data[0].batchId").isEqualTo("Q-1")
            .jsonPath("$.data[0].status").isEqualTo("in_review")
            .jsonPath("$.data[0].runAt").isEqualTo("2026-10-11T21:27:17Z")
            .jsonPath("$.data[0].itemCount").isEqualTo(7)
            .jsonPath("$.data[0].counts.approved").isEqualTo(1)
            .jsonPath("$.data[0].counts.issue").isEqualTo(1)
            .jsonPath("$.data[0].counts.needsReview").isEqualTo(5)
            .jsonPath("$.data[0].counts.engineerChecked").isEqualTo(1)
            .jsonPath("$.data[0].counts.backInReview").isEqualTo(1)
            .jsonPath("$.data[0].counts.noData").isEqualTo(1)
            .jsonPath("$.data[0].counts.warnings").isEqualTo(4)
            .jsonPath("$.data[1].batchId").isEqualTo("Q-2")
            .jsonPath("$.data[1].counts.approved").isEqualTo(1)
            .jsonPath("$.data[2].batchId").isEqualTo("Q-EMPTY")
            .jsonPath("$.data[2].itemCount").isEqualTo(0);
    }

    @Test void itemsComeInConceptOrderWithStatusesHintsAndVersions() {
        ok("/v1/review/batches/Q-1/items")
            .jsonPath("$.data.batchId").isEqualTo("Q-1")
            .jsonPath("$.data.total").isEqualTo(7)
            .jsonPath("$.data.filterCounts.all").isEqualTo(7)
            .jsonPath("$.data.filterCounts.needs").isEqualTo(5)
            .jsonPath("$.data.filterCounts.warn").isEqualTo(4)
            .jsonPath("$.data.filterCounts.issue").isEqualTo(1)
            .jsonPath("$.data.filterCounts.approved").isEqualTo(1)
            .jsonPath("$.data.filterCounts.nodata").isEqualTo(1)
            .jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("A-1", "C-EYE", "D-1", "N-1", "T-NR", "W-1", "X-NOSUB"))
            .jsonPath("$.data.items[*].displayStatus").isEqualTo(List.of("approved", "back_in_review", "issue",
                "engineer_checked", "pending", "pending", "pending"))
            .jsonPath("$.data.items[0].tradeName").isEqualTo("Ecosprin")
            .jsonPath("$.data.items[0].clinicalDisplayName").isEqualTo("Aspirin 75 mg tablet")
            .jsonPath("$.data.items[2].hint.noData").isEqualTo(true)
            .jsonPath("$.data.items[2].hint.warnings").isEqualTo(1)
            .jsonPath("$.data.items[4].hint.notRun").isEqualTo(true)
            .jsonPath("$.data.items[5].hint.pairsWithoutText").isEqualTo(2)
            .jsonPath("$.data.items[5].version.extractedAt").isEqualTo("2026-10-12T09:30:00.123456Z")
            .jsonPath("$.data.items[5].version.lastDecisionId").isEmpty()
            .jsonPath("$.data.items[6].hint.failed").isEqualTo(3)
            .jsonPath("$.data.items[6].tradeName").isEqualTo("Newdrug");
    }

    @Test void filtersSearchAndPagesKeepTheBatchIndex() {
        ok("/v1/review/batches/Q-1/items?show=needs")
            .jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("C-EYE", "N-1", "T-NR", "W-1", "X-NOSUB"))
            .jsonPath("$.data.items[*].index").isEqualTo(List.of(2, 4, 5, 6, 7))
            .jsonPath("$.data.filterCounts.all").isEqualTo(7);
        searchQ1("WARFARIN").expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("W-1"));
        searchQ1("bds-000004").expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("D-1"));
        searchQ1("eye pharma").expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("C-EYE"));
        searchQ1("  ").expectBody().jsonPath("$.data.items.length()").isEqualTo(7);
        ok("/v1/review/batches/Q-1/items?show=issue&q=napa").jsonPath("$.data.items.length()").isEqualTo(0);
        ok("/v1/review/batches/Q-1/items?size=2&page=1").jsonPath("$.data.items[*].index").isEqualTo(List.of(3, 4));
    }

    /** Review Focus 5. */
    @Test void searchIsALiteralSubstring() {
        // "%" is in the eye drop's own text ("Chloramphenicol 0.5%"), so a literal match finds exactly that record;
        // a LIKE wildcard would have matched all seven.
        searchQ1("%").expectStatus().isOk().expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("C-EYE"));
        for (String q : List.of("_", "\\", ".*", "N_pa", "Nap%", "[a-z]+"))
            searchQ1(q).expectStatus().isOk().expectBody().jsonPath("$.data.items.length()").isEqualTo(0);
        searchQ1("x".repeat(101)).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("q");
        searchQ1("x".repeat(100)).expectStatus().isOk().expectBody().jsonPath("$.data.items.length()").isEqualTo(0);
    }

    @Test void badParametersAndUnknownBatchesAreRefused() {
        for (String[] bad : new String[][]{{"show=open", "show"}, {"page=-1", "page"}, {"size=0", "size"}, {"size=501", "size"},
                                           {"page=a", "page"}})
            internal(web).get().uri("/v1/review/batches/Q-1/items?" + bad[0]).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(bad[1]);
        for (String uri : List.of("/v1/review/batches/NOPE/items", "/v1/review/batches/NOPE/versions"))
            internal(web).get().uri(uri).exchange().expectStatus().isNotFound()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
    }

    @Test void versionsCarryEveryCurrentItem() throws Exception {
        long last = count(pg, "SELECT id FROM ops.review_decision WHERE concept_id = 'N-1'");
        ok("/v1/review/batches/Q-1/versions")
            .jsonPath("$.data.length()").isEqualTo(7)
            .jsonPath("$.data[3].conceptId").isEqualTo("N-1")
            .jsonPath("$.data[3].lastDecisionId").isEqualTo((int) last)
            .jsonPath("$.data[3].displayStatus").isEqualTo("engineer_checked")
            .jsonPath("$.data[5].extractedAt").isEqualTo("2026-10-12T09:30:00.123456Z");
    }

    /** Review Focus 4 (list side; Task 6 adds the detail side). */
    @Test void removedItemsAreNotListedOrServed() {
        for (String uri : List.of("/v1/review/batches/Q-1/items", "/v1/review/batches/Q-1/versions", "/v1/review/batches")) {
            byte[] body = internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            assertThat(new String(body, StandardCharsets.UTF_8)).as(uri).doesNotContain("\"gone\"").doesNotContain("old@example.org");
        }
    }

    @Test void noListCarriesAnEmail() {
        for (String uri : List.of("/v1/review/batches", "/v1/review/batches/Q-1/items", "/v1/review/batches/Q-1/versions")) {
            byte[] body = internal(web).get().uri(uri).exchange().expectBody().returnResult().getResponseBody();
            assertThat(new String(body, StandardCharsets.UTF_8)).as(uri).doesNotContain("@");
        }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewQueryIntegrationTest'`
Expected: FAIL — every request answers 404 (no handler for `/v1/review/batches`), e.g. `Status expected:<200 OK> but was:<404 NOT_FOUND>`; `everyReviewReadNeedsTheToken` fails with 404 instead of 401.

- [ ] **Step 3: Write the views, the port and the adapter**

Create `api/src/main/java/com/niramoy/bddrug/domain/ReviewViews.java`:

```java
package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Response shapes of the reviewer read endpoints (spec §7.3). None carries an email. */
public final class ReviewViews {
    private ReviewViews() {}

    public record Counts(int approved, int issue, int needsReview, int engineerChecked, int backInReview, int noData, int warnings) {}
    public record BatchSummary(String batchId, String status, Instant runAt, int itemCount, Counts counts) {}
    /** The stale-detection token (spec §5.11): the run stamp exactly as stored, and the newest decision id. */
    public record Version(Instant extractedAt, Long lastDecisionId) {}
    public record ItemRow(int index, String conceptId, String tradeName, String clinicalDisplayName, String displayStatus,
                          ReviewTriage.Hint hint, Version version) {}
    public record ItemsPage(String batchId, int total, Map<String, Integer> filterCounts, List<ItemRow> items) {}
    public record VersionRow(String conceptId, Instant extractedAt, Long lastDecisionId, String displayStatus) {}
    public record Diff(Instant from, Instant to, String reason, List<SnapshotDiff.Row> rows) {}
}
```

Create `api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;

/** What the reviewer read endpoints need from the database. Removed items ("removed from batch file") are never read. */
public interface ReviewQueryPort {
    record BatchRow(String batchId, String status, Instant runAt) {}
    /** {@code evidence} is the stored JSONB as text. */
    record StageRow(String stage, String status, String note, String evidence) {}
    /** One DGDA ingredient: {@code bdsId} null when no substance carries its XM code; {@code coverage} null then too. */
    record IngredientFact(String bdsId, String name, String dgdaName, String coverage) {}
    /** One current batch item; {@code decisions} oldest first, with emails (used only to compute {@code mine}). */
    record ItemFacts(String conceptId, String review, Instant extractedAt, String tradeName, String darNumber, String company,
                     String genericContentRaw, String clinicalDisplayName, List<StageRow> stages,
                     List<IngredientFact> ingredients, List<ReviewDecision> decisions) {}

    /** Newest run first. */
    Flux<BatchRow> batches();
    /** Empty for an unknown batch. */
    Mono<BatchRow> batch(String batchId);
    /** Current items of the batch in concept order (byte order, COLLATE "C"). */
    Mono<List<ItemFacts>> items(String batchId);
}
```

Create `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ReviewQueryPort;
import com.niramoy.bddrug.domain.ReviewDecision;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** All reviewer read SQL (spec §7.3). Every query skips items marked "removed from batch file". */
@Component
public class R2dbcReviewQueryAdapter implements ReviewQueryPort {
    static final String STAGE_ORDER = "array_position(ARRAY['dgda','substances','clinical','ddinter'], stage)";

    protected final DatabaseClient db;
    public R2dbcReviewQueryAdapter(DatabaseClient db) { this.db = db; }

    private static BatchRow toBatch(Readable r) {
        return new BatchRow(r.get("batch_id", String.class), r.get("status", String.class),
            r.get("run_at", OffsetDateTime.class).toInstant());
    }

    @Override public Flux<BatchRow> batches() {
        return db.sql("SELECT batch_id, status, run_at FROM ops.batch ORDER BY run_at DESC, batch_id COLLATE \"C\"")
            .map(R2dbcReviewQueryAdapter::toBatch).all();
    }

    @Override public Mono<BatchRow> batch(String batchId) {
        return db.sql("SELECT batch_id, status, run_at FROM ops.batch WHERE batch_id = :b").bind("b", batchId)
            .map(R2dbcReviewQueryAdapter::toBatch).one();
    }

    private record ItemRow(String conceptId, String review, Instant extractedAt, String tradeName, String darNumber,
                           String company, String generic, String clinical) {}

    private static <T> Mono<HashMap<String, List<T>>> grouped(Flux<Map.Entry<String, T>> rows) {
        return rows.collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }

    @Override public Mono<List<ItemFacts>> items(String batchId) {
        Mono<List<ItemRow>> rows = db.sql("""
                SELECT bi.concept_id, bi.review, bi.extracted_at, coalesce(bp.trade_name, bi.concept_id) AS trade_name,
                       bp.dar_number, bp.company, bp.generic_content_raw, cd.display_name
                FROM ops.batch_item bi
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                WHERE bi.batch_id = :b AND %s
                ORDER BY bi.concept_id COLLATE "C\"""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId)
            .map(r -> new ItemRow(r.get("concept_id", String.class), r.get("review", String.class),
                instant(r.get("extracted_at", OffsetDateTime.class)), r.get("trade_name", String.class),
                r.get("dar_number", String.class), r.get("company", String.class), r.get("generic_content_raw", String.class),
                r.get("display_name", String.class)))
            .all().collectList();
        Mono<HashMap<String, List<StageRow>>> stages = grouped(db.sql(
                "SELECT concept_id, stage, status, note, evidence::text AS evidence FROM ops.stage_result WHERE batch_id = :b " +
                "ORDER BY concept_id, " + STAGE_ORDER)
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), new StageRow(r.get("stage", String.class),
                r.get("status", String.class), r.get("note", String.class), r.get("evidence", String.class))))
            .all());
        Mono<HashMap<String, List<IngredientFact>>> ingredients = grouped(db.sql("""
                SELECT bpi.concept_id, bpi.ingredient_name, xm.bds_id, s.preferred_name,
                       CASE WHEN xm.bds_id IS NULL THEN NULL ELSE coalesce(ic.coverage, 'not_run') END AS coverage
                FROM ops.batch_item bi
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bi.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE bi.batch_id = :b
                ORDER BY bpi.concept_id, bpi.xm_code COLLATE "C\"""")
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), new IngredientFact(r.get("bds_id", String.class),
                r.get("preferred_name", String.class) != null ? r.get("preferred_name", String.class) : r.get("ingredient_name", String.class),
                r.get("ingredient_name", String.class), r.get("coverage", String.class))))
            .all());
        Mono<HashMap<String, List<ReviewDecision>>> decisions = grouped(db.sql("""
                SELECT concept_id, id, decision, note, reviewer_email, reviewer_role, decided_at FROM ops.review_decision
                WHERE batch_id = :b ORDER BY decided_at, id""")
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), new ReviewDecision(r.get("id", Long.class),
                r.get("decision", String.class), r.get("note", String.class), r.get("reviewer_email", String.class),
                r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant())))
            .all());
        return Mono.zip(rows, stages, ingredients, decisions).map(t -> t.getT1().stream().map(i -> new ItemFacts(i.conceptId(),
                i.review(), i.extractedAt(), i.tradeName(), i.darNumber(), i.company(), i.generic(), i.clinical(),
                List.copyOf(t.getT2().getOrDefault(i.conceptId(), List.of())),
                List.copyOf(t.getT3().getOrDefault(i.conceptId(), List.of())),
                List.copyOf(t.getT4().getOrDefault(i.conceptId(), List.of())))).toList());
    }

    static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
}
```

(The text block closes with `"C\""""` so that the SQL ends in `COLLATE "C"`; Java reads `\"` inside a text block as a quote.)

- [ ] **Step 4: Write the service and the controller**

Create `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`:

```java
package com.niramoy.bddrug.application;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.application.port.ReviewQueryPort;
import com.niramoy.bddrug.application.port.ReviewQueryPort.ItemFacts;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.ReviewTriage;
import com.niramoy.bddrug.domain.ReviewViews.BatchSummary;
import com.niramoy.bddrug.domain.ReviewViews.Counts;
import com.niramoy.bddrug.domain.ReviewViews.ItemRow;
import com.niramoy.bddrug.domain.ReviewViews.ItemsPage;
import com.niramoy.bddrug.domain.ReviewViews.Version;
import com.niramoy.bddrug.domain.ReviewViews.VersionRow;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/** The reviewer read endpoints (spec §7.3). displayStatus is computed once per item with one decisions query per batch. */
@Service
public class ReviewQueryService {
    public static final int Q_MAX = 100, SIZE_MAX = 500, SIZE_DEFAULT = 100, PAGE_MAX = 10_000;
    private static final Pattern DIGITS = Pattern.compile("^[0-9]{1,6}$");

    protected final ReviewQueryPort port;
    protected final ObjectMapper json;
    public ReviewQueryService(ReviewQueryPort port, ObjectMapper json) {
        this.port = port;
        this.json = json;
    }

    /** One item with everything the lists derive from it. {@code index} is 1-based over the batch's current items. */
    record Assessed(int index, ItemFacts facts, String displayStatus, ReviewTriage.Facts triage, Version version) {}

    List<Assessed> assess(List<ItemFacts> items) {
        List<Assessed> out = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            ItemFacts f = items.get(i);
            String status = ApprovalRule.displayStatus(f.decisions(), f.extractedAt(), f.review());
            Map<String, String> stages = new LinkedHashMap<>();
            int pairs = 0;
            for (ReviewQueryPort.StageRow s : f.stages()) {
                stages.put(s.stage(), s.status());
                if ("ddinter".equals(s.stage())) pairs = textMissing(s.evidence()).size();
            }
            List<String> coverages = f.ingredients().stream().filter(g -> g.bdsId() != null).map(ReviewQueryPort.IngredientFact::coverage).toList();
            Long last = f.decisions().stream().map(ReviewDecision::id).max(Long::compare).orElse(null);
            out.add(new Assessed(i + 1, f, status, new ReviewTriage.Facts(status, stages, pairs, coverages), new Version(f.extractedAt(), last)));
        }
        return out;
    }

    /** {@code evidence.text_missing} as [[a, b], …]; empty when absent or unreadable. */
    List<String[]> textMissing(String evidence) {
        List<String[]> out = new ArrayList<>();
        if (evidence == null) return out;
        try {
            for (JsonNode pair : json.readTree(evidence).path("text_missing"))
                if (pair.size() == 2) out.add(new String[]{pair.get(0).asText(), pair.get(1).asText()});
        } catch (Exception e) {
            return out;
        }
        return out;
    }

    Mono<ReviewQueryPort.BatchRow> requireBatch(String batchId) {
        return port.batch(batchId).switchIfEmpty(Mono.error(() -> new NotFoundException("batchId", "Batch not found")));
    }

    public Flux<BatchSummary> batches() {
        return port.batches().concatMap(b -> port.items(b.batchId()).map(items -> {
            List<Assessed> all = assess(items);
            int approved = 0, issue = 0, needs = 0, engineer = 0, back = 0, noData = 0, warnings = 0;
            for (Assessed a : all) {
                switch (a.displayStatus()) {
                    case ApprovalRule.APPROVED -> approved++;
                    case ApprovalRule.ISSUE -> issue++;
                    case ApprovalRule.ENGINEER_CHECKED -> engineer++;
                    case ApprovalRule.BACK_IN_REVIEW -> back++;
                    default -> { }
                }
                if (ReviewTriage.needsReview(a.displayStatus())) needs++;
                if (ReviewTriage.inFilter("nodata", a.triage())) noData++;
                if (ReviewTriage.inFilter("warn", a.triage())) warnings++;
            }
            return new BatchSummary(b.batchId(), b.status(), b.runAt(), all.size(),
                new Counts(approved, issue, needs, engineer, back, noData, warnings));
        }));
    }

    public Mono<ItemsPage> items(String batchId, String show, String q, String page, String size) {
        return Mono.fromCallable(() -> new Object[]{
                Validate.oneOf(show == null ? "all" : show, java.util.Set.copyOf(ReviewTriage.SHOWS), "show"),
                query(q), number(page, 0, 0, PAGE_MAX, "page"), number(size, SIZE_DEFAULT, 1, SIZE_MAX, "size")})
            .flatMap(v -> requireBatch(batchId).then(port.items(batchId)).map(items -> {
                List<Assessed> all = assess(items);
                String filter = (String) v[0], needle = (String) v[1];
                int p = (Integer) v[2], n = (Integer) v[3];
                List<ItemRow> rows = all.stream()
                    .filter(a -> ReviewTriage.inFilter(filter, a.triage()))
                    .filter(a -> needle.isEmpty() || haystack(a.facts()).contains(needle))
                    .skip((long) p * n).limit(n)
                    .map(ReviewQueryService::row).toList();
                return new ItemsPage(batchId, all.size(), ReviewTriage.filterCounts(all.stream().map(Assessed::triage).toList()), rows);
            }));
    }

    public Mono<List<VersionRow>> versions(String batchId) {
        return requireBatch(batchId).then(port.items(batchId)).map(items -> assess(items).stream()
            .map(a -> new VersionRow(a.facts().conceptId(), a.version().extractedAt(), a.version().lastDecisionId(), a.displayStatus()))
            .toList());
    }

    static ItemRow row(Assessed a) {
        return new ItemRow(a.index(), a.facts().conceptId(), a.facts().tradeName(), a.facts().clinicalDisplayName(),
            a.displayStatus(), ReviewTriage.hint(a.triage()), a.version());
    }

    /** Everything the record filter matches, lower-cased; a literal substring test, never a pattern (Review Focus 5). */
    static String haystack(ItemFacts f) {
        List<String> parts = new ArrayList<>(List.of(nz(f.tradeName()), nz(f.clinicalDisplayName()), nz(f.genericContentRaw()),
            nz(f.darNumber()), nz(f.company())));
        for (ReviewQueryPort.IngredientFact g : f.ingredients()) {
            parts.add(nz(g.name()));
            parts.add(nz(g.dgdaName()));
            parts.add(nz(g.bdsId()));
        }
        return String.join("\n", parts).toLowerCase(Locale.ROOT);
    }

    private static String nz(String s) { return s == null ? "" : s; }

    private static String query(String q) {
        String s = q == null ? "" : q.strip();
        if (Validate.length(s) > Q_MAX) throw new InvalidQueryException("q", "q must be at most " + Q_MAX + " characters");
        return s.toLowerCase(Locale.ROOT);
    }

    static int number(String value, int fallback, int min, int max, String field) {
        if (value == null) return fallback;
        if (!DIGITS.matcher(value).matches()) throw new InvalidQueryException(field, field + " must be a whole number");
        int n = Integer.parseInt(value);
        if (n < min || n > max) throw new InvalidQueryException(field, field + " must be " + min + "-" + max);
        return n;
    }
}
```

Create `api/src/main/java/com/niramoy/bddrug/presentation/ReviewQueryController.java`:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ReviewQueryService;
import com.niramoy.bddrug.domain.ReviewViews.BatchSummary;
import com.niramoy.bddrug.domain.ReviewViews.ItemsPage;
import com.niramoy.bddrug.domain.ReviewViews.VersionRow;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import java.util.List;

/** Reviewer reads (spec §7.3): unreviewed data, so every endpoint needs the internal token. */
@RestController
@RequestMapping("/v1/review/batches")
public class ReviewQueryController {
    protected final ReviewQueryService service;
    protected final InternalAuth auth;
    public ReviewQueryController(ReviewQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<List<BatchSummary>>> batches(@RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.batches().collectList().map(ApiResponse::ok);
    }

    @GetMapping("/{batchId}/items")
    public Mono<ApiResponse<ItemsPage>> items(@PathVariable String batchId,
                                              @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                              @RequestParam(required = false) String show, @RequestParam(required = false) String q,
                                              @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        auth.require(token);
        return service.items(batchId, show, q, page, size).map(ApiResponse::ok);
    }

    @GetMapping("/{batchId}/versions")
    public Mono<ApiResponse<List<VersionRow>>> versions(@PathVariable String batchId,
                                                        @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.versions(batchId).map(ApiResponse::ok);
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewQueryIntegrationTest'`
Expected: BUILD SUCCESSFUL; 9 tests pass.

Run: `cd api && ./gradlew test --no-daemon`
Expected: BUILD SUCCESSFUL (every API test).

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/ReviewViews.java \
  api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java \
  api/src/main/java/com/niramoy/bddrug/presentation/ReviewQueryController.java \
  api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java
git commit -m "feat(api): reviewer batch, item and version reads with filters and hints (spec 7.3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: API review reads — the record (`ReviewItem`) and the snapshot diff (§7.3)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/IngredientSummary.java`, `api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/IngredientSummaryReader.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java`, `api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java`, `api/src/main/java/com/niramoy/bddrug/presentation/ReviewQueryController.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java`

**Interfaces:**
- Consumes: `StageNotes` (Task 2), `ItemHistory`, `SnapshotDiff` (Task 3), `BatchPairs` (Task 4), `ReviewQueryService.assess`, `requireBatch`, `textMissing` (Task 5); `RouteRule`, `DdinterCode`, `DdinterText.clean`, `ClinicalDrugReader.plain` (existing).
- Produces:
  - `GET /v1/review/batches/{b}/items/{c}` (token; optional header `X-Viewer-Email`, never echoed) → `ApiResponse<ReviewItem>`; 404 `field=conceptId` for an unknown or removed item.
  - `ReviewItem(String batchId, String conceptId, int index, int total, String displayStatus, String review, ReviewViews.Version version, BatchInfo batch, Brand brand, List<DgdaIngredient> dgdaIngredients, Clinical clinicalDrug, List<IngredientSummary> ingredients, List<Stage> stages, BatchPairs.Result batchPairs, String sourceJson (raw JSON), String sourceUrl, List<ItemHistory.Entry> history, ItemHistory.Reopen reopen)` with `BatchInfo(Instant runAt, int itemCount, String status)`, `Brand(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, parseStatus, parseNote)`, `DgdaIngredient(String xmCode, String name)`, `Clinical(String bdcId, String displayName, String doseForm, String route, String signature)`, `Stage(String stage, String status, List<StageNotes.Note> notes, List<TextMissingPair> textMissing, String evidence (raw JSON))`, `TextMissingPair(String ddinterA, String nameA, String ddinterB, String nameB, String severity, boolean inBatch)`.
  - `IngredientSummary(String bdsId, String name, String raw, BigDecimal strengthValue, String strengthUnit, BigDecimal perValue, String perUnit, List<Name> names, List<Code> codes, Coverage coverage, Ddinter ddinter)` with `Name(name, type, source)`, `Code(system, code, routeScope, method, double confidence)`, `Coverage(String coverage /*full|none|not_run*/, String note)`, `Ddinter(List<Chosen> chosen, List<Entry> entries)`, `Chosen(ddinterId, name, routeScope, boolean routeAssumed)`, `Entry(ddinterId, name, routeScope, Counts counts, int diseaseCount, int foodCount)`, `Counts(int major, int moderate, int minor, int unknown, int total)`. A substance with no `curated.interaction_coverage` row is `not_run` (§7.3); an ingredient with no substance has `bdsId` null, `coverage` `not_run`, and no codes (the web shows it as unmapped).
  - `IngredientSummaryReader.read(String conceptId, String bdcId, String route) -> Mono<List<IngredientSummary>>` (public `@Component`; P2's product page can reuse it).
  - `GET /v1/review/batches/{b}/items/{c}/diff?from=<ISO>` → `ReviewViews.Diff(Instant from, Instant to, String reason, List<SnapshotDiff.Row> rows)`; 400 `field=from` when missing or unparseable; 404 `field=from` when no snapshot exists for `from` or for the current stamp.
  - `TextMissingPair.inBatch` = the side this record did not choose is chosen by another current record of the batch.

- [ ] **Step 1: Add the failing tests**

Append to `ReviewQueryIntegrationTest`:

```java
    // ---- the record (Task 6)

    @Test void sourceUrlEncodesLikeEncodeURIComponent() {
        String base = com.niramoy.bddrug.application.ReviewQueryService.OCL_CONCEPT;
        // encodeURIComponent keeps A-Z a-z 0-9 - _ . ! ~ * ' ( ) and escapes everything else as UTF-8 (web/lib/evidence.ts)
        assertThat(com.niramoy.bddrug.application.ReviewQueryService.sourceUrl("186-0030-006 (a)!~'*_."))
            .isEqualTo(base + "186-0030-006%20(a)!~'*_./");
        assertThat(com.niramoy.bddrug.application.ReviewQueryService.sourceUrl("x/y?z&+é"))
            .isEqualTo(base + "x%2Fy%3Fz%26%2B%C3%A9/");
    }

    @Test void detailReadsNeedTheToken() {
        for (String uri : List.of("/v1/review/batches/Q-1/items/W-1", "/v1/review/batches/Q-1/items/W-1/diff?from=2026-10-12T09:00:00Z"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
    }

    @Test void theEyeDropIsCheckedAgainstTheOphthalmicEntryAndHasNoBatchPair() {
        ok("/v1/review/batches/Q-1/items/C-EYE")
            .jsonPath("$.data.index").isEqualTo(2)
            .jsonPath("$.data.total").isEqualTo(7)
            .jsonPath("$.data.displayStatus").isEqualTo("back_in_review")
            .jsonPath("$.data.review").isEqualTo("pending")
            .jsonPath("$.data.clinicalDrug.route").isEqualTo("ophthalmic")
            .jsonPath("$.data.clinicalDrug.signature").isEqualTo("eye drops|ophthalmic|BDS-000003:0.5%/")
            .jsonPath("$.data.ingredients[0].name").isEqualTo("Chloramphenicol")
            .jsonPath("$.data.ingredients[0].raw").isEqualTo("Chloramphenicol 0.5%")
            .jsonPath("$.data.ingredients[0].strengthValue").isEqualTo(0.5)
            .jsonPath("$.data.ingredients[0].coverage.coverage").isEqualTo("full")
            .jsonPath("$.data.ingredients[0].ddinter.chosen[*].ddinterId").isEqualTo(List.of("DDInter352"))
            .jsonPath("$.data.ingredients[0].ddinter.chosen[0].routeAssumed").isEqualTo(false)
            .jsonPath("$.data.ingredients[0].ddinter.chosen[0].name").isEqualTo("Chloramphenicol (ophthalmic)")
            .jsonPath("$.data.ingredients[0].ddinter.entries[*].ddinterId").isEqualTo(List.of("DDInter351", "DDInter352", "DDInter353"))
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].counts.moderate").isEqualTo(1)
            .jsonPath("$.data.ingredients[0].ddinter.entries[1].counts.total").isEqualTo(0)
            .jsonPath("$.data.batchPairs.totalBatchPairs").isEqualTo(2)
            .jsonPath("$.data.batchPairs.pairs.length()").isEqualTo(0)
            .jsonPath("$.data.batchPairs.notChecked[*].reason").isEqualTo(List.of("no_data", "not_run", "unmapped"))
            .jsonPath("$.data.batchPairs.notChecked[*].partnerSubstance").isEqualTo(List.of("Domperidone", "Testmol", "Newmol"))
            .jsonPath("$.data.batchPairs.notChecked[0].side").isEqualTo("partner")
            .jsonPath("$.data.batchPairs.notChecked[0].partners[0].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.batchPairs.notChecked[0].partners[0].index").isEqualTo(3)
            .jsonPath("$.data.reopen").isEmpty();
    }

    @Test void warfarinCarriesPairsCodesNotesHistoryAndSource() {
        ok("/v1/review/batches/Q-1/items/W-1")
            .jsonPath("$.data.brand.tradeName").isEqualTo("Warin")
            .jsonPath("$.data.brand.darNumber").isEqualTo("001")
            .jsonPath("$.data.dgdaIngredients[0].xmCode").isEqualTo("XM5S93")
            .jsonPath("$.data.version.extractedAt").isEqualTo("2026-10-12T09:30:00.123456Z")
            .jsonPath("$.data.batch.runAt").isEqualTo("2026-10-11T21:27:17Z")
            .jsonPath("$.data.batch.itemCount").isEqualTo(7)
            .jsonPath("$.data.ingredients[0].codes[*].system").isEqualTo(List.of("ICD11_XM", "DRUGBANK", "DDINTER"))
            .jsonPath("$.data.ingredients[0].names[*].type").isEqualTo(List.of("icd11", "dgda_content"))
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].counts.major").isEqualTo(1)
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].counts.moderate").isEqualTo(2)
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].counts.minor").isEqualTo(1)
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].counts.unknown").isEqualTo(1)
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].counts.total").isEqualTo(5)
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].diseaseCount").isEqualTo(2)
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].foodCount").isEqualTo(1)
            .jsonPath("$.data.batchPairs.pairs[*].severity").isEqualTo(List.of("major", "moderate"))
            .jsonPath("$.data.batchPairs.pairs[0].substance").isEqualTo("Warfarin")
            .jsonPath("$.data.batchPairs.pairs[0].partnerSubstance").isEqualTo("Aspirin")
            .jsonPath("$.data.batchPairs.pairs[0].management").isEqualTo("Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")
            .jsonPath("$.data.batchPairs.pairs[0].partners[0].tradeName").isEqualTo("Ecosprin")
            .jsonPath("$.data.batchPairs.pairs[1].interaction").isEmpty()
            .jsonPath("$.data.stages[3].stage").isEqualTo("ddinter")
            .jsonPath("$.data.stages[3].notes[*].kind").isEqualTo(List.of("text_missing", "text_missing"))
            .jsonPath("$.data.stages[3].textMissing[0].nameA").isEqualTo("Acetaminophen")
            .jsonPath("$.data.stages[3].textMissing[0].nameB").isEqualTo("Warfarin")
            .jsonPath("$.data.stages[3].textMissing[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.stages[3].textMissing[0].inBatch").isEqualTo(true)
            .jsonPath("$.data.stages[3].textMissing[1].nameB").isEqualTo("Alpha Unknown")
            .jsonPath("$.data.stages[3].textMissing[1].severity").isEqualTo("unknown")
            .jsonPath("$.data.stages[3].textMissing[1].inBatch").isEqualTo(false)
            .jsonPath("$.data.sourceJson.extras.x").isEqualTo(1)
            .jsonPath("$.data.sourceUrl").isEqualTo("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/W-1/")
            .jsonPath("$.data.history[*].kind").isEqualTo(List.of("run", "extract", "extract"))
            .jsonPath("$.data.history[1].reason").isEqualTo("run")
            .jsonPath("$.data.history[2].reason").isEqualTo("rerun")
            .jsonPath("$.data.history[0].role").doesNotExist()
            .jsonPath("$.data.reopen.reason").isEqualTo("rerun")
            .jsonPath("$.data.reopen.previousExtractedAt").isEqualTo("2026-10-12T09:00:00Z")
            .jsonPath("$.data.reopen.diffAvailable").isEqualTo(true);
    }

    @Test void failNotesStayWholeAndUnmappedIngredientsHaveNoSubstance() {
        ok("/v1/review/batches/Q-1/items/X-NOSUB")
            .jsonPath("$.data.stages[1].notes.length()").isEqualTo(1)
            .jsonPath("$.data.stages[1].notes[0].kind").isEqualTo("other")
            .jsonPath("$.data.stages[1].notes[0].text").isEqualTo("error: ValueError: no substance; unmapped xm")
            .jsonPath("$.data.ingredients[0].bdsId").isEmpty()
            .jsonPath("$.data.ingredients[0].name").isEqualTo("Newmol")
            .jsonPath("$.data.ingredients[0].coverage.coverage").isEqualTo("not_run")
            .jsonPath("$.data.clinicalDrug").isEmpty();
        ok("/v1/review/batches/Q-1/items/T-NR")
            .jsonPath("$.data.ingredients[0].coverage.coverage").isEqualTo("not_run")
            .jsonPath("$.data.ingredients[0].ddinter.chosen[0].ddinterId").isEqualTo("DDInter777")
            .jsonPath("$.data.ingredients[0].ddinter.chosen[0].routeAssumed").isEqualTo(true);
    }

    @Test void mineComparesTheViewerEmailCaseInsensitivelyAndNoEmailIsEverSent() {
        byte[] body = internal(web).get().uri("/v1/review/batches/Q-1/items/D-1").header("X-Viewer-Email", "eng.reviewer@EXAMPLE.org")
            .exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.history[?(@.kind == 'decision')].mine").isEqualTo(List.of(true))
            .jsonPath("$.data.history[?(@.kind == 'decision')].note").isEqualTo(List.of("route should be otic"))
            .jsonPath("$.data.history[?(@.kind == 'decision')].counts").isEqualTo(List.of(true))
            .returnResult().getResponseBody();
        assertThat(new String(body, StandardCharsets.UTF_8)).doesNotContain("@");
        ok("/v1/review/batches/Q-1/items/D-1").jsonPath("$.data.history[?(@.kind == 'decision')].mine").isEqualTo(List.of(false));
    }

    /** Review Focus 4 (detail side). */
    @Test void removedAndUnknownRecordsAre404() {
        for (String uri : List.of("/v1/review/batches/Q-1/items/gone", "/v1/review/batches/Q-1/items/nope", "/v1/review/batches/NOPE/items/W-1"))
            internal(web).get().uri(uri).exchange().expectStatus().isNotFound()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
    }

    @Test void theDiffListsChangedCellsBetweenTwoSnapshots() {
        ok("/v1/review/batches/Q-1/items/W-1/diff?from=2026-10-12T09:00:00Z")
            .jsonPath("$.data.from").isEqualTo("2026-10-12T09:00:00Z")
            .jsonPath("$.data.to").isEqualTo("2026-10-12T09:30:00.123456Z")
            .jsonPath("$.data.reason").isEqualTo("rerun")
            .jsonPath("$.data.rows[*].field").isEqualTo(List.of("DDInter note", "Pipeline extracted at"))
            .jsonPath("$.data.rows[0].before").isEqualTo("DDInter text not found for DDInter14/DDInter1951");
        internal(web).get().uri("/v1/review/batches/Q-1/items/W-1/diff?from=2026-10-12T08:00:00Z").exchange()
            .expectStatus().isNotFound().expectBody().jsonPath("$.errors[0].field").isEqualTo("from");
        internal(web).get().uri("/v1/review/batches/Q-1/items/A-1/diff?from=2026-10-12T09:00:00Z").exchange()
            .expectStatus().isNotFound();
        for (String bad : List.of("/v1/review/batches/Q-1/items/W-1/diff", "/v1/review/batches/Q-1/items/W-1/diff?from=yesterday"))
            internal(web).get().uri(bad).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("from");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewQueryIntegrationTest'`
Expected: FAIL — the seven new tests get 404 for `/items/{c}` and `/diff` (no handler) where 200, 400 or 401 is expected; the Task 5 tests still pass.

- [ ] **Step 3: Write the domain records**

Create `api/src/main/java/com/niramoy/bddrug/domain/IngredientSummary.java`:

```java
package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.util.List;

/**
 * One ingredient of a product as reviewers (and, from P2, approved product pages) see it (spec §7.3). Coverage
 * {@code not_run} means DDInter mapping never ran for the substance (no curated.interaction_coverage row): it is never
 * shown as "no data". An ingredient with no substance has {@code bdsId} null.
 */
public record IngredientSummary(String bdsId, String name, String raw, BigDecimal strengthValue, String strengthUnit,
                                BigDecimal perValue, String perUnit, List<Name> names, List<Code> codes, Coverage coverage,
                                Ddinter ddinter) {
    public record Name(String name, String type, String source) {}
    public record Code(String system, String code, String routeScope, String method, double confidence) {}
    public record Coverage(String coverage, String note) {}
    public record Chosen(String ddinterId, String name, String routeScope, boolean routeAssumed) {}
    public record Counts(int major, int moderate, int minor, int unknown, int total) {}
    public record Entry(String ddinterId, String name, String routeScope, Counts counts, int diseaseCount, int foodCount) {}
    public record Ddinter(List<Chosen> chosen, List<Entry> entries) {}
}
```

Create `api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java`:

```java
package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.Instant;
import java.util.List;

/** One batch record for the review desk (spec §7.3). No email anywhere: history carries roles and {@code mine}. */
public record ReviewItem(String batchId, String conceptId, int index, int total, String displayStatus, String review,
                         ReviewViews.Version version, BatchInfo batch, Brand brand, List<DgdaIngredient> dgdaIngredients,
                         Clinical clinicalDrug, List<IngredientSummary> ingredients, List<Stage> stages,
                         BatchPairs.Result batchPairs, @JsonRawValue String sourceJson, String sourceUrl,
                         List<ItemHistory.Entry> history, ItemHistory.Reopen reopen) {
    public record BatchInfo(Instant runAt, int itemCount, String status) {}
    public record Brand(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                        String genericContentRaw, String qualityFlag, String parseStatus, String parseNote) {}
    public record DgdaIngredient(String xmCode, String name) {}
    public record Clinical(String bdcId, String displayName, String doseForm, String route, String signature) {}
    public record TextMissingPair(String ddinterA, String nameA, String ddinterB, String nameB, String severity, boolean inBatch) {}
    public record Stage(String stage, String status, List<StageNotes.Note> notes, List<TextMissingPair> textMissing,
                        @JsonRawValue String evidence) {}
}
```

- [ ] **Step 4: Extend the port and write the readers**

Add to `ReviewQueryPort` (imports `com.niramoy.bddrug.domain.BatchPairs`, `com.niramoy.bddrug.domain.IngredientSummary`, `com.niramoy.bddrug.domain.ItemHistory`, `com.niramoy.bddrug.domain.ReviewItem`, `java.util.Collection`, `java.util.Map`):

```java
    /** The brand, clinical drug, DGDA ingredients and source of one current item; empty when unknown or removed. */
    record ItemDetail(String conceptId, String sourceJson, ReviewItem.Brand brand, ReviewItem.Clinical clinical, String bdcId,
                      List<ReviewItem.DgdaIngredient> dgdaIngredients) {}

    Mono<ItemDetail> itemDetail(String batchId, String conceptId);
    /** The product's ingredients in XM-code order, with names, codes, coverage and DDInter entries chosen for {@code route}. */
    Mono<List<IngredientSummary>> ingredients(String conceptId, String bdcId, String route);
    /** Every current product of the batch with its substances and their DDInter codes (for RouteRule on both sides). */
    Mono<List<BatchPairs.Product>> batchProducts(String batchId);
    /** Stored pairs whose two sides are both in {@code ids}; DDInter placeholder text already removed. */
    Mono<List<BatchPairs.PairRow>> pairRows(Collection<String> ids);
    /** DDInter names of the entries in {@code ids} that have a curated.ddinter_drug row (a complete pair list, §8.1). */
    Mono<Map<String, String>> entryNames(Collection<String> ids);
    /** The item's snapshots, oldest first. */
    Mono<List<ItemHistory.Snapshot>> snapshots(String batchId, String conceptId);
    /** run_at of every full batch run (no concept ids), oldest first. */
    Mono<List<Instant>> fullRuns(String batchId);
    /** The snapshot payload stamped exactly {@code extractedAt}; empty when there is none. */
    Mono<String> payload(String batchId, String conceptId, Instant extractedAt);
```

Create `api/src/main/java/com/niramoy/bddrug/adapter/persistence/IngredientSummaryReader.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.IngredientSummary.*;
import com.niramoy.bddrug.domain.RouteRule;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.util.*;

/**
 * Builds {@link IngredientSummary} for one product (spec §7.3). The ingredient list follows the DGDA ingredient rows
 * (XM-code order), so a product whose clinical drug is missing still lists its substances. Five queries, never per row.
 */
@Component
public class IngredientSummaryReader {
    static final String SYSTEM_RANK =
        "coalesce(array_position(ARRAY['ICD11_XM','RXCUI','ATC','DRUGBANK','SNOMEDCT','DDINTER'], system), 7)";
    static final String NAME_RANK = "coalesce(array_position(ARRAY['icd11','rxnorm','dgda_content','ddinter'], name_type), 5)";

    private final DatabaseClient db;
    public IngredientSummaryReader(DatabaseClient db) { this.db = db; }

    private record Row(String ingredientName, String bdsId, String preferredName, String raw, BigDecimal value, String unit,
                       BigDecimal per, String perUnit, String coverage, String coverageNote) {}
    private record EntryRow(String id, String name, int major, int moderate, int minor, int unknown, int total, int disease, int food) {}

    public Mono<List<IngredientSummary>> read(String conceptId, String bdcId, String route) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                SELECT bpi.ingredient_name, xm.bds_id, s.preferred_name, cdi.raw_text, cdi.strength_value, cdi.strength_unit,
                       cdi.per_value, cdi.per_unit, ic.coverage, ic.note
                FROM curated.brand_product_ingredient bpi
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.clinical_drug_ingredient cdi ON cdi.bdc_id = :bdc AND cdi.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE bpi.concept_id = :c
                ORDER BY bpi.xm_code COLLATE "C\"""").bind("c", conceptId);
        spec = bdcId == null ? spec.bindNull("bdc", String.class) : spec.bind("bdc", bdcId);
        return spec.map(r -> new Row(r.get("ingredient_name", String.class), r.get("bds_id", String.class),
                r.get("preferred_name", String.class), r.get("raw_text", String.class),
                ClinicalDrugReader.plain(r.get("strength_value", BigDecimal.class)), r.get("strength_unit", String.class),
                ClinicalDrugReader.plain(r.get("per_value", BigDecimal.class)), r.get("per_unit", String.class),
                r.get("coverage", String.class), r.get("note", String.class)))
            .all().collectList()
            .flatMap(all -> {
                List<Row> rows = new ArrayList<>();
                Set<String> seen = new HashSet<>();
                for (Row r : all) if (r.bdsId() == null || seen.add(r.bdsId())) rows.add(r);
                String[] ids = rows.stream().map(Row::bdsId).filter(Objects::nonNull).toArray(String[]::new);
                if (ids.length == 0) return Mono.just(assemble(rows, Map.of(), Map.of(), Map.of(), route));
                return Mono.zip(names(ids), codes(ids)).flatMap(t -> {
                    String[] dd = t.getT2().values().stream().flatMap(List::stream).filter(c -> "DDINTER".equals(c.system()))
                        .map(Code::code).distinct().toArray(String[]::new);
                    Mono<Map<String, EntryRow>> entries = dd.length == 0 ? Mono.just(Map.of()) : entries(dd);
                    return entries.map(e -> assemble(rows, t.getT1(), t.getT2(), e, route));
                });
            });
    }

    private Mono<Map<String, List<Name>>> names(String[] ids) {
        return db.sql("SELECT bds_id, name, name_type, source FROM curated.substance_name WHERE bds_id = ANY(:ids) " +
                      "ORDER BY bds_id, " + NAME_RANK + ", name")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class),
                new Name(r.get("name", String.class), r.get("name_type", String.class), r.get("source", String.class))))
            .all().collect(LinkedHashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }

    private Mono<Map<String, List<Code>>> codes(String[] ids) {
        return db.sql("SELECT bds_id, system, code, route_scope, method, confidence FROM curated.substance_code " +
                      "WHERE bds_id = ANY(:ids) ORDER BY bds_id, " + SYSTEM_RANK + ", code")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class), new Code(r.get("system", String.class), r.get("code", String.class),
                r.get("route_scope", String.class), r.get("method", String.class), r.get("confidence", BigDecimal.class).doubleValue())))
            .all().collect(LinkedHashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }

    /** Pair counts by severity (both sides of the stored pair), disease and food counts, and the DDInter name. */
    private Mono<Map<String, EntryRow>> entries(String[] ids) {
        return db.sql("""
                WITH e AS (SELECT unnest(CAST(:ids AS text[])) AS id),
                sides AS (SELECT p.ddinter_a AS id, p.severity FROM curated.ddinter_pair p WHERE p.ddinter_a = ANY(:ids)
                          UNION ALL
                          SELECT p.ddinter_b, p.severity FROM curated.ddinter_pair p WHERE p.ddinter_b = ANY(:ids))
                SELECT e.id, (SELECT d.name FROM curated.ddinter_drug d WHERE d.ddinter_id = e.id) AS name,
                       count(s.severity) FILTER (WHERE s.severity = 'major') AS major,
                       count(s.severity) FILTER (WHERE s.severity = 'moderate') AS moderate,
                       count(s.severity) FILTER (WHERE s.severity = 'minor') AS minor,
                       count(s.severity) FILTER (WHERE s.severity NOT IN ('major','moderate','minor')) AS unknown,
                       count(s.severity) AS total,
                       (SELECT count(*) FROM curated.ddinter_disease d WHERE d.ddinter_id = e.id) AS disease,
                       (SELECT count(*) FROM curated.ddinter_food f WHERE f.ddinter_id = e.id) AS food
                FROM e LEFT JOIN sides s ON s.id = e.id GROUP BY e.id""")
            .bind("ids", ids)
            .map(r -> new EntryRow(r.get("id", String.class), r.get("name", String.class), n(r.get("major", Long.class)),
                n(r.get("moderate", Long.class)), n(r.get("minor", Long.class)), n(r.get("unknown", Long.class)),
                n(r.get("total", Long.class)), n(r.get("disease", Long.class)), n(r.get("food", Long.class))))
            .all().collectMap(EntryRow::id, e -> e);
    }

    private static int n(Long v) { return v == null ? 0 : v.intValue(); }

    private static List<IngredientSummary> assemble(List<Row> rows, Map<String, List<Name>> names, Map<String, List<Code>> codes,
                                                    Map<String, EntryRow> entries, String route) {
        List<IngredientSummary> out = new ArrayList<>();
        for (Row r : rows) {
            if (r.bdsId() == null) {
                out.add(new IngredientSummary(null, r.ingredientName(), r.ingredientName(), null, null, null, null, List.of(),
                    List.of(), new Coverage("not_run", ""), new Ddinter(List.of(), List.of())));
                continue;
            }
            List<Code> mine = codes.getOrDefault(r.bdsId(), List.of());
            List<DdinterCode> dd = mine.stream().filter(c -> "DDINTER".equals(c.system()))
                .map(c -> new DdinterCode(c.code(), c.routeScope())).sorted(Comparator.comparing(DdinterCode::code, DdinterCode.ID_ORDER))
                .toList();
            List<Chosen> chosen = RouteRule.choose(dd, route).map(choice -> choice.codes().stream()
                .map(c -> new Chosen(c.code(), name(entries, c.code()), c.routeScope(), choice.routeAssumed())).toList()).orElse(List.of());
            List<Entry> list = dd.stream().map(c -> {
                EntryRow e = entries.get(c.code());
                Counts counts = e == null ? new Counts(0, 0, 0, 0, 0) : new Counts(e.major(), e.moderate(), e.minor(), e.unknown(), e.total());
                return new Entry(c.code(), name(entries, c.code()), c.routeScope(), counts, e == null ? 0 : e.disease(), e == null ? 0 : e.food());
            }).toList();
            Coverage coverage = r.coverage() == null ? new Coverage("not_run", "") : new Coverage(r.coverage(), r.coverageNote() == null ? "" : r.coverageNote());
            out.add(new IngredientSummary(r.bdsId(), r.preferredName(), r.raw() != null ? r.raw() : r.ingredientName(), r.value(),
                r.unit(), r.per(), r.perUnit(), names.getOrDefault(r.bdsId(), List.of()), mine, coverage, new Ddinter(chosen, list)));
        }
        return List.copyOf(out);
    }

    private static String name(Map<String, EntryRow> entries, String id) {
        EntryRow e = entries.get(id);
        return e == null ? null : e.name();
    }
}
```

Add to `R2dbcReviewQueryAdapter` (new imports: `com.fasterxml.jackson.databind.ObjectMapper` is not needed; add `com.niramoy.bddrug.domain.BatchPairs`, `com.niramoy.bddrug.domain.DdinterCode`, `com.niramoy.bddrug.domain.DdinterText`, `com.niramoy.bddrug.domain.IngredientSummary`, `com.niramoy.bddrug.domain.ItemHistory`, `com.niramoy.bddrug.domain.ReviewItem`, `java.time.ZoneOffset`, `java.util.Arrays`, `java.util.Collection`, `java.util.LinkedHashMap`, `java.util.UUID`). Change the constructor to take the reader:

```java
    private final IngredientSummaryReader ingredientsReader;
    public R2dbcReviewQueryAdapter(DatabaseClient db, IngredientSummaryReader ingredientsReader) {
        this.db = db;
        this.ingredientsReader = ingredientsReader;
    }
```

and add the methods:

```java
    @Override public Mono<ItemDetail> itemDetail(String batchId, String conceptId) {
        Mono<List<ReviewItem.DgdaIngredient>> dgda = db.sql(
                "SELECT xm_code, ingredient_name FROM curated.brand_product_ingredient WHERE concept_id = :c ORDER BY xm_code COLLATE \"C\"")
            .bind("c", conceptId)
            .map(r -> new ReviewItem.DgdaIngredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class)))
            .all().collectList();
        return db.sql("""
                SELECT bi.concept_id, rc.payload::text AS source_json, bp.concept_id AS brand_id, bp.dar_number, bp.trade_name,
                       bp.company, bp.dosage_form, bp.generic_content_raw, bp.quality_flag, bp.parse_status, bp.parse_note,
                       bp.bdc_id, cd.display_name, cd.dose_form, cd.route, cd.signature
                FROM ops.batch_item bi
                LEFT JOIN raw.ocl_concept rc ON rc.source = bi.source AND rc.concept_id = bi.concept_id
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                WHERE bi.batch_id = :b AND bi.concept_id = :c AND %s""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> {
                String brandId = r.get("brand_id", String.class);
                String bdcId = r.get("bdc_id", String.class);
                ReviewItem.Brand brand = brandId == null ? null : new ReviewItem.Brand(brandId, r.get("dar_number", String.class),
                    r.get("trade_name", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
                    r.get("generic_content_raw", String.class), r.get("quality_flag", String.class),
                    r.get("parse_status", String.class), r.get("parse_note", String.class));
                ReviewItem.Clinical clinical = r.get("display_name", String.class) == null ? null : new ReviewItem.Clinical(bdcId,
                    r.get("display_name", String.class), r.get("dose_form", String.class), r.get("route", String.class),
                    r.get("signature", String.class));
                return new ItemDetail(r.get("concept_id", String.class), r.get("source_json", String.class), brand, clinical, bdcId, List.of());
            })
            .one()
            .flatMap(d -> dgda.map(list -> new ItemDetail(d.conceptId(), d.sourceJson(), d.brand(), d.clinical(), d.bdcId(), list)));
    }

    @Override public Mono<List<IngredientSummary>> ingredients(String conceptId, String bdcId, String route) {
        return ingredientsReader.read(conceptId, bdcId, route);
    }

    private record ProductRow(String conceptId, String tradeName, String route, String xmCode, String ingredientName, String bdsId,
                              String substance, String coverage) {}

    @Override public Mono<List<BatchPairs.Product>> batchProducts(String batchId) {
        return db.sql("""
                SELECT bi.concept_id, coalesce(bp.trade_name, bi.concept_id) AS trade_name, cd.route, bpi.xm_code,
                       bpi.ingredient_name, xm.bds_id, s.preferred_name,
                       CASE WHEN xm.bds_id IS NULL THEN NULL ELSE coalesce(ic.coverage, 'not_run') END AS coverage
                FROM ops.batch_item bi
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bi.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE bi.batch_id = :b AND %s
                ORDER BY bi.concept_id COLLATE "C", bpi.xm_code COLLATE "C\"""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId)
            .map(r -> new ProductRow(r.get("concept_id", String.class), r.get("trade_name", String.class), r.get("route", String.class),
                r.get("xm_code", String.class), r.get("ingredient_name", String.class), r.get("bds_id", String.class),
                r.get("preferred_name", String.class), r.get("coverage", String.class)))
            .all().collectList()
            .flatMap(rows -> {
                String[] bds = rows.stream().map(ProductRow::bdsId).filter(Objects::nonNull).distinct().toArray(String[]::new);
                Mono<Map<String, List<DdinterCode>>> codes = bds.length == 0 ? Mono.just(Map.of()) : db.sql(
                        "SELECT bds_id, code, route_scope FROM curated.substance_code WHERE system = 'DDINTER' AND bds_id = ANY(:ids)")
                    .bind("ids", bds)
                    .map(r -> Map.entry(r.get("bds_id", String.class), new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class))))
                    .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
                return codes.map(c -> products(rows, c));
            });
    }

    private static List<BatchPairs.Product> products(List<ProductRow> rows, Map<String, List<DdinterCode>> codes) {
        Map<String, List<ProductRow>> byConcept = new LinkedHashMap<>();
        for (ProductRow r : rows) byConcept.computeIfAbsent(r.conceptId(), k -> new ArrayList<>()).add(r);
        List<BatchPairs.Product> out = new ArrayList<>();
        int index = 0;
        for (List<ProductRow> group : byConcept.values()) {
            ProductRow first = group.get(0);
            List<BatchPairs.Substance> subs = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (ProductRow r : group) {
                if (r.xmCode() == null || (r.bdsId() != null && !seen.add(r.bdsId()))) continue;
                subs.add(new BatchPairs.Substance(r.bdsId(), r.substance() != null ? r.substance() : r.ingredientName(), r.coverage(),
                    r.bdsId() == null ? List.of() : List.copyOf(codes.getOrDefault(r.bdsId(), List.of()))));
            }
            out.add(new BatchPairs.Product(first.conceptId(), first.tradeName(), ++index, first.route(), List.copyOf(subs)));
        }
        return List.copyOf(out);
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairRows(Collection<String> ids) {
        if (ids.isEmpty()) return Mono.just(List.of());
        String[] arr = ids.stream().distinct().toArray(String[]::new);
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE p.ddinter_a = ANY(:ids) AND p.ddinter_b = ANY(:ids)""")
            .bind("ids", arr)
            .map(r -> new BatchPairs.PairRow(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class),
                r.get("partner_name_a", String.class), r.get("partner_name_b", String.class), r.get("severity", String.class),
                R2dbcSubstanceAdapter.list(r, "actions"), DdinterText.clean(r.get("interaction", String.class)),
                DdinterText.clean(r.get("management", String.class))))
            .all().collectList();
    }

    @Override public Mono<Map<String, String>> entryNames(Collection<String> ids) {
        if (ids.isEmpty()) return Mono.just(Map.of());
        return db.sql("SELECT ddinter_id, name FROM curated.ddinter_drug WHERE ddinter_id = ANY(:ids)")
            .bind("ids", ids.stream().distinct().toArray(String[]::new))
            .map(r -> Map.entry(r.get("ddinter_id", String.class), r.get("name", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    @Override public Mono<List<ItemHistory.Snapshot>> snapshots(String batchId, String conceptId) {
        return db.sql("SELECT extracted_at, run_id, reason FROM ops.item_snapshot WHERE batch_id = :b AND concept_id = :c ORDER BY extracted_at")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new ItemHistory.Snapshot(r.get("extracted_at", OffsetDateTime.class).toInstant(), r.get("run_id", UUID.class),
                r.get("reason", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<Instant>> fullRuns(String batchId) {
        return db.sql("SELECT run_at FROM ops.batch_run WHERE batch_id = :b AND cardinality(concept_ids) = 0 ORDER BY run_at, id")
            .bind("b", batchId).map(r -> r.get("run_at", OffsetDateTime.class).toInstant()).all().collectList();
    }

    @Override public Mono<String> payload(String batchId, String conceptId, Instant extractedAt) {
        return db.sql("SELECT payload::text AS payload FROM ops.item_snapshot WHERE batch_id = :b AND concept_id = :c AND extracted_at = :t")
            .bind("b", batchId).bind("c", conceptId).bind("t", extractedAt.atOffset(ZoneOffset.UTC))
            .map(r -> r.get("payload", String.class)).one();
    }
```

(also add `import java.util.HashSet; import java.util.Objects; import java.util.Set;` — the file already imports `ArrayList`, `HashMap`, `List`, `Map`).

- [ ] **Step 5: Extend the service and the controller**

Add to `ReviewQueryService` (new imports: `com.niramoy.bddrug.domain.BatchPairs`, `com.niramoy.bddrug.domain.DdinterCode`, `com.niramoy.bddrug.domain.ItemHistory`, `com.niramoy.bddrug.domain.ReviewItem`, `com.niramoy.bddrug.domain.ReviewViews`, `com.niramoy.bddrug.domain.RouteRule`, `com.niramoy.bddrug.domain.SnapshotDiff`, `com.niramoy.bddrug.domain.StageNotes`, `java.net.URLEncoder`, `java.nio.charset.StandardCharsets`, `java.time.Instant`, `java.time.format.DateTimeParseException`, `java.util.HashMap`, `java.util.HashSet`, `java.util.Set`):

```java
    public static final String OCL_CONCEPT = "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/";
    private static final List<String> STAGES = List.of("dgda", "substances", "clinical", "ddinter");

    /**
     * The OCL concept URL, as web/lib/evidence.ts builds it with encodeURIComponent. URLEncoder escapes five characters
     * that encodeURIComponent keeps (! ' ( ) ~) and writes a space as "+", so both are undone here.
     */
    public static String sourceUrl(String conceptId) {
        String encoded = URLEncoder.encode(conceptId, StandardCharsets.UTF_8).replace("+", "%20")
            .replace("%21", "!").replace("%27", "'").replace("%28", "(").replace("%29", ")").replace("%7E", "~");
        return OCL_CONCEPT + encoded + "/";
    }

    private static Assessed find(List<Assessed> all, String conceptId) {
        return all.stream().filter(a -> a.facts().conceptId().equals(conceptId)).findFirst()
            .orElseThrow(() -> new NotFoundException("conceptId", "Batch item not found"));
    }

    public Mono<ReviewItem> item(String batchId, String conceptId, String viewerEmail) {
        return requireBatch(batchId).flatMap(batch -> port.items(batchId).flatMap(items -> {
            List<Assessed> all = assess(items);
            Assessed me = find(all, conceptId);
            return port.itemDetail(batchId, conceptId)
                .switchIfEmpty(Mono.error(() -> new NotFoundException("conceptId", "Batch item not found")))
                .flatMap(d -> {
                    String route = d.clinical() == null ? null : d.clinical().route();
                    return Mono.zip(port.ingredients(conceptId, d.bdcId(), route), pairs(batchId, conceptId), port.snapshots(batchId, conceptId),
                            port.fullRuns(batchId))
                        .flatMap(t -> stages(me, t.getT2().products(), conceptId).map(stages -> {
                            List<Instant> runs = t.getT4().isEmpty() ? List.of(batch.runAt()) : t.getT4();
                            List<ItemHistory.Decision> decisions = me.facts().decisions().stream().map(x -> new ItemHistory.Decision(
                                x.id(), x.decision(), x.note(), x.reviewerRole(), x.decidedAt(),
                                viewerEmail != null && x.reviewerEmail() != null && x.reviewerEmail().equalsIgnoreCase(viewerEmail.strip()))).toList();
                            ItemHistory.Result history = ItemHistory.build(runs, t.getT3(), decisions, me.facts().extractedAt());
                            return new ReviewItem(batchId, conceptId, me.index(), all.size(), me.displayStatus(), me.facts().review(),
                                me.version(), new ReviewItem.BatchInfo(batch.runAt(), all.size(), batch.status()), d.brand(),
                                d.dgdaIngredients(), d.clinical(), t.getT1(), stages, t.getT2().result(), d.sourceJson(),
                                sourceUrl(conceptId), history.history(), history.reopen());
                        }));
                });
        }));
    }

    /** The batch products and the pair result for the open record (RouteRule on both sides, §5.6.2). */
    private record PairsAndProducts(List<BatchPairs.Product> products, BatchPairs.Result result) {}

    private Mono<PairsAndProducts> pairs(String batchId, String conceptId) {
        return port.batchProducts(batchId).flatMap(products -> {
            Set<String> ids = new HashSet<>();
            for (BatchPairs.Product p : products)
                for (BatchPairs.Substance s : p.substances()) for (DdinterCode c : s.codes()) ids.add(c.code());
            return Mono.zip(port.pairRows(ids), port.entryNames(ids))
                .map(t -> new PairsAndProducts(products, BatchPairs.compute(conceptId, products, t.getT1(), t.getT2().keySet())));
        });
    }

    /** The ids each product checks with (RouteRule on its own route). */
    private static Set<String> chosen(BatchPairs.Product p) {
        Set<String> out = new HashSet<>();
        for (BatchPairs.Substance s : p.substances())
            RouteRule.choose(s.codes(), p.route()).ifPresent(c -> c.codes().forEach(x -> out.add(x.code())));
        return out;
    }

    /** Stage results with structured notes and enriched text-missing pairs (§7.3), in stage order. */
    private Mono<List<ReviewItem.Stage>> stages(Assessed me, List<BatchPairs.Product> products, String conceptId) {
        List<String[]> missing = new ArrayList<>();
        for (ReviewQueryPort.StageRow s : me.facts().stages()) if ("ddinter".equals(s.stage())) missing.addAll(textMissing(s.evidence()));
        Set<String> ids = new HashSet<>();
        for (String[] m : missing) { ids.add(m[0]); ids.add(m[1]); }
        Set<String> mine = new HashSet<>(), others = new HashSet<>();
        for (BatchPairs.Product p : products) (p.conceptId().equals(conceptId) ? mine : others).addAll(chosen(p));
        return Mono.zip(port.entryNames(ids), port.pairRows(ids)).map(t -> {
            Map<String, BatchPairs.PairRow> rows = new HashMap<>();
            for (BatchPairs.PairRow r : t.getT2()) rows.put(r.ddinterA() + "|" + r.ddinterB(), r);
            List<ReviewItem.Stage> out = new ArrayList<>();
            for (String stage : STAGES)
                for (ReviewQueryPort.StageRow s : me.facts().stages()) {
                    if (!stage.equals(s.stage())) continue;
                    List<ReviewItem.TextMissingPair> pairs = new ArrayList<>();
                    if ("ddinter".equals(stage))
                        for (String[] m : textMissing(s.evidence())) {
                            BatchPairs.PairRow row = rows.get(m[0] + "|" + m[1]);
                            String other = mine.contains(m[0]) ? m[1] : m[0];
                            pairs.add(new ReviewItem.TextMissingPair(m[0], name(t.getT1(), row, m[0], true), m[1],
                                name(t.getT1(), row, m[1], false), row == null ? null : row.severity(), others.contains(other)));
                        }
                    out.add(new ReviewItem.Stage(s.stage(), s.status(), StageNotes.parse(s.stage(), s.status(), s.note()),
                        List.copyOf(pairs), s.evidence()));
                }
            return List.copyOf(out);
        });
    }

    /** DDInter's own name for an entry, else the stored pair's partner name, else the id. */
    private static String name(Map<String, String> names, BatchPairs.PairRow row, String id, boolean sideA) {
        if (names.get(id) != null) return names.get(id);
        if (row != null) return sideA ? row.nameA() : row.nameB();
        return id;
    }

    public Mono<ReviewViews.Diff> diff(String batchId, String conceptId, String from) {
        return Mono.fromCallable(() -> {
                if (from == null) throw new InvalidQueryException("from", "from is required: the extractedAt the page showed");
                try {
                    return Instant.parse(from);
                } catch (DateTimeParseException e) {
                    throw new InvalidQueryException("from", "from must be an ISO-8601 instant");
                }
            })
            .flatMap(fromAt -> requireBatch(batchId).then(port.items(batchId)).flatMap(items -> {
                Assessed me = find(assess(items), conceptId);
                Instant to = me.facts().extractedAt();
                Mono<String> before = port.payload(batchId, conceptId, fromAt)
                    .switchIfEmpty(Mono.error(() -> new NotFoundException("from", "No snapshot of this record at that time")));
                Mono<String> now = to == null ? Mono.error(new NotFoundException("from", "No snapshot of this record at that time"))
                    : port.payload(batchId, conceptId, to)
                        .switchIfEmpty(Mono.error(() -> new NotFoundException("from", "No snapshot of this record at that time")));
                return Mono.zip(before, now, port.snapshots(batchId, conceptId)).map(t -> {
                    ItemHistory.Reopen reopen = ItemHistory.build(List.of(), t.getT3(), List.of(), to).reopen();
                    try {
                        return new ReviewViews.Diff(fromAt, to, reopen == null ? "rerun" : reopen.reason(),
                            SnapshotDiff.diff(json.readTree(t.getT1()), json.readTree(t.getT2())));
                    } catch (Exception e) {
                        throw new IllegalStateException("ops.item_snapshot.payload is not JSON", e);
                    }
                });
            }));
    }
```

Add to `ReviewQueryController` (imports `com.niramoy.bddrug.domain.ReviewItem`, `com.niramoy.bddrug.domain.ReviewViews`):

```java
    /** {@code X-Viewer-Email} marks the viewer's own decisions ({@code mine}); it is never echoed (spec §7.3). */
    @GetMapping("/{batchId}/items/{conceptId}")
    public Mono<ApiResponse<ReviewItem>> item(@PathVariable String batchId, @PathVariable String conceptId,
                                              @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                              @RequestHeader(value = "X-Viewer-Email", required = false) String viewer) {
        auth.require(token);
        return service.item(batchId, conceptId, viewer).map(ApiResponse::ok);
    }

    @GetMapping("/{batchId}/items/{conceptId}/diff")
    public Mono<ApiResponse<ReviewViews.Diff>> diff(@PathVariable String batchId, @PathVariable String conceptId,
                                                    @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                                    @RequestParam(required = false) String from) {
        auth.require(token);
        return service.diff(batchId, conceptId, from).map(ApiResponse::ok);
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.ReviewQueryIntegrationTest'`
Expected: BUILD SUCCESSFUL; 17 tests pass.

Run: `cd api && ./gradlew test --no-daemon`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/IngredientSummary.java api/src/main/java/com/niramoy/bddrug/domain/ReviewItem.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/IngredientSummaryReader.java \
  api/src/main/java/com/niramoy/bddrug/application/port/ReviewQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcReviewQueryAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/ReviewQueryService.java \
  api/src/main/java/com/niramoy/bddrug/presentation/ReviewQueryController.java \
  api/src/test/java/com/niramoy/bddrug/ReviewQueryIntegrationTest.java
git commit -m "feat(api): reviewer record read with route-aware pairs, structured notes, history and diff (spec 7.3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6b: API — coverage `not_run` on the substance and check endpoints (§7.3 "Coverage `not_run`")

§7.3 names two places outside the review endpoints that default a missing `curated.interaction_coverage` row to `none`: `R2dbcSubstanceAdapter.coverage()` and `InteractionCheckService.substances()`. §12.2 gives all of §7.3 to P1B, so both change here; otherwise every public page keeps showing `NO_DATA_SENTENCE` for a substance DDInter was never asked about. The `notChecked` list with reasons `not_run` and `unmapped` belongs to the §7.4 `CheckResult` extension (P2). Until P2 ships it, a `not_run` substance stays in the compatibility `noData` list, so nothing is silently dropped from a check result; only its `coverage` value changes. An ingredient with no substance (`bdsId == null`) keeps `coverage` `"none"` here, because the `unmapped` value is a `notChecked` reason that P2 adds, not a coverage value.

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSubstanceAdapter.java` (`coverage()`), `api/src/main/java/com/niramoy/bddrug/application/InteractionCheckService.java` (`substances()`)
- Test: `api/src/test/java/com/niramoy/bddrug/SubstanceApiIntegrationTest.java`, `api/src/test/java/com/niramoy/bddrug/InteractionCheckServiceTest.java`

**Interfaces:**
- Consumes: `Substance.Coverage(String coverage, String note)`, `Substance.NOT_LOADED_NOTE` ("DDInter mapping has not run for this substance"), `CheckResult.SubstanceCoverage(String bdsId, String name, String coverage)` (existing).
- Produces: `GET /v1/substances/{id}` → `coverage.coverage = "not_run"`, `coverage.note = Substance.NOT_LOADED_NOTE` when the substance has no coverage row; `POST /v1/interactions/check` → `products[].substances[].coverage = "not_run"` for the same case. P2 builds §7.4's `notChecked` (`not_run`, `unmapped`) on these values.

- [ ] **Step 1: Write the failing tests**

Append to `SubstanceApiIntegrationTest` (it already imports `TestSupport`; `exec` runs SQL on the container):

```java
    @Test void aSubstanceWithNoCoverageRowIsNotRunNeverNoData() throws Exception {
        TestSupport.exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000099', 'Notrunmol')
            ON CONFLICT DO NOTHING""");
        all().get().uri("/v1/substances/BDS-000099?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.coverage.coverage").isEqualTo("not_run")
            .jsonPath("$.data.coverage.note").isEqualTo("DDInter mapping has not run for this substance");
    }
```

In `InteractionCheckServiceTest.noCoverageMissingCoverageAndNoRouteEntryAreAllNoData`, rename the test to `noCoverageMissingCoverageAndNoRouteEntryAreAllListed` and replace its last line

```java
        assertThat(r.products().get(2).substances().get(0).coverage()).isEqualTo("none");
```

with

```java
        // NOCOV (BDS-6) has no curated.interaction_coverage row: DDInter never ran for it (§7.3), so it is not_run, not none
        assertThat(r.products().get(2).substances().get(0).coverage()).isEqualTo("not_run");
        assertThat(r.products().get(1).substances().get(0).coverage()).as("a real coverage row stays as stored").isEqualTo("none");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.SubstanceApiIntegrationTest' --tests 'com.niramoy.bddrug.InteractionCheckServiceTest'`
Expected: FAIL — `expected "not_run" but was "none"` in both classes.

- [ ] **Step 3: Implement**

In `R2dbcSubstanceAdapter.coverage()`, replace

```java
            .defaultIfEmpty(new Substance.Coverage("none", Substance.NOT_LOADED_NOTE));
```

with

```java
            .defaultIfEmpty(new Substance.Coverage("not_run", Substance.NOT_LOADED_NOTE));   // §7.3: no row = never ran
```

In `InteractionCheckService.substances()`, replace the Javadoc line and the `bds:` branch:

```java
    /** One entry per substance: rows without a substance stay separate (by XM code); missing coverage counts as none. */
```

```java
                    r.coverage() != null ? r.coverage() : "none"));
```

with

```java
    /**
     * One entry per substance: rows without a substance stay separate (by XM code). A substance with no coverage row is
     * not_run (§7.3): DDInter was never asked about it. It stays in noData until P2's notChecked list (§7.4) replaces it.
     */
```

```java
                    r.coverage() != null ? r.coverage() : "not_run"));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests 'com.niramoy.bddrug.SubstanceApiIntegrationTest' --tests 'com.niramoy.bddrug.InteractionCheckServiceTest' && ./gradlew test --no-daemon`
Expected: BUILD SUCCESSFUL. `CheckApiIntegrationTest`'s `"none"` assertions stay green: Domperidone has a `none` row, and `X-NOSUB` has no substance.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSubstanceAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/InteractionCheckService.java \
  api/src/test/java/com/niramoy/bddrug/SubstanceApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/InteractionCheckServiceTest.java
git commit -m "fix(api): a substance with no coverage row is not_run, never none (spec 7.3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Web — review types and the API client for review reads, desk decisions and flag pages

**Files:**
- Create: `web/lib/review-types.ts`
- Modify: `web/lib/api.ts`
- Test: `web/tests/review-api.test.ts`, `web/tests/api-scope.test.ts` (P0's `listFlags` case reads the paged body)

**Interfaces:**
- Consumes: the module-private helpers P0 Task 11 pins in `web/lib/api.ts` (not renamed, not inlined): `async function reviewerRead(path: string): Promise<Response>`, `const read = (url: string, headers: Record<string, string> = {}) => …`, `async function write<T>(path: string, payload: unknown): Promise<WriteResult<T>>`, `function internalToken(): string | null`, `const base = () => …`, `const TOKEN_HEADER = "X-Internal-Token"`; P0's `WriteResult<T>` and `DecisionRequest` (with `expectedLastDecisionId` and `requestId`, P0 Tasks 8a and 8b); the API shapes of Tasks 1, 5 and 6.
- Produces:
  - `web/lib/review-types.ts` (client-safe, imports nothing): `ReviewerRole`, `DisplayStatus`, `FilterKey`, `FILTER_KEYS`, `Version`, `ItemHint`, `ReviewBatchSummary`, `ItemRow`, `ItemsPage`, `VersionRow`, `StageKey`, `STAGE_KEYS`, `StageNote`, `TextMissingPair`, `ReviewStage`, `ChosenEntry`, `EntrySummary`, `IngredientSummary`, `PartnerRef`, `BatchPair`, `NotCheckedReason`, `NotCheckedPair`, `BatchPairs`, `HistoryEntry`, `Reopen`, `ReviewBrand`, `ReviewClinical`, `ReviewItem`, `DiffRow`, `ReviewDiff`, `FlagItem`, `FlagPage`, `DeskOutcome`, and `sameVersion(a: Version, b: Version): boolean`.
  - From `@/lib/api` (server-only): `REVIEW_Q_MAX = 100`; `listReviewBatches(): Promise<ReviewBatchSummary[]>`; `getReviewItems(batchId, opts?: {show?: FilterKey; q?: string; page?: number; size?: number}): Promise<ItemsPage | null>` (default size 500, `q` trimmed and clamped to 100 code points); `getReviewVersions(batchId): Promise<VersionRow[] | null>`; `getReviewItem(batchId, conceptId, viewerEmail: string | null): Promise<ReviewItem | null>`; `getReviewDiff(batchId, conceptId, from: string): Promise<ReviewDiff | null>`; `postDeskDecision(batchId, conceptId, d: DecisionRequest): Promise<WriteResult<DeskOutcome>>`; `listFlagPage(kind: "reports" | "partner", page: number): Promise<FlagPage>` (no email reaches a page); `createFlag(f)` and `resolveFlag(id, resolvedBy, requestId?)` send `requestId`. `reviewerRead(path, headers?)` gains an optional header map. `listFlags` now reads `data.items` (deleted in Task 20).

- [ ] **Step 1: Write the failing test**

Create `web/tests/review-api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_Q_MAX, getReviewDiff, getReviewItem, getReviewItems, getReviewVersions, listFlagPage, listReviewBatches, postDeskDecision,
  resolveFlag,
} from "@/lib/api";
import { sameVersion } from "@/lib/review-types";

const TOKEN = "t".repeat(40);
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const fail = (status: number, field: string | null, message = "x") =>
  new Response(JSON.stringify({ success: false, errors: [{ field, code: "CONFLICT", message }] }), { status });
const headersOf = (call: unknown[]) => new Headers((call[1] as RequestInit).headers);

beforeEach(() => { vi.stubEnv("API_URL", "http://api:8080"); vi.stubEnv("INTERNAL_API_TOKEN", TOKEN); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("review reads (§7.3)", () => {
  it("send the internal token and never a scope", async () => {
    const f = vi.fn().mockResolvedValue(ok([])); vi.stubGlobal("fetch", f);
    expect(await listReviewBatches()).toEqual([]);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/review/batches");
    expect(headersOf(f.mock.calls[0]).get("X-Internal-Token")).toBe(TOKEN);
  });

  it("throw before any call when the token is not configured", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "short");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await expect(listReviewBatches()).rejects.toThrow("The internal API token is not configured");
    expect(f).not.toHaveBeenCalled();
  });

  it("build the items query: no show for all, trimmed q, size 500 by default, encoded batch id", async () => {
    const f = vi.fn().mockResolvedValue(ok({ items: [] })); vi.stubGlobal("fetch", f);
    await getReviewItems("0001 pilot", { show: "all", q: "  napa  " });
    await getReviewItems("0001-pilot", { show: "needs", page: 2, size: 50 });
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/review/batches/0001%20pilot/items?q=napa&size=500");
    expect(f.mock.calls[1][0]).toBe("http://api:8080/v1/review/batches/0001-pilot/items?show=needs&page=2&size=50");
  });

  it("clamps q to 100 characters, counted in code points (Review Focus 5)", async () => {
    const f = vi.fn().mockResolvedValue(ok({ items: [] })); vi.stubGlobal("fetch", f);
    await getReviewItems("b", { q: "😀".repeat(150) });
    const q = new URL(f.mock.calls[0][0] as string).searchParams.get("q")!;
    expect(REVIEW_Q_MAX).toBe(100);
    expect([...q]).toHaveLength(100);
  });

  it("answer null for an unknown batch, record or snapshot and throw on 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getReviewItems("nope")).toBeNull();
    expect(await getReviewVersions("nope")).toBeNull();
    expect(await getReviewItem("b", "c", null)).toBeNull();
    expect(await getReviewDiff("b", "c", "2026-10-12T09:00:00Z")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 502 })));
    await expect(getReviewVersions("b")).rejects.toThrow("API error 502");
  });

  it("send the viewer's email only as a header, and encode ids and the diff time", async () => {
    const f = vi.fn().mockResolvedValue(ok({ conceptId: "a/b" })); vi.stubGlobal("fetch", f);
    await getReviewItem("0001-pilot", "a/b", "Pharm@E2E.test");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/review/batches/0001-pilot/items/a%2Fb");
    expect(headersOf(f.mock.calls[0]).get("X-Viewer-Email")).toBe("Pharm@E2E.test");
    await getReviewItem("0001-pilot", "c", null);
    expect(headersOf(f.mock.calls[1]).has("X-Viewer-Email")).toBe(false);
    await getReviewDiff("0001-pilot", "c", "2026-10-12T09:00:00.123456Z");
    expect(f.mock.calls[2][0]).toBe(
      "http://api:8080/v1/review/batches/0001-pilot/items/c/diff?from=2026-10-12T09%3A00%3A00.123456Z");
  });
});

describe("desk decisions", () => {
  const request = { decision: "ok" as const, note: "", reviewerEmail: "pharm@e2e.test", reviewerRole: "pharmacist" as const,
    extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: null, requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" };

  it("post the version and the requestId, and return the outcome with its version", async () => {
    const f = vi.fn().mockResolvedValue(ok({ review: "ok", displayStatus: "approved", batchStatus: "in_review",
      version: { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: 42 }, replayed: false }, 201));
    vi.stubGlobal("fetch", f);
    expect(await postDeskDecision("0001-pilot", "N-1", request)).toEqual({ ok: true, data: { review: "ok",
      displayStatus: "approved", batchStatus: "in_review", version: { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: 42 },
      replayed: false } });
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ decision: "ok", note: "",
      reviewerEmail: "pharm@e2e.test", reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00.123456Z",
      expectedLastDecisionId: null, requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" });
  });

  it("carry the 409 field and message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fail(409, "lastDecisionId", "Another reviewer decided")));
    expect(await postDeskDecision("b", "c", request)).toEqual({ ok: false, status: 409, error: "Another reviewer decided",
      field: "lastDecisionId" });
  });

  it("a replay (200) is a success with replayed true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ review: "ok", displayStatus: "approved", batchStatus: "approved",
      version: { extractedAt: null, lastDecisionId: 7 }, replayed: true })));
    const r = await postDeskDecision("b", "c", request);
    expect(r.ok && r.data.replayed).toBe(true);
  });
});

describe("flag pages (§5.16, §7.5)", () => {
  const flag = { id: 3, targetType: "product", targetId: "N-1", message: "pack says 10 mg", reporterEmail: "u@x.org",
    status: "open", createdAt: "2026-10-12T09:00:00Z", resolvedAt: null, resolvedBy: null };

  it("problem reports are every open flag but partner requests; partner requests are other/partner-access", async () => {
    const f = vi.fn().mockResolvedValue(ok({ items: [flag], page: 0, size: 50, hasMore: false })); vi.stubGlobal("fetch", f);
    await listFlagPage("reports", 0);
    await listFlagPage("partner", 2);
    // no targetType filter: an `other` flag that is not a partner request is still a problem report (§5.16)
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/flags?status=open&excludeTargetId=partner-access&page=0&size=50");
    expect(f.mock.calls[1][0]).toBe("http://api:8080/v1/flags?status=open&targetType=other&targetId=partner-access&page=2&size=50");
  });

  it("drops reporter and resolver emails before any page can render them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ items: [flag], page: 0, size: 50, hasMore: true })));
    const page = await listFlagPage("reports", 0);
    expect(page).toEqual({ items: [{ id: 3, targetType: "product", targetId: "N-1", message: "pack says 10 mg", status: "open",
      createdAt: "2026-10-12T09:00:00Z" }], page: 0, size: 50, hasMore: true });
    expect(JSON.stringify(page)).not.toContain("@");
  });

  it("resolve sends the request id for the audit row", async () => {
    const f = vi.fn().mockResolvedValue(ok({ id: 3 })); vi.stubGlobal("fetch", f);
    await resolveFlag(3, "pharm@e2e.test", "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22");
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string))
      .toEqual({ resolvedBy: "pharm@e2e.test", requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" });
  });
});

describe("sameVersion", () => {
  it("compares the stamp text and the decision id, nulls included", () => {
    expect(sameVersion({ extractedAt: null, lastDecisionId: null }, { extractedAt: null, lastDecisionId: null })).toBe(true);
    expect(sameVersion({ extractedAt: "a", lastDecisionId: 1 }, { extractedAt: "a", lastDecisionId: 2 })).toBe(false);
    expect(sameVersion({ extractedAt: "a", lastDecisionId: null }, { extractedAt: null, lastDecisionId: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/review-api.test.ts`
Expected: FAIL — `listReviewBatches` (and the other new names) are not exported from `@/lib/api`; `@/lib/review-types` does not resolve.

- [ ] **Step 3: Write the types**

Create `web/lib/review-types.ts`:

```ts
/*
 * Shapes of the reviewer endpoints (spec §7.3) shared by the review pages (server) and the desk islands (client).
 * This module imports nothing, so an island may import it.
 */
export type ReviewerRole = "pharmacist" | "engineer";
export type DisplayStatus = "pending" | "approved" | "engineer_checked" | "issue" | "back_in_review";
export type FilterKey = "all" | "needs" | "warn" | "issue" | "approved" | "nodata";
export const FILTER_KEYS: readonly FilterKey[] = ["all", "needs", "warn", "issue", "approved", "nodata"];
export type StageKey = "dgda" | "substances" | "clinical" | "ddinter";
export const STAGE_KEYS: readonly StageKey[] = ["dgda", "substances", "clinical", "ddinter"];

/** The stale-detection token (§5.11): the run stamp exactly as the API serialised it, and the newest decision id. */
export type Version = { extractedAt: string | null; lastDecisionId: number | null };
export const sameVersion = (a: Version, b: Version) => a.extractedAt === b.extractedAt && a.lastDecisionId === b.lastDecisionId;

export type ItemHint = { failed: number; warnings: number; pairsWithoutText: number; noData: boolean; notRun: boolean };
export type ReviewBatchSummary = {
  batchId: string; status: "in_review" | "approved" | "rejected"; runAt: string; itemCount: number;
  counts: { approved: number; issue: number; needsReview: number; engineerChecked: number; backInReview: number; noData: number; warnings: number };
};
export type ItemRow = {
  index: number; conceptId: string; tradeName: string; clinicalDisplayName: string | null; displayStatus: DisplayStatus;
  hint: ItemHint; version: Version;
};
export type ItemsPage = { batchId: string; total: number; filterCounts: Record<FilterKey, number>; items: ItemRow[] };
export type VersionRow = { conceptId: string; extractedAt: string | null; lastDecisionId: number | null; displayStatus: DisplayStatus };

export type StageNote = {
  kind: "text_missing" | "name_only" | "no_data" | "route_assumed" | "no_route_entry" | "other";
  text: string; ddinterId: string | null; route: string | null;
};
export type TextMissingPair = { ddinterA: string; nameA: string; ddinterB: string; nameB: string; severity: string | null; inBatch: boolean };
export type ReviewStage = { stage: StageKey; status: "ok" | "warn" | "fail"; notes: StageNote[]; textMissing: TextMissingPair[]; evidence: unknown };

export type ChosenEntry = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type EntrySummary = {
  ddinterId: string; name: string | null; routeScope: string;
  counts: { major: number; moderate: number; minor: number; unknown: number; total: number }; diseaseCount: number; foodCount: number;
};
export type IngredientSummary = {
  bdsId: string | null; name: string; raw: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null;
  names: { name: string; type: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; method: string; confidence: number }[];
  coverage: { coverage: "full" | "none" | "not_run"; note: string };
  ddinter: { chosen: ChosenEntry[]; entries: EntrySummary[] };
};

export type PartnerRef = { conceptId: string; tradeName: string; index: number };
export type BatchPair = {
  ddinterA: string; ddinterB: string; nameA: string; nameB: string; substance: string; partnerSubstance: string;
  severity: string; actions: string[]; interaction: string | null; management: string | null; partners: PartnerRef[];
};
export type NotCheckedReason = "no_data" | "not_run" | "no_route" | "unmapped" | "same_product";
export type NotCheckedPair = {
  substance: string; partnerSubstance: string; partners: PartnerRef[]; reason: NotCheckedReason; side: "this" | "partner";
  route: string | null;
};
export type BatchPairs = { totalBatchPairs: number; pairs: BatchPair[]; notChecked: NotCheckedPair[] };

export type HistoryEntry = {
  kind: "run" | "extract" | "decision"; at: string; reason?: "run" | "rerun" | "shared_change"; role?: ReviewerRole;
  decision?: "ok" | "issue"; note?: string; counts?: boolean; mine?: boolean;
};
export type Reopen = { reason: "rerun" | "shared_change"; at: string; previousExtractedAt: string; diffAvailable: boolean };

export type ReviewBrand = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string; genericContentRaw: string;
  qualityFlag: string | null; parseStatus: string | null; parseNote: string | null;
};
export type ReviewClinical = { bdcId: string; displayName: string; doseForm: string; route: string | null; signature: string };
export type ReviewItem = {
  batchId: string; conceptId: string; index: number; total: number; displayStatus: DisplayStatus; review: "pending" | "ok" | "issue";
  version: Version; batch: { runAt: string; itemCount: number; status: string };
  brand: ReviewBrand | null; dgdaIngredients: { xmCode: string; name: string }[]; clinicalDrug: ReviewClinical | null;
  ingredients: IngredientSummary[]; stages: ReviewStage[]; batchPairs: BatchPairs; sourceJson: unknown; sourceUrl: string;
  history: HistoryEntry[]; reopen: Reopen | null;
};
export type DiffRow = { field: string; before: string | null; now: string | null };
export type ReviewDiff = { from: string; to: string; reason: "rerun" | "shared_change"; rows: DiffRow[] };

/** A flag as /review/flags shows it: never the reporter's or resolver's email (§2.2). */
export type FlagItem = { id: number; targetType: string; targetId: string; message: string; status: string; createdAt: string };
export type FlagPage = { items: FlagItem[]; page: number; size: number; hasMore: boolean };

/** What a saved (or replayed) decision returns (§7.2). */
export type DeskOutcome = { review: string; displayStatus: DisplayStatus; batchStatus: string; version: Version; replayed: boolean };
```

- [ ] **Step 4: Extend the API client**

In `web/lib/api.ts`:

Add at the top, after `import "server-only";`:

```ts
import type {
  DeskOutcome, FilterKey, FlagItem, FlagPage, ItemsPage, ReviewBatchSummary, ReviewDiff, ReviewItem, VersionRow,
} from "./review-types";
```

Replace P0's `reviewerRead` with:

```ts
/** Batch evidence shows unreviewed records: reviewers only (A1). These reads carry the token and fail without one. */
async function reviewerRead(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const token = internalToken();
  if (!token) throw new Error("The internal API token is not configured");
  return read(`${base()}${path}`, { ...headers, [TOKEN_HEADER]: token });
}
```

Append after `getDecisions`:

```ts
// ---- Reviewer reads (spec §7.3). Every one needs the token; an unknown batch, record or snapshot is null. ----

const enc = encodeURIComponent;

async function reviewData<T>(path: string, headers: Record<string, string> = {}): Promise<T | null> {
  const res = await reviewerRead(path, headers);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as T;
}

/** The API refuses a longer record filter (400); the desk never sends one. */
export const REVIEW_Q_MAX = 100;

export async function listReviewBatches(): Promise<ReviewBatchSummary[]> {
  return (await reviewData<ReviewBatchSummary[]>("/v1/review/batches")) ?? [];
}

export async function getReviewItems(batchId: string, opts: { show?: FilterKey; q?: string; page?: number; size?: number } = {}):
    Promise<ItemsPage | null> {
  const params = new URLSearchParams();
  if (opts.show && opts.show !== "all") params.set("show", opts.show);
  const q = [...(opts.q ?? "").trim()].slice(0, REVIEW_Q_MAX).join("");
  if (q) params.set("q", q);
  if (opts.page) params.set("page", String(opts.page));
  params.set("size", String(opts.size ?? 500));
  return reviewData<ItemsPage>(`/v1/review/batches/${enc(batchId)}/items?${params}`);
}

export async function getReviewVersions(batchId: string): Promise<VersionRow[] | null> {
  return reviewData<VersionRow[]>(`/v1/review/batches/${enc(batchId)}/versions`);
}

/** `viewerEmail` only marks the viewer's own decisions ("(you)"); the API never echoes it. */
export async function getReviewItem(batchId: string, conceptId: string, viewerEmail: string | null): Promise<ReviewItem | null> {
  return reviewData<ReviewItem>(`/v1/review/batches/${enc(batchId)}/items/${enc(conceptId)}`,
    viewerEmail ? { "X-Viewer-Email": viewerEmail } : {});
}

export async function getReviewDiff(batchId: string, conceptId: string, from: string): Promise<ReviewDiff | null> {
  return reviewData<ReviewDiff>(`/v1/review/batches/${enc(batchId)}/items/${enc(conceptId)}/diff?${new URLSearchParams({ from })}`);
}

/** The desk's decision write: like postDecision, plus the outcome's version (spec §5.8.2 "own saves"). */
export async function postDeskDecision(batchId: string, conceptId: string, d: DecisionRequest): Promise<WriteResult<DeskOutcome>> {
  const payload = { decision: d.decision, note: d.note, reviewerEmail: d.reviewerEmail, reviewerRole: d.reviewerRole,
    extractedAt: d.extractedAt, expectedLastDecisionId: d.expectedLastDecisionId, requestId: d.requestId };
  const r = await write<DeskOutcome>(`/v1/batches/${enc(batchId)}/items/${enc(conceptId)}/decisions`, payload);
  if (!r.ok) return r;
  return { ok: true, data: { review: r.data?.review, displayStatus: r.data?.displayStatus, batchStatus: r.data?.batchStatus,
    version: { extractedAt: r.data?.version?.extractedAt ?? null, lastDecisionId: r.data?.version?.lastDecisionId ?? null },
    replayed: r.data?.replayed === true } };
}

/** Problem reports are every flag but partner requests; partner requests are (other, partner-access) (§5.16, D17). */
const FLAG_FILTERS = {
  reports: { excludeTargetId: "partner-access" },
  partner: { targetType: "other", targetId: "partner-access" },
} as const;

export async function listFlagPage(kind: keyof typeof FLAG_FILTERS, page: number): Promise<FlagPage> {
  const params = new URLSearchParams({ status: "open", ...FLAG_FILTERS[kind], page: String(page), size: "50" });
  const res = await reviewerRead(`/v1/flags?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!data || !Array.isArray(data.items)) throw new Error("API error: no flag list");
  return {
    items: data.items.map((f: FlagItem) => ({ id: f.id, targetType: f.targetType, targetId: f.targetId, message: f.message,
      status: f.status, createdAt: f.createdAt })),
    page: data.page, size: data.size, hasMore: data.hasMore === true,
  };
}
```

Change `FlagRequest` to `export type FlagRequest = { targetType: FlagTarget; targetId: string; message: string; reporterEmail: string; requestId?: string };`, change the body of `listFlags` so it reads the paged shape:

```ts
  const data = (await res.json())?.data?.items;
```

(the rest of `listFlags` is unchanged; Task 20 deletes it), and replace `resolveFlag` with:

```ts
export async function resolveFlag(id: number, resolvedBy: string, requestId?: string): Promise<WriteResult<unknown>> {
  return write<unknown>(`/v1/flags/${encodeURIComponent(String(id))}/resolve`, requestId ? { resolvedBy, requestId } : { resolvedBy });
}
```

P0's `web/tests/api-scope.test.ts` case "listFlags reads open flags with the token and drops emails" mocks the old array body, so it would now fail with "API error: no flag list". In that case replace

```ts
    f.mockResolvedValue(ok([{ id: 3, targetType: "substance", targetId: "BDS-1", message: "Name typo",
      reporterEmail: "u@gmail.com", status: "open", createdAt: "2026-10-12T10:00:00Z", resolvedAt: null, resolvedBy: null }]));
```

with the paged shape `GET /v1/flags` now returns (Task 1):

```ts
    f.mockResolvedValue(ok({ items: [{ id: 3, targetType: "substance", targetId: "BDS-1", message: "Name typo",
      reporterEmail: "u@gmail.com", status: "open", createdAt: "2026-10-12T10:00:00Z", resolvedAt: null, resolvedBy: null }],
      page: 0, size: 50, hasMore: false }));
```

The rest of that case (URL `…/v1/flags?status=open`, token, no `@` in the result) stays as it is.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/review-api.test.ts tests/api.test.ts tests/api-scope.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/lib/review-types.ts web/lib/api.ts web/tests/review-api.test.ts web/tests/api-scope.test.ts
git commit -m "feat(web): review read client, desk decision write and paged flag list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Web — the comparison-table relations (§5.5.2) and the pilot fixture

**Files:**
- Create: `web/lib/relations.ts`, `web/tests/fixtures/pilot.ts`
- Test: `web/tests/relations.test.ts`

**Interfaces:**
- Consumes: `IngredientSummary`, `ReviewItem`, `ReviewStage`, `StageNote` (Task 7).
- Produces:
  - from `@/lib/relations` (pure, client-safe): `type Relation = { kind: "same" | "norm" | "salt" | "added" | "differs"; sub?: string }`; `strengthText(g): string` ("{value} {unit}[ per {perValue} {perUnit}]", "" without a strength); `rawName(g): string`; `hasStrength(src: string, g): boolean`; `nameRelation(g): Relation`; `strengthRelation(g): Relation`; `formRelation(source: string, extracted: string | null): Relation`; `genericRelation(raw: string, ings): Relation`; `xmRelation(xmCode: string, ings): { relation: Relation; match: IngredientSummary | null }`; `NAME_TYPE_LABEL: Record<string, string>` (`icd11` "ICD-11", `rxnorm` "RxNorm", `dgda_content` "DGDA", `ddinter` "DDInter").
  - from `web/tests/fixtures/pilot.ts` (tests only): `PILOT` (the 10 pilot records after the P0 re-run, from Board R's live data), `PILOT_RUN_AT`, `pilotItem(key: string, over?: Partial<ReviewItem>): ReviewItem` (`key` is any part of the concept id; the eye drop chooses `DDInter352`), `pilotRows(): ItemRow[]`.

- [ ] **Step 1: Write the pilot fixture**

Create `web/tests/fixtures/pilot.ts` (the data is Board R's embedded pilot export; the DDInter notes are the post-fix notes of §1.6 item 7, with every `DDInter351` pair removed and the eye drop's stage OK):

```ts
import type {
  IngredientSummary, ItemRow, ReviewItem, ReviewStage, StageNote,
} from "@/lib/review-types";

type Ing = {
  name: string; bdsId: string; raw: string; value: number; unit: string; per: number | null; perUnit: string | null;
  coverage: "full" | "none"; ddi: { major: number; moderate: number; minor: number; unknown: number; total: number };
  disease: number; food: number; names: [string, string][]; codes: string[];
};
type Pilot = {
  conceptId: string; tradeName: string; dosageForm: string; generic: string; company: string; dar: string; extractedAt: string;
  clinical: { bdcId: string; displayName: string; doseForm: string; route: string; signature: string };
  dgda: [string, string][]; ddinter: { status: "ok" | "warn"; note: string }; ingredients: Ing[];
};

export const PILOT_RUN_AT = "2026-10-11T21:27:17.629Z";

export const PILOT: Pilot[] = [
  { conceptId: "071-0098-022--amlodipine-5", tradeName: "Amlodipine-5", dosageForm: "Tablet",
    generic: "Amlodipine 5 mg", company: "Premier Pharmaceuticals Ltd.", dar: "071-0098-022",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000002", displayName: "Amlodipine 5 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000002:5mg/" },
    dgda: [["XM68M5","Amlodipine"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter79; DDInter text not found for DDInter14/DDInter79; DDInter text not found for DDInter1951/DDInter79; DDInter text not found for DDInter79/DDInter83" },
    ingredients: [
      { name: "Amlodipine", bdsId: "BDS-000002", raw: "Amlodipine 5 mg", value: 5, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 21,minor: 33,total: 791,unknown: 299,moderate: 438}, disease: 4, food: 2,
        names: [["Amlodipine","icd11"],["amlodipine","rxnorm"],["Amlodipine","dgda_content"],["Amlodipine","ddinter"]],
        codes: ["ICD11_XM:XM68M5:any:xm:1","RXCUI:17767:any:rxnav-exact:1","ATC:C08CA01:any:rxnav-exact:1","DRUGBANK:DB00381:any:rxnav-exact:1","SNOMEDCT:108537001:any:rxnav-exact:1","SNOMEDCT:386864001:any:rxnav-exact:1","DDINTER:DDInter79:systemic:drugbank:1"] }] },
  { conceptId: "076-0028-006--aspirin", tradeName: "Aspirin", dosageForm: "Tablet",
    generic: "Aspirin 300 mg", company: "Apollo Pharmaceutical Laboratories Ltd.", dar: "076-0028-006",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000004", displayName: "Acetylsalicylic acid 300 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000004:300mg/" },
    dgda: [["XM4G06","Acetylsalicylic acid"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter20; DDInter text not found for DDInter14/DDInter20; DDInter text not found for DDInter1675/DDInter20; DDInter text not found for DDInter20/DDInter393; DDInter text not found for DDInter20/DDInter83" },
    ingredients: [
      { name: "Acetylsalicylic acid", bdsId: "BDS-000004", raw: "Aspirin 300 mg", value: 300, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 53,minor: 45,total: 690,unknown: 346,moderate: 246}, disease: 9, food: 1,
        names: [["Acetylsalicylic acid","icd11"],["aspirin","rxnorm"],["Aspirin","dgda_content"],["Acetylsalicylic acid","ddinter"]],
        codes: ["ICD11_XM:XM4G06:any:xm:1","RXCUI:1191:any:rxnav-exact:1","ATC:A01AD05:any:rxnav-exact:1","ATC:B01AC06:any:rxnav-exact:1","ATC:N02BA01:any:rxnav-exact:1","DRUGBANK:DB00945:any:rxnav-exact:1","SNOMEDCT:387458008:any:rxnav-exact:1","SNOMEDCT:7947003:any:rxnav-exact:1","DDINTER:DDInter20:systemic:drugbank:1"] }] },
  { conceptId: "096-0265-061--simvastatin", tradeName: "Simvastatin", dosageForm: "Tablet",
    generic: "Simvastatin 10 mg", company: "Albion Laboratories Ltd.", dar: "096-0265-061",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000006", displayName: "Simvastatin 10 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000006:10mg/" },
    dgda: [["XM7AU9","Simvastatin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter1675; DDInter text not found for DDInter14/DDInter1675; DDInter text not found for DDInter1675/DDInter20; DDInter text not found for DDInter1675/DDInter83" },
    ingredients: [
      { name: "Simvastatin", bdsId: "BDS-000006", raw: "Simvastatin 10 mg", value: 10, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 59,minor: 10,total: 732,unknown: 422,moderate: 241}, disease: 6, food: 2,
        names: [["Simvastatin","icd11"],["simvastatin","rxnorm"],["Simvastatin","dgda_content"],["Simvastatin","ddinter"]],
        codes: ["ICD11_XM:XM7AU9:any:xm:1","RXCUI:36567:any:rxnav-exact:1","ATC:C10AA01:any:rxnav-exact:1","DRUGBANK:DB00641:any:rxnav-exact:1","SNOMEDCT:387584000:any:rxnav-exact:1","SNOMEDCT:96304005:any:rxnav-exact:1","DDINTER:DDInter1675:systemic:drugbank:1"] }] },
  { conceptId: "127-0163-052--chloramphenicol", tradeName: "Chloramphenicol", dosageForm: "Eye Drops",
    generic: "Chloramphenicol 5 mg/ml", company: "EDCL (Dhaka)", dar: "127-0163-052",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000008", displayName: "Chloramphenicol 5 mg/ml eye drops", doseForm: "Eye Drops", route: "ophthalmic",
      signature: "eye drops|ophthalmic|BDS-000009:5mg/1ml" },
    dgda: [["XM2TE7","Chloramphenicol"]],
    ddinter: { status: "ok", note: "" },
    ingredients: [
      { name: "Chloramphenicol", bdsId: "BDS-000009", raw: "Chloramphenicol 5 mg/ml", value: 5, unit: "mg", per: 1, perUnit: "ml",
        coverage: "full", ddi: {major: 48,minor: 21,total: 654,unknown: 49,moderate: 536}, disease: 6, food: 0,
        names: [["Chloramphenicol","icd11"],["chloramphenicol","rxnorm"],["Chloramphenicol","dgda_content"],["Chloramphenicol","ddinter"],["Chloramphenicol (ophthalmic)","ddinter"],["Chloramphenicol (otic)","ddinter"]],
        codes: ["ICD11_XM:XM2TE7:any:xm:1","RXCUI:2348:any:rxnav-exact:1","ATC:D06AX02:any:rxnav-exact:1","ATC:D10AF03:any:rxnav-exact:1","ATC:G01AA05:any:rxnav-exact:1","ATC:J01BA01:any:rxnav-exact:1","ATC:S01AA01:any:rxnav-exact:1","ATC:S02AA01:any:rxnav-exact:1","ATC:S03AA08:any:rxnav-exact:1","DRUGBANK:DB00446:any:rxnav-exact:1","SNOMEDCT:372777009:any:rxnav-exact:1","SNOMEDCT:57191001:any:rxnav-exact:1","DDINTER:DDInter351:systemic:drugbank:1","DDINTER:DDInter352:ophthalmic:drugbank:1","DDINTER:DDInter353:otic:drugbank:1"] }] },
  { conceptId: "127-0263-018--domperidone", tradeName: "Domperidone", dosageForm: "Tablet",
    generic: "Domperidone 10 mg", company: "EDCL (Dhaka)", dar: "127-0263-018",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000009", displayName: "Domperidone 10 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000010:10mg/" },
    dgda: [["XM3GF5","Domperidone"]],
    ddinter: { status: "warn", note: "No interaction data in DDInter for this substance" },
    ingredients: [
      { name: "Domperidone", bdsId: "BDS-000010", raw: "Domperidone 10 mg", value: 10, unit: "mg", per: null, perUnit: null,
        coverage: "none", ddi: {major: 0,minor: 0,total: 0,unknown: 0,moderate: 0}, disease: 0, food: 0,
        names: [["Domperidone","icd11"],["domperidone","rxnorm"],["Domperidone","dgda_content"]],
        codes: ["ICD11_XM:XM3GF5:any:xm:1","RXCUI:3626:any:rxnav-exact:1","ATC:A03FA03:any:rxnav-exact:1","DRUGBANK:DB01184:any:rxnav-exact:1","SNOMEDCT:32955006:any:rxnav-exact:1","SNOMEDCT:387181004:any:rxnav-exact:1"] }] },
  { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", dosageForm: "Tablet",
    generic: "Warfarin Sodium 5 mg", company: "Gonoshasthaya Pharmaceuticals Ltd.", dar: "185-0138-012",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000003", displayName: "Warfarin 5 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000003:5mg/" },
    dgda: [["XM86W0","Warfarin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1951/DDInter79" },
    ingredients: [
      { name: "Warfarin", bdsId: "BDS-000003", raw: "Warfarin Sodium 5 mg", value: 5, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 138,minor: 71,total: 934,unknown: 298,moderate: 427}, disease: 8, food: 2,
        names: [["Warfarin","icd11"],["warfarin","rxnorm"],["Warfarin","dgda_content"],["Warfarin","ddinter"]],
        codes: ["ICD11_XM:XM86W0:any:xm:1","RXCUI:11289:any:rxnav-exact:1","ATC:B01AA03:any:rxnav-exact:1","DRUGBANK:DB00682:any:rxnav-exact:1","SNOMEDCT:372756006:any:rxnav-exact:1","SNOMEDCT:48603004:any:rxnav-exact:1","DDINTER:DDInter1951:systemic:drugbank:1"] }] },
  { conceptId: "185-0241-015--g-metformin", tradeName: "G-Metformin", dosageForm: "Tablet",
    generic: "Metformin Hydrochloride 500 mg", company: "Gonoshasthaya Pharmaceuticals Ltd.", dar: "185-0241-015",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000010", displayName: "Metformin 500 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000011:500mg/" },
    dgda: [["XM0JN5","Metformin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter14; DDInter text not found for DDInter1164/DDInter1675; DDInter text not found for DDInter1164/DDInter20; DDInter text not found for DDInter1164/DDInter79; DDInter text not found for DDInter1164/DDInter83" },
    ingredients: [
      { name: "Metformin", bdsId: "BDS-000011", raw: "Metformin Hydrochloride 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 20,minor: 29,total: 687,unknown: 310,moderate: 328}, disease: 4, food: 1,
        names: [["Metformin","icd11"],["metformin","rxnorm"],["Metformin","dgda_content"],["Metformin","ddinter"]],
        codes: ["ICD11_XM:XM0JN5:any:xm:1","RXCUI:6809:any:rxnav-exact:1","ATC:A10BA02:any:rxnav-exact:1","DRUGBANK:DB00331:any:rxnav-exact:1","SNOMEDCT:109081006:any:rxnav-exact:1","SNOMEDCT:372567009:any:rxnav-exact:1","DDINTER:DDInter1164:systemic:drugbank:1"] }] },
  { conceptId: "186-0030-006--napa", tradeName: "Napa", dosageForm: "Tablet",
    generic: "Paracetamol 500 mg", company: "Beximco Pharmaceuticals Ltd.", dar: "186-0030-006",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000001:500mg/" },
    dgda: [["XM5DJ7","Acetaminophen"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter14; DDInter text not found for DDInter14/DDInter1675; DDInter text not found for DDInter14/DDInter20; DDInter text not found for DDInter14/DDInter393; DDInter text not found for DDInter14/DDInter79; DDInter text not found for DDInter14/DDInter83" },
    ingredients: [
      { name: "Acetaminophen", bdsId: "BDS-000001", raw: "Paracetamol 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 10,minor: 38,total: 645,unknown: 512,moderate: 85}, disease: 3, food: 1,
        names: [["Acetaminophen","icd11"],["acetaminophen","rxnorm"],["Paracetamol","dgda_content"],["Acetaminophen","ddinter"]],
        codes: ["ICD11_XM:XM5DJ7:any:xm:1","RXCUI:161:any:rxnav-exact:1","ATC:N02BE01:any:rxnav-exact:1","DRUGBANK:DB00316:any:rxnav-exact:1","SNOMEDCT:387517004:any:rxnav-exact:1","SNOMEDCT:90332006:any:rxnav-exact:1","DDINTER:DDInter14:systemic:drugbank:1"] }] },
  { conceptId: "239-0407-023--clarith", tradeName: "Clarith", dosageForm: "Tablet",
    generic: "Clarithromycin 500 mg", company: "Ibn Sina Pharmaceutical Ind. Ltd.", dar: "239-0407-023",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000005", displayName: "Clarithromycin 500 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000005:500mg/" },
    dgda: [["XM1VG4","Clarithromycin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter14/DDInter393; DDInter text not found for DDInter20/DDInter393" },
    ingredients: [
      { name: "Clarithromycin", bdsId: "BDS-000005", raw: "Clarithromycin 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 234,minor: 51,total: 898,unknown: 210,moderate: 403}, disease: 5, food: 1,
        names: [["Clarithromycin","icd11"],["clarithromycin","rxnorm"],["Clarithromycin","dgda_content"],["Clarithromycin","ddinter"]],
        codes: ["ICD11_XM:XM1VG4:any:xm:1","RXCUI:21212:any:rxnav-exact:1","ATC:J01FA09:any:rxnav-exact:1","DRUGBANK:DB01211:any:rxnav-exact:1","SNOMEDCT:387487009:any:rxnav-exact:1","SNOMEDCT:83999008:any:rxnav-exact:1","DDINTER:DDInter393:systemic:drugbank:1"] }] },
  { conceptId: "420-0026-023--amoxycillin-clavulanic-acid", tradeName: "Amoxycillin Clavulanic Acid", dosageForm: "Tablet",
    generic: "Amoxicillin + Clavulanic Acid 500 mg + 125 mg", company: "JR Pharmaceuticals Ltd.", dar: "420-0026-023",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000007", displayName: "Amoxicillin 500 mg + Clavulanic acid 125 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000007:125mg/;BDS-000008:500mg/" },
    dgda: [["XM2K88","Clavulanic acid"],["XM7CM1","Amoxicillin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter83; DDInter text not found for DDInter14/DDInter83; DDInter text not found for DDInter1675/DDInter83; DDInter text not found for DDInter20/DDInter83; DDInter text not found for DDInter79/DDInter83" },
    ingredients: [
      { name: "Clavulanic acid", bdsId: "BDS-000007", raw: "Clavulanic Acid 125 mg", value: 125, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 7,minor: 0,total: 29,unknown: 0,moderate: 22}, disease: 0, food: 0,
        names: [["Clavulanic acid","icd11"],["clavulanate","rxnorm"],["Clavulanic Acid","dgda_content"],["Clavulanic acid","ddinter"]],
        codes: ["ICD11_XM:XM2K88:any:xm:1","RXCUI:48203:any:rxnav-exact:1","DRUGBANK:DB00766:any:rxnav-exact:1","SNOMEDCT:395939008:any:rxnav-exact:1","DDINTER:DDInter394:systemic:drugbank:1"] },
      { name: "Amoxicillin", bdsId: "BDS-000008", raw: "Amoxicillin 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 5,minor: 8,total: 280,unknown: 238,moderate: 29}, disease: 5, food: 0,
        names: [["Amoxicillin","icd11"],["amoxicillin","rxnorm"],["Amoxicillin","dgda_content"],["Amoxicillin","ddinter"]],
        codes: ["ICD11_XM:XM7CM1:any:xm:1","RXCUI:723:any:rxnav-exact:1","ATC:J01CA04:any:rxnav-exact:1","DRUGBANK:DB01060:any:rxnav-exact:1","SNOMEDCT:27658006:any:rxnav-exact:1","SNOMEDCT:372687004:any:rxnav-exact:1","DDINTER:DDInter83:systemic:drugbank:1"] }] },];

/** DDInter's three chloramphenicol entries (§1.5): the eye drop checks DDInter352. */
const CHLORAMPHENICOL_ENTRIES = [
  { ddinterId: "DDInter351", name: "Chloramphenicol", routeScope: "systemic",
    counts: { major: 47, moderate: 421, minor: 21, unknown: 49, total: 538 }, diseaseCount: 6, foodCount: 0 },
  { ddinterId: "DDInter352", name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic",
    counts: { major: 1, moderate: 111, minor: 0, unknown: 0, total: 112 }, diseaseCount: 0, foodCount: 0 },
  { ddinterId: "DDInter353", name: "Chloramphenicol (otic)", routeScope: "otic",
    counts: { major: 0, moderate: 4, minor: 0, unknown: 0, total: 4 }, diseaseCount: 0, foodCount: 0 },
];

function summary(g: Ing, route: string): IngredientSummary {
  const codes = g.codes.map((c) => {
    const [system, code, routeScope, method, confidence] = c.split(":");
    return { system, code, routeScope, method, confidence: Number(confidence) };
  });
  const dd = codes.filter((c) => c.system === "DDINTER");
  const exact = dd.filter((c) => c.routeScope === route);
  const chosen = (exact.length ? exact : dd.filter((c) => c.routeScope === "systemic" || c.routeScope === "any"))
    .map((c) => ({ ddinterId: c.code, name: c.code === "DDInter352" ? "Chloramphenicol (ophthalmic)" : g.name,
      routeScope: c.routeScope, routeAssumed: exact.length === 0 }));
  const entries = g.name === "Chloramphenicol" ? CHLORAMPHENICOL_ENTRIES : dd.map((c) => ({ ddinterId: c.code, name: g.name,
    routeScope: c.routeScope, counts: g.ddi, diseaseCount: g.disease, foodCount: g.food }));
  return {
    bdsId: g.bdsId, name: g.name, raw: g.raw, strengthValue: g.value, strengthUnit: g.unit, perValue: g.per, perUnit: g.perUnit,
    names: g.names.map(([name, type]) => ({ name, type, source: "pilot" })), codes,
    coverage: { coverage: g.coverage, note: "" },
    ddinter: { chosen: g.coverage === "none" ? [] : chosen, entries: g.coverage === "none" ? [] : entries },
  };
}

/** The API's own note classification (§7.3), enough for the pilot notes. */
function notes(status: string, note: string): StageNote[] {
  if (!note) return [];
  const parts = status === "warn" ? note.split("; ") : [note];
  return parts.map((text) => ({
    kind: /^DDInter text not found for /.test(text) ? "text_missing" as const
      : text === "No interaction data in DDInter for this substance" ? "no_data" as const : "other" as const,
    text, ddinterId: null, route: null,
  }));
}

function stages(p: Pilot): ReviewStage[] {
  const missing = p.ddinter.note.split("; ").map((t) => /^DDInter text not found for (DDInter\d+)\/(DDInter\d+)$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null);
  return [
    { stage: "dgda", status: "ok", notes: [], textMissing: [], evidence: {} },
    { stage: "substances", status: "ok", notes: [], textMissing: [], evidence: {} },
    { stage: "clinical", status: "ok", notes: [], textMissing: [], evidence: {} },
    { stage: "ddinter", status: p.ddinter.status, notes: notes(p.ddinter.status, p.ddinter.note),
      textMissing: missing.map((m) => ({ ddinterA: m[1], nameA: m[1], ddinterB: m[2], nameB: m[2], severity: "unknown", inBatch: true })),
      evidence: { text_missing: missing.map((m) => [m[1], m[2]]) } },
  ];
}

export function pilotItem(key: string, over: Partial<ReviewItem> = {}): ReviewItem {
  const i = PILOT.findIndex((p) => p.conceptId.includes(key));
  if (i < 0) throw new Error(`no pilot record matches ${key}`);
  const p = PILOT[i];
  return {
    batchId: "0001-pilot", conceptId: p.conceptId, index: i + 1, total: PILOT.length, displayStatus: "pending", review: "pending",
    version: { extractedAt: p.extractedAt, lastDecisionId: null },
    batch: { runAt: PILOT_RUN_AT, itemCount: PILOT.length, status: "in_review" },
    brand: { conceptId: p.conceptId, darNumber: p.dar, tradeName: p.tradeName, company: p.company, dosageForm: p.dosageForm,
      genericContentRaw: p.generic, qualityFlag: null, parseStatus: "parsed", parseNote: null },
    dgdaIngredients: p.dgda.map(([xmCode, name]) => ({ xmCode, name })),
    clinicalDrug: { ...p.clinical },
    ingredients: p.ingredients.map((g) => summary(g, p.clinical.route)),
    stages: stages(p),
    batchPairs: { totalBatchPairs: 28, pairs: [], notChecked: [] },
    sourceJson: { id: p.conceptId, extras: {} },
    sourceUrl: `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/${encodeURIComponent(p.conceptId)}/`,
    history: [
      { kind: "run", at: PILOT_RUN_AT },
      { kind: "extract", at: p.extractedAt, reason: "run" },
    ],
    reopen: null,
    ...over,
  };
}

/** The list rows of batch 0001-pilot as the items endpoint returns them (all pending, §1.6 item 7 hints). */
export function pilotRows(): ItemRow[] {
  return PILOT.map((p, i) => {
    const pairs = p.ddinter.note ? p.ddinter.note.split("; ").filter((t) => t.startsWith("DDInter text not found for ")).length : 0;
    const noData = p.ingredients.some((g) => g.coverage === "none");
    return {
      index: i + 1, conceptId: p.conceptId, tradeName: p.tradeName, clinicalDisplayName: p.clinical.displayName,
      displayStatus: "pending" as const,
      hint: { failed: 0, warnings: p.ddinter.status === "warn" ? 1 : 0, pairsWithoutText: pairs, noData, notRun: false },
      version: { extractedAt: p.extractedAt, lastDecisionId: null },
    };
  });
}
```

- [ ] **Step 2: Write the failing relations test**

Create `web/tests/relations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NAME_TYPE_LABEL, formRelation, genericRelation, hasStrength, nameRelation, rawName, strengthRelation, strengthText, xmRelation,
} from "@/lib/relations";
import { PILOT, pilotItem } from "./fixtures/pilot";

const all = PILOT.map((p) => pilotItem(p.conceptId));

describe("§5.5.2 relations on the 10 pilot records", () => {
  it("substance names", () => {
    expect(all.flatMap((r) => r.ingredients.map((g) => [r.brand!.tradeName, g.name, nameRelation(g)]))).toEqual([
      ["Amlodipine-5", "Amlodipine", { kind: "same" }],
      ["Aspirin", "Acetylsalicylic acid", { kind: "norm", sub: "Aspirin kept as the DGDA name" }],
      ["Simvastatin", "Simvastatin", { kind: "same" }],
      ["Chloramphenicol", "Chloramphenicol", { kind: "same" }],
      ["Domperidone", "Domperidone", { kind: "same" }],
      ["G Warfarin", "Warfarin", { kind: "salt", sub: "Removed: Sodium" }],
      ["G-Metformin", "Metformin", { kind: "salt", sub: "Removed: Hydrochloride" }],
      ["Napa", "Acetaminophen", { kind: "norm", sub: "Paracetamol kept as the DGDA name" }],
      ["Clarith", "Clarithromycin", { kind: "same" }],
      ["Amoxycillin Clavulanic Acid", "Clavulanic acid", { kind: "same", sub: "Capitalisation only" }],
      ["Amoxycillin Clavulanic Acid", "Amoxicillin", { kind: "same" }],
    ]);
  });

  it("strengths", () => {
    expect(all.flatMap((r) => r.ingredients.map((g) => [strengthText(g), strengthRelation(g)]))).toEqual([
      ["5 mg", { kind: "same" }], ["300 mg", { kind: "same" }], ["10 mg", { kind: "same" }],
      ["5 mg per 1 ml", { kind: "norm", sub: "Written as 5 mg per 1 ml" }],
      ["10 mg", { kind: "same" }], ["5 mg", { kind: "same" }], ["500 mg", { kind: "same" }], ["500 mg", { kind: "same" }],
      ["500 mg", { kind: "same" }], ["125 mg", { kind: "same" }], ["500 mg", { kind: "same" }],
    ]);
  });

  it("generic content: one or both ingredients and strengths found", () => {
    expect(all.map((r) => genericRelation(r.brand!.genericContentRaw, r.ingredients))).toEqual([
      ...Array(9).fill({ kind: "same", sub: "Ingredient and strength found" }),
      { kind: "same", sub: "Both ingredients and strengths found" },
    ]);
  });

  it("dosage forms all match, and every DGDA XM code has its substance", () => {
    expect(all.map((r) => formRelation(r.brand!.dosageForm, r.clinicalDrug!.doseForm))).toEqual(Array(10).fill({ kind: "same" }));
    for (const r of all)
      for (const x of r.dgdaIngredients) expect(xmRelation(x.xmCode, r.ingredients).relation).toEqual({ kind: "same" });
    expect(xmRelation("XM2K88", pilotItem("amoxycillin").ingredients).match!.name).toBe("Clavulanic acid");
  });
});

describe("the rules themselves", () => {
  const g = pilotItem("g-warfarin").ingredients[0];

  it("rawName strips the trailing strength", () => {
    expect(rawName(g)).toBe("Warfarin Sodium");
    expect(rawName({ ...g, raw: "Amoxicillin 500 mg + Clavulanic Acid 125 mg" })).toBe("Amoxicillin");
  });

  it("hasStrength needs the exact number, unit and per, not a longer number", () => {
    expect(hasStrength("Warfarin Sodium 5 mg", g)).toBe(true);
    expect(hasStrength("Warfarin Sodium 15 mg", g)).toBe(false);
    expect(hasStrength("Warfarin Sodium 5 mg/ml", g)).toBe(true);
    expect(hasStrength("Warfarin Sodium 5.5 mg", g)).toBe(false);
    expect(hasStrength("Warfarin Sodium 0.5 mg", g)).toBe(false);
    expect(hasStrength("x 5 MG", g)).toBe(true);
    const drops = pilotItem("chloramphenicol").ingredients[0];
    expect(hasStrength("Chloramphenicol 5 mg/ml", drops)).toBe(true);
    expect(hasStrength("Chloramphenicol 5 mg/10 ml", { ...drops, perValue: 10 })).toBe(true);
    expect(hasStrength("Chloramphenicol 5 mg/ml", { ...drops, perValue: 10 })).toBe(false);
    expect(hasStrength("Chloramphenicol 5 mg/10ml", { ...drops, perValue: 10 })).toBe(false);
  });

  it("differs cases", () => {
    expect(formRelation("Tablet", "Capsule")).toEqual({ kind: "differs" });
    expect(formRelation("Tablet", "tablet")).toEqual({ kind: "same", sub: "Capitalisation only" });
    expect(formRelation("Tablet", null)).toEqual({ kind: "differs" });
    expect(nameRelation({ ...g, raw: "Heparin 5 mg" })).toEqual({ kind: "differs" });
    expect(strengthRelation({ ...g, raw: "Warfarin Sodium 2 mg" })).toEqual({ kind: "differs" });
    expect(strengthRelation({ ...g, strengthValue: null })).toEqual({ kind: "differs" });
    expect(genericRelation("Warfarin 2 mg", [g])).toEqual({ kind: "differs" });
    expect(xmRelation("XM0000", [g])).toEqual({ relation: { kind: "differs", sub: "No substance carries this code" }, match: null });
  });

  it("strength text has no trailing zeros and names the per", () => {
    expect(strengthText({ ...g, strengthValue: 0.5, strengthUnit: "%" })).toBe("0.5 %");
    expect(strengthText({ ...g, strengthValue: null })).toBe("");
    expect(NAME_TYPE_LABEL).toEqual({ icd11: "ICD-11", rxnorm: "RxNorm", dgda_content: "DGDA", ddinter: "DDInter" });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd web && npx vitest run tests/relations.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/relations"`.

- [ ] **Step 4: Write the relations**

Create `web/lib/relations.ts`:

```ts
import type { IngredientSummary } from "./review-types";

/*
 * Spec §5.5.2 relation rules, computed on the server from the API's ReviewItem. Copied from Board R's nameRel, strRel
 * and hasStrength. Pure and client-safe.
 */
export type Relation = { kind: "same" | "norm" | "salt" | "added" | "differs"; sub?: string };
type Strength = Pick<IngredientSummary, "strengthValue" | "strengthUnit" | "perValue" | "perUnit">;
type Named = Pick<IngredientSummary, "raw" | "name" | "names">;

export const NAME_TYPE_LABEL: Record<string, string> = { icd11: "ICD-11", rxnorm: "RxNorm", dgda_content: "DGDA", ddinter: "DDInter" };

const plain = (n: number) => String(n);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "{value} {unit}[ per {perValue} {perUnit}]"; "" when the pipeline parsed no strength. */
export function strengthText(g: Strength): string {
  if (g.strengthValue === null) return "";
  const base = `${plain(g.strengthValue)} ${g.strengthUnit ?? ""}`.trim();
  return g.perValue !== null ? `${base} per ${plain(g.perValue)} ${g.perUnit ?? ""}`.trim() : base;
}

/** The DGDA raw ingredient text with its trailing strength removed. */
export function rawName(g: Pick<IngredientSummary, "raw">): string {
  return g.raw.replace(/\s+\d.*$/, "").trim();
}

/** Board R hasStrength: "{v} {unit}" plus "/{per} {perUnit}" (no "1 " for a per of 1), not inside a longer number. */
export function hasStrength(src: string, g: Strength): boolean {
  if (g.strengthValue === null || !g.strengthUnit) return false;
  let base = `${plain(g.strengthValue)} ${g.strengthUnit}`;
  if (g.perValue !== null) base += "/" + (g.perValue === 1 ? "" : `${plain(g.perValue)} `) + (g.perUnit ?? "");
  return new RegExp(`(^|[^\\d.])${escapeRegExp(base)}(?![\\d])`, "i").test(src);
}

export function nameRelation(g: Named): Relation {
  const r = rawName(g), a = r.toLowerCase(), b = g.name.toLowerCase();
  if (r === g.name) return { kind: "same" };
  if (a === b) return { kind: "same", sub: "Capitalisation only" };
  if (a.startsWith(`${b} `)) return { kind: "salt", sub: `Removed: ${r.slice(g.name.length).trim()}` };
  const dgda = g.names.filter((n) => n.type === "dgda_content").map((n) => n.name.toLowerCase());
  if (dgda.includes(a)) return { kind: "norm", sub: `${r} kept as the DGDA name` };
  return { kind: "differs" };
}

export function strengthRelation(g: Strength & Pick<IngredientSummary, "raw">): Relation {
  if (!hasStrength(g.raw, g)) return { kind: "differs" };
  if (g.perValue !== null) return { kind: "norm", sub: `Written as ${strengthText(g)}` };
  return { kind: "same" };
}

export function formRelation(source: string, extracted: string | null): Relation {
  if (extracted === null) return { kind: "differs" };
  if (source === extracted) return { kind: "same" };
  if (source.toLowerCase() === extracted.toLowerCase()) return { kind: "same", sub: "Capitalisation only" };
  return { kind: "differs" };
}

export function genericRelation(raw: string, ings: (Named & Strength)[]): Relation {
  const found = ings.length > 0
    && ings.every((g) => raw.toLowerCase().includes(rawName(g).toLowerCase()) && hasStrength(raw, g));
  if (!found) return { kind: "differs" };
  return { kind: "same", sub: ings.length > 1 ? "Both ingredients and strengths found" : "Ingredient and strength found" };
}

export function xmRelation(xmCode: string, ings: IngredientSummary[]): { relation: Relation; match: IngredientSummary | null } {
  const match = ings.find((g) => g.codes.some((c) => c.system === "ICD11_XM" && c.code === xmCode)) ?? null;
  return match ? { relation: { kind: "same" }, match } : { relation: { kind: "differs", sub: "No substance carries this code" }, match: null };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd web && npx vitest run tests/relations.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add web/lib/relations.ts web/tests/fixtures/pilot.ts web/tests/relations.test.ts
git commit -m "feat(web): comparison-table relation rules with the live pilot as fixtures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Web — desk copy (Board R strings, the P1B rows of `NEW_COPY`) and the desk-settings cookies

Every string the workspace prints comes from one of three places: the §3.6 constants (P1A), Board R's wording in `lib/review-copy.ts`, and the §1.7 new copy in `NEW_COPY` (this task fills the P1B rows). Templates use `{name}` placeholders; `fill()` substitutes text, `fillNodes()` substitutes nodes (for the mono ids).

**Files:**
- Modify: `web/lib/copy.ts` (the P1B rows of `NEW_COPY`, and `fill`), `web/tests/copy.test.ts` (P1A's NEW_COPY retyping guard: how a short value counts, and three more `LEGACY_EXEMPT` entries), `web/lib/actions-core.ts` (P0 Task 11's `REVIEW_REFUSALS` key built from `DESK_NEW`)
- Create: `web/lib/review-copy.ts`, `web/lib/desk-settings.ts`, `web/lib/desk-settings-actions.ts`
- Test: `web/tests/review-copy.test.tsx`, `web/tests/desk-settings.test.ts`, `web/tests/copy.test.ts`

P1A's `copy.test.ts` case "no source file retypes a NEW_COPY string" fails when any file under `app/`, `components/` or `lib/` other than `lib/copy.ts` contains a `NEW_COPY` value. So every `NEW_COPY` string this plan adds is imported (`DESK_NEW.…`, `NEW_COPY[NEW_COPY_ROWS.…]`), never retyped, and a Board R string that contains one is built from it (`DESK.issueOpen`, `DESK.workspaceLabel`, and the API refusal key in Task 12's `desk-core.ts`). The P1B rows also hold one-word labels ("On", "Off", "Settings", "Confirm", "Cancel", "Resolve", "Try again"), which a plain substring test finds inside identifiers such as `submitResolve`, `DESK_NEW.deskSettings` or `logOpenOnRender`, and short labels such as "Interaction check" (17 characters) or "Next page", which a substring test finds inside different strings P0 and P1A wrote (`"Interaction check failed"` in `lib/api.ts`, `>Interaction checker</a>` in `components/Header.tsx`); Step 1 narrows the guard for values under 20 characters to whole string literals and JSX text, which is still every way a label can be retyped.

Three files P0 and P1A wrote do retype P1B values, and the guard names them from this task on, so this task handles each one explicitly:
- `app/page.tsx` (P0 Task 10) keeps the JSX text `>Next page</a>`, which P1B never touches; P2 rewrites the home page. It joins P1A's `LEGACY_EXEMPT`, and P2 empties the list.
- `app/flags/page.tsx` (`>Resolve</button>`) and `app/batches/[id]/page.tsx` (P0 Task 11's `REVIEW_OUTCOME` texts `checks` and `issue_open`, which contain `approvalRefused.promiseLead`, `promiseBody` and `hint`) are deleted in Task 20. They join `LEGACY_EXEMPT` here, and Task 20 removes them from it once the pages are gone.
- `lib/actions-core.ts` holds P0 Task 11's `REVIEW_REFUSALS` key "An issue is open on this record. It returns to review after the fix and re-run.", which contains `approvalRefused.promiseBody`. Step 4 rebuilds that key from `DESK_NEW` (as Task 12's `desk-core.ts` does); Task 20 deletes it with `submitReview`.

**Interfaces:**
- Consumes: `NEW_COPY`, `NEW_COPY_ROWS`, `NOT_REVIEWED`, `PROMISE_PHARMACIST`, `PROMISE_ENGINEER` (P1A Task 3); `Segmented` (P1A Task 4).
- Produces:
  - from `@/lib/copy`: `fill(template: string, vars: Record<string, string | number>): string`; `NEW_COPY` rows filled: `decisionUnconfirmed`, `sessionExpired`, `undoWhileSaving`, `approvalRefused`, `drawerOpen`, `deskSettings`, `committing`, `deskMisc`, `deskLoad`, `history`, `shortcutsMenuItem`, `reviewLists`, `routeAware`, `routeAssumed`, `notRun` (keys listed in Step 3), and the typed views `DESK_NEW` (one object per row, `as const` keys).
  - from `@/lib/review-copy` (client-safe): `DESK` (Board R strings), `plural(n, one, many)`, `fillNodes(template, values: Record<string, ReactNode>): ReactNode[]`, `toastSub(role, n)`, `savedText(role, name)`, `ROLE_LABEL_DESK`, `STAGE_NAME`, `KEY_ROW`, `SHEET_ROWS(n)`, `historyText(entry, batchId)`, `promiseFor(...)` is in Task 11 (`bar-state.ts`).
  - from `@/lib/desk-settings` (client-safe): `UNDO_COOKIE = "intellidrugs-undo"`, `KEYS_COOKIE = "intellidrugs-keys"`, `UNDO_SECONDS = [8, 20, 60] as const`, `type UndoSeconds`, `type KeysSetting = "on" | "off"`, `parseUndo(v: unknown): UndoSeconds`, `parseKeys(v: unknown): KeysSetting`, `deskCookieOptions(production?)`, `deskCookieString(name, value, secure): string`, `DESK_SETTINGS_EVENT = "intellidrugs-desk-settings"`.
  - server action `setDeskSettingAction(formData: FormData): Promise<void>` from `@/lib/desk-settings-actions` (fields `undo` or `keys`).

- [ ] **Step 1: Write the failing tests**

In `web/tests/copy.test.ts` (P1A Task 3), add below the `text` helper:

```ts
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Whether source code retypes a NEW_COPY value. A value of 20 or more characters counts wherever it appears. A shorter
 * one ("On", "Resolve", "Try again", "Interaction check") counts only as a whole string literal or as JSX text, so
 * identifiers such as submitResolve or DESK_NEW.deskSettings, and longer strings such as "Interaction check failed" or
 * >Interaction checker<, never match, while `"Resolve"` and `>Resolve<` still do.
 */
function retypes(src: string, value: string): boolean {
  if (value.length >= 20) return src.includes(value);
  const v = escapeRe(value);
  return new RegExp(`(["'\`])${v}\\1|>\\s*${v}\\s*<`).test(src);
}
```

replace P1A's line `const LEGACY_EXEMPT = ["app/check/page.tsx"];` (and its comment) with

```ts
/**
 * Legacy pages that still retype copy. P2 rewrites app/check/page.tsx and app/page.tsx (the home page's `>Next page<`)
 * and empties this list; P1B Task 20 deletes app/flags/page.tsx (`>Resolve<`) and app/batches/[id]/page.tsx (P0's
 * REVIEW_OUTCOME texts) and removes them from it.
 */
const LEGACY_EXEMPT = ["app/check/page.tsx", "app/page.tsx", "app/flags/page.tsx", "app/batches/[id]/page.tsx"];
```

then replace the body line `const hits = scanned().flatMap((f) => strings.filter((s) => text(f).includes(s)).map((s) => `${f}: ${s}`));` of the case "no source file retypes a NEW_COPY string (§11.1: page modules import them)" with

```ts
    const hits = scanned().flatMap((f) => strings.filter((s) => retypes(text(f), s)).map((s) => `${f}: ${s}`));
```

and append inside `describe("no paraphrase or retyping of the safety sentences", …)`:

```ts
  it("the NEW_COPY guard sees literals and JSX text, not identifiers", () => {
    expect(retypes("export async function submitResolve() {}", "Resolve")).toBe(false);
    expect(retypes("const s = DESK_NEW.deskSettings; logOpenOnRender();", "Settings")).toBe(false);
    expect(retypes("const s = DESK_NEW.deskSettings; logOpenOnRender();", "On")).toBe(false);
    expect(retypes('<button type="submit">Resolve</button>', "Resolve")).toBe(true);
    expect(retypes("label: 'Try again',", "Try again")).toBe(true);
    expect(retypes("const t = `On`;", "On")).toBe(true);
    expect(retypes('error: "Interaction check failed"', "Interaction check")).toBe(false);
    expect(retypes('<a href="/check">Interaction checker</a>', "Interaction check")).toBe(false);
    expect(retypes('interactionCheck: "Interaction check",', "Interaction check")).toBe(true);
    expect(retypes("issueOpen: `An issue is open. It returns to review after the fix and re-run.`",
      "It returns to review after the fix and re-run.")).toBe(true);
  });
```


Create `web/tests/desk-settings.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStore = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { PROMISE_PHARMACIST } from "@/lib/copy";
import { KEYS_COOKIE, UNDO_COOKIE, UNDO_SECONDS, deskCookieOptions, deskCookieString, parseKeys, parseUndo } from "@/lib/desk-settings";
import { setDeskSettingAction } from "@/lib/desk-settings-actions";
import { SHEET_ROWS, toastSub } from "@/lib/review-copy";

afterEach(() => { cookieStore.set.mockReset(); vi.unstubAllEnvs(); });

describe("desk settings cookies (§5.8.1, §5.14)", () => {
  it("names", () => {
    expect(UNDO_COOKIE).toBe("intellidrugs-undo");
    expect(KEYS_COOKIE).toBe("intellidrugs-keys");
    expect(UNDO_SECONDS).toEqual([8, 20, 60]);
  });

  it("the undo window is 8, 20 or 60; anything else reads as 8", () => {
    expect(parseUndo("8")).toBe(8);
    expect(parseUndo("20")).toBe(20);
    expect(parseUndo("60")).toBe(60);
    for (const v of ["", "10", "8.0", " 20", "60s", "-8", undefined, null, 20, ["60"]]) expect(parseUndo(v)).toBe(8);
  });

  it("single-key shortcuts are on or off; anything else reads as on", () => {
    expect(parseKeys("on")).toBe("on");
    expect(parseKeys("off")).toBe("off");
    for (const v of ["", "OFF", "false", "0", undefined, null]) expect(parseKeys(v)).toBe("on");
  });

  it("cookie attributes: a year, Lax, Path=/, readable by script, Secure only in production", () => {
    expect(deskCookieOptions(false)).toEqual({ maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
    expect(deskCookieOptions(true).secure).toBe(true);
    expect(deskCookieString("intellidrugs-undo", "20", true)).toBe("intellidrugs-undo=20; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
    expect(deskCookieString("intellidrugs-keys", "off", false)).toBe("intellidrugs-keys=off; Max-Age=31536000; Path=/; SameSite=Lax");
  });

  it("the promise, the toast and the sheet use the reviewer's window", () => {
    expect(UNDO_SECONDS.map((n) => PROMISE_PHARMACIST.body(n))).toEqual([
      '"Looks correct" publishes this record after an 8-second undo window.',
      '"Looks correct" publishes this record after an 20-second undo window.',
      '"Looks correct" publishes this record after an 60-second undo window.',
    ]);
    expect(UNDO_SECONDS.map((n) => toastSub("pharmacist", n))).toEqual(
      ["Publishes in 8 seconds.", "Publishes in 20 seconds.", "Publishes in 60 seconds."]);
    expect(UNDO_SECONDS.map((n) => toastSub("engineer", n))).toEqual([
      "Your check saves in 8 seconds. It does not publish.", "Your check saves in 20 seconds. It does not publish.",
      "Your check saves in 60 seconds. It does not publish."]);
    expect(SHEET_ROWS(60)[0]).toEqual(["A", "Looks correct, then an 60-second undo window"]);
  });
});

describe("setDeskSettingAction (no-JavaScript form POST)", () => {
  it("stores the submitted undo window or shortcuts setting, and nothing it cannot parse", async () => {
    const undo = new FormData(); undo.set("undo", "60");
    await setDeskSettingAction(undo);
    expect(cookieStore.set).toHaveBeenCalledWith("intellidrugs-undo", "60",
      { maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
    const keys = new FormData(); keys.set("keys", "off");
    await setDeskSettingAction(keys);
    expect(cookieStore.set).toHaveBeenLastCalledWith("intellidrugs-keys", "off", expect.objectContaining({ path: "/" }));
    const bogus = new FormData(); bogus.set("undo", "5");
    await setDeskSettingAction(bogus);
    expect(cookieStore.set).toHaveBeenLastCalledWith("intellidrugs-undo", "8", expect.anything());
  });
});
```

Create `web/tests/review-copy.test.tsx` (`.tsx`: it renders JSX through `fillNodes`):

```tsx
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DESK_NEW, NEW_COPY, NEW_COPY_ROWS, NOT_REVIEWED, fill } from "@/lib/copy";
import { DESK, fillNodes, historyText, plural, savedText } from "@/lib/review-copy";

const WEB = fileURLToPath(new URL("..", import.meta.url));

describe("P1B rows of the §1.7 table", () => {
  it("pin the new copy verbatim", () => {
    expect(NEW_COPY[NEW_COPY_ROWS.decisionUnconfirmed]).toEqual({
      bannerTitle: "Couldn't confirm your decision.",
      bannerBody: "We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice. Decision: Looks correct on {name}.",
      promiseLead: "Your decision may not have been saved.",
      promiseBody: "Use Try again above to find out.",
      rowHint: "Decision not confirmed",
      hint: "Your last decision on this record is not confirmed yet. Use Try again.",
      announce: "Couldn't confirm your decision. We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.sessionExpired]).toEqual({
      block: "Your sign-in expired. Your decision on {name} was not saved.",
      signInAgain: "Sign in again",
      hint: "Your sign-in expired. Sign in again to keep reviewing.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.undoWhileSaving]).toEqual({ hint: "Too late to undo: {name} is saving. Use Report issue to withdraw it." });
    expect(NEW_COPY[NEW_COPY_ROWS.approvalRefused]).toEqual({
      promiseLead: "A check failed on this record.",
      promiseBody: "It returns to review after the fix and re-run.",
      hint: "A check failed on this record. It returns to review after the fix and re-run.",
      commitHint: "A check failed on this record. It returns to review after the fix and re-run. Nothing was saved.",
      removedHint: "This record was removed from the batch file. Nothing was saved.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.drawerOpen]).toEqual({ hint: "Close the evidence first (Esc)." });
    expect(NEW_COPY[NEW_COPY_ROWS.deskSettings]).toEqual({
      heading: "Settings", undoLabel: "Undo window", undo8: "8 seconds", undo20: "20 seconds", undo60: "60 seconds",
      keysLabel: "Single-key shortcuts", on: "On", off: "Off", workspacePlain: "IntelliDrugs review workspace.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.committing]).toEqual({
      lead: "Marked correct.", pharmacistBody: "Publishing now.", engineerBody: "Saving your check now.", toastSaving: "saving.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.deskMisc]).toEqual({
      backToList: "Back to list",
      noScript: "Reviewing needs JavaScript for the bot check. You can still read this record.",
      skipRecord: "Skip to record",
      skipBar: "Skip to decision bar",
      staleOtherReviewer: "Another reviewer decided on {name} after you opened it. Decisions are paused and nothing was saved. Any note you were writing is kept.",
      reportFailedTitle: "Couldn't send your report.",
      reportFailedBody: "Nothing was saved. Check your connection and try again.",
      confirmTitle: "Confirm your decision on {name}.",
      confirmBody: "Your browser didn't load the undo window, so nothing is saved until you confirm.",
      confirmPharmacist: "Confirming publishes this record.",
      confirmEngineer: "Confirming records your check. It does not publish.",
      confirm: "Confirm",
      cancel: "Cancel",
      rawDgdaRecord: "Raw DGDA record",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.deskLoad]).toEqual({
      errorTitle: "Couldn't load batch {id}.", errorBody: "Nothing was changed. Check your connection and try again.",
      notFound: "No batch with the id {id}.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.history]).toEqual({
      run: "Batch {id} run started",
      sharedChange: "Shared substance data for this record changed",
      engineerChecked: "Engineer checked. Not published.",
      engineerCheckedMine: "Engineer checked (you). Not published.",
      issuePharmacist: "Issue reported by a pharmacist. Note:",
      issueEngineer: "Issue reported by an engineer. Note:",
      noLongerCounts: "No longer counts: the record was re-run after it.",
      backSharedChange: `Shared substance data for this record changed after a pharmacist approved it. Readers see “${NOT_REVIEWED}” until a pharmacist approves it again.`,
    });
    expect(NEW_COPY[NEW_COPY_ROWS.shortcutsMenuItem]).toEqual({ item: "Keyboard shortcuts and settings" });
    expect(NEW_COPY[NEW_COPY_ROWS.reviewLists]).toEqual({
      waitingOne: "Batch {id} has 1 record waiting for a pharmacist.",
      waitingMany: "Batch {id} has {w} records waiting for a pharmacist.",
      noBatches: "No batches are in review.",
      flagsLink: "Problem reports and partner requests",
      reportsHeading: "Problem reports",
      partnerHeading: "Partner access requests",
      reported: "Reported {date}",
      resolve: "Resolve",
      resolving: "Resolving",
      reportResolved: "Report resolved.",
      requestResolved: "Request resolved.",
      noReports: "No open problem reports.",
      noRequests: "No open partner requests.",
      loadErrorTitle: "Couldn't load the reports.",
      loadErrorBody: "Nothing was changed. Check your connection and try again.",
      tryAgain: "Try again",
      nextPage: "Next page",
      previousPage: "Previous page",
      noScriptResolve: "Resolving needs JavaScript for the bot check.",
      interactionCheck: "Interaction check",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.routeAware]).toEqual({
      dataFound: "Interaction data found for this product's route ({route}): {ids}",
      dataFoundNoRoute: "Interaction data found: {ids}, route assumed",
      routeAssumedSuffix: ", route assumed",
      allEntries: "All DDInter entries for {name}: {ids}, {total} drug pairs.",
      noRouteEntry: "No DDInter entry for this product's route ({route}). Its pairs are not checked.",
      noRouteEntryNoRoute: "No DDInter entry fits this product, which has no route on record. Its pairs are not checked.",
      checkedAgainst: "{substance} is checked against {id} {ddinterName} ({route}).",
      assumedStatement: "Route assumed: this product's route is {route} and DDInter has no {route} entry for {substance}, so the systemic entry {id} is used.",
      mappingChecked: "Checked against {id} ({route})",
      notCheckedNoRoute: "Not checked: {brand}'s route is {route} and DDInter has no entry for {substance} on that route.",
      notCheckedNoRouteNoRoute: "Not checked: {brand} has no route on record and DDInter has no systemic entry for {substance}.",
      notCheckedUnmapped: "Not checked: {ingredient} in {brand} has no substance mapping yet.",
      notCheckedSameProduct: "Not checked: {a} + {b} are ingredients of this product.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.routeAssumed]).toEqual({
      noRouteStatement: "Route assumed: this product has no route on record, so the systemic entry {id} is used.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.notRun]).toEqual({
      rowHint: "DDInter not run yet",
      notCheckedNotRun: "Not checked: DDInter mapping has not run for {substance} in {brand}.",
    });
    expect(DESK_NEW.deskMisc.noScript).toBe(NEW_COPY[NEW_COPY_ROWS.deskMisc].noScript);
  });

  it("fill substitutes every placeholder and leaves unknown ones alone", () => {
    expect(fill(DESK_NEW.sessionExpired.block, { name: "Napa" })).toBe("Your sign-in expired. Your decision on Napa was not saved.");
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("fillNodes keeps nodes in place, for mono ids", () => {
    const html = renderToStaticMarkup(<p>{fillNodes(DESK_NEW.routeAware.checkedAgainst, {
      substance: "Chloramphenicol", id: <span className="mono">DDInter352</span>, ddinterName: "Chloramphenicol", route: "ophthalmic" })}</p>);
    expect(html).toBe('<p>Chloramphenicol is checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic).</p>');
  });

  it("Board R strings that carry a count", () => {
    expect(plural(1, "pair", "pairs")).toBe("pair");
    expect(plural(2, "pair", "pairs")).toBe("pairs");
    expect(fill(DESK.showAll, { n: 10 })).toBe("Show all 10 records");
    expect(savedText("pharmacist", "Napa")).toBe("Saved. Napa is approved by a pharmacist and published.");
    expect(savedText("engineer", "Napa")).toBe("Saved. Your check on Napa is recorded. It does not publish.");
  });

  it("history entries read as §5.6.5 says, with (you) and the no-longer-counts suffix", () => {
    const at = "2026-10-12T09:00:00Z";
    expect(historyText({ kind: "run", at }, "0001-pilot")).toBe("Batch 0001-pilot run started");
    expect(historyText({ kind: "extract", at, reason: "run" }, "b")).toBe("Pipeline extracted this record");
    expect(historyText({ kind: "extract", at, reason: "rerun" }, "b")).toBe("Pipeline re-ran this record");
    expect(historyText({ kind: "extract", at, reason: "shared_change" }, "b")).toBe("Shared substance data for this record changed");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: true, mine: false }, "b"))
      .toBe("Approved by a pharmacist. Published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: true, mine: true }, "b"))
      .toBe("Approved by a pharmacist (you). Published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "engineer", counts: false, mine: false }, "b"))
      .toBe("Engineer checked. Not published. No longer counts: the record was re-run after it.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "engineer", counts: true, mine: true }, "b"))
      .toBe("Engineer checked (you). Not published.");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "pharmacist", counts: true, mine: false }, "b"))
      .toBe("Issue reported by a pharmacist. Note:");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "engineer", counts: true, mine: false }, "b"))
      .toBe("Issue reported by an engineer. Note:");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "engineer", counts: true, mine: true }, "b"))
      .toBe("Issue reported (you). Note:");
  });
});

// Review modules import new copy instead of retyping it (§11.1 "page modules import those strings").
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}
const REVIEW_DIRS = ["app/review", "components/review"];
const P1B_ROWS = ["decisionUnconfirmed", "sessionExpired", "undoWhileSaving", "approvalRefused", "drawerOpen", "deskSettings",
  "committing", "deskMisc", "deskLoad", "history", "shortcutsMenuItem", "reviewLists", "routeAware", "routeAssumed", "notRun"] as const;

describe("review modules never retype new copy", () => {
  it("no literal fragment of a P1B row appears in app/review or components/review", () => {
    const fragments = P1B_ROWS.flatMap((row) => Object.values(NEW_COPY[NEW_COPY_ROWS[row]]))
      .map((v) => v.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0].trim())
      .filter((f) => f.length >= 16);
    const files = REVIEW_DIRS.flatMap((d) => { try { return [...sources(join(WEB, d))]; } catch { return []; } });
    const hits = files.flatMap((f) => {
      // Comments may quote the copy they describe (as P1A's copy.test allows): only code counts.
      const text = readFileSync(join(WEB, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      return fragments.filter((frag) => text.includes(frag)).map((frag) => `${f}: ${frag}`);
    });
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/desk-settings.test.ts tests/review-copy.test.tsx`
Expected: FAIL — `@/lib/desk-settings` and `@/lib/review-copy` do not resolve; `DESK_NEW` and `fill` are not exported from `@/lib/copy`.

- [ ] **Step 3: Fill the P1B rows of `NEW_COPY` and add `fill`**

In `web/lib/copy.ts`, replace the entries of `NEW_COPY` for these rows (each was `{}`):

```ts
  [NEW_COPY_ROWS.decisionUnconfirmed]: {
    bannerTitle: "Couldn't confirm your decision.",
    bannerBody: "We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice. Decision: Looks correct on {name}.",
    promiseLead: "Your decision may not have been saved.",
    promiseBody: "Use Try again above to find out.",
    rowHint: "Decision not confirmed",
    hint: "Your last decision on this record is not confirmed yet. Use Try again.",
    announce: "Couldn't confirm your decision. We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice.",
  },
  [NEW_COPY_ROWS.sessionExpired]: {
    block: "Your sign-in expired. Your decision on {name} was not saved.",
    signInAgain: "Sign in again",
    hint: "Your sign-in expired. Sign in again to keep reviewing.",
  },
  [NEW_COPY_ROWS.undoWhileSaving]: { hint: "Too late to undo: {name} is saving. Use Report issue to withdraw it." },
  [NEW_COPY_ROWS.approvalRefused]: {
    promiseLead: "A check failed on this record.",
    promiseBody: "It returns to review after the fix and re-run.",
    hint: "A check failed on this record. It returns to review after the fix and re-run.",
    commitHint: "A check failed on this record. It returns to review after the fix and re-run. Nothing was saved.",
    removedHint: "This record was removed from the batch file. Nothing was saved.",
  },
  [NEW_COPY_ROWS.drawerOpen]: { hint: "Close the evidence first (Esc)." },
  [NEW_COPY_ROWS.deskSettings]: {
    heading: "Settings", undoLabel: "Undo window", undo8: "8 seconds", undo20: "20 seconds", undo60: "60 seconds",
    keysLabel: "Single-key shortcuts", on: "On", off: "Off", workspacePlain: "IntelliDrugs review workspace.",
  },
  [NEW_COPY_ROWS.committing]: {
    lead: "Marked correct.", pharmacistBody: "Publishing now.", engineerBody: "Saving your check now.", toastSaving: "saving.",
  },
  [NEW_COPY_ROWS.deskMisc]: {
    backToList: "Back to list",
    noScript: "Reviewing needs JavaScript for the bot check. You can still read this record.",
    skipRecord: "Skip to record",
    skipBar: "Skip to decision bar",
    staleOtherReviewer: "Another reviewer decided on {name} after you opened it. Decisions are paused and nothing was saved. Any note you were writing is kept.",
    reportFailedTitle: "Couldn't send your report.",
    reportFailedBody: "Nothing was saved. Check your connection and try again.",
    confirmTitle: "Confirm your decision on {name}.",
    confirmBody: "Your browser didn't load the undo window, so nothing is saved until you confirm.",
    confirmPharmacist: "Confirming publishes this record.",
    confirmEngineer: "Confirming records your check. It does not publish.",
    confirm: "Confirm",
    cancel: "Cancel",
    rawDgdaRecord: "Raw DGDA record",
  },
  [NEW_COPY_ROWS.deskLoad]: {
    errorTitle: "Couldn't load batch {id}.",
    errorBody: "Nothing was changed. Check your connection and try again.",
    notFound: "No batch with the id {id}.",
  },
  [NEW_COPY_ROWS.history]: {
    run: "Batch {id} run started",
    sharedChange: "Shared substance data for this record changed",
    engineerChecked: "Engineer checked. Not published.",
    engineerCheckedMine: "Engineer checked (you). Not published.",
    issuePharmacist: "Issue reported by a pharmacist. Note:",
    issueEngineer: "Issue reported by an engineer. Note:",
    noLongerCounts: "No longer counts: the record was re-run after it.",
    backSharedChange: `Shared substance data for this record changed after a pharmacist approved it. Readers see “${NOT_REVIEWED}” until a pharmacist approves it again.`,
  },
  [NEW_COPY_ROWS.shortcutsMenuItem]: { item: "Keyboard shortcuts and settings" },
  [NEW_COPY_ROWS.reviewLists]: {
    waitingOne: "Batch {id} has 1 record waiting for a pharmacist.",
    waitingMany: "Batch {id} has {w} records waiting for a pharmacist.",
    noBatches: "No batches are in review.",
    flagsLink: "Problem reports and partner requests",
    reportsHeading: "Problem reports",
    partnerHeading: "Partner access requests",
    reported: "Reported {date}",
    resolve: "Resolve",
    resolving: "Resolving",
    reportResolved: "Report resolved.",
    requestResolved: "Request resolved.",
    noReports: "No open problem reports.",
    noRequests: "No open partner requests.",
    loadErrorTitle: "Couldn't load the reports.",
    loadErrorBody: "Nothing was changed. Check your connection and try again.",
    tryAgain: "Try again",
    nextPage: "Next page",
    previousPage: "Previous page",
    noScriptResolve: "Resolving needs JavaScript for the bot check.",
    interactionCheck: "Interaction check",
  },
  [NEW_COPY_ROWS.routeAware]: {
    dataFound: "Interaction data found for this product's route ({route}): {ids}",
    dataFoundNoRoute: "Interaction data found: {ids}, route assumed",
    routeAssumedSuffix: ", route assumed",
    allEntries: "All DDInter entries for {name}: {ids}, {total} drug pairs.",
    noRouteEntry: "No DDInter entry for this product's route ({route}). Its pairs are not checked.",
    noRouteEntryNoRoute: "No DDInter entry fits this product, which has no route on record. Its pairs are not checked.",
    checkedAgainst: "{substance} is checked against {id} {ddinterName} ({route}).",
    assumedStatement: "Route assumed: this product's route is {route} and DDInter has no {route} entry for {substance}, so the systemic entry {id} is used.",
    mappingChecked: "Checked against {id} ({route})",
    notCheckedNoRoute: "Not checked: {brand}'s route is {route} and DDInter has no entry for {substance} on that route.",
    notCheckedNoRouteNoRoute: "Not checked: {brand} has no route on record and DDInter has no systemic entry for {substance}.",
    notCheckedUnmapped: "Not checked: {ingredient} in {brand} has no substance mapping yet.",
    notCheckedSameProduct: "Not checked: {a} + {b} are ingredients of this product.",
  },
  [NEW_COPY_ROWS.routeAssumed]: {
    noRouteStatement: "Route assumed: this product has no route on record, so the systemic entry {id} is used.",
  },
  [NEW_COPY_ROWS.notRun]: {
    rowHint: "DDInter not run yet",
    notCheckedNotRun: "Not checked: DDInter mapping has not run for {substance} in {brand}.",
  },
```

(P2 adds its own keys to the `routeAware`, `routeAssumed` and `notRun` records; the keys above are the desk's.)

Append to `web/lib/copy.ts` (the Board R "never treated as low risk" sentence lives here, because P1A's paraphrase guard allows "low risk" only in `lib/copy.ts`):

```ts
/** Board R, the closing line of the no-text pairs block when an unclassified pair is present (§5.6.2). */
export const UNCLASSIFIED_NOT_LOW_RISK = "A pair whose severity is not classified by DDInter is never treated as low risk.";

/** Substitutes `{key}` placeholders; a placeholder with no value stays as it is. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Typed views of the P1B rows, so review modules never index NEW_COPY by row text. */
export const DESK_NEW = {
  decisionUnconfirmed: NEW_COPY[NEW_COPY_ROWS.decisionUnconfirmed] as Record<
    "bannerTitle" | "bannerBody" | "promiseLead" | "promiseBody" | "rowHint" | "hint" | "announce", string>,
  sessionExpired: NEW_COPY[NEW_COPY_ROWS.sessionExpired] as Record<"block" | "signInAgain" | "hint", string>,
  undoWhileSaving: NEW_COPY[NEW_COPY_ROWS.undoWhileSaving] as Record<"hint", string>,
  approvalRefused: NEW_COPY[NEW_COPY_ROWS.approvalRefused] as Record<"promiseLead" | "promiseBody" | "hint" | "commitHint" | "removedHint", string>,
  drawerOpen: NEW_COPY[NEW_COPY_ROWS.drawerOpen] as Record<"hint", string>,
  deskSettings: NEW_COPY[NEW_COPY_ROWS.deskSettings] as Record<
    "heading" | "undoLabel" | "undo8" | "undo20" | "undo60" | "keysLabel" | "on" | "off" | "workspacePlain", string>,
  committing: NEW_COPY[NEW_COPY_ROWS.committing] as Record<"lead" | "pharmacistBody" | "engineerBody" | "toastSaving", string>,
  deskMisc: NEW_COPY[NEW_COPY_ROWS.deskMisc] as Record<"backToList" | "noScript" | "skipRecord" | "skipBar" | "staleOtherReviewer"
    | "reportFailedTitle" | "reportFailedBody" | "confirmTitle" | "confirmBody" | "confirmPharmacist" | "confirmEngineer" | "confirm"
    | "cancel" | "rawDgdaRecord", string>,
  deskLoad: NEW_COPY[NEW_COPY_ROWS.deskLoad] as Record<"errorTitle" | "errorBody" | "notFound", string>,
  history: NEW_COPY[NEW_COPY_ROWS.history] as Record<"run" | "sharedChange" | "engineerChecked" | "engineerCheckedMine"
    | "issuePharmacist" | "issueEngineer" | "noLongerCounts" | "backSharedChange", string>,
  shortcutsMenuItem: NEW_COPY[NEW_COPY_ROWS.shortcutsMenuItem] as Record<"item", string>,
  reviewLists: NEW_COPY[NEW_COPY_ROWS.reviewLists] as Record<"waitingOne" | "waitingMany" | "noBatches" | "flagsLink" | "reportsHeading"
    | "partnerHeading" | "reported" | "resolve" | "resolving" | "reportResolved" | "requestResolved" | "noReports" | "noRequests"
    | "loadErrorTitle" | "loadErrorBody" | "tryAgain" | "nextPage" | "previousPage" | "noScriptResolve" | "interactionCheck", string>,
  routeAware: NEW_COPY[NEW_COPY_ROWS.routeAware] as Record<"dataFound" | "dataFoundNoRoute" | "routeAssumedSuffix" | "allEntries"
    | "noRouteEntry" | "noRouteEntryNoRoute" | "checkedAgainst" | "assumedStatement" | "mappingChecked" | "notCheckedNoRoute"
    | "notCheckedNoRouteNoRoute" | "notCheckedUnmapped" | "notCheckedSameProduct", string>,
  routeAssumed: NEW_COPY[NEW_COPY_ROWS.routeAssumed] as Record<"noRouteStatement", string>,
  notRun: NEW_COPY[NEW_COPY_ROWS.notRun] as Record<"rowHint" | "notCheckedNotRun", string>,
} as const;
```

- [ ] **Step 4: Write the Board R strings, the cookies and the action**

In `web/lib/actions-core.ts` (P0 Task 11's version), add `import { DESK_NEW } from "./copy";` to the imports and replace the `REVIEW_REFUSALS` entry

```ts
  "An issue is open on this record. It returns to review after the fix and re-run.": "issue_open",
```

with

```ts
  // The API's message ends in a NEW_COPY sentence, so it is built from it (copy.test fails on a retyped NEW_COPY string).
  [`An issue is open on this record. ${DESK_NEW.approvalRefused.promiseBody}`]: "issue_open",
```

The key's text is unchanged, so P0's `review-actions.test.ts` cases for `issue_open` still pass. Task 20 deletes `REVIEW_REFUSALS` with `submitReview`.

Create `web/lib/review-copy.ts`:

```ts
import { Fragment, createElement, type ReactNode } from "react";
import { APPROVED, DESK_NEW, UNCLASSIFIED_NOT_LOW_RISK, fill } from "./copy";
import type { HistoryEntry, ReviewerRole, StageKey } from "./review-types";

/*
 * Board R wording for the review workspace (docs/artifacts/2026-10-12-intellidrugs-reviewer.html). Client-safe.
 * New copy (§1.7) is in NEW_COPY / DESK_NEW, never here.
 */
export const DESK = {
  batchPrefix: "Batch",
  approvedOf: "{a} of {n} approved",
  recordOf: "Record {k} of {n}",
  batchApproved: "Batch approved",
  batchesHeading: "Batches",
  showHeading: "Show",
  sidebarLabel: "Batches and filters",
  cardTitleRest: "approved by a pharmacist",
  cardMeter: "{a} approved, {i} with an issue, {needs} need review",
  cardApproved: "Approved",
  cardIssue: "Issue reported",
  cardNeeds: "Needs review",
  cardStatus: "Batch status:",
  inReview: "In review",
  approvedStatus: "Approved",
  approvedWhen: "Approved when all {n} records are approved by a pharmacist.",
  run: "Run {date}",
  filters: { all: "All records", needs: "Needs review", warn: "Warnings", issue: "Issue reported", approved: "Approved", nodata: "No DDInter data" },
  empty: { all: "", needs: "No records need review.", warn: "No records have a check warning.", issue: "No records with an issue reported.",
    approved: "No records are approved yet.", nodata: "No records without DDInter data." },
  noMatch: "No records match “{q}”.",
  showAll: "Show all {n} records",
  listCount: "{n} records, by DAR number",
  listCountFiltered: "{v} of {n} records",
  loadingCount: "Loading",
  searchLabel: "Filter records by name, substance or DAR number",
  searchPlaceholder: "Filter by name, substance or DAR",
  listLabel: "Records in {id}",
  // Strings that contain a NEW_COPY value are built from it: P1A's copy.test fails on a retyped NEW_COPY string (§11.1).
  workspaceLabel: `${DESK_NEW.deskSettings.workspacePlain} Shortcuts work while focus is inside. Press question mark for the list.`,
  hintNotSaved: "Decision not saved",
  hintChanged: "Changed since you opened it",
  hintNoData: "No DDInter data",
  hintAllOk: "All checks OK",
  crumb: "{id}, record {k} of {n}",
  visApproved: "Published. Readers can see this record.",
  visHidden: "Hidden from readers until a pharmacist approves it.",
  evidence: "Evidence",
  dgdaSource: "DGDA source",
  previous: "Previous",
  next: "Next",
  cmpTitle: "DGDA source against the extraction",
  cmpSub: "Each relation compares the two values on its row. Fields copied from the register have no verdict.",
  cmpCaption: "{name}: DGDA register compared with the pipeline extraction",
  cmpField: "Field", cmpSource: "DGDA source", cmpRelation: "Relation", cmpExtracted: "Extracted by the pipeline",
  copied: "Copied from the register",
  notInRegister: "Not in the register",
  parserPart: "Parser's part of the DGDA text",
  parsed: "{k} {ingredients} parsed",
  noMatchingSubstance: "No matching substance",
  names: "Names: {names}",
  codesFor: "{k} codes for {name}",
  dataFound: "Interaction data found",
  clinicalSub: ", route {route}, dose form {form}",
  checksTitle: "Automated checks",
  checksRun: "Pipeline run {date}",
  textMissing: "DDInter text not found for {n} {pairs} with other medicines in this batch.",
  hidePair: "Hide the pair", showPair: "Show the pair", hidePairs: "Hide the {n} pairs", showPairs: "Show the {n} pairs",
  interactionsTitle: "Interactions",
  interactionsSub: "From DDInter 2.0, by substance",
  noDataLine: "Drug, disease and food interactions: no data in DDInter 2.0.",
  notCheckedWithBatch: "Not checked, {k} pairs with this batch:",
  severityGroup: "Drug pairs in DDInter 2.0 by severity",
  totals: "{total} drug pairs in total. {d} drug and disease {dWord}, {f} drug and food {fWord}.",
  batchTitle: "With the other medicines in this batch",
  batchFound: "{p} {pairs} found in DDInter 2.0.",
  batchNotChecked: " {nc} {pairs} not checked.",
  batchChips: "Batch pairs by severity",
  noneInvolve: "None of the {n} batch pairs from DDInter 2.0 involve {name}.",
  pairWith: "With {partners}. ",
  record: "{name} (record {k})",
  managementTruncated: "Management, truncated.",
  managementFull: "Management, in full.",
  interactionTruncated: "Interaction description, truncated.",
  interactionFull: "Interaction description, in full.",
  noManagementForPair: " DDInter has no management text for this pair.",
  noTextHeading: "{k} {pairs} with no text in DDInter 2.0",
  noTextWith: "with {records}",
  noTextClosing: "{actions}DDInter 2.0 has no interaction or management text for {this}.",
  noTextUnknown: ` ${UNCLASSIFIED_NOT_LOW_RISK}`,
  actionIn: "Action in DDInter: {actions}. ",
  notCheckedLead: "Not checked.",
  historyTitle: "History",
  historySub: "Oldest first",
  approvedHistory: "Approved by a pharmacist. Published.",
  approvedHistoryMine: "Approved by a pharmacist (you). Published.",
  issueMine: "Issue reported (you). Note:",
  extracted: "Pipeline extracted this record",
  reran: "Pipeline re-ran this record",
  drawerSub: "{name}, record {k} of {n}",
  close: "Close",
  rawBrandRow: "Raw brand row",
  rawBrandNote: "The DGDA register fields with the pipeline's parse fields, exactly as stored.",
  dgdaCodes: "DGDA ingredient codes",
  pipelineNotes: "Pipeline notes",
  noNote: "No note",
  pipeline: "Pipeline",
  conceptId: "Concept id",
  signature: "Clinical signature",
  extractedAt: "Extracted at",
  batchRun: "Batch run",
  batchRunSub: "{id}, {n} items",
  evidenceShown: "Evidence shown for {name}. The record behind it is paused until you close it.",
  staleBodyRerun: "The pipeline re-ran {name} after you opened it. Decisions are paused and nothing was saved. Any note you were writing is kept.",
  seeChanges: "See what changed", hideChanges: "Hide changes", reload: "Reload record",
  diffCaption: "Cells that changed in the re-run", diffBefore: "You were reviewing", diffNow: "Now",
  diffFooter: "Cells that are not listed did not change.",
  reloaded: "Record reloaded. Decisions are available again.",
  backRerun: "This record was re-run after a pharmacist approved it. Readers see “{notReviewed}” until a pharmacist approves it again.",
  netTitle: "Couldn't save your decision.",
  netBody: "Nothing was published. Check your connection and try again. Decision: Looks correct on {name}.",
  netAnnounce: "Couldn't save your decision. Nothing was published. Check your connection and try again.",
  tryAgain: DESK_NEW.reviewLists.tryAgain, saving: "Saving",
  noAuthTitle: "Your account can't review this batch.",
  noAuthBody: "Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account. You can still read this record.",
  noAuthPageBody: "Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account.",
  botError: "We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.",
  retryCheck: "Retry check", checking: "Checking",
  reportIssue: "Report issue", looksCorrect: "Looks correct",
  noteLabel: "What's wrong with this record? An engineer reads this note.",
  notePlaceholder: "For example: strength should read Warfarin Sodium 5 mg",
  noteHelp: "5 to 1000 characters.",
  noteError: "Add at least 5 characters so the engineer knows what to fix.",
  noteCount: "{len} / 1000",
  cancel: DESK_NEW.deskMisc.cancel, sendReport: "Send report", sending: "Sending",
  reportPaused: "Sending is paused until you reload the record. Your note is kept.",
  reported: "Issue reported for {name}. An engineer will see your note.",
  promiseLoading: "Loading batch {id}.", promiseLoadingBody: "Decisions open when the record loads.",
  promiseComplete: "Batch {id} is approved.", promiseCompleteBody: "Open any record to read it.",
  promiseNotSaved: "Your decision was not saved.", promiseNotSavedBody: "Use Try again above.",
  promiseMarked: DESK_NEW.committing.lead,
  promiseMarkedPharmacist: "Publishes when the undo window closes. Press U to undo.",
  promiseMarkedEngineer: "Your check saves when the undo window closes. Press U to undo.",
  promiseApproved: "Approved by a pharmacist.", promiseApprovedBody: "This record is public.",
  promiseIssue: "An issue is open on this record.", promiseIssueBody: DESK_NEW.approvalRefused.promiseBody,
  promiseChecked: "Your check is recorded.", promiseCheckedBody: "A pharmacist still needs to approve.",
  toastMarked: "marked correct.",
  undo: "Undo",
  announceMarked: "{name} marked correct. {sub} Press U to undo.",
  undone: "Undone. {name} was not saved.",
  nothingToUndo: "Nothing to undo.",
  paused: "Decisions are paused. Reload the record first.",
  otherWindow: "{name} is still in its undo window. Press U to undo it, or wait until it saves.",
  thisWindow: "This record is already in its undo window. Press U to undo.",
  alreadyApproved: "This record is already approved by a pharmacist.",
  issueOpen: `An issue is open on this record. ${DESK_NEW.approvalRefused.promiseBody}`,
  alreadyChecked: "Your check is already recorded for this record.",
  reportOpen: "Send or cancel the report first.",
  notSavedHint: "Your last decision on this record was not saved. Use Try again.",
  botFirst: "Retry the bot check first. Your earlier decision is kept.",
  completeHint: "Every record is approved. Open a record to read it.",
  enterBlocked: "Enter does not approve. Press A, or Space on this button.",
  advanceGuard: "Record changed to {name}. Press A again to approve it.",
  botFailedAnnounce: "Bot check failed. Your decision is kept. Retry the check to continue.",
  botPassedAnnounce: "Bot check passed.",
  allApproved: "Every record in batch {id} is approved.",
  opened: "Opened {name}, record {k} of {n}.",
  noneLeft: "No other record needs your review.",
  lastInView: "This is the last record in this view.",
  firstInView: "This is the first record in this view.",
  emptyView: "No records in this view. Show all {n} records to move.",
  noAuthAnnounce: "Your account can't review this batch. Your decision on {name} was not saved.",
  doneTitle: "Batch {id} approved. {n} records are now public.",
  doneBody: "Each record was approved by a pharmacist. If the pipeline re-runs a record, it goes back in review and leaves public view until a pharmacist approves it again.",
  openRecord1: "Open record 1",
  loadingStatus: "Loading batch {id}",
  loaded: "Batch {id} loaded.",
  sheetTitle: "Keyboard shortcuts",
  sheetNote: "Shortcuts work while focus is in the workspace. They pause while you type in a field, and ignore Ctrl, Cmd and Alt combinations.",
  reducedMotion: "Saves in {n} seconds",
  notAuthWarnTitle: "This Google account isn't on the reviewer list.",
  notAuthWarnBody: "You're signed in as {email}. Reviewer tools need the account your invite was sent to. You can still search and check interactions.",
  useAnother: "Use another Google account",
  searchMedicines: "Search medicines",
  openDesk: "Open the review desk",
  reviewDesk: "Review desk",
} as const;

export const ROLE_LABEL_DESK: Record<ReviewerRole, string> = { pharmacist: "Pharmacist", engineer: "Engineer" };
export const STAGE_NAME: Record<StageKey, string> = { dgda: "DGDA load", substances: "Substances", clinical: "Clinical drug", ddinter: "DDInter" };

/** The key row under the decision bar (Board R), as [keys, words] pairs. */
export const KEY_ROW: [string[], string][] = [
  [["J", "K"], "next, previous"], [["A"], "looks correct"], [["U"], "undo"], [["R"], "report"], [["E"], "evidence"],
  [["S"], "DGDA source"], [["?"], "all keys"],
];

/** The shortcuts sheet rows (Board R); the first uses the reviewer's undo window. */
export const SHEET_ROWS = (n: number): [string, string][] => [
  ["A", `Looks correct, then an ${n}-second undo window`], ["U", "Undo during the window"], ["R", "Report an issue"],
  ["J K", "Next and previous record"], ["E", "Evidence: raw DGDA row and pipeline notes"], ["S", "Open the DGDA source"],
  ["?", "This sheet"], ["Esc", "Close the sheet, the evidence or the note"], ["SEND", "Send the report, inside the note field"],
  ["Enter", "Never approves"],
];

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const toastSub = (role: ReviewerRole, n: number) =>
  role === "pharmacist" ? `Publishes in ${n} seconds.` : `Your check saves in ${n} seconds. It does not publish.`;

export const savedText = (role: ReviewerRole, name: string) =>
  role === "pharmacist" ? `Saved. ${name} is approved by a pharmacist and published.` : `Saved. Your check on ${name} is recorded. It does not publish.`;

/** Substitutes placeholders with nodes (mono ids), keeping the text around them. */
export function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).filter((p) => p !== "").map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return createElement(Fragment, { key: i }, m && m[1] in values ? values[m[1]] : part);
  });
}

/** One history line (§5.6.5). The note itself is rendered separately, in .raw. */
export function historyText(e: HistoryEntry, batchId: string): string {
  const h = DESK_NEW.history;
  let text: string;
  if (e.kind === "run") return fill(h.run, { id: batchId });
  if (e.kind === "extract") return e.reason === "shared_change" ? h.sharedChange : e.reason === "rerun" ? DESK.reran : DESK.extracted;
  if (e.decision === "ok") {
    if (e.role === "pharmacist") text = e.mine ? DESK.approvedHistoryMine : DESK.approvedHistory;
    else text = e.mine ? h.engineerCheckedMine : h.engineerChecked;
  } else {
    text = e.mine ? DESK.issueMine : e.role === "pharmacist" ? h.issuePharmacist : h.issueEngineer;
  }
  return e.counts === false ? `${text} ${h.noLongerCounts}` : text;
}

/** The approved pill's wording, for the "done" view (rendered through ReviewStatus elsewhere). */
export const APPROVED_TEXT = APPROVED;
```

Create `web/lib/desk-settings.ts`:

```ts
/** Desk settings (§5.8.1, §5.14), stored in cookies so the server can render the promise. Client-safe. */
export const UNDO_COOKIE = "intellidrugs-undo";
export const KEYS_COOKIE = "intellidrugs-keys";
export const UNDO_SECONDS = [8, 20, 60] as const;
export type UndoSeconds = (typeof UNDO_SECONDS)[number];
export type KeysSetting = "on" | "off";
export const DESK_SETTINGS_EVENT = "intellidrugs-desk-settings";
const MAX_AGE = 31_536_000;

/** "8", "20" or "60"; any other value reads as 8 (the default window, COMMIT_MS = 8000). */
export function parseUndo(v: unknown): UndoSeconds {
  return v === "20" ? 20 : v === "60" ? 60 : 8;
}

/** "on" or "off"; any other value reads as on. */
export function parseKeys(v: unknown): KeysSetting {
  return v === "off" ? "off" : "on";
}

export function deskCookieOptions(production = process.env.NODE_ENV === "production") {
  return { maxAge: MAX_AGE, sameSite: "lax" as const, path: "/", secure: production, httpOnly: false };
}

export function deskCookieString(name: string, value: string, secure: boolean): string {
  return `${name}=${value}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}
```

Create `web/lib/desk-settings-actions.ts`:

```ts
"use server";
import { cookies } from "next/headers";
import { KEYS_COOKIE, UNDO_COOKIE, deskCookieOptions, parseKeys, parseUndo } from "./desk-settings";

/** The settings forms' action (§5.14): without JavaScript the form posts here and the desk re-renders with the new value. */
export async function setDeskSettingAction(formData: FormData): Promise<void> {
  const store = await cookies();
  if (formData.has("undo")) store.set(UNDO_COOKIE, String(parseUndo(formData.get("undo"))), deskCookieOptions());
  if (formData.has("keys")) store.set(KEYS_COOKIE, parseKeys(formData.get("keys")), deskCookieOptions());
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/desk-settings.test.ts tests/review-copy.test.tsx tests/copy.test.ts tests/review-actions.test.ts && npm test`
Expected: PASS (P1A's `copy.test.ts` still passes: the rows are unchanged, only their records gained keys; no new string retypes a §3.6 safety sentence or a `NEW_COPY` value: `lib/review-copy.ts` takes `tryAgain`, `cancel`, `promiseMarked` and `promiseIssueBody` from `DESK_NEW` and builds `workspaceLabel` and `issueOpen` from it; `lib/actions-core.ts` builds its `REVIEW_REFUSALS` key from `DESK_NEW`; `lib/api.ts` and `components/Header.tsx` pass because "Interaction check" is under 20 characters and appears there only inside longer strings; the four `LEGACY_EXEMPT` files are not scanned). If the NEW_COPY case names any other file, replace the literal it names with the `DESK_NEW` reference. The only exemptions allowed are the four named `LEGACY_EXEMPT` entries above; never add another file to that list or weaken the guard further.

- [ ] **Step 6: Commit**

```bash
git add web/lib/copy.ts web/lib/review-copy.ts web/lib/desk-settings.ts web/lib/desk-settings-actions.ts web/lib/actions-core.ts \
  web/tests/desk-settings.test.ts web/tests/review-copy.test.tsx web/tests/copy.test.ts
git commit -m "feat(web): desk copy, the P1B new-copy rows and the undo and shortcut settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Desk logic — the commit-delayed approval as a pure state machine (§5.8.2, §5.10, §5.11)

**Files:**
- Create: `web/components/review/desk/commit-machine.ts`
- Test: `web/tests/commit-machine.test.ts`

**Interfaces:**
- Consumes: `DESK`, `toastSub`, `savedText`, `fill` (Task 9 — `fill` from `@/lib/copy`), `DESK_NEW`, `STALE_TITLE` (P1A), `Version`, `DeskOutcome`, `ReviewerRole` (Task 7).
- Produces (all from `@/components/review/desk/commit-machine`, pure, no React):
  - `type Op = { conceptId; name; role: ReviewerRole; decision: "ok" | "issue"; note: string; viewedVersion: Version; requestId: string }`;
  - `type Commit` = `idle` | `awaitingToken{op, since}` | `armed{op, deadline}` | `committing{op}` | `botHold{hold: "approve" | "commit", op}` | `netErr{op, saved: "no" | "unknown"}`; `type Report` = `idle` | `sending{op}` | `botHold{op}` | `netErr{op, saved}`; `type Auth = "ok" | "forbidden" | "signedOut"`; `type MachineState = { commit; report; auth; undoMs }`; `initialMachine(undoSeconds: number): MachineState`;
  - `type DecideCode` (the server action's codes), `type Outcome`, `toOutcome(r: DecideResultLike | "network" | "timeout"): Outcome`;
  - `type Event` (`PRESS_A`, `TOKEN`, `WIDGET_ERROR`, `TOKEN_TIMEOUT`, `PRESS_U`, `STALE`, `FORBIDDEN`, `UNAUTHENTICATED`, `PAGE_UNLOAD`, `DEADLINE`, `SEND_REPORT`, `RESULT`, `RETRY_OK`, `RETRY_FAIL`, `TRY_AGAIN`, `SET_UNDO`), `type Effect` (`send`, `announce`, `hint`, `saved`, `stale`, `refresh`);
  - `step(s: MachineState, e: Event): { state: MachineState; effects: Effect[] }`;
  - helpers `TOKEN_MAX_AGE_MS = 270_000`, `TOKEN_WAIT_MS = 10_000`, `tokenPlan(heldAt: number | null, now: number): "use" | "refresh"`, `toastView(s: MachineState): { mode: "running" | "saving"; op: Op } | null`, `unconfirmedOn(s, conceptId): boolean`, `blocksUnload(s): boolean`, `windowOn(s): Op | null`, `staleReason(viewed: Version, current: Version, unconfirmed: boolean): "rerun" | "other" | null`, `type Viewed = Record<string, Version>`, `applySaved(viewed: Viewed, effect): Viewed`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/commit-machine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  TOKEN_MAX_AGE_MS, applySaved, blocksUnload, initialMachine, staleReason, step, toOutcome, toastView, tokenPlan, unconfirmedOn,
  type Effect, type Event, type MachineState, type Op,
} from "@/components/review/desk/commit-machine";
import { parseUndo } from "@/lib/desk-settings";

const V1 = { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: null };
const op = (over: Partial<Op> = {}): Op => ({ conceptId: "186-0030-006--napa", name: "Napa", role: "pharmacist", decision: "ok",
  note: "", viewedVersion: V1, requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22", ...over });
const OUT = { review: "ok", displayStatus: "approved" as const, batchStatus: "in_review",
  version: { extractedAt: V1.extractedAt, lastDecisionId: 41 }, replayed: false };

function run(s: MachineState, ...events: Event[]): { state: MachineState; effects: Effect[] } {
  let state = s;
  const effects: Effect[] = [];
  for (const e of events) {
    const r = step(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}
const texts = (effects: Effect[], type: "announce" | "hint") =>
  effects.filter((e): e is Extract<Effect, { type: typeof type }> => e.type === type).map((e) => e.text);
const sends = (effects: Effect[]) => effects.filter((e) => e.type === "send");

describe("the undo window (§5.8.1)", () => {
  it("is a deadline on the monotonic clock: 8, 20 or 60 s, and 8 for a bad cookie", () => {
    for (const [cookie, ms] of [["8", 8000], ["20", 20000], ["60", 60000], ["bogus", 8000]] as const) {
      const { state } = run(initialMachine(parseUndo(cookie)), { type: "PRESS_A", op: op(), token: "held", now: 1000 });
      expect(state.commit).toEqual({ kind: "armed", op: op(), deadline: 1000 + ms });
    }
  });

  it("an early DEADLINE does nothing; only now >= deadline commits (a wall-clock jump cannot shorten it)", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 1000 }).state;
    expect(run(armed, { type: "DEADLINE", now: 8999 }).state.commit.kind).toBe("armed");
    const r = run(armed, { type: "DEADLINE", now: 9000 });
    expect(r.state.commit).toEqual({ kind: "committing", op: op() });
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "commit", op: op() }]);
  });

  it("announces once on open, with the role's sub, and never per second", () => {
    const p = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 });
    expect(texts(p.effects, "announce")).toEqual(["Napa marked correct. Publishes in 8 seconds. Press U to undo."]);
    const e = run(initialMachine(20), { type: "PRESS_A", op: op({ role: "engineer" }), token: "held", now: 0 });
    expect(texts(e.effects, "announce")).toEqual(["Napa marked correct. Your check saves in 20 seconds. It does not publish. Press U to undo."]);
  });

  it("U undoes: idle, announced, nothing sent", () => {
    const r = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "PRESS_U" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(texts(r.effects, "announce")).toContain("Undone. Napa was not saved.");
    expect(sends(r.effects)).toEqual([]);
  });

  it("U with no window says so", () => {
    expect(texts(run(initialMachine(8), { type: "PRESS_U" }).effects, "hint")).toEqual(["Nothing to undo."]);
  });

  it("a second A while armed changes nothing (the desk shows the other-window hint)", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    const r = run(armed, { type: "PRESS_A", op: op({ conceptId: "x", name: "Aspirin" }), token: "held", now: 10 });
    expect(r.state).toEqual(armed);
  });

  it("U while committing keeps committing and says it is too late; the toast drops Undo on DEADLINE", () => {
    const committing = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 }).state;
    expect(toastView(committing)).toEqual({ mode: "saving", op: op() });
    const r = run(committing, { type: "PRESS_U" });
    expect(r.state.commit.kind).toBe("committing");
    expect(texts(r.effects, "hint")).toEqual(["Too late to undo: Napa is saving. Use Report issue to withdraw it."]);
    expect(toastView(run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state))
      .toEqual({ mode: "running", op: op() });
  });

  it("stale cancels the window on that record, and says the decision was not saved", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    const r = run(armed, { type: "STALE", conceptId: op().conceptId, reason: "rerun" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(r.effects).toContainEqual({ type: "stale", conceptId: op().conceptId, reason: "rerun", cancelled: true });
    expect(run(armed, { type: "STALE", conceptId: "other", reason: "other" }).state.commit.kind).toBe("armed");
  });

  it("unload discards: nothing sent, nothing announced", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    expect(blocksUnload(armed)).toBe(true);
    const r = run(armed, { type: "PAGE_UNLOAD" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(r.effects).toEqual([]);
    expect(blocksUnload(r.state)).toBe(false);
  });
});

describe("Turnstile (§5.8.5)", () => {
  it("A while the widget is re-executing waits for a token, then arms a full window from that moment", () => {
    const waiting = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "pending", now: 100 }).state;
    expect(waiting.commit).toEqual({ kind: "awaitingToken", op: op(), since: 100 });
    expect(run(waiting, { type: "TOKEN", now: 2100 }).state.commit).toEqual({ kind: "armed", op: op(), deadline: 10100 });
  });

  it("an error-callback or 10 s without a token is a bot hold, never a window", () => {
    const waiting = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "pending", now: 0 }).state;
    for (const e of [{ type: "WIDGET_ERROR" }, { type: "TOKEN_TIMEOUT", now: 10_000 }] as Event[]) {
      const r = run(waiting, e);
      expect(r.state.commit).toEqual({ kind: "botHold", hold: "approve", op: op() });
      expect(texts(r.effects, "announce")).toEqual(["Bot check failed. Your decision is kept. Retry the check to continue."]);
    }
    expect(run(initialMachine(8), { type: "PRESS_A", op: op(), token: "failed", now: 0 }).state.commit.kind).toBe("botHold");
  });

  it("a bot hold before arming: retry arms a new window", () => {
    const hold = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "failed", now: 0 }).state;
    const r = run(hold, { type: "RETRY_OK", now: 5000 });
    expect(r.state.commit).toEqual({ kind: "armed", op: op(), deadline: 13000 });
    expect(texts(r.effects, "announce")[0]).toBe("Bot check passed.");
  });

  it("captcha at commit: retry sends the same decision without a new window", () => {
    const hold = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 },
      { type: "RESULT", channel: "commit", result: toOutcome({ ok: false, code: "captcha" }) }).state;
    expect(hold.commit).toEqual({ kind: "botHold", hold: "commit", op: op() });
    const r = run(hold, { type: "RETRY_OK", now: 9000 });
    expect(r.state.commit).toEqual({ kind: "committing", op: op() });
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "commit", op: op() }]);
    expect(run(hold, { type: "RETRY_FAIL" }).state.commit).toEqual(hold.commit);
  });

  it("tokenPlan: a token older than 270 s is refreshed, never reused (thresholds; the desk path is pinned in desk-flow.test.tsx)", () => {
    expect(TOKEN_MAX_AGE_MS).toBe(270_000);
    expect(tokenPlan(null, 1000)).toBe("refresh");
    expect(tokenPlan(0, 269_999)).toBe("use");
    expect(tokenPlan(0, 270_000)).toBe("refresh");
    expect(tokenPlan(0, 10 * 60_000)).toBe("refresh");
  });
});

describe("commit outcomes (§5.8.2, §5.11)", () => {
  const committing = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 }).state;
  const result = (r: Parameters<typeof toOutcome>[0]) => run(committing, { type: "RESULT", channel: "commit", result: toOutcome(r) });

  it("OK and a replayed OK are the same save", () => {
    for (const replayed of [false, true]) {
      const r = result({ ok: true, outcome: { ...OUT, replayed } });
      expect(r.state.commit).toEqual({ kind: "idle" });
      expect(r.effects).toContainEqual({ type: "saved", channel: "commit", op: op(), outcome: { ...OUT, replayed } });
    }
  });

  it("429 or rate_limited is not saved; network, 5xx and timeout are unconfirmed", () => {
    expect(result({ ok: false, code: "rate_limited" }).state.commit).toEqual({ kind: "netErr", op: op(), saved: "no" });
    expect(texts(result({ ok: false, code: "rate_limited" }).effects, "announce"))
      .toEqual(["Couldn't save your decision. Nothing was published. Check your connection and try again."]);
    for (const r of ["network", "timeout", { ok: false as const, code: "failed" as const }] as const) {
      const x = result(r);
      expect(x.state.commit).toEqual({ kind: "netErr", op: op(), saved: "unknown" });
      expect(texts(x.effects, "announce")).toEqual(["Couldn't confirm your decision. We couldn't confirm your decision was saved. "
        + "Try again to find out; it will not be saved twice."]);
    }
  });

  it("Try again resends the same requestId and viewedVersion, with no new window", () => {
    const err = result("network").state;
    const r = run(err, { type: "TRY_AGAIN", channel: "commit" });
    expect(r.state.commit).toEqual({ kind: "committing", op: op() });
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "commit", op: op() }]);
  });

  it("while unconfirmed, a changed lastDecisionId is not another reviewer; a changed stamp still is a re-run", () => {
    const err = result("network").state;
    expect(unconfirmedOn(err, op().conceptId)).toBe(true);
    // In flight is the same: the server may already have saved it (D45, own saves never make the record stale).
    expect(unconfirmedOn(committing, op().conceptId)).toBe(true);
    expect(unconfirmedOn(committing, "other")).toBe(false);
    const sendingReport = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state;
    expect(unconfirmedOn(sendingReport, op().conceptId)).toBe(true);
    expect(unconfirmedOn(result({ ok: false, code: "rate_limited" }).state, op().conceptId)).toBe(false);   // "not saved" is proven
    expect(staleReason(V1, { ...V1, lastDecisionId: 41 }, true)).toBeNull();
    expect(staleReason(V1, { ...V1, lastDecisionId: 41 }, false)).toBe("other");
    expect(staleReason(V1, { extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: 41 }, true)).toBe("rerun");
    expect(staleReason(V1, V1, false)).toBeNull();
  });

  it("forbidden and unauthenticated are different states", () => {
    const f = result({ ok: false, code: "forbidden" });
    expect(f.state.auth).toBe("forbidden");
    expect(texts(f.effects, "announce")).toEqual(["Your account can't review this batch. Your decision on Napa was not saved."]);
    const u = result({ ok: false, code: "unauthenticated" });
    expect(u.state.auth).toBe("signedOut");
    expect(texts(u.effects, "announce")).toEqual(["Your sign-in expired. Your decision on Napa was not saved."]);
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    expect(run(armed, { type: "UNAUTHENTICATED" }).state).toMatchObject({ commit: { kind: "idle" }, auth: "signedOut" });
    expect(run(armed, { type: "FORBIDDEN" }).state).toMatchObject({ commit: { kind: "idle" }, auth: "forbidden" });
  });

  it("409s map by field: stale copy for versions, a hint and a refresh for the rest", () => {
    const rerun = result({ ok: false, code: "stale_rerun" });
    expect(rerun.effects).toContainEqual({ type: "stale", conceptId: op().conceptId, reason: "rerun", cancelled: true });
    expect(result({ ok: false, code: "stale_decision" }).effects)
      .toContainEqual({ type: "stale", conceptId: op().conceptId, reason: "other", cancelled: true });
    for (const [code, hint] of [
      ["issue_open", "An issue is open on this record. It returns to review after the fix and re-run."],
      ["already_approved", "This record is already approved by a pharmacist."],
      ["already_checked", "Your check is already recorded for this record."],
      ["removed", "This record was removed from the batch file. Nothing was saved."],
      ["stage_failed", "A check failed on this record. It returns to review after the fix and re-run. Nothing was saved."],
    ] as const) {
      const r = result({ ok: false, code });
      expect(r.state.commit).toEqual({ kind: "idle" });
      expect(texts(r.effects, "hint")).toEqual([hint]);
      expect(r.effects).toContainEqual({ type: "refresh" });
    }
  });
});

describe("own saves never make the record stale (§5.8.2, D45)", () => {
  it("after A, on the open record or another one, the saved version becomes the viewed version", () => {
    const viewed = { [op().conceptId]: V1, other: V1 };
    const saved = result();
    function result() {
      return run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 },
        { type: "RESULT", channel: "commit", result: toOutcome({ ok: true, outcome: OUT }) });
    }
    const after = saved.effects.reduce(applySaved, viewed);
    expect(after[op().conceptId]).toEqual(OUT.version);
    expect(staleReason(after[op().conceptId], OUT.version, false)).toBeNull();
    expect(after.other).toBe(V1);
  });

  it("after R (a report), too", () => {
    const viewed = { [op().conceptId]: V1 };
    const reportOp = op({ decision: "issue", note: "strength should read 5 mg" });
    const r = run(initialMachine(8), { type: "SEND_REPORT", op: reportOp, token: "held" },
      { type: "RESULT", channel: "report", result: toOutcome({ ok: true, outcome: { ...OUT, displayStatus: "issue" } }) });
    expect(r.effects.filter((e) => e.type === "send")).toEqual([{ type: "send", channel: "report", op: reportOp }]);
    expect(r.effects.reduce(applySaved, viewed)[op().conceptId]).toEqual(OUT.version);
    expect(texts(r.effects, "announce")).toEqual(["Issue reported for Napa. An engineer will see your note."]);
  });

  it("the refresh race: a re-stamp that lands with other rows' refresh makes the open record stale, and the decision keeps the viewed version", () => {
    const viewed = { [op().conceptId]: V1 };
    const restamped = { extractedAt: "2026-10-12T10:00:00Z", lastDecisionId: null };
    expect(staleReason(viewed[op().conceptId], restamped, false)).toBe("rerun");
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op({ viewedVersion: viewed[op().conceptId] }), token: "held", now: 0 });
    expect(armed.state.commit.kind === "armed" && armed.state.commit.op.viewedVersion).toEqual(V1);
  });
});

describe("reports (§5.10)", () => {
  it("a report cancels an open window on the same record first; only a widget error is a bot hold", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    const r = run(armed, { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(r.state.report.kind).toBe("sending");
    // §5.8.5: right after a reset the widget is re-executing; the send waits for the token (freshToken, at most 10 s)
    const waiting = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "pending" });
    expect(waiting.state.report.kind).toBe("sending");
    expect(sends(waiting.effects)).toHaveLength(1);
    expect(texts(waiting.effects, "announce")).toEqual([]);
    // no token after the wait comes back as CAPTCHA, which is the report bot hold
    const timedOut = run(waiting.state, { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "captcha" }) });
    expect(timedOut.state.report.kind).toBe("botHold");
    const hold = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "failed" });
    expect(hold.state.report.kind).toBe("botHold");
    expect(texts(hold.effects, "announce")).toEqual(["Bot check failed. Your decision is kept. Retry the check to continue."]);
    expect(run(hold.state, { type: "RETRY_OK", now: 0 }).state.report.kind).toBe("sending");
  });

  it("a report failure says the report was not sent and offers Try again", () => {
    const sending = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state;
    const r = run(sending, { type: "RESULT", channel: "report", result: toOutcome("network") });
    expect(r.state.report.kind).toBe("netErr");
    expect(texts(r.effects, "announce")).toEqual(["Couldn't send your report. Nothing was saved. Check your connection and try again."]);
    expect(run(r.state, { type: "TRY_AGAIN", channel: "report" }).state.report.kind).toBe("sending");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/commit-machine.test.ts`
Expected: FAIL with `Failed to resolve import "@/components/review/desk/commit-machine"`.

- [ ] **Step 3: Write the machine**

Create `web/components/review/desk/commit-machine.ts`:

```ts
import { DESK_NEW, fill } from "@/lib/copy";
import { DESK, toastSub } from "@/lib/review-copy";
import type { DeskOutcome, ReviewerRole, Version } from "@/lib/review-types";

/*
 * Spec §5.8.2: the commit-delayed approval as a pure reducer. Time comes in on events (`now` from performance.now()),
 * never from a clock read here, so a wall-clock jump cannot shorten a window and the tests drive time directly.
 * Reports (§5.10) have their own small state next to the commit, so a report on one record never ends another's window.
 */

export type Op = {
  conceptId: string; name: string; role: ReviewerRole; decision: "ok" | "issue"; note: string;
  /** The version the reviewer saw (§5.11); sent with the commit and every retry, never a later one. */
  viewedVersion: Version;
  /** UUID v4 made when A is pressed or Send report is chosen; reused unchanged on every retry (§7.2 step 1). */
  requestId: string;
};
export type Commit =
  | { kind: "idle" }
  | { kind: "awaitingToken"; op: Op; since: number }
  | { kind: "armed"; op: Op; deadline: number }
  | { kind: "committing"; op: Op }
  | { kind: "botHold"; hold: "approve" | "commit"; op: Op }
  | { kind: "netErr"; op: Op; saved: "no" | "unknown" };
export type Report =
  | { kind: "idle" }
  | { kind: "sending"; op: Op }
  | { kind: "botHold"; op: Op }
  | { kind: "netErr"; op: Op; saved: "no" | "unknown" };
export type Auth = "ok" | "forbidden" | "signedOut";
export type MachineState = { commit: Commit; report: Report; auth: Auth; undoMs: number };

export const TOKEN_MAX_AGE_MS = 270_000;
export const TOKEN_WAIT_MS = 10_000;

export const initialMachine = (undoSeconds: number): MachineState =>
  ({ commit: { kind: "idle" }, report: { kind: "idle" }, auth: "ok", undoMs: undoSeconds * 1000 });

/** The codes the decide server action answers with (lib/desk-core.ts). */
export type DecideCode = "stale_rerun" | "stale_decision" | "issue_open" | "already_approved" | "already_checked" | "removed"
  | "stage_failed" | "captcha" | "forbidden" | "unauthenticated" | "rate_limited" | "invalid" | "failed";
export type DecideResultLike = { ok: true; outcome: DeskOutcome } | { ok: false; code: DecideCode };
type ConflictCode = Extract<DecideCode, "stale_rerun" | "stale_decision" | "issue_open" | "already_approved" | "already_checked"
  | "removed" | "stage_failed">;

export type Outcome =
  | { type: "OK"; outcome: DeskOutcome }
  | { type: "CONFLICT"; code: ConflictCode }
  | { type: "CAPTCHA" } | { type: "FORBIDDEN" } | { type: "UNAUTHENTICATED" }
  /** Refused before anything could be saved: 429, rate_limited, or a 400 (§5.7 "Not saved"). */
  | { type: "NOT_SAVED" }
  /** Sent, but the answer was lost: network error, timeout or 5xx (§5.7 "Unconfirmed"). */
  | { type: "UNCONFIRMED" };

export function toOutcome(r: DecideResultLike | "network" | "timeout"): Outcome {
  if (r === "network" || r === "timeout") return { type: "UNCONFIRMED" };
  if (r.ok) return { type: "OK", outcome: r.outcome };
  switch (r.code) {
    case "captcha": return { type: "CAPTCHA" };
    case "forbidden": return { type: "FORBIDDEN" };
    case "unauthenticated": return { type: "UNAUTHENTICATED" };
    case "rate_limited": case "invalid": return { type: "NOT_SAVED" };
    case "failed": return { type: "UNCONFIRMED" };
    default: return { type: "CONFLICT", code: r.code };
  }
}

type TokenState = "held" | "pending" | "failed";
export type Event =
  | { type: "PRESS_A"; op: Op; token: TokenState; now: number }
  | { type: "TOKEN"; now: number }
  | { type: "WIDGET_ERROR" }
  | { type: "TOKEN_TIMEOUT"; now: number }
  | { type: "PRESS_U" }
  | { type: "STALE"; conceptId: string; reason: "rerun" | "other" }
  | { type: "FORBIDDEN" }
  | { type: "UNAUTHENTICATED" }
  | { type: "PAGE_UNLOAD" }
  | { type: "DEADLINE"; now: number }
  | { type: "SEND_REPORT"; op: Op; token: TokenState }
  | { type: "RESULT"; channel: "commit" | "report"; result: Outcome }
  | { type: "RETRY_OK"; now: number }
  | { type: "RETRY_FAIL" }
  | { type: "TRY_AGAIN"; channel: "commit" | "report" }
  | { type: "SET_UNDO"; seconds: number };

export type Effect =
  | { type: "send"; channel: "commit" | "report"; op: Op }
  | { type: "announce"; text: string }
  | { type: "hint"; text: string }
  | { type: "saved"; channel: "commit" | "report"; op: Op; outcome: DeskOutcome }
  | { type: "stale"; conceptId: string; reason: "rerun" | "other"; cancelled: boolean }
  | { type: "refresh" };

const IDLE: Commit = { kind: "idle" };
const announce = (text: string): Effect => ({ type: "announce", text });
const hint = (text: string): Effect => ({ type: "hint", text });

function arm(s: MachineState, op: Op, now: number): { state: MachineState; effects: Effect[] } {
  const sub = toastSub(op.role, s.undoMs / 1000);
  return { state: { ...s, commit: { kind: "armed", op, deadline: now + s.undoMs } },
    effects: [announce(fill(DESK.announceMarked, { name: op.name, sub }))] };
}

const CONFLICT_HINT: Record<Exclude<ConflictCode, "stale_rerun" | "stale_decision">, () => string> = {
  issue_open: () => DESK.issueOpen,
  already_approved: () => DESK.alreadyApproved,
  already_checked: () => DESK.alreadyChecked,
  removed: () => DESK_NEW.approvalRefused.removedHint,
  stage_failed: () => DESK_NEW.approvalRefused.commitHint,
};

/** The window or pending approval on the record, if any. */
export function windowOn(s: MachineState): Op | null {
  const c = s.commit;
  return c.kind === "armed" || c.kind === "awaitingToken" || c.kind === "committing" ? c.op : null;
}

function cancelWindow(s: MachineState, conceptId?: string): { s: MachineState; cancelled: Op | null } {
  const c = s.commit;
  const open = c.kind === "armed" || c.kind === "awaitingToken" || (c.kind === "botHold" && c.hold === "approve");
  if (!open || (conceptId !== undefined && c.op.conceptId !== conceptId)) return { s, cancelled: null };
  return { s: { ...s, commit: IDLE }, cancelled: c.op };
}

function outcome(s: MachineState, channel: "commit" | "report", op: Op, r: Outcome): { state: MachineState; effects: Effect[] } {
  const clear = channel === "commit" ? { ...s, commit: IDLE } : { ...s, report: { kind: "idle" } as Report };
  const failed = (saved: "no" | "unknown") => channel === "commit"
    ? { ...s, commit: { kind: "netErr", op, saved } as Commit } : { ...s, report: { kind: "netErr", op, saved } as Report };
  switch (r.type) {
    case "OK":
      return { state: clear, effects: [{ type: "saved", channel, op, outcome: r.outcome },
        ...(channel === "report" ? [announce(fill(DESK.reported, { name: op.name }))] : [])] };
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
      return { state: failed("no"), effects: [announce(channel === "commit" ? DESK.netAnnounce : reportFailed())] };
    case "UNCONFIRMED":
      return { state: failed("unknown"), effects: [announce(channel === "commit" ? DESK_NEW.decisionUnconfirmed.announce : reportFailed())] };
  }
}

const reportFailed = () => `${DESK_NEW.deskMisc.reportFailedTitle} ${DESK_NEW.deskMisc.reportFailedBody}`;

export function step(s: MachineState, e: Event): { state: MachineState; effects: Effect[] } {
  const c = s.commit;
  switch (e.type) {
    case "SET_UNDO":
      return { state: { ...s, undoMs: e.seconds * 1000 }, effects: [] };
    case "PRESS_A":
      if (c.kind !== "idle") return { state: s, effects: [] };
      if (e.token === "failed")
        return { state: { ...s, commit: { kind: "botHold", hold: "approve", op: e.op } }, effects: [announce(DESK.botFailedAnnounce)] };
      if (e.token === "pending") return { state: { ...s, commit: { kind: "awaitingToken", op: e.op, since: e.now } }, effects: [] };
      return arm(s, e.op, e.now);
    case "TOKEN":
      return c.kind === "awaitingToken" ? arm(s, c.op, e.now) : { state: s, effects: [] };
    case "WIDGET_ERROR":
    case "TOKEN_TIMEOUT":
      return c.kind === "awaitingToken"
        ? { state: { ...s, commit: { kind: "botHold", hold: "approve", op: c.op } }, effects: [announce(DESK.botFailedAnnounce)] }
        : { state: s, effects: [] };
    case "PRESS_U":
      if (c.kind === "armed" || c.kind === "awaitingToken")
        return { state: { ...s, commit: IDLE }, effects: [announce(fill(DESK.undone, { name: c.op.name }))] };
      if (c.kind === "committing") return { state: s, effects: [hint(fill(DESK_NEW.undoWhileSaving.hint, { name: c.op.name }))] };
      return { state: s, effects: [hint(DESK.nothingToUndo)] };
    case "STALE": {
      const { s: next, cancelled } = cancelWindow(s, e.conceptId);
      return { state: next, effects: [{ type: "stale", conceptId: e.conceptId, reason: e.reason, cancelled: cancelled !== null }] };
    }
    case "FORBIDDEN":
    case "UNAUTHENTICATED": {
      const { s: next, cancelled } = cancelWindow(s);
      const auth: Auth = e.type === "FORBIDDEN" ? "forbidden" : "signedOut";
      const text = cancelled === null ? null : e.type === "FORBIDDEN"
        ? fill(DESK.noAuthAnnounce, { name: cancelled.name }) : fill(DESK_NEW.sessionExpired.block, { name: cancelled.name });
      return { state: { ...next, auth }, effects: text ? [announce(text)] : [] };
    }
    case "PAGE_UNLOAD":
      return { state: cancelWindow(s).s, effects: [] };
    case "DEADLINE":
      if (c.kind !== "armed" || e.now < c.deadline) return { state: s, effects: [] };
      return { state: { ...s, commit: { kind: "committing", op: c.op } }, effects: [{ type: "send", channel: "commit", op: c.op }] };
    case "SEND_REPORT": {
      const { s: next } = cancelWindow(s, e.op.conceptId);
      // §5.8.5: only error-callback (or 10 s without a token, which the send reports as CAPTCHA) is a bot failure.
      // "pending" sends now; the desk's freshToken waits up to TOKEN_WAIT_MS for the token.
      if (e.token === "failed") return { state: { ...next, report: { kind: "botHold", op: e.op } }, effects: [announce(DESK.botFailedAnnounce)] };
      return { state: { ...next, report: { kind: "sending", op: e.op } }, effects: [{ type: "send", channel: "report", op: e.op }] };
    }
    case "RESULT": {
      if (e.channel === "commit") return c.kind === "committing" ? outcome(s, "commit", c.op, e.result) : { state: s, effects: [] };
      return s.report.kind === "sending" ? outcome(s, "report", s.report.op, e.result) : { state: s, effects: [] };
    }
    case "RETRY_OK": {
      const passed = announce(DESK.botPassedAnnounce);
      if (c.kind === "botHold" && c.hold === "approve") {
        const armed = arm(s, c.op, e.now);
        return { state: armed.state, effects: [passed, ...armed.effects] };
      }
      if (c.kind === "botHold" && c.hold === "commit")
        return { state: { ...s, commit: { kind: "committing", op: c.op } }, effects: [passed, { type: "send", channel: "commit", op: c.op }] };
      if (s.report.kind === "botHold")
        return { state: { ...s, report: { kind: "sending", op: s.report.op } },
          effects: [passed, { type: "send", channel: "report", op: s.report.op }] };
      return { state: s, effects: [] };
    }
    case "RETRY_FAIL":
      return { state: s, effects: [announce(DESK.botFailedAnnounce)] };
    case "TRY_AGAIN":
      if (e.channel === "commit" && c.kind === "netErr")
        return { state: { ...s, commit: { kind: "committing", op: c.op } }, effects: [{ type: "send", channel: "commit", op: c.op }] };
      if (e.channel === "report" && s.report.kind === "netErr")
        return { state: { ...s, report: { kind: "sending", op: s.report.op } }, effects: [{ type: "send", channel: "report", op: s.report.op }] };
      return { state: s, effects: [] };
  }
}

/** §5.8.5: a held token older than 270 s is refreshed before a send; a fresh one is used once. */
export function tokenPlan(heldAt: number | null, now: number): "use" | "refresh" {
  return heldAt !== null && now - heldAt < TOKEN_MAX_AGE_MS ? "use" : "refresh";
}

/** The toast (§5.8.4): running while armed, "saving" while committing, nothing otherwise. */
export function toastView(s: MachineState): { mode: "running" | "saving"; op: Op } | null {
  if (s.commit.kind === "armed") return { mode: "running", op: s.commit.op };
  if (s.commit.kind === "committing") return { mode: "saving", op: s.commit.op };
  return null;
}

/**
 * A decision on this record may have been saved without the desk knowing yet: in flight (`committing`, report
 * `sending`) or unconfirmed (`netErr`, `saved: "unknown"`). A poll or refresh must not read the changed lastDecisionId
 * as another reviewer (§5.8.2 D45); the outcome sets viewedVersion, or Try again resolves it.
 */
export function unconfirmedOn(s: MachineState, conceptId: string): boolean {
  const c = s.commit, r = s.report;
  return (c.kind === "committing" && c.op.conceptId === conceptId)
    || (c.kind === "netErr" && c.saved === "unknown" && c.op.conceptId === conceptId)
    || (r.kind === "sending" && r.op.conceptId === conceptId)
    || (r.kind === "netErr" && r.saved === "unknown" && r.op.conceptId === conceptId);
}

/** §5.8.3: leaving would lose a decision. */
export function blocksUnload(s: MachineState): boolean {
  return ["awaitingToken", "armed", "committing", "netErr"].includes(s.commit.kind) || s.report.kind === "sending" || s.report.kind === "netErr";
}

/** §5.11: re-run when the stamp changed; another reviewer when only the decision id changed (unless unconfirmed). */
export function staleReason(viewed: Version, current: Version, unconfirmed: boolean): "rerun" | "other" | null {
  if (viewed.extractedAt !== current.extractedAt) return "rerun";
  if (viewed.lastDecisionId !== current.lastDecisionId && !unconfirmed) return "other";
  return null;
}

export type Viewed = Record<string, Version>;
/** §5.8.2 "Own saves never make the record stale": a saved decision's version becomes that record's viewed version. */
export function applySaved(viewed: Viewed, e: Effect): Viewed {
  return e.type === "saved" ? { ...viewed, [e.op.conceptId]: e.outcome.version } : viewed;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/commit-machine.test.ts`
Expected: PASS (25 tests).

- [ ] **Step 5: Commit**

```bash
git add web/components/review/desk/commit-machine.ts web/tests/commit-machine.test.ts
git commit -m "feat(web): commit-delayed approval as a pure state machine

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Desk logic — bar state, hints, auto-advance, keys, row hints, poll verdicts and desk links (§5.4, §5.7, §5.8.4, §5.9, §5.11, §5.14)

**Files:**
- Create: `web/components/review/desk/bar-state.ts`, `web/components/review/desk/advance.ts`, `web/components/review/desk/keys.ts`, `web/components/review/desk/row-hint.ts`, `web/components/review/desk/poll.ts`, `web/components/review/desk/hrefs.ts`
- Test: `web/tests/bar-state.test.ts`, `web/tests/advance.test.ts`, `web/tests/desk-keymap.test.ts`, `web/tests/row-hint.test.ts`, `web/tests/poll.test.ts`

**Interfaces:**
- Consumes: `MachineState`, `windowOn` (Task 10); `DESK`, `DESK_NEW`, `fill`, `PROMISE_*` (Tasks 9, P1A); `DisplayStatus`, `ItemHint`, `VersionRow`, `FilterKey`, `ReviewerRole`, `Version` (Task 7).
- Produces:
  - `bar-state.ts`: `type BarCtx = { loading; complete; role; batchId; record: { conceptId; name; status: DisplayStatus; stagesBlocked: boolean } | null; stale; drawerOpen; reportOpen; machine: MachineState; undoSeconds; advanceGuard: { conceptId; at } | null; now }`; `promise(ctx): { lead; body }`; `approveHint(ctx): { block: boolean; text: string | null }`; `reportHint(ctx)` (same shape, for R and the closed Report issue button); `sendHint(ctx): string | null`; `approveDisabled(ctx)`, `reportDisabled(ctx)`, `sendDisabled(ctx)`: boolean; `ADVANCE_GUARD_MS = 1000`; `NOTE_MIN = 5`, `NOTE_MAX = 1000`, `noteLength(s): number` (code points of the trimmed text).
  - `advance.ts`: `type AdvanceRow = { conceptId; name; index; status: DisplayStatus }`; `needsFor(role, status): boolean`; `advance(a: { role; committedId; openId: string | null; reportOpen; visible: AdvanceRow[]; all: AdvanceRow[]; batchId; saved: string }) -> { kind: "complete"; switchView: boolean; announce } | { kind: "stay"; announce } | { kind: "open"; target: AdvanceRow; clearFilter: boolean; announce }`.
  - `keys.ts`: `type KeyTarget = "note" | "approve" | "search" | "listbox" | "field" | "other"`, `type KeyAction`, `keyAction(e: { key; ctrlKey; metaKey; altKey }, ctx: { singleKeys; sheetOpen; target: KeyTarget; searchHasText; drawerOpen; reportOpen }): KeyAction | null`, `targetKind(el: Element | null): KeyTarget`, `IS_MAC_RE`.
  - `row-hint.ts`: `rowHint(h: ItemHint, s: { netErr: "no" | "unknown" | null; stale: boolean }): { text: string; tone: "warn" | "nodata" | null }`.
  - `poll.ts`: `POLL_MS = 20_000`; `pollVerdict(res: Response | null): Promise<{ kind: "rows"; rows: VersionRow[] } | { kind: "signedOut" } | { kind: "forbidden" } | { kind: "ignore" }>`; `compareRows(known: { conceptId; version: Version; displayStatus }[], rows: VersionRow[], openId: string | null): { open: VersionRow | null; othersChanged: boolean }`.
  - `hrefs.ts`: `recordHref(batchId, conceptId, opts?: { show?: FilterKey; q?: string; pane?: "list" }): string`, `batchHref(batchId)`, `isDeskPath(pathname: string, batchId: string): boolean`, `versionsHref(batchId)`, `signInHref(returnTo: string)`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/bar-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADVANCE_GUARD_MS, approveDisabled, approveHint, noteLength, promise, reportDisabled, reportHint, sendDisabled, sendHint, type BarCtx,
} from "@/components/review/desk/bar-state";
import { initialMachine, type MachineState, type Op } from "@/components/review/desk/commit-machine";

const op = (over: Partial<Op> = {}): Op => ({ conceptId: "napa", name: "Napa", role: "pharmacist", decision: "ok", note: "",
  viewedVersion: { extractedAt: null, lastDecisionId: null }, requestId: "r", ...over });
const machine = (over: Partial<MachineState> = {}): MachineState => ({ ...initialMachine(8), ...over });
const ctx = (over: Partial<BarCtx> = {}): BarCtx => ({
  loading: false, complete: false, role: "pharmacist", batchId: "0001-pilot",
  record: { conceptId: "napa", name: "Napa", status: "pending", stagesBlocked: false },
  stale: false, drawerOpen: false, reportOpen: false, machine: machine(), undoSeconds: 8, advanceGuard: null, now: 10_000, ...over,
});
const rec = (over: Partial<NonNullable<BarCtx["record"]>>) => ({ ...ctx().record!, ...over });

describe("the promise, first match wins (§5.7)", () => {
  it.each([
    [{ loading: true }, ["Loading batch 0001-pilot.", "Decisions open when the record loads."]],
    [{ complete: true }, ["Batch 0001-pilot is approved.", "Open any record to read it."]],
    [{ stale: true }, ["Decisions are paused.", "This record changed after you opened it. Reload it to review the latest data."]],
    [{ machine: machine({ commit: { kind: "netErr", op: op(), saved: "no" } }) }, ["Your decision was not saved.", "Use Try again above."]],
    [{ machine: machine({ commit: { kind: "netErr", op: op(), saved: "unknown" } }) },
      ["Your decision may not have been saved.", "Use Try again above to find out."]],
    [{ machine: machine({ commit: { kind: "armed", op: op(), deadline: 1 } }) },
      ["Marked correct.", "Publishes when the undo window closes. Press U to undo."]],
    [{ role: "engineer", machine: machine({ commit: { kind: "armed", op: op({ role: "engineer" }), deadline: 1 } }) },
      ["Marked correct.", "Your check saves when the undo window closes. Press U to undo."]],
    [{ machine: machine({ commit: { kind: "committing", op: op() } }) }, ["Marked correct.", "Publishing now."]],
    [{ role: "engineer", machine: machine({ commit: { kind: "committing", op: op({ role: "engineer" }) } }) }, ["Marked correct.", "Saving your check now."]],
    [{ record: rec({ stagesBlocked: true }) }, ["A check failed on this record.", "It returns to review after the fix and re-run."]],
    [{ record: rec({ status: "approved" }) }, ["Approved by a pharmacist.", "This record is public."]],
    [{ record: rec({ status: "issue" }) }, ["An issue is open on this record.", "It returns to review after the fix and re-run."]],
    [{ role: "engineer", record: rec({ status: "engineer_checked" }) }, ["Your check is recorded.", "A pharmacist still needs to approve."]],
    [{}, ["You're reviewing as a pharmacist.", '"Looks correct" publishes this record after an 8-second undo window.']],
    [{ undoSeconds: 60 }, ["You're reviewing as a pharmacist.", '"Looks correct" publishes this record after an 60-second undo window.']],
    [{ role: "engineer" }, ["You're reviewing as an engineer.", '"Looks correct" records your check. It does not publish; a pharmacist still needs to approve.']],
  ] as [Partial<BarCtx>, [string, string]][])("%j", (over, [lead, body]) => {
    expect(promise(ctx(over))).toEqual({ lead, body });
  });

  it("a window on another record does not change this record's promise", () => {
    expect(promise(ctx({ machine: machine({ commit: { kind: "armed", op: op({ conceptId: "other" }), deadline: 1 } }) })).lead)
      .toBe("You're reviewing as a pharmacist.");
  });
});

describe("hints for A, first match wins (§5.8.4)", () => {
  const text = (over: Partial<BarCtx>) => approveHint(ctx(over)).text;
  it("follows the spec order", () => {
    expect(text({ machine: machine({ auth: "forbidden" }), stale: true })).toBe("Your account can't review this batch.");
    expect(text({ machine: machine({ auth: "signedOut" }) })).toBe("Your sign-in expired. Sign in again to keep reviewing.");
    expect(approveHint(ctx({ loading: true }))).toEqual({ block: true, text: null });
    expect(text({ complete: true })).toBe("Every record is approved. Open a record to read it.");
    expect(text({ drawerOpen: true, stale: true })).toBe("Close the evidence first (Esc).");
    expect(text({ stale: true })).toBe("Decisions are paused. Reload the record first.");
    expect(text({ machine: machine({ commit: { kind: "armed", op: op(), deadline: 1 } }) }))
      .toBe("This record is already in its undo window. Press U to undo.");
    expect(text({ machine: machine({ commit: { kind: "committing", op: op({ conceptId: "x", name: "Aspirin" }) } }) }))
      .toBe("Aspirin is still in its undo window. Press U to undo it, or wait until it saves.");
    expect(text({ machine: machine({ commit: { kind: "netErr", op: op(), saved: "no" } }) }))
      .toBe("Your last decision on this record was not saved. Use Try again.");
    expect(text({ machine: machine({ commit: { kind: "netErr", op: op(), saved: "unknown" } }) }))
      .toBe("Your last decision on this record is not confirmed yet. Use Try again.");
    expect(text({ machine: machine({ commit: { kind: "netErr", op: op({ conceptId: "x", name: "Aspirin" }), saved: "unknown" } }) }))
      .toBe("Aspirin is still in its undo window. Press U to undo it, or wait until it saves.");   // §5.8.3 string, no new copy
    expect(text({ record: rec({ stagesBlocked: true, status: "approved" }) }))
      .toBe("A check failed on this record. It returns to review after the fix and re-run.");
    expect(text({ record: rec({ status: "approved" }) })).toBe("This record is already approved by a pharmacist.");
    expect(text({ record: rec({ status: "issue" }) })).toBe("An issue is open on this record. It returns to review after the fix and re-run.");
    expect(text({ role: "engineer", record: rec({ status: "engineer_checked" }) })).toBe("Your check is already recorded for this record.");
    expect(text({ reportOpen: true })).toBe("Send or cancel the report first.");
    expect(text({ machine: machine({ commit: { kind: "botHold", hold: "approve", op: op() } }) }))
      .toBe("Retry the bot check first. Your earlier decision is kept.");
    expect(approveHint(ctx())).toEqual({ block: false, text: null });
  });

  it("the 1000 ms post-advance guard (§5.9)", () => {
    expect(ADVANCE_GUARD_MS).toBe(1000);
    const guard = { conceptId: "napa", at: 10_000 };
    expect(text({ advanceGuard: guard, now: 10_999 })).toBe("Record changed to Napa. Press A again to approve it.");
    expect(approveHint(ctx({ advanceGuard: guard, now: 11_000 }))).toEqual({ block: false, text: null });
    expect(approveHint(ctx({ advanceGuard: { conceptId: "other", at: 10_000 }, now: 10_100 }))).toEqual({ block: false, text: null });
  });
});

describe("R and Send report", () => {
  it("R names only the rows that apply to it", () => {
    expect(reportHint(ctx({ machine: machine({ auth: "forbidden" }) })).text).toBe("Your account can't review this batch.");
    expect(reportHint(ctx({ drawerOpen: true })).text).toBe("Close the evidence first (Esc).");
    expect(reportHint(ctx({ stale: true })).text).toBe("Decisions are paused. Reload the record first.");
    expect(reportHint(ctx({ record: rec({ status: "approved" }) }))).toEqual({ block: false, text: null });
    expect(reportHint(ctx({ loading: true }))).toEqual({ block: true, text: null });
  });

  it("Send is paused while stale and during a bot hold", () => {
    expect(sendHint(ctx({ stale: true }))).toBe("Sending is paused until you reload the record. Your note is kept.");
    expect(sendHint(ctx({ machine: machine({ report: { kind: "botHold", op: op() } }) })))
      .toBe("Retry the bot check first. Your earlier decision is kept.");
    expect(sendHint(ctx())).toBeNull();
    expect(sendDisabled(ctx({ stale: true }))).toBe(true);
  });
});

describe("aria-disabled (§5.7)", () => {
  it("Looks correct", () => {
    expect(approveDisabled(ctx())).toBe(false);
    for (const over of [{ record: null }, { loading: true }, { stale: true }, { drawerOpen: true }, { reportOpen: true },
      { record: rec({ status: "approved" }) }, { record: rec({ status: "issue" }) }, { record: rec({ stagesBlocked: true }) },
      { role: "engineer" as const, record: rec({ status: "engineer_checked" }) },
      { machine: machine({ auth: "forbidden" }) }, { machine: machine({ auth: "signedOut" }) },
      { machine: machine({ commit: { kind: "armed", op: op(), deadline: 1 } }) },
      { machine: machine({ commit: { kind: "netErr", op: op(), saved: "no" } }) }] as Partial<BarCtx>[])
      expect(approveDisabled(ctx(over))).toBe(true);
    expect(approveDisabled(ctx({ record: rec({ status: "engineer_checked" }) }))).toBe(false);
  });

  it("Report issue stays available on approved and issue records", () => {
    expect(reportDisabled(ctx({ record: rec({ status: "approved" }) }))).toBe(false);
    expect(reportDisabled(ctx({ record: rec({ status: "issue" }) }))).toBe(false);
    for (const over of [{ record: null }, { stale: true }, { drawerOpen: true }] as Partial<BarCtx>[])
      expect(reportDisabled(ctx(over))).toBe(true);
  });
});

describe("note length (Review Focus 2)", () => {
  it("counts note characters in code points, trimmed, as the API does", () => {
    expect(noteLength("  abcd  ")).toBe(4);
    expect(noteLength("😀😀😀😀")).toBe(4);
    expect("😀😀😀😀".length).toBe(8);
    expect(noteLength("ঔষধ ভুল")).toBe(7);
    expect(noteLength("😀😀😀😀😀")).toBe(5);
  });
});
```

Create `web/tests/advance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance, needsFor, type AdvanceRow } from "@/components/review/desk/advance";

const rows = (statuses: AdvanceRow["status"][]): AdvanceRow[] =>
  statuses.map((status, i) => ({ conceptId: `c${i + 1}`, name: `Brand ${i + 1}`, index: i + 1, status }));
const base = { role: "pharmacist" as const, batchId: "0001-pilot", reportOpen: false, saved: "Saved. Brand 2 is approved by a pharmacist and published." };

describe("auto-advance (§5.9)", () => {
  it("needs-review sets per role", () => {
    expect(["pending", "back_in_review", "engineer_checked"].every((s) => needsFor("pharmacist", s as AdvanceRow["status"]))).toBe(true);
    expect(needsFor("engineer", "engineer_checked")).toBe(false);
    expect(needsFor("engineer", "back_in_review")).toBe(true);
    expect(needsFor("pharmacist", "issue")).toBe(false);
  });

  it("opens the next record that needs review in the visible order, wrapping", () => {
    const all = rows(["approved", "approved", "pending", "approved"]);
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "open", target: all[2], clearFilter: false,
        announce: "Saved. Brand 2 is approved by a pharmacist and published. Opened Brand 3, record 3 of 4." });
    const wrap = rows(["pending", "approved", "approved", "approved"]);
    expect(advance({ ...base, committedId: "c3", openId: "c3", visible: wrap, all: wrap })).toMatchObject({ kind: "open", target: wrap[0] });
  });

  it("an engineer skips records an engineer already checked", () => {
    const all = rows(["engineer_checked", "engineer_checked", "engineer_checked", "pending"]);
    expect(advance({ ...base, role: "engineer", committedId: "c2", openId: "c2", visible: all, all }))
      .toMatchObject({ kind: "open", target: all[3] });
  });

  it("clears the filter when the only record left is outside the view", () => {
    const all = rows(["approved", "approved", "issue", "pending"]);
    const visible = [all[0], all[1]];
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible, all })).toMatchObject({ kind: "open", target: all[3], clearFilter: true });
  });

  it("stays when the report panel is open, or when the committed record is not the open one", () => {
    const all = rows(["pending", "approved", "pending"]);
    expect(advance({ ...base, reportOpen: true, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "stay", announce: base.saved });
    expect(advance({ ...base, committedId: "c2", openId: "c1", visible: all, all })).toEqual({ kind: "stay", announce: base.saved });
  });

  it("says so when nothing else needs review", () => {
    const all = rows(["approved", "approved", "issue"]);
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "stay", announce: `${base.saved} No other record needs your review.` });
  });

  it("switches to the complete view when every record is approved, only if the committed record is open", () => {
    const all = rows(["approved", "approved"]);
    expect(advance({ ...base, committedId: "c2", openId: "c2", visible: all, all }))
      .toEqual({ kind: "complete", switchView: true, announce: `${base.saved} Every record in batch 0001-pilot is approved.` });
    expect(advance({ ...base, committedId: "c2", openId: "c1", visible: all, all })).toMatchObject({ kind: "complete", switchView: false });
  });
});
```

Create `web/tests/desk-keymap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keyAction, type KeyTarget } from "@/components/review/desk/keys";

const ctx = (over: Partial<Parameters<typeof keyAction>[1]> = {}) => ({ singleKeys: true, sheetOpen: false, target: "other" as KeyTarget,
  searchHasText: false, drawerOpen: false, reportOpen: false, ...over });
const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("keyboard model (§5.14)", () => {
  it("letters, case-insensitive; ? by key", () => {
    expect(["a", "A", "u", "r", "j", "k", "e", "s", "?"].map((k) => keyAction(key(k), ctx())))
      .toEqual(["approve", "approve", "undo", "report", "next", "prev", "evidence", "source", "sheet"]);
  });

  it("ignored while typing and with Ctrl, Cmd or Alt", () => {
    for (const target of ["field", "search", "note"] as KeyTarget[]) expect(keyAction(key("a"), ctx({ target }))).toBeNull();
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) expect(keyAction(key("a", mods), ctx())).toBeNull();
  });

  it("Enter never approves, with or without modifiers", () => {
    for (const mods of [{}, { ctrlKey: true }, { metaKey: true }]) expect(keyAction(key("Enter", mods), ctx({ target: "approve" }))).toBe("enterBlocked");
  });

  it("Esc closes the sheet, then the drawer, then the note (keeping it), then the search text", () => {
    expect(keyAction(key("Escape"), ctx({ sheetOpen: true, drawerOpen: true }))).toBe("closeSheet");
    expect(keyAction(key("Escape"), ctx({ drawerOpen: true, reportOpen: true }))).toBe("closeDrawer");
    expect(keyAction(key("Escape"), ctx({ reportOpen: true, target: "note" }))).toBe("closeReport");
    expect(keyAction(key("Escape"), ctx({ reportOpen: true }))).toBe("closeReport");
    expect(keyAction(key("Escape"), ctx({ target: "search", searchHasText: true }))).toBe("clearSearch");
    expect(keyAction(key("Escape"), ctx({ target: "search" }))).toBeNull();
  });

  it("Ctrl or Cmd Enter sends, only in the note field", () => {
    expect(keyAction(key("Enter", { ctrlKey: true }), ctx({ target: "note" }))).toBe("sendReport");
    expect(keyAction(key("Enter", { metaKey: true }), ctx({ target: "note" }))).toBe("sendReport");
    expect(keyAction(key("Enter"), ctx({ target: "note" }))).toBeNull();
    expect(keyAction(key("Enter", { ctrlKey: true }), ctx())).toBeNull();
  });

  it("list keys only on the listbox", () => {
    expect(["ArrowDown", "ArrowUp", "Home", "End"].map((k) => keyAction(key(k), ctx({ target: "listbox" }))))
      .toEqual(["next", "prev", "first", "last"]);
    expect(keyAction(key("ArrowDown"), ctx())).toBeNull();
  });

  it("with the sheet open only Esc and ? act", () => {
    expect(keyAction(key("a"), ctx({ sheetOpen: true }))).toBeNull();
    expect(keyAction(key("?"), ctx({ sheetOpen: true }))).toBe("closeSheet");
  });

  it("single-key shortcuts Off: letters and ? do nothing; Esc, Ctrl Enter and list arrows still work", () => {
    const off = (over: Partial<Parameters<typeof keyAction>[1]> = {}) => ctx({ singleKeys: false, ...over });
    for (const k of ["a", "u", "r", "j", "k", "e", "s", "?"]) expect(keyAction(key(k), off())).toBeNull();
    expect(keyAction(key("?"), off({ sheetOpen: true }))).toBeNull();
    expect(keyAction(key("Escape"), off({ drawerOpen: true }))).toBe("closeDrawer");
    expect(keyAction(key("Enter", { ctrlKey: true }), off({ target: "note" }))).toBe("sendReport");
    expect(keyAction(key("ArrowDown"), off({ target: "listbox" }))).toBe("next");
    expect(keyAction(key("Enter"), off({ target: "approve" }))).toBe("enterBlocked");
  });
});
```

Create `web/tests/row-hint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowHint } from "@/components/review/desk/row-hint";

const h = (over = {}) => ({ failed: 0, warnings: 0, pairsWithoutText: 0, noData: false, notRun: false, ...over });
const clean = { netErr: null, stale: false };

describe("row hints, the first rule wins (§5.4)", () => {
  it("in rule order", () => {
    expect(rowHint(h({ noData: true }), { netErr: "no", stale: true })).toEqual({ text: "Decision not saved", tone: "warn" });
    expect(rowHint(h(), { netErr: "unknown", stale: true })).toEqual({ text: "Decision not confirmed", tone: "warn" });
    expect(rowHint(h({ noData: true }), { netErr: null, stale: true })).toEqual({ text: "Changed since you opened it", tone: "warn" });
    expect(rowHint(h({ noData: true, failed: 2 }), clean)).toEqual({ text: "No DDInter data", tone: "nodata" });
    expect(rowHint(h({ notRun: true, failed: 2 }), clean)).toEqual({ text: "DDInter not run yet", tone: "warn" });
    expect(rowHint(h({ failed: 1, warnings: 3 }), clean)).toEqual({ text: "1 check failed", tone: "warn" });
    expect(rowHint(h({ failed: 2 }), clean)).toEqual({ text: "2 checks failed", tone: "warn" });
    expect(rowHint(h({ warnings: 1 }), clean)).toEqual({ text: "1 check warning", tone: "warn" });
    expect(rowHint(h({ warnings: 2, pairsWithoutText: 1 }), clean)).toEqual({ text: "2 check warnings, 1 pair without text", tone: "warn" });
    expect(rowHint(h({ warnings: 1, pairsWithoutText: 6 }), clean)).toEqual({ text: "1 check warning, 6 pairs without text", tone: "warn" });
    expect(rowHint(h(), clean)).toEqual({ text: "All checks OK", tone: null });
  });

  it("gives the pilot triage of §1.6 item 7", async () => {
    const { pilotRows } = await import("./fixtures/pilot");
    expect(pilotRows().map((r) => `${r.tradeName}: ${rowHint(r.hint, clean).text}`)).toEqual([
      "Amlodipine-5: 1 check warning, 4 pairs without text", "Aspirin: 1 check warning, 5 pairs without text",
      "Simvastatin: 1 check warning, 4 pairs without text", "Chloramphenicol: All checks OK", "Domperidone: No DDInter data",
      "G Warfarin: 1 check warning, 1 pair without text", "G-Metformin: 1 check warning, 5 pairs without text",
      "Napa: 1 check warning, 6 pairs without text", "Clarith: 1 check warning, 2 pairs without text",
      "Amoxycillin Clavulanic Acid: 1 check warning, 5 pairs without text",
    ]);
  });
});
```

Create `web/tests/poll.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { POLL_MS, compareRows, pollVerdict } from "@/components/review/desk/poll";
import { batchHref, isDeskPath, recordHref, signInHref, versionsHref } from "@/components/review/desk/hrefs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const row = (conceptId: string, extractedAt: string | null, lastDecisionId: number | null = null, displayStatus = "pending") =>
  ({ conceptId, extractedAt, lastDecisionId, displayStatus });

describe("versions poll (§5.11)", () => {
  it("polls every 20 s", () => expect(POLL_MS).toBe(20_000));

  it("a failed poll is ignored, a 401 signs out (Review Focus 3)", async () => {
    expect(await pollVerdict(null)).toEqual({ kind: "ignore" });
    for (const status of [429, 500, 502, 503, 404]) expect(await pollVerdict(json([], status))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(new Response("<html>bad gateway</html>", { status: 200 }))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(json({ rows: [] }))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(json([{ nope: 1 }]))).toEqual({ kind: "ignore" });
    expect(await pollVerdict(json({}, 401))).toEqual({ kind: "signedOut" });
    expect(await pollVerdict(json({}, 403))).toEqual({ kind: "forbidden" });
    expect(await pollVerdict(json([row("a", "t1")]))).toEqual({ kind: "rows", rows: [row("a", "t1")] });
  });

  it("compares the open record and the other rows separately", () => {
    const known = [row("a", "t1"), row("b", "t1")].map((r) => ({ conceptId: r.conceptId,
      version: { extractedAt: r.extractedAt, lastDecisionId: r.lastDecisionId }, displayStatus: r.displayStatus }));
    expect(compareRows(known, [row("a", "t1"), row("b", "t1")], "a")).toEqual({ open: row("a", "t1"), othersChanged: false });
    expect(compareRows(known, [row("a", "t2"), row("b", "t1")], "a")).toEqual({ open: row("a", "t2"), othersChanged: false });
    expect(compareRows(known, [row("a", "t1"), row("b", "t1", 9, "engineer_checked")], "a").othersChanged).toBe(true);
    expect(compareRows(known, [row("a", "t1"), row("b", "t1"), row("c", "t1")], "a").othersChanged).toBe(true);
    expect(compareRows(known, [row("b", "t1")], "a")).toEqual({ open: null, othersChanged: false });
  });
});

describe("desk links", () => {
  it("encode ids and keep the filter in the query", () => {
    expect(recordHref("0001-pilot", "186-0030-006--napa")).toBe("/review/0001-pilot/186-0030-006--napa");
    expect(recordHref("a b", "c/d", { show: "needs", q: "napa 500" })).toBe("/review/a%20b/c%2Fd?show=needs&q=napa+500");
    expect(recordHref("b", "c", { show: "all", q: "", pane: "list" })).toBe("/review/b/c?pane=list");
    expect(batchHref("0001-pilot")).toBe("/review/0001-pilot");
    expect(versionsHref("0001-pilot")).toBe("/review/0001-pilot/versions");
    expect(signInHref("/review/0001-pilot/x?show=needs")).toBe("/signin?returnTo=%2Freview%2F0001-pilot%2Fx%3Fshow%3Dneeds");
  });

  it("isDeskPath is true only inside this batch's desk", () => {
    expect(isDeskPath("/review/0001-pilot/napa", "0001-pilot")).toBe(true);
    expect(isDeskPath("/review/0001-pilot", "0001-pilot")).toBe(false);
    expect(isDeskPath("/review/0002/napa", "0001-pilot")).toBe(false);
    expect(isDeskPath("/review/flags", "0001-pilot")).toBe(false);
    expect(isDeskPath("/search", "0001-pilot")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/bar-state.test.ts tests/advance.test.ts tests/desk-keymap.test.ts tests/row-hint.test.ts tests/poll.test.ts`
Expected: FAIL — none of the six desk modules resolves.

- [ ] **Step 3: Write the modules**

Create `web/components/review/desk/bar-state.ts`:

```ts
import { DESK_NEW, PROMISE_ENGINEER, PROMISE_PAUSED, PROMISE_PHARMACIST, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { DisplayStatus, ReviewerRole } from "@/lib/review-types";
import { windowOn, type MachineState } from "./commit-machine";

/** Everything the decision bar's words and states depend on (§5.7, §5.8.4). Pure. */
export type BarCtx = {
  loading: boolean; complete: boolean; role: ReviewerRole; batchId: string;
  record: { conceptId: string; name: string; status: DisplayStatus; stagesBlocked: boolean } | null;
  stale: boolean; drawerOpen: boolean; reportOpen: boolean; machine: MachineState; undoSeconds: number;
  advanceGuard: { conceptId: string; at: number } | null; now: number;
};

export const ADVANCE_GUARD_MS = 1000;
export const NOTE_MIN = 5, NOTE_MAX = 1000;
/** The API counts characters in code points (Validate.length); so does the desk (Review Focus 2). */
export const noteLength = (s: string) => [...s.trim()].length;

const p = (lead: string, body: string) => ({ lead, body });
const onRecord = (ctx: BarCtx, conceptId: string | undefined) => ctx.record !== null && ctx.record.conceptId === conceptId;
const netErrHere = (ctx: BarCtx) => ctx.machine.commit.kind === "netErr" && onRecord(ctx, ctx.machine.commit.op.conceptId)
  ? ctx.machine.commit.saved : null;

export function promise(ctx: BarCtx): { lead: string; body: string } {
  const c = ctx.machine.commit, r = ctx.record, pharmacist = ctx.role === "pharmacist";
  if (ctx.loading) return p(fill(DESK.promiseLoading, { id: ctx.batchId }), DESK.promiseLoadingBody);
  if (ctx.complete) return p(fill(DESK.promiseComplete, { id: ctx.batchId }), DESK.promiseCompleteBody);
  if (ctx.stale) return p(PROMISE_PAUSED.lead, PROMISE_PAUSED.body);
  const net = netErrHere(ctx);
  if (net === "no") return p(DESK.promiseNotSaved, DESK.promiseNotSavedBody);
  if (net === "unknown") return p(DESK_NEW.decisionUnconfirmed.promiseLead, DESK_NEW.decisionUnconfirmed.promiseBody);
  if (c.kind === "armed" && onRecord(ctx, c.op.conceptId))
    return p(DESK.promiseMarked, pharmacist ? DESK.promiseMarkedPharmacist : DESK.promiseMarkedEngineer);
  if (c.kind === "committing" && onRecord(ctx, c.op.conceptId))
    return p(DESK_NEW.committing.lead, pharmacist ? DESK_NEW.committing.pharmacistBody : DESK_NEW.committing.engineerBody);
  if (r?.stagesBlocked) return p(DESK_NEW.approvalRefused.promiseLead, DESK_NEW.approvalRefused.promiseBody);
  if (r?.status === "approved") return p(DESK.promiseApproved, DESK.promiseApprovedBody);
  if (r?.status === "issue") return p(DESK.promiseIssue, DESK.promiseIssueBody);
  if (!pharmacist && r?.status === "engineer_checked") return p(DESK.promiseChecked, DESK.promiseCheckedBody);
  return pharmacist ? p(PROMISE_PHARMACIST.lead, PROMISE_PHARMACIST.body(ctx.undoSeconds)) : p(PROMISE_ENGINEER.lead, PROMISE_ENGINEER.body);
}

type Hint = { block: boolean; text: string | null };
const allow: Hint = { block: false, text: null };
const say = (text: string): Hint => ({ block: true, text });

/** Board R's approve() order, extended (§5.8.4). */
export function approveHint(ctx: BarCtx): Hint {
  const m = ctx.machine, c = m.commit, r = ctx.record;
  if (m.auth === "forbidden") return say(DESK.noAuthTitle);
  if (m.auth === "signedOut") return say(DESK_NEW.sessionExpired.hint);
  if (ctx.loading) return { block: true, text: null };
  if (ctx.complete || r === null) return say(DESK.completeHint);
  if (ctx.drawerOpen) return say(DESK_NEW.drawerOpen.hint);
  if (ctx.stale) return say(DESK.paused);
  const open = windowOn(m);
  if (open && open.conceptId === r.conceptId) return say(DESK.thisWindow);
  if (open) return say(fill(DESK.otherWindow, { name: open.name }));
  if (c.kind === "netErr") {
    if (c.op.conceptId === r.conceptId) return say(c.saved === "no" ? DESK.notSavedHint : DESK_NEW.decisionUnconfirmed.hint);
    // The machine holds one commit, so A elsewhere cannot start a window while a failed commit waits for Try again.
    // §5.8.4 has no row of its own for this; §5.8.3 already gives a waiting failed commit the "window on another
    // record" hint (the leave guard), so the same spec string is used here rather than new copy.
    return say(fill(DESK.otherWindow, { name: c.op.name }));
  }
  if (r.stagesBlocked) return say(DESK_NEW.approvalRefused.hint);
  if (r.status === "approved") return say(DESK.alreadyApproved);
  if (r.status === "issue") return say(DESK.issueOpen);
  if (ctx.role === "engineer" && r.status === "engineer_checked") return say(DESK.alreadyChecked);
  if (ctx.reportOpen) return say(DESK.reportOpen);
  if (ctx.advanceGuard && ctx.advanceGuard.conceptId === r.conceptId && ctx.now - ctx.advanceGuard.at < ADVANCE_GUARD_MS)
    return say(fill(DESK.advanceGuard, { name: r.name }));
  if (c.kind === "botHold" || m.report.kind === "botHold") return say(DESK.botFirst);
  return allow;
}

/** R, and the Report issue button while the panel is closed: the rows of the A order that name R. */
export function reportHint(ctx: BarCtx): Hint {
  if (ctx.machine.auth === "forbidden") return say(DESK.noAuthTitle);
  if (ctx.machine.auth === "signedOut") return say(DESK_NEW.sessionExpired.hint);
  if (ctx.loading || ctx.complete || ctx.record === null) return { block: true, text: null };
  if (ctx.drawerOpen) return say(DESK_NEW.drawerOpen.hint);
  if (ctx.stale) return say(DESK.paused);
  return allow;
}

export function sendHint(ctx: BarCtx): string | null {
  if (ctx.stale) return DESK.reportPaused;
  if (ctx.machine.report.kind === "botHold" || ctx.machine.commit.kind === "botHold") return DESK.botFirst;
  return null;
}

export function approveDisabled(ctx: BarCtx): boolean {
  const r = ctx.record, m = ctx.machine;
  if (r === null || ctx.loading || ctx.complete || ctx.stale || ctx.drawerOpen || ctx.reportOpen || m.auth !== "ok") return true;
  const open = windowOn(m);
  if (open && open.conceptId === r.conceptId) return true;
  if (netErrHere(ctx) !== null) return true;
  if (r.status === "approved" || r.status === "issue" || r.stagesBlocked) return true;
  return ctx.role === "engineer" && r.status === "engineer_checked";
}

export function reportDisabled(ctx: BarCtx): boolean {
  return ctx.record === null || ctx.loading || ctx.complete || ctx.stale || ctx.drawerOpen;
}

export const sendDisabled = (ctx: BarCtx) => ctx.stale;
```

Create `web/components/review/desk/advance.ts`:

```ts
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { DisplayStatus, ReviewerRole } from "@/lib/review-types";

export type AdvanceRow = { conceptId: string; name: string; index: number; status: DisplayStatus };

/** §5.9: what still needs this role's review. An engineer's own check is done for engineers. */
export function needsFor(role: ReviewerRole, status: DisplayStatus): boolean {
  return status === "pending" || status === "back_in_review" || (role === "pharmacist" && status === "engineer_checked");
}

export type Advance =
  | { kind: "complete"; switchView: boolean; announce: string }
  | { kind: "stay"; announce: string }
  | { kind: "open"; target: AdvanceRow; clearFilter: boolean; announce: string };

/** §5.9 after a successful commit. `all` is every current record by index; statuses already include the save. */
export function advance(a: { role: ReviewerRole; committedId: string; openId: string | null; reportOpen: boolean;
    visible: AdvanceRow[]; all: AdvanceRow[]; batchId: string; saved: string }): Advance {
  if (a.all.length > 0 && a.all.every((r) => r.status === "approved"))
    return { kind: "complete", switchView: a.openId === a.committedId, announce: `${a.saved} ${fill(DESK.allApproved, { id: a.batchId })}` };
  if (a.openId !== a.committedId || a.reportOpen) return { kind: "stay", announce: a.saved };
  const after = (list: AdvanceRow[]) => {
    const k = list.findIndex((r) => r.conceptId === a.committedId);
    for (let j = 1; j <= list.length; j++) {
      const r = list[((k < 0 ? -1 : k) + j) % list.length];
      if (r.conceptId !== a.committedId && needsFor(a.role, r.status)) return r;
    }
    return null;
  };
  const inView = after(a.visible);
  const target = inView ?? after(a.all);
  if (!target) return { kind: "stay", announce: `${a.saved} ${DESK.noneLeft}` };
  return { kind: "open", target, clearFilter: inView === null,
    announce: `${a.saved} ${fill(DESK.opened, { name: target.name, k: target.index, n: a.all.length })}` };
}
```

Create `web/components/review/desk/keys.ts`:

```ts
/** §5.14 keyboard model as a pure mapping from a key event and its context to one desk action. */
export type KeyTarget = "note" | "approve" | "search" | "listbox" | "field" | "other";
export type KeyAction = "approve" | "undo" | "report" | "next" | "prev" | "first" | "last" | "evidence" | "source" | "sheet"
  | "closeSheet" | "closeDrawer" | "closeReport" | "clearSearch" | "sendReport" | "enterBlocked";

export const IS_MAC_RE = /Mac|iPhone|iPad/;

const LETTERS: Record<string, KeyAction> = { a: "approve", u: "undo", r: "report", j: "next", k: "prev", e: "evidence", s: "source" };
const LIST: Record<string, KeyAction> = { ArrowDown: "next", ArrowUp: "prev", Home: "first", End: "last" };

export function keyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
    ctx: { singleKeys: boolean; sheetOpen: boolean; target: KeyTarget; searchHasText: boolean; drawerOpen: boolean; reportOpen: boolean }):
    KeyAction | null {
  if (ctx.sheetOpen) {
    if (e.key === "Escape") return "closeSheet";
    if (e.key === "?" && ctx.singleKeys) return "closeSheet";
    return null;
  }
  if (e.key === "Enter" && ctx.target === "approve") return "enterBlocked";
  if (ctx.target === "note") {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return "sendReport";
    if (e.key === "Escape") return "closeReport";
    return null;
  }
  if (e.key === "Escape") {
    if (ctx.drawerOpen) return "closeDrawer";
    if (ctx.reportOpen) return "closeReport";
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
  if (el.getAttribute("data-desk") === "note") return "note";
  if (el.getAttribute("data-desk") === "approve") return "approve";
  if (el.getAttribute("data-desk") === "search") return "search";
  if (el.getAttribute("role") === "listbox") return "listbox";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable) return "field";
  return "other";
}
```

Create `web/components/review/desk/row-hint.ts`:

```ts
import { DESK_NEW } from "@/lib/copy";
import { DESK, plural } from "@/lib/review-copy";
import type { ItemHint } from "@/lib/review-types";

/** §5.4 row hint: the first rule that applies wins. */
export function rowHint(h: ItemHint, s: { netErr: "no" | "unknown" | null; stale: boolean }):
    { text: string; tone: "warn" | "nodata" | null } {
  if (s.netErr === "no") return { text: DESK.hintNotSaved, tone: "warn" };
  if (s.netErr === "unknown") return { text: DESK_NEW.decisionUnconfirmed.rowHint, tone: "warn" };
  if (s.stale) return { text: DESK.hintChanged, tone: "warn" };
  if (h.noData) return { text: DESK.hintNoData, tone: "nodata" };
  if (h.notRun) return { text: DESK_NEW.notRun.rowHint, tone: "warn" };
  if (h.failed > 0) return { text: `${h.failed} ${plural(h.failed, "check failed", "checks failed")}`, tone: "warn" };
  if (h.warnings > 0) {
    const pairs = h.pairsWithoutText > 0 ? `, ${h.pairsWithoutText} ${plural(h.pairsWithoutText, "pair", "pairs")} without text` : "";
    return { text: `${h.warnings} ${plural(h.warnings, "check warning", "check warnings")}${pairs}`, tone: "warn" };
  }
  return { text: DESK.hintAllOk, tone: null };
}
```

Create `web/components/review/desk/poll.ts`:

```ts
import type { Version, VersionRow } from "@/lib/review-types";

export const POLL_MS = 20_000;
export type PollVerdict = { kind: "rows"; rows: VersionRow[] } | { kind: "signedOut" } | { kind: "forbidden" } | { kind: "ignore" };

const isRow = (x: unknown): x is VersionRow => typeof x === "object" && x !== null && typeof (x as VersionRow).conceptId === "string"
  && "extractedAt" in x && "lastDecisionId" in x && typeof (x as VersionRow).displayStatus === "string";

/**
 * §5.11 and Review Focus 3: only a readable list changes anything. A dropped connection (null), a 429, a 5xx or a body
 * that is not the list is ignored and the 20 s poll carries on; a 401 means the session ended.
 */
export async function pollVerdict(res: Response | null): Promise<PollVerdict> {
  if (res === null) return { kind: "ignore" };
  if (res.status === 401) return { kind: "signedOut" };
  if (res.status === 403) return { kind: "forbidden" };
  if (!res.ok) return { kind: "ignore" };
  try {
    const body: unknown = await res.json();
    return Array.isArray(body) && body.every(isRow) ? { kind: "rows", rows: body } : { kind: "ignore" };
  } catch {
    return { kind: "ignore" };
  }
}

/** The open record's row (null when it left the batch) and whether any other row changed, appeared or disappeared. */
export function compareRows(known: { conceptId: string; version: Version; displayStatus: string }[], rows: VersionRow[],
    openId: string | null): { open: VersionRow | null; othersChanged: boolean } {
  const byId = new Map(rows.map((r) => [r.conceptId, r]));
  const others = known.filter((k) => k.conceptId !== openId);
  const otherRows = rows.filter((r) => r.conceptId !== openId);
  const othersChanged = otherRows.length !== others.length || others.some((k) => {
    const r = byId.get(k.conceptId);
    return !r || r.extractedAt !== k.version.extractedAt || r.lastDecisionId !== k.version.lastDecisionId || r.displayStatus !== k.displayStatus;
  });
  return { open: openId === null ? null : byId.get(openId) ?? null, othersChanged };
}
```

Create `web/components/review/desk/hrefs.ts`:

```ts
import type { FilterKey } from "@/lib/review-types";

const enc = encodeURIComponent;

/** /review/{b}/{c}?show=&q=&pane= with defaults left out, so every row and Previous/Next link carries the filter. */
export function recordHref(batchId: string, conceptId: string, opts: { show?: FilterKey; q?: string; pane?: "list" } = {}): string {
  const params = new URLSearchParams();
  if (opts.show && opts.show !== "all") params.set("show", opts.show);
  if (opts.q && opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.pane) params.set("pane", opts.pane);
  const query = params.toString();
  return `/review/${enc(batchId)}/${enc(conceptId)}${query ? `?${query}` : ""}`;
}
export const batchHref = (batchId: string) => `/review/${enc(batchId)}`;
export const versionsHref = (batchId: string) => `/review/${enc(batchId)}/versions`;
export const signInHref = (returnTo: string) => `/signin?${new URLSearchParams({ returnTo })}`;

/** True for a record page of this batch: in-desk navigation that keeps the undo window (§5.8.1). */
export function isDeskPath(pathname: string, batchId: string): boolean {
  const prefix = `${batchHref(batchId)}/`;
  return pathname.startsWith(prefix) && pathname.length > prefix.length && pathname !== versionsHref(batchId);
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/bar-state.test.ts tests/advance.test.ts tests/desk-keymap.test.ts tests/row-hint.test.ts tests/poll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/review/desk/bar-state.ts web/components/review/desk/advance.ts web/components/review/desk/keys.ts \
  web/components/review/desk/row-hint.ts web/components/review/desk/poll.ts web/components/review/desk/hrefs.ts \
  web/tests/bar-state.test.ts web/tests/advance.test.ts web/tests/desk-keymap.test.ts web/tests/row-hint.test.ts web/tests/poll.test.ts
git commit -m "feat(web): desk promise, hints, auto-advance, keymap, row hints and poll verdicts as pure modules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Web — the desk's server actions: decide, the native-POST confirm flow, audit and diff (§5.8, §5.8.6, §5.15)

**Files:**
- Create: `web/lib/audit-once.ts`, `web/lib/desk-core.ts`, `web/lib/desk-actions.ts`
- Test: `web/tests/desk-actions.test.ts`

**Interfaces:**
- Consumes: `getSession`, `type Session` (P1A Task 11); `isReviewer` (P0 Task 10); `allowAccountAction` (P1A Task 12); `verifyTurnstile(token, ip, "decision")`, `TURNSTILE_RESPONSE_FIELD` (P1A Task 16); `clientIp` (existing); `recordAudit` (P1A Task 18: `AuditInput.targetType` is `"batch_item" | "flag" | null`); `requestId(): Promise<string>` from `@/lib/request-id` (P1A Task 18, server-only: the middleware's `x-request-id`); `logRequest({ route, method, status, ms, requestId })` from `@/lib/request-log` (P1A Task 25: server actions log with an `action:` route name); `postDeskDecision`, `getReviewDiff` (Task 7); `DecideCode`, `DecideResultLike` (Task 10); `recordHref`, `signInHref` (Task 11); `DeskOutcome`, `DiffRow` (Task 7).
- Produces:
  - `lib/audit-once.ts` (server-only): `createOnce(ttlMs: number, now?: () => number): (key: string) => boolean`, `AUDIT_ONCE` (10 minutes, shared).
  - `lib/desk-core.ts` (server-only): `type DecideInput = { batchId; conceptId; decision: "ok" | "issue"; note; extractedAt: string | null; expectedLastDecisionId: number | null; requestId; turnstileToken }`; `type DecideResult = DecideResultLike`; `runDecide(input: unknown): Promise<DecideResult>` (writes `decision_denied` itself, outcome `unauthenticated` | `forbidden` | `rate_limited` | `captcha`, as P1A Task 18's legacy `submitReview` does: target `batch_item` `{batchId}/{conceptId}` when both ids are valid and `batchId.length + conceptId.length < 200` (P1A Task 17's `TARGET_ID_MAX`), else no target; an audit outage never changes the answer); `conflictCode(field: string | null, message: string): DecideCode`; `decideStatus(r: DecideResult): number` (200 ok, 400 invalid, 401 unauthenticated, 403 forbidden and captcha, 404 removed, 429 rate_limited, 502 failed, 409 every other code); `logAction(route: "action:decide" | "action:decide-form", status: number, started: number): Promise<void>` (P1A's `logRequest` line, method `POST`, the web request id; never a note, an email or another form field); `runDecideLogged(route, input: unknown): Promise<DecideResult>` (`runDecide` plus one `logAction` line); `logOpen(kind: "review_open" | "evidence_open", batchId: unknown, conceptId: unknown): Promise<void>`; `logOpenOnRender(batchId, conceptId, h: Headers): Promise<void>` (skips `Next-Router-Prefetch: 1` and `Purpose: prefetch`); `diffRows(batchId: unknown, conceptId: unknown, from: unknown): Promise<DiffRow[] | null>`.
  - `lib/desk-actions.ts` (`"use server"`; the only exports are endpoints): `decide(input: DecideInput): Promise<DecideResult>` (logs `action:decide`), `decideFormAction(formData: FormData): Promise<void>` (logs one `action:decide-form` line per POST: 400 for unusable ids, 303 for the confirm step, else `decideStatus` of the save), `logRecordOpen(batchId: string, conceptId: string): Promise<void>`, `logEvidence(batchId: string, conceptId: string): Promise<void>`, `loadDiff(batchId: string, conceptId: string, from: string): Promise<DiffRow[] | null>`.
  - Confirm URL (§5.8.6): `/review/{b}/{c}?confirm={c}&x={extractedAt|""}&d={lastDecisionId|""}&r={requestId}[&e={code}]`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/desk-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const allowAccountAction = vi.fn((_k: string, _e: string) => true);
const verifyTurnstile = vi.fn(async (_t: unknown, _ip: unknown, _a: string) => true);
const postDeskDecision = vi.fn();
const getReviewDiff = vi.fn();
const recordAudit = vi.fn(async (_e: unknown) => true);
const headerMap = new Map<string, string>([["x-forwarded-for", "203.0.113.9"]]);
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/limits", () => ({ allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) }));
vi.mock("@/lib/turnstile", () => ({ TURNSTILE_RESPONSE_FIELD: "cf-turnstile-response",
  verifyTurnstile: (t: unknown, ip: unknown, a: string) => verifyTurnstile(t, ip, a) }));
vi.mock("@/lib/api", () => ({ postDeskDecision: (...a: unknown[]) => postDeskDecision(...a), getReviewDiff: (...a: unknown[]) => getReviewDiff(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));
const WEB_RID = "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f";   // the middleware's x-request-id, not the desk's idempotency id
vi.mock("@/lib/request-id", () => ({ requestId: async () => WEB_RID }));
vi.mock("next/headers", () => ({ headers: async () => new Headers([...headerMap]) }));
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import { conflictCode, decideStatus, runDecide } from "@/lib/desk-core";
import { decide, decideFormAction, loadDiff, logEvidence, logRecordOpen } from "@/lib/desk-actions";

const PHARMACIST = { email: "pharm@e2e.test", name: "P", role: "pharmacist" as const };
const RID = "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22";
const input = (over = {}) => ({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", decision: "ok", note: "",
  extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: 41, requestId: RID, turnstileToken: "tok", ...over });
const OUTCOME = { review: "ok", displayStatus: "approved", batchStatus: "in_review",
  version: { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: 42 }, replayed: false };

beforeEach(() => {
  for (const f of [getSession, allowAccountAction, verifyTurnstile, postDeskDecision, getReviewDiff, recordAudit, redirect]) f.mockClear();
  recordAudit.mockResolvedValue(true);
  getSession.mockResolvedValue(PHARMACIST);
  allowAccountAction.mockReturnValue(true);
  verifyTurnstile.mockResolvedValue(true);
  postDeskDecision.mockResolvedValue({ ok: true, data: OUTCOME });
});

describe("decide (§5.8, §7.2, §9.3)", () => {
  it("saves with the session's own email and role, the viewed version and the requestId", async () => {
    expect(await runDecide({ ...input(), reviewerEmail: "forged@x.org", reviewerRole: "pharmacist" })).toEqual({ ok: true, outcome: OUTCOME });
    expect(postDeskDecision).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", { decision: "ok", note: "",
      reviewerEmail: "pharm@e2e.test", reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00.123456Z",
      expectedLastDecisionId: 41, requestId: RID });
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "203.0.113.9", "decision");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("no session is unauthenticated, audited without an email; a reader is forbidden", async () => {
    getSession.mockResolvedValue(null);
    expect(await runDecide(input())).toEqual({ ok: false, code: "unauthenticated" });
    expect(recordAudit).toHaveBeenCalledWith({ event: "decision_denied", outcome: "unauthenticated", actorEmail: null, actorRole: null,
      targetType: "batch_item", targetId: "0001-pilot/186-0030-006--napa" });
    getSession.mockResolvedValue({ email: "reader@e2e.test", name: "", role: "user" });
    expect(await runDecide(input())).toEqual({ ok: false, code: "forbidden" });
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "forbidden", actorEmail: "reader@e2e.test", actorRole: "user" }));
    expect(postDeskDecision).not.toHaveBeenCalled();
  });

  it("over 60 a minute is rate_limited, audited, with no bot check and no API call", async () => {
    allowAccountAction.mockReturnValue(false);
    expect(await runDecide(input())).toEqual({ ok: false, code: "rate_limited" });
    expect(allowAccountAction).toHaveBeenCalledWith("decision", "pharm@e2e.test");
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ event: "decision_denied", outcome: "rate_limited" }));
  });

  it("a failed bot check is captcha, audited", async () => {
    verifyTurnstile.mockResolvedValue(false);
    expect(await runDecide(input())).toEqual({ ok: false, code: "captcha" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "captcha", actorRole: "pharmacist" }));
    expect(postDeskDecision).not.toHaveBeenCalled();
  });

  it("decision_denied has no target when the ids are unusable, and an audit outage never changes the answer (as P1A's submitReview)", async () => {
    getSession.mockResolvedValue(null);
    await runDecide(input({ batchId: "" }));
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "decision_denied", outcome: "unauthenticated", actorEmail: null, actorRole: null,
      targetType: null, targetId: null });
    getSession.mockResolvedValue(PHARMACIST);
    allowAccountAction.mockReturnValue(false);
    recordAudit.mockRejectedValue(new Error("audit API down"));
    expect(await runDecide(input())).toEqual({ ok: false, code: "rate_limited" });
  });

  it("decision_denied has no target when batchId/conceptId would pass the audit's 200-character targetId limit (as P1A's denyDecision)", async () => {
    getSession.mockResolvedValue(null);
    await runDecide(input({ batchId: "b".repeat(150), conceptId: "c".repeat(150) }));
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "decision_denied", outcome: "unauthenticated", actorEmail: null, actorRole: null,
      targetType: null, targetId: null });
    await runDecide(input({ batchId: "b".repeat(100), conceptId: "c".repeat(99) }));
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ targetType: "batch_item",
      targetId: `${"b".repeat(100)}/${"c".repeat(99)}` }));
  });

  it.each([
    [{ requestId: "nope" }], [{ decision: "maybe" }], [{ batchId: "" }], [{ conceptId: "x".repeat(201) }],
    [{ extractedAt: 12 }], [{ expectedLastDecisionId: -1 }], [{ expectedLastDecisionId: 1.5 }], [{ note: "n".repeat(1001) }],
    [{ decision: "issue", note: "abcd" }], [{ decision: "issue", note: "😀😀😀😀" }], [{ turnstileToken: 5 }],
  ])("refuses malformed input %j without calling anything", async (over) => {
    expect(await runDecide(input(over))).toEqual({ ok: false, code: "invalid" });
    expect(postDeskDecision).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("an issue of 5 characters is accepted", async () => {
    await runDecide(input({ decision: "issue", note: "  😀😀😀😀😀  " }));
    expect(postDeskDecision.mock.calls[0][2].note).toBe("😀😀😀😀😀");
  });

  it("maps every 409 field, a 400, a 404 and a failure", async () => {
    for (const [field, message, code] of [
      ["extractedAt", "x", "stale_rerun"], ["lastDecisionId", "x", "stale_decision"], ["stages", "x", "stage_failed"],
      ["conceptId", "x", "removed"],
      ["review", "An issue is open on this record. It returns to review after the fix and re-run.", "issue_open"],
      ["review", "This record is already approved by a pharmacist", "already_approved"],
      ["review", "Your check is already recorded for this record", "already_checked"],
    ] as const) {
      expect(conflictCode(field, message)).toBe(code);
      postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: message, field });
      expect(await runDecide(input())).toEqual({ ok: false, code });
    }
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 400, error: "x", field: "note" });
    expect(await runDecide(input())).toEqual({ ok: false, code: "invalid" });
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 404, error: "x", field: "conceptId" });
    expect(await runDecide(input())).toEqual({ ok: false, code: "removed" });
    for (const status of [0, 500, 502]) {
      postDeskDecision.mockResolvedValueOnce({ ok: false, status, error: "x", field: null });
      expect(await runDecide(input())).toEqual({ ok: false, code: "failed" });
    }
  });
});

describe("decideFormAction, the native POST without the island (§5.8.6)", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ batchId: "0001-pilot", conceptId: "napa", decision: "ok",
      extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: "", requestId: RID, "cf-turnstile-response": "tok", ...fields }))
      fd.set(k, v);
    return fd;
  };

  it("the first POST (Enter or the button) never saves: it redirects to the confirm page with the version it was sent", async () => {
    await expect(decideFormAction(form({}))).rejects.toThrow(
      "REDIRECT /review/0001-pilot/napa?confirm=napa&x=2026-10-12T09%3A00%3A00.123456Z&d=&r=" + RID);
    expect(postDeskDecision).not.toHaveBeenCalled();
  });

  it("Confirm posts commit=confirmed with the URL's version and saves once", async () => {
    await expect(decideFormAction(form({ commit: "confirmed", expectedLastDecisionId: "41" }))).rejects.toThrow("REDIRECT /review/0001-pilot/napa");
    expect(postDeskDecision.mock.calls[0][2]).toMatchObject({ extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: 41, requestId: RID });
  });

  it("a stale or refused confirm goes back to the confirm page with the code; an expired session goes to sign-in", async () => {
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "x", field: "extractedAt" });
    await expect(decideFormAction(form({ commit: "confirmed" }))).rejects.toThrow("&e=stale_rerun");
    verifyTurnstile.mockResolvedValueOnce(false);
    await expect(decideFormAction(form({ commit: "confirmed" }))).rejects.toThrow("&e=captcha");
    getSession.mockResolvedValueOnce(null);
    await expect(decideFormAction(form({ commit: "confirmed" }))).rejects.toThrow(
      "REDIRECT /signin?returnTo=%2Freview%2F0001-pilot%2Fnapa");
  });

  it("an unusable batch or record id goes to /review", async () => {
    await expect(decideFormAction(form({ batchId: "" }))).rejects.toThrow("REDIRECT /review");
  });
});

describe("the action log line (§5.15, §9.7)", () => {
  const lines = (log: { mock: { calls: unknown[][] } }) => log.mock.calls.map((c) => JSON.parse(String(c[0])));

  it("maps every result to the status it is logged with", () => {
    expect(decideStatus({ ok: true, outcome: OUTCOME })).toBe(200);
    for (const [code, status] of [["invalid", 400], ["unauthenticated", 401], ["forbidden", 403], ["captcha", 403], ["removed", 404],
      ["rate_limited", 429], ["failed", 502], ["stale_rerun", 409], ["stale_decision", 409], ["issue_open", 409], ["already_approved", 409],
      ["already_checked", 409], ["stage_failed", 409]] as const) expect(decideStatus({ ok: false, code })).toBe(status);
  });

  it("decide logs one action:decide line with the status and the web request id, never the note or an email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await decide(input({ decision: "issue", note: "Patient Rahim has a rash" }) as never);
    allowAccountAction.mockReturnValue(false);
    await decide(input() as never);
    expect(lines(log)).toEqual([
      { msg: "request", route: "action:decide", method: "POST", status: 200, ms: expect.any(Number), requestId: WEB_RID },
      { msg: "request", route: "action:decide", method: "POST", status: 429, ms: expect.any(Number), requestId: WEB_RID }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Rahim|pharm@/);
    log.mockRestore();
  });

  it("decideFormAction logs one action:decide-form line per POST: 303 for the confirm step, then the save's status", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fd = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ batchId: "0001-pilot", conceptId: "napa", decision: "ok", extractedAt: "",
        expectedLastDecisionId: "", requestId: RID, "cf-turnstile-response": "tok", ...fields })) f.set(k, v);
      return f;
    };
    await decideFormAction(fd({})).catch(() => {});
    await decideFormAction(fd({ commit: "confirmed" })).catch(() => {});
    await decideFormAction(fd({ batchId: "" })).catch(() => {});
    expect(lines(log).map((l) => [l.route, l.status, l.requestId])).toEqual([
      ["action:decide-form", 303, WEB_RID], ["action:decide-form", 200, WEB_RID], ["action:decide-form", 400, WEB_RID]]);
    log.mockRestore();
  });
});

describe("audit of reads (§5.15)", () => {
  it("review_open and evidence_open at most once per actor, record and 10 minutes, reviewers only", async () => {
    await logRecordOpen("0001-pilot", "audit-a");
    await logRecordOpen("0001-pilot", "audit-a");
    await logEvidence("0001-pilot", "audit-a");
    expect(recordAudit.mock.calls.map((c) => (c[0] as { event: string }).event)).toEqual(["review_open", "evidence_open"]);
    expect(recordAudit).toHaveBeenCalledWith({ event: "review_open", outcome: "shown", actorEmail: "pharm@e2e.test",
      actorRole: "pharmacist", targetType: "batch_item", targetId: "0001-pilot/audit-a" });
    getSession.mockResolvedValue({ email: "reader@e2e.test", name: "", role: "user" });
    await logRecordOpen("0001-pilot", "audit-b");
    expect(recordAudit).toHaveBeenCalledTimes(2);
  });

  it("review_open keeps its row but drops the target when the ids together reach 200 characters", async () => {
    await logRecordOpen("b".repeat(150), "c".repeat(150));
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "review_open", outcome: "shown", actorEmail: "pharm@e2e.test",
      actorRole: "pharmacist", targetType: null, targetId: null });
  });

  it("the diff is for reviewers only", async () => {
    getReviewDiff.mockResolvedValue({ from: "a", to: "b", reason: "rerun", rows: [{ field: "Trade name", before: "A", now: "B" }] });
    expect(await loadDiff("0001-pilot", "napa", "2026-10-12T09:00:00Z")).toEqual([{ field: "Trade name", before: "A", now: "B" }]);
    getSession.mockResolvedValue({ email: "reader@e2e.test", name: "", role: "user" });
    expect(await loadDiff("0001-pilot", "napa", "2026-10-12T09:00:00Z")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/desk-actions.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/desk-core"`.

- [ ] **Step 3: Write the modules**

Create `web/lib/audit-once.ts`:

```ts
import "server-only";

/** True the first time a key is seen in `ttlMs`, then false until it expires (§5.15 "at most one per … 10 minutes"). */
export function createOnce(ttlMs: number, now: () => number = Date.now, maxKeys = 50_000): (key: string) => boolean {
  const seen = new Map<string, number>();
  return (key: string) => {
    const t = now();
    const at = seen.get(key);
    if (at !== undefined && t - at < ttlMs) return false;
    seen.delete(key);
    seen.set(key, t);
    while (seen.size > maxKeys) seen.delete(seen.keys().next().value as string);
    return true;
  };
}

/** Shared by review_open and evidence_open; keys hold the account key, never the email itself. */
export const AUDIT_ONCE = createOnce(10 * 60_000);
```

Create `web/lib/desk-core.ts`:

```ts
import "server-only";
import { headers } from "next/headers";
import type { DecideCode, DecideResultLike } from "@/components/review/desk/commit-machine";
import { getReviewDiff, postDeskDecision } from "./api";
import { DESK_NEW } from "./copy";
import { recordAudit } from "./audit";
import { AUDIT_ONCE } from "./audit-once";
import { allowAccountAction } from "./limits";
import { accountKey, clientIp } from "./rate-limit";
import type { DiffRow } from "./review-types";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";
import { isReviewer } from "./reviewers";
import { getSession, type Session } from "./session";
import { verifyTurnstile } from "./turnstile";

/*
 * The decide action behind the desk (§5.8). In order: the session (none: unauthenticated; not a reviewer: forbidden),
 * input bounds, the per-account limit (§9.3), the bot check (action "decision"), then the API with the session's own
 * email and role, never values from the client. Every stop before the API is a decision_denied audit row (§5.15).
 * The only log line is P1A's request line (logAction): action name, status, duration, web request id. Emails and notes
 * are personal data and are never logged.
 */
export type DecideInput = {
  batchId: string; conceptId: string; decision: "ok" | "issue"; note: string; extractedAt: string | null;
  expectedLastDecisionId: number | null; requestId: string; turnstileToken: string;
};
export type DecideResult = DecideResultLike;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_MAX = 200, NOTE_MAX = 1000, ISSUE_MIN = 5, STAMP_MAX = 64, TOKEN_MAX = 2048;
const codePoints = (s: string) => [...s].length;
const validId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= ID_MAX;

// The API's 409 messages (DecisionGuard). The first one ends in a NEW_COPY sentence, so it is built from it: P1A's
// copy.test fails on a retyped NEW_COPY string, and DESK.issueOpen (Task 9) is the same sentence.
const REVIEW_REFUSALS: Record<string, DecideCode> = {
  [`An issue is open on this record. ${DESK_NEW.approvalRefused.promiseBody}`]: "issue_open",
  "This record is already approved by a pharmacist": "already_approved",
  "Your check is already recorded for this record": "already_checked",
};

/** A 409 from the decision endpoint, by its field (§7.2, §5.11). */
export function conflictCode(field: string | null, message: string): DecideCode {
  switch (field) {
    case "extractedAt": return "stale_rerun";
    case "lastDecisionId": return "stale_decision";
    case "stages": return "stage_failed";
    case "conceptId": return "removed";
    case "review": return REVIEW_REFUSALS[message] ?? "stale_decision";
    default: return "stale_rerun";
  }
}

function parse(x: unknown): DecideInput | null {
  if (typeof x !== "object" || x === null) return null;
  const i = x as Record<string, unknown>;
  if (!validId(i.batchId) || !validId(i.conceptId)) return null;
  if (i.decision !== "ok" && i.decision !== "issue") return null;
  if (typeof i.note !== "string") return null;
  const note = i.note.trim();
  if (codePoints(note) > NOTE_MAX || (i.decision === "issue" && codePoints(note) < ISSUE_MIN)) return null;
  if (i.extractedAt !== null && (typeof i.extractedAt !== "string" || i.extractedAt.length === 0 || i.extractedAt.length > STAMP_MAX)) return null;
  const last = i.expectedLastDecisionId;
  if (last !== null && (typeof last !== "number" || !Number.isSafeInteger(last) || last < 1)) return null;
  if (typeof i.requestId !== "string" || !UUID_RE.test(i.requestId)) return null;
  if (typeof i.turnstileToken !== "string" || i.turnstileToken.length > TOKEN_MAX) return null;
  return { batchId: i.batchId, conceptId: i.conceptId, decision: i.decision, note, extractedAt: i.extractedAt as string | null,
    expectedLastDecisionId: last as number | null, requestId: i.requestId, turnstileToken: i.turnstileToken };
}

/**
 * The audit target `{batchId}/{conceptId}`, or null. P1A Task 17's AuditService refuses a targetId over 200 characters
 * (TARGET_ID_MAX, 400 field=targetId), and recordAudit is best effort, so a longer target would silently lose the row;
 * the same bound as P1A Task 18's denyDecision (batchId.length + conceptId.length < ID_MAX) keeps the row, without a target.
 */
function targetId(batchId: unknown, conceptId: unknown): string | null {
  return validId(batchId) && validId(conceptId) && batchId.length + conceptId.length < ID_MAX ? `${batchId}/${conceptId}` : null;
}

function targetOf(x: unknown): string | null {
  const i = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
  return targetId(i.batchId, i.conceptId);
}

/**
 * §5.15 decision_denied, written here: the outcomes P1A Task 18 defined for the legacy /batches review form.
 * The target is the batch item only when both ids are valid. Best effort: an audit outage never changes the answer.
 */
async function deny(outcome: "unauthenticated" | "forbidden" | "rate_limited" | "captcha", s: Session | null, target: string | null) {
  await recordAudit({ event: "decision_denied", outcome, actorEmail: s?.email ?? null, actorRole: s?.role ?? null,
    targetType: target ? "batch_item" : null, targetId: target }).catch(() => false);
}

export async function runDecide(input: unknown): Promise<DecideResult> {
  const session = await getSession();
  const target = targetOf(input);
  if (!session) {
    await deny("unauthenticated", null, target);
    return { ok: false, code: "unauthenticated" };
  }
  if (!isReviewer(session) || (session.role !== "pharmacist" && session.role !== "engineer")) {
    await deny("forbidden", session, target);
    return { ok: false, code: "forbidden" };
  }
  const d = parse(input);
  if (!d) return { ok: false, code: "invalid" };
  if (!allowAccountAction("decision", session.email)) {
    await deny("rate_limited", session, target);
    return { ok: false, code: "rate_limited" };
  }
  if (!(await verifyTurnstile(d.turnstileToken, clientIp(await headers()), "decision"))) {
    await deny("captcha", session, target);
    return { ok: false, code: "captcha" };
  }
  const r = await postDeskDecision(d.batchId, d.conceptId, { decision: d.decision, note: d.note, reviewerEmail: session.email,
    reviewerRole: session.role, extractedAt: d.extractedAt, expectedLastDecisionId: d.expectedLastDecisionId, requestId: d.requestId });
  if (r.ok) return { ok: true, outcome: r.data };
  if (r.status === 409) return { ok: false, code: conflictCode(r.field, r.error) };
  if (r.status === 400) return { ok: false, code: "invalid" };
  if (r.status === 404) return { ok: false, code: "removed" };
  return { ok: false, code: "failed" };
}

/** The status a decide result is logged with (§9.7 log line). */
export function decideStatus(r: DecideResult): number {
  if (r.ok) return 200;
  switch (r.code) {
    case "invalid": return 400;
    case "unauthenticated": return 401;
    case "forbidden": case "captcha": return 403;
    case "removed": return 404;
    case "rate_limited": return 429;
    case "failed": return 502;
    default: return 409;
  }
}

/** P1A Task 25's log line for a desk server action: name, status, duration and the web request id, never a form field. */
export async function logAction(route: "action:decide" | "action:decide-form", status: number, started: number): Promise<void> {
  logRequest({ route, method: "POST", status, ms: performance.now() - started, requestId: await requestId() });
}

/** runDecide plus its one log line. */
export async function runDecideLogged(route: "action:decide" | "action:decide-form", input: unknown): Promise<DecideResult> {
  const started = performance.now();
  const result = await runDecide(input);
  await logAction(route, decideStatus(result), started);
  return result;
}

/** review_open (the record is shown as the open record) and evidence_open (drawer opened), §5.15. */
export async function logOpen(kind: "review_open" | "evidence_open", batchId: unknown, conceptId: unknown): Promise<void> {
  if (!validId(batchId) || !validId(conceptId)) return;
  const session = await getSession();
  if (!session || !isReviewer(session)) return;
  if (!AUDIT_ONCE(`${kind}|${accountKey(session.email)}|${batchId}/${conceptId}`)) return;
  const target = targetId(batchId, conceptId);   // null past 200 characters: the row is kept, without a target
  await recordAudit({ event: kind, outcome: "shown", actorEmail: session.email, actorRole: session.role,
    targetType: target ? "batch_item" : null, targetId: target });
}

/** Without JavaScript the record page render is the "shown" moment; prefetches never are (§5.15). */
export async function logOpenOnRender(batchId: string, conceptId: string, h: Headers): Promise<void> {
  if (h.get("next-router-prefetch") === "1" || h.get("purpose") === "prefetch") return;
  await logOpen("review_open", batchId, conceptId);
}

/** "See what changed" (§5.11): the diff rows from the page's stamp to now, reviewers only. */
export async function diffRows(batchId: unknown, conceptId: unknown, from: unknown): Promise<DiffRow[] | null> {
  if (!validId(batchId) || !validId(conceptId) || typeof from !== "string" || from.length === 0 || from.length > STAMP_MAX) return null;
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;
  try {
    return (await getReviewDiff(batchId, conceptId, from))?.rows ?? null;
  } catch {
    return null;
  }
}
```

Create `web/lib/desk-actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { recordHref, signInHref } from "@/components/review/desk/hrefs";
import { decideStatus, diffRows, logAction, logOpen, runDecide, runDecideLogged, type DecideInput, type DecideResult } from "./desk-core";
import type { DiffRow } from "./review-types";

/*
 * Server actions of the review desk. Every export of a "use server" module is a callable endpoint, so this file exports
 * only these five. The checks live in desk-core (server-only); this module has no "server-only" import of its own, so
 * the desk island may import it (scripts/check-client-islands.mjs).
 */

/** The island's commit and report, sent when the undo window closes (§5.8.1) or when a report is sent (§5.10). */
export async function decide(input: DecideInput): Promise<DecideResult> {
  return runDecideLogged("action:decide", input);
}

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/**
 * §5.8.6, when the island did not load: the first POST (the button, or Enter) never saves; it redirects to a confirm
 * page that carries the version the reviewer submitted from. Only a second POST with commit=confirmed (or the island's
 * commit=deferred) saves, with the x, d and r values that page carried.
 */
export async function decideFormAction(formData: FormData): Promise<void> {
  const started = performance.now();   // one action:decide-form log line per POST (§5.15, §9.7)
  const batchId = field(formData, "batchId"), conceptId = field(formData, "conceptId");
  if (!batchId || !conceptId || batchId.length > 200 || conceptId.length > 200) {
    await logAction("action:decide-form", 400, started);
    redirect("/review");
  }
  const back = recordHref(batchId, conceptId);
  const x = field(formData, "extractedAt"), d = field(formData, "expectedLastDecisionId"), r = field(formData, "requestId");
  const confirmUrl = (e?: string) => `${back}?${new URLSearchParams({ confirm: conceptId, x, d, r, ...(e ? { e } : {}) })}`;
  const commit = field(formData, "commit");
  if (commit !== "confirmed" && commit !== "deferred") {
    await logAction("action:decide-form", 303, started);
    redirect(confirmUrl());
  }
  const result = await runDecide({ batchId, conceptId, decision: "ok", note: "", extractedAt: x || null,
    expectedLastDecisionId: /^[1-9][0-9]{0,14}$/.test(d) ? Number(d) : d === "" ? null : -1, requestId: r,
    turnstileToken: field(formData, "cf-turnstile-response") });
  await logAction("action:decide-form", decideStatus(result), started);
  if (result.ok) redirect(back);
  if (result.code === "unauthenticated") redirect(signInHref(back));
  redirect(confirmUrl(result.code));
}

export async function logRecordOpen(batchId: string, conceptId: string): Promise<void> {
  await logOpen("review_open", batchId, conceptId);
}

export async function logEvidence(batchId: string, conceptId: string): Promise<void> {
  await logOpen("evidence_open", batchId, conceptId);
}

export async function loadDiff(batchId: string, conceptId: string, from: string): Promise<DiffRow[] | null> {
  return diffRows(batchId, conceptId, from);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/desk-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/audit-once.ts web/lib/desk-core.ts web/lib/desk-actions.ts web/tests/desk-actions.test.ts
git commit -m "feat(web): desk decide action, native-POST confirm flow, read audit and diff action

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Web — `/review/[batchId]/versions` (§4.3, §5.11)

**Files:**
- Create: `web/app/review/[batchId]/versions/route.ts`
- Test: `web/tests/versions-route.test.ts`

**Interfaces:**
- Consumes: `getSession`, `isReviewer`, `getReviewVersions` (Task 7); `withRequestLog(route, handler: (request: Request) => Promise<Response>)` from `@/lib/request-log` (P1A Task 25: route handlers are wrapped so each request logs one line; `/review/[batchId]/versions` is already in P1A's `DYNAMIC_ROUTES`). The per-account limit (1 per 5 s, burst 3) is already applied by P1A's middleware to `/review/*/versions`.
- Produces: `export const GET = withRequestLog("/review/[batchId]/versions", handle)`, the way P1A exports `/api/session` and `/signout`. The wrapper passes only the request, so `handle` reads the batch id from the URL path (a malformed percent-encoding is a 404). `GET /review/{batchId}/versions` → 200 JSON `[{conceptId, extractedAt, lastDecisionId, displayStatus}]` (no other field) with `Cache-Control: private, no-store`; 401 `{errors:[{code:"UNAUTHORIZED"}]}` without a session; 403 `{errors:[{code:"FORBIDDEN"}]}` for a reader; 404 for an unknown batch; 502 when the API fails.

- [ ] **Step 1: Write the failing test**

Create `web/tests/versions-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getReviewVersions = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ getReviewVersions: (b: string) => getReviewVersions(b) }));

import { GET } from "@/app/review/[batchId]/versions/route";

const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const get = (path: string) => GET(new Request(`http://localhost${path}`, { headers: { "x-request-id": RID } }));
const call = (batchId = "0001-pilot") => get(`/review/${encodeURIComponent(batchId)}/versions`);
beforeEach(() => { getSession.mockReset(); getReviewVersions.mockReset(); });

describe("GET /review/[batchId]/versions", () => {
  it("returns only the version fields, privately", async () => {
    getSession.mockResolvedValue({ email: "pharm@e2e.test", role: "pharmacist", name: "" });
    getReviewVersions.mockResolvedValue([{ conceptId: "a", extractedAt: "t", lastDecisionId: 3, displayStatus: "pending", extra: "x" }]);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual([{ conceptId: "a", extractedAt: "t", lastDecisionId: 3, displayStatus: "pending" }]);
  });

  it("401 without a session, 403 for a reader, and the API is never called", async () => {
    getSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    getSession.mockResolvedValue({ email: "reader@e2e.test", role: "user", name: "" });
    expect((await call()).status).toBe(403);
    expect(getReviewVersions).not.toHaveBeenCalled();
  });

  it("404 for an unknown batch and 502 when the API fails", async () => {
    getSession.mockResolvedValue({ email: "eng@e2e.test", role: "engineer", name: "" });
    getReviewVersions.mockResolvedValue(null);
    expect((await call("nope")).status).toBe(404);
    getReviewVersions.mockRejectedValue(new Error("API error 500"));
    expect((await call()).status).toBe(502);
  });

  it("reads the batch id from the path, decoded; a malformed encoding is a 404 with no API call", async () => {
    getSession.mockResolvedValue({ email: "eng@e2e.test", role: "engineer", name: "" });
    getReviewVersions.mockResolvedValue([]);
    await call("0001 pilot");
    expect(getReviewVersions).toHaveBeenCalledWith("0001 pilot");
    getReviewVersions.mockClear();
    expect((await get("/review/%E0%A4%A/versions")).status).toBe(404);
    expect(getReviewVersions).not.toHaveBeenCalled();
  });

  it("logs one request line with the route template and the request id, never the batch id or an email (P1A Task 25)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    getSession.mockResolvedValue(null);
    await call("0001-pilot");
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([{ msg: "request", route: "/review/[batchId]/versions",
      method: "GET", status: 401, ms: expect.any(Number), requestId: RID }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/0001-pilot|@e2e/);
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/versions-route.test.ts`
Expected: FAIL with `Failed to resolve import "@/app/review/[batchId]/versions/route"`.

- [ ] **Step 3: Write the route**

Create `web/app/review/[batchId]/versions/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getReviewVersions } from "@/lib/api";
import { withRequestLog } from "@/lib/request-log";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const error = (code: string, status: number) => NextResponse.json({ errors: [{ code }] }, { status, headers: NO_STORE });
const PATH = /^\/review\/([^/]+)\/versions\/?$/;

/** The [batchId] segment, decoded; null when the path is not this route or its encoding is malformed. */
function batchIdOf(request: Request): string | null {
  const m = PATH.exec(new URL(request.url).pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Version tokens for stale detection (§5.11): reviewers only, the four fields of each current item, nothing else (§4.3). */
async function handle(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return error("UNAUTHORIZED", 401);
  if (!isReviewer(session)) return error("FORBIDDEN", 403);
  const batchId = batchIdOf(request);
  if (batchId === null) return error("NOT_FOUND", 404);
  try {
    const rows = await getReviewVersions(batchId);
    if (rows === null) return error("NOT_FOUND", 404);
    return NextResponse.json(rows.map((r) => ({ conceptId: r.conceptId, extractedAt: r.extractedAt, lastDecisionId: r.lastDecisionId,
      displayStatus: r.displayStatus })), { headers: NO_STORE });
  } catch {
    return error("UNAVAILABLE", 502);
  }
}

// P1A Task 25: every route handler logs one line (route template, method, status, duration, request id).
export const GET = withRequestLog("/review/[batchId]/versions", handle);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/versions-route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "web/app/review/[batchId]/versions/route.ts" web/tests/versions-route.test.ts
git commit -m "feat(web): reviewer-only version tokens route for stale detection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Web — the review surface: legacy redirects, the anonymous gate, the not-authorised page and the reviewer toolbar (§2.3, §5.12, §5.16)

The root layout renders the public header, `<main>` and footer for every page; the review surface has its own chrome. The middleware therefore passes the pathname to the server as `x-pathname`, and the root layout leaves its chrome out under `/review`. Because Next keeps a root layout mounted across client-side navigations, every link between the public site and `/review` is a plain `<a>` (a document navigation); `app/review` and `components/review` never import `next/link` (pinned in Task 20).

**Files:**
- Create: `web/lib/surface.ts`, `web/app/review/layout.tsx`, `web/app/review/review.module.css`, `web/components/review/NotAuthorised.tsx`, `web/components/review/ReviewToolbar.tsx`, `web/components/review/ReviewAccount.tsx`, `web/components/review/desk/KeysSwitch.tsx`
- Modify: `web/lib/security-headers.ts`, `web/middleware.ts`, `web/app/layout.tsx`
- Test: `web/tests/surface.test.ts`, `web/tests/middleware-review.test.ts`, `web/tests/review-layout.test.tsx`

**Interfaces:**
- Consumes: `createMiddleware`, `nextWithSecurityHeaders` (P1A Tasks 13–14); `getSession`, `Session` (P1A); `isReviewer`, `ROLE_LABEL` (P0/existing); `Banner`, `buttonClass`, `Wordmark`, `Segmented` (P1A); `AccountMenu`, `ThemeSwitch`, `parseTheme`, `THEME_COOKIE`, `type Theme` (P1A); `DESK`, `DESK_NEW` (Task 9); `setDeskSettingAction`, `KEYS_COOKIE`, `parseKeys`, `deskCookieString`, `DESK_SETTINGS_EVENT` (Task 9); `signInHref` (Task 11); `listReviewBatches` (Task 7).
- Produces:
  - `lib/surface.ts` (pure): `isReviewSurface(pathname: string): boolean`; `legacyRedirect(url: URL): string | null` (§2.3: `/batches` → `/review`, `/batches/{id}` → `/review/{id}`, `/batches/{id}?item={c}` → `/review/{id}/{c}` with the outcome query dropped, `/flags` → `/review/flags`); `reviewGate(pathname: string, search: string, method: string, signedIn: boolean): string | null` (the `/signin?returnTo=…` target for an anonymous GET or HEAD of any `/review` page; never for `/versions` or a POST).
  - Middleware: 308 for the legacy routes, 307 for the anonymous gate; request header `x-pathname` on every request.
  - `app/review/layout.tsx`: a session with role `user` gets the not-authorised page (status 200); no session redirects (fallback to the middleware gate).
  - `ReviewToolbar({ session: Session; theme: Theme; batchId: string | null; center?: ReactNode })` (server) — `.chrome-toolbar.material`, wordmark "Review", role badge, account menu.
  - `ReviewAccount({ session: Session; theme: Theme; batchId: string | null; keys: KeysSetting; shortcutsItem: boolean })` (server) — the account menu content of §6.2 on `/review/*`.
  - `NotAuthorised({ session: Session; theme: Theme })` (server).
  - island part `KeysSwitch({ value: KeysSetting })` (`components/review/desk/KeysSwitch.tsx`, `"use client"`): the "Single-key shortcuts" form, enhanced like ThemeSwitch; dispatches `DESK_SETTINGS_EVENT` with `{ keys }`.
  - `newestInReview(batches: ReviewBatchSummary[]): string | null` exported from `components/review/ReviewAccount.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/surface.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isReviewSurface, legacyRedirect, reviewGate } from "@/lib/surface";

const u = (path: string) => new URL(`http://localhost${path}`);

describe("redirects from the current routes (§2.3)", () => {
  it.each([
    ["/batches", "/review"],
    ["/batches/", "/review"],
    ["/batches/0001-pilot", "/review/0001-pilot"],
    ["/batches/0001-pilot?review=saved&item=186-0030-006--napa", "/review/0001-pilot/186-0030-006--napa"],
    ["/batches/0001%20pilot?item=a%2Fb", "/review/0001%20pilot/a%2Fb"],
    ["/batches/0001-pilot?review=stale", "/review/0001-pilot"],
    ["/flags", "/review/flags"],
    ["/flags?resolve=resolved", "/review/flags"],
  ])("%s → %s", (from, to) => expect(legacyRedirect(u(from))).toBe(to));

  it.each(["/", "/batchesx", "/batches/a/b", "/flagsx", "/review", "/products/x"])("%s is not redirected", (p) => {
    expect(legacyRedirect(u(p))).toBeNull();
  });
});

describe("the anonymous gate (§2.3)", () => {
  it("sends an anonymous GET or HEAD of any /review page to sign-in, with the full return path", () => {
    expect(reviewGate("/review", "", "GET", false)).toBe("/signin?returnTo=%2Freview");
    expect(reviewGate("/review/0001-pilot/napa", "?show=needs&q=a", "HEAD", false))
      .toBe("/signin?returnTo=%2Freview%2F0001-pilot%2Fnapa%3Fshow%3Dneeds%26q%3Da");
  });

  it("leaves signed-in requests, POSTs (server actions), the versions route and other paths alone", () => {
    expect(reviewGate("/review/0001-pilot/napa", "", "GET", true)).toBeNull();
    expect(reviewGate("/review/0001-pilot/napa", "", "POST", false)).toBeNull();
    expect(reviewGate("/review/0001-pilot/versions", "", "GET", false)).toBeNull();
    expect(reviewGate("/reviewers", "", "GET", false)).toBeNull();
  });

  it("knows the review surface", () => {
    for (const p of ["/review", "/review/", "/review/flags", "/review/0001-pilot/napa"]) expect(isReviewSurface(p)).toBe(true);
    for (const p of ["/", "/reviews", "/search", "", "/signin"]) expect(isReviewSurface(p)).toBe(false);
  });
});
```

Create `web/tests/middleware-review.test.ts`:

```ts
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLimits } from "@/lib/limits";
import { encryptSession } from "@/lib/session-crypto";
import { createMiddleware } from "@/middleware";

const SECRET = "s".repeat(32);
beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());
const clock = () => Date.UTC(2026, 9, 12, 6, 0, 0);
const req = (path: string, init: { method?: string; cookie?: string } = {}) => new NextRequest(`http://localhost${path}`, {
  method: init.method ?? "GET", headers: { "x-forwarded-for": "203.0.113.9", ...(init.cookie ? { cookie: init.cookie } : {}) } });

describe("middleware on the review surface", () => {
  it("308s the legacy batch and flag routes", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const res = await mw(req("/batches/0001-pilot?review=saved&item=napa"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost/review/0001-pilot/napa");
    expect((await mw(req("/flags"))).headers.get("location")).toBe("http://localhost/review/flags");
  });

  it("307s an anonymous visitor to sign-in and lets a session through", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const anon = await mw(req("/review/0001-pilot/napa?show=needs"));
    expect(anon.status).toBe(307);
    expect(anon.headers.get("location")).toBe("http://localhost/signin?returnTo=%2Freview%2F0001-pilot%2Fnapa%3Fshow%3Dneeds");
    const cookie = `intellidrugs_session=${await encryptSession({ email: "reader@e2e.test", name: "", role: "user" }, SECRET)}`;
    expect((await mw(req("/review/0001-pilot/napa", { cookie }))).status).toBe(200);
  });

  it("passes the pathname to the server components", async () => {
    const res = await createMiddleware(createLimits(clock), clock)(req("/search?q=napa"));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/search");
  });

  it("logs its redirects through P1A's wrapper: the route template and status, never the query or the item id", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mw = createMiddleware(createLimits(clock), clock);
    await mw(req("/batches/0001-pilot?item=napa"));
    await mw(req("/review/0001-pilot/napa?q=warfarin"));
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0]))).map((l) => [l.route, l.status])).toEqual([
      ["/batches/[id]", 308], ["/review/[batchId]/[conceptId]", 307]]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/napa|warfarin/);
    log.mockRestore();
  });
});
```

Create `web/tests/review-layout.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const listReviewBatches = vi.fn(async () => []);
const headerMap = new Map<string, string>();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ listReviewBatches: () => listReviewBatches() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers([...headerMap]), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
const redirect = vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u), useRouter: () => ({}) }));

import RootLayout from "@/app/layout";
import ReviewLayout from "@/app/review/layout";

beforeEach(() => { getSession.mockReset(); headerMap.clear(); });

describe("the review layout gate (§2.3, §5.12)", () => {
  it("no session: redirect to sign-in (the middleware normally does this first)", async () => {
    getSession.mockResolvedValue(null);
    await expect(ReviewLayout({ children: <p>data</p> })).rejects.toThrow("REDIRECT /signin?returnTo=%2Freview");
  });

  it("a reader gets the not-authorised page, never the data, with their own email once", async () => {
    getSession.mockResolvedValue({ email: "someone@gmail.com", name: "Some One", role: "user" });
    const html = renderToStaticMarkup(await ReviewLayout({ children: <p>secret batch data</p> }));
    expect(html).not.toContain("secret batch data");
    expect(html).toContain("Your account can&#x27;t review this batch.");
    expect(html).toContain("Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account.");
    expect(html).toContain("This Google account isn&#x27;t on the reviewer list.");
    expect(html).toContain("You&#x27;re signed in as someone@gmail.com. Reviewer tools need the account your invite was sent to.");
    expect(html).toMatch(/<form action="\/signout" method="post"><input type="hidden" name="returnTo" value="\/review"\/><button type="submit" class="btn btn--tonal">Use another Google account<\/button><\/form>/);
    expect(html).toContain('<a class="btn btn--plain" href="/search">Search medicines</a>');
    expect(html.match(/someone@gmail\.com/g)).toHaveLength(2);   // the banner and the owner's own account menu
    expect(html).not.toContain("role-badge");
  });

  it("a reviewer gets the page", async () => {
    getSession.mockResolvedValue({ email: "pharm@e2e.test", name: "P", role: "pharmacist" });
    expect(renderToStaticMarkup(await ReviewLayout({ children: <p>desk</p> }))).toBe("<p>desk</p>");
  });
});

describe("the root layout leaves its chrome out on /review (x-pathname)", () => {
  it("public pages keep the header, main and footer; review pages do not", async () => {
    getSession.mockResolvedValue(null);
    headerMap.set("x-pathname", "/search");
    const site = renderToStaticMarkup(await RootLayout({ children: <p>page</p> }));
    expect(site).toContain("<header");
    expect(site).toContain('<main id="content"');
    headerMap.set("x-pathname", "/review/0001-pilot/napa");
    const review = renderToStaticMarkup(await RootLayout({ children: <p>desk</p> }));
    expect(review).not.toContain("<header");
    expect(review).not.toContain("<footer");
    expect(review).not.toContain('id="content"');
    expect(review).toContain("<p>desk</p>");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/surface.test.ts tests/middleware-review.test.ts tests/review-layout.test.tsx`
Expected: FAIL — `@/lib/surface` and `@/app/review/layout` do not resolve; the middleware answers 200 for `/batches/…`.

- [ ] **Step 3: Write the surface rules and wire the middleware**

Create `web/lib/surface.ts`:

```ts
/** Which surface a path belongs to, and the routing rules of spec §2.3. Pure; used by the middleware and the root layout. */

export function isReviewSurface(pathname: string): boolean {
  return pathname === "/review" || pathname.startsWith("/review/");
}

const BATCH = /^\/batches\/([^/]+)\/?$/;

/** §2.3 (308): /batches → /review, /batches/{id}[?item={c}] → /review/{id}[/{c}] (outcome query dropped), /flags → /review/flags. */
export function legacyRedirect(url: URL): string | null {
  const path = url.pathname;
  if (path === "/batches" || path === "/batches/") return "/review";
  if (path === "/flags" || path === "/flags/") return "/review/flags";
  const m = BATCH.exec(path);
  if (!m) return null;
  const item = url.searchParams.get("item");
  return item ? `/review/${m[1]}/${encodeURIComponent(item)}` : `/review/${m[1]}`;
}

const VERSIONS = /^\/review\/[^/]+\/versions$/;

/**
 * §2.3: anonymous access to any /review page redirects (307) to sign-in with the full return path. POSTs (server actions)
 * answer `unauthenticated` themselves, and the versions route answers 401, so the desk can show the signed-out block.
 */
export function reviewGate(pathname: string, search: string, method: string, signedIn: boolean): string | null {
  if (signedIn || !isReviewSurface(pathname) || VERSIONS.test(pathname)) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  return `/signin?${new URLSearchParams({ returnTo: pathname + search })}`;
}
```

In `web/lib/security-headers.ts`, in `nextWithSecurityHeaders`, after `headers.set("x-request-id", crypto.randomUUID());` add:

```ts
  // The root layout leaves the public chrome out on /review/* (it cannot read the path otherwise).
  headers.set("x-pathname", request.nextUrl.pathname);
```

In `web/middleware.ts` (P1A Task 25 renamed the inner function to `const handle = async (request: NextRequest): Promise<NextResponse> => {…}` and wrapped it in a logging `middleware`; both anchor lines below are unchanged inside `handle`, at four spaces, and both insertions go there, never into the outer wrapper, which then logs these 308s and 307s like P1A's 429s):
- add `import { legacyRedirect, reviewGate } from "@/lib/surface";`;
- directly after the per-IP check (`if (!limits.perIp.allow(ip)) return tooMany(1);`) add:

```ts
    const legacy = legacyRedirect(request.nextUrl);
    if (legacy) return NextResponse.redirect(new URL(legacy, request.url), 308);
```

- directly after `const account = email ? accountKey(email) : null;` add:

```ts
    const gate = reviewGate(path, request.nextUrl.search, request.method, email !== null);
    if (gate) return NextResponse.redirect(new URL(gate, request.url), 307);
```

- [ ] **Step 4: Write the root-layout switch, the review layout and its pages' chrome**

Replace `web/app/layout.tsx` with (P1A's layout, plus the surface switch):

```tsx
import "@/styles/tokens.css";
import "@/styles/fonts.css";
import { cookies, headers } from "next/headers";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { ONEST_URL } from "@/lib/fonts";
import { getSession } from "@/lib/session";
import { isReviewSurface } from "@/lib/surface";
import { THEME_COOKIE, htmlThemeAttr, parseTheme } from "@/lib/theme";
import styles from "./layout.module.css";

// Only the default component and `metadata` are exported: Next.js 15 fails `next build` on any other layout export
// ("… is not a valid Layout export field"), so ONEST_URL comes from `@/lib/fonts` (P1A Task 2). P1A's
// layout.test.tsx pins `Object.keys(layout)` to ["default", "metadata"].
export const metadata = { title: "IntelliDrugs", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // /review/* brings its own toolbar, skip links and <main> (spec §5.1, §5.16).
  const review = isReviewSurface((await headers()).get("x-pathname") ?? "");
  const session = review ? null : await getSession();
  return (
    <html lang="en" data-theme={htmlThemeAttr(theme)}>
      <head>
        <link rel="preload" href={ONEST_URL} as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {review ? children : (
          <>
            <a className={styles.skipLink} href="#content">Skip to content</a>
            <Header session={session} theme={theme} />
            <main id="content" className={styles.main}>{children}</main>
            <Footer theme={theme} />
          </>
        )}
      </body>
    </html>
  );
}
```

(If P1A's final layout passes further props to `Header`, keep them; Task 20 adds `batchId`. Do not add any export to this file: P1A's `tests/layout.test.tsx` "exports nothing but the component and metadata" must keep passing, and `next build` rejects extra layout exports.)

Create `web/app/review/review.module.css`:

```css
/* /review, /review/flags and the not-authorised page: the reviewer toolbar over one column of at most 860 px (§5.16). */
.shell { min-height: 100dvh; display: flex; flex-direction: column; background: var(--canvas); color: var(--fg); }
.toolbar { position: sticky; top: 0; z-index: 2; }
.toolbarRight { margin-left: auto; display: flex; align-items: center; gap: var(--s3); }
/* The link around <Wordmark size={17} sub="Review" />: the size comes from Wordmark's own class (P1A: 13 | 16 | 17 | 19 | 20 | 28). */
.wordmark { color: var(--fg); text-decoration: none; min-height: 24px; display: inline-flex; align-items: center; }
.page { width: 100%; max-width: 860px; margin: 0 auto; padding: var(--s6) var(--s4) var(--s7); display: flex; flex-direction: column; gap: var(--s5); }
.page h1 { font: var(--t-title1); letter-spacing: var(--tr-title1); }
.page h2 { font: var(--t-title3); letter-spacing: var(--tr-title3); }
.actions { display: flex; flex-wrap: wrap; gap: var(--s3); }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--surface-3); display: grid; place-items: center; font: 600 11.5px/1 var(--font-ui); color: var(--fg); box-shadow: inset 0 0 0 1px var(--line-strong); list-style: none; cursor: pointer; }
.avatar::-webkit-details-marker { display: none; }
.panel { position: absolute; right: 0; top: calc(100% + var(--s2)); z-index: 20; min-width: 280px; display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3); padding: var(--s4); border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-2); }
.who { display: flex; flex-direction: column; gap: 2px; }
.who span { color: var(--fg-2); font-size: 13px; overflow-wrap: anywhere; }
.menuLink { min-height: 24px; display: inline-flex; align-items: center; }
.label { font-size: 12.5px; color: var(--fg-2); }
@media (max-height: 480px) { .toolbar { position: static; } }
```

Create `web/components/review/desk/KeysSwitch.tsx`:

```tsx
"use client";
import { useState, type MouseEvent } from "react";
import Segmented from "@/components/ui/Segmented";
import { DESK_NEW } from "@/lib/copy";
import { DESK_SETTINGS_EVENT, KEYS_COOKIE, deskCookieString, type KeysSetting } from "@/lib/desk-settings";
import { setDeskSettingAction } from "@/lib/desk-settings-actions";

/**
 * "Single-key shortcuts: On / Off" (§5.14) for the account menu. A form POST without JavaScript; with it, a click writes
 * the cookie and tells the desk at once.
 */
export default function KeysSwitch({ value }: { value: KeysSetting }) {
  const [keys, setKeys] = useState<KeysSetting>(value);
  const s = DESK_NEW.deskSettings;
  function choose(e: MouseEvent<HTMLButtonElement>, next: KeysSetting) {
    e.preventDefault();
    document.cookie = deskCookieString(KEYS_COOKIE, next, window.location.protocol === "https:");
    setKeys(next);
    window.dispatchEvent(new CustomEvent(DESK_SETTINGS_EVENT, { detail: { keys: next } }));
  }
  return (
    <form action={setDeskSettingAction}>
      <Segmented ariaLabel={s.keysLabel} name="keys" value={keys} onSelect={choose}
        options={[{ value: "on", label: s.on }, { value: "off", label: s.off }]} />
    </form>
  );
}
```

Create `web/components/review/ReviewAccount.tsx`:

```tsx
import AccountMenu from "@/components/AccountMenu";
import ThemeSwitch from "@/components/ThemeSwitch";
import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW } from "@/lib/copy";
import type { KeysSetting } from "@/lib/desk-settings";
import { DESK, ROLE_LABEL_DESK } from "@/lib/review-copy";
import type { ReviewBatchSummary } from "@/lib/review-types";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import KeysSwitch from "./desk/KeysSwitch";
import styles from "@/app/review/review.module.css";

const initials = (s: Session) => ((s.name ?? "").trim() || s.email)
  .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** The newest in_review batch: the one the copy "Batch {id}" names (§5.13). */
export function newestInReview(batches: ReviewBatchSummary[]): string | null {
  return [...batches].filter((b) => b.status === "in_review").sort((a, b) => b.runAt.localeCompare(a.runAt))[0]?.batchId ?? null;
}

/**
 * The account menu on /review/* (§6.2): own name and email, role badge and batch, Review desk, Problem reports and
 * partner requests, the theme, "Keyboard shortcuts and settings" (desk only; shown once the desk is running) and the
 * single-key shortcuts control, then Sign out. Links are plain <a>: leaving /review is a document navigation.
 */
export default function ReviewAccount({ session, theme, batchId, keys, shortcutsItem }:
    { session: Session; theme: Theme; batchId: string | null; keys: KeysSetting; shortcutsItem: boolean }) {
  const reviewer = session.role === "pharmacist" || session.role === "engineer";
  const name = (session.name ?? "").trim() || session.email;
  return (
    <AccountMenu>
      <summary className={styles.avatar}>
        <span aria-hidden="true">{initials(session)}</span><span className="sr-only">{`Account menu for ${name}`}</span>
      </summary>
      <div className={styles.panel}>
        <p className={styles.who}><b>{name}</b><span>{session.email}</span></p>
        {reviewer && <p><span className="role-badge">{ROLE_LABEL_DESK[session.role as "pharmacist" | "engineer"]}</span>
          {batchId && <> {DESK.batchPrefix} <span className="mono">{batchId}</span></>}</p>}
        {reviewer && <a className={styles.menuLink} href="/review">{DESK.reviewDesk}</a>}
        {reviewer && <a className={styles.menuLink} href="/review/flags">{DESK_NEW.reviewLists.flagsLink}</a>}
        {reviewer && shortcutsItem && (
          <button type="button" className={buttonClass("plain", "sm")} data-desk-open="sheet" hidden>{DESK_NEW.shortcutsMenuItem.item}</button>
        )}
        <ThemeSwitch value={theme} />
        {reviewer && <><span className={styles.label}>{DESK_NEW.deskSettings.keysLabel}</span><KeysSwitch value={keys} /></>}
        <form method="post" action="/signout"><button type="submit" className={buttonClass("plain", "sm")}>Sign out</button></form>
      </div>
    </AccountMenu>
  );
}

```

Create `web/components/review/ReviewToolbar.tsx`:

```tsx
import type { ReactNode } from "react";
import Wordmark from "@/components/ui/Wordmark";
import type { KeysSetting } from "@/lib/desk-settings";
import { ROLE_LABEL_DESK } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import ReviewAccount from "./ReviewAccount";
import styles from "@/app/review/review.module.css";

/** The reviewer toolbar (§5.1) for /review, /review/flags and the not-authorised page: no batch centre section (§5.16). */
export default function ReviewToolbar({ session, theme, batchId, keys = "on", center }:
    { session: Session; theme: Theme; batchId: string | null; keys?: KeysSetting; center?: ReactNode }) {
  const reviewer = session.role === "pharmacist" || session.role === "engineer";
  return (
    <header className={`chrome-toolbar material ${styles.toolbar}`}>
      <a href="/review" className={styles.wordmark}><Wordmark size={17} sub="Review" /></a>
      {center}
      <div className={styles.toolbarRight}>
        {reviewer && <span className="role-badge">{ROLE_LABEL_DESK[session.role as "pharmacist" | "engineer"]}</span>}
        <ReviewAccount session={session} theme={theme} batchId={batchId} keys={keys} shortcutsItem={false} />
      </div>
    </header>
  );
}
```

Create `web/components/review/NotAuthorised.tsx`:

```tsx
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import ReviewToolbar from "./ReviewToolbar";
import styles from "@/app/review/review.module.css";

/**
 * §5.12 "Not authorised": a signed-in account that is not on REVIEWERS. No batch data. The only email shown is the
 * owner's own (§2.2). "Use another Google account" signs out, then opens sign-in with returnTo=/review.
 */
export default function NotAuthorised({ session, theme }: { session: Session; theme: Theme }) {
  return (
    <div className={styles.shell}>
      <ReviewToolbar session={session} theme={theme} batchId={null} />
      <main id="content" className={styles.page}>
        <Banner tone="info" title={DESK.noAuthTitle} body={DESK.noAuthPageBody} />
        <Banner tone="warn" title={DESK.notAuthWarnTitle} body={fill(DESK.notAuthWarnBody, { email: session.email })} />
        <div className={styles.actions}>
          <form action="/signout" method="post">
            <input type="hidden" name="returnTo" value="/review" />
            <button type="submit" className={buttonClass("tonal")}>{DESK.useAnother}</button>
          </form>
          <a className={buttonClass("plain")} href="/search">{DESK.searchMedicines}</a>
        </div>
      </main>
    </div>
  );
}
```

Create `web/app/review/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import NotAuthorised from "@/components/review/NotAuthorised";
import { signInHref } from "@/components/review/desk/hrefs";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

/** §2.3, §5.12: anonymous visitors go to sign-in (the middleware does it first, with the full path); readers see the not-authorised page. */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(signInHref("/review"));
  if (!isReviewer(session)) return <NotAuthorised session={session} theme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />;
  return <>{children}</>;
}
```

- [ ] **Step 5: Allow the toolbar's material, then run the tests and the guards**

The reviewer toolbar is one of the three places translucent material is allowed (§3.4). In `web/tests/marks.test.ts` replace `export const MATERIAL_ALLOWED: string[] = [];` with:

```ts
export const MATERIAL_ALLOWED: string[] = [
  "components/review/ReviewToolbar.tsx",
];
```

Run: `cd web && npx vitest run tests/surface.test.ts tests/middleware-review.test.ts tests/review-layout.test.tsx tests/middleware.test.ts tests/layout.test.tsx tests/header.test.tsx tests/client-islands.test.ts tests/inline-styles.test.ts tests/marks.test.ts && npm run lint:css`
Expected: PASS; lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/lib/surface.ts web/lib/security-headers.ts web/middleware.ts web/app/layout.tsx web/app/review/layout.tsx \
  web/app/review/review.module.css web/components/review/NotAuthorised.tsx web/components/review/ReviewToolbar.tsx \
  web/components/review/ReviewAccount.tsx web/components/review/desk/KeysSwitch.tsx \
  web/tests/surface.test.ts web/tests/middleware-review.test.ts web/tests/review-layout.test.tsx web/tests/marks.test.ts
git commit -m "feat(web): review surface: legacy redirects, anonymous gate, not-authorised page, reviewer toolbar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Web — record detail sections: header, comparison table, automated checks, history, evidence, back-in-review card (§5.5, §5.6.3, §5.6.5, §5.11)

All server components (no `"use client"`), rendering the exact token classes; layout values are Board R's second `<style>` block, ported into `components/review/detail/detail.module.css`. The one interactive piece here, the "Hide the pairs" toggle, is the desk part `StagePairs` (it renders nothing until hydrated, so without JavaScript the list simply stays open).

**Files:**
- Create: `web/components/review/detail/detail.module.css`, `web/components/review/detail/RecordHeader.tsx`, `web/components/review/detail/ComparisonTable.tsx`, `web/components/review/detail/AutomatedChecks.tsx`, `web/components/review/detail/History.tsx`, `web/components/review/detail/EvidenceContent.tsx`, `web/components/review/detail/BackInReviewCard.tsx`, `web/components/review/desk/DiffTable.tsx`, `web/components/review/desk/StagePairs.tsx`
- Test: `web/tests/review-detail.test.tsx`

**Interfaces:**
- Consumes: `ReviewItem`, `DiffRow` (Task 7); relations (Task 8); `DESK`, `DESK_NEW`, `fill`, `fillNodes`, `historyText`, `STAGE_NAME`, `plural` (Task 9); `ReviewStatus`, `StageCheck`, `MatchRelation`, `CodeChip`, `Severity`, `NoDataChip` (P1A); `NO_DATA_SENTENCE`, `NOT_RUN`, `NOT_REVIEWED` (P1A); `fmtUtc`, `fmtDhaka` (P1A).
- Produces (props exactly):
  - `RecordHeader({ item: ReviewItem; tools: ReactNode; backHref: string })` — crumb, `<h1>`, meta, chips (§5.2), `.d-vis`, the tools slot, and the narrow-screen "Back to list" link.
  - `ComparisonTable({ item: ReviewItem })` — §5.5.2, `<table class="cmp">` with the sr-only caption.
  - `AutomatedChecks({ item: ReviewItem })` — §5.5.3. A stage with no result is shown as Failed with "No note" (it blocks approval like a failure, §7.2 step 5).
  - `History({ item: ReviewItem })` — §5.6.5.
  - `EvidenceContent({ item: ReviewItem })` — §5.6.3 items 1–5 (the drawer body; the drawer frame is the desk's).
  - `BackInReviewCard({ item: ReviewItem; diff: DiffRow[] | null })` — §5.11, rendered when `displayStatus = back_in_review`.
  - `DiffTable({ rows: DiffRow[] })` — usable from the server (back card) and the desk (stale banner).
  - desk part `StagePairs({ targetId: string; count: number })`.
  - module classes Task 16–18 reuse: `sec`, `secT`, `ingP`, `ingQ`, `subH`, `chipRow` from `detail.module.css`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/review-detail.test.tsx`:

```tsx
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AutomatedChecks from "@/components/review/detail/AutomatedChecks";
import BackInReviewCard from "@/components/review/detail/BackInReviewCard";
import ComparisonTable from "@/components/review/detail/ComparisonTable";
import EvidenceContent from "@/components/review/detail/EvidenceContent";
import History from "@/components/review/detail/History";
import RecordHeader from "@/components/review/detail/RecordHeader";
import DiffTable from "@/components/review/desk/DiffTable";
import { NO_DATA_SENTENCE, NOT_RUN } from "@/lib/copy";
import { pilotItem } from "./fixtures/pilot";

describe("RecordHeader (§5.5.1, §5.2)", () => {
  it("crumb, title, meta, the pending pill and the hidden line", () => {
    const html = r(<RecordHeader item={pilotItem("napa")} tools={<span>tools</span>} backHref="/review/0001-pilot/x?pane=list" />);
    expect(html).toContain('<span class="mono">0001-pilot</span>, record 8 of 10');
    expect(html).toContain("<h1");
    expect(html).toContain(">Napa</h1>");
    expect(html).toContain('Beximco Pharmaceuticals Ltd., <span class="mono nowrap">DAR 186-0030-006</span>, Tablet');
    expect(html).toContain('<span class="rv rv--pending">Not yet reviewed by a pharmacist</span>');
    expect(html).toContain("Hidden from readers until a pharmacist approves it.");
    expect(html).toContain('<a class="backToList" href="/review/0001-pilot/x?pane=list">Back to list</a>');
    expect(html).toContain("<span>tools</span>");
  });

  it.each([["engineer_checked", "rv--engineer"], ["issue", "rv--issue"], ["back_in_review", "rv--back"]] as const)(
    "%s adds the not-reviewed pill after its own", (status, cls) => {
      const html = r(<RecordHeader item={pilotItem("napa", { displayStatus: status })} tools={null} backHref="#" />);
      expect(html.indexOf(cls)).toBeGreaterThan(-1);
      expect(html.indexOf("rv--pending")).toBeGreaterThan(html.indexOf(cls));
    });

  it("an approved record is published and has one green pill", () => {
    const html = r(<RecordHeader item={pilotItem("napa", { displayStatus: "approved" })} tools={null} backHref="#" />);
    expect(html).toContain("Published. Readers can see this record.");
    expect(html.match(/rv--approved/g)).toHaveLength(1);
    expect(html).not.toContain("rv--pending");
  });
});

describe("ComparisonTable (§5.5.2)", () => {
  it("is a real table with the sr-only caption, column and row headers", () => {
    const html = r(<ComparisonTable item={pilotItem("napa")} />);
    expect(html).toContain('<table class="cmp"><caption class="sr-only">Napa: DGDA register compared with the pipeline extraction</caption>');
    expect(html).toContain('<th scope="col">Field</th><th scope="col" class="cmp-src srcHead">DGDA source</th><th scope="col">Relation</th><th scope="col">Extracted by the pipeline</th>');
    expect(html).toContain("Each relation compares the two values on its row. Fields copied from the register have no verdict.");
  });

  it("rows and relations for Napa", () => {
    const html = r(<ComparisonTable item={pilotItem("napa")} />);
    expect(html).toContain('<th scope="row">Trade name</th><td class="cmp-src">Napa</td><td class="relCell"><span class="copy">Copied from the register</span></td><td>Napa<span class="cmp-sub mono">186-0030-006--napa</span></td>');
    expect(html).toContain('<span class="match match--norm">Normalised</span><span class="cmp-sub">Paracetamol kept as the DGDA name</span>');
    expect(html).toContain('<span class="cmp-sub">1 ingredient parsed</span>');
    expect(html).toContain('<th scope="row">DGDA ingredient code</th><td class="cmp-src"><span class="mono">XM5DJ7</span><span class="cmp-sub">Acetaminophen</span></td>');
    expect(html).toContain('Names: Acetaminophen (ICD-11), acetaminophen (RxNorm), Paracetamol (DGDA), Acetaminophen (DDInter)');
    expect(html).toContain('<span class="cmp-sub"><span class="mono">BDC-000001</span>, route systemic, dose form Tablet</span>');
    expect(html).toContain("6 codes for Acetaminophen");
    expect(html).toContain('<span class="code-sys">DDInter</span>DDInter14<span class="code-meta">drugbank, 1.0, systemic</span>');
    expect(html).toContain('<span class="cmp-sub">Interaction data found</span><span class="cmp-sub">Checked against <span class="mono">DDInter14</span> (systemic)</span>');
  });

  it("the eye drop is checked against DDInter352, and its strength is Normalised", () => {
    const html = r(<ComparisonTable item={pilotItem("chloramphenicol")} />);
    expect(html).toContain('Checked against <span class="mono">DDInter352</span> (ophthalmic)');
    expect(html).not.toContain('Checked against <span class="mono">DDInter351</span>');
    expect(html).toContain('<span class="match match--norm">Normalised</span><span class="cmp-sub">Written as 5 mg per 1 ml</span>');
  });

  it("no-data coverage: the No data chip and the full sentence; not_run: the plain line, never the hatch", () => {
    const html = r(<ComparisonTable item={pilotItem("domperidone")} />);
    expect(html).toContain('<span class="sev sev--nodata">No data</span>');
    expect(html).toContain(NO_DATA_SENTENCE);
    const base = pilotItem("napa");
    const notRun = r(<ComparisonTable item={{ ...base, ingredients: [{ ...base.ingredients[0], coverage: { coverage: "not_run", note: "" },
      ddinter: { chosen: [], entries: [] } }] }} />);
    expect(notRun).toContain(NOT_RUN);
    expect(notRun).not.toContain("sev--nodata");
    expect(notRun).not.toContain(NO_DATA_SENTENCE);
  });

  it("a combination product numbers its rows and names both ingredients", () => {
    const html = r(<ComparisonTable item={pilotItem("amoxycillin")} />);
    for (const th of ["Substance 1", "Strength 1", "Substance 2", "Strength 2", "Codes 1", "Codes 2", "DDInter mapping 1", "DDInter mapping 2"])
      expect(html).toContain(`<th scope="row">${th}</th>`);
    expect(html).toContain("Both ingredients and strengths found");
    expect(html).toContain("Parser&#x27;s part of the DGDA text");
    expect(html).toContain('<span class="match match--same">Matches</span><span class="cmp-sub">Capitalisation only</span>');
  });
});

describe("AutomatedChecks (§5.5.3)", () => {
  it("merges quiet OK stages and splits the text-missing pairs into a list", () => {
    const html = r(<AutomatedChecks item={pilotItem("napa")} />);
    expect(html).toContain("3 OK, 1 warning. Pipeline run 11/10/2026 21:27 UTC");
    expect(html).toContain('<span class="stage-name">DGDA load, Substances, Clinical drug</span><span class="stage-status">OK</span>');
    expect(html).toContain("DDInter text not found for 6 pairs with other medicines in this batch.");
    expect(html).toContain('<li class="stage-pair">DDInter1164 + DDInter14 <span class="mono">DDInter1164/DDInter14</span>');
    expect(html).not.toContain("DDInter351");
  });

  it("the eye drop is all OK; no-data coverage shows the full sentence as the DDInter note", () => {
    expect(r(<AutomatedChecks item={pilotItem("chloramphenicol")} />)).toContain(
      '<span class="stage-name">DGDA load, Substances, Clinical drug, DDInter</span><span class="stage-status">OK</span>');
    const nodata = r(<AutomatedChecks item={pilotItem("domperidone")} />);
    expect(nodata).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
    expect(nodata).not.toContain("No interaction data in DDInter for this substance<");
  });

  it("fail notes stay whole; a missing stage counts as failed with No note; other notes are verbatim lines", () => {
    const base = pilotItem("napa");
    const item = { ...base, stages: [
      { stage: "dgda" as const, status: "fail" as const, notes: [{ kind: "other" as const, text: "error: RuntimeError: a; b", ddinterId: null, route: null }],
        textMissing: [], evidence: {} },
      { stage: "ddinter" as const, status: "warn" as const, notes: [
        { kind: "route_assumed" as const, text: "DDInter route assumed: DDInter1951 (systemic) used for unknown route", ddinterId: "DDInter1951", route: null }],
        textMissing: [], evidence: {} },
    ] };
    const html = r(<AutomatedChecks item={item} />);
    expect(html).toContain("1 warning, 3 failed.");
    expect(html).toContain('<p class="stage-note">error: RuntimeError: a; b</p>');
    expect(html).toContain('<p class="stage-note">DDInter route assumed: DDInter1951 (systemic) used for unknown route</p>');
    expect(html.match(/<span class="stage-status">Failed<\/span>/g)).toHaveLength(3);
    expect(html.match(/No note/g)).toHaveLength(2);
  });
});

describe("History (§5.6.5)", () => {
  it("oldest first, UTC over Dhaka, roles and (you), the note in .raw, and the no-longer-counts suffix", () => {
    const item = pilotItem("napa", { history: [
      { kind: "run", at: "2026-10-11T21:27:17Z" },
      { kind: "extract", at: "2026-10-11T21:28:09Z", reason: "run" },
      { kind: "decision", at: "2026-10-12T03:00:00Z", decision: "ok", role: "engineer", counts: false, mine: false },
      { kind: "decision", at: "2026-10-12T04:00:00Z", decision: "issue", role: "pharmacist", note: "strength should read 5 mg", counts: true, mine: true },
    ] });
    const html = r(<History item={item} />);
    expect(html).toContain('<span class="histT">11/10/2026 21:27 UTC<span>12/10/2026 03:27 Dhaka</span></span>');
    expect(html).toContain("Batch 0001-pilot run started");
    expect(html).toContain("Engineer checked. Not published. No longer counts: the record was re-run after it.");
    expect(html).toContain('Issue reported (you). Note: <span class="raw">strength should read 5 mg</span>');
    expect(html).not.toContain("@");
  });
});

describe("EvidenceContent (§5.6.3)", () => {
  it("raw brand row, DGDA codes, the raw record collapsed, notes per stage and the pipeline facts", () => {
    const html = r(<EvidenceContent item={pilotItem("napa")} />);
    expect(html).toContain("<h5>Raw brand row</h5><p class=\"dr-note\">The DGDA register fields with the pipeline&#x27;s parse fields, exactly as stored.</p><pre>");
    expect(html).toContain("&quot;tradeName&quot;: &quot;Napa&quot;");
    expect(html).toContain("<h5>DGDA ingredient codes</h5><pre>");
    expect(html).toMatch(/<details><summary>Raw DGDA record<\/summary><pre>[\s\S]*186-0030-006--napa[\s\S]*<\/pre><\/details>/);
    expect(html).toContain('<dt>DGDA load</dt><dd><span>OK</span><span class="dr-note">No note</span></dd>');
    expect(html).toContain('<dt>Clinical signature</dt><dd><span class="mono">tablet|systemic|BDS-000001:500mg/</span></dd>');
    expect(html).toContain('<dt>Batch run</dt><dd>11/10/2026 21:27 UTC<span class="dr-note">0001-pilot, 10 items</span></dd>');
  });
});

describe("the back-in-review card and the diff table (§5.11)", () => {
  const rows = [{ field: "DDInter note", before: "old note", now: "" }, { field: "Pipeline extracted at", before: "2026-10-11T21:28:09Z", now: "2026-10-12T09:00:00Z" }];

  it("names the reason, quotes the not-reviewed pill text, and shows the diff when there is one", () => {
    const rerun = pilotItem("napa", { displayStatus: "back_in_review",
      reopen: { reason: "rerun", at: "2026-10-12T09:00:00Z", previousExtractedAt: "2026-10-11T21:28:09Z", diffAvailable: true } });
    const html = r(<BackInReviewCard item={rerun} diff={rows} />);
    expect(html).toContain('<div class="noteCard">');
    expect(html).toContain('<span class="rv rv--back">Back in review</span>');
    expect(html).toContain("This record was re-run after a pharmacist approved it. Readers see “Not yet reviewed by a pharmacist” until a pharmacist approves it again.");
    expect(html).toContain("<caption>Cells that changed in the re-run</caption>");
    const shared = pilotItem("napa", { displayStatus: "back_in_review",
      reopen: { reason: "shared_change", at: "x", previousExtractedAt: "y", diffAvailable: false } });
    expect(r(<BackInReviewCard item={shared} diff={null} />)).toContain("Shared substance data for this record changed after a pharmacist approved it.");
  });

  it("the diff table: field, what you were reviewing, now; times formatted; the footer line", () => {
    const html = r(<DiffTable rows={rows} />);
    expect(html).toContain('<thead><tr><th scope="col">Field</th><th scope="col" class="cmp-src">You were reviewing</th><th scope="col">Now</th></tr></thead>');
    expect(html).toContain('<th scope="row">DDInter note</th><td class="cmp-src">old note</td><td class="chg"></td>');
    expect(html).toContain('<td class="cmp-src">11/10/2026 21:28 UTC</td><td class="chg">12/10/2026 09:00 UTC</td>');
    expect(html).toContain("Cells that are not listed did not change.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/review-detail.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/review/detail/AutomatedChecks"`.

- [ ] **Step 3: Write the stylesheet**

Create `web/components/review/detail/detail.module.css` (values from Board R's page-layout `<style>` block; tokens only):

```css
.sec { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.secT { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.secT h2 { font: var(--t-title3); letter-spacing: var(--tr-title3); }
.secT span { font-size: 12.5px; color: var(--fg-2); }
.hd { display: flex; align-items: flex-start; gap: 16px; }
.hdMain { min-width: 0; }
.crumb { font-size: 12.5px; color: var(--fg-2); }
.title { font: var(--t-title1); letter-spacing: var(--tr-title1); margin-top: 2px; overflow-wrap: anywhere; }
.meta { font-size: 13px; color: var(--fg-2); margin-top: 4px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
.vis { font-size: 12.5px; color: var(--fg-2); }
.nowrap { white-space: nowrap; }
.backToList { display: none; font-size: 13px; margin-bottom: 6px; }
.srcHead { width: 27%; }
.relCell { width: 150px; }
.copy { font-size: 12.5px; color: var(--fg-2); }
.flush { margin: 0; }
.strong { color: var(--fg); }
.cmpNames { display: block; font-size: 12px; color: var(--fg-2); margin-top: 4px; }
.codesTight { margin-top: 2px; }
.stages { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.ing { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); min-width: 0; }
.ingH { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.ingH h3 { font: 600 15px/1.3 var(--font-ui); letter-spacing: -.008em; }
.ingH span { font-size: 12.5px; color: var(--fg-2); }
.ingP { font-size: 13.5px; color: var(--fg); }
.ingQ { font-size: 13px; color: var(--fg-2); }
.chipRow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.subH { font: 600 13.5px/1.3 var(--font-ui); color: var(--fg); }
.pairs { display: flex; flex-direction: column; gap: 10px; }
.ntx { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); background: var(--canvas); }
.ntxG { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.ntxList { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--fg); }
.ntxList b { font-weight: 600; }
.ntxWith { color: var(--fg-2); }
.nc { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-ctl); font-size: 13.5px; }
.noteCard { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--r-card); box-shadow: inset 0 0 0 1.5px var(--accent); background: var(--canvas); }
.noteCard p { font-size: 13.5px; }
.hist { display: flex; flex-direction: column; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); overflow: hidden; margin: 0; padding: 0; list-style: none; }
.hist li { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 4px 16px; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 13.5px; }
.hist li:first-child { border-top: 0; }
.histT { font-size: 12.5px; color: var(--fg-2); font-variant-numeric: tabular-nums; }
.histT span { display: block; }
.diffFoot { font-size: 13px; color: var(--fg-2); }
.chg { background: var(--warn-soft); }
@media (max-width: 1023px) {
  .hd { flex-direction: column; }
  .backToList { display: inline-flex; }
}
@media (max-width: 560px) { .hist li { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 4: Write the components**

Create `web/components/review/detail/RecordHeader.tsx`:

```tsx
import type { ReactNode } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { DESK_NEW } from "@/lib/copy";
import { DESK, fillNodes } from "@/lib/review-copy";
import type { ReviewItem } from "@/lib/review-types";
import s from "./detail.module.css";

/** §5.5.1 header and the §5.2 chips: the status pill, plus "Not yet reviewed by a pharmacist" for the in-between states. */
export default function RecordHeader({ item, tools, backHref }: { item: ReviewItem; tools: ReactNode; backHref: string }) {
  const b = item.brand;
  const extraPending = item.displayStatus === "engineer_checked" || item.displayStatus === "issue" || item.displayStatus === "back_in_review";
  return (
    <div className={s.hd}>
      <div className={s.hdMain}>
        <a className={s.backToList} href={backHref}>{DESK_NEW.deskMisc.backToList}</a>
        <p className={s.crumb}>{fillNodes(DESK.crumb, { id: <span className="mono">{item.batchId}</span>, k: item.index, n: item.total })}</p>
        <h1 className={s.title}>{b?.tradeName ?? item.conceptId}</h1>
        {b && <p className={s.meta}>{b.company}, <span className={`mono ${s.nowrap}`}>DAR {b.darNumber}</span>, {b.dosageForm}</p>}
        <div className={s.chips}>
          <ReviewStatus status={item.displayStatus} />
          {extraPending && <ReviewStatus status="pending" />}
          <span className={s.vis}>{item.displayStatus === "approved" ? DESK.visApproved : DESK.visHidden}</span>
        </div>
      </div>
      {tools}
    </div>
  );
}
```

Create `web/components/review/detail/ComparisonTable.tsx`:

```tsx
import type { ReactNode } from "react";
import CodeChip from "@/components/ui/CodeChip";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataChip from "@/components/ui/NoDataChip";
import { DESK_NEW, NO_DATA_SENTENCE, NOT_RUN, fill } from "@/lib/copy";
import {
  NAME_TYPE_LABEL, formRelation, genericRelation, nameRelation, strengthRelation, strengthText, xmRelation, type Relation,
} from "@/lib/relations";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import type { IngredientSummary, ReviewItem } from "@/lib/review-types";
import s from "./detail.module.css";

const Rel = ({ r }: { r: Relation }) => <MatchRelation kind={r.kind} sub={r.sub} />;

function Row({ th, src, rel, ext }: { th: string; src: ReactNode; rel: ReactNode; ext: ReactNode }) {
  return <tr><th scope="row">{th}</th><td className="cmp-src">{src}</td><td className={s.relCell}>{rel}</td><td>{ext}</td></tr>;
}

const notInRegister = <span className={`cmp-sub ${s.flush}`}>{DESK.notInRegister}</span>;
const meta = (c: IngredientSummary["codes"][number]) =>
  ({ method: c.method, confidence: c.confidence, route: c.system === "DDINTER" ? c.routeScope : undefined });

function mapping(g: IngredientSummary): ReactNode {
  if (g.coverage.coverage === "none")
    return <><NoDataChip label="No data" /><span className={`cmp-sub ${s.strong}`}>{NO_DATA_SENTENCE}</span></>;
  if (g.coverage.coverage === "not_run") return <span className="cmp-sub">{NOT_RUN}</span>;
  const dd = g.codes.filter((c) => c.system === "DDINTER");
  return (
    <>
      <div className={`codes ${s.codesTight}`}>{dd.map((c) => <CodeChip key={c.code} system={c.system} code={c.code} meta={meta(c)} />)}</div>
      <span className="cmp-sub">{DESK.dataFound}</span>
      {g.ddinter.chosen.map((c) => (
        <span className="cmp-sub" key={c.ddinterId}>
          {fillNodes(DESK_NEW.routeAware.mappingChecked, { id: <span className="mono">{c.ddinterId}</span>, route: c.routeScope })}
          {c.routeAssumed && DESK_NEW.routeAware.routeAssumedSuffix}
        </span>
      ))}
    </>
  );
}

/** §5.5.2 "DGDA source against the extraction". Relations come from lib/relations (Board R's rules). */
export default function ComparisonTable({ item }: { item: ReviewItem }) {
  const b = item.brand, cd = item.clinicalDrug, ings = item.ingredients, multi = ings.length > 1;
  const n = (k: number) => (multi ? ` ${k + 1}` : "");
  const mapped = ings.filter((g) => g.bdsId !== null);
  const copied = <span className={s.copy}>{DESK.copied}</span>;
  return (
    <section className={s.sec} aria-labelledby="sec-cmp">
      <div className={s.secT}><h2 id="sec-cmp">{DESK.cmpTitle}</h2><span>{DESK.cmpSub}</span></div>
      <div className="cmp-wrap" tabIndex={0} role="region" aria-labelledby="sec-cmp">
        <table className="cmp">
          <caption className="sr-only">{fill(DESK.cmpCaption, { name: b?.tradeName ?? item.conceptId })}</caption>
          <thead><tr><th scope="col">{DESK.cmpField}</th><th scope="col" className={`cmp-src ${s.srcHead}`}>{DESK.cmpSource}</th>
            <th scope="col">{DESK.cmpRelation}</th><th scope="col">{DESK.cmpExtracted}</th></tr></thead>
          <tbody>
            {b && <Row th="Trade name" src={b.tradeName} rel={copied} ext={<>{b.tradeName}<span className="cmp-sub mono">{item.conceptId}</span></>} />}
            {b && <Row th="Company" src={b.company} rel={copied} ext={b.company} />}
            {b && <Row th="Dosage form" src={b.dosageForm} rel={<Rel r={formRelation(b.dosageForm, cd?.doseForm ?? null)} />} ext={cd?.doseForm ?? ""} />}
            {b && <Row th="Generic content" src={<span className="raw">{b.genericContentRaw}</span>}
              rel={<Rel r={genericRelation(b.genericContentRaw, ings)} />}
              ext={<>{ings.map((g, k) => <span key={k}>{k > 0 && <br />}{g.name} {strengthText(g)}</span>)}
                <span className="cmp-sub">{fill(DESK.parsed, { k: ings.length, ingredients: plural(ings.length, "ingredient", "ingredients") })}</span></>} />}
            {ings.flatMap((g, k) => {
              const src = <><span className="raw">{g.raw}</span>{multi && <span className="cmp-sub">{DESK.parserPart}</span>}</>;
              return [
                <Row key={`s${k}`} th={`Substance${n(k)}`} src={src} rel={<Rel r={nameRelation(g)} />}
                  ext={<>{g.name}{g.bdsId && <span className="cmp-sub mono">{g.bdsId}</span>}</>} />,
                <Row key={`t${k}`} th={`Strength${n(k)}`} src={src} rel={<Rel r={strengthRelation(g)} />} ext={strengthText(g)} />,
              ];
            })}
            {item.dgdaIngredients.map((x) => {
              const { relation, match } = xmRelation(x.xmCode, ings);
              return (
                <Row key={x.xmCode} th="DGDA ingredient code" src={<><span className="mono">{x.xmCode}</span><span className="cmp-sub">{x.name}</span></>}
                  rel={<Rel r={relation} />}
                  ext={match ? <><span className="mono">{match.bdsId}</span> {match.name}<span className={s.cmpNames}>{fill(DESK.names, {
                    names: match.names.map((nm) => `${nm.name} (${NAME_TYPE_LABEL[nm.type] ?? nm.type})`).join(", ") })}</span></>
                    : DESK.noMatchingSubstance} />
              );
            })}
            {cd && <Row th="Clinical drug" src={notInRegister} rel={<Rel r={{ kind: "added" }} />}
              ext={<>{cd.displayName}<span className="cmp-sub"><span className="mono">{cd.bdcId}</span>{fill(DESK.clinicalSub, {
                route: cd.route ?? "", form: cd.doseForm })}</span></>} />}
            {mapped.map((g) => {
              const codes = g.codes.filter((c) => c.system !== "DDINTER");
              return <Row key={`c${g.bdsId}`} th={`Codes${n(ings.indexOf(g))}`} src={notInRegister}
                rel={<Rel r={{ kind: "added", sub: fill(DESK.codesFor, { k: codes.length, name: g.name }) }} />}
                ext={<div className={`codes ${s.codesTight}`}>{codes.map((c) => <CodeChip key={`${c.system}${c.code}`} system={c.system} code={c.code} meta={meta(c)} />)}</div>} />;
            })}
            {mapped.map((g) => <Row key={`d${g.bdsId}`} th={`DDInter mapping${n(ings.indexOf(g))}`} src={notInRegister}
              rel={<Rel r={{ kind: "added" }} />} ext={mapping(g)} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

Create `web/components/review/desk/StagePairs.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";

/** §5.5.3 toggle for the text-missing pair list: open by default; renders nothing until hydrated (the list stays open). */
export default function StagePairs({ targetId, count }: { targetId: string; count: number }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(true);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  const label = count === 1 ? (open ? DESK.hidePair : DESK.showPair) : fill(open ? DESK.hidePairs : DESK.showPairs, { n: count });
  const toggle = () => {
    const next = !open;
    const list = document.getElementById(targetId);
    if (list) list.hidden = !next;
    setOpen(next);
  };
  return (
    <button type="button" className="btn btn--plain btn--sm" data-fk="pairs" aria-expanded={open} aria-controls={targetId} onClick={toggle}>
      {label}
    </button>
  );
}
```

Create `web/components/review/detail/AutomatedChecks.tsx`:

```tsx
import Severity from "@/components/ui/Severity";
import StageCheck from "@/components/ui/StageCheck";
import { NO_DATA_SENTENCE, fill } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { DESK, STAGE_NAME, plural } from "@/lib/review-copy";
import { STAGE_KEYS, type ReviewItem, type ReviewStage } from "@/lib/review-types";
import StagePairs from "../desk/StagePairs";
import s from "./detail.module.css";

type Shown = { name: string; status: "ok" | "warn" | "fail"; stage: ReviewStage | null };

/** §5.5.3 "Automated checks". Notes come structured from the API (D13); the web never parses them. */
export default function AutomatedChecks({ item }: { item: ReviewItem }) {
  const noData = item.ingredients.some((g) => g.coverage.coverage === "none");
  const shown: Shown[] = STAGE_KEYS.map((k) => {
    const st = item.stages.find((x) => x.stage === k) ?? null;
    return { name: STAGE_NAME[k], status: st ? st.status : "fail", stage: st };
  });
  const ok = shown.filter((x) => x.status === "ok").length, w = shown.filter((x) => x.status === "warn").length;
  const f = shown.filter((x) => x.status === "fail").length;
  const summary = [ok ? `${ok} OK` : "", w ? `${w} ${plural(w, "warning", "warnings")}` : "", f ? `${f} failed` : ""].filter(Boolean).join(", ");
  const quiet = shown.filter((x) => x.status === "ok" && x.stage !== null && x.stage.notes.length === 0
    && !(x.stage.stage === "ddinter" && noData));
  const loud = shown.filter((x) => !quiet.includes(x));
  return (
    <section className={s.sec} aria-labelledby="sec-checks">
      <div className={s.secT}><h2 id="sec-checks">{DESK.checksTitle}</h2>
        <span>{summary}. {fill(DESK.checksRun, { date: fmtUtc(item.batch.runAt) })}</span></div>
      <div className={s.stages}>
        {loud.map((x) => <StageCheck key={x.name} name={x.name} status={x.status}>{body(x, item, noData)}</StageCheck>)}
        {quiet.length > 0 && <StageCheck name={quiet.map((x) => x.name).join(", ")} status="ok" />}
      </div>
    </section>
  );
}

function body(x: Shown, item: ReviewItem, noData: boolean) {
  if (x.stage === null) return <p className="stage-note">{DESK.noNote}</p>;
  const st = x.stage, ddinter = st.stage === "ddinter";
  const lines = st.notes.filter((n) => !(ddinter && (n.kind === "text_missing" || (noData && n.kind === "no_data"))));
  const pairs = ddinter ? st.textMissing : [];
  const listId = `stage-pairs-${item.conceptId}`;
  return (
    <>
      {ddinter && noData && <p className="stage-note">{NO_DATA_SENTENCE}</p>}
      {pairs.length > 0 && (
        <>
          <p className="stage-note">{fill(DESK.textMissing, { n: pairs.length, pairs: plural(pairs.length, "pair", "pairs") })}</p>
          <StagePairs targetId={listId} count={pairs.length} />
          <ul className="stage-pairs" id={listId}>
            {pairs.map((p) => (
              <li className="stage-pair" key={`${p.ddinterA}/${p.ddinterB}`}>
                {p.nameA} + {p.nameB} <span className="mono">{p.ddinterA}/{p.ddinterB}</span>{p.severity !== null && <Severity level={p.severity} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {lines.map((n, i) => <p className="stage-note" key={i}>{n.text}</p>)}
    </>
  );
}
```

Create `web/components/review/detail/History.tsx`:

```tsx
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, historyText } from "@/lib/review-copy";
import type { ReviewItem } from "@/lib/review-types";
import s from "./detail.module.css";

/** §5.6.5 "History", oldest first. Roles only; "(you)" from the API's `mine`. Notes are shown in .raw, never logged. */
export default function History({ item }: { item: ReviewItem }) {
  return (
    <section className={s.sec} aria-labelledby="sec-hist">
      <div className={s.secT}><h2 id="sec-hist">{DESK.historyTitle}</h2><span>{DESK.historySub}</span></div>
      <ol className={s.hist}>
        {item.history.map((e, i) => (
          <li key={i}>
            <span className={s.histT}>{fmtUtc(e.at)}<span>{fmtDhaka(e.at)}</span></span>
            <span>{historyText(e, item.batchId)}{e.kind === "decision" && e.note ? <> <span className="raw">{e.note}</span></> : null}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

Create `web/components/review/detail/EvidenceContent.tsx`:

```tsx
import { DESK_NEW, fill } from "@/lib/copy";
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, STAGE_NAME } from "@/lib/review-copy";
import { STAGE_KEYS, type ReviewItem } from "@/lib/review-types";

const WORD = { ok: "OK", warn: "Warning", fail: "Failed" } as const;
const json = (v: unknown) => JSON.stringify(v, null, 2);

/** §5.6.3 drawer body, rendered by the server (the desk only shows or hides it). */
export default function EvidenceContent({ item }: { item: ReviewItem }) {
  const at = item.version.extractedAt;
  return (
    <>
      <h5>{DESK.rawBrandRow}</h5>
      <p className="dr-note">{DESK.rawBrandNote}</p>
      <pre>{json(item.brand)}</pre>
      <h5>{DESK.dgdaCodes}</h5>
      <pre>{json(item.dgdaIngredients)}</pre>
      <details><summary>{DESK_NEW.deskMisc.rawDgdaRecord}</summary><pre>{json(item.sourceJson)}</pre></details>
      <h5>{DESK.pipelineNotes}</h5>
      <dl className="dr-dl">
        {STAGE_KEYS.map((k) => {
          const st = item.stages.find((x) => x.stage === k);
          const note = st?.notes.map((n) => n.text).join("; ") ?? "";
          return [
            <dt key={`t${k}`}>{STAGE_NAME[k]}</dt>,
            <dd key={`d${k}`}><span>{st ? WORD[st.status] : WORD.fail}</span>{note ? <span className="raw">{note}</span> : <span className="dr-note">{DESK.noNote}</span>}</dd>,
          ];
        })}
      </dl>
      <h5>{DESK.pipeline}</h5>
      <dl className="dr-dl">
        <dt>{DESK.conceptId}</dt><dd><span className="mono">{item.conceptId}</span></dd>
        {item.clinicalDrug && <><dt>{DESK.signature}</dt><dd><span className="mono">{item.clinicalDrug.signature}</span></dd></>}
        <dt>{DESK.extractedAt}</dt><dd>{at ? <>{fmtUtc(at)}<span className="dr-note">{fmtDhaka(at)}</span></> : DESK.noNote}</dd>
        <dt>{DESK.batchRun}</dt><dd>{fmtUtc(item.batch.runAt)}<span className="dr-note">{fill(DESK.batchRunSub, { id: item.batchId, n: item.batch.itemCount })}</span></dd>
      </dl>
    </>
  );
}
```

Create `web/components/review/desk/DiffTable.tsx`:

```tsx
import { fmtUtc } from "@/lib/format";
import { DESK } from "@/lib/review-copy";
import type { DiffRow } from "@/lib/review-types";
import s from "../detail/detail.module.css";

const cell = (row: DiffRow, v: string | null) => (v === null ? "" : row.field === "Pipeline extracted at" ? fmtUtc(v) : v);

/** §5.11 diff table: "You were reviewing" against "Now", changed cells only. Used by the server and the desk. */
export default function DiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <>
      <div className="cmp-wrap">
        <table className="cmp">
          <caption>{DESK.diffCaption}</caption>
          <thead><tr><th scope="col">{DESK.cmpField}</th><th scope="col" className="cmp-src">{DESK.diffBefore}</th><th scope="col">{DESK.diffNow}</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}><th scope="row">{row.field}</th><td className="cmp-src">{cell(row, row.before)}</td><td className={s.chg}>{cell(row, row.now)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.diffFoot}>{DESK.diffFooter}</p>
    </>
  );
}
```

Create `web/components/review/detail/BackInReviewCard.tsx`:

```tsx
import ReviewStatus from "@/components/ui/ReviewStatus";
import { DESK_NEW, NOT_REVIEWED, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { DiffRow, ReviewItem } from "@/lib/review-types";
import DiffTable from "../desk/DiffTable";
import s from "./detail.module.css";

/** §5.11 "Back in review" card: why the record left public view, and the diff when there is one. */
export default function BackInReviewCard({ item, diff }: { item: ReviewItem; diff: DiffRow[] | null }) {
  const text = item.reopen?.reason === "shared_change" ? DESK_NEW.history.backSharedChange : fill(DESK.backRerun, { notReviewed: NOT_REVIEWED });
  return (
    <div className={s.noteCard}>
      <div><ReviewStatus status="back_in_review" /></div>
      <p>{text}</p>
      {diff && diff.length > 0 && <DiffTable rows={diff} />}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && npx vitest run tests/review-detail.test.tsx && npm run lint:css`
Expected: PASS; lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/components/review/detail web/components/review/desk/DiffTable.tsx web/components/review/desk/StagePairs.tsx \
  web/tests/review-detail.test.tsx
git commit -m "feat(web): record header, comparison table, checks, history, evidence and back-in-review card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Web — the Interactions section: per ingredient, the chosen-entry statement and the batch block (§5.6.1, §5.6.2, §5.6.4, D14, D46)

**Files:**
- Create: `web/components/review/detail/Interactions.tsx`
- Modify: `web/components/ui/PairCard.tsx`, `web/components/ui/PairCard.module.css`
- Test: `web/tests/review-interactions.test.tsx`, `web/tests/pair-card.test.tsx` (one case added)

**Interfaces:**
- Consumes: `ReviewItem`, `IngredientSummary`, `BatchPair`, `NotCheckedPair` (Task 7); `strengthText` (Task 8); `DESK`, `DESK_NEW`, `fill`, `fillNodes`, `plural` (Task 9); `NoDataBlock`, `NoDataChip`, `Severity`, `PairCard` (P1A); `severityOf` (existing `@/lib/severity`); module classes from `detail.module.css` (Task 15).
- Produces:
  - `Interactions({ item: ReviewItem })` — the "Interactions" section.
  - `PairCard` gains three optional props, all backwards compatible: `meta?: ReactNode` (was `string`), `heading?: "h4"` (the names render in `<h4 class="pair-names">`, §5.6.2), `sourceOpen?: ReactNode` (the footer text shown while the text is expanded; without it the footer never changes).
  - Rules (§5.6.2): the batch block is shown when at least one ingredient has a chosen entry and none has coverage `none`; `nc` counts every not-checked substance pair except `same_product`; no-data pairs are the hatched `.nc` block; `not_run`, `no_route` and `unmapped` pairs are plain lines naming the brand whose substance the reason applies to.

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/pair-card.test.tsx` inside its `describe`:

```tsx
  it("renders the names as an h4 and both footers, so CSS can switch between truncated and in full", () => {
    const html = r(<PairCard id="p3" severity="moderate" names="Warfarin + Aspirin" heading="h4" meta={<>With Aspirin. <span className="mono">a/b</span></>}
      text={{ kind: "management", body: "Monitor INR." }} source="Management, truncated." sourceOpen="Management, in full." surface="reviewer" />);
    expect(html).toContain('<h4 class="pair-names">Warfarin + Aspirin</h4>');
    expect(html).toContain('<p class="pair-meta">With Aspirin. <span class="mono">a/b</span></p>');
    expect(html).toContain('<span class="whenClosed">Management, truncated.</span><span class="whenOpen">Management, in full.</span>');
  });
```

Create `web/tests/review-interactions.test.tsx`:

```tsx
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Interactions from "@/components/review/detail/Interactions";
import { NO_DATA_SENTENCE, NOT_RUN } from "@/lib/copy";
import type { BatchPairs, IngredientSummary, ReviewItem } from "@/lib/review-types";
import { pilotItem } from "./fixtures/pilot";

/** The visible text: tags removed and React's entity escapes decoded. */
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("the eye drop (§1.5, §5.6.1, §5.6.4)", () => {
  const html = r(<Interactions item={pilotItem("chloramphenicol")} />);
  it("states the chosen entry", () => {
    expect(html).toContain('Chloramphenicol is checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic).');
  });
  it("counts the chosen entry only, then lists every entry with its total", () => {
    expect(html).toContain("Interaction data found for this product&#x27;s route (ophthalmic): <span class=\"mono\">DDInter352 (ophthalmic)</span>");
    expect(html).toContain('<div class="chipRow" role="group" aria-label="Drug pairs in DDInter 2.0 by severity">');
    expect(html).toContain('<span class="sev sev--major">Major <b class="sev-n">1</b></span>');
    expect(html).toContain('<span class="sev sev--moderate">Moderate <b class="sev-n">111</b></span>');
    expect(strip(html)).toContain("112 drug pairs in total. 0 drug and disease interactions, 0 drug and food interactions.");
    expect(strip(html)).toContain("All DDInter entries for Chloramphenicol: DDInter351 (systemic), DDInter352 (ophthalmic), DDInter353 (otic), 654 drug pairs.");
    expect(html).not.toContain("DDInter351 (systemic)</span>,");
  });
  it("its batch block names 28 batch pairs and none with Chloramphenicol", () => {
    expect(strip(html)).toContain("0 pairs found in DDInter 2.0.");
    expect(strip(html)).toContain("None of the 28 batch pairs from DDInter 2.0 involve Chloramphenicol.");
  });
});

describe("statements for systemic, assumed and route-less products", () => {
  const base = pilotItem("napa");
  const g = base.ingredients[0];
  const assumed = (route: string | null): ReviewItem => ({ ...base,
    clinicalDrug: route === null ? null : { ...base.clinicalDrug!, route },
    ingredients: [{ ...g, ddinter: { ...g.ddinter, chosen: [{ ...g.ddinter.chosen[0], routeAssumed: true }] } }] });

  it("an exact systemic entry needs no statement", () => {
    expect(r(<Interactions item={base} />)).not.toContain("is checked against");
  });
  it("assumed for a route", () => {
    const html = r(<Interactions item={assumed("topical")} />);
    expect(html).toContain("Route assumed: this product&#x27;s route is topical and DDInter has no topical entry for Acetaminophen, so the systemic entry <span class=\"mono\">DDInter14</span> is used.");
    expect(strip(html)).toContain("Interaction data found for this product's route (topical): DDInter14 (systemic), route assumed");
  });
  it("assumed because the product has no route", () => {
    const html = r(<Interactions item={assumed(null)} />);
    expect(html).toContain("Route assumed: this product has no route on record, so the systemic entry <span class=\"mono\">DDInter14</span> is used.");
    expect(strip(html)).toContain("Interaction data found: DDInter14 (systemic), route assumed");
  });
});

describe("no data, no entry for the route, not run, unmapped (§5.6.1, D46)", () => {
  it("no data: the hatch block, always open, with the batch pairs it cannot check", () => {
    const item = pilotItem("domperidone", { batchPairs: { totalBatchPairs: 28, pairs: [], notChecked: [
      { substance: "Domperidone", partnerSubstance: "Warfarin", partners: [{ conceptId: "w", tradeName: "G Warfarin", index: 6 }], reason: "no_data", side: "this", route: "systemic" },
      { substance: "Domperidone", partnerSubstance: "Acetaminophen", partners: [{ conceptId: "n", tradeName: "Napa", index: 8 }], reason: "no_data", side: "this", route: "systemic" },
    ] } });
    const html = r(<Interactions item={item} />);
    expect(html).toContain('<div class="nodata-block hatch" role="note">');
    expect(html).toContain(NO_DATA_SENTENCE);
    expect(html).toContain("Drug, disease and food interactions: no data in DDInter 2.0.");
    expect(html).toContain("Not checked, 2 pairs with this batch:");
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + Warfarin</span>');
    expect(html).not.toContain("With the other medicines in this batch");
    expect(html).not.toContain("<details");
  });

  const napa = pilotItem("napa");
  const g = napa.ingredients[0];
  const one = (ing: IngredientSummary, route: string | null = "systemic"): ReviewItem =>
    ({ ...napa, clinicalDrug: route === null ? null : { ...napa.clinicalDrug!, route }, ingredients: [ing] });

  it("entries but none for the route: plain text, no count, no hatch", () => {
    const ing = { ...g, ddinter: { chosen: [], entries: g.ddinter.entries.map((e) => ({ ...e, routeScope: "otic" })) } };
    const html = r(<Interactions item={one(ing, "ophthalmic")} />);
    expect(html).toContain("No DDInter entry for this product&#x27;s route (ophthalmic). Its pairs are not checked.");
    expect(html).not.toContain("drug pairs in total");
    expect(html).not.toMatch(/hatch|sev--nodata/);
    expect(r(<Interactions item={one(ing, null)} />)).toContain("No DDInter entry fits this product, which has no route on record. Its pairs are not checked.");
  });

  it("not run: the NOT_RUN line, never the no-data sentence or the hatch", () => {
    const html = r(<Interactions item={one({ ...g, coverage: { coverage: "not_run", note: "" }, ddinter: { chosen: [], entries: [] } })} />);
    expect(html).toContain(NOT_RUN);
    expect(html).not.toContain(NO_DATA_SENTENCE);
    expect(html).not.toMatch(/hatch|sev--nodata/);
  });

  it("unmapped: the ingredient has no substance mapping yet", () => {
    const html = r(<Interactions item={one({ ...g, bdsId: null, name: "Newmol", raw: "Newmol", codes: [], names: [],
      coverage: { coverage: "not_run", note: "" }, ddinter: { chosen: [], entries: [] } })} />);
    expect(html).toContain("Not checked: Newmol in Napa has no substance mapping yet.");
  });
});

describe("the batch block (§5.6.2)", () => {
  const partners = (...xs: [string, number][]) => xs.map(([tradeName, index]) => ({ conceptId: tradeName, tradeName, index }));
  const bp: BatchPairs = {
    totalBatchPairs: 28,
    pairs: [
      { ddinterA: "DDInter1951", ddinterB: "DDInter20", nameA: "Warfarin", nameB: "Acetylsalicylic acid", substance: "Warfarin",
        partnerSubstance: "Acetylsalicylic acid", severity: "major", actions: ["synergy"], interaction: "May increase bleeding.",
        management: "Avoid the combination; monitor INR.", partners: partners(["Aspirin", 2]) },
      { ddinterA: "DDInter1951", ddinterB: "DDInter393", nameA: "Warfarin", nameB: "Clarithromycin", substance: "Warfarin",
        partnerSubstance: "Clarithromycin", severity: "moderate", actions: ["metabolism"], interaction: "May increase the effect of warfarin.",
        management: null, partners: partners(["Clarith", 9]) },
      { ddinterA: "DDInter14", ddinterB: "DDInter1951", nameA: "Acetaminophen", nameB: "Warfarin", substance: "Warfarin",
        partnerSubstance: "Acetaminophen", severity: "unknown", actions: ["unknown"], interaction: null, management: null,
        partners: partners(["Napa", 8]) },
    ],
    notChecked: [
      { substance: "Warfarin", partnerSubstance: "Domperidone", partners: partners(["Domperidone", 5]), reason: "no_data", side: "partner", route: "systemic" },
      { substance: "Warfarin", partnerSubstance: "Newmol", partners: partners(["Newdrug", 11]), reason: "unmapped", side: "partner", route: "systemic" },
      { substance: "Warfarin", partnerSubstance: "Mupirocin", partners: partners(["Bactroban", 12]), reason: "no_route", side: "partner", route: "nasal" },
      { substance: "Warfarin", partnerSubstance: "Testmol", partners: partners(["Testa", 13]), reason: "not_run", side: "partner", route: "systemic" },
    ],
  };
  const html = r(<Interactions item={pilotItem("g-warfarin", { batchPairs: bp })} />);
  const text = strip(html);

  it("summary and chips", () => {
    expect(text).toContain("With the other medicines in this batch");
    expect(text).toContain("3 pairs found in DDInter 2.0. 4 pairs not checked.");
    expect(html).toContain('aria-label="Batch pairs by severity"');
  });

  it("pairs with text are cards, management first, interaction otherwise, with mono ids", () => {
    expect(html).toContain('<h4 class="pair-names">Warfarin + Acetylsalicylic acid</h4>');
    expect(html).toContain('<p class="pair-meta">With Aspirin (record 2). Action in DDInter: synergy. <span class="mono">DDInter1951/DDInter20</span></p>');
    expect(html).toContain('<span class="whenClosed">Management, truncated.</span><span class="whenOpen">Management, in full.</span>');
    expect(html).toContain("Interaction description, truncated. DDInter has no management text for this pair.");
    expect(html.indexOf("Acetylsalicylic acid</h4>")).toBeLessThan(html.indexOf("Clarithromycin</h4>"));
  });

  it("pairs without text are grouped, and an unclassified pair is never low risk", () => {
    expect(text).toContain("1 pair with no text in DDInter 2.0");
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">1</b></span>');
    expect(html).toContain("<b>Warfarin + Acetaminophen</b>");
    expect(text).toContain("with Napa (record 8)");
    expect(text).toContain("Action in DDInter: unknown. DDInter 2.0 has no interaction or management text for this pair. A pair whose severity is not classified by DDInter is never treated as low risk.");
  });

  it("no-data pairs are the hatched block; the other reasons are plain lines naming the brand", () => {
    expect(text).toContain(`Not checked. Domperidone: ${NO_DATA_SENTENCE}`);
    expect(html).toContain('<span class="sev sev--nodata">Warfarin + Domperidone</span>');
    expect(text).toContain("Not checked: Newmol in Newdrug has no substance mapping yet.");
    expect(text).toContain("Not checked: Bactroban's route is nasal and DDInter has no entry for Mupirocin on that route.");
    expect(text).toContain("Not checked: DDInter mapping has not run for Testmol in Testa.");
    expect(html.match(/sev--nodata/g)).toHaveLength(1);
  });

  it("same-product pairs say so", () => {
    const combo = r(<Interactions item={pilotItem("amoxycillin", { batchPairs: { totalBatchPairs: 28, pairs: [], notChecked: [
      { substance: "Clavulanic acid", partnerSubstance: "Amoxicillin", partners: [], reason: "same_product", side: "this", route: "systemic" }] } })} />);
    expect(strip(combo)).toContain("Not checked: Clavulanic acid + Amoxicillin are ingredients of this product.");
    expect(strip(combo)).toContain("0 pairs found in DDInter 2.0.");
    expect(strip(combo)).not.toContain("not checked.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/review-interactions.test.tsx tests/pair-card.test.tsx`
Expected: FAIL — `Interactions` does not resolve; `PairCard` prints `<span class="pair-names">` for `heading="h4"`.

- [ ] **Step 3: Extend PairCard**

Replace `web/components/ui/PairCard.module.css` with:

```css
/* Ported from Boards P and R (.pair-text.is-open); doubled class to outrank .pair-text. */
.open.open { display: block; -webkit-line-clamp: unset; overflow: visible; }
/* Footer wording follows the text: "truncated" while clamped, "in full" while open (the server renders it open). */
:global(.pair-text):not(.open) ~ :global(.pair-source) .whenOpen { display: none; }
:global(.pair-text).open ~ :global(.pair-source) .whenClosed { display: none; }
```

Replace `web/components/ui/PairCard.tsx` with:

```tsx
import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import Severity from "./Severity";
import styles from "./PairCard.module.css";

/**
 * §3.4 PairCard. DDInter text is passed through as given (truncated by CSS, never rewritten). The server renders it
 * unclamped; the Expander island clamps it once JavaScript runs and offers the toggle. With `sourceOpen`, the footer
 * reads `source` while clamped and `sourceOpen` while open (Board R's "…, truncated." / "…, in full.").
 */
export default function PairCard({ id, severity, names, meta, text, source, sourceOpen, surface, heading }: {
  id: string; severity: string; names: string; meta?: ReactNode;
  text?: { kind: "management" | "interaction"; body: string }; source: ReactNode; sourceOpen?: ReactNode;
  surface: "reviewer" | "public"; heading?: "h4";
}) {
  const textId = `${id}-text`;
  return (
    <article className="pair">
      <div className="pair-head">
        <Severity level={severity} />
        {heading === "h4" ? <h4 className="pair-names">{names}</h4> : <span className="pair-names">{names}</span>}
      </div>
      {meta && <p className="pair-meta">{meta}</p>}
      {text && <p className={`pair-text ${styles.open}`} id={textId}>{text.body}</p>}
      <p className="pair-source">
        {text && sourceOpen !== undefined
          ? <><span className={styles.whenClosed}>{source}</span><span className={styles.whenOpen}>{sourceOpen}</span></>
          : source}
        {text && <> <Expander targetId={textId} label={surface} /></>}
      </p>
    </article>
  );
}
```

- [ ] **Step 4: Write the Interactions section**

Create `web/components/review/detail/Interactions.tsx`:

```tsx
import type { ReactNode } from "react";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import PairCard from "@/components/ui/PairCard";
import Severity from "@/components/ui/Severity";
import { DESK_NEW, NO_DATA_SENTENCE, NOT_RUN, fill } from "@/lib/copy";
import { strengthText } from "@/lib/relations";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import type { BatchPair, IngredientSummary, NotCheckedPair, ReviewItem } from "@/lib/review-types";
import { SEVERITIES, severityOf } from "@/lib/severity";
import s from "./detail.module.css";

const mono = (t: ReactNode) => <span className="mono">{t}</span>;
const ra = DESK_NEW.routeAware;

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
    body = <NoDataBlock title={g.name} extra={<>
      <p className="nodata-text">{DESK.noDataLine}</p>
      <div className="nodata-pairs"><span>{fill(DESK.notCheckedWithBatch, { k: nc.length })}</span>
        {nc.map((n) => <NoDataChip key={n.partnerSubstance} label={`${n.substance} + ${n.partnerSubstance}`} />)}</div>
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
    const ids = mono(g.ddinter.chosen.map((c) => `${c.ddinterId} (${c.routeScope})`).join(", "));
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

const recordsOf = (p: { partners: { tradeName: string; index: number }[] }) =>
  p.partners.map((x) => fill(DESK.record, { name: x.tradeName, k: x.index })).join(", ");

function Card({ p }: { p: BatchPair }) {
  const management = p.management !== null;
  const kind = management ? "management" : "interaction";
  const suffix = management ? "" : DESK.noManagementForPair;
  return (
    <PairCard id={`pair-${p.ddinterA}-${p.ddinterB}`} severity={p.severity} names={`${p.substance} + ${p.partnerSubstance}`} heading="h4"
      meta={<>{fill(DESK.pairWith, { partners: recordsOf(p) })}{p.actions.length > 0 && fill(DESK.actionIn, { actions: p.actions.join(", ") })}
        {mono(`${p.ddinterA}/${p.ddinterB}`)}</>}
      text={{ kind, body: (p.management ?? p.interaction)! }}
      source={`${management ? DESK.managementTruncated : DESK.interactionTruncated}${suffix}`}
      sourceOpen={`${management ? DESK.managementFull : DESK.interactionFull}${suffix}`} surface="reviewer" />
  );
}

function NoText({ pairs }: { pairs: BatchPair[] }) {
  const groups = SEVERITIES.map((sev) => [sev, pairs.filter((p) => severityOf(p.severity) === sev)] as const).filter(([, g]) => g.length > 0);
  const actions = [...new Set(pairs.flatMap((p) => p.actions))];
  const n = pairs.length;
  return (
    <div className={s.ntx}>
      <p className={s.subH}>{fill(DESK.noTextHeading, { k: n, pairs: plural(n, "pair", "pairs") })}</p>
      {groups.map(([sev, g]) => (
        <div className={s.ntxG} key={sev}>
          <Severity level={sev} count={g.length} />
          <ul className={s.ntxList}>{g.map((p) => (
            <li key={`${p.ddinterA}/${p.ddinterB}`}><b>{p.substance} + {p.partnerSubstance}</b>{" "}
              <span className={s.ntxWith}>{fill(DESK.noTextWith, { records: recordsOf(p) })}</span> {mono(`${p.ddinterA}/${p.ddinterB}`)}</li>
          ))}</ul>
        </div>
      ))}
      <p className={s.ingQ}>{fill(DESK.noTextClosing, { actions: actions.length ? fill(DESK.actionIn, { actions: actions.join(", ") }) : "",
        this: n === 1 ? "this pair" : "these pairs" })}{groups.some(([sev]) => sev === "unknown") && DESK.noTextUnknown}</p>
    </div>
  );
}

function otherLines(n: NotCheckedPair, brand: string): string[] {
  const brands = n.side === "this" ? [brand] : n.partners.map((p) => p.tradeName);
  const substance = n.side === "this" ? n.substance : n.partnerSubstance;
  return brands.map((b) => n.reason === "no_route"
    ? (n.route === null ? fill(ra.notCheckedNoRouteNoRoute, { brand: b, substance }) : fill(ra.notCheckedNoRoute, { brand: b, route: n.route, substance }))
    : n.reason === "unmapped" ? fill(ra.notCheckedUnmapped, { ingredient: substance, brand: b })
    : fill(DESK_NEW.notRun.notCheckedNotRun, { substance, brand: b }));
}

function BatchBlock({ item, brand }: { item: ReviewItem; brand: string }) {
  const { pairs, notChecked, totalBatchPairs } = item.batchPairs;
  const nc = notChecked.filter((n) => n.reason !== "same_product");
  const counts = { major: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const p of pairs) counts[severityOf(p.severity)]++;
  const withText = pairs.filter((p) => p.management !== null || p.interaction !== null);
  const noText = pairs.filter((p) => p.management === null && p.interaction === null);
  const noData = nc.filter((n) => n.reason === "no_data");
  const noDataNames = [...new Set(noData.map((n) => (n.side === "this" ? n.substance : n.partnerSubstance)))];
  const others = [...new Set(nc.filter((n) => n.reason !== "no_data").flatMap((n) => otherLines(n, brand)))];
  const same = notChecked.filter((n) => n.reason === "same_product");
  return (
    <div className={s.sec}>
      <p className={s.subH}>{DESK.batchTitle}</p>
      <p className={s.ingQ}>{fill(DESK.batchFound, { p: pairs.length, pairs: plural(pairs.length, "pair", "pairs") })}
        {nc.length > 0 && fill(DESK.batchNotChecked, { nc: nc.length, pairs: plural(nc.length, "pair", "pairs") })}</p>
      {chips(counts, DESK.batchChips)}
      {item.ingredients.filter((g) => g.ddinter.chosen.length > 0 && !pairs.some((p) => p.substance === g.name)).map((g) => (
        <p className={s.ingQ} key={g.name}>{fill(DESK.noneInvolve, { n: totalBatchPairs, name: g.name })}</p>
      ))}
      {withText.length > 0 && <div className={s.pairs}>{withText.map((p) => <Card key={`${p.ddinterA}/${p.ddinterB}`} p={p} />)}</div>}
      {noText.length > 0 && <NoText pairs={noText} />}
      {noData.length > 0 && (
        <div className={s.nc}>
          <p><b>{DESK.notCheckedLead}</b> {noDataNames.join(", ")}: {NO_DATA_SENTENCE}</p>
          <div className={s.chipRow}>{noData.map((n) => <NoDataChip key={`${n.substance}+${n.partnerSubstance}`} label={`${n.substance} + ${n.partnerSubstance}`} />)}</div>
        </div>
      )}
      {others.map((line) => <p className={s.ingQ} key={line}>{line}</p>)}
      {same.map((n) => <p className={s.ingQ} key={`${n.substance}+${n.partnerSubstance}`}>{fill(ra.notCheckedSameProduct, { a: n.substance, b: n.partnerSubstance })}</p>)}
    </div>
  );
}

/** §5.6 "Interactions": the chosen-entry statement, one block per ingredient, then the batch block (route-aware, D14). */
export default function Interactions({ item }: { item: ReviewItem }) {
  const route = item.clinicalDrug?.route ?? null;
  const brand = item.brand?.tradeName ?? item.conceptId;
  const hasData = item.ingredients.some((g) => g.ddinter.chosen.length > 0) && !item.ingredients.some((g) => g.coverage.coverage === "none");
  return (
    <section className={s.sec} aria-labelledby="sec-ix">
      <div className={s.secT}><h2 id="sec-ix">{DESK.interactionsTitle}</h2><span>{DESK.interactionsSub}</span></div>
      <Statements item={item} route={route} />
      {item.ingredients.map((g, i) => <Ingredient key={i} g={g} item={item} route={route} brand={brand} />)}
      {hasData && <BatchBlock item={item} brand={brand} />}
    </section>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/review-interactions.test.tsx tests/pair-card.test.tsx tests/marks.test.ts && npm run lint:css`
Expected: PASS (the marks guard still passes: the hatch appears only through `NoDataBlock` and `NoDataChip`).

- [ ] **Step 6: Commit**

```bash
git add web/components/review/detail/Interactions.tsx web/components/ui/PairCard.tsx web/components/ui/PairCard.module.css \
  web/tests/review-interactions.test.tsx web/tests/pair-card.test.tsx
git commit -m "feat(web): route-aware Interactions section with chosen-entry statements and the batch block

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17a: Web — desk parts: context, drafts, toast, sheet, record list, search, tools, stale banner, complete view and the Turnstile options (§5.3, §5.4, §5.5.1, §5.8.4, §5.10–§5.12, §5.14)

Tasks 17a, 17b and 17c wire Tasks 10–12 into the two islands of §4.2. `ReviewDesk` (17c, in the batch layout) owns every piece of state that must survive record navigation: the commit machine, the Turnstile token, `viewedVersion` and the held subtree per record, drafts, the drawer, the sheet, the poll and the live region. `DeskRecordContext` (17b, in the record page) registers the record's data and renders the panes; while the open record is stale it renders the subtree the desk holds for `viewedVersion`, never the refreshed one (§5.11, D44). This task writes the desk API type and the parts that only read it, each tested against a stubbed desk.

**Files:**
- Create: `web/components/review/desk/context.ts`, `web/components/review/desk/drafts.ts`, `web/components/review/desk.module.css`, `web/components/review/desk/Toast.tsx`, `web/components/review/desk/ShortcutsSheet.tsx`, `web/components/review/desk/RecordListbox.tsx`, `web/components/review/desk/ListSearch.tsx`, `web/components/review/desk/DetailTools.tsx`, `web/components/review/desk/StaleBanner.tsx`, `web/components/review/desk/CompleteView.tsx`
- Modify: `web/components/TurnstileField.tsx` (optional `appearance`, `refreshExpired`, `hideStatus`; reuse a Turnstile script already on the page; drop a stale pending load)
- Test: `web/tests/desk-parts.test.tsx`, `web/tests/turnstile-field.test.tsx` (two cases added); helpers `web/tests/desk-reg.ts` and `web/tests/desk-stub.tsx` (not test files; 17b and 17c reuse them)

**Interfaces:**
- Consumes: `initialMachine`, `type MachineState`, `type Op` (Task 10); `BarCtx`, `rowHint` (Task 11); `recordHref` (Task 11 `hrefs.ts`); `DESK`, `DESK_NEW`, `SHEET_ROWS`, `toastSub`, `fill` (Task 9); `UNDO_SECONDS`, `setDeskSettingAction` (Task 9); `DiffTable` (Task 15); `pilotRows` (Task 8 fixture); `TurnstileField` (P1A); `Button`, `buttonClass`, `Kbd`, `Banner`, `ReviewStatus`, `Segmented` (P1A); `useRouter` from `next/navigation`.
- Produces:
  - `context.ts`: `type RowRef = { index; conceptId; tradeName; clinicalDisplayName: string | null; displayStatus: DisplayStatus; hint: ItemHint; version: Version; href: string }`; `type RecordRegistration = { batchId; conceptId; tradeName; index; total; displayStatus; version; stagesBlocked; sourceUrl; show: FilterKey; q: string; rows: RowRef[]; all: RowRef[]; requestId: string; prevHref: string | null; nextHref: string | null; complete: boolean }`; `type DeskApi` (with `navigate(href: string, focusKey?: string)` and `announce(text: string)`, which writes the page's one polite live region through P1A's `announce(region, text)` from `@/lib/live-region`); `DeskCtx`; `useDesk(): DeskApi`; `barFromRegistration(reg, role, undoSeconds): BarCtx`.
  - `drafts.ts`: `DRAFT_PREFIX = "intellidrugs-draft:"`, `draftKey(b, c)`, `loadDraft`, `saveDraft`, `clearDraft`, `clearAllDrafts()` (Task 20's sign-out uses it).
  - Parts (each `"use client"`, under the allowlisted `components/review/desk/`): `Toast({ view, seconds, singleKeys, onUndo })`, `ShortcutsSheet({ open, onClose, undoSeconds, singleKeys, sendKeys, onUndo, onKeys })`, `RecordListbox({ reg })`, `ListSearch({ batchId, conceptId, show, q })`, `DetailTools({ reg })`, `StaleBanner({ name, reason })`, `CompleteView()`.
  - `desk.module.css` classes used by 17b, 17c and Task 18 (`panes`, `side`, `list`, `listH`, `listT`, `listBody`, `detail`, `dBody`, `dScroll`, `app`, `toolbar`, `turnstile`, …). `.dScroll` and, below 1024 px, `<html>` use `scroll-padding-bottom: var(--bar-h, 0px)`; ReviewDesk (17c) measures `--bar-h`.
  - `TurnstileField` gains `appearance?: "always" | "interaction-only"`, `refreshExpired?: "auto" | "manual"`, `hideStatus?: boolean`.
  - Test helpers: `makeReg(key, over?, version?)` from `web/tests/desk-reg.ts`; `stubDesk(reg, over?)` and `WithDesk({ desk, children })` from `web/tests/desk-stub.tsx`.

- [ ] **Step 1: Write the failing tests**

Add to `web/tests/turnstile-field.test.tsx`, inside its `describe` (after P1A's cases: the second case relies on `loadTurnstile` dropping the promise P1A's "loads Cloudflare's explicit-render script once" case left pending, whose script tag it removes):

```tsx
  it("passes interaction-only appearance and auto refresh, can hide its status, and reuses a script already on the page", async () => {
    render(<TurnstileField siteKey="k" action="decision" appearance="interaction-only" refreshExpired="auto" hideStatus />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    expect(opts()).toMatchObject({ appearance: "interaction-only", "refresh-expired": "auto" });
    expect(screen.queryByText("Checking")).toBeNull();
  });

  it("waits for an implicit Turnstile script that is still loading instead of adding a second one", async () => {
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    document.head.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/"]').forEach((s) => s.remove());
    const implicit = document.createElement("script");
    implicit.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    document.head.appendChild(implicit);
    render(<TurnstileField siteKey="k" action="decision" />);
    expect(document.head.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/"]')).toHaveLength(1);
    (window as unknown as { turnstile?: typeof api }).turnstile = api;
    implicit.dispatchEvent(new Event("load"));
    await waitFor(() => expect(api.render).toHaveBeenCalled());
  });
```

Create `web/tests/desk-reg.ts`:

```ts
import type { RecordRegistration, RowRef } from "@/components/review/desk/context";
import { recordHref } from "@/components/review/desk/hrefs";
import type { Version } from "@/lib/review-types";
import { pilotRows } from "./fixtures/pilot";

/** The pilot list as the record page registers it (no filter, not the complete view). */
export function makeReg(key: string, over: Partial<RecordRegistration> = {}, version?: Version): RecordRegistration {
  const all: RowRef[] = pilotRows().map((r) => ({ ...r, href: recordHref("0001-pilot", r.conceptId) }));
  const i = all.findIndex((r) => r.conceptId.includes(key));
  const row = all[i];
  return {
    batchId: "0001-pilot", conceptId: row.conceptId, tradeName: row.tradeName, index: row.index, total: all.length,
    displayStatus: row.displayStatus, version: version ?? row.version, stagesBlocked: false,
    sourceUrl: `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/${row.conceptId}/`,
    show: "all", q: "", rows: all, all, requestId: "11111111-2222-4333-8444-555555555555",
    prevHref: i > 0 ? all[i - 1].href : null, nextHref: i < all.length - 1 ? all[i + 1].href : null, complete: false, ...over,
  };
}
```

Create `web/tests/desk-stub.tsx`:

```tsx
import type { ReactNode } from "react";
import { vi } from "vitest";
import { initialMachine } from "@/components/review/desk/commit-machine";
import { DeskCtx, barFromRegistration, type DeskApi, type RecordRegistration } from "@/components/review/desk/context";

/** A DeskApi with every action a mock, for rendering one desk part without ReviewDesk (Tasks 17a and 17b). */
export function stubDesk(reg: RecordRegistration, over: Partial<DeskApi> = {}): DeskApi {
  const machine = over.machine ?? initialMachine(8);
  return {
    ready: true, batchId: reg.batchId, role: "pharmacist", total: reg.total, singleKeys: true, undoSeconds: 8,
    machine, bar: { ...barFromRegistration(reg, "pharmacist", 8), machine }, complete: false, hint: null, botState: "passed",
    retryBusy: false, drawerOpen: false, sheetOpen: false, reportOpen: false, note: "", noteError: false, diff: null, diffOpen: false,
    slots: { batchesNav: null, batchCard: null },
    staleFor: () => null, netErrFor: () => null, statusFor: (_id, fallback) => fallback,
    register: vi.fn(), subtree: (_id, _v, node) => node, reloadOpen: vi.fn(), pressApprove: vi.fn(), clickReport: vi.fn(),
    closeReport: vi.fn(), setNote: vi.fn(), sendReport: vi.fn(), undo: vi.fn(), tryAgain: vi.fn(), retryCheck: vi.fn(),
    toggleDrawer: vi.fn(), toggleDiff: vi.fn(), navigate: vi.fn(), move: vi.fn(), openSource: vi.fn(), openFirst: vi.fn(),
    registerSearchClear: vi.fn(), announce: vi.fn(), ...over,
  };
}

export function WithDesk({ desk, children }: { desk: DeskApi; children: ReactNode }) {
  return <DeskCtx.Provider value={desk}>{children}</DeskCtx.Provider>;
}
```

Create `web/tests/desk-parts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import CompleteView from "@/components/review/desk/CompleteView";
import DetailTools from "@/components/review/desk/DetailTools";
import ListSearch from "@/components/review/desk/ListSearch";
import RecordListbox from "@/components/review/desk/RecordListbox";
import ShortcutsSheet from "@/components/review/desk/ShortcutsSheet";
import StaleBanner from "@/components/review/desk/StaleBanner";
import Toast from "@/components/review/desk/Toast";
import { DRAFT_PREFIX, clearAllDrafts, clearDraft, draftKey, loadDraft, saveDraft } from "@/components/review/desk/drafts";
import type { Op } from "@/components/review/desk/commit-machine";
import { makeReg } from "./desk-reg";
import { WithDesk, stubDesk } from "./desk-stub";

const NAPA = makeReg("napa");
const OP: Op = { conceptId: NAPA.conceptId, name: "Napa", role: "pharmacist", decision: "ok", note: "", viewedVersion: NAPA.version,
  requestId: "11111111-2222-4333-8444-555555555555" };

beforeEach(() => { sessionStorage.clear(); clearAllDrafts(); for (const f of Object.values(router)) f.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("note drafts (§5.10)", () => {
  it("are kept per record in sessionStorage and cleared on send or sign-out", () => {
    saveDraft("0001-pilot", "a", "strength should read 5 mg");
    saveDraft("0001-pilot", "b", "company is wrong");
    sessionStorage.setItem("other-key", "kept");
    expect(draftKey("0001-pilot", "a")).toBe(`${DRAFT_PREFIX}0001-pilot:a`);
    expect(sessionStorage.getItem("intellidrugs-draft:0001-pilot:a")).toBe("strength should read 5 mg");
    expect(loadDraft("0001-pilot", "a")).toBe("strength should read 5 mg");
    clearDraft("0001-pilot", "a");
    expect(loadDraft("0001-pilot", "a")).toBe("");
    clearAllDrafts();
    expect(loadDraft("0001-pilot", "b")).toBe("");
    expect(sessionStorage.getItem("other-key")).toBe("kept");
  });

  it("fall back to memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    saveDraft("0001-pilot", "a", "kept in memory");
    expect(loadDraft("0001-pilot", "a")).toBe("kept in memory");
  });
});

describe("toast (§5.8.4)", () => {
  it("running: name, the reviewer's window, Undo, and the countdown as the one allowed custom property", () => {
    const onUndo = vi.fn();
    render(<Toast view={{ mode: "running", op: OP }} seconds={20} singleKeys onUndo={onUndo} />);
    const toast = document.querySelector<HTMLElement>(".toast.is-running")!;
    expect(toast.style.getPropertyValue("--dur-commit")).toBe("20000ms");
    expect(toast.querySelector(".toast-msg")!.textContent).toContain("Napa marked correct.");
    expect(toast.querySelector(".toast-sub")!.textContent).toContain("Publishes in 20 seconds.");
    const undo = screen.getByRole("button", { name: /Undo/ });
    expect(undo.getAttribute("aria-keyshortcuts")).toBe("U");
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("saving: no Undo and no bar; nothing at all when idle", () => {
    const { rerender } = render(<Toast view={{ mode: "saving", op: OP }} seconds={8} singleKeys onUndo={vi.fn()} />);
    expect(document.querySelector(".toast-msg")!.textContent).toBe("Napa saving.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector(".toast-bar")).toBeNull();
    rerender(<Toast view={null} seconds={8} singleKeys onUndo={vi.fn()} />);
    expect(document.querySelector(".toast")).toBeNull();
  });
});

describe("shortcuts sheet (§5.14)", () => {
  it("is a modal dialog that focuses Close, traps Tab, closes on the scrim and reports setting choices", () => {
    const onClose = vi.fn(), onUndo = vi.fn(), onKeys = vi.fn();
    render(<ShortcutsSheet open onClose={onClose} undoSeconds={8} singleKeys sendKeys="Ctrl Enter" onUndo={onUndo} onKeys={onKeys} />);
    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    const buttons = [...sheet.querySelectorAll<HTMLElement>("button")];
    expect(document.activeElement).toBe(buttons[0]);
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(buttons[buttons.length - 1], { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.click(within(sheet).getByRole("button", { name: "60 seconds" }));
    expect(onUndo).toHaveBeenCalledWith(60);
    fireEvent.click(within(sheet).getByRole("button", { name: "Off" }));
    expect(onKeys).toHaveBeenCalledWith(false);
    fireEvent.mouseDown(document.querySelector(".sheet-scrim")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", () => {
    render(<ShortcutsSheet open={false} onClose={vi.fn()} undoSeconds={8} singleKeys sendKeys="Ctrl Enter" onUndo={vi.fn()} onKeys={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("record list (§5.4)", () => {
  it("without the desk: plain links, the open one aria-current", () => {
    render(<WithDesk desk={stubDesk(NAPA, { ready: false })}><RecordListbox reg={NAPA} /></WithDesk>);
    expect(screen.queryByRole("listbox")).toBeNull();
    const current = document.querySelector('a[aria-current="page"]')!;
    expect(current.getAttribute("href")).toBe(NAPA.all[7].href);
  });

  it("with the desk: a listbox whose links leave the tab order; a click navigates through the desk; hints follow the desk", () => {
    const desk = stubDesk(NAPA, { netErrFor: (id) => (id === NAPA.all[2].conceptId ? "unknown" : null) });
    render(<WithDesk desk={desk}><RecordListbox reg={NAPA} /></WithDesk>);
    const list = screen.getByRole("listbox", { name: "Records in 0001-pilot" });
    const options = within(list).getAllByRole("option");
    expect(options[7].getAttribute("aria-selected")).toBe("true");
    for (const a of list.querySelectorAll("a")) {
      expect(a.getAttribute("tabindex")).toBe("-1");
      expect(a.getAttribute("role")).toBe("presentation");
    }
    expect(options[2].querySelector(".rec-hint")!.textContent).toBe("Decision not confirmed");
    fireEvent.click(options[3]);
    expect(desk.navigate).toHaveBeenCalledWith(NAPA.all[3].href);
  });
});

describe("list search (§5.3)", () => {
  it("debounces 250 ms and replaces the URL, keeping the filter", () => {
    vi.useFakeTimers();
    const reg = makeReg("napa", { show: "warn" });
    render(<WithDesk desk={stubDesk(reg)}><ListSearch batchId="0001-pilot" conceptId={reg.conceptId} show="warn" q="" /></WithDesk>);
    fireEvent.change(document.querySelector('[data-desk="search"]')!, { target: { value: "para" } });
    act(() => { vi.advanceTimersByTime(249); });
    expect(router.replace).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(router.replace).toHaveBeenCalledWith(`/review/0001-pilot/${reg.conceptId}?show=warn&q=para`, { scroll: false });
  });
});

describe("detail tools (§5.5.1)", () => {
  it("links without the desk; buttons with key labels with it, and none when single keys are off", () => {
    const { unmount } = render(<WithDesk desk={stubDesk(NAPA, { ready: false })}><DetailTools reg={NAPA} /></WithDesk>);
    const src = screen.getByRole("link", { name: "DGDA source" });
    expect(src.getAttribute("target")).toBe("_blank");
    expect(src.getAttribute("rel")).toBe("noopener noreferrer");
    unmount();
    const desk = stubDesk(NAPA);
    const r = render(<WithDesk desk={desk}><DetailTools reg={NAPA} /></WithDesk>);
    const ev = document.querySelector('[data-fk="ev"]')!;
    expect(ev.getAttribute("aria-keyshortcuts")).toBe("E");
    expect(ev.getAttribute("aria-controls")).toBe("drawer");
    fireEvent.click(document.querySelector('[data-fk="next"]')!);
    expect(desk.move).toHaveBeenCalledWith(1);
    r.unmount();
    render(<WithDesk desk={stubDesk(NAPA, { singleKeys: false })}><DetailTools reg={NAPA} /></WithDesk>);
    expect(document.querySelectorAll("[aria-keyshortcuts]")).toHaveLength(0);
  });
});

describe("stale banner and complete view (§5.11, §5.12)", () => {
  it("re-run: the re-run body, See what changed when a diff exists, and Reload record", () => {
    const desk = stubDesk(NAPA, { diff: [{ field: "Trade name", before: "Napa", now: "Napa Extra" }] });
    render(<WithDesk desk={desk}><StaleBanner name="Napa" reason="rerun" /></WithDesk>);
    expect(screen.getByText("This record changed — reload to review the latest data")).toBeTruthy();
    expect(screen.getByText(/The pipeline re-ran Napa after you opened it/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See what changed" }));
    expect(desk.toggleDiff).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload record" }));
    expect(desk.reloadOpen).toHaveBeenCalled();
  });

  it("another reviewer: its own body and no diff button", () => {
    render(<WithDesk desk={stubDesk(NAPA, { diff: [{ field: "Trade name", before: "a", now: "b" }] })}><StaleBanner name="Napa" reason="other" /></WithDesk>);
    expect(screen.getByText(/Another reviewer decided on Napa after you opened it/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See what changed" })).toBeNull();
  });

  it("complete: the approved title and Open record 1", () => {
    const desk = stubDesk(NAPA);
    render(<WithDesk desk={desk}><CompleteView /></WithDesk>);
    expect(screen.getByRole("heading", { name: "Batch 0001-pilot approved. 10 records are now public." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open record 1" }));
    expect(desk.openFirst).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/desk-parts.test.tsx tests/turnstile-field.test.tsx`
Expected: FAIL — `@/components/review/desk/context` and the parts do not resolve; the TurnstileField cases fail on the missing `appearance` option and on a second script tag (or a `waitFor` timeout on the pending promise).

- [ ] **Step 3: Extend TurnstileField**

In `web/components/TurnstileField.tsx`:
- below P1A's `let loading: Promise<TurnstileApi> | null = null;`, replace `loadTurnstile` with:

```ts
let loadingScript: HTMLScriptElement | null = null;

function loadTurnstile(nonce?: string): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  // A pending promise whose script tag has left the document can never settle (jsdom never loads external scripts, and a
  // page may swap the tag): drop it and attach to the script that is there now.
  if (loading && !loadingScript?.isConnected) loading = null;
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    // The no-JavaScript decision form (§5.8.6) puts Cloudflare's implicit script on the page; wait for it, never load twice.
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    const s = existing ?? document.createElement("script");
    loadingScript = s;
    s.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load"))));
    s.addEventListener("error", () => { loading = null; loadingScript = null; reject(new Error("Turnstile did not load")); });
    if (!existing) {
      s.src = SCRIPT;
      s.async = true;
      if (nonce) s.setAttribute("nonce", nonce);
      document.head.appendChild(s);
    }
  });
  return loading;
}
```

- change the props type to

```ts
export type TurnstileFieldProps = {
  siteKey: string; action: TurnstileAction; nonce?: string; resetKey?: number;
  onToken?: (token: string | null) => void; onError?: () => void;
  /** §5.8.5: the desk uses "interaction-only" and refresh-expired "auto"; the desk shows its own BotCheck (hideStatus). */
  appearance?: "always" | "interaction-only"; refreshExpired?: "auto" | "manual"; hideStatus?: boolean;
};
```

- destructure `appearance, refreshExpired, hideStatus` in the component's parameters, add to the `ts.render` options object

```ts
        ...(appearance ? { appearance } : {}),
        ...(refreshExpired ? { "refresh-expired": refreshExpired } : {}),
```

- and render `{!hideStatus && <BotCheck state={state} />}` in place of `<BotCheck state={state} />`.

- [ ] **Step 4: Write the context, drafts and the desk stylesheet**

Create `web/components/review/desk/context.ts`:

```ts
import { createContext, useContext, type ReactNode } from "react";
import type { DiffRow, DisplayStatus, FilterKey, ItemHint, ReviewerRole, Version } from "@/lib/review-types";
import { initialMachine, type MachineState } from "./commit-machine";
import type { BarCtx } from "./bar-state";

/** One row of the record list, as the record page renders it (§5.4). `href` keeps the current filter and search. */
export type RowRef = {
  index: number; conceptId: string; tradeName: string; clinicalDisplayName: string | null; displayStatus: DisplayStatus;
  hint: ItemHint; version: Version; href: string;
};

/** What the record page registers with the desk on mount and on every new render (§4.2 DeskRecordContext). */
export type RecordRegistration = {
  batchId: string; conceptId: string; tradeName: string; index: number; total: number; displayStatus: DisplayStatus;
  version: Version; stagesBlocked: boolean; sourceUrl: string; show: FilterKey; q: string;
  /** The visible order (filter and search applied) and every current record by index. */
  rows: RowRef[]; all: RowRef[];
  /** For the no-JavaScript form only (§5.8.6); the desk makes its own per decision. */
  requestId: string;
  prevHref: string | null; nextHref: string | null;
  /**
   * §5.12 "Batch complete" on arrival: true only when /review/[batchId] found every current record approved and sent the
   * reviewer here with `?view=done`. Opening any record from the list or with J/K reads it (§5.7 "Open any record to read it").
   */
  complete: boolean;
};

export type DeskApi = {
  ready: boolean; batchId: string; role: ReviewerRole; total: number; singleKeys: boolean; undoSeconds: number;
  machine: MachineState; bar: BarCtx; complete: boolean; hint: string | null; botState: "checking" | "passed" | "failed";
  retryBusy: boolean; drawerOpen: boolean; sheetOpen: boolean; reportOpen: boolean; note: string; noteError: boolean;
  diff: DiffRow[] | null; diffOpen: boolean; slots: { batchesNav: ReactNode; batchCard: ReactNode };
  staleFor(conceptId: string): "rerun" | "other" | null;
  netErrFor(conceptId: string): "no" | "unknown" | null;
  statusFor(conceptId: string, fallback: DisplayStatus): DisplayStatus;
  register(reg: RecordRegistration, node: ReactNode): void;
  subtree(conceptId: string, version: Version, node: ReactNode): ReactNode;
  reloadOpen(): void;
  pressApprove(): void; clickReport(): void; closeReport(focusBack: boolean, discard: boolean): void;
  setNote(v: string): void; sendReport(): void; undo(): void; tryAgain(): void; retryCheck(): void;
  toggleDrawer(on?: boolean): void; toggleDiff(): void; navigate(href: string, focusKey?: string): void;
  move(delta: 1 | -1 | "first" | "last"): void;
  openSource(): void; openFirst(): void; registerSearchClear(fn: (() => void) | null): void;
  /** Writes to the page's one polite live region (§10.2) through `announce` from `@/lib/live-region` (P1A). */
  announce(text: string): void;
};

export const DeskCtx = createContext<DeskApi | null>(null);

export function useDesk(): DeskApi {
  const desk = useContext(DeskCtx);
  if (!desk) throw new Error("useDesk must be used inside ReviewDesk");
  return desk;
}

/** The bar as the server renders it, before the desk takes over (and for the no-JavaScript form). */
export function barFromRegistration(reg: RecordRegistration, role: ReviewerRole, undoSeconds: number): BarCtx {
  return { loading: false, complete: false, role, batchId: reg.batchId,
    record: { conceptId: reg.conceptId, name: reg.tradeName, status: reg.displayStatus, stagesBlocked: reg.stagesBlocked },
    stale: false, drawerOpen: false, reportOpen: false, machine: initialMachine(undoSeconds), undoSeconds, advanceGuard: null, now: 0 };
}
```

Create `web/components/review/desk/drafts.ts`:

```ts
/** §5.10 note drafts: per record, in memory, mirrored to sessionStorage; never outliving the session. */
export const DRAFT_PREFIX = "intellidrugs-draft:";
export const draftKey = (batchId: string, conceptId: string) => `${DRAFT_PREFIX}${batchId}:${conceptId}`;
const memory = new Map<string, string>();

export function loadDraft(batchId: string, conceptId: string): string {
  const k = draftKey(batchId, conceptId);
  try {
    const v = window.sessionStorage.getItem(k);
    if (v !== null) return v;
  } catch {
    // storage blocked: memory only
  }
  return memory.get(k) ?? "";
}

export function saveDraft(batchId: string, conceptId: string, value: string): void {
  const k = draftKey(batchId, conceptId);
  if (value) memory.set(k, value); else memory.delete(k);
  try {
    if (value) window.sessionStorage.setItem(k, value); else window.sessionStorage.removeItem(k);
  } catch {
    // storage blocked: memory only
  }
}

export const clearDraft = (batchId: string, conceptId: string) => saveDraft(batchId, conceptId, "");

/** Sign-out removes every draft (§5.10); POST /signout's Clear-Site-Data covers the no-JavaScript case. */
export function clearAllDrafts(): void {
  memory.clear();
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch {
    // nothing stored
  }
}
```

Create `web/components/review/desk.module.css` (Board R's `.app`, `.panes`, list, detail, bar parts and toast placement, plus the §5.1 responsive rules; `:global(html):has(.app)` keeps the selector pure because it names the local `.app`):

```css
.app { position: relative; display: grid; grid-template-rows: 52px minmax(0, 1fr); height: 100dvh; background: var(--canvas); color: var(--fg); overflow: hidden; }
.app:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.skip { position: absolute; left: var(--s4); top: -48px; z-index: 10; padding: var(--s2) var(--s3); border-radius: var(--r-ctl-sm); background: var(--surface); color: var(--accent); box-shadow: var(--shadow-2); }
.skip:focus-visible { top: var(--s2); }
.toolbar { position: relative; z-index: 2; }
.wordmark { color: var(--fg); text-decoration: none; min-height: 24px; display: inline-flex; align-items: center; }   /* size: Wordmark's s17 class */
.center { margin: 0 auto; display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--fg-2); min-width: 0; }
.center b { color: var(--fg); font-weight: 600; }
.sep { width: 1px; height: 16px; background: var(--line-strong); }
.right { display: flex; align-items: center; gap: 12px; }
.body { min-height: 0; }
.panes { display: grid; grid-template-columns: var(--pane-side) var(--pane-list) minmax(0, 1fr); height: 100%; min-height: 0; }
.side { min-height: 0; overflow: auto; }
.side :global(.filter) { text-decoration: none; }
.sideDisclosure { display: none; }
.list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); background: var(--canvas); }
.listH { padding: 12px 14px 10px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); }
.listT { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.listT b { font: var(--t-title3); letter-spacing: var(--tr-title3); }
.listT span { font-size: 12px; color: var(--fg-2); }
.listBody { flex: 1; min-height: 0; overflow: auto; padding-bottom: 96px; }
.empty { padding: 20px 18px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; font-size: 13.5px; color: var(--fg-2); }
.empty b { color: var(--fg); font-weight: 600; }
.recLink { display: contents; color: inherit; text-decoration: none; }
.detail { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--canvas); }
.dBody { position: relative; flex: 1; min-height: 0; }
.dScroll { position: absolute; inset: 0; overflow: auto; padding: 20px 28px 32px; display: flex; flex-direction: column; gap: 24px; scroll-padding-bottom: var(--bar-h, 0px); }
.dScroll:focus-visible { outline-offset: -3px; }
.evidenceFallback { border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); padding: 12px 16px; }
.report { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-1); }
.reportActs { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; align-items: center; }
.reportPaused { font-size: 12.5px; color: var(--warn); font-weight: 500; margin-right: auto; }
.noauth { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 4px 12px; padding: 2px 0; }
.noauth :global(.ico) { width: 20px; height: 20px; color: var(--fg-2); grid-row: span 2; }
.noauthT { font: 600 14px/1.4 var(--font-ui); }
.noauthB { font-size: 13px; color: var(--fg-2); max-width: 72ch; }
.bot { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; }
.icoInfo { --ico: var(--i-info); }
.icoCode { --ico: var(--i-code); }
.icoExternal { --ico: var(--i-external); }
.icoUp { --ico: var(--i-up); }
.icoDown { --ico: var(--i-down); }
.tools { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: none; }
.row { display: flex; gap: 6px; flex-wrap: wrap; }
.toastWrap { position: absolute; left: 244px; bottom: 16px; z-index: 5; width: 312px; }
.reducedOnly { display: none; }
.turnstile { position: absolute; right: 16px; bottom: 120px; z-index: 6; }
.done { max-width: 560px; margin: 72px auto 0; display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
.doneT { font: var(--t-title2); letter-spacing: var(--tr-title2); }
.done p { font-size: 14px; color: var(--fg-2); }
.noscript { font-size: 13px; color: var(--fg-2); }
.drawerH2 { font: var(--t-title3); letter-spacing: var(--tr-title3); }
@media (prefers-reduced-motion: reduce) { .reducedOnly { display: inline; } }
@media (max-width: 1279px) {
  .panes { grid-template-columns: var(--pane-list) minmax(0, 1fr); }
  .side { display: none; }
  .sideDisclosure { display: block; }
  .toastWrap { left: 16px; }
}
@media (max-width: 1023px) {
  .app { height: auto; min-height: 100dvh; overflow: visible; }
  .panes { grid-template-columns: minmax(0, 1fr); height: auto; }
  .panes[data-pane="detail"] .list { display: none; }
  .panes[data-pane="list"] .detail { display: none; }
  .dBody { flex: none; }
  .dScroll { position: static; padding: 16px; }
  .tools { margin-left: 0; align-items: flex-start; }
  .toastWrap { left: 16px; right: 16px; width: auto; }
  /* One column: the page itself scrolls under the sticky bar. ReviewDesk measures the bar into --bar-h on <html> (§5.1). */
  :global(html):has(.app) { scroll-padding-bottom: var(--bar-h, 0px); }
}
@media (max-height: 480px) {
  .toolbar { position: static; }
  .app :global(.decision-bar) { position: static; }
  .app :global(.decision-keys) { display: none; }
  .dScroll { scroll-padding-bottom: 0; }
}
```

- [ ] **Step 5: Write the toast and the shortcuts sheet**

Create `web/components/review/desk/Toast.tsx`:

```tsx
"use client";
import type { CSSProperties } from "react";
import Kbd from "@/components/ui/Kbd";
import { DESK_NEW, fill } from "@/lib/copy";
import { DESK, toastSub } from "@/lib/review-copy";
import type { Op } from "./commit-machine";
import styles from "../desk.module.css";

/**
 * §5.8.4 toast. Running: message, sub, Undo, and the countdown bar over the reviewer's window (the second allowed inline
 * custom property, §3.1). Saving: "{name} saving." with no Undo and no bar. It never takes focus.
 */
export default function Toast({ view, seconds, singleKeys, onUndo }:
    { view: { mode: "running" | "saving"; op: Op } | null; seconds: number; singleKeys: boolean; onUndo: () => void }) {
  if (!view) return null;
  const { op } = view;
  return (
    <div className={styles.toastWrap}>
      {view.mode === "running" ? (
        <div className="toast is-running" style={{ "--dur-commit": `${seconds * 1000}ms` } as CSSProperties}>
          <p className="toast-msg"><b>{op.name}</b> {DESK.toastMarked}
            <span className="toast-sub">{toastSub(op.role, seconds)}<span className={styles.reducedOnly}> {fill(DESK.reducedMotion, { n: seconds })}</span></span>
          </p>
          <button className="toast-undo" type="button" data-fk="undo" onClick={onUndo} aria-keyshortcuts={singleKeys ? "U" : undefined}>
            <span className="ico" aria-hidden="true" />{DESK.undo}{singleKeys && <> <Kbd keys="U" /></>}
          </button>
          <span className="toast-bar" aria-hidden="true"><i /></span>
        </div>
      ) : (
        <div className="toast"><p className="toast-msg"><b>{op.name}</b> {DESK_NEW.committing.toastSaving}</p></div>
      )}
    </div>
  );
}
```

Create `web/components/review/desk/ShortcutsSheet.tsx`:

```tsx
"use client";
import { Fragment, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import Button from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import Segmented from "@/components/ui/Segmented";
import { DESK_NEW } from "@/lib/copy";
import { UNDO_SECONDS } from "@/lib/desk-settings";
import { setDeskSettingAction } from "@/lib/desk-settings-actions";
import { DESK, SHEET_ROWS } from "@/lib/review-copy";

/** §5.14 shortcuts sheet: a modal dialog, Tab trapped, with the two desk settings (forms that the desk enhances). */
export default function ShortcutsSheet({ open, onClose, undoSeconds, singleKeys, sendKeys, onUndo, onKeys }: {
  open: boolean; onClose: () => void; undoSeconds: number; singleKeys: boolean; sendKeys: string;
  onUndo: (n: number) => void; onKeys: (on: boolean) => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) sheet.current?.querySelector<HTMLElement>('[data-fk="sheet-close"]')?.focus();
  }, [open]);
  if (!open) return null;
  const s = DESK_NEW.deskSettings;
  function trap(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !sheet.current) return;
    const items = [...sheet.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")];
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (!items.includes(document.activeElement as HTMLElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const scrim = (e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } };
  return (
    <div className="sheet-scrim" onMouseDown={scrim}>
      <div className="sheet" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="sheet-h" aria-describedby="sheet-note" tabIndex={-1} onKeyDown={trap}>
        <div className="sheet-h"><h2 id="sheet-h">{DESK.sheetTitle}</h2>
          <Button variant="plain" size="sm" data-fk="sheet-close" onClick={onClose}>{DESK.close} <Kbd keys="Esc" /></Button></div>
        <p className="sheet-note" id="sheet-note">{DESK.sheetNote}</p>
        <dl>
          {SHEET_ROWS(undoSeconds).map(([k, text]) => (
            <Fragment key={text}>
              <dt>{(k === "SEND" ? [sendKeys] : k.split(" ")).map((x) => <Kbd key={x} keys={x} />)}</dt>
              <dd>{text}</dd>
            </Fragment>
          ))}
        </dl>
        <h3>{s.heading}</h3>
        <form action={setDeskSettingAction}>
          <p>{s.undoLabel}</p>
          <Segmented ariaLabel={s.undoLabel} name="undo" value={String(undoSeconds)}
            options={UNDO_SECONDS.map((n) => ({ value: String(n), label: n === 8 ? s.undo8 : n === 20 ? s.undo20 : s.undo60 }))}
            onSelect={(e, v) => { e.preventDefault(); onUndo(Number(v)); }} />
        </form>
        <form action={setDeskSettingAction}>
          <p>{s.keysLabel}</p>
          <Segmented ariaLabel={s.keysLabel} name="keys" value={singleKeys ? "on" : "off"}
            options={[{ value: "on", label: s.on }, { value: "off", label: s.off }]}
            onSelect={(e, v) => { e.preventDefault(); onKeys(v === "on"); }} />
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the record list, the search, the tools, the stale banner and the complete view**

Create `web/components/review/desk/RecordListbox.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { RecordRegistration } from "./context";
import { useDesk } from "./context";
import { rowHint } from "./row-hint";
import styles from "../desk.module.css";

/**
 * §5.4: the server's <ul> of <a href> rows (works without JavaScript); once the desk runs it becomes a listbox of options
 * whose links leave the tab order and the accessibility tree, so no option holds a focusable element.
 */
export default function RecordListbox({ reg }: { reg: RecordRegistration }) {
  const desk = useDesk();
  const list = useRef<HTMLUListElement>(null);
  const up = desk.ready;
  const selected = reg.rows.find((r) => r.conceptId === reg.conceptId);
  useEffect(() => {
    if (selected) document.getElementById(`opt-${selected.index}`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  return (
    <ul className="rec-list" ref={list}
      {...(up ? { role: "listbox", tabIndex: 0, "aria-label": fill(DESK.listLabel, { id: reg.batchId }), "data-fk": "list",
        "aria-activedescendant": selected && !desk.complete ? `opt-${selected.index}` : undefined } : {})}>
      {reg.rows.map((row) => {
        const isOpen = row.conceptId === reg.conceptId && !desk.complete;
        const status = desk.statusFor(row.conceptId, row.displayStatus);
        const hint = rowHint(row.hint, { netErr: desk.netErrFor(row.conceptId), stale: isOpen && desk.staleFor(row.conceptId) !== null });
        return (
          <li key={row.conceptId} id={`opt-${row.index}`} className={`rec${isOpen ? " is-selected" : ""}`}
            {...(up ? { role: "option", "aria-selected": isOpen, onClick: () => { desk.navigate(row.href); list.current?.focus(); } } : {})}>
            <a href={row.href} className={styles.recLink} aria-current={!up && isOpen ? "page" : undefined}
              {...(up ? { tabIndex: -1, role: "presentation", onClick: (e: React.MouseEvent) => e.preventDefault() } : {})}>
              <span className="rec-ix">{row.index}</span>
              <span className="rec-name">{row.tradeName}</span>
              <span className="rec-status"><ReviewStatus status={status} compact /></span>
              <span className="rec-sub">{row.clinicalDisplayName ?? ""}</span>
              <span className={`rec-hint${hint.tone ? ` rec-hint--${hint.tone}` : ""}`}>{hint.text}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
```

Create `web/components/review/desk/ListSearch.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DESK } from "@/lib/review-copy";
import type { FilterKey } from "@/lib/review-types";
import { useDesk } from "./context";
import { recordHref } from "./hrefs";

/** §5.3 record filter: a GET form without JavaScript; with it, debounced (250 ms) router.replace keeping the filter in the URL. */
export default function ListSearch({ batchId, conceptId, show, q }: { batchId: string; conceptId: string; show: FilterKey; q: string }) {
  const router = useRouter();
  const desk = useDesk();
  const [value, setValue] = useState(q);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setValue(q), [q]);
  useEffect(() => {
    desk.registerSearchClear(() => { setValue(""); router.replace(recordHref(batchId, conceptId, { show })); });
    return () => desk.registerSearchClear(null);
  }, [batchId, conceptId, show]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form method="get" action={recordHref(batchId, conceptId)} role="search" onSubmit={(e) => e.preventDefault()}>
      {show !== "all" && <input type="hidden" name="show" value={show} />}
      <label className="search">
        <span className="sr-only">{DESK.searchLabel}</span>
        <input type="search" name="q" value={value} placeholder={DESK.searchPlaceholder} autoComplete="off" maxLength={100}
          data-desk="search" data-fk="q"
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => router.replace(recordHref(batchId, conceptId, { show, q: v }), { scroll: false }), 250);
          }} />
      </label>
    </form>
  );
}
```

Create `web/components/review/desk/DetailTools.tsx`:

```tsx
"use client";
import Button, { buttonClass } from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import { DESK } from "@/lib/review-copy";
import { useDesk, type RecordRegistration } from "./context";
import styles from "../desk.module.css";

/** §5.5.1 tools. Without JavaScript: links (Evidence opens the <details> fallback, DGDA source a new tab). */
export default function DetailTools({ reg }: { reg: RecordRegistration }) {
  const desk = useDesk();
  const k = desk.singleKeys;
  if (!desk.ready) {
    return (
      <div className={styles.tools}>
        <div className={styles.row}>
          <a className={buttonClass("tonal", "sm")} href="#evidence">{DESK.evidence}</a>
          <a className={buttonClass("tonal", "sm")} href={reg.sourceUrl} target="_blank" rel="noopener noreferrer">{DESK.dgdaSource}</a>
        </div>
        <div className={styles.row}>
          {reg.prevHref && <a className={buttonClass("tonal", "sm")} href={reg.prevHref}>{DESK.previous}</a>}
          {reg.nextHref && <a className={buttonClass("tonal", "sm")} href={reg.nextHref}>{DESK.next}</a>}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.tools}>
      <div className={styles.row}>
        <Button variant="tonal" size="sm" data-fk="ev" aria-expanded={desk.drawerOpen} aria-controls="drawer"
          aria-keyshortcuts={k ? "E" : undefined} onClick={() => desk.toggleDrawer()}>
          <span className={`ico ${styles.icoCode}`} aria-hidden="true" />{DESK.evidence}{k && <> <Kbd keys="E" /></>}
        </Button>
        <Button variant="tonal" size="sm" data-fk="src" aria-keyshortcuts={k ? "S" : undefined} onClick={desk.openSource}>
          <span className={`ico ${styles.icoExternal}`} aria-hidden="true" />{DESK.dgdaSource}{k && <> <Kbd keys="S" /></>}
        </Button>
      </div>
      <div className={styles.row}>
        <Button variant="tonal" size="sm" data-fk="prev" aria-keyshortcuts={k ? "K" : undefined} onClick={() => desk.move(-1)}>
          <span className={`ico ${styles.icoUp}`} aria-hidden="true" />{DESK.previous}{k && <> <Kbd keys="K" /></>}
        </Button>
        <Button variant="tonal" size="sm" data-fk="next" aria-keyshortcuts={k ? "J" : undefined} onClick={() => desk.move(1)}>
          <span className={`ico ${styles.icoDown}`} aria-hidden="true" />{DESK.next}{k && <> <Kbd keys="J" /></>}
        </Button>
      </div>
    </div>
  );
}
```

Create `web/components/review/desk/StaleBanner.tsx`:

```tsx
"use client";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { DESK_NEW, STALE_TITLE, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { useDesk } from "./context";
import DiffTable from "./DiffTable";

/** §5.11 stale banner: re-run or other-reviewer body; "See what changed" only for a re-run with a snapshot; Reload record. */
export default function StaleBanner({ name, reason }: { name: string; reason: "rerun" | "other" }) {
  const desk = useDesk();
  const body = reason === "rerun" ? fill(DESK.staleBodyRerun, { name }) : fill(DESK_NEW.deskMisc.staleOtherReviewer, { name });
  return (
    <div>
      <Banner tone="warn" title={STALE_TITLE} body={body} action={<>
        {reason === "rerun" && desk.diff && (
          <Button variant="tonal" size="sm" data-fk="diff" aria-expanded={desk.diffOpen} onClick={desk.toggleDiff}>
            {desk.diffOpen ? DESK.hideChanges : DESK.seeChanges}
          </Button>
        )}
        <Button variant="primary" size="sm" data-fk="reload" onClick={desk.reloadOpen}>{DESK.reload}</Button>
      </>} />
      {reason === "rerun" && desk.diffOpen && desk.diff && <DiffTable rows={desk.diff} />}
    </div>
  );
}
```

Create `web/components/review/desk/CompleteView.tsx`:

```tsx
"use client";
import Button from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { useDesk } from "./context";
import styles from "../desk.module.css";

/** §5.12 batch complete: no animation; "Open record 1". */
export default function CompleteView() {
  const desk = useDesk();
  return (
    <div className={styles.done}>
      <ReviewStatus status="approved" />
      <h2 className={styles.doneT}>{fill(DESK.doneTitle, { id: desk.batchId, n: desk.total })}</h2>
      <p>{DESK.doneBody}</p>
      <div><Button variant="tonal" data-fk="first" onClick={desk.openFirst}>{DESK.openRecord1}</Button></div>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/desk-parts.test.tsx tests/turnstile-field.test.tsx tests/client-islands.test.ts tests/inline-styles.test.ts && npm run lint:css`
Expected: PASS. Every new `"use client"` file is under `components/review/desk/`; the toast's `--dur-commit` is the second allowed inline custom property (§3.1).

- [ ] **Step 8: Commit**

```bash
git add web/components/review/desk.module.css web/components/review/desk/context.ts web/components/review/desk/drafts.ts \
  web/components/review/desk/Toast.tsx web/components/review/desk/ShortcutsSheet.tsx web/components/review/desk/RecordListbox.tsx \
  web/components/review/desk/ListSearch.tsx web/components/review/desk/DetailTools.tsx web/components/review/desk/StaleBanner.tsx \
  web/components/review/desk/CompleteView.tsx web/components/TurnstileField.tsx web/tests/desk-reg.ts web/tests/desk-stub.tsx \
  web/tests/desk-parts.test.tsx web/tests/turnstile-field.test.tsx
git commit -m "feat(web): review desk parts: list, search, tools, toast, sheet, stale banner and complete view

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17b: Web — the decision bar and DeskRecordContext (§4.2, §5.7, §5.8.6, §5.11)

**Files:**
- Create: `web/components/review/desk/DecisionBar.tsx`, `web/components/review/desk/DeskRecordContext.tsx`
- Modify: `web/components/review/desk.module.css` (`.fallbackForm`), `web/tests/marks.test.ts` (`MATERIAL_ALLOWED`: the sidebar and the decision bar)
- Test: `web/tests/decision-bar.test.tsx`

**Interfaces:**
- Consumes: Task 17a (`useDesk`, `barFromRegistration`, `RecordRegistration`, the parts, `desk.module.css`, `makeReg`, `stubDesk`, `WithDesk`); `promise`, `approveDisabled`, `reportDisabled`, `sendDisabled` (Task 11); `IS_MAC_RE` (Task 11 `keys.ts`); `signInHref`, `recordHref` (Task 11); `decideFormAction` (Task 12); `KEY_ROW`, `DESK`, `DESK_NEW`, `NO_PHI_HELP` (Task 9, P1A); `Banner`, `BotCheck`, `Button`, `Field`, `Kbd` (P1A).
- Produces:
  - `DecisionBar({ reg, fallbackWidget })`: the §5.7 bar from desk state; before the desk runs, the §5.8.6 native form (hidden `batchId`, `conceptId`, `decision=ok`, `extractedAt`, `expectedLastDecisionId`, `requestId`, the implicit widget, a `<noscript>` notice).
  - `DeskRecordContext(props: { reg: RecordRegistration; filters: ReactNode; evidence: ReactNode; fallbackWidget: ReactNode; confirm: ReactNode; emptyText: string | null; pane: "list" | null; children: ReactNode })`.
  - DOM contract used by 17c and e2e: `#record`, `#decision-bar` (`data-state="ready|paused"`), `#drawer`, `#note`, `#bar-report`, `[data-fk="approve"]`, `[data-fk="report"]`, `[data-fk="ev"]`, `[data-fk="list"]`, `[data-fk="show-all"]`, `.decision-hint`, `.decision-keys`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/decision-bar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/lib/desk-actions", () => ({ decideFormAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import DecisionBar from "@/components/review/desk/DecisionBar";
import DeskRecordContext from "@/components/review/desk/DeskRecordContext";
import { initialMachine, type MachineState, type Op } from "@/components/review/desk/commit-machine";
import { barFromRegistration } from "@/components/review/desk/context";
import { makeReg } from "./desk-reg";
import { WithDesk, stubDesk } from "./desk-stub";

const NAPA = makeReg("napa");
const OP: Op = { conceptId: NAPA.conceptId, name: "Napa", role: "pharmacist", decision: "ok", note: "", viewedVersion: NAPA.version,
  requestId: "11111111-2222-4333-8444-555555555555" };
const withMachine = (over: Partial<MachineState>) => {
  const machine = { ...initialMachine(8), ...over };
  return stubDesk(NAPA, { machine, bar: { ...barFromRegistration(NAPA, "pharmacist", 8), machine } });
};
const bar = (desk = stubDesk(NAPA)) => render(<WithDesk desk={desk}><DecisionBar reg={NAPA} fallbackWidget={<div className="cf-turnstile" />} /></WithDesk>);

afterEach(cleanup);

describe("the decision bar rendered from desk state (§5.7)", () => {
  it("ready: the promise, Report issue and Looks correct with their keys, the key row", () => {
    bar();
    expect(document.querySelector(".decision-promise")!.textContent).toMatch(/^You're reviewing as a pharmacist\./);
    expect(document.querySelector('[data-fk="approve"]')!.getAttribute("aria-keyshortcuts")).toBe("A");
    expect(document.querySelector('[data-fk="report"]')!.getAttribute("aria-keyshortcuts")).toBe("R");
    expect(document.querySelector(".decision-keys")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("ready");
  });

  it("not saved and unconfirmed: two different banners, each with Try again", () => {
    const desk = withMachine({ commit: { kind: "netErr", op: OP, saved: "no" } });
    const r = bar(desk);
    expect(screen.getByText("Couldn't save your decision.")).toBeTruthy();
    expect(screen.getByText("Nothing was published. Check your connection and try again. Decision: Looks correct on Napa.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(desk.tryAgain).toHaveBeenCalled();
    r.unmount();
    bar(withMachine({ commit: { kind: "netErr", op: OP, saved: "unknown" } }));
    expect(screen.getByText("Couldn't confirm your decision.")).toBeTruthy();
    expect(screen.queryByText(/Nothing was published/)).toBeNull();
  });

  it("forbidden and signed out replace the actions and the key row", () => {
    const r = bar(withMachine({ auth: "forbidden" }));
    expect(screen.getByText("Your account can't review this batch.")).toBeTruthy();
    expect(document.querySelector('[data-fk="approve"]')).toBeNull();
    expect(document.querySelector(".decision-keys")).toBeNull();
    r.unmount();
    bar(withMachine({ auth: "signedOut" }));
    expect(screen.getByText("Your sign-in expired. Your decision on Napa was not saved.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toMatch(/^\/signin\?returnTo=/);
  });

  it("the report panel counts code points, and pauses Send while stale", () => {
    const desk = stubDesk(NAPA, { reportOpen: true, note: "😀😀😀😀", bar: { ...barFromRegistration(NAPA, "pharmacist", 8), stale: true } });
    bar(desk);
    expect(screen.getByText("4 / 1000")).toBeTruthy();
    expect(screen.getByText("Sending is paused until you reload the record. Your note is kept.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send report/ }).getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("paused");
  });

  it("a bot hold shows the bot row with Retry check", () => {
    const desk = withMachine({ commit: { kind: "botHold", hold: "commit", op: OP } });
    bar(desk);
    expect(screen.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(desk.retryCheck).toHaveBeenCalled();
  });

  it("single-key shortcuts off: no key row and no aria-keyshortcuts", () => {
    bar(stubDesk(NAPA, { singleKeys: false }));
    expect(document.querySelector(".decision-keys")).toBeNull();
    expect(document.querySelectorAll("[aria-keyshortcuts]")).toHaveLength(0);
  });

  it("before the desk runs: the native form with the version, a requestId and the implicit widget (§5.8.6)", () => {
    bar(stubDesk(NAPA, { ready: false }));
    const form = document.querySelector("form.decision-main")!;
    const value = (n: string) => form.querySelector<HTMLInputElement>(`input[name="${n}"]`)!.value;
    expect(value("extractedAt")).toBe(NAPA.version.extractedAt);
    expect(value("expectedLastDecisionId")).toBe("");
    expect(value("requestId")).toBe(NAPA.requestId);
    expect(form.querySelector(".cf-turnstile")).not.toBeNull();
    expect(form.querySelector('button[type="submit"]')!.textContent).toBe("Looks correct");
  });
});

describe("DeskRecordContext (§4.2, §5.11)", () => {
  it("registers the record with the desk and renders the subtree the desk holds", () => {
    const held = <p>napa as opened</p>;
    const desk = stubDesk(NAPA, { staleFor: () => "rerun", subtree: () => held });
    render(<WithDesk desk={desk}>
      <DeskRecordContext reg={NAPA} filters={null} evidence={<p>evidence body</p>} fallbackWidget={null} confirm={null} emptyText={null} pane={null}>
        <p>napa after the re-run</p>
      </DeskRecordContext>
    </WithDesk>);
    expect(desk.register).toHaveBeenCalledWith(NAPA, expect.anything());
    expect(screen.getByText("napa as opened")).toBeTruthy();
    expect(screen.queryByText("napa after the re-run")).toBeNull();
    expect(screen.getByText("This record changed — reload to review the latest data")).toBeTruthy();
    expect(document.getElementById("drawer")!.hidden).toBe(true);
  });

  it("the complete view replaces the record; an empty view offers Show all", () => {
    render(<WithDesk desk={stubDesk(NAPA, { complete: true })}>
      <DeskRecordContext reg={{ ...NAPA, rows: [] }} filters={null} evidence={null} fallbackWidget={null} confirm={null}
        emptyText="No records with an issue reported." pane={null}><p>napa</p></DeskRecordContext>
    </WithDesk>);
    expect(screen.getByRole("button", { name: "Open record 1" })).toBeTruthy();
    expect(screen.queryByText("napa")).toBeNull();
    const all = screen.getByRole("link", { name: "Show all 10 records" });
    expect(all.getAttribute("href")).toBe(NAPA.all[7].href);
    expect(all.getAttribute("data-fk")).toBe("show-all");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/decision-bar.test.tsx`
Expected: FAIL — `@/components/review/desk/DecisionBar` and `@/components/review/desk/DeskRecordContext` do not resolve.

- [ ] **Step 3: Write the decision bar**

Create `web/components/review/desk/DecisionBar.tsx` (the textarea keeps the spec's `maxlength=1000` from §5.10; the counter and the 5-character minimum count code points through `noteLength`, as the API does):

```tsx
"use client";
import type { ReactNode } from "react";
import Banner from "@/components/ui/Banner";
import BotCheck from "@/components/ui/BotCheck";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Kbd from "@/components/ui/Kbd";
import { DESK_NEW, NO_PHI_HELP, fill } from "@/lib/copy";
import { decideFormAction } from "@/lib/desk-actions";
import { DESK, KEY_ROW } from "@/lib/review-copy";
import { approveDisabled, promise, reportDisabled, sendDisabled } from "./bar-state";
import { barFromRegistration, useDesk, type RecordRegistration } from "./context";
import { signInHref } from "./hrefs";
import { IS_MAC_RE } from "./keys";
import styles from "../desk.module.css";

/**
 * §5.7 decision bar. Before the desk runs (no JavaScript, or the island failed to load) it is the native form of §5.8.6:
 * "Looks correct" submits to decideFormAction without commit=deferred, which only redirects to the confirm step.
 */
export default function DecisionBar({ reg, fallbackWidget }: { reg: RecordRegistration; fallbackWidget: ReactNode }) {
  const desk = useDesk();
  if (!desk.ready) return <FallbackBar reg={reg} fallbackWidget={fallbackWidget} />;
  const ctx = desk.bar.record?.conceptId === reg.conceptId ? desk.bar : barFromRegistration(reg, desk.role, desk.undoSeconds);
  const m = desk.machine, k = desk.singleKeys;
  const p = promise(ctx);
  const commitErr = m.commit.kind === "netErr" && m.commit.op.conceptId === reg.conceptId ? m.commit : null;
  const reportErr = m.report.kind === "netErr" && m.report.op.conceptId === reg.conceptId ? m.report : null;
  const botHold = m.commit.kind === "botHold" || m.report.kind === "botHold";
  const sendKeys = typeof navigator !== "undefined" && IS_MAC_RE.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘ Enter" : "Ctrl Enter";
  const here = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/review";
  return (
    <div className="decision-bar" id="decision-bar" tabIndex={-1} data-state={ctx.stale ? "paused" : "ready"}>
      {commitErr && (
        <Banner tone="crit"
          title={commitErr.saved === "no" ? DESK.netTitle : DESK_NEW.decisionUnconfirmed.bannerTitle}
          body={fill(commitErr.saved === "no" ? DESK.netBody : DESK_NEW.decisionUnconfirmed.bannerBody, { name: commitErr.op.name })}
          action={<Button variant="tonal" size="sm" busyLabel={DESK.saving} onClick={desk.tryAgain}>{DESK.tryAgain}</Button>} />
      )}
      {!commitErr && reportErr && (
        <Banner tone="crit" title={DESK_NEW.deskMisc.reportFailedTitle} body={DESK_NEW.deskMisc.reportFailedBody}
          action={<Button variant="tonal" size="sm" busyLabel={DESK.sending} onClick={desk.tryAgain}>{DESK.tryAgain}</Button>} />
      )}
      {desk.reportOpen && m.auth === "ok" && (
        <div className={styles.report} id="bar-report">
          <Field id="note" label={DESK.noteLabel}
            control={<textarea className="textarea" maxLength={1000} placeholder={DESK.notePlaceholder} value={desk.note} data-desk="note"
              onChange={(e) => desk.setNote(e.target.value)} />}
            help={<>{!desk.noteError && `${DESK.noteHelp} `}{NO_PHI_HELP}</>}
            error={desk.noteError ? DESK.noteError : undefined}
            counter={fill(DESK.noteCount, { len: [...desk.note].length })} />
          <div className={styles.reportActs}>
            {ctx.stale && <span className={styles.reportPaused}>{DESK.reportPaused}</span>}
            <Button variant="tonal" size="sm" onClick={() => desk.closeReport(true, true)}>{DESK.cancel} <Kbd keys="Esc" /></Button>
            <Button variant="primary" size="sm" aria-disabled={sendDisabled(ctx)} busy={m.report.kind === "sending"} busyLabel={DESK.sending}
              onClick={desk.sendReport}>{DESK.sendReport} <Kbd keys={sendKeys} /></Button>
          </div>
        </div>
      )}
      {m.auth === "signedOut" && (
        <div className={styles.noauth}>
          <span className={`ico ${styles.icoInfo}`} aria-hidden="true" />
          <p className={styles.noauthT}>{fill(DESK_NEW.sessionExpired.block, { name: reg.tradeName })}</p>
          <p className={styles.noauthB}><a href={signInHref(here)}>{DESK_NEW.sessionExpired.signInAgain}</a></p>
        </div>
      )}
      {m.auth === "forbidden" && (
        <div className={styles.noauth}>
          <span className={`ico ${styles.icoInfo}`} aria-hidden="true" />
          <p className={styles.noauthT}>{DESK.noAuthTitle}</p>
          <p className={styles.noauthB}>{DESK.noAuthBody}</p>
        </div>
      )}
      {m.auth === "ok" && (
        <div className="decision-main">
          <p className="decision-promise"><b>{p.lead}</b> {p.body}</p>
          <div className="decision-actions">
            <BotCheck state={desk.botState} />
            <Button variant="tonal" data-fk="report" data-desk="report" aria-disabled={reportDisabled(ctx)} aria-expanded={desk.reportOpen}
              aria-controls="bar-report" aria-keyshortcuts={k ? "R" : undefined} onClick={desk.clickReport}>
              {DESK.reportIssue}{k && <> <Kbd keys="R" /></>}
            </Button>
            <Button variant="primary" data-fk="approve" data-desk="approve" aria-disabled={approveDisabled(ctx)}
              aria-keyshortcuts={k ? "A" : undefined} onClick={desk.pressApprove}>
              {DESK.looksCorrect}{k && <> <Kbd keys="A" /></>}
            </Button>
          </div>
        </div>
      )}
      {botHold && m.auth === "ok" && (
        <div className={styles.bot}>
          <p className="field-error">{DESK.botError}</p>
          <Button variant="tonal" size="sm" busy={desk.retryBusy} busyLabel={DESK.checking} onClick={desk.retryCheck}>{DESK.retryCheck}</Button>
        </div>
      )}
      <p className="decision-hint" hidden={!desk.hint}>{desk.hint}</p>
      {k && m.auth === "ok" && (
        <div className="decision-keys" aria-hidden="true">
          {KEY_ROW.map(([keys, words]) => <span key={words}>{keys.map((x) => <Kbd key={x} keys={x} />)} {words}</span>)}
        </div>
      )}
    </div>
  );
}

/** §5.8.6 native form: hidden version fields, a server-rendered implicit Turnstile widget, and a <noscript> notice. */
function FallbackBar({ reg, fallbackWidget }: { reg: RecordRegistration; fallbackWidget: ReactNode }) {
  const desk = useDesk();
  const p = promise(barFromRegistration(reg, desk.role, desk.undoSeconds));
  return (
    <div className="decision-bar" id="decision-bar" tabIndex={-1} data-state="ready">
      <noscript>
        <p className={styles.noscript}>{DESK_NEW.deskMisc.noScript}</p>
        <style>{`.${styles.fallbackForm}{display:none}`}</style>
      </noscript>
      <form action={decideFormAction} className={`decision-main ${styles.fallbackForm}`}>
        <p className="decision-promise"><b>{p.lead}</b> {p.body}</p>
        <input type="hidden" name="batchId" value={reg.batchId} />
        <input type="hidden" name="conceptId" value={reg.conceptId} />
        <input type="hidden" name="decision" value="ok" />
        <input type="hidden" name="extractedAt" value={reg.version.extractedAt ?? ""} />
        <input type="hidden" name="expectedLastDecisionId" value={reg.version.lastDecisionId === null ? "" : String(reg.version.lastDecisionId)} />
        <input type="hidden" name="requestId" value={reg.requestId} />
        <div className="decision-actions">
          {fallbackWidget}
          <button type="submit" className="btn btn--primary">{DESK.looksCorrect}</button>
        </div>
      </form>
    </div>
  );
}
```

Add to `web/components/review/desk.module.css`:

```css
.fallbackForm { display: flex; }
```

- [ ] **Step 4: Write DeskRecordContext**

Create `web/components/review/desk/DeskRecordContext.tsx`:

```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import CompleteView from "./CompleteView";
import { useDesk, type RecordRegistration } from "./context";
import DecisionBar from "./DecisionBar";
import { recordHref } from "./hrefs";
import ListSearch from "./ListSearch";
import RecordListbox from "./RecordListbox";
import StaleBanner from "./StaleBanner";
import styles from "../desk.module.css";

/**
 * Island (§4.2): hands the record page's data to the persistent ReviewDesk and renders the panes. While the open record is
 * stale it renders the detail subtree the desk holds for viewedVersion, never the refreshed one (§5.11).
 */
export default function DeskRecordContext({ reg, filters, evidence, fallbackWidget, confirm, emptyText, pane, children }: {
  reg: RecordRegistration; filters: ReactNode; evidence: ReactNode; fallbackWidget: ReactNode; confirm: ReactNode;
  emptyText: string | null; pane: "list" | null; children: ReactNode;
}) {
  const desk = useDesk();
  useEffect(() => { desk.register(reg, children); }, [reg, children]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = desk.staleFor(reg.conceptId);
  const count = reg.rows.length === reg.total ? fill(DESK.listCount, { n: reg.total }) : fill(DESK.listCountFiltered, { v: reg.rows.length, n: reg.total });
  return (
    <div className={styles.panes} data-pane={pane ?? "detail"}>
      <aside className={`side chrome-sidebar material ${styles.side}`} aria-label={DESK.sidebarLabel}>
        {desk.slots.batchesNav}{filters}{desk.slots.batchCard}
      </aside>
      <section className={styles.list} aria-label="Records">
        <div className={styles.listH}>
          <details className={styles.sideDisclosure}><summary>{DESK.sidebarLabel}</summary>{desk.slots.batchesNav}{filters}</details>
          <div className={styles.listT}><b>{reg.batchId}</b><span>{count}</span></div>
          <ListSearch batchId={reg.batchId} conceptId={reg.conceptId} show={reg.show} q={reg.q} />
        </div>
        <div className={styles.listBody}>
          <RecordListbox reg={reg} />
          {emptyText && (
            <div className={styles.empty}>
              <b>{emptyText}</b>
              <a className="btn btn--tonal btn--sm" href={recordHref(reg.batchId, reg.conceptId)} data-fk="show-all">
                {fill(DESK.showAll, { n: reg.total })}
              </a>
            </div>
          )}
        </div>
      </section>
      <section className={styles.detail} aria-label="Record" id="record" tabIndex={-1}>
        <div className={styles.dBody}>
          <div className={styles.dScroll} tabIndex={-1} inert={desk.drawerOpen || undefined}>
            {stale && <StaleBanner name={reg.tradeName} reason={stale} />}
            {confirm}
            {desk.complete ? <CompleteView /> : desk.subtree(reg.conceptId, reg.version, children)}
            {!desk.ready && (
              <details id="evidence" className={styles.evidenceFallback}><summary>{DESK.evidence}</summary><div className="drawer-b">{evidence}</div></details>
            )}
          </div>
          {desk.ready && (
            <aside className="drawer" id="drawer" aria-labelledby="drawer-h" hidden={!desk.drawerOpen}>
              <div className="drawer-h">
                <div><h2 id="drawer-h" className={styles.drawerH2}>{DESK.evidence}</h2>
                  <p>{fill(DESK.drawerSub, { name: reg.tradeName, k: reg.index, n: reg.total })}</p></div>
                <Button variant="plain" size="sm" data-fk="drawer-close" onClick={() => desk.toggleDrawer(false)}>{DESK.close} <Kbd keys="Esc" /></Button>
              </div>
              <div className="drawer-b">{evidence}</div>
            </aside>
          )}
        </div>
        <DecisionBar reg={reg} fallbackWidget={fallbackWidget} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Allow their material, then run the tests**

The sidebar (`.chrome-sidebar.material`, in DeskRecordContext) and the decision bar (`.decision-bar`) are two of the three places translucent material is allowed (§3.4). In `web/tests/marks.test.ts` set:

```ts
export const MATERIAL_ALLOWED: string[] = [
  "components/review/ReviewToolbar.tsx",
  "components/review/desk/DeskRecordContext.tsx",
  "components/review/desk/DecisionBar.tsx",
];
```

Run: `cd web && npx vitest run tests/decision-bar.test.tsx tests/desk-parts.test.tsx tests/client-islands.test.ts tests/marks.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/components/review/desk/DecisionBar.tsx web/components/review/desk/DeskRecordContext.tsx \
  web/components/review/desk.module.css web/tests/decision-bar.test.tsx web/tests/marks.test.ts
git commit -m "feat(web): review decision bar, native-POST fallback form and DeskRecordContext

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17c: Web — ReviewDesk: the persistent island (machine, keys, poll, Turnstile, navigation, stale and reload) (§5.1, §5.7–§5.14)

**Files:**
- Create: `web/components/review/ReviewDesk.tsx`
- Modify: `web/tests/marks.test.ts` (`MATERIAL_ALLOWED`)
- Test: `web/tests/desk-keys.test.tsx`, `web/tests/desk-flow.test.tsx`, `web/tests/decision-bar-states.test.tsx` (moved here from Task 18: it drives the bar through the real desk), helper `web/tests/desk-harness.tsx`

**Interfaces:**
- Consumes: Tasks 17a and 17b; `step`, `toOutcome`, `toastView`, `tokenPlan`, `unconfirmedOn` (in flight or unconfirmed), `blocksUnload`, `windowOn`, `staleReason`, `TOKEN_WAIT_MS` (Task 10); `approveHint`, `reportHint`, `sendHint`, `noteLength`, `NOTE_MIN`, `advance`, `keyAction`, `targetKind`, `IS_MAC_RE`, `pollVerdict`, `compareRows`, `POLL_MS`, `isDeskPath`, `batchHref`, `recordHref`, `versionsHref` (Task 11); `decide`, `loadDiff`, `logEvidence`, `logRecordOpen` (Task 12); `DESK_SETTINGS_EVENT`, `UNDO_COOKIE`, `KEYS_COOKIE`, `deskCookieString` (Task 9); `sameVersion` (Task 7); `TurnstileField`, `ProgressMeter`, `Wordmark` (P1A); `announce(region: HTMLElement | null, text: string): () => void` and `ANNOUNCE_DELAY_MS = 60` from `@/lib/live-region` (P1A Task 21).
- Produces:
  - `ReviewDesk(props: { batchId; role: ReviewerRole; total: number; counts: { approved: number; issue: number }; undoSeconds: UndoSeconds; singleKeys: boolean; siteKey: string | null; nonce?: string; account: ReactNode; batchesNav: ReactNode; batchCard: ReactNode; children: ReactNode })` — batch-level props only (§4.2).
  - Behaviour later tasks and e2e rely on: in-batch links (`isDeskPath` or the batch's own `/review/{b}`) navigate in place with `router.push(…, { scroll: false })`; any other in-app link is blocked with the undo-window hint while a decision is pending (§5.8.3); `#desk` (the workspace region), `.toast`, `[role="dialog"]` (the sheet), the live region `[data-desk="live"]` (the page's only `aria-live` element; every desk message, including LoadingPanes' "Loading batch {id}", goes through `DeskApi.announce`, which calls P1A's `announce(region, text)` from `@/lib/live-region`: clear, then write after `ANNOUNCE_DELAY_MS`, a newer message cancelling a pending write); `--bar-h` on `<html>` while the desk is mounted.
  - Test helper: `web/tests/desk-harness.tsx` exports `router`, `actions`, `turnstile`, `Desk`, `versionsAnswer`, and re-exports `makeReg`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/desk-harness.tsx` (shared by the desk tests; not a test file itself):

```tsx
import { vi } from "vitest";
import ReviewDesk from "@/components/review/ReviewDesk";
import DeskRecordContext from "@/components/review/desk/DeskRecordContext";
import type { RecordRegistration } from "@/components/review/desk/context";
import type { TurnstileFieldProps } from "@/components/TurnstileField";

export { makeReg } from "./desk-reg";

export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() };
export const actions = {
  decide: vi.fn(), logRecordOpen: vi.fn(async () => {}), logEvidence: vi.fn(async () => {}), loadDiff: vi.fn(async () => null),
};
export const turnstile: { props: TurnstileFieldProps | null } = { props: null };

export function Desk({ reg, children, singleKeys = true, role = "pharmacist" }:
    { reg: RecordRegistration; children: React.ReactNode; singleKeys?: boolean; role?: "pharmacist" | "engineer" }) {
  return (
    <ReviewDesk batchId="0001-pilot" role={role} total={10} counts={{ approved: 0, issue: 0 }} undoSeconds={8} singleKeys={singleKeys}
      siteKey="1x00000000000000000000AA" account={<a href="/search">elsewhere</a>} batchesNav={null} batchCard={null}>
      <DeskRecordContext reg={reg} filters={null} evidence={<p>evidence body</p>} fallbackWidget={null} confirm={null} emptyText={null} pane={null}>
        {children}
      </DeskRecordContext>
    </ReviewDesk>
  );
}

/** The versions route answers with these rows. */
export function versionsAnswer(rows: { conceptId: string; extractedAt: string | null; lastDecisionId: number | null; displayStatus: string }[]) {
  return vi.fn(async () => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } }));
}
```

Create `web/tests/desk-keys.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions, router, turnstile } from "./desk-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/review/0001-pilot/x" }));
vi.mock("@/lib/desk-actions", () => ({
  decide: (i: unknown) => actions.decide(i), decideFormAction: vi.fn(),
  logRecordOpen: (...a: unknown[]) => actions.logRecordOpen(...(a as [])), logEvidence: (...a: unknown[]) => actions.logEvidence(...(a as [])),
  loadDiff: (...a: unknown[]) => actions.loadDiff(...(a as [])),
}));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: never) => { turnstile.props = p; return null; } }));

import { Desk, makeReg } from "./desk-harness";

const desk = () => document.getElementById("desk")!;
const key = (k: string, target: Element = desk(), mods = {}) => fireEvent.keyDown(target, { key: k, ...mods });
const hint = () => document.querySelector(".decision-hint")?.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
  for (const f of Object.values(actions)) f.mockClear();
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mount(singleKeys = true) {
  render(<Desk reg={makeReg("napa")} singleKeys={singleKeys}><p>napa detail</p></Desk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok-1"));
}

describe("keyboard model (§5.14)", () => {
  it("A arms the window and shows the toast; letters are ignored while typing and with Ctrl, Cmd or Alt", async () => {
    await mount();
    const search = document.querySelector<HTMLInputElement>('[data-desk="search"]')!;
    key("a", search);
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) key("a", desk(), mods);
    expect(document.querySelector(".toast")).toBeNull();
    key("A");
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
    key("u");
    expect(document.querySelector(".toast")).toBeNull();
  });

  it("Enter on Looks correct never approves, with or without modifiers", async () => {
    await mount();
    const approve = document.querySelector<HTMLButtonElement>('[data-fk="approve"]')!;
    for (const mods of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) key("Enter", approve, mods);
    expect(document.querySelector(".toast")).toBeNull();
    expect(hint()).toBe("Enter does not approve. Press A, or Space on this button.");
  });

  it("A and R with the evidence drawer open only say to close it first", async () => {
    await mount();
    key("e");
    expect(document.getElementById("drawer")!.hidden).toBe(false);
    expect(document.activeElement?.getAttribute("data-fk")).toBe("drawer-close");
    key("a", document.activeElement!);
    expect(document.querySelector(".toast")).toBeNull();
    expect(hint()).toBe("Close the evidence first (Esc).");
    key("r", document.activeElement!);
    expect(document.getElementById("bar-report")).toBeNull();
    expect(actions.logEvidence).toHaveBeenCalledTimes(1);
  });

  it("Esc closes the sheet, then the drawer, then the note (keeping it)", async () => {
    await mount();
    key("e");
    key("?", document.activeElement!);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    key("Escape", document.activeElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("drawer")!.hidden).toBe(false);
    key("Escape", document.activeElement!);
    expect(document.getElementById("drawer")!.hidden).toBe(true);
    expect(document.activeElement?.getAttribute("data-fk")).toBe("ev");
    key("r");
    const note = document.getElementById("note") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(note);
    fireEvent.change(note, { target: { value: "strength should read 5 mg" } });
    key("Escape", note);
    expect(document.getElementById("bar-report")).toBeNull();
    expect(document.activeElement?.getAttribute("data-fk")).toBe("report");
    key("r");
    expect((document.getElementById("note") as HTMLTextAreaElement).value).toBe("strength should read 5 mg");
  });

  it("the sheet traps focus and Tab cycles through its settings", async () => {
    await mount();
    key("?");
    const sheet = screen.getByRole("dialog");
    const focusable = [...sheet.querySelectorAll<HTMLElement>("button")];
    expect(focusable.map((b) => b.textContent)).toEqual(["Close Esc", "8 seconds", "20 seconds", "60 seconds", "On", "Off"]);
    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(focusable[focusable.length - 1], { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(focusable[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    expect(within(sheet).getByText("Looks correct, then an 8-second undo window")).toBeTruthy();
    expect(document.querySelector(".chrome-toolbar")!.hasAttribute("inert")).toBe(true);
  });

  it("single-key shortcuts Off: letters do nothing, no key row and no aria-keyshortcuts; Esc and Ctrl Enter still work", async () => {
    await mount(false);
    for (const k of ["a", "u", "r", "j", "k", "e", "s", "?"]) key(k);
    expect(document.querySelector(".toast")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("drawer")!.hidden).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    expect(document.querySelector(".decision-keys")).toBeNull();
    expect(document.querySelector('[data-fk="approve"]')!.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(desk().getAttribute("aria-label")).toBe("IntelliDrugs review workspace.");
    fireEvent.click(document.querySelector('[data-fk="report"]')!);
    const note = document.getElementById("note") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "abc" } });
    key("Enter", note, { ctrlKey: true });
    expect(document.querySelector(".field-error")?.textContent).toBe("Add at least 5 characters so the engineer knows what to fix.");
    key("Escape", note);
    expect(document.getElementById("bar-report")).toBeNull();
    fireEvent.click(document.querySelector('[data-fk="approve"]')!);
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
  });

  it("A while the next record is loading does nothing and shows no hint (§5.8.4)", async () => {
    await mount();
    key("j");
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    key("a");
    expect(document.querySelector(".toast")).toBeNull();
    expect(document.querySelector(".decision-hint")!.hasAttribute("hidden")).toBe(true);
  });

  it("the listbox has options with no focusable link inside, and J moves in the visible order", async () => {
    await mount();
    const list = screen.getByRole("listbox", { name: "Records in 0001-pilot" });
    expect(list.getAttribute("tabindex")).toBe("0");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(10);
    for (const a of list.querySelectorAll("a")) {
      expect(a.getAttribute("tabindex")).toBe("-1");
      expect(a.getAttribute("role")).toBe("presentation");
    }
    expect(options[7].getAttribute("aria-selected")).toBe("true");
    expect(list.getAttribute("aria-activedescendant")).toBe(options[7].id);
    key("j");
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    key("ArrowUp", list);
    expect(router.push).toHaveBeenLastCalledWith("/review/0001-pilot/185-0241-015--g-metformin", { scroll: false });
  });
});
```

Create `web/tests/desk-flow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions, router, turnstile, versionsAnswer } from "./desk-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/review/0001-pilot/x" }));
vi.mock("@/lib/desk-actions", () => ({
  decide: (i: unknown) => actions.decide(i), decideFormAction: vi.fn(),
  logRecordOpen: (...a: unknown[]) => actions.logRecordOpen(...(a as [])), logEvidence: (...a: unknown[]) => actions.logEvidence(...(a as [])),
  loadDiff: (...a: unknown[]) => actions.loadDiff(...(a as [])),
}));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: never) => { turnstile.props = p; return null; } }));

import type { RowRef } from "@/components/review/desk/context";
import { Desk, makeReg } from "./desk-harness";

const NAPA = makeReg("napa");
const V0 = NAPA.version;
const OUTCOME = { review: "ok", displayStatus: "approved", batchStatus: "in_review", version: { extractedAt: V0.extractedAt, lastDecisionId: 42 }, replayed: false };
const STALE = "This record changed — reload to review the latest data";
const desk = () => document.getElementById("desk")!;
const hintText = () => (document.querySelector(".decision-hint")?.hasAttribute("hidden") ? "" : document.querySelector(".decision-hint")?.textContent ?? "");
const live = () => document.querySelector('[data-desk="live"]')!.textContent;
const rowsWith = (napa: { extractedAt: string | null; lastDecisionId: number | null }) => NAPA.all.map((r) => ({
  conceptId: r.conceptId, displayStatus: r.displayStatus, ...(r.conceptId === NAPA.conceptId ? napa : r.version) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "requestAnimationFrame"] });
  vi.stubGlobal("fetch", versionsAnswer(rowsWith(V0)));
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockClear();
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function mount(reg = NAPA, children: React.ReactNode = <p>napa as opened</p>) {
  const view = render(<Desk reg={reg}>{children}</Desk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok-1"));
  return view;
}
const settle = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("the undo window commits what the reviewer saw (§5.8)", () => {
  it("after 8 s: one decide with the viewed version and a requestId, then saved and the advance", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    expect(live()).toBe("");
    await settle(100);
    expect(live()).toBe("Napa marked correct. Publishes in 8 seconds. Press U to undo.");
    await settle(7_000);
    expect(actions.decide).not.toHaveBeenCalled();
    await settle(1_000);
    expect(actions.decide).toHaveBeenCalledTimes(1);
    const sent = actions.decide.mock.calls[0][0];
    expect(sent).toMatchObject({ batchId: "0001-pilot", conceptId: NAPA.conceptId, decision: "ok", note: "",
      extractedAt: V0.extractedAt, expectedLastDecisionId: null, turnstileToken: "tok-1" });
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    await settle(100);
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    expect(live()).toBe("Saved. Napa is approved by a pharmacist and published. Opened Clarith, record 9 of 10.");
  });

  it("U before the deadline: nothing is sent, ever", async () => {
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(3_000);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await settle(10_000);
    expect(actions.decide).not.toHaveBeenCalled();
    expect(live()).toBe("Undone. Napa was not saved.");
  });

  it("one polite live region (§10.2): written through lib/live-region, and a newer message cancels a pending one", async () => {
    await mount();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(30);                                   // "marked correct" is still pending (ANNOUNCE_DELAY_MS is 60)
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(live()).toBe("");                            // cleared at once
    await settle(100);
    expect(live()).toBe("Undone. Napa was not saved."); // the cancelled write never lands after it
  });

  it("leaving the desk or closing the tab while armed is blocked; unload discards without sending", async () => {
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const leave = screen.getByText("elsewhere");
    expect(fireEvent.click(leave)).toBe(false);
    expect(document.querySelector(".decision-hint")?.textContent).toBe("Napa is still in its undo window. Press U to undo it, or wait until it saves.");
    window.dispatchEvent(new Event("pagehide"));
    await settle(10_000);
    expect(actions.decide).not.toHaveBeenCalled();
  });

  it("in-batch links (a Show filter, the current batch) navigate in place and never cancel the window (§5.8.1)", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount(NAPA, <p>napa as opened <a href={`/review/0001-pilot/${NAPA.conceptId}?show=warn`} data-fk="f-warn">Warnings</a>{" "}
      <a href="/review/0001-pilot">this batch</a></p>);
    fireEvent.keyDown(desk(), { key: "a" });
    expect(fireEvent.click(screen.getByText("Warnings"))).toBe(false);
    expect(router.push).toHaveBeenLastCalledWith(`/review/0001-pilot/${NAPA.conceptId}?show=warn`, { scroll: false });
    expect(fireEvent.click(screen.getByText("this batch"))).toBe(false);
    expect(router.push).toHaveBeenLastCalledWith("/review/0001-pilot", { scroll: false });
    expect(hintText()).toBe("");
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
    await settle(8_200);
    expect(actions.decide).toHaveBeenCalledTimes(1);
  });

  it("the 1 s guard starts when the next record arrives, and A does nothing while it loads (§5.9, §5.8.4)", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    const view = await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    await settle(1_500);                                   // a slow server: Clarith has not arrived yet
    fireEvent.keyDown(desk(), { key: "a" });
    expect(document.querySelector(".toast")).toBeNull();
    expect(hintText()).toBe("");
    view.rerender(<Desk reg={makeReg("clarith")}><p>clarith detail</p></Desk>);
    await settle(10);
    fireEvent.keyDown(desk(), { key: "a" });
    expect(hintText()).toBe("Record changed to Clarith. Press A again to approve it.");
    expect(document.querySelector(".toast")).toBeNull();
    act(() => turnstile.props!.onToken!("tok-2"));          // the first token was used by the commit (single-use)
    await settle(1_000);
    fireEvent.keyDown(desk(), { key: "a" });
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
  });

  it("after the last approval the complete view shows; opening a record from the list reads it (§5.7, §5.9)", async () => {
    const others = (rows: RowRef[]) => rows.map((r) => (r.conceptId === NAPA.conceptId ? r : { ...r, displayStatus: "approved" as const }));
    const last = { ...NAPA, rows: others(NAPA.rows), all: others(NAPA.all) };
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount(last);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_200);
    expect(screen.getByRole("button", { name: "Open record 1" })).toBeTruthy();
    expect(live()).toMatch(/Every record in batch 0001-pilot is approved\.$/);
    fireEvent.click(screen.getAllByRole("option")[2]);
    expect(router.push).toHaveBeenLastCalledWith(last.rows[2].href, { scroll: false });
    expect(screen.queryByRole("button", { name: "Open record 1" })).toBeNull();
  });

  it("a batch that is already approved opens in the complete view (§5.12)", async () => {
    await mount({ ...NAPA, complete: true });
    expect(screen.getByRole("button", { name: "Open record 1" })).toBeTruthy();
    expect(screen.queryByText("napa as opened")).toBeNull();
  });
});

describe("stale detection and held subtrees (§5.11, D45)", () => {
  it("a re-stamp found by the 20 s poll shows the banner, cancels the window and pauses the bar", async () => {
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    vi.stubGlobal("fetch", versionsAnswer(rowsWith({ extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: null })));
    await settle(20_000);
    expect(screen.getByText("This record changed — reload to review the latest data")).toBeTruthy();
    expect(document.querySelector(".toast")).toBeNull();
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("paused");
    expect(actions.decide).not.toHaveBeenCalled();
  });

  it("a refresh never swaps the open record: new props keep the opened subtree until Reload record", async () => {
    const view = await mount();
    const restamped = { extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: null };
    view.rerender(<Desk reg={makeReg("napa", {}, restamped)}><p>napa after the re-run</p></Desk>);
    await settle(100);
    expect(screen.getByText("napa as opened")).toBeTruthy();
    expect(screen.queryByText("napa after the re-run")).toBeNull();
    expect(screen.getByText(/The pipeline re-ran Napa after you opened it/)).toBeTruthy();
    fireEvent.keyDown(desk(), { key: "a" });
    expect(document.querySelector(".decision-hint")?.textContent).toBe("Decisions are paused. Reload the record first.");
    fireEvent.click(screen.getByRole("button", { name: "Reload record" }));
    await settle(100);
    expect(screen.getByText("napa after the re-run")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
    expect(live()).toBe("Record reloaded. Decisions are available again.");
  });

  it("Reload record after the poll found a re-run waits for the refreshed record, then stays reloaded (§5.11)", async () => {
    const view = await mount();
    const restamped = { extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: null };
    vi.stubGlobal("fetch", versionsAnswer(rowsWith(restamped)));
    await settle(20_000);
    expect(screen.getByText(STALE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload record" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByText(STALE)).toBeTruthy();             // paused until the refreshed record arrives
    view.rerender(<Desk reg={makeReg("napa", {}, restamped)}><p>napa after the re-run</p></Desk>);
    await settle(100);
    expect(screen.queryByText(STALE)).toBeNull();
    expect(screen.getByText("napa after the re-run")).toBeTruthy();
    expect(live()).toBe("Record reloaded. Decisions are available again.");
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("ready");
    await settle(20_000);                                      // the next poll agrees with what is shown
    expect(screen.queryByText(STALE)).toBeNull();
  });

  it("a poll that lands while the decision is saving is the reviewer's own save, never another reviewer (D45)", async () => {
    let resolve: (v: unknown) => void = () => {};
    actions.decide.mockImplementation(() => new Promise((r) => { resolve = r; }));
    await mount();
    await settle(10_000);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);                                       // t = 18.1 s: committing, the decide call is in flight
    expect(actions.decide).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", versionsAnswer(rowsWith(OUTCOME.version)));   // the server already saved it as decision 42
    await settle(2_000);                                       // t = 20.1 s: the poll sees lastDecisionId 42
    expect(screen.queryByText(STALE)).toBeNull();
    await act(async () => { resolve({ ok: true, outcome: OUTCOME }); });
    await settle(100);
    expect(screen.queryByText(STALE)).toBeNull();
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("ready");
    expect(live()).toMatch(/^Saved\. Napa is approved by a pharmacist and published\./);
  });

  it("the reviewer's own save never makes the record stale", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: { ...OUTCOME, displayStatus: "issue" } });
    const view = await mount();
    fireEvent.keyDown(desk(), { key: "r" });
    fireEvent.change(document.getElementById("note")!, { target: { value: "strength should read 5 mg" } });
    expect(sessionStorage.getItem(`intellidrugs-draft:0001-pilot:${NAPA.conceptId}`)).toBe("strength should read 5 mg");
    fireEvent.keyDown(document.getElementById("note")!, { key: "Enter", ctrlKey: true });
    await settle(100);
    expect(actions.decide.mock.calls[0][0]).toMatchObject({ decision: "issue", note: "strength should read 5 mg" });
    expect(live()).toBe("Issue reported for Napa. An engineer will see your note.");
    expect(sessionStorage.getItem(`intellidrugs-draft:0001-pilot:${NAPA.conceptId}`)).toBeNull();
    view.rerender(<Desk reg={makeReg("napa", { displayStatus: "issue" }, OUTCOME.version)}><p>napa with the issue</p></Desk>);
    vi.stubGlobal("fetch", versionsAnswer(rowsWith(OUTCOME.version)));
    await settle(25_000);
    expect(screen.queryByText("This record changed — reload to review the latest data")).toBeNull();
    expect(screen.getByText("napa with the issue")).toBeTruthy();
  });

  it("an unconfirmed commit is not another reviewer; Try again resends the same requestId", async () => {
    actions.decide.mockRejectedValueOnce(new Error("network"));
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    expect(screen.getByText("Couldn't confirm your decision.")).toBeTruthy();
    const first = actions.decide.mock.calls[0][0];
    vi.stubGlobal("fetch", versionsAnswer(rowsWith({ extractedAt: V0.extractedAt, lastDecisionId: 42 })));
    await settle(20_000);
    expect(screen.queryByText("This record changed — reload to review the latest data")).toBeNull();
    actions.decide.mockResolvedValueOnce({ ok: true, outcome: { ...OUTCOME, replayed: true } });
    act(() => turnstile.props!.onToken!("tok-2"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle(100);
    expect(actions.decide.mock.calls[1][0].requestId).toBe(first.requestId);
    expect(actions.decide.mock.calls[1][0].extractedAt).toBe(first.extractedAt);
    expect(live()).toMatch(/^Saved\. Napa is approved by a pharmacist and published\./);
  });

  it("a failed poll (502, network) changes nothing (Review Focus 3)", async () => {
    await mount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    await settle(20_000);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    await settle(20_000);
    expect(screen.queryByText("This record changed — reload to review the latest data")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Your sign-in expired/)).toBeNull();
  });

  it("a 401 from the poll is the signed-out block, never the no-auth block", async () => {
    await mount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await settle(20_000);
    expect(screen.getByText("Sign in again")).toBeTruthy();
    expect(screen.queryByText("Your account can't review this batch.")).toBeNull();
  });
});

describe("Turnstile at commit (§5.8.5, Review Focus 1)", () => {
  it("a token older than 270 s is never sent: the widget resets, the desk waits 10 s, then a commit bot hold", async () => {
    await mount();                                             // tok-1 held at t = 0
    await settle(271_000);                                     // a background tab closed the window long after
    const resetBefore = turnstile.props!.resetKey ?? 0;
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    expect(actions.decide).not.toHaveBeenCalled();
    expect(turnstile.props!.resetKey).not.toBe(resetBefore);
    await settle(10_000);
    expect(actions.decide).not.toHaveBeenCalled();
    expect(screen.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeTruthy();
    expect(screen.queryByText("Couldn't confirm your decision.")).toBeNull();
  });

  it("the fresh token that arrives within 10 s is the one sent", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount();
    await settle(271_000);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    act(() => turnstile.props!.onToken!("tok-new"));
    await settle(100);
    expect(actions.decide).toHaveBeenCalledTimes(1);
    expect(actions.decide.mock.calls[0][0].turnstileToken).toBe("tok-new");
  });

  it("a report sent while the widget re-executes waits for the token instead of failing the bot check", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: { ...OUTCOME, displayStatus: "issue" } });
    await mount();
    act(() => turnstile.props!.onToken!(null));                // a reset: no token held, the widget is re-executing
    fireEvent.keyDown(desk(), { key: "r" });
    fireEvent.change(document.getElementById("note")!, { target: { value: "strength should read 5 mg" } });
    fireEvent.keyDown(document.getElementById("note")!, { key: "Enter", ctrlKey: true });
    await settle(100);
    expect(live()).not.toMatch(/Bot check failed/);
    act(() => turnstile.props!.onToken!("tok-after-reset"));
    await settle(100);
    expect(actions.decide.mock.calls[0][0]).toMatchObject({ decision: "issue", turnstileToken: "tok-after-reset" });
    expect(live()).toBe("Issue reported for Napa. An engineer will see your note.");
  });
});
```

Create `web/tests/decision-bar-states.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions, router, turnstile } from "./desk-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/review/0001-pilot/x" }));
vi.mock("@/lib/desk-actions", () => ({
  decide: (i: unknown) => actions.decide(i), decideFormAction: vi.fn(),
  logRecordOpen: (...a: unknown[]) => actions.logRecordOpen(...(a as [])), logEvidence: (...a: unknown[]) => actions.logEvidence(...(a as [])),
  loadDiff: (...a: unknown[]) => actions.loadDiff(...(a as [])),
}));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: never) => { turnstile.props = p; return null; } }));

import { Desk, makeReg, versionsAnswer } from "./desk-harness";

const NAPA = makeReg("napa");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("fetch", versionsAnswer(NAPA.all.map((r) => ({ conceptId: r.conceptId, displayStatus: r.displayStatus, ...r.version }))));
  actions.decide.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function commitWith(result: unknown) {
  actions.decide.mockResolvedValue(result);
  render(<Desk reg={NAPA}><p>napa</p></Desk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok"));
  fireEvent.keyDown(document.getElementById("desk")!, { key: "a" });
  await act(async () => { await vi.advanceTimersByTimeAsync(8_200); });
}

describe("decision bar states (§5.7)", () => {
  it("not saved: Board R's banner, and the promise points at Try again", async () => {
    await commitWith({ ok: false, code: "rate_limited" });
    expect(screen.getByText("Couldn't save your decision.")).toBeTruthy();
    expect(screen.getByText("Nothing was published. Check your connection and try again. Decision: Looks correct on Napa.")).toBeTruthy();
    expect(document.querySelector(".decision-promise")!.textContent).toBe("Your decision was not saved. Use Try again above.");
    expect(document.querySelector(".rec-hint--warn")?.textContent).toBe("Decision not saved");
  });

  it("unconfirmed: the new banner, never 'nothing was published'", async () => {
    await commitWith({ ok: false, code: "failed" });
    expect(screen.getByText("Couldn't confirm your decision.")).toBeTruthy();
    expect(screen.queryByText(/Nothing was published/)).toBeNull();
    expect(screen.getAllByText("Decision not confirmed").length).toBeGreaterThan(0);
  });

  it("forbidden: the no-auth block replaces the actions and the key row", async () => {
    await commitWith({ ok: false, code: "forbidden" });
    expect(screen.getByText("Your account can't review this batch.")).toBeTruthy();
    expect(document.querySelector('[data-fk="approve"]')).toBeNull();
    expect(document.querySelector(".decision-keys")).toBeNull();
  });

  it("a refused commit (409 stage_failed) is a hint, not a banner", async () => {
    await commitWith({ ok: false, code: "stage_failed" });
    expect(document.querySelector(".decision-hint")!.textContent)
      .toBe("A check failed on this record. It returns to review after the fix and re-run. Nothing was saved.");
    expect(document.querySelector(".banner--crit")).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("captcha at commit: the bot row, then Retry check sends without a new window", async () => {
    await commitWith({ ok: false, code: "captcha" });
    expect(screen.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeTruthy();
    expect(document.querySelector(".botcheck")!.textContent).toBe("Checking");
    actions.decide.mockResolvedValue({ ok: true, outcome: { review: "ok", displayStatus: "approved", batchStatus: "in_review",
      version: { extractedAt: NAPA.version.extractedAt, lastDecisionId: 9 }, replayed: false } });
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    act(() => turnstile.props!.onToken!("tok-2"));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(actions.decide).toHaveBeenCalledTimes(2);
    expect(actions.decide.mock.calls[1][0].requestId).toBe(actions.decide.mock.calls[0][0].requestId);
    expect(document.querySelector(".toast.is-running")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/desk-keys.test.tsx tests/desk-flow.test.tsx tests/decision-bar-states.test.tsx`
Expected: FAIL — `@/components/review/ReviewDesk` does not resolve.

- [ ] **Step 3: Write ReviewDesk**

Create `web/components/review/ReviewDesk.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import TurnstileField from "@/components/TurnstileField";
import ProgressMeter from "@/components/ui/ProgressMeter";
import Wordmark from "@/components/ui/Wordmark";
import { DESK_NEW, STALE_TITLE, fill } from "@/lib/copy";
import { decide, loadDiff, logEvidence, logRecordOpen } from "@/lib/desk-actions";
import { announce as announceTo } from "@/lib/live-region";
import { DESK_SETTINGS_EVENT, KEYS_COOKIE, UNDO_COOKIE, deskCookieString, type UndoSeconds } from "@/lib/desk-settings";
import { DESK, ROLE_LABEL_DESK, savedText } from "@/lib/review-copy";
import { sameVersion, type DiffRow, type DisplayStatus, type ReviewerRole, type Version } from "@/lib/review-types";
import { advance, type AdvanceRow } from "./desk/advance";
import { NOTE_MIN, approveHint, noteLength, reportHint, sendHint, type BarCtx } from "./desk/bar-state";
import {
  TOKEN_WAIT_MS, blocksUnload, initialMachine, staleReason, step, toOutcome, toastView, tokenPlan, unconfirmedOn, windowOn,
  type Effect, type Event, type MachineState, type Op,
} from "./desk/commit-machine";
import { DeskCtx, type DeskApi, type RecordRegistration, type RowRef } from "./desk/context";
import { clearDraft, loadDraft, saveDraft } from "./desk/drafts";
import { batchHref, isDeskPath, recordHref, versionsHref } from "./desk/hrefs";
import { IS_MAC_RE, keyAction, targetKind } from "./desk/keys";
import { POLL_MS, compareRows, pollVerdict } from "./desk/poll";
import ShortcutsSheet from "./desk/ShortcutsSheet";
import Toast from "./desk/Toast";
import styles from "./desk.module.css";

export type ReviewDeskProps = {
  batchId: string; role: ReviewerRole; total: number; counts: { approved: number; issue: number };
  undoSeconds: UndoSeconds; singleKeys: boolean; siteKey: string | null; nonce?: string;
  account: ReactNode; batchesNav: ReactNode; batchCard: ReactNode; children: ReactNode;
};

const TRANSITION_MS = 300;
const TIMEOUT = Symbol("timeout");

/**
 * Island (§4.2), in app/review/[batchId]/layout.tsx: batch-level props only. It survives record navigation, so the undo
 * window always commits for its own record (§5.8.1). Long-lived listeners call through `self`, the latest render's API.
 */
export default function ReviewDesk(props: ReviewDeskProps) {
  const { batchId, role } = props;
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState<number>(props.undoSeconds);
  const [singleKeys, setSingleKeys] = useState(props.singleKeys);
  const [machine, setMachine] = useState<MachineState>(() => initialMachine(props.undoSeconds));
  const m = useRef(machine);
  const [open, setOpen] = useState<RecordRegistration | null>(null);
  const openRef = useRef<RecordRegistration | null>(null);
  const viewed = useRef(new Map<string, { version: Version; node: ReactNode }>());
  const latest = useRef(new Map<string, { version: Version; node: ReactNode }>());
  const [stale, setStale] = useState<Record<string, "rerun" | "other">>({});
  const staleRef = useRef(stale);
  const [overrides, setOverrides] = useState<Record<string, DisplayStatus>>({});
  const overridesRef = useRef(overrides);
  const savedAt = useRef(new Map<string, Version>());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerReturn = useRef<Element | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetReturn = useRef<Element | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef(false);
  const [note, setNoteText] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [hint, setHintText] = useState<string | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  /** The page's one polite live region (§10.2). P1A's announce() clears it and writes after ANNOUNCE_DELAY_MS (60 ms). */
  const liveRef = useRef<HTMLDivElement>(null);
  const cancelLive = useRef<() => void>(() => {});
  const [complete, setComplete] = useState(false);
  const completeRef = useRef(false);
  const [guard, setGuard] = useState<{ conceptId: string; at: number } | null>(null);
  /** The record auto-advance is opening; its 1000 ms guard starts when that record registers (§5.9 "after arriving"). */
  const pendingGuard = useRef<string | null>(null);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const token = useRef<{ value: string; at: number } | null>(null);
  const waiters = useRef<((t: string | null) => void)[]>([]);
  const retrying = useRef(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const retryFocus = useRef(false);
  const [resetKey, setResetKey] = useState(0);
  const [botState, setBotState] = useState<"checking" | "passed" | "failed">(props.siteKey ? "checking" : "failed");
  const navStart = useRef<number | null>(null);
  /** A record navigation is in flight: the bar is "loading" and A does nothing (§5.7, §5.8.4) until the record registers. */
  const navigating = useRef(false);
  /** Reload record was pressed before the refreshed props arrived (the poll found the change); see register(). */
  const reloading = useRef(new Set<string>());
  /** The version that made a record stale, so the reviewer's own save that it turns out to be can clear it (D45). */
  const staleSeen = useRef(new Map<string, Version>());
  const focusAfterNav = useRef<string | null>(null);
  const [focusReq, setFocusReq] = useState<{ key: string; n: number } | null>(null);
  const searchClear = useRef<(() => void) | null>(null);

  // ---- small helpers
  const requestFocus = (key: string) => setFocusReq({ key, n: (focusReq?.n ?? 0) + 1 });
  // A newer message cancels a pending write, so a quick second announcement never lands under the first one.
  const announce = (text: string) => { cancelLive.current(); cancelLive.current = announceTo(liveRef.current, text); };
  const showHint = (text: string) => {
    setHintText(text);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintText(null), 5000);
    announce(text);
  };
  const statusOf = (id: string, fallback: DisplayStatus) => overridesRef.current[id] ?? fallback;
  const setReport = (v: boolean) => { reportRef.current = v; setReportOpen(v); };
  const setDone = (v: boolean) => { completeRef.current = v; setComplete(v); };
  const inBatch = (pathname: string) => isDeskPath(pathname, batchId) || pathname === batchHref(batchId);

  function barNow(): BarCtx {
    const o = openRef.current;
    return { loading: navigating.current, complete: completeRef.current, role, batchId,
      record: o ? { conceptId: o.conceptId, name: o.tradeName, status: statusOf(o.conceptId, o.displayStatus), stagesBlocked: o.stagesBlocked } : null,
      stale: o ? staleRef.current[o.conceptId] !== undefined : false, drawerOpen, reportOpen: reportRef.current, machine: m.current,
      undoSeconds, advanceGuard: guard, now: performance.now() };
  }

  // ---- the machine
  function fire(e: Event) {
    const r = step(m.current, e);
    m.current = r.state;
    setMachine(r.state);
    for (const fx of r.effects) effect(fx);
  }

  function effect(fx: Effect) {
    if (fx.type === "send") void sendOp(fx.channel, fx.op);
    else if (fx.type === "announce") announce(fx.text);
    else if (fx.type === "hint") showHint(fx.text);
    else if (fx.type === "saved") onSaved(fx);
    else if (fx.type === "stale") markStale(fx.conceptId, fx.reason, fx.cancelled);
    else router.refresh();
  }

  function markStale(id: string, reason: "rerun" | "other", cancelled: boolean) {
    staleRef.current = { ...staleRef.current, [id]: reason };
    setStale(staleRef.current);
    announce(cancelled ? `${STALE_TITLE}. ${DESK.promiseNotSaved}` : STALE_TITLE);
    if (reason === "rerun" && openRef.current?.conceptId === id) loadDiffFor(id);
  }

  function clearStale(id: string) {
    staleSeen.current.delete(id);
    if (staleRef.current[id] === undefined) return;
    const { [id]: _gone, ...rest } = staleRef.current;
    staleRef.current = rest;
    setStale(rest);
  }

  function loadDiffFor(id: string) {
    setDiff(null);
    setDiffOpen(false);
    const from = viewed.current.get(id)?.version.extractedAt;
    if (from) void loadDiff(batchId, id, from).then((rows) => { if (openRef.current?.conceptId === id) setDiff(rows && rows.length ? rows : null); });
  }

  /** A version for the record that differs from what the reviewer was shown (§5.11). */
  function checkStale(id: string, current: Version | null) {
    if (staleRef.current[id]) return;
    const v = viewed.current.get(id)?.version;
    if (!v) return;
    // unconfirmedOn covers a commit or report still in flight too: the server may already hold the reviewer's own save.
    const reason = current === null ? "rerun" : staleReason(v, current, unconfirmedOn(m.current, id));
    if (!reason) return;
    if (current) staleSeen.current.set(id, current);
    fire({ type: "STALE", conceptId: id, reason });
  }

  function freshToken(): Promise<string | null> {
    const held = token.current;
    if (held && tokenPlan(held.at, performance.now()) === "use") {
      token.current = null;
      return Promise.resolve(held.value);
    }
    token.current = null;
    setResetKey((k) => k + 1);
    setBotState("checking");
    return new Promise((resolve) => {
      waiters.current.push(resolve);
      window.setTimeout(() => resolve(null), TOKEN_WAIT_MS);
    });
  }

  async function sendOp(channel: "commit" | "report", op: Op) {
    const t = await freshToken();
    if (t === null) { fire({ type: "RESULT", channel, result: { type: "CAPTCHA" } }); return; }
    let timer: number | undefined;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => { timer = window.setTimeout(() => resolve(TIMEOUT), TOKEN_WAIT_MS); });
    let result: Parameters<typeof toOutcome>[0];
    try {
      const r = await Promise.race([decide({ batchId, conceptId: op.conceptId, decision: op.decision, note: op.note,
        extractedAt: op.viewedVersion.extractedAt, expectedLastDecisionId: op.viewedVersion.lastDecisionId, requestId: op.requestId,
        turnstileToken: t }), timeout]);
      result = r === TIMEOUT ? "timeout" : r;
    } catch {
      result = "network";
    } finally {
      window.clearTimeout(timer);
    }
    setResetKey((k) => k + 1);   // a token is single-use (§5.8.5)
    fire({ type: "RESULT", channel, result: toOutcome(result) });
  }

  /** Immediately before an armed window commits (§5.11). A 429 or a failure never blocks the commit. */
  async function precheck(op: Op): Promise<boolean> {
    const res = await fetch(versionsHref(batchId), { cache: "no-store" }).catch(() => null);
    const v = await pollVerdict(res);
    if (v.kind === "signedOut") { fire({ type: "UNAUTHENTICATED" }); return false; }
    if (v.kind === "forbidden") { fire({ type: "FORBIDDEN" }); return false; }
    if (v.kind !== "rows") return true;
    const row = v.rows.find((r) => r.conceptId === op.conceptId);
    const reason = row ? staleReason(op.viewedVersion, row, false) : "rerun";
    if (reason) { fire({ type: "STALE", conceptId: op.conceptId, reason }); return false; }
    return true;
  }

  async function poll() {
    if (m.current.auth !== "ok") return;
    const res = await fetch(versionsHref(batchId), { cache: "no-store" }).catch(() => null);
    const v = await pollVerdict(res);
    if (v.kind === "signedOut") { fire({ type: "UNAUTHENTICATED" }); return; }
    if (v.kind === "forbidden") { fire({ type: "FORBIDDEN" }); return; }
    if (v.kind !== "rows") return;
    const o = openRef.current;
    if (!o) return;
    const known = o.all.map((r) => ({ conceptId: r.conceptId, version: r.version, displayStatus: r.displayStatus }));
    const { open: row, othersChanged } = compareRows(known, v.rows, o.conceptId);
    checkStale(o.conceptId, row ? { extractedAt: row.extractedAt, lastDecisionId: row.lastDecisionId } : null);
    if (othersChanged) router.refresh();
  }

  function onSaved(fx: Extract<Effect, { type: "saved" }>) {
    const id = fx.op.conceptId;
    viewed.current.set(id, { version: fx.outcome.version, node: viewed.current.get(id)?.node ?? null });
    savedAt.current.set(id, fx.outcome.version);
    // Own saves never make the record stale (§5.8.2): a check that saw this very save as "another reviewer" is undone.
    const seen = staleSeen.current.get(id);
    if (staleRef.current[id] === "other" && seen && sameVersion(seen, fx.outcome.version)) clearStale(id);
    overridesRef.current = { ...overridesRef.current, [id]: fx.outcome.displayStatus };
    setOverrides(overridesRef.current);
    const o = openRef.current;
    if (fx.channel === "report") {
      clearDraft(batchId, id);
      if (o?.conceptId === id) { setNoteText(""); setNoteError(false); setReport(false); requestFocus("report"); }
      router.refresh();
      return;
    }
    const rows = (list: RowRef[]): AdvanceRow[] => list.map((r) => ({ conceptId: r.conceptId, name: r.tradeName, index: r.index,
      status: r.conceptId === id ? fx.outcome.displayStatus : statusOf(r.conceptId, r.displayStatus) }));
    const a = advance({ role, committedId: id, openId: completeRef.current ? null : o?.conceptId ?? null, reportOpen: reportRef.current,
      visible: rows(o?.rows ?? []), all: rows(o?.all ?? []), batchId, saved: savedText(fx.op.role, fx.op.name) });
    announce(a.announce);
    router.refresh();
    if (a.kind === "complete" && a.switchView) { setDone(true); setDrawerOpen(false); }
    if (a.kind === "open" && o) {
      const target = o.all.find((r) => r.conceptId === a.target.conceptId)!;
      pendingGuard.current = target.conceptId;   // the guard starts on arrival, in register()
      navigate(a.clearFilter ? recordHref(batchId, target.conceptId) : (o.rows.find((r) => r.conceptId === target.conceptId)?.href ?? target.href));
    }
    if (retryFocus.current) {
      retryFocus.current = false;
      if (o?.conceptId === id && a.kind !== "open") requestFocus("approve"); else root.current?.focus();
    }
  }

  // ---- Turnstile (§5.8.5)
  function onToken(t: string | null) {
    if (t === null) { token.current = null; setBotState((s) => (s === "failed" ? s : "checking")); return; }
    setBotState("passed");
    if (waiters.current.length > 0) {
      const ws = waiters.current;
      waiters.current = [];
      ws.forEach((w) => w(t));
      return;
    }
    token.current = { value: t, at: performance.now() };
    if (retrying.current) {
      retrying.current = false;
      setRetryBusy(false);
      fire({ type: "RETRY_OK", now: performance.now() });
      return;
    }
    if (m.current.commit.kind === "awaitingToken") fire({ type: "TOKEN", now: performance.now() });
  }

  function onWidgetError() {
    token.current = null;
    setBotState("failed");
    const ws = waiters.current;
    waiters.current = [];
    ws.forEach((w) => w(null));
    if (retrying.current) { retrying.current = false; setRetryBusy(false); fire({ type: "RETRY_FAIL" }); return; }
    if (m.current.commit.kind === "awaitingToken") fire({ type: "WIDGET_ERROR" });
  }

  // ---- records
  function register(reg: RecordRegistration, node: ReactNode) {
    navigating.current = false;
    latest.current.set(reg.conceptId, { version: reg.version, node });
    const entry = viewed.current.get(reg.conceptId);
    if (!entry) viewed.current.set(reg.conceptId, { version: reg.version, node });
    else if (sameVersion(entry.version, reg.version)) entry.node = node;
    else if (reloading.current.has(reg.conceptId)) {
      // §5.11 Reload record: the refreshed record has arrived. It becomes the viewed version, and stale clears for good.
      reloading.current.delete(reg.conceptId);
      viewed.current.set(reg.conceptId, { version: reg.version, node });
      finishReload(reg.conceptId);
    } else checkStale(reg.conceptId, reg.version);
    let cleared = false;
    const next = { ...overridesRef.current };
    for (const r of reg.all) {
      const saved = savedAt.current.get(r.conceptId);
      if (saved && next[r.conceptId] !== undefined && sameVersion(saved, r.version)) { delete next[r.conceptId]; cleared = true; }
    }
    if (cleared) { overridesRef.current = next; setOverrides(next); }
    const prev = openRef.current;
    openRef.current = reg;
    setOpen(reg);
    if (prev?.conceptId === reg.conceptId) return;
    reloading.current.clear();
    setDone(reg.complete);
    if (pendingGuard.current === reg.conceptId) setGuard({ conceptId: reg.conceptId, at: performance.now() });
    pendingGuard.current = null;
    setReport(false);
    setNoteError(false);
    setNoteText(loadDraft(batchId, reg.conceptId));
    setDiff(null);
    setDiffOpen(false);
    if (staleRef.current[reg.conceptId] === "rerun") loadDiffFor(reg.conceptId);
    void logRecordOpen(batchId, reg.conceptId);
    if (navStart.current !== null && performance.now() - navStart.current > TRANSITION_MS) announce(fill(DESK.loaded, { id: batchId }));
    navStart.current = null;
    if (focusAfterNav.current !== null) { requestFocus(focusAfterNav.current || "desk"); focusAfterNav.current = null; }
  }

  function navigate(href: string, focusKey?: string) {
    setDone(false);   // "Open any record to read it" (§5.7): any navigation leaves the complete view
    const url = new URL(href, window.location.href);
    if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) {
      if (focusKey) requestFocus(focusKey);
      return;   // the open record itself: no new props would arrive, so no loading state
    }
    const a = document.activeElement;
    focusAfterNav.current = focusKey ?? (a && root.current?.contains(a) ? (a.getAttribute("data-fk") ?? "") : null);
    navStart.current = performance.now();
    navigating.current = true;
    router.push(href, { scroll: false });
  }

  function move(delta: 1 | -1 | "first" | "last") {
    const o = openRef.current;
    if (!o) return;
    if (o.rows.length === 0) { showHint(fill(DESK.emptyView, { n: o.total })); return; }
    if (completeRef.current) { setDone(false); navigate(o.rows[0].href); return; }
    const k = o.rows.findIndex((r) => r.conceptId === o.conceptId);
    const j = delta === "first" ? 0 : delta === "last" ? o.rows.length - 1 : Math.min(o.rows.length - 1, Math.max(0, (k < 0 ? 0 : k) + delta));
    if (o.rows[j].conceptId === o.conceptId) {
      if (delta === 1) showHint(DESK.lastInView);
      if (delta === -1) showHint(DESK.firstInView);
      return;
    }
    navigate(o.rows[j].href);
  }

  function newOp(o: RecordRegistration, decision: "ok" | "issue", text: string): Op {
    return { conceptId: o.conceptId, name: o.tradeName, role, decision, note: text,
      viewedVersion: viewed.current.get(o.conceptId)?.version ?? o.version, requestId: crypto.randomUUID() };
  }
  const tokenState = () => (token.current ? "held" : botState === "failed" ? "failed" : "pending") as "held" | "pending" | "failed";

  function pressApprove() {
    const o = openRef.current;
    const h = approveHint(barNow());
    if (h.block || !o) { if (h.text) showHint(h.text); return; }
    fire({ type: "PRESS_A", op: newOp(o, "ok", ""), token: tokenState(), now: performance.now() });
  }

  function keyReport() {
    const o = openRef.current;
    if (reportRef.current) { requestFocus("note"); return; }
    const h = reportHint(barNow());
    if (h.block || !o) { if (h.text) showHint(h.text); return; }
    setNoteText(loadDraft(batchId, o.conceptId));
    setNoteError(false);
    setReport(true);
    requestFocus("note");
  }

  function closeReport(focusBack: boolean, discard: boolean) {
    const o = openRef.current;
    if (discard && o) { clearDraft(batchId, o.conceptId); setNoteText(""); }
    setReport(false);
    setNoteError(false);
    if (focusBack) requestFocus("report");
  }

  function setNote(v: string) {
    setNoteText(v);
    const o = openRef.current;
    if (o) saveDraft(batchId, o.conceptId, v);
    if (noteLength(v) >= NOTE_MIN) setNoteError(false);
  }

  function sendReport() {
    const o = openRef.current;
    if (!o) return;
    const h = sendHint(barNow());
    if (h) { showHint(h); return; }
    if (noteLength(note) < NOTE_MIN) { setNoteError(true); announce(DESK.noteError); requestFocus("note"); return; }
    fire({ type: "SEND_REPORT", op: newOp(o, "issue", note.trim()), token: tokenState() });
  }

  function toggleDrawer(on = !drawerOpen) {
    const o = openRef.current;
    if (on) {
      if (!o || completeRef.current) return;
      drawerReturn.current = document.activeElement;
      setDrawerOpen(true);
      announce(fill(DESK.evidenceShown, { name: o.tradeName }));
      void logEvidence(batchId, o.conceptId);
      requestFocus("drawer-close");
      return;
    }
    setDrawerOpen(false);
    const r = drawerReturn.current;
    drawerReturn.current = null;
    if (r instanceof HTMLElement && root.current?.contains(r) && r !== root.current && !r.closest("#drawer") && r.getAttribute("data-fk"))
      requestFocus(r.getAttribute("data-fk")!);
    else requestFocus("ev");
  }

  function openSheet() { sheetReturn.current = document.activeElement; setSheetOpen(true); }
  function closeSheet() {
    setSheetOpen(false);
    const r = sheetReturn.current;
    sheetReturn.current = null;
    requestFocus(r instanceof HTMLElement && r.getAttribute("data-fk") ? r.getAttribute("data-fk")! : "desk");
  }

  function chooseUndo(n: number) {
    document.cookie = deskCookieString(UNDO_COOKIE, String(n), window.location.protocol === "https:");
    setUndoSeconds(n);
    fire({ type: "SET_UNDO", seconds: n });
  }
  function chooseKeys(on: boolean) {
    document.cookie = deskCookieString(KEYS_COOKIE, on ? "on" : "off", window.location.protocol === "https:");
    setSingleKeys(on);
  }

  /**
   * §5.11 Reload record. When newer props already arrived (a refresh landed first), they become the viewed version now.
   * When only the poll saw the change, the record stays paused until router.refresh() delivers it (register()); taking
   * `latest` then would re-adopt the old version and the record would go stale again as soon as the refresh lands.
   */
  function reloadOpen() {
    const o = openRef.current;
    if (!o) return;
    const id = o.conceptId;
    const l = latest.current.get(id);
    const v = viewed.current.get(id);
    setDiff(null);
    setDiffOpen(false);
    router.refresh();
    if (l && v && !sameVersion(l.version, v.version)) {
      viewed.current.set(id, { ...l });
      finishReload(id);
      return;
    }
    reloading.current.add(id);
  }

  function finishReload(id: string) {
    clearStale(id);
    if (openRef.current?.conceptId !== id) return;
    announce(DESK.reloaded);
    requestFocus(reportRef.current ? "note" : "approve");
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const action = keyAction(e, { singleKeys, sheetOpen, target: targetKind(target), drawerOpen, reportOpen: reportRef.current,
      searchHasText: target instanceof HTMLInputElement && target.value.length > 0 });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "approve": pressApprove(); break;
      case "undo": fire({ type: "PRESS_U" }); break;
      case "report": keyReport(); break;
      case "next": move(1); break;
      case "prev": move(-1); break;
      case "first": move("first"); break;
      case "last": move("last"); break;
      case "evidence": toggleDrawer(); break;
      case "source": if (openRef.current && !completeRef.current) window.open(openRef.current.sourceUrl, "_blank", "noopener"); break;
      case "sheet": openSheet(); break;
      case "closeSheet": closeSheet(); break;
      case "closeDrawer": toggleDrawer(false); break;
      case "closeReport": closeReport(true, false); break;
      case "clearSearch": searchClear.current?.(); break;
      case "sendReport": sendReport(); break;
      case "enterBlocked": showHint(DESK.enterBlocked); break;
    }
  }

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const item = (e.target as Element).closest?.('[data-desk-open="sheet"]');
    if (item) { item.closest("details")?.removeAttribute("open"); openSheet(); return; }
    // §5.8.1: links inside the batch (Show filters, "Show all", the current batch in "Batches", Back to list, Cancel) are
    // plain <a href> for the no-JavaScript page. With the desk they navigate in place, so the desk (and an open undo window)
    // survives; a document navigation would unmount it. "Show all" then focuses the list (§5.3).
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
    const raw = a?.getAttribute("href") ?? "";
    if (!a || a.target || a.hasAttribute("download") || raw.startsWith("#")) return;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin || !inBatch(url.pathname)) return;
    e.preventDefault();
    navigate(`${url.pathname}${url.search}`, a.getAttribute("data-fk") === "show-all" ? "list" : undefined);
  }

  // ---- effects
  const self = useRef({ fire, poll, showHint });
  self.current = { fire, poll, showHint };

  useEffect(() => {
    setReady(true);
    root.current?.querySelectorAll<HTMLElement>("[data-desk-open]").forEach((el) => { el.hidden = false; });
  }, []);

  useEffect(() => {
    if (!focusReq) return;
    const el = focusReq.key === "desk" ? root.current
      : focusReq.key === "note" ? document.getElementById("note")
      : root.current?.querySelector<HTMLElement>(`[data-fk="${focusReq.key}"]`) ?? root.current;
    el?.focus();
  }, [focusReq]);

  useEffect(() => {
    const c = machine.commit;
    if (c.kind === "armed") {
      const t = window.setTimeout(() => {
        void precheck(c.op).then((ok) => { if (ok) self.current.fire({ type: "DEADLINE", now: Math.max(performance.now(), c.deadline) }); });
      }, Math.max(0, c.deadline - performance.now()));
      return () => window.clearTimeout(t);
    }
    if (c.kind === "awaitingToken") {
      const t = window.setTimeout(() => self.current.fire({ type: "TOKEN_TIMEOUT", now: performance.now() }), TOKEN_WAIT_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [machine.commit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const tick = () => { if (document.visibilityState === "visible") void self.current.poll(); };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [ready]);

  useEffect(() => {
    if (!blocksUnload(machine)) return;
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: globalThis.MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.getAttribute("href") ?? "", window.location.href);
      if (url.origin === window.location.origin && inBatch(url.pathname)) return;   // handled in place by onClick
      e.preventDefault();
      e.stopPropagation();
      const c = m.current.commit;
      const name = windowOn(m.current)?.name ?? (c.kind === "netErr" ? c.op.name : "");
      self.current.showHint(fill(DESK.otherWindow, { name }));
    };
    const hide = () => self.current.fire({ type: "PAGE_UNLOAD" });
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
      window.removeEventListener("pagehide", hide);
    };
  }, [machine, batchId]);

  useEffect(() => {
    // §5.1, WCAG 2.4.11: scroll-padding-bottom follows the sticky decision bar's height (0 when the viewport is under
    // 480 px tall and the bar is not sticky). The value is a measured custom property on <html> (§3.1).
    const el = document.getElementById("decision-bar");
    const html = document.documentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => html.style.setProperty("--bar-h", window.innerHeight < 480 ? "0px" : `${Math.ceil(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    set();
    return () => { ro.disconnect(); window.removeEventListener("resize", set); html.style.removeProperty("--bar-h"); };
  }, [open, ready]);

  useEffect(() => {
    const onSettings = (e: globalThis.Event) => {
      const d = (e as CustomEvent<{ keys?: "on" | "off"; undo?: number }>).detail ?? {};
      if (d.keys) setSingleKeys(d.keys === "on");
      if (d.undo) { setUndoSeconds(d.undo); self.current.fire({ type: "SET_UNDO", seconds: d.undo }); }
    };
    window.addEventListener(DESK_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(DESK_SETTINGS_EVENT, onSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    const k = open.rows.findIndex((r) => r.conceptId === open.conceptId);
    for (const r of [open.rows[k - 1], open.rows[k + 1]]) if (r) router.prefetch(r.href);
  }, [open, router]);

  // ---- render
  const o = open;
  const bar = barNow();
  const commitErr = machine.commit.kind === "netErr" ? machine.commit : null;
  const reportErr = machine.report.kind === "netErr" ? machine.report : null;
  const api: DeskApi = {
    ready, batchId, role, total: props.total, singleKeys, undoSeconds, machine, bar, complete, hint, botState, retryBusy,
    drawerOpen, sheetOpen, reportOpen, note, noteError, diff, diffOpen, slots: { batchesNav: props.batchesNav, batchCard: props.batchCard },
    staleFor: (id) => stale[id] ?? null,
    netErrFor: (id) => (commitErr?.op.conceptId === id ? commitErr.saved : reportErr?.op.conceptId === id ? reportErr.saved : null),
    statusFor: (id, fallback) => overrides[id] ?? fallback,
    register, reloadOpen, navigate, move, toggleDrawer, pressApprove, announce,
    subtree: (id, version, node) => {
      const e = viewed.current.get(id);
      return e && !sameVersion(e.version, version) ? e.node : node;
    },
    clickReport: () => (reportRef.current ? setReport(false) : keyReport()),
    closeReport, setNote, sendReport,
    undo: () => {
      const inToast = document.activeElement?.closest(".toast");
      fire({ type: "PRESS_U" });
      if (inToast) root.current?.focus();
    },
    tryAgain: () => { retryFocus.current = true; fire({ type: "TRY_AGAIN", channel: m.current.commit.kind === "netErr" ? "commit" : "report" }); },
    retryCheck: () => { retrying.current = true; setRetryBusy(true); token.current = null; setBotState("checking"); setResetKey((k) => k + 1); },
    toggleDiff: () => setDiffOpen((v) => !v),
    openSource: () => { if (openRef.current) window.open(openRef.current.sourceUrl, "_blank", "noopener"); },
    openFirst: () => { setDone(false); if (openRef.current?.all[0]) navigate(openRef.current.all[0].href); },
    registerSearchClear: (fn) => { searchClear.current = fn; },
  };
  const label = singleKeys ? DESK.workspaceLabel : DESK_NEW.deskSettings.workspacePlain;
  const sendKeys = ready && IS_MAC_RE.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘ Enter" : "Ctrl Enter";
  return (
    <DeskCtx.Provider value={api}>
      <div className={styles.app} id="desk" role="region" tabIndex={0} aria-label={label} ref={root} onKeyDown={onKeyDown} onClick={onClick}>
        <a className={styles.skip} href="#record">{DESK_NEW.deskMisc.skipRecord}</a>
        <a className={styles.skip} href="#decision-bar">{DESK_NEW.deskMisc.skipBar}</a>
        <div className={`chrome-toolbar material ${styles.toolbar}`} inert={sheetOpen || undefined}>
          <a href="/review" className={styles.wordmark}><Wordmark size={17} sub="Review" /></a>
          <div className={styles.center}>
            <span>{DESK.batchPrefix} <b className="mono">{batchId}</b></span>
            <ProgressMeter approved={props.counts.approved} issue={props.counts.issue} total={props.total} />
            <span className="num">{fill(DESK.approvedOf, { a: props.counts.approved, n: props.total })}</span>
            <span className={styles.sep} aria-hidden="true" />
            <span className="num">{complete ? DESK.batchApproved : o ? fill(DESK.recordOf, { k: o.index, n: o.total }) : ""}</span>
          </div>
          <div className={styles.right}>
            <span className="role-badge">{ROLE_LABEL_DESK[role]}</span>
            {props.account}
          </div>
        </div>
        <div className={styles.body} inert={sheetOpen || undefined}>{props.children}</div>
        <div inert={sheetOpen || undefined}>
          <Toast view={toastView(machine)} seconds={machine.undoMs / 1000} singleKeys={singleKeys} onUndo={api.undo} />
        </div>
        <ShortcutsSheet open={sheetOpen} onClose={closeSheet} undoSeconds={undoSeconds} singleKeys={singleKeys} sendKeys={sendKeys}
          onUndo={chooseUndo} onKeys={chooseKeys} />
        {props.siteKey && (
          <div className={styles.turnstile}>
            <TurnstileField siteKey={props.siteKey} action="decision" nonce={props.nonce} resetKey={resetKey} appearance="interaction-only"
              refreshExpired="auto" hideStatus onToken={onToken} onError={onWidgetError} />
          </div>
        )}
        {/* No React children: lib/live-region's announce() owns this node's text. */}
        <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" data-desk="live" />
      </div>
    </DeskCtx.Provider>
  );
}
```

- [ ] **Step 4: Allow the desk's material, then run the tests**

The desk toolbar uses translucent material too (§3.4; 17b allowed the sidebar and the decision bar). In `web/tests/marks.test.ts` set:

```ts
export const MATERIAL_ALLOWED: string[] = [
  "components/review/ReviewToolbar.tsx",
  "components/review/ReviewDesk.tsx",
  "components/review/desk/DeskRecordContext.tsx",
  "components/review/desk/DecisionBar.tsx",
];
```

Run: `cd web && npx vitest run tests/desk-keys.test.tsx tests/desk-flow.test.tsx tests/decision-bar-states.test.tsx tests/decision-bar.test.tsx tests/desk-parts.test.tsx tests/client-islands.test.ts tests/inline-styles.test.ts tests/marks.test.ts && npm run lint:css`
Expected: PASS. The island check accepts `components/review/ReviewDesk.tsx` and every file under `components/review/desk/`; none of them imports `@/lib/api`, `@/lib/session` or a `server-only` module (`lib/desk-actions.ts` has no `server-only` import of its own).

- [ ] **Step 5: Commit**

```bash
git add web/components/review/ReviewDesk.tsx web/tests/desk-harness.tsx web/tests/desk-keys.test.tsx web/tests/desk-flow.test.tsx \
  web/tests/decision-bar-states.test.tsx web/tests/marks.test.ts
git commit -m "feat(web): the review desk island: undo window, keyboard, stale detection and reload, in-place links, drawer, sheet and report

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Web — the workspace routes: batch layout, batch redirect, record page, loading, not-found, error and the no-JavaScript confirm step (§2.1, §5.1, §5.8.6, §5.12)

**Files:**
- Create: `web/app/review/[batchId]/layout.tsx`, `web/app/review/[batchId]/page.tsx`, `web/app/review/[batchId]/[conceptId]/page.tsx`, `web/app/review/[batchId]/loading.tsx`, `web/app/review/not-found.tsx`, `web/app/review/error.tsx`, `web/components/review/BatchesNav.tsx`, `web/components/review/BatchCard.tsx`, `web/components/review/ShowFilters.tsx`, `web/components/review/sidebar.module.css`, `web/components/review/detail/ConfirmPanel.tsx`, `web/components/review/desk/LoadingPanes.tsx`
- Modify: `web/components/ui/ProgressMeter.tsx` (optional `wide` and `label`)
- Test: `web/tests/record-page.test.tsx`, `web/tests/ui-controls.test.tsx` (one case added). (`decision-bar-states.test.tsx` is Task 17c's: it drives the bar through the real desk.)

**Interfaces:**
- Consumes: everything from Tasks 7–17c; `getSession`, `isReviewer`, `cspNonce` (P1A), `turnstileSiteKey` (P1A), legacy `Turnstile({ action, nonce })` (P1A Task 15: the server-rendered implicit widget), `firstParam` (existing `@/lib/params`), `fmtUtc` (P1A).
- Produces:
  - Routes: `/review/[batchId]` (307 to the first record that needs review for the viewer's role in the current filter, otherwise record 1, with `?view=done` when every current record is approved, so the desk opens in the §5.12 complete view); `/review/[batchId]/[conceptId]?show=&q=&pane=&view=&confirm=&x=&d=&r=&e=`. Both pages check the session and the role themselves before any API call: on a client navigation Next renders only the page segment, so `app/review/layout.tsx` and the batch layout do not run (§2.3); batch not found renders `app/review/not-found.tsx` ("No batch with the id {id}." with "Open the review desk"); API errors render `app/review/error.tsx` ("Couldn't load batch {id}." with "Try again").
  - `stagesBlocked(item: ReviewItem): boolean` and `parseShow(v: unknown): FilterKey` exported from `app/review/[batchId]/[conceptId]/page.tsx`'s helper module `web/components/review/record-helpers.ts`.
  - `ProgressMeter({ approved, issue, total, wide?: boolean, label?: string })` (`wide` adds `prog--wide`; `label` replaces the default `aria-label`).
  - `ConfirmPanel({ item, role, x, d, r, error, nonce })` (server).

- [ ] **Step 1: Write the failing tests**

Add to `web/tests/ui-controls.test.tsx`, inside `describe("ProgressMeter", …)`:

```tsx
  it("the batch card's wide meter carries its own label", () => {
    expect(r(<ProgressMeter approved={1} issue={2} total={10} wide label="1 approved, 2 with an issue, 7 need review" />))
      .toContain('class="prog prog--wide" role="img" aria-label="1 approved, 2 with an issue, 7 need review"');
  });
```

Create `web/tests/record-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemsPage, ReviewItem } from "@/lib/review-types";
import { pilotItem, pilotRows } from "./fixtures/pilot";

const getReviewItems = vi.fn();
const getReviewItem = vi.fn();
const getReviewDiff = vi.fn();
const listReviewBatches = vi.fn();
const getSession = vi.fn();
const logOpenOnRender = vi.fn(async () => {});
const redirect = vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`); });
const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("@/lib/api", () => ({ getReviewItems: (...a: unknown[]) => getReviewItems(...a), getReviewItem: (...a: unknown[]) => getReviewItem(...a),
  getReviewDiff: (...a: unknown[]) => getReviewDiff(...a), listReviewBatches: () => listReviewBatches() }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/desk-core", () => ({ logOpenOnRender: (...a: unknown[]) => logOpenOnRender(...(a as [])) }));
vi.mock("@/lib/desk-actions", () => ({ decideFormAction: vi.fn(), decide: vi.fn(), logRecordOpen: vi.fn(), logEvidence: vi.fn(), loadDiff: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/Turnstile", () => ({ default: ({ action }: { action: string }) => <div className="cf-turnstile" data-action={action} /> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u), notFound: () => notFound(), useRouter: () => router,
  usePathname: () => "/review/0001-pilot" }));

import BatchLayout from "@/app/review/[batchId]/layout";
import BatchPage from "@/app/review/[batchId]/page";
import RecordPage from "@/app/review/[batchId]/[conceptId]/page";
import ReviewDesk from "@/components/review/ReviewDesk";

const PHARMACIST = { email: "pharm@e2e.test", name: "Farhana Islam", role: "pharmacist" as const };
const ITEMS: ItemsPage = { batchId: "0001-pilot", total: 10, filterCounts: { all: 10, needs: 10, warn: 9, issue: 0, approved: 0, nodata: 1 },
  items: pilotRows() };
const RID = "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22";

beforeEach(() => {
  for (const f of [getReviewItems, getReviewItem, getReviewDiff, listReviewBatches, getSession, logOpenOnRender, redirect, notFound]) f.mockClear();
  getSession.mockResolvedValue(PHARMACIST);
  getReviewItems.mockResolvedValue(ITEMS);
  listReviewBatches.mockResolvedValue([{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17Z", itemCount: 10,
    counts: { approved: 0, issue: 0, needsReview: 10, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 9 } }]);
});

async function page(key: string, sp: Record<string, string> = {}, item: ReviewItem | null = pilotItem(key)) {
  getReviewItem.mockResolvedValue(item);
  const conceptId = item?.conceptId ?? key;
  const out = await RecordPage({ params: Promise.resolve({ batchId: "0001-pilot", conceptId }), searchParams: Promise.resolve(sp) });
  return renderToStaticMarkup(
    <ReviewDesk batchId="0001-pilot" role="pharmacist" total={10} counts={{ approved: 0, issue: 0 }} undoSeconds={8} singleKeys siteKey={null}
      account={null} batchesNav={null} batchCard={null}>{out}</ReviewDesk>);
}

describe("the record page (§5.5, §5.6, §11.2)", () => {
  it("renders header, comparison, checks, interactions and history, and logs the open on render", async () => {
    const html = await page("napa");
    for (const t of ["DGDA source against the extraction", "Automated checks", "Interactions", "History"]) expect(html).toContain(t);
    expect(html).toContain(">Napa</h1>");
    expect(getReviewItem).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", "pharm@e2e.test");
    expect(logOpenOnRender).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", expect.any(Headers));
  });

  it.each([
    ["pending", "You&#x27;re reviewing as a pharmacist."],
    ["approved", "Approved by a pharmacist."],
    ["issue", "An issue is open on this record."],
    ["engineer_checked", "You&#x27;re reviewing as a pharmacist."],
    ["back_in_review", "You&#x27;re reviewing as a pharmacist."],
  ] as const)("%s: its pill and the server-rendered promise", async (status, lead) => {
    const html = await page("napa", {}, pilotItem("napa", { displayStatus: status }));
    expect(html).toContain(`<b>${lead}</b>`);
  });

  it("the eye drop states DDInter352 and its batch block counts 28 pairs", async () => {
    const html = await page("chloramphenicol");
    expect(html).toContain('is checked against <span class="mono">DDInter352</span>');
    expect(html).toContain("None of the 28 batch pairs from DDInter 2.0 involve Chloramphenicol.");
  });

  it("a failed check: the promise says so and the native form still never approves on its own", async () => {
    const base = pilotItem("napa");
    const html = await page("napa", {}, { ...base, stages: base.stages.map((s) => (s.stage === "dgda" ? { ...s, status: "fail" as const } : s)) });
    expect(html).toContain("<b>A check failed on this record.</b> It returns to review after the fix and re-run.");
  });

  it("back in review: the card with the diff from the previous run", async () => {
    getReviewDiff.mockResolvedValue({ from: "a", to: "b", reason: "rerun", rows: [{ field: "Trade name", before: "Napa", now: "Napa Extra" }] });
    const html = await page("napa", {}, pilotItem("napa", { displayStatus: "back_in_review",
      reopen: { reason: "rerun", at: "2026-10-12T09:00:00Z", previousExtractedAt: "2026-10-11T21:28:09Z", diffAvailable: true } }));
    expect(getReviewDiff).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", "2026-10-11T21:28:09Z");
    expect(html).toContain("This record was re-run after a pharmacist approved it.");
    expect(html).toContain("Napa Extra");
  });

  it("without JavaScript: the native form carries the version and a requestId, with the implicit widget and the notice", async () => {
    const html = await page("napa");
    expect(html).toMatch(/<form[^>]*class="decision-main fallbackForm"/);
    expect(html).toContain('<input type="hidden" name="extractedAt" value="2026-10-11T21:28:09.250Z"/>');
    expect(html).toContain('<input type="hidden" name="expectedLastDecisionId" value=""/>');
    expect(html).toMatch(/<input type="hidden" name="requestId" value="[0-9a-f-]{36}"\/>/);
    expect(html).toContain('<div class="cf-turnstile" data-action="decision"></div>');
    expect(html).toContain("<noscript>");
    expect(html).toContain("Reviewing needs JavaScript for the bot check. You can still read this record.");
    expect(html).toContain('<details id="evidence"');
  });

  it("the confirm step posts the URL's version, never the current one", async () => {
    const x = pilotItem("napa").version.extractedAt!;
    const html = await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID });
    expect(html).toContain("Confirm your decision on Napa.");
    expect(html).toContain("Your browser didn&#x27;t load the undo window, so nothing is saved until you confirm. Confirming publishes this record.");
    expect(html).toContain('<input type="hidden" name="commit" value="confirmed"/>');
    expect(html).toContain(`<input type="hidden" name="requestId" value="${RID}"/>`);
    expect(html).toContain(`<input type="hidden" name="extractedAt" value="${x}"/>`);
    expect(html).toMatch(/<button type="submit" class="btn btn--primary">Confirm<\/button>/);
  });

  it("a stale confirm shows the stale title and no Confirm button", async () => {
    const html = await page("napa", { confirm: "186-0030-006--napa", x: "2026-01-01T00:00:00Z", d: "", r: RID });
    expect(html).toContain("This record changed — reload to review the latest data");
    expect(html).not.toMatch(/>Confirm<\/button>/);
  });

  it("a refused confirm explains itself", async () => {
    const x = pilotItem("napa").version.extractedAt!;
    expect(await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID, e: "captcha" }))
      .toContain("We couldn&#x27;t confirm you&#x27;re a person. Your decision is kept. Retry the check to continue.");
    expect(await page("napa", { confirm: "186-0030-006--napa", x, d: "", r: RID, e: "rate_limited" })).toContain("Couldn&#x27;t save your decision.");
  });

  it("a removed or unknown record goes back to the batch, never a decision bar (Review Focus 4)", async () => {
    await expect(page("gone", {}, null)).rejects.toThrow("REDIRECT /review/0001-pilot");
    getReviewItems.mockResolvedValue(null);
    await expect(page("napa")).rejects.toThrow("NOT_FOUND");
  });

  it("a user account or no session never reaches the review API, even when only the page segment renders (§2.3)", async () => {
    for (const session of [{ ...PHARMACIST, role: "user" as const }, null]) {
      getSession.mockResolvedValue(session);
      getReviewItem.mockClear();
      getReviewItems.mockClear();
      await expect(RecordPage({ params: Promise.resolve({ batchId: "0001-pilot", conceptId: "186-0030-006--napa" }),
        searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
      await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
        .rejects.toThrow("NOT_FOUND");
      expect(getReviewItem).not.toHaveBeenCalled();
      expect(getReviewItems).not.toHaveBeenCalled();
    }
  });

  it("an open record outside the filter opens the first visible one; an empty view says so", async () => {
    getReviewItems.mockImplementation(async (_b: string, o: { show?: string }) => o?.show === "nodata"
      ? { ...ITEMS, items: ITEMS.items.filter((r) => r.hint.noData) } : o?.show === "issue" ? { ...ITEMS, items: [] } : ITEMS);
    await expect(page("napa", { show: "nodata" })).rejects.toThrow("REDIRECT /review/0001-pilot/127-0263-018--domperidone?show=nodata");
    const empty = await page("napa", { show: "issue" });
    expect(empty).toContain("<b>No records with an issue reported.</b>");
    expect(empty).toContain("Show all 10 records");
  });

  it("the list is the server's links when the island has not run, keeping the filter", async () => {
    const html = await page("napa", { q: "warfarin" });
    expect(html).toContain('href="/review/0001-pilot/185-0138-012--g-warfarin?q=warfarin"');
    expect(html).toContain('aria-current="page"');
  });
});

describe("the batch route and layout", () => {
  it("/review/[batchId] opens the first record that needs review for the viewer's role", async () => {
    const rows = pilotRows().map((r, i) => ({ ...r, displayStatus: (i < 2 ? "engineer_checked" : i < 3 ? "approved" : "pending") as never }));
    getReviewItems.mockResolvedValue({ ...ITEMS, items: rows });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${rows[0].conceptId}`);
    getSession.mockResolvedValue({ ...PHARMACIST, role: "engineer" });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${rows[3].conceptId}`);
  });

  it("a fully approved batch opens record 1 in the complete view (§5.12)", async () => {
    getReviewItems.mockResolvedValue({ ...ITEMS, items: pilotRows().map((r) => ({ ...r, displayStatus: "approved" as const })) });
    await expect(BatchPage({ params: Promise.resolve({ batchId: "0001-pilot" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`REDIRECT /review/0001-pilot/${pilotRows()[0].conceptId}?view=done`);
  });

  it("an unknown batch is not found; the layout gives the desk batch-level props only", async () => {
    await expect(BatchLayout({ children: <p>x</p>, params: Promise.resolve({ batchId: "nope" }) })).rejects.toThrow("NOT_FOUND");
    const html = renderToStaticMarkup(await BatchLayout({ children: <p>child</p>, params: Promise.resolve({ batchId: "0001-pilot" }) }));
    expect(html).toContain('<main id="content"');
    expect(html).toContain('id="desk" role="region"');
    expect(html).toContain('class="filter" href="/review/0001-pilot" aria-current="true"');
    expect(html).toContain("Approved when all 10 records are approved by a pharmacist.");
    expect(html).toContain("Run 11/10/2026 21:27 UTC");
    expect(html).toContain('data-desk-open="sheet"');
    expect(html).not.toContain("sourceJson");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/record-page.test.tsx tests/ui-controls.test.tsx`
Expected: FAIL — the routes do not exist; `ProgressMeter` ignores `wide`.

- [ ] **Step 3: Extend ProgressMeter**

Replace the component in `web/components/ui/ProgressMeter.tsx` with:

```tsx
/** §3.4 ProgressMeter (.prog, role="img"). Widths are the only inline style: the --w custom property. */
export default function ProgressMeter({ approved, issue, total, wide = false, label }:
    { approved: number; issue: number; total: number; wide?: boolean; label?: string }) {
  return (
    <span className={wide ? "prog prog--wide" : "prog"} role="img"
      aria-label={label ?? `${approved} of ${total} approved by a pharmacist, ${issue} with an issue reported`}>
      <i className={`p-ok ${styles.bar}`} style={{ "--w": pct(approved, total) } as CSSProperties} />
      <i className={`p-issue ${styles.bar}`} style={{ "--w": pct(issue, total) } as CSSProperties} />
    </span>
  );
}
```

- [ ] **Step 4: Write the sidebar parts, the confirm panel and the loading panes**

Create `web/components/review/sidebar.module.css`:

```css
.icoStack { --ico: var(--i-stack); }
.icoClock { --ico: var(--i-clock); }
.icoWarn { --ico: var(--i-warn); }
.icoFlag { --ico: var(--i-flag); }
.icoSeal { --ico: var(--i-seal); }
.ndIco { width: 12px; height: 12px; flex: none; margin-inline: 1px; box-shadow: inset 0 0 0 1.5px var(--fg-2); }
.card { margin-top: auto; padding: 12px; border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-1); display: flex; flex-direction: column; gap: 10px; font-size: 12.5px; color: var(--fg-2); }
.card b { color: var(--fg); font-weight: 600; }
.cardT { font-size: 13px; }
.dl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; }
.dl dd { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
.filterLink { text-decoration: none; }
.sk { display: block; height: 11px; border-radius: 5px; background: var(--surface-3); animation: sk-pulse 1.4s var(--ease-std) infinite; }
.skRow { display: grid; grid-template-columns: 22px minmax(0, 1fr) 70px; gap: 8px 10px; padding: 12px 18px; align-items: center; }
.skW14 { width: 14px; }
.skW40 { width: 40%; height: 26px; }
.skW60 { width: 60%; }
.skW80 { width: 80%; }
.skBlock { width: 100%; height: 180px; }
@keyframes sk-pulse { 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
```

Create `web/components/review/BatchesNav.tsx`:

```tsx
import { DESK } from "@/lib/review-copy";
import type { ReviewBatchSummary } from "@/lib/review-types";
import { batchHref } from "./desk/hrefs";
import s from "./sidebar.module.css";

/** §5.1 sidebar "Batches": stack icon, mono id, item count; the current batch has aria-current; a click clears filter and search. */
export default function BatchesNav({ batches, current }: { batches: ReviewBatchSummary[]; current: string }) {
  return (
    <div>
      <p className="chrome-heading">{DESK.batchesHeading}</p>
      <div className="filters" role="group" aria-label={DESK.batchesHeading}>
        {batches.map((b) => (
          <a key={b.batchId} className="filter" href={batchHref(b.batchId)} aria-current={b.batchId === current ? "true" : undefined}>
            <span className={`ico ${s.icoStack}`} aria-hidden="true" /><span className="mono">{b.batchId}</span>
            <span className="filter-n">{b.itemCount}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

Create `web/components/review/BatchCard.tsx`:

```tsx
import ProgressMeter from "@/components/ui/ProgressMeter";
import { fill } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { DESK } from "@/lib/review-copy";
import type { ReviewBatchSummary } from "@/lib/review-types";
import s from "./sidebar.module.css";

/** §5.1 batch card at the bottom of the sidebar. */
export default function BatchCard({ batch }: { batch: ReviewBatchSummary }) {
  const c = batch.counts, n = batch.itemCount;
  return (
    <div className={s.card}>
      <p className={s.cardT}><b>{fill(DESK.approvedOf, { a: c.approved, n }).replace(" approved", "")}</b> {DESK.cardTitleRest}</p>
      <ProgressMeter approved={c.approved} issue={c.issue} total={n} wide
        label={fill(DESK.cardMeter, { a: c.approved, i: c.issue, needs: c.needsReview })} />
      <dl className={s.dl}>
        <dt>{DESK.cardApproved}</dt><dd>{c.approved}</dd>
        <dt>{DESK.cardIssue}</dt><dd>{c.issue}</dd>
        <dt>{DESK.cardNeeds}</dt><dd>{c.needsReview}</dd>
      </dl>
      <p>{DESK.cardStatus} <b>{batch.status === "approved" ? DESK.approvedStatus : DESK.inReview}</b></p>
      <p>{fill(DESK.approvedWhen, { n })}</p>
      <p>{fill(DESK.run, { date: fmtUtc(batch.runAt) })}</p>
    </div>
  );
}
```

Create `web/components/review/ShowFilters.tsx`:

```tsx
import { DESK } from "@/lib/review-copy";
import { FILTER_KEYS, type FilterKey } from "@/lib/review-types";
import { recordHref } from "./desk/hrefs";
import s from "./sidebar.module.css";

const ICON: Record<FilterKey, string | null> = { all: s.icoStack, needs: s.icoClock, warn: s.icoWarn, issue: s.icoFlag, approved: s.icoSeal, nodata: null };

/** §5.3 "Show" filters as GET links (they work without JavaScript); the search text is kept. */
export default function ShowFilters({ batchId, conceptId, show, q, counts }:
    { batchId: string; conceptId: string; show: FilterKey; q: string; counts: Record<FilterKey, number> }) {
  return (
    <div>
      <p className="chrome-heading">{DESK.showHeading}</p>
      <div className="filters" role="group" aria-label={DESK.showHeading}>
        {FILTER_KEYS.map((k) => (
          <a key={k} className="filter" data-fk={`f-${k}`} href={recordHref(batchId, conceptId, { show: k, q })}
            aria-current={k === show ? "true" : undefined}>
            {ICON[k] ? <span className={`ico ${ICON[k]}`} aria-hidden="true" /> : <span className={s.ndIco} aria-hidden="true" />}
            {DESK.filters[k]}<span className="filter-n">{counts[k]}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

Create `web/components/review/record-helpers.ts`:

```ts
import { FILTER_KEYS, STAGE_KEYS, type FilterKey, type ReviewItem } from "@/lib/review-types";

/** §7.2 step 5 as the page shows it: a failed or missing check, or no run stamp, blocks "Looks correct". */
export function stagesBlocked(item: ReviewItem): boolean {
  if (item.version.extractedAt === null) return true;
  return STAGE_KEYS.some((k) => {
    const st = item.stages.find((s) => s.stage === k);
    return !st || st.status === "fail";
  });
}

export function parseShow(v: unknown): FilterKey {
  return typeof v === "string" && (FILTER_KEYS as readonly string[]).includes(v) ? (v as FilterKey) : "all";
}
```

Create `web/components/review/detail/ConfirmPanel.tsx`:

```tsx
import Turnstile from "@/components/Turnstile";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW, STALE_TITLE, fill } from "@/lib/copy";
import { decideFormAction } from "@/lib/desk-actions";
import { DESK } from "@/lib/review-copy";
import type { ReviewItem, ReviewerRole } from "@/lib/review-types";
import { recordHref } from "../desk/hrefs";
import s from "./detail.module.css";

const REFUSED: Record<string, string> = {
  issue_open: DESK.issueOpen, already_approved: DESK.alreadyApproved, already_checked: DESK.alreadyChecked,
  removed: DESK_NEW.approvalRefused.removedHint, stage_failed: DESK_NEW.approvalRefused.commitHint,
};

/**
 * §5.8.6 confirm step. Confirm posts commit=confirmed with the x, d and r values from the URL, never the current ones,
 * and a token from its own implicit widget. A version that no longer matches shows the stale banner and no Confirm.
 */
export default function ConfirmPanel({ item, role, x, d, r, error, nonce }:
    { item: ReviewItem; role: ReviewerRole; x: string; d: string; r: string; error: string | null; nonce?: string }) {
  const name = item.brand?.tradeName ?? item.conceptId;
  const cur = item.version;
  const rerun = (x || null) !== cur.extractedAt;
  const other = !rerun && (d ? Number(d) : null) !== cur.lastDecisionId;
  if (rerun || other)
    return <Banner tone="warn" title={STALE_TITLE} body={fill(rerun ? DESK.staleBodyRerun : DESK_NEW.deskMisc.staleOtherReviewer, { name })} />;
  const m = DESK_NEW.deskMisc;
  return (
    <div className={s.sec}>
      {error === "captcha" && <Banner tone="crit" title={DESK.botError} />}
      {(error === "rate_limited" || error === "failed" || error === "invalid") &&
        <Banner tone="crit" title={DESK.netTitle} body={fill(DESK.netBody, { name })} />}
      {error && REFUSED[error] && <Banner tone="info" title={REFUSED[error]} />}
      <Banner tone="info" title={fill(m.confirmTitle, { name })}
        body={`${m.confirmBody} ${role === "pharmacist" ? m.confirmPharmacist : m.confirmEngineer}`} />
      <form action={decideFormAction} className={s.chipRow}>
        <input type="hidden" name="batchId" value={item.batchId} />
        <input type="hidden" name="conceptId" value={item.conceptId} />
        <input type="hidden" name="decision" value="ok" />
        <input type="hidden" name="extractedAt" value={x} />
        <input type="hidden" name="expectedLastDecisionId" value={d} />
        <input type="hidden" name="requestId" value={r} />
        <input type="hidden" name="commit" value="confirmed" />
        <Turnstile action="decision" nonce={nonce} />
        <button type="submit" className="btn btn--primary">{m.confirm}</button>
        <a className={buttonClass("plain")} href={recordHref(item.batchId, item.conceptId)}>{m.cancel}</a>
      </form>
    </div>
  );
}
```

Create `web/components/review/desk/LoadingPanes.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { useDesk } from "./context";
import desk from "../desk.module.css";
import s from "../sidebar.module.css";

/**
 * §5.12 loading: 7 skeleton rows, a detail skeleton and a disabled decision bar. "Loading batch {id}" is shown and
 * announced through the desk's live region: §10.2 allows one polite region per page, so this part has no role="status".
 */
export default function LoadingPanes() {
  const { batchId, announce } = useDesk();
  const text = fill(DESK.loadingStatus, { id: batchId });
  const said = useRef("");
  // Once per text: `announce` is a new function on every desk render.
  useEffect(() => { if (said.current !== text) { said.current = text; announce(text); } }, [announce, text]);
  return (
    <div className={desk.panes} data-pane="list">
      <aside className={`side chrome-sidebar material ${desk.side}`} aria-label={DESK.sidebarLabel} />
      <section className={desk.list} aria-label="Records">
        <div className={desk.listH}><div className={desk.listT}><b>{batchId}</b><span>{DESK.loadingCount}</span></div></div>
        <div className={desk.listBody} aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <div className={s.skRow} key={i}><span className={`${s.sk} ${s.skW14}`} /><span className={`${s.sk} ${s.skW60}`} /><span className={s.sk} /></div>
          ))}
        </div>
      </section>
      <section className={desk.detail} aria-label="Record">
        <div className={desk.dBody}>
          <div className={desk.dScroll}>
            <p data-desk="loading">{text}</p>
            <span className={`${s.sk} ${s.skW40}`} /><span className={`${s.sk} ${s.skW80}`} /><span className={`${s.sk} ${s.skBlock}`} />
          </div>
        </div>
        <div className="decision-bar" data-state="ready">
          <div className="decision-main">
            <p className="decision-promise"><b>{fill(DESK.promiseLoading, { id: batchId })}</b> {DESK.promiseLoadingBody}</p>
            <div className="decision-actions">
              <button type="button" className="btn btn--tonal" aria-disabled="true">{DESK.reportIssue}</button>
              <button type="button" className="btn btn--primary" aria-disabled="true">{DESK.looksCorrect}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Write the routes**

Create `web/app/review/[batchId]/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import BatchCard from "@/components/review/BatchCard";
import BatchesNav from "@/components/review/BatchesNav";
import ReviewAccount, { newestInReview } from "@/components/review/ReviewAccount";
import ReviewDesk from "@/components/review/ReviewDesk";
import { listReviewBatches } from "@/lib/api";
import { KEYS_COOKIE, UNDO_COOKIE, parseKeys, parseUndo } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * The batch layout (§5.8.1, D44): toolbar, the sidebar's Batches list and batch card, and ReviewDesk with batch-level props
 * only. It receives no searchParams and no child params, so record-level data comes from the record page.
 */
export default async function BatchLayout({ children, params }: { children: ReactNode; params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered these
  const batches = await listReviewBatches();
  const batch = batches.find((b) => b.batchId === batchId);
  if (!batch) notFound();
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value);
  const keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  return (
    <main id="content">
      <ReviewDesk batchId={batchId} role={session.role} total={batch.itemCount}
        counts={{ approved: batch.counts.approved, issue: batch.counts.issue }}
        undoSeconds={parseUndo(store.get(UNDO_COOKIE)?.value)} singleKeys={keys === "on"} siteKey={turnstileSiteKey()} nonce={await cspNonce()}
        account={<ReviewAccount session={session} theme={theme} batchId={newestInReview(batches)} keys={keys} shortcutsItem />}
        batchesNav={<BatchesNav batches={batches} current={batchId} />} batchCard={<BatchCard batch={batch} />}>
        {children}
      </ReviewDesk>
    </main>
  );
}
```

Create `web/app/review/[batchId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { needsFor } from "@/components/review/desk/advance";
import { recordHref } from "@/components/review/desk/hrefs";
import { parseShow } from "@/components/review/record-helpers";
import { getReviewItems } from "@/lib/api";
import { firstParam } from "@/lib/params";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * §2.1: 307 to the first record in the current filter that needs review for the viewer's role, otherwise record 1. When
 * every current record is approved, record 1 opens with `?view=done`: the desk starts in the complete view (§5.12).
 */
export default async function BatchPage({ params, searchParams }:
    { params: Promise<{ batchId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { batchId } = await params;
  const sp = await searchParams;
  const show = parseShow(firstParam(sp.show));
  const q = firstParam(sp.q);
  // The page checks the role itself: on a client navigation only this segment renders, so no layout gate runs (§2.3).
  const session = await getSession();
  if (!session || !isReviewer(session)) notFound();
  const role = session.role === "engineer" ? "engineer" : "pharmacist";
  const page = await getReviewItems(batchId, { show, q });
  if (!page) notFound();
  const needed = page.items.find((r) => needsFor(role, r.displayStatus));
  if (needed) redirect(recordHref(batchId, needed.conceptId, { show, q }));
  const all = show === "all" && !q ? page : await getReviewItems(batchId);
  const first = page.items[0] ?? all?.items[0];
  if (!first) redirect("/review");
  const done = !!all && all.items.length > 0 && all.items.every((r) => r.displayStatus === "approved");
  redirect(done ? `${recordHref(batchId, first.conceptId)}?view=done` : recordHref(batchId, first.conceptId, { show, q }));
}
```

Create `web/app/review/[batchId]/[conceptId]/page.tsx`:

```tsx
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import ShowFilters from "@/components/review/ShowFilters";
import AutomatedChecks from "@/components/review/detail/AutomatedChecks";
import BackInReviewCard from "@/components/review/detail/BackInReviewCard";
import ComparisonTable from "@/components/review/detail/ComparisonTable";
import ConfirmPanel from "@/components/review/detail/ConfirmPanel";
import EvidenceContent from "@/components/review/detail/EvidenceContent";
import History from "@/components/review/detail/History";
import Interactions from "@/components/review/detail/Interactions";
import RecordHeader from "@/components/review/detail/RecordHeader";
import DeskRecordContext from "@/components/review/desk/DeskRecordContext";
import DetailTools from "@/components/review/desk/DetailTools";
import type { RecordRegistration, RowRef } from "@/components/review/desk/context";
import { batchHref, recordHref } from "@/components/review/desk/hrefs";
import { parseShow, stagesBlocked } from "@/components/review/record-helpers";
import { getReviewDiff, getReviewItem, getReviewItems } from "@/lib/api";
import { fill } from "@/lib/copy";
import { logOpenOnRender } from "@/lib/desk-core";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { DESK } from "@/lib/review-copy";
import type { ItemRow } from "@/lib/review-types";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The workspace record page (§2.1, §5.8.1): filters, list and detail, registered with the desk through DeskRecordContext. */
export default async function RecordPage({ params, searchParams }: {
  params: Promise<{ batchId: string; conceptId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { batchId, conceptId } = await params;
  const sp = await searchParams;
  const show = parseShow(firstParam(sp.show));
  const q = [...firstParam(sp.q).trim()].slice(0, 100).join("");
  const pane = firstParam(sp.pane) === "list" ? "list" : null;
  // Before any API call: on a client navigation only this segment renders, so the layouts' gates do not run (§2.3, G3).
  const session = await getSession();
  if (!session || !isReviewer(session)) notFound();
  const filtered = show !== "all" || q !== "";
  const [visible, everything, item] = await Promise.all([
    getReviewItems(batchId, { show, q }), filtered ? getReviewItems(batchId) : Promise.resolve(null),
    getReviewItem(batchId, conceptId, session.email),
  ]);
  if (!visible) notFound();
  if (!item) redirect(batchHref(batchId));
  if (visible.items.length > 0 && !visible.items.some((r) => r.conceptId === conceptId))
    redirect(recordHref(batchId, visible.items[0].conceptId, { show, q, ...(pane ? { pane } : {}) }));

  const toRow = (keepFilter: boolean) => (r: ItemRow): RowRef => ({ ...r, href: recordHref(batchId, r.conceptId, keepFilter ? { show, q } : {}) });
  const rows = visible.items.map(toRow(true));
  const all = (everything ?? visible).items.map(toRow(false));
  const k = rows.findIndex((r) => r.conceptId === conceptId);
  const reg: RecordRegistration = {
    batchId, conceptId, tradeName: item.brand?.tradeName ?? conceptId, index: item.index, total: item.total,
    displayStatus: item.displayStatus, version: item.version, stagesBlocked: stagesBlocked(item), sourceUrl: item.sourceUrl,
    show, q, rows, all, requestId: randomUUID(), prevHref: rows[k - 1]?.href ?? null, nextHref: rows[k + 1]?.href ?? null,
    complete: firstParam(sp.view) === "done" && all.length > 0 && all.every((r) => r.displayStatus === "approved"),
  };
  const emptyText = rows.length === 0 ? (q ? fill(DESK.noMatch, { q }) : DESK.empty[show]) : null;
  const diff = item.displayStatus === "back_in_review" && item.reopen?.diffAvailable
    ? (await getReviewDiff(batchId, conceptId, item.reopen.previousExtractedAt).catch(() => null))?.rows ?? null : null;
  const nonce = await cspNonce();
  const confirming = firstParam(sp.confirm) === conceptId;
  await logOpenOnRender(batchId, conceptId, await headers());
  return (
    <DeskRecordContext reg={reg} pane={pane} emptyText={emptyText}
      filters={<ShowFilters batchId={batchId} conceptId={conceptId} show={show} q={q} counts={visible.filterCounts} />}
      evidence={<EvidenceContent item={item} />}
      fallbackWidget={<Turnstile action="decision" nonce={nonce} />}
      confirm={confirming ? <ConfirmPanel item={item} role={session.role === "engineer" ? "engineer" : "pharmacist"} x={firstParam(sp.x)}
        d={firstParam(sp.d)} r={firstParam(sp.r)} error={firstParam(sp.e) || null} nonce={nonce} /> : null}>
      <RecordHeader item={item} tools={<DetailTools reg={reg} />} backHref={recordHref(batchId, conceptId, { show, q, pane: "list" })} />
      {item.displayStatus === "back_in_review" && <BackInReviewCard item={item} diff={diff} />}
      <ComparisonTable item={item} />
      <AutomatedChecks item={item} />
      <Interactions item={item} />
      <History item={item} />
    </DeskRecordContext>
  );
}
```

Create `web/app/review/[batchId]/loading.tsx`:

```tsx
import LoadingPanes from "@/components/review/desk/LoadingPanes";

/** §5.12 Loading: rendered inside the batch layout, so the toolbar and the desk stay. */
export default function Loading() {
  return <LoadingPanes />;
}
```

Create `web/app/review/not-found.tsx`:

```tsx
import { headers } from "next/headers";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import styles from "./review.module.css";

/** §5.12 "Batch not found": "No batch with the id {id}." with "Open the review desk". No batch data. */
export default async function ReviewNotFound() {
  const id = decodeURIComponent((await headers()).get("x-pathname")?.split("/")[2] ?? "");
  return (
    <main id="content" className={styles.page}>
      <h1>{DESK.batchesHeading}</h1>
      <Banner tone="info" title={fill(DESK_NEW.deskLoad.notFound, { id })}
        action={<a className={buttonClass("tonal", "sm")} href="/review">{DESK.openDesk}</a>} />
    </main>
  );
}
```

Create `web/app/review/error.tsx`:

```tsx
"use client";
import { usePathname } from "next/navigation";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { DESK_NEW, fill } from "@/lib/copy";
import styles from "./review.module.css";

/** Island (§4.2 ErrorBoundary): §5.12 "API error loading the batch". Nothing was changed; Try again re-renders. */
export default function ReviewError({ reset }: { error: Error; reset: () => void }) {
  const id = decodeURIComponent(usePathname()?.split("/")[2] ?? "");
  const t = DESK_NEW.deskLoad;
  return (
    <main id="content" className={styles.page}>
      <Banner tone="crit" role="alert" title={fill(t.errorTitle, { id })} body={t.errorBody}
        action={<Button variant="tonal" size="sm" onClick={reset}>{DESK_NEW.reviewLists.tryAgain}</Button>} />
    </main>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

First add `"components/review/desk/LoadingPanes.tsx",` (its skeleton sidebar and decision bar) as the last entry of `MATERIAL_ALLOWED` in `web/tests/marks.test.ts`.

Run: `cd web && npx vitest run tests/record-page.test.tsx tests/decision-bar-states.test.tsx tests/desk-flow.test.tsx tests/ui-controls.test.tsx tests/client-islands.test.ts tests/review-copy.test.tsx tests/marks.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 7: Build once (types, the island check and the bundle scan)**

Run: `cd web && npm run build`
Expected: the build succeeds; `postbuild` prints `client island check: … all on the §4.2 allowlist`, and `check-client-bundle.mjs` finds no secret in the client bundle.

- [ ] **Step 8: Commit**

```bash
git add "web/app/review/[batchId]" web/app/review/not-found.tsx web/app/review/error.tsx web/components/review/BatchesNav.tsx \
  web/components/review/BatchCard.tsx web/components/review/ShowFilters.tsx web/components/review/sidebar.module.css \
  web/components/review/record-helpers.ts web/components/review/detail/ConfirmPanel.tsx web/components/review/desk/LoadingPanes.tsx \
  web/components/ui/ProgressMeter.tsx web/tests/record-page.test.tsx web/tests/ui-controls.test.tsx \
  web/tests/marks.test.ts
git commit -m "feat(web): review workspace routes, batch layout, record page and the no-JavaScript confirm step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 19: Web — `/review` (batch list) and `/review/flags` (problem reports and partner requests) (§2.1, §5.16)

**Files:**
- Create: `web/app/review/page.tsx`, `web/app/review/flags/page.tsx`, `web/components/review/BatchList.tsx`, `web/components/review/FlagSection.tsx`, `web/components/review/desk/ResolveButton.tsx`, `web/components/review/desk/Announce.tsx`
- Modify: `web/lib/review-copy.ts` (one string), `web/lib/actions-core.ts` (`submitResolve`, and `submitFlag` sends the request id), `web/lib/review-actions.ts` (`resolveFlagAction`), `web/app/review/error.tsx` (no batch id in the path), `web/app/review/review.module.css` (list rows, flag items)
- Test: `web/tests/review-home.test.tsx`, `web/tests/review-flags-page.test.tsx`, `web/tests/review-actions.test.ts`

**Interfaces:**
- Consumes: `listReviewBatches`, `listFlagPage(kind, page)`, `resolveFlag(id, by, requestId?)`, `createFlag({ …, requestId? })` (Task 7); `requestId(): Promise<string>` from `@/lib/request-id` (P1A Task 18: the middleware's `x-request-id`); `ReviewToolbar`, `newestInReview` (Task 14); `batchHref` (Task 11); `DESK`, `DESK_NEW.reviewLists`, `fill`, `fillNodes` (Task 9); `ProgressMeter` with `wide`/`label` (Task 18); `TurnstileField({ siteKey, action, nonce })` (P1A); `Banner`, `buttonClass`, `Button` (P1A); `fmtUtc`, `fmtDhaka` (P1A); `flagReturnPath` (existing `actions-core`); `cspNonce`, `turnstileSiteKey` (P1A).
- Produces:
  - `REVIEW_LISTS = { batchBannerBody }` in `web/lib/review-copy.ts` (Board DS copy). The §1.7 string "Interaction check" is `DESK_NEW.reviewLists.interactionCheck` in `NEW_COPY` (Task 9), never retyped here.
  - `submitResolve(fd)` and `submitFlag(fd)` send `requestId: await requestId()`, the web request id the middleware sets, so the API's `flag_resolved`, `flag_created` and `partner_request` audit rows carry it (§5.15). No form field carries a request id. `submitResolve` revalidates `/review/flags`. A second resolve of the same flag is the API's 409, read as `invalid` ("That flag is no longer open.").
  - `resolveFlagAction(fd)` redirects to `/review/flags?resolve={code}&kind={reports|partner}` (`kind` from the form, anything else reads `reports`), still through P1A Task 25's module-private `logged("action:resolve", () => submitResolve(formData))`, so it logs one `action:resolve` line.
  - `/review/flags?rp={n}&pp={n}&resolve=&kind=`: `rp` is the problem-report page, `pp` the partner-request page (0-based, 0–10000, anything else reads 0).
  - Islands (allowlisted directory): `ResolveButton({ flagId: number; kind: "reports" | "partner" })`, `Announce({ text: string; className?: string })`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/review-home.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewBatchSummary } from "@/lib/review-types";

const getSession = vi.fn();
const listReviewBatches = vi.fn();
const redirect = vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`); });
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ listReviewBatches: () => listReviewBatches() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u), useRouter: () => ({}) }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import ReviewHome from "@/app/review/page";

const counts = (approved: number, n: number) =>
  ({ approved, issue: 0, needsReview: n - approved, engineerChecked: 0, backInReview: 0, noData: 0, warnings: 0 });
const batch = (batchId: string, status: ReviewBatchSummary["status"], runAt: string, approved: number, n: number): ReviewBatchSummary =>
  ({ batchId, status, runAt, itemCount: n, counts: counts(approved, n) });

beforeEach(() => {
  getSession.mockResolvedValue({ email: "pharm@e2e.test", name: "Farhana Islam", role: "pharmacist" });
  redirect.mockClear();
});

describe("/review (§2.1, §5.16)", () => {
  it("exactly one batch in review: redirect to it", async () => {
    listReviewBatches.mockResolvedValue([batch("0001-pilot", "in_review", "2026-10-11T21:27:17Z", 0, 10),
      batch("0000-old", "approved", "2026-09-01T10:00:00Z", 4, 4)]);
    await expect(ReviewHome()).rejects.toThrow("REDIRECT /review/0001-pilot");
  });

  it("two in review: a banner each, the list in_review first then newest run, and the flags link", async () => {
    listReviewBatches.mockResolvedValue([
      batch("0000-old", "approved", "2026-09-01T10:00:00Z", 4, 4),
      batch("0002-b", "in_review", "2026-10-01T08:00:00Z", 2, 3),
      batch("0003-c", "in_review", "2026-10-12T08:00:00Z", 0, 12),
    ]);
    const html = renderToStaticMarkup(await ReviewHome());
    expect(html).toContain("<h1>Batches</h1>");
    expect(html).toContain('Batch <span class="mono">0002-b</span> has 1 record waiting for a pharmacist.');
    expect(html).toContain('Batch <span class="mono">0003-c</span> has 12 records waiting for a pharmacist.');
    expect(html).toContain("The batch is approved when every record is approved by a pharmacist.");
    const order = [...html.matchAll(/href="\/review\/(0\d{3}-[a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["0003-c", "0002-b", "0000-old"]);
    expect(html).toContain("2 of 3 approved");
    expect(html).toContain("Batch status: <b>In review</b>");
    expect(html).toContain("Batch status: <b>Approved</b>");
    expect(html).toContain("Run 12/10/2026 08:00 UTC");
    expect(html).toContain('<a href="/review/flags">Problem reports and partner requests</a>');
    expect(html).not.toContain("pharm@e2e.test</a>");
  });

  it("none in review: the sentence instead of banners, and the list still shows", async () => {
    listReviewBatches.mockResolvedValue([batch("0000-old", "approved", "2026-09-01T10:00:00Z", 4, 4)]);
    const html = renderToStaticMarkup(await ReviewHome());
    expect(html).toContain("No batches are in review.");
    expect(html).not.toContain("banner--info");
    expect(html).toContain('href="/review/0000-old"');
  });
});
```

Create `web/tests/review-flags-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlagPage } from "@/lib/review-types";

const getSession = vi.fn();
const listFlagPage = vi.fn();
const listReviewBatches = vi.fn(async () => []);
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ listFlagPage: (k: string, p: number) => listFlagPage(k, p), listReviewBatches: () => listReviewBatches() }));
vi.mock("@/lib/review-actions", () => ({ resolveFlagAction: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/TurnstileField", () => ({ default: ({ action }: { action: string }) => <div data-turnstile={action} /> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({}) }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import FlagsPage from "@/app/review/flags/page";

const REPORTS: FlagPage = { page: 0, size: 50, hasMore: true, items: [
  { id: 11, targetType: "product", targetId: "186-0030-006--napa", message: "Wrong strength\nfor <b>Napa</b>", status: "open", createdAt: "2026-10-11T21:27:00Z" },
  { id: 12, targetType: "check", targetId: "check", message: "Missing pair", status: "open", createdAt: "2026-10-11T21:30:00Z" },
] };
const PARTNER: FlagPage = { page: 0, size: 50, hasMore: false, items: [
  { id: 21, targetType: "other", targetId: "partner-access", message: "Clinic X wants access", status: "open", createdAt: "2026-10-12T02:00:00Z" },
] };
const render = async (sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await FlagsPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  getSession.mockResolvedValue({ email: "pharm@e2e.test", name: "P", role: "pharmacist" });
  listFlagPage.mockReset();
  listFlagPage.mockImplementation(async (k: string) => (k === "partner" ? PARTNER : REPORTS));
});

describe("/review/flags (§5.16)", () => {
  it("two sections with their headings, targets, messages and Dhaka dates; no email anywhere", async () => {
    const html = await render();
    expect(html).toContain("<h1>Problem reports and partner requests</h1>");
    expect(html).toContain("<h2>Problem reports</h2>");
    expect(html).toContain("<h2>Partner access requests</h2>");
    expect(html).toContain('<a href="/products/186-0030-006--napa">186-0030-006--napa</a>');
    expect(html).toContain("Interaction check");
    expect(html).toContain('<p class="raw">Wrong strength\nfor &lt;b&gt;Napa&lt;/b&gt;</p>');
    expect(html).toContain("Reported 12/10/2026 03:27 Dhaka");
    expect(html).toContain("Clinic X wants access");
    expect(html.match(/@/g)).toHaveLength(1);   // only the viewer's own email, in their account menu (§2.2)
  });

  it("one form, one widget with action resolve, and a Resolve button per item that targets it", async () => {
    const html = await render();
    expect(html.match(/<form id="resolve-form"/g)).toHaveLength(1);   // the account menu's own forms aside
    expect(html.match(/data-turnstile="resolve"/g)).toHaveLength(1);
    expect(html).not.toContain('name="requestId"');   // the action sends the web request id (§5.15)
    expect(html.match(/form="resolve-form"/g)).toHaveLength(3);
    expect(html).toContain('name="flagId" value="21"');
    expect(html).toContain("<noscript><p>Resolving needs JavaScript for the bot check.</p></noscript>");
  });

  it("paging: 50 per section, Next page while hasMore, Previous page after the first", async () => {
    expect(await render()).toContain('<a href="/review/flags?rp=1&amp;pp=0">Next page</a>');
    listFlagPage.mockImplementation(async (k: string, p: number) => (k === "partner" ? PARTNER : { ...REPORTS, page: p, hasMore: false }));
    const html = await render({ rp: "2", pp: "0" });
    expect(listFlagPage).toHaveBeenCalledWith("reports", 2);
    expect(html).toContain('<a href="/review/flags?rp=1&amp;pp=0">Previous page</a>');
    expect(html).not.toContain("Next page");
    await render({ rp: "-1", pp: "abc" });
    expect(listFlagPage).toHaveBeenCalledWith("reports", 0);
    expect(listFlagPage).toHaveBeenCalledWith("partner", 0);
  });

  it("empty sections say so", async () => {
    listFlagPage.mockResolvedValue({ page: 0, size: 50, hasMore: false, items: [] });
    const html = await render();
    expect(html).toContain("No open problem reports.");
    expect(html).toContain("No open partner requests.");
    expect(html).not.toContain('id="resolve-form"');
  });

  it("outcomes: resolved names the kind; the other codes keep their messages; unknown codes show nothing", async () => {
    expect(await render({ resolve: "resolved", kind: "reports" })).toContain('<p role="status" class="outcome">Report resolved.</p>');
    expect(await render({ resolve: "resolved", kind: "partner" })).toContain("Request resolved.");
    expect(await render({ resolve: "captcha" })).toContain("The verification check failed. Please try again.");
    expect(await render({ resolve: "invalid" })).toContain("That flag is no longer open.");
    const odd = await render({ resolve: "<script>" });
    expect(odd).not.toContain("&lt;script&gt;");
    expect(odd).not.toContain('class="outcome"');
  });

  it("an API error: the crit banner with Try again, and no sections", async () => {
    listFlagPage.mockRejectedValue(new Error("API error 502"));
    const html = await render({ rp: "1" });
    expect(html).toContain("Couldn&#x27;t load the reports.");
    expect(html).toContain("Nothing was changed. Check your connection and try again.");
    expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/review/flags?rp=1&amp;pp=0">Try again</a>');
    expect(html).not.toContain("<h2>Problem reports</h2>");
  });
});
```

In `web/tests/review-actions.test.ts`, give the `next/headers` mock the middleware's request id: add `"x-request-id": "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f"` to the `Headers` it returns (keep the headers it already has), and add below the mocks:

```ts
const REQ_ID = "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f";   // the x-request-id in the next/headers mock above
```

In the case "lets any signed-in user (role user) flag, with the session's email", the expected `createFlag` body gains `requestId: REQ_ID` (the object passed to `toEqual` is `{ targetType: "product", targetId: "P-1", message: "Wrong company name", reporterEmail: "someone@gmail.com", requestId: REQ_ID }`). Then replace the three resolve cases that name `/flags`:

```ts
  it("a reviewer resolves with the token, the session's email and the web request id, then revalidates /review/flags", async () => {
    getSession.mockResolvedValue(ENGINEER);
    fetchMock.mockResolvedValue(ok({ id: 3, status: "resolved" }));
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" })))
      .toMatchObject({ status: 200, code: "resolved" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags/3/resolve");
    expect(new Headers(init.headers).get("X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ resolvedBy: "eng@example.org", requestId: REQ_ID });
    expect(revalidatePath).toHaveBeenCalledWith("/review/flags");
  });

  it("a request id in the form is ignored; the audit row carries the web request id (§5.15)", async () => {
    getSession.mockResolvedValue(ENGINEER);
    fetchMock.mockResolvedValue(ok({ id: 3, status: "resolved" }));
    await submitResolve(form({ flagId: "3", requestId: "'; drop table flags; --", "cf-turnstile-response": "t" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ resolvedBy: "eng@example.org", requestId: REQ_ID });
    getSession.mockResolvedValue(USER);
    fetchMock.mockResolvedValue(ok({ id: 9 }, 201));
    await submitFlag(flag({ requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).requestId).toBe(REQ_ID);
  });

  it("resolveFlagAction redirects to /review/flags with the outcome and the kind", async () => {
    getSession.mockResolvedValue(USER);
    await expect(resolveFlagAction(form({ flagId: "3", kind: "partner" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/review/flags?resolve=forbidden&kind=partner");
    await expect(resolveFlagAction(form({ flagId: "3", kind: "<x>" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/review/flags?resolve=forbidden&kind=reports");
  });

  it("resolveFlagAction keeps P1A's log line: one action:resolve line with the status, never an email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    getSession.mockResolvedValue(USER);
    await resolveFlagAction(form({ flagId: "3", kind: "partner" })).catch(() => {});
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0]))).map((l) => [l.route, l.method, l.status]))
      .toEqual([["action:resolve", "POST", 403]]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("someone@");
    log.mockRestore();
  });
```

(The existing case "a reviewer resolves with the token and the session's email, then revalidates /flags" and "resolveFlagAction redirects to /flags with the outcome" are the two this replaces; the new middle case and the log-line case are added. P1A Task 25's "server action log line" case stays as it is until Task 20.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/review-home.test.tsx tests/review-flags-page.test.tsx tests/review-actions.test.ts`
Expected: FAIL — `@/app/review/page` and `@/app/review/flags/page` do not resolve; the resolve action still revalidates and redirects to `/flags`, and neither action sends a `requestId`.

- [ ] **Step 3: Update the resolve action**

In `web/lib/actions-core.ts`, add `import { requestId } from "@/lib/request-id";` (P1A's `actions-core.ts` does not import it; `recordAudit` reads it inside `lib/audit.ts`. If the line is already there, keep the one import), add `requestId: await requestId()` to the object `submitFlag` passes to `createFlag`, and replace `submitResolve` with:

```ts
export async function submitResolve(fd: FormData): Promise<ActionResult<ResolveCode>> {
  const session = await getSession();
  if (!isReviewer(session)) return { status: 403, code: "forbidden" };

  const raw = field(fd, "flagId");
  if (!/^[1-9][0-9]{0,17}$/.test(raw)) return { status: 400, code: "invalid" };

  if (!(await turnstilePassed(fd, "resolve"))) return { status: 403, code: "captcha" };

  // §5.15: the audit row carries the web request id (the middleware's x-request-id). A second resolve is the API's 409.
  const r = await resolveFlag(Number(raw), session.email, await requestId());
  if (!r.ok) return r.status === 404 || r.status === 409 ? { status: 400, code: "invalid" } : { status: 502, code: "failed" };
  revalidatePath("/review/flags");
  return { status: 200, code: "resolved" };
}
```

In `web/lib/review-actions.ts`, replace `resolveFlagAction` with (P1A Task 25's `logged("action:resolve", …)` wrapper stays: it writes the §5.15/§9.7 log line, and P1A's "server action log line" case in `tests/review-actions.test.ts` must keep passing):

```ts
export async function resolveFlagAction(formData: FormData): Promise<void> {
  const { code } = await logged("action:resolve", () => submitResolve(formData));
  const kind = formData.get("kind") === "partner" ? "partner" : "reports";
  redirect(`/review/flags?${new URLSearchParams({ resolve: code, kind })}`);
}
```

- [ ] **Step 4: Add the banner string, the islands and the bodies**

Append to `web/lib/review-copy.ts`:

```ts
/** §5.16 Board DS copy that Board R does not draw: the batch banner body. New §1.7 copy lives in NEW_COPY (Task 9). */
export const REVIEW_LISTS = {
  batchBannerBody: "The batch is approved when every record is approved by a pharmacist.",
} as const;
```

Append to `web/app/review/review.module.css`:

```css
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s3); }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--s2) var(--s4); align-items: center; padding: var(--s4); border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-1); color: var(--fg); text-decoration: none; }
.row:hover { background: var(--surface-2); }
.rowMeta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: var(--s2) var(--s4); color: var(--fg-2); font-size: 13px; }
.rowMeta b { color: var(--fg); font-weight: 600; }
.flag { display: flex; flex-direction: column; gap: var(--s2); padding: var(--s4); border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-1); }
.flagHead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s2) var(--s3); }
.flagWhen { color: var(--fg-2); font-size: 13px; }
.paging { display: flex; gap: var(--s4); }
.section { display: flex; flex-direction: column; gap: var(--s3); }
```

Create `web/components/review/desk/Announce.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { announce } from "@/lib/live-region";

/**
 * Island: the page's one polite status line (§10.2). It is in the server HTML (it reads without JavaScript) and is
 * announced once on load through P1A's announce(): cleared, then written after ANNOUNCE_DELAY_MS (60 ms).
 */
export default function Announce({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => announce(ref.current, text), [text]);   // the cleanup cancels a pending write
  return <p ref={ref} role="status" className={className}>{text}</p>;
}
```

Create `web/components/review/desk/ResolveButton.tsx`:

```tsx
"use client";
import { useState, type MouseEvent } from "react";
import { DESK_NEW } from "@/lib/copy";

/**
 * Island: "Resolve" (tonal sm, busy "Resolving", §5.16). It submits the page's one form (`#resolve-form`, which holds the
 * shared Turnstile widget) and first writes its kind into the form's hidden `kind` field so the outcome names it.
 */
export default function ResolveButton({ flagId, kind }: { flagId: number; kind: "reports" | "partner" }) {
  const [busy, setBusy] = useState(false);
  const t = DESK_NEW.reviewLists;
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (busy) { e.preventDefault(); return; }
    const input = document.getElementById("resolve-kind");
    if (input instanceof HTMLInputElement) input.value = kind;
    setBusy(true);
  }
  return (
    <button type="submit" form="resolve-form" name="flagId" value={String(flagId)} className="btn btn--tonal btn--sm"
      aria-disabled={busy || undefined} onClick={onClick}>
      {busy ? t.resolving : t.resolve}
    </button>
  );
}
```

Create `web/components/review/BatchList.tsx`:

```tsx
import Banner from "@/components/ui/Banner";
import ProgressMeter from "@/components/ui/ProgressMeter";
import { DESK_NEW, fill } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { DESK, REVIEW_LISTS, fillNodes } from "@/lib/review-copy";
import type { ReviewBatchSummary } from "@/lib/review-types";
import { batchHref } from "./desk/hrefs";
import styles from "@/app/review/review.module.css";

/** In review first, then by run time, newest first (§5.16). */
export function orderBatches(batches: ReviewBatchSummary[]): ReviewBatchSummary[] {
  const rank = (b: ReviewBatchSummary) => (b.status === "in_review" ? 0 : 1);
  return [...batches].sort((a, b) => rank(a) - rank(b) || b.runAt.localeCompare(a.runAt));
}

/** §5.16 body of /review: one info banner per batch in review (w = records not yet approved), then every batch. */
export default function BatchList({ batches }: { batches: ReviewBatchSummary[] }) {
  const t = DESK_NEW.reviewLists;
  const ordered = orderBatches(batches);
  const inReview = ordered.filter((b) => b.status === "in_review");
  return (
    <>
      {inReview.length === 0 ? <p>{t.noBatches}</p> : inReview.map((b) => {
        const w = b.itemCount - b.counts.approved;
        return (
          <Banner key={b.batchId} tone="info" body={REVIEW_LISTS.batchBannerBody}
            title={fillNodes(w === 1 ? t.waitingOne : t.waitingMany, { id: <span className="mono">{b.batchId}</span>, w })} />
        );
      })}
      <ul className={styles.list}>
        {ordered.map((b) => (
          <li key={b.batchId}>
            <a className={styles.row} href={batchHref(b.batchId)}>
              <span className="mono">{b.batchId}</span>
              <ProgressMeter approved={b.counts.approved} issue={b.counts.issue} total={b.itemCount} />
              <span className={styles.rowMeta}>
                <span className="num">{fill(DESK.approvedOf, { a: b.counts.approved, n: b.itemCount })}</span>
                <span>{DESK.cardStatus} <b>{b.status === "approved" ? DESK.approvedStatus : DESK.inReview}</b></span>
                <span>{fill(DESK.run, { date: fmtUtc(b.runAt) })}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
```

Create `web/components/review/FlagSection.tsx`:

```tsx
import { flagReturnPath } from "@/lib/actions-core";
import { DESK_NEW, fill } from "@/lib/copy";
import { fmtDhaka } from "@/lib/format";
import type { FlagItem, FlagPage } from "@/lib/review-types";
import ResolveButton from "./desk/ResolveButton";
import styles from "@/app/review/review.module.css";

export type FlagKind = "reports" | "partner";
export type FlagPaging = { rp: number; pp: number };
export const flagsHref = (p: FlagPaging) => `/review/flags?${new URLSearchParams({ rp: String(p.rp), pp: String(p.pp) })}`;

function Target({ f }: { f: FlagItem }) {
  if (f.targetType === "check") return <>{DESK_NEW.reviewLists.interactionCheck}</>;
  if (f.targetType === "product" || f.targetType === "substance") return <a href={flagReturnPath(f.targetType, f.targetId)}>{f.targetId}</a>;
  return <span className="mono">{f.targetId}</span>;
}

/** One §5.16 section: h2, the open flags (target, message in .raw, "Reported {Dhaka}", Resolve), paging links. */
export default function FlagSection({ kind, page, paging }: { kind: FlagKind; page: FlagPage; paging: FlagPaging }) {
  const t = DESK_NEW.reviewLists;
  const key = kind === "reports" ? "rp" : "pp";
  const at = (n: number) => flagsHref({ ...paging, [key]: n });
  return (
    <section className={styles.section} aria-labelledby={`flags-${kind}`}>
      <h2 id={`flags-${kind}`}>{kind === "reports" ? t.reportsHeading : t.partnerHeading}</h2>
      {page.items.length === 0 ? <p>{kind === "reports" ? t.noReports : t.noRequests}</p> : (
        <ul className={styles.list}>
          {page.items.map((f) => (
            <li key={f.id} className={styles.flag}>
              <div className={styles.flagHead}>
                <span><Target f={f} /></span>
                <ResolveButton flagId={f.id} kind={kind} />
              </div>
              <p className="raw">{f.message}</p>
              <p className={styles.flagWhen}>{fill(t.reported, { date: fmtDhaka(f.createdAt) })}</p>
            </li>
          ))}
        </ul>
      )}
      {(page.page > 0 || page.hasMore) && (
        <p className={styles.paging}>
          {page.page > 0 && <a href={at(page.page - 1)}>{t.previousPage}</a>}
          {page.hasMore && <a href={at(page.page + 1)}>{t.nextPage}</a>}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write the two pages and teach the error boundary about pages without a batch**

Create `web/app/review/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BatchList from "@/components/review/BatchList";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import { newestInReview } from "@/components/review/ReviewAccount";
import { batchHref } from "@/components/review/desk/hrefs";
import { listReviewBatches } from "@/lib/api";
import { DESK_NEW } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { DESK } from "@/lib/review-copy";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";

/** §5.16 batch list; with exactly one batch in review, the desk opens straight away (§2.1). */
export default async function ReviewHome() {
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered these
  const batches = await listReviewBatches();
  const inReview = batches.filter((b) => b.status === "in_review");
  if (inReview.length === 1) redirect(batchHref(inReview[0].batchId));
  const store = await cookies();
  return (
    <div className={styles.shell}>
      <ReviewToolbar session={session} theme={parseTheme(store.get(THEME_COOKIE)?.value)} batchId={newestInReview(batches)}
        keys={parseKeys(store.get(KEYS_COOKIE)?.value)} />
      <main id="content" className={styles.page}>
        <h1>{DESK.batchesHeading}</h1>
        <BatchList batches={batches} />
        <p><a href="/review/flags">{DESK_NEW.reviewLists.flagsLink}</a></p>
      </main>
    </div>
  );
}
```

Create `web/app/review/flags/page.tsx`:

```tsx
import { cookies } from "next/headers";
import TurnstileField from "@/components/TurnstileField";
import FlagSection, { flagsHref, type FlagPaging } from "@/components/review/FlagSection";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import { newestInReview } from "@/components/review/ReviewAccount";
import Announce from "@/components/review/desk/Announce";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { listFlagPage, listReviewBatches } from "@/lib/api";
import { DESK_NEW } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { resolveFlagAction } from "@/lib/review-actions";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";
import styles from "../review.module.css";

export const dynamic = "force-dynamic";

/** Fixed messages for the resolve outcome codes (the existing map; `resolved` names the kind, §5.16). Anything else shows nothing. */
const RESOLVE_OUTCOME: Record<string, string> = {
  forbidden: "Only pharmacists and engineers can resolve flags.",
  captcha: "The verification check failed. Please try again.",
  invalid: "That flag is no longer open.",
  failed: "The flag could not be resolved. Please try again.",
};

const pageNo = (v: string) => (/^\d{1,5}$/.test(v) && Number(v) <= 10000 ? Number(v) : 0);

/** §5.16: problem reports and partner access requests, 50 per section, Resolve through one form and one bot check. */
export default async function FlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered these
  const sp = await searchParams;
  const paging: FlagPaging = { rp: pageNo(firstParam(sp.rp)), pp: pageNo(firstParam(sp.pp)) };
  const t = DESK_NEW.reviewLists;
  const code = firstParam(sp.resolve);
  const outcome = code === "resolved" ? (firstParam(sp.kind) === "partner" ? t.requestResolved : t.reportResolved) : RESOLVE_OUTCOME[code];
  const [reports, partner, batches] = await Promise.all([
    listFlagPage("reports", paging.rp).catch(() => null), listFlagPage("partner", paging.pp).catch(() => null),
    listReviewBatches().catch(() => []),
  ]);
  const store = await cookies();
  const siteKey = turnstileSiteKey();
  const any = (reports?.items.length ?? 0) + (partner?.items.length ?? 0) > 0;
  return (
    <div className={styles.shell}>
      <ReviewToolbar session={session} theme={parseTheme(store.get(THEME_COOKIE)?.value)} batchId={newestInReview(batches)}
        keys={parseKeys(store.get(KEYS_COOKIE)?.value)} />
      <main id="content" className={styles.page}>
        <h1>{t.flagsLink}</h1>
        {outcome && <Announce text={outcome} className="outcome" />}
        {reports === null || partner === null ? (
          <Banner tone="crit" role="alert" title={t.loadErrorTitle} body={t.loadErrorBody}
            action={<a className={buttonClass("tonal", "sm")} href={flagsHref(paging)}>{t.tryAgain}</a>} />
        ) : (
          <>
            <FlagSection kind="reports" page={reports} paging={paging} />
            <FlagSection kind="partner" page={partner} paging={paging} />
            {any && (
              <form id="resolve-form" action={resolveFlagAction}>
                <input type="hidden" name="kind" id="resolve-kind" value="reports" />
                {siteKey && <TurnstileField siteKey={siteKey} action="resolve" nonce={await cspNonce()} />}
                <noscript><p>{t.noScriptResolve}</p></noscript>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
```

In `web/app/review/error.tsx`, replace the `return (…)` with (on `/review` itself there is no batch id to name):

```tsx
  return (
    <main id="content" className={styles.page}>
      <Banner tone="crit" role="alert" title={id && id !== "flags" ? fill(t.errorTitle, { id }) : t.errorBody}
        body={id && id !== "flags" ? t.errorBody : undefined}
        action={<Button variant="tonal" size="sm" onClick={reset}>{DESK_NEW.reviewLists.tryAgain}</Button>} />
    </main>
  );
```

(`outcome` is a plain, unstyled class name that the page test pins.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/review-home.test.tsx tests/review-flags-page.test.tsx tests/review-actions.test.ts tests/client-islands.test.ts tests/inline-styles.test.ts && npm run lint:css`
Expected: PASS. `ResolveButton.tsx` and `Announce.tsx` sit under `components/review/desk/`, the allowlisted directory; neither imports a server-only module.

- [ ] **Step 7: Commit**

```bash
git add web/app/review/page.tsx web/app/review/flags/page.tsx web/app/review/error.tsx web/app/review/review.module.css \
  web/components/review/BatchList.tsx web/components/review/FlagSection.tsx web/components/review/desk/ResolveButton.tsx \
  web/components/review/desk/Announce.tsx web/lib/review-copy.ts web/lib/actions-core.ts web/lib/review-actions.ts \
  web/tests/review-home.test.tsx web/tests/review-flags-page.test.tsx web/tests/review-actions.test.ts
git commit -m "feat(web): /review batch list and /review/flags with paging, one bot check and named outcomes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 20: Web — retire `/batches` and `/flags`, the reviewer items in the site header, sign-out clears drafts, and the surface guards (§2.3, §5.10, §6.2)

The middleware has answered `/batches*` and `/flags` with 308 since Task 14, so the old pages are unreachable. This task deletes them and everything only they used, points the site header at the review surface, and pins the rules that keep it that way.

**Files:**
- Delete: `web/app/batches/page.tsx`, `web/app/batches/[id]/page.tsx`, `web/app/flags/page.tsx`, `web/tests/batch-page.test.tsx`, `web/tests/batches-page.test.tsx` (if P0 created it), `web/tests/flags-page.test.tsx`
- Modify: `web/lib/review-actions.ts` (remove `reviewAction`; P1A's `logged` helper stays for `flagAction` and `resolveFlagAction`), `web/lib/actions-core.ts` (remove `submitReview`, `batchPath`, `ReviewCode`, P0 Task 11's `UUID_RE`, `DECISION_ID_RE`, `REVIEW_REFUSALS` and `conflictCode`, and P1A Task 18's `denyDecision` helper with its `DeniedOutcome` type and `recordAudit` import), `web/lib/api.ts` (remove `listFlags`, `type Flag` and the batch-page reads), `web/components/Header.tsx`, `web/components/AccountMenu.tsx`, `web/app/layout.tsx`, `web/tests/header.test.tsx`, `web/tests/review-actions.test.ts`, `web/tests/api.test.ts` (the `getBatch` cases and import), `web/tests/api-scope.test.ts` (P0's cases for the deleted reads), `web/tests/copy.test.ts` (Task 9's two temporary `LEGACY_EXEMPT` entries)
- Create: `web/tests/review-guards.test.ts`, `web/tests/account-menu-drafts.test.tsx`

**Interfaces:**
- Consumes: `listReviewBatches` (Task 7); `newestInReview` (Task 14); `DESK`, `DESK_NEW` (Task 9); `clearAllDrafts`, `draftKey`, `saveDraft` (Task 17a); `isReviewer`, `ROLE_LABEL` (existing).
- Produces: `Header({ session, theme, batchId?: string | null })` (reviewers: role badge plus "Batch {id}", "Review desk" and "Problem reports and partner requests" in the account menu; no `/batches` or `/flags` links anywhere); the root layout passes the newest in-review batch to it for reviewers. `AccountMenu` clears note drafts when its sign-out form submits. Guards in `review-guards.test.ts`: no `next/link` under `app/review` or `components/review`; no `/batches` or `/flags` path in app code except the redirect rules.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/review-guards.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
function* files(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}
const read = (f: string) => readFileSync(join(WEB, f), "utf8");
const source = () => [...files(join(WEB, "app")), ...files(join(WEB, "components")), ...files(join(WEB, "lib"))];

describe("review surface guards (§2.3, Task 14)", () => {
  it("app/review and components/review never import next/link: crossing the surface is a document navigation", () => {
    const offenders = [...files(join(WEB, "app/review")), ...files(join(WEB, "components/review"))]
      .filter((f) => /from\s+["']next\/link["']/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the legacy pages are gone", () => {
    expect(existsSync(join(WEB, "app/batches"))).toBe(false);
    expect(existsSync(join(WEB, "app/flags"))).toBe(false);
  });

  it("no app code links to /batches or /flags; only the redirect rules name them", () => {
    // lib/copy.ts holds P1A's §1.7 row label "Phase-0 `/batches` gate for non-reviewers" verbatim (pinned by copy.test):
    // a copy key, never a link or a redirect.
    // lib/request-log.ts: P1A's route templates for the legacy paths, which the middleware's 308 log lines still use
    // (STATIC_ROUTES "/batches", "/flags"; DYNAMIC_ROUTES "/batches/[id]", pinned by Task 14's middleware-review.test.ts).
    const allowed = new Set(["lib/surface.ts", "lib/copy.ts", "lib/request-log.ts"]);
    const offenders = source().filter((f) => !allowed.has(f) && /["'`]\/(batches|flags)\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no review page or desk file reads the public batch endpoints", () => {
    const offenders = source().filter((f) => /\b(getBatchReport|listBatches|getBatch|listFlags)\s*\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the legacy decision path is gone with its audit helper; the desk's decide is the only decision writer", () => {
    const offenders = source().filter((f) => /\b(submitReview|reviewAction|denyDecision|DeniedOutcome)\b/.test(read(f)));
    expect(offenders).toEqual([]);
    expect(read("lib/review-actions.ts")).toContain('logged("action:resolve", () => submitResolve(formData))');
  });
});
```

Create `web/tests/account-menu-drafts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccountMenu from "@/components/AccountMenu";
import { draftKey, saveDraft } from "@/components/review/desk/drafts";

afterEach(() => { cleanup(); sessionStorage.clear(); });

describe("sign-out clears note drafts (§5.10)", () => {
  it("submitting the menu's sign-out form removes every draft and nothing else", () => {
    saveDraft("0001-pilot", "186-0030-006--napa", "Strength reads 500 mg on the box");
    sessionStorage.setItem("other-key", "kept");
    const { container } = render(
      <AccountMenu><summary>Menu</summary><form method="post" action="/signout" onSubmit={(e) => e.preventDefault()}>
        <button type="submit">Sign out</button></form></AccountMenu>);
    fireEvent.submit(container.querySelector("form")!);
    expect(sessionStorage.getItem(draftKey("0001-pilot", "186-0030-006--napa"))).toBeNull();
    expect(sessionStorage.getItem("other-key")).toBe("kept");
  });

  it("another form in the menu (the theme switch) keeps the drafts", () => {
    saveDraft("0001-pilot", "x", "draft");
    const { container } = render(
      <AccountMenu><summary>Menu</summary><form action="/theme" onSubmit={(e) => e.preventDefault()}><button type="submit">Dark</button></form></AccountMenu>);
    fireEvent.submit(container.querySelector("form")!);
    expect(sessionStorage.getItem(draftKey("0001-pilot", "x"))).toBe("draft");
  });
});
```

In `web/tests/header.test.tsx`:
- in "signed in: a <details> account menu …", replace `for (const href of ["/batches", "/flags"]) expect(html).toContain(\`href="${href}"\`);` with:

```tsx
    expect(html).not.toMatch(/href="\/(batches|flags)"/);
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(html).toContain('<a href="/review/flags">Problem reports and partner requests</a>');
```

- in "a reader gets no role badge and no reviewer links …", replace the two lines `expect(html).not.toContain("/batches");` and `expect(html).not.toContain("/flags");` with `expect(html).not.toContain('href="/review');`.
- append inside `describe("Header", …)`:

```tsx
  it("a reviewer's menu names the newest batch in review next to the role badge", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="system" batchId="0001-pilot" />);
    expect(html).toContain('<span class="role-badge">Pharmacist</span> Batch <span class="mono">0001-pilot</span>');
    expect(renderToStaticMarkup(<Header session={PHARMACIST} theme="system" batchId={null} />)).not.toContain("Batch <span");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/review-guards.test.ts tests/account-menu-drafts.test.tsx tests/header.test.tsx`
Expected: FAIL — `app/batches` and `app/flags` exist; `Header.tsx` links to `/batches` and `/flags`; `lib/actions-core.ts` still holds `submitReview` and `denyDecision`; the sign-out submit leaves the draft.

- [ ] **Step 3: Delete the legacy pages and what only they used**

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2/web
git rm -r app/batches app/flags tests/batch-page.test.tsx tests/flags-page.test.tsx
git rm --ignore-unmatch tests/batches-page.test.tsx
```

In `web/lib/review-actions.ts`: delete `reviewAction` (with it goes its `logged("action:review", () => submitReview(formData))` call), change the import to `import { flagReturnPath, submitFlag, submitResolve } from "./actions-core";`, and in the header comment replace "batch, product, substance, check and /flags pages" with "product, substance and check pages and /review/flags" and "Only these three functions" with "Only these two functions". Keep P1A Task 25's module-private `logged` helper and its `requestId` / `logRequest` imports: `flagAction` and `resolveFlagAction` still call `logged("action:flag", …)` and `logged("action:resolve", …)`.

In `web/lib/actions-core.ts`: delete `submitReview`, `batchPath`, the `ReviewCode` type, and P0 Task 11's helpers that only `submitReview` used: `const UUID_RE`, `const DECISION_ID_RE`, `const REVIEW_REFUSALS` (with Task 9's `import { DESK_NEW } from "./copy";`, unless `grep -n "DESK_NEW" web/lib/actions-core.ts` still prints a line outside the deleted code) and `function conflictCode(field, message): ReviewCode` (the desk's versions live in `lib/desk-core.ts`, Task 12). Leaving any of them makes the build's type check stop with TS2304 "Cannot find name 'ReviewCode'". Delete P1A Task 18's `type DeniedOutcome` and `async function denyDecision(…)` (its only caller was `submitReview`; the desk writes `decision_denied` from `lib/desk-core.ts`, Task 12) and the `import { recordAudit } from "./audit";` line, unless `grep -n "recordAudit" web/lib/actions-core.ts` still prints a call outside the deleted code; remove `postDecision` from the `./api` import (the desk's decisions go through `lib/desk-core.ts`, Task 12). Then both of these must print nothing:

```bash
grep -n "denyDecision\|DeniedOutcome\|submitReview\|REVIEW_REFUSALS\|ReviewCode\|conflictCode\|DECISION_ID_RE" web/lib/actions-core.ts
grep -rn "denyDecision\|DeniedOutcome\|submitReview" web/lib web/app web/components
``` In `submitFlag` change `revalidatePath("/flags")` to `revalidatePath("/review/flags")` (a new report shows up in the reviewers' list). If `tests/review-actions.test.ts` asserts `revalidatePath` was called with `"/flags"` for `submitFlag`, change that expectation to `"/review/flags"`.

In `web/lib/api.ts`: delete `listFlags`, `type Flag`, `listBatches`, `getBatchReport` and `getBatch` with the types only they use (`Batch`, `BatchItem`, `BatchReport`, `StageCounts`, `StageResult`; `BatchItem` holds `stages: StageResult[]`, so it goes with them). Keep `getDecisions` and `postDecision` only if `grep -rn "getDecisions\|postDecision(" web/app web/components web/lib | grep -v "lib/api.ts"` prints a line; otherwise delete them and `type PublicDecision` too. Then `grep -rn "BatchItem\|StageResult\|BatchReport\|StageCounts" web/app web/components web/lib web/tests` must print nothing (the desk uses `review-types.ts`).

In `web/tests/review-actions.test.ts`: delete the `describe` block for `submitReview` (every case that calls `submitReview` or `reviewAction`, including P1A's "over 60 decisions a minute" case: the desk's limit is pinned in Task 12's `desk-actions.test.ts`), P1A Task 18's whole `describe("decision_denied audit (§5.15, §9.3)", …)` block (the desk's `decision_denied` cases live in `desk-actions.test.ts`), the `recordAudit` mock and its `beforeEach` lines if nothing else in the file uses them, the `review` helper and the `reviewAction` import. In P1A Task 25's case "logs action:review, action:flag and action:resolve …" (in `describe("server action log line (§5.15, §9.7)", …)`), rename it "logs action:flag and action:resolve with their status, never a message or an email", delete its `await reviewAction(…)` line, and change the expected list to `[["action:flag", "POST", "number", "number"], ["action:resolve", "POST", "number", "number"]]`. In `web/tests/api.test.ts`: delete the `getBatch` cases (and any case for another function removed above) and remove `getBatch` from its import line, which becomes `import { checkInteractions, getProduct, getSubstance, searchProducts } from "../lib/api";` (drop any other removed name from it the same way). `web/tsconfig.json` includes `**/*.ts`, so `next build` type-checks `tests/` and a leftover import fails it with TS2305 "Module has no exported member 'getBatch'".

In `web/tests/copy.test.ts`: remove the two entries Task 9 added for the deleted pages, so the list reads

```ts
const LEGACY_EXEMPT = ["app/check/page.tsx", "app/page.tsx"];
```

and drop the sentence about Task 20 from its comment (P2 still rewrites `app/check/page.tsx` and `app/page.tsx` and empties the list).

In `web/tests/api-scope.test.ts` (P0's version, which imports `getBatch`, `getBatchReport`, `getDecisions`, `listBatches`, `listFlags` and `postDecision`): remove every name deleted from `lib/api.ts` above from its import; delete the whole `describe("batch reads (reviewers only, A1 and A2)", …)` block; delete the case "listFlags reads open flags with the token and drops emails" and every case whose body calls a deleted function (the `postDecision` POST and failure cases when `postDecision` is gone); and in "writes refuse to run without a configured internal token (no API call)" delete the lines that call `postDecision` or `listFlags`, keeping the `createFlag` and `resolveFlag` lines and the final `expect(f).not.toHaveBeenCalled()`. Then `npx vitest run tests/api-scope.test.ts tests/api.test.ts tests/copy.test.ts` passes.

Type-check the whole project (app, lib, components and tests) after all of the edits above:

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2/web && npx tsc --noEmit -p .
```

Expected: no output, exit 0 (no TS2304 for `ReviewCode`, no TS2305 for a deleted export).

If `grep -rln "legacy.module.css" web/app web/components` prints nothing, `git rm web/app/legacy.module.css`; otherwise delete from it the classes no remaining file uses (`grep -o "styles\.[a-zA-Z]*"` over the files that import it lists the ones still used).

- [ ] **Step 4: Point the header at the review surface and clear drafts on sign-out**

In `web/components/Header.tsx`:
- add `import { DESK_NEW } from "@/lib/copy";` and `import { DESK } from "@/lib/review-copy";`;
- change the signature to `export default function Header({ session, theme, batchId = null }: { session: Session | null; theme: Theme; batchId?: string | null })`;
- delete the two nav lines `{reviewer && <a href="/batches">Batches</a>}` and `{reviewer && <a href="/flags">Flags</a>}`;
- replace `{reviewer && <span className="role-badge">{ROLE_LABEL[session.role]}</span>}` with:

```tsx
              {reviewer && (
                <p><span className="role-badge">{ROLE_LABEL[session.role]}</span>
                  {batchId && <> {DESK.batchPrefix} <span className="mono">{batchId}</span></>}</p>
              )}
              {reviewer && <a href="/review">{DESK.reviewDesk}</a>}
              {reviewer && <a href="/review/flags">{DESK_NEW.reviewLists.flagsLink}</a>}
```

In `web/app/layout.tsx` (Task 14's version): add

```tsx
import { newestInReview } from "@/components/review/ReviewAccount";
import { listReviewBatches } from "@/lib/api";
import { isReviewer } from "@/lib/reviewers";
```

after `const session = review ? null : await getSession();` add

```tsx
  // The account menu names the newest batch in review (§6.2); a failed read only leaves the name out.
  const batchId = isReviewer(session) ? newestInReview(await listReviewBatches().catch(() => [])) : null;
```

and render `<Header session={session} theme={theme} batchId={batchId} />`.

In `web/components/AccountMenu.tsx`, add `import { clearAllDrafts } from "@/components/review/desk/drafts";` and, inside the effect after the `onPress` handler, register a submit listener on the `<details>` element:

```tsx
    // Sign-out removes every note draft (§5.10); POST /signout's Clear-Site-Data covers the no-JavaScript case.
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (new URL(form.action, window.location.href).pathname === "/signout") clearAllDrafts();
    };
    el.addEventListener("submit", onSubmit);
```

and add `el.removeEventListener("submit", onSubmit);` to the cleanup function.

- [ ] **Step 5: Run the tests, the whole suite and the build**

Run: `cd web && npx vitest run tests/review-guards.test.ts tests/account-menu-drafts.test.tsx tests/header.test.tsx tests/review-actions.test.ts tests/api.test.ts tests/api-scope.test.ts tests/copy.test.ts tests/client-islands.test.ts tests/marks.test.ts tests/inline-styles.test.ts && npx tsc --noEmit -p . && npm test && npm run build`
Expected: PASS; the build's island check lists `components/AccountMenu.tsx` (already allowlisted by P1A) importing `components/review/desk/drafts.ts`, which imports nothing server-only.

- [ ] **Step 6: Commit**

```bash
git add -A web/app web/components/Header.tsx web/components/AccountMenu.tsx web/lib/review-actions.ts web/lib/actions-core.ts \
  web/lib/api.ts web/tests
git commit -m "refactor(web): retire /batches and /flags, reviewer items in the header, sign-out clears note drafts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 21: End-to-end — the pilot seed from Board R, the Turnstile fake, and the review specs (§11.2, §11.4)

The e2e stack (P1A Task 24) runs every `web/e2e/seed/*.sql` after Flyway. This task generates `10-pilot.sql` from Board R's embedded pilot export (with the post-fix DDInter notes of §1.6 item 7) and seeds the same ten records into eight in-review batches, one per group of specs, so no spec depends on another's decisions: `0001-pilot` (read-only checks, Lighthouse), `e2e-desk` (decisions), `e2e-stale` (re-runs, other reviewers, the refresh race), `e2e-fail` (failures, the confirm step), `e2e-complete` (the complete view) and `e2e-a11y-light`, `e2e-a11y-dark`, `e2e-a11y-forced` (every §11.4 desk state under axe, once per look). The snapshot payloads follow P0's v1 shape (`build_payload`), the one `SnapshotDiff` (Task 3) reads, and the seeded full runs have empty `concept_ids`, as the ETL writes them. Playwright runs one worker, files in name order (P1A), so the last review file may park batches for its one test. `ops.item_snapshot` and `ops.audit_event` are append-only, so specs never reset rows; each record is decided at most once per batch across the suite.

**Files:**
- Create: `web/e2e/seed/build-pilot-seed.mjs`, `web/e2e/seed/build-pilot-seed.d.mts`, `web/e2e/seed/10-pilot.sql` (generated, committed), `web/e2e/db.ts`, `web/e2e/turnstile-fake.ts`, `web/e2e/review-helpers.ts`, `web/e2e/review-access.spec.ts`, `web/e2e/review-a11y.spec.ts`, `web/e2e/review-desk.spec.ts`, `web/e2e/review-failures.spec.ts`, `web/e2e/review-lists.spec.ts`, `web/e2e/review-perf.spec.ts`, `web/e2e/review-stale.spec.ts`, `web/e2e/zy-review-single-batch.spec.ts`, `web/e2e/lhci-session.cjs`, `web/lighthouserc.review.json`
- Modify: `.github/workflows/ci.yml` (the `e2e` job runs the review Lighthouse config after P1A's), `web/package.json` and `web/package-lock.json` (`puppeteer`, which LHCI's `puppeteerScript` requires), `web/Dockerfile` (skip puppeteer's browser download in the image build), `.gitignore` (root, next to P1A's `web/.lighthouseci/`)
- Test: `web/tests/pilot-seed.test.ts`, `web/tests/lhci-session.test.ts`

**Interfaces:**
- Consumes: `signInAs(context, role, name?)`, `BASE_URL`, `E2E_SECRET` (P1A `web/e2e/session.ts`); `decryptSession` (P1A `lib/session-crypto`); the compose `seed` service (the CI override names the project `bddrug-ci`, so these commands never touch a local `bddrug` stack), `web/playwright.config.ts` (`workers: 1`, files in name order) and the CI `e2e` job (P1A Task 24); the DOM contract of Tasks 17a–17c (`#desk`, `#record`, `#decision-bar`, `#drawer`, `#note`, `[data-fk="approve"]`, `[data-fk="report"]`, `[data-fk="undo"]`, `[data-fk="drawer-close"]`, `[data-fk="ev"]`, `[data-fk="f-…"]`, `[data-desk="search"]`, `[data-desk-open="sheet"]`, `.toast`, `.decision-hint`, `[data-desk="live"]`); copy from Task 9.
- Produces: `buildPilotSeed(html: string): string`, `pilotPayloads(html: string): Record<string, object>` and `E2E_BATCHES` from `web/e2e/seed/build-pilot-seed.mjs` (`node e2e/seed/build-pilot-seed.mjs` rewrites `10-pilot.sql`); `sql(statement)`, `decisions(batchId, conceptId)`, `restamp(batchId, conceptId)`, `otherReviewerApproves(batchId, conceptId)`, `approveAllExcept(batchId, conceptId)`, `insertFlag(targetType, targetId, message)`, `flagStatus(id)`, `auditCount(event, targetId)` from `web/e2e/db.ts`; `installTurnstileFake(page, mode: "pass" | "error" | "error-once")`; `PILOT_IDS`, `STALE`, `openRecord(page, batchId, conceptId, query?)`, `deskReady(page)`, `versionOf(page, batchId, conceptId)`, `interceptActions(page, batchId, mode)`, `replaceNextActionResult(page, batchId, result)`, `blockIslands(page)` from `web/e2e/review-helpers.ts`; `mintSession(claims, secret?)` and the LHCI `puppeteerScript` from `web/e2e/lhci-session.cjs`. P2's public e2e reads `0001-pilot` and must not decide records in it.

- [ ] **Step 1: Write the failing seed test**

Create `web/tests/pilot-seed.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { E2E_BATCHES, buildPilotSeed, pilotPayloads } from "../e2e/seed/build-pilot-seed.mjs";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const BOARD_R = readFileSync(at("../../docs/artifacts/2026-10-12-intellidrugs-reviewer.html"), "utf8");

describe("the e2e pilot seed (§11.4)", () => {
  const sql: string = buildPilotSeed(BOARD_R);

  it("the committed 10-pilot.sql is the generator's output (run `node e2e/seed/build-pilot-seed.mjs` after Board R changes)", () => {
    expect(readFileSync(at("../e2e/seed/10-pilot.sql"), "utf8")).toBe(sql);
  });

  it("seeds the ten pilot records into each e2e batch, the pilot batch newest", () => {
    expect(E2E_BATCHES).toEqual(["0001-pilot", "e2e-desk", "e2e-stale", "e2e-fail", "e2e-complete",
      "e2e-a11y-light", "e2e-a11y-dark", "e2e-a11y-forced"]);
    for (const b of E2E_BATCHES) expect(sql).toContain(`('${b}','in_review',10,`);
    expect(sql.match(/'DGDA-Drugs','186-0030-006--napa','pending'/g)).toHaveLength(8);
  });

  it("a seeded full run lists no concept ids, as the ETL writes a full run (the API's fullRuns() reads it so)", () => {
    expect(sql).toMatch(/INSERT INTO ops\.batch_run \(batch_id, run_at, stages, counts, concept_ids\) VALUES \('0001-pilot','[^']+','\{dgda,substances,clinical,ddinter\}','\{\}','\{\}'\);/);
  });

  it("snapshots use P0's v1 payload (etl build_payload), the shape SnapshotDiff reads", () => {
    const p = pilotPayloads(BOARD_R)["127-0163-052--chloramphenicol"] as {
      version: number; ingredients: { strength: Record<string, unknown>; codes: Record<string, unknown>[]; ddinter_chosen: string[]; route_assumed: boolean }[];
    };
    expect(Object.keys(p).sort()).toEqual(["brand", "clinical_drug", "extracted_at", "ingredients", "stages", "version"]);
    expect(p.version).toBe(1);
    const ing = p.ingredients[0];
    expect(Object.keys(ing).sort()).toEqual(["bds_id", "codes", "ddinter_chosen", "name", "route_assumed", "strength", "substance", "xm_code"]);
    expect(Object.keys(ing.strength).sort()).toEqual(["per_unit", "per_value", "raw", "unit", "value"]);
    expect(typeof ing.strength.value).toBe("string");                 // plain-number text, as _num() writes it
    expect(Object.keys(ing.codes[0]).sort()).toEqual(["code", "route_scope", "system"]);
    expect(ing.ddinter_chosen).toEqual(["DDInter352"]);               // the eye drop's ophthalmic entry (§1.5)
    expect(ing.route_assumed).toBe(false);
  });

  it("uses the post-fix DDInter notes: no DDInter351 pair, the eye drop's DDInter stage OK, 28 batch pairs", () => {
    expect(sql).not.toMatch(/text not found for [^;']*DDInter351/);
    expect(sql).toContain("('0001-pilot','127-0163-052--chloramphenicol','ddinter','ok','','{\"route\":\"ophthalmic\",\"text_missing\":[]}')");
    expect(sql.match(/^ \('DDInter\d+','DDInter\d+','(major|moderate|minor|unknown)'/gm)).toHaveLength(28);
  });

  it("is safe SQL: every quote in Board R's text is doubled, so each line holds an even number of quotes", () => {
    expect(sql).toContain("''");
    for (const line of sql.split("\n")) expect((line.match(/'/g) ?? []).length % 2, line).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/pilot-seed.test.ts`
Expected: FAIL with `Failed to resolve import "../e2e/seed/build-pilot-seed.mjs"`.

- [ ] **Step 3: Write the generator and generate the seed**

Create `web/e2e/seed/build-pilot-seed.mjs`:

```js
// Generates 10-pilot.sql from Board R's embedded pilot export (spec §11.4). Deterministic: same input, same bytes.
// Usage (from web/): node e2e/seed/build-pilot-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const E2E_BATCHES = ["0001-pilot", "e2e-desk", "e2e-stale", "e2e-fail", "e2e-complete",
  "e2e-a11y-light", "e2e-a11y-dark", "e2e-a11y-forced"];
const STAGES = ["dgda", "substances", "clinical", "ddinter"];
const DROPPED = "DDInter351";   // §1.6 item 7: the systemic chloramphenicol entry never pairs with the eye drop

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? "NULL" : String(v));
const arr = (xs) => `'{${xs.map((x) => `"${String(x).replace(/["\\]/g, "")}"`).join(",")}}'`;
const json = (o) => q(JSON.stringify(o));
const sourceOf = (method) => (method === "xm" ? "dgda-ocl" : method === "drugbank" || method === "name" ? "ddinter2" : "rxnav");
const nameSource = { icd11: "dgda-ocl", dgda_content: "dgda-ocl", rxnorm: "rxnav", ddinter: "ddinter2" };

function extract(html) {
  const m = /var DATA=(\{.*?\});\n/s.exec(html);
  if (!m) throw new Error("Board R: DATA not found");
  return JSON.parse(m[1]);
}

/** Post-fix DDInter stage: drop every "text not found" pair with DDInter351; a stage left with no note is OK. */
function ddinterStage(item) {
  const st = item.stages.ddinter;
  const parts = st.note ? st.note.split("; ").filter((p) => !p.includes(DROPPED)) : [];
  const textMissing = parts.map((p) => /DDInter text not found for (DDInter\d+)\/(DDInter\d+)/.exec(p)).filter(Boolean).map((m) => [m[1], m[2]]);
  const evidence = item.clinical.route !== "systemic" ? { route: item.clinical.route, text_missing: textMissing } : { text_missing: textMissing };
  return { status: parts.length === 0 && st.status === "warn" && st.note.includes("text not found") ? "ok" : st.status,
    note: parts.join("; "), evidence };
}

const GENERAL_SCOPES = ["systemic", "any"];
const idNum = (id) => Number(String(id).replace(/\D/g, "")) || 0;
const plain = (v) => (v === null || v === undefined ? null : String(v));   // P0's _num(): numbers as plain text
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

/** P0's RouteRule twin (etl choose()): the entries for the product's route, else systemic or any (assumed), else none. */
function choose(ddCodes, route) {
  const byId = (a, b) => idNum(a.code) - idNum(b.code);
  if (route) {
    const exact = ddCodes.filter((c) => c.route === route).sort(byId);
    if (exact.length) return { chosen: exact.map((c) => c.code), assumed: false };
  }
  const general = ddCodes.filter((c) => GENERAL_SCOPES.includes(c.route)).sort(byId);
  return { chosen: general.map((c) => c.code), assumed: general.length > 0 };
}

/** P0's v1 snapshot payload (etl build_payload): one ingredient per DGDA XM row, ordered by XM code. */
function snapshot(item, stage) {
  const b = item.brand, c = item.clinical;
  const byXm = new Map(item.ingredients.flatMap((i) => i.codes.filter((k) => k.system === "ICD11_XM").map((k) => [k.code, i])));
  return {
    version: 1, extracted_at: item.extractedAt,
    brand: { dar_number: b.dar_number, trade_name: b.trade_name, company: b.company, dosage_form: b.dosage_form, generic_content_raw: b.generic_content_raw },
    clinical_drug: { bdc_id: c.bdc_id, display_name: c.display_name, dose_form: c.dose_form, route: c.route },
    ingredients: [...item.dgdaIngredients].sort((x, y) => cmp(x.xm, y.xm)).map((d) => {
      const i = byXm.get(d.xm);
      if (!i) return { xm_code: d.xm, name: d.name, bds_id: null, substance: null, strength: null, codes: [], ddinter_chosen: [], route_assumed: false };
      const pick = choose(i.codes.filter((k) => k.system === "DDINTER"), c.route);
      return {
        xm_code: d.xm, name: d.name, bds_id: i.bds, substance: i.name,
        strength: { raw: i.raw, value: plain(i.strength), unit: i.unit ?? null, per_value: plain(i.per), per_unit: i.perUnit ?? null },
        codes: [...i.codes].sort((x, y) => cmp(x.system, y.system) || cmp(x.code, y.code))
          .map((k) => ({ system: k.system, code: k.code, route_scope: k.route })),
        ddinter_chosen: pick.chosen, route_assumed: pick.assumed && pick.chosen.length > 0,
      };
    }),
    stages: Object.fromEntries(STAGES.map((s) => [s, s === "ddinter" ? { status: stage.status, note: stage.note }
      : { status: item.stages[s].status, note: item.stages[s].note }])),
  };
}

/** The snapshot payload per concept id, for the seed test. */
export function pilotPayloads(html) {
  return Object.fromEntries(extract(html).items.map((it) => [it.conceptId, snapshot(it, ddinterStage(it))]));
}

export function buildPilotSeed(html) {
  const data = extract(html);
  const items = [...data.items].sort((a, b) => (a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0));
  const runAt = data.batches[0].run_at;
  const out = ["-- Generated by e2e/seed/build-pilot-seed.mjs from docs/artifacts/2026-10-12-intellidrugs-reviewer.html. Do not edit.", ""];

  const subs = new Map(), names = new Map(), codes = new Map(), cover = new Map(), drugs = new Map(), cds = new Map(), cdis = [];
  for (const it of items) {
    cds.set(it.clinical.bdc_id, it.clinical);
    for (const i of it.ingredients) {
      subs.set(i.bds, i.name);
      cover.set(i.bds, i.coverage);
      for (const nm of i.names) names.set(`${i.bds}|${nm.name}|${nm.type}`, [i.bds, nm.name, nm.type]);
      for (const c of i.codes) codes.set(`${i.bds}|${c.system}|${c.code}`, [i.bds, c]);
      const ddNames = i.names.filter((x) => x.type === "ddinter").map((x) => x.name);
      const drugbank = i.codes.find((c) => c.system === "DRUGBANK")?.code ?? null;
      for (const c of i.codes.filter((c) => c.system === "DDINTER")) {
        const routed = ddNames.find((x) => x.endsWith(`(${c.route})`));
        drugs.set(c.code, { name: c.route === "systemic" ? (ddNames.find((x) => !x.includes("(")) ?? i.name) : (routed ?? i.name), route: c.route, drugbank });
      }
      cdis.push([it.clinical.bdc_id, i]);
    }
  }

  out.push("INSERT INTO curated.substance (bds_id, preferred_name) VALUES");
  out.push([...subs].sort().map(([id, name]) => ` (${q(id)},${q(name)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES");
  out.push([...codes.values()].map(([id, c]) => ` (${q(id)},${q(c.system)},${q(c.code)},${q(c.route)},${q(sourceOf(c.method))},${q(c.method)},${n(c.conf)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES");
  out.push([...names.values()].map(([id, nm, t]) => ` (${q(id)},${q(nm)},${q(t)},${q(nameSource[t] ?? "dgda-ocl")})`).join(",\n") + ";");
  out.push("INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES");
  out.push([...cover].map(([id, c]) => ` (${q(id)},${q(c.coverage)},${q(c.note)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES");
  out.push([...cds].map(([id, c]) => ` (${q(id)},${q(c.signature)},${q(c.display_name)},${q(c.dose_form)},${q(c.route)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text) VALUES");
  out.push(cdis.map(([bdc, i]) => ` (${q(bdc)},${q(i.bds)},${n(i.strength)},${q(i.unit)},${n(i.per)},${q(i.perUnit)},${q(i.raw)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag, bdc_id, parse_status, parse_note) VALUES");
  out.push(items.map(({ brand: b }) => ` (${q(b.concept_id)},${q(b.dar_number)},${q(b.trade_name)},${q(b.company)},${q(b.dosage_form)},${q(b.generic_content_raw)},${q(b.quality_flag)},${q(b.bdc_id)},${q(b.parse_status)},${q(b.parse_note)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES");
  out.push(items.flatMap((it) => it.dgdaIngredients.map((d) => ` (${q(it.conceptId)},${q(d.xm)},${q(d.name)})`)).join(",\n") + ";");
  out.push("INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES");
  out.push(items.map(({ brand: b }) => ` ('DGDA-Drugs',${q(b.concept_id)},${json({ id: b.concept_id, concept_class: "Drug", display_name: b.trade_name,
    extras: { dar_number: b.dar_number, company: b.company, dosage_form: b.dosage_form, generic_content: b.generic_content_raw } })})`).join(",\n") + ";");

  const pairs = data.pilotPairs.filter((p) => p.ida !== DROPPED && p.idb !== DROPPED).map((p) => (p.ida < p.idb ? p
    : { ...p, ida: p.idb, idb: p.ida, a: p.b, b: p.a }));
  for (const p of pairs) for (const [id, nm] of [[p.ida, p.a], [p.idb, p.b]]) if (!drugs.has(id)) drugs.set(id, { name: nm, route: "systemic", drugbank: null });
  out.push("INSERT INTO curated.ddinter_drug (ddinter_id, name, drugbank_id, route_scope) VALUES");
  out.push([...drugs].sort().map(([id, d]) => ` (${q(id)},${q(d.name)},${q(d.drugbank)},${q(d.route)})`).join(",\n") + ";");
  const texted = pairs.filter((p) => p.interaction !== null || p.management !== null);
  out.push("INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management) VALUES");
  out.push(texted.map((p) => ` (${q(`pilot-${p.ida}-${p.idb}`)},${q(p.interaction)},${q(p.management)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) VALUES");
  out.push(pairs.map((p) => ` (${q(p.ida)},${q(p.idb)},${q(p.severity)},${arr(p.actions)},${q(p.a)},${q(p.b)},${texted.includes(p) ? q(`pilot-${p.ida}-${p.idb}`) : "NULL"})`).join(",\n") + ";");

  E2E_BATCHES.forEach((batch, k) => {
    // The pilot batch keeps Board R's run time and is the newest; each e2e batch ran one hour earlier than the one before it.
    const run = k === 0 ? runAt : new Date(Date.parse(runAt) - k * 3_600_000).toISOString();
    const runId = `00000000-0000-4000-8000-${String(k + 1).padStart(12, "0")}`;
    out.push("", `-- batch ${batch}`);
    out.push(`INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES (${q(batch)},'in_review',10,${q(run)});`);
    // A full run: concept_ids is empty (run_pipeline.py), which is how the API's fullRuns() finds it.
    out.push(`INSERT INTO ops.batch_run (batch_id, run_at, stages, counts, concept_ids) VALUES (${q(batch)},${q(run)},'{dgda,substances,clinical,ddinter}','{}','{}');`);
    out.push("INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES");
    out.push(items.map((it) => ` (${q(batch)},'DGDA-Drugs',${q(it.conceptId)},'pending',NULL,${q(it.extractedAt)})`).join(",\n") + ";");
    out.push("INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES");
    out.push(items.flatMap((it) => {
      const dd = ddinterStage(it);
      return STAGES.map((s) => s === "ddinter"
        ? ` (${q(batch)},${q(it.conceptId)},'ddinter',${q(dd.status)},${q(dd.note)},${json(dd.evidence)})`
        : ` (${q(batch)},${q(it.conceptId)},${q(s)},${q(it.stages[s].status)},${q(it.stages[s].note)},'{}')`);
    }).join(",\n") + ";");
    out.push("INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES");
    out.push(items.map((it) => ` (${q(batch)},${q(it.conceptId)},${q(it.extractedAt)},${q(runId)},'run',${json(snapshot(it, ddinterStage(it)))})`).join(",\n") + ";");
  });
  return out.join("\n") + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const board = fileURLToPath(new URL("../../../docs/artifacts/2026-10-12-intellidrugs-reviewer.html", import.meta.url));
  const target = fileURLToPath(new URL("./10-pilot.sql", import.meta.url));
  writeFileSync(target, buildPilotSeed(readFileSync(board, "utf8")));
  console.log(`wrote ${target}`);
}
```

Create `web/e2e/seed/build-pilot-seed.d.mts` (types for the test, which `next build` type-checks):

```ts
export declare const E2E_BATCHES: string[];
export declare function buildPilotSeed(html: string): string;
export declare function pilotPayloads(html: string): Record<string, object>;
```

Generate the file:

Run: `cd web && node e2e/seed/build-pilot-seed.mjs`
Expected: `wrote …/web/e2e/seed/10-pilot.sql`.

The "28 batch pairs" assertion counts lines that start ` ('DDInter…','DDInter…','<severity>'`, which only the `ddinter_pair` rows do. Every value goes through `q()`, `arr()` or `json()`, so no text from Board R is ever spliced in unquoted.

- [ ] **Step 4: Run the seed test to verify it passes**

Run: `cd web && npx vitest run tests/pilot-seed.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the e2e helpers and the Turnstile fake**

Create `web/e2e/db.ts`:

```ts
import { execFileSync } from "node:child_process";

/* Direct database access for e2e setup and checks, through the compose `db` service (CI and local runs both start it). */
const COMPOSE = ["compose", "-f", "../deploy/docker-compose.yml", "-f", "../deploy/docker-compose.ci.yml"];
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function sql(statement: string): string {
  return execFileSync("docker", [...COMPOSE, "exec", "-T", "db", "psql", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", process.env.DB_USER ?? "bddrug", "-d", "bddrug", "-At", "-c", statement], { encoding: "utf8" }).trim();
}

const item = (b: string, c: string) => `batch_id = ${lit(b)} AND concept_id = ${lit(c)}`;

export const decisions = (b: string, c: string): number =>
  Number(sql(`SELECT count(*) FROM ops.review_decision WHERE ${item(b, c)}`));

export const lastDecision = (b: string, c: string): string =>
  sql(`SELECT decision || '|' || reviewer_role || '|' || note FROM ops.review_decision WHERE ${item(b, c)} ORDER BY id DESC LIMIT 1`);

/** The pipeline re-runs one record: a new stamp and a `rerun` snapshot (append-only, so this is an insert). */
export function restamp(b: string, c: string): void {
  sql(`UPDATE ops.batch_item SET extracted_at = now() WHERE ${item(b, c)};
       INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
       SELECT bi.batch_id, bi.concept_id, bi.extracted_at, gen_random_uuid(), 'rerun',
              (SELECT s.payload FROM ops.item_snapshot s WHERE s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id
               ORDER BY s.extracted_at DESC LIMIT 1) || jsonb_build_object('extracted_at', bi.extracted_at)
       FROM ops.batch_item bi WHERE bi.batch_id = ${lit(b)} AND bi.concept_id = ${lit(c)};`);
}

export function otherReviewerApproves(b: string, c: string): void {
  sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
       VALUES (${lit(b)}, ${lit(c)}, 'ok', '', 'other.pharmacist@e2e.test', 'pharmacist');
       UPDATE ops.batch_item SET review = 'ok' WHERE ${item(b, c)};`);
}

export function approveAllExcept(b: string, keep: string): void {
  sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
       SELECT batch_id, concept_id, 'ok', '', 'other.pharmacist@e2e.test', 'pharmacist' FROM ops.batch_item
       WHERE batch_id = ${lit(b)} AND concept_id <> ${lit(keep)};
       UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = ${lit(b)} AND concept_id <> ${lit(keep)};`);
}

export const insertFlag = (targetType: string, targetId: string, message: string): number =>
  Number(sql(`INSERT INTO ops.flag (target_type, target_id, message, reporter_email)
              VALUES (${lit(targetType)}, ${lit(targetId)}, ${lit(message)}, 'reader@e2e.test') RETURNING id`));

export const flagStatus = (id: number): string => sql(`SELECT status FROM ops.flag WHERE id = ${Number(id)}`);

export const auditCount = (event: string, targetId: string): number =>
  Number(sql(`SELECT count(*) FROM ops.audit_event WHERE event = ${lit(event)} AND target_id = ${lit(targetId)}`));
```

Create `web/e2e/turnstile-fake.ts`:

```ts
import type { Page } from "@playwright/test";

/**
 * Serves a stand-in for Cloudflare's api.js. "pass" hands every widget the documented dummy token, which the
 * test secret accepts; "error" calls the widget's error callback, as a blocked or failed challenge does.
 */
export async function installTurnstileFake(page: Page, mode: "pass" | "error" | "error-once"): Promise<void> {
  // "error-once": the first challenge fails, every later one (after reset, as Retry check does) passes.
  const body = `(() => {
    const widgets = new Map(); let n = 0, fired = 0;
    const MODE = ${JSON.stringify(mode)};
    function fire(id) {
      const o = widgets.get(id); if (!o) return;
      const fail = MODE === "error" || (MODE === "error-once" && fired++ === 0);
      setTimeout(() => { if (fail) { o["error-callback"] && o["error-callback"]("110200"); } else { o.callback && o.callback("XXXX.DUMMY.TOKEN.XXXX"); } }, 50);
    }
    window.turnstile = {
      render(el, o) { const id = "fake-" + (++n); widgets.set(id, o); fire(id); return id; },
      reset(id) { fire(id ?? [...widgets.keys()].pop()); },
      remove(id) { widgets.delete(id); },
      getResponse() { return MODE === "error" ? undefined : "XXXX.DUMMY.TOKEN.XXXX"; },
      isExpired() { return false; },
      ready(cb) { cb(); },
    };
  })();`;
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body }));
}
```

Create `web/e2e/review-helpers.ts`:

```ts
import { expect, type Page, type Route } from "@playwright/test";

/** The ten pilot records in concept order (COLLATE "C"). */
export const PILOT_IDS = {
  amlodipine: "071-0098-022--amlodipine-5", aspirin: "076-0028-006--aspirin", simvastatin: "096-0265-061--simvastatin",
  chloramphenicol: "127-0163-052--chloramphenicol", domperidone: "127-0263-018--domperidone", warfarin: "185-0138-012--g-warfarin",
  metformin: "185-0241-015--g-metformin", napa: "186-0030-006--napa", clarith: "239-0407-023--clarith",
  amoxiclav: "420-0026-023--amoxycillin-clavulanic-acid",
} as const;

export async function openRecord(page: Page, batchId: string, conceptId: string, query = ""): Promise<void> {
  await page.goto(`/review/${batchId}/${conceptId}${query}`);
  await deskReady(page);
}

/** The desk island has hydrated: the drawer replaces the no-JavaScript evidence details. */
export async function deskReady(page: Page): Promise<void> {
  await expect(page.locator("#drawer")).toBeAttached({ timeout: 20_000 });
  await page.locator("#desk").focus();
}

/** The record's version as the desk polls it (the confirm step posts exactly this). */
export async function versionOf(page: Page, batchId: string, conceptId: string) {
  const rows = (await (await page.request.get(`/review/${batchId}/versions`)).json()) as
    { conceptId: string; extractedAt: string | null; lastDecisionId: number | null }[];
  const row = rows.find((r) => r.conceptId === conceptId);
  if (!row) throw new Error(`no version for ${conceptId}`);
  return row;
}

export const STALE = "This record changed — reload to review the latest data";

/** A POST of the desk's `decide` server action (logRecordOpen and logEvidence carry no "decision" argument). */
const isDecide = (route: Route) => {
  const req = route.request();
  return req.method() === "POST" && !!req.headers()["next-action"] && (req.postData() ?? "").includes('"decision"');
};

/**
 * Intercepts the desk's decide POSTs on a batch's pages. "abort": each is lost before the server sees it. "hold": each
 * waits (the desk times out after 10 s). The returned function aborts anything held and removes the interception.
 */
export async function interceptActions(page: Page, batchId: string, mode: "abort" | "hold"): Promise<() => Promise<void>> {
  const pattern = `**/review/${batchId}/**`;
  const held: Route[] = [];
  const handler = async (route: Route) => {
    if (!isDecide(route)) return route.continue();
    if (mode === "abort") return route.abort("internetdisconnected");
    held.push(route);
  };
  await page.route(pattern, handler);
  return async () => {
    await page.unroute(pattern, handler);
    for (const r of held.splice(0)) await r.abort("internetdisconnected").catch(() => {});
  };
}

/**
 * The next decide POST runs on the server for real, and the value it returned is swapped for `result` in the flight
 * response (its last JSON row). Used to reach the action's rate_limited and forbidden outcomes without exhausting a
 * limit or changing a role.
 */
export async function replaceNextActionResult(page: Page, batchId: string, result: unknown): Promise<void> {
  let done = false;
  await page.route(`**/review/${batchId}/**`, async (route) => {
    if (done || !isDecide(route)) return route.continue();
    done = true;
    const res = await route.fetch();
    const rows = (await res.text()).split("\n");
    const at = rows.map((r, i) => (/^\d+:\{/.test(r) ? i : -1)).filter((i) => i >= 0).pop();
    if (at === undefined) throw new Error("no JSON row in the server action response");
    rows[at] = rows[at].replace(/^(\d+):.*$/, `$1:${JSON.stringify(result)}`);
    await route.fulfill({ response: res, body: rows.join("\n") });
  });
}

/** Blocks every Next client chunk, so no island hydrates: the page behaves as if JavaScript failed to load (§5.8.6). */
export async function blockIslands(page: Page): Promise<void> {
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
}
```

Create `web/e2e/lhci-session.cjs` (Lighthouse CI's `puppeteerScript`: it signs Chrome in before the review URL is measured):

```js
// Mints the e2e pharmacist's session cookie the way lib/session-crypto.ts does (HKDF-SHA256 key, dir/A256GCM JWE) and
// sets it before Lighthouse loads /review/…. tests/lhci-session.test.ts pins that lib/session-crypto decrypts it.
const { hkdfSync } = require("node:crypto");

const SECRET = process.env.E2E_SESSION_SECRET ?? "e2e-session-secret-0123456789abcdef0123456789";   // = web/e2e/session.ts
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function mintSession(claims, secret = SECRET, now = Math.floor(Date.now() / 1000)) {
  const { EncryptJWT } = await import("jose");
  const key = new Uint8Array(hkdfSync("sha256", secret, new Uint8Array(0), "intellidrugs-session-v1", 32));
  return new EncryptJWT(claims).setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuedAt(now).setExpirationTime(now + 8 * 60 * 60).encrypt(key);
}

module.exports = async (browser) => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/healthz`);
  await page.setCookie({ name: "__Host-intellidrugs_session", url: BASE, httpOnly: true, secure: true, sameSite: "Lax",
    value: await mintSession({ email: "pharm@e2e.test", name: "E2E Reviewer", role: "pharmacist" }) });
  await page.close();
};
module.exports.mintSession = mintSession;
```

Create `web/tests/lhci-session.test.ts`:

```ts
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { decryptSession } from "@/lib/session-crypto";

const require = createRequire(import.meta.url);
const { mintSession } = require("../e2e/lhci-session.cjs") as { mintSession: (c: object, secret?: string) => Promise<string> };
const SECRET = "e2e-session-secret-0123456789abcdef0123456789";

describe("the Lighthouse CI session (§10.6 /review budget)", () => {
  it("mints a cookie that lib/session-crypto accepts as the e2e pharmacist", async () => {
    const token = await mintSession({ email: "pharm@e2e.test", name: "E2E Reviewer", role: "pharmacist" }, SECRET);
    expect(await decryptSession(token, SECRET)).toMatchObject({ email: "pharm@e2e.test", role: "pharmacist" });
  });
});
```

Create `web/lighthouserc.review.json`. §10.6 measures `/review/[b]/[c]` on a laptop over broadband and the public pages on Slow 4G mobile; one LHCI collect has one set of settings, so the desk gets its own config beside P1A's `lighthouserc.json` (which P2 extends with the public URLs). Sizes are gzip transfer sizes in bytes:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/review/0001-pilot/186-0030-006--napa"],
      "numberOfRuns": 3,
      "puppeteerScript": "./e2e/lhci-session.cjs",
      "settings": { "preset": "desktop", "disableStorageReset": true }
    },
    "assert": {
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 1 }],
        "resource-summary:document:size": ["error", { "maxNumericValue": 81920 }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 204800 }],
        "resource-summary:stylesheet:size": ["error", { "maxNumericValue": 25600 }],
        "resource-summary:font:size": ["error", { "maxNumericValue": 92160 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 1500 }]
      }
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci-review" }
  }
}
```

In `.github/workflows/ci.yml`, in the `e2e` job, add after P1A's `- run: cd web && npx lhci autorun`:

```yaml
      - run: cd web && npx lhci autorun --config=./lighthouserc.review.json
```

Lighthouse CI runs a `puppeteerScript` through `puppeteer` (falling back to `puppeteer-core`, which needs a Chrome path), and P1A Task 1's devDependencies do not include it: without it `npx lhci autorun --config=./lighthouserc.review.json` stops with "Unable to require 'puppeteer' for script". Install it pinned (25.12.0, released 2026-09-23; it needs Node 22.12 or later, which CI's `node-version: "22"` gives):

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2/web
npm install --save-dev --save-exact puppeteer@25.12.0
node -e "require.resolve('puppeteer'); console.log('puppeteer ok')"
```

Expected: `added … packages`, `"puppeteer": "25.12.0"` under `devDependencies` in `web/package.json`, and `puppeteer ok`. Its install step downloads a Chrome for the LHCI run; the web image never runs Lighthouse, so in `web/Dockerfile`'s build stage add the line `ENV PUPPETEER_SKIP_DOWNLOAD=true` directly above `RUN npm ci` (the image build stays as fast as before, and `npm run build` never loads puppeteer). Step 7's local LHCI run is the check that the review config's `puppeteerScript` loads; do not rely on CI before it passes locally.

Append `web/.lighthouseci-review/` to the repository's root `.gitignore`, on the line after P1A Task 1's `web/.lighthouseci/` (no `web/.gitignore` is created):

```
web/.lighthouseci-review/
```

- [ ] **Step 6: Write the review specs**

Create `web/e2e/review-access.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { PILOT_IDS } from "./review-helpers";
import { signInAs } from "./session";

const NAPA = `/review/0001-pilot/${PILOT_IDS.napa}`;

test("anonymous: every review page is a 307 to sign-in with returnTo; versions is a 401 (§2.3)", async ({ request }) => {
  const r = await request.get(`${NAPA}?show=needs`, { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  expect(r.headers().location).toBe(`/signin?returnTo=${encodeURIComponent(`${NAPA}?show=needs`)}`);
  expect((await request.get("/review/0001-pilot/versions")).status()).toBe(401);
});

test("legacy URLs answer 308 to the review surface (§2.3)", async ({ request }) => {
  const at = async (p: string) => (await request.get(p, { maxRedirects: 0 })).headers().location;
  expect(await at("/batches")).toMatch(/\/review$/);
  expect(await at(`/batches/0001-pilot?item=${PILOT_IDS.napa}&review=saved`)).toMatch(new RegExp(`/review/0001-pilot/${PILOT_IDS.napa}$`));
  expect(await at("/flags?resolve=resolved")).toMatch(/\/review\/flags$/);
});

test("a reader gets the not-authorised page with status 200 and no batch data (§5.12)", async ({ context, page }) => {
  await signInAs(context, "user", "Some Reader");
  const res = await page.goto(NAPA);
  expect(res?.status()).toBe(200);
  await expect(page.getByText("This Google account isn't on the reviewer list.")).toBeVisible();
  await expect(page.getByText("Napa", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/review/0001-pilot/versions")).status()).toBe(403);
});

test("a reviewer reads the pilot batch: Board R's record header, the route statement and the 28 batch pairs", async ({ context, page }) => {
  await signInAs(context, "pharmacist", "Farhana Islam");
  await page.goto(`/review/0001-pilot/${PILOT_IDS.chloramphenicol}`);
  await expect(page.getByRole("heading", { level: 1, name: "Chloramphenicol" })).toBeVisible();
  await expect(page.getByText("None of the 28 batch pairs from DDInter 2.0 involve Chloramphenicol.")).toBeVisible();
  await expect(page.locator("#record")).not.toContainText("@e2e.test");
});

test("/review/0001-pilot opens the first record that needs review", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await page.goto("/review/0001-pilot");
  await expect(page).toHaveURL(new RegExp(`/review/0001-pilot/${PILOT_IDS.amlodipine}$`));
});
```

Create `web/e2e/review-desk.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { auditCount, decisions, lastDecision } from "./db";
import { PILOT_IDS, STALE, openRecord } from "./review-helpers";
import { signInAs } from "./session";

const B = "e2e-desk";
const live = '[data-desk="live"]';

test.describe.configure({ timeout: 180_000 });

test.describe("the decision flow (§5.7–§5.10, §5.14)", () => {
  test("pharmacist: A, U undoes; A again publishes after 8 s with the saved announcement, the advance and the 1 s guard", async ({ context, page }) => {
    await signInAs(context, "pharmacist", "Farhana Islam");
    await openRecord(page, B, PILOT_IDS.napa);
    await page.keyboard.press("a");
    await expect(page.locator(".toast")).toContainText("Publishes in 8 seconds.");
    await expect(page.locator(live)).toHaveText("Napa marked correct. Publishes in 8 seconds. Press U to undo.");
    await page.keyboard.press("u");
    await expect(page.locator(live)).toHaveText("Undone. Napa was not saved.");
    await page.waitForTimeout(9_000);
    expect(decisions(B, PILOT_IDS.napa)).toBe(0);

    await page.keyboard.press("a");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.clarith}$`), { timeout: 25_000 });
    await expect(page.locator(live)).toHaveText("Saved. Napa is approved by a pharmacist and published. Opened Clarith, record 9 of 10.");
    await page.keyboard.press("a");   // within 1000 ms of arriving: the guard, not a window
    await expect(page.locator(".decision-hint")).toHaveText("Record changed to Clarith. Press A again to approve it.");
    await expect(page.locator(".toast.is-running")).toHaveCount(0);
    expect(decisions(B, PILOT_IDS.napa)).toBe(1);
    expect(lastDecision(B, PILOT_IDS.napa)).toBe("ok|pharmacist|");
    await openRecord(page, B, PILOT_IDS.napa);
    await expect(page.locator(".decision-promise")).toContainText("Approved by a pharmacist.");
    expect(auditCount("review_open", `${B}/${PILOT_IDS.napa}`)).toBe(1);   // at most once per 10 minutes
  });

  test("Enter never approves; J and K move between records", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.locator('[data-fk="approve"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".decision-hint")).toHaveText("Enter does not approve. Press A, or Space on this button.");
    await expect(page.locator(".toast.is-running")).toHaveCount(0);
    await page.locator("#desk").focus();
    await page.keyboard.press("j");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.simvastatin}`));
    await page.keyboard.press("k");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.aspirin}`));
  });

  test("filters and search live in the URL; an empty view offers Show all, which clears both and focuses the list (§5.3)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.locator('.chrome-sidebar [data-fk="f-nodata"]').click();
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.domperidone}\\?show=nodata$`));   // the open record left the view
    await page.locator('[data-desk="search"]').fill("zzz-no-such-record");
    await expect(page).toHaveURL(/q=zzz-no-such-record/);
    await expect(page.getByText("No records match “zzz-no-such-record”.")).toBeVisible();
    await page.getByRole("link", { name: "Show all 10 records" }).click();
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.domperidone}$`));
    await expect(page.getByRole("listbox", { name: `Records in ${B}` })).toBeFocused();
    await page.locator('[data-desk="search"]').fill("warfarin");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.warfarin}\\?q=warfarin$`));
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  });

  test("report: a 4-character note shows the error; a Bengali note is counted in characters, saved as typed, and never goes stale", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.simvastatin);
    await page.keyboard.press("r");
    await expect(page.locator("#note")).toBeFocused();
    await page.locator("#note").fill("abcd");
    await page.getByRole("button", { name: /^Send report/ }).click();
    await expect(page.getByText("Add at least 5 characters so the engineer knows what to fix.")).toBeVisible();
    await expect(page.locator("#note")).toHaveAttribute("aria-invalid", "true");
    expect(decisions(B, PILOT_IDS.simvastatin)).toBe(0);
    await page.locator("#note").fill("শক্তি ভুল");
    await expect(page.getByText("9 / 1000")).toBeVisible();
    await page.getByRole("button", { name: /^Send report/ }).click();
    await expect.poll(() => decisions(B, PILOT_IDS.simvastatin), { timeout: 15_000 }).toBe(1);
    expect(lastDecision(B, PILOT_IDS.simvastatin)).toBe("issue|pharmacist|শক্তি ভুল");
    await expect(page.locator(live)).toHaveText(/^Issue reported for .+\. An engineer will see your note\.$/);
    await page.waitForTimeout(25_000);   // at least one poll after the reviewer's own save, in the same page (D45)
    await expect(page.getByText(STALE)).toHaveCount(0);
  });

  test("engineer: the promise, the toast, the recorded check, and the second A's hint", async ({ context, page }) => {
    await signInAs(context, "engineer", "Rafiq Ahmed");
    await openRecord(page, B, PILOT_IDS.metformin);
    await expect(page.locator(".decision-promise")).toContainText("You're reviewing as an engineer.");
    await page.getByRole("button", { name: /^Looks correct/ }).click();
    await expect(page.locator(".toast")).toContainText("Your check saves in 8 seconds. It does not publish.");
    await expect.poll(() => decisions(B, PILOT_IDS.metformin), { timeout: 20_000 }).toBe(1);
    expect(lastDecision(B, PILOT_IDS.metformin)).toBe("ok|engineer|");
    await openRecord(page, B, PILOT_IDS.metformin);
    await expect(page.locator(".decision-promise")).toHaveText("Your check is recorded. A pharmacist still needs to approve.");
    await page.keyboard.press("a");
    await expect(page.locator(".decision-hint")).toHaveText("Your check is already recorded for this record.");
    expect(decisions(B, PILOT_IDS.metformin)).toBe(1);
  });

  test("evidence: E moves focus to Close, A and R only say to close it, Esc returns focus; audited once", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.clarith);
    await page.keyboard.press("e");
    await expect(page.locator("#drawer")).toBeVisible();
    await expect(page.locator('[data-fk="drawer-close"]')).toBeFocused();
    await page.keyboard.press("a");
    await expect(page.locator(".decision-hint")).toHaveText("Close the evidence first (Esc).");
    await expect(page.locator(".toast")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#drawer")).toBeHidden();
    await expect(page.locator('[data-fk="ev"]')).toBeFocused();
    await expect.poll(() => auditCount("evidence_open", `${B}/${PILOT_IDS.clarith}`)).toBe(1);
    expect(decisions(B, PILOT_IDS.clarith)).toBe(0);
  });

  test("the ? sheet traps Tab and returns focus on Esc (§5.14)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amlodipine);
    await page.keyboard.press("?");
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet.getByRole("button", { name: /^Close/ })).toBeFocused();
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Tab");
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("#desk")).toBeFocused();
  });

  test("settings in the sheet: shortcuts Off leave the buttons working; a 60-second window sends nothing before 60 s", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.domperidone);
    await page.keyboard.press("?");
    await page.getByRole("dialog").getByRole("button", { name: "Off", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("a");
    await page.waitForTimeout(1_000);
    await expect(page.locator(".toast.is-running")).toHaveCount(0);
    await expect(page.locator(".decision-keys")).toHaveCount(0);
    await page.getByRole("button", { name: "Looks correct" }).click();   // no Kbd label while Off
    await expect(page.locator(".toast.is-running")).toBeVisible();
    await page.locator('[data-fk="undo"]').click();
    await expect(page.locator(live)).toHaveText(/^Undone\. .+ was not saved\.$/);

    // Off hides "?", so the sheet opens from the account menu item (§5.14)
    await page.locator(".chrome-toolbar details > summary").click();
    await page.locator('[data-desk-open="sheet"]').click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "On", exact: true }).click();
    await sheet.getByRole("button", { name: "60 seconds", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.locator("#desk").focus();
    await page.keyboard.press("a");
    await expect(page.locator(".toast")).toContainText("Publishes in 60 seconds.");
    await page.waitForTimeout(55_000);
    expect(decisions(B, PILOT_IDS.domperidone)).toBe(0);
    await page.keyboard.press("u");
    await expect(page.locator(live)).toHaveText(/^Undone\. .+ was not saved\.$/);
    expect(decisions(B, PILOT_IDS.domperidone)).toBe(0);
  });

  test("sign-out removes every note draft from sessionStorage (§5.10)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.warfarin);
    await page.keyboard.press("r");
    await page.locator("#note").fill("Draft that must not outlive the session");
    await page.keyboard.press("Escape");   // closes the panel and keeps the draft
    const drafts = () => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("intellidrugs-draft:")));
    expect(await drafts()).toHaveLength(1);
    await page.locator(".chrome-toolbar details > summary").click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).not.toHaveURL(/\/review\//);
    expect(await drafts()).toEqual([]);
  });
});
```

Create `web/e2e/review-stale.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { decisions, otherReviewerApproves, restamp } from "./db";
import { PILOT_IDS, STALE, openRecord } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";

const B = "e2e-stale";

test.describe.configure({ timeout: 120_000 });

test.describe("stale detection (§5.11)", () => {
  test("a re-run while the record is open pauses decisions; Reload record shows the new data and stays reloaded", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.warfarin);
    await expect(page.locator("#record")).not.toContainText("Pipeline re-ran this record");
    restamp(B, PILOT_IDS.warfarin);
    await expect(page.getByText(STALE)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-fk="approve"]')).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Reload record" }).click();
    await expect(page.locator('[data-desk="live"]')).toHaveText("Record reloaded. Decisions are available again.", { timeout: 15_000 });
    await expect(page.getByText(STALE)).toHaveCount(0);
    await expect(page.locator("#record")).toContainText("Pipeline re-ran this record");
    await page.waitForTimeout(22_000);   // the next poll agrees with what is shown
    await expect(page.getByText(STALE)).toHaveCount(0);
  });

  test("a re-run during the undo window: nothing is sent", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await context.addCookies([{ name: "intellidrugs-undo", value: "60", url: BASE_URL }]);
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.keyboard.press("a");
    restamp(B, PILOT_IDS.aspirin);
    await expect(page.getByText(STALE)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".toast")).toHaveCount(0);
    await page.waitForTimeout(2_000);
    expect(decisions(B, PILOT_IDS.aspirin)).toBe(0);
  });

  test("another reviewer decides first: the other-reviewer banner", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.napa);
    otherReviewerApproves(B, PILOT_IDS.napa);
    await expect(page.getByText("Another reviewer decided on Napa after you opened it.", { exact: false })).toBeVisible({ timeout: 30_000 });
  });

  test("the reviewer's own A never makes the record stale, in the same page (D45)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.clarith);
    await page.keyboard.press("a");
    await expect.poll(() => decisions(B, PILOT_IDS.clarith), { timeout: 20_000 }).toBe(1);
    await expect(page).not.toHaveURL(new RegExp(`${PILOT_IDS.clarith}$`), { timeout: 10_000 });   // auto-advanced
    await page.locator("#desk").focus();
    await page.keyboard.press("k");                                                             // back, inside the desk
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.clarith}$`));
    await page.waitForTimeout(25_000);   // at least one poll after the save; no reload in between
    await expect(page.getByText(STALE)).toHaveCount(0);
    await expect(page.locator(".decision-promise")).toContainText("Approved by a pharmacist.");
  });

  test("refresh race: the open record re-stamped between the poll and the refresh keeps what the reviewer opened", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amlodipine);
    await expect(page.locator("#record")).not.toContainText("Pipeline re-ran this record");
    let raced = false;
    // The refresh that another row's change triggers is delayed just long enough to re-stamp the open record first.
    await page.route(`**/review/${B}/${PILOT_IDS.amlodipine}*`, async (route) => {
      const h = route.request().headers();
      if (!raced && h["rsc"] === "1" && !h["next-router-prefetch"]) { raced = true; restamp(B, PILOT_IDS.amlodipine); }
      await route.continue();
    });
    otherReviewerApproves(B, PILOT_IDS.simvastatin);   // the next poll sees another row change and calls router.refresh()
    await expect(page.getByText(STALE)).toBeVisible({ timeout: 30_000 });
    expect(raced).toBe(true);
    await expect(page.locator("#record")).not.toContainText("Pipeline re-ran this record");   // still the content it opened with
    await expect(page.locator('[data-fk="approve"]')).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Reload record" }).click();
    await expect(page.locator("#record")).toContainText("Pipeline re-ran this record");
    await expect(page.getByText(STALE)).toHaveCount(0);
  });
});
```

Create `web/e2e/review-failures.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { approveAllExcept, decisions, restamp } from "./db";
import { PILOT_IDS, STALE, blockIslands, interceptActions, openRecord, versionOf } from "./review-helpers";
import { signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

const B = "e2e-fail";
const tokenIn = (form: string) => `${form} input[name="cf-turnstile-response"]`;

test.describe.configure({ timeout: 120_000 });

test.describe("failures and fallbacks (§5.7, §5.8.3, §5.8.6, §5.12)", () => {
  test("a lost response: 'Couldn't confirm', then Try again saves exactly once", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.napa);
    let dropped = false;
    await page.route(`**/review/${B}/**`, async (route) => {
      const req = route.request();
      if (!dropped && req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes('"decision"')) {
        dropped = true;
        await route.fetch();                       // the server saves …
        await route.abort("connectionreset");      // … and the answer never arrives
      } else await route.continue();
    });
    await page.keyboard.press("a");
    await expect(page.getByText("Couldn't confirm your decision.")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Nothing was published/)).toHaveCount(0);
    expect(decisions(B, PILOT_IDS.napa)).toBe(1);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Couldn't confirm your decision.")).toHaveCount(0, { timeout: 15_000 });
    expect(decisions(B, PILOT_IDS.napa)).toBe(1);   // the replay found the saved decision by its requestId
  });

  test("a network failure before the server: 'Couldn't confirm', then Try again saves once", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amlodipine);
    const stop = await interceptActions(page, B, "abort");
    await page.keyboard.press("a");
    await expect(page.getByText("Couldn't confirm your decision.")).toBeVisible({ timeout: 25_000 });
    expect(decisions(B, PILOT_IDS.amlodipine)).toBe(0);
    await stop();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => decisions(B, PILOT_IDS.amlodipine), { timeout: 15_000 }).toBe(1);
    await expect(page.getByText("Couldn't confirm your decision.")).toHaveCount(0);
  });

  test("the session expires during the window: nothing is saved and sign-in is offered", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.keyboard.press("a");
    await context.clearCookies();
    await expect(page.getByText("Your sign-in expired. Your decision on Aspirin was not saved.")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("Your account can't review this batch.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", /\/signin\?returnTo=/);
    expect(decisions(B, PILOT_IDS.aspirin)).toBe(0);
  });

  test("the bot check fails: the decision is kept and nothing is sent; Retry check then saves it", async ({ context, page }) => {
    await installTurnstileFake(page, "error-once");
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.simvastatin);
    await page.keyboard.press("a");
    await expect(page.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeVisible({ timeout: 25_000 });
    expect(decisions(B, PILOT_IDS.simvastatin)).toBe(0);
    await page.getByRole("button", { name: "Retry check" }).click();
    await expect(page.locator(".toast.is-running")).toBeVisible({ timeout: 10_000 });   // a new window starts (§5.8.2)
    await expect.poll(() => decisions(B, PILOT_IDS.simvastatin), { timeout: 20_000 }).toBe(1);
  });

  test("an in-app link out of the batch during the window is not followed; the hint says why (§5.8.3)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.metformin);
    await page.keyboard.press("a");
    await page.locator('#desk .chrome-toolbar a[href="/review"]').click();
    await expect(page.locator(".decision-hint")).toHaveText(/ is still in its undo window\. Press U to undo it, or wait until it saves\.$/);
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.metformin}$`));
    await page.keyboard.press("u");
    await page.waitForTimeout(9_000);
    expect(decisions(B, PILOT_IDS.metformin)).toBe(0);
  });

  test("closing the tab during the window asks first, and the decision is discarded (§5.8.3)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amoxiclav);
    await page.keyboard.press("a");
    await expect(page.locator(".toast.is-running")).toBeVisible();
    const asked = new Promise<string>((resolve) => page.once("dialog", (d) => { resolve(d.type()); void d.accept(); }));
    await page.close({ runBeforeUnload: true });
    expect(await asked).toBe("beforeunload");
    const after = await context.newPage();
    await after.waitForTimeout(10_000);
    expect(decisions(B, PILOT_IDS.amoxiclav)).toBe(0);
  });

  test("island blocked: Looks correct only redirects to the confirm step, which posts the version it carried", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await blockIslands(page);
    await page.goto(`/review/${B}/${PILOT_IDS.clarith}`);
    await expect(page.locator(tokenIn("form.decision-main"))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.locator("form.decision-main").getByRole("button", { name: "Looks correct" }).click();
    await expect(page).toHaveURL(/[?&]confirm=/);
    expect(decisions(B, PILOT_IDS.clarith)).toBe(0);   // the first POST never saves
    const v = await versionOf(page, B, PILOT_IDS.clarith);
    expect(new URL(page.url()).searchParams.get("x")).toBe(v.extractedAt ?? "");
    await expect(page.getByText("Confirm your decision on Clarith.")).toBeVisible();
    await expect(page.locator(tokenIn('form:has(input[name="commit"])'))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect.poll(() => decisions(B, PILOT_IDS.clarith), { timeout: 15_000 }).toBe(1);
  });

  test("island blocked: a re-run between the two POSTs refuses the confirm; the stale title shows and no Confirm", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await blockIslands(page);
    await page.goto(`/review/${B}/${PILOT_IDS.domperidone}`);
    await expect(page.locator(tokenIn("form.decision-main"))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.locator("form.decision-main").getByRole("button", { name: "Looks correct" }).click();
    await expect(page).toHaveURL(/[?&]confirm=/);
    restamp(B, PILOT_IDS.domperidone);
    await expect(page.locator(tokenIn('form:has(input[name="commit"])'))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText(STALE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    expect(decisions(B, PILOT_IDS.domperidone)).toBe(0);
  });

  test("without JavaScript the record reads fully, filters are links, and the page says why deciding needs JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: "http://localhost:3000" });
    await signInAs(context, "pharmacist");
    const page = await context.newPage();
    await page.goto(`/review/${B}/${PILOT_IDS.warfarin}`);
    await expect(page.getByText("Reviewing needs JavaScript for the bot check. You can still read this record.")).toBeVisible();
    await expect(page.locator("details#evidence")).toBeAttached();
    await page.getByRole("link", { name: /^Warnings/ }).first().click();
    await expect(page).toHaveURL(/show=warn/);
    await context.close();
  });
});

test("the last approval shows the complete view (§5.12)", async ({ context, page }) => {
  approveAllExcept("e2e-complete", PILOT_IDS.amoxiclav);
  await signInAs(context, "pharmacist");
  await openRecord(page, "e2e-complete", PILOT_IDS.amoxiclav);
  await page.keyboard.press("a");
  await expect(page.getByText("Batch e2e-complete approved. 10 records are now public.")).toBeVisible({ timeout: 25_000 });
  await page.getByRole("listbox").getByRole("option").first().click();   // "Open any record to read it" (§5.7)
  await expect(page.getByText("Batch e2e-complete approved. 10 records are now public.")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/review/e2e-complete/${PILOT_IDS.amlodipine}$`));
});
```

Create `web/e2e/review-lists.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { flagStatus, insertFlag } from "./db";
import { signInAs } from "./session";

test("/review lists every batch, the pilot batch first among those in review (§5.16)", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await page.goto("/review");
  await expect(page.getByRole("heading", { level: 1, name: "Batches" })).toBeVisible();
  await expect(page.locator("main ul a").first()).toHaveAttribute("href", "/review/0001-pilot");
  await expect(page.getByRole("link", { name: "Problem reports and partner requests" })).toBeVisible();
});

test("/review/flags: a report and a partner request, each resolved with the named outcome", async ({ context, page }) => {
  const report = insertFlag("product", "186-0030-006--napa", "E2E report: strength looks wrong");
  const partner = insertFlag("other", "partner-access", "E2E partner: clinic wants access");
  await signInAs(context, "engineer");
  await page.goto("/review/flags");
  await expect(page.getByText("E2E report: strength looks wrong")).toBeVisible();
  await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
  await page.locator(`button[name="flagId"][value="${report}"]`).click();
  await expect(page.getByRole("status").filter({ hasText: "Report resolved." })).toBeVisible();
  expect(flagStatus(report)).toBe("resolved");
  await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
  await page.locator(`button[name="flagId"][value="${partner}"]`).click();
  await expect(page.getByRole("status").filter({ hasText: "Request resolved." })).toBeVisible();
  expect(flagStatus(partner)).toBe("resolved");
});
```

Create `web/e2e/review-a11y.spec.ts` (axe over every §11.4 desk state, once per look: light, dark, and `forcedColors: "active"` (§10.3); then reflow at 320 px and the 400% zoom focus check):

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { approveAllExcept, restamp } from "./db";
import { PILOT_IDS, STALE, blockIslands, interceptActions, openRecord, replaceNextActionResult } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axe(page: Page, state: string): Promise<void> {
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations
    .map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}

/** §11.4: every desk state in light, dark and forced colours (§10.3), each on its own seeded batch. */
type Look = { name: string; batch: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [
  { name: "light", batch: "e2e-a11y-light", theme: "light", forced: false },
  { name: "dark", batch: "e2e-a11y-dark", theme: "dark", forced: false },
  { name: "forced colours", batch: "e2e-a11y-forced", theme: "light", forced: true },
];

async function contextFor(browser: Browser, look: Look, role: "pharmacist" | "user", cookies: Record<string, string> = {}): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
  await context.addCookies(Object.entries({ "intellidrugs-theme": look.theme, ...cookies }).map(([name, value]) => ({ name, value, url: BASE_URL })));
  await signInAs(context, role);
  return context;
}

test.describe.configure({ timeout: 300_000 });

for (const look of LOOKS) {
  test(`axe (${look.name}): every desk state, the lists and the not-authorised page (§10, §11.4)`, async ({ browser }) => {
    const B = look.batch, P = PILOT_IDS;
    const ctx = await contextFor(browser, look, "pharmacist");

    // ready, drawer, sheet with settings, armed
    const page = await ctx.newPage();
    await openRecord(page, B, P.amlodipine);
    await axe(page, "ready");
    await page.keyboard.press("e");
    await expect(page.locator("#drawer")).toBeVisible();
    await axe(page, "drawer");
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await axe(page, "sheet");
    await page.keyboard.press("Escape");
    await page.keyboard.press("a");
    await expect(page.locator(".toast.is-running")).toBeVisible();
    await axe(page, "armed");
    await page.keyboard.press("u");

    // report error: the report POST is lost; Try again then sends it
    const stopReport = await interceptActions(page, B, "abort");
    await page.keyboard.press("r");
    await page.locator("#note").fill("Strength on the pack is 10 mg");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByText("Couldn't send your report.")).toBeVisible({ timeout: 25_000 });
    await axe(page, "report error");
    await stopReport();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Couldn't send your report.")).toHaveCount(0, { timeout: 25_000 });

    // stale
    restamp(B, P.amlodipine);
    await expect(page.getByText(STALE)).toBeVisible({ timeout: 30_000 });
    await axe(page, "stale");
    await page.getByRole("button", { name: "Reload record" }).click();
    await expect(page.getByText(STALE)).toHaveCount(0, { timeout: 15_000 });

    // committing, then unconfirmed (the decide POST is held until the desk's 10 s timeout), then Try again
    await openRecord(page, B, P.aspirin);
    const release = await interceptActions(page, B, "hold");
    await page.keyboard.press("a");
    await expect(page.locator(".toast")).toContainText("saving.", { timeout: 20_000 });
    await axe(page, "committing");
    await expect(page.getByText("Couldn't confirm your decision.")).toBeVisible({ timeout: 25_000 });
    await axe(page, "net error, unconfirmed");
    await release();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Couldn't confirm your decision.")).toHaveCount(0, { timeout: 25_000 });

    // net error, not saved: the action's rate_limited outcome (the server's real answer is replaced)
    await openRecord(page, B, P.simvastatin);
    await replaceNextActionResult(page, B, { ok: false, code: "rate_limited" });
    await page.keyboard.press("a");
    await expect(page.getByText("Couldn't save your decision.")).toBeVisible({ timeout: 25_000 });
    await axe(page, "net error, not saved");
    await page.close();

    // loading: the next record's render is held while the skeleton shows
    const lp = await ctx.newPage();
    await openRecord(lp, B, P.metformin);
    await lp.waitForLoadState("networkidle");   // the desk has prefetched the next record's loading state (§5.4)
    let releaseNav = () => {};
    const gate = new Promise<void>((resolve) => { releaseNav = resolve; });
    await lp.route(`**/review/${B}/${P.napa}*`, async (route) => {
      if (route.request().headers()["rsc"] === "1" && !route.request().headers()["next-router-prefetch"]) await gate;
      await route.continue();
    });
    await lp.keyboard.press("j");
    await expect(lp.locator('[data-desk="loading"]')).toHaveText(`Loading batch ${B}`, { timeout: 10_000 });
    await expect(lp.locator('[data-desk="live"]')).toHaveText(`Loading batch ${B}`);   // the one polite region (§10.2)
    expect(await lp.locator('[aria-live], [role="status"]').count()).toBe(1);
    await axe(lp, "loading");
    releaseNav();
    await expect(lp).toHaveURL(new RegExp(`/review/${B}/${P.napa}$`));

    // no-auth: the action's forbidden outcome
    await openRecord(lp, B, P.warfarin);
    await replaceNextActionResult(lp, B, { ok: false, code: "forbidden" });
    await lp.keyboard.press("a");
    await expect(lp.locator("#decision-bar")).toContainText("Your account can't review this batch.", { timeout: 25_000 });
    await axe(lp, "no-auth");
    await lp.close();

    // bot hold
    const bp = await ctx.newPage();
    await installTurnstileFake(bp, "error");
    await openRecord(bp, B, P.napa);
    await bp.keyboard.press("a");
    await expect(bp.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeVisible({ timeout: 20_000 });
    await axe(bp, "bot hold");
    await bp.close();

    // no-JavaScript confirm page (the islands are blocked)
    const np = await ctx.newPage();
    await blockIslands(np);
    await np.goto(`/review/${B}/${P.domperidone}`);
    await expect(np.locator('form.decision-main input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await np.locator("form.decision-main").getByRole("button", { name: "Looks correct" }).click();
    await expect(np.getByText(/^Confirm your decision on /)).toBeVisible();
    await axe(np, "no-JavaScript confirm");
    await np.close();

    // shortcuts Off
    const offCtx = await contextFor(browser, look, "pharmacist", { "intellidrugs-keys": "off" });
    const op = await offCtx.newPage();
    await openRecord(op, B, P.clarith);
    await expect(op.locator(".decision-keys")).toHaveCount(0);
    await axe(op, "shortcuts off");
    await offCtx.close();

    // signed out during the window
    const outCtx = await contextFor(browser, look, "pharmacist");
    const sp = await outCtx.newPage();
    await openRecord(sp, B, P.clarith);
    await sp.keyboard.press("a");
    await outCtx.clearCookies();
    await expect(sp.getByRole("link", { name: "Sign in again" })).toBeVisible({ timeout: 25_000 });
    await axe(sp, "signed out");
    await outCtx.close();

    // complete
    approveAllExcept(B, P.amoxiclav);
    const cp = await ctx.newPage();
    await openRecord(cp, B, P.amoxiclav);
    await cp.keyboard.press("a");
    await expect(cp.getByText(`Batch ${B} approved. 10 records are now public.`)).toBeVisible({ timeout: 25_000 });
    await axe(cp, "complete");

    // the batch list and the flags page
    for (const path of ["/review", "/review/flags"]) {
      await cp.goto(path);
      await axe(cp, path);
    }
    await ctx.close();

    const reader = await contextFor(browser, look, "user");
    const rp = await reader.newPage();
    await rp.goto("/review/0001-pilot");
    await axe(rp, "not authorised");
    await reader.close();
  });
}

test("reflow at 320 CSS px: no horizontal scroll in the list or the record (§10.4)", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await page.setViewportSize({ width: 320, height: 640 });
  for (const q of ["?pane=list", ""]) {
    await page.goto(`/review/0001-pilot/${PILOT_IDS.amoxiclav}${q}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test("1280×800 at 400% zoom (320×200 CSS px): tabbing through the desk, nothing covers the focused element (§10.4, WCAG 2.4.11)", async ({ context, page }) => {
  test.setTimeout(120_000);
  await signInAs(context, "pharmacist");
  await page.setViewportSize({ width: 320, height: 200 });
  await openRecord(page, "0001-pilot", PILOT_IDS.napa);
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const covered = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "focus fell to <body>";
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;   // e.g. the visually hidden live region is never focusable
      const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
      const cover = document.elementFromPoint(x, y)?.closest(".decision-bar, .chrome-toolbar");
      return cover && !cover.contains(el) ? `${el.tagName} ${el.getAttribute("data-fk") ?? el.textContent?.trim().slice(0, 40)} under ${cover.className}` : null;
    });
    expect(covered, `Tab ${i + 1}`).toBeNull();
  }
});
```

Create `web/e2e/review-perf.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { PILOT_IDS, openRecord } from "./review-helpers";
import { signInAs } from "./session";

test("J paints the next record within 300 ms once it is prefetched (§10.6)", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await openRecord(page, "0001-pilot", PILOT_IDS.metformin);
  await page.waitForLoadState("networkidle");   // the desk prefetches the previous and next records (§5.4)
  const ms = await page.evaluate(async () => {
    const title = () => document.querySelector("#record h1")?.textContent ?? "";
    const before = title();
    const t0 = performance.now();
    document.getElementById("desk")!.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    await new Promise<void>((resolve) => { const tick = () => (title() !== before ? resolve() : requestAnimationFrame(tick)); tick(); });
    return performance.now() - t0;
  });
  expect(ms).toBeLessThanOrEqual(300);
  await expect(page).toHaveURL(new RegExp(`/review/0001-pilot/${PILOT_IDS.napa}$`));
});
```

Create `web/e2e/zy-review-single-batch.spec.ts` (named to run after every other review file and before P1A's `zz-rate-limit.spec.ts`):

```ts
import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { PILOT_IDS } from "./review-helpers";
import { signInAs } from "./session";

/*
 * §2.1 and §11.4 "open /review → record 1": with exactly one batch in review, /review opens it, and its first record that
 * needs review opens. The seed has eight in-review batches, so this file (named to run last; workers: 1) parks the others
 * for its one test and puts them back.
 */
test("/review with one batch in review opens it at record 1", async ({ context, page }) => {
  const others = sql("SELECT string_agg(batch_id, ',') FROM ops.batch WHERE status = 'in_review' AND batch_id <> '0001-pilot'");
  sql("UPDATE ops.batch SET status = 'approved' WHERE status = 'in_review' AND batch_id <> '0001-pilot'");
  try {
    await signInAs(context, "pharmacist");
    await page.goto("/review");
    await expect(page).toHaveURL(new RegExp(`/review/0001-pilot/${PILOT_IDS.amlodipine}$`));
    await expect(page.locator("#record h1")).toBeVisible();
  } finally {
    if (others) sql(`UPDATE ops.batch SET status = 'in_review' WHERE batch_id = ANY(string_to_array('${others.replace(/'/g, "''")}', ','))`);
  }
});
```

- [ ] **Step 7: Run the stack and the e2e suite (Docker required)**

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml config | head -1   # must print: name: bddrug-ci
export DB_USER=bddrug DB_PASSWORD=ci GHCR_OWNER=ci IMAGE_TAG=ci
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml up -d --build db flyway api web
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml run --rm seed
curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz && echo
cd web && npx vitest run tests/lhci-session.test.ts && E2E_BASE_URL=http://localhost:3000 npx playwright test \
  && npx lhci autorun && npx lhci autorun --config=./lighthouserc.review.json
```

Expected: `name: bddrug-ci` (P1A's override names the project, so `down -v` below never touches a local `bddrug` stack or its `dbdata` volume), `ok`, then every spec passes (P1A's and the review specs), and both LHCI runs end `All results processed!` with every assertion passing. Stop the stack afterwards: `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml down -v`. The suite is not re-runnable against the same database (decisions and snapshots are append-only by design): run `down -v` before a second run.

- [ ] **Step 8: Commit**

```bash
git add web/e2e web/tests/pilot-seed.test.ts web/tests/lhci-session.test.ts web/lighthouserc.review.json \
  web/package.json web/package-lock.json web/Dockerfile .gitignore .github/workflows/ci.yml
git commit -m "test(web): review e2e on a Board R pilot seed: decisions, stale, failures, lists, axe states, zoom and the desk budget

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 22: Docs — the reviewer-invite runbook and the README link (§5.13, §2.2)

**Files:**
- Create: `docs/runbooks/reviewer-invite.md`
- Modify: `README.md` ("Reviewer sign-in setup": link to the runbook; the reviewer links now point at `/review`; its `docker-compose up -d web` and `up -d api web` commands gain `--no-deps`, as the runbook's do)
- Test: `web/tests/runbook.test.ts`

**Interfaces:**
- Consumes: §5.13's fixed template; the `REVIEWERS` syntax (README "Reviewer sign-in setup").
- Produces: `docs/runbooks/reviewer-invite.md` (P2 adds `docs/runbooks/partner-requests.md` beside it).

- [ ] **Step 1: Write the failing test**

Create `web/tests/runbook.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/runbook.test.ts`
Expected: FAIL — the runbook does not exist.

- [ ] **Step 3: Write the runbook and link it**

Create `docs/runbooks/reviewer-invite.md`:

````markdown
# Inviting a reviewer

Pharmacists and engineers review IntelliDrugs batches on `/review`. Roles are global and come from `REVIEWERS` in the host `.env` (spec §5.13). Invites are sent by hand from the template below; there is no automated email.

Reviewer emails are personal data. Keep them in the host `.env` and in your own mail client only: never in this repository, an issue, a PR, a chat channel or a log.

## 1. Find the batch and its size

Sign in at https://drugdb.eliooo.org/review with a reviewer account. The page lists every batch with its id and record count; use the newest batch that is **In review** (the one the reviewer's account menu will name).

## 2. Add the reviewer on the host

```bash
ssh ec2-user@<host>
cd ~/drugdb/deploy
cp .env .env.bak-$(date +%Y%m%d)       # keep a dated copy; it is chmod 600 like .env
vi .env                                 # append ,their.address@example.com:pharmacist (or :engineer) to REVIEWERS
cd ~/drugdb/deploy && docker-compose up -d --no-deps web
```

- The `REVIEWERS` line is comma-separated `email:role` pairs with no spaces; the role is `pharmacist` or `engineer`.
- `docker-compose up -d --no-deps web` recreates only the web container. `--no-deps` matters: without it Compose also brings up `web`'s dependency chain (`api`, then the exited one-shot `flyway`, which would run against the production database). The API, the database and the other sites on the host keep running; the `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted (§12.4).
- Check: `curl -fsS https://drugdb.eliooo.org/healthz` answers `ok`.
- Delete the `.env.bak-*` copy once the reviewer has signed in: it holds the same personal data.

## 3. Send the invite

Send it from the team mailbox to the address you added, exactly as below, with the role, batch id and record count filled in.

**Subject:** You're invited to review medicines on IntelliDrugs

**Body:**

> Role: {Pharmacist|Engineer}. Batch {id}, {n} records. Sign in at drugdb.eliooo.org with this Google account.

Example for a pharmacist on the pilot: "Role: Pharmacist. Batch 0001-pilot, 10 records. Sign in at drugdb.eliooo.org with this Google account."

## 4. What the reviewer sees

- They sign in with the invited Google account and open **Review desk** from the account menu, or go to `/review`.
- If they sign in with another Google account, every `/review` page says "This Google account isn't on the reviewer list." and offers "Use another Google account". Nothing else needs fixing: they sign out and use the invited account.
- A pharmacist's "Looks correct" publishes the record after the undo window. An engineer's check is recorded and never publishes.

## Change a role or remove a reviewer

Edit or delete their pair in `REVIEWERS`, then `cd ~/drugdb/deploy && docker-compose up -d --no-deps web`. A removed reviewer loses review rights on their next request. A reviewer whose role changed signs out and in again. Their past decisions stay in `ops.review_decision`; pages show their role, never their email.
````

In `README.md`, section "Reviewer sign-in setup", directly under the "**Add, remove or change a reviewer** on the host:" code block's following paragraph, add:

```markdown
To invite a new pharmacist or engineer (the email template and the exact host steps), follow [`docs/runbooks/reviewer-invite.md`](docs/runbooks/reviewer-invite.md). Reviewers work on `/review`; the old `/batches` and `/flags` addresses redirect there.
```

In the same README section, make the restart commands match the runbook (without `--no-deps` Compose also brings up the dependency chain, including the exited one-shot `flyway`, against the production database):
- in the "**Add, remove or change a reviewer**" code block, replace the line `docker-compose up -d web     # recreates web with the new list; api and db keep running` with `docker-compose up -d --no-deps web     # recreates only web with the new list; api, db and flyway are not touched`;
- in the paragraph after it ("Rotating `SESSION_SECRET` signs everyone out …"), replace the command `docker-compose up -d web` with `docker-compose up -d --no-deps web`, and `docker-compose up -d api web` with `docker-compose up -d --no-deps api web`.

Then `grep -n "docker-compose up -d" README.md` lists only the deploy-workflow line (step 3 of the deploy description, "runs … then logs out") and the three `--no-deps` commands.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/runbook.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/reviewer-invite.md README.md web/tests/runbook.test.ts
git commit -m "docs(deploy): reviewer-invite runbook with the fixed template and host steps

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Finishing P1B

- [ ] Run everything once more from a clean tree:

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
(cd api && ./gradlew test --no-daemon)
(cd web && npm ci && npm run lint:css && npm test && npm run build)
```

Expected: all green; `postbuild` prints the bundle scan and `client island check: …, all on the §4.2 allowlist`, with the new islands all under `components/review/desk/` plus `components/review/ReviewDesk.tsx` and `app/review/error.tsx`.

- [ ] Run the Task 21 Step 7 e2e block on a fresh stack (`down -v` first). Expected: every spec passes, axe reports no violations for any desk state in light, dark and forced colours, and both Lighthouse CI configs pass (P1A's and `lighthouserc.review.json`, the §10.6 `/review/[b]/[c]` budget).
- [ ] Open a PR from `feature/intellidrugs-p1b-reviewer-workspace` into `phase-1` (never into `main`, §12.3). After review and merge, phase 1 is complete only when the exit criteria of §12.1 hold: §11 unit, component and e2e review suites green, axe clean, and the **S1 session** run with the pharmacist on the live pilot (after the phase-1 merge into `main` deploys). Before that merge, add the pharmacist with `docs/runbooks/reviewer-invite.md` and confirm `https://drugdb.eliooo.org/batches` answers 308 to `/review`.
- [ ] S1 session checklist (with the pharmacist, on `0001-pilot`): they open the desk from the invite, approve one record with `A` and undo it with `U`, approve it again and see it saved, report one issue with a note, open the evidence with `E`, and say aloud what the green mark means. Record the time per record and any copy they misread in the PR that closes phase 1.

## Self-review notes

- **Spec coverage.** §5.1 layout, toolbar and the bar-height scroll padding (Tasks 14, 17a, 17c, 18); §5.2–§5.4 list, search, filters and row hints (Tasks 5, 11, 17a, 17c, 18); §5.5 header and comparison (Tasks 8, 15); §5.6 checks, interactions, history and evidence (Tasks 2–4, 6, 15, 16); §5.7 decision bar states (Tasks 11, 17b, 17c, 18); §5.8 commit-delayed approval, in-batch links, unload, confirm step (Tasks 10, 12, 17c, 18); §5.9 auto-advance and the arrival guard (Tasks 11, 17c); §5.10 report and drafts (Tasks 11, 17a, 17c, 20); §5.11 stale, Reload record and back in review (Tasks 3, 10, 13, 15, 17c); §5.12 states, including the complete view on arrival (Tasks 14, 17c, 18); §5.13 roles and invites (Tasks 9, 22); §5.14 keyboard and settings (Tasks 9, 11, 14, 17a, 17c); §5.15 audit, with the web request id on flag rows (Tasks 1, 12, 19); §5.16 lists (Tasks 1, 19); §7.3 endpoints and the coverage `not_run` rule (Tasks 5, 6, 6b); §7.5 flag paging (Task 1); §2.3 redirects and gate, re-checked in each page (Tasks 14, 18; retired pages Task 20); §10.3–§10.6 forced colours, zoom, budgets (Task 21); §11 review suites (every task, e2e Task 21).
- **Placeholders.** None: every code step carries its code; the only conditional instructions (Task 20 Step 3) say which grep decides and what to do with each answer.
- **Type consistency.** `RecordRegistration` (with `complete`), `RowRef`, `ItemRow`, `ReviewItem`, `FlagPage`, `FlagPort` (with `requestId` and `excludeTargetId`), `DeskApi.navigate(href, focusKey?)`, `DESK`/`DESK_NEW` keys (`reviewLists.interactionCheck`; no `elsewhere*` keys) and the `recordHref`/`batchHref` signatures used in Tasks 17b–21 match their definitions in Tasks 1, 7, 9, 11 and 17a.
- **Review Focus.** Each of the five lines names its pinning test; Focus 1 is now pinned through the real desk (Task 17c `desk-flow.test.tsx`, "Turnstile at commit"), and the Task 18 test is `record-page.test.tsx` "a removed or unknown record goes back to the batch, never a decision bar (Review Focus 4)".
- **Cross-plan reconciliation with the final P0 and P1A.** Task 14's root layout imports `ONEST_URL` from `@/lib/fonts` and exports only `default` and `metadata` (P1A's layout test pins it); its middleware insertions anchor on P1A's unchanged lines inside the renamed `handle`, and P1A's wrapper logs the new 308s and 307s (pinned in `middleware-review.test.ts`). Task 12's `runDecide` writes `decision_denied` itself (outcomes `captcha`, `forbidden`, `rate_limited`, `unauthenticated`; no target for unusable ids; an audit outage never changes the answer) and both desk actions log one `action:decide` / `action:decide-form` line through `logRequest`. Task 13's route is `withRequestLog("/review/[batchId]/versions", handle)`. Task 19 keeps P1A's `logged("action:resolve", …)`; Task 20 deletes `reviewAction`, `submitReview`, `denyDecision`, `DeniedOutcome`, their tests and the `action:review` log expectation together, and `review-guards.test.ts` pins that. Task 9 imports or derives every `NEW_COPY` string (`DESK.tryAgain`, `cancel`, `promiseMarked`, `promiseIssueBody`, `issueOpen`, `workspaceLabel`, and Task 12's refusal key) and narrows P1A's guard only for values under 20 characters (so "Interaction check" never matches P0's "Interaction check failed" or P1A's ">Interaction checker<"); P0's `REVIEW_REFUSALS` key in `actions-core.ts` is rebuilt from `DESK_NEW` in Task 9 and deleted in Task 20, and the legacy pages that retype P1B values (`app/page.tsx`, `app/flags/page.tsx`, `app/batches/[id]/page.tsx`) are named in `LEGACY_EXEMPT`, the last two only until Task 20. Task 20's `/batches`-`/flags` guard allows `lib/request-log.ts`, whose legacy route templates the middleware's 308 log lines still use. Task 12's audit target is dropped when `batchId.length + conceptId.length` reaches 200 (P1A's `TARGET_ID_MAX`). Only `--w` and `--dur-commit` are JSX inline styles; `Wordmark` is used at size 17. The desk, LoadingPanes and the `/review/flags` status line announce through P1A's `lib/live-region.ts`. Task 7 consumes P0 Task 11's pinned helpers by their exact signatures. "Before you start" reads §1.6 items 5, 7, 10 and 11 from `main` (P0 Task 14 Step 7). P1B code never reads `/api/session`'s 401 codes, so P1A's `UNVERIFIED_EMAIL` | `STALE_SIGN_IN` | `INVALID_ID_TOKEN` split needs no change here.
