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
import java.util.Collections;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class BatchReportApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('RP', 4), ('RP-one', 1);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note) VALUES
             ('RP','DGDA-Drugs','W-1','ok',NULL), ('RP','DGDA-Drugs','A-1','pending',NULL),
             ('RP','DGDA-Drugs','typo','issue','not found at source'), ('RP','DGDA-Drugs','D-1','pending',NULL),
             ('RP','DGDA-Drugs','gone','ok','removed from batch file'),
             ('RP-one','DGDA-Drugs','N-1','pending',NULL);
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
             ('RP','W-1','dgda','ok',''), ('RP','A-1','dgda','ok',''), ('RP','D-1','dgda','ok',''),
             ('RP','typo','dgda','fail','not found at source'),
             ('RP','W-1','ddinter','ok',''), ('RP','A-1','ddinter','warn','DDInter DDInter20 matched by name only'),
             ('RP','D-1','ddinter','warn','No interaction data in DDInter for this substance'),
             ('RP','W-1','substances','ok',''), ('RP','A-1','substances','ok',''),
             ('RP','D-1','substances','fail','error: RuntimeError: boom');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) VALUES
             ('RP','W-1','ok','','p@example.org','pharmacist'), ('RP','W-1','issue','label differs','p@example.org','pharmacist');
            INSERT INTO ops.batch_run (batch_id, run_at, stages, counts, concept_ids) VALUES
             ('RP', now() - interval '7 hour', '{dgda}', '{"dgda": {"ok": 1, "warn": 0, "fail": 0}}', '{}'),
             ('RP', now() - interval '6 hour', '{dgda,ddinter}',
              '{"dgda": {"ok": 2, "warn": 0, "fail": 2}, "ddinter": {"ok": 0, "warn": 1, "fail": 1}}', '{}'),
             ('RP', now() - interval '5 hour', '{dgda}', '{"dgda": {"ok": 1, "warn": 0, "fail": 0}}', '{W-1}'),
             ('RP', now() - interval '4 hour', '{dgda,substances,ddinter}',
              '{"dgda": {"ok": 3, "warn": 0, "fail": 1}, "substances": {"ok": 2, "warn": 0, "fail": 1}, "ddinter": {"ok": 1, "warn": 2, "fail": 0}}', '{}'),
             ('RP', now() - interval '3 hour', '{ddinter}', '{"ddinter": {"ok": 1, "warn": 0, "fail": 0}}', '{A-1}'),
             ('RP', now() - interval '2 hour', '{ddinter}', '{"ddinter": {"ok": 0, "warn": 1, "fail": 0}}', '{D-1}'),
             ('RP-one', now(), '{dgda}', '{"dgda": {"ok": 1, "warn": 0, "fail": 0}}', '{}');
            """);
    }

    @Autowired WebTestClient web;

    @Test void reportCountsStagesReviewsWarningsAndFails() {
        internal(web).get().uri("/v1/batches/RP/report").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.batchId").isEqualTo("RP")
            .jsonPath("$.data.counts.dgda.ok").isEqualTo(3)
            .jsonPath("$.data.counts.dgda.warn").isEqualTo(0)
            .jsonPath("$.data.counts.dgda.fail").isEqualTo(1)
            .jsonPath("$.data.counts.substances.ok").isEqualTo(2)
            .jsonPath("$.data.counts.substances.fail").isEqualTo(1)
            .jsonPath("$.data.counts.ddinter.ok").isEqualTo(1)
            .jsonPath("$.data.counts.ddinter.warn").isEqualTo(2)
            .jsonPath("$.data.counts.clinical").doesNotExist()
            // removed items do not count in the review totals
            .jsonPath("$.data.review.pending").isEqualTo(2)
            .jsonPath("$.data.review.ok").isEqualTo(1)
            .jsonPath("$.data.review.issue").isEqualTo(1)
            .jsonPath("$.data.warnings.length()").isEqualTo(2)
            .jsonPath("$.data.warnings[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.warnings[0].stage").isEqualTo("ddinter")
            .jsonPath("$.data.warnings[0].note").isEqualTo("DDInter DDInter20 matched by name only")
            .jsonPath("$.data.warnings[1].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.fails.length()").isEqualTo(2)
            .jsonPath("$.data.fails[0].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.fails[0].stage").isEqualTo("substances")
            .jsonPath("$.data.fails[0].note").isEqualTo("error: RuntimeError: boom")
            .jsonPath("$.data.fails[1].conceptId").isEqualTo("typo")
            .jsonPath("$.data.fails[1].stage").isEqualTo("dgda");
    }

    @Test void reportListsTheLastFiveRunsNewestFirst() {
        internal(web).get().uri("/v1/batches/RP/report").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.runs.length()").isEqualTo(5)
            .jsonPath("$.data.runs[0].stages[0]").isEqualTo("ddinter")
            .jsonPath("$.data.runs[0].conceptIds[0]").isEqualTo("D-1")
            .jsonPath("$.data.runs[0].counts.ddinter.warn").isEqualTo(1)
            .jsonPath("$.data.runs[0].runAt").exists()
            .jsonPath("$.data.runs[0].id").isNumber()
            .jsonPath("$.data.runs[2].stages.length()").isEqualTo(3)
            .jsonPath("$.data.runs[2].conceptIds.length()").isEqualTo(0)
            .jsonPath("$.data.runs[4].counts.ddinter.fail").isEqualTo(1);
    }

    @Test void deltaIsBetweenTheLastTwoFullRuns() {
        // last full run (4 h ago) minus the previous full run (6 h ago); single-record runs are skipped
        internal(web).get().uri("/v1/batches/RP/report").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.deltaVsPrevious.dgda.ok").isEqualTo(1)
            .jsonPath("$.data.deltaVsPrevious.dgda.warn").isEqualTo(0)
            .jsonPath("$.data.deltaVsPrevious.dgda.fail").isEqualTo(-1)
            .jsonPath("$.data.deltaVsPrevious.substances.ok").isEqualTo(2)
            .jsonPath("$.data.deltaVsPrevious.substances.fail").isEqualTo(1)
            .jsonPath("$.data.deltaVsPrevious.ddinter.ok").isEqualTo(1)
            .jsonPath("$.data.deltaVsPrevious.ddinter.warn").isEqualTo(1)
            .jsonPath("$.data.deltaVsPrevious.ddinter.fail").isEqualTo(-1);
    }

    @Test void deltaIsNullWithFewerThanTwoFullRuns() {
        internal(web).get().uri("/v1/batches/RP-one/report").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.runs.length()").isEqualTo(1)
            .jsonPath("$.data.deltaVsPrevious").doesNotExist()
            .jsonPath("$.data.counts.length()").isEqualTo(0)
            .jsonPath("$.data.review.pending").isEqualTo(1)
            .jsonPath("$.data.review.ok").isEqualTo(0)
            .jsonPath("$.data.warnings.length()").isEqualTo(0);
    }

    @Test void unknownBatchIs404() {
        internal(web).get().uri("/v1/batches/nope/report").exchange().expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
    }
    @Test void batchReadsNeedTheToken() {
        for (String uri : List.of("/v1/batches", "/v1/batches/RP", "/v1/batches/RP/report"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
    }

    @Test void batchItemsCarryTheirLastDecisionId() throws Exception {
        long last = count(pg, "SELECT max(id) FROM ops.review_decision WHERE batch_id = 'RP' AND concept_id = 'W-1'");
        internal(web).get().uri("/v1/batches/RP").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.items[?(@.conceptId == 'W-1')].lastDecisionId").isEqualTo(List.of((int) last))
            .jsonPath("$.data.items[?(@.conceptId == 'A-1')].lastDecisionId").isEqualTo(Collections.singletonList(null));
    }
}
