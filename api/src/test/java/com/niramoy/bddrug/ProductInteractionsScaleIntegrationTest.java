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
import static org.assertj.core.api.Assertions.assertThat;

/**
 * P10 at scale (§10.6 API p95 ≤ 300 ms), at the size of §7.3's OtherPairsScaleIntegrationTest: 40,000 public products in
 * 20 batches, carrying 200 substances (200 brands each) that each pair with Acetaminophen. Coarse bounds: p95 over 20 calls,
 * and a page under 200 KB. The p95 is Latency's (20 timed calls after untimed warm-ups, held to the §10.6 300 ms off CI).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductInteractionsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16").withCommand("postgres", "-c", "fsync=off");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name) SELECT 'BDS-L' || i, 'Scalol ' || i FROM generate_series(1, 200) i;
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
              SELECT 'BDS-L' || i, 'ICD11_XM', 'XML' || i, 'any', 'dgda-ocl', 'xm', 1.0 FROM generate_series(1, 200) i;
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
              SELECT 'BDS-L' || i, 'DDINTER', 'DDInter9' || lpad(i::text, 4, '0'), 'systemic', 'ddinter2', 'drugbank', 1.0 FROM generate_series(1, 200) i;
            INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope)
              SELECT 'DDInter9' || lpad(i::text, 4, '0'), 'Scalol ' || i, 'systemic' FROM generate_series(1, 200) i;
            INSERT INTO curated.interaction_coverage (bds_id, coverage, note) SELECT 'BDS-L' || i, 'full', 'x' FROM generate_series(1, 200) i;
            INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b)
              SELECT 'DDInter14', 'DDInter9' || lpad(i::text, 4, '0'), 'unknown', '{}', 'Acetaminophen', 'Scalol ' || i FROM generate_series(1, 200) i;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              SELECT 'L-' || i, 'L' || i, 'Scale brand ' || i, 'Co', 'Tablet', 'Scalol', 'parsed' FROM generate_series(1, 40000) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'L-' || i, 'XML' || (1 + i % 200), 'Scalol' FROM generate_series(1, 40000) i;
            INSERT INTO ops.batch (batch_id, item_count, run_at) SELECT 'LB-' || b, 2000, now() FROM generate_series(1, 20) b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at)
              SELECT 'LB-' || (1 + (i - 1) / 2000), 'DGDA-Drugs', 'L-' || i, 'ok', now() FROM generate_series(1, 40000) i;
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('LN', 1, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES ('LN','DGDA-Drugs','N-1','ok', now());
            ANALYZE;
            """);
    }

    @Autowired WebTestClient web;

    @Test void p95Under300msAndAPageUnder200KB() {
        byte[] page = web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk().expectBody().returnResult()
            .getResponseBody();
        assertThat(page.length).as("bytes").isLessThan(200_000);
        Latency.P95s p95 = Latency.p95Samples(() ->
            web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk().expectBody().returnResult());
        assertThat(p95.best()).as("best of %d p95 samples of 20 calls, each after %d untimed warm-ups: %s",
            Latency.SAMPLES, Latency.WARM_UPS, p95).isLessThanOrEqualTo(Latency.boundMs());
        web.get().uri("/v1/products/N-1/interactions").exchange().expectBody()
            .jsonPath("$.data.totalPartners").isEqualTo(200)
            .jsonPath("$.data.partners.length()").isEqualTo(20)
            .jsonPath("$.data.partners[0].brandCount").isEqualTo(200)
            .jsonPath("$.data.partners[0].brands.length()").isEqualTo(50)
            .jsonPath("$.data.partners[0].brands[0].tradeName").isEqualTo("Scale brand 1000")
            .jsonPath("$.data.partners[0].brands[1].tradeName").isEqualTo("Scale brand 10000");
    }
}
