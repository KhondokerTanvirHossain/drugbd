"""Sprint 3 Task 2: chunked DDInter stage, single-record re-runs (--concept), batch run history."""
import contextlib
import logging
import pathlib
import re
from types import SimpleNamespace

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from bddrug_etl.ddinter.client import DDInterPairRow
from bddrug_etl.ddinter.html import DDInterDrug, InteractionText
from bddrug_etl.jobs import run_pipeline

ROOT = pathlib.Path(__file__).resolve().parents[2]
N = 10
P = {n: f"300-0000-{n:03d}--testdrug{n}" for n in range(1, N + 1)}  # P[1] .. P[10]
ALL = [P[n] for n in range(1, N + 1)]
MISSING = "typo-id"
DD = {n: f"DDInter{9000 + n}" for n in range(1, N + 1)}
NOT_RUN = "not run: stage aborted at chunk {}"
LOG_LINE = re.compile(r"^batch=\S+ dgda=(\d+/\d+/\d+|-) substances=(\d+/\d+/\d+|-) "
                      r"clinical=(\d+/\d+/\d+|-) ddinter=(\d+/\d+/\d+|-)$")
REVIEWER = "pharm@example.test"


def concept(n):
    cid = P[n]
    return {"id": cid, "concept_class": "Drug", "retired": False, "display_name": cid,
            "extras": {"company": "Co", "dar_number": cid[:12], "trade_name": f"Brand{n}", "dosage_form": "Tablet",
                       "dar_quality_flag": "", "generic_content_raw": f"Testdrug{n} 5 mg"},
            "mappings": [{"map_type": "Has-active-ingredient", "retired": False,
                          "to_concept_code": f"XMT{n:03d}", "to_concept_name": f"Testdrug{n}"}]}


CONCEPTS = {P[n]: concept(n) for n in P}
# DDInter graph: each drug interacts with its neighbours, plus 2 <-> 9 (a pair split across chunks)
EDGES = {frozenset((DD[n], DD[n + 1])) for n in range(1, N)} | {frozenset((DD[2], DD[9]))}


def iid(a, b):
    lo, hi = sorted((a, b))
    return f"I-{lo}-{hi}"


class FakeOcl:
    def __init__(self):
        self.asked: list[str] = []

    def get_concept(self, owner, source, concept_id):
        self.asked.append(concept_id)
        return CONCEPTS.get(concept_id)


class FakeRxNav:
    def rxcui_for_name(self, name):
        return None

    def codes_for_rxcui(self, rxcui):
        raise AssertionError("no rxcui is ever found")


class FakeDDInter:
    """Ten drugs, Testdrug1..10. ``raise_at`` maps a DDInter id to an exception its detail call raises;
    ``probe`` is called once with the DDInter id on the first detail call of ``probe_at``."""

    def __init__(self, raise_at=None, probe_at=None, probe=None):
        self.raise_at = raise_at or {}
        self.probe_at, self.probe = probe_at, probe
        self.drug_list_calls = 0
        self.detail_calls: list[str] = []
        self.text_calls: list[str] = []

    def drug_list(self):
        self.drug_list_calls += 1
        return [(DD[n], f"Testdrug{n}") for n in range(1, N + 1)]

    def drug_detail(self, ddinter_id):
        self.detail_calls.append(ddinter_id)
        if ddinter_id == self.probe_at and self.probe:
            probe, self.probe = self.probe, None
            probe(ddinter_id)
        if ddinter_id in self.raise_at:
            raise self.raise_at[ddinter_id]
        n = int(ddinter_id.removeprefix("DDInter")) - 9000
        return DDInterDrug(ddinter_id, f"Testdrug{n}", (), None)

    def graph(self, ddinter_id):
        rows = []
        for e in sorted(EDGES, key=sorted):
            if ddinter_id in e:
                (other,) = e - {ddinter_id}
                rows.append(DDInterPairRow(other, f"Testdrug{int(other[7:]) - 9000}", "major", ()))
        return rows

    def diseases(self, ddinter_id):
        return []

    def foods(self, ddinter_id):
        return []

    def pair_interaction_id(self, ddinter_id, partner_id):
        return iid(ddinter_id, partner_id) if frozenset((ddinter_id, partner_id)) in EDGES else None

    def interaction(self, interaction_id):
        self.text_calls.append(interaction_id)
        return InteractionText(f"text {interaction_id}", "Monitor.", ())


