"""Approval vs shared rows: a stage that changes substance-level rows (names, codes, DDInter mappings,
coverage, pairs, texts) for product Y re-opens the review of every OTHER product that shows those rows.

Approval is per batch record, but the substances and DDInter stages write rows keyed by substance /
DDInter id that every product with that substance shows (product page, substance page, /check alerts and
"no data"). Without this, re-running a pending product would change what anonymous visitors see for an
already approved one, with no pharmacist seeing the change (Review Focus 1 and 3).
"""
import contextlib
import logging
import pathlib
from types import SimpleNamespace

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.ddinter.client import DDInterPairRow, InteractWithList, InteractWithRow
from bddrug_etl.ddinter.html import DDInterDrug, InteractionText
from bddrug_etl.jobs import run_pipeline
from bddrug_etl.load.batches import reopen_review
from bddrug_etl.stages.results import SharedChanges

ROOT = pathlib.Path(__file__).resolve().parents[2]
REVIEWER = "pharm@example.test"
X, Y, Z, W = "500-0000-001--x", "500-0000-002--y", "500-0000-003--z", "500-0000-004--w"
SH, OT, WX, ALIAS = "DDInter7001", "DDInter7002", "DDInter7003", "DDInter7004"


def concept(cid, xm, ingredient, content):
    return {"id": cid, "concept_class": "Drug", "retired": False, "display_name": cid,
            "extras": {"company": "Co", "dar_number": cid[:12], "trade_name": cid[-1].upper(), "dosage_form": "Tablet",
                       "dar_quality_flag": "", "generic_content_raw": content},
            "mappings": [{"map_type": "Has-active-ingredient", "retired": False,
                          "to_concept_code": xm, "to_concept_name": ingredient}]}


def concepts(y_content="Sharedium 5 mg", y_ingredient="Sharedium"):
    """X and Y share substance XMSH1 (Sharedium); Z (Otherium) and W (Wexium) have their own."""
    return {X: concept(X, "XMSH1", "Sharedium", "Sharedium 5 mg"),
            Y: concept(Y, "XMSH1", y_ingredient, y_content),
            Z: concept(Z, "XMOT1", "Otherium", "Otherium 10 mg"),
            W: concept(W, "XMWX1", "Wexium", "Wexium 1 mg")}


class FakeOcl:
    def __init__(self, table):
        self.table = table

    def get_concept(self, owner, source, concept_id):
        return self.table.get(concept_id)


class FakeRxNav:
    def __init__(self, raise_for=()):
        self.raise_for = set(raise_for)

    def rxcui_for_name(self, name):
        if name in self.raise_for:
            raise RuntimeError(f"rxnav down for {name}")
        return None

    def codes_for_rxcui(self, rxcui):
        raise AssertionError("no rxcui is ever found")


class FakeDDInter:
    """``drugs``: id -> name (the DDInter drug list); ``edges``: frozenset({a, b}) -> severity;
    ``raise_at``: id -> exception its detail call raises."""

    def __init__(self, drugs, edges=None, raise_at=None):
        self.drugs, self.edges, self.raise_at = dict(drugs), dict(edges or {}), dict(raise_at or {})

    def drug_list(self):
        return list(self.drugs.items())

    def drug_detail(self, ddinter_id):
        if ddinter_id in self.raise_at:
            raise self.raise_at[ddinter_id]
        return DDInterDrug(ddinter_id, self.drugs[ddinter_id], (), None)

    def graph(self, ddinter_id):
        rows = []
        for e, sev in sorted(self.edges.items(), key=lambda kv: sorted(kv[0])):
            if ddinter_id in e:
                (other,) = e - {ddinter_id}
                rows.append(DDInterPairRow(other, self.drugs.get(other, other), sev, ()))
        return rows

    def interact_with(self, ddinter_id):
        return InteractWithList(tuple(InteractWithRow(r.partner_id, r.partner_name, "0", r.severity)
                                      for r in self.graph(ddinter_id)), True)

    def diseases(self, ddinter_id):
        return []

    def foods(self, ddinter_id):
        return []

    def pair_interaction_id(self, ddinter_id, partner_id):
        return "I-" + "-".join(sorted((ddinter_id, partner_id))) if frozenset((ddinter_id, partner_id)) in self.edges else None

    def interaction(self, interaction_id):
        return InteractionText(f"text {interaction_id}", "Monitor.", ())


