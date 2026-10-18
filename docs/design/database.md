# Database design and schema lock

**Status:** locked as `db-schema-v1.3`. The product owner approved `db-schema-v1.0` (V1–V5) on 2026-10-12; V6 is the additive change in the IntelliDrugs UX spec (§7.6); V7 is the additive P1C change (§7.8); V8 is the additive QA change (§7.9.6).
**Schema:** migrations `V1`–`V8` in `db/migrations/`, applied on drugdb.eliooo.org.
**Reference:** [Data model page](../artifacts/2026-10-12-data-model.html) (repo copy) · live version: https://claude.ai/artifact/5axV32KDeM55TrSUNF4qGc

## What "locked" means
1. **Applied migrations are immutable.** `V1`–`V8` are never edited, renamed or removed. Their SHA-256 checksums are recorded in `db/migrations.lock`.
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
4. **Version tags.** Each approved schema state gets a git tag: `db-schema-v1.0` = V1–V5, `db-schema-v1.1` = V1–V6, `db-schema-v1.2` = V1–V7, `db-schema-v1.3` = V1–V8. Bump the minor version for additive changes. Bump the major version for changes that alter or remove existing structures.

## The design in one paragraph
Three PostgreSQL schemas:
- **`raw`** holds verbatim source responses: the DGDA/OCL concepts plus every RxNav and DDInter HTTP response.
- **`curated`** holds the drug master. It has three levels: a brand (`brand_product`), its clinical drug (`clinical_drug`, ID `BDC-`), and its substances (`substance`, ID `BDS-`). Substances carry names, crosswalk codes (ICD-11 XM, RxCUI, ATC, DrugBank, SNOMED CT, DDInter, with route scope) and interaction coverage. `curated` also holds a mirror of DDInter's drug–drug, drug–disease and drug–food data, joined to our substances through `DDINTER` codes.
- **`ops`** holds batches, per-stage evidence, run history, append-only review decisions, flags, a snapshot of every record at each pipeline stamp (`item_snapshot`) and the audit trail (`audit_event`), and senior pharmacists' pair reviews (`pair_review`). The public approval gate is computed from these: a record is public only after a pharmacist's OK made since its latest extraction.

## Rules enforced by the database
- One substance per ICD-11 XM code (partial unique index).
- `BDS-` and `BDC-` IDs come from sequences capped at 999,999 with no cycling, so they are never reused.
- A clinical drug is unique by signature (dose form, route, sorted strengths).
- Each DDInter pair is stored once (`ddinter_a < ddinter_b`).
- Interaction coverage is stored explicitly (`full` or `none`). "No data" is never inferred.
- Missing DDInter text is NULL. A text row needs at least one of interaction or management.
- Review decisions are append-only. A reviewed record cannot be deleted (foreign key with NO ACTION).
- Item snapshots and audit events are append-only: triggers reject UPDATE, DELETE and TRUNCATE (SQLSTATE 42501). A batch item with a snapshot cannot be deleted (foreign key with NO ACTION), so the ETL keeps it and marks it "removed from batch file".
- Pair reviews (`pair_review`) are append-only (the same triggers). A reviewed pair cannot be deleted (foreign key to `ddinter_pair`, NO ACTION), and the ETL never deletes a pair row.
- Only a senior pharmacist may dismiss an issue, with a note of 5–1000 characters (`review_decision_dismiss_by_senior`).
- One `pair_decision` audit row per `request_id` (partial unique index), the backstop for idempotent pair decisions.
- One `decision` audit row per `request_id` (partial unique index), the backstop for idempotent decision retries.
- Enumerations and confidence (0–1) are enforced by CHECK constraints.

## Change log

### V8 `qa_read_audit` (db-schema-v1.3)
- **The change:** drops `audit_event_event_check` and adds it again with `qa_read` appended. Nothing else: `target_type` has no database check (the new target type `qa_route` is checked by the API's `AuditService`), and `actor_role` stays nullable.
- **Why it is needed:** the product owner's decisions of 17–18/10/2026 (D61, D63) add the read-only QA API, and every QA call writes a `qa_read` audit row (key label and route template, never the key); V7's check refuses the new event.
- **What it does to existing rows:** nothing. Every existing row satisfies the widened check; a constraint change is DDL, so the append-only triggers are not involved. Retention: `qa_read` rows are kept indefinitely, like every audit row.
- **How to roll it back:** V8 stays (spec §7.9.6). Older images never write `qa_read`, so they run unchanged on V8; a narrowing migration would fail once any `qa_read` row exists, because audit rows can never be deleted.

### V7 `senior_review` (db-schema-v1.2)
- **The change:** widens `review_decision.decision` to `ok | issue | dismiss` and `review_decision.reviewer_role` to `pharmacist | engineer | senior`, and adds `review_decision_dismiss_by_senior` (a dismiss is a senior's, with a 5–1000 character note). Adds the append-only table `ops.pair_review` (one row per senior pair decision, with the content hash and the content reviewed), its index, two triggers on `ops.reject_change()`, and a REVOKE. Widens `audit_event.event` with `pair_decision`, `pair_decision_rejected` and `senior_open`, and `audit_event.actor_role` with `senior`, and adds a partial unique index on `audit_event (request_id) WHERE event = 'pair_decision'`.
- **Why it is needed:** the product owner's decisions of 15/10/2026 (PO D2, D3, D5, D10) add the senior pharmacist, who dismisses mistaken issues and reviews DDInter pairs across all batches; the V4 checks refuse the new role and decision, no table can hold a pair review with the content it covered, and the new audit events need the V6 checks widened.
- **What it does to existing rows:** nothing. Every existing row satisfies the widened checks; constraint changes are DDL, so the V6 append-only triggers are not involved. Retention: pair reviews are kept indefinitely.
- **How to roll it back:** a new migration that drops `ops.pair_review` and restores the narrower checks; it works only while no `senior` or `dismiss` row exists. Otherwise V7 stays: older images never write `senior`, `dismiss` or pair reviews. Before rolling the API below P1C, run the runbook query in `docs/runbooks/reviewer-invite.md` ("Before rolling back below P1C"): a pre-P1C `ApprovalRule` ignores a `dismiss` row and counts an `ok` only from role `pharmacist`, so a counted dismissal must first be followed by a pharmacist's approval or by a fresh report.

### V6 `item_snapshot_and_audit` (db-schema-v1.1)
- **The change:** two new tables, `ops.item_snapshot` and `ops.audit_event`, a partial unique index on `audit_event (request_id) WHERE event = 'decision'`, two other indexes, the function `ops.reject_change()` and four triggers that make both tables append-only.
- **Why it is needed:** a pipeline run deletes `ops.stage_result` and overwrites curated rows, so without a snapshot the previous state of a record is gone ("See what changed", the Back-in-review reason). Healthcare data needs an audit trail that does not rotate like Docker logs. Decisions need a stored `request_id` so a retried decision is answered once.
- **What it does to existing rows:** nothing. The migration only creates objects. Retention: audit rows and snapshots are kept indefinitely.
- **How to roll it back:** a new migration that drops both tables and `ops.reject_change()`. Nothing in V1–V5 depends on them, so on an application rollback V6 stays. The older API and web images run unchanged against V6. The pre-P0 ETL image must not re-run a batch whose file dropped an item that already has a snapshot: its `_upsert_batch` deletes a removed item that has no decision, and the `ops.item_snapshot` foreign key (NO ACTION) refuses that delete, aborting the whole run. Re-run such a batch with the P0 ETL image only.
