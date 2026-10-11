import pathlib

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.rxnav.client import RxCodes
from bddrug_etl.stages.results import StageResult, write_stage_results
from bddrug_etl.stages.substances import build_substances

ROOT = pathlib.Path(__file__).resolve().parents[2]

PILOT = [
    ("071-0098-022--amlodipine-5", "Tablet", "Amlodipine 5 mg", [("XM68M5", "Amlodipine")]),
    ("076-0028-006--aspirin", "Tablet", "Aspirin 300 mg", [("XM4G06", "Acetylsalicylic acid")]),
    ("096-0265-061--simvastatin", "Tablet", "Simvastatin 10 mg", [("XM7AU9", "Simvastatin")]),
    ("127-0163-052--chloramphenicol", "Eye Drops", "Chloramphenicol 5 mg/ml", [("XM2TE7", "Chloramphenicol")]),
    ("127-0263-018--domperidone", "Tablet", "Domperidone 10 mg", [("XM3GF5", "Domperidone")]),
    ("185-0138-012--g-warfarin", "Tablet", "Warfarin Sodium 5 mg", [("XM86W0", "Warfarin")]),
    ("185-0241-015--g-metformin", "Tablet", "Metformin Hydrochloride 500 mg", [("XM0JN5", "Metformin")]),
    ("186-0030-006--napa", "Tablet", "Paracetamol 500 mg", [("XM5DJ7", "Acetaminophen")]),
    ("239-0407-023--clarith", "Tablet", "Clarithromycin 500 mg", [("XM1VG4", "Clarithromycin")]),
    ("420-0026-023--amoxycillin-clavulanic-acid", "Tablet", "Amoxicillin + Clavulanic Acid 500 mg + 125 mg",
     [("XM2K88", "Clavulanic acid"), ("XM7CM1", "Amoxicillin")]),
]
NAPA = "186-0030-006--napa"
COMBO = "420-0026-023--amoxycillin-clavulanic-acid"

RXCUI = {
    "acetaminophen": "161", "paracetamol": "161", "aspirin": "1191", "acetylsalicylic acid": "1191",
    "amlodipine": "17767", "simvastatin": "36567", "chloramphenicol": "2348", "domperidone": "3626",
    "warfarin": "11289", "metformin": "6809", "clarithromycin": "21212", "amoxicillin": "723",
    "clavulanic acid": "48203",
}
RXNAME = {"161": "Acetaminophen", "48203": "clavulanate"}
ATC = {"161": ("N02BE01",)}
DRUGBANK = {"161": ("DB00316",)}


class FakeRxNav:
    def __init__(self, table=RXCUI):
        self.table = table
        self.name_calls: list[str] = []
        self.code_calls: list[str] = []

    def rxcui_for_name(self, name):
        self.name_calls.append(name)
        r = self.table.get(name.casefold())
        return (r, "rxnav-exact") if r else None

    def codes_for_rxcui(self, rxcui):
        self.code_calls.append(rxcui)
        return RxCodes(rxcui, RXNAME.get(rxcui, f"name-{rxcui}"), "IN", ATC.get(rxcui, ()), DRUGBANK.get(rxcui, ()), ())


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            for cid, form, content, ings in PILOT:
                c.execute(
                    """INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw)
                       VALUES (%s, 'D', %s, 'Co', %s, %s)""", (cid, cid, form, content))
                for xm, nm in ings:
                    c.execute("INSERT INTO curated.brand_product_ingredient VALUES (%s, %s, %s)", (cid, xm, nm))
            c.execute("INSERT INTO curated.brand_product VALUES ('empty','D','E','Co','Tablet','Foo 1 mg')")
            c.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES ('b1', 11)")
            c.commit()
            yield c


def names(conn, bds):
    return set(conn.execute("SELECT name, name_type FROM curated.substance_name WHERE bds_id=%s", (bds,)).fetchall())


def codes(conn, bds):
    return set(conn.execute("SELECT system, code FROM curated.substance_code WHERE bds_id=%s", (bds,)).fetchall())


def test_napa_one_substance_both_names_and_codes(conn):
    rx = FakeRxNav()
    [res] = build_substances(conn, rx, [NAPA])
    assert res.status == "ok", res
    [ev] = res.evidence["substances"]
    assert ev["name"] == "Acetaminophen" and ev["xm"] == "XM5DJ7" and ev["rxcui"] == "161"
    assert ev["atc"] == ["N02BE01"] and ev["drugbank"] == ["DB00316"] and ev["method"] == "rxnav-exact"
    assert ev["bds_id"].startswith("BDS-")
    assert {("Acetaminophen", "icd11"), ("Paracetamol", "dgda_content"), ("Acetaminophen", "rxnorm")} <= names(conn, ev["bds_id"])
    assert {("ICD11_XM", "XM5DJ7"), ("RXCUI", "161"), ("ATC", "N02BE01"), ("DRUGBANK", "DB00316")} <= codes(conn, ev["bds_id"])
    assert conn.execute("SELECT preferred_name FROM curated.substance WHERE bds_id=%s", (ev["bds_id"],)).fetchone()[0] == "Acetaminophen"


