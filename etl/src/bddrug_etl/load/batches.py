"""Batch runs: fetch an explicit list of DGDA concepts, load them, and record per-item review status."""
import pathlib

import psycopg

from bddrug_etl.load.products import LoadStats, load_products
from bddrug_etl.ocl.transform import concept_to_product
from bddrug_etl.stages.results import SharedChanges, StageResult, write_stage_results

OWNER, SOURCE = "MoHFW", "DGDA-Drugs"
NOT_FOUND, NOT_A_DRUG = "not found at source", "not a registered Drug product"
REMOVED = "removed from batch file"


def read_batch_file(path: pathlib.Path) -> list[str]:
    ids: list[str] = []
    for line in path.read_text().splitlines():
        concept_id = line.split("#", 1)[0].strip()
        if concept_id and concept_id not in ids:
            ids.append(concept_id)
    return ids


def _dgda_results(concept_ids: list[str], found: list[dict], missing: list[str], not_products: list[str]) -> list[StageResult]:
    """One 'dgda' stage result per requested concept, in request order: ok when loaded, else fail."""
    classes = {c["id"]: c.get("concept_class") for c in found}
    missing_set, not_set = set(missing), set(not_products)
    out = []
    for cid in concept_ids:
        if cid in missing_set:
            out.append(StageResult(cid, "fail", NOT_FOUND, {"source": SOURCE, "concept_class": None}))
        elif cid in not_set:
            out.append(StageResult(cid, "fail", NOT_A_DRUG, {"source": SOURCE, "concept_class": classes.get(cid)}))
        else:
            out.append(StageResult(cid, "ok", "", {"source": SOURCE, "concept_class": classes.get(cid)}))
    return out


def _upsert_items(cur: psycopg.Cursor, batch_id: str, concept_ids: list[str], issues: dict[str, str]) -> None:
    """(Re)extract these items now: review ``pending`` (or ``issue`` + reason), ``extracted_at = clock_timestamp()``."""
    cur.executemany(
        """INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
           VALUES (%s, %s, %s, %s, %s, clock_timestamp())
           ON CONFLICT (batch_id, concept_id) DO UPDATE
           SET source = EXCLUDED.source, review = EXCLUDED.review, note = EXCLUDED.note,
               extracted_at = clock_timestamp()""",
        [(batch_id, SOURCE, cid, "issue" if cid in issues else "pending", issues.get(cid)) for cid in concept_ids],
    )


def _upsert_batch(cur: psycopg.Cursor, batch_id: str, concept_ids: list[str], issues: dict[str, str]) -> None:
    """Upsert the batch and its items without deleting review history (ops.review_decision).

    Every item in the file is (re)extracted now (``clock_timestamp()``, not the transaction start, so
    a decision recorded while this transaction was open is older than the stamp): its review goes back to ``pending`` (or ``issue``
    with the reason when it could not be loaded). Items no longer in the file are deleted only when
    nobody has reviewed them; the others stay, marked ``removed from batch file``. The batch's stage
    results are cleared, as the old delete-and-recreate did; this run's stages write them again.
    """
    cur.execute(
        """INSERT INTO ops.batch (batch_id, item_count) VALUES (%s, %s)
           ON CONFLICT (batch_id) DO UPDATE
           SET item_count = EXCLUDED.item_count, run_at = now(), status = 'in_review'""",
        (batch_id, len(concept_ids)),
    )
    _upsert_items(cur, batch_id, concept_ids, issues)
    cur.execute(
        """DELETE FROM ops.batch_item bi
           WHERE bi.batch_id = %s AND NOT (bi.concept_id = ANY(%s))
             AND NOT EXISTS (SELECT 1 FROM ops.review_decision rd
                             WHERE rd.batch_id = bi.batch_id AND rd.concept_id = bi.concept_id)""",
        (batch_id, concept_ids),
    )
    cur.execute(
        "UPDATE ops.batch_item SET note = %s WHERE batch_id = %s AND NOT (concept_id = ANY(%s))",
        (REMOVED, batch_id, concept_ids),
    )
    cur.execute("DELETE FROM ops.stage_result WHERE batch_id = %s", (batch_id,))


def reopen_review(conn: psycopg.Connection, batch_id: str, concept_ids: list[str],
                  changes: SharedChanges | None = None) -> list[tuple[str, str]]:
    """Stamp ``extracted_at`` and put the items' review back to ``pending`` (Review Focus 3).

    Call it last, inside the same transaction as the curated writes for ``concept_ids``, so the stamp
    commits (or rolls back) with them. ``clock_timestamp()`` is used rather than ``now()``: a decision
    recorded while that transaction was open saw the old data, so it must be older than the stamp.
    The decision history (``ops.review_decision``) is untouched; the batches go back to ``in_review``.

    ``changes``: the shared rows this transaction changed (``SharedChanges``). Every other product that
    shows them is re-opened too (``_reopen_dependents``) and returned as (batch_id, concept_id) pairs.
    All item rows are locked before any ``ops.batch`` row, the same order as the API's decision
    transaction, so the two cannot deadlock.
    """
    if concept_ids:
        conn.execute(
            """UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
               WHERE batch_id = %s AND concept_id = ANY(%s)""",
            (batch_id, concept_ids),
        )
    others = _reopen_dependents(conn, changes, batch_id, concept_ids) if changes else []
    batches = sorted(({batch_id} if concept_ids else set()) | {b for b, _ in others})
    if batches:
        conn.execute("UPDATE ops.batch SET status = 'in_review' WHERE batch_id = ANY(%s)", (batches,))
    return others


