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
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.10.3: the internal QA key endpoints (create, revoke, list own, verify, used), token only. */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
@ExtendWith(OutputCaptureExtension.class)
@SuppressWarnings("unchecked")
class QaKeyIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }
    @BeforeAll static void seed() throws Exception { PilotSeed.migrateAndSeed(pg); }

    @Autowired WebTestClient web;

    private static final AtomicInteger SEQ = new AtomicInteger();
    /** A distinct 64-character lower-case hex hash per call (never a real key's: the API only ever sees hashes). */
    private static String hash() { return String.format("%064x", 0xABC000L + SEQ.incrementAndGet()); }
    /** A distinct owner per test, so the per-owner caps never leak between tests. */
    private static String owner(String tag) { return "qa." + tag + "." + SEQ.incrementAndGet() + "@example.org"; }

    private static Map<String, Object> createBody(String email, String role, String name, String keyHash) {
        Map<String, Object> m = new HashMap<>();
        m.put("ownerEmail", email);
        m.put("ownerRole", role);
        m.put("name", name);
        m.put("keyHash", keyHash);
        m.put("requestId", UUID.randomUUID().toString());
        return m;
    }

    private static Map<String, Object> revokeBody(String email, String role) {
        Map<String, Object> m = new HashMap<>();
        m.put("ownerEmail", email);
        m.put("ownerRole", role);
        m.put("requestId", UUID.randomUUID().toString());
        return m;
    }

    private WebTestClient.ResponseSpec create(WebTestClient client, Map<String, ?> body) {
        return client.post().uri("/v1/qa-keys").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private WebTestClient.ResponseSpec revoke(WebTestClient client, String id, Map<String, ?> body) {
        return client.post().uri("/v1/qa-keys/{id}/revoke", id).contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private WebTestClient.ResponseSpec list(WebTestClient client, String viewer) {
        WebTestClient.RequestHeadersSpec<?> spec = client.get().uri("/v1/qa-keys");
        if (viewer != null) spec = spec.header("X-Viewer-Email", viewer);
        return spec.exchange();
    }

    private WebTestClient.ResponseSpec verify(WebTestClient client, Object keyHash) {
        Map<String, Object> m = new HashMap<>();
        m.put("keyHash", keyHash);
        return client.post().uri("/v1/qa-keys/verify").contentType(MediaType.APPLICATION_JSON).bodyValue(m).exchange();
    }

    private WebTestClient.ResponseSpec used(WebTestClient client, String id) {
        return client.post().uri("/v1/qa-keys/{id}/used", id).exchange();
    }

    /** Creates a key for the owner and returns its id. */
    private long newKey(String email, String role, String keyHash) {
        String json = new String(create(internal(web), createBody(email, role, "CI laptop", keyHash)).expectStatus().isCreated()
            .expectBody().returnResult().getResponseBody(), StandardCharsets.UTF_8);
        return ((Number) JsonPath.read(json, "$.data.id")).longValue();
    }

    private long newKey(String email) { return newKey(email, "qa", hash()); }

    private long auditRows() throws Exception {
        return count(pg, "SELECT count(*) FROM ops.audit_event WHERE event IN ('qa_key_created', 'qa_key_revoked')");
    }

    private static void noSecrets(String body, String email, String keyHash) {
        assertThat(body).doesNotContain("ownerEmail").doesNotContain("keyHash").doesNotContain("owner_email").doesNotContain("key_hash")
            .doesNotContain(email).doesNotContain(keyHash).doesNotContain("@");
    }

    // ---- token

    @Test void everyEndpointNeedsTheInternalToken() throws Exception {
        long before = count(pg, "SELECT count(*) FROM ops.qa_key");
        String email = owner("token");
        create(web, createBody(email, "qa", "CI laptop", hash())).expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        revoke(web, "1", revokeBody(email, "qa")).expectStatus().isUnauthorized();
        list(web, email).expectStatus().isUnauthorized();
        verify(web, hash()).expectStatus().isUnauthorized();
        used(web, "1").expectStatus().isUnauthorized();
        WebTestClient wrong = web.mutate().defaultHeader(HEADER, "wrong-token").build();
        create(wrong, createBody(email, "qa", "CI laptop", hash())).expectStatus().isUnauthorized();
        verify(wrong, hash()).expectStatus().isUnauthorized();
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key")).isEqualTo(before);
    }

    // ---- create

    @Test void createIs201WithTheComputedExpiryAndNoEmailOrHash() throws Exception {
        String email = owner("create"), h = hash();
        Map<String, Object> body = createBody("  " + email.toUpperCase() + " ", "engineer", "  CI laptop  ", h);
        String rid = (String) body.get("requestId");
        String json = new String(create(internal(web), body).expectStatus().isCreated().expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.name").isEqualTo("CI laptop")
            .jsonPath("$.data.status").isEqualTo("active")
            .jsonPath("$.data.lastUsedAt").isEmpty()
            .jsonPath("$.data.revokedAt").isEmpty()
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        noSecrets(json, email, h);
        assertThat((Map<String, Object>) JsonPath.read(json, "$.data")).containsOnlyKeys(
            "id", "name", "createdAt", "expiresAt", "lastUsedAt", "revokedAt", "status");
        Instant created = Instant.parse(JsonPath.read(json, "$.data.createdAt"));
        Instant expires = Instant.parse(JsonPath.read(json, "$.data.expiresAt"));
        assertThat(Duration.between(created, expires)).isEqualTo(Duration.ofHours(2160));
        long id = ((Number) JsonPath.read(json, "$.data.id")).longValue();
        assertThat(text(pg, "SELECT owner_email || '|' || key_hash || '|' || name FROM ops.qa_key WHERE id = " + id))
            .isEqualTo(email + "|" + h + "|CI laptop");
        // one audit row: the owner, the session role, the qa_key target, the web request id; never the key, its hash or its name
        assertThat(text(pg, "SELECT event || '|' || actor_email || '|' || actor_role || '|' || target_type || '|' || target_id || '|' || " +
            "outcome FROM ops.audit_event WHERE request_id = '" + rid + "'"))
            .isEqualTo("qa_key_created|" + email + "|engineer|qa_key|" + id + "|ok");
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE target_id LIKE '%" + h + "%' OR target_id LIKE '%CI laptop%'"))
            .isZero();
    }

    @Test void aBengaliNameAndEachOwnerRoleAreAccepted() throws Exception {
        String email = owner("roles");
        create(internal(web), createBody(email, "qa", "ল্যাপটপ", hash())).expectStatus().isCreated()
            .expectBody().jsonPath("$.data.name").isEqualTo("ল্যাপটপ");
        create(internal(web), createBody(email, "senior", "n".repeat(40), hash())).expectStatus().isCreated();
        create(internal(web), createBody(email, "engineer", "x", hash())).expectStatus().isCreated();
    }

    private void expectInvalid(WebTestClient.ResponseSpec res, String field) {
        res.expectStatus().isBadRequest().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
            .jsonPath("$.errors[0].field").isEqualTo(field);
    }

    @Test void createValidatesEveryFieldAndWritesNothing() throws Exception {
        long keys = count(pg, "SELECT count(*) FROM ops.qa_key"), audits = auditRows();
        String email = owner("invalid");
        for (Object bad : new Object[]{null, "", "not-an-email", "@", "a".repeat(321) + "@x.org"}) {
            Map<String, Object> b = createBody(email, "qa", "CI laptop", hash());
            b.put("ownerEmail", bad);
            expectInvalid(create(internal(web), b), "ownerEmail");
        }
        for (Object bad : new Object[]{null, "pharmacist", "user", "admin", "QA", ""}) {
            Map<String, Object> b = createBody(email, "qa", "CI laptop", hash());
            b.put("ownerRole", bad);
            expectInvalid(create(internal(web), b), "ownerRole");
        }
        for (Object bad : new Object[]{null, "", "   ", "n".repeat(41), "tab\tname", "line break", "c1\u0085x"}) {
            Map<String, Object> b = createBody(email, "qa", "CI laptop", hash());
            b.put("name", bad);
            expectInvalid(create(internal(web), b), "name");
        }
        for (Object bad : new Object[]{null, "", "ABC", "F".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65)}) {
            Map<String, Object> b = createBody(email, "qa", "CI laptop", hash());
            b.put("keyHash", bad);
            expectInvalid(create(internal(web), b), "keyHash");
        }
        for (Object bad : new Object[]{null, "", "not-a-uuid"}) {
            Map<String, Object> b = createBody(email, "qa", "CI laptop", hash());
            b.put("requestId", bad);
            expectInvalid(create(internal(web), b), "requestId");
        }
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key")).isEqualTo(keys);
        assertThat(auditRows()).isEqualTo(audits);
    }

    @Test void theSixthActiveKeyIs409AndARevokeMakesRoom() throws Exception {
        String email = owner("active");
        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) ids.add(newKey(email));
        long audits = auditRows();
        create(internal(web), createBody(email, "qa", "sixth", hash())).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("CONFLICT")
            .jsonPath("$.errors[0].field").isEqualTo("activeKeys")
            .jsonPath("$.errors[0].message").isEqualTo("You already have 5 active keys");
        assertThat(auditRows()).isEqualTo(audits);
        // expired keys are not active: an expired row does not count toward the five
        revoke(internal(web), String.valueOf(ids.get(0)), revokeBody(email, "qa")).expectStatus().isOk();
        newKey(email);
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE owner_email = '" + email + "'")).isEqualTo(6);
    }

    @Test void anExpiredKeyDoesNotCountAsActive() throws Exception {
        String email = owner("expired");
        exec(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at) VALUES ('" + hash() + "', '" + email +
            "', 'old', now() - interval '91 days', now() - interval '91 days' + interval '2160 hours')");
        for (int i = 0; i < 5; i++) newKey(email);
        create(internal(web), createBody(email, "qa", "sixth", hash())).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("activeKeys");
    }

    @Test void theEleventhKeyIn24HoursIs409EvenAfterRevoking() throws Exception {
        String email = owner("daily");
        // one created 25 hours ago does not count
        exec(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at, revoked_at) VALUES ('" + hash() + "', '" +
            email + "', 'yesterday', now() - interval '25 hours', now() - interval '25 hours' + interval '2160 hours', now())");
        for (int i = 0; i < 10; i++) {
            long id = newKey(email);
            revoke(internal(web), String.valueOf(id), revokeBody(email, "qa")).expectStatus().isOk();
        }
        long audits = auditRows();
        create(internal(web), createBody(email, "qa", "eleventh", hash())).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("createdToday")
            .jsonPath("$.errors[0].message").isEqualTo("You have created 10 keys in the last 24 hours");
        assertThat(auditRows()).isEqualTo(audits);
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE owner_email = '" + email + "'")).isEqualTo(11);
    }

    @Test void twoConcurrentCreatesAtFourActiveKeysGiveOne201AndOne409() throws Exception {
        String email = owner("race");
        for (int i = 0; i < 4; i++) newKey(email);
        Callable<Integer> send = () -> create(internal(web), createBody(email, "qa", "race", hash()))
            .expectBody().returnResult().getStatus().value();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(List.of(send, send))) statuses.add(f.get());
            assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        } finally {
            pool.shutdownNow();
        }
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE owner_email = '" + email + "' AND revoked_at IS NULL")).isEqualTo(5);
    }

    @Test void aDuplicateHashIs409KeyHashAndWritesNoAuditRow() throws Exception {
        String a = owner("dupa"), b = owner("dupb"), h = hash();
        newKey(a, "qa", h);
        long audits = auditRows();
        create(internal(web), createBody(b, "qa", "copy", h)).expectStatus().isEqualTo(409)
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("keyHash");
        assertThat(auditRows()).isEqualTo(audits);
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE owner_email = '" + b + "'")).isZero();
    }

    // ---- revoke

    @Test void revokeIs200ThenASecondRevokeIs409AndAnotherOwnersIdIs404() throws Exception {
        String email = owner("revoke"), other = owner("other"), h = hash();
        long id = newKey(email, "senior", h);
        Map<String, Object> body = revokeBody(email.toUpperCase(), "senior");
        String rid = (String) body.get("requestId");
        String json = new String(revoke(internal(web), String.valueOf(id), body).expectStatus().isOk().expectBody()
            .jsonPath("$.data.id").isEqualTo(id)
            .jsonPath("$.data.status").isEqualTo("revoked")
            .jsonPath("$.data.revokedAt").isNotEmpty()
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        noSecrets(json, email, h);
        assertThat(text(pg, "SELECT event || '|' || actor_email || '|' || actor_role || '|' || target_type || '|' || target_id || '|' || " +
            "outcome FROM ops.audit_event WHERE request_id = '" + rid + "'"))
            .isEqualTo("qa_key_revoked|" + email + "|senior|qa_key|" + id + "|ok");
        long others = newKey(other);
        long audits = auditRows();
        revoke(internal(web), String.valueOf(id), revokeBody(email, "senior")).expectStatus().isEqualTo(409).expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("status")
            .jsonPath("$.errors[0].message").isEqualTo("This key is already revoked");
        // another owner's id and an unknown id give the same 404, and nothing changes
        revoke(internal(web), String.valueOf(others), revokeBody(email, "senior")).expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("id");
        revoke(internal(web), "999999999999", revokeBody(email, "senior")).expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("id");
        assertThat(auditRows()).isEqualTo(audits);
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE id = " + others + " AND revoked_at IS NULL")).isEqualTo(1);
    }

    @Test void anExpiredKeyCanBeRevoked() throws Exception {
        String email = owner("revexp");
        long id = count(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at) VALUES ('" + hash() + "', '" +
            email + "', 'old', now() - interval '91 days', now() - interval '91 days' + interval '2160 hours') RETURNING id");
        revoke(internal(web), String.valueOf(id), revokeBody(email, "qa")).expectStatus().isOk()
            .expectBody().jsonPath("$.data.status").isEqualTo("revoked");
    }

    @Test void revokeValidatesItsInputs() throws Exception {
        String email = owner("revval");
        long id = newKey(email), audits = auditRows();
        for (String bad : new String[]{"0", "01", "-1", "x", "1234567890123456789"})
            expectInvalid(revoke(internal(web), bad, revokeBody(email, "qa")), "id");
        Map<String, Object> b = revokeBody("nobody", "qa");
        expectInvalid(revoke(internal(web), String.valueOf(id), b), "ownerEmail");
        expectInvalid(revoke(internal(web), String.valueOf(id), revokeBody(email, "pharmacist")), "ownerRole");
        b = revokeBody(email, "qa");
        b.put("requestId", "nope");
        expectInvalid(revoke(internal(web), String.valueOf(id), b), "requestId");
        assertThat(auditRows()).isEqualTo(audits);
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE id = " + id + " AND revoked_at IS NULL")).isEqualTo(1);
    }

    // ---- list

    @Test void listIsTheOwnersKeysNewestFirstWithEachStatusAndNoEmailOrHash() throws Exception {
        String email = owner("list"), other = owner("listother");
        exec(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at) VALUES ('" + hash() + "', '" + email +
            "', 'expired one', now() - interval '91 days', now() - interval '91 days' + interval '2160 hours')");
        long revoked = newKey(email);
        revoke(internal(web), String.valueOf(revoked), revokeBody(email, "qa")).expectStatus().isOk();
        long active = newKey(email);
        newKey(other);
        String json = new String(list(internal(web), " " + email.toUpperCase()).expectStatus().isOk().expectBody()
            .jsonPath("$.data.keys.length()").isEqualTo(3)
            .jsonPath("$.data.keys[0].id").isEqualTo(active)
            .jsonPath("$.data.keys[0].status").isEqualTo("active")
            .jsonPath("$.data.keys[1].id").isEqualTo(revoked)
            .jsonPath("$.data.keys[1].status").isEqualTo("revoked")
            .jsonPath("$.data.keys[2].name").isEqualTo("expired one")
            .jsonPath("$.data.keys[2].status").isEqualTo("expired")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(json).doesNotContain("ownerEmail").doesNotContain("keyHash").doesNotContain("@");
        assertThat((Map<String, Object>) JsonPath.read(json, "$.data")).containsOnlyKeys("keys");
        list(internal(web), owner("nobody")).expectStatus().isOk().expectBody().jsonPath("$.data.keys.length()").isEqualTo(0);
    }

    @Test void listIsAtMost50() throws Exception {
        String email = owner("fifty");
        StringBuilder sql = new StringBuilder("INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at, revoked_at) VALUES ");
        for (int i = 0; i < 55; i++) {
            String at = "now() - interval '" + (i + 1) + " minutes'";
            sql.append(i == 0 ? "" : ",").append("('").append(hash()).append("', '").append(email).append("', 'k").append(i).append("', ")
                .append(at).append(", ").append(at).append(" + interval '2160 hours', now())");
        }
        exec(pg, sql.toString());
        list(internal(web), email).expectStatus().isOk().expectBody()
            .jsonPath("$.data.keys.length()").isEqualTo(50)
            .jsonPath("$.data.keys[0].name").isEqualTo("k0")
            .jsonPath("$.data.keys[49].name").isEqualTo("k49");
    }

    @Test void listNeedsAValidViewerEmail() {
        expectInvalid(list(internal(web), null), "X-Viewer-Email");
        expectInvalid(list(internal(web), "not-an-email"), "X-Viewer-Email");
    }

    // ---- verify

    @Test void verifyIs200ForAnActiveKeyOnlyAndReadsNothingElse() throws Exception {
        String email = owner("verify"), h = hash();
        long id = newKey(email, "qa", h);
        verify(internal(web), h).expectStatus().isOk().expectBody()
            .jsonPath("$.data.keyId").isEqualTo(id)
            .jsonPath("$.data.ownerEmail").isEqualTo(email);
        verify(internal(web), hash()).expectStatus().isNotFound().expectBody().jsonPath("$.errors[0].field").isEqualTo("keyHash");
        revoke(internal(web), String.valueOf(id), revokeBody(email, "qa")).expectStatus().isOk();
        verify(internal(web), h).expectStatus().isNotFound().expectBody().jsonPath("$.errors[0].field").isEqualTo("keyHash");
        String old = hash();
        exec(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at) VALUES ('" + old + "', '" + email +
            "', 'old', now() - interval '91 days', now() - interval '91 days' + interval '2160 hours')");
        verify(internal(web), old).expectStatus().isNotFound().expectBody().jsonPath("$.errors[0].field").isEqualTo("keyHash");
        expectInvalid(verify(internal(web), "nope"), "keyHash");
        expectInvalid(verify(internal(web), null), "keyHash");
        // verify is read-only: no last use, no audit row
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE owner_email = '" + email + "' AND last_used_at IS NOT NULL")).isZero();
    }

    // ---- used

    @Test void usedTouchesAtMostOnceAMinute() throws Exception {
        String email = owner("used");
        long id = newKey(email);
        used(internal(web), String.valueOf(id)).expectStatus().isNoContent().expectBody().isEmpty();
        String first = text(pg, "SELECT last_used_at::text FROM ops.qa_key WHERE id = " + id);
        assertThat(first).isNotNull();
        Thread.sleep(20);
        used(internal(web), String.valueOf(id)).expectStatus().isNoContent();
        assertThat(text(pg, "SELECT last_used_at::text FROM ops.qa_key WHERE id = " + id)).isEqualTo(first);
        // a use more than a minute ago is moved forward to now
        long older = count(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at, last_used_at) VALUES ('" +
            hash() + "', '" + email + "', 'older', now() - interval '10 minutes', now() - interval '10 minutes' + interval '2160 hours', " +
            "now() - interval '61 seconds') RETURNING id");
        long recent = count(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at, last_used_at) VALUES ('" +
            hash() + "', '" + email + "', 'recent', now() - interval '10 minutes', now() - interval '10 minutes' + interval '2160 hours', " +
            "now() - interval '30 seconds') RETURNING id");
        used(internal(web), String.valueOf(older)).expectStatus().isNoContent();
        used(internal(web), String.valueOf(recent)).expectStatus().isNoContent();
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE id = " + older + " AND last_used_at > now() - interval '5 seconds'"))
            .isEqualTo(1);
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE id = " + recent + " AND last_used_at < now() - interval '25 seconds'"))
            .isEqualTo(1);
    }

    @Test void usedNeverTouchesARevokedOrExpiredKeyAndIs404OnlyForAnUnknownId() throws Exception {
        String email = owner("usedno");
        long revoked = newKey(email);
        revoke(internal(web), String.valueOf(revoked), revokeBody(email, "qa")).expectStatus().isOk();
        long expired = count(pg, "INSERT INTO ops.qa_key (key_hash, owner_email, name, created_at, expires_at) VALUES ('" + hash() + "', '" +
            email + "', 'old', now() - interval '91 days', now() - interval '91 days' + interval '2160 hours') RETURNING id");
        used(internal(web), String.valueOf(revoked)).expectStatus().isNoContent();
        used(internal(web), String.valueOf(expired)).expectStatus().isNoContent();
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE id IN (" + revoked + ", " + expired + ") AND last_used_at IS NOT NULL"))
            .isZero();
        used(internal(web), "999999999999").expectStatus().isNotFound().expectBody().jsonPath("$.errors[0].field").isEqualTo("id");
        expectInvalid(used(internal(web), "0"), "id");
        expectInvalid(used(internal(web), "abc"), "id");
    }

    // ---- privacy

    @Test void emailsHashesAndNamesNeverReachTheLogs(CapturedOutput output) throws Exception {
        String email = owner("log.canary"), h = hash();
        Map<String, Object> body = createBody(email, "qa", "canary-name-xyz", h);
        create(internal(web), body).expectStatus().isCreated();
        create(internal(web), createBody(email, "qa", "canary-name-xyz", h)).expectStatus().isEqualTo(409);
        create(internal(web), createBody(email, "admin", "canary-name-xyz", hash())).expectStatus().isBadRequest();
        verify(internal(web), h).expectStatus().isOk();
        list(internal(web), email).expectStatus().isOk();
        revoke(internal(web), "999999999999", revokeBody(email, "qa")).expectStatus().isNotFound();
        assertThat(output.getAll()).doesNotContain(email).doesNotContain(h).doesNotContain("canary-name-xyz").doesNotContain(TOKEN);
    }
}
