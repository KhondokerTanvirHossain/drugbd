# Backfill DDInter pair links (D77, one-off)

Before D77 the DDInter stage dropped a pair's interaction id when DDInter's page for it was empty ("Interaction None, Management -, References -"). Those pairs showed no "Full record in DDInter 2.0" link, which the QA checker reported as `ddinter.link_missing` (291 findings on 0001-pilot and 0002, 09/11/2026). The stage now keeps the id (spec D77). This job gives the pairs stored before D77 the same link, **without re-running any batch**.

## What it changes

- It asks DDInter for every pair that has no interaction id and whose two DDInter entries are both mapped (`curated.substance_code`, system `DDINTER`): the interaction id from either drug's interact-with list, then the pair page.
- When the page is still empty, it writes that id to `curated.ddinter_pair.interaction_id`. Nothing else: no text, severity, action, name, review, decision, stamp or snapshot. The link is not part of a record's approval view (§8.3.1) nor of a pair's review content hash (§7.7), so no record goes back to review and no senior pair shows "changed".
- A pair whose page has a text now is only listed (`has text now, left for the next pipeline run`): its text is reviewable content, so the next pipeline run of a batch that holds it stores text and link together.
- DDInter is read at one request per second, like the pipeline, and every response is kept in `raw.http_snapshot`. Expect about 10 to 15 minutes for 300 pairs.
- One transaction, committed at the end. `--dry-run` reads and reports, then rolls back.

## Run it

On the host, after the release that contains D77 is deployed (the ETL image then has `bddrug-link-pairs`):

```sh
cd ~/drugdb/deploy
docker-compose --profile jobs run --rm --entrypoint bddrug-link-pairs etl --dry-run
docker-compose --profile jobs run --rm --entrypoint bddrug-link-pairs etl
```

The last log line is `linked=N has_text=N not_listed=N failed=N`. Exit code 1 means a DDInter read failed: nothing was written for those pairs, and running the job again later retries only the pairs still without an id. Running it twice is safe.

It starts no other container and touches no other service on the host.

## Check

- `GET /api/qa/v1/batches/{batchId}/records/{conceptId}` (or the MCP tool `get_record`): text-missing pairs now carry `link`.
- On the desk, a pair under "with no text in DDInter 2.0" shows "Full record in DDInter 2.0", which opens DDInter's empty page.
