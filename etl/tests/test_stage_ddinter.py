import pathlib
from decimal import Decimal

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.ddinter.client import DDInterPairRow
from bddrug_etl.ddinter.html import DDInterDrug, InteractionText
from bddrug_etl.stages.ddinter import map_and_load_ddinter
from bddrug_etl.stages.results import write_stage_results

ROOT = pathlib.Path(__file__).resolve().parents[2]
NONE_NOTE = "No interaction data in DDInter for this substance"

# bds_id, preferred, xm, [(name, name_type)], [drugbank]
SUBSTANCES = [
    ("BDS-000001", "Warfarin", "XM86W0", [("Warfarin", "icd11"), ("Warfarin", "dgda_content")], ["DB00682"]),
    ("BDS-000002", "Acetylsalicylic acid", "XM4G06",
     [("Acetylsalicylic acid", "icd11"), ("Aspirin", "dgda_content"), ("Aspirin", "rxnorm")], ["DB00945"]),
    ("BDS-000003", "Simvastatin", "XM7AU9", [("Simvastatin", "icd11")], ["DB00641"]),
    ("BDS-000004", "Chloramphenicol", "XM2TE7", [("Chloramphenicol", "icd11")], ["DB00446"]),
    ("BDS-000005", "Domperidone", "XM3GF5", [("Domperidone", "icd11")], ["DB01184"]),
    ("BDS-000006", "Clarithromycin", "XM1VG4", [("Clarithromycin", "icd11")], ["DB01211"]),
    ("BDS-000007", "Amlodipine", "XM68M5", [("Amlodipine", "icd11")], ["DB00381"]),  # DDInter says DB00382
    ("BDS-000008", "Metformin", "XM0JN5", [("Metformin", "icd11")], []),             # no DRUGBANK code at all
    ("BDS-000009", "Acetaminophen", "XM5DJ7",
     [("Acetaminophen", "icd11"), ("Paracetamol", "dgda_content"), ("Acetaminophen", "rxnorm")], ["DB00316"]),
    ("BDS-000010", "Amoxicillin", "XM7CM1", [("Amoxicillin", "icd11"), ("Amoxycillin", "dgda_content")], ["DB01060"]),
    ("BDS-000011", "Clavulanic acid", "XM2K88", [("Clavulanic acid", "icd11"), ("clavulanate", "rxnorm")], ["DB00766"]),
    # only a 'ddinter'-typed name equals a DDInter entry: that name type must not be used for matching
    ("BDS-000012", "Nomatchium", "XMNM1", [("Nomatchium", "icd11"), ("Warfarin", "ddinter")], []),
    # only the rxnorm name equals a DDInter entry
    ("BDS-000013", "Nomatchium two", "XMNM2", [("Nomatchium two", "icd11"), ("Simvastatin", "rxnorm")], ["DB00641"]),
]
BDS = {s[1]: s[0] for s in SUBSTANCES}
WARF, ASA, SIMVA, CHLOR, DOMP, CLAR, AMLO, METF, NAPA, AMOX, CLAV = (
    BDS[n] for n in ("Warfarin", "Acetylsalicylic acid", "Simvastatin", "Chloramphenicol", "Domperidone",
                     "Clarithromycin", "Amlodipine", "Metformin", "Acetaminophen", "Amoxicillin", "Clavulanic acid"))

# concept_id, dosage form, [xm]
PRODUCTS = [
    ("warf", "Tablet", ["XM86W0"]),
    ("asa", "Tablet", ["XM4G06"]),
    ("simva", "Tablet", ["XM7AU9"]),
    ("clar", "Tablet", ["XM1VG4"]),
    ("chlor_eye", "Eye Drops", ["XM2TE7"]),
    ("chlor_cap", "Capsule", ["XM2TE7"]),
    ("domp", "Tablet", ["XM3GF5"]),
    ("amlo", "Tablet", ["XM68M5"]),
    ("metf", "Tablet", ["XM0JN5"]),
    ("napa", "Tablet", ["XM5DJ7"]),
    ("combo", "Tablet", ["XM2K88", "XM7CM1"]),
    ("mix", "Tablet", ["XM3GF5", "XM86W0"]),
    ("mix2", "Tablet", ["XM3GF5", "XM68M5"]),
    ("nm_ddinter", "Tablet", ["XMNM1"]),
    ("nm_rxnorm", "Tablet", ["XMNM2"]),
    ("noing", "Tablet", []),
    ("nosub", "Tablet", ["XMNONE"]),
]

