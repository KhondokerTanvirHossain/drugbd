"""Pure parser for DGDA ``generic_content_raw`` strings."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

_NUM = r"\d+(?:\.\d+)?"
_STRENGTH_RE = re.compile(
    rf"(?<![\w.])(?P<value>{_NUM})\s*(?P<unit>mg|mcg|µg|g|ml|iu|%|units?)(?![a-z])"
    rf"(?:\s*/\s*(?P<per_value>{_NUM})?\s*"
    rf"(?P<per_unit>ml|vial|g|tablet|capsule|dose|actuation)(?![a-z]))?",
    re.IGNORECASE,
)


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


def parse_generic_content(raw: str) -> ParsedContent:
    text = " ".join((raw or "").split())
    if not text:
        return ParsedContent("failed", (), "empty content")

    first = _STRENGTH_RE.search(text)
    names = _split_names(text[: first.start()] if first else text)
    if not names:
        return ParsedContent("failed", (), "no ingredient name")

    matches = list(_STRENGTH_RE.finditer(text[first.start():])) if first else []

    ingredients = []
    for idx, name in enumerate(names):
        if idx < len(matches):
            m = matches[idx]
            per_unit = m.group("per_unit")
            per_value = None
            if per_unit:
                per_value = Decimal(m.group("per_value") or 1)
            ingredients.append(
                ParsedIngredient(
                    name=name,
                    strength_value=Decimal(m.group("value")),
                    strength_unit=m.group("unit").lower(),
                    per_value=per_value,
                    per_unit=per_unit.lower() if per_unit else None,
                    raw_text=f"{name} {m.group(0)}",
                )
            )
        else:
            ingredients.append(ParsedIngredient(name, None, None, None, None, name))

    if not matches:
        return ParsedContent("partial", tuple(ingredients), "no strength in source")
    if len(names) != len(matches):
        return ParsedContent(
            "partial", tuple(ingredients), f"{len(names)} names vs {len(matches)} strengths"
        )
    return ParsedContent("parsed", tuple(ingredients), "")
