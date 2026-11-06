package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.List;

/**
 * ClinicalDrugApiIntegrationTest's fixtures with the switch on (show mode, spec §7.4.1, §11.3, D74): every visible brand is
 * listed with its label and the clinical drug carries CARRIED_LABEL; a clinical drug no visible product maps to is still
 * 404. Tests whose assertions hold in both modes are inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class ClinicalDrugShowUnreviewedIntegrationTest extends ClinicalDrugApiIntegrationTest {

    @Override @Test void publicListsPublicBrandsOnly() {
        web.get().uri("/v1/clinical-drugs/BDC-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.bdcId").isEqualTo("BDC-000001")
            .jsonPath("$.data.review").isEqualTo("approved")             // W-1 is approved (CARRIED_LABEL)
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[*].tradeName").isEqualTo(List.of("Coumarol", "Warin"))
            .jsonPath("$.data.products[*].review").isEqualTo(List.of("not_reviewed", "approved"));
    }

    @Override @Test void noPublicProductMeansNotFound() {
        // A-1 (pending) is visible, so BDC-000002 is served, labelled
        web.get().uri("/v1/clinical-drugs/BDC-000002").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.review").isEqualTo("not_reviewed")
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("A-1"));
        // N-1 is in no batch, so nothing visible maps to BDC-000006
        web.get().uri("/v1/clinical-drugs/BDC-000006").exchange().expectStatus().isNotFound().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND")
            .jsonPath("$.errors[0].field").isEqualTo("bdcId")
            .jsonPath("$.data").doesNotExist();
        web.get().uri("/v1/clinical-drugs/BDC-999999").exchange().expectStatus().isNotFound();
    }
}
