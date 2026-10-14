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
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.3 reviewer read endpoints (§11.3 ReviewQueryIntegrationTest). Read-only: the seed is shared by every test. */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ReviewQueryIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    /**
     * Batch Q-1, seven current items in concept order: A-1 approved, C-EYE back in review (approved before its stamp),
     * D-1 issue (no DDInter data), N-1 engineer checked, T-NR pending (DDInter never run), W-1 pending (re-run),
     * X-NOSUB pending (unmapped, three failed checks); plus "gone", removed from the batch file.
     */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000099', 'Testmol');
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
             ('BDS-000099','ICD11_XM','XM9TST','any','dgda-ocl','xm',1.0),
             ('BDS-000099','DDINTER','DDInter777','systemic','ddinter2','drugbank',1.0);
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              VALUES ('T-NR','011','Testa','Test Pharma','Tablet','Testmol 1 mg','parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('T-NR','XM9TST','Testmol');
            INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES ('DGDA-Drugs','W-1','{"id":"W-1","extras":{"x":1}}');

            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('Q-1','in_review',8,'2026-10-11T21:27:17Z'), ('Q-2','approved',1,'2026-10-10T08:00:00Z'),
             ('Q-EMPTY','in_review',0,'2026-10-09T08:00:00Z');
            INSERT INTO ops.batch_run (batch_id, run_at, stages, counts, concept_ids) VALUES
             ('Q-1','2026-10-11T21:27:17Z','{dgda,substances,clinical,ddinter}','{}','{}');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('Q-1','DGDA-Drugs','A-1','ok',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','C-EYE','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','D-1','issue',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','N-1','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','T-NR','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','W-1','pending',NULL,'2026-10-12T09:30:00.123456Z'),
             ('Q-1','DGDA-Drugs','X-NOSUB','pending',NULL,'2026-10-12T09:00:00Z'),
             ('Q-1','DGDA-Drugs','gone','issue','removed from batch file','2026-10-11T21:30:00Z'),
             ('Q-2','DGDA-Drugs','W-2','ok',NULL,'2026-10-10T08:05:00Z');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('Q-1','A-1','ok','','pharma.reviewer@example.org','pharmacist','2026-10-12T10:00:00Z'),
             ('Q-1','C-EYE','ok','','pharma.reviewer@example.org','pharmacist','2026-10-12T08:00:00Z'),
             ('Q-1','D-1','issue','route should be otic','Eng.Reviewer@example.org','engineer','2026-10-12T10:05:00Z'),
             ('Q-1','N-1','ok','','eng.reviewer@example.org','engineer','2026-10-12T10:10:00Z'),
             ('Q-1','gone','issue','wrong product listed','old@example.org','pharmacist','2026-10-11T22:00:00Z'),
             ('Q-2','W-2','ok','','pharma.reviewer@example.org','pharmacist','2026-10-10T09:00:00Z');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '', '{}'::jsonb FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical')) AS s(stage)
            WHERE bi.concept_id NOT IN ('X-NOSUB', 'gone');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
             ('Q-1','A-1','ddinter','ok','','{"text_missing":[]}'),
             ('Q-1','C-EYE','ddinter','ok','','{"text_missing":[],"route":"ophthalmic"}'),
             ('Q-1','D-1','ddinter','warn','No interaction data in DDInter for this substance','{"text_missing":[]}'),
             ('Q-1','N-1','ddinter','warn','DDInter text not found for DDInter14/DDInter1951','{"text_missing":[["DDInter14","DDInter1951"]]}'),
             ('Q-1','T-NR','ddinter','ok','','{"text_missing":[]}'),
             ('Q-1','W-1','ddinter','warn','DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter1951/DDInter5',
              '{"text_missing":[["DDInter14","DDInter1951"],["DDInter1951","DDInter5"]]}'),
             ('Q-1','X-NOSUB','dgda','ok','','{}'),
             ('Q-1','X-NOSUB','substances','fail','error: ValueError: no substance; unmapped xm','{}'),
             ('Q-1','X-NOSUB','clinical','fail','no clinical drug','{}'),
             ('Q-1','X-NOSUB','ddinter','fail','not run: stage aborted at chunk 1','{}'),
             ('Q-2','W-2','ddinter','ok','','{}');
            INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES
             ('Q-1','W-1','2026-10-12T09:00:00Z','00000000-0000-0000-0000-00000000000a','run',
              '{"version":1,"extracted_at":"2026-10-12T09:00:00+00:00","brand":{"dar_number":"001","trade_name":"Warin","company":"Test Pharma","dosage_form":"Tablet","generic_content_raw":"Warfarin Sodium 5 mg"},"clinical_drug":{"bdc_id":"BDC-000001","display_name":"Warfarin 5 mg tablet","dose_form":"Tablet","route":"systemic"},"ingredients":[],"stages":{"ddinter":{"status":"warn","note":"DDInter text not found for DDInter14/DDInter1951"}}}'),
             ('Q-1','W-1','2026-10-12T09:30:00.123456Z','00000000-0000-0000-0000-00000000000b','rerun',
              '{"version":1,"extracted_at":"2026-10-12T09:30:00.123456+00:00","brand":{"dar_number":"001","trade_name":"Warin","company":"Test Pharma","dosage_form":"Tablet","generic_content_raw":"Warfarin Sodium 5 mg"},"clinical_drug":{"bdc_id":"BDC-000001","display_name":"Warfarin 5 mg tablet","dose_form":"Tablet","route":"systemic"},"ingredients":[],"stages":{"ddinter":{"status":"warn","note":"DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter1951/DDInter5"}}}');
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.BodyContentSpec ok(String uri) {
        return internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody();
    }

    /** The search value is sent strictly encoded, so "%" and "\\" arrive as typed. */
    private WebTestClient.ResponseSpec searchQ1(String q) {
        return internal(web).get().uri(b -> b.path("/v1/review/batches/Q-1/items").queryParam("q", "{q}").build(q)).exchange();
    }

    @Test void everyReviewReadNeedsTheToken() {
        for (String uri : List.of("/v1/review/batches", "/v1/review/batches/Q-1/items", "/v1/review/batches/Q-1/versions"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
    }

    @Test void batchesCarryCountsOfCurrentItemsNewestFirst() {
        ok("/v1/review/batches")
            .jsonPath("$.data[0].batchId").isEqualTo("Q-1")
            .jsonPath("$.data[0].status").isEqualTo("in_review")
            .jsonPath("$.data[0].runAt").isEqualTo("2026-10-11T21:27:17Z")
            .jsonPath("$.data[0].itemCount").isEqualTo(7)
            .jsonPath("$.data[0].counts.approved").isEqualTo(1)
            .jsonPath("$.data[0].counts.issue").isEqualTo(1)
            .jsonPath("$.data[0].counts.needsReview").isEqualTo(5)
            .jsonPath("$.data[0].counts.engineerChecked").isEqualTo(1)
            .jsonPath("$.data[0].counts.backInReview").isEqualTo(1)
            .jsonPath("$.data[0].counts.noData").isEqualTo(1)
            .jsonPath("$.data[0].counts.warnings").isEqualTo(4)
            .jsonPath("$.data[1].batchId").isEqualTo("Q-2")
            .jsonPath("$.data[1].counts.approved").isEqualTo(1)
            .jsonPath("$.data[2].batchId").isEqualTo("Q-EMPTY")
            .jsonPath("$.data[2].itemCount").isEqualTo(0);
    }

    @Test void itemsComeInConceptOrderWithStatusesHintsAndVersions() {
        ok("/v1/review/batches/Q-1/items")
            .jsonPath("$.data.batchId").isEqualTo("Q-1")
            .jsonPath("$.data.total").isEqualTo(7)
            .jsonPath("$.data.filterCounts.all").isEqualTo(7)
            .jsonPath("$.data.filterCounts.needs").isEqualTo(5)
            .jsonPath("$.data.filterCounts.warn").isEqualTo(4)
            .jsonPath("$.data.filterCounts.issue").isEqualTo(1)
            .jsonPath("$.data.filterCounts.approved").isEqualTo(1)
            .jsonPath("$.data.filterCounts.nodata").isEqualTo(1)
            .jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("A-1", "C-EYE", "D-1", "N-1", "T-NR", "W-1", "X-NOSUB"))
            .jsonPath("$.data.items[*].displayStatus").isEqualTo(List.of("approved", "back_in_review", "issue",
                "engineer_checked", "pending", "pending", "pending"))
            .jsonPath("$.data.items[0].tradeName").isEqualTo("Ecosprin")
            .jsonPath("$.data.items[0].clinicalDisplayName").isEqualTo("Aspirin 75 mg tablet")
            .jsonPath("$.data.items[2].hint.noData").isEqualTo(true)
            .jsonPath("$.data.items[2].hint.warnings").isEqualTo(1)
            .jsonPath("$.data.items[4].hint.notRun").isEqualTo(true)
            .jsonPath("$.data.items[5].hint.pairsWithoutText").isEqualTo(2)
            .jsonPath("$.data.items[5].version.extractedAt").isEqualTo("2026-10-12T09:30:00.123456Z")
            .jsonPath("$.data.items[5].version.lastDecisionId").isEmpty()
            .jsonPath("$.data.items[6].hint.failed").isEqualTo(3)
            .jsonPath("$.data.items[6].tradeName").isEqualTo("Newdrug");
    }

    @Test void filtersSearchAndPagesKeepTheBatchIndex() {
        ok("/v1/review/batches/Q-1/items?show=needs")
            .jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("C-EYE", "N-1", "T-NR", "W-1", "X-NOSUB"))
            .jsonPath("$.data.items[*].index").isEqualTo(List.of(2, 4, 5, 6, 7))
            .jsonPath("$.data.filterCounts.all").isEqualTo(7);
        searchQ1("WARFARIN").expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("W-1"));
        searchQ1("bds-000004").expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("D-1"));
        searchQ1("eye pharma").expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("C-EYE"));
        searchQ1("  ").expectBody().jsonPath("$.data.items.length()").isEqualTo(7);
        ok("/v1/review/batches/Q-1/items?show=issue&q=napa").jsonPath("$.data.items.length()").isEqualTo(0);
        ok("/v1/review/batches/Q-1/items?size=2&page=1").jsonPath("$.data.items[*].index").isEqualTo(List.of(3, 4));
    }

    /** Review Focus 5. */
    @Test void searchIsALiteralSubstring() {
        // "%" is in the eye drop's own text ("Chloramphenicol 0.5%"), so a literal match finds exactly that record;
        // a LIKE wildcard would have matched all seven.
        searchQ1("%").expectStatus().isOk().expectBody().jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("C-EYE"));
        for (String q : List.of("_", "\\", ".*", "N_pa", "Nap%", "[a-z]+"))
            searchQ1(q).expectStatus().isOk().expectBody().jsonPath("$.data.items.length()").isEqualTo(0);
        searchQ1("x".repeat(101)).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("q");
        searchQ1("x".repeat(100)).expectStatus().isOk().expectBody().jsonPath("$.data.items.length()").isEqualTo(0);
    }

    @Test void badParametersAndUnknownBatchesAreRefused() {
        for (String[] bad : new String[][]{{"show=open", "show"}, {"page=-1", "page"}, {"size=0", "size"}, {"size=501", "size"},
                                           {"page=a", "page"}})
            internal(web).get().uri("/v1/review/batches/Q-1/items?" + bad[0]).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(bad[1]);
        for (String uri : List.of("/v1/review/batches/NOPE/items", "/v1/review/batches/NOPE/versions"))
            internal(web).get().uri(uri).exchange().expectStatus().isNotFound()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
    }

    @Test void versionsCarryEveryCurrentItem() throws Exception {
        long last = count(pg, "SELECT id FROM ops.review_decision WHERE concept_id = 'N-1'");
        ok("/v1/review/batches/Q-1/versions")
            .jsonPath("$.data.length()").isEqualTo(7)
            .jsonPath("$.data[3].conceptId").isEqualTo("N-1")
            .jsonPath("$.data[3].lastDecisionId").isEqualTo((int) last)
            .jsonPath("$.data[3].displayStatus").isEqualTo("engineer_checked")
            .jsonPath("$.data[5].extractedAt").isEqualTo("2026-10-12T09:30:00.123456Z");
    }

    /** Review Focus 4 (list side; Task 6 adds the detail side). */
    @Test void removedItemsAreNotListedOrServed() {
        for (String uri : List.of("/v1/review/batches/Q-1/items", "/v1/review/batches/Q-1/versions", "/v1/review/batches")) {
            byte[] body = internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            assertThat(new String(body, StandardCharsets.UTF_8)).as(uri).doesNotContain("\"gone\"").doesNotContain("old@example.org");
        }
    }

    @Test void noListCarriesAnEmail() {
        for (String uri : List.of("/v1/review/batches", "/v1/review/batches/Q-1/items", "/v1/review/batches/Q-1/versions")) {
            byte[] body = internal(web).get().uri(uri).exchange().expectBody().returnResult().getResponseBody();
            assertThat(new String(body, StandardCharsets.UTF_8)).as(uri).doesNotContain("@");
        }
    }
}
