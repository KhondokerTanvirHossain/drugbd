"""CI guard over the committed batch files: no product in two batches, every product in the frozen queue."""
import pathlib

from bddrug_etl.queue import check_batches, read_queue_ids

ROOT = pathlib.Path(__file__).resolve().parents[2]
QUEUE = ROOT / "batches" / "queue" / "2026-10-17-dgda-popularity.tsv"


def test_no_product_is_in_two_batches_and_every_product_is_in_the_frozen_queue():
    queue = read_queue_ids(QUEUE)
    assert len(queue) == 39110
    r = check_batches(ROOT / "batches", queue)
    print(f"coverage: {r.covered} of {r.total} queue positions in a batch; first gap at {r.first_gap}")
    assert r.duplicates == {}, f"products in more than one batch file: {r.duplicates}"
    assert r.unknown == {}, f"batch ids missing from the frozen queue: {r.unknown}"
