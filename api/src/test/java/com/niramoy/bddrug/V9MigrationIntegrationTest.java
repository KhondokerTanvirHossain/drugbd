package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicInteger;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Spec §7.10.2 (D71): V9 adds ops.qa_key (its checks, the guard trigger, no delete) and widens the audit event and actor role
 * checks with the key events and the qa role; the decision role checks stay narrow (db-schema-v1.4).
 */
@Testcontainers
class V9MigrationIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    static final String EVENTS = "sign_in,sign_in_denied,sign_out,review_open,evidence_open,decision,decision_rejected,decision_denied," +
        "flag_created,flag_resolved,partner_request,pair_decision,pair_decision_rejected,senior_open,qa_read,qa_key_created,qa_key_revoked";
    static final String PAIR_HASH = "7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f";
    private static final AtomicInteger SEQ = new AtomicInteger();

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('V9', 1);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES ('V9', 'DGDA-Drugs', 'W-1', now());
            """);
    }

    /** A distinct 64-character lower-case hex hash per call. */
    private static String hash() {
        return String.format("%064x", SEQ.incrementAndGet());
    }

    private static String insert(String hash, String owner, String name, String expires) {
        return "INSERT INTO ops.qa_key (key_hash, owner_email, name, expires_at) VALUES ('" + hash + "', '" + owner + "', " + name +
               ", " + expires + ") RETURNING id";
    }

    /** A valid key row; returns its id. */
    private static long key() throws Exception {
        return count(pg, insert(hash(), "qa.member@example.org", "'CI laptop'", "now() + interval '2160 hours'"));
    }

    private static void refused(String sql, String state) {
        assertThatThrownBy(() -> exec(pg, sql))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo(state));
    }

    @Test void v9IsAppliedWithTheTableItsIndexAndTriggers() throws Exception {
        assertThat(count(pg, "SELECT count(*) FROM flyway_schema_history WHERE version = '9' AND success")).isEqualTo(1);
        assertThat(text(pg, "SELECT string_agg(column_name || ':' || is_nullable, ',' ORDER BY ordinal_position) " +
            "FROM information_schema.columns WHERE table_schema = 'ops' AND table_name = 'qa_key'"))
            .isEqualTo("id:NO,key_hash:NO,owner_email:NO,name:NO,created_at:NO,expires_at:NO,revoked_at:YES,last_used_at:YES");
        assertThat(count(pg, "SELECT count(*) FROM pg_indexes WHERE schemaname = 'ops' AND indexname = 'qa_key_owner_idx'")).isEqualTo(1);
        assertThat(text(pg, "SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'ops.qa_key'::regclass " +
            "AND NOT tgisinternal")).isEqualTo("qa_key_guard,qa_key_no_delete,qa_key_no_truncate");
    }

    @Test void aValidKeyIsStoredWithItsComputedLifetime() throws Exception {
        long id = count(pg, insert(hash(), "qa.member@example.org", "'ল্যাপটপ'",
            "now() + interval '2160 hours'"));
        assertThat(text(pg, "SELECT (expires_at - created_at)::text || '|' || (revoked_at IS NULL) || '|' || (last_used_at IS NULL) " +
            "FROM ops.qa_key WHERE id = " + id)).isEqualTo("90 days|true|true");
        // the longest name: 40 code points
        count(pg, insert(hash(), "qa.member@example.org", "'" + "n".repeat(40) + "'", "now() + interval '2160 hours'"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "ABCDEF|qa.member@example.org|'ok'|now() + interval '2160 hours'",                       // not 64 hex characters
        "UPPER|qa.member@example.org|'ok'|now() + interval '2160 hours'",                        // upper-case hex
        "VALID|QA.Member@example.org|'ok'|now() + interval '2160 hours'",                        // owner not lower-case
        "VALID|ab|'ok'|now() + interval '2160 hours'",                                           // owner too short
        "VALID|qa.member@example.org|'" + "n" + "'|now() + interval '2159 hours'",              // lifetime other than 2160 hours
        "VALID|qa.member@example.org|'ok'|now() + interval '90 days 1 second'",
        "VALID|qa.member@example.org|''|now() + interval '2160 hours'",                          // empty name
        "VALID|qa.member@example.org|' padded'|now() + interval '2160 hours'",                   // untrimmed name
        "VALID|qa.member@example.org|'padded '|now() + interval '2160 hours'",
        "VALID|qa.member@example.org|E'tab\\tname'|now() + interval '2160 hours'",   // a control character
        "VALID|qa.member@example.org|'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn'|now() + interval '2160 hours'",   // 41 characters
    })
    void theTableChecksRefuseBadRows(String row) {
        String[] f = row.split("\\|", -1);
        String h = switch (f[0]) {
            case "ABCDEF" -> "abcdef";
            case "UPPER" -> hash().toUpperCase().replace('0', 'A');
            default -> hash();
        };
        refused(insert(h, f[1], f[2], f[3]), "23514");
    }

    @Test void aHashIsStoredOnce() throws Exception {
        String h = hash();
        count(pg, insert(h, "a@example.org", "'one'", "now() + interval '2160 hours'"));
        refused(insert(h, "b@example.org", "'two'", "now() + interval '2160 hours'"), "23505");
    }

    @ParameterizedTest
    @ValueSource(strings = {"name = 'renamed'", "key_hash = repeat('f', 64)", "owner_email = 'other@example.org'",
        "expires_at = expires_at + interval '1 hour'", "created_at = created_at - interval '1 hour'", "id = id + 100000"})
    void theGuardRefusesChangingAnythingButRevokedAtAndLastUsedAt(String set) throws Exception {
        long id = key();
        refused("UPDATE ops.qa_key SET " + set + " WHERE id = " + id, "P0001");
    }

    @Test void aRevocationIsSetOnceAndIsFinal() throws Exception {
        long id = key();
        exec(pg, "UPDATE ops.qa_key SET revoked_at = now() WHERE id = " + id);
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE revoked_at IS NOT NULL AND id = " + id)).isEqualTo(1);
        refused("UPDATE ops.qa_key SET revoked_at = now() + interval '1 minute' WHERE id = " + id, "P0001");
        refused("UPDATE ops.qa_key SET revoked_at = NULL WHERE id = " + id, "P0001");
    }

    @Test void lastUsedAtOnlyMovesForward() throws Exception {
        long id = key();
        exec(pg, "UPDATE ops.qa_key SET last_used_at = created_at + interval '5 minutes' WHERE id = " + id);
        exec(pg, "UPDATE ops.qa_key SET last_used_at = created_at + interval '6 minutes' WHERE id = " + id);
        exec(pg, "UPDATE ops.qa_key SET last_used_at = last_used_at WHERE id = " + id);   // the same time is not a move back
        refused("UPDATE ops.qa_key SET last_used_at = created_at + interval '1 minute' WHERE id = " + id, "P0001");
        refused("UPDATE ops.qa_key SET last_used_at = NULL WHERE id = " + id, "P0001");
        // and never before the key existed
        long fresh = key();
        refused("UPDATE ops.qa_key SET last_used_at = created_at - interval '1 second' WHERE id = " + fresh, "23514");
        refused("UPDATE ops.qa_key SET revoked_at = created_at - interval '1 second' WHERE id = " + fresh, "23514");
    }

    @Test void keyRowsAreNeverDeletedOrTruncated() throws Exception {
        long id = key();
        refused("DELETE FROM ops.qa_key WHERE id = " + id, "42501");
        refused("TRUNCATE ops.qa_key", "42501");
        assertThat(count(pg, "SELECT count(*) FROM ops.qa_key WHERE id = " + id)).isEqualTo(1);
    }

    @Test void theEventCheckListsTheV8EventsPlusTheKeyEvents() throws Exception {
        String def = text(pg, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'audit_event_event_check'");
        for (String e : EVENTS.split(",")) assertThat(def).contains("'" + e + "'::text");
        assertThat(def.split("::text", -1)).hasSize(EVENTS.split(",").length + 1);
        String role = text(pg, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'audit_event_actor_role_check'");
        for (String r : new String[]{"pharmacist", "engineer", "senior", "qa", "user"}) assertThat(role).contains("'" + r + "'::text");
        assertThat(role.split("::text", -1)).hasSize(6);
    }

    @Test void theKeyEventsAndTheQaRoleAreAcceptedInAuditRows() throws Exception {
        exec(pg, """
            INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) VALUES
             ('qa_key_created', 'q@example.org', 'qa', 'qa_key', '12', 'ok', '00000000-0000-4000-8000-0000000009a1'),
             ('qa_key_revoked', 'q@example.org', 'qa', 'qa_key', '12', 'ok', '00000000-0000-4000-8000-0000000009a2'),
             ('sign_in', 'q@example.org', 'qa', NULL, NULL, 'ok', '00000000-0000-4000-8000-0000000009a3');
            """);
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE actor_role = 'qa' AND request_id IN " +
            "('00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009a2', '00000000-0000-4000-8000-0000000009a3')"))
            .isEqualTo(3);
        refused("INSERT INTO ops.audit_event (event, actor_role, outcome, request_id) VALUES ('qa_key_used', NULL, 'ok', " +
            "'00000000-0000-4000-8000-0000000009a4')", "23514");
        refused("INSERT INTO ops.audit_event (event, actor_role, outcome, request_id) VALUES ('sign_in', 'admin', 'ok', " +
            "'00000000-0000-4000-8000-0000000009a5')", "23514");
    }

    @Test void theDatabaseStillRefusesAQaDecisionAndAQaPairReview() {
        refused("INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) " +
                "VALUES ('V9', 'W-1', 'ok', '', 'q@example.org', 'qa')", "23514");
        refused("INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role) " +
                "VALUES ('DDInter14', 'DDInter1951', 'reviewed', '', '" + PAIR_HASH + "', '{}', 'q@example.org', 'qa')", "23514");
    }
}
