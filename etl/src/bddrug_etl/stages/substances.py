"""Substance stage: mint BDS- IDs per ICD-11 XM code, record names, add RxNav codes."""
from __future__ import annotations

import psycopg

from bddrug_etl.parse.content import ParsedIngredient, parse_generic_content
from bddrug_etl.parse.names import normalize_name, strip_salt
from bddrug_etl.rxnav.client import RxNavClient
from bddrug_etl.stages.results import StageResult

SOURCE = "dgda-ocl"


class _LostRace(Exception):
    """Another transaction created the XM code first; our substance insert is rolled back."""


def _find_by_xm(conn: psycopg.Connection, xm_code: str) -> str | None:
    row = conn.execute(
        "SELECT bds_id FROM curated.substance_code WHERE system = 'ICD11_XM' AND code = %s", (xm_code,)
    ).fetchone()
    return row[0] if row else None


def _get_or_create_substance(conn: psycopg.Connection, xm_code: str, name: str) -> str:
    for _ in range(3):
        found = _find_by_xm(conn, xm_code)
        if found:
            return found
        try:
            with conn.transaction():  # savepoint: substance + XM code are atomic
                bds_id = conn.execute(
                    "INSERT INTO curated.substance (preferred_name) VALUES (%s) RETURNING bds_id", (name,)
                ).fetchone()[0]
                won = conn.execute(
                    """INSERT INTO curated.substance_code (bds_id, system, code, source, method, confidence)
                       VALUES (%s, 'ICD11_XM', %s, %s, 'xm', 1.0)
                       ON CONFLICT (code) WHERE system = 'ICD11_XM' DO NOTHING RETURNING bds_id""",
                    (bds_id, xm_code, SOURCE),
                ).fetchone()
                if won is None:
                    raise _LostRace
                return bds_id
        except _LostRace:
            continue
    raise RuntimeError(f"could not resolve substance for {xm_code}")


def _add_name(conn, bds_id: str, name: str, name_type: str, source: str) -> None:
    conn.execute(
        "INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (bds_id, name, name_type, source),
    )


def _add_code(conn, bds_id: str, system: str, code: str, method: str, confidence: float) -> None:
    conn.execute(
        """INSERT INTO curated.substance_code (bds_id, system, code, source, method, confidence)
           VALUES (%s, %s, %s, 'rxnav', %s, %s) ON CONFLICT DO NOTHING""",
        (bds_id, system, code, method, confidence),
    )


def _rxcui_of(conn, bds_id: str) -> str | None:
    row = conn.execute(
        "SELECT code FROM curated.substance_code WHERE bds_id = %s AND system = 'RXCUI' ORDER BY code LIMIT 1", (bds_id,)
    ).fetchone()
    return row[0] if row else None


def _ensure_rxnav(conn, rxnav: RxNavClient, bds_id: str, name: str, fallback: str | None) -> None:
    if _rxcui_of(conn, bds_id):
        return
    hit = rxnav.rxcui_for_name(name)
    if hit is None and fallback and fallback != name:
        hit = rxnav.rxcui_for_name(fallback)
    if hit is None:
        return
    rxcui, method = hit
    _add_code(conn, bds_id, "RXCUI", rxcui, method, 1.0 if method == "rxnav-exact" else 0.8)
    codes = rxnav.codes_for_rxcui(rxcui)
    for system, values in (("ATC", codes.atc), ("DRUGBANK", codes.drugbank), ("SNOMEDCT", codes.snomedct)):
        for v in values:
            _add_code(conn, bds_id, system, v, method, 1.0 if method == "rxnav-exact" else 0.8)
    if codes.name:
        _add_name(conn, bds_id, codes.name, "rxnorm", "rxnav")


