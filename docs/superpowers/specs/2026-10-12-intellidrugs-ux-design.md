# IntelliDrugs UX: design spec for the live system

| | |
|---|---|
| **Status** | Ready for implementation planning |
| **Date** | 12/10/2026 |
| **Product** | IntelliDrugs, served at `drugdb.eliooo.org` (repository `gitlab/ddinter2`, internal name BDDrug KB) |
| **Approved design** | Direction A "Clinical Calm", wordmark option A ("IntelliDrugs" + cobalt full stop), approved by the user on 12/10/2026 |
| **Visual source of truth** | `docs/artifacts/2026-10-12-intellidrugs-design-system.html`, `-reviewer.html`, `-public.html`, `-learn.html`, and `docs/design/intellidrugs/tokens.css` |
| **Earlier approved docs** | `docs/design/2026-10-11-bd-drug-kb-design.md`, `docs/design/database.md` (schema `db-schema-v1.0` is locked) |
| **Amendments** | P1C "Review model and source links", 15/10/2026, from the product owner's decisions of 15/10/2026 (see "Changes in P1C" below); QA "QA API, QA MCP and checker text", 18/10/2026, from the product owner's decisions of 17–18/10/2026 (see "Changes in QA" below); QA portal "QA role, self-service keys, hosted MCP and QA page", 18/10/2026, from the product owner's decisions of 18/10/2026 (see "Changes in QA portal" below); QA API reference "QA API reference on the QA page", 19/10/2026, from the product owner's request of 19/10/2026 (see "Changes in QA API reference" below) |

