import json, pathlib
import psycopg, pytest
from testcontainers.postgres import PostgresContainer
from bddrug_etl.load.batches import read_batch_file, run_batch

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIX = json.loads((pathlib.Path(__file__).parent / "fixtures/tericin.json").read_text())

class FakeClient:
    def get_concept(self, owner, source, concept_id):
        return FIX if concept_id == FIX["id"] else None

@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c

def test_read_batch_file_ignores_comments_blanks_and_duplicates(tmp_path):
    f = tmp_path / "0001-pilot.txt"
    f.write_text("# pilot\n341-0160-020--tericin\n\n  341-0160-020--tericin  # dup\nabc\n")
    assert read_batch_file(f) == ["341-0160-020--tericin", "abc"]

def test_missing_concept_is_recorded_as_issue_and_rest_loads(conn):
    stats = run_batch(conn, FakeClient(), "0001-pilot", [FIX["id"], "typo-id"])
    assert (stats.seen, stats.loaded) == (1, 1)
    rows = dict(conn.execute("SELECT concept_id, review FROM ops.batch_item WHERE batch_id='0001-pilot'").fetchall())
    assert rows == {FIX["id"]: "pending", "typo-id": "issue"}
    note = conn.execute("SELECT note FROM ops.batch_item WHERE concept_id='typo-id'").fetchone()[0]
    assert note == "not found at source"
    assert conn.execute("SELECT item_count, status FROM ops.batch WHERE batch_id='0001-pilot'").fetchone() == (2, "in_review")

class MultiClient:
    def __init__(self, payloads):
        self.payloads = payloads

    def get_concept(self, owner, source, concept_id):
        return self.payloads.get(concept_id)


def test_non_drug_concept_is_recorded_as_issue(conn):
    ingredient = {**FIX, "id": "ingredient-1", "concept_class": "Ingredient"}
    run_batch(conn, MultiClient({FIX["id"]: FIX, "ingredient-1": ingredient}), "0002-mixed", [FIX["id"], "ingredient-1"])
    rows = dict(conn.execute("SELECT concept_id, review FROM ops.batch_item WHERE batch_id='0002-mixed'").fetchall())
    assert rows == {FIX["id"]: "pending", "ingredient-1": "issue"}
    note = conn.execute("SELECT note FROM ops.batch_item WHERE concept_id='ingredient-1'").fetchone()[0]
    assert note == "not a registered Drug product"


def test_batch_run_is_atomic(conn):
    atomic = {**FIX, "id": "atomic-only-1"}
    with pytest.raises(psycopg.Error):
        run_batch(conn, MultiClient({"atomic-only-1": atomic}), None, ["atomic-only-1"])  # NULL batch_id fails after load_products
    conn.rollback()
    assert conn.execute("SELECT count(*) FROM curated.brand_product WHERE concept_id='atomic-only-1'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM raw.ocl_concept WHERE concept_id='atomic-only-1'").fetchone()[0] == 0


def stage_rows(conn, batch_id):
    return {c: (st, note) for c, st, note in conn.execute(
        "SELECT concept_id, status, note FROM ops.stage_result WHERE batch_id = %s AND stage = 'dgda'", (batch_id,)).fetchall()}


def test_run_batch_writes_dgda_stage_results(conn):
    ingredient = {**FIX, "id": "ingredient-2", "concept_class": "Ingredient"}
    run_batch(conn, MultiClient({FIX["id"]: FIX, "ingredient-2": ingredient}), "0003-stages",
              [FIX["id"], "ingredient-2", "gone-1"])
    assert stage_rows(conn, "0003-stages") == {
        FIX["id"]: ("ok", ""),
        "ingredient-2": ("fail", "not a registered Drug product"),
        "gone-1": ("fail", "not found at source"),
    }


