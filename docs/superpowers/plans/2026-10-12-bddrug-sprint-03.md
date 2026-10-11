# BDDrug KB — Sprint 3 Plan: review tooling + scale fixes

> **For agentic workers:** this plan runs through a workflow. Every task follows the same loop: implement test-first, then task review, then fix loop, then a whole-branch review, then end-to-end. Steps use checkbox syntax.

**Goal:** Pharmacists and engineers sign in with Google (Firebase Auth) and record ok/issue per batch record directly on drugdb.eliooo.org. A record becomes public only after a pharmacist approves it, and a batch is approved when all its records are. Signed-in users can flag problems on any page. The pipeline gets the fixes it needs before batches grow: indexes, a chunked DDInter stage, a light product list for `/check`, a batch report, and single-record re-runs.

**Spec:** `docs/design/2026-10-11-bd-drug-kb-design.md`, `docs/design/2026-10-11-implementation-plan.md` (gated batches, the review workflow, "only approved records appear in public browse"). The product owner made these choices on 2026-10-12:
- Sprint 3 covers review tooling plus scale fixes.
- Auth uses Firebase with Google sign-in.
- Reviewers come from an email allowlist with pharmacist and engineer roles.
- Captcha uses Cloudflare Turnstile.

## Architecture
- **Sign-in.** `/signin` is the only page that ships client JS. It uses the Firebase JS SDK `signInWithPopup(GoogleAuthProvider)` and POSTs the Firebase ID token to `/api/session`.
  - The server verifies the ID token with `firebase-admin`, initialized with `projectId` only and no service account. It requires `email_verified`.
  - It then issues its own **httpOnly, Secure, SameSite=Lax** session cookie: a signed JWT (`jose`, HS256, `SESSION_SECRET`, 8 h) holding `{email, role}`.
  - The role comes from the `REVIEWERS` env list (`email:role,…`). A signed-in user who is not on the list gets role `user`: they can flag but not review.
- **Review and flag actions** are Next.js **server actions** in plain `<form>`s, which work without client JS. Each action:
  1. re-reads the session,
  2. checks the role,
  3. verifies the Turnstile token server-side,
  4. calls the API over the internal Docker network with `X-Internal-Token: INTERNAL_API_TOKEN`.

  The API stays unreachable from the internet. It only accepts write and "all records" requests that carry the correct internal token.
- **Visibility.**
  - Anonymous visitors see only approved records in search, product, substance and `/check`.
  - Signed-in reviewers see everything, with an "unreviewed" badge.
  - Batch pages are evidence pages: everyone can see them, and the review controls appear only for reviewers.
  - The web server asks the API for `scope=all` (with the internal token) only when the session role is pharmacist or engineer.
- **Approval rule.**
  - A batch record is `ok` (approved) when at least one **pharmacist** recorded `ok` after the record's latest pipeline run, and no `issue` was recorded after that `ok`.
  - An engineer's `ok` is recorded but does not approve on its own.
  - A record is `issue` when the latest decision since the run is an issue.
  - A batch is `approved` when every record is `ok`.
  - A re-run resets the record to `pending`: decisions made before `run_at` stop counting, but they stay in the history.

## Global Constraints
(Carried from Sprint 2, plus the additions below.)
- No patient data and no PHI in logs. **Reviewer emails are personal data:**
  - they live only in the server `.env` (`REVIEWERS`) and in `ops.review_decision` / `ops.flag`
  - they are never shown publicly; public pages show a role only ("Pharmacist", "Engineer")
  - they are never logged
