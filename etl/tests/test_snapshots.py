"""Item snapshots (spec §7.6, §8.1 item 4): one per stamp, grouped by run_id, payload for the API diff."""
import pathlib
import uuid

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.load.snapshots import approval_view, build_payload, same_view, view_at, write_snapshots

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
    assert payload["version"] == 2 and payload["extracted_at"] == at.isoformat()
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
    assert ing["coverage"] == "not_run"   # no interaction_coverage row in the seed
    assert "carried_from" not in payload
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


# --- the approval view (§8.3.1): what an approval covers, as a pure function of the payload ---

def payload(**over):
    p = {
        "version": 2, "extracted_at": "2026-10-12T09:00:00+00:00",
        "brand": {"dar_number": "127-0163-052", "trade_name": "Chloramphenicol", "company": "ইডিসিএল", "dosage_form": "Eye Drops",
                  "generic_content_raw": "Chloramphenicol 5 mg/ml"},
        "clinical_drug": {"bdc_id": "BDC-000001", "display_name": "Chloramphenicol 0.5% eye drops", "dose_form": "Eye Drops",
                          "route": "ophthalmic"},
        "ingredients": [{"xm_code": "XM7HA7", "name": "Chloramphenicol", "bds_id": "BDS-000001", "substance": "Chloramphenicol",
                         "strength": {"raw": "Chloramphenicol 0.5%", "value": "0.5", "unit": "%", "per_value": None, "per_unit": None},
                         "codes": [{"system": "ICD11_XM", "code": "XM7HA7", "route_scope": "any"},
                                   {"system": "ATC", "code": "S01AA01", "route_scope": "any"},
                                   {"system": "DDINTER", "code": "DDInter351", "route_scope": "systemic"},
                                   {"system": "DDINTER", "code": "DDInter352", "route_scope": "ophthalmic"}],
                         "ddinter_chosen": ["DDInter352"], "route_assumed": False, "coverage": "full"}],
        "stages": {"ddinter": {"status": "ok", "note": ""}},
    }
    p.update(over)
    return p


def with_ingredient(**over):
    p = payload()
    p["ingredients"] = [{**p["ingredients"][0], **over}]
    return p


def test_the_view_ignores_what_an_approval_does_not_cover():
    base = approval_view(payload())
    assert same_view(base, approval_view(payload(extracted_at="2026-10-13T00:00:00+00:00")))
    assert same_view(base, approval_view(payload(stages={"ddinter": {"status": "warn", "note": "DDInter text not found for a/b"}})))
    assert same_view(base, approval_view(with_ingredient(name="Chloramphenicol palmitate")))   # the DGDA ingredient name
    # a new DDInter entry for another route changes no chosen entry (§8.3.1 "not covered")
    otic = payload()["ingredients"][0]["codes"] + [{"system": "DDINTER", "code": "DDInter353", "route_scope": "otic"}]
    assert same_view(base, approval_view(with_ingredient(codes=otic)))


def test_the_view_changes_with_every_covered_field():
    base = approval_view(payload())
    changed = [
        payload(brand={**payload()["brand"], "company": "Other Co"}),
        payload(clinical_drug={**payload()["clinical_drug"], "route": "otic"}),
        with_ingredient(strength={**payload()["ingredients"][0]["strength"], "value": "1"}),
        with_ingredient(codes=payload()["ingredients"][0]["codes"] + [{"system": "ATC", "code": "J01BA01", "route_scope": "any"}]),
        with_ingredient(ddinter_chosen=["DDInter351"]),
        with_ingredient(route_assumed=True),
        with_ingredient(coverage="none"),
        with_ingredient(bds_id="BDS-000002"),
    ]
    for p in changed:
        assert not same_view(base, approval_view(p)), p


def test_v1_payload_compares_without_coverage():
    v1 = payload(version=1)
    v1["ingredients"] = [{k: v for k, v in v1["ingredients"][0].items() if k != "coverage"}]
    assert same_view(approval_view(v1), approval_view(payload()))
    assert same_view(approval_view(payload()), approval_view(v1))
    # the chosen entries still catch a full-to-none change against a version-1 snapshot
    none = with_ingredient(coverage="none", ddinter_chosen=[], codes=[c for c in payload()["ingredients"][0]["codes"] if c["system"] != "DDINTER"])
    assert not same_view(approval_view(v1), approval_view(none))


def test_ingredient_order_does_not_matter():
    two = payload()
    second = {**two["ingredients"][0], "xm_code": "XM0001", "bds_id": "BDS-000009", "substance": "Other"}
    a, b = payload(ingredients=[two["ingredients"][0], second]), payload(ingredients=[second, two["ingredients"][0]])
    assert same_view(approval_view(a), approval_view(b))


def test_a_carried_approval_is_written_into_the_snapshot_and_view_at_reads_the_stamp(conn):
    run_id = uuid.uuid4()
    stamp(conn)
    carried = {"batchId": "0001-pilot", "extractedAt": "2026-10-11T21:28:41.231692+00:00"}
    assert write_snapshots(conn, [("0700-snap", CID)], run_id, carried_from=carried) == 1
    at = conn.execute("SELECT extracted_at FROM ops.batch_item WHERE batch_id = '0700-snap' AND concept_id = %s", (CID,)).fetchone()[0]
    p = conn.execute("SELECT payload FROM ops.item_snapshot WHERE concept_id = %s AND extracted_at = %s", (CID, at)).fetchone()[0]
    assert p["carried_from"] == carried
    assert same_view(view_at(conn, "0700-snap", CID, at), approval_view(build_payload(conn, "0700-snap", CID, at)))
    assert view_at(conn, "0700-snap", CID, None) is None
    assert build_payload(conn, "0700-snap", CID, None)["extracted_at"] is None
    conn.rollback()
