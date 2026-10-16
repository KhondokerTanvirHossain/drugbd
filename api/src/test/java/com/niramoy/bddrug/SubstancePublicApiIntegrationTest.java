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
import java.nio.charset.StandardCharsets;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §6.6 data under public scope. Approved: W-1 (Warfarin), C-CAP (Chloramphenicol capsule), N-1 (Napa). Pending: A-1
 * (Aspirin), C-EYE. RxNav and OCL fetch times are seeded so the "fetched on" dates are known (§5.6.6).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class SubstancePublicApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('S-1', 5, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('S-1','DGDA-Drugs','W-1','ok', now()), ('S-1','DGDA-Drugs','C-CAP','ok', now()), ('S-1','DGDA-Drugs','N-1','ok', now()),
             ('S-1','DGDA-Drugs','A-1','pending', now()), ('S-1','DGDA-Drugs','C-EYE','pending', now());
            INSERT INTO raw.ocl_concept (source, concept_id, payload, fetched_at) VALUES ('DGDA-Drugs','N-1','{}','2026-10-11T21:00:00Z');
            INSERT INTO raw.http_snapshot (source, request_key, status, body, fetched_at) VALUES
             ('rxnav','GET /REST/rxcui/161/properties.json',200,'{}','2026-10-11T22:00:00Z'),
             ('rxnav','GET /REST/rxcui/161/allProperties.json?prop=codes',200,'{}','2026-10-11T22:05:00Z');
            UPDATE curated.ddinter_drug SET fetched_at = '2026-10-12T01:00:00Z' WHERE ddinter_id = 'DDInter14';
            """);
    }

    @Autowired WebTestClient web;

    @Test void codesCarryTheirSourceLinksAndFetchTimes() {
        web.get().uri("/v1/substances/BDS-000005").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.codes[?(@.system == 'RXCUI')].sourceLink.label").isEqualTo("RxNav")
            .jsonPath("$.data.codes[?(@.system == 'RXCUI')].sourceLink.fetchedAt").isEqualTo("2026-10-11T22:00:00Z")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].sourceLink.fetchedAt").isEqualTo("2026-10-11T22:05:00Z")
            .jsonPath("$.data.codes[?(@.system == 'ICD11_XM')].sourceLink.fetchedAt").isEqualTo("2026-10-11T21:00:00Z")
            .jsonPath("$.data.codes[?(@.system == 'DDINTER')].sourceLink.fetchedAt").isEqualTo("2026-10-12T01:00:00Z")
            .jsonPath("$.data.codes[?(@.system == 'ATC')].source").isEqualTo("rxnav");
    }

    @Test void everyEntryHasItsCountsAndRoute() {
        web.get().uri("/v1/substances/BDS-000003").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.entries.length()").isEqualTo(3)
            .jsonPath("$.data.entries[0].ddinterId").isEqualTo("DDInter351")
            .jsonPath("$.data.entries[0].routeScope").isEqualTo("systemic")
            .jsonPath("$.data.entries[0].counts.moderate").isEqualTo(1)
            .jsonPath("$.data.entries[0].counts.total").isEqualTo(1)
            .jsonPath("$.data.entries[1].ddinterId").isEqualTo("DDInter352")
            .jsonPath("$.data.entries[1].counts.total").isEqualTo(0)
            .jsonPath("$.data.entries[2].routeScope").isEqualTo("otic");
        web.get().uri("/v1/substances/BDS-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.entries[0].diseaseCount").isEqualTo(2)
            .jsonPath("$.data.entries[0].foodCount").isEqualTo(1);
    }

    @Test void clinicalDrugsArePublicOnes() {
        String body = new String(web.get().uri("/v1/substances/BDS-000003").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.clinicalDrugs.length()").isEqualTo(1)
            .jsonPath("$.data.clinicalDrugs[0].bdcId").isEqualTo("BDC-000004")
            .jsonPath("$.data.clinicalDrugs[0].displayName").isEqualTo("Chloramphenicol 250 mg capsule")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("BDC-000003", "eye drops", "Optimycin");
    }

    @Test void aPrivatePartnerSubstanceIsNeverLinked() {
        // Warfarin's pair with Acetylsalicylic acid: Aspirin's only product A-1 is pending, so BDS-000002 is not public.
        web.get().uri("/v1/substances/BDS-000001").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.interactions[0].partnerName").isEqualTo("Acetylsalicylic acid")
            .jsonPath("$.data.interactions[0].partnerBdsId").value(v -> assertThat(v).isNull())
            .jsonPath("$.data.interactions[1].partnerName").isEqualTo("Acetaminophen")
            .jsonPath("$.data.interactions[1].partnerBdsId").isEqualTo("BDS-000005");
        // with the token and scope=all the partner is linked as before
        internal(web).get().uri("/v1/substances/BDS-000001?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.interactions[0].partnerBdsId").isEqualTo("BDS-000002");
    }
}
