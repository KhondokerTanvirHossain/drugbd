import pathlib

from bddrug_etl.queue import (Entry, build_queue, check_batches, dar_category, generic_key, main, probably_veterinary,
                              read_queue_ids, write_tsv)


def c(cid, generic, form="Tablet", cls="Drug", retired=False, trade="T"):
    return {"id": cid, "cls": cls, "retired": retired, "trade": trade, "form": form, "generic": generic, "company": "X"}


def test_generic_key_drops_strengths_order_and_per_unit_wording():
    assert generic_key("Sulphamethoxazole + Trimethoprim 800 mg + 160 mg") == "sulphamethoxazole + trimethoprim"
    assert generic_key("Trimethoprim + Sulphamethoxazole 400 mg + 80 mg") == "sulphamethoxazole + trimethoprim"
    assert generic_key("Salbutamol 100 mcg/Metered Inhalation") == "salbutamol"
    assert generic_key("Cefixime 100 mg/5 ml") == "cefixime"
    assert generic_key("Diclofenac Sodium 1 gm/100 gm") == "diclofenac sodium"
    assert generic_key("Cholecalciferol (Vit. D3) 20000 IU") == "cholecalciferol"
    assert generic_key("Clonazepam .5 mg") == "clonazepam"


def test_dar_category_and_veterinary_flag():
    assert dar_category("005-1114-077--acivet-cipro") == "077"
    assert dar_category("001--023--zinacef") == ""  # malformed DAR in the register: no category
    assert probably_veterinary("005-1114-077--acivet-cipro")
    assert not probably_veterinary("186-0030-006--napa")


def test_build_queue_ranks_by_brand_count_variety_first_vet_last_each_id_once():
    concepts = [
        c("001-0001-023--a1", "Alpha 500 mg"), c("001-0002-023--a2", "Alpha 250 mg"), c("001-0003-023--a3", "Alpha 500 mg"),
        c("001-0004-023--b1", "Beta 10 mg"), c("001-0005-077--v1", "Alpha 1 gm", form="Bolus"),
        c("001-0006-077--v2", "Alpha 2 gm", form="Bolus"), c("001-0007-077--v3", "Alpha 3 gm", form="Bolus"),
        c("001-0008-023--x", "Gamma 1 mg", cls="Ingredient"), c("001-0009-023--r", "Gamma 1 mg", retired=True),
        c("001-0001-023--a1", "Alpha 500 mg"),
    ]
    q = build_queue(concepts)
    ids = [e.concept_id for e in q]
    assert len(ids) == len(set(ids)) == 7
    # Alpha (3 human brands) before Beta (1); within Alpha one brand per distinct content first, then the repeat.
    assert ids[:4] == ["001-0001-023--a1", "001-0002-023--a2", "001-0003-023--a3", "001-0004-023--b1"]
    # Probable veterinary products come last, although "alpha" vet has as many brands as human alpha.
    assert [e.veterinary for e in q] == [False] * 4 + [True] * 3
    assert [e.position for e in q] == list(range(1, 8))


def test_build_queue_is_deterministic_whatever_the_input_order():
    concepts = [c(f"00{i}-000{i}-023--p{i}", f"Drug{i % 3} {i} mg") for i in range(1, 9)]
    assert build_queue(concepts) == build_queue(list(reversed(concepts)))


def test_check_batches_flags_duplicates_and_unknown_ids_and_reports_coverage(tmp_path):
    queue = {"a": 1, "b": 2, "c": 3, "d": 4}
    (tmp_path / "0001-x.txt").write_text("# header\na  # first\nb\n")
    (tmp_path / "0002-y.txt").write_text("b\nzz # not in the queue\nd\n")
    (tmp_path / "notes.txt").write_text("a\n")  # not a batch file name: ignored
    r = check_batches(tmp_path, queue)
    assert r.duplicates == {"b": ["0001-x.txt", "0002-y.txt"]}
    assert r.unknown == {"0002-y.txt": ["zz"]}
    assert (r.covered, r.total, r.first_gap) == (3, 4, 3)
    assert not r.ok


def test_tsv_round_trip_and_cli(tmp_path, capsys):
    entries = [Entry(1, "001-0001-023--a1", "alpha", 1, 2, "A\tOne", "Tablet", "Alpha 1 mg", False),
               Entry(2, "001-0005-077--v1", "alpha", 2, 1, "V", "Bolus", "Alpha 1 gm", True)]
    p = tmp_path / "q.tsv"
    write_tsv(entries, p, "note")
    assert read_queue_ids(p) == {"001-0001-023--a1": 1, "001-0005-077--v1": 2}
    assert "A One" in p.read_text() and p.read_text().splitlines()[3].endswith("\tyes")
    (tmp_path / "b").mkdir()
    (tmp_path / "b" / "0001-a.txt").write_text("001-0001-023--a1\n")
    assert main(["check", str(tmp_path / "b"), str(p)]) == 0
    assert "coverage: 1 of 2" in capsys.readouterr().out
