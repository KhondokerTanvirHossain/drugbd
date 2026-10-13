"""V6 (spec §7.6): ops.item_snapshot and ops.audit_event. Additive: rows written before V6 are untouched."""
import pathlib
import uuid

import psycopg
import pytest
from psycopg import errors
from psycopg.types.json import Jsonb
from testcontainers.postgres import PostgresContainer

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "db/migrations").glob("V*.sql"), key=lambda f: int(f.name[1:].split("__")[0]))


@pytest.fixture(scope="module")
def conn():
    """Migrated up to V5 with a reviewed item, then V6 and later applied on top of it."""
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            before = [f for f in MIGRATIONS if int(f.name[1:].split("__")[0]) < 6]
            for f in before:
                c.execute(f.read_text())
            c.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES ('0600-v6', 2)")
            c.execute("""INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
                         ('0600-v6', 'DGDA-Drugs', 'c-1', now()), ('0600-v6', 'DGDA-Drugs', 'c-2', now())""")
            c.execute("""INSERT INTO ops.review_decision (batch_id, concept_id, decision, reviewer_email, reviewer_role)
                         VALUES ('0600-v6', 'c-1', 'ok', 'r@example.test', 'pharmacist')""")
            c.commit()
            for f in MIGRATIONS[len(before):]:
                c.execute(f.read_text())
            c.commit()
            yield c


def snapshot(conn, concept_id, reason="run"):
    conn.execute(
        """INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
           SELECT batch_id, concept_id, extracted_at, %s, %s, %s FROM ops.batch_item
            WHERE batch_id = '0600-v6' AND concept_id = %s""",
        (uuid.uuid4(), reason, Jsonb({"version": 1}), concept_id))


def audit(conn, event, request_id, actor_role="pharmacist"):
    conn.execute(
        """INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
           VALUES (%s, 'r@example.test', %s, 'batch_item', '0600-v6/c-1', 'ok', %s)""",
        (event, actor_role, request_id))


def test_v6_exists():
    assert any(f.name == "V6__item_snapshot_and_audit.sql" for f in MIGRATIONS)


def test_existing_rows_are_untouched(conn):
    assert conn.execute("SELECT count(*) FROM ops.batch_item WHERE batch_id = '0600-v6'").fetchone()[0] == 2
    assert conn.execute("SELECT count(*) FROM ops.review_decision WHERE batch_id = '0600-v6'").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM ops.item_snapshot").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM ops.audit_event").fetchone()[0] == 0


def test_a_snapshot_needs_a_known_reason(conn):
    with pytest.raises(errors.CheckViolation):
        snapshot(conn, "c-2", reason="manual")
    conn.rollback()


def test_a_snapshot_needs_its_batch_item(conn):
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute("""INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
                        VALUES ('0600-v6', 'nope', now(), %s, 'run', '{}')""", (uuid.uuid4(),))
    conn.rollback()


def test_an_item_with_a_snapshot_cannot_be_deleted(conn):
    snapshot(conn, "c-2")
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute("DELETE FROM ops.batch_item WHERE batch_id = '0600-v6' AND concept_id = 'c-2'")
    conn.rollback()


def test_audit_event_names_and_roles_are_checked(conn):
    with pytest.raises(errors.CheckViolation):
        audit(conn, "page_view", uuid.uuid4())
    conn.rollback()
    with pytest.raises(errors.CheckViolation):
        audit(conn, "decision", uuid.uuid4(), actor_role="admin")
    conn.rollback()


def test_one_decision_row_per_request_id(conn):
    rid = uuid.uuid4()
    audit(conn, "decision", rid)
    audit(conn, "decision_rejected", rid)
    audit(conn, "decision_rejected", rid)   # rejections may repeat an id; only 'decision' is unique
    with pytest.raises(errors.UniqueViolation):
        audit(conn, "decision", rid)
    conn.rollback()
