"""Pure helpers for ingredient names and dose-form routes."""

from __future__ import annotations

import re

_SPELLING = {"amoxycillin": "amoxicillin"}

_SALT_WORDS = frozenset(
    "sodium potassium calcium hydrochloride hcl besilate besylate maleate mesylate "
    "mesilate tartrate succinate fumarate citrate sulfate sulphate phosphate acetate "
    "bromide dihydrate trihydrate monohydrate".split()
)

_BARE_CATIONS = frozenset(
    "sodium potassium calcium magnesium ferrous ferric iron zinc lithium "
    "aluminium aluminum copper manganese".split()
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
    if len(words) == 1 and words[0].casefold() in _BARE_CATIONS:
        return name
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
    # Not swallowed or injected: these never read as "systemic". With no DDInter entry for the route, the DDInter
    # stage falls back to the general entry and flags it as assumed, so a reviewer sees it (§8.1 item 3).
    if re.search(r"\binhal|\bnebuli|\bresp[ie]r|\bgas\b", form):
        return "inhalation"
    if re.search(r"\bvagin|\bpessar", form):
        return "vaginal"
    if re.search(r"\bsuppositor|\brectal\b|\benema\b", form):
        return "rectal"
    if re.search(r"\bmouth ?wash|\bgargle|\boral (gel|paste)\b|\blozenge", form):
        return "oromucosal"
    if re.search(r"\b(cream|ointment|gel|lotion|shampoo|hand rub|topical|dusting powder|paint)\b", form):
        return "topical"
    # Forms that do not say where they go are not guessed: the general DDInter entry is then flagged as assumed.
    if form in ("spray", "emulsion") or re.search(r"\b(dialysis|irrigation)\b", form):
        return "unspecified"
    return "systemic"