def test_run_batch_rerun_replaces_dgda_stage_results(conn):
    run_batch(conn, MultiClient({}), "0004-rerun", [FIX["id"]])
    assert stage_rows(conn, "0004-rerun") == {FIX["id"]: ("fail", "not found at source")}
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0004-rerun", [FIX["id"]])
    assert stage_rows(conn, "0004-rerun") == {FIX["id"]: ("ok", "")}
    assert conn.execute("SELECT count(*) FROM ops.stage_result WHERE batch_id = '0004-rerun'").fetchone()[0] == 1


# --- V4: run_batch upserts instead of delete+recreate, so review history survives re-runs ---

DECIDE = ("INSERT INTO ops.review_decision (batch_id, concept_id, decision, reviewer_email, reviewer_role) "
          "VALUES (%s, %s, 'ok', 'r@example.test', 'pharmacist')")


def items(conn, batch_id):
    return {c: (review, note) for c, review, note in conn.execute(
        "SELECT concept_id, review, note FROM ops.batch_item WHERE batch_id = %s", (batch_id,)).fetchall()}


def test_new_items_get_extracted_at(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0005-extracted", [FIX["id"], "gone-2"])
    assert conn.execute(
        "SELECT count(*) FROM ops.batch_item WHERE batch_id = '0005-extracted' AND extracted_at IS NULL"
    ).fetchone()[0] == 0


def test_unchanged_rerun_keeps_the_review_and_marks_what_left_the_file(conn):
    """§8.3.1: nothing the approval covered changed, so the review and the stamp stay; the note is still written."""
    keep = {**FIX, "id": "keep-1"}   # its own product: an approval here must not carry into the other tests' batches
    run_batch(conn, MultiClient({"keep-1": keep}), "0015-keep", ["keep-1", "keep-gone"])
    conn.execute("UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = '0015-keep' AND concept_id = 'keep-1'")
    conn.commit()
    before = conn.execute("SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0015-keep' AND concept_id = 'keep-1'").fetchone()[0]
    run_batch(conn, MultiClient({"keep-1": keep}), "0015-keep", ["keep-1"])
    assert items(conn, "0015-keep") == {"keep-1": ("ok", None), "keep-gone": ("issue", "removed from batch file")}
    assert conn.execute("SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0015-keep' AND concept_id = 'keep-1'"
                        ).fetchone()[0] == before


def test_rerun_updates_batch_row_and_reopens_review(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0006-batchrow", [FIX["id"], "gone-3"])
    first_run = conn.execute("SELECT run_at FROM ops.batch WHERE batch_id = '0006-batchrow'").fetchone()[0]
    conn.execute("UPDATE ops.batch SET status = 'approved' WHERE batch_id = '0006-batchrow'")
    conn.commit()
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0006-batchrow", [FIX["id"]])
    item_count, status, run_at = conn.execute(
        "SELECT item_count, status, run_at FROM ops.batch WHERE batch_id = '0006-batchrow'").fetchone()
    assert (item_count, status) == (1, "in_review")
    assert run_at > first_run


def test_rerun_keeps_issue_reason_for_items_still_failing(conn):
    run_batch(conn, MultiClient({}), "0007-issue", ["gone-4"])
    conn.execute(DECIDE, ("0007-issue", "gone-4"))
    conn.commit()
    before = conn.execute("SELECT extracted_at FROM ops.batch_item WHERE concept_id = 'gone-4'").fetchone()[0]
    run_batch(conn, MultiClient({}), "0007-issue", ["gone-4"])
    assert items(conn, "0007-issue") == {"gone-4": ("issue", "not found at source")}
    assert conn.execute("SELECT extracted_at FROM ops.batch_item WHERE concept_id = 'gone-4'").fetchone()[0] > before


def test_item_found_on_rerun_turns_pending(conn):
    run_batch(conn, MultiClient({}), "0008-recovered", [FIX["id"]])
    assert items(conn, "0008-recovered") == {FIX["id"]: ("issue", "not found at source")}
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0008-recovered", [FIX["id"]])
    assert items(conn, "0008-recovered") == {FIX["id"]: ("pending", None)}


def test_removed_item_without_decisions_or_snapshots_is_deleted_with_its_stage_results(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0009-removed", [FIX["id"]])
    # an item from before V6: no snapshot and no decision
    conn.execute("INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) "
                 "VALUES ('0009-removed', 'DGDA-Drugs', 'gone-5', now())")
    conn.execute("INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) "
                 "VALUES ('0009-removed', 'gone-5', 'dgda', 'fail', 'not found at source')")
    conn.commit()
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0009-removed", [FIX["id"]])
    assert items(conn, "0009-removed") == {FIX["id"]: ("pending", None)}
    assert stage_rows(conn, "0009-removed") == {FIX["id"]: ("ok", "")}


def test_removed_item_with_decisions_is_kept_and_marked(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0010-kept", [FIX["id"], "gone-6"])
    conn.execute(DECIDE, ("0010-kept", "gone-6"))
    conn.commit()
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0010-kept", [FIX["id"]])
    assert items(conn, "0010-kept") == {FIX["id"]: ("pending", None), "gone-6": ("issue", "removed from batch file")}
    assert conn.execute("SELECT count(*) FROM ops.review_decision WHERE batch_id = '0010-kept'").fetchone()[0] == 1
    assert stage_rows(conn, "0010-kept") == {FIX["id"]: ("ok", "")}  # dgda results describe the current file only


def test_rerun_clears_the_batch_stage_results_as_before(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0011-stale", [FIX["id"]])
    conn.execute("INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) "
                 "VALUES ('0011-stale', %s, 'substances', 'ok', '')", (FIX["id"],))
    conn.commit()
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0011-stale", [FIX["id"]])
    assert conn.execute("SELECT stage FROM ops.stage_result WHERE batch_id = '0011-stale'").fetchall() == [("dgda",)]


def snapshot_reasons(conn, batch_id, cid):
    return [r for (r,) in conn.execute(
        "SELECT reason FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s ORDER BY extracted_at",
        (batch_id, cid)).fetchall()]


def test_run_batch_writes_one_snapshot_per_item(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0012-snap", [FIX["id"], "gone-7"])
    assert snapshot_reasons(conn, "0012-snap", FIX["id"]) == ["run"]
    assert snapshot_reasons(conn, "0012-snap", "gone-7") == ["run"]
    payload = conn.execute("SELECT payload FROM ops.item_snapshot WHERE batch_id = '0012-snap' AND concept_id = %s",
                           (FIX["id"],)).fetchone()[0]
    assert payload["brand"]["trade_name"] == "Tericin"
    assert payload["stages"] == {"dgda": {"status": "ok", "note": ""}}


def test_removed_item_with_snapshot_is_kept_and_marked(conn):
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0013-snapkept", [FIX["id"], "gone-8"])   # gone-8 gets a snapshot
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0013-snapkept", [FIX["id"]])             # must not fail on the FK
    assert items(conn, "0013-snapkept") == {FIX["id"]: ("pending", None), "gone-8": ("issue", "removed from batch file")}
    assert snapshot_reasons(conn, "0013-snapkept", "gone-8") == ["run"]


def test_removed_item_readded_to_the_file_is_restamped_with_a_rerun_snapshot(conn):
    """Review Focus 4: removed, then back in a later run."""
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0014-back", [FIX["id"], "gone-9"])
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0014-back", [FIX["id"]])
    assert items(conn, "0014-back")["gone-9"] == ("issue", "removed from batch file")
    run_batch(conn, MultiClient({FIX["id"]: FIX}), "0014-back", [FIX["id"], "gone-9"])
    assert items(conn, "0014-back")["gone-9"] == ("issue", "not found at source")
    assert snapshot_reasons(conn, "0014-back", "gone-9") == ["run", "rerun"]
    assert snapshot_reasons(conn, "0014-back", FIX["id"]) == ["run"]   # unchanged on both re-runs: no stamp, no snapshot (§8.3.1)