- Secrets live only in `deploy/.env` on the host or in GitHub secrets: `SESSION_SECRET`, `INTERNAL_API_TOKEN`, `TURNSTILE_SECRET_KEY`. The Firebase web config and the Turnstile site key are public.
- CSP is extended only as far as needed: `script-src` adds `https://apis.google.com https://www.gstatic.com https://challenges.cloudflare.com`; `frame-src` allows `https://<authDomain> https://challenges.cloudflare.com`; `connect-src` adds `https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`.
- Every write action requires all of: a valid session cookie, the right role, a verified Turnstile token, and the internal token on the API call. CSRF protection comes from Next.js server actions (Origin check) plus the SameSite=Lax cookie.
- Review history is append-only (`ops.review_decision`). Nothing is ever deleted.
- API envelope, commit format, test-first and per-product stage isolation rules are unchanged.
- **"No data" is never shown as "no interactions".** This still holds when records are hidden: if the anonymous checker can't show a product because it is not approved, it says so ("not yet reviewed") rather than silently dropping it.

## Review Focus
1. **An anonymous visitor can never see an unapproved record.** That covers search, product, substance and `/check`, including direct URLs. An unapproved product page shows "Not yet reviewed", not the data.
2. **A non-allowlisted Google user can never review.** A forged or expired session, a missing Turnstile token, or a role of `user` gets 403 and no write.
3. **Re-running a record invalidates its approval** (back to `pending`) while keeping the decision history.
4. **No email leaks:** no reviewer email appears in any public HTML or API response for an anonymous request, and none in logs.
5. **Chunked DDInter stage:** a crash mid-stage keeps the products already committed and produces correct stage results. A re-run continues without duplicates.

---

### Task 1: V4 migration (DB)
**Files:** `db/migrations/V4__review_and_scale.sql`; test `etl/tests/test_schema_v4.py`.
```sql
CREATE INDEX IF NOT EXISTS ddinter_pair_b_idx ON curated.ddinter_pair (ddinter_b);
CREATE INDEX IF NOT EXISTS substance_code_system_code_idx ON curated.substance_code (system, code);
CREATE INDEX IF NOT EXISTS brand_product_bdc_idx ON curated.brand_product (bdc_id);

CREATE TABLE ops.review_decision (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL, concept_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ok','issue')),
  note TEXT NOT NULL DEFAULT '',
  reviewer_email TEXT NOT NULL, reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('pharmacist','engineer')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (batch_id, concept_id) REFERENCES ops.batch_item (batch_id, concept_id) ON DELETE NO ACTION);
CREATE INDEX review_decision_item_idx ON ops.review_decision (batch_id, concept_id, decided_at DESC);

CREATE TABLE ops.flag (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('product','substance','batch_item','check','other')),
  target_id TEXT NOT NULL, message TEXT NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
  reporter_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ, resolved_by TEXT);

CREATE TABLE ops.batch_run (
  id BIGSERIAL PRIMARY KEY, batch_id TEXT NOT NULL, run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stages TEXT[] NOT NULL, counts JSONB NOT NULL, concept_ids TEXT[] NOT NULL DEFAULT '{}');

ALTER TABLE ops.batch_item ADD COLUMN extracted_at TIMESTAMPTZ;   -- set by the pipeline per item; reviews before it don't count
```
**Constraint fix:** `run_batch` currently deletes and recreates `ops.batch` and `ops.batch_item`. With `review_decision` pointing at `batch_item` through a NO ACTION foreign key, that delete would fail. It would also destroy history, which the Global Constraints forbid. Change `run_batch` to **upsert** instead:
- `ops.batch`: ON CONFLICT, update `item_count` and `run_at`.
- `ops.batch_item`: insert new items; for existing items, set `review='pending'`, `note=NULL`, `extracted_at=now()`.
- Remove only the items no longer in the file whose decision history is empty; keep the rest and mark them `note='removed from batch file'`.

This task covers both the migration and that `run_batch` change, with its existing tests updated.
- [ ] Tests:
  - every index exists
  - the decision CHECKs work
  - deleting a batch_item that has decisions is refused
  - re-running a batch keeps the decision history and resets `review` to pending with a new `extracted_at`
  - the flag message length check rejects messages that are too short or too long
- [ ] Commit `feat(db): V4 review, flags, batch runs, indexes; run_batch keeps history`.