def test_salt_stripped_content_name_for_warfarin(conn):
    [res] = build_substances(conn, FakeRxNav(), ["185-0138-012--g-warfarin"])
    bds = res.evidence["substances"][0]["bds_id"]
    assert ("Warfarin", "dgda_content") in names(conn, bds)
    assert not any(n == "Warfarin Sodium" for n, _ in names(conn, bds))


def test_combination_two_substances_aligned_by_name(conn):
    [res] = build_substances(conn, FakeRxNav(), [COMBO])
    assert res.status == "ok", res
    ev = {s["xm"]: s for s in res.evidence["substances"]}
    assert set(ev) == {"XM2K88", "XM7CM1"} and ev["XM2K88"]["bds_id"] != ev["XM7CM1"]["bds_id"]
    assert ev["XM2K88"]["rxcui"] == "48203" and ev["XM7CM1"]["rxcui"] == "723"
    # Names land on the right substance by name alignment, not by list position (XM order is reversed vs content).
    assert ("Clavulanic Acid", "dgda_content") in names(conn, ev["XM2K88"]["bds_id"])
    assert ("Amoxicillin", "dgda_content") in names(conn, ev["XM7CM1"]["bds_id"])


def test_all_pilot_products_ok(conn):
    res = build_substances(conn, FakeRxNav(), [p[0] for p in PILOT])
    assert [r.status for r in res] == ["ok"] * 10, [r for r in res if r.status != "ok"]
    # Aspirin / Acetylsalicylic acid: single-to-single pairing
    asp = next(r for r in res if r.concept_id == "076-0028-006--aspirin")
    assert asp.evidence["substances"][0]["rxcui"] == "1191"


def test_rerun_mints_nothing_and_duplicates_nothing(conn):
    ids = [p[0] for p in PILOT]
    build_substances(conn, FakeRxNav(), ids)

    def snap():
        return [conn.execute(f"SELECT count(*) FROM curated.{t}").fetchone()[0]
                for t in ("substance", "substance_code", "substance_name")]
    before = snap()
    seq = conn.execute("SELECT last_value FROM curated.bds_seq").fetchone()[0]
    pref = conn.execute("SELECT bds_id, preferred_name FROM curated.substance ORDER BY 1").fetchall()
    rx = FakeRxNav()
    build_substances(conn, rx, ids)
    assert snap() == before
    assert conn.execute("SELECT last_value FROM curated.bds_seq").fetchone()[0] == seq
    assert conn.execute("SELECT bds_id, preferred_name FROM curated.substance ORDER BY 1").fetchall() == pref
    assert rx.code_calls == []  # substances with an RXCUI are not re-looked-up


def test_preferred_name_not_changed_on_rerun(conn):
    conn.execute("UPDATE curated.substance SET preferred_name='Custom' WHERE bds_id=(SELECT bds_id FROM curated.substance_code WHERE code='XM5DJ7')")
    try:
        build_substances(conn, FakeRxNav(), [NAPA])
        assert conn.execute("SELECT preferred_name FROM curated.substance s JOIN curated.substance_code c USING (bds_id) WHERE c.code='XM5DJ7'").fetchone()[0] == "Custom"
    finally:
        conn.execute("UPDATE curated.substance SET preferred_name='Acetaminophen' WHERE preferred_name='Custom'")


def test_no_ingredients_fails(conn):
    [res] = build_substances(conn, FakeRxNav(), ["empty"])
    assert res.status == "fail" and res.note == "no ICD-11 ingredient mapping from DGDA"


def test_missing_rxcui_warns_and_later_run_fills_it(conn):
    conn.execute("INSERT INTO curated.brand_product VALUES ('odd','D','Odd','Co','Tablet','Zorbex 5 mg')")
    conn.execute("INSERT INTO curated.brand_product_ingredient VALUES ('odd','XM9ZZ9','Zorbex')")
    [res] = build_substances(conn, FakeRxNav(), ["odd"])
    assert res.status == "warn" and "no RxCUI for Zorbex" in res.note
    bds = res.evidence["substances"][0]["bds_id"]
    assert res.evidence["substances"][0]["rxcui"] is None
    [res2] = build_substances(conn, FakeRxNav({"zorbex": "999"}), ["odd"])
    assert res2.status == "ok" and res2.evidence["substances"][0]["bds_id"] == bds
    assert res2.evidence["substances"][0]["rxcui"] == "999"


