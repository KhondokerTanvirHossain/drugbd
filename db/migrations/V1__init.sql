CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS curated;

CREATE TABLE raw.ocl_concept (
    source      TEXT        NOT NULL,
    concept_id  TEXT        NOT NULL,
    payload     JSONB       NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, concept_id)
);

CREATE TABLE curated.brand_product (
    concept_id          TEXT PRIMARY KEY,
    dar_number          TEXT NOT NULL,
    trade_name          TEXT NOT NULL,
    company             TEXT NOT NULL,
    dosage_form         TEXT NOT NULL,
    generic_content_raw TEXT NOT NULL,
    quality_flag        TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX brand_product_dar_idx   ON curated.brand_product (dar_number);
CREATE INDEX brand_product_trade_trgm ON curated.brand_product USING gin (lower(trade_name) gin_trgm_ops);
CREATE INDEX brand_product_generic_trgm ON curated.brand_product USING gin (lower(generic_content_raw) gin_trgm_ops);

CREATE TABLE curated.brand_product_ingredient (
    concept_id      TEXT NOT NULL REFERENCES curated.brand_product(concept_id) ON DELETE CASCADE,
    xm_code         TEXT NOT NULL,
    ingredient_name TEXT NOT NULL,
    PRIMARY KEY (concept_id, xm_code)
);
