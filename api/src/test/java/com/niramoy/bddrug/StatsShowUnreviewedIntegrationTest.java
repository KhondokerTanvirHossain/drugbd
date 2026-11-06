package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * StatsApiIntegrationTest's fixtures with the switch on (show mode, spec §6.8, §7.4.1, §11.3, D74). The counts, each item's
 * status and exampleUsable are the same as in approved-only mode on the same data (they use approval, never visibility);
 * only publicMode and each item's hidden and review change. The other tests are inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class StatsShowUnreviewedIntegrationTest extends StatsApiIntegrationTest {

    @Override @Test void exampleUsableIsFalseOnlyForAReportedIssueOrARemovedRecord() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.publicMode").isEqualTo("show_unreviewed")
            .jsonPath("$.data.approvedProducts").isEqualTo(2)
            .jsonPath("$.data.inReviewProducts").isEqualTo(3)
            .jsonPath("$.data.batches[0].items[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.batches[0].items[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[0].hidden").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[0].review").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[0].exampleUsable").isEqualTo(true)
            .jsonPath("$.data.batches[0].items[1].conceptId").isEqualTo("C-EYE")
            .jsonPath("$.data.batches[0].items[1].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[1].hidden").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[1].review").isEqualTo("problem")
            .jsonPath("$.data.batches[0].items[1].exampleUsable").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[2].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.batches[0].items[2].review").isEqualTo("problem")
            .jsonPath("$.data.batches[0].items[2].exampleUsable").isEqualTo(true)
            .jsonPath("$.data.batches[0].items[3].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.batches[0].items[3].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.batches[0].items[3].hidden").isEqualTo(true)                 // removed: hidden in both modes
            .jsonPath("$.data.batches[0].items[3].review").isEmpty()
            .jsonPath("$.data.batches[0].items[3].exampleUsable").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[4].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.batches[0].items[4].status").isEqualTo("approved")
            .jsonPath("$.data.batches[0].items[4].hidden").isEqualTo(false)
            .jsonPath("$.data.batches[0].items[4].review").isEqualTo("approved")
            .jsonPath("$.data.batches[0].items[4].exampleUsable").isEqualTo(true);
    }
}
