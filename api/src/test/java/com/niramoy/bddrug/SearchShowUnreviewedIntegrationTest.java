package com.niramoy.bddrug;

import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * SearchApiIntegrationTest's fixtures with the switch on (show mode, spec §6.3, §7.4.1, §11.3, D74). Pending A-1 (Ecosprin)
 * and W-2 (Coumarol) are full hits, labelled not_reviewed and matched on generic content and substance names as approved
 * hits are; approved hits come first. Products in no batch (A-NOBDC, C-EYE, …) stay stubs matched on trade name and DAR
 * only (D16). The suggestion and its re-check follow the visible set. Tests whose assertions hold in both modes are
 * inherited unchanged.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class SearchShowUnreviewedIntegrationTest extends SearchApiIntegrationTest {

    @Override @Order(1) @Test void darPrefixAndStubsMatchOnTradeNameAndDarOnly() {
        web.get().uri("/v1/search?q=008").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.products[0].matchedOn").isEqualTo("dar");
        // a visible unapproved product is a full hit, found by its trade name, its generic content and its substance
        web.get().uri("/v1/search?q=ecosprin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.products[0].hidden").doesNotExist()
            .jsonPath("$.data.products[0].status").isEqualTo("not_reviewed")
            .jsonPath("$.data.products[0].review").isEqualTo("not_reviewed")
            .jsonPath("$.data.products[0].clinicalDrug.bdcId").isEqualTo("BDC-000002");
        web.get().uri("/v1/search?q={q}", "aspirin 75").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[?(@.conceptId == 'A-1')].matchedOn").isEqualTo(List.of("generic"));
        web.get().uri("/v1/search?q=acetylsalicylic").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.substances[0].bdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.substances[0].review").isEqualTo("not_reviewed")
            .jsonPath("$.data.substances[0].productCount").isEqualTo(1)
            .jsonPath("$.data.substances[0].approvedProductCount").isEqualTo(0)
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("A-1"))
            .jsonPath("$.data.products[0].matchedOn").isEqualTo("substance");
        // a hidden product (in no batch) is a stub, found by trade name or DAR only, never by its composition (D16)
        String stub = body("/v1/search?q=asprin");
        assertThat(stub).contains("\"conceptId\":\"A-NOBDC\"", "\"status\":\"not_reviewed\"", "\"hidden\":true");
        assertThat(stub).doesNotContain("herb", "genericContentRaw", "Test Pharma");
        assertThat(body("/v1/search?q=aspirin")).doesNotContain("A-NOBDC", "Asprin Plus");
    }

    @Override @Order(1) @Test void orderIsSubstancesThenApprovedThenStubs() {
        // W-1 (approved) before W-2 (not reviewed); both full hits through the substance
        web.get().uri("/v1/search?q=warfarin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(3)
            .jsonPath("$.data.counts.products").isEqualTo(2)
            .jsonPath("$.data.substances[0].preferredName").isEqualTo("Warfarin")
            .jsonPath("$.data.substances[0].review").isEqualTo("approved")
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("W-1", "W-2"))
            .jsonPath("$.data.products[*].review").isEqualTo(List.of("approved", "not_reviewed"));
        web.get().uri("/v1/search?q=o").exchange().expectStatus().isBadRequest();
        web.get().uri("/v1/search?q=coumarol").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].hidden").doesNotExist()
            .jsonPath("$.data.products[0].review").isEqualTo("not_reviewed");
        // a stub comes after every full hit: Optimycin (C-EYE) is in no batch
        web.get().uri("/v1/search?q=optimycin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].hidden").isEqualTo(true);
    }

    // §11.3 show mode: the suggestion follows the visible set; back in review keeps a record visible, removal hides it
    @Override @Order(2) @Test void warfrinSuggestsWarfarinUntilItLeavesPublicView() throws Exception {
        web.get().uri("/v1/search?q=warfrin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(0)
            .jsonPath("$.data.suggestion").isEqualTo("Warfarin");
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('Q-2', 2, now() + interval '1 minute');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at)
              VALUES ('Q-2','DGDA-Drugs','W-1','pending', now() + interval '1 minute');
            """);
        web.get().uri("/v1/search?q=warfrin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.suggestion").isEqualTo("Warfarin");
        // both warfarin products leave their batch files after the index was built: the re-check drops the name (§7.4)
        exec(pg, """
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at)
              VALUES ('Q-2','DGDA-Drugs','W-2','pending','removed from batch file', now() + interval '1 minute');
            UPDATE ops.batch_item SET note = 'removed from batch file' WHERE batch_id = 'Q-2' AND concept_id = 'W-1';
            """);
        web.get().uri("/v1/search?q=warfrin").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.suggestion").value(v -> assertThat(v).isNull());
    }
}
