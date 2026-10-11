-- Sprint 3: review decisions (append-only history), flags, batch run history, scale indexes.

CREATE INDEX IF NOT EXISTS ddinter_pair_b_idx ON curated.ddinter_pair (ddinter_b);
CREATE INDEX IF NOT EXISTS substance_code_system_code_idx ON curated.substance_code (system, code);
CREATE INDEX IF NOT EXISTS brand_product_bdc_idx ON curated.brand_product (bdc_id);

-- Append-only: rows are never updated or deleted. NO ACTION keeps a batch_item with decisions from being deleted.
CREATE TABLE ops.review_decision (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL, concept_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ok','issue')),
  note TEXT NOT NULL DEFAULT '',
  reviewer_email TEXT NOT NULL, reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('pharmacist','engineer')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (batch_id, concept_id) REFERENCES ops.batch_item (batch_id, concept_id) ON DELETE NO ACTION);
CREATE INDEX review_decision_item_idx ON ops.review_decision (batch_id, concept_id, decided_at DESC);

CREATE TABLE ops.flag (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('product','substance','batch_item','check','other')),
  target_id TEXT NOT NULL, message TEXT NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
  reporter_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ, resolved_by TEXT);

CREATE TABLE ops.batch_run (
  id BIGSERIAL PRIMARY KEY, batch_id TEXT NOT NULL, run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stages TEXT[] NOT NULL, counts JSONB NOT NULL, concept_ids TEXT[] NOT NULL DEFAULT '{}');

ALTER TABLE ops.batch_item ADD COLUMN extracted_at TIMESTAMPTZ;   -- set by the pipeline per item; reviews before it don't count
