"""CLI (D77, one-off): give the DDInter pairs stored before D77 the link that the DDInter stage now keeps.

    bddrug-link-pairs [--dry-run]

Before D77 the DDInter stage dropped a pair's interaction id when DDInter's page for it was empty ("Interaction None,
Management -"), so the pair showed no link. ``stages.ddinter.link_empty_pairs`` asks DDInter again for every unlinked
pair between two mapped entries and stores the id of each one whose page is still empty. It changes no text, severity,
review, decision or stamp, so no batch has to be re-run. A pair whose page has a text now is only listed: the next
pipeline run of a batch that holds it stores the text and the link together.

Everything runs in one transaction, committed at the end (``--dry-run`` rolls it back). The final log line is
``linked=N has_text=N not_listed=N failed=N``; the exit code is 1 when a DDInter read failed (run it again later).
"""
import argparse
import contextlib
import logging
import os
from collections.abc import Callable, Iterator
from typing import ContextManager

import httpx
import psycopg

from bddrug_etl.ddinter.client import DDInterClient
from bddrug_etl.http.snapshot import SnapshotHttp
from bddrug_etl.stages.ddinter import link_empty_pairs

log = logging.getLogger("link_pairs")
HTTP_TIMEOUT_S = 60.0

ClientFactory = Callable[[psycopg.Connection], ContextManager[DDInterClient]]


@contextlib.contextmanager
def default_client(conn: psycopg.Connection) -> Iterator[DDInterClient]:
    """The live DDInter client, paced and snapshotted exactly as the pipeline's (run_pipeline.default_clients)."""
    with httpx.Client(follow_redirects=True, timeout=HTTP_TIMEOUT_S) as http:
        yield DDInterClient(SnapshotHttp(conn, "ddinter2", http, min_interval_s=1.0))


def main(argv: list[str] | None = None, *,
         connect: Callable[[], psycopg.Connection] | None = None,
         client_factory: ClientFactory = default_client) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="bddrug-link-pairs", description=__doc__.split("\n", 1)[0])
    parser.add_argument("--dry-run", action="store_true", help="read DDInter and report, then roll everything back")
    args = parser.parse_args(argv)
    connect = connect or (lambda: psycopg.connect(os.environ.get("DATABASE_URL", "")))
    with connect() as conn, client_factory(conn) as client:
        stats = link_empty_pairs(conn, client)
        for a, b in stats.has_text:
            log.info("has text now, left for the next pipeline run: %s/%s", a, b)
        for a, b in stats.failed:
            log.warning("DDInter read failed: %s/%s", a, b)
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
    log.info("%slinked=%d has_text=%d not_listed=%d failed=%d", "dry run, rolled back: " if args.dry_run else "",
             len(stats.linked), len(stats.has_text), len(stats.not_listed), len(stats.failed))
    return 1 if stats.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
