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

/**
 * §7.3 P1C additions to the reviewer item, read-only over one shared seed:
 * K-THIS (W-1 Warin, N-1 Napa) is the open batch. Partners in other batches: K-OLD (A-1 Ecosprin approved, C-CAP, D-1, W-2,
 * six more aspirin brands), K-NEW (A-NOBDC, no route), K-COMBO (COMBO-1, warfarin + acetaminophen), K-CARRY (X-NOMAP, a
 * carried approval). Not partners: C-EYE (latest item removed, K-RM) and N-1's newer item in K-TWIN (N-1 is in K-THIS).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ReviewQueryCrossBatchIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org";

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              SELECT 'A-' || i, '10' || i, 'Aspra ' || i, 'Test Pharma', 'Tablet', 'Aspirin 75 mg', 'BDC-000002', 'parsed'
              FROM generate_series(2, 7) i;
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('COMBO-1', '120', 'Warinol', 'Test Pharma', 'Tablet', 'Warfarin 5 mg + Paracetamol 500 mg', NULL, 'parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name)
              SELECT 'A-' || i, 'XM2ZT1', 'Aspirin' FROM generate_series(2, 7) i;
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES
             ('COMBO-1', 'XM5S93', 'Warfarin'), ('COMBO-1', 'XM6XF8', 'Acetaminophen');
            INSERT INTO raw.ocl_concept (source, concept_id, payload, fetched_at) VALUES ('DGDA-Drugs', 'W-1', '{}', '2026-10-11T21:20:00Z');
            INSERT INTO raw.http_snapshot (source, request_key, status, body, fetched_at) VALUES
             ('rxnav', 'GET /REST/rxcui/161/properties.json', 200, '{}', '2026-10-11T22:00:00Z'),
             ('rxnav', 'GET /REST/rxcui/161/allProperties.json?prop=codes', 200, '{}', '2026-10-11T22:01:00Z');
            UPDATE curated.ddinter_drug SET fetched_at = '2026-10-12T01:00:00Z' WHERE ddinter_id IN ('DDInter14', 'DDInter1951');

            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('K-THIS','in_review',2,'2026-10-12T08:00:00Z'), ('K-OLD','in_review',11,'2026-10-10T08:00:00Z'),
             ('K-NEW','in_review',1,'2026-10-13T08:00:00Z'), ('K-RM','in_review',0,'2026-10-09T08:00:00Z'),
             ('K-COMBO','in_review',1,'2026-10-11T08:00:00Z'), ('K-TWIN','in_review',1,'2026-10-14T08:00:00Z'),
             ('K-CARRY','approved',1,'2026-10-08T08:00:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('K-THIS','DGDA-Drugs','W-1','pending',NULL,'2026-10-12T09:00:00Z'),
             ('K-THIS','DGDA-Drugs','N-1','issue',NULL,'2026-10-12T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','A-1','ok',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','C-CAP','pending',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','D-1','pending',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','W-2','pending',NULL,'2026-10-10T09:00:00Z'),
             ('K-OLD','DGDA-Drugs','N-1','ok',NULL,'2026-10-10T09:00:00Z'),
             ('K-NEW','DGDA-Drugs','A-NOBDC','pending',NULL,'2026-10-13T09:00:00Z'),
             ('K-RM','DGDA-Drugs','C-EYE','ok','removed from batch file','2026-10-09T09:00:00Z'),
             ('K-COMBO','DGDA-Drugs','COMBO-1','pending',NULL,'2026-10-11T09:00:00Z'),
             ('K-TWIN','DGDA-Drugs','N-1','pending',NULL,'2026-10-14T09:00:00Z'),
             ('K-CARRY','DGDA-Drugs','X-NOMAP','ok',NULL,'2026-10-08T09:00:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'K-OLD', 'DGDA-Drugs', 'A-' || i, 'pending', NULL, '2026-10-10T09:00:00Z' FROM generate_series(2, 7) i;
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('K-THIS','N-1','ok','','pharma.reviewer@example.org','pharmacist','2026-10-12T10:00:00Z'),
             ('K-THIS','N-1','issue','route should be otic','eng.reviewer@example.org','engineer','2026-10-12T10:05:00Z'),
             ('K-THIS','N-1','dismiss','the report misread the register','senior.reviewer@example.org','senior','2026-10-12T10:10:00Z'),
             ('K-THIS','N-1','issue','strength should read 650 mg','pharma.reviewer@example.org','pharmacist','2026-10-12T10:15:00Z'),
             ('K-OLD','A-1','ok','','pharma.reviewer@example.org','pharmacist','2026-10-10T10:00:00Z');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '', '{"text_missing":[]}'::jsonb FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical'), ('ddinter')) AS s(stage)
            WHERE bi.batch_id LIKE 'K-%' AND bi.note IS NULL;
            UPDATE ops.stage_result SET status = 'warn',
              note = 'DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter1951/DDInter20; DDInter text not found for DDInter1951/DDInter352',
              evidence = '{"text_missing":[["DDInter14","DDInter1951"],["DDInter1951","DDInter20"],["DDInter1951","DDInter352"]]}'
             WHERE batch_id = 'K-THIS' AND concept_id = 'W-1' AND stage = 'ddinter';
            UPDATE ops.stage_result SET status = 'warn', note = 'DDInter text not found for DDInter14/DDInter1951',
              evidence = '{"text_missing":[["DDInter14","DDInter1951"]]}'
             WHERE batch_id = 'K-COMBO' AND concept_id = 'COMBO-1' AND stage = 'ddinter';
            INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES
             ('K-CARRY','X-NOMAP','2026-10-08T09:00:00Z','00000000-0000-4000-8000-0000000000c1','run',
              '{"version":2,"carried_from":{"batchId":"K-PREV","extractedAt":"2026-10-07T09:00:00+00:00"}}');
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at)
              VALUES ('DDInter1951', 'DDInter20', 'reviewed', '', 'b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043',
                      '{"severity":"major","actions":["Avoid","Monitor"],"interaction":null,"management":null}',
                      'senior.reviewer@example.org', 'senior', '2026-10-15T08:00:00Z');
            """);
    }

    @Autowired WebTestClient web;

    WebTestClient.BodyContentSpec item(String batch, String concept) {
        return internal(web).get().uri("/v1/review/batches/{b}/items/{c}", batch, concept).header("X-Viewer-Email", SENIOR)
            .exchange().expectStatus().isOk().expectBody();
    }

    @Test void partnerScopeSplitsThisBatchThisProductAndOutside() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.stages[3].textMissing[*].partnerScope").isEqualTo(List.of("batch", "other", "other"))
            .jsonPath("$.data.stages[3].textMissing[*].inBatch").isEqualTo(List.of(true, false, false));
        item("K-COMBO", "COMBO-1")
            .jsonPath("$.data.stages[3].textMissing[0].partnerScope").isEqualTo("same_product")
            .jsonPath("$.data.stages[3].textMissing[0].inBatch").isEqualTo(false);
    }

    @Test void historyKeepsTheReportersNoteAndSaysWhyADecisionNoLongerCounts() {
        item("K-THIS", "N-1")
            .jsonPath("$.data.displayStatus").isEqualTo("issue")
            .jsonPath("$.data.history[?(@.kind == 'decision')].decision").isEqualTo(List.of("ok", "issue", "dismiss", "issue"))
            .jsonPath("$.data.history[?(@.kind == 'decision')].counts").isEqualTo(List.of(false, false, true, true))
            .jsonPath("$.data.history[?(@.kind == 'decision')].uncountedBy").isEqualTo(List.of("dismiss", "dismiss"))
            .jsonPath("$.data.history[?(@.kind == 'decision')].note")
                .isEqualTo(List.of("", "route should be otic", "the report misread the register", "strength should read 650 mg"))
            .jsonPath("$.data.history[?(@.decision == 'dismiss')].mine").isEqualTo(List.of(true))
            .jsonPath("$.data.history[?(@.decision == 'dismiss')].role").isEqualTo(List.of("senior"));
    }

    @Test void openIssuesQuoteTheCountedIssuesAfterTheLatestDismissal() {
        byte[] body = item("K-THIS", "N-1")
            .jsonPath("$.data.openIssues.length()").isEqualTo(1)
            .jsonPath("$.data.openIssues[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data.openIssues[0].note").isEqualTo("strength should read 650 mg")
            .jsonPath("$.data.openIssues[0].at").isEqualTo("2026-10-12T10:15:00Z")
            .jsonPath("$.data.openIssues[0].mine").isEqualTo(false)
            .returnResult().getResponseBody();
        assertThat(new String(body, StandardCharsets.UTF_8)).doesNotContain("@example.org");
        item("K-THIS", "W-1").jsonPath("$.data.openIssues.length()").isEqualTo(0);
    }

    @Test void aCarriedApprovalIsApprovedAndItsExtractEntryNamesTheBatch() {
        item("K-CARRY", "X-NOMAP")
            .jsonPath("$.data.displayStatus").isEqualTo("approved")
            .jsonPath("$.data.history[?(@.kind == 'extract')].carriedFrom").isEqualTo(List.of("K-PREV"));
        item("K-THIS", "W-1").jsonPath("$.data.history[?(@.kind == 'extract')].carriedFrom").isEqualTo(List.of());
    }

    @Test void everyCodeAndTheBrandCarryTheirSourceWithTheStoredFetchTime() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.brand.source.url").isEqualTo("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/W-1/")
            .jsonPath("$.data.brand.source.label").isEqualTo("DGDA register (OCL)")
            .jsonPath("$.data.brand.source.fetchedAt").isEqualTo("2026-10-11T21:20:00Z")
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ICD11_XM')].source.fetchedAt").isEqualTo(List.of("2026-10-11T21:20:00Z"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'DRUGBANK')].source.url").isEqualTo(List.of("https://go.drugbank.com/drugs/DB00682"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'DDINTER')].source.fetchedAt").isEqualTo(List.of("2026-10-12T01:00:00Z"))
            .jsonPath("$.data.ingredients[0].ddinter.entries[0].source.url").isEqualTo("https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/");
        item("K-THIS", "N-1")
            .jsonPath("$.data.brand.source.fetchedAt").isEmpty()
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'RXCUI')].source.fetchedAt").isEqualTo(List.of("2026-10-11T22:00:00Z"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ATC')].source.fetchedAt").isEqualTo(List.of("2026-10-11T22:01:00Z"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ATC')].source.label").isEqualTo(List.of("WHO ATC/DDD Index"))
            .jsonPath("$.data.ingredients[0].codes[?(@.system == 'ICD11_XM')].source.label").isEqualTo(List.of("Search ICD-11 for XM6XF8"));
    }

    // ---- §7.3 otherPairs

    @Test void otherPairsCoverEveryOtherBatchSplitByThePartnersStatus() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.otherPairs.pairs[*].ddinterB").isEqualTo(List.of("DDInter20", "DDInter20", "DDInter1951", "DDInter351"))
            .jsonPath("$.data.otherPairs.pairs[*].severity").isEqualTo(List.of("major", "major", "moderate", "moderate"))
            .jsonPath("$.data.otherPairs.pairs[0].partners[*].conceptId").isEqualTo(List.of("A-1"))
            .jsonPath("$.data.otherPairs.pairs[0].partners[0].approved").isEqualTo(true)
            .jsonPath("$.data.otherPairs.pairs[0].partners[0].batchId").isEqualTo("K-OLD")
            .jsonPath("$.data.otherPairs.pairs[0].management")
                .isEqualTo("Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")
            .jsonPath("$.data.otherPairs.pairs[0].partnerBdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.otherPairs.pairs[2].partners[*].conceptId").isEqualTo(List.of("COMBO-1"))
            .jsonPath("$.data.otherPairs.pairs[3].partners[*].conceptId").isEqualTo(List.of("C-CAP"))
            .jsonPath("$.data.otherPairs.notChecked.length()").isEqualTo(1)
            .jsonPath("$.data.otherPairs.notChecked[0].partnerSubstance").isEqualTo("Domperidone")
            .jsonPath("$.data.otherPairs.notChecked[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.otherPairs.notChecked[0].side").isEqualTo("partner")
            .jsonPath("$.data.otherPairs.notChecked[0].partnerBdsId").isEqualTo("BDS-000004")
            .jsonPath("$.data.otherPairs.notChecked[0].partners[*].conceptId").isEqualTo(List.of("D-1"));
    }

    @Test void overFivePartnersSendsTheFirstFiveInBatchThenNameOrderAndTheTotal() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.otherPairs.pairs[1].partnerCount").isEqualTo(7)
            .jsonPath("$.data.otherPairs.pairs[1].partners.length()").isEqualTo(5)
            .jsonPath("$.data.otherPairs.pairs[1].partners[*].tradeName")
                .isEqualTo(List.of("Asprin Plus", "Aspra 2", "Aspra 3", "Aspra 4", "Aspra 5"))
            .jsonPath("$.data.otherPairs.pairs[1].partners[0].batchId").isEqualTo("K-NEW")
            .jsonPath("$.data.otherPairs.pairs[1].partners[0].approved").isEqualTo(false);
    }

    @Test void aRemovedProductAndAProductAlsoInThisBatchAreNeverPartners() {
        byte[] body = item("K-THIS", "W-1").returnResult().getResponseBody();
        String json = new String(body, StandardCharsets.UTF_8);
        String others = json.substring(json.indexOf("\"otherPairs\""));
        assertThat(others).doesNotContain("C-EYE", "Optimycin", "\"N-1\"", "W-2");
    }

    /** Review Focus 2: K-TWIN holds only N-1, which is in this batch; K-RM holds only a removed item. */
    @Test void otherBatchesCountsOnlyBatchesWithAPartner() {
        item("K-THIS", "W-1").jsonPath("$.data.otherPairs.otherBatches").isEqualTo(4);
    }

    @Test void everyPairCarriesItsReviewStateAndItsLinkOnlyForANumericInteractionId() {
        item("K-THIS", "W-1")
            .jsonPath("$.data.otherPairs.pairs[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.otherPairs.pairs[0].pairReview.at").isEqualTo("2026-10-15T08:00:00Z")
            .jsonPath("$.data.otherPairs.pairs[0].pairReview.mine").isEqualTo(true)
            .jsonPath("$.data.otherPairs.pairs[0].source").isEmpty()           // interaction id IA-1 is not numeric
            .jsonPath("$.data.batchPairs.pairs[0].pairReview.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.batchPairs.pairs[0].pairReview.mine").isEqualTo(false);
    }
}
