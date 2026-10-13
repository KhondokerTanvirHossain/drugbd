package com.niramoy.bddrug;

import org.flywaydb.core.Flyway;
import org.testcontainers.containers.PostgreSQLContainer;
import java.sql.DriverManager;

/** V3 pipeline rows shared by the substance and checker integration tests (seeded after Flyway). */
final class PilotSeed {
    private PilotSeed() {}

    static void migrateAndSeed(PostgreSQLContainer<?> pg) throws Exception {
        Flyway.configure().dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
            .locations("filesystem:../db/migrations").load().migrate();
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()); var s = c.createStatement()) {
            s.execute(SQL);
        }
    }

    static final String SQL = """
        INSERT INTO curated.substance (bds_id, preferred_name) VALUES
         ('BDS-000001','Warfarin'), ('BDS-000002','Aspirin'), ('BDS-000003','Chloramphenicol'),
         ('BDS-000004','Domperidone'), ('BDS-000005','Acetaminophen');

        INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
         ('BDS-000001','ICD11_XM','XM5S93','any','dgda-ocl','xm',1.0),
         ('BDS-000001','DRUGBANK','DB00682','any','rxnav','rxnav-exact',1.0),
         ('BDS-000001','DDINTER','DDInter1951','systemic','ddinter2','drugbank',1.0),
         ('BDS-000002','ICD11_XM','XM2ZT1','any','dgda-ocl','xm',1.0),
         ('BDS-000002','DDINTER','DDInter20','systemic','ddinter2','name',0.7),
         ('BDS-000003','ICD11_XM','XM7HA7','any','dgda-ocl','xm',1.0),
         ('BDS-000003','DDINTER','DDInter351','systemic','ddinter2','drugbank',1.0),
         ('BDS-000003','DDINTER','DDInter352','ophthalmic','ddinter2','drugbank',1.0),
         ('BDS-000003','DDINTER','DDInter353','otic','ddinter2','drugbank',1.0),
         ('BDS-000004','ICD11_XM','XM3R26','any','dgda-ocl','xm',1.0),
         ('BDS-000005','ICD11_XM','XM6XF8','any','dgda-ocl','xm',1.0),
         ('BDS-000005','RXCUI','161','any','rxnav','rxnav-exact',1.0),
         ('BDS-000005','ATC','N02BE01','any','rxnav','rxnav-exact',1.0),
         ('BDS-000005','DRUGBANK','DB00316','any','rxnav','rxnav-exact',1.0),
         ('BDS-000005','DDINTER','DDInter14','systemic','ddinter2','drugbank',1.0);

        INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES
         ('BDS-000001','Warfarin','icd11','dgda-ocl'), ('BDS-000001','Warfarin','dgda_content','dgda-ocl'),
         ('BDS-000002','Aspirin','icd11','dgda-ocl'), ('BDS-000002','Acetylsalicylic acid','ddinter','ddinter2'),
         ('BDS-000003','Chloramphenicol','icd11','dgda-ocl'),
         ('BDS-000003','Chloramphenicol (ophthalmic)','ddinter','ddinter2'),
         ('BDS-000004','Domperidone','icd11','dgda-ocl'),
         ('BDS-000005','Acetaminophen','icd11','dgda-ocl'), ('BDS-000005','Paracetamol','dgda_content','dgda-ocl'),
         ('BDS-000005','acetaminophen','rxnorm','rxnav');

        INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES
         ('BDC-000001','tablet|systemic|BDS-000001:5mg/','Warfarin 5 mg tablet','Tablet','systemic'),
         ('BDC-000002','tablet|systemic|BDS-000002:75mg/','Aspirin 75 mg tablet','Tablet','systemic'),
         ('BDC-000003','eye drops|ophthalmic|BDS-000003:0.5%/','Chloramphenicol 0.5% eye drops','Eye Drops','ophthalmic'),
         ('BDC-000004','capsule|systemic|BDS-000003:250mg/','Chloramphenicol 250 mg capsule','Capsule','systemic'),
         ('BDC-000005','tablet|systemic|BDS-000004:10mg/','Domperidone 10 mg tablet','Tablet','systemic'),
         ('BDC-000006','tablet|systemic|BDS-000005:500mg/','Acetaminophen 500 mg tablet','Tablet','systemic');
        INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text) VALUES
         ('BDC-000001','BDS-000001',5,'mg',NULL,NULL,'Warfarin Sodium 5 mg'),
         ('BDC-000002','BDS-000002',75,'mg',NULL,NULL,'Aspirin 75 mg'),
         ('BDC-000003','BDS-000003',0.5,'%',NULL,NULL,'Chloramphenicol 0.5%'),
         ('BDC-000004','BDS-000003',250,'mg',NULL,NULL,'Chloramphenicol 250 mg'),
         ('BDC-000005','BDS-000004',10,'mg',NULL,NULL,'Domperidone 10 mg'),
         ('BDC-000006','BDS-000005',500,'mg',NULL,NULL,'Paracetamol 500 mg');

        INSERT INTO curated.brand_product
          (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status, parse_note) VALUES
         ('W-1','001','Warin','Test Pharma','Tablet','Warfarin Sodium 5 mg','BDC-000001','parsed',NULL),
         ('W-2','002','Coumarol','Other Pharma','Tablet','Warfarin Sodium 5 mg','BDC-000001','parsed',NULL),
         ('A-1','003','Ecosprin','Test Pharma','Tablet','Aspirin 75 mg','BDC-000002','parsed',NULL),
         ('A-NOBDC','004','Asprin Plus','Test Pharma','Tablet','Aspirin 75 mg + herb',NULL,'partial','unparsed: herb'),
         ('C-EYE','005','Optimycin','Eye Pharma','Eye Drops','Chloramphenicol 0.5%','BDC-000003','parsed',NULL),
         ('C-CAP','006','Chloramex','Test Pharma','Capsule','Chloramphenicol 250 mg','BDC-000004','parsed',NULL),
         ('D-1','007','Motigut','Test Pharma','Tablet','Domperidone 10 mg','BDC-000005','parsed',NULL),
         ('N-1','008','Napa','Beximco Pharmaceuticals Ltd','Tablet','Paracetamol 500 mg','BDC-000006','parsed',NULL),
         ('X-NOMAP','009','Herbex','Test Pharma','Syrup','Unknown herb',NULL,'failed','no strength found'),
         ('X-NOSUB','010','Newdrug','Test Pharma','Tablet','Newmol 10 mg',NULL,'parsed',NULL);
        INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES
         ('W-1','XM5S93','Warfarin'), ('W-2','XM5S93','Warfarin'),
         ('A-1','XM2ZT1','Aspirin'), ('A-NOBDC','XM2ZT1','Aspirin'),
         ('C-EYE','XM7HA7','Chloramphenicol'), ('C-CAP','XM7HA7','Chloramphenicol'),
         ('D-1','XM3R26','Domperidone'), ('N-1','XM6XF8','Acetaminophen'),
         ('X-NOSUB','XM0000','Newmol');

        INSERT INTO curated.ddinter_drug (ddinter_id, name, atc_codes, drugbank_id, route_scope) VALUES
         ('DDInter1951','Warfarin','{B01AA03}','DB00682','systemic'),
         ('DDInter20','Acetylsalicylic acid','{B01AC06}','DB00945','systemic'),
         ('DDInter351','Chloramphenicol','{J01BA01}','DB00446','systemic'),
         ('DDInter352','Chloramphenicol (ophthalmic)','{S01AA01}','DB00446','ophthalmic'),
         ('DDInter353','Chloramphenicol (otic)','{S02AA01}','DB00446','otic'),
         ('DDInter14','Acetaminophen','{N02BE01}','DB00316','systemic');
        INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) VALUES
         ('DDInter1951','DDInter20','major','{Monitor,Avoid}','Warfarin','Acetylsalicylic acid','IA-1'),
         ('DDInter1951','DDInter351','moderate','{Monitor}','Warfarin','Chloramphenicol','IA-2'),
         ('DDInter14','DDInter1951','moderate','{}','Acetaminophen','Warfarin',NULL),
         ('DDInter1951','DDInter999','minor','{}','Warfarin','Some Herb',NULL),
         ('DDInter1951','DDInter5','unknown','{}','Warfarin','Alpha Unknown',NULL);
        INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management, refs) VALUES
         ('IA-1','Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.',
                 'Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.','{}'),
         ('IA-2','Chloramphenicol may increase the serum concentration of warfarin.','Monitor INR.','{}');
        INSERT INTO curated.ddinter_disease (ddinter_id, interaction_id, disease_name, severity, text, refs) VALUES
         ('DDInter1951','DIS-2','Liver disease','moderate','Warfarin needs dose review in liver disease.','{}'),
         ('DDInter1951','DIS-1','Bleeding','major','Warfarin increases bleeding risk.','{ref one}');
        INSERT INTO curated.ddinter_food (ddinter_id, interaction_id, food, severity, mechanism, description, management, refs) VALUES
         ('DDInter1951','FD-1','Vitamin K rich foods','moderate','Antagonism','Vitamin K reduces the effect of warfarin.',
          'Keep vitamin K intake steady.','{}');

        INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES
         ('BDS-000001','full','DDInter DDInter1951'), ('BDS-000002','full','DDInter DDInter20'),
         ('BDS-000003','full','DDInter DDInter351, DDInter352, DDInter353'),
         ('BDS-000004','none','No interaction data in DDInter for this substance'),
         ('BDS-000005','full','DDInter DDInter14');
        """;
}
