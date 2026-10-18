package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
 * Spec §7.9.5 (§11.3 QaQueryIntegrationTest): GET /v1/qa/batches/{b}/items and GET /v1/qa/records, token only, read-only.
 * The seed is shared by every test. Batch QA-1 holds one record per problem filter, each with a near miss next to it.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class QaQueryIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    /** A sentinel email and note on every decision: neither may appear in any QA response. */
    static final String EMAIL = "sentinel.reviewer@example.org", NOTE = "SENTINEL-NOTE route should be otic";

    /**
     * QA-1 (concept order): A-1 approved, all ok; A-NOBDC partial parse with a null strength and an unaligned name (clinical
     * warn); C-EYE ok, route_assumed false; D-1 issue, no DDInter data (coverage none, ddinter warn); N-1 engineer checked,
     * ddinter route_assumed true (warn); T-NR substance never mapped (coverage not_run), a parsed name with no strength key,
     * and no ddinter result; W-1 route_assumed as the string "true" and a non-array parsed; X-NOSUB XM code with no
     * substance, three failed stages; "gone" removed from the batch file (it would match every filter). QA-2: W-2, a
     * substances warn. QA-P: 120 records, each with a dgda warn (paging). QA-EMPTY: no items.
     */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000099', 'Testmol');
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
             ('BDS-000099','ICD11_XM','XM9TST','any','dgda-ocl','xm',1.0);
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, parse_status)
              VALUES ('T-NR','011','Testa','Test Pharma','Tablet','Testmol 1 mg','parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('T-NR','XM9TST','Testmol');

            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('QA-1','in_review',9,'2026-10-11T21:27:17Z'), ('QA-2','approved',1,'2026-10-10T08:00:00Z'),
             ('QA-P','in_review',120,'2026-10-09T08:00:00Z'), ('QA-EMPTY','in_review',0,'2026-10-08T08:00:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('QA-1','DGDA-Drugs','A-1','ok',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','A-NOBDC','pending',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','C-EYE','pending',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','D-1','issue',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','N-1','pending',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','T-NR','pending',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','W-1','pending',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','X-NOSUB','pending',NULL,'2026-10-12T09:00:00Z'),
             ('QA-1','DGDA-Drugs','gone','issue','removed from batch file','2026-10-11T21:30:00Z'),
             ('QA-2','DGDA-Drugs','W-2','ok',NULL,'2026-10-10T08:05:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              SELECT 'QA-P', 'DGDA-Drugs', 'P-' || lpad(i::text, 3, '0'), 'pending', NULL, '2026-10-09T08:05:00Z' FROM generate_series(1, 120) i;
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('QA-1','A-1','ok','SENTINEL-NOTE route should be otic','sentinel.reviewer@example.org','pharmacist','2026-10-12T10:00:00Z'),
             ('QA-1','D-1','issue','SENTINEL-NOTE route should be otic','sentinel.reviewer@example.org','engineer','2026-10-12T10:05:00Z'),
             ('QA-1','N-1','ok','SENTINEL-NOTE route should be otic','sentinel.reviewer@example.org','engineer','2026-10-12T10:10:00Z'),
             ('QA-1','gone','issue','SENTINEL-NOTE route should be otic','sentinel.reviewer@example.org','pharmacist','2026-10-11T22:00:00Z'),
             ('QA-2','W-2','ok','SENTINEL-NOTE route should be otic','sentinel.reviewer@example.org','pharmacist','2026-10-10T09:00:00Z');

            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '', '{}'::jsonb FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances')) AS s(stage)
            WHERE bi.batch_id IN ('QA-1', 'QA-2') AND bi.concept_id NOT IN ('X-NOSUB', 'gone', 'W-2');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
             ('QA-1','A-1','clinical','ok','','{"parse_status":"parsed","parsed":[{"name":"Aspirin","strength_value":"75","strength_unit":"mg"}],"aligned":[{"name":"Aspirin","bds_id":"BDS-000002","method":"xm"}]}'),
             ('QA-1','A-1','ddinter','ok','','{"text_missing":[],"route":"systemic","route_assumed":false}'),
             ('QA-1','A-NOBDC','clinical','warn','unparsed: herb','{"parse_status":"partial","parsed":[{"name":"Aspirin","strength_value":"75"},{"name":"herb","strength_value":null}],"aligned":[{"name":"Aspirin","bds_id":"BDS-000002"},{"name":"herb","bds_id":null}]}'),
             ('QA-1','A-NOBDC','ddinter','ok','','{"route_assumed":false}'),
             ('QA-1','C-EYE','clinical','ok','','{"parsed":[{"name":"Chloramphenicol","strength_value":"0.5"}],"aligned":[{"name":"Chloramphenicol","bds_id":"BDS-000003"}]}'),
             ('QA-1','C-EYE','ddinter','ok','','{"route":"ophthalmic","route_assumed":false}'),
             ('QA-1','D-1','clinical','ok','','{"parsed":[{"name":"Domperidone","strength_value":"10"}],"aligned":[{"name":"Domperidone","bds_id":"BDS-000004"}]}'),
             ('QA-1','D-1','ddinter','warn','No interaction data in DDInter for this substance','{"route_assumed":false}'),
             ('QA-1','N-1','clinical','ok','','{"parsed":[{"name":"Paracetamol","strength_value":"500"}],"aligned":[{"name":"Paracetamol","bds_id":"BDS-000005"}]}'),
             ('QA-1','N-1','ddinter','warn','DDInter route assumed: DDInter14 (systemic) used for unknown route','{"route":null,"route_assumed":true}'),
             ('QA-1','T-NR','clinical','ok','','{"parsed":[{"name":"Testmol","strength_unit":"mg"}],"aligned":[{"name":"Testmol","bds_id":"BDS-000099"}]}'),
             ('QA-1','W-1','clinical','ok','','{"parsed":{"name":"Warfarin"},"aligned":"none"}'),
             ('QA-1','W-1','ddinter','ok','','{"route_assumed":"true"}'),
             ('QA-1','X-NOSUB','dgda','ok','','{}'),
             ('QA-1','X-NOSUB','substances','fail','error: ValueError: no substance; unmapped xm','{}'),
             ('QA-1','X-NOSUB','clinical','fail','no clinical drug','{"parsed":[],"aligned":[]}'),
             ('QA-1','X-NOSUB','ddinter','fail','not run: stage aborted at chunk 1','{}'),
             ('QA-1','gone','dgda','fail','gone','{}'),
             ('QA-1','gone','clinical','warn','gone','{"parsed":[{"name":"x","strength_value":null}],"aligned":[{"name":"x","bds_id":null}]}'),
             ('QA-1','gone','ddinter','warn','gone','{"route_assumed":true}'),
             ('QA-2','W-2','dgda','ok','','{}'),
             ('QA-2','W-2','substances','warn','name only: Warfarin Sodium','{}');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
              SELECT 'QA-P', concept_id, 'dgda', 'warn', 'paging', '{}' FROM ops.batch_item WHERE batch_id = 'QA-P';
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.BodyContentSpec ok(String uri) {
        return internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody();
    }

    private String body(String uri) {
        return new String(internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8);
    }

    private void invalid(String uri, String field) {
        internal(web).get().uri(uri).exchange().expectStatus().isBadRequest().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(field);
    }

    @Test void everyQaReadNeedsTheToken() {
        for (String uri : List.of("/v1/qa/batches/QA-1/items", "/v1/qa/records?filter=stage_warn"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        web.get().uri("/v1/qa/records?filter=stage_warn").header(HEADER, "wrong").exchange().expectStatus().isUnauthorized();
    }

    // ---- GET /v1/qa/batches/{b}/items

    @Test void batchItemsAreTheCurrentItemsInConceptOrderWithStagesInPipelineOrder() {
        ok("/v1/qa/batches/QA-1/items")
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.batchId").isEqualTo("QA-1")
            .jsonPath("$.data.status").isEqualTo("in_review")
            .jsonPath("$.data.runAt").isEqualTo("2026-10-11T21:27:17Z")
            .jsonPath("$.data.itemCount").isEqualTo(8)
            .jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("A-1", "A-NOBDC", "C-EYE", "D-1", "N-1", "T-NR", "W-1", "X-NOSUB"))
            .jsonPath("$.data.items[0].tradeName").isEqualTo("Ecosprin")
            .jsonPath("$.data.items[*].displayStatus").isEqualTo(List.of("approved", "pending", "pending", "issue", "engineer_checked",
                "pending", "pending", "pending"))
            .jsonPath("$.data.items[0].stages[*].stage").isEqualTo(List.of("dgda", "substances", "clinical", "ddinter"))
            // X-NOSUB's stage rows were inserted out of order; the note is the stored note, whole
            .jsonPath("$.data.items[7].stages[*].stage").isEqualTo(List.of("dgda", "substances", "clinical", "ddinter"))
            .jsonPath("$.data.items[7].stages[1].status").isEqualTo("fail")
            .jsonPath("$.data.items[7].stages[1].note").isEqualTo("error: ValueError: no substance; unmapped xm")
            .jsonPath("$.data.items[4].stages[3].note").isEqualTo("DDInter route assumed: DDInter14 (systemic) used for unknown route")
            .jsonPath("$.data.items[0].stages[0].note").isEqualTo("")
            // T-NR has no ddinter result: the stage is absent, not null
            .jsonPath("$.data.items[5].stages[*].stage").isEqualTo(List.of("dgda", "substances", "clinical"))
            .jsonPath("$.data.items[0].stages[0].evidence").doesNotExist();
    }

    @Test void anEmptyBatchHasNoItemsAndAnUnknownOneIs404() {
        ok("/v1/qa/batches/QA-EMPTY/items").jsonPath("$.data.itemCount").isEqualTo(0).jsonPath("$.data.items.length()").isEqualTo(0);
        internal(web).get().uri("/v1/qa/batches/NOPE/items").exchange().expectStatus().isNotFound().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND").jsonPath("$.errors[0].field").isEqualTo("batchId");
    }

    @Test void batchItemsRefuseABadIdAndAnyQueryParameter() {
        invalid("/v1/qa/batches/" + "x".repeat(101) + "/items", "batchId");
        internal(web).get().uri(b -> b.path("/v1/qa/batches/{b}/items").build("QA 1")).exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("batchId");
        invalid("/v1/qa/batches/QA-1/items?page=1", "page");
    }

    // ---- GET /v1/qa/records

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
        "strength_missing| A-NOBDC T-NR",          // a null strength; a parsed name without the key. W-1's parsed is not an array
        "parse_partial   | A-NOBDC",               // brand_product.parse_status
        "route_assumed   | N-1",                   // the ddinter-stage evidence; the string "true" (W-1) is not true
        "no_ddinter_data | D-1",                   // coverage none; T-NR's not_run never matches (D33)
        "unaligned       | A-NOBDC X-NOSUB",       // an aligned[] entry with a null bds_id; an XM code with no substance
        "stage_warn      | A-NOBDC D-1 N-1",
        "stage_fail      | X-NOSUB",
    })
    void eachFilterMatchesItsRecordsOnlyAndNeverARemovedItem(String filter, String expected) {
        ok("/v1/qa/records?batch=QA-1&filter=" + filter)
            .jsonPath("$.data.filter").isEqualTo(filter)
            .jsonPath("$.data.stage").isEmpty()
            .jsonPath("$.data.batch").isEqualTo("QA-1")
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.size").isEqualTo(100)
            .jsonPath("$.data.total").isEqualTo(expected.split(" ").length)
            .jsonPath("$.data.items[*].conceptId").isEqualTo(List.of(expected.split(" ")))
            .jsonPath("$.data.items[*].batchId").isEqualTo(new java.util.ArrayList<>(java.util.Collections.nCopies(expected.split(" ").length, "QA-1")));
    }

    @Test void aRecordRowCarriesItsTradeNameDisplayStatusAndTheFourStageStatuses() {
        ok("/v1/qa/records?batch=QA-1&filter=stage_warn")
            .jsonPath("$.data.items[0].tradeName").isEqualTo("Asprin Plus")
            .jsonPath("$.data.items[0].displayStatus").isEqualTo("pending")
            .jsonPath("$.data.items[0].stages.dgda").isEqualTo("ok")
            .jsonPath("$.data.items[0].stages.substances").isEqualTo("ok")
            .jsonPath("$.data.items[0].stages.clinical").isEqualTo("warn")
            .jsonPath("$.data.items[0].stages.ddinter").isEqualTo("ok")
            .jsonPath("$.data.items[1].displayStatus").isEqualTo("issue")
            .jsonPath("$.data.items[2].displayStatus").isEqualTo("engineer_checked");
        // a stage with no result is null in the record row
        ok("/v1/qa/records?batch=QA-1&filter=strength_missing")
            .jsonPath("$.data.items[1].conceptId").isEqualTo("T-NR")
            .jsonPath("$.data.items[1].stages.ddinter").isEmpty()
            .jsonPath("$.data.items[1].stages.clinical").isEqualTo("ok");
    }

    @Test void withoutABatchEveryBatchIsSearchedInBatchThenConceptOrder() {
        ok("/v1/qa/records?filter=stage_warn&page=1")
            .jsonPath("$.data.batch").isEmpty()
            .jsonPath("$.data.total").isEqualTo(3 + 1 + 120)
            .jsonPath("$.data.items.length()").isEqualTo(24)
            // QA-1's three, then QA-2's W-2, then QA-P's 120: page 1 starts at the 101st (P-097)
            .jsonPath("$.data.items[0].batchId").isEqualTo("QA-P")
            .jsonPath("$.data.items[0].conceptId").isEqualTo("P-097")
            .jsonPath("$.data.items[23].conceptId").isEqualTo("P-120");
        ok("/v1/qa/records?filter=stage_warn")
            .jsonPath("$.data.items.length()").isEqualTo(100)
            .jsonPath("$.data.items[0:4].conceptId").isEqualTo(List.of("A-NOBDC", "D-1", "N-1", "W-2"))
            .jsonPath("$.data.items[3].batchId").isEqualTo("QA-2")
            .jsonPath("$.data.items[4].conceptId").isEqualTo("P-001");
    }

    @Test void stageNarrowsStageWarnToThatStage() {
        ok("/v1/qa/records?filter=stage_warn&stage=ddinter&batch=QA-1")
            .jsonPath("$.data.stage").isEqualTo("ddinter")
            .jsonPath("$.data.items[*].conceptId").isEqualTo(List.of("D-1", "N-1"));
        ok("/v1/qa/records?filter=stage_warn&stage=substances")
            .jsonPath("$.data.total").isEqualTo(1)
            .jsonPath("$.data.items[0].conceptId").isEqualTo("W-2");
        ok("/v1/qa/records?filter=stage_warn&stage=dgda&batch=QA-P&page=1")
            .jsonPath("$.data.total").isEqualTo(120)
            .jsonPath("$.data.items.length()").isEqualTo(20);
    }

    @Test void aPagePastTheEndIsEmptyWithTheTotal() {
        ok("/v1/qa/records?filter=stage_warn&page=999").jsonPath("$.data.total").isEqualTo(124).jsonPath("$.data.items.length()").isEqualTo(0);
        ok("/v1/qa/records?filter=stage_fail&batch=QA-EMPTY").jsonPath("$.data.total").isEqualTo(0);
    }

    @Test void anUnknownBatchIs404WithFieldBatch() {
        internal(web).get().uri("/v1/qa/records?filter=stage_warn&batch=NOPE").exchange().expectStatus().isNotFound().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND").jsonPath("$.errors[0].field").isEqualTo("batch");
    }

    @Test void everyBadInputIs400WithItsField() {
        invalid("/v1/qa/records", "filter");
        invalid("/v1/qa/records?filter=", "filter");
        invalid("/v1/qa/records?filter=STAGE_WARN", "filter");
        invalid("/v1/qa/records?filter=strength", "filter");
        invalid("/v1/qa/records?filter=stage_fail&stage=ddinter", "stage");
        invalid("/v1/qa/records?filter=parse_partial&stage=dgda", "stage");
        invalid("/v1/qa/records?filter=stage_warn&stage=evidence", "stage");
        invalid("/v1/qa/records?filter=stage_warn&stage=", "stage");
        invalid("/v1/qa/records?filter=stage_warn&batch=", "batch");
        invalid("/v1/qa/records?filter=stage_warn&batch=" + "b".repeat(101), "batch");
        internal(web).get().uri(b -> b.path("/v1/qa/records").queryParam("filter", "stage_warn").queryParam("batch", "{b}").build("QA/1"))
            .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("batch");
        for (String page : List.of("1000", "-1", "1.5", "abc", "", "0x1", "１"))
            internal(web).get().uri(b -> b.path("/v1/qa/records").queryParam("filter", "stage_warn").queryParam("page", "{p}").build(page))
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("page");
        invalid("/v1/qa/records?filter=stage_warn&size=10", "size");
        invalid("/v1/qa/records?filter=stage_warn&filter=stage_fail", "filter");
        invalid("/v1/qa/records?filter=stage_warn&page=0&page=1", "page");
        invalid("/v1/qa/records?filter=stage_warn&scope=all", "scope");
        // a parameter sent without "=" is sent: refused like any bad value, never ignored
        invalid("/v1/qa/records?filter", "filter");
        invalid("/v1/qa/records?filter=stage_warn&stage", "stage");
        invalid("/v1/qa/records?filter=stage_warn&batch", "batch");
        invalid("/v1/qa/records?filter=stage_warn&page", "page");
    }

    @Test void noResponseCarriesAnEmailOrADecisionNote() {
        StringBuilder all = new StringBuilder(body("/v1/qa/batches/QA-1/items")).append(body("/v1/qa/batches/QA-2/items"));
        for (String f : List.of("strength_missing", "parse_partial", "route_assumed", "no_ddinter_data", "unaligned", "stage_warn", "stage_fail"))
            all.append(body("/v1/qa/records?filter=" + f));
        assertThat(all.toString()).doesNotContain(EMAIL).doesNotContain("SENTINEL-NOTE").doesNotContain("@").doesNotContain("reviewerEmail");
    }

    @Test void itIsReadOnly() throws Exception {
        long before = count(pg, "SELECT (SELECT count(*) FROM ops.audit_event) + (SELECT count(*) FROM ops.review_decision)");
        body("/v1/qa/records?filter=stage_warn");
        body("/v1/qa/batches/QA-1/items");
        assertThat(count(pg, "SELECT (SELECT count(*) FROM ops.audit_event) + (SELECT count(*) FROM ops.review_decision)")).isEqualTo(before);
        internal(web).post().uri("/v1/qa/records?filter=stage_warn").exchange().expectStatus().value(s -> assertThat(s).isIn(404, 405));
    }
}
