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
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.3 "Scale test": 40,000 held products across 20 batches; a record open answers within the §10.6 API p95 (300 ms). */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class OtherPairsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
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
            """);
    }

    @Autowired WebTestClient web;

    @Test void aRecordOpenWithFortyThousandPartnersIsLinearAndFast() {
        internal(web).get().uri("/v1/review/batches/S-0/items/W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.otherPairs.otherBatches").isEqualTo(20)
            .jsonPath("$.data.otherPairs.pairs[?(@.ddinterB == 'DDInter20')].partnerCount").isEqualTo(List.of(2000, 8000))
            .jsonPath("$.data.otherPairs.pairs[0].partners.length()").isEqualTo(5)
            .jsonPath("$.data.otherPairs.notChecked[?(@.partners[0].approved == true)].partnerCount").isEqualTo(List.of(2000))
            .jsonPath("$.data.otherPairs.notChecked[?(@.partners[0].approved == false)].partnerCount").isEqualTo(List.of(8000));
        List<Long> ms = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            long t = System.nanoTime();
            internal(web).get().uri("/v1/review/batches/S-0/items/W-1").exchange().expectStatus().isOk().expectBody().returnResult();
            ms.add((System.nanoTime() - t) / 1_000_000);
        }
        Collections.sort(ms);
        assertThat(ms.get(18)).as("p95 of 20 record opens, ms").isLessThan(300L);
    }
}