def test_fallback_to_salt_stripped_parsed_name(conn):
    conn.execute("INSERT INTO curated.brand_product VALUES ('fb','D','Fb','Co','Tablet','Quuxamine Hydrochloride 5 mg')")
    conn.execute("INSERT INTO curated.brand_product_ingredient VALUES ('fb','XM8FB8','Quuxamine base')")
    [res] = build_substances(conn, FakeRxNav({"quuxamine": "777"}), ["fb"])
    assert res.evidence["substances"][0]["rxcui"] == "777"


def test_unaligned_content_name_not_stored_and_warns(conn):
    conn.execute("INSERT INTO curated.brand_product VALUES ('un','D','Un','Co','Tablet','Alpha 5 mg + Beta 6 mg')")
    conn.execute("INSERT INTO curated.brand_product_ingredient VALUES ('un','XM1AA1','Gamma'),('un','XM2BB2','Delta')")
    [res] = build_substances(conn, FakeRxNav({"gamma": "1001", "delta": "1002", "alpha": "1003", "beta": "1004"}), ["un"])
    assert res.status == "warn" and "no dgda_content name aligned for Gamma" in res.note
    for s in res.evidence["substances"]:
        assert not [n for n in names(conn, s["bds_id"]) if n[1] == "dgda_content"]


def test_lost_race_leaves_no_orphan(conn):
    """If the XM code appears between lookup and insert, the new substance is rolled back."""
    from bddrug_etl.stages import substances as mod
    real = mod._find_by_xm
    calls = {"n": 0}

    def racing(c, xm):
        calls["n"] += 1
        if calls["n"] == 1:
            # a "concurrent" winner creates it right after our (empty) lookup
            c.execute("INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-900001','Racer')")
            c.execute("INSERT INTO curated.substance_code VALUES ('BDS-900001','ICD11_XM',%s,'any','t','xm',1)", (xm,))
            return None
        return real(c, xm)
    mod._find_by_xm = racing
    try:
        got = mod._get_or_create_substance(conn, "XMRACE", "Mine")
    finally:
        mod._find_by_xm = real
    assert got == "BDS-900001"
    assert conn.execute("SELECT count(*) FROM curated.substance WHERE preferred_name='Mine'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM curated.substance s LEFT JOIN curated.substance_code c USING (bds_id) WHERE c.bds_id IS NULL").fetchone()[0] == 0


def test_write_stage_results_replaces_not_appends(conn):
    r = lambda cid, st, note: StageResult(cid, st, note, {"k": cid})  # noqa: E731
    write_stage_results(conn, "b1", "substances", [r("a", "ok", ""), r("b", "warn", "x")])
    write_stage_results(conn, "b1", "substances", [r("a", "fail", "again")])
    rows = conn.execute("SELECT concept_id, status, note, evidence FROM ops.stage_result WHERE batch_id='b1' AND stage='substances' ORDER BY 1").fetchall()
    assert rows == [("a", "fail", "again", {"k": "a"}), ("b", "warn", "x", {"k": "b"})]
    write_stage_results(conn, "b1", "clinical", [r("a", "ok", "")])
    assert conn.execute("SELECT count(*) FROM ops.stage_result WHERE batch_id='b1'").fetchone()[0] == 3


class ApproxRxNav(FakeRxNav):
    def rxcui_for_name(self, name):
        self.name_calls.append(name)
        r = self.table.get(name.casefold())
        return (r, "rxnav-approx") if r else None


def rows(conn, bds, system):
    return conn.execute(
        "SELECT code, source, method, confidence::float FROM curated.substance_code WHERE bds_id=%s AND system=%s ORDER BY code",
        (bds, system)).fetchall()


def test_exact_and_xm_provenance(conn):
    [res] = build_substances(conn, FakeRxNav(), [NAPA])
    bds = res.evidence["substances"][0]["bds_id"]
    assert rows(conn, bds, "ICD11_XM") == [("XM5DJ7", "dgda-ocl", "xm", 1.0)]
    for system, code in (("RXCUI", "161"), ("ATC", "N02BE01"), ("DRUGBANK", "DB00316")):
        assert rows(conn, bds, system) == [(code, "rxnav", "rxnav-exact", 1.0)]


