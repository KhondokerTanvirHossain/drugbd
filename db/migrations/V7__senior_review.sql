-- IntelliDrugs P1C (spec §7.8, db-schema-v1.2): the senior pharmacist role, the dismiss decision, append-only pair
-- reviews, and the new audit events. Additive in effect: every existing row satisfies the widened checks.

-- V4 named these column CHECKs implicitly; the migration test asserts the names in pg_constraint before dropping.
ALTER TABLE ops.review_decision DROP CONSTRAINT review_decision_decision_check;
ALTER TABLE ops.review_decision ADD CONSTRAINT review_decision_decision_check
  CHECK (decision IN ('ok','issue','dismiss'));
ALTER TABLE ops.review_decision DROP CONSTRAINT review_decision_reviewer_role_check;
ALTER TABLE ops.review_decision ADD CONSTRAINT review_decision_reviewer_role_check
  CHECK (reviewer_role IN ('pharmacist','engineer','senior'));
ALTER TABLE ops.review_decision ADD CONSTRAINT review_decision_dismiss_by_senior
  CHECK (decision <> 'dismiss' OR (reviewer_role = 'senior' AND length(btrim(note)) BETWEEN 5 AND 1000));

CREATE TABLE ops.pair_review (
  id             BIGSERIAL   PRIMARY KEY,
  ddinter_a      TEXT        NOT NULL,
  ddinter_b      TEXT        NOT NULL,
  decision       TEXT        NOT NULL CHECK (decision IN ('reviewed','issue')),
  note           TEXT        NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  content_hash   TEXT        NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  content        JSONB       NOT NULL,      -- severity, actions, interaction, management as reviewed
  reviewer_email TEXT        NOT NULL,      -- team-only, like review_decision
  reviewer_role  TEXT        NOT NULL CHECK (reviewer_role = 'senior'),
  decided_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ddinter_a < ddinter_b),
  CHECK (decision <> 'issue' OR length(btrim(note)) >= 5),
  FOREIGN KEY (ddinter_a, ddinter_b) REFERENCES curated.ddinter_pair (ddinter_a, ddinter_b)
);
CREATE INDEX pair_review_pair_idx ON ops.pair_review (ddinter_a, ddinter_b, decided_at DESC, id DESC);

CREATE TRIGGER pair_review_append_only BEFORE UPDATE OR DELETE ON ops.pair_review
  FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER pair_review_no_truncate BEFORE TRUNCATE ON ops.pair_review
  FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
REVOKE UPDATE, DELETE, TRUNCATE ON ops.pair_review FROM PUBLIC;

ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_event_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_event_check CHECK (event IN (
  'sign_in','sign_in_denied','sign_out','review_open','evidence_open',
  'decision','decision_rejected','decision_denied',
  'flag_created','flag_resolved','partner_request',
  'pair_decision','pair_decision_rejected','senior_open'));
ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_actor_role_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_actor_role_check
  CHECK (actor_role IN ('pharmacist','engineer','senior','user'));
CREATE UNIQUE INDEX audit_event_pair_decision_request_uq ON ops.audit_event (request_id) WHERE event = 'pair_decision';
