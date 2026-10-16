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
import java.nio.charset.StandardCharsets;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.4 P8 ("Other brands of …"). W-1 is approved, W-2 pending (both BDC-000001); A-1 pending (BDC-000002). */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ClinicalDrugApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('C-1', 3, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('C-1','DGDA-Drugs','W-1','ok', now()), ('C-1','DGDA-Drugs','W-2','pending', now()), ('C-1','DGDA-Drugs','A-1','pending', now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void publicListsPublicBrandsOnly() {
        String body = new String(web.get().uri("/v1/clinical-drugs/BDC-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.bdcId").isEqualTo("BDC-000001")
            .jsonPath("$.data.displayName").isEqualTo("Warfarin 5 mg tablet")
            .jsonPath("$.data.doseForm").isEqualTo("Tablet")
            .jsonPath("$.data.route").isEqualTo("systemic")
            .jsonPath("$.data.ingredients.length()").isEqualTo(1)
            .jsonPath("$.data.ingredients[0].bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.ingredients[0].name").isEqualTo("Warfarin")
            .jsonPath("$.data.ingredients[0].strengthValue").isEqualTo(5)
            .jsonPath("$.data.ingredients[0].strengthUnit").isEqualTo("mg")
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Warin")
            .jsonPath("$.data.products[0].company").isEqualTo("Test Pharma")
            .jsonPath("$.data.products[0].darNumber").isEqualTo("001")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("Coumarol", "W-2");
    }

    @Test void noPublicProductMeansNotFound() {
        web.get().uri("/v1/clinical-drugs/BDC-000002").exchange().expectStatus().isNotFound().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND")
            .jsonPath("$.errors[0].field").isEqualTo("bdcId")
            .jsonPath("$.data").doesNotExist();
        web.get().uri("/v1/clinical-drugs/BDC-999999").exchange().expectStatus().isNotFound();
    }

    @Test void scopeAllNeedsTheTokenAndListsEveryBrand() {
        web.get().uri("/v1/clinical-drugs/BDC-000002?scope=all").exchange().expectStatus().isUnauthorized();
        internal(web).get().uri("/v1/clinical-drugs/BDC-000001?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Coumarol")
            .jsonPath("$.data.products[1].tradeName").isEqualTo("Warin");
    }
}
