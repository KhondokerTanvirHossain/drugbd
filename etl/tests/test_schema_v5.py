"""V5: DDInter text columns allow NULL (missing text), and a text row needs at least one text. Not destructive."""
import pathlib

import psycopg
import pytest
from psycopg import errors
from testcontainers.postgres import PostgresContainer

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "db/migrations").glob("V*.sql"), key=lambda f: int(f.name[1:].split("__")[0]))
COLUMNS = [("ddinter_interaction_text", "interaction"), ("ddinter_interaction_text", "management"),
           ("ddinter_disease", "text"), ("ddinter_food", "description"), ("ddinter_food", "management")]


@pytest.fixture(scope="module")
def conn():
    """Migrated up to V4, legacy placeholder rows inserted, then V5 and later applied on top of them."""
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            before = [f for f in MIGRATIONS if int(f.name[1:].split("__")[0]) < 5]
            for f in before:
                c.execute(f.read_text())
            c.execute("INSERT INTO curated.ddinter_interaction_text VALUES ('L-1', 'None', 'None', '{}')")
            c.execute("INSERT INTO curated.ddinter_disease VALUES ('DDInter1', 'D-1', 'Bleeding', 'major', 'None', '{}')")
            c.execute("INSERT INTO curated.ddinter_food VALUES ('DDInter1', 'F-1', 'Alcohol', 'minor', NULL, '-', '', '{}')")
            c.commit()
            for f in MIGRATIONS[len(before):]:
                c.execute(f.read_text())
            c.commit()
            yield c


def test_v5_exists():
    assert any(f.name.startswith("V5__") for f in MIGRATIONS)


@pytest.mark.parametrize("table, column", COLUMNS)
def test_ddinter_text_columns_allow_null(conn, table, column):
    assert conn.execute(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'curated' AND table_name = %s "
        "AND column_name = %s", (table, column)).fetchone() == ("YES",)


def test_existing_rows_are_kept_unchanged(conn):
    """Not destructive: the ETL's next DDInter run cleans placeholder rows, the migration does not touch them."""
    assert conn.execute("SELECT interaction, management FROM curated.ddinter_interaction_text").fetchall() == [("None", "None")]
    assert conn.execute("SELECT text FROM curated.ddinter_disease").fetchall() == [("None",)]
    assert conn.execute("SELECT description, management FROM curated.ddinter_food").fetchall() == [("-", "")]


def test_a_text_row_with_one_text_is_accepted(conn):
    conn.execute("INSERT INTO curated.ddinter_interaction_text VALUES ('T-1', NULL, 'Monitor INR.', '{}')")
    conn.rollback()


def test_a_text_row_without_any_text_is_rejected(conn):
    with pytest.raises(errors.CheckViolation):
        conn.execute("INSERT INTO curated.ddinter_interaction_text VALUES ('T-2', NULL, NULL, '{}')")
    conn.rollback()
