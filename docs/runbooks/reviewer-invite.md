# Inviting a reviewer

Pharmacists, engineers and senior pharmacists review IntelliDrugs batches on `/review`; senior pharmacists also review every DDInter pair in Senior review (`/review/pairs`). QA team members (role `qa`) do not review: they read data for quality checks through QA tools on `/review/qa` (their own keys, the MCP server and the QA API). Roles are global and come from `REVIEWERS` in the host `.env` (spec §5.13). Invites are sent by hand from the template below; there is no automated email.

Reviewer emails are personal data. Keep them in the host `.env` and in your own mail client only: never in this repository, an issue, a PR, a chat channel or a log.

## 1. Find the batch and its size

Sign in at https://drugdb.eliooo.org/review with a reviewer account. The page lists every batch with its id and record count; use the newest batch that is **In review** (the one the reviewer's account menu will name).

## 2. Add the reviewer on the host

```bash
ssh ec2-user@<host>
cd ~/drugdb/deploy
cp .env .env.bak-$(date +%Y%m%d)       # keep a dated copy; it is chmod 600 like .env
vi .env                                 # append ,their.address@example.com:pharmacist (or :engineer, :senior or :qa) to REVIEWERS
cd ~/drugdb/deploy && docker-compose up -d --no-deps web
```

- The `REVIEWERS` line is comma-separated `email:role` pairs with no spaces; the role is `pharmacist`, `engineer`, `senior` or `qa` (spec §5.13; anything else is skipped).
- `docker-compose up -d --no-deps web` recreates only the web container. `--no-deps` matters: without it Compose also brings up `web`'s dependency chain (`api`, then the exited one-shot `flyway`, which would run against the production database). The API, the database and the other sites on the host keep running; the `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted (§12.4).
- Check: `curl -fsS https://drugdb.eliooo.org/healthz` answers `ok`.
- Delete the `.env.bak-*` copy once the reviewer has signed in: it holds the same personal data.

## 3. Send the invite

Send it from the team mailbox to the address you added, exactly as below, with the role, batch id and record count filled in.

**Subject:** You're invited to review medicines on IntelliDrugs

**Body:**

> Role: {Pharmacist|Engineer}. Batch {id}, {n} records. Sign in at drugdb.eliooo.org with this Google account.

Example for a pharmacist on the pilot: "Role: Pharmacist. Batch 0001-pilot, 10 records. Sign in at drugdb.eliooo.org with this Google account."

For a senior pharmacist the body is, word for word:

> Role: Senior pharmacist. You review batches as a pharmacist, and the interaction pairs of every batch in Senior review. Sign in at drugdb.eliooo.org with this Google account.

For a QA account (role `qa`) the body is, word for word:

> Role: QA. You read IntelliDrugs data for quality checks through QA tools: your own keys, the MCP server and the QA API. You can't review or publish records. Sign in at drugdb.eliooo.org with this Google account.

## 4. What the reviewer sees

- They sign in with the invited Google account and open **Review desk** from the account menu, or go to `/review`.
- If they sign in with another Google account, every `/review` page says "This Google account isn't on the reviewer list." and offers "Use another Google account". Nothing else needs fixing: they sign out and use the invited account.
- A pharmacist's "Looks correct" publishes the record after the undo window. An engineer's check is recorded and never publishes.
- A senior pharmacist's "Looks correct" publishes like a pharmacist's. They can also dismiss an issue that was reported by mistake (D on the desk), and review pairs in Senior review from the account menu or the desk sidebar.
- A QA account opens QA tools (`/review/qa`): `/review` takes it there, and every other review page says "Your account has QA access, not reviewer access." It can never make a decision. Engineers and senior pharmacists can use QA tools too; pharmacists cannot.

## Change a role or remove a reviewer

Edit or delete their pair in `REVIEWERS`, then `cd ~/drugdb/deploy && docker-compose up -d --no-deps web`. A removed reviewer loses review rights on their next request. Removing a `qa` entry (or changing it to `pharmacist`) stops every DB key the account owns on the next request (spec §7.10.4). A reviewer whose role changed signs out and in again. Their past decisions stay in `ops.review_decision`; pages show their role, never their email.

## Before rolling back below P1C (spec §12.5)

Images before P1C ignore a `dismiss` decision, so a record whose issue a senior dismissed would read as "Issue reported" again, or worse, as approved by an approval the dismissal had set aside. Before setting `IMAGE_TAG` below the P1C release, list every dismissal that still counts on a current item:

```bash
cd ~/drugdb/deploy && docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d bddrug -At' <<'SQL'
SELECT bi.batch_id, bi.concept_id
FROM ops.batch_item bi
JOIN ops.review_decision d ON d.batch_id = bi.batch_id AND d.concept_id = bi.concept_id
WHERE d.decision = 'dismiss'
  AND (bi.extracted_at IS NULL OR d.decided_at > bi.extracted_at)
  AND bi.note IS DISTINCT FROM 'removed from batch file'
  AND NOT EXISTS (
    SELECT 1 FROM ops.review_decision l
    WHERE l.batch_id = d.batch_id AND l.concept_id = d.concept_id
      AND (l.decided_at, l.id) > (d.decided_at, d.id)
      AND (l.decision = 'issue' OR (l.decision = 'ok' AND l.reviewer_role = 'pharmacist')))
GROUP BY bi.batch_id, bi.concept_id;
SQL
```

The query prints ids only, never an email or a note. It runs inside the `db` container as `$POSTGRES_USER` (the single quotes keep the host shell from expanding it; `DB_USER` exists only in `.env`, which Compose reads and never exports), in a read-only transaction, and `ON_ERROR_STOP=1` makes a failed query exit non-zero with an error, so an empty answer always means a query that ran. If it prints an error, fix that first: an error is never "prints nothing". A record is listed while no counted `issue`, and no `ok` from a `pharmacist`, follows its latest dismissal: an older image counts an `ok` only from role `pharmacist`, so a senior's re-approval does not clear it. When it prints nothing, roll back. Otherwise a pharmacist re-approves, or anyone re-reports, each listed record on the desk first, then run it again.
