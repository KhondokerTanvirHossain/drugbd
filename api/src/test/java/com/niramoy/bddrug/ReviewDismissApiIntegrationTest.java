package com.niramoy.bddrug;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
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

/** §7.2 P1C: the senior role and the dismiss decision (§5.10a, D57), §11.3 "ReviewApiIntegrationTest (dismiss)". */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ReviewDismissApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org", PHARMACIST = "pharma.reviewer@example.org";
    static final String NOTE = "The strength matches the register; the report misread it";

    /** Each test owns its batch. X-* items carry an open reviewer issue reported after the stamp. */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at)
            SELECT b, 1, now() - interval '1 hour' FROM unnest(ARRAY['X-ok','X-role','X-note','X-pend','X-appr','X-pipe',
              'X-rm','X-stale','X-other','X-replay','X-again','X-rej']) AS b;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('X-ok','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-role','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-note','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-pend','DGDA-Drugs','W-1','pending',NULL, now() - interval '1 hour'),
             ('X-appr','DGDA-Drugs','A-1','ok',NULL, now() - interval '1 hour'),
             ('X-pipe','DGDA-Drugs','typo-id','issue','not found at source', now() - interval '1 hour'),
             ('X-rm','DGDA-Drugs','gone-id','issue','removed from batch file', now() - interval '1 hour'),
             ('X-stale','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-other','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-replay','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-again','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour'),
             ('X-rej','DGDA-Drugs','W-1','issue',NULL, now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at)
            SELECT b, c, 'issue', 'strength should read 10 mg', 'eng.reviewer@example.org', 'engineer', now() - interval '30 minute'
              FROM (VALUES ('X-ok','W-1'), ('X-role','W-1'), ('X-note','W-1'), ('X-rm','gone-id'), ('X-stale','W-1'),
                           ('X-other','W-1'), ('X-replay','W-1'), ('X-again','W-1'), ('X-rej','W-1')) AS v(b, c);
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('X-appr','A-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '30 minute'),
             ('X-ok','W-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '40 minute');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note)
            SELECT bi.batch_id, bi.concept_id, s.stage, 'ok', '' FROM ops.batch_item bi
            CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical'), ('ddinter')) AS s(stage)
            WHERE bi.note IS NULL AND bi.batch_id LIKE 'X-%';
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
             ('X-pipe','typo-id','dgda','fail','not found at source');
            """);
    }

    @Autowired WebTestClient web;

    private record Shown(String extractedAt, Long lastDecisionId) {}

    /** The version the reviewer's page shows, read from the token-gated batch read (as ReviewApiIntegrationTest does). */
    private Shown shown(String batch, String concept) {
        var res = internal(web).get().uri("/v1/batches/{b}", batch).exchange().expectBody().returnResult();
        String json = new String(res.getResponseBody(), StandardCharsets.UTF_8);
        String filter = "$.data.items[?(@.conceptId == '" + concept + "')].";
        List<String> stamps = JsonPath.read(json, filter + "extractedAt");
        List<Number> ids = JsonPath.read(json, filter + "lastDecisionId");
        return new Shown(stamps.isEmpty() ? null : stamps.get(0), ids.isEmpty() || ids.get(0) == null ? null : ids.get(0).longValue());
    }

    private static Map<String, Object> body(String decision, String note, String email, String role) {
        Map<String, Object> m = new HashMap<>();
        m.put("decision", decision);
        m.put("note", note);
        m.put("reviewerEmail", email);
        m.put("reviewerRole", role);
        return m;
    }

    private WebTestClient.ResponseSpec decide(String batch, String concept, Map<String, Object> body) {
        Shown s = shown(batch, concept);
        body.putIfAbsent("extractedAt", s.extractedAt());
        body.putIfAbsent("expectedLastDecisionId", s.lastDecisionId());
        body.putIfAbsent("requestId", UUID.randomUUID().toString());
        return internal(web).post().uri("/v1/batches/{b}/items/{c}/decisions", batch, concept)
            .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private String review(String batch, String concept) throws Exception {
        return text(pg, "SELECT review FROM ops.batch_item WHERE batch_id = '" + batch + "' AND concept_id = '" + concept + "'");
    }

    @Test void aSeniorDismissesAnOpenIssueAndTheRecordIsPendingNotApproved() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> b = body("dismiss", NOTE, SENIOR, "senior");
        b.put("requestId", rid);
        decide("X-ok", "W-1", b).expectStatus().isCreated().expectBody()
            .jsonPath("$.data.review").isEqualTo("pending")
            .jsonPath("$.data.displayStatus").isEqualTo("pending")
            .jsonPath("$.data.replayed").isEqualTo(false)
            .jsonPath("$.data.version.lastDecisionId").isNumber();
        assertThat(review("X-ok", "W-1")).isEqualTo("pending");   // the pharmacist's ok before the issue does not come back
        assertThat(text(pg, "SELECT decision || '|' || reviewer_role || '|' || note FROM ops.review_decision " +
            "WHERE batch_id = 'X-ok' ORDER BY id DESC LIMIT 1")).isEqualTo("dismiss|senior|" + NOTE);
        assertThat(text(pg, "SELECT outcome || '|' || actor_role || '|' || target_id FROM ops.audit_event " +
            "WHERE event = 'decision' AND request_id = '" + rid + "'")).isEqualTo("dismiss|senior|X-ok/W-1");
    }

    @Test void onlyASeniorMayDismiss() throws Exception {
        for (String role : List.of("pharmacist", "engineer"))
            decide("X-role", "W-1", body("dismiss", NOTE, PHARMACIST, role)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
                .jsonPath("$.errors[0].field").isEqualTo("reviewerRole")
                .jsonPath("$.errors[0].message").isEqualTo("Only a senior pharmacist can dismiss an issue");
        assertThat(review("X-role", "W-1")).isEqualTo("issue");
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision_rejected' AND target_id = 'X-role/W-1'"))
            .isEqualTo(2);
    }

    @Test void aDismissalNeedsFiveCharactersCountedInCodePoints() {
        decide("X-note", "W-1", body("dismiss", "abcd", SENIOR, "senior")).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("note");
        decide("X-note", "W-1", body("dismiss", "😀😀😀😀", SENIOR, "senior")).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("note");
        decide("X-note", "W-1", body("dismiss", "ভুল রিপোর্ট", SENIOR, "senior")).expectStatus().isCreated();
    }

    @Test void noOpenReviewerIssueIs409Review() throws Exception {
        for (String[] t : new String[][]{{"X-pend", "W-1"}, {"X-appr", "A-1"}, {"X-pipe", "typo-id"}})
            decide(t[0], t[1], body("dismiss", NOTE, SENIOR, "senior")).expectStatus().isEqualTo(409).expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("review")
                .jsonPath("$.errors[0].message").isEqualTo("No issue is open on this record");
        assertThat(review("X-appr", "A-1")).isEqualTo("ok");
        assertThat(review("X-pipe", "typo-id")).isEqualTo("issue");
    }

    @Test void aRemovedRecordIs409ConceptId() {
        decide("X-rm", "gone-id", body("dismiss", NOTE, SENIOR, "senior")).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("conceptId");
    }

    @Test void aStalePageIs409OnTheVersionFields() {
        Map<String, Object> b = body("dismiss", NOTE, SENIOR, "senior");
        b.put("extractedAt", "2020-01-01T00:00:00Z");
        decide("X-stale", "W-1", b).expectStatus().isEqualTo(409).expectBody().jsonPath("$.errors[0].field").isEqualTo("extractedAt");
        Map<String, Object> o = body("dismiss", NOTE, SENIOR, "senior");
        o.put("expectedLastDecisionId", 1);
        decide("X-other", "W-1", o).expectStatus().isEqualTo(409).expectBody().jsonPath("$.errors[0].field").isEqualTo("lastDecisionId");
    }

    @Test void aRepeatedRequestIdIsAReplayWithOneRow() throws Exception {
        Map<String, Object> b = body("dismiss", NOTE, SENIOR, "senior");
        b.put("requestId", UUID.randomUUID().toString());
        Shown s = shown("X-replay", "W-1");
        b.put("extractedAt", s.extractedAt());
        b.put("expectedLastDecisionId", s.lastDecisionId());
        decide("X-replay", "W-1", new HashMap<>(b)).expectStatus().isCreated();
        decide("X-replay", "W-1", new HashMap<>(b)).expectStatus().isOk().expectBody().jsonPath("$.data.replayed").isEqualTo(true);
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE batch_id = 'X-replay' AND decision = 'dismiss'")).isEqualTo(1);
        // the same requestId for another decision is refused
        Map<String, Object> other = new HashMap<>(b);
        other.put("decision", "issue");
        decide("X-replay", "W-1", other).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
    }

    @Test void afterADismissalASeniorApprovesWithA() throws Exception {
        decide("X-again", "W-1", body("dismiss", NOTE, SENIOR, "senior")).expectStatus().isCreated();
        decide("X-again", "W-1", body("ok", "", SENIOR, "senior")).expectStatus().isCreated().expectBody()
            .jsonPath("$.data.review").isEqualTo("ok").jsonPath("$.data.displayStatus").isEqualTo("approved")
            .jsonPath("$.data.batchStatus").isEqualTo("approved");
        assertThat(review("X-again", "W-1")).isEqualTo("ok");
    }

    @Test void aRefusedDismissalLeavesExactlyOneRejectedRow() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> b = body("dismiss", "abc", SENIOR, "senior");
        b.put("requestId", rid);
        decide("X-rej", "W-1", b).expectStatus().isBadRequest();
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'decision_rejected' AND request_id = '" + rid + "'"))
            .isEqualTo(1);
        assertThat(text(pg, "SELECT actor_role FROM ops.audit_event WHERE request_id = '" + rid + "'")).isEqualTo("senior");
    }
}
