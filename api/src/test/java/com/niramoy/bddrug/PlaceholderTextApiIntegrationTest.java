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

/**
 * Rows stored before the ETL placeholder rule hold DDInter's literal "None" / "-" / "" texts. The API serves null
 * for them (defence in depth), so no page can print a placeholder that reads like "no interaction".
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class PlaceholderTextApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        TestSupport.exec(pg, """
            UPDATE curated.ddinter_interaction_text SET interaction = 'None', management = ' - ' WHERE interaction_id = 'IA-2';
            UPDATE curated.ddinter_interaction_text SET management = 'N/A' WHERE interaction_id = 'IA-1';
            UPDATE curated.ddinter_disease SET text = 'None' WHERE interaction_id = 'DIS-2';
            UPDATE curated.ddinter_food SET description = 'null', management = '' WHERE interaction_id = 'FD-1';
            """);
    }

    @Autowired WebTestClient web;

    private WebTestClient.ResponseSpec check(String... ids) {
        return TestSupport.internal(web).post().uri("/v1/interactions/check?scope=all").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of(ids))).exchange();
    }

    @Test void placeholderInteractionAndManagementAreNullOnTheChecker() {
        check("C-EYE", "W-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts.length()").isEqualTo(1)
            .jsonPath("$.data.alerts[0].severity").isEqualTo("moderate")
            .jsonPath("$.data.alerts[0].interaction").doesNotExist()
            .jsonPath("$.data.alerts[0].management").doesNotExist();
    }

    @Test void aRealTextIsKeptWhenOnlyTheOtherFieldIsAPlaceholder() {
        check("W-1", "A-1").expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.alerts[0].interaction")
                .isEqualTo("Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.")
            .jsonPath("$.data.alerts[0].management").doesNotExist();
    }

    @Test void placeholderDiseaseAndFoodTextsAreNullOnTheSubstance() {
        TestSupport.internal(web).get().uri("/v1/substances/BDS-000001?scope=all").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.diseases.length()").isEqualTo(2)
            .jsonPath("$.data.diseases[0].text").isEqualTo("Warfarin increases bleeding risk.")
            .jsonPath("$.data.diseases[1].diseaseName").isEqualTo("Liver disease")
            .jsonPath("$.data.diseases[1].text").doesNotExist()
            .jsonPath("$.data.foods[0].food").isEqualTo("Vitamin K rich foods")
            .jsonPath("$.data.foods[0].description").doesNotExist()
            .jsonPath("$.data.foods[0].management").doesNotExist();
    }
}
