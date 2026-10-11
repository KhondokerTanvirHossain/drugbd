import contextlib
import logging
import pathlib
import re
import tomllib
from types import SimpleNamespace

import httpx
import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.ddinter.client import DDInterClient, DDInterPairRow
from bddrug_etl.ddinter.html import DDInterDrug, InteractionText
from bddrug_etl.http.snapshot import SnapshotHttp
from bddrug_etl.jobs import run_pipeline
from bddrug_etl.ocl.client import OclClient
from bddrug_etl.rxnav.client import RxCodes, RxNavClient

ROOT = pathlib.Path(__file__).resolve().parents[2]
WARF, ASA, DOMP = "185-0138-012--g-warfarin", "076-0028-006--aspirin", "127-0263-018--domperidone"
NOT_DRUG, MISSING = "ingredient-1", "typo-id"
TESTIUM = "999-0000-001--testium"  # its substance (XMZZ99) is only ever created by the atomicity test
LOG_LINE = re.compile(r"^batch=\S+ dgda=(\d+/\d+/\d+|-) substances=(\d+/\d+/\d+|-) "
                      r"clinical=(\d+/\d+/\d+|-) ddinter=(\d+/\d+/\d+|-)$")


def concept(cid, form, content, ings, cls="Drug"):
    return {"id": cid, "concept_class": cls, "retired": False, "display_name": cid,
            "extras": {"company": "Co", "dar_number": cid[:12], "trade_name": cid, "dosage_form": form,
                       "dar_quality_flag": "", "generic_content_raw": content},
            "mappings": [{"map_type": "Has-active-ingredient", "retired": False,
                          "to_concept_code": xm, "to_concept_name": nm} for xm, nm in ings]}


CONCEPTS = {
    WARF: concept(WARF, "Tablet", "Warfarin Sodium 5 mg", [("XM86W0", "Warfarin")]),
    ASA: concept(ASA, "Tablet", "Aspirin 300 mg", [("XM4G06", "Acetylsalicylic acid")]),
    DOMP: concept(DOMP, "Tablet", "Domperidone 10 mg", [("XM3GF5", "Domperidone")]),
    NOT_DRUG: concept(NOT_DRUG, "Tablet", "Foo", [], cls="Ingredient"),
    TESTIUM: concept(TESTIUM, "Tablet", "Testium 5 mg", [("XMZZ99", "Testium")]),
}
RXCUI = {"warfarin": "11289", "acetylsalicylic acid": "1191", "aspirin": "1191", "domperidone": "3626"}


class FakeOcl:
    def __init__(self, events, fail=None):
        self.events, self.fail = events, fail

    def get_concept(self, owner, source, concept_id):
        self.events.append("ocl")
        if self.fail:
            raise self.fail
        return CONCEPTS.get(concept_id)


class FakeRxNav:
    def __init__(self, events):
        self.events = events

    def rxcui_for_name(self, name):
        self.events.append("rxnav")
        r = RXCUI.get(name.casefold())
        return (r, "rxnav-exact") if r else None

    def codes_for_rxcui(self, rxcui):
        self.events.append("rxnav")
        return RxCodes(rxcui, f"name-{rxcui}", "IN", (), (), ())


class FakeDDInter:
    """Warfarin <-> aspirin (major); no domperidone entry. ``fail`` makes drug_list raise."""

    def __init__(self, events, fail=None):
        self.events, self.fail = events, fail
        self.drug_list_calls = 0

    def drug_list(self):
        self.events.append("ddinter")
        self.drug_list_calls += 1
        if self.fail:
            raise self.fail
        return [("DDInter1951", "Warfarin"), ("DDInter20", "Acetylsalicylic acid")]

    def drug_detail(self, ddinter_id):
        name = {"DDInter1951": "Warfarin", "DDInter20": "Acetylsalicylic acid"}[ddinter_id]
        return DDInterDrug(ddinter_id, name, (), None)

    def graph(self, ddinter_id):
        partner = {"DDInter1951": ("DDInter20", "Acetylsalicylic acid"), "DDInter20": ("DDInter1951", "Warfarin")}
        return [DDInterPairRow(*partner[ddinter_id], "major", ())]

    def diseases(self, ddinter_id):
        return []

    def foods(self, ddinter_id):
        return []

    def pair_interaction_id(self, ddinter_id, partner_id):
        return "50001"

    def interaction(self, interaction_id):
        return InteractionText("Aspirin may increase the anticoagulant effect of warfarin.", "Monitor INR.", ())