BOTH = {SH: "Sharedium", OT: "Otherium"}


class Harness:
    def __init__(self, url, ddinter, table=None, rxnav=None):
        self.url = url
        self.ocl, self.rxnav, self.ddinter = FakeOcl(table or concepts()), rxnav or FakeRxNav(), ddinter

    def connect(self):
        return psycopg.connect(self.url)

    @contextlib.contextmanager
    def clients(self, conn):
        yield SimpleNamespace(ocl=self.ocl, rxnav=self.rxnav, ddinter=self.ddinter)

    def main(self, *argv):
        return run_pipeline.main(list(argv), connect=self.connect, client_factory=self.clients)


@pytest.fixture(scope="module")
def url():
    with PostgresContainer("postgres:16", driver=None) as pg:
        u = pg.get_connection_url()
        with psycopg.connect(u) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
        yield u


@pytest.fixture(autouse=True)
def clean(url):
    """Every test starts from an empty database (decisions included: they are test data here)."""
    with psycopg.connect(url) as c:
        for t in ("ops.review_decision", "ops.stage_result", "ops.batch_run", "ops.batch_item", "ops.batch",
                  "curated.ddinter_pair", "curated.ddinter_interaction_text", "curated.ddinter_disease",
                  "curated.ddinter_food", "curated.ddinter_drug", "curated.interaction_coverage",
                  "curated.clinical_drug_ingredient", "curated.brand_product_ingredient"):
            c.execute(f"DELETE FROM {t}")
        c.execute("UPDATE curated.brand_product SET bdc_id = NULL")
        for t in ("curated.clinical_drug", "curated.brand_product", "curated.substance_name",
                  "curated.substance_code", "curated.substance"):
            c.execute(f"DELETE FROM {t}")


def q(url, sql, params=()):
    with psycopg.connect(url) as c:
        return c.execute(sql, params).fetchall()


def batch_file(tmp_path, name, ids):
    f = tmp_path / f"{name}.txt"
    f.write_text("\n".join(ids) + "\n")
    return str(f)


def run(h, tmp_path, batch_id, ids, *args):
    return h.main("--batch", batch_file(tmp_path, batch_id, ids), *args)


def item(url, batch_id, cid):
    return q(url, "SELECT review, extracted_at FROM ops.batch_item WHERE batch_id = %s AND concept_id = %s",
             (batch_id, cid))[0]


def batch_status(url, batch_id):
    return q(url, "SELECT status FROM ops.batch WHERE batch_id = %s", (batch_id,))[0][0]


