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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * P10 at scale (§10.6 API p95 ≤ 300 ms): 5,000 approved products in five batches, carrying 200 substances that each
 * pair with Acetaminophen. Coarse bounds: p95 over 20 calls, and a page under 200 KB.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductInteractionsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
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
              SELECT 'L-' || i, 'L' || i, 'Scale brand ' || i, 'Co', 'Tablet', 'Scalol', 'parsed' FROM generate_series(1, 5000) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'L-' || i, 'XML' || (1 + i % 200), 'Scalol' FROM generate_series(1, 5000) i;
            INSERT INTO ops.batch (batch_id, item_count, run_at) SELECT 'LB-' || b, 1000, now() FROM generate_series(1, 5) b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at)
              SELECT 'LB-' || (1 + (i - 1) / 1000), 'DGDA-Drugs', 'L-' || i, 'ok', now() FROM generate_series(1, 5000) i;
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('LN', 1, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES ('LN','DGDA-Drugs','N-1','ok', now());
            """);
    }

    @Autowired WebTestClient web;

    @Test void p95Under300msAndAPageUnder200KB() {
        for (int i = 0; i < 3; i++) web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk();
        List<Long> ms = new ArrayList<>();
        int size = 0;
        for (int i = 0; i < 20; i++) {
            long t = System.nanoTime();
            byte[] body = web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            ms.add((System.nanoTime() - t) / 1_000_000);
            size = body.length;
        }
        Collections.sort(ms);
        assertThat(ms.get(18)).as("p95 ms").isLessThanOrEqualTo(300L);
        assertThat(size).as("bytes").isLessThan(200_000);
        web.get().uri("/v1/products/N-1/interactions").exchange().expectBody()
            .jsonPath("$.data.totalPartners").isEqualTo(200)
            .jsonPath("$.data.partners.length()").isEqualTo(20)
            .jsonPath("$.data.partners[0].brandCount").isEqualTo(25)
            .jsonPath("$.data.partners[0].brands.length()").isEqualTo(25);
    }
}
