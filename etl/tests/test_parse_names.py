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
