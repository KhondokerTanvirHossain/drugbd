package com.niramoy.bddrug;

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

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SubstanceApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception { PilotSeed.migrateAndSeed(pg); }

    @Autowired WebTestClient web;

    /** These tests check data shape, so they read with scope=all; visibility has its own tests. */
    private WebTestClient all() { return TestSupport.internal(web); }

    @Test void acetaminophenListsNamesAndCodesIncludingAtc() {
        all().get().uri("/v1/substances/BDS-000005?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data.bdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.preferredName").isEqualTo("Acetaminophen")
            // Review Focus 1: Paracetamol and Acetaminophen are one substance, both names recorded
            .jsonPath("$.data.names[?(@.name == 'Paracetamol')].nameType").isEqualTo("dgda_content")
            .jsonPath("$.data.names[?(@.name == 'Acetaminophen')].nameType").isEqualTo("icd11")
            .jsonPath("$.data.names[?(@.name == 'Paracetamol')].source").isEqualTo("dgda-ocl")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].code").isEqualTo("N02BE01")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].method").isEqualTo("rxnav-exact")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].source").isEqualTo("rxnav")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].confidence").isEqualTo(1.0)
            .jsonPath("$.data.codes[?(@.system == 'ATC')].routeScope").isEqualTo("any")
            .jsonPath("$.data.codes[?(@.system == 'RXCUI')].code").isEqualTo("161")
            .jsonPath("$.data.codes[0].system").isEqualTo("ICD11_XM")
            .jsonPath("$.data.coverage.coverage").isEqualTo("full")
            .jsonPath("$.data.coverage.note").isEqualTo("DDInter DDInter14")
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("N-1")
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Napa")
            .jsonPath("$.data.products[0].company").isEqualTo("Beximco Pharmaceuticals Ltd");
    }

    @Test void interactionsAreSortedBySeverityThenPartnerName() {
        all().get().uri("/v1/substances/BDS-000001?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.interactions.length()").isEqualTo(5)
            .jsonPath("$.data.interactions[0].severity").isEqualTo("major")
            .jsonPath("$.data.interactions[0].partnerName").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.interactions[0].partnerBdsId").isEqualTo("BDS-000002")
            .jsonPath("$.data.interactions[0].actions[0]").isEqualTo("Monitor")
            .jsonPath("$.data.interactions[0].actions[1]").isEqualTo("Avoid")
            .jsonPath("$.data.interactions[0].interactionId").isEqualTo("IA-1")
            .jsonPath("$.data.interactions[0].routeScope").isEqualTo("systemic")
            .jsonPath("$.data.interactions[1].severity").isEqualTo("moderate")
            .jsonPath("$.data.interactions[1].partnerName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.interactions[1].partnerBdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.interactions[1].interactionId").doesNotExist()
            .jsonPath("$.data.interactions[2].severity").isEqualTo("moderate")
            .jsonPath("$.data.interactions[2].partnerName").isEqualTo("Chloramphenicol")
            .jsonPath("$.data.interactions[2].partnerBdsId").isEqualTo("BDS-000003")
            .jsonPath("$.data.interactions[3].severity").isEqualTo("minor")
            .jsonPath("$.data.interactions[3].partnerName").isEqualTo("Some Herb")
            .jsonPath("$.data.interactions[3].partnerBdsId").doesNotExist()
            .jsonPath("$.data.interactions[4].severity").isEqualTo("unknown")
            .jsonPath("$.data.interactions[4].partnerName").isEqualTo("Alpha Unknown");
    }

    @Test void partnerSideIsChosenFromEitherPairColumn() {
        // Chloramphenicol is ddinter_b of its only pair; its partner is warfarin (ddinter_a), via the systemic entry.
        all().get().uri("/v1/substances/BDS-000003?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.interactions.length()").isEqualTo(1)
            .jsonPath("$.data.interactions[0].partnerName").isEqualTo("Warfarin")
            .jsonPath("$.data.interactions[0].partnerBdsId").isEqualTo("BDS-000001")
            .jsonPath("$.data.interactions[0].routeScope").isEqualTo("systemic")
            // Review Focus 3: route-scoped DDInter entries
            .jsonPath("$.data.codes[?(@.code == 'DDInter351')].routeScope").isEqualTo("systemic")
            .jsonPath("$.data.codes[?(@.code == 'DDInter352')].routeScope").isEqualTo("ophthalmic")
            .jsonPath("$.data.codes[?(@.code == 'DDInter353')].routeScope").isEqualTo("otic")
            .jsonPath("$.data.products.length()").isEqualTo(2);
    }

    @Test void diseasesAndFoodsAreListed() {
        all().get().uri("/v1/substances/BDS-000001?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.diseases.length()").isEqualTo(2)
            .jsonPath("$.data.diseases[0].diseaseName").isEqualTo("Bleeding")
            .jsonPath("$.data.diseases[0].severity").isEqualTo("major")
            .jsonPath("$.data.diseases[0].text").isEqualTo("Warfarin increases bleeding risk.")
            .jsonPath("$.data.diseases[0].refs[0]").isEqualTo("ref one")
            .jsonPath("$.data.diseases[0].routeScope").isEqualTo("systemic")
            .jsonPath("$.data.diseases[1].diseaseName").isEqualTo("Liver disease")
            .jsonPath("$.data.foods.length()").isEqualTo(1)
            .jsonPath("$.data.foods[0].food").isEqualTo("Vitamin K rich foods")
            .jsonPath("$.data.foods[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.foods[0].mechanism").isEqualTo("Antagonism")
            .jsonPath("$.data.foods[0].description").isEqualTo("Vitamin K reduces the effect of warfarin.")
            .jsonPath("$.data.foods[0].management").isEqualTo("Keep vitamin K intake steady.");
    }

    @Test void domperidoneHasCoverageNoneAndNoInteractions() {
        all().get().uri("/v1/substances/BDS-000004?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.coverage.coverage").isEqualTo("none")
            .jsonPath("$.data.coverage.note").isEqualTo("No interaction data in DDInter for this substance")
            .jsonPath("$.data.interactions.length()").isEqualTo(0)
            .jsonPath("$.data.diseases.length()").isEqualTo(0)
            .jsonPath("$.data.foods.length()").isEqualTo(0)
            .jsonPath("$.data.products[0].conceptId").isEqualTo("D-1");
    }

    @Test void unknownSubstanceIs404WithEnvelope() {
        all().get().uri("/v1/substances/BDS-999999?scope=all").exchange().expectStatus().isNotFound()
            .expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND")
            .jsonPath("$.message").isEqualTo("Substance not found");
    }
}
