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
import java.util.LinkedHashMap;
import java.util.Map;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.9.5 "QaRecordsScaleIntegrationTest": 40,000 current items in 20 batches, each with four stage results; every problem
 * filter answers within the §10.6 API p95 (300 ms), and one call runs a constant number of statements (the page with its
 * stage statuses, the total, the page's decisions, and the batch check when a batch is named).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class QaRecordsScaleIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16")
        .withCommand("postgres", "-c", "fsync=off", "-c", "shared_preload_libraries=pg_stat_statements");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    /**
     * The shared 40,000-item seed, then four stage results per item with real evidence shapes: a null strength every 50th,
     * route_assumed true every 40th, an unaligned name every 77th, a warn every 10th, a fail every 100th, a partial parse
     * every 30th, and a decision on every 5th. A quarter of the items carry Domperidone (coverage none).
     */
    static final String QA_SEED = """
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence)
              SELECT bi.batch_id, bi.concept_id, s.stage,
                     CASE WHEN s.stage = 'dgda' AND n % 100 = 0 THEN 'fail' WHEN s.stage = 'ddinter' AND n % 10 = 0 THEN 'warn' ELSE 'ok' END,
                     CASE WHEN s.stage = 'ddinter' AND n % 10 = 0 THEN 'DDInter text not found for DDInter14/DDInter1951' ELSE '' END,
                     CASE s.stage
                       WHEN 'clinical' THEN jsonb_build_object('raw', 'Scale 1 mg', 'parse_status', 'parsed',
                         'parsed', jsonb_build_array(jsonb_build_object('name', 'Scale', 'strength_value', CASE WHEN n % 50 = 0 THEN NULL ELSE '1' END,
                           'strength_unit', 'mg', 'per_value', NULL, 'per_unit', NULL)),
                         'aligned', jsonb_build_array(jsonb_build_object('name', 'Scale', 'bds_id', CASE WHEN n % 77 = 0 THEN NULL ELSE 'BDS-000002' END,
                           'method', 'xm')), 'bdc_id', 'BDC-000002', 'signature', 'tablet|systemic|BDS-000002:75mg/')
                       WHEN 'ddinter' THEN jsonb_build_object('mappings', '[]'::jsonb, 'coverage', '[]'::jsonb, 'pair_count', 3,
                         'text_missing', CASE WHEN n % 10 = 0 THEN '[["DDInter14","DDInter1951"]]'::jsonb ELSE '[]'::jsonb END,
                         'route', 'systemic', 'chosen', '[]'::jsonb, 'route_assumed', n % 40 = 0)
                       ELSE '{}'::jsonb END
              FROM (SELECT batch_id, concept_id, substring(concept_id FROM 3)::int AS n FROM ops.batch_item WHERE concept_id LIKE 'S-%') bi
              CROSS JOIN (VALUES ('dgda'), ('substances'), ('clinical'), ('ddinter')) AS s(stage);
            UPDATE curated.brand_product SET parse_status = 'partial' WHERE concept_id LIKE 'S-%' AND substring(concept_id FROM 3)::int % 30 = 0;
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at)
              SELECT batch_id, concept_id, 'ok', '', 'scale.reviewer@example.org', 'pharmacist', extracted_at + interval '1 minute'
              FROM ops.batch_item WHERE concept_id LIKE 'S-%' AND review = 'ok';
            ANALYZE;
            """;

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, OtherPairsScaleIntegrationTest.SCALE_SEED + QA_SEED + "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;");
    }

    @Autowired WebTestClient web;

    /** Each filter's query and its total over the 40,000 items (S-1 … S-40000; W-1 in S-0 has four ok stages). */
    static final Map<String, Integer> TOTALS = new LinkedHashMap<>();
    static {
        TOTALS.put("filter=strength_missing", 800);
        TOTALS.put("filter=parse_partial", 1333);
        TOTALS.put("filter=route_assumed", 1000);
        TOTALS.put("filter=no_ddinter_data", 10000);
        TOTALS.put("filter=unaligned", 519);
        TOTALS.put("filter=stage_warn", 4000);
        TOTALS.put("filter=stage_warn&stage=ddinter", 4000);
        TOTALS.put("filter=stage_fail", 400);
        TOTALS.put("filter=stage_warn&batch=S-1&page=1", 2000);   // S-1 holds the items with i % 20 = 0, every one a warn
    }

    @Test void everyFilterOverFortyThousandItemsAnswersWithinTheBudget() {
        for (Map.Entry<String, Integer> e : TOTALS.entrySet()) {
            String uri = "/v1/qa/records?" + e.getKey();
            internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.data.total").isEqualTo(e.getValue())
                .jsonPath("$.data.items.length()").isEqualTo(e.getKey().contains("page=1") ? 100 : Math.min(100, e.getValue()));
            Latency.P95s p95 = Latency.p95Samples(() ->
                internal(web).get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult());
            assertThat(p95.best()).as("%s: best of %d p95 samples of 20 calls, each after %d untimed warm-ups: %s",
                e.getKey(), Latency.SAMPLES, Latency.WARM_UPS, p95).isLessThan(Latency.boundMs());
        }
    }

    @Test void oneCallRunsAConstantNumberOfStatements() throws Exception {
        // the page with its stage statuses, the total, the page's decisions; plus the batch check when a batch is named
        assertThat(statementsFor("/v1/qa/records?filter=stage_warn")).isEqualTo(3);
        assertThat(statementsFor("/v1/qa/records?filter=no_ddinter_data&page=9")).isEqualTo(3);
        assertThat(statementsFor("/v1/qa/records?filter=stage_warn&batch=S-1")).isEqualTo(4);
        // a batch with no match: the batch check, the page and the total; an empty page needs no decisions
        assertThat(statementsFor("/v1/qa/records?filter=stage_warn&batch=S-7")).isEqualTo(3);
        // an empty page needs no decisions
        assertThat(statementsFor("/v1/qa/records?filter=stage_fail&page=999")).isEqualTo(2);
        // one batch's items: the batch, its items, their stage results, their decisions
        assertThat(statementsFor("/v1/qa/batches/S-7/items")).isEqualTo(4);
    }

    /** Resets pg_stat_statements, calls {@code uri} once, and returns the calls of the statements that read ops or curated. */
    private long statementsFor(String uri) throws Exception {
        exec(pg, "SELECT pg_stat_statements_reset()");
        // a 2,000-item batch is over WebTestClient's 256 KB default buffer
        internal(web).mutate().codecs(c -> c.defaultCodecs().maxInMemorySize(16 << 20)).build()
            .get().uri(uri).exchange().expectStatus().isOk().expectBody().returnResult();
        String calls = "SELECT coalesce(sum(calls), 0) FROM pg_stat_statements WHERE query ~ '\\m(ops|curated)\\.'";
        long seen = count(pg, calls);
        for (int i = 0; i < 20; i++) {          // a statement's calls land at executor end, just after its rows reach the client
            Thread.sleep(25);
            long again = count(pg, calls);
            if (again == seen) return seen;
            seen = again;
        }
        return seen;
    }
}
