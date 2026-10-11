import json, pathlib
import psycopg, pytest
from testcontainers.postgres import PostgresContainer
from bddrug_etl.load.products import load_products

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIX = json.loads((pathlib.Path(__file__).parent / "fixtures/tericin.json").read_text())

@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c

def count(conn, table):
    return conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

def test_loads_product_raw_and_ingredients(conn):
    stats = load_products(conn, [FIX, {**FIX, "id": "x", "concept_class": "Ingredient"}])
    assert (stats.seen, stats.loaded, stats.skipped) == (2, 1, 1)
    assert count(conn, "curated.brand_product") == 1
    assert count(conn, "raw.ocl_concept") == 2
    assert conn.execute("SELECT xm_code FROM curated.brand_product_ingredient").fetchall() == [("XM5TR4",)]

def test_rerun_is_idempotent_and_replaces_ingredients(conn):
    changed = {**FIX, "mappings": [{**FIX["mappings"][0], "to_concept_code": "XM0000", "to_concept_name": "New"}]}
    load_products(conn, [FIX])
    load_products(conn, [changed])
    assert count(conn, "curated.brand_product") == 1
    assert conn.execute("SELECT xm_code FROM curated.brand_product_ingredient").fetchall() == [("XM0000",)]
