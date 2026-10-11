from decimal import Decimal as D

import pytest

from bddrug_etl.parse.content import parse_generic_content


def _flat(parsed):
    return [
        (i.name, i.strength_value, i.strength_unit, i.per_value, i.per_unit)
        for i in parsed.ingredients
    ]


def test_single_ingredient():
    p = parse_generic_content("Paracetamol 500 mg")
    assert p.status == "parsed"
    assert _flat(p) == [("Paracetamol", D(500), "mg", None, None)]


def test_combination_keeps_order():
    p = parse_generic_content("Amoxicillin + Clavulanic Acid 500 mg + 125 mg")
    assert p.status == "parsed"
    assert _flat(p) == [
        ("Amoxicillin", D(500), "mg", None, None),
        ("Clavulanic Acid", D(125), "mg", None, None),
    ]


def test_per_ml():
    p = parse_generic_content("Chloramphenicol 5 mg/ml")
    assert _flat(p) == [("Chloramphenicol", D(5), "mg", D(1), "ml")]


def test_salt_not_stripped():
    p = parse_generic_content("Warfarin Sodium 5 mg")
    assert p.ingredients[0].name == "Warfarin Sodium"


def test_per_vial():
    p = parse_generic_content("Amphotericin B 50 mg/vial")
    assert _flat(p) == [("Amphotericin B", D(50), "mg", D(1), "vial")]


def test_iu_per_ml():
    p = parse_generic_content("Insulin 100 IU/ml")
    assert _flat(p) == [("Insulin", D(100), "iu", D(1), "ml")]


def test_explicit_per_value_and_decimal():
    p = parse_generic_content("Salbutamol 0.5 mg/5 ml")
    assert _flat(p) == [("Salbutamol", D("0.5"), "mg", D(5), "ml")]


def test_no_strength_is_partial():
    p = parse_generic_content("Vitamin B1, B6 & B12")
    assert p.status == "partial"
    assert p.note == "no strength in source"
    assert len(p.ingredients) == 1
    assert p.ingredients[0].strength_value is None


def test_count_mismatch_is_partial():
    p = parse_generic_content("X + Y 10 mg")
    assert p.status == "partial"
    assert p.note == "2 names vs 1 strengths"


@pytest.mark.parametrize("raw", ["", "   ", "10 mg"])
def test_failed(raw):
    p = parse_generic_content(raw)
    assert p.status == "failed"
    assert p.ingredients == ()


PILOT = [
    ("Amlodipine 5 mg", [("Amlodipine", D(5), "mg", None, None)]),
    ("Aspirin 300 mg", [("Aspirin", D(300), "mg", None, None)]),
    ("Simvastatin 10 mg", [("Simvastatin", D(10), "mg", None, None)]),
    ("Chloramphenicol 5 mg/ml", [("Chloramphenicol", D(5), "mg", D(1), "ml")]),
    ("Domperidone 10 mg", [("Domperidone", D(10), "mg", None, None)]),
    ("Warfarin Sodium 5 mg", [("Warfarin Sodium", D(5), "mg", None, None)]),
    ("Metformin Hydrochloride 500 mg", [("Metformin Hydrochloride", D(500), "mg", None, None)]),
    ("Paracetamol 500 mg", [("Paracetamol", D(500), "mg", None, None)]),
    ("Clarithromycin 500 mg", [("Clarithromycin", D(500), "mg", None, None)]),
    (
        "Amoxicillin + Clavulanic Acid 500 mg + 125 mg",
        [
            ("Amoxicillin", D(500), "mg", None, None),
            ("Clavulanic Acid", D(125), "mg", None, None),
        ],
    ),
]


@pytest.mark.parametrize("raw,expected", PILOT)
def test_pilot_strings(raw, expected):
    p = parse_generic_content(raw)
    assert p.status == "parsed"
    assert _flat(p) == expected
