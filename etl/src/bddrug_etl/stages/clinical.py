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


def _display_name(dose_form: str, rows: list[tuple[str, ParsedIngredient]], preferred: dict[str, str]) -> str:
    bits = []
    for bds, p in rows:
        per = ""
        if p.per_unit:
            pv = "" if p.per_value == 1 else f"{_num(p.per_value)} "
            per = f"/{pv}{p.per_unit}"
        bits.append(f"{preferred[bds]} {_num(p.strength_value)} {p.strength_unit}{per}")
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


def _align(parsed: tuple[ParsedIngredient, ...], subs: list[dict]) -> list[tuple[ParsedIngredient, str | None]]:
    if len(parsed) == 1 and len(subs) == 1:
        # Rule 2 applies only if rule 1 does not already pick (it would pick the same one).
        return [(parsed[0], subs[0]["bds_id"])]
    out = []
    for p in parsed:
        key = normalize_name(strip_salt(p.name))
        hit = next((s["bds_id"] for s in subs if key in s["keys"]), None)
        out.append((p, hit))
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


def _build_one(conn: psycopg.Connection, cid: str) -> StageResult:
    prod = conn.execute(
        "SELECT dosage_form, generic_content_raw FROM curated.brand_product WHERE concept_id = %s", (cid,)
    ).fetchone()
    if prod is None:
        return StageResult(cid, "fail", "product not found", {})
    dose_form, raw = prod
    pc = parse_generic_content(raw)
    names = [p.name for p in pc.ingredients]
    if pc.status == "failed":
        _set_status(conn, cid, None, "failed", pc.note)
        return StageResult(cid, "fail", pc.note, {"raw": raw, "parsed": names})
    if pc.status == "partial":
        _set_status(conn, cid, None, "partial", pc.note)
        return StageResult(cid, "warn", pc.note, {"raw": raw, "parsed": names})

    subs = _substances(conn, cid)
    pairs = _align(pc.ingredients, subs)
    parsed_ev = [{"name": p.name, "raw_text": p.raw_text} for p in pc.ingredients]
    aligned_ev = [{"name": p.name, "bds_id": b} for p, b in pairs if b]
    evidence = {"raw": raw, "parsed": parsed_ev, "aligned": aligned_ev, "bdc_id": None, "signature": None}

    unaligned = [p.name for p, b in pairs if b is None]
    if unaligned:
        note = "; ".join(f"could not align '{n}'" for n in unaligned)
        _set_status(conn, cid, None, "parsed", note)
        return StageResult(cid, "warn", note, evidence)
    seen: set[str] = set()
    for _, b in pairs:
        if b in seen:
            note = f"two ingredients resolve to {b}"
            _set_status(conn, cid, None, "parsed", note)
            return StageResult(cid, "warn", note, evidence)
        seen.add(b)

    rows = [(b, p) for p, b in pairs]
    route = route_for_dosage_form(dose_form)
    sig = _signature(dose_form, route, rows)
    preferred = {s["bds_id"]: s["preferred"] for s in subs}
    bdc = conn.execute("SELECT bdc_id FROM curated.clinical_drug WHERE signature = %s", (sig,)).fetchone()
    if bdc is None:
        bdc = conn.execute(
            """INSERT INTO curated.clinical_drug (signature, display_name, dose_form, route)
               VALUES (%s, %s, %s, %s) ON CONFLICT (signature) DO NOTHING RETURNING bdc_id""",
            (sig, _display_name(dose_form, rows, preferred), dose_form.strip(), route),
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
    evidence.update(bdc_id=bdc_id, signature=sig)
    return StageResult(cid, "ok", "", evidence)