class Harness:
    """Injectable connect + client factory; records which clients each run touched."""

    def __init__(self, url, ocl_fail=None, ddinter_fail=None):
        self.url = url
        self.events: list[str] = []
        self.ocl = FakeOcl(self.events, ocl_fail)
        self.rxnav = FakeRxNav(self.events)
        self.ddinter = FakeDDInter(self.events, ddinter_fail)
        self.factory_conns = []

    def connect(self):
        return psycopg.connect(self.url)

    @contextlib.contextmanager
    def clients(self, conn):
        self.factory_conns.append(conn)
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


def q(url, sql, params=()):
    """Read through a fresh connection: only committed data is visible."""
    with psycopg.connect(url) as c:
        return c.execute(sql, params).fetchall()


def batch_file(tmp_path, name, ids):
    f = tmp_path / f"{name}.txt"
    f.write_text("\n".join(ids) + "\n")
    return str(f)


@pytest.fixture
def stage_spy(monkeypatch):
    """Wrap the four stage entry points so the call order is observable."""
    calls: list[str] = []
    for stage, attr in (("dgda", "run_batch"), ("substances", "build_substances"),
                        ("clinical", "build_clinical_drugs"), ("ddinter", "plan_ddinter")):
        real = getattr(run_pipeline, attr)

        def spy(*a, _real=real, _stage=stage, **kw):
            calls.append(_stage)
            return _real(*a, **kw)
        monkeypatch.setattr(run_pipeline, attr, spy)
    return calls


def stage_rows(url, batch_id):
    return {(c, s): (st, note) for c, s, st, note in q(
        url, "SELECT concept_id, stage, status, note FROM ops.stage_result WHERE batch_id = %s", (batch_id,))}


def counts(url, batch_id, stage):
    rows = dict(q(url, """SELECT status, count(*) FROM ops.stage_result WHERE batch_id = %s AND stage = %s
                          GROUP BY status""", (batch_id, stage)))
    return f"{rows.get('ok', 0)}/{rows.get('warn', 0)}/{rows.get('fail', 0)}"


def final_line(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "run_pipeline"][-1]


# --- stage ordering and --stages subset ---------------------------------------------------------

def test_default_runs_all_four_stages_in_order_and_writes_a_row_per_item(url, tmp_path, stage_spy):
    h = Harness(url)
    ids = [WARF, ASA, DOMP, NOT_DRUG, MISSING]
    assert h.main("--batch", batch_file(tmp_path, "0101-all", ids)) == 0
    assert stage_spy == ["dgda", "substances", "clinical", "ddinter"]
    # client use follows stage order too
    assert h.events.index("ocl") < h.events.index("rxnav") < h.events.index("ddinter")
    assert max(i for i, e in enumerate(h.events) if e == "ocl") < h.events.index("rxnav")
    rows = stage_rows(url, "0101-all")
    for stage in run_pipeline.STAGES:
        assert {c for c, s in rows if s == stage} == set(ids), stage
    assert rows[(WARF, "dgda")] == ("ok", "")
    assert rows[(MISSING, "dgda")] == ("fail", "not found at source")
    assert rows[(NOT_DRUG, "dgda")] == ("fail", "not a registered Drug product")
    # a product that failed in dgda is not processed by later stages; it gets an explanatory fail
    for stage in ("substances", "clinical", "ddinter"):
        assert rows[(MISSING, stage)] == ("fail", run_pipeline.SKIP_NOTE)
        assert rows[(NOT_DRUG, stage)] == ("fail", run_pipeline.SKIP_NOTE)
        assert rows[(WARF, stage)][0] in ("ok", "warn")
    # the stages really ran on the loaded products
    assert q(url, "SELECT bdc_id IS NOT NULL FROM curated.brand_product WHERE concept_id = %s", (WARF,)) == [(True,)]
    assert q(url, "SELECT coverage FROM curated.interaction_coverage c JOIN curated.substance_code s USING (bds_id) "
                  "WHERE s.system = 'ICD11_XM' AND s.code = 'XM3GF5'") == [("none",)]
    # the stages use the pipeline's own connection
    assert len(h.factory_conns) == 1


