CREATE SEQUENCE curated.bds_seq MAXVALUE 999999 NO CYCLE;
CREATE SEQUENCE curated.bdc_seq MAXVALUE 999999 NO CYCLE;

CREATE TABLE raw.http_snapshot (
  source TEXT NOT NULL, request_key TEXT NOT NULL,          -- e.g. 'rxnav', 'GET /REST/rxcui.json?name=Paracetamol&search=2'
  status INT NOT NULL, body TEXT NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, request_key));

CREATE TABLE curated.substance (
  bds_id TEXT PRIMARY KEY DEFAULT 'BDS-' || lpad(nextval('curated.bds_seq')::text, 6, '0'),
  preferred_name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'allopathic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE curated.substance_code (
  bds_id TEXT NOT NULL REFERENCES curated.substance ON DELETE CASCADE,
  system TEXT NOT NULL CHECK (system IN ('ICD11_XM','RXCUI','ATC','DRUGBANK','SNOMEDCT','DDINTER')),
  code TEXT NOT NULL, route_scope TEXT NOT NULL DEFAULT 'any',   -- 'any' | 'systemic' | 'ophthalmic' | 'otic' | 'nasal' | 'topical'
  source TEXT NOT NULL, method TEXT NOT NULL, confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  PRIMARY KEY (bds_id, system, code));
CREATE UNIQUE INDEX substance_code_xm_unique ON curated.substance_code (code) WHERE system = 'ICD11_XM';

CREATE TABLE curated.substance_name (
  bds_id TEXT NOT NULL REFERENCES curated.substance ON DELETE CASCADE,
  name TEXT NOT NULL, name_type TEXT NOT NULL,            -- 'icd11' | 'dgda_content' | 'rxnorm' | 'ddinter'
  source TEXT NOT NULL, PRIMARY KEY (bds_id, name, name_type));

CREATE TABLE curated.clinical_drug (
  bdc_id TEXT PRIMARY KEY DEFAULT 'BDC-' || lpad(nextval('curated.bdc_seq')::text, 6, '0'),
  signature TEXT NOT NULL UNIQUE,                         -- deterministic: see Task 6
  display_name TEXT NOT NULL, dose_form TEXT NOT NULL, route TEXT NOT NULL);

CREATE TABLE curated.clinical_drug_ingredient (
  bdc_id TEXT NOT NULL REFERENCES curated.clinical_drug ON DELETE CASCADE,
  bds_id TEXT NOT NULL REFERENCES curated.substance,
  strength_value NUMERIC, strength_unit TEXT, per_value NUMERIC, per_unit TEXT, raw_text TEXT NOT NULL,
  PRIMARY KEY (bdc_id, bds_id));

ALTER TABLE curated.brand_product
  ADD COLUMN bdc_id TEXT REFERENCES curated.clinical_drug,
  ADD COLUMN parse_status TEXT CHECK (parse_status IN ('parsed','partial','failed')),
  ADD COLUMN parse_note TEXT;

CREATE TABLE curated.ddinter_drug (
  ddinter_id TEXT PRIMARY KEY, name TEXT NOT NULL, atc_codes TEXT[] NOT NULL DEFAULT '{}',
  drugbank_id TEXT, route_scope TEXT NOT NULL DEFAULT 'systemic', fetched_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE curated.ddinter_pair (
  ddinter_a TEXT NOT NULL, ddinter_b TEXT NOT NULL,            -- ddinter_a < ddinter_b (text order)
  severity TEXT NOT NULL CHECK (severity IN ('major','moderate','minor','unknown')),
  actions TEXT[] NOT NULL DEFAULT '{}', partner_name_a TEXT NOT NULL, partner_name_b TEXT NOT NULL,
  interaction_id TEXT, PRIMARY KEY (ddinter_a, ddinter_b), CHECK (ddinter_a < ddinter_b));

CREATE TABLE curated.ddinter_interaction_text (
  interaction_id TEXT PRIMARY KEY, interaction TEXT NOT NULL, management TEXT NOT NULL, refs TEXT[] NOT NULL DEFAULT '{}');

CREATE TABLE curated.ddinter_disease (
  ddinter_id TEXT NOT NULL, interaction_id TEXT NOT NULL, disease_name TEXT NOT NULL,
  severity TEXT NOT NULL, text TEXT NOT NULL, refs TEXT[] NOT NULL DEFAULT '{}', PRIMARY KEY (ddinter_id, interaction_id));

CREATE TABLE curated.ddinter_food (
  ddinter_id TEXT NOT NULL, interaction_id TEXT NOT NULL, food TEXT NOT NULL, severity TEXT NOT NULL,
  mechanism TEXT, description TEXT NOT NULL, management TEXT NOT NULL, refs TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (ddinter_id, interaction_id));

CREATE TABLE curated.interaction_coverage (
  bds_id TEXT PRIMARY KEY REFERENCES curated.substance ON DELETE CASCADE,
  coverage TEXT NOT NULL CHECK (coverage IN ('full','none')), note TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE ops.stage_result (
  batch_id TEXT NOT NULL REFERENCES ops.batch ON DELETE CASCADE, concept_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('dgda','substances','clinical','ddinter')),
  status TEXT NOT NULL CHECK (status IN ('ok','warn','fail')), note TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (batch_id, concept_id, stage));
