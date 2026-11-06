package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.List;

/**
 * SuggestApiIntegrationTest's fixtures with the switch on (show mode, spec §6.7.1, §7.4.1, §11.3, D74): every suggested row
 * is visible and in full (clinicalDisplayName, matched) with its label, matched as a full search hit is; a hidden product
 * (in no batch: the Q- and K- rows) is never suggested. Tests whose assertions hold in both modes are inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class SuggestShowUnreviewedIntegrationTest extends SuggestApiIntegrationTest {

    @Override @Test void unapprovedRowsMatchOnTradeNameAndDarOnlyAndCarryNoData() {
        web.get().uri("/v1/products/suggest?q=ecos").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data[0].review").isEqualTo("not_reviewed")
            .jsonPath("$.data[0].clinicalDisplayName").isEqualTo("Aspirin 75 mg tablet");
        // matched through the substance, as an approved row is
        web.get().uri("/v1/products/suggest?q=acetylsalicylic").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[*].conceptId").isEqualTo(List.of("A-1"))
            .jsonPath("$.data[0].matched.substance").isEqualTo("Aspirin");
        // hidden products are not suggested, by name or by DAR
        web.get().uri("/v1/products/suggest?q=asprin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(0);
        web.get().uri("/v1/products/suggest?q=K01").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(0);
    }

    @Override @Test void prefixMatchesComeFirstThenApprovedThenNameAndTenAtMost() {
        // the Q- rows are in batch G-2: approved before not reviewed within the prefix group, then the rest
        web.get().uri("/v1/products/suggest?q=qu").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data[*].conceptId").isEqualTo(List.of("Q-3", "Q-2", "Q-1", "Q-4"))
            .jsonPath("$.data[*].review").isEqualTo(List.of("approved", "not_reviewed", "approved", "not_reviewed"));
        // the twelve Capro rows are in no batch: hidden, never suggested
        web.get().uri("/v1/products/suggest?q=capro").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(0);
    }
}
