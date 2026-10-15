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

/** Spec §7.8: V7 widens the decision and role checks, adds ops.pair_review and the new audit events (db-schema-v1.2). */
@Testcontainers
class V7MigrationIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    static final String HASH = "7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f";

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count) VALUES ('V7', 1);
            INSERT INTO ops.batch_item (batch_id, source, concept_id, extracted_at) VALUES ('V7', 'DGDA-Drugs', 'W-1', now());
            """);
    }

    private static void decision(String decision, String note, String role) throws Exception {
        exec(pg, "INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role) " +
                 "VALUES ('V7', 'W-1', '" + decision + "', '" + note + "', 's@example.org', '" + role + "')");
    }

    @Test void theConstraintsHaveTheNamesTheMigrationDropsAndAdds() throws Exception {
        assertThat(text(pg, """
            SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint
             WHERE conname IN ('review_decision_decision_check', 'review_decision_reviewer_role_check',
                               'review_decision_dismiss_by_senior', 'audit_event_event_check', 'audit_event_actor_role_check')"""))
            .isEqualTo("audit_event_actor_role_check,audit_event_event_check,review_decision_decision_check," +
                       "review_decision_dismiss_by_senior,review_decision_reviewer_role_check");
        assertThat(count(pg, "SELECT count(*) FROM pg_indexes WHERE indexname = 'audit_event_pair_decision_request_uq'")).isEqualTo(1);
        assertThat(count(pg, "SELECT count(*) FROM pg_indexes WHERE indexname = 'pair_review_pair_idx'")).isEqualTo(1);
    }

    @Test void aSeniorMayDecideAndDismissWithANote() throws Exception {
        decision("ok", "", "senior");
        decision("issue", "strength is wrong", "senior");
        decision("dismiss", "the report misread the register", "senior");
        assertThat(count(pg, "SELECT count(*) FROM ops.review_decision WHERE reviewer_role = 'senior'")).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "dismiss|a note long enough|pharmacist",   // only a senior dismisses
        "dismiss|abcd|senior",                     // under 5 characters
        "dismiss|      |senior",                   // blank once trimmed
        "approve||pharmacist",                     // not a decision
        "ok||admin",                               // not a role
    })
    void theWidenedChecksStillRefuseTheRest(String row) {
        String[] f = row.split("\\|", -1);
        assertThatThrownBy(() -> decision(f[0], f[1], f[2]))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("23514"));
    }

    private static String pairReview(String a, String b, String decision, String note, String hash, String role) {
        return "INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role) " +
               "VALUES ('" + a + "', '" + b + "', '" + decision + "', '" + note + "', '" + hash + "', '{}', 's@example.org', '" + role + "')";
    }

    @Test void aPairReviewIsStoredForAStoredPair() throws Exception {
        exec(pg, pairReview("DDInter14", "DDInter1951", "reviewed", "", HASH, "senior"));
        exec(pg, pairReview("DDInter14", "DDInter1951", "issue", "text contradicts the severity", HASH, "senior"));
        assertThat(count(pg, "SELECT count(*) FROM ops.pair_review WHERE ddinter_a = 'DDInter14'")).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "DDInter14|DDInter1951|issue|abcd|senior|" + HASH + "|23514",            // an issue needs 5 characters
        "DDInter1951|DDInter14|reviewed||senior|" + HASH + "|23514",             // a < b in text order
        "DDInter14|DDInter1951|reviewed||pharmacist|" + HASH + "|23514",         // senior only
        "DDInter14|DDInter1951|reviewed||senior|not-a-hash|23514",               // 64 lower-case hex
        "DDInter14|DDInter1951|approved||senior|" + HASH + "|23514",             // reviewed or issue
        "DDInter14|DDInter9999|reviewed||senior|" + HASH + "|23503",             // the pair must be stored (FK)
    })
    void pairReviewRowsAreChecked(String row) {
        String[] f = row.split("\\|", -1);
        assertThatThrownBy(() -> exec(pg, pairReview(f[0], f[1], f[2], f[3], f[5], f[4])))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo(f[6]));
    }

    @Test void theNewAuditEventsAndTheSeniorRoleAreAccepted() throws Exception {
        exec(pg, """
            INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) VALUES
             ('pair_decision', 's@example.org', 'senior', 'ddinter_pair', 'DDInter14/DDInter1951', 'reviewed', '00000000-0000-4000-8000-0000000000a1'),
             ('pair_decision_rejected', 's@example.org', 'senior', 'ddinter_pair', 'DDInter14/DDInter1951', 'CONFLICT', '00000000-0000-4000-8000-0000000000a2'),
             ('senior_open', 's@example.org', 'senior', 'pair_queue', 'todo', 'shown', '00000000-0000-4000-8000-0000000000a3');
            """);
        assertThat(count(pg, "SELECT count(*) FROM ops.audit_event WHERE actor_role = 'senior' AND request_id IN " +
            "('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3')"))
            .isEqualTo(3);
    }

    @Test void onePairDecisionAuditRowPerRequestId() throws Exception {
        String row = "INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) " +
                     "VALUES ('pair_decision', 's@example.org', 'senior', 'ddinter_pair', 'DDInter14/DDInter1951', 'reviewed', " +
                     "'00000000-0000-4000-8000-0000000000b1')";
        exec(pg, row);
        assertThatThrownBy(() -> exec(pg, row))
            .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("23505"));
    }
}