### Task 2: ETL scale (chunked DDInter, single record, batch_run)
**Files:** `etl/src/bddrug_etl/stages/ddinter.py`, `etl/src/bddrug_etl/jobs/run_pipeline.py`, tests.
- **Chunking.** The DDInter stage commits every `--ddinter-chunk` products (default 5): that chunk's curated rows and its stage results go in one transaction. The planning and per-run caches still cover the whole run. A crash mid-stage leaves the earlier chunks committed and their results written. The products not yet processed get `fail` "not run: stage aborted at chunk N". Test this with a fake client that raises an OperationalError-free exception (for example `RuntimeError` from the client) at product 7 of 10.
- **Single record.**
  - `bddrug-etl --batch FILE --concept ID [--concept ID…]` runs the selected stages for those batch items only.
  - It updates their `extracted_at`, resets their review to pending, writes their stage results, and leaves the other items untouched.
  - An ID that is not in the batch file gives exit code 2 with a clear message.
- **Batch run history.**
  - Every run appends `ops.batch_run(batch_id, stages, counts, concept_ids)`, where `counts` = `{stage: {ok, warn, fail}}` for the items processed and `concept_ids` is empty for a full run.
  - The final log line is unchanged.
- [ ] Tests:
  - chunk commit and crash behaviour (Review Focus 5)
  - `--concept` runs only that item and resets only its review
  - batch_run rows for a full run and a single-record run
  - an unknown `--concept` gives exit 2
  - a re-run produces no duplicates
- [ ] Commit `feat(etl): chunked DDInter stage, single-record re-run, batch run history`.

### Task 3: API — review, flags, visibility, light list, batch report
**Files:** under `api/…`. Add an `InternalAuth` WebFilter or handler helper, plus `ReviewController`, `FlagController`, `BatchReportController`, extensions to the existing adapters, and tests.
- **InternalAuth.** Mutating endpoints and `scope=all` require the header `X-Internal-Token` equal to the env `INTERNAL_API_TOKEN`, compared in constant time. Without it they return 401 `UNAUTHORIZED` in the envelope. If `INTERNAL_API_TOKEN` is unset or shorter than 32 characters, the API refuses to start.
- **Visibility.** `scope=public` is the default; `scope=all` requires the token. Under public scope:
  - `/v1/products?q=`: only products with an approved batch item (`review='ok'` per the approval rule)
  - `/v1/products/{id}`: `200` with `{conceptId, tradeName, reviewStatus: "pending"|"issue", hidden: true}` and no data fields when the product is unapproved
  - `/v1/substances/{bdsId}`: only approved products are listed; the substance itself is shown when at least one of its products is approved, otherwise the same hidden shape
  - `POST /v1/interactions/check`: unapproved IDs go to `notReviewed: [{conceptId}]` and are excluded from alerts. This is a new array, kept separate from `noData`.
  - Batch endpoints are always readable. `review` values are public; reviewer emails are never returned. The decision list returns `{decision, note, role, decidedAt}`.
- **Review.** `POST /v1/batches/{batchId}/items/{conceptId}/decisions`, body `{decision: "ok"|"issue", note, reviewerEmail, reviewerRole}`. Token required.
  - It appends an `ops.review_decision` row.
  - It recomputes `batch_item.review` with the approval rule (pharmacist ok after `extracted_at`, no later issue) and `ops.batch.status` (approved when every item is ok, else in_review).
  - It returns the recomputed item review status and the batch status.
  - Validation: an `issue` needs a note of 5–1000 characters; the email must contain `@`; the role must be pharmacist or engineer.
- **Decisions list.** `GET /v1/batches/{batchId}/items/{conceptId}/decisions` returns the history, newest first, with role only and no emails. With the token, emails are included as well (for reviewers).
- **Flags.**
  - `POST /v1/flags` (token) with `{targetType, targetId, message, reporterEmail}`
  - `GET /v1/flags?status=open` (token)
  - `POST /v1/flags/{id}/resolve` (token) with `{resolvedBy}`
