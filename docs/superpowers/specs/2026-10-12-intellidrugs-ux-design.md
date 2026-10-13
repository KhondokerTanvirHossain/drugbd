# IntelliDrugs UX: design spec for the live system

| | |
|---|---|
| **Status** | Ready for implementation planning |
| **Date** | 12/10/2026 |
| **Product** | IntelliDrugs, served at `drugdb.eliooo.org` (repository `gitlab/ddinter2`, internal name BDDrug KB) |
| **Approved design** | Direction A "Clinical Calm", wordmark option A ("IntelliDrugs" + cobalt full stop), approved by the user on 12/10/2026 |
| **Visual source of truth** | `docs/artifacts/2026-10-12-intellidrugs-design-system.html`, `-reviewer.html`, `-public.html`, `-learn.html`, and `docs/design/intellidrugs/tokens.css` |
| **Earlier approved docs** | `docs/design/2026-10-11-bd-drug-kb-design.md`, `docs/design/database.md` (schema `db-schema-v1.0` is locked) |

This document is the authority the implementation plans argue from. Where it says **Decision**, the choice is made and is not open. Where a board and this spec disagree, this spec wins only in the cases listed in §1.6 (board errors found against live data or the safety rules, and board strings that the Decisions here change). Everywhere else the boards win. Any string shown in "quotes" or a code block below must be used verbatim: it is either copied from a board, or it is new copy for a state the boards do not draw, listed in §1.7. Any quoted string that no board contains is new copy whether or not §1.7 names its state: it follows §3.5, and the copy test (§11.1) checks it against the §1.7 list.

Conventions used throughout:

- "Board R" = reviewer board, "Board P" = public board, "Board L" = Learn board, "Board DS" = design-system board.
- `$WEB` = `web/`, `$API` = `api/src/main/java/com/niramoy/bddrug`, `$ETL` = `etl/src/bddrug_etl`.
- Dates: `DD/MM/YYYY`, 24-hour clock, zone always named. Dhaka is UTC+6 with no daylight saving.

---

## 1. Summary, goals, non-goals, success criteria

### 1.1 Summary

We rebuild the existing Next.js 15 web app (`$WEB`) on the IntelliDrugs design system and ship three surfaces, in this order:

1. **Reviewer workspace** (`/review`). A pharmacist or engineer works through a batch record by record with the keyboard: compare the DGDA source with the extraction, read the automated checks and interactions, then press A ("Looks correct", committed after an 8-second undo window) or R ("Report issue").
2. **Public site**. Landing page, Google sign-in and sign-up, medicine search with synonyms, product pages, hidden-record stubs, substance pages, the interaction checker, and the partner access request.
3. **Learn**. Ten chapters explaining the model, the process, interactions, reviewing and the partner API.

The pages stay server-rendered. A short, fixed list of client islands (§4.2) adds the interactive parts.

### 1.2 Goals

- G1. The pharmacist can review the 10 records of batch `0001-pilot` in one sitting with no training, using the keyboard only.
- G2. A doctor can find a medicine by brand, substance or DAR number and check it against other medicines in under a minute.
- G3. Every safety rule from the boards holds on every surface:
  - absence of data is never shown as safety;
  - unknown severity is never merged with Minor;
  - nothing is public until a pharmacist approves it. The single exception is Learn's frozen, labelled explanatory examples (§6.8), which offer no search, check or link into unreviewed records;
  - an engineer's check never publishes;
  - Enter never approves in the desk. On the no-JavaScript confirm page (§5.8.6) the explicit "Confirm" button is the approval, and it is reached only through a second, deliberate POST.
- G4. The site meets WCAG 2.2 AA in both themes, and the contrast table in Board DS still holds.
- G5. The approved UX is reachable with the security posture intact: SSR, an internal-only API, rate limits, Turnstile on every write and on sign-in, no PHI, and an audit trail.

### 1.3 Non-goals (v1 of this UX)

- Bengali UI. Reviewers work on laptops in English, and the public site ships in English.
- Partner API keys, metering, `/v1/releases`, and monthly releases. These stay "planned" in Learn chapter 8.
- Automated invite emails. Invites are sent by hand (§5.13).
- Per-batch reviewer roles. Roles stay global, from `REVIEWERS` (§5.13).
- Native mobile apps, offline mode, and push notifications.
- Showing disease and food interaction text on product pages. Product pages show counts; substance pages show detail (§6.6).
- Changing anything on the shared EC2 host outside the `bddrug` compose project and its existing Caddy block.

### 1.4 Success criteria (each one is testable)

| # | Criterion | How it is measured |
|---|---|---|
| S1 | A pharmacist who has never seen the desk reviews all 10 pilot records in one sitting. They ask for help 0 times, make 0 unintended approvals, and finish in 30 minutes or less. | Moderated session on a laptop at 1280×800 with the live pilot, default settings (8-second undo window, single-key shortcuts on). The observer records each help request, each U press and each commit. After the session the pharmacist confirms each committed decision against a printed list of the `decision` audit events for the session; any decision they did not intend counts as unintended (target 0). Undo presses are not counted as errors; they never reach the server (§5.15), so they come from the observer's record only. |
| S2 | A doctor goes from the landing page to an interaction result for "Napa + G Warfarin" in under 60 s, using search, the product page and "Check Napa with other medicines". | Precondition: Napa and G Warfarin are approved. Timed task with 5 doctors, measured separately per device: median under 60 s on a laptop, and median under 60 s on a phone over a throttled "Slow 4G" profile. |
| S3 | WCAG 2.2 AA. axe reports 0 violations on every route and state listed in §11.4. A manual keyboard and screen-reader pass (NVDA + Firefox, VoiceOver + Safari) completes the S1 and S2 tasks. | Playwright + `@axe-core/playwright`; manual checklist in §10. |
| S4 | The contrast table holds. In light, 126 of 126 text pairs pass 4.5:1 with a lowest value of 4.69. In dark, 126 of 126 pass with a lowest of 5.18. The lowest control boundary is 3.33 (light) and 3.20 (dark). | Unit test that parses `tokens.css` and recomputes the Board DS tables (§11.1). |
| S5 | Lighthouse (mobile, Slow 4G) scores at least 90 for performance and 100 for accessibility on `/`, `/search?q=paracetamol`, a product page and `/check`. The page-weight budgets in §10.6 hold. | Lighthouse CI in the e2e job. |
| S6 | Each safety string in §3.6 appears verbatim wherever its condition holds, and no paraphrase of it appears anywhere. | Copy test (§11.1) plus e2e assertions. |
| S7 | After the ETL route fix and re-run, the eye-drop record's DDInter stage is OK with no `DDInter351` pair in its note. Its checker result with G Warfarin names `DDInter352` and raises no alert. | ETL, API and e2e tests (§8, §11). |

### 1.5 Data finding that shapes this spec: Chloramphenicol eye drops

The approved boards were built on a pilot export that checked the eye-drop product (`127-0163-052--chloramphenicol`, Eye Drops, route `ophthalmic`) against **`DDInter351`**, the systemic chloramphenicol entry. DDInter's own data, fetched on 12/10/2026, shows:

| Entry | Pairs | Severity mix | Pilot partners |
|---|---|---|---|
| `DDInter351` Chloramphenicol (systemic) | 538 | Major 47, Moderate 421, Minor 21, Unknown 49 | Simvastatin (moderate, synergy), Warfarin (moderate, metabolism), Amlodipine (moderate, metabolism), plus Acetaminophen, Acetylsalicylic acid, Clarithromycin and Amoxicillin (all Unknown) |
| `DDInter352` Chloramphenicol (ophthalmic) | 112 | Major 1, Moderate 111 | none |
| `DDInter353` Chloramphenicol (otic) | 4 | phenytoin family only | none |

How the live system behaves:

- **The API is already correct.** `$API/domain/RouteRule.java` picks `DDInter352` for the eye drop, so the checker raises no alert, which matches DDInter's data. What is missing is a statement of which entry was checked.
- **The ETL stage note is wrong.** For the eye drop it lists four `DDInter…/DDInter351` "text not found" pairs that never apply to this product.
- **Learn is wrong.** It says route matching is "planned, not current". It is live.
- **Board P is wrong.** It shows warfarin and simvastatin alerts for the eye drop that the real API does not return.

Corrections:

- §8 fixes the ETL.
- §7 adds the "checked against" fields to the API.
- §6.7 adds the "checked against" line to the checker.
- §1.6 lists the board corrections.

### 1.6 Board errors and strings this spec overrides (Decision)

