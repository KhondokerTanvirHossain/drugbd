"""Pure parser for DGDA ``generic_content_raw`` strings."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

# A number, including the leading-decimal form Bangladesh registrations use (".5 mg").
_NUM = r"(?:\d+(?:\.\d+)?|\.\d+)"
# Units as registered in Bangladesh: "gm" for grams, "Lac" (lakh, 100,000) and "MIU" (million IU), "Lf" (vaccines).
_STRENGTH_RE = re.compile(
    rf"(?<![\w.])(?P<value>{_NUM})\s*"
    rf"(?P<unit>mg|mcg|µg|gm|g|ml|miu|iu|lf|%|lac\s+units?|lac\s+iu|units?)(?![a-z])"
    rf"(?:\s*/\s*(?P<per_value>{_NUM})?\s*"
    rf"(?P<per_unit>ml|vial|gm|g|kg|tablet|capsule|dose|actuation|metered\s+inhalation|spray|puff"
    rf"|litres?|liters?)(?![a-z]))?",
    re.IGNORECASE,
)
_LAKH, _MILLION = Decimal(100000), Decimal(1000000)
_PER_UNIT = {"gm": "g", "metered inhalation": "actuation", "spray": "actuation", "puff": "actuation",
             "litre": "l", "litres": "l", "liter": "l", "liters": "l"}


def _unit(raw: str, value: Decimal) -> tuple[Decimal, str]:
    """Canonical (value, unit): "1 gm" is 1 g, "6 Lac Unit" is 600000 unit, "3 MIU" is 3000000 iu."""
    u = " ".join(raw.lower().split())
    if u == "gm":
        return value, "g"
    if u == "miu":
        return value * _MILLION, "iu"
    if u.startswith("lac "):
        return value * _LAKH, u.split(" ", 1)[1]
    return value, u

_THOUSANDS_RE = re.compile(r"\b[1-9]\d{0,2}(?:,\d{3})+(?!\d)")
_AMBIGUOUS_RE = re.compile(r"\d+(?:,\d+)+")
_LETTERS_RE = re.compile(r"[^\W\d_]")


@dataclass(frozen=True)
class ParsedIngredient:
    name: str
    strength_value: Decimal | None
    strength_unit: str | None
    per_value: Decimal | None
    per_unit: str | None
    raw_text: str


@dataclass(frozen=True)
class ParsedContent:
    status: Literal["parsed", "partial", "failed"]
    ingredients: tuple[ParsedIngredient, ...]
    note: str


def _split_names(text: str) -> list[str]:
    return [n for n in (p.strip() for p in text.split("+")) if n]


def _make(name: str, m: re.Match[str]) -> ParsedIngredient:
    per_unit = m.group("per_unit")
    per_value = Decimal(m.group("per_value") or 1) if per_unit else None
    value, unit = _unit(m.group("unit"), Decimal(m.group("value")))
    per = " ".join(per_unit.lower().split()) if per_unit else None
    return ParsedIngredient(
        name=name,
        strength_value=value,
        strength_unit=unit,
        per_value=per_value,
        per_unit=_PER_UNIT.get(per, per) if per else None,
        raw_text=f"{name} {m.group(0)}",
    )


def _share_trailing_per(items: list[ParsedIngredient]) -> tuple[ParsedIngredient, ...]:
    """In "A 3 gm + B 300 mg/100 ml" the "/100 ml" belongs to every strength: when only the last strength carries a
    per and no other does, every strength takes it. Nothing is invented when there is no trailing per."""
    last = items[-1] if items else None
    if len(items) < 2 or not last.per_unit or any(i.per_unit for i in items[:-1]):
        return tuple(items)
    return tuple(i if i.per_unit else ParsedIngredient(i.name, i.strength_value, i.strength_unit, last.per_value,
                                                         last.per_unit, i.raw_text) for i in items)


def _parse_segments(text: str) -> ParsedContent | None:
    """Per-segment format: every '+' segment is '<name> <strength>'."""
    segments = [s.strip() for s in text.split("+")]
    if len(segments) < 2:
        return None
    out = []
    for seg in segments:
        m = _STRENGTH_RE.search(seg)
        if not m or seg[m.end():].strip():
            return None
        name = seg[: m.start()].strip()
        if not name:
            return None
        out.append(_make(name, m))
    return ParsedContent("parsed", _share_trailing_per(out), "")


def parse_generic_content(raw: str) -> ParsedContent:
    text = " ".join((raw or "").split())
    if not text:
        return ParsedContent("failed", (), "empty content")
    text = _THOUSANDS_RE.sub(lambda m: m.group(0).replace(",", ""), text)
    amb = _AMBIGUOUS_RE.search(text)
    if amb:
        return ParsedContent("failed", (), f"ambiguous number '{amb.group(0)}'")

    segmented = _parse_segments(text)
    if segmented:
        return segmented

    first = _STRENGTH_RE.search(text)
    names = _split_names(text[: first.start()] if first else text)
    matches = list(_STRENGTH_RE.finditer(text[first.start():])) if first else []
    trailing = ""
    if matches:
        trailing = text[first.start():][matches[-1].end():].strip(" +")
        if not _LETTERS_RE.search(trailing):
            trailing = ""

    if names and matches and len(names) == len(matches) and not trailing:
        return ParsedContent(
            "parsed", _share_trailing_per([_make(n, m) for n, m in zip(names, matches)]), ""
        )

    # Partial parses never carry strengths: they cannot be trusted. Keep every
    # identifiable name: each '+' segment minus its strength tokens.
    all_names = [
        n
        for n in (_STRENGTH_RE.sub("", seg).strip(" ,") for seg in text.split("+"))
        if _LETTERS_RE.search(n)
    ]
    if not all_names:
        return ParsedContent("failed", (), "no ingredient name")
    bare = tuple(ParsedIngredient(n, None, None, None, None, n) for n in all_names)
    if trailing:
        return ParsedContent(
            "partial", bare, f"unparsed text after strengths: '{trailing}'"
        )
    if not matches:
        return ParsedContent("partial", bare, "no strength in source")
    return ParsedContent(
        "partial", bare, f"{len(all_names)} names vs {len(matches)} strengths"
    )
