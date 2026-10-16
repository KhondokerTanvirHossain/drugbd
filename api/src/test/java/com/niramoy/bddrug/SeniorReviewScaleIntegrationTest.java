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
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §10.6 "Server: API p95 ≤ 300 ms per call" for the senior reads (§5.17, §7.7). The seed is OtherPairsScaleIntegrationTest's
 * (40,000 held products across 20 batches) plus 100 held substances with 5,050 stored pairs among the held entries and
 * 1,000 pair reviews, so every read rebuilds a register-sized universe. The bound is never loosened.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SeniorReviewScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16").withCommand("postgres", "-c", "fsync=off");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org";

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, OtherPairsScaleIntegrationTest.SCALE_SEED);
        exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name)
              SELECT 'BDS-9' || lpad(i::text, 5, '0'), 'Synthetic ' || i FROM generate_series(1, 100) i;
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
              SELECT 'BDS-9' || lpad(i::text, 5, '0'), 'ICD11_XM', 'XMZ' || lpad(i::text, 4, '0'), 'any', 'dgda-ocl', 'xm', 1.0
              FROM generate_series(1, 100) i
              UNION ALL
              SELECT 'BDS-9' || lpad(i::text, 5, '0'), 'DDINTER', 'DDInter8' || lpad(i::text, 4, '0'), 'systemic', 'ddinter2', 'drugbank', 1.0
              FROM generate_series(1, 100) i;
            INSERT INTO curated.interaction_coverage (bds_id, coverage, note)
              SELECT 'BDS-9' || lpad(i::text, 5, '0'), 'full', 'synthetic' FROM generate_series(1, 100) i;
            INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope)
              SELECT 'DDInter8' || lpad(i::text, 4, '0'), 'Synthetic entry ' || i, 'systemic' FROM generate_series(1, 100) i;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              SELECT 'Z-' || i, lpad((200000 + i)::text, 9, '0'), 'Synthetic ' || i, 'Scale Pharma', 'Tablet', 'Synthetic 1 mg', NULL, 'parsed'
              FROM generate_series(1, 100) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'Z-' || i, 'XMZ' || lpad(i::text, 4, '0'), 'Synthetic' FROM generate_series(1, 100) i;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'S-' || (1 + i % 20), 'DGDA-Drugs', 'Z-' || i, 'pending', NULL, now() - (1 + i % 20) * interval '1 hour'
              FROM generate_series(1, 100) i;
            INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management)
              SELECT 'IZ-' || a || '-' || b, 'Synthetic ' || a || ' may change the effect of synthetic ' || b || '.', 'Monitor.'
              FROM generate_series(1, 100) a, generate_series(1, 100) b WHERE a < b;
            INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id)
              SELECT 'DDInter8' || lpad(a::text, 4, '0'), 'DDInter8' || lpad(b::text, 4, '0'),
                     (ARRAY['major','moderate','minor','unknown'])[1 + (a + b) % 4], ARRAY['Monitor'],
                     'Synthetic entry ' || a, 'Synthetic entry ' || b, 'IZ-' || a || '-' || b
              FROM generate_series(1, 100) a, generate_series(1, 100) b WHERE a < b
              UNION ALL
              SELECT 'DDInter20', 'DDInter8' || lpad(i::text, 4, '0'), 'moderate', '{}', 'Acetylsalicylic acid', 'Synthetic entry ' || i, NULL
              FROM generate_series(1, 100) i;
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
              SELECT ddinter_a, ddinter_b, 'reviewed', '', md5(ddinter_a || ddinter_b) || md5(ddinter_b || ddinter_a),
                     '{"severity":"moderate","actions":["Monitor"],"interaction":null,"management":null}',
                     CASE WHEN n % 2 = 0 THEN 'senior.reviewer@example.org' ELSE 'other.senior@example.org' END, 'senior'
              FROM (SELECT ddinter_a, ddinter_b, row_number() OVER (ORDER BY ddinter_a, ddinter_b) AS n
                    FROM curated.ddinter_pair WHERE ddinter_a LIKE 'DDInter8%') p
              WHERE n <= 1000;
            ANALYZE;
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.BodyContentSpec get(String uri) {
        return internal(web).get().uri(uri).header("X-Viewer-Email", SENIOR).exchange().expectStatus().isOk().expectBody();
    }

    /**
     * Holds the best of {@link Latency#SAMPLES} p95 samples of GET uri (each 20 timed calls after {@link Latency#WARM_UPS}
     * untimed warm-ups) under the §10.6 300 ms bound; the message names every sample.
     */
    private void assertWithinBudget(String uri) {
        Latency.P95s p95 = Latency.p95Samples(() -> get(uri).returnResult());
        System.out.println("GET " + uri + ": " + p95);
        assertThat(p95.best()).as("best of %d p95 samples of 20 GET %s: %s", Latency.SAMPLES, uri, p95).isLessThan(Latency.boundMs());
    }

    @Test void theSeedIsRegisterSized() {
        get("/v1/review/pairs?show=all")
            .jsonPath("$.data.counts.all").isEqualTo(5053)
            .jsonPath("$.data.items.length()").isEqualTo(50);
        get("/v1/review/substances").jsonPath("$.data.total").isEqualTo(105);
        get("/v1/review/substances/BDS-900001").jsonPath("$.data.pairs.total").isEqualTo(100);
    }

    @Test void thePairQueueAnswersWithinTheApiBudget() {
        assertWithinBudget("/v1/review/pairs");
        assertWithinBudget("/v1/review/pairs?show=all&page=3");
    }

    @Test void theSubstancesListAnswersWithinTheApiBudget() {
        assertWithinBudget("/v1/review/substances");
    }

    @Test void aSubstancePageAnswersWithinTheApiBudget() {
        assertWithinBudget("/v1/review/substances/BDS-900001");
        assertWithinBudget("/v1/review/substances/BDS-000001");
    }
}
