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
import com.niramoy.bddrug.adapter.persistence.R2dbcFlagAdapter;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
    @Autowired DatabaseClient db;
    @Autowired TransactionalOperator tx;

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
            .jsonPath("$.data.items[?(@.targetId == 'W-1')].message").isEqualTo("Strength on the pack is 2 mg")
            .jsonPath("$.data.items[0].targetId").isEqualTo("W-1,A-1")     // newest first
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.size").isEqualTo(50);

        internal(web).post().uri("/v1/flags/{id}/resolve", id).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "pharma.reviewer@example.org")).exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.id").isEqualTo((int) id)
            .jsonPath("$.data.status").isEqualTo("resolved")
            .jsonPath("$.data.resolvedBy").isEqualTo("pharma.reviewer@example.org")
            .jsonPath("$.data.resolvedAt").exists();
        assertThat(text(pg, "SELECT status FROM ops.flag WHERE id = " + id)).isEqualTo("resolved");

        internal(web).get().uri("/v1/flags").exchange().expectStatus().isOk()     // open is the default
            .expectBody().jsonPath("$.data.items[?(@.targetId == 'W-1')]").isEmpty();
        internal(web).get().uri("/v1/flags?status=resolved").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.items[?(@.targetId == 'W-1')].status").isEqualTo("resolved");

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

    @Test void pagesOfFiftyAndTargetFiltersSeparateProblemReportsFromPartnerRequests() throws Exception {
        // An `other` flag that is not a partner request belongs in "Problem reports" (§5.16: every open flag except partner requests).
        create(internal(web), flag("other", "general-feedback", "The search misses brand spellings", "user.two@example.org"))
            .expectStatus().isCreated();
        for (int i = 0; i < 55; i++)
            create(internal(web), flag("substance", "PAGE-" + i, "Name is spelled wrong here", "pager@example.org"))
                .expectStatus().isCreated();
        for (int i = 0; i < 2; i++)
            create(internal(web), flag("other", "partner-access", "We build a clinic app " + i, "partner@example.org"))
                .expectStatus().isCreated();

        // Other tests in this class also write flags, so the expectations are relative to what the table holds.
        long reportsOpen = count(pg, "SELECT count(*) FROM ops.flag WHERE status = 'open' AND target_id <> 'partner-access'");
        long partnersOpen = count(pg, "SELECT count(*) FROM ops.flag WHERE status = 'open' AND target_type = 'other'"
                                      + " AND target_id = 'partner-access'");
        assertThat(reportsOpen).isBetween(56L, 101L);

        String reports = "/v1/flags?status=open&excludeTargetId=partner-access";
        internal(web).get().uri(reports).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.items.length()").isEqualTo(50)
            .jsonPath("$.data.hasMore").isEqualTo(true)
            .jsonPath("$.data.items[0].targetId").isEqualTo("PAGE-54")
            .jsonPath("$.data.items[?(@.targetId == 'partner-access')]").isEmpty();
        internal(web).get().uri(reports + "&page=1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.page").isEqualTo(1)
            .jsonPath("$.data.items.length()").isEqualTo((int) reportsOpen - 50)
            .jsonPath("$.data.hasMore").isEqualTo(false)
            .jsonPath("$.data.items[?(@.targetId == 'PAGE-0')].targetId").isEqualTo(java.util.List.of("PAGE-0"))
            .jsonPath("$.data.items[?(@.targetId == 'general-feedback')].targetType").isEqualTo(java.util.List.of("other"))
            .jsonPath("$.data.items[?(@.targetId == 'partner-access')]").isEmpty();
        internal(web).get().uri("/v1/flags?targetType=other&targetId=partner-access").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.items.length()").isEqualTo((int) partnersOpen)
            .jsonPath("$.data.items[0].message").isEqualTo("We build a clinic app 1");
    }

    @Test void pagingAndFilterValuesAreValidated() {
        for (String[] bad : new String[][]{{"size=0", "size"}, {"size=51", "size"}, {"size=x", "size"}, {"page=-1", "page"},
                                           {"page=10001", "page"}, {"page=1.5", "page"}, {"targetType=report", "targetType"},
                                           {"targetType=product,", "targetType"}, {"targetId=" + "x".repeat(201), "targetId"},
                                           {"excludeTargetId=" + "x".repeat(201), "excludeTargetId"}})
            internal(web).get().uri("/v1/flags?" + bad[0]).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].field").isEqualTo(bad[1]);
    }

    @Test void flagWritesAndTheirAuditRowCommitTogether() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> report = flag("product", "AUD-1", "Pack shows 10 mg, record says 5 mg", "audit.user@example.org");
        report.put("requestId", rid);
        create(internal(web), report).expectStatus().isCreated();
        long id = flagId("AUD-1");
        assertThat(text(pg, "SELECT event || '|' || actor_email || '|' || target_type || '|' || target_id || '|' || outcome || '|' || request_id"
                            + " FROM ops.audit_event WHERE target_type = 'flag' AND target_id = '" + id + "'"))
            .isEqualTo("flag_created|audit.user@example.org|flag|" + id + "|accepted|" + rid);

        create(internal(web), flag("other", "partner-access", "Hospital pharmacy integration", "partner.two@example.org"))
            .expectStatus().isCreated();
        long partner = count(pg, "SELECT max(id) FROM ops.flag WHERE target_id = 'partner-access'");
        assertThat(text(pg, "SELECT event FROM ops.audit_event WHERE target_type = 'flag' AND target_id = '" + partner + "'"))
            .isEqualTo("partner_request");

        internal(web).post().uri("/v1/flags/{id}/resolve", id).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("resolvedBy", "pharma.reviewer@example.org")).exchange().expectStatus().isOk();
        assertThat(text(pg, "SELECT actor_email || '|' || outcome FROM ops.audit_event WHERE event = 'flag_resolved'"
                            + " AND target_id = '" + id + "'"))
            .isEqualTo("pharma.reviewer@example.org|resolved");
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE event = 'flag_resolved' AND request_id IS NULL")).isZero();
        // the message is never copied into the audit trail
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE outcome LIKE '%mg%' OR target_id LIKE '%mg%'")).isZero();
    }

    @Test void whenTheAuditRowFailsTheFlagWriteRollsBack() throws Exception {
        R2dbcFlagAdapter failingAudit = new R2dbcFlagAdapter(db, tx, e -> Mono.error(new IllegalStateException("audit insert failed")));
        assertThatThrownBy(() -> failingAudit.create("product", "AUD-ROLLBACK", "Pack shows 10 mg, record says 5 mg",
                                                     "audit.user@example.org", UUID.randomUUID()).block())
            .hasMessageContaining("audit insert failed");
        assertThat(count(pg, "SELECT count(*) FROM ops.flag WHERE target_id = 'AUD-ROLLBACK'")).isZero();

        create(internal(web), flag("product", "AUD-RESOLVE", "Pack shows 10 mg, record says 5 mg", "audit.user@example.org"))
            .expectStatus().isCreated();
        long id = flagId("AUD-RESOLVE");
        assertThatThrownBy(() -> failingAudit.resolve(id, "pharma.reviewer@example.org", UUID.randomUUID()).block())
            .hasMessageContaining("audit insert failed");
        assertThat(text(pg, "SELECT status FROM ops.flag WHERE id = " + id)).isEqualTo("open");
    }

    @Test void aMalformedRequestIdIsRefusedAndNothingIsWritten() throws Exception {
        Map<String, Object> report = flag("product", "AUD-BAD", "Pack shows 10 mg, record says 5 mg", "audit.user@example.org");
        report.put("requestId", "not-a-uuid");
        create(internal(web), report).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("requestId");
        assertThat(count(pg, "SELECT count(*) FROM ops.flag WHERE target_id = 'AUD-BAD'")).isZero();
    }
}
