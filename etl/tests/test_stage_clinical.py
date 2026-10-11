import pathlib
from decimal import Decimal

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.stages.clinical import _num, build_clinical_drugs
from bddrug_etl.stages.substances import build_substances

ROOT = pathlib.Path(__file__).resolve().parents[2]

# (concept_id, dosage_form, content, [(xm, xm_name)])
PRODUCTS = [
    ("napa", "Tablet", "Paracetamol 500 mg", [("XM5DJ7", "Acetaminophen")]),
    ("napa2", "Tablet", "Paracetamol 500.0 mg", [("XM5DJ7", "Acetaminophen")]),
    ("combo", "Tablet", "Amoxicillin + Clavulanic Acid 500 mg + 125 mg",
     [("XM2K88", "Clavulanic acid"), ("XM7CM1", "Amoxicillin")]),
    ("chlor", "Eye Drops", "Chloramphenicol 5 mg/ml", [("XM2TE7", "Chloramphenicol")]),
    ("part", "Tablet", "Foo 5 mg + Bar", [("XMFOO", "Foo")]),
    ("fail", "Tablet", "", [("XMFOO", "Foo")]),
    ("noalign", "Tablet", "Mystery 5 mg", [("XM5DJ7", "Acetaminophen"), ("XM2TE7", "Chloramphenicol")]),
    ("dup", "Tablet", "Amoxicillin 500 mg + Amoxycillin 250 mg", [("XM7CM1", "Amoxicillin")]),
]


class NoRxNav:
    def rxcui_for_name(self, name):
        return None

    def codes_for_rxcui(self, rxcui):  # pragma: no cover
        raise AssertionError


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            for cid, form, content, ings in PRODUCTS:
                c.execute(
                    """INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw)
                       VALUES (%s, 'D', %s, 'Co', %s, %s)""", (cid, cid, form, content))
                for xm, nm in ings:
                    c.execute("INSERT INTO curated.brand_product_ingredient VALUES (%s, %s, %s)", (cid, xm, nm))
            c.commit()
            build_substances(c, NoRxNav(), ["napa", "combo", "chlor", "noalign", "dup"])
            c.commit()
            yield c


def bdc_of(conn, cid):
    return conn.execute("SELECT bdc_id, parse_status, parse_note FROM curated.brand_product WHERE concept_id=%s", (cid,)).fetchone()


def test_num_canonical():
    assert _num(Decimal("500")) == _num(Decimal("500.0")) == _num(Decimal("5E+2")) == "500"
    assert _num(Decimal("0.50")) == "0.5"


def test_combination_one_bdc_two_ingredients_by_name(conn):
    [res] = build_clinical_drugs(conn, ["combo"])
    assert res.status == "ok", res
    bdc = res.evidence["bdc_id"]
    assert bdc.startswith("BDC-") and len(bdc) == 10
    rows = conn.execute(
        """SELECT s.preferred_name, i.strength_value, i.strength_unit FROM curated.clinical_drug_ingredient i
           JOIN curated.substance s USING (bds_id) WHERE bdc_id=%s ORDER BY 1""", (bdc,)).fetchall()
    assert rows == [("Amoxicillin", Decimal("500"), "mg"), ("Clavulanic acid", Decimal("125"), "mg")]
    assert bdc_of(conn, "combo") == (bdc, "parsed", None)
    assert {a["name"] for a in res.evidence["aligned"]} == {"Amoxicillin", "Clavulanic Acid"}


def test_eye_drops_route_and_per(conn):
    [res] = build_clinical_drugs(conn, ["chlor"])
    assert res.status == "ok", res
    route, name = conn.execute("SELECT route, display_name FROM curated.clinical_drug WHERE bdc_id=%s", (res.evidence["bdc_id"],)).fetchone()
    assert route == "ophthalmic" and name == "Chloramphenicol 5 mg/ml eye drops"
    assert conn.execute("SELECT per_value, per_unit FROM curated.clinical_drug_ingredient WHERE bdc_id=%s", (res.evidence["bdc_id"],)).fetchone() == (Decimal("1"), "ml")


def test_same_strength_brands_share_bdc_and_rerun_mints_nothing(conn):
    r1 = build_clinical_drugs(conn, ["napa", "napa2"])
    assert [r.status for r in r1] == ["ok", "ok"]
    assert r1[0].evidence["bdc_id"] == r1[1].evidence["bdc_id"]  # 500 and 500.0 canonical
    assert r1[0].evidence["signature"].endswith(":500mg/")
    assert r1[0].evidence["aligned"][0]["name"] == "Paracetamol"
    before = conn.execute("SELECT count(*) FROM curated.clinical_drug").fetchone()[0]
    r2 = build_clinical_drugs(conn, ["napa", "napa2", "combo", "chlor"])
    assert conn.execute("SELECT count(*) FROM curated.clinical_drug").fetchone()[0] == before
    assert r2[0].evidence["bdc_id"] == r1[0].evidence["bdc_id"]


def test_changed_content_moves_to_new_bdc_old_stays(conn):
    [r1] = build_clinical_drugs(conn, ["napa"])
    conn.execute("UPDATE curated.brand_product SET generic_content_raw='Paracetamol 650 mg' WHERE concept_id='napa'")
    [r2] = build_clinical_drugs(conn, ["napa"])
    assert r2.evidence["bdc_id"] != r1.evidence["bdc_id"]
    assert bdc_of(conn, "napa")[0] == r2.evidence["bdc_id"]
    assert conn.execute("SELECT count(*) FROM curated.clinical_drug WHERE bdc_id=%s", (r1.evidence["bdc_id"],)).fetchone()[0] == 1


def test_partial_failed(conn):
    [p] = build_clinical_drugs(conn, ["part"])
    assert p.status == "warn" and bdc_of(conn, "part")[0] is None
    assert bdc_of(conn, "part")[1] == "partial" and bdc_of(conn, "part")[2] == p.note and p.note
    [f] = build_clinical_drugs(conn, ["fail"])
    assert f.status == "fail" and bdc_of(conn, "fail")[1:] == ("failed", "empty content")


def test_unaligned_multi_ingredient_not_by_position(conn):
    [r] = build_clinical_drugs(conn, ["noalign"])
    assert r.status == "warn" and "could not align 'Mystery'" in r.note
    assert bdc_of(conn, "noalign")[0] is None


def test_two_ingredients_same_substance(conn):
    [r] = build_clinical_drugs(conn, ["dup"])
    assert r.status == "warn" and r.note.startswith("two ingredients resolve to BDS-")
    assert bdc_of(conn, "dup")[0] is None


def test_isolation_and_operational_error(conn, monkeypatch):
    import bddrug_etl.stages.clinical as mod
    orig = mod._build_one

    def boom(c, cid):
        if cid == "chlor":
            raise ValueError("bad " + "x" * 400)
        return orig(c, cid)

    monkeypatch.setattr(mod, "_build_one", boom)
    res = build_clinical_drugs(conn, ["napa2", "chlor", "combo"])
    assert [r.status for r in res] == ["ok", "fail", "ok"]
    assert res[1].note.startswith("error: ValueError: bad") and len(res[1].note) <= len("error: ValueError: ") + 200

    def down(c, cid):
        raise psycopg.OperationalError("lost")

    monkeypatch.setattr(mod, "_build_one", down)
    with pytest.raises(psycopg.OperationalError):
        build_clinical_drugs(conn, ["napa2"])
    conn.rollback()
