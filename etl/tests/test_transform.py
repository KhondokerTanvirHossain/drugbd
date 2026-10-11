import json, pathlib
from bddrug_etl.ocl.transform import Ingredient, concept_to_product

FIX = json.loads((pathlib.Path(__file__).parent / "fixtures/tericin.json").read_text())

def test_maps_extras_and_ingredients():
    p = concept_to_product(FIX)
    assert p.concept_id == "341-0160-020--tericin"
    assert p.dar_number == "341-0160-020"
    assert p.trade_name == "Tericin"
    assert p.company == "Beacon Pharmaceuticals PLC"
    assert p.dosage_form == "Injection"
    assert p.ingredients == (Ingredient("XM5TR4", "Amphotericin B"),)

def test_collapses_whitespace_in_generic_content():
    assert concept_to_product(FIX).generic_content_raw == "Amphotericin B 50 mg/vial"

def test_empty_quality_flag_becomes_none():
    assert concept_to_product(FIX).quality_flag is None

def test_skips_non_drug_and_retired_concepts():
    assert concept_to_product({**FIX, "concept_class": "Ingredient"}) is None
    assert concept_to_product({**FIX, "retired": True}) is None

def test_ignores_retired_and_other_mappings_and_dedupes():
    m = FIX["mappings"][0]
    c = {**FIX, "mappings": [m, m, {**m, "retired": True, "to_concept_code": "XX"}, {**m, "map_type": "Same-as"}]}
    assert concept_to_product(c).ingredients == (Ingredient("XM5TR4", "Amphotericin B"),)

def test_product_without_mappings_has_no_ingredients():
    assert concept_to_product({**FIX, "mappings": []}).ingredients == ()
