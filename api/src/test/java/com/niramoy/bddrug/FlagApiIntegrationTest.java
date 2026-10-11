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
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class FlagApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception { PilotSeed.migrateAndSeed(pg); }

    @Autowired WebTestClient web;

    private static Map<String, Object> flag(String type, String target, String message, String email) {
        Map<String, Object> m = new HashMap<>();
        m.put("targetType", type);
        m.put("targetId", target);
        m.put("message", message);
        m.put("reporterEmail", email);
        return m;
    }

    private WebTestClient.ResponseSpec create(WebTestClient client, Map<String, ?> body) {
        return client.post().uri("/v1/flags").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private long flagId(String target) throws Exception {
        return count(pg, "SELECT id FROM ops.flag WHERE target_id = '" + target + "'");
    }

    @Test void createListAndResolve() throws Exception {
        create(internal(web), flag("product", "W-1", "Strength on the pack is 2 mg", "user.one@example.org"))
            .expectStatus().isCreated()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.id").isNumber()
            .jsonPath("$.data.targetType").isEqualTo("product")
            .jsonPath("$.data.targetId").isEqualTo("W-1")
            .jsonPath("$.data.message").isEqualTo("Strength on the pack is 2 mg")
            .jsonPath("$.data.reporterEmail").isEqualTo("user.one@example.org")
            .jsonPath("$.data.status").isEqualTo("open")
            .jsonPath("$.data.createdAt").exists()
            .jsonPath("$.data.resolvedAt").doesNotExist();
        create(internal(web), flag("check", "W-1,A-1", "Missing an interaction here", "user.two@example.org"))
            .expectStatus().isCreated();
        long id = flagId("W-1");

        internal(web).get().uri("/v1/flags?status=open").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data[?(@.targetId == 'W-1')].message").isEqualTo("Strength on the pack is 2 mg")
            .jsonPath("$.data[0].targetId").isEqualTo("W-1,A-1");    // newest first

        internal(web).post().uri("/v1/flags/{id}/resolve", id).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "pharma.reviewer@example.org")).exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.id").isEqualTo((int) id)
            .jsonPath("$.data.status").isEqualTo("resolved")
            .jsonPath("$.data.resolvedBy").isEqualTo("pharma.reviewer@example.org")
            .jsonPath("$.data.resolvedAt").exists();
        assertThat(text(pg, "SELECT status FROM ops.flag WHERE id = " + id)).isEqualTo("resolved");

        internal(web).get().uri("/v1/flags").exchange().expectStatus().isOk()     // open is the default
            .expectBody().jsonPath("$.data[?(@.targetId == 'W-1')]").isEmpty();
        internal(web).get().uri("/v1/flags?status=resolved").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data[?(@.targetId == 'W-1')].status").isEqualTo("resolved");

        // resolving twice keeps the first resolution
        internal(web).post().uri("/v1/flags/{id}/resolve", id).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "eng.reviewer@example.org")).exchange().expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("CONFLICT");
        assertThat(text(pg, "SELECT resolved_by FROM ops.flag WHERE id = " + id)).isEqualTo("pharma.reviewer@example.org");
    }

    private void expectInvalid(Map<String, ?> body, String field) {
        create(internal(web), body).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(field);
    }

    @Test void validationRejectsBadFlagsWithoutWriting() throws Exception {
        expectInvalid(flag("product", "V-1", "abcd", "a@example.org"), "message");
        expectInvalid(flag("product", "V-1", "m".repeat(2001), "a@example.org"), "message");
        expectInvalid(flag("product", "V-1", null, "a@example.org"), "message");
        expectInvalid(flag("everything", "V-1", "valid message", "a@example.org"), "targetType");
        expectInvalid(flag(null, "V-1", "valid message", "a@example.org"), "targetType");
        expectInvalid(flag("product", " ", "valid message", "a@example.org"), "targetId");
        expectInvalid(flag("product", "x".repeat(201), "valid message", "a@example.org"), "targetId");
        expectInvalid(flag("product", "V-1", "valid message", "no-at-sign"), "reporterEmail");
        assertThat(count(pg, "SELECT count(*) FROM ops.flag WHERE target_id = 'V-1'")).isZero();
        create(internal(web), flag("other", "V-1", "abcde", "a@example.org")).expectStatus().isCreated();
        create(internal(web), flag("batch_item", "V-1", "m".repeat(2000), "a@example.org")).expectStatus().isCreated();
        internal(web).get().uri("/v1/flags?status=closed").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("status");
    }

    @Test void everyFlagEndpointNeedsTheToken() throws Exception {
        create(web, flag("product", "T-1", "no token at all", "a@example.org")).expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        web.post().uri("/v1/flags").header(HEADER, "wrong").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(flag("product", "T-1", "wrong token here", "a@example.org")).exchange().expectStatus().isUnauthorized();
        assertThat(count(pg, "SELECT count(*) FROM ops.flag WHERE target_id = 'T-1'")).isZero();

        web.get().uri("/v1/flags?status=open").exchange().expectStatus().isUnauthorized();
        web.get().uri("/v1/flags?status=open").header(HEADER, "wrong").exchange().expectStatus().isUnauthorized();

        create(internal(web), flag("substance", "T-2", "to be resolved", "a@example.org")).expectStatus().isCreated();
        long id = flagId("T-2");
        web.post().uri("/v1/flags/{id}/resolve", id).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "a@example.org")).exchange().expectStatus().isUnauthorized();
        assertThat(text(pg, "SELECT status FROM ops.flag WHERE id = " + id)).isEqualTo("open");
    }

    @Test void resolveValidatesAndReportsUnknownFlags() throws Exception {
        create(internal(web), flag("product", "R-2", "resolve validation", "a@example.org")).expectStatus().isCreated();
        long id = flagId("R-2");
        internal(web).post().uri("/v1/flags/{id}/resolve", id).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "nobody")).exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("resolvedBy");
        internal(web).post().uri("/v1/flags/{id}/resolve", 999999).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "a@example.org")).exchange().expectStatus().isNotFound();
        internal(web).post().uri("/v1/flags/abc/resolve").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "a@example.org")).exchange().expectStatus().isBadRequest();
        assertThat(text(pg, "SELECT status FROM ops.flag WHERE id = " + id)).isEqualTo("open");
    }
}
