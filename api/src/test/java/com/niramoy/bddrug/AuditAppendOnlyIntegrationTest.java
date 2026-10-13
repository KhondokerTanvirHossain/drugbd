package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Spec §7.6: ops.audit_event and ops.item_snapshot are append-only. Every service connects as the owning role, so
 * a REVOKE alone would not hold; the V6 triggers do. Only a reviewed migration that drops them can change past rows.
 */
@Testcontainers
class AuditAppendOnlyIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        TestSupport.exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('AU', 1);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES ('AU', 'DGDA-Drugs', 'W-1', now());
            INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
              SELECT batch_id, concept_id, extracted_at, '00000000-0000-4000-8000-000000000001', 'run', '{}'
                FROM ops.batch_item WHERE batch_id = 'AU';
            INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
              VALUES ('decision', 'p@example.org', 'pharmacist', 'batch_item', 'AU/W-1', 'ok',
                      '00000000-0000-4000-8000-000000000002');
            """);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "UPDATE ops.audit_event SET outcome = 'issue'",
        "DELETE FROM ops.audit_event",
        "TRUNCATE ops.audit_event",
        "UPDATE ops.item_snapshot SET reason = 'rerun'",
        "DELETE FROM ops.item_snapshot",
        "TRUNCATE ops.item_snapshot",
    })
    void changingPastRowsFailsWithInsufficientPrivilege(String sql) {
        assertThatThrownBy(() -> TestSupport.exec(pg, sql))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("42501"));
    }

    @Test void theRowsAreStillThere() throws Exception {
        assertThat(TestSupport.count(pg, "SELECT count(*) FROM ops.audit_event WHERE target_id = 'AU/W-1'")).isEqualTo(1);
        assertThat(TestSupport.count(pg, "SELECT count(*) FROM ops.item_snapshot WHERE batch_id = 'AU'")).isEqualTo(1);
    }
}
