"""Idempotent upsert of DGDA concepts into raw + curated tables."""
from collections.abc import Iterable
from dataclasses import dataclass

import psycopg
from psycopg.types.json import Jsonb

from bddrug_etl.ocl.transform import concept_to_product


@dataclass(frozen=True)
class LoadStats:
    seen: int
    loaded: int
    skipped: int


def load_products(conn: psycopg.Connection, concepts: Iterable[dict], source: str = "DGDA-Drugs", commit: bool = True) -> LoadStats:
    seen = loaded = 0
    with conn.cursor() as cur:
        for concept in concepts:
            seen += 1
            cur.execute(
                """INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES (%s, %s, %s)
                   ON CONFLICT (source, concept_id) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()""",
                (source, concept["id"], Jsonb(concept)),
            )
            product = concept_to_product(concept)
            if product is None:
                continue
            cur.execute(
                """INSERT INTO curated.brand_product
                     (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (concept_id) DO UPDATE SET
                     dar_number = EXCLUDED.dar_number, trade_name = EXCLUDED.trade_name, company = EXCLUDED.company,
                     dosage_form = EXCLUDED.dosage_form, generic_content_raw = EXCLUDED.generic_content_raw,
                     quality_flag = EXCLUDED.quality_flag, updated_at = now()""",
                (product.concept_id, product.dar_number, product.trade_name, product.company,
                 product.dosage_form, product.generic_content_raw, product.quality_flag),
            )
            cur.execute("DELETE FROM curated.brand_product_ingredient WHERE concept_id = %s", (product.concept_id,))
            cur.executemany(
                "INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES (%s, %s, %s)",
                [(product.concept_id, i.xm_code, i.name) for i in product.ingredients],
            )
            loaded += 1
            if commit and loaded % 500 == 0:
                conn.commit()
    if commit:
        conn.commit()
    return LoadStats(seen=seen, loaded=loaded, skipped=seen - loaded)