def test_stages_subset_runs_only_those_in_canonical_order(url, tmp_path, stage_spy):
    h = Harness(url)
    f = batch_file(tmp_path, "0102-subset", [WARF, ASA, MISSING])
    assert h.main("--batch", f, "--stages", "dgda") == 0
    assert stage_spy == ["dgda"]
    assert {s for _, s in stage_rows(url, "0102-subset")} == {"dgda"}
    assert "rxnav" not in h.events and h.ddinter.drug_list_calls == 0

    stage_spy.clear()
    h2 = Harness(url)
    assert h2.main("--batch", f, "--stages", "ddinter,substances") == 0
    assert stage_spy == ["substances", "ddinter"]  # canonical order, not argument order
    assert "ocl" not in h2.events
    rows = stage_rows(url, "0102-subset")
    assert {s for _, s in rows} == {"dgda", "substances", "ddinter"}
    assert rows[(MISSING, "substances")] == ("fail", run_pipeline.SKIP_NOTE)  # dgda said not found
    assert rows[(WARF, "substances")][0] in ("ok", "warn")


def test_unknown_stage_is_a_usage_error(url, tmp_path):
    with pytest.raises(SystemExit) as e:
        Harness(url).main("--batch", batch_file(tmp_path, "0103-bad", [WARF]), "--stages", "dgda,foo")
    assert e.value.code == 2


def test_later_stages_without_a_loaded_batch_exit_non_zero(url, tmp_path, stage_spy, caplog):
    caplog.set_level(logging.INFO)
    h = Harness(url)
    assert h.main("--batch", batch_file(tmp_path, "0104-never-loaded", [WARF]), "--stages", "substances") != 0
    assert stage_spy == []
    assert q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = '0104-never-loaded'") == [(0,)]


# --- stage exceptions ---------------------------------------------------------------------------

def test_stage_exception_fails_every_product_stops_later_stages_and_keeps_earlier_ones(url, tmp_path, stage_spy, monkeypatch):
    def boom(conn, concept_ids):
        conn.execute("UPDATE curated.brand_product SET trade_name = 'MUST-ROLL-BACK' WHERE concept_id = %s", (WARF,))
        raise RuntimeError("clinical exploded " + "x" * 300)
    monkeypatch.setattr(run_pipeline, "build_clinical_drugs", boom)
    h = Harness(url)
    ids = [WARF, ASA, DOMP, MISSING]
    assert h.main("--batch", batch_file(tmp_path, "0105-boom", ids)) != 0
    assert stage_spy == ["dgda", "substances"]  # clinical is `boom` itself (replaced after the spy); ddinter never called
    assert h.ddinter.drug_list_calls == 0  # ddinter never ran
    rows = stage_rows(url, "0105-boom")  # read on a fresh connection: earlier stages were committed
    assert {(c, s) for c, s in rows if s in ("dgda", "substances")} == {(c, s) for c in ids for s in ("dgda", "substances")}
    assert rows[(WARF, "substances")][0] in ("ok", "warn")
    note = "error: RuntimeError: " + ("clinical exploded " + "x" * 300)[:200]
    for c in (WARF, ASA, DOMP):
        assert rows[(c, "clinical")] == ("fail", note)
    assert rows[(MISSING, "clinical")] == ("fail", run_pipeline.SKIP_NOTE)
    assert not any(s == "ddinter" for _, s in rows)
    # the failing stage's own writes were rolled back
    assert q(url, "SELECT trade_name FROM curated.brand_product WHERE concept_id = %s", (WARF,)) != [("MUST-ROLL-BACK",)]


