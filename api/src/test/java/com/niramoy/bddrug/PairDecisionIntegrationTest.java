package com.niramoy.bddrug;

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
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.7 pair decisions (§11.3 PairQueueIntegrationTest "decisions"). Held: W-1, A-1, N-1, C-CAP, so every pilot pair between
 * warfarin, aspirin, acetaminophen and systemic chloramphenicol is held. DDInter1951/DDInter999 is stored but DDInter999
 * maps to no substance. Each test decides on its own pair.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class PairDecisionIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org";
    static final String H_1951_20 = "b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043";
    static final String H_14_1951 = "7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f";

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('PD', 4);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES
             ('PD','DGDA-Drugs','W-1', now()), ('PD','DGDA-Drugs','A-1', now()), ('PD','DGDA-Drugs','N-1', now()),
             ('PD','DGDA-Drugs','C-CAP', now());
            """);
    }

    @Autowired WebTestClient web;

    static Map<String, Object> body(String decision, String note, String hash, Long lastId) {
        Map<String, Object> m = new HashMap<>();
        m.put("decision", decision);
        m.put("note", note);
        m.put("reviewerEmail", SENIOR);
        m.put("reviewerRole", "senior");
        m.put("expectedContentHash", hash);
        m.put("expectedLastPairReviewId", lastId);
        m.put("requestId", UUID.randomUUID().toString());
        return m;
    }

    WebTestClient.ResponseSpec post(String a, String b, Object body) {
        return internal(web).post().uri("/v1/review/pairs/{a}/{b}/decisions", a, b).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body).exchange();
    }

    long rejected(String rid) throws Exception {
        return count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'pair_decision_rejected' AND request_id = '" + rid + "'");
    }

    @Test void markReviewedStoresTheContentAndOneAuditRow() throws Exception {
        Map<String, Object> b = body("reviewed", "", H_1951_20, null);
        post("DDInter1951", "DDInter20", b).expectStatus().isCreated().expectBody()
            .jsonPath("$.data.review.state").isEqualTo("reviewed")
            .jsonPath("$.data.review.mine").isEqualTo(true)
            .jsonPath("$.data.version.contentHash").isEqualTo(H_1951_20)
            .jsonPath("$.data.version.lastPairReviewId").isNumber()
            .jsonPath("$.data.replayed").isEqualTo(false);
        assertThat(text(pg, "SELECT decision || '|' || content_hash || '|' || (content ->> 'severity') || '|' || reviewer_role " +
            "FROM ops.pair_review WHERE ddinter_b = 'DDInter20'")).isEqualTo("reviewed|" + H_1951_20 + "|major|senior");
        assertThat(text(pg, "SELECT outcome || '|' || actor_role || '|' || target_type || '|' || target_id FROM ops.audit_event " +
            "WHERE event = 'pair_decision' AND request_id = '" + b.get("requestId") + "'"))
            .isEqualTo("reviewed|senior|ddinter_pair|DDInter1951/DDInter20");
        // a second Mark reviewed with the right version: already reviewed
        Long last = Long.valueOf(text(pg, "SELECT max(id) FROM ops.pair_review WHERE ddinter_b = 'DDInter20'"));
        post("DDInter1951", "DDInter20", body("reviewed", "", H_1951_20, last)).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("state").jsonPath("$.errors[0].message").isEqualTo("This pair is already reviewed");
        // an issue after a review is accepted, with its note
        post("DDInter1951", "DDInter20", body("issue", "management says avoid; severity is fine", H_1951_20, last)).expectStatus().isCreated()
            .expectBody().jsonPath("$.data.review.state").isEqualTo("issue")
            .jsonPath("$.data.review.note").isEqualTo("management says avoid; severity is fine");
    }

    @Test void aRepeatedRequestIdIsAReplayWithOneRow() throws Exception {
        Map<String, Object> b = body("issue", "the text contradicts the severity", H_14_1951, null);
        post("DDInter14", "DDInter1951", b).expectStatus().isCreated();
        post("DDInter14", "DDInter1951", b).expectStatus().isOk().expectBody().jsonPath("$.data.replayed").isEqualTo(true);
        assertThat(count(pg, "SELECT count(*) FROM ops.pair_review WHERE ddinter_a = 'DDInter14'")).isEqualTo(1);
        Map<String, Object> other = new HashMap<>(b);
        other.put("decision", "reviewed");
        post("DDInter14", "DDInter1951", other).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
    }

    @SuppressWarnings("unchecked")
    @Test void validationIs400WithTheFieldAndOneRejectedRow() throws Exception {
        Object[][] cases = {
            {"reviewerRole", Map.of("reviewerRole", "pharmacist")},
            {"decision", Map.of("decision", "approve")},
            {"note", Map.of("decision", "issue", "note", "abcd")},
            {"expectedContentHash", Map.of("expectedContentHash", "ABC")},
            {"requestId", Map.of("requestId", "not-a-uuid")},
        };
        for (Object[] c : cases) {
            Map<String, Object> b = body("reviewed", "", H_14_1951, null);
            b.putAll((Map<String, Object>) c[1]);
            post("DDInter14", "DDInter1951", b).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo(c[0]);
        }
        Map<String, Object> missing = body("reviewed", "", H_14_1951, null);
        missing.remove("expectedLastPairReviewId");
        post("DDInter14", "DDInter1951", missing).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("expectedLastPairReviewId");
        Map<String, Object> wrongRole = body("reviewed", "", H_14_1951, null);
        wrongRole.put("reviewerRole", "engineer");
        post("DDInter14", "DDInter1951", wrongRole).expectStatus().isBadRequest().expectBody()
            .jsonPath("$.errors[0].message").isEqualTo("Only a senior pharmacist can review pairs");
        assertThat(rejected((String) wrongRole.get("requestId"))).isEqualTo(1);
    }

    /** §7.10.1 (D66): a qa account can never decide; the API refuses reviewerRole=qa with one rejected row and no pair review. */
    @Test void aQaRoleIs400ReviewerRoleWithOneRejectedRowAndNoPairReview() throws Exception {
        long before = count(pg, "SELECT count(*) FROM ops.pair_review");
        for (String decision : new String[]{"reviewed", "issue"}) {
            Map<String, Object> b = body(decision, decision.equals("issue") ? "the text contradicts the severity" : "", H_14_1951, null);
            b.put("reviewerEmail", "qa.member@example.org");
            b.put("reviewerRole", "qa");
            post("DDInter14", "DDInter1951", b).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo("reviewerRole");
            assertThat(rejected((String) b.get("requestId"))).isEqualTo(1);
            assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'pair_decision' AND request_id = '" +
                b.get("requestId") + "'")).isZero();
        }
        assertThat(count(pg, "SELECT count(*) FROM ops.pair_review")).isEqualTo(before);
    }

    @Test void aPairThatIsNotStoredOrNotHeldIs404() {
        post("DDInter1951", "DDInter999", body("reviewed", "", H_14_1951, null)).expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("pair");
        post("DDInter1951", "DDInter14", body("reviewed", "", H_14_1951, null)).expectStatus().isNotFound();   // a > b
        post("DDInter20", "DDInter7777", body("reviewed", "", H_14_1951, null)).expectStatus().isNotFound();
    }

    @Test void aStalePageIs409OnTheContentOrTheLastReview() throws Exception {
        Map<String, Object> wrong = body("reviewed", "", "f".repeat(64), null);
        post("DDInter1951", "DDInter351", wrong).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("contentHash");
        assertThat(rejected((String) wrong.get("requestId"))).isEqualTo(1);
        String queue = internal(web).get().uri("/v1/review/pairs?show=all&severity=moderate").exchange().expectBody(String.class)
            .returnResult().getResponseBody();
        String current = com.jayway.jsonpath.JsonPath.<java.util.List<String>>read(queue,
            "$.data.items[?(@.ddinterB == 'DDInter351')].version.contentHash").get(0);
        post("DDInter1951", "DDInter351", body("issue", "the route looks wrong for this entry", current, null)).expectStatus().isCreated();
        post("DDInter1951", "DDInter351", body("reviewed", "", current, null)).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("lastPairReviewId");
    }
}
