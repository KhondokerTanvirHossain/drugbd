-- db-schema-v1.1 (spec 2026-10-12 §7.6, D18). Purely additive: no existing row is changed.
-- ops.item_snapshot: one row per pipeline stamp of a batch item (extracted_at), grouped by run_id, so a re-run can
-- show "what changed" and the history can say why a record is back in review.
-- ops.audit_event: the healthcare-data audit trail (Docker logs rotate, so they are not one).
-- Both tables are append-only by trigger. Rollback = a new migration that drops both tables and ops.reject_change().
CREATE TABLE ops.item_snapshot (
  batch_id     TEXT        NOT NULL,
  concept_id   TEXT        NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL,
  run_id       UUID        NOT NULL,   -- one value per ETL invocation; groups the stamps of one run (§5.6.5)
  reason       TEXT        NOT NULL CHECK (reason IN ('run','rerun','shared_change')),
  payload      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, concept_id, extracted_at),
  FOREIGN KEY (batch_id, concept_id) REFERENCES ops.batch_item (batch_id, concept_id)
);

CREATE TABLE ops.audit_event (
  id          BIGSERIAL   PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  event       TEXT        NOT NULL CHECK (event IN ('sign_in','sign_in_denied','sign_out','review_open','evidence_open',
                                                    'decision','decision_rejected','decision_denied',
                                                    'flag_created','flag_resolved','partner_request')),
  actor_email TEXT,
  actor_role  TEXT        CHECK (actor_role IN ('pharmacist','engineer','user')),
  target_type TEXT,
  target_id   TEXT,
  outcome     TEXT        NOT NULL,
  request_id  UUID
);
CREATE INDEX audit_event_at_idx ON ops.audit_event (at DESC);
CREATE INDEX audit_event_target_idx ON ops.audit_event (target_type, target_id, at DESC);
CREATE UNIQUE INDEX audit_event_decision_request_uq ON ops.audit_event (request_id) WHERE event = 'decision';

-- Append-only. Every service connects as the same database role, which owns these tables,
-- so a REVOKE alone would not hold (an owner can grant itself the privilege back). Triggers do.
CREATE FUNCTION ops.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON ops.audit_event
  FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON ops.audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER item_snapshot_append_only BEFORE UPDATE OR DELETE ON ops.item_snapshot
  FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER item_snapshot_no_truncate BEFORE TRUNCATE ON ops.item_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
REVOKE UPDATE, DELETE, TRUNCATE ON ops.audit_event, ops.item_snapshot FROM PUBLIC;
