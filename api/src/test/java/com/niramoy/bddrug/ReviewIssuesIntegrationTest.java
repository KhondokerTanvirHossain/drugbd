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
 * §7.3 (D76) GET /v1/review/issues: every current record, across batches, whose display status is issue. Read-only seed:
 * I-A holds two open records (I-TWO with two counted issues, I-ENG with one) and five that must not appear (a dismissed
 * issue, an issue from before the re-run, the pipeline's own "not found at source", a removed item, an approved one);
 * I-B holds I-NEW; I-P holds 50 more, so the list spans two pages of 50.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ReviewIssuesIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              VALUES ('I-TWO','901','Twomol','Test Pharma','Tablet','Twomol 500 mg','parsed');
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('I-A','in_review',7,'2026-10-01T00:00:00Z'), ('I-B','in_review',1,'2026-10-06T00:00:00Z'),
             ('I-P','in_review',50,'2026-10-07T00:00:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('I-A','DGDA-Drugs','I-DISM','pending',NULL,'2026-10-01T01:00:00Z'),
             ('I-A','DGDA-Drugs','I-ENG','issue',NULL,'2026-10-01T01:00:00Z'),
             ('I-A','DGDA-Drugs','I-GONE','issue','removed from batch file','2026-10-01T01:00:00Z'),
             ('I-A','DGDA-Drugs','I-OK','ok',NULL,'2026-10-01T01:00:00Z'),
             ('I-A','DGDA-Drugs','I-RERUN','pending',NULL,'2026-10-05T00:00:00Z'),
             ('I-A','DGDA-Drugs','I-SRC','issue','not found at source','2026-10-01T01:00:00Z'),
             ('I-A','DGDA-Drugs','I-TWO','issue',NULL,'2026-10-01T01:00:00Z'),
             ('I-B','DGDA-Drugs','I-NEW','issue',NULL,'2026-10-06T01:00:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'I-P', 'DGDA-Drugs', 'P-' || lpad(n::text, 2, '0'), 'issue', NULL, '2026-10-07T01:00:00Z' FROM generate_series(0, 49) n;
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('I-A','I-DISM','issue','looked wrong','pharm@example.org','pharmacist','2026-10-02T00:00:00Z'),
             ('I-A','I-DISM','dismiss','checked: the record is right','senior@example.org','senior','2026-10-03T00:00:00Z'),
             ('I-A','I-ENG','issue','route should be otic','Eng@example.org','engineer','2026-10-03T00:00:00Z'),
             ('I-A','I-GONE','issue','wrong product','pharm@example.org','pharmacist','2026-10-01T02:00:00Z'),
             ('I-A','I-OK','ok','','pharm@example.org','pharmacist','2026-10-02T00:00:00Z'),
             ('I-A','I-RERUN','issue','fixed by the re-run','pharm@example.org','pharmacist','2026-10-02T00:00:00Z'),
             ('I-A','I-TWO','issue','strength reads 50 mg','pharm@example.org','pharmacist','2026-10-02T00:00:00Z'),
             ('I-A','I-TWO','issue','agree: 500 mg in DGDA','senior@example.org','senior','2026-10-04T00:00:00Z'),
             ('I-B','I-NEW','issue','company name differs','pharm@example.org','pharmacist','2026-10-07T00:00:00Z');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at)
              SELECT 'I-P', 'P-' || lpad(n::text, 2, '0'), 'issue', 'note ' || n, 'eng@example.org', 'engineer',
                     timestamptz '2026-10-08T00:00:00Z' + n * interval '1 minute' FROM generate_series(0, 49) n;
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.BodyContentSpec ok(String uri) {
        return internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody();
    }

    @Test void theListNeedsTheToken() {
        web.get().uri("/v1/review/issues").exchange().expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
    }

    @Test void openIssuesAcrossBatchesOldestFirstWithRolesNotesAndTheBatchIndex() {
        ok("/v1/review/issues")
            .jsonPath("$.data.total").isEqualTo(53)
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.size").isEqualTo(50)
            .jsonPath("$.data.hasMore").isEqualTo(true)
            .jsonPath("$.data.items.length()").isEqualTo(50)
            .jsonPath("$.data.items[0].batchId").isEqualTo("I-A")
            .jsonPath("$.data.items[0].conceptId").isEqualTo("I-TWO")
            .jsonPath("$.data.items[0].tradeName").isEqualTo("Twomol")
            .jsonPath("$.data.items[0].index").isEqualTo(6)
            .jsonPath("$.data.items[0].issues.length()").isEqualTo(2)
            .jsonPath("$.data.items[0].issues[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data.items[0].issues[0].at").isEqualTo("2026-10-02T00:00:00Z")
            .jsonPath("$.data.items[0].issues[0].note").isEqualTo("strength reads 50 mg")
            .jsonPath("$.data.items[0].issues[1].role").isEqualTo("senior")
            .jsonPath("$.data.items[0].issues[1].note").isEqualTo("agree: 500 mg in DGDA")
            .jsonPath("$.data.items[1].conceptId").isEqualTo("I-ENG")
            .jsonPath("$.data.items[1].tradeName").isEqualTo("I-ENG")
            .jsonPath("$.data.items[1].index").isEqualTo(2)
            .jsonPath("$.data.items[1].issues[0].role").isEqualTo("engineer")
            .jsonPath("$.data.items[2].batchId").isEqualTo("I-B")
            .jsonPath("$.data.items[2].conceptId").isEqualTo("I-NEW")
            .jsonPath("$.data.items[3].conceptId").isEqualTo("P-00")
            .jsonPath("$.data.items[49].conceptId").isEqualTo("P-46");
    }

    @Test void theSecondPageHoldsTheRest() {
        ok("/v1/review/issues?page=1")
            .jsonPath("$.data.page").isEqualTo(1)
            .jsonPath("$.data.hasMore").isEqualTo(false)
            .jsonPath("$.data.items.length()").isEqualTo(3)
            .jsonPath("$.data.items[0].conceptId").isEqualTo("P-47")
            .jsonPath("$.data.items[2].conceptId").isEqualTo("P-49");
        ok("/v1/review/issues?page=9").jsonPath("$.data.items.length()").isEqualTo(0).jsonPath("$.data.hasMore").isEqualTo(false);
    }

    /** A dismissal, a re-run, the pipeline's own issue, a removed item and an approval each keep a record off the list. */
    @Test void closedAndNonReviewerIssuesAreNotListedAndNoEmailIsSent() {
        for (String uri : new String[]{"/v1/review/issues", "/v1/review/issues?page=1"}) {
            String body = new String(internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody()
                .returnResult().getResponseBody(), StandardCharsets.UTF_8);
            assertThat(body).as(uri).doesNotContain("I-DISM").doesNotContain("I-RERUN").doesNotContain("I-SRC")
                .doesNotContain("I-GONE").doesNotContain("I-OK").doesNotContain("@").doesNotContain("checked: the record is right");
        }
    }

    @Test void aBadPageIsRefused() {
        for (String bad : new String[]{"page=-1", "page=a", "page=10001"})
            internal(web).get().uri("/v1/review/issues?" + bad).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo("page");
    }
}
