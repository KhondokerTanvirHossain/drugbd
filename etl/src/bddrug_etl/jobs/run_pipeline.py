"""CLI: run the pipeline stages for one batch, or for some of its items.

    bddrug-etl --batch FILE [--stages dgda,substances,clinical,ddinter] [--concept ID ...] [--ddinter-chunk N]

Stages always run in the order dgda → substances → clinical → ddinter (default: all four).
Each stage runs in its own transaction together with its stage results, and is committed
before the next stage starts.
Every stage settles the records it processed last in its transaction (spec §8.3.1, ``load.batches.settle``): a record is
stamped (``extracted_at``, review back to ``pending``) only when something its approval covered changed, or when its DGDA
load failed or recovered, or it came back into the batch file. The substances and DDInter stages also write rows shared
by every product with that substance; a product that shows a changed substance-level row is re-checked the same way. A
product listed again in a new batch with an unchanged view carries its approval. Each stage logs how many records it
re-opened (``re-opened N record(s)``), any carried approvals, and the ``--reopen`` targets it skipped.
A per-product ``fail`` never stops other products. An exception from a stage rolls that stage back, marks every
product in it ``fail``, stops the later stages and makes the exit code non-zero.

The DDInter stage is planned once for the whole run, then commits every ``--ddinter-chunk`` products
(default 5): each chunk's curated rows, stage results and review stamps go in one transaction. An
exception that escapes the per-product isolation rolls back only the current chunk: the product being
processed (or, when the chunk's own bookkeeping failed, every product of the chunk) gets
``error: <Type>: <msg>`` (one line: ``results.error_note``), every other product not yet committed gets
``not run: stage aborted at chunk N``, and the earlier chunks stay committed.

``--concept ID`` (repeatable) re-runs only those items of an already loaded batch: their dgda load,
stage results and review stamps are rewritten, the other items are left untouched. An ID that is not in
the batch file is a usage error (exit code 2); one that is in the file but not yet an item of the loaded
batch needs a full run first (exit code 1, nothing written).

Every run that started a stage appends ``ops.batch_run(batch_id, stages, counts, concept_ids)``: ``stages`` as
asked, ``counts`` = ``{stage: {ok, warn, fail}}`` for each stage that ran, ``concept_ids`` empty for a full run.
The final log line is ``batch=<id> dgda=<ok/warn/fail> substances=… clinical=… ddinter=…``.

Every invocation has one ``run_id`` (logged at start). Every stamp writes an ``ops.item_snapshot`` row with it, in the
stamping transaction, after that stage's results; an unchanged record is not stamped and gets no snapshot.

``--reopen`` stamps the named targets whatever changed, never their dependents, and skips a target that is approved
(``skipped: approved, --reopen not confirmed``, §13.1 Q12).
"""
import argparse
import contextlib
import logging
import os
import pathlib
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import ContextManager

import httpx
import psycopg
from psycopg.types.json import Jsonb

from bddrug_etl.ddinter.client import DDInterClient
from bddrug_etl.http.snapshot import SnapshotHttp
from bddrug_etl.load.batches import REOPEN_SKIPPED, Settled, read_batch_file, run_batch, run_batch_items, settle
from bddrug_etl.ocl.client import OclClient
from bddrug_etl.rxnav.client import RxNavClient
from bddrug_etl.stages.clinical import build_clinical_drugs
from bddrug_etl.stages.ddinter import plan_ddinter
from bddrug_etl.stages.results import SharedChanges, StageResult, error_note, write_stage_results
from bddrug_etl.stages.substances import build_substances

log = logging.getLogger("run_pipeline")

STAGES = ("dgda", "substances", "clinical", "ddinter")
SKIP_NOTE = "skipped: product not loaded from DGDA"
NOT_RUN_NOTE = "not run: stage aborted at chunk {}"
DDINTER_CHUNK = 5
OCL_USER_AGENT = "bddrug-etl/0.1 (+niramoy)"
HTTP_TIMEOUT_S = 60.0


@dataclass(frozen=True)
class Clients:
    ocl: OclClient
    rxnav: RxNavClient
    ddinter: DDInterClient


ClientFactory = Callable[[psycopg.Connection], ContextManager[Clients]]


@contextlib.contextmanager
def default_clients(conn: psycopg.Connection) -> Iterator[Clients]:
    """Live clients. RxNav and DDInter responses are snapshotted on ``conn`` (inside the stage's transaction)."""
    base = os.environ.get("OCL_BASE_URL", "https://api.tr.ocl.dghs.gov.bd")
    with httpx.Client(headers={"User-Agent": OCL_USER_AGENT}) as ocl_http, \
            httpx.Client(timeout=HTTP_TIMEOUT_S) as rxnav_http, \
            httpx.Client(follow_redirects=True, timeout=HTTP_TIMEOUT_S) as ddinter_http:
        yield Clients(
            ocl=OclClient(base, ocl_http),
            rxnav=RxNavClient(SnapshotHttp(conn, "rxnav", rxnav_http, min_interval_s=0.1)),
            ddinter=DDInterClient(SnapshotHttp(conn, "ddinter2", ddinter_http, min_interval_s=1.0)),
        )


