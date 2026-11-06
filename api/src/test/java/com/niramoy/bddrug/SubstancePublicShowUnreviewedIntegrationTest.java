package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.List;

/**
 * SubstancePublicApiIntegrationTest's fixtures with the switch on (show mode, spec §6.6, §7.4.1, §11.3, D74): pending A-1
 * and C-EYE are visible, so Aspirin is linked as a partner and the eye-drops clinical drug is listed, each with its label;
 * the substance carries CARRIED_LABEL. Tests whose assertions hold in both modes are inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class SubstancePublicShowUnreviewedIntegrationTest extends SubstancePublicApiIntegrationTest {

    @Override @Test void clinicalDrugsArePublicOnes() {
        web.get().uri("/v1/substances/BDS-000003").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.review").isEqualTo("approved")                         // C-CAP is approved
            .jsonPath("$.data.clinicalDrugs[*].bdcId").isEqualTo(List.of("BDC-000003", "BDC-000004"))   // by display name
            .jsonPath("$.data.clinicalDrugs[*].review").isEqualTo(List.of("not_reviewed", "approved"))
            .jsonPath("$.data.products[?(@.conceptId == 'C-EYE')].review").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.products[?(@.conceptId == 'C-CAP')].review").isEqualTo(List.of("approved"));
    }

    @Override @Test void aPrivatePartnerSubstanceIsNeverLinked() {
        // Aspirin's only product A-1 is pending: visible in show mode, so its substance is linked, labelled
        web.get().uri("/v1/substances/BDS-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.interactions[0].partnerName").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.interactions[0].partnerBdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.interactions[0].partnerReview").isEqualTo("not_reviewed")
            .jsonPath("$.data.interactions[1].partnerBdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.interactions[1].partnerReview").isEqualTo("approved");
        // a substance no visible product carries is still the stub (Domperidone: D-1 is in no batch)
        web.get().uri("/v1/substances/BDS-000004").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").isEqualTo(true);
        web.get().uri("/v1/substances/BDS-000002").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.review").isEqualTo("not_reviewed");
    }
}