def _align(parsed: list[ParsedIngredient], subs: list[dict], rxnav: RxNavClient, use_rxcui: bool, early: dict | None = None) -> dict[int, ParsedIngredient]:
    """Map substance index -> parsed ingredient (each parsed used once).

    With ``early`` set, only that one substance is aligned (index 0 in the result), by rules 1-2.
    """
    if early is not None:
        total = len(subs)
        if total == 1 and len(parsed) == 1:
            return {0: parsed[0]}
        key = normalize_name(early["xm_name"])
        for p in parsed:
            if normalize_name(strip_salt(p.name)) == key:
                return {0: p}
        return {}
    if len(parsed) == 1 and len(subs) == 1:
        return {0: parsed[0]}
    out: dict[int, ParsedIngredient] = {}
    used: set[int] = set()
    for i, s in enumerate(subs):
        targets = {normalize_name(s["xm_name"])}
        if s.get("rxnorm_name"):
            targets.add(normalize_name(s["rxnorm_name"]))
        for j, p in enumerate(parsed):
            if j not in used and normalize_name(strip_salt(p.name)) in targets:
                out[i] = p
                used.add(j)
                break
    if use_rxcui:
        for i, s in enumerate(subs):
            if i in out or not s.get("rxcui"):
                continue
            for j, p in enumerate(parsed):
                if j in used:
                    continue
                hit = rxnav.rxcui_for_name(strip_salt(p.name))
                if hit and hit[0] == s["rxcui"]:
                    out[i] = p
                    used.add(j)
                    break
    return out


def _evidence_for(conn, bds_id: str, xm: str, name: str) -> dict:
    rows = conn.execute(
        "SELECT system, code, method FROM curated.substance_code WHERE bds_id = %s ORDER BY system, code", (bds_id,)
    ).fetchall()
    by = lambda sysname: [c for s, c, _ in rows if s == sysname]  # noqa: E731
    rx = by("RXCUI")
    method = next((m for s, _, m in rows if s == "RXCUI"), None)
    return {"bds_id": bds_id, "name": name, "xm": xm, "rxcui": rx[0] if rx else None,
            "atc": by("ATC"), "drugbank": by("DRUGBANK"), "method": method}


def _rxnorm_name(conn, bds_id: str) -> str | None:
    row = conn.execute(
        "SELECT name FROM curated.substance_name WHERE bds_id = %s AND name_type = 'rxnorm' ORDER BY name LIMIT 1", (bds_id,)
    ).fetchone()
    return row[0] if row else None


def build_substances(conn: psycopg.Connection, rxnav: RxNavClient, concept_ids: list[str]) -> list[StageResult]:
    results: list[StageResult] = []
    for cid in concept_ids:
        prod = conn.execute(
            "SELECT generic_content_raw FROM curated.brand_product WHERE concept_id = %s", (cid,)
        ).fetchone()
        ings = conn.execute(
            "SELECT xm_code, ingredient_name FROM curated.brand_product_ingredient WHERE concept_id = %s ORDER BY xm_code",
            (cid,),
        ).fetchall()
        if not ings:
            results.append(StageResult(cid, "fail", "no ICD-11 ingredient mapping from DGDA", {"substances": []}))
            continue
        parsed = list(parse_generic_content(prod[0]).ingredients) if prod else []

        with conn.transaction():
            subs = [
                {"bds_id": _get_or_create_substance(conn, xm, name), "xm": xm, "xm_name": name}
                for xm, name in ings
            ]
            for s in subs:
                _add_name(conn, s["bds_id"], s["xm_name"], "icd11", SOURCE)
                fb = None
                if parsed:
                    # Early alignment (rules 1-2 on the XM name only); RxNorm name is not known yet.
                    m = _align(parsed, subs, rxnav, False, early=s)
                    fb = strip_salt(m[0].name) if m else None
                _ensure_rxnav(conn, rxnav, s["bds_id"], s["xm_name"], fb)
                s["rxcui"] = _rxcui_of(conn, s["bds_id"])
                s["rxnorm_name"] = _rxnorm_name(conn, s["bds_id"])

            notes: list[str] = []
            if parsed:
                aligned = _align(parsed, subs, rxnav, True)
                for i, s in enumerate(subs):
                    p = aligned.get(i)
                    if p is None:
                        notes.append(f"no dgda_content name aligned for {s['xm_name']}")
                    else:
                        _add_name(conn, s["bds_id"], strip_salt(p.name), "dgda_content", SOURCE)
            else:
                notes.append("no parsed content to align names")
            missing = [f"no RxCUI for {s['xm_name']}" for s in subs if not s["rxcui"]]
            evidence = {"substances": [_evidence_for(conn, s["bds_id"], s["xm"], s["xm_name"]) for s in subs]}
        if missing or notes:
            results.append(StageResult(cid, "warn", "; ".join(missing + notes), evidence))
        else:
            results.append(StageResult(cid, "ok", "", evidence))
    return results