def _stage_list(value: str) -> tuple[str, ...]:
    asked = [s.strip() for s in value.split(",") if s.strip()]
    unknown = [s for s in asked if s not in STAGES]
    if unknown or not asked:
        raise argparse.ArgumentTypeError(f"unknown stage(s) {', '.join(unknown) or '(none)'}; choose from {','.join(STAGES)}")
    return tuple(s for s in STAGES if s in asked)  # canonical order, de-duplicated


def _positive_int(value: str) -> int:
    try:
        n = int(value)
    except ValueError:
        n = 0
    if n < 1:
        raise argparse.ArgumentTypeError(f"must be a positive integer, got {value!r}")
    return n


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="bddrug-etl", description="Run the BDDrug pipeline for one batch")
    parser.add_argument("--batch", type=pathlib.Path, required=True, help="batches/NNNN-name.txt")
    parser.add_argument("--stages", type=_stage_list, default=STAGES,
                        help=f"comma-separated subset of {','.join(STAGES)} (default: all, always run in that order)")
    parser.add_argument("--concept", action="append", default=[], metavar="ID",
                        help="re-run only this item of the (already loaded) batch; repeatable")
    parser.add_argument("--ddinter-chunk", type=_positive_int, default=DDINTER_CHUNK, metavar="N",
                        help=f"commit the DDInter stage every N products (default {DDINTER_CHUNK})")
    return parser


def _batch_exists(conn: psycopg.Connection, batch_id: str) -> bool:
    return conn.execute("SELECT 1 FROM ops.batch WHERE batch_id = %s", (batch_id,)).fetchone() is not None


def _not_items(conn: psycopg.Connection, batch_id: str, ids: list[str]) -> list[str]:
    known = {r[0] for r in conn.execute(
        "SELECT concept_id FROM ops.batch_item WHERE batch_id = %s AND concept_id = ANY(%s)", (batch_id, ids))}
    return [cid for cid in ids if cid not in known]


def _eligible(conn: psycopg.Connection, batch_id: str, ids: list[str]) -> list[str]:
    """Batch items that are loaded products and were not failed by their latest dgda result."""
    loaded = {r[0] for r in conn.execute(
        "SELECT concept_id FROM curated.brand_product WHERE concept_id = ANY(%s)", (ids,))}
    dgda_failed = {r[0] for r in conn.execute(
        "SELECT concept_id FROM ops.stage_result WHERE batch_id = %s AND stage = 'dgda' AND status = 'fail'",
        (batch_id,))}
    return [cid for cid in ids if cid in loaded and cid not in dgda_failed]


class _StageAborted(Exception):
    """A chunked stage stopped part-way; ``results`` holds every product's result (already written)."""

    def __init__(self, results: list[StageResult]):
        super().__init__("stage aborted")
        self.results = results


def _call_stage(stage: str, conn: psycopg.Connection, clients: Clients, ids: list[str],
                changes: SharedChanges) -> list[StageResult]:
    if stage == "substances":
        return build_substances(conn, clients.rxnav, ids, changes)
    return build_clinical_drugs(conn, ids)  # product rows and new clinical drugs; never changes an existing one


def _log_settled(stage: str, batch_id: str, s: Settled) -> None:
    reopened = ": " + ", ".join(f"{b}/{c}" for b, c in s.reopened) if s.reopened else ""
    log.info("stage %s for batch %s re-opened %d record(s)%s", stage, batch_id, len(s.reopened), reopened)
    if s.carried:
        log.info("stage %s for batch %s carried the approval of %d record(s): %s", stage, batch_id, len(s.carried),
                 ", ".join(f"{b}/{c}" for b, c in s.carried))
    for cid in s.skipped:
        log.info("stage %s for batch %s: %s %s", stage, batch_id, cid, REOPEN_SKIPPED)


def _settle(conn: psycopg.Connection, stage: str, batch_id: str, ids: list[str], changes: SharedChanges,
            run_id: uuid.UUID, reopen: bool) -> None:
    """Settle ``ids`` and every other product showing a changed substance row (last, in the caller's transaction)."""
    _log_settled(stage, batch_id, settle(conn, batch_id, ids, changes, run_id, reopen=reopen))


