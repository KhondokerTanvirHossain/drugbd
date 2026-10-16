package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PublicPairReviews;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.4 P10 across batches. Napa (N-1) is approved in X-1; Warin (W-1) in X-1 and Coumarol (W-2) in X-2 (two batches,
 * one partner substance); Motigut (D-1, no data) in X-2; Ecosprin (A-1) is pending; Warremo was approved, then removed
 * from its batch file.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductInteractionsApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('W-REM','014','Warremo','Test Pharma','Tablet','Warfarin Sodium 5 mg','BDC-000001','parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('W-REM','XM5S93','Warfarin');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('X-1', 3, now() - interval '2 hour'), ('X-2', 4, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('X-1','DGDA-Drugs','N-1','ok',NULL, now() - interval '2 hour'),
             ('X-1','DGDA-Drugs','W-1','ok',NULL, now() - interval '2 hour'),
             ('X-1','DGDA-Drugs','A-1','pending',NULL, now() - interval '2 hour'),
             ('X-2','DGDA-Drugs','W-2','ok',NULL, now() - interval '1 hour'),
             ('X-2','DGDA-Drugs','D-1','ok',NULL, now() - interval '1 hour'),
             ('X-2','DGDA-Drugs','C-EYE','ok',NULL, now() - interval '1 hour'),
             ('X-2','DGDA-Drugs','W-REM','ok','removed from batch file', now() - interval '1 hour');
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at)
              VALUES ('DDInter14','DDInter1951','reviewed','','%s','{}','senior@example.org','senior','2026-10-16T05:20:00Z');
            """.formatted(new PublicPairReviews.Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null).hash()));
    }

    @Autowired WebTestClient web;

    @Test void partnersFromEveryBatchGroupedByPartnerSubstance() {
        String body = new String(web.get().uri("/v1/products/N-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.conceptId").isEqualTo("N-1")
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.totalPartners").isEqualTo(2)
            .jsonPath("$.data.partners.length()").isEqualTo(1)
            .jsonPath("$.data.partners[0].substance.name").isEqualTo("Acetaminophen")
            .jsonPath("$.data.partners[0].partnerSubstance.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.partners[0].partnerSubstance.name").isEqualTo("Warfarin")
            .jsonPath("$.data.partners[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.partners[0].ddinterA").isEqualTo("DDInter14")
            .jsonPath("$.data.partners[0].ddinterB").isEqualTo("DDInter1951")
            .jsonPath("$.data.partners[0].source").isEqualTo("DDInter 2.0")
            .jsonPath("$.data.partners[0].brandCount").isEqualTo(2)
            .jsonPath("$.data.partners[0].brands[0].tradeName").isEqualTo("Coumarol")
            .jsonPath("$.data.partners[0].brands[1].tradeName").isEqualTo("Warin")
            .jsonPath("$.data.partners[0].pairReview.state").isEqualTo("reviewed")
            .jsonPath("$.data.partners[0].pairReview.reviewedAt").isEqualTo("2026-10-16T05:20:00Z")
            .jsonPath("$.data.notChecked.length()").isEqualTo(1)
            .jsonPath("$.data.notChecked[0].partnerSubstance.name").isEqualTo("Domperidone")
            .jsonPath("$.data.notChecked[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.notChecked[0].brandCount").isEqualTo(1)
            .jsonPath("$.data.notChecked[0].side").isEqualTo("partner")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        // a pending partner and a removed partner are never shown (§7.4 visibility rule, PO D7)
        assertThat(body).doesNotContain("Ecosprin", "A-1", "Warremo", "W-REM", "Acetylsalicylic acid");
    }

    /** Final review finding 1 (G3): a public product with no interaction data lists every public partner as not checked. */
    @Test void aNoDataProductListsEveryPublicPartnerAsNotCheckedNeverEmpty() {
        web.get().uri("/v1/products/D-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.totalPartners").isEqualTo(3)
            .jsonPath("$.data.partners.length()").isEqualTo(0)
            .jsonPath("$.data.notChecked.length()").isEqualTo(3)
            .jsonPath("$.data.notChecked[*].substance.name").value(v -> assertThat(v.toString()).doesNotContain("Acetaminophen", "Warfarin"))
            .jsonPath("$.data.notChecked[0].substance.name").isEqualTo("Domperidone")
            .jsonPath("$.data.notChecked[0].partnerSubstance.name").isEqualTo("Acetaminophen")
            .jsonPath("$.data.notChecked[0].reason").isEqualTo("no_data")
            .jsonPath("$.data.notChecked[0].side").isEqualTo("this")
            .jsonPath("$.data.notChecked[2].partnerSubstance.name").isEqualTo("Warfarin")
            .jsonPath("$.data.notChecked[2].brandCount").isEqualTo(2);
    }

    @Test void aProductThatIsNotPublicIsTheStubAndUnknownIs404() {
        web.get().uri("/v1/products/A-1/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").isEqualTo(true)
            .jsonPath("$.data.status").isEqualTo("not_reviewed")
            .jsonPath("$.data.partners").doesNotExist();
        web.get().uri("/v1/products/W-REM/interactions").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.status").isEqualTo("removed");
        web.get().uri("/v1/products/nope/interactions").exchange().expectStatus().isNotFound();
    }

    @Test void pagesAndBadPages() {
        web.get().uri("/v1/products/N-1/interactions?page=1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.page").isEqualTo(1)
            .jsonPath("$.data.totalPartners").isEqualTo(2)
            .jsonPath("$.data.partners.length()").isEqualTo(0);
        web.get().uri("/v1/products/N-1/interactions?page=-1").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].field").isEqualTo("page");
    }
}
