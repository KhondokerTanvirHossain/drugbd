-- §10.6 (QA portal): the /review/qa budget is measured with 50 keys in the list. Hash-only rows for the e2e QA account,
-- as the API stores them (V9: created now, expiring 2160 hours later); no key exists for any of them. CI runs this after
-- Playwright (whose QA spec revokes its own keys), right before the QA page's Lighthouse run.
INSERT INTO ops.qa_key (key_hash, owner_email, name, expires_at)
SELECT encode(sha256(convert_to('lhci-qa-key-' || i, 'UTF8')), 'hex'), 'qa@e2e.test', 'LHCI key ' || i, now() + interval '2160 hours'
FROM generate_series(1, 50) AS i
ON CONFLICT (key_hash) DO NOTHING;
-- Most of them revoked, so the list shows every status the page draws (Active and Revoked; the API computes Expired).
UPDATE ops.qa_key SET revoked_at = now()
WHERE owner_email = 'qa@e2e.test' AND name LIKE 'LHCI key %' AND name NOT IN ('LHCI key 1', 'LHCI key 2') AND revoked_at IS NULL;
