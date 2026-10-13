"""Item snapshots (V6 ``ops.item_snapshot``; spec §7.6, §8.1 item 4).

Every code path that stamps ``ops.batch_item.extracted_at`` writes one snapshot per stamped item, in the same
transaction, after that stage's results are written. A snapshot records the run stamp, the run it belongs to
(``run_id``: one per ETL invocation, so the up to four stamps of one run share it) and a payload with the fields the
API's "See what changed" compares. The table is append-only (V6 triggers): nothing here updates or deletes a row.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import NamedTuple

import psycopg
from psycopg.types.json import Jsonb

from bddrug_etl.stages.ddinter import choose

PAYLOAD_VERSION = 1
STAGES = ("dgda", "substances", "clinical", "ddinter")


class _Code(NamedTuple):
    ddinter_id: str
    route_scope: str


def _num(value: Decimal | None) -> str | None:
    """A NUMERIC as plain text ("0.5", "500"): JSON has no Decimal, and floats would round."""
    return None if value is None else format(value.normalize(), "f")


def build_payload(conn: psycopg.Connection, batch_id: str, concept_id: str, extracted_at: datetime) -> dict:
    """The record as it stands now: brand, clinical drug, ingredients with codes and chosen DDInter entries, stages."""
    brand = conn.execute(
        """SELECT dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id
             FROM curated.brand_product WHERE concept_id = %s""", (concept_id,)).fetchone()
    bdc_id = brand[5] if brand else None
    clinical, route = None, None
    if bdc_id:
        row = conn.execute("SELECT bdc_id, display_name, dose_form, route FROM curated.clinical_drug WHERE bdc_id = %s",
                           (bdc_id,)).fetchone()
        if row:
            clinical = {"bdc_id": row[0], "display_name": row[1], "dose_form": row[2], "route": row[3]}
            route = row[3]
    ingredients = []
    for xm_code, name, bds_id, substance in conn.execute(
            """SELECT bpi.xm_code, bpi.ingredient_name, xm.bds_id, s.preferred_name
                 FROM curated.brand_product_ingredient bpi
                 LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                 LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                WHERE bpi.concept_id = %s ORDER BY bpi.xm_code""", (concept_id,)).fetchall():
        codes: list[dict] = []
        strength = None
        chosen: list[str] = []
        assumed = False
        if bds_id:
            codes = [{"system": s, "code": c, "route_scope": r} for s, c, r in conn.execute(
                "SELECT system, code, route_scope FROM curated.substance_code WHERE bds_id = %s ORDER BY system, code",
                (bds_id,)).fetchall()]
            picked, assumed = choose([_Code(c["code"], c["route_scope"]) for c in codes if c["system"] == "DDINTER"],
                                     route)
            chosen = [p.ddinter_id for p in picked]
            if bdc_id:
                srow = conn.execute(
                    """SELECT raw_text, strength_value, strength_unit, per_value, per_unit
                         FROM curated.clinical_drug_ingredient WHERE bdc_id = %s AND bds_id = %s""",
                    (bdc_id, bds_id)).fetchone()
                if srow:
                    strength = {"raw": srow[0], "value": _num(srow[1]), "unit": srow[2], "per_value": _num(srow[3]),
                                "per_unit": srow[4]}
        ingredients.append({"xm_code": xm_code, "name": name, "bds_id": bds_id, "substance": substance,
                            "strength": strength, "codes": codes, "ddinter_chosen": chosen,
                            "route_assumed": assumed and bool(chosen)})
    stages = {stage: {"status": status, "note": note} for stage, status, note in conn.execute(
        "SELECT stage, status, note FROM ops.stage_result WHERE batch_id = %s AND concept_id = %s",
        (batch_id, concept_id)).fetchall()}
    return {
        "version": PAYLOAD_VERSION,
        "extracted_at": extracted_at.isoformat(),
        "brand": None if brand is None else {"dar_number": brand[0], "trade_name": brand[1], "company": brand[2],
                                             "dosage_form": brand[3], "generic_content_raw": brand[4]},
        "clinical_drug": clinical,
        "ingredients": ingredients,
        "stages": {s: stages[s] for s in STAGES if s in stages},
    }


def write_snapshots(conn: psycopg.Connection, items: list[tuple[str, str]], run_id: uuid.UUID, *,
                    shared: bool = False) -> int:
    """One snapshot per (batch_id, concept_id) at the item's current ``extracted_at``; returns how many were written.

    Reason: ``shared_change`` when ``shared`` (re-opened because shared substance data changed); otherwise ``run`` for
    the item's first snapshot and ``rerun`` after. Items without a stamp, or unknown, are skipped. The caller commits.
    """
    written = 0
    for batch_id, concept_id in items:
        row = conn.execute(
            """SELECT bi.extracted_at,
                      EXISTS (SELECT 1 FROM ops.item_snapshot s
                               WHERE s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id)
                 FROM ops.batch_item bi WHERE bi.batch_id = %s AND bi.concept_id = %s""",
            (batch_id, concept_id)).fetchone()
        if row is None or row[0] is None:
            continue
        extracted_at, seen = row
        reason = "shared_change" if shared else ("rerun" if seen else "run")
        conn.execute(
            """INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (batch_id, concept_id, extracted_at, run_id, reason,
             Jsonb(build_payload(conn, batch_id, concept_id, extracted_at))))
        written += 1
    return written
