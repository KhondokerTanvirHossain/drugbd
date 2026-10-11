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

def test_rerun_resets_review_to_pending(conn):
    conn.execute("UPDATE ops.batch_item SET review='ok' WHERE concept_id=%s", (FIX["id"],))
    run_batch(conn, FakeClient(), "0001-pilot", [FIX["id"]])
    assert conn.execute("SELECT review FROM ops.batch_item WHERE batch_id='0001-pilot'").fetchall() == [("pending",)]


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
