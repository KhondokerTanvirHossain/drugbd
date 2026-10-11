import pathlib

from bddrug_etl.ddinter.html import DDInterDrug, parse_drug_detail, parse_interaction

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
