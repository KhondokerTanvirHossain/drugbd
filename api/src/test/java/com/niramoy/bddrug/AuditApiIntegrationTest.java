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

    @Test void needsTheInternalToken() throws Exception {
        long before = rows();
        post(web, event("sign_out", "ok", UUID.randomUUID().toString())).expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        web.post().uri("/v1/audit-events").header(HEADER, "wrong").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(event("sign_out", "ok", UUID.randomUUID().toString())).exchange().expectStatus().isUnauthorized();
        assertThat(rows()).isEqualTo(before);
    }
}
