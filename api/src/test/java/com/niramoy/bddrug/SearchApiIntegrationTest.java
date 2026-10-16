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

/**
 * §7.4 P1–P4 and §11.3 SearchApiIntegrationTest. Approved: N-1 Napa (Acetaminophen, DGDA name Paracetamol), W-1 Warin.
 * Pending: A-1 Ecosprin (Aspirin), W-2 Coumarol. "PCT 100% Max" tests literal wildcards.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SearchApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              VALUES ('PCT-1','186-0099-001','PCT 100% Max','Test Pharma','Tablet','Paracetamol 500 mg','parsed');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('Q-1', 5, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('Q-1','DGDA-Drugs','N-1','ok', now()), ('Q-1','DGDA-Drugs','W-1','ok', now()), ('Q-1','DGDA-Drugs','A-1','pending', now()),
             ('Q-1','DGDA-Drugs','W-2','pending', now()), ('Q-1','DGDA-Drugs','PCT-1','ok', now());
            """);
    }

    @Autowired WebTestClient web;

    private String body(String uri) {
        return new String(web.get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8);
    }

    @Test void paracetamolFindsNapaThroughTheDgdaName() {
        web.get().uri("/v1/search?q=paracetamol").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.query").isEqualTo("paracetamol")
            .jsonPath("$.data.counts.substances").isEqualTo(1)
            .jsonPath("$.data.substances[0].bdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.substances[0].preferredName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.substances[0].matchedName").isEqualTo("Paracetamol")
            .jsonPath("$.data.substances[0].matchedNameType").isEqualTo("dgda_content")
            .jsonPath("$.data.substances[0].otherNameTypes[0]").isEqualTo("rxnorm")
            .jsonPath("$.data.substances[0].otherNameTypes[1]").isEqualTo("icd11")
            .jsonPath("$.data.substances[0].coverage").isEqualTo("full")
            .jsonPath("$.data.substances[0].ddinterIds[0]").isEqualTo("DDInter14")
            .jsonPath("$.data.substances[0].keyCodes.atc[0]").isEqualTo("N02BE01")
            .jsonPath("$.data.substances[0].keyCodes.rxcui[0]").isEqualTo("161")
            .jsonPath("$.data.substances[0].approvedProductCount").isEqualTo(1)
            .jsonPath("$.data.products[?(@.conceptId == 'N-1')].matchedOn").isEqualTo("generic")
            .jsonPath("$.data.products[?(@.conceptId == 'N-1')].status").isEqualTo("approved")
            .jsonPath("$.data.products[?(@.conceptId == 'N-1')].clinicalDrug.bdcId").isEqualTo("BDC-000006");
    }

    @Test void acetaminophenFindsNapaThroughTheSubstance() {
        web.get().uri("/v1/search?q=acetaminophen").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.substances[0].matchedNameType").isEqualTo("preferred")
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.products[0].matchedOn").isEqualTo("substance");
    }

    @Test void darPrefixAndStubsMatchOnTradeNameAndDarOnly() {
        web.get().uri("/v1/search?q=008").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.products[0].matchedOn").isEqualTo("dar");
        String stub = body("/v1/search?q=ecosprin");
        assertThat(stub).contains("\"conceptId\":\"A-1\"", "\"status\":\"not_reviewed\"", "\"hidden\":true");
        assertThat(stub).doesNotContain("Aspirin", "BDC-", "genericContentRaw", "Test Pharma");
        // an unapproved product never matches on its composition or substance (D16)
        String aspirin = body("/v1/search?q=aspirin");
        assertThat(aspirin).doesNotContain("A-1", "Ecosprin", "BDS-000002");
        web.get().uri("/v1/search?q=aspirin").exchange().expectBody().jsonPath("$.data.total").isEqualTo(0);
    }

    @Test void orderIsSubstancesThenApprovedThenStubs() {
        web.get().uri("/v1/search?q=warfarin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(2)
            .jsonPath("$.data.counts.products").isEqualTo(1)
            .jsonPath("$.data.substances[0].preferredName").isEqualTo("Warfarin")
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1");
        web.get().uri("/v1/search?q=o").exchange().expectStatus().isBadRequest();
        web.get().uri("/v1/search?q=coumarol").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].hidden").isEqualTo(true);
    }

    // Review Focus 2
    @Test void wildcardsAreLiteralAndBengaliIsEmpty() {
        // template variables, so WebTestClient encodes each value once (as ProductApiIntegrationTest does)
        web.get().uri("/v1/search?q={q}", "100%").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].tradeName").isEqualTo("PCT 100% Max");
        for (String q : new String[]{"%%", "__", "\\\\", ".*"})
            web.get().uri("/v1/search?q={q}", q).exchange().expectStatus().isOk().expectBody().jsonPath("$.data.total").isEqualTo(0);
        web.get().uri("/v1/search?q={q}", "  NAPA ").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.query").isEqualTo("NAPA")
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1");
        web.get().uri("/v1/search?q={q}", "প্যারাসিটামল").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(0)
            .jsonPath("$.data.suggestion").value(v -> assertThat(v).isNull());
    }

    @Test void publicPagesStopAtIndexNine() {
        web.get().uri("/v1/search?q=napa&page=9").exchange().expectStatus().isOk().expectBody().jsonPath("$.data.hasMore").isEqualTo(false);
        web.get().uri("/v1/search?q=napa&page=10").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("page");
        internal(web).get().uri("/v1/search?q=napa&page=10&scope=all").exchange().expectStatus().isOk();
    }
}
