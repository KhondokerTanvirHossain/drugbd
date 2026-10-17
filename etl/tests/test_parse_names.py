import pytest

from bddrug_etl.parse.names import normalize_name, route_for_dosage_form, strip_salt


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Warfarin Sodium", "Warfarin"),
        ("Metformin Hydrochloride", "Metformin"),
        ("Amlodipine Besilate", "Amlodipine"),
        ("Sodium Chloride", "Sodium Chloride"),
        ("Sodium", "Sodium"),
        ("Diclofenac Sodium", "Diclofenac"),
        ("Paracetamol", "Paracetamol"),
    ],
)
def test_strip_salt(raw, expected):
    assert strip_salt(raw) == expected


def test_normalize_name():
    assert normalize_name("Amoxycillin") == "amoxicillin"
    assert normalize_name("  Warfarin   Sodium. ") == "warfarin sodium"
    assert normalize_name("(Aspirin)") == "aspirin"


@pytest.mark.parametrize(
    "form,route",
    [
        ("Eye Drops", "ophthalmic"),
        ("eye drops", "ophthalmic"),
        ("Eye Ointment", "ophthalmic"),
        ("Eye/Ear Drops", "ophthalmic"),
        ("Ear Drops", "otic"),
        ("Nasal Spray", "nasal"),
        ("Nasal Drops", "nasal"),
        ("Cream", "topical"),
        ("Ointment", "topical"),
        ("Gel", "topical"),
        ("Lotion", "topical"),
        ("Tablet", "systemic"),
        ("Capsule", "systemic"),
        ("Syrup", "systemic"),
        ("Injection", "systemic"),
        ("", "systemic"),
    ],
)
def test_route(form, route):
    assert route_for_dosage_form(form) == route


@pytest.mark.parametrize(
    "name",
    [
        "Magnesium Sulfate", "Sodium Citrate", "Calcium Acetate", "Potassium Phosphate",
        "Ferrous Sulfate", "Sodium Valproate", "Potassium Chloride", "Calcium Carbonate",
    ],
)
def test_strip_salt_keeps_cation_names(name):
    assert strip_salt(name) == name


@pytest.mark.parametrize(
    "form,route",
    [
        # Inhaled forms are not "systemic": their DDInter entry is assumed (flagged) unless DDInter has an inhaled one.
        ("Aerosol Inhalation", "inhalation"), ("Inhalation Capsule", "inhalation"), ("Nebuliser Solution", "inhalation"),
        ("Inhalation Aerosol", "inhalation"), ("Dry Powder Inhaler", "inhalation"), ("Inhaler", "inhalation"),
        ("Inhalation Solution", "inhalation"), ("Resperitory Solution", "inhalation"), ("Respirator Solution", "inhalation"),
        ("Gas", "inhalation"),
        ("Topical Solution", "topical"), ("Hand Rub", "topical"), ("Shampoo", "topical"), ("Scalp Lotion", "topical"),
        ("Dusting Powder", "topical"), ("Skin Paint", "topical"),
        ("Suppository", "rectal"), ("Rectal Enema", "rectal"),
        ("Vaginal Tablet", "vaginal"), ("Vaginal Pessary", "vaginal"), ("Vaginal Cream", "vaginal"),
        ("Mouth Wash", "oromucosal"), ("Gargle & Mouth Wash", "oromucosal"), ("Oral Gel", "oromucosal"),
        ("Oral Paste", "oromucosal"),
        # Forms that do not say where they go are not guessed as systemic.
        ("Spray", "unspecified"), ("Emulsion", "unspecified"), ("Dialysis Solution", "unspecified"),
        ("Irrigation Solution", "unspecified"),
        # Site words still win, and ordinary oral and injected forms stay systemic.
        ("Eye Gel", "ophthalmic"), ("Eye, Ear & Nasal Drops", "ophthalmic"), ("Nasal Spray", "nasal"),
        ("Oral Solution", "systemic"), ("Soft Gelatin Capsule", "systemic"), ("IV/IM Injection", "systemic"),
        ("Paediatric Drops", "systemic"), ("Powder For Suspension", "systemic"), ("Bolus", "systemic"),
    ],
)
def test_route_for_every_register_form(form, route):
    assert route_for_dosage_form(form) == route
