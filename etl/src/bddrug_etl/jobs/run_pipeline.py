"""CLI: run the pipeline stages for one batch.

    bddrug-etl --batch FILE [--stages dgda,substances,clinical,ddinter]

Stages always run in the order dgda → substances → clinical → ddinter (default: all four).
Each stage runs in its own transaction together with its stage results, and is committed
before the next stage starts. A per-product ``fail`` never stops other products. An exception
from a stage rolls that stage back, marks every product in it ``fail``, stops the later stages
and makes the exit code non-zero. The final log line is
``batch=<id> dgda=<ok/warn/fail> substances=… clinical=… ddinter=…``.
"""
import argparse
import contextlib
import logging
import os
import pathlib
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import ContextManager

import httpx
import psycopg

from bddrug_etl.ddinter.client import DDInterClient
from bddrug_etl.http.snapshot import SnapshotHttp
from bddrug_etl.load.batches import read_batch_file, run_batch
from bddrug_etl.ocl.client import OclClient
from bddrug_etl.rxnav.client import RxNavClient
from bddrug_etl.stages.clinical import build_clinical_drugs
from bddrug_etl.stages.ddinter import map_and_load_ddinter
from bddrug_etl.stages.results import StageResult, write_stage_results
from bddrug_etl.stages.substances import build_substances

log = logging.getLogger("run_pipeline")

STAGES = ("dgda", "substances", "clinical", "ddinter")
SKIP_NOTE = "skipped: product not loaded from DGDA"
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


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="bddrug-etl", description="Run the BDDrug pipeline for one batch")
    parser.add_argument("--batch", type=pathlib.Path, required=True, help="batches/NNNN-name.txt")
    parser.add_argument("--stages", type=_stage_list, default=STAGES,
                        help=f"comma-separated subset of {','.join(STAGES)} (default: all, always run in that order)")
    return parser.parse_args(argv)


def _error_note(e: Exception) -> str:
    return f"error: {type(e).__name__}: {str(e)[:200]}"


def _batch_exists(conn: psycopg.Connection, batch_id: str) -> bool:
    return conn.execute("SELECT 1 FROM ops.batch WHERE batch_id = %s", (batch_id,)).fetchone() is not None


def _eligible(conn: psycopg.Connection, batch_id: str, ids: list[str]) -> list[str]:
    """Batch items that are loaded products and were not failed by their latest dgda result."""
    loaded = {r[0] for r in conn.execute(
        "SELECT concept_id FROM curated.brand_product WHERE concept_id = ANY(%s)", (ids,))}
    dgda_failed = {r[0] for r in conn.execute(
        "SELECT concept_id FROM ops.stage_result WHERE batch_id = %s AND stage = 'dgda' AND status = 'fail'",
        (batch_id,))}
    return [cid for cid in ids if cid in loaded and cid not in dgda_failed]


def _call_stage(stage: str, conn: psycopg.Connection, clients: Clients, ids: list[str]) -> list[StageResult]:
    if stage == "substances":
        return build_substances(conn, clients.rxnav, ids)
    if stage == "clinical":
        return build_clinical_drugs(conn, ids)
    return map_and_load_ddinter(conn, clients.ddinter, ids)


def _run_dgda(conn: psycopg.Connection, clients: Clients, batch_id: str, ids: list[str]) -> list[StageResult]:
    run_batch(conn, clients.ocl, batch_id, ids)  # one transaction incl. the 'dgda' results; commits itself
    rows = conn.execute(
        "SELECT concept_id, status, note FROM ops.stage_result WHERE batch_id = %s AND stage = 'dgda'", (batch_id,)
    ).fetchall()
    conn.commit()
    return [StageResult(cid, status, note) for cid, status, note in rows]


def _run_product_stage(conn: psycopg.Connection, clients: Clients, stage: str, batch_id: str,
                       targets: list[str], skipped: list[StageResult]) -> list[StageResult]:
    with conn.transaction():  # the stage's own transaction; its per-product savepoints nest inside
        results = _call_stage(stage, conn, clients, targets)
        write_stage_results(conn, batch_id, stage, results + skipped)
    return results + skipped


def _record_failure(conn: psycopg.Connection, stage: str, batch_id: str, targets: list[str],
                    skipped: list[StageResult], e: Exception) -> list[StageResult]:
    """Roll the stage back and mark every product in it ``fail``; skipped products keep their skip note."""
    results = skipped + [StageResult(cid, "fail", _error_note(e), {}) for cid in targets]
    try:
        conn.rollback()
        if _batch_exists(conn, batch_id):
            write_stage_results(conn, batch_id, stage, results)
        else:
            log.error("batch %s is not recorded in ops.batch; %s failures not written", batch_id, stage)
        conn.commit()
    except psycopg.Error:
        log.exception("could not record %s failures for batch %s", stage, batch_id)
    return results


def run_pipeline(conn: psycopg.Connection, clients: Clients, batch_id: str, ids: list[str],
                 stages: tuple[str, ...] = STAGES) -> tuple[dict[str, list[StageResult]], bool]:
    """Run ``stages`` in canonical order, committing after each one.

    Returns (results of every stage that ran, True when no stage raised).
    """
    done: dict[str, list[StageResult]] = {}
    if "dgda" not in stages and not _batch_exists(conn, batch_id):
        conn.rollback()
        log.error("batch %s has not been loaded; run the dgda stage first", batch_id)
        return done, False
    conn.commit()  # start each stage from an idle connection
    for stage in stages:
        targets, skipped = ids, []
        try:
            if stage == "dgda":
                done[stage] = _run_dgda(conn, clients, batch_id, ids)
                continue
            targets = _eligible(conn, batch_id, ids)
            keep = set(targets)
            skipped = [StageResult(cid, "fail", SKIP_NOTE, {}) for cid in ids if cid not in keep]
            conn.commit()  # end the read-only eligibility transaction
            done[stage] = _run_product_stage(conn, clients, stage, batch_id, targets, skipped)
        except Exception as e:  # stage-level failure: roll back, fail every product, stop the later stages
            log.exception("stage %s failed for batch %s", stage, batch_id)
            done[stage] = _record_failure(conn, stage, batch_id, targets, skipped, e)
            return done, False
    return done, True


def _counts(results: list[StageResult] | None) -> str:
    if results is None:
        return "-"
    n = {s: sum(r.status == s for r in results) for s in ("ok", "warn", "fail")}
    return f"{n['ok']}/{n['warn']}/{n['fail']}"


def summary_line(batch_id: str, done: dict[str, list[StageResult]]) -> str:
    return f"batch={batch_id} " + " ".join(f"{s}={_counts(done.get(s))}" for s in STAGES)


def main(argv: list[str] | None = None, *,
         connect: Callable[[], psycopg.Connection] | None = None,
         client_factory: ClientFactory = default_clients) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = _parse_args(argv)
    ids = read_batch_file(args.batch)
    batch_id = args.batch.stem
    connect = connect or (lambda: psycopg.connect(os.environ.get("DATABASE_URL", "")))
    with connect() as conn, client_factory(conn) as clients:
        done, ok = run_pipeline(conn, clients, batch_id, ids, args.stages)
    log.info("%s", summary_line(batch_id, done))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
