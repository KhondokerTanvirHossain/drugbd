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


@dataclass
class SharedChanges:
    """Shared rows a stage really changed (inserted, or updated to different values), by key.

    Substance-level rows (names, codes, DDInter mappings, coverage) are keyed by ``bds_ids``; DDInter rows
    (drug, pairs, texts, diseases, foods) by ``ddinter_ids``, both sides of a pair. Every product with such a
    substance shows these rows, so the pipeline re-opens those products' review (``reopen_dependents``).
    """
    bds_ids: set[str] = field(default_factory=set)
    ddinter_ids: set[str] = field(default_factory=set)

    def merge(self, other: "SharedChanges") -> None:
        self.bds_ids |= other.bds_ids
        self.ddinter_ids |= other.ddinter_ids

    def __bool__(self) -> bool:
        return bool(self.bds_ids or self.ddinter_ids)


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
