package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Context-load tests: the API refuses to start without a strong internal token.
 * Command-line args outrank an INTERNAL_API_TOKEN that may be set in the developer's shell.
 * No database is needed: startup never connects, so the 32-character case proves the token is the cause.
 */
class InternalTokenStartupTest {
    private static final String[] BASE = {
        "--server.port=0", "--spring.r2dbc.url=r2dbc:postgresql://localhost:1/none", "--management.server.port=0"};

    private static ConfigurableApplicationContext start(String token) {
        String[] args = new String[BASE.length + 1];
        System.arraycopy(BASE, 0, args, 0, BASE.length);
        args[BASE.length] = "--bddrug.internal-api-token=" + token;
        return SpringApplication.run(BddrugApiApplication.class, args);
    }

    @Test void shortTokenStopsStartup() {
        String shortToken = "x".repeat(31);
        assertThatThrownBy(() -> start(shortToken))
            .hasRootCauseInstanceOf(IllegalStateException.class)
            .rootCause().hasMessageContaining("INTERNAL_API_TOKEN")
            .hasMessageNotContaining(shortToken);
    }

    @Test void missingTokenStopsStartup() {
        assertThatThrownBy(() -> start(""))
            .hasRootCauseInstanceOf(IllegalStateException.class)
            .rootCause().hasMessageContaining("INTERNAL_API_TOKEN");
    }

    @Test void thirtyTwoCharacterTokenStarts() {
        try (ConfigurableApplicationContext ctx = start("y".repeat(32))) {
            assertThat(ctx.isRunning()).isTrue();
        }
    }
}
