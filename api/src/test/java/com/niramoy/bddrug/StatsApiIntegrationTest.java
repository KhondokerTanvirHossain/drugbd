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
 * GET /v1/stats against Postgres. Batch S-1 (in review): W-1 ok, A-1 pending, C-EYE issue reported by a pharmacist,
 * D-1 issue set by the pipeline (no decision), N-1 ok but removed from the batch file. Batch S-old (approved): W-2 ok.
 * Public products: W-1 and W-2 (N-1's latest item is removed, so it is not public).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class StatsApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('S-old','approved',1, now() - interval '3 hour'), ('S-1','in_review',5, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('S-old','DGDA-Drugs','W-2','ok',NULL, now() - interval '3 hour'),
             ('S-1','DGDA-Drugs','W-1','ok',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','A-1','pending',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','C-EYE','issue',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','D-1','issue',NULL, now() - interval '1 hour'),
             ('S-1','DGDA-Drugs','N-1','ok','removed from batch file', now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('S-1','W-1','ok','','pharm.stats@example.org','pharmacist', now() - interval '30 minute'),
             ('S-1','C-EYE','issue','Strength differs on the pack','pharm.stats@example.org','pharmacist', now() - interval '30 minute'),
             ('S-1','N-1','ok','','pharm.stats@example.org','pharmacist', now() - interval '30 minute');
            """);
    }

    @Autowired WebTestClient web;

    @Test void countsPublicProductsOnlyAndListsEachBatch() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.registerProducts").isEqualTo(39196)
            .jsonPath("$.data.productsLoaded").isEqualTo(10)
            .jsonPath("$.data.substances").isEqualTo(5)
            .jsonPath("$.data.approvedProducts").isEqualTo(2)
            .jsonPath("$.data.inReviewProducts").isEqualTo(3)
            .jsonPath("$.data.batches.length()").isEqualTo(2)
            .jsonPath("$.data.batches[0].batchId").isEqualTo("S-1")
            .jsonPath("$.data.batches[0].status").isEqualTo("in_review")
            .jsonPath("$.data.batches[0].itemCount").isEqualTo(4)
            .jsonPath("$.data.batches[0].approved").isEqualTo(1)
            .jsonPath("$.data.batches[0].items.length()").isEqualTo(5)
            .jsonPath("$.data.batches[1].batchId").isEqualTo("S-old")
            .jsonPath("$.data.batches[1].status").isEqualTo("approved")
            .jsonPath("$.data.batches[1].itemCount").isEqualTo(1)
            .jsonPath("$.data.batches[1].items[0].conceptId").isEqualTo("W-2")
            .jsonPath("$.data.batches[1].items[0].tradeName").isEqualTo("Coumarol")
            .jsonPath("$.data.batches[1].items[0].status").isEqualTo("approved");
    }

    @Test void exampleUsableIsFalseOnlyForAReportedIssueOrARemovedRecord() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.batches[0].items[0].length()").isEqualTo(4)
            .jsonPath("$.data.batches[0].items[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.batches[0].items[0].tradeName").isEqualTo("Ecosprin")
            .jsonPath("$.data.batches[0].items[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[0].exampleUsable").isEqualTo(true)
            .jsonPath("$.data.batches[0].items[1].conceptId").isEqualTo("C-EYE")
            .jsonPath("$.data.batches[0].items[1].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[1].exampleUsable").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[2].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.batches[0].items[2].exampleUsable").isEqualTo(true)
            .jsonPath("$.data.batches[0].items[3].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.batches[0].items[3].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[3].exampleUsable").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[4].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.batches[0].items[4].status").isEqualTo("approved")
            .jsonPath("$.data.batches[0].items[4].exampleUsable").isEqualTo(true);
    }

    @Test void carriesNoReviewDetailNoEmailAndNoClinicalValue() {
        byte[] raw = web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
        String body = new String(raw, StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("pharm.stats@example.org", "Strength differs", "pharmacist", "\"issue\"", "reviewStatus",
            "genericContentRaw", "Test Pharma", "Warfarin", "BDS-", "BDC-", "XM", "DDInter", "removed from batch file", "decidedAt");
    }

    @Test void needsNoTokenButRefusesAWrongOne() {
        internal(web).get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.approvedProducts").isEqualTo(2);
        web.get().uri("/v1/stats").header(HEADER, "not-the-token").exchange().expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED").jsonPath("$.data").doesNotExist();
    }

    /** §6.4: a removed product is never approved anywhere. N-1 is ok but its latest item is removed from the batch file. */
    @Test void aRemovedRecordIsNotPublicOnTheProductEndpointEither() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true).jsonPath("$.data.clinicalDrug").doesNotExist();
        web.get().uri("/v1/products/W-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").doesNotExist();
    }
}
