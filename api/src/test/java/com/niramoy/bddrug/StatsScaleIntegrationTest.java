package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
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
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * GET /v1/stats at scale: five batches of 1,000 items plus a one-item batch whose product has a blank trade name.
 * Coarse bounds only: p95 under 300 ms over 20 calls (§10.6) and a body under 1 MB (the web container has 256 MB).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class StatsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at)
              SELECT 'L-' || b, 'in_review', 1000, now() - b * interval '1 hour' FROM generate_series(1, 5) b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'L-' || b, 'DGDA-Drugs', 'L-' || b || '-' || i, CASE WHEN i % 3 = 0 THEN 'ok' ELSE 'pending' END, NULL,
                     now() - b * interval '1 hour'
              FROM generate_series(1, 5) b, generate_series(1, 1000) i;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw)
              VALUES ('BLANK-1', '000-0000-000', '  ', 'Test Pharma', 'Tablet', 'Nothing 1 mg');
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES ('L-0', 'in_review', 1, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              VALUES ('L-0', 'DGDA-Drugs', 'BLANK-1', 'pending', NULL, now());
            """);
    }

    @Autowired WebTestClient client;
    WebTestClient web;

    /** The 448 KB body exceeds the test client's default 256 KiB buffer; the bounds below are the API's, not the client's. */
    @BeforeEach void big() { web = client.mutate().codecs(c -> c.defaultCodecs().maxInMemorySize(2 * 1024 * 1024)).build(); }

    @Test void aBlankTradeNameIsReportedAsTheConceptId() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.batches[0].batchId").isEqualTo("L-0")
            .jsonPath("$.data.batches[0].items[0].tradeName").isEqualTo("BLANK-1")
            .jsonPath("$.data.batches.length()").isEqualTo(6);
    }

    @Test void answersFiveThousandItemsQuicklyAndCompactly() {
        byte[] first = web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
        assertThat(first.length).isLessThan(1_000_000);
        long p95 = Latency.p95Millis(() -> web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody().returnResult());
        assertThat(p95).as("p95 of 20 calls after %d untimed warm-ups, ms", Latency.WARM_UPS).isLessThan(300L);
    }
}
