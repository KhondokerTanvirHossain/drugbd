# IntelliDrugs P2 "Public surfaces" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A doctor, pharmacist or partner reaches pharmacist-approved medicine data on the public site: the landing page, sign-in and its welcome states, medicine search with synonyms and DAR numbers, approved product pages (with source links and "With other approved medicines" across every batch), hidden-record and removed-record stubs, substance pages, the interaction checker (with "From DDInter 2.0" and the senior-review state on every pair), the partner access request and the privacy page; all served by the §7.4 public endpoints, each applying the one §7.4 visibility rule.

**Architecture:** The Java API (hexagonal) gains the §7.4 public endpoints: `GET /v1/search`, the extended `GET /v1/products/{id}` (approved detail and the reshaped stub), `GET /v1/products/{id}/interactions` across batches grouped by partner substance, `GET /v1/clinical-drugs/{bdcId}`, the extended `GET /v1/substances/{bdsId}`, `GET /v1/substances/{bdsId}/interactions`, `GET /v1/products/suggest` and the extended `POST /v1/interactions/check`. Each new rule is a pure domain class with its own unit test (`PublicProducts`, `PublicPairs`, `SearchPage`, `Suggest`, the rewritten `InteractionCheckService.compute`), fed by set-based R2DBC adapters that read public status only through `ReviewSql.statusOf` or `ReviewSql.LATEST_PUBLIC`; the pair's public senior-review state comes from P1C's one reader of `ops.pair_review` (`PairReviewReader.forCodes`) and P1C's `PairReviewRule.publicReview`, through a pure helper (`PublicPairReviews`) that keys and hashes a page of pairs. The Next.js 15 app renders every public route on the server from those endpoints with `scope=public`; Board P's layout is ported into CSS Modules; the only islands used are the §4.2 ones (`CheckerCombobox`, `Expander`, `ThemeSwitch`, `TurnstileField`, `AccountMenu`, `SignInButton`), and every flow but sign-in and the bot-checked writes works without JavaScript.

**Tech Stack:** Java 21, Spring Boot 3.4.2 (WebFlux, R2DBC), JUnit 5, Testcontainers 1.20.4, Flyway 10.20.1 (tests only) · Next.js 15.5.27 (app router), React 19.0.8, TypeScript 5.7.3, CSS Modules, vitest 2.1.8 (+ jsdom 26.1.0, Testing Library 16.3.3), Stylelint 16 · Playwright 1.64.0 with `@axe-core/playwright` 4.13.0, Lighthouse CI 0.15.1 · PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md` as amended for P1C (15/10/2026). This plan is row "P2 Public surfaces" of §12.2: §6.1–§6.7, §6.9, §7.4 (reusing `GET /v1/stats` from P3, and switching every public adapter to the one §7.4 rule), the `/?q=` redirect (§2.3), `docs/runbooks/partner-requests.md` (new), and the public parts of §11; for sign-in only the visual card (§6.2 "Card") and the welcome states (including the P1C senior step); and the P1C public model: P10 across batches grouped by partner substance (§6.5), `FROM_DDINTER` and the public pair review state on every pair card (§6.5–§6.7.3), `pairReview` in the check result and P9, and source links on approved product and substance pages (§6.5, §6.6, §5.6.6). Read the "Changes in P1C" note, §1 (all of §1.6 and §1.7), §2, §3, §4, §6 (§6.8 only for the `API_STUB_SHAPE` switch), §7.4, §7.7 (`PairReviewRule`), §9, §10, §11 and §12 before starting. Visual and string source: Board P `docs/artifacts/2026-10-12-intellidrugs-public.html` (read it in full: both `<style>` blocks, every section and the checker script), with the §1.6 corrections (items 1, 9, 15 and 17) applied.

**Depends on:** P0, P1A and P1C merged to `main` (P1C itself depends on P1B and P3, so all five are on `main`). P2 builds on P1C's names; the ones it consumes are listed under "Interfaces consumed from P1C" below and in each task's **Interfaces** block.

**Branch:** `feature/intellidrugs-p2-public`, created from `main` after P1C merges. P2 is the whole of phase 2 (§12.1), but §12.3 does not list it among the plans that may merge to `main` on their own, so its PRs merge into the `phase-2` integration branch and only the phase-complete merge of `phase-2` into `main` deploys (D42).

**Split (more than 30 tasks).** This file holds two plans with one boundary:

- **P2a "Public API" (Tasks 1–15).** Every §7.4 endpoint, the reshaped stubs and check result, the public pair review state, and the visibility matrix. It ends with PR 1 into `phase-2`. It is independently shippable: the pre-P2 web pages keep working against it (their reads stay compatible; Task 1 updates the two web types and Learn's `API_STUB_SHAPE` that the stub change touches), and its tests are API tests.
- **P2b "Public pages" (Tasks 16–40).** Every public web route, the islands, the runbook, the end-to-end, axe and Lighthouse suites. It starts from `phase-2` after PR 1 merges and ends with PR 2 into `phase-2`, then the phase-complete PR from `phase-2` to `main`.

**Note for executors:** `next build` type-checks every file `web/tsconfig.json` includes (`tests/`, `e2e/`, `content/` too), and `web/tsconfig.json` targets `es2016`: no regular-expression `s` flag (write `[\s\S]`). In JSX text, `{` `}` `<` `>` must be escaped. CSS Module class names in this plan keep Board P's names (`styles["s-hero"]`); vitest maps a module class to its own name, so component tests see `class="s-hero"`. Java integration tests need Docker (Testcontainers).

## Global Constraints

Copied verbatim from the spec unless marked *P2 adaptation*. Every task's requirements include this section.

- "This document is the authority the implementation plans argue from. … Where a board and this spec disagree, this spec wins only in the cases listed in §1.6 … Everywhere else the boards win. Any string shown in "quotes" or a code block below must be used verbatim … Any quoted string that no board contains is new copy whether or not §1.7 names its state: it follows §3.5, and the copy test (§11.1) checks it against the §1.7 list." (spec preamble)
- G3 (§1.2): "absence of data is never shown as safety; unknown severity is never merged with Minor; nothing is public until a pharmacist approves it. … *(P1C)* an interaction is never hidden because no senior pharmacist has reviewed it yet. Senior review of pairs comes after the fact; it is not a gate (§5.17, §6.7.3)"; "*(P1C)* a record never returns to public view without a pharmacist's decision".
- "**Decision: public routes always read with public scope.** `/`, `/search`, `/products/*`, `/substances/*`, `/check`, `/check/suggest`, `/partners`, `/learn/*` and `/privacy` call the API with `scope=public` whatever the session, so a reviewer sees exactly what a reader sees there. Unapproved data is readable only under `/review/*`, through the token-gated endpoints in §7.3." (§2.2)
- "Stored emails ("Emails of anyone else") are never rendered by any route." (§2.2) Own name and email: "in the account menu only" (§2.2 table); §9.7: "shown only to their owner (account menu, the reader welcome state, and the "not on the reviewer list" banner)". *P2 adaptation:* §6.9's success message also names the requester's own email to that requester only.
- "**Visibility rule for every endpoint in this section (Decision).** Under public scope: a product is **public** only when its latest batch item has `review = 'ok'` and is not marked "removed from batch file"; a substance is public only when at least one public product carries it; a clinical drug is public only when at least one public product maps to it; nothing else from an unapproved record is served: no clinical drug, substance, code, strength, severity, count or DDInter text." (§7.4)
- "**Removed items are never public (PO D7).** … Every adapter P2 adds (search, suggest, clinical drugs, P10) must do the same [read status through `ReviewSql.statusOf` or `ReviewSql.LATEST_PUBLIC`]." (§7.4) "The guard test fails if a public adapter reads `ops.batch_item.review` without `statusOf` or `LATEST_PUBLIC` (§11.3)."
- "**Every alert is returned with its DDInter text**, whatever its senior-review state. `pairReview` is the coarse public form of `PairReviewRule` (§7.7): `reviewed` only when the counting pair review's content hash equals the current one. `changed`, `issue` and `not_reviewed` are all sent as `not_reviewed`, with `reviewedAt: null`. … It carries no note, role, email or reason, and it is served only for pairs between public products." (§7.4)
- "Every change keeps the `ApiResponse` envelope and the error mapping in `ApiExceptionHandler`. New errors use the existing codes (`INVALID_QUERY`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`) with a `field`." (§7)
- "`$WEB/styles/tokens.css` is a byte-identical copy of `docs/design/intellidrugs/tokens.css`." "Page and component layout lives in CSS Modules (`*.module.css`). Modules use tokens only, never raw colour values." "Layout rules that the boards define in their second `<style>` block (`.pg`, `.app`, `.panes`, `.d-…`, `.s-…`, `.d-shell`, and so on) are ported into modules with the same values." "Remove every inline `style={{…}}` object in `$WEB`. The only allowed inline styles are CSS custom properties: a measured value (for example `--w: 40%` on progress meters), and `--dur-commit` on the desk toast" (§3.1). Board P's inline `style="…"` attributes become module classes.
- §3.4 mark exclusivity: "Green (`--ok`, `.rv--approved`) means "approved by a pharmacist" and nothing else. The hatch (`NoDataBlock`, `NoDataChip`) means "no interaction data" (coverage `none`) and nothing else. Pairs not checked for any other reason are plain, unhatched text. Square chips mean severity. Rounded pills mean review status. Translucent material (`.material`, `.decision-bar`) is used only on the toolbar, the sidebar and the decision bar. *(P1C)* A pair's senior-review state is plain text (`PairReviewState`). … it never uses green, the seal icon or a review-status pill." `ReviewStatus`: "Public views accept only `pending` and `approved`." `PairReviewState`: "Public accepts only `reviewed` and `not_reviewed`." `SourceLink`: "Never rendered without a `url`. Never says "fetched on" without a stored time. Plain link style, never a button." `CodeChip` (P1C): "`source` comes from the API only (§5.6.6). The web never builds a source URL."
- §3.5 voice: "**Say what was and wasn't saved.** Never write a bare "Something went wrong"." "**Use DDInter's words for clinical text.** Truncate and link to the full text. Never summarise." "**Show ids in mono and words in Onest.**" "**Dates follow Bangladesh conventions.** … "12/10/2026 03:28 Dhaka time" (public surfaces)." "**Em dash.** The only em dash in the product is in the stale-page title. Ranges and "drug–drug" use an en dash."
- §3.6: "The **safety sentences** that the copy test guards against paraphrase are `NO_DATA_SENTENCE`, `NOT_REVIEWED`, `SEVERITY_NOT_CLASSIFIED`, `UNKNOWN_PAIR_LINE` (with its plural `UNKNOWN_PAIRS_LINE`) and `NOT_RUN`. Each is rendered from its constant, never retyped … DDInter placeholder text ("None", "-", "n/a", and so on) is never printed." `FROM_DDINTER` "The label on every pair card whose text or severity comes from DDInter, public and reviewer". `PAIR_REVIEWED` "`{date}` = `DD/MM/YYYY` of the counting pair review, Dhaka. Public and reviewer. Plain text, never green." `PAIR_NOT_REVIEWED` "It never hides the pair or its text (G3)."
- "Every route is an async server component with `dynamic = "force-dynamic"`. Data is fetched on the server from the internal API." (§4.1)
- §4.2 islands used by P2 (the complete allowlist is unchanged): "CheckerCombobox | `components/check/CheckerCombobox.tsx` | ARIA 1.2 combobox with suggestions | the current ids, `max` = 20"; "Expander | … Public and Learn (Boards P and L): "Show full text" / "Show less". Without JS the text renders unclamped."; ThemeSwitch, SignInButton, TurnstileField, AccountMenu. "A build check, `scripts/check-client-islands.mjs` … fails if a file is missing from this table, or if a file in the table imports `@/lib/api`, `@/lib/session` or any other `server-only` module."
- §4.3: "Only what the page renders, plus the props listed above. There is never a bulk JSON endpoint." "`/check/suggest`: at most 10 rows, `q` of 2 or more characters, approved products' clinical names only". "`GET /v1/products/loaded` is no longer called by any page. The checker picker uses suggestions."
- §4.4: "Search, product, substance, Learn | Full | Same, plus Expander and the glossary filter"; "Checker | GET form. "Add a medicine" is a text field with a "Find" submit. The server lists matches as submit buttons (`name="ids"`) inside the same form, with the current ids as hidden inputs. Remove is a submit button per medicine. | Combobox (§6.7.1)"; "Sign-in | `<noscript>` "Sign-in needs JavaScript for Google and the bot check." | Island".
- §6.7.1: "**Decision**: the selection lives only in the URL. Nothing goes to localStorage." D22: "No checker persistence in browser storage; no query strings in logs".
- §9.2: "Flags (problem reports) | Turnstile `action=flag`"; "Partner request | Turnstile `action=partner`"; "Reads | Rate limits (§9.3), a public search page cap (§6.3), no bulk endpoints, `noindex` (header and metadata), `robots.txt` with `Disallow: /` while the site is in pilot".
- §9.3 rows, verbatim: "`/check/suggest`, per IP | 5/s, burst 10 | 429, empty list"; "Flags, per account | 10 per hour | flag outcome `failed`"; "Partner requests, per account | 3 per day | flag outcome `failed`". "**"Per account" keys use the session's email** (lower-cased, hashed with SHA-256 in memory, never logged)".
- §9.4: "Add `Cache-Control: private, no-store` to every response that depends on the session." (P1A's middleware sets it on every page.)
- §9.7: "**No PHI is requested.** No field asks for patient data, and a checker selection is a list of products in the URL. It is not logged (route template only), not stored, and not persisted in the browser." "Each carries `NO_PHI_HELP` (§3.6) under its label. None of these texts is ever logged or written to `audit_event`."
- §10.1–§10.5: ""Skip to content" on every public page"; "One polite, `sr-only` live region per page (`aria-live="polite"`, `aria-atomic="true"`). Messages are set by clearing the region and writing after 60 ms. No assertive regions."; "Public pages: no two-dimensional scrolling at 320 CSS px, except data tables in their own labelled, keyboard-scrollable regions (`tabindex="0"`, `role="region"`, `aria-label`)."; "Sticky public and Learn toolbars set `scroll-padding-top` (§6.1, §6.8)."; "Interactive targets are at least 24 × 24 px (WCAG 2.5.8)."; "One `<h1>` per page, with a heading order that has no skipped levels. Tables use `<th scope>` and a caption (sr-only where visual). Severity and status always carry words. Never colour alone."
- §10.6 rows, verbatim: "`/` | ≤ 30 KB | ≤ 130 KB | ≤ 20 KB | ≤ 90 KB (Onest var + Plex Mono 400) | ≤ 2.5 s"; "`/search`, `/products/[id]`, `/substances/[id]` | ≤ 50 KB | ≤ 130 KB | ≤ 20 KB | same | ≤ 2.5 s"; "`/check` | ≤ 50 KB | ≤ 145 KB | ≤ 20 KB | same | ≤ 2.5 s" (HTML, JS (all, incl. Next runtime), CSS, Fonts, LCP Slow 4G mobile; "gzip, measured in CI on the production build"). "Server: API p95 ≤ 300 ms per call (existing target). Page TTFB p75 ≤ 600 ms." "Third-party requests: Turnstile only on pages with a write form".
- S5 (§1.4): "Lighthouse (mobile, Slow 4G) scores at least 90 for performance and 100 for accessibility on `/`, `/search?q=paracetamol`, a product page and `/check`. The page-weight budgets in §10.6 hold." *P2 adaptation (house rule from P1B and P3):* the performance score is asserted as `warn`, every numeric budget and accessibility as `error`, on the median of 3 runs.
- "**Decision: no runtime feature flags.**" (§12.3) "each plan's PRs merge into a `phase-N` integration branch". The schema stays at `db-schema-v1.2` (V7, P1C); P2 adds no migration (D17: partner requests are flags).
- §12.4: "The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted." "The `drugdb.eliooo.org` Caddy block is unchanged". "`INTELLIDRUGS_E2E` is never added here" (`deploy/docker-compose.yml`). §9.8: "the compose project `bddrug`; image names, the volume `dbdata`, the Caddy alias `bddrug-web`; the database name; the Java package and the ETL package" stay unchanged.
- Healthcare data (CLAUDE.md): never log PHI, notes, flag messages or emails. Route handlers are wrapped with `withRequestLog` (P1A Task 25); server actions log through `logRequest` with an `action:` route name; a log line never carries a query string or a form field.
- Every `NEW_COPY` string is imported, never retyped (`copy.test.ts`). Strings containing "low risk" or "no interactions" live in `lib/copy.ts` only (the paraphrase guard scans every other file).
- Commits: `type(scope): description`, scope one of `api`, `web`, `deploy`, `docs`; every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Test-first in every task.

## Review Focus

Five inputs the spec implies but its listed tests do not exercise, most likely to bite a reader first. Each is pinned by a test in the task named.

1. **A DDInter "text not found" note whose partner side is a substance carried only by unapproved products.** The pipeline writes the note against every product of the batch, so the public product page would otherwise print "Acetaminophen + Simvastatin" while Simvastatin's only product is unreviewed, naming a substance of an unapproved record (§7.4 visibility rule). The public stage card must list only pairs whose two DDInter entries are both carried by public products, and never print the raw `text_missing` note text. Pinned in Task 3 (`PublicProductsTest.textMissingPairsNameOnlyPublicSubstances`) and Task 4 (`ProductDetailApiIntegrationTest.privatePartnerNeverNamedInTheStageCard`).
2. **A search string with LIKE or regular-expression characters, surrounding spaces, mixed case, Bengali text, or an out-of-range page** (`%`, `_`, `\`, `.*`, `  NAPA `, `প্যারাসিটামল`, `page=-1`, `page=abc`, `page=99`). Search is a literal, case-insensitive substring; Bengali answers "No medicines match", never an error; a bad page index reads as 0 and an index past the cap shows the cap line, never an API 400 surfacing as a broken page. Pinned in Task 12 (`SearchApiIntegrationTest.wildcardsAreLiteralAndBengaliIsEmpty`) and Task 18 (`public-params.test.ts`, "search page index").
3. **A checker link with repeated, blank or more than 20 ids, or one unknown id** (shared links, edited URLs). The selection is de-duplicated, blanks dropped, the first 20 kept, and an unknown id dropped with the info banner "One medicine in the link no longer exists, so it was removed."; the page never answers the API's 400 or 404 as an error page. Pinned in Task 18 (`public-params.test.ts`, "checker ids") and Task 30 (`check-page.test.tsx`, "an unknown id is dropped with the info banner").
4. **`HERO_CONCEPT_ID` unset, blank, unknown, or the API down while the landing page renders.** The landing page is the front door: it must render with every band and without the lookup card, never a 500, and never a card for some other product. Pinned in Task 21 (`hero-card.test.tsx`, "no card when the hero id is unset, unknown or the API fails").
5. **Malformed paging and filter parameters on public pages** (`/products/{id}?ix=-1`, `?ix=abc`, `?ix=99999`, `/substances/{id}?page=x&severity=fatal`). They read as the first page or no filter; a page past the end shows the last real page's empty state, never a 500 and never an API 400. Pinned in Task 18 (`public-params.test.ts`, "ix, page and severity") and Task 27 (`substance-page.test.tsx`, "an unknown severity reads as All").

---

## Interfaces consumed from P1C

P1C is merged before P2 starts. Every Java name below is taken from the P1C plan (`docs/superpowers/plans/2026-10-15-intellidrugs-p1c-review-model.md`, the task named in the table) and "Before you start" greps each one on `main`. A grep that prints nothing means P1C did not merge as planned: stop and report it; do not rename at the call site. The web names P1C's plan does not yet spell out (its web tasks) are the ones the amended spec states (§3.4, §3.6, §5.13).

| Name | Where (P1C task) | Used by | Shape this plan relies on |
|---|---|---|---|
| `ReviewSql.statusOf`, `ReviewSql.LATEST_PUBLIC`, `ReviewSql.REMOVED_NOTE`, `ReviewSql.CURRENT_ITEM` | `$API/adapter/persistence/ReviewSql.java` (P3, on `main`) | every new adapter | as on `main` today (read above) |
| `PublicStatusGuardTest` | `api/src/test/java/com/niramoy/bddrug/` (P1C Task 9) | Task 15 runs it | scans `adapter/persistence` for `batch_item` reads (§11.3) |
| `SourceLinks.Source` | `$API/domain/SourceLinks.java` (P1C Task 4) | Tasks 3, 6, 7 | nested `public record Source(String url, String label, Instant fetchedAt)` |
| `SourceLinks.brand`, `SourceLinks.code`, `SourceLinks.pair` | `$API/domain/SourceLinks.java` (P1C Task 4) | Tasks 3, 6, 7 | `static Source brand(String conceptId, Instant fetchedAt)` ("DGDA register (OCL)"); `static Optional<Source> code(String system, String code, Instant fetchedAt)`; `static Optional<Source> pair(String interactionId)` (numeric ids only, `fetchedAt` null) |
| `PairContent.Content`, `PairContent.hash` | `$API/domain/PairContent.java` (P1C Task 5) | Tasks 2, 7, 8, 9, 11, 15 | `record Content(String severity, List<String> actions, String interaction, String management)` (sorts actions, cleans both texts); `static String hash(String a, String b, Content c)` |
| `PairReviewRule.Decision`, `PairReviewRule.PublicReview`, `PairReviewRule.publicReview`, `PairReviewRule.NOT_REVIEWED`, `PairReviewRule.REVIEWED` | `$API/domain/PairReviewRule.java` (P1C Task 5) | Tasks 2, 7, 8, 10, 11 | `record Decision(long id, String decision, String note, String contentHash, PairContent.Content content, Instant decidedAt, boolean mine)`; `record PublicReview(String state, Instant reviewedAt)` (`reviewed` or `not_reviewed`); `static PublicReview publicReview(List<Decision> decisions, String currentHash)` |
| `PairReviewReader.forCodes`, `PairReviewReader.key` | `$API/adapter/persistence/PairReviewReader.java` (P1C Task 7b) | Tasks 2, 7, 11 | `Mono<Map<String, List<PairReviewRule.Decision>>> forCodes(Collection<String> codes, String viewerEmail)`: one query over `ops.pair_review` for every pair whose two entries are both in `codes`, keyed `"{ddinterA}\|{ddinterB}"` (stored order); `viewerEmail` null makes every `mine` false; the email never leaves the method |
| `CheckQueryPort.CheckData.reviews`, `R2dbcCheckAdapter`'s `pairReviews`, `InteractionAlert`'s `ddinterA`, `ddinterB`, `pairReview` | P1C Task 9 | Tasks 8, 9 | `CheckData(products, ingredients, codesByBds, listedCodes, pairs, Map<String, List<PairReviewRule.Decision>> reviews)` with a five-argument secondary constructor; the adapter zips `pairReviews.forCodes(<loaded codes>, null)` with the pairs; Task 8 deletes `InteractionAlert` (its fields move to `CheckResult.Alert`) |
| `ApprovalRule.actsAsPharmacist`, `ApprovalRule.DISMISS`, the dismissal boundary | `$API/domain/ApprovalRule.java` (P1C Task 2) | Tasks 4, 15 | a counted `dismiss` is a review boundary: decisions at or before it no longer count, and the item's `review` is `pending` after it |
| `IngredientSummary.Code.source()`, `IngredientSummary.Entry.source()` | `$API/domain/IngredientSummary.java` (P1C Task 7a) | Task 4 | a `SourceLinks.Source` (nullable) as the last component |
| `IngredientSummaryReader.read(conceptId, bdcId, route)`, `IngredientSummaryReader.codesSql(String icd11FetchedAt)`, `IngredientSummaryReader.code(Readable)` | `$API/adapter/persistence/IngredientSummaryReader.java` (P1C Task 7a) | Tasks 4, 6 | `read` fills `source` on codes and entries; `codesSql` (package-private) selects `bds_id, system, code, route_scope, method, confidence, fetched_at` for `:ids` with the §5.6.6 "fetched on" rule; `code(r)` maps a row to an `IngredientSummary.Code` with its `SourceLinks.code` link |
| `ops.pair_review` table, `review_decision_dismiss_by_senior` | V7 (P1C Task 1, §7.8) | Tasks 2, 4, 7, 9, 11, 15, 38 | columns as §7.8; append-only (no UPDATE or DELETE); a `dismiss` decision is a senior's, with a note of 5–1000 characters |
| `FROM_DDINTER`, `PAIR_REVIEWED`, `PAIR_NOT_REVIEWED`, `PROMISE_SENIOR` | `web/lib/copy.ts` | Tasks 25, 27, 29, 33, 38 | strings as §3.6; `PAIR_REVIEWED` holds the `{date}` placeholder |
| `SourceLink` | `web/components/ui/SourceLink.tsx` | Tasks 24, 26, 27 | props `url`, `label`, `fetchedAt?: string \| null` (§3.4) |
| `PairReviewState` | `web/components/ui/PairReviewState.tsx` | Tasks 25, 27, 29 | props `state`, `at?`, `mine?`, `note?`, `surface` (§3.4) |
| `CodeChip` `source` prop | `web/components/ui/CodeChip.tsx` | Task 24 | `source?: {url, label, fetchedAt}` (§3.4) |
| `ReviewerRole` with `senior`, `ROLE_LABEL.senior`, `isReviewer(session)` accepting `senior` | `web/lib/reviewers.ts` | Tasks 19, 33 | §5.13: "`ROLE_LABEL.senior` = "Senior pharmacist"; `isReviewer()` accepts it"; `isReviewer` takes the session (a type guard), as on `main` today |
| The account menu's "Senior review" item | `web/components/Header.tsx` (P1C) | Task 19 keeps it | §6.2: ""Senior review" (seniors only, to `/review/pairs`)" |
| §1.7 P1C rows in `NEW_COPY_ROWS` | `web/lib/copy.ts` | Task 16 | P1C's plan rule: `NEW_COPY` is keyed by the §1.7 row text with `*(P1C)* ` removed (its eight rows include "Product page "With other approved medicines" (cross-batch, grouped by partner substance) and its paging") |

## Before you start

- [ ] Create the phase branch if it does not exist, then the plan branch (P1C has merged to `main`):

```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
git fetch origin
git switch main && git pull --ff-only
git switch phase-2 2>/dev/null || (git switch -c phase-2 origin/main && git push -u origin phase-2)
git pull --ff-only
git switch -c feature/intellidrugs-p2-public
```

Expected: the last command prints `Switched to a new branch 'feature/intellidrugs-p2-public'`. If `phase-2` already existed and is behind `main`, merge `origin/main` into it through a PR first (§12.3).

- [ ] Commit this plan on the branch, so the plan the commits cite is in the history:

```bash
git add docs/superpowers/plans/2026-10-15-intellidrugs-p2-public.md
git commit -m "docs(web): IntelliDrugs P2 implementation plan" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] Confirm the P0, P1A, P1B, P3 and P1C names this plan builds on (each command prints at least one line; alternations use `grep -E`):

```bash
grep -n "static String statusOf" api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java
grep -n "static final String LATEST_PUBLIC" api/src/main/java/com/niramoy/bddrug/adapter/persistence/ReviewSql.java
grep -rn "class PublicStatusGuardTest" api/src/test/java
grep -n "public record Source(String url, String label, Instant fetchedAt)" api/src/main/java/com/niramoy/bddrug/domain/SourceLinks.java
grep -nE "public static (Source brand|Optional<Source> code|Optional<Source> pair)\(" api/src/main/java/com/niramoy/bddrug/domain/SourceLinks.java
grep -nE "public record Content\(|public static String hash\(String a, String b, Content c\)" api/src/main/java/com/niramoy/bddrug/domain/PairContent.java
grep -nE "public record (Decision|PublicReview)\(|public static PublicReview publicReview\(" api/src/main/java/com/niramoy/bddrug/domain/PairReviewRule.java
grep -n "public Mono<Map<String, List<PairReviewRule.Decision>>> forCodes(Collection<String> codes, String viewerEmail)" api/src/main/java/com/niramoy/bddrug/adapter/persistence/PairReviewReader.java
grep -n "Map<String, List<PairReviewRule.Decision>> reviews" api/src/main/java/com/niramoy/bddrug/application/port/CheckQueryPort.java
grep -n "pairReviews.forCodes" api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java
grep -nE "public static boolean actsAsPharmacist|DISMISS = \"dismiss\"" api/src/main/java/com/niramoy/bddrug/domain/ApprovalRule.java
grep -n "SourceLinks.Source source" api/src/main/java/com/niramoy/bddrug/domain/IngredientSummary.java
grep -nE "static String codesSql\(String icd11FetchedAt\)|static Code code\(" api/src/main/java/com/niramoy/bddrug/adapter/persistence/IngredientSummaryReader.java
grep -n "private record Use(" api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java
grep -n "expectHidden(\"D-1\", \"Motigut\", \"pending\")" api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java
grep -n "CREATE TABLE ops.pair_review" db/migrations/V7__senior_review.sql
grep -n "public static final List<String> REASON_ORDER" api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java
grep -nE "export const (FROM_DDINTER|PAIR_REVIEWED|PAIR_NOT_REVIEWED|PROMISE_SENIOR)" web/lib/copy.ts
grep -n "export default function SourceLink" web/components/ui/SourceLink.tsx
grep -n "export default function PairReviewState" web/components/ui/PairReviewState.tsx
grep -n "source" web/components/ui/CodeChip.tsx
grep -n "senior" web/lib/reviewers.ts
grep -n "/review/pairs" web/components/Header.tsx
test -f web/e2e/senior.spec.ts && echo "P1C senior e2e present"
grep -n "export const API_STUB_SHAPE = false" web/components/learn/context.ts
grep -n "components/check/CheckerCombobox.tsx" web/scripts/check-client-islands.mjs
grep -n "export function fillNodes" web/lib/review-copy.ts
grep -n "export function allowAccountAction" web/lib/limits.ts
grep -n "partner: createWindowLimiter" web/lib/limits.ts
grep -n "export function withRequestLog" web/lib/request-log.ts
grep -n "export function legacyRedirect" web/lib/surface.ts
grep -n "const LEGACY_EXEMPT" web/tests/copy.test.ts
grep -n "export async function signInAs" web/e2e/session.ts
```

If a P1C line prints nothing, P1C did not merge as its plan says: stop and report which name is missing (the "Interfaces consumed from P1C" table lists every one). `private record Use(` must still print: P1C keeps `BatchPairs.Use` private and Task 10 widens it.

- [ ] Read spec §1.6 on `main` (a P0 docs PR may have changed items 1, 7, 10 or 11 after the production re-run). The checker and product-page tests below that quote pilot counts take `main`'s values:

```bash
git show origin/main:docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md | sed -n '/^### 1.6/,/^### 1.7/p' | sed -n '1,12p'
```

- [ ] Tooling and a green baseline (Docker must be running):

```bash
(cd web && npm ci)
(cd api && ./gradlew test --no-daemon)
(cd web && API_URL=http://api:8080 npm test && npm run build)
```

Expected: every test passes; the build ends with `client island check: … all on the §4.2 allowlist`. On a red baseline, stop and report it.

## File Structure

```
api/src/main/java/com/niramoy/bddrug/
  domain/HiddenRecord.java                       MODIFY §7.4 stubs: product {conceptId, tradeName, status, batchId}, substance {bdsId, preferredName}
  domain/PublicPairReviews.java                  CREATE pure helper: a page of pairs → P1C's PairReviewRule.PublicReview, keyed a|b
  domain/PublicProduct.java                      CREATE approved product detail (verification, provenance, summaries)
  domain/PublicProducts.java                     CREATE pure assembler; filters text-missing pairs to public entries
  domain/ClinicalDrugView.java                   CREATE P8 response
  domain/Substance.java                          MODIFY entries with counts and source links, public clinical drugs
  domain/SubstanceCode.java                      MODIFY sourceLink
  domain/SubstanceInteractions.java              CREATE P9 response
  domain/CheckResult.java                        MODIFY §7.4 extended CheckResult (summary, sides, noInteraction, notChecked)
  domain/InteractionAlert.java                   DELETE replaced by CheckResult.Alert
  domain/BatchPairs.java                         MODIFY Use and use() package-private (shared with PublicPairs)
  domain/PublicPairs.java                        CREATE P10: pairs with public products of every batch, grouped by partner substance
  domain/SearchResult.java                       CREATE P1–P4 response
  domain/SearchPage.java                         CREATE pure paging across substances, approved products and stubs
  domain/Suggest.java                            CREATE optimal-string-alignment distance and closest name
  domain/SuggestRow.java                         CREATE P16 row
  application/ProductQueryService.java           MODIFY stub shape, approved detail, P10, suggest
  application/SubstanceQueryService.java         MODIFY stub shape, P9
  application/ClinicalDrugQueryService.java      CREATE P8
  application/InteractionCheckService.java       MODIFY §6.7.2 counting rule, reasons, pairReview
  application/SearchQueryService.java            CREATE P1–P4 with the suggestion
  application/NameIndex.java                     CREATE in-memory public name index, 5-minute refresh, public re-check
  application/port/ProductQueryPort.java         MODIFY latestItem()
  application/port/ProductDetailPort.java        CREATE facts for the approved detail
  application/port/ProductInteractionsPort.java  CREATE facts for P10
  application/port/ClinicalDrugQueryPort.java    CREATE
  application/port/SubstanceQueryPort.java       MODIFY interactions page, public check
  application/port/CheckQueryPort.java           MODIFY entry names, interactionId, pair reviews
  application/port/SearchPort.java               CREATE
  application/port/NameIndexPort.java            CREATE
  application/port/SuggestPort.java              CREATE
  adapter/persistence/R2dbcProductAdapter.java          MODIFY latestItem()
  adapter/persistence/R2dbcProductDetailAdapter.java    CREATE
  adapter/persistence/R2dbcProductInteractionsAdapter.java CREATE
  adapter/persistence/R2dbcClinicalDrugAdapter.java     CREATE
  adapter/persistence/R2dbcSubstanceAdapter.java        MODIFY entries, clinical drugs, code source links (P1C's codesSql), P9
  adapter/persistence/R2dbcCheckAdapter.java            MODIFY names, interactionId (P1C already reads the pair reviews)
  adapter/persistence/R2dbcSearchAdapter.java           CREATE search, name index and suggest SQL
  presentation/ProductController.java            MODIFY /{id}/interactions, /suggest
  presentation/SubstanceController.java          MODIFY /{bdsId}/interactions
  presentation/ClinicalDrugController.java       CREATE /v1/clinical-drugs/{bdcId}
  presentation/SearchController.java             CREATE /v1/search
api/src/test/java/com/niramoy/bddrug/
  PublicPairReviewsTest, PublicProductsTest, PublicPairsTest, SearchPageTest, SuggestTest, NameIndexTest  CREATE unit tests
  InteractionCheckServiceTest.java, ProductQueryServiceTest.java, DdinterTextTest.java                   MODIFY
  PublicPairReviewsIntegrationTest, ProductDetailApiIntegrationTest, ClinicalDrugApiIntegrationTest,
  SubstanceInteractionsApiIntegrationTest, ProductInteractionsApiIntegrationTest,
  ProductInteractionsScaleIntegrationTest, SearchApiIntegrationTest, SuggestApiIntegrationTest,
  PublicVisibilityMatrixIntegrationTest                                                                  CREATE
  VisibilityApiIntegrationTest.java, CheckApiIntegrationTest.java, SubstanceApiIntegrationTest.java,
  PairQueueIntegrationTest.java (run only)                                                               MODIFY

web/
  lib/public-copy.ts                    CREATE Board P strings (client-safe)
  lib/copy.ts                           MODIFY P2 rows of NEW_COPY, PUBLIC_NEW typed view, Board P "low risk" legend
  lib/public-types.ts                   CREATE client-safe types of the §7.4 shapes
  lib/api.ts                            MODIFY §7.4 readers, partner request write; drop searchProducts and listLoadedProducts
  lib/public-params.ts                  CREATE q, page, ix, severity, checker ids (pure)
  lib/check-summary.ts                  CREATE §6.7.2 summary sentence, chips, announcements (pure, client-safe)
  lib/surface.ts                        MODIFY /?q= redirect
  lib/request-log.ts                    MODIFY /partners, /privacy templates
  lib/actions-core.ts                   MODIFY submitPartnerRequest, "other" flag target
  lib/public-actions.ts                 CREATE "use server": partnerRequestAction
  content/site.ts                       CREATE static register count and its source date
  content/check-scenarios.ts            CREATE the four pilot scenarios
  lib/check-scenarios.ts                CREATE server-only availableScenarios() (a page module may export only page fields)
  components/Header.tsx                 MODIFY §6.1 navigation, search bar, narrow Menu
  components/Footer.tsx                 MODIFY §6.1 footer
  components/public/*.tsx, *.module.css CREATE landing, hero card, search, product, substance, report form, sign-in parts
  components/check/*.tsx, check.module.css CREATE checker side column, results, CheckerCombobox island
  app/layout.tsx                        MODIFY pathname to the header; scroll padding
  app/page.tsx                          REWRITE landing
  app/search/page.tsx                   CREATE
  app/products/[id]/page.tsx            REWRITE stub and approved page
  app/products/[id]/not-found.tsx       CREATE "No medicine with the id {id}."
  app/substances/[id]/page.tsx          REWRITE
  app/check/page.tsx                    REWRITE
  app/check/suggest/route.ts            CREATE
  app/signin/page.tsx, SignInButton.tsx MODIFY Board P card, welcome states
  app/partners/page.tsx                 CREATE
  app/privacy/page.tsx                  CREATE
  components/learn/context.ts           MODIFY API_STUB_SHAPE = true (Task 1)
  components/FlagForm.tsx, components/badges.tsx, components/badges.module.css, app/legacy.module.css   DELETE (Task 36; components/Turnstile.tsx stays, the review pages use it)
  tests/flag-form.test.tsx, tests/api.test.ts                                     DELETE (Task 36; replaced by Tasks 26 and 17)
  tests/*.test.ts(x)                    CREATE and MODIFY (named in each task)
  e2e/public-1-flows.spec.ts, e2e/public-2-checker.spec.ts, e2e/public-3-a11y.spec.ts, e2e/public-helpers.ts   CREATE
  e2e/zx-public-pair-review.spec.ts     CREATE PAIR_REVIEWED / PAIR_NOT_REVIEWED on /check; runs after every spec that reads pair reviews
  e2e/lhci-public.sql                   CREATE CI-only approval before the public Lighthouse run (outside e2e/seed/ on purpose)
  lighthouserc.public.json              CREATE
docs/runbooks/partner-requests.md       CREATE
README.md                               MODIFY link to the partner-requests runbook
deploy/docker-compose.ci.yml            MODIFY HERO_CONCEPT_ID for the e2e web service
.github/workflows/ci.yml                MODIFY public Lighthouse run
```

---

# Part P2a: Public API (Tasks 1–15)

### Task 1: The §7.4 stubs (product and substance), and Learn's stub sentences turn on

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/HiddenRecord.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/ProductQueryPort.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcProductAdapter.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/SubstanceQueryService.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java`, `api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java`
- Modify: `web/lib/api.ts` (the two hidden types), `web/components/learn/context.ts`, `web/tests/product-page.test.tsx`, `web/tests/learn-parts.test.tsx`, `web/e2e/learn.spec.ts`

**Interfaces:**
- Consumes: `ReviewSql.REMOVED_NOTE` (package-private, same package as the adapter); `Product.reviewStatus()` (`ok`, `pending` or `issue`, from `ReviewSql.statusOf`, which already reads a removed latest item as `pending`).
- Produces:
  - `HiddenRecord.Product(String conceptId, String tradeName, String status, String batchId)` with `hidden: true`; `HiddenRecord.NOT_REVIEWED = "not_reviewed"`, `HiddenRecord.REMOVED = "removed"`.
  - `HiddenRecord.Substance(String bdsId, String preferredName)` with `hidden: true`.
  - `ProductQueryPort.LatestItem(String batchId, boolean removed)`; `Mono<LatestItem> latestItem(String conceptId)` (empty when the product is in no batch).
  - `public static HiddenRecord.Product ProductQueryService.stub(Product p, ProductQueryPort.LatestItem item)` (item may be null).
  - Web: `HiddenProduct = { conceptId: string; tradeName: string; status: "not_reviewed" | "removed"; batchId: string | null; hidden: true }`, `HiddenSubstance = { bdsId: string; preferredName: string; hidden: true }` in `lib/api.ts` (Task 17 moves them to `lib/public-types.ts`).
  - Web: `API_STUB_SHAPE = true`.

- [ ] **Step 1: Write the failing unit tests**

In `ProductQueryServiceTest.java`, give `FakePort` the new port method and replace `publicDetailHidesUnapprovedProducts` with the three tests below. Add `import java.util.Map;`.

```java
        static final Map<String, LatestItem> ITEMS = Map.of(
            "PEND", new LatestItem("B-2", false), "ISS", new LatestItem("B-2", false), "REM", new LatestItem("B-3", true));
        public Mono<LatestItem> latestItem(String id) { return Mono.justOrEmpty(ITEMS.get(id)); }
```

Add `case "REM" -> Mono.just(product(id, "pending"));` and `case "LOOSE" -> Mono.just(product(id, "pending"));` to `findByConceptId` (statusOf reads a removed latest item as `pending`; `LOOSE` is in no batch). Add `import com.niramoy.bddrug.application.port.ProductQueryPort.LatestItem;`.

```java
    @Test void publicDetailIsTheSection74StubForEveryNonPublicState() {
        ProductQueryService service = new ProductQueryService(new FakePort());
        StepVerifier.create(service.get("PEND", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("PEND", "Trade PEND", "not_reviewed", "B-2"))).verifyComplete();
        // an issue is never named in public: the stub says not_reviewed (§7.4: "no product response names issue")
        StepVerifier.create(service.get("ISS", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("ISS", "Trade ISS", "not_reviewed", "B-2"))).verifyComplete();
        StepVerifier.create(service.get("REM", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("REM", "Trade REM", "removed", "B-3"))).verifyComplete();
        StepVerifier.create(service.get("LOOSE", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("LOOSE", "Trade LOOSE", "not_reviewed", null))).verifyComplete();
    }

    @Test void approvedAndScopeAllDetailsAreNotStubs() {
        ProductQueryService service = new ProductQueryService(new FakePort());
        StepVerifier.create(service.get("OK", Scope.PUBLIC)).assertNext(v -> assertThat(v).isInstanceOf(Product.class)).verifyComplete();
        StepVerifier.create(service.get("PEND", Scope.ALL)).assertNext(v -> assertThat(v).isInstanceOf(Product.class)).verifyComplete();
        StepVerifier.create(service.get("none", Scope.PUBLIC)).verifyComplete();
    }

    @Test void theStubCarriesNoReviewStatusField() {
        assertThat(java.util.Arrays.stream(HiddenRecord.Product.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("conceptId", "tradeName", "status", "batchId");
        assertThat(java.util.Arrays.stream(HiddenRecord.Substance.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("bdsId", "preferredName");
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests ProductQueryServiceTest`
Expected: compilation FAILS (`cannot find symbol: class LatestItem`, `constructor Product in record Product cannot be applied`).

- [ ] **Step 3: Write the implementation**

`HiddenRecord.java` (whole file):

```java
package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * What a public read gets for a record that is not public (§7.4): never "not found" and never empty data, so "not yet
 * reviewed" is not mistaken for "nothing known". A product stub names its status ("not_reviewed", or "removed" when its
 * latest batch item left the batch file) and the batch it is in; a substance stub its name. The internal review status
 * is never sent, so no public response names "issue".
 */
public sealed interface HiddenRecord {
    String NOT_REVIEWED = "not_reviewed", REMOVED = "removed";

    /** batchId is null only for a product that is in no batch at all. */
    record Product(String conceptId, String tradeName, String status, String batchId) implements HiddenRecord {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
    record Substance(String bdsId, String preferredName) implements HiddenRecord {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
}
```

`ProductQueryPort.java`: add inside the interface:

```java
    /** The product's latest batch item, in ReviewSql.statusOf order; removed = marked "removed from batch file". */
    record LatestItem(String batchId, boolean removed) {}
    /** Empty when the product is in no batch. */
    Mono<LatestItem> latestItem(String conceptId);
```

`R2dbcProductAdapter.java`: add the method (same ordering as `ReviewSql.statusOf` and the `batch_item_concept_latest_idx` index):

```java
    @Override public Mono<LatestItem> latestItem(String conceptId) {
        return db.sql("SELECT batch_id, (note IS NOT DISTINCT FROM '" + ReviewSql.REMOVED_NOTE + "') AS removed FROM ops.batch_item " +
                      "WHERE concept_id = :c ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1")
            .bind("c", conceptId)
            .map(r -> new LatestItem(r.get("batch_id", String.class), Boolean.TRUE.equals(r.get("removed", Boolean.class))))
            .one();
    }
```

`ProductQueryService.java`: replace `get` and add `stub` (add `import java.util.Optional;` and `import com.niramoy.bddrug.application.port.ProductQueryPort.LatestItem;`):

```java
    /** The Product; under public scope a non-public product is the §7.4 stub; empty when unknown. */
    public Mono<Object> get(String conceptId, Scope scope) {
        return port.findByConceptId(conceptId).flatMap(p -> scope == Scope.PUBLIC && !"ok".equals(p.reviewStatus())
            ? port.latestItem(conceptId).map(Optional::of).defaultIfEmpty(Optional.empty()).map(item -> (Object) stub(p, item.orElse(null)))
            : Mono.just((Object) p));
    }

    /** §6.4: "removed" whatever the last decision when the latest item left the batch file; otherwise "not_reviewed". */
    public static HiddenRecord.Product stub(Product p, LatestItem item) {
        String status = item != null && item.removed() ? HiddenRecord.REMOVED : HiddenRecord.NOT_REVIEWED;
        return new HiddenRecord.Product(p.conceptId(), p.tradeName(), status, item == null ? null : item.batchId());
    }
```

`SubstanceQueryService.java`: the stub line becomes

```java
        return port.find(bdsId, pub).map(s -> pub && s.products().isEmpty()
            ? new HiddenRecord.Substance(s.bdsId(), s.preferredName()) : s);
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `cd api && ./gradlew test --no-daemon --tests ProductQueryServiceTest`
Expected: PASS.

- [ ] **Step 5: Update the visibility integration test (the stub fields; P1C's removed product)**

P1C (Task 9) already seeds the removed case in `VisibilityApiIntegrationTest`: D-1 (Motigut) is approved and then removed from its batch file in batch `V-rm`, and its `anApprovedThenRemovedProductIsNeverPublicOnAnyEndpoint` calls the three-argument `expectHidden("D-1", "Motigut", "pending")`. This step reuses that fixture (no new seed row, so the stats order, `inReviewProducts` and the `scope=all` loaded-list length that the class pins stay as they are) and moves the case with no batch item to X-NOMAP (Herbex), which no batch holds.

Replace `expectHidden` and `unapprovedProductDetailIsTheHiddenShape`:

```java
    private void expectHidden(String conceptId, String tradeName, String status, String batchId) {
        String body = str(web.get().uri("/v1/products/{id}", conceptId).exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.length()").isEqualTo(5)
            .jsonPath("$.data.conceptId").isEqualTo(conceptId)
            .jsonPath("$.data.tradeName").isEqualTo(tradeName)
            .jsonPath("$.data.status").isEqualTo(status)
            .jsonPath("$.data.batchId").value(v -> assertThat(v).isEqualTo(batchId))
            .jsonPath("$.data.hidden").isEqualTo(true)
            .returnResult().getResponseBody());
        assertThat(body).doesNotContain("reviewStatus", "\"issue\"", "genericContentRaw", "ingredients", "clinicalDrug", "company",
            "darNumber", "Test Pharma");
    }

    @Test void unapprovedProductDetailIsTheHiddenShape() {
        expectHidden("A-1", "Ecosprin", "not_reviewed", "V-1");
        expectHidden("C-EYE", "Optimycin", "not_reviewed", "V-1");      // issue: never named in public
        expectHidden("X-NOMAP", "Herbex", "not_reviewed", null);        // no batch item at all
        expectHidden("W-2", "Coumarol", "not_reviewed", "V-new");       // approved before, re-run in a newer batch
        expectHidden("D-1", "Motigut", "removed", "V-rm");              // approved, then removed from its batch file (P1C, PO D7)
    }
```

In P1C's `anApprovedThenRemovedProductIsNeverPublicOnAnyEndpoint`, the first line `expectHidden("D-1", "Motigut", "pending");` becomes `expectHidden("D-1", "Motigut", "removed", "V-rm");` (the stub now names the removal, §6.4).

In `substanceWithoutAnApprovedProductIsHidden`, change `.jsonPath("$.data.length()").isEqualTo(4)` to `isEqualTo(3)`, delete the `.jsonPath("$.data.reviewStatus").isEqualTo("pending")` line, and add `"reviewStatus"` to the `doesNotContain` list.

- [ ] **Step 6: Run the integration test**

Run: `cd api && ./gradlew test --no-daemon --tests VisibilityApiIntegrationTest`
Expected: PASS, including P1C's `anApprovedThenRemovedProductIsNeverPublicOnAnyEndpoint` with its four-argument call and `statsCountOnlyPublicProductsAndCarryNoClinicalData` and `scopeAllLoadedListHoldsEveryProduct` unchanged (this task adds no fixture).

- [ ] **Step 7: The web types and Learn's switch (§6.8 "Before P2")**

In `web/lib/api.ts`, replace the two hidden types:

```ts
/** §7.4 product stub (every non-public state); `batchId` is null only for a product in no batch. Never a review status. */
export type HiddenProduct = { conceptId: string; tradeName: string; status: "not_reviewed" | "removed"; batchId: string | null; hidden: true };
/** §7.4 substance stub. */
export type HiddenSubstance = { bdsId: string; preferredName: string; hidden: true };
```

In `web/tests/product-page.test.tsx`, the `hidden` fixture becomes
`const hidden = { conceptId: "H-1", tradeName: "Secretname", status: "not_reviewed", batchId: "0001-pilot", hidden: true };`.

In `web/components/learn/context.ts`, set `export const API_STUB_SHAPE = true;` and change the doc comment's first sentence to "True: GET /v1/products/{id} serves the §7.4 hidden stub … (P2 Task 1)."

In `web/e2e/learn.spec.ts`, the line `await expect(main(page)).not.toContainText("The API returns the same thing");` becomes

```ts
  // P2 serves the §7.4 stub (Task 1), so chapter 1 states the API's answer (§6.8 "Before P2").
  await expect(main(page)).toContainText('The API returns the same thing: the id, trade name, status "not_reviewed" and hidden: true.');
```

and the comment above it, "Before P2 (§6.8, Task 0): … are not rendered yet.", is deleted.

- [ ] **Step 8: Run the web tests that read the stub**

Run: `cd web && npx vitest run tests/learn-parts.test.tsx tests/learn-start.test.tsx tests/learn-partners.test.tsx tests/product-page.test.tsx`
Expected: PASS (`learn-parts.test.tsx` "API_STUB_SHAPE follows the API" now reads `String status` and no `reviewStatus` in `HiddenRecord.java`, and expects `true`).

- [ ] **Step 9: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/HiddenRecord.java \
  api/src/main/java/com/niramoy/bddrug/application/port/ProductQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcProductAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java \
  api/src/main/java/com/niramoy/bddrug/application/SubstanceQueryService.java \
  api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java \
  web/lib/api.ts web/components/learn/context.ts web/tests/product-page.test.tsx web/e2e/learn.spec.ts
git commit -m "feat(api): §7.4 product and substance stubs, removed records named as removed, Learn states the stub (§6.4, §6.8)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The public pair review state of a page of pairs (`PublicPairReviews`, over P1C's reader and rule)

P1C already owns the rule and the reader: `PairReviewRule.publicReview(decisions, currentHash)` gives the coarse public form (`reviewed` with its date, or `not_reviewed` with none, D53), and `PairReviewReader.forCodes(codes, viewerEmail)` reads every pair decision among a set of DDInter entries in one query (§7.7 "no N+1"). P2 adds no second reader of `ops.pair_review` and no second public record. It adds one pure helper that every P2 adapter and service uses the same way: key a page of pairs, hash each pair's current content with `PairContent`, and map P1C's decisions to `PairReviewRule.PublicReview`.

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/PublicPairReviews.java`
- Test: `api/src/test/java/com/niramoy/bddrug/PublicPairReviewsTest.java`, `api/src/test/java/com/niramoy/bddrug/PublicPairReviewsIntegrationTest.java`

**Interfaces:**
- Consumes (P1C, see the table above): `PairContent.Content(String severity, List<String> actions, String interaction, String management)`; `PairContent.hash(String a, String b, PairContent.Content c)`; `PairReviewRule.Decision(long id, String decision, String note, String contentHash, PairContent.Content content, Instant decidedAt, boolean mine)`; `PairReviewRule.PublicReview(String state, Instant reviewedAt)`; `PairReviewRule.publicReview(List<Decision>, String currentHash)`; `PairReviewRule.NOT_REVIEWED`; `PairReviewReader.forCodes(Collection<String> codes, String viewerEmail)` (keyed `"a|b"`, stored order); table `ops.pair_review`.
- Produces:
  - `PublicPairReviews.NONE` = `new PairReviewRule.PublicReview("not_reviewed", null)`.
  - `PublicPairReviews.Pair(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction, String management)` (stored order, `ddinterA < ddinterB`) with `String key()` = `ddinterA + "|" + ddinterB` and `String hash()` = `PairContent.hash(ddinterA, ddinterB, new PairContent.Content(severity, actions, interaction, management))`.
  - `static Set<String> codes(Collection<Pair> pairs)`: every entry of both sides (what `forCodes` needs, so a pair whose two entries are both in the set is read).
  - `static Map<String, PairReviewRule.PublicReview> of(Collection<Pair> pairs, Map<String, List<PairReviewRule.Decision>> decisions)`: one entry per distinct key, in input order; a pair with no decision maps to `NONE`.
  - The call shape every adapter uses: `pairReviews.forCodes(PublicPairReviews.codes(pairs), null).map(d -> PublicPairReviews.of(pairs, d))` (`null`: no viewer, so nothing is `mine`; notes and emails stay in P1C's reader).

- [ ] **Step 1: Write the failing unit test**

`PublicPairReviewsTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PairReviewRule.Decision;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.PublicPairReviews.Pair;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.4 P1C public rules (D53): reviewed with its date, or not_reviewed; changed and issue never leave the API. */
class PublicPairReviewsTest {
    static final Instant AT = Instant.parse("2026-10-16T05:20:00Z");
    static final Pair WA = new Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"), "Bleeding risk.", "Avoid.");
    static final Pair AW = new Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null);

    static Decision d(long id, String decision, String hash, int minutes) {
        return new Decision(id, decision, "issue".equals(decision) ? "a note" : "", hash, null, AT.plusSeconds(60L * minutes), false);
    }

    @Test void theHashIsPairContentsHashOfTheCleanedContent() {
        assertThat(WA.hash()).isEqualTo(PairContent.hash("DDInter1951", "DDInter20",
            new PairContent.Content("major", List.of("Avoid", "Monitor"), "Bleeding risk.", "Avoid.")));
        // DDInter placeholders hash like no text (PairContent cleans them)
        assertThat(new Pair("DDInter14", "DDInter1951", "moderate", null, "None", " - ").hash()).isEqualTo(AW.hash());
        assertThat(WA.key()).isEqualTo("DDInter1951|DDInter20");
    }

    @Test void codesHoldsBothSidesOfEveryPair() {
        assertThat(PublicPairReviews.codes(List.of(WA, AW))).containsExactlyInAnyOrder("DDInter1951", "DDInter20", "DDInter14");
        assertThat(PublicPairReviews.codes(List.of())).isEmpty();
    }

    @Test void reviewedOnlyForACurrentReviewAndNeverAnIssueOrAChange() {
        Map<String, List<Decision>> decisions = Map.of(
            WA.key(), List.of(d(1, "reviewed", WA.hash(), 0)),
            AW.key(), List.of(d(2, "reviewed", AW.hash(), 0), d(3, "issue", AW.hash(), 5)));
        Map<String, PairReviewRule.PublicReview> m = PublicPairReviews.of(List.of(WA, AW), decisions);
        assertThat(m.get(WA.key())).isEqualTo(new PairReviewRule.PublicReview("reviewed", AT));
        assertThat(m.get(AW.key())).as("an issue is never named in public").isEqualTo(PublicPairReviews.NONE);
        // reviewed, then DDInter changed the pair: the stored hash is stale
        assertThat(PublicPairReviews.of(List.of(WA), Map.of(WA.key(), List.of(d(1, "reviewed", "0".repeat(64), 0)))).get(WA.key()))
            .isEqualTo(PublicPairReviews.NONE);
    }

    @Test void aPairWithNoDecisionIsNotReviewedAndARepeatIsKeptOnce() {
        Map<String, PairReviewRule.PublicReview> m = PublicPairReviews.of(List.of(WA, WA, AW), Map.of());
        assertThat(m).containsOnlyKeys(WA.key(), AW.key());
        assertThat(m.values()).containsOnly(PublicPairReviews.NONE);
        assertThat(PublicPairReviews.NONE).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
    }

    @Test void thePublicFormCarriesNoNoteRoleOrEmail() {
        assertThat(java.util.Arrays.stream(PairReviewRule.PublicReview.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("state", "reviewedAt");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests PublicPairReviewsTest`
Expected: compilation FAILS (`cannot find symbol: class PublicPairReviews`).

- [ ] **Step 3: Write the helper**

`PublicPairReviews.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.*;

/**
 * The coarse public pair review state (§7.4 P1C public rules, D53) of a page of pairs. P1C's PairReviewRule decides it
 * and P1C's PairReviewReader reads ops.pair_review; this helper only keys the pairs, hashes each one's current content
 * with PairContent and maps the decisions. Pure. Never a gate: the pair and its text are served whatever this says (G3).
 */
public final class PublicPairReviews {
    private PublicPairReviews() {}

    public static final PairReviewRule.PublicReview NONE = new PairReviewRule.PublicReview(PairReviewRule.NOT_REVIEWED, null);

    /** A stored DDInter pair (ddinterA < ddinterB, as curated.ddinter_pair and ops.pair_review store it) with its content. */
    public record Pair(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction,
                       String management) {
        public String key() { return ddinterA + "|" + ddinterB; }
        public String hash() {
            return PairContent.hash(ddinterA, ddinterB, new PairContent.Content(severity, actions, interaction, management));
        }
    }

    /** Both entries of every pair: PairReviewReader.forCodes reads each pair whose two entries are in this set. */
    public static Set<String> codes(Collection<Pair> pairs) {
        Set<String> out = new TreeSet<>();
        for (Pair p : pairs) { out.add(p.ddinterA()); out.add(p.ddinterB()); }
        return out;
    }

    /** One public review per distinct pair, in input order; decisions are P1C's, keyed "a|b". */
    public static Map<String, PairReviewRule.PublicReview> of(Collection<Pair> pairs, Map<String, List<PairReviewRule.Decision>> decisions) {
        Map<String, PairReviewRule.PublicReview> out = new LinkedHashMap<>();
        for (Pair p : pairs)
            if (!out.containsKey(p.key()))
                out.put(p.key(), PairReviewRule.publicReview(decisions.getOrDefault(p.key(), List.of()), p.hash()));
        return out;
    }
}
```

- [ ] **Step 4: Run the unit test**

Run: `cd api && ./gradlew test --no-daemon --tests PublicPairReviewsTest`
Expected: PASS.

- [ ] **Step 5: Write the integration test (P1C's reader, with no viewer, on real rows)**

`PublicPairReviewsIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.adapter.persistence.PairReviewReader;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.PublicPairReviews.Pair;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/** The call shape every P2 adapter uses: P1C's one query, then the public form of all four states (§7.4). */
@Testcontainers
@SpringBootTest
class PublicPairReviewsIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    // PilotSeed: DDInter1951+DDInter20 major {Monitor,Avoid} with text IA-1; DDInter1951+DDInter351 moderate {Monitor} IA-2;
    // DDInter14+DDInter1951 moderate, no text; DDInter1951+DDInter999 minor, no text.
    static final Pair WA = new Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"),
        "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
        "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.");
    static final Pair WC = new Pair("DDInter1951", "DDInter351", "moderate", List.of("Monitor"),
        "Chloramphenicol may increase the serum concentration of warfarin.", "Monitor INR.");
    static final Pair AW = new Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null);
    static final Pair WH = new Pair("DDInter1951", "DDInter999", "minor", List.of(), null, null);

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at) VALUES
             ('DDInter1951','DDInter20','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:20:00Z'),
             ('DDInter1951','DDInter351','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:21:00Z'),
             ('DDInter14','DDInter1951','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:22:00Z'),
             ('DDInter14','DDInter1951','issue','The text contradicts the severity', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:23:00Z');
            """.formatted(WA.hash(), "0".repeat(64), AW.hash(), AW.hash()));
    }

    @Autowired PairReviewReader reader;

    private Map<String, PairReviewRule.PublicReview> read(List<Pair> pairs) {
        return reader.forCodes(PublicPairReviews.codes(pairs), null).map(d -> PublicPairReviews.of(pairs, d)).block();
    }

    @Test void eachStateHasItsPublicForm() {
        Map<String, PairReviewRule.PublicReview> m = read(List.of(WA, WC, AW, WH));
        assertThat(m).containsOnlyKeys(WA.key(), WC.key(), AW.key(), WH.key());
        assertThat(m.get(WA.key())).isEqualTo(new PairReviewRule.PublicReview("reviewed", Instant.parse("2026-10-16T05:20:00Z")));
        assertThat(m.get(WC.key())).as("reviewed, then DDInter changed it: changed").isEqualTo(PublicPairReviews.NONE);
        assertThat(m.get(AW.key())).as("reviewed, then a pair issue: issue").isEqualTo(PublicPairReviews.NONE);
        assertThat(m.get(WH.key())).as("never reviewed").isEqualTo(PublicPairReviews.NONE);
    }

    @Test void noViewerMeansNothingIsMine() {
        assertThat(reader.forCodes(PublicPairReviews.codes(List.of(WA, AW)), null).block().values().stream()
            .flatMap(List::stream)).noneMatch(PairReviewRule.Decision::mine);
    }

    @Test void noPairsNoRows() {
        assertThat(read(List.of())).isEmpty();
    }
}
```

- [ ] **Step 6: Run both tests**

Run: `cd api && ./gradlew test --no-daemon --tests PublicPairReviewsTest --tests PublicPairReviewsIntegrationTest`
Expected: PASS (the integration test passes once the unit test does: it exercises P1C's reader, which is on `main`).

- [ ] **Step 7: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/PublicPairReviews.java \
  api/src/test/java/com/niramoy/bddrug/PublicPairReviewsTest.java api/src/test/java/com/niramoy/bddrug/PublicPairReviewsIntegrationTest.java
git commit -m "feat(api): public pair review state of a page of pairs, over P1C's PairReviewReader and PairReviewRule (§7.4, D53)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The approved product page model (`PublicProduct`, `PublicProducts`)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/PublicProduct.java`
- Create: `api/src/main/java/com/niramoy/bddrug/domain/PublicProducts.java`
- Test: `api/src/test/java/com/niramoy/bddrug/PublicProductsTest.java`

**Interfaces:**
- Consumes: `Product`, `ClinicalDrug`, `ClinicalIngredient` (and its `DdinterRef`), `IngredientSummary`, `StageNotes.parse(stage, status, note)` and `StageNotes.TEXT_MISSING`, P1C's `SourceLinks.Source(String url, String label, Instant fetchedAt)` and `SourceLinks.brand(String conceptId, Instant fetchedAt)` ("DGDA register (OCL)").
- Produces:
  - `PublicProduct(String conceptId, String darNumber, String tradeName, String company, String dosageForm, String genericContentRaw, String qualityFlag, List<Ingredient> ingredients, String parseStatus, String parseNote, Clinical clinicalDrug, Verification verification, Provenance provenance, int otherBrandsCount)` with nested `Clinical(bdcId, displayName, doseForm, route, List<ClinicalItem> ingredients)`, `ClinicalItem(bdsId, name, strengthValue, strengthUnit, perValue, perUnit, List<ClinicalIngredient.DdinterRef> ddinter, IngredientSummary summary)`, `Verification(String status, String role, Instant approvedAt)`, `Provenance(String batchId, Instant extractedAt, String source, SourceLinks.Source sourceLink, List<Stage> stages)`, `Stage(String stage, String status, List<StageNotes.Note> notes, List<TextMissing> textMissing)`, `TextMissing(String ddinterA, String nameA, String ddinterB, String nameB, String severity)`.
  - `PublicProducts.Facts(String batchId, Instant extractedAt, Instant approvedAt, Instant oclFetchedAt, List<StageRow> stages, Map<String, String> entryNames, Map<String, String> pairSeverity, Set<String> publicEntryIds, int otherBrandsCount, List<IngredientSummary> summaries)`; `PublicProducts.StageRow(String stage, String status, String note, List<String[]> textMissing)`; `static PublicProduct assemble(Product p, Facts f)`; `PublicProducts.SOURCE = "DGDA register"`, `PublicProducts.STAGES`.

- [ ] **Step 1: Write the failing test**

`PublicProductsTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.*;
import com.niramoy.bddrug.domain.PublicProducts.Facts;
import com.niramoy.bddrug.domain.PublicProducts.StageRow;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;

class PublicProductsTest {
    static final Instant EXTRACTED = Instant.parse("2026-10-11T21:28:00Z"), APPROVED = Instant.parse("2026-10-14T05:20:00Z"),
        FETCHED = Instant.parse("2026-10-11T21:00:00Z");
    static final ClinicalDrug CD = new ClinicalDrug("BDC-000001", "Acetaminophen 500 mg tablet", "Tablet", "systemic",
        List.of(new ClinicalIngredient("BDS-000001", "Acetaminophen", new BigDecimal("500"), "mg", null, null,
            List.of(new ClinicalIngredient.DdinterRef("DDInter14", "Acetaminophen", "systemic", false)))));
    static final Product NAPA = new Product("186-0030-006--napa", "186-0030-006", "Napa", "Beximco Pharmaceuticals Ltd.", "Tablet",
        "Paracetamol 500 mg", null, List.of(new Ingredient("XM5DJ7", "Paracetamol")), "parsed", null, CD, "ok");
    static final IngredientSummary SUMMARY = new IngredientSummary("BDS-000001", "Acetaminophen", "Paracetamol 500 mg",
        new BigDecimal("500"), "mg", null, null, List.of(), List.of(), new IngredientSummary.Coverage("full", ""),
        new IngredientSummary.Ddinter(List.of(), List.of()));

    static Facts facts(List<StageRow> stages, Set<String> publicIds) {
        return new Facts("0001-pilot", EXTRACTED, APPROVED, FETCHED, stages,
            Map.of("DDInter14", "Acetaminophen", "DDInter1675", "Simvastatin", "DDInter1951", "Warfarin"),
            Map.of("DDInter14|DDInter1675", "unknown", "DDInter14|DDInter1951", "moderate"), publicIds, 0, List.of(SUMMARY));
    }

    static final List<StageRow> STAGES = List.of(
        new StageRow("ddinter", "warn", "DDInter text not found for DDInter14/DDInter1675; DDInter text not found for DDInter14/DDInter1951",
            List.of(new String[]{"DDInter14", "DDInter1675"}, new String[]{"DDInter14", "DDInter1951"})),
        new StageRow("dgda", "ok", "", List.of()), new StageRow("clinical", "ok", "", List.of()), new StageRow("substances", "ok", "", List.of()));

    @Test void verificationSaysPharmacistWhateverTheApproverRole() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14")));
        assertThat(p.verification()).isEqualTo(new PublicProduct.Verification("approved", "pharmacist", APPROVED));
    }

    @Test void provenanceNamesTheBatchStampAndTheDgdaSource() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14")));
        assertThat(p.provenance().batchId()).isEqualTo("0001-pilot");
        assertThat(p.provenance().extractedAt()).isEqualTo(EXTRACTED);
        assertThat(p.provenance().source()).isEqualTo("DGDA register");
        assertThat(p.provenance().sourceLink()).isEqualTo(SourceLinks.brand("186-0030-006--napa", FETCHED));
        assertThat(p.provenance().sourceLink().label()).isEqualTo("DGDA register (OCL)");
    }

    @Test void stagesComeInPipelineOrder() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14")));
        assertThat(p.provenance().stages()).extracting(PublicProduct.Stage::stage).containsExactly("dgda", "substances", "clinical", "ddinter");
    }

    // Review Focus 1: the pipeline wrote the note against every product of the batch; only pairs whose two entries are
    // both carried by public products may be named in public (§7.4 visibility rule).
    @Test void textMissingPairsNameOnlyPublicSubstances() {
        PublicProduct.Stage ddinter = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14", "DDInter1951")))
            .provenance().stages().get(3);
        assertThat(ddinter.textMissing()).containsExactly(
            new PublicProduct.TextMissing("DDInter14", "Acetaminophen", "DDInter1951", "Warfarin", "moderate"));
        // the raw "text not found" notes are never sent: their ids could name a private partner
        assertThat(ddinter.notes()).noneMatch(n -> StageNotes.TEXT_MISSING.equals(n.kind()));
        assertThat(ddinter.status()).isEqualTo("warn");
        // with no public partner at all, the list is empty and nothing names Simvastatin or Warfarin
        PublicProduct.Stage none = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14"))).provenance().stages().get(3);
        assertThat(none.textMissing()).isEmpty();
        assertThat(none.toString()).doesNotContain("Simvastatin", "Warfarin", "DDInter1675", "DDInter1951");
    }

    @Test void otherNotesAreKeptAsParsed() {
        List<StageRow> stages = List.of(new StageRow("ddinter", "warn", "DDInter DDInter14 matched by name only", List.of()));
        assertThat(PublicProducts.assemble(NAPA, facts(stages, Set.of())).provenance().stages().get(0).notes())
            .extracting(StageNotes.Note::kind).containsExactly(StageNotes.NAME_ONLY);
    }

    @Test void eachClinicalIngredientCarriesItsSummary() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of()));
        assertThat(p.clinicalDrug().bdcId()).isEqualTo("BDC-000001");
        assertThat(p.clinicalDrug().ingredients()).hasSize(1);
        assertThat(p.clinicalDrug().ingredients().get(0).summary()).isEqualTo(SUMMARY);
        assertThat(p.clinicalDrug().ingredients().get(0).ddinter()).extracting(ClinicalIngredient.DdinterRef::ddinterId).containsExactly("DDInter14");
    }

    @Test void noClinicalDrugStaysNull() {
        Product bare = new Product("x", "1", "X", "Co", "Tablet", "X 5 mg", null, List.of(), "parsed", null, null, "ok");
        assertThat(PublicProducts.assemble(bare, facts(List.of(), Set.of())).clinicalDrug()).isNull();
    }

    @Test void neverSendsTheInternalReviewStatus() {
        assertThat(java.util.Arrays.stream(PublicProduct.class.getRecordComponents()).map(c -> c.getName()))
            .doesNotContain("reviewStatus").contains("verification", "provenance", "otherBrandsCount");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests PublicProductsTest`
Expected: compilation FAILS (`cannot find symbol: class PublicProducts`).

- [ ] **Step 3: Write the records and the assembler**

`PublicProduct.java`:

```java
package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * GET /v1/products/{id} for a public product (§7.4 rows P5/P6/P7/P15): the Product fields without the internal review
 * status, the verification line, where the record comes from (with the DGDA source link, §6.5), each clinical
 * ingredient's IngredientSummary (codes with their source links, coverage, chosen entries and counts) and the number of
 * other public brands of the clinical drug.
 */
public record PublicProduct(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                            String genericContentRaw, String qualityFlag, List<Ingredient> ingredients, String parseStatus,
                            String parseNote, Clinical clinicalDrug, Verification verification, Provenance provenance,
                            int otherBrandsCount) {
    public record Clinical(String bdcId, String displayName, String doseForm, String route, List<ClinicalItem> ingredients) {}
    public record ClinicalItem(String bdsId, String name, BigDecimal strengthValue, String strengthUnit, BigDecimal perValue,
                               String perUnit, List<ClinicalIngredient.DdinterRef> ddinter, IngredientSummary summary) {}
    /** role is always "pharmacist": a senior's approval reads "Approved by a pharmacist" in public (D49). */
    public record Verification(String status, String role, Instant approvedAt) {}
    public record Provenance(String batchId, Instant extractedAt, String source, SourceLinks.Source sourceLink, List<Stage> stages) {}
    public record Stage(String stage, String status, List<StageNotes.Note> notes, List<TextMissing> textMissing) {}
    public record TextMissing(String ddinterA, String nameA, String ddinterB, String nameB, String severity) {}
}
```

`PublicProducts.java`:

```java
package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.*;

/**
 * Assembles the public product detail (§7.4) from facts the adapter reads. Pure. The one rule it adds: a DDInter
 * "text not found" pair is named only when both its entries are carried by public products, and the raw text_missing
 * notes are dropped, because the pipeline wrote them against every product of the batch, approved or not (§7.4
 * visibility rule; Review Focus 1).
 */
public final class PublicProducts {
    private PublicProducts() {}

    public static final String SOURCE = "DGDA register";
    public static final List<String> STAGES = List.of("dgda", "substances", "clinical", "ddinter");

    /** textMissing: evidence.text_missing as [a, b] pairs (the ddinter stage only). */
    public record StageRow(String stage, String status, String note, List<String[]> textMissing) {}

    /**
     * pairSeverity is keyed "a|b" with a < b as stored; publicEntryIds holds every DDInter id chosen-or-not of a substance
     * that a public product carries; summaries follow the DGDA ingredient rows.
     */
    public record Facts(String batchId, Instant extractedAt, Instant approvedAt, Instant oclFetchedAt, List<StageRow> stages,
                        Map<String, String> entryNames, Map<String, String> pairSeverity, Set<String> publicEntryIds,
                        int otherBrandsCount, List<IngredientSummary> summaries) {}

    public static PublicProduct assemble(Product p, Facts f) {
        return new PublicProduct(p.conceptId(), p.darNumber(), p.tradeName(), p.company(), p.dosageForm(), p.genericContentRaw(),
            p.qualityFlag(), p.ingredients(), p.parseStatus(), p.parseNote(), clinical(p.clinicalDrug(), f.summaries()),
            new PublicProduct.Verification("approved", "pharmacist", f.approvedAt()),
            new PublicProduct.Provenance(f.batchId(), f.extractedAt(), SOURCE, SourceLinks.brand(p.conceptId(), f.oclFetchedAt()),
                stages(f)),
            f.otherBrandsCount());
    }

    private static PublicProduct.Clinical clinical(ClinicalDrug cd, List<IngredientSummary> summaries) {
        if (cd == null) return null;
        Map<String, IngredientSummary> byBds = new HashMap<>();
        for (IngredientSummary s : summaries) if (s.bdsId() != null) byBds.putIfAbsent(s.bdsId(), s);
        return new PublicProduct.Clinical(cd.bdcId(), cd.displayName(), cd.doseForm(), cd.route(), cd.ingredients().stream()
            .map(i -> new PublicProduct.ClinicalItem(i.bdsId(), i.name(), i.strengthValue(), i.strengthUnit(), i.perValue(),
                i.perUnit(), i.ddinter(), byBds.get(i.bdsId())))
            .toList());
    }

    private static List<PublicProduct.Stage> stages(Facts f) {
        List<PublicProduct.Stage> out = new ArrayList<>();
        for (String stage : STAGES)
            for (StageRow s : f.stages()) {
                if (!stage.equals(s.stage())) continue;
                List<StageNotes.Note> notes = StageNotes.parse(s.stage(), s.status(), s.note()).stream()
                    .filter(n -> !StageNotes.TEXT_MISSING.equals(n.kind())).toList();
                List<PublicProduct.TextMissing> missing = new ArrayList<>();
                for (String[] m : s.textMissing()) {
                    if (!f.publicEntryIds().contains(m[0]) || !f.publicEntryIds().contains(m[1])) continue;
                    String a = m[0].compareTo(m[1]) < 0 ? m[0] : m[1], b = a.equals(m[0]) ? m[1] : m[0];
                    missing.add(new PublicProduct.TextMissing(m[0], f.entryNames().getOrDefault(m[0], m[0]), m[1],
                        f.entryNames().getOrDefault(m[1], m[1]), f.pairSeverity().get(a + "|" + b)));
                }
                out.add(new PublicProduct.Stage(s.stage(), s.status(), List.copyOf(notes), List.copyOf(missing)));
            }
        return List.copyOf(out);
    }
}
```

- [ ] **Step 4: Run the test**

Run: `cd api && ./gradlew test --no-daemon --tests PublicProductsTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/PublicProduct.java api/src/main/java/com/niramoy/bddrug/domain/PublicProducts.java \
  api/src/test/java/com/niramoy/bddrug/PublicProductsTest.java
git commit -m "feat(api): public product detail model; text-missing pairs name public entries only (§7.4, Review Focus 1)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The approved product detail endpoint (`GET /v1/products/{id}`, P5/P6/P7/P15)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/application/port/ProductDetailPort.java`
- Create: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcProductDetailAdapter.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/PublicProducts.java` (`approvedAt`), `api/src/test/java/com/niramoy/bddrug/PublicProductsTest.java`
- Modify: `api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java` (constructor), `api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java` (`approvedProductDetailIsFull`)
- Test: `api/src/test/java/com/niramoy/bddrug/ProductDetailApiIntegrationTest.java`

**Interfaces:**
- Consumes: Task 1 `LatestItem`, Task 3 `PublicProducts.Facts`, `PublicProducts.assemble`; `IngredientSummaryReader.read(String conceptId, String bdcId, String route)` (P1B, with P1C's sources); `ReviewSql.LATEST_PUBLIC`; `ReviewDecision(long id, String decision, String note, String reviewerEmail, String reviewerRole, Instant decidedAt)`; P1C's `ApprovalRule.OK`, `ApprovalRule.DISMISS`, `ApprovalRule.actsAsPharmacist(String role)`.
- Produces: `static Instant PublicProducts.approvedAt(List<ReviewDecision> latestItemDecisions, Instant extractedAt)` (the newest ok by a pharmacist or senior among the latest item's decisions after its stamp and after the latest dismissal since it; the stamp when none counts, a carried approval, §8.3.1 item 8); `ProductDetailPort.facts(String conceptId, String bdcId, String route) : Mono<PublicProducts.Facts>`; `ProductQueryService(ProductQueryPort port, ProductDetailPort details)`; public `GET /v1/products/{id}` answers a `PublicProduct` for a public product. `scope=all` keeps answering the internal `Product`.

- [ ] **Step 1: Write the failing tests**

Append to `PublicProductsTest.java` (add `import java.time.Instant;` if missing):

```java
    static ReviewDecision rd(long id, String decision, String role, Instant at) {
        return new ReviewDecision(id, decision, null, null, role, at);
    }

    // Spec gap 10, §5.2 (D57): the newest counted pharmacist or senior ok of the latest item; a dismissal is a boundary.
    @Test void theVerificationDateIsTheNewestCountedOkOfTheLatestItem() {
        Instant t1 = EXTRACTED.plusSeconds(3600), t2 = t1.plusSeconds(600), t3 = t2.plusSeconds(600), t4 = t3.plusSeconds(600);
        // a pharmacist ok, an issue, a senior's dismissal, then a new ok: the new ok dates it
        assertThat(PublicProducts.approvedAt(List.of(rd(1, "ok", "pharmacist", t1), rd(2, "issue", "pharmacist", t2),
            rd(3, "dismiss", "senior", t3), rd(4, "ok", "pharmacist", t4)), EXTRACTED)).isEqualTo(t4);
        // any input order; an engineer's later ok never dates it; a senior's ok does (D49)
        assertThat(PublicProducts.approvedAt(List.of(rd(5, "ok", "engineer", t4), rd(4, "ok", "senior", t2)), EXTRACTED)).isEqualTo(t2);
        // an ok before the dismissal never dates the line
        assertThat(PublicProducts.approvedAt(List.of(rd(1, "ok", "pharmacist", t1), rd(2, "issue", "pharmacist", t2),
            rd(3, "dismiss", "senior", t3)), EXTRACTED)).isEqualTo(EXTRACTED);
        // an ok before the run stamp is an earlier run's: a carried approval counts at the stamp (§8.3.1 item 8)
        assertThat(PublicProducts.approvedAt(List.of(rd(1, "ok", "pharmacist", EXTRACTED.minusSeconds(60))), EXTRACTED)).isEqualTo(EXTRACTED);
        assertThat(PublicProducts.approvedAt(List.of(), null)).isNull();
    }
```

`ProductDetailApiIntegrationTest.java`:

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
 * §7.4 P5/P6/P7/P15 against PilotSeed. N-1 (Napa), W-1 (Warin), C-CAP (Chloramex) and N-2 (Ace) are approved in batch
 * D-1; A-1 (Ecosprin) and N-3 (Fast) are pending there. Napa's ddinter stage notes text missing with warfarin (public) and
 * with aspirin (A-1 only: never public). W-1 also has an older item in D-0 with a later ok; C-CAP was approved, reported,
 * dismissed by a senior and approved again. Every row is seeded here, so no test depends on another's order.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductDetailApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO raw.ocl_concept (source, concept_id, payload, fetched_at) VALUES ('DGDA-Drugs','N-1','{}','2026-10-11T21:00:00Z');
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('N-2','012','Ace','Square','Tablet','Paracetamol 500 mg','BDC-000006','parsed'),
                     ('N-3','013','Fast','Acme','Tablet','Paracetamol 500 mg','BDC-000006','parsed');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('D-0', 1, '2026-10-10T21:27:00Z'), ('D-1', 6, '2026-10-11T21:27:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('D-0','DGDA-Drugs','W-1','ok','2026-10-10T21:28:00Z'),
             ('D-1','DGDA-Drugs','N-1','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','W-1','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','A-1','pending','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','C-CAP','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','N-2','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','N-3','pending','2026-10-11T21:28:00Z');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('D-1','N-1','ok','','eng@example.org','engineer','2026-10-14T04:00:00Z'),
             ('D-1','N-1','ok','','senior@example.org','senior','2026-10-14T05:20:00Z'),
             ('D-1','W-1','ok','','pharm@example.org','pharmacist','2026-10-14T06:00:00Z'),
             ('D-0','W-1','ok','','pharm@example.org','pharmacist','2026-10-15T09:00:00Z'),
             ('D-1','C-CAP','ok','','pharm@example.org','pharmacist','2026-10-13T08:00:00Z'),
             ('D-1','C-CAP','issue','Strength looks wrong','pharm@example.org','pharmacist','2026-10-13T08:30:00Z'),
             ('D-1','C-CAP','dismiss','The strength matches the register','senior@example.org','senior','2026-10-13T09:00:00Z'),
             ('D-1','C-CAP','ok','','pharm@example.org','pharmacist','2026-10-13T10:00:00Z');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
             ('D-1','N-1','dgda','ok','','{}'), ('D-1','N-1','substances','ok','','{}'), ('D-1','N-1','clinical','ok','','{}'),
             ('D-1','N-1','ddinter','warn','DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter14/DDInter20',
              '{"text_missing": [["DDInter14","DDInter1951"],["DDInter14","DDInter20"]]}');
            """);
    }

    @Autowired WebTestClient web;

    private String napa() {
        return new String(web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
    }

    @Test void verificationProvenanceAndOtherBrands() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.reviewStatus").doesNotExist()
            .jsonPath("$.data.verification.status").isEqualTo("approved")
            .jsonPath("$.data.verification.role").isEqualTo("pharmacist")              // a senior's approval reads as a pharmacist's (D49)
            .jsonPath("$.data.verification.approvedAt").isEqualTo("2026-10-14T05:20:00Z")   // the latest counting ok, never the engineer's
            .jsonPath("$.data.provenance.batchId").isEqualTo("D-1")
            .jsonPath("$.data.provenance.extractedAt").isEqualTo("2026-10-11T21:28:00Z")
            .jsonPath("$.data.provenance.source").isEqualTo("DGDA register")
            .jsonPath("$.data.provenance.sourceLink.url").value(u -> assertThat((String) u).endsWith("/concepts/N-1/"))
            .jsonPath("$.data.provenance.stages.length()").isEqualTo(4)
            .jsonPath("$.data.provenance.stages[0].stage").isEqualTo("dgda")
            .jsonPath("$.data.provenance.stages[3].stage").isEqualTo("ddinter")
            .jsonPath("$.data.otherBrandsCount").isEqualTo(1)                         // N-2 (approved); never N-3 (pending)
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.bdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.coverage.coverage").isEqualTo("full")
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.ddinter.chosen[0].ddinterId").isEqualTo("DDInter14");
    }

    @Test void codesCarryTheirSourceLinks() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.codes[?(@.system == 'RXCUI')].source.url")
            .value(u -> assertThat(u.toString()).contains("RxNav/search?searchBy=RXCUI&searchTerm=161"));
    }

    // Review Focus 1
    @Test void privatePartnerNeverNamedInTheStageCard() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.provenance.stages[3].status").isEqualTo("warn")
            .jsonPath("$.data.provenance.stages[3].textMissing.length()").isEqualTo(1)
            .jsonPath("$.data.provenance.stages[3].textMissing[0].nameB").isEqualTo("Warfarin")
            .jsonPath("$.data.provenance.stages[3].textMissing[0].severity").isEqualTo("moderate");
        assertThat(napa()).doesNotContain("DDInter20", "Acetylsalicylic acid", "Aspirin", "Ecosprin", "text_missing");
    }

    // Spec gap 10: only the latest item's decisions date the line; a later ok on an older batch's item never does
    @Test void theVerificationDateComesFromTheLatestItemOnly() {
        web.get().uri("/v1/products/W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.provenance.batchId").isEqualTo("D-1")
            .jsonPath("$.data.verification.approvedAt").isEqualTo("2026-10-14T06:00:00Z");
    }

    // §5.2, D57: approved, reported, dismissed by a senior, approved again: the new approval dates it, and nothing of the
    // issue or the dismissal is served
    @Test void afterADismissalTheNewApprovalDatesTheLine() {
        String body = new String(web.get().uri("/v1/products/C-CAP").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.verification.status").isEqualTo("approved")
            .jsonPath("$.data.verification.approvedAt").isEqualTo("2026-10-13T10:00:00Z")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("dismiss", "Strength looks wrong", "The strength matches the register", "@example.org");
    }

    @Test void scopeAllStillAnswersTheInternalProduct() {
        internal(web).get().uri("/v1/products/A-1?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.reviewStatus").isEqualTo("pending")
            .jsonPath("$.data.verification").doesNotExist();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests PublicProductsTest --tests ProductDetailApiIntegrationTest`
Expected: compilation FAILS (`cannot find symbol: method approvedAt`); once it compiles, `ProductDetailApiIntegrationTest` FAILS (`$.data.verification.status` not found: the public detail is still the internal `Product`).

- [ ] **Step 3: Write the port and the adapter**

`ProductDetailPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.PublicProducts;
import reactor.core.publisher.Mono;

/** What the public product detail needs beyond the product row (§7.4 P5/P6/P7/P15). bdcId and route may be null. */
public interface ProductDetailPort {
    Mono<PublicProducts.Facts> facts(String conceptId, String bdcId, String route);
}
```

`R2dbcProductDetailAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.application.port.ProductDetailPort;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PublicProducts;
import com.niramoy.bddrug.domain.PublicProducts.Facts;
import com.niramoy.bddrug.domain.PublicProducts.StageRow;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Facts for an approved product's public detail. Public status is read only through ReviewSql.LATEST_PUBLIC (§7.4); the
 * latest item is read in ReviewSql.statusOf order, and only its decisions date the verification line
 * (PublicProducts.approvedAt). Eight queries, none per row. Decision notes and emails are never selected.
 */
@Component
public class R2dbcProductDetailAdapter implements ProductDetailPort {
    private static final ObjectMapper JSON = new ObjectMapper();
    private record Latest(String batchId, Instant extractedAt) {}

    private final DatabaseClient db;
    private final IngredientSummaryReader summaries;
    public R2dbcProductDetailAdapter(DatabaseClient db, IngredientSummaryReader summaries) {
        this.db = db;
        this.summaries = summaries;
    }

    @Override public Mono<Facts> facts(String conceptId, String bdcId, String route) {
        Mono<Latest> latest = db.sql("SELECT batch_id, extracted_at FROM ops.batch_item WHERE concept_id = :c " +
                                     "ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1")
            .bind("c", conceptId)
            .map(r -> new Latest(r.get("batch_id", String.class), instant(r.get("extracted_at", OffsetDateTime.class))))
            .one().defaultIfEmpty(new Latest(null, null)).cache();
        // The counting approval of the latest item: after its stamp and after the latest dismissal (§5.2, D57); pharmacists
        // and seniors publish, an engineer's ok never does (G3, D49). Decisions on other batches' items never count.
        Mono<Optional<Instant>> approvedAt = latest.flatMap(l -> l.batchId() == null ? Mono.just(Optional.<Instant>empty())
            : decisions(l.batchId(), conceptId).map(ds -> Optional.ofNullable(PublicProducts.approvedAt(ds, l.extractedAt()))));
        Mono<Optional<Instant>> fetched = db.sql("SELECT max(fetched_at) AS at FROM raw.ocl_concept WHERE concept_id = :c")
            .bind("c", conceptId).map(r -> Optional.ofNullable(instant(r.get("at", OffsetDateTime.class)))).one();
        Mono<Integer> others = bdcId == null ? Mono.just(0) : db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                "SELECT count(*) AS n FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id " +
                "WHERE l.pub AND bp.bdc_id = :bdc AND bp.concept_id <> :c")
            .bind("bdc", bdcId).bind("c", conceptId).map(r -> r.get("n", Long.class).intValue()).one();
        Mono<List<IngredientSummary>> ingredients = summaries.read(conceptId, bdcId, route);
        return Mono.zip(latest, approvedAt, fetched, others, ingredients).flatMap(t -> {
            Latest l = t.getT1();
            Mono<List<StageRow>> stages = l.batchId() == null ? Mono.just(List.of()) : stages(l.batchId(), conceptId);
            return stages.flatMap(rows -> {
                Set<String> ids = new TreeSet<>();
                for (StageRow s : rows) for (String[] m : s.textMissing()) { ids.add(m[0]); ids.add(m[1]); }
                return Mono.zip(names(ids), severities(ids), publicIds(ids)).map(u -> new Facts(l.batchId(), l.extractedAt(),
                    t.getT2().orElse(null), t.getT3().orElse(null), rows, u.getT1(), u.getT2(), u.getT3(), t.getT4(), t.getT5()));
            });
        });
    }

    private Mono<List<ReviewDecision>> decisions(String batchId, String conceptId) {
        return db.sql("SELECT id, decision, reviewer_role, decided_at FROM ops.review_decision WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
                r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant()))
            .all().collectList();
    }

    private Mono<List<StageRow>> stages(String batchId, String conceptId) {
        return db.sql("SELECT stage, status, note, evidence::text AS evidence FROM ops.stage_result WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new StageRow(r.get("stage", String.class), r.get("status", String.class), r.get("note", String.class),
                "ddinter".equals(r.get("stage", String.class)) ? textMissing(r.get("evidence", String.class)) : List.of()))
            .all().collectList();
    }

    /** evidence.text_missing as [[a, b], …]; empty when absent or unreadable. */
    static List<String[]> textMissing(String evidence) {
        List<String[]> out = new ArrayList<>();
        if (evidence == null) return out;
        try {
            for (JsonNode pair : JSON.readTree(evidence).path("text_missing"))
                if (pair.size() == 2) out.add(new String[]{pair.get(0).asText(), pair.get(1).asText()});
        } catch (Exception e) {
            return List.of();
        }
        return out;
    }

    private Mono<Map<String, String>> names(Set<String> ids) {
        if (ids.isEmpty()) return Mono.just(Map.of());
        return db.sql("SELECT ddinter_id, name FROM curated.ddinter_drug WHERE ddinter_id = ANY(:ids)")
            .bind("ids", ids.toArray(String[]::new))
            .map(r -> Map.entry(r.get("ddinter_id", String.class), r.get("name", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    private Mono<Map<String, String>> severities(Set<String> ids) {
        if (ids.isEmpty()) return Mono.just(Map.of());
        String[] arr = ids.toArray(String[]::new);
        return db.sql("SELECT ddinter_a, ddinter_b, severity FROM curated.ddinter_pair WHERE ddinter_a = ANY(:ids) AND ddinter_b = ANY(:ids)")
            .bind("ids", arr)
            .map(r -> Map.entry(r.get("ddinter_a", String.class) + "|" + r.get("ddinter_b", String.class), r.get("severity", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** The given DDInter ids that belong to a substance a public product carries (§7.4: a substance is public then). */
    private Mono<Set<String>> publicIds(Set<String> ids) {
        if (ids.isEmpty()) return Mono.just(Set.of());
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " + """
                SELECT DISTINCT c.code
                FROM curated.brand_product bp
                JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                JOIN curated.substance_code c ON c.bds_id = x.bds_id AND c.system = 'DDINTER'
                WHERE c.code = ANY(:ids)""")
            .bind("ids", ids.toArray(String[]::new))
            .map(r -> r.get("code", String.class)).all().collect(java.util.stream.Collectors.toSet());
    }

    private static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
}
```

`ReviewSql.LATEST_PUBLIC` is the CTE `latest AS (…)` without `WITH`, so every query that uses it starts `"WITH " + ReviewSql.LATEST_PUBLIC + " "`.

`PublicProducts.java`: add (imports `java.util.Comparator`; `ApprovalRule` and `ReviewDecision` are in the same package):

```java
    /**
     * The verification line's date (§6.5, spec gap 10): the newest ok by a pharmacist or senior pharmacist among the latest
     * item's counted decisions: those after the item's run stamp and after the latest dismissal since it (§5.2, D57, the
     * boundary ApprovalRule applies). When none counts, the record is public through an approval carried to this stamp
     * (§8.3.1 item 8), so the stamp dates it. Pass only the latest item's decisions: other batches' items never date it.
     */
    public static Instant approvedAt(List<ReviewDecision> latestItemDecisions, Instant extractedAt) {
        List<ReviewDecision> since = latestItemDecisions.stream()
            .filter(d -> extractedAt == null || d.decidedAt().isAfter(extractedAt))
            .sorted(Comparator.comparing(ReviewDecision::decidedAt).thenComparingLong(ReviewDecision::id)).toList();
        int start = 0;
        for (int i = 0; i < since.size(); i++) if (ApprovalRule.DISMISS.equals(since.get(i).decision())) start = i + 1;
        Instant at = null;
        for (ReviewDecision d : since.subList(start, since.size()))
            if (ApprovalRule.OK.equals(d.decision()) && ApprovalRule.actsAsPharmacist(d.reviewerRole())) at = d.decidedAt();
        return at != null ? at : extractedAt;
    }
```

- [ ] **Step 4: Wire the service**

`ProductQueryService.java`: add the field and constructor parameter, and send a public product's detail:

```java
    private final ProductQueryPort port;
    private final ProductDetailPort details;
    public ProductQueryService(ProductQueryPort port, ProductDetailPort details) {
        this.port = port;
        this.details = details;
    }

    /** Public: the PublicProduct, or the §7.4 stub; scope=all: the internal Product. Empty when unknown. */
    public Mono<Object> get(String conceptId, Scope scope) {
        return port.findByConceptId(conceptId).flatMap(p -> {
            if (scope != Scope.PUBLIC) return Mono.just((Object) p);
            if (!"ok".equals(p.reviewStatus()))
                return port.latestItem(conceptId).map(Optional::of).defaultIfEmpty(Optional.empty())
                    .map(item -> (Object) stub(p, item.orElse(null)));
            ClinicalDrug cd = p.clinicalDrug();
            return details.facts(conceptId, cd == null ? null : cd.bdcId(), cd == null ? null : cd.route())
                .map(f -> (Object) PublicProducts.assemble(p, f));
        });
    }
```

Add the imports `com.niramoy.bddrug.application.port.ProductDetailPort`, `com.niramoy.bddrug.domain.ClinicalDrug`, `com.niramoy.bddrug.domain.PublicProducts`.

In `ProductQueryServiceTest.java`, every `new ProductQueryService(port)` becomes `new ProductQueryService(port, DETAILS)` with

```java
    static final ProductDetailPort DETAILS = (c, bdc, route) -> Mono.just(new PublicProducts.Facts("B-1", null, null, null,
        java.util.List.of(), java.util.Map.of(), java.util.Map.of(), java.util.Set.of(), 0, java.util.List.of()));
```

and `approvedAndScopeAllDetailsAreNotStubs` asserts `isInstanceOf(PublicProduct.class)` for `OK` under public scope and `isInstanceOf(Product.class)` for `PEND` under `Scope.ALL` (imports `ProductDetailPort`, `PublicProduct`, `PublicProducts`).

In `VisibilityApiIntegrationTest.approvedProductDetailIsFull`, replace `.jsonPath("$.data.reviewStatus").isEqualTo("ok")` with `.jsonPath("$.data.verification.status").isEqualTo("approved").jsonPath("$.data.reviewStatus").doesNotExist()`.

- [ ] **Step 5: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests PublicProductsTest --tests ProductDetailApiIntegrationTest --tests ProductQueryServiceTest --tests VisibilityApiIntegrationTest --tests ProductApiIntegrationTest`
Expected: PASS. (`ProductApiIntegrationTest` reads details with `scope=all` and the token, which still answers the internal `Product`; if one of its tests reads a public detail and asserts `reviewStatus`, change that assertion to `verification.status` = `approved`.)

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/application/port/ProductDetailPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcProductDetailAdapter.java \
  api/src/main/java/com/niramoy/bddrug/domain/PublicProducts.java api/src/test/java/com/niramoy/bddrug/PublicProductsTest.java \
  api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java \
  api/src/test/java/com/niramoy/bddrug/ProductDetailApiIntegrationTest.java api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java \
  api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java api/src/test/java/com/niramoy/bddrug/ProductApiIntegrationTest.java
git commit -m "feat(api): approved product detail with verification, provenance, summaries and source links (§7.4 P5–P7, P15)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Clinical drugs (`GET /v1/clinical-drugs/{bdcId}`, P8)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/ClinicalDrugView.java`
- Create: `api/src/main/java/com/niramoy/bddrug/application/port/ClinicalDrugQueryPort.java`
- Create: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcClinicalDrugAdapter.java`
- Create: `api/src/main/java/com/niramoy/bddrug/application/ClinicalDrugQueryService.java`
- Create: `api/src/main/java/com/niramoy/bddrug/presentation/ClinicalDrugController.java`
- Test: `api/src/test/java/com/niramoy/bddrug/ClinicalDrugApiIntegrationTest.java`

**Interfaces:**
- Consumes: `ReviewSql.LATEST_PUBLIC`; `ClinicalDrugReader.plain(BigDecimal)` (package-private, same package); `InternalAuth.scope(scope, token)`; `NotFoundException(field, message)`.
- Produces: `ClinicalDrugView(String bdcId, String displayName, String doseForm, String route, List<Ingredient> ingredients, List<ProductRef> products)` with `Ingredient(String bdsId, String name, BigDecimal strengthValue, String strengthUnit, BigDecimal perValue, String perUnit)` and `ProductRef(String conceptId, String tradeName, String company, String darNumber)`; `GET /v1/clinical-drugs/{bdcId}` (404 `NOT_FOUND`, field `bdcId`, unless a public product maps to it; `scope=all` with the token lists every product).

- [ ] **Step 1: Write the failing integration test**

`ClinicalDrugApiIntegrationTest.java`:

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

/** §7.4 P8 ("Other brands of …"). W-1 is approved, W-2 pending (both BDC-000001); A-1 pending (BDC-000002). */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ClinicalDrugApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('C-1', 3, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('C-1','DGDA-Drugs','W-1','ok', now()), ('C-1','DGDA-Drugs','W-2','pending', now()), ('C-1','DGDA-Drugs','A-1','pending', now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void publicListsPublicBrandsOnly() {
        String body = new String(web.get().uri("/v1/clinical-drugs/BDC-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.bdcId").isEqualTo("BDC-000001")
            .jsonPath("$.data.displayName").isEqualTo("Warfarin 5 mg tablet")
            .jsonPath("$.data.doseForm").isEqualTo("Tablet")
            .jsonPath("$.data.route").isEqualTo("systemic")
            .jsonPath("$.data.ingredients.length()").isEqualTo(1)
            .jsonPath("$.data.ingredients[0].bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.ingredients[0].name").isEqualTo("Warfarin")
            .jsonPath("$.data.ingredients[0].strengthValue").isEqualTo(5)
            .jsonPath("$.data.ingredients[0].strengthUnit").isEqualTo("mg")
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Warin")
            .jsonPath("$.data.products[0].company").isEqualTo("Test Pharma")
            .jsonPath("$.data.products[0].darNumber").isEqualTo("001")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("Coumarol", "W-2");
    }

    @Test void noPublicProductMeansNotFound() {
        web.get().uri("/v1/clinical-drugs/BDC-000002").exchange().expectStatus().isNotFound().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND")
            .jsonPath("$.errors[0].field").isEqualTo("bdcId")
            .jsonPath("$.data").doesNotExist();
        web.get().uri("/v1/clinical-drugs/BDC-999999").exchange().expectStatus().isNotFound();
    }

    @Test void scopeAllNeedsTheTokenAndListsEveryBrand() {
        web.get().uri("/v1/clinical-drugs/BDC-000002?scope=all").exchange().expectStatus().isUnauthorized();
        internal(web).get().uri("/v1/clinical-drugs/BDC-000001?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Coumarol")
            .jsonPath("$.data.products[1].tradeName").isEqualTo("Warin");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests ClinicalDrugApiIntegrationTest`
Expected: FAIL (404 on `/v1/clinical-drugs/BDC-000001`: no handler).

- [ ] **Step 3: Write the record, port, adapter, service and controller**

`ClinicalDrugView.java`:

```java
package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.util.List;

/** §7.4 P8: a clinical drug, its ingredients and the brands that map to it (public brands only under public scope). */
public record ClinicalDrugView(String bdcId, String displayName, String doseForm, String route, List<Ingredient> ingredients,
                               List<ProductRef> products) {
    public record Ingredient(String bdsId, String name, BigDecimal strengthValue, String strengthUnit, BigDecimal perValue, String perUnit) {}
    public record ProductRef(String conceptId, String tradeName, String company, String darNumber) {}
}
```

`ClinicalDrugQueryPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import reactor.core.publisher.Mono;

public interface ClinicalDrugQueryPort {
    /** Empty when unknown. publicOnly keeps only public products in products(). */
    Mono<ClinicalDrugView> find(String bdcId, boolean publicOnly);
}
```

`R2dbcClinicalDrugAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ClinicalDrugQueryPort;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;

/** P8 reads. Public status only through ReviewSql.LATEST_PUBLIC (§7.4, PO D7). */
@Component
public class R2dbcClinicalDrugAdapter implements ClinicalDrugQueryPort {
    private record Head(String bdcId, String displayName, String doseForm, String route) {}
    private final DatabaseClient db;
    public R2dbcClinicalDrugAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<ClinicalDrugView> find(String bdcId, boolean publicOnly) {
        Mono<Head> head = db.sql("SELECT bdc_id, display_name, dose_form, route FROM curated.clinical_drug WHERE bdc_id = :id")
            .bind("id", bdcId)
            .map(r -> new Head(r.get("bdc_id", String.class), r.get("display_name", String.class), r.get("dose_form", String.class),
                r.get("route", String.class)))
            .one();
        return head.flatMap(h -> Mono.zip(
            db.sql("""
                    SELECT i.bds_id, s.preferred_name, i.strength_value, i.strength_unit, i.per_value, i.per_unit
                    FROM curated.clinical_drug_ingredient i JOIN curated.substance s ON s.bds_id = i.bds_id
                    WHERE i.bdc_id = :id ORDER BY lower(s.preferred_name), i.bds_id""")
                .bind("id", bdcId)
                .map(r -> new ClinicalDrugView.Ingredient(r.get("bds_id", String.class), r.get("preferred_name", String.class),
                    ClinicalDrugReader.plain(r.get("strength_value", BigDecimal.class)), r.get("strength_unit", String.class),
                    ClinicalDrugReader.plain(r.get("per_value", BigDecimal.class)), r.get("per_unit", String.class)))
                .all().collectList(),
            db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                   "SELECT bp.concept_id, bp.trade_name, bp.company, bp.dar_number FROM curated.brand_product bp " +
                   "LEFT JOIN latest l ON l.concept_id = bp.concept_id " +
                   "WHERE bp.bdc_id = :id AND (NOT :pub OR coalesce(l.pub, false)) " +
                   "ORDER BY lower(bp.trade_name), bp.concept_id")
                .bind("id", bdcId).bind("pub", publicOnly)
                .map(r -> new ClinicalDrugView.ProductRef(r.get("concept_id", String.class), r.get("trade_name", String.class),
                    r.get("company", String.class), r.get("dar_number", String.class)))
                .all().collectList())
            .map(t -> new ClinicalDrugView(h.bdcId(), h.displayName(), h.doseForm(), h.route(), t.getT1(), t.getT2())));
    }
}
```

`ClinicalDrugQueryService.java`:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ClinicalDrugQueryPort;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import com.niramoy.bddrug.domain.Scope;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/** §7.4 P8: under public scope the whole response is 404 unless at least one public product maps to the clinical drug. */
@Service
public class ClinicalDrugQueryService {
    private final ClinicalDrugQueryPort port;
    public ClinicalDrugQueryService(ClinicalDrugQueryPort port) { this.port = port; }

    public Mono<ClinicalDrugView> get(String bdcId, Scope scope) {
        boolean pub = scope == Scope.PUBLIC;
        return port.find(bdcId, pub)
            .filter(v -> !pub || !v.products().isEmpty())
            .switchIfEmpty(Mono.error(() -> new NotFoundException("bdcId", "Clinical drug not found")));
    }
}
```

`ClinicalDrugController.java`:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ClinicalDrugQueryService;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** GET /v1/clinical-drugs/{bdcId} (§7.4 P8). Public scope by default; scope=all needs the token. */
@RestController
@RequestMapping("/v1/clinical-drugs")
public class ClinicalDrugController {
    private final ClinicalDrugQueryService service;
    private final InternalAuth auth;
    public ClinicalDrugController(ClinicalDrugQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping("/{bdcId}")
    public Mono<ApiResponse<ClinicalDrugView>> get(@PathVariable String bdcId, @RequestParam(required = false) String scope,
                                                   @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.get(bdcId, auth.scope(scope, token)).map(ApiResponse::ok);
    }
}
```

- [ ] **Step 4: Run the test**

Run: `cd api && ./gradlew test --no-daemon --tests ClinicalDrugApiIntegrationTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/ClinicalDrugView.java \
  api/src/main/java/com/niramoy/bddrug/application/port/ClinicalDrugQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcClinicalDrugAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/ClinicalDrugQueryService.java \
  api/src/main/java/com/niramoy/bddrug/presentation/ClinicalDrugController.java \
  api/src/test/java/com/niramoy/bddrug/ClinicalDrugApiIntegrationTest.java
git commit -m "feat(api): GET /v1/clinical-drugs/{bdcId}, public brands only, 404 without one (§7.4 P8)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The public substance detail (entries, source links, public clinical drugs, private partners never named)

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/Substance.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/SubstanceCode.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSubstanceAdapter.java`
- Test: `api/src/test/java/com/niramoy/bddrug/SubstancePublicApiIntegrationTest.java`

**Interfaces:**
- Consumes: `SourceLinks.code(String system, String code, Instant fetchedAt) : Optional<SourceLinks.Source>` (P1C Task 4); P1C Task 7a's `IngredientSummaryReader.codesSql(String icd11FetchedAt)` and `IngredientSummaryReader.code(Readable) : IngredientSummary.Code` (package-private, same package as `R2dbcSubstanceAdapter`), the one §5.6.6 "fetched on" rule the desk, the senior substance page and the product page already use; `ReviewSql.LATEST_PUBLIC`; `IngredientSummary.Counts(int major, int moderate, int minor, int unknown, int total)`.
- Produces:
  - `SubstanceCode(String system, String code, String routeScope, String source, String method, double confidence, SourceLinks.Source sourceLink)` (`source` stays the provenance text such as `rxnav`; `sourceLink` is the §5.6.6 link, null when the code fails its pattern).
  - `Substance(…, List<Entry> entries, List<ClinicalDrugRef> clinicalDrugs)` appended after `foods`; `Substance.Entry(String ddinterId, String name, String routeScope, IngredientSummary.Counts counts, int diseaseCount, int foodCount, SourceLinks.Source sourceLink)`; `Substance.ClinicalDrugRef(String bdcId, String displayName)`.
  - `R2dbcSubstanceAdapter.ICD11_FETCHED_AT`: the ICD-11 "fetched on" subquery for a substance page (the DGDA register's latest fetch of any product carrying the XM code), the same text as P1C's senior substance page.
  - Under public scope, `interactions[].partnerBdsId` is null unless the partner substance is public (§7.4 P9 rule, applied to the existing list too).

- [ ] **Step 1: Write the failing integration test**

`SubstancePublicApiIntegrationTest.java`:

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
 * §6.6 data under public scope. Approved: W-1 (Warfarin), C-CAP (Chloramphenicol capsule), N-1 (Napa). Pending: A-1
 * (Aspirin), C-EYE. RxNav and OCL fetch times are seeded so the "fetched on" dates are known (§5.6.6).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SubstancePublicApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('S-1', 5, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('S-1','DGDA-Drugs','W-1','ok', now()), ('S-1','DGDA-Drugs','C-CAP','ok', now()), ('S-1','DGDA-Drugs','N-1','ok', now()),
             ('S-1','DGDA-Drugs','A-1','pending', now()), ('S-1','DGDA-Drugs','C-EYE','pending', now());
            INSERT INTO raw.ocl_concept (source, concept_id, payload, fetched_at) VALUES ('DGDA-Drugs','N-1','{}','2026-10-11T21:00:00Z');
            INSERT INTO raw.http_snapshot (source, request_key, status, body, fetched_at) VALUES
             ('rxnav','GET /REST/rxcui/161/properties.json',200,'{}','2026-10-11T22:00:00Z'),
             ('rxnav','GET /REST/rxcui/161/allProperties.json?prop=codes',200,'{}','2026-10-11T22:05:00Z');
            UPDATE curated.ddinter_drug SET fetched_at = '2026-10-12T01:00:00Z' WHERE ddinter_id = 'DDInter14';
            """);
    }

    @Autowired WebTestClient web;

    @Test void codesCarryTheirSourceLinksAndFetchTimes() {
        web.get().uri("/v1/substances/BDS-000005").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.codes[?(@.system == 'RXCUI')].sourceLink.label").isEqualTo("RxNav")
            .jsonPath("$.data.codes[?(@.system == 'RXCUI')].sourceLink.fetchedAt").isEqualTo("2026-10-11T22:00:00Z")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].sourceLink.fetchedAt").isEqualTo("2026-10-11T22:05:00Z")
            .jsonPath("$.data.codes[?(@.system == 'ICD11_XM')].sourceLink.fetchedAt").isEqualTo("2026-10-11T21:00:00Z")
            .jsonPath("$.data.codes[?(@.system == 'DDINTER')].sourceLink.fetchedAt").isEqualTo("2026-10-12T01:00:00Z")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].source").isEqualTo("rxnav");
    }

    @Test void everyEntryHasItsCountsAndRoute() {
        web.get().uri("/v1/substances/BDS-000003").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.entries.length()").isEqualTo(3)
            .jsonPath("$.data.entries[0].ddinterId").isEqualTo("DDInter351")
            .jsonPath("$.data.entries[0].routeScope").isEqualTo("systemic")
            .jsonPath("$.data.entries[0].counts.moderate").isEqualTo(1)
            .jsonPath("$.data.entries[0].counts.total").isEqualTo(1)
            .jsonPath("$.data.entries[1].ddinterId").isEqualTo("DDInter352")
            .jsonPath("$.data.entries[1].counts.total").isEqualTo(0)
            .jsonPath("$.data.entries[2].routeScope").isEqualTo("otic");
        web.get().uri("/v1/substances/BDS-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.entries[0].diseaseCount").isEqualTo(2)
            .jsonPath("$.data.entries[0].foodCount").isEqualTo(1);
    }

    @Test void clinicalDrugsArePublicOnes() {
        String body = new String(web.get().uri("/v1/substances/BDS-000003").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.clinicalDrugs.length()").isEqualTo(1)
            .jsonPath("$.data.clinicalDrugs[0].bdcId").isEqualTo("BDC-000004")
            .jsonPath("$.data.clinicalDrugs[0].displayName").isEqualTo("Chloramphenicol 250 mg capsule")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("BDC-000003", "eye drops", "Optimycin");
    }

    @Test void aPrivatePartnerSubstanceIsNeverLinked() {
        // Warfarin's pair with Acetylsalicylic acid: Aspirin's only product A-1 is pending, so BDS-000002 is not public.
        web.get().uri("/v1/substances/BDS-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.interactions[0].partnerName").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.interactions[0].partnerBdsId").value(v -> assertThat(v).isNull())
            .jsonPath("$.data.interactions[1].partnerName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.interactions[1].partnerBdsId").isEqualTo("BDS-000005");
        // with the token and scope=all the partner is linked as before
        internal(web).get().uri("/v1/substances/BDS-000001?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.interactions[0].partnerBdsId").isEqualTo("BDS-000002");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests SubstancePublicApiIntegrationTest`
Expected: FAIL (`No value at JSON path "$.data.entries"`).

- [ ] **Step 3: Extend the records**

`SubstanceCode.java`:

```java
package com.niramoy.bddrug.domain;

/** source is where the code came from (dgda-ocl, rxnav, ddinter2); sourceLink is its public page (§5.6.6), null when the code fails its pattern. */
public record SubstanceCode(String system, String code, String routeScope, String source, String method, double confidence,
                            SourceLinks.Source sourceLink) {}
```

`Substance.java`: the record header becomes

```java
public record Substance(String bdsId, String preferredName, List<SubstanceName> names, List<SubstanceCode> codes,
                        Coverage coverage, List<ProductRef> products, List<Interaction> interactions,
                        List<Disease> diseases, List<Food> foods, List<Entry> entries, List<ClinicalDrugRef> clinicalDrugs) {
```

and add, next to the other nested records:

```java
    /** One DDInter entry of the substance with its severity counts (both sides of every stored pair) and its link (§6.6). */
    public record Entry(String ddinterId, String name, String routeScope, IngredientSummary.Counts counts, int diseaseCount,
                        int foodCount, SourceLinks.Source sourceLink) {}
    /** A clinical drug that contains the substance (public ones only under public scope). */
    public record ClinicalDrugRef(String bdcId, String displayName) {}
```

- [ ] **Step 4: Reuse P1C's "fetched on" rule for the codes**

No new reader. P1C's `IngredientSummaryReader.codesSql(icd11FetchedAt)` already holds the §5.6.6 rule (RxCUI from its RxNav properties snapshot; ATC, DrugBank and SNOMED CT from the substance's RxCUI `allProperties` snapshot; DDInter from `curated.ddinter_drug`; ICD-11 from the subquery passed in) and `IngredientSummaryReader.code(r)` builds each code's `SourceLinks.code` link from it, so the product page, the desk, the senior substance page and this page give one "fetched on" date per code. The substance page dates ICD-11 the way P1C's senior substance page does (no single product is in view): the latest DGDA register fetch of any product carrying the XM code. `codesSql` does not select `curated.substance_code.source` (the provenance text this response keeps), so the adapter reads the codes as before and joins the links by `system|code` (Step 5, item 3).

- [ ] **Step 5: Extend the adapter**

In `R2dbcSubstanceAdapter.java`:

1. The constructor is unchanged (`R2dbcSubstanceAdapter(DatabaseClient db)`): the code links come from SQL in the same package.
2. In `find`, pass `approvedOnly` to `interactions`, add `entries(bdsId)` and `clinicalDrugs(bdsId, approvedOnly)`, and attach the code links:

```java
    @Override public Mono<Substance> find(String bdsId, boolean approvedOnly) {
        return db.sql("SELECT bds_id, preferred_name FROM curated.substance WHERE bds_id = :id")
            .bind("id", bdsId)
            .map(r -> new String[]{r.get("bds_id", String.class), r.get("preferred_name", String.class)})
            .one()
            .flatMap(s -> Mono.zip(List.of(names(bdsId), codes(bdsId), coverage(bdsId), products(bdsId, approvedOnly),
                    interactions(bdsId, approvedOnly), diseases(bdsId), foods(bdsId), entries(bdsId), clinicalDrugs(bdsId, approvedOnly)),
                    a -> a)
                .map(a -> new Substance(s[0], s[1], cast(a[0]), cast(a[1]), (Substance.Coverage) a[2], cast(a[3]), cast(a[4]),
                    cast(a[5]), cast(a[6]), cast(a[7]), cast(a[8]))));
    }

    @SuppressWarnings("unchecked")
    private static <T> List<T> cast(Object o) { return (List<T>) o; }
```

3. `codes` builds each `SubstanceCode` with the link P1C's rule gives it (two queries in parallel: the codes with their provenance text, and `codesSql` for the links):

```java
    /** ICD-11 "fetched on" for a substance page: the DGDA register's latest fetch of any product carrying the XM code (as P1C's senior substance page). */
    static final String ICD11_FETCHED_AT = "SELECT max(rc.fetched_at) FROM curated.brand_product_ingredient bpi " +
        "JOIN raw.ocl_concept rc ON rc.concept_id = bpi.concept_id WHERE bpi.xm_code = c.code";

    private Mono<List<SubstanceCode>> codes(String id) {
        Mono<List<SubstanceCode>> rows = db.sql("SELECT system, code, route_scope, source, method, confidence FROM curated.substance_code " +
                      "WHERE bds_id = :id ORDER BY " + SYSTEM_RANK + ", code")
            .bind("id", id)
            .map(r -> new SubstanceCode(r.get("system", String.class), r.get("code", String.class),
                r.get("route_scope", String.class), r.get("source", String.class), r.get("method", String.class),
                r.get("confidence", BigDecimal.class).doubleValue(), null))
            .all().collectList();
        Mono<Map<String, SourceLinks.Source>> links = db.sql(IngredientSummaryReader.codesSql(ICD11_FETCHED_AT))
            .bind("ids", new String[]{id})
            .map(IngredientSummaryReader::code)
            .all().filter(c -> c.source() != null)
            .collectMap(c -> c.system() + "|" + c.code(), IngredientSummary.Code::source);
        return Mono.zip(rows, links).map(t -> t.getT1().stream().map(c -> new SubstanceCode(c.system(), c.code(), c.routeScope(),
            c.source(), c.method(), c.confidence(), t.getT2().get(c.system() + "|" + c.code()))).toList());
    }
```

4. `interactions(String id, boolean publicOnly)`: the partner's BDS id is looked up only among public substances under public scope. Replace the method's `partner_bds_id` subquery with a CTE:

```java
    private Mono<List<Substance.Interaction>> interactions(String id, boolean publicOnly) {
        String partner = publicOnly
            ? "(SELECT min(c.bds_id) FROM curated.substance_code c JOIN pubsub ps ON ps.bds_id = c.bds_id " +
              "WHERE c.system = 'DDINTER' AND c.code = s.partner_id)"
            : "(SELECT min(c.bds_id) FROM curated.substance_code c WHERE c.system = 'DDINTER' AND c.code = s.partner_id)";
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBLIC_SUBSTANCES + ", " + MINE_CTE + """
                , sides AS (
                  SELECT p.ddinter_b AS partner_id, p.partner_name_b AS partner_name, p.severity, p.actions,
                         p.interaction_id, m.route_scope
                  FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_a = m.code
                  UNION ALL
                  SELECT p.ddinter_a, p.partner_name_a, p.severity, p.actions, p.interaction_id, m.route_scope
                  FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_b = m.code)
                SELECT s.partner_name, s.severity, s.actions, s.interaction_id, s.route_scope,\s""" + partner + """
                 AS partner_bds_id
                FROM sides s
                ORDER BY\s""" + SEVERITY_RANK.formatted("s.severity") +
                ", lower(s.partner_name), s.partner_name, s.route_scope, s.partner_id")
            .bind("id", id)
            .map(r -> new Substance.Interaction(r.get("partner_name", String.class), r.get("partner_bds_id", String.class),
                r.get("severity", String.class), list(r, "actions"), r.get("interaction_id", String.class),
                r.get("route_scope", String.class)))
            .all().collectList();
    }
```

with these constants next to `MINE` (the existing `MINE` text stays for `diseases` and `foods`):

```java
    /** Substances carried by a public product (§7.4: "a substance is public only when at least one public product carries it"). */
    static final String PUBLIC_SUBSTANCES = """
        pubsub AS (SELECT DISTINCT x.bds_id FROM curated.brand_product bp
                   JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                   JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                   JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code)""";
    private static final String MINE_CTE = "mine AS (SELECT code, route_scope FROM curated.substance_code WHERE bds_id = :id AND system = 'DDINTER')";
```

5. Add `entries` and `clinicalDrugs`:

```java
    private Mono<List<Substance.Entry>> entries(String id) {
        return db.sql("""
                WITH e AS (SELECT c.code AS id, c.route_scope FROM curated.substance_code c WHERE c.bds_id = :id AND c.system = 'DDINTER'),
                sides AS (SELECT p.ddinter_a AS id, p.severity FROM curated.ddinter_pair p JOIN e ON p.ddinter_a = e.id
                          UNION ALL SELECT p.ddinter_b, p.severity FROM curated.ddinter_pair p JOIN e ON p.ddinter_b = e.id)
                SELECT e.id, e.route_scope, d.name, d.fetched_at,
                       count(s.severity) FILTER (WHERE s.severity = 'major') AS major,
                       count(s.severity) FILTER (WHERE s.severity = 'moderate') AS moderate,
                       count(s.severity) FILTER (WHERE s.severity = 'minor') AS minor,
                       count(s.severity) FILTER (WHERE s.severity NOT IN ('major','moderate','minor')) AS unknown,
                       count(s.severity) AS total,
                       (SELECT count(*) FROM curated.ddinter_disease x WHERE x.ddinter_id = e.id) AS disease,
                       (SELECT count(*) FROM curated.ddinter_food x WHERE x.ddinter_id = e.id) AS food
                FROM e LEFT JOIN curated.ddinter_drug d ON d.ddinter_id = e.id LEFT JOIN sides s ON s.id = e.id
                GROUP BY e.id, e.route_scope, d.name, d.fetched_at""")
            .bind("id", id)
            .map(r -> {
                String code = r.get("id", String.class);
                OffsetDateTime at = r.get("fetched_at", OffsetDateTime.class);
                return new Substance.Entry(code, r.get("name", String.class), r.get("route_scope", String.class),
                    new IngredientSummary.Counts(n(r, "major"), n(r, "moderate"), n(r, "minor"), n(r, "unknown"), n(r, "total")),
                    n(r, "disease"), n(r, "food"),
                    SourceLinks.code("DDINTER", code, at == null ? null : at.toInstant()).orElse(null));
            })
            .all().collectList()
            .map(list -> list.stream().sorted(java.util.Comparator.comparing(Substance.Entry::ddinterId, DdinterCode.ID_ORDER)).toList());
    }

    private static int n(Readable r, String column) {
        Long v = r.get(column, Long.class);
        return v == null ? 0 : v.intValue();
    }

    private Mono<List<Substance.ClinicalDrugRef>> clinicalDrugs(String id, boolean publicOnly) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " + """
                SELECT DISTINCT cd.bdc_id, cd.display_name
                FROM curated.clinical_drug_ingredient i
                JOIN curated.clinical_drug cd ON cd.bdc_id = i.bdc_id
                WHERE i.bds_id = :id AND (NOT :pub OR EXISTS (
                  SELECT 1 FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                  WHERE bp.bdc_id = cd.bdc_id))
                ORDER BY cd.display_name, cd.bdc_id""")
            .bind("id", id).bind("pub", publicOnly)
            .map(r -> new Substance.ClinicalDrugRef(r.get("bdc_id", String.class), r.get("display_name", String.class)))
            .all().collectList();
    }
```

Add imports: `com.niramoy.bddrug.domain.DdinterCode`, `com.niramoy.bddrug.domain.IngredientSummary`, `com.niramoy.bddrug.domain.SourceLinks`, `java.time.OffsetDateTime`, `java.util.Map`.

- [ ] **Step 6: Run the substance tests**

Run: `cd api && ./gradlew test --no-daemon --tests SubstancePublicApiIntegrationTest --tests SubstanceApiIntegrationTest --tests VisibilityApiIntegrationTest`
Expected: PASS (the existing tests read with `scope=all`, or assert fields that did not change).

- [ ] **Step 7: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/Substance.java api/src/main/java/com/niramoy/bddrug/domain/SubstanceCode.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSubstanceAdapter.java \
  api/src/test/java/com/niramoy/bddrug/SubstancePublicApiIntegrationTest.java
git commit -m "feat(api): substance entries with counts, code source links, public clinical drugs; private partners never linked (§6.6, §5.6.6)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Substance interactions (`GET /v1/substances/{bdsId}/interactions`, P9)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/SubstanceInteractions.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/SubstanceQueryPort.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSubstanceAdapter.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/SubstanceQueryService.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/presentation/SubstanceController.java`
- Test: `api/src/test/java/com/niramoy/bddrug/SubstanceInteractionsApiIntegrationTest.java`

**Interfaces:**
- Consumes: Task 2 `PublicPairReviews.Pair`, `PublicPairReviews.codes`, `PublicPairReviews.of`, `PublicPairReviews.NONE`; P1C's `PairReviewReader.forCodes(Collection<String>, String viewerEmail)` and `PairReviewRule.PublicReview`; Task 6 `PUBLIC_SUBSTANCES`, `MINE_CTE`, `entries(...)` counts; P1C's `SourceLinks.pair(String interactionId) : Optional<SourceLinks.Source>`.
- Produces:
  - `SubstanceInteractions(String bdsId, List<Substance.Entry> counts, int total, int page, int size, List<Item> items)`; `Item(String partnerName, String partnerBdsId, String ddinterA, String ddinterB, String routeScope, String severity, List<String> actions, String interaction, String management, PairReviewRule.PublicReview pairReview, String sourceUrl)`. Under public scope, an item whose partner substance is not public has `partnerBdsId` null **and** `pairReview` = `not_reviewed` with `reviewedAt` null, whatever `ops.pair_review` holds (§7.4: "served only for pairs between public products"; §2.2 "Pair review state": "pairs between approved products only").
  - `SubstanceQueryPort.isPublic(String bdsId) : Mono<Boolean>`, `SubstanceQueryPort.preferredName(String bdsId) : Mono<String>` (empty when unknown), `SubstanceQueryPort.interactionsPage(String bdsId, String severity, int limit, int offset, boolean publicOnly) : Mono<InteractionsPage>` with `InteractionsPage(int total, List<Substance.Entry> counts, List<SubstanceInteractions.Item> items)`.
  - `SubstanceQueryService.interactions(String bdsId, String severity, int page, int size, Scope scope) : Mono<Object>` (`SubstanceInteractions`, the stub, or 404); `SubstanceQueryService.SEVERITIES`.
  - `GET /v1/substances/{bdsId}/interactions?severity=&page=&size=` (`severity` ∈ major, moderate, minor, unknown, else 400 `field=severity`; `page` 0–10000; `size` 1–50, default 20).

- [ ] **Step 1: Write the failing integration test**

`SubstanceInteractionsApiIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PublicPairReviews;
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
 * §7.4 P9 on PilotSeed. Warfarin (BDS-000001, approved through W-1) pairs with Acetylsalicylic acid (major, IA-1),
 * Acetaminophen and Chloramphenicol (moderate), Some Herb (minor) and Alpha Unknown (unknown). Aspirin's product is
 * pending, so its BDS id is never served, and neither is the senior review of its pair with Warfarin (current, at 05:20);
 * Napa and C-CAP are approved, and the Warfarin + Acetaminophen pair has a current review (05:22).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SubstanceInteractionsApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        String warfarinAspirin = new PublicPairReviews.Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"),
            "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
            "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.").hash();
        String warfarinAcetaminophen = new PublicPairReviews.Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null).hash();
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('I-1', 4, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('I-1','DGDA-Drugs','W-1','ok', now()), ('I-1','DGDA-Drugs','N-1','ok', now()),
             ('I-1','DGDA-Drugs','C-CAP','ok', now()), ('I-1','DGDA-Drugs','A-1','pending', now());
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at) VALUES
             ('DDInter1951','DDInter20','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:20:00Z'),
             ('DDInter1951','DDInter351','issue','PAIR-NOTE-SECRET', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:21:00Z'),
             ('DDInter14','DDInter1951','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:22:00Z');
            """.formatted(warfarinAspirin, "0".repeat(64), warfarinAcetaminophen));
    }

    @Autowired WebTestClient web;

    @Test void pagedListWithTextReviewStateAndPrivatePartnersUnlinked() {
        String body = new String(web.get().uri("/v1/substances/BDS-000001/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.size").isEqualTo(20)
            .jsonPath("$.data.counts[0].ddinterId").isEqualTo("DDInter1951")
            .jsonPath("$.data.counts[0].counts.major").isEqualTo(1)
            .jsonPath("$.data.items[0].severity").isEqualTo("major")
            .jsonPath("$.data.items[0].partnerName").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.items[0].partnerBdsId").value(v -> assertThat(v).isNull())
            .jsonPath("$.data.items[0].ddinterA").isEqualTo("DDInter1951")
            .jsonPath("$.data.items[0].ddinterB").isEqualTo("DDInter20")
            .jsonPath("$.data.items[0].routeScope").isEqualTo("systemic")
            .jsonPath("$.data.items[0].interaction").isEqualTo("Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.")
            // the partner substance is not public: its pair's senior review is never served (§7.4, §2.2)
            .jsonPath("$.data.items[0].pairReview.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.items[0].pairReview.reviewedAt").value(v -> assertThat(v).isNull())
            .jsonPath("$.data.items[1].partnerName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.items[1].partnerBdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.items[1].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.items[1].pairReview.reviewedAt").isEqualTo("2026-10-16T05:22:00Z")
            .jsonPath("$.data.items[2].partnerName").isEqualTo("Chloramphenicol")
            .jsonPath("$.data.items[2].pairReview.state").isEqualTo("not_reviewed")   // an issue is never named in public
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("\"issue\"", "\"changed\"", "PAIR-NOTE-SECRET", "senior@example.org", "BDS-000002",
            "2026-10-16T05:20:00Z");
        // the token and scope=all read every pair's state, the private partner's too
        internal(web).get().uri("/v1/substances/BDS-000001/interactions?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.items[0].partnerBdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.items[0].pairReview.state").isEqualTo("reviewed");
    }

    @Test void severityFilterAndPaging() {
        web.get().uri("/v1/substances/BDS-000001/interactions?severity=moderate").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(2)
            .jsonPath("$.data.items.length()").isEqualTo(2);
        web.get().uri("/v1/substances/BDS-000001/interactions?size=2&page=2").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.items.length()").isEqualTo(1)
            .jsonPath("$.data.items[0].severity").isEqualTo("unknown");
        web.get().uri("/v1/substances/BDS-000001/interactions?page=9").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.items.length()").isEqualTo(0);
    }

    @Test void badParametersAre400OnTheirField() {
        web.get().uri("/v1/substances/BDS-000001/interactions?severity=fatal").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("severity");
        web.get().uri("/v1/substances/BDS-000001/interactions?page=-1").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("page");
        web.get().uri("/v1/substances/BDS-000001/interactions?size=51").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("size");
    }

    @Test void aSubstanceThatIsNotPublicIsTheStubAndUnknownIs404() {
        String body = new String(web.get().uri("/v1/substances/BDS-000002/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(3)
            .jsonPath("$.data.hidden").isEqualTo(true)
            .jsonPath("$.data.preferredName").isEqualTo("Aspirin")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("items", "counts", "DDInter");
        web.get().uri("/v1/substances/BDS-999999/interactions").exchange().expectStatus().isNotFound();
    }

    @Test void aPairWithAnInteractionIdHasItsDdinterLink() throws Exception {
        exec(pg, "INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) " +
                 "VALUES ('DDInter14','DDInter9','minor','{}','Acetaminophen','Linkmol','3039') ON CONFLICT DO NOTHING");
        web.get().uri("/v1/substances/BDS-000005/interactions?severity=minor").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.items[0].sourceUrl").isEqualTo("https://ddinter2.scbdd.com/server/interact/3039/");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests SubstanceInteractionsApiIntegrationTest`
Expected: FAIL (404: no handler for `/interactions`).

- [ ] **Step 3: Write the record**

`SubstanceInteractions.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * §7.4 P9: a page of a public substance's DDInter pairs, every entry's counts, and each pair's public review state and
 * DDInter link. Under public scope, partnerBdsId is null when the partner substance is not public (its DDInter name stays:
 * it is DDInter's), and then pairReview is not_reviewed with no date: a pair review is served only for pairs between
 * public products (§7.4).
 */
public record SubstanceInteractions(String bdsId, List<Substance.Entry> counts, int total, int page, int size, List<Item> items) {
    public record Item(String partnerName, String partnerBdsId, String ddinterA, String ddinterB, String routeScope, String severity,
                       List<String> actions, String interaction, String management, PairReviewRule.PublicReview pairReview,
                       String sourceUrl) {
        public Item {
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }
}
```

- [ ] **Step 4: Port, adapter, service and controller**

`SubstanceQueryPort.java` (whole file):

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Substance;
import com.niramoy.bddrug.domain.SubstanceInteractions;
import reactor.core.publisher.Mono;
import java.util.List;

public interface SubstanceQueryPort {
    /** {@code approvedOnly} keeps only approved products in {@link Substance#products()}. */
    Mono<Substance> find(String bdsId, boolean approvedOnly);
    /** Empty when unknown. */
    Mono<String> preferredName(String bdsId);
    /** True when a public product carries the substance (§7.4). */
    Mono<Boolean> isPublic(String bdsId);
    record InteractionsPage(int total, List<Substance.Entry> counts, List<SubstanceInteractions.Item> items) {}
    /** severity null = all. publicOnly: partnerBdsId only for public partner substances. */
    Mono<InteractionsPage> interactionsPage(String bdsId, String severity, int limit, int offset, boolean publicOnly);
}
```

`R2dbcSubstanceAdapter.java`: inject P1C's `PairReviewReader pairReviews` (constructor `R2dbcSubstanceAdapter(DatabaseClient db, PairReviewReader pairReviews)`, field) and add:

```java
    @Override public Mono<String> preferredName(String bdsId) {
        return db.sql("SELECT preferred_name FROM curated.substance WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("preferred_name", String.class)).one();
    }

    @Override public Mono<Boolean> isPublic(String bdsId) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBLIC_SUBSTANCES + " SELECT EXISTS (SELECT 1 FROM pubsub WHERE bds_id = :id) AS pub")
            .bind("id", bdsId).map(r -> Boolean.TRUE.equals(r.get("pub", Boolean.class))).one();
    }

    private record PairRow(String partnerName, String partnerBdsId, String ddinterA, String ddinterB, String routeScope, String severity,
                           List<String> actions, String interactionId, String interaction, String management) {}

    @Override public Mono<InteractionsPage> interactionsPage(String bdsId, String severity, int limit, int offset, boolean publicOnly) {
        String partner = publicOnly
            ? "(SELECT min(c.bds_id) FROM curated.substance_code c JOIN pubsub ps ON ps.bds_id = c.bds_id WHERE c.system = 'DDINTER' AND c.code = s.partner_id)"
            : "(SELECT min(c.bds_id) FROM curated.substance_code c WHERE c.system = 'DDINTER' AND c.code = s.partner_id)";
        String sides = "WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBLIC_SUBSTANCES + ", " + MINE_CTE + """
            , sides AS (
              SELECT p.ddinter_a, p.ddinter_b, p.ddinter_b AS partner_id, p.partner_name_b AS partner_name, p.severity, p.actions,
                     p.interaction_id, m.route_scope
              FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_a = m.code
              UNION ALL
              SELECT p.ddinter_a, p.ddinter_b, p.ddinter_a, p.partner_name_a, p.severity, p.actions, p.interaction_id, m.route_scope
              FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_b = m.code)
            """;
        String where = " WHERE (CAST(:sev AS text) IS NULL OR s.severity = :sev) ";
        DatabaseClient.GenericExecuteSpec count = db.sql(sides + "SELECT count(*) AS n FROM sides s" + where).bind("id", bdsId);
        count = severity == null ? count.bindNull("sev", String.class) : count.bind("sev", severity);
        DatabaseClient.GenericExecuteSpec page = db.sql(sides + """
                SELECT s.ddinter_a, s.ddinter_b, s.partner_name, s.severity, s.actions, s.interaction_id, s.route_scope,
                       t.interaction, t.management,\s""" + partner + " AS partner_bds_id " +
                "FROM sides s LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = s.interaction_id" + where +
                "ORDER BY " + SEVERITY_RANK.formatted("s.severity") + ", lower(s.partner_name), s.partner_name, s.route_scope, s.partner_id " +
                "LIMIT :limit OFFSET :offset")
            .bind("id", bdsId).bind("limit", limit).bind("offset", offset);
        page = severity == null ? page.bindNull("sev", String.class) : page.bind("sev", severity);
        Mono<Integer> total = count.map(r -> r.get("n", Long.class).intValue()).one();
        Mono<List<PairRow>> rows = page.map(r -> new PairRow(r.get("partner_name", String.class), r.get("partner_bds_id", String.class),
                r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("route_scope", String.class),
                r.get("severity", String.class), list(r, "actions"), r.get("interaction_id", String.class),
                r.get("interaction", String.class), r.get("management", String.class)))
            .all().collectList();
        return Mono.zip(total, entries(bdsId), rows).flatMap(t -> {
            // §7.4: a pair review is served only for pairs between public products. Under public scope a pair whose partner
            // substance is not public (partnerBdsId null) is not even read, and reads not_reviewed with no date.
            List<PublicPairReviews.Pair> pairs = t.getT3().stream().filter(p -> !publicOnly || p.partnerBdsId() != null)
                .map(p -> new PublicPairReviews.Pair(p.ddinterA(), p.ddinterB(), p.severity(), p.actions(), p.interaction(),
                    p.management()))
                .toList();
            return pairReviews.forCodes(PublicPairReviews.codes(pairs), null).map(d -> PublicPairReviews.of(pairs, d))
                .map(rv -> new InteractionsPage(t.getT1(), t.getT2(), t.getT3().stream().map(p -> new SubstanceInteractions.Item(
                    p.partnerName(), p.partnerBdsId(), p.ddinterA(), p.ddinterB(), p.routeScope(), p.severity(), p.actions(),
                    p.interaction(), p.management(),
                    publicOnly && p.partnerBdsId() == null ? PublicPairReviews.NONE
                        : rv.getOrDefault(p.ddinterA() + "|" + p.ddinterB(), PublicPairReviews.NONE),
                    SourceLinks.pair(p.interactionId()).map(SourceLinks.Source::url).orElse(null))).toList()));
        });
    }
```

Add imports `com.niramoy.bddrug.domain.PublicPairReviews`, `com.niramoy.bddrug.domain.SubstanceInteractions` (`SourceLinks` came with Task 6). The pair-review hash is `PairContent`'s, whose `Content` cleans the texts (§7.7: "after `DdinterText.clean`").

`SubstanceQueryService.java` (whole file):

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.SubstanceQueryPort;
import com.niramoy.bddrug.domain.HiddenRecord;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.SubstanceInteractions;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.Set;

/** A substance is public once at least one public product carries it (§7.4); otherwise public reads get the stub. */
@Service
public class SubstanceQueryService {
    public static final Set<String> SEVERITIES = Set.of("major", "moderate", "minor", "unknown");
    public static final int PAGE_MAX = 10_000, SIZE_MAX = 50, SIZE_DEFAULT = 20;
    private final SubstanceQueryPort port;
    public SubstanceQueryService(SubstanceQueryPort port) { this.port = port; }

    /** Emits a Substance, or a HiddenRecord.Substance under public scope; empty when unknown. */
    public Mono<Object> get(String bdsId, Scope scope) {
        boolean pub = scope == Scope.PUBLIC;
        return port.find(bdsId, pub).map(s -> pub && s.products().isEmpty()
            ? new HiddenRecord.Substance(s.bdsId(), s.preferredName()) : s);
    }

    /** §7.4 P9: SubstanceInteractions, or the stub under public scope; NotFoundException when unknown. */
    public Mono<Object> interactions(String bdsId, String severity, int page, int size, Scope scope) {
        if (severity != null && !SEVERITIES.contains(severity))
            return Mono.error(new InvalidQueryException("severity", "severity must be one of major, moderate, minor, unknown"));
        if (page < 0 || page > PAGE_MAX) return Mono.error(new InvalidQueryException("page", "page must be 0-" + PAGE_MAX));
        if (size < 1 || size > SIZE_MAX) return Mono.error(new InvalidQueryException("size", "size must be 1-" + SIZE_MAX));
        boolean pub = scope == Scope.PUBLIC;
        return port.preferredName(bdsId)
            .switchIfEmpty(Mono.error(() -> new NotFoundException("bdsId", "Substance not found")))
            .flatMap(name -> (pub ? port.isPublic(bdsId) : Mono.just(true)).flatMap(visible -> visible
                ? port.interactionsPage(bdsId, severity, size, page * size, pub)
                    .map(p -> (Object) new SubstanceInteractions(bdsId, p.counts(), p.total(), page, size, p.items()))
                : Mono.just((Object) new HiddenRecord.Substance(bdsId, name))));
    }
}
```

`SubstanceController.java`: add

```java
    /** §7.4 P9. Under public scope a substance that is not public is the stub, never items or counts. */
    @GetMapping("/{bdsId}/interactions")
    public Mono<ApiResponse<Object>> interactions(@PathVariable String bdsId, @RequestParam(required = false) String severity,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "20") int size,
                                                  @RequestParam(required = false) String scope,
                                                  @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return substances.interactions(bdsId, severity, page, size, auth.scope(scope, token)).map(ApiResponse::ok);
    }
```

A non-numeric `page` (`page=abc`) is answered 400 by Spring's type conversion through `ApiExceptionHandler`; the web never sends one (Task 18).

- [ ] **Step 5: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests SubstanceInteractionsApiIntegrationTest --tests SubstancePublicApiIntegrationTest --tests SubstanceApiIntegrationTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/SubstanceInteractions.java \
  api/src/main/java/com/niramoy/bddrug/application/port/SubstanceQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSubstanceAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/SubstanceQueryService.java \
  api/src/main/java/com/niramoy/bddrug/presentation/SubstanceController.java \
  api/src/test/java/com/niramoy/bddrug/SubstanceInteractionsApiIntegrationTest.java
git commit -m "feat(api): GET /v1/substances/{bdsId}/interactions with text, public review state and DDInter link (§7.4 P9)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The checker's counting rule (`CheckResult` reshaped, `InteractionCheckService.compute` rewritten)

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/CheckResult.java`
- Delete: `api/src/main/java/com/niramoy/bddrug/domain/InteractionAlert.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/port/CheckQueryPort.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/InteractionCheckService.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java` (compile only: `interactionId` null and empty entry names until Task 9; P1C's pair-review read stays wired, so `pairReview` is right from this task on)
- Test: `api/src/test/java/com/niramoy/bddrug/CheckComputeTest.java` (new), `api/src/test/java/com/niramoy/bddrug/InteractionCheckServiceTest.java`, `api/src/test/java/com/niramoy/bddrug/DdinterTextTest.java`, `api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java`; run P1C's `PairQueueIntegrationTest`

**Interfaces:**
- Consumes: `RouteRule.choose`, `BatchPairs.REASON_ORDER` (`["no_data","unmapped","not_run","no_route"]`), `Severity.rank`, Task 2 `PublicPairReviews.NONE`; P1C's `PairContent.hash(a, b, PairContent.Content)`, `PairReviewRule.publicReview(List<Decision>, String)`, `PairReviewRule.Decision`, `PairReviewRule.PublicReview`; P1C's `CheckData(products, ingredients, codesByBds, listedCodes, pairs, Map<String, List<PairReviewRule.Decision>> reviews)` and its `R2dbcCheckAdapter`, which already reads the decisions (`pairReviews.forCodes(<loaded codes>, null)`).
- Produces (§7.4 `CheckResult`, with three additive fields this plan needs: `products[].route`, `notChecked[].side`, and `Side.routeScope` null for a side with no chosen entry):

```java
CheckResult(Summary summary, List<CheckedProduct> products, List<Alert> alerts, List<NoInteraction> noInteraction,
            List<NotChecked> notChecked, List<Duplicate> duplicates, List<NoData> noData, List<NotReviewed> notReviewed)
Summary(int medicines, int totalPairs, int checkedPairs, int alertPairs, int noInteractionPairs, int notCheckedPairs,
        int notReviewed, BySeverity bySeverity)          BySeverity(int major, int moderate, int minor, int unknown)
CheckedProduct(String conceptId, String tradeName, String route, List<SubstanceCoverage> substances)
SubstanceCoverage(String bdsId, String name, String coverage, List<Chosen> ddinter)
Chosen(String ddinterId, String name, String routeScope, boolean routeAssumed)
Side(String conceptId, String tradeName, String bdsId, String name, String routeScope)
Alert(String severity, Side a, Side b, List<String> actions, String interaction, String management, boolean routeAssumed,
      String ddinterA, String ddinterB, String interactionId, String source, PairReviewRule.PublicReview pairReview)
NoInteraction(Side a, Side b, String ddinterA, String ddinterB)
NotChecked(Side a, Side b, String reason, String side)   // side "a" | "b": whose substance the reason applies to
Duplicate(String bdsId, String name, List<String> conceptIds)    NoData(String conceptId, String bdsId, String name)
NotReviewed(String conceptId, String tradeName)
```

  `CheckQueryPort.PairRow` gains `String interactionId` (last); `CheckQueryPort.CheckData` keeps P1C's `Map<String, List<PairReviewRule.Decision>> reviews` (keyed `"a|b"`, stored order) and gains `Map<String, String> entryNames` after it; its five-argument constructor stays (no reviews, no names). `InteractionAlert` (P1C's eleven fields) is deleted: `CheckResult.Alert` carries `ddinterA`, `ddinterB` and `pairReview` (computed exactly as P1C's `alertsFor` does: `PairReviewRule.publicReview(decisions, PairContent.hash(a, b, content))`).

  Counting (§6.7.2 rule 5): `totalPairs` = substance pairs of two different approved products whose BDS differ; `checkedPairs` = those with a usable entry on both sides; `alertPairs` = checked pairs with at least one stored row; `noInteractionPairs` = `checkedPairs − alertPairs`; `notCheckedPairs` = `totalPairs − checkedPairs`; same-product (`notChecked` reason `same_product`) and same-BDS (`duplicates`) pairs are in no count. `noData` keeps its pre-P2 meaning (every approved product substance that cannot be checked; "kept for compatibility").

- [ ] **Step 1: Write the failing tests**

`CheckComputeTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InteractionCheckService;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.application.port.CheckQueryPort.*;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.CheckResult.*;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.Scope;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

/** §6.7.2 counting rule and the §7.4 CheckResult (§11.1 check-summary cases at the API, §11.3 CheckApiIntegrationTest cases in pure form). */
class CheckComputeTest {
    static final List<ProductRow> PRODUCTS = List.of(
        new ProductRow("EYE", "Chloramex Eye", "Chloramphenicol 0.5%", "ophthalmic", "ok"),
        new ProductRow("CAP", "Chloramex", "Chloramphenicol 250 mg", "systemic", "ok"),
        new ProductRow("W", "Warin", "Warfarin 5 mg", "systemic", "ok"),
        new ProductRow("W2", "Coumarol", "Warfarin 5 mg", "systemic", "ok"),
        new ProductRow("A", "Asprin", "Aspirin 75 mg", "systemic", "ok"),
        new ProductRow("D", "Motigut", "Domperidone 10 mg", "systemic", "ok"),
        new ProductRow("OTIC", "Otimol", "Oticmol 5 mg", "systemic", "ok"),
        new ProductRow("NR", "Newrun", "Newrunmol 5 mg", "systemic", "ok"),
        new ProductRow("UNM", "Newdrug", "Newmol 10 mg", "systemic", "ok"),
        new ProductRow("AMC", "Moxaclav", "Amoxicillin 500 mg + Clavulanic Acid 125 mg", "systemic", "ok"),
        new ProductRow("BARE", "Herbex", "Herbal mix", null, "ok"),
        new ProductRow("HID", "Hidasprin", "Aspirin 75 mg", "systemic", "pending"));
    static final List<IngredientRow> INGREDIENTS = List.of(
        new IngredientRow("EYE", "XMC", "Chloramphenicol", "BDS-3", "Chloramphenicol", "full"),
        new IngredientRow("CAP", "XMC", "Chloramphenicol", "BDS-3", "Chloramphenicol", "full"),
        new IngredientRow("W", "XMW", "Warfarin", "BDS-1", "Warfarin", "full"),
        new IngredientRow("W2", "XMW", "Warfarin", "BDS-1", "Warfarin", "full"),
        new IngredientRow("A", "XMA", "Aspirin", "BDS-2", "Aspirin", "full"),
        new IngredientRow("HID", "XMA", "Aspirin", "BDS-2", "Aspirin", "full"),
        new IngredientRow("D", "XMD", "Domperidone", "BDS-4", "Domperidone", "none"),
        new IngredientRow("OTIC", "XMO", "Oticmol", "BDS-7", "Oticmol", "full"),
        new IngredientRow("NR", "XMN", "Newrunmol", "BDS-6", "Newrunmol", null),
        new IngredientRow("UNM", "XM0000", "Newmol", null, null, null),
        new IngredientRow("AMC", "XMAM", "Amoxicillin", "BDS-8", "Amoxicillin", "full"),
        new IngredientRow("AMC", "XMCL", "Clavulanic acid", "BDS-9", "Clavulanic acid", "full"));
    static final Map<String, List<DdinterCode>> CODES = Map.of(
        "BDS-1", List.of(new DdinterCode("DDInter1951", "systemic")),
        "BDS-2", List.of(new DdinterCode("DDInter20", "systemic")),
        "BDS-3", List.of(new DdinterCode("DDInter351", "systemic"), new DdinterCode("DDInter352", "ophthalmic")),
        "BDS-6", List.of(new DdinterCode("DDInter600", "systemic")),
        "BDS-7", List.of(new DdinterCode("DDInter700", "otic")),
        "BDS-8", List.of(new DdinterCode("DDInter80", "systemic")),
        "BDS-9", List.of(new DdinterCode("DDInter90", "systemic")));
    static final Set<String> LISTED = Set.of("DDInter1951", "DDInter20", "DDInter351", "DDInter352", "DDInter600", "DDInter700",
        "DDInter80", "DDInter90");
    static final List<PairRow> PAIRS = List.of(
        new PairRow("DDInter1951", "DDInter20", "major", List.of("Avoid"), "bleeding", "avoid it", "3039"),
        new PairRow("DDInter1951", "DDInter351", "moderate", List.of("Monitor"), "levels rise", "monitor INR", null),
        new PairRow("DDInter1951", "DDInter80", "minor", List.of(), null, null, null));
    static final Map<String, String> NAMES = Map.of("DDInter352", "Chloramphenicol (ophthalmic)", "DDInter351", "Chloramphenicol",
        "DDInter1951", "Warfarin", "DDInter20", "Acetylsalicylic acid");
    static final Instant AT = Instant.parse("2026-10-16T05:20:00Z");

    static InteractionCheckService service(Map<String, List<PairReviewRule.Decision>> reviews) {
        CheckQueryPort port = ids -> Mono.just(new CheckData(
            PRODUCTS.stream().filter(p -> ids.contains(p.conceptId())).toList(),
            INGREDIENTS.stream().filter(i -> ids.contains(i.conceptId())).toList(), CODES, LISTED, PAIRS, reviews, NAMES));
        return new InteractionCheckService(port);
    }
    static CheckResult run(Scope scope, String... ids) { return service(Map.of()).check(List.of(ids), scope).block(); }
    static NotChecked between(CheckResult r, String a, String b) {
        return r.notChecked().stream().filter(n -> n.a().conceptId().equals(a) && n.b().conceptId().equals(b)).findFirst().orElseThrow();
    }

    @Test void eyeDropsAndWarfarinAreCheckedAgainstTheOphthalmicEntryWithNoInteractionListed() {
        CheckResult r = run(Scope.PUBLIC, "EYE", "W");
        assertThat(r.alerts()).isEmpty();
        assertThat(r.noData()).isEmpty();
        assertThat(r.noInteraction()).containsExactly(new NoInteraction(
            new Side("EYE", "Chloramex Eye", "BDS-3", "Chloramphenicol", "ophthalmic"),
            new Side("W", "Warin", "BDS-1", "Warfarin", "systemic"), "DDInter352", "DDInter1951"));
        assertThat(r.products().get(0).route()).isEqualTo("ophthalmic");
        assertThat(r.products().get(0).substances().get(0).ddinter())
            .containsExactly(new Chosen("DDInter352", "Chloramphenicol (ophthalmic)", "ophthalmic", false));
        assertThat(r.summary()).isEqualTo(new Summary(2, 1, 1, 0, 1, 0, 0, new BySeverity(0, 0, 0, 0)));
    }

    @Test void capsuleAndWarfarinGiveOneModerateAlertWithItsSidesAndIds() {
        CheckResult r = run(Scope.PUBLIC, "CAP", "W");
        assertThat(r.alerts()).hasSize(1);
        Alert a = r.alerts().get(0);
        assertThat(a.severity()).isEqualTo("moderate");
        assertThat(a.a()).isEqualTo(new Side("CAP", "Chloramex", "BDS-3", "Chloramphenicol", "systemic"));
        assertThat(a.b()).isEqualTo(new Side("W", "Warin", "BDS-1", "Warfarin", "systemic"));
        assertThat(a.ddinterA()).isEqualTo("DDInter1951");
        assertThat(a.ddinterB()).isEqualTo("DDInter351");
        assertThat(a.source()).isEqualTo("DDInter 2.0");
        assertThat(a.routeAssumed()).isFalse();
        assertThat(a.pairReview()).isEqualTo(PublicPairReviews.NONE);
        assertThat(r.summary().bySeverity()).isEqualTo(new BySeverity(0, 1, 0, 0));
        assertThat(r.summary().alertPairs()).isEqualTo(1);
    }

    static PairReviewRule.Decision reviewed(String hash) {
        return new PairReviewRule.Decision(1, "reviewed", "", hash, null, AT, false);
    }

    @Test void theAlertCarriesThePublicPairReviewAndItsInteractionId() {
        String current = PairContent.hash("DDInter1951", "DDInter20", new PairContent.Content("major", List.of("Avoid"), "bleeding", "avoid it"));
        CheckResult r = service(Map.of("DDInter1951|DDInter20", List.of(reviewed(current)))).check(List.of("W", "A"), Scope.PUBLIC).block();
        assertThat(r.alerts().get(0).pairReview()).isEqualTo(new PairReviewRule.PublicReview("reviewed", AT));
        assertThat(r.alerts().get(0).interactionId()).isEqualTo("3039");
        // reviewed before DDInter changed the pair: not reviewed, no date, and the alert is still served (G3)
        CheckResult stale = service(Map.of("DDInter1951|DDInter20", List.of(reviewed("0".repeat(64))))).check(List.of("W", "A"), Scope.PUBLIC).block();
        assertThat(stale.alerts()).hasSize(1);
        assertThat(stale.alerts().get(0).pairReview()).isEqualTo(PublicPairReviews.NONE);
    }

    @Test void everyNotCheckedReasonNamesTheSideItAppliesTo() {
        CheckResult r = run(Scope.PUBLIC, "W", "D", "OTIC", "NR", "UNM");
        assertThat(between(r, "W", "D")).extracting(NotChecked::reason, NotChecked::side).containsExactly("no_data", "b");
        assertThat(between(r, "W", "OTIC")).extracting(NotChecked::reason, NotChecked::side).containsExactly("no_route", "b");
        assertThat(between(r, "W", "NR")).extracting(NotChecked::reason, NotChecked::side).containsExactly("not_run", "b");
        assertThat(between(r, "W", "UNM")).extracting(NotChecked::reason, NotChecked::side).containsExactly("unmapped", "b");
        assertThat(between(r, "W", "UNM").b()).isEqualTo(new Side("UNM", "Newdrug", null, "Newmol", null));
        // both sides unusable: the first reason in REASON_ORDER wins (no_data before no_route)
        assertThat(between(r, "D", "OTIC")).extracting(NotChecked::reason, NotChecked::side).containsExactly("no_data", "a");
        assertThat(r.summary().totalPairs()).isEqualTo(10);
        assertThat(r.summary().checkedPairs()).isEqualTo(0);
        assertThat(r.summary().notCheckedPairs()).isEqualTo(10);
        assertThat(r.alerts()).isEmpty();
        assertThat(r.noInteraction()).isEmpty();
    }

    @Test void sameProductPairsAreListedButNeverCounted() {
        CheckResult r = run(Scope.PUBLIC, "AMC", "W");
        assertThat(r.notChecked()).hasSize(1);
        NotChecked same = r.notChecked().get(0);
        assertThat(same.reason()).isEqualTo("same_product");
        assertThat(List.of(same.a().name(), same.b().name())).containsExactly("Amoxicillin", "Clavulanic acid");
        assertThat(same.a().conceptId()).isEqualTo("AMC");
        assertThat(r.summary().totalPairs()).isEqualTo(2);
        assertThat(r.summary().checkedPairs()).isEqualTo(2);
        assertThat(r.summary().alertPairs()).isEqualTo(1);
        assertThat(r.summary().noInteractionPairs()).isEqualTo(1);
        assertThat(r.summary().notCheckedPairs()).isEqualTo(0);
    }

    @Test void theSameSubstanceInTwoProductsIsADuplicateAndNotCounted() {
        CheckResult r = run(Scope.PUBLIC, "W", "W2");
        assertThat(r.duplicates()).containsExactly(new Duplicate("BDS-1", "Warfarin", List.of("W", "W2")));
        assertThat(r.alerts()).isEmpty();
        assertThat(r.noInteraction()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
        assertThat(r.summary()).isEqualTo(new Summary(2, 0, 0, 0, 0, 0, 0, new BySeverity(0, 0, 0, 0)));
    }

    @Test void notReviewedProductsCountAsMedicinesOnlyAndCarryTheirTradeName() {
        CheckResult r = run(Scope.PUBLIC, "W", "HID");
        assertThat(r.notReviewed()).containsExactly(new NotReviewed("HID", "Hidasprin"));
        assertThat(r.products()).extracting(CheckedProduct::conceptId).containsExactly("W");
        assertThat(r.summary().medicines()).isEqualTo(2);
        assertThat(r.summary().notReviewed()).isEqualTo(1);
        assertThat(r.summary().totalPairs()).isEqualTo(0);
    }

    @Test void aProductWithNoIngredientMappingIsNeverSilentlyDropped() {
        CheckResult r = run(Scope.PUBLIC, "BARE", "W");
        assertThat(between(r, "BARE", "W")).extracting(NotChecked::reason, NotChecked::side).containsExactly("unmapped", "a");
        assertThat(between(r, "BARE", "W").a().name()).isEqualTo("Herbal mix");
        assertThat(r.products().get(0).substances()).isEmpty();
        assertThat(r.noData()).containsExactly(new NoData("BARE", null, "Herbal mix"));
        assertThat(r.summary().totalPairs()).isEqualTo(1);
    }

    @Test void alertsRunMajorFirstThenByBrandPair() {
        CheckResult r = run(Scope.PUBLIC, "CAP", "W", "A", "AMC");
        assertThat(r.alerts()).extracting(Alert::severity).containsExactly("major", "moderate", "minor");
        assertThat(r.summary().bySeverity()).isEqualTo(new BySeverity(1, 1, 1, 0));
    }

    @Test void anUnlistedChosenEntryIsNotRunNeverNoInteraction() {
        CheckQueryPort port = ids -> Mono.just(new CheckData(PRODUCTS.stream().filter(p -> ids.contains(p.conceptId())).toList(),
            INGREDIENTS.stream().filter(i -> ids.contains(i.conceptId())).toList(), CODES,
            Set.of("DDInter1951"), PAIRS, Map.of(), NAMES));
        CheckResult r = new InteractionCheckService(port).check(List.of("EYE", "W"), Scope.PUBLIC).block();
        assertThat(r.noInteraction()).isEmpty();
        assertThat(between(r, "EYE", "W")).extracting(NotChecked::reason, NotChecked::side).containsExactly("not_run", "a");
        assertThat(r.products().get(0).substances().get(0).ddinter()).isEmpty();
    }
}
```

In `InteractionCheckServiceTest.java`: give every `PairRow` in `PAIRS` a seventh argument `null`; `FakePort.load` keeps the five-argument `CheckData` constructor (P1C left it so: no reviews, no names). Its assertions use accessors that keep their names (`a().conceptId()`, `b().bdsId()`, `severity()`, `routeAssumed()`, `source()`, `noData()`, `duplicates()`, `products().get(i).substances().get(j).coverage()`), so they hold unchanged.

In `DdinterTextTest.java`, replace the `InteractionAlert` lines with

```java
        var side = new CheckResult.Side("W-1", "Warin", "BDS-000001", "Warfarin", "systemic");
        var alert = new CheckResult.Alert("unknown", side, side, List.of(), "None", " - ", false, "DDInter1951", "DDInter20", null,
            "DDInter 2.0", PublicPairReviews.NONE);
        assertThat(alert.interaction()).isNull();
        assertThat(alert.management()).isNull();
        var real = new CheckResult.Alert("major", side, side, List.of(), "Bleeding risk.", "Avoid.", false, "DDInter1951", "DDInter20",
            null, "DDInter 2.0", PublicPairReviews.NONE);
```

(imports `CheckResult`, `PublicPairReviews`; drop `InteractionAlert`).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests CheckComputeTest`
Expected: compilation FAILS (`cannot find symbol: class Summary`, `constructor PairRow … 7 arguments`).

- [ ] **Step 3: Rewrite `CheckResult`, the port records, and delete `InteractionAlert`**

`CheckResult.java` (whole file):

```java
package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * POST /v1/interactions/check (§7.4 extended CheckResult). Counts follow §6.7.2 rule 5: only substance pairs of two
 * different approved products count; same-product and same-BDS pairs are listed but never counted. noData is kept for
 * compatibility (every approved product substance that cannot be checked).
 */
public record CheckResult(Summary summary, List<CheckedProduct> products, List<Alert> alerts, List<NoInteraction> noInteraction,
                          List<NotChecked> notChecked, List<Duplicate> duplicates, List<NoData> noData, List<NotReviewed> notReviewed) {
    public record Summary(int medicines, int totalPairs, int checkedPairs, int alertPairs, int noInteractionPairs, int notCheckedPairs,
                          int notReviewed, BySeverity bySeverity) {}
    public record BySeverity(int major, int moderate, int minor, int unknown) {}
    /** route: the clinical drug's route, null when the product has none (the checker's route-assumed lines name it). */
    public record CheckedProduct(String conceptId, String tradeName, String route, List<SubstanceCoverage> substances) {}
    /** ddinter: the chosen entries (the Chloramphenicol fix), empty when the substance cannot be checked. */
    public record SubstanceCoverage(String bdsId, String name, String coverage, List<Chosen> ddinter) {}
    public record Chosen(String ddinterId, String name, String routeScope, boolean routeAssumed) {}
    /** routeScope: the side's chosen entry's route; null when it has none. bdsId null: no substance mapping. */
    public record Side(String conceptId, String tradeName, String bdsId, String name, String routeScope) {}
    public record Alert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                        boolean routeAssumed, String ddinterA, String ddinterB, String interactionId, String source,
                        PairReviewRule.PublicReview pairReview) {
        /** A DDInter placeholder ("None", "-", blank) is no text: null, never shown as if it were advice. */
        public Alert {
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }
    /** Checked: both chosen entries have a full stored list, and DDInter lists no interaction between them (§6.7.2). */
    public record NoInteraction(Side a, Side b, String ddinterA, String ddinterB) {}
    /** side "a" or "b": the side the reason applies to; same_product names both ingredients of one product. */
    public record NotChecked(Side a, Side b, String reason, String side) {}
    public record Duplicate(String bdsId, String name, List<String> conceptIds) {}
    public record NoData(String conceptId, String bdsId, String name) {}
    /** A product left out because no pharmacist has approved it (public scope). Never "not found", never dropped. */
    public record NotReviewed(String conceptId, String tradeName) {}
}
```

```bash
git rm api/src/main/java/com/niramoy/bddrug/domain/InteractionAlert.java
```

`CheckQueryPort.java`: `PairRow` and `CheckData` become

```java
    record PairRow(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction,
                   String management, String interactionId) {}
    /**
     * pairs holds every stored pair whose two sides are both among the loaded DDInter codes. listedCodes holds the loaded
     * codes that have a curated.ddinter_drug row (their full pair list is stored, §7.4, §8.1 item 5). reviews (P1C): the
     * senior pair decisions among the loaded codes, keyed "a|b" (stored order), for the public pairReview (§7.4).
     * entryNames maps a code to DDInter's own name.
     */
    record CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                     Set<String> listedCodes, List<PairRow> pairs, Map<String, List<PairReviewRule.Decision>> reviews,
                     Map<String, String> entryNames) {
        public CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                         Set<String> listedCodes, List<PairRow> pairs) {
            this(products, ingredients, codesByBds, listedCodes, pairs, Map.of(), Map.of());
        }
    }
```

(P1C's six-argument canonical constructor becomes this seven-argument one; `PairReviewRule` is already imported by P1C.)

- [ ] **Step 4: Rewrite the service's computation**

`InteractionCheckService.java` (whole file):

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.application.port.CheckQueryPort.CheckData;
import com.niramoy.bddrug.application.port.CheckQueryPort.IngredientRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.PairRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.ProductRow;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.CheckResult.*;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.RouteRule;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.Severity;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.*;

/**
 * The interaction checker (§6.7.2, §7.4). Under public scope a product no pharmacist has approved is listed in
 * notReviewed (id and trade name) and takes no other part. Every substance pair of two different approved products is
 * either checked (an alert per stored row, or "no interaction listed") or not checked with a reason; same-product and
 * same-BDS pairs are listed and never counted. Nothing is silently dropped, so "no data" is never shown as "no
 * interactions".
 */
@Service
public class InteractionCheckService {
    public static final int MIN_IDS = 2, MAX_IDS = 20;
    public static final String SOURCE = "DDInter 2.0";
    static final String FIELD = "conceptIds";

    private final CheckQueryPort port;
    public InteractionCheckService(CheckQueryPort port) { this.port = port; }

    public Mono<CheckResult> check(List<String> conceptIds, Scope scope) {
        if (!valid(conceptIds))
            return Mono.error(new InvalidQueryException(FIELD, "conceptIds must hold 2-20 unique product IDs"));
        List<String> ids = List.copyOf(conceptIds);
        return port.load(ids).map(data -> compute(ids, data, scope));
    }

    static boolean valid(List<String> ids) {
        if (ids == null || ids.size() < MIN_IDS || ids.size() > MAX_IDS) return false;
        Set<String> seen = new HashSet<>();
        for (String id : ids)
            if (id == null || id.isBlank() || !seen.add(id)) return false;
        return true;
    }

    /** One product substance: its chosen entries, or the §6.7.2 rule 1 reason it cannot be checked. listed = a real ingredient row. */
    record Sub(String bdsId, String name, String coverage, RouteRule.Choice choice, String reason, boolean listed) {}
    record Prod(ProductRow row, List<Sub> subs) {}

    static CheckResult compute(List<String> ids, CheckData data, Scope scope) {
        Map<String, ProductRow> products = new HashMap<>();
        for (ProductRow p : data.products()) products.put(p.conceptId(), p);
        for (String id : ids)
            if (!products.containsKey(id)) throw new NotFoundException(FIELD, "Product not found: " + id);
        Map<String, List<IngredientRow>> ingredients = new HashMap<>();
        for (IngredientRow i : data.ingredients()) ingredients.computeIfAbsent(i.conceptId(), k -> new ArrayList<>()).add(i);
        Map<String, PairRow> pairs = new HashMap<>();
        for (PairRow p : data.pairs()) pairs.put(pairKey(p.ddinterA(), p.ddinterB()), p);

        List<CheckedProduct> checkedProducts = new ArrayList<>();
        List<NoData> noData = new ArrayList<>();
        List<NotReviewed> notReviewed = new ArrayList<>();
        List<Prod> prods = new ArrayList<>();
        for (String id : ids) {
            ProductRow p = products.get(id);
            if (scope == Scope.PUBLIC && !"ok".equals(p.reviewStatus())) {
                notReviewed.add(new NotReviewed(id, p.tradeName()));
                continue;
            }
            List<Sub> subs = substances(p, ingredients.getOrDefault(id, List.of()), data);
            prods.add(new Prod(p, subs));
            checkedProducts.add(new CheckedProduct(id, p.tradeName(), p.route(), subs.stream().filter(Sub::listed)
                .map(s -> new SubstanceCoverage(s.bdsId(), s.name(), s.coverage(), chosen(s, data))).toList()));
            for (Sub s : subs) if (s.reason() != null) noData.add(new NoData(id, s.bdsId(), s.name()));
        }

        List<NotChecked> notChecked = new ArrayList<>();
        for (Prod prod : prods)
            for (int i = 0; i < prod.subs().size(); i++)
                for (int j = i + 1; j < prod.subs().size(); j++) {
                    Sub a = prod.subs().get(i), b = prod.subs().get(j);
                    if (!same(a, b)) notChecked.add(new NotChecked(side(prod, a), side(prod, b), "same_product", "a"));
                }

        List<Alert> alerts = new ArrayList<>();
        List<NoInteraction> none = new ArrayList<>();
        Map<String, String> dupNames = new LinkedHashMap<>();
        Map<String, List<String>> dupConcepts = new LinkedHashMap<>();
        for (Prod prod : prods)
            for (Sub s : prod.subs())
                if (s.bdsId() != null) {
                    dupNames.putIfAbsent(s.bdsId(), s.name());
                    List<String> c = dupConcepts.computeIfAbsent(s.bdsId(), k -> new ArrayList<>());
                    if (!c.contains(prod.row().conceptId())) c.add(prod.row().conceptId());
                }
        int total = 0, checked = 0, alerted = 0;
        for (int i = 0; i < prods.size(); i++)
            for (int j = i + 1; j < prods.size(); j++) {
                Prod pa = prods.get(i), pb = prods.get(j);
                for (Sub a : pa.subs())
                    for (Sub b : pb.subs()) {
                        if (same(a, b)) continue;                       // rule 4: a duplicate, never a pair
                        total++;
                        if (a.reason() != null || b.reason() != null) {
                            boolean onA = b.reason() == null || (a.reason() != null
                                && BatchPairs.REASON_ORDER.indexOf(a.reason()) <= BatchPairs.REASON_ORDER.indexOf(b.reason()));
                            notChecked.add(new NotChecked(side(pa, a), side(pb, b), onA ? a.reason() : b.reason(), onA ? "a" : "b"));
                            continue;
                        }
                        checked++;
                        int before = alerts.size();
                        alertsFor(pa, a, pb, b, pairs, data.reviews(), alerts);
                        if (alerts.size() > before) alerted++;
                        else none.add(new NoInteraction(side(pa, a), side(pb, b), a.choice().codes().get(0).code(),
                            b.choice().codes().get(0).code()));
                    }
            }
        alerts.sort(Comparator.comparingInt((Alert x) -> Severity.rank(x.severity()))
            .thenComparing(x -> (x.a().tradeName() + " + " + x.b().tradeName()).toLowerCase(Locale.ROOT)));

        List<Duplicate> duplicates = new ArrayList<>();
        dupConcepts.forEach((bds, concepts) -> {
            if (concepts.size() > 1) duplicates.add(new Duplicate(bds, dupNames.get(bds), List.copyOf(concepts)));
        });
        int[] sev = new int[4];
        for (Alert a : alerts) sev[Severity.rank(a.severity())]++;
        Summary summary = new Summary(ids.size(), total, checked, alerted, checked - alerted, total - checked, notReviewed.size(),
            new BySeverity(sev[0], sev[1], sev[2], sev[3]));
        return new CheckResult(summary, checkedProducts, alerts, none, notChecked, duplicates, noData, notReviewed);
    }

    /**
     * One entry per substance (rows without a substance stay apart, by XM code). A product with no ingredient row at all
     * is one unmapped pseudo-substance named by its generic content, so its pairs are listed as not checked (G3).
     */
    private static List<Sub> substances(ProductRow p, List<IngredientRow> rows, CheckData data) {
        if (rows.isEmpty()) return List.of(new Sub(null, p.genericContentRaw(), "not_run", null, "unmapped", false));
        Map<String, Sub> byKey = new LinkedHashMap<>();
        for (IngredientRow r : rows) {
            if (r.bdsId() == null) {
                byKey.putIfAbsent("xm:" + r.xmCode(), new Sub(null, r.ingredientName(), "not_run", null, "unmapped", true));
                continue;
            }
            String coverage = r.coverage() != null ? r.coverage() : "not_run";      // §7.3: no coverage row = never ran
            RouteRule.Choice choice = "full".equals(coverage)
                ? RouteRule.choose(data.codesByBds().getOrDefault(r.bdsId(), List.of()), p.route()).orElse(null) : null;
            byKey.putIfAbsent("bds:" + r.bdsId(), new Sub(r.bdsId(), r.preferredName() != null ? r.preferredName() : r.ingredientName(),
                coverage, choice, reason(coverage, choice, data.listedCodes()), true));
        }
        List<Sub> out = new ArrayList<>(byKey.values());
        out.sort(Comparator.comparing((Sub s) -> s.name().toLowerCase(Locale.ROOT))
            .thenComparing(Sub::bdsId, Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }

    /** §6.7.2 rule 1. A chosen entry without a stored full pair list was never read in full: not_run (D41). */
    static String reason(String coverage, RouteRule.Choice choice, Set<String> listed) {
        if ("none".equals(coverage)) return "no_data";
        if (!"full".equals(coverage)) return "not_run";
        if (choice == null) return "no_route";
        return choice.codes().stream().allMatch(c -> listed.contains(c.code())) ? null : "not_run";
    }

    private static List<Chosen> chosen(Sub s, CheckData data) {
        if (s.reason() != null || s.choice() == null) return List.of();
        return s.choice().codes().stream().map(c -> new Chosen(c.code(), data.entryNames().get(c.code()), c.routeScope(),
            s.choice().routeAssumed())).toList();
    }

    private static boolean same(Sub a, Sub b) { return a.bdsId() != null && a.bdsId().equals(b.bdsId()); }

    private static Side side(Prod p, Sub s) {
        String scope = s.reason() == null && s.choice() != null ? s.choice().codes().get(0).routeScope() : null;
        return new Side(p.row().conceptId(), p.row().tradeName(), s.bdsId(), s.name(), scope);
    }

    private static void alertsFor(Prod pa, Sub a, Prod pb, Sub b, Map<String, PairRow> pairs,
                                  Map<String, List<PairReviewRule.Decision>> reviews, List<Alert> out) {
        boolean assumed = a.choice().routeAssumed() || b.choice().routeAssumed();
        Set<String> seen = new HashSet<>();
        for (DdinterCode ca : a.choice().codes())
            for (DdinterCode cb : b.choice().codes()) {
                if (ca.code().equals(cb.code())) continue;
                String key = pairKey(ca.code(), cb.code());
                PairRow pair = pairs.get(key);
                if (pair == null || !seen.add(key)) continue;
                // P1C's rule, as its alertsFor computed it: the coarse public form against the pair's current content hash
                String hash = PairContent.hash(pair.ddinterA(), pair.ddinterB(),
                    new PairContent.Content(pair.severity(), pair.actions(), pair.interaction(), pair.management()));
                out.add(new Alert(pair.severity(),
                    new Side(pa.row().conceptId(), pa.row().tradeName(), a.bdsId(), a.name(), ca.routeScope()),
                    new Side(pb.row().conceptId(), pb.row().tradeName(), b.bdsId(), b.name(), cb.routeScope()),
                    pair.actions(), pair.interaction(), pair.management(), assumed, pair.ddinterA(), pair.ddinterB(),
                    pair.interactionId(), SOURCE,
                    PairReviewRule.publicReview(reviews.getOrDefault(pair.ddinterA() + "|" + pair.ddinterB(), List.of()), hash)));
            }
    }

    /** ddinter_pair stores a < b in text order. */
    private static String pairKey(String x, String y) {
        return x.compareTo(y) < 0 ? x + "\u0000" + y : y + "\u0000" + x;
    }
}
```

In `R2dbcCheckAdapter.java` (as P1C left it: it injects `PairReviewReader pairReviews` and zips `pairReviews.forCodes(<loaded codes>, null)` with the pairs), make it compile until Task 9 without touching the review read: the pairs query maps `new PairRow(…, r.get("management", String.class), null)`, and the last line of `load` becomes

```java
            return codes(bds).flatMap(codes -> Mono.zip(pairs(codes.byBds()),
                    pairReviews.forCodes(codes.byBds().values().stream().flatMap(List::stream).map(DdinterCode::code).toList(), null))
                .map(p -> new CheckData(t.getT1(), t.getT2(), codes.byBds(), codes.listed(), p.getT1(), p.getT2(), Map.of())));
```

so every alert keeps its public `pairReview` through this task (P1C's `publicPairReviewIsReviewedOnlyForACurrentReview` and `PairQueueIntegrationTest.changedPairReturnsToQueue` stay green).

- [ ] **Step 5: Run the checker tests**

First make two edits in `VisibilityApiIntegrationTest.java`, because a not-reviewed product is now listed by name (§6.7.3 item 6), never dropped:

1. `publicCheckMovesUnapprovedProductsToNotReviewed` asserts `notReviewed[0].length()` = 1; it becomes 2 (`conceptId`, `tradeName`): change that line to `.jsonPath("$.data.notReviewed[0].tradeName").isEqualTo("Ecosprin")` and remove `"Ecosprin"` from that test's `doesNotContain` list.
2. P1C's `anApprovedThenRemovedProductIsNeverPublicOnAnyEndpoint`: add `.jsonPath("$.data.notReviewed[0].tradeName").isEqualTo("Motigut")` after its `notReviewed[*].conceptId` line, and change `assertThat(checked).doesNotContain("Motigut", "Domperidone", "BDS-000004");` to `assertThat(checked).doesNotContain("Domperidone", "BDS-000004");` (the trade name is the stub's; the substance and its id stay hidden).

Run: `cd api && ./gradlew test --no-daemon --tests CheckComputeTest --tests InteractionCheckServiceTest --tests DdinterTextTest --tests CheckApiIntegrationTest --tests VisibilityApiIntegrationTest --tests PairQueueIntegrationTest`
Expected: PASS, P1C's two `pairReview` tests included.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/CheckResult.java api/src/main/java/com/niramoy/bddrug/application/port/CheckQueryPort.java \
  api/src/main/java/com/niramoy/bddrug/application/InteractionCheckService.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java \
  api/src/test/java/com/niramoy/bddrug/CheckComputeTest.java api/src/test/java/com/niramoy/bddrug/InteractionCheckServiceTest.java \
  api/src/test/java/com/niramoy/bddrug/DdinterTextTest.java api/src/test/java/com/niramoy/bddrug/VisibilityApiIntegrationTest.java
git commit -m "feat(api): checker counting rule, not-checked reasons, no-interaction pairs and the extended CheckResult (§6.7.2, §7.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The checker reads entry names and interaction ids

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java`
- Test: `api/src/test/java/com/niramoy/bddrug/CheckApiIntegrationTest.java`

**Interfaces:**
- Consumes: Task 8 `CheckData(…, reviews, entryNames)`, `PairRow(…, interactionId)`; P1C's `pairReviews` field of `R2dbcCheckAdapter` (kept as it is: the decisions it reads already feed `pairReview`); Task 2 `PublicPairReviews.Pair` (only to hash the test's row).
- Produces: `POST /v1/interactions/check` with every §7.4 field filled from the database.

- [ ] **Step 1: Write the failing integration tests**

Append to `CheckApiIntegrationTest.java`. Its `check(String... ids)` helper (built on `all()`) reads with `scope=all` and the token; the public-scope test below posts without the token and seeds its own approvals. Add `import com.niramoy.bddrug.domain.PublicPairReviews;` and `import static com.niramoy.bddrug.TestSupport.exec;`.

```java
    // §11.3: eye drops + warfarin: no alert, chloramphenicol not in noData, the chosen entry is DDInter352, the pair is in noInteraction
    @Test void eyeDropsPlusWarfarinIsCheckedAgainstDDInter352WithNoAlert() {
        check("C-EYE", "W-1").expectStatus().isOk().expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0)
            .jsonPath("$.data.products[0].route").isEqualTo("ophthalmic")
            .jsonPath("$.data.products[0].substances[0].ddinter[0].ddinterId").isEqualTo("DDInter352")
            .jsonPath("$.data.products[0].substances[0].ddinter[0].name").isEqualTo("Chloramphenicol (ophthalmic)")
            .jsonPath("$.data.products[0].substances[0].ddinter[0].routeAssumed").isEqualTo(false)
            .jsonPath("$.data.noInteraction.length()").isEqualTo(1)
            .jsonPath("$.data.noInteraction[0].ddinterA").isEqualTo("DDInter352")
            .jsonPath("$.data.summary.checkedPairs").isEqualTo(1)
            .jsonPath("$.data.summary.alertPairs").isEqualTo(0)
            .jsonPath("$.data.summary.noInteractionPairs").isEqualTo(1);
    }

    @Test void capsulePlusWarfarinIsOneModerateAlertWithItsInteractionId() {
        check("C-CAP", "W-1").expectStatus().isOk().expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].ddinterA").isEqualTo("DDInter1951")
            .jsonPath("$.data.alerts[0].ddinterB").isEqualTo("DDInter351")
            .jsonPath("$.data.alerts[0].interactionId").isEqualTo("IA-2")
            .jsonPath("$.data.alerts[0].a.tradeName").isEqualTo("Chloramex")
            .jsonPath("$.data.alerts[0].a.routeScope").isEqualTo("systemic")
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("not_reviewed");
    }

    @Test void reasonsAndCounts() {
        // D-1 Domperidone: coverage none; X-NOSUB: no substance; A-NOBDC: no clinical drug, route assumed systemic
        check("W-1", "D-1", "X-NOSUB").expectStatus().isOk().expectBody()
            .jsonPath("$.data.notChecked[?(@.b.conceptId == 'D-1' && @.a.conceptId == 'W-1')].reason").isEqualTo("no_data")
            .jsonPath("$.data.notChecked[?(@.b.conceptId == 'X-NOSUB' && @.a.conceptId == 'W-1')].reason").isEqualTo("unmapped")
            .jsonPath("$.data.summary.medicines").isEqualTo(3)
            .jsonPath("$.data.summary.totalPairs").isEqualTo(3)
            .jsonPath("$.data.summary.notCheckedPairs").isEqualTo(3);
        check("W-1", "W-2").expectStatus().isOk().expectBody()
            .jsonPath("$.data.duplicates.length()").isEqualTo(1)
            .jsonPath("$.data.summary.totalPairs").isEqualTo(0);
    }

    @Test void aSubstanceWithNoCoverageRowIsNotRunNeverNoData() throws Exception {
        exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000120','Notrunol') ON CONFLICT DO NOTHING;
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
              VALUES ('BDS-000120','ICD11_XM','XM9NRN','any','dgda-ocl','xm',1.0) ON CONFLICT DO NOTHING;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              VALUES ('NR-1','120','Notrun','Test Pharma','Tablet','Notrunol 5 mg','parsed') ON CONFLICT DO NOTHING;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('NR-1','XM9NRN','Notrunol')
              ON CONFLICT DO NOTHING;
            """);
        check("W-1", "NR-1").expectStatus().isOk().expectBody()
            .jsonPath("$.data.notChecked[0].reason").isEqualTo("not_run")
            .jsonPath("$.data.notChecked[0].side").isEqualTo("b");
    }

    @Test void publicScopeListsNotReviewedByNameAndTheAlertCarriesItsPublicReview() throws Exception {
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('K-1', 3, now()) ON CONFLICT DO NOTHING;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('K-1','DGDA-Drugs','W-1','ok', now()), ('K-1','DGDA-Drugs','A-1','ok', now()), ('K-1','DGDA-Drugs','D-1','pending', now())
             ON CONFLICT DO NOTHING;
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at)
              VALUES ('DDInter1951','DDInter20','reviewed','','%s','{}','senior@example.org','senior','2026-10-16T05:20:00Z');
            """.formatted(new PublicPairReviews.Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"),
                "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
                "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.").hash()));
        web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of("W-1", "A-1", "D-1"))).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.notReviewed[0].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.notReviewed[0].tradeName").isEqualTo("Motigut")
            .jsonPath("$.data.summary.medicines").isEqualTo(3)
            .jsonPath("$.data.summary.notReviewed").isEqualTo(1)
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.alerts[0].pairReview.reviewedAt").isEqualTo("2026-10-16T05:20:00Z");
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests CheckApiIntegrationTest`
Expected: FAIL (`ddinter[0].name` is null, `interactionId` is null). The `pairReview` assertions already pass: P1C's read has been wired since Task 8.

- [ ] **Step 3: Read names and interaction ids in the adapter**

In `R2dbcCheckAdapter.java`:

1. The constructor and P1C's `pairReviews` field stay as they are (no second reader of `ops.pair_review`).
2. The codes query also selects the DDInter name: `SELECT c.bds_id, c.code, c.route_scope, d.ddinter_id IS NOT NULL AS listed, d.name FROM …`; `CodeRow` gains `String name`; `Codes` gains `Map<String, String> names` filled with `if (c.name() != null) names.put(c.code().code(), c.name());`.
3. The pairs query selects `p.interaction_id` and maps `new PairRow(…, r.get("management", String.class), r.get("interaction_id", String.class))`.
4. The last line of `load` (Task 8's) passes the names in place of `Map.of()`:

```java
            return codes(bds).flatMap(codes -> Mono.zip(pairs(codes.byBds()),
                    pairReviews.forCodes(codes.byBds().values().stream().flatMap(List::stream).map(DdinterCode::code).toList(), null))
                .map(p -> new CheckData(t.getT1(), t.getT2(), codes.byBds(), codes.listed(), p.getT1(), p.getT2(), codes.names())));
```

(`Codes.EMPTY` for no substances becomes `new Codes(Map.of(), Set.of(), Map.of())`.)

The check reads every pair among the selected products' entries, and every product in the check is public (unapproved ones never reach `products` under public scope), so `pairReview` is served only for pairs between public products (§7.4).

- [ ] **Step 4: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests CheckApiIntegrationTest --tests CheckComputeTest --tests VisibilityApiIntegrationTest --tests PairQueueIntegrationTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcCheckAdapter.java \
  api/src/test/java/com/niramoy/bddrug/CheckApiIntegrationTest.java
git commit -m "feat(api): checker names the chosen entries and serves each alert's interaction id (§7.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: "With other approved medicines" across every batch, grouped by partner substance (`PublicPairs`, pure)

**Files:**
- Modify: `api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java` (one word: `Use` becomes package-private)
- Create: `api/src/main/java/com/niramoy/bddrug/domain/PublicPairs.java`
- Test: `api/src/test/java/com/niramoy/bddrug/PublicPairsTest.java`

**Interfaces:**
- Consumes: `BatchPairs.Substance(String bdsId, String name, String coverage, List<DdinterCode> codes)`, `BatchPairs.use(Substance, String route, Set<String> complete)` (returns `Use(List<String> chosen, String reason)`), `BatchPairs.REASON_ORDER`, `RouteRule.choose`, `Severity.rank`, `DdinterText.clean`, Task 2 `PublicPairReviews.NONE`, P1C's `PairReviewRule.PublicReview`.
- Produces (§7.4 P10 shape, with two additive fields on `notChecked`: `route` and `brands`, because the §6.7.3 item 4 lines name a brand and a route):

```java
PublicPairs.PAGE_SIZE = 20, PublicPairs.BRANDS_MAX = 50, PublicPairs.SOURCE = "DDInter 2.0"
PublicPairs.Partner(String conceptId, String tradeName, String route, List<BatchPairs.Substance> substances)
PublicPairs.Row(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction, String management)
PublicPairs.SubstanceRef(String bdsId, String name)          PublicPairs.Brand(String conceptId, String tradeName)
PublicPairs.Pair(SubstanceRef substance, SubstanceRef partnerSubstance, String severity, List<String> actions, String interaction,
                 String management, String ddinterA, String ddinterB, boolean routeAssumed, String source,
                 PairReviewRule.PublicReview pairReview, List<Brand> brands, int brandCount)
PublicPairs.NotChecked(SubstanceRef substance, SubstanceRef partnerSubstance, String reason, String route, List<Brand> brands,
                       int brandCount)
PublicPairs.Result(String conceptId, int page, int totalPartners, List<Pair> partners, List<NotChecked> notChecked)
static Result compute(String conceptId, String route, List<BatchPairs.Substance> mine, List<Partner> partners, List<Row> rows,
                      Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews, int page)
```

Rules (§6.5 item 6, D60): only this product's substances with a usable entry take part (an unusable one already shows its own no-data, no-route or not-run block); a partner substance is grouped once per (this substance, partner substance), with every public brand that carries it; a stored row gives a pair entry (one per stored row, brands split by the entry their route chose); no stored row between usable sides is "no interaction listed" and is left out (§6.5: dropped from the product page); an unusable partner side gives a not-checked entry with its reason (and, for `no_route`, the brand's route). Groups run Major first (by their most severe pair), then not-checked groups (`no_data` before the other reasons), then by partner substance name; pages hold 20 groups; `totalPartners` counts groups.

- [ ] **Step 1: Write the failing test**

`PublicPairsTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.PublicPairs;
import com.niramoy.bddrug.domain.PublicPairs.*;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;

class PublicPairsTest {
    static BatchPairs.Substance sub(String bds, String name, String coverage, DdinterCode... codes) {
        return new BatchPairs.Substance(bds, name, coverage, List.of(codes));
    }
    static DdinterCode sys(String id) { return new DdinterCode(id, "systemic"); }

    static final BatchPairs.Substance ACETAMINOPHEN = sub("BDS-1", "Acetaminophen", "full", sys("DDInter14"));
    static final BatchPairs.Substance WARFARIN = sub("BDS-3", "Warfarin", "full", sys("DDInter1951"));
    static final BatchPairs.Substance CHLOR = sub("BDS-9", "Chloramphenicol", "full", sys("DDInter351"),
        new DdinterCode("DDInter352", "ophthalmic"));
    static final List<Partner> PARTNERS = List.of(
        new Partner("NAPA", "Napa", "systemic", List.of(ACETAMINOPHEN)),                          // this product: skipped
        new Partner("ACE", "Ace", "systemic", List.of(ACETAMINOPHEN)),                            // same substance: skipped
        new Partner("GW", "G Warfarin", "systemic", List.of(WARFARIN)),
        new Partner("WA", "Warin", "systemic", List.of(WARFARIN)),
        new Partner("EYE", "Chloramex Eye", "ophthalmic", List.of(CHLOR)),                         // DDInter352: no row
        new Partner("CAP", "Chloramex", "systemic", List.of(CHLOR)),
        new Partner("DOM", "Motigut", "systemic", List.of(sub("BDS-10", "Domperidone", "none"))),
        new Partner("OTI", "Otimol", "systemic", List.of(sub("BDS-7", "Oticmol", "full", new DdinterCode("DDInter700", "otic")))),
        new Partner("ASP", "Asprin", "systemic", List.of(sub("BDS-4", "Aspirin", "full", sys("DDInter20")))),
        new Partner("AMX", "Moxaclav", "systemic", List.of(sub("BDS-8", "Amoxicillin", "full", sys("DDInter83")),
            sub("BDS-11", "Clavulanic acid", "full", sys("DDInter394")))),
        new Partner("HERB", "Herbex", null, List.of(sub("BDS-12", "Herbalol", "full", sys("DDInter500")))));
    static final List<Row> ROWS = List.of(
        new Row("DDInter14", "DDInter1951", "moderate", List.of("synergy"), "potentiates", "monitor INR"),
        new Row("DDInter14", "DDInter20", "unknown", List.of("unknown"), null, "None"),
        new Row("DDInter14", "DDInter351", "unknown", List.of("unknown"), null, null),
        new Row("DDInter14", "DDInter83", "unknown", List.of("unknown"), null, null),
        new Row("DDInter14", "DDInter500", "minor", List.of(), null, null));
    static final Set<String> COMPLETE = Set.of("DDInter14", "DDInter1951", "DDInter20", "DDInter351", "DDInter352", "DDInter700",
        "DDInter83", "DDInter394", "DDInter500");

    static Result napa(List<Partner> partners, List<Row> rows, Map<String, PairReviewRule.PublicReview> reviews, int page) {
        return PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), partners, rows, COMPLETE, reviews, page);
    }

    @Test void groupsByPartnerSubstanceWithEveryPublicBrandMajorFirst() {
        Result r = napa(PARTNERS, ROWS, Map.of(), 0);
        assertThat(r.conceptId()).isEqualTo("NAPA");
        assertThat(r.totalPartners()).isEqualTo(7);
        assertThat(r.partners()).extracting(p -> p.partnerSubstance().name() + ":" + p.severity())
            .containsExactly("Warfarin:moderate", "Herbalol:minor", "Amoxicillin:unknown", "Aspirin:unknown", "Chloramphenicol:unknown");
        Pair w = r.partners().get(0);
        assertThat(w.substance()).isEqualTo(new SubstanceRef("BDS-1", "Acetaminophen"));
        assertThat(w.brands()).containsExactly(new Brand("GW", "G Warfarin"), new Brand("WA", "Warin"));
        assertThat(w.brandCount()).isEqualTo(2);
        assertThat(w.management()).isEqualTo("monitor INR");
        assertThat(w.source()).isEqualTo("DDInter 2.0");
        assertThat(w.pairReview()).isEqualTo(PublicPairReviews.NONE);
        assertThat(w.routeAssumed()).isFalse();
    }

    @Test void theEyeDropBrandNeverJoinsTheSystemicChloramphenicolPair() {
        Pair c = napa(PARTNERS, ROWS, Map.of(), 0).partners().stream()
            .filter(p -> p.partnerSubstance().name().equals("Chloramphenicol")).findFirst().orElseThrow();
        assertThat(c.brands()).containsExactly(new Brand("CAP", "Chloramex"));
        assertThat(c.ddinterB()).isEqualTo("DDInter351");
    }

    @Test void unusablePartnersAreNotCheckedWithTheirReasonNeverDropped() {
        Result r = napa(PARTNERS, ROWS, Map.of(), 0);
        assertThat(r.notChecked()).containsExactly(
            new NotChecked(new SubstanceRef("BDS-1", "Acetaminophen"), new SubstanceRef("BDS-10", "Domperidone"), "no_data", null,
                List.of(new Brand("DOM", "Motigut")), 1),
            new NotChecked(new SubstanceRef("BDS-1", "Acetaminophen"), new SubstanceRef("BDS-7", "Oticmol"), "no_route", "systemic",
                List.of(new Brand("OTI", "Otimol")), 1));
    }

    @Test void aPartnerWithNoStoredRowIsLeftOut() {
        assertThat(napa(PARTNERS, ROWS, Map.of(), 0).partners()).noneMatch(p -> p.partnerSubstance().name().equals("Clavulanic acid"));
    }

    @Test void aPlaceholderTextIsNoText() {
        Pair a = napa(PARTNERS, ROWS, Map.of(), 0).partners().stream()
            .filter(p -> p.partnerSubstance().name().equals("Aspirin")).findFirst().orElseThrow();
        assertThat(a.management()).isNull();
    }

    @Test void aPartnerWithNoRouteIsRouteAssumed() {
        Pair h = napa(PARTNERS, ROWS, Map.of(), 0).partners().get(1);
        assertThat(h.partnerSubstance().name()).isEqualTo("Herbalol");
        assertThat(h.routeAssumed()).isTrue();
    }

    @Test void theReviewStateComesFromThePairKey() {
        PairReviewRule.PublicReview reviewed = new PairReviewRule.PublicReview("reviewed", Instant.parse("2026-10-16T05:20:00Z"));
        assertThat(napa(PARTNERS, ROWS, Map.of("DDInter14|DDInter1951", reviewed), 0).partners().get(0).pairReview()).isEqualTo(reviewed);
    }

    @Test void brandsAreCappedButCountedInFull() {
        List<Partner> many = new ArrayList<>();
        IntStream.range(0, 60).forEach(i -> many.add(new Partner("W" + i, String.format("Warfarin brand %02d", i), "systemic", List.of(WARFARIN))));
        Pair w = napa(many, ROWS, Map.of(), 0).partners().get(0);
        assertThat(w.brands()).hasSize(50);
        assertThat(w.brandCount()).isEqualTo(60);
        assertThat(w.brands().get(0).tradeName()).isEqualTo("Warfarin brand 00");
    }

    @Test void pagesHoldTwentyPartnerSubstances() {
        List<Partner> many = new ArrayList<>();
        List<Row> rows = new ArrayList<>();
        IntStream.range(0, 25).forEach(i -> {
            String id = "DDInter" + (1000 + i);
            many.add(new Partner("P" + i, "Brand " + i, "systemic", List.of(sub("BDS-" + (100 + i), String.format("Partner %02d", i), "full", sys(id)))));
            rows.add(new Row("DDInter14", id, "unknown", List.of(), null, null));
        });
        Set<String> complete = new HashSet<>(COMPLETE);
        rows.forEach(r -> complete.add(r.ddinterB()));
        Result p0 = PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), many, rows, complete, Map.of(), 0);
        Result p1 = PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), many, rows, complete, Map.of(), 1);
        Result p9 = PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), many, rows, complete, Map.of(), 9);
        assertThat(p0.totalPartners()).isEqualTo(25);
        assertThat(p0.partners()).hasSize(20);
        assertThat(p1.partners()).hasSize(5);
        assertThat(p1.partners().get(0).partnerSubstance().name()).isEqualTo("Partner 20");
        assertThat(p9.partners()).isEmpty();
        assertThat(p9.page()).isEqualTo(9);
    }

    @Test void anUnusableSubstanceOfThisProductTakesNoPart() {
        Result r = PublicPairs.compute("DOMP", "systemic", List.of(sub("BDS-10", "Domperidone", "none")), PARTNERS, ROWS, COMPLETE, Map.of(), 0);
        assertThat(r.totalPartners()).isZero();
        assertThat(r.partners()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests PublicPairsTest`
Expected: compilation FAILS (`cannot find symbol: class PublicPairs`).

- [ ] **Step 3: Share `BatchPairs.use`**

In `BatchPairs.java`, change `private record Use(List<String> chosen, String reason) {}` to `record Use(List<String> chosen, String reason) {}` (package-private, so `PublicPairs` in the same package shares the one rule; §7.3 "the pair and not-checked logic … is shared … so the two never disagree"). P1C keeps it private (its Task 6), so this one-word change is P2's.

- [ ] **Step 4: Write `PublicPairs`**

```java
package com.niramoy.bddrug.domain;
import java.util.*;

/**
 * §6.5 "With other approved medicines" and §7.4 P10 (D60): this product's DDInter pairs with every other public product
 * of any batch, grouped by partner substance, with RouteRule on both sides (BatchPairs.use, one rule). Pure. Linear in
 * partners × substances; no batch-wide count.
 */
public final class PublicPairs {
    private PublicPairs() {}

    public static final int PAGE_SIZE = 20, BRANDS_MAX = 50;
    public static final String SOURCE = "DDInter 2.0";

    public record Partner(String conceptId, String tradeName, String route, List<BatchPairs.Substance> substances) {}
    public record Row(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction, String management) {
        public Row {
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }
    public record SubstanceRef(String bdsId, String name) {}
    public record Brand(String conceptId, String tradeName) {}
    public record Pair(SubstanceRef substance, SubstanceRef partnerSubstance, String severity, List<String> actions, String interaction,
                       String management, String ddinterA, String ddinterB, boolean routeAssumed, String source,
                       PairReviewRule.PublicReview pairReview, List<Brand> brands, int brandCount) {}
    /** route: the partner brands' route for no_route (they share it), else null. */
    public record NotChecked(SubstanceRef substance, SubstanceRef partnerSubstance, String reason, String route, List<Brand> brands,
                             int brandCount) {}
    public record Result(String conceptId, int page, int totalPartners, List<Pair> partners, List<NotChecked> notChecked) {}

    private static final Comparator<Brand> BRAND_ORDER = Comparator
        .comparing((Brand b) -> b.tradeName().toLowerCase(Locale.ROOT)).thenComparing(Brand::conceptId);

    private static final class Brands {
        final Map<String, Brand> byId = new LinkedHashMap<>();
        void add(Brand b) { byId.putIfAbsent(b.conceptId(), b); }
        List<Brand> capped() { return byId.values().stream().sorted(BRAND_ORDER).limit(BRANDS_MAX).toList(); }
    }
    private static final class PairAcc {
        final Row row; final Brands brands = new Brands(); boolean assumed;
        PairAcc(Row row) { this.row = row; }
    }
    private static final class NcAcc {
        final String reason, route; final Brands brands = new Brands();
        NcAcc(String reason, String route) { this.reason = reason; this.route = route; }
    }
    private static final class Group {
        final SubstanceRef substance, partner;
        final Map<String, PairAcc> pairs = new LinkedHashMap<>();
        final Map<String, NcAcc> notChecked = new LinkedHashMap<>();
        Group(SubstanceRef substance, SubstanceRef partner) { this.substance = substance; this.partner = partner; }
        int rank() {
            if (!pairs.isEmpty()) return pairs.values().stream().mapToInt(p -> Severity.rank(p.row.severity())).min().orElse(3);
            return notChecked.containsKey("no_data") ? 4 : 5;
        }
    }

    private static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }
    private static SubstanceRef ref(BatchPairs.Substance s) { return new SubstanceRef(s.bdsId(), s.name()); }
    private static boolean assumed(BatchPairs.Substance s, String route) {
        return RouteRule.choose(s.codes(), route).map(RouteRule.Choice::routeAssumed).orElse(false);
    }

    public static Result compute(String conceptId, String route, List<BatchPairs.Substance> mine, List<Partner> partners, List<Row> rows,
                                 Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews, int page) {
        Map<String, Row> byKey = new HashMap<>();
        for (Row r : rows) byKey.put(key(r.ddinterA(), r.ddinterB()), r);
        Map<String, Group> groups = new LinkedHashMap<>();
        for (BatchPairs.Substance s : mine) {
            BatchPairs.Use us = BatchPairs.use(s, route, complete);
            if (us.reason() != null) continue;
            boolean sAssumed = assumed(s, route);
            for (Partner q : partners) {
                if (q.conceptId().equals(conceptId)) continue;
                Brand brand = new Brand(q.conceptId(), q.tradeName());
                for (BatchPairs.Substance t : q.substances()) {
                    if (t.bdsId() != null && t.bdsId().equals(s.bdsId())) continue;
                    String gk = s.bdsId() + "|" + (t.bdsId() != null ? t.bdsId() : "name:" + t.name());
                    Group g = groups.computeIfAbsent(gk, k -> new Group(ref(s), ref(t)));
                    BatchPairs.Use ut = BatchPairs.use(t, q.route(), complete);
                    if (ut.reason() != null) {
                        String r = ut.reason(), rt = "no_route".equals(r) ? q.route() : null;
                        g.notChecked.computeIfAbsent(r + "|" + rt, k -> new NcAcc(r, rt)).brands.add(brand);
                        continue;
                    }
                    boolean tAssumed = assumed(t, q.route());
                    for (String a : us.chosen())
                        for (String b : ut.chosen()) {
                            Row row = byKey.get(key(a, b));
                            if (row == null) continue;
                            PairAcc acc = g.pairs.computeIfAbsent(key(a, b), k -> new PairAcc(row));
                            acc.brands.add(brand);
                            acc.assumed |= sAssumed || tAssumed;
                        }
                }
            }
        }
        List<Group> ordered = groups.values().stream().filter(g -> !g.pairs.isEmpty() || !g.notChecked.isEmpty())
            .sorted(Comparator.comparingInt(Group::rank)
                .thenComparing(g -> g.partner.name().toLowerCase(Locale.ROOT))
                .thenComparing(g -> g.substance.name().toLowerCase(Locale.ROOT)))
            .toList();
        int from = Math.min(page * PAGE_SIZE, ordered.size()), to = Math.min(from + PAGE_SIZE, ordered.size());
        List<Pair> pairs = new ArrayList<>();
        List<NotChecked> notChecked = new ArrayList<>();
        for (Group g : ordered.subList(from, to)) {
            g.pairs.values().stream()
                .sorted(Comparator.comparingInt((PairAcc p) -> Severity.rank(p.row.severity()))
                    .thenComparing(p -> p.row.ddinterA()).thenComparing(p -> p.row.ddinterB()))
                .forEach(p -> pairs.add(new Pair(g.substance, g.partner, p.row.severity(), p.row.actions(), p.row.interaction(),
                    p.row.management(), p.row.ddinterA(), p.row.ddinterB(), p.assumed, SOURCE,
                    reviews.getOrDefault(p.row.ddinterA() + "|" + p.row.ddinterB(), PublicPairReviews.NONE),
                    p.brands.capped(), p.brands.byId.size())));
            g.notChecked.values().stream()
                .sorted(Comparator.comparingInt((NcAcc n) -> BatchPairs.REASON_ORDER.indexOf(n.reason))
                    .thenComparing(n -> String.valueOf(n.route)))
                .forEach(n -> notChecked.add(new NotChecked(g.substance, g.partner, n.reason, n.route, n.brands.capped(),
                    n.brands.byId.size())));
        }
        return new Result(conceptId, page, ordered.size(), List.copyOf(pairs), List.copyOf(notChecked));
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests PublicPairsTest --tests BatchPairsTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/BatchPairs.java api/src/main/java/com/niramoy/bddrug/domain/PublicPairs.java \
  api/src/test/java/com/niramoy/bddrug/PublicPairsTest.java
git commit -m "feat(api): public pairs with approved products of every batch, grouped by partner substance (§6.5, D60)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `GET /v1/products/{id}/interactions` (P10 across batches)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/application/port/ProductInteractionsPort.java`
- Create: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcProductInteractionsAdapter.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/presentation/ProductController.java`
- Modify: `api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java` (constructor)
- Test: `api/src/test/java/com/niramoy/bddrug/ProductInteractionsApiIntegrationTest.java`, `api/src/test/java/com/niramoy/bddrug/ProductInteractionsScaleIntegrationTest.java`

**Interfaces:**
- Consumes: Task 10 `PublicPairs.compute`, Task 2 `PublicPairReviews` (`Pair`, `codes`, `of`), P1C's `PairReviewReader.forCodes(Collection<String>, String viewerEmail)`, Task 1 `ProductQueryService.stub`, `ReviewSql.LATEST_PUBLIC`.
- Produces: `ProductInteractionsPort.Facts(String route, List<BatchPairs.Substance> mine, List<PublicPairs.Partner> partners, List<PublicPairs.Row> rows, Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews)`; `ProductInteractionsPort.facts(String conceptId) : Mono<Facts>`; `ProductQueryService(ProductQueryPort, ProductDetailPort, ProductInteractionsPort)`; `ProductQueryService.interactions(String conceptId, int page, Scope scope) : Mono<Object>` (`PublicPairs.Result`, or the stub, or empty when unknown); `GET /v1/products/{id}/interactions?page=` (`page` 0–10000, else 400 `field=page`; 404 when unknown).

- [ ] **Step 1: Write the failing integration test**

`ProductInteractionsApiIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PublicPairReviews;
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
 * §7.4 P10 across batches. Napa (N-1) is approved in X-1; Warin (W-1) in X-1 and Coumarol (W-2) in X-2 (two batches,
 * one partner substance); Motigut (D-1, no data) in X-2; Ecosprin (A-1) is pending; Warremo was approved, then removed
 * from its batch file.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductInteractionsApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('W-REM','014','Warremo','Test Pharma','Tablet','Warfarin Sodium 5 mg','BDC-000001','parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('W-REM','XM5S93','Warfarin');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('X-1', 3, now() - interval '2 hour'), ('X-2', 4, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('X-1','DGDA-Drugs','N-1','ok',NULL, now() - interval '2 hour'),
             ('X-1','DGDA-Drugs','W-1','ok',NULL, now() - interval '2 hour'),
             ('X-1','DGDA-Drugs','A-1','pending',NULL, now() - interval '2 hour'),
             ('X-2','DGDA-Drugs','W-2','ok',NULL, now() - interval '1 hour'),
             ('X-2','DGDA-Drugs','D-1','ok',NULL, now() - interval '1 hour'),
             ('X-2','DGDA-Drugs','C-EYE','ok',NULL, now() - interval '1 hour'),
             ('X-2','DGDA-Drugs','W-REM','ok','removed from batch file', now() - interval '1 hour');
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at)
              VALUES ('DDInter14','DDInter1951','reviewed','','%s','{}','senior@example.org','senior','2026-10-16T05:20:00Z');
            """.formatted(new PublicPairReviews.Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null).hash()));
    }

    @Autowired WebTestClient web;

    @Test void partnersFromEveryBatchGroupedByPartnerSubstance() {
        String body = new String(web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.conceptId").isEqualTo("N-1")
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.totalPartners").isEqualTo(2)
            .jsonPath("$.data.partners.length()").isEqualTo(1)
            .jsonPath("$.data.partners[0].substance.name").isEqualTo("Acetaminophen")
            .jsonPath("$.data.partners[0].partnerSubstance.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.partners[0].partnerSubstance.name").isEqualTo("Warfarin")
            .jsonPath("$.data.partners[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.partners[0].ddinterA").isEqualTo("DDInter14")
            .jsonPath("$.data.partners[0].ddinterB").isEqualTo("DDInter1951")
            .jsonPath("$.data.partners[0].source").isEqualTo("DDInter 2.0")
            .jsonPath("$.data.partners[0].brandCount").isEqualTo(2)
            .jsonPath("$.data.partners[0].brands[0].tradeName").isEqualTo("Coumarol")
            .jsonPath("$.data.partners[0].brands[1].tradeName").isEqualTo("Warin")
            .jsonPath("$.data.partners[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.partners[0].pairReview.reviewedAt").isEqualTo("2026-10-16T05:20:00Z")
            .jsonPath("$.data.notChecked.length()").isEqualTo(1)
            .jsonPath("$.data.notChecked[0].partnerSubstance.name").isEqualTo("Domperidone")
            .jsonPath("$.data.notChecked[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.notChecked[0].brandCount").isEqualTo(1)
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        // a pending partner and a removed partner are never shown (§7.4 visibility rule, PO D7)
        assertThat(body).doesNotContain("Ecosprin", "A-1", "Warremo", "W-REM", "Acetylsalicylic acid");
    }

    @Test void aProductThatIsNotPublicIsTheStubAndUnknownIs404() {
        web.get().uri("/v1/products/A-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").isEqualTo(true)
            .jsonPath("$.data.status").isEqualTo("not_reviewed")
            .jsonPath("$.data.partners").doesNotExist();
        web.get().uri("/v1/products/W-REM/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.status").isEqualTo("removed");
        web.get().uri("/v1/products/nope/interactions").exchange().expectStatus().isNotFound();
    }

    @Test void pagesAndBadPages() {
        web.get().uri("/v1/products/N-1/interactions?page=1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.page").isEqualTo(1)
            .jsonPath("$.data.totalPartners").isEqualTo(2)
            .jsonPath("$.data.partners.length()").isEqualTo(0);
        web.get().uri("/v1/products/N-1/interactions?page=-1").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("page");
    }
}
```

`ProductInteractionsScaleIntegrationTest.java`:

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
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * P10 at scale (§10.6 API p95 ≤ 300 ms): 5,000 approved products in five batches, carrying 200 substances that each
 * pair with Acetaminophen. Coarse bounds: p95 over 20 calls, and a page under 200 KB.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductInteractionsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name) SELECT 'BDS-L' || i, 'Scalol ' || i FROM generate_series(1, 200) i;
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
              SELECT 'BDS-L' || i, 'ICD11_XM', 'XML' || i, 'any', 'dgda-ocl', 'xm', 1.0 FROM generate_series(1, 200) i;
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
              SELECT 'BDS-L' || i, 'DDINTER', 'DDInter9' || lpad(i::text, 4, '0'), 'systemic', 'ddinter2', 'drugbank', 1.0 FROM generate_series(1, 200) i;
            INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope)
              SELECT 'DDInter9' || lpad(i::text, 4, '0'), 'Scalol ' || i, 'systemic' FROM generate_series(1, 200) i;
            INSERT INTO curated.interaction_coverage (bds_id, coverage, note) SELECT 'BDS-L' || i, 'full', 'x' FROM generate_series(1, 200) i;
            INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b)
              SELECT 'DDInter14', 'DDInter9' || lpad(i::text, 4, '0'), 'unknown', '{}', 'Acetaminophen', 'Scalol ' || i FROM generate_series(1, 200) i;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              SELECT 'L-' || i, 'L' || i, 'Scale brand ' || i, 'Co', 'Tablet', 'Scalol', 'parsed' FROM generate_series(1, 5000) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'L-' || i, 'XML' || (1 + i % 200), 'Scalol' FROM generate_series(1, 5000) i;
            INSERT INTO ops.batch (batch_id, item_count, run_at) SELECT 'LB-' || b, 1000, now() FROM generate_series(1, 5) b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at)
              SELECT 'LB-' || (1 + (i - 1) / 1000), 'DGDA-Drugs', 'L-' || i, 'ok', now() FROM generate_series(1, 5000) i;
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('LN', 1, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES ('LN','DGDA-Drugs','N-1','ok', now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void p95Under300msAndAPageUnder200KB() {
        for (int i = 0; i < 3; i++) web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk();
        List<Long> ms = new ArrayList<>();
        int size = 0;
        for (int i = 0; i < 20; i++) {
            long t = System.nanoTime();
            byte[] body = web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            ms.add((System.nanoTime() - t) / 1_000_000);
            size = body.length;
        }
        Collections.sort(ms);
        assertThat(ms.get(18)).as("p95 ms").isLessThanOrEqualTo(300L);
        assertThat(size).as("bytes").isLessThan(200_000);
        web.get().uri("/v1/products/N-1/interactions").exchange().expectBody()
            .jsonPath("$.data.totalPartners").isEqualTo(200)
            .jsonPath("$.data.partners.length()").isEqualTo(20)
            .jsonPath("$.data.partners[0].brandCount").isEqualTo(25)
            .jsonPath("$.data.partners[0].brands.length()").isEqualTo(25);
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests ProductInteractionsApiIntegrationTest`
Expected: FAIL (404: no handler for `/v1/products/N-1/interactions`).

- [ ] **Step 3: Port and adapter**

`ProductInteractionsPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairs;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Facts for §7.4 P10: this product, every other public product of any batch, and the stored pairs touching this product. */
public interface ProductInteractionsPort {
    record Facts(String route, List<BatchPairs.Substance> mine, List<PublicPairs.Partner> partners, List<PublicPairs.Row> rows,
                 Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews) {}
    Mono<Facts> facts(String conceptId);
}
```

`R2dbcProductInteractionsAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ProductInteractionsPort;
import com.niramoy.bddrug.domain.*;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.util.*;

/**
 * P10 reads, set-based (§7.3 "never one query per batch"): one product-and-ingredient query (this product plus every
 * public product, through ReviewSql.LATEST_PUBLIC), one code query, one pair query restricted to this product's chosen
 * entries, and P1C's one pair-review query (PairReviewReader).
 */
@Component
public class R2dbcProductInteractionsAdapter implements ProductInteractionsPort {
    private record Line(String conceptId, String tradeName, String route, String xmCode, String ingredient, String bdsId,
                        String preferredName, String coverage) {}
    private record Code(String bdsId, DdinterCode code, boolean listed) {}

    private final DatabaseClient db;
    private final PairReviewReader pairReviews;
    public R2dbcProductInteractionsAdapter(DatabaseClient db, PairReviewReader pairReviews) {
        this.db = db;
        this.pairReviews = pairReviews;
    }

    @Override public Mono<Facts> facts(String conceptId) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " + """
                , prods AS (SELECT bp.concept_id, bp.trade_name, cd.route FROM curated.brand_product bp
                            LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                            LEFT JOIN latest l ON l.concept_id = bp.concept_id
                            WHERE bp.concept_id = :c OR coalesce(l.pub, false))
                SELECT p.concept_id, p.trade_name, p.route, bpi.xm_code, bpi.ingredient_name, s.bds_id, s.preferred_name, ic.coverage
                FROM prods p
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = p.concept_id
                LEFT JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = x.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = s.bds_id
                ORDER BY p.concept_id, bpi.xm_code""")
            .bind("c", conceptId)
            .map(r -> new Line(r.get("concept_id", String.class), r.get("trade_name", String.class), r.get("route", String.class),
                r.get("xm_code", String.class), r.get("ingredient_name", String.class), r.get("bds_id", String.class),
                r.get("preferred_name", String.class), r.get("coverage", String.class)))
            .all().collectList()
            .flatMap(lines -> {
                String[] bds = lines.stream().map(Line::bdsId).filter(Objects::nonNull).distinct().toArray(String[]::new);
                return codes(bds).flatMap(codes -> assemble(conceptId, lines, codes));
            });
    }

    private Mono<List<Code>> codes(String[] bds) {
        if (bds.length == 0) return Mono.just(List.of());
        return db.sql("""
                SELECT c.bds_id, c.code, c.route_scope, d.ddinter_id IS NOT NULL AS listed
                FROM curated.substance_code c LEFT JOIN curated.ddinter_drug d ON d.ddinter_id = c.code
                WHERE c.system = 'DDINTER' AND c.bds_id = ANY(:bds)""")
            .bind("bds", bds)
            .map(r -> new Code(r.get("bds_id", String.class), new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class)),
                Boolean.TRUE.equals(r.get("listed", Boolean.class))))
            .all().collectList();
    }

    private Mono<Facts> assemble(String conceptId, List<Line> lines, List<Code> codes) {
        Map<String, List<DdinterCode>> byBds = new HashMap<>();
        Set<String> complete = new HashSet<>();
        for (Code c : codes) {
            byBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(c.code());
            if (c.listed()) complete.add(c.code().code());
        }
        Map<String, PublicPairs.Partner> products = new LinkedHashMap<>();
        Map<String, Map<String, BatchPairs.Substance>> subs = new LinkedHashMap<>();
        for (Line l : lines) {
            products.putIfAbsent(l.conceptId(), new PublicPairs.Partner(l.conceptId(), l.tradeName(), l.route(), List.of()));
            String key = l.bdsId() != null ? "bds:" + l.bdsId() : "xm:" + l.xmCode();
            subs.computeIfAbsent(l.conceptId(), k -> new LinkedHashMap<>()).putIfAbsent(key, new BatchPairs.Substance(l.bdsId(),
                l.bdsId() != null && l.preferredName() != null ? l.preferredName() : l.ingredient(), l.coverage(),
                l.bdsId() == null ? List.of() : byBds.getOrDefault(l.bdsId(), List.of())));
        }
        List<PublicPairs.Partner> partners = new ArrayList<>();
        products.forEach((id, p) -> partners.add(new PublicPairs.Partner(id, p.tradeName(), p.route(),
            List.copyOf(subs.getOrDefault(id, Map.of()).values()))));
        PublicPairs.Partner me = partners.stream().filter(p -> p.conceptId().equals(conceptId)).findFirst()
            .orElse(new PublicPairs.Partner(conceptId, "", null, List.of()));
        Set<String> chosen = new TreeSet<>();
        for (BatchPairs.Substance s : me.substances())
            RouteRule.choose(s.codes(), me.route()).ifPresent(c -> c.codes().forEach(x -> chosen.add(x.code())));
        Mono<List<PublicPairs.Row>> rows = chosen.isEmpty() ? Mono.just(List.of()) : db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.severity, p.actions, t.interaction, t.management
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE p.ddinter_a = ANY(:ids) OR p.ddinter_b = ANY(:ids)""")
            .bind("ids", chosen.toArray(String[]::new))
            .map(r -> new PublicPairs.Row(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("severity", String.class),
                R2dbcSubstanceAdapter.list(r, "actions"), r.get("interaction", String.class), r.get("management", String.class)))
            .all().collectList();
        return rows.flatMap(list -> {
            List<PublicPairReviews.Pair> pairs = list.stream().map(r -> new PublicPairReviews.Pair(r.ddinterA(), r.ddinterB(),
                r.severity(), r.actions(), r.interaction(), r.management())).toList();
            return pairReviews.forCodes(PublicPairReviews.codes(pairs), null).map(d -> PublicPairReviews.of(pairs, d))
                .map(rv -> new Facts(me.route(), me.substances(), partners, list, complete, rv));
        });
    }
}
```

The `partners` list includes this product itself; `PublicPairs.compute` skips it by concept id. Every pair `PublicPairs.compute` serves is between this public product and a public partner (the partner list is `LATEST_PUBLIC`), so a `pairReview` is only ever served for pairs between public products (§7.4); the rows read here may also touch non-public entries, but `compute` never emits those. The review hash is `PairContent`'s, which cleans the texts (§7.7).

- [ ] **Step 4: Service and controller**

`ProductQueryService.java`: add the third port (constructor `ProductQueryService(ProductQueryPort port, ProductDetailPort details, ProductInteractionsPort interactions)`) and

```java
    public static final int INTERACTIONS_PAGE_MAX = 10_000;

    /** §7.4 P10: the grouped pairs of a public product; the stub when it is not public; empty when unknown. */
    public Mono<Object> interactions(String conceptId, int page, Scope scope) {
        if (page < 0 || page > INTERACTIONS_PAGE_MAX)
            return Mono.error(new InvalidQueryException("page", "page must be 0-" + INTERACTIONS_PAGE_MAX));
        return port.findByConceptId(conceptId).flatMap(p -> {
            if (scope == Scope.PUBLIC && !"ok".equals(p.reviewStatus()))
                return port.latestItem(conceptId).map(Optional::of).defaultIfEmpty(Optional.empty())
                    .map(item -> (Object) stub(p, item.orElse(null)));
            return interactions.facts(conceptId).map(f -> (Object) PublicPairs.compute(conceptId, f.route(), f.mine(), f.partners(),
                f.rows(), f.complete(), f.reviews(), page));
        });
    }
```

(imports `ProductInteractionsPort`, `PublicPairs`). In `ProductQueryServiceTest.java`, the constructor calls become `new ProductQueryService(port, DETAILS, c -> Mono.empty())`.

`ProductController.java`: add

```java
    /** §7.4 P10. Under public scope a product that is not public is the stub (as GET /v1/products/{id}), never a result. */
    @GetMapping("/{conceptId}/interactions")
    public Mono<ApiResponse<Object>> interactions(@PathVariable String conceptId, @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(required = false) String scope,
                                                  @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.interactions(conceptId, page, auth.scope(scope, token)).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found")));
    }
```

- [ ] **Step 5: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests ProductInteractionsApiIntegrationTest --tests ProductInteractionsScaleIntegrationTest --tests ProductQueryServiceTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/application/port/ProductInteractionsPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcProductInteractionsAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java \
  api/src/main/java/com/niramoy/bddrug/presentation/ProductController.java \
  api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java \
  api/src/test/java/com/niramoy/bddrug/ProductInteractionsApiIntegrationTest.java \
  api/src/test/java/com/niramoy/bddrug/ProductInteractionsScaleIntegrationTest.java
git commit -m "feat(api): GET /v1/products/{id}/interactions across batches, grouped by partner substance (§7.4 P10, D60)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Search with synonyms, DAR numbers and stubs (`GET /v1/search`, P1–P4)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/SearchResult.java`
- Create: `api/src/main/java/com/niramoy/bddrug/domain/SearchPage.java`
- Create: `api/src/main/java/com/niramoy/bddrug/application/port/SearchPort.java`
- Create: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSearchAdapter.java`
- Create: `api/src/main/java/com/niramoy/bddrug/application/SearchQueryService.java`
- Create: `api/src/main/java/com/niramoy/bddrug/presentation/SearchController.java`
- Test: `api/src/test/java/com/niramoy/bddrug/SearchPageTest.java`, `api/src/test/java/com/niramoy/bddrug/SearchApiIntegrationTest.java`

**Interfaces:**
- Consumes: `ReviewSql.LATEST_PUBLIC`; `R2dbcProductAdapter.likePattern(String)` (package-private static: `%` + escaped term + `%`); `DdinterCode.ID_ORDER`.
- Produces:
  - `SearchResult(String query, long total, boolean hasMore, Counts counts, List<SubstanceHit> substances, List<Object> products, String suggestion)` with `Counts(long substances, long products)`, `SubstanceHit(String bdsId, String preferredName, String matchedName, String matchedNameType, List<String> otherNameTypes, String coverage, List<String> ddinterIds, KeyCodes keyCodes, long approvedProductCount)`, `KeyCodes(List<String> atc, List<String> rxcui)`, `ProductHit(String conceptId, String tradeName, String darNumber, String company, String dosageForm, String genericContentRaw, ClinicalRef clinicalDrug, String matchedOn, String matchedName, String status)` (`status` = `approved`), `ClinicalRef(String bdcId, String displayName)`, `StubHit(String conceptId, String tradeName, String status)` (`status` = `not_reviewed`, `hidden: true`). `counts` is additive to the §7.4 row: the §6.3 count line needs "{s} substance[s], {p} product[s]" for the whole result, not the page.
  - `matchedNameType` ∈ `preferred`, `dgda_content`, `rxnorm`, `ddinter`, `icd11`; `otherNameTypes` lists the other name systems that use the preferred name, in the order `rxnorm`, `icd11`, `ddinter` (Board P: "RxNorm, ICD-11 and DDInter call it Acetaminophen").
  - `SearchPage.Slice(int offset, int limit)`, `SearchPage.Plan(Slice substances, Slice approved, Slice stubs)`, `static Plan plan(long substances, long approved, long stubs, int offset, int size)`.
  - `SearchPort.Counts(long substances, long approved, long stubs)`, `counts(String term)`, `substances(String term, int limit, int offset)`, `approved(String term, int limit, int offset)`, `stubs(String term, int limit, int offset)`.
  - `SearchQueryService.search(String q, int page, Scope scope) : Mono<SearchResult>`; `PAGE_SIZE = 20`, `PUBLIC_PAGE_MAX = 9`, `ALL_PAGE_MAX = 500`. `scope=all` lifts only the page cap: the visibility rule applies to every search (no web route sends `scope=all`).
  - `GET /v1/search?q=&page=` (400 `field=q` outside 2–100 characters, 400 `field=page` outside 0–9, or 0–500 with the token and `scope=all`).

Search rules (§7.4): `lower(trade_name)` contains q; `dar_number` starts with q; `generic_content_raw` contains q (approved products only); a substance's preferred name or any `substance_name` contains q (public substances only, and approved products carrying them); stubs (not public) match on trade name and DAR only; `%`, `_` and `\` are literal. Order: substances by preferred name, then approved products by trade name, then stubs by trade name; 20 per page across the three.

- [ ] **Step 1: Write the failing unit test**

`SearchPageTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.SearchPage;
import com.niramoy.bddrug.domain.SearchPage.Plan;
import com.niramoy.bddrug.domain.SearchPage.Slice;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class SearchPageTest {
    @Test void firstPageTakesSubstancesThenApprovedThenStubs() {
        assertThat(SearchPage.plan(3, 10, 30, 0, 20)).isEqualTo(new Plan(new Slice(0, 3), new Slice(0, 10), new Slice(0, 7)));
    }
    @Test void aLaterPageContinuesWhereTheLastStopped() {
        assertThat(SearchPage.plan(3, 10, 30, 20, 20)).isEqualTo(new Plan(Slice.NONE, Slice.NONE, new Slice(7, 20)));
        assertThat(SearchPage.plan(25, 10, 0, 20, 20)).isEqualTo(new Plan(new Slice(20, 5), new Slice(0, 10), Slice.NONE));
    }
    @Test void pastTheEndIsEmpty() {
        assertThat(SearchPage.plan(1, 1, 1, 20, 20)).isEqualTo(new Plan(Slice.NONE, Slice.NONE, Slice.NONE));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests SearchPageTest`
Expected: compilation FAILS (`cannot find symbol: class SearchPage`).

- [ ] **Step 3: Write `SearchPage` and `SearchResult`**

```java
package com.niramoy.bddrug.domain;

/** One page of search results across three ordered groups: substances, approved products, stubs (§6.3). Pure. */
public final class SearchPage {
    private SearchPage() {}
    public record Slice(int offset, int limit) { public static final Slice NONE = new Slice(0, 0); }
    public record Plan(Slice substances, Slice approved, Slice stubs) {}

    public static Plan plan(long substances, long approved, long stubs, int offset, int size) {
        long end = (long) offset + size;
        return new Plan(slice(0, substances, offset, end), slice(substances, approved, offset, end),
            slice(substances + approved, stubs, offset, end));
    }

    private static Slice slice(long start, long length, long from, long to) {
        long a = Math.max(from, start), b = Math.min(to, start + length);
        return b > a ? new Slice((int) (a - start), (int) (b - a)) : Slice.NONE;
    }
}
```

```java
package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * GET /v1/search (§7.4 P1–P4). products holds ProductHit (approved) and StubHit (not public: trade name and DAR matches
 * only, so search never reveals an unreviewed composition, D16). counts covers the whole result, not the page.
 */
public record SearchResult(String query, long total, boolean hasMore, Counts counts, List<SubstanceHit> substances,
                           List<Object> products, String suggestion) {
    public record Counts(long substances, long products) {}
    public record KeyCodes(List<String> atc, List<String> rxcui) {}
    public record SubstanceHit(String bdsId, String preferredName, String matchedName, String matchedNameType, List<String> otherNameTypes,
                               String coverage, List<String> ddinterIds, KeyCodes keyCodes, long approvedProductCount) {}
    public record ClinicalRef(String bdcId, String displayName) {}
    public record ProductHit(String conceptId, String tradeName, String darNumber, String company, String dosageForm,
                             String genericContentRaw, ClinicalRef clinicalDrug, String matchedOn, String matchedName, String status) {}
    public record StubHit(String conceptId, String tradeName, String status) {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
}
```

- [ ] **Step 4: Run the unit test**

Run: `cd api && ./gradlew test --no-daemon --tests SearchPageTest`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

`SearchApiIntegrationTest.java`:

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
 * §7.4 P1–P4 and §11.3 SearchApiIntegrationTest. Approved: N-1 Napa (Acetaminophen, DGDA name Paracetamol), W-1 Warin.
 * Pending: A-1 Ecosprin (Aspirin), W-2 Coumarol. "PCT 100% Max" tests literal wildcards.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SearchApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              VALUES ('PCT-1','186-0099-001','PCT 100% Max','Test Pharma','Tablet','Paracetamol 500 mg','parsed');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('Q-1', 5, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('Q-1','DGDA-Drugs','N-1','ok', now()), ('Q-1','DGDA-Drugs','W-1','ok', now()), ('Q-1','DGDA-Drugs','A-1','pending', now()),
             ('Q-1','DGDA-Drugs','W-2','pending', now()), ('Q-1','DGDA-Drugs','PCT-1','ok', now());
            """);
    }

    @Autowired WebTestClient web;

    private String body(String uri) {
        return new String(web.get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8);
    }

    @Test void paracetamolFindsNapaThroughTheDgdaName() {
        web.get().uri("/v1/search?q=paracetamol").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.query").isEqualTo("paracetamol")
            .jsonPath("$.data.counts.substances").isEqualTo(1)
            .jsonPath("$.data.substances[0].bdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.substances[0].preferredName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.substances[0].matchedName").isEqualTo("Paracetamol")
            .jsonPath("$.data.substances[0].matchedNameType").isEqualTo("dgda_content")
            .jsonPath("$.data.substances[0].otherNameTypes[0]").isEqualTo("rxnorm")
            .jsonPath("$.data.substances[0].otherNameTypes[1]").isEqualTo("icd11")
            .jsonPath("$.data.substances[0].coverage").isEqualTo("full")
            .jsonPath("$.data.substances[0].ddinterIds[0]").isEqualTo("DDInter14")
            .jsonPath("$.data.substances[0].keyCodes.atc[0]").isEqualTo("N02BE01")
            .jsonPath("$.data.substances[0].keyCodes.rxcui[0]").isEqualTo("161")
            .jsonPath("$.data.substances[0].approvedProductCount").isEqualTo(1)
            .jsonPath("$.data.products[?(@.conceptId == 'N-1')].matchedOn").isEqualTo("generic")
            .jsonPath("$.data.products[?(@.conceptId == 'N-1')].status").isEqualTo("approved")
            .jsonPath("$.data.products[?(@.conceptId == 'N-1')].clinicalDrug.bdcId").isEqualTo("BDC-000006");
    }

    @Test void acetaminophenFindsNapaThroughTheSubstance() {
        web.get().uri("/v1/search?q=acetaminophen").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.substances[0].matchedNameType").isEqualTo("preferred")
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.products[0].matchedOn").isEqualTo("substance");
    }

    @Test void darPrefixAndStubsMatchOnTradeNameAndDarOnly() {
        web.get().uri("/v1/search?q=008").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.products[0].matchedOn").isEqualTo("dar");
        String stub = body("/v1/search?q=ecosprin");
        assertThat(stub).contains("\"conceptId\":\"A-1\"", "\"status\":\"not_reviewed\"", "\"hidden\":true");
        assertThat(stub).doesNotContain("Aspirin", "BDC-", "genericContentRaw", "Test Pharma");
        // an unapproved product never matches on its composition or substance (D16)
        String aspirin = body("/v1/search?q=aspirin");
        assertThat(aspirin).doesNotContain("A-1", "Ecosprin", "BDS-000002");
        web.get().uri("/v1/search?q=aspirin").exchange().expectBody().jsonPath("$.data.total").isEqualTo(0);
    }

    @Test void orderIsSubstancesThenApprovedThenStubs() {
        web.get().uri("/v1/search?q=warfarin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(2)
            .jsonPath("$.data.counts.products").isEqualTo(1)
            .jsonPath("$.data.substances[0].preferredName").isEqualTo("Warfarin")
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1");
        web.get().uri("/v1/search?q=o").exchange().expectStatus().isBadRequest();
        web.get().uri("/v1/search?q=coumarol").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].hidden").isEqualTo(true);
    }

    // Review Focus 2
    @Test void wildcardsAreLiteralAndBengaliIsEmpty() {
        // template variables, so WebTestClient encodes each value once (as ProductApiIntegrationTest does)
        web.get().uri("/v1/search?q={q}", "100%").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].tradeName").isEqualTo("PCT 100% Max");
        for (String q : new String[]{"%%", "__", "\\\\", ".*"})
            web.get().uri("/v1/search?q={q}", q).exchange().expectStatus().isOk().expectBody().jsonPath("$.data.total").isEqualTo(0);
        web.get().uri("/v1/search?q={q}", "  NAPA ").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.query").isEqualTo("NAPA")
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1");
        web.get().uri("/v1/search?q={q}", "প্যারাসিটামল").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(0)
            .jsonPath("$.data.suggestion").value(v -> assertThat(v).isNull());
    }

    @Test void publicPagesStopAtIndexNine() {
        web.get().uri("/v1/search?q=napa&page=9").exchange().expectStatus().isOk().expectBody().jsonPath("$.data.hasMore").isEqualTo(false);
        web.get().uri("/v1/search?q=napa&page=10").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("page");
        internal(web).get().uri("/v1/search?q=napa&page=10&scope=all").exchange().expectStatus().isOk();
    }
}
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests SearchApiIntegrationTest`
Expected: FAIL (404: no handler for `/v1/search`).

- [ ] **Step 7: Port, adapter, service and controller**

`SearchPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.SearchResult;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Search reads under the §7.4 visibility rule. term is stripped and lower-cased. */
public interface SearchPort {
    record Counts(long substances, long approved, long stubs) {}
    Mono<Counts> counts(String term);
    Flux<SearchResult.SubstanceHit> substances(String term, int limit, int offset);
    Flux<SearchResult.ProductHit> approved(String term, int limit, int offset);
    Flux<SearchResult.StubHit> stubs(String term, int limit, int offset);
}
```

`R2dbcSearchAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.SearchPort;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.SearchResult;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.*;

/**
 * Search SQL (§7.4). Public status only through ReviewSql.LATEST_PUBLIC. Every LIKE escapes %, _ and \ (likePattern), so
 * a query is a literal, case-insensitive substring (DAR: a prefix). Stubs match trade name and DAR only (D16).
 */
@Component
public class R2dbcSearchAdapter implements SearchPort {
    /** Java " ESCAPE '\\'" is the SQL text ESCAPE '\', as in R2dbcProductAdapter (standard_conforming_strings on). */
    static final String ESC = " ESCAPE '\\'";
    /** Public substances with their public product count (§7.4: "a substance is public only when at least one public product carries it"). */
    static final String PUBSUB = """
        pubsub AS (SELECT x.bds_id, count(DISTINCT bp.concept_id) AS n FROM curated.brand_product bp
                   JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                   JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                   JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                   GROUP BY x.bds_id)""";
    static final String SUBSTANCE_MATCH = "(lower(s.preferred_name) LIKE :p" + ESC +
        " OR EXISTS (SELECT 1 FROM curated.substance_name sn WHERE sn.bds_id = s.bds_id AND lower(sn.name) LIKE :p" + ESC + "))";
    static final String SHITS = "shits AS (SELECT s.bds_id, s.preferred_name, ps.n FROM curated.substance s " +
        "JOIN pubsub ps ON ps.bds_id = s.bds_id WHERE " + SUBSTANCE_MATCH + ")";
    static final String PRODUCT_MATCH = "(lower(bp.trade_name) LIKE :p" + ESC + " OR lower(bp.dar_number) LIKE :prefix" + ESC +
        " OR lower(bp.generic_content_raw) LIKE :p" + ESC +
        " OR EXISTS (SELECT 1 FROM curated.brand_product_ingredient bpi" +
        " JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code" +
        " JOIN curated.substance s ON s.bds_id = x.bds_id WHERE bpi.concept_id = bp.concept_id AND " + SUBSTANCE_MATCH + "))";
    static final String PHITS = "phits AS (SELECT bp.* FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id AND l.pub " +
        "WHERE " + PRODUCT_MATCH + ")";
    static final String STUBS = "stubs AS (SELECT bp.concept_id, bp.trade_name FROM curated.brand_product bp " +
        "LEFT JOIN latest l ON l.concept_id = bp.concept_id WHERE NOT coalesce(l.pub, false) " +
        "AND (lower(bp.trade_name) LIKE :p" + ESC + " OR lower(bp.dar_number) LIKE :prefix" + ESC + "))";
    static final String NAME_RANK = "coalesce(array_position(ARRAY['dgda_content','rxnorm','ddinter','icd11'], sn.name_type), 5)";
    static final List<String> OTHER_ORDER = List.of("rxnorm", "icd11", "ddinter");

    private final DatabaseClient db;
    public R2dbcSearchAdapter(DatabaseClient db) { this.db = db; }

    static String prefix(String term) {
        return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    @Override public Mono<Counts> counts(String term) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + ", " + SHITS + ", " + PHITS + ", " + STUBS +
                      " SELECT (SELECT count(*) FROM shits) AS s, (SELECT count(*) FROM phits) AS a, (SELECT count(*) FROM stubs) AS h")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("prefix", prefix(term))
            .map(r -> new Counts(r.get("s", Long.class), r.get("a", Long.class), r.get("h", Long.class))).one();
    }

    private record SubRow(String bdsId, String preferredName, long n, String alt) {}

    @Override public Flux<SearchResult.SubstanceHit> substances(String term, int limit, int offset) {
        if (limit == 0) return Flux.empty();
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + ", " + SHITS +
                      " SELECT h.bds_id, h.preferred_name, h.n, (SELECT sn.name || chr(1) || sn.name_type FROM curated.substance_name sn" +
                      " WHERE sn.bds_id = h.bds_id AND lower(sn.name) LIKE :p" + ESC + " ORDER BY " + NAME_RANK + ", sn.name LIMIT 1) AS alt" +
                      " FROM shits h ORDER BY lower(h.preferred_name), h.bds_id LIMIT :limit OFFSET :offset")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("limit", limit).bind("offset", offset)
            .map(r -> new SubRow(r.get("bds_id", String.class), r.get("preferred_name", String.class), r.get("n", Long.class),
                r.get("alt", String.class)))
            .all().collectList()
            .flatMapMany(rows -> rows.isEmpty() ? Flux.empty() : details(rows, term));
    }

    private Flux<SearchResult.SubstanceHit> details(List<SubRow> rows, String term) {
        String[] ids = rows.stream().map(SubRow::bdsId).toArray(String[]::new);
        Mono<Map<String, List<String[]>>> names = db.sql("SELECT bds_id, name, name_type FROM curated.substance_name WHERE bds_id = ANY(:ids)")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class), new String[]{r.get("name", String.class), r.get("name_type", String.class)}))
            .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<Map<String, List<String[]>>> codes = db.sql("SELECT bds_id, system, code FROM curated.substance_code " +
                                                         "WHERE bds_id = ANY(:ids) AND system IN ('ATC','RXCUI','DDINTER') ORDER BY bds_id, system, code")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class), new String[]{r.get("system", String.class), r.get("code", String.class)}))
            .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<Map<String, String>> coverage = db.sql("SELECT bds_id, coverage FROM curated.interaction_coverage WHERE bds_id = ANY(:ids)")
            .bind("ids", ids).map(r -> Map.entry(r.get("bds_id", String.class), r.get("coverage", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
        return Mono.zip(names, codes, coverage).flatMapMany(t -> Flux.fromIterable(rows).map(row -> {
            boolean preferred = row.preferredName().toLowerCase(Locale.ROOT).contains(term);
            String[] alt = row.alt() == null ? null : row.alt().split("\u0001", 2);
            String matchedName = preferred || alt == null ? row.preferredName() : alt[0];
            String matchedType = preferred || alt == null ? "preferred" : alt[1];
            List<String> others = new ArrayList<>();
            for (String type : OTHER_ORDER)
                for (String[] n : t.getT1().getOrDefault(row.bdsId(), List.of()))
                    if (type.equals(n[1]) && n[0].equalsIgnoreCase(row.preferredName()) && !others.contains(type)) others.add(type);
            List<String> atc = new ArrayList<>(), rxcui = new ArrayList<>(), dd = new ArrayList<>();
            for (String[] c : t.getT2().getOrDefault(row.bdsId(), List.of()))
                (switch (c[0]) { case "ATC" -> atc; case "RXCUI" -> rxcui; default -> dd; }).add(c[1]);
            dd.sort(DdinterCode.ID_ORDER);
            return new SearchResult.SubstanceHit(row.bdsId(), row.preferredName(), matchedName, matchedType, List.copyOf(others),
                t.getT3().getOrDefault(row.bdsId(), "not_run"), List.copyOf(dd), new SearchResult.KeyCodes(List.copyOf(atc), List.copyOf(rxcui)),
                row.n());
        }));
    }

    @Override public Flux<SearchResult.ProductHit> approved(String term, int limit, int offset) {
        if (limit == 0) return Flux.empty();
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PHITS +
                      " SELECT bp.concept_id, bp.trade_name, bp.dar_number, bp.company, bp.dosage_form, bp.generic_content_raw, bp.bdc_id," +
                      " cd.display_name, CASE WHEN lower(bp.trade_name) LIKE :p" + ESC + " THEN 'trade_name'" +
                      " WHEN lower(bp.dar_number) LIKE :prefix" + ESC + " THEN 'dar'" +
                      " WHEN lower(bp.generic_content_raw) LIKE :p" + ESC + " THEN 'generic' ELSE 'substance' END AS matched_on," +
                      " (SELECT s.preferred_name FROM curated.brand_product_ingredient bpi" +
                      "  JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code" +
                      "  JOIN curated.substance s ON s.bds_id = x.bds_id WHERE bpi.concept_id = bp.concept_id AND " + SUBSTANCE_MATCH +
                      "  ORDER BY s.preferred_name LIMIT 1) AS via" +
                      " FROM phits bp LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id" +
                      " ORDER BY lower(bp.trade_name), bp.concept_id LIMIT :limit OFFSET :offset")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("prefix", prefix(term)).bind("limit", limit).bind("offset", offset)
            .map(r -> {
                String on = r.get("matched_on", String.class);
                String name = switch (on) {
                    case "trade_name" -> r.get("trade_name", String.class);
                    case "dar" -> r.get("dar_number", String.class);
                    case "generic" -> r.get("generic_content_raw", String.class);
                    default -> r.get("via", String.class);
                };
                String bdc = r.get("bdc_id", String.class);
                return new SearchResult.ProductHit(r.get("concept_id", String.class), r.get("trade_name", String.class),
                    r.get("dar_number", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
                    r.get("generic_content_raw", String.class),
                    bdc == null ? null : new SearchResult.ClinicalRef(bdc, r.get("display_name", String.class)), on, name, "approved");
            })
            .all();
    }

    @Override public Flux<SearchResult.StubHit> stubs(String term, int limit, int offset) {
        if (limit == 0) return Flux.empty();
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + STUBS +
                      " SELECT concept_id, trade_name FROM stubs ORDER BY lower(trade_name), concept_id LIMIT :limit OFFSET :offset")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("prefix", prefix(term)).bind("limit", limit).bind("offset", offset)
            .map(r -> new SearchResult.StubHit(r.get("concept_id", String.class), r.get("trade_name", String.class), "not_reviewed"))
            .all();
    }
}
```

`SearchQueryService.java`:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.SearchPort;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.SearchPage;
import com.niramoy.bddrug.domain.SearchResult;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** §7.4 P1–P4. The visibility rule applies to every search; scope=all only lifts the page cap (integration tests). */
@Service
public class SearchQueryService {
    public static final int PAGE_SIZE = 20, PUBLIC_PAGE_MAX = 9, ALL_PAGE_MAX = 500, MIN_LEN = 2, MAX_LEN = 100;
    private final SearchPort port;
    private final NameIndex names;
    public SearchQueryService(SearchPort port, NameIndex names) {
        this.port = port;
        this.names = names;
    }

    public Mono<SearchResult> search(String q, int page, Scope scope) {
        String query = q == null ? "" : q.strip();
        int len = query.codePointCount(0, query.length());
        if (len < MIN_LEN || len > MAX_LEN) return Mono.error(new InvalidQueryException("q", "q must be 2-100 characters"));
        int max = scope == Scope.PUBLIC ? PUBLIC_PAGE_MAX : ALL_PAGE_MAX;
        if (page < 0 || page > max) return Mono.error(new InvalidQueryException("page", "page must be 0-" + max));
        String term = query.toLowerCase(Locale.ROOT);
        return port.counts(term).flatMap(c -> {
            SearchPage.Plan plan = SearchPage.plan(c.substances(), c.approved(), c.stubs(), page * PAGE_SIZE, PAGE_SIZE);
            long total = c.substances() + c.approved() + c.stubs();
            Mono<String> suggestion = total == 0 ? names.suggest(term).map(s -> s).defaultIfEmpty("") : Mono.just("");
            return Mono.zip(port.substances(term, plan.substances().limit(), plan.substances().offset()).collectList(),
                    port.approved(term, plan.approved().limit(), plan.approved().offset()).collectList(),
                    port.stubs(term, plan.stubs().limit(), plan.stubs().offset()).collectList(), suggestion)
                .map(t -> {
                    List<Object> products = new ArrayList<>(t.getT2());
                    products.addAll(t.getT3());
                    return new SearchResult(query, total, (long) (page + 1) * PAGE_SIZE < total,
                        new SearchResult.Counts(c.substances(), c.approved() + c.stubs()), t.getT1(), products,
                        t.getT4().isEmpty() ? null : t.getT4());
                });
        });
    }
}
```

`SearchController.java`:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.SearchQueryService;
import com.niramoy.bddrug.domain.SearchResult;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** GET /v1/search (§7.4 P1–P4). */
@RestController
@RequestMapping("/v1/search")
public class SearchController {
    private final SearchQueryService service;
    private final InternalAuth auth;
    public SearchController(SearchQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<SearchResult>> search(@RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(required = false) String scope,
                                                  @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.search(q, page, auth.scope(scope, token)).map(ApiResponse::ok);
    }
}
```

`NameIndex` is Task 13; so this task compiles, create it now as the empty first version that Task 13 completes:

```java
package com.niramoy.bddrug.application;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/** The in-memory spelling index (§7.4 "Suggestion"). Task 13 fills it; until then it never suggests. */
@Component
public class NameIndex {
    public Mono<String> suggest(String term) { return Mono.empty(); }
}
```

- [ ] **Step 8: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests SearchPageTest --tests SearchApiIntegrationTest`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/SearchResult.java api/src/main/java/com/niramoy/bddrug/domain/SearchPage.java \
  api/src/main/java/com/niramoy/bddrug/application/port/SearchPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSearchAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/SearchQueryService.java api/src/main/java/com/niramoy/bddrug/application/NameIndex.java \
  api/src/main/java/com/niramoy/bddrug/presentation/SearchController.java \
  api/src/test/java/com/niramoy/bddrug/SearchPageTest.java api/src/test/java/com/niramoy/bddrug/SearchApiIntegrationTest.java
git commit -m "feat(api): GET /v1/search with synonyms, DAR prefix, stubs by trade name and DAR only, public page cap (§7.4 P1–P4, D16)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The spelling suggestion ("Search for warfarin")

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/Suggest.java`
- Create: `api/src/main/java/com/niramoy/bddrug/application/port/NameIndexPort.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/application/NameIndex.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSearchAdapter.java` (implements `NameIndexPort`)
- Test: `api/src/test/java/com/niramoy/bddrug/SuggestTest.java`, `api/src/test/java/com/niramoy/bddrug/NameIndexTest.java`, `api/src/test/java/com/niramoy/bddrug/SearchApiIntegrationTest.java`

**Interfaces:**
- Consumes: Task 12 `R2dbcSearchAdapter.PUBSUB`, `SearchQueryService` (calls `NameIndex.suggest(term)` when the total is 0).
- Produces: `Suggest.distance(String a, String b) : int` (optimal string alignment, the restricted Damerau–Levenshtein distance), `Suggest.closest(String term, Collection<String> names) : String` (distance 1–2, ties by distance then name, case-insensitive; null when none); `NameIndexPort.publicNames() : Flux<String>`, `NameIndexPort.stillPublic(String name) : Mono<Boolean>`; `NameIndex(NameIndexPort port, Clock clock)` (`TTL` 5 minutes, `MIN_LENGTH` 5) with `suggest(String term) : Mono<String>`.

- [ ] **Step 1: Write the failing unit tests**

`SuggestTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.Suggest;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class SuggestTest {
    @Test void distanceCountsInsertionsDeletionsSubstitutionsAndAdjacentSwaps() {
        assertThat(Suggest.distance("warfrin", "warfarin")).isEqualTo(1);
        assertThat(Suggest.distance("paracetmaol", "paracetamol")).isEqualTo(1);   // adjacent swap
        assertThat(Suggest.distance("napa", "nepa")).isEqualTo(1);
        assertThat(Suggest.distance("aspirin", "aspirin")).isZero();
        assertThat(Suggest.distance("", "abc")).isEqualTo(3);
    }

    @Test void closestTakesDistanceOneOrTwoCaseInsensitivelyAndNeverTheSameName() {
        assertThat(Suggest.closest("warfrin", List.of("Warfarin", "Warin", "Aspirin"))).isEqualTo("Warfarin");
        assertThat(Suggest.closest("warfarin", List.of("Warfarin"))).isNull();
        assertThat(Suggest.closest("zzzzzzz", List.of("Warfarin"))).isNull();
        assertThat(Suggest.closest("amlodipne", List.of("Amlodipine", "Amlodipine-5"))).isEqualTo("Amlodipine");
    }

    @Test void tiesGoToTheAlphabeticallyFirstName() {
        assertThat(Suggest.closest("napax", List.of("Napay", "Napaa"))).isEqualTo("Napaa");
    }
}
```

`NameIndexTest.java`:

```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.application.NameIndex;
import com.niramoy.bddrug.application.port.NameIndexPort;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

class NameIndexTest {
    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-16T00:00:00Z");
        public ZoneId getZone() { return ZoneId.of("UTC"); }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    static final class FakePort implements NameIndexPort {
        List<String> names = List.of("Warfarin", "Napa");
        Set<String> publicNow = new HashSet<>(Set.of("Warfarin", "Napa"));
        int loads = 0;
        public Flux<String> publicNames() { loads++; return Flux.fromIterable(names); }
        public Mono<Boolean> stillPublic(String name) { return Mono.just(publicNow.contains(name)); }
    }

    @Test void suggestsOnlyForFiveOrMoreCharacters() {
        NameIndex index = new NameIndex(new FakePort(), new MutableClock());
        assertThat(index.suggest("nepa").block()).isNull();
        assertThat(index.suggest("warfrin").block()).isEqualTo("Warfarin");
    }

    @Test void refreshesEveryFiveMinutes() {
        FakePort port = new FakePort();
        MutableClock clock = new MutableClock();
        NameIndex index = new NameIndex(port, clock);
        index.suggest("warfrin").block();
        clock.now = clock.now.plus(Duration.ofMinutes(4));
        index.suggest("warfrin").block();
        assertThat(port.loads).isEqualTo(1);
        clock.now = clock.now.plus(Duration.ofMinutes(2));
        index.suggest("warfrin").block();
        assertThat(port.loads).isEqualTo(2);
    }

    @Test void aNameWhoseRecordLeftPublicViewIsDropped() {
        FakePort port = new FakePort();
        NameIndex index = new NameIndex(port, new MutableClock());
        assertThat(index.suggest("warfrin").block()).isEqualTo("Warfarin");
        port.publicNow.remove("Warfarin");     // the record went back into review inside the 5 minutes
        assertThat(index.suggest("warfrin").block()).isNull();
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd api && ./gradlew test --no-daemon --tests SuggestTest --tests NameIndexTest`
Expected: compilation FAILS (`cannot find symbol: class Suggest`, `class NameIndexPort`).

- [ ] **Step 3: Write `Suggest`, the port and the index**

```java
package com.niramoy.bddrug.domain;
import java.util.Collection;
import java.util.Locale;

/** The spelling suggestion's distance (§7.4 "Suggestion"): optimal string alignment, case-insensitive. Pure. */
public final class Suggest {
    private Suggest() {}
    public static final int MAX_DISTANCE = 2;

    public static int distance(String a, String b) {
        int n = a.length(), m = b.length();
        int[][] d = new int[n + 1][m + 1];
        for (int i = 0; i <= n; i++) d[i][0] = i;
        for (int j = 0; j <= m; j++) d[0][j] = j;
        for (int i = 1; i <= n; i++)
            for (int j = 1; j <= m; j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1))
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        return d[n][m];
    }

    /** The single closest name at distance 1 or 2; ties by distance, then name; null when none. */
    public static String closest(String term, Collection<String> names) {
        String t = term.toLowerCase(Locale.ROOT);
        String best = null;
        int bestD = MAX_DISTANCE + 1;
        for (String name : names) {
            String l = name.toLowerCase(Locale.ROOT);
            if (l.equals(t) || Math.abs(l.length() - t.length()) > MAX_DISTANCE) continue;
            int d = distance(t, l);
            if (d <= MAX_DISTANCE && (d < bestD || (d == bestD && name.compareToIgnoreCase(best) < 0))) {
                best = name;
                bestD = d;
            }
        }
        return best;
    }
}
```

`NameIndexPort.java`:

```java
package com.niramoy.bddrug.application.port;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Publicly visible names (§7.4): public products' trade names, public substances' preferred names and synonyms. */
public interface NameIndexPort {
    Flux<String> publicNames();
    /** One query: is the record behind this name public now? */
    Mono<Boolean> stillPublic(String name);
}
```

`NameIndex.java` (whole file):

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.NameIndexPort;
import com.niramoy.bddrug.domain.Suggest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * §7.4 "Suggestion (Decision: no schema change)": an in-memory index of publicly visible names, refreshed every 5 minutes;
 * for a query of 5 or more characters the single closest name at distance 2 or less. Before a candidate is returned the
 * API re-checks with one query that its record is still public, so a record that went back into review in the last 5
 * minutes never leaks a name.
 */
@Component
public class NameIndex {
    public static final Duration TTL = Duration.ofMinutes(5);
    public static final int MIN_LENGTH = 5;
    private record Snapshot(Instant loadedAt, List<String> names) {}

    private final NameIndexPort port;
    private final Clock clock;
    private final AtomicReference<Snapshot> snapshot = new AtomicReference<>();

    @Autowired
    public NameIndex(NameIndexPort port) { this(port, Clock.systemUTC()); }

    public NameIndex(NameIndexPort port, Clock clock) {
        this.port = port;
        this.clock = clock;
    }

    public Mono<String> suggest(String term) {
        if (term == null || term.codePointCount(0, term.length()) < MIN_LENGTH) return Mono.empty();
        return names().flatMap(list -> {
            String best = Suggest.closest(term, list);
            return best == null ? Mono.empty() : port.stillPublic(best).filter(Boolean::booleanValue).map(ok -> best);
        });
    }

    private Mono<List<String>> names() {
        Snapshot s = snapshot.get();
        Instant now = clock.instant();
        if (s != null && Duration.between(s.loadedAt(), now).compareTo(TTL) < 0) return Mono.just(s.names());
        return port.publicNames().collectList().map(list -> {
            snapshot.set(new Snapshot(now, List.copyOf(list)));
            return list;
        });
    }
}
```

`R2dbcSearchAdapter.java`: `implements SearchPort, NameIndexPort`, and add

```java
    private static final String PUBLIC_NAMES = " SELECT bp.trade_name AS name FROM curated.brand_product bp" +
        " JOIN latest l ON l.concept_id = bp.concept_id AND l.pub" +
        " UNION SELECT s.preferred_name FROM curated.substance s JOIN pubsub ps ON ps.bds_id = s.bds_id" +
        " UNION SELECT sn.name FROM curated.substance_name sn JOIN pubsub ps ON ps.bds_id = sn.bds_id";

    @Override public Flux<String> publicNames() {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + PUBLIC_NAMES).map(r -> r.get("name", String.class)).all();
    }

    @Override public Mono<Boolean> stillPublic(String name) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + ", names AS (" + PUBLIC_NAMES + ")" +
                      " SELECT EXISTS (SELECT 1 FROM names WHERE lower(name) = lower(:n)) AS pub")
            .bind("n", name).map(r -> Boolean.TRUE.equals(r.get("pub", Boolean.class))).one();
    }
```

(import `com.niramoy.bddrug.application.port.NameIndexPort`).

- [ ] **Step 4: Add the §11.3 suggestion cases to the integration test**

Append to `SearchApiIntegrationTest.java` (these two must run in this order, so the second is one test that does both):

```java
    @Test void warfrinSuggestsWarfarinUntilItLeavesPublicView() throws Exception {
        web.get().uri("/v1/search?q=warfrin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(0)
            .jsonPath("$.data.suggestion").isEqualTo("Warfarin");
        // W-1 goes back into review after the index was built: the re-check drops the name (§7.4)
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('Q-2', 1, now() + interval '1 minute');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at)
              VALUES ('Q-2','DGDA-Drugs','W-1','pending', now() + interval '1 minute');
            """);
        web.get().uri("/v1/search?q=warfrin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.suggestion").value(v -> assertThat(v).isNull());
    }
```

Because this test makes W-1 non-public, `orderIsSubstancesThenApprovedThenStubs` (which expects Warin approved) must not run after it: add `@TestMethodOrder(MethodOrderer.OrderAnnotation.class)` to the class, `@Order(1)` to every existing test and `@Order(2)` to this one (imports `org.junit.jupiter.api.MethodOrderer`, `Order`, `TestMethodOrder`).

- [ ] **Step 5: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests SuggestTest --tests NameIndexTest --tests SearchApiIntegrationTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/Suggest.java api/src/main/java/com/niramoy/bddrug/application/port/NameIndexPort.java \
  api/src/main/java/com/niramoy/bddrug/application/NameIndex.java api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSearchAdapter.java \
  api/src/test/java/com/niramoy/bddrug/SuggestTest.java api/src/test/java/com/niramoy/bddrug/NameIndexTest.java \
  api/src/test/java/com/niramoy/bddrug/SearchApiIntegrationTest.java
git commit -m "feat(api): spelling suggestion from a 5-minute public name index, re-checked before it is served (§7.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Checker suggestions (`GET /v1/products/suggest`, P16)

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/SuggestRow.java`
- Create: `api/src/main/java/com/niramoy/bddrug/application/port/SuggestPort.java`
- Modify: `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSearchAdapter.java` (implements `SuggestPort`)
- Modify: `api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java`, `api/src/main/java/com/niramoy/bddrug/presentation/ProductController.java`
- Modify: `api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java` (constructor)
- Test: `api/src/test/java/com/niramoy/bddrug/SuggestApiIntegrationTest.java`

**Interfaces:**
- Consumes: Task 12 `ESC`, `SUBSTANCE_MATCH`, `prefix(term)`, `R2dbcProductAdapter.likePattern`.
- Produces: `SuggestRow(String conceptId, String tradeName, String dosageForm, String status, String clinicalDisplayName, Matched matched)` with `Matched(String name, String substance)` (null when the row matched by trade name or DAR; `status` ∈ `approved`, `not_reviewed`; `clinicalDisplayName` null for `not_reviewed`); `SuggestPort.suggest(String term, List<String> exclude, int limit) : Flux<SuggestRow>`; `ProductQueryService.suggest(String q, List<String> exclude) : Flux<SuggestRow>` (`LIMIT = 10`, `EXCLUDE_MAX = 20`); `GET /v1/products/suggest?q=&exclude=&exclude=` (400 `field=q`, `field=exclude`). The `matched` object is the §7.4 row's `matched|null`, given the two names the §6.7.1 sub line prints ("Matches {synonym}, a name for {substance}" or "Matches {substance}").

- [ ] **Step 1: Write the failing integration test**

`SuggestApiIntegrationTest.java`:

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
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.4 P16. Approved: N-1 Napa, W-1 Warin. Pending: A-1 Ecosprin (Aspirin), W-2 Coumarol. */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SuggestApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('G-1', 4, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('G-1','DGDA-Drugs','N-1','ok', now()), ('G-1','DGDA-Drugs','W-1','ok', now()),
             ('G-1','DGDA-Drugs','A-1','pending', now()), ('G-1','DGDA-Drugs','W-2','pending', now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void anApprovedProductMatchedBySynonymSaysWhichName() {
        web.get().uri("/v1/products/suggest?q=paracetamol").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(1)
            .jsonPath("$.data[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data[0].status").isEqualTo("approved")
            .jsonPath("$.data[0].clinicalDisplayName").isEqualTo("Acetaminophen 500 mg tablet")
            .jsonPath("$.data[0].matched.name").isEqualTo("Paracetamol")
            .jsonPath("$.data[0].matched.substance").isEqualTo("Acetaminophen");
        web.get().uri("/v1/products/suggest?q=napa").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[0].matched").value(v -> assertThat(v).isNull());
    }

    @Test void unapprovedRowsMatchOnTradeNameAndDarOnlyAndCarryNoData() {
        String byName = new String(web.get().uri("/v1/products/suggest?q=ecos").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data[0].clinicalDisplayName").value(v -> assertThat(v).isNull())
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(byName).doesNotContain("Aspirin", "BDC-");
        web.get().uri("/v1/products/suggest?q=aspirin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(0);
    }

    @Test void excludedIdsAreLeftOutAndTheListIsCapped() {
        web.get().uri("/v1/products/suggest?q=wa&exclude=W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[?(@.conceptId == 'W-1')]").isEmpty();
        web.get().uri("/v1/products/suggest?q=a").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("q");
        StringBuilder many = new StringBuilder();
        for (int i = 0; i < 21; i++) many.append("&exclude=X").append(i);
        web.get().uri("/v1/products/suggest?q=napa" + many).exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("exclude");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && ./gradlew test --no-daemon --tests SuggestApiIntegrationTest`
Expected: FAIL (`/v1/products/suggest` is read as product id "suggest": 404).

- [ ] **Step 3: Record, port, adapter, service, controller**

`SuggestRow.java`:

```java
package com.niramoy.bddrug.domain;

/** §7.4 P16 row. matched: the synonym or substance name the row was found by, and the substance it names; null for trade name or DAR. */
public record SuggestRow(String conceptId, String tradeName, String dosageForm, String status, String clinicalDisplayName, Matched matched) {
    public record Matched(String name, String substance) {}
}
```

`SuggestPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.SuggestRow;
import reactor.core.publisher.Flux;
import java.util.List;

public interface SuggestPort {
    /** term stripped and lower-cased; exclude: concept ids already selected. Trade-name prefix first, then approved, then name. */
    Flux<SuggestRow> suggest(String term, List<String> exclude, int limit);
}
```

`R2dbcSearchAdapter.java`: `implements SearchPort, NameIndexPort, SuggestPort`, and add

```java
    @Override public Flux<SuggestRow> suggest(String term, List<String> exclude, int limit) {
        String[] ex = exclude.toArray(String[]::new);
        String p = R2dbcProductAdapter.likePattern(term), pre = prefix(term);
        Flux<Object[]> approved = db.sql("WITH " + ReviewSql.LATEST_PUBLIC +
                " SELECT bp.concept_id, bp.trade_name, bp.dosage_form, cd.display_name," +
                " (lower(bp.trade_name) LIKE :p" + ESC + " OR lower(bp.dar_number) LIKE :prefix" + ESC + ") AS direct," +
                " lower(bp.trade_name) LIKE :prefix" + ESC + " AS starts," +
                " (SELECT n.name || chr(1) || s.preferred_name FROM curated.brand_product_ingredient bpi" +
                "  JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code" +
                "  JOIN curated.substance s ON s.bds_id = x.bds_id" +
                "  CROSS JOIN LATERAL (SELECT sn.name FROM curated.substance_name sn WHERE sn.bds_id = s.bds_id" +
                "    UNION SELECT s.preferred_name) n" +
                "  WHERE bpi.concept_id = bp.concept_id AND lower(n.name) LIKE :p" + ESC +
                "  ORDER BY (lower(n.name) = lower(s.preferred_name)) DESC, n.name LIMIT 1) AS via" +
                " FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id AND l.pub" +
                " LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id" +
                " WHERE NOT (bp.concept_id = ANY(:ex)) AND " + PRODUCT_MATCH +
                " ORDER BY starts DESC, lower(bp.trade_name), bp.concept_id LIMIT :limit")
            .bind("p", p).bind("prefix", pre).bind("ex", ex).bind("limit", limit)
            .map(r -> {
                String via = Boolean.TRUE.equals(r.get("direct", Boolean.class)) ? null : r.get("via", String.class);
                String[] v = via == null ? null : via.split("\u0001", 2);
                return new Object[]{Boolean.TRUE.equals(r.get("starts", Boolean.class)), 0,
                    new SuggestRow(r.get("concept_id", String.class), r.get("trade_name", String.class), r.get("dosage_form", String.class),
                        "approved", r.get("display_name", String.class), v == null ? null : new SuggestRow.Matched(v[0], v[1]))};
            }).all();
        Flux<Object[]> hidden = db.sql("WITH " + ReviewSql.LATEST_PUBLIC +
                " SELECT bp.concept_id, bp.trade_name, bp.dosage_form, lower(bp.trade_name) LIKE :prefix" + ESC + " AS starts" +
                " FROM curated.brand_product bp LEFT JOIN latest l ON l.concept_id = bp.concept_id" +
                " WHERE NOT coalesce(l.pub, false) AND NOT (bp.concept_id = ANY(:ex))" +
                " AND (lower(bp.trade_name) LIKE :p" + ESC + " OR lower(bp.dar_number) LIKE :prefix" + ESC + ")" +
                " ORDER BY starts DESC, lower(bp.trade_name), bp.concept_id LIMIT :limit")
            .bind("p", p).bind("prefix", pre).bind("ex", ex).bind("limit", limit)
            .map(r -> new Object[]{Boolean.TRUE.equals(r.get("starts", Boolean.class)), 1,
                new SuggestRow(r.get("concept_id", String.class), r.get("trade_name", String.class), r.get("dosage_form", String.class),
                    "not_reviewed", null, null)})
            .all();
        return Flux.concat(approved, hidden).collectList().flatMapMany(rows -> Flux.fromStream(rows.stream()
            .sorted(Comparator.comparing((Object[] o) -> !(Boolean) o[0]).thenComparingInt(o -> (Integer) o[1])
                .thenComparing(o -> ((SuggestRow) o[2]).tradeName().toLowerCase(Locale.ROOT)))
            .limit(limit).map(o -> (SuggestRow) o[2])));
    }
```

(imports `com.niramoy.bddrug.application.port.SuggestPort`, `com.niramoy.bddrug.domain.SuggestRow`).

`ProductQueryService.java`: add the `SuggestPort suggestions` constructor parameter (fourth) and

```java
    public static final int SUGGEST_LIMIT = 10, EXCLUDE_MAX = 20;

    /** §7.4 P16. Unapproved rows match on trade name and DAR only and carry no clinical data. */
    public Flux<SuggestRow> suggest(String q, List<String> exclude) {
        String query = q == null ? "" : q.strip();
        int len = query.codePointCount(0, query.length());
        if (len < MIN_LEN || len > MAX_LEN) return Flux.error(new InvalidQueryException("q", "q must be 2-100 characters"));
        List<String> ids = exclude == null ? List.of() : exclude.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
        if (ids.size() > EXCLUDE_MAX) return Flux.error(new InvalidQueryException("exclude", "exclude holds at most 20 ids"));
        return suggestions.suggest(query.toLowerCase(Locale.ROOT), ids, SUGGEST_LIMIT);
    }
```

(imports `SuggestPort`, `SuggestRow`, `java.util.List`). In `ProductQueryServiceTest.java` the constructor calls become `new ProductQueryService(port, DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty())`.

`ProductController.java`: add (Spring prefers the literal `/suggest` to the `/{conceptId}` pattern):

```java
    /** §7.4 P16: at most 10 rows for the checker's combobox. Public data only; a present token must still match. */
    @GetMapping("/suggest")
    public Mono<ApiResponse<List<SuggestRow>>> suggest(@RequestParam(defaultValue = "") String q,
                                                       @RequestParam(required = false) List<String> exclude,
                                                       @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.present(token);
        return service.suggest(q, exclude).collectList().map(ApiResponse::ok);
    }
```

(import `com.niramoy.bddrug.domain.SuggestRow`).

- [ ] **Step 4: Run the tests**

Run: `cd api && ./gradlew test --no-daemon --tests SuggestApiIntegrationTest --tests ProductQueryServiceTest --tests VisibilityApiIntegrationTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/SuggestRow.java api/src/main/java/com/niramoy/bddrug/application/port/SuggestPort.java \
  api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSearchAdapter.java \
  api/src/main/java/com/niramoy/bddrug/application/ProductQueryService.java api/src/main/java/com/niramoy/bddrug/presentation/ProductController.java \
  api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java api/src/test/java/com/niramoy/bddrug/SuggestApiIntegrationTest.java
git commit -m "feat(api): GET /v1/products/suggest for the checker, unapproved rows by trade name and DAR only (§7.4 P16)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The visibility matrix for every public endpoint, and P2a ships to `phase-2`

**Files:**
- Test: `api/src/test/java/com/niramoy/bddrug/PublicVisibilityMatrixIntegrationTest.java`
- Modify: `web/content/learn/partners.tsx` (`ENDPOINTS`, `PLANNED`), `web/tests/learn-partners.test.tsx`

**Interfaces:**
- Consumes: every endpoint of Tasks 1–14, `GET /v1/stats` (P3), P1C's `PublicStatusGuardTest`, Task 2 `PublicPairReviews.Pair`; V7's `review_decision_dismiss_by_senior` (a `dismiss` is a senior's, with a 5–1000 character note).
- Produces: the §11.3 `VisibilityApiIntegrationTest` matrix for the P2 endpoints, in its own class so it never collides with P1C's edits of `VisibilityApiIntegrationTest`. **The §12.1 phase-2 exit criterion "`VisibilityApiIntegrationTest` matrix green" means both classes green: `VisibilityApiIntegrationTest` (as P1C and Tasks 1, 4 and 8 leave it: the pre-P2 endpoints, the stubs, PO D7) and `PublicVisibilityMatrixIntegrationTest` (every P2 endpoint).** Task 40 names both in the PR.

The fixtures give every non-public state its own product, clinical drug, substance, XM code, DDInter entry and DDInter text, all with markers that appear nowhere else, so a leak of any one of them is a plain substring in a response body. The public product's own XM code (`XM9P01`) lies outside the hidden marker space `XM9M0…`, so the marker never matches public data. A public product (Pubol, substance Pubolin) has a DDInter pair with every hidden substance's entry, so P10, the checker and P9 would leak if the rule broke. DDInter's own partner names (`DDI-Partner2`…) differ from our substance names (`Secretolin-P`…): DDInter's names are DDInter's public data and may appear on Pubolin's substance page (§7.4 P9), ours may not.

The sixth hidden state is a **dismissed issue** (P1C §5.2, §5.10a, D57, §13.1 Q4): a pharmacist approved Hushdis, then reported an issue, then a senior dismissed it. The dismissal is a review boundary, so the item's `review` is `pending` although a pharmacist's `ok` sits in its history; that earlier `ok` must never publish it or date anything. The pair Pubolin + Secretolin-P also carries a **current** senior review (the newest `ops.pair_review` row, with the right content hash), so P9 would leak a reviewed state for a pair with a non-public partner if the §7.4 rule broke (Task 7).

- [ ] **Step 1: Write the matrix**

`PublicVisibilityMatrixIntegrationTest.java`:

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
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import com.niramoy.bddrug.domain.PublicPairReviews;
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §11.3 VisibilityApiIntegrationTest matrix (D28, G3, PO D7) for every public endpoint, with a fixture in each non-public
 * state: pending (Hushpend), engineer checked (Husheng), issue (Hushiss), back in review (Hushback), approved then
 * removed from the batch file (Hushrem), and approved, reported, then dismissed by a senior (Hushdis, P1C D57: pending).
 * Pubol is approved and pairs with every hidden substance's DDInter entry; its pair with Secretolin-P has a current
 * senior review that must never be served (the partner is not public, §7.4).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class PublicVisibilityMatrixIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    /** Our data for hidden records: substance names, BDS/BDC ids, XM codes, strengths, DDInter texts, notes. */
    static final List<String> MARKERS = List.of("Secretolin", "BDS-000902", "BDS-000903", "BDS-000904", "BDS-000905", "BDS-000906",
        "BDS-000907", "BDC-000902", "BDC-000903", "BDC-000904", "BDC-000905", "BDC-000906", "BDC-000907", "XM9M0", "77.77",
        "SECRET-TEXT", "SECRET-MGMT", "PAIR-NOTE-SECRET", "ISSUE-NOTE-SECRET", "DISMISS-NOTE-SECRET", "Hush Pharma");
    static final List<String> HIDDEN = List.of("M-PEND", "M-ENG", "M-ISS", "M-BACK", "M-REM", "M-DIS");

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        StringBuilder sql = new StringBuilder("""
            INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000901','Pubolin');
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
             ('BDS-000901','ICD11_XM','XM9P01','any','dgda-ocl','xm',1.0), ('BDS-000901','DDINTER','DDInter9901','systemic','ddinter2','drugbank',1.0);
            INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope) VALUES ('DDInter9901','Pubolin','systemic');
            INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES ('BDS-000901','full','x');
            INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route)
              VALUES ('BDC-000901','tablet|systemic|BDS-000901:5mg/','Pubolin 5 mg tablet','Tablet','systemic');
            INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, raw_text)
              VALUES ('BDC-000901','BDS-000901',5,'mg','Pubolin 5 mg');
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('M-PUB','901','Pubol','Open Pharma','Tablet','Pubolin 5 mg','BDC-000901','parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('M-PUB','XM9P01','Pubolin');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('M-1', 7, now() - interval '2 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES ('M-1','DGDA-Drugs','M-PUB','ok', now() - interval '2 hour');
            """);
        String[][] hidden = {{"2", "M-PEND", "Hushpend"}, {"3", "M-ENG", "Husheng"}, {"4", "M-ISS", "Hushiss"}, {"5", "M-BACK", "Hushback"},
            {"6", "M-REM", "Hushrem"}, {"7", "M-DIS", "Hushdis"}};
        String suffix = "PEIBRD";
        for (int k = 0; k < hidden.length; k++) {
            String n = hidden[k][0], id = hidden[k][1], trade = hidden[k][2], name = "Secretolin-" + suffix.charAt(k);
            sql.append("""
                INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-00090%1$s','%4$s');
                INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
                 ('BDS-00090%1$s','ICD11_XM','XM9M0%1$s','any','dgda-ocl','xm',1.0),
                 ('BDS-00090%1$s','DDINTER','DDInter990%1$s','systemic','ddinter2','drugbank',1.0);
                INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES ('BDS-00090%1$s','%4$s','icd11','dgda-ocl');
                INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope) VALUES ('DDInter990%1$s','DDI-Partner%1$s','systemic');
                INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES ('BDS-00090%1$s','full','x');
                INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management)
                  VALUES ('TXT-%1$s','SECRET-TEXT-%1$s','SECRET-MGMT-%1$s');
                INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id)
                  VALUES ('DDInter9901','DDInter990%1$s','major','{monitor}','Pubolin','DDI-Partner%1$s','TXT-%1$s');
                INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route)
                  VALUES ('BDC-00090%1$s','tablet|systemic|BDS-00090%1$s:77.77mg/','%4$s 77.77 mg tablet','Tablet','systemic');
                INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, raw_text)
                  VALUES ('BDC-00090%1$s','BDS-00090%1$s',77.77,'mg','%4$s 77.77 mg');
                INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
                  VALUES ('%2$s','90%1$s','%3$s','Hush Pharma','Tablet','%4$s 77.77 mg','BDC-00090%1$s','parsed');
                INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('%2$s','XM9M0%1$s','%4$s');
                """.formatted(n, id, trade, name));
        }
        sql.append("""
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('M-1','DGDA-Drugs','M-PEND','pending',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-ENG','pending',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-ISS','issue',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-BACK','pending',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-REM','ok','removed from batch file', now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-DIS','pending',NULL, now() - interval '2 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('M-1','M-ENG','ok','','eng@example.org','engineer', now() - interval '1 hour'),
             ('M-1','M-ISS','issue','Strength looks wrong','pharm@example.org','pharmacist', now() - interval '1 hour'),
             ('M-1','M-BACK','ok','','pharm@example.org','pharmacist', now() - interval '3 hour'),
             ('M-1','M-REM','ok','','pharm@example.org','pharmacist', now() - interval '1 hour'),
             ('M-1','M-DIS','ok','','pharm@example.org','pharmacist', now() - interval '100 minute'),
             ('M-1','M-DIS','issue','ISSUE-NOTE-SECRET','pharm@example.org','pharmacist', now() - interval '90 minute'),
             ('M-1','M-DIS','dismiss','DISMISS-NOTE-SECRET','senior@example.org','senior', now() - interval '60 minute');
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at) VALUES
             ('DDInter9901','DDInter9902','issue','PAIR-NOTE-SECRET','%s','{}','senior@example.org','senior', now() - interval '30 minute'),
             ('DDInter9901','DDInter9902','reviewed','','%s','{}','senior@example.org','senior', now() - interval '10 minute');
            """.formatted("0".repeat(64), new PublicPairReviews.Pair("DDInter9901", "DDInter9902", "major", List.of("monitor"),
                "SECRET-TEXT-2", "SECRET-MGMT-2").hash()));
        exec(pg, sql.toString());
    }

    @Autowired WebTestClient web;

    private String get(String uri, Object... vars) {
        return new String(web.get().uri(uri, vars).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8);
    }
    private static void clean(String body, String where) {
        for (String m : MARKERS) assertThat(body).as(where + " leaks " + m).doesNotContain(m);
        assertThat(body).as(where).doesNotContain("reviewStatus", "\"issue\"", "\"changed\"", "dismiss", "@example.org");
    }

    @Test void search() {
        clean(get("/v1/search?q={q}", "hush"), "search hush");
        clean(get("/v1/search?q={q}", "secretolin"), "search secretolin");
        clean(get("/v1/search?q={q}", "secretolinp"), "search suggestion");
        web.get().uri("/v1/search?q={q}", "hush").exchange().expectBody()
            .jsonPath("$.data.counts.substances").isEqualTo(0)
            .jsonPath("$.data.products.length()").isEqualTo(6)
            .jsonPath("$.data.products[*].hidden").value(v -> assertThat(v.toString()).doesNotContain("false"));
        // no hidden record is ever an approved search row; Hushdis (dismissed) is a stub like the others
        assertThat(get("/v1/search?q={q}", "hush")).doesNotContain("\"status\":\"approved\"");
        assertThat(get("/v1/search?q={q}", "hushdis")).contains("\"conceptId\":\"M-DIS\"", "\"status\":\"not_reviewed\"");
        web.get().uri("/v1/search?q={q}", "secretolin").exchange().expectBody().jsonPath("$.data.total").isEqualTo(0);
    }

    @Test void productDetailAndInteractions() {
        for (String id : HIDDEN) {
            String detail = get("/v1/products/{id}", id);
            clean(detail, "product " + id);
            assertThat(detail).contains("\"hidden\":true", "\"batchId\":\"M-1\"");
            clean(get("/v1/products/{id}/interactions", id), "interactions " + id);
        }
        assertThat(get("/v1/products/{id}", "M-REM")).contains("\"status\":\"removed\"");
        assertThat(get("/v1/products/{id}", "M-ISS")).contains("\"status\":\"not_reviewed\"");
        // a dismissed issue is pending: the pre-dismissal ok never publishes it (§5.2, D57)
        assertThat(get("/v1/products/{id}", "M-DIS")).contains("\"status\":\"not_reviewed\"").doesNotContain("verification");
        assertThat(get("/v1/products/{id}/interactions", "M-DIS")).contains("\"status\":\"not_reviewed\"").doesNotContain("partners");
        String pub = get("/v1/products/{id}/interactions", "M-PUB");
        clean(pub, "Pubol's interactions");
        web.get().uri("/v1/products/M-PUB/interactions").exchange().expectBody().jsonPath("$.data.totalPartners").isEqualTo(0);
        clean(get("/v1/products/{id}", "M-PUB"), "Pubol's detail");
    }

    @Test void clinicalDrugs() {
        for (int n = 2; n <= 7; n++)
            web.get().uri("/v1/clinical-drugs/BDC-00090" + n).exchange().expectStatus().isNotFound();
        clean(get("/v1/clinical-drugs/{id}", "BDC-000901"), "BDC-000901");
    }

    @Test void substancesAndTheirInteractions() {
        for (int n = 2; n <= 7; n++) {
            String stub = get("/v1/substances/{id}", "BDS-00090" + n);
            assertThat(stub).contains("\"hidden\":true").doesNotContain("reviewStatus", "codes", "products", "DDInter", "XM9M0");
            String list = get("/v1/substances/{id}/interactions", "BDS-00090" + n);
            assertThat(list).contains("\"hidden\":true").doesNotContain("items", "SECRET-");
        }
        String pubolin = get("/v1/substances/{id}", "BDS-000901");
        clean(pubolin, "Pubolin");
        String items = get("/v1/substances/{id}/interactions", "BDS-000901");
        clean(items.replaceAll("SECRET-(TEXT|MGMT)-\\d", "DDINTER-OWN-TEXT"), "Pubolin's pairs");   // DDInter's own text for DDInter's own pairs is public (P9)
        assertThat(items).doesNotContain("\"state\":\"reviewed\"");
        web.get().uri("/v1/substances/BDS-000901/interactions").exchange().expectBody()
            .jsonPath("$.data.items.length()").isEqualTo(6)
            .jsonPath("$.data.items[*].partnerBdsId").value(v -> assertThat(v.toString()).doesNotContain("BDS-"))
            .jsonPath("$.data.items[*].pairReview.state").value(v -> assertThat(v.toString()).doesNotContain("issue"))
            // §7.4: Pubolin + Secretolin-P has a current senior review, but its partner is not public: never served
            .jsonPath("$.data.items[?(@.partnerBdsId == null)].pairReview.state")
                .value(v -> assertThat((List<?>) v).isNotEmpty().containsOnly("not_reviewed"))
            .jsonPath("$.data.items[?(@.partnerBdsId == null)].pairReview.reviewedAt")
                .value(v -> assertThat((List<?>) v).isNotEmpty().allMatch(java.util.Objects::isNull));
    }

    @Test void suggest() {
        String hush = get("/v1/products/suggest?q={q}", "hush");
        clean(hush, "suggest hush");
        assertThat(hush).contains("\"status\":\"not_reviewed\"").doesNotContain("\"status\":\"approved\"");
        assertThat(get("/v1/products/suggest?q={q}", "hushdis")).contains("\"conceptId\":\"M-DIS\"", "\"status\":\"not_reviewed\"");
        web.get().uri("/v1/products/suggest?q={q}", "secretolin").exchange().expectBody().jsonPath("$.data.length()").isEqualTo(0);
    }

    @Test void stats() {
        clean(get("/v1/stats"), "stats");
        // only Pubol is public: neither the dismissed record nor any other hidden one is counted as approved
        web.get().uri("/v1/stats").exchange().expectBody().jsonPath("$.data.approvedProducts").isEqualTo(1);
    }

    @Test void checker() {
        String body = new String(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of("M-PUB", "M-PEND", "M-ENG", "M-ISS", "M-BACK", "M-REM", "M-DIS"))).exchange()
            .expectStatus().isOk().expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.notReviewed.length()").isEqualTo(6)
            .jsonPath("$.data.notReviewed[5].conceptId").isEqualTo("M-DIS")
            .jsonPath("$.data.summary.medicines").isEqualTo(7)
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        clean(body, "checker");
    }
}
```

- [ ] **Step 2: Run the §12.1 matrix (both classes) and P1C's guard**

Run: `cd api && ./gradlew test --no-daemon --tests PublicVisibilityMatrixIntegrationTest --tests VisibilityApiIntegrationTest --tests PublicStatusGuardTest`
Expected: PASS. If `PublicStatusGuardTest` names one of this plan's adapters, that adapter reads `batch_item.review` outside `ReviewSql.statusOf` / `LATEST_PUBLIC`: fix the adapter, never the guard. If a matrix assertion fails, a P2 endpoint leaks: fix the endpoint, never weaken the marker list.

- [ ] **Step 3: Run the whole API suite**

Run: `cd api && ./gradlew test --no-daemon`
Expected: every test passes.

- [ ] **Step 4: Learn chapter 8's endpoint table follows the controllers (§6.8)**

`web/tests/learn-partners.test.tsx` pins `ENDPOINTS` to every controller mapping and `PLANNED` to the paths no controller serves, so the five P2a mappings fail it until the table follows them. In `web/content/learn/partners.tsx`, add these rows to `ENDPOINTS` after the `/v1/substances/{bdsId}` row:

```ts
  { method: "GET", path: "/v1/substances/{bdsId}/interactions?severity=&page=", what: "A substance's DDInter pairs with their text, 20 a page", access: ["Public", "All"] },
  { method: "GET", path: "/v1/search?q=&page=", what: "Search by brand, substance or DAR number: approved records, and stubs for the rest", access: ["Public", "All"] },
  { method: "GET", path: "/v1/products/suggest?q=&exclude=", what: "Up to 10 suggestions for the checker. Unapproved rows match on trade name and DAR only.", access: ["Public"] },
  { method: "GET", path: "/v1/products/{conceptId}/interactions?page=", what: "Pairs with approved products of every batch, by partner substance, 20 a page", access: ["Public", "All"] },
  { method: "GET", path: "/v1/clinical-drugs/{bdcId}", what: "A clinical drug, its ingredients and its approved brands", access: ["Public", "All"] },
```

and set `export const PLANNED = ["/v1/releases"] as const;` (its doc comment stays). In `web/tests/learn-partners.test.tsx`, the line `expect(PLANNED).toEqual(["/v1/search", "/v1/substances/{bdsId}/interactions", "/v1/releases"]);` becomes `expect(PLANNED).toEqual(["/v1/releases"]);`. Chapter 8's "Planned endpoints" line then names only `/v1/releases`, which is what the API now serves (§6.8: the table is "regenerated from the controllers … after §7 ships").

- [ ] **Step 5: The pre-P2 web still works against P2a**

Run: `cd web && API_URL=http://api:8080 npm test && npm run build`
Expected: PASS. (The old pages read `isHidden`, `alerts`, `notReviewed[].conceptId` and `substances.interactions`, which P2a keeps.)

- [ ] **Step 6: Commit and open PR 1 into `phase-2`**

```bash
git add api/src/test/java/com/niramoy/bddrug/PublicVisibilityMatrixIntegrationTest.java web/content/learn/partners.tsx \
  web/tests/learn-partners.test.tsx
git commit -m "test(api): §11.3 visibility matrix for every public endpoint; Learn chapter 8 lists the new endpoints (D28, PO D7, §6.8)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feature/intellidrugs-p2-public
gh pr create --base phase-2 --title "P2a: public API (§7.4)" --body "$(cat <<'EOF'
P2a of docs/superpowers/plans/2026-10-15-intellidrugs-p2-public.md: every §7.4 public endpoint with the one visibility rule, the
§7.4 stubs, the extended CheckResult, the public pair review state and the §11.3 visibility matrix
(PublicVisibilityMatrixIntegrationTest for every P2 endpoint, with VisibilityApiIntegrationTest: together the §12.1
"VisibilityApiIntegrationTest matrix"; fixtures include P1C's dismissed issue and approved-then-removed states).
The pre-P2 pages keep working.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: CI green on the PR. Merge it into `phase-2` before Task 16, then `git fetch origin && git rebase origin/phase-2`.

---

# Part P2b: Public pages (Tasks 16–40)

**Before Task 16:** PR 1 (P2a) has merged into `phase-2`; rebase the branch on it:

```bash
git fetch origin && git rebase origin/phase-2
(cd api && ./gradlew test --no-daemon) && (cd web && API_URL=http://api:8080 npm test)
```

Expected: both suites green.

### Task 16: The public copy (Board P strings and the P2 rows of `NEW_COPY`)

**Files:**
- Create: `web/lib/public-copy.ts`
- Modify: `web/lib/copy.ts`
- Test: `web/tests/public-copy.test.ts`, `web/tests/copy.test.ts`

**Interfaces:**
- Consumes: `NEW_COPY`, `NEW_COPY_ROWS`, `fill` (P1A); P1C's row for "Product page "With other approved medicines" (cross-batch, grouped by partner substance) and its paging" (an empty record P1C created; P2 fills it).
- Produces:
  - `lib/public-copy.ts` (client-safe, Board P verbatim): `NAV`, `FOOTER`, `LANDING`, `LOOKUP`, `SEARCH`, `STUB`, `PRODUCT`, `SUBSTANCE`, `CHECK`, `SIGNIN_CARD`, `PARTNERS`, `SYSTEM_NAMES`, `plural(n, one, many)`.
  - `lib/copy.ts`: the P2 rows of `NEW_COPY` filled, and the typed view `PUBLIC_NEW` with keys `ingredient`, `removed`, `checkerMax`, `hero`, `search`, `notFound`, `productPage`, `checker`, `partner`, `privacy`, `welcome`, `otherApproved`; the Board P strings that contain "low risk": `PUBLIC_BOARD.unknownPromise` ("Unknown severity is never called low risk") and `PUBLIC_BOARD.legendUnclassified` ("Never treated as low risk, never merged with Minor.").

Rule for where a string lives (spec preamble, §3.6, §11.1): a §3.6 safety sentence comes from its constant; a string Board P draws lives in `public-copy.ts`; any other quoted string is new copy and lives in `NEW_COPY` under the nearest §1.7 row; a string with "low risk" lives in `copy.ts`. `copy.test.ts` fails if a file retypes a `NEW_COPY` value.

- [ ] **Step 1: Write the failing test**

`web/tests/public-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as copy from "@/lib/copy";
import { CHECK, FOOTER, LANDING, NAV, PRODUCT, SEARCH, SIGNIN_CARD, STUB, plural } from "@/lib/public-copy";

describe("Board P strings (verbatim)", () => {
  it("navigation, landing and footer", () => {
    expect([NAV.medicines, NAV.checker, NAV.learn, NAV.partners, NAV.searchPlaceholder])
      .toEqual(["Medicines", "Interaction checker", "Learn", "For partners", "Brand, substance or DAR number"]);
    expect(LANDING.h1).toBe("Bangladesh's medicines, traced from brand to substance and checked by a pharmacist.");
    expect(LANDING.pilot).toBe("Pilot: {n} medicines being reviewed by pharmacists");
    expect(LANDING.ledeNarrow).toBe("Every DGDA-registered brand mapped to its clinical drug, active substances, international codes and DDInter 2.0 interactions. Public only after a pharmacist approves it.");
    expect(FOOTER.legal).toBe("Severity levels and management text are DDInter 2.0's, shown truncated, never rewritten.");
  });
  it("the §1.6 corrections replace the board strings they name", () => {
    expect(SEARCH.dataFound).toBe("Interaction data found in DDInter 2.0, {ids}");
    expect(JSON.stringify({ ...SEARCH, ...PRODUCT })).not.toContain("pilot brand");
    expect(JSON.stringify(PRODUCT)).not.toContain("With the other pilot medicines");
    expect(JSON.stringify(PRODUCT)).not.toContain("If the pipeline re-runs");
  });
  it("stub, checker and sign-in card", () => {
    expect(STUB.pending).toBe("A pharmacist hasn't approved this record yet. Until then IntelliDrugs hides its clinical drug, codes and interactions, so nobody relies on data that hasn't been checked.");
    expect(STUB.notNotFound).toBe('This is not the same as "not found" or "no data". The record exists and is in review in batch {batchId}.');
    expect(CHECK.help).toBe("Up and down arrows to move, Enter to add, Esc to close. 2 to 20 medicines.");
    expect(CHECK.emptyResults).toBe("Add medicines with the field on the left, or start from a scenario. Pairs appear here, Major first.");
    expect(SIGNIN_CARD.privacy).toBe("We use your Google name and email address only to sign you in and, for reviewers, to record each decision. Public decision history shows roles, never emails. We never post to your Google account.");
  });
  it("plural words", () => {
    expect([plural(1, "pair", "pairs"), plural(0, "pair", "pairs"), plural(2, "pair", "pairs")]).toEqual(["pair", "pairs", "pairs"]);
  });
});

describe("P2 new copy (§1.7)", () => {
  it("pins the strings §6 quotes for the states the boards do not draw", () => {
    const N = copy.PUBLIC_NEW;
    expect(N.removed.removed).toBe("Removed from the DGDA batch file.");
    expect(N.checkerMax.help).toBe("20 medicines is the maximum. Remove one to add another.");
    expect(N.hero.pendingLine).toBe("Its clinical drug, codes and interactions appear here after a pharmacist approves it.");
    expect(N.hero.ariaLabel).toBe("Lookup for {name}");
    expect(N.search).toMatchObject({ tooShort: "Type at least 2 characters.", tooLong: "Use 100 characters or fewer.",
      pageCap: "Showing the first 200 results. Refine your search to see more." });
    expect(N.notFound.text).toBe("No medicine with the id {id}.");
    expect(N.productPage.reportLabel).toBe("What's wrong? The IntelliDrugs team reads this.");
    expect(N.productPage.verificationRerun).toBe("If the pipeline changes data this approval covered, {brand} goes back to review and leaves public view until it is approved again.");
    expect(N.checker.unknownId).toBe("One medicine in the link no longer exists, so it was removed.");
    expect(N.checker.failTitle).toBe("Couldn't check these medicines.");
    expect(N.partner.sent).toBe("Request sent. The IntelliDrugs team replies to {email}.");
    expect(N.otherApproved.heading).toBe("With other approved medicines");
    expect(N.otherApproved.empty).toBe("No other approved medicine has an interaction with {substance} listed in DDInter 2.0 yet. Other medicines appear here as pharmacists approve them.");
    expect(N.privacy.audit).toBe("Each reviewer decision and sign-in is recorded with the account and time, for the team's audit trail. These records are never public.");
  });
  it("the low-risk board strings live in copy.ts", () => {
    expect(copy.PUBLIC_BOARD).toEqual({ unknownPromise: "Unknown severity is never called low risk",
      legendUnclassified: "Never treated as low risk, never merged with Minor." });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/public-copy.test.ts`
Expected: FAIL (`Cannot find module '@/lib/public-copy'`).

- [ ] **Step 3: Write `lib/public-copy.ts`**

```ts
/*
 * Board P wording for the public site (docs/artifacts/2026-10-12-intellidrugs-public.html), with the §1.6 corrections
 * (items 1, 9, 15 and 17) applied. Client-safe. New copy (§1.7) lives in NEW_COPY / PUBLIC_NEW (lib/copy.ts); strings
 * that name "low risk" live in lib/copy.ts too, because the paraphrase guard scans every other file.
 */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const NAV = {
  label: "Main", medicines: "Medicines", checker: "Interaction checker", learn: "Learn", partners: "For partners",
  signIn: "Sign in", menu: "Menu", searchLabel: "Search medicines", searchPlaceholder: "Brand, substance or DAR number",
  privacy: "Privacy",
} as const;

/** The other name systems that "call it" the preferred name (search hit line). */
export const SYSTEM_NAMES: Record<string, string> = { rxnorm: "RxNorm", icd11: "ICD-11", ddinter: "DDInter" };

export const FOOTER = {
  linksHeading: "IntelliDrugs",
  sourcesHeading: "Data sources and licences",
  sources: [
    { name: "DGDA register", text: ", the official register of DGDA-registered products.", confirm: null },
    { name: "DDInter 2.0", text: ", drug–drug, drug–disease and drug–food interactions.", confirm: "Licence line to confirm" },
    { name: "RxNav and RxNorm", text: ". This product uses publicly available data from the U.S. National Library of Medicine (NLM). NLM is not responsible for the product and does not endorse it.", confirm: null },
    { name: "ICD-11", text: " medicament codes, © World Health Organization, CC BY-ND 3.0 IGO.", confirm: null },
    { name: "ATC, DrugBank and SNOMED CT", text: " codes, mapped through RxNav.", confirm: "Licence lines to confirm" },
  ],
  host: "drugdb.eliooo.org",
  legal: "Severity levels and management text are DDInter 2.0's, shown truncated, never rewritten.",
} as const;

/** A tick line with a bold middle: [before, bold, after]. */
export type Tick = readonly [string, string, string];

export const LANDING = {
  pilot: "Pilot: {n} medicines being reviewed by pharmacists",
  h1: "Bangladesh's medicines, traced from brand to substance and checked by a pharmacist.",
  lede: "IntelliDrugs maps every DGDA-registered brand to its clinical drug and active substances, with ICD-11, RxNorm, ATC, DrugBank and SNOMED CT codes and DDInter 2.0 interactions. A record goes public only after a pharmacist approves it.",
  ledeNarrow: "Every DGDA-registered brand mapped to its clinical drug, active substances, international codes and DDInter 2.0 interactions. Public only after a pharmacist approves it.",
  ctaCheck: "Check interactions",
  ctaSearch: "Search medicines",
  fine: "Free to search. Continue with Google to sign in or create an account.",
  statsLabel: "IntelliDrugs in numbers",
  statRegister: "products in the official DGDA register",
  statCodesN: "5", statCodes: "code systems: ICD-11, RxNorm, ATC, DrugBank, SNOMED CT",
  statKindsN: "3", statKinds: "interaction kinds from DDInter 2.0: drug–drug, drug–disease, drug–food",
  statPilot: "medicines in pilot batch {id}, under pharmacist review now",
  audHeading: "One record, three kinds of work",
  audSub: "The same pharmacist-approved record serves the prescriber at the desk, the pharmacist at the counter and the systems that move prescriptions around.",
  audiences: [
    { title: "Doctors and prescribers", who: "Prescribing and checking a patient's medicines", ticks: [
      ["Find a brand by the name on the strip and see its ", "substance and strength", "."],
      ["Check a patient's medicines against each other, ", "Major first", "."],
      ["Read DDInter 2.0's own management text, truncated, ", "never paraphrased", "."]] as readonly Tick[] },
    { title: "Pharmacists", who: "Dispensing, substitution and review", ticks: [
      ["See the brands that share a ", "clinical drug", ", for substitution."],
      ["Trace every record to its ", "DGDA register entry", " and the checks it passed."],
      ["Invited pharmacists review records. ", "Their approval publishes them.", ""]] as readonly Tick[] },
    { title: "Partner companies", who: "EMR, pharmacy and pharma systems", ticks: [
      ["Permanent ", "BDS", " substance ids and BDC clinical drug ids."],
      ["Crosswalk codes to ", "ICD-11, RxNorm, ATC, DrugBank and SNOMED CT", "."],
      ["An interaction check that returns ", "pharmacist-approved data only", "."]] as readonly Tick[] },
  ],
  howHeading: "How a record becomes trustworthy",
  howSub: "Every product follows the same path. The last step before public is a person, and a re-run sends the record back to that person.",
  steps: [
    { title: "DGDA register", body: "Trade name, company, dosage form and generic text, read from the DGDA register exactly as filed." },
    { title: "Extraction", body: "Substances and strengths become a clinical drug, with codes for each substance." },
    { title: "4 automated checks", body: "DGDA load, substances, clinical drug and DDInter. Each ends OK, Warning or Failed with the pipeline's own note." },
    { title: "Pharmacist approval", body: "A pharmacist compares the register with the result. An engineer's check is recorded but never publishes." },
    { title: "Public", body: "Search, product pages, the checker and the partner API show the record." },
  ],
  stepRaw: "Paracetamol 500 mg", stepClinical: "Acetaminophen 500 mg tablet", stepBdc: "BDC-000001",
  loopLead: "Re-run after approval", loopText: "The record leaves public view until a pharmacist approves it again.",
  promisesHeading: "Three promises",
  promisesSub: "Fixed wording, the same on every screen and in the API. Silence is never shown as safety.",
  promiseNoData: "Missing data is never shown as safe",
  promiseNoDataName: "Domperidone", promiseNoDataId: "BDS-000010",
  promiseNoDataNote: "Pairs with Domperidone are counted as not checked, never as checked.",
  promiseApproval: "Nothing is public until a pharmacist approves it",
  promiseApprovalNote: "An engineer's check is recorded but does not publish. A record re-run after approval goes back to review.",
  promiseUnknownNote: "DDInter lists 512 of Acetaminophen's 645 drug pairs without a severity. They keep their own group and are never merged with Minor.",
  partnersHeading: "For partners: the same records, by API",
  partnersSub: "EMR, pharmacy and pharma systems get what the site shows: pharmacist-approved records, permanent ids and crosswalk codes, in one response envelope.",
  partnerTicks: [
    "Check several products in one call. Alerts come sorted by severity, Major first.",
    "No-data substances and unreviewed products are listed by name, ",
    "Every response uses ",
  ],
  partnerTickBold: "never dropped",
  partnerEnvelope: "{success, data, message, errors, metadata}",
  requestAccess: "Request partner access",
  requestNote: "Sign in first. Access is granted by the IntelliDrugs team.",
  codeRequest: "POST /v1/interactions/check",
  codeRequestLabel: "Request example",
  codeResponseLabel: "Public response example",
  responseToday: "Public response today.",
  responseNoneApproved: "None of the three is approved by a pharmacist, so all three are in notReviewed and nothing is checked. An empty alerts list does not mean they are safe together.",
} as const;

export const LOOKUP = {
  brand: "Brand in the DGDA register", brandNarrow: "Brand", clinical: "Clinical drug", substance: "Active substance",
  interactions: "Drug interactions in DDInter 2.0, {n} pairs", filedAs: "Filed as ", route: ", {route} route",
  alsoListed: ", also listed as {name}", alsoNarrow: ", also {name}",
} as const;

export const SEARCH = {
  resultsFor: 'Results for "{q}"',
  substanceOne: "substance", substanceMany: "substances", productOne: "product", productMany: "products",
  groupSubstance: "Substance", groupSubstances: "Substances", groupProducts: "Products",
  hitDgda: "Matched {matched}, the name in the DGDA register. {systems} call it {preferred}.",
  dataFound: "Interaction data found in DDInter 2.0, {ids}",
  filedAs: "Filed as {raw}. Clinical drug {display}, {bdc}.",
  stubLine: "A pharmacist hasn't approved this record yet, so its substance, codes and interactions are hidden.",
  noResults: 'No medicines match "{q}"',
  noResultsHint: "Check the spelling, or search by brand, substance or DAR number.",
  searchFor: "Search for {suggestion}",
  pilot: "IntelliDrugs is in its pilot. {n} medicines are in review now, and more follow in later batches.",
} as const;

export const STUB = {
  pending: "A pharmacist hasn't approved this record yet. Until then IntelliDrugs hides its clinical drug, codes and interactions, so nobody relies on data that hasn't been checked.",
  notNotFound: 'This is not the same as "not found" or "no data". The record exists and is in review in batch {batchId}.',
  substancePending: "A pharmacist hasn't approved this record yet. Until then IntelliDrugs hides its codes and interactions, so nobody relies on data that hasn't been checked.",
  searchOther: "Search other medicines",
} as const;

export const PRODUCT = {
  crumbRoot: "Medicines",
  crumbLabel: "Breadcrumb",
  whatsIn: "What's in it", whatsInSub: "From the register to the substance",
  traceBrand: "Brand, as filed with DGDA", traceClinical: "Clinical drug", traceSubstance: "Active substance",
  clinicalForm: "{form}, {route} route", alsoListed: "Also listed as {name}", namesLabel: "Names for this substance",
  codes: "Codes", codesSub: "{k} code systems and the DDInter entry, for {name} {bdsId}", codesCaption: "Crosswalk codes for {name}",
  codesRegion: "Codes for {name}",
  colSystem: "System", colCode: "Code", colWhat: "What the system is", colHow: "How it was matched",
  how: "{method}, confidence {confidence}",
  systems: {
    ICD11_XM: ["ICD-11", "WHO's ICD-11 medicament code. The DGDA register lists ingredients with it."],
    RXCUI: ["RxNorm", "Normalised drug names from the U.S. National Library of Medicine."],
    ATC: ["ATC", "WHO Anatomical Therapeutic Chemical classification."],
    DRUGBANK: ["DrugBank", "DrugBank's record for the substance."],
    SNOMEDCT: ["SNOMED CT", "Clinical terminology used in health records."],
    DDINTER: ["DDInter", "The DDInter 2.0 entry the interactions below come from."],
  } as Record<string, readonly [string, string]>,
  interactions: "Interactions", interactionsSub: "From DDInter 2.0, for {name}",
  pairsHeading: "{total} drug–drug pairs",
  diseaseOne: "drug–disease interaction", diseaseMany: "drug–disease interactions",
  foodOne: "drug–food interaction", foodMany: "drug–food interactions",
  checks: "Automated checks", checksSub: "{ok} OK, {w} {warnings}. Notes are the pipeline's own.",
  warningOne: "Warning", warningMany: "Warnings",
  noNote: "No pipeline note.",
  textMissing: "DDInter text not found for {n} {pairs}:",
  pairOne: "pair", pairMany: "pairs", brandOne: "brand", brandMany: "brands",
  asideLabel: "About this record",
  verification: "Verification",
  verifiedText: "A pharmacist compared this record with the DGDA register on {date}. Decision history shows roles, not names.",
  otherBrands: "Other brands of {name}",
  whereFrom: "Where this record comes from",
  dlSource: "Source", dlConcept: "Concept", dlExtracted: "Extracted", dlBatch: "Batch", dlChecks: "Checks",
  dgdaRegister: "DGDA register",
  checksValue: "{ok} OK, {w} Warning",
  checkWith: "Check {brand} with other medicines",
  report: "Report a problem with this record",
  sourceLine: "Source: DDInter 2.0, {a} + {b}",
} as const;

export const CHECK = {
  h1: "Check interactions",
  fieldLabel: "Add a medicine",
  placeholder: "Brand or substance, such as Napa or paracetamol",
  help: "Up and down arrows to move, Enter to add, Esc to close. 2 to 20 medicines.",
  selected: "Selected, {k} of 20",
  clearAll: "Clear all",
  none: "No medicines yet.",
  remove: "Remove {brand}",
  scenarios: "Start from a scenario",
  empty: "Add at least 2 medicines to check them against each other.",
  emptyResults: "Add medicines with the field on the left, or start from a scenario. Pairs appear here, Major first.",
  groupHeading: "{severity}, {k} {pairs}",
  matches: ". Matches {name}",
  matchesFor: ". Matches {name}, a name for {substance}",
  managementTruncated: "Management, truncated. Full text from DDInter 2.0.",
  managementFull: "Management, full text from DDInter 2.0.",
  interactionTruncated: "Interaction description, truncated. Full text from DDInter 2.0.",
  interactionFull: "Interaction description, full text from DDInter 2.0.",
  noText: "DDInter 2.0 gives no text for this pair.",
  metaAction: "{a} + {b}. Action: {actions}",
  legendHeading: "Severity legend, from DDInter 2.0",
  noDataChip: "No data",
  added: "{brand} added. {summary}",
  removedAnnounce: "{brand} removed. {summary}",
  cleared: "All medicines removed.",
  scenarioLoaded: "Scenario loaded: {scenario}. {summary}",
  notCheckedChip: "Not checked",
  medicineOne: "medicine", medicineMany: "medicines", pairOne: "pair", pairMany: "pairs", productOne: "product", productMany: "products",
  has: "has", have: "have",
} as const;

export const SIGNIN_CARD = {
  turnstile: "Cloudflare Turnstile",
  inviteLead: "Reviewing for the pilot?",
  inviteBody: "Pharmacists and engineers join by invite. Continue with the Google account your invite was sent to, and your reviewer tools appear.",
  privacy: "We use your Google name and email address only to sign you in and, for reviewers, to record each decision. Public decision history shows roles, never emails. We never post to your Google account.",
  privacyLink: "Privacy",
  readerHeading: "You're signed in as a reader",
  readerBody: "You can search medicines and check interactions. Reviewing needs an invite. If you were invited, sign out and continue with the invited Google account.",
  signOut: "Sign out",
  signedInAs: "Signed in as {name}",
  reviewerHeading: "You're a {role} reviewer for batch {id}",
  stepWaiting: "{n} records are waiting. Each shows {pill} until a pharmacist approves it.",
  stepCompare: "Compare the DGDA register with the extraction, then press {a} or choose Looks correct. You have {undo} seconds to undo with {u}.",
  stepPharmacist: "Your approval publishes the record. If the pipeline re-runs it later, it comes back to you as {pill}.",
  shortcutsNote: "Shortcuts work inside the desk only, and pause while you type.",
} as const;

/**
 * §6.6 substance page. "The boards define no substance page. It uses the product-page components only." These are the
 * page's own headings and lines; §1.7 has no row for them (recorded in the PR as a spec gap), so they live here.
 */
export const SUBSTANCE = {
  entriesHeading: "DDInter entries",
  ddHeading: "Drug–drug interactions",
  filterLabel: "Filter by severity",
  filterAll: "All",
  diseaseHeading: "Drug–disease",
  foodHeading: "Drug–food",
  productsHeading: "Products",
  clinicalHeading: "Clinical drugs",
  pairMeta: "{a} ({route}) + {b}. Action: {actions}",
  entryLine: "{id} ({route})",
  noneListed: "None listed in DDInter 2.0.",
  fullRecord: "Full record in DDInter 2.0",
} as const;

export const PARTNERS = {
  h1: "For partners",
  apiHeading: "Where the API stands",
  apiNow: "The API runs on the internal network today. Partner API keys, usage metering, OpenAPI docs and monthly releases are planned.",
  learnMore: "Learn chapter 8, For partners",
  formHeading: "Request partner access",
} as const;
```

The landing's process step 3 shows the three stage words with their icons; `LANDING` holds no string for them because `StageCheck`'s words ("OK", "Warning", "Failed") come from `components/ui/StageCheck.tsx`.

- [ ] **Step 4: Fill the P2 rows of `NEW_COPY` and add the typed view**

In `web/lib/copy.ts`, replace the empty P2 records (`productIngredientNoData`, `removedStub`, `checkerMax`, `heroCard`, `search`, `productNotFound`, `productPage`, `checker`, `partnerSent`) and P1C's empty record for the "With other approved medicines" row, and extend `signIn` and `noPhiHelp`:

```ts
  [NEW_COPY_ROWS.productIngredientNoData]: {
    codesNoEntry: "No entry for route {route}",
    codesNoEntryNoRoute: "No entry for this product's route",
  },
  [NEW_COPY_ROWS.removedStub]: { removed: "Removed from the DGDA batch file." },
  [NEW_COPY_ROWS.checkerMax]: { help: "20 medicines is the maximum. Remove one to add another." },
  [NEW_COPY_ROWS.heroCard]: {
    pendingLine: "Its clinical drug, codes and interactions appear here after a pharmacist approves it.",
    ariaLabel: "Lookup for {name}",
    statBatches: "medicines in {k} batches, under pharmacist review now",
  },
  [NEW_COPY_ROWS.search]: {
    tooShort: "Type at least 2 characters.",
    tooLong: "Use 100 characters or fewer.",
    pageCap: "Showing the first 200 results. Refine your search to see more.",
    hitRxnorm: "Matched {matched}, the RxNorm name.",
    hitDdinter: "Matched {matched}, the DDInter name.",
    approvedOne: "{k} approved product",
    approvedMany: "{k} approved products",
  },
  [NEW_COPY_ROWS.productNotFound]: { text: "No medicine with the id {id}." },
  [NEW_COPY_ROWS.productPage]: {
    reportLabel: "What's wrong? The IntelliDrugs team reads this.",
    reportHelp: "5 to 2000 characters.",
    signInToReport: "Sign in to report a problem",
    noOtherBrand: "No other approved brand maps to {bdcId} yet. Other DGDA brands of this clinical drug appear here as pharmacists approve them.",
    verificationRerun: "If the pipeline changes data this approval covered, {brand} goes back to review and leaves public view until it is approved again.",
  },
  [NEW_COPY_ROWS.checker]: {
    summary: "{m} {medicines} · {checked} of {total} {pairs} checked · {alerts} with an interaction listed",
    ncNoData: " · {nc} {pairs} not checked because {names} {has} no interaction data",
    nc: " · {nc} {pairs} not checked",
    nr: " · {nr} {medicines} not yet reviewed by a pharmacist",
    otherNotChecked: "Other not checked",
    noInteractionHeading: "No interaction listed in DDInter 2.0, {k} {pairs}",
    noInteractionCaveat: "DDInter 2.0 lists no interaction for these pairs. This is not a guarantee that they are safe to combine.",
    sameProduct: "Not checked: {a} + {b} are in the same product, {brand}. Pairs inside one product are not checked.",
    routeAssumedPair: "Route assumed: {brand}'s route is {route} and DDInter has no {route} entry for {substance}, so the systemic entry {id} was used.",
    routeAssumedPairNoRoute: "Route assumed: {brand} has no route on record, so the systemic entry {id} was used.",
    sameSubstanceHeading: "Same substance in more than one product",
    notReviewedCount: "{k} {products}",
    notReviewedNote: "These products were not checked. A pharmacist hasn't approved them yet.",
    whatChecked: "What was checked",
    checkedLine: "{brand}: {substance} checked against {id} {name} ({route})",
    unknownId: "One medicine in the link no longer exists, so it was removed.",
    failTitle: "Couldn't check these medicines.",
    failBody: "Nothing was saved. Try again in a moment.",
    find: "Find",
    noMatch: 'No medicine matches "{q}".',
  },
  [NEW_COPY_ROWS.partnerSent]: {
    sent: "Request sent. The IntelliDrugs team replies to {email}.",
    organisation: "Organisation",
    kind: "Kind of system",
    kindEmr: "EMR",
    kindPharmacy: "Pharmacy",
    kindPharma: "Pharma company",
    kindOther: "Other",
    use: "What you will build",
    useHelp: "20 to 1500 characters.",
    volume: "Expected checks per day",
    volumeLow: "Under 1,000",
    volumeMid: "1,000–10,000",
    volumeHigh: "Over 10,000",
  },
```

For the P1C row, find its key with `grep -n "With other approved medicines" web/lib/copy.ts` and replace P1C's empty `{}` with:

```ts
  {
    heading: "With other approved medicines",
    meta: "With {k} approved {brands}: {list}. Action: {actions}",
    metaMore: "With {k} approved {brands}: {list} and {n} more. Action: {actions}",
    allBrands: "All {k} brands",
    unclassifiedWith: "{substance} with {partners}.",
    reviewedBracket: "(pair reviewed by a senior pharmacist on {date})",
    notReviewedBracket: "(pair not yet reviewed by a senior pharmacist)",
    notCheckedIn: "Not checked: {substance} + {partner}, in {k} approved {brands}",
    brandsMore: "and {n} more.",
    allBrandsOf: "All brands of {substance}",
    more: "More interactions",
    previous: "Previous interactions",
    empty: "No other approved medicine has an interaction with {substance} listed in DDInter 2.0 yet. Other medicines appear here as pharmacists approve them.",
  },
```

Extend the sign-in row (P1A's `signIn` record keeps its keys; the engineer step is part of that §1.7 row) and the `noPhiHelp` row (the `/privacy` text, §9.7):

```ts
    welcomeEngineerStep: "Your check is recorded but does not publish. A pharmacist approves each record.",
    welcomeSeniorHeading: "You're a senior pharmacist reviewer for batch {id}",
    welcomeSeniorStep: "Senior review shows every interaction pair between the medicines we hold, from all batches. Mark each pair reviewed, or report a pair issue.",
    openPairQueue: "Open the pair queue",
```

```ts
  [NEW_COPY_ROWS.noPhiHelp]: {
    help: NO_PHI_HELP,
    privacyAudit: "Each reviewer decision and sign-in is recorded with the account and time, for the team's audit trail. These records are never public.",
    privacyNoPhi: "Don't include patient names or other personal health details in notes, reports or requests. We don't ask for patient information.",
  },
```

If `grep -n "Senior review shows every interaction pair" web/lib/copy.ts` already finds P1C's copy of the senior welcome step, import P1C's three strings into `PUBLIC_NEW.welcome` below instead of adding them to the sign-in row.

Then add, after `LEARN_BOARD`:

```ts
const OTHER_APPROVED_ROW = 'Product page "With other approved medicines" (cross-batch, grouped by partner substance) and its paging' as NewCopyState;

/** Typed views of the P2 rows, so public modules never index NEW_COPY by row text. */
export const PUBLIC_NEW = {
  ingredient: NEW_COPY[NEW_COPY_ROWS.productIngredientNoData] as Record<"codesNoEntry" | "codesNoEntryNoRoute", string>,
  removed: NEW_COPY[NEW_COPY_ROWS.removedStub] as Record<"removed", string>,
  checkerMax: NEW_COPY[NEW_COPY_ROWS.checkerMax] as Record<"help", string>,
  hero: NEW_COPY[NEW_COPY_ROWS.heroCard] as Record<"pendingLine" | "ariaLabel" | "statBatches", string>,
  search: NEW_COPY[NEW_COPY_ROWS.search] as Record<"tooShort" | "tooLong" | "pageCap" | "hitRxnorm" | "hitDdinter" | "approvedOne"
    | "approvedMany", string>,
  notFound: NEW_COPY[NEW_COPY_ROWS.productNotFound] as Record<"text", string>,
  productPage: NEW_COPY[NEW_COPY_ROWS.productPage] as Record<"reportLabel" | "reportHelp" | "signInToReport" | "noOtherBrand"
    | "verificationRerun", string>,
  checker: NEW_COPY[NEW_COPY_ROWS.checker] as Record<"summary" | "ncNoData" | "nc" | "nr" | "otherNotChecked" | "noInteractionHeading"
    | "noInteractionCaveat" | "sameProduct" | "routeAssumedPair" | "routeAssumedPairNoRoute" | "sameSubstanceHeading"
    | "notReviewedCount" | "notReviewedNote" | "whatChecked" | "checkedLine" | "unknownId" | "failTitle" | "failBody" | "find"
    | "noMatch", string>,
  partner: NEW_COPY[NEW_COPY_ROWS.partnerSent] as Record<"sent" | "organisation" | "kind" | "kindEmr" | "kindPharmacy" | "kindPharma"
    | "kindOther" | "use" | "useHelp" | "volume" | "volumeLow" | "volumeMid" | "volumeHigh", string>,
  privacy: { audit: NEW_COPY[NEW_COPY_ROWS.noPhiHelp].privacyAudit, noPhi: NEW_COPY[NEW_COPY_ROWS.noPhiHelp].privacyNoPhi },
  welcome: NEW_COPY[NEW_COPY_ROWS.signIn] as Record<"welcomeEngineerStep" | "welcomeSeniorHeading" | "welcomeSeniorStep"
    | "openPairQueue", string>,
  otherApproved: NEW_COPY[OTHER_APPROVED_ROW] as Record<"heading" | "meta" | "metaMore" | "allBrands" | "unclassifiedWith"
    | "reviewedBracket" | "notReviewedBracket" | "notCheckedIn" | "brandsMore" | "allBrandsOf" | "more" | "previous" | "empty", string>,
} as const;

/** Board P strings that name "low risk" (the paraphrase guard allows them only here). */
export const PUBLIC_BOARD = {
  unknownPromise: "Unknown severity is never called low risk",
  legendUnclassified: "Never treated as low risk, never merged with Minor.",
} as const;
```

`OTHER_APPROVED_ROW` is the §1.7 row text with `*(P1C)* ` removed: P1C's plan keys every P1C row of `NEW_COPY` that way (its Global Constraints, "copy keys"), and this row is one of its eight. P1C creates that key with an empty record (it builds no public page); this task fills it (Step 4 above).

In `web/tests/copy.test.ts`, the P1A pins of the `signIn` and `noPhiHelp` rows (`toEqual`) gain the keys above (the `signIn` pin adds the four welcome keys unless P1C holds them; the `noPhiHelp` pin becomes `toMatchObject({ help: copy.NO_PHI_HELP })` plus the two privacy strings).

- [ ] **Step 5: Run the copy tests**

Run: `cd web && npx vitest run tests/public-copy.test.ts tests/copy.test.ts`
Expected: PASS. If "no source file retypes a NEW_COPY string" names `lib/public-copy.ts` (a P1C `NEW_COPY` value equals a Board P string, for example a "Source" column label), replace that literal in `public-copy.ts` with the import of P1C's value.

- [ ] **Step 6: Commit**

```bash
git add web/lib/public-copy.ts web/lib/copy.ts web/tests/public-copy.test.ts web/tests/copy.test.ts
git commit -m "feat(web): Board P strings and the P2 rows of NEW_COPY (§6, §1.6 items 1, 9, 15, 17, §1.7)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: The public API client (`lib/public-types.ts`, readers in `lib/api.ts`)

**Files:**
- Create: `web/lib/public-types.ts`
- Modify: `web/lib/api.ts`
- Test: `web/tests/public-api.test.ts`

**Interfaces:**
- Consumes: the P2a shapes (Tasks 1–14).
- Produces (all server-only readers; each sends `scope=public` and never the token):
  - `type Read<T> = { ok: true; data: T } | { ok: false; status: number }` (status 0 = network or timeout; 502 = malformed body).
  - `searchMedicines(q: string, page: number): Promise<Read<SearchResult>>`
  - `getPublicProduct(id: string): Promise<Read<PublicProduct | ProductStub>>`
  - `getProductInteractions(id: string, page: number): Promise<Read<ProductInteractions | ProductStub>>`
  - `getClinicalDrug(bdcId: string): Promise<Read<ClinicalDrugView>>`
  - `getPublicSubstance(bdsId: string): Promise<Read<PublicSubstance | SubstanceStub>>`
  - `getSubstanceInteractions(bdsId: string, severity: SeverityFilter | null, page: number): Promise<Read<SubstanceInteractions | SubstanceStub>>`
  - `suggestProducts(q: string, exclude: string[]): Promise<Read<SuggestRow[]>>`
  - `checkPublic(ids: string[]): Promise<CheckRead>` where `CheckRead = { ok: true; data: CheckResult } | { ok: false; status: number; unknownId: string | null }`
  - `requestPartnerAccess(message: string, reporterEmail: string, requestId: string): Promise<WriteResult<unknown>>` (a flag `other` / `partner-access`, D17); `FlagTarget` gains `"other"`.
  - `isStub(x): x is ProductStub | SubstanceStub`.

- [ ] **Step 1: Write the failing test**

`web/tests/public-api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPublic, getProductInteractions, getPublicProduct, getSubstanceInteractions, isStub, requestPartnerAccess,
  searchMedicines, suggestProducts } from "@/lib/api";

const fetchMock = vi.fn();
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", "x".repeat(40));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const url = () => String(fetchMock.mock.calls[0][0]);
const headers = () => (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;

describe("public reads (§2.2: scope=public, never the token)", () => {
  it("search, product, interactions, substance pairs and suggest send scope=public and no token", async () => {
    for (const call of [() => searchMedicines("napa", 2), () => getPublicProduct("a/b"), () => getProductInteractions("N-1", 1),
      () => getSubstanceInteractions("BDS-1", "major", 3), () => suggestProducts("na", ["A", "B"])]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(ok({}));
      await call();
      expect(url()).toContain("scope=public");
      expect(headers()["X-Internal-Token"]).toBeUndefined();
    }
  });

  it("builds each path and query exactly", async () => {
    fetchMock.mockResolvedValue(ok({}));
    await searchMedicines("100% napa", 2);
    expect(url()).toBe("http://api:8080/v1/search?q=100%25+napa&page=2&scope=public");
    fetchMock.mockClear();
    await getPublicProduct("a/b");
    expect(url()).toBe("http://api:8080/v1/products/a%2Fb?scope=public");
    fetchMock.mockClear();
    await getSubstanceInteractions("BDS-1", null, 0);
    expect(url()).toBe("http://api:8080/v1/substances/BDS-1/interactions?page=0&scope=public");
    fetchMock.mockClear();
    await suggestProducts("na", ["A", "B"]);
    expect(url()).toBe("http://api:8080/v1/products/suggest?q=na&exclude=A&exclude=B&scope=public");
  });

  it("answers status codes, network failures and malformed bodies as Read failures", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await getPublicProduct("x")).toEqual({ ok: false, status: 404 });
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await getPublicProduct("x")).toEqual({ ok: false, status: 0 });
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));
    expect(await getPublicProduct("x")).toEqual({ ok: false, status: 502 });
  });

  it("isStub reads the hidden flag only", () => {
    expect(isStub({ conceptId: "a", tradeName: "A", status: "removed", batchId: null, hidden: true })).toBe(true);
    expect(isStub({ conceptId: "a" })).toBe(false);
  });
});

describe("checkPublic (§6.7.3 API errors)", () => {
  it("names the unknown id from a 404 so the page can drop it", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false,
      errors: [{ field: "conceptIds", code: "NOT_FOUND", message: "Product not found: gone-1" }] }), { status: 404 }));
    expect(await checkPublic(["N-1", "gone-1"])).toEqual({ ok: false, status: 404, unknownId: "gone-1" });
  });
  it("posts the ids with scope=public and no token", async () => {
    fetchMock.mockResolvedValue(ok({ summary: {}, products: [], alerts: [], noInteraction: [], notChecked: [], duplicates: [], noData: [],
      notReviewed: [] }));
    const r = await checkPublic(["A", "B"]);
    expect(r.ok).toBe(true);
    expect(url()).toBe("http://api:8080/v1/interactions/check?scope=public");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ conceptIds: ["A", "B"] });
    expect(headers()["X-Internal-Token"]).toBeUndefined();
  });
  it("a 5xx or a body without the §7.4 lists is a failure without an id", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    expect(await checkPublic(["A", "B"])).toEqual({ ok: false, status: 503, unknownId: null });
    fetchMock.mockResolvedValue(ok({ alerts: [] }));
    expect(await checkPublic(["A", "B"])).toEqual({ ok: false, status: 502, unknownId: null });
  });
});

describe("partner request (§6.9, D17)", () => {
  it("is a flag other/partner-access with the token", async () => {
    fetchMock.mockResolvedValue(ok({ id: 1 }));
    await requestPartnerAccess("Organisation: Acme", "me@example.org", "11111111-1111-4111-8111-111111111111");
    expect(url()).toBe("http://api:8080/v1/flags");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ targetType: "other", targetId: "partner-access",
      message: "Organisation: Acme", reporterEmail: "me@example.org", requestId: "11111111-1111-4111-8111-111111111111" });
    expect(headers()["X-Internal-Token"]).toBe("x".repeat(40));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/public-api.test.ts`
Expected: FAIL (`searchMedicines is not a function`).

- [ ] **Step 3: Write the types**

`web/lib/public-types.ts`:

```ts
/**
 * Client-safe types of the §7.4 public API (P2a). A field the API may send as null is typed `| null`. Islands may import
 * these types; the fetches are in lib/api.ts (server-only).
 */
export type Source = { url: string; label: string; fetchedAt: string | null };
export type PublicPairReview = { state: "reviewed" | "not_reviewed"; reviewedAt: string | null };
export type Coverage = "full" | "none" | "not_run";
export type SeverityFilter = "major" | "moderate" | "minor" | "unknown";
export type StageKey = "dgda" | "substances" | "clinical" | "ddinter";
export type StageNote = { kind: string; text: string; ddinterId: string | null; route: string | null };
export type Counts = { major: number; moderate: number; minor: number; unknown: number; total: number };

export type ProductStub = { conceptId: string; tradeName: string; status: "not_reviewed" | "removed"; batchId: string | null; hidden: true };
export type SubstanceStub = { bdsId: string; preferredName: string; hidden: true };

export type ChosenEntry = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type IngredientSummary = {
  bdsId: string | null; name: string; raw: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null;
  names: { name: string; type: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; method: string; confidence: number; source: Source | null }[];
  coverage: { coverage: Coverage; note: string };
  ddinter: { chosen: ChosenEntry[];
    entries: { ddinterId: string; name: string | null; routeScope: string; counts: Counts; diseaseCount: number; foodCount: number;
      source: Source | null }[] };
};
export type DdinterRef = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type ClinicalItem = { bdsId: string; name: string; strengthValue: number | null; strengthUnit: string | null; perValue: number | null;
  perUnit: string | null; ddinter: DdinterRef[]; summary: IngredientSummary | null };
export type TextMissing = { ddinterA: string; nameA: string; ddinterB: string; nameB: string; severity: string | null };
export type PublicStage = { stage: StageKey; status: "ok" | "warn" | "fail"; notes: StageNote[]; textMissing: TextMissing[] };
export type PublicProduct = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string; genericContentRaw: string;
  qualityFlag: string | null; ingredients: { xmCode: string; name: string }[]; parseStatus: string | null; parseNote: string | null;
  clinicalDrug: { bdcId: string; displayName: string; doseForm: string; route: string; ingredients: ClinicalItem[] } | null;
  verification: { status: "approved"; role: "pharmacist"; approvedAt: string | null };
  provenance: { batchId: string | null; extractedAt: string | null; source: string; sourceLink: Source | null; stages: PublicStage[] };
  otherBrandsCount: number;
};

export type SubstanceRef = { bdsId: string | null; name: string };
export type Brand = { conceptId: string; tradeName: string };
export type InteractionPair = { substance: SubstanceRef; partnerSubstance: SubstanceRef; severity: string; actions: string[];
  interaction: string | null; management: string | null; ddinterA: string; ddinterB: string; routeAssumed: boolean; source: string;
  pairReview: PublicPairReview; brands: Brand[]; brandCount: number };
export type InteractionNotChecked = { substance: SubstanceRef; partnerSubstance: SubstanceRef;
  reason: "no_data" | "not_run" | "no_route" | "unmapped"; route: string | null; brands: Brand[]; brandCount: number };
export type ProductInteractions = { conceptId: string; page: number; totalPartners: number; partners: InteractionPair[];
  notChecked: InteractionNotChecked[] };

export type ClinicalDrugView = { bdcId: string; displayName: string; doseForm: string; route: string;
  ingredients: { bdsId: string; name: string; strengthValue: number | null; strengthUnit: string | null; perValue: number | null; perUnit: string | null }[];
  products: { conceptId: string; tradeName: string; company: string; darNumber: string }[] };

export type SubstanceEntry = { ddinterId: string; name: string | null; routeScope: string; counts: Counts; diseaseCount: number;
  foodCount: number; sourceLink: Source | null };
export type PublicSubstance = {
  bdsId: string; preferredName: string;
  names: { name: string; nameType: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; source: string; method: string; confidence: number; sourceLink: Source | null }[];
  coverage: { coverage: Coverage; note: string };
  products: { conceptId: string; tradeName: string; company: string }[];
  diseases: { diseaseName: string; severity: string; text: string | null; interactionId: string; routeScope: string }[];
  foods: { food: string; severity: string; description: string | null; management: string | null; interactionId: string; routeScope: string }[];
  entries: SubstanceEntry[];
  clinicalDrugs: { bdcId: string; displayName: string }[];
};
export type SubstanceInteractionItem = { partnerName: string; partnerBdsId: string | null; ddinterA: string; ddinterB: string;
  routeScope: string; severity: string; actions: string[]; interaction: string | null; management: string | null;
  pairReview: PublicPairReview; sourceUrl: string | null };
export type SubstanceInteractions = { bdsId: string; counts: SubstanceEntry[]; total: number; page: number; size: number;
  items: SubstanceInteractionItem[] };

export type SearchSubstance = { bdsId: string; preferredName: string; matchedName: string;
  matchedNameType: "preferred" | "dgda_content" | "rxnorm" | "ddinter" | "icd11"; otherNameTypes: string[]; coverage: Coverage;
  ddinterIds: string[]; keyCodes: { atc: string[]; rxcui: string[] }; approvedProductCount: number };
export type SearchProduct = { conceptId: string; tradeName: string; darNumber: string; company: string; dosageForm: string;
  genericContentRaw: string; clinicalDrug: { bdcId: string; displayName: string } | null;
  matchedOn: "trade_name" | "dar" | "generic" | "substance"; matchedName: string | null; status: "approved" };
export type SearchStub = { conceptId: string; tradeName: string; status: "not_reviewed"; hidden: true };
export type SearchResult = { query: string; total: number; hasMore: boolean; counts: { substances: number; products: number };
  substances: SearchSubstance[]; products: (SearchProduct | SearchStub)[]; suggestion: string | null };

export type SuggestRow = { conceptId: string; tradeName: string; dosageForm: string; status: "approved" | "not_reviewed";
  clinicalDisplayName: string | null; matched: { name: string; substance: string } | null };

export type Side = { conceptId: string; tradeName: string; bdsId: string | null; name: string; routeScope: string | null };
export type CheckAlert = { severity: string; a: Side; b: Side; actions: string[]; interaction: string | null; management: string | null;
  routeAssumed: boolean; ddinterA: string; ddinterB: string; interactionId: string | null; source: string; pairReview: PublicPairReview };
export type NotCheckedReason = "no_data" | "not_run" | "no_route" | "unmapped" | "same_product";
export type CheckResult = {
  summary: { medicines: number; totalPairs: number; checkedPairs: number; alertPairs: number; noInteractionPairs: number;
    notCheckedPairs: number; notReviewed: number; bySeverity: { major: number; moderate: number; minor: number; unknown: number } };
  products: { conceptId: string; tradeName: string; route: string | null;
    substances: { bdsId: string | null; name: string; coverage: Coverage; ddinter: ChosenEntry[] }[] }[];
  alerts: CheckAlert[];
  noInteraction: { a: Side; b: Side; ddinterA: string; ddinterB: string }[];
  notChecked: { a: Side; b: Side; reason: NotCheckedReason; side: "a" | "b" }[];
  duplicates: { bdsId: string; name: string; conceptIds: string[] }[];
  noData: { conceptId: string; bdsId: string | null; name: string }[];
  notReviewed: { conceptId: string; tradeName: string }[];
};
```

- [ ] **Step 4: Write the readers**

In `web/lib/api.ts`, add (after `getStats`):

```ts
import type { CheckResult as PublicCheckResult, ClinicalDrugView, ProductInteractions, ProductStub, PublicProduct, PublicSubstance,
  SearchResult as PublicSearchResult, SeverityFilter, SubstanceInteractions, SubstanceStub, SuggestRow } from "./public-types";

// ---- Public reads (§7.4). scope=public always (§2.2), never the token. ----

export type Read<T> = { ok: true; data: T } | { ok: false; status: number };

async function publicRead<T>(path: string, params: URLSearchParams = new URLSearchParams()): Promise<Read<T>> {
  params.set("scope", "public");
  let res: Response;
  try {
    res = await read(`${base()}${path}?${params}`);
  } catch {
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.json().catch(() => null);
  if (!body || body.data === undefined || body.data === null) return { ok: false, status: 502 };
  return { ok: true, data: body.data as T };
}

/** A §7.4 stub (product or substance): it carries hidden: true and nothing else of the record. */
export function isStub(x: unknown): x is ProductStub | SubstanceStub {
  return isHidden(x);
}

export const searchMedicines = (q: string, page: number) =>
  publicRead<PublicSearchResult>("/v1/search", new URLSearchParams({ q, page: String(page) }));
export const getPublicProduct = (id: string) => publicRead<PublicProduct | ProductStub>(`/v1/products/${enc(id)}`);
export const getProductInteractions = (id: string, page: number) =>
  publicRead<ProductInteractions | ProductStub>(`/v1/products/${enc(id)}/interactions`, new URLSearchParams({ page: String(page) }));
export const getClinicalDrug = (bdcId: string) => publicRead<ClinicalDrugView>(`/v1/clinical-drugs/${enc(bdcId)}`);
export const getPublicSubstance = (bdsId: string) => publicRead<PublicSubstance | SubstanceStub>(`/v1/substances/${enc(bdsId)}`);
export function getSubstanceInteractions(bdsId: string, severity: SeverityFilter | null, page: number) {
  const params = new URLSearchParams();
  if (severity) params.set("severity", severity);
  params.set("page", String(page));
  return publicRead<SubstanceInteractions | SubstanceStub>(`/v1/substances/${enc(bdsId)}/interactions`, params);
}
export function suggestProducts(q: string, exclude: string[]) {
  const params = new URLSearchParams({ q });
  for (const id of exclude) params.append("exclude", id);
  return publicRead<SuggestRow[]>("/v1/products/suggest", params);
}

export type CheckRead = { ok: true; data: PublicCheckResult } | { ok: false; status: number; unknownId: string | null };
const CHECK_LISTS = ["products", "alerts", "noInteraction", "notChecked", "duplicates", "noData", "notReviewed"] as const;
const NOT_FOUND = /^Product not found: (.+)$/;

/** POST /v1/interactions/check (§7.4). A 404 names the unknown id (the API's own message), so the page drops it (§6.7.3). */
export async function checkPublic(ids: string[]): Promise<CheckRead> {
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/interactions/check?scope=public`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptIds: ids }),
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 0, unknownId: null };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const m = res.status === 404 ? NOT_FOUND.exec(String(body?.errors?.[0]?.message ?? "")) : null;
    return { ok: false, status: res.status, unknownId: m && ids.includes(m[1]) ? m[1] : null };
  }
  const d = body?.data;
  if (!d || typeof d.summary !== "object" || !CHECK_LISTS.every((k) => Array.isArray(d[k]))) return { ok: false, status: 502, unknownId: null };
  return { ok: true, data: d as PublicCheckResult };
}

/** §6.9 (D17): a partner access request is a flag on (other, partner-access); the API writes the partner_request audit row. */
export async function requestPartnerAccess(message: string, reporterEmail: string, requestId: string): Promise<WriteResult<unknown>> {
  return write<unknown>("/v1/flags", { targetType: "other", targetId: "partner-access", message, reporterEmail, requestId });
}
```

Move the `enc` declaration (`const enc = encodeURIComponent;`) above `publicRead` if it is declared later in the file, and change `export type FlagTarget = "product" | "substance" | "check";` to `export type FlagTarget = "product" | "substance" | "check" | "other";`.

- [ ] **Step 5: Run the test**

Run: `cd web && npx vitest run tests/public-api.test.ts tests/api.test.ts tests/api-scope.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/lib/public-types.ts web/lib/api.ts web/tests/public-api.test.ts
git commit -m "feat(web): public API client for the §7.4 endpoints, scope=public and no token (§2.2)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Public request parameters (`lib/public-params.ts`)

**Files:**
- Create: `web/lib/public-params.ts`
- Test: `web/tests/public-params.test.ts`

**Interfaces:**
- Consumes: `firstParam`, `listParam` (`lib/params.ts`).
- Produces:
  - `Q_MIN = 2`, `Q_MAX = 100`, `SEARCH_PAGE_MAX = 9`, `INDEX_MAX = 10_000`, `CHECK_MAX = 20`, `ID_MAX = 200`.
  - `parseQuery(raw): { q: string; problem: "short" | "long" | null }` (first value, trimmed; length in code points).
  - `parseSearchPage(raw): { page: number; capped: boolean }` (digits only, else 0; past 9 reads 9 with `capped`).
  - `parseIndex(raw): number` (digits only, 0–10 000, else 0) for `?ix=` and the substance page's `?page=`.
  - `parseSeverity(raw): SeverityFilter | null`.
  - `parseCheckIds(sp: { ids?, add?, remove?, clear? }): { ids: string[]; changed: boolean }` (trims, drops blanks and ids over 200 characters, de-duplicates, applies `clear`, `remove` and `add`, keeps the first 20; `changed` when the canonical list differs from the URL's or an action was submitted).
  - `checkHref(ids: string[]): string` (`/check` or `/check?ids=…&ids=…`).

- [ ] **Step 1: Write the failing test**

`web/tests/public-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkHref, parseCheckIds, parseIndex, parseQuery, parseSearchPage, parseSeverity } from "@/lib/public-params";

describe("search query (§6.3 validation)", () => {
  it("trims, measures in characters, and names the problem", () => {
    expect(parseQuery("  napa ")).toEqual({ q: "napa", problem: null });
    expect(parseQuery("a")).toEqual({ q: "a", problem: "short" });
    expect(parseQuery(undefined)).toEqual({ q: "", problem: "short" });
    expect(parseQuery("x".repeat(101))).toEqual({ q: "x".repeat(101), problem: "long" });
    expect(parseQuery("প".repeat(100)).problem).toBeNull();
    expect(parseQuery(["first", "second"]).q).toBe("first");
  });
});

// Review Focus 2 and 5
describe("search page index, ix, page and severity", () => {
  it("reads digits only; anything else is the first page", () => {
    for (const raw of [undefined, "", "-1", "abc", "1.5", "1e3", " 2", "0x10"]) expect(parseSearchPage(raw)).toEqual({ page: 0, capped: false });
    expect(parseSearchPage("3")).toEqual({ page: 3, capped: false });
    expect(parseSearchPage("9")).toEqual({ page: 9, capped: false });
    expect(parseSearchPage("10")).toEqual({ page: 9, capped: true });
    expect(parseSearchPage("99999999999999999999")).toEqual({ page: 9, capped: true });
  });
  it("ix and the substance page index clamp to 0–10000", () => {
    expect([parseIndex("-1"), parseIndex("abc"), parseIndex("4"), parseIndex("99999"), parseIndex(["2", "3"])]).toEqual([0, 0, 4, 10_000, 2]);
  });
  it("severity is one of the four, else no filter", () => {
    expect([parseSeverity("major"), parseSeverity("unknown"), parseSeverity("fatal"), parseSeverity("MAJOR"), parseSeverity(undefined)])
      .toEqual(["major", "unknown", null, null, null]);
  });
});

// Review Focus 3
describe("checker ids (§6.7.1, §4.4 no-JS actions)", () => {
  it("de-duplicates, drops blanks and overlong ids, keeps the first 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => `P-${i}`);
    expect(parseCheckIds({ ids: [" A ", "A", "", "B", "x".repeat(201)] })).toEqual({ ids: ["A", "B"], changed: true });
    expect(parseCheckIds({ ids: many }).ids).toEqual(many.slice(0, 20));
    expect(parseCheckIds({ ids: ["A", "B"] })).toEqual({ ids: ["A", "B"], changed: false });
  });
  it("applies clear, remove and add, in that order", () => {
    expect(parseCheckIds({ ids: ["A", "B"], remove: "A" })).toEqual({ ids: ["B"], changed: true });
    expect(parseCheckIds({ ids: ["A"], add: "C" })).toEqual({ ids: ["A", "C"], changed: true });
    expect(parseCheckIds({ ids: ["A"], add: "A" })).toEqual({ ids: ["A"], changed: true });
    expect(parseCheckIds({ ids: ["A", "B"], clear: "1", add: "C" })).toEqual({ ids: ["C"], changed: true });
    const twenty = Array.from({ length: 20 }, (_, i) => `P-${i}`);
    expect(parseCheckIds({ ids: twenty, add: "Z" }).ids).toEqual(twenty);
  });
  it("builds the canonical href", () => {
    expect(checkHref([])).toBe("/check");
    expect(checkHref(["a b", "c&d"])).toBe("/check?ids=a+b&ids=c%26d");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/public-params.test.ts`
Expected: FAIL (`Cannot find module '@/lib/public-params'`).

- [ ] **Step 3: Write the module**

```ts
import { firstParam, listParam } from "./params";
import type { SeverityFilter } from "./public-types";

/** Request parameters of the public pages, read defensively: a bad value is the default, never an API 400 (Review Focus 2, 3, 5). Pure. */
export const Q_MIN = 2, Q_MAX = 100, SEARCH_PAGE_MAX = 9, INDEX_MAX = 10_000, CHECK_MAX = 20, ID_MAX = 200;
type Raw = string | string[] | undefined;
const chars = (s: string) => [...s].length;
const DIGITS = /^[0-9]+$/;

export function parseQuery(raw: Raw): { q: string; problem: "short" | "long" | null } {
  const q = firstParam(raw).trim();
  const n = chars(q);
  return { q, problem: n < Q_MIN ? "short" : n > Q_MAX ? "long" : null };
}

function digits(raw: Raw): number | null {
  const v = firstParam(raw);
  if (!DIGITS.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** §6.3: every session can open at most page index 9; past it the page reads 9 and shows the cap line. */
export function parseSearchPage(raw: Raw): { page: number; capped: boolean } {
  const n = digits(raw);
  if (n === null) return { page: 0, capped: false };
  return n > SEARCH_PAGE_MAX ? { page: SEARCH_PAGE_MAX, capped: true } : { page: n, capped: false };
}

export function parseIndex(raw: Raw): number {
  const n = digits(raw);
  return n === null ? 0 : Math.min(n, INDEX_MAX);
}

const SEVERITIES: readonly SeverityFilter[] = ["major", "moderate", "minor", "unknown"];
export function parseSeverity(raw: Raw): SeverityFilter | null {
  const v = firstParam(raw);
  return (SEVERITIES as readonly string[]).includes(v) ? (v as SeverityFilter) : null;
}

/** The checker's selection: the URL's ids, then the no-JavaScript actions (clear, remove, add). The URL is the only store (§6.7.1). */
export function parseCheckIds(sp: { ids?: Raw; add?: Raw; remove?: Raw; clear?: Raw }): { ids: string[]; changed: boolean } {
  const raw = Array.isArray(sp.ids) ? sp.ids : sp.ids === undefined ? [] : [sp.ids];
  let ids = listParam(sp.ids).filter((id) => id.length <= ID_MAX);
  const clear = firstParam(sp.clear) !== "", remove = firstParam(sp.remove).trim(), add = firstParam(sp.add).trim();
  if (clear) ids = [];
  if (remove) ids = ids.filter((id) => id !== remove);
  if (add && add.length <= ID_MAX && !ids.includes(add) && ids.length < CHECK_MAX) ids.push(add);
  ids = ids.slice(0, CHECK_MAX);
  const changed = clear || remove !== "" || add !== "" || raw.length !== ids.length || raw.some((id, i) => id !== ids[i]);
  return { ids, changed };
}

export function checkHref(ids: string[]): string {
  return ids.length ? `/check?${new URLSearchParams(ids.map((id) => ["ids", id]))}` : "/check";
}
```

- [ ] **Step 4: Run the test**

Run: `cd web && npx vitest run tests/public-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/public-params.ts web/tests/public-params.test.ts
git commit -m "feat(web): defensive public parameters: query, page caps, ix, severity, checker ids (Review Focus 2, 3, 5)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Site chrome (§6.1 navigation, search bar, narrow menu, footer) and the `/?q=` redirect

**Files:**
- Modify: `web/components/Header.tsx`, `web/components/Header.module.css`
- Modify: `web/components/Footer.tsx`, `web/components/Footer.module.css`
- Modify: `web/app/layout.tsx`, `web/app/layout.module.css`
- Modify: `web/lib/security-headers.ts` (`x-search`), `web/lib/surface.ts` (`/?q=` redirect), `web/lib/request-log.ts` (`/partners`, `/privacy`)
- Modify: `web/tests/marks.test.ts` (`MATERIAL_ALLOWED` gains the public bar)
- Test: `web/tests/header.test.tsx`, `web/tests/footer.test.tsx` (new), `web/tests/surface.test.ts`, `web/tests/request-log.test.ts`

**Interfaces:**
- Consumes: Task 16 `NAV`, `FOOTER`; `FOOTER_LINE`; `Wordmark`, `ThemeSwitch`, `AccountMenu`, `buttonClass`; P1C's `Header.tsx` as it is on `main`: its `isReviewer(session)` gate (§5.13: "Every role gate learns `senior` … none may keep its own role list"), its `ROLE_LABEL` badge ("Senior pharmacist" for a senior) and its seniors-only "Senior review" item to `/review/pairs` (§6.2). This task does not reprint or change the account menu.
- Produces:
  - `Header({ session, theme, batchId, path, q })`: `path` is the request path (from `x-pathname`), `q` the search query on `/search` (from `x-search`). On `/search`, `/products/*`, `/substances/*` and `/check` the bar is the sticky `.material` search bar (`role="search"` GET form to `/search`, placeholder "Brand, substance or DAR number"); elsewhere the plain bar. The current section's link carries `aria-current="page"`. Below 720 px the links fold into a `<details>` "Menu" and "Sign in" becomes plain sm.
  - `navCurrent(path): "medicines" | "checker" | "learn" | "partners" | null`, `hasSearchBar(path): boolean` (exported from `Header.tsx`).
  - `legacyRedirect(url)` also answers `/?q=X&page=N` with `/search?q=X&page=N` (§2.3, 308 through the middleware).
  - Request headers: `x-search` = the request's query string (read by the layout, never logged).

- [ ] **Step 1: Write the failing tests**

Replace the `describe("Header", …)` block of `web/tests/header.test.tsx` with:

```tsx
describe("Header (§6.1)", () => {
  it("anonymous: wordmark home, the four sections, a tonal and a plain Sign in (narrow), no account menu", () => {
    const html = renderToStaticMarkup(<Header session={null} theme="system" path="/" />);
    expect(html).toMatch(/<a class="home" href="\/"><span class="wordmark s20"/);
    for (const [href, label] of [["/search", "Medicines"], ["/check", "Interaction checker"], ["/learn", "Learn"], ["/partners", "For partners"]])
      expect(html).toContain(`href="${href}">${label}</a>`);
    expect(html).toContain('<nav aria-label="Main"');
    expect(html.match(/<nav /g)).toHaveLength(1);
    expect(html).toContain('<span class="sr-only">Menu</span>');
    expect(html).toContain('<a class="btn btn--tonal btn--sm signInWide" href="/signin">Sign in</a>');
    expect(html).toContain('<a class="btn btn--plain btn--sm signInNarrow" href="/signin">Sign in</a>');
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain("aria-current");
  });

  it("marks the current section and shows the material search bar on search, product, substance and checker pages", () => {
    for (const [path, label] of [["/search", "Medicines"], ["/products/x", "Medicines"], ["/substances/BDS-1", "Medicines"],
      ["/check", "Interaction checker"]]) {
      const html = renderToStaticMarkup(<Header session={null} theme="system" path={path} q="napa" />);
      expect(html, path).toContain(`aria-current="page">${label}</a>`);
      expect(html, path).toContain('class="bar material');
      expect(html, path).toContain('<form role="search" method="get" action="/search"');
      expect(html, path).toContain('placeholder="Brand, substance or DAR number"');
    }
    expect(renderToStaticMarkup(<Header session={null} theme="system" path="/search" q="napa" />)).toContain('value="napa"');
    expect(renderToStaticMarkup(<Header session={null} theme="system" path="/learn/start" />)).toContain('aria-current="page">Learn</a>');
    expect(renderToStaticMarkup(<Header session={null} theme="system" path="/partners" />)).toContain('aria-current="page">For partners</a>');
  });

  it("signed in: a <details> account menu with own name and email, role badge, theme control and sign-out form", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="dark" path="/" />);
    expect(html).toContain('<details class="menu">');
    expect(html).toContain('<span aria-hidden="true">FI</span><span class="sr-only">Account menu for Farhana Islam</span>');
    expect(html.match(/pharm@example\.org/g)).toHaveLength(1);
    expect(html).toContain('<span class="role-badge">Pharmacist</span>');
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(html).not.toContain('href="/signin"');
  });

  it("a reader gets no role badge and no reviewer links", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "someone@gmail.com", role: "user" }} theme="system" path="/" />);
    expect(html).not.toContain("role-badge");
    expect(html).not.toContain('href="/review');
  });

  it("a reviewer's menu names the newest batch in review next to the role badge", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="system" batchId="0001-pilot" path="/" />);
    expect(html).toContain('<span class="role-badge">Pharmacist</span> Batch <span class="mono">0001-pilot</span>');
  });

  it("a senior pharmacist keeps P1C's menu: the Senior pharmacist badge and Senior review (§6.2, §5.13); a pharmacist has no such link", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "senior@example.org", name: "Sabina Rahman", role: "senior" }} theme="system" path="/" />);
    expect(html).toContain('<span class="role-badge">Senior pharmacist</span>');
    expect(html).toMatch(/<a [^>]*href="\/review\/pairs"[^>]*>Senior review<\/a>/);
    expect(html).toContain('<a href="/review">Review desk</a>');
    expect(renderToStaticMarkup(<Header session={PHARMACIST} theme="system" path="/" />)).not.toContain('href="/review/pairs"');
    expect(renderToStaticMarkup(<Header session={{ email: "eng@example.org", role: "engineer" }} theme="system" path="/" />))
      .not.toContain('href="/review/pairs"');
  });
});
```

`web/tests/footer.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
import Footer from "@/components/Footer";

describe("Footer (§6.1)", () => {
  const html = renderToStaticMarkup(<Footer theme="system" />);
  it("has the line, the five links, the sources with their open licence markers, the legal line and the theme control", () => {
    expect(html).toContain("A drug knowledge base for Bangladesh. Decision support, not a substitute for clinical judgement.");
    for (const [href, label] of [["/search", "Medicines"], ["/check", "Interaction checker"], ["/learn", "Learn"], ["/partners", "For partners"], ["/privacy", "Privacy"]])
      expect(html).toContain(`<a href="${href}">${label}</a>`);
    expect(html).toContain("<b>RxNav and RxNorm</b>. This product uses publicly available data from the U.S. National Library of Medicine (NLM). NLM is not responsible for the product and does not endorse it.");
    expect(html).toContain('<span class="example">Licence line to confirm</span>');
    expect(html).toContain('<span class="example">Licence lines to confirm</span>');
    expect(html).toContain("<span>drugdb.eliooo.org</span><span>Severity levels and management text are DDInter 2.0&#x27;s, shown truncated, never rewritten.</span>");
    expect(html).toContain('aria-label="Colour theme"');
  });
});
```

In `web/tests/surface.test.ts`, add to the redirect table:

```ts
    ["/?q=napa", "/search?q=napa"],
    ["/?q=napa&page=2", "/search?q=napa&page=2"],
    ["/?q=a%20b&page=1&utm=x", "/search?q=a+b&page=1"],
```

In `web/tests/request-log.test.ts`, add `expect(routeTemplate("/partners")).toBe("/partners"); expect(routeTemplate("/privacy")).toBe("/privacy");` to its static-routes case.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/header.test.tsx tests/footer.test.tsx tests/surface.test.ts tests/request-log.test.ts`
Expected: FAIL (no `href="/search">Medicines</a>`, no `/?q=` redirect, `/partners` is `[unmatched]`).

- [ ] **Step 3: The header**

`web/components/Header.tsx`: three edits. **The `session ? (<AccountMenu>…</AccountMenu>)` branch is P1C's and is neither reprinted nor changed**: it already decides reviewer items with `isReviewer(session)` from `lib/reviewers.ts` (never a role list of its own, §5.13), shows `ROLE_LABEL[session.role]` and the seniors-only "Senior review" item (§6.2), and the Step 1 tests pin all three. Check first that P1C's gate is there: `grep -n "isReviewer(" web/components/Header.tsx` prints a line.

1. Keep every existing import and the `initials` helper. Add the import `import { NAV } from "@/lib/public-copy";`, and add after `initials`:

```tsx
type Section = "medicines" | "checker" | "learn" | "partners";
const LINKS: [Section, string, string][] = [
  ["medicines", "/search", NAV.medicines], ["checker", "/check", NAV.checker], ["learn", "/learn", NAV.learn], ["partners", "/partners", NAV.partners],
];
const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/** The section a path belongs to, for aria-current (§6.1). */
export function navCurrent(path: string): Section | null {
  if (under(path, "/search") || under(path, "/products") || under(path, "/substances")) return "medicines";
  if (under(path, "/check")) return "checker";
  if (under(path, "/learn")) return "learn";
  if (under(path, "/partners")) return "partners";
  return null;
}

/** §6.1: "On search, product and checker pages the bar is `.material` and holds the search field." */
export function hasSearchBar(path: string): boolean {
  return navCurrent(path) === "medicines" || navCurrent(path) === "checker";
}

function Links({ current }: { current: Section | null }) {
  return (
    <ul className={styles.links}>
      {LINKS.map(([key, href, label]) => (
        <li key={key}><a href={href} aria-current={current === key ? "page" : undefined}>{label}</a></li>
      ))}
    </ul>
  );
}
```

2. The component's signature gains `path` and `q`; its first two body lines (`reviewer` from `isReviewer(session)`, P1C's §5.13 gate, and `displayName`) stay as they are, and two lines are added after them; then the `<header>` opening, the wordmark link and the `<nav>` element (everything from `<header className={styles.bar}>` through `</nav>`) are replaced. The doc comment's last sentence becomes "One <nav aria-label="Main">: the wide link row and the narrow "Menu" <details> are both inside it, and CSS shows one of them (display: none removes the other from the accessibility tree)."

```tsx
export default function Header({ session, theme, batchId = null, path = "/", q = "" }:
    { session: Session | null; theme: Theme; batchId?: string | null; path?: string; q?: string }) {
  const reviewer = isReviewer(session);
  const displayName = session ? (session.name ?? "").trim() || session.email : "";
  const current = navCurrent(path);
  const searchBar = hasSearchBar(path);
  return (
    <header className={searchBar ? `bar material ${styles.bar} ${styles.sticky}` : `bar ${styles.bar}`}>
      <a className={styles.home} href="/"><Wordmark size={searchBar ? 19 : 20} /></a>
      {searchBar && (
        <form role="search" method="get" action="/search" className={styles.searchForm}>
          <label className="search">
            <span className="sr-only">{NAV.searchLabel}</span>
            <input type="search" name="q" defaultValue={q} placeholder={NAV.searchPlaceholder} minLength={2} maxLength={100} />
          </label>
        </form>
      )}
      <nav aria-label={NAV.label} className={styles.nav}>
        <div className={styles.wide}><Links current={current} /></div>
        <details className={styles.narrowMenu}>
          <summary className={buttonClass("tonal", "sm") + " btn--icon"}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            </svg>
            <span className="sr-only">{NAV.menu}</span>
          </summary>
          <div className={styles.menuPanel}><Links current={current} /></div>
        </details>
      </nav>
```

3. In the signed-out branch, replace `<a className={buttonClass("tonal", "sm")} href="/signin">Sign in</a>` with:

```tsx
          <>
            <a className={`${buttonClass("tonal", "sm")} signInWide`} href="/signin">{NAV.signIn}</a>
            <a className={`${buttonClass("plain", "sm")} signInNarrow`} href="/signin">{NAV.signIn}</a>
          </>
```

The two sign-in links use global class names (`signInWide`, `signInNarrow`) styled in the module with `:global(...)`, so the test sees the exact class list.

`web/components/Header.module.css` (whole file; Board P `.s-nav`, `.s-bar`, `.s-nav-links` values):

```css
/* Board P .s-nav (plain bar) and .s-bar (material search bar), ported with the same values. */
.bar { display: flex; align-items: center; gap: 28px; padding: 16px 56px; border-bottom: 1px solid var(--line); background: var(--canvas); }
.sticky { position: sticky; top: 0; z-index: 30; gap: 22px; min-height: 60px; padding: 0 32px; }
@media (max-height: 480px) { .sticky { position: static; } }
.home { color: var(--fg); text-decoration: none; min-height: 24px; display: inline-flex; align-items: center; }
.searchForm { flex: 0 1 320px; min-width: 0; }
.searchForm :global(.search) { height: 36px; }
.nav { display: flex; align-items: center; }
.links { display: flex; gap: 2px; }
.links a { display: inline-flex; align-items: center; min-height: 34px; padding: 0 10px; border-radius: 8px; color: var(--fg-2); text-decoration: none; font: 500 14px/1 var(--font-ui); }
.links a:hover { background: var(--surface-2); color: var(--fg); }
.links a[aria-current="page"] { color: var(--fg); font-weight: 600; }
.narrowMenu { display: none; position: relative; }
.narrowMenu > summary { list-style: none; }
.narrowMenu > summary::-webkit-details-marker { display: none; }
.menuPanel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 20; min-width: 220px; padding: 6px; border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-2); }
.menuPanel .links { flex-direction: column; }
.end { margin-left: auto; display: flex; gap: 10px; align-items: center; }
.end :global(.signInNarrow) { display: none; }
.avatar { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font: 600 13px/1 var(--font-ui); }
.panel { position: absolute; right: 0; top: calc(100% + var(--s2)); z-index: 20; min-width: 260px; display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3); padding: var(--s4); border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-2); }
.who { display: flex; flex-direction: column; gap: 2px; }
.who span { color: var(--fg-2); font-size: 13px; overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .bar { padding: 14px 16px; gap: 10px; flex-wrap: wrap; }
  .sticky { padding: 8px 16px; }
  .searchForm { order: 3; flex: 1 1 100%; }
  .wide { display: none; }
  .narrowMenu { display: block; }
  .nav { margin-left: auto; order: 2; }
  .end { margin-left: 0; order: 2; }
  .end :global(.signInWide) { display: none; }
  .end :global(.signInNarrow) { display: inline-flex; }
}
```

- [ ] **Step 4: The footer**

`web/components/Footer.tsx`:

```tsx
import ThemeSwitch from "@/components/ThemeSwitch";
import Wordmark from "@/components/ui/Wordmark";
import { FOOTER_LINE } from "@/lib/copy";
import { FOOTER, NAV } from "@/lib/public-copy";
import type { Theme } from "@/lib/theme";
import styles from "./Footer.module.css";

/**
 * Footer (§6.1). The two "to confirm" markers are §13.1 Q1 (licence lines) and block the public launch until resolved;
 * they use Board P's .example marker class, never the Example word.
 */
export default function Footer({ theme }: { theme: Theme }) {
  return (
    <footer className={styles.footer}>
      <div>
        <Wordmark size={19} />
        <p className={styles.line}>{FOOTER_LINE}</p>
      </div>
      <div>
        <h2 className={styles.h}>{FOOTER.linksHeading}</h2>
        <ul className={styles.list}>
          <li><a href="/search">{NAV.medicines}</a></li><li><a href="/check">{NAV.checker}</a></li>
          <li><a href="/learn">{NAV.learn}</a></li><li><a href="/partners">{NAV.partners}</a></li>
          <li><a href="/privacy">{NAV.privacy}</a></li>
        </ul>
      </div>
      <div>
        <h2 className={styles.h}>{FOOTER.sourcesHeading}</h2>
        <ul className={styles.list}>
          {FOOTER.sources.map((s) => (
            <li key={s.name}><b>{s.name}</b>{s.text}{s.confirm && <> <span className="example">{s.confirm}</span></>}</li>
          ))}
        </ul>
      </div>
      <div className={styles.legal}><span>{FOOTER.host}</span><span>{FOOTER.legal}</span></div>
      <div className={styles.theme}><ThemeSwitch value={theme} /></div>
    </footer>
  );
}
```

`web/components/Footer.module.css`:

```css
/* Board P .s-foot */
.footer { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, .7fr) minmax(0, 1.8fr); gap: 40px; padding: 48px 56px 36px; border-top: 1px solid var(--line); background: var(--surface-2); font-size: 13px; color: var(--fg-2); }
.line { margin-top: 12px; max-width: 30ch; }
.h { font: 600 13px/1.3 var(--font-ui); color: var(--fg); margin-bottom: 10px; }
.list { display: flex; flex-direction: column; gap: 8px; }
.list b { color: var(--fg); font-weight: 600; }
.list a { color: var(--fg-2); }
.legal { grid-column: 1 / -1; padding-top: 18px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.theme { grid-column: 1 / -1; }
@media (max-width: 860px) { .footer { grid-template-columns: 1fr; padding: 32px 16px; gap: 24px; } }
```

- [ ] **Step 5: Layout, request headers, the redirect and the log templates**

`web/lib/security-headers.ts`: after `headers.set("x-pathname", request.nextUrl.pathname);` add

```ts
  // The public header's search field shows the query on /search (§6.1). Read by the root layout; never logged.
  headers.set("x-search", request.nextUrl.search);
```

`web/app/layout.tsx`: read both headers and pass them on; the sticky bar sets the scroll padding on `<html>` (§6.1, WCAG 2.4.11):

```tsx
  const h = await headers();
  const path = h.get("x-pathname") ?? "";
  const q = path === "/search" ? new URLSearchParams(h.get("x-search") ?? "").get("q") ?? "" : "";
  const ownShell = isReviewSurface(path) || isLearnSurface(path);
  …
    <html lang="en" data-theme={htmlThemeAttr(theme)} className={!ownShell && hasSearchBar(path) ? styles.stickyBar : undefined}>
  …
            <Header session={session} theme={theme} batchId={batchId} path={path} q={q} />
```

(import `hasSearchBar` from `@/components/Header`). Add to `web/app/layout.module.css`:

```css
/* §6.1: the sticky material bar is 60 px high; a focused element is never hidden under it (WCAG 2.4.11). */
.stickyBar { --public-bar-h: 60px; scroll-padding-top: calc(var(--public-bar-h) + 8px); }
@media (max-width: 720px) { .stickyBar { --public-bar-h: 108px; } }
@media (max-height: 480px) { .stickyBar { scroll-padding-top: 0; } }
```

`.main` drops its `max-width: 1040px` (public pages set their own widths from Board P), keeping `margin: 0 auto` and the padding.

`web/lib/surface.ts`: at the top of `legacyRedirect`:

```ts
  // §2.3: /?q=X&page=N → /search?q=X&page=N (308); only q and page are carried.
  if (path === "/" && url.searchParams.has("q")) {
    const out = new URLSearchParams({ q: url.searchParams.get("q") ?? "" });
    const page = url.searchParams.get("page");
    if (page !== null) out.set("page", page);
    return `/search?${out}`;
  }
```

`web/lib/request-log.ts`: add `"/partners", "/privacy"` to `STATIC_ROUTES`.

`web/tests/marks.test.ts`: add `"components/Header.tsx",   // P2: §6.1 the public search bar is .material (a toolbar)` to `MATERIAL_ALLOWED`.

- [ ] **Step 6: Run the tests**

Run: `cd web && npx vitest run tests/header.test.tsx tests/footer.test.tsx tests/surface.test.ts tests/request-log.test.ts tests/marks.test.ts tests/layout.test.tsx tests/middleware.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/components/Header.tsx web/components/Header.module.css web/components/Footer.tsx web/components/Footer.module.css \
  web/app/layout.tsx web/app/layout.module.css web/lib/security-headers.ts web/lib/surface.ts web/lib/request-log.ts \
  web/tests/header.test.tsx web/tests/footer.test.tsx web/tests/surface.test.ts web/tests/request-log.test.ts web/tests/marks.test.ts
git commit -m "feat(web): §6.1 navigation, material search bar, narrow menu, footer; /?q= redirects to /search (§2.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: The landing page (`/`, §6.1)

**Files:**
- Rewrite: `web/app/page.tsx`
- Create: `web/components/public/Landing.tsx`, `web/components/public/landing.module.css`
- Create: `web/content/site.ts`, `web/content/check-scenarios.ts`
- Test: `web/tests/home-page.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `getStats()` (P3), `checkPublic(ids)` (Task 17), `LANDING`, `PUBLIC_NEW.hero.statBatches`, `PUBLIC_BOARD.unknownPromise`, `ReviewStatus`, `Severity`, `NoDataBlock`, `StageCheck` words, `Button`/`buttonClass`, `formatCount` (P3 `lib/stats.ts`); Task 21's `HeroCard` and `loadHero` (this task renders a slot that Task 21 fills: `hero` prop).
- Produces:
  - `content/site.ts`: `REGISTER_PRODUCTS = 39196`, `REGISTER_SOURCE_DATE = "27/03/2026"`.
  - `content/check-scenarios.ts`: `type Scenario = { label: string; ids: string[] }`; `SCENARIOS: Scenario[]` (Board P's four, in order); `PARTNER_SAMPLE = SCENARIOS[0]`.
  - `Landing({ stats, hero, sample })` (server component): `stats: SiteStats | null`, `hero: ReactNode`, `sample: { ids: string[]; result: CheckResult | null }`.

The landing reads three things in parallel, and each failure only leaves its own part out: no stats → no pilot line and no live stat; no hero → no card (Task 21); no check → no response figure. The partner code sample shows the real request and the real public response (§6.1: "until §7 ships, then shows the real response"), so it carries no Example marker and no "Field names illustrative".

- [ ] **Step 1: Write the failing test**

`web/tests/home-page.test.tsx` (whole file):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pilotStats } from "./fixtures/learn-stats";

const getStats = vi.fn(), checkPublic = vi.fn(), getPublicProduct = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getStats: () => getStats(), checkPublic: (ids: string[]) => checkPublic(ids), getPublicProduct: (id: string) => getPublicProduct(id),
}));
import Home from "@/app/page";
import { SCENARIOS } from "@/content/check-scenarios";

const render = async () => renderToStaticMarkup(await Home());
const none = { summary: { medicines: 3, totalPairs: 0, checkedPairs: 0, alertPairs: 0, noInteractionPairs: 0, notCheckedPairs: 0,
  notReviewed: 3, bySeverity: { major: 0, moderate: 0, minor: 0, unknown: 0 } }, products: [], alerts: [], noInteraction: [],
  notChecked: [], duplicates: [], noData: [], notReviewed: SCENARIOS[0].ids.map((id) => ({ conceptId: id, tradeName: id })) };

beforeEach(() => {
  getStats.mockReset(); getStats.mockResolvedValue(pilotStats());
  checkPublic.mockReset(); checkPublic.mockResolvedValue({ ok: true, data: none });
  getPublicProduct.mockReset(); getPublicProduct.mockResolvedValue({ ok: false, status: 404 });
  vi.stubEnv("HERO_CONCEPT_ID", "");
});

describe("landing (§6.1, Board P section 1)", () => {
  it("hero copy, CTAs and fine print, verbatim", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<h1");
    expect(html).toContain("Bangladesh&#x27;s medicines, traced from brand to substance and checked by a pharmacist.");
    expect(html).toContain('href="/check">Check interactions</a>');
    expect(html).toContain('href="/search">Search medicines</a>');
    expect(html).toContain("Free to search. Continue with Google to sign in or create an account.");
  });

  it("the pilot line and the live stat come from /v1/stats, and both leave when nothing is in review", async () => {
    expect(await render()).toContain("Pilot: 10 medicines being reviewed by pharmacists");
    expect(await render()).toContain("medicines in pilot batch <span class=\"mono\">0001-pilot</span>, under pharmacist review now");
    getStats.mockResolvedValue({ ...pilotStats(), inReviewProducts: 0, batches: [] });
    const quiet = await render();
    expect(quiet).not.toContain("Pilot:");
    expect(quiet).not.toContain("under pharmacist review now");
    expect(quiet).toContain("39,196");
  });

  it("names the batch count when more than one batch is in review", async () => {
    const s = pilotStats();
    getStats.mockResolvedValue({ ...s, batches: [...s.batches, { ...s.batches[0], batchId: "0002-next" }] });
    expect(await render()).toContain("medicines in 2 batches, under pharmacist review now");
  });

  it("a failed stats read leaves the page standing without the live parts", async () => {
    getStats.mockRejectedValue(new Error("down"));
    const html = await render();
    expect(html).toContain("One record, three kinds of work");
    expect(html).not.toContain("Pilot:");
  });

  it("the bands are Board P's, and the promises use the safety constants", async () => {
    const html = await render();
    for (const t of ["One record, three kinds of work", "How a record becomes trustworthy", "Three promises",
      "For partners: the same records, by API", "Unknown severity is never called low risk"]) expect(html).toContain(t);
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).toContain('href="/partners">Request partner access</a>');
    expect(html).toContain("Sign in first. Access is granted by the IntelliDrugs team.");
  });

  it("the partner sample shows the real request and public response, with no Example marker", async () => {
    const html = await render();
    expect(checkPublic).toHaveBeenCalledWith(SCENARIOS[0].ids);
    expect(html).toContain("POST /v1/interactions/check");
    expect(html).toContain("&quot;notReviewed&quot;");
    expect(html).toContain("Public response today. None of the three is approved by a pharmacist");
    expect(html).not.toContain("Field names illustrative");
    expect(html).not.toContain('class="example"');
  });

  it("the none-approved sentence leaves once one of the three is checked, and a failed check leaves the figure out", async () => {
    checkPublic.mockResolvedValue({ ok: true, data: { ...none, notReviewed: none.notReviewed.slice(1) } });
    const one = await render();
    expect(one).toContain("Public response today.");
    expect(one).not.toContain("None of the three is approved");
    checkPublic.mockResolvedValue({ ok: false, status: 503, unknownId: null });
    expect(await render()).not.toContain("Public response today.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/home-page.test.tsx`
Expected: FAIL (`Cannot find module '@/content/check-scenarios'`).

- [ ] **Step 3: Content modules**

`web/content/site.ts`:

```ts
/** §6.1 stats band: the official DGDA register size, static, with its source date. */
export const REGISTER_PRODUCTS = 39196;
export const REGISTER_SOURCE_DATE = "27/03/2026";
```

`web/content/check-scenarios.ts`:

```ts
/** §6.7.1 "Start from a scenario": Board P's four pilot scenarios. A scenario renders only when all of its products exist. */
export type Scenario = { label: string; ids: string[] };
export const SCENARIOS: Scenario[] = [
  { label: "G Warfarin + Aspirin + Domperidone", ids: ["185-0138-012--g-warfarin", "076-0028-006--aspirin", "127-0263-018--domperidone"] },
  { label: "Clarith + Simvastatin", ids: ["239-0407-023--clarith", "096-0265-061--simvastatin"] },
  { label: "Simvastatin + Amlodipine-5", ids: ["096-0265-061--simvastatin", "071-0098-022--amlodipine-5"] },
  { label: "Napa + G Warfarin", ids: ["186-0030-006--napa", "185-0138-012--g-warfarin"] },
];
/** Board P's partner code sample uses the first scenario's three products. */
export const PARTNER_SAMPLE = SCENARIOS[0];
```

- [ ] **Step 4: The landing component**

`web/components/public/Landing.tsx`:

```tsx
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import NoDataBlock from "@/components/ui/NoDataBlock";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { PUBLIC_BOARD, PUBLIC_NEW, fill } from "@/lib/copy";
import type { CheckResult } from "@/lib/public-types";
import { LANDING } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import { formatCount, type SiteStats } from "@/lib/stats";
import { REGISTER_PRODUCTS } from "@/content/site";
import styles from "./landing.module.css";

const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

/** The live pilot stat (§6.1): one batch in review names it; several give their count; none leaves the stat out. */
function PilotStat({ stats }: { stats: SiteStats }) {
  const inReview = stats.batches.filter((b) => b.status === "in_review");
  if (stats.inReviewProducts === 0 || inReview.length === 0) return null;
  return (
    <div className={styles["s-stat"]}>
      <b>{formatCount(stats.inReviewProducts)}</b>
      <span>{inReview.length === 1
        ? fillNodes(LANDING.statPilot, { id: <Mono>{inReview[0].batchId}</Mono> })
        : fill(PUBLIC_NEW.hero.statBatches, { k: inReview.length })}</span>
    </div>
  );
}

/** The real public response for the sample's ids, in the API envelope (§6.1, §7.4); timestamp and request id elided. */
function responseBody(result: CheckResult): string {
  return JSON.stringify({ success: true, data: result, message: "OK", errors: [], metadata: { timestamp: "…", requestId: "…" } }, null, 2);
}

export default function Landing({ stats, hero, sample }:
    { stats: SiteStats | null; hero: ReactNode; sample: { ids: string[]; result: CheckResult | null } }) {
  const noneApproved = sample.result !== null && sample.result.products.length === 0 && sample.result.notReviewed.length === sample.ids.length;
  return (
    <>
      <section className={styles["s-hero"]} aria-labelledby="landing-h1">
        <div>
          {stats && stats.inReviewProducts > 0 && <p className={styles["s-pilot"]}>{fill(LANDING.pilot, { n: formatCount(stats.inReviewProducts) })}</p>}
          <h1 id="landing-h1" className={styles.h1}>{LANDING.h1}</h1>
          <p className={`${styles["s-lede"]} ${styles.wide}`}>{LANDING.lede}</p>
          <p className={`${styles["s-lede"]} ${styles.narrow}`}>{LANDING.ledeNarrow}</p>
          <div className={styles["s-ctas"]}>
            <a className={buttonClass("primary", "lg")} href="/check">{LANDING.ctaCheck}</a>
            <a className={buttonClass("tonal", "lg")} href="/search">{LANDING.ctaSearch}</a>
          </div>
          <p className={`${styles["s-fine"]} ${styles.wide}`}>{LANDING.fine}</p>
        </div>
        {hero}
      </section>

      <section className={styles["s-stats"]} aria-label={LANDING.statsLabel}>
        <div className={styles["s-stat"]}><b>{formatCount(REGISTER_PRODUCTS)}</b><span>{LANDING.statRegister}</span></div>
        <div className={styles["s-stat"]}><b>{LANDING.statCodesN}</b><span>{LANDING.statCodes}</span></div>
        <div className={styles["s-stat"]}><b>{LANDING.statKindsN}</b><span>{LANDING.statKinds}</span></div>
        {stats && <PilotStat stats={stats} />}
      </section>

      <section className={styles["s-band"]} aria-labelledby="band-aud">
        <h2 id="band-aud" className={styles["s-h2"]}>{LANDING.audHeading}</h2>
        <p className={styles["s-sub"]}>{LANDING.audSub}</p>
        <div className={styles["s-aud"]}>
          {LANDING.audiences.map((a) => (
            <article key={a.title}>
              <h3 className={styles.h3}>{a.title}</h3>
              <p className={styles["s-who"]}>{a.who}</p>
              <ul className={styles["s-ticks"]}>
                {a.ticks.map(([before, bold, after]) => <li key={before}><span>{before}<b>{bold}</b>{after}</span></li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles["s-band"]} ${styles["s-band--tint"]}`} aria-labelledby="band-how">
        <h2 id="band-how" className={styles["s-h2"]}>{LANDING.howHeading}</h2>
        <p className={styles["s-sub"]}>{LANDING.howSub}</p>
        <ol className={styles["s-steps"]}>
          {LANDING.steps.map((s, i) => (
            <li key={s.title} className={i === 4 ? `${styles["s-st"]} ${styles["s-st--final"]}` : styles["s-st"]}>
              <span className={styles["s-st-no"]}>{i + 1}</span>
              <h3 className={styles.h3s}>{s.title}</h3>
              <p>{s.body}</p>
              <span className={styles["s-st-eg"]}>
                {i === 0 && <span className="raw">{LANDING.stepRaw}</span>}
                {i === 1 && <>{LANDING.stepClinical} <Mono>{LANDING.stepBdc}</Mono></>}
                {i === 2 && <>
                  <span className={`stage-status ${styles.stOk}`}>OK</span>
                  <span className={`stage-status ${styles.stWarn}`}>Warning</span>
                  <span className={`stage-status ${styles.stFail}`}>Failed</span>
                </>}
                {i === 3 && <ReviewStatus status="pending" />}
                {i === 4 && <ReviewStatus status="approved" />}
              </span>
            </li>
          ))}
        </ol>
        <div className={styles["s-loop-row"]} aria-hidden="true"><span className={styles["s-loop"]} /></div>
        <div className={styles["s-loop-row"]}>
          <p className={styles["s-loop-label"]}><b>{LANDING.loopLead}</b><ReviewStatus status="back_in_review" />{LANDING.loopText}</p>
        </div>
      </section>

      <section className={styles["s-band"]} aria-labelledby="band-prom">
        <h2 id="band-prom" className={styles["s-h2"]}>{LANDING.promisesHeading}</h2>
        <p className={styles["s-sub"]}>{LANDING.promisesSub}</p>
        <div className={styles["s-prom"]}>
          <article>
            <h3 className={styles.h3}>{LANDING.promiseNoData}</h3>
            <NoDataBlock title={LANDING.promiseNoDataName} bdsId={LANDING.promiseNoDataId} />
            <p>{LANDING.promiseNoDataNote}</p>
          </article>
          <article>
            <h3 className={styles.h3}>{LANDING.promiseApproval}</h3>
            <div className={styles["s-prom-row"]}>
              <ReviewStatus status="pending" /><ReviewStatus status="approved" /><ReviewStatus status="back_in_review" />
            </div>
            <p>{LANDING.promiseApprovalNote}</p>
          </article>
          <article>
            <h3 className={styles.h3}>{PUBLIC_BOARD.unknownPromise}</h3>
            <div className={styles["s-prom-row"]}><Severity level="unknown" /><Severity level="minor" /></div>
            <p>{LANDING.promiseUnknownNote}</p>
          </article>
        </div>
      </section>

      <section className={`${styles["s-band"]} ${styles["s-band--tint"]}`} aria-labelledby="band-api">
        <div className={styles["s-api"]}>
          <div className={styles["s-api-l"]}>
            <h2 id="band-api" className={styles["s-h2"]}>{LANDING.partnersHeading}</h2>
            <p className={styles["s-sub"]}>{LANDING.partnersSub}</p>
            <ul className={styles["s-ticks"]}>
              <li><span>{LANDING.partnerTicks[0]}</span></li>
              <li><span>{LANDING.partnerTicks[1]}<b>{LANDING.partnerTickBold}</b>.</span></li>
              <li><span>{LANDING.partnerTicks[2]}<Mono>{LANDING.partnerEnvelope}</Mono>.</span></li>
            </ul>
            <div className={styles["s-row"]}>
              <a className={buttonClass("primary")} href="/partners">{LANDING.requestAccess}</a>
              <span className={styles["s-who"]}>{LANDING.requestNote}</span>
            </div>
          </div>
          <div className={styles["s-code"]}>
            <figure>
              <figcaption><Mono>{LANDING.codeRequest}</Mono></figcaption>
              <pre tabIndex={0} aria-label={LANDING.codeRequestLabel}>{JSON.stringify({ conceptIds: sample.ids }, null, 2)}</pre>
            </figure>
            {sample.result && (
              <figure>
                <figcaption>{LANDING.responseToday}{noneApproved && <> {LANDING.responseNoneApproved}</>}</figcaption>
                <pre tabIndex={0} aria-label={LANDING.codeResponseLabel}>{responseBody(sample.result)}</pre>
              </figure>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
```

`web/components/public/landing.module.css` (Board P `.s-hero` to `.s-api`, same values; the board's inline styles become classes):

```css
.s-hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 56px; padding: 64px 56px 56px; align-items: center; }
.s-pilot { display: inline-flex; align-items: center; gap: 9px; font: 500 13.5px/1.3 var(--font-ui); color: var(--fg-2); }
.s-pilot::before { content: ""; width: 7px; height: 7px; background: var(--accent); flex: none; }
.h1 { font: var(--t-display); letter-spacing: var(--tr-display); margin-top: 20px; max-width: 21ch; text-wrap: balance; }
.s-lede { font-size: 17.5px; line-height: 1.5; color: var(--fg-2); margin-top: 20px; max-width: 52ch; letter-spacing: -.006em; }
.s-ctas { display: flex; gap: 12px; margin-top: 30px; flex-wrap: wrap; }
.s-fine { font-size: 13px; color: var(--fg-2); margin-top: 16px; }
.narrow { display: none; }
.s-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 56px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.s-stat { padding: 22px 20px 24px 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.s-stat + .s-stat { padding-left: 20px; border-left: 1px solid var(--line); }
.s-stat b { font: 600 30px/1.1 var(--font-ui); letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
.s-stat span { font-size: 13px; color: var(--fg-2); max-width: 28ch; }
.s-band { padding: 72px 56px; }
.s-band--tint { background: var(--surface-2); }
.s-h2 { font: 600 34px/1.12 var(--font-ui); letter-spacing: -.025em; max-width: 26ch; text-wrap: balance; }
.s-sub { color: var(--fg-2); font-size: 16px; margin-top: 12px; max-width: 62ch; }
.h3 { font: 600 18px/1.3 var(--font-ui); letter-spacing: -.012em; }
.h3s { font: 600 15.5px/1.3 var(--font-ui); letter-spacing: -.01em; }
.s-aud { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px; margin-top: 36px; }
.s-aud article { border-top: 2px solid var(--fg); padding-top: 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.s-who { font-size: 13px; color: var(--fg-2); }
.s-ticks { display: flex; flex-direction: column; gap: 10px; }
.s-ticks li { display: grid; grid-template-columns: 6px minmax(0, 1fr); gap: 12px; font-size: 14.5px; color: var(--fg-2); }
.s-ticks li::before { content: ""; width: 6px; height: 6px; margin-top: 9px; background: var(--accent); }
.s-ticks li b { color: var(--fg); font-weight: 600; }
.s-steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-top: 36px; }
.s-st { background: var(--surface); border-radius: var(--r-panel); padding: 18px; display: flex; flex-direction: column; gap: 8px; box-shadow: var(--shadow-1); position: relative; min-width: 0; }
.s-st:not(:last-child)::after { content: ""; position: absolute; top: 24px; right: -11px; width: 8px; height: 8px; border-top: 1.5px solid var(--line-ctl); border-right: 1.5px solid var(--line-ctl); transform: rotate(45deg); }
.s-st-no { font: 600 13px/1 var(--font-ui); color: var(--accent); font-variant-numeric: tabular-nums; }
.s-st p { font-size: 13.5px; color: var(--fg-2); }
.s-st-eg { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; color: var(--fg-2); }
.s-st--final { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-line); }
.s-st--final .s-st-eg { border-top-color: var(--accent-line); }
.s-st-eg :global(.rv) { white-space: normal; height: auto; min-height: 24px; padding-block: 4px; line-height: 1.25; }
.stOk { --st-ico: var(--i-check); color: var(--fg-2); }
.stWarn { --st-ico: var(--i-warn); color: var(--warn); }
.stFail { --st-ico: var(--i-fail); color: var(--crit); }
.s-loop-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
.s-loop { grid-column: 2 / 6; margin-inline: calc((100% - 42px) / 8); height: 26px; border: 1.5px dashed var(--accent); border-top: 0; border-radius: 0 0 14px 14px; position: relative; }
.s-loop::before { content: ""; position: absolute; left: -4.75px; top: -1px; width: 8px; height: 8px; border-left: 1.5px solid var(--accent); border-top: 1.5px solid var(--accent); transform: rotate(45deg); }
.s-loop-label { grid-column: 2 / 6; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px 10px; font-size: 14px; color: var(--fg-2); margin-top: 12px; text-align: center; }
.s-loop-label b { color: var(--fg); font-weight: 600; }
.s-prom { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: 36px; }
.s-prom article { display: flex; flex-direction: column; gap: 14px; min-width: 0; padding: 22px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); background: var(--canvas); }
.s-prom p { font-size: 14px; color: var(--fg-2); }
.s-prom-row { display: flex; flex-wrap: wrap; gap: 8px; }
.s-api { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 48px; align-items: start; }
.s-api-l { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.s-api-l .s-sub { margin-top: 0; }
.s-row { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.s-code { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.s-code figure { border-radius: var(--r-panel); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line-strong); overflow: hidden; min-width: 0; }
.s-code figcaption { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; border-bottom: 1px solid var(--line); font: 500 12.5px/1.3 var(--font-ui); color: var(--fg-2); }
.s-code figcaption :global(.mono) { color: var(--fg); }
.s-code pre { margin: 0; padding: 14px; font: 400 12.5px/1.55 var(--font-mono); color: var(--fg); overflow-x: auto; white-space: pre; max-height: 420px; }
.s-code pre:focus-visible { outline-offset: -2px; }
@media (max-width: 1080px) { .s-steps, .s-loop-row { grid-template-columns: 1fr; } .s-loop, .s-loop-label { grid-column: 1; } .s-st:not(:last-child)::after { display: none; } }
@media (max-width: 860px) { .s-hero, .s-api, .s-aud, .s-prom { grid-template-columns: 1fr; } .s-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 16px; } .s-band { padding: 48px 16px; } .s-hero { padding: 32px 16px; gap: 28px; } }
@media (max-width: 480px) {
  .wide { display: none; }
  .narrow { display: block; }
  .h1 { font: var(--t-title1); letter-spacing: var(--tr-title1); }
  .s-ctas { flex-direction: column; }
  .s-ctas :global(.btn) { width: 100%; }
  .s-stats { grid-template-columns: 1fr; }
  .s-stat + .s-stat { padding-left: 0; border-left: 0; border-top: 1px solid var(--line); }
}
```

- [ ] **Step 5: The page**

`web/app/page.tsx` (whole file):

```tsx
import HeroCard from "@/components/public/HeroCard";
import { loadHero } from "@/components/public/hero";
import Landing from "@/components/public/Landing";
import { PARTNER_SAMPLE } from "@/content/check-scenarios";
import { checkPublic, getStats } from "@/lib/api";
export const dynamic = "force-dynamic";

/** §6.1. Every read is public scope; each one that fails only leaves its own part out (Review Focus 4). */
export default async function Home() {
  const [stats, hero, check] = await Promise.all([
    getStats().catch(() => null),
    loadHero(),
    checkPublic(PARTNER_SAMPLE.ids).catch(() => null),
  ]);
  return (
    <Landing stats={stats} hero={hero ? <HeroCard hero={hero} /> : null}
      sample={{ ids: PARTNER_SAMPLE.ids, result: check?.ok ? check.data : null }} />
  );
}
```

Task 21 writes `HeroCard` and `loadHero`; to run this task's test before Task 21, create the two files now with their final names and these first versions (Task 21 replaces both):

```tsx
// web/components/public/hero.ts
import "server-only";
import type { ProductStub, PublicProduct } from "@/lib/public-types";
export async function loadHero(): Promise<PublicProduct | ProductStub | null> { return null; }
```

```tsx
// web/components/public/HeroCard.tsx
import type { ProductStub, PublicProduct } from "@/lib/public-types";
export default function HeroCard({ hero }: { hero: PublicProduct | ProductStub }) { return <div data-hero={hero.conceptId} />; }
```

The old home page's search form and results move to `/search` (Task 22); `/?q=` already redirects there (Task 19). Remove `"app/page.tsx"` from `LEGACY_EXEMPT` in `web/tests/copy.test.ts`.

- [ ] **Step 6: Run the tests**

Run: `cd web && npx vitest run tests/home-page.test.tsx tests/copy.test.ts tests/inline-styles.test.ts tests/marks.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/app/page.tsx web/components/public/Landing.tsx web/components/public/landing.module.css web/components/public/hero.ts \
  web/components/public/HeroCard.tsx web/content/site.ts web/content/check-scenarios.ts web/tests/home-page.test.tsx web/tests/copy.test.ts
git commit -m "feat(web): landing page with live pilot numbers, Board P bands and the real partner response (§6.1)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: The landing lookup card (`HERO_CONCEPT_ID`, §6.1, §1.6 item 9)

**Files:**
- Modify: `web/components/public/hero.ts`, `web/components/public/HeroCard.tsx`
- Create: `web/components/public/hero.module.css`
- Test: `web/tests/hero-card.test.tsx`

**Interfaces:**
- Consumes: `getPublicProduct(id)` (Task 17), `PUBLIC_NEW.hero`, `LOOKUP`, `ReviewStatus`, `Severity`, `CodeChip`, `formatStrength` (`lib/format.ts`).
- Produces: `loadHero(): Promise<PublicProduct | ProductStub | null>` (server-only: reads `HERO_CONCEPT_ID`; null when unset, blank, unknown, failed, or answered for another id); `HeroCard({ hero })`; `heroFieldText(p: PublicProduct): string` ("{tradeName} {strengthValue}" for one ingredient, else "{tradeName}").

Rules (§6.1, §1.6 item 9): while the hero product is not public, the card shows only the trade name (as its heading and in the field row) and the `NOT_REVIEWED` pill, with the pending line; no dosage form, company, DAR number, generic content, clinical drug, substance, code or count, and no Example marker, at every width. Once approved, the card renders the live data (brand → clinical drug → substances with codes → severity counts of the chosen entries) with the approved pill only. Below 480 px the approved card omits the company, the generic content, the strengths, DrugBank and SNOMED CT chips and the severity counts; its labels read "Brand", and "also {DGDA name}".

- [ ] **Step 1: Write the failing test**

`web/tests/hero-card.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicProduct } from "@/lib/public-types";

const getPublicProduct = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicProduct: (id: string) => getPublicProduct(id) }));
import HeroCard, { heroFieldText } from "@/components/public/HeroCard";
import { loadHero } from "@/components/public/hero";

const NAPA: PublicProduct = {
  conceptId: "186-0030-006--napa", darNumber: "186-0030-006", tradeName: "Napa", company: "Beximco Pharmaceuticals Ltd.",
  dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [], parseStatus: "parsed", parseNote: null,
  clinicalDrug: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet", route: "systemic", ingredients: [{
    bdsId: "BDS-000001", name: "Acetaminophen", strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null,
    ddinter: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
    summary: { bdsId: "BDS-000001", name: "Acetaminophen", raw: "Paracetamol 500 mg", strengthValue: 500, strengthUnit: "mg",
      perValue: null, perUnit: null,
      names: [{ name: "Paracetamol", type: "dgda_content", source: "dgda-ocl" }, { name: "Acetaminophen", type: "icd11", source: "dgda-ocl" }],
      codes: [["ICD11_XM", "XM5DJ7"], ["RXCUI", "161"], ["ATC", "N02BE01"], ["DRUGBANK", "DB00316"], ["SNOMEDCT", "387517004"], ["DDINTER", "DDInter14"]]
        .map(([system, code]) => ({ system, code, routeScope: "any", method: "xm", confidence: 1, source: null })),
      coverage: { coverage: "full", note: "" },
      ddinter: { chosen: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
        entries: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic",
          counts: { major: 10, moderate: 85, minor: 38, unknown: 512, total: 645 }, diseaseCount: 3, foodCount: 1, source: null }] } } }] },
  verification: { status: "approved", role: "pharmacist", approvedAt: "2026-10-14T05:20:00Z" },
  provenance: { batchId: "0001-pilot", extractedAt: null, source: "DGDA register", sourceLink: null, stages: [] }, otherBrandsCount: 0,
};
const STUB = { conceptId: "186-0030-006--napa", tradeName: "Napa", status: "not_reviewed" as const, batchId: "0001-pilot", hidden: true as const };

beforeEach(() => { getPublicProduct.mockReset(); vi.stubEnv("HERO_CONCEPT_ID", "186-0030-006--napa"); });
afterEach(() => vi.unstubAllEnvs());

// Review Focus 4
describe("loadHero", () => {
  it("no card when the hero id is unset, unknown or the API fails", async () => {
    vi.stubEnv("HERO_CONCEPT_ID", "");
    expect(await loadHero()).toBeNull();
    expect(getPublicProduct).not.toHaveBeenCalled();
    vi.stubEnv("HERO_CONCEPT_ID", "   ");
    expect(await loadHero()).toBeNull();
    vi.stubEnv("HERO_CONCEPT_ID", "186-0030-006--napa");
    getPublicProduct.mockResolvedValue({ ok: false, status: 404 });
    expect(await loadHero()).toBeNull();
    getPublicProduct.mockRejectedValue(new Error("down"));
    expect(await loadHero()).toBeNull();
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...STUB, conceptId: "someone-else" } });
    expect(await loadHero()).toBeNull();
  });
  it("answers the stub or the product", async () => {
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    expect(await loadHero()).toEqual(STUB);
    getPublicProduct.mockResolvedValue({ ok: true, data: NAPA });
    expect(await loadHero()).toEqual(NAPA);
  });
  it("a dismissed hero (approved, reported, then dismissed by a senior: pending, P1C §5.2) is the stub card, never the approved one", async () => {
    // the API answers a dismissed record with the plain §7.4 stub; nothing of the issue or the dismissal reaches the web
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    const hero = await loadHero();
    expect(hero).toEqual(STUB);
    const html = renderToStaticMarkup(<HeroCard hero={hero!} />);
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["rv--approved", "Brand in the DGDA register", "Acetaminophen 500 mg tablet", "issue", "ismiss"])
      expect(html).not.toContain(absent);
  });
});

describe("HeroCard (§6.1, §1.6 item 9)", () => {
  it("not approved: trade name and the not-reviewed pill only, at every width, labelled without Example", () => {
    for (const stub of [STUB, { ...STUB, status: "removed" as const }]) {
      const html = renderToStaticMarkup(<HeroCard hero={stub} />);
      expect(html).toContain('role="group" aria-label="Lookup for Napa"');
      expect(html).toContain("<h2");
      expect(html).toContain("Not yet reviewed by a pharmacist");
      expect(html).toContain("Its clinical drug, codes and interactions appear here after a pharmacist approves it.");
      for (const absent of ["Tablet", "Beximco", "DAR", "Paracetamol", "BDC-", "BDS-", "XM5DJ7", "sev--", "Example", "example", "rv--approved"])
        expect(html).not.toContain(absent);
    }
  });
  it("approved: the four live steps and the approved pill, no Example", () => {
    const html = renderToStaticMarkup(<HeroCard hero={NAPA} />);
    expect(html).toContain('aria-label="Lookup for Napa 500"');
    expect(html).toContain("Brand in the DGDA register");
    expect(html).toContain("Tablet, <span class=\"wide\">Beximco Pharmaceuticals Ltd., </span><span class=\"mono\">DAR 186-0030-006</span>");
    expect(html).toContain("Acetaminophen 500 mg tablet");
    expect(html).toContain('<span class="mono">BDS-000001</span>');
    expect(html).toContain("also listed as Paracetamol");
    expect(html).toContain("Drug interactions in DDInter 2.0, 645 pairs");
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">512</b></span>');
    expect(html).toContain("rv--approved");
    expect(html).not.toContain("Example");
  });
  it("the narrow parts are marked so CSS can drop them below 480 px", () => {
    const html = renderToStaticMarkup(<HeroCard hero={NAPA} />);
    expect(html).toContain('<span class="narrow">Brand</span>');
    expect(html).toMatch(/class="wide"[^>]*>[\s\S]*DrugBank/);
  });
  it("field row text", () => {
    expect(heroFieldText(NAPA)).toBe("Napa 500");
    expect(heroFieldText({ ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, ingredients: [...NAPA.clinicalDrug!.ingredients, NAPA.clinicalDrug!.ingredients[0]] } })).toBe("Napa");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/hero-card.test.tsx`
Expected: FAIL (the first versions from Task 20 render nothing of this).

- [ ] **Step 3: Write `loadHero` and the card**

`web/components/public/hero.ts`:

```ts
import "server-only";
import { getPublicProduct, isStub } from "@/lib/api";
import type { ProductStub, PublicProduct } from "@/lib/public-types";

/**
 * The landing hero product (§6.1, D26): HERO_CONCEPT_ID, read with public scope. Null when the variable is unset or
 * blank, the id is unknown, the read fails, or the answer names another product (Review Focus 4): the landing then
 * renders without the card, never with a 500.
 */
export async function loadHero(): Promise<PublicProduct | ProductStub | null> {
  const id = (process.env.HERO_CONCEPT_ID ?? "").trim();
  if (!id) return null;
  try {
    const r = await getPublicProduct(id);
    if (!r.ok || r.data.conceptId !== id) return null;
    return isStub(r.data) ? (r.data as ProductStub) : (r.data as PublicProduct);
  } catch {
    return null;
  }
}
```

`web/components/public/HeroCard.tsx`:

```tsx
import CodeChip from "@/components/ui/CodeChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import type { ClinicalItem, ProductStub, PublicProduct } from "@/lib/public-types";
import { LOOKUP } from "@/lib/public-copy";
import { formatStrength } from "@/lib/format";
import styles from "./hero.module.css";

const NARROW_CODES = ["ICD11_XM", "RXCUI", "ATC"];
const ALL_CODES = ["ICD11_XM", "RXCUI", "ATC", "DRUGBANK", "SNOMEDCT"];

/** §6.1: "{tradeName} {strengthValue}" for a single-ingredient product (Board P's "Napa 500"), "{tradeName}" otherwise. */
export function heroFieldText(p: PublicProduct): string {
  const items = p.clinicalDrug?.ingredients ?? [];
  return items.length === 1 && items[0].strengthValue !== null ? `${p.tradeName} ${items[0].strengthValue}` : p.tradeName;
}

const isApproved = (h: PublicProduct | ProductStub): h is PublicProduct => !("hidden" in h);

function Field({ text }: { text: string }) {
  return <div className={styles["s-look-field"]}><span className="ico" aria-hidden="true" /><span>{text}</span><span className={styles["s-caret"]} aria-hidden="true" /></div>;
}

function Rail({ last = false }: { last?: boolean }) {
  return <div className={styles["s-rail"]} aria-hidden="true"><i />{!last && <b />}</div>;
}

function SubstanceStep({ item }: { item: ClinicalItem }) {
  const s = item.summary;
  const dgda = s?.names.find((n) => n.type === "dgda_content" && n.name.toLowerCase() !== item.name.toLowerCase())?.name;
  const codes = ALL_CODES.flatMap((system) => (s?.codes ?? []).filter((c) => c.system === system).slice(0, 1));
  return (
    <div className={styles["s-step"]}>
      <span className={styles["s-k"]}>{LOOKUP.substance}</span>
      <span className={styles["s-v"]}>{item.name}<span className="wide">{formatStrength(item) && `, ${formatStrength(item)}`}</span></span>
      <span className={styles["s-x"]}>
        <span className="mono">{item.bdsId}</span>
        {dgda && <><span className="wide">{fill(LOOKUP.alsoListed, { name: dgda })}</span><span className="narrow">{fill(LOOKUP.alsoNarrow, { name: dgda })}</span></>}
      </span>
      <div className="codes">
        {codes.map((c) => (
          <span key={c.system} className={NARROW_CODES.includes(c.system) ? undefined : "wide"}><CodeChip system={c.system} code={c.code} /></span>
        ))}
      </div>
    </div>
  );
}

function CountsStep({ item }: { item: ClinicalItem }) {
  const s = item.summary;
  if (!s || s.coverage.coverage !== "full" || s.ddinter.chosen.length === 0) return null;
  const chosen = new Set(s.ddinter.chosen.map((c) => c.ddinterId));
  const sum = { major: 0, moderate: 0, minor: 0, unknown: 0, total: 0 };
  for (const e of s.ddinter.entries) if (chosen.has(e.ddinterId)) for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += e.counts[k];
  return (
    <div className={`${styles["s-step"]} wide`}>
      <span className={styles["s-k"]}>{fill(LOOKUP.interactions, { n: sum.total })}</span>
      <div className={styles["s-sevrow"]}>
        {(["major", "moderate", "minor", "unknown"] as const).filter((k) => sum[k] > 0).map((k) => <Severity key={k} level={k} count={sum[k]} />)}
      </div>
    </div>
  );
}

/** §6.1 lookup card. Not approved: trade name and NOT_REVIEWED only (§1.6 item 9). Approved: live data, no Example. */
export default function HeroCard({ hero }: { hero: PublicProduct | ProductStub }) {
  if (!isApproved(hero)) {
    return (
      <div className={styles["s-look"]} role="group" aria-label={fill(PUBLIC_NEW.hero.ariaLabel, { name: hero.tradeName })}>
        <Field text={hero.tradeName} />
        <div className={styles["s-look-body"]}>
          <h2 className={styles.heading}>{hero.tradeName}</h2>
          <p className={styles["s-x"]}>{PUBLIC_NEW.hero.pendingLine}</p>
        </div>
        <div className={styles["s-look-foot"]}><ReviewStatus status="pending" /></div>
      </div>
    );
  }
  const cd = hero.clinicalDrug;
  const items = cd?.ingredients ?? [];
  const field = heroFieldText(hero);
  return (
    <div className={styles["s-look"]} role="group" aria-label={fill(PUBLIC_NEW.hero.ariaLabel, { name: field })}>
      <Field text={field} />
      <div className={styles["s-look-body"]}>
        <div className={styles["s-chain"]}>
          <Rail />
          <div className={styles["s-step"]}>
            <span className={styles["s-k"]}><span className="wide">{LOOKUP.brand}</span><span className="narrow">{LOOKUP.brandNarrow}</span></span>
            <span className={styles["s-v"]}>{hero.tradeName}</span>
            <span className={styles["s-x"]}>{hero.dosageForm}, <span className="wide">{hero.company}, </span><span className="mono">DAR {hero.darNumber}</span></span>
            <span className={`${styles["s-x"]} wide`}>{LOOKUP.filedAs}<span className="raw">{hero.genericContentRaw}</span></span>
          </div>
          {cd && <>
            <Rail />
            <div className={styles["s-step"]}>
              <span className={styles["s-k"]}>{LOOKUP.clinical}</span>
              <span className={styles["s-v"]}>{cd.displayName}</span>
              <span className={styles["s-x"]}><span className="mono">{cd.bdcId}</span><span className="wide">{fill(LOOKUP.route, { route: cd.route })}</span></span>
            </div>
          </>}
          {items.map((item, i) => (
            <div key={item.bdsId} className={styles.pair}>
              <Rail last={i === items.length - 1 && !item.summary} />
              <SubstanceStep item={item} />
              {item.summary && <><Rail last={i === items.length - 1} /><CountsStep item={item} /></>}
            </div>
          ))}
        </div>
      </div>
      <div className={styles["s-look-foot"]}><ReviewStatus status="approved" /></div>
    </div>
  );
}
```

`web/components/public/hero.module.css` (Board P `.s-look` block; `.wide` and `.narrow` are global classes so the markup the test reads is the board's):

```css
.s-look { background: var(--surface); border-radius: 18px; box-shadow: var(--shadow-2); padding: 10px; min-width: 0; }
.s-look-field { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; border-radius: 12px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line-ctl); font-size: 16px; }
.s-look-field :global(.ico) { --ico: var(--i-search); color: var(--fg-2); }
.s-caret { width: 1.5px; height: 20px; background: var(--accent); margin-left: -8px; }
.s-look-body { padding: 18px 12px 12px; display: flex; flex-direction: column; gap: 14px; }
.heading { font: 600 15.5px/1.3 var(--font-ui); letter-spacing: -.01em; }
.s-chain { display: grid; grid-template-columns: 12px minmax(0, 1fr); column-gap: 14px; }
.pair { display: contents; }
.s-rail { display: flex; flex-direction: column; align-items: center; }
.s-rail i { width: 9px; height: 9px; background: var(--surface); box-shadow: inset 0 0 0 2px var(--accent); margin-top: 5px; flex: none; }
.s-rail b { flex: 1; width: 1.5px; background: var(--accent-line); margin: 3px 0; }
.s-step { padding-bottom: 16px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.s-k { font-size: 12px; color: var(--fg-2); }
.s-v { font: 600 15.5px/1.3 var(--font-ui); letter-spacing: -.01em; }
.s-x { font-size: 13px; color: var(--fg-2); }
.s-step :global(.codes), .s-sevrow { margin-top: 6px; }
.s-sevrow { display: flex; flex-wrap: wrap; gap: 6px; }
.s-look-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--fg-2); }
.s-look :global(.narrow) { display: none; }
@media (max-width: 480px) {
  .s-look :global(.wide) { display: none; }
  .s-look :global(.narrow) { display: inline; }
  .s-look-body { padding: 14px 8px 8px; }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/hero-card.test.tsx tests/home-page.test.tsx && npm run lint:css`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/public/hero.ts web/components/public/HeroCard.tsx web/components/public/hero.module.css web/tests/hero-card.test.tsx
git commit -m "feat(web): landing lookup card, trade name and status only until approved, no Example (§6.1, §1.6 item 9, Review Focus 4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Search (`/search?q=&page=`, §6.3)

**Files:**
- Create: `web/app/search/page.tsx`
- Create: `web/components/public/SearchResults.tsx`, `web/components/public/search.module.css`
- Test: `web/tests/search-page.test.tsx`

**Interfaces:**
- Consumes: `searchMedicines`, `getStats` (Task 17, P3), `parseQuery`, `parseSearchPage`, `SEARCH_PAGE_MAX` (Task 18), `SEARCH`, `SYSTEM_NAMES`, `NAV`, `plural` (Task 16), `PUBLIC_NEW.search`, `DESK_NEW.reviewLists.nextPage/previousPage`, `NO_DATA_SENTENCE`, `NOT_RUN`, `ReviewStatus`, `NoDataChip`, `CodeChip`, `fillNodes`.
- Produces: `SearchResults({ result, q, page, capped, inReview })`; `Marked({ text, q })` (the first case-insensitive occurrence of `q` in `<mark>`), exported for the checker's no-JS matches.

- [ ] **Step 1: Write the failing test**

`web/tests/search-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "@/lib/public-types";

const searchMedicines = vi.fn(), getStats = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  searchMedicines: (q: string, p: number) => searchMedicines(q, p), getStats: () => getStats() }));
import SearchPage from "@/app/search/page";

const render = async (sp: Record<string, string>) => renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve(sp) }));
const PARA: SearchResult = {
  query: "paracetamol", total: 2, hasMore: false, counts: { substances: 1, products: 1 },
  substances: [{ bdsId: "BDS-000001", preferredName: "Acetaminophen", matchedName: "Paracetamol", matchedNameType: "dgda_content",
    otherNameTypes: ["rxnorm", "icd11", "ddinter"], coverage: "full", ddinterIds: ["DDInter14"], keyCodes: { atc: ["N02BE01"], rxcui: ["161"] },
    approvedProductCount: 1 }],
  products: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", darNumber: "186-0030-006", company: "Beximco Pharmaceuticals Ltd.",
    dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg", clinicalDrug: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet" },
    matchedOn: "generic", matchedName: "Paracetamol 500 mg", status: "approved" }],
  suggestion: null,
};

beforeEach(() => {
  searchMedicines.mockReset(); searchMedicines.mockResolvedValue({ ok: true, data: PARA });
  getStats.mockReset(); getStats.mockResolvedValue({ inReviewProducts: 10, batches: [] });
});

describe("/search (§6.3, Board P)", () => {
  it("results header, count line, the substance hit with its DGDA-name line, codes and approved count", async () => {
    const html = await render({ q: "paracetamol" });
    expect(searchMedicines).toHaveBeenCalledWith("paracetamol", 0);
    expect(html).toContain("<h1");
    expect(html).toContain("Results for &quot;paracetamol&quot;");
    expect(html).toContain("1 substance, 1 product");
    expect(html).toContain('<a class="s-res-name" href="/substances/BDS-000001">Acetaminophen</a>');
    expect(html).toContain("Matched <mark>Paracetamol</mark>, the name in the DGDA register. RxNorm, ICD-11 and DDInter call it Acetaminophen.");
    expect(html).toContain('Interaction data found in DDInter 2.0, <span class="mono">DDInter14</span>');
    expect(html).toContain("1 approved product");
    expect(html).toContain('<span class="code-sys">ATC</span>N02BE01');
  });

  it("the approved product hit and the stub hit", async () => {
    searchMedicines.mockResolvedValue({ ok: true, data: { ...PARA, products: [...PARA.products,
      { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", status: "not_reviewed", hidden: true }] } });
    const html = await render({ q: "paracetamol" });
    expect(html).toContain("Filed as <mark>Paracetamol</mark> 500 mg. Clinical drug Acetaminophen 500 mg tablet, <span class=\"mono\">BDC-000001</span>.");
    expect(html).toContain("rv--approved");
    expect(html).toContain('<a class="s-res-name" href="/products/185-0138-012--g-warfarin">G Warfarin</a>');
    expect(html).toContain("A pharmacist hasn&#x27;t approved this record yet, so its substance, codes and interactions are hidden.");
    expect(html).toContain("Not yet reviewed by a pharmacist");
  });

  it("a substance with no data shows the full no-data sentence; not run shows NOT_RUN", async () => {
    const none = { ...PARA, products: [], substances: [{ ...PARA.substances[0], coverage: "none" as const, matchedNameType: "preferred" as const }] };
    searchMedicines.mockResolvedValue({ ok: true, data: none });
    const html = await render({ q: "domperidone" });
    expect(html).toContain('<span class="sev sev--nodata">No interaction data</span>');
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).not.toContain("Matched <mark>");
    searchMedicines.mockResolvedValue({ ok: true, data: { ...none, substances: [{ ...none.substances[0], coverage: "not_run" as const }] } });
    const nr = await render({ q: "domperidone" });
    expect(nr).toContain("Not checked yet: DDInter mapping has not run");
    expect(nr).not.toContain("sev--nodata");
  });

  it("validation never calls the API", async () => {
    expect(await render({ q: "a" })).toContain("Type at least 2 characters.");
    expect(await render({ q: "x".repeat(101) })).toContain("Use 100 characters or fewer.");
    expect(await render({})).toContain("Type at least 2 characters.");
    expect(searchMedicines).not.toHaveBeenCalled();
  });

  it("no results: the hint, the suggestion and the pilot sentence; never 'does not exist'", async () => {
    searchMedicines.mockResolvedValue({ ok: true, data: { ...PARA, total: 0, counts: { substances: 0, products: 0 }, substances: [], products: [],
      suggestion: "Warfarin" } });
    const html = await render({ q: "warfrin" });
    expect(html).toContain("No medicines match &quot;warfrin&quot;");
    expect(html).toContain("Check the spelling, or search by brand, substance or DAR number.");
    expect(html).toContain('href="/search?q=Warfarin">Search for Warfarin</a>');
    expect(html).toContain("IntelliDrugs is in its pilot. 10 medicines are in review now, and more follow in later batches.");
    expect(html).not.toMatch(/does not exist|doesn&#x27;t exist/);
    getStats.mockResolvedValue({ inReviewProducts: 0, batches: [] });
    expect(await render({ q: "warfrin" })).not.toContain("IntelliDrugs is in its pilot.");
  });

  it("pages: 20 per page, Next and Previous, and the cap at index 9", async () => {
    searchMedicines.mockResolvedValue({ ok: true, data: { ...PARA, total: 400, hasMore: true } });
    const p1 = await render({ q: "napa", page: "1" });
    expect(p1).toContain('href="/search?q=napa&amp;page=2">Next page</a>');
    expect(p1).toContain('href="/search?q=napa&amp;page=0">Previous page</a>');
    const p9 = await render({ q: "napa", page: "9" });
    expect(p9).toContain("Showing the first 200 results. Refine your search to see more.");
    expect(p9).not.toContain("Next page");
    await render({ q: "napa", page: "57" });
    expect(searchMedicines).toHaveBeenLastCalledWith("napa", 9);
    await render({ q: "napa", page: "x" });
    expect(searchMedicines).toHaveBeenLastCalledWith("napa", 0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/search-page.test.tsx`
Expected: FAIL (`Cannot find module '@/app/search/page'`).

- [ ] **Step 3: Write the component, the page and the styles**

`web/components/public/SearchResults.tsx`:

```tsx
import type { ReactNode } from "react";
import CodeChip from "@/components/ui/CodeChip";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW, NOT_RUN, NO_DATA_SENTENCE, PUBLIC_NEW, fill } from "@/lib/copy";
import type { SearchProduct, SearchResult, SearchStub, SearchSubstance } from "@/lib/public-types";
import { SEARCH, SYSTEM_NAMES, plural } from "@/lib/public-copy";
import { SEARCH_PAGE_MAX } from "@/lib/public-params";
import { fillNodes } from "@/lib/review-copy";
import styles from "./search.module.css";

const enc = encodeURIComponent;
const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The first case-insensitive occurrence of q in <mark>; the text as it is when q does not occur. */
export function Marked({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function hitLine(s: SearchSubstance): ReactNode {
  const matched = <mark>{s.matchedName}</mark>;
  if (s.matchedNameType === "dgda_content") {
    const systems = s.otherNameTypes.map((t) => SYSTEM_NAMES[t]).filter(Boolean);
    const template = systems.length ? SEARCH.hitDgda : SEARCH.hitDgda.split(" {systems}")[0];
    return fillNodes(template, { matched, systems: joinAnd(systems), preferred: s.preferredName });
  }
  if (s.matchedNameType === "rxnorm") return fillNodes(PUBLIC_NEW.search.hitRxnorm, { matched });
  if (s.matchedNameType === "ddinter") return fillNodes(PUBLIC_NEW.search.hitDdinter, { matched });
  return null;
}

function SubstanceHit({ s }: { s: SearchSubstance }) {
  const line = hitLine(s);
  return (
    <article className={styles["s-res"]}>
      <div className={styles["s-res-main"]}>
        <a className={styles["s-res-name"]} href={`/substances/${enc(s.bdsId)}`}>{s.preferredName}</a>
        {line && <p className={styles["s-hit"]}>{line}</p>}
        <p className={styles["s-res-meta"]}>
          <Mono>{s.bdsId}</Mono>
          {s.coverage === "full" && <span>{fillNodes(SEARCH.dataFound, { ids: s.ddinterIds.map((id, i) => <span key={id}>{i > 0 && ", "}<Mono>{id}</Mono></span>) })}</span>}
          {s.coverage === "none" && <span><NoDataChip label="No interaction data" /> {NO_DATA_SENTENCE}</span>}
          {s.coverage === "not_run" && <span>{NOT_RUN}</span>}
          <span>{fill(s.approvedProductCount === 1 ? PUBLIC_NEW.search.approvedOne : PUBLIC_NEW.search.approvedMany, { k: s.approvedProductCount })}</span>
        </p>
      </div>
      <div className={styles["s-res-side"]}>
        <div className="codes">
          {s.keyCodes.atc.map((c) => <CodeChip key={`a${c}`} system="ATC" code={c} />)}
          {s.keyCodes.rxcui.map((c) => <CodeChip key={`r${c}`} system="RXCUI" code={c} />)}
        </div>
      </div>
    </article>
  );
}

function ProductHit({ p, q }: { p: SearchProduct; q: string }) {
  return (
    <article className={styles["s-res"]}>
      <div className={styles["s-res-main"]}>
        <a className={styles["s-res-name"]} href={`/products/${enc(p.conceptId)}`}>{p.tradeName}</a>
        <p className={styles["s-res-meta"]}><span>{p.dosageForm}</span><span>{p.company}</span><Mono>DAR {p.darNumber}</Mono></p>
        {p.clinicalDrug && (
          <p className={styles["s-hit"]}>{fillNodes(SEARCH.filedAs, { raw: <Marked text={p.genericContentRaw} q={q} />,
            display: p.clinicalDrug.displayName, bdc: <Mono>{p.clinicalDrug.bdcId}</Mono> })}</p>
        )}
      </div>
      <div className={styles["s-res-side"]}><ReviewStatus status="approved" /></div>
    </article>
  );
}

/** §6.3 stub hit: matched on trade name or DAR only; its composition is never shown (D16). */
function StubHit({ p }: { p: SearchStub }) {
  return (
    <article className={`${styles["s-res"]} ${styles["s-res--stub"]}`}>
      <div className={styles["s-res-main"]}>
        <a className={styles["s-res-name"]} href={`/products/${enc(p.conceptId)}`}>{p.tradeName}</a>
        <p className={styles["s-res-meta"]}><Mono>{p.conceptId}</Mono></p>
        <p className={styles["s-res-meta"]}>{SEARCH.stubLine}</p>
      </div>
      <div className={styles["s-res-side"]}><ReviewStatus status="pending" /></div>
    </article>
  );
}

const pageHref = (q: string, page: number) => `/search?${new URLSearchParams({ q, page: String(page) })}`;

export default function SearchResults({ result, q, page, capped, inReview }:
    { result: SearchResult; q: string; page: number; capped: boolean; inReview: number }) {
  if (result.total === 0) {
    return (
      <section className={styles["s-page"]}>
        <div className={styles["s-empty"]}>
          <h1 className={styles.h1}>{fill(SEARCH.noResults, { q })}</h1>
          <p>{SEARCH.noResultsHint}</p>
          {result.suggestion && (
            <p className={styles["s-row"]}><a className={buttonClass("tonal")} href={`/search?${new URLSearchParams({ q: result.suggestion })}`}>
              {fill(SEARCH.searchFor, { suggestion: result.suggestion })}</a></p>
          )}
          {inReview > 0 && <p>{fill(SEARCH.pilot, { n: inReview })}</p>}
        </div>
      </section>
    );
  }
  const { substances, products } = result.counts;
  const count = [substances > 0 && `${substances} ${plural(substances, SEARCH.substanceOne, SEARCH.substanceMany)}`,
    products > 0 && `${products} ${plural(products, SEARCH.productOne, SEARCH.productMany)}`].filter(Boolean).join(", ");
  const atCap = capped || (page === SEARCH_PAGE_MAX && result.hasMore);
  return (
    <section className={styles["s-page"]}>
      <div className={styles["s-results-h"]}><h1 className={styles.h1}>{fill(SEARCH.resultsFor, { q })}</h1><span>{count}</span></div>
      {result.substances.length > 0 && (
        <div className={styles["s-rgroup"]}>
          <h2 className={styles.h2}>{result.substances.length === 1 && substances === 1 ? SEARCH.groupSubstance : SEARCH.groupSubstances}</h2>
          {result.substances.map((s) => <SubstanceHit key={s.bdsId} s={s} />)}
        </div>
      )}
      {result.products.length > 0 && (
        <div className={styles["s-rgroup"]}>
          <h2 className={styles.h2}>{SEARCH.groupProducts}</h2>
          {result.products.map((p) => ("hidden" in p ? <StubHit key={p.conceptId} p={p} /> : <ProductHit key={p.conceptId} p={p} q={q} />))}
        </div>
      )}
      <p className={styles["s-row"]}>
        {page > 0 && <a href={pageHref(q, page - 1)}>{DESK_NEW.reviewLists.previousPage}</a>}
        {result.hasMore && !atCap && <a href={pageHref(q, page + 1)}>{DESK_NEW.reviewLists.nextPage}</a>}
      </p>
      {atCap && <p className={styles["s-cap"]}>{PUBLIC_NEW.search.pageCap}</p>}
    </section>
  );
}
```

`web/app/search/page.tsx`:

```tsx
import SearchResults from "@/components/public/SearchResults";
import styles from "@/components/public/search.module.css";
import { getStats, searchMedicines } from "@/lib/api";
import { PUBLIC_NEW } from "@/lib/copy";
import { NAV } from "@/lib/public-copy";
import { parseQuery, parseSearchPage } from "@/lib/public-params";
export const dynamic = "force-dynamic";
export const metadata = { title: "Search medicines · IntelliDrugs" };

/** §6.3. Public scope for every session (§2.2). A bad page reads as 0; past index 9 reads 9 with the cap line (Review Focus 2). */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { q, problem } = parseQuery(sp.q);
  if (problem) {
    return (
      <section className={styles["s-page"]}>
        <h1 className={styles.h1}>{NAV.searchLabel}</h1>
        <p role="status">{problem === "short" ? PUBLIC_NEW.search.tooShort : PUBLIC_NEW.search.tooLong}</p>
      </section>
    );
  }
  const { page, capped } = parseSearchPage(sp.page);
  const r = await searchMedicines(q, page);
  if (!r.ok) throw new Error(`search failed (${r.status})`);
  const stats = r.data.total === 0 ? await getStats().catch(() => null) : null;
  return <SearchResults result={r.data} q={q} page={page} capped={capped} inReview={stats?.inReviewProducts ?? 0} />;
}
```

`web/components/public/search.module.css` (Board P `.s-page` … `.s-empty`):

```css
.s-page { padding: 32px 40px 48px; display: flex; flex-direction: column; gap: 24px; max-width: 1060px; margin: 0 auto; }
.h1 { font: var(--t-title1); letter-spacing: var(--tr-title1); }
.h2 { font: 600 13px/1.3 var(--font-ui); color: var(--fg-2); }
.s-results-h { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.s-results-h span { font-size: 14px; color: var(--fg-2); }
.s-rgroup { display: flex; flex-direction: column; gap: 10px; }
.s-res { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 24px; padding: 16px 18px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); background: var(--canvas); }
.s-res-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.s-res-name { font: 600 17px/1.3 var(--font-ui); letter-spacing: -.012em; color: var(--fg); text-decoration: none; width: fit-content; }
.s-res-name:hover { text-decoration: underline; }
.s-res-meta { font-size: 13.5px; color: var(--fg-2); display: flex; flex-wrap: wrap; gap: 4px 14px; }
.s-res-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; text-align: right; }
.s-hit { font-size: 13px; color: var(--fg); }
.s-hit mark { background: var(--accent-soft); color: var(--fg); padding: 0 3px; border-radius: 3px; }
.s-res--stub { background: var(--surface-2); }
.s-res--stub .s-res-meta { color: var(--fg); }
.s-empty { display: flex; flex-direction: column; gap: 12px; max-width: 60ch; padding: 8px 0; }
.s-empty p { color: var(--fg-2); }
.s-row { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
.s-cap { font-size: 13.5px; color: var(--fg-2); }
@media (max-width: 720px) { .s-page { padding: 24px 16px 40px; } .s-res { grid-template-columns: 1fr; } .s-res-side { align-items: flex-start; text-align: left; } }
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/search-page.test.tsx tests/copy.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/search/page.tsx web/components/public/SearchResults.tsx web/components/public/search.module.css web/tests/search-page.test.tsx
git commit -m "feat(web): /search with substance, product and stub hits, validation, page cap and suggestion (§6.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: The product route: hidden-record stub, removed stub and not found (§6.4)

**Files:**
- Rewrite: `web/app/products/[id]/page.tsx`
- Create: `web/app/products/[id]/not-found.tsx`
- Create: `web/components/public/ProductStub.tsx`, `web/components/public/ProductView.tsx` (first version), `web/components/public/product.module.css`
- Test: `web/tests/product-page.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `getPublicProduct`, `getProductInteractions`, `getClinicalDrug`, `isStub` (Task 17), `parseIndex` (Task 18), `STUB`, `PRODUCT`, `PUBLIC_NEW.removed`, `PUBLIC_NEW.notFound`, `DESK.searchMedicines`, `NOT_REVIEWED` via `ReviewStatus`, `getSession`, `cspNonce`, `turnstileSiteKey`.
- Produces:
  - `ProductStub({ stub })` (also used by Task 27's substance stub through `SubstanceStubView`).
  - `ProductView(props: ProductViewProps)` with `ProductViewProps = { product: PublicProduct; interactions: ProductInteractions | null; ix: number; brands: ClinicalDrugView["products"] | null; session: Session | null; flag: string | undefined; siteKey: string | null; nonce?: string }` (Tasks 24–26 grow it; its props never change).
  - The page reads the product, then (approved only) P10 page `ix` and, when `otherBrandsCount > 0`, P8, in parallel; a failed P10 or P8 read leaves that section out; a 404 is `notFound()`; any other product read failure throws to the error page.

- [ ] **Step 1: Write the failing test**

`web/tests/product-page.test.tsx` (whole file; Tasks 24–26 append to it):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAPA } from "./fixtures/public";

const getPublicProduct = vi.fn(), getProductInteractions = vi.fn(), getClinicalDrug = vi.fn(), getSession = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicProduct: (id: string) => getPublicProduct(id), getProductInteractions: (id: string, p: number) => getProductInteractions(id, p),
  getClinicalDrug: (id: string) => getClinicalDrug(id) }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1", "x-pathname": "/products/gone" }) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
import ProductPage from "@/app/products/[id]/page";
import ProductNotFound from "@/app/products/[id]/not-found";

const renderProduct = async (id = NAPA.conceptId, sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));
const STUB = { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", status: "not_reviewed", batchId: "0001-pilot", hidden: true };

beforeEach(() => {
  getPublicProduct.mockReset(); getPublicProduct.mockResolvedValue({ ok: true, data: NAPA });
  getProductInteractions.mockReset(); getProductInteractions.mockResolvedValue({ ok: true, data: { conceptId: NAPA.conceptId, page: 0, totalPartners: 0, partners: [], notChecked: [] } });
  getClinicalDrug.mockReset(); getClinicalDrug.mockResolvedValue({ ok: false, status: 404 });
  getSession.mockReset(); getSession.mockResolvedValue(null);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("hidden-record stub (§6.4)", () => {
  it("status 200 page: crumb, h1, id, the not-reviewed pill, both sentences with the batch, and the search button; no data", async () => {
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    const html = await renderProduct(STUB.conceptId);
    expect(html).toContain('<a href="/search">Medicines</a>');
    expect(html).toContain("<h1");
    expect(html).toContain(">G Warfarin</h1>");
    expect(html).toContain('<p class="mono">185-0138-012--g-warfarin</p>');
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).toContain("A pharmacist hasn&#x27;t approved this record yet. Until then IntelliDrugs hides its clinical drug, codes and interactions");
    expect(html).toContain('The record exists and is in review in batch <span class="mono">0001-pilot</span>.');
    expect(html).toContain('href="/search">Search other medicines</a>');
    expect(getProductInteractions).not.toHaveBeenCalled();
    for (const absent of ["DAR", "BDC-", "BDS-", "Warfarin Sodium", "Report a problem"]) expect(html).not.toContain(absent);
  });

  it("a removed record says so in place of the two review sentences, with the same pill", async () => {
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...STUB, status: "removed" } });
    const html = await renderProduct(STUB.conceptId);
    expect(html).toContain("Removed from the DGDA batch file.");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).not.toContain("is in review in batch");
  });

  it("a reviewer sees the same stub (§2.2 public scope)", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    const html = await renderProduct(STUB.conceptId);
    expect(getPublicProduct).toHaveBeenCalledWith(STUB.conceptId);
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).not.toContain("pharm@example.org");
  });

  it("an unknown or malformed id is not found; the not-found page names the id", async () => {
    getPublicProduct.mockResolvedValue({ ok: false, status: 404 });
    await expect(renderProduct("gone")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(renderProduct("%E0%A4")).rejects.toThrow("NEXT_NOT_FOUND");
    const html = renderToStaticMarkup(await ProductNotFound());
    expect(html).toContain("<h1>No medicine with the id gone.</h1>");
    expect(html).toContain('href="/search">Search medicines</a>');
    expect(html).not.toContain("<main");
  });

  it("an API failure is not a stub and not a not-found", async () => {
    getPublicProduct.mockResolvedValue({ ok: false, status: 503 });
    await expect(renderProduct("x")).rejects.toThrow(/product read failed/);
  });
});

describe("approved product (§6.5): reads", () => {
  it("reads the P10 page from ?ix= and the other brands only when there are some", async () => {
    await renderProduct(NAPA.conceptId, { ix: "2" });
    expect(getProductInteractions).toHaveBeenCalledWith(NAPA.conceptId, 2);
    expect(getClinicalDrug).not.toHaveBeenCalled();
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, otherBrandsCount: 2 } });
    await renderProduct(NAPA.conceptId, { ix: "-4" });
    expect(getProductInteractions).toHaveBeenLastCalledWith(NAPA.conceptId, 0);
    expect(getClinicalDrug).toHaveBeenCalledWith("BDC-000001");
  });
  it("renders the trade name as the one h1", async () => {
    const html = await renderProduct();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Napa</h1>");
  });
});
```

Create the shared fixture `web/tests/fixtures/public.ts` (Tasks 24–30 use it):

```ts
import type { CheckResult, ProductInteractions, PublicProduct } from "@/lib/public-types";

const SRC = (url: string, label: string, fetchedAt: string | null = "2026-10-11T22:00:00Z") => ({ url, label, fetchedAt });

/** Board P's Napa, approved (the approval is the Example of Board P; everything else is the pilot's). */
export const NAPA: PublicProduct = {
  conceptId: "186-0030-006--napa", darNumber: "186-0030-006", tradeName: "Napa", company: "Beximco Pharmaceuticals Ltd.",
  dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [{ xmCode: "XM5DJ7", name: "Paracetamol" }],
  parseStatus: "parsed", parseNote: null,
  clinicalDrug: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet", route: "systemic", ingredients: [{
    bdsId: "BDS-000001", name: "Acetaminophen", strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null,
    ddinter: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
    summary: {
      bdsId: "BDS-000001", name: "Acetaminophen", raw: "Paracetamol 500 mg", strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null,
      names: [{ name: "Paracetamol", type: "dgda_content", source: "dgda-ocl" }, { name: "acetaminophen", type: "rxnorm", source: "rxnav" },
        { name: "Acetaminophen", type: "icd11", source: "dgda-ocl" }, { name: "Acetaminophen", type: "ddinter", source: "ddinter2" }],
      codes: [
        { system: "ICD11_XM", code: "XM5DJ7", routeScope: "any", method: "xm", confidence: 1, source: SRC("https://icd.who.int/browse/latest-release/mms/en", "Search ICD-11 for XM5DJ7", "2026-10-11T21:00:00Z") },
        { system: "RXCUI", code: "161", routeScope: "any", method: "rxnav-exact", confidence: 1, source: SRC("https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=161", "RxNav") },
        { system: "ATC", code: "N02BE01", routeScope: "any", method: "rxnav-exact", confidence: 1, source: SRC("https://atcddd.fhi.no/atc_ddd_index/?code=N02BE01&showdescription=no", "WHO ATC/DDD Index") },
        { system: "DRUGBANK", code: "DB00316", routeScope: "any", method: "rxnav-exact", confidence: 1, source: SRC("https://go.drugbank.com/drugs/DB00316", "DrugBank") },
        { system: "SNOMEDCT", code: "387517004", routeScope: "any", method: "rxnav-exact", confidence: 1, source: null },
        { system: "SNOMEDCT", code: "90332006", routeScope: "any", method: "rxnav-exact", confidence: 1, source: null },
        { system: "DDINTER", code: "DDInter14", routeScope: "systemic", method: "drugbank", confidence: 1, source: SRC("https://ddinter2.scbdd.com/server/drug-detail/DDInter14/", "DDInter 2.0", "2026-10-12T01:00:00Z") },
      ],
      coverage: { coverage: "full", note: "" },
      ddinter: { chosen: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
        entries: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", counts: { major: 10, moderate: 85, minor: 38, unknown: 512, total: 645 },
          diseaseCount: 3, foodCount: 1, source: null }] },
    } }] },
  verification: { status: "approved", role: "pharmacist", approvedAt: "2026-10-14T05:20:00Z" },
  provenance: { batchId: "0001-pilot", extractedAt: "2026-10-11T21:28:00Z", source: "DGDA register",
    sourceLink: SRC("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/", "DGDA register (OCL)", "2026-10-11T21:00:00Z"),
    stages: [
      { stage: "dgda", status: "ok", notes: [], textMissing: [] }, { stage: "substances", status: "ok", notes: [], textMissing: [] },
      { stage: "clinical", status: "ok", notes: [], textMissing: [] },
      { stage: "ddinter", status: "warn", notes: [], textMissing: [{ ddinterA: "DDInter1164", nameA: "Metformin", ddinterB: "DDInter14", nameB: "Acetaminophen", severity: "unknown" }] },
    ] },
  otherBrandsCount: 0,
};

const brands = (...names: [string, string][]) => names.map(([conceptId, tradeName]) => ({ conceptId, tradeName }));
const ACET = { bdsId: "BDS-000001", name: "Acetaminophen" };
export const NAPA_PAIRS: ProductInteractions = {
  conceptId: NAPA.conceptId, page: 0, totalPartners: 5,
  partners: [
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000003", name: "Warfarin" }, severity: "moderate", actions: ["synergy"],
      interaction: "Acetaminophen (APAP) may potentiate the hypoprothrombinemic effect of warfarin.",
      management: "Due to the lack of safer alternatives, acetaminophen is considered the analgesic and antipyretic drug of choice for patients receiving warfarin and similar anticoagulants. However, caution is recommended during concomitant therapy, particularly if high dosages of APAP are used.",
      ddinterA: "DDInter14", ddinterB: "DDInter1951", routeAssumed: false, source: "DDInter 2.0",
      pairReview: { state: "reviewed", reviewedAt: "2026-10-16T05:20:00Z" },
      brands: brands(["185-0138-012--g-warfarin", "G Warfarin"], ["W-9", "Warin"], ["W-8", "Coumarol"], ["W-7", "Warfa"]), brandCount: 4 },
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000002", name: "Amlodipine" }, severity: "unknown", actions: ["unknown"],
      interaction: null, management: null, ddinterA: "DDInter14", ddinterB: "DDInter79", routeAssumed: false, source: "DDInter 2.0",
      pairReview: { state: "not_reviewed", reviewedAt: null }, brands: brands(["071-0098-022--amlodipine-5", "Amlodipine-5"]), brandCount: 1 },
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000004", name: "Acetylsalicylic acid" }, severity: "unknown", actions: ["unknown"],
      interaction: null, management: null, ddinterA: "DDInter14", ddinterB: "DDInter20", routeAssumed: false, source: "DDInter 2.0",
      pairReview: { state: "reviewed", reviewedAt: "2026-10-15T08:00:00Z" }, brands: brands(["076-0028-006--aspirin", "Aspirin"]), brandCount: 1 },
  ],
  notChecked: [
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000010", name: "Domperidone" }, reason: "no_data", route: null,
      brands: brands(["127-0263-018--domperidone", "Domperidone"]), brandCount: 1 },
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000007", name: "Oticmol" }, reason: "no_route", route: "systemic",
      brands: brands(["OTI-1", "Otimol"]), brandCount: 1 },
  ],
};

export const emptyCheck = (over: Partial<CheckResult> = {}): CheckResult => ({
  summary: { medicines: 0, totalPairs: 0, checkedPairs: 0, alertPairs: 0, noInteractionPairs: 0, notCheckedPairs: 0, notReviewed: 0,
    bySeverity: { major: 0, moderate: 0, minor: 0, unknown: 0 } },
  products: [], alerts: [], noInteraction: [], notChecked: [], duplicates: [], noData: [], notReviewed: [], ...over,
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/product-page.test.tsx`
Expected: FAIL (the page still calls the old `getProduct`; `not-found.tsx` does not exist).

- [ ] **Step 3: Write the stub, the first `ProductView`, the not-found page and the route**

`web/components/public/ProductStub.tsx`:

```tsx
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PUBLIC_NEW } from "@/lib/copy";
import type { ProductStub as Stub } from "@/lib/public-types";
import { PRODUCT, STUB } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import styles from "./product.module.css";

/** The §6.4 stub pattern, shared by products and substances: crumb, h1, mono id, the NOT_REVIEWED pill, sentences, search. */
export function StubLayout({ name, id, children }: { name: string; id: string; children: ReactNode }) {
  return (
    <section className={styles["s-stub"]}>
      <nav aria-label={PRODUCT.crumbLabel}><p className={styles["s-crumb"]}><a href="/search">{PRODUCT.crumbRoot}</a><span aria-hidden="true">/</span><span>{name}</span></p></nav>
      <h1 className={styles.stubH1}>{name}</h1>
      <p className="mono">{id}</p>
      <span className={styles.fit}><ReviewStatus status="pending" /></span>
      {children}
      <p className={styles["s-row"]}><a className={buttonClass("tonal")} href="/search">{STUB.searchOther}</a></p>
    </section>
  );
}

/** §6.4: status 200, never 404. Every non-approved state, issue and removed included, reads NOT_REVIEWED. */
export default function ProductStub({ stub }: { stub: Stub }) {
  return (
    <StubLayout name={stub.tradeName} id={stub.conceptId}>
      {stub.status === "removed" ? <p>{PUBLIC_NEW.removed.removed}</p> : <>
        <p>{STUB.pending}</p>
        {stub.batchId && <p>{fillNodes(STUB.notNotFound, { batchId: <span className="mono">{stub.batchId}</span> })}</p>}
      </>}
    </StubLayout>
  );
}
```

`web/components/public/ProductView.tsx` (first version; Tasks 24–26 replace the body):

```tsx
import type { Session } from "@/lib/session";
import type { ClinicalDrugView, ProductInteractions, PublicProduct } from "@/lib/public-types";
import styles from "./product.module.css";

export type ProductViewProps = {
  product: PublicProduct; interactions: ProductInteractions | null; ix: number; brands: ClinicalDrugView["products"] | null;
  session: Session | null; flag: string | undefined; siteKey: string | null; nonce?: string;
};

/** §6.5 approved product page. Task 24 adds the header and the trace, Task 25 the interactions, Task 26 the checks and aside. */
export default function ProductView({ product }: ProductViewProps) {
  return <div className={styles["s-prod"]}><div className={styles["s-prod-main"]}><h1 className={styles.h1}>{product.tradeName}</h1></div></div>;
}
```

`web/app/products/[id]/not-found.tsx`:

```tsx
import { headers } from "next/headers";
import { buttonClass } from "@/components/ui/Button";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";

/** §6.4 "Unknown id": "No medicine with the id {id}." with "Search medicines". Inside the root layout's <main>. */
export default async function ProductNotFound() {
  const segment = (await headers()).get("x-pathname")?.split("/")[2] ?? "";
  let id = segment;
  try { id = decodeURIComponent(segment); } catch { /* keep the raw segment */ }
  return (
    <>
      <h1>{fill(PUBLIC_NEW.notFound.text, { id })}</h1>
      <p><a className={buttonClass("tonal")} href="/search">{DESK.searchMedicines}</a></p>
    </>
  );
}
```

`web/app/products/[id]/page.tsx` (whole file):

```tsx
import { notFound } from "next/navigation";
import ProductStub from "@/components/public/ProductStub";
import ProductView from "@/components/public/ProductView";
import { getClinicalDrug, getProductInteractions, getPublicProduct, isStub } from "@/lib/api";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import type { ProductInteractions, ProductStub as Stub, PublicProduct } from "@/lib/public-types";
import { parseIndex } from "@/lib/public-params";
import { getSession } from "@/lib/session";
import { turnstileSiteKey } from "@/lib/turnstile";
export const dynamic = "force-dynamic";

/**
 * §6.4, §6.5. Public scope for every session (§2.2): a reviewer sees the stub too. The stub is status 200 (the record
 * exists); an unknown id is not-found.tsx; any other failure of the product read is the error page, never a stub.
 */
export default async function ProductPage({ params, searchParams }: {
    params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const r = await getPublicProduct(decoded);
  if (!r.ok && r.status === 404) notFound();
  if (!r.ok) throw new Error(`product read failed (${r.status})`);
  if (isStub(r.data)) return <ProductStub stub={r.data as Stub} />;
  const product = r.data as PublicProduct;
  const ix = parseIndex(sp.ix);
  const [pairs, drug, session, nonce] = await Promise.all([
    getProductInteractions(product.conceptId, ix).catch(() => null),
    product.otherBrandsCount > 0 && product.clinicalDrug ? getClinicalDrug(product.clinicalDrug.bdcId).catch(() => null) : Promise.resolve(null),
    getSession(),
    cspNonce(),
  ]);
  const interactions = pairs?.ok && !isStub(pairs.data) ? (pairs.data as ProductInteractions) : null;
  return (
    <ProductView product={product} interactions={interactions} ix={ix} brands={drug?.ok ? drug.data.products : null}
      session={session} flag={firstParam(sp.flag) || undefined} siteKey={turnstileSiteKey()} nonce={nonce} />
  );
}
```

`web/components/public/product.module.css` (Board P `.s-prod` … `.s-stub`; Tasks 24–26 use the rest):

```css
.s-prod { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 40px; padding: 28px 40px 48px; max-width: 1180px; margin: 0 auto; }
.s-prod-main { display: flex; flex-direction: column; gap: 36px; min-width: 0; }
.h1 { font: var(--t-title1); letter-spacing: var(--tr-title1); margin-top: 8px; }
.s-crumb { font-size: 13px; color: var(--fg-2); display: flex; flex-wrap: wrap; gap: 6px; }
.s-crumb a { color: var(--fg-2); }
.s-prod-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 14.5px; color: var(--fg-2); margin-top: 10px; }
.s-prod-meta :global(.mono) { color: var(--fg); }
.s-verline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-top: 16px; font-size: 13px; color: var(--fg-2); }
.s-psec { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.s-psec-h { display: flex; align-items: baseline; gap: 6px 12px; flex-wrap: wrap; }
.h2 { font: var(--t-title2); letter-spacing: var(--tr-title2); }
.s-psec-h span { font-size: 13px; color: var(--fg-2); }
.h3 { font: 600 14px/1.3 var(--font-ui); color: var(--fg); }
.s-trace { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); overflow: hidden; }
.s-trace > div { padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.s-trace > div + div { border-left: 1px solid var(--line); }
.s-trace > div:first-child { background: var(--surface-2); }
.s-k { font-size: 12px; color: var(--fg-2); }
.s-v { font: 600 15.5px/1.3 var(--font-ui); letter-spacing: -.01em; }
.s-x { font-size: 13px; color: var(--fg-2); }
.s-tw { border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); overflow-x: auto; background: var(--canvas); }
.s-tw:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.s-table { width: 100%; font-size: 13.5px; min-width: 720px; }
.s-table th, .s-table td { padding: 10px 14px; text-align: left; vertical-align: top; border-top: 1px solid var(--line); }
.s-table thead th { font: 600 12px/1.3 var(--font-ui); color: var(--fg-2); border-top: 0; padding-block: 10px 8px; }
.s-table tbody th { font: 600 13px/1.4 var(--font-ui); color: var(--fg); white-space: nowrap; }
.s-what { color: var(--fg-2); }
.s-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.s-kv > div { padding: 14px 16px; border-radius: var(--r-card); background: var(--surface-2); display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: var(--fg-2); }
.s-kv b { font: 600 22px/1.2 var(--font-ui); color: var(--fg); letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.s-sevrow { display: flex; flex-wrap: wrap; gap: 6px; }
.s-panel { padding: 14px 16px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); display: flex; flex-direction: column; gap: 10px; background: var(--canvas); min-width: 0; }
.s-panel p { font-size: 13.5px; color: var(--fg-2); }
.s-panel .s-panelLead { color: var(--fg); }
.s-names { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13.5px; color: var(--fg); }
.s-names li { display: inline-flex; gap: 6px; align-items: baseline; }
.s-names li span { color: var(--fg-2); font-size: 12.5px; }
.s-stages { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.s-stages :global(.stage--warn), .s-stages :global(.stage--fail) { grid-column: 1 / -1; }
.s-aside { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.s-card { border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); padding: 16px; display: flex; flex-direction: column; gap: 10px; background: var(--canvas); }
.s-card h2 { font: 600 14.5px/1.3 var(--font-ui); }
.s-card p { font-size: 13.5px; color: var(--fg-2); }
.s-card dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; font-size: 13px; }
.s-card dt { color: var(--fg-2); }
.s-card dd { color: var(--fg); overflow-wrap: anywhere; }
.s-card :global(.btn), .s-aside > :global(.btn) { width: 100%; }
.s-stub { padding: 36px 40px 44px; display: flex; flex-direction: column; gap: 16px; max-width: 680px; }
.stubH1 { font: 600 40px/1.06 var(--font-ui); letter-spacing: -.03em; }
.s-stub p { color: var(--fg-2); max-width: 58ch; }
.s-stub :global(.mono) { color: var(--fg); }
.fit { width: fit-content; }
.s-row { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.pager { display: flex; gap: 16px; }
.brandList { display: flex; flex-direction: column; gap: 4px; }
@media (max-width: 980px) { .s-prod { grid-template-columns: 1fr; padding: 24px 16px 40px; } }
@media (max-width: 720px) { .s-trace { grid-template-columns: 1fr; } .s-trace > div + div { border-left: 0; border-top: 1px solid var(--line); } .s-stages { grid-template-columns: 1fr; } .s-stub { padding: 24px 16px 36px; } .stubH1 { font: var(--t-title1); } }
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/product-page.test.tsx && npm run lint:css`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/products/[id]/page.tsx web/app/products/[id]/not-found.tsx web/components/public/ProductStub.tsx \
  web/components/public/ProductView.tsx web/components/public/product.module.css web/tests/product-page.test.tsx web/tests/fixtures/public.ts
git commit -m "feat(web): product route: §6.4 stub (removed included), not found, public scope for every session" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Product page, part 1: header, verification line, "What's in it" and "Codes" with source links (§6.5 items 1–5)

**Files:**
- Create: `web/components/public/ProductHeader.tsx`, `web/components/public/WhatsInIt.tsx`, `web/components/public/CodesTable.tsx`
- Modify: `web/components/public/ProductView.tsx`
- Test: `web/tests/product-page.test.tsx` (append)

**Interfaces:**
- Consumes: Task 23 `ProductViewProps`, `product.module.css`; `PRODUCT`, `SYSTEM_NAMES`; `PUBLIC_NEW.ingredient`; `DESK_NEW.routeAware.routeAssumedSuffix`; `NOT_RUN`; `ReviewStatus`, `NoDataChip`, `CodeChip`, `SourceLink` (P1C); `fmtDhakaOn`, `formatStrength`; `fillNodes`.
- Produces: `ProductHeader({ product })`; `WhatsInIt({ product })`; `CodesTable({ item, route })` (one per clinical ingredient with a summary; also used by the substance page through `CodesRows`); `CodesRows({ codes, chosen, coverage, route })`; `groupNames(names): [string, string][]` (name, sources joined) ordered DGDA register, RxNorm, ICD-11, DDInter; `dgdaName(item): string | null`; `crumb(product): { label: string; href: string | null } | null`.

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/product-page.test.tsx`:

```tsx
describe("approved product (§6.5 items 1–5)", () => {
  it("crumb, h1, meta and the verification line", async () => {
    const html = await renderProduct();
    expect(html).toContain('<a href="/search">Medicines</a><span aria-hidden="true">/</span><a href="/substances/BDS-000001">Acetaminophen</a><span aria-hidden="true">/</span><span>Napa</span>');
    expect(html).toContain('<span>Tablet</span><span>Beximco Pharmaceuticals Ltd.</span><span class="mono">DAR 186-0030-006</span>');
    expect(html).toContain('<span class="rv rv--approved">Approved by a pharmacist</span><span>on 14/10/2026, 11:20 Dhaka time</span>');
  });

  it("a combination product's crumb uses the clinical drug display name", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, displayName: "Amoxicillin + Clavulanic acid tablet",
      ingredients: [item, { ...item, bdsId: "BDS-000002", name: "Clavulanic acid" }] } } });
    expect(await renderProduct()).toContain('<span aria-hidden="true">/</span><span>Amoxicillin + Clavulanic acid tablet</span><span aria-hidden="true">/</span><span>Napa</span>');
  });

  it("What's in it: the three trace columns and the names grouped with their sources", async () => {
    const html = await renderProduct();
    expect(html).toContain("What&#x27;s in it");
    expect(html).toContain("Brand, as filed with DGDA");
    expect(html).toContain('<span class="raw">Paracetamol 500 mg</span>');
    expect(html).toContain("Tablet, systemic route");
    expect(html).toContain("Acetaminophen, 500 mg");
    expect(html).toContain("Also listed as Paracetamol");
    expect(html).toMatch(/<li>Paracetamol <span>DGDA register<\/span><\/li><li>acetaminophen <span>RxNorm<\/span><\/li><li>Acetaminophen <span>ICD-11, DDInter<\/span><\/li>/);
  });

  it("Codes: one labelled scroll region with a caption, five columns, the Source links, and the chosen DDInter entry", async () => {
    const html = await renderProduct();
    expect(html).toContain('role="region" aria-label="Codes for Acetaminophen"');
    expect(html).toContain('<caption class="sr-only">Crosswalk codes for Acetaminophen</caption>');
    for (const col of ["System", "Code", "What the system is", "How it was matched", "Source"]) expect(html).toContain(`<th scope="col">${col}</th>`);
    expect(html).toContain("5 code systems and the DDInter entry, for Acetaminophen");
    expect(html).toContain("WHO&#x27;s ICD-11 medicament code. The DGDA register lists ingredients with it.");
    expect(html).toContain("xm, confidence 1.0");
    expect(html).toContain("drugbank, confidence 1.0, systemic");
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Search ICD-11 for XM5DJ7");
    expect(html).toContain('<span class="code">387517004</span><span class="code">90332006</span>');
  });

  it("a no-data substance's DDInter row is the No data chip; a no-route one is plain text with no hatch", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    const none = { ...item, summary: { ...item.summary!, coverage: { coverage: "none" as const, note: "" }, ddinter: { chosen: [], entries: [] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, ingredients: [none] } } });
    expect(await renderProduct()).toContain('<td><span class="sev sev--nodata">No data</span></td>');
    const noRoute = { ...item, summary: { ...item.summary!, ddinter: { ...item.summary!.ddinter, chosen: [] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, route: "otic", ingredients: [noRoute] } } });
    const html = await renderProduct();
    expect(html).toContain("No entry for route otic");
    expect(html).not.toContain("sev--nodata");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/product-page.test.tsx`
Expected: FAIL (no crumb, no trace, no codes).

- [ ] **Step 3: Write the three components**

`web/components/public/ProductHeader.tsx`:

```tsx
import ReviewStatus from "@/components/ui/ReviewStatus";
import { fmtDhakaOn } from "@/lib/format";
import type { PublicProduct } from "@/lib/public-types";
import { PRODUCT } from "@/lib/public-copy";
import styles from "./product.module.css";

/** §6.5 item 1: the first substance (linked), or the clinical drug for a combination product; nothing without a clinical drug. */
export function crumb(p: PublicProduct): { label: string; href: string | null } | null {
  const items = p.clinicalDrug?.ingredients ?? [];
  if (items.length === 1) return { label: items[0].name, href: `/substances/${encodeURIComponent(items[0].bdsId)}` };
  if (items.length > 1 && p.clinicalDrug) return { label: p.clinicalDrug.displayName, href: null };
  return null;
}

export default function ProductHeader({ product: p }: { product: PublicProduct }) {
  const c = crumb(p);
  return (
    <div>
      <nav aria-label={PRODUCT.crumbLabel}>
        <p className={styles["s-crumb"]}>
          <a href="/search">{PRODUCT.crumbRoot}</a><span aria-hidden="true">/</span>
          {c && <>{c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}<span aria-hidden="true">/</span></>}
          <span>{p.tradeName}</span>
        </p>
      </nav>
      <h1 className={styles.h1}>{p.tradeName}</h1>
      <p className={styles["s-prod-meta"]}><span>{p.dosageForm}</span><span>{p.company}</span><span className="mono">DAR {p.darNumber}</span></p>
      <p className={styles["s-verline"]}><ReviewStatus status="approved" />{p.verification.approvedAt && <span>{fmtDhakaOn(p.verification.approvedAt)}</span>}</p>
    </div>
  );
}
```

`web/components/public/WhatsInIt.tsx`:

```tsx
import { Fragment } from "react";
import { fill } from "@/lib/copy";
import { formatStrength } from "@/lib/format";
import type { ClinicalItem, IngredientSummary, PublicProduct } from "@/lib/public-types";
import { PRODUCT, SYSTEM_NAMES } from "@/lib/public-copy";
import styles from "./product.module.css";

const SOURCE_ORDER = ["dgda_content", "rxnorm", "icd11", "ddinter"];
const sourceLabel = (type: string) => (type === "dgda_content" ? PRODUCT.dgdaRegister : SYSTEM_NAMES[type] ?? type);

/** §6.5 item 4: one entry per name with its sources ("Acetaminophen — ICD-11, DDInter"), DGDA register first. */
export function groupNames(names: IngredientSummary["names"]): [string, string][] {
  const groups = new Map<string, string[]>();
  for (const n of names) groups.set(n.name, [...(groups.get(n.name) ?? []), n.type]);
  const rank = (types: string[]) => Math.min(...types.map((t) => (SOURCE_ORDER.includes(t) ? SOURCE_ORDER.indexOf(t) : SOURCE_ORDER.length)));
  return [...groups.entries()]
    .map(([name, types]) => [name, [...new Set(types)].sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b))] as [string, string[]])
    .sort((a, b) => rank(a[1]) - rank(b[1]))
    .map(([name, types]) => [name, types.map(sourceLabel).join(", ")]);
}

/** The DGDA register's name for the substance, when it differs from the preferred one. */
export function dgdaName(item: ClinicalItem): string | null {
  const n = item.summary?.names.find((x) => x.type === "dgda_content" && x.name.toLowerCase() !== item.name.toLowerCase());
  return n?.name ?? null;
}

export default function WhatsInIt({ product: p }: { product: PublicProduct }) {
  const cd = p.clinicalDrug;
  const items = cd?.ingredients ?? [];
  return (
    <section className={styles["s-psec"]} aria-labelledby="whats-in">
      <div className={styles["s-psec-h"]}><h2 id="whats-in" className={styles.h2}>{PRODUCT.whatsIn}</h2><span>{PRODUCT.whatsInSub}</span></div>
      <div className={styles["s-trace"]}>
        <div>
          <span className={styles["s-k"]}>{PRODUCT.traceBrand}</span><span className={styles["s-v"]}>{p.tradeName}</span>
          <span className={styles["s-x"]}><span className="raw">{p.genericContentRaw}</span></span><span className={styles["s-x"]}>{p.dosageForm}</span>
        </div>
        {cd && (
          <div>
            <span className={styles["s-k"]}>{PRODUCT.traceClinical}</span><span className={styles["s-v"]}>{cd.displayName}</span>
            <span className={`${styles["s-x"]} mono`}>{cd.bdcId}</span>
            <span className={styles["s-x"]}>{fill(PRODUCT.clinicalForm, { form: cd.doseForm, route: cd.route })}</span>
          </div>
        )}
        {items.length > 0 && (
          <div>
            <span className={styles["s-k"]}>{PRODUCT.traceSubstance}</span>
            {items.map((i) => {
              const strength = formatStrength(i);
              const dgda = dgdaName(i);
              return (
                <Fragment key={i.bdsId}>
                  <span className={styles["s-v"]}>{strength ? `${i.name}, ${strength}` : i.name}</span>
                  <span className={`${styles["s-x"]} mono`}>{i.bdsId}</span>
                  {dgda && <span className={styles["s-x"]}>{fill(PRODUCT.alsoListed, { name: dgda })}</span>}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
      {items.filter((i) => i.summary && i.summary.names.length > 0).map((i) => (
        <ul key={i.bdsId} className={styles["s-names"]} aria-label={items.length > 1 ? `${PRODUCT.namesLabel}: ${i.name}` : PRODUCT.namesLabel}>
          {groupNames(i.summary!.names).map(([name, sources]) => <li key={name}>{name} <span>{sources}</span></li>)}
        </ul>
      ))}
    </section>
  );
}
```

`web/components/public/CodesTable.tsx`:

```tsx
import CodeChip from "@/components/ui/CodeChip";
import NoDataChip from "@/components/ui/NoDataChip";
import SourceLink from "@/components/ui/SourceLink";
import { DESK_NEW, NOT_RUN, PUBLIC_NEW, fill } from "@/lib/copy";
import type { ChosenEntry, ClinicalItem, Coverage, Source } from "@/lib/public-types";
import { PRODUCT } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import styles from "./product.module.css";

export const SYSTEMS = ["ICD11_XM", "RXCUI", "ATC", "DRUGBANK", "SNOMEDCT", "DDINTER"] as const;
type Code = { system: string; code: string; routeScope: string; method: string; confidence: number; source: Source | null };
const conf = (c: number) => c.toFixed(1);
/** Board P prints the system's name in the row header, so only RxNorm's code chip names its type ("RxCUI"). */
const Chip = ({ c }: { c: Code }) => (c.system === "RXCUI" ? <CodeChip system="RXCUI" code={c.code} /> : <span className="code">{c.code}</span>);

/**
 * The codes rows (§6.5 item 5, §6.6). chosen: the DDInter row lists only these entries (product page); null lists every
 * DDInter code with its route (substance page). The hatch is only for coverage none (§3.4).
 */
export function CodesRows({ codes, chosen, coverage, route }: { codes: Code[]; chosen: ChosenEntry[] | null; coverage: Coverage; route: string | null }) {
  return (
    <>
      {SYSTEMS.map((system) => {
        const [label, what] = PRODUCT.systems[system];
        let rows = codes.filter((c) => c.system === system);
        if (system !== "DDINTER") {
          if (rows.length === 0) return null;
          return (
            <tr key={system}>
              <th scope="row">{label}</th>
              <td><span className="codes">{rows.map((c) => <Chip key={c.code} c={c} />)}</span></td>
              <td className={styles["s-what"]}>{what}</td>
              <td className={styles["s-what"]}>{fill(PRODUCT.how, { method: rows[0].method, confidence: conf(rows[0].confidence) })}</td>
              <td>{rows.filter((c) => c.source).map((c) => <span key={c.code} className={styles.link}><SourceLink url={c.source!.url} label={c.source!.label} fetchedAt={c.source!.fetchedAt} /></span>)}</td>
            </tr>
          );
        }
        if (coverage === "none")
          return <tr key={system}><th scope="row">{label}</th><td><NoDataChip label="No data" /></td><td className={styles["s-what"]}>{what}</td><td /><td /></tr>;
        if (coverage === "not_run")
          return <tr key={system}><th scope="row">{label}</th><td>{NOT_RUN}</td><td className={styles["s-what"]}>{what}</td><td /><td /></tr>;
        if (chosen !== null) {
          const ids = new Set(chosen.map((c) => c.ddinterId));
          rows = rows.filter((c) => ids.has(c.code));
          if (rows.length === 0)
            return (
              <tr key={system}><th scope="row">{label}</th>
                <td>{route ? fill(PUBLIC_NEW.ingredient.codesNoEntry, { route }) : PUBLIC_NEW.ingredient.codesNoEntryNoRoute}</td>
                <td className={styles["s-what"]}>{what}</td><td /><td /></tr>
            );
        }
        const assumed = chosen?.some((c) => c.routeAssumed) ?? false;
        return (
          <tr key={system}>
            <th scope="row">{label}</th>
            <td><span className="codes">{rows.map((c) => <Chip key={c.code} c={c} />)}</span></td>
            <td className={styles["s-what"]}>{what}</td>
            <td className={styles["s-what"]}>
              {rows.map((c, i) => <span key={c.code}>{i > 0 && "; "}{fill(PRODUCT.how, { method: c.method, confidence: conf(c.confidence) })}, {c.routeScope}{assumed && DESK_NEW.routeAware.routeAssumedSuffix}</span>)}
            </td>
            <td>{rows.filter((c) => c.source).map((c) => <span key={c.code} className={styles.link}><SourceLink url={c.source!.url} label={c.source!.label} fetchedAt={c.source!.fetchedAt} /></span>)}</td>
          </tr>
        );
      })}
    </>
  );
}

export function CodesTable({ item, route }: { item: ClinicalItem; route: string | null }) {
  const s = item.summary!;
  const k = new Set(s.codes.filter((c) => c.system !== "DDINTER").map((c) => c.system)).size;
  return (
    <>
      <p className={styles.sub}>{fillNodes(PRODUCT.codesSub, { k, name: item.name, bdsId: <span className="mono">{item.bdsId}</span> })}</p>
      <div className={styles["s-tw"]} tabIndex={0} role="region" aria-label={fill(PRODUCT.codesRegion, { name: item.name })}>
        <table className={styles["s-table"]}>
          <caption className="sr-only">{fill(PRODUCT.codesCaption, { name: item.name })}</caption>
          <thead><tr>
            <th scope="col">{PRODUCT.colSystem}</th><th scope="col">{PRODUCT.colCode}</th><th scope="col">{PRODUCT.colWhat}</th>
            <th scope="col">{PRODUCT.colHow}</th><th scope="col">{PRODUCT.colSource}</th>
          </tr></thead>
          <tbody><CodesRows codes={s.codes} chosen={s.ddinter.chosen} coverage={s.coverage.coverage} route={route} /></tbody>
        </table>
      </div>
    </>
  );
}
```

Add to `PRODUCT` in `web/lib/public-copy.ts`: `colSource: "Source",` (Board P's aside "Source" label; §6.5 item 5 names the column "Source"). Add to `product.module.css`: `.sub { font-size: 13px; color: var(--fg-2); }` and `.link { display: block; }`.

- [ ] **Step 4: Compose them in `ProductView`**

`web/components/public/ProductView.tsx`: the body becomes

```tsx
import { CodesTable } from "./CodesTable";
import ProductHeader from "./ProductHeader";
import WhatsInIt from "./WhatsInIt";
…
export default function ProductView(props: ProductViewProps) {
  const { product } = props;
  const items = (product.clinicalDrug?.ingredients ?? []).filter((i) => i.summary);
  return (
    <div className={styles["s-prod"]}>
      <div className={styles["s-prod-main"]}>
        <ProductHeader product={product} />
        <WhatsInIt product={product} />
        {items.length > 0 && (
          <section className={styles["s-psec"]} aria-labelledby="codes">
            <div className={styles["s-psec-h"]}><h2 id="codes" className={styles.h2}>{PRODUCT.codes}</h2></div>
            {items.map((i) => <CodesTable key={i.bdsId} item={i} route={product.clinicalDrug?.route ?? null} />)}
          </section>
        )}
      </div>
    </div>
  );
}
```

(import `PRODUCT` from `@/lib/public-copy`).

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run tests/product-page.test.tsx tests/copy.test.ts tests/marks.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/components/public/ProductHeader.tsx web/components/public/WhatsInIt.tsx web/components/public/CodesTable.tsx \
  web/components/public/ProductView.tsx web/components/public/product.module.css web/lib/public-copy.ts web/tests/product-page.test.tsx
git commit -m "feat(web): product page header, verification line, trace, names and codes with source links (§6.5 items 1–5, §5.6.6)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: Product page, part 2: per-substance interactions and "With other approved medicines" (§6.5 item 6)

**Files:**
- Create: `web/components/public/PublicPairCard.tsx`, `web/components/public/pair.module.css`
- Create: `web/components/public/SubstanceInteractions.tsx`, `web/components/public/OtherApproved.tsx`, `web/components/public/PairReviewBracket.tsx`
- Modify: `web/components/public/ProductView.tsx`, `web/lib/ddinter-text.ts` (`entryBaseName`)
- Test: `web/tests/product-page.test.tsx` (append), `web/tests/public-pair-card.test.tsx` (new)

**Interfaces:**
- Consumes: Task 24; `PUBLIC_NEW.otherApproved`, `DESK_NEW.routeAware` (`checkedAgainst`, `assumedStatement`, `noRouteEntry`, `noRouteEntryNoRoute`, `notCheckedNoRoute`, `notCheckedNoRouteNoRoute`, `notCheckedUnmapped`), `DESK_NEW.routeAssumed.noRouteStatement`, `DESK_NEW.notRun.notCheckedNotRun`, `DESK.noDataLine`; `FROM_DDINTER`, `UNKNOWN_PAIR_LINE`, `UNKNOWN_PAIRS_LINE`, `NO_MANAGEMENT`, `NOT_RUN`; `PairReviewState` (P1C); `Expander`; `NoDataBlock`; `Severity`; `CHECK` card labels; `PRODUCT.sourceLine`.
- Produces:
  - `PublicPairCard({ id, severity, names, meta?, review, text, reviewFirst?, extra?, source, link?, heading })` (`extra`: lines before the source line, such as the checker's route-assumed line) with `text: { kind: "management" | "interaction"; body: string } | null` and `TRUNCATE_AT = 200` (Board P: text over 200 characters is clamped with "Show full text"). Lines: management → "Management, truncated. Full text from DDInter 2.0." or "Management, full text from DDInter 2.0."; interaction only → `NO_MANAGEMENT` then the interaction text with "Interaction description, …"; neither and known severity → "DDInter 2.0 gives no text for this pair."; unknown severity and no text → `UNKNOWN_PAIR_LINE`. The label line is `FROM_DDINTER` then the `PairReviewState` (public), plain text, never green.
  - `pairText(p): { kind, body } | null`.
  - `SubstanceInteractions({ item, route })` (one block per substance: data found, no data, no route entry, not run).
  - `OtherApproved({ data, ix, conceptId, subject })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/public-pair-card.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PublicPairCard from "@/components/public/PublicPairCard";

const reviewed = { state: "reviewed" as const, reviewedAt: "2026-10-16T05:20:00Z" };
const notReviewed = { state: "not_reviewed" as const, reviewedAt: null };
const card = (over: Partial<Parameters<typeof PublicPairCard>[0]> = {}) => renderToStaticMarkup(<PublicPairCard id="p1" severity="moderate"
  names="Napa + G Warfarin" review={reviewed} text={{ kind: "management", body: "Monitor INR." }} source="Source: DDInter 2.0" heading="h4" {...over} />);

describe("PublicPairCard (§6.5, §6.7.3, P1C D53)", () => {
  it("labels the pair From DDInter 2.0 with its public review state, plain text, never green", () => {
    const html = card();
    expect(html).toContain("From DDInter 2.0");
    expect(html).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
    expect(html).not.toMatch(/rv--approved|--ok|seal/);
    expect(card({ review: notReviewed })).toContain("Pair not yet reviewed by a senior pharmacist");
  });
  it("short management text is in full; long text is truncated with Show full text", () => {
    expect(card()).toContain("Management, full text from DDInter 2.0.");
    const long = card({ text: { kind: "management", body: "x".repeat(201) } });
    expect(long).toContain("Management, truncated. Full text from DDInter 2.0.");
  });
  it("interaction only, no text, and unknown severity with no text", () => {
    const inter = card({ text: { kind: "interaction", body: "Raises levels." } });
    expect(inter).toContain("DDInter 2.0 gives no management text for this pair.");
    expect(inter).toContain("Interaction description, full text from DDInter 2.0.");
    expect(card({ text: null })).toContain("DDInter 2.0 gives no text for this pair.");
    const unknown = card({ severity: "unknown", text: null });
    expect(unknown).toContain("DDInter 2.0 lists this pair with action &quot;unknown&quot; and no text. It is not treated as low risk.");
    expect(unknown).toContain("Severity not classified by DDInter");
  });
  it("puts the label first when asked (checker: directly under the head)", () => {
    const html = card({ reviewFirst: true, meta: "Acetaminophen + Warfarin. Action: synergy" });
    expect(html.indexOf("From DDInter 2.0")).toBeLessThan(html.indexOf("Action: synergy"));
    expect(card({ meta: "Acetaminophen + Warfarin. Action: synergy" }).indexOf("From DDInter 2.0"))
      .toBeGreaterThan(card({ meta: "Acetaminophen + Warfarin. Action: synergy" }).indexOf("Action: synergy"));
  });
});
```

Append to `web/tests/product-page.test.tsx` (add `NAPA_PAIRS` to the fixture import):

```tsx
describe("approved product (§6.5 item 6)", () => {
  it("data found: the pair count heading, the severity chips and the disease and food counts; never a count of 0 for missing data", async () => {
    const html = await renderProduct();
    expect(html).toContain("From DDInter 2.0, for Acetaminophen");
    expect(html).toContain("645 drug–drug pairs");
    expect(html).toContain('<span class="sev sev--major">Major <b class="sev-n">10</b></span>');
    expect(html).toContain("<b>3</b>drug–disease interactions");
    expect(html).toContain("<b>1</b>drug–food interaction");
    expect(html).not.toContain("is checked against");    // systemic and not assumed: no statement
  });

  it("no data: the hatch block with the full sentence and the second line, no count anywhere", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, ingredients: [{ ...item,
      summary: { ...item.summary!, coverage: { coverage: "none", note: "" }, ddinter: { chosen: [], entries: [] } } }] } } });
    const html = await renderProduct();
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).toContain("Drug, disease and food interactions: no data in DDInter 2.0.");
    expect(html).not.toMatch(/\b0 drug–drug pairs/);
  });

  it("an eye drop names the entry it is checked against; no route entry is the plain line", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    const eye = { ...item, name: "Chloramphenicol", summary: { ...item.summary!, name: "Chloramphenicol", ddinter: { chosen: [{ ddinterId: "DDInter352",
      name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic", routeAssumed: false }], entries: [{ ddinterId: "DDInter352",
      name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic", counts: { major: 1, moderate: 111, minor: 0, unknown: 0, total: 112 },
      diseaseCount: 0, foodCount: 0, source: null }] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, route: "ophthalmic", ingredients: [eye] } } });
    const html = await renderProduct();
    expect(html).toContain('Chloramphenicol is checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic).');
    expect(html).toContain("112 drug–drug pairs");
    const none = { ...eye, summary: { ...eye.summary, ddinter: { ...eye.summary.ddinter, chosen: [] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, route: "otic", ingredients: [none] } } });
    const nr = await renderProduct();
    expect(nr).toContain("No DDInter entry for this product&#x27;s route (otic). Its pairs are not checked.");
    expect(nr).not.toContain("sev--nodata");
  });

  it("With other approved medicines: grouped cards with brands, the label and review state, the unclassified panel, no-data and other lines", async () => {
    getProductInteractions.mockResolvedValue({ ok: true, data: NAPA_PAIRS });
    const html = await renderProduct();
    expect(html).toContain("With other approved medicines");
    expect(html).toContain(">Acetaminophen + Warfarin</h4>");
    expect(html).toContain("With 4 approved brands: G Warfarin, Warin, Coumarol and 1 more. Action: synergy");
    expect(html).toContain("From DDInter 2.0");
    expect(html).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
    expect(html).toContain("<summary>All 4 brands</summary>");
    expect(html).toContain('<a href="/products/W-7">Warfa</a>');
    expect(html).toContain('Source: DDInter 2.0, <span class="mono">DDInter14</span> + <span class="mono">DDInter1951</span>');
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">2</b></span>');
    expect(html).toContain("Acetaminophen with Amlodipine (pair not yet reviewed by a senior pharmacist) and Acetylsalicylic acid (pair reviewed by a senior pharmacist on 15/10/2026).");
    expect(html).toContain("DDInter 2.0 lists these pairs with action &quot;unknown&quot; and no text. They are not treated as low risk.");
    expect(html).toContain("Not checked: Acetaminophen + Domperidone, in 1 approved brand");
    expect(html).toContain("Not checked: Otimol&#x27;s route is systemic and DDInter has no entry for Oticmol on that route.");
    expect(html).not.toContain("No interaction listed in DDInter 2.0");
  });

  it("pages of 20 partner substances with More and Previous interactions; the empty line on page 0", async () => {
    getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, page: 1, totalPartners: 45 } });
    const html = await renderProduct(NAPA.conceptId, { ix: "1" });
    expect(html).toContain('href="/products/186-0030-006--napa?ix=2#with-other">More interactions</a>');
    expect(html).toContain('href="/products/186-0030-006--napa?ix=0#with-other">Previous interactions</a>');
    getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, totalPartners: 0, partners: [], notChecked: [] } });
    expect(await renderProduct()).toContain("No other approved medicine has an interaction with Acetaminophen listed in DDInter 2.0 yet.");
    getProductInteractions.mockResolvedValue({ ok: false, status: 503 });
    expect(await renderProduct()).not.toContain("With other approved medicines");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/public-pair-card.test.tsx tests/product-page.test.tsx`
Expected: FAIL (`Cannot find module '@/components/public/PublicPairCard'`).

- [ ] **Step 3: The pair card**

`web/components/public/PublicPairCard.tsx`:

```tsx
import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import PairReviewState from "@/components/ui/PairReviewState";
import Severity from "@/components/ui/Severity";
import SourceLink from "@/components/ui/SourceLink";
import pc from "@/components/ui/PairCard.module.css";
import { FROM_DDINTER, NO_MANAGEMENT, UNKNOWN_PAIR_LINE } from "@/lib/copy";
import type { PublicPairReview, Source } from "@/lib/public-types";
import { CHECK } from "@/lib/public-copy";
import { severityOf } from "@/lib/severity";
import styles from "./pair.module.css";

export const TRUNCATE_AT = 200;
export type PairText = { kind: "management" | "interaction"; body: string } | null;

/** Management first, otherwise the interaction description (§5.6.2, §6.7.3). */
export function pairText(p: { management: string | null; interaction: string | null }): PairText {
  if (p.management) return { kind: "management", body: p.management };
  if (p.interaction) return { kind: "interaction", body: p.interaction };
  return null;
}

/**
 * Board P's public pair card (product page, substance page, checker). DDInter text is never rewritten: it is rendered in
 * full and the Expander clamps it once JavaScript runs (§4.2). The label line is FROM_DDINTER and the public review
 * state, plain text (§3.4 mark exclusivity, D53); every pair is shown with its text whatever that state says (G3).
 */
export default function PublicPairCard({ id, severity, names, meta, review, text, reviewFirst = false, extra, source, link, heading }: {
  id: string; severity: string; names: ReactNode; meta?: ReactNode; review: PublicPairReview; text: PairText; reviewFirst?: boolean;
  extra?: ReactNode; source: ReactNode; link?: Source | null; heading: "h3" | "h4";
}) {
  const H = heading;
  const textId = `${id}-text`;
  const label = (
    <div className={styles.label}>
      <span>{FROM_DDINTER}</span><span aria-hidden="true">·</span>
      <PairReviewState state={review.state} at={review.reviewedAt ?? undefined} surface="public" />
    </div>
  );
  const long = text !== null && text.body.length > TRUNCATE_AT;
  const kindLabel = text?.kind === "management"
    ? (long ? CHECK.managementTruncated : CHECK.managementFull)
    : (long ? CHECK.interactionTruncated : CHECK.interactionFull);
  return (
    <article className="pair">
      <div className="pair-head"><Severity level={severity} /><H className="pair-names">{names}</H></div>
      {reviewFirst && label}
      {meta && <p className="pair-meta">{meta}</p>}
      {!reviewFirst && label}
      {text === null && <p className="pair-source">{severityOf(severity) === "unknown" ? UNKNOWN_PAIR_LINE : CHECK.noText}</p>}
      {text?.kind === "interaction" && <p className="pair-source">{NO_MANAGEMENT}</p>}
      {text && <p className={`pair-text ${pc.open}`} id={textId}>{text.body}</p>}
      {text && <p className="pair-source">{kindLabel}{long && <> <Expander targetId={textId} label="public" /></>}</p>}
      {extra}
      <p className="pair-source">{source}{link && <> <SourceLink url={link.url} label={link.label} fetchedAt={link.fetchedAt} /></>}</p>
    </article>
  );
}
```

`web/components/public/pair.module.css`:

```css
.label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 12.5px; color: var(--fg-2); }
.label > * { margin: 0; }
```

Short text renders with `pc.open` and no Expander, so it is never clamped (Board P: "Management, full text from DDInter 2.0." with no button).

- [ ] **Step 4: The per-substance block and the cross-batch section**

Add to `web/lib/ddinter-text.ts` (shared with the checker's "What was checked" lines, Task 29; the desk keeps its own copy of the same rule in `Interactions.tsx`):

```ts
/** "Chloramphenicol (ophthalmic)" already names its route; the "checked against" statement adds the route once (§5.6.4, §6.7.3 item 7). */
export function entryBaseName(name: string | null, id: string, route: string): string {
  return (name ?? id).replace(new RegExp(` \\(${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), "");
}
```

`web/components/public/SubstanceInteractions.tsx`:

```tsx
import NoDataBlock from "@/components/ui/NoDataBlock";
import Severity from "@/components/ui/Severity";
import { DESK_NEW, NOT_RUN, fill } from "@/lib/copy";
import type { ClinicalItem } from "@/lib/public-types";
import { PRODUCT, plural } from "@/lib/public-copy";
import { entryBaseName } from "@/lib/ddinter-text";
import { DESK, fillNodes } from "@/lib/review-copy";
import styles from "./product.module.css";

const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;

/** §5.6.4 statements (one per chosen entry, as the desk does), shown when the route is not systemic or the entry was assumed. */
function CheckedAgainst({ item, route }: { item: ClinicalItem; route: string | null }) {
  return (
    <>
      {item.summary!.ddinter.chosen.map((c) => {
        if (c.routeAssumed) return <p key={c.ddinterId} className={styles.sub}>{route
          ? fillNodes(DESK_NEW.routeAware.assumedStatement, { route, substance: item.name, id: <Mono id={c.ddinterId} /> })
          : fillNodes(DESK_NEW.routeAssumed.noRouteStatement, { id: <Mono id={c.ddinterId} /> })}</p>;
        if (route === "systemic") return null;
        return <p key={c.ddinterId} className={styles.sub}>{fillNodes(DESK_NEW.routeAware.checkedAgainst, { substance: item.name,
          id: <Mono id={c.ddinterId} />, ddinterName: entryBaseName(c.name, c.ddinterId, c.routeScope), route: c.routeScope })}</p>;
      })}
    </>
  );
}

/** §6.5 item 6, one block per substance. It never renders a count of 0 for missing data. */
export default function SubstanceInteractions({ item, route }: { item: ClinicalItem; route: string | null }) {
  const s = item.summary!;
  const head = <p className={styles.sub}>{fill(PRODUCT.interactionsSub, { name: item.name })}</p>;
  if (s.coverage.coverage === "none")
    return <div>{head}<NoDataBlock title={item.name} bdsId={item.bdsId} extra={<p className="nodata-text">{DESK.noDataLine}</p>} /></div>;
  if (s.coverage.coverage === "not_run") return <div>{head}<p>{NOT_RUN}</p></div>;
  if (s.ddinter.chosen.length === 0)
    return <div>{head}<p>{route ? fill(DESK_NEW.routeAware.noRouteEntry, { route }) : DESK_NEW.routeAware.noRouteEntryNoRoute}</p></div>;
  const chosen = new Set(s.ddinter.chosen.map((c) => c.ddinterId));
  const sum = { major: 0, moderate: 0, minor: 0, unknown: 0, total: 0, disease: 0, food: 0 };
  for (const e of s.ddinter.entries) {
    if (!chosen.has(e.ddinterId)) continue;
    for (const k of ["major", "moderate", "minor", "unknown", "total"] as const) sum[k] += e.counts[k];
    sum.disease += e.diseaseCount;
    sum.food += e.foodCount;
  }
  return (
    <div className={styles["s-psec"]}>
      {head}
      <h3 className={styles.h3}>{fill(PRODUCT.pairsHeading, { total: sum.total })}</h3>
      <div className={styles["s-sevrow"]}>
        {(["major", "moderate", "minor", "unknown"] as const).filter((k) => sum[k] > 0).map((k) => <Severity key={k} level={k} count={sum[k]} />)}
      </div>
      <div className={styles["s-kv"]}>
        <div><b>{sum.disease}</b>{plural(sum.disease, PRODUCT.diseaseOne, PRODUCT.diseaseMany)}</div>
        <div><b>{sum.food}</b>{plural(sum.food, PRODUCT.foodOne, PRODUCT.foodMany)}</div>
      </div>
      <CheckedAgainst item={item} route={route} />
    </div>
  );
}
```

`web/components/public/OtherApproved.tsx`:

```tsx
import { Fragment } from "react";
import NoDataBlock from "@/components/ui/NoDataBlock";
import PairReviewBracket from "./PairReviewBracket";
import Severity from "@/components/ui/Severity";
import { DESK_NEW, PUBLIC_NEW, UNKNOWN_PAIRS_LINE, fill } from "@/lib/copy";
import type { InteractionNotChecked, InteractionPair, ProductInteractions } from "@/lib/public-types";
import { PRODUCT, plural } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import { severityOf } from "@/lib/severity";
import PublicPairCard, { pairText } from "./PublicPairCard";
import styles from "./product.module.css";

const N = PUBLIC_NEW.otherApproved;
const enc = encodeURIComponent;
const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;
const brandsWord = (k: number) => plural(k, PRODUCT.brandOne, PRODUCT.brandMany);
const joinAnd = (xs: React.ReactNode[]) => xs.map((x, i) => <Fragment key={i}>{i > 0 && (i === xs.length - 1 ? " and " : ", ")}{x}</Fragment>);

/** "With {k} approved brand[s]: {up to 3 names}[ and {n} more]. Action: {actions}" (§6.5). */
function brandsMeta(p: InteractionPair) {
  const shown = p.brands.slice(0, 3).map((b) => b.tradeName);
  const list = shown.length < 2 ? shown.join("") : p.brandCount > 3 ? shown.join(", ") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return fill(p.brandCount > 3 ? N.metaMore : N.meta, { k: p.brandCount, brands: brandsWord(p.brandCount), list, n: p.brandCount - 3,
    actions: p.actions.join(", ") });
}

function AllBrands({ p }: { p: { brands: InteractionPair["brands"]; brandCount: number; partnerSubstance: InteractionPair["partnerSubstance"] } }) {
  return (
    <details>
      <summary>{fill(N.allBrands, { k: p.brandCount })}</summary>
      <ul className={styles.brandList}>
        {p.brands.map((b) => <li key={b.conceptId}><a href={`/products/${enc(b.conceptId)}`}>{b.tradeName}</a></li>)}
      </ul>
      {p.brandCount > p.brands.length && <p>{fill(N.brandsMore, { n: p.brandCount - p.brands.length })}
        {p.partnerSubstance.bdsId && <> <a href={`/substances/${enc(p.partnerSubstance.bdsId)}`}>{fill(N.allBrandsOf, { substance: p.partnerSubstance.name })}</a></>}</p>}
    </details>
  );
}

const isUnclassifiedNoText = (p: InteractionPair) => severityOf(p.severity) === "unknown" && !p.interaction && !p.management;

/** §6.7.3 item 4 line for one partner brand (no_route, not_run, unmapped). */
function otherLine(n: InteractionNotChecked, brand: string): string {
  if (n.reason === "no_route") return n.route
    ? fill(DESK_NEW.routeAware.notCheckedNoRoute, { brand, route: n.route, substance: n.partnerSubstance.name })
    : fill(DESK_NEW.routeAware.notCheckedNoRouteNoRoute, { brand, substance: n.partnerSubstance.name });
  if (n.reason === "not_run") return fill(DESK_NEW.notRun.notCheckedNotRun, { substance: n.partnerSubstance.name, brand });
  return fill(DESK_NEW.routeAware.notCheckedUnmapped, { ingredient: n.partnerSubstance.name, brand });
}

/**
 * §6.5 "With other approved medicines" (D60): approved products of every batch, grouped by partner substance, 20 partner
 * substances a page (?ix=). Unapproved partners are not shown here (the checker names them). "No interaction listed" is
 * dropped from the product page.
 */
export default function OtherApproved({ data, ix, conceptId, subject }:
    { data: ProductInteractions; ix: number; conceptId: string; subject: string }) {
  const href = (page: number) => `/products/${enc(conceptId)}?ix=${page}#with-other`;
  const texted = data.partners.filter((p) => !isUnclassifiedNoText(p));
  const quiet = data.partners.filter(isUnclassifiedNoText);
  const quietBy = new Map<string, InteractionPair[]>();
  for (const p of quiet) quietBy.set(p.substance.name, [...(quietBy.get(p.substance.name) ?? []), p]);
  const noData = data.notChecked.filter((n) => n.reason === "no_data");
  const others = data.notChecked.filter((n) => n.reason !== "no_data");
  const empty = data.totalPartners === 0;
  return (
    <div className={styles["s-psec"]}>
      <h3 id="with-other" className={styles.h3}>{N.heading}</h3>
      {empty && ix === 0 && <p>{fill(N.empty, { substance: subject })}</p>}
      {texted.map((p, i) => (
        <Fragment key={`${p.ddinterA}|${p.ddinterB}`}>
          <PublicPairCard id={`oa-${ix}-${i}`} severity={p.severity} heading="h4" names={`${p.substance.name} + ${p.partnerSubstance.name}`}
            meta={brandsMeta(p)} review={p.pairReview} text={pairText(p)}
            source={fillNodes(PRODUCT.sourceLine, { a: <Mono id={p.ddinterA} />, b: <Mono id={p.ddinterB} /> })} />
          {p.brandCount > 3 && <AllBrands p={p} />}
        </Fragment>
      ))}
      {[...quietBy.entries()].map(([substance, pairs]) => (
        <div key={substance} className={styles["s-panel"]}>
          <div className={styles["s-row"]}><Severity level="unknown" count={pairs.length} /></div>
          <p className={styles["s-panelLead"]}>{fillNodes(N.unclassifiedWith, { substance, partners: joinAnd(pairs.map((p) => (
            <>{p.partnerSubstance.name} <PairReviewBracket review={p.pairReview} /></>))) })}</p>
          <p>{UNKNOWN_PAIRS_LINE}</p>
        </div>
      ))}
      {noData.map((n) => (
        <NoDataBlock key={n.partnerSubstance.name} title={n.partnerSubstance.name} bdsId={n.partnerSubstance.bdsId ?? undefined}
          extra={<p className="nodata-pairs">{fill(N.notCheckedIn, { substance: n.substance.name, partner: n.partnerSubstance.name,
            k: n.brandCount, brands: brandsWord(n.brandCount) })}</p>} />
      ))}
      {others.map((n) => n.brands.map((b) => <p key={`${n.partnerSubstance.name}|${n.reason}|${b.conceptId}`}>{otherLine(n, b.tradeName)}</p>))}
      {(ix > 0 || (ix + 1) * 20 < data.totalPartners) && (
        <p className={styles.pager}>
          {ix > 0 && <a href={href(ix - 1)}>{N.previous}</a>}
          {(ix + 1) * 20 < data.totalPartners && <a href={href(ix + 1)}>{N.more}</a>}
        </p>
      )}
    </div>
  );
}
```

`web/components/public/PairReviewBracket.tsx` (the bracketed state after each partner in the unclassified panel, §6.5):

```tsx
import { PUBLIC_NEW, fill } from "@/lib/copy";
import { fmtDhakaClock } from "@/lib/format";
import type { PublicPairReview } from "@/lib/public-types";

/** "(pair reviewed by a senior pharmacist on {date})" or "(pair not yet reviewed by a senior pharmacist)". Plain text (D53). */
export default function PairReviewBracket({ review }: { review: PublicPairReview }) {
  return <>{review.state === "reviewed" && review.reviewedAt
    ? fill(PUBLIC_NEW.otherApproved.reviewedBracket, { date: fmtDhakaClock(review.reviewedAt).split(" ")[0] })
    : PUBLIC_NEW.otherApproved.notReviewedBracket}</>;
}
```

The pager string `20` is `PublicPairs.PAGE_SIZE` on the API (§6.5 "20 partner substances per page").

- [ ] **Step 5: Compose them in `ProductView`**

After the Codes section in `ProductView`'s main column:

```tsx
        {items.length > 0 && (
          <section className={styles["s-psec"]} aria-labelledby="interactions">
            <div className={styles["s-psec-h"]}><h2 id="interactions" className={styles.h2}>{PRODUCT.interactions}</h2></div>
            {items.map((i) => <SubstanceInteractions key={i.bdsId} item={i} route={product.clinicalDrug?.route ?? null} />)}
            {props.interactions && <OtherApproved data={props.interactions} ix={props.ix} conceptId={product.conceptId}
              subject={crumb(product)?.label ?? product.tradeName} />}
          </section>
        )}
```

(imports `SubstanceInteractions`, `OtherApproved`, and `crumb` from `./ProductHeader`).

- [ ] **Step 6: Run the tests**

Run: `cd web && npx vitest run tests/public-pair-card.test.tsx tests/product-page.test.tsx tests/copy.test.ts tests/marks.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/components/public/PublicPairCard.tsx web/components/public/pair.module.css web/components/public/SubstanceInteractions.tsx \
  web/components/public/OtherApproved.tsx web/components/public/PairReviewBracket.tsx web/components/public/ProductView.tsx \
  web/lib/ddinter-text.ts web/tests/public-pair-card.test.tsx web/tests/product-page.test.tsx
git commit -m "feat(web): product interactions by substance and With other approved medicines across batches, labelled and paged (§6.5, D53, D60)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Product page, part 3: automated checks, the aside and Report a problem (§6.5 item 7, aside)

**Files:**
- Create: `web/components/public/AutomatedChecks.tsx`, `web/components/public/ProductAside.tsx`, `web/components/public/ReportProblem.tsx`
- Modify: `web/components/public/ProductView.tsx`
- Test: `web/tests/product-page.test.tsx` (append)

**Interfaces:**
- Consumes: `StageCheck`, `STAGE_NAME` (P1B), `PRODUCT`, `PUBLIC_NEW.productPage`, `NO_PHI_HELP`, `Field`, `Button`, `TurnstileField`, `SourceLink`, `ReviewStatus`; `flagAction` (`lib/review-actions.ts`), `FLAG_MESSAGE_MIN/MAX`; `fmtDhakaTime`, `fmtDhakaClock`; `DESK.sendReport`.
- Produces: `AutomatedChecks({ stages })`; `ProductAside({ product, brands, session, flag, siteKey, nonce })`; `ReportProblem({ conceptId, session, outcome, siteKey, nonce })` (replaces `FlagForm` on the product page; its outcome messages are FlagForm's map, unchanged, §6.5); `FLAG_OUTCOME` (moved from `FlagForm.tsx`).

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/product-page.test.tsx`:

```tsx
describe("approved product (§6.5 item 7 and the aside)", () => {
  it("automated checks: four cards, the subtitle, No pipeline note on OK, and the public text-missing list", async () => {
    const html = await renderProduct();
    expect(html).toContain("3 OK, 1 Warning. Notes are the pipeline&#x27;s own.");
    expect(html.match(/class="stage stage--ok"/g)).toHaveLength(3);
    expect(html).toContain("No pipeline note.");
    expect(html).toContain("DDInter text not found for 1 pair:");
    expect(html).toContain('<li class="stage-pair">Metformin + Acetaminophen <span class="mono">DDInter1164/DDInter14</span></li>');
    expect(html).not.toContain("sev sev--unclassified\">Severity not classified by DDInter</span></li>");
  });

  it("the verification card with its date and the P1C re-run sentence; other brands; where from with the DGDA source link", async () => {
    const html = await renderProduct();
    expect(html).toContain("A pharmacist compared this record with the DGDA register on 14/10/2026. Decision history shows roles, not names.");
    expect(html).toContain("If the pipeline changes data this approval covered, Napa goes back to review and leaves public view until it is approved again.");
    expect(html).not.toContain("If the pipeline re-runs");
    expect(html).toContain('No other approved brand maps to <span class="mono">BDC-000001</span> yet.');
    expect(html).toContain("DGDA register (OCL)");
    expect(html).toContain("12/10/2026 03:28 Dhaka time");
    expect(html).toContain("<dd>3 OK, 1 Warning</dd>");
    expect(html).toContain('href="/check?ids=186-0030-006--napa">Check Napa with other medicines</a>');
  });

  it("other brands of the clinical drug, without the product itself", async () => {
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, otherBrandsCount: 1 } });
    getClinicalDrug.mockResolvedValue({ ok: true, data: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet",
      route: "systemic", ingredients: [], products: [{ conceptId: NAPA.conceptId, tradeName: "Napa", company: "Beximco", darNumber: "186-0030-006" },
        { conceptId: "ACE-1", tradeName: "Ace", company: "Square Pharmaceuticals", darNumber: "001-0001-001" }] } });
    const html = await renderProduct();
    expect(html).toContain("Other brands of Acetaminophen 500 mg tablet");
    expect(html).toContain('<a href="/products/ACE-1">Ace</a>');
    expect(html).not.toContain('<a href="/products/186-0030-006--napa">Napa</a>');
  });

  it("Report a problem: a sign-in link for anonymous readers; a labelled field with the no-PHI help and the bot check when signed in", async () => {
    const anon = await renderProduct();
    expect(anon).toContain("<summary");
    expect(anon).toContain("Report a problem with this record");
    expect(anon).toContain('href="/signin?returnTo=%2Fproducts%2F186-0030-006--napa">Sign in to report a problem</a>');
    getSession.mockResolvedValue({ email: "reader@example.org", role: "user" });
    const html = await renderProduct(NAPA.conceptId, { flag: "sent" });
    expect(html).toContain("What&#x27;s wrong? The IntelliDrugs team reads this.");
    expect(html).toContain("5 to 2000 characters. Don&#x27;t include patient names or other personal health details.");
    expect(html).toContain('name="targetType" value="product"');
    expect(html).toMatch(/minlength="5"/i);
    expect(html).toMatch(/maxlength="2000"/i);
    expect(html).toContain(">Send report</button>");
    expect(html).toContain("Thank you. Your flag was sent to the reviewers.");
    expect(html).not.toContain("reader@example.org");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/product-page.test.tsx`
Expected: FAIL (no checks section, no aside).

- [ ] **Step 3: Write the components**

`web/components/public/AutomatedChecks.tsx`:

```tsx
import StageCheck from "@/components/ui/StageCheck";
import { fill } from "@/lib/copy";
import type { PublicStage } from "@/lib/public-types";
import { PRODUCT, plural } from "@/lib/public-copy";
import { STAGE_NAME } from "@/lib/review-copy";
import styles from "./product.module.css";

const ORDER = ["dgda", "substances", "clinical", "ddinter"] as const;

/** §6.5 item 7. Notes are the pipeline's own; the text-missing list holds public pairs only (Review Focus 1, P2a Task 3). */
export default function AutomatedChecks({ stages }: { stages: PublicStage[] }) {
  const ordered = ORDER.flatMap((k) => stages.filter((s) => s.stage === k));
  const ok = ordered.filter((s) => s.status === "ok").length, w = ordered.filter((s) => s.status === "warn").length;
  return (
    <section className={styles["s-psec"]} aria-labelledby="checks">
      <div className={styles["s-psec-h"]}>
        <h2 id="checks" className={styles.h2}>{PRODUCT.checks}</h2>
        <span>{fill(PRODUCT.checksSub, { ok, w, warnings: plural(w, PRODUCT.warningOne, PRODUCT.warningMany) })}</span>
      </div>
      <div className={styles["s-stages"]}>
        {ordered.map((s) => (
          <StageCheck key={s.stage} name={STAGE_NAME[s.stage]} status={s.status}>
            {s.notes.map((n, i) => <p key={i} className="stage-note">{n.text}</p>)}
            {s.status === "ok" && s.notes.length === 0 && <p className="stage-note">{PRODUCT.noNote}</p>}
            {s.textMissing.length > 0 && <>
              <p className="stage-note">{fill(PRODUCT.textMissing, { n: s.textMissing.length, pairs: plural(s.textMissing.length, PRODUCT.pairOne, PRODUCT.pairMany) })}</p>
              <ul className="stage-pairs">
                {s.textMissing.map((t) => <li key={`${t.ddinterA}|${t.ddinterB}`} className="stage-pair">{t.nameA} + {t.nameB} <span className="mono">{t.ddinterA}/{t.ddinterB}</span></li>)}
              </ul>
            </>}
          </StageCheck>
        ))}
      </div>
    </section>
  );
}
```

`web/components/public/ReportProblem.tsx`:

```tsx
import TurnstileField from "@/components/TurnstileField";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { FLAG_MESSAGE_MAX, FLAG_MESSAGE_MIN } from "@/lib/actions-core";
import { NO_PHI_HELP, PUBLIC_NEW } from "@/lib/copy";
import { PRODUCT } from "@/lib/public-copy";
import { DESK } from "@/lib/review-copy";
import { flagAction } from "@/lib/review-actions";
import type { Session } from "@/lib/session";

/** FlagForm's outcome messages, unchanged (§6.5: "Outcome messages are the existing FlagForm map"). Anything else is ignored. */
export const FLAG_OUTCOME: Record<string, string> = {
  sent: "Thank you. Your flag was sent to the reviewers.",
  forbidden: "Sign in to flag a problem.",
  captcha: "The verification check failed. Please try again.",
  invalid: `A flag needs a message of ${FLAG_MESSAGE_MIN} to ${FLAG_MESSAGE_MAX} characters.`,
  failed: "The flag could not be sent. Please try again.",
};
const TURNSTILE_OFF = "Verification is not configured, so this action is disabled.";

/**
 * §6.5 "Report a problem": a <details>; signed in, the labelled field (5–2000 characters, NO_PHI_HELP), the bot check
 * (action flag) and "Send report"; anonymous, a sign-in link back to this page. The email comes from the session in the
 * server action, never from the form.
 */
export default function ReportProblem({ conceptId, session, outcome, siteKey, nonce }:
    { conceptId: string; session: Session | null; outcome?: string; siteKey: string | null; nonce?: string }) {
  const message = outcome ? FLAG_OUTCOME[outcome] : undefined;
  return (
    <div id="flag">
      {message && <p role={outcome === "sent" ? "status" : "alert"}>{message}</p>}
      <details open={outcome !== undefined && outcome !== "sent" ? true : undefined}>
        <summary>{PRODUCT.report}</summary>
        {session ? (
          <form action={flagAction}>
            <input type="hidden" name="targetType" value="product" />
            <input type="hidden" name="targetId" value={conceptId} />
            <Field id="report-message" label={PUBLIC_NEW.productPage.reportLabel}
              control={<textarea className="textarea" name="message" required minLength={FLAG_MESSAGE_MIN} maxLength={FLAG_MESSAGE_MAX} rows={4} />}
              help={`${PUBLIC_NEW.productPage.reportHelp} ${NO_PHI_HELP}`} />
            {siteKey ? <TurnstileField siteKey={siteKey} action="flag" nonce={nonce} /> : <p role="alert">{TURNSTILE_OFF}</p>}
            <Button variant="primary" type="submit">{DESK.sendReport}</Button>
          </form>
        ) : (
          <p><a href={`/signin?${new URLSearchParams({ returnTo: `/products/${conceptId}` })}`}>{PUBLIC_NEW.productPage.signInToReport}</a></p>
        )}
      </details>
    </div>
  );
}
```

`web/components/public/ProductAside.tsx`:

```tsx
import { buttonClass } from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import SourceLink from "@/components/ui/SourceLink";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import { fmtDhakaClock, fmtDhakaTime } from "@/lib/format";
import type { ClinicalDrugView, PublicProduct } from "@/lib/public-types";
import { PRODUCT } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import ReportProblem from "./ReportProblem";
import styles from "./product.module.css";

const enc = encodeURIComponent;

/** §6.5 aside: verification, other brands of the clinical drug, where the record comes from, the checker link, Report a problem. */
export default function ProductAside({ product: p, brands, session, flag, siteKey, nonce }: {
  product: PublicProduct; brands: ClinicalDrugView["products"] | null; session: Session | null; flag?: string; siteKey: string | null; nonce?: string;
}) {
  const approvedDate = p.verification.approvedAt ? fmtDhakaClock(p.verification.approvedAt).split(" ")[0] : null;
  const others = (brands ?? []).filter((b) => b.conceptId !== p.conceptId);
  const stages = p.provenance.stages;
  const ok = stages.filter((s) => s.status === "ok").length, w = stages.filter((s) => s.status === "warn").length;
  return (
    <aside className={styles["s-aside"]} aria-label={PRODUCT.asideLabel}>
      <div className={styles["s-card"]}>
        <h2>{PRODUCT.verification}</h2>
        <span className={styles.fit}><ReviewStatus status="approved" /></span>
        {approvedDate && <p>{fill(PRODUCT.verifiedText, { date: approvedDate })}</p>}
        <p>{fill(PUBLIC_NEW.productPage.verificationRerun, { brand: p.tradeName })}</p>
      </div>
      {p.clinicalDrug && (
        <div className={styles["s-card"]}>
          <h2>{fill(PRODUCT.otherBrands, { name: p.clinicalDrug.displayName })}</h2>
          {others.length > 0 ? (
            <ul className={styles.brandList}>
              {others.map((b) => <li key={b.conceptId}><a href={`/products/${enc(b.conceptId)}`}>{b.tradeName}</a> {b.company} <span className="mono">DAR {b.darNumber}</span></li>)}
            </ul>
          ) : (
            <p>{fillNodes(PUBLIC_NEW.productPage.noOtherBrand, { bdcId: <span className="mono">{p.clinicalDrug.bdcId}</span> })}</p>
          )}
        </div>
      )}
      <div className={styles["s-card"]}>
        <h2>{PRODUCT.whereFrom}</h2>
        <dl>
          <dt>{PRODUCT.dlSource}</dt>
          <dd>{p.provenance.sourceLink
            ? <SourceLink url={p.provenance.sourceLink.url} label={p.provenance.sourceLink.label} fetchedAt={p.provenance.sourceLink.fetchedAt} />
            : PRODUCT.dgdaRegister}</dd>
          <dt>{PRODUCT.dlConcept}</dt><dd className="mono">{p.conceptId}</dd>
          {p.provenance.extractedAt && <><dt>{PRODUCT.dlExtracted}</dt><dd>{fmtDhakaTime(p.provenance.extractedAt)}</dd></>}
          {p.provenance.batchId && <><dt>{PRODUCT.dlBatch}</dt><dd className="mono">{p.provenance.batchId}</dd></>}
          <dt>{PRODUCT.dlChecks}</dt><dd>{fill(PRODUCT.checksValue, { ok, w })}</dd>
        </dl>
      </div>
      <a className={buttonClass("primary")} href={`/check?${new URLSearchParams({ ids: p.conceptId })}`}>{fill(PRODUCT.checkWith, { brand: p.tradeName })}</a>
      <ReportProblem conceptId={p.conceptId} session={session} outcome={flag} siteKey={siteKey} nonce={nonce} />
    </aside>
  );
}
```

`ProductView.tsx`: after the Interactions section, the main column ends with `<AutomatedChecks stages={product.provenance.stages} />`, and after the main column `<div>` comes `<ProductAside product={product} brands={props.brands} session={props.session} flag={props.flag} siteKey={props.siteKey} nonce={props.nonce} />`.

The verification card says "on {DD/MM/YYYY}" (§6.5), so it takes only the date part of the Dhaka time; the verification line under the h1 keeps the time ("on 14/10/2026, 11:20 Dhaka time").

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/product-page.test.tsx tests/copy.test.ts tests/client-islands.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/public/AutomatedChecks.tsx web/components/public/ProductAside.tsx web/components/public/ReportProblem.tsx \
  web/components/public/ProductView.tsx web/tests/product-page.test.tsx
git commit -m "feat(web): product checks, verification card (P1C sentence), other brands, provenance with source link, Report a problem (§6.5)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: The substance page (`/substances/[id]`, §6.6)

**Files:**
- Rewrite: `web/app/substances/[id]/page.tsx`
- Create: `web/components/public/SubstanceView.tsx`
- Modify: `web/components/public/ProductStub.tsx` (`SubstanceStubView`), `web/components/public/product.module.css`
- Test: `web/tests/substance-page.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `getPublicSubstance`, `getSubstanceInteractions`, `isStub` (Task 17); `parseIndex`, `parseSeverity` (Task 18); `StubLayout`, `CodesRows`, `groupNames`, `PublicPairCard`, `pairText` (Tasks 23–25); `SUBSTANCE`, `PRODUCT`, `STUB`; `DESK.dataFound`, `DESK.noDataLine`, `DESK_NEW.reviewLists.nextPage/previousPage`; `NO_DATA_SENTENCE` (through `NoDataBlock`), `NOT_RUN`, `SEVERITY_NOT_CLASSIFIED`; `Severity`, `Expander`.
- Produces: `SubstanceStubView({ stub })`; `SubstanceView({ s, list, severity, page })` where `list: SubstanceInteractions | null`.

- [ ] **Step 1: Write the failing test**

`web/tests/substance-page.test.tsx` (whole file):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSubstance, SubstanceInteractions } from "@/lib/public-types";

const getPublicSubstance = vi.fn(), getSubstanceInteractions = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicSubstance: (id: string) => getPublicSubstance(id),
  getSubstanceInteractions: (id: string, sev: string | null, p: number) => getSubstanceInteractions(id, sev, p) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
import SubstancePage from "@/app/substances/[id]/page";

const WARFARIN: PublicSubstance = {
  bdsId: "BDS-000003", preferredName: "Warfarin",
  names: [{ name: "Warfarin", nameType: "icd11", source: "dgda-ocl" }, { name: "Warfarin Sodium", nameType: "dgda_content", source: "dgda-ocl" }],
  codes: [{ system: "ATC", code: "B01AA03", routeScope: "any", source: "rxnav", method: "rxnav-exact", confidence: 1,
      sourceLink: { url: "https://atcddd.fhi.no/atc_ddd_index/?code=B01AA03&showdescription=no", label: "WHO ATC/DDD Index", fetchedAt: "2026-10-11T22:05:00Z" } },
    { system: "DDINTER", code: "DDInter1951", routeScope: "systemic", source: "ddinter2", method: "drugbank", confidence: 1, sourceLink: null }],
  coverage: { coverage: "full", note: "" },
  products: [{ conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", company: "Gonoshasthaya" }],
  diseases: [{ diseaseName: "Bleeding", severity: "major", text: "Warfarin increases bleeding risk.", interactionId: "D1", routeScope: "systemic" }],
  foods: [{ food: "Vitamin K rich foods", severity: "moderate", description: "Vitamin K reduces the effect.", management: "Keep intake steady.", interactionId: "F1", routeScope: "systemic" }],
  entries: [{ ddinterId: "DDInter1951", name: "Warfarin", routeScope: "systemic", counts: { major: 1, moderate: 2, minor: 1, unknown: 1, total: 5 },
    diseaseCount: 1, foodCount: 1, sourceLink: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: null } }],
  clinicalDrugs: [{ bdcId: "BDC-000003", displayName: "Warfarin 5 mg tablet" }],
};
const LIST: SubstanceInteractions = { bdsId: "BDS-000003", counts: WARFARIN.entries, total: 25, page: 0, size: 20, items: [
  { partnerName: "Acetylsalicylic acid", partnerBdsId: null, ddinterA: "DDInter1951", ddinterB: "DDInter20", routeScope: "systemic",
    severity: "major", actions: ["synergy"], interaction: "Raises bleeding risk.", management: "Avoid unless needed.",
    pairReview: { state: "not_reviewed", reviewedAt: null }, sourceUrl: "https://ddinter2.scbdd.com/server/interact/3039/" },
  { partnerName: "Acetaminophen", partnerBdsId: "BDS-000001", ddinterA: "DDInter14", ddinterB: "DDInter1951", routeScope: "systemic",
    severity: "moderate", actions: ["synergy"], interaction: null, management: null,
    pairReview: { state: "reviewed", reviewedAt: "2026-10-16T05:20:00Z" }, sourceUrl: null }] };

const render = async (sp: Record<string, string> = {}, id = "BDS-000003") =>
  renderToStaticMarkup(await SubstancePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  getPublicSubstance.mockReset(); getPublicSubstance.mockResolvedValue({ ok: true, data: WARFARIN });
  getSubstanceInteractions.mockReset(); getSubstanceInteractions.mockResolvedValue({ ok: true, data: LIST });
});

describe("/substances/[id] (§6.6)", () => {
  it("crumb, h1 with the BDS id, names, codes with source links, neutral coverage, entry counts", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Warfarin <span class="mono">BDS-000003</span></h1>');
    expect(html).toContain("<li>Warfarin Sodium <span>DGDA register</span></li>");
    expect(html).toContain('href="https://atcddd.fhi.no/atc_ddd_index/?code=B01AA03&amp;showdescription=no"');
    expect(html).toContain("drugbank, confidence 1.0, systemic");
    expect(html).toContain("<p>Interaction data found</p>");
    expect(html).not.toContain("rv--approved\">Interaction");
    expect(html).toContain('<span class="mono">DDInter1951</span> (systemic)');
  });

  it("drug–drug pairs with the label, review state, DDInter link, unlinked private partners, and paging", async () => {
    const html = await render();
    expect(getSubstanceInteractions).toHaveBeenCalledWith("BDS-000003", null, 0);
    expect(html).toContain("Drug–drug interactions");
    expect(html).toContain("Warfarin + Acetylsalicylic acid");
    expect(html).not.toContain('href="/substances/null"');
    expect(html).toContain('<a href="/substances/BDS-000001">Acetaminophen</a>');
    expect(html).toContain("From DDInter 2.0");
    expect(html).toContain("Pair not yet reviewed by a senior pharmacist");
    expect(html).toContain('href="https://ddinter2.scbdd.com/server/interact/3039/"');
    expect(html).toContain("Full record in DDInter 2.0");
    expect(html).toContain('href="/substances/BDS-000003?page=1#pairs">Next page</a>');
  });

  it("the severity filter is a set of GET links with the current one marked (Review Focus 5: unknown values read as All)", async () => {
    const html = await render({ severity: "major" });
    expect(getSubstanceInteractions).toHaveBeenLastCalledWith("BDS-000003", "major", 0);
    expect(html).toContain('aria-current="page" href="/substances/BDS-000003?severity=major#pairs">Major</a>');
    expect(html).toContain('href="/substances/BDS-000003?severity=unknown#pairs">Severity not classified by DDInter</a>');
    await render({ severity: "fatal", page: "-3" });
    expect(getSubstanceInteractions).toHaveBeenLastCalledWith("BDS-000003", null, 0);
  });

  it("disease and food lists with truncated text; approved products and clinical drugs", async () => {
    const html = await render();
    expect(html).toContain("Drug–disease");
    expect(html).toContain("Warfarin increases bleeding risk.");
    expect(html).toContain("Drug–food");
    expect(html).toContain("Keep intake steady.");
    expect(html).toContain('<a href="/products/185-0138-012--g-warfarin">G Warfarin</a>');
    expect(html).toContain("Warfarin 5 mg tablet");
  });

  it("no data: the hatch block and no pair list; not run: NOT_RUN and never the no-data sentence", async () => {
    getPublicSubstance.mockResolvedValue({ ok: true, data: { ...WARFARIN, coverage: { coverage: "none", note: "" }, entries: [] } });
    const none = await render();
    expect(none).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(none).not.toContain("Drug–drug interactions");
    expect(getSubstanceInteractions).not.toHaveBeenCalled();
    getPublicSubstance.mockResolvedValue({ ok: true, data: { ...WARFARIN, coverage: { coverage: "not_run", note: "" }, entries: [] } });
    const nr = await render();
    expect(nr).toContain("Not checked yet: DDInter mapping has not run");
    expect(nr).not.toContain("No interaction data in DDInter for this substance");
  });

  it("a substance that is not public is the stub; unknown is not found", async () => {
    getPublicSubstance.mockResolvedValue({ ok: true, data: { bdsId: "BDS-000002", preferredName: "Aspirin", hidden: true } });
    const html = await render({}, "BDS-000002");
    expect(html).toContain(">Aspirin</h1>");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).toContain("hides its codes and interactions");
    expect(html).not.toContain("is in review in batch");
    getPublicSubstance.mockResolvedValue({ ok: false, status: 404 });
    await expect(render({}, "BDS-999999")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/substance-page.test.tsx`
Expected: FAIL (the page still uses the old `getSubstance`).

- [ ] **Step 3: Write the stub view, the substance view and the page**

Append to `web/components/public/ProductStub.tsx`:

```tsx
import type { SubstanceStub } from "@/lib/public-types";

/** §6.4: "The same pattern applies to substance stubs: "…hides its codes and interactions…", with no batch sentence." */
export function SubstanceStubView({ stub }: { stub: SubstanceStub }) {
  return <StubLayout name={stub.preferredName} id={stub.bdsId}><p>{STUB.substancePending}</p></StubLayout>;
}
```

`web/components/public/SubstanceView.tsx`:

```tsx
import Expander from "@/components/Expander";
import NoDataBlock from "@/components/ui/NoDataBlock";
import Severity from "@/components/ui/Severity";
import SourceLink from "@/components/ui/SourceLink";
import pc from "@/components/ui/PairCard.module.css";
import { DESK_NEW, NOT_RUN, SEVERITY_NOT_CLASSIFIED, fill } from "@/lib/copy";
import type { PublicSubstance, SeverityFilter, SubstanceInteractionItem, SubstanceInteractions } from "@/lib/public-types";
import { PRODUCT, SUBSTANCE } from "@/lib/public-copy";
import { DESK, fillNodes } from "@/lib/review-copy";
import { CodesRows } from "./CodesTable";
import PublicPairCard, { TRUNCATE_AT, pairText } from "./PublicPairCard";
import { groupNames } from "./WhatsInIt";
import styles from "./product.module.css";

const enc = encodeURIComponent;
const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;
const FILTERS: [SeverityFilter | null, string][] = [[null, SUBSTANCE.filterAll], ["major", "Major"], ["moderate", "Moderate"],
  ["minor", "Minor"], ["unknown", SEVERITY_NOT_CLASSIFIED]];

function href(bdsId: string, severity: SeverityFilter | null, page: number) {
  const p = new URLSearchParams();
  if (severity) p.set("severity", severity);
  if (page > 0) p.set("page", String(page));
  const q = p.toString();
  return `/substances/${enc(bdsId)}${q ? `?${q}` : ""}#pairs`;
}

/** A disease or food line: name, chip and DDInter's text, clamped by the Expander once JavaScript runs (§6.6). */
function TextLine({ id, name, severity, text }: { id: string; name: string; severity: string; text: string | null }) {
  return (
    <li className={styles["s-panel"]}>
      <p className={styles["s-row"]}><b>{name}</b> <Severity level={severity} /></p>
      {text && <p className={`pair-text ${pc.open}`} id={id}>{text}</p>}
      {text && text.length > TRUNCATE_AT && <p className="pair-source"><Expander targetId={id} label="public" /></p>}
    </li>
  );
}

function Pair({ s, item, i }: { s: PublicSubstance; item: SubstanceInteractionItem; i: number }) {
  const mine = new Set(s.entries.map((e) => e.ddinterId));
  const myId = mine.has(item.ddinterA) ? item.ddinterA : item.ddinterB;
  const partnerId = myId === item.ddinterA ? item.ddinterB : item.ddinterA;
  const partner = item.partnerBdsId ? <a href={`/substances/${enc(item.partnerBdsId)}`}>{item.partnerName}</a> : item.partnerName;
  return (
    <PublicPairCard id={`sp-${i}`} severity={item.severity} heading="h3" names={<>{s.preferredName} + {partner}</>}
      meta={fillNodes(SUBSTANCE.pairMeta, { a: <Mono id={myId} />, route: item.routeScope, b: <Mono id={partnerId} />, actions: item.actions.join(", ") })}
      review={item.pairReview} text={pairText(item)}
      source={fillNodes(PRODUCT.sourceLine, { a: <Mono id={item.ddinterA} />, b: <Mono id={item.ddinterB} /> })}
      link={item.sourceUrl ? { url: item.sourceUrl, label: SUBSTANCE.fullRecord, fetchedAt: null } : null} />
  );
}

/** §6.6: built from the product-page components only. Coverage full is neutral text, never green. */
export default function SubstanceView({ s, list, severity, page }:
    { s: PublicSubstance; list: SubstanceInteractions | null; severity: SeverityFilter | null; page: number }) {
  const cov = s.coverage.coverage;
  const codes = s.codes.map((c) => ({ ...c, source: c.sourceLink }));
  return (
    <div className={styles.single}>
      <div>
        <nav aria-label={PRODUCT.crumbLabel}><p className={styles["s-crumb"]}><a href="/search">{PRODUCT.crumbRoot}</a><span aria-hidden="true">/</span><span>{s.preferredName}</span></p></nav>
        <h1 className={styles.h1}>{s.preferredName} <span className="mono">{s.bdsId}</span></h1>
      </div>
      {s.names.length > 0 && (
        <ul className={styles["s-names"]} aria-label={PRODUCT.namesLabel}>
          {groupNames(s.names.map((n) => ({ name: n.name, type: n.nameType, source: n.source }))).map(([name, sources]) => <li key={name}>{name} <span>{sources}</span></li>)}
        </ul>
      )}
      <section className={styles["s-psec"]} aria-labelledby="codes">
        <div className={styles["s-psec-h"]}><h2 id="codes" className={styles.h2}>{PRODUCT.codes}</h2></div>
        <div className={styles["s-tw"]} tabIndex={0} role="region" aria-label={fill(PRODUCT.codesRegion, { name: s.preferredName })}>
          <table className={styles["s-table"]}>
            <caption className="sr-only">{fill(PRODUCT.codesCaption, { name: s.preferredName })}</caption>
            <thead><tr><th scope="col">{PRODUCT.colSystem}</th><th scope="col">{PRODUCT.colCode}</th><th scope="col">{PRODUCT.colWhat}</th>
              <th scope="col">{PRODUCT.colHow}</th><th scope="col">{PRODUCT.colSource}</th></tr></thead>
            <tbody><CodesRows codes={codes} chosen={null} coverage={cov} route={null} /></tbody>
          </table>
        </div>
      </section>
      <section className={styles["s-psec"]} aria-labelledby="entries">
        <div className={styles["s-psec-h"]}><h2 id="entries" className={styles.h2}>{SUBSTANCE.entriesHeading}</h2></div>
        {cov === "full" && <p>{DESK.dataFound}</p>}
        {cov === "none" && <NoDataBlock title={s.preferredName} bdsId={s.bdsId} extra={<p className="nodata-text">{DESK.noDataLine}</p>} />}
        {cov === "not_run" && <p>{NOT_RUN}</p>}
        {cov === "full" && s.entries.map((e) => (
          <div key={e.ddinterId} className={styles["s-row"]}>
            <span>{fillNodes(SUBSTANCE.entryLine, { id: <Mono id={e.ddinterId} />, route: e.routeScope })}</span>
            {(["major", "moderate", "minor", "unknown"] as const).filter((k) => e.counts[k] > 0).map((k) => <Severity key={k} level={k} count={e.counts[k]} />)}
            {e.sourceLink && <SourceLink url={e.sourceLink.url} label={e.sourceLink.label} fetchedAt={e.sourceLink.fetchedAt} />}
          </div>
        ))}
      </section>
      {cov === "full" && (
        <section className={styles["s-psec"]} aria-labelledby="pairs">
          <div className={styles["s-psec-h"]}><h2 id="pairs" className={styles.h2}>{SUBSTANCE.ddHeading}</h2></div>
          <nav aria-label={SUBSTANCE.filterLabel}>
            <p className={styles.filters}>
              {FILTERS.map(([value, label]) => (
                <a key={label} aria-current={value === severity ? "page" : undefined} href={href(s.bdsId, value, 0)}>{label}</a>
              ))}
            </p>
          </nav>
          {list && list.items.length === 0 && <p>{SUBSTANCE.noneListed}</p>}
          {list?.items.map((item, i) => <Pair key={`${item.ddinterA}|${item.ddinterB}|${i}`} s={s} item={item} i={i} />)}
          {list && (page > 0 || (page + 1) * list.size < list.total) && (
            <p className={styles.pager}>
              {page > 0 && <a href={href(s.bdsId, severity, page - 1)}>{DESK_NEW.reviewLists.previousPage}</a>}
              {(page + 1) * list.size < list.total && <a href={href(s.bdsId, severity, page + 1)}>{DESK_NEW.reviewLists.nextPage}</a>}
            </p>
          )}
        </section>
      )}
      {cov === "full" && (
        <section className={styles["s-psec"]} aria-labelledby="diseases">
          <div className={styles["s-psec-h"]}><h2 id="diseases" className={styles.h2}>{SUBSTANCE.diseaseHeading}</h2></div>
          {s.diseases.length === 0 ? <p>{SUBSTANCE.noneListed}</p> : (
            <ul className={styles.brandList}>{s.diseases.map((d, i) => <TextLine key={`${d.interactionId}|${d.routeScope}`} id={`dis-${i}`} name={d.diseaseName} severity={d.severity} text={d.text} />)}</ul>
          )}
        </section>
      )}
      {cov === "full" && (
        <section className={styles["s-psec"]} aria-labelledby="foods">
          <div className={styles["s-psec-h"]}><h2 id="foods" className={styles.h2}>{SUBSTANCE.foodHeading}</h2></div>
          {s.foods.length === 0 ? <p>{SUBSTANCE.noneListed}</p> : (
            <ul className={styles.brandList}>{s.foods.map((f, i) => <TextLine key={`${f.interactionId}|${f.routeScope}`} id={`food-${i}`} name={f.food} severity={f.severity} text={f.management ?? f.description} />)}</ul>
          )}
        </section>
      )}
      <section className={styles["s-psec"]} aria-labelledby="products">
        <div className={styles["s-psec-h"]}><h2 id="products" className={styles.h2}>{SUBSTANCE.productsHeading}</h2></div>
        <ul className={styles.brandList}>{s.products.map((p) => <li key={p.conceptId}><a href={`/products/${enc(p.conceptId)}`}>{p.tradeName}</a> {p.company}</li>)}</ul>
      </section>
      {s.clinicalDrugs.length > 0 && (
        <section className={styles["s-psec"]} aria-labelledby="clinical">
          <div className={styles["s-psec-h"]}><h2 id="clinical" className={styles.h2}>{SUBSTANCE.clinicalHeading}</h2></div>
          <ul className={styles.brandList}>{s.clinicalDrugs.map((c) => <li key={c.bdcId}>{c.displayName} <span className="mono">{c.bdcId}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
```

Add to `web/components/public/product.module.css`:

```css
.single { display: flex; flex-direction: column; gap: 32px; max-width: 960px; margin: 0 auto; padding: 28px 40px 48px; }
.filters { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.filters a[aria-current="page"] { font-weight: 600; color: var(--fg); }
@media (max-width: 720px) { .single { padding: 24px 16px 40px; } }
```

`web/app/substances/[id]/page.tsx` (whole file):

```tsx
import { notFound } from "next/navigation";
import { SubstanceStubView } from "@/components/public/ProductStub";
import SubstanceView from "@/components/public/SubstanceView";
import { getPublicSubstance, getSubstanceInteractions, isStub } from "@/lib/api";
import type { PublicSubstance, SubstanceInteractions, SubstanceStub } from "@/lib/public-types";
import { parseIndex, parseSeverity } from "@/lib/public-params";
export const dynamic = "force-dynamic";

/** §6.6. Public scope for every session (§2.2). A bad severity or page reads as All or the first page (Review Focus 5). */
export default async function SubstancePage({ params, searchParams }: {
    params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const r = await getPublicSubstance(decoded);
  if (!r.ok && r.status === 404) notFound();
  if (!r.ok) throw new Error(`substance read failed (${r.status})`);
  if (isStub(r.data)) return <SubstanceStubView stub={r.data as SubstanceStub} />;
  const s = r.data as PublicSubstance;
  const severity = parseSeverity(sp.severity), page = parseIndex(sp.page);
  const list = s.coverage.coverage === "full" ? await getSubstanceInteractions(s.bdsId, severity, page).catch(() => null) : null;
  return <SubstanceView s={s} list={list?.ok && !isStub(list.data) ? (list.data as SubstanceInteractions) : null} severity={severity} page={page} />;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/substance-page.test.tsx tests/copy.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/substances/[id]/page.tsx web/components/public/SubstanceView.tsx web/components/public/ProductStub.tsx \
  web/components/public/product.module.css web/tests/substance-page.test.tsx
git commit -m "feat(web): substance page with names, linked codes, entry counts, labelled pairs with DDInter links, stub (§6.6)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 28: The checker's summary sentence and count chips (`lib/check-summary.ts`, §6.7.2)

**Files:**
- Create: `web/lib/check-summary.ts`
- Test: `web/tests/check-summary.test.ts`

**Interfaces:**
- Consumes: `CheckResult` (Task 17), `PUBLIC_NEW.checker`, `CHECK` (words), `fill`.
- Produces (pure, client-safe): `summarySentence(r: CheckResult | null, m: number): string` (`m` = selected medicines, unknown ids already dropped); `medicinesOnly(m: number): string` (the first segment, for a failed check); `countChips(r: CheckResult): { severities: ["major"|"moderate"|"minor"|"unknown", number][]; noData: number; other: number }`; `noDataNames(r): string[]`; `joinAnd(xs: string[]): string`.

The web only formats; the API counts (§6.7.2: "computed by the API, §7.4; the web only formats"). `{nd}` counts not-checked pairs with reason `no_data`; `{other}` = `notCheckedPairs − nd`; same-product pairs are listed but in no count.

- [ ] **Step 1: Write the failing test**

`web/tests/check-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countChips, joinAnd, medicinesOnly, summarySentence } from "@/lib/check-summary";
import type { CheckResult, Side } from "@/lib/public-types";
import { emptyCheck } from "./fixtures/public";

const side = (conceptId: string, tradeName: string, name: string, bdsId: string | null = "BDS-x"): Side =>
  ({ conceptId, tradeName, bdsId, name, routeScope: null });
const summary = (over: Partial<CheckResult["summary"]>) => ({ ...emptyCheck().summary, ...over });

describe("summary sentence (§6.7.2, §11.1 check-summary)", () => {
  it("fewer than 2 medicines", () => {
    expect(summarySentence(null, 0)).toBe("Add at least 2 medicines to check them against each other.");
    expect(summarySentence(null, 1)).toBe("Add at least 2 medicines to check them against each other.");
  });

  it("the base sentence with plurals", () => {
    expect(summarySentence(emptyCheck({ summary: summary({ medicines: 2, totalPairs: 1, checkedPairs: 1, alertPairs: 1 }) }), 2))
      .toBe("2 medicines · 1 of 1 pair checked · 1 with an interaction listed");
    expect(summarySentence(emptyCheck({ summary: summary({ medicines: 3, totalPairs: 3, checkedPairs: 3, alertPairs: 0 }) }), 3))
      .toBe("3 medicines · 3 of 3 pairs checked · 0 with an interaction listed");
  });

  it("all not-checked pairs are no_data: they name the substances; one name 'has', more 'have'", () => {
    const r = emptyCheck({ summary: summary({ medicines: 3, totalPairs: 3, checkedPairs: 1, alertPairs: 1, notCheckedPairs: 2 }),
      notChecked: [
        { a: side("W", "G Warfarin", "Warfarin"), b: side("D", "Domperidone", "Domperidone"), reason: "no_data", side: "b" },
        { a: side("A", "Aspirin", "Acetylsalicylic acid"), b: side("D", "Domperidone", "Domperidone"), reason: "no_data", side: "b" }] });
    expect(summarySentence(r, 3)).toBe("3 medicines · 1 of 3 pairs checked · 1 with an interaction listed · 2 pairs not checked because Domperidone has no interaction data");
  });

  it("other reasons give the generic segment; not-reviewed medicines are counted", () => {
    const r = emptyCheck({ summary: summary({ medicines: 3, totalPairs: 1, checkedPairs: 0, notCheckedPairs: 1, notReviewed: 1 }),
      notChecked: [{ a: side("W", "G Warfarin", "Warfarin"), b: side("O", "Otimol", "Oticmol"), reason: "no_route", side: "b" }] });
    expect(summarySentence(r, 3)).toBe("3 medicines · 0 of 1 pair checked · 0 with an interaction listed · 1 pair not checked · 1 medicine not yet reviewed by a pharmacist");
  });

  it("a combination product plus one other: same-product pairs are not counted and the no-data wording still applies", () => {
    const r = emptyCheck({ summary: summary({ medicines: 2, totalPairs: 2, checkedPairs: 1, alertPairs: 0, noInteractionPairs: 1, notCheckedPairs: 1 }),
      notChecked: [
        { a: side("AMC", "Moxaclav", "Amoxicillin"), b: side("AMC", "Moxaclav", "Clavulanic acid"), reason: "same_product", side: "a" },
        { a: side("AMC", "Moxaclav", "Clavulanic acid"), b: side("D", "Domperidone", "Domperidone"), reason: "no_data", side: "b" }] });
    expect(summarySentence(r, 2)).toBe("2 medicines · 1 of 2 pairs checked · 0 with an interaction listed · 1 pair not checked because Domperidone has no interaction data");
    expect(countChips(r)).toEqual({ severities: [], noData: 1, other: 0 });
  });

  it("two products with the same substance: the duplicate is not counted", () => {
    const r = emptyCheck({ summary: summary({ medicines: 2 }), duplicates: [{ bdsId: "BDS-1", name: "Warfarin", conceptIds: ["W", "W2"] }] });
    expect(summarySentence(r, 2)).toBe("2 medicines · 0 of 0 pairs checked · 0 with an interaction listed");
  });

  it("the Not checked chip counts no_data only; other reasons are the plain count", () => {
    const r = emptyCheck({ summary: summary({ notCheckedPairs: 3, bySeverity: { major: 1, moderate: 0, minor: 2, unknown: 4 } }),
      notChecked: [
        { a: side("W", "W", "Warfarin"), b: side("D", "D", "Domperidone"), reason: "no_data", side: "b" },
        { a: side("W", "W", "Warfarin"), b: side("O", "O", "Oticmol"), reason: "no_route", side: "b" },
        { a: side("W", "W", "Warfarin"), b: side("N", "N", "Newmol", null), reason: "unmapped", side: "b" }] });
    expect(countChips(r)).toEqual({ severities: [["major", 1], ["minor", 2], ["unknown", 4]], noData: 1, other: 2 });
  });

  it("helpers", () => {
    expect(medicinesOnly(1)).toBe("1 medicine");
    expect(medicinesOnly(4)).toBe("4 medicines");
    expect([joinAnd([]), joinAnd(["A"]), joinAnd(["A", "B"]), joinAnd(["A", "B", "C"])]).toEqual(["", "A", "A and B", "A, B and C"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/check-summary.test.ts`
Expected: FAIL (`Cannot find module '@/lib/check-summary'`).

- [ ] **Step 3: Write the module**

```ts
import { PUBLIC_NEW, fill } from "./copy";
import type { CheckResult } from "./public-types";
import { CHECK, plural } from "./public-copy";

/** §6.7.2 summary formatting. The API counts (§7.4); this only words it. Pure and client-safe. */
const N = PUBLIC_NEW.checker;
const medicines = (n: number) => plural(n, CHECK.medicineOne, CHECK.medicineMany);
const pairs = (n: number) => plural(n, CHECK.pairOne, CHECK.pairMany);
const SEVERITIES = ["major", "moderate", "minor", "unknown"] as const;

export const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const medicinesOnly = (m: number) => `${m} ${medicines(m)}`;

/** The substances, by name and in result order, that make the not-checked pairs not checked because of no data. */
export function noDataNames(r: CheckResult): string[] {
  const names: string[] = [];
  for (const n of r.notChecked) {
    if (n.reason !== "no_data") continue;
    const name = (n.side === "a" ? n.a : n.b).name;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export function summarySentence(r: CheckResult | null, m: number): string {
  if (m < 2 || r === null) return CHECK.empty;
  const s = r.summary;
  let out = fill(N.summary, { m, medicines: medicines(m), checked: s.checkedPairs, total: s.totalPairs, pairs: pairs(s.totalPairs),
    alerts: s.alertPairs });
  const counted = r.notChecked.filter((n) => n.reason !== "same_product");
  if (s.notCheckedPairs > 0) {
    if (counted.length > 0 && counted.every((n) => n.reason === "no_data")) {
      const names = noDataNames(r);
      out += fill(N.ncNoData, { nc: s.notCheckedPairs, pairs: pairs(s.notCheckedPairs), names: joinAnd(names),
        has: names.length === 1 ? CHECK.has : CHECK.have });
    } else {
      out += fill(N.nc, { nc: s.notCheckedPairs, pairs: pairs(s.notCheckedPairs) });
    }
  }
  if (s.notReviewed > 0) out += fill(N.nr, { nr: s.notReviewed, medicines: medicines(s.notReviewed) });
  return out;
}

export function countChips(r: CheckResult) {
  const severities = SEVERITIES.map((k) => [k, r.summary.bySeverity[k]] as [(typeof SEVERITIES)[number], number]).filter(([, n]) => n > 0);
  const noData = r.notChecked.filter((n) => n.reason === "no_data").length;
  return { severities, noData, other: Math.max(0, r.summary.notCheckedPairs - noData) };
}
```

- [ ] **Step 4: Run the test**

Run: `cd web && npx vitest run tests/check-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/check-summary.ts web/tests/check-summary.test.ts
git commit -m "feat(web): checker summary sentence and count chips from the API's counts (§6.7.2, §11.1)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 29: The checker's results (§6.7.3 items 1–8)

**Files:**
- Create: `web/components/check/CheckResults.tsx`, `web/components/check/check.module.css`
- Test: `web/tests/check-results.test.tsx`

**Interfaces:**
- Consumes: Tasks 17, 25, 28: `CheckResult`, `PublicPairCard`, `pairText`, `summarySentence`, `countChips`, `entryBaseName`; `CHECK`, `PRODUCT.sourceLine`, `PUBLIC_NEW.checker`, `PUBLIC_BOARD.legendUnclassified`; `DESK_NEW.routeAware.*`, `DESK_NEW.notRun.notCheckedNotRun`; `NOT_REVIEWED`, `NO_DATA_SENTENCE`, `DECISION_SUPPORT`; `Severity`, `NoDataChip`, `NoDataBlock`, `ReviewStatus`, `severityLabel`.
- Produces: `CheckSummary({ result, m, failed })` (the `<h2 class="s-sum" data-check-summary>` and the count chips); `CheckResults({ result })` (items 1–7); `CheckLegend()` (item 8).

- [ ] **Step 1: Write the failing test**

`web/tests/check-results.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CheckResults, { CheckLegend, CheckSummary } from "@/components/check/CheckResults";
import type { CheckResult, Side } from "@/lib/public-types";
import { emptyCheck } from "./fixtures/public";

const s = (conceptId: string, tradeName: string, name: string, bdsId: string | null, routeScope: string | null = "systemic"): Side =>
  ({ conceptId, tradeName, bdsId, name, routeScope });
const W = s("W", "G Warfarin", "Warfarin", "BDS-3"), A = s("A", "Aspirin", "Acetylsalicylic acid", "BDS-4"),
  D = s("D", "Domperidone", "Domperidone", "BDS-10", null), N = s("N", "Napa", "Acetaminophen", "BDS-1"),
  EYE = s("EYE", "Chloramphenicol", "Chloramphenicol", "BDS-9", "ophthalmic");
const RESULT: CheckResult = emptyCheck({
  summary: { medicines: 5, totalPairs: 6, checkedPairs: 4, alertPairs: 2, noInteractionPairs: 2, notCheckedPairs: 2, notReviewed: 1,
    bySeverity: { major: 1, moderate: 0, minor: 0, unknown: 1 } },
  products: [
    { conceptId: "W", tradeName: "G Warfarin", route: "systemic", substances: [{ bdsId: "BDS-3", name: "Warfarin", coverage: "full", ddinter: [{ ddinterId: "DDInter1951", name: "Warfarin", routeScope: "systemic", routeAssumed: false }] }] },
    { conceptId: "A", tradeName: "Aspirin", route: null, substances: [{ bdsId: "BDS-4", name: "Acetylsalicylic acid", coverage: "full", ddinter: [{ ddinterId: "DDInter20", name: "Acetylsalicylic acid", routeScope: "systemic", routeAssumed: true }] }] },
    { conceptId: "D", tradeName: "Domperidone", route: "systemic", substances: [{ bdsId: "BDS-10", name: "Domperidone", coverage: "none", ddinter: [] }] },
    { conceptId: "N", tradeName: "Napa", route: "systemic", substances: [{ bdsId: "BDS-1", name: "Acetaminophen", coverage: "full", ddinter: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }] }] },
    { conceptId: "EYE", tradeName: "Chloramphenicol", route: "ophthalmic", substances: [{ bdsId: "BDS-9", name: "Chloramphenicol", coverage: "full", ddinter: [{ ddinterId: "DDInter352", name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic", routeAssumed: false }] }] },
  ],
  alerts: [
    { severity: "major", a: W, b: A, actions: ["synergy"], interaction: "Bleeding risk.", management: "Avoid unless needed.", routeAssumed: true,
      ddinterA: "DDInter1951", ddinterB: "DDInter20", interactionId: "3039", source: "DDInter 2.0", pairReview: { state: "reviewed", reviewedAt: "2026-10-16T05:20:00Z" } },
    { severity: "unknown", a: N, b: A, actions: ["unknown"], interaction: null, management: null, routeAssumed: false,
      ddinterA: "DDInter14", ddinterB: "DDInter20", interactionId: null, source: "DDInter 2.0", pairReview: { state: "not_reviewed", reviewedAt: null } },
  ],
  noInteraction: [{ a: EYE, b: W, ddinterA: "DDInter352", ddinterB: "DDInter1951" }, { a: N, b: EYE, ddinterA: "DDInter14", ddinterB: "DDInter352" }],
  notChecked: [{ a: W, b: D, reason: "no_data", side: "b" }, { a: A, b: D, reason: "no_data", side: "b" }],
  duplicates: [{ bdsId: "BDS-3", name: "Warfarin", conceptIds: ["W", "W2"] }],
  notReviewed: [{ conceptId: "HID", tradeName: "Hidasprin" }],
});

describe("checker results (§6.7.3)", () => {
  const html = renderToStaticMarkup(<CheckResults result={RESULT} />);

  it("1. severity groups, Major first, with the label and state directly under the head", () => {
    expect(html).toContain("Major, 1 pair</h3>");
    expect(html.indexOf("Major, 1 pair")).toBeLessThan(html.indexOf("Severity not classified by DDInter, 1 pair"));
    expect(html).toContain(">G Warfarin + Aspirin</h4>");
    expect(html.indexOf("From DDInter 2.0")).toBeLessThan(html.indexOf("Warfarin + Acetylsalicylic acid. Action: synergy"));
    expect(html).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
    expect(html).toContain("Management, full text from DDInter 2.0.");
    expect(html).toContain('Source: DDInter 2.0, <span class="mono">DDInter1951</span> + <span class="mono">DDInter20</span>');
    expect(html).toContain("DDInter 2.0 lists this pair with action &quot;unknown&quot; and no text. It is not treated as low risk.");
  });

  it("the route-assumed line names the brand with no route", () => {
    expect(html).toContain('Route assumed: Aspirin has no route on record, so the systemic entry <span class="mono">DDInter20</span> was used.');
  });

  it("2. no interaction listed, with the caveat", () => {
    expect(html).toContain("No interaction listed in DDInter 2.0, 2 pairs");
    expect(html).toContain("Chloramphenicol + G Warfarin");
    expect(html).toContain("(Chloramphenicol + Warfarin)");
    expect(html).toContain("DDInter 2.0 lists no interaction for these pairs. This is not a guarantee that they are safe to combine.");
  });

  it("3. one hatch block per product and no-data substance, with its not-checked chips", () => {
    expect(html.match(/class="nodata-block hatch"/g)).toHaveLength(1);
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + G Warfarin</span>');
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + Aspirin</span>');
  });

  it("5, 6 and 7: duplicates, not reviewed by name, what was checked open for a route-specific entry", () => {
    expect(html).toContain("Same substance in more than one product");
    expect(html).toContain("Not yet reviewed by a pharmacist, 1 product");
    expect(html).toContain("Hidasprin");
    expect(html).toContain("These products were not checked. A pharmacist hasn&#x27;t approved them yet.");
    expect(html).toContain("<details open=\"\"><summary>What was checked</summary>");
    expect(html).toContain('Chloramphenicol: Chloramphenicol checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic)');
    expect(html).toContain('Aspirin: Acetylsalicylic acid checked against <span class="mono">DDInter20</span> Acetylsalicylic acid (systemic), route assumed');
  });

  it("4. other not-checked reasons are plain text, never hatched", () => {
    const other = renderToStaticMarkup(<CheckResults result={{ ...RESULT, notChecked: [
      { a: W, b: s("O", "Otimol", "Oticmol", "BDS-7", null), reason: "no_route", side: "b" },
      { a: s("AMC", "Moxaclav", "Amoxicillin", "BDS-8"), b: s("AMC", "Moxaclav", "Clavulanic acid", "BDS-9"), reason: "same_product", side: "a" },
      { a: W, b: s("UNM", "Newdrug", "Newmol", null, null), reason: "unmapped", side: "b" },
      { a: W, b: s("NR", "Newrun", "Newrunmol", "BDS-6", null), reason: "not_run", side: "b" }] }} />);
    expect(other).toContain("Not checked: Otimol has no route on record and DDInter has no systemic entry for Oticmol.");
    expect(other).toContain("Not checked: Amoxicillin + Clavulanic acid are in the same product, Moxaclav. Pairs inside one product are not checked.");
    expect(other).toContain("Not checked: Newmol in Newdrug has no substance mapping yet.");
    expect(other).toContain("Not checked: DDInter mapping has not run for Newrunmol in Newrun.");
    expect(other).not.toContain("nodata-block");
    expect(other).not.toContain("No interaction data in DDInter for this substance");
  });

  it("the summary heading and the chips; a failed check names only the medicines", () => {
    const sum = renderToStaticMarkup(<CheckSummary result={RESULT} m={5} failed={false} />);
    expect(sum).toContain('<h2 class="s-sum" data-check-summary="">5 medicines · 4 of 6 pairs checked · 2 with an interaction listed · 2 pairs not checked because Domperidone has no interaction data · 1 medicine not yet reviewed by a pharmacist</h2>');
    expect(sum).toContain('<span class="sev sev--nodata">Not checked 2</span>');
    expect(renderToStaticMarkup(<CheckSummary result={null} m={3} failed />)).toContain(">3 medicines</h2>");
    expect(renderToStaticMarkup(<CheckSummary result={null} m={1} failed={false} />)).toContain(">Add at least 2 medicines to check them against each other.</h2>");
  });

  it("8. the legend and the disclaimer", () => {
    const legend = renderToStaticMarkup(<CheckLegend />);
    expect(legend).toContain("Severity legend, from DDInter 2.0");
    expect(legend).toContain("Never treated as low risk, never merged with Minor.");
    expect(legend).toContain("IntelliDrugs is decision support. It is not a substitute for clinical judgement.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/check-results.test.tsx`
Expected: FAIL (`Cannot find module '@/components/check/CheckResults'`).

- [ ] **Step 3: Write the component**

`web/components/check/CheckResults.tsx`:

```tsx
import type { ReactNode } from "react";
import PublicPairCard, { pairText } from "@/components/public/PublicPairCard";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { countChips, medicinesOnly, summarySentence } from "@/lib/check-summary";
import { DECISION_SUPPORT, DESK_NEW, NOT_REVIEWED, NO_DATA_SENTENCE, PUBLIC_BOARD, PUBLIC_NEW, fill } from "@/lib/copy";
import { entryBaseName } from "@/lib/ddinter-text";
import type { CheckAlert, CheckResult, Side } from "@/lib/public-types";
import { CHECK, PRODUCT, plural } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import { groupBySeverity, severityLabel } from "@/lib/severity";
import styles from "./check.module.css";

const N = PUBLIC_NEW.checker;
const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;
const pairsWord = (k: number) => plural(k, CHECK.pairOne, CHECK.pairMany);

/** The `<h2>` that opens the main column (§6.7), also read by the combobox for its announcements, and the count chips. */
export function CheckSummary({ result, m, failed }: { result: CheckResult | null; m: number; failed: boolean }) {
  const chips = result ? countChips(result) : null;
  return (
    <>
      <h2 className="s-sum" data-check-summary="">{failed && m >= 2 ? medicinesOnly(m) : summarySentence(result, m)}</h2>
      {chips && (chips.severities.length > 0 || chips.noData > 0 || chips.other > 0) && (
        <div className={styles["s-sevrow"]}>
          {chips.severities.map(([k, n]) => <Severity key={k} level={k} count={n} />)}
          {chips.noData > 0 && <NoDataChip label={`${CHECK.notCheckedChip} ${chips.noData}`} />}
          {chips.other > 0 && <span className={styles.other}>{N.otherNotChecked} {chips.other}</span>}
        </div>
      )}
    </>
  );
}

function routeLine(result: CheckResult, side: Side): ReactNode {
  const p = result.products.find((x) => x.conceptId === side.conceptId);
  const c = p?.substances.find((x) => x.bdsId === side.bdsId)?.ddinter[0];
  if (!p || !c || !c.routeAssumed) return null;
  return <p className="pair-source">{p.route
    ? fillNodes(N.routeAssumedPair, { brand: p.tradeName, route: p.route, substance: side.name, id: <Mono id={c.ddinterId} /> })
    : fillNodes(N.routeAssumedPairNoRoute, { brand: p.tradeName, id: <Mono id={c.ddinterId} /> })}</p>;
}

function AlertCard({ a, i, result }: { a: CheckAlert; i: number; result: CheckResult }) {
  const known = a.severity === "major" || a.severity === "moderate" || a.severity === "minor";
  return (
    <PublicPairCard id={`chk-${i}`} severity={a.severity} heading="h4" names={`${a.a.tradeName} + ${a.b.tradeName}`} reviewFirst
      meta={known ? fill(CHECK.metaAction, { a: a.a.name, b: a.b.name, actions: a.actions.join(", ") }) : `${a.a.name} + ${a.b.name}`}
      review={a.pairReview} text={pairText(a)} extra={<>{routeLine(result, a.a)}{routeLine(result, a.b)}</>}
      source={fillNodes(PRODUCT.sourceLine, { a: <Mono id={a.ddinterA} />, b: <Mono id={a.ddinterB} /> })} />
  );
}

/** §6.7.3 item 4: the plain line for a pair not checked for a reason other than no data (no hatch, §3.4). */
function otherLine(result: CheckResult, n: CheckResult["notChecked"][number]): string {
  if (n.reason === "same_product") return fill(N.sameProduct, { a: n.a.name, b: n.b.name, brand: n.a.tradeName });
  const s = n.side === "a" ? n.a : n.b;
  if (n.reason === "no_route") {
    const route = result.products.find((p) => p.conceptId === s.conceptId)?.route ?? null;
    return route ? fill(DESK_NEW.routeAware.notCheckedNoRoute, { brand: s.tradeName, route, substance: s.name })
      : fill(DESK_NEW.routeAware.notCheckedNoRouteNoRoute, { brand: s.tradeName, substance: s.name });
  }
  if (n.reason === "not_run") return fill(DESK_NEW.notRun.notCheckedNotRun, { substance: s.name, brand: s.tradeName });
  return fill(DESK_NEW.routeAware.notCheckedUnmapped, { ingredient: s.name, brand: s.tradeName });
}

export default function CheckResults({ result: r }: { result: CheckResult }) {
  const groups = groupBySeverity(r.alerts);
  const noDataBlocks = new Map<string, { brand: string; name: string; bdsId: string | null; chips: string[] }>();
  for (const n of r.notChecked) {
    if (n.reason !== "no_data") continue;
    const mine = n.side === "a" ? n.a : n.b, other = n.side === "a" ? n.b : n.a;
    const key = `${mine.conceptId}|${mine.bdsId ?? mine.name}`;
    const block = noDataBlocks.get(key) ?? { brand: mine.tradeName, name: mine.name, bdsId: mine.bdsId, chips: [] };
    const several = (r.products.find((p) => p.conceptId === other.conceptId)?.substances.length ?? 1) > 1;
    block.chips.push(`${mine.tradeName} + ${other.tradeName}${several ? ` (${other.name})` : ""}`);
    noDataBlocks.set(key, block);
  }
  const others = r.notChecked.filter((n) => n.reason !== "no_data");
  const brand = new Map(r.products.map((p) => [p.conceptId, p.tradeName]));
  const checkedLines = r.products.flatMap((p) => p.substances.flatMap((s) => s.ddinter.map((c) => ({ p, s, c }))));
  const openChecked = checkedLines.some(({ c }) => c.routeAssumed || (c.routeScope !== "systemic" && c.routeScope !== "any"));
  return (
    <div className={styles.results}>
      {groups.map(([sev, alerts]) => (
        <div key={sev} className={styles["s-group"]}>
          <h3 className={styles["s-group-h"]}>{fill(CHECK.groupHeading, { severity: severityLabel(sev), k: alerts.length, pairs: pairsWord(alerts.length) })}</h3>
          {alerts.map((a) => <AlertCard key={`${a.ddinterA}|${a.ddinterB}|${a.a.conceptId}|${a.b.conceptId}`} a={a} i={r.alerts.indexOf(a)} result={r} />)}
        </div>
      ))}
      {r.noInteraction.length > 0 && (
        <div className={styles["s-quiet"]}>
          <h3>{fill(N.noInteractionHeading, { k: r.noInteraction.length, pairs: pairsWord(r.noInteraction.length) })}</h3>
          <ul>{r.noInteraction.map((n) => (
            <li key={`${n.a.conceptId}|${n.a.name}|${n.b.conceptId}|${n.b.name}`}>{n.a.tradeName} + {n.b.tradeName} <span className={styles["s-route"]}>({n.a.name} + {n.b.name})</span></li>
          ))}</ul>
          <p>{N.noInteractionCaveat}</p>
        </div>
      )}
      {[...noDataBlocks.values()].map((b) => (
        <NoDataBlock key={`${b.brand}|${b.name}`} title={b.brand === b.name ? b.brand : `${b.brand}, ${b.name}`} bdsId={b.bdsId ?? undefined} pairs={b.chips} />
      ))}
      {others.map((n, i) => <p key={i} className={styles.plain}>{otherLine(r, n)}</p>)}
      {r.duplicates.length > 0 && (
        <div className={styles["s-quiet"]}>
          <h3>{N.sameSubstanceHeading}</h3>
          <ul>{r.duplicates.map((d) => <li key={d.bdsId}>{d.name}: {d.conceptIds.map((c) => brand.get(c) ?? c).join(", ")}</li>)}</ul>
        </div>
      )}
      {r.notReviewed.length > 0 && (
        <div className={styles["s-quiet"]}>
          <h3>{`${NOT_REVIEWED}, ${fill(N.notReviewedCount, { k: r.notReviewed.length, products: plural(r.notReviewed.length, CHECK.productOne, CHECK.productMany) })}`}</h3>
          <ul>{r.notReviewed.map((n) => <li key={n.conceptId}>{n.tradeName} <ReviewStatus status="pending" /></li>)}</ul>
          <p>{N.notReviewedNote}</p>
        </div>
      )}
      {checkedLines.length > 0 && (
        <details open={openChecked ? true : undefined}>
          <summary>{N.whatChecked}</summary>
          <ul className={styles.checkedList}>
            {checkedLines.map(({ p, s, c }) => (
              <li key={`${p.conceptId}|${s.bdsId}|${c.ddinterId}`}>
                {fillNodes(N.checkedLine, { brand: p.tradeName, substance: s.name, id: <Mono id={c.ddinterId} />,
                  name: entryBaseName(c.name, c.ddinterId, c.routeScope), route: c.routeScope })}
                {c.routeAssumed && DESK_NEW.routeAware.routeAssumedSuffix}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** §6.7.3 item 8, verbatim from Board P. */
export function CheckLegend() {
  return (
    <>
      <div className={styles["s-legend"]}>
        <h3>{CHECK.legendHeading}</h3>
        <dl>
          <dt><Severity level="major" /></dt><dd>Major</dd>
          <dt><Severity level="moderate" /></dt><dd>Moderate</dd>
          <dt><Severity level="minor" /></dt><dd>Minor</dd>
          <dt><Severity level="unknown" /></dt><dd>{PUBLIC_BOARD.legendUnclassified}</dd>
          <dt><NoDataChip label={CHECK.noDataChip} /></dt><dd>{NO_DATA_SENTENCE}</dd>
        </dl>
      </div>
      <p className={styles["s-disc"]}>{DECISION_SUPPORT}</p>
    </>
  );
}
```

The checked line for Aspirin reads "… checked against `DDInter20` Acetylsalicylic acid (systemic), route assumed": `{name}` is DDInter's entry name without a route suffix it already carries, then `({route})`.

`web/components/check/check.module.css` (Board P `.s-chk` block, same values):

```css
.s-chk { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); min-height: 640px; max-width: 1240px; margin: 0 auto; }
.s-chk-side { padding: 24px; background: var(--surface-2); border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.s-chk-main { padding: 24px 28px 28px; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.h1 { font: var(--t-title2); letter-spacing: var(--tr-title2); }
.s-sel-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.s-sel-h p { font: 600 13px/1.3 var(--font-ui); color: var(--fg); }
.s-sel { display: flex; flex-direction: column; gap: 8px; }
.s-med { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; padding: 10px 8px 10px 14px; border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-1); }
.s-med b { font: 600 14px/1.3 var(--font-ui); overflow-wrap: anywhere; }
.s-med > span { font-size: 12.5px; color: var(--fg-2); grid-column: 1; }
.s-med :global(.btn) { grid-column: 2; grid-row: 1 / span 2; }
.s-med-empty { font-size: 13px; color: var(--fg-2); padding: 12px 14px; border-radius: var(--r-card); box-shadow: inset 0 0 0 1px var(--line-strong); }
.s-presets { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.s-presets :global(.btn) { white-space: normal; text-align: left; line-height: 1.25; padding-block: 6px; height: auto; }
.s-group-h { font: 600 13px/1.3 var(--font-ui); color: var(--fg-2); }
.s-group { display: flex; flex-direction: column; gap: 10px; }
.s-sevrow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.other { font-size: 12.5px; color: var(--fg-2); }
.results { display: flex; flex-direction: column; gap: 20px; }
.s-quiet { padding: 14px 16px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; color: var(--fg-2); }
.s-quiet h3 { font: 600 14px/1.3 var(--font-ui); color: var(--fg); }
.s-quiet ul { display: flex; flex-direction: column; gap: 4px; color: var(--fg); }
.s-route { font-size: 12px; color: var(--fg-2); }
.plain { font-size: 13.5px; color: var(--fg); }
.checkedList { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; font-size: 13.5px; }
.s-legend { display: flex; flex-direction: column; gap: 10px; padding-top: 18px; border-top: 1px solid var(--line); }
.s-legend h3 { font: 600 13px/1.3 var(--font-ui); color: var(--fg-2); }
.s-legend dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 14px; align-items: center; font-size: 13px; color: var(--fg-2); }
.s-legend dd { min-width: 0; }
.s-disc { font-size: 13px; color: var(--fg); padding: 12px 14px; border-radius: var(--r-card); box-shadow: inset 0 0 0 1px var(--line-strong); }
.s-chk-empty { padding: 18px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--fg-2); font-size: 14px; }
.matches { display: flex; flex-direction: column; gap: 4px; }
.matches button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 9px 10px; border: 0; border-radius: 8px; background: var(--surface); color: var(--fg); font: 600 14px/1.3 var(--font-ui); text-align: left; cursor: pointer; }
.matches button span { font: 400 12.5px/1.3 var(--font-ui); color: var(--fg-2); }
@media (max-width: 920px) { .s-chk { grid-template-columns: 1fr; } .s-chk-side { border-right: 0; border-bottom: 1px solid var(--line); } }
@media (max-width: 560px) { .s-legend dl { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 520px) { .s-chk-side, .s-chk-main { padding: 18px 16px; } }
/* Board P .s-sum: a global class (scoped under a local one, as CSS Modules require), so tests read the board's name. */
.s-chk-main :global(.s-sum) { font: var(--t-title2); letter-spacing: var(--tr-title2); text-wrap: pretty; }
```

- [ ] **Step 4: Run the test**

Run: `cd web && npx vitest run tests/check-results.test.tsx tests/copy.test.ts tests/marks.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/check/CheckResults.tsx web/components/check/check.module.css web/tests/check-results.test.tsx
git commit -m "feat(web): checker results: labelled severity groups, no interaction listed, no-data blocks, other reasons, what was checked (§6.7.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 30: The checker page, its side column and the no-JavaScript flow (§6.7.1, §4.4)

**Files:**
- Rewrite: `web/app/check/page.tsx`
- Create: `web/lib/check-scenarios.ts` (server-only: `next build` rejects any export of a page module that is not a page field, so `availableScenarios` cannot live in `page.tsx`)
- Create: `web/components/check/CheckSide.tsx`
- Create: `web/components/check/CheckerCombobox.tsx` (first version: the no-JavaScript field; Task 32 adds the island behaviour)
- Modify: `web/lib/check-summary.ts` (`suggestionSub`), `web/tests/copy.test.ts` (`LEGACY_EXEMPT` becomes empty)
- Test: `web/tests/check-page.test.tsx` (rewrite)

**Interfaces:**
- Consumes: Tasks 17–18, 28–29: `getPublicProduct`, `checkPublic`, `suggestProducts`, `parseCheckIds`, `parseQuery`, `checkHref`, `CHECK_MAX`, `CheckSummary`, `CheckResults`, `CheckLegend`; `SCENARIOS` (Task 20); `Banner`, `ReviewStatus`, `buttonClass`; `PUBLIC_NEW.checker`, `PUBLIC_NEW.checkerMax`; `DESK_NEW.reviewLists.tryAgain`.
- Produces:
  - `CheckSide({ ids, selected, matches, q, scenarios, atMax })` where `selected: { conceptId: string; tradeName: string; display: string | null }[]` (`display` null = not reviewed) and `matches: SuggestRow[] | null`.
  - `CheckerCombobox({ ids, max, q })` (the field; its server render is the no-JS field: label, input `name="q"`, the "Find" submit, help text; at 20 the input is `aria-disabled="true"` and `readonly` and the help text is `PUBLIC_NEW.checkerMax.help`).
  - `availableScenarios(): Promise<Scenario[]>` in `lib/check-scenarios.ts` (`import "server-only"`; a scenario renders only when all of its products exist: one `checkPublic` of all scenario ids, dropping each unknown id the API names). `app/check/page.tsx` exports only `default`, `dynamic` and `metadata`.
  - The page: canonical `/check?ids=…` (a `remove`, `clear`, de-duplicated or over-long list redirects to it); reads each selected product (≤ 20, in parallel) for its name and clinical display; drops unknown ids with the info banner (Review Focus 3); checks 2 or more; a 5xx is the crit banner with "Try again".

- [ ] **Step 1: Write the failing test**

`web/tests/check-page.test.tsx` (whole file):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAPA, emptyCheck } from "./fixtures/public";

const getPublicProduct = vi.fn(), checkPublic = vi.fn(), suggestProducts = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicProduct: (id: string) => getPublicProduct(id), checkPublic: (ids: string[]) => checkPublic(ids),
  suggestProducts: (q: string, ex: string[]) => suggestProducts(q, ex) }));
const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
import CheckPage from "@/app/check/page";
import { SCENARIOS } from "@/content/check-scenarios";

const render = async (sp: Record<string, string | string[]>) => renderToStaticMarkup(await CheckPage({ searchParams: Promise.resolve(sp) }));
const approved = (id: string, tradeName: string) => ({ ok: true, data: { ...NAPA, conceptId: id, tradeName } });
const stub = (id: string, tradeName: string) => ({ ok: true, data: { conceptId: id, tradeName, status: "not_reviewed", batchId: "B", hidden: true } });

beforeEach(() => {
  getPublicProduct.mockReset();
  getPublicProduct.mockImplementation(async (id: string) => id === "gone" ? { ok: false, status: 404 }
    : id === "HID" ? stub(id, "Hidasprin") : approved(id, `Brand ${id}`));
  checkPublic.mockReset();
  checkPublic.mockImplementation(async (ids: string[]) => ({ ok: true, data: emptyCheck({ summary: { ...emptyCheck().summary, medicines: ids.length } }) }));
  suggestProducts.mockReset(); suggestProducts.mockResolvedValue({ ok: true, data: [] });
  redirect.mockClear();
});

describe("/check (§6.7)", () => {
  it("the h1 at the top of the side column, the summary h2 opening the main column, one polite live region", async () => {
    const html = await render({});
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Check interactions</h1>");
    expect(html).toContain(">Add at least 2 medicines to check them against each other.</h2>");
    expect(html).toContain("Add medicines with the field on the left, or start from a scenario. Pairs appear here, Major first.");
    expect(html).toContain('id="check-live" class="sr-only" aria-live="polite" aria-atomic="true"');
    expect(html).toContain("No medicines yet.");
    expect(html).toContain('aria-disabled="true"');            // Clear all, never disabled
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });

  it("the no-JavaScript field: label, Find submit, help; the current ids as hidden inputs; remove buttons per medicine", async () => {
    const html = await render({ ids: ["A", "HID"] });
    expect(html).toContain('<form method="get" action="/check"');
    expect(html).toContain("Add a medicine");
    expect(html).toContain('name="q"');
    expect(html).toContain(">Find</button>");
    expect(html).toContain('<input type="hidden" name="ids" value="A"/>');
    expect(html).toContain('name="remove" value="HID"');
    expect(html).toContain('<span class="sr-only">Remove Hidasprin</span>');
    expect(html).toContain("Selected, 2 of 20");
    expect(html).toContain("Acetaminophen 500 mg tablet");
    expect(html).toContain("Not yet reviewed by a pharmacist");
  });

  it("Find lists matches as submit buttons named ids inside the same form, or says nothing matched", async () => {
    suggestProducts.mockResolvedValue({ ok: true, data: [{ conceptId: "N", tradeName: "Napa", dosageForm: "Tablet", status: "approved",
      clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: { name: "Paracetamol", substance: "Acetaminophen" } }] });
    const html = await render({ ids: ["A"], q: "paracetamol" });
    expect(suggestProducts).toHaveBeenCalledWith("paracetamol", ["A"]);
    expect(html).toContain('name="ids" value="N"');
    expect(html).toContain("Acetaminophen 500 mg tablet. Matches Paracetamol, a name for Acetaminophen");
    suggestProducts.mockResolvedValue({ ok: true, data: [] });
    expect(await render({ q: "zzz" })).toContain("No medicine matches &quot;zzz&quot;.");
  });

  // Review Focus 3
  it("an unknown id is dropped with the info banner; repeated, blank or extra ids redirect to the canonical list", async () => {
    const html = await render({ ids: ["A", "gone", "B"] });
    expect(html).toContain("One medicine in the link no longer exists, so it was removed.");
    expect(checkPublic).toHaveBeenCalledWith(["A", "B"]);
    await expect(render({ ids: ["A", "A", " ", "B"] })).rejects.toThrow("REDIRECT /check?ids=A&ids=B");
    await expect(render({ ids: ["A", "B"], remove: "A" })).rejects.toThrow("REDIRECT /check?ids=B");
    await expect(render({ ids: ["A", "B"], clear: "1" })).rejects.toThrow("REDIRECT /check");
    const many = Array.from({ length: 25 }, (_, i) => `P${i}`);
    await expect(render({ ids: many })).rejects.toThrow(`REDIRECT ${"/check?" + new URLSearchParams(many.slice(0, 20).map((id) => ["ids", id]))}`);
  });

  it("at 20 medicines the field is aria-disabled and readonly with the maximum help text", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `P${i}`);
    const html = await render({ ids: twenty });
    expect(html).toMatch(/<input[^>]*aria-disabled="true"[^>]*readOnly=""/i);
    expect(html).toContain("20 medicines is the maximum. Remove one to add another.");
  });

  it("a failed check is the crit banner with Try again, and nothing was saved", async () => {
    checkPublic.mockImplementation(async (ids: string[]) => (ids.length === 2 ? { ok: false, status: 503, unknownId: null }
      : { ok: true, data: emptyCheck() }));
    const html = await render({ ids: ["A", "B"] });
    expect(html).toContain("Couldn&#x27;t check these medicines.");
    expect(html).toContain("Nothing was saved. Try again in a moment.");
    expect(html).toContain('href="/check?ids=A&amp;ids=B">Try again</a>');
    expect(html).toContain(">2 medicines</h2>");
  });

  it("scenarios render only when all their products exist", async () => {
    checkPublic.mockImplementation(async (ids: string[]) => ids.includes(SCENARIOS[1].ids[1])
      ? { ok: false, status: 404, unknownId: SCENARIOS[1].ids[1] } : { ok: true, data: emptyCheck() });
    const html = await render({});
    expect(html).toContain("Start from a scenario");
    expect(html).toContain(`>${SCENARIOS[0].label}</a>`);
    expect(html).not.toContain(`>${SCENARIOS[1].label}</a>`);
    expect(html).not.toContain(`>${SCENARIOS[2].label}</a>`);    // shares the unknown simvastatin id
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/check-page.test.tsx`
Expected: FAIL (the old page renders checkboxes).

- [ ] **Step 3: The field (first version), the side column and the page**

`web/components/check/CheckerCombobox.tsx` (first version; Task 32 makes it the island):

```tsx
import { PUBLIC_NEW } from "@/lib/copy";
import { CHECK } from "@/lib/public-copy";

/** The "Add a medicine" field. Without JavaScript it is a text field with a "Find" submit (§4.4). Task 32 adds the combobox. */
export default function CheckerCombobox({ ids, max, q }: { ids: string[]; max: number; q: string }) {
  const atMax = ids.length >= max;
  return (
    <div className="field">
      <label className="field-label" htmlFor="cx-input" id="cx-label">{CHECK.fieldLabel}</label>
      <div className="search">
        <input type="text" id="cx-input" name="q" defaultValue={q} placeholder={CHECK.placeholder} autoComplete="off" aria-describedby="cx-help"
          aria-disabled={atMax ? "true" : undefined} readOnly={atMax || undefined} />
      </div>
      <div className="field-meta"><span id="cx-help">{atMax ? PUBLIC_NEW.checkerMax.help : CHECK.help}</span></div>
      <button type="submit" name="find" value="1" className="btn btn--tonal btn--sm">{PUBLIC_NEW.checker.find}</button>
    </div>
  );
}
```

`web/components/check/CheckSide.tsx`:

```tsx
import { buttonClass } from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import type { SuggestRow } from "@/lib/public-types";
import { CHECK } from "@/lib/public-copy";
import { CHECK_MAX, checkHref } from "@/lib/public-params";
import type { Scenario } from "@/content/check-scenarios";
import { suggestionSub } from "@/lib/check-summary";
import CheckerCombobox from "./CheckerCombobox";
import styles from "./check.module.css";

export type Selected = { conceptId: string; tradeName: string; display: string | null };

/**
 * The side column: one GET form holding the current ids (hidden), the field, the no-JS matches (submit buttons named ids),
 * Clear all (aria-disabled when empty, never disabled), the selected list with a remove submit per medicine, and the
 * scenarios (links). The URL is the only store (§6.7.1).
 */
export default function CheckSide({ ids, selected, matches, q, scenarios }:
    { ids: string[]; selected: Selected[]; matches: SuggestRow[] | null; q: string; scenarios: Scenario[] }) {
  const empty = selected.length === 0;
  return (
    <form method="get" action="/check" className={styles["s-chk-side"]} data-check-form="">
      <h1 className={styles.h1}>{CHECK.h1}</h1>
      {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      <CheckerCombobox ids={ids} max={CHECK_MAX} q={q} />
      {matches && (matches.length === 0 ? <p className={styles["s-med-empty"]}>{fill(PUBLIC_NEW.checker.noMatch, { q })}</p> : (
        <ul className={styles.matches}>
          {matches.map((m) => (
            <li key={m.conceptId}><button type="submit" name="ids" value={m.conceptId}>{m.tradeName}
              <span>{m.status === "approved" ? suggestionSub(m) : <ReviewStatus status="pending" />}</span></button></li>
          ))}
        </ul>
      ))}
      <div>
        <div className={styles["s-sel-h"]}>
          <p id="sel-h">{fill(CHECK.selected, { k: selected.length })}</p>
          <button type="submit" name="clear" value="1" className={buttonClass("plain", "sm")} aria-disabled={empty ? "true" : undefined} data-clear="">{CHECK.clearAll}</button>
        </div>
        <ul className={styles["s-sel"]} aria-labelledby="sel-h">
          {empty ? <li className={styles["s-med-empty"]}>{CHECK.none}</li> : selected.map((s) => (
            <li key={s.conceptId} className={styles["s-med"]}>
              <b>{s.tradeName}</b>
              <span>{s.display ?? <ReviewStatus status="pending" />}</span>
              <button type="submit" name="remove" value={s.conceptId} className={`${buttonClass("tonal")} btn--icon`} data-remove={s.conceptId}>
                <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
                <span className="sr-only">{fill(CHECK.remove, { brand: s.tradeName })}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {scenarios.length > 0 && (
        <div>
          <p className={styles["s-group-h"]} id="pre-h">{CHECK.scenarios}</p>
          <div className={styles["s-presets"]} role="group" aria-labelledby="pre-h">
            {scenarios.map((s) => <a key={s.label} className={buttonClass("tonal", "sm")} href={checkHref(s.ids)} data-scenario={s.label}>{s.label}</a>)}
          </div>
        </div>
      )}
    </form>
  );
}
```

Append to `web/lib/check-summary.ts` (client-safe, so the island of Task 32 uses the same wording):

```ts
import type { SuggestRow } from "./public-types";

/** §6.7.1 sub line of an approved suggestion or no-JS match: "{clinical display}[. Matches {synonym}, a name for {substance} | . Matches {substance}]". */
export function suggestionSub(r: Pick<SuggestRow, "status" | "clinicalDisplayName" | "matched">): string {
  if (r.status !== "approved" || !r.clinicalDisplayName) return "";
  if (!r.matched) return r.clinicalDisplayName;
  return r.clinicalDisplayName + (r.matched.name.toLowerCase() === r.matched.substance.toLowerCase()
    ? fill(CHECK.matches, { name: r.matched.substance }) : fill(CHECK.matchesFor, { name: r.matched.name, substance: r.matched.substance }));
}
```

An unapproved row shows the `NOT_REVIEWED` pill in place of the sub line (§6.7.1).

`web/lib/check-scenarios.ts` (whole file; a page module may export only page fields, so the helper lives here):

```ts
import "server-only";
import { SCENARIOS, type Scenario } from "@/content/check-scenarios";
import { checkPublic } from "@/lib/api";

/** A scenario renders only when all of its products exist (§6.7.1): one check of every scenario id, dropping each unknown one. */
export async function availableScenarios(): Promise<Scenario[]> {
  let ids = [...new Set(SCENARIOS.flatMap((s) => s.ids))];
  const gone = new Set<string>();
  for (let i = 0; i < 5 && ids.length >= 2; i++) {
    const r = await checkPublic(ids).catch(() => null);
    if (!r || r.ok || !r.unknownId) break;
    const unknown = r.unknownId;
    gone.add(unknown);
    ids = ids.filter((id) => id !== unknown);
  }
  return SCENARIOS.filter((s) => s.ids.every((id) => !gone.has(id)));
}
```

`check-page.test.tsx` covers it through the page render ("scenarios render only when all their products exist"): its `@/lib/api` mock reaches this module too.

`web/app/check/page.tsx` (whole file):

```tsx
import { redirect } from "next/navigation";
import CheckResults, { CheckLegend, CheckSummary } from "@/components/check/CheckResults";
import CheckSide, { type Selected } from "@/components/check/CheckSide";
import styles from "@/components/check/check.module.css";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { checkPublic, getPublicProduct, isStub, suggestProducts } from "@/lib/api";
import { availableScenarios } from "@/lib/check-scenarios";
import { DESK_NEW, PUBLIC_NEW } from "@/lib/copy";
import type { CheckResult, PublicProduct, SuggestRow } from "@/lib/public-types";
import { CHECK } from "@/lib/public-copy";
import { CHECK_MAX, checkHref, parseCheckIds, parseQuery } from "@/lib/public-params";
export const dynamic = "force-dynamic";
export const metadata = { title: "Check interactions · IntelliDrugs" };

/** §6.7. Public scope for every session (§2.2); the selection lives only in the URL (§6.7.1). */
export default async function CheckPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sel = parseCheckIds(sp);
  const query = parseQuery(sp.q);
  if (sel.changed && (sp.q === undefined || sp.remove !== undefined || sp.clear !== undefined)) redirect(checkHref(sel.ids));

  const reads = await Promise.all(sel.ids.map((id) => getPublicProduct(id).catch(() => ({ ok: false as const, status: 0 }))));
  const unknown = sel.ids.filter((_, i) => !reads[i].ok && reads[i].status === 404);
  const selected: Selected[] = [];
  sel.ids.forEach((id, i) => {
    const r = reads[i];
    if (!r.ok) { if (r.status !== 404) selected.push({ conceptId: id, tradeName: id, display: null }); return; }
    selected.push(isStub(r.data) ? { conceptId: id, tradeName: r.data.tradeName, display: null }
      : { conceptId: id, tradeName: (r.data as PublicProduct).tradeName, display: (r.data as PublicProduct).clinicalDrug?.displayName ?? null });
  });
  let ids = selected.map((s) => s.conceptId);
  let result: CheckResult | null = null, failed = false, dropped = unknown.length > 0;
  if (ids.length >= 2) {
    let r = await checkPublic(ids);
    if (!r.ok && r.status === 404 && r.unknownId) {   // gone between the two reads
      dropped = true;
      const gone = r.unknownId;   // r is reassigned below, so the closure must not read it (TS2339 under next build)
      ids = ids.filter((id) => id !== gone);
      r = ids.length >= 2 ? await checkPublic(ids) : { ok: false, status: 0, unknownId: null };
    }
    if (r.ok) result = r.data; else failed = ids.length >= 2;
  }
  const matches: SuggestRow[] | null = !query.problem && ids.length < CHECK_MAX
    ? await suggestProducts(query.q, ids).then((r) => (r.ok ? r.data : [])).catch(() => []) : null;
  const scenarios = await availableScenarios();
  const shown = selected.filter((s) => ids.includes(s.conceptId));
  return (
    <div className={styles["s-chk"]}>
      <CheckSide ids={ids} selected={shown} matches={matches} q={query.q} scenarios={scenarios} />
      <div className={styles["s-chk-main"]}>
        {dropped && <Banner tone="info" role="status" title={PUBLIC_NEW.checker.unknownId} />}
        <CheckSummary result={result} m={ids.length} failed={failed} />
        {failed && <Banner tone="crit" role="alert" title={PUBLIC_NEW.checker.failTitle} body={PUBLIC_NEW.checker.failBody}
          action={<a className={buttonClass("tonal", "sm")} href={checkHref(ids)}>{DESK_NEW.reviewLists.tryAgain}</a>} />}
        {ids.length < 2 && <p className={styles["s-chk-empty"]}>{CHECK.emptyResults}</p>}
        {result && <CheckResults result={result} />}
        <CheckLegend />
      </div>
      <p id="check-live" className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
```

The live region sits outside the form so a re-render of the form never clears it. In `web/tests/copy.test.ts`, set `const LEGACY_EXEMPT: string[] = [];` and update its comment ("P2 rewrote both pages").

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/check-page.test.tsx tests/check-results.test.tsx tests/copy.test.ts && npm run lint:css && npx tsc --noEmit -p .`
Expected: PASS, and `tsc` reports no error (vitest does not type-check, so a closure over a reassigned `let` would only fail `next build`; the page-export rule is Next's own check, which `next build` in Task 32 Step 4 runs, and `page.tsx` now exports only `default`, `dynamic` and `metadata`).

- [ ] **Step 5: Commit**

```bash
git add web/app/check/page.tsx web/lib/check-scenarios.ts web/components/check/CheckSide.tsx web/components/check/CheckerCombobox.tsx web/lib/check-summary.ts \
  web/tests/check-page.test.tsx web/tests/copy.test.ts
git commit -m "feat(web): /check side column, canonical URL, unknown ids dropped with a banner, no-JS Find, scenarios (§6.7.1, §4.4, Review Focus 3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 31: Checker suggestions route (`/check/suggest`, §4.3)

**Files:**
- Create: `web/app/check/suggest/route.ts`
- Test: `web/tests/check-suggest-route.test.ts`

**Interfaces:**
- Consumes: `suggestProducts` (Task 17), `withRequestLog`, `Q_MIN`, `Q_MAX`, `CHECK_MAX`.
- Produces: `GET /check/suggest?q=&ids=…` → JSON array (≤ 10) of `{ conceptId, tradeName, status, clinicalDisplayName, matched }` (unapproved rows carry no clinical name, §4.3); `[]` with 200 for a short or long `q`; `[]` with 502 when the API fails; `Cache-Control: private, no-store`. The middleware's suggest limiter answers 429 with `[]` (P1A, §9.3).

- [ ] **Step 1: Write the failing test**

`web/tests/check-suggest-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const suggestProducts = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  suggestProducts: (q: string, ex: string[]) => suggestProducts(q, ex) }));
import { GET } from "@/app/check/suggest/route";

const call = (qs: string) => GET(new Request(`http://localhost/check/suggest${qs}`));
beforeEach(() => { suggestProducts.mockReset(); });

describe("/check/suggest (§4.3, §6.7.1)", () => {
  it("passes q and the current ids, and answers only the row fields the combobox prints", async () => {
    suggestProducts.mockResolvedValue({ ok: true, data: [{ conceptId: "N", tradeName: "Napa", dosageForm: "Tablet", status: "approved",
      clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: null, extra: "never forwarded" }] });
    const res = await call("?q=na&ids=A&ids=B");
    expect(suggestProducts).toHaveBeenCalledWith("na", ["A", "B"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual([{ conceptId: "N", tradeName: "Napa", status: "approved", clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: null }]);
  });
  it("a short or long q is an empty list without an API call; at most 20 ids are forwarded; an API failure is 502", async () => {
    expect(await (await call("?q=n")).json()).toEqual([]);
    expect(await (await call(`?q=${"x".repeat(101)}`)).json()).toEqual([]);
    expect(suggestProducts).not.toHaveBeenCalled();
    suggestProducts.mockResolvedValue({ ok: true, data: [] });
    await call(`?q=na${Array.from({ length: 25 }, (_, i) => `&ids=P${i}`).join("")}`);
    expect(suggestProducts.mock.calls[0][1]).toHaveLength(20);
    suggestProducts.mockResolvedValue({ ok: false, status: 503 });
    const res = await call("?q=na");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/check-suggest-route.test.ts`
Expected: FAIL (`Cannot find module '@/app/check/suggest/route'`).

- [ ] **Step 3: Write the route**

```ts
import { NextResponse } from "next/server";
import { suggestProducts } from "@/lib/api";
import { listParam } from "@/lib/params";
import { CHECK_MAX, Q_MAX, Q_MIN } from "@/lib/public-params";
import { withRequestLog } from "@/lib/request-log";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** §4.3: at most 10 rows, q of 2 or more characters, approved products' clinical names only. Rate-limited in the middleware. */
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const n = [...q].length;
  if (n < Q_MIN || n > Q_MAX) return NextResponse.json([], { headers: NO_STORE });
  const ids = listParam(url.searchParams.getAll("ids")).slice(0, CHECK_MAX);
  const r = await suggestProducts(q, ids).catch(() => ({ ok: false as const, status: 0 }));
  if (!r.ok) return NextResponse.json([], { status: 502, headers: NO_STORE });
  return NextResponse.json(r.data.slice(0, 10).map((x) => ({ conceptId: x.conceptId, tradeName: x.tradeName, status: x.status,
    clinicalDisplayName: x.status === "approved" ? x.clinicalDisplayName : null, matched: x.status === "approved" ? x.matched : null })),
    { headers: NO_STORE });
}

export const GET = withRequestLog("/check/suggest", handle);
```

- [ ] **Step 4: Run the test**

Run: `cd web && npx vitest run tests/check-suggest-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/check/suggest/route.ts web/tests/check-suggest-route.test.ts
git commit -m "feat(web): /check/suggest route, 10 rows, approved clinical names only (§4.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 32: The `CheckerCombobox` island (§6.7.1, §4.2)

**Files:**
- Modify: `web/components/check/CheckerCombobox.tsx` (becomes the island), `web/components/check/check.module.css`
- Test: `web/tests/checker-combobox.test.tsx`

**Interfaces:**
- Consumes: Task 30's form markup (`[data-remove]` submit buttons named `remove`, the `clear` submit with `aria-disabled`, `a[data-scenario]` links, `[data-check-summary]`, `#check-live`); `/check/suggest` (Task 31); `suggestionSub`, `checkHref`, `CHECK`, `PUBLIC_NEW.checker.noMatch`, `PUBLIC_NEW.checkerMax.help`, `NOT_REVIEWED`; `announce` (`lib/live-region.ts`); `useRouter` from `next/navigation`.
- Produces: the island `CheckerCombobox({ ids, max, q })` (props: "the current ids, `max` = 20", §4.2). Without JavaScript its server render is the plain field with "Find" (Task 30). With JavaScript: ARIA 1.2 combobox (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`), suggestions debounced 200 ms for 2 or more characters, excluding the current ids; ArrowDown/ArrowUp move (on a closed list ArrowDown opens at the first option, ArrowUp at the last); Enter adds; Esc closes, then clears; Tab closes. Adding, removing, Clear all and scenarios navigate with `router.replace`/`router.push`; once the server's new render lands, the island announces "{brand} added. {summary}", "{brand} removed. {summary}", "All medicines removed." or "Scenario loaded: {scenario}. {summary}" and puts focus back (the input after adding and Clear all; the remove button now at the same position, else the previous one, else the input after a removal). It imports no server module.

- [ ] **Step 1: Write the failing test**

`web/tests/checker-combobox.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const replace = vi.fn(), push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
import CheckerCombobox from "@/components/check/CheckerCombobox";

function Page({ ids, summary = "2 medicines · 1 of 1 pair checked · 0 with an interaction listed", names = {} as Record<string, string> }:
    { ids: string[]; summary?: string; names?: Record<string, string> }) {
  return (
    <>
      <form method="get" action="/check">
        <CheckerCombobox ids={ids} max={20} q="" />
        <button type="submit" name="clear" value="1" aria-disabled={ids.length === 0 ? "true" : undefined}>Clear all</button>
        <ul>{ids.map((id) => <li key={id}><b>{names[id] ?? id}</b><button type="submit" name="remove" value={id} data-remove={id}>x</button></li>)}</ul>
        <a href="/check?ids=W&ids=A" data-scenario="G Warfarin + Aspirin">G Warfarin + Aspirin</a>
      </form>
      <h2 data-check-summary="">{summary}</h2>
      <p id="check-live" aria-live="polite" aria-atomic="true" />
    </>
  );
}
const ROWS = [
  { conceptId: "N", tradeName: "Napa", status: "approved", clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: { name: "Paracetamol", substance: "Acetaminophen" } },
  { conceptId: "H", tradeName: "Hidasprin", status: "not_reviewed", clinicalDisplayName: null, matched: null },
];
const fetchMock = vi.fn();
beforeEach(() => {
  replace.mockReset(); push.mockReset();
  fetchMock.mockReset(); fetchMock.mockResolvedValue(new Response(JSON.stringify(ROWS), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const live = () => document.getElementById("check-live")!.textContent;
const input = () => screen.getByRole("combobox") as HTMLInputElement;
async function typeAndOpen(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2), { timeout: 1500 });
}

describe("CheckerCombobox (§6.7.1)", () => {
  it("server render without JavaScript: a plain field and Find; hydrated: the combobox and no Find", () => {
    const html = renderToStaticMarkup(<CheckerCombobox ids={[]} max={20} q="" />);
    expect(html).toContain(">Find</button>");
    expect(html).not.toContain('role="combobox"');
    render(<Page ids={["A"]} />);
    expect(input().getAttribute("aria-autocomplete")).toBe("list");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().getAttribute("aria-controls")).toBe("cx-list");
    expect(screen.queryByText("Find")).toBeNull();
  });

  it("fetches suggestions for 2+ characters, excluding the current ids, with the sub lines", async () => {
    render(<Page ids={["A"]} />);
    await typeAndOpen("pa");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/check/suggest?q=pa&ids=A");
    expect(screen.getByText("Acetaminophen 500 mg tablet. Matches Paracetamol, a name for Acetaminophen")).toBeTruthy();
    expect(screen.getByText("Not yet reviewed by a pharmacist")).toBeTruthy();
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });

  it("arrows move the active option, Enter adds with router.replace, clears and keeps focus; Enter never submits the form", async () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    render(<Page ids={["A"]} />);
    document.querySelector("form")!.addEventListener("submit", submit);
    await typeAndOpen("pa");
    input().focus();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("cx-opt-1");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().getAttribute("aria-activedescendant")).toBe("cx-opt-0");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(replace).toHaveBeenCalledWith("/check?ids=A&ids=N", { scroll: false });
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    expect(submit).not.toHaveBeenCalled();
  });

  it("Esc closes the list, then clears the field; Tab closes", async () => {
    render(<Page ids={[]} />);
    await typeAndOpen("pa");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().value).toBe("pa");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().value).toBe("");
  });

  it("announces the add with the new summary once the server render lands", async () => {
    const view = render(<Page ids={["A"]} />);
    await typeAndOpen("pa");
    fireEvent.keyDown(input(), { key: "Enter" });
    view.rerender(<Page ids={["A", "N"]} summary="2 medicines · 1 of 1 pair checked · 1 with an interaction listed" />);
    await waitFor(() => expect(live()).toBe("Napa added. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed"));
  });

  it("remove: focus goes to the remove button now at the same position, else the previous one, else the input", async () => {
    const view = render(<Page ids={["A", "B", "C"]} names={{ B: "Bravo" }} />);
    fireEvent.click(document.querySelector('[data-remove="B"]')!);
    expect(replace).toHaveBeenCalledWith("/check?ids=A&ids=C", { scroll: false });
    view.rerender(<Page ids={["A", "C"]} summary="2 medicines · 0 of 1 pair checked · 0 with an interaction listed" />);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-remove="C"]')));
    await waitFor(() => expect(live()).toBe("Bravo removed. 2 medicines · 0 of 1 pair checked · 0 with an interaction listed"));
    fireEvent.click(document.querySelector('[data-remove="C"]')!);
    view.rerender(<Page ids={["A"]} summary="Add at least 2 medicines to check them against each other." />);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-remove="A"]')));
    fireEvent.click(document.querySelector('[data-remove="A"]')!);
    view.rerender(<Page ids={[]} summary="Add at least 2 medicines to check them against each other." />);
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it("Clear all: nothing while aria-disabled; otherwise focus to the input and 'All medicines removed.'", async () => {
    const empty = render(<Page ids={[]} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(replace).not.toHaveBeenCalled();
    empty.unmount();
    const view = render(<Page ids={["A", "B"]} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(replace).toHaveBeenCalledWith("/check", { scroll: false });
    view.rerender(<Page ids={[]} summary="Add at least 2 medicines to check them against each other." />);
    await waitFor(() => expect(document.activeElement).toBe(input()));
    await waitFor(() => expect(live()).toBe("All medicines removed."));
  });

  it("a scenario link navigates and announces the scenario with the summary", async () => {
    const view = render(<Page ids={[]} />);
    fireEvent.click(screen.getByText("G Warfarin + Aspirin"));
    expect(push).toHaveBeenCalledWith("/check?ids=W&ids=A");
    view.rerender(<Page ids={["W", "A"]} summary="2 medicines · 1 of 1 pair checked · 1 with an interaction listed" />);
    await waitFor(() => expect(live()).toBe("Scenario loaded: G Warfarin + Aspirin. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed"));
  });

  it("at 20 medicines the input is aria-disabled and readonly, keeps focus, and asks for nothing", async () => {
    render(<Page ids={Array.from({ length: 20 }, (_, i) => `P${i}`)} />);
    expect(input().getAttribute("aria-disabled")).toBe("true");
    expect(input().readOnly).toBe(true);
    expect(input().disabled).toBe(false);
    expect(screen.getByText("20 medicines is the maximum. Remove one to add another.")).toBeTruthy();
    fireEvent.change(input(), { target: { value: "napa" } });
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/checker-combobox.test.tsx`
Expected: FAIL (the first version has no combobox role).

- [ ] **Step 3: Write the island**

`web/components/check/CheckerCombobox.tsx` (whole file):

```tsx
"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { suggestionSub } from "@/lib/check-summary";
import { NOT_REVIEWED, PUBLIC_NEW, fill } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { CHECK } from "@/lib/public-copy";
import { checkHref } from "@/lib/public-params";
import type { SuggestRow } from "@/lib/public-types";
import styles from "./check.module.css";

type Row = Pick<SuggestRow, "conceptId" | "tradeName" | "status" | "clinicalDisplayName" | "matched">;
type Pending = { message: string | null; focusRemoveAt: number | null; focusInput: boolean };
const NONE: Pending = { message: null, focusRemoveAt: null, focusInput: false };
const DEBOUNCE_MS = 200;

/**
 * Island (§4.2): the checker's ARIA 1.2 combobox, and the side column's remove, Clear all and scenario actions. The URL is
 * the only store (§6.7.1): every change navigates, the server renders the result, and once that render lands the island
 * announces it with the new summary and restores focus (§10.1, §10.2). Without JavaScript the server render is the plain
 * field with "Find" (§4.4).
 */
export default function CheckerCombobox({ ids, max, q }: { ids: string[]; max: number; q: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(-1);
  const [text, setText] = useState(q);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<Pending>(NONE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atMax = ids.length >= max;

  useEffect(() => { setReady(true); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // The server's render with the new ids has landed: announce and put focus back.
  useEffect(() => {
    const p = pending.current;
    if (p.message === null) return;
    pending.current = NONE;
    const summary = document.querySelector("[data-check-summary]")?.textContent ?? "";
    announce(document.getElementById("check-live"), p.message.replace("{summary}", summary).trim());
    if (p.focusRemoveAt !== null) {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-remove]")];
      (buttons[Math.min(p.focusRemoveAt, buttons.length - 1)] ?? input.current)?.focus();
    } else if (p.focusInput) {
      input.current?.focus();
    }
  }, [ids]);

  // Remove, Clear all and scenarios live in the server-rendered form; the island takes them over once it runs. A click on a
  // submit button (mouse, Enter or Space) is cancelled before the form submits, so the GET round trip never happens.
  useEffect(() => {
    const form = input.current?.closest("form");
    if (!form) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const btn = target?.closest<HTMLButtonElement>('button[name="remove"], button[name="clear"]');
      if (btn) {
        e.preventDefault();
        if (btn.name === "remove") {
          const brand = btn.closest("li")?.querySelector("b")?.textContent ?? btn.value;
          pending.current = { message: fill(CHECK.removedAnnounce, { brand }), focusRemoveAt: ids.indexOf(btn.value), focusInput: false };
          router.replace(checkHref(ids.filter((id) => id !== btn.value)), { scroll: false });
        } else if (btn.getAttribute("aria-disabled") !== "true") {
          pending.current = { message: CHECK.cleared, focusRemoveAt: null, focusInput: true };
          router.replace("/check", { scroll: false });
        }
        return;
      }
      const a = target?.closest<HTMLAnchorElement>("a[data-scenario]");
      if (!a) return;
      e.preventDefault();
      pending.current = { message: fill(CHECK.scenarioLoaded, { scenario: a.dataset.scenario ?? "" }), focusRemoveAt: null, focusInput: false };
      router.push(a.getAttribute("href") ?? "/check");
    };
    form.addEventListener("click", onClick);
    return () => form.removeEventListener("click", onClick);
  }, [ids, router]);

  function suggest(value: string) {
    if (timer.current) clearTimeout(timer.current);
    const v = value.trim();
    if (atMax || [...v].length < 2) { setRows([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      let data: Row[] = [];
      try {
        const params = new URLSearchParams([["q", v], ...ids.map((id): [string, string] => ["ids", id])]);
        const res = await fetch(`/check/suggest?${params}`);
        data = res.ok ? ((await res.json()) as Row[]) : [];
      } catch {
        data = [];
      }
      setRows(data);
      setActive(data.length ? 0 : -1);
      setOpen(true);
    }, DEBOUNCE_MS);
  }

  function add(r: Row) {
    pending.current = { message: fill(CHECK.added, { brand: r.tradeName }), focusRemoveAt: null, focusInput: true };
    setText("");
    setRows([]);
    setOpen(false);
    router.replace(checkHref([...ids, r.conceptId]), { scroll: false });
    input.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!rows.length) return;
      if (!open) { setOpen(true); setActive(0); } else setActive(Math.min(active + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      if (!open) { setOpen(true); setActive(rows.length - 1); } else setActive(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && rows[active]) add(rows[active]);
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); } else if (text) { e.preventDefault(); setText(""); setRows([]); }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor="cx-input" id="cx-label">{CHECK.fieldLabel}</label>
      <div className={styles["s-cbx"]}>
        <div className="search">
          <input ref={input} type="text" id="cx-input" name="q" value={text} placeholder={CHECK.placeholder} autoComplete="off"
            aria-describedby="cx-help" role={ready ? "combobox" : undefined} aria-autocomplete={ready ? "list" : undefined}
            aria-expanded={ready ? open : undefined} aria-controls={ready ? "cx-list" : undefined}
            aria-activedescendant={ready && open && active >= 0 ? `cx-opt-${active}` : undefined}
            aria-disabled={atMax ? "true" : undefined} readOnly={atMax || undefined}
            onChange={(e) => { if (atMax) return; setText(e.target.value); suggest(e.target.value); }} onKeyDown={onKeyDown} />
        </div>
        {ready && (
          <ul className={styles["s-cbx-list"]} id="cx-list" role="listbox" aria-labelledby="cx-label" hidden={!open}>
            {rows.length === 0 ? <li className={styles["s-opt-empty"]} role="presentation">{fill(PUBLIC_NEW.checker.noMatch, { q: text.trim() })}</li>
              : rows.map((r, i) => (
                <li key={r.conceptId} id={`cx-opt-${i}`} role="option" aria-selected={i === active} className={styles["s-opt"]}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => add(r)}>
                  <span className={styles["s-opt-name"]}>{r.tradeName}</span>
                  <span className={styles["s-opt-sub"]}>{r.status === "approved" ? suggestionSub(r) : NOT_REVIEWED}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
      <div className="field-meta"><span id="cx-help">{atMax ? PUBLIC_NEW.checkerMax.help : CHECK.help}</span></div>
      {!ready && <button type="submit" name="find" value="1" className="btn btn--tonal btn--sm">{PUBLIC_NEW.checker.find}</button>}
    </div>
  );
}
```

Append to `web/components/check/check.module.css` (Board P `.s-cbx` block):

```css
.s-cbx { position: relative; }
.s-cbx :global(.search) { height: 40px; border-radius: var(--r-ctl); }
.s-cbx :global(.search) input { font-size: 14px; }
.s-cbx-list { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 5; max-height: 330px; overflow: auto; padding: 6px; border-radius: var(--r-card); background: var(--surface); box-shadow: var(--shadow-2); display: flex; flex-direction: column; gap: 2px; }
.s-cbx-list[hidden] { display: none; }
.s-opt { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; border-radius: 8px; cursor: pointer; color: var(--fg); }
.s-opt:hover { background: var(--surface-2); }
.s-opt[aria-selected="true"] { background: var(--accent); color: var(--on-accent); }
.s-opt-name { font: 600 14px/1.3 var(--font-ui); }
.s-opt-sub { font-size: 12.5px; color: var(--fg-2); }
.s-opt[aria-selected="true"] .s-opt-sub { color: var(--on-accent); }
.s-opt-empty { padding: 10px; font-size: 13px; color: var(--fg-2); }
```

The island is already on the §4.2 allowlist (`components/check/CheckerCombobox.tsx`); `check-client-islands.mjs` fails the build if it imports `@/lib/api` or another server-only module, which it does not.

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/checker-combobox.test.tsx tests/check-page.test.tsx tests/client-islands.test.ts && npm run build`
Expected: PASS, and the build ends with `client island check: … all on the §4.2 allowlist`.

- [ ] **Step 5: Commit**

```bash
git add web/components/check/CheckerCombobox.tsx web/components/check/check.module.css web/tests/checker-combobox.test.tsx
git commit -m "feat(web): CheckerCombobox island: suggestions, keys, add, remove, Clear all, scenarios, announcements and focus (§6.7.1, §4.2)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 33: The sign-in card and the welcome states (§6.2 "Card" and `?welcome=1`)

**Files:**
- Modify: `web/app/signin/page.tsx`, `web/app/signin/page.module.css`
- Modify: `web/app/signin/SignInButton.tsx`, `web/app/signin/SignInButton.module.css`
- Create: `web/components/public/Welcome.tsx`
- Test: `web/tests/signin-page.test.tsx` (append), `web/tests/signin-button.test.tsx` (class assertions only)

**Interfaces:**
- Consumes: `SIGN_IN`, `SIGN_IN_STATES` (P1A), `SIGNIN_CARD` (Task 16), `PUBLIC_NEW.welcome`; `BrandIcon`, `Wordmark`, `ReviewStatus`, `Kbd`, `buttonClass`; `ROLE_LABEL` (with P1C's `senior`); `listReviewBatches`, `newestInReview` (P1B); `parseUndo`, `UNDO_COOKIE` (P1B `lib/desk-settings.ts`); `DESK.openDesk`, `DESK.searchMedicines`.
- Produces: `Welcome({ session, batch, undo })` with `batch: { id: string; waiting: number } | null`; the card markup (Board P `.s-auth`); `SignInButton` renders Board P's Google button (`.s-gbtn`, Google's glyph, the spinner and "Opening Google" while loading, its size kept) and the Turnstile status row with "Cloudflare Turnstile".

The welcome renders for any signed-in visit to `/signin` (the island lands on `/signin?welcome=1` after sign-in, §6.2 step 4). Reader: account row (initials, own name, own email), "You're signed in as a reader", the body, "Search medicines" and "Sign out". Reviewer: role badge, "Signed in as {name}", "You're a {pharmacist|engineer} reviewer for batch {id}" (senior: "You're a senior pharmacist reviewer for batch {id}"), the steps (the third is the pharmacist step for pharmacists and seniors, the engineer step for engineers; seniors get a fourth step with "Open the pair queue"), then "Open the review desk" with its note.

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/signin-page.test.tsx` (add `const listReviewBatches = vi.fn();` and mock `@/lib/api` with `listReviewBatches: () => listReviewBatches()` next to the existing mocks; in `beforeEach`, `listReviewBatches.mockResolvedValue([{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:00Z", itemCount: 10, counts: { approved: 0, issue: 0, needsReview: 10, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 9 } }])`):

```tsx
describe("/signin card and welcome states (§6.2, Board P section 2)", () => {
  it("the card: icon and wordmark, h1, sub, invite note and the privacy text with its link", async () => {
    configure();
    const html = await render();
    expect(html).toContain('<svg width="32" height="32"');
    expect(html).toContain("<b>Reviewing for the pilot?</b> Pharmacists and engineers join by invite.");
    expect(html).toContain("We use your Google name and email address only to sign you in and, for reviewers, to record each decision.");
    expect(html).toContain('<a href="/privacy">Privacy</a>');
  });

  it("a reader's welcome: own name and email once, the heading, Search medicines and Sign out", async () => {
    getSession.mockResolvedValue({ email: "nusrat@example.org", name: "Nusrat Jahan", role: "user" });
    const html = await render();
    expect(html).toContain("You&#x27;re signed in as a reader");
    expect(html.match(/nusrat@example\.org/g)).toHaveLength(1);
    expect(html).toContain('<span aria-hidden="true" class="avatar">NJ</span>');
    expect(html).toContain('href="/search">Search medicines</a>');
    expect(html).toContain('<form method="post" action="/signout">');
    expect(html).not.toContain('data-testid="island"');
  });

  it("a pharmacist's welcome: badge, batch heading, the three steps with the undo window, the desk button", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    const html = await render();
    expect(html).toContain('<span class="role-badge">Pharmacist</span>');
    expect(html).toContain("Signed in as Farhana Islam");
    expect(html).toContain("You&#x27;re a pharmacist reviewer for batch 0001-pilot");
    expect(html).toContain("10 records are waiting. Each shows <span class=\"rv rv--pending\">Not yet reviewed by a pharmacist</span> until a pharmacist approves it.");
    expect(html).toContain("You have 8 seconds to undo with");
    expect(html).toContain("Your approval publishes the record.");
    expect(html).toContain('href="/review">Open the review desk</a>');
    expect(html).toContain("Shortcuts work inside the desk only, and pause while you type.");
    expect(html).not.toContain("pharm@example.org");
  });

  it("an engineer's third step is the engineer step; a senior gets the senior heading and the pair-queue step", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", name: "Eng", role: "engineer" });
    const eng = await render();
    expect(eng).toContain("You&#x27;re a engineer reviewer for batch 0001-pilot");
    expect(eng).toContain("Your check is recorded but does not publish. A pharmacist approves each record.");
    expect(eng).not.toContain("Your approval publishes the record.");
    expect(eng).toContain('<span class="role-badge">Engineer</span>');
    expect(eng).toContain("Signed in as Eng");
    expect(eng).not.toContain("eng@example.org");
    getSession.mockResolvedValue({ email: "senior@example.org", name: "Senior", role: "senior" });
    const sen = await render();
    expect(sen).toContain("You&#x27;re a senior pharmacist reviewer for batch 0001-pilot");
    expect(sen).toContain("Your approval publishes the record.");
    expect(sen).toContain("Senior review shows every interaction pair between the medicines we hold, from all batches.");
    expect(sen).toContain('href="/review/pairs">Open the pair queue</a>');
  });

  it("no batch in review (or the list fails): no batch heading and no waiting step, never 'for batch ' with no id", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    for (const fail of [false, true]) {
      if (fail) listReviewBatches.mockRejectedValue(new Error("down")); else listReviewBatches.mockResolvedValue([]);
      const html = await render();
      expect(html).not.toContain("reviewer for batch");
      expect(html).not.toContain("records are waiting");
      expect(html).toContain("Signed in as Farhana Islam");
      expect(html).toContain('href="/review">Open the review desk</a>');
    }
  });
});
```

The engineer heading is Board P's template with the role word: "You're a {pharmacist|engineer} reviewer for batch {id}" (§6.2), so it reads "You're a engineer reviewer …" exactly as the spec writes it; the assertion pins that literal. If the product owner prefers "an engineer", that is a spec change first (§12.2).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/signin-page.test.tsx`
Expected: FAIL (the page shows "Signed in as …" only).

- [ ] **Step 3: The welcome component**

`web/components/public/Welcome.tsx`:

```tsx
import { buttonClass } from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import { SIGNIN_CARD } from "@/lib/public-copy";
import { DESK, fillNodes } from "@/lib/review-copy";
import { ROLE_LABEL } from "@/lib/reviewers";
import type { Session } from "@/lib/session";
import styles from "@/app/signin/page.module.css";

const initials = (s: Session) => ((s.name ?? "").trim() || s.email)
  .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

function SignOut() {
  return <form method="post" action="/signout"><button type="submit" className={buttonClass("plain", "sm")}>{SIGNIN_CARD.signOut}</button></form>;
}

/** §6.2 welcome states. Own name and email only to their owner, in the reader's account row (§9.7). */
export default function Welcome({ session, batch, undo }: { session: Session; batch: { id: string; waiting: number } | null; undo: number }) {
  const name = (session.name ?? "").trim() || session.email;
  if (session.role === "user") {
    return (
      <div className={styles.state}>
        <div className={styles.acct}>
          <span aria-hidden="true" className="avatar">{initials(session)}</span>
          <span className={styles.acctTxt}><b>{name}</b>{session.email !== name && session.email}</span>
        </div>
        <h2 className={styles.h2}>{SIGNIN_CARD.readerHeading}</h2>
        <p>{SIGNIN_CARD.readerBody}</p>
        <div className={styles.row}><a className={buttonClass("primary", "sm")} href="/search">{DESK.searchMedicines}</a><SignOut /></div>
      </div>
    );
  }
  const senior = session.role === "senior";
  const id = batch?.id ?? "";
  return (
    <div className={styles.state}>
      <p className={styles.row}><span className="role-badge">{ROLE_LABEL[session.role]}</span><span className={styles.who}>{fill(SIGNIN_CARD.signedInAs, { name })}</span></p>
      {batch && <h2 className={styles.h2}>{senior ? fill(PUBLIC_NEW.welcome.welcomeSeniorHeading, { id }) : fill(SIGNIN_CARD.reviewerHeading, { role: session.role, id })}</h2>}
      <ol className={styles.next}>
        {batch && <li><span>{fillNodes(SIGNIN_CARD.stepWaiting, { n: batch.waiting, pill: <ReviewStatus status="pending" /> })}</span></li>}
        <li><span>{fillNodes(SIGNIN_CARD.stepCompare, { a: <Kbd keys="A" />, undo, u: <Kbd keys="U" /> })}</span></li>
        <li><span>{session.role === "engineer" ? PUBLIC_NEW.welcome.welcomeEngineerStep
          : fillNodes(SIGNIN_CARD.stepPharmacist, { pill: <ReviewStatus status="back_in_review" /> })}</span></li>
        {senior && <li><span>{PUBLIC_NEW.welcome.welcomeSeniorStep} <a href="/review/pairs">{PUBLIC_NEW.welcome.openPairQueue}</a></span></li>}
      </ol>
      <div className={styles.row}><a className={buttonClass("primary")} href="/review">{DESK.openDesk}</a><span className={styles.who}>{SIGNIN_CARD.shortcutsNote}</span></div>
    </div>
  );
}
```

The reader's account row shows the email once: when the account has no Google name, the name line is the email and the second line is left out. When no batch is in review (or the batch list fails), the reviewer heading and the "{n} records are waiting" step are left out rather than printing "for batch " with no id: the spec gives no copy for that state (recorded as a spec gap).

- [ ] **Step 4: The page and the island's Board P button**

`web/app/signin/page.tsx` (whole file; P1A's configuration and return-path logic unchanged, the markup becomes Board P's card, and a signed-in visit renders the welcome state):

```tsx
import { cookies } from "next/headers";
import Welcome from "@/components/public/Welcome";
import { newestInReview } from "@/components/review/ReviewAccount";
import Banner from "@/components/ui/Banner";
import BrandIcon from "@/components/ui/BrandIcon";
import Wordmark from "@/components/ui/Wordmark";
import { listReviewBatches } from "@/lib/api";
import { SIGN_IN, SIGN_IN_STATES } from "@/lib/copy";
import { parseUndo, UNDO_COOKIE } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { SIGNIN_CARD } from "@/lib/public-copy";
import { safeReturnTo } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import SignInButton, { type FirebaseWebConfig } from "./SignInButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · IntelliDrugs" };

/** §6.2: Board P's sign-in card (P1A's function inside it) and, once signed in, the welcome state (?welcome=1). */
export default async function SignInPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string | string[] }> }) {
  const session = await getSession();
  const brand = <div className={styles.brand}><BrandIcon size={32} /><Wordmark size={19} /></div>;

  if (session) {
    const batches = session.role === "user" ? [] : await listReviewBatches().catch(() => []);
    const id = newestInReview(batches);
    const b = batches.find((x) => x.batchId === id);
    const undo = parseUndo((await cookies()).get(UNDO_COOKIE)?.value);
    return (
      <section className={styles.stage}>
        <div className={styles.card}>
          {brand}
          <h1 className={styles.h1}>{SIGN_IN.heading}</h1>
          <Welcome session={session} batch={b ? { id: b.batchId, waiting: b.counts.needsReview } : null} undo={undo} />
        </div>
      </section>
    );
  }

  const origin = siteOrigin();
  const returnTo = safeReturnTo(firstParam((await searchParams)?.returnTo), origin);
  const config: FirebaseWebConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const siteKey = turnstileSiteKey();
  const configured = Object.values(config).every((v) => v.length > 0);
  return (
    <section className={styles.stage}>
      <div className={styles.card}>
        {brand}
        <div><h1 className={styles.h1}>{SIGN_IN.heading}</h1><p className={styles.sub}>{SIGN_IN.sub}</p></div>
        {configured && siteKey ? (
          <>
            <SignInButton config={config} siteKey={siteKey} returnTo={returnTo} siteOrigin={origin} nonce={await cspNonce()} />
            <noscript><p>{SIGN_IN_STATES.noScript}</p></noscript>
          </>
        ) : (
          <Banner tone="info" role="note" title={SIGN_IN_STATES.notConfiguredTitle} body={SIGN_IN_STATES.notConfiguredBody} />
        )}
        <div className={styles.invite}><span className="ico" aria-hidden="true" /><p><b>{SIGNIN_CARD.inviteLead}</b> {SIGNIN_CARD.inviteBody}</p></div>
        <p className={styles.privacy}>{SIGNIN_CARD.privacy} <a href="/privacy">{SIGNIN_CARD.privacyLink}</a></p>
      </div>
    </section>
  );
}
```

In `web/tests/signin-page.test.tsx`, the P1A case "when already signed in shows the role and a sign-out form, never the email" is replaced by the welcome cases above (an engineer's welcome names the engineer and never the email; the reader's welcome carries the sign-out form). The other P1A cases hold unchanged: the island props, the safe `returnTo`, and the not-configured banner.

The `Welcome` component reads `session.role` and, for a senior, `ROLE_LABEL.senior` ("Senior pharmacist", P1C).

`web/app/signin/page.module.css` (whole file; Board P `.s-auth` block):

```css
.stage { display: flex; justify-content: center; padding: clamp(16px, 3vw, 32px); }
.card { width: 100%; max-width: 400px; background: var(--surface); border-radius: var(--r-win); box-shadow: var(--shadow-2); padding: 30px 26px 22px; display: flex; flex-direction: column; gap: 18px; }
.brand { display: flex; align-items: center; gap: 10px; }
.h1 { font: 600 24px/1.15 var(--font-ui); letter-spacing: -.022em; }
.sub { color: var(--fg-2); font-size: 14.5px; margin-top: 6px; }
.invite { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 10px; padding: 14px; border-radius: 12px; box-shadow: inset 0 0 0 1px var(--line-strong); font-size: 13.5px; color: var(--fg-2); }
.invite :global(.ico) { --ico: var(--i-info); color: var(--accent); margin-top: 2px; }
.invite b { color: var(--fg); font-weight: 600; }
.privacy { font-size: 12.5px; color: var(--fg-2); }
.state { display: flex; flex-direction: column; gap: 12px; }
.h2 { font: 600 16px/1.3 var(--font-ui); letter-spacing: -.01em; }
.state p { font-size: 13.5px; color: var(--fg-2); }
.row { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.who { font-size: 13px; color: var(--fg-2); }
.next { display: flex; flex-direction: column; gap: 8px; counter-reset: nx; }
.next li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; font-size: 13.5px; color: var(--fg); }
.next li::before { counter-increment: nx; content: counter(nx); width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font: 600 11.5px/1 var(--font-ui); color: var(--accent); box-shadow: inset 0 0 0 1.5px var(--accent-line); }
.acct { display: flex; align-items: center; gap: 12px; min-width: 0; }
.acct :global(.avatar) { width: 36px; height: 36px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font: 600 13px/1 var(--font-ui); flex: none; }
.acctTxt { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; color: var(--fg-2); overflow-wrap: anywhere; }
.acctTxt b { color: var(--fg); font-weight: 600; font-size: 14px; }
@media (max-width: 440px) { .card { padding: 24px 18px 18px; } }
```

`web/app/signin/SignInButton.tsx`: replace the `<Button …>{SIGN_IN.button}</Button>` and the `TurnstileField` line with Board P's button and status row (the island's logic is unchanged):

```tsx
      <button ref={googleButton} type="button" className={styles.gbtn} aria-disabled={disabled ? "true" : undefined}
        aria-busy={status === "loading" ? "true" : undefined} onClick={disabled ? undefined : signIn}>
        {status === "loading"
          ? <><span className="btn-spinner" aria-hidden="true" /><span>{SIGN_IN.loading}</span></>
          : <><GoogleGlyph /><span>{SIGN_IN.button}</span></>}
      </button>
      {status === "loading" && <p className={styles.hint}>{SIGN_IN.loadingHint}</p>}
      <div className={styles.turn}>
        <TurnstileField siteKey={siteKey} action="signin" nonce={nonce} resetKey={resetKey} onToken={onToken}
          onError={() => setStatus("captcha")} />
        <span className={styles.turnBy}>{SIGNIN_CARD.turnstile}</span>
      </div>
```

with, above the component:

```tsx
/** Google's "G" in Google's own colours (tokens --g-*), as Board P draws it. Decorative: the button's text names it. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="var(--g-red)" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="var(--g-blue)" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="var(--g-yellow)" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="var(--g-green)" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
```

(import `SIGNIN_CARD` from `@/lib/public-copy`; keep the `Button` import, the retry and continue-in-tab banners use it). Append to `web/app/signin/SignInButton.module.css`:

```css
/* Board P .s-gbtn and .s-turn */
.gbtn { position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 44px; padding: 0 12px; border: 0; border-radius: var(--r-ctl); background: var(--surface); color: var(--fg); box-shadow: inset 0 0 0 1px var(--line-ctl); font: 600 14px/1 var(--font-ui); letter-spacing: -.005em; cursor: pointer; transition: transform var(--dur-press) var(--ease-std); }
.gbtn::before { content: ""; position: absolute; inset: 0; z-index: -1; background: currentColor; opacity: 0; transition: opacity var(--dur-state) var(--ease-std); }
.gbtn:hover::before { opacity: var(--sl-hover); }
.gbtn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.gbtn:active { transform: scale(.97); }
.gbtn[aria-busy="true"] { cursor: progress; }
.gbtn svg { width: 20px; height: 20px; flex: none; }
.turn { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); font-size: 12.5px; color: var(--fg-2); }
.turnBy { margin-left: auto; font-size: 11.5px; }
@media (prefers-reduced-motion: reduce) { .gbtn:active { transform: none; } }
```

In `web/tests/signin-button.test.tsx`, any assertion on the old `btn btn--primary btn--lg` class of the Google button becomes an assertion on `gbtn`; the role-and-name queries ("Continue with Google", "Opening Google" with `aria-busy="true"`) hold unchanged.

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run tests/signin-page.test.tsx tests/signin-button.test.tsx tests/client-islands.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/app/signin/page.tsx web/app/signin/page.module.css web/app/signin/SignInButton.tsx web/app/signin/SignInButton.module.css \
  web/components/public/Welcome.tsx web/tests/signin-page.test.tsx web/tests/signin-button.test.tsx
git commit -m "feat(web): Board P sign-in card and the welcome states, senior step included (§6.2)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 34: Partner access (`/partners`, §6.9)

**Files:**
- Create: `web/app/partners/page.tsx`, `web/app/partners/page.module.css`
- Create: `web/lib/public-actions.ts`
- Modify: `web/lib/actions-core.ts` (`submitPartnerRequest`, `PARTNER_KINDS`, `PARTNER_VOLUMES`)
- Test: `web/tests/partners.test.tsx`

**Interfaces:**
- Consumes: `requestPartnerAccess` (Task 17); `allowAccountAction("partner", …)` (P1A, 3 per day); `verifyTurnstile(…, "partner")`; `requestId()`; `logRequest`; `PUBLIC_NEW.partner`, `PARTNERS`, `LANDING` (partner band), `NO_PHI_HELP`, `FLAG_OUTCOME` (Task 26); `Field`, `Button`, `TurnstileField`.
- Produces:
  - `submitPartnerRequest(fd: FormData): Promise<ActionResult<FlagCode>>` (forbidden without a session; invalid on any field rule; failed when over the daily limit or the API fails; captcha when Turnstile fails; sent otherwise). Message: `Organisation: …\nKind: …\nVolume: …\nUse: …`, at most 2000 characters; the reporter email comes from the session.
  - `partnerRequestAction(formData)` ("use server"): logs `action:partner`, then redirects to `/partners?partner={code}#request`.
  - `PARTNER_KINDS = ["EMR", "Pharmacy", "Pharma company", "Other"]`, `PARTNER_VOLUMES = ["Under 1,000", "1,000–10,000", "Over 10,000"]` (the option values are the §6.9 labels, imported from `PUBLIC_NEW.partner`).

- [ ] **Step 1: Write the failing tests**

`web/tests/partners.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn(), requestPartnerAccess = vi.fn(), verifyTurnstile = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  requestPartnerAccess: (...a: unknown[]) => requestPartnerAccess(...a) }));
vi.mock("@/lib/turnstile", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: (...a: unknown[]) => verifyTurnstile(...a) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1", "x-request-id": "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/public-actions", () => ({ partnerRequestAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import PartnersPage from "@/app/partners/page";
import { createLimits } from "@/lib/limits";
import { submitPartnerRequest } from "@/lib/actions-core";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); f.set("cf-turnstile-response", "tok"); return f; };
const GOOD = { organisation: "Acme Health", kind: "EMR", use: "Check a patient's medicines at the prescribing step.", volume: "Under 1,000" };
const render = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await PartnersPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  getSession.mockReset(); getSession.mockResolvedValue({ email: "me@example.org", name: "Me", role: "user" });
  requestPartnerAccess.mockReset(); requestPartnerAccess.mockResolvedValue({ ok: true, data: { id: 1 } });
  verifyTurnstile.mockReset(); verifyTurnstile.mockResolvedValue(true);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("/partners (§6.9)", () => {
  it("the band and the API status, then the form with its four fields, the no-PHI help and the bot check", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("For partners: the same records, by API");
    expect(html).toContain('href="/learn/partners"');
    for (const label of ["Organisation", "Kind of system", "What you will build", "Expected checks per day"]) expect(html).toContain(label);
    for (const opt of ["EMR", "Pharmacy", "Pharma company", "Other", "Under 1,000", "1,000–10,000", "Over 10,000"]) expect(html).toContain(`>${opt}</option>`);
    expect(html).toContain("Don&#x27;t include patient names or other personal health details.");
    expect(html).toContain(">Request partner access</button>");
  });

  it("signed out: the sign-in line and link, no form", async () => {
    getSession.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Sign in first. Access is granted by the IntelliDrugs team.");
    expect(html).toContain('href="/signin?returnTo=%2Fpartners"');
    expect(html).not.toContain("<form");
  });

  it("sent: the success line names the requester's own email; errors use the flag outcome map", async () => {
    expect(await render({ partner: "sent" })).toContain("Request sent. The IntelliDrugs team replies to me@example.org.");
    expect(await render({ partner: "captcha" })).toContain("The verification check failed. Please try again.");
    const odd = await render({ partner: "<script>" });   // an unknown outcome code shows nothing, never the code itself
    expect(odd).not.toContain("&lt;script&gt;");
    expect(odd).not.toContain('role="alert"');
  });
});

describe("submitPartnerRequest (§6.9, §9.3)", () => {
  it("stores one flag on other/partner-access with the four lines and the session email", async () => {
    expect(await submitPartnerRequest(fd(GOOD), createLimits())).toEqual({ status: 200, code: "sent" });
    const [message, email, rid] = requestPartnerAccess.mock.calls[0];
    expect(message).toBe("Organisation: Acme Health\nKind: EMR\nVolume: Under 1,000\nUse: Check a patient's medicines at the prescribing step.");
    expect(email).toBe("me@example.org");
    expect(rid).toBe("11111111-1111-4111-8111-111111111111");
    expect(verifyTurnstile.mock.calls[0][2]).toBe("partner");
  });

  it("refuses a missing session, each bad field, and a failed bot check, without calling the API", async () => {
    getSession.mockResolvedValueOnce(null);
    expect((await submitPartnerRequest(fd(GOOD), createLimits())).code).toBe("forbidden");
    for (const bad of [{ organisation: "A" }, { organisation: "x".repeat(201) }, { kind: "Hospital" }, { use: "too short" },
      { use: "x".repeat(1501) }, { volume: "Lots" }])
      expect((await submitPartnerRequest(fd({ ...GOOD, ...bad }), createLimits())).code, JSON.stringify(bad)).toBe("invalid");
    verifyTurnstile.mockResolvedValueOnce(false);
    expect((await submitPartnerRequest(fd(GOOD), createLimits())).code).toBe("captcha");
    expect(requestPartnerAccess).not.toHaveBeenCalled();
  });

  it("counts Bengali and emoji in characters, not UTF-16 units", async () => {
    expect((await submitPartnerRequest(fd({ ...GOOD, use: "প্রেসক্রিপশনের সময় ওষুধ মিলিয়ে দেখা" }), createLimits())).code).toBe("sent");
    expect((await submitPartnerRequest(fd({ ...GOOD, use: "\u{1F600}".repeat(19) }), createLimits())).code).toBe("invalid");
  });

  it("three requests a day per account, then failed", async () => {
    const limits = createLimits();
    for (let i = 0; i < 3; i++) expect((await submitPartnerRequest(fd(GOOD), limits)).code).toBe("sent");
    expect((await submitPartnerRequest(fd(GOOD), limits)).code).toBe("failed");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/partners.test.tsx`
Expected: FAIL (`Cannot find module '@/app/partners/page'`).

- [ ] **Step 3: The action core and the server action**

Append to `web/lib/actions-core.ts` (add `import { requestPartnerAccess } from "./api";`, `import { PUBLIC_NEW } from "./copy";`, `import { LIMITS, type Limits } from "./limits";` next to the existing imports):

```ts
const P = PUBLIC_NEW.partner;
export const PARTNER_KINDS: readonly string[] = [P.kindEmr, P.kindPharmacy, P.kindPharma, P.kindOther];
export const PARTNER_VOLUMES: readonly string[] = [P.volumeLow, P.volumeMid, P.volumeHigh];
export const ORG_MIN = 2, ORG_MAX = 200, USE_MIN = 20, USE_MAX = 1500;
const chars = (s: string) => [...s].length;

/**
 * §6.9 partner access request: a flag on (other, partner-access) (D17), at most 3 per account per day (§9.3), bot check
 * action "partner" (§9.2). Order as every write here: session, fields, limit, Turnstile, API. The email is the session's.
 */
export async function submitPartnerRequest(fd: FormData, limits: Limits = LIMITS): Promise<ActionResult<FlagCode>> {
  const session = await getSession();
  if (!session) return { status: 403, code: "forbidden" };
  const organisation = field(fd, "organisation").trim(), kind = field(fd, "kind"), use = field(fd, "use").trim(), volume = field(fd, "volume");
  if (chars(organisation) < ORG_MIN || chars(organisation) > ORG_MAX || !PARTNER_KINDS.includes(kind)
      || chars(use) < USE_MIN || chars(use) > USE_MAX || !PARTNER_VOLUMES.includes(volume)) return { status: 400, code: "invalid" };
  if (!allowAccountAction("partner", session.email, limits)) return { status: 429, code: "failed" };
  if (!(await turnstilePassed(fd, "partner"))) return { status: 403, code: "captcha" };
  const message = `Organisation: ${organisation}\nKind: ${kind}\nVolume: ${volume}\nUse: ${use}`;
  const r = await requestPartnerAccess(message, session.email, await requestId());
  if (r.ok) {
    revalidatePath("/review/flags");
    return { status: 200, code: "sent" };
  }
  return r.status === 400 ? { status: 400, code: "invalid" } : { status: 502, code: "failed" };
}
```

The longest message is 200 + 1500 characters plus the four labels and the longest choices, under the API's 2000.

`web/lib/public-actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { submitPartnerRequest } from "./actions-core";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";

/** §6.9. The only export: every export of a "use server" module is a callable endpoint. Logs the outcome, never a field (§9.7). */
export async function partnerRequestAction(formData: FormData): Promise<void> {
  const started = performance.now();
  const { status, code } = await submitPartnerRequest(formData);
  logRequest({ route: "action:partner", method: "POST", status, ms: performance.now() - started, requestId: await requestId() });
  redirect(`/partners?${new URLSearchParams({ partner: code })}#request`);
}
```

- [ ] **Step 4: The page**

`web/app/partners/page.tsx`:

```tsx
import TurnstileField from "@/components/TurnstileField";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { FLAG_OUTCOME } from "@/components/public/ReportProblem";
import { ORG_MAX, ORG_MIN, PARTNER_KINDS, PARTNER_VOLUMES, USE_MAX, USE_MIN } from "@/lib/actions-core";
import { NO_PHI_HELP, PUBLIC_NEW, fill } from "@/lib/copy";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { LANDING, NAV, PARTNERS } from "@/lib/public-copy";
import { partnerRequestAction } from "@/lib/public-actions";
import { getSession } from "@/lib/session";
import { turnstileSiteKey } from "@/lib/turnstile";
import styles from "./page.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "For partners · IntelliDrugs" };

const P = PUBLIC_NEW.partner;

/** §6.9: Board P's partner band and Learn chapter 8's "Where the API stands", condensed; the request form for signed-in visitors. */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await getSession();
  const outcome = firstParam(sp.partner);
  const siteKey = turnstileSiteKey();
  const message = outcome === "sent" && session ? fill(P.sent, { email: session.email }) : FLAG_OUTCOME[outcome];
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>{PARTNERS.h1}</h1>
      <section aria-labelledby="partners-band">
        <h2 id="partners-band" className={styles.h2}>{LANDING.partnersHeading}</h2>
        <p className={styles.sub}>{LANDING.partnersSub}</p>
        <ul className={styles.ticks}>
          <li>{LANDING.partnerTicks[0]}</li>
          <li>{LANDING.partnerTicks[1]}<b>{LANDING.partnerTickBold}</b>.</li>
          <li>{LANDING.partnerTicks[2]}<span className="mono">{LANDING.partnerEnvelope}</span>.</li>
        </ul>
      </section>
      <section aria-labelledby="api-stands">
        <h2 id="api-stands" className={styles.h2}>{PARTNERS.apiHeading}</h2>
        <p className={styles.sub}>{PARTNERS.apiNow} <a href="/learn/partners">{PARTNERS.learnMore}</a></p>
      </section>
      <section id="request" aria-labelledby="request-h" className={styles.card}>
        <h2 id="request-h" className={styles.h2}>{PARTNERS.formHeading}</h2>
        {message && <p role={outcome === "sent" ? "status" : "alert"}>{message}</p>}
        {!session ? (
          <p>{LANDING.requestNote} <a href={`/signin?${new URLSearchParams({ returnTo: "/partners" })}`}>{NAV.signIn}</a></p>
        ) : outcome === "sent" ? null : (
          <form action={partnerRequestAction} className={styles.form}>
            <Field id="p-org" label={P.organisation} control={<input className="input" name="organisation" required minLength={ORG_MIN} maxLength={ORG_MAX} />} />
            <Field id="p-kind" label={P.kind} control={<select className="input" name="kind" required>{PARTNER_KINDS.map((k) => <option key={k}>{k}</option>)}</select>} />
            <Field id="p-use" label={P.use} help={`${P.useHelp} ${NO_PHI_HELP}`}
              control={<textarea className="textarea" name="use" required minLength={USE_MIN} maxLength={USE_MAX} rows={5} />} />
            <Field id="p-volume" label={P.volume} control={<select className="input" name="volume" required>{PARTNER_VOLUMES.map((v) => <option key={v}>{v}</option>)}</select>} />
            {siteKey ? <TurnstileField siteKey={siteKey} action="partner" nonce={await cspNonce()} /> : null}
            <Button variant="primary" type="submit">{LANDING.requestAccess}</Button>
          </form>
        )}
      </section>
    </div>
  );
}
```

`web/app/partners/page.module.css`:

```css
.page { max-width: 860px; margin: 0 auto; padding: 32px 40px 48px; display: flex; flex-direction: column; gap: 32px; }
.h1 { font: var(--t-title1); letter-spacing: var(--tr-title1); }
.h2 { font: var(--t-title2); letter-spacing: var(--tr-title2); }
.sub { color: var(--fg-2); font-size: 16px; margin-top: 12px; max-width: 62ch; }
.ticks { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.ticks li { display: grid; grid-template-columns: 6px minmax(0, 1fr); gap: 12px; font-size: 14.5px; color: var(--fg-2); }
.ticks li::before { content: ""; width: 6px; height: 6px; margin-top: 9px; background: var(--accent); }
.ticks b { color: var(--fg); font-weight: 600; }
.card { padding: 22px; border-radius: var(--r-panel); box-shadow: inset 0 0 0 1px var(--line-strong); display: flex; flex-direction: column; gap: 14px; }
.form { display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 720px) { .page { padding: 24px 16px 40px; } }
```

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run tests/partners.test.tsx tests/copy.test.ts tests/client-islands.test.ts && npm run lint:css`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/app/partners/page.tsx web/app/partners/page.module.css web/lib/public-actions.ts web/lib/actions-core.ts web/tests/partners.test.tsx
git commit -m "feat(web): /partners with the partner access request, stored as a flag, 3 a day, bot-checked (§6.9, D17, §9.3)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 35: The privacy page and the partner-requests runbook

**Files:**
- Create: `web/app/privacy/page.tsx`
- Create: `docs/runbooks/partner-requests.md`
- Modify: `README.md` (one link)
- Test: `web/tests/privacy-page.test.tsx`, `web/tests/runbook.test.ts` (append)

**Interfaces:**
- Consumes: `SIGNIN_CARD.privacy`, `PUBLIC_NEW.privacy`, `NAV.privacy`.
- Produces: `/privacy` (§9.7: the sign-in card's words, the audit-trail paragraph, the no-PHI sentence); `docs/runbooks/partner-requests.md` (§2.2, §6.9: the team reads a request's reply address with a read-only query that needs database access; the address is never rendered by the web app).

- [ ] **Step 1: Write the failing tests**

`web/tests/privacy-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { NO_PHI_HELP } from "@/lib/copy";

describe("/privacy (§9.7)", () => {
  const html = renderToStaticMarkup(<PrivacyPage />);
  it("states the sign-in card's privacy text, the audit trail and the no-PHI sentence", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Privacy</h1>");
    expect(html).toContain("We use your Google name and email address only to sign you in and, for reviewers, to record each decision.");
    expect(html).toContain("Each reviewer decision and sign-in is recorded with the account and time, for the team&#x27;s audit trail. These records are never public.");
    expect(html).toContain("in notes, reports or requests. We don&#x27;t ask for patient information.");
    expect(html.replace(/&#x27;/g, "'")).toContain(NO_PHI_HELP.slice(0, -1));
  });
});
```

Append to `web/tests/runbook.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/privacy-page.test.tsx tests/runbook.test.ts`
Expected: FAIL (`Cannot find module '@/app/privacy/page'`, runbook missing).

- [ ] **Step 3: The page**

`web/app/privacy/page.tsx`:

```tsx
import { PUBLIC_NEW } from "@/lib/copy";
import { NAV, SIGNIN_CARD } from "@/lib/public-copy";
export const metadata = { title: "Privacy · IntelliDrugs" };

/** §9.7: "in the words of the sign-in card plus the audit-trail paragraph", and the no-PHI sentence. No data is read. */
export default function PrivacyPage() {
  return (
    <article>
      <h1>{NAV.privacy}</h1>
      <p>{SIGNIN_CARD.privacy}</p>
      <p>{PUBLIC_NEW.privacy.audit}</p>
      <p>{PUBLIC_NEW.privacy.noPhi}</p>
    </article>
  );
}
```

- [ ] **Step 4: The runbook and its README link**

`docs/runbooks/partner-requests.md`:

````markdown
# Reading and answering partner access requests

A signed-in visitor asks for partner access on `/partners` (spec §6.9). The request is stored as a flag on
`(other, partner-access)` (D17) with the requester's email from their session. The web app never renders anyone's email
(§2.2): `/review/flags` lists the requests under "Partner access requests" without the address. The team reads the reply
address with the query below, which needs database access on the host.

Emails are personal data. Copy an address only into the team mailbox's reply, never into this repository, an issue, a PR,
a chat channel or a log.

## 1. See the open requests

Sign in at https://drugdb.eliooo.org/review/flags with a reviewer account. Each request shows its id, its date and the
four lines the requester entered (organisation, kind of system, expected checks per day, what they will build).

## 2. Read the reply address (host, read-only)

```bash
ssh ec2-user@<host>
cd ~/drugdb/deploy && docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d bddrug -At -F "|"' <<'SQL'
SELECT id, to_char(created_at AT TIME ZONE 'Asia/Dhaka', 'DD/MM/YYYY HH24:MI'), reporter_email
FROM ops.flag
WHERE target_type = 'other' AND target_id = 'partner-access' AND status = 'open'
ORDER BY created_at;
SQL
```

The transaction is read-only (`default_transaction_read_only=on`) and stops at the first error, so a mistyped edit
cannot write. The output names each request id with its Dhaka date and reply address.

## 3. Reply, then resolve

Reply from the team mailbox to the address for that id. Then resolve the request on `/review/flags` with Resolve (the
bot check runs; the `flag_resolved` audit row records who resolved it). Close the terminal: the address must not stay in
scrollback on a shared machine.
````

`README.md`: after the paragraph that links `docs/runbooks/reviewer-invite.md` ("To invite a new pharmacist or engineer …"), add the paragraph

```markdown
To read and answer partner access requests (the read-only reply-address query), follow [`docs/runbooks/partner-requests.md`](docs/runbooks/partner-requests.md).
```

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run tests/privacy-page.test.tsx tests/runbook.test.ts tests/copy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/app/privacy/page.tsx web/tests/privacy-page.test.tsx web/tests/runbook.test.ts docs/runbooks/partner-requests.md README.md
git commit -m "docs(web): /privacy page and the partner-requests runbook (read-only reply-address query) (§9.7, §6.9)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 36: Remove the pre-P2 public code

**Files:**
- Delete: `web/components/FlagForm.tsx`, `web/tests/flag-form.test.tsx` (replaced by `ReportProblem` and its tests, Task 26)
- Delete: `web/components/badges.tsx`, `web/components/badges.module.css`, `web/app/legacy.module.css`
- Delete: `web/tests/api.test.ts` (replaced by `web/tests/public-api.test.ts`, Task 17)
- Modify: `web/lib/api.ts` (drop the pre-P2 public readers and their types)
- Modify: `web/tests/api-scope.test.ts` (its "public reads" block reads through the §7.4 readers)
- Create: `web/tests/legacy-removed.test.ts`

**Interfaces:**
- Consumes: Tasks 17–30 (no page imports the old readers any more: Task 20 rewrote `/`, Task 23 `/products/[id]`, Task 27 `/substances/[id]`, Task 30 `/check`).
- Produces: `lib/api.ts` without `searchProducts`, `SearchResult`, `getProduct`, `Product`, `Ingredient`, `ClinicalDrug`, `HiddenProduct`, `HiddenSubstance`, `LoadedProduct`, `listLoadedProducts`, `Substance`, `getSubstance`, `AlertSide`, `Alert`, `CheckResult`, `CheckOutcome` and `checkInteractions`. Kept: `isHidden` (`isStub` uses it), `DdinterRef` and `ClinicalIngredient` (`lib/format.ts` uses them), `getStats`, every review reader and every write. Components `components/Turnstile.tsx` stays: the review record page and `ConfirmPanel` use it.

The API endpoints the old readers called (`GET /v1/products?q=`, `GET /v1/products/loaded`) stay: they are partner-facing and Learn chapter 8 lists them. Only the web callers go.

- [ ] **Step 1: Write the failing guard**

`web/tests/legacy-removed.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..");
const GONE = ["components/FlagForm.tsx", "components/badges.tsx", "components/badges.module.css", "app/legacy.module.css",
  "tests/flag-form.test.tsx", "tests/api.test.ts"];
const OLD_EXPORTS = ["searchProducts", "SearchResult", "getProduct", "Product", "Ingredient", "ClinicalDrug", "HiddenProduct",
  "HiddenSubstance", "LoadedProduct", "listLoadedProducts", "Substance", "getSubstance", "AlertSide", "Alert", "CheckResult",
  "CheckOutcome", "checkInteractions"];

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx|css)$/.test(name)) yield relative(WEB, p);
  }
}

describe("the pre-P2 public code is gone (§11.2: each replaced, none deleted without a replacement)", () => {
  it("the old files no longer exist", () => {
    for (const f of GONE) expect(existsSync(join(WEB, f)), f).toBe(false);
  });

  it("lib/api.ts exports none of the old readers or types", () => {
    const api = readFileSync(join(WEB, "lib/api.ts"), "utf8");
    for (const name of OLD_EXPORTS)
      expect(api, name).not.toMatch(new RegExp(`export (async )?(function|type|const) ${name}\\b`));
  });

  it("no source file imports the removed modules", () => {
    const files = ["app", "components", "lib", "content", "tests", "e2e"].filter((d) => existsSync(join(WEB, d)))
      .flatMap((d) => [...sources(join(WEB, d))]).filter((f) => f !== "tests/legacy-removed.test.ts");
    for (const f of files) {
      const src = readFileSync(join(WEB, f), "utf8");
      expect(src, f).not.toMatch(/@\/components\/(FlagForm|badges)["']|legacy\.module\.css/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/legacy-removed.test.ts`
Expected: FAIL on all three cases (`components/FlagForm.tsx: expected true to be false`, `searchProducts`, and the import scan if any page still imports `badges`; when Tasks 20–30 left no import, only the first two fail).

- [ ] **Step 3: Delete the files**

```bash
git rm web/components/FlagForm.tsx web/tests/flag-form.test.tsx web/components/badges.tsx web/components/badges.module.css \
  web/app/legacy.module.css web/tests/api.test.ts
```

- [ ] **Step 4: Trim `lib/api.ts`**

In `web/lib/api.ts`, delete these declarations whole (each with its doc comment): `export type ReviewStatus` stays; delete `Ingredient`, `ClinicalDrug`, `Product`, `HiddenProduct`, `HiddenSubstance`, `SearchResult`, `searchProducts`, `getProduct`, `LoadedProduct`, `listLoadedProducts`, `Substance`, `getSubstance`, `AlertSide`, `Alert`, `CheckResult`, `CheckOutcome` and `checkInteractions`. The file keeps, in this order: the header comment, `ReviewStatus`, `DdinterRef`, `ClinicalIngredient`, `isHidden`, `base`, the token helpers, `read`, `getStats`, the Task 17 public readers, the review readers, the writes.

- [ ] **Step 5: Point the scope test at the §7.4 readers**

In `web/tests/api-scope.test.ts`, replace the import with

```ts
import {
  checkPublic, createFlag, getClinicalDrug, getProductInteractions, getPublicProduct, getPublicSubstance, getSubstanceInteractions,
  isHidden, isStub, resolveFlag, searchMedicines, suggestProducts,
} from "../lib/api";
```

and replace the whole `describe("public reads (spec §2.2: always scope=public, never the token)", …)` block with:

```ts
describe("public reads (spec §2.2: always scope=public, never the token)", () => {
  it("every public reader sends scope=public and no internal token, even with a token configured", async () => {
    f.mockImplementation(async () => ok({}));
    await searchMedicines("napa", 1); await getPublicProduct("P/1"); await getProductInteractions("P-1", 0);
    await getClinicalDrug("BDC-1"); await getPublicSubstance("BDS-1"); await getSubstanceInteractions("BDS-1", null, 0);
    await suggestProducts("na", ["A"]); await checkPublic(["A", "B"]);
    expect(f).toHaveBeenCalledTimes(8);
    for (const [url, init] of f.mock.calls) {
      expect(String(url)).toContain("scope=public");
      expect(String(url)).not.toContain("scope=all");
      expect(headerOf(init, "X-Internal-Token")).toBeNull();
    }
  });

  it("isHidden is false for a full record and for null; isStub is true for a §7.4 stub", () => {
    expect(isHidden({ conceptId: "P-1", tradeName: "Napa" })).toBe(false);
    expect(isHidden(null)).toBe(false);
    expect(isStub({ conceptId: "P-1", tradeName: "Napa", status: "not_reviewed", batchId: null, hidden: true })).toBe(true);
    expect(isStub({ bdsId: "BDS-1", preferredName: "Warfarin", hidden: true })).toBe(true);
  });
});
```

The `writes` block is unchanged.

- [ ] **Step 6: Run the whole web suite and the build**

Run: `cd web && npx vitest run tests/legacy-removed.test.ts tests/api-scope.test.ts && API_URL=http://api:8080 npm test && npm run build`
Expected: PASS; the build's type check finds no reference to a removed name, and `client island check: … all on the §4.2 allowlist`.

- [ ] **Step 7: Commit**

```bash
git add web/lib/api.ts web/tests/api-scope.test.ts web/tests/legacy-removed.test.ts
git commit -m "refactor(web): remove the pre-P2 public readers, FlagForm, badges and legacy styles (§11.2)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 37: End-to-end public flows (§11.4 "Public", "Public scope for reviewers")

**Files:**
- Create: `web/e2e/public-helpers.ts`
- Create: `web/e2e/public-1-flows.spec.ts`
- Modify: `deploy/docker-compose.ci.yml` (`HERO_CONCEPT_ID` for the web service)
- Test: `web/tests/deploy-config.test.ts` (append)

**Interfaces:**
- Consumes: `sql` (`e2e/db.ts`), `signInAs`, `E2E_EMAILS` (`e2e/session.ts`), `installTurnstileFake` (`e2e/turnstile-fake.ts`), `PILOT_IDS` (`e2e/review-helpers.ts`).
- Produces (`e2e/public-helpers.ts`, used by Tasks 38 and 39):
  - `PUBLIC_REVIEWER = "public.pharmacist@e2e.test"`;
  - `latestBatch(conceptId: string): string`: the batch whose item the §7.4 rule reads (`ReviewSql.statusOf` order);
  - `publish(...conceptIds: string[]): void`: one `ok` decision by `PUBLIC_REVIEWER` and `review = 'ok'` on each latest item;
  - `resetPublic(): void`: puts every item `publish` touched back to `pending` and deletes those decisions, and deletes the e2e partner requests;
  - `noHorizontalScroll(page): Promise<number>`: `document.documentElement.scrollWidth`.

**Why the helpers write the latest item.** The e2e seed puts each pilot product in eight batches with the same `extracted_at`, so the tie-break `batch_id DESC` makes the `e2e-stale` item the one the §7.4 rule reads, not the `0001-pilot` one. Approving `0001-pilot` would leave every product hidden. The review specs run after the public ones (files run in name order: `learn` < `public-…` < `review-…`) and expect every item `pending` with no decisions, so `resetPublic()` runs in each public spec's `afterAll`. `ops.review_decision` has no append-only trigger (only `ops.audit_event`, `ops.item_snapshot` and P1C's `ops.pair_review` do), so deleting the test's own rows is allowed; the helpers never touch the append-only tables.

**Why `public-1-flows` runs first among the public specs.** The API's name index (Task 13) loads on the first zero-result search and keeps its list for 5 minutes. The suggestion test publishes G Warfarin before the first zero-result search of the run, so the index holds "Warfarin". A later spec's zero-result search may meet that index; the public re-check (Task 13) drops the name once `resetPublic()` hides it again.

- [ ] **Step 1: The CI hero product (failing config test first)**

Append to the `describe("CI-only compose override (§11.4)", …)` block of `web/tests/deploy-config.test.ts`:

```ts
  it("e2e renders the landing lookup card with the production hero product (D26)", () => {
    const ci = repo("deploy/docker-compose.ci.yml");
    expect(ci.slice(ci.indexOf("\n  web:"), ci.indexOf("\n  seed:"))).toContain("HERO_CONCEPT_ID: 186-0030-006--napa\n");
  });
```

Run: `cd web && npx vitest run tests/deploy-config.test.ts`
Expected: FAIL (the override passes no `HERO_CONCEPT_ID`, so the base file's `${HERO_CONCEPT_ID:-}` is blank in CI).

In `deploy/docker-compose.ci.yml`, add to `web.environment` after `REVIEWERS: …`:

```yaml
      HERO_CONCEPT_ID: 186-0030-006--napa
```

Run: `cd web && npx vitest run tests/deploy-config.test.ts`
Expected: PASS.

- [ ] **Step 2: The helpers**

`web/e2e/public-helpers.ts`:

```ts
import type { Page } from "@playwright/test";
import { sql } from "./db";

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
export const PUBLIC_REVIEWER = "public.pharmacist@e2e.test";

/** The batch whose item the §7.4 visibility rule reads: ReviewSql.statusOf's order (newest stamp, then batch id). */
export const latestBatch = (conceptId: string): string =>
  sql(`SELECT batch_id FROM ops.batch_item WHERE concept_id = ${lit(conceptId)}
       ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1`);

/** A pharmacist approves each product's latest item, as the desk would (one ok decision, review = 'ok'). */
export function publish(...conceptIds: string[]): void {
  for (const id of conceptIds) {
    const b = latestBatch(id);
    sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
         VALUES (${lit(b)}, ${lit(id)}, 'ok', '', ${lit(PUBLIC_REVIEWER)}, 'pharmacist');
         UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = ${lit(b)} AND concept_id = ${lit(id)};`);
  }
}

/** Undoes every publish() and the e2e partner requests, so the review specs start from the untouched seed. */
export function resetPublic(): void {
  sql(`UPDATE ops.batch_item bi SET review = 'pending' FROM ops.review_decision d
       WHERE d.reviewer_email = ${lit(PUBLIC_REVIEWER)} AND d.batch_id = bi.batch_id AND d.concept_id = bi.concept_id;
       DELETE FROM ops.review_decision WHERE reviewer_email = ${lit(PUBLIC_REVIEWER)};
       DELETE FROM ops.flag WHERE target_type = 'other' AND target_id = 'partner-access' AND reporter_email LIKE '%@e2e.test';`);
}

export const partnerRequests = (email: string): string[] =>
  sql(`SELECT message FROM ops.flag WHERE target_type = 'other' AND target_id = 'partner-access'
       AND reporter_email = ${lit(email)} ORDER BY id`).split("\n").filter(Boolean);

export const noHorizontalScroll = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);
```

`partnerRequests` reads `message` only; a multi-line message comes back as several lines, so the test checks the first line.

- [ ] **Step 3: The flows**

`web/e2e/public-1-flows.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { partnerRequests, publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";
import { E2E_EMAILS, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

/*
 * Public flows (§11.4 "Public", "Public scope for reviewers") on the production build and the pilot seed. Serial: later
 * tests build on the products earlier ones publish. resetPublic() restores the seed. The §11.4 "Sign-in return path"
 * case stays in foundation.spec.ts (P1A), which Task 33 leaves passing: the island's props are unchanged.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.afterAll(() => resetPublic());

test("landing: one h1, the four bands, and the lookup card shows only the brand and the pill while Napa is unapproved (§6.1, D26)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Bangladesh's medicines, traced from brand to substance and checked by a pharmacist.");
  for (const h of ["One record, three kinds of work", "How a record becomes trustworthy", "Three promises", "For partners: the same records, by API"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  const card = page.getByRole("group", { name: "Lookup for Napa" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Not yet reviewed by a pharmacist");
  await expect(card).toContainText("Its clinical drug, codes and interactions appear here after a pharmacist approves it.");
  await expect(card).not.toContainText("Paracetamol");
  await expect(card).not.toContainText("BDS-");
});

test("search: 'warfarin' finds the G Warfarin stub with no data from the record (§6.3, D16)", async ({ page }) => {
  await page.goto("/search?q=warfarin");
  await expect(page.locator("h1")).toHaveText('Results for "warfarin"');
  await expect(page.getByText("A pharmacist hasn't approved this record yet, so its substance, codes and interactions are hidden.")).toBeVisible();
  await expect(page.locator(`a[href="/products/${P.warfarin}"]`).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("BDS-000003");
});

test("the stub page: the trade name, the pill and the batch, and nothing of the record (§6.4)", async ({ page }) => {
  await page.goto(`/products/${P.warfarin}`);
  await expect(page.locator("h1")).toHaveText("G Warfarin");
  await expect(page.getByText("Not yet reviewed by a pharmacist").first()).toBeVisible();
  await expect(page.getByText(/This is not the same as "not found" or "no data"\. The record exists and is in review in batch /)).toBeVisible();
  for (const hidden of ["Warfarin Sodium", "DDInter1951", "BDS-000003", "What's in it"])
    await expect(page.locator("main")).not.toContainText(hidden);
});

test("an unknown product id is a 404 with the not-found sentence (§6.4)", async ({ page }) => {
  const res = await page.goto("/products/no-such-product");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("No medicine with the id no-such-product.");
});

test("approved: 'paracetamol' finds Napa through the DGDA name, and the product page shows the record (§6.3, §6.5)", async ({ page }) => {
  publish(P.napa, P.aspirin, P.warfarin);
  await page.goto("/search?q=paracetamol");
  await expect(page.locator("h1")).toHaveText('Results for "paracetamol"');
  await page.locator(`a[href="/products/${P.napa}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/products/${P.napa}$`));
  await expect(page.locator("h1")).toHaveText("Napa");
  await expect(page.getByText("Approved by a pharmacist").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What's in it" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "With other approved medicines" })).toBeVisible();
  await expect(page.getByText("From DDInter 2.0").first()).toBeVisible();
  // a pair card says "Pair not yet reviewed…"; the unclassified panel's bracket says "(pair not yet reviewed…)"
  await expect(page.getByText(/pair not yet reviewed by a senior pharmacist/i).first()).toBeVisible();
});

test("'warfrin' suggests Warfarin once G Warfarin is public (§6.3, §7.4 P4)", async ({ page }) => {
  await page.goto("/search?q=warfrin");
  await expect(page.locator("h1")).toHaveText('No medicines match "warfrin"');
  const link = page.getByRole("link", { name: "Search for Warfarin" });
  await expect(link).toHaveAttribute("href", "/search?q=Warfarin");
  await link.click();
  await expect(page.locator("h1")).toHaveText('Results for "Warfarin"');
});

test("the substance page from the product page: entries, products and source links (§6.6)", async ({ page }) => {
  await page.goto(`/products/${P.napa}`);
  await page.locator('a[href^="/substances/BDS-000001"]').first().click();
  await expect(page.locator("h1")).toContainText("Acetaminophen");
  await expect(page.getByRole("heading", { name: "DDInter entries" })).toBeVisible();
  await expect(page.locator(`a[href="/products/${P.napa}"]`).first()).toBeVisible();
});

test("public scope for reviewers: a pharmacist sees the stub on /products and 'not yet reviewed' on /check (§2.2, §11.4)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await signInAs(ctx, "pharmacist");
  const page = await ctx.newPage();
  await page.goto(`/products/${P.domperidone}`);
  await expect(page.locator("h1")).toHaveText("Domperidone");
  await expect(page.getByRole("heading", { name: "What's in it" })).toHaveCount(0);
  await page.goto(`/check?ids=${P.napa}&ids=${P.domperidone}`);
  await expect(page.getByText(/Not yet reviewed by a pharmacist, 1 product/)).toBeVisible();
  await ctx.close();
});

test("welcome states: a reader sees their own email once; a pharmacist sees the batch and the desk button (§6.2)", async ({ browser }) => {
  const reader = await browser.newContext();
  await signInAs(reader, "user", "E2E Reader");
  const r = await reader.newPage();
  await r.goto("/signin?welcome=1");
  await expect(r.getByRole("heading", { name: "You're signed in as a reader" })).toBeVisible();
  await expect(r.locator("main").getByText(E2E_EMAILS.user)).toHaveCount(1);
  await expect(r.getByRole("link", { name: "Search medicines" })).toHaveAttribute("href", "/search");
  await reader.close();

  const pharm = await browser.newContext();
  await signInAs(pharm, "pharmacist");
  const p = await pharm.newPage();
  await p.goto("/signin?welcome=1");
  await expect(p.getByRole("heading", { name: /^You're a pharmacist reviewer for batch / })).toBeVisible();
  await expect(p.getByText("Your approval publishes the record.", { exact: false })).toBeVisible();
  await expect(p.getByRole("link", { name: "Open the review desk" })).toHaveAttribute("href", "/review");
  await expect(p.locator("main")).not.toContainText(E2E_EMAILS.pharmacist);
  await pharm.close();
});

test("partner access: signed out sees the sign-in line; signed in sends a request stored as a flag (§6.9)", async ({ browser, page }) => {
  await page.goto("/partners");
  await expect(page.getByText("Sign in first. Access is granted by the IntelliDrugs team.")).toBeVisible();
  await expect(page.locator("form textarea")).toHaveCount(0);

  const ctx = await browser.newContext();
  await signInAs(ctx, "user", "E2E Reader");
  const p = await ctx.newPage();
  await installTurnstileFake(p, "pass");
  await p.goto("/partners");
  await p.getByLabel("Organisation").fill("E2E Clinic");
  await p.getByLabel("Kind of system").selectOption("EMR");
  await p.getByLabel("What you will build").fill("Check a patient's medicines at the prescribing step.");
  await p.getByLabel("Expected checks per day").selectOption("Under 1,000");
  await p.getByRole("button", { name: "Request partner access" }).click();
  await expect(p).toHaveURL(/\/partners\?partner=sent#request$/);
  await expect(p.getByRole("status").filter({ hasText: "Request sent." }))
    .toHaveText(`Request sent. The IntelliDrugs team replies to ${E2E_EMAILS.user}.`);
  expect(partnerRequests(E2E_EMAILS.user)[0]).toBe("Organisation: E2E Clinic");
  await ctx.close();
});
```

- [ ] **Step 4: Run the spec against the CI stack**

```bash
COMPOSE="docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml"
DB_USER=bddrug DB_PASSWORD=ci GHCR_OWNER=ci IMAGE_TAG=ci $COMPOSE up -d --build db flyway api web
DB_USER=bddrug DB_PASSWORD=ci GHCR_OWNER=ci IMAGE_TAG=ci $COMPOSE run --rm seed
curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz
(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/public-1-flows.spec.ts)
```

Expected: 10 passed. Then run the specs that follow it to prove `resetPublic()` left the seed untouched:
`(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/public-1-flows.spec.ts e2e/review-desk.spec.ts e2e/review-lists.spec.ts)` → all pass.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/public-helpers.ts web/e2e/public-1-flows.spec.ts deploy/docker-compose.ci.yml web/tests/deploy-config.test.ts
git commit -m "test(web): e2e public flows: landing, search and suggestion, stub, product, substance, welcome, partner request (§11.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 38: End-to-end checker (§11.4 "Checker")

**Files:**
- Create: `web/e2e/public-2-checker.spec.ts`
- Create: `web/e2e/zx-public-pair-review.spec.ts` (PAIR_REVIEWED and PAIR_NOT_REVIEWED on the page)

**Interfaces:**
- Consumes: `publish`, `resetPublic`, `noHorizontalScroll` (Task 37); `sql` (`e2e/db.ts`); `PILOT_IDS`; P1C's `ops.pair_review` (V7, append-only), `PAIR_REVIEWED` ("Pair reviewed by a senior pharmacist on {date}") and `PAIR_NOT_REVIEWED` ("Pair not yet reviewed by a senior pharmacist") rendered by `PairReviewState` on the checker's pair card (Task 29); the checker's DOM from Tasks 29–32: the combobox `role="combobox"` named "Add a medicine", options `role="option"`, the selection list `aria-labelledby="sel-h"`, "Remove {brand}" buttons, "Clear all", the summary, the live region `#check-live`.

Pilot facts the assertions rest on (seed `10-pilot.sql`, spec §1.5–§1.6): Warfarin + Acetylsalicylic acid is Major; Domperidone has no DDInter data (one hatch block, two not-checked pairs in scenario 1); Chloramphenicol eye drops are checked against `DDInter352` and list no pair with Warfarin.

- [ ] **Step 1: Write the spec**

`web/e2e/public-2-checker.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";

/* The checker end to end (§6.7, §11.4 "Checker"). G Warfarin, Aspirin, Domperidone and the eye drop are public; Napa is not. */
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.beforeAll(() => publish(P.warfarin, P.aspirin, P.domperidone, P.chloramphenicol));
test.afterAll(() => resetPublic());

const input = (page: Page) => page.getByRole("combobox", { name: "Add a medicine" });
const live = (page: Page) => page.locator("#check-live");
const selected = (page: Page) => page.locator('ul[aria-labelledby="sel-h"] > li');
const SCENARIO_1 = "3 medicines · 1 of 3 pairs checked · 1 with an interaction listed · 2 pairs not checked because Domperidone has no interaction data";

async function add(page: Page, typed: string, option: RegExp): Promise<void> {
  await input(page).fill(typed);
  await expect(page.getByRole("option", { name: option })).toBeVisible();
  // The list opens with its first option active (aria-activedescendant); move down only until ours is the active one.
  for (let i = 0; i < 10 && !(await page.getByRole("option", { name: option, selected: true }).count()); i++)
    await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: option, selected: true })).toBeVisible();
  await page.keyboard.press("Enter");
}

test("keyboard: add three medicines, each announced; the summary sentence; Major first; the no-data block (§6.7.1–§6.7.3)", async ({ page }) => {
  await page.goto("/check");
  await expect(input(page)).toBeVisible();
  await add(page, "warf", /^G Warfarin/);
  await expect(live(page)).toHaveText("G Warfarin added. Add at least 2 medicines to check them against each other.");
  await add(page, "aspi", /^Aspirin/);
  await expect(live(page)).toHaveText("Aspirin added. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed");
  await add(page, "domp", /^Domperidone/);
  await expect(live(page)).toHaveText(`Domperidone added. ${SCENARIO_1}`);
  await expect(page).toHaveURL(new RegExp(`ids=${P.warfarin}.*ids=${P.aspirin}.*ids=${P.domperidone}`));
  await expect(selected(page)).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: SCENARIO_1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Major, 1 pair$/ })).toBeVisible();
  await expect(page.locator(".nodata-block.hatch")).toHaveCount(1);
  await expect(page.getByText("No interaction data in DDInter for this substance. This does not mean it is safe to combine.")).toBeVisible();
  await expect(page.getByText("From DDInter 2.0").first()).toBeVisible();
});

test("remove and Clear all: announced, and focus lands on the field, never on <body> (§6.7.1, §10.2)", async ({ page }) => {
  await page.goto(`/check?ids=${P.warfarin}&ids=${P.aspirin}&ids=${P.domperidone}`);
  await page.getByRole("button", { name: "Remove Domperidone" }).click();
  await expect(live(page)).toHaveText("Domperidone removed. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed");
  await expect(selected(page)).toHaveCount(2);
  await expect(page).not.toHaveURL(new RegExp(P.domperidone));
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(live(page)).toHaveText("All medicines removed.");
  await expect(input(page)).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await expect(page.getByText("No medicines yet.")).toBeVisible();
});

test("a scenario link loads its products; a not-reviewed product is listed by name, not checked (§6.7.1, §6.7.3 item 6)", async ({ page }) => {
  await page.goto("/check");
  await page.getByRole("link", { name: "G Warfarin + Aspirin + Domperidone" }).click();
  await expect(live(page)).toHaveText(`Scenario loaded: G Warfarin + Aspirin + Domperidone. ${SCENARIO_1}`);
  await page.goto(`/check?ids=${P.warfarin}&ids=${P.napa}`);
  await expect(page.getByText(/Not yet reviewed by a pharmacist, 1 product/)).toBeVisible();
  await expect(page.locator("main")).toContainText("Napa");
  await expect(page.getByText("These products were not checked. A pharmacist hasn't approved them yet.")).toBeVisible();
});

test("the eye drop: no interaction listed with G Warfarin, and What was checked names DDInter352 (§1.5, §6.7.3 item 7)", async ({ page }) => {
  await page.goto(`/check?ids=${P.chloramphenicol}&ids=${P.warfarin}`);
  await expect(page.getByRole("heading", { name: "No interaction listed in DDInter 2.0, 1 pair" })).toBeVisible();
  await expect(page.getByText("DDInter 2.0 lists no interaction for these pairs. This is not a guarantee that they are safe to combine.")).toBeVisible();
  const checked = page.locator("details", { has: page.locator("summary", { hasText: "What was checked" }) });
  await expect(checked).toHaveAttribute("open", "");
  await expect(checked).toContainText("DDInter352");
  await expect(checked).not.toContainText("DDInter351");
});

test("a shared link with repeats, blanks and an unknown id is cleaned, with the info banner (Review Focus 3)", async ({ page }) => {
  await page.goto(`/check?ids=${P.warfarin}&ids=&ids=${P.warfarin}&ids=gone-id&ids=${P.aspirin}`);
  // the server redirects once to the de-duplicated, blank-free link; the unknown id is then dropped with the banner
  const ids = new URL(page.url()).searchParams.getAll("ids");
  expect(ids.filter((id) => id === P.warfarin)).toHaveLength(1);
  expect(ids).not.toContain("");
  await expect(page.getByText("One medicine in the link no longer exists, so it was removed.")).toBeVisible();
  await expect(selected(page)).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 2, name: "2 medicines · 1 of 1 pair checked · 1 with an interaction listed" })).toBeVisible();
});

test("without JavaScript: Find lists matches, Add and Remove work by GET, and the results render (§4.4, §6.7.1)", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/check");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByLabel("Add a medicine").fill("warf");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/\/check\?q=warf/);
  await page.getByRole("button", { name: /^G Warfarin/ }).click();
  await page.getByLabel("Add a medicine").fill("aspi");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: /^Aspirin/ }).click();
  await expect(page).toHaveURL(new RegExp(`ids=${P.warfarin}.*ids=${P.aspirin}`));
  await expect(page.getByRole("heading", { level: 2, name: "2 medicines · 1 of 1 pair checked · 1 with an interaction listed" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Aspirin" }).click();
  await expect(selected(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "Add at least 2 medicines to check them against each other." })).toBeVisible();
  await ctx.close();
});
```

The live-region assertions read the island's text after its 60 ms clear-and-write (§10.2); `toHaveText` retries until it lands.

- [ ] **Step 2: The pair's senior-review state on the page (§6.7.3; §11.4 as amended by P1C Task 0)**

P1C pins the checker's `pairReview` at API level and its Task 0 moves the page assertion to P2: "P2's checker e2e asserts `PAIR_REVIEWED` and `PAIR_NOT_REVIEWED` on the page". `ops.pair_review` is append-only (V7 refuses UPDATE and DELETE), so no spec can seed a review and remove it afterwards. This spec therefore lives in its own file whose name sorts after every spec that reads pair reviews (`public-…`, `review-…` and P1C's `senior.spec.ts`; files run in name order with one worker) and before the `zy-`/`zz-` specs, which read none. Its `afterAll` restores the pair text and the approvals; the review row stays on the throwaway CI database. The content hash is computed exactly as `PairContent` does (§7.7), from the row as stored.

`web/e2e/zx-public-pair-review.spec.ts`:

```ts
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";

/*
 * PAIR_REVIEWED and PAIR_NOT_REVIEWED on the public checker (§6.7.3, §3.4, G3). Runs after every spec that reads pair
 * reviews, because ops.pair_review is append-only and this row cannot be removed.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const A = "DDInter1951", B = "DDInter20";   // Warfarin + Acetylsalicylic acid: Major in the pilot seed (stored a < b)
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const PAIR = `ddinter_a = ${lit(A)} AND ddinter_b = ${lit(B)}`;
const MARK = "E2E-UPDATED ";
const textId = () => sql(`SELECT interaction_id FROM curated.ddinter_pair WHERE ${PAIR}`);

/** DdinterText.clean: placeholders and blanks are no text; the rest is stripped. */
const PLACEHOLDERS = new Set(["none", "null", "n/a", "na", "-", "--", ""]);
const clean = (v: string | null): string | null => (v === null || PLACEHOLDERS.has(v.trim().toLowerCase()) ? null : v.trim());

/** §7.7 PairContent: SHA-256 hex of the compact UTF-8 JSON [a, b, severity, sorted(actions), interaction|null, management|null]. */
function current(): { content: { severity: string; actions: string[]; interaction: string | null; management: string | null }; hash: string } {
  const row = JSON.parse(sql(`SELECT json_build_object('severity', p.severity, 'actions', p.actions,
      'interaction', t.interaction, 'management', t.management)::text
    FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
    WHERE p.ddinter_a = ${lit(A)} AND p.ddinter_b = ${lit(B)}`));
  const content = { severity: row.severity as string, actions: [...((row.actions as string[] | null) ?? [])].sort(),
    interaction: clean(row.interaction), management: clean(row.management) };
  const canonical = JSON.stringify([A, B, content.severity, content.actions, content.interaction, content.management]);
  return { content, hash: createHash("sha256").update(canonical, "utf8").digest("hex") };
}

test.beforeAll(() => publish(P.warfarin, P.aspirin));
test.afterAll(() => {
  sql(`UPDATE curated.ddinter_interaction_text SET management = substr(management, ${MARK.length + 1})
       WHERE interaction_id = ${lit(textId())} AND management LIKE ${lit(MARK + "%")}`);
  resetPublic();
});

test("a current senior review reads PAIR_REVIEWED as plain text; once DDInter changes the text it reads PAIR_NOT_REVIEWED and the alert stays (§6.7.3, G3)", async ({ page }) => {
  const { content, hash } = current();
  sql(`INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
       VALUES (${lit(A)}, ${lit(B)}, 'reviewed', '', ${lit(hash)}, ${lit(JSON.stringify(content))}::jsonb, 'senior@e2e.test', 'senior')`);
  const date = sql(`SELECT to_char(max(decided_at) AT TIME ZONE 'Asia/Dhaka', 'DD/MM/YYYY') FROM ops.pair_review WHERE ${PAIR}`);
  const shown = (content.management ?? content.interaction ?? "").slice(0, 40);
  expect(shown).not.toBe("");

  await page.goto(`/check?ids=${P.warfarin}&ids=${P.aspirin}`);
  await expect(page.getByRole("heading", { name: /^Major, 1 pair$/ })).toBeVisible();
  const reviewed = page.getByText(`Pair reviewed by a senior pharmacist on ${date}`);
  await expect(reviewed).toBeVisible();
  // plain text: never green and never a review-status pill (§3.4 mark exclusivity)
  await expect(reviewed.locator("xpath=ancestor-or-self::*[contains(@class, 'rv--')]")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Pair not yet reviewed by a senior pharmacist");

  // DDInter changes the management text: the hash moves, so the review no longer counts in public; the pair stays (G3)
  sql(`UPDATE curated.ddinter_interaction_text SET management = ${lit(MARK)} || management WHERE interaction_id = ${lit(textId())}`);
  await page.goto(`/check?ids=${P.warfarin}&ids=${P.aspirin}`);
  await expect(page.getByRole("heading", { name: /^Major, 1 pair$/ })).toBeVisible();
  await expect(page.locator("main")).toContainText(MARK.trim());
  await expect(page.getByText("Pair not yet reviewed by a senior pharmacist").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(`Pair reviewed by a senior pharmacist on ${date}`);
});
```

The pilot pair's management text is DDInter's own (non-null in `10-pilot.sql`), so prefixing it changes the hash and the new start of the text is visible however the card truncates it.

- [ ] **Step 3: Run both**

Run: `(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/public-2-checker.spec.ts e2e/zx-public-pair-review.spec.ts)` (stack from Task 37 Step 4)
Expected: 7 passed. A failure in the first test's option loop means the island marks the active option with something other than `aria-selected="true"` (§6.7.1 ARIA 1.2 combobox): fix the island, not the test. A `PAIR_REVIEWED` failure with the row in place means the hash differs from `PairContent`'s: compare `current().hash` with the API's (`POST /v1/interactions/check` shows `pairReview.state`), and fix the side that departs from §7.7.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/public-2-checker.spec.ts web/e2e/zx-public-pair-review.spec.ts
git commit -m "test(web): e2e checker: keyboard combobox, announcements, Clear all focus, eye drop DDInter352, no-JS flow, PAIR_REVIEWED and PAIR_NOT_REVIEWED (§11.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 39: axe, reflow and 400% zoom on every public page (§10, §11.4)

**Files:**
- Create: `web/e2e/public-3-a11y.spec.ts`

**Interfaces:**
- Consumes: `publish`, `resetPublic`, `noHorizontalScroll` (Task 37); `signInAs`; `installTurnstileFake`; `PILOT_IDS`.

Every public page in light, dark and forced colours (§10.3, §11.4 "axe … on every page … Each in light, dark and forced colours"), with the open combobox list as its own state; reflow at 320 CSS px; and the 400% zoom walk on the product page (§11.4 names "the product page" for the public toolbar). The sticky public bar is the `<header>` (Task 19), so the zoom walk checks that no focused element sits under it.

- [ ] **Step 1: Write the spec**

`web/e2e/public-3-a11y.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { noHorizontalScroll, publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(300);   // entrance transitions finish before axe reads colours
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations
    .map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}

/** Napa, Aspirin, G Warfarin, Domperidone and the eye drop are public; G-Metformin stays a stub. */
const ANONYMOUS = [
  "/", "/search?q=paracetamol", "/search?q=warfarin", "/search?q=zzzzzz", `/products/${P.napa}`, `/products/${P.metformin}`,
  "/products/no-such-product", "/substances/BDS-000001", "/check",
  `/check?ids=${P.warfarin}&ids=${P.aspirin}&ids=${P.domperidone}&ids=${P.metformin}`,
  `/check?ids=${P.chloramphenicol}&ids=${P.warfarin}`, "/signin", "/partners", "/privacy",
];
const READER = ["/signin?welcome=1", "/partners", `/products/${P.napa}`];

type Look = { name: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [
  { name: "light", theme: "light", forced: false },
  { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true },
];

async function contextFor(browser: Browser, look: Look): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
  await ctx.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
  return ctx;
}

test.describe.configure({ mode: "serial", timeout: 300_000 });
test.beforeAll(() => publish(P.napa, P.aspirin, P.warfarin, P.domperidone, P.chloramphenicol));
test.afterAll(() => resetPublic());

for (const look of LOOKS) {
  test(`axe (${look.name}): every public page, the open combobox, and the signed-in states (§10, §11.4)`, async ({ browser }) => {
    const anon = await contextFor(browser, look);
    const page = await anon.newPage();
    await installTurnstileFake(page, "pass");
    for (const path of ANONYMOUS) {
      await page.goto(path);
      await axe(page, `${look.name} ${path}`);
    }
    await page.goto("/check");
    await page.getByRole("combobox", { name: "Add a medicine" }).fill("na");
    await expect(page.getByRole("listbox")).toBeVisible();
    await axe(page, `${look.name} /check, list open`);
    await anon.close();

    const reader = await contextFor(browser, look);
    await signInAs(reader, "user", "E2E Reader");
    const r = await reader.newPage();
    await installTurnstileFake(r, "pass");
    for (const path of READER) {
      await r.goto(path);
      await axe(r, `${look.name} reader ${path}`);
    }
    await r.goto(`/products/${P.napa}`);
    await r.getByText("Report a problem").first().click();
    await axe(r, `${look.name} reader report form open`);
    await reader.close();

    const pharm = await contextFor(browser, look);
    await signInAs(pharm, "pharmacist");
    const p = await pharm.newPage();
    await p.goto("/signin?welcome=1");
    await axe(p, `${look.name} pharmacist welcome`);
    await pharm.close();
  });
}

test("reflow at 320 CSS px: no horizontal page scroll on any public page (§10.4)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ANONYMOUS) {
    await page.goto(path);
    expect(await noHorizontalScroll(page), path).toBeLessThanOrEqual(320);
  }
});

test("1280×800 at 400% zoom (320×200 CSS px): tabbing through the product page, the public bar never covers the focused element (§10.4, WCAG 2.4.11)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 200 });
  await page.goto(`/products/${P.napa}`);
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
      const cover = document.elementFromPoint(x, y)?.closest("header");
      return cover && !cover.contains(el) ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)} under ${cover.tagName}` : null;
    });
    expect(covered, `Tab ${i + 1}`).toBeNull();
  }
  expect(tabbed).toBeGreaterThan(15);   // skip link, the bar, the search field, the record's links and source links, the footer
});
```

A violation that appears only in forced colours is a module CSS bug: fix it with an `@media (forced-colors: active)` rule in that module (§10.3), never with an axe exclusion.

- [ ] **Step 2: Run it**

Run: `(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/public-3-a11y.spec.ts)` (stack from Task 37 Step 4)
Expected: 5 passed. Any violation names the page and the look; fix the page or its module, never `exclude()` a public element.

- [ ] **Step 3: Run every e2e spec in order**

Run: `(cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test)`
Expected: every spec passes, the review specs after the public ones included (the public specs left the seed as they found it).

- [ ] **Step 4: Commit**

```bash
git add web/e2e/public-3-a11y.spec.ts
git commit -m "test(web): axe on every public page in light, dark and forced colours; reflow at 320 px; 400% zoom walk (§10, §11.4)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 40: The public Lighthouse budget (§1.4 S5, §10.6), CI, and PR 2 into `phase-2`

**Files:**
- Create: `web/lighthouserc.public.json`
- Create: `web/e2e/lhci-public.sql`
- Create: `web/tests/lhci-public-budget.test.ts`
- Modify: `.github/workflows/ci.yml` (two steps in the `e2e` job)
- Test: `web/tests/deploy-config.test.ts` (append)

**Interfaces:**
- Consumes: the pilot seed; `@lhci/utils/src/assertions.js` `getAllAssertionResults` (as `lhci-learn-budget.test.ts` does).
- Produces: a CI step that approves every pilot product's latest item, then runs Lighthouse CI on `/`, `/search?q=paracetamol`, the Napa product page, the Acetaminophen substance page and the scenario-1 checker, three runs each, asserting the §10.6 budgets per page group on the median run and §1.4 S5's scores.

`lhci-public.sql` lives outside `e2e/seed/` on purpose: the `seed` service loads every file in that folder before Playwright, and the review specs need every record unapproved. It runs after the Playwright suite and after the review and Learn Lighthouse runs, on CI's throwaway database only.

- [ ] **Step 1: Write the failing budget test**

`web/tests/lhci-public-budget.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Result = { auditId: string; auditProperty?: string; passed: boolean; url: string };
const { getAllAssertionResults } = require("@lhci/utils/src/assertions.js") as {
  getAllAssertionResults: (options: object, lhrs: object[]) => Result[];
};
type Assertions = Record<string, [string, Record<string, unknown>]>;
const config = JSON.parse(readFileSync(join(__dirname, "..", "lighthouserc.public.json"), "utf8")) as {
  ci: { collect: { url: string[]; numberOfRuns: number; settings: { blockedUrlPatterns: string[] } };
        assert: { assertMatrix: { matchingUrlPattern: string; assertions: Assertions }[] } };
};
const matrix = config.ci.assert.assertMatrix;

const COMMON = {
  "server-response-time": 600,
  "resource-summary:stylesheet:size": 20480,
  "resource-summary:font:size": 92160,
  "largest-contentful-paint": 2500,
} as const;
/** §10.6, gzip: `/` HTML 30 KB, JS 130 KB; search, product and substance HTML 50 KB, JS 130 KB; `/check` HTML 50 KB, JS 145 KB. */
const GROUPS = [
  { url: "http://localhost:3000/", numeric: { ...COMMON, "resource-summary:document:size": 30720, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/search?q=paracetamol", numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/products/186-0030-006--napa", numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/substances/BDS-000001", numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 133120 } },
  { url: "http://localhost:3000/check?ids=185-0138-012--g-warfarin&ids=076-0028-006--aspirin&ids=127-0263-018--domperidone",
    numeric: { ...COMMON, "resource-summary:document:size": 51200, "resource-summary:script:size": 148480 } },
];

function lhr(url: string, numeric: Record<string, number>, factor: number) {
  const v = (k: string) => Math.round(numeric[k] * factor);
  return {
    finalUrl: url,
    categories: { accessibility: { score: 1 }, performance: { score: 1 } },
    audits: {
      "server-response-time": { numericValue: v("server-response-time") },
      "largest-contentful-paint": { numericValue: v("largest-contentful-paint") },
      "resource-summary": { details: { items: (["document", "script", "stylesheet", "font"] as const)
        .map((t) => ({ resourceType: t, size: v(`resource-summary:${t}:size`) })) } },
    },
  };
}
const failedKeys = (runs: object[]) => getAllAssertionResults({ assertMatrix: matrix }, runs).filter((r) => !r.passed)
  .map((r) => (r.auditProperty ? `${r.auditId}:${r.auditProperty.replace(".", ":")}` : r.auditId)).sort();

describe("the public Lighthouse budget (§1.4 S5, §10.6, median of 3 runs)", () => {
  it("collects the five S5 pages three times each, with Turnstile blocked", () => {
    expect(config.ci.collect.url).toEqual(GROUPS.map((g) => g.url));
    expect(config.ci.collect.numberOfRuns).toBe(3);
    expect(config.ci.collect.settings.blockedUrlPatterns).toEqual(["https://challenges.cloudflare.com/*"]);
  });

  it("each page matches exactly one matrix entry, which asserts its §10.6 budgets on the median and S5's scores", () => {
    for (const g of GROUPS) {
      const entries = matrix.filter((m) => new RegExp(m.matchingUrlPattern).test(g.url));
      expect(entries, g.url).toHaveLength(1);
      const a = entries[0].assertions;
      for (const [key, budget] of Object.entries(g.numeric))
        expect(a[key], `${g.url} ${key}`).toEqual(["error", { maxNumericValue: budget, aggregationMethod: "median" }]);
      expect(a["categories:accessibility"]).toEqual(["error", { minScore: 1, aggregationMethod: "median" }]);
      // Global Constraints, S5 house rule (P1B, P3): the score is a warning; every byte budget and accessibility fail the run
      expect(a["categories:performance"]).toEqual(["warn", { minScore: 0.9, aggregationMethod: "median" }]);
    }
  });

  it("fails every numeric budget of a page when two of three runs are over it", () => {
    for (const g of GROUPS)
      expect(failedKeys([lhr(g.url, g.numeric, 0.5), lhr(g.url, g.numeric, 1.2), lhr(g.url, g.numeric, 1.3)]), g.url)
        .toEqual(Object.keys(g.numeric).sort());
  });

  it("passes when one noisy run of three is over budget", () => {
    for (const g of GROUPS)
      expect(failedKeys([lhr(g.url, g.numeric, 0.5), lhr(g.url, g.numeric, 0.9), lhr(g.url, g.numeric, 1.5)]), g.url).toEqual([]);
  });

  it("the landing page's 30 KB HTML budget is its own: 40 KB fails / and passes a product page", () => {
    const at = (url: string, bytes: number) => ({ ...lhr(url, GROUPS[0].numeric, 0.5),
      audits: { ...lhr(url, GROUPS[0].numeric, 0.5).audits, "resource-summary": { details: { items: [{ resourceType: "document", size: bytes }] } } } });
    expect(failedKeys([at(GROUPS[0].url, 40960), at(GROUPS[0].url, 40960), at(GROUPS[0].url, 40960)])).toContain("resource-summary:document:size");
    expect(failedKeys([at(GROUPS[2].url, 40960), at(GROUPS[2].url, 40960), at(GROUPS[2].url, 40960)])).not.toContain("resource-summary:document:size");
  });
});
```

Append to the `describe("CI-only compose override (§11.4)", …)` block of `web/tests/deploy-config.test.ts`:

```ts
  it("the e2e job approves the pilot outside the seed, then runs the public Lighthouse budget last (§1.4 S5)", () => {
    const yml = repo(".github/workflows/ci.yml");
    const approve = yml.indexOf("< web/e2e/lhci-public.sql"), run = yml.indexOf("--config=./lighthouserc.public.json");
    expect(approve).toBeGreaterThan(yml.indexOf("npx playwright test"));
    expect(approve).toBeGreaterThan(yml.indexOf("--config=./lighthouserc.learn.json"));
    expect(run).toBeGreaterThan(approve);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/lhci-public-budget.test.ts tests/deploy-config.test.ts`
Expected: FAIL (`ENOENT … lighthouserc.public.json`; the ci.yml order case finds no `lhci-public.sql`).

- [ ] **Step 3: The config, the approval script and the CI steps**

`web/lighthouserc.public.json`:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/", "http://localhost:3000/search?q=paracetamol", "http://localhost:3000/products/186-0030-006--napa",
        "http://localhost:3000/substances/BDS-000001",
        "http://localhost:3000/check?ids=185-0138-012--g-warfarin&ids=076-0028-006--aspirin&ids=127-0263-018--domperidone"],
      "numberOfRuns": 3,
      "settings": { "blockedUrlPatterns": ["https://challenges.cloudflare.com/*"] }
    },
    "assert": {
      "assertMatrix": [
        {
          "matchingUrlPattern": "^http://localhost:3000/$",
          "assertions": {
            "categories:accessibility": ["error", { "minScore": 1, "aggregationMethod": "median" }],
            "categories:performance": ["warn", { "minScore": 0.9, "aggregationMethod": "median" }],
            "server-response-time": ["error", { "maxNumericValue": 600, "aggregationMethod": "median" }],
            "resource-summary:document:size": ["error", { "maxNumericValue": 30720, "aggregationMethod": "median" }],
            "resource-summary:script:size": ["error", { "maxNumericValue": 133120, "aggregationMethod": "median" }],
            "resource-summary:stylesheet:size": ["error", { "maxNumericValue": 20480, "aggregationMethod": "median" }],
            "resource-summary:font:size": ["error", { "maxNumericValue": 92160, "aggregationMethod": "median" }],
            "largest-contentful-paint": ["error", { "maxNumericValue": 2500, "aggregationMethod": "median" }]
          }
        },
        {
          "matchingUrlPattern": "^http://localhost:3000/(search|products|substances)",
          "assertions": {
            "categories:accessibility": ["error", { "minScore": 1, "aggregationMethod": "median" }],
            "categories:performance": ["warn", { "minScore": 0.9, "aggregationMethod": "median" }],
            "server-response-time": ["error", { "maxNumericValue": 600, "aggregationMethod": "median" }],
            "resource-summary:document:size": ["error", { "maxNumericValue": 51200, "aggregationMethod": "median" }],
            "resource-summary:script:size": ["error", { "maxNumericValue": 133120, "aggregationMethod": "median" }],
            "resource-summary:stylesheet:size": ["error", { "maxNumericValue": 20480, "aggregationMethod": "median" }],
            "resource-summary:font:size": ["error", { "maxNumericValue": 92160, "aggregationMethod": "median" }],
            "largest-contentful-paint": ["error", { "maxNumericValue": 2500, "aggregationMethod": "median" }]
          }
        },
        {
          "matchingUrlPattern": "^http://localhost:3000/check",
          "assertions": {
            "categories:accessibility": ["error", { "minScore": 1, "aggregationMethod": "median" }],
            "categories:performance": ["warn", { "minScore": 0.9, "aggregationMethod": "median" }],
            "server-response-time": ["error", { "maxNumericValue": 600, "aggregationMethod": "median" }],
            "resource-summary:document:size": ["error", { "maxNumericValue": 51200, "aggregationMethod": "median" }],
            "resource-summary:script:size": ["error", { "maxNumericValue": 148480, "aggregationMethod": "median" }],
            "resource-summary:stylesheet:size": ["error", { "maxNumericValue": 20480, "aggregationMethod": "median" }],
            "resource-summary:font:size": ["error", { "maxNumericValue": 92160, "aggregationMethod": "median" }],
            "largest-contentful-paint": ["error", { "maxNumericValue": 2500, "aggregationMethod": "median" }]
          }
        }
      ]
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci-public" }
  }
}
```

`web/e2e/lhci-public.sql`:

```sql
-- CI only (spec §1.4 S5, §10.6): approve every pilot product's latest item, the one the §7.4 rule reads
-- (ReviewSql.statusOf order), so the public Lighthouse run measures the approved pages. Runs after Playwright on the
-- throwaway CI database. Never in e2e/seed/ (the seed service loads that folder before the review specs).
BEGIN;
CREATE TEMP TABLE lhci_latest ON COMMIT DROP AS
  SELECT DISTINCT ON (concept_id) batch_id, concept_id FROM ops.batch_item
  ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC;
INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
  SELECT batch_id, concept_id, 'ok', '', 'lhci.pharmacist@e2e.test', 'pharmacist' FROM lhci_latest;
UPDATE ops.batch_item bi SET review = 'ok', note = NULL FROM lhci_latest l
  WHERE bi.batch_id = l.batch_id AND bi.concept_id = l.concept_id;
COMMIT;
```

(`note = NULL` clears a "removed from batch file" marker a review spec may have left, so every pilot product is public.)

`.github/workflows/ci.yml`, in the `e2e` job, after the `lighthouserc.learn.json` step and before the `if: failure()` step:

```yaml
      - run: $COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d bddrug < web/e2e/lhci-public.sql
      - run: cd web && npx lhci autorun --config=./lighthouserc.public.json
```

- [ ] **Step 4: Run the tests, then the budget locally**

Run: `cd web && npx vitest run tests/lhci-public-budget.test.ts tests/deploy-config.test.ts`
Expected: PASS.

Then, on the stack from Task 37 Step 4 after the full Playwright run (Task 39 Step 3):

```bash
COMPOSE="docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml"
DB_USER=bddrug DB_PASSWORD=ci GHCR_OWNER=ci IMAGE_TAG=ci $COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U bddrug -d bddrug < web/e2e/lhci-public.sql
(cd web && npx lhci autorun --config=./lighthouserc.public.json)
```

Expected: `All results processed!` and `Done running autorun.` with no failed assertion. A failed byte budget names the page group: trim that page (Board P's inline SVGs into the shared sprite, a module rule shared instead of repeated), never raise the number (§10.6 is the spec).

- [ ] **Step 5: The whole suite, then commit**

Run: `(cd api && ./gradlew test --no-daemon) && (cd web && API_URL=http://api:8080 npm test && npm run build)`
Expected: every test passes; `client island check: … all on the §4.2 allowlist`.

```bash
git add web/lighthouserc.public.json web/e2e/lhci-public.sql web/tests/lhci-public-budget.test.ts web/tests/deploy-config.test.ts .github/workflows/ci.yml
git commit -m "ci(web): public Lighthouse budget per page group on the median of 3 runs (§1.4 S5, §10.6)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Open PR 2 into `phase-2`, with the §12.1 phase-2 exit criteria as its gate**

§12.1 lists the phase-2 exit criteria, verbatim: "`VisibilityApiIntegrationTest` matrix green; S2, S3, S5 and S6 hold; licence lines confirmed (§13 Q1); no Example marker on any record data". §13.1 Q1 says the licence lines block the phase-2 public launch, and Q10 adds "any line that DrugBank, SNOMED International and WHO require for links". So the footer's "Licence line(s) to confirm" markers (Task 19) ship in PR 2 but must be gone before `phase-2` merges into `main`: the product owner confirms the wording, a §12.2 spec amendment records it, and a follow-up commit on `phase-2` replaces each marker with the confirmed text (and its `footer.test.tsx` pins). This plan does not invent the wording.

```bash
git push origin feature/intellidrugs-p2-public
gh pr create --base phase-2 --title "P2b: public pages (§6.1–§6.7, §6.9)" --body "$(cat <<'EOF'
P2b of docs/superpowers/plans/2026-10-15-intellidrugs-p2-public.md: the landing page, sign-in card and welcome states,
search, product and substance pages with their stubs, the interaction checker with its combobox island, /partners,
/privacy and docs/runbooks/partner-requests.md, on the §7.4 endpoints of P2a. E2E (including PAIR_REVIEWED and
PAIR_NOT_REVIEWED on /check), axe (light, dark, forced colours), reflow, 400% zoom and the public Lighthouse budget run
in the e2e job.

Phase-2 exit criteria (spec §12.1, verbatim: "VisibilityApiIntegrationTest matrix green; S2, S3, S5 and S6 hold;
licence lines confirmed (§13 Q1); no Example marker on any record data"). The phase-complete phase-2 → main PR
may open only when every box is ticked:

- [ ] Licence lines confirmed (§13.1 Q1, with the link lines of Q10 for DrugBank, SNOMED International and WHO):
      the PO's wording is in the spec through a §12.2 amendment, and every footer "Licence line(s) to confirm"
      marker is replaced by it on phase-2. BLOCKS the public launch.
- [ ] VisibilityApiIntegrationTest matrix green: VisibilityApiIntegrationTest and PublicVisibilityMatrixIntegrationTest
      (P2's matrix for every §7.4 endpoint, with the pending, engineer-checked, issue, back-in-review, removed and
      dismissed-issue fixtures) both pass on phase-2.
- [ ] S2 holds: 5 doctors, landing → "Napa + G Warfarin" result, median under 60 s on a laptop and on a phone (Slow 4G).
- [ ] S3 holds: axe 0 violations on every §11.4 route and state (public-3-a11y.spec.ts), plus the manual NVDA + Firefox
      and VoiceOver + Safari pass of the S1 and S2 tasks.
- [ ] S5 holds: lighthouserc.public.json green (accessibility 100 and every §10.6 budget as errors; performance ≥ 90 read
      from the median report, since the house rule asserts it as warn).
- [ ] S6 holds: copy.test.ts and the e2e safety-sentence assertions green.
- [ ] No Example marker on any record data (hero-card.test.tsx and the public e2e assert it; check the production build).

Spec gaps recorded during P2 are listed in the plan's final section; each needs a §12.2 spec change, not a code change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: CI green (api, web, images, e2e). After review, PR 2 merges into `phase-2`. The phase-complete PR from `phase-2` into `main`, which deploys (D42, §12.3, §12.4), is opened by the product owner once every §12.1 exit criterion above is ticked on the `phase-2` build, the licence lines first; this plan does not merge it. Its body repeats the checklist above, ticked.

---

## Spec gaps recorded by this plan

Each is a place where the spec (as amended for P1C) is silent or self-inconsistent. The plan takes the narrow reading named here so the work can proceed; a different answer is a §12.2 spec change first, then a code change.

1. **Substance page copy (§6.6).** "The boards define no substance page", and §1.7 has no row for its headings and lines ("DDInter entries", "Drug–drug interactions", "Filter by severity", "Drug–disease", "Drug–food", "Products", "Clinical drugs", "None listed in DDInter 2.0."). They live in `lib/public-copy.ts` `SUBSTANCE` (Task 16) and are not checked by the §1.7 copy test.
2. **Engineer welcome heading (§6.2).** The template "You're a {pharmacist|engineer} reviewer for batch {id}" gives "You're a engineer reviewer …". Task 33 pins the literal; "an engineer" needs the template changed.
3. **Reviewer welcome with no batch in review (§6.2).** No copy exists for a reviewer when no batch is `in_review` or the batch list fails. Task 33 leaves out the batch heading and the "{n} records are waiting" step instead of printing "for batch " with no id.
4. **Own email on `/partners` (§6.9 vs §2.2, §9.7).** §6.9's success line names the requester's own email; §2.2's table and §9.7's list of places that show an own email do not include `/partners`. The plan follows §6.9 (own email, to its owner only).
5. **Partner request errors (§6.9).** "Errors use the existing flag outcome map": its `invalid` ("A flag needs a message of 5 to 2000 characters.") and `forbidden` ("Sign in to flag a problem.") lines speak of a flag and do not name the organisation (2–200) or use (20–1500) rules. Task 34 reuses the map unchanged.
6. **S5 performance score (§1.4).** S5 says "at least 90 for performance"; the P1B and P3 house rule asserts the score as `warn` (runner noise). Task 40 follows the house rule; every byte budget and accessibility are `error`.
7. **Text-missing notes naming private partners (§7.4, §6.5 item 7).** The spec does not say what the public automated-checks card shows for DDInter "text not found" pairs whose partner is carried only by unapproved products. Tasks 3–4 list only pairs between two public entries and never print the raw note (Review Focus 1).
8. **Unknown id in a checker link (§6.7.3).** The spec says the id is dropped with the info banner and is silent on the URL. Task 30 redirects only for duplicates, blanks and more than 20 ids; an unknown id stays in the URL so the banner shows on that render.
9. **E2E hero product (§11.4, D26).** The CI compose override passes no `HERO_CONCEPT_ID`, so the e2e landing has no lookup card. Task 37 adds `HERO_CONCEPT_ID: 186-0030-006--napa` to `deploy/docker-compose.ci.yml` only.
10. **Verification date on the product page (§6.5).** The spec does not say which decision dates the verification line when an item has several `ok` decisions. Task 4 (`PublicProducts.approvedAt`) uses the newest `ok` by a pharmacist or senior pharmacist among the latest item's counted decisions: after its run stamp and after the latest dismissal since it (P1C §5.2, D57). Decisions on other batches' items never date it. When no decision counts (an approval carried to this stamp, §8.3.1 item 8), the stamp dates it.
11. **Pre-P2 public endpoints (§7.4).** `GET /v1/products?q=` and `GET /v1/products/loaded` are not named for removal. Task 36 removes only their web callers; the API keeps them.
12. **Partner-request runbook (§2.2, §6.9).** The spec names `docs/runbooks/partner-requests.md` and says it "needs database access" but gives no query. Task 35 writes a read-only `psql` query on the host.
13. **`/privacy` heading (§9.7).** The spec gives the body sentences only. Task 35 uses the footer's link text "Privacy" as the `<h1>`.
14. **A pair review in the public e2e (§11.4, §7.8).** §11.4 (as amended by P1C) asks the checker e2e to show `PAIR_REVIEWED` and `PAIR_NOT_REVIEWED`, and V7 makes `ops.pair_review` append-only, so the row a test writes cannot be removed. Task 38 writes it in `zx-public-pair-review.spec.ts`, which runs after every spec that reads pair reviews, restores the pair text it changed, and leaves the row on the throwaway CI database.