# Real DDInter list rows (id, name); there is deliberately NO domperidone entry.
DRUG_LIST = [
    ("DDInter79", "Amlodipine"), ("DDInter20", "Acetylsalicylic acid"), ("DDInter1675", "Simvastatin"),
    ("DDInter351", "Chloramphenicol"), ("DDInter352", "Chloramphenicol (ophthalmic)"),
    ("DDInter353", "Chloramphenicol (otic)"), ("DDInter1951", "Warfarin"), ("DDInter1164", "Metformin"),
    ("DDInter14", "Acetaminophen"), ("DDInter393", "Clarithromycin"), ("DDInter394", "Clavulanic acid"),
    ("DDInter83", "Amoxicillin"),
]
# Warfarin / Acetaminophen DrugBank ids are real; the rest are realistic. DDInter79 deliberately mismatches
# the substance's DB00381 (name-only match). DDInter1164 has a DrugBank id but the substance has none.
DRUGBANK = {
    "DDInter1951": "DB00682", "DDInter14": "DB00316", "DDInter20": "DB00945", "DDInter1675": "DB00641",
    "DDInter351": "DB00446", "DDInter352": "DB00446", "DDInter353": "DB00446", "DDInter79": "DB00382",
    "DDInter1164": "DB00331", "DDInter393": "DB01211", "DDInter394": "DB00766", "DDInter83": "DB01060",
}
ATC = {"DDInter1951": ("B01AA03",), "DDInter14": ("N02BE01",), "DDInter20": ("A01AD05", "B01AC06", "N02BA01")}

S, M, N = "synergy", "metabolism", "increase"
GRAPH = {
    "DDInter1951": [("DDInter20", "Acetylsalicylic acid", "major", (S,)), ("DDInter393", "Clarithromycin", "major", ()),
                    ("DDInter14", "Acetaminophen", "moderate", (N,))],
    "DDInter20": [("DDInter1951", "Warfarin", "major", (S,))],
    "DDInter393": [("DDInter1951", "Warfarin", "major", ()), ("DDInter1675", "Simvastatin", "major", (M,))],
    "DDInter1675": [("DDInter393", "Clarithromycin", "major", (M,)), ("DDInter79", "Amlodipine", "moderate", (M,))],
    "DDInter79": [("DDInter1675", "Simvastatin", "moderate", (M,))],
    "DDInter14": [("DDInter1951", "Warfarin", "moderate", (N,))],
}
INTERACTION_ID = {  # unordered pair -> DDInter interaction id
    frozenset(("DDInter1951", "DDInter20")): "50001", frozenset(("DDInter1951", "DDInter393")): "50002",
    frozenset(("DDInter1951", "DDInter14")): "50003", frozenset(("DDInter1675", "DDInter393")): "50004",
    frozenset(("DDInter1675", "DDInter79")): "50005",
}
TEXTS = {
    "50001": InteractionText("Aspirin may increase the anticoagulant effect of warfarin.", "Monitor INR closely.", ("Ref A", "Ref B")),
    "50002": InteractionText("Clarithromycin may increase the INR.", "Reduce the warfarin dose.", ("Ref C",)),
    "50003": InteractionText("High-dose acetaminophen may increase the INR.", "Monitor INR.", ()),
    "50004": InteractionText("Clarithromycin increases simvastatin exposure.", "Avoid the combination.", ("Ref D",)),
    "50005": InteractionText("Amlodipine may increase simvastatin exposure.", "Limit simvastatin to 20 mg.", ("Ref E",)),
}
DISEASES = {"DDInter1951": [{"interaction_id": "8001", "severity": "major", "disease_name": "Peptic ulcer disease",
                             "references": ["Ref F"], "text": "Warfarin may worsen bleeding in peptic ulcer disease."}]}
FOODS = {"DDInter1951": [{"interaction_id": "9001", "severity": "moderate", "food_name": "Vitamin K-rich foods",
                          "references": [], "mechanism": "pharmacodynamic", "management": "Keep intake consistent.",
                          "interaction": "Large changes in vitamin K intake can alter the INR."}]}


