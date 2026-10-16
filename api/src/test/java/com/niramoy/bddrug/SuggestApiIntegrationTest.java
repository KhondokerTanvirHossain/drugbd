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
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.4 P16. Approved: N-1 Napa, W-1 Warin. Pending: A-1 Ecosprin (Aspirin), W-2 Coumarol. */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SuggestApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('G-1', 4, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('G-1','DGDA-Drugs','N-1','ok', now()), ('G-1','DGDA-Drugs','W-1','ok', now()),
             ('G-1','DGDA-Drugs','A-1','pending', now()), ('G-1','DGDA-Drugs','W-2','pending', now());
            INSERT INTO curated.brand_product
              (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status, parse_note) VALUES
             ('Q-1','Q01','Zequa','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL),
             ('Q-2','Q02','Quora','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL),
             ('Q-3','Q03','Quill','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL),
             ('Q-4','Q04','Aqua','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL);
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status, parse_note)
             SELECT 'K-' || i, 'K' || lpad(i::text, 2, '0'), 'Capro' || lpad(i::text, 2, '0'), 'Test Pharma', 'Tablet', 'Herb 1 mg', NULL, 'parsed', NULL
             FROM generate_series(1, 12) i;
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('G-2', 4, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('G-2','DGDA-Drugs','Q-1','ok', now()), ('G-2','DGDA-Drugs','Q-2','pending', now()),
             ('G-2','DGDA-Drugs','Q-3','ok', now()), ('G-2','DGDA-Drugs','Q-4','pending', now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void anApprovedProductMatchedBySynonymSaysWhichName() {
        web.get().uri("/v1/products/suggest?q=paracetamol").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(1)
            .jsonPath("$.data[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data[0].status").isEqualTo("approved")
            .jsonPath("$.data[0].clinicalDisplayName").isEqualTo("Acetaminophen 500 mg tablet")
            .jsonPath("$.data[0].matched.name").isEqualTo("Paracetamol")
            .jsonPath("$.data[0].matched.substance").isEqualTo("Acetaminophen");
        web.get().uri("/v1/products/suggest?q=napa").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[0].matched").value(v -> assertThat(v).isNull());
    }

    @Test void unapprovedRowsMatchOnTradeNameAndDarOnlyAndCarryNoData() {
        String byName = new String(web.get().uri("/v1/products/suggest?q=ecos").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data[0].clinicalDisplayName").value(v -> assertThat(v).isNull())
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(byName).doesNotContain("Aspirin", "BDC-");
        web.get().uri("/v1/products/suggest?q=aspirin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(0);
    }

    @Test void excludedIdsAreLeftOutAndTheListIsCapped() {
        web.get().uri("/v1/products/suggest?q=wa&exclude=W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[?(@.conceptId == 'W-1')]").isEmpty();
        web.get().uri("/v1/products/suggest?q=a").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("q");
        StringBuilder many = new StringBuilder();
        for (int i = 0; i < 21; i++) many.append("&exclude=X").append(i);
        web.get().uri("/v1/products/suggest?q=napa" + many).exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("exclude");
    }

    /** Trade-name prefix first, then approved before not reviewed, then trade name; at most 10 rows (§7.4 P16). */
    @Test void prefixMatchesComeFirstThenApprovedThenNameAndTenAtMost() {
        web.get().uri("/v1/products/suggest?q=qu").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[*].conceptId").isEqualTo(java.util.List.of("Q-3", "Q-2", "Q-1", "Q-4"))
            .jsonPath("$.data[*].status").isEqualTo(java.util.List.of("approved", "not_reviewed", "approved", "not_reviewed"));
        web.get().uri("/v1/products/suggest?q=capro").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(10)
            .jsonPath("$.data[0].tradeName").isEqualTo("Capro01")
            .jsonPath("$.data[9].tradeName").isEqualTo("Capro10");
    }
}
