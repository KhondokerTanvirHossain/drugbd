-- P1C e2e fixture (spec §11.4). Applied once by e2e/senior.spec.ts (applyP1cFixture), not a seed file: Learn's live
-- numbers are the pilot seed's. Batch e2e-p1c holds three products outside the pilot: Ibufen 400 and Warin, approved by
-- a pharmacist, and Cafergot, pending. Its run is older than the pilot's, so /review lists 0001-pilot first.
INSERT INTO curated.substance (bds_id, preferred_name) VALUES
 ('BDS-000101','Ibuprofen'), ('BDS-000102','Caffeine'), ('BDS-000103','Ergotamine');
INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
 ('BDS-000101','ICD11_XM','XM1P01','any','dgda-ocl','xm',1),
 ('BDS-000101','RXCUI','5640','any','rxnav','rxnav-exact',1),
 ('BDS-000101','DDINTER','DDInter926','systemic','ddinter2','drugbank',1),
 ('BDS-000102','ICD11_XM','XM2C02','any','dgda-ocl','xm',1),
 ('BDS-000102','DDINTER','DDInter272','systemic','ddinter2','drugbank',1),
 ('BDS-000103','ICD11_XM','XM3E03','any','dgda-ocl','xm',1),
 ('BDS-000103','DDINTER','DDInter700','systemic','ddinter2','drugbank',1);
INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES
 ('BDS-000101','Ibuprofen','icd11','dgda-ocl'), ('BDS-000102','Caffeine','icd11','dgda-ocl'), ('BDS-000103','Ergotamine','icd11','dgda-ocl');
INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES
 ('BDS-000101','full','DDInter DDInter926'), ('BDS-000102','full','DDInter DDInter272'), ('BDS-000103','full','DDInter DDInter700');
INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES
 ('BDC-000101','tablet|systemic|BDS-000101:400mg/','Ibuprofen 400 mg tablet','Tablet','systemic'),
 ('BDC-000102','tablet|systemic|BDS-000102:100mg/;BDS-000103:1mg/','Caffeine 100 mg + Ergotamine 1 mg tablet','Tablet','systemic'),
 ('BDC-000103','tablet|systemic|BDS-000003:2mg/','Warfarin 2 mg tablet','Tablet','systemic');
INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text) VALUES
 ('BDC-000101','BDS-000101',400,'mg',NULL,NULL,'Ibuprofen 400 mg'),
 ('BDC-000102','BDS-000102',100,'mg',NULL,NULL,'Caffeine 100 mg'),
 ('BDC-000102','BDS-000103',1,'mg',NULL,NULL,'Ergotamine 1 mg'),
 ('BDC-000103','BDS-000003',2,'mg',NULL,NULL,'Warfarin 2 mg');
INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag, bdc_id, parse_status, parse_note) VALUES
 ('901-0001-001--ibufen-400','901-0001-001','Ibufen 400','E2E Pharma Ltd.','Tablet','Ibuprofen 400 mg',NULL,'BDC-000101','parsed',NULL),
 ('901-0002-001--cafergot','901-0002-001','Cafergot','E2E Pharma Ltd.','Tablet','Caffeine 100 mg + Ergotamine 1 mg',NULL,'BDC-000102','parsed',NULL),
 ('900-0001-001--warin','900-0001-001','Warin','E2E Pharma Ltd.','Tablet','Warfarin 2 mg',NULL,'BDC-000103','parsed',NULL);
INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES
 ('901-0001-001--ibufen-400','XM1P01','Ibuprofen'),
 ('901-0002-001--cafergot','XM2C02','Caffeine'), ('901-0002-001--cafergot','XM3E03','Ergotamine'),
 ('900-0001-001--warin','XM86W0','Warfarin');
INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES
 ('DGDA-Drugs','901-0001-001--ibufen-400','{"id":"901-0001-001--ibufen-400","concept_class":"Drug","display_name":"Ibufen 400","extras":{"dar_number":"901-0001-001","company":"E2E Pharma Ltd.","dosage_form":"Tablet","generic_content":"Ibuprofen 400 mg"}}'),
 ('DGDA-Drugs','901-0002-001--cafergot','{"id":"901-0002-001--cafergot","concept_class":"Drug","display_name":"Cafergot","extras":{"dar_number":"901-0002-001","company":"E2E Pharma Ltd.","dosage_form":"Tablet","generic_content":"Caffeine 100 mg + Ergotamine 1 mg"}}'),
 ('DGDA-Drugs','900-0001-001--warin','{"id":"900-0001-001--warin","concept_class":"Drug","display_name":"Warin","extras":{"dar_number":"900-0001-001","company":"E2E Pharma Ltd.","dosage_form":"Tablet","generic_content":"Warfarin 2 mg"}}');