class FakeDDInter:
    """Fake DDInterClient. Records every call; ``fail`` maps (method, key) to an exception to raise."""

    def __init__(self, extra_drugs=None, fail=None, one_sided=None):
        self.extra = extra_drugs or {}  # id -> (name, drugbank)
        self.fail = fail or {}
        # directed (ddinter_id, partner_id) lookups that find nothing: DDInter's per-drug interact-with
        # lists are not provably symmetric (warfarin: graph 934 rows, interact-with recordsTotal 936)
        self.one_sided = set(one_sided or ())
        self.drug_list_calls = 0
        self.detail_calls, self.graph_calls, self.disease_calls, self.food_calls = [], [], [], []
        self.pair_calls, self.text_calls = [], []

    def _boom(self, method, key):
        if (method, key) in self.fail:
            raise self.fail[(method, key)]

    def drug_list(self):
        self.drug_list_calls += 1
        return DRUG_LIST + [(i, n) for i, (n, _) in self.extra.items()]

    def drug_detail(self, ddinter_id):
        self.detail_calls.append(ddinter_id)
        self._boom("drug_detail", ddinter_id)
        names = dict(DRUG_LIST) | {i: n for i, (n, _) in self.extra.items()}
        if ddinter_id not in names:
            raise ValueError(f"drug name not found for {ddinter_id}")
        dbid = DRUGBANK.get(ddinter_id) or self.extra.get(ddinter_id, (None, None))[1]
        return DDInterDrug(ddinter_id, names[ddinter_id], ATC.get(ddinter_id, ()), dbid)

    def graph(self, ddinter_id):
        self.graph_calls.append(ddinter_id)
        self._boom("graph", ddinter_id)
        return [DDInterPairRow(*r) for r in GRAPH.get(ddinter_id, [])]

    def diseases(self, ddinter_id):
        self.disease_calls.append(ddinter_id)
        self._boom("diseases", ddinter_id)
        return list(DISEASES.get(ddinter_id, []))

    def foods(self, ddinter_id):
        self.food_calls.append(ddinter_id)
        self._boom("foods", ddinter_id)
        return list(FOODS.get(ddinter_id, []))

    def pair_interaction_id(self, ddinter_id, partner_id):
        self.pair_calls.append((ddinter_id, partner_id))
        self._boom("pair_interaction_id", (ddinter_id, partner_id))
        if (ddinter_id, partner_id) in self.one_sided:
            return None
        return INTERACTION_ID.get(frozenset((ddinter_id, partner_id)))

    def interaction(self, interaction_id):
        self.text_calls.append(interaction_id)
        self._boom("interaction", interaction_id)
        return TEXTS[interaction_id]


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            for bds, pref, xm, names, drugbank in SUBSTANCES:
                c.execute("INSERT INTO curated.substance (bds_id, preferred_name) VALUES (%s, %s)", (bds, pref))
                c.execute(
                    """INSERT INTO curated.substance_code (bds_id, system, code, source, method, confidence)
                       VALUES (%s, 'ICD11_XM', %s, 'dgda-ocl', 'xm', 1.0)""", (bds, xm))
                for name, typ in names:
                    c.execute("INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES (%s, %s, %s, 'seed')",
                              (bds, name, typ))
                for db in drugbank:
                    c.execute(
                        """INSERT INTO curated.substance_code (bds_id, system, code, source, method, confidence)
                           VALUES (%s, 'DRUGBANK', %s, 'rxnav', 'rxnav-exact', 1.0)""", (bds, db))
            for cid, form, xms in PRODUCTS:
                c.execute(
                    """INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw)
                       VALUES (%s, 'D', %s, 'Co', %s, 'x')""", (cid, cid, form))
                for xm in xms:
                    c.execute("INSERT INTO curated.brand_product_ingredient VALUES (%s, %s, %s)", (cid, xm, xm))
            c.commit()
            yield c


@pytest.fixture(autouse=True)
def clean(conn):
    conn.rollback()
    for t in ("ddinter_pair", "ddinter_interaction_text", "ddinter_disease", "ddinter_food", "ddinter_drug",
              "interaction_coverage"):
        conn.execute(f"DELETE FROM curated.{t}")
    conn.execute("DELETE FROM curated.substance_code WHERE system = 'DDINTER'")
    conn.execute("DELETE FROM curated.substance_name WHERE name_type = 'ddinter' AND source = 'ddinter2'")
    conn.commit()


def ddinter_codes(conn, bds):
    return conn.execute(
        "SELECT code, route_scope, method, confidence FROM curated.substance_code WHERE bds_id = %s AND system = 'DDINTER' ORDER BY code",
        (bds,)).fetchall()


def coverage(conn, bds):
    return conn.execute("SELECT coverage, note FROM curated.interaction_coverage WHERE bds_id = %s", (bds,)).fetchone()


def counts(conn):
    tables = ["curated.ddinter_drug", "curated.ddinter_pair", "curated.ddinter_interaction_text",
              "curated.ddinter_disease", "curated.ddinter_food", "curated.interaction_coverage",
              "curated.substance_code", "curated.substance_name", "curated.substance"]
    return {t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in tables}


EMPTY = {"mappings": [], "coverage": [], "pair_count": 0, "disease_count": 0, "food_count": 0, "text_fetch_count": 0,
         "text_missing": []}


# --- Review Focus 3: route-scoped entries ---------------------------------------------------------


