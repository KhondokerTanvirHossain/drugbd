"""Spec §8.3.1, the P1C reopen rule (PO D5, D54): a record goes back to review only when something its approval covered
changes. Uses the products and fakes of test_shared_reopen: X and Y share substance XMSH1 (Sharedium, DDInter SH), Z has
Otherium (OT), W Wexium."""
import logging

import psycopg
from psycopg.types.json import Jsonb

from bddrug_etl.jobs import run_pipeline
from bddrug_etl.rxnav.client import RxCodes
from test_shared_reopen import (  # noqa: F401  (url and clean are fixtures)
    ALIAS, BOTH, OT, SH, X, Y, Z, FakeDDInter, FakeRxNav, Harness, approve, batch_status, clean, concept, concepts, coverage,
    ddinter_codes, item, q, run, url)

REMOVED = "removed from batch file"


def snapshots(url, batch_id, cid):
    return q(url, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))[0][0]


def stage_time(url, batch_id, cid):
    return q(url, "SELECT max(updated_at) FROM ops.stage_result WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))[0][0]


def note(url, batch_id, cid):
    return q(url, "SELECT note FROM ops.batch_item WHERE batch_id = %s AND concept_id = %s", (batch_id, cid))[0][0]


def reopened_lines(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "run_pipeline" and " re-opened " in r.getMessage()]


class NoText(FakeDDInter):
    """DDInter gives the pairs no interaction id: no text is fetched."""

    def pair_interaction_id(self, ddinter_id, partner_id):
        return None


class Richer(FakeDDInter):
    """The same entries, now with an interaction text, a disease and a food for each entry."""

    def diseases(self, ddinter_id):
        return [{"interaction_id": f"D-{ddinter_id}", "disease_name": "Liver disease", "severity": "moderate",
                 "text": "Check the dose.", "references": []}]

    def foods(self, ddinter_id):
        return [{"interaction_id": f"F-{ddinter_id}", "food_name": "Grapefruit", "severity": "minor", "mechanism": None,
                 "interaction": "Raises levels.", "management": "Avoid.", "references": []}]


class RxWithAtc(FakeRxNav):
    """RxNav now knows Sharedium, with an ATC code."""

    def rxcui_for_name(self, name):
        return ("90001", "rxnav-exact") if name == "Sharedium" else None

    def codes_for_rxcui(self, rxcui):
        return RxCodes(rxcui, "sharedium", "IN", ("N02BE01",), (), ())


def with_content(cid, content):
    table = concepts()
    c = table[cid]
    table[cid] = {**c, "extras": {**c["extras"], "generic_content_raw": content}}
    return table


def with_company(cid, company):
    table = concepts()
    c = table[cid]
    table[cid] = {**c, "extras": {**c["extras"], "company": company}}
    return table


def run_reopen(h, batch_id, ids):
    """An engineer's --reopen run of every stage (§8.3.1 item 5); True when no stage raised."""
    with h.connect() as conn, h.clients(conn) as clients:
        return run_pipeline.run_pipeline(conn, clients, batch_id, ids, reopen=True)[1]


def gate(url, cid):
    """The item the API's statusOf reads for the product: (batch_id, review, note)."""
    return q(url, """SELECT batch_id, review, note FROM ops.batch_item WHERE concept_id = %s
                     ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1""", (cid,))[0]


def public(url, cid):
    _, review, latest_note = gate(url, cid)
    return review == "ok" and latest_note != REMOVED


def latest_reason(url, batch_id, cid):
    return q(url, """SELECT reason FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s
                     ORDER BY extracted_at DESC LIMIT 1""", (batch_id, cid))[0][0]


def with_form(cid, form):
    table = concepts()
    c = table[cid]
    table[cid] = {**c, "extras": {**c["extras"], "dosage_form": form}}
    return table


# --- unchanged re-runs (S8) ----------------------------------------------------------------------

def test_unchanged_rerun_stamps_nothing(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter(BOTH, {frozenset((SH, OT)): "major"})
    assert run(Harness(url, dd), tmp_path, "0400-a", [X, Z]) == 0
    approve(url, "0400-a", X)
    before, snaps, stages = item(url, "0400-a", X), snapshots(url, "0400-a", X), stage_time(url, "0400-a", X)
    caplog.clear()
    assert run(Harness(url, dd), tmp_path, "0400-a", [X, Z]) == 0
    assert item(url, "0400-a", X) == before                      # still ok, same stamp
    assert snapshots(url, "0400-a", X) == snaps                  # no snapshot without a stamp
    assert stage_time(url, "0400-a", X) > stages                 # stage results are still replaced
    assert reopened_lines(caplog) and all(" re-opened 0 record(s)" in line for line in reopened_lines(caplog))


def test_rerun_against_a_v1_snapshot_stamps_nothing(url, tmp_path):
    """Review Focus 1: the pilot's snapshots are version 1 (no coverage). The P1C pilot check must stamp nothing."""
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0401-a", [X]) == 0
    approve(url, "0401-a", X)
    before = item(url, "0401-a", X)
    with psycopg.connect(url) as c:
        payload = c.execute("SELECT payload FROM ops.item_snapshot WHERE batch_id = %s AND concept_id = %s AND extracted_at = %s",
                            ("0401-a", X, before[1])).fetchone()[0]
        payload["version"] = 1
        for ing in payload["ingredients"]:
            ing.pop("coverage", None)
        # Only this throwaway test database switches the append-only trigger off, to stand in for a pre-P1C snapshot.
        c.execute("ALTER TABLE ops.item_snapshot DISABLE TRIGGER item_snapshot_append_only")
        c.execute("UPDATE ops.item_snapshot SET payload = %s WHERE batch_id = %s AND concept_id = %s AND extracted_at = %s",
                  (Jsonb(payload), "0401-a", X, before[1]))
        c.execute("ALTER TABLE ops.item_snapshot ENABLE TRIGGER item_snapshot_append_only")
    assert run(Harness(url, dd), tmp_path, "0401-a", [X], "--stages", "ddinter") == 0
    assert item(url, "0401-a", X) == before


def test_batch_status_recomputed_not_forced(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0402-a", [X]) == 0
    approve(url, "0402-a", X)
    assert batch_status(url, "0402-a") == "approved"
    assert run(Harness(url, dd), tmp_path, "0402-a", [X]) == 0
    assert batch_status(url, "0402-a") == "approved"


# --- what is not covered ---------------------------------------------------------------------------

def test_pair_change_reopens_no_record(url, tmp_path):
    pair = frozenset((SH, OT))
    assert run(Harness(url, NoText(BOTH, {pair: "major"})), tmp_path, "0403-a", [X, Z]) == 0
    approve(url, "0403-a", X)
    approve(url, "0403-a", Z)
    before = q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0403-a' ORDER BY 1")
    snaps = q(url, "SELECT count(*) FROM ops.item_snapshot")[0][0]
    # DDInter changes the pair's severity, gives it a text, and adds a disease and a food to each entry
    assert run(Harness(url, Richer(BOTH, {pair: "minor"})), tmp_path, "0403-a", [X, Z], "--stages", "ddinter") == 0
    assert q(url, "SELECT severity FROM curated.ddinter_pair") == [("minor",)]
    assert q(url, "SELECT count(*) FROM curated.ddinter_interaction_text")[0][0] == 1
    assert q(url, "SELECT count(*) FROM curated.ddinter_disease")[0][0] == 2
    assert q(url, "SELECT count(*) FROM curated.ddinter_food")[0][0] == 2
    assert q(url, "SELECT concept_id, review, extracted_at FROM ops.batch_item WHERE batch_id = '0403-a' ORDER BY 1") == before
    assert q(url, "SELECT count(*) FROM ops.item_snapshot")[0][0] == snaps
    assert batch_status(url, "0403-a") == "approved"


def test_other_route_entry_is_not_covered(url, tmp_path):
    assert run(Harness(url, FakeDDInter({SH: "Sharedium"})), tmp_path, "0404-a", [X]) == 0
    approve(url, "0404-a", X)
    before = item(url, "0404-a", X)
    # Y's run maps a new otic DDInter entry for the shared substance; X is systemic, so its chosen entry stays SH
    otic = FakeDDInter({SH: "Sharedium", "DDInter7005": "Sharedium (otic)"})
    assert run(Harness(url, otic), tmp_path, "0404-b", [Y]) == 0
    assert "DDInter7005" in [code for code, _ in ddinter_codes(url, X)]
    assert item(url, "0404-a", X) == before


# --- what is covered -------------------------------------------------------------------------------

def test_covered_change_reopens_a_strength_change_stamps_the_target_only(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0405-a", [X]) == 0
    assert run(Harness(url, dd), tmp_path, "0405-b", [Y]) == 0
    decided = approve(url, "0405-a", X)
    approve(url, "0405-b", Y)
    y_before = item(url, "0405-b", Y)
    assert run(Harness(url, dd, with_content(X, "Sharedium 10 mg")), tmp_path, "0405-a", [X]) == 0
    review, stamp = item(url, "0405-a", X)
    assert review == "pending" and stamp > decided
    assert item(url, "0405-b", Y) == y_before


def test_covered_change_reopens_a_route_change(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0406-a", [X]) == 0
    decided = approve(url, "0406-a", X)
    assert run(Harness(url, dd, with_form(X, "Eye Drops")), tmp_path, "0406-a", [X]) == 0
    review, stamp = item(url, "0406-a", X)
    assert review == "pending" and stamp > decided


def test_covered_change_reopens_a_new_atc_code_through_another_batch(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0407-a", [X]) == 0
    decided = approve(url, "0407-a", X)
    assert run(Harness(url, dd, rxnav=RxWithAtc()), tmp_path, "0407-b", [Y]) == 0
    review, stamp = item(url, "0407-a", X)
    assert review == "pending" and stamp > decided
    assert q(url, """SELECT reason FROM ops.item_snapshot WHERE batch_id = '0407-a' AND concept_id = %s
                     ORDER BY extracted_at DESC LIMIT 1""", (X,)) == [("shared_change",)]


def test_covered_change_reopens_a_chosen_entry_change(url, tmp_path):
    assert run(Harness(url, FakeDDInter({SH: "Sharedium"})), tmp_path, "0408-a", [X]) == 0
    decided = approve(url, "0408-a", X)
    dd = FakeDDInter({SH: "Sharedium", ALIAS: "Shared-alias"})
    assert run(Harness(url, dd, concepts(y_content="Shared-alias 5 mg")), tmp_path, "0408-b", [Y]) == 0
    review, stamp = item(url, "0408-a", X)
    assert review == "pending" and stamp > decided


def test_covered_change_reopens_coverage_full_to_none(url, tmp_path):
    assert run(Harness(url, FakeDDInter(BOTH)), tmp_path, "0409-a", [X]) == 0
    decided = approve(url, "0409-a", X)
    assert run(Harness(url, FakeDDInter({})), tmp_path, "0409-b", [Y]) == 0
    assert coverage(url, X) == [("none",)]
    review, stamp = item(url, "0409-a", X)
    assert review == "pending" and stamp > decided


# --- always stamped (§8.3.1 item 5) -----------------------------------------------------------------

def test_dgda_failure_still_stamps_issue(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0410-a", [X]) == 0
    decided = approve(url, "0410-a", X)
    gone = {k: v for k, v in concepts().items() if k != X}
    run(Harness(url, dd, gone), tmp_path, "0410-a", [X])
    review, stamp = item(url, "0410-a", X)
    assert (review, note(url, "0410-a", X)) == ("issue", "not found at source") and stamp > decided


def test_readded_item_is_stamped(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0411-a", [X, Z]) == 0
    approve(url, "0411-a", X)
    stamp = item(url, "0411-a", X)[1]
    assert run(Harness(url, dd), tmp_path, "0411-a", [Z]) == 0
    assert (item(url, "0411-a", X), note(url, "0411-a", X)) == (("ok", stamp), "removed from batch file")
    # statusOf reads a removed latest item as pending: never public while removed
    assert run(Harness(url, dd), tmp_path, "0411-a", [X, Z]) == 0
    review, again = item(url, "0411-a", X)
    assert (review, note(url, "0411-a", X)) == ("pending", None) and again > stamp


def test_note_written_without_stamp(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0412-a", [X, Z]) == 0
    approve(url, "0412-a", X)
    approve(url, "0412-a", Z)
    x_before, z_before = item(url, "0412-a", X), item(url, "0412-a", Z)
    assert run(Harness(url, dd), tmp_path, "0412-a", [Z]) == 0
    assert item(url, "0412-a", X) == x_before and note(url, "0412-a", X) == "removed from batch file"
    assert item(url, "0412-a", Z) == z_before and note(url, "0412-a", Z) is None
    assert batch_status(url, "0412-a") == "approved"   # Z is the batch's only current item, and it is ok


def test_a_dgda_load_that_recovers_reopens_the_pipelines_issue(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0413-a", [X]) == 0
    gone = {k: v for k, v in concepts().items() if k != X}
    run(Harness(url, dd, gone), tmp_path, "0413-a", [X])
    assert item(url, "0413-a", X)[0] == "issue"
    assert run(Harness(url, dd), tmp_path, "0413-a", [X]) == 0
    assert (item(url, "0413-a", X)[0], note(url, "0413-a", X)) == ("pending", None)


# --- a product listed again in a new batch (§8.3.1 item 8) ------------------------------------------

def test_relisted_product_carries_approval(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0414-a", [X]) == 0
    approve(url, "0414-a", X)
    a_before = item(url, "0414-a", X)
    assert run(Harness(url, dd), tmp_path, "0414-b", [X]) == 0
    assert item(url, "0414-b", X)[0] == "ok"
    carried = q(url, "SELECT reason, payload -> 'carried_from' FROM ops.item_snapshot WHERE batch_id = '0414-b' AND concept_id = %s", (X,))
    assert len(carried) == 1 and carried[0][0] == "run" and carried[0][1]["batchId"] == "0414-a"
    assert item(url, "0414-a", X) == a_before
    assert batch_status(url, "0414-b") == "approved"
    assert any("carried the approval of 1 record(s)" in r.getMessage() for r in caplog.records if r.name == "run_pipeline")


def test_relisted_product_with_changed_view_is_pending(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0415-a", [X]) == 0
    approve(url, "0415-a", X)
    assert run(Harness(url, dd, with_content(X, "Sharedium 10 mg")), tmp_path, "0415-b", [X]) == 0
    assert item(url, "0415-b", X)[0] == "pending"
    assert q(url, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = '0415-b' AND payload ? 'carried_from'")[0][0] == 0


def test_removed_product_relisted_in_a_new_batch_is_not_carried(url, tmp_path):
    """§8.3.1 item 8 carries only from the item statusOf reads as ok; a removed item reads pending (PO D7)."""
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0417-a", [X, Z]) == 0
    approve(url, "0417-a", X)
    assert run(Harness(url, dd), tmp_path, "0417-a", [Z]) == 0
    assert (item(url, "0417-a", X)[0], note(url, "0417-a", X)) == ("ok", REMOVED)
    assert not public(url, X)
    assert run(Harness(url, dd), tmp_path, "0417-b", [X]) == 0   # the same view, listed in a new batch
    assert item(url, "0417-b", X)[0] == "pending"
    assert q(url, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = '0417-b' AND payload ? 'carried_from'")[0][0] == 0
    assert not public(url, X)


def test_an_issue_origin_is_not_carried(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0418-a", [X]) == 0
    with psycopg.connect(url) as c:   # a reviewer reported an issue on X
        c.execute("""INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
                     VALUES ('0418-a', %s, 'issue', 'strength is wrong', 'eng@example.test', 'engineer')""", (X,))
        c.execute("UPDATE ops.batch_item SET review = 'issue' WHERE batch_id = '0418-a' AND concept_id = %s", (X,))
    assert run(Harness(url, dd), tmp_path, "0418-b", [X]) == 0   # the same view, listed in a new batch
    assert item(url, "0418-b", X)[0] == "pending"
    assert q(url, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = '0418-b' AND payload ? 'carried_from'")[0][0] == 0
    assert not public(url, X)


# --- the same product's gate item in another batch (§8.3.1, G3) ------------------------------------

def test_a_brand_revert_in_an_older_batch_reopens_the_newer_batchs_approved_item(url, tmp_path):
    """X approved in A with company Co, then in B with New Co; A re-run with Co matches A's own snapshot, but the public
    record (B's item, the gate) was approved for New Co: it goes back to review (shared_change)."""
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0419-a", [X]) == 0
    approve(url, "0419-a", X)
    assert run(Harness(url, dd, with_company(X, "New Co")), tmp_path, "0419-b", [X]) == 0
    assert item(url, "0419-b", X)[0] == "pending"                # not carried: the view changed
    decided = approve(url, "0419-b", X)
    assert gate(url, X)[:2] == ("0419-b", "ok") and public(url, X)
    a_before = item(url, "0419-a", X)
    assert run(Harness(url, dd, with_company(X, "Co")), tmp_path, "0419-a", [X]) == 0
    assert item(url, "0419-a", X) == a_before                    # A's own view is unchanged: no stamp
    review, stamp = item(url, "0419-b", X)
    assert review == "pending" and stamp > decided
    assert latest_reason(url, "0419-b", X) == "shared_change"
    assert batch_status(url, "0419-b") == "in_review"
    assert not public(url, X)


# --- the engineer's --reopen (§8.3.1 item 5, §13.1 Q12, G3) -----------------------------------------

def test_reopen_run_with_a_covered_change_reopens_an_approved_target(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0420-a", [X]) == 0
    decided = approve(url, "0420-a", X)
    caplog.clear()
    assert run_reopen(Harness(url, dd, with_content(X, "Sharedium 10 mg")), "0420-a", [X])
    review, stamp = item(url, "0420-a", X)
    assert review == "pending" and stamp > decided
    assert batch_status(url, "0420-a") == "in_review"
    assert not public(url, X)
    assert not any("--reopen not confirmed" in r.getMessage() for r in caplog.records if r.name == "run_pipeline")


def test_reopen_run_reopens_an_approved_dependent_whose_view_changed(url, tmp_path):
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0421-a", [X]) == 0
    decided = approve(url, "0421-a", X)
    assert run_reopen(Harness(url, dd, rxnav=RxWithAtc()), "0421-b", [Y])   # Y brings an ATC code for the shared substance
    review, stamp = item(url, "0421-a", X)
    assert review == "pending" and stamp > decided
    assert latest_reason(url, "0421-a", X) == "shared_change"
    assert not public(url, X)


# --- the engineer's override (§8.3.1 item 5, §13.1 Q12) ----------------------------------------------

def test_reopen_flag_stamps_targets_only(url, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    dd = FakeDDInter(BOTH)
    assert run(Harness(url, dd), tmp_path, "0416-a", [X, Z]) == 0
    assert run(Harness(url, dd), tmp_path, "0416-b", [Y]) == 0
    approve(url, "0416-a", X)
    with psycopg.connect(url) as c:   # a reviewer reported an issue on Z
        c.execute("""INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
                     VALUES ('0416-a', %s, 'issue', 'strength is wrong', 'eng@example.test', 'engineer')""", (Z,))
        c.execute("UPDATE ops.batch_item SET review = 'issue' WHERE batch_id = '0416-a' AND concept_id = %s", (Z,))
    x_before, z_before, y_before = item(url, "0416-a", X), item(url, "0416-a", Z), item(url, "0416-b", Y)
    assert run(Harness(url, dd), tmp_path, "0416-a", [X, Z], "--reopen") == 0
    assert item(url, "0416-a", X) == x_before                     # approved: skipped until the PO confirms (§13.1 Q12)
    review, stamp = item(url, "0416-a", Z)
    assert review == "pending" and stamp > z_before[1]           # the open issue goes back to review after the fix
    assert item(url, "0416-b", Y) == y_before                     # never a dependent
    assert any(f"{X} skipped: approved, --reopen not confirmed" in r.getMessage() for r in caplog.records if r.name == "run_pipeline")


def test_no_code_path_deletes_ddinter_pair():
    """§7.8: ops.pair_review references curated.ddinter_pair (NO ACTION), so the ETL only ever inserts or updates pairs."""
    import pathlib
    src = pathlib.Path(__file__).resolve().parents[1] / "src"
    hits = [str(p) for p in src.rglob("*.py") if "delete from curated.ddinter_pair" in p.read_text().lower()]
    assert hits == []