def _reopen_dependents(conn: psycopg.Connection, changes: SharedChanges, batch_id: str,
                       targets: list[str]) -> list[tuple[str, str]]:
    """Re-open the batch item of every OTHER product that shows a shared row in ``changes`` (items only).

    Substance-level rows (names, codes, DDInter mappings, coverage, pairs, texts) are shared by every product
    with that substance, but approval is per batch record: without this, re-running product Y would change
    what anonymous visitors see for an approved product X with the same substance, unseen by a pharmacist.

    A product depends on a changed ``bds_id`` through its ICD-11 ingredients, and on a changed DDInter id through
    its substances' DDINTER mappings. For each dependent product only the item the approval gate reads is
    re-opened: the latest by ``extracted_at``, then ``batch_id`` (the API's ``ReviewSql.statusOf``). The
    targets in ``batch_id`` were just stamped by the caller (so that item is their latest) and are skipped.
    """
    rows = conn.execute(
        """WITH subs AS (
             SELECT unnest(%(bds)s::text[]) AS bds_id
             UNION
             SELECT bds_id FROM curated.substance_code WHERE system = 'DDINTER' AND code = ANY(%(dd)s::text[])
           ), products AS (
             SELECT DISTINCT bpi.concept_id
               FROM curated.brand_product_ingredient bpi
               JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
               JOIN subs ON subs.bds_id = xm.bds_id
           ), latest AS (
             SELECT DISTINCT ON (bi.concept_id) bi.batch_id, bi.concept_id
               FROM ops.batch_item bi JOIN products p ON p.concept_id = bi.concept_id
              ORDER BY bi.concept_id, bi.extracted_at DESC NULLS LAST, bi.batch_id DESC
           )
           UPDATE ops.batch_item bi SET review = 'pending', extracted_at = clock_timestamp()
             FROM latest l
            WHERE bi.batch_id = l.batch_id AND bi.concept_id = l.concept_id
              AND NOT (bi.batch_id = %(batch)s AND bi.concept_id = ANY(%(targets)s::text[]))
           RETURNING bi.batch_id, bi.concept_id""",
        {"bds": sorted(changes.bds_ids), "dd": sorted(changes.ddinter_ids), "batch": batch_id,
         "targets": list(targets)},
    ).fetchall()
    return sorted((b, c) for b, c in rows)


def _load(conn: psycopg.Connection, client, concept_ids: list[str]):
    """Fetch and load the concepts (not committed); returns (stats, found, missing, not_products, issues)."""
    found, missing = [], []
    for concept_id in concept_ids:
        concept = client.get_concept(OWNER, SOURCE, concept_id)
        (found.append(concept) if concept else missing.append(concept_id))
    stats = load_products(conn, found, source=SOURCE, commit=False)  # the caller's single commit keeps it atomic
    not_products = [c["id"] for c in found if concept_to_product(c) is None]
    issues = {**{cid: NOT_FOUND for cid in missing}, **{cid: NOT_A_DRUG for cid in not_products}}
    return stats, found, missing, not_products, issues


def run_batch(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str]) -> LoadStats:
    """Load the batch and record its items and 'dgda' stage results in one transaction (committed here).

    Re-running a batch keeps its review history: see ``_upsert_batch``.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        _upsert_batch(cur, batch_id, concept_ids, issues)
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    conn.commit()
    return stats


def run_batch_items(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str]) -> LoadStats:
    """Re-load only ``concept_ids`` of an already loaded batch (single-record re-run), committed here.

    Only these items are touched: they are re-extracted (``_upsert_items``), their stage results are
    cleared and their 'dgda' results written, all in one transaction. The other items, the batch's
    ``item_count`` and ``run_at`` stay as they are; the batch goes back to ``in_review``. Never call
    ``run_batch`` with a subset: it would treat every other item as removed from the batch file.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        _upsert_items(cur, batch_id, concept_ids, issues)
        cur.execute("UPDATE ops.batch SET status = 'in_review' WHERE batch_id = %s", (batch_id,))
        cur.execute("DELETE FROM ops.stage_result WHERE batch_id = %s AND concept_id = ANY(%s)",
                    (batch_id, concept_ids))
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    conn.commit()
    return stats