def test_chloramphenicol_maps_all_three_route_scopes(conn):
    client = FakeDDInter()
    res = map_and_load_ddinter(conn, client, ["chlor_eye", "chlor_cap"])
    assert [r.status for r in res] == ["ok", "ok"], res
    one = Decimal("1.00")
    assert ddinter_codes(conn, CHLOR) == [
        ("DDInter351", "systemic", "drugbank", one),
        ("DDInter352", "ophthalmic", "drugbank", one),
        ("DDInter353", "otic", "drugbank", one),
    ]
    assert conn.execute("SELECT ddinter_id, name, route_scope, drugbank_id FROM curated.ddinter_drug ORDER BY ddinter_id").fetchall() == [
        ("DDInter351", "Chloramphenicol", "systemic", "DB00446"),
        ("DDInter352", "Chloramphenicol (ophthalmic)", "ophthalmic", "DB00446"),
        ("DDInter353", "Chloramphenicol (otic)", "otic", "DB00446"),
    ]
    assert {("Chloramphenicol", "ddinter"), ("Chloramphenicol (ophthalmic)", "ddinter"),
            ("Chloramphenicol (otic)", "ddinter")} <= set(
        conn.execute("SELECT name, name_type FROM curated.substance_name WHERE bds_id = %s", (CHLOR,)).fetchall())
    assert coverage(conn, CHLOR) == ("full", "DDInter DDInter351, DDInter352, DDInter353")
    assert [(m["ddinter_id"], m["route_scope"], m["method"], m["confidence"]) for m in res[0].evidence["mappings"]] == [
        ("DDInter351", "systemic", "drugbank", 1.0), ("DDInter352", "ophthalmic", "drugbank", 1.0),
        ("DDInter353", "otic", "drugbank", 1.0)]
    assert res[0].evidence["mappings"][1] == {"bds_id": CHLOR, "ddinter_id": "DDInter352",
                                              "name": "Chloramphenicol (ophthalmic)", "route_scope": "ophthalmic",
                                              "method": "drugbank", "confidence": 1.0}
    assert res[0].evidence["coverage"] == [{"bds_id": CHLOR, "coverage": "full"}]
    # batched per substance: two products share the substance, every client call is made once
    assert client.drug_list_calls == 1
    for calls in (client.detail_calls, client.graph_calls, client.disease_calls, client.food_calls):
        assert sorted(calls) == ["DDInter351", "DDInter352", "DDInter353"]
    assert res[0].evidence == res[1].evidence


def test_only_icd11_rxnorm_dgda_names_are_used_for_matching(conn):
    # BDS-000012 has the DDInter name only under name_type 'ddinter': no match. BDS-000013 matches via its rxnorm name.
    r_dd, r_rx = map_and_load_ddinter(conn, FakeDDInter(), ["nm_ddinter", "nm_rxnorm"])
    assert r_dd.status == "warn" and r_dd.note == NONE_NOTE and coverage(conn, "BDS-000012")[0] == "none"
    assert r_rx.status == "ok" and ddinter_codes(conn, "BDS-000013")[0][0] == "DDInter1675"


# --- Review Focus 4: not in DDInter -----------------------------------------------------------------


def test_domperidone_not_in_ddinter_is_none_and_warn(conn):
    client = FakeDDInter()
    [r] = map_and_load_ddinter(conn, client, ["domp"])
    assert r.status == "warn" and r.note == NONE_NOTE
    assert coverage(conn, DOMP) == ("none", NONE_NOTE)
    assert ddinter_codes(conn, DOMP) == []
    assert r.evidence == EMPTY | {"coverage": [{"bds_id": DOMP, "coverage": "none"}]}
    assert client.detail_calls == [] and client.graph_calls == []


def test_notes_joined_for_mixed_substances(conn):
    r_mix, r_mix2 = map_and_load_ddinter(conn, FakeDDInter(), ["mix", "mix2"])
    # warfarin is mapped by DrugBank, domperidone has no entry: still a warn, with the none note
    assert r_mix.status == "warn" and r_mix.note == NONE_NOTE
    assert {c["bds_id"]: c["coverage"] for c in r_mix.evidence["coverage"]} == {DOMP: "none", WARF: "full"}
    assert [m["ddinter_id"] for m in r_mix.evidence["mappings"]] == ["DDInter1951"]
    # substances are processed in bds_id order: domperidone (none) then amlodipine (name-only)
    assert r_mix2.status == "warn"
    assert r_mix2.note == f"{NONE_NOTE}; DDInter DDInter79 matched by name only"


def test_coverage_none_flips_to_full_on_rerun_without_duplicates(conn):
    [r1] = map_and_load_ddinter(conn, FakeDDInter(), ["domp"])
    assert r1.status == "warn" and coverage(conn, DOMP)[0] == "none"
    client = FakeDDInter(extra_drugs={"DDInter9999": ("Domperidone", "DB01184")})  # synthetic id
    [r2] = map_and_load_ddinter(conn, client, ["domp"])
    assert r2.status == "ok", r2
    assert coverage(conn, DOMP) == ("full", "DDInter DDInter9999")
    assert conn.execute("SELECT count(*) FROM curated.interaction_coverage WHERE bds_id = %s", (DOMP,)).fetchone()[0] == 1


