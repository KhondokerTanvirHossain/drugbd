package com.niramoy.bddrug;

import com.jayway.jsonpath.JsonPath;
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
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.4.1 (D74), §11.3: in show mode a record's public label is the same on every endpoint that names it (search, product,
 * P10 brand, P8 product, substance products, suggest, P17 browse, check products and sides, stats item), substance and
 * clinical-drug labels follow the carried rule, and the label agrees with the review desk's display status (ReviewQueryService): approved
 * exactly when the desk says approved, problem for an issue or a failed check, not_reviewed for pending, engineer checked,
 * back in review and a dismissed issue. Fixtures: PublicVisibilityMatrixIntegrationTest's.
 */
@Testcontainers
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
@AutoConfigureWebTestClient
class PublicLabelIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }
    @BeforeAll static void seed() throws Exception { PublicVisibilityMatrixIntegrationTest.seedFixtures(pg); }

    @Autowired WebTestClient web;

    /** concept id → (digit n, expected label, the desk's display status). */
    static final Map<String, String[]> EXPECTED = Map.of(
        "M-PUB", new String[]{"1", "approved", "approved"},
        "M-PEND", new String[]{"2", "not_reviewed", "pending"},
        "M-ENG", new String[]{"3", "not_reviewed", "engineer_checked"},
        "M-ISS", new String[]{"4", "problem", "issue"},
        "M-BACK", new String[]{"5", "not_reviewed", "back_in_review"},
        "M-DIS", new String[]{"7", "not_reviewed", "pending"},
        "M-FAIL", new String[]{"9", "problem", "pending"});

    private String get(String uri, Object... vars) {
        return new String(web.get().uri(uri, vars).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8);
    }

    private static Object one(String json, String path) {
        List<Object> found = JsonPath.read(json, path);
        assertThat(found).as(path).hasSize(1);
        return found.get(0);
    }

    @Test void theLabelIsTheSameEverywhereAndAgreesWithTheDesk() {
        String desk = new String(TestSupport.internal(web).get().uri("/v1/review/batches/M-1/items?size=50").exchange()
            .expectStatus().isOk().expectBody().returnResult().getResponseBody(), StandardCharsets.UTF_8);
        String stats = get("/v1/stats");
        String pubolP10 = get("/v1/products/{id}/interactions", "M-PUB");
        String pendP10 = get("/v1/products/{id}/interactions", "M-PEND");
        String check = new String(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.copyOf(EXPECTED.keySet()))).exchange().expectStatus().isOk().expectBody()
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        EXPECTED.forEach((id, e) -> {
            String n = e[0], label = e[1];
            assertThat(one(desk, "$.data.items[?(@.conceptId == '" + id + "')].displayStatus")).as(id + " desk").isEqualTo(e[2]);
            assertThat(JsonPath.<String>read(get("/v1/products/{id}", id), "$.data.review")).as(id + " product").isEqualTo(label);
            String trade = JsonPath.read(get("/v1/products/{id}", id), "$.data.tradeName");
            assertThat(one(get("/v1/search?q={q}", trade), "$.data.products[?(@.conceptId == '" + id + "')].review")).as(id + " search")
                .isEqualTo(label);
            assertThat(one(get("/v1/products/suggest?q={q}", trade), "$.data[?(@.conceptId == '" + id + "')].review")).as(id + " suggest")
                .isEqualTo(label);
            assertThat(one(get("/v1/products/browse?letter={l}", trade.substring(0, 1)), "$.data.products[?(@.conceptId == '" + id +
                "')].review")).as(id + " browse").isEqualTo(label);
            assertThat(one(get("/v1/clinical-drugs/{id}", "BDC-00090" + n), "$.data.products[?(@.conceptId == '" + id + "')].review"))
                .as(id + " P8").isEqualTo(label);
            assertThat(JsonPath.<String>read(get("/v1/clinical-drugs/{id}", "BDC-00090" + n), "$.data.review")).as(id + " P8 carried")
                .isEqualTo(label);
            String substance = get("/v1/substances/{id}", "BDS-00090" + n);
            assertThat(one(substance, "$.data.products[?(@.conceptId == '" + id + "')].review")).as(id + " substance").isEqualTo(label);
            assertThat(JsonPath.<String>read(substance, "$.data.review")).as(id + " substance carried").isEqualTo(label);
            assertThat(one(check, "$.data.products[?(@.conceptId == '" + id + "')].review")).as(id + " check").isEqualTo(label);
            assertThat(one(stats, "$.data.batches[0].items[?(@.conceptId == '" + id + "')].review")).as(id + " stats").isEqualTo(label);
            if (!id.equals("M-PUB")) {
                assertThat(one(pubolP10, "$.data.partners[*].brands[?(@.conceptId == '" + id + "')].review")).as(id + " P10 brand")
                    .isEqualTo(label);
                assertThat(one(pubolP10, "$.data.partners[?(@.partnerSubstance.bdsId == 'BDS-00090" + n + "')].partnerReview"))
                    .as(id + " P10 group").isEqualTo(label);
            }
        });
        List<Object> sides = JsonPath.read(check, "$.data.alerts[*].b.review");
        assertThat(sides).isNotEmpty();
        assertThat(JsonPath.<String>read(pendP10, "$.data.review")).isEqualTo("not_reviewed");
        assertThat(one(pendP10, "$.data.partners[?(@.partnerSubstance.bdsId == 'BDS-000901')].partnerReview")).isEqualTo("approved");
    }
}
