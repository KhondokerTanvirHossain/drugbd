package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PublicPairReviews;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import java.util.List;
import java.util.Map;
import static com.niramoy.bddrug.TestSupport.exec;

/**
 * CheckApiIntegrationTest's fixtures with the switch on (show mode, spec §6.7.2, §7.4.1, §11.3, D74): every visible product
 * is checked, approved or not, and carries its label; notReviewed holds the hidden ones only (here Newentrol, in no batch);
 * summary.notApproved counts the checked products that are not approved. Tests whose assertions hold in both modes are
 * inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class CheckShowUnreviewedIntegrationTest extends CheckApiIntegrationTest {

    @Override @Test void publicScopeListsNotReviewedByNameAndTheAlertCarriesItsPublicReview() throws Exception {
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('K-1', 4, now()) ON CONFLICT DO NOTHING;
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('K-1','DGDA-Drugs','W-1','ok', now()), ('K-1','DGDA-Drugs','A-1','pending', now()), ('K-1','DGDA-Drugs','D-1','pending', now())
             ON CONFLICT DO NOTHING;
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at)
              VALUES ('DDInter1951','DDInter20','reviewed','','%s','{}','senior@example.org','senior','2026-10-16T05:20:00Z');
            """.formatted(new PublicPairReviews.Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"),
                "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
                "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.").hash()));
        web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of("W-1", "A-1", "D-1", "Q-1"))).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.notReviewed.length()").isEqualTo(1)
            .jsonPath("$.data.notReviewed[0].conceptId").isEqualTo("Q-1")
            .jsonPath("$.data.notReviewed[0].tradeName").isEqualTo("Newentrol")
            .jsonPath("$.data.summary.medicines").isEqualTo(4)
            .jsonPath("$.data.summary.notReviewed").isEqualTo(1)
            .jsonPath("$.data.summary.notApproved").isEqualTo(2)
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("W-1", "A-1", "D-1"))
            .jsonPath("$.data.products[*].review").isEqualTo(List.of("approved", "not_reviewed", "not_reviewed"))
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].a.review").isEqualTo("approved")
            .jsonPath("$.data.alerts[0].b.review").isEqualTo("not_reviewed")
            // a pair between two visible products serves its pair review, whatever their labels (D53, §7.4.1)
            .jsonPath("$.data.alerts[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.alerts[0].pairReview.reviewedAt").isEqualTo("2026-10-16T05:20:00Z");
    }
}