1. **Board P checker and product page.** Chloramphenicol eye drops use `DDInter352`, not `DDInter351`. The eye drop raises no alert with any pilot product, so Napa's unclassified panel on the product page lists 6 partners, not 7 (Chloramphenicol moves to "No interaction listed in DDInter 2.0"). The route note on its cards is replaced by the "checked against" line in §6.7. The "Not in the pilot pair list" category becomes "No interaction listed in DDInter 2.0" (§6.7.2), because the database stores the full pair list of every mapped DDInter entry, reconciled against DDInter's own partner list (§8.1 item 5), so an absent row means DDInter lists no interaction.
2. **Board R interactions section.** Board R's paragraph "These pairs use `{id}`, the systemic DDInter entry. This record's route is {route}; its DDInter entry for that route is `{id}`." is replaced by the chosen-entry lines in §5.6.4.
3. **Board L chapter 2 "Route scope" card and glossary "Route assumed".** The text becomes: "This eye-drop product is checked against `DDInter352`, the ophthalmic entry. When a product's route has no DDInter entry, the systemic entry is used and marked "route assumed"."
4. **Board L chapter 4 "The review gate".** "Approval is worked out from the decision history on every public read" becomes: "Approval comes from the decision history. Each decision updates the record's review status, and a re-run resets it, so a decision made before the latest extraction never counts."
5. **Board L chapter 6 "The pilot's 35 pairs".** This becomes "The pairs that apply to the pilot products": 28 pairs, Major 4, Moderate 6, Minor 2, Severity not classified by DDInter 16. The 7 `DDInter351` pairs belong to systemic chloramphenicol and do not apply to the eye drops.
6. **Board L chapter 7 "Specific" example note.** The whole note is replaced, because its premise (the DDInter warning lists pairs on `DDInter351`) is false after §8. It becomes: "Chloramphenicol eye drops: route is ophthalmic, and the interactions use DDInter352 (ophthalmic). The ophthalmic entry DDInter352 has no pair with the pilot drugs; it has 112 pairs in DDInter. Please confirm that DDInter351 (systemic) should not apply to this product." Its caption "Names the record, the field, both values and the question." stays.
7. **Expected pilot triage after the fix** (these replace Board R and L counts in acceptance tests; if the §8.1 item 5 reconciliation stores a pilot pair that the graph lacked, the P0 PR updates this list, item 10 and item 11 from the re-run's stage notes, so the spec and the tests never disagree):
   - "Warnings" holds 9 records, not 10.
   - Row hints:
     - Amlodipine-5: "1 check warning, 4 pairs without text"
     - Aspirin: "1 check warning, 5 pairs without text"
     - Simvastatin: "1 check warning, 4 pairs without text"
     - Chloramphenicol: "All checks OK"
     - Domperidone: "No DDInter data"
     - G Warfarin: "1 check warning, 1 pair without text"
     - G-Metformin: "1 check warning, 5 pairs without text"
     - Napa: "1 check warning, 6 pairs without text"
     - Clarith: "1 check warning, 2 pairs without text"
     - Amoxycillin Clavulanic Acid: "1 check warning, 5 pairs without text"
8. **Board R evidence drawer.** Board R announces "The record behind it is paused until you close it." but its `blocked` expression (Board R script, `var blocked=!inRecord||paused||pend||…`) does not test the drawer, so A still approves while the drawer is open. The live desk pauses both decisions while the drawer is open (§5.7), so the announcement is true.
9. **Board P landing hero card.** Board P renders Napa's clinical drug, codes and severity counts on the public landing page while Napa is unapproved, under a caption that says the public sees only its name and status. That breaks G3. While the hero product is not approved, the live card shows only the trade name and its review status (§6.1). Board P's approved-state card is used once the product is approved, with two changes: no Example marker or "Example" in its `aria-label`, and below 480 px no company, because there is no short company name for Board P's "Beximco" (§6.1).
10. **Board R detail, route-aware (D14).** For every record:
    - the ingredient data line becomes the §5.6.1 wording ("Interaction data found for this product's route ({route}): …"), not Board R's "Interaction data found {all ids (route)}";
    - the severity chips and the "{total} drug pairs in total." line count the chosen entries only. For the eye drop that is 112, not Board R's 654 (all three entries);
    - the comparison table's "DDInter mapping" row adds "Checked against `{id}` ({route})" (§5.5.2);
    - the eye drop's batch block reads "0 pairs found in DDInter 2.0. 1 pair not checked." and "None of the 28 batch pairs from DDInter 2.0 involve Chloramphenicol." Board R lists 7 `DDInter351` pairs there;
    - no other record lists a Chloramphenicol pair (Board R lists one on each of the 7 records whose substance is a `DDInter351` partner), and every "None of the {N} batch pairs…" line uses N = 28, not 35.
11. **Board L pilot counts after the fix.** These fixed texts change (and `learn-snapshot.test.ts` checks them against the snapshot, §6.8):
    - chapter 6 "Severity levels": "The counts are the 35 DDInter pairs found among the pilot substances." becomes "The counts are the 28 DDInter pairs that apply to the pilot products." The chips and the "Most serious first" line read Major 4, Moderate 6, Minor 2, Severity not classified by DDInter 16 (Board L: 4, 9, 2, 20);
    - chapter 6 "Actions": Synergy 3 pilot pairs, Metabolism 6, Not given 16 (Board L: 4, 8, 20). Other actions are unchanged;
    - chapter 4 DDInter "Pilot result": "9 of 10 records warned. Eight list pairs with no DDInter text. Domperidone has no DDInter data. Chloramphenicol is OK.";
    - glossary "Severity": "Pilot: 4 Major, 6 Moderate, 2 Minor, 16 not classified";
    - glossary "Stage check": "Pilot: Warning DDInter for 9 of 10 records".
12. **Board L safety strings.** Chapters 4 and 7 show the Domperidone pipeline note as `NO_DATA_SENTENCE` in full (Board L already says it is "shown to reviewers and visitors as the full no-data statement"). Chapter 6 "Not given" uses `UNKNOWN_PAIR_LINE` in place of "DDInter 2.0 lists this pair with no interaction or management text. It is not treated as low risk."
13. **Board L API and scope text (§2.2, §7.4).**
    - Chapter 1 "How to read a record": "This is Napa as a signed-in reviewer sees it." becomes "This is Napa as the review desk shows it." The rest of the caption stays.
    - Chapter 1 public card note: "The API returns the same thing: the name, reviewStatus: "pending" and hidden: true." becomes "The API returns the same thing: the id, trade name, status "not_reviewed" and hidden: true."
    - Chapter 8: both example response bodies are regenerated from the §7.4 shapes (the hidden product has no `reviewStatus`; `notReviewed[]` items carry `tradeName`). "Napa is not approved yet, so a public caller gets its name and review status, with hidden: true." becomes "Napa is not approved yet, so a public caller gets its id, trade name and status "not_reviewed", with hidden: true." The safety-fields row 'hidden: true / reviewStatus other than "ok"' becomes 'hidden: true, status "not_reviewed" or "removed"'. The access legend "All" becomes "scope=all with the internal token, used only by integration tests. Reviewers read unreviewed data through /v1/review/*."
14. **Undo window wording (D30).** In Board L, "8-second undo window" becomes "undo window (8 seconds by default; 20 or 60 in desk settings)", in the chapter 4 gate table and re-run steps, chapter 7 "Decide" and keys, and the glossary "Undo window" ("The undo window after "Looks correct" (8 seconds by default; 20 or 60 in desk settings) when U cancels it. Nothing is saved until it closes."). Chapter 4's "After 8 seconds the record is public." becomes "When the undo window closes, the record is public." The FAQ answer becomes "Press U or Undo before the undo window closes (8 seconds unless you lengthened it). Nothing is saved or published until the window closes." Pictures of the desk (the promise and the toast in chapter 7) keep the default 8. Board DS principle 6 is documentation and is not rendered.
15. **Board P strings changed by scope.** Product page "With the other pilot medicines" becomes "With the other medicines in batch {id}" (D25). "No other pilot brand maps to…" becomes "No other approved brand maps to…", because only approved brands are listed (§7.4). The search substance meta "{k} product in the pilot" becomes "{k} approved product[s]", for the same reason.

### 1.7 States the boards do not draw (new copy, Decision)

The boards do not cover the states below. Their copy is defined in the section named and is verbatim like board copy. Every string follows §3.5.

| State | Section |
|---|---|
| Decision sent but not confirmed (timeout, lost response, 5xx) | §5.7, §5.8.4 |
| Session expired during an undo window or at commit | §5.8.2, §5.8.4 |
| U pressed while the decision is saving | §5.8.4 |
| Approval refused because a check failed or did not run | §5.7, §5.8.4, §7.2 |
| A or R pressed while the evidence drawer is open | §5.8.4 |
| Desk settings: undo window length and single-key shortcuts | §5.8.1, §5.14 |
| "Don't include patient names or other personal health details." help on free-text fields | §5.10, §6.5, §6.9 |
| DDInter mapping not run (product page, desk, checker) | §5.6.1, §6.5, §6.7.3 |
| Product page: ingredient with no data or no entry for its route | §6.5 |
| Record removed from the DGDA batch file (public stub) | §6.4 |
| Maximum of 20 medicines reached in the checker | §6.7.1 |
| Landing hero card while the hero product is not approved; its `aria-label` in both states | §6.1 |
| Learn: snapshot-value date suffix "as stored on {date}" | §6.8 |
| Decision saving (`committing`): promise and toast | §5.7, §5.8.4 |
| Desk: narrow-screen "Back to list", the no-JavaScript notices, loading and loaded announcements | §5.1, §4.4, §5.12 |
| Desk: batch load error, batch not found | §5.12 |
| History: role variants, the "No longer counts" suffix, shared-change entries | §5.6.5 |
| Account menu item "Keyboard shortcuts and settings" | §5.14, §6.2 |
| Batch list and problem-report and partner-request lists (`/review`, `/review/flags`) | §5.16 |
| Phase-0 `/batches` gate for non-reviewers | §12.1 |
| Sign-in: not configured, session request failed, sign-in rate limit, engineer welcome step, "Invite sent to another Google account" placement | §6.2, §9.3 |
| Search: validation, page cap, substance hit with no data or not run | §6.3 |
| Desk and product page: route-aware data line, chosen-entry statement, other not-checked reasons in the batch block | §5.6.1, §5.6.2, §5.6.4, §6.5 |
| Product not found | §6.4 |
| Product page: "Report a problem" field label, "No other approved brand" line | §6.5 |
| Checker: summary segments, "Other not checked" count, unknown id (404), check failed (5xx), scenario announcement | §6.7 |
| Partner request sent | §6.9 |
| Route assumed because the product has no route | §5.6.4, §6.7.3, §8.1 |

---

## 2. Information architecture and routes

### 2.1 Route map

| Route | Purpose | Rendered by | Who can open it |
|---|---|---|---|
| `/` | Landing page | server | everyone |
| `/search?q=&page=` | Medicine search (brands, substances, synonyms, DAR) | server | everyone |
| `/products/[conceptId]` | Product page; hidden-record stub when not approved | server | everyone (scoped) |
| `/substances/[bdsId]` | Substance page: names, codes, interactions with text, products | server | everyone (scoped) |
| `/check?ids=…&ids=…` | Interaction checker | server + combobox island | everyone (scoped) |
| `/check/suggest?q=` | Combobox suggestions (route handler, JSON, at most 10 rows) | server | everyone, rate-limited |
| `/learn` | Redirects 307 to `/learn/start` | server | everyone |
| `/learn/[chapter]` | One Learn chapter. `chapter` ∈ `start`, `model`, `codes`, `process`, `why`, `interactions`, `reviewers`, `partners`, `glossary`, `faq` | server | everyone |
| `/partners` | "For partners" summary and partner access request form | server | everyone reads; the form needs sign-in |
| `/privacy` | Privacy statement (expands the sign-in card's privacy text) | server | everyone |
| `/signin` | Sign in or sign up with Google; post-sign-in welcome states | server + SignInButton island | everyone |
| `POST /api/session` | Session create (existing, extended with Turnstile). `DELETE /api/session` is removed: `POST /signout` is the only way to sign out. | route handler | everyone, rate-limited |
| `/review` | Batch list (§5.16); redirects 307 to the newest `in_review` batch if there is exactly one | server | pharmacist, engineer |
| `/review/[batchId]` | Redirects 307 to the first record in the current filter that needs review for the viewer's role, otherwise record 1 | server | pharmacist, engineer |
| `/review/[batchId]/[conceptId]?show=&q=` | **The workspace**. One route. The batch layout (toolbar and the ReviewDesk island) persists across records; the record page renders the filters, the list and the detail pane (§5.8.1). | server + ReviewDesk and DeskRecordContext islands | pharmacist, engineer |
| `/review/[batchId]/versions` | Version tokens for stale detection (route handler, JSON) | server | pharmacist, engineer |
| `/review/flags` | Open problem reports and partner access requests, with Resolve (§5.16) | server | pharmacist, engineer |
| `POST /signout` | Sign out (route handler, §9.6): checks `Origin`, clears the session cookie, sends `Clear-Site-Data: "storage"`, then 303 to `/` (or to `/signin?returnTo=…` for "Use another Google account") | route handler | everyone, rate-limited |
| `/healthz` | Liveness (route handler, `200 ok`, not rate-limited) | server | container healthcheck |

**Decision: one route per Learn chapter, not one long page.** Each chapter loads on its own, which keeps page weight down on slow connections. The chapter nav becomes links with `aria-current="page"`. The "On this page" rail lists that chapter's sections.

**Decision: no separate clinical-drug route.** "Other brands of …" is a card on the product page (§6.5).

### 2.2 Who sees what

| Data | Anonymous | Signed in, role `user` | Engineer | Pharmacist |
|---|---|---|---|---|
| Approved product, substance and clinical drug | yes | yes | yes | yes |
| Unapproved product (any state other than `approved`: pending, engineer checked, issue, back in review) | stub only: concept id, trade name, "Not yet reviewed by a pharmacist", batch id | stub only | stub on public routes; full in `/review` only | stub on public routes; full in `/review` only |
| Product whose latest batch item is marked "removed from batch file" | stub with "Removed from the DGDA batch file." (§6.4), whatever its last decision | same | same on public routes; not listed in `/review`, and decisions on it are refused (§7.2) | same |
| Unapproved substance (none of its products approved) | stub only: BDS id, name, "Not yet reviewed by a pharmacist" | stub only | stub on public routes; full in `/review` only | stub on public routes; full in `/review` only |
| Unapproved clinical drug (no approved product maps to it) | not served | not served | in `/review` only | in `/review` only |
| Batch evidence (source JSON, stage evidence, extraction) | no | no | yes | yes |
| Decision history, with notes | no | no | yes (roles only; "(you)" for own) | yes |
| Public verification line (role and date of the counting approval) | yes, approved records only | yes | yes | yes |
| Emails of anyone else | never | never | never | never |
| Own name and email | n/a | in the account menu only | same | same |
| Report a problem (flag) | no ("Sign in to report a problem") | yes | yes | yes |
| Review decisions | no | no ("Your account can't review this batch.") | records an engineer check | approves and publishes |
| Resolve flags | no | no | yes | yes |
| Partner access request | no (sign in first) | yes | yes | yes |

**Decision: public routes always read with public scope.** `/`, `/search`, `/products/*`, `/substances/*`, `/check`, `/check/suggest`, `/partners`, `/learn/*` and `/privacy` call the API with `scope=public` whatever the session, so a reviewer sees exactly what a reader sees there. Unapproved data is readable only under `/review/*`, through the token-gated endpoints in §7.3. The current `UnreviewedBadge` and the `scopeFor(session)` switch on public pages are removed. An e2e test opens `/products/{unapprovedId}` with a pharmacist session and asserts the stub (§11.4).

Stored emails ("Emails of anyone else") are never rendered by any route. The team reads them only with database access, through the runbook queries in `docs/runbooks/` (§6.9). The folder does not exist yet: `docs/runbooks/reviewer-invite.md` is a new file written in P1B and `docs/runbooks/partner-requests.md` a new file written in P2 (§12.2).

### 2.3 Redirects from current routes (308 Permanent Redirect unless stated)

| Current | New |
|---|---|
| `/?q=X&page=N` | `/search?q=X&page=N` |
| `/batches` | `/review` |
| `/batches/[id]` | `/review/[id]` |
| `/batches/[id]?review=…&item=…` | `/review/[id]/[item]` (outcome query dropped) |
| `/flags` | `/review/flags` |
| `/products/[id]`, `/substances/[id]`, `/check`, `/signin`, `/api/session` | unchanged |

**Decision.** Anonymous access to any `/review/*` route redirects 307 to `/signin?returnTo=…`, and `user` access returns status 200 with the not-authorised page in §5.12. Neither ever shows the data. This closes the gap where `/batches/[id]` showed unreviewed data to anonymous visitors.

---

## 3. Design system adoption

### 3.1 Stylesheets

- **`$WEB/styles/tokens.css` is a byte-identical copy of `docs/design/intellidrugs/tokens.css`.** A unit test compares SHA-256 hashes. To change a token, change the docs copy first, then copy it.
- `$WEB/styles/fonts.css` holds only `@font-face` rules (§3.2).
- Page and component layout lives in CSS Modules (`*.module.css`). Modules use tokens only, never raw colour values. A Stylelint rule (`color-no-hex`, `color-named: never`, and `function-disallowed-list: rgb, rgba, hsl`) fails the build on any colour literal outside `tokens.css`.
- Layout rules that the boards define in their second `<style>` block (`.pg`, `.app`, `.panes`, `.d-…`, `.s-…`, `.d-shell`, and so on) are ported into modules with the same values.
- Remove every inline `style={{…}}` object in `$WEB`. The only allowed inline styles are CSS custom properties: a measured value (for example `--w: 40%` on progress meters), and `--dur-commit` on the desk toast, set to the reviewer's undo window (§5.8.4).
- Root layout: `<html lang="en">`, `<body>` with no inline style. Global imports, in order: `tokens.css`, `fonts.css`.

### 3.2 Fonts

**Decision: self-host the fonts. Do not load from Google Fonts at runtime.**

- WOFF2 files go in `$WEB/public/fonts/`:
  - Onest variable, latin subset, weights 400–700;
  - IBM Plex Mono 400 and 500, latin subset;
  - both OFL licence texts.
- `fonts.css` declares `font-family: "Onest"` and `font-family: "IBM Plex Mono"`, so `--font-ui` and `--font-mono` in `tokens.css` work unchanged. Use `font-display: swap`.
- The root layout preloads Onest only: `<link rel="preload" as="font" type="font/woff2" crossorigin>`.
- CSP needs no font host, because `font-src 'self'` comes from `default-src`.
- The `<link>` to Google Fonts in the `tokens.css` header comment is documentation only and is never emitted.

### 3.3 Theming: system, light or dark, with no flash

- **Decision: the theme lives in a cookie, not localStorage.**
  - Cookie: `intellidrugs-theme` = `system` | `light` | `dark`. Max-Age 1 year, `SameSite=Lax`, `Path=/`, `Secure` in production, not httpOnly.
  - The root layout reads the cookie on the server. It renders `<html data-theme="light|dark">`, or no attribute for `system`.
  - `tokens.css` already handles `prefers-color-scheme` under `:root:not([data-theme="light"])`.
  - No inline script, so the first paint is never in the wrong theme.
- The theme control is the `.seg` segmented control with `role="group"`, `aria-label="Colour theme"`, and buttons "System", "Light" and "Dark" carrying `aria-pressed`.
  - It is a `<form method="post" action={setThemeAction}>` with three submit buttons, so it works without JavaScript.
  - The ThemeSwitch island enhances it. On click it sets `data-theme` at once, writes the cookie, and skips the round trip.
- **Placement:**
  - the public site footer;
  - the account menu;
  - the Learn toolbar (per Board L);
  - the reviewer workspace, in the account menu only. The toolbar stays as in Board R.

### 3.4 Component contract

Each component is a React server component in `$WEB/components/ui/`. It renders the exact class names from `tokens.css`. Props are typed unions. No component accepts free text where the vocabulary fixes the wording.

| Component | Props | Renders | Rules |
|---|---|---|---|
| `Wordmark` | `size: number`, `sub?: "Review" \| "Learn"` | `<span class="wordmark">IntelliDrugs<span class="wordmark-dot" aria-hidden="true">.</span>[<span class="sr-only"> </span><span class="wordmark-sub">Review</span>]</span>` | Size is set with font-size only. In running text, write "IntelliDrugs" with no stop. |
| `BrandIcon` | `size: 16 \| 24 \| 32 \| 64` | The "iD" monogram SVG from Board DS. The 16 px master uses the thickened paths. | Fixed colours `--brand-mark` and `--on-brand-mark`. Used for the favicon (`app/icon.svg`), the Learn lockup, and the sign-in card. Below 380 px the Learn lockup drops the icon. |
| `Severity` | `level: "major" \| "moderate" \| "minor" \| "unknown"`, `count?: number` | `.sev .sev--major` with "Major"; `--moderate` "Moderate"; `--minor` "Minor"; `--unclassified` "Severity not classified by DDInter"; optional `<b class="sev-n">n</b>` | Any value other than major, moderate or minor renders as `unknown`. There is no short form of the unclassified label. Not interactive. |
| `NoDataChip` | `label: string` | `.sev .sev--nodata` | Only for coverage `none`: "No data" and "No interaction data" on a substance whose coverage is `none`, "Not checked" with the count of reason-`no_data` pairs, and "A + B" pairs not checked because one side has coverage `none`. Never for `not_run`, `no_route`, `unmapped` or `same_product`. |
| `NoDataBlock` | `title`, `bdsId?`, `pairs?: string[]`, `extra?: ReactNode` | `.nodata-block.hatch` with `role="note"`, glyph, plate, title, and the fixed sentence | Always expanded. Never green. Never inside a collapsed `<details>`. The fixed sentence is built in and cannot be overridden. |
| `ReviewStatus` | `status: "pending" \| "approved" \| "engineer_checked" \| "issue" \| "back_in_review"`, `compact?: boolean` | `.rv` pills with this wording: "Not yet reviewed by a pharmacist", "Approved by a pharmacist", "Engineer checked", "Issue reported", "Back in review" | `compact` is allowed only in the reviewer record list. Compact keeps the remainder of the wording as `sr-only` text, never `aria-label`: "Not yet reviewed<sr> by a pharmacist</sr>", "Approved<sr> by a pharmacist</sr>", "Engineer checked<sr>. Not yet reviewed by a pharmacist</sr>". Public views accept only `pending` and `approved`. |
| `StageCheck` | `name`, `status: "ok" \| "warn" \| "fail"`, `children` | `.stage .stage--ok\|warn\|fail` with `.stage-status` "OK", "Warning" or "Failed" | The icon and the word always appear together. Notes are the pipeline's own. "OK" is never green. |
| `MatchRelation` | `kind: "same" \| "norm" \| "salt" \| "added" \| "differs"`, `sub?: string` | `.match--…` with "Matches", "Normalised", "Salt removed", "Added" or "Differs", plus an optional `.cmp-sub` | Used only in comparison tables. |
| `CodeChip` | `system`, `code`, `meta?: {method, confidence, route?}` | `.code` with `.code-sys`: ICD11_XM shows "ICD-11", RXCUI "RxCUI", ATC "ATC", DRUGBANK "DrugBank", SNOMEDCT "SNOMED CT", DDINTER "DDInter"; `.code-meta` "method, 1.0[, route]" | Only the value is mono. Reviewer screens show the meta. Public pages show the method in the codes table instead. |
| `PairCard` | `severity`, `names`, `meta`, `text?: {kind: "management" \| "interaction", body}`, `source`, `surface: "reviewer" \| "public"` | `.pair` | DDInter text is truncated and never rewritten. Uses the `Expander` island with `label` = `surface` (§4.2). |
| `Banner` | `tone: "info" \| "warn" \| "crit"`, `title`, `body`, `action?` | `.banner--…` | Copy pattern: a bold first sentence, what was or was not saved, then one action. |
| `Toast` | client-only, inside ReviewDesk | `.toast` | Never takes focus. |
| `Kbd` | `keys: string` | `.kbd` | The key is printed on the control it triggers. |
| `Button` | `variant: "primary" \| "tonal" \| "plain" \| "destructive"`, `size?: "sm" \| "lg"`, `busyLabel?` | `.btn--…` | When loading, the button keeps its width and shows the `busyLabel`. "Report issue" is tonal, never destructive. |
| `Field` | label, control, help, error, counter | `.field` | Errors use `aria-invalid="true"` plus `.field-error` text linked through `aria-describedby`. |
| `Segmented` | options, value | `.seg` | Uses `aria-pressed`. |
| `ProgressMeter` | `approved`, `issue`, `total` | `.prog` with `role="img"` | Worded `aria-label`: "{a} of {n} approved by a pharmacist, {i} with an issue reported". |
| `BotCheck` | `state: "passed" \| "checking" \| "failed"` | `.botcheck` showing "Bot check passed", "Checking" or "Bot check failed" (failed adds `.is-failed`) | Inline text only. |
| `ExampleMarker` | none | `.example` "Example" | Allowed only in Learn and on the landing page's partner code sample until §7 ships (§6.1). Never on a record's data. |

**Mark exclusivity (enforced in review and by a lint test):**

- Green (`--ok`, `.rv--approved`) means "approved by a pharmacist" and nothing else.
- The hatch (`NoDataBlock`, `NoDataChip`) means "no interaction data" (coverage `none`) and nothing else. Pairs not checked for any other reason are plain, unhatched text.
- Square chips mean severity. Rounded pills mean review status.
- Translucent material (`.material`, `.decision-bar`) is used only on the toolbar, the sidebar and the decision bar.

### 3.5 Content and voice rules

These are copied from Board DS. Every PR that adds copy is checked against them.

- **Say what the action does, and keep the name through the flow.** "Looks correct" becomes "Marked correct". "Report issue" becomes "Issue reported".
- **Say what was and wasn't saved.** Never write a bare "Something went wrong".
- **Name the role's consequence.** Pharmacist: "publishes this record". Engineer: "records your check. It does not publish."
- **Use DDInter's words for clinical text.** Truncate and link to the full text. Never summarise.
- **Show ids in mono and words in Onest.** For example `BDS-000003`, `BDC-000003`, `DAR 185-0138-012`.
- **Dates follow Bangladesh conventions.** "11/10/2026 21:27 UTC", "12/10/2026 03:27 Dhaka" (reviewer surfaces), "12/10/2026 03:28 Dhaka time" (public surfaces).
  - Formatters: `fmtUtc(iso)`, `fmtDhaka(iso)`, `fmtDhakaTime(iso)`, `fmtDhakaOn(iso)`. The last one gives "on 14/10/2026, 11:20 Dhaka time".
  - All four use `Intl.DateTimeFormat` with `timeZone` set to `UTC` or `Asia/Dhaka`, and assemble `DD/MM/YYYY HH:mm` by hand.
- **No hedging and no apology.** State what happened and the one action that fixes it.
- **Em dash.** The only em dash in the product is in the stale-page title. Ranges and "drug–drug" use an en dash.

### 3.6 Fixed safety strings (verbatim, in `$WEB/lib/copy.ts`; a test pins each one)

| Constant | Exact string | Rule |
|---|---|---|
| `NO_DATA_SENTENCE` | `No interaction data in DDInter for this substance. This does not mean it is safe to combine.` | Shown in a hatch block. Never green, never collapsed. Pairs with the substance are "not checked". |
| `NOT_REVIEWED` | `Not yet reviewed by a pharmacist` | Shown wherever a non-reviewer sees an unapproved record. Engineer checks do not change it. |
| `APPROVED` | `Approved by a pharmacist` | The only use of green. |
| `BACK_IN_REVIEW` | `Back in review` | |
| `ENGINEER_CHECKED` | `Engineer checked` | Reviewer views only. |
| `ISSUE_REPORTED` | `Issue reported` | Reviewer views only. |
| `SEVERITY_NOT_CLASSIFIED` | `Severity not classified by DDInter` | Never "low risk", never merged with Minor. |
| `STALE_TITLE` | `This record changed — reload to review the latest data` | Decisions pause until reload. |
| `FULL_TEXT` | `Full text from DDInter 2.0` | Used whenever DDInter text is truncated. |
| `UNKNOWN_PAIR_LINE` | `DDInter 2.0 lists this pair with action "unknown" and no text. It is not treated as low risk.` | Pair cards with severity `unknown` and no text; Learn chapter 6 "Not given" (§1.6 item 12). |
| `UNKNOWN_PAIRS_LINE` | `DDInter 2.0 lists these pairs with action "unknown" and no text. They are not treated as low risk.` | The plural form, from Board P: the product page's unclassified panel (§6.5). |
| `NO_MANAGEMENT` | `DDInter 2.0 gives no management text for this pair.` | Replaces the current `NO_MANAGEMENT_TEXT`. |
| `NO_TEXT` | `DDInter 2.0 has no interaction or management text for this pair.` | Replaces the current `NO_INTERACTION_TEXT` (reviewer pair cards and lists). |
| `DECISION_SUPPORT` | `IntelliDrugs is decision support. It is not a substitute for clinical judgement. Severity levels and management text come from DDInter 2.0 and are shown truncated, never rewritten.` | Checker footer. |
| `PROMISE_PHARMACIST` | `**You're reviewing as a pharmacist.** "Looks correct" publishes this record after an {n}-second undo window.` | Decision bar. `{n}` is the reviewer's undo window (§5.8.1), 8 by default, which gives Board R's wording exactly. |
| `PROMISE_ENGINEER` | `**You're reviewing as an engineer.** "Looks correct" records your check. It does not publish; a pharmacist still needs to approve.` | Decision bar. |
| `PROMISE_PAUSED` | `**Decisions are paused.** This record changed after you opened it. Reload it to review the latest data.` | Decision bar. |
| `NO_PHI_HELP` | `Don't include patient names or other personal health details.` | Help text on every free-text field: the reviewer note (§5.10), "Report a problem" (§6.5) and "What you will build" (§6.9). New copy (§1.7). |
| `NOT_RUN` | `Not checked yet: DDInter mapping has not run` | Coverage `not_run` (§7.3). From Board L. Never paired with `NO_DATA_SENTENCE`. |

(`**…**` marks the `<b>` lead sentence.) The **safety sentences** that the copy test guards against paraphrase are `NO_DATA_SENTENCE`, `NOT_REVIEWED`, `SEVERITY_NOT_CLASSIFIED`, `UNKNOWN_PAIR_LINE` (with its plural `UNKNOWN_PAIRS_LINE`) and `NOT_RUN`. Each is rendered from its constant, never retyped; a shorter form appears only where this spec names it (the compact reviewer pill, §3.4, and the `NoDataChip` labels of §3.4, used only on a page that also shows `NO_DATA_SENTENCE` for the same substance). DDInter placeholder text ("None", "-", "n/a", and so on) is never printed. `$WEB/lib/ddinter-text.ts` stays.

---

## 4. Rendering model

### 4.1 Principle

Every route is an async server component with `dynamic = "force-dynamic"`. Data is fetched on the server from the internal API. The browser receives HTML and the React Server Components payload for what the page shows, and nothing else.

- Navigation between records, filters, checker selections and search pages is ordinary Next navigation (`<Link>`, `router.push`, GET forms). Each one renders on the server.
- Interactivity that the boards need but SSR cannot provide lives in the islands below, and only there.

### 4.2 Client islands (the complete allowlist)

A build check, `scripts/check-client-islands.mjs` (run in `postbuild` next to the bundle scan), lists every file with `"use client"`. It fails if a file is missing from this table, or if a file in the table imports `@/lib/api`, `@/lib/session` or any other `server-only` module.

| Island | File | Why it must run on the client | What it receives (props) |
|---|---|---|---|
| ThemeSwitch | `components/ThemeSwitch.tsx` | Instant theme change | current value |
| SignInButton | `app/signin/SignInButton.tsx` (existing, extended) | Firebase popup or redirect, and the Turnstile token | Firebase public config, Turnstile site key, `returnTo`, `siteOrigin` (§6.2) |
| TurnstileField | `components/TurnstileField.tsx` | Explicit Turnstile render, reset and status; puts the token into its enclosing form | site key, `action` name |
| ReviewDesk | `components/review/ReviewDesk.tsx` plus `components/review/desk/*` | Keyboard model, commit-delayed approval window, toast, drafts, drawer and sheet, live region, stale polling, Turnstile for decisions | Batch-level props only, from `app/review/[batchId]/layout.tsx`: role, batch id, counts, and the desk settings (undo window, single-key shortcuts; §5.8.1, §5.14). A layout receives neither `searchParams` nor the child `[conceptId]` param and is not re-rendered when only the query changes, so record-level data comes from the record page (below). No source JSON and no clinical text in props. |
| DeskRecordContext | `components/review/desk/DeskRecordContext.tsx` (rendered by `app/review/[batchId]/[conceptId]/page.tsx`) | Hands record-level data to the persistent ReviewDesk through React context: a registration call on mount and on every new props | the visible row order (`conceptId`, trade name, display status, version), the open record's decision context (§5.9) and its `version`. It wraps the server-rendered detail pane as `children` and renders them, or, while the open record is stale, the subtree it holds for `viewedVersion` (§5.11). |
| CheckerCombobox | `components/check/CheckerCombobox.tsx` | ARIA 1.2 combobox with suggestions | the current ids, `max` = 20 |
| Expander | `components/Expander.tsx` | Line clamp toggle | the id of the server-rendered text, and `label: "reviewer" \| "public"`. Reviewer (Board R): "Full text from DDInter 2.0" / "Show less". Public and Learn (Boards P and L): "Show full text" / "Show less". Without JS the text renders unclamped. |
| AccountMenu | `components/AccountMenu.tsx` | Esc and outside-click closing for a `<details>`-based menu | none (works as plain `<details>` without JS) |
| GlossaryFilter | `components/learn/GlossaryFilter.tsx` | Live filter with a debounced count | none (filters the server-rendered list in the DOM) |
| LearnRail | `components/learn/LearnRail.tsx` | Scroll-spy `aria-current` on "On this page" | none |
| ErrorBoundary | `app/error.tsx`, `app/review/error.tsx` | Next requires error boundaries to be client components | none |

### 4.3 What data may reach the browser

- Only what the page renders, plus the props listed above. There is never a bulk JSON endpoint.
- Browser-callable route handlers, each session- or rate-gated:
  - `/check/suggest`: at most 10 rows, `q` of 2 or more characters, approved products' clinical names only;
  - `/review/[batchId]/versions`: `conceptId`, version and display status per current item, reviewers only;
  - `/api/session`.
- `GET /v1/products/loaded` is no longer called by any page. The checker picker uses suggestions.
- `INTERNAL_API_TOKEN`, `SESSION_SECRET` and `TURNSTILE_SECRET_KEY` stay server-only. The existing `check-client-bundle.mjs` scan stays.

### 4.4 Progressive enhancement

| Flow | Without JavaScript | With JavaScript |
|---|---|---|
| Search, product, substance, Learn | Full | Same, plus Expander and the glossary filter |
| Theme | Form POST, then reload | Instant |
| Checker | GET form. "Add a medicine" is a text field with a "Find" submit. The server lists matches as submit buttons (`name="ids"`) inside the same form, with the current ids as hidden inputs. Remove is a submit button per medicine. | Combobox (§6.7.1) |
| Account menu | `<details>`/`<summary>` | Adds Esc and outside click |
| Review: reading records, J/K equivalents (Previous/Next links), filters (GET form), evidence (`<details>` fallback in place of the drawer) | Full | Desk island |
| Review decisions | Not possible: Turnstile needs JavaScript. The decision bar renders `<noscript>`: "Reviewing needs JavaScript for the bot check. You can still read this record." | Desk island |
| Review decisions when our island failed to load but Cloudflare's widget runs | Native form POST to the same server action, **without** `commit=deferred`, using a server-rendered implicit Turnstile widget. The server does not save. It redirects to `?confirm=<conceptId>` with the submitted version, which renders a confirm panel (§5.8.6). Approval needs a second, explicit POST of that same version. Enter on the first form never approves. | n/a |
| Sign-in | `<noscript>` "Sign-in needs JavaScript for Google and the bot check." | Island |

---

## 5. Reviewer workspace

### 5.1 Layout

The source is Board R's `.app`.

- **Toolbar** (`.chrome-toolbar.material`, 52 px), from left to right:
  - `Wordmark` at 17 px with sub "Review";
  - centre: "Batch `0001-pilot`", `ProgressMeter` (160 px), "0 of 10 approved" (tabular), a separator, then "Record 1 of 10", or "Batch approved" in the complete view;
  - right: role badge "Pharmacist" or "Engineer" (`.role-badge`), then the account (initials avatar, name, AccountMenu).
- **Panes**: `grid-template-columns: var(--pane-side) var(--pane-list) minmax(0,1fr)`, which is 232 px, 336 px and the rest.
- **Sidebar** (`.chrome-sidebar.material`):
  - heading "Batches", with one `.filter` per batch: stack icon, mono batch id, item count. The current batch has `aria-current="true"`. Clicking it clears the filter and the search.
  - heading "Show", with filters (§5.3).
  - batch card at the bottom:
    - "**{a} of {n}** approved by a pharmacist";
    - a wide progress meter with `aria-label` "{a} approved, {i} with an issue, {needs} need review";
    - a `dl`: Approved, Issue reported, Needs review;
    - "Batch status: **In review**" or "**Approved**";
    - "Approved when all {n} records are approved by a pharmacist.";
    - "Run {fmtUtc(runAt)}".
- **List pane**:
  - header "**0001-pilot**", with "{n} records, by DAR number" or "{v} of {n} records";
  - search field: label (sr-only) "Filter records by name, substance or DAR number", placeholder "Filter by name, substance or DAR";
  - the record list (§5.4).
- **Detail pane**: a scroll region `tabindex="-1"` containing the sections of §5.5–§5.6, the evidence drawer (absolute, 460 px), and the sticky decision bar (§5.7). The toast sits bottom-left over the list pane (`left: 244px; bottom: 16px; width: 312px`).
- **Responsive (Decision):**
  - **1280 px and wider**: three panes as above.
  - **1024–1279 px**: the sidebar collapses into a "Batches and filters" disclosure at the top of the list pane, leaving two panes.
  - **Below 1024 px**: one column. The list is shown on `/review/[batchId]`. A record shows a "Back to list" link (Kbd none) above the crumb. The decision bar stays sticky at the bottom.
  - **320 CSS px** (WCAG 1.4.10; 1280 px at 400% zoom): no horizontal page scroll. Comparison tables scroll inside `.cmp-wrap`.
  - **Viewport under 480 CSS px tall** (for example 1280×800 at 400% zoom, which is 320×200): the toolbar and the decision bar are not sticky, and the key row is hidden, so they never cover the focused element (WCAG 2.4.11).
- The scroll region sets `scroll-padding-bottom` to the decision bar's height (0 when the bar is not sticky), so a focused element is never hidden behind it (WCAG 2.4.11).

### 5.2 Display statuses (computed by the API; see §7.3)

`displayStatus` is one of these values, in this order of precedence:

1. `issue`: the item's `review = 'issue'` and the counted decisions contain an `issue` (a reviewer's report). The pipeline also sets `review = 'issue'`, with the note "not found at source" or "not a registered Drug product", for an item it could not load (`$ETL/load/batches.py`). Such an item has no counted `issue` decision, so it is not `issue`: it falls through to `pending`, and its failed `dgda` stage shows in the checks, the "Warnings" filter and the promise ("A check failed on this record…"). An `ok` on it is refused at step 5 (`stages`), which runs before step 6 (§7.2).
2. `approved`: `review = 'ok'`.
3. `engineer_checked`: `review = 'pending'`, and the counted decisions (`decidedAt > extractedAt`) contain an engineer `ok` with no `issue` after it.
4. `back_in_review`: `review = 'pending'`, there are no counted decisions, and `ApprovalRule.review(decisionsAtOrBefore(extractedAt), null)` = `ok`. In other words, the record was approved before its latest extraction.
5. `pending`: everything else, including an issue fixed and re-run. Per the gate table in Board L chapter 4, "Issue reported → re-run" returns to "Not yet reviewed by a pharmacist".

Header chips: the pill for the status, plus a second `pending` pill ("Not yet reviewed by a pharmacist") when the status is `engineer_checked`, `issue` or `back_in_review`. Beside the chips, `.d-vis` reads "Published. Readers can see this record." for `approved`, and "Hidden from readers until a pharmacist approves it." otherwise.

### 5.3 Filters, search and empty states

| Key | Label | Icon | Members | Empty copy |
|---|---|---|---|---|
| `all` | All records | stack | every current (not removed) item | n/a |
| `needs` | Needs review | clock | `pending`, `back_in_review`, `engineer_checked` | "No records need review." |
| `warn` | Warnings | warn | any stage status other than `ok` | "No records have a check warning." |
| `issue` | Issue reported | flag | `issue` | "No records with an issue reported." |
| `approved` | Approved | seal | `approved` | "No records are approved yet." |
| `nodata` | No DDInter data | void square (`.nd-ico`) | any ingredient with `coverage = none` | "No records without DDInter data." |

- Counts show on every filter (`.filter-n`, tabular).
- The search matches trade name, clinical display name, generic content, DAR number, company, ingredient names and BDS ids, as a case-insensitive substring. No match: `No records match “{q}”.`
- Every empty state has one button: "Show all {n} records". It clears the filter and the search and focuses the list.
- State lives in the URL (`?show=&q=`). The island debounces the search field by 250 ms and calls `router.replace`.
- If the open record leaves the view, the first visible record opens, and any open note draft is stashed (§5.10).

### 5.4 Record list and triage hints

- **Markup.** The server renders `<ul>` of `<a href="/review/{b}/{c}?show=&q=">` rows, so the list works without JavaScript. The island upgrades it to `role="listbox"` (`aria-label="Records in {batchId}"`, `tabindex="0"`, `aria-activedescendant`) with `role="option"` rows and `aria-selected`. On upgrade, the island removes each row link from the tab order and the accessibility tree as a control: the `<a>` gets `tabindex="-1"` and `role="presentation"`, and activation (click, Enter, Space) is handled on the option, which navigates to the link's `href`. There are no nested interactive elements inside an option.
- **Row layout** (`.rec`): index (1-based, by DAR number), trade name, compact status pill, clinical display name, and a hint line.
- **Hint.** The first rule that applies wins:

| Order | Condition | Hint (class) |
|---|---|---|
| 1 | The last commit for this record was refused before saving (`netErr`, `saved: "no"`) | "Decision not saved" (`rec-hint--warn`) |
| 1b | The last commit for this record is unconfirmed (`netErr`, `saved: "unknown"`) | "Decision not confirmed" (`rec-hint--warn`) |
| 2 | The open record is stale (§5.11) | "Changed since you opened it" (`--warn`) |
| 3 | Any ingredient has coverage `none` | "No DDInter data" (`--nodata`) |
| 3b | Any ingredient has coverage `not_run` | "DDInter not run yet" (`--warn`) |
| 4 | f > 0 failed stages | "{f} check failed" or "{f} checks failed" (`--warn`) |
| 5 | w > 0 warning stages | "{w} check warning[s]", plus ", {p} pair[s] without text" when the DDInter stage lists p > 0 text-missing pairs (`--warn`) |
| 6 | otherwise | "All checks OK" |

- **Keys inside the listbox:** ArrowDown and ArrowUp move (like J and K); Home and End jump to the first and last visible record.
- Clicking a row selects it and focuses the listbox (Board R).
- Moving selection navigates (`router.push`, `scroll: false`). The island prefetches the previous and next records.
- The selected row is scrolled into view with `block: "nearest"`.

### 5.5 Detail: header, comparison table, automated checks

#### 5.5.1 Header

- Crumb: "`0001-pilot`, record 8 of 10".
- `<h1>`: trade name (Title 1 type).
- Meta: "{company}, `DAR {dar}`, {dosage form}".
- Chips (§5.2).
- Tools, right-aligned:
  - row 1: "Evidence `E`" (`aria-expanded`, `aria-controls="drawer"`, `aria-keyshortcuts="E"`) and "DGDA source `S`";
  - row 2: "Previous `K`" and "Next `J`".
- Without JavaScript, Previous and Next are links, and "DGDA source" is an `<a target="_blank" rel="noopener noreferrer">`.

#### 5.5.2 "DGDA source against the extraction"

The section subtitle reads "Each relation compares the two values on its row. Fields copied from the register have no verdict."

- The table is a real `<table class="cmp">` with a `.sr-only` caption "{trade name}: DGDA register compared with the pipeline extraction".
- Columns: "Field", "DGDA source" (`.cmp-src`), "Relation", "Extracted by the pipeline".
- Row headers are `<th scope="row">`.
- Relations are computed on the server by the pure functions in `$WEB/lib/relations.ts`. The inputs are the API's `ReviewItem` (§7.3). The rules are copied from Board R's `nameRel`, `strRel` and `hasStrength`:

| Row (repeat per ingredient when there are several, numbered " 1", " 2") | Source cell | Relation rule | Extracted cell |
|---|---|---|---|
| Trade name | trade name | "Copied from the register" (`.cmp-copy`, no verdict) | trade name, plus mono concept id |
| Company | company | "Copied from the register" | company |
| Dosage form | `brand.dosageForm` | Equal: **Matches**. Equal ignoring case: **Matches**, sub "Capitalisation only". Otherwise: **Differs**. | `clinicalDrug.doseForm` |
| Generic content | `.raw` generic content | Every ingredient's `rawName` occurs in the raw text (ignoring case) and `hasStrength(raw, ingredient)` is true: **Matches**, sub "Ingredient and strength found" or, for several ingredients, "Both ingredients and strengths found". Otherwise: **Differs**. | one line per ingredient, "{name} {strengthText}", plus sub "{k} ingredient[s] parsed" |
| Substance n | `.raw` ingredient raw text (combination products add sub "Parser's part of the DGDA text") | `rawName = raw` with the trailing `\s+\d.*$` stripped. `rawName === name`: **Matches**. Equal ignoring case: **Matches**, sub "Capitalisation only". `lower(rawName)` starts with `lower(name)+" "`: **Salt removed**, sub "Removed: {rest}". `lower(rawName)` is among the ingredient's `dgda_content` names: **Normalised**, sub "{rawName} kept as the DGDA name". Otherwise: **Differs**. | name, plus mono BDS id |
| Strength n | same source | `hasStrength` false: **Differs**. Has a `per` value: **Normalised**, sub "Written as {strengthText}". Otherwise: **Matches**. | `strengthText` = "{value} {unit}[ per {perValue} {perUnit}]" |
| DGDA ingredient code (one row per DGDA XM ingredient) | mono XM code, plus sub DGDA name | Some ingredient carries `ICD11_XM` = XM: **Matches**. Otherwise: **Differs**, sub "No substance carries this code". | mono BDS id and name, plus `.cmp-names` "Names: {name} ({ICD-11\|RxNorm\|DGDA\|DDInter}), …"; or "No matching substance" |
| Clinical drug | "Not in the register" | **Added** | display name, plus sub "`{bdcId}`, route {route}, dose form {doseForm}" |
| Codes n | "Not in the register" | **Added**, sub "{k} codes for {name}" | every non-DDInter `CodeChip` with its meta |
| DDInter mapping n | "Not in the register" | **Added** | coverage `none`: `NoDataChip("No data")` plus `NO_DATA_SENTENCE` in a `.cmp-sub`. Otherwise: DDInter `CodeChip`s (meta "method, conf, route") plus sub "Interaction data found". When a chosen entry exists, append "Checked against `{id}` ({route})", with ", route assumed" when assumed. |

`hasStrength(src, g)`:

```
base = `${value} ${unit}`
if perValue: base += "/" + (perValue === 1 ? "" : `${perValue} `) + perUnit
match = new RegExp(`(^|[^\\d.])${escapeRegExp(base)}(?![\\d])`, "i").test(src)
```

Numbers are rendered without trailing zeros, as the API's `plain()` does.

#### 5.5.3 "Automated checks"

- Subtitle: "{ok} OK, {w} warning[s], {f} failed. Pipeline run {fmtUtc(runAt)}". Zero parts are omitted.
- Stage order and names:

| Key | Name |
|---|---|
| `dgda` | DGDA load |
| `substances` | Substances |
| `clinical` | Clinical drug |
| `ddinter` | DDInter |

- **Quiet OK stages.** OK stages with an empty note (except DDInter when the record has no data) merge into one `StageCheck` named by joining their names with ", " (for example "DGDA load, Substances, Clinical drug") with status "OK".
- **DDInter stage with no-data coverage**: the note is `NO_DATA_SENTENCE`.
- **DDInter stage with text-missing pairs** (from the API's structured `textMissing`, §7.3; never a regex on the note):
  - note "DDInter text not found for {n} pair[s] with other medicines in this batch.";
  - toggle button, open by default, `aria-expanded`/`aria-controls`: "Hide the pair" / "Show the pair" when n = 1, otherwise "Hide the {n} pairs" / "Show the {n} pairs";
  - a list of `.stage-pair` items: "{nameA} + {nameB} `{ddinterA}/{ddinterB}`" plus a `Severity` chip when the severity is known. Order follows the note (text order of the ids).
- **Other structured notes** (`name_only`, `route_assumed`, `no_route_entry`, `other`) are listed as separate `.stage-note` lines with the pipeline's text verbatim.
- **Fail notes** are shown whole, never split.
- An OK stage that has a note shows the note. The text "No pipeline note." is used only on public product pages (§6.5).

### 5.6 Detail: interactions, no data, evidence, history

#### 5.6.1 Per ingredient (`.ing` block)

- Header: name as `<h3>`, mono BDS id, strength text.
- **No data**: a `NoDataBlock` with:
  - title: the substance name;
  - text: `NO_DATA_SENTENCE`;
  - second line: "Drug, disease and food interactions: no data in DDInter 2.0.";
  - pairs: "Not checked, {k} pairs with this batch:" plus chips "{substance} + {other}".
- **Data found** (route-aware, **Decision**; replaces Board R's line, §1.6 item 10):
  - "Interaction data found for this product's route ({route}): `{chosen ids with route}`", plus ", route assumed" when assumed. When the product has no route: "Interaction data found: `{chosen ids with route}`, route assumed";
  - `Severity` chips with counts for the chosen entries, Major, Moderate, Minor and unclassified (group `aria-label` "Drug pairs in DDInter 2.0 by severity");
  - "{total} drug pairs in total. {d} drug and disease interaction[s], {f} drug and food interaction[s]." (counts for the chosen entries);
  - when the substance has more entries than the chosen ones, add "All DDInter entries for {name}: `DDInter351` (systemic), `DDInter352` (ophthalmic), `DDInter353` (otic), {total} drug pairs." For the eye drop this shows 112 for the chosen entry and 654 for all entries.
- **The substance has entries but none fits the route** (`no_route_entry`): "No DDInter entry for this product's route ({route}). Its pairs are not checked." When the product has no route: "No DDInter entry fits this product, which has no route on record. Its pairs are not checked." The pairs are listed as not checked, with reason `no_route`, as plain text, never the hatch.
- **DDInter mapping has not run** (coverage `not_run`): `NOT_RUN` as plain text, never the hatch block and never `NO_DATA_SENTENCE`. Its pairs are listed as not checked, with reason `not_run`. Approval is refused until the DDInter stage has run (§7.2).

#### 5.6.2 "With the other medicines in this batch"

The API's `batchPairs` are computed with RouteRule for this record and for each partner record. Shown only when the record has data.

- Summary: "{p} pair[s] found in DDInter 2.0." plus " {nc} pair[s] not checked." when nc > 0 (nc counts every not-checked reason except `same_product`, as in §6.7.2 rule 5). Then a group of severity chips with counts (`aria-label` "Batch pairs by severity").
- For each ingredient that has data but no batch pair: "None of the {N} batch pairs from DDInter 2.0 involve {name}." (N = `totalBatchPairs`).
- **Pairs with text**: `PairCard`s, ordered by severity rank (Major, Moderate, Minor, unknown), then by partner name.
  - Head: chip, plus `<h4>` "{this substance} + {partner substance}".
  - Meta: "With {partner trade name} (record {k})[, …]. Action in DDInter: {actions}. `{idA}/{idB}`".
  - Text: management if present, otherwise the interaction description, clamped to 3 lines.
  - Footer: "Management, truncated." or "Interaction description, truncated." (when open: "…, in full."). The interaction variant appends " DDInter has no management text for this pair." The footer ends with the Expander button "Full text from DDInter 2.0" / "Show less".
- **Pairs without text**: one `.ntx` block, "{k} pair[s] with no text in DDInter 2.0", grouped by severity chip with count. Each item: "**{a} + {b}** with {trade name} (record {k}) `{idA}/{idB}`". Closing line: "Action in DDInter: {actions}. DDInter 2.0 has no interaction or management text for {this pair|these pairs}.", plus " A pair whose severity is not classified by DDInter is never treated as low risk." when an unknown pair is present.
- **Not checked, no data** (reason `no_data`): `.nc` block, "**Not checked.** {names}: " + `NO_DATA_SENTENCE`, plus `NoDataChip`s "{a} + {b}".
- **Not checked, other reasons** (`not_run`, `no_route`, `unmapped`): plain text, one line per pair, using the §6.7.3 item 4 wording, where {brand} is the trade name of the record whose substance the reason applies to (this record or the partner). No hatch, no `NoDataChip`.
- **Same-product pairs** (combination products): "Not checked: {a} + {b} are ingredients of this product." (reason `same_product`).

#### 5.6.3 Evidence drawer (E)

- Title "Evidence". Sub "{trade name}, record {k} of {n}". Close button "Close `Esc`".
- Contents:
  1. "Raw brand row", with note "The DGDA register fields with the pipeline's parse fields, exactly as stored.", and `<pre>` of the brand JSON.
  2. "DGDA ingredient codes", `<pre>`.
  3. "Raw DGDA record": `<details>` with `<pre>` of `sourceJson` (**Decision**: kept from the current batch page, collapsed).
  4. "Pipeline notes": a `dl` per stage, with the status word and the note in `.raw`, or "No note".
  5. "Pipeline": a `dl`:
     - Concept id (mono);
     - Clinical signature (mono);
     - Extracted at: `fmtUtc` plus `fmtDhaka`;
     - Batch run: `fmtUtc`, plus "{batchId}, {n} items".
- Opening the drawer:
  - makes the detail scroll region `inert`;
  - moves focus to Close;
  - announces "Evidence shown for {name}. The record behind it is paused until you close it."
- Closing it (Esc, Close or E) returns focus to the element that opened it, or else to the Evidence button.
- The drawer content is rendered by the server in a `hidden` aside. The island only toggles it.

#### 5.6.4 Chosen DDInter entry statement

Every record whose clinical drug route is not `systemic`, or whose entry was assumed, shows a line under the section title "Interactions" (subtitle "From DDInter 2.0, by substance"):

- Exact entry: "{substance} is checked against `{id}` {DDInter name} ({route})." For the eye drop: "Chloramphenicol is checked against `DDInter352` Chloramphenicol (ophthalmic)."
- Assumed: "Route assumed: this product's route is {route} and DDInter has no {route} entry for {substance}, so the systemic entry `{id}` is used."
- Assumed because the product has no route (no clinical drug, or a clinical drug with no route): "Route assumed: this product has no route on record, so the systemic entry `{id}` is used."

#### 5.6.5 History ("History", subtitle "Oldest first")

- An `<ol class="hist">`. The time column shows `fmtUtc` on the first line and `fmtDhaka` on the second.
- Entries come from the API timeline (§7.3):

| Kind | Text |
|---|---|
| `run` (full run) | "Batch {batchId} run started" |
| `extract` (first) | "Pipeline extracted this record" |
| `extract` (later) | "Pipeline re-ran this record"; when `reason = shared_change`: "Shared substance data for this record changed" |
| `decision` ok, pharmacist | "Approved by a pharmacist. Published." / "Approved by a pharmacist (you). Published." |
| `decision` ok, engineer | "Engineer checked. Not published." / "Engineer checked (you). Not published." |
| `decision` issue | "Issue reported by a pharmacist. Note:" / "Issue reported by an engineer. Note:" / "Issue reported (you). Note:", followed by the note in `.raw` |

- **One `extract` entry per pipeline run.** Every stage of a run stamps the item (§8.1), so one full run writes up to four snapshots. The API collapses the snapshots that share a `run_id` (§7.6) into one `extract` entry at the last stamp of that run. Its reason is `run` when the group holds the item's first snapshot, `shared_change` when every snapshot in the group is `shared_change`, and `rerun` otherwise.
- A decision that no longer counts (made at or before the current `extractedAt`) gets the suffix " No longer counts: the record was re-run after it." (**Decision**).
- Emails are never shown. "(you)" comes from the API's `mine` flag.

### 5.7 Decision bar

`.decision-bar` (material, sticky bottom, `data-state="ready|paused"`), top to bottom:

1. **Network banner** (`.banner--crit`, hidden unless the open record has a failed commit). Two variants, chosen by what the response proves (§5.8.2):
   - **Not saved** (`saved: "no"`: the request was refused before anything could be saved, that is, a 429 from the rate limiter or the action's `rate_limited` outcome), Board R's copy:
     - title "Couldn't save your decision.";
     - body "Nothing was published. Check your connection and try again. Decision: Looks correct on {name}.";
   - **Unconfirmed** (`saved: "unknown"`: timeout, network error after the request was sent, or 5xx), new copy (§1.7):
     - title "Couldn't confirm your decision.";
     - body "We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice. Decision: Looks correct on {name}.";
   - action in both: "Try again" (tonal sm, busy label "Saving"). Try again resends the same `requestId` and version, so the API either saves once or reports the earlier save (§7.2).
2. **Report panel** (`.bar-report`, hidden unless open), §5.10.
3. **Signed-out block** (hidden unless the server reported `unauthenticated`), new copy (§1.7): info icon; "Your sign-in expired. Your decision on {name} was not saved."; link "Sign in again" to `/signin?returnTo={current path}`. It replaces `decision-main` and the key row. Any note draft is kept in `sessionStorage` until sign-out (§5.10).
4. **No-auth block** (hidden unless the server reported `forbidden`):
   - info icon;
   - "Your account can't review this batch.";
   - "Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account. You can still read this record."
   - It replaces `decision-main` and the key row.
5. **`decision-main`**:
   - the promise (`aria-live` off; changes are announced through the live region only when this spec says so);
   - actions:
     - `BotCheck`;
     - "Report issue `R`" (tonal, `aria-expanded`, `aria-controls`, `aria-keyshortcuts="R"`);
     - "Looks correct `A`" (primary, `aria-keyshortcuts="A"`).
6. **Bot row** (hidden unless a bot hold is active, and always hidden while the no-auth or signed-out block shows):
   - `.field-error` "We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.";
   - "Retry check" (busy label "Checking").
   - When Try again (item 1) or Retry check succeeds, focus moves to "Looks correct" if the committed record is the open one, otherwise to the workspace region (Board R).
7. **Hint** `.decision-hint`. Hidden by default. Each hint shows for 5000 ms and is also announced.
8. **Key row** (`aria-hidden="true"`): "`J` `K` next, previous · `A` looks correct · `U` undo · `R` report · `E` evidence · `S` DGDA source · `?` all keys". Hidden when single-key shortcuts are off (§5.14) or the viewport is under 480 px tall (§5.1).

**Promise text by state** (the first match wins):

| State | Promise |
|---|---|
| loading | "**Loading batch {id}.** Decisions open when the record loads." |
| complete view | "**Batch {id} is approved.** Open any record to read it." |
| stale | `PROMISE_PAUSED` |
| failed commit on this record, not saved | "**Your decision was not saved.** Use Try again above." |
| failed commit on this record, unconfirmed | "**Your decision may not have been saved.** Use Try again above to find out." |
| open undo window on this record | pharmacist: "**Marked correct.** Publishes when the undo window closes. Press U to undo."; engineer: "**Marked correct.** Your check saves when the undo window closes. Press U to undo." |
| saving on this record (`committing`) | pharmacist: "**Marked correct.** Publishing now."; engineer: "**Marked correct.** Saving your check now." |
| a stage failed or did not run | "**A check failed on this record.** It returns to review after the fix and re-run." |
| `approved` | "**Approved by a pharmacist.** This record is public." |
| `issue` | "**An issue is open on this record.** It returns to review after the fix and re-run." |
| engineer viewing `engineer_checked` | "**Your check is recorded.** A pharmacist still needs to approve." |
| otherwise | `PROMISE_PHARMACIST` or `PROMISE_ENGINEER` |

**"Looks correct" is `aria-disabled="true"`** (it stays focusable; pressing it shows the hint) when:

- the record is not open, or the page is loading;
- the record is stale;
- an undo window is open on this record;
- a failed commit is pending on this record;
- the status is `approved` or `issue`;
- any stage has status `fail`, or one of the four stages has no result (the API refuses it too, §7.2);
- the report panel is open;
- the evidence drawer is open;
- the role is engineer and the status is `engineer_checked`;
- the account is not authorised, or the session has expired.

**"Report issue" is `aria-disabled`** when the record is not open, is stale, or the evidence drawer is open. Report stays available on `approved` and `issue` records. A report on an approved record withdraws it from public view, and the API allows it.

### 5.8 The commit-delayed approval (8-second default window)

#### 5.8.1 Rules

- `COMMIT_MS = 8000`, read from `--dur-commit`, is the **default** undo window.
- **Undo window setting (Decision; WCAG 2.2.1).** Each reviewer can lengthen the window with the "Undo window" `Segmented` control ("8 seconds", "20 seconds", "60 seconds"; 8 is the default) in the shortcuts sheet (§5.14) under the heading "Settings". It is stored in the cookie `intellidrugs-undo` = `8` | `20` | `60` (Max-Age 1 year, `SameSite=Lax`, `Path=/`, `Secure` in production, not httpOnly; any other value reads as `8`). The server reads it to render the promise (`PROMISE_PHARMACIST`), and the island uses it for the deadline and for every "{n} seconds" string in §5.8.4. `n` below is this value. A unit test pins all three values and the fallback.
- The decision is held **in the browser**. The server receives it only when the window closes, through the `decide` server action. `decided_at` is therefore the time of commit.
- **One window at a time.** A second A on another record never cuts the open window short. It shows the hint "{name} is still in its undo window. Press U to undo it, or wait until it saves."
- **Navigation inside the batch** (J, K, list clicks, filters, Reload record) does not cancel the window. The desk island lives in `app/review/[batchId]/layout.tsx` and persists across record pages. The window always commits for its own record.
- **Who renders what (Decision).** A Next layout receives no `searchParams` and no child params, and is not re-rendered when only the query changes. So `app/review/[batchId]/layout.tsx` renders the toolbar, the sidebar's "Batches" list and batch card, and `ReviewDesk` with batch-level props only (§4.2). `app/review/[batchId]/[conceptId]/page.tsx` reads `params` and `searchParams` and renders the sidebar's "Show" filters, the list pane (§5.4), and the detail pane inside `DeskRecordContext`, which registers the visible row order, the open record's decision context and its `version` with the desk (§4.2). The island's state (the window, drafts, `viewedVersion`, held subtrees) lives in ReviewDesk, so it survives every record navigation.
- The countdown uses a deadline on the monotonic clock (`performance.now() + n × 1000`), not a decrementing counter and not `Date.now()`. Wall-clock corrections (NTP, sleep and resume) cannot shorten it, and background-tab timer throttling at most delays the commit, which is safe.
- **The decision carries what the reviewer saw.** On A, the island records the record's `viewedVersion` (§5.11) and a new `requestId` (UUID v4). Both travel with the commit and with every Try again, so a retry can never approve a newer version or save twice (§7.2).

#### 5.8.2 State machine (`$WEB/components/review/desk/commit-machine.ts`, a pure reducer with injected clock and timers)

```
idle
  └─ PRESS_A(record, role) [guards §5.7 pass, Turnstile token held]      → armed{record, role, viewedVersion, requestId, deadline}
  └─ PRESS_A [guards pass, widget still executing, no token yet]         → awaitingToken{record, role}   (BotCheck "Checking")
  └─ PRESS_A [widget error-callback]                                     → botHold{kind:"approve", record}
awaitingToken
  └─ TOKEN                                                               → armed (a full n-second window starts now)
  └─ PRESS_U                                                             → idle                (announce undone)
  └─ WIDGET_ERROR | TOKEN_TIMEOUT(10 s)                                  → botHold{kind:"approve", record}
  └─ STALE | FORBIDDEN | UNAUTHENTICATED | PAGE_UNLOAD                   → as for armed
armed
  └─ PRESS_U                                                             → idle                (announce undone)
  └─ STALE(record)                                                       → idle                (cancelled, §5.11)
  └─ FORBIDDEN                                                           → idle + noAuth       (cancelled)
  └─ UNAUTHENTICATED                                                     → idle + signedOut    (cancelled)
  └─ PAGE_UNLOAD                                                         → discarded           (nothing sent)
  └─ DEADLINE                                                            → committing          (toast drops Undo)
committing
  └─ PRESS_U                                                             → committing + hint "Too late to undo…" (§5.8.4)
  └─ OK(outcome | replayed outcome)                                      → idle + saved + viewedVersion := outcome.version + maybe advance (§5.9)
  └─ CONFLICT(stale_rerun | stale_decision)                              → idle + stale banner ("Your decision was not saved.")
  └─ CONFLICT(issue_open | already_approved | already_checked | removed | stage_failed) → idle + hint (§5.8.4) + refresh
  └─ CAPTCHA                                                             → botHold{kind:"commit", record, role}
  └─ FORBIDDEN                                                           → idle + noAuth
  └─ UNAUTHENTICATED                                                     → idle + signedOut
  └─ RATE_LIMITED (429, or the action's `rate_limited`)                  → netErr{record, role, saved:"no"}
  └─ NETWORK | 5xx | TIMEOUT(10 s)                                       → netErr{record, role, saved:"unknown"}
botHold{kind:"approve"}  └─ RETRY_OK → armed (a new n-second window)   └─ RETRY_FAIL → botHold
botHold{kind:"commit"}   └─ RETRY_OK → committing (same requestId and viewedVersion; no new window: the reviewer already had theirs)
botHold{kind:"report"}   └─ RETRY_OK → send report
netErr                   └─ TRY_AGAIN → committing (fresh Turnstile token, same requestId and viewedVersion, no new window)
```

- **Own saves never make the record stale (Decision).** On OK (including a replayed outcome) for a decision or a report on record X, the island sets X's `viewedVersion` to `Outcome.version` before any later poll or refresh is compared, and refreshes X's detail subtree with it. Without this, the reviewer's own decision would change `lastDecisionId` and the next poll would show the other-reviewer stale banner (after R, after the last approval, or when X is not the open record).
- `UNAUTHENTICATED` is the server action's `unauthenticated` outcome: no session cookie, or an expired or unreadable one (8 h, §9.6). It is distinct from `FORBIDDEN`, which means a valid session whose role cannot review.
- While a record is in `netErr{saved:"unknown"}`, the stale poll (§5.11) does not treat a changed `lastDecisionId` on that record as another reviewer's decision, because it may be the reviewer's own unconfirmed save. Try again resolves it: the API returns the earlier save as `replayed`, or saves it now, or answers 409 if someone else decided. A changed `extractedAt` still makes the record stale.

#### 5.8.3 Page unload, tab close and leaving the desk (Decision)

- While a decision is awaiting its token, armed or committing, or a failed commit is waiting:
  - the island registers `beforeunload` (the browser's native "Leave site?" prompt);
  - and it intercepts in-app link clicks that leave `/review/[batchId]/…`, showing the hint "{name} is still in its undo window. Press U to undo it, or wait until it saves." The link is not followed.
- If the page is unloaded anyway (the reviewer confirms leaving, closes the tab, or the browser crashes), the decision is **discarded**. Nothing is sent: no `sendBeacon`, no keepalive. Discarding is safe; publishing early is not. Nothing reaches the server, so there is no audit event. On return, the record still shows its previous status.
- Switching tabs or minimising does not cancel the window.

#### 5.8.4 Copy

- **Toast** (`.toast.is-running`, linear countdown bar over n × 1000 ms; n = the undo window, §5.8.1):
  - message "**{name}** marked correct.";
  - sub "Publishes in {n} seconds." (pharmacist) or "Your check saves in {n} seconds. It does not publish." (engineer). With the default n = 8 this is Board R's wording;
  - action "Undo `U`".
  - The countdown animation reads `--dur-commit` from `tokens.css` (8000 ms). The toast sets it to the reviewer's window with `style={{"--dur-commit": `${n * 1000}ms`}}`, the second allowed inline custom property (§3.1).
  - The toast never takes focus. When it closes while focus is inside it (on Undo), focus moves to the workspace region (Board R).
  - With reduced motion, the bar stays full and the sub gains the words "Saves in {n} seconds".
  - **On DEADLINE** (state `committing`) the toast drops its Undo action and its bar, and reads "**{name}** saving." until the outcome arrives. Nothing is announced for this change.
- **On open**, one polite announcement: "{name} marked correct. {sub} Press U to undo." Nothing is announced per second.
- **Undo**: the toast closes. Announce "Undone. {name} was not saved."
- **Hints.** For A, the first matching row wins, in this order (Board R's `approve()` order, extended): not authorised, session expired, complete view, evidence drawer open, stale, window on this record, window on another record, failed commit on this record, failed or missing stage, approved, issue, engineer already checked, report open, post-advance guard (§5.9), bot hold. While the page is loading, A does nothing and shows no hint. For R and for Send report, the same order applies to the rows that name R or Send.

| Event | Hint |
|---|---|
| U with no window | "Nothing to undo." |
| R on a stale record (panel closed) | "Decisions are paused. Reload the record first." |
| R when not authorised | "Your account can't review this batch." |
| Send report during a bot hold | "Retry the bot check first. Your earlier decision is kept." |
| U while the decision is saving (`committing`) | "Too late to undo: {name} is saving. Use Report issue to withdraw it." |
| A or R while the evidence drawer is open | "Close the evidence first (Esc)." |
| A on a record with a failed stage, or a stage with no result | "A check failed on this record. It returns to review after the fix and re-run." |
| A on the same record during its window | "This record is already in its undo window. Press U to undo." |
| A on `approved` | "This record is already approved by a pharmacist." |
| A on `issue` | "An issue is open on this record. It returns to review after the fix and re-run." |
| Engineer A on `engineer_checked` | "Your check is already recorded for this record." |
| A while the report panel is open | "Send or cancel the report first." |
| A on a stale record | "Decisions are paused. Reload the record first." |
| A with a failed commit on this record | not saved: "Your last decision on this record was not saved. Use Try again."; unconfirmed: "Your last decision on this record is not confirmed yet. Use Try again." |
| A during a bot hold | "Retry the bot check first. Your earlier decision is kept." |
| A when not authorised | "Your account can't review this batch." |
| A when the session has expired | "Your sign-in expired. Sign in again to keep reviewing." |
| A in the complete view | "Every record is approved. Open a record to read it." |
| Enter on "Looks correct" (with or without Ctrl, Cmd or Shift) | "Enter does not approve. Press A, or Space on this button." |
| API 409 `issue_open` at commit | "An issue is open on this record. It returns to review after the fix and re-run." |
| API 409 `already_approved` at commit | "This record is already approved by a pharmacist." |
| API 409 `already_checked` at commit | "Your check is already recorded for this record." |
| API 409 `removed` at commit | "This record was removed from the batch file. Nothing was saved." |
| API 409 `stage_failed` at commit | "A check failed on this record. It returns to review after the fix and re-run. Nothing was saved." |

- **Saved**: "Saved. {name} is approved by a pharmacist and published." (pharmacist) or "Saved. Your check on {name} is recorded. It does not publish." (engineer). Then the advance text (§5.9) follows in the same announcement.
- **Bot failed**: announce "Bot check failed. Your decision is kept. Retry the check to continue." On success: "Bot check passed."
- **Network failed, not saved**: announce "Couldn't save your decision. Nothing was published. Check your connection and try again."
- **Network failed, unconfirmed**: announce "Couldn't confirm your decision. We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice."
- **Session expired**: announce "Your sign-in expired. Your decision on {name} was not saved."
- **Replayed save** (Try again finds the earlier save): the normal **Saved** announcement; nothing says it was a replay.

#### 5.8.5 Turnstile on decisions

- One `TurnstileField` per desk, with `action: "decision"` and `appearance: "interaction-only"`. It renders on mount, `refresh-expired: "auto"`.
- `BotCheck` shows "Checking" until the first token, "Bot check passed" while a token is held, and "Bot check failed" after `error-callback`.
- A token is single-use. After each server verification (pass or fail), the island calls `turnstile.reset()`.
- If the held token is older than 270 s at commit time, the island re-executes and waits for a new token (state stays `committing`, at most 10 s) before sending.
- After a reset (for example right after a report is sent), the widget is re-executing and no token is held. A in that moment goes to `awaitingToken`, not to a bot hold (§5.8.2). Only `error-callback` or 10 s without a token is a bot failure.
- The server verifies with the `action` (must be `decision`) and the `hostname` (must equal the configured site host) from siteverify (§9.2).

#### 5.8.6 Native-POST fallback (island not loaded)

- "Looks correct" is a submit button of a `<form action={decideFormAction}>`. The hidden fields are `batchId`, `conceptId`, `decision=ok`, `extractedAt`, `expectedLastDecisionId` and `requestId` (a UUID the server renders into the form), plus the Turnstile token.
- **Turnstile without our island.** `TurnstileField` is itself an island and did not load either, so each fallback form contains a server-rendered implicit widget, `<div class="cf-turnstile" data-sitekey="…" data-action="decision">`, with Cloudflare's script loaded with the page's nonce. Cloudflare's script adds the `cf-turnstile-response` field to the form, and the action reads that field.
- The island adds `commit=deferred` when it submits after the window.
- Without `commit=deferred`, the action saves nothing. It redirects to `?confirm={conceptId}&x={extractedAt}&d={expectedLastDecisionId}&r={requestId}`, carrying the version that was on the page the reviewer submitted from (`x` is empty for `null`, `d` is empty for `null`). That page renders a `Banner` (info):
  - title "Confirm your decision on {name}.";
  - body "Your browser didn't load the undo window, so nothing is saved until you confirm." (pharmacist adds "Confirming publishes this record."; engineer adds "Confirming records your check. It does not publish.");
  - actions: "Confirm" and "Cancel" (a link back). "Confirm" posts `commit=confirmed` with the **`x`, `d` and `r` values from the URL**, never the current ones, and a fresh token from its own implicit widget.
- If `x` or `d` differs from the record's current version, the confirm page renders the `STALE_TITLE` banner (re-run or other-reviewer body, §5.11) and **no** Confirm button. The API's version guards (§7.2) refuse a stale confirm anyway.

### 5.9 Auto-advance

After a successful commit:

1. If every current item is `approved`: when the committed record is the open one, switch to the **complete view** (§5.12) and close the drawer. Announce "{saved} Every record in batch {id} is approved."
2. Otherwise, if the open record is no longer the committed one, or the report panel is open: do not move. Announce the saved text only.
3. Otherwise, look for the next record that needs review **for this role**:
   - pharmacist: `pending`, `back_in_review` or `engineer_checked`;
   - engineer: `pending` or `back_in_review`.
   - Search the visible order first, starting after the committed record and wrapping. Then search all records by index; if the record found is outside the current filter, clear the filter and the search.
4. If one is found, navigate to it. For 1000 ms after arriving, A on that record shows "Record changed to {name}. Press A again to approve it." and does nothing else. Announce "{saved} Opened {name}, record {k} of {n}."
5. If none is found, stay. Announce "{saved} No other record needs your review."

Focus stays where it was. After navigation, the island restores focus to the element with the same `data-fk` key, or else to the workspace region. It never falls to `<body>`.

### 5.10 Report issue (R)

- R opens the panel and focuses the textarea. If the panel is already open, R focuses the textarea.
- **Field:**
  - label "What's wrong with this record? An engineer reads this note.";
  - placeholder "For example: strength should read Warfarin Sodium 5 mg";
  - `maxlength=1000`;
  - help "5 to 1000 characters." followed by `NO_PHI_HELP` ("Don't include patient names or other personal health details.");
  - counter "{len} / 1000";
  - error "Add at least 5 characters so the engineer knows what to fix." This error sets `aria-invalid` and a red outline. The counter keeps counting. The error clears as soon as the trimmed length reaches 5.
- **Actions:** "Cancel `Esc`" (tonal sm) and "Send report `Ctrl Enter`" (primary sm, busy label "Sending", from Board DS). The key label is "⌘ Enter" on Mac platforms.
- **Esc** inside the field closes the panel and **keeps** the draft. **The Cancel button** closes it and **discards** the draft. In both cases focus returns to "Report issue".
- **Clicking "Report issue" while the panel is open** closes it and keeps the draft; focus stays on the button (Board R). The R key does not close the panel: it focuses the field (above).
- **Drafts** are kept per record, in island memory, mirrored to `sessionStorage` under the key `intellidrugs-draft:{batchId}:{conceptId}`, and cleared on send. Moving to another record stashes the draft. Reopening the panel restores it.
- **Drafts never outlive the session.** Sign-out removes every `intellidrugs-draft:*` key: the AccountMenu's sign-out handler clears them before submitting, and the `POST /signout` response sends `Clear-Site-Data: "storage"` (§2.1), which also covers sign-out without JavaScript.
- **While stale**: Send is `aria-disabled` and shows "Sending is paused until you reload the record. Your note is kept." in `.bar-report-paused`. Pressing it repeats that text as a hint.
- **Sending:**
  - trimmed length below 5: show the error and announce it;
  - otherwise: Turnstile token (bot hold `kind: "report"` if missing), then the `decide` action with `decision=issue` and the note, with no undo window;
  - an open window on the same record is cancelled first.
- **On success:**
  - the status becomes `issue`;
  - the draft is cleared;
  - the panel closes;
  - focus returns to "Report issue";
  - announce "Issue reported for {name}. An engineer will see your note.";
  - no auto-advance.
- **Failure states**: the same as for commits (§5.8.2), with "Couldn't send your report. Nothing was saved. Check your connection and try again." and "Try again".

### 5.11 Stale detection and 409 handling

**The version token the page carries.** Each current item has `version = {extractedAt, lastDecisionId}`:

- `extractedAt` is the ISO instant exactly as the API serialised it, or `null`;
- `lastDecisionId` is the highest `ops.review_decision.id` for the item, or `null`.

**`viewedVersion` (Decision).** The island stores a `viewedVersion` per record: when that record's page first renders, when Reload record is pressed, and when the reviewer's own decision or report on it is saved (§5.8.2). Nothing else updates it; a refresh never does. Decisions always send `viewedVersion` (`extractedAt`, `expectedLastDecisionId`; §7.2), never a version taken from later props. The no-JavaScript path carries the version through the form and the confirm URL instead (§5.8.6).

**Proactive check:**

- Every 20 s while `document.visibilityState === "visible"`, on `visibilitychange` to visible, and immediately before an armed window starts committing, the island calls `GET /review/{batchId}/versions`.
- If the **open record's** version differs from `viewedVersion`:
  - `extractedAt` changed: re-run copy;
  - only `lastDecisionId` changed: other-reviewer copy (except while the record has an unconfirmed commit, §5.8.2).
  - The island then sets stale, cancels an open window on that record (adding "Your decision was not saved." to the announcement), and pauses the bar.
- If other rows changed, the island calls `router.refresh()` to update their statuses. There is no announcement.
- **Refresh never swaps the open record silently.** The detail pane reaches the island through `DeskRecordContext` (§4.2, §5.8.1). After any refresh, if the refreshed props carry a version for the open record that differs from `viewedVersion`, the island enters stale (re-run or other-reviewer copy, as above) and keeps rendering the detail subtree it received for `viewedVersion` (held in island state) until Reload record. The reviewer never sees, and can never approve, content they were not shown as current.
- **A 429 on a versions call** does not change the 20 s poll and does not block a commit. Before a commit, the server's version guards decide (§7.2).

**Stale banner** (`.banner--warn`, top of the detail pane):

- title `STALE_TITLE`;
- body (re-run): "The pipeline re-ran {name} after you opened it. Decisions are paused and nothing was saved. Any note you were writing is kept.";
- body (other reviewer): "Another reviewer decided on {name} after you opened it. Decisions are paused and nothing was saved. Any note you were writing is kept.";
- actions:
  - "See what changed" / "Hide changes" (tonal sm, `aria-expanded`). Shown only for the re-run case, and only when the API reports a snapshot for the page's `extractedAt` (§7.3 diff).
  - "Reload record" (primary sm).
- Announcement: `STALE_TITLE`.

**Diff table:**

- caption "Cells that changed in the re-run";
- columns "Field", "You were reviewing" (`.cmp-src`), "Now" (`.chg`);
- footer "Cells that are not listed did not change."

**Reload record:**

- calls `router.refresh()` for the record;
- sets `viewedVersion` to the refreshed record's version and renders the refreshed detail subtree;
- clears stale;
- keeps the draft;
- announces "Record reloaded. Decisions are available again.";
- focuses the note field if the panel is open, otherwise "Looks correct".

**Back in review card** (`.note-card`, shown when `displayStatus = back_in_review`):

- the `back_in_review` pill;
- text by reason:
  - re-run: "This record was re-run after a pharmacist approved it. Readers see “Not yet reviewed by a pharmacist” until a pharmacist approves it again.";
  - shared change: "Shared substance data for this record changed after a pharmacist approved it. Readers see “Not yet reviewed by a pharmacist” until a pharmacist approves it again.";
- the diff table when one is available.

**409 at commit**, by API `errors[0].field` (§7.2):

| Field | Meaning | UI |
|---|---|---|
| `extractedAt` | stale, re-run | stale (re-run) |
| `lastDecisionId` | another reviewer | stale (other-reviewer copy) |
| `review` | issue open, already approved, already checked | hint |
| `stages` | a stage failed or has no result, or the item has no run stamp | hint (`stage_failed`) |
| `conceptId` | removed from the batch | hint |

### 5.12 Whole-view states

| State | What renders | Exact copy |
|---|---|---|
| Loading (`app/review/[batchId]/loading.tsx` and in-island transitions longer than 300 ms) | 7 skeleton rows (`.sk`, pulse), detail skeleton, decision bar disabled. Reduced motion: no pulse. The list header count reads "Loading". | `role="status"`: "Loading batch {id}". When an in-island transition longer than 300 ms ends, announce "Batch {id} loaded." (never on the first server render). |
| Empty filter or search | see §5.3 | "No records with an issue reported." etc., "Show all {n} records" |
| Batch complete (every current item approved) | `.done` in the record pane, no animation: approved pill, `<h2>` "Batch {id} approved. {n} records are now public.", paragraph, button | "Each record was approved by a pharmacist. If the pipeline re-runs a record, it goes back in review and leaves public view until a pharmacist approves it again." Button: "Open record 1" |
| Not authorised (role `user` on any `/review` route) | Server page, no batch data: info banner, then two buttons | title "Your account can't review this batch."; body "Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account."; then a warn banner "This Google account isn't on the reviewer list." with "You're signed in as {own email}. Reviewer tools need the account your invite was sent to. You can still search and check interactions."; buttons "Use another Google account" (signs out, then opens `/signin?returnTo=/review`) and "Search medicines" |
| Not signed in on `/review` | Redirect 307 to `/signin?returnTo=/review/...` | n/a |
| Role lowered mid-session (the server action returns `forbidden`) | The record stays on screen. The no-auth block replaces the decision bar (§5.7). An open window is cancelled. | announce "Your account can't review this batch. Your decision on {name} was not saved." |
| Session expired mid-session (the server action returns `unauthenticated`) | The record stays on screen. The signed-out block replaces the decision bar (§5.7). An open window is cancelled. The note draft is kept. | announce "Your sign-in expired. Your decision on {name} was not saved." |
| API error loading the batch (`app/review/error.tsx`) | `Banner` crit with "Try again" (`reset()`) | title "Couldn't load batch {id}."; body "Nothing was changed. Check your connection and try again." |
| Batch not found | `notFound()` page | "No batch with the id {id}." with "Open the review desk" |

### 5.13 Role promises and invites

- **Roles** come from `REVIEWERS` (unchanged syntax `email:role,…`, roles `pharmacist` and `engineer`). They are global. **Decision**: no per-batch roles in this release. The copy "for batch {id}" names the newest `in_review` batch.
- **Pharmacist "Looks correct"**: publishes after the window. Engineer: records the check and never publishes.
- **Invites are sent by the team by hand** (**Decision**: no SES automation). The fixed template is:
  - subject "You're invited to review medicines on IntelliDrugs";
  - body "Role: {Pharmacist|Engineer}. Batch {id}, {n} records. Sign in at drugdb.eliooo.org with this Google account."
  - The template lives in `docs/runbooks/reviewer-invite.md`.
- **Adding a reviewer**: append to `REVIEWERS` in the host `.env`, then `cd ~/drugdb/deploy && docker-compose up -d web` (the host has the `docker-compose` binary, and the compose file names the project `bddrug`; §12.4). That restarts only the web container.

### 5.14 Keyboard model

The model is scoped to the workspace region: `id="desk"`, `role="region"`, `tabindex="0"`, `aria-label="IntelliDrugs review workspace. Shortcuts work while focus is inside. Press question mark for the list."`

| Key | Action | Behaviour |
|---|---|---|
| A | Looks correct | §5.8 |
| U | Undo | Cancels the open window |
| R | Report issue | Opens the note field and focuses it, or focuses the open one |
| J / K | Next / previous | Moves within the visible order. At the ends: "This is the last record in this view." / "This is the first record in this view." Empty view: "No records in this view. Show all {n} records to move." |
| ArrowDown / ArrowUp, Home / End | List navigation | Only when the listbox has focus |
| E | Evidence | Toggles the drawer. While the drawer is open, A and R only show the hint "Close the evidence first (Esc)." (§5.7) |
| S | DGDA source | `window.open(sourceUrl, "_blank", "noopener")`. `sourceUrl` = `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/{encodeURIComponent(conceptId)}/` |
| ? | Shortcuts sheet | Modal (below) |
| Esc | Close | Closes, in this order: the sheet, the drawer, the note panel (keeping the draft), the search text |
| Enter | Never approves | On "Looks correct", blocked with or without modifiers, with a hint. Space still presses the focused button. |
| Ctrl Enter (Cmd Enter on Mac) | Send report | Only inside the note field |

Rules:

- Shortcuts are ignored when the event target is `input`, `textarea`, `select` or `contenteditable`, except Esc and Ctrl/Cmd+Enter in the note field.
- Shortcuts are ignored when Ctrl, Cmd or Alt is held (browser shortcuts keep working).
- Letter keys are matched case-insensitively. `?` is matched by `event.key`.
- **Single-key shortcuts can be turned off (Decision; WCAG 2.1.4, and speech-input users).** A `Segmented` control "Single-key shortcuts: On / Off" sits in the shortcuts sheet under "Settings" and in the AccountMenu on `/review/*`. It is stored in the cookie `intellidrugs-keys` = `on` | `off` (same attributes as `intellidrugs-undo`, §5.8.1; any other value reads as `on`). When it is Off:
  - A, U, R, J, K, E, S and ? do nothing; the buttons, links and listbox arrow keys still work;
  - Esc (closing) and Ctrl/Cmd+Enter in the note field still work, because they are not single-character keys;
  - the key row is hidden, and `Kbd` labels and `aria-keyshortcuts` are removed from the buttons;
  - the workspace `aria-label` drops the shortcut sentences: "IntelliDrugs review workspace."
- The sheet also opens from the AccountMenu item "Keyboard shortcuts and settings", so it is reachable when single-key shortcuts are Off.

**Shortcuts sheet:**

- `role="dialog"`, `aria-modal="true"`, title "Keyboard shortcuts";
- note "Shortcuts work while focus is in the workspace. They pause while you type in a field, and ignore Ctrl, Cmd and Alt combinations.";
- `dl` rows exactly as in Board R (the first row uses the reviewer's undo window, n = 8 by default):
  - "Looks correct, then an {n}-second undo window"
  - "Undo during the window"
  - "Report an issue"
  - "Next and previous record"
  - "Evidence: raw DGDA row and pipeline notes"
  - "Open the DGDA source"
  - "This sheet"
  - "Close the sheet, the evidence or the note"
  - "Send the report, inside the note field"
  - "Never approves"
- **Settings** (heading "Settings", below the `dl`; new copy, §1.7): "Undo window" with "8 seconds", "20 seconds", "60 seconds" (§5.8.1), and "Single-key shortcuts" with "On", "Off". Each `Segmented` is a form POST to `setDeskSettingAction` that the island enhances, like ThemeSwitch (§3.3). A change applies to the next window; an open window keeps its deadline.
- The toolbar, panes and toast are `inert` while the sheet is open. Tab cycles within the sheet (Close and the settings controls). Esc closes it, and so does ? when single-key shortcuts are on. Clicking the scrim closes it. Focus returns to where it was.

### 5.15 Audit logging

These events are written to `ops.audit_event` (V6, §7.5) through `POST /v1/audit-events` (web) or directly by the API inside its own transactions.

| Event | Written by | When | Target |
|---|---|---|---|
| `sign_in` / `sign_in_denied` | web `/api/session` | Session issued, or a token rejected (reason in `outcome`: `captcha`, `unverified`, `stale_auth`, `invalid`) | none |
| `sign_out` | web | Cookie cleared | none |
| `review_open` | web (island, via the `logRecordOpen` server action) | The record is shown as the open record in the desk (unreviewed data read). Never on a server render alone, so prefetches of the previous and next records (§5.4) are not logged. Without JavaScript, the record page render logs it unless the request carries `Next-Router-Prefetch: 1` or `Purpose: prefetch`. At most one per actor, record and 10 minutes. | `batch_item` `{batchId}/{conceptId}` |
| `evidence_open` | web (island, via the `logEvidence` server action) | Drawer opened. At most one per actor, record and 10 minutes. | `batch_item` |
| `decision` | API, in the decision transaction | Every accepted decision | `batch_item`; `outcome` = `ok` or `issue` |
| `decision_rejected` | API, in its own transaction after the decision transaction rolls back (§7.2) | 409 or 400 on a decision. `outcome` = the code. | `batch_item` |
| `decision_denied` | web `decide` action | A decision or report stopped in the web layer before any API call. `outcome` = `captcha`, `forbidden`, `rate_limited` or `unauthenticated` (`actor_email` null when unauthenticated). | `batch_item` |
| `flag_created`, `flag_resolved`, `partner_request` | API | Accepted | `flag` id |

- Undo and discarded windows are **not** audit events, because nothing reached the server.
- Audit rows hold `actor_email` (team-only, like `review_decision`), `actor_role` and `request_id`. There are no IP addresses and no free text from forms. For `decision` and `decision_rejected`, `request_id` is the decision's `requestId` (§7.2); for other events it is the web request id, the `x-request-id` header the middleware sets on every request (§9.4).
- The audit table cannot be changed after insert: V6 adds triggers that reject UPDATE, DELETE and TRUNCATE (§7.6).
- The web container's stdout logs never contain emails, notes, flag messages, or the query strings of `/search` and `/check`. Logs record the route template, status, duration and request id.

### 5.16 Batch list and flags (`/review`, `/review/flags`)

No board draws these two pages. They use the reviewer toolbar (§5.1, without the batch centre section), no sidebar, one column of at most 860 px, and `ui/` components only. Their copy is new (§1.7). Access is as for every `/review/*` route (§2.3, §5.12).

**Batch list (`/review`)**, rendered when 0 or 2 or more batches are `in_review` (exactly one redirects, §2.1):

- `<h1>` "Batches".
- For each `in_review` batch, an info `Banner` with Board DS's copy and live values: title "Batch `{id}` has {w} record[s] waiting for a pharmacist." (w = current items not approved) and body "The batch is approved when every record is approved by a pharmacist."
- When no batch is `in_review`: "No batches are in review." in place of the banners.
- A list (`<ul>`) of every batch, `in_review` first, then by `runAt`, newest first. Each row is a link to `/review/{batchId}` with the mono batch id, a `ProgressMeter`, "{a} of {n} approved", "Batch status: **In review**" or "**Approved**", and "Run {fmtUtc(runAt)}".
- A link "Problem reports and partner requests" to `/review/flags`. The AccountMenu shows the same item for reviewers (§6.2).

**Flags (`/review/flags`):**

- `<h1>` "Problem reports and partner requests", then two sections, each with an `<h2>`: "Problem reports" (every open flag except partner requests) and "Partner access requests" (`targetType: "other"`, `targetId: "partner-access"`, §6.9).
- Each item: the target (a product or substance links to its public page; a check shows "Interaction check"), the message in `.raw` (`white-space: pre-wrap`), and "Reported {fmtDhaka(createdAt)}". No reporter email (§2.2).
- "Resolve" (tonal sm, busy label "Resolving") posts to the existing `resolveFlagAction` with the one shared `TurnstileField` (action `resolve`, §9.2). Outcomes keep the existing `RESOLVE_OUTCOME` map, except that `resolved` reads "Report resolved." (or "Request resolved." for a partner request), shown in a `role="status"` line and announced.
- Empty sections: "No open problem reports." and "No open partner requests."
- API error: crit `Banner` "Couldn't load the reports." / "Nothing was changed. Check your connection and try again." with "Try again".
- Paging: 50 per section (§7.5), with "Next page" and "Previous page" links.
- Without JavaScript the list reads fully; Resolve needs the bot check and shows the `<noscript>` line "Resolving needs JavaScript for the bot check."

---

## 6. Public surfaces

### 6.1 Site chrome and landing (`/`)

**Navigation bar:**

- Wordmark (link to `/`);
- links "Medicines" (`/search`), "Interaction checker" (`/check`), "Learn" (`/learn`), "For partners" (`/partners`). The current link has `aria-current="page"`.
- right side: "Sign in" (tonal), or the avatar `AccountMenu`.
- On search, product and checker pages the bar is `.material` and holds the search field. Placeholder "Brand, substance or DAR number". It is a GET form to `/search`.
- Below 720 px the links fold into a `<details>` "Menu" button (`.btn--icon`, sr-only "Menu"), and "Sign in" becomes plain sm.
- Where the bar is sticky, the public shell sets `scroll-padding-top` on `html` to the bar's height (a token-derived custom property), so a focused element is never hidden under it (WCAG 2.4.11). The Learn shell does the same for its toolbar (§6.8).

**Landing content** (Board P section 1, copy verbatim):

- **Pilot line**: "Pilot: {n} medicines being reviewed by pharmacists". `n` = live `inReviewProducts` from `/v1/stats`. Hidden when 0.
- **H1**: "Bangladesh's medicines, traced from brand to substance and checked by a pharmacist."
- **Lede**: "IntelliDrugs maps every DGDA-registered brand to its clinical drug and active substances, with ICD-11, RxNorm, ATC, DrugBank and SNOMED CT codes and DDInter 2.0 interactions. A record goes public only after a pharmacist approves it."
- **CTAs**: "Check interactions" (primary lg, `/check`) and "Search medicines" (tonal lg, `/search`).
- **Fine print**: "Free to search. Continue with Google to sign in or create an account."
- **Lookup card** (Board P `.s-look`, steps: brand → clinical drug → active substance with codes → severity counts).
  - **Decision**: the card shows the configured hero product, `HERO_CONCEPT_ID=186-0030-006--napa`.
  - When it is approved, the card renders live API data (all four steps) with no Example marker. The footer shows the approved pill only.
  - **While it is not approved (Decision, §1.6 item 9)**, the card is built from the product stub (§7.4) only. It shows the trade name (`tradeName`) as the card heading and in the field row, and the `NOT_REVIEWED` pill, with the line "Its clinical drug, codes and interactions appear here after a pharmacist approves it." It shows no dosage form, company, DAR number or "Filed as" generic content (Board P's step 1 carries all four), and no clinical drug, substance, code or count, and no Example marker. The card's group `aria-label` is "Lookup for {tradeName}", with no "Example" wording. This holds for every non-approved state, including issue, back in review and removed, and at every width.
  - When approved, the field row reads "{tradeName} {strengthValue}" for a single-ingredient product (Board P's "Napa 500") and "{tradeName}" otherwise, and the group `aria-label` is "Lookup for {field row text}", without Board P's "Example: … as it will look after approval".
- **Below 480 px** (Board P's 400-pixel landing hero mockup):
  - the lede is replaced by Board P's mobile lede: "Every DGDA-registered brand mapped to its clinical drug, active substances, international codes and DDInter 2.0 interactions. Public only after a pharmacist approves it.";
  - the fine print is hidden;
  - the CTAs stack, each at 100% width;
  - the approved card shows: "Brand" (name, form, mono DAR; the company is omitted, because there is no short company name to show Board P's "Beximco"); "Clinical drug" (display name, mono BDC); "Active substance" (name, mono BDS, "also {DGDA name}" when different); and only the ICD-11, RxCUI and ATC code chips. It shows no strengths and no severity counts. The footer shows the approved pill only.
- **Stats band**:
  - "39,196 products in the official DGDA register" (static, from `content/site.ts`, source date 27/03/2026);
  - "5 code systems: ICD-11, RxNorm, ATC, DrugBank, SNOMED CT";
  - "3 interaction kinds from DDInter 2.0: drug–drug, drug–disease, drug–food";
  - "{n} medicines in pilot batch `{id}`, under pharmacist review now" (live; while more than one batch is in review: "{n} medicines in {k} batches, under pharmacist review now").
- **Bands**, verbatim from Board P: "One record, three kinds of work" (three audiences); "How a record becomes trustworthy" (5 steps plus the re-run loop); "Three promises"; "For partners: the same records, by API".
  - The partner code sample keeps "Example" and "Field names illustrative" until §7 ships, then shows the real response.
  - "Request partner access" links to `/partners`, with "Sign in first. Access is granted by the IntelliDrugs team."
- **Footer**:
  - wordmark;
  - "A drug knowledge base for Bangladesh. Decision support, not a substitute for clinical judgement.";
  - links: Medicines, Interaction checker, Learn, For partners, Privacy;
  - "Data sources and licences" lines verbatim. The two "to confirm" markers are an Open question (§13) and must be resolved before public launch;
  - legal line "drugdb.eliooo.org · Severity levels and management text are DDInter 2.0's, shown truncated, never rewritten.";
  - ThemeSwitch.

### 6.2 Sign-in and sign-up (`/signin`)

**Card** (Board P section 2):

- `BrandIcon` 32 plus wordmark;
- `<h1>` "Sign in to IntelliDrugs";
- sub "New here? The same button creates your account.";
- Google button "Continue with Google" (`.s-gbtn` with Google's glyph colours);
- `TurnstileField` (action `signin`) with "Bot check passed · Cloudflare Turnstile";
- invite note "**Reviewing for the pilot?** Pharmacists and engineers join by invite. Continue with the Google account your invite was sent to, and your reviewer tools appear.";
- privacy text "We use your Google name and email address only to sign you in and, for reviewers, to record each decision. Public decision history shows roles, never emails. We never post to your Google account. Privacy" (link `/privacy`).

**Flow:**

1. The Turnstile token must be present. Without it the button is `aria-disabled` and the bot status reads "Checking".
2. Google popup (`prompt=select_account`). Then ID token, then Firebase `signOut`.
3. `POST /api/session {idToken, turnstileToken, returnTo}`.
4. On 200, redirect to `returnTo` only when it passes `safeReturnTo()` (`$WEB/lib/return-to.ts`, used by the server and the island alike); otherwise to `/signin?welcome=1`. `safeReturnTo(value, origin)` accepts a value only when all of these hold:
   - it starts with `/`;
   - it contains no `\`, no `%5C` or `%5c`, and no control characters (U+0000–U+001F, U+007F);
   - `new URL(value, origin).origin === origin`.
   `safeReturnTo(value, origin)` takes the origin as a parameter. The server passes `https://{SITE_HOST}` (`SITE_HOST` is a server-only variable). The SignInButton island receives `siteOrigin` as a prop from the server page (the same value) and passes that. The redirect target is the parsed URL's `pathname + search + hash`, never the raw string. Unit cases: `/\evil.com`, `/%5Cevil.com`, `//evil.com`, `https://drugdb.eliooo.org.evil.com`, and values containing a raw line feed or tab are refused; `/review/0001-pilot/x?show=needs` is accepted.

**States** (each a server-rendered `Banner` or card, selected by `?state=` or by island state):

| State | Copy |
|---|---|
| Loading | The button shows a spinner and "Opening Google", keeping its size. The line "Finish signing in in the Google window. This page updates when you're done." |
| Signed in, reader (`?welcome=1`, role `user`) | Account row (initials, own name, own email). `<h2>` "You're signed in as a reader". "You can search medicines and check interactions. Reviewing needs an invite. If you were invited, sign out and continue with the invited Google account." Buttons "Search medicines" and "Sign out". |
| Invited reviewer (`?welcome=1`, role pharmacist or engineer) | Role badge with shield, "Signed in as {name}". `<h2>` "You're a {pharmacist\|engineer} reviewer for batch {id}". Steps: "{n} records are waiting. Each shows [Not yet reviewed by a pharmacist] until a pharmacist approves it." / "Compare the DGDA register with the extraction, then press `A` or choose Looks correct. You have {undo} seconds to undo with `U`." ({undo} = the reviewer's undo window, §5.8.1; 8 by default, which is Board P's wording) / pharmacist: "Your approval publishes the record. If the pipeline re-runs it later, it comes back to you as [Back in review]."; engineer: "Your check is recorded but does not publish. A pharmacist approves each record." Button "Open the review desk" with "Shortcuts work inside the desk only, and pause while you type." |
| Bot check failed | crit: "We couldn't confirm you're a person." / "You weren't signed in. Retry the check. If it fails again, turn off extensions that block scripts on this page." Button "Retry check". |
| Sign-in cancelled (popup closed) | info: "Sign-in cancelled." / "You closed the Google window before finishing. Nothing changed. Continue with Google to try again." |
| Pop-up blocked | warn: "Your browser blocked the Google window." / "Allow pop-ups for drugdb.eliooo.org, or continue in this tab instead." Button "Continue in this tab" (`signInWithRedirect`, §9.5). |
| Sign-in not configured | "Sign-in is not available right now." / "Searching and checking interactions don't need an account." |
| Session request failed (5xx or network) | crit: "Couldn't sign you in." / "Nothing changed. Check your connection and try again." |
| Too many sign-in attempts (429, §9.3) | warn: "Too many sign-in attempts. Wait a few minutes and try again." |
| Invite sent to another Google account | Not a `/signin` state. A reviewer who signs in with an account that is not on `REVIEWERS` has role `user`: `/signin` shows the reader welcome, and any `/review/*` route (including the `returnTo` target) renders Board P's "This Google account isn't on the reviewer list." banner on the not-authorised page (§5.12). |

**Account menu** (`<details>`):

- the `summary` (avatar button) carries sr-only text "Account menu for {own name}" (Board P);
- head: avatar, own name and own email; for reviewers, the role badge plus "Batch {id}";
- items: "Review desk" and "Problem reports and partner requests" (reviewers only), the theme control; on `/review/*` also "Keyboard shortcuts and settings" and the "Single-key shortcuts" control (§5.14); then "Sign out" (form POST to `/signout`, §2.1).

### 6.3 Search (`/search?q=`)

- Results header `<h1>` "Results for "{q}"" with a count line: "{s} substance[s], {p} product[s]", where zero parts are omitted.
- Groups:
  - "Substance" or "Substances" first;
  - then "Products": approved products first, then hidden stubs, each by name.

**Substance hit:**

- linked name (`/substances/{bdsId}`);
- hit line by matched name type:
  - `dgda_content`: "Matched <mark>{matched}</mark>, the name in the DGDA register. {systems} call it {preferred}." ({systems} = the other name systems, joined "RxNorm, ICD-11 and DDInter");
  - `rxnorm`: "Matched <mark>{matched}</mark>, the RxNorm name.";
  - `ddinter`: "Matched <mark>{matched}</mark>, the DDInter name.";
  - preferred name: no hit line;
- meta: mono BDS id; then by coverage: `full`: "Interaction data found in DDInter 2.0, `{ids}`" (Board P); `none`: `NoDataChip("No interaction data")` followed by `NO_DATA_SENTENCE`; `not_run`: `NOT_RUN`; then "{k} approved product[s]" (§1.6 item 15);
- side: ATC and RxCUI code chips.

**Approved product hit:**

- linked name;
- meta: form, company, mono "DAR {dar}";
- hit line "Filed as <mark>…</mark> {strength}. Clinical drug {display}, `{bdcId}`.";
- side: approved pill.

**Stub hit** (unapproved):

- linked name (to the stub);
- mono concept id;
- "A pharmacist hasn't approved this record yet, so its substance, codes and interactions are hidden.";
- side: `NOT_REVIEWED` pill.
- **Decision**: stubs match on **trade name and DAR number only**, never on generic content or substance names, so search never reveals an unreviewed composition.

**Pagination**: 20 per page. "Next page" and "Previous page" links. **Decision**: every session can open at most page index 9, because public routes always read with public scope (§2.2). Beyond that: "Showing the first 200 results. Refine your search to see more."

**No results:**

- `<h1>` "No medicines match "{q}"";
- "Check the spelling, or search by brand, substance or DAR number.";
- when the API returns a suggestion: button "Search for {suggestion}";
- "IntelliDrugs is in its pilot. {n} medicines are in review now, and more follow in later batches." (live n; the sentence is dropped once no batch is in review).
- It never says a medicine doesn't exist in Bangladesh.

**Validation**: `q` shorter than 2 characters renders "Type at least 2 characters." with no API call. Over 100 characters: "Use 100 characters or fewer."

### 6.4 Hidden-record stub (`/products/[id]` when not approved)

Status 200 (**Decision**: never 404; the record exists).

- crumb "Medicines / {trade name}";
- `<h1>` trade name;
- mono concept id;
- `NOT_REVIEWED` pill. Used for every non-approved state, including issue and back in review;
- "A pharmacist hasn't approved this record yet. Until then IntelliDrugs hides its clinical drug, codes and interactions, so nobody relies on data that hasn't been checked.";
- "This is not the same as "not found" or "no data". The record exists and is in review in batch `{batchId}`.";
- button "Search other medicines".

**Removed records (Decision).** When the product's latest batch item is marked "removed from batch file", the product is served publicly as this stub, whatever its last decision (the API returns the stub with `status:"removed"`, §7.4). The pill stays `NOT_REVIEWED`, and the two review sentences are replaced by "Removed from the DGDA batch file." (new copy, §1.7). A removed product is never counted as approved anywhere (search, checker, other brands, stats).

The same pattern applies to substance stubs: "…hides its codes and interactions…", with no batch sentence.

Unknown id: `not-found.tsx` with "No medicine with the id {id}." and "Search medicines".

### 6.5 Product page (approved)

Layout as in Board P "Napa product page": the main column and a 300 px aside. They stack below 980 px.

**Main column, in order:**

1. **Crumb**: "Medicines / {first substance preferred name} / {trade name}". The substance links to `/substances/{bdsId}`. Combination products use the clinical drug display name in place of the substance.
2. **`<h1>`** trade name. Meta: form, company, mono "DAR {dar}".
3. **Verification line**: approved pill plus "on {DD/MM/YYYY}, {HH:mm} Dhaka time" (from `verification.approvedAt`).
4. **"What's in it"** (subtitle "From the register to the substance"):
   - three trace columns: "Brand, as filed with DGDA" (name, `.raw` generic content, form); "Clinical drug" (display name, mono BDC, "{form}, {route} route"); "Active substance" (one per ingredient: "{name}, {strength}", mono BDS, "Also listed as {DGDA name}" when different);
   - a names list per substance, grouped by name with its sources: "Paracetamol — DGDA register", "acetaminophen — RxNorm", "Acetaminophen — ICD-11, DDInter".
5. **"Codes"**: one table per substance. Caption sr-only "Crosswalk codes for {name}". Subtitle "{k} code systems and the DDInter entry, for {name} `{bdsId}`". Columns "System", "Code", "What the system is", "How it was matched". Fixed descriptions:
   - ICD-11 "WHO's ICD-11 medicament code. The DGDA register lists ingredients with it."
   - RxNorm "Normalised drug names from the U.S. National Library of Medicine."
   - ATC "WHO Anatomical Therapeutic Chemical classification."
   - DrugBank "DrugBank's record for the substance."
   - SNOMED CT "Clinical terminology used in health records."
   - DDInter "The DDInter 2.0 entry the interactions below come from."
   - "How it was matched" reads "{method}, confidence {confidence 1 decimal}[, {route}]", as in Board P ("xm, confidence 1.0"). Multiple codes of one system share a row as chips.
   - The DDInter row lists **the chosen entries only**, with "route assumed" appended when assumed. Other entries of the substance appear on the substance page.
6. **"Interactions"** (subtitle "From DDInter 2.0, for {name}"; one block per substance). The block depends on the substance's coverage and chosen entries, and **never renders a count of 0 for missing data**:
   - **Data found for the route** (coverage `full`, at least one chosen entry):
     - `<h3>` "{total} drug–drug pairs" for the chosen entries;
     - severity chips with counts;
     - key-value "**{d}** drug–disease interaction[s]", "**{f}** drug–food interaction[s]";
     - the checked-against line (§5.6.4) when the route is not systemic or was assumed.
   - **No data** (coverage `none`): a `NoDataBlock` in place of the count heading, chips and key-values, with title = the substance name, `NO_DATA_SENTENCE`, and the second line "Drug, disease and food interactions: no data in DDInter 2.0." In the Codes table (item 5), the DDInter row shows `NoDataChip("No data")`.
   - **No entry for the route** (coverage `full`, no chosen entry): the §5.6.1 line ("No DDInter entry for this product's route ({route}). Its pairs are not checked.", or its no-route form) in place of the count heading, chips and key-values. The DDInter row of the Codes table shows the plain text "No entry for route {route}" (or "No entry for this product's route" when it has none) in the Code column, with no `NoDataChip` (the substance has data; the hatch is only for coverage `none`, §3.4), and "How it was matched" is empty.
   - **Not run** (coverage `not_run`): `NOT_RUN` as plain text, and nothing else. (An approved product cannot be in this state, because approval needs the DDInter stage to have run (§7.2); it is specified for completeness.)
   - **"With the other medicines in batch {id}"** (**Decision**: approved products of the same batch only):
     - `PairCard`s, Major first. Head "{this brand} + {other brand}". Meta "{substance} + {substance}. Action: {actions}". Text block. Source line "Source: DDInter 2.0, `{idA}` + `{idB}`".
     - Unclassified pairs without text are grouped in one panel: chip "Severity not classified by DDInter {k}", "{brand} with {partners, joined}." where each partner is its brand name, or "the {substance} in {brand}" for one ingredient of a combination product (Board P: "the Amoxicillin in Amoxycillin Clavulanic Acid"), and `UNKNOWN_PAIRS_LINE`.
     - No-data partners: a `NoDataBlock` per partner substance with "Not checked: {brand} + {partner brand}". Partners with no route entry or not run use the §6.7.3 item 4 lines.
     - Checked pairs with no interaction listed: a quiet block "No interaction listed in DDInter 2.0", "{brand} with {partner brand or 'the {substance} in {brand}'}. DDInter 2.0 lists no interaction for this pair. This is not a guarantee that they are safe to combine."
     - Unapproved partners are not shown here. The checker covers them.
7. **"Automated checks"** (subtitle "{ok} OK, {w} Warning[s]. Notes are the pipeline's own."):
   - four `StageCheck` cards. An OK card with no note shows "No pipeline note.";
   - the DDInter warning lists text-missing pairs: "DDInter text not found for {n} pair[s]:" plus `.stage-pair` items. Severity chips are not shown on the public page, per Board P.

**Aside:**

- **Verification card**:
  - approved pill;
  - "A pharmacist compared this record with the DGDA register on {DD/MM/YYYY}. Decision history shows roles, not names.";
  - "If the pipeline re-runs {brand}, the record goes back to review and leaves public view until it is approved again."
- **"Other brands of {clinical display}"**:
  - list of approved brands (link, company, mono DAR) from `GET /v1/clinical-drugs/{bdcId}`;
  - none: "No other approved brand maps to `{bdcId}` yet. Other DGDA brands of this clinical drug appear here as pharmacists approve them."
- **"Where this record comes from"** `dl`:
  - Source "DGDA register";
  - Concept (mono);
  - Extracted "{fmtDhakaTime}";
  - Batch (mono);
  - Checks "{ok} OK, {w} Warning".
- Primary button "Check {brand} with other medicines" → `/check?ids={conceptId}`.
- **Report a problem**: `<details>` with summary "Report a problem with this record".
  - Signed in: textarea, label "What's wrong? The IntelliDrugs team reads this.", help "5 to 2000 characters." followed by `NO_PHI_HELP`, 5–2000 characters, `TurnstileField` (action `flag`), "Send report". Outcome messages are the existing `FlagForm` map, unchanged.
  - Anonymous: link "Sign in to report a problem" → `/signin?returnTo=…`.

### 6.6 Substance page (`/substances/[bdsId]`)

**Decision.** The boards define no substance page. It uses the product-page components only.

- crumb "Medicines / {name}";
- `<h1>` preferred name, mono BDS;
- names list; codes table (all DDInter entries, each with its route);
- coverage:
  - `full`: neutral text "Interaction data found", never green;
  - `none`: `NoDataBlock`;
  - `not_run`: `NOT_RUN` (Board L), never the no-data sentence;
- per-entry severity counts;
- **"Drug–drug interactions"**: a paginated list, 20 per page, from `GET /v1/substances/{bdsId}/interactions`:
  - severity filter as GET links: "All", "Major", "Moderate", "Minor", "Severity not classified by DDInter";
  - each item is a `PairCard` with partner name, entry and route, actions and text;
- **"Drug–disease"** and **"Drug–food"**: lists of name, severity chip and truncated text with the Expander;
- **"Products"**: approved products, linked;
- **"Clinical drugs"**: approved clinical drugs.

### 6.7 Interaction checker (`/check`)

Layout per Board P `.s-chk`: a side column (input, selected, scenarios) and a main column (summary, counts, results, legend, disclaimer). It stacks below 920 px. The page `<h1>` is "Check interactions" (Board P), at the top of the side column; the summary sentence is the `<h2>` that opens the main column.

#### 6.7.1 Input

- **Field**: label "Add a medicine". Combobox `input role="combobox"` with `aria-autocomplete="list"`, `aria-expanded` and `aria-controls`. Placeholder "Brand or substance, such as Napa or paracetamol". Help "Up and down arrows to move, Enter to add, Esc to close. 2 to 20 medicines."
- **Suggestions** come from `/check/suggest?q=` (debounce 200 ms, 2 or more characters, at most 10). The island sends the current ids, and `/check/suggest` excludes products already selected (Board P).
  - Each option shows the brand name and a sub line:
    - approved: "{clinical display}", plus ". Matches {synonym}, a name for {substance}" when matched by a synonym, or ". Matches {substance}" when matched by the substance's own name (Board P);
    - unapproved: "Not yet reviewed by a pharmacist".
  - No match: 'No medicine matches "{q}".'
  - Keys: ArrowDown and ArrowUp move; on a closed list, ArrowDown opens it at the first option and ArrowUp at the last; Enter adds; Esc closes, then clears; Tab closes.
- **Adding** navigates to `/check?ids=…` with `router.replace`. The input clears and keeps focus. Announce "{brand} added. {summary}".
- **Selected list**: header "Selected, {k} of 20"; "Clear all" (plain sm; `aria-disabled="true"` when the list is empty, never `disabled`, so a re-render never drops focus); each row shows the brand, clinical display (or the `NOT_REVIEWED` pill) and a remove button with sr-only "Remove {brand}". After removal, focus goes to the remove button now at the same position, or else the previous one, or the input when the list is empty (Board P). Announce "{brand} removed. {summary}". After Clear all, focus moves to the "Add a medicine" input and the island announces "All medicines removed." (Board P). Without JavaScript, Clear all is a GET submit with no ids; the page reloads at the top and autofocuses nothing. Empty list: "No medicines yet."
- **At 20 medicines** the input is not disabled, because it holds focus after the 20th add and a disabled control would drop focus to `<body>`. Instead it gets `aria-disabled="true"` and `readonly`, the suggestions stop, and its help text becomes "20 medicines is the maximum. Remove one to add another." (new copy, §1.7). Focus stays on the input. Removing a medicine restores the field.
- **Scenarios** (heading "Start from a scenario"): links defined in `content/check-scenarios.ts`. The pilot set is "G Warfarin + Aspirin + Domperidone", "Clarith + Simvastatin", "Simvastatin + Amlodipine-5", "Napa + G Warfarin". A scenario renders only when all of its products exist. After a scenario link loads, the island announces "Scenario loaded: {scenario}. {summary}" (Board P).
- **Decision**: the selection lives only in the URL. Nothing goes to localStorage. Board P's `intellidrugs-checker` persistence is dropped, because a medicine list on a shared clinic computer should not reappear.

#### 6.7.2 Counting rule (computed by the API, §7.4; the web only formats)

For the selected products, the API removes the unapproved ones under public scope; they are listed as not reviewed. Then for every pair of **different** remaining products, it takes every substance of A × every substance of B, skipping a pair whose two sides have the same BDS (rule 4):

1. If either substance has no usable entry, the pair is **not checked**. A substance has no usable entry when:
   - its coverage is `none` (reason `no_data`);
   - its DDInter mapping has not run, that is, it has no `curated.interaction_coverage` row (coverage `not_run`, reason `not_run`);
   - it has no BDS (reason `unmapped`);
   - RouteRule finds no entry for its product's route (reason `no_route`).
2. Otherwise the pair is **checked**, using the chosen entries on each side:
   - a `ddinter_pair` row exists: an **alert** in its severity group (`unknown` and any unrecognised value go to "Severity not classified by DDInter");
   - no row: **no interaction listed**. This counts as checked, because the full pair list of every mapped entry is stored.
3. Substances of the **same product** are not paired. They are listed in `notChecked` with reason `same_product` (results item 4).
4. The same BDS in two products is a **duplicate**. It is never paired with itself: it is listed in `duplicates` (results item 5), never in `alerts`, `noInteraction` or `notChecked`.
5. **What the numbers count (Decision).** `{total}`, `{checked}`, `{alerts}` and `{nc}` count only substance pairs drawn from two different, approved products. Same-product pairs and same-BDS pairs are excluded from every count, so one combination product never forces the generic not-checked wording. `{m}` counts every selected medicine, including not-reviewed ones. `{nd}` is the number of not-checked pairs with reason `no_data`; `{other}` = `{nc}` − `{nd}`.

**Summary sentence** (`<h2 class="s-sum">`, also announced after each change):

- fewer than 2 medicines: "Add at least 2 medicines to check them against each other.";
- otherwise: "{m} medicine[s] · {checked} of {total} pair[s] checked · {alerts} with an interaction listed" (new copy, §1.7; Board P has no alert segment and a "not in the pilot pair list" segment, §1.6 item 1). Then, when present:
  - " · {nc} pair[s] not checked because {names joined with and} {has|have} no interaction data" when every not-checked pair has reason `no_data`; otherwise " · {nc} pair[s] not checked", and the reasons are given in the results (§6.7.3 items 3 and 4);
  - " · {nr} medicine[s] not yet reviewed by a pharmacist".

**Count chips row**: Major, Moderate, Minor and unclassified chips with counts (zero groups omitted); then, when `{nd}` > 0, `NoDataChip` "Not checked {nd}" (hatched, reason `no_data` only, as in Board P); then, when `{other}` > 0, the plain, unhatched text "Other not checked {other}".

#### 6.7.3 Results, in order

1. **Severity groups**:
   - `<h3>` "Major, {k} pair[s]" and so on. Inside a group, cards are ordered by brand pair name.
   - Card head: chip plus "{brand A} + {brand B}".
   - Known severity: meta "{substance} + {substance}. Action: {actions}", then:
     - with management: management text (truncated over 200 characters) plus "Management, truncated. Full text from DDInter 2.0." and the Expander "Show full text" / "Show less", or "Management, full text from DDInter 2.0.";
     - without management: "DDInter 2.0 gives no management text for this pair." plus the interaction-description block;
     - with neither: "DDInter 2.0 gives no text for this pair."
   - Unknown severity: meta "{substance} + {substance}", then `UNKNOWN_PAIR_LINE`.
   - Route-assumed line when either side was assumed: "Route assumed: {brand}'s route is {route} and DDInter has no {route} entry for {substance}, so the systemic entry `{id}` was used." When that product has no route: "Route assumed: {brand} has no route on record, so the systemic entry `{id}` was used."
   - Footer: "Source: DDInter 2.0, `{idA}` + `{idB}`".
2. **"No interaction listed in DDInter 2.0, {k} pair[s]"** (`.s-quiet`): a list of "{brand A} + {brand B} ({substance} + {substance})", then "DDInter 2.0 lists no interaction for these pairs. This is not a guarantee that they are safe to combine."
3. **No-data blocks**, one per product × no-data substance:
   - title "{brand}[, {substance} if different] `{bdsId}`";
   - `NO_DATA_SENTENCE`;
   - "Not checked: " plus chips "{brand} + {partner brand}[ ({partner substance}) when the partner has several]".
4. **Other not-checked pairs** (plain text; no hatch and no `NoDataChip`, §3.4):
   - `no_route`: "Not checked: {brand}'s route is {route} and DDInter has no entry for {substance} on that route."; when the product has no route: "Not checked: {brand} has no route on record and DDInter has no systemic entry for {substance}.";
   - `same_product`: "Not checked: {a} + {b} are in the same product, {brand}. Pairs inside one product are not checked.";
   - `unmapped`: "Not checked: {ingredient} in {brand} has no substance mapping yet."
   - `not_run`: "Not checked: DDInter mapping has not run for {substance} in {brand}." (new copy, §1.7). Never the no-data block and never `NO_DATA_SENTENCE`, because DDInter was never asked.
5. **"Same substance in more than one product"**: "{substance}: {brands}". These pairs are not counted (§6.7.2 rule 5).
6. **"Not yet reviewed by a pharmacist, {k} product[s]"**: brands with the `NOT_REVIEWED` pill, then "These products were not checked. A pharmacist hasn't approved them yet." (**Decision**.) It is never "not found", and they are never dropped.
7. **"What was checked"**: `<details>`, open by default when any chosen entry is route-specific or assumed. One line per product and substance:
   - "{brand}: {substance} checked against `{id}` {DDInter name} ({route})", plus ", route assumed";
   - for the eye drop: "Chloramphenicol: Chloramphenicol checked against `DDInter352` Chloramphenicol (ophthalmic)".
8. **Severity legend** ("Severity legend, from DDInter 2.0") and the `DECISION_SUPPORT` disclaimer, verbatim from Board P.

**Empty results** (fewer than 2 medicines): "Add medicines with the field on the left, or start from a scenario. Pairs appear here, Major first."

**API errors:**

- 404 for an unknown id: drop it from the selection, and show the info banner "One medicine in the link no longer exists, so it was removed." There is no data leak.
- 5xx or timeout: crit banner "Couldn't check these medicines." / "Nothing was saved. Try again in a moment." / "Try again".

### 6.8 Learn (`/learn/[chapter]`)

- **Shell** (Board L):
  - sticky material toolbar (with `scroll-padding-top` on `html` set to its height, §6.1): "Skip to content" link, lockup ("IntelliDrugs Learn, back to top" becomes "IntelliDrugs Learn" linking to `/learn/start`), "drugdb.eliooo.org", ThemeSwitch;
  - chapter nav sidebar: "Learn IntelliDrugs", a numbered list of the 10 chapters with `aria-current="page"`, and a nav note with the pilot status pill and "All {n} pilot records, batch `{id}`." (live);
  - one reading column, at most 860 px;
  - "On this page" rail with LearnRail. Hidden below 1180 px.
  - **Below 860 px** (Board L): the chapter nav becomes a sticky, horizontally scrolling row directly under the toolbar; the "Learn IntelliDrugs" heading and the nav note are hidden; the current chapter's link is scrolled into view on load; `scroll-padding-top` on `html` = toolbar height + nav row height (Board L: 116 px), so a focused heading is never under the sticky nav (WCAG 2.4.11). Below 640 px the "drugdb.eliooo.org" label is hidden. Below 380 px the lockup drops the icon (§3.4).
- **Headings (Decision).** Board L is one page with one `<h1>` ("Learn IntelliDrugs") and an `<h2>` per chapter. With one route per chapter (§2.1), the hero (`<h1>` "Learn IntelliDrugs", the lede, the four facts and the status line) renders only on `/learn/start`. On every other chapter the chapter title is the `<h1>`, and that chapter's section headings move up one level, so §10.5 holds.
- **Content source (Decision)**:
  - chapter content is TSX in `$WEB/content/learn/{chapter}.tsx`. No MDX dependency;
  - fixed text is copied from Board L, with the corrections in §1.6;
  - SVG diagrams are inline React components with `role="img"`, `<title>` and `<desc>` copied verbatim;
  - live numbers come from `GET /v1/stats`: hero facts "products in the DGDA register" (static), "{n} pilot medicines loaded so far", "{k} substances, each with a BDS id", "{a} of {n} approved by a pharmacist"; the status line; the batch progress list in chapter 4 (trade name and review status only); and the glossary counts that `/v1/stats` carries (products loaded, substances, approved and in-review counts);
  - the worked pilot examples (Napa trace, edge cases, the pairs list, the per-substance table, the worked check, the reviewer warnings) come from a typed snapshot, `$WEB/content/learn/pilot-snapshot.ts`, captured from the pilot after the §8 re-run.
  - **Snapshot values, not live** (`/v1/stats` carries no review detail, §7.4): the glossary pilot lines "Back in review", "Engineer checked", "Issue reported", "Review decision", "Re-run" and "Stage check", and the chapter 4 evidence table counts (for example `ops.review_decision` 0 and `ops.stage_result` 40). Each is rendered from `pilot-snapshot.ts` and followed by "as stored on {date}" (the snapshot date). `learn-snapshot.test.ts` pins them.
- **Snapshot rules:**
  - Every snapshot block carries its status pill. The footer reads, verbatim from Board L: "Sources: the DGDA register (OCL concepts), NLM RxNav, DDInter 2.0, and batch {id} as stored on {date}. Endpoint paths come from the API controllers; example response bodies are illustrative." then "Anything marked Example is an illustration, not a stored record, and carries no clinical meaning. IntelliDrugs is decision support and does not replace a clinician's judgement."
  - **Decision**: Learn may show these unreviewed pilot values because they are labelled explanatory examples, and Board L was approved with them (the G3 exception, §1.2). Learn never offers search, check or links into unreviewed records.
  - **Status pills are live.** Each block's pill comes from `/v1/stats` at render time, not from the snapshot.
  - **Withdrawn examples (Decision).** When a snapshot block's record currently has an issue reported, or is removed from the batch file, the block is replaced at render time by the stub pattern (§6.4: trade name, `NOT_REVIEWED` pill, no clinical values). `/v1/stats` carries this as `exampleUsable: false` per item (§7.4), so Learn needs no reviewer data. A CI check against production statuses is not possible (CI runs on seed data), so this runtime rule is the guard; `learn-snapshot.test.ts` pins that every snapshot block is keyed by a concept id that `/v1/stats` reports.
  - A vitest test checks the snapshot's internal consistency: severity counts sum to their totals; pair counts per record match the §1.6 item 7 hints; the chapter 6 and glossary counts match §1.6 item 11.
- **Chapter 8 "For partners"**: the endpoint table and both example response bodies are regenerated from the controllers and the §7.4 shapes after §7 ships (§1.6 item 13); a component test pins the chapter 8 JSON against the §7.4 shapes (§11.2). The access column must match §2.2: batches are "Reviewer" and must be token-gated (§7.1). The "Public / Reviewer access" example switch uses the existing `.seg` buttons with `aria-pressed`. Without JavaScript both panels show, one after the other.
- **Glossary** (`/learn/glossary`):
  - GlossaryFilter: input with sr-only label "Filter the glossary" and placeholder "Filter terms, for example salt or DAR" (Board L). It matches the term, its definition and its pilot example, as a case-insensitive substring. Count "Showing all {n} terms" or "Showing {k} of {n} terms", updated 350 ms after typing stops (polite);
  - empty: "No terms match." plus "Clear the filter", which empties the field and focuses it; Esc clears;
  - without JavaScript the input is not rendered and all terms show.
- **FAQ**: native `<details>`.

### 6.9 Partner access request (`/partners`)

- Content: Board P "For partners" band and Learn chapter 8 "Where the API stands", condensed.
- **Form** (signed in only; otherwise "Sign in first. Access is granted by the IntelliDrugs team." with a sign-in link):

| Field | Label | Rules |
|---|---|---|
| Organisation | "Organisation" | required, 2–200 characters |
| Kind | "Kind of system" | select: EMR, Pharmacy, Pharma company, Other |
| Use | "What you will build" | 20–1500 characters; help `NO_PHI_HELP` |
| Volume | "Expected checks per day" | select: Under 1,000; 1,000–10,000; Over 10,000 |
| Bot check | `TurnstileField` action `partner` | required |

- Submit "Request partner access".
- **Stored as a flag** (**Decision**: no schema change): `targetType: "other"`, `targetId: "partner-access"`, message `Organisation: …\nKind: …\nVolume: …\nUse: …` (at most 2000 characters), reporter email from the session.
- Success: "Request sent. The IntelliDrugs team replies to {own email}." Errors use the existing flag outcome map.
- At most 3 requests per signed-in account per day (§9.3).
- `/review/flags` lists these requests under their own heading, "Partner access requests". Like every flag, they are shown without the reporter's email (§2.2). The team reads the reply address with the query in `docs/runbooks/partner-requests.md`, which needs database access; the address is never rendered by the web app.

---

## 7. API changes

Every change keeps the `ApiResponse` envelope and the error mapping in `ApiExceptionHandler`. New errors use the existing codes (`INVALID_QUERY`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`) with a `field`.

### 7.1 Access fixes

| # | Change | Board element | Notes |
|---|---|---|---|
| A1 | `GET /v1/batches`, `/v1/batches/{id}`, `/v1/batches/{id}/report` and `GET …/decisions` require `X-Internal-Token` (`auth.require`). | Learn chapter 8: batch evidence is "readable only by signed-in reviewers"; closes G-SEC-1 | Web calls send the token only for reviewer sessions. |
| A2 | Decision notes and history are never served without the token. | §2.2; closes G-HIST-1 | `PublicDecision` is removed. |

### 7.2 Decision endpoint changes (`POST /v1/batches/{b}/items/{c}/decisions`)

The request body adds two **required keys**:

- `expectedLastDecisionId: number | null` (absent: 400 `field=expectedLastDecisionId`);
- `requestId: string`, a UUID generated by the web when the reviewer presses A or sends a report, and reused unchanged on every retry of that decision (absent or not a UUID: 400 `field=requestId`).

Inside the existing transaction, after `SELECT … FOR UPDATE` of the item and the batch, the API runs these steps in this order:

| Step | Check | Response |
|---|---|---|
| 1. Idempotency | An `ops.audit_event` row with `event='decision'` and `request_id = requestId` exists | Same batch, item and decision: **200** with the current `Outcome` and `replayed: true`. Nothing is written. Any other target or decision: 400, `field=requestId`. |
| 2. Run stamp | `extracted_at IS DISTINCT FROM extractedAt` (so `null` = `null` matches, and `null` against a stamp does not) | 409 `CONFLICT`, `field=extractedAt` (existing) |
| 3. Other reviewer | max decision id `IS DISTINCT FROM expectedLastDecisionId` | 409, `field=lastDecisionId`, "Another reviewer decided on this record after the page was loaded; reload it and review again" |
| 4. Removed | item `note = 'removed from batch file'` | 409, `field=conceptId`, "This record was removed from the batch file" |
| 5. Checks | `decision=ok`, and any of: a stage result with status `fail`; one of the four stages (`dgda`, `substances`, `clinical`, `ddinter`) with no result; `extracted_at IS NULL` | 409, `field=stages`, "A check failed on this record. It returns to review after the fix and re-run." (Decision: a record with a failed or missing check, or with no run stamp, cannot be published; only a re-run clears it. The UI maps it to the `stage_failed` hint, not to the stale banner, because reloading cannot fix it.) |
| 6. Issue open | `decision=ok` and `review='issue'` | 409, `field=review`, "An issue is open on this record. It returns to review after the fix and re-run." (Decision; closes G-GATE-1, replaces `ApprovalRuleTest.okAfterIssueNeedsAPharmacist` and `ReviewApiIntegrationTest.issueAfterOkIsIssueAndOnlyAPharmacistClearsIt`) |
| 7. Already approved | `decision=ok` and `review='ok'` | 409, `field=review`, "This record is already approved by a pharmacist" |
| 8. Already checked | `decision=ok`, `reviewerRole=engineer`, and `displayStatus=engineer_checked` | 409, `field=review`, "Your check is already recorded for this record" |

- The success response (201) becomes `Outcome{batchId, conceptId, review, displayStatus, batchStatus, version:{extractedAt, lastDecisionId}, replayed:false}`.
- The `decision` audit row (§5.15) is written in the same transaction with `request_id = requestId`. V6 makes `(request_id) WHERE event = 'decision'` unique (§7.6), as a backstop. Two concurrent sends of one decision already serialise on the item lock, so the second is answered by step 1; if the index is ever hit, the API rolls back and answers with step 1 in a fresh transaction.
- `decision_rejected` rows carry the same `requestId`. A row inserted inside the decision transaction would roll back with it, and a 400 from `ReviewService.validate` is raised before any transaction exists. So `decision_rejected` is written in its own transaction after the decision fails (`onErrorResume` → insert → rethrow the original error), for both validation (400) and conflict (409) errors.
- An `issue` is accepted in any non-removed state, including on records with failed checks.

### 7.3 Reviewer read endpoints (all require the token; new `ReviewQueryController`)

```
GET /v1/review/batches
→ [{ batchId, status, runAt, itemCount,
     counts: { approved, issue, needsReview, engineerChecked, backInReview, noData, warnings } }]   // current items only

GET /v1/review/batches/{b}/items?show=all|needs|warn|issue|approved|nodata&q=&page=0&size=100
→ { batchId, total, filterCounts: { all, needs, warn, issue, approved, nodata },
    items: [ { index, conceptId, tradeName, clinicalDisplayName, displayStatus,
               hint: { failed, warnings, pairsWithoutText, noData },
               version: { extractedAt, lastDecisionId } } ] }            // ordered by concept_id (DAR first)

GET /v1/review/batches/{b}/versions
→ [ { conceptId, extractedAt, lastDecisionId, displayStatus } ]

GET /v1/review/batches/{b}/items/{c}            header X-Viewer-Email (token-gated; never echoed)
→ ReviewItem {
    batchId, conceptId, index, total, displayStatus, review,
    version: { extractedAt, lastDecisionId },
    batch: { runAt, itemCount, status },
    brand: { conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw,
             qualityFlag, parseStatus, parseNote },
    dgdaIngredients: [ { xmCode, name } ],
    clinicalDrug: { bdcId, displayName, doseForm, route, signature } | null,
    ingredients: [ IngredientSummary ],
    stages: [ { stage, status, notes: [ StageNote ], textMissing: [ TextMissingPair ], evidence } ],
    batchPairs: { totalBatchPairs,
                  pairs: [ { ddinterA, ddinterB, nameA, nameB, severity, actions, interaction, management,
                             partners: [ { conceptId, tradeName, index } ] } ],
                  notChecked: [ { substance, partnerSubstance, partners: [ { conceptId, tradeName, index } ],
                                  reason: "no_data"|"not_run"|"no_route"|"unmapped"|"same_product" } ] },
    sourceJson, sourceUrl,
    history: [ { kind: "run"|"extract"|"decision", at, reason?: "run"|"rerun"|"shared_change",
                 role?, decision?, note?, counts?: boolean, mine?: boolean } ],   // oldest first
    reopen: { reason: "rerun"|"shared_change", at, previousExtractedAt, diffAvailable } | null }

IngredientSummary = { bdsId, name, raw, strengthValue, strengthUnit, perValue, perUnit,
                      names: [ { name, type, source } ],
                      codes: [ { system, code, routeScope, method, confidence } ],
                      coverage: { coverage: "full"|"none"|"not_run", note },   // not_run = no curated.interaction_coverage row
                      ddinter: { chosen: [ { ddinterId, name, routeScope, routeAssumed } ],
                                 entries: [ { ddinterId, name, routeScope,
                                              counts: { major, moderate, minor, unknown, total },
                                              diseaseCount, foodCount } ] } }
StageNote = { kind: "text_missing"|"name_only"|"no_data"|"route_assumed"|"no_route_entry"|"other", text,
              ddinterId?, route? }
TextMissingPair = { ddinterA, nameA, ddinterB, nameB, severity, inBatch }

GET /v1/review/batches/{b}/items/{c}/diff?from=<extractedAt ISO>
→ { from, to, reason, rows: [ { field, before, now } ] }       // 404 when no snapshot exists for `from`
```

Rules:

- **`displayStatus`** as in §5.2. It is implemented once, as `ApprovalRule.displayStatus(decisions, extractedAt)`, and computed for a whole batch with one decisions query (no N+1).
- **Coverage `not_run`.** A substance with no `curated.interaction_coverage` row has coverage `not_run`, not `none`. Today `R2dbcSubstanceAdapter.coverage()` (`defaultIfEmpty(… "none", NOT_LOADED_NOTE)`) and `InteractionCheckService.substances()` (`r.coverage() != null ? r.coverage() : "none"`) default a missing row to `none`; both change to `not_run`, so the no-data sentence is never shown for a substance DDInter was never asked about. An ingredient with no substance (`bdsId == null`, today also `none`) becomes reason `unmapped`. The same values are used by §7.4.
- **Stage notes.** The ddinter note is split on `"; "` **only when the stage status is `warn`**. Fail notes are kept whole. Each part is classified by these patterns:
  - `^DDInter text not found for (DDInter\d+)/(DDInter\d+)$` → `text_missing`
  - `^DDInter (DDInter\d+) matched by name only$` → `name_only`
  - `^No interaction data in DDInter for this substance$` → `no_data`
  - `^DDInter route assumed: (DDInter\d+) \((\w+)\) used for (\w+)$` → `route_assumed` (`route` = the third group)
  - `^DDInter route assumed: (DDInter\d+) \((\w+)\) used for unknown route$` → `route_assumed` with `route` = null (§8.1)
  - `^No DDInter entry for route (\w+)$` → `no_route_entry`
  - `^No DDInter entry for unknown route$` → `no_route_entry` with `route` = null
  - otherwise → `other`
- **`textMissing`** comes from `evidence.text_missing`, enriched with names from `ddinter_drug` or `ddinter_pair.partner_name_*`, and severity from `ddinter_pair`.
- **`batchPairs`** applies RouteRule on both sides, per record route.
- **`sourceUrl`** = the OCL concept URL (as `web/lib/evidence.ts` builds it today). `signature` is added to `ClinicalDrug` (R14).
- **`mine`** is true when the decision's `reviewer_email` equals `X-Viewer-Email`, compared case-insensitively. The header is honoured only with a valid token.
- **`history` and `reopen` from snapshots.** `history` has one `extract` entry per `run_id` (§7.6): the snapshots of one pipeline invocation collapse into the last stamp of that run, with the reason rule in §5.6.5. `reopen.at` is the current `extractedAt`; `reopen.previousExtractedAt` is the last stamp of the previous `run_id` group; `reopen.reason` is that of the current group (`rerun` or `shared_change`). `reopen` is null when the item has one group only.
- **`/diff`** compares a fixed field list from the two snapshot payloads:
  - "Trade name", "Company", "Dosage form", "Generic content", "Clinical drug", "Route";
  - per ingredient: "Substance n", "Strength n", "Codes n", "DDInter entries n";
  - per stage: "{Stage} check", "{Stage} note";
  - "Pipeline extracted at".

### 7.4 Public endpoints (scope `public` unless the token and `scope=all` are sent)

The web's public routes always send `scope=public` (§2.2). `scope=all` remains in the API for integration tests; no web route sends it.

**Visibility rule for every endpoint in this section (Decision).** Under public scope:

- a product is **public** only when its latest batch item has `review = 'ok'` and is not marked "removed from batch file";
- a substance is public only when at least one public product carries it;
- a clinical drug is public only when at least one public product maps to it;
- nothing else from an unapproved record is served: no clinical drug, substance, code, strength, severity, count or DDInter text.

| # | Endpoint | Request | Response | Board element |
|---|---|---|---|---|
| P1/P2/P3/P4 | `GET /v1/search` | `q` (2–100), `page` (0–9 under public scope, 0–500 with the token and `scope=all`) | `{ query, total, hasMore, substances:[{bdsId, preferredName, matchedName, matchedNameType, otherNameTypes:[…], coverage, ddinterIds:[…], keyCodes:{atc:[…], rxcui:[…]}, approvedProductCount}], products:[{conceptId, tradeName, darNumber, company, dosageForm, genericContentRaw, clinicalDrug:{bdcId, displayName}, matchedOn:"trade_name"\|"dar"\|"generic"\|"substance", matchedName, status:"approved"} \| {conceptId, tradeName, status:"not_reviewed", hidden:true}], suggestion: string\|null }` | Search with synonyms and DAR, stubs, counts, "Search for warfarin" |
| P5/P6/P7/P15 | `GET /v1/products/{id}` (extended) | as today | approved: `Product` plus `verification:{status:"approved", role:"pharmacist", approvedAt}`, `provenance:{batchId, extractedAt, source:"DGDA register", stages:[{stage, status, notes:[StageNote], textMissing:[TextMissingPair]}]}`, `clinicalDrug.ingredients[].summary: IngredientSummary`, `otherBrandsCount`. Hidden (every non-public state): `{conceptId, tradeName, status:"not_reviewed"\|"removed", batchId, hidden:true}`. The internal `reviewStatus` is no longer sent, so no product response names `issue` (the one coarse signal is `exampleUsable`, below). | Verification line, "Where this record comes from", codes and counts on the product page, stub batch sentence |
| P10 | `GET /v1/products/{id}/interactions` | none | a `CheckResult` (below) for `{id}` against the other **public** products of its latest batch. Public scope: when `{id}` itself is not public, the product stub (as `GET /v1/products/{id}`), never a result; 404 for an unknown id. | "With the other medicines in batch …" |
| P8 | `GET /v1/clinical-drugs/{bdcId}` | none | `{bdcId, displayName, doseForm, route, ingredients:[{bdsId, name, strengthValue, strengthUnit, perValue, perUnit}], products:[{conceptId, tradeName, company, darNumber}]}`. Public scope: `products` lists public products only, and the whole response is 404 `NOT_FOUND` unless at least one public product maps to `bdcId`. | "Other brands of …" |
| P9 | `GET /v1/substances/{bdsId}/interactions` | `severity` (optional), `page` (0–), `size=20` | `{bdsId, counts:{…per entry}, total, page, items:[{partnerName, partnerBdsId\|null, ddinterA, ddinterB, routeScope, severity, actions, interaction, management}]}`. Public scope: when the substance is not public, the substance stub `{bdsId, preferredName, hidden:true}`, never items or counts; `partnerBdsId` is `null` when the partner substance is not public (the partner's DDInter name is DDInter's own public data and stays). | Substance page list with text |
| P16 | `GET /v1/products/suggest` | `q` (2–100), `exclude` (0–20 concept ids already selected; excluded from the rows) | at most 10 `{conceptId, tradeName, dosageForm, status:"approved"\|"not_reviewed", clinicalDisplayName\|null, matched\|null}`. Unapproved rows match on trade name and DAR only. | Checker combobox |
| new | `GET /v1/stats` | none | `{registerProducts:39196, productsLoaded, substances, approvedProducts, inReviewProducts, batches:[{batchId, status, itemCount, approved, items:[{conceptId, tradeName, status:"approved"\|"not_reviewed", exampleUsable}]}]}`. `exampleUsable` is false when the item's `displayStatus` is `issue` or it is removed from the batch file; Learn uses it to withdraw frozen examples (§6.8). **Decision: this is a deliberate, coarse public signal.** Learn's withdrawn block is itself visible, so a reader can tell that a pilot record is "withdrawn from examples" (issue reported, or removed, which the stub already says). It carries no note, role, time or reason, the item's `status` stays `not_reviewed`, and `/v1/stats` carries no other review detail. | Landing and Learn live numbers |

**Search rules:**

- matches `lower(trade_name)` LIKE `%q%`;
- `dar_number` prefix;
- `generic_content_raw` (approved products only);
- `curated.substance_name.name` and `substance.preferred_name` (substances visible publicly once one of their products is approved);
- `%`, `_` and `\` are escaped as today.
- **Suggestion (Decision: no schema change).** Computed only when `total = 0`. The API keeps an in-memory name index (publicly visible trade names, substance names and synonyms), refreshed every 5 minutes. It returns the single closest name with Damerau–Levenshtein distance 2 or less, for queries of 5 or more characters, otherwise `null`. **Before returning a candidate, the API re-checks with one query that the record behind the name is still public** (§7.4 visibility rule), and drops it otherwise, so a record that went back into review in the last 5 minutes never leaks a substance name through a suggestion. `GET /v1/products/suggest` reads the database directly on each call, so its statuses are always current.

**`POST /v1/interactions/check` (extended `CheckResult`):**

```
{ summary: { medicines, totalPairs, checkedPairs, alertPairs, noInteractionPairs, notCheckedPairs, notReviewed,
             bySeverity: { major, moderate, minor, unknown } },
  products: [ { conceptId, tradeName,
                substances: [ { bdsId|null, name, coverage,
                                ddinter: [ { ddinterId, name, routeScope, routeAssumed } ] } ] } ],   // chosen entries (Chloramphenicol fix)
  alerts: [ { severity, a: Side, b: Side, actions, interaction, management, routeAssumed,
              ddinterA, ddinterB, interactionId, source: "DDInter 2.0" } ],                           // P11
  noInteraction: [ { a: Side, b: Side, ddinterA, ddinterB } ],                                      // P12: checked, none listed
  notChecked: [ { a: Side, b: Side, reason: "no_data"|"not_run"|"no_route"|"unmapped"|"same_product" } ],  // P12, P14
  duplicates: [ { bdsId, name, conceptIds } ],
  noData: [ { conceptId, bdsId|null, name } ],                                                      // kept for compatibility
  notReviewed: [ { conceptId, tradeName } ] }                                                       // P13
Side = { conceptId, tradeName, bdsId, name, routeScope }
```

- A pair is "checked" only when both chosen entries have a `curated.ddinter_drug` row. The ETL writes that row in the same savepoint as the entry's full pair list, reconciled against DDInter's `interact-with` list (§8.1 item 5).
- `summary.totalPairs`, `checkedPairs`, `alertPairs`, `noInteractionPairs` and `notCheckedPairs` follow §6.7.2 rule 5: same-product (`notChecked` reason `same_product`) and same-BDS (`duplicates`) pairs are not counted. `summary.medicines` counts every selected product, `notReviewed` included.
- Validation stays as today: 2–20 unique ids; 404 for an unknown id.

### 7.5 Flags and audit

- `GET /v1/flags?status=&targetType=&targetId=&page=&size=50` (R15). The 500 cap is replaced by paging.
- `POST /v1/audit-events` (token):
  - body `{ event, actorEmail?, actorRole?, targetType?, targetId?, outcome, requestId }`;
  - `event` is restricted to the list in §5.15;
  - returns 201.

### 7.6 Schema change: `V6__item_snapshot_and_audit.sql` (unavoidable; follows the lock policy)

There are two needs that no existing table can meet:

- **"See what changed" and the Back-in-review reason (R7, R8).** A run deletes `ops.stage_result` and overwrites curated rows, so the previous state is gone.
- **The healthcare-data audit trail** (a standing constraint). Docker logs rotate, so they are not an audit trail.

```sql
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

- The migration is purely additive. Existing rows are untouched.
- **Why the snapshot FK stays NO ACTION.** A snapshot must never disappear with its item, and the triggers forbid deleting it. So the ETL never deletes a batch item that has a snapshot: an item that leaves the batch file is kept and marked "removed from batch file" when it has a decision or a snapshot (§8.1 item 6). Without that rule a full batch re-run would fail on the FK.
- **Rollback**: drop both tables and `ops.reject_change()` (a new migration, per the lock policy). Nothing depends on them in V1–V5.
- **Append-only is tested**: an API integration test asserts that UPDATE, DELETE and TRUNCATE on both tables fail with `insufficient_privilege`. Only a reviewed migration that drops the triggers can change past rows.
- The PR must:
  - add the `db/migrations.lock` line;
  - explain the change under the four headings `database.md` requires;
  - update `docs/design/database.md` and the data model page;
  - tag `db-schema-v1.1`.
- **Retention (Decision)**: audit rows and snapshots are kept indefinitely. Both are append-only and small.

---

## 8. ETL fix: route-scoped DDInter selection

### 8.1 Change (in `$ETL/stages/ddinter.py`, `$ETL/ddinter/client.py`, `$ETL/load/batches.py` and `$ETL/jobs/run_pipeline.py`)

1. **`_plan`** reads each target product's route:
   ```sql
   SELECT cd.route FROM curated.brand_product bp
   LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
   WHERE bp.concept_id = %s
   ```
   NULL means the route is unknown.
2. **Add `choose(entries, route) -> (chosen, assumed)`**, a Python twin of `RouteRule.choose`:
   - entries whose `route_scope == route`, with `assumed=False`;
   - otherwise entries scoped `systemic` or `any`, with `assumed=True`;
   - otherwise `([], False)`.
   - Chosen ids are sorted by the numeric part.
3. **`_process`**:
   - **Unchanged** (apart from the reconciliation in item 5): mapping, coverage, and `_store_id_data` for **all** candidate entries. These are shared substance facts; a future chloramphenicol capsule needs `DDInter351`.
   - `text_missing` keeps only pairs where one side is a **chosen** id of this product and the other side is a chosen id of an in-scope product (this batch, or a previously mapped product, using that product's own route).
   - `pair_count` counts pairs of the chosen ids.
   - Evidence adds `route`, `chosen` and `route_assumed`.
   - When `assumed`: add the note `DDInter route assumed: {id} ({scope}) used for {route}` (one per chosen id). When the route is NULL, the note reads `DDInter route assumed: {id} ({scope}) used for unknown route`, and evidence `route` is null. Python's `None` is never printed.
   - When entries exist but none fits the route: add the note `No DDInter entry for route {route}`, or `No DDInter entry for unknown route` when the route is NULL.
   - The route notes never match `DDInter text not found for …`, never contain `"; "`, and set stage status `warn`.
4. **Snapshots (V6).** Every code path that writes `extracted_at` (`_upsert_items` in the dgda stage, `reopen_review` in the later stages, and `_reopen_dependents`) also inserts one `ops.item_snapshot` row per stamped item, in the same transaction, after that stage's results are written (for the dgda stage, in `run_batch` and `run_batch_items` after `write_stage_results`):
   - `run_id`: one UUID generated per ETL invocation in `run_pipeline.main()` and passed down, so the up to four stamps of one run share it (§5.6.5);
   - `reason`: `shared_change` from `_reopen_dependents`; otherwise `run` when no earlier snapshot exists for (batch, concept), and `rerun` when one does;
   - `payload` holds the keys the API diff reads: brand fields, clinical drug, ingredients with codes and chosen entries, stage statuses and notes.
5. **Pair-list reconciliation (`_process` and the client).** "No interaction listed" (§6.7.2) relies on the stored pair list being complete, and the graph endpoint alone is not: the repository's fixture notes record 934 graph interactions for `DDInter1951` against 936 rows in `interact-with`. For each entry it stores, the stage reads `interact_with_map` (already paged in full and memoised) as well as the graph:
   - the stored partner set is the union of both;
   - a partner present only in `interact-with` is stored as a `ddinter_pair` row with its `drug_name` as the partner name, severity from the row's `level` through the existing `severity()` helper (no level gives `unknown`), and empty actions;
   - if `interact-with` cannot be read in full for an entry (a page fails, or the rows read differ from `recordsTotal`), no `curated.ddinter_drug` or pair rows for that entry are written in this run (an earlier complete list, if any, stays), and every product that chose it gets stage status `fail` with the note `DDInter pair list incomplete for {id}`. An entry that has never had a complete list has no `ddinter_drug` row, so its pairs are never "checked" (§7.4); and the records of this run that chose it cannot be approved until a re-run succeeds (§7.2 step 5).
6. **Removed items keep their snapshots (`_upsert_batch`).** An item that leaves the batch file is deleted only when it has no `ops.review_decision` row **and** no `ops.item_snapshot` row (`AND NOT EXISTS (SELECT 1 FROM ops.item_snapshot s WHERE s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id)`). Any other removed item is kept and marked "removed from batch file", as items with decisions are today (§7.6).

### 8.2 API alignment

- `PilotSeed.java`: move the fake warfarin pair from `DDInter1951/DDInter352` to `DDInter1951/DDInter351`, as in real DDInter.
- RouteRule is unchanged. There is **no** fallback to systemic when the exact entry exists but has no pair. That fallback would bring back the "false alerts" risk the design document calls out.

### 8.3 Re-run procedure and what it does to review state

Run this before the pharmacist's first sitting (phase 0, §12), after the P0 images are deployed (§12.4). It is non-interactive, and uses the same invocation as `.github/workflows/load-dgda.yml`, on the host, which has no git checkout and the `docker-compose` binary:

```
cd ~/drugdb/deploy && docker-compose --profile jobs run --rm etl --batch /app/batches/0001-pilot.txt --stages ddinter
```

P0 also adds an optional `stages` input to `load-dgda.yml` (passed as `--stages`, validated against `dgda,substances,clinical,ddinter`), so the re-run can be started from GitHub Actions instead of a shell on the host.

- The DDInter stage re-processes all 10 items. For each chunk, `reopen_review(batch, chunk, changes)`:
  - re-stamps `extracted_at` (`clock_timestamp()`);
  - resets `review` to `pending`;
  - sets the batch to `in_review`;
  - writes the snapshot.
- **Effect on approvals:**
  - Any decision made at or before the new stamp stops counting.
  - A record that was `approved` becomes `back_in_review` (§5.2). It leaves public view until a pharmacist approves it again.
  - A record with an `issue` returns to `pending` ("Not yet reviewed by a pharmacist").
  - Because the route fix changes no shared rows (`SharedChanges` stays empty), no other product is re-opened.
- **Today** no pilot record is approved, so the re-run changes no public view. It does replace the stage notes, giving the §1.6 item 7 triage.
- Any reviewer page open during the run turns stale within 20 s (§5.11).
- **Later re-runs** (other batches) use the same mechanism. Re-run only the affected items with `--concept ID`, where possible, to avoid re-opening approved records needlessly.

---

## 9. Security and privacy

### 9.1 Server rendering and the internal API

- Unchanged:
  - `api` and `db` are only on the `internal` Docker network, and no host ports are published;
  - `web` is the only service on `edge`;
  - `lib/api.ts`, session, reviewers, Turnstile and action modules are `server-only`;
  - the postbuild secret scan stays.
- **Added**: the client-island allowlist check (§4.2).
- `INTERNAL_API_TOKEN` stays at 32 or more characters on both sides. The web falls back to public scope when it is missing (existing).

### 9.2 Bot protection

| Surface | Protection |
|---|---|
| Review decisions and reports | Turnstile `action=decision` (one widget per desk), session role, server re-check |
| Flags (problem reports) | Turnstile `action=flag` |
| Resolve flag | Turnstile `action=resolve` (one shared `TurnstileField` on `/review/flags`) |
| Partner request | Turnstile `action=partner` |
| Sign-in (`POST /api/session`) | Turnstile `action=signin` (**new**), plus the fresh Firebase token (5 min `auth_time`), a verified email, and a JSON-only POST |
| Reads | Rate limits (§9.3), a public search page cap (§6.3), no bulk endpoints, `noindex` (header and metadata), `robots.txt` with `Disallow: /` while the site is in pilot |

`verifyTurnstile` adds checks that the siteverify `action` equals the expected action and that `hostname` equals `SITE_HOST` (new env, `drugdb.eliooo.org`). It still fails closed.

- **Cloudflare test keys (e2e only).** Today `verifyTurnstile` refuses the test secret whenever `NODE_ENV=production`, and the e2e suite runs the production build. Cloudflare's test secrets answer with a fixed `hostname` and an empty `action`, so the new checks would fail every e2e write and sign-in. **Decision:** when `INTELLIDRUGS_E2E=1` (§11.4) and the secret is one of Cloudflare's documented test secrets, `verifyTurnstile` accepts the test secret and skips the `action` and `hostname` comparison. In every other case both comparisons are required, and a test secret in production is refused as today. `turnstile.test.tsx` covers both branches. P1A confirms the test-key siteverify response against Cloudflare's documentation while writing this code.

### 9.3 Rate limits (in memory, single process; extends `middleware.ts`)

| Key | Limit | Over limit |
|---|---|---|
| Every non-static request, per IP (existing) | 10/s, burst 30 | 429 "Too many requests. Please slow down." `Retry-After: 1` |
| Anonymous page requests, per IP per day (**new**) | 50,000. Clinics, hospitals and mobile carriers in Bangladesh put many people behind one NAT address, so the cap is set to stop bulk scraping only. | 429, same copy, `Retry-After` = seconds until 00:00 Dhaka |
| Signed-in page requests, per account (session email) per day (**new**) | 5,000 | 429, same copy, `Retry-After` = seconds until 00:00 Dhaka |
| `/check/suggest`, per IP | 5/s, burst 10 | 429, empty list |
| `/review/*/versions`, per account | 1 per 5 s, burst 3 | 429. The 20 s poll carries on unchanged. A 429 on the pre-commit call does not block the commit; the server's version guards decide (§5.11, §7.2). |
| `POST /api/session` and `POST /signout`, per IP, each route counted separately | 10 per 10 min | 429. The sign-in page shows "Too many sign-in attempts. Wait a few minutes and try again." |
| Decision and report actions, per account | 60 per minute | the action returns `rate_limited`. The desk shows the "not saved" network banner (§5.7), and a `decision_denied` audit event is written. |
| Flags, per account | 10 per hour | flag outcome `failed` |
| Partner requests, per account | 3 per day | flag outcome `failed` |

- The IP is the first `X-Forwarded-For` entry, set by Caddy (existing).
- **"Per account" keys use the session's email** (lower-cased, hashed with SHA-256 in memory, never logged), not the session id, so signing in again does not reset a limit.

### 9.4 CSP and headers (`lib/csp.ts`, now nonce-based; built per request in middleware)

```
default-src 'self';
script-src 'self' 'nonce-{nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://apis.google.com https://www.gstatic.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;
frame-src 'self' https://challenges.cloudflare.com[ https://{authDomain}];
frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
```

- `frame-src` keeps today's `buildCsp(authDomain)` behaviour (the bracketed part above): it also lists `https://{NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}` when that host is not `SITE_HOST`, so an image built with `<project>.firebaseapp.com` still signs in with the popup.
- **`'unsafe-inline'` is removed from `script-src` (Decision).** The middleware generates a 128-bit nonce per request and builds the policy. It sets the policy on the **request** headers as `content-security-policy`, which is where Next reads the nonce to apply it to its own scripts, and on the response. It also sets `x-nonce` on the request headers for app code: the root layout reads it with `headers()` and passes it to Cloudflare's Turnstile `<script nonce>` (§5.8.6) and to any `next/script`.
- **Existing scripts get the nonce.** Under `'strict-dynamic'` the host allowlist is ignored, so a `<script>` without the nonce does not run. P1A updates `components/Turnstile.tsx` (used today by `FlagForm`, `/flags` and `/batches/[id]`) and every other remaining `<script>` to read `x-nonce` and pass `nonce`, so those forms keep working until P1B and P2 replace them. A P1A component test asserts that the flag form's Turnstile script carries the nonce.
- **The static CSP goes.** P1A removes the `Content-Security-Policy` entry from `next.config.ts` `headers()`, so the middleware's per-request policy is the only one. The `headers()` rule that sets `X-Frame-Options: DENY` is scoped to exclude `/__/auth/:path*` (`source: "/((?!__/auth/).*)"`), and a separate `headers()` rule sets the §9.5 header set on `/__/auth/:path*`. The middleware does not set the app CSP on `/__/auth/*` (it still applies the per-IP rate limit).
- **Request id.** The middleware also sets `x-request-id = crypto.randomUUID()` on the request headers. Server code reads it with `headers()`, logs it, and sends it as `requestId` in `POST /v1/audit-events` (§5.15).
- `style-src 'unsafe-inline'` stays, for React style attributes on meters.
- The host list stays as a fallback for browsers without `'strict-dynamic'`.
- The other headers are unchanged: `X-Robots-Tag`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, and HSTS from Caddy.
- Add `Cache-Control: private, no-store` to every response that depends on the session.

### 9.5 Sign-in transport

- Popup flow as today.
- **"Continue in this tab"**: `signInWithRedirect`, with `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=drugdb.eliooo.org`.
  - The Next `rewrites()` proxy `/__/auth/:path*` to `https://{FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/:path*`. This is Firebase's documented "proxy auth requests" option.
  - `/__/auth/*` gets its own header set, because the proxied handler page must run Firebase's scripts and is framed by our own pages: `Content-Security-Policy: frame-ancestors 'self'` (no `script-src`), `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`. Only the app's `script-src` and `X-Frame-Options: DENY` are dropped there.
  - Caddy needs no change.
  - Firebase's proxy option also needs `https://drugdb.eliooo.org/__/auth/handler` in the Google OAuth client's authorized redirect URIs, and the auth domain is baked into the web image at build time. The deploy steps are in §12.4.

### 9.6 Session

- **Decision**: the cookie becomes an **encrypted** JWT (JWE, `dir` + `A256GCM`, key from HKDF-SHA256 of `SESSION_SECRET`, info `intellidrugs-session-v1`). The email is no longer readable from the cookie.
- Payload: `{email, name, role, iat, exp}`. Valid for 8 h.
- Cookie name `__Host-intellidrugs_session` in production (HttpOnly, Secure, SameSite=Lax, Path=/, no Domain). In development it is `intellidrugs_session`.
- The old `bddrug_session` cookie is ignored and deleted on the first response.
- The role is re-checked against `REVIEWERS` on every read (existing). It can be lowered, never raised.
- A request with no cookie, or with an expired or unreadable one, has no session. Server actions answer it with the outcome `unauthenticated`, which the desk shows as the signed-out block (§5.7), never as `forbidden`.
- **Sign-out** is `POST /signout` (§2.1), a route handler, so it can set response headers. It requires an `Origin` header equal to `https://{SITE_HOST}` (403 otherwise), deletes the session cookie, sends `Clear-Site-Data: "storage"` (which removes `sessionStorage` note drafts, §5.10, and leaves cookies alone), writes the `sign_out` audit event, and answers 303 to `/`, or to `/signin?returnTo=…` when the form asks for it and the value passes `safeReturnTo()` (§6.2). `signOutAction` is removed, and so is `DELETE /api/session` (`app/api/session/route.ts` keeps `POST` only; `session-route.test.ts` asserts that `DELETE` answers 405), so every sign-out goes through the `Origin` check, the audit event and `Clear-Site-Data`.

### 9.7 Privacy

- **No PHI is requested.** No field asks for patient data, and a checker selection is a list of products in the URL. It is not logged (route template only), not stored, and not persisted in the browser.
- **Free text could still carry PHI**, because three fields take free text that is stored and shown to the team: the reviewer note (`review_decision.note`, shown to every reviewer), "Report a problem" (`flag.message`) and "What you will build" (`flag.message`). Each carries `NO_PHI_HELP` (§3.6) under its label. None of these texts is ever logged or written to `audit_event`.
- Emails:
  - stored for the team only, in `review_decision`, `flag` and `audit_event`;
  - never in public responses, never in logs;
  - shown only to their owner (account menu, the reader welcome state, and the "not on the reviewer list" banner).
- `/privacy` states this, in the words of the sign-in card plus the audit-trail paragraph: "Each reviewer decision and sign-in is recorded with the account and time, for the team's audit trail. These records are never public." It adds: "Don't include patient names or other personal health details in notes, reports or requests. We don't ask for patient information."

### 9.8 Infrastructure identifiers (Decision)

User-facing strings change to IntelliDrugs. These stay unchanged, to avoid recreating containers or volumes on the shared host:

- the compose project `bddrug`;
- image names, the volume `dbdata`, the Caddy alias `bddrug-web`;
- the database name;
- the Java package and the ETL package.

The package name in `web/package.json` becomes `intellidrugs-web`, and the Firebase app name becomes `intellidrugs-session`.

---

## 10. Accessibility and performance

### 10.1 Keyboard and focus

- Every action is reachable by keyboard. The workspace keyboard model is in §5.14.
- Focus is always visible: `:focus-visible` 2 px `--focus`. On the selected accent row, the ring is `--on-accent` with an accent halo (tokens.css).
- After any re-render or navigation, focus is restored to the same control (`data-fk`), otherwise to the workspace region, never to `<body>`.
- Dialogs and drawers trap or `inert` the background and return focus on close.
- Skip links:
  - "Skip to content" on every public page and in Learn;
  - in the desk, "Skip to record" and "Skip to decision bar".

### 10.2 Live-region announcement policy

- One polite, `sr-only` live region per page (`aria-live="polite"`, `aria-atomic="true"`).
- Messages are set by clearing the region and writing after 60 ms.
- No assertive regions. No per-second countdowns. No announcement for background list refreshes.
- **Timing (WCAG 2.2.1).** The only time limit in the product is the undo window, and each reviewer can lengthen it to 20 or 60 seconds (§5.8.1). Single-key shortcuts can be turned off (WCAG 2.1.4; §5.14).
- Banners added after load use the same live region.
- The announcement texts are exactly those in §5 and §6.7.

### 10.3 Motion and transparency preferences

These come from `tokens.css`:

- **Reduced motion**: 1 ms transitions, a static spinner, and a full countdown bar plus the words "Saves in {n} seconds" (n = the undo window, §5.8.1).
- **Reduced transparency** and **increased contrast**: solid `--material-solid`.
- **Forced colours**: the rules in `tokens.css`. The Playwright suite runs the desk with `forcedColors: "active"` and checks that the selected row, the pills and the chips stay distinguishable (snapshot review).

### 10.4 Reflow and target size

- Public pages: no two-dimensional scrolling at 320 CSS px, except data tables in their own labelled, keyboard-scrollable regions (`tabindex="0"`, `role="region"`, `aria-label`).
- The desk is usable at 320 CSS px in single-column mode with no horizontal page scroll (WCAG 1.4.10; §5.1). Under 480 CSS px of viewport height the toolbar and decision bar stop being sticky, so nothing covers the focused element (WCAG 2.4.11).
- Sticky public and Learn toolbars set `scroll-padding-top` (§6.1, §6.8).
- Interactive targets are at least 24 × 24 px (WCAG 2.5.8). Primary decision buttons are 36 px.

### 10.5 Semantics

- One `<h1>` per page, with a heading order that has no skipped levels.
- Tables use `<th scope>` and a caption (sr-only where visual).
- Severity and status always carry words. Never colour alone.
- Every SVG diagram has `role="img"`, `<title>` and `<desc>`.
- `lang="en"` is set.
- Accessible authentication: Google sign-in with no cognitive test. Turnstile runs non-interactively first.

### 10.6 Performance budgets (gzip, measured in CI on the production build)

| Page | HTML | JS (all, incl. Next runtime) | CSS | Fonts | LCP (Slow 4G, mobile) |
|---|---|---|---|---|---|
| `/` | ≤ 30 KB | ≤ 130 KB | ≤ 20 KB | ≤ 90 KB (Onest var + Plex Mono 400) | ≤ 2.5 s |
| `/search`, `/products/[id]`, `/substances/[id]` | ≤ 50 KB | ≤ 130 KB | ≤ 20 KB | same | ≤ 2.5 s |
| `/check` | ≤ 50 KB | ≤ 145 KB | ≤ 20 KB | same | ≤ 2.5 s |
| `/learn/[chapter]` | ≤ 60 KB | ≤ 140 KB | ≤ 25 KB | same | ≤ 2.5 s |
| `/review/[b]/[c]` (laptop, broadband) | ≤ 80 KB | ≤ 200 KB | ≤ 25 KB | same | ≤ 1.5 s; J/K to next record painted ≤ 300 ms with prefetch |

- Server: API p95 ≤ 300 ms per call (existing target). Page TTFB p75 ≤ 600 ms.
- The web container stays at `mem_limit 256m`.
- Images: none except SVG.
- Third-party requests: Turnstile only on pages with a write form; Firebase SDK only after "Continue with Google" is clicked (lazy, as today).

---

## 11. Testing strategy

### 11.1 Unit tests (vitest, `web/tests`)

| Area | File | Pins |
|---|---|---|
| Relations | `relations.test.ts` | Every rule in §5.5.2 on all 10 pilot records (fixtures from the pilot). Napa substance = Normalised "Paracetamol kept as the DGDA name"; G Warfarin = Salt removed "Removed: Sodium"; Chloramphenicol strength = Normalised "Written as 5 mg per 1 ml"; combination generic = "Both ingredients and strengths found"; capitalisation-only cases; Differs cases. |
| Commit machine | `commit-machine.test.ts` | Fake monotonic clock (`performance.now()`); a wall-clock jump does not shorten the window. Deadlines for undo windows of 8, 20 and 60 s, and the fallback to 8 for a bad cookie value. Undo. A second A while armed. U while `committing` keeps committing and shows the "Too late to undo" hint; the toast drops Undo on DEADLINE. Stale cancels. Unload discards (no send). A while the token is refreshing goes to `awaitingToken`, then arms on TOKEN; error-callback or 10 s goes to bot hold. Captcha at commit, then retry sends without a new window. Bot hold before arming, then retry arms a new window. 429 or `rate_limited` gives `saved:"no"`; network, 5xx and timeout give `saved:"unknown"`; Try again resends the same `requestId` and `viewedVersion`, and a `replayed` 200 gives the normal saved state. While unconfirmed, a changed `lastDecisionId` does not mark the record stale. Forbidden versus unauthenticated. 409 field mapping, including `stages`. **Own save**: OK (and a replayed OK) sets that record's `viewedVersion` to `Outcome.version`, so a later poll carrying the new `lastDecisionId` does not mark it stale, after A and after R, on the open record and on another record. **The refresh race**: other rows change, the open record is re-stamped before `router.refresh()` lands, and the island goes stale, keeps the `viewedVersion` subtree and sends `viewedVersion`. The 1000 ms post-advance guard. |
| Auto-advance | `advance.test.ts` | Role-specific "needs" sets, wrap-around, filter reset, report-open stays, complete view. |
| Keyboard | `desk-keys.test.tsx` (`// @vitest-environment jsdom`, Testing Library; §11.4 adds the devDependencies) | Ignored while typing and with modifiers. Enter blocked on approve. Esc order. The sheet traps focus, and Tab cycles through its settings. A and R with the evidence drawer open do not arm or open and show "Close the evidence first (Esc)." With single-key shortcuts Off, A, U, R, J, K, E, S and ? do nothing, the key row and `aria-keyshortcuts` are gone, and Esc and Ctrl/Cmd+Enter still work. Listbox options contain no focusable link (`tabindex="-1"`). |
| Return path | `return-to.test.ts` | `safeReturnTo()` with every case in §6.2 step 4. |
| Desk settings | `desk-settings.test.ts` | `intellidrugs-undo` 8, 20, 60 and fallback; `intellidrugs-keys` on, off and fallback; the promise and toast strings for each undo value. |
| Formatting | `format.test.ts` | `fmtUtc`, `fmtDhaka`, `fmtDhakaTime`, `fmtDhakaOn` around midnight UTC and around the date line (21:27 UTC = 03:27 next day Dhaka). |
| Copy | `copy.test.ts` | Each §3.6 constant equals its literal, including `NO_PHI_HELP`, `NOT_RUN` and `UNKNOWN_PAIRS_LINE`. `NO_PHI_HELP` is rendered under the reviewer note, "Report a problem" and "What you will build", and appears in the `/privacy` text. A repository grep finds no paraphrase or shortening of the safety sentences named in §3.6 (for example "No interactions", "No interaction data in DDInter 2.0", "low risk" outside the allowed sentences, "no data" in green markup), outside the allowed short forms named there. The search substance hit with coverage `none` renders `NO_DATA_SENTENCE` in full. New copy (§1.7) lives in `$WEB/lib/copy.ts` as `NEW_COPY: Record<NewCopyState, Record<string, string>>`; the test asserts that the `NewCopyState` keys equal the rows of the §1.7 table (copied into the test as a list) and that page modules import those strings rather than retyping them. |
| Tokens | `tokens.test.ts` | `web/styles/tokens.css` SHA-256 equals the docs copy. A recomputed contrast table matches §1.4 S4 (126/126, lowest 4.69 light and 5.18 dark; boundaries 3.33 and 3.20). |
| Islands | `client-islands.test.ts` | The `"use client"` allowlist (§4.2). |
| Checker formatting | `check-summary.test.ts` | The summary sentence and plurals for the API result shapes in §7.4. A single combination product plus one other product: same-product pairs are not counted and the no-data wording still applies. Two products with the same BDS: the duplicate is not counted and appears only under "Same substance in more than one product". `{m}` includes not-reviewed medicines. The "Not checked {nd}" chip counts only `no_data`; other reasons show "Other not checked {other}" unhatched. |
| Learn snapshot | `learn-snapshot.test.ts` | Counts are consistent; the 28-pair totals (§1.6 item 5) and the chapter 6 and glossary counts (§1.6 item 11); every snapshot-only value listed in §6.8 is present and dated. |

### 11.2 Component tests (server components)

`renderToStaticMarkup`, as the current suite does, with `@/lib/api` mocked:

- every `ui/` component and its states;
- the stub page;
- the product page (approved and multi-ingredient), including an ingredient with coverage `none` (a `NoDataBlock`, the Codes table's DDInter row as `NoDataChip("No data")`, and no "0 drug–drug pairs" anywhere) and an ingredient with no entry for its route (the "No DDInter entry for this product's route" line, no count, and no hatch or `NoDataChip` anywhere in its Codes table);
- the search page's substance hit for each coverage (`full`, `none` with `NO_DATA_SENTENCE` in full, `not_run`);
- Learn chapter 8: both example bodies match the §7.4 shapes (no `reviewStatus`; `notReviewed[]` with `tradeName`); the `/learn/start` hero is the only `<h1>` "Learn IntelliDrugs";
- `/review` and `/review/flags` (§5.16), including their empty states;
- the landing hero card while the hero product is not approved (trade name and `NOT_REVIEWED` only; the card's HTML contains no `genericContentRaw`, company, DAR number, dosage form, clinical drug, code or count, and its `aria-label` has no "Example") and once approved, at desktop width and below 480 px;
- the removed-record stub;
- the Learn snapshot block withdrawn when `exampleUsable` is false;
- the checker result sections (each reason, including `not_run`), and the 20-medicine maximum (input `aria-disabled` and `readonly`, help text);
- the review record page (each display status, stale banner, back card, no-data ingredient, not-run ingredient, eye drop with chosen `DDInter352`, failed-stage promise, signed-out block, both network banner variants);
- the no-JavaScript confirm page (implicit Turnstile widget; Confirm posts the URL's version; stale version renders `STALE_TITLE` and no Confirm);
- the sign-in states;
- the not-authorised page.

The existing 228 tests are updated where copy or routes change. None is deleted without a replacement.

### 11.3 API (JUnit) and ETL (pytest)

**API:**

- `RouteRuleTest.exactEntryWinsEvenWithoutPairs`.
- `CheckApiIntegrationTest`:
  - eye drops + warfarin: `alerts` empty, chloramphenicol not in `noData`, `products[].substances[].ddinter` = `DDInter352`, `routeAssumed=false`, the pair is in `noInteraction`;
  - capsule + warfarin: one moderate alert;
  - same-product, no-route and `not_run` reasons (a substance with no coverage row is `not_run`, never `no_data`); an ingredient with no BDS is `unmapped`;
  - counts exclude same-product and duplicate pairs (§6.7.2 rule 5); `summary.medicines` includes not-reviewed products;
  - `notReviewed[].tradeName`.
- `InteractionCheckServiceTest`: the same as unit tests.
- `ReviewApiIntegrationTest`:
  - 409 `lastDecisionId`;
  - 409 `review` (issue open, already approved, engineer already checked);
  - 409 `conceptId` (removed);
  - 409 `stages` for `ok` on an item with a failed stage, a missing stage, or no run stamp; `issue` on the same item is accepted;
  - `IS DISTINCT FROM` on both version fields (`null` = `null` passes; `null` against a stamp is 409);
  - idempotency: a repeated `requestId` returns 200 `replayed:true` and writes nothing; a repeated `requestId` for another item is 400 `field=requestId`; a missing `requestId` is 400;
  - `Outcome.version`;
  - `displayStatus` for all five states, including back in review after a re-stamp, and a pipeline-set `issue` (not found at source) that is `pending` with a 409 `stages` on `ok`;
  - a 409 and a 400 each leave exactly one `decision_rejected` row (written in its own transaction).
- **Existing API tests that A1 and §7.2 break, updated in P0:**
  - `BatchReportApiIntegrationTest` and `ProductApiIntegrationTest`: batch reads send the token, and each asserts 401 without it;
  - `ReviewApiIntegrationTest`: the seed adds four `ok` `ops.stage_result` rows per item; the `decide()` helper sends `expectedLastDecisionId` (from the batch read) and a fresh `requestId`; the tokenless reads send the token; `anItemWithNoRunStampAcceptsOnlyAnExplicitNull` is rewritten to expect 409 `stages` for `ok` and 201 for `issue`; `decisionHistoryIsNewestFirstWithRoleOnlyUnlessTokenGiven` is rewritten to expect 401 without the token; `issueAfterOkIsIssueAndOnlyAPharmacistClearsIt` is replaced by the step-6 test (§7.2);
  - `ApprovalRuleTest.okAfterIssueNeedsAPharmacist` is replaced by the step-6 test (§7.2).
- `ReviewQueryIntegrationTest`: items, versions, filters, structured notes (including a fail note containing `"; "` kept whole), `textMissing` enrichment, `batchPairs` with RouteRule, `mine`, diff 404 and 200.
- `VisibilityApiIntegrationTest`, a matrix (Decision; pins G3):
  - batches require the token (A1); hidden-stub fields; search stubs match trade name and DAR only;
  - **for every public endpoint**: `GET /v1/search`, `/v1/products/{id}`, `/v1/products/{id}/interactions`, `/v1/clinical-drugs/{bdcId}`, `/v1/substances/{bdsId}`, `/v1/substances/{bdsId}/interactions`, `/v1/products/suggest`, `/v1/stats` and `POST /v1/interactions/check`, all with public scope;
  - **with fixtures in each non-public state**: `pending`, `engineer_checked`, `issue`, `back_in_review`, and approved-then-removed from the batch file;
  - **asserts** that no clinical drug, substance, code, strength, severity, count or DDInter text of the non-public record appears in any response, that `partnerBdsId` is null for non-public partners, that `/v1/clinical-drugs/{bdcId}` is 404 when no public product maps to it, and that the stub never carries `reviewStatus`.
- `AuditAppendOnlyIntegrationTest`: UPDATE, DELETE and TRUNCATE on `ops.audit_event` and `ops.item_snapshot` fail (§7.6).
- `SearchApiIntegrationTest`: "paracetamol" finds Napa through the DGDA name; "acetaminophen" finds Napa; a DAR prefix; the suggestion for "warfrin"; no suggestion is returned for a name whose record left public view after the last index refresh.
- `PilotSeed` fix (§8.2).

**ETL** (`etl/tests/test_stage_ddinter.py`):

- `test_eye_drop_note_uses_ophthalmic_entry`
- `test_capsule_note_uses_systemic_entry`
- `test_no_clinical_drug_falls_back_to_systemic_assumed`
- `test_only_other_route_entry_notes_no_route_entry`
- `test_text_missing_requires_partner_chosen_in_scope`
- `test_note_formats` also covers a NULL route (`… used for unknown route`, `No DDInter entry for unknown route`; never `None`)
- `test_snapshot_written_on_stamp` (reasons `run`, `rerun`, `shared_change`; a full run writes one snapshot per stage with one shared `run_id`; the dgda stage writes one from `_upsert_items`)
- `test_graph_and_interact_with_partner_sets_reconciled` (a partner only in `interact-with` is stored with its level's severity; an incomplete `interact-with` read fails the stage with `DDInter pair list incomplete for {id}` and writes no `ddinter_drug` row)

**ETL** (`etl/tests/test_batches.py`):

- `test_removed_item_without_decisions_is_deleted_with_its_stage_results` becomes "without decisions or snapshots" (the fixture item has no snapshot);
- `test_removed_item_with_snapshot_is_kept_and_marked` (new): an item with a snapshot and no decision is kept and marked "removed from batch file", and the run does not fail.
- Regression fixture: `DDInter352` with 112 rows and no pilot partner; asserts that the pairs are stored and that no text fetch happens.

### 11.4 End-to-end (Playwright, `web/e2e`)

- **Environment.** `deploy/docker-compose.yml` cannot start in CI as it is (it needs GHCR images tagged `${IMAGE_TAG}` and the external `n8n_edge` network). P1A adds `deploy/docker-compose.ci.yml`, an override with `build:` contexts for `api` and `web`, `edge` as a non-external network, and the e2e environment; and a new `e2e` job in `.github/workflows/ci.yml` that runs Playwright, axe and Lighthouse CI. P1A adds `jsdom`, `@testing-library/react`, `@playwright/test`, `@axe-core/playwright` and `@lhci/cli` to the web devDependencies; DOM unit tests start with `// @vitest-environment jsdom` (the default stays `node`). CI starts `db`, `flyway`, `api` and `web` from the two compose files with the pilot seed:
  - `web` runs the production build with `INTELLIDRUGS_E2E=1`, which allows Cloudflare's documented always-pass test keys;
  - `instrumentation.ts` refuses to start when `INTELLIDRUGS_E2E=1` is set together with `SITE_HOST=drugdb.eliooo.org`;
  - a CI test asserts that `deploy/docker-compose.yml` never sets `INTELLIDRUGS_E2E` (only `docker-compose.ci.yml` does);
  - sessions are minted by the test, which writes the encrypted cookie with the test `SESSION_SECRET`. There is no Google in e2e.
- **Review flow (pharmacist)**:
  - open `/review` → record 1;
  - J and K, filters, search;
  - A, check the toast and announcement text, U undo;
  - A, wait 8 s, check the saved announcement, the advance and the 1 s guard;
  - Enter on the button does not approve;
  - R with a 4-character note shows the error; then send;
  - own save never stale: R (send) then wait 25 s, and no stale banner appears; the same after an A commits;
  - E drawer focus; ? sheet trap;
  - stale: the test bumps `extracted_at` in the DB, and the banner appears within 25 s, cancels an open window and pauses the bar; Reload clears it;
  - refresh race: the test changes another row and re-stamps the open record between the poll and the refresh (route intercept delays the refresh); the open record turns stale and the detail pane still shows the content it opened with;
  - session expiry: the test deletes the session cookie during an undo window; the commit shows the signed-out block, not the no-auth block;
  - lost response: a route intercept drops the first commit's response after the server saved it; the unconfirmed banner shows; Try again shows the saved state and the database holds one decision;
  - evidence drawer open: A shows "Close the evidence first (Esc)." and no toast appears;
  - undo window set to 60 s in the shortcuts sheet: the toast reads "Publishes in 60 seconds." and nothing is sent before 60 s;
  - single-key shortcuts Off: A does nothing; the "Looks correct" button still works;
  - no-JavaScript confirm: with the desk island blocked, Looks correct redirects to the confirm page; a re-stamp between the two POSTs shows `STALE_TITLE` and no Confirm;
  - another-reviewer stale: the test inserts a decision;
  - network failure (route intercept) then Try again;
  - captcha failure (test secret "always fail" key) then Retry check;
  - complete view after 10 approvals (test DB);
  - beforeunload prompt while armed.
- **Review flow (engineer)**: the promise copy, "Engineer checked" without publication, and the second A hint.
- **Not authorised**: `user` on `/review`; anonymous redirect.
- **Public scope for reviewers**: a pharmacist session on `/products/{unapprovedId}` renders the stub, and on `/check` lists that product under "Not yet reviewed by a pharmacist".
- **Sign-in return path**: `/signin?returnTo=/\evil.com` lands on `/signin?welcome=1`.
- **Sign-out**: drafts in `sessionStorage` are gone after `POST /signout`.
- **Checker**: combobox keyboard; add and remove announcements; Clear all moves focus to the "Add a medicine" input (never to `<body>`); summary sentence; Major first; the no-data block; "No interaction listed"; the eye drop "What was checked" names `DDInter352`; not reviewed listed by name; the no-JS GET flow (JavaScript disabled).
- **Public**: landing; search "paracetamol", "warfarin" (stub) and "warfrin" (suggestion); stub page; product page; sign-in state pages; partner form.
- **axe** (`@axe-core/playwright`, WCAG 2.2 AA tags) on every page and on these desk states: ready, armed, committing, stale, net error (not saved and unconfirmed), bot hold, no-auth, signed out, complete, loading, drawer, sheet (with settings), report error, shortcuts Off, and the no-JavaScript confirm page. Each in light, dark and forced colours.
- **Reflow** at 320 px (public and desk): no horizontal page scroll. At 1280×800 with 400% zoom (a 320×200 CSS px viewport) the focused element is never covered by the toolbar, the decision bar or the public and Learn toolbars, checked by tabbing through the desk, the product page and a Learn chapter. Learn below 860 px: the chapter nav is a sticky horizontal row and a focused heading is not covered by it.
- **Lighthouse CI**: §1.4 S5 and the §10.6 budgets.

### 11.5 Visual regression (optional, non-blocking)

Playwright screenshots of the §11.4 states at 1280 px and 320 px in light and dark, compared to approved baselines with a 0.1% pixel tolerance. A failure posts a CI artefact and a warning but does not block the merge.

---

## 12. Rollout

### 12.1 Phases

| Phase | Ships | Exit criteria |
|---|---|---|
| **0. Safety prerequisites** | ETL route fix (§8.1) and the pilot re-run (§8.3); API A1 and A2 and all of §7.2 (version, removed, checks, issue and duplicate guards, `requestId` idempotency); `PilotSeed` fix; V6 migration with the append-only triggers. **Current-web adjustments, so the existing app keeps working against the new API**: `/batches` and `/batches/[id]` render data only for pharmacist and engineer sessions (anonymous and `user` sessions get status 200 with "Only pharmacists and engineers can see batches.", new copy, so the deploy smoke check keeps passing) and call the API with the token; `GET /v1/batches/{id}` items gain `lastDecisionId`, which the existing review forms echo as `expectedLastDecisionId` together with a server-rendered `requestId`; public pages stop sending `scope=all` (§2.2). | S7 on production in phase 0: stage note OK, no alert, product page names `DDInter352`. The checker's own `products[].substances[].ddinter` naming is verified in P2 (§7.4); anonymous `GET /batches/0001-pilot` shows no unreviewed data; a pharmacist sees the stub on an unapproved product page; ReviewApiIntegrationTest and AuditAppendOnlyIntegrationTest green; schema PR approved and tagged `db-schema-v1.1` |
| **1. Reviewer workspace** | Design-system foundation (tokens, fonts, theming, `ui/` components, CSP nonce, JWE session, `/signout`, rate-limit keys, audit plumbing, `/healthz`, the e2e harness); the sign-in function (Turnstile on `/api/session`, `returnTo`); `/review/*` with all of §5, including the desk settings; the §7.3 endpoints (with coverage `not_run`); audit events; `/review` and `/review/flags` (§5.16); redirects for `/batches` and `/flags` | §11 unit, component and e2e review suites green; axe clean; S1 session run with the pharmacist on the live pilot |
| **2. Public surfaces** | Landing, search, product, stub (including removed), substance, checker, sign-in states, partners, privacy; §7.4 endpoints with the visibility rule; redirect `/?q=` | `VisibilityApiIntegrationTest` matrix green; S2, S3, S5 and S6 hold; licence lines confirmed (§13 Q1); no Example marker on any record data |
| **3. Learn** | Ten chapter routes, snapshot, glossary filter, rail | The Learn e2e suite and axe are green; the §1.6 corrections are present |

The pharmacist reviews the pilot in phase 1, on the workspace. The public site keeps its current pages (restyled only through the shared layout) until phase 2; only `/signin` gains the bot check, the return path and their error states in phase 1 (§12.2, P1A).

### 12.2 Implementation plans (Decision)

This spec is **not one implementation plan**. It is split into five plans, each written, reviewed and executed on its own, in this order. Each plan cites the sections it implements and may not change a Decision here without amending this spec first.

| Plan | Phase | Scope | Depends on |
|---|---|---|---|
| **P0 Safety prerequisites** | 0 | §8 (ETL route fix, pair-list reconciliation, snapshots, removed-item rule, re-run, the `stages` input of `load-dgda.yml`), §7.1, §7.2, §7.6, the phase-0 current-web adjustments in §12.1, and their §11.3 tests, including the updates to existing API and ETL tests | none |
| **P1A Foundation** | 1 | §3 (tokens, fonts, theming, `ui/` components, copy constants), §4 (islands allowlist and check), §9 (CSP nonce, `next.config.ts` header changes, nonce on `components/Turnstile.tsx`, request id, JWE session, `/signout` and the removal of `DELETE /api/session`, rate-limit keys, Turnstile action and hostname checks), §5.15 and §7.5 audit plumbing, `safeReturnTo()`, `/healthz`, the §12.4 environment and compose changes, and the e2e harness (§11.4 environment). **Sign-in function ships here**, together with the `/api/session` Turnstile check, so sign-in never breaks between plans: the SignInButton's `TurnstileField` (action `signin`), `turnstileToken` and `returnTo` (through `safeReturnTo()`) in the POST, and the `/signin` states "Bot check failed", "Session request failed" and "Too many sign-in attempts" (§6.2). | P0 |
| **P1B Reviewer workspace** | 1 | §5 entirely, §7.3, `/review` and `/review/flags` (§5.16), the `/batches` and `/flags` redirects, `docs/runbooks/reviewer-invite.md` (new), and the review parts of §11 | P1A |
| **P2 Public surfaces** | 2 | §6.1–§6.7, §6.9, §7.4, the `/?q=` redirect, `docs/runbooks/partner-requests.md` (new), and the public parts of §11. For sign-in, P2 adds only the visual card (§6.2 "Card") and the welcome states. | P1A (P1B not required) |
| **P3 Learn** | 3 | §6.8 and the §1.6 Learn corrections | P1A, and the §7.4 `/v1/stats` endpoint from P2 |

P1A may ship as its own release: it changes the shared layout, security and the sign-in function, and no other surface's behaviour. P1B and P2 each ship as one release (§12.3).

### 12.3 Feature flags

**Decision: no runtime feature flags.** Each phase is one release (an image tag) with its own redirects. This avoids a second code path for safety rules. Partially built surfaces are not deployed, and the branch model enforces it: every push to `main` that passes CI deploys at once (§12.4), so each plan's PRs merge into a `phase-N` integration branch (`phase-0`, `phase-1`, `phase-2`, `phase-3`), and only the phase-complete merge of that branch into `main` deploys. P0 and P1A are the exceptions that may merge to `main` on their own, because each is a complete release (§12.2).

### 12.4 Deploy without touching other services

- **Deploy is the existing `deploy` workflow** (`.github/workflows/deploy.yml`): on every push to `main` that passes CI, it builds and pushes the `bddrug-etl`, `bddrug-api` and `bddrug-web` images, copies `deploy/docker-compose.yml`, `db/migrations` and `batches` to `/home/ec2-user/drugdb` (the host has no git checkout), sets `IMAGE_TAG`, and runs `docker-compose up -d --remove-orphans` in `/home/ec2-user/drugdb/deploy`. Flyway runs first through `depends_on`, and V6 is additive. There is no separate manual deploy procedure.
- Manual commands on the host (adding a reviewer §5.13, the re-run §8.3, rollback §12.5) run from `~/drugdb/deploy` with the `docker-compose` binary; the compose file sets the project name `bddrug`.
- **Smoke check.** The workflow's last step requests `$PUBLIC_URL/batches` with `curl -f`; it keeps passing in phase 0 (§12.1). P1A changes it to `$PUBLIC_URL/healthz`, so the `/batches` redirect (P1B) and the reviewer-only pages never fail a deploy.
- The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted.
- The `drugdb.eliooo.org` Caddy block is unchanged: the `/__/auth` proxy is a Next rewrite (§9.5).
- **New env vars reach the web container only through `web.environment`.** Compose passes only the variables listed there (host `.env` values are interpolated, not inherited). P1A adds to `web.environment` in `deploy/docker-compose.yml`: `SITE_HOST: ${SITE_HOST}` and `HERO_CONCEPT_ID: ${HERO_CONCEPT_ID:-}`, and lists both in `deploy/.env.example` with `SITE_HOST=drugdb.eliooo.org` and `HERO_CONCEPT_ID=186-0030-006--napa`. `SITE_HOST` is required: `instrumentation.ts` exits when it is unset in production (a unit test in `instrumentation.test.ts` pins this), and `deploy.yml`'s pre-flight check requires it in the host `.env` so the running containers stay up. `INTELLIDRUGS_E2E` is never added here (§11.4).
- **Firebase auth domain (before the P1A deploy, in this order):**
  1. set the GitHub repository variable `FIREBASE_AUTH_DOMAIN=drugdb.eliooo.org` (the deploy workflow bakes it into the web image as `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`) and the same value for `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` in the host `.env`;
  2. in Google Cloud console, Credentials, the Firebase web OAuth client: add the authorized redirect URI `https://drugdb.eliooo.org/__/auth/handler` (without it, sign-in fails with `redirect_uri_mismatch`);
  3. both are done before P1A merges to `main`. Until then the image keeps `<project>.firebaseapp.com`, which the CSP still allows (§9.4).
- The web Dockerfile adds `HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1` (interval 30 s).
- The pilot re-run (§8.3) uses the `jobs` profile and the internal and egress networks only.
- The CI-only override `deploy/docker-compose.ci.yml` (§11.4) is never copied to the host.

### 12.5 Rollback

- **Web or API**: in `~/drugdb/deploy/.env` set `IMAGE_TAG` to the previous tag, then `cd ~/drugdb/deploy && docker-compose up -d api web`. (Reverting the commit on `main` does the same through the deploy workflow.)
  - V6 is additive, so the previous API runs against the new schema.
  - A1 and the §7.2 guards revert with the image.
  - Sessions issued by the new web (JWE) are not readable by the old web. Reviewers sign in again; this is accepted.
- **ETL**: a rollback does not restore stage notes. Re-run the ddinter stage with the previous image if needed. Re-runs only ever re-open review; they never publish.
- **V6**: do not drop it on rollback. It is harmless to older images. Dropping it follows the lock policy (a new migration).

---

## 13. Open questions and decisions

### 13.1 Open questions (need the product owner)

1. **Licence lines.** The exact attribution and licence wording for DDInter 2.0, ATC, DrugBank and SNOMED CT in the footer and in Learn. Board P marks these "Licence line(s) to confirm". **This blocks phase 2 public launch.**
2. **Systemic note for route-specific products.** Should the checker and product page show an informational line such as "Systemic chloramphenicol (DDInter351) has moderate interactions with warfarin (metabolism), simvastatin and amlodipine. These apply to oral or IV chloramphenicol, not to this product."? If yes, it is never counted as an alert. Default until decided: **not shown**. This is a clinical-content decision for the pharmacist and the PO.
3. **Indexing at public launch.** The site stays `noindex` with `robots.txt Disallow: /` during the pilot. When the first batch is approved, should public pages become indexable? Default until decided: stay `noindex`.

### 13.2 Decisions taken in this spec

| # | Decision | Section |
|---|---|---|
| D1 | One workspace route `/review/[batchId]/[conceptId]`; the desk island lives in the batch layout so the undo window survives record navigation | §2.1, §5.8 |
| D2 | `/review/*` shows no data to anonymous or `user` sessions; batch API reads need the token | §2.3, §7.1 |
| D3 | One route per Learn chapter; Learn content in TSX; live numbers from `/v1/stats`; examples from a labelled snapshot | §2.1, §6.8 |
| D4 | `tokens.css` byte-identical in the web app; layout in CSS Modules; lint bans colour literals | §3.1 |
| D5 | Self-hosted Onest and IBM Plex Mono with the exact family names | §3.2 |
| D6 | Theme in a cookie, rendered on the server; no inline script, no flash | §3.3 |
| D7 | Fixed client-island allowlist, enforced at build | §4.2 |
| D8 | Writes need JavaScript (Turnstile); native-POST fallback uses a server-rendered implicit Turnstile widget, goes through a confirm step that posts the version the reviewer saw, and never approves on the first POST | §4.4, §5.8.6 |
| D9 | Unload during the undo window discards the decision; leaving the desk is blocked with a hint; `beforeunload` prompts | §5.8.3 |
| D10 | Stale token = `{extractedAt, lastDecisionId}`, sent as the island's `viewedVersion`; 20 s visible-tab polling; a refresh never swaps the open record silently; new 409 for another reviewer's decision | §5.11, §7.2 |
| D11 | API refuses `ok` while an issue is open, on approved records, on removed records, on records with a failed or missing check or no run stamp, and for a duplicate engineer check | §7.2 |
| D12 | `displayStatus` derived by the API with the precedence in §5.2 | §5.2 |
| D13 | Stage notes parsed and enriched by the API from evidence; the web never regexes notes | §5.5.3, §7.3 |
| D14 | Route-aware counts and "checked against" lines everywhere; the eye drop uses `DDInter352` | §1.5, §5.6, §6.7 |
| D15 | A checked pair with no DDInter row = "No interaction listed in DDInter 2.0" (counted as checked, with the caveat); pairs inside one product = not checked | §6.7.2 |
| D16 | Search stubs match on trade name and DAR only; public paging capped at 10 pages; spelling suggestion in memory (no trigram migration) | §6.3, §7.4 |
| D17 | Partner access requests stored as flags (`other`/`partner-access`), no schema change | §6.9 |
| D18 | V6 adds `ops.item_snapshot` and `ops.audit_event`, the decision `request_id` unique index, and append-only triggers; nothing else changes in the schema | §7.6 |
| D19 | Global reviewer roles; invites sent by hand from a fixed template | §5.13 |
| D20 | Encrypted session cookie (JWE) with the `__Host-` prefix; the old cookie is retired | §9.6 |
| D21 | Nonce-based CSP without `script-src 'unsafe-inline'`; Turnstile on sign-in | §9.2, §9.4 |
| D22 | No checker persistence in browser storage; no query strings in logs | §6.7.1, §9.7 |
| D23 | Infrastructure identifiers keep the `bddrug` names | §9.8 |
| D24 | No runtime feature flags; phase releases by image tag, through `phase-N` branches; rollback by tag | §12.3, §12.5 |
| D25 | Product page "With the other medicines" is limited to approved products of the same batch | §6.5 |
| D26 | Hero lookup card uses `HERO_CONCEPT_ID`: live when approved; brand and `NOT_REVIEWED` only until then (overrides Board P) | §1.6, §6.1 |
| D27 | Learn text corrections and the post-fix pilot counts replace the board values listed in §1.6 | §1.6 |
| D28 | Public routes always read with public scope; unapproved data only under `/review/*`; one visibility rule for every public endpoint, pinned by a matrix test | §2.2, §7.4, §11.3 |
| D29 | Decisions carry a `requestId`; retries are idempotent; a lost response is "unconfirmed", never "nothing was published" | §5.7, §5.8.2, §7.2 |
| D30 | Undo window adjustable per reviewer (8, 20 or 60 s) and single-key shortcuts can be turned off, both in cookies | §5.8.1, §5.14 |
| D31 | The evidence drawer pauses A and R | §1.6, §5.7 |
| D32 | Expired sessions are `unauthenticated` (signed-out block), distinct from `forbidden` | §5.8.2, §9.6 |
| D33 | Coverage `not_run` is its own state everywhere, never the no-data sentence | §3.6, §7.3, §6.7.2 |
| D34 | Removed records are served publicly as stubs | §2.2, §6.4, §7.4 |
| D35 | Audit: `review_open` only when shown, `decision_denied` from the web, tables append-only by trigger | §5.15, §7.6 |
| D36 | Desk reflows at 320 CSS px; short viewports drop sticky bars | §5.1, §10.4 |
| D37 | Sign-out is a route handler with `Clear-Site-Data: "storage"`; `returnTo` passes `safeReturnTo()` | §2.1, §6.2, §9.6 |
| D38 | Rate limits for signed-in actions are keyed by account email; the anonymous daily cap is 50,000 per IP | §9.3 |
| D39 | Five implementation plans (P0, P1A, P1B, P2, P3), not one; sign-in function ships in P1A with the `/api/session` Turnstile check | §12.2 |
| D40 | One snapshot per stamp, grouped by a per-invocation `run_id`; history shows one `extract` entry per run; removed items with snapshots are kept | §5.6.5, §7.6, §8.1 |
| D41 | The stored DDInter pair list is the union of the graph and `interact-with`; an incomplete read fails the stage, so "No interaction listed" is never computed from a partial list | §6.7.2, §8.1 |
| D42 | Plan PRs merge into `phase-N` branches; only phase-complete merges (and P0, P1A) reach `main`, which deploys automatically | §12.3, §12.4 |
| D43 | `exampleUsable` is an accepted coarse public signal ("withdrawn from examples"); no other review detail is public | §6.8, §7.4 |
| D44 | The batch layout holds ReviewDesk with batch-level props; the record page renders filters, list and detail and registers record data through `DeskRecordContext` | §4.2, §5.8.1 |
| D45 | The reviewer's own save updates that record's `viewedVersion`, so it never turns the record stale | §5.8.2, §5.11 |
| D46 | The hatch and `NoDataChip` mean coverage `none` only; other not-checked reasons are plain text | §3.4, §6.5, §6.7 |
| D47 | Checker counts exclude same-product and same-BDS pairs; `{m}` counts every selected medicine | §6.7.2, §7.4 |
