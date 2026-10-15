"""Batch runs: fetch an explicit list of DGDA concepts, load them, record per-item review status, and settle each item's
review under the reopen rule (spec §8.3.1): an item is stamped (re-opened) only when something its approval covered
changed, plus the three cases that are always stamped (a DGDA failure, a return to the batch file after removal, and an
engineer's --reopen of a non-approved target)."""
import pathlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime

import psycopg

from bddrug_etl.load.products import LoadStats, load_products
from bddrug_etl.load.snapshots import approval_view, build_payload, same_view, view_at, write_snapshots
from bddrug_etl.ocl.transform import concept_to_product
from bddrug_etl.stages.results import SharedChanges, StageResult, write_stage_results

OWNER, SOURCE = "MoHFW", "DGDA-Drugs"
NOT_FOUND, NOT_A_DRUG = "not found at source", "not a registered Drug product"
REMOVED = "removed from batch file"
REOPEN_SKIPPED = "skipped: approved, --reopen not confirmed"
_KEEP = object()


@dataclass(frozen=True)
class DgdaTargets:
    """What the dgda stage learned while upserting its items (consumed by ``settle``)."""
    new: frozenset[str] = frozenset()        # no item in this batch before this run
    readded: frozenset[str] = frozenset()    # back in the batch file after it was marked removed
    recovered: frozenset[str] = frozenset()  # its previous note was a DGDA failure and it loaded now
    issues: dict[str, str] = field(default_factory=dict)  # concept_id -> DGDA failure note


@dataclass
class Settled:
    """What one ``settle`` call wrote: every stamp, the stamps of items that already had one (re-opened), the carried
    approvals, and the --reopen targets left alone because they are approved."""
    stamped: list[tuple[str, str]] = field(default_factory=list)
    reopened: list[tuple[str, str]] = field(default_factory=list)
    carried: list[tuple[str, str]] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class BatchStats(LoadStats):
    settled: Settled = field(default_factory=Settled)


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


def _upsert_items(cur: psycopg.Cursor, batch_id: str, concept_ids: list[str], issues: dict[str, str]) -> DgdaTargets:
    """Insert the new items (no stamp yet: ``settle`` stamps them) and write the note of the items still in the file.

    §8.3.1 step 2: the note is written whether or not the item is stamped. An item that comes back into the file after it
    was marked removed keeps its marker here; ``settle`` clears it in the statement that stamps it (§8.3.1 item 5), so the
    approval made before the removal never counts again without a stamp in between."""
    cur.execute("SELECT concept_id, note FROM ops.batch_item WHERE batch_id = %s AND concept_id = ANY(%s)", (batch_id, concept_ids))
    existing = dict(cur.fetchall())
    new = [cid for cid in concept_ids if cid not in existing]
    readded = frozenset(cid for cid, note in existing.items() if note == REMOVED)
    recovered = frozenset(cid for cid, note in existing.items() if note in (NOT_FOUND, NOT_A_DRUG) and cid not in issues)
    if new:
        cur.executemany(
            """INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
               VALUES (%s, %s, %s, 'pending', %s, NULL)""",
            [(batch_id, SOURCE, cid, issues.get(cid)) for cid in new])
    kept = [cid for cid in concept_ids if cid in existing and cid not in readded]
    if kept:
        cur.executemany("UPDATE ops.batch_item SET source = %s, note = %s WHERE batch_id = %s AND concept_id = %s",
                        [(SOURCE, issues.get(cid), batch_id, cid) for cid in kept])
    return DgdaTargets(frozenset(new), readded, recovered, dict(issues))


def _upsert_batch(cur: psycopg.Cursor, batch_id: str, concept_ids: list[str], issues: dict[str, str]) -> DgdaTargets:
    """Upsert the batch and its items without deleting review history (ops.review_decision).

    The batch status is not forced: ``settle`` recomputes it (§8.3.1 item 6). Items no longer in the file are deleted only
    when nobody has reviewed them and they have no snapshot; the others stay, marked ``removed from batch file``. The
    batch's stage results are cleared, as the old delete-and-recreate did; this run's stages write them again.
    """
    cur.execute(
        """INSERT INTO ops.batch (batch_id, item_count) VALUES (%s, %s)
           ON CONFLICT (batch_id) DO UPDATE SET item_count = EXCLUDED.item_count, run_at = now()""",
        (batch_id, len(concept_ids)),
    )
    targets = _upsert_items(cur, batch_id, concept_ids, issues)
    # §8.1 item 6: a snapshot can never be deleted (append-only, NO ACTION foreign key), so an item that has one is
    # kept and marked removed, like an item with decisions.
    cur.execute(
        """DELETE FROM ops.batch_item bi
           WHERE bi.batch_id = %s AND NOT (bi.concept_id = ANY(%s))
             AND NOT EXISTS (SELECT 1 FROM ops.review_decision rd
                             WHERE rd.batch_id = bi.batch_id AND rd.concept_id = bi.concept_id)
             AND NOT EXISTS (SELECT 1 FROM ops.item_snapshot s
                             WHERE s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id)""",
        (batch_id, concept_ids),
    )
    cur.execute(
        "UPDATE ops.batch_item SET note = %s WHERE batch_id = %s AND NOT (concept_id = ANY(%s))",
        (REMOVED, batch_id, concept_ids),
    )
    cur.execute("DELETE FROM ops.stage_result WHERE batch_id = %s", (batch_id,))
    return targets