def _run_dgda(conn: psycopg.Connection, clients: Clients, batch_id: str, ids: list[str],
              subset: bool, run_id: uuid.UUID, reopen: bool) -> list[StageResult]:
    # one transaction incl. the 'dgda' results and snapshots; commits itself. A subset never goes through run_batch,
    # which would treat every other item as removed from the batch file.
    stats = (run_batch_items if subset else run_batch)(conn, clients.ocl, batch_id, ids, run_id, reopen=reopen)
    _log_settled("dgda", batch_id, stats.settled)
    rows = conn.execute(
        """SELECT concept_id, status, note FROM ops.stage_result
           WHERE batch_id = %s AND stage = 'dgda' AND concept_id = ANY(%s)""", (batch_id, ids)
    ).fetchall()
    conn.commit()
    return [StageResult(cid, status, note) for cid, status, note in rows]


def _run_product_stage(conn: psycopg.Connection, clients: Clients, stage: str, batch_id: str,
                       targets: list[str], skipped: list[StageResult], run_id: uuid.UUID,
                       reopen: bool) -> list[StageResult]:
    with conn.transaction():  # the stage's own transaction; its per-product savepoints nest inside
        changes = SharedChanges()
        results = _call_stage(stage, conn, clients, targets, changes)
        write_stage_results(conn, batch_id, stage, results + skipped)
        _settle(conn, stage, batch_id, targets, changes, run_id, reopen)  # last: settle under the reopen rule
    return results + skipped


def _run_ddinter(conn: psycopg.Connection, clients: Clients, batch_id: str, targets: list[str],
                 skipped: list[StageResult], chunk_size: int, run_id: uuid.UUID, reopen: bool) -> list[StageResult]:
    """Plan the whole run once, then commit every ``chunk_size`` products (see the module docstring)."""
    with conn.transaction():  # planning (and the drug-list snapshot) plus the skipped products' results
        plan = plan_ddinter(conn, clients.ddinter, targets) if targets else None
        write_stage_results(conn, batch_id, "ddinter", skipped)
    chunks = [targets[i:i + chunk_size] for i in range(0, len(targets), chunk_size)]
    results: list[StageResult] = []
    for n, chunk in enumerate(chunks, start=1):
        current: str | None = None
        try:
            with conn.transaction():  # the chunk's transaction; per-product savepoints nest inside
                chunk_results, changes = [], SharedChanges()
                for cid in chunk:
                    current = cid
                    chunk_results.append(plan.process(conn, cid, changes))
                current = None
                write_stage_results(conn, batch_id, "ddinter", chunk_results)
                _settle(conn, "ddinter", batch_id, chunk, changes, run_id, reopen)  # last: settle under the reopen rule
        except Exception as e:
            log.exception("stage ddinter aborted at chunk %d for batch %s", n, batch_id)
            # the product that raised (or the whole chunk, when its bookkeeping raised) gets the error;
            # every other product without committed work from this run was not run
            raised = chunk if current is None else [current]
            uncommitted = chunk + [cid for later in chunks[n:] for cid in later]
            failed = [StageResult(cid, "fail", error_note(e) if cid in raised else NOT_RUN_NOTE.format(n), {})
                      for cid in uncommitted]
            _write_failures(conn, "ddinter", batch_id, failed)
            raise _StageAborted(results + failed + skipped) from e
        results += chunk_results
    return results + skipped


def _write_failures(conn: psycopg.Connection, stage: str, batch_id: str, results: list[StageResult]) -> None:
    """After a rollback, replace these products' results of ``stage`` (best effort: the connection may be gone)."""
    try:
        conn.rollback()
        if _batch_exists(conn, batch_id):
            write_stage_results(conn, batch_id, stage, results)
        else:
            log.error("batch %s is not recorded in ops.batch; %s failures not written", batch_id, stage)
        conn.commit()
    except psycopg.Error:
        log.exception("could not record %s failures for batch %s", stage, batch_id)


def _record_failure(conn: psycopg.Connection, stage: str, batch_id: str, targets: list[str],
                    skipped: list[StageResult], e: Exception) -> list[StageResult]:
    """Roll the stage back and mark every product in it ``fail``; skipped products keep their skip note."""
    results = skipped + [StageResult(cid, "fail", error_note(e), {}) for cid in targets]
    _write_failures(conn, stage, batch_id, results)
    return results