class Harness:
    def __init__(self, url, ddinter=None):
        self.url = url
        self.ocl, self.rxnav, self.ddinter = FakeOcl(), FakeRxNav(), ddinter or FakeDDInter()

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
    """Every test starts without DDInter data, so mapping and text counts are its own."""
    with psycopg.connect(url) as c:
        for t in ("ddinter_pair", "ddinter_interaction_text", "ddinter_disease", "ddinter_food", "ddinter_drug",
                  "interaction_coverage"):
            c.execute(f"DELETE FROM curated.{t}")
        c.execute("DELETE FROM curated.substance_code WHERE system = 'DDINTER'")
        c.execute("DELETE FROM curated.substance_name WHERE name_type = 'ddinter'")


def q(url, sql, params=()):
    with psycopg.connect(url) as c:
        return c.execute(sql, params).fetchall()


def batch_file(tmp_path, name, ids):
    f = tmp_path / f"{name}.txt"
    f.write_text("\n".join(ids) + "\n")
    return str(f)


def results(url, batch_id, stage):
    return {c: (st, note) for c, st, note in q(
        url, "SELECT concept_id, status, note FROM ops.stage_result WHERE batch_id = %s AND stage = %s",
        (batch_id, stage))}


def committed_ddinter_ids(url, batch_id):
    return {c for (c,) in q(url, "SELECT concept_id FROM ops.stage_result WHERE batch_id = %s AND stage = 'ddinter'",
                            (batch_id,))}


def mapped_ddinter(url):
    return {c for (c,) in q(url, "SELECT code FROM curated.substance_code WHERE system = 'DDINTER'")}


def items(url, batch_id):
    return {c: (r, n, x) for c, r, n, x in q(
        url, "SELECT concept_id, review, note, extracted_at FROM ops.batch_item WHERE batch_id = %s", (batch_id,))}


def curated_counts(url):
    tables = ["curated.ddinter_drug", "curated.ddinter_pair", "curated.ddinter_interaction_text",
              "curated.interaction_coverage", "curated.substance", "curated.substance_code", "curated.substance_name",
              "curated.brand_product", "curated.clinical_drug"]
    return {t: q(url, f"SELECT count(*) FROM {t}")[0][0] for t in tables}


def batch_runs(url, batch_id):
    return q(url, "SELECT stages, counts, concept_ids FROM ops.batch_run WHERE batch_id = %s ORDER BY id", (batch_id,))


