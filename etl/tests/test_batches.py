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
