package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * ProductDetailApiIntegrationTest's fixtures with the switch on (show mode, spec §6.5, §7.4.1, §11.3, D74): a pending product
 * is served in full with review not_reviewed, its source links, and verification null (the line only when approved, never
 * because a record is visible); pending brands and partners count as visible. Tests whose assertions hold in both modes
 * (the approved products' verification dates among them) are inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class ProductDetailShowUnreviewedIntegrationTest extends ProductDetailApiIntegrationTest {

    @Test void aPendingProductIsServedInFullWithoutTheVerificationLine() {
        String body = new String(web.get().uri("/v1/products/A-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.review").isEqualTo("not_reviewed")
            .jsonPath("$.data.verification").isEmpty()
            .jsonPath("$.data.provenance.batchId").isEqualTo("D-1")
            .jsonPath("$.data.provenance.sourceLink.url").value(u -> assertThat((String) u).endsWith("/concepts/A-1/"))
            .jsonPath("$.data.clinicalDrug.bdcId").isEqualTo("BDC-000002")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("@example.org", "pharmacist\"", "decidedAt", "reviewStatus");
        web.get().uri("/v1/products/N-1").exchange().expectBody()
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.verification.status").isEqualTo("approved");
    }

    @Override @Test void verificationProvenanceAndOtherBrands() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.verification.role").isEqualTo("pharmacist")
            .jsonPath("$.data.verification.approvedAt").isEqualTo("2026-10-14T05:20:00Z")
            .jsonPath("$.data.provenance.batchId").isEqualTo("D-1")
            .jsonPath("$.data.otherBrandsCount").isEqualTo(2);                       // N-2 (approved) and N-3 (pending, visible)
    }

    @Override @Test void privatePartnerNeverNamedInTheStageCard() {
        // Ecosprin (A-1) is visible in show mode, so the aspirin pair's missing text is named too; the raw evidence never is
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.provenance.stages[3].status").isEqualTo("warn")
            .jsonPath("$.data.provenance.stages[3].textMissing.length()").isEqualTo(2)
            .jsonPath("$.data.provenance.stages[3].textMissing[?(@.nameB == 'Warfarin')].severity").isEqualTo(java.util.List.of("moderate"));
        assertThat(new String(web.get().uri("/v1/products/N-1").exchange().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8)).doesNotContain("text_missing");
    }
}
