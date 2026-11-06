package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * SubstanceInteractionsApiIntegrationTest's fixtures with the switch on (show mode, spec §6.6, §7.4.1, §11.3, D74): Aspirin
 * (carried by A-1, pending) is visible, so it is linked with partnerReview not_reviewed and its pair's senior review is
 * served; a substance no visible product carries (Domperidone: D-1 is in no batch) is still the stub. Tests whose
 * assertions hold in both modes are inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class SubstanceInteractionsShowUnreviewedIntegrationTest extends SubstanceInteractionsApiIntegrationTest {

    @Override @Test void pagedListWithTextReviewStateAndPrivatePartnersUnlinked() {
        String body = new String(web.get().uri("/v1/substances/BDS-000001/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.total").isEqualTo(5)
            .jsonPath("$.data.items[0].partnerName").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.items[0].partnerBdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.items[0].partnerReview").isEqualTo("not_reviewed")
            .jsonPath("$.data.items[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.items[0].pairReview.reviewedAt").isEqualTo("2026-10-16T05:20:00Z")
            .jsonPath("$.data.items[1].partnerName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.items[1].partnerBdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.items[1].partnerReview").isEqualTo("approved")
            .jsonPath("$.data.items[1].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.items[2].partnerName").isEqualTo("Chloramphenicol")
            .jsonPath("$.data.items[2].pairReview.state").isEqualTo("not_reviewed")   // an issue is never named in public
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("\"issue\"", "\"changed\"", "PAIR-NOTE-SECRET", "senior@example.org");
    }

    @Override @Test void aSubstanceThatIsNotPublicIsTheStubAndUnknownIs404() {
        web.get().uri("/v1/substances/BDS-000002/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.review").isEqualTo("not_reviewed");
        String body = new String(web.get().uri("/v1/substances/BDS-000004/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.length()").isEqualTo(3)
            .jsonPath("$.data.hidden").isEqualTo(true)
            .jsonPath("$.data.preferredName").isEqualTo("Domperidone")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("items", "counts", "DDInter");
        web.get().uri("/v1/substances/BDS-999999/interactions").exchange().expectStatus().isNotFound();
    }
}
