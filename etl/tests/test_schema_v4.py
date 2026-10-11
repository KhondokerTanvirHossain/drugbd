"""V4: review decisions, flags, batch runs, scale indexes, and history-preserving batch re-runs."""
import json
import pathlib

import psycopg
import pytest
from psycopg import errors
from testcontainers.postgres import PostgresContainer

from bddrug_etl.load.batches import run_batch

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIX = json.loads((pathlib.Path(__file__).parent / "fixtures/tericin.json").read_text())

DECISION_INSERT = (
    "INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) "
    "VALUES (%s, %s, %s, %s, %s, %s)"
)
FLAG_INSERT = "INSERT INTO ops.flag (target_type, target_id, message, reporter_email) VALUES (%s, %s, %s, %s)"
REVIEWER = "reviewer@example.test"


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


@pytest.fixture(scope="module")
def item(conn):
    """One batch with a single item to hang decisions on."""
    conn.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES ('0100-v4', 1)")
    conn.execute("INSERT INTO ops.batch_item (batch_id, source, concept_id) VALUES ('0100-v4', 'DGDA-Drugs', 'c-1')")
    conn.commit()
    return "0100-v4", "c-1"


@pytest.mark.parametrize("schema, table, index", [
    ("curated", "ddinter_pair", "ddinter_pair_b_idx"),
    ("curated", "substance_code", "substance_code_system_code_idx"),
    ("curated", "brand_product", "brand_product_bdc_idx"),
    ("ops", "review_decision", "review_decision_item_idx"),
])
def test_index_exists(conn, schema, table, index):
    row = conn.execute(
        "SELECT tablename FROM pg_indexes WHERE schemaname = %s AND indexname = %s", (schema, index)
    ).fetchone()
    assert row == (table,)


def test_batch_item_has_nullable_extracted_at(conn):
    row = conn.execute(
        "SELECT data_type, is_nullable FROM information_schema.columns "
        "WHERE table_schema = 'ops' AND table_name = 'batch_item' AND column_name = 'extracted_at'"
    ).fetchone()
    assert row == ("timestamp with time zone", "YES")


@pytest.mark.parametrize("decision, role", [("ok", "pharmacist"), ("issue", "engineer")])
def test_valid_decision_is_accepted(conn, item, decision, role):
    conn.execute(DECISION_INSERT, (*item, decision, "", REVIEWER, role))
    conn.rollback()


@pytest.mark.parametrize("decision, role", [("approve", "pharmacist"), ("ok", "user"), ("OK", "engineer")])
def test_decision_checks_reject_unknown_values(conn, item, decision, role):
    with pytest.raises(errors.CheckViolation):
        conn.execute(DECISION_INSERT, (*item, decision, "", REVIEWER, role))
    conn.rollback()


def test_decision_requires_an_existing_batch_item(conn, item):
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute(DECISION_INSERT, (item[0], "not-an-item", "ok", "", REVIEWER, "pharmacist"))
    conn.rollback()


def test_decision_defaults(conn, item):
    note, decided_at = conn.execute(
        "INSERT INTO ops.review_decision (batch_id, concept_id, decision, reviewer_email, reviewer_role) "
        "VALUES (%s, %s, 'ok', %s, 'pharmacist') RETURNING note, decided_at", (*item, REVIEWER)
    ).fetchone()
    assert note == "" and decided_at is not None
    conn.rollback()


def test_deleting_a_batch_item_with_decisions_is_refused(conn):
    conn.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES ('0101-fk', 1)")
    conn.execute("INSERT INTO ops.batch_item (batch_id, source, concept_id) VALUES ('0101-fk', 'DGDA-Drugs', 'c-2')")
    conn.execute(DECISION_INSERT, ("0101-fk", "c-2", "ok", "", REVIEWER, "pharmacist"))
    conn.commit()
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute("DELETE FROM ops.batch_item WHERE batch_id = '0101-fk' AND concept_id = 'c-2'")
    conn.rollback()
    with pytest.raises(errors.ForeignKeyViolation):  # nor through the ops.batch cascade
        conn.execute("DELETE FROM ops.batch WHERE batch_id = '0101-fk'")
    conn.rollback()
    assert conn.execute("SELECT count(*) FROM ops.review_decision WHERE batch_id = '0101-fk'").fetchone()[0] == 1


def test_rerunning_a_batch_keeps_decision_history_and_resets_review(conn):
    run_batch(conn, FakeClient(), "0102-rerun", [FIX["id"]])
    first = conn.execute(
        "SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0102-rerun' AND concept_id = %s", (FIX["id"],)
    ).fetchone()[0]
    assert first is not None
    conn.execute(DECISION_INSERT, ("0102-rerun", FIX["id"], "ok", "looks right", REVIEWER, "pharmacist"))
    conn.execute("UPDATE ops.batch_item SET review = 'ok', note = 'approved' WHERE batch_id = '0102-rerun'")
    conn.commit()

    run_batch(conn, FakeClient(), "0102-rerun", [FIX["id"]])  # would raise ForeignKeyViolation with delete+recreate

    review, note, second = conn.execute(
        "SELECT review, note, extracted_at FROM ops.batch_item WHERE batch_id = '0102-rerun' AND concept_id = %s",
        (FIX["id"],),
    ).fetchone()
    assert (review, note) == ("pending", None)
    assert second > first
    history = conn.execute(
        "SELECT decision, note, reviewer_role FROM ops.review_decision WHERE batch_id = '0102-rerun'"
    ).fetchall()
    assert history == [("ok", "looks right", "pharmacist")]


@pytest.mark.parametrize("message", ["abcd", "x" * 2001, ""], ids=["4-chars", "2001-chars", "empty"])
def test_flag_message_length_is_rejected_outside_5_to_2000(conn, message):
    with pytest.raises(errors.CheckViolation):
        conn.execute(FLAG_INSERT, ("product", "c-1", message, REVIEWER))
    conn.rollback()


@pytest.mark.parametrize("message", ["abcde", "x" * 2000], ids=["5-chars", "2000-chars"])
def test_flag_message_length_bounds_are_accepted(conn, message):
    status, created_at = conn.execute(
        FLAG_INSERT + " RETURNING status, created_at", ("product", "c-1", message, REVIEWER)
    ).fetchone()
    assert status == "open" and created_at is not None
    conn.rollback()


@pytest.mark.parametrize("column, value", [("target_type", "page"), ("status", "closed")])
def test_flag_checks_reject_unknown_values(conn, column, value):
    with pytest.raises(errors.CheckViolation):
        conn.execute(
            f"INSERT INTO ops.flag (target_type, target_id, message, reporter_email, status) VALUES "
            f"(%s, 'x', 'valid message', %s, %s)",
            (value if column == "target_type" else "other", REVIEWER, value if column == "status" else "open"),
        )
    conn.rollback()


def test_batch_run_defaults(conn):
    run_at, concept_ids = conn.execute(
        "INSERT INTO ops.batch_run (batch_id, stages, counts) VALUES ('0100-v4', %s, %s::jsonb) "
        "RETURNING run_at, concept_ids", (["dgda"], '{"dgda": {"ok": 1, "warn": 0, "fail": 0}}')
    ).fetchone()
    assert run_at is not None and concept_ids == []
    conn.rollback()