# --- name-only matches --------------------------------------------------------------------------------


def test_name_only_match_warns_with_lower_confidence(conn):
    [r] = map_and_load_ddinter(conn, FakeDDInter(), ["amlo"])
    assert r.status == "warn" and r.note == "DDInter DDInter79 matched by name only"
    assert ddinter_codes(conn, AMLO) == [("DDInter79", "systemic", "name", Decimal("0.70"))]
    assert r.evidence["mappings"] == [{"bds_id": AMLO, "ddinter_id": "DDInter79", "name": "Amlodipine",
                                       "route_scope": "systemic", "method": "name", "confidence": 0.7}]
    assert coverage(conn, AMLO) == ("full", "DDInter DDInter79")  # still has interaction data
    assert conn.execute("SELECT drugbank_id FROM curated.ddinter_drug WHERE ddinter_id = 'DDInter79'").fetchone() == ("DB00382",)


def test_substance_without_drugbank_code_is_name_only(conn):
    [r] = map_and_load_ddinter(conn, FakeDDInter(), ["metf"])
    assert r.status == "warn" and r.note == "DDInter DDInter1164 matched by name only"
    assert ddinter_codes(conn, METF)[0][2:] == ("name", Decimal("0.70"))


def test_paracetamol_and_acetaminophen_one_substance_one_mapping(conn):
    [r] = map_and_load_ddinter(conn, FakeDDInter(), ["napa"])
    assert r.status == "ok"
    assert [m["ddinter_id"] for m in r.evidence["mappings"]] == ["DDInter14"]
    assert ddinter_codes(conn, NAPA) == [("DDInter14", "systemic", "drugbank", Decimal("1.00"))]
    assert conn.execute("SELECT atc_codes FROM curated.ddinter_drug WHERE ddinter_id = 'DDInter14'").fetchone() == (["N02BE01"],)


def test_combination_product_maps_each_substance(conn):
    [r] = map_and_load_ddinter(conn, FakeDDInter(), ["combo"])
    assert r.status == "ok"
    assert {(m["bds_id"], m["ddinter_id"]) for m in r.evidence["mappings"]} == {(AMOX, "DDInter83"), (CLAV, "DDInter394")}
    assert coverage(conn, AMOX) == ("full", "DDInter DDInter83") and coverage(conn, CLAV) == ("full", "DDInter DDInter394")


# --- pairs, texts, diseases, foods -------------------------------------------------------------------


@pytest.mark.parametrize("batch", [["warf", "asa"], ["asa", "warf"]])
def test_warfarin_aspirin_text_fetched_exactly_once(conn, batch):
    client = FakeDDInter()
    res = dict(zip(batch, map_and_load_ddinter(conn, client, batch)))
    assert all(r.status == "ok" for r in res.values()), res
    # unordered pair, asked once, from the lower id side (text order: DDInter1951 < DDInter20)
    assert client.pair_calls == [("DDInter1951", "DDInter20")]
    assert client.text_calls == ["50001"]
    assert conn.execute(
        "SELECT severity, actions, partner_name_a, partner_name_b, interaction_id FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1951' AND ddinter_b = 'DDInter20'"
    ).fetchone() == ("major", ["synergy"], "Warfarin", "Acetylsalicylic acid", "50001")
    assert conn.execute("SELECT interaction, management, refs FROM curated.ddinter_interaction_text").fetchall() == [
        ("Aspirin may increase the anticoagulant effect of warfarin.", "Monitor INR closely.", ["Ref A", "Ref B"])]
    # the pair is stored once even though both sides' graphs list it
    assert conn.execute("SELECT count(*) FROM curated.ddinter_pair WHERE (ddinter_a, ddinter_b) = ('DDInter1951', 'DDInter20')").fetchone()[0] == 1
    # evidence counts cover each product's own DDInter ids
    assert res["warf"].evidence["pair_count"] == 3 and res["asa"].evidence["pair_count"] == 1
    assert res["warf"].evidence["text_fetch_count"] == 1 and res["asa"].evidence["text_fetch_count"] == 1
    assert (res["warf"].evidence["disease_count"], res["warf"].evidence["food_count"]) == (1, 1)
    assert (res["asa"].evidence["disease_count"], res["asa"].evidence["food_count"]) == (0, 0)