> **Changes in P1C (15/10/2026).** The product owner's decisions of 15/10/2026 (PO D1–D10) add plan P1C, "Review model and source links". It brings in the senior pharmacist role, senior review by substance and by pair across all batches, the reopen rule, cross-batch pairs on the desk, removed items never public, source links for every code, and dismissing an issue. Learn is not touched (PO D9: the chapter 6 Chloramphenicol row is fixed in the P3 branch). Sections touched:
>
> - header table;
> - §1.2 (G3 bullets, new G6); §1.4 (new S8, S9); §1.6 (new item 17); §1.7 (new rows);
> - §2.1 (senior routes); §2.2 (senior column and new rows);
> - §3.4 (`CodeChip` `href`, new `SourceLink` and `PairReviewState`, mark exclusivity); §3.6 (`PROMISE_SENIOR`, `PAIR_REVIEWED`, `PAIR_NOT_REVIEWED`, `FROM_DDINTER`);
> - §4.2 (`SeniorDesk` island);
> - §5.1 (role badge, senior links); §5.2 (dismissed issues, re-run reach); §5.5.2 (source links); §5.5.3 (text-missing notes split by `partnerScope`); §5.6.1, §5.6.2 (cross-batch pairs, combination fix); §5.6.3 (evidence "Sources"); §5.6.5 (history entries); new §5.6.6 (source links); §5.7 (Dismiss issue, senior promise); §5.8.2, §5.8.4 (dismiss events and copy); §5.9; new §5.10a (Dismiss issue); §5.11 (409 `review` for dismiss); §5.12 (complete-view sentence); §5.13 (senior role, PO D1); §5.14 (`D` key); §5.15 (audit); §5.16 (pair-issue line on `/review/flags`); new §5.17 (senior clinical review);
> - §6.2 (senior welcome and account menu); §6.4 (removed record coming back); §6.5 ("With other approved medicines", source links, verification-card sentence); §6.6; §6.7.3 (pair label and review state);
> - §7.2 (`dismiss`, `senior`); §7.3 (`otherPairs`, pair review state, source links, history); §7.4 (P9, P10, the checker's `pairReview`, PO D7); §7.5; new §7.7 (senior review endpoints); new §7.8 (V7 migration, `db-schema-v1.2`);
> - §8.1 item 4; §8.3 (reopen rule rewritten; `batch_item.note`, re-added items, carried approvals, `--reopen` limited);
> - §9.2, §9.3, §9.7; §10.6;
> - §11.1–§11.4;
> - §12.1, §12.2 (new P1C row; P2 depends on P1C), §12.3, §12.5;
> - §13.1 (Q4–Q13), §13.2 (D18 and D25 notes, D49–D60).

> **Changes in QA (18/10/2026).** The product owner's decisions of 17–18/10/2026 add plan "QA API, QA MCP and checker text": a read-only, key-gated QA API served by the web app for the PO's other project, where another LLM re-checks our data for mismatches; a stdio MCP server over it; and DDInter's interaction description on the public checker's cards. Sections touched:
>
> - header table; §1.7 (intro note: no new page copy);
> - §2.1 (QA routes); §2.2 (QA key holders);
> - §4.2 (`Expander` prop `describedBy`); §4.3 (QA routes are not browser-callable; `QA_API_KEYS` server-only);
> - §5.15 (`qa_read`);
> - §6.7.3 (interaction description on the checker's cards);
> - new §7.9 (QA API and QA MCP, the `GET /v1/qa/*` internal endpoints, V8);
> - §9.3, §9.7; §11.1–§11.3; §12.2 (new QA row, seven plans), §12.3, §12.4 (`QA_API_KEYS`);
> - §13.2 (D18 note, D61–D65).

> **Changes in QA portal (18/10/2026).** The product owner's decisions of 18/10/2026 add plan "QA portal", so QA team members reach the QA tools, the MCP server and the QA API through the site: a new `qa` role that sees only the QA section, self-service QA keys stored hashed in the database (V9), a hosted MCP endpoint on the existing web app, and the QA tools page with its menu item and toolbar link. The §7.9 QA API and the stdio QA MCP stay as shipped; the env keys in `QA_API_KEYS` keep working. Sections touched:
>
> - header table; §1.4 (new S10); §1.7 (intro note, four new rows);
> - §2.1 (`/review` for `qa`, `/review/qa`, `POST /api/qa/mcp`, the QA API row); §2.2 (new QA column, QA tools row, the D61 note); §2.3 (the `qa` sentence);
> - §4.2 (`QaKeys` and `CopyButton` islands); §4.3 (the new key reaches the browser once; `/api/qa/mcp` is not browser-callable);
> - §5.1 ("QA tools" toolbar link, role badge "QA"); §5.12 (new row: QA account on a review page); §5.13 (the `qa` role token and its gates, invite template); §5.15 (`qa_key_created`, `qa_key_revoked`; `qa_read` from the hosted MCP and DB keys); §5.17 (access for `qa`); new §5.18 (QA tools page);
> - §6.2 (QA welcome state, "QA tools" account-menu item);
> - §7.9.1 (auth: env or DB key; 401, never the disabled 404; malformed env values); §7.9.6 (DB key labels, the `mcp` route name); §7.9.7; §7.9.8 (DB keys work in the stdio server; the hosted counterpart); new §7.10 (QA portal: role, keys, V9, internal endpoints, verification rule, hosted MCP, audit, privacy);
> - §9.2, §9.3, §9.7; §10.6;
> - §11.1–§11.4;
> - §12.2 (new QA portal row, eight plans), §12.3, §12.4, §12.5;
> - §13.2 (D18 note, D66–D71).

> **Changes in QA API reference (19/10/2026).** The product owner's request of 19/10/2026 ("the API section lists only endpoint URLs; add the request and the response, so QA knows what to send and what comes back") adds plan "QA API reference": the "API" section of `/review/qa` becomes a full reference for the five QA endpoints and the hosted MCP endpoint, with every parameter and its rule, a copy-ready command, an example answer generated by the real mappers, key fields and an error table for each, all pinned to the code by tests. No API route, response shape, schema, MCP tool text, island or budget changes. Sections touched:
>
> - header table; §1.7 (intro note, one new row);
> - §3.4 (`ExampleMarker` on the QA reference); §4.2 (`CopyButton` prop `context`);
> - §5.18 (files; section 3 "API" rewritten; copy buttons; states, keyboard and a11y);
> - §10.6 (the `/review/qa` note);
> - §11.1, §11.2, §11.4;
> - §12.2 (new QA API reference row, nine plans);
> - §13.2 (D72).

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
  - *(P1C)* an interaction is never hidden because no senior pharmacist has reviewed it yet. Senior review of pairs comes after the fact; it is not a gate (§5.17, §6.7.3);
  - *(P1C)* a record leaves public view only when something its approval covered changes (§8.3), when a reviewer reports an issue, or when it is removed from its batch file (§6.4). Two engineering paths are listed with it, so no path is left unstated (§8.3.1 items 5 and 8):
    - the engineer's `--reopen` override, which re-opens the named records whatever changed. It overrides PO D5's "only", so it waits for the PO's confirmation (§13.1 Q12);
    - a product listed again in a new batch keeps its approval when its approval view is unchanged (the approval is carried over, §8.3.1 item 8). It leaves public view only when its approval view changed.
  - *(P1C)* a record never returns to public view without a pharmacist's decision: a record that comes back into its batch file after it was marked removed is always re-opened (§8.3.1 item 5), and re-runs never publish (§12.5).
- G4. The site meets WCAG 2.2 AA in both themes, and the contrast table in Board DS still holds.
- G5. The approved UX is reachable with the security posture intact: SSR, an internal-only API, rate limits, Turnstile on every write and on sign-in, no PHI, and an audit trail.
- G6. *(P1C)* A senior pharmacist reviews the clinical picture across all batches at once, by substance and pair by pair, so no review misses an interaction partner that sits in another batch (§5.17).

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
| S8 | *(P1C)* A DDInter re-run that changes no covered field (§8.3) leaves every approved record approved. A re-run that changes only a pair's severity, actions or text puts that pair back in the senior pair queue as "changed" and re-opens no record. | ETL test `test_pair_change_reopens_no_record` and API test `PairQueueIntegrationTest.changedPairReturnsToQueue` (§11.3), plus the P1C pilot re-run check on production (§12.1). |
| S9 | *(P1C)* Every code on the desk links to its source (§5.6.6). With the pilot codes, each link pattern opens the page the §5.6.6 table names. | Unit test of `SourceLinks` (§11.3), component test of the links (§11.2), and a manual browser check of each pattern, recorded in the P1C PR (CI never calls external sites). |
| S10 | *(QA portal)* A QA team member invited with role `qa` signs in, creates a key on `/review/qa`, adds the hosted MCP server to Claude Code with the page's command, and gets a `list_batches` result, in 5 minutes or less, asking for help 0 times. Their key never appears in a URL, a log line, an audit row or browser storage. | Moderated session on production after the deploy, with the page as the only instruction; the e2e QA flow (§11.4) runs the same steps against the CI stack, and the unit tests in §11.1 pin where the key may go. |

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
16. **Board L sentences the live system makes false.**
    - Chapter 6 "A worked check" banner: "All three records are not yet reviewed by a pharmacist." becomes "All three records are "Not yet reviewed by a pharmacist"." (§3.6: rendered from `NOT_REVIEWED`). The second sentence stays. The banner shows only while all three are not approved (§6.8 "Approval-state sentences").
    - Chapter 8 "Reviewer" access legend: "It never includes emails." becomes "Reviewer emails are never shown on public pages or in public API answers." Decision history needs the internal token and includes emails (§7.1 A2).
    - FAQ "Is my email shown to anyone?": "Public decision history shows the role, never the email." becomes "Decision history is served only to signed-in reviewers; public pages and the public API never show an email."
17. **P1C strings (PO D3, D4, D6; D53, D55, D60).**
    - Item 15's product-page heading "With the other medicines in batch {id}" (D25) becomes "With other approved medicines". It lists pairs with approved products from every batch (§6.5).
    - Board R's "With the other medicines in this batch" becomes the desk section "With other medicines", with the groups "In batch {id}" and "In other batches" (§5.6.2).
    - The desk DDInter note "DDInter text not found for {n} pair[s] with other medicines in this batch." is kept only for pairs whose partner is in this batch (`partnerScope: "batch"`). Pairs with partners outside this batch, and pairs between two ingredients of the record itself, get their own notes (§5.5.3).
    - Board P's checker cards and product-page pair cards gain the pair label `FROM_DDINTER` and the pair's senior-review state (§3.6, §6.7.3).
    - The reopen rule changes (D54, §8.3), so two board sentences that say "re-runs" now say "changes data … covered": Board P's verification card (§6.5) and Board R's complete view (§5.12). Learn's re-run sentences (item 4, chapter 4) are not changed here (PO D9: Learn stays out of P1C). They are listed for the next Learn amendment (§12.2).

### 1.7 States the boards do not draw (new copy, Decision)

The boards do not cover the states below. Their copy is defined in the section named and is verbatim like board copy. Every string follows §3.5.

*(QA, 18/10/2026)* The QA plan adds **no row**. The checker's interaction-description block (§6.7.3) reuses Board P's "Interaction description, truncated. Full text from DDInter 2.0." and "Interaction description, full text from DDInter 2.0." and the Expander's "Show full text" / "Show less". The QA API's envelope messages and the QA MCP preamble (§7.9) are machine-facing strings, like the API messages quoted in §7.2 and §7.7: they are not page copy, not §1.7 rows and not in `NEW_COPY`. The preamble is pinned by the MCP's own test (§11.1).

*(QA portal, 18/10/2026)* The QA portal adds the four rows marked *(QA portal)* below. Their strings live in `$WEB/lib/copy.ts` as `NEW_COPY` entries with a typed view `QA_COPY`, like `P1C_COPY`. Three kinds of QA text are **not** rows: the hosted MCP server's JSON-RPC error messages (§7.10.6), which are machine-facing like the §7.9 envelope messages; the setup snippets, endpoint paths, filter names and curl example on `/review/qa`, which are code shown in mono (they are pinned by the page's component test, §11.2); and the "Rules" list, which is rendered line by line from the `PREAMBLE` constant (§7.10.6) and never retyped.

*(QA API reference, 19/10/2026)* The QA API reference adds the one row marked *(QA API reference)* below. Its strings live in `$WEB/lib/copy.ts` as one `NEW_COPY` entry with the typed view `QA_COPY.reference`. Short words that other modules already print are `SHARED_WORDS` (`status`, and the new `code` "Code", `yes` "Yes", `no` "No" and `endpoints` "Endpoints"), as P1A's retyping guard requires; the endpoint summaries reuse the QA portal's "Returns" sentences, and "Copy command", "Copy example" and the envelope line stay QA portal strings. The QA portal's `endpointsCaption`, `colRequest` and `colReturns` are removed with the endpoints table. **Not rows**, because they are code shown in mono and pinned by the tests of §11.1 and §11.2: the commands, the example answers, paths, parameter names, patterns and allowed values, header names and values, field paths, error codes, JSON-RPC codes and messages, and the tool names and arguments rendered from `TOOLS`.

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
| Learn: chapter not shown because the live numbers did not load | §6.8 |
| Decision saving (`committing`): promise and toast | §5.7, §5.8.4 |
| Desk: narrow-screen "Back to list", the no-JavaScript notices, loading and loaded announcements | §5.1, §4.4, §5.12 |
| Desk: batch load error, batch not found | §5.12 |
| History: role variants, the "No longer counts" suffix, shared-change entries; *(P1C)* the carried-approval line "Approval carried over from batch {batchId}: nothing it covered changed." | §5.6.5, §8.3.1 |
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
| *(P1C)* Senior pharmacist role: role badge, promise (`PROMISE_SENIOR`), welcome step, invite role, account-menu and sidebar links | §3.6, §5.1, §5.13, §6.2 |
| *(P1C)* Senior review: substance list, substance page, pair queue, the scope filter ("All pairs", "Applies to our brands"), pair row, the non-applying pair line, the brand list cap ("and {n} more.", "All brands of {substance}"), pair actions and their outcomes, pair history, keyboard sheet, empty, loading, error and not-authorised states, announcements | §5.17 |
| *(P1C)* Pair label and pair review state lines: `FROM_DDINTER`, `PAIR_REVIEWED`, `PAIR_NOT_REVIEWED` (public and reviewer), and the reviewer-only "changed" and "issue" lines | §3.6, §5.6.2, §5.17, §6.5, §6.6, §6.7.3 |
| *(P1C)* Desk: "With other medicines" groups, cross-batch partner lines, the partner `<details>` summaries ("All {n} medicines", "{s} of {n} medicines"), "and {k} more." and "See every brand of {partner substance}", the outside-this-batch text-missing note, the same-product text-missing note, the no-data line for other batches, "no other batches" lines | §5.5.3, §5.6.1, §5.6.2 |
| *(P1C)* Dismiss issue: control, panel, consequence sentence, hints, 409 outcomes, the not-saved and unconfirmed failure banners (report channel), announcements, history entries and the dismissal "No longer counts" suffix | §5.6.5, §5.7, §5.8.2, §5.8.4, §5.10a |
| *(P1C)* Source links: link labels, "fetched on {date}", the ICD-11 search link, the evidence drawer's "Sources" section, the product page's "Source" column | §5.6.3, §5.6.6, §6.5 |
| *(P1C)* Product page "With other approved medicines" (cross-batch, grouped by partner substance) and its paging | §6.5 |
| *(P2)* Public page could not load (`app/error.tsx`) | §4.2 |
| *(QA portal)* QA role: role badge "QA", welcome state, invite role, the "QA tools" account-menu item and toolbar link | §5.1, §5.13, §6.2 |
| *(QA portal)* QA account on a review page | §5.12 |
| *(QA portal)* QA tools page: heading, "Connect your AI", "API" and "Rules" sections, copy buttons and their announcements, the pharmacist banner | §5.18 |
| *(QA portal)* QA keys: create form, name rules and errors, the one-time key panel, the key list and statuses, revoke confirmation and outcomes, limit, bot-check, sign-in and network failures, load error, no-JavaScript line, announcements | §5.18 |
| *(QA API reference)* QA tools page: the API reference (every request and answer, the endpoint panels with their parameters, examples, key fields and errors, MCP over HTTP) | §5.18 |

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
| `/review` | Batch list (§5.16); redirects 307 to the newest `in_review` batch if there is exactly one | server | pharmacist, engineer. *(QA portal)* Role `qa`: redirects 307 to `/review/qa` |
| `/review/[batchId]` | Redirects 307 to the first record in the current filter that needs review for the viewer's role, otherwise record 1 | server | pharmacist, engineer |
| `/review/[batchId]/[conceptId]?show=&q=` | **The workspace**. One route. The batch layout (toolbar and the ReviewDesk island) persists across records; the record page renders the filters, the list and the detail pane (§5.8.1). | server + ReviewDesk and DeskRecordContext islands | pharmacist, engineer |
| `/review/[batchId]/versions` | Version tokens for stale detection (route handler, JSON) | server | pharmacist, engineer |
| `/review/flags` | Open problem reports and partner access requests, with Resolve (§5.16) | server | pharmacist, engineer |
| `/review/pairs?show=&pairs=&severity=&page=` | *(P1C)* Senior pair queue: every stored pair between substances we hold, from all batches, Major first (PO D3(b), §5.17) | server + SeniorDesk island | senior (others: not-authorised page, §5.17) |
| `/review/substances?q=&page=` | *(P1C)* Senior review: the substances we hold, from all batches (§5.17) | server | senior |
| `/review/substances/[bdsId]?pairs=&severity=&page=` | *(P1C)* Senior review by substance: brands from every batch, mappings, codes with source links, and pairs (§5.17) | server + SeniorDesk island | senior |
| `/review/qa` | *(QA portal)* QA tools (§5.18): connect your AI, your keys, the API, the rules | server + QaKeys and CopyButton islands | qa, engineer, senior (pharmacist: info banner, §5.18; `user`: not-authorised page, §5.12) |
| `POST /signout` | Sign out (route handler, §9.6): checks `Origin`, clears the session cookie, sends `Clear-Site-Data: "storage"`, then 303 to `/` (or to `/signin?returnTo=…` for "Use another Google account") | route handler | everyone, rate-limited |
| `/healthz` | Liveness (route handler, `200 ok`, not rate-limited) | server | container healthcheck |
| `GET /api/qa/v1/*` | *(QA)* Read-only QA API (route handlers, JSON, §7.9). *(QA portal)* 401 without a valid env or DB key, whether or not `QA_API_KEYS` is set (§7.9.1); unknown QA paths 404. | route handler | `Authorization: Bearer` QA key holders only (never a session); rate-limited |
| `POST /api/qa/mcp` | *(QA portal)* Hosted QA MCP server: MCP Streamable HTTP, stateless JSON responses (§7.10.6). `GET` and `DELETE` answer 405. | route handler | `Authorization: Bearer` QA key holders only (env or DB key, never a session); rate-limited with the QA API |

**Decision: one route per Learn chapter, not one long page.** Each chapter loads on its own, which keeps page weight down on slow connections. The chapter nav becomes links with `aria-current="page"`. The "On this page" rail lists that chapter's sections.

**Decision: no separate clinical-drug route.** "Other brands of …" is a card on the product page (§6.5).

**Decision (P1C, D49).** Every route above that is open to "pharmacist, engineer" is also open to `senior`. The three senior routes are open to `senior` only.

**Decision (QA portal, D66).** Role `qa` opens no route above that is open to "pharmacist, engineer" or to `senior`. `/review` redirects it 307 to `/review/qa`; every other `/review/*` page answers it as for a role that may not review: status 200, the §5.12 "QA account on a review page" view, no review data and no review API call; `/review/[batchId]/versions` answers it as it answers `user`. On public routes a `qa` session is a reader (`user`), with public scope (§2.2).

### 2.2 Who sees what

| Data | Anonymous | Signed in, role `user` | Engineer | Pharmacist | Senior pharmacist *(P1C)* | QA *(QA portal)* |
|---|---|---|---|---|---|---|
| Approved product, substance and clinical drug | yes | yes | yes | yes | yes | yes |
| Unapproved product (any state other than `approved`: pending, engineer checked, issue, back in review) | stub only: concept id, trade name, "Not yet reviewed by a pharmacist", batch id | stub only | stub on public routes; full in `/review` only | stub on public routes; full in `/review` only | as pharmacist | stub only on every page; full only through QA key reads (§7.9), never in `/review` |
| Product whose latest batch item is marked "removed from batch file" | stub with "Removed from the DGDA batch file." (§6.4), whatever its last decision | same | same on public routes; not listed in `/review`, and decisions on it are refused (§7.2) | same | same | same on public routes; QA key reads exclude it, as `/review` does |
| Unapproved substance (none of its products approved) | stub only: BDS id, name, "Not yet reviewed by a pharmacist" | stub only | stub on public routes; full in `/review` only | stub on public routes; full in `/review` only | as pharmacist | stub only on every page; full only through QA key reads |
| Unapproved clinical drug (no approved product maps to it) | not served | not served | in `/review` only | in `/review` only | in `/review` only | not served on any page; through QA key reads only |
| Batch evidence (source JSON, stage evidence, extraction) | no | no | yes | yes | yes | no page; through QA key reads only |
| Decision history, with notes | no | no | yes (roles only; "(you)" for own) | yes | yes | no page; QA key reads give role, time and decision, never a note (§7.9.7) |
| Public verification line (role and date of the counting approval) | yes, approved records only | yes | yes | yes | yes. A senior's approval reads "Approved by a pharmacist" in public (D49). | yes |
| Emails of anyone else | never | never | never | never | never | never |
| Own name and email | n/a | in the account menu only | same | same | same | in the account menu only |
| Report a problem (flag) | no ("Sign in to report a problem") | yes | yes | yes | yes | yes, as a reader |
| Review decisions | no | no ("Your account can't review this batch.") | records an engineer check | approves and publishes | approves and publishes, as a pharmacist | no, never: the web refuses before any API call and the API refuses `reviewerRole=qa` (§5.13, §7.10.1) |
| *(P1C)* Dismiss an open issue on a record (§5.10a) | no | no | no: sees the issue, no Dismiss control | no: same | yes | no |
| *(P1C)* Senior review pages (`/review/pairs`, `/review/substances/*`, §5.17) | no (sign-in redirect) | no (not-authorised page) | no ("Senior review is for senior pharmacists.") | no (same) | yes | no (QA account view, §5.12) |
| *(P1C)* Pair decisions: mark reviewed, report pair issue (§5.17) | no | no | no | no | yes | no |
| *(P1C)* Pair review state | pairs between approved products only: `PAIR_REVIEWED` with its date, or `PAIR_NOT_REVIEWED` (D53) | same | all four states in `/review` (§5.17) | same | same | public state on pages; all four states through QA key reads |
| *(P1C)* Source links and "fetched on" dates (§5.6.6) | approved records only (P2, §6.5) | same | every record in `/review` | same | same | approved records on pages; every current record through QA key reads |
| Resolve flags | no | no | yes | yes | yes | no |
| Partner access request | no (sign in first) | yes | yes | yes | yes | yes |
| *(QA portal)* QA tools page and own QA keys (`/review/qa`, §5.18) | no (sign-in redirect) | no (not-authorised page) | yes | no ("QA tools are for QA team members, engineers and senior pharmacists.") | yes | yes |

**Decision (P1C, PO D2, D49).** `senior` is a pharmacist role. Every rule in this spec that names the pharmacist also applies to the senior pharmacist: approval, the promise's consequence, the "needs review" set, Report issue, history, and access to every pharmacist route. The senior also has the senior review surfaces (§5.17) and Dismiss issue (§5.10a). Wherever this spec writes "pharmacist" for a power, read "pharmacist or senior pharmacist". Wherever it writes "pharmacist" for a label shown to reviewers, the senior's label is "senior pharmacist".

**Decision: public routes always read with public scope.** `/`, `/search`, `/products/*`, `/substances/*`, `/check`, `/check/suggest`, `/partners`, `/learn/*` and `/privacy` call the API with `scope=public` whatever the session, so a reviewer sees exactly what a reader sees there. Unapproved data is readable only under `/review/*`, through the token-gated endpoints in §7.3. The current `UnreviewedBadge` and the `scopeFor(session)` switch on public pages are removed. An e2e test opens `/products/{unapprovedId}` with a pharmacist session and asserts the stub (§11.4).

**Decision (QA, D61).** A QA key holder (§7.9) is a machine reader outside the table above. It reads what the desk shows for every current record, unapproved ones included (source JSON, extraction, codes with source links, stage results and evidence, pairs, pair review state, and decision history as role, time and decision), plus the senior substance read's pairs. It never receives an email, a decision note, a dismissal note, a pair-issue note, `mine`, a flag, an audit row or session data, and it writes nothing but its own `qa_read` audit rows. *(QA portal)* This holds for every key, env or DB (§7.10.2), and for the hosted MCP server (§7.10.6). A DB key reads as its owner's QA access, not as the owner: the owner's role gives no extra field, and a pharmacist's session never makes a key (D67).

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

**Decision.** Anonymous access to any `/review/*` route redirects 307 to `/signin?returnTo=…`, and `user` access returns status 200 with the not-authorised page in §5.12. Neither ever shows the data. This closes the gap where `/batches/[id]` showed unreviewed data to anonymous visitors. *(QA portal)* A `qa` session gets the same answer as `user` (status 200, no data) on every `/review/*` route except `/review` (307 to `/review/qa`) and `/review/qa` itself, with the §5.12 QA account view in place of the not-authorised page (§2.1, D66).

---

## 3. Design system adoption

### 3.1 Stylesheets

- **`$WEB/styles/tokens.css` is a byte-identical copy of `docs/design/intellidrugs/tokens.css`.** A unit test compares SHA-256 hashes. To change a token, change the docs copy first, then copy it.
- `$WEB/styles/fonts.css` holds only `@font-face` rules (§3.2).
- Page and component layout lives in CSS Modules (`*.module.css`). Modules use tokens only, never raw colour values. A Stylelint rule (`color-no-hex`, `color-named: never`, and `function-disallowed-list: rgb, rgba, hsl`) fails the build on any colour literal outside `tokens.css`.
  - *Amendment (P1A Task 1 review):* the three names `rgb, rgba, hsl` are the minimum, not the limit. The rule is `function-disallowed-list: ["/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)$/i"]`, which bans every colour function, case-insensitively, so `hsla()`, `hwb()`, `oklch()` and `RGB(` also fail the build.
- Layout rules that the boards define in their second `<style>` block (`.pg`, `.app`, `.panes`, `.d-…`, `.s-…`, `.d-shell`, and so on) are ported into modules with the same values.
- Remove every inline `style={{…}}` object in `$WEB`. The only allowed inline styles are CSS custom properties: a measured value (for example `--w: 40%` on progress meters), and `--dur-commit` on the desk toast, set to the reviewer's undo window (§5.8.4).
- Root layout: `<html lang="en">`, `<body>` with no inline style. Global imports, in order: `tokens.css`, `fonts.css`.

### 3.2 Fonts

**Decision: self-host the fonts. Do not load from Google Fonts at runtime.**

- WOFF2 files go in `$WEB/public/fonts/`:
  - Onest variable, latin subset, weights 400–700;
  - IBM Plex Mono 400 and 500, latin subset;
  - both OFL licence texts.
- `fonts.css` declares `font-family: "Onest"` and `font-family: "IBM Plex Mono"`, so `--font-ui` and `--font-mono` in `tokens.css` work unchanged. Use `font-display: optional` (Decision, product owner 16/10/2026: no LCP cost; a first visit on a slow connection may render the fallback font, later visits use the cached font).
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
| `ExampleMarker` | none | `.example` "Example" | Allowed only in Learn and on the landing page's partner code sample until §7 ships (§6.1), and *(QA API reference)* on the example commands and answers of the `/review/qa` API reference (§5.18), which are illustrations built by the QA mappers, not stored records. Never on a record's data. |
| `CodeChip` *(P1C addition)* | adds `source?: {url, label, fetchedAt}` | the chip, then a `SourceLink` | `source` comes from the API only (§5.6.6). The web never builds a source URL. |
| `SourceLink` *(P1C)* | `url`, `label`, `fetchedAt?: string \| null` | `<a class="src-link" href={url} target="_blank" rel="noopener noreferrer">{label}<span class="sr-only"> (opens in a new tab)</span></a>`, plus " fetched on {DD/MM/YYYY}" (Dhaka date) when `fetchedAt` is set | Never rendered without a `url`. Never says "fetched on" without a stored time. Plain link style, never a button. |
| `PairReviewState` *(P1C)* | `state: "reviewed" \| "not_reviewed" \| "changed" \| "issue"`, `at?`, `mine?`, `note?`, `surface: "reviewer" \| "public"` | `.pair-review` plain text line (§5.17 copy) | Public accepts only `reviewed` and `not_reviewed`. Never green, never a pill, never a chip (mark exclusivity). |

**Mark exclusivity (enforced in review and by a lint test):**

- Green (`--ok`, `.rv--approved`) means "approved by a pharmacist" and nothing else.
- The hatch (`NoDataBlock`, `NoDataChip`) means "no interaction data" (coverage `none`) and nothing else. Pairs not checked for any other reason are plain, unhatched text.
- Square chips mean severity. Rounded pills mean review status.
- Translucent material (`.material`, `.decision-bar`) is used only on the toolbar, the sidebar and the decision bar.
- *(P1C)* A pair's senior-review state is plain text (`PairReviewState`). A senior's review of a pair is not a pharmacist's approval of a record, so it never uses green, the seal icon or a review-status pill.

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
| `PROMISE_SENIOR` *(P1C)* | `**You're reviewing as a senior pharmacist.** "Looks correct" publishes this record after an {n}-second undo window.` | Decision bar for role `senior` (§5.7). New copy (§1.7). |
| `FROM_DDINTER` *(P1C)* | `From DDInter 2.0` | The label on every pair card whose text or severity comes from DDInter, public and reviewer (§5.6.2, §6.5, §6.6, §6.7.3). New copy (§1.7). |
| `PAIR_REVIEWED` *(P1C)* | `Pair reviewed by a senior pharmacist on {date}` | `{date}` = `DD/MM/YYYY` of the counting pair review, Dhaka. Public and reviewer. Plain text, never green. New copy (§1.7). |
| `PAIR_NOT_REVIEWED` *(P1C)* | `Pair not yet reviewed by a senior pharmacist` | Every pair with no counting review: never reviewed, changed since review, or an open pair issue (public), or never reviewed (reviewer, §5.17). It never hides the pair or its text (G3). New copy (§1.7). The copy test allows it next to `NOT_REVIEWED`; it is not a paraphrase of it. |

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
| Expander | `components/Expander.tsx` | Line clamp toggle | the id of the server-rendered text, and `label: "reviewer" \| "public"`. Reviewer (Board R): "Full text from DDInter 2.0" / "Show less". Public and Learn (Boards P and L): "Show full text" / "Show less". Without JS the text renders unclamped. *(QA)* Optional `describedBy`: the id of the text's kind label, set as the button's `aria-describedby` where one card holds two Expanders (§6.7.3). |
| AccountMenu | `components/AccountMenu.tsx` | Esc and outside-click closing for a `<details>`-based menu | none (works as plain `<details>` without JS) |
| GlossaryFilter | `components/learn/GlossaryFilter.tsx` | Live filter with a debounced count | none (filters the server-rendered list in the DOM) |
| LearnRail | `components/learn/LearnRail.tsx` | Scroll-spy `aria-current` on "On this page"; scrolls the current chapter into view in the narrow nav; drives chapter 8's `.seg` example switches | none |
| ErrorBoundary | `app/error.tsx`, `app/review/error.tsx` | Next requires error boundaries to be client components | none |
| SeniorDesk *(P1C)* | `components/review/senior/SeniorDesk.tsx` plus `components/review/senior/*` | Keyboard model of the senior pages (J, K, M, R, ?, Esc), pair decisions with Turnstile and `requestId`, the pair-issue note drafts, row-level 409 banners, live region | role, page kind (`queue` or `substance`), the visible pair order with each pair's `{ddinterA, ddinterB, version}`, desk settings (single-key shortcuts). No clinical text and no emails in props; the rows are server-rendered. |
| QaKeys *(QA portal)* | `components/qa/QaKeys.tsx` plus `components/qa/*` (except `CopyButton`) | The create and revoke forms as server actions with Turnstile (action `qakey`), the one-time key panel (focus, copy, "I've saved it", `beforeunload` while it is open), the inline revoke confirmation, field errors, outcome banners and announcements (§5.18) | the viewer's own keys as `{id, name, createdAt, expiresAt, lastUsedAt, status}` (never an email, never a hash), the active-key count, the Turnstile site key and the nonce. The new key is never a prop: it arrives once, in the create action's result, and lives only in the island's state until "I've saved it" or the page unloads. |
| CopyButton *(QA portal)* | `components/qa/CopyButton.tsx` | `navigator.clipboard.writeText` of a server-rendered text, with the "Copied." announcement and the select-the-text fallback (§5.18) | the id of the element whose text it copies, and its label. It never receives the text itself as a prop, so a key panel's text is read from the DOM at click time. *(QA API reference)* Optional `context`: sr-only text rendered after the visible label (for example " for GET /api/qa/v1/batches"), so the reference's many "Copy command" and "Copy example" buttons have distinct names; never the target's text. The same island copies the reference's commands and example answers (§5.18); there is no new island. |

*(P1C)* ReviewDesk's `role` prop also takes `senior` (§5.7, §5.10a).

*(P2, final review)* **Public error page (`app/error.tsx`, Decision).** `/search`, `/products/[id]` and `/substances/[id]` throw on an API 5xx or timeout. The root boundary renders inside the root layout (skip link, header, `<main>`; on a Learn chapter it brings the skip link and `<main>` itself): a crit `Banner` whose title is the page's `<h1>`, title "Couldn't load this page.", body "Nothing was changed. Check your connection and try again.", button "Try again" (`reset()`). It owns the page's one polite live region and announces the title (§10.2). Its strings live in `lib/page-error-copy.ts`, which `NEW_COPY` re-exports, so the boundary that loads with every route does not ship `lib/copy.ts` (§10.6).

### 4.3 What data may reach the browser

- Only what the page renders, plus the props listed above. There is never a bulk JSON endpoint.
- Browser-callable route handlers, each session- or rate-gated:
  - `/check/suggest`: at most 10 rows, `q` of 2 or more characters, approved products' clinical names only;
  - `/review/[batchId]/versions`: `conceptId`, version and display status per current item, reviewers only;
  - `/api/session`.
- `GET /v1/products/loaded` is no longer called by any page. The checker picker uses suggestions.
- *(QA)* `/api/qa/v1/*` (§7.9) is not browser-callable: it is authorised only by a Bearer QA key, reads no cookie, and sends no CORS header, so no page script on any origin can use it. It is the one key-gated, server-to-server JSON surface, and its list endpoints are paged (100 records, 50 pairs).
- *(QA portal)* `/api/qa/mcp` (§7.10.6) is not browser-callable either: Bearer key only, no cookie read, no CORS header, and a request with an `Origin` other than `https://{SITE_HOST}` is refused with 403.
- *(QA portal)* **A new QA key reaches the browser exactly once**: in the result of the create server action, to the QaKeys island, which shows it in the one-time panel (§5.18). It is never in a URL, a prop, a cookie, `localStorage`, `sessionStorage`, a server-rendered page or a log line, and the web never stores it: the API stores only its SHA-256 hash (§7.10.2). No other QA endpoint, page or island ever carries a key or a hash.
- `INTERNAL_API_TOKEN`, `SESSION_SECRET`, `TURNSTILE_SECRET_KEY` and *(QA)* `QA_API_KEYS` stay server-only. The existing `check-client-bundle.mjs` scan stays.

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
  - right: role badge "Pharmacist" or "Engineer" (`.role-badge`), then the account (initials avatar, name, AccountMenu). *(P1C)* For role `senior` the badge reads "Senior pharmacist".
  - *(QA portal)* In `ReviewToolbar` (the toolbar of `/review`, `/review/flags`, the senior pages, `/review/qa` and the not-authorised and QA account views), for roles `qa`, `engineer` and `senior` only: a plain link "QA tools" to `/review/qa` before the role badge, with `aria-current="page"` on `/review/qa`. For role `qa` the badge reads "QA" (`ROLE_LABEL.qa`). The desk's own toolbar (the ReviewDesk island, §4.2) is unchanged; the desk reaches QA tools through the account menu (§6.2).
- **Panes**: `grid-template-columns: var(--pane-side) var(--pane-list) minmax(0,1fr)`, which is 232 px, 336 px and the rest.
- **Sidebar** (`.chrome-sidebar.material`):
  - heading "Batches", with one `.filter` per batch: stack icon, mono batch id, item count. The current batch has `aria-current="true"`. Clicking it clears the filter and the search.
  - heading "Show", with filters (§5.3).
  - *(P1C, seniors only)* heading "Senior review", with two links: "Pair queue" plus the count of pairs to review (`.filter-n`, tabular), to `/review/pairs`; and "Substances", to `/review/substances` (§5.17).
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

**Dismissed issues (P1C, Decision, PO D10, D57).** A counted `dismiss` decision (§5.10a) is a review boundary, like a re-run stamp. Decisions at or before it no longer count. So after a dismissal the record's `review` is `pending` and its display status is `pending`, even when a pharmacist's `ok` came before the issue; a pharmacist (or senior) approves it again.

- In rules 1–3, "counted" means decided after `max(extractedAt, the latest counted dismiss)`.
- Rule 4 (`back_in_review`) applies only when there is no counted dismiss since the run stamp, so a dismissal never shows "Back in review".
- `ApprovalRule.review` returns `pending` (never empty) when the newest decision after the stamp is a `dismiss`. The item's `review` is then reset from `issue` to `pending`.
- The PO's alternative, "restore the prior approval", is not chosen (§13.1 Q4). Restoring it would publish again with no pharmacist looking at the record at that moment. The senior who dismisses is a pharmacist and can press A straight after, so the cost is one key.

**Re-run reach (P1C, D54).** A re-run re-opens a record only when it changes something the record's approval covered (§8.3). A re-run that changes nothing covered leaves an open issue open; the senior dismisses it if the report was a mistake (§5.10a), or an engineer re-runs with `--reopen` (§8.3).

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

**Source links in the table (P1C, PO D8, D58).** The "DGDA source" header cell carries the `SourceLink` "DGDA register (OCL)" with the OCL fetch date. Every `CodeChip` in the "DGDA ingredient code", "Codes n" and "DDInter mapping n" rows carries its source (§5.6.6), on every record and in every status.

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
  - *(P1C, PO D6, D55)* the pairs are split by the API's new `partnerScope` (§7.3). The existing `inBatch` flag cannot do it alone: it is true only when another current product of **this** batch chooses the partner entry, while the ETL lists a text-missing pair whenever the partner entry is chosen by this product or by any product ever mapped (`run.scope_chosen`, `$ETL/stages/ddinter.py` `_applies`). So `inBatch: false` also covers a pair between two ingredients of this combination product, a partner in a later batch when an older batch is re-run, and a partner whose only product was removed from its batch file. Each group shows only when it is not empty, in this order:
    - `partnerScope: "batch"`: note "DDInter text not found for {n} pair[s] with other medicines in this batch.";
    - `partnerScope: "same_product"` (both entries are chosen by this record's own ingredients, and no other product of this batch chooses the partner entry): note "DDInter text not found for {k} pair[s] between ingredients of this product." (new copy, §1.7);
    - `partnerScope: "other"` (the partner entry is chosen only by products outside this batch: another batch, earlier or later, or a product no longer in any current item): note "DDInter text not found for {m} pair[s] with medicines outside this batch." (new copy, §1.7). Before P1C, these pairs sat under the "in this batch" note, which was false. The note never says "earlier", because the partner may be in a later batch.
  - each group has its own toggle button, open by default, `aria-expanded`/`aria-controls`: "Hide the pair" / "Show the pair" when its count is 1, otherwise "Hide the {n} pairs" / "Show the {n} pairs";
  - each group has its own list of `.stage-pair` items: "{nameA} + {nameB} `{ddinterA}/{ddinterB}`" plus a `Severity` chip when the severity is known. Order follows the note (text order of the ids).
  - The triage hint (§5.4 row 5) still counts all text-missing pairs, in both groups.
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
  - pairs: "Not checked, {k} pairs with this batch:" plus chips "{substance} + {other}". *(P1C)* When `otherPairs` (§7.3) holds `no_data` pairs for this substance, a second line follows: "Not checked, {j} pair[s] with medicines in other batches:" plus chips "{substance} + {other}" (new copy, §1.7).
- **Data found** (route-aware, **Decision**; replaces Board R's line, §1.6 item 10):
  - "Interaction data found for this product's route ({route}): `{chosen ids with route}`", plus ", route assumed" when assumed. When the product has no route: "Interaction data found: `{chosen ids with route}`, route assumed";
  - `Severity` chips with counts for the chosen entries, Major, Moderate, Minor and unclassified (group `aria-label` "Drug pairs in DDInter 2.0 by severity");
  - "{total} drug pairs in total. {d} drug and disease interaction[s], {f} drug and food interaction[s]." (counts for the chosen entries);
  - when the substance has more entries than the chosen ones, add "All DDInter entries for {name}: `DDInter351` (systemic), `DDInter352` (ophthalmic), `DDInter353` (otic), {total} drug pairs." For the eye drop this shows 112 for the chosen entry and 654 for all entries.
- **The substance has entries but none fits the route** (`no_route_entry`): "No DDInter entry for this product's route ({route}). Its pairs are not checked." When the product has no route: "No DDInter entry fits this product, which has no route on record. Its pairs are not checked." The pairs are listed as not checked, with reason `no_route`, as plain text, never the hatch.
- **DDInter mapping has not run** (coverage `not_run`): `NOT_RUN` as plain text, never the hatch block and never `NO_DATA_SENTENCE`. Its pairs are listed as not checked, with reason `not_run`. Approval is refused until the DDInter stage has run (§7.2).

#### 5.6.2 "With other medicines" (P1C; was "With the other medicines in this batch")

**Decision (P1C, PO D6, D55).** The record's interactions cover every current medicine we hold, not only its own batch, so the pharmacist never approves a record blind to a partner in another batch. The section heading is "With other medicines" (`<h3>`), and it holds two groups, each with an `<h4>`:

1. **"In batch {batchId}"**: the API's `batchPairs`, rendered exactly as described in the rest of this section.
2. **"In other batches"**: the API's `otherPairs` (§7.3), described at the end of this section.

**When the section shows (fixes `Interactions.tsx`).** The section is shown when **at least one** ingredient has a chosen entry. Today `Interactions.tsx` hides the whole block when any ingredient has coverage `none`, so a combination product with one no-data ingredient loses every pair of its other ingredient. That is a bug. The no-data ingredient's pairs appear in the section as not checked, reason `no_data`, as below. When no ingredient has a chosen entry, the section is not shown; the per-ingredient blocks (§5.6.1) list the not-checked pairs.

**Every pair card in this section** (both groups) shows `FROM_DDINTER` in its meta line and ends with the pair's senior-review state (`PairReviewState`, reviewer surface, §5.17). For a pharmacist or engineer this state is information only. Senior review is not a gate on approval (PO D4).

The API's `batchPairs` are computed with RouteRule for this record and for each partner record.

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

**"In other batches" (P1C).** `otherPairs` is computed like `batchPairs`. It runs against the **latest current item of every product held in any other batch**: the item `ReviewSql.statusOf` reads, and never an item marked "removed from batch file". RouteRule applies on both sides. A product that is also in this batch is listed only under "In batch {batchId}". The group has two `<h5>` subgroups, by the partner product's status:

- "With approved medicines": partners whose display status is `approved`;
- "With medicines not yet approved": every other partner (pending, engineer checked, issue, back in review).

Each subgroup uses the parts of the batch block, with these changes:

- The summary reads "{p} pair[s] found in DDInter 2.0." plus " {nc} pair[s] not checked." when nc > 0, with severity chips (`aria-label` "Pairs with other batches by severity").
- Partner references read "{trade name} (batch `{b}`)", ordered by batch, then trade name. At most 3 are shown, then "and {k} more". A `<details>` lists the partners the API returned (at most 5 per pair or not-checked line, §7.3), each linking to `/review/{b}/{conceptId}`:
  - when `partnerCount` ≤ 5, its summary is "All {n} medicines";
  - when `partnerCount` > 5, its summary is "{s} of {n} medicines", and the list ends with "and {k} more." (k = n − s). For a senior, "See every brand of {partner substance}" follows, linking to `/review/substances/{partnerBdsId}` (§5.17.4). Other roles cannot open the senior pages (§5.17), so they get no link; the pair, its severity and its text are complete either way, and only the names of further brands are left out.
  - the same applies to the partners of `otherPairs.notChecked` lines.
- There is no "None of the {N} batch pairs…" line.
- Not-checked lines and the no-data block are as in the batch block, with the partner named as above.

When there is no other batch: "There are no other batches yet." When other batches exist and `otherPairs` has no pair and no not-checked pair (so every pair with them was checked and DDInter lists none): "DDInter 2.0 lists no interaction between {trade name} and the medicines in other batches. This is not a guarantee that they are safe to combine." (both new copy, §1.7).

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
  6. *(P1C)* "Sources", with note "Where each value came from. Links open the source's own page." It is a `dl` with one row per source the record uses: "DGDA register (OCL)", "RxNav", "WHO ATC/DDD Index", "DrugBank", "ICD-11", "DDInter 2.0". Each row holds the `SourceLink`s of §5.6.6, with "fetched on {date}" where a fetch time is stored. Every label is new copy (§1.7).
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
| `extract` with `carriedFrom` *(P1C, §8.3.1 item 8)* | "Pipeline extracted this record", then a second line: "Approval carried over from batch {batchId}: nothing it covered changed." |
| `decision` ok, pharmacist | "Approved by a pharmacist. Published." / "Approved by a pharmacist (you). Published." |
| `decision` ok, engineer | "Engineer checked. Not published." / "Engineer checked (you). Not published." |
| `decision` issue | "Issue reported by a pharmacist. Note:" / "Issue reported by an engineer. Note:" / "Issue reported (you). Note:", followed by the note in `.raw` |
| `decision` ok, senior *(P1C)* | "Approved by a senior pharmacist. Published." / "Approved by a senior pharmacist (you). Published." |
| `decision` issue, senior *(P1C)* | "Issue reported by a senior pharmacist. Note:", followed by the note in `.raw` ("(you)" as above) |
| `decision` dismiss *(P1C, PO D10)* | "Issue dismissed by a senior pharmacist. Note:" / "Issue dismissed (you). Note:", followed by the dismissal note in `.raw` |

- *(P1C)* **The reporter's note stays.** A dismissal never hides or changes the issue entry it dismisses. That entry and every other decision at or before the dismissal (and after the run stamp) gets the suffix " No longer counts: a senior pharmacist dismissed the issue after it." (new copy, §1.7). When a decision is at or before both a dismissal and the current stamp, the re-run suffix below wins.
- History shows roles only, never an email, for the senior too.
- **One `extract` entry per pipeline run.** Every stage of a run stamps the item (§8.1), so one full run writes up to four snapshots. The API collapses the snapshots that share a `run_id` (§7.6) into one `extract` entry at the last stamp of that run. Its reason is `run` when the group holds the item's first snapshot, `shared_change` when every snapshot in the group is `shared_change`, and `rerun` otherwise.
- A decision that no longer counts (made at or before the current `extractedAt`) gets the suffix " No longer counts: the record was re-run after it." (**Decision**).
- Emails are never shown. "(you)" comes from the API's `mine` flag.

#### 5.6.6 Source links (P1C, PO D8, D58)

**Decision.** Every code links to its public source page, next to the stored source text. "fetched on {date}" is added where we store a fetch time. On the desk, links show for every record, whatever its status. On public pages they show only for approved records (§6.5, P2). The URL is built **only** by the API (`$API/domain/SourceLinks.java`), from the system and the code, and it is sent as `source: {url, label, fetchedAt}` (§7.3). The web renders it with `SourceLink` and never builds a source URL itself. The code is checked against its system's pattern before a URL is built. A code that fails the check gets no link and is still shown. The user takes responsibility for licences (PO D8). §13.1 Q1 still covers the attribution lines.

Each pattern below was checked live, read-only, on 15/10/2026 with real pilot codes. "curl" means a plain HTTP GET; "browser" means a real Chromium page load, for single-page apps and bot-protected sites.

| System | Code pattern | Link (`{c}` = URL-encoded code) | Link text | "fetched on" from | Verification, 15/10/2026 |
|---|---|---|---|---|---|
| DGDA register (brand) | concept id | `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/{c}/` (existing `sourceUrl`, §7.3) | "DGDA register (OCL)" | `raw.ocl_concept.fetched_at` | curl 200 (single-page app; it is the existing S key target) |
| RxCUI | `^[0-9]{1,10}$` | `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm={c}` | "RxNav" | `raw.http_snapshot.fetched_at`, source `rxnav`, key `GET /REST/rxcui/{c}/properties.json` | curl 200; browser: 161 shows "acetaminophen [RxCUI 161]". The REST form `https://rxnav.nlm.nih.gov/REST/rxcui/161/properties.json` also answers 200 JSON (`"name":"acetaminophen"`), but it is not a reader's page and is not used. |
| ATC | `^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$` | `https://atcddd.fhi.no/atc_ddd_index/?code={c}&showdescription=no` | "WHO ATC/DDD Index" | the RxNav snapshot `GET /REST/rxcui/{rxcui}/allProperties.json?prop=codes` of the substance's RxCUI (the code came from RxNav) | curl 200: N02BE01 lists "N02BE01 paracetamol 3 g O"; B01AA03 200 |
| DrugBank | `^DB[0-9]{5}$` | `https://go.drugbank.com/drugs/{c}` | "DrugBank" | the same RxNav snapshot | browser: DB00316 opens "Acetaminophen: Uses, Interactions, Mechanism of…". curl gets 403 (DrugBank's bot challenge), so nothing automated ever requests it. |
| SNOMED CT | `^[0-9]{6,18}$` | **Fallback (search):** `https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm={c}` | "RxNav (SNOMED CT search)" | the same RxNav snapshot | The SNOMED International browser (`https://browser.ihtsdotools.org/?perspective=full&conceptId1={c}&edition=MAIN&release=&languages=en`) and `https://snomed.info/id/{c}` refused connections from two networks (curl: connection refused, once 423 Locked; the fetch tool: ECONNREFUSED). The NHS browser (`termbrowser.nhs.uk`) answers 200 but opens a cookie and licence screen, not the concept. RxNav, our actual source of the code, resolves 387517004 to "acetaminophen [RxCUI 161]" (browser). |
| ICD-11 (DGDA ingredient XM code) | `^XM[0-9A-Z]{4}$` | **Fallback (no deep link by code):** `https://icd.who.int/browse/latest-release/mms/en` | "Search ICD-11 for {code}" | `raw.ocl_concept.fetched_at` (the XM code comes from the DGDA register) | `#XM5DJ7` opens only the browser root (browser). The coding tool `#/?q=XM5DJ7` is ignored, `/search?q=` is 404, and the code API `id.who.int/…/codeinfo/XM5DJ7` needs OAuth (401). The browser deep-links only by entity id: `https://icd.who.int/browse/latest-release/mms/en#173693607` opens "XM5DJ7 Acetaminophen" (browser). We store no entity id (§13.1 Q9), so the link opens the browser and its text names the code to search. |
| DDInter entry | `^DDInter[0-9]{1,6}$` | `https://ddinter2.scbdd.com/server/drug-detail/{c}/` | "DDInter 2.0" | `curated.ddinter_drug.fetched_at` | curl 200: DDInter14 "Acetaminophen", DDInter352 "Chloramphenicol (ophthalmic)", DDInter1951 "Warfarin" |
| DDInter pair | stored `interaction_id`, `^[0-9]{1,9}$` | `https://ddinter2.scbdd.com/server/interact/{interactionId}/`; no link when the pair has no `interaction_id` | "Full record in DDInter 2.0" | none: no per-pair fetch time is stored, so no date is shown | curl 200: 3039 (DDInter1951 + DDInter9) |

Rules:

- **Placement on the desk.** The comparison table (§5.5.2); the per-ingredient block's "Interaction data found…" line, where each chosen entry id carries its DDInter link; every pair card (the pair link in the footer, after the source line); and the evidence drawer's "Sources" (§5.6.3).
- **Link behaviour.** Links open in a new tab (`target="_blank" rel="noopener noreferrer"`, with sr-only " (opens in a new tab)"). They never take a shortcut key: S stays the DGDA source.
- **Dates.** "fetched on {DD/MM/YYYY}" is the Dhaka date of the stored time (`fmtDhakaOn` without the time).
- **No automated calls.** CI asserts the hrefs only and never calls the external sites. The P1C PR re-runs the browser check above with the pilot codes and records the results.
- **Security.** The links are plain `<a>` elements, so they need no CSP change (§9.4). `Referrer-Policy: same-origin` (§9.4) keeps our paths out of the source sites' logs.

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
2. **Report panel** (`.bar-report`, hidden unless open), §5.10. *(P1C)* **Dismiss panel** (`.bar-report.bar-dismiss`, hidden unless open, seniors only), §5.10a. At most one of the two panels is open at a time. Opening one closes the other and keeps its draft.
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
     - *(P1C)* "Dismiss issue `D`" (tonal, `aria-expanded`, `aria-controls`, `aria-keyshortcuts="D"`). It is rendered only for role `senior`, and only when the display status is `issue`. Pharmacists and engineers see the issue (pill, promise and history) but no Dismiss control, and D does nothing for them;
     - "Report issue `R`" (tonal, `aria-expanded`, `aria-controls`, `aria-keyshortcuts="R"`);
     - "Looks correct `A`" (primary, `aria-keyshortcuts="A"`).
6. **Bot row** (hidden unless a bot hold is active, and always hidden while the no-auth or signed-out block shows):
   - `.field-error` "We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.";
   - "Retry check" (busy label "Checking").
   - When Try again (item 1) or Retry check succeeds, focus moves to "Looks correct" if the committed record is the open one, otherwise to the workspace region (Board R).
7. **Hint** `.decision-hint`. Hidden by default. Each hint shows for 5000 ms and is also announced.
8. **Key row** (`aria-hidden="true"`): "`J` `K` next, previous · `A` looks correct · `U` undo · `R` report · `E` evidence · `S` DGDA source · `?` all keys". *(P1C)* For role `senior`, while the status is `issue`, " · `D` dismiss issue" is inserted after "`R` report". Hidden when single-key shortcuts are off (§5.14) or the viewport is under 480 px tall (§5.1).

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
| *(P1C)* dismissing on this record (dismiss sent, outcome pending) | "**Dismissing the issue.** Saving now." |
| *(P1C)* senior viewing `issue` | "**An issue is open on this record.** If the report was a mistake, dismiss it. Otherwise it returns to review after the fix and re-run." |
| `issue` | "**An issue is open on this record.** It returns to review after the fix and re-run." |
| engineer viewing `engineer_checked` | "**Your check is recorded.** A pharmacist still needs to approve." |
| otherwise | `PROMISE_PHARMACIST`, `PROMISE_SENIOR` *(P1C)* or `PROMISE_ENGINEER` |

**"Looks correct" is `aria-disabled="true"`** (it stays focusable; pressing it shows the hint) when:

- the record is not open, or the page is loading;
- the record is stale;
- an undo window is open on this record;
- a failed commit is pending on this record;
- the status is `approved` or `issue`;
- any stage has status `fail`, or one of the four stages has no result (the API refuses it too, §7.2);
- the report panel is open;
- *(P1C)* the dismiss panel is open, or a dismissal is saving;
- the evidence drawer is open;
- the role is engineer and the status is `engineer_checked`;
- the account is not authorised, or the session has expired.

**"Report issue" is `aria-disabled`** when the record is not open, is stale, or the evidence drawer is open. Report stays available on `approved` and `issue` records. A report on an approved record withdraws it from public view, and the API allows it. *(P1C)* This is also how a senior withdraws any approval (PO D2).

*(P1C)* **"Dismiss issue" is `aria-disabled`** (it stays focusable; pressing it shows the hint) when the record is stale, the evidence drawer is open, an undo window or a failed commit is open on this record, a bot hold is active, or the account is not authorised or signed out. It is not rendered unless the role is `senior` and the status is `issue`.

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
botHold{kind:"report"}   └─ RETRY_OK → send report (P1C: or dismissal, by op.decision; same requestId and viewedVersion)
netErr                   └─ TRY_AGAIN → committing (fresh Turnstile token, same requestId and viewedVersion, no new window)

report channel (separate state beside the commit; P1C: also carries dismissals, op.decision = "issue" | "dismiss")
idle     └─ SEND_REPORT | SEND_DISMISS [no other report or dismissal on the channel] → sending{op}
sending  └─ OK → idle + saved   └─ CONFLICT → idle + stale banner or hint   └─ CAPTCHA → botHold{kind:"report", op}
         └─ RATE_LIMITED → netErr{op, saved:"no"}   └─ NETWORK | 5xx | TIMEOUT(10 s) → netErr{op, saved:"unknown"}
netErr   └─ TRY_AGAIN → sending (fresh Turnstile token, the same op: same decision, note, requestId and viewedVersion)
```

*(P1C)* **Dismissal uses the report channel (Decision).** `commit-machine.ts` has two channels today, `commit` and `report`, each with its own `netErr`. A dismissal is sent on the **report** channel as an op with `decision: "dismiss"`; there is no third channel. So a report and a dismissal never run at the same time (the two panels are never open together either, §5.7), and an approval's undo window on another record is not affected. There is no undo window (the panel and its note are the confirm step, §5.10a). `SEND_DISMISS(record)` is allowed only for role `senior` with display status `issue`, and only while the report channel is `idle`. It sends `decision=dismiss` with the note, the record's `viewedVersion` and a new `requestId`, all held in the op. The outcomes:

- `OK` → idle + saved, and `viewedVersion := outcome.version` (own saves never make the record stale);
- `CONFLICT(stale_rerun | stale_decision)` → stale banner;
- `CONFLICT(no_issue | removed)` → hint (§5.8.4) + refresh;
- `CAPTCHA` → `botHold{kind:"report"}` holding the dismiss op; Retry check resends that op;
- `RATE_LIMITED` → report-channel `netErr{saved:"no"}`; network, 5xx and timeout → `netErr{saved:"unknown"}`. **Try again** on it (`TRY_AGAIN`, channel `report`) resends the **same op**: `decision=dismiss`, the same note, `requestId` and `viewedVersion`, with a fresh Turnstile token. It never resends an approval;
- `FORBIDDEN`, `UNAUTHENTICATED` → the no-auth or signed-out block, as for commits.

**Where a failed dismissal shows.** In the report channel's crit `Banner` in the decision bar (the one that shows a failed report today, `DecisionBar.tsx`), with the dismissal copy of §5.10a chosen by `op.decision`. It is never the §5.7 approval banner ("… Decision: Looks correct on {name}."). The §5.7 promise rows "Your decision was not saved…" and "Your decision may not have been saved…" and the §5.4 row hints "Decision not saved" and "Decision not confirmed" describe the commit channel only; while a dismissal is failed, the promise stays at the "senior viewing `issue`" row. The dismiss panel stays open with its note until the dismissal is saved or cancelled.

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
| A or R (and, *P1C*, D) while the evidence drawer is open | "Close the evidence first (Esc)." |
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
| *(P1C)* D on a record with no open issue (senior) | "No issue is open on this record." |
| *(P1C)* D on a stale record (senior) | "Decisions are paused. Reload the record first." |
| *(P1C)* D during an undo window, a saving commit or a failed commit on this record | "Finish or undo your decision on this record first." |
| *(P1C)* Send dismissal while stale | "Dismissing is paused until you reload the record. Your note is kept." |
| *(P1C)* API 409 `no_issue` at dismissal | "No issue is open on this record any more. Nothing was saved." |
| *(P1C)* API 409 `removed` at dismissal | "This record was removed from the batch file. Nothing was saved." |

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
   - pharmacist (and, *P1C*, senior): `pending`, `back_in_review` or `engineer_checked`;
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

### 5.10a Dismiss issue (D) (P1C, PO D10, D57)

**Decision.** A senior pharmacist can dismiss an open issue on a record when the report was a mistake, without a pipeline re-run. A dismissal is a new append-only decision, `decision = 'dismiss'`, in `ops.review_decision` (V7, §7.8). It has a required note of 5–1000 characters. It is audited, version-guarded and idempotent by `requestId`, like every decision (§7.2). After it, the record is `pending` (§5.2): a pharmacist approves it again. Only role `senior` may dismiss: the web refuses other roles with `forbidden`, and the API refuses them with 400 `field=reviewerRole` (§7.2). The reporter's note stays in the history (§5.6.5).

- **Who sees what.** The "Dismiss issue `D`" button (§5.7) is rendered only for a senior, on a record whose display status is `issue`. A pipeline issue ("not found at source", "not a registered Drug product") is display status `pending`, not `issue` (§5.2), so it cannot be dismissed. Only a re-run clears it.
- **D, or the button,** opens the dismiss panel and focuses its field. When the panel is already open, D focuses the field. Clicking the button while the panel is open closes the panel, keeps the draft, and leaves focus on the button. Opening it closes an open report panel, keeping that draft.
- **Panel** (`.bar-report.bar-dismiss`, `role="group"`, `aria-labelledby` its title), top to bottom:
  - title "Dismiss this issue";
  - the open issue, quoted: "Reported by {a pharmacist|a senior pharmacist|an engineer|you} on {fmtDhaka(at)}:" followed by the reporter's note in `.raw`. When several counted issues are open, each is quoted, oldest first;
  - consequence sentence: "Dismissing records that the report was a mistake. The record goes back to “Not yet reviewed by a pharmacist”, and a pharmacist approves it again. The report stays in the history.";
  - field: label "Why was the report a mistake? Pharmacists and engineers read this note."; placeholder "For example: the strength matches the DGDA register; the report misread it"; `maxlength=1000`; help "5 to 1000 characters." followed by `NO_PHI_HELP`; counter "{len} / 1000"; error "Add at least 5 characters so the team knows why the report was dismissed." The error rules are those of §5.10 (`aria-invalid`, counter, cleared at 5);
  - actions: "Cancel `Esc`" (tonal sm) and "Dismiss issue `Ctrl Enter`" (primary sm, busy label "Dismissing"; "⌘ Enter" on Mac). Enter alone never sends.
- **The confirm step** is the panel: opening it, writing the note, then pressing "Dismiss issue" or Ctrl/Cmd+Enter. Nothing is sent before that second action. There is no undo window, because a dismissal publishes nothing: the record becomes `pending`.
- **Esc** in the field closes the panel and keeps the draft. **Cancel** discards the draft. In both cases focus returns to "Dismiss issue". Drafts follow §5.10, under the key `intellidrugs-dismiss-draft:{batchId}:{conceptId}`, and are cleared on send and on sign-out.
- **While stale**: Send is `aria-disabled`, and `.bar-report-paused` shows "Dismissing is paused until you reload the record. Your note is kept."
- **Sending:** a trimmed length below 5 shows the error and announces it. Otherwise the island takes a Turnstile token (the report channel's bot hold, holding the dismiss op, if it has none) and calls the `decide` action on the report channel (§5.8.2) with `decision=dismiss`, the note, `viewedVersion` and a new `requestId`.
- **On success:**
  - the status becomes `pending`, and the pills read `NOT_REVIEWED`;
  - the draft is cleared and the panel closes;
  - focus moves to "Looks correct" (the dismiss button is no longer rendered);
  - announce "Issue dismissed for {name}. The record is back in review for a pharmacist.";
  - no auto-advance.
- **Failure states**: on the report channel (§5.8.2), shown in its crit `Banner` in the decision bar, never in the §5.7 approval banner:
  - not saved: title "Couldn't send your dismissal.", body "Nothing was saved. Check your connection and try again.";
  - unconfirmed: title "Couldn't confirm your dismissal.", body "We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice.";
  - each with "Try again" (busy label "Dismissing"), which resends `decision=dismiss` with the same note, `requestId` and `viewedVersion`. The announcement is the banner's title and body. A 409 `no_issue` (another senior dismissed it, or a re-run cleared it) shows its hint (§5.8.4) and refreshes the record.
- **Without JavaScript**: not possible, as for every decision (Turnstile). The `<noscript>` line of §4.4 covers it.
- **a11y**: the button has `aria-expanded` and `aria-controls`. The panel's field has `aria-describedby` pointing at the help, the counter and the error. The quoted report is plain text before the field, so a screen reader reads it first. Focus never falls to `<body>` (§10.1).

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
| `review` | issue open, already approved, already checked; *(P1C)* for `dismiss`: no open issue (`no_issue`) | hint |
| `stages` | a stage failed or has no result, or the item has no run stamp | hint (`stage_failed`) |
| `conceptId` | removed from the batch | hint |

### 5.12 Whole-view states

| State | What renders | Exact copy |
|---|---|---|
| Loading (`app/review/[batchId]/loading.tsx` and in-island transitions longer than 300 ms) | 7 skeleton rows (`.sk`, pulse), detail skeleton, decision bar disabled. Reduced motion: no pulse. The list header count reads "Loading". | `role="status"`: "Loading batch {id}". When an in-island transition longer than 300 ms ends, announce "Batch {id} loaded." (never on the first server render). Exception: the auto-advance after a save (§5.9) announces neither "Loading" nor "loaded"; its save confirmation is the only announcement for that move. |
| Empty filter or search | see §5.3 | "No records with an issue reported." etc., "Show all {n} records" |
| Batch complete (every current item approved) | `.done` in the record pane, no animation: approved pill, `<h2>` "Batch {id} approved. {n} records are now public.", paragraph, button | "Each record was approved by a pharmacist. If the pipeline re-runs a record, it goes back in review and leaves public view until a pharmacist approves it again." *(P1C, D54: the second sentence becomes "If the pipeline changes data a record's approval covered, it goes back in review and leaves public view until a pharmacist approves it again.")* Button: "Open record 1" |
| Not authorised (role `user` on any `/review` route) | Server page, no batch data: info banner, then two buttons | title "Your account can't review this batch."; body "Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account."; then a warn banner "This Google account isn't on the reviewer list." with "You're signed in as {own email}. Reviewer tools need the account your invite was sent to. You can still search and check interactions."; buttons "Use another Google account" (signs out, then opens `/signin?returnTo=/review`) and "Search medicines" |
| *(QA portal)* QA account on a review page (role `qa` on any `/review/*` page except `/review` and `/review/qa`, D66) | Server page, status 200, no review data and no review API call: the reviewer toolbar (§5.1, with the "QA tools" link and the "QA" badge), an info banner, then two buttons. No warn banner: the account is on `REVIEWERS`, so the "isn't on the reviewer list" banner would be false. | title "Your account has QA access, not reviewer access."; body "QA accounts read data through QA tools. Reviewing records needs a reviewer invite."; buttons "Open QA tools" (tonal, to `/review/qa`) and "Search medicines" (plain) |
| Not signed in on `/review` | Redirect 307 to `/signin?returnTo=/review/...` | n/a |
| Role lowered mid-session (the server action returns `forbidden`) | The record stays on screen. The no-auth block replaces the decision bar (§5.7). An open window is cancelled. | announce "Your account can't review this batch. Your decision on {name} was not saved." |
| Session expired mid-session (the server action returns `unauthenticated`) | The record stays on screen. The signed-out block replaces the decision bar (§5.7). An open window is cancelled. The note draft is kept. | announce "Your sign-in expired. Your decision on {name} was not saved." |
| API error loading the batch (`app/review/error.tsx`) | `Banner` crit with "Try again" (`reset()`) | title "Couldn't load batch {id}."; body "Nothing was changed. Check your connection and try again." |
| Batch not found | `notFound()` page | "No batch with the id {id}." with "Open the review desk" |

### 5.13 Role promises and invites

- **Roles** come from `REVIEWERS` (unchanged syntax `email:role,…`, roles `pharmacist` and `engineer`). They are global. **Decision**: no per-batch roles in this release. The copy "for batch {id}" names the newest `in_review` batch.
- *(P1C, PO D2, D49)* **Senior pharmacist.** `REVIEWERS` accepts a third role token, `senior` (for example `a@x.org:senior`). Anything else is still skipped. A senior has every pharmacist power (§2.2) plus §5.10a and §5.17.
- *(P1C)* **Every role gate learns `senior` (Decision).** The web hard-codes `pharmacist | engineer` in many places, and a senior session breaks at each one unless it changes. P1C changes all of them, and none may keep its own role list:
  - `$WEB/lib/reviewers.ts`: `ReviewerRole` adds `senior`; `ROLES` = `["pharmacist", "engineer", "senior", "user"]` (`lib/session.ts` rejects a role outside `ROLES`, so without it a senior session decodes to null, which is signed out); `parseReviewers` accepts `senior`; `ROLE_LABEL.senior` = "Senior pharmacist"; `isReviewer()` accepts it. A new helper `actsAsPharmacist(role)` (true for `pharmacist` and `senior`) is the one test for pharmacist powers;
  - the inline role checks are replaced by `isReviewer()`: the local `isReviewer` in `lib/actions-core.ts`, the `pharmacist`/`engineer` test in `lib/desk-core.ts` `runDecide` (which today answers a senior `forbidden`), `components/Header.tsx`, `components/review/ReviewAccount.tsx` and `components/review/ReviewToolbar.tsx`;
  - `app/review/[batchId]/page.tsx` and `app/review/[batchId]/[conceptId]/page.tsx` pass `session.role` through unchanged. Today they turn every non-engineer into `pharmacist`, so the API would get `reviewerRole=pharmacist` and a dismissal would be refused with 400 `reviewerRole`;
  - pharmacist-or-not tests use `actsAsPharmacist`: `components/review/desk/bar-state.ts` (the promise), `components/review/desk/advance.ts` `needsFor`, `components/review/detail/ConfirmPanel.tsx`, and `lib/review-copy.ts` `toastSub` and `savedText` (a senior's toast reads "Publishes in {n} seconds." and the saved text "…approved by a pharmacist and published.", as for a pharmacist);
  - `lib/review-copy.ts` `historyText` gets a `senior` branch for `ok` ("Approved by a senior pharmacist. Published."), `issue` ("Issue reported by a senior pharmacist. Note:") and `dismiss` (§5.6.5). Today every role that is not `pharmacist` falls to the engineer branch, so a senior `ok` would read "Engineer checked. Not published.";
  - `ROLE_LABEL_DESK` (`lib/review-copy.ts`) adds `senior: "Senior pharmacist"`; `lib/review-types.ts` `ReviewerRole` and the `reviewerRole` type in `lib/api.ts` (the decision body) add `senior`, and that body's `decision` adds `dismiss`;
  - the API's `AuditService.ROLES` adds `senior` (§7.5); without it every web audit event of a senior (`sign_in`, `review_open`, `evidence_open`, `decision_denied`, `senior_open`) is refused with 400. V7 widens only the database `CHECK`.

  A unit test (§11.1 `reviewers.test.ts` and `review-copy.test.tsx`) pins each point, including that a senior `ok` history line reads "Approved by a senior pharmacist. Published.".
- *(QA portal, D66)* **QA.** `REVIEWERS` accepts a fourth role token, `qa` (for example `q@x.org:qa`), label "QA". A `qa` account is **not a reviewer**: it has no power in §2.2 beyond a reader's, plus the QA tools page and its own QA keys (§5.18, §7.10). The roles that may use QA tools are `qa`, `engineer` and `senior`; `pharmacist` and `user` may not. Pharmacist, engineer and senior semantics are unchanged. **Every role gate learns `qa` (Decision)**, and none may keep its own role list:
  - `$WEB/lib/reviewers.ts`: `Role` = `ReviewerRole | "qa" | "user"`; `ROLES` = `["pharmacist", "engineer", "senior", "qa", "user"]` (without it a `qa` session decodes to null); `parseReviewers` accepts `qa`; `ROLE_LABEL.qa` = "QA"; `isReviewer()` stays `pharmacist | engineer | senior` and is false for `qa`; a new helper `canUseQa(role)` (true for `qa`, `engineer`, `senior`) is the one test for QA tools. `ReviewerRole` (`lib/review-types.ts`), `ROLE_LABEL_DESK` and every decision type are unchanged, so no desk or senior code path can type a `qa` role;
  - `app/review/layout.tsx` admits a session when `isReviewer(session) || canUseQa(session.role)` (anonymous: sign-in redirect; `user`: not-authorised page, as today). Because a layout cannot see the path, **every page under `app/review/` other than `qa/page.tsx` re-checks `isReviewer` and renders the §5.12 QA account view for role `qa`** (`app/review/page.tsx` redirects it to `/review/qa` instead): `[batchId]/layout.tsx`, `[batchId]/page.tsx`, `[batchId]/[conceptId]/page.tsx`, `flags/page.tsx`, `pairs/page.tsx`, `substances/page.tsx` and `substances/[bdsId]/page.tsx`. Today they `return null` for a non-reviewer, which a `qa` session would see as a blank page. `[batchId]/versions/route.ts` keeps its `isReviewer` check (403 `FORBIDDEN` for `qa`). A component test walks every `app/review/**/page.tsx` and fails when one renders data or calls a review read for a `qa` session (§11.2);
  - every server action keeps `isReviewer()` (or `actsAsPharmacist`, or the senior test), so a `qa` session is `forbidden` before any API call and writes its `decision_denied` row as today: `decide` and `decideFormAction` (`runDecide` in `lib/desk-core.ts`: approve, report, dismiss and the no-JavaScript confirm), `loadDiff`, `pairDecide` (`runPairDecide` in `lib/senior-core.ts`), `resolveFlagAction` (`submitResolve` in `lib/actions-core.ts`), and the audit actions `logRecordOpen`, `logEvidence`, `logSeniorOpen` and `logOpenOnRender`. Flags and partner requests stay open to any signed-in account, `qa` included (as a reader);
  - `components/Header.tsx` and `components/review/ReviewAccount.tsx`: the account menu items of §6.2; `components/review/ReviewToolbar.tsx`: the §5.1 link and badge; `components/public/Welcome.tsx` and `app/signin/page.tsx`: the QA welcome state (§6.2), and `app/signin/page.tsx` reads `listReviewBatches()` for reviewer roles only (today it reads it for every role except `user`);
  - the API: `AuditService.ROLES` adds `qa` (a `qa` session's `sign_in`, `sign_out` and `decision_denied` rows); `ReviewService.ROLES`, `ApprovalRule` and `SeniorReviewService` do **not**, so `reviewerRole=qa` is 400 `field=reviewerRole` on every decision and pair decision, and V9 leaves the `review_decision` and `pair_review` role checks narrow, so the database refuses a `qa` decision too (§7.10.1).
- *(QA portal)* **Invite for a QA account** (same procedure; `docs/runbooks/reviewer-invite.md` adds it): "Role: QA. You read IntelliDrugs data for quality checks through QA tools: your own keys, the MCP server and the QA API. You can't review or publish records. Sign in at drugdb.eliooo.org with this Google account." Removing a `qa` entry from `REVIEWERS` (or changing it to `pharmacist`) stops every DB key the account owns on the next request (§7.10.4).
- *(P1C, PO D1, D50)* **Publishing is unchanged.** Any pharmacist's (or senior's) "Looks correct" approves and publishes its record, batch by batch, as today. Batches stay the unit of engineering review: an engineer checks extraction correctness record by record in its batch. The senior's clinical review (§5.17) runs across batches and after the fact.
- **Pharmacist "Looks correct"**: publishes after the window. Engineer: records the check and never publishes.
- **Invites are sent by the team by hand** (**Decision**: no SES automation). The fixed template is:
  - subject "You're invited to review medicines on IntelliDrugs";
  - body "Role: {Pharmacist|Engineer}. Batch {id}, {n} records. Sign in at drugdb.eliooo.org with this Google account." *(P1C)* For a senior: "Role: Senior pharmacist. You review batches as a pharmacist, and the interaction pairs of every batch in Senior review. Sign in at drugdb.eliooo.org with this Google account."
  - The template lives in `docs/runbooks/reviewer-invite.md`.
- **Adding a reviewer**: append to `REVIEWERS` in the host `.env`, then `cd ~/drugdb/deploy && docker-compose up -d web` (the host has the `docker-compose` binary, and the compose file names the project `bddrug`; §12.4). That restarts only the web container.

### 5.14 Keyboard model

The model is scoped to the workspace region: `id="desk"`, `role="region"`, `tabindex="0"`, `aria-label="IntelliDrugs review workspace. Shortcuts work while focus is inside. Press question mark for the list."`

| Key | Action | Behaviour |
|---|---|---|
| A | Looks correct | §5.8 |
| U | Undo | Cancels the open window |
| R | Report issue | Opens the note field and focuses it, or focuses the open one |
| D *(P1C)* | Dismiss issue | Senior only, on a record with an open issue: opens the dismiss panel and focuses its field, or focuses the open one (§5.10a). For other roles it does nothing and shows no hint. |
| J / K | Next / previous | Moves within the visible order. At the ends: "This is the last record in this view." / "This is the first record in this view." Empty view: "No records in this view. Show all {n} records to move." |
| ArrowDown / ArrowUp, Home / End | List navigation | Only when the listbox has focus |
| E | Evidence | Toggles the drawer. While the drawer is open, A and R only show the hint "Close the evidence first (Esc)." (§5.7) |
| S | DGDA source | `window.open(sourceUrl, "_blank", "noopener")`. `sourceUrl` = `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/{encodeURIComponent(conceptId)}/` |
| ? | Shortcuts sheet | Modal (below) |
| Esc | Close | Closes, in this order: the sheet, the drawer, the note panel (keeping the draft), the search text |
| Enter | Never approves | On "Looks correct", blocked with or without modifiers, with a hint. Space still presses the focused button. |
| Ctrl Enter (Cmd Enter on Mac) | Send report | Only inside the note field. *(P1C)* Inside the dismiss field it sends the dismissal. |

Rules:

- Shortcuts are ignored when the event target is `input`, `textarea`, `select` or `contenteditable`, except Esc and Ctrl/Cmd+Enter in the note field.
- Shortcuts are ignored when Ctrl, Cmd or Alt is held (browser shortcuts keep working).
- Letter keys are matched case-insensitively. `?` is matched by `event.key`.
- **Single-key shortcuts can be turned off (Decision; WCAG 2.1.4, and speech-input users).** A `Segmented` control "Single-key shortcuts: On / Off" sits in the shortcuts sheet under "Settings" and in the AccountMenu on `/review/*`. It is stored in the cookie `intellidrugs-keys` = `on` | `off` (same attributes as `intellidrugs-undo`, §5.8.1; any other value reads as `on`). When it is Off:
  - A, U, R, D *(P1C)*, J, K, E, S and ? do nothing; the buttons, links and listbox arrow keys still work;
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
  - *(P1C, seniors only)* "Dismiss an open issue" (key D), after "Report an issue"
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
| `decision` | API, in the decision transaction | Every accepted decision | `batch_item`; `outcome` = `ok`, `issue` or, *P1C*, `dismiss` |
| `decision_rejected` | API, in its own transaction after the decision transaction rolls back (§7.2) | 409 or 400 on a decision. `outcome` = the code. | `batch_item` |
| `decision_denied` | web `decide` action | A decision or report stopped in the web layer before any API call. `outcome` = `captcha`, `forbidden`, `rate_limited` or `unauthenticated` (`actor_email` null when unauthenticated). | `batch_item` |
| `flag_created`, `flag_resolved`, `partner_request` | API | Accepted | `flag` id |
| `pair_decision` *(P1C)* | API, in the pair decision transaction | Every accepted pair decision (§7.7) | `ddinter_pair` `{ddinterA}/{ddinterB}`; `outcome` = `reviewed` or `issue` |
| `pair_decision_rejected` *(P1C)* | API, in its own transaction after the pair decision fails | 409 or 400 on a pair decision. `outcome` = the code. | `ddinter_pair` |
| `senior_open` *(P1C)* | web (SeniorDesk, via the `logSeniorOpen` server action) | A senior page is shown (it reads unreviewed data from every batch). Never on a prefetch. At most one per actor, page and 10 minutes. | `substance` `{bdsId}`, or `pair_queue` `{show}` |
| `qa_read` *(QA)* | web, the `/api/qa/v1/*` route handlers (§7.9.6); *(QA portal)* and the hosted MCP server's tool calls (§7.10.6) | Every QA API call *(QA portal: there is no disabled state any more, §7.9.1)*, and every hosted MCP `tools/call`; `unauthorized` and `rate_limited` rows throttled. `outcome` = `ok` or the lower-cased error code. No actor email or role. | `qa_route` `{label}/{route}` (`{route}` alone when unauthenticated). *(QA portal)* A DB key's label is `key.{id}`; an MCP request refused before a tool runs uses the route name `mcp` |
| `qa_key_created` *(QA portal)* | API, in the key-creation transaction (§7.10.3) | Every key created | `qa_key` `{id}`; `outcome` = `ok`; `actor_email` = the owner, `actor_role` = the session role (`qa`, `engineer` or `senior`). Never the key or its hash. |
| `qa_key_revoked` *(QA portal)* | API, in the revocation transaction (§7.10.3) | Every key revoked by its owner | `qa_key` `{id}`; `outcome` = `ok`; actor as above. Never the key or its hash. |

- Undo and discarded windows are **not** audit events, because nothing reached the server.
- Audit rows hold `actor_email` (team-only, like `review_decision`), `actor_role` (*P1C*: also `senior`; *QA portal*: also `qa`) and `request_id`. There are no IP addresses and no free text from forms. For `decision` and `decision_rejected`, `request_id` is the decision's `requestId` (§7.2); for other events it is the web request id, the `x-request-id` header the middleware sets on every request (§9.4).
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
- *(P1C)* For seniors, when k > 0, a line under the `<h1>`: "Pair issues reported by senior pharmacists: {k}", linking to `/review/pairs?show=issue` (§5.17).
- API error: crit `Banner` "Couldn't load the reports." / "Nothing was changed. Check your connection and try again." with "Try again".
- Paging: 50 per section (§7.5), with "Next page" and "Previous page" links.
- Without JavaScript the list reads fully; Resolve needs the bot check and shows the `<noscript>` line "Resolving needs JavaScript for the bot check."

### 5.17 Senior clinical review (P1C, PO D2, D3, D5; D49, D51, D52)

No board draws these pages. They use the reviewer toolbar (§5.1), with "Senior review" and "{t} pair[s] to review" (tabular) in place of the batch centre section. Below the toolbar sits a nav row (`<nav aria-label="Senior review">`) with the links "Pair queue" and "Substances", the current one carrying `aria-current="page"`. Then comes one column of at most 960 px, built from `ui/` components only. All copy here is new (§1.7). Every read covers **all batches at once**, so a review never misses a partner in another batch.

**Access (Decision).** Role `senior` only. Anonymous visitors get the 307 sign-in redirect (§2.3). Role `user` gets the not-authorised page (§5.12). *(QA portal)* Role `qa` gets the §5.12 QA account view, not the banner below. Pharmacists and engineers get status 200 and an info `Banner`: title "Senior review is for senior pharmacists.", body "Your account reviews batches. Ask the IntelliDrugs team if you need senior access.", and the button "Open the review desk". These pages carry no data for those roles (§13.1 Q8).

**What "substances we hold" and "pairs" mean (Decision).**

- A substance is **held** when the latest current item of at least one product carries it. "Latest current" is the item `ReviewSql.statusOf` reads, never an item marked removed. This holds in any batch and in any review state, approved or not.
- A **pair** is one stored `curated.ddinter_pair` row whose two entries are both mapped (`substance_code` `DDINTER`) to held substances.
- A pair **applies** when RouteRule picks each side's entry for at least one held product. An applying pair is one the checker or the desk could show for some pair of our products.
- **The queue and the substance page list every pair (PO D3).** Both default to every stored pair between held substances, applying or not; the "Applies to our brands" filter (`pairs=applies`) narrows them (§13.1 Q11). An example of a pair that does not apply: the systemic `DDInter351` chloramphenicol pairs, while we hold only the eye drop. A non-applying pair carries a plain line (§5.17.2 item 2) and sorts after the applying pairs of the same severity. It is still reviewed like any pair: a future product on the other route would make it apply.

**Pair review state (Decision).** It is computed by the API (`PairReviewRule`, §7.7) from the append-only `ops.pair_review` rows (§7.8) and the pair's current **content hash**. The hash is SHA-256 over the canonical JSON array `[ddinterA, ddinterB, severity, sorted actions, interaction text or null, management text or null]`, after `DdinterText.clean`. Partner display names are not part of it. The latest pair decision `L` gives the state:

| State | Rule | Reviewer line (`PairReviewState`, reviewer) | Public line (D53) |
|---|---|---|---|
| `not_reviewed` | no pair decision | `PAIR_NOT_REVIEWED` | `PAIR_NOT_REVIEWED` |
| `reviewed` | `L = reviewed`, and its stored hash equals the current hash | `PAIR_REVIEWED` with `L`'s date, plus " (you)" when `mine` | `PAIR_REVIEWED` with `L`'s date |
| `changed` | `L = reviewed`, and the hash differs (DDInter changed the severity, actions or text after the review; PO D5) | "Pair changed in DDInter after a senior pharmacist reviewed it on {date}." | `PAIR_NOT_REVIEWED` |
| `issue` | `L = issue` | "Pair issue reported by a senior pharmacist on {date}. Note:" followed by the note in `.raw` ("(you)" when `mine`) | `PAIR_NOT_REVIEWED` |

**What a pair issue does (Decision, conservative; §13.1 Q5).** "Report pair issue" records that a senior believes the pair's DDInter data, or our use of it, needs attention. Examples: the text contradicts the severity, or the entry looks wrong for the route.

- It **never** hides the pair, its severity or its text, anywhere. Hiding an interaction would show the absence of data as safety (G3). In public the pair reads `PAIR_NOT_REVIEWED`.
- It does not change any record's review state. When the senior thinks a **record** is wrong (a mapping, a strength, a chosen entry), they use the record's Report issue on the desk, which withdraws that record's approval (PO D2). Brand rows link there.
- **A pair issue has no engineering owner (Decision).** Engineers get no list of pair issues: no flag is created, they cannot open the senior pages, and the `/review/flags` line below is for seniors. So a pair issue is a note for seniors and a visible caution to every reviewer, not a work order. When the problem needs engineering work (our use of the pair: a wrong DDInter mapping, a wrong chosen entry, a route problem), the senior also reports an issue on at least one affected record from the desk (the pair row's brand links). That record issue is what engineers act on, as for any record (§5.10). §13.1 Q5 asks the PO to confirm.
- The pair stays in the queue under "Issue reported" until a senior marks it reviewed. A later DDInter change does not clear the issue: an `issue` state stays `issue`.
- No flag is created. The queue's "Issue reported" filter is the work list, and `/review/flags` (§5.16) shows the line "Pair issues reported by senior pharmacists: {k}", linking to `/review/pairs?show=issue`, when k > 0.

**Marking reviewed (Decision).** "Mark reviewed" is sent at once, with no undo window. It publishes no record. It only changes a pair's state line from `PAIR_NOT_REVIEWED` to `PAIR_REVIEWED`. A mistaken mark is withdrawn with "Report pair issue". Enter never marks.

#### 5.17.1 Pair queue (`/review/pairs?show=&severity=&page=`)

- `<h1>` "Pair queue". Sub: "Every DDInter 2.0 pair between substances we hold, from all batches. Major first."
- **Filters** (GET links, `aria-current` on the current one, with tabular counts):

| `show` | Label | Members | Empty copy |
|---|---|---|---|
| `todo` (default) | To review | `not_reviewed` and `changed` | "No pairs to review." |
| `changed` | Changed since review | `changed` | "No pair changed in DDInter since its review." |
| `issue` | Issue reported | `issue` | "No pair issues reported." |
| `reviewed` | Reviewed | `reviewed` | "No pairs reviewed yet." |
| `all` | All pairs | every pair (in the current `pairs` scope) | "No pairs between the substances we hold." |

- **Scope filter** (`pairs`): a `Segmented` of GET links, "All pairs" (`all`, default, PO D3(b)) and "Applies to our brands" (`applies`). The `show` counts follow the scope.
- **Severity filter**: "All", "Major", "Moderate", "Minor", "Severity not classified by DDInter", as GET links.
- **Order**: severity rank (Major, Moderate, Minor, unknown), then applying before non-applying, then state (`changed`, `issue`, `not_reviewed`, `reviewed`), then substance A's name, then substance B's name. 50 pairs per page, with "Next page" and "Previous page" links and "{from}–{to} of {total} pairs".
- **Every empty state** has one link: "Show all pairs".

#### 5.17.2 Pair row (one `<article class="pair-row" aria-labelledby>` per pair; the same component on the queue and the substance page)

1. Head: `Severity` chip, then `<h2>` (queue) or `<h3>` (substance page) "{substance A} + {substance B}", each name linking to `/review/substances/{bdsId}`.
2. Meta: `FROM_DDINTER`, then "`{idA}` {DDInter name A} ({route A}) + `{idB}` {DDInter name B} ({route B}). Action in DDInter: {actions}." Each id carries its DDInter `SourceLink` (§5.6.6).
   - *(PO D3(b))* When the pair does not apply (`applies: false`), a plain line (never a hatch, never a warning tone): "Does not apply to the medicines we hold: none of them is checked against `{id}` for its route." When neither entry is chosen by a held product, `{id}` reads "`{idA}` or `{idB}`".
3. Brands: "{a} brand[s] of {substance A} and {b} brand[s] of {substance B}, in {k} batch[es]." (a, b and k from `brandCounts`, the full totals) with a `<details>` "Brands". Inside, one group per side, each listing at most 10 held products that choose that side's entry (the API cap, §7.7; ordered by batch, then trade name): "{trade name} (batch `{batchId}`)" plus its full `ReviewStatus` pill (reviewer views may use any status), linking to `/review/{batchId}/{conceptId}`. When a side has more than 10, the group ends with "and {n} more." and the link "All brands of {substance}" to `/review/substances/{bdsId}` (§5.17.4, which lists every brand of one substance). This keeps a page of 50 pairs within the §10.6 budget when a substance such as paracetamol has hundreds of brands.
4. Text: as a reviewer `PairCard` (§5.6.2), management first, otherwise interaction, with the Expander. Unknown severity with no text gets `UNKNOWN_PAIR_LINE`. Known severity with no text gets `NO_TEXT`. Then the `SourceLink` "Full record in DDInter 2.0" when the pair has an `interaction_id`.
5. State line (`PairReviewState`, reviewer).
6. For `changed`: a `<details>` "What changed in DDInter", with a two-column table, "At review" and "Now", for each changed field: "Severity", "Actions", "Interaction text", "Management text". Values come from the content stored with the review (§7.8).
7. Actions:
   - "Mark reviewed `M`" (primary sm, busy label "Saving", `aria-keyshortcuts="M"`). It is `aria-disabled` when the state is `reviewed` (hint "This pair is already reviewed.").
   - "Report pair issue `R`" (tonal sm, `aria-expanded`, `aria-controls`, `aria-keyshortcuts="R"`).
8. Report pair issue panel, with the rules of §5.10 except:
   - label "What's wrong with this pair? Pharmacists, engineers and senior pharmacists read this note." (the note shows in the pair's state line on every reviewer surface, including the desk's pair cards, §5.6.2);
   - placeholder "For example: the management text says to avoid the combination but the severity is Minor";
   - help "5 to 1000 characters." followed by `NO_PHI_HELP`;
   - error "Add at least 5 characters so the team knows what to check.";
   - actions "Cancel `Esc`" and "Send report `Ctrl Enter`" (busy "Sending");
   - draft key `intellidrugs-pair-draft:{ddinterA}:{ddinterB}`.
9. `<details>` "Pair history" (oldest first): "Reviewed by a senior pharmacist" / "Issue reported by a senior pharmacist. Note:" followed by the note, each with `fmtUtc` and `fmtDhaka`, and "(you)" from `mine`. When the pair changed after a review, a line "DDInter data changed after this review" follows that entry. No email, ever.

**Outcomes** (announced in the live region; the row stays in place and in order until the page is reloaded or the filter changes, so focus never jumps):

- reviewed: the state line becomes `PAIR_REVIEWED`. Announce "Pair {A} + {B} marked reviewed.";
- issue: the state line becomes the issue line and the panel closes. Announce "Pair issue reported for {A} + {B}.";
- 409 `contentHash`: a row-level warn banner, title "This pair changed in DDInter after you opened the page.", body "Nothing was saved. Reload to review the latest text.", button "Reload". Decisions on the row pause until Reload. The note draft is kept;
- 409 `lastPairReviewId`: the same banner pattern, with title "Another senior pharmacist decided on this pair after you opened the page." and body "Nothing was saved. Reload to see their decision.";
- 409 `state` (already reviewed and unchanged): hint "This pair is already reviewed.";
- network, 5xx, 429, captcha, forbidden and unauthenticated: the §5.8.2 handling and banners. Pair wording: "Couldn't save your pair review. Nothing was saved. Check your connection and try again." (not saved) and "Couldn't confirm your pair review. Try again to find out; it will not be saved twice." (unconfirmed), each with "Try again", which resends the same `requestId` and version.

#### 5.17.3 Substances (`/review/substances?q=&page=`)

- `<h1>` "Substances". Sub: "Every substance carried by a medicine we hold, from all batches."
- Filter: a GET form with the field label (sr-only) "Filter substances by name or BDS id" and the placeholder "Filter by name or BDS id". No match: `No substances match “{q}”.` with "Show all substances".
- A table (`<caption class="sr-only">` "Substances we hold") with the columns "Substance" (linked), "BDS id" (mono), "Brands", "Batches", "Pairs to review", "Major pairs to review". It is ordered by pairs to review (descending), then name. 50 per page.

#### 5.17.4 Substance page (`/review/substances/[bdsId]?pairs=all|applies&severity=&page=`)

1. `<h1>` the preferred name, mono BDS id. Meta: "{k} brand[s] in {b} batch[es]".
2. **"Brands"** (from every batch): a table with the caption (sr-only) "Brands of {name} in every batch" and the columns:
   - "Brand": linked to the desk record;
   - "Batch": mono;
   - "Status": a `ReviewStatus` pill;
   - "Clinical drug": display name and mono BDC;
   - "Strength";
   - "Route";
   - "Checked against": the chosen DDInter entries with ", route assumed", or the §5.6.1 no-entry line, or `NOT_RUN`, or `NoDataChip("No data")` for coverage `none`.
3. **"Names"** with sources, and **"Codes"**: every code with its `SourceLink` and "fetched on" (§5.6.6), and the method and confidence as `CodeChip` meta.
4. **"DDInter entries"**: each entry with its route scope, severity counts, disease and food counts, `SourceLink` and "fetched on". With coverage `none`: a `NoDataBlock` (title = name, `NO_DATA_SENTENCE`). With coverage `not_run`: `NOT_RUN`.
5. **"Pairs with substances we hold"**: a `Segmented` (GET links) with "All pairs" (`all`, default, PO D3(a)) and "Applies to our brands" (`applies`); the severity filter; then pair rows (§5.17.2), ordered as in the queue, 50 per page. Empty: "No stored DDInter pair links {name} with another substance we hold."
6. Coverage `none` substances show item 4's `NoDataBlock` and no pair list, and say "Pairs with {name} are not checked." Absence of data is never shown as safety.

#### 5.17.5 States, keyboard and a11y

- **Loading**: skeleton rows (`.sk`; no pulse with reduced motion), and `role="status"` "Loading senior review".
- **API error**: a crit `Banner`, title "Couldn't load senior review.", body "Nothing was changed. Check your connection and try again.", button "Try again".
- **Unknown `bdsId`**: `notFound()`, "No substance with the id {id}.", with "Open the substances list".
- **Keyboard** (SeniorDesk). The region has `id="senior"`, `role="region"`, `tabindex="0"` and `aria-label="IntelliDrugs senior review. Shortcuts work while focus is inside. Press question mark for the list."` (with shortcuts Off: "IntelliDrugs senior review."). Keys:
  - J / K: next or previous pair row. The row's heading receives focus (`tabindex="-1"`), and the current row has `aria-current="true"`. At the ends: "This is the last pair on this page." / "This is the first pair on this page.";
  - M: mark the current row reviewed;
  - R: open or focus the current row's issue panel;
  - ?: the shortcuts sheet (`role="dialog"`, title "Keyboard shortcuts", with the rows "Next and previous pair", "Mark the pair reviewed", "Report a pair issue", "This sheet", "Close the sheet or the note", "Send the report, inside the note field", "Never marks a pair reviewed");
  - Esc: closes the sheet, then the note panel (keeping the draft);
  - Ctrl/Cmd+Enter: sends inside the note field;
  - Enter: never marks. On "Mark reviewed" it is blocked, with the hint "Enter does not mark a pair reviewed. Press M, or Space on this button."
- **Keyboard rules**: the §5.14 rules about fields, modifiers and case apply, and so does the single-key setting.
- **Focus** stays on the acted-on control after an outcome and never falls to `<body>`. Pair rows are `<article>` elements with headings, so screen-reader users can move by heading. Severity and state always carry words.
- **Bot check**: Turnstile action `decision` (§9.2), one widget per page, as in §5.8.5.
- **Audit**: `senior_open` on page show and `pair_decision` on every accepted decision (§5.15).
- **No JavaScript**: the pages read fully. Pair decisions need the bot check and show the `<noscript>` line "Reviewing pairs needs JavaScript for the bot check."

### 5.18 QA tools (`/review/qa`) *(QA portal, Decision, PO 18/10/2026; D66, D67, D69, D70)*

No board draws this page. It gives QA team members, engineers and senior pharmacists everything they need to point an AI assistant or a script at the read-only QA data: the hosted MCP address with setup snippets, their own keys, the API and the rules. All copy below is new (§1.7) unless it is code (snippets, paths, filter names) or the `PREAMBLE`. Files: `app/review/qa/page.tsx` (server component), `app/review/qa/qa.module.css`, `components/qa/*` (the QaKeys and CopyButton islands, §4.2), `lib/qa-key-actions.ts` (`"use server"`) and `lib/qa-key-core.ts` (`server-only`, §7.10.5). *(QA API reference)* Also `app/review/qa/ApiReference.tsx` (server component), `lib/qa-api-reference.ts` and `lib/qa-api-examples.ts` (both `server-only`).

**Access (Decision).** `canUseQa(role)`: `qa`, `engineer` and `senior`. Anonymous visitors get the 307 sign-in redirect (§2.3, `returnTo=/review/qa`). Role `user` gets the not-authorised page (§5.12). Role `pharmacist` gets status 200 and an info `Banner`: title "QA tools are for QA team members, engineers and senior pharmacists.", body "Your account reviews batches. Ask the IntelliDrugs team if you need QA access.", and the button "Open the review desk"; no key data and no key API call. A `qa` session reads nothing but its own key list on this page: no batch list and no other review read (the toolbar's account menu shows no batch for `qa`).

**Layout.** The reviewer toolbar (§5.1, without the batch centre section; "QA tools" link current), no sidebar, then one column of at most 860 px, built from `ui/` components and CSS Modules with tokens only (no inline style). The page has one `<h1>`, then four sections in this order, each an `<h2>` with an `id` so the page can link to it: "Connect your AI", "Your keys", "API", "Rules". It owns the page's one polite live region (`id="qa-live"`, sr-only, §10.2), server-rendered; both islands announce through it with `announce()` (`lib/live-region.ts`).

- `<h1>` "QA tools". Sub: "Read IntelliDrugs data for quality checks from your AI assistant or a script. Everything here is read-only."

**1. "Connect your AI"**

- "The QA MCP server runs on this site. Add it to your AI client with this address, and send one of your keys as a Bearer token."
- A row with the label "MCP server address", the mono value `https://{SITE_HOST}/api/qa/mcp` (`SITE_HOST` is server-only; the page renders the string) and a `CopyButton` "Copy address".
- `<h3>` "Claude Code", then a `<pre>` (mono, `white-space: pre-wrap`, `overflow-wrap: anywhere`, so it reflows at 320 px with no scroll region) with exactly:

  ```
  claude mcp add --transport http intellidrugs-qa https://{SITE_HOST}/api/qa/mcp --header "Authorization: Bearer $INTELLIDRUGS_QA_KEY"
  ```

  a `CopyButton` "Copy command", and the help line "Set INTELLIDRUGS_QA_KEY to your key first. Claude Code saves the header in your own settings. Never add it with --scope project, which writes the key into the project's files."
- `<h3>` "Cursor and other clients", then a `<pre>` with exactly:

  ```
  {
    "mcpServers": {
      "intellidrugs-qa": {
        "url": "https://{SITE_HOST}/api/qa/mcp",
        "headers": { "Authorization": "Bearer YOUR_KEY" }
      }
    }
  }
  ```

  a `CopyButton` "Copy configuration", and the help line "Replace YOUR_KEY with your key. Keep this file out of version control."
- `<h3>` "claude.ai and ChatGPT": "Their connectors sign in with OAuth, which IntelliDrugs does not offer. Use Claude Code, Cursor or another client that can send an Authorization header." (OAuth is out of scope, §7.10.6.)
- "The server has five read-only tools: `list_batches`, `get_batch`, `get_record`, `find_records` and `get_pairs`. A local version that runs on your computer is in `tools/qa-mcp`." The tool names are rendered from `TOOLS` (`lib/qa-mcp-tools.ts`, §7.10.6), never retyped.
- The page never embeds a key, a label or a hash in any snippet: the snippets carry `$INTELLIDRUGS_QA_KEY` and `YOUR_KEY` only.

**2. "Your keys"** (the QaKeys island; the `<h2>` has `tabindex="-1"` so focus can return to it)

- "A key lets a client read QA data on your behalf. It expires 90 days after you create it, and you can revoke it at any time. You can have up to 5 active keys."
- **Create form** (`<form>` posting to `createQaKeyAction`): a `Field` labelled "Key name" (`maxlength` 40, `autocomplete="off"`, counter "{n} of 40"), help "1–40 characters, for example the laptop or tool that will use it.", then the one shared `TurnstileField` (action `qakey`) with its `BotCheck` status, and the primary button "Create key" (busy label "Creating"). With 5 active keys the button is `aria-disabled` and the field's help adds "You have 5 active keys. Revoke one to create another."; a press shows that line as the field's hint and sends nothing.
  - Name rule (web and API): trimmed of white space, 1–40 characters, no control characters. Error (`aria-invalid`, `.field-error`): "Name the key with 1–40 characters."
  - `<noscript>`: "Creating and revoking keys needs JavaScript for the bot check."
- **The one-time key panel** (shown after `created`, above the list; a `<section aria-labelledby>` with the `.banner--info` look, not a dialog):
  - `<h3 tabindex="-1">` "Copy your new key now", which receives focus;
  - "This is the only time it is shown. IntelliDrugs keeps only a fingerprint of it and can't show it again.";
  - the label "Key {name}" and the key in a mono `<code id="qa-new-key">` (`overflow-wrap: anywhere`, `user-select: all`);
  - a `CopyButton` "Copy key" and the tonal button "I've saved it". "I've saved it" removes the panel and the key from the DOM and from the island's state, and moves focus to the "Your keys" heading;
  - while the panel is open, a `beforeunload` prompt guards against losing the key (the browser's own text), and leaving through the account menu or a link prompts the same way;
  - announce "Key {name} created. Copy it now; it is shown only once."
- **Create outcomes** (a `Banner` above the form, announced; the form keeps the typed name, and nothing in it is ever the key):

| Outcome (§7.10.5) | Tone | Title | Body | Action |
|---|---|---|---|---|
| `active_limit` | warn | "You already have 5 active keys." | "No key was created. Revoke one, then create another." | none |
| `daily_limit` | warn | "You've created 10 keys in the last 24 hours." | "No key was created. Try again tomorrow." | none |
| `captcha` | crit | "We couldn't confirm you're a person." | "No key was created. Retry the check, then try again." | "Retry check" |
| `forbidden` | info | "Your account no longer has QA access." | "No key was created. Ask the IntelliDrugs team if you need QA access." | none |
| `unauthenticated` | warn | "Your sign-in expired." | "No key was created. Sign in again to continue." | "Sign in" (to `/signin?returnTo=/review/qa`) |
| `failed` (network, 5xx, 502) | crit | "Couldn't create the key." | "If a new key appears in your list, revoke it: it can't be shown again. Check your connection and try again." | "Try again" (submits the form again) |

- **Key list**: a table in a labelled, keyboard-scrollable region (`tabindex="0"`, `role="region"`, `aria-label` "Your QA keys", §10.4), `<caption class="sr-only">` "Your QA keys", the newest first (at most 50, §7.10.3). Columns: "Name", "Created", "Expires", "Last used", "Status", and an action column whose header is sr-only "Actions". Dates use `fmtDhaka` (reviewer surfaces); "Last used" reads "Never" when there is no use. Status is plain text, never green, never a pill (§3.4 mark exclusivity): "Active", "Expired", "Revoked". An active row has the destructive sm button "Revoke" with sr-only " key {name}".
  - Empty: "You have no keys yet."
  - **Revoke confirmation** (inline, in the row's action cell): "Revoke {name}? Clients using it stop working at once." with the destructive sm button "Revoke key" (busy label "Revoking"), which receives focus, and the plain sm button "Cancel". Esc or Cancel closes it and returns focus to the row's "Revoke". "Revoke key" posts `revokeQaKeyAction` through the same Turnstile token. Enter on "Revoke" opens the confirmation only; it never revokes.
  - **Revoke outcomes** (the row stays in place; focus moves to the "Your keys" heading after `revoked`, otherwise stays on the control):

| Outcome | What shows | Copy |
|---|---|---|
| `revoked` | the row's status becomes "Revoked", its action cell empties | announce "Key {name} revoked." |
| `already_revoked` | the row's status becomes "Revoked" | status line and announcement "Key {name} was already revoked." |
| `not_found`, `invalid` | warn `Banner` | "That key isn't in your list any more." / "Nothing was changed. Reload the page." with "Reload" |
| `rate_limited` | warn `Banner` | "Too many changes to your keys." / "Nothing was changed. Wait a few minutes and try again." |
| `captcha` | crit `Banner` | "We couldn't confirm you're a person." / "No key was revoked. Retry the check, then try again." with "Retry check" |
| `forbidden`, `unauthenticated` | as for create | the same titles, with the body's first sentence "No key was revoked." |
| `failed` | crit `Banner` | "Couldn't revoke the key." / "It still works. Check your connection and try again." with "Try again" |

  - **Load error** (the list read failed): crit `Banner` "Couldn't load your keys." / "Nothing was changed. Check your connection and try again." with the link "Try again" (`/review/qa`). The create form is not rendered, so no key can be made without the cap check being shown.

**3. "API"** *(QA API reference, PO 19/10/2026, D72: this section now holds the full reference; it replaces the endpoints table and the single curl example of the QA portal)*

The section keeps its lead and base address, then holds the reference in four `<h3>` parts, in this order: "Every request and answer", "Endpoints" (five panels), "Problem filters" (unchanged) and "MCP over HTTP" (one panel). The QA portal's endpoints table ("QA API endpoints", columns "Request" and "Returns") and its `<h3>` "Example" with the one curl line are removed: each endpoint panel's summary carries the request and its "Returns" sentence, and each panel has its own command.

- "The same data over HTTPS, for scripts. Send your key in the Authorization header. Each key may make 60 requests a minute, shared with the MCP server." (unchanged)
- The label "API base address", the mono value `https://{SITE_HOST}/api/qa/v1` and a `CopyButton` "Copy address" (unchanged).

**Where the reference comes from (Decision, D72).** Nothing in the reference is typed by hand twice:

- `lib/qa-api-examples.ts` (`server-only`, new): illustrative **internal API** bodies, one per endpoint (`GET /v1/review/batches`, `GET /v1/qa/batches/{b}/items`, `GET /v1/review/batches/{b}/items/{c}`, `GET /v1/qa/records`, `GET /v1/review/substances/{bdsId}?pairs=all`), each typed with `satisfies` against the web's API types (`ReviewBatchSummary[]`, `ReviewItem`, `SubstanceDetail`, and new local types for the two `/v1/qa/*` bodies of §7.9.5), so `next build`'s type check fails when the internal API's shape changes; and the fixed `EXAMPLE_REQUEST_ID` (a version-4 UUID) and `EXAMPLE_TIMESTAMP` (`2026-10-19T04:30:00.000Z`).
- `lib/qa-api-reference.ts` (`server-only`, new): `qaReference(host)` builds every panel's data. **Each example answer is generated by the real code:** the endpoint's allowlist mapper from `lib/qa-map.ts` (`mapBatches`, `mapBatch`, `mapRecord`, `mapRecords`, `mapPairs`) runs over the example body, `okAnswer` (`lib/qa-query.ts`) wraps it, and its `metadata` is set to `{ timestamp: EXAMPLE_TIMESTAMP, requestId: EXAMPLE_REQUEST_ID }`; the error example is `failAnswer(EXAMPLE_REQUEST_ID, "INVALID_QUERY", "filter")` with the same metadata. Each is shown as `JSON.stringify(body, null, 2)`. The MCP examples are built from `PREAMBLE`, `SERVER_NAME`, `SERVER_VERSION` and `SUPPORTED_PROTOCOL_VERSIONS` (`lib/qa-mcp-tools.ts`), and the tools/call result's second block is the `GET /api/qa/v1/batches` example envelope, indented as `lib/qa-mcp.ts` indents it.
- Parameter rules come from the validators' own constants: `BATCH_ID`, `BDS_ID`, `QA_FILTERS`, `QA_STAGES` and `PAGE_MAX` (`lib/qa-query.ts`), `ID_MAX` (`lib/public-params.ts`), `QA_PAIRS_SIZE` and the new `QA_RECORDS_SIZE = 100` (`lib/qa-map.ts`, documentation only; `mapRecords` is unchanged), the new `QA_RATE_LIMIT = 60` (`lib/limits.ts`, used by `LIMITS.qa`), `MCP_MAX_BODY` and the newly exported `DEFAULT_PROTOCOL_VERSION` (`lib/qa-mcp.ts`), and `TOOLS` and `TOOL_ROUTES` (`lib/qa-mcp-tools.ts`, unchanged, so `tools/qa-mcp` is untouched). Patterns are shown as their `RegExp.source`, and the numbers in rule sentences are filled from these constants.
- `app/review/qa/ApiReference.tsx` (new, a **server component**, no `"use client"`) renders it; `page.tsx` passes `qaReference(siteHost())`. No example, curl or rule reaches client JavaScript: the only island on these blocks is the existing `CopyButton`, which reads its target's text from the DOM (§4.2).

**Example content (Decision).** The example bodies follow the pilot and are consistent with one another:

- Every command uses real pilot ids, so it runs as written once `INTELLIDRUGS_QA_KEY` is set: batch `0001-pilot`, record `186-0030-006--napa` (Napa), substance `BDS-000003` (Warfarin).
- `GET /batches` lists `0001-pilot` with `itemCount` 10; `GET /batches/0001-pilot` lists all 10 pilot records (concept ids and trade names as in the pilot) and its `approvedCount` matches theirs; the record example is Napa with the same `displayStatus` and stage statuses as its row; the records example (`filter=stage_warn&stage=ddinter&batch=0001-pilot`) lists exactly the batch example's records whose `ddinter` stage is `warn`, with `total` equal to their number; the pairs example's `total` equals the number of pairs shown.
- Every field the mapper emits is present, every array has at least one element, and a leaf is `null` only at a path listed in the reference's `EXAMPLE_NULLS` (for example the stored `note` of a stage that is `ok`), so a mapper field that the example body does not feed fails the guard (§11.1).
- **Never in an example** (body or command): an email, an `@`, a reviewer's name or other identity (history carries role, time and decision only), a decision, dismissal or pair-issue note, a version token or content hash, an `idqa_` key, a 64-character hex string, or any Bearer value other than `$INTELLIDRUGS_QA_KEY`. Pipeline text (a stage's `note` and `notes[].text`, `parseNote`, `coverageNote`) is short pipeline-style text, never a person's words. The example internal API bodies hold a field the mappers drop only where the web's API type requires it, and then only as a neutral value: `mine: false`, a review's `note: null`, a pair's `history: []`, `openIssues: []`, `reopen: null`, `version.lastDecisionId: null`, a pair's `version: { contentHash: "", lastPairReviewId: null }`; never an email, a note's text, a hash or a token.

**Layout and markup.**

- Endpoint and MCP panels are native `<details>` (they open and close without JavaScript), classes `.endpoint` in `qa.module.css`. The **first endpoint panel (`GET /api/qa/v1/batches`) has `open`**; the others and the MCP panel start closed. Ids: `qa-ref-batches`, `qa-ref-batch`, `qa-ref-record`, `qa-ref-records`, `qa-ref-pairs`, `qa-ref-mcp`.
- `<summary>`: the request as mono code (`GET /api/qa/v1/batches`, `GET /api/qa/v1/batches/{batchId}`, `GET /api/qa/v1/batches/{batchId}/records/{conceptId}`, `GET /api/qa/v1/records`, `GET /api/qa/v1/substances/{bdsId}/pairs`; MCP: `POST /api/qa/mcp`), then, on its own line, that endpoint's "Returns" sentence (the QA portal strings, unchanged: "Every batch, with its status and counts." and the four others; MCP: "JSON-RPC 2.0 for AI clients and scripts: initialize, then list and call the five tools."). The summary keeps the native disclosure marker (`display: list-item`), is at least 24 px tall with its padding, shows `:focus-visible`, and its mono path wraps anywhere at 320 px.
- Inside a panel the headings are `<h4>` (`h1` → `h2` "API" → `h3` → `h4`; no heading inside a `<summary>`). Each `<h4>` ends with the sr-only text " for {request}" (for example "Request<span class="sr-only"> for GET /api/qa/v1/batches</span>"), so a heading list names its endpoint.
- **Code blocks** (commands and example answers) use the page's `.pre` look, inside their own labelled, keyboard-scrollable region: `<div role="region" tabindex="0" aria-label="…">` with class `.codeRegion` with `overflow: auto` and a `max-height` of 28em, and the `<pre>` inside with `white-space: pre` (so indentation and lines are kept and the block, never the page, scrolls sideways at 320 px). Above each block, a head row (`.codeHead`): the visible label, the `ExampleMarker` (§3.4) and a `CopyButton` "Copy command" (commands) or "Copy example" (answers), whose sr-only `context` is " for {request}" (§4.2). Region labels: "{label} for {request}", for example "Command for GET /api/qa/v1/batches", "Answer for initialize"; the error example's region is "Error answer".
- **Tables** (parameters, errors, MCP headers, MCP tools, MCP errors) use the existing `.scroll` region (`role="region"`, `tabindex="0"`, `aria-label` = the caption) and `.table`, with `<caption class="sr-only">` and `<th scope="col">`; names, values, codes and messages in mono (`.mono`).
- **Key fields** use the "Problem filters" `dl` style (`.filters`): `dt` the field path in mono, `dd` the sentence.
- Tokens only, no inline style (§3.1). `qa.module.css` adds `.endpoint`, `.summary`, `.summaryPath`, `.summaryText`, `.endpointBody`, `.codeHead`, `.codeLabel`, `.codeRegion` (which carries the `.pre` look: background, inset line, radius) and `.codeBlock`, and removes `.request` and its 40em rule with the endpoints table. Two rules keep the page inside 320 px: `.table .mono` wraps at spaces (`overflow-wrap: break-word`, like the cell, so a long pattern scrolls its table's region instead of starving the other columns), and `.filters dt` wraps anywhere (a key-field path such as `extraction.ingredients[].ddinter.chosen[]` is wider than 320 px).

**3a. `<h3>` "Every request and answer"** (`id="qa-api-common"`)

- "Send GET requests with one header, {header}, where {key} is one of your keys. The examples read the key from the INTELLIDRUGS_QA_KEY environment variable, so it stays out of your shell history." ({header} is mono `Authorization: Bearer <key>`, {key} mono `<key>`.)
- "Every answer uses the same envelope: success, data, message, errors and metadata. Quote metadata.requestId with each finding, so the team can find the exact read." (the QA portal string, moved here)
- A `dl` of the envelope, `dt` in mono:
  - `success`: "true for a 200 answer, false for every error."
  - `data`: "The endpoint's data, shown in each panel below. null on an error."
  - `message`: "OK, or the error's fixed message."
  - `errors`: "Empty on success. On an error, one entry: field (the input that was refused or not found, or null), code and message."
  - `metadata`: "timestamp (UTC) and requestId. Quote requestId when you report a finding or a problem."
- The head row with the label "Error answer", the `ExampleMarker` and "Copy example", and the error example (`INVALID_QUERY`, `field` `filter`) in its code region.
- "Anything marked {marker} is an illustration, not a stored record. Its field names and shapes are the API's own." ({marker} is the `ExampleMarker`.)
- "Answers are JSON and never cached. A 401 answer has the header {auth}; a 429 answer has {retry}, the seconds to wait." ({auth} mono `WWW-Authenticate: Bearer`, {retry} mono `Retry-After: 60`, the headers `qaHandler` sends.)
- "{page} counts from 0. A list answer has {total} and {size}: the last page is {total} divided by {size}, rounded up, minus 1." (each placeholder mono, the field name)
- "A path that is not one of the five endpoints answers 404 with no field. No QA answer is ever a 500."

**3b. `<h3>` "Endpoints"** (`id="qa-api-endpoints"`; the word is `SHARED_WORDS.endpoints`)

- "Open an endpoint to see what to send, an example answer, and the errors it can give."
- Five panels, in this order: batches, batch, record, records, pairs. Each holds, in order:

1. `<h4>` "Request"
   - the full address in mono: `GET https://{SITE_HOST}/api/qa/v1/…` with the path's `{batchId}`-style placeholders;
   - "Required header: {header}." ({header} mono `Authorization: Bearer <key>`);
   - a parameters table, caption "Parameters for {request}", columns "Parameter", "In", "Required", "Rule": the name in mono; "Path" or "Query"; "Yes" or "No" (`SHARED_WORDS.yes`, `SHARED_WORDS.no`); the rule sentence below. `GET /batches` has no table but the line "This endpoint takes no parameters.";
   - "Any other query parameter, or one sent twice, is refused with 400." (every panel);
   - the head row "Command", `ExampleMarker`, "Copy command", and the command in its code region.
2. `<h4>` "Response"
   - the head row "Answer", `ExampleMarker`, "Copy example", and the example answer (the whole envelope) in its code region;
   - the label "Key fields" and the key-fields `dl`.
3. `<h4>` "Errors"
   - a table, caption "Errors for {request}", columns "Status" (`SHARED_WORDS.status`), "Code" (`SHARED_WORDS.code`), "When", "What to do"; the rows below, in status order.

**Parameters** (the rule sentences; mono fills; numbers from the constants):

| Panel | Parameter | In | Required | Rule |
|---|---|---|---|---|
| batch, record | `batchId` | Path | Yes | "1 to {max} letters, digits, dots, underscores or hyphens ({pattern}), as {source} lists it." `max` 100, `pattern` `BATCH_ID.source`, `source` `GET /api/qa/v1/batches` |
| record | `conceptId` | Path | Yes | "1 to {max} characters, with no control characters, exactly as {source} lists it. Percent-encode any character other than a letter, digit, dot, underscore, hyphen or tilde." `max` `ID_MAX` (200), `source` `GET /api/qa/v1/batches/{batchId}` |
| records | `filter` | Query | Yes | "One of {values}. Problem filters, below, says what each one matches." `values` `QA_FILTERS` |
| records | `stage` | Query | No | "One of {values}, and only with {only}. With any other filter it is refused." `values` `QA_STAGES`, `only` `filter=stage_warn` |
| records | `batch` | Query | No | "A batch id, by the batchId rule ({pattern}). Only that batch's records are listed." |
| pairs | `bdsId` | Path | Yes | "BDS- and six digits ({pattern}), as a record's {source} gives it." `pattern` `BDS_ID.source`, `source` `extraction.ingredients[].bdsId` |
| records, pairs | `page` | Query | No | "A whole number from 0 to {max}; 0 when left out. {size} a page." `max` `PAGE_MAX` (999), `size` `QA_RECORDS_SIZE` (100) or `QA_PAIRS_SIZE` (50) |

**Commands** (code; each exactly one line, `$INTELLIDRUGS_QA_KEY` never expanded on the page):

```
curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://{SITE_HOST}/api/qa/v1/batches"
curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://{SITE_HOST}/api/qa/v1/batches/0001-pilot"
curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://{SITE_HOST}/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa"
curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://{SITE_HOST}/api/qa/v1/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=0"
curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "https://{SITE_HOST}/api/qa/v1/substances/BDS-000003/pairs?page=0"
```

**Key fields** (`dt` mono path, `dd` the sentence):

- batches: `batches[].batchId` "The id to use in the other endpoints."; `batches[].status` "The batch's state: in_review, approved or rejected."; `batches[].itemCount` "How many current records the batch holds."; `batches[].approvedCount` "How many of them a pharmacist has approved."; `batches[].runAt` "When the pipeline last ran the batch, in UTC."
- batch: `items[].conceptId` "The record's DGDA concept id, for the record endpoint."; `items[].displayStatus` "The review state: pending, engineer_checked, approved, issue or back_in_review."; `items[].stages[].stage` "dgda, substances, clinical or ddinter, in pipeline order. A stage with no result is left out."; `items[].stages[].status` "ok, warn or fail."; `items[].stages[].note` "The pipeline's note for that stage, whole."
- record: `source.json` "The DGDA register record exactly as stored. Check the extraction against it."; `source.link` "The register page to cite for the source."; `extraction.ingredients[].strengthValue` "The parsed strength, with strengthUnit, perValue and perUnit. null means none was found."; `extraction.ingredients[].codes[]` "Each code with its system, method, confidence and source link."; `extraction.ingredients[].coverage` "full, none or not_run. none never means a combination is safe."; `extraction.ingredients[].ddinter.chosen[]` "The DDInter entries chosen for the product's route, and whether the route was assumed."; `ddinterRoute` "The route used to choose DDInter entries. Compare routeAssumed with the ddinter stage's evidence."; `stages[].evidence` "What the pipeline stored for that stage, unchanged."; `pairs.inBatch.pairs[].textMissing` "true where DDInter has no interaction or management text for the pair."; `pairs.otherBatches.pairs[]` "Pairs with records in other batches. partnerCount counts every partner."; `history[]` "Runs and decisions, oldest first: role, time and decision only."
- records: `total` "How many current records match."; `page` "This page's index, from 0, with size records a page."; `stage` "The stage you sent, or null."; `batch` "The batch you sent, or null."; `items[]` "The matching records, by batch id, then concept id."; `items[].stages` "Each stage's status: ok, warn, fail, or null when the stage has no result."
- pairs: `total` "How many stored DDInter pairs link this substance with another substance we hold. 50 a page."; `pairs[].entry` "This substance's DDInter entry in the pair, with its route scope."; `pairs[].partner` "The other substance and its entry. When both sides are this substance, side b."; `pairs[].severity` "DDInter's severity: major, moderate, minor or unknown."; `pairs[].interaction` "DDInter's interaction text as stored, like management. null when DDInter has none."; `pairs[].applies` "true when a medicine we hold is checked against both entries for its route."; `pairs[].review` "The senior review state and time: not_reviewed, reviewed, changed or issue."; `pairs[].changes[]` "What changed in DDInter since the review. Only when the state is changed."

**Errors** (each panel's rows; "Status" plain, "Code" mono; `{field}` is mono `errors[0].field`, `{fields}` the mono field names, joined by ", "):

| Panel | 400 `INVALID_QUERY` fields | 404 `NOT_FOUND` fields |
|---|---|---|
| batches | none (any query parameter) | no 404 row |
| batch | `batchId` | `batchId` |
| record | `batchId`, `conceptId` | `batchId`, `conceptId` |
| records | `filter`, `stage`, `batch`, `page` | `batch` |
| pairs | `bdsId`, `page` | `bdsId` |

| Status | Code | When | What to do |
|---|---|---|---|
| 400 | `INVALID_QUERY` | "{field} is the first input refused: {fields}, or a query parameter this endpoint doesn't take, or one sent twice." (batches: "{field} is the query parameter you sent: this endpoint takes none.") | "Fix that input by the rule in Parameters, then send again." |
| 401 | `UNAUTHORIZED` | "The Authorization header is missing or malformed, the key is unknown, expired or revoked, or your account no longer has QA access. The answer never says which." | "Check the header is Authorization: Bearer and your key. In Your keys, check the key is Active; if it isn't, create a new one." |
| 404 | `NOT_FOUND` | "{field} names the id that wasn't found: {fields}." | "Check the id. Ids are case-sensitive: copy them from another answer." |
| 429 | `RATE_LIMITED` | "Your key made more than {limit} requests in a minute, counting the API and the MCP server together." (`limit` `QA_RATE_LIMIT`) | "Wait the seconds in Retry-After, then send again. A plain-text 429 without the envelope is the site's per-address limit: send fewer requests a second." |
| 502 | `UNAVAILABLE` | "IntelliDrugs couldn't read the data, or couldn't record the read." | "Try again in a minute. If it keeps failing, report it with metadata.requestId." |

**3c. `<h3>` "Problem filters"** (`id="qa-api-filters"`): the QA portal's `dl`, unchanged.

**3d. `<h3>` "MCP over HTTP"** (`id="qa-api-mcp"`)

- "The MCP server address takes the same keys and returns the same data over JSON-RPC 2.0. Your AI client sends these requests for you; use this to test the server from a script."
- One panel, `POST /api/qa/mcp`, closed, holding:

1. `<h4>` "Request"
   - mono `POST https://{SITE_HOST}/api/qa/mcp`;
   - a table, caption "Headers for {request}", columns "Header", "Value", "Required": `Authorization` / `Bearer <key>` / "Yes"; `Content-Type` / `application/json` / "Yes"; `Accept` / `application/json, text/event-stream` / "No"; `MCP-Protocol-Version` / `2025-11-25` (`SUPPORTED_PROTOCOL_VERSIONS[0]`) / "No" (the line below says when to send it);
   - "Accept may be left out; if you send it, it must allow application/json."
   - "Send MCP-Protocol-Version on every request after initialize, with the version initialize returned. Without it the server assumes {default}. Supported versions: {versions}." (`default` `DEFAULT_PROTOCOL_VERSION`, `versions` `SUPPORTED_PROTOCOL_VERSIONS`, mono)
   - "Send one JSON-RPC 2.0 message per request, at most {max} KiB, and get one JSON answer. A batch (a JSON array) is refused. The server answers {methods}; a notification gets 202 with no body. It keeps no session between requests." (`max` `MCP_MAX_BODY / 1024` = 64; `methods` mono `initialize`, `ping`, `tools/list`, `tools/call`)
2. `<h4>` "Initialize"
   - "Ask for a protocol version. The answer gives the version to send in MCP-Protocol-Version, the server's name and version, and the rules as instructions."
   - "Command" (`ExampleMarker`, "Copy command"), exactly:

     ```
     curl "https://{SITE_HOST}/api/qa/mcp" \
       -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" \
       -H "Content-Type: application/json" \
       -H "Accept: application/json, text/event-stream" \
       -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"qa-script","version":"1.0.0"}}}'
     ```

   - "Answer" (`ExampleMarker`, "Copy example"): `{ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2025-11-25", "capabilities": { "tools": { "listChanged": false } }, "serverInfo": { "name": "intellidrugs-qa", "version": "1.0.0" }, "instructions": PREAMBLE } }`, indented.
3. `<h4>` "Call a tool"
   - "The result has two text blocks: the rules, then the answer of the matching endpoint as indented JSON, here the same envelope as {path}. Parse the second block's text as JSON." (`path` mono `GET /api/qa/v1/batches`)
   - "Command" (`ExampleMarker`, "Copy command"), exactly:

     ```
     curl "https://{SITE_HOST}/api/qa/mcp" \
       -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" \
       -H "Content-Type: application/json" \
       -H "Accept: application/json, text/event-stream" \
       -H "MCP-Protocol-Version: 2025-11-25" \
       -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_batches","arguments":{}}}'
     ```

   - "Answer" (`ExampleMarker`, "Copy example"): `{ "jsonrpc": "2.0", "id": 2, "result": { "content": [ { "type": "text", "text": PREAMBLE }, { "type": "text", "text": JSON.stringify(batchesExample, null, 2) } ] } }`, indented.
4. `<h4>` "Tools"
   - a table, caption "MCP tools", columns "Tool", "Arguments", "Same data as", one row per `TOOLS` entry in its order: the name in mono; each `inputSchema` property in order as mono name plus " required" or " optional" (by `inputSchema.required`), joined by ", ", or "No arguments." when there is none; and mono `GET /api/qa/v1/…` for the tool's `TOOL_ROUTES` route. Rendered from `TOOLS`, never retyped.
   - "Arguments follow the rules in each endpoint's Parameters. {page} is a JSON integer, not text. A tool refuses any argument it doesn't list, and a {batchId}, {batch} or {conceptId} of {dot} or {dotdot}." (mono fills; `dot` `.`, `dotdot` `..`)
5. `<h4>` "Errors"
   - a table, caption "Errors for {request}", columns "Status", "JSON-RPC code", "Message", "What to do" (code and message mono, the §7.10.6 fixed strings):

| Status | JSON-RPC code | Message | What to do |
|---|---|---|---|
| 405 | `-32000` | `Method not allowed` | "Send POST." |
| 403 | `-32002` | `Forbidden` | "Leave out Origin, or send this site's own address." |
| 401 | `-32001` | `Unauthorized` | the 401 "What to do" above |
| 502 | `-32004` | `Unavailable` | "Your key couldn't be checked. Try again in a minute." |
| 429 | `-32003` | `Too many requests` | the 429 "What to do" above |
| 415 | `-32000` | `Unsupported media type` | "Send Content-Type: application/json." |
| 406 | `-32000` | `Not acceptable` | "Leave out Accept, or allow application/json in it." |
| 413 | `-32000` | `Request too large` | "Keep the body under {max} KiB." |
| 400 | `-32700` | `Parse error` | "Send one JSON value in UTF-8." |
| 400 | `-32600` | `Invalid Request` | "Send one object with jsonrpc "2.0", a method, and a string or number id. Never an array." |
| 400 | `-32600` | `Unsupported protocol version` | "Send a supported MCP-Protocol-Version, or leave it out." |
| 200 | `-32602` | `Invalid params` | "initialize needs params.protocolVersion; tools/call needs params.name, and arguments must be an object." |
| 200 | `-32601` | `Method not found` | "Use initialize, ping, tools/list or tools/call." |
| 200 | `-32603` | `Internal error` | "Try again. If it keeps failing, tell the IntelliDrugs team when it happened." |
| 200 | `isError: true` | `Invalid input {name}` | "Fix that argument by the rule of the endpoint's parameter." |
| 200 | `isError: true` | `Unknown tool` | "Use a tool name from tools/list." |
| 200 | `isError: true` | `QA API error {status} {code}` | "See that status in the endpoint's Errors table." |

**4. "Rules"**

- "Every answer from the MCP server starts with these rules. Follow them in every report."
- An `<ol>` with one item per line of `PREAMBLE` (`lib/qa-mcp-tools.ts`, §7.10.6), rendered from the constant.
- "Use only your own keys. Never paste a key into a chat, a ticket or a file under version control. If a key may have leaked, revoke it at once."

**Copy buttons (CopyButton island).** Plain sm buttons, at least 24 × 24 px, with the visible labels above. On press: `navigator.clipboard.writeText(text of the target element)`, then announce "Copied.". When the clipboard is unavailable or refused, the island selects the target's text and announces "Couldn't copy. The text is selected; press Ctrl C (Cmd C on Mac) to copy it." Without JavaScript the buttons are not rendered (`hidden` until the island mounts) and every text stays selectable. *(QA API reference)* The reference's buttons pass `context` " for {request}" (§4.2), so each has its own name; a button inside a closed panel copies the same text as when it is open.

**States, keyboard and a11y.**

- One `<h1>`; headings in order (`h1`, `h2`, `h3`, and *(QA API reference)* `h4` inside the reference's panels); every control labelled; status words, never colour alone; targets at least 24 × 24 px (the panels' summaries included); no horizontal page scroll at 320 CSS px (the key, the address and the snippets wrap; the key list and every reference table sit in labelled scroll regions; every reference code block scrolls inside its own labelled region, with every panel open); `:focus-visible` everywhere; focus never falls to `<body>` after an outcome.
- Keyboard: native controls only, no single-key shortcuts on this page. Esc closes the revoke confirmation. *(QA API reference)* A panel's summary opens and closes with Enter and Space (native `<details>`); each code and table region is reachable with Tab and scrolls with the arrow keys.
- No JavaScript: sections 1, 3 and 4 and the key list read fully (the reference's panels open and close natively; only the copy buttons are absent); creating and revoking need the bot check and show the `<noscript>` line.
- CSP: the Turnstile script carries the nonce (§9.4); no inline script or style.
- Audit: none for viewing the page (it reads no unreviewed data); `qa_key_created` and `qa_key_revoked` from the API (§5.15).

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
   - *Amendment (P1A Task 10 review):* the output is checked as well as the input, because dot-segment normalisation can turn a same-origin input into a protocol-relative path (`new URL("/.//evil.com", origin).pathname` is `//evil.com`). `safeReturnTo()` returns `null` when `pathname + search + hash` starts with `//`, and when `new URL(out, origin).origin !== origin`. Added unit cases, all refused: `/.//evil.com`, `/a/..//evil.com`, `/%2e//evil.com`, `/%2e%2e//evil.com`.

**States** (each a server-rendered `Banner` or card, selected by `?state=` or by island state):

| State | Copy |
|---|---|
| Loading | The button shows a spinner and "Opening Google", keeping its size. The line "Finish signing in in the Google window. This page updates when you're done." |
| Signed in, reader (`?welcome=1`, role `user`) | Account row (initials, own name, own email). `<h2>` "You're signed in as a reader". "You can search medicines and check interactions. Reviewing needs an invite. If you were invited, sign out and continue with the invited Google account." Buttons "Search medicines" and "Sign out". |
| Invited reviewer (`?welcome=1`, role pharmacist or engineer) | Role badge with shield, "Signed in as {name}". `<h2>` "You're a {pharmacist\|engineer} reviewer for batch {id}". Steps: "{n} records are waiting. Each shows [Not yet reviewed by a pharmacist] until a pharmacist approves it." / "Compare the DGDA register with the extraction, then press `A` or choose Looks correct. You have {undo} seconds to undo with `U`." ({undo} = the reviewer's undo window, §5.8.1; 8 by default, which is Board P's wording) / pharmacist: "Your approval publishes the record. If the pipeline re-runs it later, it comes back to you as [Back in review]."; engineer: "Your check is recorded but does not publish. A pharmacist approves each record." Button "Open the review desk" with "Shortcuts work inside the desk only, and pause while you type." *(P1C)* Role `senior`: the `<h2>` reads "You're a senior pharmacist reviewer for batch {id}", the pharmacist step is shown, and a fourth step follows: "Senior review shows every interaction pair between the medicines we hold, from all batches. Mark each pair reviewed, or report a pair issue." with the link "Open the pair queue". |
| *(QA portal)* QA account (`?welcome=1`, role `qa`) | Role badge "QA", "Signed in as {name}". `<h2>` "You have QA access". Steps: "Create a key on the QA tools page. It is shown once, so copy it then." / "Connect Claude Code, Cursor or a script with the key. What it reads may not be reviewed yet, and it can't change anything." / "QA accounts don't review records. Reviewing needs a reviewer invite." Button "Open QA tools" (to `/review/qa`). No batch read: the page calls `listReviewBatches()` for reviewer roles only (§5.13). Engineer and senior welcomes are unchanged; they reach QA tools from the account menu. |
| Bot check failed | crit: "We couldn't confirm you're a person." / "You weren't signed in. Retry the check. If it fails again, turn off extensions that block scripts on this page." Button "Retry check". |
| Sign-in cancelled (popup closed) | info: "Sign-in cancelled." / "You closed the Google window before finishing. Nothing changed. Continue with Google to try again." |
| Pop-up blocked | warn: "Your browser blocked the Google window." / "Allow pop-ups for drugdb.eliooo.org, or continue in this tab instead." Button "Continue in this tab" (`signInWithRedirect`, §9.5). |
| Sign-in not configured | "Sign-in is not available right now." / "Searching and checking interactions don't need an account." |
| Session request failed (5xx or network) | crit: "Couldn't sign you in." / "Nothing changed. Check your connection and try again." |
| Too many sign-in attempts (429, §9.3) | warn: "Too many sign-in attempts. Wait a few minutes and try again." |
| Invite sent to another Google account | Not a `/signin` state. A reviewer who signs in with an account that is not on `REVIEWERS` has role `user`: `/signin` shows the reader welcome, and any `/review/*` route (including the `returnTo` target) renders Board P's "This Google account isn't on the reviewer list." banner on the not-authorised page (§5.12). |

**Account menu** (`<details>`):

- the `summary` (avatar button) carries sr-only text "Account menu for {own name}" (Board P);
- head: avatar, own name and own email; for reviewers, the role badge plus "Batch {id}"; *(QA portal)* for role `qa`, the badge "QA" and no batch;
- items: "Review desk" and "Problem reports and partner requests" (reviewers only), *(P1C)* "Senior review" (seniors only, to `/review/pairs`), *(QA portal)* "QA tools" (roles `qa`, `engineer` and `senior`, to `/review/qa`; after "Senior review"), the theme control; on `/review/*` also "Keyboard shortcuts and settings" and the "Single-key shortcuts" control (§5.14); then "Sign out" (form POST to `/signout`, §2.1).

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

**Removed records (Decision).** When the product's latest batch item is marked "removed from batch file", the product is served publicly as this stub, whatever its last decision (the API returns the stub with `status:"removed"`, §7.4). The pill stays `NOT_REVIEWED`, and the two review sentences are replaced by "Removed from the DGDA batch file." (new copy, §1.7). A removed product is never counted as approved anywhere (search, checker, other brands, stats). *(P1C)* If the item comes back into its batch file, the record is re-opened (§8.3.1 item 5), so it stays this stub (with the review sentences again) until a pharmacist approves it.

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
   - *(P1C, PO D8, D58)* A fifth column, "Source", holds the code's `SourceLink` and "fetched on {date}" (§5.6.6). The table caption stays. The "Where this record comes from" aside (below) adds the row Source "DGDA register" as a `SourceLink` to the OCL concept, with "fetched on {date}". Source links appear only on approved product pages. Stubs never carry them.
6. **"Interactions"** (subtitle "From DDInter 2.0, for {name}"; one block per substance). The block depends on the substance's coverage and chosen entries, and **never renders a count of 0 for missing data**:
   - **Data found for the route** (coverage `full`, at least one chosen entry):
     - `<h3>` "{total} drug–drug pairs" for the chosen entries;
     - severity chips with counts;
     - key-value "**{d}** drug–disease interaction[s]", "**{f}** drug–food interaction[s]";
     - the checked-against line (§5.6.4) when the route is not systemic or was assumed.
   - **No data** (coverage `none`): a `NoDataBlock` in place of the count heading, chips and key-values, with title = the substance name, `NO_DATA_SENTENCE`, and the second line "Drug, disease and food interactions: no data in DDInter 2.0." In the Codes table (item 5), the DDInter row shows `NoDataChip("No data")`.
   - **No entry for the route** (coverage `full`, no chosen entry): the §5.6.1 line ("No DDInter entry for this product's route ({route}). Its pairs are not checked.", or its no-route form) in place of the count heading, chips and key-values. The DDInter row of the Codes table shows the plain text "No entry for route {route}" (or "No entry for this product's route" when it has none) in the Code column, with no `NoDataChip` (the substance has data; the hatch is only for coverage `none`, §3.4), and "How it was matched" is empty.
   - **Not run** (coverage `not_run`): `NOT_RUN` as plain text, and nothing else. (An approved product cannot be in this state, because approval needs the DDInter stage to have run (§7.2); it is specified for completeness.)
   - **"With other approved medicines"** (**Decision, amended by P1C, PO D3, D4; D60**; replaces D25's "With the other medicines in batch {id}"). It covers approved products from **every** batch (the §7.4 visibility rule), because an interaction partner is no less real for sitting in another batch. Brand-by-brand pairing does not scale across batches (one substance can have hundreds of approved brands), so the block is **grouped by partner substance**:
     - `PairCard`s, Major first, then by partner substance name. Head "{this substance} + {partner substance}". Meta: "With {k} approved brand[s]: {up to 3 brand names, joined}[ and {n} more]. Action: {actions}". Then `FROM_DDINTER`, then the pair's public review state (`PAIR_REVIEWED` with its date, or `PAIR_NOT_REVIEWED`; plain text, D53). Then the text block, and the source line "Source: DDInter 2.0, `{idA}` + `{idB}`". The "and {n} more" brands are listed in a `<details>` "All {k} brands", each linking to its product page.
     - Unclassified pairs without text are grouped in one panel: chip "Severity not classified by DDInter {k}", then "{this substance} with {partner substances, joined}.", then `UNKNOWN_PAIRS_LINE`, each partner followed by its review state in brackets: "(pair reviewed by a senior pharmacist on {date})" or "(pair not yet reviewed by a senior pharmacist)".
     - Partner substances with no data: a `NoDataBlock` per partner substance, with "Not checked: {this substance} + {partner substance}, in {k} approved brand[s]". Partners with no route entry, or not run, use the §6.7.3 item 4 lines.
     - The "No interaction listed in DDInter 2.0" block is dropped from the product page. Across every approved product it would be a list of almost everything. The checker, where the reader chooses the medicines, keeps it (§6.7.3 item 2).
     - Paging: 20 partner substances per page, with GET links "More interactions" / "Previous interactions" (`?ix=`), so the page stays inside the §10.6 budget.
     - Empty (no approved partner): "No other approved medicine has an interaction with {this substance} listed in DDInter 2.0 yet. Other medicines appear here as pharmacists approve them."
     - Unapproved partners are not shown here. The checker covers them by name, under "Not yet reviewed by a pharmacist".
7. **"Automated checks"** (subtitle "{ok} OK, {w} Warning[s]. Notes are the pipeline's own."):
   - four `StageCheck` cards. An OK card with no note shows "No pipeline note.";
   - the DDInter warning lists text-missing pairs: "DDInter text not found for {n} pair[s]:" plus `.stage-pair` items. Severity chips are not shown on the public page, per Board P.

**Aside:**

- **Verification card**:
  - approved pill;
  - "A pharmacist compared this record with the DGDA register on {DD/MM/YYYY}. Decision history shows roles, not names.";
  - "If the pipeline re-runs {brand}, the record goes back to review and leaves public view until it is approved again." *(P1C, D54)* becomes "If the pipeline changes data this approval covered, {brand} goes back to review and leaves public view until it is approved again." (§1.6 item 17)
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
- names list; codes table (all DDInter entries, each with its route; *P1C*: with the "Source" column of §6.5 item 5);
- coverage:
  - `full`: neutral text "Interaction data found", never green;
  - `none`: `NoDataBlock`;
  - `not_run`: `NOT_RUN` (Board L), never the no-data sentence;
- per-entry severity counts;
- **"Drug–drug interactions"**: a paginated list, 20 per page, from `GET /v1/substances/{bdsId}/interactions`:
  - severity filter as GET links: "All", "Major", "Moderate", "Minor", "Severity not classified by DDInter";
  - each item is a `PairCard` with partner name, entry and route, actions and text; *(P1C)* plus `FROM_DDINTER`, the pair's public review state (D53) and, when the pair has an `interaction_id`, the `SourceLink` "Full record in DDInter 2.0";
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
   - *(P1C, PO D4, D53)* Directly under the head: `FROM_DDINTER` · the pair's public review state, `PAIR_REVIEWED` (with the counting review's date) or `PAIR_NOT_REVIEWED`. It is plain text, not a chip, a pill or green. Every alert is shown with its DDInter text, whatever its review state: senior review is after the fact, not a gate.
   - Known severity: meta "{substance} + {substance}. Action: {actions}", then:
     - with management: management text (truncated over 200 characters) plus "Management, truncated. Full text from DDInter 2.0." and the Expander "Show full text" / "Show less", or "Management, full text from DDInter 2.0.";
     - *(QA, Decision, PO 17/10/2026, D64)* with management **and** an interaction description: the management block above, then the interaction-description block (below);
     - without management: "DDInter 2.0 gives no management text for this pair." plus the interaction-description block;
     - with neither: "DDInter 2.0 gives no text for this pair."
   - **Interaction-description block** (Board P's): DDInter's interaction text, never rewritten, plus "Interaction description, truncated. Full text from DDInter 2.0." and the Expander "Show full text" / "Show less" when it is over 200 characters, or "Interaction description, full text from DDInter 2.0." Once JavaScript runs, the Expander clamps a text over 200 characters to three lines, like the management text, so a long description starts collapsed; a shorter one has no Expander and shows in full; without JavaScript every text renders in full (§4.4). *(QA)* Rules for the card that shows both texts:
     - "No text" follows `ddinterText()` (§3.6): a DDInter placeholder counts as no text, so a pair whose description is a placeholder keeps today's management-only card;
     - each text and its label line are wrapped in their own element, so the `PairCard.module.css` sibling rules that swap "truncated" and "full text" apply to their own text only (unwrapped, a clamped management text would hide the description's label);
     - each Expander targets its own text id and carries `describedBy` (§4.2) pointing at its own kind label, so the two "Show full text" buttons are told apart by assistive technology;
     - the label line `FROM_DDINTER` · review state, the meta, the route-assumed lines and the footer are unchanged;
     - it applies to the checker's alert cards only: `PublicPairCard` takes it as an opt-in prop that `CheckResults.tsx` alone sets, and the product-page (§6.5) and substance-page (§6.6) cards keep their markup;
     - no unapproved data (G3): the text is the `interaction` field already in `alerts[]` of the check result, computed over public products only (§7.4). No API change, no new island (Expander is on the §4.2 list), no new copy (§1.7), no announcement;
     - budgets: `/check` stays within §10.6 (HTML ≤ 50 KB gzip on the Lighthouse checker URL, JS unchanged apart from extra Expander instances).
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
- **Stats unavailable (Decision).** When `GET /v1/stats` fails or answers a malformed body, `/learn/{chapter}` renders no chapter body and no snapshot block. It renders the shell (skip link, toolbar, chapter nav without the nav note, no rail, the footer), the chapter title as the page's `<h1>`, and a `crit` banner: title "Couldn't load this chapter.", body "The live pilot numbers did not load, so no example is shown. Nothing was changed.", and a link "Try again" to the same chapter.
- **Approval-state sentences (Decision).** A Board L sentence that states a pilot record's approval state renders only while `/v1/stats` says it is true: chapter 1's public card (with its `aria-label`, its caption and the sentence that points to it), chapter 6's worked-check banner, chapter 8's captions under the public example bodies, and the FAQ's "Why can't I see Napa on the public site?". Once it is false the sentence is left out; no replacement copy is shown.
- **Before P2 (Decision).** §1.6 item 13's chapter 1 sentence "The API returns the same thing: the id, trade name, status "not_reviewed" and hidden: true." and chapter 8's caption under the public product body describe the §7.4 hidden stub, which P2 ships. Learn renders them only once `GET /v1/products/{id}` serves that shape (a web test reads `HiddenRecord.java`, so P2's change cannot go unnoticed). Chapter 8's example bodies and its safety-fields row describe the §7.4 contract under Board L's "illustrative" banner.

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

**P1C additions (PO D2, D10; D49, D57).**

- **Roles.** `reviewerRole` accepts `pharmacist`, `engineer` and `senior` (V7, §7.8). `ReviewService.ROLES` adds `senior`, and so does `AuditService.ROLES` (§7.5). The web sends the session's role unchanged (§5.13 lists every web gate that changes). `ApprovalRule` treats `senior` as a pharmacist wherever it tests `PHARMACIST`: a senior `ok` approves and publishes. Step 8 (already checked) stays engineer-only.
- **Decision values.** `decision` accepts `ok`, `issue` and `dismiss`. Validation (400, before any transaction, audited as `decision_rejected`):
  - `dismiss` from any role other than `senior`: 400, `field=reviewerRole`, "Only a senior pharmacist can dismiss an issue";
  - `dismiss` note: like `issue`, 5–1000 characters after trimming (400, `field=note`).
- **Steps for `dismiss`.** Steps 1–4 run unchanged (idempotency, run stamp, other reviewer, removed). Step 5 (checks) does not apply: a dismissal publishes nothing, and it is allowed on records with failed checks. Steps 6–8 are replaced by:

| Step | Check | Response |
|---|---|---|
| 6d. Open issue | `decision=dismiss`, and the display status is not `issue` (no counted reviewer issue: none was reported, it was already dismissed, a re-run cleared it, or the item's `issue` is the pipeline's own) | 409 `CONFLICT`, `field=review`, "No issue is open on this record" (UI outcome `no_issue`, §5.8.4) |

- **Write.** The `dismiss` row is inserted like any decision. The `decision` audit row has `outcome = 'dismiss'` and `actor_role = 'senior'`, in the same transaction. `recomputeItem` then sets `review = 'pending'` (§5.2). `recomputeBatch` runs as today, so a batch whose last open issue is dismissed stays `in_review` until that record is approved again. The `Outcome` is as for any decision.
- **Idempotency.** A repeated `requestId` with the same target and `decision=dismiss` is a 200 replay. With any other target or decision it is 400 `field=requestId` (step 1, unchanged).

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
                 role?, decision?, note?, counts?: boolean, mine?: boolean,
                 carriedFrom?: string } ],   // oldest first; carriedFrom (P1C): the batch id of a carried approval, §8.3.1 item 8
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
TextMissingPair = { ddinterA, nameA, ddinterB, nameB, severity, inBatch,
                    partnerScope: "batch"|"same_product"|"other" }   // partnerScope: P1C; inBatch = (partnerScope == "batch")

GET /v1/review/batches/{b}/items/{c}/diff?from=<extractedAt ISO>
→ { from, to, reason, rows: [ { field, before, now } ] }       // 404 when no snapshot exists for `from`
```

**P1C additions to `ReviewItem` (PO D4, D6, D8, D10; D53, D55, D57, D58)**, all additive:

```
ReviewItem += {
    brand.source: Source,                                   // DGDA register (OCL), fetchedAt = raw.ocl_concept.fetched_at
    otherPairs: { pairs: [ { ddinterA, ddinterB, nameA, nameB, substance, partnerSubstance, partnerBdsId, severity, actions,
                             interaction, management, source: Source|null, pairReview: PairReview,
                             partners: [ OtherPartner ], partnerCount } ],
                  notChecked: [ { substance, partnerSubstance, partnerBdsId|null, partners: [ OtherPartner ], partnerCount,
                                  reason: "no_data"|"not_run"|"no_route"|"unmapped", side, route } ],
                  otherBatches: number },                    // 0 → "There are no other batches yet."
    history[].decision: "ok"|"issue"|"dismiss",
    history[].uncountedBy?: "rerun"|"dismiss",              // why counts=false: chooses the §5.6.5 suffix
    openIssues: [ { role, at, note, mine } ]                // counted issues the dismiss panel quotes (§5.10a)
}
batchPairs.pairs[] += { source: Source|null, pairReview: PairReview }
IngredientSummary.codes[] += { source: Source|null }
IngredientSummary.ddinter.entries[] += { source: Source|null }   // fetchedAt = curated.ddinter_drug.fetched_at
OtherPartner = { conceptId, tradeName, batchId, approved: boolean }   // at most 5 per pair or line, the first 5 in partner order;
                                                                     // partnerCount gives the total; the web never promises more (§5.6.2)
Source = { url, label, fetchedAt: ISO|null }                      // built only by SourceLinks (§5.6.6)
PairReview = { state: "not_reviewed"|"reviewed"|"changed"|"issue", at: ISO|null, mine: boolean, note: string|null }
```

- **`otherPairs`** is computed by a new pure function, `BatchPairs.computeFor(me, partners, rows, complete)`, over this record (`me`) and the latest current item of every product held in another batch (`partners`). "Latest current" is the item `ReviewSql.statusOf` reads; items marked removed are excluded. A product that is also in this batch is left out. `approved` is true when that latest item's display status is `approved`. Partners are ordered by batch id, then trade name.
  - **Linear, never quadratic (Decision).** `BatchPairs.compute` first builds the all-pairs batch set over every product pair (O(n²) × substances × chosen ids) to count `totalBatchPairs`. Run over every held product of every batch (up to the ~39,000 register products), that loop would run on each desk record open. `computeFor` iterates only `me × partners` (O(n)), never partner × partner, and computes no batch-wide count; that is why `otherPairs` has no `totalPairs` and §5.6.2's "In other batches" has no "None of the {N} …" line. It returns `OtherPartner`s (with `batchId`), never `PartnerRef`, whose in-batch `index` has no meaning across batches. The pair and not-checked logic (RouteRule on both sides, `REASON_ORDER`, same-substance skip) is shared with `compute`, so the two never disagree.
  - The queries are set-based: one product query, one code query, one pair query (as `R2dbcCheckAdapter` does), never one query per batch. The pair query reads only rows that touch one of `me`'s chosen ids.
  - **`interactionId`.** `BatchPairs.PairRow` adds `interactionId`, and the `pairRows` SQL (`R2dbcReviewQueryAdapter`) selects `p.interaction_id`, so `batchPairs.pairs[].source` and `otherPairs.pairs[].source` can build the DDInter pair link (§5.6.6).
  - **Scale test.** `OtherPairsScaleIntegrationTest`, like `StatsScaleIntegrationTest`: with 40,000 held products across 20 batches, a record open answers within the §10.6 API p95 (300 ms), and the query count is constant.
- **`partnerScope`** on `TextMissingPair` *(P1C)*, computed in `ReviewQueryService.stages` from the chosen-id sets it already builds (`mine` for this record, `others` for the other current products of this batch), where the partner side is the id that is not one of `mine`: `batch` when `others` holds the partner side (when `mine` holds both ids, when `others` holds either of them); else `same_product` when `mine` holds both ids; else `other`. `inBatch` stays, unchanged (`partnerScope == "batch"`), for compatibility; the web reads `partnerScope` only (§5.5.3).
- **`pairReview`** comes from `PairReviewRule` (§7.7). The reviewer surfaces show all four states.
- **`openIssues`** lists the counted `issue` decisions after the last counted dismiss. The note is included (reviewers only, as in history), and the email never is.
- **`displayStatus`** applies the §5.2 dismissal boundary (`ApprovalRule.displayStatus` and `ApprovalRule.review`), for whole batches in one decisions query, as today.

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
| P10 | `GET /v1/products/{id}/interactions` | *(amended by P1C, D60)* `page` (0–), `size=20` | *(P1C)* `{conceptId, page, totalPartners, partners:[{substance:{bdsId, name}, partnerSubstance:{bdsId, name}, severity, actions, interaction, management, ddinterA, ddinterB, routeAssumed, source:"DDInter 2.0", pairReview:{state:"reviewed"\|"not_reviewed", reviewedAt\|null}, brands:[{conceptId, tradeName}], brandCount}], notChecked:[{substance, partnerSubstance, reason, brandCount}]}`. It covers every other **public** product, in **any** batch, grouped by partner substance (§6.5). Pages hold 20 partner substances, Major first. Public scope: when `{id}` itself is not public, the product stub (as `GET /v1/products/{id}`), never a result; 404 for an unknown id. | "With other approved medicines" (was "With the other medicines in batch …") |
| P8 | `GET /v1/clinical-drugs/{bdcId}` | none | `{bdcId, displayName, doseForm, route, ingredients:[{bdsId, name, strengthValue, strengthUnit, perValue, perUnit}], products:[{conceptId, tradeName, company, darNumber}]}`. Public scope: `products` lists public products only, and the whole response is 404 `NOT_FOUND` unless at least one public product maps to `bdcId`. | "Other brands of …" |
| P9 | `GET /v1/substances/{bdsId}/interactions` | `severity` (optional), `page` (0–), `size=20` | `{bdsId, counts:{…per entry}, total, page, items:[{partnerName, partnerBdsId\|null, ddinterA, ddinterB, routeScope, severity, actions, interaction, management}]}`. Public scope: when the substance is not public, the substance stub `{bdsId, preferredName, hidden:true}`, never items or counts; `partnerBdsId` is `null` when the partner substance is not public (the partner's DDInter name is DDInter's own public data and stays). *(P1C)* Each item adds `pairReview:{state:"reviewed"\|"not_reviewed", reviewedAt\|null}` and `sourceUrl\|null` (the DDInter pair page, §5.6.6). | Substance page list with text |
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
              ddinterA, ddinterB, interactionId, source: "DDInter 2.0",
              pairReview: { state: "reviewed"|"not_reviewed", reviewedAt|null } } ],                // P11; pairReview: P1C
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

**P1C public rules (PO D4, D7; D53, D56).**

- **Every alert is returned with its DDInter text**, whatever its senior-review state. `pairReview` is the coarse public form of `PairReviewRule` (§7.7): `reviewed` only when the counting pair review's content hash equals the current one. `changed`, `issue` and `not_reviewed` are all sent as `not_reviewed`, with `reviewedAt: null`. **Decision**: like `exampleUsable` (D43), this is a deliberate, coarse public signal. It carries no note, role, email or reason, and it is served only for pairs between public products.
- **Where it ships (amended by the P1C plan, 15/10/2026).** P1C adds `ddinterA`, `ddinterB` and `pairReview` to each alert of the existing `POST /v1/interactions/check` (additive; the other alert fields stay as they are until P2 reshapes the result). P2 renders it, and adds it to P9.
- **Removed items are never public (PO D7).** `ReviewSql.statusOf` reads a latest item marked "removed from batch file" as `pending`, and `ReviewSql.LATEST_PUBLIC` excludes it. Both shipped with P3's `GET /v1/stats` (commit `b4f45c3`, on the P3 branch, not yet on `main`). Every public adapter that exists today reads status through them: `R2dbcProductAdapter`, `R2dbcSubstanceAdapter`, `R2dbcCheckAdapter` (the checker) and `R2dbcStatsAdapter`. Every adapter P2 adds (search, suggest, clinical drugs, P10) must do the same. P1C depends on P3 for this. It adds no second rule: it adds the approved-then-removed fixture for **every** endpoint of the `VisibilityApiIntegrationTest` matrix, including `POST /v1/interactions/check` and the reshaped P10, and a guard test. The guard test fails if a public adapter reads `ops.batch_item.review` without `statusOf` or `LATEST_PUBLIC` (§11.3). Reviewer reads already skip removed items (`ReviewSql.CURRENT_ITEM`), and `otherPairs` and the senior pages use the same rule (§7.3, §7.7).

### 7.5 Flags and audit

- `GET /v1/flags?status=&targetType=&targetId=&page=&size=50` (R15). The 500 cap is replaced by paging.
- `POST /v1/audit-events` (token):
  - body `{ event, actorEmail?, actorRole?, targetType?, targetId?, outcome, requestId }`;
  - `event` is restricted to the list in §5.15 (*P1C*: plus `senior_open`; `pair_decision` and `pair_decision_rejected` are written by the API only);
  - returns 201.
- *(P1C)* **`AuditService` changes** (`$API/application/AuditService.java`; V7 widens only the database checks, §7.8):
  - `WEB_EVENTS` adds `senior_open`;
  - `ROLES` adds `senior` (§5.13);
  - `TARGET_TYPES` adds `substance` and `pair_queue` (the `senior_open` targets, §5.15). `ddinter_pair` is not added: only the API writes it, inside the pair decision path;
  - the `senior_open` target ids fit the existing `TARGET_ID` pattern: a BDS id such as `BDS-000001`, or a `show` value (`todo`, `changed`, `issue`, `reviewed`, `all`). No pattern change;
  - `AuditApiIntegrationTest` adds: `senior_open` with each target type is 201; a senior `sign_in` (role `senior`) is 201; `pair_decision` posted by the web is 400 `event`; target type `ddinter_pair` posted by the web is 400 `targetType`.

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

### 7.7 Senior review endpoints (P1C; all require the token; new `SeniorReviewController`)

The web calls these only for a `senior` session (§5.17). The API trusts the token and the `reviewerRole` in the body, as it does for decisions, and checks that role on every write. `X-Viewer-Email` sets `mine`, as in §7.3.

```
GET /v1/review/pairs?show=todo|changed|issue|reviewed|all&pairs=all|applies&severity=&page=0&size=50
→ { total, counts: { todo, changed, issue, reviewed, all },
    items: [ PairView ] }                                   // every pair between held substances (PO D3(b)); pairs=applies keeps
                                                            // applying pairs only (§5.17); ordered as §5.17.1

GET /v1/review/substances?q=&page=0&size=50
→ { total, items: [ { bdsId, name, brands, batches, pairsToReview, majorPairsToReview } ] }

GET /v1/review/substances/{bdsId}?pairs=all|applies&severity=&page=0&size=50     // default all (PO D3(a))
→ { bdsId, name, names: [ { name, type, source } ],
    codes: [ { system, code, routeScope, method, confidence, source: Source|null } ],
    coverage, entries: [ { ddinterId, name, routeScope, counts, diseaseCount, foodCount, source: Source|null } ],
    brands: [ { conceptId, tradeName, batchId, displayStatus, clinicalDrug: { bdcId, displayName, route }|null,
                strengthText, chosen: [ { ddinterId, routeScope, routeAssumed } ], reason|null } ],
    pairs: { total, items: [ PairView ] } }                // 404 NOT_FOUND when the substance is not held

PairView = { ddinterA, ddinterB, substanceA: { bdsId, name }, substanceB: { bdsId, name },
             entryA: { name, routeScope }, entryB: { name, routeScope },
             severity, actions, interaction, management, source: Source|null, applies: boolean,
             brands: [ { conceptId, tradeName, batchId, displayStatus, side: "a"|"b" } ],   // at most 10 per side (§5.17.2)
             brandCounts: { a, b, batches },               // full totals: brands per side, distinct batches
             review: PairReview,                            // §7.3; reviewer form, all four states
             changes: [ { field, atReview, now } ],         // only when state = changed
             history: [ { decision: "reviewed"|"issue", at, note|null, mine, changedAfter: boolean } ],
             version: { contentHash, lastPairReviewId|null } }

POST /v1/review/pairs/{ddinterA}/{ddinterB}/decisions
  { decision: "reviewed"|"issue", note, reviewerEmail, reviewerRole: "senior",
    expectedContentHash, expectedLastPairReviewId: number|null, requestId }
→ 201 PairOutcome { ddinterA, ddinterB, review: PairReview, version, replayed: false }
→ 200 PairOutcome { …, replayed: true }                   // same requestId, same pair and decision
```

**Pair decision rules** (one transaction, `SELECT … FOR UPDATE` on the pair's `curated.ddinter_pair` row; the first failing step wins):

| Step | Check | Response |
|---|---|---|
| 0. Validate (before the transaction) | `reviewerRole` must be `senior`; `decision` must be `reviewed` or `issue`; `issue` needs a note of 5–1000 characters (`reviewed` takes an optional note of 0–1000 characters); `requestId` must be a UUID; `expectedContentHash` must be 64 hex characters; `expectedLastPairReviewId` must be present | 400 `INVALID_QUERY` with the field. A wrong role: `field=reviewerRole`, "Only a senior pharmacist can review pairs" |
| 1. Idempotency | an `ops.audit_event` row with `event='pair_decision'` and this `request_id` exists | same pair and decision: 200 `replayed:true`; otherwise 400, `field=requestId` |
| 2. Pair exists and is held | `ddinterA < ddinterB` (text order), the row exists, and both entries map to held substances | 404, `field=pair` |
| 3. Content | current content hash ≠ `expectedContentHash` | 409, `field=contentHash`, "This pair changed in DDInter after the page was loaded; reload it and review again" |
| 4. Other senior | max `ops.pair_review.id` for the pair `IS DISTINCT FROM` `expectedLastPairReviewId` | 409, `field=lastPairReviewId`, "Another senior pharmacist decided on this pair after the page was loaded; reload it" |
| 5. Already reviewed | `decision=reviewed` and state is `reviewed` | 409, `field=state`, "This pair is already reviewed" |

- The insert stores the content hash and the content itself (`content` JSONB: severity, actions, interaction, management), so "What changed in DDInter" (§5.17.2) can diff it later. The `pair_decision` audit row is written in the same transaction. `pair_decision_rejected` is written in its own transaction after a 400 or 409, as in §7.2.
- **`PairReviewRule`** (`$API/domain/PairReviewRule.java`) is the one pure function that maps the pair decisions plus the current hash to `{state, at, mine, note}` (§5.17). Every reviewer and public endpoint uses it. It is computed for a page of pairs with one query over `ops.pair_review` (no N+1).
- **Content hash** (`$API/domain/PairContent.java`): SHA-256 hex of the UTF-8 canonical JSON `[a, b, severity, sorted(actions), interaction|null, management|null]`, after `DdinterText.clean`. A unit test pins the bytes of the canonical form.
- **Removed and unheld items.** Brands come from latest current items only (`ReviewSql.statusOf` semantics). A product removed from its batch file is not held and is never listed.
- **Rate limit and bot check**: as for decisions (§9.2, §9.3).

### 7.8 Schema change: `V7__senior_review.sql` (P1C; follows the lock policy; tag `db-schema-v1.2`)

Three needs that no existing table can meet:

- a `senior` role and a `dismiss` decision, which the V4 `CHECK` constraints refuse (PO D2, D10);
- append-only pair reviews with the content they reviewed (PO D3, D5);
- the new audit events and the `senior` actor role (§5.15).

```sql
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

- **Additive in effect.** Existing rows all satisfy the widened checks. Constraint changes are DDL, not row changes, so the V6 append-only triggers on `ops.audit_event` are not involved.
- **The pair FK is NO ACTION.** The ETL only inserts or updates `curated.ddinter_pair` (upserts, §8.1), and never deletes a pair row, so a reviewed pair cannot vanish. An ETL test pins that no code path deletes from `curated.ddinter_pair` (§11.3).
- **No ETL column.** The reopen rule (§8.3) compares snapshot payloads that V6 already stores. The payload gains keys (payload `version` 2), and no column changes.
- **Rollback**: a new migration that drops `ops.pair_review` and restores the narrower checks. It works only while no `senior` or `dismiss` row exists; otherwise rollback keeps V7, which older images ignore (§12.5).
- **The PR must**:
  - add the `db/migrations.lock` line for V7 and change the lock's header to `db-schema-v1.2`;
  - explain the change under the four headings `database.md` requires;
  - update `docs/design/database.md` and the data model page;
  - tag `db-schema-v1.2`.
- **Tests**: `AuditAppendOnlyIntegrationTest` adds `ops.pair_review`, and a V7 migration test asserts the constraint names, the widened checks, `review_decision_dismiss_by_senior`, and the new unique index.
- **Retention (Decision)**: pair reviews are kept indefinitely, like decisions.

### 7.9 QA API and QA MCP (read-only) *(QA, Decision, PO 17–18/10/2026; D61–D63, D65)*

**Purpose.** A read-only, key-gated API for the product owner's other project, where another LLM re-checks our data against its sources and reports mismatches. It reads what the reviewer desk reads, unapproved records included, and writes nothing but its own audit rows. It is not the partner API (§1.3 is unchanged): no public keys, metering or releases.

**Where it runs (Decision).** In the existing web app, as Next.js route handlers under `/api/qa/v1/`, because `api` is internal-only (§9.1) and the `drugdb.eliooo.org` Caddy block must not change (§12.4). The handlers call the internal API server-side with `INTERNAL_API_TOKEN`, as the reviewer pages do. No new container, port, network or Caddy change. Files: `web/app/api/qa/v1/**/route.ts`, one optional catch-all `web/app/api/qa/[[...rest]]/route.ts` (`/api/qa` and every unknown QA path answer the 404 envelope), `web/lib/qa-api.ts` (`server-only`: keys, auth, limit, envelope, audit) and `web/lib/qa-map.ts` (`server-only`: the allowlist mappers). Every handler is wrapped in `withRequestLog` (route template only).

#### 7.9.1 Auth, rate limit, headers, envelope

- **Keys.** New env `QA_API_KEYS` (web only) = `label:sha256hex[,label:sha256hex…]`. Entries are trimmed. `label` matches `^[a-z0-9][a-z0-9_-]{0,31}$`; the hash is the 64-character lower-case SHA-256 hex of the UTF-8 key. Only hashes are stored anywhere. A key is generated and handed to its holder once, by the runbook `docs/runbooks/qa-api-keys.md` (new: `openssl rand -hex 32`, then `printf '%s' "$KEY" | shasum -a 256`; rotate by adding the new entry before removing the old; revoke by removing the entry and recreating the `web` container only). *(QA portal)* These **env keys** stay, unchanged, beside the self-service **DB keys** of §7.10.2 (the admin key and the existing `tanvir-qa` key keep working); the runbook adds the DB keys and how the team revokes one (§7.10.3).
- **Disabled (Decision; superseded by D68 in the QA portal).** Until the QA portal ships: `QA_API_KEYS` unset or empty makes every `/api/qa/*` path answer 404 `NOT_FOUND`, exactly as an unknown path does, with no audit row, and a malformed value fails closed the same way. The QA portal replaces this rule with the one below.
- **Enabled when either key source can authenticate (Decision, QA portal, D68).** There is no disabled state once the QA portal ships: the QA API is enabled when either source can authenticate, the env keys (`QA_API_KEYS`) or the DB keys (§7.10.2), and a request that no source authenticates is 401, never 404. So with no env keys and no DB keys every QA route answers 401 `UNAUTHORIZED` (and writes its throttled `unauthorized` row), not 404. `/api/qa`, and every QA path that is not a route (the catch-all), still answer the 404 envelope with no auth check and no audit row. **Malformed env values stay fail-closed:** a bad label or hash, an empty entry, or a duplicate label or hash makes the env source authenticate nothing (no env key works, not even the valid entries), and the web logs one line, once, "QA_API_KEYS invalid: entry {n}" (the index only, never the value). DB keys keep working, because a typo in the env must not lock out every QA user, and it can never let an env key in. Unset or empty `QA_API_KEYS` simply means no env keys.
- **Request auth.** Only `Authorization: Bearer <key>`: scheme case-insensitive, one space, key of 32–256 characters from `[A-Za-z0-9._~+/=-]`. The handler hashes the presented key and compares the 32-byte digest with **every** configured hash using `crypto.timingSafeEqual`, with no early exit. *(QA portal)* When no env key matches and the key has the DB key form (`^idqa_[A-Za-z0-9_-]{43}$`), the handler applies the §7.10.4 verification rule; a key of any other form makes no API call. Missing, malformed or unknown: 401 `UNAUTHORIZED` with `WWW-Authenticate: Bearer`, no `field` and no detail (it never says which part failed). Cookies, sessions and any `X-Internal-Token` sent by the caller are ignored: a reviewer's browser session never authorises a QA call.
- **Order.** auth (401; *QA portal*: env keys, then DB keys, §7.10.4; the earlier "disabled (404)" first step is gone) → rate limit (429) → input validation (400) → internal API read → map → audit → answer.
- **Rate limit.** 60 requests per minute per key label, sliding window: `qa: createWindowLimiter({ limit: 60, windowMs: 60_000 })` in `createLimits()` (`lib/limits.ts`, §9.3). Every authenticated request counts, 400s included. *(QA portal)* A DB key's label is `key.{id}` (§7.10.4), which no env label can equal (env labels have no `.`), and the hosted MCP server counts against the same limiter and label (§7.10.6). Over the limit: 429 `RATE_LIMITED`, `Retry-After: 60`. The middleware's per-IP limit (10/s, burst 30) still applies first, and its 429 stays the existing plain-text answer, not the envelope; QA paths start with `/api/`, so the daily page caps never count them (existing `isPage`).
- **Methods and CORS.** GET only (Next serves HEAD through GET, and its automatic OPTIONS answer carries `Allow` only). No `Access-Control-*` header on any response.
- **Headers** on every QA response, errors included: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Content-Type: application/json`.
- **Envelope (Decision).** The platform `ApiResponse` shape, as the internal API and `/api/session` use it: `{ success, data, message, errors: [ { field, code, message } ], metadata: { timestamp, requestId } }`. `requestId` is the web request id (`x-request-id`, §9.4), which is also the `qa_read` row's `request_id`, so a finding can name the exact read. Codes and fixed messages: `INVALID_QUERY` "Invalid query" (400, with `field`); `UNAUTHORIZED` "Unauthorized" (401); `NOT_FOUND` "Not found" (404, with `field` when an id is unknown); `RATE_LIMITED` "Too many requests" (429); `UNAVAILABLE` "Unavailable" (502: the internal API failed, timed out or sent a malformed body, or the audit write of a 200 failed). Success: `message` "OK", `errors` empty. **Never 500**: every handler catches and maps to one of these.

#### 7.9.2 Input validation (400 `INVALID_QUERY`, with the `field`)

| Input | Rule | `field` |
|---|---|---|
| `batchId` (path), `batch` (query, optional) | `^[A-Za-z0-9._-]{1,100}$` (the `load-dgda.yml` batch-name character set; a batch id is the batch file's stem) | `batchId`, `batch` |
| `conceptId` (path) | `isPathId` (1–200 characters, no control character; the register holds ids such as `040-090(-077--mectigen-vet-oral-solution`) | `conceptId` |
| `bdsId` (path) | `^BDS-[0-9]{6}$` | `bdsId` |
| `filter` (required on `/records`) | one of the seven filters in §7.9.4 | `filter` |
| `stage` (optional) | `dgda`, `substances`, `clinical` or `ddinter`; allowed only with `filter=stage_warn` | `stage` |
| `page` (optional, default 0) | decimal integer 0–999 | `page` |
| a query parameter the route does not take, or a repeated one | refused | that parameter's name |

A path segment that fails to decode is 400 for its field. Ids reach the internal API only through `encodeURIComponent`. The internal API validates the same rules; an API 400 is passed on as 400 with its field, an API 404 as 404 with the route's id field (`batchId`, `conceptId`, `bdsId`, or `batch` on `/records`).

#### 7.9.3 Endpoints and shapes (the envelope's `data`)

```
GET /api/qa/v1/batches                                 ← GET /v1/review/batches
→ { batches: [ { batchId, status, itemCount, approvedCount, runAt } ] }      // approvedCount = counts.approved

GET /api/qa/v1/batches/{batchId}                       ← GET /v1/qa/batches/{b}/items (new, §7.9.5)
→ { batchId, status, runAt, itemCount,
    items: [ { conceptId, tradeName, displayStatus,
               stages: [ { stage, status: "ok"|"warn"|"fail", note } ] } ] }  // current items, concept-id order; note = the stored
                                                                              // note, whole; pipeline stage order; a stage with no result is absent

GET /api/qa/v1/batches/{batchId}/records/{conceptId}   ← GET /v1/review/batches/{b}/items/{c}, without X-Viewer-Email
→ QaRecord

GET /api/qa/v1/records?filter=&stage=&batch=&page=     ← GET /v1/qa/records (new, §7.9.5)
→ { filter, stage|null, batch|null, page, size: 100, total,
    items: [ { batchId, conceptId, tradeName, displayStatus,
               stages: { dgda, substances, clinical, ddinter } } ] }          // each "ok"|"warn"|"fail"|null; batch id, then concept id

GET /api/qa/v1/substances/{bdsId}/pairs?page=          ← GET /v1/review/substances/{bdsId}?pairs=all&page=, without X-Viewer-Email
→ { bdsId, name, page, size: 50, total,
    pairs: [ { ddinterA, ddinterB, entry: { name, routeScope },
               partner: { bdsId, name, entry: { name, routeScope } },        // the side that is not {bdsId} (side b when both are)
               severity, actions, interaction, management, link: Source|null, applies,
               review: { state: "not_reviewed"|"reviewed"|"changed"|"issue", at|null },
               changes: [ { field, atReview, now } ] } ] }                   // changes: only when state = changed (§7.7)

QaRecord = {
  batchId, conceptId, displayStatus, review, extractedAt,
  batch: { status, runAt, itemCount },
  source: { json, url, link: Source },        // json = sourceJson as stored, unchanged; url = sourceUrl; link = brand.source (DGDA/OCL)
  extraction: {
    tradeName, company, dosageForm, darNumber, genericContentRaw, qualityFlag, parseStatus, parseNote,
    dgdaIngredients: [ { xmCode, name } ],
    ingredients: [ { bdsId|null, name, raw, strengthValue, strengthUnit, perValue, perUnit,
                     names: [ { name, type, source } ],
                     coverage: "full"|"none"|"not_run", coverageNote,
                     codes: [ { system, code, routeScope, method, confidence, link: Source|null } ],
                     ddinter: { chosen: [ { ddinterId, name, routeScope, routeAssumed } ],
                                entries: [ { ddinterId, name, routeScope, counts, link: Source|null } ] } } ],
    clinicalDrug: { bdcId, displayName, doseForm, route, signature } | null },
  ddinterRoute: { route|null, routeAssumed },   // route = clinicalDrug.route; routeAssumed = any chosen entry assumed (RouteRule)
  stages: [ { stage, status, notes: [ StageNote ], textMissing: [ TextMissingPair ], evidence } ],   // §7.3; evidence as stored
  pairs: { inBatch: { totalBatchPairs, pairs: [ QaPair ], notChecked },          // §7.3 batchPairs
           otherBatches: { batches, pairs: [ QaPair ], notChecked } },          // §7.3 otherPairs; batches = otherBatches
  history: [ { kind, at, reason?, role?, decision?, counts?, uncountedBy?, carriedFrom? } ] }   // oldest first; no note, no mine

QaPair = { ddinterA, ddinterB, nameA, nameB, substance?, partnerSubstance?, partnerBdsId?, severity, actions,
           link: Source|null,                                  // the DDInter pair page (§5.6.6)
           textMissing: { interaction: boolean, management: boolean },   // by ddinterText(): null or a DDInter placeholder is missing
           review: { state, at|null },
           partners: [ … ], partnerCount? }    // in batch: { conceptId, tradeName, index }; other batches: OtherPartner (§7.3)
```

- **Sources.** Every `link` is the API's `Source` (`SourceLinks`, §5.6.6), passed through: DGDA register (OCL), RxNav, WHO ATC/DDD, DrugBank, SNOMED CT through RxNav, "Search ICD-11 for {code}", the DDInter entry and the DDInter pair. The web never builds a source URL.
- **Field paths a QA finding cites** are the JSON paths of these shapes, for example `extraction.ingredients[0].strengthValue`. The parsed strengths of a partial parse are at `stages[clinical].evidence.parsed`, and the ETL's route view at `stages[ddinter].evidence.route` and `.route_assumed`.

#### 7.9.4 Problem filters (`/records`; current items only, `ReviewSql.CURRENT_ITEM`)

| `filter` | An item matches when |
|---|---|
| `strength_missing` | a parsed ingredient in its clinical-stage evidence (`parsed[]`) has a null or missing `strength_value` |
| `parse_partial` | its product's `parse_status` is `partial` |
| `route_assumed` | its ddinter-stage evidence has `route_assumed: true`. This is the ETL's view; the record's `ddinterRoute.routeAssumed` is the API's RouteRule view, so a disagreement between the two is itself a finding |
| `no_ddinter_data` | one of its substances has coverage `none` (`curated.interaction_coverage`). Coverage `not_run` never matches (D33) |
| `unaligned` | a DGDA ingredient has no substance (its XM code maps to no BDS: `ingredients[].bdsId` null), or its clinical-stage evidence `aligned[]` has an entry with a null `bds_id` |
| `stage_warn` | one of its stage results has status `warn`; with `stage`, that stage's result |
| `stage_fail` | one of its stage results has status `fail` |

#### 7.9.5 Internal API (new `QaQueryController`; token required, `auth.require`; read-only)

```
GET /v1/qa/batches/{b}/items                          → the /api/qa/v1/batches/{batchId} shape   // 404 NOT_FOUND field=batchId
GET /v1/qa/records?filter=&stage=&batch=&page=0       → the /api/qa/v1/records shape, size 100   // 404 NOT_FOUND field=batch
```

- Hexagonal: `presentation/QaQueryController` → `application/QaQueryService` (the §7.9.2 rules as `INVALID_QUERY` with the field; `displayStatus` by `ApprovalRule.displayStatus`) → `application/port/QaQueryPort` → `adapter/persistence/R2dbcQaQueryAdapter`.
- Set-based: a constant number of queries per request (the matching rows with their stage results, the total, and one decisions query for the page's items), never one per item. Current items through `ReviewSql.CURRENT_ITEM`. No new index.
- `QaRecordsScaleIntegrationTest`, like `OtherPairsScaleIntegrationTest`: 40,000 items in 20 batches; every filter answers within the §10.6 API p95 (300 ms) with a constant query count. If it misses, the plan amends this section before adding an index, because an index is a schema change.

#### 7.9.6 Audit

- **Event `qa_read`**, written by the web through `POST /v1/audit-events` (`recordAudit`): `actorEmail` and `actorRole` null; `targetType` `qa_route`; `targetId` `{label}/{route}`, with `route` one of `batches`, `batch`, `record`, `records`, `pairs` (an unauthenticated call has no label, so `targetId` is `{route}`); *(QA portal)* `label` is an env label or a DB key's `key.{id}`, and `route` may also be `mcp` for a hosted MCP request refused before any tool ran (§7.10.6); `outcome` `ok` for a 200, else the lower-cased error code (`invalid_query`, `unauthorized`, `not_found`, `rate_limited`, `unavailable`); `requestId` the web request id. Never the key or its hash, and never path ids or query values (the route template only, as in logs, §5.15).
- **A 200 is sent only after its row is written (Decision).** If the write fails, the answer is 502 `UNAVAILABLE` with no data, so no read of unreviewed data leaves without a trace. Other outcomes are written best effort: the answer stands if the write fails.
- **Throttled rows.** `unauthorized` rows at most one per minute per (route, hashed IP), and `rate_limited` rows one per minute per label, with the `allowDeniedAudit` limiter style of `decision_denied` (§5.15; the IP is hashed in memory and never stored). Unknown QA paths write nothing (*QA portal*: there is no disabled API any more).
- **`AuditService`**: `WEB_EVENTS` adds `qa_read`; `TARGET_TYPES` adds `qa_route`. The `TARGET_ID` and `OUTCOME` patterns are unchanged; labels and route names fit them. *(QA portal)* `QA_TARGET_ID` widens to `(([a-z0-9][a-z0-9_-]{0,31}|key\.[1-9][0-9]{0,17})/)?(batches|batch|record|records|pairs|mcp)`: a DB key label and the `mcp` route name. It still admits no path id, query value, key or hash.
- **Schema change, needed (Decision, D63): `V8__qa_read_audit.sql`.** V7's `audit_event_event_check` refuses `qa_read`, so V8 drops it and adds it again with `qa_read` appended. Nothing else changes: `target_type` has no database check and `actor_role` stays nullable. Additive in effect; it follows the lock policy: the `db/migrations.lock` line and its header `db-schema-v1.3`, the four `database.md` headings, `docs/design/database.md` updated, tag `db-schema-v1.3`. Rollback keeps V8 (older images never write `qa_read`). `V8MigrationIntegrationTest` asserts the widened check.

#### 7.9.7 Privacy rules (Decision, D62)

- **An allowlist, never a pass-through.** The mappers in `lib/qa-map.ts` copy each field of §7.9.3 by name and never spread an API object, so a field the internal API adds later never reaches a QA caller.
- **Never returned:** any email (*QA portal*: including a DB key owner's, §7.10.8); decision, dismissal and pair-issue notes (`history[].note`, `openIssues`, `PairReview.note`, `PairView.history`); `mine`; version tokens and content hashes; `reopen`; flags, audit rows and session data; `INTERNAL_API_TOKEN`, keys and key hashes. Notes are omitted entirely: they are free text that could carry PHI (§9.7) and are shown to signed-in team members only, and a QA caller is neither. Decision history keeps role, time and decision. Stage notes and evidence are pipeline output, not reviewer text, and are returned.
- **Read-only.** No POST, PUT, PATCH or DELETE route; the only write is the `qa_read` row.
- **Logs** are the existing request line only (route template, method, status, duration, request id): never the `Authorization` header, the label, ids or query values.

#### 7.9.8 QA MCP (`tools/qa-mcp/`)

- **Package.** A small TypeScript stdio MCP server, with its own `package.json` and `package-lock.json`, exact pins `@modelcontextprotocol/sdk` 1.25.3 and `zod` 3.25.76 (dev: `typescript` 5.7.3, `vitest` 2.1.8, `@types/node` 22.10.7, as `web/`), Node 20 or newer. Run: `npm ci && npm run build && node dist/index.js`. It sits outside `web/`, so the web build, the bundle-secret scan and the island check never see it; CI runs it as its own `qa-mcp` job (`npm ci`, `npm run build`, `npm test`).
- **Env.** `INTELLIDRUGS_QA_KEY` is required: when it is missing, the server writes "INTELLIDRUGS_QA_KEY is not set" to stderr and exits 1. `INTELLIDRUGS_QA_BASE_URL` defaults to `https://drugdb.eliooo.org`; it must be `https:`, or `http:` on `localhost` or `127.0.0.1` for local testing, with no credentials, query or fragment; otherwise the server exits 1. The base URL is an origin: a path other than `/` also exits 1, and so does a key outside the §7.9.1 Bearer token set (32–256 characters of `[A-Za-z0-9._~+/=-]`), which could never authenticate; neither message quotes the value. The key is sent only as `Authorization: Bearer …` to that origin, with `redirect: "error"` and a 30-second timeout. stdout carries the protocol only, and nothing written anywhere contains the key.
- **Tools** map 1:1 to the endpoints, each with a JSON-schema input carrying the §7.9.2 patterns and enums (a bad input fails in the MCP, before any call) and `annotations.readOnlyHint: true`. There is no write tool. A refusal is an error result like any other (the preamble, then "Invalid input {name}", the first refused input in the route's §7.9.2 order, an input the tool does not take first), and so is an unknown tool name ("Unknown tool"). `batchId`, `batch` and `conceptId` also refuse `.` and `..`, which URL parsers collapse as dot segments (so they could never reach their route), and a `conceptId` that cannot be percent-encoded (a lone surrogate).

| Tool | Input | Calls |
|---|---|---|
| `list_batches` | `{}` | `GET /api/qa/v1/batches` |
| `get_batch` | `{ batchId }` | `GET /api/qa/v1/batches/{batchId}` |
| `get_record` | `{ batchId, conceptId }` | `GET /api/qa/v1/batches/{batchId}/records/{conceptId}` |
| `find_records` | `{ filter, stage?, batch?, page? }` | `GET /api/qa/v1/records?…` |
| `get_pairs` | `{ bdsId, page? }` | `GET /api/qa/v1/substances/{bdsId}/pairs?page=` |

- **Result.** Two text content items: the fixed preamble, then the response body as JSON (`JSON.stringify(body, null, 2)`, envelope unchanged). The preamble is prepended to every result, errors included, verbatim:

  ```
  IntelliDrugs QA data. This is UNREVIEWED data for quality assurance only; a pharmacist may not have approved it.
  Every finding must cite the exact field path and the source link it was checked against.
  "No interaction data" never means a combination is safe.
  Report findings; never claim that something was fixed.
  Nothing here is clinical advice.
  ```

- **Errors.** `isError: true`, the preamble, then "QA API error {status} {code}" with the envelope's first error code (for example "QA API error 401 UNAUTHORIZED"), or "QA API error {status}" when an error body is not the envelope (the middleware's plain-text per-IP 429), "QA API error {status} invalid response" when a 200 body is not the envelope, or "QA API unreachable" on a network failure or timeout. Never the key, never request headers.
- **README** (`tools/qa-mcp/README.md`): setup; getting a key from the PO (never committed, never in a config file under version control); the Claude Desktop `mcpServers` snippet and the Claude Code `claude mcp add` command; the five tools; and the preamble's rules. *(QA portal)* The README adds: a self-service DB key from `/review/qa` works here unchanged (`idqa_…` is inside the Bearer token set), and the hosted server at `https://drugdb.eliooo.org/api/qa/mcp` (§7.10.6) needs no local install. The stdio server stays, unchanged in behaviour; its preamble, server name, version and tool list are pinned against the hosted server's by `tests/parity.test.ts` (§11.1).
- **Tests** (vitest, mocked `fetch`): §11.1.

### 7.10 QA portal: QA role, self-service keys, hosted MCP *(QA portal, Decision, PO 18/10/2026; D66–D71)*

**Purpose.** QA team members get the QA tools, the MCP server and the QA API through the site, without the PO handing out keys: a `qa` role that sees only the QA section (§5.13, §5.18), keys they create and revoke themselves, and an MCP endpoint on the existing web app. Everything in §7.9 stays: the five QA API routes and their shapes, the allowlist mappers, `qa_read`, the env keys and `tools/qa-mcp/`. **Out of scope:** OAuth (so claude.ai and ChatGPT connectors cannot connect, §5.18), an OpenAPI page, partner keys (§1.3 is unchanged), and any new container, port, network or Caddy change (§12.4).

#### 7.10.1 Role `qa` (Decision, D66)

- `REVIEWERS` accepts `qa` (§5.13). The roles that may use QA tools, create keys and own a working DB key are `qa`, `engineer` and `senior` (`canUseQa`, web; `QaKeyRule.OWNER_ROLES`, API). `pharmacist` and `user` may not.
- A `qa` account sees only the QA section: `/review` redirects it to `/review/qa`, and every other `/review/*` page answers it with the §5.12 QA account view (§2.1, §5.13).
- **A `qa` user can never make any decision (Decision).** Three independent guards, each tested (§11.1, §11.3):
  - web: every review, report, dismiss, pair and resolve action tests `isReviewer` / `actsAsPharmacist` / senior, all false for `qa`, so the action answers `forbidden` before any API call;
  - API: `ReviewService.ROLES` and `SeniorReviewService` do not accept `qa`, so `reviewerRole=qa` is 400 `field=reviewerRole` (audited as `decision_rejected` / `pair_decision_rejected`, as today);
  - database: V9 does not widen `review_decision_reviewer_role_check` or `pair_review`'s role check, so an insert with role `qa` fails.

#### 7.10.2 Self-service keys: format, storage, lifetime (Decision, D67)

- **Format.** `"idqa_"` followed by 43 base64url characters: 32 bytes from `crypto.randomBytes(32)`, encoded with `toString("base64url")` (no padding). Pattern `^idqa_[A-Za-z0-9_-]{43}$`, 48 characters, inside the §7.9.1 Bearer token set, so the stdio MCP and every HTTP client send it unchanged.
- **Generation.** The web generates the key inside the create server action and sends **only its hash** to the API: SHA-256 of the full key's UTF-8 bytes (prefix included), 64 lower-case hex characters, the same digest form as `QA_API_KEYS`. The API never sees a key. The web never stores it: it returns it once in the action result (§4.3) and drops it.
- **Stored** (`ops.qa_key`, V9 below): the hash, the owner (the session's verified email, lower-cased; server-side only, §7.10.8), the name, `created_at`, `expires_at`, `revoked_at`, `last_used_at`. Never the key, never a prefix or suffix of it.
- **Name.** Trimmed of white space (JavaScript `trim()`, Java `strip()`), 1–40 characters (code points), no control characters (U+0000–U+001F, U+007F–U+009F). Names need not be unique. Bengali and other scripts are allowed.
- **Lifetime.** `expires_at = created_at + 2160 hours` (90 days, written as hours so no time-zone rule can move it). There is no renewal: an expiring key is replaced by a new one.
- **Status** (computed by the API, `QaKeyRule.status(row, now)`, database clock): `revoked` when `revoked_at` is set (it wins over expiry); else `expired` when `expires_at <= now()`; else `active`.
- **Limits (Decision).** At most **5 active keys** per owner. At most **10 keys created per owner in any rolling 24 hours** (revoked and expired keys count). Both are enforced by the API in the creation transaction, so they hold across web restarts; the web also keeps an in-memory first line (§9.3).
- **`last_used_at`** is set to the time of a successful authentication, at most once per minute per key (§7.10.4).
- **Retention (Decision).** Key rows are kept indefinitely and never deleted (a trigger refuses DELETE and TRUNCATE), like decisions: an audit row's `qa_key` id always resolves. An expired or revoked row authenticates nothing; its hash is of a 256-bit secret and is useless without the key.

**Schema change, needed (Decision, D71): `V9__qa_keys.sql`.** No existing table can hold keys, and V8's checks refuse the new audit events and the `qa` actor role.

```sql
-- IntelliDrugs QA portal (spec §7.10, D71, db-schema-v1.4): self-service QA keys, the qa role in audit rows, and the
-- key audit events. Additive in effect: a new table, and two widened checks that every existing row satisfies.
CREATE TABLE ops.qa_key (
  id           BIGSERIAL   PRIMARY KEY,
  key_hash     TEXT        NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  owner_email  TEXT        NOT NULL CHECK (owner_email = lower(owner_email) AND length(owner_email) BETWEEN 3 AND 320),
  name         TEXT        NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 40
                                           AND name !~ '[[:cntrl:]]'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  CONSTRAINT qa_key_hash_uq UNIQUE (key_hash),
  CONSTRAINT qa_key_lifetime CHECK (expires_at = created_at + interval '2160 hours'),
  CONSTRAINT qa_key_revoked_after_created CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CONSTRAINT qa_key_used_after_created CHECK (last_used_at IS NULL OR last_used_at >= created_at)
);
CREATE INDEX qa_key_owner_idx ON ops.qa_key (owner_email, created_at DESC, id DESC);

-- Only revoked_at (once, from NULL) and last_used_at (forward only) may change; rows are never deleted.
CREATE FUNCTION ops.qa_key_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.key_hash IS DISTINCT FROM OLD.key_hash
     OR NEW.owner_email IS DISTINCT FROM OLD.owner_email OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'ops.qa_key: only revoked_at and last_used_at may change';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'ops.qa_key: a revocation is final';
  END IF;
  IF OLD.last_used_at IS NOT NULL AND (NEW.last_used_at IS NULL OR NEW.last_used_at < OLD.last_used_at) THEN
    RAISE EXCEPTION 'ops.qa_key: last_used_at only moves forward';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_key_guard BEFORE UPDATE ON ops.qa_key FOR EACH ROW EXECUTE FUNCTION ops.qa_key_guard();
CREATE TRIGGER qa_key_no_delete BEFORE DELETE ON ops.qa_key FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER qa_key_no_truncate BEFORE TRUNCATE ON ops.qa_key FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
REVOKE DELETE, TRUNCATE ON ops.qa_key FROM PUBLIC;

ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_event_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_event_check CHECK (event IN (
  'sign_in','sign_in_denied','sign_out','review_open','evidence_open',
  'decision','decision_rejected','decision_denied',
  'flag_created','flag_resolved','partner_request',
  'pair_decision','pair_decision_rejected','senior_open',
  'qa_read','qa_key_created','qa_key_revoked'));
ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_actor_role_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_actor_role_check
  CHECK (actor_role IN ('pharmacist','engineer','senior','qa','user'));
```

- **Not widened (Decision):** `review_decision_reviewer_role_check` and `pair_review.reviewer_role` stay as V7 left them, so the database itself refuses a `qa` decision (§7.10.1).
- **The PR must:** add the `db/migrations.lock` line for V9 and change the lock's header to `db-schema-v1.4` (`db/check-migration-lock.sh` passes); explain the change under the four headings `database.md` requires; update `docs/design/database.md` and the data model page; and note in the PR that the tag `db-schema-v1.4` is created **after the merge** to `main` (the tag names the merged commit).
- **Tests:** `V9MigrationIntegrationTest`: the table, its checks (a bad hash, a non-lower-case owner, a 41-character or untrimmed name, a lifetime other than 2160 hours are refused), the unique hash, the guard (changing `name`, `key_hash`, `owner_email` or `expires_at` fails; a second `revoked_at` fails; `last_used_at` moving back fails; setting `revoked_at` once and moving `last_used_at` forward pass), DELETE and TRUNCATE refused, the widened audit checks, and that `review_decision` and `pair_review` still refuse role `qa`.
- **Rollback**: keep V9 (older images never read or write `ops.qa_key`, and never write `qa` or the key events; §12.5).

#### 7.10.3 Internal API (new `QaKeyController`; token required, `auth.require`)

```
POST /v1/qa-keys                       body { ownerEmail, ownerRole, name, keyHash, requestId }
  → 201 QaKey
POST /v1/qa-keys/{id}/revoke           body { ownerEmail, ownerRole, requestId }
  → 200 QaKey                          // status "revoked"
GET  /v1/qa-keys                       header X-Viewer-Email (required)
  → { keys: [ QaKey ] }                // the owner's keys, newest first (created_at DESC, id DESC), at most 50
POST /v1/qa-keys/verify                body { keyHash }
  → 200 { keyId, ownerEmail }          // only for an active key; read-only
POST /v1/qa-keys/{id}/used             (no body)
  → 204                                // last_used_at = now() when it is NULL or at least one minute old

QaKey = { id, name, createdAt, expiresAt, lastUsedAt|null, revokedAt|null, status: "active"|"expired"|"revoked" }
```

- **Hexagonal:** `presentation/QaKeyController` → `application/QaKeyService` (validation as `INVALID_QUERY` with the field; the rules from `domain/QaKeyRule`: owner roles, name rule, `ACTIVE_MAX = 5`, `DAILY_MAX = 10`, `LIFETIME = 2160 hours`, `status()`) → `application/port/QaKeyPort` → `adapter/persistence/R2dbcQaKeyAdapter`. Nothing in the controller or service logs a body: it holds an email and a hash.
- **Validation (400 `INVALID_QUERY`, with the field):** `ownerEmail` (`Validate.email`, then lower-cased), `ownerRole` (one of `qa`, `engineer`, `senior`; the web sends the session's role, re-read from `REVIEWERS`), `name` (§7.10.2), `keyHash` (`^[0-9a-f]{64}$`), `requestId` (a UUID), `id` (`^[1-9][0-9]{0,17}$`), and `X-Viewer-Email` on the list (missing or invalid: 400 `field=X-Viewer-Email`).
- **Create**, in one transaction: `pg_advisory_xact_lock(hashtextextended('ops.qa_key:' || owner_email, 0))` (so two concurrent creates by one owner cannot both pass the cap); count the owner's active keys (5 or more: 409 `CONFLICT`, `field=activeKeys`, "You already have 5 active keys"); count the owner's keys with `created_at > now() - interval '24 hours'` (10 or more: 409, `field=createdToday`, "You have created 10 keys in the last 24 hours"); insert with `created_at = now()`, `expires_at = now() + interval '2160 hours'`; a duplicate hash (never expected from 32 random bytes) is 409 `field=keyHash`; then the `qa_key_created` audit row (§7.10.7) in the same transaction. A key never exists without its audit row.
- **Revoke**, in one transaction: `SELECT … FOR UPDATE` of the row with that `id` **and** that owner. None: 404 `NOT_FOUND`, `field=id` (the same answer for an unknown id and another owner's key, so an id says nothing about other accounts). Already revoked: 409 `CONFLICT`, `field=status`, "This key is already revoked". Otherwise `revoked_at = now()` (an expired key can be revoked too), then the `qa_key_revoked` audit row in the same transaction.
- **Verify** is read-only: `SELECT id, owner_email FROM ops.qa_key WHERE key_hash = $1 AND revoked_at IS NULL AND expires_at > now()`. No row: 404 `NOT_FOUND`, `field=keyHash`, one answer for unknown, revoked and expired. It returns the owner's email to the web server only (§7.10.4); no other endpoint returns an email.
- **Used**: `UPDATE ops.qa_key SET last_used_at = now() WHERE id = $1 AND revoked_at IS NULL AND expires_at > now() AND (last_used_at IS NULL OR last_used_at <= now() - interval '1 minute')`; 204 whether or not a row changed; 404 `field=id` only for an id that does not exist.
- The API holds no role list of its own for verification: `REVIEWERS` is web-only, so the owner's current role is checked by the web on every request (§7.10.4).
- **Tests:** `QaKeyRuleTest` (name rule including Unicode white space and control characters, status precedence, lifetime) and `QaKeyIntegrationTest`: 401 without the token on all five endpoints; create 201 with the computed `expiresAt`; the sixth active key 409 `activeKeys`, and after a revoke a new key is 201; the eleventh key in 24 hours 409 `createdToday` even after revoking; two concurrent creates at four active keys give one 201 and one 409; revoke 200, a second revoke 409 `status`, another owner's id 404 `id`; list newest first, owner-only, at most 50, with each status, and no `ownerEmail` or `keyHash` field anywhere in a create, revoke or list body; verify 200 for an active key, 404 for unknown, revoked and expired; used touches at most once a minute and never touches a revoked or expired key; one audit row per create and revoke with the owner, role, `qa_key` target and request id, and none on a 400, 404 or 409.

#### 7.10.4 Key verification rule (Decision, D68)

`authenticateQa(header)` in `lib/qa-api.ts` (async; replaces the sync `authenticate` call in `qaHandler`) runs, in this order, for the QA API and the hosted MCP alike:

1. The Bearer form of §7.9.1. Missing or malformed: 401.
2. **Env keys**: the presented key's SHA-256 digest against every `QA_API_KEYS` hash with `timingSafeEqual`, no early exit (§7.9.1, unchanged). A match authenticates as that env label. A malformed `QA_API_KEYS` contributes no keys (§7.9.1).
3. **DB keys**, only when no env key matched and the key matches `^idqa_[A-Za-z0-9_-]{43}$`: `POST /v1/qa-keys/verify { keyHash }`. On 200 `{ keyId, ownerEmail }`, the owner's role is read from the **current** `REVIEWERS` (`roleFor(ownerEmail)`, on every request, never cached) and must pass `canUseQa`; then the key authenticates as the label `key.{keyId}`. A 404, or an owner who no longer holds `qa`, `engineer` or `senior`: 401, the same undifferentiated 401 as an unknown key. A verify call that fails (network, timeout, 5xx, a malformed body): 502 `UNAVAILABLE` (the hosted MCP: HTTP 502, §7.10.6), with a best-effort `qa_read` row `unavailable` for the route, unauthenticated (no label).
4. Anything else: 401.

- A DB key authenticates the QA API and the hosted MCP **exactly like an env key**: the same routes, shapes, limiter (keyed by its label), audit rows and privacy rules. It fails when it is expired, revoked, or its owner's role no longer allows QA tools, from the next request on: verification is never cached.
- **Timing.** The DB lookup is an index lookup by the SHA-256 of a 256-bit random secret, which an attacker cannot steer, so it needs no constant-time comparison; the env comparison keeps its constant-time rule.
- **Last used.** After a DB key authenticates (whatever the request's later outcome), the web sends `POST /v1/qa-keys/{id}/used` at most once per minute per key (in-memory limiter `qaKeyTouch`, 1 per 60 s per key id), without awaiting it; a failure is ignored. The API's own one-minute guard makes a repeated touch harmless.
- No other change to §7.9: the order after auth (rate limit, validation, read, map, audit, answer) and the envelope are as there.

#### 7.10.5 Web: server actions, page reads and the shared QA query code

- **Server actions** (`lib/qa-key-actions.ts`, `"use server"`, thin wrappers; logic in `lib/qa-key-core.ts`, `server-only`), matching `lib/actions-core.ts`. Each runs, in order:
  1. the session, re-read from the encrypted cookie with the role re-checked against `REVIEWERS` (§9.6): none is `unauthenticated`; a role that fails `canUseQa` is `forbidden` (and writes nothing);
  2. CSRF and origin: Next's built-in server-action check, which refuses a POST whose `Origin` does not match the host (`next.config.ts` sets no `serverActions.allowedOrigins`, and a test pins that), plus `SameSite=Lax` on the session cookie;
  3. input validation (`invalid`);
  4. the web rate limit (create: `qaKeyCreate`, `daily_limit`; revoke: `qaKeyRevoke`, `rate_limited`; §9.3), keyed by the account (§9.3);
  5. Turnstile, action `qakey` (`TURNSTILE_ACTIONS` adds it; `captcha`);
  6. the API call with the internal token and the **session's** email and role, never values from the form.
- `createQaKeyAction` → `{ code: "created", key, row: QaKey }` or `{ code }` with `code` ∈ `invalid`, `active_limit` (409 `activeKeys`), `daily_limit` (409 `createdToday`, or the web limiter), `captcha`, `forbidden`, `unauthenticated`, `failed` (network, timeout, 5xx, 409 `keyHash`, any other answer). The key is created after step 5 only, so a refused request never makes one. The key is in the result object only for `created`, and never in a log line, an error, a redirect or `revalidatePath` data.
- `revokeQaKeyAction` (form field `keyId`, `^[1-9][0-9]{0,17}$`) → `{ code, row? }` with `code` ∈ `revoked`, `already_revoked` (409 `status`), `not_found` (404), `invalid`, `rate_limited`, `captcha`, `forbidden`, `unauthenticated`, `failed`.
- Both call `revalidatePath("/review/qa")`.
- **Page read**: `listQaKeys(session.email)` (`GET /v1/qa-keys` with `X-Viewer-Email`), only for a session that passes `canUseQa`. The page passes the rows to QaKeys without any email.
- **`lib/api.ts`** adds `createQaKey`, `revokeQaKey`, `listQaKeys`, `verifyQaKey` and `touchQaKey` (server-only, internal token).
- **Shared QA query code (no HTTP self-call).** The five route handlers' run steps move into `lib/qa-query.ts` (`server-only`): `QaInput` = `{route: "batches"}` | `{route: "batch", batchId}` | `{route: "record", batchId, conceptId}` | `{route: "records", filter, stage?, batch?, page}` | `{route: "pairs", bdsId, page}`; `runQa(input)` (the §7.9.2 checks, the internal API read and the allowlist map, giving a `QaOutcome`); and `answerQa(input, label, requestId)`, which runs it, writes the `qa_read` row and applies the 200-only-after-its-row rule (§7.9.6), returning the status and the envelope. `qaHandler` becomes auth → limit → URL to `QaInput` (a refused path or query is a 400 through the same audit) → `answerQa`. The hosted MCP calls `answerQa` with the same label. The five routes answer byte-for-byte as before (their §11.1 tests are unchanged).

#### 7.10.6 Hosted MCP endpoint (`POST /api/qa/mcp`, Decision, D69)

- **Where.** A Next route handler, `web/app/api/qa/mcp/route.ts`, on the existing web app (the specific route wins over the `/api/qa/[[...rest]]` catch-all), wrapped in `withRequestLog("/api/qa/mcp")`; the dispatcher in `web/lib/qa-mcp.ts` (`server-only`). No new container, port or Caddy change. No MCP SDK in `web/`: the five methods are handled directly.
- **Transport.** MCP Streamable HTTP, **stateless**, **JSON responses only**: every request is one `POST` carrying one JSON-RPC message; a request gets one `application/json` response; there is no SSE stream, no `Mcp-Session-Id` (none is issued; one sent by a client is ignored) and no server-to-client request. `GET`, `DELETE`, `PUT` and `PATCH` answer 405 with `Allow: POST`.
- **Protocol versions.** Supported: `2025-11-25`, `2025-06-18` and `2025-03-26` (pinned as `SUPPORTED_PROTOCOL_VERSIONS` in `lib/qa-mcp-tools.ts`). `initialize` answers the client's requested `protocolVersion` when supported, otherwise `2025-11-25`. Every other request's `MCP-Protocol-Version` header: absent means `2025-03-26` (per the specification); present and unsupported is 400.
- **Checks, in this order** (each refusal is a JSON-RPC error with `id` null unless the request was parsed):

| Step | Check | Answer |
|---|---|---|
| 1 | method is `POST` | 405, `Allow: POST`, `-32000` "Method not allowed" |
| 2 | `Origin`: absent, or exactly `https://{SITE_HOST}` (DNS-rebinding protection; `null` and every other origin refused) | 403, `-32002` "Forbidden" |
| 3 | auth: §7.10.4 (env or DB key) | 401 with `WWW-Authenticate: Bearer`, `-32001` "Unauthorized", and the throttled `qa_read` `unauthorized` row with target `mcp`; a failed verify call: 502, `-32004` "Unavailable" |
| 4 | the key's rate limit (`LIMITS.qa`, the label of §7.10.4): **every authenticated MCP request counts once**, shared with the QA API | 429, `Retry-After: 60`, `-32003` "Too many requests", and the throttled `rate_limited` row `{label}/mcp` |
| 5 | `Content-Type` is `application/json` (parameters allowed) | 415, `-32000` "Unsupported media type" |
| 6 | `Accept` absent, or it allows `application/json` (`application/json`, `application/*` or `*/*`) | 406, `-32000` "Not acceptable" |
| 7 | body at most 64 KiB (counted while reading, whatever `Content-Length` says) | 413, `-32000` "Request too large" |
| 8 | the body parses as JSON | 400, `-32700` "Parse error" |
| 9 | one JSON-RPC 2.0 object: `jsonrpc` = `"2.0"`, `method` a string, `id` (when present) a string or a number; a JSON array (batch) is refused | 400, `-32600` "Invalid Request" |
| 10 | `MCP-Protocol-Version` (every method except `initialize`) | 400, `-32600` "Unsupported protocol version" |
| 11 | dispatch | below |

- **Methods.**
  - `initialize` (`params.protocolVersion` a string, else `-32602` "Invalid params") → `{ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "intellidrugs-qa", version: "1.0.0" }, instructions: PREAMBLE }`, the stdio server's name, version and instructions;
  - `ping` → `{}`;
  - `tools/list` → `{ tools }`, exactly the stdio server's list: each tool's `name`, `title`, `description`, `inputSchema` and `annotations` `{ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`; no paging (`cursor` ignored);
  - `tools/call` (`params.name` a string and `params.arguments`, when present, an object; else `-32602`) → a tool result, below;
  - a notification (no `id`), including `notifications/initialized` and `notifications/cancelled`, and a client response (a result or error with no `method`): 202 with no body;
  - any other method: `-32601` "Method not found".
  Method-level answers are HTTP 200; a thrown error is `-32603` "Internal error" with HTTP 200 and no detail (never 500).
- **Tool calls go through the QA query code.** `checkToolArgs(name, args)` (`lib/qa-mcp-tools.ts`) applies exactly the stdio server's input rules (§7.9.8: the §7.9.2 patterns, an input the tool does not take first, dot segments and lone surrogates refused) and maps the arguments to a `QaInput`; then `answerQa(input, label, requestId)` (§7.10.5), so a tool call writes the same `qa_read` row as the equivalent GET (`{label}/{route}`, outcome `ok` or the error code) and gets the same 200-only-after-its-row rule. The result is the stdio result, byte for byte apart from the envelope's `metadata`:
  - success: `content` = `[{type: "text", text: PREAMBLE}, {type: "text", text: JSON.stringify(envelope, null, 2)}]`, where `envelope` is the QA API envelope for the equivalent GET (its `metadata.requestId` is this MCP request's id, which is also the `qa_read` row's);
  - error: `isError: true`, the preamble, then "QA API error {status} {code}" (for example "QA API error 404 NOT_FOUND", "QA API error 502 UNAVAILABLE");
  - input refusal: `isError: true`, the preamble, then "Invalid input {name}", with a best-effort `qa_read` row `invalid_query` for the tool's route; unknown tool: `isError: true`, the preamble, then "Unknown tool" (no row: no route).
- **Never leaked.** No answer carries a key, a hash, an email, a note or request headers; the tool bodies come from the §7.9.7 allowlist mappers; the JSON-RPC error messages are the fixed strings above. Logs are the request line only (§7.9.7), never the body, the method name or the `Authorization` header.
- **Headers** on every answer: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, and `Content-Type: application/json` on every answer with a body. No `Access-Control-*` header. The per-IP middleware limit applies first, as for the QA API.
- **Shared text (Decision).** `web/lib/qa-mcp-tools.ts` is a dependency-free module (no imports, no `server-only`, so another package's test can import it): `PREAMBLE`, `SERVER_NAME`, `SERVER_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `TOOLS` (name, title, description, input schema) and `checkToolArgs`. `tools/qa-mcp/tests/parity.test.ts` imports it by relative path (`../../../web/lib/qa-mcp-tools.ts`) and fails when the preamble, the server name or version, any tool's name, title, description, input schema or annotations, or the refused field for a fixture table of bad arguments differs from the stdio server's (`PREAMBLE`, `TOOLS`, `toPath`, and its `tools/list` output). A web test pins `PREAMBLE` to the §7.9.8 text.
- **OAuth is out of scope.** There is no `/.well-known/oauth-protected-resource` or `/.well-known/oauth-authorization-server`, and `WWW-Authenticate` carries no `resource_metadata`. A client that needs OAuth (the claude.ai and ChatGPT connectors) cannot connect; clients that send a configured header can (§5.18).
- **Client setup** (on `/review/qa` and in `tools/qa-mcp/README.md`):
  - Claude Code: `claude mcp add --transport http intellidrugs-qa https://drugdb.eliooo.org/api/qa/mcp --header "Authorization: Bearer <key>"` (the page writes `$INTELLIDRUGS_QA_KEY` for `<key>`, so the key stays out of shell history; local scope only, never `--scope project`);
  - Cursor and other header-capable clients: the `mcpServers` entry with `url` and `headers` (§5.18);
  - Claude Desktop and other stdio-only clients: `tools/qa-mcp` (§7.9.8), with the same key.

#### 7.10.7 Audit

- `qa_key_created` and `qa_key_revoked` (§5.15) are written by the API inside the create and revoke transactions (§7.10.3): `actor_email` = the owner, `actor_role` = the session role (`qa`, `engineer` or `senior`), `target_type` `qa_key`, `target_id` the key's id, `outcome` `ok`, `request_id` the web request id. **Never the key, its hash or its name** (the name is free text, and §5.15 keeps free text out of audit rows). They are API-only events: `AuditService.WEB_EVENTS` and `TARGET_TYPES` do not add them, so a web `POST /v1/audit-events` with either event is 400 `event`.
- `AuditService.ROLES` adds `qa`; `QA_TARGET_ID` widens for `key.{id}` labels and the `mcp` route name (§7.9.6). `qa_read` keeps no actor (D63): the key id in its label is enough for the team to find the owner in `ops.qa_key`.
- `AuditApiIntegrationTest` adds: a `sign_in` with role `qa` is 201; `qa_read` with targets `key.12/record` and `mcp` and `key.12/mcp` is 201; `qa_read` with `key.0/record`, `key.x/record` or `tanvir.qa/batches` is 400 `targetId`; `qa_key_created` and `qa_key_revoked` posted by the web are 400 `event`.

#### 7.10.8 Privacy (Decision, D67)

- **The owner's email** is stored in `ops.qa_key.owner_email` and in the key audit rows only (team-only, like `review_decision`). It is returned by exactly one endpoint, the internal `POST /v1/qa-keys/verify`, to the web server, which uses it for the role check and never logs, stores or forwards it. No QA API route, no MCP answer (stdio or hosted), no page and no island ever receives it; the QA page lists the viewer's own keys without any email.
- **Keys** exist in full only in the create action's memory, in its one result to the owner's browser, and with the owner. The database holds a SHA-256 hash; audit rows hold a key id. No log, audit row, URL, cookie, browser storage or error message holds a key, a hash, a prefix of either, or a key name.
- **Key names** are free text seen only by their owner on `/review/qa` (and by the team with database access). Their help asks for a device or tool name, and they are never logged or audited.
- §9.7 lists these rules with the other stored personal data.

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
   - *(P1C, D54)* Since P1C an item is stamped only when its covered fields change (§8.3), so a snapshot is written only for a stamp. Payload `version` 2 adds `coverage` per ingredient (`full`, `none` or `not_run`), which the reopen rule compares.
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

#### 8.3.1 The reopen rule (P1C, Decision, PO D5, D54; replaces the P0 rule)

**Before P1C** (P0, as built): every stage re-stamped every target item unconditionally (`reopen_review`: `review := 'pending'`, `extracted_at := clock_timestamp()`). It also re-stamped every other product that showed **any** shared row the run changed (`_reopen_dependents`, driven by `SharedChanges.bds_ids` **and** `SharedChanges.ddinter_ids`). `ddinter_ids` includes pairs, interaction texts, diseases and foods (`stages/ddinter.py` `_store_id_data`, `_ensure_text`). So a new DDInter pair text re-opened every approved product of both substances. PO D5 rules that out.

**The rule.** A record goes back to review **only** when something its approval covered changes. The approval covers the record's **approval view**, a pure function of the V6 snapshot payload (`$ETL/load/snapshots.py` `approval_view(payload)`):

- brand fields: `dar_number`, `trade_name`, `company`, `dosage_form`, `generic_content_raw`;
- clinical drug: `bdc_id`, `display_name`, `dose_form`, `route`;
- per ingredient (ordered by XM code): `xm_code`, `bds_id`, `substance` (preferred name), strength (`raw`, `value`, `unit`, `per_value`, `per_unit`);
- per ingredient, codes: every non-DDInter code (`ICD11_XM`, `RXCUI`, `ATC`, `DRUGBANK`, `SNOMEDCT`), and the **chosen** DDInter entries with their route scope and `route_assumed`. A new DDInter entry for another route is not covered; it changes no chosen entry;
- per ingredient, coverage: `full`, `none` or `not_run`. A full↔none change also changes the chosen entries; coverage is compared too, so `not_run`→`none` counts.

**Not covered** (they never re-open a record): DDInter pairs, severities, actions, interaction and management texts, diseases, foods, DDInter entry names, substance synonyms (`substance_name`, §13.1 Q7), stage statuses and notes. A pair change instead makes the pair `changed` in the senior pair queue (§5.17). That needs no ETL work: the API compares the pair's current content hash with the reviewed one (§7.7).

**Mechanism** (`$ETL/load/batches.py`; it replaces the unconditional stamping in `reopen_review`, `_reopen_dependents` and `_upsert_items`):

1. At the end of each stage's transaction, `settle(conn, batch_id, targets, changes, run_id, reopen=False)` builds the candidate set:
   - the stage's targets;
   - the latest current item of every other product whose ingredients carry a `bds_id` in `changes.bds_ids` (as today's `_reopen_dependents` query, minus its DDInter-id branch).
   
   `SharedChanges.ddinter_ids` stays in the ETL, for the run log only. It no longer selects anyone.
2. For each candidate, it computes `approval_view(build_payload(...))` now, and compares it with the `approval_view` of the snapshot at the item's current `extracted_at`.
   - **Different**, or no snapshot at that stamp, or no stamp: stamp the item (`review := 'pending'`, `extracted_at := clock_timestamp()`), set its batch to `in_review`, and write the snapshot (reason `run` or `rerun` for targets, `shared_change` for the others). A new item of a product already approved in another batch follows item 8 instead.
   - **Equal**: leave `review`, `extracted_at` and the decisions alone. Write no snapshot (V6's primary key is the stamp).
   - **`batch_item.note` is always written**, stamped or not: the "removed from batch file" marker (§8.1 item 6) for an item that left the file, the DGDA failure reason for an item that could not be loaded (item 5), and NULL otherwise. Today `_upsert_items` writes `note = EXCLUDED.note` together with the stamp; P1C splits the two, so an equal view never skips the note, and a note change on its own never stamps (except the return to the file in item 5).
3. Version-1 payloads (written before P1C) have no `coverage` key. When either side lacks it, coverage is left out of that one comparison; the chosen entries still catch full↔none.
4. **Stage results** are replaced on every run, as today, whether or not the item is stamped. A run that changes no covered field but changes a stage note (for example a text-missing pair now found) updates the desk's checks without re-opening the record. Such a change does not make an open desk page stale (§5.11 compares `extractedAt` and `lastDecisionId` only). The new notes show on the next navigation.
5. **Exceptions, always stamped:**
   - a target whose DGDA load fails ("not found at source", "not a registered Drug product") keeps today's behaviour: `review := 'issue'` with the reason, and it is stamped, because its source is gone;
   - an item that **comes back into its batch file** after it was marked "removed from batch file" is stamped, whatever its view, and its marker is cleared (`note := NULL`) in the same statement. Clearing the marker without a stamp would let the decision made before the removal count again, so the record would return to public view through a re-run, with no pharmacist looking at it (PO D7; §12.5 "re-runs never publish");
   - the engineer's override `--reopen` (new `run_pipeline` flag, also a `reopen` boolean input in `load-dgda.yml`) stamps the named targets, never dependents, whatever changed. It is for a fix the approval view does not cover, or to clear an open reviewer issue after an engineering fix (§5.2). **It is an exception to PO D5's "only"**: a record it stamps leaves public view although nothing its approval covered changed. Until the PO confirms it (§13.1 Q12), it ships disabled for approved records: on a target whose `review = 'ok'`, `--reopen` stamps nothing, and the run log lists the target as "skipped: approved, --reopen not confirmed". It still re-opens targets with an open reviewer issue (which are not public), so an engineering fix can be sent back to review. Until then, a pharmacist who wants an approved record looked at again reports an issue on it (§5.10), which withdraws it.
6. **Batch status.** `_upsert_batch` no longer forces `in_review` on every run. It recomputes it like the API's `recomputeBatch` (`approved` when every current item is `ok`), so an unchanged re-run leaves an approved batch approved.
7. **A newly failed check on an approved, unchanged record** does not re-open it (PO D5, "only"). The failed stage shows on the desk and refuses any new `ok` (§7.2 step 5). §13.1 Q6 asks the PO to confirm. The one stage failure that does affect the public, "DDInter pair list incomplete" (§8.1 item 5), writes no pair rows. The earlier complete list stays, and the public data is unchanged.
8. **A product listed again in a new batch (carried approval, Decision, PO D5).** A product that already has an item in another batch gets a new `batch_item` in the new batch, with a new stamp. `ReviewSql.statusOf` reads the newest item, so without this rule the product would leave public view although nothing its approval covered changed. So, for a target with no item in this batch yet:
   - `settle` finds the product's **approved item**: its latest current item in any other batch, when `statusOf` reads it as `ok`;
   - when that item's snapshot (at its `extracted_at`) has the same `approval_view` as the new item's payload, the new item is stamped with `review := 'ok'`. Its snapshot (reason `run`) adds the payload key `carried_from: {batchId, extractedAt}`. The product stays public;
   - otherwise (no approved item, a different view, or no snapshot to compare) the new item is stamped `pending`, as any new record. The product leaves public view only in the "different view" case, which is a covered change;
   - the carried approval needs no decision row and no schema change. The API reads `carried_from` from the snapshot at the item's stamp and passes it to `ApprovalRule` as a counted approval at the stamp (`ApprovalRule.displayStatus(decisions, extractedAt, carried)` and `ApprovalRule.review(…, carried)`): with no later counted decision the item is `approved`, and any later counted decision applies as usual (an `issue` gives `issue`). The history (§5.6.5) shows the `extract` entry followed by "Approval carried over from batch {batchId}: nothing it covered changed." (new copy, §1.7). Any reviewer can Report issue on it, which withdraws it as on any approved record. A dismissal after that returns it to `pending` (§5.2);
   - the old item in the other batch is not changed, so that batch's status is not changed either.
   §13.1 Q13 asks the PO to confirm; the alternative is that a product's first item in a new batch is a new record that a pharmacist approves again.

**Effect on approvals:**

- A decision made at or before a new stamp stops counting. A record that was `approved` becomes `back_in_review` (§5.2) and leaves public view until a pharmacist approves it again.
- A record with a reviewer `issue` whose covered fields changed returns to `pending` ("Not yet reviewed by a pharmacist"). When nothing covered changed, the issue stays open: the senior dismisses it if the report was a mistake (§5.10a), or the engineer re-runs with `--reopen` after a fix.
- A pair whose DDInter data changed returns to the senior pair queue as `changed` (§5.17), and its public line reads `PAIR_NOT_REVIEWED` until a senior reviews it again. No record is re-opened.
- A record removed from its batch file leaves public view at once (§6.4). If it comes back into the file, it is re-opened (item 5) and stays hidden until a pharmacist approves it again.
- A product listed again in a new batch with an unchanged approval view stays approved (item 8); with a changed view it is a new `pending` record and leaves public view.
- Any reviewer page whose record was stamped turns stale within 20 s (§5.11).

**Today** (P0's pilot re-run, before P1C): no pilot record was approved, so the re-run changed no public view. It replaced the stage notes, giving the §1.6 item 7 triage.

**The P1C pilot check (§12.1).** After the P1C deploy, re-run the DDInter stage for `0001-pilot` with no `--reopen`. Expected: no item is stamped (the approval views are unchanged), every approved pilot record stays approved, and the run log lists 0 re-opened items.

**Later re-runs** (other batches) use the same mechanism. Re-running only the affected items with `--concept ID` keeps runs short. The reopen rule, not the item list, decides what re-opens.

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
| *(P1C)* Dismissals and pair decisions | Turnstile `action=decision` (one widget per desk or senior page), session role `senior` re-checked by the web action, and `reviewerRole` checked by the API (§7.2, §7.7) |
| Flags (problem reports) | Turnstile `action=flag` |
| Resolve flag | Turnstile `action=resolve` (one shared `TurnstileField` on `/review/flags`) |
| Partner request | Turnstile `action=partner` |
| *(QA portal)* QA key create and revoke (`/review/qa`) | Turnstile `action=qakey` (one shared `TurnstileField` per page), the session role re-checked by the web action (`canUseQa`), Next's server-action origin check, and the account limits below (§7.10.5) |
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
| Decision and report actions, per account (*P1C*: including dismissals and pair decisions, one shared budget) | 60 per minute | the action returns `rate_limited`. The desk shows the "not saved" network banner (§5.7), and a `decision_denied` audit event is written. |
| Flags, per account | 10 per hour | flag outcome `failed` |
| Partner requests, per account | 3 per day | flag outcome `failed` |
| *(QA)* `/api/qa/v1/*`, per QA key label (§7.9.1); *(QA portal)* and `/api/qa/mcp`, sharing the same budget per label (an env label, or `key.{id}` for a DB key) | 60 per minute, sliding window; every authenticated request counts (an MCP request counts once, whatever its method) | 429 envelope `RATE_LIMITED`, `Retry-After: 60` (MCP: 429 with the JSON-RPC error of §7.10.6); a throttled `qa_read` row (§7.9.6) |
| *(QA portal)* QA key creation, per account | 10 per 24 hours in the web (`qaKeyCreate`, in memory); and, durably, in the API: 10 created per rolling 24 hours and at most 5 active keys per owner (§7.10.2) | the action returns `daily_limit` or `active_limit`; no key is created (§5.18) |
| *(QA portal)* QA key revocation, per account | 30 per hour (`qaKeyRevoke`) | the action returns `rate_limited`; nothing is changed |
| *(QA portal)* `last_used_at` touches, per DB key | 1 per minute (`qaKeyTouch`; the API guards the same minute, §7.10.4) | the touch is skipped; the request is answered as usual |

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
- **Free text could still carry PHI**, because these fields take free text that is stored and shown to the team: the reviewer note (`review_decision.note`, shown to every reviewer; *P1C*: also the dismissal note), *(P1C)* the pair-issue note (`pair_review.note`, shown to every reviewer role, pharmacists and engineers included, in the pair's state line on the desk and the senior pages; never in public), "Report a problem" (`flag.message`) and "What you will build" (`flag.message`). Each carries `NO_PHI_HELP` (§3.6) under its label. None of these texts is ever logged or written to `audit_event`.
- Emails:
  - stored for the team only, in `review_decision`, `flag`, `audit_event`, (*P1C*) `pair_review` and (*QA portal*) `qa_key`;
  - never in public responses, never in logs;
  - shown only to their owner (account menu, the reader welcome state, and the "not on the reviewer list" banner).
- *(QA)* The QA API (§7.9.7) returns no email and none of the free-text notes above. QA keys are stored only as SHA-256 hashes in `QA_API_KEYS`, and `qa_read` rows hold a key label, never a key, an email or an IP address.
- *(QA portal)* Self-service keys (§7.10.8): `ops.qa_key` holds the key's SHA-256 hash and its owner's email (team-only, like the other stored emails above, and added to that list); the owner's email is never returned by a QA route, the MCP server or a page; the full key is shown once to its owner and stored nowhere; key names are seen only by their owner and are never logged or audited.
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
| `/` | ≤ 30 KB | ≤ 130 KB | ≤ 20 KB | ≤ 90 KB (Onest var + Plex Mono 400) | ≤ 2.8 s (Decision, product owner 16/10/2026: Lighthouse's simulated LCP counts the self-hosted font downloads although `font-display: optional` never delays real visitors' text) |
| `/search`, `/products/[id]`, `/substances/[id]` | ≤ 50 KB | ≤ 130 KB | ≤ 20 KB | same | ≤ 2.8 s (same Decision) |
| `/check` | ≤ 50 KB | ≤ 145 KB | ≤ 20 KB | same | ≤ 2.8 s (same Decision) |
| `/learn/[chapter]` | ≤ 60 KB | ≤ 140 KB | ≤ 25 KB | same | ≤ 2.8 s (Decision, product owner 16/10/2026: Lighthouse's simulated LCP counts the self-hosted font downloads although `font-display: optional` never delays real visitors' text) |
| `/review/[b]/[c]` (laptop, broadband) | ≤ 80 KB | ≤ 200 KB | ≤ 25 KB | same | ≤ 1.5 s; J/K to next record painted ≤ 300 ms with prefetch |
| *(P1C)* `/review/pairs`, `/review/substances/[id]` (laptop, broadband; 50 pairs per page) | ≤ 120 KB | ≤ 180 KB | ≤ 25 KB | same | ≤ 1.5 s |
| *(QA portal)* `/review/qa` (laptop, broadband; 50 keys) | ≤ 50 KB | ≤ 160 KB (excluding Cloudflare's Turnstile script) | ≤ 25 KB | same | ≤ 1.5 s |

- *(QA API reference)* The `/review/qa` row is unchanged. The reference adds no client JavaScript: its examples, commands and rules are server-rendered text built by `lib/qa-api-reference.ts` (`server-only`), and the only island on them is the existing `CopyButton`. The reference's §1.7 strings live in `lib/copy.ts` with the other rows, and the islands import that module, so the row is defined as `typeof window === "undefined" ? QA_REFERENCE : {}`: Next compiles `typeof window` to `"object"` in client bundles, the minifier drops the strings, and server code and the node tests read the full row (`qa-reference-client.test.ts` pins the empty row in a browser; an island never reads `QA_COPY.reference`). Its code text (every command and example answer, joined) gzips to ≤ 8 KB (unit test, §11.1); the Lighthouse run with 50 keys keeps HTML ≤ 50 KB. If it does not, the plan amends this section before shrinking the examples below what §5.18 requires.
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
| *(P1C)* Reviewers | `reviewers.test.ts`, `session.test.ts`, `review-copy.test.tsx`, `advance.test.ts` | `senior` parses as a role and is in `ROLES`; a senior session token decodes to role `senior` (not null); `ROLE_LABEL.senior` and `ROLE_LABEL_DESK.senior` = "Senior pharmacist"; `isReviewer` and `actsAsPharmacist` accept it; any other token is still skipped. `runDecide` and the flag actions accept a senior session (no `forbidden`). `historyText`: a senior `ok` reads "Approved by a senior pharmacist. Published.", a senior `issue` "Issue reported by a senior pharmacist. Note:", a `dismiss` "Issue dismissed by a senior pharmacist. Note:", never an engineer line. `toastSub` and `savedText` give the pharmacist strings for a senior; `needsFor("senior", "engineer_checked")` is true. Both review pages pass role `senior` through (component test). |
| *(P1C)* Dismiss | `commit-machine.test.ts` (extended), `desk-keys.test.tsx` (extended) | `SEND_DISMISS` only for a senior on `issue`, and only while the report channel is idle (a report sending blocks it, and the reverse); no undo window; a 409 `no_issue` gives its hint; captcha gives the report channel's `botHold` with the dismiss op, and the retry keeps the `requestId`; 429 gives report-channel `netErr{saved:"no"}` and network/5xx give `saved:"unknown"`, the commit channel stays untouched, and `TRY_AGAIN` (channel `report`) resends `decision=dismiss` with the same note, `requestId` and `viewedVersion`, never an approval; the failure copy is the §5.10a dismissal copy, not the §5.7 approval banner; an own dismissal updates `viewedVersion`. D opens or focuses the panel for a senior; for a pharmacist or engineer D does nothing and no Dismiss button is rendered; Esc keeps the draft, Cancel discards it; Ctrl/Cmd+Enter sends; Enter never sends; opening Dismiss closes Report and keeps its draft. |
| *(P1C)* Senior keys | `senior-keys.test.tsx` | J/K move between rows; M marks the current row; Enter on "Mark reviewed" is blocked with its hint; R opens the row's panel; single-key Off disables J, K, M, R and ?. |
| *(P1C)* Source links | `source-link.test.tsx` | `SourceLink` renders only with a URL; "fetched on" only with a stored time, in Dhaka date form; `target="_blank"`, `rel="noopener noreferrer"` and the sr-only text. |
| Learn snapshot | `learn-snapshot.test.ts` | Counts are consistent; the 28-pair totals (§1.6 item 5) and the chapter 6 and glossary counts (§1.6 item 11); every snapshot-only value listed in §6.8 is present and dated. |
| *(QA)* QA API | `qa-api.test.ts`, `qa-map.test.ts`, `qa-routes.test.ts` | `QA_API_KEYS` parsing: valid; unset or empty; a bad label, a bad hash, a duplicate label or hash (each disables, logging the entry index only). Disabled: 404 envelope on every QA route and the catch-all, with no API or audit call (*QA portal*: replaced by the "QA auth" row below; only the catch-all keeps the 404). Auth: no header, a wrong scheme, a short key and an unknown key are 401 with `WWW-Authenticate: Bearer` and no detail; a session cookie or `X-Internal-Token` alone is 401; the digest is compared with every configured hash (one `timingSafeEqual` call per entry, also when the first matches). The 61st request in a minute for one label is 429 with `Retry-After: 60`, and another label is unaffected. Every §7.9.2 bad input is 400 with its field, and only after auth; API 404 gives 404 with the route's field; API 5xx, timeout and a malformed body give 502; no path gives 500. Headers on success and on every error; no `Access-Control-*`. Audit: the `qa_read` fields per outcome; the throttled 401 and 429 rows; a 200 whose audit write fails becomes 502 with no data. Mappers: output keys equal the §7.9.3 allowlist; an API fixture with a sentinel email and a sentinel note in every place the API has one yields neither anywhere (deep scan); `textMissing` treats null and DDInter placeholders as missing; `partner` picks the side that is not the substance. |
| *(QA)* QA MCP | `tools/qa-mcp/tests/*.test.ts` (own vitest, mocked `fetch`) | Each tool's URL, path encoding and `Authorization: Bearer` header; `redirect: "error"`; schema refusals for every §7.9.2 rule, with no call made; the preamble verbatim and first on success and on error; "QA API error {status} {code}" for 400, 401, 404, 429 and 502, "QA API error 429" for the plain-text per-IP 429, "invalid response" for a 200 whose body is not the envelope, "QA API unreachable" for a network error and a timeout; the key never appears in any result or stderr line; a missing key and each bad base URL exit 1; the tool list has exactly the five read-only tools. |
| *(QA portal)* QA role | `reviewers.test.ts`, `session.test.ts`, `qa-role-actions.test.ts` | `qa` parses as a role and is in `ROLES`; a `qa` session token decodes to role `qa`; `ROLE_LABEL.qa` = "QA"; `isReviewer` is false and `canUseQa` true for `qa`; `canUseQa` is true for `engineer` and `senior` and false for `pharmacist` and `user`. Every server action listed in §5.13 answers `forbidden` for a `qa` session with no API call (mocked `@/lib/api` asserts zero calls) and writes its `decision_denied` row with role `qa`; `/review/[b]/versions` is 403 for `qa`; flags and partner requests accept a `qa` session. |
| *(QA portal)* QA auth | `qa-api.test.ts` (extended), `qa-auth.test.ts` | With `QA_API_KEYS` unset and no DB key, every QA route is 401 (never 404) with its throttled row; `/api/qa` and unknown paths stay 404 with no row. A malformed `QA_API_KEYS` logs its one line and makes every env key 401, while a valid DB key still answers 200. Env keys are compared before any DB call, with one `timingSafeEqual` per entry. A key that is not of the `idqa_` form and matches no env key makes no verify call. Verify 404, an owner whose current `REVIEWERS` role is `pharmacist`, `user` or absent, and an owner removed between two requests: 401 with no detail. A failed verify call: 502 with an `unavailable` row and no label. A DB key's label `key.{id}` is the limiter key and the audit label; its 61st request in a minute (QA API and MCP together) is 429. The touch is sent at most once a minute per key and never awaited. No log line, audit row or error carries the key, its hash or the owner's email (deep scan of every mocked sink). |
| *(QA portal)* QA keys | `qa-keys.test.ts` | The generated key matches `^idqa_[A-Za-z0-9_-]{43}$` and decodes to 32 bytes; the hash is the SHA-256 hex of the full key. Create and revoke cores run the §7.10.5 order: no session, a pharmacist or `user` role, a bad name (empty, 41 characters, untrimmed control characters), the web limiter and a failed Turnstile check (action `qakey`) each stop before any key is generated or any API call; the API is called with the session's email and role even when the form carries `ownerEmail` or `ownerRole`; each API answer maps to its code (§7.10.5); the key appears only in a `created` result; `revalidatePath("/review/qa")` is called; `next.config.ts` sets no `serverActions.allowedOrigins`; `TURNSTILE_ACTIONS` includes `qakey`. |
| *(QA portal)* QA keys island | `qa-keys-island.test.tsx` (jsdom), `copy-button.test.tsx` | After `created`, focus is on "Copy your new key now", the key shows once and is not in any prop, `localStorage`, `sessionStorage`, cookie or URL (spies); "I've saved it" removes it from the DOM and moves focus to "Your keys"; `beforeunload` is armed only while the panel is open; Revoke opens the inline confirmation with focus on "Revoke key", Esc and Cancel return focus to "Revoke", Enter on "Revoke" never revokes; at 5 active keys "Create key" is `aria-disabled` with its hint and sends nothing; each create and revoke outcome shows the §5.18 banner and announcement; the one live region gets each message after 60 ms. CopyButton writes the target's text, announces "Copied.", and on a refused clipboard selects the text and announces the fallback. |
| *(QA portal)* Hosted MCP | `qa-mcp-route.test.ts` | Each §7.10.6 step and its answer, in order: 405 for GET and DELETE; 403 for a foreign `Origin` and for `null`, 200 for none and for `https://{SITE_HOST}`; 401 with `WWW-Authenticate: Bearer` and the `mcp` row; 429 with `Retry-After: 60` on the 61st request, shared with the QA API; 415, 406, 413, 400 parse error, 400 for a batch array and a bad `jsonrpc`, 400 for an unsupported `MCP-Protocol-Version`, and an absent header accepted as `2025-03-26`. `initialize` echoes each supported version and answers `2025-11-25` otherwise, with `serverInfo` and `instructions` = `PREAMBLE`; `ping` gives `{}`; notifications and client responses give 202 with no body; an unknown method gives `-32601`. `tools/list` equals the stdio list. `tools/call` for each tool calls `answerQa` with the mapped `QaInput` (no `fetch` to the site itself), writes the same `qa_read` row as the equivalent GET, and returns the preamble then the indented envelope; each QA error gives "QA API error {status} {code}"; a refused input gives "Invalid input {name}" with an `invalid_query` row; an unknown tool gives "Unknown tool". No answer has an `Access-Control-*` or `Mcp-Session-Id` header; every answer has `no-store` and `noindex`; nothing contains the key, the owner's email or a note. |
| *(QA portal)* MCP parity | `tools/qa-mcp/tests/parity.test.ts` (own vitest), `qa-mcp-tools.test.ts` (web) | The stdio server and `web/lib/qa-mcp-tools.ts` agree on `PREAMBLE`, server name and version, and every tool's name, title, description, input schema and annotations (the stdio `tools/list` output against the web list); for a fixture table of bad arguments, `toPath` and `checkToolArgs` refuse the same field, and for good ones they address the same route and inputs. The web test pins `PREAMBLE` to the §7.9.8 text. |
| *(QA API reference)* Reference accuracy | `qa-api-reference.test.ts` | **(a) Examples are the real answers.** For each of the five endpoints, the real route handler (`GET` from its `route.ts`; an env test key generated by the test; `qaUpstream` in `@/lib/api` mocked to return that panel's example internal API body; `recordAudit` mocked to succeed; `x-request-id: EXAMPLE_REQUEST_ID`; `vi.setSystemTime(EXAMPLE_TIMESTAMP)`) called with the URL in the panel's command answers 200 with a body deep-equal to the panel's example answer; `GET /api/qa/v1/records?filter=nope` answers deep-equal to the error example; `handleMcp`, given the method, headers and body parsed from each MCP command (the key header replaced by the test key), answers deep-equal to that command's example. **Shape.** Each example's `data` key tree (every object's key set; an array as the union of its elements; `source.json` and `stages[].evidence` opaque) equals the key tree of the same mapper's output for the real fixtures in `tests/fixtures/qa.ts` (`apiRecord()`, `apiSubstance()`, and `apiBatches()`, `apiBatchItems()` and `apiRecords()`, moved there from `qa-routes.test.ts` or added), except that a `history[]` entry's keys are a subset of the fixture's union and include `kind`, `at`, `role`, `decision` and `counts`; a path the fixture never reached (under a value it holds only as `null`, such as the other-batch pair's `link`, or under an empty array) is not compared; leaf JSON types agree wherever both sides are non-null; and the tree equals the §7.9.3 field paths pinned in the test, so adding, removing or renaming a field in a mapper or in the API types fails until the spec, the example and the test change together (the `satisfies` types fail `next build` first). A null leaf appears only at an `EXAMPLE_NULLS` path. Every key-fields path resolves in its example. The §5.18 consistency rules hold (10 batch items, `approvedCount`, Napa's row and record agree, the records example is exactly the batch's `ddinter` = `warn` items, each `total` equals its list). **(b) Rules equal the validators.** `batchId` and `batch`: pattern `BATCH_ID.source`, which equals `^[A-Za-z0-9._-]{1,${max}}$` with max 100; `conceptId`: max `ID_MAX`; `bdsId`: `BDS_ID.source`; `filter`: `QA_FILTERS`; `stage`: `QA_STAGES`, only with `stage_warn`; `page`: 0 to `PAGE_MAX`, default 0, size `QA_RECORDS_SIZE` or `QA_PAIRS_SIZE`; required flags and "In" per §5.18. By behaviour, on every route: each documented query parameter with its example value is accepted; an undocumented `x` is 400 `field` `x`; a repeated documented parameter is 400 with its name; a value breaking each documented rule is 400 with that field; a mocked API 404 with each documented 404 field is 404 with that field, and no other 400 or 404 field occurs (`/batches` has no 404); the (`QA_RATE_LIMIT` + 1)th request in a minute is 429 with `Retry-After: 60`. MCP: the documented versions equal `SUPPORTED_PROTOCOL_VERSIONS`, the default `DEFAULT_PROTOCOL_VERSION`, the size `MCP_MAX_BODY / 1024`; every row of the MCP errors table is produced, with its status, code and message, by a request that triggers it; the tools table equals `TOOLS` (names, argument names in order, required) and `TOOL_ROUTES`. **(c) No secret or person in the reference.** Every command, every example answer, every example internal API body and the rendered API section's HTML contain no `@`, no match of `/idqa_[A-Za-z0-9_-]{43}/`, and no match of `/[0-9a-f]{64}/i`; in commands and examples every `Bearer` is followed by ` $INTELLIDRUGS_QA_KEY`; in the API section's HTML every other `Bearer` is `Bearer &lt;key&gt;`, `WWW-Authenticate: Bearer` or the 401 advice "Authorization: Bearer and your key"; no example answer holds `mine`, `reviewerEmail`, `lastDecisionId`, `contentHash`, `lastPairReviewId`, `openIssues` or `reopen`, and a `"note"` key appears only on a batch item's stage; in the example internal API bodies, each dropped field the type requires has the §5.18 neutral value. **Budget.** The code text, joined, gzips to ≤ 8 KB; `lib/qa-api-reference.ts` and `lib/qa-api-examples.ts` are `server-only`. |
| *(QA API reference)* Reference styles and copy | `qa-css.test.ts` (extended), `qa-copy.test.ts` (extended), `copy.test.ts` | `.codeRegion` has `overflow: auto` and a `max-height`; `.codeBlock` has `white-space: pre`; the summary keeps its disclosure marker (no `display` other than `list-item`) and is at least 24 px tall; `.request` and its 40em rule are gone, so the only `nowrap` rule left is `.table thead th`; no inline style and no colour outside the tokens. `NEW_COPY[NEW_COPY_ROWS.qaReference]` is `QA_COPY.reference`; the `NewCopyState` list carries the new §1.7 row; `QA_PAGE` has no `endpointsCaption`, `colRequest` or `colReturns`; `SHARED_WORDS` has `code`, `yes`, `no` and `endpoints`; no module retypes a reference string. |

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
- the not-authorised page;
- *(P1C)* the desk "With other medicines" section: both groups; partner lines with "and {k} more"; with `partnerCount` over 5, the `<details>` reads "{s} of {n} medicines", lists the 5 returned partners and "and {k} more.", with the substance-page link for a senior and no link for a pharmacist or engineer; "There are no other batches yet."; a combination product with one coverage-`none` ingredient still shows the section (the `Interactions.tsx` fix), with that ingredient's pairs as not checked; every pair card shows `FROM_DDINTER` and its review state;
- *(P1C)* the DDInter stage notes split by `partnerScope`: only in-batch pairs under "…in this batch.", a combination product's own ingredient pair under "…between ingredients of this product.", and pairs with partners in other batches under "…with medicines outside this batch.";
- *(P1C)* the dismiss panel: the quoted report, the consequence sentence, the field rules; the history entries "Issue dismissed by a senior pharmacist. Note:" and the dismissal "No longer counts" suffix, with the reporter's note still present; no email anywhere;
- *(P1C)* the senior pages: queue filters (both scopes) and empty states, the pair row in all four states (including "What changed in DDInter"), a non-applying pair with its plain line and no warning tone, a pair with more than 10 brands on a side ("and {n} more." and the substance link), the substance page with brands from two batches, the not-authorised banner for a pharmacist and for an engineer;
- *(P1C)* source links on the desk (comparison table, ingredient block, pair footers, evidence "Sources") with the §5.6.6 hrefs for the pilot codes; the ICD-11 link text "Search ICD-11 for XM5DJ7";
- *(P1C, P2)* public pair cards with `FROM_DDINTER` and `PAIR_REVIEWED` or `PAIR_NOT_REVIEWED`, never green; the product page "With other approved medicines" grouped by partner substance, with partners from two batches.
- *(QA portal)* `/review/qa`: the four sections in order with one `<h1>`; the MCP address and the snippets built from `SITE_HOST` exactly as §5.18 writes them, with no key, label or hash anywhere in the HTML; *(QA API reference)* the API section holds, in order, the lead, the base address, "Every request and answer", "Endpoints", "Problem filters" and "MCP over HTTP", and no endpoints table or standalone curl; five endpoint `<details>` then the MCP one, only the first with `open`, each summary the mono request and its "Returns" sentence; inside each, `h4` "Request", "Response" and "Errors" (MCP: "Request", "Initialize", "Call a tool", "Tools", "Errors") with the sr-only " for {request}", so the heading order is `h1`, `h2`, `h3`, `h4` with no level skipped; every table has a caption, `th scope="col"` and a labelled `tabindex="0"` region; every code block sits in a `role="region"` with `tabindex="0"` and its label; the commands and example answers equal `qaReference(SITE_HOST)`'s text, each with an `ExampleMarker` and a `CopyButton` whose target is its `<pre>` and whose `context` names it; the parameter rows, key fields and error rows are the §5.18 ones; the tools table is rendered from `TOOLS`; no `style` attribute; the tool names and filter names rendered from `TOOLS` and `QA_FILTERS`; the Rules list equal to the `PREAMBLE` lines; the key list with each status, "Never", and Revoke only on active rows; the empty list; the load error with no create form; the 5-active state; the pharmacist banner with no key read; a `qa` session makes only the key-list read. The account menus (`Header`, `ReviewAccount`) show "QA tools" for `qa`, `engineer` and `senior` only, and a `qa` menu shows the "QA" badge with no batch, no "Review desk", no flags link and no single-key control; `ReviewToolbar` shows the "QA tools" link for the same roles, current on `/review/qa`. The QA welcome state. `review-gates.test.tsx` walks every `app/review/**/page.tsx` and `layout.tsx`: with a `qa` session each renders the §5.12 QA account view (or, for `/review`, redirects to `/review/qa`), and none calls a review read.
- *(QA)* the checker alert card with management and an interaction description (§6.7.3): both texts, in that order, each in its own wrapper with its own label line; over 200 characters, each has its own Expander targeting its own text and described by its own label; a description that is a DDInter placeholder gives today's management-only card; with the management text clamped, the description's label still shows; `FROM_DDINTER` and the review state unchanged; management-only, description-only and no-text cards unchanged; the product-page and substance-page pair cards render the same markup as before.

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
- *(P1C)* `ApprovalRuleTest`: a senior `ok` approves; a carried approval (§8.3.1 item 8) with no later decision is `approved`, and an `issue` after it gives `issue`; dismiss after issue gives `pending` (also when a pharmacist `ok` came before the issue), never `approved` and never `back_in_review`; decisions at or before a dismiss do not count; a new issue after a dismissal gives `issue`; `review()` returns `pending` when the newest decision is a dismiss.
- *(P1C)* `ReviewApiIntegrationTest` (dismiss): 201 for a senior on `issue`, and the item's `review` becomes `pending`; 400 `reviewerRole` for a pharmacist or engineer; 400 `note` under 5 characters; 409 `review` (`no_issue`) on `pending`, on `approved`, and on a pipeline issue (not found at source); 409 `extractedAt` and `lastDecisionId`; 409 `conceptId` when removed; a replayed `requestId` gives 200 `replayed:true` with one row; one `decision` audit row with `outcome='dismiss'` and `actor_role='senior'`; a 400 or 409 leaves one `decision_rejected` row; history keeps the reporter's note and gives `uncountedBy: "dismiss"`. `ReviewQueryIntegrationTest` (carried approval): an item whose snapshot has `carried_from` is `approved`, and its `extract` history entry carries `carriedFrom`.
- *(P1C)* `ReviewQueryIntegrationTest`: `otherPairs` against a second batch (approved and not-approved partners, removed partner items excluded, a product in both batches listed only in-batch, `partnerCount` over 5); `partnerScope`: `batch` for an in-batch partner, `other` for an earlier-batch partner, for a later-batch partner when the older batch is re-run, and for a partner whose only product was removed from its batch file, and `same_product` for a pair between two ingredients of one combination product (with `inBatch` false in the last four); `BatchPairsTest.computeForMatchesCompute` (for one partner set, `computeFor` gives the same pairs and not-checked lines as `compute`); `openIssues`; `source` on codes, entries, brand and pairs, with `fetchedAt` from `raw.ocl_concept`, `raw.http_snapshot` and `curated.ddinter_drug`.
- *(P1C)* `SourceLinksTest`: every §5.6.6 pattern with the pilot codes (`161`, `N02BE01`, `DB00316`, `387517004`, `XM5DJ7`, `DDInter14`, `DDInter352`, interaction `3039`); a code that fails its system's pattern gives no link; codes are URL-encoded.
- *(P1C)* `PairContentTest` pins the canonical bytes and the hash. `PairReviewRuleTest` covers all four states: `changed` after a severity, action or text change; a partner-name change is not `changed`; `issue` stays `issue` after a change.
- *(P1C)* `PairQueueIntegrationTest`: every stored pair between held substances is queued by default (PO D3(b)): `DDInter351` pairs are present with `applies: false` while only the eye drop is held, after the applying pairs of the same severity, and absent under `pairs=applies`; order; filters and counts; `changedPairReturnsToQueue` (update a pair's text and the pair is `changed`, its public `pairReview` is `not_reviewed`, and no `batch_item` changes); decisions: 201, replay, 400 role, note and requestId, 404 for an unheld pair, 409 `contentHash`, `lastPairReviewId` and `state`; the audit rows.
- *(P1C)* `VisibilityApiIntegrationTest` (PO D7): the approved-then-removed fixture on every endpoint of the matrix, including `POST /v1/interactions/check` (listed in `notReviewed`, never in `products` or `alerts`) and P10; public `pairReview` never shows `changed` or `issue`. `PublicStatusGuardTest` scans `adapter/persistence` and fails when a public adapter reads `batch_item.review` without `ReviewSql.statusOf` or `ReviewSql.LATEST_PUBLIC`.
- *(P1C)* `V7MigrationIntegrationTest` (§7.8), and `AuditAppendOnlyIntegrationTest` extended to `ops.pair_review`.
- *(QA portal)* `QaKeyRuleTest`, `QaKeyIntegrationTest` (§7.10.3), `V9MigrationIntegrationTest` (§7.10.2) and the `AuditApiIntegrationTest` additions (§7.10.7). `ReviewApiIntegrationTest` and `PairQueueIntegrationTest`: a decision and a pair decision with `reviewerRole=qa` are 400 `field=reviewerRole`, write no decision row and one rejected audit row.
- *(QA)* `QaQueryIntegrationTest` (§7.9.5): 401 without the token; batch items with stages in pipeline order, a stage with no result absent, removed items excluded, 404 `batchId`; each filter with a matching and a non-matching fixture (coverage `not_run` never matches `no_ddinter_data`; `route_assumed` reads the ddinter-stage evidence; both `unaligned` causes); `stage` with `stage_warn` only (400 `stage` with any other filter); 400 for a bad `filter`, `batch` and `page`; 404 `batch`; paging, order and `total`. `QaRecordsScaleIntegrationTest`. `AuditApiIntegrationTest` adds `qa_read` with target type `qa_route` (201). `V8MigrationIntegrationTest` asserts the widened `audit_event_event_check`.

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

**ETL, P1C reopen rule** (`etl/tests/test_reopen_rule.py`, new; `test_batches.py` and `test_snapshots.py` updated):

- `test_unchanged_rerun_stamps_nothing`: an approved item stays `ok`, its `extracted_at` is unchanged and no snapshot is written; stage results are still replaced.
- `test_pair_change_reopens_no_record`: a changed pair severity, a new interaction text, and a new disease or food row each re-open no product, the target included.
- `test_covered_change_reopens`: a strength, a clinical-drug route, a substance code (ATC), a chosen-entry change, and coverage `full`→`none` each stamp the target and its dependents (`shared_change`), and nothing else.
- `test_other_route_entry_is_not_covered`: a new `otic` entry for a substance re-opens no `systemic` product.
- `test_v1_payload_compares_without_coverage`.
- `test_dgda_failure_still_stamps_issue`.
- `test_reopen_flag_stamps_targets_only`: `--reopen` stamps the named targets with an open reviewer issue and no dependent; an approved target is skipped and logged "skipped: approved, --reopen not confirmed" (§13.1 Q12).
- `test_readded_item_is_stamped`: an approved item marked "removed from batch file" comes back into the file with an unchanged view; it is stamped `pending`, its marker is cleared in the same statement, and `statusOf` never reads it as `ok` in between.
- `test_note_written_without_stamp`: an item that leaves the file with an unchanged view gets the "removed from batch file" marker and no stamp; an unchanged item that stays keeps a NULL note.
- `test_relisted_product_carries_approval`: a product approved in batch A and listed in a new batch B with an unchanged view gets a B item with `review = 'ok'` and `carried_from` in its snapshot; it stays public; batch A is unchanged.
- `test_relisted_product_with_changed_view_is_pending`: the same with a changed strength gives a `pending` B item, and the product leaves public view.
- `test_batch_status_recomputed_not_forced`: an unchanged re-run leaves an approved batch `approved`.
- `test_no_code_path_deletes_ddinter_pair` (§7.8).

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
- *(P1C)* **Review flow (senior)**: the role badge and `PROMISE_SENIOR`; A approves and publishes; R on an approved record withdraws it; then D opens the dismiss panel showing the reporter's note; a 4-character note shows the error; send; the status is `pending`, focus is on "Looks correct", the history shows both notes, and the database holds one `dismiss` row and one audit row; a pharmacist session on an `issue` record shows no Dismiss button and D does nothing.
- *(P1C)* **Senior pages**: the queue lists a pair whose partner is in a second test batch; M marks it reviewed, and its row reads `PAIR_REVIEWED`; the test updates the pair text in the database, and the pair is back under "Changed since review" while the approved record stays approved (P1C pins the public `pairReview` of the checker at API level, `PairQueueIntegrationTest`; P2's checker e2e asserts `PAIR_REVIEWED` and `PAIR_NOT_REVIEWED` on the page); R reports a pair issue and the pair text stays visible in public; a pharmacist session gets the not-authorised banner.
- *(P1C)* **Desk cross-batch**: with a second test batch, the record shows "In other batches" with both subgroups; a second-batch record whose text-missing partner was mapped by `0001-pilot` shows it under "…with medicines outside this batch.", never under "…in this batch."; a combination record whose two ingredients form a text-missing pair shows it under "…between ingredients of this product."
- **Not authorised**: `user` on `/review`; anonymous redirect.
- *(QA portal)* **QA flow**: a `qa` session on `/review` lands on `/review/qa`; on `/review/0001-pilot/{conceptId}`, `/review/flags` and `/review/pairs` it gets the QA account view with no record data in the HTML; "QA tools" in the account menu opens the page; create a key named "CI laptop" (the bot check uses the e2e test key), see the panel with focus on its heading, copy, then "I've saved it"; the key list shows it Active with "Never"; with that key, `GET /api/qa/v1/batches` is 200 and the list then shows a "Last used" time; `POST /api/qa/mcp` `initialize`, `tools/list` and `tools/call list_batches` succeed with the preamble first; *(QA API reference)* the path and query of each endpoint panel's command, fetched with that key, answer 200 with an envelope whose key tree equals the panel's example (field names and shapes, not values), and the MCP panel's two commands do the same; revoke it, and the next API and MCP calls are 401; a sixth active key is refused; a key row the test inserts for an account that the e2e `REVIEWERS` lists as `pharmacist` (its hash only) is 401, and that account's session on `/review/qa` gets the pharmacist banner. An engineer and a senior see "QA tools" and can create a key; a pharmacist cannot.
- **Public scope for reviewers**: a pharmacist session on `/products/{unapprovedId}` renders the stub, and on `/check` lists that product under "Not yet reviewed by a pharmacist".
- **Sign-in return path**: `/signin?returnTo=/\evil.com` lands on `/signin?welcome=1`.
- **Sign-out**: drafts in `sessionStorage` are gone after `POST /signout`.
- **Checker**: combobox keyboard; add and remove announcements; Clear all moves focus to the "Add a medicine" input (never to `<body>`); summary sentence; Major first; the no-data block; "No interaction listed"; the eye drop "What was checked" names `DDInter352`; not reviewed listed by name; the no-JS GET flow (JavaScript disabled).
- **Public**: landing; search "paracetamol", "warfarin" (stub) and "warfrin" (suggestion); stub page; product page; sign-in state pages; partner form.
- **axe** (`@axe-core/playwright`, WCAG 2.2 AA tags) on every page and on these desk states: ready, armed, committing, stale, net error (not saved and unconfirmed), bot hold, no-auth, signed out, complete, loading, drawer, sheet (with settings), report error, shortcuts Off, and the no-JavaScript confirm page; *(P1C)* the dismiss panel (empty, error, sending), the pair queue (each filter, a row's issue panel, a row-level 409 banner), the substance page, and the senior not-authorised banner; *(QA portal)* `/review/qa` (empty list, list with every status, new-key panel open, revoke confirmation open, a create error banner, the pharmacist banner; *(QA API reference)* every reference panel open) and the QA account view. Each in light, dark and forced colours.
- **Reflow** at 320 px (public, desk and *(QA portal)* `/review/qa` with the key panel open, and *(QA API reference)* with every reference panel open): no horizontal page scroll; each reference code block scrolls inside its own region, and Enter and Space on a summary toggle its panel. At 1280×800 with 400% zoom (a 320×200 CSS px viewport) the focused element is never covered by the toolbar, the decision bar or the public and Learn toolbars, checked by tabbing through the desk, the product page and a Learn chapter. Learn below 860 px: the chapter nav is a sticky horizontal row and a focused heading is not covered by it.
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
| **1C. Review model and source links** *(P1C)* | The senior role and Dismiss issue (§5.10a); senior review (§5.17, §7.7); the reopen rule (§8.3.1); cross-batch pairs and the `partnerScope` and combination fixes on the desk (§5.5.3, §5.6.2); source links on the desk (§5.6.6); the PO D7 visibility tests; V7 (§7.8) | §11 P1C suites green; `db-schema-v1.2` tagged; the P1C pilot check on production (§8.3.1: an unchanged DDInter re-run stamps nothing); a senior reviews at least the pilot's Major pairs in the queue; S8 and S9 hold |

Phase 3 may ship before phase 2 (amended 15/10/2026): P3 builds the §7.4 `GET /v1/stats` row itself and uses no other phase-2 component, route or endpoint.

*(P1C, 15/10/2026)* Phase 1C ships after phase 3 and before phase 2. The order is 0, 1, 3, 1C, 2. P1C needs P3's `ReviewSql.statusOf` removed-item fix (PO D7) and changes rules the public surfaces build on (pair review state, the reopen rule, P10 across batches), so P2 builds on P1C rather than being reworked after it.

The pharmacist reviews the pilot in phase 1, on the workspace. The public site keeps its current pages (restyled only through the shared layout) until phase 2; only `/signin` gains the bot check, the return path and their error states in phase 1 (§12.2, P1A).

### 12.2 Implementation plans (Decision)

This spec is **not one implementation plan**. It is split into nine plans (*P1C*: five before 15/10/2026, six until the QA plan of 18/10/2026, seven until the QA portal plan of the same day, eight until the QA API reference plan of 19/10/2026), each written, reviewed and executed on its own, in this order. Each plan cites the sections it implements and may not change a Decision here without amending this spec first.

| Plan | Phase | Scope | Depends on |
|---|---|---|---|
| **P0 Safety prerequisites** | 0 | §8 (ETL route fix, pair-list reconciliation, snapshots, removed-item rule, re-run, the `stages` input of `load-dgda.yml`), §7.1, §7.2, §7.6, the phase-0 current-web adjustments in §12.1, and their §11.3 tests, including the updates to existing API and ETL tests | none |
| **P1A Foundation** | 1 | §3 (tokens, fonts, theming, `ui/` components, copy constants), §4 (islands allowlist and check), §9 (CSP nonce, `next.config.ts` header changes, nonce on `components/Turnstile.tsx`, request id, JWE session, `/signout` and the removal of `DELETE /api/session`, rate-limit keys, Turnstile action and hostname checks), §5.15 and §7.5 audit plumbing, `safeReturnTo()`, `/healthz`, the §12.4 environment and compose changes, and the e2e harness (§11.4 environment). **Sign-in function ships here**, together with the `/api/session` Turnstile check, so sign-in never breaks between plans: the SignInButton's `TurnstileField` (action `signin`), `turnstileToken` and `returnTo` (through `safeReturnTo()`) in the POST, and the `/signin` states "Bot check failed", "Session request failed" and "Too many sign-in attempts" (§6.2). | P0 |
| **P1B Reviewer workspace** | 1 | §5 entirely, §7.3, `/review` and `/review/flags` (§5.16), the `/batches` and `/flags` redirects, `docs/runbooks/reviewer-invite.md` (new), and the review parts of §11 | P1A |
| **P2 Public surfaces** | 2 | §6.1–§6.7, §6.9, §7.4 (reusing `GET /v1/stats` from P3, and switching every public adapter to the one §7.4 rule), the `/?q=` redirect, `docs/runbooks/partner-requests.md` (new), and the public parts of §11. For sign-in, P2 adds only the visual card (§6.2 "Card") and the welcome states (including the P1C senior step). *(P1C)* P2 builds the P1C model: P10 across batches, grouped by partner substance (§6.5); `FROM_DDINTER` and the public pair review state on every pair card (§6.5–§6.7.3); the check result's `pairReview` rendered on the page (P1C ships the API field) and P9; source links on approved product and substance pages (§6.5). | P1A, P1C (P1B not required) |
| **P3 Learn** | 3 | §6.8, the §1.6 Learn corrections, and the §7.4 `GET /v1/stats` row | P0, P1A, P1B; builds the §7.4 `GET /v1/stats` row |
| **P1C Review model and source links** *(P1C)* | 1C | The senior role (§2.2; §5.13, every role gate listed there; `AuditService` in §7.5); Dismiss issue (§5.2, §5.6.5, §5.7, §5.8, §5.10a, §7.2); senior review (§5.17, §7.7, the `SeniorDesk` island, §4.2); the reopen rule (§8.1 item 4, §8.3.1: `settle`, `approval_view`, `--reopen`, batch status); the desk's cross-batch pairs, the `partnerScope` note split and the `Interactions.tsx` combination fix (§5.5.3, §5.6.1, §5.6.2, §7.3 `otherPairs`); source links on the desk (§5.5.2, §5.6.3, §5.6.6, `SourceLinks.java`); the PO D7 visibility tests (§7.4); the checker alerts' `ddinterA`, `ddinterB` and public `pairReview` (§7.4, API only); V7 and `db-schema-v1.2` (§7.8); the P1C §1.7 copy; and the P1C rows of §11. **Not in P1C**: public pages (P2 builds §6.5–§6.7 on this model) and Learn (PO D9). Learn's re-run sentences (§1.6 item 4) still describe the pre-P1C rule; they are listed for the next Learn amendment. | P0, P1A, P1B, P3; ships before P2 |
| **QA API, QA MCP and checker text** *(QA)* | after 2 | §7.9 (the `/api/qa/v1/*` route handlers, `lib/qa-api.ts`, `lib/qa-map.ts`, `LIMITS.qa`, the `qa_read` audit event and `AuditService` changes, the `GET /v1/qa/*` internal endpoints, `tools/qa-mcp/` with its README and CI job, `docs/runbooks/qa-api-keys.md`); the §6.7.3 checker interaction-description block and the `Expander` `describedBy` prop (§4.2); `QA_API_KEYS` in `web.environment` and `deploy/.env.example` (§12.4); and the QA rows of §11. **Schema:** one change, because the audit event needs it: `V8__qa_read_audit.sql` widens `audit_event_event_check` with `qa_read` and nothing else, tag `db-schema-v1.3` (§7.9.6). A complete release: it may merge to `main` on its own (§12.3). | P2 (shipped) |
| **QA portal** *(QA portal)* | after QA | §7.10 (the `qa` role and every gate in §5.13, the QA account view in §5.12; self-service keys: `ops.qa_key`, `QaKeyController` and the §7.10.3 endpoints, the §7.10.4 verification rule in `lib/qa-api.ts`, `last_used_at`; the server actions and `lib/qa-key-core.ts`; `lib/qa-query.ts` shared by the QA API and the hosted MCP; `POST /api/qa/mcp`, `lib/qa-mcp.ts` and the shared `lib/qa-mcp-tools.ts` with the `tools/qa-mcp` parity test; the `qa_key_created` and `qa_key_revoked` events, `AuditService` changes), §7.9.1 and §7.9.6 as amended, the `/review/qa` page (§5.18) with the QaKeys and CopyButton islands (§4.2), the "QA tools" account-menu item and toolbar link (§5.1, §6.2), the QA welcome state (§6.2), the Turnstile action `qakey` and the §9.3 limits, `docs/runbooks/qa-api-keys.md` and `docs/runbooks/reviewer-invite.md` (QA invite, DB keys, team revocation), `tools/qa-mcp/README.md` (hosted server, DB keys), the QA portal §1.7 copy, and the QA portal rows of §11. **Schema:** one change, `V9__qa_keys.sql` (§7.10.2), lock header `db-schema-v1.4`; the tag `db-schema-v1.4` is created after the merge. A complete release: it may merge to `main` on its own (§12.3). | QA (shipped) |
| **QA API reference** *(QA API reference)* | after QA portal | §5.18 section 3 "API" as amended (the reference: `app/review/qa/ApiReference.tsx`, `lib/qa-api-reference.ts`, `lib/qa-api-examples.ts`, the `qa.module.css` classes), the constants it reads (`QA_RECORDS_SIZE`, `QA_RATE_LIMIT`, the exported `DEFAULT_PROTOCOL_VERSION`), the `CopyButton` `context` prop (§4.2), the `ExampleMarker` allowance (§3.4), the §1.7 row with `QA_COPY.reference` and the new `SHARED_WORDS`, and the QA API reference rows of §11. No schema, API, route, response-shape, MCP tool-text or island change; `tools/qa-mcp` is untouched. A complete release: it may merge to `main` on its own (§12.3). | QA portal (shipped) |

P1A may ship as its own release: it changes the shared layout, security and the sign-in function, and no other surface's behaviour. P1B and P2 each ship as one release (§12.3).

### 12.3 Feature flags

**Decision: no runtime feature flags.** Each phase is one release (an image tag) with its own redirects. This avoids a second code path for safety rules. Partially built surfaces are not deployed, and the branch model enforces it: every push to `main` that passes CI deploys at once (§12.4), so each plan's PRs merge into a `phase-N` integration branch (`phase-0`, `phase-1`, `phase-2`, `phase-3`), and only the phase-complete merge of that branch into `main` deploys. P0, P1A and P3 are the exceptions that may merge to `main` on their own, because each is a complete release (§12.2; P3 is the whole of phase 3). *(P1C)* P1C is the whole of phase 1C and may merge to `main` on its own, after P3. *(QA)* The QA plan is a complete release after phase 2 and may merge to `main` on its own; V8 runs through Flyway on deploy, and the QA API stays disabled until `QA_API_KEYS` is set (§12.4). *(QA portal)* The QA portal plan is a complete release after the QA plan and may merge to `main` on its own; V9 runs through Flyway on deploy, and from that release on the QA API and the hosted MCP answer 401 (never the disabled 404) to a request no key authenticates (§7.9.1). The tag `db-schema-v1.4` is created on the merged commit. V7 runs through Flyway on deploy (§12.4), and the P1C pilot check (§8.3.1) follows the deploy.

### 12.4 Deploy without touching other services

- **Deploy is the existing `deploy` workflow** (`.github/workflows/deploy.yml`): on every push to `main` that passes CI, it builds and pushes the `bddrug-etl`, `bddrug-api` and `bddrug-web` images, copies `deploy/docker-compose.yml`, `db/migrations` and `batches` to `/home/ec2-user/drugdb` (the host has no git checkout), sets `IMAGE_TAG`, and runs `docker-compose up -d --remove-orphans` in `/home/ec2-user/drugdb/deploy`. Flyway runs first through `depends_on`, and V6 is additive. There is no separate manual deploy procedure.
- Manual commands on the host (adding a reviewer §5.13, the re-run §8.3, rollback §12.5) run from `~/drugdb/deploy` with the `docker-compose` binary; the compose file sets the project name `bddrug`.
- **Smoke check.** The workflow's last step requests `$PUBLIC_URL/batches` with `curl -f`; it keeps passing in phase 0 (§12.1). P1A changes it to `$PUBLIC_URL/healthz`, so the `/batches` redirect (P1B) and the reviewer-only pages never fail a deploy.
- The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted.
- The `drugdb.eliooo.org` Caddy block is unchanged: the `/__/auth` proxy is a Next rewrite (§9.5).
- **New env vars reach the web container only through `web.environment`.** Compose passes only the variables listed there (host `.env` values are interpolated, not inherited). P1A adds to `web.environment` in `deploy/docker-compose.yml`: `SITE_HOST: ${SITE_HOST}` and `HERO_CONCEPT_ID: ${HERO_CONCEPT_ID:-}`, and lists both in `deploy/.env.example` with `SITE_HOST=drugdb.eliooo.org` and `HERO_CONCEPT_ID=186-0030-006--napa`. `SITE_HOST` is required: `instrumentation.ts` exits when it is unset in production (a unit test in `instrumentation.test.ts` pins this), and `deploy.yml`'s pre-flight check requires it in the host `.env` so the running containers stay up. `INTELLIDRUGS_E2E` is never added here (§11.4). *(QA)* The QA plan adds `QA_API_KEYS: ${QA_API_KEYS:-}` to `web.environment` and an empty `QA_API_KEYS=` to `deploy/.env.example`, so the QA API ships disabled (404, §7.9.1). The product owner sets the hashed entries in the host `.env` after the deploy and recreates the `web` container only (`docker-compose up -d web`), following `docs/runbooks/qa-api-keys.md`; no other service is touched. *(QA portal)* No new environment variable: the hosted MCP address is built from `SITE_HOST`, and `QA_API_KEYS` stays as it is (env keys keep working). QA team members are added to `REVIEWERS` as `email:qa` with the §5.13 procedure (recreating `web` only). The hosted MCP is a route of the existing web container, so the Caddy block, ports and networks are unchanged.
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
- **ETL**: a rollback does not restore stage notes. Re-run the ddinter stage with the previous image if needed. Re-runs only ever re-open review; they never publish. *(P1C)* A carried approval (§8.3.1 item 8) keeps an already public product public when nothing it covered changed; it never makes public a product that was not, and a record that comes back into its batch file is always re-opened (§8.3.1 item 5).
- **V6**: do not drop it on rollback. It is harmless to older images. Dropping it follows the lock policy (a new migration).
- *(QA portal)* **V9**: keep it on rollback. Older images never read or write `ops.qa_key` and never write `qa` or the key events. Under a pre-portal image `parseReviewers` skips `qa` entries (those accounts read as `user`), DB keys stop authenticating, `/api/qa/mcp` is gone, and the QA API returns to the D61 disabled-404 rule when `QA_API_KEYS` is unset; env keys keep working.
- *(P1C)* **V7**: the same. Older images never write `senior`, `dismiss` or pair reviews, and they read decisions with the V4 values, but a pre-P1C `ApprovalRule` would ignore a `dismiss` row. So a rollback below P1C must be preceded by a check that no `dismiss` row is counted on a current item (runbook query in `docs/runbooks/reviewer-invite.md`). Otherwise a pharmacist re-approves, or anyone re-reports, those records first (amended by the P1C plan, 15/10/2026: a pre-P1C `ApprovalRule` counts an `ok` only from role `pharmacist`, so a senior's re-approval would read as pending under the older image; the runbook query lists a record until a counted `issue`, or a `pharmacist` `ok`, follows its latest dismissal).

---

## 13. Open questions and decisions

### 13.1 Open questions (need the product owner)

1. **Licence lines.** The exact attribution and licence wording for DDInter 2.0, ATC, DrugBank and SNOMED CT in the footer and in Learn. Board P marks these "Licence line(s) to confirm". **This blocks phase 2 public launch.**
2. **Systemic note for route-specific products.** Should the checker and product page show an informational line such as "Systemic chloramphenicol (DDInter351) has moderate interactions with warfarin (metabolism), simvastatin and amlodipine. These apply to oral or IV chloramphenicol, not to this product."? If yes, it is never counted as an alert. Default until decided: **not shown**. This is a clinical-content decision for the pharmacist and the PO.
3. **Indexing at public launch.** The site stays `noindex` with `robots.txt Disallow: /` during the pilot. When the first batch is approved, should public pages become indexable? Default until decided: stay `noindex`.
4. *(P1C)* **What a dismissal restores.** After a senior dismisses an issue, does the record go back to `pending`, so a pharmacist re-approves it, or does it go back to `approved`, when a pharmacist's `ok` preceded the issue and nothing else changed? Default until decided: **`pending`** (§5.2, D57). Restoring would re-publish without anyone looking at the record at that moment. The senior can approve straight after with A.
5. *(P1C)* **What a pair issue does in public, and who acts on it.** Default until decided: **nothing beyond `PAIR_NOT_REVIEWED`** (§5.17, D52). The pair and its DDInter text stay visible; hiding them would present missing data as safety. Alternative: a public caution line on the pair, for example "A senior pharmacist is checking this pair." Second part: a pair issue creates no engineering work item. Default until decided: **the senior also reports an issue on an affected record when engineering work is needed** (§5.17). Alternative: engineers get the `/review/flags` count line and a read-only list of pair issues.
6. *(P1C)* **A newly failed check on an approved, unchanged record.** PO D5 says a record re-opens "only" when covered data changes. Default until decided: **it stays approved**; the failed check shows on the desk and blocks new approvals (§8.3.1 item 7). Alternative: any newly failed stage re-opens the record.
7. *(P1C)* **Substance synonyms.** Should a new or changed synonym (`substance_name`), which public search uses, re-open the products of that substance? Default until decided: **no**, because PO D5's list does not name it (§8.3.1).
8. *(P1C)* **Who may read the senior pages.** Default until decided: **seniors only** (§5.17). Alternative: pharmacists and engineers may read them, without the Mark and Report controls.
9. *(P1C)* **ICD-11 and SNOMED CT deep links.** The ICD-11 browser deep-links only by entity id (verified: `#173693607` opens XM5DJ7), and we store only the XM code. The SNOMED International browser refused connections on 15/10/2026. Default until decided: **the ICD-11 browser home with "Search ICD-11 for {code}", and SNOMED CT through RxNav's SNOMEDCT search** (§5.6.6). Alternatives: store ICD-11 entity ids (needs WHO ICD API credentials in the ETL), and switch SNOMED CT to `browser.ihtsdotools.org` once it is reachable and its licence terms suit.
10. *(P1C)* **Licences for linking.** The user takes responsibility for licences (PO D8). Q1's attribution lines still block the P2 public launch, now including any line that DrugBank, SNOMED International and WHO require for links.
11. *(P1C)* **Pair queue scope.** PO D3(b) asks for every stored pair between substances we hold, and that is the default (§5.17). Pairs that apply to no pair of our brands (no held product is checked against one of the pair's two entries, for example the systemic `DDInter351` chloramphenicol pairs while we hold only the eye drop) are listed with the line "Does not apply to the medicines we hold…" (§5.17.2 item 2), after the applying pairs of the same severity, and the "Applies to our brands" filter hides them. Question: should the queue's default narrow to applying pairs? Default until decided: **no, every stored pair** (PO D3).
12. *(P1C)* **`--reopen` as an exception to PO D5's "only".** The engineer's override (§8.3.1 item 5) re-opens named records whatever changed, for a fix the approval view does not cover. On an approved record that takes it out of public view with no covered change. Default until decided: **`--reopen` skips approved targets** (it re-opens only targets with an open reviewer issue, which are not public); a pharmacist withdraws an approved record with Report issue. Alternative: `--reopen` re-opens approved targets too.
13. *(P1C)* **A product listed again in a new batch.** Default until decided: **its approval is carried over** when its approval view equals the view its approval covered (§8.3.1 item 8), because PO D5 re-opens a record only on a covered change. Alternative: a product's first item in a new batch is a new record that a pharmacist approves again (it leaves public view until then).

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
| D18 | V6 adds `ops.item_snapshot` and `ops.audit_event`, the decision `request_id` unique index, and append-only triggers; nothing else changes in the schema *(P1C: V7, D59, is the next change; QA: V8, D63, the one after it; QA portal: V9, D71, the one after that)* | §7.6 |
| D19 | Global reviewer roles; invites sent by hand from a fixed template | §5.13 |
| D20 | Encrypted session cookie (JWE) with the `__Host-` prefix; the old cookie is retired | §9.6 |
| D21 | Nonce-based CSP without `script-src 'unsafe-inline'`; Turnstile on sign-in | §9.2, §9.4 |
| D22 | No checker persistence in browser storage; no query strings in logs | §6.7.1, §9.7 |
| D23 | Infrastructure identifiers keep the `bddrug` names | §9.8 |
| D24 | No runtime feature flags; phase releases by image tag, through `phase-N` branches; rollback by tag | §12.3, §12.5 |
| D25 | Product page "With the other medicines" is limited to approved products of the same batch. *(Superseded by D60 in P1C: approved products of every batch, grouped by partner substance.)* | §6.5 |
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
| D42 | Plan PRs merge into `phase-N` branches; only phase-complete merges (and P0, P1A, P3) reach `main`, which deploys automatically | §12.3, §12.4 |
| D43 | `exampleUsable` is an accepted coarse public signal ("withdrawn from examples"); no other review detail is public | §6.8, §7.4 |
| D44 | The batch layout holds ReviewDesk with batch-level props; the record page renders filters, list and detail and registers record data through `DeskRecordContext` | §4.2, §5.8.1 |
| D45 | The reviewer's own save updates that record's `viewedVersion`, so it never turns the record stale | §5.8.2, §5.11 |
| D46 | The hatch and `NoDataChip` mean coverage `none` only; other not-checked reasons are plain text | §3.4, §6.5, §6.7 |
| D47 | Checker counts exclude same-product and same-BDS pairs; `{m}` counts every selected medicine | §6.7.2, §7.4 |
| D48 | Learn (P3) ships before the public surfaces (P2): P3 builds `GET /v1/stats` and depends on P0, P1A and P1B; until P2 serves the §7.4 hidden stub, Learn leaves out the sentences that describe it; a failed stats read shows a banner inside the Learn shell, never a chapter | §6.8, §7.4, §12.1–§12.3 |
| D49 | *(P1C, PO D2)* Senior pharmacist role `senior`: every pharmacist power plus senior review and Dismiss issue; public verification still reads "Approved by a pharmacist" | §2.2, §5.13 |
| D50 | *(P1C, PO D1)* Publishing is unchanged: any pharmacist's or senior's "Looks correct" approves and publishes a record, batch by batch; batches are the unit of engineering review | §5.13 |
| D51 | *(P1C, PO D3)* Senior review by substance and as a pair queue, across all batches; pair decisions (`reviewed`, `issue`) are append-only, audited, idempotent by `requestId` and versioned by content hash and last pair review id | §5.17, §7.7, §7.8 |
| D52 | *(P1C)* A pair issue never hides a pair or its text; it records a note, shows `PAIR_NOT_REVIEWED` in public, and stays in the queue until a senior marks the pair reviewed | §5.17 |
| D53 | *(P1C, PO D4)* Public pair cards show every DDInter pair between approved products with its text, `FROM_DDINTER` and a coarse senior-review state (reviewed with date, or not yet reviewed); plain text, never green; senior review is not a gate | §3.6, §6.5–§6.7, §7.4 |
| D54 | *(P1C, PO D5)* Reopen rule: a record re-opens only when its approval view (brand, clinical drug, ingredient substances, strengths, codes, chosen DDInter entries, coverage) changes; pair, text, disease and food changes never re-open a record and instead mark the pair `changed`; `batch_item.note` is written whether or not the item is stamped; a record that comes back into its batch file after removal is always re-opened; a product listed again in a new batch carries its approval when its view is unchanged (§13.1 Q13); `--reopen` is the engineer's explicit override, limited to non-approved targets until the PO confirms it (§13.1 Q12) | §8.3.1 |
| D55 | *(P1C, PO D6)* The desk shows pairs with medicines in other batches (approved and not yet approved, grouped); the batch block survives a no-data ingredient of a combination; text-missing notes are split by the new `partnerScope` (this batch, this product's own ingredients, outside this batch), not by `inBatch` alone | §5.5.3, §5.6.2, §7.3 |
| D56 | *(P1C, PO D7)* A latest item removed from its batch file is never public, through `ReviewSql.statusOf` and `LATEST_PUBLIC` only, pinned for every public endpoint, the checker included | §7.4, §11.3 |
| D57 | *(P1C, PO D10)* Dismiss issue: seniors only; an append-only `dismiss` decision with a 5–1000 character note, audited, version-guarded and idempotent; it is a review boundary that returns the record to `pending`; the reporter's note stays in the history | §5.2, §5.10a, §7.2 |
| D58 | *(P1C, PO D8)* Every code links to its source page, built only by the API from a validated code, with "fetched on" where a fetch time is stored; desk for every record, public pages for approved records only; SNOMED CT through RxNav search and ICD-11 through the browser home, because neither has a working deep link by code | §5.6.6, §6.5 |
| D59 | *(P1C)* V7 widens the decision and role checks, adds `ops.pair_review` (append-only by trigger) and the new audit events; tag `db-schema-v1.2` | §7.8 |
| D60 | *(P1C)* Plan P1C ships after P3 and before P2; P2 builds the P1C public model, including P10 across batches grouped by partner substance (replacing D25's batch-only rule) | §6.5, §12.1, §12.2 |
| D61 | *(QA, PO 17–18/10/2026)* A read-only QA API served by the existing web app under `/api/qa/v1/` (route handlers calling the internal API with the token; no new container, port or Caddy change); Bearer keys stored only as SHA-256 hashes in `QA_API_KEYS`, compared in constant time; unset means disabled (404 everywhere); 60 requests per minute per key; no CORS, `no-store`, `noindex` *(QA portal: the disabled-404 rule is replaced by D68)* | §2.1, §2.2, §7.9.1 |
| D62 | *(QA)* QA responses are built from a field allowlist; they never carry an email, a decision, dismissal or pair-issue note, `mine`, session data or a token; decision history is role, time and decision only | §7.9.3, §7.9.7 |
| D63 | *(QA)* Every QA call writes a `qa_read` audit row (label, route template, outcome; never the key), with `unauthorized` and `rate_limited` rows throttled and none while the API is disabled; a 200 is sent only after its row is written; `V8` widens the event check for it, tag `db-schema-v1.3` | §5.15, §7.9.6 |
| D64 | *(QA, PO 17/10/2026)* The public checker's alert cards show DDInter's interaction description after the management text, in its own block, clamped behind the existing Expander; checker only; no new copy, island, API field or unapproved data | §6.7.3 |
| D65 | *(QA)* `tools/qa-mcp/`: a stdio MCP server with five read-only tools mapped 1:1 to the QA API, a fixed preamble on every result, errors with the HTTP status and never the key; outside the web build | §7.9.8 |
| D66 | *(QA portal, PO 18/10/2026)* A `qa` role (label "QA") in `REVIEWERS`; QA tools are for `qa`, `engineer` and `senior`, never `pharmacist` or `user`; a `qa` account sees only the QA section (`/review` redirects to `/review/qa`, every other review page is refused as for a non-reviewer) and can never make a decision: web, API and database each refuse it; existing role semantics are unchanged | §2.1–§2.3, §5.12, §5.13, §7.10.1 |
| D67 | *(QA portal)* Self-service QA keys: `idqa_` + 43 base64url characters (32 random bytes), generated by the web, stored only as SHA-256 hashes in `ops.qa_key` with the owner's verified email (server-side only, never returned by a QA route, the MCP or a page), name, 90-day expiry, revocation and a last-used time touched at most once a minute; at most 5 active keys and 10 created per rolling 24 hours per owner; the key is shown once and stored nowhere | §5.18, §7.10.2, §7.10.3, §7.10.8 |
| D68 | *(QA portal)* The QA API and the hosted MCP authenticate an env key or a DB key alike; a DB key fails when expired, revoked, or its owner's current `REVIEWERS` role no longer allows QA tools, checked on every request; the QA API is enabled when either source can authenticate, so with no keys at all it answers 401, never 404; a malformed `QA_API_KEYS` disables env keys only | §7.9.1, §7.10.4 |
| D69 | *(QA portal)* A hosted MCP server at `POST /api/qa/mcp` on the existing web app: Streamable HTTP, stateless JSON, the five read-only tools and the preamble shared with `tools/qa-mcp` (a parity test fails on divergence), tool calls through the QA API's own query code, rate limit and `qa_read` rows; `Origin` validated, `MCP-Protocol-Version` handled; OAuth out of scope | §7.10.6 |
| D70 | *(QA portal)* The QA tools page `/review/qa` ("Connect your AI", "Your keys", "API", "Rules"), reached from a "QA tools" account-menu item and toolbar link shown to `qa`, `engineer` and `senior`; key creation and revocation are server actions with the session role re-checked, Next's origin check, Turnstile `qakey` and account limits | §5.1, §5.18, §6.2, §7.10.5, §9.2, §9.3 |
| D71 | *(QA portal)* `V9__qa_keys.sql` adds `ops.qa_key` (a guard trigger lets only `revoked_at` once and `last_used_at` forward change; no delete), the `qa_key_created` and `qa_key_revoked` audit events and the `qa` actor role; the decision role checks stay narrow; lock header and tag `db-schema-v1.4`, the tag after the merge | §7.10.2, §7.10.7 |
| D72 | *(QA API reference, PO 19/10/2026)* The "API" section of `/review/qa` holds a full reference for the five QA endpoints and `POST /api/qa/mcp`: native `<details>` panels (the first open) with the method, full path, required header, every parameter with its rule, a copy-ready command reading `$INTELLIDRUGS_QA_KEY` with real pilot ids, an example answer marked Example, key fields and an error table. Example answers are generated by the real mappers and envelope code from typed example API bodies, rules come from the validators' constants, and tests fail when either drifts or when an example carries an email, a person, a note, a token or a key. Server-rendered only; the endpoints table and the single curl example are removed | §1.7, §3.4, §4.2, §5.18, §10.6, §11.1 |
