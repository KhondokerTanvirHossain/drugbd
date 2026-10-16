package com.niramoy.bddrug;

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
import static com.niramoy.bddrug.TestSupport.exec;

/**
 * §7.4 P10's partners are grouped in SQL by partner substance and route (R2dbcProductInteractionsAdapter); the result is
 * the one PublicPairs.compute gives over the partner products. Warfarin Duo carries Warfarin under two XM codes and is
 * one brand; warfarin Plain has no clinical drug (no route), so the Warfarin pair merges a systemic group and a no-route
 * group and is route-assumed; "Herbal X" is unmapped under four XM codes in three products and is one line of three
 * brands, in case-insensitive brand order.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductInteractionsGroupingIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
              VALUES ('BDS-000001', 'ICD11_XM', 'XMWARF2', 'any', 'dgda-ocl', 'xm', 1.0);
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('G-1','101','Warfarin Duo','Co','Tablet','Warfarin 5 mg + Herbal X','BDC-000001','parsed'),
                     ('G-2','102','herbal two','Co','Tablet','Herbal X','BDC-000001','parsed'),
                     ('G-3','103','Herbal Triple','Co','Tablet','Herbal X','BDC-000001','parsed'),
                     ('G-4','104','warfarin Plain','Co','Tablet','Warfarin 5 mg',NULL,'parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES
              ('G-1','XM5S93','Warfarin'), ('G-1','XMWARF2','Warfarin sodium'), ('G-1','XMHERB1','Herbal X'),
              ('G-2','XMHERB2','Herbal X'),
              ('G-3','XMHERB3','Herbal X'), ('G-3','XMHERB4','Herbal X'),
              ('G-4','XM5S93','Warfarin');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('G', 5, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
              ('G','DGDA-Drugs','N-1','ok',NULL, now()), ('G','DGDA-Drugs','G-1','ok',NULL, now()),
              ('G','DGDA-Drugs','G-2','ok',NULL, now()), ('G','DGDA-Drugs','G-3','ok',NULL, now()),
              ('G','DGDA-Drugs','G-4','ok',NULL, now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void aProductIsOneBrandPerPartnerSubstanceAndRouteGroupsMerge() {
        web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.totalPartners").isEqualTo(2)
            .jsonPath("$.data.partners.length()").isEqualTo(1)
            .jsonPath("$.data.partners[0].partnerSubstance.name").isEqualTo("Warfarin")
            .jsonPath("$.data.partners[0].routeAssumed").isEqualTo(true)
            .jsonPath("$.data.partners[0].brandCount").isEqualTo(2)
            .jsonPath("$.data.partners[0].brands.length()").isEqualTo(2)
            .jsonPath("$.data.partners[0].brands[0].conceptId").isEqualTo("G-1")
            .jsonPath("$.data.partners[0].brands[1].conceptId").isEqualTo("G-4")
            .jsonPath("$.data.notChecked.length()").isEqualTo(1)
            .jsonPath("$.data.notChecked[0].partnerSubstance.name").isEqualTo("Herbal X")
            .jsonPath("$.data.notChecked[0].reason").isEqualTo("unmapped")
            .jsonPath("$.data.notChecked[0].brandCount").isEqualTo(3)
            .jsonPath("$.data.notChecked[0].brands.length()").isEqualTo(3)
            .jsonPath("$.data.notChecked[0].brands[0].tradeName").isEqualTo("Herbal Triple")
            .jsonPath("$.data.notChecked[0].brands[1].tradeName").isEqualTo("herbal two")
            .jsonPath("$.data.notChecked[0].brands[2].tradeName").isEqualTo("Warfarin Duo");
    }
}