def run_pipeline(conn: psycopg.Connection, clients: Clients, batch_id: str, ids: list[str],
                 stages: tuple[str, ...] = STAGES, *, subset: bool = False,
                 ddinter_chunk: int = DDINTER_CHUNK,
                 run_id: uuid.UUID | None = None,
                 reopen: bool = False) -> tuple[dict[str, list[StageResult]], bool]:
    """Run ``stages`` in canonical order, committing after each one (the DDInter stage after each chunk).

    ``subset``: ``ids`` are some items of an already loaded batch (``--concept``); only they are touched.
    ``run_id``: shared by every snapshot this call writes (a new one when None).
    ``reopen``: the engineer's --reopen (§8.3.1 item 5).
    Returns (results of every stage that ran, True when no stage raised).
    """
    run_id = run_id or uuid.uuid4()
    done: dict[str, list[StageResult]] = {}
    if (subset or "dgda" not in stages) and not _batch_exists(conn, batch_id):
        conn.rollback()
        log.error("batch %s has not been loaded; run %s first", batch_id,
                  "the full batch" if subset else "the dgda stage")
        return done, False
    if subset and (new := _not_items(conn, batch_id, ids)):
        conn.rollback()
        log.error("batch %s has no item %s yet; run the full batch first", batch_id, ", ".join(new))
        return done, False
    conn.commit()  # start each stage from an idle connection
    for stage in stages:
        targets, skipped = ids, []
        try:
            if stage == "dgda":
                done[stage] = _run_dgda(conn, clients, batch_id, ids, subset, run_id, reopen)
                continue
            targets = _eligible(conn, batch_id, ids)
            keep = set(targets)
            skipped = [StageResult(cid, "fail", SKIP_NOTE, {}) for cid in ids if cid not in keep]
            conn.commit()  # end the read-only eligibility transaction
            if stage == "ddinter":
                done[stage] = _run_ddinter(conn, clients, batch_id, targets, skipped, ddinter_chunk, run_id, reopen)
            else:
                done[stage] = _run_product_stage(conn, clients, stage, batch_id, targets, skipped, run_id, reopen)
        except _StageAborted as a:  # chunked stage: earlier chunks stay committed, results already written
            done[stage] = a.results
            return done, False
        except Exception as e:  # stage-level failure: roll back, fail every product, stop the later stages
            log.exception("stage %s failed for batch %s", stage, batch_id)
            done[stage] = _record_failure(conn, stage, batch_id, targets, skipped, e)
            return done, False
    return done, True


def _tally(results: list[StageResult]) -> dict[str, int]:
    return {s: sum(r.status == s for r in results) for s in ("ok", "warn", "fail")}


def _counts(results: list[StageResult] | None) -> str:
    if results is None:
        return "-"
    n = _tally(results)
    return f"{n['ok']}/{n['warn']}/{n['fail']}"


def summary_line(batch_id: str, done: dict[str, list[StageResult]]) -> str:
    return f"batch={batch_id} " + " ".join(f"{s}={_counts(done.get(s))}" for s in STAGES)


def record_batch_run(conn: psycopg.Connection, batch_id: str, stages: tuple[str, ...],
                     done: dict[str, list[StageResult]], concept_ids: list[str]) -> bool:
    """Append this run to ``ops.batch_run``: counts per stage that ran, for the items it processed."""
    counts = {s: _tally(done[s]) for s in stages if s in done}
    try:
        conn.rollback()  # every stage commits its own work; nothing pending is lost here
        conn.execute(
            "INSERT INTO ops.batch_run (batch_id, stages, counts, concept_ids) VALUES (%s, %s, %s, %s)",
            (batch_id, list(stages), Jsonb(counts), concept_ids),
        )
        conn.commit()
        return True
    except psycopg.Error:
        log.exception("could not record the run of batch %s in ops.batch_run", batch_id)
        return False


def main(argv: list[str] | None = None, *,
         connect: Callable[[], psycopg.Connection] | None = None,
         client_factory: ClientFactory = default_clients) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = _parser()
    args = parser.parse_args(argv)
    ids = read_batch_file(args.batch)
    batch_id = args.batch.stem
    run_id = uuid.uuid4()
    log.info("batch=%s run_id=%s", batch_id, run_id)
    selected: list[str] = []
    if args.concept:
        unknown = [cid for cid in dict.fromkeys(args.concept) if cid not in ids]
        if unknown:
            parser.error(f"--concept {', '.join(unknown)}: not in the batch file {args.batch}")  # exits 2
        wanted = set(args.concept)
        selected = [cid for cid in ids if cid in wanted]  # batch-file order, de-duplicated
    connect = connect or (lambda: psycopg.connect(os.environ.get("DATABASE_URL", "")))
    with connect() as conn, client_factory(conn) as clients:
        done, ok = run_pipeline(conn, clients, batch_id, selected or ids, args.stages,
                                subset=bool(selected), ddinter_chunk=args.ddinter_chunk, run_id=run_id)
        if done:  # a run refused before any stage started (batch or item not loaded) is not history
            ok = record_batch_run(conn, batch_id, args.stages, done, selected) and ok
    log.info("%s", summary_line(batch_id, done))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
