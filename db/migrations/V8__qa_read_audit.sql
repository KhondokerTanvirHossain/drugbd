-- IntelliDrugs QA (spec §7.9.6, D63, db-schema-v1.3): the qa_read audit event of the read-only QA API.
-- V7's audit_event_event_check refuses it, so the check is dropped and added again with qa_read appended. Nothing else
-- changes: target_type has no database check, actor_role stays nullable. Every existing row satisfies the widened check.
ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_event_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_event_check CHECK (event IN (
  'sign_in','sign_in_denied','sign_out','review_open','evidence_open',
  'decision','decision_rejected','decision_denied',
  'flag_created','flag_resolved','partner_request',
  'pair_decision','pair_decision_rejected','senior_open',
  'qa_read'));
