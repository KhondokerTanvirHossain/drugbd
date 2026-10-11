CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE ops.batch (
    batch_id    TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'in_review' CHECK (status IN ('in_review', 'approved', 'rejected')),
    run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_count  INT NOT NULL
);

CREATE TABLE ops.batch_item (
    batch_id    TEXT NOT NULL REFERENCES ops.batch(batch_id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    concept_id  TEXT NOT NULL,
    review      TEXT NOT NULL DEFAULT 'pending' CHECK (review IN ('pending', 'ok', 'issue')),
    note        TEXT,
    PRIMARY KEY (batch_id, concept_id)
);
