package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The VisibilityApiIntegrationTest fixtures with the switch on (show mode, §7.4.1, D74). Same data: W-1, N-1 and C-CAP are
 * approved; A-1 is pending and W-2 back in review (both not_reviewed); C-EYE has an issue (problem); D-1 is removed and
 * every product in no batch (A-NOBDC, X-NOMAP, X-NOSUB) stays hidden. Tests whose assertions hold in both modes are
 * inherited unchanged; the others are overridden here with the show-mode answer.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class VisibilityShowUnreviewedIntegrationTest extends VisibilityApiIntegrationTest {

    @Test @Override void publicSearchListsApprovedProductsOnly() {
        web.get().uri("/v1/products?q=warfarin").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(2)
            .jsonPath("$.data[?(@.conceptId == 'W-1')].review").isEqualTo(List.of("approved"))
            .jsonPath("$.data[?(@.conceptId == 'W-1')].reviewStatus").isEqualTo(List.of("ok"))
            .jsonPath("$.data[?(@.conceptId == 'W-2')].review").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data[?(@.conceptId == 'W-2')].reviewStatus").isEqualTo(List.of("pending"));
        // A-NOBDC is in no batch: hidden in both modes
        web.get().uri("/v1/products?q=aspirin").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data[*].conceptId").isEqualTo(List.of("A-1"));
        assertThat(str(web.get().uri("/v1/products?q=optimycin").exchange().expectBody().returnResult().getResponseBody()))
            .contains("\"review\":\"problem\"").doesNotContain("\"issue\"");
    }

    @Test @Override void unapprovedProductDetailIsTheHiddenShape() {
        for (String[] v : new String[][]{{"A-1", "not_reviewed"}, {"W-2", "not_reviewed"}, {"C-EYE", "problem"}}) {
            String body = str(web.get().uri("/v1/products/{id}", v[0]).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.data.hidden").doesNotExist()
                .jsonPath("$.data.review").isEqualTo(v[1])
                .jsonPath("$.data.verification").isEmpty()
                .jsonPath("$.data.provenance.sourceLink.url").isNotEmpty()
                .jsonPath("$.data.reviewStatus").doesNotExist()
                .returnResult().getResponseBody());
            assertThat(body).as(v[0]).doesNotContain("\"issue\"", "@example.org", "pharmacist");
        }
        expectHidden("X-NOMAP", "Herbex", "not_reviewed", null);        // no batch item at all: hidden in both modes
        expectHidden("D-1", "Motigut", "removed", "V-rm");              // removed: hidden in both modes
    }

    @Test @Override void publicSubstanceListsApprovedProductsOnly() {
        web.get().uri("/v1/substances/BDS-000001").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[?(@.conceptId == 'W-2')].review").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.products[?(@.conceptId == 'W-1')].review").isEqualTo(List.of("approved"))
            .jsonPath("$.data.clinicalDrugs[0].review").isEqualTo("approved");
        web.get().uri("/v1/substances/BDS-000003").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[?(@.conceptId == 'C-EYE')].review").isEqualTo(List.of("problem"));
    }

    @Test @Override void substanceWithoutAnApprovedProductIsHidden() {
        // Aspirin: A-1 is visible (not reviewed), so the substance is served with its carried label
        String body = str(web.get().uri("/v1/substances/BDS-000002").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.review").isEqualTo("not_reviewed")
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("A-1"))
            .returnResult().getResponseBody());
        assertThat(body).doesNotContain("Asprin Plus", "\"issue\"");
        // Domperidone: only the removed D-1 carries it, so it stays hidden
        web.get().uri("/v1/substances/BDS-000004").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true);
        web.get().uri("/v1/substances/BDS-999999").exchange().expectStatus().isNotFound();
    }

    @Test @Override void publicCheckMovesUnapprovedProductsToNotReviewed() {
        check(web, null, "W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[1].review").isEqualTo("not_reviewed")
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[0].b.review").isEqualTo("not_reviewed")
            .jsonPath("$.data.notReviewed.length()").isEqualTo(0)
            .jsonPath("$.data.summary.notApproved").isEqualTo(1);
        // only hidden products are left out: D-1 (removed) and X-NOMAP (in no batch)
        check(web, null, "A-1", "C-EYE", "D-1", "X-NOMAP").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.products[*].review").isEqualTo(List.of("not_reviewed", "problem"))
            .jsonPath("$.data.notReviewed[*].conceptId").isEqualTo(List.of("D-1", "X-NOMAP"))
            .jsonPath("$.data.summary.notApproved").isEqualTo(2);
    }

    @Test @Override void publicLoadedListHoldsApprovedProductsSortedByTradeName() {
        web.get().uri("/v1/products/loaded").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data[*].tradeName").isEqualTo(List.of("Chloramex", "Coumarol", "Ecosprin", "Napa", "Optimycin", "Warin"))
            .jsonPath("$.data[*].review").isEqualTo(List.of("approved", "not_reviewed", "not_reviewed", "approved", "problem", "approved"));
    }

    @Test @Override void statsCarryTheMode() {
        web.get().uri("/v1/stats").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.publicMode").isEqualTo("show_unreviewed")
            .jsonPath("$.data.approvedProducts").isEqualTo(3)
            .jsonPath("$.data.inReviewProducts").isEqualTo(3)
            .jsonPath("$.data.batches[?(@.batchId == 'V-rm')].items[0].hidden").isEqualTo(List.of(true))
            .jsonPath("$.data.batches[?(@.batchId == 'V-1')].items[?(@.conceptId == 'C-EYE')].review").isEqualTo(List.of("problem"))
            .jsonPath("$.data.batches[?(@.batchId == 'V-1')].items[?(@.conceptId == 'C-EYE')].status").isEqualTo(List.of("not_reviewed"));
    }
}
