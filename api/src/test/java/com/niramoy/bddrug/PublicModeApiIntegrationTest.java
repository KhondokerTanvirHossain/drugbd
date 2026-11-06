package com.niramoy.bddrug;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.reactive.server.WebTestClient;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * GET /v1/public-mode (§7.4.1, D74): the configured mode, without a token, whatever the scope, no-store; a wrong token is
 * still a 401. The answer is the PublicMode bean: the controller has no persistence port, so no database is needed here.
 */
class PublicModeApiIntegrationTest {
    static final String NO_DB = "spring.r2dbc.url=r2dbc:postgresql://localhost:1/none";
    static final String TOKEN = "bddrug.internal-api-token=" + TestSupport.TOKEN;

    @Nested @SpringBootTest(properties = {NO_DB, TOKEN, "bddrug.public-shows-unreviewed=true"}) @AutoConfigureWebTestClient
    class ShowMode {
        @Autowired WebTestClient web;

        @Test void answersShowUnreviewedWithoutATokenAndIgnoresScope() {
            for (String uri : new String[]{"/v1/public-mode", "/v1/public-mode?scope=all", "/v1/public-mode?scope=public"})
                web.get().uri(uri).exchange().expectStatus().isOk()
                    .expectHeader().cacheControl(org.springframework.http.CacheControl.noStore())
                    .expectBody().jsonPath("$.success").isEqualTo(true).jsonPath("$.data.mode").isEqualTo("show_unreviewed")
                    .jsonPath("$.data.length()").isEqualTo(1);
            TestSupport.internal(web).get().uri("/v1/public-mode").exchange().expectStatus().isOk();
            web.get().uri("/v1/public-mode").header(TestSupport.HEADER, "wrong").exchange().expectStatus().isUnauthorized();
        }
    }

    @Nested @SpringBootTest(properties = {NO_DB, TOKEN, "bddrug.public-shows-unreviewed="}) @AutoConfigureWebTestClient
    class ApprovedOnly {
        @Autowired WebTestClient web;

        @Test void unsetAnswersApprovedOnly() {
            web.get().uri("/v1/public-mode").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.data.mode").isEqualTo("approved_only");
        }
    }

    @Test void theControllerHasNoPersistencePort() throws Exception {
        String src = Files.readString(Path.of("src/main/java/com/niramoy/bddrug/presentation/PublicModeController.java"));
        assertThat(src).doesNotContain("Port", "DatabaseClient", "Service");
    }
}