def test_approx_path_method_and_confidence(conn):
    conn.execute("INSERT INTO curated.brand_product VALUES ('ap','D','Ap','Co','Tablet','Paracetamol 500 mg')")
    conn.execute("INSERT INTO curated.brand_product_ingredient VALUES ('ap','XMAPPR','Acetaminophen approx')")
    [res] = build_substances(conn, ApproxRxNav({"acetaminophen approx": "161"}), ["ap"])
    assert res.status == "ok", res
    bds = res.evidence["substances"][0]["bds_id"]
    assert res.evidence["substances"][0]["method"] == "rxnav-approx"
    for system, code in (("RXCUI", "161"), ("ATC", "N02BE01"), ("DRUGBANK", "DB00316")):
        assert rows(conn, bds, system) == [(code, "rxnav", "rxnav-approx", 0.8)]
    assert rows(conn, bds, "ICD11_XM") == [("XMAPPR", "dgda-ocl", "xm", 1.0)]


def test_rule3_aligns_by_same_rxcui(conn):
    conn.execute("INSERT INTO curated.brand_product VALUES ('pc','D','Pc','Co','Tablet','Paracetamol + Caffeine 500 mg + 65 mg')")
    conn.execute("INSERT INTO curated.brand_product_ingredient VALUES ('pc','XM5DJ7','Acetaminophen'),('pc','XMCAFF','Caffeine')")
    table = {**RXCUI, "caffeine": "1819"}
    [res] = build_substances(conn, FakeRxNav(table), ["pc"])
    assert res.status == "ok", res
    ev = {s["xm"]: s for s in res.evidence["substances"]}
    assert ("Paracetamol", "dgda_content") in names(conn, ev["XM5DJ7"]["bds_id"])
    assert ("Caffeine", "dgda_content") in names(conn, ev["XMCAFF"]["bds_id"])
    assert ev["XM5DJ7"]["rxcui"] == "161"


def test_lookup_cache_one_call_per_name_per_run(conn):
    rx = FakeRxNav()
    # Fresh substances so lookups actually happen; same name appears in two products.
    for cid, xm in (("c1", "XMCA01"), ("c2", "XMCA02")):
        conn.execute("INSERT INTO curated.brand_product VALUES (%s,'D',%s,'Co','Tablet','Zork 5 mg')", (cid, cid))
        conn.execute("INSERT INTO curated.brand_product_ingredient VALUES (%s,%s,'Metformin')", (cid, xm))
    build_substances(conn, rx, ["c1", "c2"])
    assert len(rx.name_calls) == len({n for n in rx.name_calls}), rx.name_calls
    assert rx.name_calls.count("Metformin") == 1


class BoomRxNav(FakeRxNav):
    def rxcui_for_name(self, name):
        if name == "Boomdrug":
            raise RuntimeError("rxnav HTTP 500 " + "x" * 400)
        return super().rxcui_for_name(name)


def test_per_product_isolation(conn):
    conn.execute("INSERT INTO curated.brand_product VALUES ('bm','D','Bm','Co','Tablet','Boomdrug 5 mg')")
    conn.execute("INSERT INTO curated.brand_product_ingredient VALUES ('bm','XMBOOM','Boomdrug')")
    before = conn.execute("SELECT count(*) FROM curated.substance").fetchone()[0]
    res = build_substances(conn, BoomRxNav(), [NAPA, "bm", "185-0138-012--g-warfarin"])
    assert [r.status for r in res] == ["ok", "fail", "ok"]
    assert res[1].note.startswith("error: RuntimeError: rxnav HTTP 500") and len(res[1].note) <= len("error: RuntimeError: ") + 200
    assert res[1].evidence == {}
    # failed product's savepoint rolled back: no substance for XMBOOM; connection still usable
    assert conn.execute("SELECT count(*) FROM curated.substance_code WHERE code='XMBOOM'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM curated.substance").fetchone()[0] == before
    conn.commit()
    assert conn.execute("SELECT count(*) FROM curated.substance_code WHERE code='XM86W0'").fetchone()[0] == 1


def test_operational_error_propagates(conn):
    import psycopg as pg

    class DownRxNav(FakeRxNav):
        def rxcui_for_name(self, name):
            raise pg.OperationalError("connection lost")

    conn.execute("INSERT INTO curated.brand_product VALUES ('dn','D','Dn','Co','Tablet','Downdrug 5 mg')")
    conn.execute("INSERT INTO curated.brand_product_ingredient VALUES ('dn','XMDOWN','Downdrug')")
    with pytest.raises(pg.OperationalError):
        build_substances(conn, DownRxNav(), ["dn"])
    conn.rollback()
