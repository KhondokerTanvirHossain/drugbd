package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.3 "Scale test": 40,000 held products across 20 batches; a record open answers within the §10.6 API p95 (300 ms),
 * and the query count is constant (set-based queries, never one query per batch or per partner).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OtherPairsScaleIntegrationTest {
    /** pg_stat_statements counts the statements one record open runs (§7.3 "the query count is constant"). */
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16")
        .withCommand("postgres", "-c", "fsync=off", "-c", "shared_preload_libraries=pg_stat_statements");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    /**
     * 40,000 held products across 20 batches and W-1 alone in S-0, run after the pilot seed; it ends with ANALYZE.
     * SeniorReviewScaleIntegrationTest reuses it.
     */
    static final String SCALE_SEED = """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at)
              SELECT 'S-' || b, 'in_review', 2000, now() - b * interval '1 hour' FROM generate_series(1, 20) b;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              SELECT 'S-' || i, lpad(i::text, 9, '0'), 'Scale ' || i, 'Scale Pharma', 'Tablet', 'Scale 1 mg', 'BDC-000002', 'parsed'
              FROM generate_series(1, 40000) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'S-' || i, CASE i % 4 WHEN 0 THEN 'XM2ZT1' WHEN 1 THEN 'XM6XF8' WHEN 2 THEN 'XM7HA7' ELSE 'XM3R26' END, 'Scale'
              FROM generate_series(1, 40000) i;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'S-' || (1 + i % 20), 'DGDA-Drugs', 'S-' || i, CASE WHEN i % 5 = 0 THEN 'ok' ELSE 'pending' END, NULL,
                     now() - (1 + i % 20) * interval '1 hour'
              FROM generate_series(1, 40000) i;
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES ('S-0', 'in_review', 1, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES ('S-0', 'DGDA-Drugs', 'W-1', 'pending', NULL, now());
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note)
              SELECT 'S-0', 'W-1', s, 'ok', '' FROM unnest(ARRAY['dgda','substances','clinical','ddinter']) s;
            ANALYZE;
            """;

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, SCALE_SEED + "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;");
    }

    @Autowired WebTestClient web;

    @Test @Order(1) void aRecordOpenWithFortyThousandPartnersIsLinearAndFast() {
        internal(web).get().uri("/v1/review/batches/S-0/items/W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.otherPairs.otherBatches").isEqualTo(20)
            .jsonPath("$.data.otherPairs.pairs[?(@.ddinterB == 'DDInter20')].partnerCount").isEqualTo(List.of(2000, 8000))
            .jsonPath("$.data.otherPairs.pairs[0].partners.length()").isEqualTo(5)
            .jsonPath("$.data.otherPairs.notChecked[?(@.partners[0].approved == true)].partnerCount").isEqualTo(List.of(2000))
            .jsonPath("$.data.otherPairs.notChecked[?(@.partners[0].approved == false)].partnerCount").isEqualTo(List.of(8000));
        Latency.P95s p95 = Latency.p95Samples(() ->
            internal(web).get().uri("/v1/review/batches/S-0/items/W-1").exchange().expectStatus().isOk().expectBody().returnResult());
        assertThat(p95.best()).as("best of %d p95 samples of 20 record opens, each after %d untimed warm-ups: %s",
            Latency.SAMPLES, Latency.WARM_UPS, p95).isLessThan(300L);
    }

    /** Runs after the latency test: it adds a 21st batch, so the first test's otherBatches == 20 holds. */
    @Test @Order(2) void aRecordOpenRunsTheSameNumberOfQueriesWhateverTheNumberOfBatches() throws Exception {
        long atTwenty = statementsForOneOpen(20);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES ('S-21', 'in_review', 100, now() - interval '21 hours');
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              SELECT 'S21-' || i, lpad((100000 + i)::text, 9, '0'), 'Scale 21 ' || i, 'Scale Pharma', 'Tablet', 'Scale 1 mg', 'BDC-000002', 'parsed'
              FROM generate_series(1, 100) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'S21-' || i, CASE i % 4 WHEN 0 THEN 'XM2ZT1' WHEN 1 THEN 'XM6XF8' WHEN 2 THEN 'XM7HA7' ELSE 'XM3R26' END, 'Scale'
              FROM generate_series(1, 100) i;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'S-21', 'DGDA-Drugs', 'S21-' || i, 'pending', NULL, now() - interval '21 hours'
              FROM generate_series(1, 100) i;
            ANALYZE;
            """);
        long atTwentyOne = statementsForOneOpen(21);
        assertThat(atTwenty).as("statements for one record open at 20 other batches").isPositive();
        assertThat(atTwentyOne).as("statements for one record open at 21 other batches (20 batches: %d)", atTwenty).isEqualTo(atTwenty);
    }

    /**
     * Resets pg_stat_statements, opens S-0/W-1 once (checking it sees {@code otherBatches} batches) and returns the calls
     * of the statements that read the ops or curated schemas, which leaves out pool validation and this counter's own queries.
     */
    private long statementsForOneOpen(int otherBatches) throws Exception {
        exec(pg, "SELECT pg_stat_statements_reset()");
        internal(web).get().uri("/v1/review/batches/S-0/items/W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.otherPairs.otherBatches").isEqualTo(otherBatches);
        String calls = "SELECT coalesce(sum(calls), 0) FROM pg_stat_statements WHERE query ~ '\\m(ops|curated)\\.'";
        long seen = count(pg, calls);
        for (int i = 0; i < 20; i++) {          // a statement's calls land at executor end, just after its rows reach the client
            Thread.sleep(25);
            long again = count(pg, calls);
            if (again == seen) return seen;
            seen = again;
        }
        return seen;
    }
}
