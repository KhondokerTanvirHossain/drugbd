# QA API keys: create, hand over, rotate, revoke

The QA API is a read-only, key-gated JSON API served by the web app under `https://drugdb.eliooo.org/api/qa/v1/` (spec §7.9). Two kinds of key authenticate it alike (spec §7.10.4): **env keys**, which the team makes by hand and lists by hash in `QA_API_KEYS` (this runbook's first half), and **DB keys**, which QA team members, engineers and senior pharmacists create and revoke themselves on `/review/qa` (see "Self-service keys" below). It exists for the product owner's other project, where another LLM re-checks our data against its sources and reports mismatches. It reads what the reviewer desk reads, unapproved records included, so every key is a credential to unreviewed data. It never returns an email or a reviewer note, and it writes nothing but its own `qa_read` audit rows.

| Endpoint | What it returns |
|---|---|
| `GET /api/qa/v1/batches` | every batch: id, status, item count, approved count, run time |
| `GET /api/qa/v1/batches/{batchId}` | the batch's current records with each stage's status and note |
| `GET /api/qa/v1/batches/{batchId}/records/{conceptId}` | one record in full, with every source link |
| `GET /api/qa/v1/records?filter=…[&stage=…][&batch=…][&page=…]` | records matching a problem filter, 100 a page |
| `GET /api/qa/v1/substances/{bdsId}/pairs[?page=…]` | a substance's stored DDInter pairs, 50 a page |

Filters: `strength_missing`, `parse_partial`, `route_assumed`, `no_ddinter_data`, `unaligned`, `stage_warn` (optionally with `stage=dgda|substances|clinical|ddinter`), `stage_fail`.

## How keys are stored

- The host `.env` holds `QA_API_KEYS`: comma-separated `label:sha256hex` pairs, no spaces. Only the SHA-256 hash of each key is stored there, or anywhere; the key itself exists only with its holder.
- `label` names the holder (for example `qa-checker`): `a-z`, `0-9`, `_` and `-`, up to 32 characters, starting with a letter or a digit. Audit rows record the label, never the key or its hash.
- The hash is the 64-character lower-case hex SHA-256 of the key's exact characters.
- Empty or unset `QA_API_KEYS` means no env keys. The QA API is never disabled (spec §7.9.1 as amended, D68): a request that no key authenticates answers 401, whether or not `QA_API_KEYS` is set. A malformed value (a bad label or hash, a duplicate label or hash, an empty entry such as a trailing comma) makes every env key fail, the valid entries included, and the web container logs one line, `QA_API_KEYS invalid: entry {n}` (`n` counts entries from 1; the value is never logged). DB keys keep working, so a typo in `.env` never locks out every QA user.

## Create a key

On your own machine (not the host, so the key never lands in the host's shell history):

```sh
KEY=$(openssl rand -hex 32)          # 64 hex characters; this is the key you hand over
printf %s "$KEY" | shasum -a 256 | cut -d' ' -f1    # macOS; on Linux: printf %s "$KEY" | sha256sum | cut -d' ' -f1
```

`printf %s` matters: `echo` would hash a trailing newline too, and the key would never match. The second command prints the hash that goes into `.env`.

Hand the key to its holder once, through a channel that does not keep it (a password manager share, or read it out). Never commit it, never paste it into an issue, a PR, a chat channel or a log, and never put it in a config file under version control. The holder sets it as `INTELLIDRUGS_QA_KEY` for the QA MCP server, hosted at `https://drugdb.eliooo.org/api/qa/mcp` or local (`tools/qa-mcp/README.md`). Then `unset KEY` and close the terminal.

## Add it on the host

```sh
ssh ec2-user@<host>
cd ~/drugdb/deploy
cp .env .env.bak-$(date +%Y%m%d)       # keep a dated copy; it is chmod 600 like .env
vi .env                                 # QA_API_KEYS=qa-checker:<hash>   (append ,label:<hash> for another holder)
cd ~/drugdb/deploy && docker-compose up -d --no-deps web
```

- `docker-compose up -d --no-deps web` recreates only the web container. `--no-deps` matters: without it Compose also brings up `web`'s dependency chain (`api`, then the exited one-shot `flyway`). The API, the database, Caddy and the other sites on the host (`medscribe`, `baymax`, `medioo`, `n8n`) keep running and are never restarted (spec §12.4). No Caddy change is needed: the QA API is served by the existing web app.
- Delete the `.env.bak-*` copy once the change works.

## Check it

From your own machine, without putting the key on the command line:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://drugdb.eliooo.org/api/qa/v1/batches     # 401 without a key
read -rs KEY                                                                              # paste the key, then Enter
curl -s -H "Authorization: Bearer $KEY" https://drugdb.eliooo.org/api/qa/v1/batches | head -c 300; echo
unset KEY
```

A 200 answers `{"success":true,"data":{"batches":[…]},…}`. If a new env key stays 401 after the restart, check for the invalid-value line:

```sh
cd ~/drugdb/deploy && docker-compose logs --tail 200 web | grep 'QA_API_KEYS invalid'
```

## Rotate a key

Add the new key before removing the old one, so the holder is never locked out:

1. Create a new key and its hash (above).
2. Add it under a new label next to the old entry, for example `QA_API_KEYS=qa-checker:<old hash>,qa-checker-2:<new hash>`, and recreate the web container (`docker-compose up -d --no-deps web`).
3. Hand the new key over; the holder switches `INTELLIDRUGS_QA_KEY` and confirms a call works.
4. Remove the old entry and recreate the web container again.

## Revoke a key

Remove its entry from `QA_API_KEYS` (an empty value leaves no env keys) and recreate the web container only: `cd ~/drugdb/deploy && docker-compose up -d --no-deps web`. The key stops working on the first request after the restart.

## Self-service keys (DB keys)

- A QA team member (role `qa`), an engineer or a senior pharmacist creates a key on `https://drugdb.eliooo.org/review/qa`, names it (1–40 characters, for example the laptop or tool that uses it), copies it once, and revokes it there. Pharmacists and readers cannot. Invite a QA team member with role `qa` (`docs/runbooks/reviewer-invite.md`).
- A DB key is `idqa_` followed by 43 base64url characters. The web generates it and sends only its SHA-256 hash to the API, which stores it in `ops.qa_key` with the owner's email, the name, and the created, expires, revoked and last-used times. Nobody, the team included, can see a key again after the page shows it once.
- A key expires 90 days after it is created; there is no renewal (make a new one). Each owner may have at most 5 active keys and create at most 10 in any 24 hours.
- A DB key authenticates the QA API and the hosted MCP server exactly like an env key, with the label `key.{id}` in place of an env label: the same 60 requests a minute and the same `qa_read` rows (target `key.{id}/{route}`). It fails from the next request on when it is expired or revoked, or when its owner is removed from `REVIEWERS` or no longer has role `qa`, `engineer` or `senior`.
- To find who owns a key seen in the audit rows, read `ops.qa_key` by the id after `key.`, in a read-only transaction as below. Key rows are never deleted.

## Revoke a DB key for its owner

The owner revokes their own keys on `/review/qa`. When the team must do it (a lost laptop, a key pasted somewhere), the fastest way to stop **every** key of an account is to remove the account from `REVIEWERS` (or change its role to `pharmacist`) and recreate the web container: its DB keys fail on the next request. To revoke one key and leave the account working, list the owner's keys first (read-only; it prints ids, names and times, never a hash):

```sh
cd ~/drugdb/deploy && docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db sh -c 'psql -v ON_ERROR_STOP=1 -v owner="$0" -U "$POSTGRES_USER" -d bddrug -At' 'their.address@example.com' <<'SQL'
SELECT id, name, created_at, expires_at, revoked_at, last_used_at FROM ops.qa_key WHERE owner_email = lower(:'owner') ORDER BY created_at DESC, id DESC;
SQL
```

Then revoke the one id. The statement sets `revoked_at` only while the key is not yet revoked and writes its `qa_key_revoked` audit row (outcome `team`, no actor) in the same statement; it prints the id and `INSERT 0 1` when it revoked the key, and only `INSERT 0 0` when the key was already revoked or does not exist:

```sh
cd ~/drugdb/deploy && docker-compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -v id="$0" -U "$POSTGRES_USER" -d bddrug -At' '42' <<'SQL'
WITH revoked AS (UPDATE ops.qa_key SET revoked_at = now() WHERE id = :id AND revoked_at IS NULL RETURNING id)
INSERT INTO ops.audit_event (event, target_type, target_id, outcome, request_id)
SELECT 'qa_key_revoked', 'qa_key', id::text, 'team', gen_random_uuid() FROM revoked RETURNING target_id;
SQL
```

A revocation is final: the database refuses to clear `revoked_at` or to delete a key row. The web needs no restart; the key fails on its next request.

## Limits and audit

- 60 requests per minute per key label (sliding window), an env label or a DB key's `key.{id}`, shared by the QA API and the hosted MCP server; every authenticated request counts, 400s included. Over the limit the answer is 429 with `Retry-After: 60`. The site-wide per-IP limit still applies first.
- Every call writes a `qa_read` row to `ops.audit_event`: target `{label}/{route}` (or `{route}` without a valid key), the outcome (`ok` or the lower-cased error code) and the request id that the response's `metadata.requestId` also carries. A 200 is sent only after its row is written; if the audit write fails the caller gets 502. 401 rows are throttled to one per minute per route and client, 429 rows to one per minute per label. Unknown QA paths write nothing. To read recent rows (read-only transaction):

```sh
cd ~/drugdb/deploy && docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d bddrug -At' <<'SQL'
SELECT at, target_id, outcome, request_id FROM ops.audit_event WHERE event = 'qa_read' ORDER BY at DESC LIMIT 50;
SQL
```

## Answers a caller may see

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_QUERY` | a bad id, filter, stage, batch or page, or a parameter the route does not take; `errors[0].field` names it |
| 401 | `UNAUTHORIZED` | no key, a malformed header, an unknown, expired or revoked key, or a DB key whose owner no longer has QA access (it never says which) |
| 404 | `NOT_FOUND` | the path is unknown, or (with `field`) the batch, record or substance is unknown |
| 429 | `RATE_LIMITED` | over 60 a minute for this key |
| 502 | `UNAVAILABLE` | the internal API failed, timed out or answered unexpectedly (a DB key's check included), or the audit write failed |