def test_pairs_outside_the_batch_keep_severity_and_actions_but_no_text(conn):
    client = FakeDDInter()
    map_and_load_ddinter(conn, client, ["warf", "asa"])
    rows = conn.execute(
        "SELECT ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id FROM curated.ddinter_pair ORDER BY ddinter_a, ddinter_b"
    ).fetchall()
    assert rows == [
        ("DDInter14", "DDInter1951", "moderate", ["increase"], "Acetaminophen", "Warfarin", None),
        ("DDInter1951", "DDInter20", "major", ["synergy"], "Warfarin", "Acetylsalicylic acid", "50001"),
        ("DDInter1951", "DDInter393", "major", [], "Warfarin", "Clarithromycin", None),
    ]
    assert client.text_calls == ["50001"]  # clarithromycin / acetaminophen are not in this batch
    # a later batch with the partner fetches the text
    client2 = FakeDDInter()
    map_and_load_ddinter(conn, client2, ["warf", "clar"])
    assert client2.pair_calls == [("DDInter1951", "DDInter393")] and client2.text_calls == ["50002"]
    assert conn.execute("SELECT interaction_id FROM curated.ddinter_pair WHERE ddinter_b = 'DDInter393' AND ddinter_a = 'DDInter1951'").fetchone() == ("50002",)


def test_pair_order_is_text_order_and_asked_from_lower_side(conn):
    client = FakeDDInter()
    map_and_load_ddinter(conn, client, ["clar", "simva"])
    # numerically 393 < 1675, but ddinter_a < ddinter_b is text order
    assert client.pair_calls == [("DDInter1675", "DDInter393")] and client.text_calls == ["50004"]
    assert conn.execute(
        "SELECT ddinter_a, ddinter_b, partner_name_a, partner_name_b, interaction_id FROM curated.ddinter_pair WHERE interaction_id IS NOT NULL"
    ).fetchall() == [("DDInter1675", "DDInter393", "Simvastatin", "Clarithromycin", "50004")]


@pytest.mark.parametrize("batch", [["warf", "asa"], ["asa", "warf"]])
def test_text_missing_from_lower_side_is_found_from_the_other_side(conn, batch):
    client = FakeDDInter(one_sided={("DDInter1951", "DDInter20")})
    res = dict(zip(batch, map_and_load_ddinter(conn, client, batch)))
    assert all(r.status == "ok" and r.note == "" for r in res.values()), res
    assert client.pair_calls == [("DDInter1951", "DDInter20"), ("DDInter20", "DDInter1951")]
    assert client.text_calls == ["50001"]
    assert conn.execute(
        "SELECT severity, actions, interaction_id FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1951' AND ddinter_b = 'DDInter20'"
    ).fetchone() == ("major", ["synergy"], "50001")
    assert conn.execute("SELECT interaction_id, management FROM curated.ddinter_interaction_text").fetchall() == [
        ("50001", "Monitor INR closely.")]
    for r in res.values():
        assert r.evidence["text_missing"] == [] and r.evidence["text_fetch_count"] == 1


@pytest.mark.parametrize("batch", [["warf", "asa"], ["asa", "warf"]])
def test_text_missing_on_both_sides_warns_and_keeps_severity(conn, batch):
    client = FakeDDInter(one_sided={("DDInter1951", "DDInter20"), ("DDInter20", "DDInter1951")})
    res = dict(zip(batch, map_and_load_ddinter(conn, client, batch)))
    note = "DDInter text not found for DDInter1951/DDInter20"
    # BOTH products of the pair say so, not only the one that made the lookup
    for r in res.values():
        assert (r.status, r.note) == ("warn", note), r
        assert r.evidence["text_missing"] == [["DDInter1951", "DDInter20"]]  # out-of-batch pairs are not listed
        assert r.evidence["text_fetch_count"] == 0
    # each side asked once per run (negative result cached), no text fetched
    assert sorted(client.pair_calls) == [("DDInter1951", "DDInter20"), ("DDInter20", "DDInter1951")]
    assert client.text_calls == []
    # the Major severity and actions survive: a missing text is never shown as "no interaction"
    assert conn.execute(
        "SELECT severity, actions, interaction_id FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1951' AND ddinter_b = 'DDInter20'"
    ).fetchone() == ("major", ["synergy"], None)
    assert conn.execute("SELECT count(*) FROM curated.ddinter_interaction_text").fetchone()[0] == 0
    conn.commit()
    # a later run that finds the text fills it in and the warn clears
    c2 = FakeDDInter()
    r2 = map_and_load_ddinter(conn, c2, batch)
    assert all(r.status == "ok" and r.evidence["text_missing"] == [] for r in r2), r2
    assert c2.pair_calls == [("DDInter1951", "DDInter20")] and c2.text_calls == ["50001"]
    assert conn.execute(
        "SELECT interaction_id FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1951' AND ddinter_b = 'DDInter20'"
    ).fetchone() == ("50001",)


