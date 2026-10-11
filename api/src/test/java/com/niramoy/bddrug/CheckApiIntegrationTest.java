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
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class CheckApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception { PilotSeed.migrateAndSeed(pg); }

    @Autowired WebTestClient web;

    /** These tests check data shape, so they read with scope=all; visibility has its own tests. */
    private WebTestClient all() { return TestSupport.internal(web); }

    private WebTestClient.ResponseSpec check(String... ids) {
        return all().post().uri("/v1/interactions/check?scope=all").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of(ids))).exchange();
    }

    @Test void warfarinPlusAspirinGivesOneMajorAlertWithText() {
        check("W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.products.length()").isEqualTo(2)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("W-1")
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Warin")
            .jsonPath("$.data.products[0].substances[0].bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.products[0].substances[0].name").isEqualTo("Warfarin")
            .jsonPath("$.data.products[0].substances[0].coverage").isEqualTo("full")
            .jsonPath("$.data.products[1].conceptId").isEqualTo("A-1")
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[0].a.conceptId").isEqualTo("W-1")
            .jsonPath("$.data.alerts[0].a.bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.alerts[0].a.name").isEqualTo("Warfarin")
            .jsonPath("$.data.alerts[0].b.conceptId").isEqualTo("A-1")
            .jsonPath("$.data.alerts[0].b.bdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.alerts[0].b.name").isEqualTo("Aspirin")
            .jsonPath("$.data.alerts[0].actions[0]").isEqualTo("Monitor")
            .jsonPath("$.data.alerts[0].actions[1]").isEqualTo("Avoid")
            .jsonPath("$.data.alerts[0].interaction")
                .isEqualTo("Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.")
            .jsonPath("$.data.alerts[0].management")
                .isEqualTo("Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(false)
            .jsonPath("$.data.alerts[0].source").isEqualTo("DDInter 2.0")
            .jsonPath("$.data.duplicates.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0);
    }

    @Test void productOrderDecidesAlertSides() {
        check("A-1", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].a.conceptId").isEqualTo("A-1")
            .jsonPath("$.data.alerts[0].b.conceptId").isEqualTo("W-1");
    }

    @Test void domperidoneIsListedInNoDataAndNeverOmitted() {
        check("W-1", "D-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.products[1].substances[0].bdsId").isEqualTo("BDS-000004")
            .jsonPath("$.data.products[1].substances[0].coverage").isEqualTo("none")
            .jsonPath("$.data.noData.length()").isEqualTo(1)
            .jsonPath("$.data.noData[0].conceptId").isEqualTo("D-1")
            .jsonPath("$.data.noData[0].bdsId").isEqualTo("BDS-000004")
            .jsonPath("$.data.noData[0].name").isEqualTo("Domperidone");
        // still listed when other products do interact
        check("W-1", "D-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.noData.length()").isEqualTo(1)
            .jsonPath("$.data.noData[0].bdsId").isEqualTo("BDS-000004");
    }

    @Test void twoProductsWithTheSameSubstanceAreDuplicates() {
        check("W-1", "W-2").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.duplicates.length()").isEqualTo(1)
            .jsonPath("$.data.duplicates[0].bdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.duplicates[0].name").isEqualTo("Warfarin")
            .jsonPath("$.data.duplicates[0].conceptIds[0]").isEqualTo("W-1")
            .jsonPath("$.data.duplicates[0].conceptIds[1]").isEqualTo("W-2");
    }

    @Test void chloramphenicolEyeDropsUseTheOphthalmicEntry() {
        // Review Focus 3: the seed has a warfarin pair only on DDInter352 (ophthalmic).
        check("C-EYE", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].a.conceptId").isEqualTo("C-EYE")
            .jsonPath("$.data.alerts[0].a.bdsId").isEqualTo("BDS-000003")
            .jsonPath("$.data.alerts[0].interaction").isEqualTo("Chloramphenicol may increase the serum concentration of warfarin.")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(false);
        // the systemic capsule uses DDInter351, which has no warfarin pair in the seed
        check("C-CAP", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(0);
    }

    @Test void productWithoutClinicalDrugRouteIsAssumed() {
        check("A-NOBDC", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[0].routeAssumed").isEqualTo(true);
    }

    @Test void alertWithoutFetchedTextHasNullText() {
        check("N-1", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].interaction").doesNotExist()
            .jsonPath("$.data.alerts[0].management").doesNotExist()
            .jsonPath("$.data.alerts[0].source").isEqualTo("DDInter 2.0");
    }

    @Test void alertsAreSortedBySeverity() {
        check("N-1", "W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(2)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("major")
            .jsonPath("$.data.alerts[1].severity").isEqualTo("moderate");
    }

    @Test void unmappedProductsAreListedInNoData() {
        check("X-NOMAP", "X-NOSUB", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.noData.length()").isEqualTo(2)
            .jsonPath("$.data.noData[0].conceptId").isEqualTo("X-NOMAP")
            .jsonPath("$.data.noData[0].bdsId").doesNotExist()
            .jsonPath("$.data.noData[0].name").isEqualTo("Unknown herb")
            .jsonPath("$.data.noData[1].conceptId").isEqualTo("X-NOSUB")
            .jsonPath("$.data.noData[1].bdsId").doesNotExist()
            .jsonPath("$.data.noData[1].name").isEqualTo("Newmol")
            .jsonPath("$.data.products[1].substances[0].name").isEqualTo("Newmol")
            .jsonPath("$.data.products[1].substances[0].coverage").isEqualTo("none");
    }

    private void expectInvalid(WebTestClient.ResponseSpec spec) {
        spec.expectStatus().isBadRequest()
            .expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.data").doesNotExist()
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY")
            .jsonPath("$.metadata.requestId").exists();
    }

    @Test void validationErrorsUseTheEnvelope() {
        expectInvalid(check("W-1"));
        expectInvalid(check());
        expectInvalid(check("W-1", "W-1"));
        expectInvalid(check(IntStream.rangeClosed(1, 21).mapToObj(i -> "P-" + i).toArray(String[]::new)));
        expectInvalid(check("W-1", " "));
        expectInvalid(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{}").exchange());
        expectInvalid(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{not json").exchange());
        expectInvalid(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON).exchange());
        check("W-1").expectBody().jsonPath("$.errors[0].field").isEqualTo("conceptIds");
    }

    @Test void twentyProductsIsTheUpperBound() {
        String[] ids = IntStream.rangeClosed(1, 20).mapToObj(i -> "P-" + i).toArray(String[]::new);
        // 20 is valid input, so the request gets past validation and fails on the unknown IDs instead.
        check(ids).expectStatus().isNotFound()
            .expectBody().jsonPath("$.message").isEqualTo("Product not found: P-1");
    }

    @Test void unknownConceptIdIs404() {
        check("W-1", "does-not-exist").expectStatus().isNotFound()
            .expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND")
            .jsonPath("$.errors[0].field").isEqualTo("conceptIds")
            .jsonPath("$.message").isEqualTo("Product not found: does-not-exist");
    }
}
