package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * ProductInteractionsApiIntegrationTest's fixtures with the switch on (show mode, spec §7.4.1, §11.3, D74): A-1 (Ecosprin,
 * pending) is visible and labelled not_reviewed, so it is a partner and has its own P10 list; W-REM (removed) stays the
 * stub and is never a partner. Tests whose assertions hold in both modes are inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class ProductInteractionsShowUnreviewedIntegrationTest extends ProductInteractionsApiIntegrationTest {

    @Test void eachBrandCarriesItsLabelAndEachGroupTheWorst() {
        String body = new String(web.get().uri("/v1/products/W-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.partners[?(@.partnerSubstance.name == 'Aspirin')].partnerReview").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.partners[?(@.partnerSubstance.name == 'Aspirin')].brands[0].tradeName").isEqualTo(List.of("Ecosprin"))
            .jsonPath("$.data.partners[?(@.partnerSubstance.name == 'Aspirin')].brands[0].review").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.partners[?(@.partnerSubstance.name == 'Acetaminophen')].partnerReview").isEqualTo(List.of("approved"))
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("Warremo", "W-REM", "senior@example.org");
    }

    @Override @Test void aNoDataProductListsEveryPublicPartnerAsNotCheckedNeverEmpty() {
        // Aspirin (A-1, visible now) joins Acetaminophen, Chloramphenicol and Warfarin
        web.get().uri("/v1/products/D-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.totalPartners").isEqualTo(4)
            .jsonPath("$.data.partners.length()").isEqualTo(0)
            .jsonPath("$.data.notChecked.length()").isEqualTo(4)
            .jsonPath("$.data.notChecked[0].substance.name").isEqualTo("Domperidone")
            .jsonPath("$.data.notChecked[0].partnerSubstance.name").isEqualTo("Acetaminophen")
            .jsonPath("$.data.notChecked[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.notChecked[0].side").isEqualTo("this")
            .jsonPath("$.data.notChecked[?(@.partnerSubstance.name == 'Aspirin')].partnerReview").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.notChecked[?(@.partnerSubstance.name == 'Warfarin')].brandCount").isEqualTo(List.of(2));
    }

    @Override @Test void aProductThatIsNotPublicIsTheStubAndUnknownIs404() {
        // A-1 is visible in show mode: its own list, labelled; the removed product is still the stub
        web.get().uri("/v1/products/A-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.conceptId").isEqualTo("A-1")
            .jsonPath("$.data.review").isEqualTo("not_reviewed");
        web.get().uri("/v1/products/W-REM/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").isEqualTo(true)
            .jsonPath("$.data.status").isEqualTo("removed")
            .jsonPath("$.data.partners").doesNotExist();
        web.get().uri("/v1/products/nope/interactions").exchange().expectStatus().isNotFound();
    }
}
