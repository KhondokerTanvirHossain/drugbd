import pathlib
import psycopg, pytest
from psycopg import errors
from testcontainers.postgres import PostgresContainer

ROOT = pathlib.Path(__file__).resolve().parents[2]

CODE_INSERT = (
    "INSERT INTO curated.substance_code (bds_id, system, code, source, method, confidence) "
    "VALUES (%s, %s, %s, 'dgda', 'xm', %s)"
)


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c


def _new_substance(conn, name):
    bds = conn.execute(
        "INSERT INTO curated.substance (preferred_name) VALUES (%s) RETURNING bds_id", (name,)
    ).fetchone()[0]
    conn.commit()
    return bds


def test_substance_ids_are_sequential_bds(conn):
    ids = [_new_substance(conn, name) for name in ("Warfarin", "Paracetamol")]
    assert ids == ["BDS-000001", "BDS-000002"]


def test_sequences_are_bounded_at_six_digits(conn):
    for seq in ("curated.bds_seq", "curated.bdc_seq"):
        max_value, cycle = conn.execute(
            "SELECT max_value, cycle FROM pg_sequences WHERE schemaname || '.' || sequencename = %s", (seq,)
        ).fetchone()
        assert (max_value, cycle) == (999999, False), seq


def test_icd11_xm_code_is_unique_across_substances(conn):
    first = _new_substance(conn, "Xm first")
    second = _new_substance(conn, "Xm second")
    conn.execute(CODE_INSERT, (first, "ICD11_XM", "XM-DUP-1", 1.0))
    conn.commit()
    with pytest.raises(errors.UniqueViolation) as exc:
        conn.execute(CODE_INSERT, (second, "ICD11_XM", "XM-DUP-1", 1.0))
    assert exc.value.diag.constraint_name == "substance_code_xm_unique"
    conn.rollback()


def test_xm_uniqueness_index_is_partial_to_icd11_xm(conn):
    first = _new_substance(conn, "Rx first")
    second = _new_substance(conn, "Rx second")
    conn.execute(CODE_INSERT, (first, "RXCUI", "161", 1.0))
    conn.execute(CODE_INSERT, (second, "RXCUI", "161", 1.0))
    conn.commit()
    assert conn.execute(
        "SELECT count(*) FROM curated.substance_code WHERE code = '161' AND system = 'RXCUI'"
    ).fetchone()[0] == 2


@pytest.mark.parametrize("confidence", [1.5, -0.1])
def test_substance_code_confidence_is_within_zero_and_one(conn, confidence):
    bds = _new_substance(conn, f"Conf {confidence}")
    with pytest.raises(errors.CheckViolation):
        conn.execute(CODE_INSERT, (bds, "ATC", "N02BE01", confidence))
    conn.rollback()


def test_ddinter_pair_requires_ordered_ids(conn):
    with pytest.raises(errors.CheckViolation):
        conn.execute(
            "INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, partner_name_a, partner_name_b) "
            "VALUES ('DDI2', 'DDI1', 'major', 'B', 'A')"
        )
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
