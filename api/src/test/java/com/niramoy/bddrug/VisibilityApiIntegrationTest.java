package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Review Focus 1 at API level: an anonymous (scope=public) request never sees an unapproved record.
 * Approved here: W-1, N-1 and C-CAP (C-CAP's latest batch item is ok). Hidden: A-1 (pending), C-EYE (issue),
 * W-2 (approved in an older batch, pending in the newer one) and every product without a batch item.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class VisibilityApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES
             ('V-1',4, now() - interval '2 hour'), ('V-old',2, now() - interval '3 hour'), ('V-new',2, now() - interval '1 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('V-1','DGDA-Drugs','W-1','ok', now() - interval '2 hour'),
             ('V-1','DGDA-Drugs','A-1','pending', now() - interval '2 hour'),
             ('V-1','DGDA-Drugs','C-EYE','issue', now() - interval '2 hour'),
             ('V-1','DGDA-Drugs','N-1','ok', now() - interval '2 hour'),
             ('V-old','DGDA-Drugs','W-2','ok', now() - interval '3 hour'),
             ('V-old','DGDA-Drugs','C-CAP','pending', now() - interval '3 hour'),
             ('V-new','DGDA-Drugs','W-2','pending', now() - interval '1 hour'),
             ('V-new','DGDA-Drugs','C-CAP','ok', now() - interval '1 hour');
            """);
    }

    @Autowired WebTestClient web;

    private static String str(byte[] body) { return new String(body, StandardCharsets.UTF_8); }

    // ---- search

    @Test void publicSearchListsApprovedProductsOnly() {
        web.get().uri("/v1/products?q=warfarin").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(1)
            .jsonPath("$.data[0].conceptId").isEqualTo("W-1")
            .jsonPath("$.data[0].reviewStatus").isEqualTo("ok");
        web.get().uri("/v1/products?q=warfarin&scope=public").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(1);
        web.get().uri("/v1/products?q=aspirin").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(0);
    }

    @Test void scopeAllSearchShowsEverythingWithReviewStatus() {
        internal(web).get().uri("/v1/products?q=warfarin&scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(2)
            .jsonPath("$.data[0].conceptId").isEqualTo("W-2")
            .jsonPath("$.data[0].reviewStatus").isEqualTo("pending")
            .jsonPath("$.data[1].conceptId").isEqualTo("W-1")
            .jsonPath("$.data[1].reviewStatus").isEqualTo("ok");
    }

    @Test void scopeAllNeedsTheToken() {
        for (String uri : new String[]{"/v1/products?q=warfarin&scope=all", "/v1/products/A-1?scope=all",
                                       "/v1/substances/BDS-000002?scope=all", "/v1/products/loaded?scope=all"}) {
            web.get().uri(uri).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED").jsonPath("$.data").doesNotExist();
            web.get().uri(uri).header(HEADER, "not-the-token").exchange().expectStatus().isUnauthorized();
        }
        web.post().uri("/v1/interactions/check?scope=all").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of("W-1", "A-1"))).exchange().expectStatus().isUnauthorized();
    }

    @Test void unknownScopeIs400() {
        web.get().uri("/v1/products?q=warfarin&scope=everything").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo("scope");
    }

    // ---- product detail

    private void expectHidden(String conceptId, String tradeName, String status) {
        String body = str(web.get().uri("/v1/products/{id}", conceptId).exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.length()").isEqualTo(4)
            .jsonPath("$.data.conceptId").isEqualTo(conceptId)
            .jsonPath("$.data.tradeName").isEqualTo(tradeName)
            .jsonPath("$.data.reviewStatus").isEqualTo(status)
            .jsonPath("$.data.hidden").isEqualTo(true)
            .returnResult().getResponseBody());
        assertThat(body).doesNotContain("genericContentRaw", "ingredients", "clinicalDrug", "company", "darNumber", "Test Pharma");
    }

    @Test void unapprovedProductDetailIsTheHiddenShape() {
        expectHidden("A-1", "Ecosprin", "pending");
        expectHidden("C-EYE", "Optimycin", "issue");
        expectHidden("D-1", "Motigut", "pending");          // no batch item at all
        expectHidden("W-2", "Coumarol", "pending");         // approved before, re-run in a newer batch
    }

    @Test void approvedProductDetailIsFull() {
        web.get().uri("/v1/products/W-1").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.reviewStatus").isEqualTo("ok")
            .jsonPath("$.data.genericContentRaw").isEqualTo("Warfarin Sodium 5 mg")
            .jsonPath("$.data.ingredients[0].xmCode").isEqualTo("XM5S93")
            .jsonPath("$.data.clinicalDrug.bdcId").isEqualTo("BDC-000001");
        web.get().uri("/v1/products/C-CAP").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").doesNotExist().jsonPath("$.data.company").isEqualTo("Test Pharma");
    }

    @Test void scopeAllProductDetailIsFullWithItsStatus() {
        internal(web).get().uri("/v1/products/A-1?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.reviewStatus").isEqualTo("pending")
            .jsonPath("$.data.genericContentRaw").isEqualTo("Aspirin 75 mg");
    }

    @Test void unknownProductIsStill404() {
        web.get().uri("/v1/products/nope").exchange().expectStatus().isNotFound();
        internal(web).get().uri("/v1/products/nope?scope=all").exchange().expectStatus().isNotFound();
    }

    // ---- substances

    @Test void publicSubstanceListsApprovedProductsOnly() {
        web.get().uri("/v1/substances/BDS-000001").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.preferredName").isEqualTo("Warfarin")
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.products[0].reviewStatus").isEqualTo("ok")
            .jsonPath("$.data.interactions.length()").isEqualTo(5);
        web.get().uri("/v1/substances/BDS-000003").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("C-CAP");
    }

    @Test void substanceWithoutAnApprovedProductIsHidden() {
        String body = str(web.get().uri("/v1/substances/BDS-000002").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(4)
            .jsonPath("$.data.bdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.preferredName").isEqualTo("Aspirin")
            .jsonPath("$.data.reviewStatus").isEqualTo("pending")
            .jsonPath("$.data.hidden").isEqualTo(true)
            .returnResult().getResponseBody());
        assertThat(body).doesNotContain("interactions", "Ecosprin", "DDInter");
        // a substance with no products at all is hidden too
        web.get().uri("/v1/substances/BDS-000004").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.hidden").isEqualTo(true);
        web.get().uri("/v1/substances/BDS-999999").exchange().expectStatus().isNotFound();
    }

    @Test void scopeAllSubstanceShowsEveryProductWithItsStatus() {
        internal(web).get().uri("/v1/substances/BDS-000002?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Asprin Plus")
            .jsonPath("$.data.products[0].reviewStatus").isEqualTo("pending")
            .jsonPath("$.data.products[1].tradeName").isEqualTo("Ecosprin")
            .jsonPath("$.data.interactions.length()").isEqualTo(1);
    }

    // ---- checker

    private WebTestClient.ResponseSpec check(WebTestClient client, String scope, String... ids) {
        return client.post().uri(scope == null ? "/v1/interactions/check" : "/v1/interactions/check?scope=" + scope)
            .contentType(MediaType.APPLICATION_JSON).bodyValue(Map.of("conceptIds", List.of(ids))).exchange();
    }

    @Test void publicCheckMovesUnapprovedProductsToNotReviewed() {
        String body = str(check(web, null, "W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.duplicates.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0)
            .jsonPath("$.data.notReviewed.length()").isEqualTo(1)
            .jsonPath("$.data.notReviewed[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.notReviewed[0].length()").isEqualTo(1)
            .returnResult().getResponseBody());
        assertThat(body).doesNotContain("Ecosprin", "Aspirin");
        // duplicates never reveal a hidden product either
        check(web, "public", "W-1", "W-2").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.duplicates.length()").isEqualTo(0)
            .jsonPath("$.data.notReviewed[0].conceptId").isEqualTo("W-2");
        check(web, null, "A-1", "C-EYE").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(0)
            .jsonPath("$.data.notReviewed.length()").isEqualTo(2)
            .jsonPath("$.data.notReviewed[0].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.notReviewed[1].conceptId").isEqualTo("C-EYE");
    }

    @Test void publicCheckStillAlertsBetweenApprovedProducts() {
        check(web, null, "N-1", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.notReviewed.length()").isEqualTo(0);
        check(web, null, "W-1", "nope").expectStatus().isNotFound();
    }

    @Test void scopeAllCheckUsesEveryProduct() {
        check(internal(web), "all", "W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.notReviewed.length()").isEqualTo(0);
    }

    // ---- light list

    @Test void publicLoadedListHoldsApprovedProductsSortedByTradeName() {
        web.get().uri("/v1/products/loaded").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(3)
            .jsonPath("$.data[0].conceptId").isEqualTo("C-CAP")
            .jsonPath("$.data[0].tradeName").isEqualTo("Chloramex")
            .jsonPath("$.data[0].dosageForm").isEqualTo("Capsule")
            .jsonPath("$.data[0].length()").isEqualTo(3)
            .jsonPath("$.data[1].tradeName").isEqualTo("Napa")
            .jsonPath("$.data[2].tradeName").isEqualTo("Warin");
        web.get().uri("/v1/products/loaded?scope=public").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(3);
    }

    @Test void scopeAllLoadedListHoldsEveryProduct() {
        internal(web).get().uri("/v1/products/loaded?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.length()").isEqualTo(10)
            .jsonPath("$.data[0].tradeName").isEqualTo("Asprin Plus")
            .jsonPath("$.data[1].tradeName").isEqualTo("Chloramex")
            .jsonPath("$.data[9].tradeName").isEqualTo("Warin");
    }
}
