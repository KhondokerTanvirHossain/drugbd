package com.niramoy.bddrug;

import org.flywaydb.core.Flyway;
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
import java.sql.DriverManager;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) {
        r.add("spring.r2dbc.url", () -> "r2dbc:postgresql://" + pg.getHost() + ":" + pg.getFirstMappedPort() + "/" + pg.getDatabaseName());
        r.add("spring.r2dbc.username", pg::getUsername);
        r.add("spring.r2dbc.password", pg::getPassword);
    }

    @BeforeAll static void seed() throws Exception {
        Flyway.configure().dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
            .locations("filesystem:../db/migrations").load().migrate();
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()); var s = c.createStatement()) {
            s.execute("""
                INSERT INTO curated.brand_product VALUES
                 ('341-0160-020--tericin','341-0160-020','Tericin','Beacon Pharmaceuticals PLC','Injection','Amphotericin B 50 mg/vial',NULL,now()),
                 ('000-0000-001--pct-100','000-0000-001','PCT 100% Max','Test Pharma','Tablet','Paracetamol 500 mg',NULL,now()),
                 ('000-0000-002--no-map','000-0000-002','Nomap','Test Pharma','Cream','Unknown herb',NULL,now());
                INSERT INTO curated.brand_product_ingredient VALUES ('341-0160-020--tericin','XM5TR4','Amphotericin B');
                """);
        }
    }

    @Autowired WebTestClient web;

    @Test void searchesByIngredientTextCaseInsensitive() {
        web.get().uri("/v1/products?q=AMPHOTERICIN").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data[0].tradeName").isEqualTo("Tericin")
            .jsonPath("$.metadata.requestId").exists();
    }
    @Test void wildcardCharactersAreLiteral() {
        web.get().uri("/v1/products?q={q}", "%%").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(0);
        web.get().uri("/v1/products?q={q}", "100%").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data[0].tradeName").isEqualTo("PCT 100% Max");
    }
    @Test void bengaliQueryReturnsEmptyNotError() {
        web.get().uri("/v1/products?q={q}", "নাপা").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(0);
    }
    @Test void shortQueryIs400WithEnvelope() {
        web.get().uri("/v1/products?q=a").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY");
    }
    @Test void detailIncludesIngredients() {
        web.get().uri("/v1/products/341-0160-020--tericin").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.ingredients[0].xmCode").isEqualTo("XM5TR4");
    }
    @Test void detailWithoutMappingHasEmptyIngredients() {
        web.get().uri("/v1/products/000-0000-002--no-map").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.ingredients.length()").isEqualTo(0);
    }
    @Test void unknownProductIs404() {
        web.get().uri("/v1/products/does-not-exist").exchange().expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
    }
}
