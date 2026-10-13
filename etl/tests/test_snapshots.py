"""Item snapshots (spec §7.6, §8.1 item 4): one per stamp, grouped by run_id, payload for the API diff."""
import pathlib
import uuid

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.load.snapshots import write_snapshots

ROOT = pathlib.Path(__file__).resolve().parents[2]
CID = "127-0163-052--chloramphenicol"
SEED = """
INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000001', 'Chloramphenicol');
INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
 ('BDS-000001', 'ICD11_XM', 'XM7HA7', 'any', 'dgda-ocl', 'xm', 1.0),
 ('BDS-000001', 'DDINTER', 'DDInter351', 'systemic', 'ddinter2', 'drugbank', 1.0),
 ('BDS-000001', 'DDINTER', 'DDInter352', 'ophthalmic', 'ddinter2', 'drugbank', 1.0);
INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES
 ('BDC-000001', 'eye drops|ophthalmic|BDS-000001:0.5%/', 'Chloramphenicol 0.5% eye drops', 'Eye Drops', 'ophthalmic');
INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text)
 VALUES ('BDC-000001', 'BDS-000001', 0.50, '%', NULL, NULL, 'Chloramphenicol 0.5%');
INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id)
 VALUES ('127-0163-052--chloramphenicol', '127-0163-052', 'Chloramphenicol', 'ইডিসিএল', 'Eye Drops',
         'Chloramphenicol 5 mg/ml', 'BDC-000001');
INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
 VALUES ('127-0163-052--chloramphenicol', 'XM7HA7', 'Chloramphenicol');
INSERT INTO ops.batch (batch_id, item_count) VALUES ('0700-snap', 2);
INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
 ('0700-snap', 'DGDA-Drugs', '127-0163-052--chloramphenicol', now()), ('0700-snap', 'DGDA-Drugs', 'no-stamp', NULL);
INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
 ('0700-snap', '127-0163-052--chloramphenicol', 'ddinter', 'ok', ''),
 ('0700-snap', '127-0163-052--chloramphenicol', 'dgda', 'ok', '');
"""


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql"), key=lambda f: int(f.name[1:].split("__")[0])):
                c.execute(f.read_text())
            c.execute(SEED)
            c.commit()
            yield c


def stamp(conn):
    conn.execute("UPDATE ops.batch_item SET extracted_at = clock_timestamp() "
                 "WHERE batch_id = '0700-snap' AND concept_id = %s", (CID,))


def test_payload_holds_the_fields_the_api_diff_reads(conn):
    """Review Focus 3: a NUMERIC strength and a Bengali company name serialise and round-trip unchanged."""
    run_id = uuid.uuid4()
    assert write_snapshots(conn, [("0700-snap", CID)], run_id) == 1
    reason, rid, payload, at = conn.execute(
        "SELECT reason, run_id, payload, extracted_at FROM ops.item_snapshot WHERE concept_id = %s", (CID,)).fetchone()
    assert (reason, rid) == ("run", run_id)
    assert payload["version"] == 1 and payload["extracted_at"] == at.isoformat()
    assert payload["brand"] == {"dar_number": "127-0163-052", "trade_name": "Chloramphenicol", "company": "ইডিসিএল",
                                "dosage_form": "Eye Drops", "generic_content_raw": "Chloramphenicol 5 mg/ml"}
    assert payload["clinical_drug"] == {"bdc_id": "BDC-000001", "display_name": "Chloramphenicol 0.5% eye drops",
                                        "dose_form": "Eye Drops", "route": "ophthalmic"}
    [ing] = payload["ingredients"]
    assert (ing["xm_code"], ing["name"], ing["bds_id"], ing["substance"]) == (
        "XM7HA7", "Chloramphenicol", "BDS-000001", "Chloramphenicol")
    assert ing["strength"] == {"raw": "Chloramphenicol 0.5%", "value": "0.5", "unit": "%", "per_value": None,
                               "per_unit": None}
    assert ing["ddinter_chosen"] == ["DDInter352"] and ing["route_assumed"] is False
    assert {"system": "DDINTER", "code": "DDInter351", "route_scope": "systemic"} in ing["codes"]
    assert payload["stages"] == {"dgda": {"status": "ok", "note": ""}, "ddinter": {"status": "ok", "note": ""}}
    conn.rollback()


def test_reasons_run_then_rerun_then_shared_change(conn):
    run1, run2 = uuid.uuid4(), uuid.uuid4()
    write_snapshots(conn, [("0700-snap", CID)], run1)
    stamp(conn)
    write_snapshots(conn, [("0700-snap", CID)], run1)
    stamp(conn)
    write_snapshots(conn, [("0700-snap", CID)], run2, shared=True)
    assert conn.execute("SELECT reason, run_id FROM ops.item_snapshot WHERE concept_id = %s ORDER BY extracted_at",
                        (CID,)).fetchall() == [("run", run1), ("rerun", run1), ("shared_change", run2)]
    conn.rollback()


def test_items_without_a_stamp_and_unknown_items_are_skipped(conn):
    assert write_snapshots(conn, [("0700-snap", "no-stamp"), ("0700-snap", "not-an-item")], uuid.uuid4()) == 0
    conn.rollback()