def approve(url, batch_id, cid):
    """A pharmacist approval as the API records it: the decision, then the item's review and the batch status."""
    with psycopg.connect(url) as c:
        decided_at = c.execute(
            """INSERT INTO ops.review_decision (batch_id, concept_id, decision, reviewer_email, reviewer_role)
               VALUES (%s, %s, 'ok', %s, 'pharmacist') RETURNING decided_at""", (batch_id, cid, REVIEWER)).fetchone()[0]
        c.execute("UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))
        c.execute("""UPDATE ops.batch b SET status = 'approved' WHERE batch_id = %s
                       AND NOT EXISTS (SELECT 1 FROM ops.batch_item bi WHERE bi.batch_id = b.batch_id AND bi.review <> 'ok')""",
                  (batch_id,))
    return decided_at


def assert_reopened(url, batch_id, cid, decided_at):
    review, extracted_at = item(url, batch_id, cid)
    assert review == "pending" and extracted_at > decided_at, (batch_id, cid, review)
    assert batch_status(url, batch_id) == "in_review"
    # the decision history is kept
    assert q(url, "SELECT decision, reviewer_role FROM ops.review_decision WHERE batch_id = %s AND concept_id = %s",
             (batch_id, cid)) == [("ok", "pharmacist")]


def ddinter_codes(url, cid):
    return q(url, """SELECT dd.code, dd.method FROM curated.brand_product_ingredient bpi
                       JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                       JOIN curated.substance_code dd ON dd.bds_id = xm.bds_id AND dd.system = 'DDINTER'
                      WHERE bpi.concept_id = %s ORDER BY dd.code""", (cid,))


def coverage(url, cid):
    return q(url, """SELECT ic.coverage FROM curated.brand_product_ingredient bpi
                       JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                       JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                      WHERE bpi.concept_id = %s""", (cid,))


# --- the reviewer's concrete case ----------------------------------------------------------------


def test_name_only_ddinter_match_added_through_another_batch_reopens_an_approved_product(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter({ALIAS: "Shared-alias"})
    assert run(Harness(url, dd), tmp_path, "0300-a", [X]) == 0
    assert coverage(url, X) == [("none",)]
    decided = approve(url, "0300-a", X)
    assert batch_status(url, "0300-a") == "approved"

    # Y (pending, batch B) brings a dgda_content name for the shared substance that DDInter knows
    h = Harness(url, dd, concepts(y_content="Shared-alias 5 mg"))
    assert run(h, tmp_path, "0300-b", [Y]) == 0

    # X now shows a name-only DDInter mapping and full coverage: nobody approved that, so X is pending again
    assert ddinter_codes(url, X) == [(ALIAS, "name")] and coverage(url, X) == [("full",)]
    assert_reopened(url, "0300-a", X, decided)
    assert item(url, "0300-b", Y)[0] == "pending"
    assert any("0300-a" in r.getMessage() and X in r.getMessage() for r in caplog.records
               if r.name == "run_pipeline"), "the re-opened records are logged"


def test_a_substances_stage_change_alone_reopens_dependents(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0301-a", [X]) == 0
    decided = approve(url, "0301-a", X)
    h = Harness(url, dd, concepts(y_content="Shared-alias 5 mg"))  # a new dgda_content name for the substance
    assert run(h, tmp_path, "0301-b", [Y], "--stages", "dgda,substances") == 0
    assert_reopened(url, "0301-a", X, decided)


@pytest.mark.parametrize("first, second", [({}, BOTH), (BOTH, {})], ids=["none-to-full", "full-to-none"])
def test_a_coverage_flip_through_another_batch_reopens_an_approved_product(url, tmp_path, first, second):
    assert run(Harness(url, FakeDDInter(first)), tmp_path, "0302-a", [X]) == 0
    decided = approve(url, "0302-a", X)
    assert run(Harness(url, FakeDDInter(second)), tmp_path, "0302-b", [Y]) == 0
    assert coverage(url, X) == [("full" if second else "none",)]
    assert_reopened(url, "0302-a", X, decided)


def test_a_changed_pair_reopens_the_products_on_both_sides(url, tmp_path):
    pair = frozenset((SH, OT))
    assert run(Harness(url, FakeDDInter(BOTH, {pair: "major"})), tmp_path, "0303-a", [X, Z]) == 0
    decided_x, decided_z = approve(url, "0303-a", X), approve(url, "0303-a", Z)
    # DDInter downgraded the pair; Y (sharing X's substance) re-stores it
    assert run(Harness(url, FakeDDInter(BOTH, {pair: "minor"})), tmp_path, "0303-b", [Y]) == 0
    assert q(url, "SELECT severity FROM curated.ddinter_pair") == [("minor",)]
    assert_reopened(url, "0303-a", X, decided_x)
    assert_reopened(url, "0303-a", Z, decided_z)


def test_an_identical_run_in_another_batch_keeps_approvals(url, tmp_path):
    dd = FakeDDInter(BOTH, {frozenset((SH, OT)): "major"})
    assert run(Harness(url, dd), tmp_path, "0304-a", [X, Z]) == 0
    approve(url, "0304-a", X)
    approve(url, "0304-a", Z)
    before = q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0304-a' ORDER BY 1")
    assert run(Harness(url, dd), tmp_path, "0304-b", [Y]) == 0  # same substance, same names, same DDInter data
    assert q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0304-a' ORDER BY 1") == before
    assert batch_status(url, "0304-a") == "approved"


def test_only_the_latest_item_of_a_dependent_product_is_reopened(url, tmp_path):
    dd = FakeDDInter({})
    assert run(Harness(url, dd), tmp_path, "0305-a", [X]) == 0
    approve(url, "0305-a", X)
    assert run(Harness(url, dd), tmp_path, "0305-c", [X]) == 0  # X re-run in a later batch, approved there
    decided = approve(url, "0305-c", X)
    old = item(url, "0305-a", X)
    assert run(Harness(url, FakeDDInter(BOTH)), tmp_path, "0305-b", [Y]) == 0  # coverage none -> full
    assert_reopened(url, "0305-c", X, decided)
    assert item(url, "0305-a", X) == old  # not the gate's record any more: left alone


def test_a_product_whose_savepoint_rolled_back_reopens_nothing(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0306-a", [X]) == 0
    approve(url, "0306-a", X)
    before = item(url, "0306-a", X)
    # Y adds a new icd11 name to the shared substance, then RxNav fails: Y's savepoint rolls back
    h = Harness(url, dd, concepts(y_ingredient="Sharedium alt"), FakeRxNav(raise_for={"Sharedium alt"}))
    assert run(h, tmp_path, "0306-b", [Y], "--stages", "dgda,substances") == 0
    assert q(url, "SELECT status FROM ops.stage_result WHERE batch_id = '0306-b' AND stage = 'substances'") == [("fail",)]
    assert q(url, "SELECT count(*) FROM curated.substance_name WHERE name = 'Sharedium alt'") == [(0,)]
    assert item(url, "0306-a", X) == before


def test_a_rolled_back_ddinter_chunk_reopens_nothing(url, tmp_path):
    assert run(Harness(url, FakeDDInter({})), tmp_path, "0307-a", [X]) == 0
    approve(url, "0307-a", X)
    before = item(url, "0307-a", X)
    # Y flips the shared coverage to full, then W (same chunk) aborts the chunk
    dd = FakeDDInter(BOTH | {WX: "Wexium"}, raise_at={WX: psycopg.errors.QueryCanceled("statement timeout")})
    assert run(Harness(url, dd), tmp_path, "0307-b", [Y, W]) == 1
    assert coverage(url, X) == [("none",)]
    assert item(url, "0307-a", X) == before


# --- reopen_review(..., changes) ------------------------------------------------------------------


def test_reopen_review_with_changes_reopens_dependents_and_returns_them(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0308-a", [X, Z]) == 0
    approve(url, "0308-a", X)
    approve(url, "0308-a", Z)
    assert run(Harness(url, dd), tmp_path, "0308-b", [Y]) == 0
    sh = q(url, "SELECT bds_id FROM curated.substance_code WHERE system = 'ICD11_XM' AND code = 'XMSH1'")[0][0]
    with psycopg.connect(url) as c:
        assert reopen_review(c, "0308-b", [Y]) == []  # no shared change: only the targets
        assert reopen_review(c, "0308-b", [Y], SharedChanges()) == []
        assert item(url, "0308-a", X)[0] == "ok"
    before_y = item(url, "0308-b", Y)[1]
    with psycopg.connect(url) as c:
        got = reopen_review(c, "0308-b", [Y], SharedChanges(bds_ids={sh}, ddinter_ids={OT}))
    # X through the substance, Z through its DDInter id; Y is a target (stamped, not returned)
    assert got == [("0308-a", X), ("0308-a", Z)]
    assert item(url, "0308-a", X)[0] == item(url, "0308-a", Z)[0] == "pending"
    assert batch_status(url, "0308-a") == "in_review"
    review_y, stamp_y = item(url, "0308-b", Y)
    assert review_y == "pending" and stamp_y > before_y
