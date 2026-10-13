package com.niramoy.bddrug;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** Review decisions (spec §7.2): guards in order, idempotent requestId, audit rows, the approval rule, A1/A2. */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
@ExtendWith(OutputCaptureExtension.class)
class ReviewApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String PHARMACIST = "pharma.reviewer@example.org", ENGINEER = "eng.reviewer@example.org";
    static final String CHECK_FAILED = "A check failed on this record. It returns to review after the fix and re-run.";
    static final String ISSUE_OPEN = "An issue is open on this record. It returns to review after the fix and re-run.";

    /** Each test owns its batch so the tests stay independent. */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at)
            SELECT b, 1, now() - interval '1 hour' FROM unnest(ARRAY['R-eng','R-flow','R-iss','R-appr','R-rerun','R-val',
              'R-hist','R-rm','R-stale','R-tok','R-log','R-req','R-null','R-race','R-other','R-chk','R-pipe','R-idem',
              'R-conc','R-rej','R-bk','R-pend','R-back']) AS b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
             ('R-eng','DGDA-Drugs','D-1', now() - interval '1 hour'),
             ('R-flow','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-flow','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-iss','DGDA-Drugs','C-EYE', now() - interval '1 hour'),
             ('R-appr','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-rerun','DGDA-Drugs','N-1', now() - interval '1 hour'),
             ('R-val','DGDA-Drugs','W-2', now() - interval '1 hour'),
             ('R-hist','DGDA-Drugs','C-CAP', now() - interval '1 hour'),
             ('R-rm','DGDA-Drugs','X-NOSUB', now() - interval '1 hour'),
             ('R-stale','DGDA-Drugs','A-NOBDC', '2026-01-01T08:00:00.123456Z'),
             ('R-tok','DGDA-Drugs','X-NOMAP', now() - interval '1 hour'),
             ('R-log','DGDA-Drugs','X-NOMAP', now() - interval '1 hour'),
             ('R-req','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-null','DGDA-Drugs','W-1', NULL),
             ('R-race','DGDA-Drugs','C-EYE', now() - interval '1 hour'),
             ('R-other','DGDA-Drugs','W-2', now() - interval '1 hour'),
             ('R-chk','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-chk','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-idem','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-idem','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-conc','DGDA-Drugs','N-1', now() - interval '1 hour'),
             ('R-rej','DGDA-Drugs','W-1', now() - interval '1 hour'),
             -- R-idem, R-conc, R-rej, R-bk, R-pend and R-back are used by the tests Task 8b adds
             ('R-bk','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-pend','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-back','DGDA-Drugs','W-1', now() - interval '1 hour');
            -- an item that left the batch file but has history, and an item the pipeline could not load
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('R-rm','DGDA-Drugs','gone-id','issue','removed from batch file', now() - interval '2 hour'),
             ('R-pipe','DGDA-Drugs','typo-id','issue','not found at source', now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('R-rm','gone-id','issue','wrong product listed', 'old@example.org','pharmacist', now() - interval '90 minute');
            -- every current item ran its four checks without a failure, except the R-chk items below
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '' FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical'), ('ddinter')) AS s(stage)
            WHERE bi.note IS NULL AND bi.batch_id <> 'R-chk';
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
             ('R-chk','W-1','dgda','fail','error: RuntimeError: boom'), ('R-chk','W-1','substances','ok',''),
             ('R-chk','W-1','clinical','ok',''), ('R-chk','W-1','ddinter','ok',''),
             ('R-chk','A-1','dgda','ok',''), ('R-chk','A-1','substances','ok',''), ('R-chk','A-1','clinical','ok',''),
             ('R-pipe','typo-id','dgda','fail','not found at source');
            """);
    }

    @Autowired WebTestClient web;

    /** The version a reviewer's batch page shows for an item: its run stamp and newest decision id (nulls when none). */
    private record Shown(String extractedAt, Long lastDecisionId) {}

    private Shown shown(String batch, String concept) {
        var res = internal(web).get().uri("/v1/batches/{b}", batch).exchange().expectBody().returnResult();
        if (res.getStatus().value() != 200) return new Shown(null, null);
        String json = new String(res.getResponseBody(), StandardCharsets.UTF_8);
        String filter = "$.data.items[?(@.conceptId == '" + concept + "')].";
        List<String> stamps = JsonPath.read(json, filter + "extractedAt");
        List<Number> ids = JsonPath.read(json, filter + "lastDecisionId");
        return new Shown(stamps.isEmpty() ? null : stamps.get(0),
                         ids.isEmpty() || ids.get(0) == null ? null : ids.get(0).longValue());
    }

    /** Posts as the review form does: the shown version and a fresh requestId, unless the body already has the key. */
    private WebTestClient.ResponseSpec decide(String batch, String concept, Map<String, ?> body) {
        Map<String, Object> sent = new HashMap<>(body);
        Shown s = shown(batch, concept);
        if (!sent.containsKey("extractedAt")) sent.put("extractedAt", s.extractedAt());
        if (!sent.containsKey("expectedLastDecisionId")) sent.put("expectedLastDecisionId", s.lastDecisionId());
        if (!sent.containsKey("requestId")) sent.put("requestId", UUID.randomUUID().toString());
        return decideRaw(batch, concept, sent);
    }

    /** Posts the body exactly as given. */
    private WebTestClient.ResponseSpec decideRaw(String batch, String concept, Object body) {
        return internal(web).post().uri("/v1/batches/{b}/items/{c}/decisions", batch, concept)
            .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private static Map<String, Object> body(String decision, String note, String email, String role) {
        Map<String, Object> m = new HashMap<>();
        m.put("decision", decision);
        if (note != null) m.put("note", note);
        m.put("reviewerEmail", email);
        m.put("reviewerRole", role);
        return m;
    }

    private WebTestClient.BodyContentSpec expectDecision(String batch, String concept, Map<String, ?> body,
                                                         String review, String batchStatus) {
        return decide(batch, concept, body).expectStatus().isCreated().expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.batchId").isEqualTo(batch)
            .jsonPath("$.data.conceptId").isEqualTo(concept)
            .jsonPath("$.data.review").isEqualTo(review)
            .jsonPath("$.data.batchStatus").isEqualTo(batchStatus)
            .jsonPath("$.data.replayed").isEqualTo(false);
    }

    private void expectConflict(String batch, String concept, Map<String, ?> body, String field, String message) {
        decide(batch, concept, body).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("CONFLICT")
            .jsonPath("$.errors[0].field").isEqualTo(field)
            .jsonPath("$.errors[0].message").isEqualTo(message);
    }

    private String itemReview(String batch, String concept) throws Exception {
        return text(pg, "SELECT review FROM ops.batch_item WHERE batch_id = '" + batch + "' AND concept_id = '" + concept + "'");
    }

    private long decisions(String batch) throws Exception {
        return count(pg, "SELECT count(*) FROM ops.review_decision WHERE batch_id = '" + batch + "'");
    }

    // ---- the approval rule and the Outcome

    @Test void engineerOkDoesNotApproveAndASecondEngineerCheckIsRefused() throws Exception {
        Shown before = shown("R-eng", "D-1");
        byte[] res = expectDecision("R-eng", "D-1", body("ok", null, ENGINEER, "engineer"), "pending", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("engineer_checked")
            .returnResult().getResponseBody();
        String json = new String(res, StandardCharsets.UTF_8);
        assertThat((String) JsonPath.read(json, "$.data.version.extractedAt")).isEqualTo(before.extractedAt());
        assertThat(((Number) JsonPath.read(json, "$.data.version.lastDecisionId")).longValue())
            .isEqualTo(count(pg, "SELECT max(id) FROM ops.review_decision WHERE batch_id = 'R-eng'"));
        expectConflict("R-eng", "D-1", body("ok", null, "other.eng@example.org", "engineer"), "review",
            "Your check is already recorded for this record");
        assertThat(decisions("R-eng")).isEqualTo(1);
        assertThat(itemReview("R-eng", "D-1")).isEqualTo("pending");
        web.get().uri("/v1/products/D-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true);
    }

    @Test void batchStatusFollowsItsItems() throws Exception {
        expectDecision("R-flow", "W-1", body("ok", "", PHARMACIST, "pharmacist"), "ok", "in_review");
        expectDecision("R-flow", "A-1", body("ok", "label matches", PHARMACIST, "pharmacist"), "ok", "approved")
            .jsonPath("$.data.displayStatus").isEqualTo("approved");
        internal(web).get().uri("/v1/batches/R-flow").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.status").isEqualTo("approved")
            .jsonPath("$.data.items[0].review").isEqualTo("ok").jsonPath("$.data.items[1].review").isEqualTo("ok");
        // an issue is accepted on an approved record and reopens the item and the batch
        expectDecision("R-flow", "A-1", body("issue", "strength looks wrong", ENGINEER, "engineer"), "issue", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("issue");
        assertThat(itemReview("R-flow", "W-1")).isEqualTo("ok");
    }

    /** Step 6; replaces issueAfterOkIsIssueAndOnlyAPharmacistClearsIt. */
    @Test void okWhileAnIssueIsOpenIsRefused() throws Exception {
        expectDecision("R-iss", "C-EYE", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        expectDecision("R-iss", "C-EYE", body("issue", "route should be otic", PHARMACIST, "pharmacist"), "issue", "in_review");
        expectConflict("R-iss", "C-EYE", body("ok", null, ENGINEER, "engineer"), "review", ISSUE_OPEN);
        expectConflict("R-iss", "C-EYE", body("ok", "fixed upstream", PHARMACIST, "pharmacist"), "review", ISSUE_OPEN);
        assertThat(decisions("R-iss")).isEqualTo(2);
        assertThat(itemReview("R-iss", "C-EYE")).isEqualTo("issue");
    }

    /** Step 7. */
    @Test void okOnAnApprovedRecordIsRefused() throws Exception {
        expectDecision("R-appr", "A-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        expectConflict("R-appr", "A-1", body("ok", null, PHARMACIST, "pharmacist"), "review",
            "This record is already approved by a pharmacist");
        expectConflict("R-appr", "A-1", body("ok", null, ENGINEER, "engineer"), "review",
            "This record is already approved by a pharmacist");
        assertThat(decisions("R-appr")).isEqualTo(1);
    }

    @Test void reRunInvalidatesApprovalButKeepsHistory() throws Exception {
        expectDecision("R-rerun", "N-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").doesNotExist().jsonPath("$.data.tradeName").isEqualTo("Napa");

        // what bddrug_etl.load.batches.reopen_review does when the record is re-run
        exec(pg, """
            UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
             WHERE batch_id = 'R-rerun' AND concept_id = 'N-1';
            UPDATE ops.batch SET status = 'in_review' WHERE batch_id = 'R-rerun';""");

        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true).jsonPath("$.data.genericContentRaw").doesNotExist();
        internal(web).get().uri("/v1/batches/R-rerun/items/N-1/decisions").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(1).jsonPath("$.data[0].decision").isEqualTo("ok");

        expectDecision("R-rerun", "N-1", body("ok", null, ENGINEER, "engineer"), "pending", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("engineer_checked");
        expectDecision("R-rerun", "N-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        assertThat(decisions("R-rerun")).isEqualTo(3);
    }

    // ---- guards (steps 2 to 5)

    @Test void removedItemsDoNotHoldTheBatchBack() throws Exception {
        expectDecision("R-rm", "X-NOSUB", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        assertThat(itemReview("R-rm", "gone-id")).isEqualTo("issue");
    }

    /** Step 4. */
    @Test void decisionsOnARemovedRecordAreRefused() throws Exception {
        expectConflict("R-rm", "gone-id", body("ok", null, PHARMACIST, "pharmacist"), "conceptId",
            "This record was removed from the batch file");
        expectConflict("R-rm", "gone-id", body("issue", "still the wrong product", PHARMACIST, "pharmacist"), "conceptId",
            "This record was removed from the batch file");
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE concept_id = 'gone-id'")).isEqualTo(1);
    }

    /** Step 3. */
    @Test void anotherReviewersDecisionAfterThePageLoadedIsRefused() throws Exception {
        Shown before = shown("R-other", "W-2");
        expectDecision("R-other", "W-2", body("ok", null, ENGINEER, "engineer"), "pending", "in_review");
        Map<String, Object> late = body("ok", null, PHARMACIST, "pharmacist");
        late.put("expectedLastDecisionId", before.lastDecisionId());   // the page was loaded before the engineer's check
        expectConflict("R-other", "W-2", late, "lastDecisionId",
            "Another reviewer decided on this record after the page was loaded; reload it and review again");
        assertThat(decisions("R-other")).isEqualTo(1);
        // after a reload the pharmacist's approval is accepted
        expectDecision("R-other", "W-2", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
    }

    /** Step 5: a failed or missing check blocks ok but never an issue. */
    @Test void okWithAFailedOrMissingCheckIsRefusedButAnIssueIsAccepted() throws Exception {
        for (String concept : List.of("W-1", "A-1")) {
            expectConflict("R-chk", concept, body("ok", null, PHARMACIST, "pharmacist"), "stages", CHECK_FAILED);
            expectDecision("R-chk", concept, body("issue", "a check failed upstream", PHARMACIST, "pharmacist"),
                "issue", "in_review");
        }
        assertThat(decisions("R-chk")).isEqualTo(2);
    }

    /** The pipeline's own issue (not found at source) is pending with a failed check: ok is a 409 on stages. */
    @Test void aPipelineSetIssueRefusesOkOnStagesAndTakesAReviewersIssue() throws Exception {
        expectConflict("R-pipe", "typo-id", body("ok", null, PHARMACIST, "pharmacist"), "stages", CHECK_FAILED);
        expectDecision("R-pipe", "typo-id", body("issue", "concept id is a typo", PHARMACIST, "pharmacist"), "issue", "in_review")
            .jsonPath("$.data.displayStatus").isEqualTo("issue");
    }

    @Test void anItemWithNoRunStampCannotBeApprovedButTakesAnIssue() throws Exception {
        Map<String, Object> stamped = body("ok", null, PHARMACIST, "pharmacist");
        stamped.put("extractedAt", "2026-01-01T08:00:00Z");
        expectConflict("R-null", "W-1", stamped, "extractedAt",
            "This record was re-run after the page was loaded; reload it and review again");
        Map<String, Object> explicitNull = body("ok", null, PHARMACIST, "pharmacist");
        explicitNull.put("extractedAt", null);
        expectConflict("R-null", "W-1", explicitNull, "stages", CHECK_FAILED);
        Map<String, Object> issue = body("issue", "no pipeline run recorded", PHARMACIST, "pharmacist");
        issue.put("extractedAt", null);
        decide("R-null", "W-1", issue).expectStatus().isCreated().expectBody().jsonPath("$.data.review").isEqualTo("issue");
        assertThat(decisions("R-null")).isEqualTo(1);
    }

    @Test void staleExtractedAtIsRejectedWith409() throws Exception {
        Map<String, Object> stale = body("ok", null, PHARMACIST, "pharmacist");
        stale.put("extractedAt", "2026-01-01T07:00:00Z");
        decide("R-stale", "A-NOBDC", stale).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("CONFLICT").jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        assertThat(decisions("R-stale")).isZero();
        internal(web).get().uri("/v1/batches/R-stale").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.items[0].extractedAt").isEqualTo("2026-01-01T08:00:00.123456Z");
        Map<String, Object> current = body("ok", null, PHARMACIST, "pharmacist");
        current.put("extractedAt", "2026-01-01T08:00:00.123456Z");
        expectDecision("R-stale", "A-NOBDC", current, "ok", "approved");
    }

    @Test void anExplicitNullOnAStampedItemIs409() throws Exception {
        Map<String, Object> explicitNull = body("ok", null, PHARMACIST, "pharmacist");
        explicitNull.put("extractedAt", null);
        decide("R-req", "W-1", explicitNull).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        assertThat(decisions("R-req")).isZero();
    }

    /** The page is loaded, the ETL re-runs the record and commits, then the pharmacist presses ok. */
    @Test void okOnAPageLoadedBeforeAReRunIs409AndPublishesNothing() throws Exception {
        String onScreen = shown("R-race", "C-EYE").extractedAt();
        assertThat(onScreen).isNotNull();
        exec(pg, """
            UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
             WHERE batch_id = 'R-race' AND concept_id = 'C-EYE';
            UPDATE ops.batch SET status = 'in_review' WHERE batch_id = 'R-race';""");
        Map<String, Object> stale = body("ok", null, PHARMACIST, "pharmacist");
        stale.put("extractedAt", onScreen);
        decide("R-race", "C-EYE", stale).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        // leaving the field out is no way around it
        decideRaw("R-race", "C-EYE", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isBadRequest();
        assertThat(decisions("R-race")).isZero();
        assertThat(text(pg, "SELECT status FROM ops.batch WHERE batch_id = 'R-race'")).isEqualTo("in_review");
        expectDecision("R-race", "C-EYE", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
    }

    // ---- validation

    private void expectInvalid(Map<String, ?> body, String field) {
        decide("R-val", "W-2", body).expectStatus().isBadRequest().expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
            .jsonPath("$.errors[0].field").isEqualTo(field);
    }

    @Test void validationRejectsBadDecisionsWithoutWriting() throws Exception {
        expectInvalid(body("issue", null, PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("issue", "bad", PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("issue", "    x    ", PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("issue", "n".repeat(1001), PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("ok", "n".repeat(1001), PHARMACIST, "pharmacist"), "note");
        expectInvalid(body("ok", null, "not-an-email", "pharmacist"), "reviewerEmail");
        expectInvalid(body("ok", null, null, "pharmacist"), "reviewerEmail");
        expectInvalid(body("ok", null, PHARMACIST, "user"), "reviewerRole");
        expectInvalid(body("ok", null, PHARMACIST, null), "reviewerRole");
        expectInvalid(body("maybe", null, PHARMACIST, "pharmacist"), "decision");
        decideRaw("R-val", "W-2", Map.of()).expectStatus().isBadRequest();
        internal(web).post().uri("/v1/batches/R-val/items/W-2/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{not json").exchange().expectStatus().isBadRequest();

        Shown s = shown("R-val", "W-2");
        Map<String, Object> noId = body("ok", null, PHARMACIST, "pharmacist");
        noId.put("extractedAt", s.extractedAt());
        noId.put("requestId", UUID.randomUUID().toString());
        decideRaw("R-val", "W-2", noId).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("expectedLastDecisionId");
        for (Object bad : new Object[]{"7", 1.5, 0, -3, true}) {
            Map<String, Object> m = new HashMap<>(noId);
            m.put("expectedLastDecisionId", bad);
            decideRaw("R-val", "W-2", m).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("expectedLastDecisionId");
        }
        Map<String, Object> noRequest = body("ok", null, PHARMACIST, "pharmacist");
        noRequest.put("extractedAt", s.extractedAt());
        noRequest.put("expectedLastDecisionId", null);
        decideRaw("R-val", "W-2", noRequest).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        for (Object bad : new Object[]{"not-a-uuid", "", "1-1-1-1-1", 12345}) {
            Map<String, Object> m = new HashMap<>(noRequest);
            m.put("requestId", bad);
            decideRaw("R-val", "W-2", m).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        }
        assertThat(decisions("R-val")).isZero();
        // boundaries are accepted
        expectDecision("R-val", "W-2", body("issue", "12345", PHARMACIST, "pharmacist"), "issue", "in_review");
        expectDecision("R-val", "W-2", body("issue", "n".repeat(1000), ENGINEER, "engineer"), "issue", "in_review");
        assertThat(decisions("R-val")).isEqualTo(2);
    }

    @Test void missingExtractedAtIs400AndWritesNothing() throws Exception {
        for (Map<String, Object> b : List.of(body("ok", null, PHARMACIST, "pharmacist"),
                                             body("issue", "strength looks wrong", PHARMACIST, "pharmacist"))) {
            decideRaw("R-req", "W-1", b).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
                .jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        }
        assertThat(decisions("R-req")).isZero();
        assertThat(itemReview("R-req", "W-1")).isEqualTo("pending");
    }

    @Test void malformedExtractedAtIs400() throws Exception {
        for (Object bad : new Object[]{"yesterday", "", 1767254400, true, List.of("2026-01-01T08:00:00Z")}) {
            Map<String, Object> b = body("ok", null, PHARMACIST, "pharmacist");
            b.put("extractedAt", bad);
            decideRaw("R-req", "W-1", b).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        }
        assertThat(decisions("R-req")).isZero();
    }

    @Test void unknownBatchItemIs404() throws Exception {
        decide("R-val", "nope", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
        decide("nope", "W-2", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isNotFound();
        internal(web).get().uri("/v1/batches/R-val/items/nope/decisions").exchange().expectStatus().isNotFound();
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE concept_id = 'nope' OR batch_id = 'nope'")).isZero();
    }

    // ---- token and privacy

    @Test void missingOrWrongTokenIs401AndWritesNothing() throws Exception {
        var ok = body("ok", null, PHARMACIST, "pharmacist");
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(ok).exchange().expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED").jsonPath("$.metadata.requestId").exists();
        for (String wrong : new String[]{TOKEN + "x", TOKEN.substring(1), ""})
            web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, wrong)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(ok).exchange().expectStatus().isUnauthorized();
        // the token is checked before validation: an invalid body without a token is still 401
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of()).exchange().expectStatus().isUnauthorized();
        web.get().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, "wrong")
            .exchange().expectStatus().isUnauthorized();
        web.get().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").exchange().expectStatus().isUnauthorized();
        assertThat(decisions("R-tok")).isZero();
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE target_id = 'R-tok/X-NOMAP'")).isZero();
    }

    @Test void decisionHistoryNeedsTheTokenAndIsNewestFirst() throws Exception {
        decide("R-hist", "C-CAP", body("ok", null, ENGINEER, "engineer")).expectStatus().isCreated();
        decide("R-hist", "C-CAP", body("issue", "dose form mismatch", PHARMACIST, "pharmacist")).expectStatus().isCreated();
        for (String uri : new String[]{"/v1/batches/R-hist/items/C-CAP/decisions", "/v1/batches/R-hist",
                                       "/v1/batches/R-hist/report", "/v1/batches"})
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        internal(web).get().uri("/v1/batches/R-hist/items/C-CAP/decisions").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(2)
            .jsonPath("$.data[0].decision").isEqualTo("issue")
            .jsonPath("$.data[0].note").isEqualTo("dose form mismatch")
            .jsonPath("$.data[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data[0].reviewerEmail").isEqualTo(PHARMACIST)
            .jsonPath("$.data[1].reviewerEmail").isEqualTo(ENGINEER);
        for (String uri : new String[]{"/v1/products/C-CAP", "/v1/substances/BDS-000003"}) {
            byte[] page = web.get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            assertThat(new String(page, StandardCharsets.UTF_8)).as(uri).doesNotContain("@");
        }
    }

    @Test void reviewerEmailsNeverReachTheLogs(CapturedOutput output) throws Exception {
        String email = "log.canary.reviewer@example.org";
        decide("R-log", "X-NOMAP", body("ok", null, email, "pharmacist")).expectStatus().isCreated();
        decide("R-log", "X-NOMAP", body("ok", null, email, "pharmacist")).expectStatus().isEqualTo(409);
        decide("R-log", "unknown-item", body("ok", null, email, "pharmacist")).expectStatus().isNotFound();
        decide("R-log", "X-NOMAP", body("issue", "abc", email, "pharmacist")).expectStatus().isBadRequest();
        decide("R-log", "X-NOMAP", body("ok", null, email, "admin")).expectStatus().isBadRequest();
        web.post().uri("/v1/batches/R-log/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body("ok", null, email, "pharmacist")).exchange().expectStatus().isUnauthorized();
        internal(web).get().uri("/v1/batches/R-log/items/X-NOMAP/decisions").exchange().expectStatus().isOk();
        assertThat(output.getAll()).doesNotContain(email).doesNotContain(TOKEN);
    }
}
