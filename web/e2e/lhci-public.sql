-- CI only (spec §1.4 S5, §10.6): approve every pilot product's latest item, the one the §7.4 rule reads
-- (ReviewSql.statusOf order), so the public Lighthouse run measures the approved pages. Runs after Playwright on the
-- throwaway CI database. Never in e2e/seed/ (the seed service loads that folder before the review specs).
BEGIN;
CREATE TEMP TABLE lhci_latest ON COMMIT DROP AS
  SELECT DISTINCT ON (concept_id) batch_id, concept_id FROM ops.batch_item
  ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC;
INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
  SELECT batch_id, concept_id, 'ok', '', 'lhci.pharmacist@e2e.test', 'pharmacist' FROM lhci_latest;
UPDATE ops.batch_item bi SET review = 'ok', note = NULL FROM lhci_latest l
  WHERE bi.batch_id = l.batch_id AND bi.concept_id = l.concept_id;
COMMIT;
