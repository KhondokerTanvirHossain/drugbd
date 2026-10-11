import pathlib

import pytest

from bddrug_etl.ddinter.html import DDInterDrug, clean_text, parse_drug_detail, parse_interaction

FX = pathlib.Path(__file__).parent / "fixtures" / "ddinter"


def test_parse_drug_detail_warfarin():
    d = parse_drug_detail((FX / "detail_warfarin.html").read_text(), "DDInter1951")
    assert d == DDInterDrug("DDInter1951", "Warfarin", ("B01AA03",), "DB00682")


def test_parse_drug_detail_several_atc_codes_route_specific():
    d = parse_drug_detail((FX / "detail_chloramphenicol_ophth.html").read_text(), "DDInter352")
    assert d.name == "Chloramphenicol (ophthalmic)"
    assert d.atc_codes == ("D06AX02", "S02AA01", "D10AF03", "S01AA01", "G01AA05", "J01BA01", "S03AA08")
    assert d.drugbank_id == "DB00446"


def test_parse_drug_detail_without_atc_or_drugbank():
    html = "<h1>Drugs Information:</h1><h2>Foo</h2><p>ATC Classification</p><p>IUPAC Name</p><p>x</p>"
    d = parse_drug_detail(html, "DDInter1")
    assert (d.name, d.atc_codes, d.drugbank_id) == ("Foo", (), None)


def test_parse_interaction_3039():
    t = parse_interaction((FX / "interaction_3039.html").read_text())
    assert t.interaction.startswith("Coadministration of acalabrutinib")
    assert t.management.startswith("Concomitant use of acalabrutinib")
    assert "Management" not in t.interaction
    assert len(t.refs) == 3
    assert t.refs[0].startswith('"Product Information. Calquence')  # "[1] " prefix stripped
    assert not any(r.startswith("[") for r in t.refs)


def _page(*chunks):
    return "".join(f"<p>{c}</p>" for c in chunks)


def test_interaction_without_management_does_not_swallow_references():
    t = parse_interaction(_page("Basic Information", "Interaction", "Some effect.", "References", "[1] Ref one.",
                                "Alternative for", "Warfarin"))
    assert t.interaction == "Some effect."
    assert t.management is None  # missing, never an empty string
    assert t.refs == ("Ref one.",)


def test_management_without_references():
    t = parse_interaction(_page("Basic Information", "Interaction", "Effect.", "Management", "Monitor.",
                                "Alternative for", "Warfarin", "Selexipag"))
    assert (t.interaction, t.management, t.refs) == ("Effect.", "Monitor.", ())


def test_interaction_without_management_or_references_stops_at_alternative():
    t = parse_interaction(_page("Basic Information", "Interaction", "Effect.", "Alternative for", "X"))
    assert (t.interaction, t.management, t.refs) == ("Effect.", None, ())


def test_real_fixture_clamps_alternative_section():
    t = parse_interaction((FX / "interaction_3039.html").read_text())
    assert "Alternative" not in t.management and "Alternative" not in t.interaction
    assert not any("Alternative" in r for r in t.refs)
    assert "Selexipag" not in " ".join(t.refs)


def test_reference_with_inline_markup_stays_one_reference():
    html = ("<p>Basic Information</p><p>Interaction</p><p>E.</p><p>References</p>"
            "<p>[1] Smith J. <i>Blood</i> 12 (2001): 5-9.</p><p>[2] <a href='x'>Lee K</a>, Ann. 2002.</p>"
            "<p>Alternative for</p><p>X</p>")
    t = parse_interaction(html)
    assert t.refs == ("Smith J. Blood 12 (2001): 5-9.", "Lee K, Ann. 2002.")


@pytest.mark.parametrize("label", ["Basic Information", "ID", "Drug Type"])
def test_drug_name_label_or_empty_raises(label):
    with pytest.raises(ValueError, match="drug name not found"):
        parse_drug_detail(f"<p>Drugs Information:</p><p>{label}</p><p>x</p>", "DDInter1")


def test_drugbank_requires_single_distinct_id():
    base = "<p>Drugs Information:</p><p>Foo</p>"
    a = "<a href='https://go.drugbank.com/drugs/DB00682'>DrugBank</a>"
    b = "<a href='https://go.drugbank.com/drugs/DB00001'>x</a>"
    assert parse_drug_detail(base + a + a, "D").drugbank_id == "DB00682"
    assert parse_drug_detail(base + a + b, "D").drugbank_id is None
    assert parse_drug_detail(base + "<a href='https://go.drugbank.com/salts/DB00682'>s</a>", "D").drugbank_id is None


def test_drug_name_missing_raises():
    with pytest.raises(ValueError, match="drug name not found"):
        parse_drug_detail("<p>Drugs Information:</p>", "DDInter1")


# --- placeholders: DDInter prints "None" (or "-", or nothing) where it has no text ---------------------

PLACEHOLDERS = ["None", "none", " NONE ", "null", "NULL", "N/A", "n/a", "NA", "na", "-", "--", "", "   ", "\tNone\n"]


@pytest.mark.parametrize("value", PLACEHOLDERS + [None])
def test_clean_text_treats_placeholders_as_missing(value):
    assert clean_text(value) is None


@pytest.mark.parametrize("value, expected", [
    ("Monitor INR.", "Monitor INR."), ("  Monitor INR.  ", "Monitor INR."), ("None of the above", "None of the above"),
    ("No interaction expected.", "No interaction expected."), ("-1 dose", "-1 dose"), ("Nan", "Nan"),
])
def test_clean_text_keeps_real_text_stripped(value, expected):
    assert clean_text(value) == expected


@pytest.mark.parametrize("interaction, management", [("None", "None"), ("None", "-"), ("N/A", "null"), ("--", "NA")])
def test_placeholder_interaction_and_management_are_missing(interaction, management):
    t = parse_interaction(_page("Basic Information", "Interaction", interaction, "Management", management,
                                "References", "Alternative for", "X"))
    assert (t.interaction, t.management, t.refs) == (None, None, ())


def test_placeholder_interaction_with_real_management_keeps_only_the_management():
    t = parse_interaction(_page("Basic Information", "Interaction", "None", "Management", "Monitor INR.",
                                "References", "[1] Ref one.", "Alternative for", "X"))
    assert (t.interaction, t.management, t.refs) == (None, "Monitor INR.", ("Ref one.",))


def test_empty_interaction_section_is_missing():
    t = parse_interaction(_page("Basic Information", "Interaction", "Management", "Monitor.", "Alternative for", "X"))
    assert (t.interaction, t.management) == (None, "Monitor.")