def test_text_missing_note_follows_mapping_notes(conn):
    client = FakeDDInter(one_sided={("DDInter1675", "DDInter79"), ("DDInter79", "DDInter1675")})
    r_simva, r_amlo = map_and_load_ddinter(conn, client, ["simva", "amlo"])
    assert (r_simva.status, r_simva.note) == ("warn", "DDInter text not found for DDInter1675/DDInter79")
    assert r_amlo.note == "DDInter DDInter79 matched by name only; DDInter text not found for DDInter1675/DDInter79"
    assert r_amlo.evidence["text_missing"] == [["DDInter1675", "DDInter79"]]


def test_diseases_and_foods_stored(conn):
    map_and_load_ddinter(conn, FakeDDInter(), ["warf"])
    assert conn.execute("SELECT ddinter_id, interaction_id, disease_name, severity, text, refs FROM curated.ddinter_disease").fetchall() == [
        ("DDInter1951", "8001", "Peptic ulcer disease", "major", "Warfarin may worsen bleeding in peptic ulcer disease.", ["Ref F"])]
    assert conn.execute("SELECT ddinter_id, interaction_id, food, severity, mechanism, description, management, refs FROM curated.ddinter_food").fetchall() == [
        ("DDInter1951", "9001", "Vitamin K-rich foods", "moderate", "pharmacodynamic",
         "Large changes in vitamin K intake can alter the INR.", "Keep intake consistent.", [])]


# --- idempotency -------------------------------------------------------------------------------------


def test_rerun_creates_no_duplicates_and_no_extra_fetches(conn):
    batch = ["warf", "asa", "chlor_eye", "chlor_cap", "domp", "clar", "simva", "combo", "napa", "amlo", "mix"]
    c1 = FakeDDInter()
    r1 = map_and_load_ddinter(conn, c1, batch)
    conn.commit()
    before = counts(conn)
    assert len(c1.text_calls) >= 4 and before["curated.ddinter_pair"] > 0
    assert sum(r.evidence["text_fetch_count"] for r in r1) > 0

    c2 = FakeDDInter()
    r2 = map_and_load_ddinter(conn, c2, batch)
    assert counts(conn) == before, "re-run changed row counts"
    assert c2.text_calls == [] and c2.pair_calls == [], "re-run fetched texts that were already stored"
    # still batched on the second run
    assert c2.drug_list_calls == 1 and len(c2.detail_calls) == len(set(c2.detail_calls))
    assert [(r.concept_id, r.status, r.note) for r in r1] == [(r.concept_id, r.status, r.note) for r in r2]
    for a, b in zip(r1, r2):
        assert a.evidence | {"text_fetch_count": 0} == b.evidence
        assert b.evidence["text_fetch_count"] == 0
    # stored interaction ids survive the second run's pair upserts
    assert conn.execute("SELECT count(*) FROM curated.ddinter_pair WHERE interaction_id IS NOT NULL").fetchone()[0] == len(c1.text_calls)


def test_rerun_refetches_only_missing_text(conn):
    c1 = FakeDDInter()
    map_and_load_ddinter(conn, c1, ["warf", "asa"])
    conn.execute("DELETE FROM curated.ddinter_interaction_text WHERE interaction_id = '50001'")
    c2 = FakeDDInter()
    map_and_load_ddinter(conn, c2, ["warf", "asa"])
    assert c2.text_calls == ["50001"] and c2.pair_calls == []  # interaction id known from the pair row
    assert conn.execute("SELECT count(*) FROM curated.ddinter_interaction_text").fetchone()[0] == 1


# --- isolation and failures ------------------------------------------------------------------------------


def test_per_product_isolation_on_client_error(conn):
    boom = RuntimeError("detail exploded " + "x" * 400)
    client = FakeDDInter(fail={("drug_detail", "DDInter1675"): boom})
    res = map_and_load_ddinter(conn, client, ["warf", "simva", "asa"])
    assert [r.status for r in res] == ["ok", "fail", "ok"]
    assert res[1].note.startswith("error: RuntimeError: detail exploded")
    assert len(res[1].note) <= len("error: RuntimeError: ") + 200
    assert res[1].evidence == EMPTY
    assert ddinter_codes(conn, SIMVA) == [] and coverage(conn, SIMVA) is None
    assert ddinter_codes(conn, WARF) and ddinter_codes(conn, ASA)
    assert conn.execute("SELECT count(*) FROM curated.ddinter_drug WHERE ddinter_id = 'DDInter1675'").fetchone()[0] == 0
    conn.commit()  # the connection is still usable after the rolled-back savepoint
    assert coverage(conn, WARF) == ("full", "DDInter DDInter1951")