def _stamp(conn: psycopg.Connection, done: Settled, batch_id: str, cid: str, before: datetime | None, run_id: uuid.UUID, *,
           review: str, note=_KEEP, shared: bool = False, carried: dict | None = None) -> None:
    """Stamp ``extracted_at`` with ``clock_timestamp()`` (a decision recorded while this transaction was open saw the old
    data, so it must be older than the stamp), set the review, and write the snapshot, in the caller's transaction.
    With ``note``, the note is written in the same statement (the return to the file clears its marker here)."""
    if note is _KEEP:
        conn.execute("UPDATE ops.batch_item SET review = %s, extracted_at = clock_timestamp() WHERE batch_id = %s AND concept_id = %s",
                     (review, batch_id, cid))
    else:
        conn.execute("""UPDATE ops.batch_item SET review = %s, note = %s, extracted_at = clock_timestamp()
                        WHERE batch_id = %s AND concept_id = %s""", (review, note, batch_id, cid))
    write_snapshots(conn, [(batch_id, cid)], run_id, shared=shared, carried_from=carried)
    done.stamped.append((batch_id, cid))
    if before is not None:
        done.reopened.append((batch_id, cid))
    if carried is not None:
        done.carried.append((batch_id, cid))


def _unchanged(conn: psycopg.Connection, batch_id: str, cid: str, at: datetime | None) -> bool:
    then = view_at(conn, batch_id, cid, at)
    return then is not None and same_view(then, approval_view(build_payload(conn, batch_id, cid, at)))


def _approved_elsewhere(conn: psycopg.Connection, batch_id: str, cid: str) -> tuple[str, datetime] | None:
    """§8.3.1 item 8: the product's latest current item in another batch, when the gate (statusOf) reads it as ok."""
    row = conn.execute(
        """SELECT batch_id, extracted_at, review, note FROM ops.batch_item WHERE concept_id = %s AND batch_id <> %s
           ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1""", (cid, batch_id)).fetchone()
    if row is None or row[1] is None or row[2] != "ok" or row[3] == REMOVED:
        return None
    return row[0], row[1]


def _dependents(conn: psycopg.Connection, changes: SharedChanges, batch_id: str,
                targets: list[str]) -> list[tuple[str, str, datetime | None]]:
    """The latest current item of every other product whose ingredients carry a changed ``bds_id`` (the item the gate
    reads, never one marked removed). ``changes.ddinter_ids`` selects no one any more (§8.3.1 step 1): DDInter rows are
    not covered by an approval."""
    return conn.execute(
        """WITH products AS (
             SELECT DISTINCT bpi.concept_id
               FROM curated.brand_product_ingredient bpi
               JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
              WHERE xm.bds_id = ANY(%(bds)s::text[])
           ), latest AS (
             SELECT DISTINCT ON (bi.concept_id) bi.batch_id, bi.concept_id, bi.extracted_at, bi.note
               FROM ops.batch_item bi JOIN products p ON p.concept_id = bi.concept_id
              ORDER BY bi.concept_id, bi.extracted_at DESC NULLS LAST, bi.batch_id DESC
           )
           SELECT batch_id, concept_id, extracted_at FROM latest
            WHERE note IS DISTINCT FROM %(removed)s
              AND NOT (batch_id = %(batch)s AND concept_id = ANY(%(targets)s::text[]))
            ORDER BY batch_id, concept_id""",
        {"bds": sorted(changes.bds_ids), "removed": REMOVED, "batch": batch_id, "targets": list(targets)},
    ).fetchall()


def _recompute_batches(conn: psycopg.Connection, batch_ids: list[str]) -> None:
    """§8.3.1 item 6, as the API's recomputeBatch: approved when every current item is ok (and there is one)."""
    conn.execute(
        """UPDATE ops.batch b SET status = CASE
             WHEN EXISTS (SELECT 1 FROM ops.batch_item bi WHERE bi.batch_id = b.batch_id AND bi.note IS DISTINCT FROM %(removed)s)
              AND NOT EXISTS (SELECT 1 FROM ops.batch_item bi
                              WHERE bi.batch_id = b.batch_id AND bi.note IS DISTINCT FROM %(removed)s AND bi.review <> 'ok')
             THEN 'approved' ELSE 'in_review' END
           WHERE b.batch_id = ANY(%(ids)s)""",
        {"removed": REMOVED, "ids": batch_ids})