def test_a_stage_is_one_transaction_so_its_per_product_work_is_rolled_back_on_exception(url, tmp_path, monkeypatch):
    real = run_pipeline.build_substances

    def late_boom(conn, rxnav, concept_ids, *rest):
        results = real(conn, rxnav, concept_ids, *rest)  # real per-product savepoints and writes
        assert [r.concept_id for r in results] == [TESTIUM]
        raise RuntimeError("after the products")
    monkeypatch.setattr(run_pipeline, "build_substances", late_boom)
    assert Harness(url).main("--batch", batch_file(tmp_path, "0114-atomic", [TESTIUM])) != 0
    assert q(url, "SELECT count(*) FROM curated.substance_code WHERE system = 'ICD11_XM' AND code = 'XMZZ99'") == [(0,)]
    assert stage_rows(url, "0114-atomic")[(TESTIUM, "substances")] == ("fail", "error: RuntimeError: after the products")


def test_ddinter_run_level_exception_exits_non_zero_after_committing_three_stages(url, tmp_path):
    h = Harness(url, ddinter_fail=httpx.ConnectError("no route"))
    assert h.main("--batch", batch_file(tmp_path, "0106-ddinter-down", [WARF, ASA])) != 0
    rows = stage_rows(url, "0106-ddinter-down")
    for stage in ("dgda", "substances", "clinical"):
        assert rows[(WARF, stage)][0] in ("ok", "warn"), stage
    assert rows[(WARF, "ddinter")] == ("fail", "error: ConnectError: no route")
    assert rows[(ASA, "ddinter")] == ("fail", "error: ConnectError: no route")


def test_dgda_exception_on_a_rerun_fails_every_item_and_stops(url, tmp_path):
    f = batch_file(tmp_path, "0107-ocl-down", [WARF, ASA])
    assert Harness(url).main("--batch", f) == 0
    h = Harness(url, ocl_fail=httpx.ReadTimeout("slow"))
    assert h.main("--batch", f) != 0
    assert "rxnav" not in h.events and h.ddinter.drug_list_calls == 0
    rows = stage_rows(url, "0107-ocl-down")
    assert rows[(WARF, "dgda")] == ("fail", "error: ReadTimeout: slow")
    assert rows[(ASA, "dgda")] == ("fail", "error: ReadTimeout: slow")