def approve(url, batch_id, cid):
    with psycopg.connect(url) as c:
        decided_at = c.execute(
            """INSERT INTO ops.review_decision (batch_id, concept_id, decision, reviewer_email, reviewer_role)
               VALUES (%s, %s, 'ok', %s, 'pharmacist') RETURNING decided_at""", (batch_id, cid, REVIEWER)).fetchone()[0]
        c.execute("UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))
    return decided_at


def final_line(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "run_pipeline"][-1]


def loaded(h, tmp_path, name, ids):
    """Load the batch through dgda, substances and clinical; return its batch file."""
    f = batch_file(tmp_path, name, ids)
    assert h.main("--batch", f, "--stages", "dgda,substances,clinical") == 0
    return f


# --- chunking (Review Focus 5) --------------------------------------------------------------------

@pytest.mark.parametrize("chunk_args, committed_before_p7", [
    ((), 5),                        # default: 5 per chunk -> P1-P5 committed when P7 starts
    (("--ddinter-chunk", "3"), 6),  # [1-3][4-6][7-9][10]
    (("--ddinter-chunk", "10"), 0),  # one chunk: nothing is committed until the end
])
def test_ddinter_commits_every_chunk_with_its_results(url, tmp_path, chunk_args, committed_before_p7):
    batch_id = f"0201-chunks-{committed_before_p7}"
    seen = {}

    def probe(_):
        seen["results"] = committed_ddinter_ids(url, batch_id)
        seen["mapped"] = mapped_ddinter(url)
        seen["stamped"] = {c for c, (r, _, x) in items(url, batch_id).items() if x > seen_before[c]}

    h = Harness(url, FakeDDInter(probe_at=DD[7], probe=probe))
    f = loaded(h, tmp_path, batch_id, ALL)
    seen_before = {c: x for c, (_, _, x) in items(url, batch_id).items()}
    assert h.main("--batch", f, "--stages", "ddinter", *chunk_args) == 0
    first = set(ALL[:committed_before_p7])
    # read on a fresh connection while P7 was being processed: only whole earlier chunks are visible,
    # each with its curated rows, its stage results and its re-opened review
    assert seen["results"] == first
    assert seen["mapped"] == {DD[n] for n in range(1, committed_before_p7 + 1)}
    assert seen["stamped"] == first
    # at the end every product is committed
    res = results(url, batch_id, "ddinter")
    assert set(res) == set(ALL) and all(st in ("ok", "warn") for st, _ in res.values())
    assert mapped_ddinter(url) == set(DD.values())


def test_ddinter_planning_and_caches_cover_the_whole_run(url, tmp_path):
    h = Harness(url)
    f = loaded(h, tmp_path, "0202-caches", ALL)
    assert h.main("--batch", f, "--stages", "ddinter", "--ddinter-chunk", "2") == 0
    assert h.ddinter.drug_list_calls == 1
    assert sorted(h.ddinter.detail_calls) == sorted(DD.values())  # each drug fetched once across 5 chunks
    # P2 (chunk 1) and P9 (chunk 5) interact: the text is fetched once, because planning covered the whole run
    assert h.ddinter.text_calls.count(iid(DD[2], DD[9])) == 1
    assert sorted(h.ddinter.text_calls) == sorted(iid(*sorted(e)) for e in EDGES)
    assert q(url, "SELECT interaction_id FROM curated.ddinter_pair WHERE ddinter_a = %s AND ddinter_b = %s",
             tuple(sorted((DD[2], DD[9])))) == [(iid(DD[2], DD[9]),)]


@pytest.mark.parametrize("exc", [psycopg.errors.QueryCanceled("canceling statement due to statement timeout"),
                                 psycopg.InterfaceError("the cursor is closed")])
def test_a_crash_at_product_7_keeps_committed_chunks_and_fails_the_rest(url, tmp_path, caplog, exc):
    """An exception that escapes the per-product isolation, raised by the client at product 7 of 10."""
    caplog.set_level(logging.INFO)
    batch_id = f"0203-crash-{type(exc).__name__}"
    h = Harness(url, FakeDDInter(raise_at={DD[7]: exc}))
    f = loaded(h, tmp_path, batch_id, ALL)
    before = items(url, batch_id)
    assert h.main("--batch", f, "--stages", "ddinter") != 0
    res = results(url, batch_id, "ddinter")
    for n in range(1, 6):  # chunk 1 committed: data, results, review re-opened
        assert res[P[n]][0] in ("ok", "warn"), n
        assert items(url, batch_id)[P[n]][2] > before[P[n]][2]
    assert mapped_ddinter(url) == {DD[n] for n in range(1, 6)}  # P6 ran in chunk 2 and was rolled back
    assert res[P[7]] == ("fail", f"error: {type(exc).__name__}: {exc}")
    for n in (6, 8, 9, 10):
        assert res[P[n]] == ("fail", NOT_RUN.format(2)), n
        assert items(url, batch_id)[P[n]] == before[P[n]]  # nothing of chunk 2 committed: review untouched
    assert final_line(caplog) == f"batch={batch_id} dgda=- substances=- clinical=- ddinter={_c(res)}"
    assert batch_runs(url, batch_id)[-1] == (["ddinter"], {"ddinter": _counts(res)}, [])

    # the re-run continues: everything is processed, nothing is duplicated, stored texts are not fetched again
    counts_after_crash = curated_counts(url)
    h2 = Harness(url)
    assert h2.main("--batch", f, "--stages", "ddinter") == 0
    res = results(url, batch_id, "ddinter")
    assert set(res) == set(ALL) and all(st in ("ok", "warn") for st, _ in res.values())
    assert mapped_ddinter(url) == set(DD.values())
    stored_in_chunk_1 = {iid(DD[a], DD[b]) for a, b in ((1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (2, 9))}
    assert not stored_in_chunk_1 & set(h2.ddinter.text_calls)
    once = curated_counts(url)
    assert once["curated.ddinter_pair"] == len(EDGES) == q(url, "SELECT count(*) FROM curated.ddinter_interaction_text")[0][0]
    assert once["curated.substance"] == counts_after_crash["curated.substance"]
    assert q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = %s", (batch_id,)) == [(4 * N,)]
    assert Harness(url).main("--batch", f, "--stages", "ddinter") == 0
    assert curated_counts(url) == once


def test_a_stage_abort_with_a_multi_line_postgres_error_gives_a_one_line_note(url, tmp_path):
    """The stage-abort path: the public batch report shows the first line only, no CONTEXT / tuple internals."""
    batch_id = "0203-crash-multiline"
    exc = psycopg.errors.QueryCanceled("canceling statement due to statement timeout\n"
                                       "CONTEXT:  while updating tuple (0,84) in relation \"batch_item\"")
    h = Harness(url, FakeDDInter(raise_at={DD[7]: exc}))
    f = loaded(h, tmp_path, batch_id, ALL)
    assert h.main("--batch", f, "--stages", "ddinter") != 0
    res = results(url, batch_id, "ddinter")
    assert res[P[7]] == ("fail", "error: QueryCanceled: canceling statement due to statement timeout")
    assert all("\n" not in note and "CONTEXT" not in note for _, note in res.values())


def test_a_runtime_error_from_the_client_at_product_7_fails_only_that_product(url, tmp_path):
    """A non-connection error stays inside the product's savepoint (the per-product isolation rule)."""
    batch_id = "0204-runtime"
    h = Harness(url, FakeDDInter(raise_at={DD[7]: RuntimeError("DDInter HTTP 500")}))
    f = loaded(h, tmp_path, batch_id, ALL)
    assert h.main("--batch", f, "--stages", "ddinter") == 0
    res = results(url, batch_id, "ddinter")
    assert res[P[7]] == ("fail", "error: RuntimeError: DDInter HTTP 500")
    assert all(res[P[n]][0] in ("ok", "warn") for n in P if n != 7)
    assert mapped_ddinter(url) == {DD[n] for n in P if n != 7}


def test_an_exception_while_committing_a_chunk_fails_it_and_marks_later_chunks_not_run(url, tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    batch_id = "0205-commit-boom"
    h = Harness(url)
    f = loaded(h, tmp_path, batch_id, ALL)
    real, calls = run_pipeline.reopen_review, []

    def boom_on_third_chunk(conn, b, ids, *rest):
        calls.append(list(ids))
        if len(calls) == 3:
            raise RuntimeError("chunk bookkeeping exploded")
        return real(conn, b, ids, *rest)
    monkeypatch.setattr(run_pipeline, "reopen_review", boom_on_third_chunk)
    assert h.main("--batch", f, "--stages", "ddinter", "--ddinter-chunk", "3") != 0
    assert calls == [ALL[0:3], ALL[3:6], ALL[6:9]]
    res = results(url, batch_id, "ddinter")
    assert all(res[P[n]][0] in ("ok", "warn") for n in range(1, 7))
    for n in (7, 8, 9):
        assert res[P[n]] == ("fail", "error: RuntimeError: chunk bookkeeping exploded")
    assert res[P[10]] == ("fail", NOT_RUN.format(3))
    assert mapped_ddinter(url) == {DD[n] for n in range(1, 7)}
    assert final_line(caplog).endswith(" ddinter=" + _c(res))


def test_skipped_products_keep_their_skip_note_in_a_chunked_run(url, tmp_path):
    h = Harness(url)
    f = loaded(h, tmp_path, "0206-skip", [P[1], MISSING, P[2]])
    assert h.main("--batch", f, "--stages", "ddinter", "--ddinter-chunk", "1") == 0
    res = results(url, "0206-skip", "ddinter")
    assert res[MISSING] == ("fail", run_pipeline.SKIP_NOTE)
    assert res[P[1]][0] in ("ok", "warn") and res[P[2]][0] in ("ok", "warn")


@pytest.mark.parametrize("bad", ["0", "-1", "x"])
def test_ddinter_chunk_must_be_a_positive_integer(url, tmp_path, bad):
    with pytest.raises(SystemExit) as e:
        Harness(url).main("--batch", batch_file(tmp_path, "0207-bad", [P[1]]), "--ddinter-chunk", bad)
    assert e.value.code == 2


# --- single record (--concept) ---------------------------------------------------------------------

def test_concept_runs_only_that_item_and_resets_only_its_review(url, tmp_path):
    batch_id = "0210-single"
    f = batch_file(tmp_path, batch_id, [P[1], P[2], P[3], MISSING])
    assert Harness(url).main("--batch", f) == 0
    approve(url, batch_id, P[1])
    decided_2 = approve(url, batch_id, P[2])
    batch_before = q(url, "SELECT item_count, run_at FROM ops.batch WHERE batch_id = %s", (batch_id,))
    items_before = items(url, batch_id)
    stage_before = {(c, s): t for c, s, t in q(
        url, "SELECT concept_id, stage, updated_at FROM ops.stage_result WHERE batch_id = %s", (batch_id,))}

    h = Harness(url)
    assert h.main("--batch", f, "--concept", P[2]) == 0
    assert h.ocl.asked == [P[2]]
    assert h.ddinter.detail_calls == [DD[2]]
    after = items(url, batch_id)
    review, note, extracted_at = after[P[2]]
    assert (review, note) == ("pending", None) and extracted_at > decided_2
    for other in (P[1], P[3], MISSING):
        assert after[other] == items_before[other], other  # P1 keeps its 'ok', the others are untouched
    assert after[P[1]][0] == "ok"
    stage_after = {(c, s): t for c, s, t in q(
        url, "SELECT concept_id, stage, updated_at FROM ops.stage_result WHERE batch_id = %s", (batch_id,))}
    assert stage_after.keys() == stage_before.keys()
    for (c, s), t in stage_after.items():
        assert (t > stage_before[(c, s)]) == (c == P[2]), (c, s)
    assert q(url, "SELECT item_count, run_at FROM ops.batch WHERE batch_id = %s", (batch_id,)) == batch_before
    assert q(url, "SELECT status FROM ops.batch WHERE batch_id = %s", (batch_id,)) == [("in_review",)]
    assert q(url, "SELECT count(*) FROM ops.review_decision WHERE batch_id = %s", (batch_id,)) == [(2,)]


def test_concept_with_later_stages_only_rewrites_only_that_item(url, tmp_path):
    batch_id = "0211-single-ddinter"
    f = batch_file(tmp_path, batch_id, [P[1], P[2], P[3]])
    assert Harness(url).main("--batch", f) == 0
    approve(url, batch_id, P[1])
    before = items(url, batch_id)
    h = Harness(url)
    assert h.main("--batch", f, "--concept", P[3], "--stages", "ddinter") == 0
    assert h.ocl.asked == [] and h.ddinter.detail_calls == [DD[3]]
    after = items(url, batch_id)
    assert after[P[1]] == before[P[1]] and after[P[2]] == before[P[2]]
    assert after[P[3]][0] == "pending" and after[P[3]][2] > before[P[3]][2]


def test_concept_that_fails_dgda_is_recorded_as_an_issue_for_that_item_only(url, tmp_path):
    batch_id = "0212-single-missing"
    f = batch_file(tmp_path, batch_id, [P[1], MISSING])
    assert Harness(url).main("--batch", f) == 0
    before = items(url, batch_id)
    assert Harness(url).main("--batch", f, "--concept", MISSING) == 0
    after = items(url, batch_id)
    assert after[P[1]] == before[P[1]]
    assert after[MISSING][:2] == ("issue", "not found at source") and after[MISSING][2] > before[MISSING][2]
    assert results(url, batch_id, "ddinter")[MISSING] == ("fail", run_pipeline.SKIP_NOTE)


def test_rerunning_a_single_record_twice_creates_no_duplicates(url, tmp_path):
    batch_id = "0213-single-twice"
    f = batch_file(tmp_path, batch_id, [P[4], P[5]])
    assert Harness(url).main("--batch", f) == 0
    assert Harness(url).main("--batch", f, "--concept", P[5]) == 0
    once = (curated_counts(url), q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = %s", (batch_id,)),
            q(url, "SELECT count(*) FROM ops.batch_item WHERE batch_id = %s", (batch_id,)))
    assert Harness(url).main("--batch", f, "--concept", P[5]) == 0
    assert (curated_counts(url), q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = %s", (batch_id,)),
            q(url, "SELECT count(*) FROM ops.batch_item WHERE batch_id = %s", (batch_id,))) == once
    assert once[1] == [(8,)] and once[2] == [(2,)]


def test_unknown_concept_exits_2_with_a_clear_message_and_writes_nothing(url, tmp_path, capsys):
    batch_id = "0214-unknown"
    f = batch_file(tmp_path, batch_id, [P[1]])
    h = Harness(url)
    with pytest.raises(SystemExit) as e:
        h.main("--batch", f, "--concept", P[1], "--concept", "nope-123")
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "nope-123" in err and f"{batch_id}.txt" in err and "not in the batch file" in err
    assert P[1] + "," not in err  # only the unknown id is named
    assert h.ocl.asked == []
    assert q(url, "SELECT count(*) FROM ops.batch_run WHERE batch_id = %s", (batch_id,)) == [(0,)]
    assert q(url, "SELECT count(*) FROM ops.batch WHERE batch_id = %s", (batch_id,)) == [(0,)]


def test_concept_on_a_batch_that_was_never_loaded_fails_without_writing(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    batch_id = "0215-never-loaded"
    h = Harness(url)
    assert h.main("--batch", batch_file(tmp_path, batch_id, [P[1], P[2]]), "--concept", P[1]) == 1
    assert h.ocl.asked == []
    assert q(url, "SELECT count(*) FROM ops.batch WHERE batch_id = %s", (batch_id,)) == [(0,)]
    assert q(url, "SELECT count(*) FROM ops.batch_item WHERE batch_id = %s", (batch_id,)) == [(0,)]
    assert batch_runs(url, batch_id) == []  # a refused run ran no stage: no history row
    assert any("has not been loaded" in r.getMessage() for r in caplog.records)


def test_concept_added_to_the_file_after_the_last_full_run_fails_without_writing(url, tmp_path, caplog):
    """A new line in the batch file needs a full run (item_count, removed items); --concept only re-runs items."""
    caplog.set_level(logging.INFO)
    batch_id = "0216-new-line"
    f = batch_file(tmp_path, batch_id, [P[1]])
    assert Harness(url).main("--batch", f) == 0
    before = (items(url, batch_id), q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = %s", (batch_id,)))
    f = batch_file(tmp_path, batch_id, [P[1], P[2]])
    for stages in ("dgda,substances,clinical,ddinter", "ddinter"):
        h = Harness(url)
        assert h.main("--batch", f, "--concept", P[2], "--stages", stages) == 1
        assert h.ocl.asked == [] and h.ddinter.drug_list_calls == 0
    assert (items(url, batch_id), q(url, "SELECT count(*) FROM ops.stage_result WHERE batch_id = %s", (batch_id,))) == before
    assert any(P[2] in r.getMessage() and "run the full batch first" in r.getMessage() for r in caplog.records)
    assert len(batch_runs(url, batch_id)) == 1  # only the full run


# --- batch run history -----------------------------------------------------------------------------

def _counts(res):
    return {s: sum(st == s for st, _ in res.values()) for s in ("ok", "warn", "fail")}


def _c(res):
    n = _counts(res)
    return f"{n['ok']}/{n['warn']}/{n['fail']}"


def test_batch_run_rows_for_a_full_run_and_a_single_record_run(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    batch_id = "0220-history"
    f = batch_file(tmp_path, batch_id, [P[1], P[2], P[3], MISSING])
    assert Harness(url).main("--batch", f) == 0
    full_line = final_line(caplog)
    assert LOG_LINE.match(full_line)
    rows = batch_runs(url, batch_id)
    assert len(rows) == 1
    stages, counts, concept_ids = rows[0]
    assert stages == list(run_pipeline.STAGES) and concept_ids == []
    assert counts == {s: _counts(results(url, batch_id, s)) for s in run_pipeline.STAGES}
    assert counts["dgda"] == {"ok": 3, "warn": 0, "fail": 1}
    # the counts are the ones the final log line shows
    assert full_line == f"batch={batch_id} " + " ".join(
        f"{s}={counts[s]['ok']}/{counts[s]['warn']}/{counts[s]['fail']}" for s in run_pipeline.STAGES)

    caplog.clear()
    assert Harness(url).main("--batch", f, "--concept", P[3], "--concept", P[1], "--concept", P[3],
                             "--stages", "ddinter,substances") == 0
    rows = batch_runs(url, batch_id)
    assert len(rows) == 2 and rows[0][0] == list(run_pipeline.STAGES)  # history is appended, not replaced
    stages, counts, concept_ids = rows[1]
    assert stages == ["substances", "ddinter"]
    assert concept_ids == [P[1], P[3]]  # batch-file order, de-duplicated
    assert set(counts) == {"substances", "ddinter"}
    assert all(sum(c.values()) == 2 for c in counts.values())  # only the processed items are counted
    line = final_line(caplog)
    assert LOG_LINE.match(line) and line.startswith(f"batch={batch_id} dgda=- substances=")
    assert line.endswith(f" ddinter={counts['ddinter']['ok']}/{counts['ddinter']['warn']}/{counts['ddinter']['fail']}")


def test_batch_run_is_recorded_for_a_run_whose_stage_failed(url, tmp_path, monkeypatch):
    batch_id = "0221-history-failed"
    f = batch_file(tmp_path, batch_id, [P[1], P[2]])

    def boom(conn, concept_ids):
        raise RuntimeError("clinical exploded")
    monkeypatch.setattr(run_pipeline, "build_clinical_drugs", boom)
    assert Harness(url).main("--batch", f) != 0
    [(stages, counts, concept_ids)] = batch_runs(url, batch_id)
    assert stages == list(run_pipeline.STAGES) and concept_ids == []
    assert set(counts) == {"dgda", "substances", "clinical"}  # ddinter never ran
    assert counts["clinical"] == {"ok": 0, "warn": 0, "fail": 2}
