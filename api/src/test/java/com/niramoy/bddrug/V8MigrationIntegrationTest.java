package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Spec §7.9.6 (D63): V8 widens audit_event_event_check with qa_read and nothing else (db-schema-v1.3). */
@Testcontainers
class V8MigrationIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    /** Every event V7 accepted, plus qa_read: the widened check, in the order V8 lists it. */
    static final String EVENTS = "sign_in,sign_in_denied,sign_out,review_open,evidence_open,decision,decision_rejected,decision_denied," +
        "flag_created,flag_resolved,partner_request,pair_decision,pair_decision_rejected,senior_open,qa_read";

    @BeforeAll static void seed() throws Exception { PilotSeed.migrateAndSeed(pg); }

    private static String row(String event, String role, String targetType, String targetId, String outcome, String rid) {
        return "INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) VALUES ('" +
               event + "', NULL, " + (role == null ? "NULL" : "'" + role + "'") + ", '" + targetType + "', '" + targetId + "', '" +
               outcome + "', '" + rid + "')";
    }

    @Test void v8IsAppliedAndTheCheckListsExactlyTheV7EventsPlusQaRead() throws Exception {
        assertThat(count(pg, "SELECT count(*) FROM flyway_schema_history WHERE version = '8' AND success")).isEqualTo(1);
        String def = text(pg, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'audit_event_event_check'");
        assertThat(def).contains("'qa_read'::text");
        for (String e : EVENTS.split(",")) assertThat(def).contains("'" + e + "'::text");
        assertThat(def.split("::text", -1)).hasSize(EVENTS.split(",").length + 1);
        assertThat(count(pg, "SELECT count(*) FROM pg_constraint WHERE conname = 'audit_event_event_check'")).isEqualTo(1);
    }

    @Test void aQaReadRowHasNoActorAndAQaRouteTarget() throws Exception {
        exec(pg, row("qa_read", null, "qa_route", "qa-checker/record", "ok", "00000000-0000-4000-8000-0000000000c1"));
        exec(pg, row("qa_read", null, "qa_route", "batches", "unauthorized", "00000000-0000-4000-8000-0000000000c2"));
        assertThat(text(pg, "SELECT string_agg(coalesce(actor_email, '-') || coalesce(actor_role, '-') || ' ' || target_type || ' ' || " +
            "target_id || ' ' || outcome, ',' ORDER BY id) FROM ops.audit_event WHERE event = 'qa_read' " +
            "AND request_id IN ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2')"))
            .isEqualTo("-- qa_route qa-checker/record ok,-- qa_route batches unauthorized");
    }

    @Test void manyQaReadRowsMayShareARequestId() throws Exception {
        // Only decision and pair_decision rows are unique per request_id (V6, V7); V8 adds no index.
        exec(pg, row("qa_read", null, "qa_route", "qa-a/batches", "ok", "00000000-0000-4000-8000-0000000000d1"));
        exec(pg, row("qa_read", null, "qa_route", "qa-a/batches", "ok", "00000000-0000-4000-8000-0000000000d1"));
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE request_id = '00000000-0000-4000-8000-0000000000d1'")).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"qa_write", "QA_READ", "qa-read", "partner_api"})
    void theWidenedCheckStillRefusesOtherEvents(String event) {
        assertThatThrownBy(() -> exec(pg, row(event, null, "qa_route", "batches", "ok", "00000000-0000-4000-8000-0000000000e1")))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("23514"));
    }

    @Test void theActorRoleCheckIsUnchanged() {
        assertThatThrownBy(() -> exec(pg, row("qa_read", "qa", "qa_route", "batches", "ok", "00000000-0000-4000-8000-0000000000f1")))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("23514"));
    }

    @Test void qaReadRowsAreAppendOnlyLikeEveryAuditRow() throws Exception {
        exec(pg, row("qa_read", null, "qa_route", "qa-b/pairs", "ok", "00000000-0000-4000-8000-0000000000f2"));
        assertThatThrownBy(() -> exec(pg, "UPDATE ops.audit_event SET outcome = 'not_found' WHERE target_id = 'qa-b/pairs'"))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("42501"));
    }
}
