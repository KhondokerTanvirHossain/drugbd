"""Pure mapping from an OCL DGDA-Drugs concept to our product row."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Ingredient:
    xm_code: str
    name: str


@dataclass(frozen=True)
class ProductRow:
    concept_id: str
    dar_number: str
    trade_name: str
    company: str
    dosage_form: str
    generic_content_raw: str
    quality_flag: str | None
    ingredients: tuple[Ingredient, ...]


def _clean(value: object) -> str:
    return " ".join(str(value or "").split())


def concept_to_product(concept: dict) -> ProductRow | None:
    if concept.get("concept_class") != "Drug" or concept.get("retired"):
        return None
    extras = concept.get("extras") or {}
    names: dict[str, str] = {}
    for m in concept.get("mappings") or []:
        if m.get("map_type") != "Has-active-ingredient" or m.get("retired"):
            continue
        code = _clean(m.get("to_concept_code"))
        if not code:
            continue
        name = _clean(m.get("to_concept_name"))
        if not names.get(code):
            names[code] = name
    ingredients = tuple(Ingredient(code, name) for code, name in sorted(names.items()))
    return ProductRow(
        concept_id=concept["id"],
        dar_number=_clean(extras.get("dar_number")),
        trade_name=_clean(extras.get("trade_name") or concept.get("display_name")),
        company=_clean(extras.get("company")),
        dosage_form=_clean(extras.get("dosage_form")),
        generic_content_raw=_clean(extras.get("generic_content_raw")),
        quality_flag=_clean(extras.get("dar_quality_flag")) or None,
        ingredients=ingredients,
    )