- **Light list.** `GET /v1/products/loaded?scope=` returns `[{conceptId, tradeName, dosageForm}]` sorted by trade name. Public scope returns approved products only.
- **Batch report.** `GET /v1/batches/{id}/report` returns:
  - `{counts: {stage: {ok, warn, fail}}, review: {pending, ok, issue}, warnings: [{conceptId, stage, note}], fails: [...]}`
  - `runs: [last 5 batch_run rows]`
  - `deltaVsPrevious: {stage: {ok, warn, fail}}`, the difference between the last two full runs
- [ ] Integration tests cover each rule above, including:
  - the Review Focus 1, 3 and 4 cases at API level
  - a wrong or missing token → 401
  - an engineer `ok` alone doesn't approve
  - a pharmacist `ok` after a re-run approves
  - an issue after an ok → issue
  - batch status transitions
  - a short `INTERNAL_API_TOKEN` stops startup (context-load test)
- [ ] Commit `feat(api): review decisions, approval gate, flags, scoped visibility, batch report`.

### Task 4: Web auth (Firebase + session + Turnstile)
**Files:**
- `web/app/signin/page.tsx` + `web/app/signin/SignInButton.tsx` (`"use client"`; the only client component)
- `web/app/api/session/route.ts` (POST sign-in, DELETE sign-out)
- `web/lib/session.ts` (`getSession()`, `createSessionCookie()`)
- `web/lib/reviewers.ts` (parse `REVIEWERS`)
- `web/lib/turnstile.ts` (`verifyTurnstile(token, ip)`)
- `web/components/Turnstile.tsx` (renders the widget `div` + script tag)
- `web/next.config.ts` (CSP)
- tests

Pinned versions: `firebase@11.1.0`, `firebase-admin@13.0.2`, `jose@5.9.6`.
- **POST /api/session** with JSON `{idToken}`.
  - Verify the token with firebase-admin (`initializeApp({projectId: FIREBASE_PROJECT_ID})`, `verifyIdToken(idToken, true)`) and require `email_verified`.
  - Role = the `REVIEWERS` entry, case-insensitive email match, else `user`.
  - Set the cookie `bddrug_session` (JWT with `{email, role}`, `exp` 8 h, httpOnly, Secure in production, SameSite=Lax, Path=/).
  - Rate limiting reuses the middleware.
- **DELETE /api/session** clears the cookie.
- **getSession()** verifies the JWT with `SESSION_SECRET`. The app refuses to start if that secret is shorter than 32 characters. It returns null when the session is invalid or expired.
- **Header.** When signed in, show "Signed in as <role>" with no email, plus a sign-out form. Otherwise show a "Reviewer sign-in" link.
- **CSP** extended as in the Global Constraints.
- **verifyTurnstile** POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret, the response token and the remote IP, with a 5 s timeout. It returns a boolean. On a network error it returns false (fail closed).
- **Local and e2e:** Cloudflare's documented always-pass test keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) are allowed only when `NODE_ENV !== "production"`. There is no other bypass, and no test-only sign-in route exists in production builds.
- [ ] Tests:
  - REVIEWERS parsing: case-insensitive, unknown → `user`, malformed entries ignored
  - session sign/verify, expiry and tampering
  - the session route with firebase-admin mocked: unverified email → 401, a valid token sets the cookie, the role is mapped
  - turnstile verify true/false/network-fail and the production test-key guard
  - the header shows a role and never the email
- [ ] Commit `feat(web): Firebase Google sign-in, session cookie, Turnstile verification`.

### Task 5: Web review UI, flags, visibility
**Files:** the batch page (review forms), `web/app/flags/page.tsx` (reviewers only), `web/components/FlagForm.tsx`, the product, substance, search and check pages (scope), `web/lib/api.ts` (`scope`, internal token header server-side only, new endpoints), and a batch report section on the batch page.
- **Batch page** (reviewers only):
  - each item gets two server-action forms, "Mark OK" and "Report issue", the latter with a required note
  - each form includes the Turnstile widget, and a small decision history (role and time only) is shown
  - the batch header shows the approval status and the report: counts per stage, review counts, warnings and fails, and the delta versus the previous run
  - the old "Report mismatches in the review sheet" text is replaced
