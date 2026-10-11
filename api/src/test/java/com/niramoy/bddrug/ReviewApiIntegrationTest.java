package com.niramoy.bddrug;

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
import java.util.Map;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** Review decisions, the approval rule, batch status, decision history and the internal token (Review Focus 3, 4). */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
@ExtendWith(OutputCaptureExtension.class)
class ReviewApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String PHARMACIST = "pharma.reviewer@example.org", ENGINEER = "eng.reviewer@example.org";

    /** Each test owns its batch (and its products) so the tests stay independent. */
    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES
             ('R-eng',1, now() - interval '1 hour'), ('R-flow',2, now() - interval '1 hour'),
             ('R-iss',1, now() - interval '1 hour'), ('R-rerun',1, now() - interval '1 hour'),
             ('R-val',1, now() - interval '1 hour'), ('R-hist',1, now() - interval '1 hour'),
             ('R-rm',1, now() - interval '1 hour'), ('R-stale',1, now() - interval '1 hour'),
             ('R-tok',1, now() - interval '1 hour'), ('R-log',1, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
             ('R-eng','DGDA-Drugs','D-1', now() - interval '1 hour'),
             ('R-flow','DGDA-Drugs','W-1', now() - interval '1 hour'),
             ('R-flow','DGDA-Drugs','A-1', now() - interval '1 hour'),
             ('R-iss','DGDA-Drugs','C-EYE', now() - interval '1 hour'),
             ('R-rerun','DGDA-Drugs','N-1', now() - interval '1 hour'),
             ('R-val','DGDA-Drugs','W-2', now() - interval '1 hour'),
             ('R-hist','DGDA-Drugs','C-CAP', now() - interval '1 hour'),
             ('R-rm','DGDA-Drugs','X-NOSUB', now() - interval '1 hour'),
             ('R-stale','DGDA-Drugs','A-NOBDC', '2026-01-01T08:00:00.123456Z'),
             ('R-tok','DGDA-Drugs','X-NOMAP', now() - interval '1 hour'),
             ('R-log','DGDA-Drugs','X-NOMAP', now() - interval '1 hour');
            -- an item that left the batch file but has history: it does not hold the batch back
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('R-rm','DGDA-Drugs','gone-id','issue','removed from batch file', now() - interval '2 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('R-rm','gone-id','issue','wrong product listed', 'old@example.org','pharmacist', now() - interval '90 minute');
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.ResponseSpec decide(String batch, String concept, Map<String, ?> body) {
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
            .jsonPath("$.data.batchStatus").isEqualTo(batchStatus);
    }

    private String itemReview(String batch, String concept) throws Exception {
        return text(pg, "SELECT review FROM ops.batch_item WHERE batch_id = '" + batch + "' AND concept_id = '" + concept + "'");
    }

    private long decisions(String batch) throws Exception {
        return count(pg, "SELECT count(*) FROM ops.review_decision WHERE batch_id = '" + batch + "'");
    }

    @Test void engineerOkAloneDoesNotApprove() throws Exception {
        expectDecision("R-eng", "D-1", body("ok", null, ENGINEER, "engineer"), "pending", "in_review");
        assertThat(itemReview("R-eng", "D-1")).isEqualTo("pending");
        assertThat(text(pg, "SELECT status FROM ops.batch WHERE batch_id = 'R-eng'")).isEqualTo("in_review");
        assertThat(decisions("R-eng")).isEqualTo(1);
        // the product stays hidden from anonymous visitors
        web.get().uri("/v1/products/D-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true).jsonPath("$.data.reviewStatus").isEqualTo("pending");
    }

    @Test void batchStatusFollowsItsItems() throws Exception {
        expectDecision("R-flow", "W-1", body("ok", "", PHARMACIST, "pharmacist"), "ok", "in_review");
        expectDecision("R-flow", "A-1", body("ok", "label matches", PHARMACIST, "pharmacist"), "ok", "approved");
        assertThat(text(pg, "SELECT status FROM ops.batch WHERE batch_id = 'R-flow'")).isEqualTo("approved");
        web.get().uri("/v1/batches/R-flow").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.status").isEqualTo("approved")
            .jsonPath("$.data.items[0].review").isEqualTo("ok").jsonPath("$.data.items[1].review").isEqualTo("ok");
        // an engineer issue after the approval reopens the item and the batch
        expectDecision("R-flow", "A-1", body("issue", "strength looks wrong", ENGINEER, "engineer"), "issue", "in_review");
        assertThat(itemReview("R-flow", "A-1")).isEqualTo("issue");
        assertThat(itemReview("R-flow", "W-1")).isEqualTo("ok");
    }

    @Test void issueAfterOkIsIssueAndOnlyAPharmacistClearsIt() {
        expectDecision("R-iss", "C-EYE", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        expectDecision("R-iss", "C-EYE", body("issue", "route should be otic", PHARMACIST, "pharmacist"), "issue", "in_review");
        expectDecision("R-iss", "C-EYE", body("ok", null, ENGINEER, "engineer"), "pending", "in_review");
        expectDecision("R-iss", "C-EYE", body("ok", "fixed upstream", PHARMACIST, "pharmacist"), "ok", "approved");
    }

    @Test void reRunInvalidatesApprovalButKeepsHistory() throws Exception {
        // Review Focus 3 at API level
        expectDecision("R-rerun", "N-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").doesNotExist().jsonPath("$.data.tradeName").isEqualTo("Napa")
            .jsonPath("$.data.reviewStatus").isEqualTo("ok");

        // what bddrug_etl.load.batches.reopen_review does when the record is re-run
        exec(pg, """
            UPDATE ops.batch_item SET review = 'pending', extracted_at = clock_timestamp()
             WHERE batch_id = 'R-rerun' AND concept_id = 'N-1';
            UPDATE ops.batch SET status = 'in_review' WHERE batch_id = 'R-rerun';""");

        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true).jsonPath("$.data.reviewStatus").isEqualTo("pending")
            .jsonPath("$.data.genericContentRaw").doesNotExist();
        web.get().uri("/v1/batches/R-rerun/items/N-1/decisions").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(1).jsonPath("$.data[0].decision").isEqualTo("ok");

        // the pre-run pharmacist ok no longer counts: an engineer ok now leaves it pending
        expectDecision("R-rerun", "N-1", body("ok", null, ENGINEER, "engineer"), "pending", "in_review");
        // a pharmacist ok after the re-run approves again
        expectDecision("R-rerun", "N-1", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").doesNotExist().jsonPath("$.data.tradeName").isEqualTo("Napa");
        assertThat(decisions("R-rerun")).isEqualTo(3);
    }

    @Test void removedItemsDoNotHoldTheBatchBack() throws Exception {
        expectDecision("R-rm", "X-NOSUB", body("ok", null, PHARMACIST, "pharmacist"), "ok", "approved");
        assertThat(itemReview("R-rm", "gone-id")).isEqualTo("issue");
    }

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
        decide("R-val", "W-2", Map.of()).expectStatus().isBadRequest();
        internal(web).post().uri("/v1/batches/R-val/items/W-2/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{not json").exchange().expectStatus().isBadRequest();
        assertThat(decisions("R-val")).isZero();
        // boundaries are accepted
        expectDecision("R-val", "W-2", body("issue", "12345", PHARMACIST, "pharmacist"), "issue", "in_review");
        expectDecision("R-val", "W-2", body("issue", "n".repeat(1000), ENGINEER, "engineer"), "issue", "in_review");
        assertThat(decisions("R-val")).isEqualTo(2);
    }

    @Test void unknownBatchItemIs404() throws Exception {
        decide("R-val", "nope", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
        decide("nope", "W-2", body("ok", null, PHARMACIST, "pharmacist")).expectStatus().isNotFound();
        web.get().uri("/v1/batches/R-val/items/nope/decisions").exchange().expectStatus().isNotFound();
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE concept_id = 'nope' OR batch_id = 'nope'")).isZero();
    }

    @Test void missingOrWrongTokenIs401AndWritesNothing() throws Exception {
        var ok = body("ok", null, PHARMACIST, "pharmacist");
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(ok).exchange().expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED")
            .jsonPath("$.metadata.requestId").exists();
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, TOKEN + "x")
            .contentType(MediaType.APPLICATION_JSON).bodyValue(ok).exchange().expectStatus().isUnauthorized();
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, TOKEN.substring(1))
            .contentType(MediaType.APPLICATION_JSON).bodyValue(ok).exchange().expectStatus().isUnauthorized();
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, "")
            .contentType(MediaType.APPLICATION_JSON).bodyValue(ok).exchange().expectStatus().isUnauthorized();
        // the token is checked before validation: an invalid body without a token is still 401
        web.post().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of()).exchange().expectStatus().isUnauthorized();
        web.get().uri("/v1/batches/R-tok/items/X-NOMAP/decisions").header(HEADER, "wrong")
            .exchange().expectStatus().isUnauthorized();
        assertThat(decisions("R-tok")).isZero();
        assertThat(itemReview("R-tok", "X-NOMAP")).isEqualTo("pending");
    }

    @Test void decisionHistoryIsNewestFirstWithRoleOnlyUnlessTokenGiven() throws Exception {
        decide("R-hist", "C-CAP", body("ok", null, ENGINEER, "engineer")).expectStatus().isCreated();
        decide("R-hist", "C-CAP", body("issue", "dose form mismatch", PHARMACIST, "pharmacist")).expectStatus().isCreated();

        // Review Focus 4: an anonymous request never sees reviewer emails
        byte[] anon = web.get().uri("/v1/batches/R-hist/items/C-CAP/decisions").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(2)
            .jsonPath("$.data[0].decision").isEqualTo("issue")
            .jsonPath("$.data[0].note").isEqualTo("dose form mismatch")
            .jsonPath("$.data[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data[0].decidedAt").exists()
            .jsonPath("$.data[0].length()").isEqualTo(4)
            .jsonPath("$.data[0].reviewerEmail").doesNotExist()
            .jsonPath("$.data[1].decision").isEqualTo("ok")
            .jsonPath("$.data[1].role").isEqualTo("engineer")
            .returnResult().getResponseBody();
        assertThat(new String(anon, StandardCharsets.UTF_8)).doesNotContain("@");

        internal(web).get().uri("/v1/batches/R-hist/items/C-CAP/decisions").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data[0].reviewerEmail").isEqualTo(PHARMACIST)
            .jsonPath("$.data[0].role").isEqualTo("pharmacist")
            .jsonPath("$.data[1].reviewerEmail").isEqualTo(ENGINEER);

        // batch pages, the report and product pages never carry emails either
        for (String uri : new String[]{"/v1/batches/R-hist", "/v1/batches/R-hist/report", "/v1/batches",
                                       "/v1/products/C-CAP", "/v1/substances/BDS-000003"}) {
            byte[] page = web.get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody();
            assertThat(new String(page, StandardCharsets.UTF_8)).as(uri).doesNotContain("@");
        }
    }

    @Test void staleExtractedAtIsRejectedWith409() throws Exception {
        Map<String, Object> stale = body("ok", null, PHARMACIST, "pharmacist");
        stale.put("extractedAt", "2026-01-01T07:00:00Z");
        decide("R-stale", "A-NOBDC", stale).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("CONFLICT");
        assertThat(decisions("R-stale")).isZero();

        // the batch page carries extractedAt; echoing it back is accepted
        String shown = new String(web.get().uri("/v1/batches/R-stale").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.items[0].extractedAt").isEqualTo("2026-01-01T08:00:00.123456Z")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(shown).contains("extractedAt");
        Map<String, Object> current = body("ok", null, PHARMACIST, "pharmacist");
        current.put("extractedAt", "2026-01-01T08:00:00.123456Z");
        expectDecision("R-stale", "A-NOBDC", current, "ok", "approved");
    }

    @Test void reviewerEmailsNeverReachTheLogs(CapturedOutput output) throws Exception {
        String email = "log.canary.reviewer@example.org";
        decide("R-log", "X-NOMAP", body("ok", null, email, "pharmacist")).expectStatus().isCreated();
        decide("R-log", "unknown-item", body("ok", null, email, "pharmacist")).expectStatus().isNotFound();
        decide("R-log", "X-NOMAP", body("issue", "abc", email, "pharmacist")).expectStatus().isBadRequest();
        decide("R-log", "X-NOMAP", body("ok", null, email, "admin")).expectStatus().isBadRequest();
        web.post().uri("/v1/batches/R-log/items/X-NOMAP/decisions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body("ok", null, email, "pharmacist")).exchange().expectStatus().isUnauthorized();
        internal(web).get().uri("/v1/batches/R-log/items/X-NOMAP/decisions").exchange().expectStatus().isOk();
        assertThat(output.getAll()).doesNotContain(email).doesNotContain(TOKEN);
    }
}
