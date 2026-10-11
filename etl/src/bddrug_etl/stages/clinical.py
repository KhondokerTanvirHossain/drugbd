"""Clinical drug stage: mint BDC- IDs, align parsed strengths to substances, set route."""
from __future__ import annotations

from decimal import Decimal

import psycopg

from bddrug_etl.parse.content import ParsedIngredient, parse_generic_content
from bddrug_etl.parse.names import normalize_name, route_for_dosage_form, strip_salt
from bddrug_etl.stages.results import StageResult


def _num(d: Decimal | None) -> str:
    """Canonical, exponent-free number: 500, 500.0 and 5E+2 all give '500'."""
    if d is None:
        return ""
    return format(d.normalize(), "f")


def _signature(dose_form: str, route: str, rows: list[tuple[str, ParsedIngredient]]) -> str:
    parts = sorted(
        f"{bds}:{_num(p.strength_value)}{p.strength_unit or ''}/{_num(p.per_value)}{p.per_unit or ''}"
        for bds, p in rows
    )
    return dose_form.lower() + "|" + route + "|" + ";".join(parts)


def _unit_label(unit: str | None) -> str:
    return "IU" if unit == "iu" else (unit or "")


def _display_name(dose_form: str, rows: list[tuple[str, ParsedIngredient]], preferred: dict[str, str]) -> str:
    bits = []
    for bds, p in sorted(rows, key=lambda r: (preferred[r[0]].casefold(), r[0])):
        per = ""
        if p.per_unit:
            pv = "" if p.per_value == 1 else f"{_num(p.per_value)} "
            per = f"/{pv}{p.per_unit}"
        sep = "" if p.strength_unit == "%" else " "
        bits.append(f"{preferred[bds]} {_num(p.strength_value)}{sep}{_unit_label(p.strength_unit)}{per}")
    return " + ".join(bits) + " " + dose_form.lower()


def _substances(conn: psycopg.Connection, cid: str) -> list[dict]:
    rows = conn.execute(
        """SELECT s.bds_id, s.preferred_name
             FROM curated.brand_product_ingredient bpi
             JOIN curated.substance_code c ON c.system = 'ICD11_XM' AND c.code = bpi.xm_code
             JOIN curated.substance s ON s.bds_id = c.bds_id
            WHERE bpi.concept_id = %s ORDER BY s.bds_id""",
        (cid,),
    ).fetchall()
    out = []
    for bds, pref in rows:
        names = conn.execute("SELECT name FROM curated.substance_name WHERE bds_id = %s", (bds,)).fetchall()
        keys = {normalize_name(pref)} | {normalize_name(n) for (n,) in names}
        out.append({"bds_id": bds, "preferred": pref, "keys": keys})
    return out


def _align(parsed: tuple[ParsedIngredient, ...], subs: list[dict]) -> list[tuple[ParsedIngredient, str | None, str]]:
    """Rule 1: name match. Rule 2: one ingredient and one substance. Never by position."""
    out = []
    for p in parsed:
        key = normalize_name(strip_salt(p.name))
        hit = next((s["bds_id"] for s in subs if key in s["keys"]), None)
        if hit:
            out.append((p, hit, "name"))
        elif len(parsed) == 1 and len(subs) == 1:
            out.append((p, subs[0]["bds_id"], "single"))
        else:
            out.append((p, None, "unaligned"))
    return out


def build_clinical_drugs(conn: psycopg.Connection, concept_ids: list[str]) -> list[StageResult]:
    results: list[StageResult] = []
    for cid in concept_ids:
        try:
            with conn.transaction():  # one savepoint per product
                results.append(_build_one(conn, cid))
        except (psycopg.OperationalError, psycopg.InterfaceError):
            raise
        except Exception as e:
            results.append(StageResult(cid, "fail", f"error: {type(e).__name__}: {str(e)[:200]}", {}))
    return results


def _set_status(conn, cid: str, bdc_id: str | None, status: str, note: str) -> None:
    conn.execute(
        "UPDATE curated.brand_product SET bdc_id = %s, parse_status = %s, parse_note = %s WHERE concept_id = %s",
        (bdc_id, status, note or None, cid),
    )


def _str(v) -> str | None:
    return None if v is None else _num(v) if isinstance(v, Decimal) else str(v)


def _evidence(raw, status, pc_ings, pairs, bdc_id=None, signature=None) -> dict:
    return {
        "raw": raw,
        "parse_status": status,
        "parsed": [
            {"name": p.name, "strength_value": _str(p.strength_value), "strength_unit": p.strength_unit,
             "per_value": _str(p.per_value), "per_unit": p.per_unit}
            for p in pc_ings
        ],
        "aligned": [{"name": p.name, "bds_id": b, "method": m} for p, b, m in pairs],
        "bdc_id": bdc_id,
        "signature": signature,
    }


def _build_one(conn: psycopg.Connection, cid: str) -> StageResult:
    prod = conn.execute(
        "SELECT dosage_form, generic_content_raw FROM curated.brand_product WHERE concept_id = %s", (cid,)
    ).fetchone()
    if prod is None:
        return StageResult(cid, "fail", "product not found", {})
    dose_form = " ".join(prod[0].split())
    raw = prod[1]
    pc = parse_generic_content(raw)
    if pc.status in ("failed", "partial"):
        _set_status(conn, cid, None, pc.status, pc.note)
        return StageResult(cid, "fail" if pc.status == "failed" else "warn", pc.note,
                           _evidence(raw, pc.status, pc.ingredients, []))

    subs = _substances(conn, cid)
    pairs = _align(pc.ingredients, subs)

    def no_bdc(note: str) -> StageResult:
        _set_status(conn, cid, None, "parsed", note)
        return StageResult(cid, "warn", note, _evidence(raw, "parsed", pc.ingredients, pairs))

    unaligned = [p.name for p, b, _ in pairs if b is None]
    if unaligned:
        return no_bdc("; ".join(f"could not align '{n}'" for n in unaligned))
    seen: set[str] = set()
    for _, b, _ in pairs:
        if b in seen:
            return no_bdc(f"two ingredients resolve to {b}")
        seen.add(b)
    for s in subs:
        if s["bds_id"] not in seen:
            return no_bdc(f"substance {s['bds_id']} not in parsed content")

    rows = [(b, p) for p, b, _ in pairs]
    route = route_for_dosage_form(dose_form)
    sig = _signature(dose_form, route, rows)
    preferred = {s["bds_id"]: s["preferred"] for s in subs}
    bdc = conn.execute("SELECT bdc_id FROM curated.clinical_drug WHERE signature = %s", (sig,)).fetchone()
    if bdc is None:
        bdc = conn.execute(
            """INSERT INTO curated.clinical_drug (signature, display_name, dose_form, route)
               VALUES (%s, %s, %s, %s) ON CONFLICT (signature) DO NOTHING RETURNING bdc_id""",
            (sig, _display_name(dose_form, rows, preferred), dose_form, route),
        ).fetchone()
        if bdc is None:  # lost a race
            bdc = conn.execute("SELECT bdc_id FROM curated.clinical_drug WHERE signature = %s", (sig,)).fetchone()
    bdc_id = bdc[0]
    for b, p in rows:
        conn.execute(
            """INSERT INTO curated.clinical_drug_ingredient
                 (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text)
               VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
            (bdc_id, b, p.strength_value, p.strength_unit, p.per_value, p.per_unit, p.raw_text),
        )
    _set_status(conn, cid, bdc_id, "parsed", "")
    return StageResult(cid, "ok", "", _evidence(raw, "parsed", pc.ingredients, pairs, bdc_id, sig))
