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


def test_partial_carries_no_strengths():
    p = parse_generic_content("X + Y 10 mg")
    assert p.status == "partial"
    assert p.note == "2 names vs 1 strengths"
    assert [i.name for i in p.ingredients] == ["X", "Y"]
    for i in p.ingredients:
        assert (i.strength_value, i.strength_unit, i.per_value, i.per_unit) == (None,) * 4


@pytest.mark.parametrize(
    "raw",
    ["Paracetamol 500 mg + Caffeine 65 mg", "Paracetamol 500mg+Caffeine 65mg"],
)
def test_per_segment(raw):
    p = parse_generic_content(raw)
    assert p.status == "parsed"
    assert _flat(p) == [
        ("Paracetamol", D(500), "mg", None, None),
        ("Caffeine", D(65), "mg", None, None),
    ]


def test_per_segment_no_space_plus():
    p = parse_generic_content("Amoxicillin 500mg+Clavulanic Acid 125mg")
    assert p.status == "parsed"
    assert _flat(p) == [
        ("Amoxicillin", D(500), "mg", None, None),
        ("Clavulanic Acid", D(125), "mg", None, None),
    ]


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Heparin 1,000 IU", ("Heparin", D(1000), "iu")),
        ("Lidocaine 1,000 mg", ("Lidocaine", D(1000), "mg")),
        ("Paracetamol 500mg", ("Paracetamol", D(500), "mg")),
        ("Paracetamol 500 MG", ("Paracetamol", D(500), "mg")),
        ("Cabergoline 250 mcg", ("Cabergoline", D(250), "mcg")),
        ("Cabergoline 250 µg", ("Cabergoline", D(250), "µg")),
        ("Vaccine 5 units", ("Vaccine", D(5), "units")),
    ],
)
def test_number_and_unit_variants(raw, expected):
    p = parse_generic_content(raw)
    assert p.status == "parsed"
    i = p.ingredients[0]
    assert (i.name, i.strength_value, i.strength_unit) == expected


@pytest.mark.parametrize("raw,token", [("Estradiol 0,500 mg", "0,500"), ("Drug 12,5 mg", "12,5"), ("Drug 0,5 mg", "0,5")])
def test_ambiguous_decimal_comma_fails(raw, token):
    p = parse_generic_content(raw)
    assert p.status == "failed"
    assert p.note == f"ambiguous number '{token}'"
    assert p.ingredients == ()


def test_thousands_values():
    assert parse_generic_content("Heparin 1,000 IU").ingredients[0].strength_value == D(1000)
    assert parse_generic_content("Drug 1,000,000 IU").ingredients[0].strength_value == D(1000000)


def test_trailing_ingredient_not_dropped():
    p = parse_generic_content("Paracetamol 500 mg + Caffeine")
    assert p.status == "partial"
    assert [i.name for i in p.ingredients] == ["Paracetamol", "Caffeine"]
    assert all(i.strength_value is None for i in p.ingredients)


def test_trailing_third_ingredient_not_dropped():
    p = parse_generic_content("Paracetamol 500 mg + Caffeine 65 mg + Codeine")
    assert p.status == "partial"
    assert [i.name for i in p.ingredients] == ["Paracetamol", "Caffeine", "Codeine"]
    assert all(i.strength_value is None for i in p.ingredients)


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Bangladesh registrations write grams as "gm" (6,463 products in the 17/10/2026 register).
        ("Ceftriaxone 1 gm", ("Ceftriaxone", D(1), "g", None, None)),
        ("Diclofenac Sodium 1 gm/100 gm", ("Diclofenac Sodium", D(1), "g", D(100), "g")),
        # Leading-decimal strengths (1,002 products).
        ("Clonazepam .5 mg", ("Clonazepam", D("0.5"), "mg", None, None)),
        ("Clobetasol Propionate .05 gm/100 gm", ("Clobetasol Propionate", D("0.05"), "g", D(100), "g")),
        ("Drug 1.5 mg", ("Drug", D("1.5"), "mg", None, None)),
        # Lac (lakh) is exactly 100,000; MIU is exactly 1,000,000 IU.
        ("Benzathine Penicillin 6 Lac Unit/vial", ("Benzathine Penicillin", D(600000), "unit", D(1), "vial")),
        ("Benzathine Penicillin 12 Lac Units/vial", ("Benzathine Penicillin", D(1200000), "units", D(1), "vial")),
        ("Spiramycine 3 MIU", ("Spiramycine", D(3000000), "iu", None, None)),
        ("Spiramycine 1.5 MIU", ("Spiramycine", D(1500000), "iu", None, None)),
        ("Adsorbed Tetanus Vaccine 5 LF/.5 ml", ("Adsorbed Tetanus Vaccine", D(5), "lf", D("0.5"), "ml")),
        # Per-dose wording of inhalers and sprays is one actuation.
        ("Salbutamol 100 mcg/Metered Inhalation", ("Salbutamol", D(100), "mcg", D(1), "actuation")),
        ("Salbutamol 100 mcg/Spray", ("Salbutamol", D(100), "mcg", D(1), "actuation")),
        ("Budesonide 200 mcg/Puff", ("Budesonide", D(200), "mcg", D(1), "actuation")),
        ("Feed Additive 10 gm/kg", ("Feed Additive", D(10), "g", D(1), "kg")),
        ("Electrolyte 30.5 gm/Litres", ("Electrolyte", D("30.5"), "g", D(1), "l")),
    ],
)
def test_bangladesh_units_and_per_dose_wording(raw, expected):
    p = parse_generic_content(raw)
    assert p.status == "parsed", p.note
    i = p.ingredients[0]
    assert (i.name, i.strength_value, i.strength_unit, i.per_value, i.per_unit) == expected
    assert i.raw_text.startswith(expected[0])


@pytest.mark.parametrize(
    "raw,expected",
    [
        # A trailing "per" belongs to every strength of the combination, not only the last one.
        ("Cetrimide + Chlorhexidine Gluconate 3 gm + 300 mg/100 ml",
         [("Cetrimide", D(3), "g", D(100), "ml"), ("Chlorhexidine Gluconate", D(300), "mg", D(100), "ml")]),
        ("Amoxicillin 125 mg + Clavulanic Acid 31.25 mg/5 ml",
         [("Amoxicillin", D(125), "mg", D(5), "ml"), ("Clavulanic Acid", D("31.25"), "mg", D(5), "ml")]),
        ("Fluticasone Propionate + Salmeterol 125 mcg + 25 mcg/Metered Inhalation",
         [("Fluticasone Propionate", D(125), "mcg", D(1), "actuation"), ("Salmeterol", D(25), "mcg", D(1), "actuation")]),
        # Without a trailing per nothing is invented.
        ("Amoxicillin + Clavulanic Acid 500 mg + 125 mg",
         [("Amoxicillin", D(500), "mg", None, None), ("Clavulanic Acid", D(125), "mg", None, None)]),
    ],
)
def test_trailing_per_applies_to_every_strength_of_a_combination(raw, expected):
    p = parse_generic_content(raw)
    assert p.status == "parsed", p.note
    assert [(i.name, i.strength_value, i.strength_unit, i.per_value, i.per_unit) for i in p.ingredients] == expected
