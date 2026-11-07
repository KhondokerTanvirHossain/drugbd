package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * ProductBrowseApiIntegrationTest's fixtures with the switch on (show mode, §6.11, §7.4.1, D74, D75): every visible product
 * is listed with its label, approved or not; A-1 and W-2 are not_reviewed, C-EYE (an open issue) and C-CAP (a failed stage)
 * are problem, Z-SYM is not_reviewed under 0-9, and R-OLD (pending in the newer batch) is not_reviewed. Removed records, DGDA load failures and products in no batch stay unlisted.
 * Tests whose assertions hold in both modes are inherited unchanged; the expectations that differ are overridden here.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class ProductBrowseShowUnreviewedIntegrationTest extends ProductBrowseApiIntegrationTest {

    @Override @Test void onlyVisibleProductsAreListedWithTheirLabels() {
        List<String> ids = everyListedId();
        assertThat(ids).hasSize(68).doesNotHaveDuplicates().doesNotContainAnyElementsOf(HIDDEN).containsAll(UNAPPROVED);
        web.get().uri("/v1/products/browse?letter=C").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("C-CAP", "W-2"))
            .jsonPath("$.data.products[*].status").isEqualTo(List.of("not_reviewed", "not_reviewed"))
            .jsonPath("$.data.products[*].review").isEqualTo(List.of("problem", "not_reviewed"))
            .jsonPath("$.data.products[0].clinicalDrug.bdcId").isEqualTo("BDC-000004")
            .jsonPath("$.data.products[0].clinicalDrug.displayName").isEqualTo("Chloramphenicol 250 mg capsule")
            .jsonPath("$.data.products[0].genericContentRaw").isEqualTo("Chloramphenicol 250 mg");
        web.get().uri("/v1/products/browse?letter=O").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("C-EYE"))
            .jsonPath("$.data.products[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.products[0].review").isEqualTo("problem");
        web.get().uri("/v1/products/browse?letter=N").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].review").isEqualTo(List.of("approved", "approved"))
            .jsonPath("$.data.products[*].status").isEqualTo(List.of("approved", "approved"));
        web.get().uri("/v1/products/browse?letter=0-9").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[?(@.conceptId == 'Z-SYM')].review").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.products[?(@.conceptId == 'Z-NUM')].review").isEqualTo(List.of("approved"));
        web.get().uri("/v1/products/browse?letter=R").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].status").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.products[*].review").isEqualTo(List.of("not_reviewed"));
    }

    @Override List<String> expectedE() { return List.of("E-LOW", "A-1"); }
    @Override List<String> expectedR() { return List.of("R-OLD"); }
    @Override List<String> expected09() { return List.of("Z-NUM", "Z-BN", "Z-ACC", "Z-SYM"); }

    /** Show mode: B 55, C 2 (Chloramex, Coumarol), E 2 (ecoflam, Ecosprin), N 2, O 1 (Optimycin), R 1 (Rebatch), W 1, 0-9 4. */
    @Override List<Integer> expectedCounts() {
        return counts(Map.of("B", 55, "C", 2, "E", 2, "N", 2, "O", 1, "R", 1, "W", 1, "0-9", 4));
    }

    @Override List<String> inOrder() { return List.of("BK-55", "C-CAP", "W-2", "E-LOW", "A-1", "N-1", "N-2", "C-EYE", "W-1"); }
}
