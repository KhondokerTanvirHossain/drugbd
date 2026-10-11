"""Batch runs: fetch an explicit list of DGDA concepts, load them, and record per-item review status."""
import pathlib

import psycopg

from bddrug_etl.load.products import LoadStats, load_products
from bddrug_etl.ocl.transform import concept_to_product
from bddrug_etl.stages.results import StageResult, write_stage_results

OWNER, SOURCE = "MoHFW", "DGDA-Drugs"
NOT_FOUND, NOT_A_DRUG = "not found at source", "not a registered Drug product"


def read_batch_file(path: pathlib.Path) -> list[str]:
    ids: list[str] = []
    for line in path.read_text().splitlines():
        concept_id = line.split("#", 1)[0].strip()
        if concept_id and concept_id not in ids:
            ids.append(concept_id)
    return ids


def _dgda_results(concept_ids: list[str], found: list[dict], missing: list[str], not_products: list[str]) -> list[StageResult]:
    """One 'dgda' stage result per requested concept, in request order: ok when loaded, else fail."""
    classes = {c["id"]: c.get("concept_class") for c in found}
    missing_set, not_set = set(missing), set(not_products)
    out = []
    for cid in concept_ids:
        if cid in missing_set:
            out.append(StageResult(cid, "fail", NOT_FOUND, {"source": SOURCE, "concept_class": None}))
        elif cid in not_set:
            out.append(StageResult(cid, "fail", NOT_A_DRUG, {"source": SOURCE, "concept_class": classes.get(cid)}))
        else:
            out.append(StageResult(cid, "ok", "", {"source": SOURCE, "concept_class": classes.get(cid)}))
    return out


def run_batch(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str]) -> LoadStats:
    """Load the batch and record its items and 'dgda' stage results in one transaction (committed here)."""
    found, missing = [], []
    for concept_id in concept_ids:
        concept = client.get_concept(OWNER, SOURCE, concept_id)
        (found.append(concept) if concept else missing.append(concept_id))
    stats = load_products(conn, found, source=SOURCE, commit=False)  # single commit below keeps the run atomic
    not_products = [c["id"] for c in found if concept_to_product(c) is None]
    with conn.cursor() as cur:
        cur.execute("DELETE FROM ops.batch WHERE batch_id = %s", (batch_id,))
        cur.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES (%s, %s)", (batch_id, len(concept_ids)))
        cur.executemany(
            "INSERT INTO ops.batch_item (batch_id, source, concept_id) VALUES (%s, %s, %s)",
            [(batch_id, SOURCE, c["id"]) for c in found if c["id"] not in not_products],
        )
        cur.executemany(
            "INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note) VALUES (%s, %s, %s, 'issue', %s)",
            [(batch_id, SOURCE, concept_id, NOT_FOUND) for concept_id in missing],
        )
        cur.executemany(
            "INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note) VALUES (%s, %s, %s, 'issue', %s)",
            [(batch_id, SOURCE, concept_id, NOT_A_DRUG) for concept_id in not_products],
        )
    write_stage_results(conn, batch_id, "dgda", _dgda_results(concept_ids, found, missing, not_products))
    conn.commit()
    return stats