def test_dgda_exception_on_a_new_batch_exits_non_zero_and_runs_nothing_else(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    h = Harness(url, ocl_fail=httpx.ConnectError("refused"))
    assert h.main("--batch", batch_file(tmp_path, "0113-ocl-down-new", [WARF])) != 0
    assert "rxnav" not in h.events and h.ddinter.drug_list_calls == 0
    assert q(url, "SELECT count(*) FROM ops.batch WHERE batch_id = '0113-ocl-down-new'") == [(0,)]
    assert final_line(caplog) == "batch=0113-ocl-down-new dgda=0/0/1 substances=- clinical=- ddinter=-"


def test_one_product_fail_does_not_stop_others_or_change_exit_code(url, tmp_path):
    h = Harness(url)
    assert h.main("--batch", batch_file(tmp_path, "0108-mixed", [MISSING, WARF])) == 0
    rows = stage_rows(url, "0108-mixed")
    assert rows[(MISSING, "dgda")][0] == "fail"
    assert rows[(WARF, "ddinter")][0] in ("ok", "warn")


# --- log line -----------------------------------------------------------------------------------

def test_final_log_line_has_counts_per_stage(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    assert Harness(url).main("--batch", batch_file(tmp_path, "0109-log", [WARF, ASA, DOMP, MISSING])) == 0
    line = final_line(caplog)
    assert LOG_LINE.match(line), line
    expected = "batch=0109-log " + " ".join(f"{s}={counts(url, '0109-log', s)}" for s in run_pipeline.STAGES)
    assert line == expected
    assert line.startswith("batch=0109-log dgda=3/0/1 substances=")


def test_final_log_line_marks_stages_not_run(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    assert Harness(url).main("--batch", batch_file(tmp_path, "0110-log", [WARF]), "--stages", "dgda") == 0
    assert final_line(caplog) == "batch=0110-log dgda=1/0/0 substances=- clinical=- ddinter=-"


def test_final_log_line_after_a_stage_exception(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    h = Harness(url, ddinter_fail=RuntimeError("down"))
    assert h.main("--batch", batch_file(tmp_path, "0111-log", [WARF, MISSING])) != 0
    line = final_line(caplog)
    assert line.startswith("batch=0111-log dgda=1/0/1 substances=")
    assert line.endswith(" ddinter=0/0/2")


# --- idempotency (Review Focus 5) ---------------------------------------------------------------

def test_full_pipeline_twice_mints_no_new_ids_and_replaces_stage_results(url, tmp_path):
    f = batch_file(tmp_path, "0112-twice", [WARF, ASA, DOMP])
    assert Harness(url).main("--batch", f) == 0
    snap = lambda: (q(url, "SELECT bds_id FROM curated.substance ORDER BY 1"),
                    q(url, "SELECT bdc_id FROM curated.clinical_drug ORDER BY 1"),
                    q(url, "SELECT count(*) FROM curated.substance_code"),
                    q(url, "SELECT count(*) FROM curated.substance_name"),
                    q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = '0112-twice'"))
    first = snap()
    assert Harness(url).main("--batch", f) == 0
    assert snap() == first
    assert first[4] == [(12,)]


# --- approval gate (Review Focus 3): every stage that rewrites a record re-opens its review -----

REVIEWER = "pharm@example.test"


def approve(url, batch_id, cid):
    """A pharmacist 'ok' (as Task 3's API records it) on a fresh connection; returns its decided_at."""
    with psycopg.connect(url) as c:
        decided_at = c.execute(
            """INSERT INTO ops.review_decision (batch_id, concept_id, decision, reviewer_email, reviewer_role)
               VALUES (%s, %s, 'ok', %s, 'pharmacist') RETURNING decided_at""", (batch_id, cid, REVIEWER)).fetchone()[0]
        c.execute("UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))
        c.execute("UPDATE ops.batch SET status = 'approved' WHERE batch_id = %s", (batch_id,))
    return decided_at


def item(url, batch_id, cid):
    return q(url, "SELECT review, extracted_at FROM ops.batch_item WHERE batch_id = %s AND concept_id = %s",
             (batch_id, cid))[0]


def decisions(url, batch_id):
    return q(url, "SELECT count(*) FROM ops.review_decision WHERE batch_id = %s", (batch_id,))[0][0]


def test_stage_only_rerun_after_an_ok_reopens_the_review_and_keeps_history(url, tmp_path):
    f = batch_file(tmp_path, "0115-stage-rerun", [WARF, ASA, MISSING])
    assert Harness(url).main("--batch", f) == 0
    decided_at = approve(url, "0115-stage-rerun", WARF)
    missing_before = item(url, "0115-stage-rerun", MISSING)
    assert Harness(url).main("--batch", f, "--stages", "substances,clinical,ddinter") == 0
    review, extracted_at = item(url, "0115-stage-rerun", WARF)
    assert review == "pending"
    assert extracted_at > decided_at  # the old 'ok' no longer counts under the approval rule
    assert item(url, "0115-stage-rerun", ASA)[0] == "pending"
    assert item(url, "0115-stage-rerun", MISSING) == missing_before  # skipped (dgda failed): nothing rewritten
    assert q(url, "SELECT status FROM ops.batch WHERE batch_id = '0115-stage-rerun'") == [("in_review",)]
    assert decisions(url, "0115-stage-rerun") == 1  # history kept


@pytest.mark.parametrize("stage", ["substances", "clinical", "ddinter"])
def test_each_product_stage_alone_reopens_the_review(url, tmp_path, stage):
    batch_id = f"0116-only-{stage}"
    f = batch_file(tmp_path, batch_id, [WARF])
    assert Harness(url).main("--batch", f) == 0
    decided_at = approve(url, batch_id, WARF)
    assert Harness(url).main("--batch", f, "--stages", stage) == 0
    review, extracted_at = item(url, batch_id, WARF)
    assert (review, extracted_at > decided_at) == ("pending", True)


def test_an_ok_recorded_while_a_later_stage_runs_does_not_approve_its_output(url, tmp_path, monkeypatch):
    """A pharmacist reviews after dgda but before the (slow) DDInter stage commits: that 'ok' must not count."""
    real = run_pipeline.plan_ddinter
    seen = {}

    class ReviewMidChunk:
        def __init__(self, plan):
            self.plan = plan

        def process(self, conn, cid, *rest):
            if "decided_at" not in seen:  # committed inside the open chunk transaction, before its stamp
                seen["decided_at"] = approve(url, "0117-mid-run", WARF)
            return self.plan.process(conn, cid, *rest)

    monkeypatch.setattr(run_pipeline, "plan_ddinter", lambda *a, **kw: ReviewMidChunk(real(*a, **kw)))
    assert Harness(url).main("--batch", batch_file(tmp_path, "0117-mid-run", [WARF, ASA])) == 0
    review, extracted_at = item(url, "0117-mid-run", WARF)
    assert review == "pending"
    assert extracted_at > seen["decided_at"]
    assert decisions(url, "0117-mid-run") == 1


def test_an_ok_recorded_while_dgda_loads_does_not_approve_its_output(url, tmp_path, monkeypatch):
    from bddrug_etl.load import batches
    f = batch_file(tmp_path, "0118-mid-dgda", [WARF])
    assert Harness(url).main("--batch", f, "--stages", "dgda") == 0
    real, seen = batches.load_products, {}

    def review_mid_load(conn, concepts, **kw):
        stats = real(conn, concepts, **kw)  # the dgda transaction is open now
        seen["decided_at"] = approve(url, "0118-mid-dgda", WARF)
        return stats
    monkeypatch.setattr(batches, "load_products", review_mid_load)
    assert Harness(url).main("--batch", f, "--stages", "dgda") == 0
    review, extracted_at = item(url, "0118-mid-dgda", WARF)
    assert (review, extracted_at > seen["decided_at"]) == ("pending", True)


def test_a_stage_that_rolls_back_leaves_the_review_alone(url, tmp_path, monkeypatch):
    """The stamp is part of the stage's transaction: no curated change, no re-opened review."""
    f = batch_file(tmp_path, "0119-rolled-back", [WARF])
    assert Harness(url).main("--batch", f) == 0
    approve(url, "0119-rolled-back", WARF)
    before = item(url, "0119-rolled-back", WARF)

    def boom(conn, concept_ids):
        raise RuntimeError("clinical exploded")
    monkeypatch.setattr(run_pipeline, "build_clinical_drugs", boom)
    assert Harness(url).main("--batch", f, "--stages", "clinical") != 0
    assert item(url, "0119-rolled-back", WARF) == before


# --- wiring ---------------------------------------------------------------------------------------

def test_console_script_points_at_run_pipeline_and_load_dgda_stays_importable():
    meta = tomllib.loads((ROOT / "etl/pyproject.toml").read_text())
    assert meta["project"]["scripts"]["bddrug-etl"] == "bddrug_etl.jobs.run_pipeline:main"
    from bddrug_etl.jobs import load_dgda
    assert callable(load_dgda.main)


def test_default_clients_wire_snapshot_http_with_polite_intervals(url):
    with psycopg.connect(url) as conn, run_pipeline.default_clients(conn) as c:
        assert isinstance(c.ocl, OclClient)
        assert isinstance(c.rxnav, RxNavClient) and isinstance(c.rxnav.http, SnapshotHttp)
        assert (c.rxnav.http.source, c.rxnav.http.min_interval_s, c.rxnav.http.conn) == ("rxnav", 0.1, conn)
        assert isinstance(c.ddinter, DDInterClient) and isinstance(c.ddinter.http, SnapshotHttp)
        assert (c.ddinter.http.source, c.ddinter.http.min_interval_s, c.ddinter.http.conn) == ("ddinter2", 1.0, conn)
        assert c.ddinter.http.http.follow_redirects is True
        rx_http, dd_http = c.rxnav.http.http, c.ddinter.http.http
    assert rx_http.is_closed and dd_http.is_closed


def test_workflow_command_is_unchanged():
    wf = (ROOT / ".github/workflows/load-dgda.yml").read_text()
    assert 'docker-compose --profile jobs run --rm etl --batch "/app/batches/$BATCH"' in wf
