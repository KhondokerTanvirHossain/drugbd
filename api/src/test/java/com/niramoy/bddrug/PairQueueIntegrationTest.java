package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §5.17, §7.7 reads (§11.3 PairQueueIntegrationTest). Held: W-1 Warin and N-1 Napa (approved), A-1 Ecosprin, C-EYE
 * Optimycin (eye drop) and D-1 Motigut, all in Q-A. C-CAP's latest item is removed (Q-RM), so the systemic DDInter351 pairs apply to no
 * held product. Pairs between held substances: DDInter1951/DDInter20 (major), DDInter14/DDInter1951 and
 * DDInter1951/DDInter351 (moderate; the second does not apply). The tests that write run last, each at its own @Order:
 * changedPairReturnsToQueue counts todo = 3, so it must run before the pair issue on DDInter1951/DDInter351 is written
 * (JUnit breaks an @Order tie by its default method order, not by source order).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PairQueueIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final String SENIOR = "senior.reviewer@example.org";
    static final int LAST = Integer.MAX_VALUE - 1;

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES
             ('Q-A','in_review',5, now() - interval '2 hour'), ('Q-RM','in_review',0, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('Q-A','DGDA-Drugs','W-1','ok',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','A-1','pending',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','C-EYE','pending',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','D-1','pending',NULL, now() - interval '2 hour'),
             ('Q-A','DGDA-Drugs','N-1','ok',NULL, now() - interval '2 hour'),
             ('Q-RM','DGDA-Drugs','C-CAP','ok','removed from batch file', now() - interval '1 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('Q-A','W-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '90 minute'),
             ('Q-A','N-1','ok','','pharma.reviewer@example.org','pharmacist', now() - interval '90 minute');
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.BodyContentSpec ok(String uri) {
        return internal(web).get().uri(uri).header("X-Viewer-Email", SENIOR).exchange().expectStatus().isOk().expectBody();
    }

    @Test void everySeniorReadNeedsTheToken() {
        for (String uri : List.of("/v1/review/pairs", "/v1/review/substances", "/v1/review/substances/BDS-000001"))
            web.get().uri(uri).exchange().expectStatus().isUnauthorized();
    }

    /** PO D3(b): every stored pair between held substances, the non-applying one after the applying pairs of its severity. */
    @Test void everyStoredPairBetweenHeldSubstancesIsQueuedByDefault() {
        ok("/v1/review/pairs")
            .jsonPath("$.data.total").isEqualTo(3)
            .jsonPath("$.data.counts.todo").isEqualTo(3)
            .jsonPath("$.data.counts.reviewed").isEqualTo(0)
            .jsonPath("$.data.counts.all").isEqualTo(3)
            .jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter1951", "DDInter14", "DDInter1951"))
            .jsonPath("$.data.items[*].ddinterB").isEqualTo(List.of("DDInter20", "DDInter1951", "DDInter351"))
            .jsonPath("$.data.items[*].applies").isEqualTo(List.of(true, true, false))
            .jsonPath("$.data.items[0].substanceA.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.items[0].substanceB.name").isEqualTo("Aspirin")
            .jsonPath("$.data.items[0].entryA.name").isEqualTo("Warfarin")
            .jsonPath("$.data.items[0].entryA.routeScope").isEqualTo("systemic")
            .jsonPath("$.data.items[0].entryA.source.url").isEqualTo("https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/")
            .jsonPath("$.data.items[0].entryB.name").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.items[0].management").isEqualTo("Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")
            .jsonPath("$.data.items[0].actions").isEqualTo(List.of("Monitor", "Avoid"))
            .jsonPath("$.data.items[0].source").isEmpty()
            .jsonPath("$.data.items[0].review.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.items[0].version.contentHash").isEqualTo("b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043")
            .jsonPath("$.data.items[0].version.lastPairReviewId").isEmpty()
            .jsonPath("$.data.items[1].version.contentHash").isEqualTo("7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f");
    }

    @Test void brandsAreTheHeldProductsThatChooseEachSide() {
        ok("/v1/review/pairs")
            .jsonPath("$.data.items[0].brands[*].conceptId").isEqualTo(List.of("W-1", "A-1"))
            .jsonPath("$.data.items[0].brands[*].side").isEqualTo(List.of("a", "b"))
            .jsonPath("$.data.items[0].brands[0].displayStatus").isEqualTo("approved")
            .jsonPath("$.data.items[0].brands[1].displayStatus").isEqualTo("pending")
            .jsonPath("$.data.items[0].brandCounts.a").isEqualTo(1)
            .jsonPath("$.data.items[0].brandCounts.b").isEqualTo(1)
            .jsonPath("$.data.items[0].brandCounts.batches").isEqualTo(1)
            .jsonPath("$.data.items[2].brands[*].conceptId").isEqualTo(List.of("W-1"))   // nobody held chooses DDInter351
            .jsonPath("$.data.items[2].brandCounts.b").isEqualTo(0);
    }

    @Test void theScopeAndTheSeverityFilterNarrowTheQueue() {
        ok("/v1/review/pairs?pairs=applies").jsonPath("$.data.total").isEqualTo(2).jsonPath("$.data.counts.all").isEqualTo(2);
        ok("/v1/review/pairs?severity=major").jsonPath("$.data.total").isEqualTo(1).jsonPath("$.data.counts.all").isEqualTo(3);
        ok("/v1/review/pairs?severity=unknown").jsonPath("$.data.total").isEqualTo(0).jsonPath("$.data.items.length()").isEqualTo(0);
        ok("/v1/review/pairs?show=all&size=1&page=1").jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter14"));
    }

    /** Review Focus 5 (API side). */
    @Test void aPagePastTheEndIsEmptyWithTheTrueTotal() {
        ok("/v1/review/pairs?page=40").jsonPath("$.data.total").isEqualTo(3).jsonPath("$.data.items.length()").isEqualTo(0);
    }

    @Test void unknownParametersAre400WithTheirField() {
        for (String[] t : new String[][]{{"/v1/review/pairs?show=bogus", "show"}, {"/v1/review/pairs?pairs=some", "pairs"},
                {"/v1/review/pairs?severity=urgent", "severity"}, {"/v1/review/pairs?page=-1", "page"}, {"/v1/review/pairs?size=101", "size"},
                {"/v1/review/substances?q=" + "x".repeat(101), "q"}, {"/v1/review/substances/BDS-000001?pairs=x", "pairs"}})
            internal(web).get().uri(t[0]).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(t[1]);
    }

    @Test void substancesAreOrderedByPairsToReview() {
        ok("/v1/review/substances")
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.items[*].bdsId").isEqualTo(List.of("BDS-000001", "BDS-000005", "BDS-000002", "BDS-000003", "BDS-000004"))
            .jsonPath("$.data.items[0].pairsToReview").isEqualTo(3)
            .jsonPath("$.data.items[0].majorPairsToReview").isEqualTo(1)
            .jsonPath("$.data.items[0].brands").isEqualTo(1)
            .jsonPath("$.data.items[0].batches").isEqualTo(1)
            .jsonPath("$.data.items[4].pairsToReview").isEqualTo(0);
        ok("/v1/review/substances?q=WAR").jsonPath("$.data.items[*].bdsId").isEqualTo(List.of("BDS-000001"));
        ok("/v1/review/substances?q=bds-000005").jsonPath("$.data.items[*].name").isEqualTo(List.of("Acetaminophen"));
        ok("/v1/review/substances?q=%25").jsonPath("$.data.total").isEqualTo(0);
    }

    @Test void theSubstancePageListsBrandsCodesEntriesAndPairs() {
        byte[] body = ok("/v1/review/substances/BDS-000003")
            .jsonPath("$.data.name").isEqualTo("Chloramphenicol")
            .jsonPath("$.data.coverage").isEqualTo("full")
            .jsonPath("$.data.brands[*].conceptId").isEqualTo(List.of("C-EYE"))
            .jsonPath("$.data.brands[0].batchId").isEqualTo("Q-A")
            .jsonPath("$.data.brands[0].displayStatus").isEqualTo("pending")
            .jsonPath("$.data.brands[0].clinicalDrug.route").isEqualTo("ophthalmic")
            .jsonPath("$.data.brands[0].strengthText").isEqualTo("0.5 %")
            .jsonPath("$.data.brands[0].chosen[*].ddinterId").isEqualTo(List.of("DDInter352"))
            .jsonPath("$.data.brands[0].reason").isEmpty()
            .jsonPath("$.data.codes[*].system").isEqualTo(List.of("ICD11_XM", "DDINTER", "DDINTER", "DDINTER"))
            .jsonPath("$.data.codes[1].source.url").isEqualTo("https://ddinter2.scbdd.com/server/drug-detail/DDInter351/")
            .jsonPath("$.data.entries[*].ddinterId").isEqualTo(List.of("DDInter351", "DDInter352", "DDInter353"))
            .jsonPath("$.data.entries[0].counts.moderate").isEqualTo(1)
            .jsonPath("$.data.names[*].type").isEqualTo(List.of("icd11", "ddinter"))
            .jsonPath("$.data.pairs.total").isEqualTo(1)
            .jsonPath("$.data.pairs.items[0].applies").isEqualTo(false)
            .returnResult().getResponseBody();
        assertThat(new String(body, StandardCharsets.UTF_8)).doesNotContain("C-CAP", "@");
        ok("/v1/review/substances/BDS-000003?pairs=applies").jsonPath("$.data.pairs.total").isEqualTo(0);
    }

    @Test void aNoDataSubstanceSaysWhyItsBrandsAreNotChecked() {
        ok("/v1/review/substances/BDS-000004")
            .jsonPath("$.data.coverage").isEqualTo("none")
            .jsonPath("$.data.brands[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.brands[0].chosen.length()").isEqualTo(0)
            .jsonPath("$.data.pairs.total").isEqualTo(0);
    }

    @Test void aSubstanceWeDoNotHoldIs404() {
        internal(web).get().uri("/v1/review/substances/BDS-404").exchange().expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("bdsId");
    }

    // ---- writes, last

    /**
     * Spec §5.17: a pair is credited to every held substance its entries are mapped to (V3 lets one DDInter code sit under
     * several bds_ids). DDInter20 is mapped to Domperidone too for this test only: both substance pages list
     * DDInter1951/DDInter20 and both substances count it; the queue still holds each stored pair once, labelled with the
     * smallest mapped bds_id. The mapping is removed afterwards, so the later writes see the seed's three pairs.
     */
    @Test @Order(LAST - 2) void aCodeMappedToTwoHeldSubstancesCountsForBoth() throws Exception {
        exec(pg, "INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) "
               + "VALUES ('BDS-000004','DDINTER','DDInter20','systemic','ddinter2','name',0.7)");
        try {
            ok("/v1/review/pairs")
                .jsonPath("$.data.total").isEqualTo(3)
                .jsonPath("$.data.items[0].ddinterB").isEqualTo("DDInter20")
                .jsonPath("$.data.items[0].substanceB.bdsId").isEqualTo("BDS-000002")
                .jsonPath("$.data.items[0].entryB.routeScope").isEqualTo("systemic");
            for (String bds : List.of("BDS-000002", "BDS-000004"))
                ok("/v1/review/substances/" + bds)
                    .jsonPath("$.data.pairs.total").isEqualTo(1)
                    .jsonPath("$.data.pairs.items[0].ddinterA").isEqualTo("DDInter1951")
                    .jsonPath("$.data.pairs.items[0].ddinterB").isEqualTo("DDInter20");
            ok("/v1/review/substances")
                .jsonPath("$.data.items[?(@.bdsId == 'BDS-000004')].pairsToReview").isEqualTo(List.of(1))
                .jsonPath("$.data.items[?(@.bdsId == 'BDS-000004')].majorPairsToReview").isEqualTo(List.of(1))
                .jsonPath("$.data.items[?(@.bdsId == 'BDS-000002')].pairsToReview").isEqualTo(List.of(1))
                .jsonPath("$.data.items[?(@.bdsId == 'BDS-000002')].majorPairsToReview").isEqualTo(List.of(1))
                .jsonPath("$.data.items[?(@.bdsId == 'BDS-000001')].pairsToReview").isEqualTo(List.of(3));
        } finally {
            exec(pg, "DELETE FROM curated.substance_code WHERE bds_id = 'BDS-000004' AND system = 'DDINTER' AND code = 'DDInter20'");
        }
    }

    /** §11.3 changedPairReturnsToQueue (queue side; Task 9 adds the public checker's not_reviewed). */
    @Test @Order(LAST - 1) void changedPairReturnsToQueue() throws Exception {
        String items = text(pg, "SELECT string_agg(batch_id || concept_id || review || extracted_at, ',' ORDER BY batch_id, concept_id) FROM ops.batch_item");
        exec(pg, """
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
              VALUES ('DDInter14', 'DDInter1951', 'reviewed', '', '7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f',
                      '{"severity":"moderate","actions":[],"interaction":null,"management":null}', 'senior.reviewer@example.org', 'senior');
            """);
        ok("/v1/review/pairs?show=reviewed").jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter14"))
            .jsonPath("$.data.items[0].review.mine").isEqualTo(true);
        exec(pg, "UPDATE curated.ddinter_pair SET severity = 'major' WHERE ddinter_a = 'DDInter14' AND ddinter_b = 'DDInter1951'");
        ok("/v1/review/pairs?show=changed")
            .jsonPath("$.data.items[*].ddinterA").isEqualTo(List.of("DDInter14"))
            .jsonPath("$.data.items[0].review.state").isEqualTo("changed")
            .jsonPath("$.data.items[0].changes[0].field").isEqualTo("Severity")
            .jsonPath("$.data.items[0].changes[0].atReview").isEqualTo("moderate")
            .jsonPath("$.data.items[0].changes[0].now").isEqualTo("major")
            .jsonPath("$.data.items[0].history[0].changedAfter").isEqualTo(true);
        ok("/v1/review/pairs").jsonPath("$.data.counts.changed").isEqualTo(1).jsonPath("$.data.counts.todo").isEqualTo(3);
        assertThat(text(pg, "SELECT string_agg(batch_id || concept_id || review || extracted_at, ',' ORDER BY batch_id, concept_id) FROM ops.batch_item"))
            .isEqualTo(items);   // no record re-opened (S8)
    }

    @Test @Order(LAST) void aPairIssueIsListedWithItsNoteAndStaysAnIssue() throws Exception {
        exec(pg, """
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
              VALUES ('DDInter1951', 'DDInter351', 'issue', 'text says avoid; severity is moderate',
                      '0000000000000000000000000000000000000000000000000000000000000000', '{}', 'other.senior@example.org', 'senior');
            """);
        ok("/v1/review/pairs?show=issue")
            .jsonPath("$.data.items[*].ddinterB").isEqualTo(List.of("DDInter351"))
            .jsonPath("$.data.items[0].review.state").isEqualTo("issue")
            .jsonPath("$.data.items[0].review.note").isEqualTo("text says avoid; severity is moderate")
            .jsonPath("$.data.items[0].review.mine").isEqualTo(false)
            .jsonPath("$.data.items[0].interaction").isEqualTo("Chloramphenicol may increase the serum concentration of warfarin.");
    }
}
