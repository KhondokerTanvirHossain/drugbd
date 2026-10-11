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
    ("cov", "Tablet", "Amoxicillin 500 mg", [("XM2K88", "Clavulanic acid"), ("XM7CM1", "Amoxicillin")]),
    ("mono", "Tablet", "Amoxicillin 500 mg", [("XM7CM1", "Amoxicillin")]),
    ("chlor2", "Eye  Drops", "Chloramphenicol 5 mg/ml", [("XM2TE7", "Chloramphenicol")]),
    ("rev", "Tablet", "Clavulanic Acid 125 mg + Amoxicillin 500 mg", [("XM2K88", "Clavulanic acid"), ("XM7CM1", "Amoxicillin")]),
    ("vitd", "Tablet", "Vitamin D 1000 IU", [("XMVITD", "Vitamin D")]),
    ("pct", "Cream", "Chloramphenicol 1%", [("XM2TE7", "Chloramphenicol")]),
    ("iso", "Eye Drops", "Chloramphenicol 7 mg/ml", [("XM2TE7", "Chloramphenicol")]),
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
            build_substances(c, NoRxNav(), ["napa", "combo", "chlor", "noalign", "dup", "cov", "mono", "chlor2", "rev", "vitd", "pct", "iso"])
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


KEYS = {"raw", "parse_status", "parsed", "aligned", "bdc_id", "signature"}


def test_full_substance_coverage_required(conn):
    [r] = build_clinical_drugs(conn, ["cov"])
    assert r.status == "warn" and r.note.startswith("substance BDS-") and r.note.endswith(" not in parsed content")
    assert bdc_of(conn, "cov")[0] is None and bdc_of(conn, "cov")[1] == "parsed"
    [m] = build_clinical_drugs(conn, ["mono"])
    assert m.status == "ok" and m.evidence["bdc_id"] != bdc_of(conn, "cov")[0]
    assert r.evidence["bdc_id"] is None and r.evidence["signature"] is None


def test_coverage_clears_stale_bdc(conn):
    conn.execute("UPDATE curated.brand_product SET bdc_id=(SELECT bdc_id FROM curated.clinical_drug LIMIT 1) WHERE concept_id='cov'")
    build_clinical_drugs(conn, ["cov"])
    assert bdc_of(conn, "cov")[0] is None


def test_display_names_deterministic(conn):
    [a] = build_clinical_drugs(conn, ["napa2"])
    [rev] = build_clinical_drugs(conn, ["rev"])
    [c] = build_clinical_drugs(conn, ["combo"])
    name = lambda r: conn.execute("SELECT display_name FROM curated.clinical_drug WHERE bdc_id=%s", (r.evidence["bdc_id"],)).fetchone()[0]  # noqa: E731
    assert name(a) == "Acetaminophen 500 mg tablet"
    assert name(c) == name(rev) == "Amoxicillin 500 mg + Clavulanic acid 125 mg tablet"


def test_reversed_order_same_signature_and_row_count_stable(conn):
    [c] = build_clinical_drugs(conn, ["combo"])
    [rev] = build_clinical_drugs(conn, ["rev"])
    assert c.evidence["signature"] == rev.evidence["signature"] and c.evidence["bdc_id"] == rev.evidence["bdc_id"]
    n = conn.execute("SELECT count(*) FROM curated.clinical_drug_ingredient").fetchone()[0]
    build_clinical_drugs(conn, ["combo", "rev", "napa2"])
    assert conn.execute("SELECT count(*) FROM curated.clinical_drug_ingredient").fetchone()[0] == n


def test_dose_form_whitespace_normalised(conn):
    [a] = build_clinical_drugs(conn, ["chlor"])
    [b] = build_clinical_drugs(conn, ["chlor2"])
    assert a.evidence["bdc_id"] == b.evidence["bdc_id"]
    assert conn.execute("SELECT dose_form FROM curated.clinical_drug WHERE bdc_id=%s", (a.evidence["bdc_id"],)).fetchone()[0] == "Eye Drops"


def test_unit_display_iu_and_percent(conn):
    [v] = build_clinical_drugs(conn, ["vitd"])
    [p] = build_clinical_drugs(conn, ["pct"])
    q = "SELECT display_name, i.strength_unit FROM curated.clinical_drug d JOIN curated.clinical_drug_ingredient i USING (bdc_id) WHERE bdc_id=%s"
    assert conn.execute(q, (v.evidence["bdc_id"],)).fetchone() == ("Vitamin D 1000 IU tablet", "iu")
    assert conn.execute(q, (p.evidence["bdc_id"],)).fetchone() == ("Chloramphenicol 1% cream", "%")
    assert "iu" in v.evidence["signature"]


def test_uniform_evidence_shape(conn):
    for cid in ["napa2", "part", "fail", "noalign", "dup", "cov"]:
        [r] = build_clinical_drugs(conn, [cid])
        assert set(r.evidence) == KEYS, (cid, r.evidence)
    [r] = build_clinical_drugs(conn, ["chlor"])
    assert r.evidence["parse_status"] == "parsed"
    assert r.evidence["parsed"] == [{"name": "Chloramphenicol", "strength_value": "5", "strength_unit": "mg", "per_value": "1", "per_unit": "ml"}]
    assert r.evidence["aligned"] == [{"name": "Chloramphenicol", "bds_id": r.evidence["aligned"][0]["bds_id"], "method": "name"}]
    conn.execute("UPDATE curated.brand_product SET generic_content_raw='Chloramphen 1%' WHERE concept_id='pct'")
    [sg] = build_clinical_drugs(conn, ["pct"])
    assert [a["method"] for a in sg.evidence["aligned"]] == ["single"]
    conn.execute("UPDATE curated.brand_product SET generic_content_raw='Chloramphenicol 1%' WHERE concept_id='pct'")
    [c] = build_clinical_drugs(conn, ["combo"])
    assert {a["method"] for a in c.evidence["aligned"]} == {"name"}  # noqa
    [n] = build_clinical_drugs(conn, ["noalign"])
    assert n.evidence["aligned"] == [{"name": "Mystery", "bds_id": None, "method": "unaligned"}]
    [pt] = build_clinical_drugs(conn, ["part"])
    assert pt.evidence["parse_status"] == "partial" and pt.evidence["parsed"][0]["strength_value"] is None
    assert pt.evidence["aligned"] == [] and pt.evidence["bdc_id"] is None


def test_db_error_isolation_rolls_back_partial_writes(conn, monkeypatch):
    import bddrug_etl.stages.clinical as mod
    orig = mod._set_status

    def bad(c, cid, bdc_id, status, note):
        if cid == "iso":
            c.execute("UPDATE curated.brand_product SET parse_status='bogus' WHERE concept_id=%s", (cid,))
        return orig(c, cid, bdc_id, status, note)

    monkeypatch.setattr(mod, "_set_status", bad)
    res = build_clinical_drugs(conn, ["iso", "napa2"])
    assert [r.status for r in res] == ["fail", "ok"]
    assert res[0].note.startswith("error: CheckViolation")
    assert conn.execute("SELECT count(*) FROM curated.clinical_drug WHERE signature LIKE '%7mg/1ml'").fetchone()[0] == 0
