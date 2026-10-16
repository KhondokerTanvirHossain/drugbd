package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class CheckApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()); var s = c.createStatement()) {
            s.execute(UNLISTED_SQL);
        }
    }

    /**
     * Final review finding 1 (§7.4, §8.1 item 5, D41): an earlier batch mapped Newentol (BDS-000106) with coverage 'none'.
     * A later run gave it a candidate entry whose interact-with read timed out, so the ETL wrote the substance_code row
     * and coverage 'full' but no ddinter_drug row and no pairs. Ofloxacin's ophthalmic entry is in the same state, while
     * its systemic entry has a stored list (with a warfarin pair).
     */
    static final String UNLISTED_SQL = """
        INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000106','Newentol'), ('BDS-000107','Ofloxacin');
        INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
         ('BDS-000106','ICD11_XM','XM9NEW','any','dgda-ocl','xm',1.0),
         ('BDS-000106','DDINTER','DDInter4000','systemic','ddinter2','name',0.7),
         ('BDS-000107','ICD11_XM','XM9OFL','any','dgda-ocl','xm',1.0),
         ('BDS-000107','DDINTER','DDInter4100','systemic','ddinter2','drugbank',1.0),
         ('BDS-000107','DDINTER','DDInter4101','ophthalmic','ddinter2','drugbank',1.0);
        INSERT INTO curated.ddinter_drug (ddinter_id, name, atc_codes, drugbank_id, route_scope) VALUES
         ('DDInter4100','Ofloxacin','{J01MA01}','DB01165','systemic');
        INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) VALUES
         ('DDInter1951','DDInter4100','moderate','{Monitor}','Warfarin','Ofloxacin',NULL);
        INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES
         ('BDS-000106','full','DDInter DDInter4000'), ('BDS-000107','full','DDInter DDInter4100, DDInter4101');
        INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES
         ('BDC-000106','tablet|systemic|BDS-000106:5mg/','Newentol 5 mg tablet','Tablet','systemic'),
         ('BDC-000107','eye drops|ophthalmic|BDS-000107:0.3%/','Ofloxacin 0.3% eye drops','Eye Drops','ophthalmic'),
         ('BDC-000108','tablet|systemic|BDS-000107:200mg/','Ofloxacin 200 mg tablet','Tablet','systemic');
        INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text) VALUES
         ('BDC-000106','BDS-000106',5,'mg',NULL,NULL,'Newentol 5 mg'),
         ('BDC-000107','BDS-000107',0.3,'%',NULL,NULL,'Ofloxacin 0.3%'),
         ('BDC-000108','BDS-000107',200,'mg',NULL,NULL,'Ofloxacin 200 mg');
        INSERT INTO curated.brand_product
          (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status, parse_note) VALUES
         ('Q-1','106','Newentrol','Test Pharma','Tablet','Newentol 5 mg','BDC-000106','parsed',NULL),
         ('O-EYE','107','Oflox Eye','Eye Pharma','Eye Drops','Ofloxacin 0.3%','BDC-000107','parsed',NULL),
         ('O-TAB','108','Oflox','Test Pharma','Tablet','Ofloxacin 200 mg','BDC-000108','parsed',NULL);
        INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES
         ('Q-1','XM9NEW','Newentol'), ('O-EYE','XM9OFL','Ofloxacin'), ('O-TAB','XM9OFL','Ofloxacin');
        """;

    @Autowired WebTestClient web;

    /** These tests check data shape, so they read with scope=all; visibility has its own tests. */
    private WebTestClient all() { return TestSupport.internal(web); }

    private WebTestClient.ResponseSpec check(String... ids) {
        return all().post().uri("/v1/interactions/check?scope=all").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of(ids))).exchange();
    }

    @Test void warfarinPlusAspirinGivesOneMajorAlertWithText() {
        check("W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Warin")
            .jsonPath("$.data.products[0].substances[0].bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.products[0].substances[0].name").isEqualTo("Warfarin")
            .jsonPath("$.data.products[0].substances[0].coverage").isEqualTo("full")
            .jsonPath("$.data.products[1].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[0].a.conceptId").isEqualTo("W-1")
            .jsonPath("$.data.alerts[0].a.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.alerts[0].a.name").isEqualTo("Warfarin")
            .jsonPath("$.data.alerts[0].b.conceptId").isEqualTo("A-1")
            .jsonPath("$.data.alerts[0].b.bdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.alerts[0].b.name").isEqualTo("Aspirin")
            .jsonPath("$.data.alerts[0].actions[0]").isEqualTo("Monitor")
            .jsonPath("$.data.alerts[0].actions[1]").isEqualTo("Avoid")
            .jsonPath("$.data.alerts[0].interaction")
                .isEqualTo("Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.")
            .jsonPath("$.data.alerts[0].management")
                .isEqualTo("Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(false)
            .jsonPath("$.data.alerts[0].source").isEqualTo("DDInter 2.0")
            .jsonPath("$.data.duplicates.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0);
    }

    @Test void productOrderDecidesAlertSides() {
        check("A-1", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].a.conceptId").isEqualTo("A-1")
            .jsonPath("$.data.alerts[0].b.conceptId").isEqualTo("W-1");
    }

    @Test void domperidoneIsListedInNoDataAndNeverOmitted() {
        check("W-1", "D-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.products[1].substances[0].bdsId").isEqualTo("BDS-000004")
            .jsonPath("$.data.products[1].substances[0].coverage").isEqualTo("none")
            .jsonPath("$.data.noData.length()").isEqualTo(1)
            .jsonPath("$.data.noData[0].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.noData[0].bdsId").isEqualTo("BDS-000004")
            .jsonPath("$.data.noData[0].name").isEqualTo("Domperidone");
        // still listed when other products do interact
        check("W-1", "D-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.noData.length()").isEqualTo(1)
            .jsonPath("$.data.noData[0].bdsId").isEqualTo("BDS-000004");
    }

    @Test void twoProductsWithTheSameSubstanceAreDuplicates() {
        check("W-1", "W-2").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.duplicates.length()").isEqualTo(1)
            .jsonPath("$.data.duplicates[0].bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.duplicates[0].name").isEqualTo("Warfarin")
            .jsonPath("$.data.duplicates[0].conceptIds[0]").isEqualTo("W-1")
            .jsonPath("$.data.duplicates[0].conceptIds[1]").isEqualTo("W-2");
    }

    @Test void chloramphenicolEyeDropsUseTheOphthalmicEntry() {
        // §1.5, §8.2: DDInter lists warfarin against DDInter351 (systemic) only. The eye drop uses DDInter352: no alert.
        check("C-EYE", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0);
        // the systemic capsule uses DDInter351 and gets the moderate alert
        check("C-CAP", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].a.conceptId").isEqualTo("C-CAP")
            .jsonPath("$.data.alerts[0].a.bdsId").isEqualTo("BDS-000003")
            .jsonPath("$.data.alerts[0].interaction").isEqualTo("Chloramphenicol may increase the serum concentration of warfarin.")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(false);
    }

    @Test void productWithoutClinicalDrugRouteIsAssumed() {
        check("A-NOBDC", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(true);
    }

    @Test void alertWithoutFetchedTextHasNullText() {
        check("N-1", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].interaction").doesNotExist()
            .jsonPath("$.data.alerts[0].management").doesNotExist()
            .jsonPath("$.data.alerts[0].source").isEqualTo("DDInter 2.0");
    }

    @Test void alertsAreSortedBySeverity() {
        check("N-1", "W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(2)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[1].severity").isEqualTo("moderate");
    }

    @Test void unmappedProductsAreListedInNoData() {
        check("X-NOMAP", "X-NOSUB", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(2)
            .jsonPath("$.data.noData[0].conceptId").isEqualTo("X-NOMAP")
            .jsonPath("$.data.noData[0].bdsId").doesNotExist()
            .jsonPath("$.data.noData[0].name").isEqualTo("Unknown herb")
            .jsonPath("$.data.noData[1].conceptId").isEqualTo("X-NOSUB")
            .jsonPath("$.data.noData[1].bdsId").doesNotExist()
            .jsonPath("$.data.noData[1].name").isEqualTo("Newmol")
            .jsonPath("$.data.products[1].substances[0].name").isEqualTo("Newmol")
            .jsonPath("$.data.products[1].substances[0].coverage").isEqualTo("not_run");
    }

    private void expectInvalid(WebTestClient.ResponseSpec spec) {
        spec.expectStatus().isBadRequest()
            .expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.data").doesNotExist()
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
            .jsonPath("$.metadata.requestId").exists();
    }

    @Test void validationErrorsUseTheEnvelope() {
        expectInvalid(check("W-1"));
        expectInvalid(check());
        expectInvalid(check("W-1", "W-1"));
        expectInvalid(check(IntStream.rangeClosed(1, 21).mapToObj(i -> "P-" + i).toArray(String[]::new)));
        expectInvalid(check("W-1", " "));
        expectInvalid(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{}").exchange());
        expectInvalid(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{not json").exchange());
        expectInvalid(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON).exchange());
        check("W-1").expectBody().jsonPath("$.errors[0].field").isEqualTo("conceptIds");
    }

    @Test void twentyProductsIsTheUpperBound() {
        String[] ids = IntStream.rangeClosed(1, 20).mapToObj(i -> "P-" + i).toArray(String[]::new);
        // 20 is valid input, so the request gets past validation and fails on the unknown IDs instead.
        check(ids).expectStatus().isNotFound()
            .expectBody().jsonPath("$.message").isEqualTo("Product not found: P-1");
    }

    @Test void unknownConceptIdIs404() {
        check("W-1", "does-not-exist").expectStatus().isNotFound()
            .expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND")
            .jsonPath("$.errors[0].field").isEqualTo("conceptIds")
            .jsonPath("$.message").isEqualTo("Product not found: does-not-exist");
    }

    @Test void anEarlierProductWhoseSubstanceGainedANeverCompleteEntryIsNoDataNotNoInteractions() {
        // The entry has no ddinter_drug row, so its pair list was never stored in full: the product is noData, and the
        // page can never print "DDInter 2.0 lists no interactions between the selected products." for it.
        check("Q-1", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.products[0].substances[0].coverage").isEqualTo("full")
            .jsonPath("$.data.noData.length()").isEqualTo(1)
            .jsonPath("$.data.noData[0].conceptId").isEqualTo("Q-1")
            .jsonPath("$.data.noData[0].bdsId").isEqualTo("BDS-000106")
            .jsonPath("$.data.noData[0].name").isEqualTo("Newentol");
    }

    @Test void anUnlistedExactEntryIsNoDataAndNeverFallsBackToSystemic() {
        // §8.2: the ophthalmic entry exists, so the eye drop does not borrow the systemic entry's warfarin pair
        check("O-EYE", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(1)
            .jsonPath("$.data.noData[0].conceptId").isEqualTo("O-EYE")
            .jsonPath("$.data.noData[0].bdsId").isEqualTo("BDS-000107");
        // the tablet chose the listed systemic entry
        check("O-TAB", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(false)
            .jsonPath("$.data.noData.length()").isEqualTo(0);
    }
}
