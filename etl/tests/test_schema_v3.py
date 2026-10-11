import pathlib
import psycopg, pytest
from psycopg import errors
from testcontainers.postgres import PostgresContainer

ROOT = pathlib.Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c


def test_substance_ids_are_sequential_bds(conn):
    ids = [
        conn.execute("INSERT INTO curated.substance (preferred_name) VALUES (%s) RETURNING bds_id", (name,)).fetchone()[0]
        for name in ("Warfarin", "Paracetamol")
    ]
    conn.commit()
    assert ids == ["BDS-000001", "BDS-000002"]


def test_icd11_xm_code_is_unique(conn):
    conn.execute("INSERT INTO curated.substance (preferred_name) VALUES ('Xm test') RETURNING bds_id")
    bds = conn.execute("SELECT bds_id FROM curated.substance WHERE preferred_name='Xm test'").fetchone()[0]
    row = (bds, "ICD11_XM", "XM-DUP-1", "any", "dgda", "xm", 1.0)
    insert = "INSERT INTO curated.substance_code (bds_id, system, code, source, method, confidence) VALUES (%s,%s,%s,%s,%s,%s)"
    conn.execute(insert, (row[0], row[1], row[2], row[4], row[5], row[6]))
    conn.commit()
    with pytest.raises(errors.UniqueViolation):
        conn.execute(insert, (row[0], row[1], row[2], row[4], row[5], row[6]))
    conn.rollback()


def test_stage_result_rejects_unknown_stage(conn):
    conn.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES ('0003-v3', 0)")
    conn.commit()
    with pytest.raises(errors.CheckViolation):
        conn.execute(
            "INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) "
            "VALUES ('0003-v3', 'c1', 'foo', 'ok', '')"
        )
    conn.rollback()
