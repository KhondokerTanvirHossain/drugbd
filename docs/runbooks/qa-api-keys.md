# QA API keys: create, hand over, rotate, revoke

The QA API is a read-only, key-gated JSON API served by the web app under `https://drugdb.eliooo.org/api/qa/v1/` (spec §7.9). It exists for the product owner's other project, where another LLM re-checks our data against its sources and reports mismatches. It reads what the reviewer desk reads, unapproved records included, so every key is a credential to unreviewed data. It never returns an email or a reviewer note, and it writes nothing but its own `qa_read` audit rows.

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
- Empty or unset `QA_API_KEYS` disables the QA API: every `/api/qa` path answers 404. A malformed value (a bad label or hash, a duplicate label or hash, an empty entry such as a trailing comma) also disables it, and the web container logs one line, `QA_API_KEYS invalid: entry {n}` (`n` counts entries from 1; the value is never logged).

## Create a key

On your own machine (not the host, so the key never lands in the host's shell history):

```sh
KEY=$(openssl rand -hex 32)          # 64 hex characters; this is the key you hand over
printf %s "$KEY" | shasum -a 256 | cut -d' ' -f1    # macOS; on Linux: printf %s "$KEY" | sha256sum | cut -d' ' -f1
```

`printf %s` matters: `echo` would hash a trailing newline too, and the key would never match. The second command prints the hash that goes into `.env`.

Hand the key to its holder once, through a channel that does not keep it (a password manager share, or read it out). Never commit it, never paste it into an issue, a PR, a chat channel or a log, and never put it in a config file under version control. The holder sets it as `INTELLIDRUGS_QA_KEY` for the QA MCP server (`tools/qa-mcp/README.md`). Then `unset KEY` and close the terminal.

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
curl -s -o /dev/null -w '%{http_code}\n' https://drugdb.eliooo.org/api/qa/v1/batches     # 401: enabled; 404: disabled
read -rs KEY                                                                              # paste the key, then Enter
curl -s -H "Authorization: Bearer $KEY" https://drugdb.eliooo.org/api/qa/v1/batches | head -c 300; echo
unset KEY
```

A 200 answers `{"success":true,"data":{"batches":[…]},…}`. If every path stays 404 after the restart, check for the invalid-value line:

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

Remove its entry from `QA_API_KEYS` (or empty the value to disable the QA API) and recreate the web container only: `cd ~/drugdb/deploy && docker-compose up -d --no-deps web`. The key stops working on the first request after the restart.

## Limits and audit

- 60 requests per minute per key label (sliding window); every authenticated request counts, 400s included. Over the limit the answer is 429 with `Retry-After: 60`. The site-wide per-IP limit still applies first.
- Every call writes a `qa_read` row to `ops.audit_event`: target `{label}/{route}` (or `{route}` without a valid key), the outcome (`ok` or the lower-cased error code) and the request id that the response's `metadata.requestId` also carries. A 200 is sent only after its row is written; if the audit write fails the caller gets 502. 401 rows are throttled to one per minute per route and client, 429 rows to one per minute per label. A disabled API writes nothing. To read recent rows (read-only transaction):

```sh
cd ~/drugdb/deploy && docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d bddrug -At' <<'SQL'
SELECT at, target_id, outcome, request_id FROM ops.audit_event WHERE event = 'qa_read' ORDER BY at DESC LIMIT 50;
SQL
```

## Answers a caller may see

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_QUERY` | a bad id, filter, stage, batch or page, or a parameter the route does not take; `errors[0].field` names it |
| 401 | `UNAUTHORIZED` | no key, a malformed header or an unknown key (it never says which) |
| 404 | `NOT_FOUND` | the API is disabled, the path is unknown, or (with `field`) the batch, record or substance is unknown |
| 429 | `RATE_LIMITED` | over 60 a minute for this key |
| 502 | `UNAVAILABLE` | the internal API failed, timed out or answered unexpectedly, or the audit write failed |
