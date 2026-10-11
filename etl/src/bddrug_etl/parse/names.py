"""Pure helpers for ingredient names and dose-form routes."""

from __future__ import annotations

import re

_SPELLING = {"amoxycillin": "amoxicillin"}

_SALT_WORDS = frozenset(
    "sodium potassium calcium hydrochloride hcl besilate besylate maleate mesylate "
    "mesilate tartrate succinate fumarate citrate sulfate sulphate phosphate acetate "
    "bromide dihydrate trihydrate monohydrate".split()
)

_PUNCT_EDGE = re.compile(r"^[^\w]+|[^\w]+$")


def normalize_name(name: str) -> str:
    text = _PUNCT_EDGE.sub("", " ".join(name.casefold().split()))
    return " ".join(_SPELLING.get(w, w) for w in text.split())


def strip_salt(name: str) -> str:
    """Drop trailing salt/hydrate words; never the first word."""
    words = name.split()
    while len(words) > 1 and words[-1].casefold() in _SALT_WORDS:
        words.pop()
    return " ".join(words)


def route_for_dosage_form(dosage_form: str) -> str:
    form = " ".join((dosage_form or "").casefold().split())
    # Order matters: site words beat base words ("Eye Ointment" is not topical).
    # Ambiguous multi-site forms such as "Eye/Ear Drops" default to ophthalmic.
    if re.search(r"\beye\b", form):
        return "ophthalmic"
    if re.search(r"\bear\b", form):
        return "otic"
    if re.search(r"\bnasal\b", form):
        return "nasal"
    if re.search(r"\b(cream|ointment|gel|lotion)\b", form):
        return "topical"
    return "systemic"
