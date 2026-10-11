"""Stage result type and persistence."""
from dataclasses import dataclass, field
from typing import Literal

import psycopg
from psycopg.types.json import Jsonb


@dataclass(frozen=True)
class StageResult:
    concept_id: str
    status: Literal["ok", "warn", "fail"]
    note: str
    evidence: dict = field(default_factory=dict)


def write_stage_results(conn: psycopg.Connection, batch_id: str, stage: str, results: list[StageResult]) -> None:
    """Replace (not append) the results for (batch_id, stage, these concept_ids). Caller commits."""
    ids = [r.concept_id for r in results]
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM ops.stage_result WHERE batch_id = %s AND stage = %s AND concept_id = ANY(%s)",
            (batch_id, stage, ids),
        )
        cur.executemany(
            """INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            [(batch_id, r.concept_id, stage, r.status, r.note, Jsonb(r.evidence)) for r in results],
        )
