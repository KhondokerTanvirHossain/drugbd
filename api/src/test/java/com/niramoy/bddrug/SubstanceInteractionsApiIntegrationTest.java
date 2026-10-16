package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PublicPairReviews;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
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
 * §7.4 P9 on PilotSeed. Warfarin (BDS-000001, approved through W-1) pairs with Acetylsalicylic acid (major, IA-1),
 * Acetaminophen and Chloramphenicol (moderate), Some Herb (minor) and Alpha Unknown (unknown). Aspirin's product is
 * pending, so its BDS id is never served, and neither is the senior review of its pair with Warfarin (current, at 05:20);
 * Napa and C-CAP are approved, and the Warfarin + Acetaminophen pair has a current review (05:22).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SubstanceInteractionsApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        String warfarinAspirin = new PublicPairReviews.Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"),
            "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
            "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.").hash();
        String warfarinAcetaminophen = new PublicPairReviews.Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null).hash();
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('I-1', 4, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('I-1','DGDA-Drugs','W-1','ok', now()), ('I-1','DGDA-Drugs','N-1','ok', now()),
             ('I-1','DGDA-Drugs','C-CAP','ok', now()), ('I-1','DGDA-Drugs','A-1','pending', now());
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at) VALUES
             ('DDInter1951','DDInter20','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:20:00Z'),
             ('DDInter1951','DDInter351','issue','PAIR-NOTE-SECRET', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:21:00Z'),
             ('DDInter14','DDInter1951','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:22:00Z');
            """.formatted(warfarinAspirin, "0".repeat(64), warfarinAcetaminophen));
    }

    @Autowired WebTestClient web;

    @Test void pagedListWithTextReviewStateAndPrivatePartnersUnlinked() {
        String body = new String(web.get().uri("/v1/substances/BDS-000001/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.size").isEqualTo(20)
            .jsonPath("$.data.counts[0].ddinterId").isEqualTo("DDInter1951")
            .jsonPath("$.data.counts[0].counts.major").isEqualTo(1)
            .jsonPath("$.data.items[0].severity").isEqualTo("major")
            .jsonPath("$.data.items[0].partnerName").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.items[0].partnerBdsId").value(v -> assertThat(v).isNull())
            .jsonPath("$.data.items[0].ddinterA").isEqualTo("DDInter1951")
            .jsonPath("$.data.items[0].ddinterB").isEqualTo("DDInter20")
            .jsonPath("$.data.items[0].routeScope").isEqualTo("systemic")
            .jsonPath("$.data.items[0].interaction").isEqualTo("Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.")
            // the partner substance is not public: its pair's senior review is never served (§7.4, §2.2)
            .jsonPath("$.data.items[0].pairReview.state").isEqualTo("not_reviewed")
            .jsonPath("$.data.items[0].pairReview.reviewedAt").value(v -> assertThat(v).isNull())
            .jsonPath("$.data.items[1].partnerName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.items[1].partnerBdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.items[1].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.items[1].pairReview.reviewedAt").isEqualTo("2026-10-16T05:22:00Z")
            .jsonPath("$.data.items[2].partnerName").isEqualTo("Chloramphenicol")
            .jsonPath("$.data.items[2].pairReview.state").isEqualTo("not_reviewed")   // an issue is never named in public
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("\"issue\"", "\"changed\"", "PAIR-NOTE-SECRET", "senior@example.org", "BDS-000002",
            "2026-10-16T05:20:00Z");
        // the token and scope=all read every pair's state, the private partner's too
        internal(web).get().uri("/v1/substances/BDS-000001/interactions?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.items[0].partnerBdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.items[0].pairReview.state").isEqualTo("reviewed");
    }

    @Test void severityFilterAndPaging() {
        web.get().uri("/v1/substances/BDS-000001/interactions?severity=moderate").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(2)
            .jsonPath("$.data.items.length()").isEqualTo(2);
        web.get().uri("/v1/substances/BDS-000001/interactions?size=2&page=2").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.items.length()").isEqualTo(1)
            .jsonPath("$.data.items[0].severity").isEqualTo("unknown");
        web.get().uri("/v1/substances/BDS-000001/interactions?page=9").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.items.length()").isEqualTo(0);
    }

    @Test void badParametersAre400OnTheirField() {
        web.get().uri("/v1/substances/BDS-000001/interactions?severity=fatal").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("severity");
        web.get().uri("/v1/substances/BDS-000001/interactions?page=-1").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("page");
        web.get().uri("/v1/substances/BDS-000001/interactions?size=51").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("size");
    }

    @Test void aSubstanceThatIsNotPublicIsTheStubAndUnknownIs404() {
        String body = new String(web.get().uri("/v1/substances/BDS-000002/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(3)
            .jsonPath("$.data.hidden").isEqualTo(true)
            .jsonPath("$.data.preferredName").isEqualTo("Aspirin")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("items", "counts", "DDInter");
        web.get().uri("/v1/substances/BDS-999999/interactions").exchange().expectStatus().isNotFound();
    }

    @Test void aPairWithAnInteractionIdHasItsDdinterLink() throws Exception {
        exec(pg, "INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) " +
                 "VALUES ('DDInter14','DDInter9','minor','{}','Acetaminophen','Linkmol','3039') ON CONFLICT DO NOTHING");
        web.get().uri("/v1/substances/BDS-000005/interactions?severity=minor").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.items[0].sourceUrl").isEqualTo("https://ddinter2.scbdd.com/server/interact/3039/");
    }
}
