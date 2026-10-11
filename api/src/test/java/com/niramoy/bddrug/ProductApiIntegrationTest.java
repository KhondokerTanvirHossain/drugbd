package com.niramoy.bddrug;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.DriverManager;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) {
        r.add("spring.r2dbc.url", () -> "r2dbc:postgresql://" + pg.getHost() + ":" + pg.getFirstMappedPort() + "/" + pg.getDatabaseName());
        r.add("spring.r2dbc.username", pg::getUsername);
        r.add("spring.r2dbc.password", pg::getPassword);
    }

    @BeforeAll static void seed() throws Exception {
        Flyway.configure().dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
            .locations("filesystem:../db/migrations").load().migrate();
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()); var s = c.createStatement()) {
            s.execute("""
                INSERT INTO curated.brand_product VALUES
                 ('341-0160-020--tericin','341-0160-020','Tericin','Beacon Pharmaceuticals PLC','Injection','Amphotericin B 50 mg/vial',NULL,now()),
                 ('000-0000-001--pct-100','000-0000-001','PCT 100% Max','Test Pharma','Tablet','Paracetamol 500 mg',NULL,now()),
                 ('000-0000-002--no-map','000-0000-002','Nomap','Test Pharma','Cream','Unknown herb',NULL,now());
                INSERT INTO curated.brand_product_ingredient VALUES ('341-0160-020--tericin','XM5TR4','Amphotericin B');
                INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES ('DGDA-Drugs','341-0160-020--tericin',
                  '{"id":"341-0160-020--tericin","extras":{"trade_name":"Tericin","generic_content_raw":"Amphotericin B  50 mg/vial"},"mappings":[{"map_type":"Has-active-ingredient","to_concept_code":"XM5TR4","to_concept_name":"Amphotericin B"}]}');
                INSERT INTO ops.batch (batch_id, item_count) VALUES ('0001-pilot', 2);
                INSERT INTO ops.batch_item (batch_id, source, concept_id) VALUES ('0001-pilot','DGDA-Drugs','341-0160-020--tericin');
                INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note) VALUES ('0001-pilot','DGDA-Drugs','typo-id','issue','not found at source');
                """);
            s.execute(V3_SEED);
        }
    }

    /** V3 pipeline rows: substances, clinical drugs, DDInter entries and stage results. */
    static final String V3_SEED = """
        INSERT INTO curated.substance (bds_id, preferred_name) VALUES
         ('BDS-000001','Amphotericin B'), ('BDS-000002','Chloramphenicol'),
         ('BDS-000003','Clavulanic acid'), ('BDS-000004','Amoxicillin');
        INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
         ('BDS-000001','ICD11_XM','XM5TR4','any','dgda-ocl','xm',1.0),
         ('BDS-000001','DDINTER','DDInter100','systemic','ddinter2','name',0.7),
         ('BDS-000002','ICD11_XM','XM7HA7','any','dgda-ocl','xm',1.0),
         ('BDS-000002','DDINTER','DDInter351','systemic','ddinter2','drugbank',1.0),
         ('BDS-000002','DDINTER','DDInter352','ophthalmic','ddinter2','drugbank',1.0),
         ('BDS-000002','DDINTER','DDInter353','otic','ddinter2','drugbank',1.0),
         ('BDS-000003','ICD11_XM','XM2K14','any','dgda-ocl','xm',1.0),
         ('BDS-000004','ICD11_XM','XM8YH5','any','dgda-ocl','xm',1.0);
        INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope) VALUES
         ('DDInter100','Amphotericin B','systemic'), ('DDInter351','Chloramphenicol','systemic'),
         ('DDInter352','Chloramphenicol (ophthalmic)','ophthalmic'), ('DDInter353','Chloramphenicol (otic)','otic');
        INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES
         ('BDC-000001','injection|systemic|BDS-000001:50mg/1vial','Amphotericin B 50 mg/vial injection','Injection','systemic'),
         ('BDC-000002','eye drops|ophthalmic|BDS-000002:0.5%/','Chloramphenicol 0.5% eye drops','Eye Drops','ophthalmic'),
         ('BDC-000003','tablet|systemic|BDS-000003:125mg/;BDS-000004:500mg/',
          'Amoxicillin 500 mg + Clavulanic acid 125 mg tablet','Tablet','systemic');
        INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text) VALUES
         ('BDC-000001','BDS-000001',50,'mg',1,'vial','Amphotericin B 50 mg/vial'),
         ('BDC-000002','BDS-000002',0.5,'%',NULL,NULL,'Chloramphenicol 0.5%'),
         ('BDC-000003','BDS-000003',125,'mg',NULL,NULL,'Clavulanic Acid 125 mg'),
         ('BDC-000003','BDS-000004',500,'mg',NULL,NULL,'Amoxicillin 500 mg');
        UPDATE curated.brand_product SET bdc_id = 'BDC-000001', parse_status = 'parsed' WHERE concept_id = '341-0160-020--tericin';
        UPDATE curated.brand_product SET parse_status = 'failed', parse_note = 'no strength found' WHERE concept_id = '000-0000-002--no-map';
        INSERT INTO curated.brand_product
          (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status) VALUES
         ('000-0000-003--eye','000-0000-003','Optimycin','Eye Pharma','Eye Drops','Chloramphenicol 0.5%','BDC-000002','parsed'),
         ('000-0000-004--amc','000-0000-004','Moxaclav','Test Pharma','Tablet',
          'Amoxicillin 500 mg + Clavulanic Acid 125 mg','BDC-000003','parsed');
        INSERT INTO curated.brand_product_ingredient VALUES
         ('000-0000-003--eye','XM7HA7','Chloramphenicol'),
         ('000-0000-004--amc','XM8YH5','Amoxicillin'), ('000-0000-004--amc','XM2K14','Clavulanic acid');
        INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
         ('0001-pilot','341-0160-020--tericin','ddinter','warn','DDInter DDInter100 matched by name only','{"pair_count": 0}'),
         ('0001-pilot','341-0160-020--tericin','clinical','ok','','{"bdc_id": "BDC-000001", "aligned": [{"bds_id": "BDS-000001", "method": "single"}]}'),
         ('0001-pilot','341-0160-020--tericin','dgda','ok','','{}'),
         ('0001-pilot','341-0160-020--tericin','substances','ok','','{"substances": [{"bds_id": "BDS-000001"}]}'),
         ('0001-pilot','typo-id','dgda','fail','not found at source','{"status": 404}');
        """;

    @Autowired WebTestClient web;

    @Test void searchesByIngredientTextCaseInsensitive() {
        web.get().uri("/v1/products?q=AMPHOTERICIN").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data[0].tradeName").isEqualTo("Tericin")
            .jsonPath("$.metadata.requestId").exists();
    }
    @Test void wildcardCharactersAreLiteral() {
        web.get().uri("/v1/products?q={q}", "%%").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(0);
        web.get().uri("/v1/products?q={q}", "100%").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data[0].tradeName").isEqualTo("PCT 100% Max");
    }
    @Test void bengaliQueryReturnsEmptyNotError() {
        web.get().uri("/v1/products?q={q}", "নাপা").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(0);
    }
    @Test void shortQueryIs400WithEnvelope() {
        web.get().uri("/v1/products?q=a").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY");
    }
    @Test void detailIncludesIngredients() {
        web.get().uri("/v1/products/341-0160-020--tericin").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.ingredients[0].xmCode").isEqualTo("XM5TR4");
    }
    @Test void detailWithoutMappingHasEmptyIngredients() {
        web.get().uri("/v1/products/000-0000-002--no-map").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.ingredients.length()").isEqualTo(0);
    }
    @Test void unknownProductIs404() {
        web.get().uri("/v1/products/does-not-exist").exchange().expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
    }
    @Test void batchShowsSourceBesideExtractedData() {
        web.get().uri("/v1/batches/0001-pilot").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.itemCount").isEqualTo(2)
            .jsonPath("$.data.items[0].conceptId").isEqualTo("341-0160-020--tericin")
            .jsonPath("$.data.items[0].extracted.genericContentRaw").isEqualTo("Amphotericin B 50 mg/vial")
            .jsonPath("$.data.items[0].extracted.ingredients[0].xmCode").isEqualTo("XM5TR4")
            .jsonPath("$.data.items[0].sourceJson").value(s -> org.assertj.core.api.Assertions.assertThat((String) s).contains("Amphotericin B  50 mg/vial"))
            .jsonPath("$.data.items[1].conceptId").isEqualTo("typo-id")
            .jsonPath("$.data.items[1].review").isEqualTo("issue")
            .jsonPath("$.data.items[1].extracted").doesNotExist();
    }
    @Test void batchListAndUnknownBatch() {
        web.get().uri("/v1/batches").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data[0].batchId").isEqualTo("0001-pilot");
        web.get().uri("/v1/batches/nope").exchange().expectStatus().isNotFound();
    }

    @Test void detailIncludesParseStatusAndClinicalDrug() {
        web.get().uri("/v1/products/341-0160-020--tericin").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.parseStatus").isEqualTo("parsed")
            .jsonPath("$.data.parseNote").doesNotExist()
            .jsonPath("$.data.clinicalDrug.bdcId").isEqualTo("BDC-000001")
            .jsonPath("$.data.clinicalDrug.displayName").isEqualTo("Amphotericin B 50 mg/vial injection")
            .jsonPath("$.data.clinicalDrug.doseForm").isEqualTo("Injection")
            .jsonPath("$.data.clinicalDrug.route").isEqualTo("systemic")
            .jsonPath("$.data.clinicalDrug.ingredients.length()").isEqualTo(1)
            .jsonPath("$.data.clinicalDrug.ingredients[0].bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.clinicalDrug.ingredients[0].name").isEqualTo("Amphotericin B")
            .jsonPath("$.data.clinicalDrug.ingredients[0].strengthValue").isEqualTo(50)
            .jsonPath("$.data.clinicalDrug.ingredients[0].strengthUnit").isEqualTo("mg")
            .jsonPath("$.data.clinicalDrug.ingredients[0].perValue").isEqualTo(1)
            .jsonPath("$.data.clinicalDrug.ingredients[0].perUnit").isEqualTo("vial")
            .jsonPath("$.data.clinicalDrug.ingredients[0].ddinter[0].ddinterId").isEqualTo("DDInter100")
            .jsonPath("$.data.clinicalDrug.ingredients[0].ddinter[0].routeAssumed").isEqualTo(false);
    }
    @Test void detailWithoutClinicalDrugShowsParseNoteAndNull() {
        web.get().uri("/v1/products/000-0000-002--no-map").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.parseStatus").isEqualTo("failed")
            .jsonPath("$.data.parseNote").isEqualTo("no strength found")
            .jsonPath("$.data.clinicalDrug").value(v -> org.assertj.core.api.Assertions.assertThat(v).isNull());
    }
    @Test void eyeDropsShowTheOphthalmicDdinterEntry() {
        // Review Focus 3: the chloramphenicol eye drop maps to DDInter352, not DDInter351, on the product page.
        web.get().uri("/v1/products/000-0000-003--eye").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.clinicalDrug.route").isEqualTo("ophthalmic")
            .jsonPath("$.data.clinicalDrug.ingredients[0].strengthValue").isEqualTo(0.5)
            .jsonPath("$.data.clinicalDrug.ingredients[0].strengthUnit").isEqualTo("%")
            .jsonPath("$.data.clinicalDrug.ingredients[0].perValue").doesNotExist()
            .jsonPath("$.data.clinicalDrug.ingredients[0].ddinter.length()").isEqualTo(1)
            .jsonPath("$.data.clinicalDrug.ingredients[0].ddinter[0].ddinterId").isEqualTo("DDInter352")
            .jsonPath("$.data.clinicalDrug.ingredients[0].ddinter[0].name").isEqualTo("Chloramphenicol (ophthalmic)")
            .jsonPath("$.data.clinicalDrug.ingredients[0].ddinter[0].routeScope").isEqualTo("ophthalmic")
            .jsonPath("$.data.clinicalDrug.ingredients[0].ddinter[0].routeAssumed").isEqualTo(false);
    }
    @Test void combinationProductHasTwoIngredientsWithTheirOwnStrengths() {
        // Review Focus 2
        web.get().uri("/v1/products/000-0000-004--amc").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.clinicalDrug.bdcId").isEqualTo("BDC-000003")
            .jsonPath("$.data.clinicalDrug.ingredients.length()").isEqualTo(2)
            .jsonPath("$.data.clinicalDrug.ingredients[0].name").isEqualTo("Amoxicillin")
            .jsonPath("$.data.clinicalDrug.ingredients[0].bdsId").isEqualTo("BDS-000004")
            .jsonPath("$.data.clinicalDrug.ingredients[0].strengthValue").isEqualTo(500)
            .jsonPath("$.data.clinicalDrug.ingredients[1].name").isEqualTo("Clavulanic acid")
            .jsonPath("$.data.clinicalDrug.ingredients[1].bdsId").isEqualTo("BDS-000003")
            .jsonPath("$.data.clinicalDrug.ingredients[1].strengthValue").isEqualTo(125)
            .jsonPath("$.data.clinicalDrug.ingredients[1].ddinter.length()").isEqualTo(0);
    }
    @Test void searchResultsCarryTheClinicalDrugToo() {
        web.get().uri("/v1/products?q=tericin").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data[0].parseStatus").isEqualTo("parsed")
            .jsonPath("$.data[0].clinicalDrug.bdcId").isEqualTo("BDC-000001");
    }
    @Test void batchItemsCarryStageResultsInPipelineOrder() {
        web.get().uri("/v1/batches/0001-pilot").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.items[0].stages.length()").isEqualTo(4)
            .jsonPath("$.data.items[0].stages[0].stage").isEqualTo("dgda")
            .jsonPath("$.data.items[0].stages[1].stage").isEqualTo("substances")
            .jsonPath("$.data.items[0].stages[2].stage").isEqualTo("clinical")
            .jsonPath("$.data.items[0].stages[3].stage").isEqualTo("ddinter")
            .jsonPath("$.data.items[0].stages[3].status").isEqualTo("warn")
            .jsonPath("$.data.items[0].stages[3].note").isEqualTo("DDInter DDInter100 matched by name only")
            .jsonPath("$.data.items[0].stages[2].evidence.bdc_id").isEqualTo("BDC-000001")
            .jsonPath("$.data.items[0].stages[2].evidence.aligned[0].method").isEqualTo("single")
            .jsonPath("$.data.items[0].stages[1].evidence.substances[0].bds_id").isEqualTo("BDS-000001")
            .jsonPath("$.data.items[0].extracted.clinicalDrug.bdcId").isEqualTo("BDC-000001")
            .jsonPath("$.data.items[1].stages.length()").isEqualTo(1)
            .jsonPath("$.data.items[1].stages[0].stage").isEqualTo("dgda")
            .jsonPath("$.data.items[1].stages[0].status").isEqualTo("fail")
            .jsonPath("$.data.items[1].stages[0].note").isEqualTo("not found at source")
            .jsonPath("$.data.items[1].stages[0].evidence.status").isEqualTo(404);
    }
}
