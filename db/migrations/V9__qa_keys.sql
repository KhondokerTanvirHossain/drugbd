-- IntelliDrugs QA portal (spec §7.10, D71, db-schema-v1.4): self-service QA keys, the qa role in audit rows, and the
-- key audit events. Additive in effect: a new table, and two widened checks that every existing row satisfies.
CREATE TABLE ops.qa_key (
  id           BIGSERIAL   PRIMARY KEY,
  key_hash     TEXT        NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  owner_email  TEXT        NOT NULL CHECK (owner_email = lower(owner_email) AND length(owner_email) BETWEEN 3 AND 320),
  name         TEXT        NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 40
                                           AND name !~ '[[:cntrl:]]'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  CONSTRAINT qa_key_hash_uq UNIQUE (key_hash),
  CONSTRAINT qa_key_lifetime CHECK (expires_at = created_at + interval '2160 hours'),
  CONSTRAINT qa_key_revoked_after_created CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CONSTRAINT qa_key_used_after_created CHECK (last_used_at IS NULL OR last_used_at >= created_at)
);
CREATE INDEX qa_key_owner_idx ON ops.qa_key (owner_email, created_at DESC, id DESC);

-- Only revoked_at (once, from NULL) and last_used_at (forward only) may change; rows are never deleted.
CREATE FUNCTION ops.qa_key_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.key_hash IS DISTINCT FROM OLD.key_hash
     OR NEW.owner_email IS DISTINCT FROM OLD.owner_email OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'ops.qa_key: only revoked_at and last_used_at may change';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'ops.qa_key: a revocation is final';
  END IF;
  IF OLD.last_used_at IS NOT NULL AND (NEW.last_used_at IS NULL OR NEW.last_used_at < OLD.last_used_at) THEN
    RAISE EXCEPTION 'ops.qa_key: last_used_at only moves forward';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_key_guard BEFORE UPDATE ON ops.qa_key FOR EACH ROW EXECUTE FUNCTION ops.qa_key_guard();
CREATE TRIGGER qa_key_no_delete BEFORE DELETE ON ops.qa_key FOR EACH ROW EXECUTE FUNCTION ops.reject_change();
CREATE TRIGGER qa_key_no_truncate BEFORE TRUNCATE ON ops.qa_key FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_change();
REVOKE DELETE, TRUNCATE ON ops.qa_key FROM PUBLIC;

ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_event_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_event_check CHECK (event IN (
  'sign_in','sign_in_denied','sign_out','review_open','evidence_open',
  'decision','decision_rejected','decision_denied',
  'flag_created','flag_resolved','partner_request',
  'pair_decision','pair_decision_rejected','senior_open',
  'qa_read','qa_key_created','qa_key_revoked'));
ALTER TABLE ops.audit_event DROP CONSTRAINT audit_event_actor_role_check;
ALTER TABLE ops.audit_event ADD CONSTRAINT audit_event_actor_role_check
  CHECK (actor_role IN ('pharmacist','engineer','senior','qa','user'));
