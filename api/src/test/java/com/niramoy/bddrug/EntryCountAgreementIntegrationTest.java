package com.niramoy.bddrug;

import com.jayway.jsonpath.JsonPath;
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
import java.util.Map;
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §6.5 item 4 and §6.6 show the same per-entry DDInter numbers on two public pages (§5.6.1: "112 for the chosen entry and
 * 654 for all entries"): the substance page's entries carry exactly what the product page gives for that substance.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class EntryCountAgreementIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('E-1', 3, now());
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('E-1','DGDA-Drugs','W-1','ok', now()), ('E-1','DGDA-Drugs','C-EYE','ok', now()), ('E-1','DGDA-Drugs','N-1','ok', now());
            """);
    }

    @Autowired WebTestClient web;

    static final String FIELDS = "['ddinterId','name','routeScope','counts','diseaseCount','foodCount']";

    @Test void entryCountsAgreeWithTheProductPage() {
        for (String[] pair : new String[][]{{"BDS-000003", "C-EYE"}, {"BDS-000001", "W-1"}, {"BDS-000005", "N-1"}}) {
            List<Map<String, Object>> onSubstance = JsonPath.read(body("/v1/substances/" + pair[0]), "$.data.entries[*]" + FIELDS);
            List<Map<String, Object>> onProduct = JsonPath.read(body("/v1/products/" + pair[1]),
                "$.data.clinicalDrug.ingredients[0].summary.ddinter.entries[*]" + FIELDS);
            assertThat(onSubstance).as(pair[0]).isNotEmpty().isEqualTo(onProduct);
        }
    }

    private String body(String uri) {
        return new String(web.get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8);
    }
}