INSERT INTO curated.ddinter_drug (ddinter_id, name, drugbank_id, route_scope) VALUES
 ('DDInter926','Ibuprofen','DB01050','systemic'), ('DDInter272','Caffeine','DB00201','systemic'), ('DDInter700','Ergotamine','DB00696','systemic');
INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management) VALUES
 ('19990','Ibuprofen may increase the anticoagulant effect of warfarin.','Avoid the combination; if used, monitor the INR and for bleeding.'),
 ('19991','Caffeine may reduce the clearance of acetaminophen.','Monitor for adverse effects.');
INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) VALUES
 ('DDInter1951','DDInter926','major','{"synergy"}','Warfarin','Ibuprofen','19990'),
 ('DDInter14','DDInter926','unknown','{"unknown"}','Acetaminophen','Ibuprofen',NULL),
 ('DDInter272','DDInter700','major','{"synergy"}','Caffeine','Ergotamine',NULL),
 ('DDInter14','DDInter272','moderate','{"metabolism"}','Acetaminophen','Caffeine','19991');

INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES ('e2e-p1c','in_review',3,'2026-10-01T08:00:00+00:00');
INSERT INTO ops.batch_run (batch_id, run_at, stages, counts, concept_ids) VALUES ('e2e-p1c','2026-10-01T08:00:00+00:00','{dgda,substances,clinical,ddinter}','{}','{}');
INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
 ('e2e-p1c','DGDA-Drugs','901-0001-001--ibufen-400','ok',NULL,'2026-10-01T08:01:00+00:00'),
 ('e2e-p1c','DGDA-Drugs','901-0002-001--cafergot','pending',NULL,'2026-10-01T08:01:00+00:00'),
 ('e2e-p1c','DGDA-Drugs','900-0001-001--warin','ok',NULL,'2026-10-01T08:01:00+00:00');
INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
 ('e2e-p1c','901-0001-001--ibufen-400','dgda','ok','','{}'), ('e2e-p1c','901-0001-001--ibufen-400','substances','ok','','{}'),
 ('e2e-p1c','901-0001-001--ibufen-400','clinical','ok','','{}'),
 ('e2e-p1c','901-0001-001--ibufen-400','ddinter','warn','DDInter text not found for DDInter14/DDInter926','{"text_missing":[["DDInter14","DDInter926"]]}'),
 ('e2e-p1c','901-0002-001--cafergot','dgda','ok','','{}'), ('e2e-p1c','901-0002-001--cafergot','substances','ok','','{}'),
 ('e2e-p1c','901-0002-001--cafergot','clinical','ok','','{}'),
 ('e2e-p1c','901-0002-001--cafergot','ddinter','warn','DDInter text not found for DDInter272/DDInter700','{"text_missing":[["DDInter272","DDInter700"]]}'),
 ('e2e-p1c','900-0001-001--warin','dgda','ok','','{}'), ('e2e-p1c','900-0001-001--warin','substances','ok','','{}'),
 ('e2e-p1c','900-0001-001--warin','clinical','ok','','{}'), ('e2e-p1c','900-0001-001--warin','ddinter','ok','','{}');
INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES
 ('e2e-p1c','901-0001-001--ibufen-400','2026-10-01T08:01:00+00:00','00000000-0000-4000-8000-0000000000c1','run','{"version":2,"extracted_at":"2026-10-01T08:01:00+00:00"}'),
 ('e2e-p1c','901-0002-001--cafergot','2026-10-01T08:01:00+00:00','00000000-0000-4000-8000-0000000000c1','run','{"version":2,"extracted_at":"2026-10-01T08:01:00+00:00"}'),
 ('e2e-p1c','900-0001-001--warin','2026-10-01T08:01:00+00:00','00000000-0000-4000-8000-0000000000c1','run','{"version":2,"extracted_at":"2026-10-01T08:01:00+00:00"}');
INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) VALUES
 ('e2e-p1c','901-0001-001--ibufen-400','ok','','other.pharmacist@e2e.test','pharmacist'),
 ('e2e-p1c','900-0001-001--warin','ok','','other.pharmacist@e2e.test','pharmacist');
