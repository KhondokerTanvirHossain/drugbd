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
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class AuditApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }
    @BeforeAll static void seed() throws Exception { PilotSeed.migrateAndSeed(pg); }

    @Autowired WebTestClient web;

    private static Map<String, Object> event(String event, String outcome, String requestId) {
        Map<String, Object> m = new HashMap<>();
        m.put("event", event);
        m.put("outcome", outcome);
        m.put("requestId", requestId);
        return m;
    }

    private WebTestClient.ResponseSpec post(WebTestClient client, Map<String, ?> body) {
        return client.post().uri("/v1/audit-events").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private long rows() throws Exception { return count(pg, "SELECT count(*) FROM ops.audit_event"); }

    @Test void signInIsStoredWithActorRoleAndTheWebRequestId() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> body = event("sign_in", "ok", rid);
        body.put("actorEmail", "pharm.reviewer@example.org");
        body.put("actorRole", "pharmacist");
        post(internal(web), body).expectStatus().isCreated()
            .expectBody().jsonPath("$.success").isEqualTo(true).jsonPath("$.data.id").isNumber();
        assertThat(text(pg, "SELECT event || '|' || actor_email || '|' || actor_role || '|' || outcome || '|' || " +
            "coalesce(target_type, '-') || '|' || coalesce(target_id, '-') FROM ops.audit_event WHERE request_id = '" + rid + "'"))
            .isEqualTo("sign_in|pharm.reviewer@example.org|pharmacist|ok|-|-");
    }

    @Test void deniedSignInNeedsNoActor() throws Exception {
        String rid = UUID.randomUUID().toString();
        post(internal(web), event("sign_in_denied", "stale_auth", rid)).expectStatus().isCreated();
        assertThat(text(pg, "SELECT coalesce(actor_email, '-') || coalesce(actor_role, '-') || outcome FROM ops.audit_event " +
            "WHERE request_id = '" + rid + "'")).isEqualTo("--stale_auth");
    }

    @Test void reviewOpenCarriesItsBatchItemTarget() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> body = event("review_open", "ok", rid);
        body.put("actorEmail", "eng.reviewer@example.org");
        body.put("actorRole", "engineer");
        body.put("targetType", "batch_item");
        body.put("targetId", "0001-pilot/186-0030-006--napa");
        post(internal(web), body).expectStatus().isCreated();
        assertThat(text(pg, "SELECT target_type || ' ' || target_id FROM ops.audit_event WHERE request_id = '" + rid + "'"))
            .isEqualTo("batch_item 0001-pilot/186-0030-006--napa");
    }

    @Test void eventsTheApiWritesItselfAreRefused() throws Exception {
        long before = rows();
        for (String e : List.of("decision", "decision_rejected", "flag_created", "flag_resolved", "partner_request", "bogus")) {
            post(internal(web), event(e, "ok", UUID.randomUUID().toString())).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo("event");
        }
        assertThat(rows()).isEqualTo(before);
    }

    private void expectInvalid(Map<String, Object> body, String field) {
        post(internal(web), body).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(field);
    }

    @Test void validationRejectsBadFieldsWithoutWriting() throws Exception {
        long before = rows();
        String rid = UUID.randomUUID().toString();
        Map<String, Object> b;
        b = event("sign_in", "ok", rid); b.put("actorRole", "admin"); expectInvalid(b, "actorRole");
        b = event("sign_in", "ok", rid); b.put("actorEmail", "nobody"); expectInvalid(b, "actorEmail");
        b = event("sign_in", "ok", rid); b.put("targetType", "product"); expectInvalid(b, "targetType");
        b = event("review_open", "ok", rid); b.put("targetType", "batch_item"); b.put("targetId", "x".repeat(201)); expectInvalid(b, "targetId");
        expectInvalid(event("sign_in", "OK!", rid), "outcome");
        expectInvalid(event("sign_in", "a note with spaces", rid), "outcome");
        expectInvalid(event("sign_in", "x".repeat(33), rid), "outcome");
        expectInvalid(event("sign_in", null, rid), "outcome");
        expectInvalid(event("sign_in", "ok", "not-a-uuid"), "requestId");
        expectInvalid(event("sign_in", "ok", null), "requestId");
        assertThat(rows()).isEqualTo(before);
    }

    @Test void targetIdIsAnIdOrABatchItemPairNeverFreeText() throws Exception {
        long before = rows();
        for (String bad : List.of("0001 pilot/N-1", "<script>alert(1)</script>", "0001-pilot/N-1 call me", "../x", "/N-1",
                "0001-pilot/", "a/b/c", "0001-pilot//N-1", "\u09a8\u09be\u09aa\u09be", "x".repeat(100) + "/N-1")) {
            Map<String, Object> b = event("decision_denied", "forbidden", UUID.randomUUID().toString());
            b.put("targetType", "batch_item");
            b.put("targetId", bad);
            expectInvalid(b, "targetId");
        }
        assertThat(rows()).isEqualTo(before);
        for (String good : List.of("0001-pilot/186-0030-006--napa", "42", "b.2026:10/N-1")) {
            Map<String, Object> b = event("decision_denied", "forbidden", UUID.randomUUID().toString());
            b.put("targetType", "batch_item");
            b.put("targetId", good);
            post(internal(web), b).expectStatus().isCreated();
        }
    }

    @Test void needsTheInternalToken() throws Exception {
        long before = rows();
        post(web, event("sign_out", "ok", UUID.randomUUID().toString())).expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        web.post().uri("/v1/audit-events").header(HEADER, "wrong").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(event("sign_out", "ok", UUID.randomUUID().toString())).exchange().expectStatus().isUnauthorized();
        assertThat(rows()).isEqualTo(before);
    }

    // ---- P1C (§7.5): senior_open, the senior role; pair decisions are the API's own

    @Test void seniorOpenWithEachTargetTypeIs201() throws Exception {
        for (String[] t : new String[][]{{"substance", "BDS-000001"}, {"pair_queue", "todo"}, {"pair_queue", "issue"}}) {
            String rid = UUID.randomUUID().toString();
            Map<String, Object> body = event("senior_open", "shown", rid);
            body.put("actorEmail", "senior.reviewer@example.org");
            body.put("actorRole", "senior");
            body.put("targetType", t[0]);
            body.put("targetId", t[1]);
            post(internal(web), body).expectStatus().isCreated();
            assertThat(text(pg, "SELECT event || '|' || actor_role || '|' || target_type || '|' || target_id FROM ops.audit_event " +
                "WHERE request_id = '" + rid + "'")).isEqualTo("senior_open|senior|" + t[0] + "|" + t[1]);
        }
    }

    @Test void aSeniorSignInIs201() {
        Map<String, Object> body = event("sign_in", "ok", UUID.randomUUID().toString());
        body.put("actorEmail", "senior.reviewer@example.org");
        body.put("actorRole", "senior");
        post(internal(web), body).expectStatus().isCreated();
    }

    @Test void pairDecisionsAreNotTheWebsToPost() throws Exception {
        long before = rows();
        for (String e : List.of("pair_decision", "pair_decision_rejected"))
            post(internal(web), event(e, "reviewed", UUID.randomUUID().toString())).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("event");
        Map<String, Object> body = event("senior_open", "shown", UUID.randomUUID().toString());
        body.put("targetType", "ddinter_pair");
        body.put("targetId", "DDInter14/DDInter1951");
        post(internal(web), body).expectStatus().isBadRequest().expectBody().jsonPath("$.errors[0].field").isEqualTo("targetType");
        assertThat(rows()).isEqualTo(before);
    }

    // ---- QA (§7.9.6): qa_read with target type qa_route, no actor

    @Test void qaReadWithItsQaRouteTargetIs201AndCarriesNoActor() throws Exception {
        for (String[] t : new String[][]{{"qa-checker/record", "ok"}, {"qa-checker/records", "invalid_query"}, {"batches", "unauthorized"},
                {"qa_2/pairs", "rate_limited"}, {"qa-checker/batch", "not_found"}, {"qa-checker/batches", "unavailable"}}) {
            String rid = UUID.randomUUID().toString();
            Map<String, Object> body = event("qa_read", t[1], rid);
            body.put("targetType", "qa_route");
            body.put("targetId", t[0]);
            post(internal(web), body).expectStatus().isCreated();
            assertThat(text(pg, "SELECT event || '|' || coalesce(actor_email, '-') || '|' || coalesce(actor_role, '-') || '|' || " +
                "target_type || '|' || target_id || '|' || outcome FROM ops.audit_event WHERE request_id = '" + rid + "'"))
                .isEqualTo("qa_read|-|-|qa_route|" + t[0] + "|" + t[1]);
        }
    }

    private static Map<String, Object> qa(String targetType, String targetId) {
        Map<String, Object> b = event("qa_read", "ok", UUID.randomUUID().toString());
        b.put("targetType", targetType);
        b.put("targetId", targetId);
        return b;
    }

    @Test void aQaReadTargetIsALabelAndARouteNameOnlyAndNeverHasAnActor() throws Exception {
        long before = rows();
        expectInvalid(qa("qa_key", "qa-checker/record"), "targetType");
        expectInvalid(qa(null, null), "targetType");
        // a path id, a query value, a key or its hash, an unknown route, a bad label: never a qa_route target
        for (String bad : List.of("qa-checker/batches/0001-pilot", "qa-checker/record/N-1", "qa-checker/records?filter=x", "qa-checker/unknown",
                "Qa-Checker/record", "_qa/record", "q".repeat(33) + "/record", "a".repeat(64), "qa checker/record", "record/qa-checker"))
            expectInvalid(qa("qa_route", bad), "targetId");
        expectInvalid(qa("qa_route", null), "targetId");
        Map<String, Object> b = qa("qa_route", "qa-checker/record");
        b.put("actorEmail", "pharm.reviewer@example.org");
        expectInvalid(b, "actorEmail");
        b = qa("qa_route", "qa-checker/record");
        b.put("actorRole", "user");
        expectInvalid(b, "actorRole");
        b = event("senior_open", "shown", UUID.randomUUID().toString());
        b.put("targetType", "qa_route");
        b.put("targetId", "records");
        expectInvalid(b, "targetType");
        assertThat(rows()).isEqualTo(before);
        // the longest label (32 characters) with the longest route fits
        post(internal(web), qa("qa_route", "a" + "_".repeat(30) + "z/records")).expectStatus().isCreated();
    }

    // ---- QA portal (§7.10.7): the qa role, DB key labels and the mcp route; the key events are the API's own

    @Test void aQaSignInIs201WithRoleQa() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> body = event("sign_in", "ok", rid);
        body.put("actorEmail", "qa.member@example.org");
        body.put("actorRole", "qa");
        post(internal(web), body).expectStatus().isCreated();
        assertThat(text(pg, "SELECT actor_role FROM ops.audit_event WHERE request_id = '" + rid + "'")).isEqualTo("qa");
        Map<String, Object> denied = event("decision_denied", "forbidden", UUID.randomUUID().toString());
        denied.put("actorEmail", "qa.member@example.org");
        denied.put("actorRole", "qa");
        denied.put("targetType", "batch_item");
        denied.put("targetId", "0001-pilot/186-0030-006--napa");
        post(internal(web), denied).expectStatus().isCreated();
    }

    @Test void qaReadTakesADbKeyLabelAndTheMcpRoute() throws Exception {
        for (String target : List.of("key.12/record", "mcp", "key.12/mcp", "tanvir-qa/mcp", "key.1/batches", "key.123456789012345678/pairs")) {
            String rid = UUID.randomUUID().toString();
            Map<String, Object> body = qa("qa_route", target);
            body.put("requestId", rid);
            post(internal(web), body).expectStatus().isCreated();
            assertThat(text(pg, "SELECT target_id FROM ops.audit_event WHERE request_id = '" + rid + "'")).isEqualTo(target);
        }
    }

    /** §7.10.7 (QA guide): the hosted server's get_qa_guide calls and resource reads are qa_read rows with the route guide. */
    @Test void qaReadTakesTheGuideRoute() throws Exception {
        for (String target : List.of("guide", "key.12/guide", "tanvir-qa/guide")) {
            String rid = UUID.randomUUID().toString();
            Map<String, Object> body = qa("qa_route", target);
            body.put("requestId", rid);
            post(internal(web), body).expectStatus().isCreated();
            assertThat(text(pg, "SELECT target_id FROM ops.audit_event WHERE request_id = '" + rid + "'")).isEqualTo(target);
        }
        long before = rows();
        for (String bad : List.of("key.12/guides", "guide/key.12")) expectInvalid(qa("qa_route", bad), "targetId");
        assertThat(rows()).isEqualTo(before);
    }

    @Test void aDbKeyLabelIsKeyDotAPositiveIdOnly() throws Exception {
        long before = rows();
        for (String bad : List.of("key.0/record", "key.x/record", "tanvir.qa/batches", "key./record", "key.01/record",
                "key.1234567890123456789/record", "key.12", "key.12/mcp/x", "KEY.12/record", "key-12.3/record"))
            expectInvalid(qa("qa_route", bad), "targetId");
        assertThat(rows()).isEqualTo(before);
    }

    @Test void theKeyEventsAreNotTheWebsToPost() throws Exception {
        long before = rows();
        for (String e : List.of("qa_key_created", "qa_key_revoked")) {
            Map<String, Object> body = event(e, "ok", UUID.randomUUID().toString());
            body.put("actorEmail", "qa.member@example.org");
            body.put("actorRole", "qa");
            body.put("targetType", "qa_key");
            body.put("targetId", "12");
            expectInvalid(body, "event");
        }
        assertThat(rows()).isEqualTo(before);
    }
}