- **Server actions** re-check the session and role (pharmacist or engineer), verify Turnstile, call the API with the internal token and the session's email and role, then revalidate the page. A `user` role or no session gets 403 with no API call.
- **Flags.** A "Flag a problem" form (server action) appears on product, substance and check pages for any signed-in user. It needs Turnstile and a 5–2000 character message. `/flags` lists open flags for reviewers, with a resolve button.
- **Visibility.**
  - Anonymous pages call the API with `scope=public`.
  - Hidden products show "Not yet reviewed by a pharmacist" and nothing else.
  - `/check` lists only approved products for anonymous users (using `/v1/products/loaded`) and shows a "Not yet reviewed" section for `notReviewed` IDs.
  - Reviewers get `scope=all` and see an "unreviewed" badge on unapproved records.
- **The internal token** is read only in server code (`lib/api.ts`, server-only) and never reaches client bundles. Add a build test that greps `.next/static` for the token env name and for any test token value.
- [ ] Tests:
  - server actions reject without a session, with role `user`, or with a failed Turnstile check, and make no API call in those cases
  - a reviewer action calls the API with the right body and headers
  - an anonymous product page for a hidden product shows the "not yet reviewed" text and no data
  - the check page renders `notReviewed`
  - no email appears in rendered HTML for anonymous visitors or for signed-in reviewers viewing history
  - the flag form validates length
- [ ] Commit `feat(web): review decisions and approval on batch pages, flags, scoped visibility`.

### Task 6: Deploy config + docs
**Files:** `deploy/docker-compose.yml`, `deploy/.env.example`, `README.md`, `.github/workflows/deploy.yml` (if needed).
- **Compose:**
  - `web` gets `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SESSION_SECRET`, `INTERNAL_API_TOKEN`, `REVIEWERS`.
  - `api` gets `INTERNAL_API_TOKEN`.
- **Build-time public values.** `NEXT_PUBLIC_*` values are inlined at build time, so the deploy workflow must pass them as `--build-arg`s. They come from GitHub repo **variables**, not secrets, because they are public: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `TURNSTILE_SITE_KEY`. The web Dockerfile declares the matching ARGs.
- **README:** a "Reviewer sign-in setup" section covering the Firebase console steps, Turnstile, `REVIEWERS` format, secret generation (`openssl rand -hex 32`) and how to add a reviewer (edit `.env`, then `docker-compose up -d web`).
- [ ] `docker compose config` is valid and actionlint is clean.
- [ ] Commit `chore(deploy): reviewer auth configuration`.

### Task 7: End-to-end (local)
Run the full stack locally:
- Turnstile test keys and a test `REVIEWERS` list.
- Firebase can't be automated, so session cookies are minted in the test harness with `SESSION_SECRET` (local only; the cookie format is our own JWT).
- The local pipeline run reuses the Sprint 2 pilot.

Verify:
- anonymous visitors see nothing unapproved (Review Focus 1)
- a `user`-role cookie can't review (403) (Review Focus 2)
- an engineer `ok` doesn't approve
- a pharmacist `ok` approves the record and it appears for anonymous visitors
- re-running that record (`--concept`) returns it to pending and hides it again (Review Focus 3)
- no emails appear in anonymous HTML (Review Focus 4)
- a chunked DDInter run behaves correctly (Review Focus 5)
- the flag create, list and resolve flow works
- `/check` shows the not-reviewed section

## Definition of done
- All tasks approved by review, the whole-branch review is clean, and the local E2E passes.
- Deploy happens once the product owner supplies the Firebase config, the Turnstile keys and the REVIEWERS list. Until then the live site still runs Sprint 2. Merging is safe: without the env values, sign-in is disabled with a clear message and the visibility gate still applies. **Note:** the pilot will be hidden from anonymous visitors until a pharmacist approves it.
