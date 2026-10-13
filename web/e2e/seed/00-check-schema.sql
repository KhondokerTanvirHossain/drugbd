-- Fails the seed step fast when P0's V6 migration has not run (the audit endpoint needs ops.audit_event).
-- P1B adds the pilot rows as 10-pilot.sql.
SELECT 1 FROM ops.audit_event LIMIT 0;
