package com.niramoy.bddrug;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import java.sql.DriverManager;

/** Shared wiring for the integration tests: the Postgres container, the internal token and SQL helpers. */
final class TestSupport {
    private TestSupport() {}

    /** A test-only internal token (40 characters); never used outside tests. */
    static final String TOKEN = "test-internal-token-0123456789-abcdefghi";
    static final String HEADER = "X-Internal-Token";

    static void props(DynamicPropertyRegistry r, PostgreSQLContainer<?> pg) {
        r.add("spring.r2dbc.url", () -> "r2dbc:postgresql://" + pg.getHost() + ":" + pg.getFirstMappedPort() + "/" + pg.getDatabaseName());
        r.add("spring.r2dbc.username", pg::getUsername);
        r.add("spring.r2dbc.password", pg::getPassword);
        r.add("bddrug.internal-api-token", () -> TOKEN);
    }

    /** A client that sends the internal token on every request (the reviewer / server-side path). */
    static WebTestClient internal(WebTestClient web) {
        return web.mutate().defaultHeader(HEADER, TOKEN).build();
    }

    static void exec(PostgreSQLContainer<?> pg, String sql) throws Exception {
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()); var s = c.createStatement()) {
            s.execute(sql);
        }
    }

    static long count(PostgreSQLContainer<?> pg, String sql) throws Exception {
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             var s = c.createStatement(); var rs = s.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    static String text(PostgreSQLContainer<?> pg, String sql) throws Exception {
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             var s = c.createStatement(); var rs = s.executeQuery(sql)) {
            return rs.next() ? rs.getString(1) : null;
        }
    }
}