def settle(conn: psycopg.Connection, batch_id: str, targets: list[str], changes: SharedChanges | None = None,
           run_id: uuid.UUID | None = None, *, reopen: bool = False, dgda: DgdaTargets | None = None) -> Settled:
    """Spec §8.3.1: call it last in each stage's transaction, after that stage's results are written.

    Targets are locked first (items before any ops.batch row, the API's decision order). Per target: a DGDA failure is
    stamped ``issue`` with its reason; an item back in the file, or whose DGDA load recovered, is stamped ``pending``;
    with ``reopen`` an approved target is skipped (§13.1 Q12) and any other stamped ``pending``; otherwise the target is
    stamped only when its approval view differs from the view of its snapshot at its current stamp (or it has no stamp or
    snapshot there), and a new item of a product approved elsewhere with the same view carries that approval. Dependents
    of ``changes.bds_ids`` are stamped ``pending`` (``shared_change``) only when their view changed; never with ``reopen``.
    """
    run_id = run_id or uuid.uuid4()
    dgda = dgda or DgdaTargets()
    done = Settled()
    rows = {cid: (review, at) for cid, review, at in conn.execute(
        """SELECT concept_id, review, extracted_at FROM ops.batch_item
           WHERE batch_id = %s AND concept_id = ANY(%s) ORDER BY concept_id FOR UPDATE""",
        (batch_id, list(targets))).fetchall()}
    for cid in targets:
        if cid not in rows:
            continue
        review, at = rows[cid]
        if cid in dgda.issues:
            _stamp(conn, done, batch_id, cid, at, run_id, review="issue", note=dgda.issues[cid])
        elif cid in dgda.readded:
            _stamp(conn, done, batch_id, cid, at, run_id, review="pending", note=None)
        elif cid in dgda.recovered:
            _stamp(conn, done, batch_id, cid, at, run_id, review="pending")
        elif reopen:
            if review == "ok":
                done.skipped.append(cid)
            else:
                _stamp(conn, done, batch_id, cid, at, run_id, review="pending")
        elif not _unchanged(conn, batch_id, cid, at):
            origin = _approved_elsewhere(conn, batch_id, cid) if cid in dgda.new else None
            if origin is not None and _unchanged_since(conn, origin, batch_id, cid, at):
                _stamp(conn, done, batch_id, cid, at, run_id, review="ok",
                       carried={"batchId": origin[0], "extractedAt": origin[1].isoformat()})
            else:
                _stamp(conn, done, batch_id, cid, at, run_id, review="pending")
    if changes is not None and changes.bds_ids and not reopen:
        for b, cid, at in _dependents(conn, changes, batch_id, targets):
            if not _unchanged(conn, b, cid, at):
                _stamp(conn, done, b, cid, at, run_id, review="pending", shared=True)
    _recompute_batches(conn, sorted({batch_id} | {b for b, _ in done.stamped}))
    return done


def _unchanged_since(conn: psycopg.Connection, origin: tuple[str, datetime], batch_id: str, cid: str, at: datetime | None) -> bool:
    """The new item's view now equals the view the approved item's snapshot (at its stamp) recorded."""
    then = view_at(conn, origin[0], cid, origin[1])
    return then is not None and same_view(then, approval_view(build_payload(conn, batch_id, cid, at)))


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


def run_batch(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str],
              run_id: uuid.UUID | None = None, *, reopen: bool = False) -> BatchStats:
    """Load the batch, record its items and 'dgda' stage results, and settle them, in one transaction (committed here).

    Re-running a batch keeps its review history: see ``_upsert_batch`` and ``settle``.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        targets = _upsert_batch(cur, batch_id, concept_ids, issues)
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    settled = settle(conn, batch_id, concept_ids, None, run_id, reopen=reopen, dgda=targets)
    conn.commit()
    return BatchStats(stats.seen, stats.loaded, stats.skipped, settled)


def run_batch_items(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str],
                    run_id: uuid.UUID | None = None, *, reopen: bool = False) -> BatchStats:
    """Re-load only ``concept_ids`` of an already loaded batch (single-record re-run), committed here.

    Only these items are touched: their notes and 'dgda' results are rewritten and they are settled, in one transaction.
    The other items, the batch's ``item_count`` and ``run_at`` stay as they are. Never call ``run_batch`` with a subset:
    it would treat every other item as removed from the batch file.
    """
    stats, found, missing, not_products, issues = _load(conn, client, concept_ids)
    with conn.cursor() as cur:
        targets = _upsert_items(cur, batch_id, concept_ids, issues)
        cur.execute("DELETE FROM ops.stage_result WHERE batch_id = %s AND concept_id = ANY(%s)", (batch_id, concept_ids))
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    settled = settle(conn, batch_id, concept_ids, None, run_id, reopen=reopen, dgda=targets)
    conn.commit()
    return BatchStats(stats.seen, stats.loaded, stats.skipped, settled)
