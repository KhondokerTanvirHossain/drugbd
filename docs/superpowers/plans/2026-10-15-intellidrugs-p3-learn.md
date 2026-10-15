# IntelliDrugs P3 Learn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Learn: ten server-rendered chapter pages under `/learn/[chapter]` that explain the model, the process, interactions, reviewing and the partner API, with live numbers from a new public `GET /v1/stats` endpoint, frozen worked examples from a labelled pilot snapshot that are withdrawn when a record has an issue or leaves the batch file, the glossary filter, the chapter nav and the "On this page" rail, and every §1.6 Learn correction applied.

**Architecture:** The Java API gains `GET /v1/stats` (hexagonal: controller → service → port → R2DBC adapter), which carries only counts and, per batch, each record's trade name, public status and `exampleUsable` flag (§7.4). The web reads it through `lib/api.ts` (`getStats()`, server-only) and validates it with pure helpers in `lib/stats.ts`. Learn content is TSX in `web/content/learn/{chapter}.tsx`; every pilot value comes from the typed snapshot `web/content/learn/pilot-snapshot.ts` and is drawn inside a `SnapshotBlock` keyed by the records it describes, which shows the live status pill and falls back to the §6.4 stub pattern when `/v1/stats` does not report the record as usable. The route `app/learn/[chapter]/page.tsx` renders `LearnShell` (sticky material toolbar, chapter nav, one reading column, rail, footer); the root layout leaves its own chrome out on Learn pages, as it already does on `/review/*`. Two islands from the §4.2 allowlist add the interactive parts: `GlossaryFilter` and `LearnRail` (scroll-spy, the narrow nav row's scroll-into-view and the chapter 8 example switch). Layout lives in two CSS Modules ported from Board L's second `<style>` block with the same values.

**Tech Stack:** Next.js 15.5 (app router, server components), React 19, TypeScript 5.7, CSS Modules, vitest 2.1 (+ jsdom 26, Testing Library 16), Playwright 1.64 with `@axe-core/playwright` 4.13, Lighthouse CI 0.15; Java 21 / Spring Boot 3.4 WebFlux + R2DBC, JUnit 5 + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md` as amended by Task 0 of this plan (P3 row of §12.2: §6.8 and the §1.6 Learn corrections, items 3–6 and 11–14; plus the §7.4 `GET /v1/stats` row, which the amended P3 row assigns to P3). Visual and string source: `docs/artifacts/2026-10-12-intellidrugs-learn.html` (Board L) with the §1.6 corrections applied. Cross-check source for the pilot values: Board R's embedded pilot export in `docs/artifacts/2026-10-12-intellidrugs-reviewer.html` (the same export P1B's e2e seed is built from).

**Depends on:** P0, P1A and P1B merged to `main`, as the amended §12.2 P3 row says ("Depends on: P0, P1A, P1B; builds the §7.4 `GET /v1/stats` row"). **Not** P2: the amended §12.1 lets phase 3 ship before phase 2, and this plan builds the one P2 piece Learn needs (`GET /v1/stats`) and depends on no other P2 component, route or endpoint. The spec on `main` says otherwise until Task 0 lands (§12.2: "may not change a Decision here without amending this spec first"), so Task 0 is the first commit on the branch.

**Note for executors:** `next build` type-checks every file `web/tsconfig.json` includes (`**/*.ts`, `**/*.tsx`, so `tests/`, `e2e/` and `content/` too). `web/tsconfig.json` targets `es2016`: a regular expression must not use the `s` flag (write `[\s\S]` instead). In JSX text, `{` `}` `<` `>` must be escaped; quotes and apostrophes need no escaping (the repo has no ESLint `react/no-unescaped-entities` rule).

**Branch:** `feature/intellidrugs-p3-learn` from `main` after P1B has merged. P3 is the whole of phase 3 (§12.1), and the amended §12.3 (Task 0) lists P3 with P0 and P1A as a plan that may merge to `main` on its own; merging deploys.

## Global Constraints

Copied from the spec unless marked *P3 adaptation*. Every task's requirements include this section.

- "**Decision: one route per Learn chapter, not one long page.** Each chapter loads on its own, which keeps page weight down on slow connections. The chapter nav becomes links with `aria-current="page"`. The "On this page" rail lists that chapter's sections." (§2.1)
- Routes (§2.1): "`/learn` | Redirects 307 to `/learn/start`"; "`/learn/[chapter]` | One Learn chapter. `chapter` ∈ `start`, `model`, `codes`, `process`, `why`, `interactions`, `reviewers`, `partners`, `glossary`, `faq` | server | everyone".
- "**Decision: public routes always read with public scope.** `/`, `/search`, `/products/*`, `/substances/*`, `/check`, `/check/suggest`, `/partners`, `/learn/*` and `/privacy` call the API with `scope=public` whatever the session" (§2.2). Learn sends no internal token.
- G3: "nothing is public until a pharmacist approves it. The single exception is Learn's frozen, labelled explanatory examples (§6.8), which offer no search, check or link into unreviewed records" (§1.2).
- "Where a board and this spec disagree, this spec wins only in the cases listed in §1.6 … Everywhere else the boards win. Any string shown in "quotes" or a code block below must be used verbatim" (spec preamble). Learn's fixed text is "copied from Board L, with the corrections in §1.6" (§6.8).
- "`$WEB/styles/tokens.css` is a byte-identical copy of `docs/design/intellidrugs/tokens.css`." "Page and component layout lives in CSS Modules (`*.module.css`). Modules use tokens only, never raw colour values." "Layout rules that the boards define in their second `<style>` block (`.pg`, `.app`, `.panes`, `.d-…`, `.s-…`, `.d-shell`, and so on) are ported into modules with the same values." (§3.1)
- "Remove every inline `style={{…}}` object in `$WEB`. The only allowed inline styles are CSS custom properties: a measured value (for example `--w: 40%` on progress meters), and `--dur-commit` on the desk toast" (§3.1). Learn's proportional severity bar uses `--w`; Board L's other inline styles become module classes.
- Theme: "**Placement:** … the Learn toolbar (per Board L)" (§3.3); the ThemeSwitch island is reused as is.
- §3.4 component contract: Learn renders severity with `Severity`, review status with `ReviewStatus`, no-data with `NoDataBlock`/`NoDataChip`, stage cards with `StageCheck`, relation labels with `MatchRelation`, codes with `CodeChip`, keys with `Kbd`, banners with `Banner`, DDInter pair text with `PairCard`, and "Example" with `ExampleMarker` ("Allowed only in Learn and on the landing page's partner code sample").
- "Green (`--ok`, `.rv--approved`) means "approved by a pharmacist" and nothing else. The hatch (`NoDataBlock`, `NoDataChip`) means "no interaction data" (coverage `none`) and nothing else. … Square chips mean severity. Rounded pills mean review status. Translucent material (`.material`, `.decision-bar`) is used only on the toolbar, the sidebar and the decision bar." (§3.4)
- `ReviewStatus` "`compact` is allowed only in the reviewer record list." Learn uses full pills only (Board L's nav note draws a compact pill; §3.4 wins).
- Voice (§3.5): "Never write a bare "Something went wrong"." "**Dates follow Bangladesh conventions.**" "**Em dash.** The only em dash in the product is in the stale-page title. Ranges and "drug–drug" use an en dash."
- "Each is rendered from its constant, never retyped" for `NO_DATA_SENTENCE`, `NOT_REVIEWED`, `SEVERITY_NOT_CLASSIFIED`, `UNKNOWN_PAIR_LINE`, `UNKNOWN_PAIRS_LINE` and `NOT_RUN` (§3.6). New copy (§1.7) lives in `NEW_COPY`; Learn's row is "Learn: snapshot-value date suffix "as stored on {date}"".
- "Every route is an async server component with `dynamic = "force-dynamic"`. Data is fetched on the server from the internal API." (§4.1)
- Islands (§4.2, the complete allowlist; P3 adds no island): "GlossaryFilter | `components/learn/GlossaryFilter.tsx` | Live filter with a debounced count | none (filters the server-rendered list in the DOM)"; "LearnRail | `components/learn/LearnRail.tsx` | Scroll-spy `aria-current` on "On this page"; scrolls the current chapter into view in the narrow nav; drives chapter 8's `.seg` example switches | none" (the row as amended by Task 0); "Expander | `components/Expander.tsx` | Line clamp toggle | … Public and Learn (Boards P and L): "Show full text" / "Show less". Without JS the text renders unclamped."
- Progressive enhancement (§4.4): "Search, product, substance, Learn | Full | Same, plus Expander and the glossary filter".
- §6.8 (verbatim bullets): "sticky material toolbar (with `scroll-padding-top` on `html` set to its height, §6.1): "Skip to content" link, lockup ("IntelliDrugs Learn, back to top" becomes "IntelliDrugs Learn" linking to `/learn/start`), "drugdb.eliooo.org", ThemeSwitch"; "chapter nav sidebar: "Learn IntelliDrugs", a numbered list of the 10 chapters with `aria-current="page"`, and a nav note with the pilot status pill and "All {n} pilot records, batch `{id}`." (live)"; "one reading column, at most 860 px"; ""On this page" rail with LearnRail. Hidden below 1180 px."; "**Below 860 px** (Board L): the chapter nav becomes a sticky, horizontally scrolling row directly under the toolbar; the "Learn IntelliDrugs" heading and the nav note are hidden; the current chapter's link is scrolled into view on load; `scroll-padding-top` on `html` = toolbar height + nav row height (Board L: 116 px) … Below 640 px the "drugdb.eliooo.org" label is hidden. Below 380 px the lockup drops the icon (§3.4)."
- "**Headings (Decision).** … the hero (`<h1>` "Learn IntelliDrugs", the lede, the four facts and the status line) renders only on `/learn/start`. On every other chapter the chapter title is the `<h1>`, and that chapter's section headings move up one level, so §10.5 holds." (§6.8)
- "**Content source (Decision)**: chapter content is TSX in `$WEB/content/learn/{chapter}.tsx`. No MDX dependency; … SVG diagrams are inline React components with `role="img"`, `<title>` and `<desc>` copied verbatim; live numbers come from `GET /v1/stats` … the worked pilot examples … come from a typed snapshot, `$WEB/content/learn/pilot-snapshot.ts`, captured from the pilot after the §8 re-run." (§6.8)
- "**Snapshot values, not live** … the glossary pilot lines "Back in review", "Engineer checked", "Issue reported", "Review decision", "Re-run" and "Stage check", and the chapter 4 evidence table counts … Each is rendered from `pilot-snapshot.ts` and followed by "as stored on {date}" (the snapshot date)." (§6.8)
- "Every snapshot block carries its status pill." "**Status pills are live.** Each block's pill comes from `/v1/stats` at render time, not from the snapshot." "**Withdrawn examples (Decision).** When a snapshot block's record currently has an issue reported, or is removed from the batch file, the block is replaced at render time by the stub pattern (§6.4: trade name, `NOT_REVIEWED` pill, no clinical values)." "Learn never offers search, check or links into unreviewed records." (§6.8)
- Footer, verbatim from Board L (§6.8): "Sources: the DGDA register (OCL concepts), NLM RxNav, DDInter 2.0, and batch {id} as stored on {date}. Endpoint paths come from the API controllers; example response bodies are illustrative." then "Anything marked Example is an illustration, not a stored record, and carries no clinical meaning. IntelliDrugs is decision support and does not replace a clinician's judgement."
- "**Chapter 8 "For partners"**: the endpoint table and both example response bodies are regenerated from the controllers and the §7.4 shapes … The access column must match §2.2 … The "Public / Reviewer access" example switch uses the existing `.seg` buttons with `aria-pressed`. Without JavaScript both panels show, one after the other." (§6.8)
- Glossary (§6.8): "input with sr-only label "Filter the glossary" and placeholder "Filter terms, for example salt or DAR" (Board L). It matches the term, its definition and its pilot example, as a case-insensitive substring. Count "Showing all {n} terms" or "Showing {k} of {n} terms", updated 350 ms after typing stops (polite); empty: "No terms match." plus "Clear the filter", which empties the field and focuses it; Esc clears; without JavaScript the input is not rendered and all terms show." "**FAQ**: native `<details>`."
- `GET /v1/stats` (§7.4, verbatim): "`{registerProducts:39196, productsLoaded, substances, approvedProducts, inReviewProducts, batches:[{batchId, status, itemCount, approved, items:[{conceptId, tradeName, status:"approved"\|"not_reviewed", exampleUsable}]}]}`. `exampleUsable` is false when the item's `displayStatus` is `issue` or it is removed from the batch file … It carries no note, role, time or reason, the item's `status` stays `not_reviewed`, and `/v1/stats` carries no other review detail."
- §7.4 visibility rule: "a product is **public** only when its latest batch item has `review = 'ok'` and is not marked "removed from batch file"; … nothing else from an unapproved record is served: no clinical drug, substance, code, strength, severity, count or DDInter text."
- "Every change keeps the `ApiResponse` envelope and the error mapping in `ApiExceptionHandler`. New errors use the existing codes" (§7). "`displayStatus` … is implemented once, as `ApprovalRule.displayStatus(decisions, extractedAt)`, and computed for a whole batch with one decisions query (no N+1)." (§7.3)
- §10.1: "Skip links:" with the sub-item ""Skip to content" on every public page and in Learn;". §10.2: "One polite, `sr-only` live region per page (`aria-live="polite"`, `aria-atomic="true"`)." "Messages are set by clearing the region and writing after 60 ms." Other §10 rules: "Sticky public and Learn toolbars set `scroll-padding-top`"; "Public pages: no two-dimensional scrolling at 320 CSS px, except data tables in their own labelled, keyboard-scrollable regions (`tabindex="0"`, `role="region"`, `aria-label`)"; "Interactive targets are at least 24 × 24 px"; "One `<h1>` per page, with a heading order that has no skipped levels. Tables use `<th scope>` and a caption"; "Every SVG diagram has `role="img"`, `<title>` and `<desc>`."
- §10.6 budget row, verbatim: "`/learn/[chapter]` | ≤ 60 KB | ≤ 140 KB | ≤ 25 KB | same | ≤ 2.5 s" (HTML, JS (all, incl. Next runtime), CSS, Fonts "≤ 90 KB", LCP Slow 4G mobile; gzip, measured in CI on the production build). §10.6, verbatim: "Server: API p95 ≤ 300 ms per call (existing target). Page TTFB p75 ≤ 600 ms." "The web container stays at `mem_limit 256m`." Every Learn render waits on one `GET /v1/stats` call, so both apply to it.
- §11.1: "Learn snapshot | `learn-snapshot.test.ts` | Counts are consistent; the 28-pair totals (§1.6 item 5) and the chapter 6 and glossary counts (§1.6 item 11); every snapshot-only value listed in §6.8 is present and dated." §11.2: "Learn chapter 8: both example bodies match the §7.4 shapes (no `reviewStatus`; `notReviewed[]` with `tradeName`); the `/learn/start` hero is the only `<h1>` "Learn IntelliDrugs""; "the Learn snapshot block withdrawn when `exampleUsable` is false". §11.4: "Learn below 860 px: the chapter nav is a sticky horizontal row and a focused heading is not covered by it."
- "**Decision: no runtime feature flags.**" (§12.3) The schema stays at `db-schema-v1.1`; P3 adds no migration. "These stay unchanged …: the compose project `bddrug`; image names …; the database name; the Java package and the ETL package." (§9.8)
- *P3 adaptation (P2 not built):* this plan builds `GET /v1/stats` exactly as the §7.4 row defines it, so P2 later reuses it unchanged. No Learn page imports a P2 module, calls a P2 endpoint, or links to a P2 route (`/search`, `/partners`, `/privacy`, `/check/suggest`). Learn's cross-references stay inside Learn (`/learn/{chapter}` and in-page `#section` anchors); the one new link into Learn from the existing site is a "Learn" link (`/learn`) in the current header, which §6.1's nav also carries. Chapter 8's endpoint table lists the controllers on `main` (plus `/v1/stats`); its example bodies follow the §7.4 shapes the spec pins, under Board L's "illustrative" banner and footer.
- *P3 adaptation (before P2, Decision recorded by Task 0 in §6.8):* §1.6 item 13's chapter 1 sentence "The API returns the same thing: the id, trade name, status "not_reviewed" and hidden: true." describes the §7.4 hidden stub, which P2 ships; on `main` the API still answers `{conceptId, tradeName, reviewStatus, hidden: true}` (`HiddenRecord.Product`) and `notReviewed[]` carries only `conceptId`. Learn renders that sentence, and chapter 8's caption of the public product body, only when `LearnContext.apiStub` is true; `API_STUB_SHAPE` (Task 5) is false in P3 and a test pins it to `HiddenRecord.java`, so P2's change to the stub fails that test until someone turns the sentences on. Chapter 8's example bodies and its safety-fields row describe the §7.4 contract under Board L's "illustrative" banner.
- *P3 adaptation (where Learn's content guard lives):* P1A's copy, mark, inline-style and client-island guards scan `app/`, `components/` and `lib/`; Task 3 extends all four to `content/`, so Learn content is held to the same rules.
- *P3 rule (Decision recorded by Task 0 in §6.8):* a sentence that states a pilot record's approval state ("Napa is not approved yet", "All three records are …", "None of the three is approved", "Every pilot record is …", "What a public visitor sees for Napa today") renders only while `/v1/stats` says it is true, never from a hard-coded assumption.
- Healthcare data (CLAUDE.md): never log PHI or reviewer emails. `/v1/stats` never carries an email, a note, a role or a time. Learn never says decision history is public: `GET /v1/batches/{b}/items/{c}/decisions` needs the internal token and includes reviewer emails (§7.1 A2).
- Shared host (§12.4): "The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted." "The `drugdb.eliooo.org` Caddy block is unchanged". P3 changes no file under `deploy/` and nothing in `~/n8n/Caddyfile`.
- Request log line (P1A Task 25): route handlers are wrapped with `withRequestLog`; P3 adds no route handler (both Learn routes are pages).
- Layout files export only the default component and `metadata`; `ONEST_URL` comes from `@/lib/fonts`.
- Commits: `type(scope): description`, scope one of `api`, `web`, `deploy`, `docs`; every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Test-first in every task.

## Review Focus

Five inputs the spec implies but its listed tests do not exercise, most likely to bite a reader first. Each is pinned by a test in the task named.

1. **`/v1/stats` is down, slow or answers a malformed body.** Learn must fail closed: no chapter body and no frozen example renders without its live `exampleUsable` check, and nothing falls back to the snapshot's own statuses. The reader still gets the Learn shell (skip link, toolbar, chapter nav, one `<main>` with the chapter's `<h1>`) and Task 0's "Couldn't load this chapter." banner with "Try again", never Next's bare "Application error" page (§3.5: "Never write a bare "Something went wrong"."). A body with a missing field, a wrong type or an unknown status is refused, never half-read. Pinned in Task 2 (`learn-stats.test.ts`, "refuses a body with a missing or mistyped field") and Task 13b (`learn-page.test.tsx`, "a failed stats read renders the shell and the banner, and no chapter").
2. **A pilot record that `/v1/stats` does not report** (the batch was renamed, the record left the stats, or only another batch is listed). Its examples must be withdrawn to the stub, exactly as for an issue, never shown because nothing said otherwise. Pinned in Task 5 (`learn-parts.test.tsx`, "a record /v1/stats does not report withdraws its block").
3. **A glossary filter typed with regular-expression or SQL characters, mixed case, surrounding spaces or an en dash** (`.*`, `(`, `%`, `  SALT `, `drug–drug`). The filter is a literal, case-insensitive substring of term, definition and example: no exception, no match-everything, and surrounding spaces ignored. Pinned in Task 12 (`glossary-filter.test.tsx`, "treats the query as literal text").
4. **A chapter URL that is almost right** (`/learn/Start`, `/learn/START`, `/learn/start%20`, `/learn/start.html`, `/learn/glossary/extra`). It must answer 404 inside the normal site chrome, never 500 and never an empty Learn shell. (`/learn/%2e%2e` is not one of them: the URL parser turns it into `/` before any request is sent.) Pinned in Task 13b (`learn-page.test.tsx`, "only the ten exact slugs render a chapter"; `surface.test.ts`, "isLearnSurface accepts the ten exact chapter paths only") and Task 14 (`learn.spec.ts`, "an almost-right chapter URL is a 404").
5. **Pilot records approved after the snapshot was taken.** Pills must turn to "Approved by a pharmacist" from `/v1/stats`; the hero must read "{a} of {n}" and drop "Nothing from the pilot is public yet." once the pilot batch has an approval (not when some other batch does); and every sentence that states the pilot's approval state (chapter 1's public card and its `aria-label`, chapter 6's worked-check banner, chapter 8's public captions, the FAQ's Napa answer) disappears once it is false, while the snapshot's frozen values stay as stored. Pinned in Task 6 (`learn-start.test.tsx`, "follows live approvals, never the snapshot"), Task 9 (`learn-why-interactions.test.tsx`, "the worked-check banner only while all three are not reviewed"), Task 11 (`learn-partners.test.tsx`, "the public captions only while they are true") and Task 12 (`learn-glossary-faq.test.tsx`, "the Napa answer only while no pilot record is approved").

---

## Before you start

- [ ] Branch from `main` once P1B has merged (the branch may already exist locally, so switch to it and rebase, or create it):

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
git fetch origin
git switch main && git pull --ff-only
test -f web/components/review/ReviewDesk.tsx && test -f web/app/review/flags/page.tsx && echo "P1B is on main"
git switch feature/intellidrugs-p3-learn 2>/dev/null && git rebase origin/main || git switch -c feature/intellidrugs-p3-learn origin/main
```

Expected: `P1B is on main`, then the branch checked out on top of `origin/main`. If either file is missing, P1B has not merged: stop.

- [ ] Commit this plan on the branch, so the plan the commits cite is in the history:

```bash
git add docs/superpowers/plans/2026-10-15-intellidrugs-p3-learn.md
git commit -m "docs(web): IntelliDrugs P3 Learn implementation plan" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] Confirm the P0, P1A and P1B names this plan builds on (each command prints at least one line; alternations use `grep -E`, because some shells wrap `grep` in a tool that rejects the BRE `\|`):

```bash
grep -n "public static String displayStatus" api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java
grep -n "static final String REMOVED_NOTE" api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java
grep -n "static String statusOf" api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java
grep -n "public boolean present" api/src/main/java/com/niramoy/bddrug/presentation/InternalAuth.java
grep -n "static void migrateAndSeed" api/src/test/java/com/niramoy/bddrug/PilotSeed.java
grep -nE "components/learn/GlossaryFilter.tsx|components/learn/LearnRail.tsx" web/scripts/check-client-islands.mjs
grep -nF 'const SCAN = ["app", "components", "lib"]' web/scripts/check-client-islands.mjs
grep -nF "record Product(String conceptId, String tradeName, String reviewStatus)" api/src/main/java/com/niramoy/bddrug/domain/HiddenRecord.java
grep -n "learnSnapshotDate" web/lib/copy.ts
grep -n "export function fill" web/lib/copy.ts
grep -n "export function announce" web/lib/live-region.ts
grep -n "export function fmtUtc" web/lib/format.ts
grep -n "export function isReviewSurface" web/lib/surface.ts
grep -n "x-pathname" web/lib/security-headers.ts web/app/layout.tsx
grep -n "export const MATERIAL_ALLOWED" web/tests/marks.test.ts
grep -n "const scanned = ()" web/tests/copy.test.ts
grep -n "export default function PairCard" web/components/ui/PairCard.tsx
grep -n "export default function ThemeSwitch" web/components/ThemeSwitch.tsx
grep -nE "export async function signInAs|export const BASE_URL" web/e2e/session.ts
grep -n "public record ReviewerDecision" api/src/main/java/com/niramoy/bddrug/presentation/ReviewController.java
grep -n "undoLabel" web/lib/copy.ts
grep -n "lighthouserc.review.json" .github/workflows/ci.yml
```

- [ ] Read the spec's §1.6 on `main`. If a docs PR (`docs(etl): pilot triage counts from the production re-run`, P0 Task 14 Step 7) changed items 5, 7 or 11, the values in Task 4's snapshot and in every Learn test that quotes them take `main`'s values, never this plan's:

```bash
git show origin/main:docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md | sed -n '/^### 1.6/,/^### 1.7/p' | sed -n '/^5\./p;/^7\./,/^8\./p;/^11\./,/^12\./p'
```

Expected (the values this plan uses): item 5 "28 pairs, Major 4, Moderate 6, Minor 2, Severity not classified by DDInter 16"; item 7's ten row hints (Amlodipine-5 4 pairs, Aspirin 5, Simvastatin 4, Chloramphenicol "All checks OK", Domperidone "No DDInter data", G Warfarin 1, G-Metformin 5, Napa 6, Clarith 2, Amoxycillin Clavulanic Acid 5); item 11 Synergy 3, Metabolism 6, Not given 16 and "9 of 10 records warned".

- [ ] Capture the snapshot facts the spec says are "as stored" (§6.8). Someone with host access runs this once from `~/drugdb/deploy` on the EC2 host. It reads the `bddrug` database through the existing `db` container of the `bddrug` compose project, inside a read-only transaction (`default_transaction_read_only=on`), and stops at the first error, so a mistyped edit cannot write:

```bash
cd ~/drugdb/deploy && docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d bddrug -At -F "|"' <<'SQL'
SELECT 'run_at', to_char(run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ops.batch WHERE batch_id = '0001-pilot'
UNION ALL SELECT 'batch_runs', count(*)::text FROM ops.batch_run WHERE batch_id = '0001-pilot'
UNION ALL SELECT 'last_run_dhaka', to_char(max(run_at) AT TIME ZONE 'Asia/Dhaka', 'DD/MM/YYYY') FROM ops.batch_run WHERE batch_id = '0001-pilot'
UNION ALL SELECT 'stage_results', count(*)::text FROM ops.stage_result WHERE batch_id = '0001-pilot'
UNION ALL SELECT 'ddinter_warn', count(*)::text FROM ops.stage_result
          WHERE batch_id = '0001-pilot' AND stage = 'ddinter' AND status = 'warn'
UNION ALL SELECT 'ocl_concepts', count(*)::text FROM raw.ocl_concept rc
          JOIN ops.batch_item bi ON bi.concept_id = rc.concept_id AND bi.batch_id = '0001-pilot'
UNION ALL SELECT 'g_warfarin_extracted', to_char(extracted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM ops.batch_item WHERE batch_id = '0001-pilot' AND concept_id = '185-0138-012--g-warfarin';
SQL
```

Expected output (the values Task 4 writes into `pilot-snapshot.ts`; every time carries an explicit `Z`, so it parses the same in any time zone):

```
run_at|2026-10-11T21:27:17.629Z
batch_runs|2
last_run_dhaka|13/10/2026
stage_results|40
ddinter_warn|9
ocl_concepts|10
g_warfarin_extracted|2026-10-1?T??:??:??.???Z
```

`g_warfarin_extracted` is the time of P0's ddinter-only re-run, not the first run: that re-run calls `reopen_review`, which re-stamps `extracted_at` with `clock_timestamp()` for every record it re-ran (`etl/src/bddrug_etl/load/batches.py`, spec §8.3). Expect a stamp dated 12 or 13 October 2026, after `run_at`; the plan cannot know its exact value.

Where a line differs, Task 4 uses the host's value instead: `run_at` → `runAt`; `batch_runs` → `evidence.batchRun` and `review.reruns` (= `batch_runs − 1`); `last_run_dhaka` → `storedOn` (the snapshot date the footer and every "as stored on" suffix print); `stage_results` → `evidence.stageResult`; `ocl_concepts` → `evidence.oclConcept`. `g_warfarin_extracted` is always a host value: Task 4 writes it into `warfarinExtractedAt` (the only extraction time Learn prints, in chapter 4). `evidence.reviewDecision` and the three review counts stay 0, because no review decision existed on the snapshot date. If `ddinter_warn` is not 9, §1.6 item 11 no longer matches production: stop and raise it with the product owner (the spec changes first). Nobody with host access: keep the plan's values for every other line, leave `warfarinExtractedAt` as `null` (chapter 4 then says "G Warfarin was extracted in batch 0001-pilot." with no date), and say so in the PR.

- [ ] Tooling and a green baseline (Docker must be running; API integration tests use Testcontainers):

```bash
(cd web && npm ci)
(cd api && ./gradlew test --no-daemon)
(cd web && API_URL=http://api:8080 npm test && npm run build)
```

Expected: every test passes; the build ends with `client island check: … all on the §4.2 allowlist`. On a red baseline, stop and report it.

## File Structure

```
docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md   MODIFY (Task 0) §1.7, §4.2, §6.8, §12.1–§12.3, §13.2

api/src/main/java/com/niramoy/bddrug/
  domain/SiteStats.java                          CREATE /v1/stats response records
  application/port/StatsQueryPort.java           CREATE totals, batches, items, decisions
  application/StatsQueryService.java             CREATE assembles SiteStats (exampleUsable via ApprovalRule.displayStatus)
  adapter/persistence/ReviewSql.java             MODIFY statusOf() skips a removed latest item; LATEST_PUBLIC: the §7.4
                                                        visibility rule once per product, as a CTE
  adapter/persistence/R2dbcStatsAdapter.java     CREATE four reads, no N+1, no correlated subquery per row
  presentation/StatsController.java              CREATE GET /v1/stats (public; a present token must match)
api/src/test/java/com/niramoy/bddrug/
  StatsQueryServiceTest.java                     CREATE pure assembly rules
  StatsApiIntegrationTest.java                   CREATE endpoint against Postgres
  StatsScaleIntegrationTest.java                 CREATE 5,000 items: p95 latency, body size, blank trade name
  VisibilityApiIntegrationTest.java              MODIFY /v1/stats row of the §11.3 matrix

web/
  lib/stats.ts                                   CREATE SiteStats types, parseStats(), lookup and pill helpers (client-safe)
  lib/api.ts                                     MODIFY getStats()
  lib/format.ts                                  MODIFY fmtDhakaClock()
  lib/copy.ts                                    MODIFY Learn row of NEW_COPY, LEARN_NEW, LEARN_BOARD
  lib/surface.ts                                 MODIFY isLearnSurface()
  content/learn/pilot-snapshot.ts                CREATE the typed pilot snapshot (§6.8)
  content/learn/chapters.ts                      CREATE chapter registry: slugs, numbers, titles, ledes, sections
  content/learn/start.tsx … faq.tsx              CREATE the ten chapters (start, model, codes, process, why,
                                                        interactions, reviewers, partners, glossary, faq)
  content/learn/index.ts                         CREATE CHAPTER_BODIES
  components/learn/context.ts                    CREATE LearnContext: stats, the withdrawal rule, API_STUB_SHAPE
  components/learn/parts.tsx                     CREATE Chapter, Section, SnapshotBlock, LivePill, BatchNote, AsStored, …
  components/learn/learn.module.css              CREATE Board L content layout, ported
  components/learn/diagrams.tsx                  CREATE the three inline SVG diagrams
  components/learn/LearnShell.tsx                CREATE toolbar, chapter nav, column, rail, footer, the one live
                                                        region; a stats-less form for the failure banner
  components/learn/LearnShell.module.css         CREATE Board L shell layout (.d-*), ported
  components/learn/LearnRail.tsx                 CREATE island: runs enhanceLearn()
  components/learn/enhance.ts                    CREATE scroll-spy, nav reveal, example switches (pure DOM)
  components/learn/GlossaryFilter.tsx            CREATE island: the glossary filter
  components/learn/glossary-filter.ts            CREATE pure matching and count text
  components/Header.tsx                          MODIFY "Learn" link
  app/layout.tsx                                 MODIFY no site chrome on Learn chapter pages
  app/learn/page.tsx                             CREATE 307 to /learn/start
  app/learn/[chapter]/page.tsx                   CREATE one chapter
  scripts/check-client-islands.mjs               MODIFY scan content/ too
  lighthouserc.learn.json                        CREATE §10.6 Learn budget
  e2e/learn.spec.ts                              CREATE Learn end to end, axe, reflow, zoom
  tests/learn-stats.test.ts                      CREATE
  tests/learn-snapshot.test.ts                   CREATE (§11.1)
  tests/fixtures/learn-stats.ts                  CREATE pilotStats() fixture
  tests/learn-parts.test.tsx                     CREATE
  tests/learn-start.test.tsx                     CREATE
  tests/learn-model-codes.test.tsx               CREATE
  tests/learn-process.test.tsx                   CREATE
  tests/learn-why-interactions.test.tsx          CREATE
  tests/learn-reviewers.test.tsx                 CREATE
  tests/learn-partners.test.tsx                  CREATE (§11.2 chapter 8)
  tests/learn-glossary-faq.test.tsx              CREATE
  tests/glossary-filter.test.tsx                 CREATE (jsdom)
  tests/learn-enhance.test.tsx                   CREATE (jsdom; renders <LearnRail />)
  tests/learn-shell.test.tsx                     CREATE
  tests/learn-page.test.tsx                      CREATE
  tests/learn-links.test.tsx                     CREATE G3: no link out of Learn into records
  tests/format.test.ts, copy.test.ts, marks.test.ts, inline-styles.test.ts, client-islands.test.ts,
  tests/surface.test.ts, header.test.tsx, layout.test.tsx   MODIFY
.github/workflows/ci.yml                         MODIFY Learn Lighthouse CI step
.gitignore                                       MODIFY web/.lighthouseci-learn/
```

Responsibilities: the snapshot module holds data and pure tallies only; `chapters.ts` holds names and section ids only (the middleware imports it through `lib/surface.ts`, so it has no JSX); each chapter file renders one chapter from the snapshot and the `LearnContext` it is given; `parts.tsx` holds the pieces every chapter shares, including the one place that decides whether a frozen example may show (`SnapshotBlock`).

---
### Task 0: Amend the spec — Learn (P3) ships before P2 and builds `GET /v1/stats`

§12.2 says a plan "may not change a Decision here without amending this spec first". On `main` the spec makes P3 depend on "P1A, and the §7.4 `/v1/stats` endpoint from P2", orders phase 2 before phase 3, and lets only P0 and P1A merge to `main` on their own. This plan does otherwise, so the spec changes first, in its own docs commit, before any code. The same commit records the Learn states the boards do not draw that this plan needs (the stats failure banner, the approval-state rule, the pre-P2 API sentences) and the LearnRail row as built.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md`

**Interfaces:**
- Produces: the amended §1.6 (item 16), §1.7 (row "Learn: chapter not shown because the live numbers did not load"), §4.2 (LearnRail row), §6.8 (three Decision bullets), §12.1, §12.2 (P2 and P3 rows), §12.3, §13.2 (D42 and D48). Task 3's `copy.test.ts` copies the new §1.7 row; Tasks 6, 9, 11, 12 and 13b implement the §6.8 bullets.

- [ ] **Step 1: Make the edits** (each `old` string occurs once in the spec; use the Edit tool)

1. §1.6, after item 15 (the line starting `15. **Board P strings changed by scope.**`), add:

```markdown
16. **Board L sentences the live system makes false.**
    - Chapter 6 "A worked check" banner: "All three records are not yet reviewed by a pharmacist." becomes "All three records are "Not yet reviewed by a pharmacist"." (§3.6: rendered from `NOT_REVIEWED`). The second sentence stays. The banner shows only while all three are not approved (§6.8 "Approval-state sentences").
    - Chapter 8 "Reviewer" access legend: "It never includes emails." becomes "Reviewer emails are never shown on public pages or in public API answers." Decision history needs the internal token and includes emails (§7.1 A2).
    - FAQ "Is my email shown to anyone?": "Public decision history shows the role, never the email." becomes "Decision history is served only to signed-in reviewers; public pages and the public API never show an email."
```

2. §1.7 table: after the row `| Learn: snapshot-value date suffix "as stored on {date}" | §6.8 |`, add the row

```markdown
| Learn: chapter not shown because the live numbers did not load | §6.8 |
```

3. §4.2, replace the LearnRail row

```markdown
| LearnRail | `components/learn/LearnRail.tsx` | Scroll-spy `aria-current` on "On this page" | none |
```

with

```markdown
| LearnRail | `components/learn/LearnRail.tsx` | Scroll-spy `aria-current` on "On this page"; scrolls the current chapter into view in the narrow nav; drives chapter 8's `.seg` example switches | none |
```

4. §6.8, append at the end of the section (directly before the `### 6.9 Partner access request (`/partners`)` heading, after the `- **FAQ**: native `<details>`.` line):

```markdown
- **Stats unavailable (Decision).** When `GET /v1/stats` fails or answers a malformed body, `/learn/{chapter}` renders no chapter body and no snapshot block. It renders the shell (skip link, toolbar, chapter nav without the nav note, no rail, the footer), the chapter title as the page's `<h1>`, and a `crit` banner: title "Couldn't load this chapter.", body "The live pilot numbers did not load, so no example is shown. Nothing was changed.", and a link "Try again" to the same chapter.
- **Approval-state sentences (Decision).** A Board L sentence that states a pilot record's approval state renders only while `/v1/stats` says it is true: chapter 1's public card (with its `aria-label`, its caption and the sentence that points to it), chapter 6's worked-check banner, chapter 8's captions under the public example bodies, and the FAQ's "Why can't I see Napa on the public site?". Once it is false the sentence is left out; no replacement copy is shown.
- **Before P2 (Decision).** §1.6 item 13's chapter 1 sentence "The API returns the same thing: the id, trade name, status "not_reviewed" and hidden: true." and chapter 8's caption under the public product body describe the §7.4 hidden stub, which P2 ships. Learn renders them only once `GET /v1/products/{id}` serves that shape (a web test reads `HiddenRecord.java`, so P2's change cannot go unnoticed). Chapter 8's example bodies and its safety-fields row describe the §7.4 contract under Board L's "illustrative" banner.
```

5. §12.1, directly under the phase table (before the paragraph starting `The pharmacist reviews the pilot in phase 1`), add:

```markdown
Phase 3 may ship before phase 2 (amended 15/10/2026): P3 builds the §7.4 `GET /v1/stats` row itself and uses no other phase-2 component, route or endpoint.
```

6. §12.2 table: in the P2 row, replace

```markdown
§6.1–§6.7, §6.9, §7.4, the `/?q=` redirect
```

with

```markdown
§6.1–§6.7, §6.9, §7.4 (reusing `GET /v1/stats` from P3, and switching every public adapter to the one §7.4 rule), the `/?q=` redirect
```

and replace the P3 row

```markdown
| **P3 Learn** | 3 | §6.8 and the §1.6 Learn corrections | P1A, and the §7.4 `/v1/stats` endpoint from P2 |
```

with

```markdown
| **P3 Learn** | 3 | §6.8, the §1.6 Learn corrections, and the §7.4 `GET /v1/stats` row | P0, P1A, P1B; builds the §7.4 `GET /v1/stats` row |
```

7. §12.3: replace

```markdown
P0 and P1A are the exceptions that may merge to `main` on their own, because each is a complete release (§12.2).
```

with

```markdown
P0, P1A and P3 are the exceptions that may merge to `main` on their own, because each is a complete release (§12.2; P3 is the whole of phase 3).
```

8. §13.2: in the D42 row, replace `(and P0, P1A)` with `(and P0, P1A, P3)`. After the D47 row, add:

```markdown
| D48 | Learn (P3) ships before the public surfaces (P2): P3 builds `GET /v1/stats` and depends on P0, P1A and P1B; until P2 serves the §7.4 hidden stub, Learn leaves out the sentences that describe it; a failed stats read shows a banner inside the Learn shell, never a chapter | §6.8, §7.4, §12.1–§12.3 |
```

- [ ] **Step 2: Check every edit landed**

```bash
S=docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md
grep -c "Phase 3 may ship before phase 2" $S
grep -c "P0, P1A, P1B; builds the §7.4" $S
grep -c "P0, P1A and P3 are the exceptions" $S
grep -c "| D48 |" $S
grep -c "Learn: chapter not shown because the live numbers did not load" $S
grep -c "Stats unavailable (Decision)" $S
grep -c "drives chapter 8's" $S
grep -c "^16\. \*\*Board L sentences the live system makes false" $S
```

Expected: `1` from every line.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md
git commit -m "docs(web): spec §12 — Learn (P3) ships before P2; P3 builds GET /v1/stats" \
  -m "Also records the Learn states P3 needs (§1.6 item 16, the §1.7 stats-failure row, the §6.8 approval-state and pre-P2 rules) and the LearnRail row as built (§4.2)." \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 1: API `GET /v1/stats` (§7.4)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/SiteStats.java`, `api/src/main/java/com/niramoy/bddrug/application/port/StatsQueryPort.java`, `api/src/main/java/com/niramoy/bddrug/application/StatsQueryService.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcStatsAdapter.java`, `api/src/main/java/com/niramoy/bddrug/presentation/StatsController.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java`, `api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java`
- Test: `api/src/test/java/com/niramoy/bddrug/StatsQueryServiceTest.java`, `api/src/test/java/com/niramoy/bddrug/StatsApiIntegrationTest.java`, `api/src/test/java/com/niramoy/bddrug/StatsScaleIntegrationTest.java`

**Interfaces:**
- Consumes: `ApprovalRule.displayStatus(List<ReviewDecision>, Instant, String)` and `ApprovalRule.ISSUE` (P0/P1B); `ReviewDecision(long id, String decision, String note, String reviewerEmail, String reviewerRole, Instant decidedAt)`; `ReviewSql.REMOVED_NOTE`, `ReviewSql.CURRENT_ITEM` (alias `bi`); `InternalAuth.present(String)`; `ApiResponse.ok(T)`; `PilotSeed.migrateAndSeed`, `TestSupport` (existing).
- Produces: `GET /v1/stats` → 200 `ApiResponse<SiteStats>` with `data = {registerProducts: 39196, productsLoaded, substances, approvedProducts, inReviewProducts, batches: [{batchId, status: "in_review"|"approved"|"rejected", itemCount, approved, items: [{conceptId, tradeName, status: "approved"|"not_reviewed", exampleUsable}]}]}`; batches newest run first, items by concept id (`COLLATE "C"`); `itemCount` and `approved` count items still in the batch file, `items` also lists removed ones (with `exampleUsable: false`). No token needed; a present but wrong `X-Internal-Token` is 401. Definitions: `productsLoaded` = rows of `curated.brand_product`; `substances` = rows of `curated.substance`; `approvedProducts` = products passing the §7.4 rule; `inReviewProducts` = distinct products with an item still in the file of an `in_review` batch that are not public; `status` = `approved` exactly when the product is public; a blank trade name is reported as the concept id. `ReviewSql.LATEST_PUBLIC` (package-private SQL: the CTE `latest(concept_id, pub)`, one row per product, `pub` = the §7.4 rule) and `ReviewSql.statusOf(...)` now return `'pending'` when the product's latest item is removed from the batch file, so the product, substance and checker adapters on `main` and `/v1/stats` apply one rule (§6.4: "A removed product is never counted as approved anywhere"). A removed product therefore gets the existing hidden stub under public scope; the §6.4 "removed" stub status and the §7.4 stub shape remain P2's. P2 reuses this endpoint unchanged.

- [ ] **Step 1: Write the failing unit test for the assembly rules**

Create `api/src/test/java/com/niramoy/bddrug/StatsQueryServiceTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.application.StatsQueryService;
import com.niramoy.bddrug.application.port.StatsQueryPort.BatchRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.DecisionRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.ItemRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.Totals;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SiteStats;
import com.niramoy.bddrug.domain.SiteStats.BatchStats;
import com.niramoy.bddrug.domain.SiteStats.ItemStats;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** The pure §7.4 assembly: exampleUsable, the counts that skip removed items, and the batch order. */
class StatsQueryServiceTest {
    private static final Instant RUN = Instant.parse("2026-10-11T21:28:00Z");
    private static final Totals TOTALS = new Totals(10, 11, 1, 9);

    private static ItemRow item(String batch, String concept, String review, boolean removed, boolean productPublic) {
        return new ItemRow(batch, concept, "Trade " + concept, review, RUN, removed, productPublic);
    }

    private static DecisionRow decision(String batch, String concept, long id, String d, String role, Instant at) {
        return new DecisionRow(batch, concept, new ReviewDecision(id, d, null, null, role, at));
    }

    @Test void exampleUsableFollowsTheDisplayStatusAndTheBatchFile() {
        SiteStats s = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("B", "in_review")), List.of(
                item("B", "a", "pending", false, false),   // nothing decided: usable
                item("B", "b", "issue", false, false),     // a reviewer reported an issue after the run: withdrawn
                item("B", "c", "issue", false, false),     // the pipeline's own issue (no decision): display status pending, usable
                item("B", "d", "ok", true, false),         // removed from the batch file: withdrawn
                item("B", "e", "pending", false, false),   // an issue before the latest run no longer counts: usable
                item("B", "f", "ok", false, true)),        // approved and public
            List.of(decision("B", "b", 1, "issue", "pharmacist", RUN.plusSeconds(60)),
                    decision("B", "e", 2, "issue", "engineer", RUN.minusSeconds(60)),
                    decision("B", "f", 3, "ok", "pharmacist", RUN.plusSeconds(60))));
        List<ItemStats> items = s.batches().get(0).items();
        assertThat(items).extracting(ItemStats::conceptId).containsExactly("a", "b", "c", "d", "e", "f");
        assertThat(items).extracting(ItemStats::exampleUsable).containsExactly(true, false, true, false, true, true);
        assertThat(items).extracting(ItemStats::status)
            .containsExactly("not_reviewed", "not_reviewed", "not_reviewed", "not_reviewed", "not_reviewed", "approved");
        assertThat(items).extracting(ItemStats::tradeName).startsWith("Trade a");
    }

    @Test void countsOnlyItemsStillInTheBatchFile() {
        BatchStats b = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("B", "in_review")), List.of(
                item("B", "a", "ok", false, true), item("B", "b", "ok", true, true), item("B", "c", "pending", false, false)),
            List.of()).batches().get(0);
        assertThat(b.itemCount()).isEqualTo(2);
        assertThat(b.approved()).isEqualTo(1);
        assertThat(b.items()).hasSize(3);
    }

    @Test void aDecisionOnTheSameRecordInAnotherBatchDoesNotWithdrawIt() {
        SiteStats s = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("X", "in_review"), new BatchRow("Y", "in_review")),
            List.of(item("X", "a", "pending", false, false), item("Y", "a", "issue", false, false)),
            List.of(decision("Y", "a", 1, "issue", "pharmacist", RUN.plusSeconds(60))));
        assertThat(s.batches().get(0).items().get(0).exampleUsable()).isTrue();
        assertThat(s.batches().get(1).items().get(0).exampleUsable()).isFalse();
    }

    @Test void keepsTheBatchOrderListsAnEmptyBatchAndCarriesTheTotals() {
        SiteStats s = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("new", "in_review"), new BatchRow("old", "approved")),
            List.of(item("old", "a", "ok", false, true)), List.of());
        assertThat(s.batches()).extracting(BatchStats::batchId).containsExactly("new", "old");
        assertThat(s.batches().get(0).items()).isEmpty();
        assertThat(s.batches().get(0).itemCount()).isZero();
        assertThat(s.batches().get(1).status()).isEqualTo("approved");
        assertThat(s.registerProducts()).isEqualTo(39196);
        assertThat(List.of(s.productsLoaded(), s.substances(), s.approvedProducts(), s.inReviewProducts())).containsExactly(10L, 11L, 1L, 9L);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --tests 'com.niramoy.bddrug.StatsQueryServiceTest' --no-daemon`
Expected: FAIL at compile time: `cannot find symbol … StatsQueryService` and `package com.niramoy.bddrug.application.port.StatsQueryPort does not exist`.

- [ ] **Step 3: Write the domain records, the port and the service**

`api/src/main/java/com/niramoy/bddrug/domain/SiteStats.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * GET /v1/stats (spec §7.4): public counts, and per batch each record's trade name, public status and whether Learn may
 * still show its frozen example (§6.8). Deliberately coarse (D43): no note, role, time, reason, email or clinical value.
 */
public record SiteStats(int registerProducts, long productsLoaded, long substances, long approvedProducts,
                        long inReviewProducts, List<BatchStats> batches) {
    /** Products in the official DGDA register (source date 27/03/2026; spec §6.1 stats band). */
    public static final int REGISTER_PRODUCTS = 39196;
    public static final String APPROVED = "approved", NOT_REVIEWED = "not_reviewed";

    /** {@code itemCount} and {@code approved} count the items still in the batch file; {@code items} also lists removed ones. */
    public record BatchStats(String batchId, String status, int itemCount, int approved, List<ItemStats> items) {}

    /** {@code status}: "approved" when the product passes the §7.4 visibility rule, otherwise "not_reviewed". */
    public record ItemStats(String conceptId, String tradeName, String status, boolean exampleUsable) {}
}
```

`api/src/main/java/com/niramoy/bddrug/application/port/StatsQueryPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;

/** Reads for GET /v1/stats: four queries whatever the number of batches (no N+1, spec §7.3). */
public interface StatsQueryPort {
    record Totals(long productsLoaded, long substances, long approvedProducts, long inReviewProducts) {}
    record BatchRow(String batchId, String status) {}
    /** One batch item. {@code productPublic}: the product's latest item is ok and not removed from the batch file (§7.4). */
    record ItemRow(String batchId, String conceptId, String tradeName, String review, Instant extractedAt,
                   boolean removed, boolean productPublic) {}
    /** A decision without its note or email: the stats need only the decision, the role and the time. */
    record DecisionRow(String batchId, String conceptId, ReviewDecision decision) {}

    Mono<Totals> totals();
    /** Newest run first. */
    Flux<BatchRow> batches();
    /** By batch, then concept id (COLLATE "C"). */
    Flux<ItemRow> items();
    /** Oldest first. */
    Flux<DecisionRow> decisions();
}
```

`api/src/main/java/com/niramoy/bddrug/application/StatsQueryService.java`:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.StatsQueryPort;
import com.niramoy.bddrug.application.port.StatsQueryPort.BatchRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.DecisionRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.ItemRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.Totals;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SiteStats;
import com.niramoy.bddrug.domain.SiteStats.BatchStats;
import com.niramoy.bddrug.domain.SiteStats.ItemStats;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** GET /v1/stats (spec §7.4). The landing page (P2) and Learn (P3) read it with public scope. */
@Service
public class StatsQueryService {
    private final StatsQueryPort port;
    public StatsQueryService(StatsQueryPort port) { this.port = port; }

    public Mono<SiteStats> stats() {
        return Mono.zip(port.totals(), port.batches().collectList(), port.items().collectList(), port.decisions().collectList())
            .map(t -> assemble(t.getT1(), t.getT2(), t.getT3(), t.getT4()));
    }

    private static String key(String batchId, String conceptId) { return batchId + "\u0000" + conceptId; }

    /**
     * Pure. {@code exampleUsable} is false when the item is removed from the batch file or its display status (§5.2,
     * {@link ApprovalRule#displayStatus}) is issue; Learn withdraws such an example (§6.8).
     */
    public static SiteStats assemble(Totals totals, List<BatchRow> batches, List<ItemRow> items, List<DecisionRow> decisions) {
        Map<String, List<ReviewDecision>> byItem = new HashMap<>();
        for (DecisionRow d : decisions) byItem.computeIfAbsent(key(d.batchId(), d.conceptId()), k -> new ArrayList<>()).add(d.decision());
        Map<String, List<ItemRow>> byBatch = new LinkedHashMap<>();
        for (ItemRow i : items) byBatch.computeIfAbsent(i.batchId(), k -> new ArrayList<>()).add(i);
        List<BatchStats> out = new ArrayList<>();
        for (BatchRow b : batches) {
            List<ItemRow> rows = byBatch.getOrDefault(b.batchId(), List.of());
            List<ItemStats> listed = rows.stream().map(i -> new ItemStats(i.conceptId(), i.tradeName(),
                i.productPublic() ? SiteStats.APPROVED : SiteStats.NOT_REVIEWED,
                !i.removed() && !ApprovalRule.ISSUE.equals(ApprovalRule.displayStatus(
                    byItem.getOrDefault(key(i.batchId(), i.conceptId()), List.of()), i.extractedAt(), i.review())))).toList();
            int current = (int) rows.stream().filter(i -> !i.removed()).count();
            int approved = (int) rows.stream().filter(i -> !i.removed() && i.productPublic()).count();
            out.add(new BatchStats(b.batchId(), b.status(), current, approved, listed));
        }
        return new SiteStats(SiteStats.REGISTER_PRODUCTS, totals.productsLoaded(), totals.substances(), totals.approvedProducts(),
            totals.inReviewProducts(), List.copyOf(out));
    }
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd api && ./gradlew test --tests 'com.niramoy.bddrug.StatsQueryServiceTest' --no-daemon`
Expected: `BUILD SUCCESSFUL`, 4 tests pass.

- [ ] **Step 5: Write the failing integration test**

Create `api/src/test/java/com/niramoy/bddrug/StatsApiIntegrationTest.java`:

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
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * GET /v1/stats against Postgres. Batch S-1 (in review): W-1 ok, A-1 pending, C-EYE issue reported by a pharmacist,
 * D-1 issue set by the pipeline (no decision), N-1 ok but removed from the batch file. Batch S-old (approved): W-2 ok.
 * Public products: W-1 and W-2 (N-1's latest item is removed, so it is not public).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class StatsApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('S-old','approved',1, now() - interval '3 hour'), ('S-1','in_review',5, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('S-old','DGDA-Drugs','W-2','ok',NULL, now() - interval '3 hour'),
             ('S-1','DGDA-Drugs','W-1','ok',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','A-1','pending',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','C-EYE','issue',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','D-1','issue',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','N-1','ok','removed from batch file', now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('S-1','W-1','ok','','pharm.stats@example.org','pharmacist', now() - interval '30 minute'),
             ('S-1','C-EYE','issue','Strength differs on the pack','pharm.stats@example.org','pharmacist', now() - interval '30 minute'),
             ('S-1','N-1','ok','','pharm.stats@example.org','pharmacist', now() - interval '30 minute');
            """);
    }

    @Autowired WebTestClient web;

    @Test void countsPublicProductsOnlyAndListsEachBatch() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.registerProducts").isEqualTo(39196)
            .jsonPath("$.data.productsLoaded").isEqualTo(10)
            .jsonPath("$.data.substances").isEqualTo(5)
            .jsonPath("$.data.approvedProducts").isEqualTo(2)
            .jsonPath("$.data.inReviewProducts").isEqualTo(3)
            .jsonPath("$.data.batches.length()").isEqualTo(2)
            .jsonPath("$.data.batches[0].batchId").isEqualTo("S-1")
            .jsonPath("$.data.batches[0].status").isEqualTo("in_review")
            .jsonPath("$.data.batches[0].itemCount").isEqualTo(4)
            .jsonPath("$.data.batches[0].approved").isEqualTo(1)
            .jsonPath("$.data.batches[0].items.length()").isEqualTo(5)
            .jsonPath("$.data.batches[1].batchId").isEqualTo("S-old")
            .jsonPath("$.data.batches[1].status").isEqualTo("approved")
            .jsonPath("$.data.batches[1].itemCount").isEqualTo(1)
            .jsonPath("$.data.batches[1].items[0].conceptId").isEqualTo("W-2")
            .jsonPath("$.data.batches[1].items[0].tradeName").isEqualTo("Coumarol")
            .jsonPath("$.data.batches[1].items[0].status").isEqualTo("approved");
    }

    @Test void exampleUsableIsFalseOnlyForAReportedIssueOrARemovedRecord() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.batches[0].items[0].length()").isEqualTo(4)
            .jsonPath("$.data.batches[0].items[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.batches[0].items[0].tradeName").isEqualTo("Ecosprin")
            .jsonPath("$.data.batches[0].items[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[0].exampleUsable").isEqualTo(true)
            .jsonPath("$.data.batches[0].items[1].conceptId").isEqualTo("C-EYE")
            .jsonPath("$.data.batches[0].items[1].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[1].exampleUsable").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[2].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.batches[0].items[2].exampleUsable").isEqualTo(true)
            .jsonPath("$.data.batches[0].items[3].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.batches[0].items[3].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[3].exampleUsable").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[4].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.batches[0].items[4].status").isEqualTo("approved")
            .jsonPath("$.data.batches[0].items[4].exampleUsable").isEqualTo(true);
    }

    @Test void carriesNoReviewDetailNoEmailAndNoClinicalValue() {
        byte[] raw = web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
        String body = new String(raw, StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("pharm.stats@example.org", "Strength differs", "pharmacist", "\"issue\"", "reviewStatus",
            "genericContentRaw", "Test Pharma", "Warfarin", "BDS-", "BDC-", "XM", "DDInter", "removed from batch file", "decidedAt");
    }

    @Test void needsNoTokenButRefusesAWrongOne() {
        internal(web).get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.approvedProducts").isEqualTo(2);
        web.get().uri("/v1/stats").header(HEADER, "not-the-token").exchange().expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED").jsonPath("$.data").doesNotExist();
    }

    /** §6.4: a removed product is never approved anywhere. N-1 is ok but its latest item is removed from the batch file. */
    @Test void aRemovedRecordIsNotPublicOnTheProductEndpointEither() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true).jsonPath("$.data.clinicalDrug").doesNotExist();
        web.get().uri("/v1/products/W-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").doesNotExist();
    }
}
```

Create `api/src/test/java/com/niramoy/bddrug/StatsScaleIntegrationTest.java` (§10.6 "Server: API p95 ≤ 300 ms per call"; every Learn render waits on this call, and the pilot's ten records hide its growth):

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

/**
 * GET /v1/stats at scale: five batches of 1,000 items plus a one-item batch whose product has a blank trade name.
 * Coarse bounds only: p95 under 300 ms over 20 calls (§10.6) and a body under 1 MB (the web container has 256 MB).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class StatsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at)
              SELECT 'L-' || b, 'in_review', 1000, now() - b * interval '1 hour' FROM generate_series(1, 5) b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'L-' || b, 'DGDA-Drugs', 'L-' || b || '-' || i, CASE WHEN i % 3 = 0 THEN 'ok' ELSE 'pending' END, NULL,
                     now() - b * interval '1 hour'
              FROM generate_series(1, 5) b, generate_series(1, 1000) i;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw)
              VALUES ('BLANK-1', '000-0000-000', '  ', 'Test Pharma', 'Tablet', 'Nothing 1 mg');
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES ('L-0', 'in_review', 1, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              VALUES ('L-0', 'DGDA-Drugs', 'BLANK-1', 'pending', NULL, now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void aBlankTradeNameIsReportedAsTheConceptId() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.batches[0].batchId").isEqualTo("L-0")
            .jsonPath("$.data.batches[0].items[0].tradeName").isEqualTo("BLANK-1")
            .jsonPath("$.data.batches.length()").isEqualTo(6);
    }

    @Test void answersFiveThousandItemsQuicklyAndCompactly() {
        byte[] first = web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
        assertThat(first.length).isLessThan(1_000_000);
        List<Long> ms = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            long t = System.nanoTime();
            web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody().returnResult();
            ms.add((System.nanoTime() - t) / 1_000_000);
        }
        Collections.sort(ms);
        assertThat(ms.get(18)).as("p95 of 20 calls, ms").isLessThan(300L);
    }
}
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd api && ./gradlew test --tests 'com.niramoy.bddrug.StatsApiIntegrationTest' --tests 'com.niramoy.bddrug.StatsScaleIntegrationTest' --no-daemon`
Expected: FAIL: the context does not start (`No qualifying bean of type 'com.niramoy.bddrug.application.port.StatsQueryPort'`), so every test errors.

- [ ] **Step 7: Put the §7.4 rule in `ReviewSql` once, then add the adapter and the controller**

The §7.4 rule is "its latest batch item has `review = 'ok'` and is not marked "removed from batch file"". On `main`, `ReviewSql.statusOf` (used by the product, substance and checker adapters) ignores the removed mark, so a removed-but-ok product is still served in full. Both forms below apply the whole rule, so `/v1/stats` and the public endpoints never disagree (§6.4: "A removed product is never counted as approved anywhere (search, checker, other brands, stats)"). The product adapters themselves do not change; P2 adds the "removed" stub status.

In `api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java`, replace `statusOf` with:

```java
    /**
     * Review status of the product whose concept_id is {@code conceptIdExpr} (e.g. "bp.concept_id"): its latest batch
     * item's review, except that a latest item removed from the batch file reads 'pending', so it is never public
     * (spec §6.4, §7.4). Same ordering as {@link #LATEST_PUBLIC} and the batch_item_concept_latest_idx index.
     */
    static String statusOf(String conceptIdExpr) {
        return "coalesce((SELECT CASE WHEN lbi.note IS NOT DISTINCT FROM '" + REMOVED_NOTE + "' THEN 'pending' ELSE lbi.review END " +
               "FROM ops.batch_item lbi WHERE lbi.concept_id = " + conceptIdExpr +
               " ORDER BY lbi.extracted_at DESC NULLS LAST, lbi.batch_id DESC LIMIT 1), 'pending')";
    }

    /**
     * The §7.4 visibility rule once per product, as a CTE for {@code WITH}: {@code latest(concept_id, pub)}, where
     * {@code pub} is true when the product's latest item is ok and not removed. Equivalent to
     * {@code statusOf(x) = 'ok'}, computed in one pass instead of one subquery per row (GET /v1/stats).
     */
    static final String LATEST_PUBLIC =
        "latest AS (SELECT DISTINCT ON (concept_id) concept_id, " +
        "(review = 'ok' AND note IS DISTINCT FROM '" + REMOVED_NOTE + "') AS pub " +
        "FROM ops.batch_item ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC)";
```

`api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcStatsAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.StatsQueryPort;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;

/**
 * GET /v1/stats reads. Decisions are read without notes or emails. Public status comes from ReviewSql.LATEST_PUBLIC,
 * computed once per query, never as a subquery per row. Scaling note: decisions() reads every decision row; before
 * batches grow past a few thousand items, P2 decides on a per-batch filter or paging (StatsScaleIntegrationTest pins
 * 5,000 items under the §10.6 300 ms).
 */
@Component
public class R2dbcStatsAdapter implements StatsQueryPort {
    private final DatabaseClient db;
    public R2dbcStatsAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<Totals> totals() {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                      "SELECT (SELECT count(*) FROM curated.brand_product) AS products, " +
                      "(SELECT count(*) FROM curated.substance) AS substances, " +
                      "(SELECT count(*) FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id WHERE l.pub) AS approved, " +
                      "(SELECT count(DISTINCT bi.concept_id) FROM ops.batch_item bi JOIN ops.batch b ON b.batch_id = bi.batch_id " +
                      " LEFT JOIN latest l ON l.concept_id = bi.concept_id " +
                      " WHERE b.status = 'in_review' AND " + ReviewSql.CURRENT_ITEM +
                      " AND NOT coalesce(l.pub, false)) AS in_review")
            .map(r -> new Totals(r.get("products", Long.class), r.get("substances", Long.class), r.get("approved", Long.class),
                r.get("in_review", Long.class)))
            .one();
    }

    @Override public Flux<BatchRow> batches() {
        return db.sql("SELECT batch_id, status FROM ops.batch ORDER BY run_at DESC, batch_id COLLATE \"C\"")
            .map(r -> new BatchRow(r.get("batch_id", String.class), r.get("status", String.class)))
            .all();
    }

    @Override public Flux<ItemRow> items() {
        // A blank DGDA trade name would make the web refuse the whole body (parseStats), so it falls back to the id.
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                      "SELECT bi.batch_id, bi.concept_id, coalesce(nullif(btrim(bp.trade_name), ''), bi.concept_id) AS trade_name, " +
                      "bi.review, bi.extracted_at, (bi.note IS NOT DISTINCT FROM '" + ReviewSql.REMOVED_NOTE + "') AS removed, " +
                      "coalesce(l.pub, false) AS product_public " +
                      "FROM ops.batch_item bi LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id " +
                      "LEFT JOIN latest l ON l.concept_id = bi.concept_id " +
                      "ORDER BY bi.batch_id COLLATE \"C\", bi.concept_id COLLATE \"C\"")
            .map(r -> {
                OffsetDateTime at = r.get("extracted_at", OffsetDateTime.class);
                return new ItemRow(r.get("batch_id", String.class), r.get("concept_id", String.class), r.get("trade_name", String.class),
                    r.get("review", String.class), at == null ? null : at.toInstant(),
                    Boolean.TRUE.equals(r.get("removed", Boolean.class)), Boolean.TRUE.equals(r.get("product_public", Boolean.class)));
            })
            .all();
    }

    @Override public Flux<DecisionRow> decisions() {
        return db.sql("SELECT batch_id, concept_id, id, decision, reviewer_role, decided_at FROM ops.review_decision ORDER BY decided_at, id")
            .map(r -> new DecisionRow(r.get("batch_id", String.class), r.get("concept_id", String.class),
                new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
                    r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant())))
            .all();
    }
}
```

`api/src/main/java/com/niramoy/bddrug/presentation/StatsController.java`:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.StatsQueryService;
import com.niramoy.bddrug.domain.SiteStats;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** GET /v1/stats (spec §7.4): public and scope-free. A token header that is present must still match. */
@RestController
@RequestMapping("/v1/stats")
public class StatsController {
    private final StatsQueryService service;
    private final InternalAuth auth;
    public StatsController(StatsQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<SiteStats>> stats(@RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.present(token);
        return service.stats().map(ApiResponse::ok);
    }
}
```

- [ ] **Step 8: Run the integration test to verify it passes**

Run: `cd api && ./gradlew test --tests 'com.niramoy.bddrug.StatsApiIntegrationTest' --tests 'com.niramoy.bddrug.StatsScaleIntegrationTest' --no-daemon`
Expected: `BUILD SUCCESSFUL`, 7 tests pass (5 and 2).

- [ ] **Step 9: Add the `/v1/stats` row of the §11.3 visibility matrix**

In `api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java`, add before the closing brace of the class (its seed makes W-1, N-1 and C-CAP public; W-2 is approved in `V-old` but pending in the newer `V-new`):

```java
    // ---- stats (§7.4; the /v1/stats row of the §11.3 matrix)

    @Test void statsCountOnlyPublicProductsAndCarryNoClinicalData() {
        String body = str(web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.approvedProducts").isEqualTo(3)
            .jsonPath("$.data.inReviewProducts").isEqualTo(3)
            .jsonPath("$.data.batches[0].batchId").isEqualTo("V-new")
            .jsonPath("$.data.batches[0].items[0].conceptId").isEqualTo("C-CAP")
            .jsonPath("$.data.batches[0].items[0].status").isEqualTo("approved")
            .jsonPath("$.data.batches[0].items[1].conceptId").isEqualTo("W-2")
            .jsonPath("$.data.batches[0].items[1].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[2].batchId").isEqualTo("V-old")
            .jsonPath("$.data.batches[2].items[1].conceptId").isEqualTo("W-2")
            .jsonPath("$.data.batches[2].items[1].status").isEqualTo("not_reviewed")
            .returnResult().getResponseBody());
        assertThat(body).doesNotContain("Warfarin", "Test Pharma", "BDS-", "BDC-", "XM5S93", "DDInter", "genericContentRaw",
            "reviewStatus", "\"issue\"", "company", "strength");
    }
```

(`V-old`'s items in concept order are C-CAP then W-2. W-2 reads `not_reviewed` in every batch because its latest item, in `V-new`, is pending; C-CAP reads `approved` in every batch because its latest item is ok.)

- [ ] **Step 10: Run the visibility test, then the whole API suite**

Run: `cd api && ./gradlew test --tests 'com.niramoy.bddrug.VisibilityApiIntegrationTest' --no-daemon && ./gradlew test --no-daemon`
Expected: `BUILD SUCCESSFUL`; the new test passes and the existing suite stays green. (No existing test seeds a removed item that is also the product's latest item and reads it through a public endpoint; if one fails on the `statusOf` change, its expectation contradicts §6.4: stop and report it rather than loosening `statusOf`.)

- [ ] **Step 11: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/SiteStats.java \
  api/src/main/java/com/niramoy/bddrug/application/port/StatsQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/application/StatsQueryService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcStatsAdapter.java \
  api/src/main/java/com/niramoy/bddrug/presentation/StatsController.java \
  api/src/test/java/com/niramoy/bddrug/StatsQueryServiceTest.java \
  api/src/test/java/com/niramoy/bddrug/StatsApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/StatsScaleIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java
git commit -m "feat(api): GET /v1/stats with public counts and per-record exampleUsable (§7.4)" \
  -m "ReviewSql.statusOf now reads a removed latest item as pending, so every public adapter and /v1/stats apply the one §7.4 rule (§6.4)." \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Web — the stats client, the Learn stats helpers and `fmtDhakaClock`

**Files:**
- Create: `web/lib/stats.ts`
- Modify: `web/lib/api.ts`, `web/lib/format.ts`, `web/tests/format.test.ts`
- Test: `web/tests/learn-stats.test.ts`

**Interfaces:**
- Consumes: `GET /v1/stats` (Task 1); `read()` and `base()` inside `web/lib/api.ts` (existing, module-private); `zoned()` inside `web/lib/format.ts` (existing, module-private).
- Produces (all client-safe in `@/lib/stats` unless noted):
  - `type StatsItem = { conceptId: string; tradeName: string; status: "approved" | "not_reviewed"; exampleUsable: boolean }`
  - `type BatchStatus = "in_review" | "approved" | "rejected"`
  - `type StatsBatch = { batchId: string; status: BatchStatus; itemCount: number; approved: number; items: StatsItem[] }`
  - `type SiteStats = { registerProducts: number; productsLoaded: number; substances: number; approvedProducts: number; inReviewProducts: number; batches: StatsBatch[] }`
  - `parseStats(v: unknown): SiteStats | null`; `findBatch(s: SiteStats, batchId: string): StatsBatch | null`; `findItem(b: StatsBatch | null, conceptId: string): StatsItem | null`; `exampleUsable(b: StatsBatch | null, conceptId: string): boolean` (false for anything unreported); `pillStatus(i: StatsItem | null): "approved" | "pending"`; `batchPill(b: StatsBatch | null): "approved" | "pending"`; `BATCH_STATUS_WORD: Record<BatchStatus, string>`; `formatCount(n: number): string`.
  - `getStats(): Promise<SiteStats>` in `@/lib/api` (server-only): throws on a network error, a non-2xx answer or a malformed body.
  - `fmtDhakaClock(iso: string): string` in `@/lib/format`: "12/10/2026 03:27" (Dhaka date and time without the zone word).

- [ ] **Step 1: Write the failing tests**

Create `web/tests/learn-stats.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStats } from "@/lib/api";
import { BATCH_STATUS_WORD, batchPill, exampleUsable, findBatch, findItem, formatCount, parseStats, pillStatus } from "@/lib/stats";

const STATS = {
  registerProducts: 39196, productsLoaded: 10, substances: 11, approvedProducts: 1, inReviewProducts: 9,
  batches: [{ batchId: "0001-pilot", status: "in_review", itemCount: 2, approved: 1, items: [
    { conceptId: "186-0030-006--napa", tradeName: "Napa", status: "approved", exampleUsable: true },
    { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", status: "not_reviewed", exampleUsable: false },
  ] }],
};
const ITEM = STATS.batches[0].items[0];
const withItem = (patch: Record<string, unknown>) => ({ ...STATS, batches: [{ ...STATS.batches[0], items: [{ ...ITEM, ...patch }] }] });
const withBatch = (patch: Record<string, unknown>) => ({ ...STATS, batches: [{ ...STATS.batches[0], ...patch }] });
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });

describe("parseStats (§7.4 shape)", () => {
  it("accepts the §7.4 body and keeps only its fields", () => {
    expect(parseStats({ ...STATS, extra: "dropped", batches: [{ ...STATS.batches[0], runAt: "x" }] })).toEqual(STATS);
  });

  it("refuses a body with a missing or mistyped field (Review Focus 1)", () => {
    const bad: unknown[] = [null, undefined, [], "stats", {}, { ...STATS, substances: "11" }, { ...STATS, approvedProducts: -1 },
      { ...STATS, productsLoaded: 1.5 }, { ...STATS, batches: "x" }, withBatch({ status: "open" }), withBatch({ itemCount: undefined }),
      withBatch({ items: null }), withItem({ exampleUsable: "true" }), withItem({ status: "issue" }), withItem({ tradeName: "" }),
      withItem({ conceptId: 7 })];
    for (const b of bad) expect(parseStats(b)).toBeNull();
  });
});

describe("lookups and pills", () => {
  const stats = parseStats(STATS)!;
  const batch = findBatch(stats, "0001-pilot");

  it("finds the batch and its items; anything /v1/stats does not report is not usable (fail closed)", () => {
    expect(batch?.itemCount).toBe(2);
    expect(findBatch(stats, "0002-next")).toBeNull();
    expect(findItem(batch, "186-0030-006--napa")?.tradeName).toBe("Napa");
    expect(findItem(null, "186-0030-006--napa")).toBeNull();
    expect(exampleUsable(batch, "186-0030-006--napa")).toBe(true);
    expect(exampleUsable(batch, "185-0138-012--g-warfarin")).toBe(false);
    expect(exampleUsable(batch, "127-0263-018--domperidone")).toBe(false);
    expect(exampleUsable(null, "186-0030-006--napa")).toBe(false);
  });

  it("maps statuses to the two public pills", () => {
    expect(pillStatus(findItem(batch, "186-0030-006--napa"))).toBe("approved");
    expect(pillStatus(findItem(batch, "185-0138-012--g-warfarin"))).toBe("pending");
    expect(pillStatus(null)).toBe("pending");
    expect(batchPill(batch)).toBe("pending");
    expect(batchPill({ ...batch!, approved: 2 })).toBe("approved");
    expect(batchPill({ ...batch!, itemCount: 0, approved: 0 })).toBe("pending");
    expect(batchPill(null)).toBe("pending");
  });

  it("words the batch status and prints counts with thousands separators", () => {
    expect(BATCH_STATUS_WORD).toEqual({ in_review: "in review", approved: "approved", rejected: "rejected" });
    expect(formatCount(39196)).toBe("39,196");
    expect(formatCount(10)).toBe("10");
  });
});

describe("getStats (§7.4, §2.2 public scope)", () => {
  beforeEach(() => {
    vi.stubEnv("API_URL", "http://api:8080");
    vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token-0123456789abcdef");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("reads GET /v1/stats without the internal token, with a timeout", async () => {
    const f = vi.fn().mockResolvedValue(ok(STATS));
    vi.stubGlobal("fetch", f);
    expect(await getStats()).toEqual(STATS);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/stats");
    expect(f.mock.calls[0][1].headers).toEqual({});
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on an API error, a body that is not JSON, or a malformed body", async () => {
    for (const r of [new Response("{}", { status: 502 }), new Response("<html>boom</html>", { status: 200 }), ok({ ...STATS, batches: null })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
      await expect(getStats()).rejects.toThrow(/API error/);
    }
  });

  it("throws when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(getStats()).rejects.toThrow("fetch failed");
  });
});
```

In `web/tests/format.test.ts`, change the import line to

```ts
import { fmtDhaka, fmtDhakaClock, fmtDhakaOn, fmtDhakaTime, fmtUtc } from "@/lib/format";
```

and add inside the `describe("§3.5 date formatters …")` block:

```ts
  it("fmtDhakaClock gives the Dhaka date and time without the zone word (Learn: \"… in Dhaka\")", () => {
    expect(fmtDhakaClock("2026-10-11T21:27:17.629Z")).toBe("12/10/2026 03:27");
    expect(fmtDhakaClock("2026-10-12T18:00:00Z")).toBe("13/10/2026 00:00");
    expect(fmtDhakaClock("not a date")).toBe("not a date");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/learn-stats.test.ts tests/format.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/stats"`, and `fmtDhakaClock is not a function` in `format.test.ts`.

- [ ] **Step 3: Write `lib/stats.ts`, `getStats()` and `fmtDhakaClock()`**

Create `web/lib/stats.ts`:

```ts
/**
 * GET /v1/stats (spec §7.4): public counts and each batch's records by trade name and public status. Client-safe types
 * and pure helpers; the fetch is `getStats()` in lib/api.ts (server-only). Learn withdraws a frozen example unless the
 * API reports its record as usable (§6.8): anything the API does not report counts as not usable.
 */
export type StatsItem = { conceptId: string; tradeName: string; status: "approved" | "not_reviewed"; exampleUsable: boolean };
export type BatchStatus = "in_review" | "approved" | "rejected";
export type StatsBatch = { batchId: string; status: BatchStatus; itemCount: number; approved: number; items: StatsItem[] };
export type SiteStats = {
  registerProducts: number; productsLoaded: number; substances: number; approvedProducts: number; inReviewProducts: number;
  batches: StatsBatch[];
};

const COUNTS = ["registerProducts", "productsLoaded", "substances", "approvedProducts", "inReviewProducts"] as const;
const ITEM_STATUSES: readonly string[] = ["approved", "not_reviewed"];
const BATCH_STATUSES: readonly string[] = ["in_review", "approved", "rejected"];
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseItem(v: unknown): StatsItem | null {
  if (!isObject(v) || !isText(v.conceptId) || !isText(v.tradeName) || typeof v.status !== "string"
      || !ITEM_STATUSES.includes(v.status) || typeof v.exampleUsable !== "boolean") return null;
  return { conceptId: v.conceptId, tradeName: v.tradeName, status: v.status as StatsItem["status"], exampleUsable: v.exampleUsable };
}

function parseBatch(v: unknown): StatsBatch | null {
  if (!isObject(v) || !isText(v.batchId) || typeof v.status !== "string" || !BATCH_STATUSES.includes(v.status)
      || !isCount(v.itemCount) || !isCount(v.approved) || !Array.isArray(v.items)) return null;
  const items = v.items.map(parseItem);
  if (items.some((i) => i === null)) return null;
  return { batchId: v.batchId, status: v.status as BatchStatus, itemCount: v.itemCount, approved: v.approved, items: items as StatsItem[] };
}

/** The `data` of GET /v1/stats with only its §7.4 fields, or null when any field is missing or of the wrong type. */
export function parseStats(v: unknown): SiteStats | null {
  if (!isObject(v) || !COUNTS.every((k) => isCount(v[k])) || !Array.isArray(v.batches)) return null;
  const batches = v.batches.map(parseBatch);
  if (batches.some((b) => b === null)) return null;
  return {
    registerProducts: v.registerProducts as number, productsLoaded: v.productsLoaded as number, substances: v.substances as number,
    approvedProducts: v.approvedProducts as number, inReviewProducts: v.inReviewProducts as number, batches: batches as StatsBatch[],
  };
}

export const findBatch = (s: SiteStats, batchId: string): StatsBatch | null => s.batches.find((b) => b.batchId === batchId) ?? null;
export const findItem = (b: StatsBatch | null, conceptId: string): StatsItem | null =>
  b?.items.find((i) => i.conceptId === conceptId) ?? null;
/** A frozen example may show only when the API reports its record in that batch as usable (§6.8; fail closed). */
export const exampleUsable = (b: StatsBatch | null, conceptId: string): boolean => findItem(b, conceptId)?.exampleUsable === true;
/** Public pills only (§3.4): approved, or "Not yet reviewed by a pharmacist" for anything else, unreported included. */
export const pillStatus = (i: StatsItem | null): "approved" | "pending" => (i?.status === "approved" ? "approved" : "pending");
/** A batch reads approved only when every record still in its file is approved. */
export const batchPill = (b: StatsBatch | null): "approved" | "pending" =>
  (b !== null && b.itemCount > 0 && b.approved === b.itemCount ? "approved" : "pending");
export const BATCH_STATUS_WORD: Record<BatchStatus, string> = { in_review: "in review", approved: "approved", rejected: "rejected" };
/** "39,196": counts as the boards print them. */
export const formatCount = (n: number): string => n.toLocaleString("en-US");
```

In `web/lib/api.ts`, add the import under the existing `import type { … } from "./review-types";` line:

```ts
import { parseStats, type SiteStats } from "./stats";
```

and add after `listLoadedProducts()`:

```ts
/**
 * GET /v1/stats (§7.4): public, never with the token. Throws on any failure or malformed body, so a Learn chapter
 * never renders a frozen example without its live `exampleUsable` check (§6.8).
 */
export async function getStats(): Promise<SiteStats> {
  const res = await read(`${base()}/v1/stats`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const stats = parseStats((await res.json().catch(() => null))?.data);
  if (!stats) throw new Error("API error: malformed stats");
  return stats;
}
```

In `web/lib/format.ts`, add after `fmtDhaka`:

```ts
/** "12/10/2026 03:27": the Dhaka date and time without the zone word, for sentences that name it ("… in Dhaka"). */
export function fmtDhakaClock(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `${z.date} ${z.time}` : iso;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/learn-stats.test.ts tests/format.test.ts tests/api.test.ts`
Expected: PASS (all three files).

- [ ] **Step 5: Commit**

```bash
git add web/lib/stats.ts web/lib/api.ts web/lib/format.ts web/tests/learn-stats.test.ts web/tests/format.test.ts
git commit -m "feat(web): /v1/stats client and the Learn stats helpers (fail closed on any malformed body)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Copy — the Learn row of `NEW_COPY`, Board L's guarded sentences, and the guards over `content/`

**Files:**
- Modify: `web/lib/copy.ts`, `web/scripts/check-client-islands.mjs`, `web/tests/copy.test.ts`, `web/tests/marks.test.ts`, `web/tests/inline-styles.test.ts`, `web/tests/client-islands.test.ts`

**Interfaces:**
- Consumes: `NEW_COPY`, `NEW_COPY_ROWS.learnSnapshotDate`, `fill()` (P1A); the §1.7 row and §6.8 "Stats unavailable" strings Task 0 added to the spec.
- Produces: `NEW_COPY[NEW_COPY_ROWS.learnSnapshotDate] = { asStored: "as stored on {date}" }`; `NEW_COPY_ROWS.learnStatsFailed` with `NEW_COPY[...] = { failTitle, failBody, retry }`; `LEARN_NEW: Record<"asStored", string>`; `LEARN_FAIL: Record<"failTitle" | "failBody" | "retry", string>`; `LEARN_BOARD: { unclassifiedLegend, unclassifiedGlossary, unclassifiedMust, checkerNeverSays, undoWindowDetail, undoWindow, undoWindowFaq }` (Board L sentences that name a guarded phrase, plus §1.6 item 14's undo-window wording, held once and kept in `lib/copy.ts` so the paraphrase guard can keep scanning every other file; `undoWindow` is built from `undoWindowDetail`). The copy, mark, inline-style and client-island guards scan `web/content/` from now on.

- [ ] **Step 1: Write the failing tests**

In `web/tests/copy.test.ts`:

1. Change the first import line to

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
```

2. Replace the `scanned` constant with

```ts
/** P3 adds content/ (Learn chapters, §6.8): Learn copy is held to the same rules as every page. */
const scanned = () => ["app", "components", "lib", "content"].filter((d) => existsSync(join(WEB, d)))
  .flatMap((d) => [...sources(join(WEB, d))])
  .filter((f) => f !== "lib/copy.ts" && !LEGACY_EXEMPT.includes(f));
```

3. In the `SPEC_ROWS` list (the §1.7 table copied row by row), add after the line `  "Learn: snapshot-value date suffix \"as stored on {date}\"",` the row Task 0 added to the spec:

```ts
  "Learn: chapter not shown because the live numbers did not load",
```

4. Add inside `describe("§1.7 new copy", …)`:

```ts
  it("pins the Learn strings P3 ships (§6.8 snapshot suffix and stats failure, Board L guarded sentences, §1.6 item 14)", () => {
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.learnSnapshotDate]).toEqual({ asStored: "as stored on {date}" });
    expect(copy.LEARN_NEW.asStored).toBe("as stored on {date}");
    expect(copy.fill(copy.LEARN_NEW.asStored, { date: "13/10/2026" })).toBe("as stored on 13/10/2026");
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.learnStatsFailed]).toEqual({
      failTitle: "Couldn't load this chapter.",
      failBody: "The live pilot numbers did not load, so no example is shown. Nothing was changed.",
      retry: "Try again",
    });
    expect(copy.LEARN_FAIL).toBe(copy.NEW_COPY[copy.NEW_COPY_ROWS.learnStatsFailed]);
    expect(copy.LEARN_BOARD).toEqual({
      unclassifiedLegend: "DDInter lists the pair but gives no grade. It is not low risk and is never counted with Minor.",
      unclassifiedGlossary: "DDInter lists the pair without a grade. Not low risk, never merged with Minor.",
      unclassifiedMust: 'Never "low risk", never merged with Minor.',
      checkerNeverSays: 'The checker never says "no interactions found" for this list. It reports one Major pair and two pairs it could not check. Chapter 8 shows the same check as an API response.',
      undoWindowDetail: "(8 seconds by default; 20 or 60 in desk settings)",
      undoWindow: "undo window (8 seconds by default; 20 or 60 in desk settings)",
      undoWindowFaq: "(8 seconds unless you lengthened it)",
    });
    expect(copy.LEARN_BOARD.undoWindow.endsWith(copy.LEARN_BOARD.undoWindowDetail)).toBe(true);
  });
```

5. Add inside `describe("no paraphrase or retyping of the safety sentences", …)`:

```ts
  it("no file but lib/copy.ts holds an em dash (§3.5: only the stale-page title has one)", () => {
    expect(scanned().filter((f) => /—/.test(text(f)))).toEqual([]);
  });
```

In `web/tests/marks.test.ts`, change the first import line to `import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";` and replace the `all` constant with

```ts
const all = (ext: RegExp) => ["app", "components", "content"].filter((d) => existsSync(join(WEB, d)))
  .flatMap((d) => [...files(join(WEB, d), ext)]);
```

In `web/tests/inline-styles.test.ts`, change the first import line to `import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";` and replace `const files = [...tsx(join(WEB, "app")), ...tsx(join(WEB, "components"))];` with

```ts
    const files = ["app", "components", "content"].filter((d) => existsSync(join(WEB, d))).flatMap((d) => [...tsx(join(WEB, d))]);
```

In `web/tests/client-islands.test.ts`, add inside `describe("client-island allowlist (§4.2)", …)`:

```ts
  it("scans content/ too: a 'use client' Learn chapter is not on the list", () => {
    const root = fixture({ "content/learn/x.tsx": '"use client";\nexport default 1;\n' });
    expect(checkIslands(root)).toEqual(['content/learn/x.tsx: "use client" file is not in the island allowlist (spec §4.2)']);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts tests/client-islands.test.ts`
Expected: FAIL in `copy.test.ts`: `NEW_COPY has exactly one entry per §1.7 row` (the new row is missing from `NEW_COPY_ROWS`) and `pins the Learn strings P3 ships` (the row is still `{}`; `LEARN_NEW`, `LEARN_FAIL`, `LEARN_BOARD` are undefined); FAIL in `client-islands.test.ts`: `scans content/ too` (the check returns `[]`). The marks and inline-style tests still pass (no `content/` yet).

- [ ] **Step 3: Add the strings to `lib/copy.ts`, and scan `content/` for islands**

In `NEW_COPY_ROWS`, add after the `learnSnapshotDate` line:

```ts
  learnStatsFailed: "Learn: chapter not shown because the live numbers did not load",
```

Replace the line `  [NEW_COPY_ROWS.learnSnapshotDate]: {},` with

```ts
  [NEW_COPY_ROWS.learnSnapshotDate]: { asStored: "as stored on {date}" },
  [NEW_COPY_ROWS.learnStatsFailed]: {
    failTitle: "Couldn't load this chapter.",
    failBody: "The live pilot numbers did not load, so no example is shown. Nothing was changed.",
    retry: "Try again",
  },
```

and add at the end of the file:

```ts
/** Learn (§6.8): the date suffix after a snapshot-only value, and the footer's batch line. */
export const LEARN_NEW = NEW_COPY[NEW_COPY_ROWS.learnSnapshotDate] as Record<"asStored", string>;

/** Learn (§6.8 "Stats unavailable"): the banner shown in place of a chapter when GET /v1/stats fails. */
export const LEARN_FAIL = NEW_COPY[NEW_COPY_ROWS.learnStatsFailed] as Record<"failTitle" | "failBody" | "retry", string>;

/** §1.6 item 14's parenthetical, held once: the glossary prints it alone, the gate table and keys inside `undoWindow`. */
const UNDO_WINDOW_DETAIL = "(8 seconds by default; 20 or 60 in desk settings)";

/**
 * Board L sentences that name a phrase the paraphrase guard bans elsewhere ("low risk", "no interactions"), and §1.6
 * item 14's undo-window wording, which Learn repeats in five places. Learn imports them; copy.test.ts pins them.
 */
export const LEARN_BOARD = {
  unclassifiedLegend: "DDInter lists the pair but gives no grade. It is not low risk and is never counted with Minor.",
  unclassifiedGlossary: "DDInter lists the pair without a grade. Not low risk, never merged with Minor.",
  unclassifiedMust: 'Never "low risk", never merged with Minor.',
  checkerNeverSays: 'The checker never says "no interactions found" for this list. It reports one Major pair and two pairs it could not check. Chapter 8 shows the same check as an API response.',
  undoWindowDetail: UNDO_WINDOW_DETAIL,
  undoWindow: `undo window ${UNDO_WINDOW_DETAIL}`,
  /** The FAQ's shorter form of the same window (§1.6 item 14). */
  undoWindowFaq: "(8 seconds unless you lengthened it)",
} as const;
```

In `web/scripts/check-client-islands.mjs`, replace `const SCAN = ["app", "components", "lib"];` with

```js
/** P3: Learn chapters live in content/ (§6.8); none may be an island. */
const SCAN = ["app", "components", "lib", "content"];
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts tests/client-islands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/copy.ts web/scripts/check-client-islands.mjs web/tests/copy.test.ts web/tests/marks.test.ts \
  web/tests/inline-styles.test.ts web/tests/client-islands.test.ts
git commit -m "feat(web): Learn copy (snapshot date suffix, stats failure, Board L guarded sentences) and every guard over content/" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The pilot snapshot (§6.8) and `learn-snapshot.test.ts` (§11.1)

**Files:**
- Create: `web/content/learn/pilot-snapshot.ts`
- Test: `web/tests/learn-snapshot.test.ts`

**Interfaces:**
- Consumes: `type Severity` from `@/lib/severity` (existing); Board R's embedded export `var DATA={…}` in `docs/artifacts/2026-10-12-intellidrugs-reviewer.html` (test only).
- Produces (`@/content/learn/pilot-snapshot`): `P` (the ten concept ids by name: `amlodipine`, `aspirin`, `simvastatin`, `chloramphenicol`, `domperidone`, `warfarin`, `metformin`, `napa`, `clarith`, `amoxiclav`); `type PilotId`; `PILOT_IDS: readonly PilotId[]` (concept order); types `PilotRecord`, `SubstanceCodes`, `DrugDrugCounts`, `PilotSubstance`, `PilotPair`, `TextMissingPair`, `PilotWarning`, `StageTally`, `ActionExample`, `PilotSnapshot`; `PILOT_SNAPSHOT: PilotSnapshot` with `batchId`, `storedOn` (DD/MM/YYYY), `runAt` (ISO with `Z`), `warfarinExtractedAt` (ISO with `Z`, or `null`), `records`, `substances`, `pairs` (28), `notCheckedPairs` (10), `warnings`, `stages`, `evidence`, `review`, `workedCheck`, `actionExamples`; helpers `substancesOf(id)`, `substanceNamed(name)`, `entryName(ddinterId)`, `severityCounts(pairs?)`, `actionCounts(pairs?)`, `codeCount(substance)`.

The values are Board L's with the §1.6 corrections; the test proves each one against Board R's export (the source of P1B's e2e seed), against the §1.6 counts, and against the batch `/v1/stats` reports in CI (`web/e2e/seed/10-pilot.sql`). `storedOn`, `runAt`, `evidence` and `review.reruns` are the "Before you start" host values; if that step printed different values, use them here (the tests check their form and consistency, not the dates). `warfarinExtractedAt` is always the host's `g_warfarin_extracted` (P0's re-run re-stamped every record, so no pre-re-run time is true any more), or `null` when nobody with host access ran that step. Records carry no extraction time of their own: chapter 4's re-run example is the only place Learn prints one.

- [ ] **Step 1: Write the failing test**

Create `web/tests/learn-snapshot.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  P, PILOT_IDS, PILOT_SNAPSHOT as S, actionCounts, codeCount, entryName, severityCounts, substanceNamed, type PilotId,
} from "@/content/learn/pilot-snapshot";

/** The concept ids of batch 0001-pilot in the CI seed, which is what /v1/stats reports in the e2e stack (§6.8). */
function seededPilotIds(): string[] {
  const sql = readFileSync(fileURLToPath(new URL("../e2e/seed/10-pilot.sql", import.meta.url)), "utf8");
  const ids = new Set<string>();
  for (const block of sql.split("INSERT INTO ").filter((b) => b.startsWith("ops.batch_item "))) {
    for (const m of block.split(";")[0].matchAll(/\('0001-pilot',\s*'[^']*',\s*'([^']+)'/g)) ids.add(m[1]);
  }
  return [...ids].sort();
}
const CONTENT = fileURLToPath(new URL("../content/learn/", import.meta.url));

/** Board R's embedded pilot export: the source P1B's e2e seed is built from (e2e/seed/build-pilot-seed.mjs). */
type BoardCode = { system: string; code: string; route: string };
type BoardIngredient = { bds: string; name: string; codes: BoardCode[]; coverage: { coverage: string };
  ddi: { major: number; moderate: number; minor: number; unknown: number; total: number }; disease: number; food: number };
type BoardItem = { conceptId: string; ingredients: BoardIngredient[]; stages: { ddinter: { note: string | null } };
  brand: { trade_name: string; dar_number: string; company: string; dosage_form: string; generic_content_raw: string };
  clinical: { bdc_id: string; display_name: string; route: string; signature: string } };
type BoardPair = { ida: string; idb: string; severity: string; actions: string[]; interaction: string | null; management: string | null };
const html = readFileSync(fileURLToPath(new URL("../../docs/artifacts/2026-10-12-intellidrugs-reviewer.html", import.meta.url)), "utf8");
const DATA = JSON.parse(/var DATA=(\{[\s\S]*?\});\n/.exec(html)![1]) as { items: BoardItem[]; pilotPairs: BoardPair[] };

/** §1.6 item 7: the systemic chloramphenicol entry never applies to the eye drops. */
const DROPPED = "DDInter351";
const key = (a: string, b: string) => [a, b].sort().join("/");
const boardPair = (a: string, b: string) => DATA.pilotPairs.find((p) => key(p.ida, p.idb) === key(a, b))!;
const ddinterParts = (it: BoardItem) => (it.stages.ddinter.note ?? "").split("; ").filter((p) => p !== "" && !p.includes(DROPPED));

describe("the pilot snapshot against Board R's pilot export", () => {
  it("names the ten pilot records once each, in concept order", () => {
    expect(new Set(PILOT_IDS).size).toBe(10);
    expect([...PILOT_IDS]).toEqual(DATA.items.map((i) => i.conceptId).sort());
    expect(Object.values(P).sort()).toEqual([...PILOT_IDS]);
  });

  it("every snapshot block is keyed by a concept id that /v1/stats reports (§6.8): the CI seed's 0001-pilot items", () => {
    expect(seededPilotIds()).toEqual([...PILOT_IDS]);
  });

  it("every ids list in a Learn chapter names pilot records only", () => {
    const ELEMENT = /^(P\.(amlodipine|aspirin|simvastatin|chloramphenicol|domperidone|warfarin|metformin|napa|clarith|amoxiclav)|id)$/;
    // No chapter exists yet in Task 4; the test bites from Task 6 on, as each chapter lands.
    const files = readdirSync(CONTENT).filter((f) => f.endsWith(".tsx"));
    for (const f of files) {
      const src = readFileSync(join(CONTENT, f), "utf8");
      for (const m of src.matchAll(/\bids(?:=\{|:\s*)(\[[^\]]*\]|[A-Za-z_.]+)/g)) {
        if (m[1] === "PILOT_IDS") continue;
        expect(m[1].startsWith("["), `${f}: ids=${m[1]}`).toBe(true);
        // `id` is allowed only as the loop variable of PILOT_IDS.map((id) => …) (chapter 7's warning cards).
        for (const el of m[1].slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean)) expect(el, `${f}: ${m[1]}`).toMatch(ELEMENT);
      }
    }
  });

  it("holds Board R's brand and clinical-drug facts for each record", () => {
    for (const it of DATA.items) {
      const r = S.records[it.conceptId as PilotId];
      expect([r.tradeName, r.darNumber, r.company, r.dosageForm, r.genericContentRaw, r.bdcId, r.clinicalDrug, r.route, r.signature])
        .toEqual([it.brand.trade_name, it.brand.dar_number, it.brand.company, it.brand.dosage_form, it.brand.generic_content_raw,
          it.clinical.bdc_id, it.clinical.display_name, it.clinical.route, it.clinical.signature]);
    }
  });

  it("holds Board R's codes, DDInter entries and record counts for each substance", () => {
    const board = DATA.items.flatMap((it) => it.ingredients.map((i) => ({ product: it.conceptId, i })));
    expect(S.substances.map((s) => s.bdsId).sort()).toEqual(board.map((b) => b.i.bds).sort());
    for (const { product, i } of board) {
      const s = S.substances.find((x) => x.bdsId === i.bds)!;
      const codes = (system: string) => i.codes.filter((c) => c.system === system).map((c) => c.code);
      expect(s.product).toBe(product);
      expect(s.name).toBe(i.name);
      expect(s.codes).toEqual({ icd11: codes("ICD11_XM")[0], rxcui: codes("RXCUI")[0], atc: codes("ATC"), drugbank: codes("DRUGBANK")[0],
        snomed: codes("SNOMEDCT") });
      expect(s.entries).toEqual(i.codes.filter((c) => c.system === "DDINTER").map((c) => ({ id: c.code, route: c.route })));
      expect(s.drugDrug).toEqual({ major: i.ddi.major, moderate: i.ddi.moderate, minor: i.ddi.minor, unknown: i.ddi.unknown, total: i.ddi.total });
      expect([s.disease, s.food, s.coverage]).toEqual([i.disease, i.food, i.coverage.coverage]);
    }
  });

  it("its 28 pairs are Board R's pilot pairs without the DDInter351 ones (§1.6 items 5 and 10)", () => {
    const board = DATA.pilotPairs.filter((p) => p.ida !== DROPPED && p.idb !== DROPPED)
      .map((p) => `${key(p.ida, p.idb)}|${p.severity}|${p.actions.join(",")}`).sort();
    expect(S.pairs.map((p) => `${key(p.ddinterA, p.ddinterB)}|${p.severity}|${p.action}`).sort()).toEqual(board);
    expect(S.pairs).toHaveLength(28);
    for (const p of S.pairs) expect([entryName(p.ddinterA), entryName(p.ddinterB)]).toEqual([p.a, p.b]);
  });

  it("each record's DDInter warning is Board R's stage note without the DDInter351 pairs", () => {
    for (const it of DATA.items) {
      const parts = ddinterParts(it);
      const w = S.warnings[it.conceptId as PilotId];
      const missing = parts.map((p) => /^DDInter text not found for (DDInter\d+)\/(DDInter\d+)$/.exec(p))
        .filter((m): m is RegExpExecArray => m !== null).map((m) => key(m[1], m[2])).sort();
      expect(w.textMissing.map((t) => key(t.ddinterA, t.ddinterB)).sort()).toEqual(missing);
      expect(w.noData).toBe(parts.includes("No interaction data in DDInter for this substance"));
      expect(w.status).toBe(parts.length === 0 ? "ok" : "warn");
      for (const t of w.textMissing) expect([entryName(t.ddinterA), entryName(t.ddinterB)]).toEqual([t.a, t.b]);
    }
  });

  it("the DDInter text Learn quotes is Board R's, unchanged", () => {
    expect(S.workedCheck.management).toBe(boardPair("DDInter1951", "DDInter20").management);
    for (const e of S.actionExamples) {
      const b = boardPair(e.ddinterA, e.ddinterB);
      expect([e.interaction, e.severity, e.action]).toEqual([b.interaction, b.severity, b.actions[0]]);
    }
  });
});

describe("the §1.6 counts the snapshot must give", () => {
  it("severity: Major 4, Moderate 6, Minor 2, not classified 16, of 28 (items 5 and 11)", () => {
    expect(severityCounts()).toEqual({ major: 4, moderate: 6, minor: 2, unknown: 16 });
  });

  it("actions: synergy 3, metabolism 6, not given 16; the others unchanged (item 11)", () => {
    expect(actionCounts()).toEqual({ synergy: 3, metabolism: 6, antagonism: 1, distribution: 1, others: 1, unknown: 16 });
  });

  it("the row hints of item 7", () => {
    const hint = (id: PilotId) => {
      const w = S.warnings[id];
      if (w.noData) return "No DDInter data";
      if (w.status === "ok") return "All checks OK";
      const n = w.textMissing.length;
      return `1 check warning, ${n} ${n === 1 ? "pair" : "pairs"} without text`;
    };
    expect(Object.fromEntries(PILOT_IDS.map((id) => [S.records[id].tradeName, hint(id)]))).toEqual({
      "Amlodipine-5": "1 check warning, 4 pairs without text",
      Aspirin: "1 check warning, 5 pairs without text",
      Simvastatin: "1 check warning, 4 pairs without text",
      Chloramphenicol: "All checks OK",
      Domperidone: "No DDInter data",
      "G Warfarin": "1 check warning, 1 pair without text",
      "G-Metformin": "1 check warning, 5 pairs without text",
      Napa: "1 check warning, 6 pairs without text",
      Clarith: "1 check warning, 2 pairs without text",
      "Amoxycillin Clavulanic Acid": "1 check warning, 5 pairs without text",
    });
  });

  it("the chapter 4 pilot results: DDInter warned 9 of 10, the other stages OK for all 10 (item 11)", () => {
    expect(S.stages).toEqual({ dgda: { ok: 10, warn: 0, fail: 0 }, substances: { ok: 10, warn: 0, fail: 0 },
      clinical: { ok: 10, warn: 0, fail: 0 }, ddinter: { ok: 1, warn: 9, fail: 0 } });
    expect(PILOT_IDS.filter((id) => S.warnings[id].status === "warn")).toHaveLength(S.stages.ddinter.warn);
    expect(PILOT_IDS.filter((id) => S.warnings[id].textMissing.length > 0)).toHaveLength(8);
  });

  it("severity counts sum to their totals for every substance", () => {
    for (const s of S.substances) {
      const d = s.drugDrug;
      expect(d.major + d.moderate + d.minor + d.unknown).toBe(d.total);
    }
  });

  it("Domperidone has no DDInter entry, six codes, and one not-checked pair with each other pilot substance", () => {
    const domp = substanceNamed("Domperidone");
    expect([domp.coverage, domp.entries.length, codeCount(domp)]).toEqual(["none", 0, 6]);
    expect(S.notCheckedPairs).toBe(S.substances.length - 1);
  });
});

describe("snapshot-only values (§6.8) are present and dated", () => {
  it("has a DD/MM/YYYY snapshot date and ISO times with an explicit zone, so they read the same in any TZ", () => {
    expect(S.storedOn).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(S.runAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(Number.isNaN(Date.parse(S.runAt))).toBe(false);
    expect(S.batchId).toBe("0001-pilot");
  });

  it("G Warfarin's extraction time is the host's re-run stamp, after the first run, or null (never a pre-re-run time)", () => {
    if (S.warfarinExtractedAt === null) return;
    expect(S.warfarinExtractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(Date.parse(S.warfarinExtractedAt)).toBeGreaterThan(Date.parse(S.runAt) + 3_600_000);
  });

  it("holds the chapter 4 evidence counts and the glossary review lines", () => {
    for (const v of [...Object.values(S.evidence), ...Object.values(S.review)]) expect(Number.isInteger(v) && v >= 0).toBe(true);
    expect(S.evidence.stageResult).toBe(40);
    expect(S.evidence.reviewDecision).toBe(0);
    expect(S.review.decisions).toBe(S.evidence.reviewDecision);
    expect(S.review.reruns).toBe(S.evidence.batchRun - 1);
    expect([S.review.backInReview, S.review.engineerChecked, S.review.issueReported]).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-snapshot.test.ts`
Expected: FAIL: `Failed to resolve import "@/content/learn/pilot-snapshot"`.

- [ ] **Step 3: Write the snapshot**

Create `web/content/learn/pilot-snapshot.ts`:

```ts
/**
 * Learn's frozen pilot examples (spec §6.8): batch 0001-pilot as stored after the §8 route fix and re-run, with the §1.6
 * Learn corrections (items 3–7 and 11). Board L's values, cross-checked against Board R's pilot export (the e2e seed's
 * source) by tests/learn-snapshot.test.ts. Live numbers and every status pill come from GET /v1/stats, never from here,
 * and a block drawn from these values is withdrawn when /v1/stats stops reporting its record as usable.
 */
import type { Severity } from "@/lib/severity";

/** The ten pilot records of batch 0001-pilot, by name. */
export const P = {
  amlodipine: "071-0098-022--amlodipine-5",
  aspirin: "076-0028-006--aspirin",
  simvastatin: "096-0265-061--simvastatin",
  chloramphenicol: "127-0163-052--chloramphenicol",
  domperidone: "127-0263-018--domperidone",
  warfarin: "185-0138-012--g-warfarin",
  metformin: "185-0241-015--g-metformin",
  napa: "186-0030-006--napa",
  clarith: "239-0407-023--clarith",
  amoxiclav: "420-0026-023--amoxycillin-clavulanic-acid",
} as const;
export type PilotId = (typeof P)[keyof typeof P];
/** In concept order (COLLATE "C"), as /v1/stats and the review desk list them. */
export const PILOT_IDS: readonly PilotId[] = [P.amlodipine, P.aspirin, P.simvastatin, P.chloramphenicol, P.domperidone,
  P.warfarin, P.metformin, P.napa, P.clarith, P.amoxiclav];

export type PilotRecord = {
  tradeName: string; darNumber: string; company: string; dosageForm: string; genericContentRaw: string;
  bdcId: string; clinicalDrug: string; route: string; signature: string;
};
export type SubstanceCodes = { icd11: string; rxcui: string; atc: string[]; drugbank: string; snomed: string[] };
export type DrugDrugCounts = { major: number; moderate: number; minor: number; unknown: number; total: number };
export type PilotSubstance = {
  bdsId: string; name: string; product: PilotId; codes: SubstanceCodes; entries: { id: string; route: string }[];
  drugDrug: DrugDrugCounts; disease: number; food: number; coverage: "full" | "none";
};
export type PilotPair = { a: string; b: string; ddinterA: string; ddinterB: string; severity: Severity; action: string };
export type TextMissingPair = { a: string; b: string; ddinterA: string; ddinterB: string };
export type PilotWarning = { status: "ok" | "warn"; noData: boolean; textMissing: TextMissingPair[] };
export type StageTally = { ok: number; warn: number; fail: number };
export type ActionExample = {
  action: string; names: string; ddinterA: string; ddinterB: string; severity: Severity; interaction: string | null; truncated: boolean;
};
export type PilotSnapshot = {
  batchId: string;
  /** DD/MM/YYYY (Dhaka): the date every "as stored on {date}" suffix and the footer print. */
  storedOn: string;
  /** The batch's run time (ops.batch.run_at), ISO with an explicit Z. */
  runAt: string;
  /**
   * G Warfarin's extracted_at on the host (ISO with Z): P0's ddinter re-run re-stamped it, so only the host knows it.
   * null when nobody with host access captured it; chapter 4 then prints no date.
   */
  warfarinExtractedAt: string | null;
  records: Record<PilotId, PilotRecord>;
  substances: PilotSubstance[];
  /** The DDInter pairs that apply to the pilot products (§1.6 item 5), Board L's order. */
  pairs: PilotPair[];
  /** Domperidone (coverage none) with each other pilot substance: not checked, not in `pairs`. */
  notCheckedPairs: number;
  warnings: Record<PilotId, PilotWarning>;
  stages: Record<"dgda" | "substances" | "clinical" | "ddinter", StageTally>;
  /** Snapshot-only (§6.8): chapter 4 evidence table counts. */
  evidence: { oclConcept: number; stageResult: number; batchRun: number; reviewDecision: number };
  /** Snapshot-only (§6.8): the glossary's review pilot lines. */
  review: { backInReview: number; engineerChecked: number; issueReported: number; decisions: number; reruns: number };
  /** Chapter 6 "A worked check": DDInter's management text for Warfarin + Acetylsalicylic acid, unchanged. */
  workedCheck: { management: string };
  /** Chapter 6 "Actions": one pair per action, with DDInter's interaction text, unchanged (the page clamps it). */
  actionExamples: ActionExample[];
};

const pair = (a: string, ddinterA: string, b: string, ddinterB: string, severity: Severity, action: string): PilotPair =>
  ({ a, b, ddinterA, ddinterB, severity, action });
const missing = (a: string, ddinterA: string, b: string, ddinterB: string): TextMissingPair => ({ a, b, ddinterA, ddinterB });
const warn = (...textMissing: TextMissingPair[]): PilotWarning => ({ status: "warn", noData: false, textMissing });

const ACET = "Acetaminophen", AMLO = "Amlodipine", ASA = "Acetylsalicylic acid", SIMVA = "Simvastatin", WARF = "Warfarin";
const CLAR = "Clarithromycin", AMOX = "Amoxicillin", METF = "Metformin";

export const PILOT_SNAPSHOT: PilotSnapshot = {
  batchId: "0001-pilot",
  storedOn: "13/10/2026",
  runAt: "2026-10-11T21:27:17.629Z",
  // The host's `g_warfarin_extracted` line ("Before you start"), verbatim; null only when nobody with host access ran it.
  warfarinExtractedAt: null,
  records: {
    [P.amlodipine]: { tradeName: "Amlodipine-5", darNumber: "071-0098-022", company: "Premier Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Amlodipine 5 mg", bdcId: "BDC-000002", clinicalDrug: "Amlodipine 5 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000002:5mg/" },
    [P.aspirin]: { tradeName: "Aspirin", darNumber: "076-0028-006", company: "Apollo Pharmaceutical Laboratories Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Aspirin 300 mg", bdcId: "BDC-000004", clinicalDrug: "Acetylsalicylic acid 300 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000004:300mg/" },
    [P.simvastatin]: { tradeName: "Simvastatin", darNumber: "096-0265-061", company: "Albion Laboratories Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Simvastatin 10 mg", bdcId: "BDC-000006", clinicalDrug: "Simvastatin 10 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000006:10mg/" },
    [P.chloramphenicol]: { tradeName: "Chloramphenicol", darNumber: "127-0163-052", company: "EDCL (Dhaka)", dosageForm: "Eye Drops",
      genericContentRaw: "Chloramphenicol 5 mg/ml", bdcId: "BDC-000008", clinicalDrug: "Chloramphenicol 5 mg/ml eye drops", route: "ophthalmic",
      signature: "eye drops|ophthalmic|BDS-000009:5mg/1ml" },
    [P.domperidone]: { tradeName: "Domperidone", darNumber: "127-0263-018", company: "EDCL (Dhaka)", dosageForm: "Tablet",
      genericContentRaw: "Domperidone 10 mg", bdcId: "BDC-000009", clinicalDrug: "Domperidone 10 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000010:10mg/" },
    [P.warfarin]: { tradeName: "G Warfarin", darNumber: "185-0138-012", company: "Gonoshasthaya Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Warfarin Sodium 5 mg", bdcId: "BDC-000003", clinicalDrug: "Warfarin 5 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000003:5mg/" },
    [P.metformin]: { tradeName: "G-Metformin", darNumber: "185-0241-015", company: "Gonoshasthaya Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Metformin Hydrochloride 500 mg", bdcId: "BDC-000010", clinicalDrug: "Metformin 500 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000011:500mg/" },
    [P.napa]: { tradeName: "Napa", darNumber: "186-0030-006", company: "Beximco Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Paracetamol 500 mg", bdcId: "BDC-000001", clinicalDrug: "Acetaminophen 500 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000001:500mg/" },
    [P.clarith]: { tradeName: "Clarith", darNumber: "239-0407-023", company: "Ibn Sina Pharmaceutical Ind. Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Clarithromycin 500 mg", bdcId: "BDC-000005", clinicalDrug: "Clarithromycin 500 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000005:500mg/" },
    [P.amoxiclav]: { tradeName: "Amoxycillin Clavulanic Acid", darNumber: "420-0026-023", company: "JR Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Amoxicillin + Clavulanic Acid 500 mg + 125 mg", bdcId: "BDC-000007",
      clinicalDrug: "Amoxicillin 500 mg + Clavulanic acid 125 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000007:125mg/;BDS-000008:500mg/" },
  },
  // Board L chapter 6 "DDInter 2.0 records for each pilot substance", in its order.
  substances: [
    { bdsId: "BDS-000002", name: AMLO, product: P.amlodipine,
      codes: { icd11: "XM68M5", rxcui: "17767", atc: ["C08CA01"], drugbank: "DB00381", snomed: ["108537001", "386864001"] },
      entries: [{ id: "DDInter79", route: "systemic" }], drugDrug: { major: 21, moderate: 438, minor: 33, unknown: 299, total: 791 },
      disease: 4, food: 2, coverage: "full" },
    { bdsId: "BDS-000004", name: ASA, product: P.aspirin,
      codes: { icd11: "XM4G06", rxcui: "1191", atc: ["A01AD05", "B01AC06", "N02BA01"], drugbank: "DB00945", snomed: ["387458008", "7947003"] },
      entries: [{ id: "DDInter20", route: "systemic" }], drugDrug: { major: 53, moderate: 246, minor: 45, unknown: 346, total: 690 },
      disease: 9, food: 1, coverage: "full" },
    { bdsId: "BDS-000006", name: SIMVA, product: P.simvastatin,
      codes: { icd11: "XM7AU9", rxcui: "36567", atc: ["C10AA01"], drugbank: "DB00641", snomed: ["387584000", "96304005"] },
      entries: [{ id: "DDInter1675", route: "systemic" }], drugDrug: { major: 59, moderate: 241, minor: 10, unknown: 422, total: 732 },
      disease: 6, food: 2, coverage: "full" },
    { bdsId: "BDS-000009", name: "Chloramphenicol", product: P.chloramphenicol,
      codes: { icd11: "XM2TE7", rxcui: "2348", atc: ["D06AX02", "D10AF03", "G01AA05", "J01BA01", "S01AA01", "S02AA01", "S03AA08"],
        drugbank: "DB00446", snomed: ["372777009", "57191001"] },
      entries: [{ id: "DDInter351", route: "systemic" }, { id: "DDInter352", route: "ophthalmic" }, { id: "DDInter353", route: "otic" }],
      drugDrug: { major: 48, moderate: 536, minor: 21, unknown: 49, total: 654 }, disease: 6, food: 0, coverage: "full" },
    { bdsId: "BDS-000010", name: "Domperidone", product: P.domperidone,
      codes: { icd11: "XM3GF5", rxcui: "3626", atc: ["A03FA03"], drugbank: "DB01184", snomed: ["32955006", "387181004"] },
      entries: [], drugDrug: { major: 0, moderate: 0, minor: 0, unknown: 0, total: 0 }, disease: 0, food: 0, coverage: "none" },
    { bdsId: "BDS-000003", name: WARF, product: P.warfarin,
      codes: { icd11: "XM86W0", rxcui: "11289", atc: ["B01AA03"], drugbank: "DB00682", snomed: ["372756006", "48603004"] },
      entries: [{ id: "DDInter1951", route: "systemic" }], drugDrug: { major: 138, moderate: 427, minor: 71, unknown: 298, total: 934 },
      disease: 8, food: 2, coverage: "full" },
    { bdsId: "BDS-000011", name: METF, product: P.metformin,
      codes: { icd11: "XM0JN5", rxcui: "6809", atc: ["A10BA02"], drugbank: "DB00331", snomed: ["109081006", "372567009"] },
      entries: [{ id: "DDInter1164", route: "systemic" }], drugDrug: { major: 20, moderate: 328, minor: 29, unknown: 310, total: 687 },
      disease: 4, food: 1, coverage: "full" },
    { bdsId: "BDS-000001", name: ACET, product: P.napa,
      codes: { icd11: "XM5DJ7", rxcui: "161", atc: ["N02BE01"], drugbank: "DB00316", snomed: ["387517004", "90332006"] },
      entries: [{ id: "DDInter14", route: "systemic" }], drugDrug: { major: 10, moderate: 85, minor: 38, unknown: 512, total: 645 },
      disease: 3, food: 1, coverage: "full" },
    { bdsId: "BDS-000005", name: CLAR, product: P.clarith,
      codes: { icd11: "XM1VG4", rxcui: "21212", atc: ["J01FA09"], drugbank: "DB01211", snomed: ["387487009", "83999008"] },
      entries: [{ id: "DDInter393", route: "systemic" }], drugDrug: { major: 234, moderate: 403, minor: 51, unknown: 210, total: 898 },
      disease: 5, food: 1, coverage: "full" },
    { bdsId: "BDS-000007", name: "Clavulanic acid", product: P.amoxiclav,
      codes: { icd11: "XM2K88", rxcui: "48203", atc: [], drugbank: "DB00766", snomed: ["395939008"] },
      entries: [{ id: "DDInter394", route: "systemic" }], drugDrug: { major: 7, moderate: 22, minor: 0, unknown: 0, total: 29 },
      disease: 0, food: 0, coverage: "full" },
    { bdsId: "BDS-000008", name: AMOX, product: P.amoxiclav,
      codes: { icd11: "XM7CM1", rxcui: "723", atc: ["J01CA04"], drugbank: "DB01060", snomed: ["27658006", "372687004"] },
      entries: [{ id: "DDInter83", route: "systemic" }], drugDrug: { major: 5, moderate: 29, minor: 8, unknown: 238, total: 280 },
      disease: 5, food: 0, coverage: "full" },
  ],
  pairs: [
    pair(WARF, "DDInter1951", ASA, "DDInter20", "major", "synergy"),
    pair(WARF, "DDInter1951", CLAR, "DDInter393", "major", "metabolism"),
    pair(SIMVA, "DDInter1675", CLAR, "DDInter393", "major", "metabolism"),
    pair(SIMVA, "DDInter1675", AMLO, "DDInter79", "major", "metabolism"),
    pair(ACET, "DDInter14", WARF, "DDInter1951", "moderate", "synergy"),
    pair(ASA, "DDInter20", AMLO, "DDInter79", "moderate", "antagonism"),
    pair(CLAR, "DDInter393", AMLO, "DDInter79", "moderate", "metabolism"),
    pair(WARF, "DDInter1951", AMOX, "DDInter83", "moderate", "synergy"),
    pair(METF, "DDInter1164", WARF, "DDInter1951", "moderate", "metabolism"),
    pair(METF, "DDInter1164", CLAR, "DDInter393", "moderate", "metabolism"),
    pair(SIMVA, "DDInter1675", WARF, "DDInter1951", "minor", "distribution"),
    pair(CLAR, "DDInter393", AMOX, "DDInter83", "minor", "others"),
    pair(ACET, "DDInter14", AMLO, "DDInter79", "unknown", "unknown"),
    pair(WARF, "DDInter1951", AMLO, "DDInter79", "unknown", "unknown"),
    pair(ACET, "DDInter14", ASA, "DDInter20", "unknown", "unknown"),
    pair(ACET, "DDInter14", CLAR, "DDInter393", "unknown", "unknown"),
    pair(ASA, "DDInter20", CLAR, "DDInter393", "unknown", "unknown"),
    pair(ACET, "DDInter14", SIMVA, "DDInter1675", "unknown", "unknown"),
    pair(SIMVA, "DDInter1675", ASA, "DDInter20", "unknown", "unknown"),
    pair(ACET, "DDInter14", AMOX, "DDInter83", "unknown", "unknown"),
    pair(SIMVA, "DDInter1675", AMOX, "DDInter83", "unknown", "unknown"),
    pair(ASA, "DDInter20", AMOX, "DDInter83", "unknown", "unknown"),
    pair(AMLO, "DDInter79", AMOX, "DDInter83", "unknown", "unknown"),
    pair(METF, "DDInter1164", ACET, "DDInter14", "unknown", "unknown"),
    pair(METF, "DDInter1164", SIMVA, "DDInter1675", "unknown", "unknown"),
    pair(METF, "DDInter1164", ASA, "DDInter20", "unknown", "unknown"),
    pair(METF, "DDInter1164", AMLO, "DDInter79", "unknown", "unknown"),
    pair(METF, "DDInter1164", AMOX, "DDInter83", "unknown", "unknown"),
  ],
  notCheckedPairs: 10,
  warnings: {
    [P.amlodipine]: warn(missing(METF, "DDInter1164", AMLO, "DDInter79"), missing(ACET, "DDInter14", AMLO, "DDInter79"),
      missing(WARF, "DDInter1951", AMLO, "DDInter79"), missing(AMLO, "DDInter79", AMOX, "DDInter83")),
    [P.aspirin]: warn(missing(METF, "DDInter1164", ASA, "DDInter20"), missing(ACET, "DDInter14", ASA, "DDInter20"),
      missing(SIMVA, "DDInter1675", ASA, "DDInter20"), missing(ASA, "DDInter20", CLAR, "DDInter393"),
      missing(ASA, "DDInter20", AMOX, "DDInter83")),
    [P.simvastatin]: warn(missing(METF, "DDInter1164", SIMVA, "DDInter1675"), missing(ACET, "DDInter14", SIMVA, "DDInter1675"),
      missing(SIMVA, "DDInter1675", ASA, "DDInter20"), missing(SIMVA, "DDInter1675", AMOX, "DDInter83")),
    [P.chloramphenicol]: { status: "ok", noData: false, textMissing: [] },
    [P.domperidone]: { status: "warn", noData: true, textMissing: [] },
    [P.warfarin]: warn(missing(WARF, "DDInter1951", AMLO, "DDInter79")),
    [P.metformin]: warn(missing(METF, "DDInter1164", ACET, "DDInter14"), missing(METF, "DDInter1164", SIMVA, "DDInter1675"),
      missing(METF, "DDInter1164", ASA, "DDInter20"), missing(METF, "DDInter1164", AMLO, "DDInter79"),
      missing(METF, "DDInter1164", AMOX, "DDInter83")),
    [P.napa]: warn(missing(METF, "DDInter1164", ACET, "DDInter14"), missing(ACET, "DDInter14", SIMVA, "DDInter1675"),
      missing(ACET, "DDInter14", ASA, "DDInter20"), missing(ACET, "DDInter14", CLAR, "DDInter393"),
      missing(ACET, "DDInter14", AMLO, "DDInter79"), missing(ACET, "DDInter14", AMOX, "DDInter83")),
    [P.clarith]: warn(missing(ACET, "DDInter14", CLAR, "DDInter393"), missing(ASA, "DDInter20", CLAR, "DDInter393")),
    [P.amoxiclav]: warn(missing(METF, "DDInter1164", AMOX, "DDInter83"), missing(ACET, "DDInter14", AMOX, "DDInter83"),
      missing(SIMVA, "DDInter1675", AMOX, "DDInter83"), missing(ASA, "DDInter20", AMOX, "DDInter83"),
      missing(AMLO, "DDInter79", AMOX, "DDInter83")),
  },
  stages: {
    dgda: { ok: 10, warn: 0, fail: 0 },
    substances: { ok: 10, warn: 0, fail: 0 },
    clinical: { ok: 10, warn: 0, fail: 0 },
    ddinter: { ok: 1, warn: 9, fail: 0 },
  },
  evidence: { oclConcept: 10, stageResult: 40, batchRun: 2, reviewDecision: 0 },
  review: { backInReview: 0, engineerChecked: 0, issueReported: 0, decisions: 0, reruns: 1 },
  workedCheck: {
    management: "This combination, especially with analgesic/antipyretic aspirin doses, should generally be avoided unless the potential benefit outweighs the risk of bleeding. If concomitant therapy is used for additive anticoagulant effects, monitoring for excessive anticoagulation and overt and occult bleeding is recommended. The INR should be checked frequently and the dosage adjusted accordingly when aspirin is added to an anticoagulant regimen. Be cognizant that bleeding may occur without INR or prothrombin time increases. Patients should be advised to promptly report any signs of bleeding to their physician, including pain, swelling, headache, dizziness, weakness, prolonged bleeding from cuts, vaginal bleeding, nosebleeds, bleeding of gums from brushing, unusual bruising, red or brown urine, or red or black stools. Patients should also be counseled to avoid any other over-the-counter oral or topical salicylate products.",
  },
  actionExamples: [
    { action: "synergy", names: "Warfarin + Acetylsalicylic acid", ddinterA: "DDInter1951", ddinterB: "DDInter20", severity: "major", truncated: true,
      interaction: "Aspirin, even in small doses, may increase the risk of bleeding in patients on oral anticoagulants by inhibiting platelet aggregation, prolonging bleeding time, and inducing gastrointestinal lesions. Analgesic/antipyretic doses of aspirin increase the risk of major bleeding more than low-dose aspirin; however bleeding has also occurred with low-dose aspirin." },
    { action: "metabolism", names: "Simvastatin + Clarithromycin", ddinterA: "DDInter1675", ddinterB: "DDInter393", severity: "major", truncated: false,
      interaction: "Coadministration with potent inhibitors of CYP450 3A4 may significantly increase the plasma concentrations of simvastatin and lovastatin and their active acid metabolites, all of which are primarily metabolized by the isoenzyme." },
    { action: "antagonism", names: "Acetylsalicylic acid + Amlodipine", ddinterA: "DDInter20", ddinterB: "DDInter79", severity: "moderate", truncated: true,
      interaction: "Limited data indicate that some cyclooxygenase inhibitors may attenuate the antihypertensive effects of some calcium channel blockers. The mechanism appears to be related to an alteration of vascular tone, which is dependent on prostacyclins and other vasodilatory prostanoids. When a nonsteroidal anti-inflammatory drug (NSAID) is added to the regimen of a patient who is already taking a calcium channel blocker, increased blood pressure may result. Also, the clinician should be aware that the risk of hypotension is increased when NSAIDs are withdrawn from the regimen." },
    { action: "distribution", names: "Simvastatin + Warfarin", ddinterA: "DDInter1675", ddinterB: "DDInter1951", severity: "minor", truncated: true,
      interaction: "Simvastatin may slightly increase the anticoagulant response to warfarin. The mechanism may be warfarin displacement from protein binding sites. The clinical significance of this interaction has not been established, however, clinical monitoring of patient warfarin response and tolerance is recommended. Simvastatin may interact in a similar way with other oral anticoagulants. Patients should be advised to promptly report any signs of bleeding to their physician, including pain, swelling, headache, dizziness, weakness, prolonged bleeding from cuts, increased menstrual flow, vaginal bleeding, nosebleeds, bleeding of gums from brushing, unusual bleeding or bruising, red or brown urine, or red or black stools." },
    { action: "others", names: "Clarithromycin + Amoxicillin", ddinterA: "DDInter393", ddinterB: "DDInter83", severity: "minor", truncated: true,
      interaction: "Although some in vitro data indicate synergism between macrolide antibiotics and penicillins, other in vitro data indicate antagonism. When these drugs are given together, neither has predictable therapeutic efficacy. Data are available for erythromycin, although theoretically this interaction could occur with any macrolide. Except for monitoring of the effectiveness of antibiotic therapy, no special precautions appear to be necessary." },
    { action: "unknown", names: "Acetaminophen + Amlodipine", ddinterA: "DDInter14", ddinterB: "DDInter79", severity: "unknown", truncated: false,
      interaction: null },
  ],
};

/** The substances of one pilot product, in snapshot order. */
export const substancesOf = (id: PilotId): PilotSubstance[] => PILOT_SNAPSHOT.substances.filter((s) => s.product === id);

/** One substance by its name; throws on a name the snapshot does not hold (a content bug, caught by the tests). */
export function substanceNamed(name: string): PilotSubstance {
  const s = PILOT_SNAPSHOT.substances.find((x) => x.name === name);
  if (!s) throw new Error(`pilot snapshot: no substance named ${name}`);
  return s;
}

/** The DDInter substance name for an entry id, from the snapshot's entries. */
export const entryName = (ddinterId: string): string | null =>
  PILOT_SNAPSHOT.substances.find((s) => s.entries.some((e) => e.id === ddinterId))?.name ?? null;

export function severityCounts(pairs: readonly PilotPair[] = PILOT_SNAPSHOT.pairs): Record<Severity, number> {
  const out: Record<Severity, number> = { major: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const p of pairs) out[p.severity] += 1;
  return out;
}

export function actionCounts(pairs: readonly PilotPair[] = PILOT_SNAPSHOT.pairs): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pairs) out[p.action] = (out[p.action] ?? 0) + 1;
  return out;
}

/** Crosswalk codes held for a substance (ICD-11, RxCUI, ATC, DrugBank, SNOMED CT). */
export const codeCount = (s: PilotSubstance): number => 3 + s.codes.atc.length + s.codes.snomed.length;
```

- [ ] **Step 4: Run it to verify it passes, with the copy guards that now scan `content/`**

Run: `cd web && npx vitest run tests/learn-snapshot.test.ts tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts`
Expected: PASS (4 files; `learn-snapshot.test.ts` has 17 tests). Every later task that adds a chapter re-runs `tests/learn-snapshot.test.ts` with its guards, so the `ids` scan sees each chapter as it lands.

- [ ] **Step 5: Commit**

```bash
git add web/content/learn/pilot-snapshot.ts web/tests/learn-snapshot.test.ts
git commit -m "feat(web): Learn pilot snapshot with the §1.6 counts, proven against Board R's export (§6.8, §11.1)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Learn building blocks — chapter registry, context, shared parts and the content layout module

**Files:**
- Create: `web/content/learn/chapters.ts`, `web/components/learn/context.ts`, `web/components/learn/parts.tsx`, `web/components/learn/learn.module.css`, `web/tests/fixtures/learn-stats.ts`
- Test: `web/tests/learn-parts.test.tsx`

**Interfaces:**
- Consumes: `PILOT_SNAPSHOT`, `PILOT_IDS`, `PilotId` (Task 4); `SiteStats`, `findBatch`, `findItem`, `exampleUsable`, `pillStatus`, `batchPill` (Task 2); `LEARN_NEW`, `fill` (Task 3); `ReviewStatus` (P1A).
- Produces:
  - `@/content/learn/chapters`: `type LearnSection = { id; title }`, `type LearnChapter = { slug; n; nav; title; lede; sections }`, `CHAPTERS` (ten, in order), `type ChapterSlug`, `CHAPTER_SLUGS`, `chapterBySlug(slug): (LearnChapter & { slug: ChapterSlug }) | null` (exact match), `sectionTitle(id): string` (throws on an unknown id). No JSX (the middleware imports it through `lib/surface.ts`, Task 13b).
  - `@/components/learn/context`: `API_STUB_SHAPE: boolean` (false in P3: `GET /v1/products/{id}` does not serve the §7.4 hidden stub yet; a test pins it to `HiddenRecord.java`); `type LearnContext = { stats; batch: StatsBatch | null; usable(id): boolean; item(id): StatsItem | null; tradeName(id): string; pending(id): boolean; apiStub: boolean }`, `learnContext(stats: SiteStats, apiStub = API_STUB_SHAPE): LearnContext` (the pilot batch is the snapshot's `batchId`; `pending(id)` is true while the record's live pill is not "approved").
  - `@/components/learn/parts`: `Chapter({ slug, level: 1 | 2, children })`, `Section({ id, h: 2 | 3, children })`, `ScrollRegion({ label, children })`, `ScrollHint()`, `St({ status: "ok" | "warn" | "fail" })`, `NeutralTag()`, `Ann({ n })`, `DownArrow()`, `GateArrow()`, `LivePill({ ctx, id })`, `BatchNote({ ctx })`, `AsStored()`, `SnapshotBlock({ ctx, ids, pills?: "row" | "inline", className?, children })` (withdrawn blocks carry `data-withdrawn`, shown ones `data-snapshot="{ids}"`).
  - `@/components/learn/learn.module.css`: Board L's content classes, camelCased (`hero`, `lede`, `facts`, `status`, `ch`, `chHead`, `chN`, `chLede`, `sub`, `prose`, `prose2`, `small`, `h4`, `bul`, `card`, `cardLine`, `grid2`, `grid3`, `row`, `fig`, `figcap`, `scroll`, `scrollHint`, `st*`, `neutralTag`, `tbl`, `tblMin`, `tblWide`, `stack`, `cmpSub`, `svg*`, `dg*`, `annWrap`, `ann`, `wbUrl`, `np*`, `legend`, `legendText`, `pubMock`, `jr`, `jrH`, `jrN`, `ec`, `ecWide`, `flow*`, `idx*`, `sz*`, `isNow`, `stg`, `stgH`, `gate*`, `progList`, `why`, `ev`, `sevLegend`, `cnt`, `bar`, `barSeg`, `bG`, `bMajor`, `bModerate`, `bMinor`, `bUnknown`, `barLegend`, `pairSum`, `pairsGroup`, `act`, `actN`, `actB`, `chk*`, `notes`, `noteCard`, `noteH`, `noteGood`, `noteVague`, `quote`, `mockDesk`, `peek*`, `toastDemo`, `toastAt60`, `toastNote`, `ep`, `method`, `acc`, `codePre`, `env`, `exHead`, `req`, `must`, `show`, `gl*`, `faq`, `answer`, `foot`, `snap`, `snapPills`, `withdrawn`, `fgText`, `monoMuted`).
  - `tests/fixtures/learn-stats.ts`: `pilotStats({ approved?, withdrawn?, missing?, batchId? }): SiteStats`.

- [ ] **Step 1: Write the test fixture and the failing test**

Create `web/tests/fixtures/learn-stats.ts`:

```ts
import { PILOT_IDS, PILOT_SNAPSHOT } from "@/content/learn/pilot-snapshot";
import type { SiteStats, StatsItem } from "@/lib/stats";

/**
 * A /v1/stats answer for the pilot, as Learn reads it. By default all ten records are listed, usable and not reviewed.
 * `approved`, `withdrawn` and `missing` take concept ids; `batchId` renames the reported batch.
 */
export function pilotStats(o: { approved?: string[]; withdrawn?: string[]; missing?: string[]; batchId?: string } = {}): SiteStats {
  const items: StatsItem[] = PILOT_IDS.filter((id) => !o.missing?.includes(id)).map((id) => ({
    conceptId: id, tradeName: PILOT_SNAPSHOT.records[id].tradeName,
    status: o.approved?.includes(id) ? "approved" : "not_reviewed", exampleUsable: !o.withdrawn?.includes(id),
  }));
  const approved = items.filter((i) => i.status === "approved").length;
  return {
    registerProducts: 39196, productsLoaded: 10, substances: 11, approvedProducts: approved, inReviewProducts: 10 - approved,
    batches: [{ batchId: o.batchId ?? PILOT_SNAPSHOT.batchId, status: "in_review", itemCount: items.length, approved, items }],
  };
}
```

Create `web/tests/learn-parts.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { API_STUB_SHAPE, learnContext } from "@/components/learn/context";
import { AsStored, BatchNote, Chapter, LivePill, Section, SnapshotBlock, St } from "@/components/learn/parts";
import { CHAPTERS, CHAPTER_SLUGS, chapterBySlug, sectionTitle } from "@/content/learn/chapters";
import { P, PILOT_IDS } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const SECRET = <p>Acetaminophen BDS-000001</p>;

describe("chapter registry (§2.1)", () => {
  it("holds the ten chapters in order, with unique section ids", () => {
    expect(CHAPTER_SLUGS).toEqual(["start", "model", "codes", "process", "why", "interactions", "reviewers", "partners", "glossary", "faq"]);
    expect(CHAPTERS.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const ids = CHAPTERS.flatMap((c) => c.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds a chapter by its exact slug only", () => {
    expect(chapterBySlug("codes")?.title).toBe("Our IDs and the code systems");
    for (const s of ["Start", "start ", "start/", "", "glossary.html", "../start"]) expect(chapterBySlug(s)).toBeNull();
  });

  it("names the corrected chapter 6 section (§1.6 item 5) and refuses an unknown id", () => {
    expect(sectionTitle("int-pilot")).toBe("The pairs that apply to the pilot products");
    expect(() => sectionTitle("int-35")).toThrow("Learn: no section int-35");
  });
});

describe("Chapter and Section headings (§6.8, §10.5)", () => {
  it("prints the numbered chapter title as h1 or h2 and the section title from the registry", () => {
    const one = html(<Chapter slug="codes" level={1}><Section id="codes-ids" h={2}><p>x</p></Section></Chapter>);
    expect(one).toContain('<section class="ch" id="codes" aria-labelledby="h-codes">');
    expect(one).toContain('<h1 id="h-codes"><span class="chN">3</span> Our IDs and the code systems</h1>');
    expect(one).toContain('<div class="sub" id="codes-ids"><h2>Why our own BDS and BDC ids</h2>');
    const start = html(<Chapter slug="start" level={2}><Section id="start-what" h={3}><p>x</p></Section></Chapter>);
    expect(start).toContain('<h2 id="h-start">');
    expect(start).toContain("<h3>What IntelliDrugs is</h3>");
  });

  it("prints a stage word with its icon", () => {
    expect(html(<St status="warn" />)).toBe('<span class="st stWarn"><span class="ico" aria-hidden="true"></span>Warning</span>');
  });
});

describe("SnapshotBlock: frozen examples and live pills (§6.8)", () => {
  it("shows the example with each record's live pill", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats({ approved: [P.napa] }))} ids={[P.napa, P.aspirin]}>{SECRET}</SnapshotBlock>);
    expect(out).toContain("Acetaminophen BDS-000001");
    expect(out).toContain('data-snapshot="186-0030-006--napa 076-0028-006--aspirin"');
    expect(out).toMatch(/<b>Napa<\/b><span class="rv rv--approved">Approved by a pharmacist<\/span>/);
    expect(out).toMatch(new RegExp(`<b>Aspirin</b><span class="rv rv--pending">${NOT_REVIEWED}</span>`));
  });

  it("an example drawn on all ten records carries the batch's pill and count instead", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats())} ids={PILOT_IDS}>{SECRET}</SnapshotBlock>);
    expect(out).toContain("All 10 pilot records, batch <span class=\"mono\">0001-pilot</span>.");
    expect(out).toContain('class="rv rv--pending"');
  });

  it("with pills inline it prints no pill row", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats())} ids={[P.napa]} pills="inline">{SECRET}</SnapshotBlock>);
    expect(out).not.toContain("snapPills");
    expect(out).toContain("Acetaminophen BDS-000001");
  });

  it("is withdrawn to the stub when a record has an issue or left the batch file (exampleUsable false)", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats({ withdrawn: [P.aspirin] }))} ids={[P.napa, P.aspirin]}>{SECRET}</SnapshotBlock>);
    expect(out).not.toContain("Acetaminophen");
    expect(out).not.toContain("BDS-");
    expect(out).toContain("data-withdrawn");
    expect(out).toMatch(new RegExp(`<li><b>Aspirin</b><span class="rv rv--pending">${NOT_REVIEWED}</span></li>`));
    expect(out).toMatch(/<li><b>Napa<\/b><span class="rv rv--pending">/);
  });

  it("a record /v1/stats does not report withdraws its block (Review Focus 2)", () => {
    for (const stats of [pilotStats({ missing: [P.napa] }), pilotStats({ batchId: "0002-renamed" }),
      { ...pilotStats(), batches: [] }]) {
      const out = html(<SnapshotBlock ctx={learnContext(stats)} ids={[P.napa]}>{SECRET}</SnapshotBlock>);
      expect(out).not.toContain("Acetaminophen");
      expect(out).toMatch(new RegExp(`<li><b>Napa</b><span class="rv rv--pending">${NOT_REVIEWED}</span></li>`));
    }
  });
});

describe("live pieces", () => {
  it("LivePill and BatchNote follow /v1/stats", () => {
    const ctx = learnContext(pilotStats({ approved: [...PILOT_IDS] }));
    expect(html(<LivePill ctx={ctx} id={P.napa} />)).toContain("rv--approved");
    expect(html(<BatchNote ctx={ctx} />)).toContain("rv--approved");
    expect(html(<BatchNote ctx={learnContext(pilotStats({ missing: [P.napa] }))} />)).toContain("All 9 pilot records");
  });

  it("AsStored prints the snapshot date suffix (§1.7)", () => {
    expect(html(<AsStored />)).toBe('<span class="small">, as stored on 13/10/2026</span>');
  });

  it("pending(id) follows the live pill", () => {
    const ctx = learnContext(pilotStats({ approved: [P.napa] }));
    expect([ctx.pending(P.napa), ctx.pending(P.aspirin)]).toEqual([false, true]);
    expect(learnContext(pilotStats({ missing: [P.napa] })).pending(P.napa)).toBe(true);
  });
});

describe("API_STUB_SHAPE follows the API (§6.8 'Before P2')", () => {
  it("is true exactly when GET /v1/products/{id} serves the §7.4 hidden stub (no reviewStatus)", () => {
    const src = readFileSync(fileURLToPath(new URL("../../api/src/main/java/com/niramoy/bddrug/domain/HiddenRecord.java", import.meta.url)), "utf8");
    const product = /record Product\(([^)]*)\)/.exec(src)![1];
    // When P2 changes the stub, this fails until API_STUB_SHAPE turns on chapter 1's and chapter 8's API sentences.
    expect(API_STUB_SHAPE).toBe(!product.includes("reviewStatus") && product.includes("String status"));
    expect(learnContext(pilotStats()).apiStub).toBe(API_STUB_SHAPE);
    expect(learnContext(pilotStats(), true).apiStub).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-parts.test.tsx`
Expected: FAIL: `Failed to resolve import "@/components/learn/context"`.

- [ ] **Step 3: Write the registry, the context, the parts and the layout module**

Create `web/content/learn/chapters.ts`:

```ts
/**
 * The ten Learn chapters (spec §2.1, §6.8): slug, number, nav label, title, lede and the sections the "On this page"
 * rail lists. Names only, no JSX: lib/surface.ts (and through it the middleware) imports this file. Titles, ledes and
 * section headings are Board L's, with §1.6 item 5's "The pairs that apply to the pilot products".
 */
export type LearnSection = { id: string; title: string };
export type LearnChapter = { slug: string; n: number; nav: string; title: string; lede: string; sections: readonly LearnSection[] };

const s = (id: string, title: string): LearnSection => ({ id, title });

export const CHAPTERS = [
  { slug: "start", n: 1, nav: "Start here", title: "Start here",
    lede: "IntelliDrugs links every medicine registered in Bangladesh to the substances inside it, to the codes other systems use, and to published interaction data. A pharmacist checks each record before anyone outside the team can see it.",
    sections: [s("start-what", "What IntelliDrugs is"), s("start-who", "Who it is for"), s("start-not", "What it is not"),
      s("start-read", "How to read a record")] },
  { slug: "model", n: 2, nav: "The model", title: "The model",
    lede: "Three levels carry every record: the brand product DGDA registered, the clinical drug it is, and the substances inside it. Codes and interactions hang off the substance, so one DDInter record serves every brand that contains it.",
    sections: [s("model-diagram", "Brand product, clinical drug, substance"), s("model-napa", "Napa, traced through the model"),
      s("model-edges", "Edge cases from the pilot")] },
  { slug: "codes", n: 3, nav: "IDs and code systems", title: "Our IDs and the code systems",
    lede: "External codes change, merge or go missing for medicines sold only in Bangladesh. So every substance and clinical drug gets our own permanent id, and the outside codes hang off it as crosswalks.",
    sections: [s("codes-ids", "Why our own BDS and BDC ids"), s("codes-systems", "What each code is for"),
      s("codes-match", "How a code is matched")] },
  { slug: "process", n: 4, nav: "The process", title: "The process",
    lede: "Records enter in small batches. A pipeline runs four checks on each one and keeps every source response. People then compare the source with what we extracted, and only a pharmacist's approval makes a record public.",
    sections: [s("process-flow", "The whole flow"), s("process-batches", "Batches of 10, then 50, then 100"),
      s("process-stages", "Four stage checks"), s("process-evidence", "Evidence is kept"), s("process-gate", "The review gate"),
      s("process-rerun", "A re-run sends a record back to review"), s("process-done", "A batch is approved when every record is")] },
  { slug: "why", n: 5, nav: "Why it works this way", title: "Why it works this way",
    lede: "Each rule below exists because the simpler choice would put a wrong or unchecked fact in front of a prescriber.",
    sections: [s("why-dgda", "Why DGDA is the source of truth"), s("why-substance", "Why interactions attach to substances"),
      s("why-batches", "Why people review in small batches"), s("why-nodata", "Why no data never means safe"),
      s("why-unclassified", "Why unclassified severity stands apart"), s("why-pharmacist", "Why only a pharmacist can publish")] },
  { slug: "interactions", n: 6, nav: "Interactions explained", title: "Interactions explained",
    lede: "Interaction data comes from DDInter 2.0. We show DDInter's grade, mechanism and text as DDInter gives them, and we say plainly where DDInter has nothing.",
    sections: [s("int-severity", "Severity levels"), s("int-pilot", "The pairs that apply to the pilot products"),
      s("int-substance", "Per substance"), s("int-actions", "Actions: how two drugs interact"),
      s("int-disease", "Drug–disease, drug–food and coverage"), s("int-check", "A worked check")] },
  { slug: "reviewers", n: 7, nav: "For reviewers", title: "For reviewers",
    lede: "Reviewers are pharmacists and engineers, invited by the team. You sign in with Google, open a batch, and compare each record's DGDA source with what the pipeline extracted.",
    sections: [s("rev-checklist", "The review checklist"), s("rev-labels", "What each relation label means"),
      s("rev-warnings", "Each record's DDInter warning, pair by pair"), s("rev-issue", "How to report a good issue"),
      s("rev-decide", "Deciding: Looks correct, with an undo window"), s("rev-keys", "Keyboard shortcuts")] },
  { slug: "partners", n: 8, nav: "For partners", title: "For partners",
    lede: "The REST API serves the same records as the website. Without reviewer access it returns approved records only, and it says so when a record is not approved yet.",
    sections: [s("api-status", "Where the API stands"), s("api-endpoints", "Endpoints"), s("api-envelope", "The response envelope"),
      s("api-product", "Example: a product"), s("api-check", "Example: an interaction check"),
      s("api-must", "Safety fields you must display"), s("api-versions", "Versioning and data releases")] },
  { slug: "glossary", n: 9, nav: "Glossary", title: "Glossary",
    lede: "Every term used on IntelliDrugs, with a one-line definition and a real example from the pilot.",
    sections: [s("gl-terms", "Terms A to Z")] },
  { slug: "faq", n: 10, nav: "FAQ", title: "FAQ",
    lede: "Short answers to the questions people ask first.",
    sections: [s("faq-list", "Questions")] },
] as const satisfies readonly LearnChapter[];

export type ChapterSlug = (typeof CHAPTERS)[number]["slug"];
export const CHAPTER_SLUGS: readonly ChapterSlug[] = CHAPTERS.map((c) => c.slug);

/** The chapter for an exact slug (case and spelling as in §2.1), or null. */
export function chapterBySlug(slug: string): LearnChapter & { slug: ChapterSlug } | null {
  return CHAPTERS.find((c) => c.slug === slug) ?? null;
}

/** A section heading by its id; throws on an unknown id (a content bug, caught by the chapter tests). */
export function sectionTitle(id: string): string {
  for (const c of CHAPTERS) for (const x of c.sections) if (x.id === id) return x.title;
  throw new Error(`Learn: no section ${id}`);
}
```

Create `web/components/learn/context.ts`:

```ts
import { PILOT_SNAPSHOT, type PilotId } from "@/content/learn/pilot-snapshot";
import { exampleUsable, findBatch, findItem, pillStatus, type SiteStats, type StatsBatch, type StatsItem } from "@/lib/stats";

/**
 * True once GET /v1/products/{id} serves the §7.4 hidden stub ({conceptId, tradeName, status, batchId, hidden}, no
 * reviewStatus) and notReviewed[] carries tradeName. P2 ships that; until then Learn leaves out the sentences that
 * describe it (§6.8 "Before P2"). learn-parts.test.tsx pins this constant to HiddenRecord.java.
 */
export const API_STUB_SHAPE = false;

/**
 * What every Learn chapter renders from: the live /v1/stats answer and the one rule that decides whether a frozen pilot
 * example may show (§6.8). The pilot batch is the snapshot's; a record that batch does not report is not usable.
 */
export type LearnContext = {
  stats: SiteStats;
  /** The snapshot's batch as /v1/stats reports it, or null when it is not reported. */
  batch: StatsBatch | null;
  usable: (id: PilotId) => boolean;
  item: (id: PilotId) => StatsItem | null;
  /** The live trade name, else the snapshot's. */
  tradeName: (id: PilotId) => string;
  /** True while the record's live pill is not "approved" (§6.8 "Approval-state sentences"). */
  pending: (id: PilotId) => boolean;
  /** API_STUB_SHAPE, overridable in tests. */
  apiStub: boolean;
};

export function learnContext(stats: SiteStats, apiStub: boolean = API_STUB_SHAPE): LearnContext {
  const batch = findBatch(stats, PILOT_SNAPSHOT.batchId);
  return {
    stats,
    batch,
    usable: (id) => exampleUsable(batch, id),
    item: (id) => findItem(batch, id),
    tradeName: (id) => findItem(batch, id)?.tradeName ?? PILOT_SNAPSHOT.records[id].tradeName,
    pending: (id) => pillStatus(findItem(batch, id)) !== "approved",
    apiStub,
  };
}
```

Create `web/components/learn/parts.tsx`:

```tsx
import type { ReactNode } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { CHAPTERS, sectionTitle, type ChapterSlug } from "@/content/learn/chapters";
import { PILOT_IDS, PILOT_SNAPSHOT, type PilotId } from "@/content/learn/pilot-snapshot";
import { LEARN_NEW, fill } from "@/lib/copy";
import { batchPill, pillStatus } from "@/lib/stats";
import type { LearnContext } from "./context";
import styles from "./learn.module.css";

/**
 * Pieces every Learn chapter shares (§6.8). Server components only. `SnapshotBlock` is the one place that decides
 * whether a frozen pilot example may show.
 */

/** One chapter: `<section>` with its numbered title (h2 on /learn/start under the hero's h1, h1 elsewhere) and lede. */
export function Chapter({ slug, level, children }: { slug: ChapterSlug; level: 1 | 2; children: ReactNode }) {
  const c = CHAPTERS.find((x) => x.slug === slug)!;
  const H = level === 1 ? "h1" : "h2";
  return (
    <section className={styles.ch} id={slug} aria-labelledby={`h-${slug}`}>
      <div className={styles.chHead}>
        <H id={`h-${slug}`}><span className={styles.chN}>{c.n}</span>{" "}{c.title}</H>
        <p className={styles.chLede}>{c.lede}</p>
      </div>
      {children}
    </section>
  );
}

/** One section with its registry title: h3 on /learn/start, h2 elsewhere (§6.8 "Headings"). */
export function Section({ id, h, children }: { id: string; h: 2 | 3; children: ReactNode }) {
  const H = h === 2 ? "h2" : "h3";
  return <div className={styles.sub} id={id}><H>{sectionTitle(id)}</H>{children}</div>;
}

/** §10.4: a wide table or diagram in its own labelled, keyboard-scrollable region. */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.scroll} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

export function ScrollHint() {
  return <p className={styles.scrollHint}>Scroll sideways to see the whole diagram.</p>;
}

const ST = { ok: [styles.stOk, "OK"], warn: [styles.stWarn, "Warning"], fail: [styles.stFail, "Failed"] } as const;
/** A stage status word with its icon (Board L `.st`). */
export function St({ status }: { status: keyof typeof ST }) {
  return <span className={`${styles.st} ${ST[status][0]}`}><span className="ico" aria-hidden="true" />{ST[status][1]}</span>;
}

/** Coverage `full`: neutral text, never green (Board L `.neutral-tag`). */
export function NeutralTag() {
  return <span className={styles.neutralTag}><span className="ico" aria-hidden="true" />Interaction data found</span>;
}

/** The numbered marker of the annotated record (Board L `.ann`). */
export function Ann({ n }: { n: number }) {
  return <span className={styles.ann}>{n}</span>;
}

/** The down arrow between flow nodes (Board L edge cases). */
export function DownArrow() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
      <path d="M6 1v12M1.5 9 6 13.5 10.5 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The right arrow in the review gate table. */
export function GateArrow() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      <path d="M1 6h13M10 1.5 14.5 6 10 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A pilot record's live pill (§6.8 "Status pills are live"): from /v1/stats, never from the snapshot. */
export function LivePill({ ctx, id }: { ctx: LearnContext; id: PilotId }) {
  return <ReviewStatus status={pillStatus(ctx.item(id))} />;
}

/** The pilot batch's live pill and "All {n} pilot records, batch {id}." (Board L nav note). */
export function BatchNote({ ctx }: { ctx: LearnContext }) {
  return (
    <>
      <ReviewStatus status={batchPill(ctx.batch)} />
      <span>All {ctx.batch?.itemCount ?? 0} pilot records, batch <span className="mono">{PILOT_SNAPSHOT.batchId}</span>.</span>
    </>
  );
}

/** ", as stored on {date}" after a snapshot-only value (§6.8, §1.7). */
export function AsStored() {
  return <span className={styles.small}>, {fill(LEARN_NEW.asStored, { date: PILOT_SNAPSHOT.storedOn })}</span>;
}

/**
 * A frozen pilot example (§6.8), keyed by the records it draws on. It shows only while /v1/stats reports every one of
 * them as usable; otherwise each record is shown as the §6.4 stub (trade name and its pill), with no clinical value.
 * `pills="row"` (the default) prints the records' live pills above the example (the whole batch's pill for a block
 * that draws on all ten); `pills="inline"` when the example prints each record's LivePill itself.
 */
export function SnapshotBlock({ ctx, ids, pills = "row", className, children }: {
  ctx: LearnContext; ids: readonly PilotId[]; pills?: "row" | "inline"; className?: string; children: ReactNode;
}) {
  const cls = className ? `${styles.snap} ${className}` : styles.snap;
  if (!ids.every((id) => ctx.usable(id))) {
    return (
      <div className={cls} data-withdrawn="">
        <ul className={styles.withdrawn}>
          {ids.map((id) => <li key={id}><b>{ctx.tradeName(id)}</b><LivePill ctx={ctx} id={id} /></li>)}
        </ul>
      </div>
    );
  }
  const all = PILOT_IDS.every((id) => ids.includes(id));
  return (
    <div className={cls} data-snapshot={ids.join(" ")}>
      {pills === "row" && (all
        ? <p className={styles.snapPills}><BatchNote ctx={ctx} /></p>
        : <p className={styles.snapPills}>{ids.map((id) => <span key={id} className={styles.row}><b>{ctx.tradeName(id)}</b><LivePill ctx={ctx} id={id} /></span>)}</p>)}
      {children}
    </div>
  );
}
```

Create `web/components/learn/learn.module.css` (Board L lines "Page head" to "FAQ" and its footer, same values; Board L's inline styles become `fgText` and `monoMuted`, the bar segments' `flex` reads `--w` (§3.1), the toast picture's 60% bar is `toastAt60`, and the definition lists in `dgRead` style `dt`/`dd` because a `<dl>` may hold only those):

```css
/*
 * Board L page layout (its second <style> block), ported with the same values (spec §3.1, §6.8). Tokens only. The
 * tokens.css classes (.sev, .rv, .stage, .code, .raw, .banner, .kbd, .btn, .pair, .cmp, .match, .toast, .seg, .window,
 * .decision-bar, .search, .example) stay global; this module holds only Board L's own rules, renamed to camelCase.
 */

/* Page head (/learn/start only) */
.hero { display: flex; flex-direction: column; gap: 18px; }
.hero h1 { font: var(--t-display); letter-spacing: var(--tr-display); font-size: clamp(36px, 6vw, 52px); }
.lede { font-size: clamp(17px, 1.9vw, 19px); line-height: 1.5; color: var(--fg-2); max-width: 60ch; letter-spacing: -.006em; }
.facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-1); overflow: hidden; }
.facts div { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; min-width: 0; box-shadow: inset -1px 0 0 var(--line); }
.facts div:last-child { box-shadow: none; }
.facts b { font: 600 22px/1.15 var(--font-ui); letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.facts span { font-size: 12.5px; color: var(--fg-2); }
@media (max-width: 760px) {
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .facts div { box-shadow: inset -1px -1px 0 var(--line); }
}
.status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 13.5px; color: var(--fg-2); }

/* Chapters and sections. On /learn/start the chapter title is an h2 and sections h3; elsewhere h1 and h2 (§6.8). */
.ch { display: flex; flex-direction: column; gap: 36px; scroll-margin-top: 72px; }
.chHead { display: flex; flex-direction: column; gap: 10px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.chHead h1, .chHead h2 { font: var(--t-title1); letter-spacing: var(--tr-title1); font-size: clamp(25px, 3.2vw, 30px); display: flex; align-items: baseline; gap: 14px; }
.chN { font-weight: 500; color: var(--fg-3); font-variant-numeric: tabular-nums; }
.chLede { font-size: 16.5px; line-height: 1.5; color: var(--fg-2); max-width: 64ch; }
.sub { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 72px; min-width: 0; }
.sub > h2, .sub > h3 { font: var(--t-title2); letter-spacing: var(--tr-title2); }
.prose { display: flex; flex-direction: column; gap: 10px; max-width: 68ch; }
.prose2 { color: var(--fg-2); }
.small { font-size: 13px; color: var(--fg-2); }
.h4 { font: var(--t-title3); letter-spacing: var(--tr-title3); }
.bul { display: flex; flex-direction: column; gap: 6px; padding-left: 18px; list-style: disc; }
.bul li::marker { color: var(--fg-2); }
.card { background: var(--surface); border-radius: var(--r-panel); box-shadow: var(--shadow-1); padding: 18px 20px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.cardLine { background: var(--canvas); box-shadow: inset 0 0 0 1px var(--line-strong); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 760px) { .grid2, .grid3 { grid-template-columns: minmax(0, 1fr); } }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.fig { display: flex; flex-direction: column; gap: 10px; min-width: 0; margin: 0; }
.figcap { font-size: 13px; color: var(--fg-2); max-width: 74ch; }
.scroll { overflow-x: auto; border-radius: var(--r-panel); background: var(--canvas); box-shadow: inset 0 0 0 1px var(--line-strong); -webkit-overflow-scrolling: touch; }
.scroll:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.scroll > svg { display: block; width: 100%; height: auto; }
.scrollHint { display: none; font-size: 12.5px; color: var(--fg-2); }
@media (max-width: 860px) { .scrollHint { display: block; } }
.st { display: inline-flex; align-items: center; gap: 5px; font: 600 12.5px/1.2 var(--font-ui); white-space: nowrap; }
.st :global(.ico) { width: 14px; height: 14px; }
.stOk { color: var(--fg-2); }
.stOk :global(.ico) { --ico: var(--i-check); }
.stWarn { color: var(--warn); }
.stWarn :global(.ico) { --ico: var(--i-warn); }
.stFail { color: var(--crit); }
.stFail :global(.ico) { --ico: var(--i-fail); }
.neutralTag { display: inline-flex; align-items: center; gap: 6px; font: 500 12.5px/1.2 var(--font-ui); color: var(--fg); }
.neutralTag :global(.ico) { --ico: var(--i-info); width: 14px; height: 14px; color: var(--fg-2); }

/* Tables */
.tbl { width: 100%; font-size: 13.5px; }
.tbl caption { text-align: left; padding: 12px 14px 6px; font: 600 13.5px/1.3 var(--font-ui); color: var(--fg); }
.tbl th, .tbl td { padding: 10px 14px; text-align: left; vertical-align: top; border-top: 1px solid var(--line); }
.tbl thead th { font: 600 12px/1.3 var(--font-ui); color: var(--fg-2); border-top: 0; vertical-align: bottom; }
.tbl tbody th { font-weight: 600; color: var(--fg); }
.tbl td :global(.sev), .tbl td :global(.rv) { margin: 0 4px 4px 0; }
.stack { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.tblMin { min-width: 720px; }
.tblWide { min-width: 860px; }
.cmpSub { display: block; font-size: 12px; color: var(--fg-2); margin-top: 2px; }

/* SVG diagrams */
.svgBg { fill: var(--canvas); }
.svgBand { fill: var(--surface-2); }
.svgSep { stroke: var(--line); stroke-width: 1; }
.svgBox { fill: var(--surface); stroke: var(--line-strong); stroke-width: 1; }
.svgKey { fill: var(--canvas); stroke: var(--line-ctl); stroke-width: 1.5; }
.svgT { fill: var(--fg); font-family: var(--font-ui); font-size: 14px; font-weight: 600; }
.svgS { fill: var(--fg-2); font-family: var(--font-ui); font-size: 12px; }
.svgM { fill: var(--fg-2); font-family: var(--font-mono); font-size: 11px; }
.svgC { fill: var(--fg); font-family: var(--font-ui); font-size: 11.5px; font-weight: 600; }
.svgV { fill: var(--fg-2); font-family: var(--font-ui); font-size: 11.5px; font-weight: 500; }
.svgLt { fill: var(--fg); font-family: var(--font-ui); font-size: 13px; font-weight: 600; }
.svgE { stroke: var(--fg-2); stroke-width: 1.5; fill: none; }
.svgLoop { stroke: var(--fg-2); stroke-width: 1.5; fill: none; stroke-dasharray: 6 4; }
.svgAh { fill: var(--fg-2); }
.dgEntity { min-width: 860px; }
.dgSwim { min-width: 800px; }
.dgMatch { min-width: 760px; }
.dgRead { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; font-size: 13.5px; }
.dgRead > div { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-top: 1px solid var(--line); }
.dgRead b, .dgRead dt { font-weight: 600; }
.dgRead span, .dgRead dd { color: var(--fg-2); }
@media (max-width: 760px) { .dgRead { grid-template-columns: minmax(0, 1fr); } }

/* Annotated record */
.annWrap { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 22px; align-items: start; }
@media (max-width: 980px) { .annWrap { grid-template-columns: minmax(0, 1fr); } }
.ann { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--fg); color: var(--canvas); font: 600 11px/1 var(--font-ui); flex: none; font-variant-numeric: tabular-nums; }
.wbUrl { font-size: 12px; color: var(--fg-2); margin-left: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np { padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.npCrumb { font-size: 12.5px; color: var(--fg-2); }
.npTitle { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.npTitle b { font: 600 26px/1.1 var(--font-ui); letter-spacing: -.022em; }
.npMeta { font-size: 13.5px; color: var(--fg-2); }
.npBlock { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: var(--r-card); box-shadow: inset 0 0 0 1px var(--line-strong); background: var(--canvas); min-width: 0; }
.npK { font: 500 12px/1.3 var(--font-ui); color: var(--fg-2); }
.npV { font-size: 14px; }
.npIng { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.npIng b { font: 600 15px/1.3 var(--font-ui); }
.legend { display: flex; flex-direction: column; gap: 2px; }
.legend li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.legend li:last-child { border-bottom: 0; }
.legend b { display: block; font-weight: 600; color: var(--fg); }
.legendText { color: var(--fg-2); }
.pubMock { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: var(--r-panel); background: var(--canvas); box-shadow: inset 0 0 0 1px var(--line-strong); }

/* Journey */
.jr { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 860px) { .jr { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .jr { grid-template-columns: minmax(0, 1fr); } }
.jr li { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-1); min-width: 0; }
.jrH { display: flex; align-items: center; gap: 8px; font: 600 14px/1.3 var(--font-ui); }
.jrN { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--surface-3); font: 600 12px/1 var(--font-ui); font-variant-numeric: tabular-nums; color: var(--fg); }
.jr dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; font-size: 13px; }
.jr dt { color: var(--fg-2); }
.jr dd { min-width: 0; overflow-wrap: anywhere; }
.jr :global(.rv) { white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.25; max-width: 100%; }

/* Edge-case flows */
.ec { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 760px) { .ec { grid-template-columns: minmax(0, 1fr); } }
.ec .card { gap: 12px; }
.ecWide { grid-column: 1 / -1; }
.flow { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.flowNode { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 10px; border-radius: var(--r-card); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line-strong); font-size: 13px; max-width: 100%; }
.flowKey { background: var(--canvas); box-shadow: inset 0 0 0 1.5px var(--line-ctl); }
.flowStep { display: flex; align-items: center; gap: 8px; padding-left: 12px; min-height: 26px; font-size: 12.5px; color: var(--fg-2); }
.flowStep svg { flex: none; }
.flowSplit { display: flex; flex-wrap: wrap; gap: 8px; }
.flowLab { font: 500 12px/1.3 var(--font-ui); color: var(--fg-2); }

/* IDs */
.idx { display: flex; flex-wrap: wrap; gap: 18px 28px; }
.idxOne { display: flex; flex-direction: column; gap: 8px; }
.idxParts { display: flex; align-items: flex-start; gap: 4px; }
.idxPart { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.idxPart code { font: 500 clamp(22px, 3.6vw, 30px)/1 var(--font-mono); letter-spacing: 0; padding: 8px 10px; border-radius: var(--r-chip); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--fg); }
.idxPart span { font-size: 12px; color: var(--fg-2); max-width: 20ch; }

/* Process */
.sz { display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr) auto; gap: 12px; align-items: center; }
.szN { width: 92px; min-height: 88px; border-radius: var(--r-card); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: var(--surface); box-shadow: var(--shadow-1); padding: 8px; }
.szN b { font: 600 28px/1 var(--font-ui); letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.szN span { font-size: 12px; color: var(--fg-2); }
.isNow { box-shadow: inset 0 0 0 2px var(--accent), var(--shadow-1); }
.szC { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--fg-2); }
.szC svg { width: 100%; height: 12px; }
.szBack { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--r-card); box-shadow: inset 0 0 0 1.5px var(--line-ctl); font-size: 13.5px; }
.szBack svg { flex: none; margin-top: 2px; }
@media (max-width: 640px) {
  .sz { grid-template-columns: minmax(0, 1fr); }
  .szN { width: 100%; min-height: 64px; flex-direction: row; gap: 8px; }
  .szC svg { display: none; }
}
.stg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 760px) { .stg { grid-template-columns: minmax(0, 1fr); } }
.stgH { display: flex; align-items: baseline; gap: 10px; }
.stgH :global(.mono) { color: var(--fg-2); }
.stg dl { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 6px 12px; font-size: 13px; }
.stg dt { color: var(--fg-2); }
.stg dd { min-width: 0; overflow-wrap: anywhere; }
.stg dd ul { display: flex; flex-direction: column; gap: 4px; }
.gate { display: flex; flex-direction: column; gap: 0; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); background: var(--canvas); overflow: hidden; }
.gateRow { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.5fr) minmax(0, 1.1fr) 92px; gap: 12px; align-items: center; padding: 12px 14px; border-top: 1px solid var(--line); font-size: 13.5px; }
.gateRow:first-child { border-top: 0; }
.gateHead { font: 600 12px/1.3 var(--font-ui); color: var(--fg-2); background: var(--surface-2); }
.gateEv { display: flex; align-items: center; gap: 8px; color: var(--fg); }
.gateEv svg { flex: none; }
.gatePub { font-weight: 600; }
.gatePubNo { color: var(--fg-2); font-weight: 500; }
@media (max-width: 700px) {
  .gateRow { grid-template-columns: minmax(0, 1fr); }
  .gateHead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .gatePub::before { content: "Public: "; font-weight: 500; color: var(--fg-2); }
}
.progList { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 640px) { .progList { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.progList li { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: var(--r-card); background: var(--canvas); box-shadow: inset 0 0 0 1px var(--line-strong); font-size: 13px; min-width: 0; }
.progList li b { font-weight: 600; white-space: normal; overflow-wrap: anywhere; }
.progList li :global(.rv) { white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.25; align-self: flex-start; max-width: 100%; }

/* Why */
.why { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 40px; border-top: 1px solid var(--line); }
@media (max-width: 760px) { .why { grid-template-columns: minmax(0, 1fr); } }
.why > li { display: flex; flex-direction: column; gap: 6px; padding: 20px 0; border-bottom: 1px solid var(--line); scroll-margin-top: 72px; }
.why > li > h2, .why > li > h3 { font: 600 16px/1.3 var(--font-ui); letter-spacing: -.01em; }
.why > li > p { font-size: 14.5px; color: var(--fg-2); }
.ev { font-size: 13px; color: var(--fg); display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }

/* Interactions */
.sevLegend { display: flex; flex-direction: column; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); background: var(--canvas); overflow: hidden; }
.sevLegend li { display: grid; grid-template-columns: minmax(0, 280px) minmax(0, 1fr) 64px; gap: 12px 18px; align-items: center; padding: 12px 14px; border-top: 1px solid var(--line); font-size: 13.5px; }
.sevLegend li:first-child { border-top: 0; }
.cnt { font: 600 15px/1 var(--font-ui); font-variant-numeric: tabular-nums; text-align: right; }
.cnt small { display: block; font: 400 11.5px/1.3 var(--font-ui); color: var(--fg-2); margin-top: 3px; }
@media (max-width: 700px) {
  .sevLegend li { grid-template-columns: minmax(0, 1fr) auto; }
  .sevLegend li p { grid-column: 1 / -1; grid-row: 2; }
}
.bar { display: flex; height: 28px; border-radius: var(--r-sev); overflow: hidden; gap: 2px; }
.bar i { display: flex; align-items: center; justify-content: center; height: 100%; min-width: 14px; border: 1px solid transparent; overflow: hidden; }
.barSeg { flex: var(--w) 1 0; }
.bG { display: block; width: 10px; height: 10px; flex: none; background: currentColor; }
.bar .bMajor { color: var(--crit); background: var(--crit-soft); border-color: var(--crit); }
.bMajor .bG { clip-path: polygon(50% 4%, 100% 96%, 0 96%); }
.bar .bModerate { color: var(--warn); background: var(--warn-soft); border-color: var(--warn); }
.bModerate .bG { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.bar .bMinor { color: var(--info); background: var(--info-soft); border-color: var(--info); }
.bMinor .bG { width: 9px; height: 9px; border-radius: 50%; }
.bar .bUnknown { color: var(--fg); background: transparent; border: 1px dashed var(--line-ctl); }
.bUnknown .bG { width: 12px; height: 12px; border-radius: 50%; background: transparent; border: 1.25px dashed currentColor; }
.barLegend { display: flex; flex-wrap: wrap; gap: 6px; }
.pairSum { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; }
.pairsGroup { display: flex; flex-direction: column; gap: 8px; }
.pairsGroup ul { display: flex; flex-wrap: wrap; gap: 6px 8px; }
.pairsGroup li { font-size: 13px; padding: 4px 10px; border-radius: var(--r-chip); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line-strong); }
.act { display: flex; flex-direction: column; }
.act > li { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 8px 20px; padding: 16px 0; border-top: 1px solid var(--line); }
.act > li:first-child { border-top: 0; }
.actN { font: 600 15px/1.3 var(--font-ui); }
.actN span { display: block; font: 400 13px/1.4 var(--font-ui); color: var(--fg-2); margin-top: 4px; }
.actB { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
@media (max-width: 640px) { .act > li { grid-template-columns: minmax(0, 1fr); } }
.chk { display: flex; flex-direction: column; gap: 14px; padding: 18px; min-width: 0; }
.chkPicked { display: flex; flex-wrap: wrap; gap: 8px; }
.chkP { display: inline-flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-radius: var(--r-ctl); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line-ctl); font-size: 13.5px; font-weight: 600; }
.chkP small { font-weight: 400; color: var(--fg-2); }
@media (max-width: 560px) {
  .chkP { flex-wrap: wrap; }
  .chkP :global(.rv) { white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.25; }
}
.chkSum { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13.5px; color: var(--fg); }
.chkSum b { font-weight: 600; }

/* Reviewers */
.notes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 760px) { .notes { grid-template-columns: minmax(0, 1fr); } }
.noteCard { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: var(--r-panel); background: var(--canvas); box-shadow: inset 0 0 0 1px var(--line-strong); }
.noteH { display: flex; align-items: center; gap: 8px; font: 600 13.5px/1.2 var(--font-ui); }
.noteH :global(.ico) { width: 15px; height: 15px; }
.noteGood :global(.ico) { --ico: var(--i-check); }
.noteVague { color: var(--warn); }
.noteVague :global(.ico) { --ico: var(--i-warn); }
.quote { padding: 10px 12px; border-radius: var(--r-card); background: var(--surface-2); font-size: 13.5px; box-shadow: inset 0 0 0 1px var(--line); }
.mockDesk { border-radius: var(--r-win); overflow: hidden; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--line-strong); }
.peek { padding: 16px 24px; display: flex; flex-direction: column; gap: 8px; }
.peek i { display: block; height: 10px; border-radius: 4px; background: var(--surface-2); }
.peek .peek60 { width: 60%; }
.peek .peek85 { width: 85%; }
.peek .peek40 { width: 40%; }
.toastDemo { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
:global(.toast-bar) i.toastAt60 { transform: scaleX(.6); }
.toastNote { flex: 1 1 260px; }

/* Partners */
.ep td:first-child { white-space: nowrap; }
.method { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 5px; font: 600 11px/1 var(--font-mono); background: var(--surface-3); color: var(--fg); box-shadow: inset 0 0 0 1px var(--line-ctl); }
.acc { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 5px; font: 500 11.5px/1 var(--font-ui); color: var(--fg); box-shadow: inset 0 0 0 1px var(--line-ctl); margin: 0 4px 4px 0; white-space: nowrap; }
.codePre { margin: 0; padding: 14px 16px; border-radius: var(--r-card); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); font: 400 12.5px/1.6 var(--font-mono); overflow-x: auto; white-space: pre; color: var(--fg); tab-size: 2; }
.codePre:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.env { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
@media (max-width: 860px) { .env { grid-template-columns: minmax(0, 1fr); } }
.env dl { display: flex; flex-direction: column; }
.env dl div { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
.env dl div:first-child { border-top: 0; padding-top: 0; }
.env dt { font: 500 12.5px/1.3 var(--font-mono); color: var(--fg); }
.env dd { color: var(--fg-2); }
.exHead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.req { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font: 400 13px/1.4 var(--font-mono); overflow-wrap: anywhere; }
.must { display: flex; flex-direction: column; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); background: var(--canvas); overflow: hidden; }
.must li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 10px 20px; padding: 14px; border-top: 1px solid var(--line); align-items: start; }
.must li:first-child { border-top: 0; }
.must code { font: 400 12.5px/1.5 var(--font-mono); overflow-wrap: anywhere; }
.show { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; font-size: 13.5px; }
@media (max-width: 700px) { .must li { grid-template-columns: minmax(0, 1fr); } }

/* Glossary (the GlossaryFilter island renders into .glTools) */
.glTools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.glTools :global(.search) { flex: 1 1 280px; height: 40px; max-width: 460px; }
.glTools :global(.search) input { font-size: 14px; }
.glCount { font-size: 13px; color: var(--fg-2); }
.gl { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.glItem { display: grid; grid-template-columns: minmax(0, 210px) minmax(0, 1fr); gap: 6px 24px; padding: 14px 0; border-bottom: 1px solid var(--line); }
.glItem dt { font: 600 14.5px/1.35 var(--font-ui); }
.glItem dt small { display: block; font: 400 12px/1.3 var(--font-ui); color: var(--fg-2); margin-top: 2px; }
.glItem dd { display: flex; flex-direction: column; gap: 6px; font-size: 14px; min-width: 0; }
.glEx { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 13px; color: var(--fg-2); }
.glEx > b { font-weight: 500; color: var(--fg-2); }
.glEx :global(.rv) { white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.25; max-width: 100%; }
@media (max-width: 640px) { .glItem { grid-template-columns: minmax(0, 1fr); } }
.glEmpty { flex-basis: 100%; padding: 18px 0; font-size: 14px; }

/* FAQ */
.faq { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.faq details { border-bottom: 1px solid var(--line); }
.faq summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 12px 4px; cursor: pointer; font: 600 15px/1.35 var(--font-ui); list-style: none; border-radius: 8px; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { content: ""; width: 16px; height: 16px; flex: none; background: var(--fg-2); -webkit-mask: var(--i-down) center/contain no-repeat; mask: var(--i-down) center/contain no-repeat; transition: transform var(--dur-state) var(--ease-std); }
.faq details[open] summary::after { transform: rotate(180deg); }
.faq summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.answer { padding: 0 4px 18px; display: flex; flex-direction: column; gap: 8px; max-width: 68ch; font-size: 14.5px; color: var(--fg-2); }
.answer b { color: var(--fg); font-weight: 600; }

/* Footer */
.foot { font-size: 13px; color: var(--fg-2); border-top: 1px solid var(--line); padding-top: 20px; display: flex; flex-direction: column; gap: 8px; max-width: 76ch; }

/* §6.8 snapshot blocks: the live status line, and the stub that replaces a withdrawn example (§6.4 pattern). */
.snap { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.snapPills { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; color: var(--fg-2); }
.snapPills b { color: var(--fg); font-weight: 600; }
.snapPills :global(.rv) { white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.25; max-width: 100%; }
.withdrawn { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: var(--r-panel); background: var(--canvas); box-shadow: inset 0 0 0 1px var(--line-strong); }
.withdrawn li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 14px; }
.withdrawn :global(.rv) { white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.25; max-width: 100%; }

/* Board L inline styles, as classes (§3.1) */
.fgText { color: var(--fg); }
.monoMuted { color: var(--fg-2); font-weight: 400; }

@media (max-width: 560px) {
  .snap :global(.nodata-pairs) :global(.sev) { white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.3; }
  .snap :global(.nodata-block) { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 4: Run it to verify it passes, with the style lint**

Run: `cd web && npx vitest run tests/learn-parts.test.tsx tests/marks.test.ts tests/inline-styles.test.ts && npm run lint:css`
Expected: PASS (14 tests in `learn-parts.test.tsx`); Stylelint prints no problem.

- [ ] **Step 5: Commit**

```bash
git add web/content/learn/chapters.ts web/components/learn/context.ts web/components/learn/parts.tsx \
  web/components/learn/learn.module.css web/tests/fixtures/learn-stats.ts web/tests/learn-parts.test.tsx
git commit -m "feat(web): Learn registry, context and SnapshotBlock (live pills, withdrawn examples fail closed)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Chapter 1 and the hero (`/learn/start`)

**Files:**
- Create: `web/content/learn/start.tsx`
- Test: `web/tests/learn-start.test.tsx`

**Interfaces:**
- Consumes: `LearnContext`, `learnContext` (Task 5); `Chapter`, `Section`, `SnapshotBlock`, `LivePill`, `Ann`, `NeutralTag` and `learn.module.css` (Task 5); `P`, `PILOT_SNAPSHOT`, `substancesOf` (Task 4); `batchPill`, `formatCount` (Task 2); `fmtUtc` (P1A), `fmtDhakaClock` (Task 2); `NOT_REVIEWED` (P1A); `CodeChip`, `Severity`, `ReviewStatus`, `buttonClass` (P1A); `pilotStats` (Task 5).
- Produces: `default function StartChapter({ ctx }: { ctx: LearnContext })` in `@/content/learn/start`: the hero (`<header id="top">` with the page's only `<h1>`) and chapter 1 (`<h2>` title, `<h3>` sections).

- [ ] **Step 1: Write the failing test**

Create `web/tests/learn-start.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import StartChapter from "@/content/learn/start";
import { P, PILOT_IDS } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats(), apiStub = false) => renderToStaticMarkup(<StartChapter ctx={learnContext(stats, apiStub)} />);
const headings = (html: string) => [...html.matchAll(/<h([1-6])[^>]*>/g)].map((m) => Number(m[1]));
const API_SENTENCE = 'The API returns the same thing: the id, trade name, status <span class="mono">&quot;not_reviewed&quot;</span> and <span class="mono">hidden: true</span>.';

describe("/learn/start: the hero and chapter 1 (§6.8)", () => {
  it("the hero's h1 is the only h1, and no heading level is skipped (§10.5)", () => {
    const html = render();
    expect(html.match(/<h1[^>]*>Learn IntelliDrugs<\/h1>/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    const levels = headings(html);
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => { if (i > 0) expect(l - levels[i - 1]).toBeLessThanOrEqual(1); });
    expect(html).toContain('<h2 id="h-start"><span class="chN">1</span> Start here</h2>');
    expect(html).toContain("<h3>How to read a record</h3>");
  });

  it("prints the live facts from /v1/stats and the pilot run time in both zones", () => {
    const html = render();
    expect(html).toContain('<b class="num">39,196</b><span>products in the DGDA register</span>');
    expect(html).toContain('<b class="num">10</b><span>pilot medicines loaded so far</span>');
    expect(html).toContain('<b class="num">11</b><span>substances, each with a BDS id</span>');
    expect(html).toContain('<b class="num">0 of 10</b><span>approved by a pharmacist</span>');
    expect(html).toContain("Pilot run 11/10/2026 21:27 UTC, which is 12/10/2026 03:27 in Dhaka. Nothing from the pilot is public yet.");
  });

  it("follows live approvals, never the snapshot (Review Focus 5)", () => {
    const html = render(pilotStats({ approved: [P.napa] }));
    expect(html).toContain('<b class="num">1 of 10</b>');
    expect(html).not.toContain("Nothing from the pilot is public yet.");
    expect(html).toMatch(/<b>Napa<\/b><span class="rv rv--approved">Approved by a pharmacist<\/span>/);
    // §6.8 "Approval-state sentences": the public card and every sentence about it go once Napa is approved.
    for (const gone of ["What a public visitor sees for Napa today", "Public visitors see the smaller card below", 'class="pubMock"'])
      expect(html).not.toContain(gone);
    const all = render(pilotStats({ approved: [...PILOT_IDS] }));
    expect(all).toMatch(/<p class="status"><span class="rv rv--approved">/);
  });

  it("'Nothing from the pilot is public yet.' follows the pilot batch, not other batches", () => {
    const otherBatchApproved = { ...pilotStats(), approvedProducts: 1 };
    expect(render(otherBatchApproved)).toContain("Nothing from the pilot is public yet.");
    expect(render({ ...pilotStats(), batches: [] })).not.toContain("Nothing from the pilot is public yet.");
  });

  it("carries the §1.6 item 13 caption and public-card note, with no reviewStatus", () => {
    const html = render();
    expect(html).toContain("This is Napa as the review desk shows it. Each number matches a numbered note.");
    expect(html).toContain(`aria-label="What a public visitor sees for Napa today: the name and ${NOT_REVIEWED}."`);
    expect(html).toContain("What a public visitor sees for Napa today. It is never shown as &quot;not found&quot; or &quot;no data&quot;.");
    expect(html).not.toContain("signed-in reviewer sees it");
    expect(html).not.toContain("reviewStatus");
  });

  it("states the API's answer only once the API serves the §7.4 stub (§6.8 'Before P2')", () => {
    expect(render()).not.toContain("The API returns the same thing");
    expect(render(pilotStats(), true)).toContain(`What a public visitor sees for Napa today. ${API_SENTENCE} It is never shown`);
  });

  it("draws the annotated Napa record from the snapshot, with its live pill", () => {
    const html = render();
    expect(html).toContain('data-snapshot="186-0030-006--napa"');
    expect(html).toContain('<b>Acetaminophen 500 mg tablet</b><span class="mono">BDC-000001</span>');
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">512</b></span>');
    expect(html).toContain("645 drug–drug records, 3 drug–disease, 1 drug–food.");
    expect(html).toContain(`hidden behind &quot;${NOT_REVIEWED}&quot; until a pharmacist approves it.`);
  });

  it("withdraws the annotated record when Napa has an issue, and keeps the public card (a stub already)", () => {
    const html = render(pilotStats({ withdrawn: [P.napa] }));
    expect(html).toContain("data-withdrawn");
    expect(html).not.toContain("BDC-000001");
    expect(html).not.toContain("Acetaminophen");
    expect(html).toContain("A pharmacist checks every record before its contents appear here.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-start.test.tsx`
Expected: FAIL: `Failed to resolve import "@/content/learn/start"`.

- [ ] **Step 3: Write the chapter**

Board L's hero and chapter 1, with §1.6 item 13's caption and public-card note. The four facts and the status line are live (`/v1/stats`); "Nothing from the pilot is public yet." is printed only while the pilot batch is reported and has no approved record (`stats.approvedProducts` counts every batch, so it would drop the sentence when some other batch gets an approval). The annotated record is a `SnapshotBlock` keyed by Napa; the public card below it is already the stub pattern (trade name and live pill), so it stays when Napa is withdrawn. The public card, its `aria-label`, its caption and the sentence that points to it render only while Napa is not approved (§6.8 "Approval-state sentences"); while they render, `NOT_REVIEWED` in the `aria-label` is true. The caption's API sentence renders only when `ctx.apiStub` is true (§6.8 "Before P2").

Create `web/content/learn/start.tsx`:

```tsx
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Ann, Chapter, LivePill, NeutralTag, Section, SnapshotBlock } from "@/components/learn/parts";
import { buttonClass } from "@/components/ui/Button";
import CodeChip from "@/components/ui/CodeChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { NOT_REVIEWED } from "@/lib/copy";
import { fmtDhakaClock, fmtUtc } from "@/lib/format";
import { batchPill, formatCount } from "@/lib/stats";
import { P, PILOT_SNAPSHOT as S, substancesOf } from "./pilot-snapshot";

const H = 3;   // §6.8: on /learn/start the hero holds the <h1>, the chapter title is an <h2>, sections are <h3>

/** /learn/start: the Learn hero and chapter 1 (Board L, §1.6 item 13). */
export default function StartChapter({ ctx }: { ctx: LearnContext }) {
  const st = ctx.stats;
  const napa = S.records[P.napa];
  const [acet] = substancesOf(P.napa);
  const nothingPublic = ctx.batch !== null && ctx.batch.approved === 0;
  const napaHidden = ctx.pending(P.napa);
  return (
    <>
      <header className={styles.hero} id="top">
        <h1>Learn IntelliDrugs</h1>
        <p className={styles.lede}>How the Bangladesh drug knowledge base is built, checked and served. Every example on this page is a real record from pilot batch <span className="mono">{S.batchId}</span>, as the pipeline stored it.</p>
        <div className={styles.facts} role="list">
          <div role="listitem"><b className="num">{formatCount(st.registerProducts)}</b><span>products in the DGDA register</span></div>
          <div role="listitem"><b className="num">{formatCount(st.productsLoaded)}</b><span>pilot medicines loaded so far</span></div>
          <div role="listitem"><b className="num">{formatCount(st.substances)}</b><span>substances, each with a BDS id</span></div>
          <div role="listitem"><b className="num">{`${formatCount(st.approvedProducts)} of ${formatCount(st.productsLoaded)}`}</b><span>approved by a pharmacist</span></div>
        </div>
        <p className={styles.status}>
          <ReviewStatus status={batchPill(ctx.batch)} />
          <span>Pilot run {fmtUtc(S.runAt)}, which is {fmtDhakaClock(S.runAt)} in Dhaka.{nothingPublic ? " Nothing from the pilot is public yet." : ""}</span>
        </p>
      </header>

      <Chapter slug="start" level={2}>
        <Section id="start-what" h={H}>
          <div className={styles.prose}>
            <p>Start from a brand name a doctor writes, such as Napa. IntelliDrugs finds its DGDA registration, works out that it contains paracetamol 500 mg, and connects paracetamol to the same substance in RxNorm, ATC, DrugBank, SNOMED CT and DDInter 2.0. From there it can show which other substances it interacts with and how DDInter grades each interaction.</p>
            <p>The website is <span className="mono">drugdb.eliooo.org</span>. Reviewers work on the batch pages. Doctors, pharmacists and partner systems read only what a pharmacist has approved.</p>
          </div>
        </Section>

        <Section id="start-who" h={H}>
          <div className={styles.grid3}>
            <div className={styles.card}><p className={styles.h4}>Doctors and prescribers</p><p className={styles.small}>Look up a brand, see what it contains, and check a list of medicines for DDInter interactions before you prescribe.</p></div>
            <div className={styles.card}><p className={styles.h4}>Pharmacists</p><p className={styles.small}>Check a dispensing list, read DDInter's management text, and review records before they go public. Your approval is what publishes a record.</p></div>
            <div className={styles.card}><p className={styles.h4}>Partner companies</p><p className={styles.small}>EMR, pharmacy and pharma systems call the API with DGDA products and get substances, codes and interaction alerts back.</p></div>
          </div>
        </Section>

        <Section id="start-not" h={H}>
          <div className={styles.grid2}>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not a prescribing system</p>
              <p className={styles.small}>It does not choose medicines, doses or durations. It is decision support: it shows what the sources say so a clinician can decide.</p>
            </div>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not proof that a combination is safe</p>
              <p className={styles.small}>An empty alert list only means DDInter recorded nothing for those pairs. A substance DDInter does not cover is shown as no data, never as safe.</p>
            </div>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not its own source of clinical text</p>
              <p className={styles.small}>Interaction and management text is DDInter 2.0's own wording. We shorten it on screen and link the full text. We never rewrite it.</p>
            </div>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not public until a pharmacist approves</p>
              <p className={styles.small}>A loaded record stays hidden behind "{NOT_REVIEWED}" until a pharmacist approves it. Engineer checks are recorded but do not publish.</p>
            </div>
          </div>
        </Section>

        <Section id="start-read" h={H}>
          <p className={`${styles.prose} ${styles.prose2}`}>This is Napa as the review desk shows it. Each number matches a numbered note.{napaHidden ? " Public visitors see the smaller card below until a pharmacist approves the record." : ""}</p>
          <SnapshotBlock ctx={ctx} ids={[P.napa]} pills="inline">
            <div className={styles.annWrap}>
              <div className="window" role="img" aria-label="Annotated mockup of the Napa product page. The numbered notes beside it describe each part.">
                <div className="window-bar"><span className="window-dot" /><span className="window-dot" /><span className="window-dot" /><span className={styles.wbUrl}>drugdb.eliooo.org/products/{P.napa}</span></div>
                <div className={styles.np}>
                  <p className={`${styles.npCrumb} ${styles.row}`}><Ann n={1} />Products / {napa.tradeName}</p>
                  <div className={styles.npTitle}><Ann n={2} /><b>{napa.tradeName}</b><LivePill ctx={ctx} id={P.napa} /></div>
                  <p className={`${styles.npMeta} ${styles.row}`}><Ann n={3} />{napa.company}<span>{napa.dosageForm}</span><span>DAR <span className="mono">{napa.darNumber}</span></span></p>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={4} />Registered content, as DGDA wrote it</p>
                    <p><span className="raw">{napa.genericContentRaw}</span></p>
                  </div>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={5} />Clinical drug</p>
                    <p className={`${styles.npV} ${styles.row}`}><b>{napa.clinicalDrug}</b><span className="mono">{napa.bdcId}</span><span className={styles.small}>Route: {napa.route}</span></p>
                  </div>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={6} />Substance and codes</p>
                    <p className={styles.npIng}><b>{acet.name}</b><span className="mono">{acet.bdsId}</span><span className={styles.small}>DGDA calls it Paracetamol</span></p>
                    <div className="codes">
                      <CodeChip system="ICD11_XM" code={acet.codes.icd11} />
                      <CodeChip system="RXCUI" code={acet.codes.rxcui} />
                      <CodeChip system="ATC" code={acet.codes.atc[0]} />
                      <CodeChip system="DRUGBANK" code={acet.codes.drugbank} />
                      <CodeChip system="DDINTER" code={acet.entries[0].id} />
                    </div>
                  </div>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={7} />Interactions in DDInter 2.0</p>
                    <div className={styles.row}>
                      <Severity level="major" count={acet.drugDrug.major} />
                      <Severity level="moderate" count={acet.drugDrug.moderate} />
                      <Severity level="minor" count={acet.drugDrug.minor} />
                      <Severity level="unknown" count={acet.drugDrug.unknown} />
                    </div>
                    <p className={styles.small}>{acet.drugDrug.total} drug–drug records, {acet.disease} drug–disease, {acet.food} drug–food. <NeutralTag /></p>
                  </div>
                  <p className={styles.row}><Ann n={8} /><span className={buttonClass("tonal", "sm")}>Report a problem</span><span className={buttonClass("plain", "sm")}>DGDA source</span></p>
                </div>
              </div>
              <ol className={styles.legend} aria-label="What each numbered part means">
                <li><Ann n={1} /><div><b>Where you are</b><span className={styles.legendText}>Products, then the trade name. The address ends in the OCL concept id.</span></div></li>
                <li><Ann n={2} /><div><b>Trade name and review status</b><span className={styles.legendText}>The rounded pill is review status. "{NOT_REVIEWED}" means the record is hidden from the public.</span></div></li>
                <li><Ann n={3} /><div><b>Registration facts</b><span className={styles.legendText}>Company, dosage form and DAR number, copied from the DGDA register.</span></div></li>
                <li><Ann n={4} /><div><b>DGDA's own text</b><span className={styles.legendText}>Shown raw, so you can compare it with what we extracted.</span></div></li>
                <li><Ann n={5} /><div><b>Clinical drug</b><span className={styles.legendText}>Substance, strength, form and route. Every paracetamol 500 mg tablet brand shares <span className="mono">{napa.bdcId}</span>.</span></div></li>
                <li><Ann n={6} /><div><b>Substance and its codes</b><span className={styles.legendText}>Our permanent id <span className="mono">{acet.bdsId}</span> and the codes other systems use. Chapter 3 explains each.</span></div></li>
                <li><Ann n={7} /><div><b>Interaction summary</b><span className={styles.legendText}>Square chips are severity, each with its own shape. Unclassified pairs are counted on their own, never with Minor.</span></div></li>
                <li><Ann n={8} /><div><b>Actions</b><span className={styles.legendText}>Any signed-in visitor can report a problem. The source link opens the DGDA register entry.</span></div></li>
              </ol>
            </div>
          </SnapshotBlock>
          {napaHidden && (
            <figure className={styles.fig}>
              <div className={styles.pubMock} role="img" aria-label={`What a public visitor sees for Napa today: the name and ${NOT_REVIEWED}.`}>
                <div className={styles.npTitle}><b>{ctx.tradeName(P.napa)}</b><LivePill ctx={ctx} id={P.napa} /></div>
                <p className={styles.small}>A pharmacist checks every record before its contents appear here.</p>
              </div>
              <figcaption className={styles.figcap}>What a public visitor sees for Napa today.{ctx.apiStub && <> The API returns the same thing: the id, trade name, status <span className="mono">"not_reviewed"</span> and <span className="mono">hidden: true</span>.</>} It is never shown as "not found" or "no data".</figcaption>
            </figure>
          )}
        </Section>
      </Chapter>
    </>
  );
}
```

- [ ] **Step 4: Run it to verify it passes, with the copy guards**

Run: `cd web && npx vitest run tests/learn-start.test.tsx tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts`
Expected: PASS (8 tests in `learn-start.test.tsx`; the guards find no retyped safety sentence, hatch, green or inline style in `content/`). Also run `npx vitest run tests/learn-snapshot.test.ts` (its `ids` scan now reads `start.tsx`).

- [ ] **Step 5: Commit**

```bash
git add web/content/learn/start.tsx web/tests/learn-start.test.tsx
git commit -m "feat(web): Learn chapter 1 and the hero with live pilot numbers (§6.8, §1.6 item 13)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Chapters 2 and 3 — the model and the code systems, with their diagrams

**Files:**
- Create: `web/components/learn/diagrams.tsx`, `web/content/learn/model.tsx`, `web/content/learn/codes.tsx`
- Test: `web/tests/learn-model-codes.test.tsx`

**Interfaces:**
- Consumes: as Task 6, plus `ScrollRegion`, `ScrollHint`, `DownArrow`, `St` (Task 5); `substanceNamed` (Task 4); `MatchRelation`, `NoDataBlock` (P1A).
- Produces: `EntityDiagram()` and `MatchDiagram()` in `@/components/learn/diagrams` (Task 8 adds `SwimlaneDiagram()` to the same file); `default function ModelChapter({ ctx })` in `@/content/learn/model`; `default function CodesChapter({ ctx })` in `@/content/learn/codes`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/learn-model-codes.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import CodesChapter from "@/content/learn/codes";
import ModelChapter from "@/content/learn/model";
import { P } from "@/content/learn/pilot-snapshot";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const model = (stats = pilotStats()) => renderToStaticMarkup(<ModelChapter ctx={learnContext(stats)} />);
const codes = (stats = pilotStats()) => renderToStaticMarkup(<CodesChapter ctx={learnContext(stats)} />);
const svgs = (html: string) => html.match(/<svg[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g) ?? [];

describe("chapter 2, The model", () => {
  it("is the page's only h1, with h2 sections (§6.8 Headings)", () => {
    const html = model();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<h1 id="h-model"><span class="chN">2</span> The model</h1>');
    expect(html).toContain("<h2>Edge cases from the pilot</h2>");
  });

  it("the entity diagram is an image with its title and description (§10.5)", () => {
    const [svg] = svgs(model());
    expect(svg).toContain('aria-labelledby="dg-entity-t dg-entity-d"');
    expect(svg).toContain('<title id="dg-entity-t">IntelliDrugs entity diagram</title>');
    expect(svg).toContain("A brand product is reviewed in batch records.</desc>");
    expect(svg).toContain(">Napa, 186-0030-006</text>");
    expect(svg).toContain(">none: Domperidone</text>");
  });

  it("route scope: the eye drop is checked against DDInter352, which is the highlighted entry (§1.6 item 3)", () => {
    const html = model();
    expect(html).toContain('This eye-drop product is checked against <span class="mono">DDInter352</span>, the ophthalmic entry. When a product&#x27;s route has no DDInter entry, the systemic entry is used and marked &quot;route assumed&quot;.');
    expect(html).toMatch(/<span class="flowNode flowKey"><span class="mono">DDInter352<\/span> ophthalmic<\/span>/);
    expect(html).toMatch(/<span class="flowNode"><span class="mono">DDInter351<\/span> systemic<\/span>/);
    expect(html).not.toContain("planned, not current");
  });

  it("the no-data card is the hatch block with the fixed sentence and the not-checked pairs", () => {
    const html = model();
    expect(html).toContain('<div class="nodata-block hatch" role="note">');
    expect(html).toContain(`<p class="nodata-text">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + 8 other pilot substances</span>');
  });

  it("traces Napa from the snapshot, with its live pill and stage counts", () => {
    const html = model(pilotStats({ approved: [P.napa] }));
    expect(html).toContain('<dd class="mono">tablet|systemic|BDS-000001:500mg/</dd>');
    expect(html).toContain("<dd>645 records</dd>");
    expect(html).toContain("<dd>1 record</dd>");
    expect(html).toContain("Approved by a pharmacist");
  });

  it("withdraws only the cards of a record with an issue", () => {
    const html = model(pilotStats({ withdrawn: [P.chloramphenicol] }));
    expect(html).not.toContain("DDInter352");
    expect(html).toContain("Warfarin Sodium 5 mg");
    expect(html.match(/data-withdrawn/g)).toHaveLength(1);
  });
});

describe("chapter 3, Our IDs and the code systems", () => {
  it("lists Napa's codes, the DDInter chip with its route, and Acetylsalicylic acid's three ATC codes", () => {
    const html = codes();
    expect(html).toContain("<caption>Crosswalk codes for Acetaminophen, BDS-000001</caption>");
    expect(html).toContain('<span class="code"><span class="code-sys">DDInter</span>DDInter14<span class="code-meta">systemic</span></span>');
    expect(html).toContain("Acetylsalicylic acid has A01AD05, B01AC06 and N02BA01.");
    expect(html).toContain('<div class="scroll" tabindex="0" role="region" aria-label="Code systems table, scrolls sideways">');
  });

  it("draws the id parts and the matching diagram from the snapshot", () => {
    const html = codes();
    expect(html).toContain("<code>BDS</code>");
    expect(html).toContain("<code>000003</code>");
    expect(html).toContain('<span class="mono">BDC-000003</span> is Warfarin 5 mg tablet.');
    const [svg] = svgs(html);
    expect(svg).toContain('<title id="dg-match-t">How Napa&#x27;s codes were matched</title>');
    expect(svg).toContain(">RxCUI 161</text>");
  });

  it("withdraws the Napa table and diagram when Napa has an issue", () => {
    const html = codes(pilotStats({ withdrawn: [P.napa] }));
    expect(html).not.toContain("Crosswalk codes for Acetaminophen");
    expect(svgs(html)).toHaveLength(0);
    expect(html).toContain("is Warfarin 5 mg tablet.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-model-codes.test.tsx`
Expected: FAIL: `Failed to resolve import "@/content/learn/codes"`.

- [ ] **Step 3: Write the diagrams**

Board L's `#dg-entity` and `#dg-match`, with `role="img"`, `<title>` and `<desc>` verbatim (§6.8). The pilot labels come from the snapshot; the chapters wrap both diagrams in a `SnapshotBlock`. `text-anchor="start"` is the SVG default and is left out.

Create `web/components/learn/diagrams.tsx`:

```tsx
import { P, PILOT_SNAPSHOT as S, substancesOf } from "@/content/learn/pilot-snapshot";
import s from "./learn.module.css";

/**
 * Board L's SVG diagrams as inline React components (§6.8): `role="img"`, `<title>` and `<desc>` verbatim. Pilot
 * values come from the snapshot, so a chapter wraps the diagrams that show them in a SnapshotBlock.
 */

function Arrowhead({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" className={s.svgAh} />
      </marker>
    </defs>
  );
}

/** Chapter 2: brand product, clinical drug, substance (Board L `#dg-entity`). */
export function EntityDiagram() {
  const napa = S.records[P.napa];
  const [acet] = substancesOf(P.napa);
  const [domp] = substancesOf(P.domperidone);
  return (
    <svg className={s.dgEntity} viewBox="0 0 960 424" role="img" aria-labelledby="dg-entity-t dg-entity-d">
      <title id="dg-entity-t">IntelliDrugs entity diagram</title>
      <desc id="dg-entity-d">Brand product is a clinical drug, many to one. A clinical drug contains one or more substances. A substance has many crosswalk codes, zero or more DDInter entries, and exactly one coverage value. A DDInter entry lists many interactions. A brand product is reviewed in batch records.</desc>
      <Arrowhead id="ah-e" />
      <rect x="0" y="0" width="960" height="424" className={s.svgBg} />
      <rect x="10" y="30" width="180" height="162" rx="12" className={s.svgKey} />
      <text x="24" y="56" className={s.svgT}>Brand product</text>
      <text x="24" y="78" className={s.svgS}>One DGDA-registered</text>
      <text x="24" y="96" className={s.svgS}>product: DAR number,</text>
      <text x="24" y="114" className={s.svgS}>trade name, company,</text>
      <text x="24" y="132" className={s.svgS}>form, content text</text>
      <text x="24" y="178" className={s.svgM}>{napa.tradeName}, {napa.darNumber}</text>
      <rect x="280" y="30" width="180" height="162" rx="12" className={s.svgKey} />
      <text x="294" y="56" className={s.svgT}>Clinical drug</text>
      <text x="294" y="78" className={s.svgS}>Substances with</text>
      <text x="294" y="96" className={s.svgS}>strengths, dose form</text>
      <text x="294" y="114" className={s.svgS}>and route. Shared by</text>
      <text x="294" y="132" className={s.svgS}>brands that match</text>
      <text x="294" y="178" className={s.svgM}>{napa.bdcId}</text>
      <rect x="550" y="30" width="180" height="162" rx="12" className={s.svgKey} />
      <text x="564" y="56" className={s.svgT}>Substance</text>
      <text x="564" y="78" className={s.svgS}>One active ingredient,</text>
      <text x="564" y="96" className={s.svgS}>one per ICD-11 XM</text>
      <text x="564" y="114" className={s.svgS}>code. Names: INN,</text>
      <text x="564" y="132" className={s.svgS}>local, RxNorm, DDInter</text>
      <text x="564" y="178" className={s.svgM}>{acet.bdsId}</text>
      <rect x="810" y="30" width="140" height="162" rx="12" className={s.svgBox} />
      <text x="824" y="56" className={s.svgT}>Crosswalk codes</text>
      <text x="824" y="78" className={s.svgS}>ICD-11 XM, RxCUI,</text>
      <text x="824" y="96" className={s.svgS}>ATC, DrugBank,</text>
      <text x="824" y="114" className={s.svgS}>SNOMED CT</text>
      <text x="824" y="178" className={s.svgM}>{acet.codes.atc[0]}</text>
      <rect x="10" y="284" width="180" height="124" rx="12" className={s.svgBox} />
      <text x="24" y="310" className={s.svgT}>Batch record</text>
      <text x="24" y="332" className={s.svgS}>Stage results,</text>
      <text x="24" y="350" className={s.svgS}>evidence and review</text>
      <text x="24" y="368" className={s.svgS}>decisions</text>
      <text x="24" y="394" className={s.svgM}>{S.batchId}</text>
      <rect x="280" y="284" width="180" height="124" rx="12" className={s.svgBox} />
      <text x="294" y="310" className={s.svgT}>Coverage</text>
      <text x="294" y="332" className={s.svgS}>full: DDInter has data</text>
      <text x="294" y="350" className={s.svgS}>none: no data, never</text>
      <text x="294" y="368" className={s.svgS}>read as safe</text>
      <text x="294" y="394" className={s.svgM}>none: {domp.name}</text>
      <rect x="550" y="284" width="180" height="124" rx="12" className={s.svgBox} />
      <text x="564" y="310" className={s.svgT}>DDInter entry</text>
      <text x="564" y="332" className={s.svgS}>One per route the</text>
      <text x="564" y="350" className={s.svgS}>substance appears in</text>
      <text x="564" y="394" className={s.svgM}>{acet.entries[0].id}, {acet.entries[0].route}</text>
      <rect x="810" y="284" width="140" height="124" rx="12" className={s.svgBox} />
      <text x="824" y="310" className={s.svgT}>Interactions</text>
      <text x="824" y="332" className={s.svgS}>drug–drug pairs,</text>
      <text x="824" y="350" className={s.svgS}>drug–disease,</text>
      <text x="824" y="368" className={s.svgS}>drug–food</text>
      <text x="824" y="394" className={s.svgM}>DDInter 2.0</text>
      <path d="M190 111H280" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="235" y="103" className={s.svgV} textAnchor="middle">is a</text>
      <text x="194" y="128" className={s.svgC}>many</text>
      <text x="276" y="128" className={s.svgC} textAnchor="end">1</text>
      <path d="M460 111H550" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="505" y="103" className={s.svgV} textAnchor="middle">contains</text>
      <text x="464" y="128" className={s.svgC}>1</text>
      <text x="546" y="128" className={s.svgC} textAnchor="end">1 or more</text>
      <path d="M730 111H810" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="770" y="103" className={s.svgV} textAnchor="middle">is coded as</text>
      <text x="734" y="128" className={s.svgC}>1</text>
      <text x="806" y="128" className={s.svgC} textAnchor="end">many</text>
      <path d="M100 192V284" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="108" y="242" className={s.svgV}>is reviewed in</text>
      <text x="108" y="210" className={s.svgC}>1</text>
      <text x="108" y="276" className={s.svgC}>many</text>
      <path d="M640 192V284" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="648" y="242" className={s.svgV}>is found in</text>
      <text x="648" y="210" className={s.svgC}>1</text>
      <text x="648" y="276" className={s.svgC}>0 or more</text>
      <path d="M730 346H810" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="770" y="338" className={s.svgV} textAnchor="middle">lists</text>
      <text x="734" y="362" className={s.svgC}>1</text>
      <text x="806" y="362" className={s.svgC} textAnchor="end">many</text>
      <path d="M590 192V242H370V284" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="480" y="234" className={s.svgV} textAnchor="middle">has</text>
      <text x="598" y="210" className={s.svgC}>1</text>
      <text x="378" y="276" className={s.svgC}>exactly 1</text>
    </svg>
  );
}

/** Chapter 3: how Napa's codes were matched (Board L `#dg-match`). */
export function MatchDiagram() {
  const [acet] = substancesOf(P.napa);
  return (
    <svg className={s.dgMatch} viewBox="0 0 900 200" role="img" aria-labelledby="dg-match-t dg-match-d">
      <title id="dg-match-t">How Napa's codes were matched</title>
      <desc id="dg-match-d">DGDA maps Napa to ICD-11 XM5DJ7 Acetaminophen, method xm. That gives substance BDS-000001. An exact name match in RxNav gives RxCUI 161, method rxnav-exact. The RxCUI gives ATC N02BE01, DrugBank DB00316 and SNOMED CT codes. The DDInter entry DDInter14 is confirmed because its DrugBank id is DB00316, method drugbank. Every step has confidence 1.00.</desc>
      <Arrowhead id="ah-m" />
      <rect x="0" y="0" width="900" height="200" className={s.svgBg} />
      <rect x="10" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="22" y="66" className={s.svgT}>DGDA register</text>
      <text x="22" y="94" className={s.svgM}>{acet.codes.icd11}</text>
      <text x="22" y="120" className={s.svgS}>{acet.name}</text>
      <rect x="195" y="40" width="140" height="104" rx="12" className={s.svgKey} />
      <text x="207" y="66" className={s.svgT}>Substance</text>
      <text x="207" y="94" className={s.svgM}>{acet.bdsId}</text>
      <text x="207" y="120" className={s.svgS}>minted once, kept</text>
      <rect x="380" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="392" y="66" className={s.svgT}>NLM RxNorm</text>
      <text x="392" y="94" className={s.svgM}>RxCUI {acet.codes.rxcui}</text>
      <text x="392" y="120" className={s.svgS}>exact name match</text>
      <rect x="565" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="577" y="66" className={s.svgT}>Codes from RxCUI</text>
      <text x="577" y="94" className={s.svgM}>{acet.codes.atc[0]}</text>
      <text x="577" y="120" className={s.svgS}>{acet.codes.drugbank}, SNOMED CT</text>
      <rect x="750" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="762" y="66" className={s.svgT}>DDInter 2.0</text>
      <text x="762" y="94" className={s.svgM}>{acet.entries[0].id}</text>
      <text x="762" y="120" className={s.svgS}>DrugBank {acet.codes.drugbank}</text>
      <path d="M150 92H195" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="172.5" y="172" className={s.svgM} textAnchor="middle">xm</text>
      <path d="M335 92H380" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="357.5" y="172" className={s.svgM} textAnchor="middle">rxnav-exact</text>
      <path d="M520 92H565" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="542.5" y="172" className={s.svgM} textAnchor="middle">rxnav-exact</text>
      <path d="M705 92H750" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="727.5" y="172" className={s.svgM} textAnchor="middle">drugbank</text>
      <text x="10" y="24" className={s.svgLt}>Napa, step by step</text>
      <text x="890" y="196" className={s.svgS} textAnchor="end">method of each step, confidence 1.00</text>
    </svg>
  );
}
```

- [ ] **Step 4: Write the two chapters**

Chapter 2 applies §1.6 item 3: the route-scope card's note is replaced, and the highlighted entry (`flowKey`) is the one for the product's route, `DDInter352`, not Board L's `DDInter351`. The "How to read the lines" list gets `role="group"`, because an `aria-label` on a plain `<div>` is not allowed (axe `aria-prohibited-attr`). Every record-specific value is inside a `SnapshotBlock`.

Create `web/content/learn/model.tsx`:

```tsx
import type { LearnContext } from "@/components/learn/context";
import { EntityDiagram } from "@/components/learn/diagrams";
import styles from "@/components/learn/learn.module.css";
import { Chapter, DownArrow, LivePill, ScrollHint, ScrollRegion, Section, SnapshotBlock, St } from "@/components/learn/parts";
import CodeChip from "@/components/ui/CodeChip";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataBlock from "@/components/ui/NoDataBlock";
import { P, PILOT_SNAPSHOT as S, substanceNamed, substancesOf } from "./pilot-snapshot";

const H = 2;
const records = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;

/** Chapter 2 "The model" (Board L, §1.6 item 3). */
export default function ModelChapter({ ctx }: { ctx: LearnContext }) {
  const napa = S.records[P.napa], warf = S.records[P.warfarin], metf = S.records[P.metformin], asp = S.records[P.aspirin];
  const amox = S.records[P.amoxiclav], chlor = S.records[P.chloramphenicol], domp = S.records[P.domperidone];
  const [acet] = substancesOf(P.napa);
  const warfS = substanceNamed("Warfarin"), metfS = substanceNamed("Metformin"), aspS = substanceNamed("Acetylsalicylic acid");
  const amoxS = substanceNamed("Amoxicillin"), clavS = substanceNamed("Clavulanic acid"), chlorS = substanceNamed("Chloramphenicol");
  const dompS = substanceNamed("Domperidone");
  const napaWarn = S.warnings[P.napa].status === "warn" ? 1 : 0;
  const otherPilot = S.notCheckedPairs - 2;
  return (
    <Chapter slug="model" level={1}>
      <Section id="model-diagram" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.napa, P.domperidone]}>
          <figure className={styles.fig}>
            <ScrollHint />
            <ScrollRegion label="Entity diagram, scrolls sideways"><EntityDiagram /></ScrollRegion>
            <figcaption className={styles.figcap}>Solid boxes are the three levels of the drug master. The numbers at each end of a line say how many records connect.</figcaption>
          </figure>
          <div className={styles.dgRead} role="group" aria-label="How to read the lines">
            <div><b>Brand product is a clinical drug</b><span>Many brands, one clinical drug. Napa and any other paracetamol 500 mg tablet share <span className="mono">{napa.bdcId}</span>.</span></div>
            <div><b>Clinical drug contains substances</b><span>One or more, each with its own strength. A combination tablet has two.</span></div>
            <div><b>Substance is coded as</b><span>Many codes per substance, each with how it was matched and a confidence from 0 to 1.</span></div>
            <div><b>Substance is found in DDInter entries</b><span>Zero or more, one per route. Domperidone has none. Chloramphenicol has three.</span></div>
            <div><b>DDInter entry lists interactions</b><span>Drug–drug pairs, drug–disease and drug–food records, from DDInter 2.0.</span></div>
            <div><b>Substance has coverage</b><span>Exactly one: full, or none. "None" is stored, never guessed from an empty list.</span></div>
            <div><b>Brand product is reviewed in a batch</b><span>Each batch record keeps stage results, raw evidence and every review decision.</span></div>
          </div>
        </SnapshotBlock>
      </Section>

      <Section id="model-napa" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The same record at each step of the pipeline, with the values stored for it today.</p>
        <SnapshotBlock ctx={ctx} ids={[P.napa]} pills="inline">
          <ol className={styles.jr}>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>1</span>DGDA register row</p>
              <dl>
                <dt>Trade name</dt><dd>{napa.tradeName}</dd>
                <dt>Company</dt><dd>{napa.company}</dd>
                <dt>DAR</dt><dd className="mono">{napa.darNumber}</dd>
                <dt>Form</dt><dd>{napa.dosageForm}</dd>
                <dt>Content</dt><dd><span className="raw">{napa.genericContentRaw}</span></dd>
                <dt>DGDA maps to</dt><dd><span className="mono">{acet.codes.icd11}</span> {acet.name}</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>2</span>Substance</p>
              <dl>
                <dt>Id</dt><dd className="mono">{acet.bdsId}</dd>
                <dt>Name</dt><dd>{acet.name}</dd>
                <dt>Also</dt><dd>Paracetamol (DGDA content), acetaminophen (RxNorm), Acetaminophen (ICD-11, DDInter)</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>3</span>Clinical drug</p>
              <dl>
                <dt>Id</dt><dd className="mono">{napa.bdcId}</dd>
                <dt>Name</dt><dd>{napa.clinicalDrug}</dd>
                <dt>Route</dt><dd>{napa.route}</dd>
                <dt>Signature</dt><dd className="mono">{napa.signature}</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>4</span>Codes</p>
              <div className="codes">
                <CodeChip system="ICD11_XM" code={acet.codes.icd11} />
                <CodeChip system="RXCUI" code={acet.codes.rxcui} />
                {acet.codes.atc.map((c) => <CodeChip key={c} system="ATC" code={c} />)}
                <CodeChip system="DRUGBANK" code={acet.codes.drugbank} />
                {acet.codes.snomed.map((c) => <CodeChip key={c} system="SNOMEDCT" code={c} />)}
              </div>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>5</span>DDInter</p>
              <dl>
                <dt>Entry</dt><dd><span className="mono">{acet.entries[0].id}</span>, {acet.entries[0].route}</dd>
                <dt>Drug–drug</dt><dd>{records(acet.drugDrug.total)}</dd>
                <dt>Disease</dt><dd>{records(acet.disease)}</dd>
                <dt>Food</dt><dd>{records(acet.food)}</dd>
                <dt>Coverage</dt><dd>Interaction data found</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>6</span>Review</p>
              <dl>
                <dt>Batch</dt><dd className="mono">{S.batchId}</dd>
                <dt>Stages</dt><dd><St status="ok" /> {4 - napaWarn}{"  "}<St status="warn" /> {napaWarn}</dd>
                <dt>Status</dt><dd><LivePill ctx={ctx} id={P.napa} /></dd>
              </dl>
            </li>
          </ol>
        </SnapshotBlock>
      </Section>

      <Section id="model-edges" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Three of the ten pilot medicines show the edge cases the model has to handle.</p>
        <div className={styles.ec}>
          <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.metformin]}>
            <article className={styles.card}>
              <p className={styles.h4}>Salt removed</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{warf.tradeName}, DAR <span className="mono">{warf.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{warf.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="salt" /></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{warfS.name}</b><span className="mono">{warfS.bdsId}</span><span className="mono">{warfS.codes.icd11}</span></span>
              </div>
              <p className={styles.small}>The salt changes the registered name, not the substance. {metf.tradeName}'s <span className="raw">{metf.genericContentRaw}</span> becomes {metfS.name} <span className="mono">{metfS.bdsId}</span> the same way.</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.napa, P.aspirin]}>
            <article className={styles.card}>
              <p className={styles.h4}>Different names, same substance</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{napa.tradeName} and {asp.tradeName}</span>
                <span className={styles.flowNode}><span className="raw">{napa.genericContentRaw}</span><span className="raw">{asp.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="norm" /></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{acet.name}</b><span className="mono">{acet.bdsId}</span></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{aspS.name}</b><span className="mono">{aspS.bdsId}</span></span>
              </div>
              <p className={styles.small}>DGDA's ICD-11 mapping and DDInter both use Acetaminophen and Acetylsalicylic acid. We keep the local names as synonyms so a search for either finds the record.</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.amoxiclav]}>
            <article className={styles.card}>
              <p className={styles.h4}>Combination product</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{amox.tradeName}, DAR <span className="mono">{amox.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{amox.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow />One clinical drug, <span className="mono">{amox.bdcId}</span></span>
                <div className={styles.flowSplit}>
                  <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{amoxS.name}</b> 500 mg<span className="mono">{amoxS.bdsId}</span></span>
                  <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{clavS.name}</b> 125 mg<span className="mono">{clavS.bdsId}</span></span>
                </div>
              </div>
              <p className={styles.small}>Each strength is matched to its own substance, and checks run on both. The signature sorts them: <span className="mono">{amox.signature}</span>.</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.chloramphenicol]}>
            <article className={styles.card}>
              <p className={styles.h4}>Route scope</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{chlor.tradeName} eye drops, DAR <span className="mono">{chlor.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{chlor.genericContentRaw}</span><span>{chlor.dosageForm}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="added" /> route: {chlor.route}</span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{chlorS.name}</b><span className="mono">{chlorS.bdsId}</span></span>
                <span className={styles.flowStep}><DownArrow />DDInter entries, by route</span>
                <div className={styles.flowSplit}>
                  {chlorS.entries.map((e) => (
                    <span key={e.id} className={e.route === chlor.route ? `${styles.flowNode} ${styles.flowKey}` : styles.flowNode}>
                      <span className="mono">{e.id}</span> {e.route}
                    </span>
                  ))}
                </div>
              </div>
              <p className={styles.small}>This eye-drop product is checked against <span className="mono">DDInter352</span>, the ophthalmic entry. When a product's route has no DDInter entry, the systemic entry is used and marked "route assumed".</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.domperidone]} className={styles.ecWide}>
            <article className={styles.card}>
              <p className={styles.h4}>No interaction data</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{domp.tradeName}, DAR <span className="mono">{domp.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{domp.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="same" /></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{dompS.name}</b><span className="mono">{dompS.bdsId}</span>
                  <CodeChip system="ATC" code={dompS.codes.atc[0]} /><CodeChip system="DRUGBANK" code={dompS.codes.drugbank} /></span>
                <span className={styles.flowStep}><DownArrow />No DDInter entry, coverage: none</span>
              </div>
              <NoDataBlock title={dompS.name} bdsId={dompS.bdsId}
                pairs={[`${dompS.name} + ${warfS.name}`, `${dompS.name} + ${aspS.name}`, `${dompS.name} + ${otherPilot} other pilot substances`]} />
              <p className={styles.small}>Domperidone has no DDInter 2.0 entry (coverage: none). It still gets a substance and every code we can find. Its pairs are "not checked", never counted as checked.</p>
            </article>
          </SnapshotBlock>
        </div>
      </Section>
    </Chapter>
  );
}
```

Create `web/content/learn/codes.tsx`:

```tsx
import type { LearnContext } from "@/components/learn/context";
import { MatchDiagram } from "@/components/learn/diagrams";
import styles from "@/components/learn/learn.module.css";
import { Chapter, ScrollHint, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import CodeChip from "@/components/ui/CodeChip";
import { P, PILOT_SNAPSHOT as S, substanceNamed, substancesOf } from "./pilot-snapshot";

const H = 2;
/** "A01AD05, B01AC06 and N02BA01" */
const andList = (xs: readonly string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Chapter 3 "Our IDs and the code systems" (Board L). */
export default function CodesChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin];
  const warfS = substanceNamed("Warfarin"), dompS = substanceNamed("Domperidone"), aspS = substanceNamed("Acetylsalicylic acid");
  const [acet] = substancesOf(P.napa);
  const [bds, bdsNum] = warfS.bdsId.split("-");
  const [bdc, bdcNum] = warf.bdcId.split("-");
  return (
    <Chapter slug="codes" level={1}>
      <Section id="codes-ids" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.domperidone]}>
          <div className={styles.idx}>
            <div className={styles.idxOne}>
              <div className={styles.idxParts} aria-hidden="true">
                <div className={styles.idxPart}><code>{bds}</code><span>Bangladesh substance</span></div>
                <div className={styles.idxPart}><code>-</code></div>
                <div className={styles.idxPart}><code>{bdsNum}</code><span>Next number from a sequence</span></div>
              </div>
              <p className={styles.small}><span className="mono">{warfS.bdsId}</span> is {warfS.name}.</p>
            </div>
            <div className={styles.idxOne}>
              <div className={styles.idxParts} aria-hidden="true">
                <div className={styles.idxPart}><code>{bdc}</code><span>Bangladesh clinical drug</span></div>
                <div className={styles.idxPart}><code>-</code></div>
                <div className={styles.idxPart}><code>{bdcNum}</code><span>Its own sequence</span></div>
              </div>
              <p className={styles.small}><span className="mono">{warf.bdcId}</span> is {warf.clinicalDrug}.</p>
            </div>
          </div>
          <ul className={styles.bul}>
            <li><b>Stable.</b> A re-run looks up the existing id before minting a new one, so Warfarin stays <span className="mono">{warfS.bdsId}</span> however often the pipeline runs.</li>
            <li><b>Never reused.</b> Neither sequence ever cycles, so a retired number can never point at a different medicine.</li>
            <li><b>One substance per ICD-11 XM code.</b> The database refuses a second substance for the same XM code, so Warfarin Sodium and Warfarin cannot split into two.</li>
            <li><b>One clinical drug per signature.</b> Dose form, route and sorted strengths make the key. Two brands of the same tablet share one BDC.</li>
            <li><b>Covers what others miss.</b> Domperidone has no DDInter entry, yet it still has <span className="mono">{dompS.bdsId}</span> and six crosswalk codes.</li>
          </ul>
        </SnapshotBlock>
      </Section>

      <Section id="codes-systems" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.napa, P.aspirin]}>
          <p className={`${styles.prose} ${styles.prose2}`}>Napa's substance, {acet.name} <span className="mono">{acet.bdsId}</span>, carries one code from each system. Method says how we found the code. Confidence runs from 0 to 1. Every pilot code was an exact match at 1.00.</p>
          <ScrollRegion label="Code systems table, scrolls sideways">
            <table className={`${styles.tbl} ${styles.tblWide}`}>
              <caption>Crosswalk codes for {acet.name}, {acet.bdsId}</caption>
              <thead><tr><th scope="col">System</th><th scope="col">What it is for</th><th scope="col">Napa's code</th><th scope="col">Matched by</th><th scope="col">Confidence</th></tr></thead>
              <tbody>
                <tr><th scope="row">ICD-11 XM</th><td>WHO ICD-11 medicament codes. DGDA maps each registered ingredient to one, so it anchors our substance.</td><td><CodeChip system="ICD11_XM" code={acet.codes.icd11} /></td><td><span className="mono">xm</span>: read from DGDA's own ingredient mapping</td><td className="num">1.00</td></tr>
                <tr><th scope="row">RxNorm RxCUI</th><td>NLM's ingredient concept. Lets systems built on RxNorm recognise the substance.</td><td><CodeChip system="RXCUI" code={acet.codes.rxcui} /></td><td><span className="mono">rxnav-exact</span>: exact name match in NLM RxNav</td><td className="num">1.00</td></tr>
                <tr><th scope="row">ATC</th><td>WHO Anatomical Therapeutic Chemical class. One substance can sit in several: {aspS.name} has {andList(aspS.codes.atc)}.</td><td><CodeChip system="ATC" code={acet.codes.atc[0]} /></td><td><span className="mono">rxnav-exact</span>: read from the matched RxCUI</td><td className="num">1.00</td></tr>
                <tr><th scope="row">DrugBank</th><td>DrugBank accession. DDInter lists DrugBank ids too, so this confirms the DDInter match.</td><td><CodeChip system="DRUGBANK" code={acet.codes.drugbank} /></td><td><span className="mono">rxnav-exact</span>: read from the matched RxCUI</td><td className="num">1.00</td></tr>
                <tr><th scope="row">SNOMED CT</th><td>Clinical terminology concepts for EMRs that code in SNOMED CT. RxNav returned two for most pilot substances.</td><td><div className="codes">{acet.codes.snomed.map((c) => <CodeChip key={c} system="SNOMEDCT" code={c} />)}</div></td><td><span className="mono">rxnav-exact</span>: read from the matched RxCUI</td><td className="num">1.00</td></tr>
                {/* Board L prints the DDInter chip with its route as code-meta and no method (the method is in the next column). */}
                <tr><th scope="row">DDInter</th><td>The DDInter 2.0 drug entry, and the route it covers. Interactions come from here.</td><td><span className="code"><span className="code-sys">DDInter</span>{acet.entries[0].id}<span className="code-meta">{acet.entries[0].route}</span></span></td><td><span className="mono">drugbank</span>: DDInter entry whose DrugBank id equals ours</td><td className="num">1.00</td></tr>
              </tbody>
            </table>
          </ScrollRegion>
        </SnapshotBlock>
      </Section>

      <Section id="codes-match" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.napa]}>
          <figure className={styles.fig}>
            <ScrollHint />
            <ScrollRegion label="Matching chain diagram, scrolls sideways"><MatchDiagram /></ScrollRegion>
            <figcaption className={styles.figcap}>Each step starts from a code the previous step proved, not from a name guess. A name-only DDInter match, a missing RxCUI or an unparsed strength becomes a stage warning that a reviewer sees.</figcaption>
          </figure>
        </SnapshotBlock>
      </Section>
    </Chapter>
  );
}
```

- [ ] **Step 5: Run it to verify it passes, with the copy guards**

Run: `cd web && npx vitest run tests/learn-model-codes.test.tsx tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts`
Expected: PASS (9 tests in `learn-model-codes.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add web/components/learn/diagrams.tsx web/content/learn/model.tsx web/content/learn/codes.tsx web/tests/learn-model-codes.test.tsx
git commit -m "feat(web): Learn chapters 2 and 3 with the entity and matching diagrams (§6.8, §1.6 item 3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Chapter 4 — the process, with the swimlane diagram

**Files:**
- Create: `web/content/learn/process.tsx`
- Modify: `web/components/learn/diagrams.tsx`
- Test: `web/tests/learn-process.test.tsx`

**Interfaces:**
- Consumes: as Task 7, plus `AsStored`, `GateArrow` (Task 5); `Banner`, `ExampleMarker`, `Kbd`, `StageCheck` (P1A); `LEARN_BOARD.undoWindow` (Task 3); `STALE_TITLE`, `NO_DATA_SENTENCE`, `NOT_REVIEWED` (P1A); `BATCH_STATUS_WORD`, `pillStatus` (Task 2).
- Produces: `SwimlaneDiagram({ notReviewed: string; undoWindow: string })` in `@/components/learn/diagrams`; `default function ProcessChapter({ ctx })` in `@/content/learn/process`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/learn-process.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import ProcessChapter from "@/content/learn/process";
import { P } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats()) => renderToStaticMarkup(<ProcessChapter ctx={learnContext(stats)} />);
const UNDO = "undo window (8 seconds by default; 20 or 60 in desk settings)";

describe("chapter 4, The process", () => {
  it("the swimlane is an image whose description carries the §1.6 item 14 undo window and the NOT_REVIEWED sentence", () => {
    const html = render();
    expect(html).toContain('<title id="dg-swim-t">From batch file to public record</title>');
    expect(html).toContain(`leaves the record hidden as ${NOT_REVIEWED}. A pharmacist presses A and after the ${UNDO} the record becomes public`);
    expect(html).not.toContain("8-second undo window");
    expect(html).toContain(">A, 8 s undo</text>");
  });

  it("the review gate carries the §1.6 item 4 sentence and the item 14 undo window", () => {
    const html = render();
    expect(html).toContain("Approval comes from the decision history. Each decision updates the record&#x27;s review status, and a re-run resets it, so a decision made before the latest extraction never counts.");
    expect(html).not.toContain("on every public read");
    expect(html.match(new RegExp(`and the ${UNDO.replace(/[()]/g, "\\$&")} closes`, "g"))).toHaveLength(2);
    expect(html).toContain("When the undo window closes, the record is public.");
    expect(html).not.toContain("After 8 seconds");
  });

  it("the DDInter pilot result is §1.6 item 11's, and the Domperidone note is NO_DATA_SENTENCE in full (item 12)", () => {
    const html = render();
    expect(html).toContain("9 of 10 records warned. Eight list pairs with no DDInter text. Domperidone has no DDInter data. Chloramphenicol is OK.");
    expect(html.match(/10 of 10 records/g)).toHaveLength(3);
    expect(html).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain("<p class=\"stage-note\">DDInter text not found for DDInter1951/DDInter79</p>");
  });

  it("dates every evidence count as stored (§6.8 snapshot values)", () => {
    const html = render();
    expect(html.match(/as stored on 13\/10\/2026/g)).toHaveLength(4);
    expect(html).toContain('<td class="num">40<span class="small">, as stored on 13/10/2026</span></td>');
    expect(html).toContain('<td class="num">0<span class="small">, as stored on 13/10/2026</span></td>');
  });

  it("the stale banner uses STALE_TITLE, the only em dash", () => {
    expect(render()).toContain(`<p class="banner-title">${STALE_TITLE}</p>`);
  });

  it("the batch progress list and its line are live, trade name and status only", () => {
    const html = render(pilotStats({ approved: [P.napa, P.clarith] }));
    expect(html).toContain('aria-label="Batch 0001-pilot records"');
    expect(html.match(/<li><b>[^<]+<\/b><span class="rv rv--(pending|approved)">/g)).toHaveLength(10);
    expect(html).toContain('<li><b>Napa</b><span class="rv rv--approved">');
    expect(html).toContain("2 of 10 approved.</b> Batch <span class=\"mono\">0001-pilot</span> is in review. It becomes approved when all 10 records are approved by a pharmacist.");
    expect(html).toContain("holds 10 records and its status is in review.");
  });

  it("says how many listed records were removed from the batch file, so 11 pills never sit under '10 of 10'", () => {
    const stats = pilotStats();
    stats.batches[0].items.push({ conceptId: "999-0000-000--old-brand", tradeName: "Old Brand", status: "not_reviewed", exampleUsable: false });
    const html = render(stats);
    expect(html).toContain("0 of 10 approved.</b> 1 record was removed from the batch file. Batch");
    expect(render()).not.toContain("removed from the batch file.");
  });

  it("prints G Warfarin's extraction time only when the snapshot holds the host's stamp", () => {
    expect(render()).toMatch(/G Warfarin was extracted( \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} UTC)? in batch <span class="mono">0001-pilot<\/span>\./);
  });

  it("withdraws the stage results and the G Warfarin examples when G Warfarin has an issue", () => {
    const html = render(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("9 of 10 records warned");
    expect(html).not.toContain("DDInter1951/DDInter79");
    expect(html).not.toContain("was extracted");
    expect(html).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-process.test.tsx`
Expected: FAIL: `Failed to resolve import "@/content/learn/process"`.

- [ ] **Step 3: Add the swimlane diagram**

Append to `web/components/learn/diagrams.tsx` (Board L `#dg-swim`; the description takes `NOT_REVIEWED` and §1.6 item 14's undo-window wording from the chapter, so the diagram file retypes neither):

```tsx
/** One box of the swimlane: a title line and a sub line, 9 px in from the left edge (Board L `#dg-swim`). */
function Lane({ x, y, w, title, sub, keyBox = false }: { x: number; y: number; w: number; title: string; sub: string; keyBox?: boolean }) {
  return (
    <>
      <rect x={x} y={y} width={w} height="46" rx="10" className={keyBox ? s.svgKey : s.svgBox} />
      <text x={x + 9} y={y + 19} className={s.svgC}>{title}</text>
      <text x={x + 9} y={y + 36} className={s.svgS}>{sub}</text>
    </>
  );
}

/**
 * Chapter 4: from batch file to public record (Board L `#dg-swim`). §1.6 item 14 changes the description's
 * "8-second undo window"; the "A, 8 s undo" box is a picture of the desk default and keeps it.
 */
export function SwimlaneDiagram({ notReviewed, undoWindow }: { notReviewed: string; undoWindow: string }) {
  return (
    <svg className={s.dgSwim} viewBox="0 0 840 520" role="img" aria-labelledby="dg-swim-t dg-swim-d">
      <title id="dg-swim-t">From batch file to public record</title>
      <desc id="dg-swim-d">{`A batch file of 10 concept ids enters the pipeline. Four stages run in order: DGDA load reads the DGDA register, Substances reads NLM RxNav, Clinical drug parses, DDInter reads DDInter 2.0. Every stage keeps its evidence, which signed-in reviewers see on the batch page. An engineer check is recorded but leaves the record hidden as ${notReviewed}. A pharmacist presses A and after the ${undoWindow} the record becomes public on the site, checker and API. An issue or a re-run sends the record back to the pipeline and back to review.`}</desc>
      <Arrowhead id="ah-s" />
      <rect x="0" y="0" width="840" height="520" className={s.svgBg} />
      <rect x="0" y="0" width="840" height="90" className={s.svgBand} />
      <path d="M0 90H840" className={s.svgSep} />
      <text x="14" y="43" className={s.svgLt}>Sources</text>
      <text x="14" y="60" className={s.svgS}>read only</text>
      <path d="M0 190H840" className={s.svgSep} />
      <text x="14" y="138" className={s.svgLt}>Pipeline</text>
      <text x="14" y="155" className={s.svgS}>runs in order</text>
      <rect x="0" y="190" width="840" height="90" className={s.svgBand} />
      <path d="M0 280H840" className={s.svgSep} />
      <text x="14" y="233" className={s.svgLt}>Evidence</text>
      <text x="14" y="250" className={s.svgS}>kept, reviewers only</text>
      <path d="M0 380H840" className={s.svgSep} />
      <text x="14" y="328" className={s.svgLt}>Review</text>
      <text x="14" y="345" className={s.svgS}>invited people</text>
      <rect x="0" y="380" width="840" height="90" className={s.svgBand} />
      <path d="M0 470H840" className={s.svgSep} />
      <text x="14" y="423" className={s.svgLt}>Public</text>
      <text x="14" y="440" className={s.svgS}>approved only</text>
      <path d="M106 0V470" className={s.svgSep} />
      <Lane x={222} y={22} w={96} title="DGDA register" sub="via OCL" />
      <Lane x={332} y={22} w={96} title="NLM RxNav" sub="RxCUI, codes" />
      <Lane x={552} y={22} w={96} title="DDInter 2.0" sub="interactions" />
      <Lane x={112} y={117} w={96} title="Batch file" sub="10 concept ids" keyBox />
      <Lane x={222} y={117} w={96} title="DGDA load" sub="stage 1" keyBox />
      <Lane x={332} y={117} w={96} title="Substances" sub="stage 2" keyBox />
      <Lane x={442} y={117} w={96} title="Clinical drug" sub="stage 3" keyBox />
      <Lane x={552} y={117} w={96} title="DDInter" sub="stage 4" keyBox />
      {["M208 140H222", "M318 140H332", "M428 140H442", "M538 140H552", "M270 68V117", "M380 68V117", "M600 68V117"].map((d) =>
        <path key={d} d={d} className={s.svgE} markerEnd="url(#ah-s)" />)}
      <rect x="222" y="212" width="426" height="46" rx="10" className={s.svgBox} />
      <text x="232" y="231" className={s.svgC}>Evidence for every record</text>
      <text x="232" y="248" className={s.svgS}>Raw DGDA JSON, every RxNav and DDInter response, stage results</text>
      {["M270 163V212", "M380 163V212", "M490 163V212", "M600 163V212"].map((d) => <path key={d} d={d} className={s.svgE} markerEnd="url(#ah-s)" />)}
      <Lane x={661} y={212} w={118} title="Batch page" sub="source + extraction" />
      <path d="M648 235H661" className={s.svgE} markerEnd="url(#ah-s)" />
      <Lane x={544} y={307} w={104} title="Engineer" sub="check recorded" />
      <Lane x={661} y={307} w={118} title="Pharmacist" sub="A, 8 s undo" keyBox />
      <path d="M720 258V307" className={s.svgE} markerEnd="url(#ah-s)" />
      <path d="M690 258V284H596V307" className={s.svgE} markerEnd="url(#ah-s)" />
      <Lane x={270} y={402} w={220} title="Hidden from public" sub={notReviewed} />
      <Lane x={661} y={402} w={118} title="Public record" sub="site, checker, API" keyBox />
      <path d="M596 353V425H490" className={s.svgE} markerEnd="url(#ah-s)" />
      <text x="588" y="398" className={s.svgS} textAnchor="end">engineer OK alone</text>
      <path d="M720 353V402" className={s.svgE} markerEnd="url(#ah-s)" />
      <text x="728" y="384" className={s.svgS}>approved</text>
      <path d="M720 448V500H160V163" className={s.svgLoop} markerEnd="url(#ah-s)" />
      <text x="440" y="492" className={s.svgS} textAnchor="middle">Issue reported, or the record is re-run: fix, test, run again. It goes back to review.</text>
    </svg>
  );
}
```

- [ ] **Step 4: Write the chapter**

The corrections: §1.6 item 4 (the review gate sentence), item 11 (the DDInter pilot result), item 12 (Domperidone's note as `NO_DATA_SENTENCE` in full) and item 14 (the gate table, the re-run steps and the diagram description). The evidence table's counts are snapshot-only values followed by "as stored on {date}" (§6.8). The batch line under "Batches of 10…" and the progress list at the end are live (§6.8: "the batch progress list in chapter 4 (trade name and review status only)").

Create `web/content/learn/process.tsx`:

```tsx
import type { LearnContext } from "@/components/learn/context";
import { SwimlaneDiagram } from "@/components/learn/diagrams";
import styles from "@/components/learn/learn.module.css";
import { AsStored, Chapter, GateArrow, LivePill, ScrollHint, ScrollRegion, Section, SnapshotBlock, St } from "@/components/learn/parts";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import ExampleMarker from "@/components/ui/ExampleMarker";
import Kbd from "@/components/ui/Kbd";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import StageCheck from "@/components/ui/StageCheck";
import { LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { BATCH_STATUS_WORD, pillStatus } from "@/lib/stats";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S } from "./pilot-snapshot";

const H = 2;
const SZ_ARROW = (
  <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 6H96" className={styles.svgE} vectorEffect="non-scaling-stroke" /><path d="M92 2l6 4-6 4z" className={styles.svgAh} />
  </svg>
);
const allOf = (t: { ok: number }) => `${t.ok} of ${PILOT_IDS.length} records`;

/** Chapter 4 "The process" (Board L; §1.6 items 4, 11, 12 and 14). */
export default function ProcessChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin];
  const [warfPair] = S.warnings[P.warfarin].textMissing;
  const batch = ctx.batch;
  const approved = batch?.approved ?? 0, held = batch?.itemCount ?? 0;
  // /v1/stats lists removed records too (they carry exampleUsable: false) but leaves them out of itemCount and approved.
  const removed = batch ? batch.items.length - batch.itemCount : 0;
  return (
    <Chapter slug="process" level={1}>
      <Section id="process-flow" h={H}>
        <figure className={styles.fig}>
          <ScrollHint />
          <ScrollRegion label="Swimlane diagram of the review process, scrolls sideways">
            <SwimlaneDiagram notReviewed={NOT_REVIEWED} undoWindow={LEARN_BOARD.undoWindow} />
          </ScrollRegion>
          <figcaption className={styles.figcap}>Each lane is one party. Data moves left to right; the dashed line is the loop back when a record has an issue or is re-run.</figcaption>
        </figure>
      </Section>

      <Section id="process-batches" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>A batch is a list of DGDA concept ids committed to the repository, picked in order of how many brands share each generic. Batches grow only when the last ones came back clean, by the size rule in the approved plan.</p>
        <div className={styles.sz}>
          <div className={`${styles.szN} ${styles.isNow}`}><b>10</b><span>records</span></div>
          <div className={styles.szC}>{SZ_ARROW}<span>Two batches in a row with at most 1 issue each and no systemic bug</span></div>
          <div className={styles.szN}><b>50</b><span>records</span></div>
          <div className={styles.szC}>{SZ_ARROW}<span>The same test again</span></div>
          <div className={styles.szN}><b>100</b><span>records</span></div>
        </div>
        <div className={styles.szBack}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M15 4v5a3 3 0 0 1-3 3H3" className={styles.svgE} /><path d="M6.5 8.5 3 12l3.5 3.5" className={styles.svgE} /></svg>
          <p><b>Drop back to 10</b> when a batch has more than 5% issues or any systemic bug. Stay at 10 until the cause is fixed and covered by a test.</p>
        </div>
        {batch && <p className={styles.small}>We are at 10. Batch <span className="mono">{batch.batchId}</span> holds {batch.itemCount} records and its status is {BATCH_STATUS_WORD[batch.status]}.</p>}
      </Section>

      <Section id="process-stages" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The stages always run in this order, and each one commits on its own. One failing product never stops the others. Each stage reports OK, Warning or Failed for every record, with a note a reviewer can read.</p>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <div className={styles.stg}>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>1. DGDA load</span><span className="mono">dgda</span></p>
              <p className={styles.small}>Fetches the product from the DGDA register (an OCL concept) and loads it with DGDA's own ingredient mapping.</p>
              <dl>
                <dt>Reads</dt><dd>OCL concept, one per product</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="fail" /> "not found at source"</li><li><St status="fail" /> "not a registered Drug product"</li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="ok"><p className={styles.small}>{allOf(S.stages.dgda)}</p></StageCheck>
            </article>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>2. Substances</span><span className="mono">substances</span></p>
              <p className={styles.small}>Finds or creates one BDS substance per ICD-11 XM code, records its names and adds codes from NLM RxNav.</p>
              <dl>
                <dt>Reads</dt><dd>RxNav name lookup, then codes for the RxCUI</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="warn" /> "no RxCUI for …"</li><li><St status="fail" /> "no ICD-11 ingredient mapping"</li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="ok"><p className={styles.small}>{allOf(S.stages.substances)}</p></StageCheck>
            </article>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>3. Clinical drug</span><span className="mono">clinical</span></p>
              <p className={styles.small}>Parses the strength text, matches each strength to its substance, maps the dosage form to a route and links the product to a shared BDC clinical drug.</p>
              <dl>
                <dt>Reads</dt><dd>Nothing outside. Pure parsing.</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="warn" /> partial parse, unaligned ingredient, or a substance missing from the text</li><li><St status="fail" /> the text cannot be parsed</li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="ok"><p className={styles.small}>{allOf(S.stages.clinical)}</p></StageCheck>
            </article>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>4. DDInter</span><span className="mono">ddinter</span></p>
              <p className={styles.small}>Maps each substance to its DDInter entries by route, confirms the match by DrugBank id, stores pairs, disease and food records and their text, and records coverage.</p>
              <dl>
                <dt>Reads</dt><dd>DDInter 2.0 pages</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="warn" /> name-only match, no DDInter data, or text not found</li><li><St status="fail" /></li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="warn"><p className={`${styles.small} ${styles.fgText}`}>9 of 10 records warned. Eight list pairs with no DDInter text. Domperidone has no DDInter data. Chloramphenicol is OK.</p></StageCheck>
            </article>
          </div>
        </SnapshotBlock>
        <div className={styles.grid2}>
          <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
            <StageCheck name={`DDInter, ${warf.tradeName}`} status="warn">
              <p className="stage-note">DDInter text not found for {warfPair.ddinterA}/{warfPair.ddinterB}</p>
              <ul className="stage-pairs"><li className="stage-pair">{warfPair.a} + {warfPair.b} <span className="mono">{warfPair.ddinterA}/{warfPair.ddinterB}</span><Severity level="unknown" /></li></ul>
            </StageCheck>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.domperidone]}>
            <StageCheck name={`DDInter, ${S.records[P.domperidone].tradeName}`} status="warn">
              <p className="stage-note">{NO_DATA_SENTENCE}</p>
              <p className={`${styles.small} ${styles.fgText}`}>Shown to reviewers and visitors as the full no-data statement in chapter 6.</p>
            </StageCheck>
          </SnapshotBlock>
        </div>
      </Section>

      <Section id="process-evidence" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Every source response is stored as it arrived, so any code or interaction can be traced to the exact response that produced it, and re-parsing never needs a new fetch. Batch pages show this evidence to signed-in reviewers only, because it includes extracted data no pharmacist has checked yet.</p>
        <ScrollRegion label="Evidence tables, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblMin}`}>
            <caption>What the pilot run kept</caption>
            <thead><tr><th scope="col">Kept in</th><th scope="col">What it holds</th><th scope="col">Pilot rows</th></tr></thead>
            <tbody>
              <tr><th scope="row" className="mono">raw.ocl_concept</th><td>The DGDA record exactly as the OCL server returned it</td><td className="num">{S.evidence.oclConcept}<AsStored /></td></tr>
              <tr><th scope="row" className="mono">raw.http_snapshot</th><td>Every RxNav and DDInter response, with security tokens removed. A stored good response is never overwritten by an error.</td><td>Not in the pilot export</td></tr>
              <tr><th scope="row" className="mono">ops.stage_result</th><td>One result per record per stage, with its note and JSON evidence</td><td className="num">{S.evidence.stageResult}<AsStored /></td></tr>
              <tr><th scope="row" className="mono">ops.batch_run</th><td>Each pipeline run, with OK, Warning and Failed counts per stage</td><td className="num">{S.evidence.batchRun}<AsStored /></td></tr>
              <tr><th scope="row" className="mono">ops.review_decision</th><td>Every "Looks correct" and every issue, with role and time. Rows are only ever added.</td><td className="num">{S.evidence.reviewDecision}<AsStored /></td></tr>
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      <Section id="process-gate" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Approval comes from the decision history. Each decision updates the record's review status, and a re-run resets it, so a decision made before the latest extraction never counts. A record is public only when a pharmacist said "Looks correct" after its latest extraction, and nobody reported an issue after that.</p>
        <div className={styles.gate} role="table" aria-label="Review status changes">
          <div className={`${styles.gateRow} ${styles.gateHead}`} role="row"><span role="columnheader">From</span><span role="columnheader">What happens</span><span role="columnheader">To</span><span role="columnheader">Public</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="pending" /></span><span className={styles.gateEv} role="cell"><GateArrow />An engineer presses <Kbd keys="A" /> and the {LEARN_BOARD.undoWindow} closes</span><span role="cell"><ReviewStatus status="engineer_checked" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="pending" /></span><span className={styles.gateEv} role="cell"><GateArrow />A pharmacist presses <Kbd keys="A" /> and the {LEARN_BOARD.undoWindow} closes</span><span role="cell"><ReviewStatus status="approved" /></span><span className={styles.gatePub} role="cell">Yes</span></div>
          <div className={styles.gateRow} role="row"><span role="cell">Any status</span><span className={styles.gateEv} role="cell"><GateArrow />A reviewer presses <Kbd keys="R" /> and sends a note</span><span role="cell"><ReviewStatus status="issue" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="approved" /></span><span className={styles.gateEv} role="cell"><GateArrow />The pipeline re-runs the record, or shared substance data it shows changes</span><span role="cell"><ReviewStatus status="back_in_review" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="issue" /></span><span className={styles.gateEv} role="cell"><GateArrow />The cause is fixed, covered by a test, and the record re-runs</span><span role="cell"><ReviewStatus status="pending" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
        </div>
      </Section>

      <Section id="process-rerun" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Each record remembers when it was last extracted. Decisions made before that moment stay in the history but stop counting, so an old approval can never cover new data.</p>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin]} pills="inline">
          <ol className={styles.jr}>
            <li><p className={styles.jrH}><span className={styles.jrN}>1</span>Extracted</p><p className={styles.small}>{warf.tradeName} was extracted{S.warfarinExtractedAt ? ` ${fmtUtc(S.warfarinExtractedAt)}` : ""} in batch <span className="mono">{S.batchId}</span>.</p><LivePill ctx={ctx} id={P.warfarin} /></li>
            <li><p className={styles.jrH}><span className={styles.jrN}>2</span>Approved <ExampleMarker /></p><p className={styles.small}>A pharmacist presses <Kbd keys="A" />. When the undo window closes, the record is public.</p><ReviewStatus status="approved" /></li>
            <li><p className={styles.jrH}><span className={styles.jrN}>3</span>Re-run <ExampleMarker /></p><p className={styles.small}>An engineer re-runs the record. The approval stops counting and the record leaves public view.</p><ReviewStatus status="back_in_review" /></li>
          </ol>
        </SnapshotBlock>
        <Banner tone="warn" title={STALE_TITLE}
          body="A reviewer with the old page open sees this. Decisions pause until they reload, and a decision sent from the old page is refused."
          action={<span className={buttonClass("tonal", "sm")} aria-hidden="true">Reload</span>} />
      </Section>

      <Section id="process-done" h={H}>
        <ul className={styles.progList} aria-label={`Batch ${S.batchId} records`}>
          {(batch?.items ?? []).map((i) => <li key={i.conceptId}><b>{i.tradeName}</b><ReviewStatus status={pillStatus(i)} /></li>)}
        </ul>
        <p className={styles.small}><b className={styles.fgText}>{approved} of {held} approved.</b>{removed > 0 ? ` ${removed} ${removed === 1 ? "record was" : "records were"} removed from the batch file.` : ""} Batch <span className="mono">{S.batchId}</span> is {batch ? BATCH_STATUS_WORD[batch.status] : BATCH_STATUS_WORD.in_review}.{batch?.status === "approved" ? "" : ` It becomes approved when all ${held} records are approved by a pharmacist.`}</p>
      </Section>
    </Chapter>
  );
}
```

- [ ] **Step 5: Run it to verify it passes, with the copy guards**

Run: `cd web && npx vitest run tests/learn-process.test.tsx tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts`
Expected: PASS (9 tests in `learn-process.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add web/components/learn/diagrams.tsx web/content/learn/process.tsx web/tests/learn-process.test.tsx
git commit -m "feat(web): Learn chapter 4 with the swimlane, live batch progress and dated evidence counts (§1.6 items 4, 11, 12, 14)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Chapters 5 and 6 — why it works this way, and interactions explained

**Files:**
- Create: `web/content/learn/why.tsx`, `web/content/learn/interactions.tsx`
- Test: `web/tests/learn-why-interactions.test.tsx`

**Interfaces:**
- Consumes: as Task 8, plus `NoDataChip`, `PairCard` (P1A; `PairCard` renders the Expander island with `label="public"`, "Show full text" / "Show less"); `groupBySeverity` and `type Severity` (existing `@/lib/severity`); `severityCounts`, `actionCounts` (Task 4); `LEARN_BOARD.unclassifiedLegend`, `LEARN_BOARD.checkerNeverSays` (Task 3); `FULL_TEXT`, `NOT_RUN`, `SEVERITY_NOT_CLASSIFIED`, `UNKNOWN_PAIR_LINE` (P1A).
- Produces: `default function WhyChapter({ ctx })` in `@/content/learn/why`; `default function InteractionsChapter({ ctx })` in `@/content/learn/interactions`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/learn-why-interactions.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import InteractionsChapter from "@/content/learn/interactions";
import { P } from "@/content/learn/pilot-snapshot";
import WhyChapter from "@/content/learn/why";
import { NOT_REVIEWED, NOT_RUN, NO_DATA_SENTENCE, UNKNOWN_PAIR_LINE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const why = (stats = pilotStats()) => renderToStaticMarkup(<WhyChapter ctx={learnContext(stats)} />);
const ints = (stats = pilotStats()) => renderToStaticMarkup(<InteractionsChapter ctx={learnContext(stats)} />);
const chip = (cls: string, word: string, n: number) => `<span class="sev sev--${cls}">${word} <b class="sev-n">${n}</b></span>`;

describe("chapter 5, Why it works this way", () => {
  it("each rule is an h2 under the chapter's h1, with the id the rail links to", () => {
    const html = why();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<li id="why-nodata"><h2>Why no data never means safe</h2>');
    expect(html.match(/<li id="why-[a-z]+"><h2>/g)).toHaveLength(6);
  });

  it("states the no-data rule with the full sentence, and the live pharmacist line", () => {
    expect(why()).toContain(`so we say exactly that: ${NO_DATA_SENTENCE} Its pairs are marked &quot;not checked&quot;.`);
    expect(why()).toContain("on all 10 records, so none is public.");
    expect(why(pilotStats({ approved: [P.napa] }))).toMatch(/<span class="rv rv--approved">Approved by a pharmacist<\/span> on 1 of 10 records\./);
  });

  it("keeps the evidence lines in snapshot blocks", () => {
    const html = why(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("XM86W0");
    expect(html).not.toContain('<b class="sev-n">298</b>');
    expect(html).toContain("BDS-000008");
  });
});

describe("chapter 6, Interactions explained", () => {
  it("counts the 28 pairs that apply to the pilot products (§1.6 items 5 and 11)", () => {
    const html = ints();
    expect(html).toContain("The counts are the 28 DDInter pairs that apply to the pilot products.");
    expect(html).toContain("<h2>The pairs that apply to the pilot products</h2>");
    expect(html).toContain(`Most serious first: ${chip("major", "Major", 4)}${chip("moderate", "Moderate", 6)}${chip("minor", "Minor", 2)}${chip("unclassified", "Severity not classified by DDInter", 16)}`);
    expect(html).toContain('<span class="cnt">16<small>pairs</small></span>');
    expect(html).toContain("They are not in the 28.");
    expect(html).not.toMatch(/\b35\b/);
    expect(html).not.toContain("Chloramphenicol +");
    expect(html).not.toContain("+ Chloramphenicol");
  });

  it("lists every pair by name in its severity group, with the action when DDInter gives one", () => {
    const html = ints();
    expect(html).toContain('<li>Warfarin + Acetylsalicylic acid <span class="small">synergy</span></li>');
    expect(html).toContain("<li>Metformin + Amoxicillin</li>");
    expect(html.match(/<li>[A-Z][a-z]+( acid)? \+ [^<]+(<span class="small">[a-z]+<\/span>)?<\/li>/g)).toHaveLength(28);
  });

  it("actions: synergy 3, metabolism 6, not given 16 with UNKNOWN_PAIR_LINE (§1.6 items 11 and 12)", () => {
    const html = ints();
    expect(html).toContain('<b>Warfarin + Acetylsalicylic acid</b><span class="small">3 pilot pairs</span>');
    expect(html).toContain('<b>Simvastatin + Clarithromycin</b><span class="small">6 pilot pairs</span>');
    expect(html).toContain('<b>Acetylsalicylic acid + Amlodipine</b><span class="small">1 pilot pair</span>');
    expect(html).toContain('<b>Acetaminophen + Amlodipine</b><span class="small">16 pilot pairs</span>');
    expect(html).toContain(`<p class="pair-source">${UNKNOWN_PAIR_LINE.replace(/"/g, "&quot;")}</p>`);
    expect(html).not.toContain("with no interaction or management text. It is not treated as low risk");
  });

  it("the per-substance table: Domperidone with the full no-data sentence, Chloramphenicol with its three entries", () => {
    const html = ints();
    expect(html).toMatch(new RegExp(`<td colspan="3"><div class="stack"><span class="sev sev--nodata">No interaction data</span><span>${NO_DATA_SENTENCE}</span></div></td>`, "i"));
    expect(html).toContain('<span><span class="mono">DDInter351</span> systemic</span><span><br/><span class="mono">DDInter352</span> ophthalmic</span>');
    expect(html).toContain('<div class="bar" role="img" aria-label="Warfarin drug–drug records: Major 138, Moderate 427, Minor 71, Severity not classified by DDInter 298, of 934.">');
    expect(html).toContain('style="--w:138"');
  });

  it("coverage: not run is its own state with NOT_RUN (§3.6)", () => {
    expect(ints()).toContain(`is a different state: &quot;${NOT_RUN}&quot;.`);
  });

  it("the worked check: one Major pair as a public PairCard, the no-data block, live pills, and the checker sentence", () => {
    const html = ints(pilotStats({ approved: [P.aspirin] }));
    expect(html).toContain('<span class="pair-names">Warfarin + Acetylsalicylic acid</span>');
    expect(html).toContain('<p class="pair-text open" id="chk-text">This combination, especially with analgesic/antipyretic aspirin doses');
    expect(html).toContain("Management, truncated. Full text from DDInter 2.0.");
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + Warfarin</span>');
    expect(html).toMatch(/Aspirin <small>Tablet<\/small><span class="rv rv--approved">/);
    expect(html).toContain("The checker never says &quot;no interactions found&quot; for this list.");
  });

  it("the worked-check banner only while all three are not reviewed, with NOT_REVIEWED from its constant (Review Focus 5, §1.6 item 16)", () => {
    expect(ints()).toContain(`All three records are &quot;${NOT_REVIEWED}&quot;. A public check today would list them as not reviewed and check nothing.`);
    expect(ints()).not.toContain("All three records are not yet reviewed by a pharmacist.");
    for (const approved of [[P.aspirin], [P.warfarin, P.aspirin, P.domperidone]]) {
      const html = ints(pilotStats({ approved }));
      expect(html).not.toContain("All three records are");
      expect(html).not.toContain("A public check today would list them");
    }
  });

  it("the worked check's intro names the pilot products only inside its snapshot block", () => {
    expect(ints()).toContain("Three pilot products checked together: G Warfarin, Aspirin and Domperidone.");
    const html = ints(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("Three pilot products checked together");
    expect(html).not.toContain("One has DDInter data");
  });

  it("withdraws the aggregate blocks when any pilot record has an issue (fail closed)", () => {
    const html = ints(pilotStats({ withdrawn: [P.clarith] }));
    expect(html).not.toContain("Most serious first");
    expect(html).not.toContain("DDInter 2.0 records for each pilot substance");
    expect(html).toContain("This combination, especially with analgesic/antipyretic aspirin doses");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-why-interactions.test.tsx`
Expected: FAIL: `Failed to resolve import "@/content/learn/interactions"`.

- [ ] **Step 3: Write chapter 5**

Board L's rules are `<li>` items with an `<h4>`; with the chapter title as the `<h1>`, they become `<h2>` (§6.8 "Headings", §10.5). Each pilot evidence line is a `SnapshotBlock`; the pharmacist line is live.

Create `web/content/learn/why.tsx`:

```tsx
import type { ReactNode } from "react";
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, SnapshotBlock } from "@/components/learn/parts";
import CodeChip from "@/components/ui/CodeChip";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import { formatCount } from "@/lib/stats";
import { CHAPTERS } from "./chapters";
import { P, PILOT_SNAPSHOT as S, substanceNamed } from "./pilot-snapshot";

const SECTIONS = CHAPTERS.find((c) => c.slug === "why")!.sections;

/** One rule: its heading (an h2, §6.8: Board L's h4 moves up to the level under the chapter's h1), text and pilot evidence. */
function Rule({ id, children }: { id: string; children: ReactNode }) {
  return <li id={id}><h2>{SECTIONS.find((x) => x.id === id)!.title}</h2>{children}</li>;
}

/** Chapter 5 "Why it works this way" (Board L). */
export default function WhyChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin], amox = S.records[P.amoxiclav];
  const warfS = substanceNamed("Warfarin"), amoxS = substanceNamed("Amoxicillin"), clavS = substanceNamed("Clavulanic acid");
  const dompS = substanceNamed("Domperidone");
  const n = ctx.batch?.itemCount ?? 0, a = ctx.batch?.approved ?? 0;
  return (
    <Chapter slug="why" level={1}>
      <ul className={styles.why}>
        <Rule id="why-dgda">
          <p>The DGDA register is the official list of what may be sold in Bangladesh: {formatCount(ctx.stats.registerProducts)} products, each with a DAR number, mapped by the regulator to ICD-11 substance codes. The catalogue we had before was scraped, could not be shared with partners, and left many brands with no generic linked.</p>
          <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
            <p className={styles.ev}>Pilot: {warf.tradeName}'s ingredient comes from DGDA's own mapping, <CodeChip system="ICD11_XM" code={warfS.codes.icd11} /></p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-substance">
          <p>Interactions happen between active ingredients, not brand names. Attaching them to the substance means one DDInter record covers every brand that contains it, and a combination product is checked ingredient by ingredient.</p>
          <SnapshotBlock ctx={ctx} ids={[P.amoxiclav]}>
            <p className={styles.ev}>Pilot: {amox.tradeName} is checked as {amoxS.name} <span className="mono">{amoxS.bdsId}</span> plus {clavS.name} <span className="mono">{clavS.bdsId}</span>.</p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-batches">
          <p>Extraction mistakes are cheap to fix when ten records are on the table and expensive after thousands. Automated extraction can make mistakes that look plausible, so a person compares the source with every extracted field.</p>
          <p className={styles.ev}>Pilot: {n} records, each with the raw DGDA row beside what we extracted.</p>
        </Rule>
        <Rule id="why-nodata">
          <p>Domperidone has no DDInter 2.0 entry (coverage: none). A missing entry says nothing about whether a combination is safe, so we say exactly that: {NO_DATA_SENTENCE} Its pairs are marked "not checked".</p>
          <SnapshotBlock ctx={ctx} ids={[P.domperidone]}>
            <p className={styles.ev}>Pilot: <NoDataChip label="No interaction data" /> {dompS.name}</p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-unclassified">
          <p>DDInter lists many pairs without a grade. Folding them into Minor would make hundreds of ungraded pairs look mild. They keep their own chip and their own count.</p>
          <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
            <p className={styles.ev}>Pilot: {warfS.name} has <Severity level="minor" count={warfS.drugDrug.minor} /><Severity level="unknown" count={warfS.drugDrug.unknown} /></p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-pharmacist">
          <p>Saying a brand contains a substance, and that the substance carries these interactions, is a clinical claim. Engineers check the extraction and their check is recorded, but only a pharmacist's approval reaches the public site and the API.</p>
          {a === 0
            ? <p className={styles.ev}>Pilot: <ReviewStatus status="pending" /> on all {n} records, so none is public.</p>
            : <p className={styles.ev}>Pilot: <ReviewStatus status="approved" /> on {a} of {n} records.</p>}
        </Rule>
      </ul>
    </Chapter>
  );
}
```

- [ ] **Step 4: Write chapter 6**

The corrections: §1.6 item 5 (the section is "The pairs that apply to the pilot products", 28 pairs), item 11 (the counts and the action totals, computed from the snapshot so they cannot drift from it), item 12 ("Not given" uses `UNKNOWN_PAIR_LINE`) and item 16 (the worked-check banner renders `NOT_REVIEWED` from its constant, and only while all three records are not approved, §6.8 "Approval-state sentences"). The worked check's intro names three pilot products, so it sits inside their `SnapshotBlock`. Blocks that draw on every pilot record (the counts, the pair list, the per-substance table, the actions) carry the batch's pill and are withdrawn if any pilot record is. DDInter's text is printed as given and clamped by `.pair-text` (three lines), never cut in the source; the worked check uses `PairCard`, whose Expander offers "Show full text".

Create `web/content/learn/interactions.tsx`:

```tsx
import type { CSSProperties } from "react";
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, LivePill, NeutralTag, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import Banner from "@/components/ui/Banner";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import PairCard from "@/components/ui/PairCard";
import Severity from "@/components/ui/Severity";
import { FULL_TEXT, LEARN_BOARD, NOT_REVIEWED, NOT_RUN, NO_DATA_SENTENCE, SEVERITY_NOT_CLASSIFIED, UNKNOWN_PAIR_LINE } from "@/lib/copy";
import { groupBySeverity, type Severity as Level } from "@/lib/severity";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S, actionCounts, severityCounts, substanceNamed } from "./pilot-snapshot";

const H = 2;
/** The worked check's three products (Board L chapter 6). */
const CHECK_IDS = [P.warfarin, P.aspirin, P.domperidone] as const;
const pairs = (n: number) => `${n} ${n === 1 ? "pair" : "pairs"}`;
const pilotPairs = (n: number) => `${n} pilot ${n === 1 ? "pair" : "pairs"}`;
const LEVELS: Level[] = ["major", "moderate", "minor", "unknown"];
const BAR_CLASS: Record<Level, string> = { major: styles.bMajor, moderate: styles.bModerate, minor: styles.bMinor, unknown: styles.bUnknown };
/** Board L's actions, in its order, with its explanation of each. "unknown" is DDInter's own word, shown as "Not given". */
const ACTIONS: [string, string, string][] = [
  ["synergy", "Synergy", "The two drugs add to or strengthen the same effect."],
  ["metabolism", "Metabolism", "One drug changes how the body breaks down the other."],
  ["antagonism", "Antagonism", "One drug works against the other's effect."],
  ["distribution", "Distribution", "One drug changes how the other spreads through the body."],
  ["others", "Others", "A mechanism DDInter files outside these groups."],
  ["unknown", "Not given", "DDInter gives no mechanism for the pair."],
];

/** Chapter 6 "Interactions explained" (Board L; §1.6 items 5, 11 and 12). */
export default function InteractionsChapter({ ctx }: { ctx: LearnContext }) {
  const counts = severityCounts();
  const acts = actionCounts();
  const total = S.pairs.length;
  const warfS = substanceNamed("Warfarin"), aspS = substanceNamed("Acetylsalicylic acid"), dompS = substanceNamed("Domperidone");
  const w = warfS.drugDrug;
  return (
    <Chapter slug="interactions" level={1}>
      <Section id="int-severity" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Severity chips are square-cornered and each has its own shape, so they never depend on colour alone. The counts are the {total} DDInter pairs that apply to the pilot products.</p>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <ul className={styles.sevLegend}>
            <li><span><Severity level="major" /></span><p>DDInter's most serious grade.</p><span className={styles.cnt}>{counts.major}<small>pairs</small></span></li>
            <li><span><Severity level="moderate" /></span><p>DDInter's middle grade.</p><span className={styles.cnt}>{counts.moderate}<small>pairs</small></span></li>
            <li><span><Severity level="minor" /></span><p>DDInter's lowest grade.</p><span className={styles.cnt}>{counts.minor}<small>pairs</small></span></li>
            <li><span><Severity level="unknown" /></span><p>{LEARN_BOARD.unclassifiedLegend}</p><span className={styles.cnt}>{counts.unknown}<small>pairs</small></span></li>
            <li><span><NoDataChip label="No interaction data" /></span><p>{NO_DATA_SENTENCE} Its pairs are not checked.</p><span className={styles.cnt}>{S.notCheckedPairs}<small>not checked</small></span></li>
          </ul>
        </SnapshotBlock>
      </Section>

      <Section id="int-pilot" h={H}>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <p className={styles.small}><span className={styles.pairSum}>Most serious first: {LEVELS.map((l) => <Severity key={l} level={l} count={counts[l]} />)}</span> Every pair is listed by name below.</p>
          {groupBySeverity(S.pairs).map(([level, group]) => (
            <div key={level} className={styles.pairsGroup}>
              <p className={styles.row}><Severity level={level} /><span className={styles.small}>{pairs(group.length)}</span></p>
              <ul>{group.map((p) => (
                <li key={`${p.ddinterA}/${p.ddinterB}`}>{p.a} + {p.b}{p.action !== "unknown" && <> <span className={styles.small}>{p.action}</span></>}</li>
              ))}</ul>
            </div>
          ))}
          <p className={styles.small}>The {S.notCheckedPairs} pairs between Domperidone and the other pilot substances are not checked, because Domperidone has no DDInter entry. They are not in the {total}.</p>
        </SnapshotBlock>
      </Section>

      <Section id="int-substance" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
          <figure className={styles.fig}>
            <p className={styles.h4}>{warfS.name} <span className={`mono ${styles.monoMuted}`}>{warfS.bdsId}</span>, {w.total} drug–drug records in DDInter</p>
            <div className={styles.bar} role="img" aria-label={`${warfS.name} drug–drug records: Major ${w.major}, Moderate ${w.moderate}, Minor ${w.minor}, ${SEVERITY_NOT_CLASSIFIED} ${w.unknown}, of ${w.total}.`}>
              {LEVELS.map((l) => (
                <i key={l} className={`${BAR_CLASS[l]} ${styles.barSeg}`} style={{ "--w": w[l] } as CSSProperties}><span className={styles.bG} aria-hidden="true" /></i>
              ))}
            </div>
            <div className={styles.barLegend}>{LEVELS.map((l) => <Severity key={l} level={l} count={w[l]} />)}</div>
            <figcaption className={styles.figcap}>Drawn to scale, each segment with its severity glyph. {SEVERITY_NOT_CLASSIFIED} is the second-largest group, and it stays separate from Minor.</figcaption>
          </figure>
        </SnapshotBlock>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <ScrollRegion label="Interaction counts per pilot substance, scrolls sideways">
            <table className={`${styles.tbl} ${styles.tblWide}`}>
              <caption>DDInter 2.0 records for each pilot substance</caption>
              <thead><tr><th scope="col">Substance</th><th scope="col">Pilot product</th><th scope="col">DDInter entries</th><th scope="col">Drug–drug</th><th scope="col">Disease</th><th scope="col">Food</th><th scope="col">Coverage</th></tr></thead>
              <tbody>
                {S.substances.map((s) => (
                  <tr key={s.bdsId}>
                    <th scope="row">{s.name}<span className={`${styles.cmpSub} mono`}>{s.bdsId}</span></th>
                    <td>{S.records[s.product].tradeName}</td>
                    {s.coverage === "none" ? (
                      <>
                        <td>None</td>
                        <td colSpan={3}><div className={styles.stack}><NoDataChip label="No interaction data" /><span>{NO_DATA_SENTENCE}</span></div></td>
                        <td>none</td>
                      </>
                    ) : (
                      <>
                        <td>{s.entries.map((e, i) => <span key={e.id}>{i > 0 && <br />}<span className="mono">{e.id}</span> {e.route}</span>)}</td>
                        <td><div className={styles.stack}><span className="num">{s.drugDrug.total} records</span>{LEVELS.map((l) => <Severity key={l} level={l} count={s.drugDrug[l]} />)}</div></td>
                        <td className="num">{s.disease}</td>
                        <td className="num">{s.food}</td>
                        <td><NeutralTag /></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </SnapshotBlock>
      </Section>

      <Section id="int-actions" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>DDInter tags each pair with an action, the kind of mechanism behind it. These are the actions in the pilot. Other pairs may carry further DDInter groups; we show DDInter's word as given.</p>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <ol className={styles.act}>
            {ACTIONS.map(([action, name, what]) => {
              const ex = S.actionExamples.find((e) => e.action === action)!;
              return (
                <li key={action}>
                  <p className={styles.actN}>{name}<span>{what}</span></p>
                  <div className={styles.actB}>
                    <p className={styles.row}><Severity level={ex.severity} /><b>{ex.names}</b><span className={styles.small}>{pilotPairs(acts[action] ?? 0)}</span></p>
                    {ex.interaction !== null && <p className="pair-text">{ex.interaction}</p>}
                    <p className="pair-source">{ex.interaction === null ? UNKNOWN_PAIR_LINE
                      : ex.truncated ? <>Interaction text, truncated. {FULL_TEXT}.</> : "Interaction text from DDInter 2.0."}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </SnapshotBlock>
      </Section>

      <Section id="int-disease" h={H}>
        <div className={styles.grid2}>
          <SnapshotBlock ctx={ctx} ids={[P.aspirin, P.warfarin]}>
            <div className={styles.card}>
              <p className={styles.h4}>Drug–disease and drug–food</p>
              <p className={styles.small}>DDInter also links a substance to conditions and foods. In the pilot data these are counts only: {aspS.name} {aspS.disease} drug–disease, {warfS.name} {warfS.food} drug–food. The condition and food names and their text are not in the pilot data.</p>
            </div>
          </SnapshotBlock>
          <div className={styles.card}>
            <p className={styles.h4}>Coverage</p>
            <p className={styles.small}>Every substance has a stored coverage value. <span className="mono">full</span> shows as neutral text, never green:</p>
            <p><NeutralTag /></p>
            <p className={styles.small}><span className="mono">none</span> shows the full no-data statement, always expanded. A substance whose DDInter stage has not run yet is a different state: "{NOT_RUN}". It never gets the no-data sentence, because DDInter was never asked.</p>
          </div>
        </div>
      </Section>

      <Section id="int-check" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.aspirin, P.domperidone]} pills="inline">
          <p className={`${styles.prose} ${styles.prose2}`}>Three pilot products checked together: G Warfarin, Aspirin and Domperidone. Three substances make three pairs. One has DDInter data; two involve Domperidone and are not checked.</p>
          <div className="window">
            <div className="window-bar"><span className="window-dot" /><span className="window-dot" /><span className="window-dot" /><span className={styles.wbUrl}>drugdb.eliooo.org/check</span></div>
            <div className={styles.chk}>
              <div className={styles.chkPicked} role="group" aria-label="Products in this check">
                {CHECK_IDS.map((id) => (
                  <span key={id} className={styles.chkP}>{S.records[id].tradeName} <small>{S.records[id].dosageForm}</small><LivePill ctx={ctx} id={id} /></span>
                ))}
              </div>
              {CHECK_IDS.every((id) => ctx.pending(id)) && (
                <Banner tone="info" role="note" title="Run with reviewer access"
                  body={`All three records are "${NOT_REVIEWED}". A public check today would list them as not reviewed and check nothing.`} />
              )}
              <p className={styles.chkSum}><span><b>3</b> substances</span><span><b>1</b> pair checked</span><span><b>2</b> pairs not checked</span></p>
              <PairCard id="chk" severity="major" names={`${warfS.name} + ${aspS.name}`}
                meta={`${S.records[P.warfarin].tradeName} with ${S.records[P.aspirin].tradeName}. Action: synergy. Route: systemic for both.`}
                text={{ kind: "management", body: S.workedCheck.management }} source={<>Management, truncated. {FULL_TEXT}.</>} surface="public" />
              <NoDataBlock title={dompS.name} bdsId={dompS.bdsId} pairs={[`${dompS.name} + ${warfS.name}`, `${dompS.name} + ${aspS.name}`]} />
            </div>
          </div>
          <p className={styles.small}>{LEARN_BOARD.checkerNeverSays}</p>
        </SnapshotBlock>
      </Section>
    </Chapter>
  );
}
```

- [ ] **Step 5: Run it to verify it passes, with the copy guards**

Run: `cd web && npx vitest run tests/learn-why-interactions.test.tsx tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts`
Expected: PASS (12 tests in `learn-why-interactions.test.tsx`; the guards find "low risk" and "no interactions" only in `lib/copy.ts`). Also run `npx vitest run tests/learn-snapshot.test.ts` (its `ids` scan now reads `why.tsx` and `interactions.tsx`).

- [ ] **Step 6: Commit**

```bash
git add web/content/learn/why.tsx web/content/learn/interactions.tsx web/tests/learn-why-interactions.test.tsx
git commit -m "feat(web): Learn chapters 5 and 6 with the 28 pilot pairs and the worked check (§1.6 items 5, 11, 12)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Chapter 7 — for reviewers

**Files:**
- Create: `web/content/learn/reviewers.tsx`
- Modify: `web/tests/marks.test.ts`
- Test: `web/tests/learn-reviewers.test.tsx`

**Interfaces:**
- Consumes: as Task 9, plus `BotCheck` (P1A), `PROMISE_PHARMACIST`, `PROMISE_ENGINEER` (P1A), `LEARN_BOARD.undoWindow` (Task 3).
- Produces: `default function ReviewersChapter({ ctx })` in `@/content/learn/reviewers`; `MATERIAL_ALLOWED` in `tests/marks.test.ts` gains `content/learn/reviewers.tsx` (its pictures of the decision bar use `.decision-bar`, which §3.4 counts as material).

- [ ] **Step 1: Write the failing test and allow the decision-bar picture**

Create `web/tests/learn-reviewers.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import { P } from "@/content/learn/pilot-snapshot";
import ReviewersChapter from "@/content/learn/reviewers";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats()) => renderToStaticMarkup(<ReviewersChapter ctx={learnContext(stats)} />);
const card = (html: string, name: string) =>
  new RegExp(`<div class="stage stage--(ok|warn)"><p class="stage-head"><span class="stage-name">${name}</span>[\\s\\S]*?</div></div>`).exec(html)?.[0] ?? "";

describe("chapter 7, For reviewers", () => {
  it("each record's DDInter warning is the post-fix one (§1.6 items 7 and 10)", () => {
    const html = render();
    expect(html).toContain("DDInter text not found for 5 pairs:");
    expect(html).toContain("DDInter text not found for 6 pairs:");
    expect(html).toContain("DDInter text not found for 1 pair:");
    const warnings = html.slice(html.indexOf('id="rev-warnings"'), html.indexOf('id="rev-issue"'));
    expect(warnings).not.toContain("DDInter351");
    expect(card(html, "Chloramphenicol")).toMatch(/^<div class="stage stage--ok">/);
    expect(card(html, "Chloramphenicol")).not.toContain("stage-note");
    expect(card(html, "Napa").match(/class="stage-pair"/g)).toHaveLength(6);
  });

  it("Domperidone's note is NO_DATA_SENTENCE in full (§1.6 item 12)", () => {
    const html = card(render(), "Domperidone");
    expect(html).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain('<span class="sev sev--nodata">No interaction data</span>Its pairs are not checked.');
  });

  it("the specific Chloramphenicol note is §1.6 item 6's, under the unchanged caption", () => {
    const html = render();
    expect(html).toContain("Chloramphenicol eye drops: route is ophthalmic, and the interactions use DDInter352 (ophthalmic). The ophthalmic entry DDInter352 has no pair with the pilot drugs; it has 112 pairs in DDInter. Please confirm that DDInter351 (systemic) should not apply to this product.");
    expect(html).toContain("Names the record, the field, both values and the question.");
    expect(html).not.toContain("the DDInter warning lists pairs on DDInter351");
  });

  it("keys use §1.6 item 14's undo window; the desk pictures keep the default 8", () => {
    const html = render();
    expect(html).toContain("Opens the undo window (8 seconds by default; 20 or 60 in desk settings). Pharmacist: publishes when it closes.");
    expect(html).toContain("<b>You&#x27;re reviewing as a pharmacist.</b> &quot;Looks correct&quot; publishes this record after an 8-second undo window.");
    expect(html).toContain('<span class="toast-sub">Publishes in 8 seconds.</span>');
    expect(html).toContain('<span class="toast-bar" aria-hidden="true"><i class="toastAt60"></i></span>');
  });

  it("the comparison table comes from the snapshot and is withdrawn with G Warfarin", () => {
    expect(render()).toContain("<caption>G Warfarin, DGDA source beside the extraction</caption>");
    const html = render(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("DGDA source beside the extraction");
    expect(card(html, "G Warfarin")).toBe("");
    expect(html.match(/data-withdrawn/g)).toHaveLength(3);
  });

  it("the relation legend names pilot records, so it is a snapshot block too", () => {
    expect(render()).toContain("G Warfarin&#x27;s dosage form, Tablet.");
    for (const id of [P.warfarin, P.napa, P.chloramphenicol]) {
      const html = render(pilotStats({ withdrawn: [id] }));
      expect(html).not.toContain("dosage form, Tablet.");
      expect(html).not.toContain("Napa&#x27;s Paracetamol is Acetaminophen.");
    }
  });
});
```

In `web/tests/marks.test.ts`, add one entry at the end of `MATERIAL_ALLOWED`:

```ts
  "content/learn/reviewers.tsx",   // P3: Learn chapter 7 pictures the decision bar (§3.4: the bar is material)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-reviewers.test.tsx`
Expected: FAIL: `Failed to resolve import "@/content/learn/reviewers"`.

- [ ] **Step 3: Write the chapter**

The corrections: §1.6 item 6 (the specific Chloramphenicol note, caption unchanged), items 7 and 10 (each record's warning is the post-fix one: Chloramphenicol is OK, no `DDInter351` pair anywhere, rendered from the snapshot), item 12 (Domperidone's note is `NO_DATA_SENTENCE`) and item 14 (the A key's row; the desk pictures keep the default 8 seconds, through `PROMISE_PHARMACIST.body(8)`). Each warning card is its own `SnapshotBlock`, so one record's issue withdraws only its card. The relation legend names G Warfarin's, Napa's and the eye drops' values, so it is a `SnapshotBlock` on those three records. The checklist's examples (`XM86W0`, "`DDInter14` Acetaminophen, systemic") stay outside any block: they illustrate a field to compare, like the FAQ's Napa and Domperidone answers, and are Board L's generic examples (see the self-review notes).

Create `web/content/learn/reviewers.tsx`:

```tsx
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import BotCheck from "@/components/ui/BotCheck";
import { buttonClass } from "@/components/ui/Button";
import ExampleMarker from "@/components/ui/ExampleMarker";
import Kbd from "@/components/ui/Kbd";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataChip from "@/components/ui/NoDataChip";
import Severity from "@/components/ui/Severity";
import StageCheck from "@/components/ui/StageCheck";
import { LEARN_BOARD, NO_DATA_SENTENCE, PROMISE_ENGINEER, PROMISE_PHARMACIST } from "@/lib/copy";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S, substanceNamed } from "./pilot-snapshot";

const H = 2;
const pairs = (n: number) => `${n} ${n === 1 ? "pair" : "pairs"}`;
/** Pictures of the desk keep the default 8 seconds (§1.6 item 14). */
const DESK_DEFAULT_SECONDS = 8;

/** Chapter 7 "For reviewers" (Board L; §1.6 items 6, 7, 12 and 14). */
export default function ReviewersChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin];
  const warfS = substanceNamed("Warfarin");
  return (
    <Chapter slug="reviewers" level={1}>
      <Section id="rev-checklist" h={H}>
        <ScrollRegion label="Review checklist, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblWide}`}>
            <caption>What to compare for every record</caption>
            <thead><tr><th scope="col">Field</th><th scope="col">Compare</th><th scope="col">Looks correct when</th><th scope="col">Report an issue when</th></tr></thead>
            <tbody>
              <tr><th scope="row">Trade name, company, DAR</th><td>The DGDA row with the record header</td><td>The text is identical</td><td>Any character differs</td></tr>
              <tr><th scope="row">Dosage form and route</th><td>DGDA's dosage form with the clinical drug's form and route</td><td>Tablet stays Tablet; Eye Drops gives ophthalmic</td><td>The route does not follow from the form</td></tr>
              <tr><th scope="row">Ingredients</th><td>DGDA's content text with the substances</td><td>Every named ingredient appears once, with salts removed</td><td>An ingredient is missing, extra, or appears twice</td></tr>
              <tr><th scope="row">Strength</th><td>Numbers, units and "per" amounts</td><td><span className="raw">5 mg/ml</span> gives 5 mg per 1 ml</td><td>A number, unit or per amount differs</td></tr>
              <tr><th scope="row">ICD-11 code</th><td>DGDA's XM code with the substance's ICD-11 code</td><td>The same code, such as <span className="mono">XM86W0</span></td><td>The codes differ</td></tr>
              <tr><th scope="row">Crosswalk codes</th><td>RxCUI, ATC, DrugBank and SNOMED CT, with method and confidence</td><td>An exact match at 1.00</td><td>A code belongs to another substance</td></tr>
              <tr><th scope="row">DDInter entry</th><td>The DDInter name and route with the substance and the product's route</td><td><span className="mono">DDInter14</span> Acetaminophen, systemic</td><td>Wrong drug, or the wrong route entry</td></tr>
              <tr><th scope="row">Stage warnings</th><td>Every note in the stage cards</td><td>You understand each warning and it is expected</td><td>A warning points to a real problem</td></tr>
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      <Section id="rev-labels" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
          <div className="cmp-wrap" tabIndex={0} role="region" aria-label={`${warf.tradeName} comparison table, scrolls sideways`}>
            <table className="cmp">
              <caption>{warf.tradeName}, DGDA source beside the extraction</caption>
              <thead><tr><th scope="col">Field</th><th scope="col">DGDA source</th><th scope="col">Relation</th><th scope="col">Extracted</th></tr></thead>
              <tbody>
                <tr><th scope="row">Trade name</th><td className="cmp-src">{warf.tradeName}</td><td><MatchRelation kind="same" /></td><td>{warf.tradeName}</td></tr>
                <tr><th scope="row">DAR number</th><td className="cmp-src"><span className="mono">{warf.darNumber}</span></td><td><MatchRelation kind="same" /></td><td><span className="mono">{warf.darNumber}</span></td></tr>
                <tr><th scope="row">Dosage form</th><td className="cmp-src">{warf.dosageForm}</td><td><MatchRelation kind="same" /></td><td>{warf.dosageForm}</td></tr>
                <tr><th scope="row">Route</th><td className="cmp-src">Not stated<span className="cmp-sub">The register has no route field</span></td><td><MatchRelation kind="added" /></td><td>{warf.route}<span className="cmp-sub">From the dosage form</span></td></tr>
                <tr><th scope="row">Ingredient</th><td className="cmp-src"><span className="raw">{warf.genericContentRaw}</span></td><td><MatchRelation kind="salt" /></td><td>{warfS.name} <span className="mono">{warfS.bdsId}</span>, 5 mg</td></tr>
                <tr><th scope="row">ICD-11 code</th><td className="cmp-src"><span className="mono">{warfS.codes.icd11}</span> {warfS.name}</td><td><MatchRelation kind="same" /></td><td><span className="mono">{warfS.codes.icd11}</span></td></tr>
              </tbody>
            </table>
          </div>
        </SnapshotBlock>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.napa, P.chloramphenicol]}>
          <ul className={styles.sevLegend}>
            <li><span><MatchRelation kind="same" /></span><p>The same value on both sides. G Warfarin's dosage form, Tablet.</p><span /></li>
            <li><span><MatchRelation kind="norm" /></span><p>The same substance under a different name. Napa's Paracetamol is Acetaminophen.</p><span /></li>
            <li><span><MatchRelation kind="salt" /></span><p>The salt is dropped to reach the substance. Warfarin Sodium becomes Warfarin.</p><span /></li>
            <li><span><MatchRelation kind="added" /></span><p>A value we derived that the source does not state. Ophthalmic for Chloramphenicol eye drops.</p><span /></li>
            <li><span><MatchRelation kind="differs" /></span><p>The two sides disagree. Decide which is right, and report an issue if the extraction is wrong. No pilot record has one.</p><span /></li>
          </ul>
        </SnapshotBlock>
      </Section>

      <Section id="rev-warnings" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The DDInter stage names every pair whose text it could not find. Expect these on the review desk. Each one is a pair DDInter lists without a grade or text.</p>
        <div className={styles.stg}>
          {PILOT_IDS.map((id) => {
            const w = S.warnings[id];
            return (
              <SnapshotBlock key={id} ctx={ctx} ids={[id]}>
                <StageCheck name={S.records[id].tradeName} status={w.status}>
                  {w.noData && <>
                    <p className="stage-note">{NO_DATA_SENTENCE}</p>
                    <p className="stage-pair"><NoDataChip label="No interaction data" />Its pairs are not checked.</p>
                  </>}
                  {w.textMissing.length > 0 && <>
                    <p className="stage-note">DDInter text not found for {pairs(w.textMissing.length)}:</p>
                    <ul className="stage-pairs">
                      {w.textMissing.map((t) => (
                        <li key={`${t.ddinterA}/${t.ddinterB}`} className="stage-pair">{t.a} + {t.b} <span className="mono">{t.ddinterA}/{t.ddinterB}</span><Severity level="unknown" /></li>
                      ))}
                    </ul>
                  </>}
                </StageCheck>
              </SnapshotBlock>
            );
          })}
        </div>
      </Section>

      <Section id="rev-issue" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>An engineer reads your note and fixes the cause. Name the field, quote both values, and say what you expected. One problem per note, 5 to 1000 characters.</p>
        <div className={styles.notes}>
          <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteGood}`}><span className="ico" aria-hidden="true" />Specific <ExampleMarker /></p>
            <p className={styles.quote}>Chloramphenicol eye drops: route is ophthalmic, and the interactions use DDInter352 (ophthalmic). The ophthalmic entry DDInter352 has no pair with the pilot drugs; it has 112 pairs in DDInter. Please confirm that DDInter351 (systemic) should not apply to this product.</p>
            <p className={styles.small}>Names the record, the field, both values and the question.</p>
          </div>
          <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteVague}`}><span className="ico" aria-hidden="true" />Vague <ExampleMarker /></p>
            <p className={styles.quote}>Interactions look wrong.</p>
            <p className={styles.small}>Which pair? Wrong how? The engineer has to guess.</p>
          </div>
          <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteGood}`}><span className="ico" aria-hidden="true" />Specific <ExampleMarker /></p>
            <p className={styles.quote}>G Warfarin: Warfarin + Amlodipine (DDInter1951/DDInter79) has no grade and no text. Please confirm DDInter 2.0 shows none before I approve.</p>
            <p className={styles.small}>Quotes the stage note and asks for one check.</p>
          </div>
          <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteVague}`}><span className="ico" aria-hidden="true" />Vague <ExampleMarker /></p>
            <p className={styles.quote}>Check this record.</p>
            <p className={styles.small}>No field and no reason. It will come back to you.</p>
          </div>
        </div>
      </Section>

      <Section id="rev-decide" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The decision bar stays pinned under the record and says what your decision does for your role. Approving uses the <Kbd keys="A" /> key or the "Looks correct" button. Enter never approves.</p>
        <div className={styles.mockDesk} role="img" aria-label="Decision bar for a pharmacist: Looks correct publishes this record after an 8-second undo window.">
          <div className={styles.peek} aria-hidden="true"><i className={styles.peek60} /><i className={styles.peek85} /><i className={styles.peek40} /></div>
          <div className="decision-bar">
            <div className="decision-main">
              <p className="decision-promise"><b>{PROMISE_PHARMACIST.lead}</b> {PROMISE_PHARMACIST.body(DESK_DEFAULT_SECONDS)}</p>
              <div className="decision-actions"><BotCheck state="passed" /><span className={buttonClass("tonal")}>Report issue <Kbd keys="R" /></span><span className={buttonClass("primary")}>Looks correct <Kbd keys="A" /></span></div>
            </div>
          </div>
        </div>
        <div className={styles.mockDesk} role="img" aria-label="Decision bar for an engineer: Looks correct records your check. It does not publish.">
          <div className="decision-bar">
            <div className="decision-main">
              <p className="decision-promise"><b>{PROMISE_ENGINEER.lead}</b> {PROMISE_ENGINEER.body}</p>
              <div className="decision-actions"><BotCheck state="passed" /><span className={buttonClass("tonal")}>Report issue <Kbd keys="R" /></span><span className={buttonClass("primary")}>Looks correct <Kbd keys="A" /></span></div>
            </div>
          </div>
        </div>
        <div className={styles.toastDemo}>
          <div className="toast" role="img" aria-label="Toast: G Warfarin marked correct. Publishes in 8 seconds. Undo, key U.">
            <p className="toast-msg"><b>G Warfarin</b> marked correct.<span className="toast-sub">Publishes in {DESK_DEFAULT_SECONDS} seconds.</span></p>
            <span className="toast-undo"><span className="ico" aria-hidden="true" />Undo <Kbd keys="U" /></span>
            <span className="toast-bar" aria-hidden="true"><i className={styles.toastAt60} /></span>
          </div>
          <p className={`${styles.small} ${styles.toastNote}`}>Shown here at 60% of the window. Press <Kbd keys="U" /> or Undo and nothing is saved or published. The toast never takes focus, and screen readers hear one announcement when it opens, not a countdown. Every decision passes a Cloudflare Turnstile bot check.</p>
        </div>
      </Section>

      <Section id="rev-keys" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Shortcuts work while focus is inside the review workspace. They stop while you type in a field, and Ctrl, Cmd and Alt combinations are left to the browser.</p>
        <ScrollRegion label="Keyboard shortcuts, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblMin}`}>
            <caption>Review workspace shortcuts</caption>
            <thead><tr><th scope="col">Key</th><th scope="col">Action</th><th scope="col">What it does</th></tr></thead>
            <tbody>
              <tr><th scope="row"><Kbd keys="A" /></th><td>Looks correct</td><td>Opens the {LEARN_BOARD.undoWindow}. Pharmacist: publishes when it closes. Engineer: records the check, does not publish.</td></tr>
              <tr><th scope="row"><Kbd keys="U" /></th><td>Undo</td><td>Cancels the open window. Nothing is saved or published.</td></tr>
              <tr><th scope="row"><Kbd keys="R" /></th><td>Report issue</td><td>Opens the note field and moves focus into it.</td></tr>
              <tr><th scope="row"><Kbd keys="J" /> <Kbd keys="K" /></th><td>Next, previous</td><td>Moves the selection in the record list. Arrow keys do the same inside the list.</td></tr>
              <tr><th scope="row"><Kbd keys="E" /></th><td>Evidence</td><td>Shows or hides the raw DGDA JSON and the pipeline notes.</td></tr>
              <tr><th scope="row"><Kbd keys="S" /></th><td>DGDA source</td><td>Opens the register entry for the record's DAR number in a new tab.</td></tr>
              <tr><th scope="row"><Kbd keys="?" /></th><td>Shortcuts</td><td>Shows this list inside the workspace.</td></tr>
              <tr><th scope="row"><Kbd keys="Esc" /></th><td>Close</td><td>Closes the shortcuts sheet, the evidence panel or the note field.</td></tr>
              <tr><th scope="row"><Kbd keys="Enter" /></th><td>Never approves</td><td>Bare Enter has no workspace action. On a focused "Looks correct" button it is blocked and a hint names the A key.</td></tr>
              <tr><th scope="row"><Kbd keys="Ctrl" /> <Kbd keys="Enter" /></th><td>Send report</td><td>Only inside the note field. Cmd and Enter on a Mac.</td></tr>
            </tbody>
          </table>
        </ScrollRegion>
      </Section>
    </Chapter>
  );
}
```

- [ ] **Step 4: Run it to verify it passes, with the guards**

Run: `cd web && npx vitest run tests/learn-reviewers.test.tsx tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts`
Expected: PASS (6 tests in `learn-reviewers.test.tsx`). Also run `npx vitest run tests/learn-snapshot.test.ts` (its `ids` scan now reads `reviewers.tsx`, including the `ids={[id]}` of the warning cards).

- [ ] **Step 5: Commit**

```bash
git add web/content/learn/reviewers.tsx web/tests/learn-reviewers.test.tsx web/tests/marks.test.ts
git commit -m "feat(web): Learn chapter 7 with the post-fix warnings and the undo-window wording (§1.6 items 6, 7, 12, 14)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Chapter 8 — for partners: the endpoint table from the controllers, the §7.4 example bodies

**Files:**
- Create: `web/content/learn/partners.tsx`
- Test: `web/tests/learn-partners.test.tsx`

**Interfaces:**
- Consumes: as Task 10; the API controllers under `api/src/main/java/com/niramoy/bddrug/presentation/` (test only), including Task 1's `StatsController`.
- Produces: in `@/content/learn/partners`: `type Access = "Public" | "All" | "Reviewer" | "Token"`, `type Endpoint = { method: "GET" | "POST"; path: string; what: string; access: Access[] }`, `ENDPOINTS: Endpoint[]`, `PLANNED: readonly string[]` (Board L's planned endpoint paths, which no controller may serve yet), the example bodies `ENVELOPE`, `PRODUCT_PUBLIC`, `PRODUCT_REVIEWER`, `CHECK_REQUEST`, `CHECK_PUBLIC`, `CHECK_REVIEWER`, and `default function PartnersChapter({ ctx }: { ctx: LearnContext })`. The reviewer-access panels are `SnapshotBlock`s (they carry Napa's, G Warfarin's, Aspirin's and Domperidone's clinical values); the public captions follow §6.8 "Approval-state sentences" and "Before P2". The two example switches render `<div class="seg" role="group" aria-label="Who is asking" data-switch="prod|chk" hidden>` with buttons carrying `data-panel="prod-public|prod-all|chk-public|chk-all"`; Task 13a's `wireExampleSwitches` enhances them.

- [ ] **Step 1: Write the failing test**

The endpoint test reads every `*Controller.java` and compares its mappings with the table, so "Endpoint paths come from the API controllers" (Board L footer) stays true: a controller added later fails this test until the table lists it. The shape tests pin §11.2's "both example bodies match the §7.4 shapes (no `reviewStatus`; `notReviewed[]` with `tradeName`)".

Create `web/tests/learn-partners.test.tsx`:

```tsx
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import { P } from "@/content/learn/pilot-snapshot";
import PartnersChapter, {
  CHECK_PUBLIC, CHECK_REQUEST, CHECK_REVIEWER, ENDPOINTS, PLANNED, PRODUCT_PUBLIC, PRODUCT_REVIEWER,
} from "@/content/learn/partners";
import { NOT_REVIEWED } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats(), apiStub = false) => renderToStaticMarkup(<PartnersChapter ctx={learnContext(stats, apiStub)} />);
const decode = (h: string) => h.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const html = render();
const text = decode(html);
const keys = (o: object) => Object.keys(o).sort();
const NAPA_CAPTION = 'Napa is not approved yet, so a public caller gets its id, trade name and status "not_reviewed", with <span class="mono">hidden: true</span>.';

/** Every `@GetMapping`/`@PostMapping` of the API controllers, as "METHOD /path" with path variables written `{}`. */
function controllerRoutes(): string[] {
  const dir = fileURLToPath(new URL("../../api/src/main/java/com/niramoy/bddrug/presentation/", import.meta.url));
  return readdirSync(dir).filter((f) => f.endsWith("Controller.java")).flatMap((f) => {
    const src = readFileSync(join(dir, f), "utf8");
    const base = /@RequestMapping\("([^"]+)"\)/.exec(src)?.[1] ?? "";
    return [...src.matchAll(/@(Get|Post)Mapping(?:\("([^"]*)"\))?/g)].map((m) => `${m[1].toUpperCase()} ${base}${m[2] ?? ""}`);
  }).map((r) => r.replace(/\{[^}]+\}/g, "{}")).sort();
}
const tableRoutes = () => ENDPOINTS.map((e) => `${e.method} ${e.path.split("?")[0].replace(/\{[^}]+\}/g, "{}")}`).sort();

describe("chapter 8: the endpoint table comes from the API controllers (§6.8)", () => {
  it("lists exactly the controllers' mappings, /v1/stats included", () => {
    expect(tableRoutes()).toEqual(controllerRoutes());
    expect(tableRoutes()).toContain("GET /v1/stats");
  });

  it("access matches §2.2: batch evidence and /v1/review/* are Reviewer, writes are Token, stats are Public", () => {
    for (const e of ENDPOINTS) {
      if (e.path.startsWith("/v1/review/") || (e.method === "GET" && e.path.startsWith("/v1/batches"))) expect(e.access).toEqual(["Reviewer"]);
      if (e.method === "POST" && !e.path.startsWith("/v1/interactions")) expect(e.access).toEqual(["Token"]);
    }
    expect(ENDPOINTS.find((e) => e.path === "/v1/stats")!.access).toEqual(["Public"]);
  });

  it("the access legend's All row is §1.6 item 13's", () => {
    expect(text).toContain('<dt>All</dt><dd><span class="mono">scope=all</span> with the internal token, used only by integration tests. Reviewers read unreviewed data through <span class="mono">/v1/review/*</span>.</dd>');
    expect(text).not.toContain("Reviewers see everything this way");
  });

  it("decision history is described as the controller serves it: token only, with emails (§7.1 A2, §1.6 item 16)", () => {
    const history = ENDPOINTS.find((e) => e.method === "GET" && e.path === "/v1/batches/{b}/items/{c}/decisions")!;
    expect(history.what).toBe("Decision history, newest first, with notes, roles and reviewer emails. Internal token only.");
    expect(ENDPOINTS.filter((e) => /never emails/i.test(e.what))).toEqual([]);
    expect(text).toContain("is readable only by signed-in reviewers. Reviewer emails are never shown on public pages or in public API answers.");
    expect(text).not.toContain("It never includes emails.");
  });

  it("the planned endpoints are not served by any controller yet", () => {
    expect(PLANNED).toEqual(["/v1/search", "/v1/substances/{bdsId}/interactions", "/v1/releases"]);
    for (const p of PLANNED) expect(controllerRoutes()).not.toContain(`GET ${p.replace(/\{[^}]+\}/g, "{}")}`);
    expect(text).toContain('Planned endpoints: <span class="mono">/v1/search</span>, <span class="mono">/v1/substances/{bdsId}/interactions</span>, <span class="mono">/v1/releases</span>.');
  });
});

describe("chapter 8: both example bodies match the §7.4 shapes (§11.2)", () => {
  it("the public product is the hidden stub: id, trade name, status, batch, hidden; never reviewStatus", () => {
    expect(keys(PRODUCT_PUBLIC.data)).toEqual(["batchId", "conceptId", "hidden", "status", "tradeName"]);
    expect(PRODUCT_PUBLIC.data).toMatchObject({ status: "not_reviewed", hidden: true, batchId: "0001-pilot" });
    expect(PRODUCT_REVIEWER.data).not.toHaveProperty("reviewStatus");
    expect(html).not.toContain("reviewStatus");
  });

  it("the check bodies carry every §7.4 CheckResult field; notReviewed[] items carry tradeName", () => {
    const top = ["alerts", "duplicates", "noData", "noInteraction", "notChecked", "notReviewed", "products", "summary"];
    const summary = ["alertPairs", "bySeverity", "checkedPairs", "medicines", "noInteractionPairs", "notCheckedPairs", "notReviewed", "totalPairs"];
    for (const body of [CHECK_PUBLIC, CHECK_REVIEWER]) {
      expect(keys(body.data)).toEqual(top);
      expect(keys(body.data.summary)).toEqual(summary);
      expect(keys(body.data.summary.bySeverity)).toEqual(["major", "minor", "moderate", "unknown"]);
      expect(body.data.summary.medicines).toBe(CHECK_REQUEST.conceptIds.length);
    }
    for (const n of CHECK_PUBLIC.data.notReviewed) expect(keys(n)).toEqual(["conceptId", "tradeName"]);
    expect(CHECK_PUBLIC.data.summary.notReviewed).toBe(3);
  });

  it("the reviewer check: alert sides, chosen entries, not-checked reasons and counts are consistent", () => {
    const d = CHECK_REVIEWER.data;
    const [alert] = d.alerts;
    expect(keys(alert)).toEqual(["a", "actions", "b", "ddinterA", "ddinterB", "interaction", "interactionId", "management", "routeAssumed", "severity", "source"]);
    for (const s of [alert.a, alert.b, ...d.notChecked.flatMap((n) => [n.a, n.b])]) expect(keys(s)).toEqual(["bdsId", "conceptId", "name", "routeScope", "tradeName"]);
    for (const p of d.products) for (const s of p.substances) {
      expect(keys(s)).toEqual(["bdsId", "coverage", "ddinter", "name"]);
      for (const r of s.ddinter) expect(keys(r)).toEqual(["ddinterId", "name", "routeAssumed", "routeScope"]);
    }
    for (const n of d.notChecked) expect(["no_data", "not_run", "no_route", "unmapped", "same_product"]).toContain(n.reason);
    expect(d.summary.alertPairs).toBe(d.alerts.length);
    expect(d.summary.notCheckedPairs).toBe(d.notChecked.length);
    expect(d.summary.totalPairs).toBe(d.summary.checkedPairs + d.summary.notCheckedPairs);
    expect(alert.interaction).toMatch(/^Aspirin, even in small doses, .+ lesions\. …$/);
  });

  it("prints each body as indented JSON, with the §1.6 item 13 caption once the API serves the §7.4 stub", () => {
    for (const body of [PRODUCT_PUBLIC, PRODUCT_REVIEWER, CHECK_REQUEST, CHECK_PUBLIC, CHECK_REVIEWER]) expect(text).toContain(JSON.stringify(body, null, 2));
    expect(text).not.toContain("a public caller gets its id");
    expect(decode(render(pilotStats(), true))).toContain(`${NAPA_CAPTION} Show "${NOT_REVIEWED}". Never show "not found".`);
    expect(text).toContain('<code>hidden: true</code>, <code>status "not_reviewed"</code> or <code>"removed"</code>');
  });

  it("the public captions only while they are true (Review Focus 5)", () => {
    expect(text).toContain("None of the three is approved, so a public check lists all three");
    const napa = decode(render(pilotStats({ approved: [P.napa] }), true));
    expect(napa).not.toContain("Napa is not approved yet");
    expect(napa).toContain("None of the three is approved");
    const one = decode(render(pilotStats({ approved: [P.aspirin] })));
    expect(one).not.toContain("None of the three is approved");
  });

  it("the reviewer-access panels are withdrawn with their records (§6.8)", () => {
    const napa = render(pilotStats({ withdrawn: [P.napa] }));
    expect(napa).toMatch(/<div id="prod-all"><div class="snap" data-withdrawn="">/);
    expect(napa).not.toContain("BDC-000001");
    expect(napa).not.toContain("Acetaminophen 500 mg");
    const warf = render(pilotStats({ withdrawn: [P.warfarin] }));
    expect(warf).toMatch(/<div id="chk-all"><div class="snap" data-withdrawn="">/);
    expect(warf).not.toContain("Aspirin, even in small doses");
    expect(warf).toContain(JSON.stringify(CHECK_PUBLIC, null, 2).replace(/"/g, "&quot;"));
  });

  it("without JavaScript both panels show and the switch is hidden (§6.8)", () => {
    for (const id of ["prod-public", "prod-all", "chk-public", "chk-all"]) expect(html).toContain(`<div id="${id}">`);
    expect(html.match(/<div class="seg" role="group" aria-label="Who is asking" data-switch="(prod|chk)" hidden="">/g)).toHaveLength(2);
    expect(html.match(/<pre class="codePre" tabindex="0" role="region" aria-label="[^"]+">/g)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-partners.test.tsx`
Expected: FAIL: `Failed to resolve import "@/content/learn/partners"`.

- [ ] **Step 3: Write the chapter**

§1.6 item 13 applies: the public product body is the §7.4 hidden stub (`conceptId`, `tradeName`, `status: "not_reviewed"`, `batchId`, `hidden: true`), no body carries `reviewStatus`, `notReviewed[]` items carry `tradeName`, and the caption, the safety-fields row and the "All" access legend are the corrected ones. Those bodies describe the §7.4 contract that P2 ships, under Board L's "illustrative" banner; the caption under the public product body states what a caller gets today, so it renders only when `ctx.apiStub` is true and Napa is not approved (§6.8 "Before P2", "Approval-state sentences"). The check's public caption renders only while none of the three is approved. The two reviewer-access panels carry pilot clinical values (Napa's `BDC-000001`, Acetaminophen 500 mg, `DDInter14`; the Warfarin + Acetylsalicylic acid alert and its DDInter text; Domperidone in `noData`), so each is a `SnapshotBlock` on its records, inside the panel `div` the switch toggles. §1.6 item 16 applies to the Reviewer access legend; the decisions row is regenerated from `ReviewController` (§6.8: "regenerated from the controllers"), which needs the token and returns reviewer emails (§7.1 A2). The table lists the controllers on `main` (P2's endpoints do not exist yet, so Board L's "Planned endpoints" line stays true, and a test fails when a controller starts serving one of `PLANNED`); its descriptions for the endpoints Board L did not have (`/v1/stats`, `/v1/review/*`, `/v1/audit-events`) are regenerated from §7.3, §7.4 and §7.5 as §6.8 asks. The alert's `interactionId` is `null` in the example, because the pilot export holds no DDInter interaction id and the body is illustrative (Board L's banner). The `<pre>` blocks are keyboard-scrollable regions (`role="region"`, as §10.4 asks of every scrolling block; an `aria-label` on a bare `<pre>` is not allowed). The access legend's `<dl>` holds `<dt>`/`<dd>` pairs (Board L's `<b>`/`<span>` inside a `<dl>` fails axe `definition-list`).

Create `web/content/learn/partners.tsx`:

```tsx
import { Fragment } from "react";
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import Banner from "@/components/ui/Banner";
import ExampleMarker from "@/components/ui/ExampleMarker";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { FULL_TEXT, LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE } from "@/lib/copy";
import { P, PILOT_SNAPSHOT as S, substanceNamed, substancesOf } from "./pilot-snapshot";

const H = 2;

// ---- The endpoint table: every mapping in api/…/presentation/*Controller.java (learn-partners.test.ts pins the set). ----

export type Access = "Public" | "All" | "Reviewer" | "Token";
export type Endpoint = { method: "GET" | "POST"; path: string; what: string; access: Access[] };
export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/v1/products?q=&page=", what: "Search by brand or ingredient text, 20 a page", access: ["Public", "All"] },
  { method: "GET", path: "/v1/products/loaded", what: "A light list for the checker's picker: concept id, trade name, dosage form", access: ["Public", "All"] },
  { method: "GET", path: "/v1/products/{conceptId}", what: "One product with ingredients, clinical drug and DDInter entries. Unapproved: a hidden stub.", access: ["Public", "All"] },
  { method: "GET", path: "/v1/substances/{bdsId}", what: "Names, codes, coverage, products, and drug, disease and food interactions by severity", access: ["Public", "All"] },
  { method: "POST", path: "/v1/interactions/check", what: "Checks a list of products: alerts, duplicates, noData, notReviewed", access: ["Public", "All"] },
  { method: "GET", path: "/v1/stats", what: "Counts, and each batch's records by trade name and public status", access: ["Public"] },
  { method: "GET", path: "/v1/batches", what: "All batches, newest first", access: ["Reviewer"] },
  { method: "GET", path: "/v1/batches/{batchId}", what: "Every record with extracted data, raw DGDA JSON, stage results and review state", access: ["Reviewer"] },
  { method: "GET", path: "/v1/batches/{batchId}/report", what: "Stage counts, review progress, warnings, the last 5 runs, change since the previous run", access: ["Reviewer"] },
  { method: "POST", path: "/v1/batches/{b}/items/{c}/decisions", what: 'Records "ok" or "issue". A stale page gets 409.', access: ["Token"] },
  { method: "GET", path: "/v1/batches/{b}/items/{c}/decisions", what: "Decision history, newest first, with notes, roles and reviewer emails. Internal token only.", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches", what: "Batches with their review counts", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/items?show=&q=", what: "A batch's records with display status and triage hints", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/versions", what: "Each record's version, for stale detection", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/items/{c}", what: "One record for the review desk: source, extraction, checks, interactions and history", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/items/{c}/diff?from=", what: "What changed since an earlier extraction", access: ["Reviewer"] },
  { method: "POST", path: "/v1/flags", what: "Creates a problem report", access: ["Token"] },
  { method: "GET", path: "/v1/flags?status=", what: "Open or resolved problem reports", access: ["Token"] },
  { method: "POST", path: "/v1/flags/{id}/resolve", what: "Marks a report resolved", access: ["Token"] },
  { method: "POST", path: "/v1/audit-events", what: "Records a sign-in, sign-out or review event for the audit trail", access: ["Token"] },
];

/** Board L's "Planned endpoints" (api-versions). learn-partners.test.tsx fails once a controller serves one of them. */
export const PLANNED = ["/v1/search", "/v1/substances/{bdsId}/interactions", "/v1/releases"] as const;

// ---- The example bodies, in the §7.4 shapes (§1.6 item 13; learn-partners.test.ts pins them). ----

const META = { timestamp: "2026-10-12T04:00:00Z", requestId: "3b8f1c2e-6a4d-4f0e-9c1b-2d7e5a9f0c11" };
const envelope = <T,>(data: T) => ({ success: true, data, message: "OK", errors: [] as unknown[], metadata: META });
/** DDInter's first sentence, then an ellipsis: the bodies are cut here for space (the figcaption says so). */
const cut = (text: string) => `${text.slice(0, text.indexOf(". ") + 1)} …`;

const napa = S.records[P.napa];
const [acet] = substancesOf(P.napa);
const warfS = substanceNamed("Warfarin"), aspS = substanceNamed("Acetylsalicylic acid"), dompS = substanceNamed("Domperidone");
const side = (id: typeof P.warfarin | typeof P.aspirin | typeof P.domperidone, s: typeof warfS) =>
  ({ conceptId: id, tradeName: S.records[id].tradeName, bdsId: s.bdsId, name: s.name, routeScope: s.entries[0]?.route ?? null });
const ref = (s: typeof warfS) => s.entries.map((e) => ({ ddinterId: e.id, name: s.name, routeScope: e.route, routeAssumed: false }));
const CHECK_IDS = [P.warfarin, P.aspirin, P.domperidone] as const;
const synergy = S.actionExamples.find((e) => e.action === "synergy")!;

export const ENVELOPE = envelope({});
export const PRODUCT_PUBLIC = envelope({ conceptId: P.napa, tradeName: napa.tradeName, status: "not_reviewed", batchId: S.batchId, hidden: true });
export const PRODUCT_REVIEWER = envelope({
  conceptId: P.napa, darNumber: napa.darNumber, tradeName: napa.tradeName, company: napa.company, dosageForm: napa.dosageForm,
  genericContentRaw: napa.genericContentRaw, qualityFlag: null, ingredients: [{ xmCode: acet.codes.icd11, name: acet.name }],
  parseStatus: "parsed", parseNote: null,
  clinicalDrug: { bdcId: napa.bdcId, displayName: napa.clinicalDrug, doseForm: napa.dosageForm, route: napa.route,
    ingredients: [{ bdsId: acet.bdsId, name: acet.name, strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null, ddinter: ref(acet) }] },
});
export const CHECK_REQUEST = { conceptIds: [...CHECK_IDS] };
const NONE = { major: 0, moderate: 0, minor: 0, unknown: 0 };
export const CHECK_PUBLIC = envelope({
  summary: { medicines: 3, totalPairs: 0, checkedPairs: 0, alertPairs: 0, noInteractionPairs: 0, notCheckedPairs: 0, notReviewed: 3, bySeverity: NONE },
  products: [], alerts: [], noInteraction: [], notChecked: [], duplicates: [], noData: [],
  notReviewed: CHECK_IDS.map((id) => ({ conceptId: id, tradeName: S.records[id].tradeName })),
});
export const CHECK_REVIEWER = envelope({
  summary: { medicines: 3, totalPairs: 3, checkedPairs: 1, alertPairs: 1, noInteractionPairs: 0, notCheckedPairs: 2, notReviewed: 0,
    bySeverity: { ...NONE, major: 1 } },
  products: CHECK_IDS.map((id, i) => {
    const s = [warfS, aspS, dompS][i];
    return { conceptId: id, tradeName: S.records[id].tradeName, substances: [{ bdsId: s.bdsId, name: s.name, coverage: s.coverage, ddinter: ref(s) }] };
  }),
  alerts: [{
    severity: "major", a: side(P.warfarin, warfS), b: side(P.aspirin, aspS), actions: ["synergy"],
    interaction: cut(synergy.interaction!), management: cut(S.workedCheck.management), routeAssumed: false,
    ddinterA: warfS.entries[0].id, ddinterB: aspS.entries[0].id, interactionId: null, source: "DDInter 2.0",
  }],
  noInteraction: [],
  notChecked: [{ a: side(P.domperidone, dompS), b: side(P.warfarin, warfS), reason: "no_data" },
    { a: side(P.domperidone, dompS), b: side(P.aspirin, aspS), reason: "no_data" }],
  duplicates: [],
  noData: [{ conceptId: P.domperidone, bdsId: dompS.bdsId, name: dompS.name }],
  notReviewed: [],
});
const json = (v: unknown) => JSON.stringify(v, null, 2);

/**
 * The "Public / Reviewer access" switch (§6.8). Server-rendered hidden: without JavaScript both panels show, one after
 * the other. The LearnRail island (Task 13a, `wireExampleSwitches`) un-hides it and shows one panel at a time.
 */
function ExampleSwitch({ name, panels }: { name: string; panels: [string, string] }) {
  return (
    <div className="seg" role="group" aria-label="Who is asking" data-switch={name} hidden>
      <button type="button" aria-pressed="true" data-panel={panels[0]}>Public</button>
      <button type="button" aria-pressed="false" data-panel={panels[1]}>Reviewer access</button>
    </div>
  );
}

function Code({ label, value }: { label: string; value: unknown }) {
  return <pre className={styles.codePre} tabIndex={0} role="region" aria-label={label}>{json(value)}</pre>;
}

/** Chapter 8 "For partners" (Board L; §1.6 items 13 and 16, §6.8). */
export default function PartnersChapter({ ctx }: { ctx: LearnContext }) {
  const napaCaption = ctx.apiStub && ctx.pending(P.napa);
  const noneApproved = CHECK_IDS.every((id) => ctx.pending(id));
  return (
    <Chapter slug="partners" level={1}>
      <Section id="api-status" h={H}>
        <Banner tone="info" title="The API runs on the internal network today"
          body="The website calls it privately. Partner API keys, usage metering, OpenAPI docs and monthly releases are planned. The endpoint paths below come from the API controllers; the response bodies shown on this page are illustrative and their field names may change." />
      </Section>

      <Section id="api-endpoints" h={H}>
        <ScrollRegion label="Endpoint table, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblWide} ${styles.ep}`}>
            <caption>All endpoints under /v1, from the API controllers</caption>
            <thead><tr><th scope="col">Method and path</th><th scope="col">What it returns</th><th scope="col">Access</th></tr></thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={`${e.method} ${e.path}`}>
                  <td><span className={styles.method}>{e.method}</span> <span className="mono">{e.path}</span></td>
                  <td>{e.what}</td>
                  <td>{e.access.map((a) => <span key={a} className={styles.acc}>{a}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <dl className={styles.dgRead}>
          <div><dt>Public</dt><dd>The default. Approved records only; anything else is reported as not reviewed.</dd></div>
          <div><dt>All</dt><dd><span className="mono">scope=all</span> with the internal token, used only by integration tests. Reviewers read unreviewed data through <span className="mono">/v1/review/*</span>.</dd></div>
          <div><dt>Reviewer</dt><dd>Batch evidence, including extracted data no pharmacist has checked yet, is readable only by signed-in reviewers. Reviewer emails are never shown on public pages or in public API answers. Readers and the public API see only the id, trade name and review status of an unapproved product.</dd></div>
          <div><dt>Token</dt><dd>Writes need the internal token. A wrong token is refused with 401.</dd></div>
        </dl>
      </Section>

      <Section id="api-envelope" h={H}>
        <div className={styles.env}>
          <Code label="Response envelope" value={ENVELOPE} />
          <dl>
            <div><dt>success</dt><dd>true when the request worked.</dd></div>
            <div><dt>data</dt><dd>The product, substance, check result or list. <span className="mono">null</span> on an error.</dd></div>
            <div><dt>message</dt><dd>"OK", or the error in plain words.</dd></div>
            <div><dt>errors</dt><dd>Empty on success. Otherwise each error has <span className="mono">field</span>, <span className="mono">code</span> and <span className="mono">message</span>.</dd></div>
            <div><dt>metadata</dt><dd>When the response was made and a request id to quote when you report a problem. <ExampleMarker /> values shown.</dd></div>
          </dl>
        </div>
      </Section>

      <Section id="api-product" h={H}>
        <div className={styles.exHead}>
          <p className={styles.req}><span className={styles.method}>GET</span>/v1/products/{P.napa}</p>
          <ExampleSwitch name="prod" panels={["prod-public", "prod-all"]} />
        </div>
        <div id="prod-public">
          <Code label="Public response for Napa" value={PRODUCT_PUBLIC} />
          {napaCaption && <p className={styles.figcap}>Napa is not approved yet, so a public caller gets its id, trade name and status "not_reviewed", with <span className="mono">hidden: true</span>. Show "{NOT_REVIEWED}". Never show "not found".</p>}
        </div>
        <div id="prod-all">
          <SnapshotBlock ctx={ctx} ids={[P.napa]}>
            <Code label="Reviewer response for Napa" value={PRODUCT_REVIEWER} />
            <p className={styles.figcap}>The same product with <span className="mono">scope=all</span>. Field names come from the API's Product record and values from the pilot.</p>
          </SnapshotBlock>
        </div>
        <p className={styles.small}>The <span className="mono">timestamp</span> and <span className="mono">requestId</span> in these examples are <ExampleMarker /> values.</p>
      </Section>

      <Section id="api-check" h={H}>
        <div className={styles.exHead}>
          <p className={styles.req}><span className={styles.method}>POST</span>/v1/interactions/check</p>
          <ExampleSwitch name="chk" panels={["chk-public", "chk-all"]} />
        </div>
        <Code label="Request body" value={CHECK_REQUEST} />
        <div id="chk-public">
          <Code label="Public check response" value={CHECK_PUBLIC} />
          {noneApproved && <p className={styles.figcap}>None of the three is approved, so a public check lists all three in <span className="mono">notReviewed</span> and checks nothing. An empty <span className="mono">alerts</span> here does not mean the medicines are safe together.</p>}
        </div>
        <div id="chk-all">
          <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.aspirin, P.domperidone]}>
            <Code label="Reviewer check response" value={CHECK_REVIEWER} />
            <p className={styles.figcap}>With reviewer access: one Major alert and Domperidone in <span className="mono">noData</span>. The interaction and management strings are cut here for space; the API returns DDInter's full text.</p>
          </SnapshotBlock>
        </div>
      </Section>

      <Section id="api-must" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>These values are why the API exists. A partner screen that hides them can make missing data look like a clean result.</p>
        <ul className={styles.must}>
          <li><code>coverage: "none"</code><br /><code>noData[]</code><div className={styles.show}><NoDataChip label="No interaction data" /><span>Show in full: "{NO_DATA_SENTENCE}" Count its pairs as not checked.</span></div></li>
          <li><code>severity: "unknown"</code><div className={styles.show}><Severity level="unknown" /><span>{LEARN_BOARD.unclassifiedMust}</span></div></li>
          <li><code>hidden: true</code>, <code>status "not_reviewed"</code> or <code>"removed"</code><br /><code>notReviewed[]</code><div className={styles.show}><ReviewStatus status="pending" /><span>Never "not found", never "no data".</span></div></li>
          <li><code>routeAssumed: true</code><div className={styles.show}><span>Say the route was assumed: the product's own route had no DDInter entry, so the systemic entry was used.</span></div></li>
          <li><code>interaction: null</code><br /><code>management: null</code><div className={styles.show}><span>DDInter has no text for this part. Leave it out; never print "None".</span></div></li>
          <li><code>source: "DDInter 2.0"</code><div className={styles.show}><span>Attribute the text. If you shorten it, say "{FULL_TEXT}" and link to it.</span></div></li>
        </ul>
      </Section>

      <Section id="api-versions" h={H}>
        <div className={styles.grid2}>
          <div className={styles.card}>
            <p className={styles.h4}>Now</p>
            <ul className={`${styles.bul} ${styles.small}`}>
              <li>Every path starts with <span className="mono">/v1</span>.</li>
              <li>The database schema is locked at a reviewed version. Changes arrive as new reviewed migrations: a minor version for additions, a major version for anything that alters or removes structure.</li>
              <li>Each response carries a timestamp and request id.</li>
            </ul>
          </div>
          <div className={styles.card}>
            <p className={styles.h4}>Planned</p>
            <ul className={`${styles.bul} ${styles.small}`}>
              <li>A monthly, read-only release of approved records, named by month, such as <span className="mono">2026.11</span>.</li>
              <li>Every response names its release, and each release is diffed against the last. No silent deletions.</li>
              <li>Monthly DGDA and RxNorm refresh, quarterly DDInter re-crawl.</li>
              <li>Planned endpoints: {PLANNED.map((p, i) => <Fragment key={p}>{i > 0 && ", "}<span className="mono">{p}</span></Fragment>)}.</li>
            </ul>
          </div>
        </div>
      </Section>
    </Chapter>
  );
}
```

- [ ] **Step 4: Run it to verify it passes, with the guards**

Run: `cd web && npx vitest run tests/learn-partners.test.tsx tests/copy.test.ts tests/marks.test.ts tests/inline-styles.test.ts`
Expected: PASS (12 tests in `learn-partners.test.tsx`). Also run `npx vitest run tests/learn-snapshot.test.ts` (its `ids` scan now reads `partners.tsx`).

- [ ] **Step 5: Commit**

```bash
git add web/content/learn/partners.tsx web/tests/learn-partners.test.tsx
git commit -m "feat(web): Learn chapter 8 with the endpoint table pinned to the controllers and §7.4-shaped examples (§1.6 item 13)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Chapters 9 and 10 — the glossary with the GlossaryFilter island, and the FAQ

**Files:**
- Create: `web/components/learn/glossary-filter.ts`, `web/components/learn/GlossaryFilter.tsx`, `web/content/learn/glossary.tsx`, `web/content/learn/faq.tsx`
- Test: `web/tests/glossary-filter.test.tsx`, `web/tests/learn-glossary-faq.test.tsx`

**Interfaces:**
- Consumes: as Task 11, plus `announce` (P1A `@/lib/live-region`), `DESK_NEW.deskSettings.undoLabel` (P1B: the glossary term "Undo window" is the same words, held once in `NEW_COPY`), `APPROVED`, `STALE_TITLE` (P1A).
- Produces: `@/components/learn/glossary-filter`: `GLOSSARY_LIST_ID = "gl-list"`, `LEARN_LIVE_ATTR = "data-learn-live"` (the page's one sr-only polite live region, which Task 13b's `LearnShell` renders), `COUNT_DELAY_MS = 350`, `haystack(text)`, `matches(hay, query)`, `countText(shown, total, query)`. `@/components/learn/GlossaryFilter` (island, no props; on the §4.2 allowlist already): a visible count `p[data-gl-count]` (plain text, no `aria-live`) and announcements written to `[data-learn-live]`. `default function GlossaryChapter({ ctx })` in `@/content/learn/glossary`; `default function FaqChapter({ ctx })` in `@/content/learn/faq`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/glossary-filter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlossaryFilter from "@/components/learn/GlossaryFilter";
import { countText, haystack, matches } from "@/components/learn/glossary-filter";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const Fixture = () => (
  <>
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-learn-live="" />
    <div><GlossaryFilter /></div>
    <dl id="gl-list">
      <div data-gl-item=""><dt>Salt</dt><dd><p>The salt form a product is registered as.</p><p>Pilot: Metformin Hydrochloride Salt removed Metformin</p></dd></div>
      <div data-gl-item=""><dt>DAR number</dt><dd><p>The DGDA registration number of a product.</p><p>Pilot: Napa 186-0030-006</p></dd></div>
      <div data-gl-item=""><dt>Drug–food</dt><dd><p>A DDInter record about a substance taken with a food.</p><p>Pilot: Warfarin, 2 records</p></dd></div>
    </dl>
  </>
);
const items = () => [...document.querySelectorAll<HTMLElement>("[data-gl-item]")];
const visible = () => items().filter((i) => !i.hidden).map((i) => i.querySelector("dt")!.textContent);
/** The visible count line (plain text) and the page's one live region (§10.2), read separately. */
const count = () => document.querySelector("[data-gl-count]")!.textContent;
const announced = () => document.querySelector("[data-learn-live]")!.textContent;
const type = (value: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Filter the glossary" }), { target: { value } });
const settle = () => act(() => { vi.advanceTimersByTime(350 + 60); });

describe("glossary filter, pure parts (§6.8)", () => {
  it("treats the query as literal text: case, spaces and metacharacters (Review Focus 3)", () => {
    const hay = haystack("Drug–food  A DDInter record (100%) about a.b food");
    for (const q of ["DRUG–FOOD", "  drug–food  ", "(100%)", "a.b", "record   (100%)"]) expect(matches(hay, q)).toBe(true);
    for (const q of [".*", "a.c", "drug-food", "[", "%%", "\\"]) expect(matches(hay, q)).toBe(false);
    expect(matches(hay, "   ")).toBe(true);
  });

  it("words the count", () => {
    expect(countText(55, 55, "")).toBe("Showing all 55 terms");
    expect(countText(3, 55, "salt")).toBe("Showing 3 of 55 terms");
    expect(countText(55, 55, "  ")).toBe("Showing all 55 terms");
  });
});

describe("GlossaryFilter island (§4.2, §6.8)", () => {
  it("renders nothing on the server, so without JavaScript every term shows and there is no input", () => {
    expect(renderToStaticMarkup(<GlossaryFilter />)).toBe("");
  });

  it("once hydrated: the labelled input, its placeholder and the count; the island adds no live region of its own", () => {
    render(<Fixture />);
    const box = screen.getByRole("searchbox", { name: "Filter the glossary" });
    expect(box.getAttribute("placeholder")).toBe("Filter terms, for example salt or DAR");
    expect(count()).toBe("Showing all 3 terms");
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("matches term, definition and example; the count and the announcement follow 350 ms after typing stops", () => {
    render(<Fixture />);
    type("DAR");
    expect(visible()).toEqual(["DAR number"]);
    act(() => { vi.advanceTimersByTime(300); });
    expect(count()).toBe("Showing all 3 terms");
    expect(announced()).toBe("");
    settle();
    expect(count()).toBe("Showing 1 of 3 terms");
    expect(announced()).toBe("Showing 1 of 3 terms");
    type("hydrochloride");
    expect(visible()).toEqual(["Salt"]);
    type("taken with a food");
    expect(visible()).toEqual(["Drug–food"]);
  });

  it("no match: the empty state; Clear the filter empties the field, shows every term and focuses the input", () => {
    render(<Fixture />);
    type(".*");
    expect(visible()).toEqual([]);
    expect(screen.getByText("No terms match.", { exact: false }).hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Clear the filter" }));
    const box = screen.getByRole("searchbox", { name: "Filter the glossary" }) as HTMLInputElement;
    expect(box.value).toBe("");
    expect(document.activeElement).toBe(box);
    expect(visible()).toHaveLength(3);
    settle();
    expect(count()).toBe("Showing all 3 terms");
  });

  it("Esc clears a filled field", () => {
    render(<Fixture />);
    type("salt");
    expect(visible()).toEqual(["Salt"]);
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Filter the glossary" }), { key: "Escape" });
    expect(visible()).toHaveLength(3);
  });
});
```

Create `web/tests/learn-glossary-faq.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import FaqChapter from "@/content/learn/faq";
import GlossaryChapter from "@/content/learn/glossary";
import { P } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const gl = (stats = pilotStats()) => renderToStaticMarkup(<GlossaryChapter ctx={learnContext(stats)} />);
const faq = (stats = pilotStats()) => renderToStaticMarkup(<FaqChapter ctx={learnContext(stats)} />);
/** One glossary entry's <dd>, by its term. */
const entry = (html: string, term: string) => new RegExp(`<dt>${term}(<small>[^<]*</small>)?</dt><dd>([\\s\\S]*?)</dd>`).exec(html)?.[2] ?? "";

describe("chapter 9, Glossary (§6.8)", () => {
  it("lists Board L's 55 terms for the filter, with no input before JavaScript", () => {
    const html = gl();
    expect(html.match(/data-gl-item=""/g)).toHaveLength(55);
    expect(html).toContain('<dl class="gl" id="gl-list">');
    expect(html).not.toContain("<input");
  });

  it("the §1.6 item 11 counts and corrected lines", () => {
    const html = gl();
    expect(entry(html, "Severity")).toContain("4 Major, 6 Moderate, 2 Minor, 16 not classified");
    expect(entry(html, "Stage check")).toContain("DDInter for 9 of 10 records");
    expect(entry(html, "Route assumed")).toContain('This eye-drop product is checked against <span class="mono">DDInter352</span>, the ophthalmic entry.');
    expect(entry(html, "Route assumed")).not.toContain("DDInter351");
    expect(entry(html, "Undo window")).toContain("The undo window after &quot;Looks correct&quot; (8 seconds by default; 20 or 60 in desk settings) when U cancels it.");
  });

  it("dates the six snapshot-only lines (§6.8)", () => {
    const html = gl();
    for (const term of ["Back in review", "Engineer checked", "Issue reported", "Review decision", "Re-run", "Stage check"])
      expect(entry(html, term)).toContain("as stored on 13/10/2026");
    expect(html.match(/as stored on/g)).toHaveLength(6);
    expect(entry(html, "Re-run")).toContain("1 re-run since the first run, 11/10/2026");
    expect(entry(html, "Review decision")).toContain("0 decisions recorded");
  });

  it("live lines follow /v1/stats", () => {
    expect(entry(gl(), "Approved record")).toContain("none yet, 0 of 10 ");
    expect(entry(gl(), NOT_REVIEWED)).toContain("all 10 records");
    expect(entry(gl(), "DGDA")).toContain("39,196 products in the register");
    expect(entry(gl(), "Batch")).toContain('<span class="mono">0001-pilot</span>, 10 records, in review');
    const two = gl(pilotStats({ approved: [P.napa, P.clarith] }));
    // "2 of 10" is followed by the approved pill, never the batch's "Not yet reviewed" pill (it would read "2 of 10 not yet reviewed").
    expect(entry(two, "Approved record")).toContain('2 of 10 <span class="rv rv--approved">Approved by a pharmacist</span>');
    expect(entry(two, "Approved record")).not.toContain("rv--pending");
    expect(entry(two, NOT_REVIEWED)).toContain("8 of 10 records");
  });

  it("uses the safety constants for the definitions that are safety sentences", () => {
    const html = gl();
    expect(entry(html, "No interaction data")).toContain(`<p>${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain(`<dt>${NOT_REVIEWED}</dt>`);
    expect(html).toContain("<dt>Severity not classified by DDInter</dt>");
    expect(entry(html, "Stale page")).toContain(STALE_TITLE);
  });

  it("withdraws the example of a record with an issue, keeping the term and its definition", () => {
    const html = gl(pilotStats({ withdrawn: [P.clarith] }));
    expect(entry(html, "Clinical drug")).toContain("data-withdrawn");
    expect(entry(html, "Clinical drug")).not.toContain("BDC-000005");
    expect(entry(html, "Clinical drug")).toContain("Substances with strengths, a dose form and a route.");
    expect(entry(html, "Severity")).toContain("data-withdrawn");
    expect(entry(html, "BDS id")).toContain("BDS-000010");
  });
});

describe("chapter 10, FAQ", () => {
  it("is native <details>, the first open, with §1.6 item 14's undo answer and the safety constants", () => {
    const html = faq();
    expect(html.match(/<details/g)).toHaveLength(10);
    expect(html).toContain("<details open=\"\"><summary>Why can&#x27;t I see Napa on the public site?</summary>");
    expect(html).toContain("before the undo window closes (8 seconds unless you lengthened it). Nothing is saved or published until the window closes.");
    expect(html).not.toContain("within 8 seconds");
    expect(html).toContain(`<b>${NO_DATA_SENTENCE}</b>`);
    expect(html).toContain(`<b>${STALE_TITLE}</b>`);
  });

  it("the email answer matches §7.1 A2: history is reviewer-only, no public email (§1.6 item 16)", () => {
    expect(faq()).toContain("No. Reviewer and reporter emails are stored for the team only. Decision history is served only to signed-in reviewers; public pages and the public API never show an email.");
    expect(faq()).not.toContain("Public decision history");
  });

  it("the Napa answer only while no pilot record is approved (Review Focus 5)", () => {
    for (const stats of [pilotStats({ approved: [P.napa] }), pilotStats({ approved: [P.napa, P.aspirin, P.warfarin, P.domperidone] }),
      { ...pilotStats(), batches: [] }]) {
      const html = faq(stats);
      expect(html).not.toContain("Why can&#x27;t I see Napa on the public site?");
      expect(html).not.toContain("Every pilot record is");
      expect(html.match(/<details/g)).toHaveLength(9);
      expect(html).toContain("<details open=\"\"><summary>No alerts came back. Is the combination safe?</summary>");
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/glossary-filter.test.tsx tests/learn-glossary-faq.test.tsx`
Expected: FAIL: `Failed to resolve import "@/components/learn/GlossaryFilter"` and `"@/content/learn/faq"`.

- [ ] **Step 3: Write the filter's pure parts and the island**

Create `web/components/learn/glossary-filter.ts`:

```ts
/** The glossary filter's pure parts (§6.8). Client-safe; the GlossaryFilter island and its tests use them. */

/** The server-rendered list the island filters; each term is a child with `data-gl-item`. */
export const GLOSSARY_LIST_ID = "gl-list";
/** The attribute of the page's one polite, sr-only live region (§10.2), rendered by LearnShell on every Learn page. */
export const LEARN_LIVE_ATTR = "data-learn-live";
/** "updated 350 ms after typing stops" (§6.8). */
export const COUNT_DELAY_MS = 350;

const fold = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** A term's searchable text: its term, definition and pilot example, whitespace collapsed, lower-cased. */
export const haystack = (text: string): string => fold(text);

/** A literal, case-insensitive substring match; an empty or blank query matches everything (Review Focus 3). */
export const matches = (hay: string, query: string): boolean => {
  const q = fold(query);
  return q === "" || hay.includes(q);
};

export const countText = (shown: number, total: number, query: string): string =>
  (fold(query) === "" ? `Showing all ${total} terms` : `Showing ${shown} of ${total} terms`);
```

Create `web/components/learn/GlossaryFilter.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { announce } from "@/lib/live-region";
import { COUNT_DELAY_MS, GLOSSARY_LIST_ID, LEARN_LIVE_ATTR, countText, haystack, matches } from "./glossary-filter";
import styles from "./learn.module.css";

type Item = { el: HTMLElement; hay: string };

/**
 * Island (§4.2 GlossaryFilter): filters the server-rendered glossary in the DOM. Renders nothing until hydrated, so
 * without JavaScript there is no input and every term shows (§6.8). 350 ms after typing stops, the visible count line
 * updates and the same words go to the page's one polite, sr-only live region (§10.2, rendered by LearnShell) through
 * announce() (clear, then write after 60 ms). The visible line is plain text, so it never blanks while announcing.
 */
export default function GlossaryFilter() {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(0);
  const [countLine, setCountLine] = useState("");
  const items = useRef<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAnnounce = useRef<() => void>(() => {});

  useEffect(() => {
    items.current = [...document.querySelectorAll<HTMLElement>(`#${GLOSSARY_LIST_ID} [data-gl-item]`)]
      .map((el) => ({ el, hay: haystack(el.textContent ?? "") }));
    setShown(items.current.length);
    setCountLine(countText(items.current.length, items.current.length, ""));
    setReady(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      cancelAnnounce.current();
    };
  }, []);

  function apply(q: string) {
    let n = 0;
    for (const { el, hay } of items.current) {
      const hit = matches(hay, q);
      el.hidden = !hit;
      if (hit) n += 1;
    }
    setQuery(q);
    setShown(n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const text = countText(n, items.current.length, q);
      setCountLine(text);
      cancelAnnounce.current();
      cancelAnnounce.current = announce(document.querySelector<HTMLElement>(`[${LEARN_LIVE_ATTR}]`), text);
    }, COUNT_DELAY_MS);
  }

  if (!ready) return null;
  return (
    <>
      <label className="search" htmlFor="gl-q">
        <span className="sr-only">Filter the glossary</span>
        <input id="gl-q" ref={input} type="search" placeholder="Filter terms, for example salt or DAR" autoComplete="off"
          spellCheck={false} value={query} onChange={(e) => apply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && query !== "") { e.preventDefault(); apply(""); } }} />
      </label>
      <p className={styles.glCount} data-gl-count="">{countLine}</p>
      <p className={styles.glEmpty} hidden={shown > 0}>
        No terms match. <button type="button" className={buttonClass("plain", "sm")} onClick={() => { apply(""); input.current?.focus(); }}>Clear the filter</button>
      </p>
    </>
  );
}
```

- [ ] **Step 4: Write the two chapters**

The glossary is Board L's 55 terms. Live examples: "Approved record", "Batch", "DGDA", "Not yet reviewed by a pharmacist" (§6.8 "the glossary counts that `/v1/stats` carries"). Snapshot-only, each followed by "as stored on {date}": "Back in review", "Engineer checked", "Issue reported", "Review decision", "Re-run", "Stage check" (§6.8). Corrected: "Severity" and "Stage check" (§1.6 item 11), "Route assumed" (item 3), "Undo window" (item 14, its parenthetical from `LEARN_BOARD.undoWindowDetail`). "Re-run" reads "{k} re-run(s) since the first run" ("none" at 0, Board L's word), and "Approved record" with approvals reads "{a} of {n}" followed by the approved pill, because the batch's pending pill after it would read "{a} of {n} not yet reviewed" (§3.5). Every other example names the pilot records it draws on and is withdrawn with them; the glossary carries the batch's pill once, above the filter. The FAQ answer about pressing "Looks correct" by mistake is item 14's (its parenthetical from `LEARN_BOARD.undoWindowFaq`); the email answer is item 16's; the Napa answer renders only while no pilot record is approved (§6.8 "Approval-state sentences"). The FAQ's Napa and Domperidone answers about names and coverage stay outside any snapshot block: like chapter 7's checklist examples, they are Board L's generic examples (self-review notes).

Create `web/content/learn/glossary.tsx`:

```tsx
import type { ReactNode } from "react";
import type { LearnContext } from "@/components/learn/context";
import GlossaryFilter from "@/components/learn/GlossaryFilter";
import { GLOSSARY_LIST_ID } from "@/components/learn/glossary-filter";
import styles from "@/components/learn/learn.module.css";
import { AsStored, BatchNote, Chapter, LivePill, Section, St } from "@/components/learn/parts";
import BotCheck from "@/components/ui/BotCheck";
import CodeChip from "@/components/ui/CodeChip";
import Kbd from "@/components/ui/Kbd";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { APPROVED, DESK_NEW, LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE, SEVERITY_NOT_CLASSIFIED, STALE_TITLE } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { BATCH_STATUS_WORD, batchPill, formatCount } from "@/lib/stats";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S, severityCounts, substanceNamed, type PilotId } from "./pilot-snapshot";

/**
 * One glossary entry (Board L). `ids` names the pilot records the example draws on: when /v1/stats does not report one
 * of them as usable, the example shows the §6.4 stub (trade name and live pill) instead (§6.8). Examples without `ids`
 * are live counts, snapshot-only values (followed by "as stored on"), or not about a record.
 */
type Term = { term: string; small?: string; def: ReactNode; label?: "Pilot" | "Shown as" | "Keys"; ex: ReactNode; ids?: readonly PilotId[] };

function terms(ctx: LearnContext): Term[] {
  const n = ctx.batch?.itemCount ?? 0, a = ctx.batch?.approved ?? 0;
  const c = severityCounts();
  const asp = substanceNamed("Acetylsalicylic acid"), warf = substanceNamed("Warfarin"), amox = substanceNamed("Amoxicillin");
  const clar = substanceNamed("Clarithromycin"), metf = substanceNamed("Metformin"), amlo = substanceNamed("Amlodipine");
  const domp = substanceNamed("Domperidone"), simva = substanceNamed("Simvastatin"), chlor = substanceNamed("Chloramphenicol");
  const amoxRec = S.records[P.amoxiclav], clarRec = S.records[P.clarith], chlorRec = S.records[P.chloramphenicol];
  const full = S.substances.filter((s) => s.coverage === "full").length;
  const none = (k: number) => (k === 0 ? "none so far" : String(k));
  return [
    { term: "Action", def: "DDInter's label for how two drugs interact, such as synergy or metabolism.", ex: <>Simvastatin + Clarithromycin, metabolism</>, ids: [P.simvastatin, P.clarith] },
    // With a > 0 the pill is "Approved by a pharmacist": the batch's pending pill after "2 of 10" would read "2 of 10 not yet reviewed".
    { term: "Approved record", small: APPROVED, def: <>A record a pharmacist marked "Looks correct" after its latest extraction, with no issue since. Only these are public.</>,
      ex: <>{a === 0 ? "none yet, " : ""}{a} of {n} <ReviewStatus status={a === 0 ? batchPill(ctx.batch) : "approved"} /></> },
    { term: "ATC", small: "Anatomical Therapeutic Chemical", def: "WHO's classification of drugs by organ system and therapeutic use. One substance can have several codes.",
      ex: <>{asp.name} {asp.codes.atc.map((x) => <CodeChip key={x} system="ATC" code={x} />)}</>, ids: [P.aspirin] },
    { term: "BAN", small: "British Approved Name", def: "The UK's official name for a substance. Often the same as the INN.", ex: <>Paracetamol, the name DGDA uses for Napa's ingredient</>, ids: [P.napa] },
    { term: "Back in review", def: "An approved record that was re-run, or whose shared substance data changed. It leaves public view until a pharmacist approves it again.",
      ex: <><ReviewStatus status="back_in_review" /> {none(S.review.backInReview)}<AsStored /></> },
    { term: "Batch", def: "A committed list of DGDA concept ids that the pipeline runs and people review together.",
      ex: <><span className="mono">{S.batchId}</span>, {n} records, {ctx.batch ? BATCH_STATUS_WORD[ctx.batch.status] : BATCH_STATUS_WORD.in_review}</> },
    { term: "Batch size rule", def: "Batches start at 10 and grow to 50, then 100, after two batches in a row with at most 1 issue each and no systemic bug. More than 5% issues, or any systemic bug, drops back to 10.", ex: <>at 10</> },
    { term: "BDC id", def: "Our permanent id for a clinical drug. Never reused.", ex: <><span className="mono">{amoxRec.bdcId}</span> {amoxRec.clinicalDrug}</>, ids: [P.amoxiclav] },
    { term: "BDS id", def: "Our permanent id for a substance, one per ICD-11 XM code. Never reused.", ex: <><span className="mono">{domp.bdsId}</span> {domp.name}</>, ids: [P.domperidone] },
    { term: "Brand product", def: "One DGDA-registered product: a trade name from one company in one dosage form.", ex: <>{clarRec.tradeName}, {clarRec.company}, {clarRec.dosageForm}</>, ids: [P.clarith] },
    { term: "Clinical drug", def: "Substances with strengths, a dose form and a route. Brands with the same signature share one.", ex: <><span className="mono">{clarRec.bdcId}</span> {clarRec.clinicalDrug}</>, ids: [P.clarith] },
    { term: "Concept id", def: "The OCL server's id for a DGDA product: the DAR number and the trade name.", ex: <span className="mono">{P.clarith}</span>, ids: [P.clarith] },
    { term: "Confidence", def: "How sure a code match is, from 0 to 1. Lower scores go to review.", ex: <>every code matched at 1.00</>, ids: PILOT_IDS },
    { term: "Coverage", def: "Whether DDInter has data for a substance: full or none. Stored, never inferred.", ex: <>{full} substances full, {domp.name} none</>, ids: PILOT_IDS },
    { term: "Crosswalk code", def: "An outside code linked to our substance, with the method that found it and a confidence.",
      ex: <><span className="code"><span className="code-sys">RxCUI</span>{amox.codes.rxcui}<span className="code-meta">rxnav-exact, 1.00</span></span> {amox.name}</>, ids: [P.amoxiclav] },
    { term: "DAR number", def: "The DGDA registration number of a product.", ex: <>Napa <span className="mono">{S.records[P.napa].darNumber}</span></>, ids: [P.napa] },
    { term: "DDInter", small: "DDInter 2.0", def: "The drug interaction database we take drug–drug, drug–disease and drug–food data from.",
      ex: <><CodeChip system="DDINTER" code={warf.entries[0].id} /> {warf.name}</>, ids: [P.warfarin] },
    { term: "DGDA", def: "Directorate General of Drug Administration, Bangladesh's drug regulator. Its register is our source for every brand.",
      ex: <>{formatCount(ctx.stats.registerProducts)} products in the register</> },
    { term: "Dose form", def: "The physical form of a product.", ex: <>Tablet; {chlorRec.dosageForm} for {chlorRec.tradeName}</>, ids: [P.chloramphenicol] },
    { term: "DrugBank", def: "A drug database whose accession numbers we use to confirm DDInter matches.", ex: <><CodeChip system="DRUGBANK" code={warf.codes.drugbank} /> {warf.name}</>, ids: [P.warfarin] },
    { term: "Drug–disease", def: "A DDInter record warning about a substance in a patient with a condition.", ex: <>{asp.name}, {asp.disease} records</>, ids: [P.aspirin] },
    { term: "Drug–food", def: "A DDInter record about a substance taken with a food.", ex: <>{warf.name}, {warf.food} records</>, ids: [P.warfarin] },
    { term: "Engineer checked", def: "An engineer marked the extraction correct. Recorded, but it does not publish.",
      ex: <><ReviewStatus status="engineer_checked" /> {none(S.review.engineerChecked)}<AsStored /></> },
    { term: "Evidence snapshot", def: "A source response stored exactly as it arrived, so every value can be traced back.",
      ex: <>{S.evidence.oclConcept} DGDA records, plus every RxNav and DDInter response</> },
    { term: "ICD-11 XM", def: "WHO ICD-11 medicament codes. DGDA maps each ingredient to one.", ex: <><CodeChip system="ICD11_XM" code={clar.codes.icd11} /> {clar.name}</>, ids: [P.clarith] },
    { term: "INN", small: "International Nonproprietary Name", def: "WHO's official generic name for a substance.", ex: <>Paracetamol is the INN; DDInter uses the USAN Acetaminophen</>, ids: [P.napa] },
    { term: "Interaction pair", def: "Two substances DDInter records together, stored once with its severity, actions and text.",
      ex: <>{warf.name} + {asp.name} <Severity level="major" /></>, ids: [P.warfarin, P.aspirin] },
    { term: "Issue reported", def: "A reviewer flagged a problem with a note. The record stays hidden until it is fixed and re-run.",
      ex: <><ReviewStatus status="issue" /> {none(S.review.issueReported)}<AsStored /></> },
    { term: "Major", def: "DDInter's most serious severity grade.", ex: <><Severity level="major" /> {simva.name} + {clar.name}</>, ids: [P.simvastatin, P.clarith] },
    { term: "Management text", def: "DDInter's advice for a pair. Shown truncated with a link to the full text, never rewritten.", ex: <>{simva.name} + {warf.name} has none in DDInter</>, ids: [P.simvastatin, P.warfarin] },
    { term: "Match method", def: "How a code was found: xm from DGDA, rxnav-exact from RxNav, drugbank for DDInter.",
      ex: <><span className="mono">drugbank</span> for <span className="mono">{amox.entries[0].id}</span> {amox.name}</>, ids: [P.amoxiclav] },
    { term: "Minor", def: "DDInter's lowest severity grade.", ex: <><Severity level="minor" /> {clar.name} + {amox.name}</>, ids: [P.clarith, P.amoxiclav] },
    { term: "Moderate", def: "DDInter's middle severity grade.", ex: <><Severity level="moderate" /> {metf.name} + {warf.name}</>, ids: [P.metformin, P.warfarin] },
    { term: "No interaction data", def: NO_DATA_SENTENCE, ex: <><NoDataChip label="No interaction data" /> {domp.name}</>, ids: [P.domperidone] },
    { term: "Not checked", def: "A pair involving a substance with no DDInter data. Never counted as checked.", ex: <>{domp.name} + {metf.name}</>, ids: [P.domperidone, P.metformin] },
    { term: NOT_REVIEWED, def: "A record no pharmacist has approved. Hidden from public pages and from public API answers.",
      ex: <>{a === 0 ? `all ${n} records` : `${n - a} of ${n} records`}</> },
    { term: "OCL", small: "Open Concept Lab", def: "The terminology server the pipeline reads the DGDA register from.", ex: <>each record's raw DGDA JSON comes from it</> },
    { term: "Re-run", def: "Running the pipeline again for a record. Its earlier approvals stop counting.",
      ex: <>{S.review.reruns === 0 ? "none" : `${S.review.reruns} ${S.review.reruns === 1 ? "re-run" : "re-runs"}`} since the first run, {fmtUtc(S.runAt).slice(0, 10)}<AsStored /></> },
    { term: "Review decision", def: "An OK or an issue, with a note, the reviewer's role and the time. Only ever added, never edited.",
      ex: <>{S.review.decisions} decisions recorded<AsStored /></> },
    { term: "Route", def: "How a product enters the body: systemic, ophthalmic, otic, nasal or topical. Worked out from the dosage form.",
      ex: <>{chlorRec.dosageForm} gives {chlorRec.route}</>, ids: [P.chloramphenicol] },
    { term: "Route assumed", def: "The product's route had no DDInter entry, so the systemic one was used. The alert says so.",
      ex: <>This eye-drop product is checked against <span className="mono">DDInter352</span>, the ophthalmic entry. When a product's route has no DDInter entry, the systemic entry is used and marked "route assumed".</>,
      ids: [P.chloramphenicol] },
    { term: "Route scope", def: "The route a DDInter entry covers.",
      ex: <>{chlor.entries.filter((e) => e.route !== "systemic").map((e, i) => <span key={e.id}>{i > 0 && ", "}<span className="mono">{e.id}</span> {e.route}</span>)}</>, ids: [P.chloramphenicol] },
    { term: "RxNorm and RxCUI", def: "NLM's drug vocabulary and its concept id.", ex: <><CodeChip system="RXCUI" code={metf.codes.rxcui} /> {metf.name}</>, ids: [P.metformin] },
    { term: "Salt", def: "The salt form a product is registered as. We remove it to reach the substance.",
      ex: <>Metformin Hydrochloride <MatchRelation kind="salt" /> {metf.name}</>, ids: [P.metformin] },
    { term: "Severity", def: "DDInter's grade for a pair: Major, Moderate, Minor, or not classified.",
      ex: <>{c.major} Major, {c.moderate} Moderate, {c.minor} Minor, {c.unknown} not classified</>, ids: PILOT_IDS },
    { term: SEVERITY_NOT_CLASSIFIED, def: LEARN_BOARD.unclassifiedGlossary, ex: <><Severity level="unknown" /> Acetaminophen + {amlo.name}</>, ids: [P.napa, P.amlodipine] },
    { term: "Signature", def: "The key that makes a clinical drug unique: dose form, route and sorted strengths.", ex: <span className="mono">{chlorRec.signature}</span>, ids: [P.chloramphenicol] },
    { term: "SNOMED CT", def: "A clinical terminology many EMRs code in.", ex: <><CodeChip system="SNOMEDCT" code={amlo.codes.snomed[0]} /> {amlo.name}</>, ids: [P.amlodipine] },
    { term: "Stage check", def: "One of four pipeline steps, each reporting OK, Warning or Failed with a note.",
      ex: <><St status="warn" /> DDInter for {S.stages.ddinter.warn} of {PILOT_IDS.length} records<AsStored /></> },
    { term: "Stale page", def: "A review page whose record changed after it loaded. Decisions pause until you reload.", label: "Shown as", ex: STALE_TITLE },
    { term: "Strength", def: "The amount of a substance per unit, sometimes per volume.", ex: <>5 mg per 1 ml, {chlorRec.tradeName} eye drops</>, ids: [P.chloramphenicol] },
    { term: "Substance", def: "One active ingredient, with its names and codes. Interactions attach here.", ex: <><span className="mono">{simva.bdsId}</span> {simva.name}</>, ids: [P.simvastatin] },
    { term: "Turnstile", def: "Cloudflare's bot check, run on every review decision and problem report.", label: "Shown as", ex: <BotCheck state="passed" /> },
    // The desk settings sheet names it the same way; NEW_COPY holds the words once (copy.test.ts).
    { term: DESK_NEW.deskSettings.undoLabel, def: <>The undo window after "Looks correct" {LEARN_BOARD.undoWindowDetail} when U cancels it. Nothing is saved until it closes.</>,
      label: "Keys", ex: <><Kbd keys="A" /> then <Kbd keys="U" /></> },
    { term: "USAN", small: "United States Adopted Name", def: "The US official name for a substance. DDInter and RxNorm use it.", ex: <>Acetaminophen, for Paracetamol</>, ids: [P.napa] },
  ];
}

/** Chapter 9 "Glossary" (Board L; §1.6 items 3, 11 and 14; §6.8 snapshot-only lines). */
export default function GlossaryChapter({ ctx }: { ctx: LearnContext }) {
  return (
    <Chapter slug="glossary" level={1}>
      <Section id="gl-terms" h={2}>
        <p className={styles.snapPills}><BatchNote ctx={ctx} /></p>
        <div className={styles.glTools}><GlossaryFilter /></div>
        <dl className={styles.gl} id={GLOSSARY_LIST_ID}>
          {terms(ctx).map((t) => {
            const label = t.label ?? "Pilot";
            const withdrawn = t.ids !== undefined && !t.ids.every((id) => ctx.usable(id));
            return (
              <div className={styles.glItem} key={t.term} data-gl-item="">
                <dt>{t.term}{t.small && <small>{t.small}</small>}</dt>
                <dd>
                  <p>{t.def}</p>
                  {withdrawn
                    ? <p className={styles.glEx} data-withdrawn=""><b>{label}:</b> {t.ids!.map((id) => <span key={id} className={styles.row}><b>{ctx.tradeName(id)}</b><LivePill ctx={ctx} id={id} /></span>)}</p>
                    : <p className={styles.glEx}><b>{label}:</b> {t.ex}</p>}
                </dd>
              </div>
            );
          })}
        </dl>
      </Section>
    </Chapter>
  );
}
```

Create `web/content/learn/faq.tsx`:

```tsx
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, Section } from "@/components/learn/parts";
import Kbd from "@/components/ui/Kbd";
import { LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";

/**
 * Chapter 10 "FAQ" (Board L; §1.6 items 14 and 16). Native <details> (§6.8). The Napa answer says no pilot record is
 * approved, so it renders only while the pilot batch reports none (§6.8 "Approval-state sentences"); the first
 * question shown is the open one.
 */
export default function FaqChapter({ ctx }: { ctx: LearnContext }) {
  const napaQuestion = ctx.batch !== null && ctx.batch.approved === 0;
  return (
    <Chapter slug="faq" level={1}>
      <Section id="faq-list" h={2}>
        <div className={styles.faq}>
          {napaQuestion && <details open><summary>Why can't I see Napa on the public site?</summary><div className={styles.answer}><p>No pharmacist has approved it yet. Every pilot record is <b>{NOT_REVIEWED}</b>, so public pages and the public API show the name and that status, and nothing else.</p></div></details>}
          <details open={!napaQuestion}><summary>No alerts came back. Is the combination safe?</summary><div className={styles.answer}><p>Not necessarily. No alert means DDInter 2.0 records no interaction for those pairs. Check that no product is listed under not reviewed and no substance under no data; those pairs were not checked at all.</p></div></details>
          <details><summary>Why does Domperidone show no interaction data?</summary><div className={styles.answer}><p>Domperidone has no DDInter 2.0 entry (coverage: none). We show: <b>{NO_DATA_SENTENCE}</b></p></div></details>
          <details><summary>Why does Napa say Acetaminophen, not Paracetamol?</summary><div className={styles.answer}><p>DGDA's ICD-11 mapping and DDInter both name the substance Acetaminophen. Paracetamol is kept as a synonym, so searching either name finds Napa.</p></div></details>
          <details><summary>Can an engineer publish a record?</summary><div className={styles.answer}><p>No. An engineer's "Looks correct" is recorded as <b>Engineer checked</b> and the record stays hidden. Only a pharmacist's approval publishes.</p></div></details>
          <details><summary>What if the record changes while I am reviewing it?</summary><div className={styles.answer}><p>The page shows <b>{STALE_TITLE}</b> and pauses decisions. A decision sent from the old page is refused, so you never approve data you did not see.</p></div></details>
          <details><summary>I pressed "Looks correct" by mistake.</summary><div className={styles.answer}><p>Press <Kbd keys="U" /> or Undo before the undo window closes {LEARN_BOARD.undoWindowFaq}. Nothing is saved or published until the window closes.</p></div></details>
          <details><summary>How do I become a reviewer?</summary><div className={styles.answer}><p>Anyone can read approved records without signing in, and anyone can sign in with Google to report a problem. Reviewer roles are by invitation from the IntelliDrugs team.</p></div></details>
          <details><summary>Is my email shown to anyone?</summary><div className={styles.answer}><p>No. Reviewer and reporter emails are stored for the team only. Decision history is served only to signed-in reviewers; public pages and the public API never show an email.</p></div></details>
          <details><summary>Can my company use the API today?</summary><div className={styles.answer}><p>Not yet directly. The API runs behind the website for now. Partner keys, metering and monthly releases are planned.</p></div></details>
        </div>
      </Section>
    </Chapter>
  );
}
```

- [ ] **Step 5: Run them to verify they pass, with the guards and the island check**

Run: `cd web && npx vitest run tests/glossary-filter.test.tsx tests/learn-glossary-faq.test.tsx tests/copy.test.ts tests/marks.test.ts tests/client-islands.test.ts`
Expected: PASS (7 tests in `glossary-filter.test.tsx`, 9 in `learn-glossary-faq.test.tsx`; `client-islands.test.ts` "the real tree passes" with `components/learn/GlossaryFilter.tsx` on the allowlist, importing no server-only module, and no `"use client"` under `content/`). Also run `npx vitest run tests/learn-snapshot.test.ts` (its `ids` scan now reads `glossary.tsx`).

- [ ] **Step 6: Commit**

```bash
git add web/components/learn/glossary-filter.ts web/components/learn/GlossaryFilter.tsx web/content/learn/glossary.tsx \
  web/content/learn/faq.tsx web/tests/glossary-filter.test.tsx web/tests/learn-glossary-faq.test.tsx
git commit -m "feat(web): Learn glossary with the GlossaryFilter island, and the FAQ (§6.8, §1.6 items 3, 11, 14)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13a: The LearnRail island and its enhancements

**Files:**
- Create: `web/components/learn/enhance.ts`, `web/components/learn/LearnRail.tsx`
- Test: `web/tests/learn-enhance.test.tsx`

**Interfaces:**
- Consumes: the DOM contract Task 11 (`data-switch`, `button[data-panel]`) and Task 13b (`data-learn-nav`, `data-learn-rail`) render.
- Produces: the island `LearnRail` (no props, renders nothing) and `@/components/learn/enhance`: `revealCurrentChapter(doc)`, `wireExampleSwitches(doc): () => void`, `startScrollSpy(doc, win): () => void`, `enhanceLearn(doc, win): () => void`. The island does what the §4.2 LearnRail row says as amended by Task 0: the scroll-spy, the narrow nav's scroll-into-view, and chapter 8's example switches.

- [ ] **Step 1: Write the failing test**

Create `web/tests/learn-enhance.test.tsx` (`.tsx`, because it renders `<LearnRail />`):

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LearnRail from "@/components/learn/LearnRail";
import { revealCurrentChapter, startScrollSpy, wireExampleSwitches } from "@/components/learn/enhance";

afterEach(() => { cleanup(); document.body.innerHTML = ""; });

const SWITCH = `
  <div class="seg" role="group" aria-label="Who is asking" data-switch="prod" hidden>
    <button type="button" aria-pressed="true" data-panel="prod-public">Public</button>
    <button type="button" aria-pressed="false" data-panel="prod-all">Reviewer access</button>
  </div>
  <div id="prod-public">public body</div><div id="prod-all">reviewer body</div>`;

/** A window the scroll-spy can drive: a fixed height, recorded listeners and a synchronous animation frame. */
function fakeWindow(innerHeight = 800) {
  const listeners = new Map<string, () => void>();
  return {
    innerHeight,
    addEventListener: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => { cb(0); return 0; }),
    fire: (type: string) => listeners.get(type)?.(),
    listeners,
  };
}

describe("example switches (§6.8 chapter 8)", () => {
  it("shows one panel at a time once enhanced, following aria-pressed", () => {
    document.body.innerHTML = SWITCH;
    const off = wireExampleSwitches(document);
    const group = document.querySelector<HTMLElement>("[data-switch]")!;
    const [pub, all] = [document.getElementById("prod-public")!, document.getElementById("prod-all")!];
    expect(group.hidden).toBe(false);
    expect([pub.hidden, all.hidden]).toEqual([false, true]);
    document.querySelector<HTMLButtonElement>('[data-panel="prod-all"]')!.click();
    expect([pub.hidden, all.hidden]).toEqual([true, false]);
    expect(document.querySelector('[data-panel="prod-all"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-panel="prod-public"]')!.getAttribute("aria-pressed")).toBe("false");
    off();
    document.querySelector<HTMLButtonElement>('[data-panel="prod-public"]')!.click();
    expect(pub.hidden).toBe(true);
  });
});

describe("the narrow chapter row (§6.8)", () => {
  it("scrolls the current chapter's link into view when the row overflows, and leaves a row that fits alone", () => {
    document.body.innerHTML = '<nav data-learn-nav><ol><li><a href="/learn/start">1</a></li><li><a href="/learn/faq" aria-current="page">10</a></li></ol></nav>';
    const nav = document.querySelector<HTMLElement>("[data-learn-nav]")!;
    const current = document.querySelector<HTMLElement>('[aria-current="page"]')!;
    Object.defineProperty(current, "offsetLeft", { value: 900 });
    Object.defineProperty(nav, "clientWidth", { value: 320 });
    Object.defineProperty(nav, "scrollWidth", { value: 1100, configurable: true });
    revealCurrentChapter(document);
    expect(nav.scrollLeft).toBe(884);
    nav.scrollLeft = 0;
    Object.defineProperty(nav, "scrollWidth", { value: 322 });
    revealCurrentChapter(document);
    expect(nav.scrollLeft).toBe(0);
  });
});

describe("'On this page' scroll-spy (§4.2 LearnRail)", () => {
  it("marks the last section whose top passed the line, and only that one", () => {
    document.body.innerHTML = `
      <aside data-learn-rail><ol><li><a href="#a" aria-current="true">A</a></li><li><a href="#b">B</a></li><li><a href="#c">C</a></li></ol></aside>
      <div id="a"></div><div id="b"></div><div id="c"></div>`;
    const tops: Record<string, number> = { a: -500, b: 100, c: 900 };
    for (const id of ["a", "b", "c"]) document.getElementById(id)!.getBoundingClientRect = () => ({ top: tops[id] } as DOMRect);
    const win = fakeWindow(800);   // the line is max(160, 240) = 240
    const off = startScrollSpy(document, win as unknown as Window);
    const current = () => [...document.querySelectorAll("[data-learn-rail] a")].filter((a) => a.getAttribute("aria-current") === "true").map((a) => a.textContent);
    expect(current()).toEqual(["B"]);
    tops.b = 400; tops.c = 200;
    win.fire("scroll");
    expect(current()).toEqual(["C"]);
    tops.a = 500; tops.b = 600; tops.c = 700;
    win.fire("scroll");
    expect(current()).toEqual(["A"]);
    off();
    expect(win.listeners.size).toBe(0);
  });
});

describe("LearnRail island", () => {
  it("runs the enhancements after hydration and renders nothing", () => {
    document.body.innerHTML = SWITCH;
    const { container } = render(<LearnRail />);
    expect(container.innerHTML).toBe("");
    expect(document.querySelector<HTMLElement>("[data-switch]")!.hidden).toBe(false);
    expect(document.getElementById("prod-all")!.hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/learn-enhance.test.tsx`
Expected: FAIL: `Failed to resolve import "@/components/learn/LearnRail"` (and `"@/components/learn/enhance"`).

- [ ] **Step 3: Write the enhancements and the LearnRail island**

Create `web/components/learn/enhance.ts`:

```ts
/**
 * What the LearnRail island does once the page has hydrated (§4.2, §6.8). Plain DOM, no React, so it is tested without
 * a page. Everything here enhances server-rendered HTML that already works without JavaScript.
 */

type Win = Pick<Window, "innerHeight" | "addEventListener" | "removeEventListener" | "requestAnimationFrame">;

/** Below 860 px the chapter nav is a horizontal row: scroll the current chapter's link into view (§6.8). */
export function revealCurrentChapter(doc: Document): void {
  const nav = doc.querySelector<HTMLElement>("[data-learn-nav]");
  const current = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
  if (!nav || !current || nav.scrollWidth <= nav.clientWidth + 4) return;
  nav.scrollLeft = Math.max(0, current.offsetLeft - 16);
}

/**
 * Chapter 8's "Public / Reviewer access" switches (§6.8): un-hide each `[data-switch]` group and show one panel at a
 * time, following `aria-pressed`. Without JavaScript the group stays hidden and both panels show. Returns a cleanup.
 */
export function wireExampleSwitches(doc: Document): () => void {
  const offs: (() => void)[] = [];
  for (const group of doc.querySelectorAll<HTMLElement>("[data-switch]")) {
    const buttons = [...group.querySelectorAll<HTMLButtonElement>("button[data-panel]")];
    const show = (panelId: string) => {
      for (const b of buttons) {
        const id = b.dataset.panel!;
        b.setAttribute("aria-pressed", String(id === panelId));
        const panel = doc.getElementById(id);
        if (panel) panel.hidden = id !== panelId;
      }
    };
    for (const b of buttons) {
      const onClick = () => show(b.dataset.panel!);
      b.addEventListener("click", onClick);
      offs.push(() => b.removeEventListener("click", onClick));
    }
    const pressed = buttons.find((b) => b.getAttribute("aria-pressed") === "true") ?? buttons[0];
    if (pressed) show(pressed.dataset.panel!);
    group.hidden = false;
  }
  return () => offs.forEach((off) => off());
}

/**
 * "On this page" scroll-spy (§4.2): the rail link of the last section whose top has passed a line 30% down the
 * viewport (at least 160 px) gets `aria-current="true"`. Returns a cleanup.
 */
export function startScrollSpy(doc: Document, win: Win): () => void {
  const links = [...doc.querySelectorAll<HTMLAnchorElement>('[data-learn-rail] a[href^="#"]')];
  const targets = links.map((a) => doc.getElementById(decodeURIComponent(a.getAttribute("href")!.slice(1))));
  const update = () => {
    const line = Math.max(160, Math.round(win.innerHeight * 0.3));
    let current = 0;
    targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top - line <= 0) current = i; });
    links.forEach((a, i) => (i === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    win.requestAnimationFrame(() => { ticking = false; update(); });
  };
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("resize", update);
  update();
  return () => {
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("resize", update);
  };
}

export function enhanceLearn(doc: Document, win: Win): () => void {
  revealCurrentChapter(doc);
  const offSwitches = wireExampleSwitches(doc);
  const offSpy = startScrollSpy(doc, win);
  return () => { offSwitches(); offSpy(); };
}
```

Create `web/components/learn/LearnRail.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { enhanceLearn } from "./enhance";

/**
 * Island (§4.2 LearnRail, the row as amended by P3 Task 0): the "On this page" scroll-spy, plus the two other Learn
 * enhancements §6.8 asks for that need JavaScript: the narrow chapter row scrolled to the current chapter, and chapter 8's
 * `.seg` example switches. Renders nothing.
 */
export default function LearnRail() {
  useEffect(() => enhanceLearn(document, window), []);
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes, with the island check**

Run: `cd web && npx vitest run tests/learn-enhance.test.tsx tests/client-islands.test.ts`
Expected: PASS (4 tests in `learn-enhance.test.tsx`; `components/learn/LearnRail.tsx` is on the allowlist and imports no server-only module).

- [ ] **Step 5: Commit**

```bash
git add web/components/learn/enhance.ts web/components/learn/LearnRail.tsx web/tests/learn-enhance.test.tsx
git commit -m "feat(web): LearnRail island: scroll-spy, narrow chapter row and chapter 8 example switches (§4.2, §6.8)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13b: The Learn shell, the routes, the root layout and the header link

**Files:**
- Create: `web/components/learn/LearnShell.tsx`, `web/components/learn/LearnShell.module.css`, `web/content/learn/index.ts`, `web/app/learn/page.tsx`, `web/app/learn/[chapter]/page.tsx`
- Modify: `web/lib/surface.ts`, `web/app/layout.tsx`, `web/components/Header.tsx`, `web/tests/surface.test.ts`, `web/tests/header.test.tsx`, `web/tests/marks.test.ts`
- Test: `web/tests/learn-shell.test.tsx`, `web/tests/learn-page.test.tsx`, `web/tests/learn-links.test.tsx`

**Interfaces:**
- Consumes: every chapter (Tasks 6–12); `learnContext`, `BatchNote`, `learn.module.css` (Task 5); `CHAPTERS`, `CHAPTER_SLUGS`, `chapterBySlug` (Task 5); `getStats` (Task 2); `LEARN_FAIL` (Task 3); `LEARN_LIVE_ATTR` (Task 12); `LearnRail` (Task 13a); `ThemeSwitch`, `BrandIcon`, `Wordmark` (size 17, `sub="Learn"`), `ExampleMarker`, `Banner`, `buttonClass` (P1A); `PRODUCTION_HOST` (`@/lib/site`), `THEME_COOKIE`, `parseTheme` (P1A); `x-pathname` request header (P1B, `lib/security-headers.ts`).
- Produces: `CHAPTER_BODIES: Record<ChapterSlug, ComponentType<{ ctx: LearnContext }>>` (`@/content/learn`); `LearnShell({ slug, ctx, theme, children })` with `ctx: LearnContext | null` (null: no nav note and no rail, for the §6.8 "Stats unavailable" page); routes `GET /learn` (307 to `/learn/start`) and `GET /learn/[chapter]` (exact slugs only, else 404; a failed `getStats()` renders the shell with Task 0's banner and no chapter); `isLearnSurface(pathname): boolean` in `@/lib/surface`; the root layout adds no chrome on Learn chapter paths; the header gains `<a href="/learn">Learn</a>`. DOM contract for Task 13a: the nav carries `data-learn-nav`, the rail `data-learn-rail` (no server-side `aria-current`: the scroll-spy sets it on mount, so without JavaScript no section is wrongly marked current); every Learn page has exactly one `[data-learn-live]` sr-only polite region (§10.2).

- [ ] **Step 1: Write the failing tests**

Create `web/tests/learn-shell.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));

import { learnContext } from "@/components/learn/context";
import LearnShell from "@/components/learn/LearnShell";
import { P, PILOT_IDS } from "@/content/learn/pilot-snapshot";
import { pilotStats } from "./fixtures/learn-stats";

const render = (slug: "process" | "faq" = "process", stats = pilotStats()) =>
  renderToStaticMarkup(<LearnShell slug={slug} ctx={learnContext(stats)} theme="dark"><p>chapter body</p></LearnShell>);

describe("Learn shell (Board L, §6.8)", () => {
  it("skip link, then the material toolbar: lockup to /learn/start named IntelliDrugs Learn, the site label, the theme control", () => {
    const html = render();
    expect(html.indexOf('<a class="skip" href="#main">Skip to content</a>')).toBeLessThan(html.indexOf("<header"));
    expect(html).toContain('<header class="material chrome-toolbar bar">');
    expect(html).toContain('<a class="brand" href="/learn/start" aria-label="IntelliDrugs Learn">');
    expect(html).not.toContain("back to top");
    expect(html).toContain('<span class="site">drugdb.eliooo.org</span>');
    expect(html).toMatch(/aria-label="Colour theme"[\s\S]*?aria-pressed="true"[^>]*>Dark</);
  });

  it("the chapter nav: ten numbered links, only the current one with aria-current=page", () => {
    const html = render("faq");
    expect(html).toContain('<nav class="material chrome-sidebar nav" aria-label="Chapters" data-learn-nav="">');
    expect(html.match(/<a class="nl" href="\/learn\/[a-z]+"/g)).toHaveLength(10);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('<a class="nl" href="/learn/faq" aria-current="page"><span class="n">10</span><span>FAQ</span></a>');
    expect(html).toContain('<span class="n">3</span><span>IDs and code systems</span>');
  });

  it("the nav note is live: the batch pill and its record count", () => {
    expect(render()).toContain('<div class="navNote"><span class="rv rv--pending">Not yet reviewed by a pharmacist</span><span>All 10 pilot records, batch <span class="mono">0001-pilot</span>.</span></div>');
    expect(render("process", pilotStats({ approved: [...PILOT_IDS] }))).toContain('<div class="navNote"><span class="rv rv--approved">');
    expect(render("process", pilotStats({ missing: [P.napa] }))).toContain("All 9 pilot records");
    expect(render()).not.toContain("rv--compact");
  });

  it("one <main id=main> holding the chapter and Board L's footer with the snapshot date", () => {
    const html = render();
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('<main id="main" class="main" tabindex="-1"><div class="col"><p>chapter body</p><footer class="foot">');
    expect(html).toContain('Sources: the DGDA register (OCL concepts), NLM RxNav, DDInter 2.0, and batch <span class="mono">0001-pilot</span> as stored on 13/10/2026. Endpoint paths come from the API controllers; example response bodies are illustrative.');
    expect(html).toContain('Anything marked <span class="example">Example</span> is an illustration, not a stored record, and carries no clinical meaning. IntelliDrugs is decision support and does not replace a clinician&#x27;s judgement.');
  });

  it("the rail lists the chapter's sections, none marked current until the scroll-spy runs (no false 'current' without JavaScript)", () => {
    const html = render();
    expect(html).toContain('<aside class="rail" aria-label="On this page" data-learn-rail=""><h2>On this page</h2><p class="railCh">The process</p>');
    expect(html).toContain('<li><a href="#process-flow">The whole flow</a></li>');
    expect(html.match(/<li><a href="#process-[a-z]+"/g)).toHaveLength(7);
    expect(html).not.toContain('aria-current="true"');
  });

  it("holds the page's one polite, sr-only live region (§10.2)", () => {
    const html = render();
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).toContain('<div class="sr-only" aria-live="polite" aria-atomic="true" data-learn-live=""></div>');
  });

  it("without stats (§6.8 'Stats unavailable'): skip link, toolbar, chapter nav without the nav note, no rail, the footer", () => {
    const html = renderToStaticMarkup(<LearnShell slug="process" ctx={null} theme="light"><p>banner</p></LearnShell>);
    expect(html).toContain('<a class="skip" href="#main">Skip to content</a>');
    expect(html).toContain('<a class="nl" href="/learn/process" aria-current="page">');
    expect(html).not.toContain("navNote");
    expect(html).not.toContain("data-learn-rail");
    expect(html).toContain('<main id="main" class="main" tabindex="-1"><div class="col"><p>banner</p><footer class="foot">');
    expect(html.match(/aria-live=/g)).toHaveLength(1);
  });
});
```

Create `web/tests/learn-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pilotStats } from "./fixtures/learn-stats";

const getStats = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()), getStats: () => getStats(), listReviewBatches: async () => [] }));
const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const requestHeaders = new Headers();
const cookieStore = { get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => requestHeaders }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
}));

import LearnChapterPage, { dynamic, generateMetadata } from "@/app/learn/[chapter]/page";
import LearnIndex, { dynamic as indexDynamic } from "@/app/learn/page";
import RootLayout from "@/app/layout";
import { CHAPTER_SLUGS } from "@/content/learn/chapters";

const page = async (chapter: string) => renderToStaticMarkup(await LearnChapterPage({ params: Promise.resolve({ chapter }) }));

beforeEach(() => {
  getStats.mockReset();
  getStats.mockResolvedValue(pilotStats());
  getSession.mockReset();
  getSession.mockResolvedValue(null);
  cookieStore.get.mockReset();
  requestHeaders.delete("x-pathname");
});

describe("/learn and /learn/[chapter] (§2.1, §6.8)", () => {
  it("/learn redirects to /learn/start; both routes are dynamic (§4.1)", () => {
    expect(() => LearnIndex()).toThrow("NEXT_REDIRECT /learn/start");
    expect([dynamic, indexDynamic]).toEqual(["force-dynamic", "force-dynamic"]);
  });

  it("only the ten exact slugs render a chapter (Review Focus 4)", async () => {
    for (const bad of ["Start", "START", "start ", "start%20", "start.html", "nope", "", "glossary/extra"]) await expect(page(bad)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getStats).not.toHaveBeenCalled();
  });

  it("a failed stats read renders the shell and the banner, and no chapter (Review Focus 1, §6.8 'Stats unavailable')", async () => {
    for (const failure of [new Error("API error 502"), new Error("API error: malformed stats"), new TypeError("fetch failed")]) {
      getStats.mockReset();
      getStats.mockRejectedValue(failure);
      for (const slug of ["start", "process"]) {
        const html = await page(slug);
        expect(html).toContain('<a class="skip" href="#main">Skip to content</a>');
        expect(html.match(/<main id="main"/g)).toHaveLength(1);
        expect(html.match(/<h1[ >]/g)).toHaveLength(1);
        expect(html).toContain('<p class="banner-title">Couldn&#x27;t load this chapter.</p>');
        expect(html).toContain("The live pilot numbers did not load, so no example is shown. Nothing was changed.");
        expect(html).toContain(`<a class="btn btn--tonal btn--sm" href="/learn/${slug}">Try again</a>`);
        for (const leak of ["data-snapshot", "data-withdrawn", "BDS-", "BDC-", "DDInter1", "navNote", "data-learn-rail"]) expect(html, `${slug} ${leak}`).not.toContain(leak);
      }
    }
    expect(await page("process")).toContain('<h1 id="h-process"><span class="chN">4</span> The process</h1>');
  });

  it("every chapter renders in the shell with exactly one <h1> and its nav link current", async () => {
    for (const slug of CHAPTER_SLUGS) {
      const html = await page(slug);
      expect(html.match(/<h1[ >]/g), slug).toHaveLength(1);
      expect(html).toContain(`<a class="nl" href="/learn/${slug}" aria-current="page">`);
      expect(html).toContain("Endpoint paths come from the API controllers");
      expect(html, slug).not.toContain("data-withdrawn");
      expect(html.match(/aria-live=/g), slug).toHaveLength(1);
    }
    expect(await page("start")).toContain('<h1>Learn IntelliDrugs</h1>');
    expect(await page("glossary")).toContain('<h1 id="h-glossary"><span class="chN">9</span> Glossary</h1>');
  });

  it("reads the theme cookie for the toolbar's control", async () => {
    cookieStore.get.mockImplementation((name: string) => (name === "intellidrugs-theme" ? { name, value: "dark" } : undefined));
    expect(await page("faq")).toMatch(/aria-pressed="true"[^>]*>Dark</);
  });

  it("titles each chapter page", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ chapter: "codes" }) })).toEqual({ title: "Our IDs and the code systems | Learn IntelliDrugs" });
    expect(await generateMetadata({ params: Promise.resolve({ chapter: "nope" }) })).toEqual({});
  });
});

describe("the root layout on Learn pages", () => {
  const layout = async () => renderToStaticMarkup(await RootLayout({ children: <p>learn page</p> }));

  it("adds no site chrome around a Learn chapter (the shell brings its own)", async () => {
    requestHeaders.set("x-pathname", "/learn/process");
    const html = await layout();
    expect(html).toContain("<body><p>learn page</p></body>");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("keeps the site chrome for anything that is not a chapter, so a 404 there has a header and <main>", async () => {
    requestHeaders.set("x-pathname", "/learn/Start");
    const html = await layout();
    expect(html).toContain('<main id="content"');
    expect(html).toContain('<a href="/learn">Learn</a>');
  });
});
```

In `web/tests/surface.test.ts`, change the import line to

```ts
import { CHAPTER_SLUGS } from "@/content/learn/chapters";
import { isLearnSurface, isReviewSurface, legacyRedirect, reviewGate } from "@/lib/surface";
```

and add as the last test of the file's last `describe`:

```ts
  it("isLearnSurface accepts the ten exact chapter paths only (Review Focus 4)", () => {
    for (const slug of CHAPTER_SLUGS) expect(isLearnSurface(`/learn/${slug}`)).toBe(true);
    for (const p of ["/learn", "/learn/", "/learn/Start", "/learn/START", "/learn/start%20", "/learn/start/", "/learn/start.html",
      "/learn/glossary/extra", "/learning/start", "/review/start", "/learn/startx", ""]) expect(isLearnSurface(p)).toBe(false);
  });
```

Create `web/tests/learn-links.test.tsx` (G3: "Learn … offer[s] no search, check or link into unreviewed records", §1.2, §6.8):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));

import { learnContext } from "@/components/learn/context";
import LearnShell from "@/components/learn/LearnShell";
import { CHAPTER_BODIES } from "@/content/learn";
import { CHAPTER_SLUGS } from "@/content/learn/chapters";
import { pilotStats } from "./fixtures/learn-stats";

const ALLOWED = /^(#[a-z0-9-]+|\/learn\/(start|model|codes|process|why|interactions|reviewers|partners|glossary|faq)(#[a-z0-9-]+)?|https:\/\/[^\s"]+)$/;
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("Learn links stay inside Learn (G3)", () => {
  it("every href in every chapter and in the shell is an in-page anchor, a Learn chapter or an outside https link", () => {
    for (const slug of CHAPTER_SLUGS) {
      const Body = CHAPTER_BODIES[slug];
      const ctx = learnContext(pilotStats());
      const html = renderToStaticMarkup(<LearnShell slug={slug} ctx={ctx} theme="light"><Body ctx={ctx} /></LearnShell>);
      for (const h of hrefs(html)) {
        expect(h, `${slug}: ${h}`).toMatch(ALLOWED);
        expect(h, `${slug}: ${h}`).not.toMatch(/\/(products|substances|check|review|search)(\/|\?|$)/);
      }
    }
  });
});
```

In `web/tests/header.test.tsx`, in "anonymous: the wordmark links home, the checker link, and a tonal Sign in", add after the `Interaction checker` assertion:

```ts
    expect(html).toContain('<a href="/learn">Learn</a>');
```

In `web/tests/marks.test.ts`, add one entry at the end of `MATERIAL_ALLOWED`:

```ts
  "components/learn/LearnShell.tsx",   // P3: the Learn toolbar and chapter nav (Board L, §6.8)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/learn-shell.test.tsx tests/learn-page.test.tsx tests/learn-links.test.tsx tests/surface.test.ts tests/header.test.tsx`
Expected: FAIL: `Failed to resolve import "@/components/learn/LearnShell"`, `"@/content/learn"` and `"@/app/learn/[chapter]/page"`; `isLearnSurface is not a function`; the header has no Learn link.

- [ ] **Step 3: Write the shell and its layout module**

`LearnShell.module.css` ports Board L's `.d-*` rules with the same values. `scroll-padding-top` is set on `<html>` only when the page holds the shell (`:global(html):has(.shell)`), at Board L's 72 px and, below 860 px, 116 px (toolbar plus the sticky chapter row; §6.8, WCAG 2.4.11). The nav note's pill is the full one (Board L's compact pill is for the reviewer record list only, §3.4).

Create `web/components/learn/LearnShell.module.css`:

```css
/*
 * Board L's shell (.d-* rules), ported with the same values (spec §3.1, §6.8). The sticky toolbar and the narrow
 * sticky chapter row set scroll-padding-top on <html>, only on pages that render this shell (§6.1, §10.4, WCAG 2.4.11):
 * Board L's 72 px (toolbar) and 116 px (toolbar plus nav row) below 860 px.
 */
:global(html):has(.shell) { scroll-padding-top: 72px; }
@media (prefers-reduced-motion: no-preference) { :global(html):has(.shell) { scroll-behavior: smooth; } }
@media (max-width: 860px) { :global(html):has(.shell) { scroll-padding-top: 116px; } }

.shell { min-height: 100vh; }
.skip { position: absolute; left: 16px; top: -80px; z-index: 60; padding: 10px 14px; border-radius: var(--r-ctl); background: var(--surface); color: var(--fg); box-shadow: var(--shadow-2); font-weight: 600; text-decoration: none; }
.skip:focus { top: 10px; }

/* Toolbar */
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 40; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 24px; color: inherit; text-decoration: none; }
.brand svg { flex: none; }
.site { font-size: 12.5px; color: var(--fg-2); white-space: nowrap; }
.theme { margin-left: auto; flex: none; }
@media (max-width: 640px) {
  .site { display: none; }
  .theme :global(.seg) button { padding: 0 9px; }
}
@media (max-width: 380px) { .brand svg { display: none; } }

/* Shell */
.layout { display: grid; grid-template-columns: 256px minmax(0, 1fr) 216px; max-width: 1480px; margin-inline: auto; }
.nav { position: sticky; top: 52px; align-self: start; height: calc(100vh - 52px); overflow-y: auto; z-index: 20; }
.nav ol { display: flex; flex-direction: column; gap: 2px; }
.nl { position: relative; isolation: isolate; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px; align-items: baseline; min-height: 34px; padding: 7px 10px; border-radius: 8px; color: var(--fg); text-decoration: none; font: 400 13.5px/1.3 var(--font-ui); }
.nl::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: var(--fg); opacity: 0; transition: opacity var(--dur-state) var(--ease-std); }
.nl:hover::before { opacity: var(--sl-hover); }
.nl:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.n { font-size: 12px; color: var(--fg-2); font-variant-numeric: tabular-nums; }
.nl[aria-current="page"] { background: var(--surface); box-shadow: var(--shadow-1); font-weight: 600; }
.navNote { margin-top: auto; padding: 12px 10px 4px; font-size: 12px; color: var(--fg-2); display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); }
.navNote :global(.rv) { max-width: 100%; align-self: flex-start; white-space: normal; height: auto; min-height: 24px; padding-block: 3px; line-height: 1.25; }
.main { min-width: 0; padding-inline: clamp(16px, 4vw, 56px); padding-block: 40px 120px; }
.col { max-width: 860px; margin-inline: auto; display: flex; flex-direction: column; gap: 104px; }
.rail { position: sticky; top: 52px; align-self: start; max-height: calc(100vh - 52px); overflow-y: auto; padding: 44px 16px 24px 4px; display: flex; flex-direction: column; gap: 10px; }
.rail h2 { font: 600 12.5px/1.3 var(--font-ui); color: var(--fg-2); padding-left: 12px; }
.rail ol { display: flex; flex-direction: column; gap: 1px; border-left: 1px solid var(--line); }
.rail a { display: block; padding: 5px 10px 5px 12px; margin-left: -1px; border-left: 2px solid transparent; font-size: 13px; line-height: 1.35; color: var(--fg-2); text-decoration: none; }
.rail a:hover { color: var(--fg); }
.rail a:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; border-radius: 4px; }
.rail a[aria-current="true"] { color: var(--fg); font-weight: 600; border-left-color: var(--accent); }
.railCh { font-size: 13px; font-weight: 600; color: var(--fg); padding-left: 12px; }
@media (max-width: 1180px) {
  .layout { grid-template-columns: 236px minmax(0, 1fr); }
  .rail { display: none; }
}
@media (max-width: 860px) {
  .layout { display: block; }
  .nav { position: sticky; top: 52px; height: auto; flex-direction: row; align-items: center; gap: 8px; padding: 8px 16px; border-right: 0; border-bottom: 1px solid var(--line); overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
  .nav :global(.chrome-heading), .navNote { display: none; }
  .nav ol { flex-direction: row; flex-wrap: nowrap; gap: 4px; }
  .nl { white-space: nowrap; min-height: 32px; padding: 6px 10px; grid-template-columns: auto auto; }
  .main { padding-block: 28px 96px; }
}
```

Create `web/components/learn/LearnShell.tsx`:

```tsx
import type { ReactNode } from "react";
import ThemeSwitch from "@/components/ThemeSwitch";
import BrandIcon from "@/components/ui/BrandIcon";
import ExampleMarker from "@/components/ui/ExampleMarker";
import Wordmark from "@/components/ui/Wordmark";
import { CHAPTERS, chapterBySlug, type ChapterSlug } from "@/content/learn/chapters";
import { PILOT_SNAPSHOT } from "@/content/learn/pilot-snapshot";
import { LEARN_NEW, fill } from "@/lib/copy";
import { PRODUCTION_HOST } from "@/lib/site";
import type { Theme } from "@/lib/theme";
import type { LearnContext } from "./context";
import { LEARN_LIVE_ATTR } from "./glossary-filter";
import LearnRail from "./LearnRail";
import learn from "./learn.module.css";
import { BatchNote } from "./parts";
import styles from "./LearnShell.module.css";

/**
 * The Learn shell (Board L, §6.8): skip link, sticky material toolbar (lockup to /learn/start, the site label, the
 * theme control), the chapter nav (links with aria-current="page" and the live nav note), one reading column ending in
 * Board L's footer, and the "On this page" rail with the LearnRail island. The root layout adds no chrome here, so the
 * shell also renders the page's one polite, sr-only live region (§10.2). With `ctx` null (§6.8 "Stats unavailable")
 * it leaves out the nav note and the rail, the two parts that need /v1/stats or a chapter body.
 */
export default function LearnShell({ slug, ctx, theme, children }: { slug: ChapterSlug; ctx: LearnContext | null; theme: Theme; children: ReactNode }) {
  const chapter = chapterBySlug(slug)!;
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <div className="sr-only" aria-live="polite" aria-atomic="true" {...{ [LEARN_LIVE_ATTR]: "" }} />
      <header className={`material chrome-toolbar ${styles.bar}`}>
        <a className={styles.brand} href="/learn/start" aria-label="IntelliDrugs Learn">
          <BrandIcon size={24} />
          <span aria-hidden="true"><Wordmark size={17} sub="Learn" /></span>
        </a>
        <span className={styles.site}>{PRODUCTION_HOST}</span>
        <div className={styles.theme}><ThemeSwitch value={theme} /></div>
      </header>
      <div className={styles.layout}>
        <nav className={`material chrome-sidebar ${styles.nav}`} aria-label="Chapters" data-learn-nav="">
          <p className="chrome-heading">Learn IntelliDrugs</p>
          <ol>
            {CHAPTERS.map((c) => (
              <li key={c.slug}>
                <a className={styles.nl} href={`/learn/${c.slug}`} aria-current={c.slug === slug ? "page" : undefined}>
                  <span className={styles.n}>{c.n}</span><span>{c.nav}</span>
                </a>
              </li>
            ))}
          </ol>
          {ctx && <div className={styles.navNote}><BatchNote ctx={ctx} /></div>}
        </nav>
        <main id="main" className={styles.main} tabIndex={-1}>
          <div className={styles.col}>
            {children}
            <footer className={learn.foot}>
              <p>Sources: the DGDA register (OCL concepts), NLM RxNav, DDInter 2.0, and batch <span className="mono">{PILOT_SNAPSHOT.batchId}</span> {fill(LEARN_NEW.asStored, { date: PILOT_SNAPSHOT.storedOn })}. Endpoint paths come from the API controllers; example response bodies are illustrative.</p>
              <p>Anything marked <ExampleMarker /> is an illustration, not a stored record, and carries no clinical meaning. IntelliDrugs is decision support and does not replace a clinician's judgement.</p>
            </footer>
          </div>
        </main>
        {ctx && (
          <aside className={styles.rail} aria-label="On this page" data-learn-rail="">
            <h2>On this page</h2>
            <p className={styles.railCh}>{chapter.title}</p>
            <ol>
              {/* No aria-current here: LearnRail's scroll-spy sets it on mount, so without JavaScript nothing is wrongly "current". */}
              {chapter.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
            </ol>
            <LearnRail />
          </aside>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the routes**

Create `web/content/learn/index.ts`:

```ts
import type { ComponentType } from "react";
import type { LearnContext } from "@/components/learn/context";
import type { ChapterSlug } from "./chapters";
import CodesChapter from "./codes";
import FaqChapter from "./faq";
import GlossaryChapter from "./glossary";
import InteractionsChapter from "./interactions";
import ModelChapter from "./model";
import PartnersChapter from "./partners";
import ProcessChapter from "./process";
import ReviewersChapter from "./reviewers";
import StartChapter from "./start";
import WhyChapter from "./why";

/** The body of each Learn chapter route (§2.1, §6.8). */
export const CHAPTER_BODIES: Record<ChapterSlug, ComponentType<{ ctx: LearnContext }>> = {
  start: StartChapter, model: ModelChapter, codes: CodesChapter, process: ProcessChapter, why: WhyChapter,
  interactions: InteractionsChapter, reviewers: ReviewersChapter, partners: PartnersChapter, glossary: GlossaryChapter, faq: FaqChapter,
};
```

Create `web/app/learn/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** §2.1: "/learn | Redirects 307 to /learn/start" (a server component's redirect() answers 307). */
export default function LearnIndex() {
  redirect("/learn/start");
}
```

Create `web/app/learn/[chapter]/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { learnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import LearnShell from "@/components/learn/LearnShell";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { CHAPTER_BODIES } from "@/content/learn";
import { chapterBySlug } from "@/content/learn/chapters";
import { getStats } from "@/lib/api";
import { LEARN_FAIL } from "@/lib/copy";
import type { SiteStats } from "@/lib/stats";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ chapter: string }> };

export async function generateMetadata({ params }: Props) {
  const entry = chapterBySlug((await params).chapter);
  return entry ? { title: `${entry.title} | Learn IntelliDrugs` } : {};
}

/**
 * One Learn chapter (§2.1, §6.8). Only the ten exact slugs render; anything else is a 404. Live numbers come from
 * GET /v1/stats with public scope. If that read fails (down, timeout, malformed body), no chapter body renders, so no
 * frozen example ever shows without its live exampleUsable check (Review Focus 1); the reader gets the Learn shell,
 * the chapter title as <h1> and §6.8's "Stats unavailable" banner with a link that reloads the chapter. The banner has
 * no role: §10.2 allows no assertive region, and it is server-rendered, so it is read with the page.
 */
export default async function LearnChapterPage({ params }: Props) {
  const entry = chapterBySlug((await params).chapter);
  if (!entry) notFound();
  const [stats, jar] = await Promise.all([
    getStats().catch((e: unknown): SiteStats | null => {
      // No PHI here: the error is "API error 502", "API error: malformed stats" or a network message.
      console.error(`learn: GET /v1/stats failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
    cookies(),
  ]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  if (!stats) {
    return (
      <LearnShell slug={entry.slug} ctx={null} theme={theme}>
        <section className={styles.ch} id={entry.slug} aria-labelledby={`h-${entry.slug}`}>
          <div className={styles.chHead}>
            <h1 id={`h-${entry.slug}`}><span className={styles.chN}>{entry.n}</span>{" "}{entry.title}</h1>
          </div>
          <Banner tone="crit" title={LEARN_FAIL.failTitle} body={LEARN_FAIL.failBody}
            action={<a className={buttonClass("tonal", "sm")} href={`/learn/${entry.slug}`}>{LEARN_FAIL.retry}</a>} />
        </section>
      </LearnShell>
    );
  }
  const ctx = learnContext(stats);
  const Body = CHAPTER_BODIES[entry.slug];
  return (
    <LearnShell slug={entry.slug} ctx={ctx} theme={theme}>
      <Body ctx={ctx} />
    </LearnShell>
  );
}
```

- [ ] **Step 5: Leave the site chrome off Learn pages, and link Learn from the header**

In `web/lib/surface.ts`, add under the file's first comment line:

```ts
import { CHAPTER_SLUGS } from "@/content/learn/chapters";
```

and add after `isReviewSurface`:

```ts
const LEARN = new RegExp(`^/learn/(${CHAPTER_SLUGS.join("|")})$`);

/** A Learn chapter page (§2.1): it brings its own toolbar, skip link and <main> (§6.8). /learn itself only redirects. */
export function isLearnSurface(pathname: string): boolean {
  return LEARN.test(pathname);
}
```

In `web/app/layout.tsx`, change the import `import { isReviewSurface } from "@/lib/surface";` to `import { isLearnSurface, isReviewSurface } from "@/lib/surface";`, replace

```tsx
  // /review/* brings its own toolbar, skip links and <main> (spec §5.1, §5.16).
  const review = isReviewSurface((await headers()).get("x-pathname") ?? "");
  const session = review ? null : await getSession();
```

with

```tsx
  // /review/* and the Learn chapters bring their own toolbar, skip links and <main> (spec §5.1, §5.16, §6.8).
  const path = (await headers()).get("x-pathname") ?? "";
  const ownShell = isReviewSurface(path) || isLearnSurface(path);
  const session = ownShell ? null : await getSession();
```

and replace `{review ? children : (` with `{ownShell ? children : (`. (A path that is not one of the ten chapters, such as `/learn/Start`, keeps the site chrome, so Next's 404 page has the header and `<main>`.)

In `web/components/Header.tsx`, add the Learn link after the checker link inside `<nav className={styles.nav} aria-label="Main">`:

```tsx
        <a href="/learn">Learn</a>
```

- [ ] **Step 6: Run the tests, then the whole suite, the style lint and the production build**

Run: `cd web && npx vitest run tests/learn-enhance.test.tsx tests/learn-shell.test.tsx tests/learn-page.test.tsx tests/learn-links.test.tsx tests/surface.test.ts tests/header.test.tsx tests/marks.test.ts tests/layout.test.tsx`
Expected: PASS (7 tests in `learn-shell.test.tsx`, 8 in `learn-page.test.tsx`, 1 in `learn-links.test.tsx`).

Run: `cd web && API_URL=http://api:8080 npm test && npm run build`
Expected: every test passes; the build lists `ƒ /learn` and `ƒ /learn/[chapter]` (first-load JS about 111 kB, under the §10.6 140 KB), then prints `client bundle check: no server secrets in .next/static` and `client island check: … all on the §4.2 allowlist` (now including `components/learn/GlossaryFilter.tsx` and `components/learn/LearnRail.tsx`).

- [ ] **Step 7: Commit**

```bash
git add web/components/learn/LearnShell.tsx web/components/learn/LearnShell.module.css \
  web/content/learn/index.ts web/app/learn/page.tsx "web/app/learn/[chapter]/page.tsx" \
  web/lib/surface.ts web/app/layout.tsx web/components/Header.tsx web/tests/learn-shell.test.tsx \
  web/tests/learn-page.test.tsx web/tests/learn-links.test.tsx web/tests/surface.test.ts web/tests/header.test.tsx web/tests/marks.test.ts
git commit -m "feat(web): /learn/[chapter] routes in the Learn shell, the stats-failure banner, Learn in the header (§2.1, §6.8)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: End to end — the Learn spec, axe in three looks and at 360 px, reflow, zoom, and the Learn Lighthouse budget

**Files:**
- Create: `web/e2e/learn.spec.ts`, `web/lighthouserc.learn.json`
- Modify: `.github/workflows/ci.yml`, `.gitignore`

**Interfaces:**
- Consumes: the whole Learn surface (Tasks 1–13); P1A's e2e harness (`deploy/docker-compose.ci.yml`, `e2e/session.ts` `BASE_URL`) and P1B's Board R pilot seed (`e2e/seed/10-pilot.sql`: batch `0001-pilot`, ten records, none approved).
- Produces: `e2e/learn.spec.ts` (runs after `foundation.spec.ts` and before the review specs, which change `0001-pilot`); `lighthouserc.learn.json` (the §10.6 `/learn/[chapter]` row plus the §10.6 server bullet's "Page TTFB … ≤ 600 ms", mobile preset, median of 3 runs, on `/learn/start`, `/learn/process`, `/learn/interactions`, `/learn/partners` and `/learn/glossary`); a CI step that runs it.

- [ ] **Step 1: Write the end-to-end spec**

Create `web/e2e/learn.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "./session";

/*
 * Learn end to end (§6.8, §11.4) on the production build and the Board R pilot seed. It runs after foundation.spec.ts
 * and before the review specs (files run in name order), so batch 0001-pilot is untouched: ten records, none approved,
 * none with an issue.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CHAPTERS = ["start", "model", "codes", "process", "why", "interactions", "reviewers", "partners", "glossary", "faq"];
const main = (page: Page) => page.locator("main#main");

test.describe.configure({ timeout: 180_000 });

test("/learn redirects 307 to /learn/start (§2.1)", async ({ request }) => {
  const res = await request.get("/learn", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/\/learn\/start$/);
});

test("an almost-right chapter URL is a 404 inside the site chrome (Review Focus 4)", async ({ page, request }) => {
  for (const path of ["/learn/Start", "/learn/START", "/learn/start%20", "/learn/nope", "/learn/start.html", "/learn/glossary/extra"])
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  await page.goto("/learn/nope");
  await expect(page.locator("main#content")).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
});

test("every chapter: one h1, its nav link current, no withdrawn example, Board L's footer, no CSP violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  for (const slug of CHAPTERS) {
    await page.goto(`/learn/${slug}`);
    await expect(page.locator("h1"), slug).toHaveCount(1);
    await expect(page.locator('nav[aria-label="Chapters"] a[aria-current="page"]')).toHaveAttribute("href", `/learn/${slug}`);
    await expect(page.locator("[data-withdrawn]"), slug).toHaveCount(0);
    await expect(main(page).locator("footer")).toContainText("batch 0001-pilot as stored on");
    await expect(page.locator('nav[aria-label="Chapters"]')).toContainText("All 10 pilot records, batch 0001-pilot.");
    // §10.2: one live region per page (light DOM; Next's route announcer lives in a shadow root).
    expect(await page.evaluate(() => document.querySelectorAll("[aria-live]").length), slug).toBe(1);
  }
  expect(violations).toEqual([]);
});

test("/learn/start shows the live numbers from /v1/stats (§6.8)", async ({ page }) => {
  await page.goto("/learn/start");
  await expect(page.getByRole("heading", { level: 1, name: "Learn IntelliDrugs" })).toBeVisible();
  await expect(page.locator('[role="listitem"] b')).toHaveText(["39,196", "10", "11", "0 of 10"]);
  await expect(main(page)).toContainText("Pilot run 11/10/2026 21:27 UTC, which is 12/10/2026 03:27 in Dhaka. Nothing from the pilot is public yet.");
});

test("the §1.6 Learn corrections are on the pages (§12.1 phase 3 exit)", async ({ page }) => {
  const has = async (slug: string, ...texts: string[]) => {
    await page.goto(`/learn/${slug}`);
    for (const t of texts) await expect(main(page), `${slug}: ${t}`).toContainText(t);
  };
  // Before P2 (§6.8, Task 0): the API sentences of chapter 1 and the chapter 8 product caption are not rendered yet.
  await has("start", "This is Napa as the review desk shows it.", "What a public visitor sees for Napa today.");
  await expect(main(page)).not.toContainText("The API returns the same thing");
  await has("model", "This eye-drop product is checked against DDInter352, the ophthalmic entry. When a product's route has no DDInter entry, the systemic entry is used and marked \"route assumed\".");
  await has("process", "Approval comes from the decision history. Each decision updates the record's review status, and a re-run resets it, so a decision made before the latest extraction never counts.",
    "9 of 10 records warned. Eight list pairs with no DDInter text. Domperidone has no DDInter data. Chloramphenicol is OK.",
    "An engineer presses A and the undo window (8 seconds by default; 20 or 60 in desk settings) closes", "When the undo window closes, the record is public.");
  await has("interactions", "The counts are the 28 DDInter pairs that apply to the pilot products.", "The pairs that apply to the pilot products",
    "Synergy", "3 pilot pairs", "6 pilot pairs", "16 pilot pairs", 'DDInter 2.0 lists this pair with action "unknown" and no text. It is not treated as low risk.');
  await has("reviewers", "Chloramphenicol eye drops: route is ophthalmic, and the interactions use DDInter352 (ophthalmic).",
    "Opens the undo window (8 seconds by default; 20 or 60 in desk settings).");
  await has("partners", "scope=all with the internal token, used only by integration tests. Reviewers read unreviewed data through /v1/review/*.",
    "Decision history, newest first, with notes, roles and reviewer emails. Internal token only.");
  await expect(main(page)).not.toContainText("a public caller gets its id");
  await has("glossary", "4 Major, 6 Moderate, 2 Minor, 16 not classified", "DDInter for 9 of 10 records",
    'The undo window after "Looks correct" (8 seconds by default; 20 or 60 in desk settings) when U cancels it.');
  await has("faq", "Press U or Undo before the undo window closes (8 seconds unless you lengthened it).");
  for (const slug of ["interactions", "glossary"]) {
    await page.goto(`/learn/${slug}`);
    for (const stale of ["35 pairs", "35 DDInter", "9 Moderate", "20 not classified", "10 of 10 records warned"]) await expect(main(page)).not.toContainText(stale);
  }
});

test("glossary filter: debounced count, empty state, Clear the filter and Esc (§6.8)", async ({ page }) => {
  await page.goto("/learn/glossary");
  const box = page.getByRole("searchbox", { name: "Filter the glossary" });
  const count = page.locator("[data-gl-count]");
  const live = page.locator("[data-learn-live]");
  const shown = page.locator("[data-gl-item]:visible");
  await expect(count).toHaveText("Showing all 55 terms");
  await box.fill("salt");
  await expect(count).toHaveText(/^Showing \d+ of 55 terms$/);
  await expect(live).toHaveText(/^Showing \d+ of 55 terms$/);
  await expect(live).toHaveClass(/sr-only/);
  expect(await shown.count()).toBeGreaterThan(0);
  expect(await shown.count()).toBeLessThan(55);
  await box.fill(".*");
  await expect(shown).toHaveCount(0);
  await expect(page.getByText("No terms match.")).toBeVisible();
  await page.getByRole("button", { name: "Clear the filter" }).click();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");
  await expect(shown).toHaveCount(55);
  await box.fill("dar");
  await box.press("Escape");
  await expect(box).toHaveValue("");
  await expect(shown).toHaveCount(55);
});

test("without JavaScript: every glossary term and both example panels show, with no filter and no switch (§4.4, §6.8)", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto("/learn/glossary");
  await expect(page.locator("[data-gl-item]:visible")).toHaveCount(55);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.goto("/learn/partners");
  for (const id of ["prod-public", "prod-all", "chk-public", "chk-all"]) await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reviewer access" })).toHaveCount(0);
  await context.close();
});

test("chapter 8: with JavaScript the example switch shows one panel at a time (§6.8)", async ({ page }) => {
  await page.goto("/learn/partners");
  const group = page.locator('[data-switch="prod"]');
  await expect(group).toBeVisible();
  await expect(page.locator("#prod-public")).toBeVisible();
  await expect(page.locator("#prod-all")).toBeHidden();
  await group.getByRole("button", { name: "Reviewer access" }).click();
  await expect(page.locator("#prod-all")).toBeVisible();
  await expect(page.locator("#prod-public")).toBeHidden();
  await expect(group.getByRole("button", { name: "Reviewer access" })).toHaveAttribute("aria-pressed", "true");
});

test("chapter 6: the worked check's DDInter text opens with Show full text (Expander, §4.2)", async ({ page }) => {
  await page.goto("/learn/interactions");
  const button = page.getByRole("button", { name: "Show full text" });
  await button.click();
  await expect(page.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
});

test("the rail marks the section being read (§4.2 LearnRail)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/learn/process");
  await expect(page.locator('aside a[href="#process-flow"]')).toHaveAttribute("aria-current", "true");
  await page.locator("#process-gate").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator('aside a[href="#process-gate"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator('aside a[aria-current="true"]')).toHaveCount(1);
});

test("below 860 px: a sticky chapter row, the current chapter in view, and an anchored heading not under it (§6.8, §11.4)", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("/learn/faq");
  const nav = page.locator('nav[aria-label="Chapters"]');
  await expect.poll(() => nav.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const navBox = (await nav.boundingBox())!;
  const current = (await nav.locator('a[aria-current="page"]').boundingBox())!;
  expect(current.x + current.width).toBeLessThanOrEqual(navBox.x + navBox.width + 1);
  await page.goto("/learn/process#process-gate");
  await expect.poll(async () => (await page.getByRole("heading", { name: "The review gate" }).boundingBox())!.y).toBeGreaterThanOrEqual(
    navBox.y + navBox.height - 1);
  const stuck = (await nav.boundingBox())!;
  expect(Math.round(stuck.y)).toBe(52);
});

test("reflow at 320 CSS px: no horizontal page scroll on any chapter (§10.4)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const slug of CHAPTERS) {
    await page.goto(`/learn/${slug}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), slug).toBeLessThanOrEqual(320);
  }
});

test("1280×800 at 400% zoom (320×200 CSS px): tabbing through a chapter, the toolbar and the chapter row never cover the focused element (§10.4, WCAG 2.4.11)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 200 });
  await page.goto("/learn/process");
  let tabbed = 0;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement === document.body)) break;
    tabbed++;
    const covered = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "no focused element";
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 0), window.innerHeight - 1);
      const cover = document.elementFromPoint(x, y)?.closest('.chrome-toolbar, nav[aria-label="Chapters"]');
      return cover && !cover.contains(el) ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)} under ${cover.tagName}` : null;
    });
    expect(covered, `Tab ${i + 1}`).toBeNull();
  }
  expect(tabbed).toBeGreaterThan(15);   // skip link, lockup, three theme buttons, ten chapter links, the scroll regions
});

const LOOKS = [
  { name: "light", theme: "light", forced: false },
  { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true },
] as const;
for (const look of LOOKS) {
  test(`axe (${look.name}): every Learn chapter has no WCAG 2.2 AA violation (§10, §11.4)`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
    await context.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
    const page = await context.newPage();
    for (const slug of CHAPTERS) {
      await page.goto(`/learn/${slug}`);
      const found = (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => `${slug} ${v.id}: ${v.nodes.length}`);
      expect(found).toEqual([]);
    }
    await context.close();
  });
}

test("axe at 360×800: the narrow layout (sticky chapter row, no nav note, no site label) has no WCAG 2.2 AA violation", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  for (const slug of ["start", "partners", "glossary"]) {
    await page.goto(`/learn/${slug}`);
    const found = (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => `${slug} ${v.id}: ${v.nodes.length}`);
    expect(found).toEqual([]);
  }
  await context.close();
});
```

- [ ] **Step 1b: See the two layout-sensitive cases fail once, then revert**

These two cases guard CSS and layout behaviour that no unit test reaches, so each is seen failing against a deliberately broken build before it is trusted. Start the stack first with Step 3's commands up to and including the `curl … /healthz` line (they define `$COMPOSE`).

1. In `web/components/learn/LearnShell.module.css`, inside `@media (max-width: 860px)`, replace `position: sticky; top: 52px;` in the `.nav` rule with `position: static;` (the base `.nav` rule is sticky too, so deleting the line would not unstick it). Rebuild only the web image and run the case:

```bash
$COMPOSE up -d --build web && curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz
(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/learn.spec.ts -g "below 860 px")
```

Expected: FAIL (the chapter row scrolls away, so `Math.round(stuck.y)` is not 52). Restore the line (`git checkout web/components/learn/LearnShell.module.css`).

2. In `web/lib/surface.ts`, make `isLearnSurface` return `pathname.startsWith("/learn/")`. Rebuild the web image and run:

```bash
$COMPOSE up -d --build web && curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz
(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/learn.spec.ts -g "almost-right chapter URL")
```

Expected: FAIL (the 404 page has no `main#content` and no header Learn link, because the root layout dropped the site chrome). Restore it (`git checkout web/lib/surface.ts`) and rebuild the web image once more before Step 3.

- [ ] **Step 2: Write the Lighthouse CI budget and run it in CI**

Create `web/lighthouserc.learn.json` (§10.6: HTML ≤ 60 KB = 61440 bytes, JS ≤ 140 KB = 143360, CSS ≤ 25 KB = 25600, fonts ≤ 90 KB = 92160, LCP ≤ 2.5 s; §10.6 "Page TTFB p75 ≤ 600 ms" as `server-response-time`; the default mobile preset with simulated Slow 4G; three runs per URL, as in P1B's config, because the measured LCP (about 2.2 s) sits close to the 2.5 s line and one noisy run must not block the deploy; `partners` (six JSON bodies, the heaviest HTML) and `process` (the swimlane SVG) are measured too; `resource-summary` sizes are transfer sizes, as in P1B's `lighthouserc.review.json`):

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/learn/start", "http://localhost:3000/learn/process", "http://localhost:3000/learn/interactions",
        "http://localhost:3000/learn/partners", "http://localhost:3000/learn/glossary"],
      "numberOfRuns": 3,
      "settings": { "blockedUrlPatterns": ["https://challenges.cloudflare.com/*"] }
    },
    "assert": {
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 1 }],
        "categories:performance": ["warn", { "minScore": 0.9 }],
        "server-response-time": ["error", { "maxNumericValue": 600 }],
        "resource-summary:document:size": ["error", { "maxNumericValue": 61440 }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 143360 }],
        "resource-summary:stylesheet:size": ["error", { "maxNumericValue": 25600 }],
        "resource-summary:font:size": ["error", { "maxNumericValue": 92160 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }]
      }
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci-learn" }
  }
}
```

In `.github/workflows/ci.yml`, in the `e2e` job, add after the line `      - run: cd web && npx lhci autorun --config=./lighthouserc.review.json`:

```yaml
      - run: cd web && npx lhci autorun --config=./lighthouserc.learn.json
```

In `.gitignore`, add after `web/.lighthouseci-review/`:

```
web/.lighthouseci-learn/
```

- [ ] **Step 3: Run the stack and the Learn spec**

Run (from the repository root, Docker running; the same commands as the CI `e2e` job):

```bash
export DB_USER=bddrug DB_PASSWORD=ci GHCR_OWNER=ci IMAGE_TAG=ci
COMPOSE="docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml"
$COMPOSE down -v
$COMPOSE up -d --build db flyway api web
$COMPOSE run --rm seed
curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz
(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/learn.spec.ts)
```

Expected: `17 passed`. If the reflow test names a chapter, a pill or a code chip is wider than 320 px: give it the `white-space: normal` rule the module already uses for pills in `.jr`, `.snapPills` and `.glEx`, never a horizontal page scroll.

- [ ] **Step 4: Run Lighthouse CI on the same stack**

Run: `cd web && npx lhci autorun --config=./lighthouserc.learn.json`
Expected: `Checking assertions against 5 URL(s), 15 total run(s)` then `All results processed!`, with no failed assertion (on the pilot seed the pages measured so far are about 17–31 KB of HTML, 116 KB of JS and 22 KB of CSS, accessibility 1, LCP about 2.2 s; `partners` and `process` were not measured when this plan was written, so if either exceeds a budget, stop and report the number rather than raising the budget).

- [ ] **Step 5: Run the whole e2e suite once, so the review specs still pass with Learn in the header**

Run: `cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test && npx lhci autorun && npx lhci autorun --config=./lighthouserc.review.json && npx lhci autorun --config=./lighthouserc.learn.json`
Expected: every spec passes (P1A's, P1B's and `learn.spec.ts`); all three Lighthouse configs pass.

- [ ] **Step 6: Commit**

```bash
git add web/e2e/learn.spec.ts web/lighthouserc.learn.json .github/workflows/ci.yml .gitignore
git commit -m "test(web): Learn end to end with axe in three looks, reflow, zoom and the §10.6 Learn budget" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Finishing P3

- [ ] Run everything once more from a clean tree:

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
(cd api && ./gradlew test --no-daemon)
(cd web && npm ci && npm run lint:css && API_URL=http://api:8080 npm test && npm run build)
```

Expected: all green; `postbuild` prints the bundle scan and `client island check: … all on the §4.2 allowlist`.

- [ ] Run Task 14 Steps 3 to 5 on a fresh stack (`down -v` first). Expected: every spec passes and all three Lighthouse configs pass.
- [ ] Phase 3 exit (§12.1): "The Learn e2e suite and axe are green; the §1.6 corrections are present." Both are pinned by `learn.spec.ts` ("the §1.6 Learn corrections are on the pages" and the four axe tests).
- [ ] Confirm P3 touches nothing the shared host runs besides the `bddrug` images:

```bash
git diff --stat origin/main...HEAD -- deploy/ | tail -1
```

Expected: no output (P3 changes no file under `deploy/`; nothing on the host outside the `bddrug` images changes, and `~/n8n/Caddyfile` is not touched, §12.4).

- [ ] Open a PR from `feature/intellidrugs-p3-learn` into `main` (P3 is the whole of phase 3; the amended §12.3 from Task 0 lets it merge to `main` on its own; merging deploys). In the PR description:
  - say whether the "Before you start" host values matched the plan's or were used instead, and whether `warfarinExtractedAt` holds the host's stamp or `null`;
  - say that Task 0 amends the spec (§12.1–§12.3, D48) and ask the product owner to approve that commit with the PR;
  - raise with the product owner (no code change in P3): chapter 6's per-substance table keeps Board L's Chloramphenicol row with all three DDInter entries ("654 records, Major 48…") under the "Pilot product: Chloramphenicol" (eye drops) column, while the desk counts only the chosen entry for the eye drop (112, §1.6 item 10). The board wins there, because §1.6 does not list this Learn row, so Learn and the desk show different totals for the same product. If they want them aligned, a §1.6 item (for example a "checked against DDInter352 for this product" sub-line) comes first, then a change to `interactions.tsx`;
  - include the shared-host checklist below.
- [ ] **Just before merging, record the neighbours on the shared host** (read-only; the procedure of P0 Task 14 Step 3). On the host:

```bash
ssh ec2-user@<EC2_HOST>
docker ps --format '{{.Names}}' | grep -Ev '^bddrug' | xargs docker inspect -f '{{.Name}} {{.State.StartedAt}}' \
  | sort > ~/p3-before.txt
cat ~/p3-before.txt
grep -E '^[a-z0-9.-]+\.[a-z]+[^{]*\{' ~/n8n/Caddyfile | grep -v drugdb.eliooo.org | sed -E 's/[ ,{].*//' > ~/p3-hosts.txt
cat ~/p3-hosts.txt
while read -r h; do printf '%s ' "$h"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 15 "https://$h/"; done < ~/p3-hosts.txt | tee ~/p3-hosts-before.txt
grep -E '^IMAGE_TAG=' ~/drugdb/deploy/.env | tee ~/p3-previous-tag.txt
```

Expected: one line per medscribe, baymax, medioo, n8n and Caddy container with its start time; one hostname per neighbouring Caddy site; a 2xx or 3xx code for each; the current `IMAGE_TAG` (the rollback target).

- [ ] After the deploy, on the host:

```bash
docker ps --format '{{.Names}}' | grep -Ev '^bddrug' | xargs docker inspect -f '{{.Name}} {{.State.StartedAt}}' \
  | sort > ~/p3-after.txt
diff ~/p3-before.txt ~/p3-after.txt && echo "no other container restarted"
while read -r h; do printf '%s ' "$h"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 15 "https://$h/"; done < ~/p3-hosts.txt > ~/p3-hosts-after.txt
diff ~/p3-hosts-before.txt ~/p3-hosts-after.txt && echo "neighbours answer as before"
curl -fsS -o /dev/null -w "%{http_code}\n" https://drugdb.eliooo.org/learn
curl -fsS -o /dev/null -w "%{http_code}\n" https://drugdb.eliooo.org/learn/start
```

Expected: `no other container restarted` (medscribe, baymax, medioo, n8n and Caddy keep their start times, §12.4), `neighbours answer as before`, then `307` and `200`. Then, in a browser: `/learn/start` shows "{n} pilot medicines loaded so far" with production's count, and no Learn page shows a withdrawn example unless a pilot record really has an issue reported or left the batch file (then that record's examples show only its trade name and pill). Remove the five `~/p3-*.txt` files afterwards.

- [ ] **Rollback, only if** `/learn/start` does not answer 200 or either diff above prints a line: on the host, set `IMAGE_TAG` in `~/drugdb/deploy/.env` back to the value in `~/p3-previous-tag.txt`, then `cd ~/drugdb/deploy && docker-compose up -d api web` (§12.5; only the `bddrug` project's `api` and `web` are recreated, never a neighbour). Re-run the after-deploy checks and report. If a neighbour restarted or stopped answering, report it at once: it is a §12.4 violation, and P3 does not try to repair another project's container.

## Self-review notes

- **Spec coverage.** Spec amendments the plan relies on (P3 before P2, P3 builds `/v1/stats`, P3 merges to `main` on its own, §1.6 item 16, the §1.7 stats-failure row, the three §6.8 Decision bullets, the LearnRail row): Task 0, before any code. §6.8 shell (toolbar, lockup, site label, ThemeSwitch, chapter nav with `aria-current="page"` and the live nav note, one column, rail hidden below 1180 px, the narrow layout below 860 px with the 116 px scroll padding, the label hidden below 640 px, the icon dropped below 380 px): Task 13b, e2e Task 14 (including axe at 360×800). LearnRail (scroll-spy, narrow row reveal, example switches): Task 13a. Headings rule: Tasks 5–13b (`learn-page.test.tsx` "exactly one `<h1>`", also on the failure page). Content source (TSX per chapter, inline SVG with title and desc, live numbers from `/v1/stats`, examples from `pilot-snapshot.ts`): Tasks 4–12. Snapshot-only values with "as stored on {date}": Tasks 3, 8, 12. Snapshot rules (footer, live pills, withdrawn examples, the G3 exception with no search, check or links into records): Tasks 5, 13b (`learn-links.test.tsx`). Every snapshot block keyed by an id `/v1/stats` reports: Task 4 (`learn-snapshot.test.ts` against `e2e/seed/10-pilot.sql` and an `ids` scan of every chapter). Approval-state sentences: Tasks 6, 9, 11, 12. Before-P2 API sentences: Tasks 5 (`API_STUB_SHAPE` pinned to `HiddenRecord.java`), 6, 11. Stats unavailable: Tasks 3, 13b. Chapter 8 (controllers, §7.4 shapes, reviewer panels withdrawn with their records, `PLANNED` pinned against the controllers, the `.seg` switch with both panels without JavaScript): Tasks 11, 13a. Glossary filter (label, placeholder, term + definition + example, 350 ms count, the one sr-only polite live region, empty state, Clear, Esc, no input without JavaScript): Tasks 12, 13b. FAQ `<details>`: Task 12. `/v1/stats` (§7.4 row, its §11.3 matrix row, the one §7.4 rule shared with the public adapters, §10.6 p95 at 5,000 items): Task 1. §1.6 items 3 (Tasks 7, 12), 4 (Task 8), 5 (Tasks 4, 9), 6 (Task 10), 7 (Tasks 4, 10), 11 (Tasks 4, 8, 9, 12), 12 (Tasks 8, 9, 10), 13 (Tasks 6, 11), 14 (Tasks 3, 8, 10, 12), 16 (Tasks 0, 9, 11, 12). §11.1 `learn-snapshot.test.ts`: Task 4. §11.2 Learn rows: Tasks 5, 6, 11. §11.4 Learn rows and axe: Task 14. §10.6 Learn budget and server targets: Tasks 1, 14. §12.4 shared host: Finishing P3.
- **Decisions taken while revising.**
  - Chapter 1's API sentence and chapter 8's product caption: the spec's option of building the §7.4 hidden stub in P3 was not taken, because the whole §7.4 `CheckResult` (summary, `notChecked`, `products`, …) is P2's and half a shape would be worse; Task 0 records instead that these sentences wait for P2, and a test makes P2's change visible.
  - The removed-item rule: `ReviewSql.statusOf` now reads a removed latest item as pending, so `/v1/stats` and the public endpoints on `main` apply one §7.4 rule (§6.4). This changes the existing adapters' behaviour in the safe direction only (a removed product stops being served in full); the "removed" stub status stays P2's.
  - Left outside any snapshot block on purpose: chapter 7's checklist examples (`XM86W0`, "`DDInter14` Acetaminophen, systemic") and the FAQ's answers about Napa's substance name and Domperidone's coverage. They are Board L's generic illustrations of what to compare or why a label appears, carry no review state, and stay true whatever a reviewer decides about those records; withdrawing them would remove the explanation, not a clinical claim.
  - Chapter 6's Chloramphenicol row (three entries, 654 records) is unchanged and raised with the product owner in the PR (Finishing P3).
- **Placeholders.** None: every code step carries its code. The "Before you start" host values are the plan's concrete values with an explicit rule for when the host differs; `warfarinExtractedAt` is `null` until the host value is pasted in, and the page is correct either way.
- **Type consistency.** `LearnContext` (`stats`, `batch`, `usable`, `item`, `tradeName`, `pending`, `apiStub`), `learnContext(stats, apiStub?)`, `API_STUB_SHAPE`, `SnapshotBlock({ ctx, ids, pills, className })`, `PilotId`/`P`/`PILOT_IDS`, `PILOT_SNAPSHOT.warfarinExtractedAt`, `ChapterSlug`/`CHAPTERS`/`chapterBySlug`, `SiteStats`/`StatsBatch`/`StatsItem`, `CHAPTER_BODIES`, `LEARN_FAIL`, `LEARN_BOARD.undoWindowDetail`/`undoWindow`/`undoWindowFaq`, `LEARN_LIVE_ATTR`, `PLANNED`, `LearnShell({ ctx: LearnContext | null })`, `ReviewSql.LATEST_PUBLIC`, and the DOM contract between `partners.tsx`/`LearnShell.tsx` and `enhance.ts` (`data-switch`, `data-panel`, `data-learn-nav`, `data-learn-rail`, `data-learn-live`, `data-gl-count`) are used with the names Tasks 1, 2, 3, 4, 5, 11, 12, 13a and 13b define.
- **Review Focus.** Each of the five lines names its pinning tests, in Tasks 2, 5, 6, 9, 11, 12, 13b and 14.
- **Verified before writing.** The first version of this plan (web code, tests, build, the Learn e2e spec with 16 passing and axe clean in light, dark and forced colours, the Lighthouse budget, and the API task against Postgres with 247 API tests green) was run against a copy of the P1B tree. The review revisions (Task 0, the failure page, the gated sentences, the live region, `statusOf`, the scale test, the e2e and Lighthouse changes) were checked against the repository's code by reading it, not by running them: each task's own test steps are the first run of those changes.