def test_failed_product_rolls_back_everything_it_wrote(conn):
    # warfarin's mapping rows are written before its graph is read; the graph error must undo them
    client = FakeDDInter(fail={("graph", "DDInter1951"): ValueError("bad graph")})
    res = map_and_load_ddinter(conn, client, ["warf", "chlor_eye"])
    assert [r.status for r in res] == ["fail", "ok"]
    assert res[0].note == "error: ValueError: bad graph" and res[0].evidence == EMPTY
    assert ddinter_codes(conn, WARF) == [] and coverage(conn, WARF) is None
    assert conn.execute("SELECT count(*) FROM curated.ddinter_drug WHERE ddinter_id = 'DDInter1951'").fetchone()[0] == 0
    assert len(ddinter_codes(conn, CHLOR)) == 3


def test_text_fetch_error_fails_only_the_products_of_that_pair(conn):
    client = FakeDDInter(fail={("interaction", "50001"): RuntimeError("DDInter HTTP 500")})
    res = map_and_load_ddinter(conn, client, ["warf", "asa", "chlor_eye"])
    assert [r.status for r in res] == ["fail", "fail", "ok"]
    assert res[0].note == "error: RuntimeError: DDInter HTTP 500"
    assert conn.execute("SELECT count(*) FROM curated.ddinter_pair").fetchone()[0] == 0
    assert ddinter_codes(conn, WARF) == [] and ddinter_codes(conn, ASA) == []


def test_rolled_back_product_does_not_hide_a_fetched_text_from_its_partner(conn):
    # warfarin fetches the aspirin text (50001), then fails on its clarithromycin text (50002) and rolls back.
    # Aspirin must still get the text (reused from the run cache, not fetched again) and must not
    # believe it was already stored.
    client = FakeDDInter(fail={("interaction", "50002"): RuntimeError("DDInter HTTP 500")})
    res = map_and_load_ddinter(conn, client, ["warf", "asa", "clar"])
    assert [r.status for r in res] == ["fail", "ok", "fail"]
    assert client.text_calls.count("50001") == 1
    assert client.pair_calls.count(("DDInter1951", "DDInter20")) == 1
    assert conn.execute("SELECT interaction_id, interaction FROM curated.ddinter_interaction_text").fetchall() == [
        ("50001", "Aspirin may increase the anticoagulant effect of warfarin.")]
    assert conn.execute("SELECT interaction_id FROM curated.ddinter_pair WHERE ddinter_a = 'DDInter1951' AND ddinter_b = 'DDInter20'").fetchone() == ("50001",)
    assert ddinter_codes(conn, WARF) == [] and ddinter_codes(conn, CLAR) == [] and ddinter_codes(conn, ASA)


@pytest.mark.parametrize("exc", [psycopg.OperationalError("connection lost"), psycopg.InterfaceError("connection closed")])
def test_connection_errors_propagate(conn, exc):
    client = FakeDDInter(fail={("drug_detail", "DDInter1951"): exc})
    with pytest.raises(type(exc)):
        map_and_load_ddinter(conn, client, ["asa", "warf", "chlor_eye"])
    conn.rollback()


def test_substance_stage_gaps_fail_with_uniform_evidence(conn):
    res = map_and_load_ddinter(conn, FakeDDInter(), ["noing", "nosub", "ghost", "warf"])
    assert [r.status for r in res] == ["fail", "fail", "fail", "ok"]
    assert res[0].note == "no ICD-11 ingredient mapping from DGDA" == res[2].note
    assert res[1].note == "no substance for XMNONE; run the substances stage first"
    assert all(r.evidence == EMPTY for r in res[:3])


def test_no_products_makes_no_client_calls(conn):
    client = FakeDDInter()
    assert map_and_load_ddinter(conn, client, []) == []
    assert client.drug_list_calls == 0


def test_results_round_trip_through_write_stage_results(conn):
    res = map_and_load_ddinter(conn, FakeDDInter(), ["warf", "asa", "domp"])
    conn.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES ('b7', 3) ON CONFLICT DO NOTHING")
    write_stage_results(conn, "b7", "ddinter", res)
    write_stage_results(conn, "b7", "ddinter", res)  # replaced, not appended
    rows = conn.execute("SELECT concept_id, status, note, evidence FROM ops.stage_result WHERE batch_id = 'b7' AND stage = 'ddinter' ORDER BY concept_id").fetchall()
    assert [(c, s) for c, s, _, _ in rows] == [("asa", "ok"), ("domp", "warn"), ("warf", "ok")]
    assert rows[2][3]["mappings"][0]["ddinter_id"] == "DDInter1951" and rows[2][3]["pair_count"] == 3
    assert rows[1][2] == NONE_NOTE
    conn.rollback()
