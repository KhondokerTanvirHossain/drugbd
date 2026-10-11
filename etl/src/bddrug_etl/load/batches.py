"""Batch runs: fetch an explicit list of DGDA concepts, load them, and record per-item review status."""
import pathlib

import psycopg

from bddrug_etl.load.products import LoadStats, load_products

OWNER, SOURCE = "MoHFW", "DGDA-Drugs"


def read_batch_file(path: pathlib.Path) -> list[str]:
    ids: list[str] = []
    for line in path.read_text().splitlines():
        concept_id = line.split("#", 1)[0].strip()
        if concept_id and concept_id not in ids:
            ids.append(concept_id)
    return ids


def run_batch(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str]) -> LoadStats:
    found, missing = [], []
    for concept_id in concept_ids:
        concept = client.get_concept(OWNER, SOURCE, concept_id)
        (found.append(concept) if concept else missing.append(concept_id))
    stats = load_products(conn, found, source=SOURCE)
    with conn.cursor() as cur:
        cur.execute("DELETE FROM ops.batch WHERE batch_id = %s", (batch_id,))
        cur.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES (%s, %s)", (batch_id, len(concept_ids)))
        cur.executemany(
            "INSERT INTO ops.batch_item (batch_id, source, concept_id) VALUES (%s, %s, %s)",
            [(batch_id, SOURCE, c["id"]) for c in found],
        )
        cur.executemany(
            "INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note) VALUES (%s, %s, %s, 'issue', 'not found at source')",
            [(batch_id, SOURCE, concept_id) for concept_id in missing],
        )
    conn.commit()
    return stats
