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
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import com.niramoy.bddrug.domain.PublicPairReviews;
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §11.3 VisibilityApiIntegrationTest matrix (D28, G3, PO D7) for every public endpoint, with a fixture in each non-public
 * state: pending (Hushpend), engineer checked (Husheng), issue (Hushiss), back in review (Hushback), approved then
 * removed from the batch file (Hushrem), and approved, reported, then dismissed by a senior (Hushdis, P1C D57: pending).
 * Pubol is approved and pairs with every hidden substance's DDInter entry; its pair with Secretolin-P has a current
 * senior review that must never be served (the partner is not public, §7.4).
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class PublicVisibilityMatrixIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    /** Our data for hidden records: substance names, BDS/BDC ids, XM codes, strengths, DDInter texts, notes. */
    static final List<String> MARKERS = List.of("Secretolin", "BDS-000902", "BDS-000903", "BDS-000904", "BDS-000905", "BDS-000906",
        "BDS-000907", "BDC-000902", "BDC-000903", "BDC-000904", "BDC-000905", "BDC-000906", "BDC-000907", "XM9M0", "77.77",
        "SECRET-TEXT", "SECRET-MGMT", "PAIR-NOTE-SECRET", "ISSUE-NOTE-SECRET", "DISMISS-NOTE-SECRET", "Hush Pharma");
    static final List<String> HIDDEN = List.of("M-PEND", "M-ENG", "M-ISS", "M-BACK", "M-REM", "M-DIS");

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        StringBuilder sql = new StringBuilder("""
            INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-000901','Pubolin');
            INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
             ('BDS-000901','ICD11_XM','XM9P01','any','dgda-ocl','xm',1.0), ('BDS-000901','DDINTER','DDInter9901','systemic','ddinter2','drugbank',1.0);
            INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope) VALUES ('DDInter9901','Pubolin','systemic');
            INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES ('BDS-000901','full','x');
            INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route)
              VALUES ('BDC-000901','tablet|systemic|BDS-000901:5mg/','Pubolin 5 mg tablet','Tablet','systemic');
            INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, raw_text)
              VALUES ('BDC-000901','BDS-000901',5,'mg','Pubolin 5 mg');
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('M-PUB','901','Pubol','Open Pharma','Tablet','Pubolin 5 mg','BDC-000901','parsed');
            INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('M-PUB','XM9P01','Pubolin');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('M-1', 7, now() - interval '2 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES ('M-1','DGDA-Drugs','M-PUB','ok', now() - interval '2 hour');
            """);
        String[][] hidden = {{"2", "M-PEND", "Hushpend"}, {"3", "M-ENG", "Husheng"}, {"4", "M-ISS", "Hushiss"}, {"5", "M-BACK", "Hushback"},
            {"6", "M-REM", "Hushrem"}, {"7", "M-DIS", "Hushdis"}};
        String suffix = "PEIBRD";
        for (int k = 0; k < hidden.length; k++) {
            String n = hidden[k][0], id = hidden[k][1], trade = hidden[k][2], name = "Secretolin-" + suffix.charAt(k);
            sql.append("""
                INSERT INTO curated.substance (bds_id, preferred_name) VALUES ('BDS-00090%1$s','%4$s');
                INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES
                 ('BDS-00090%1$s','ICD11_XM','XM9M0%1$s','any','dgda-ocl','xm',1.0),
                 ('BDS-00090%1$s','DDINTER','DDInter990%1$s','systemic','ddinter2','drugbank',1.0);
                INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES ('BDS-00090%1$s','%4$s','icd11','dgda-ocl');
                INSERT INTO curated.ddinter_drug (ddinter_id, name, route_scope) VALUES ('DDInter990%1$s','DDI-Partner%1$s','systemic');
                INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES ('BDS-00090%1$s','full','x');
                INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management)
                  VALUES ('TXT-%1$s','SECRET-TEXT-%1$s','SECRET-MGMT-%1$s');
                INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id)
                  VALUES ('DDInter9901','DDInter990%1$s','major','{monitor}','Pubolin','DDI-Partner%1$s','TXT-%1$s');
                INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route)
                  VALUES ('BDC-00090%1$s','tablet|systemic|BDS-00090%1$s:77.77mg/','%4$s 77.77 mg tablet','Tablet','systemic');
                INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, raw_text)
                  VALUES ('BDC-00090%1$s','BDS-00090%1$s',77.77,'mg','%4$s 77.77 mg');
                INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
                  VALUES ('%2$s','90%1$s','%3$s','Hush Pharma','Tablet','%4$s 77.77 mg','BDC-00090%1$s','parsed');
                INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES ('%2$s','XM9M0%1$s','%4$s');
                """.formatted(n, id, trade, name));
        }
        sql.append("""
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('M-1','DGDA-Drugs','M-PEND','pending',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-ENG','pending',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-ISS','issue',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-BACK','pending',NULL, now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-REM','ok','removed from batch file', now() - interval '2 hour'),
             ('M-1','DGDA-Drugs','M-DIS','pending',NULL, now() - interval '2 hour');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('M-1','M-ENG','ok','','eng@example.org','engineer', now() - interval '1 hour'),
             ('M-1','M-ISS','issue','Strength looks wrong','pharm@example.org','pharmacist', now() - interval '1 hour'),
             ('M-1','M-BACK','ok','','pharm@example.org','pharmacist', now() - interval '3 hour'),
             ('M-1','M-REM','ok','','pharm@example.org','pharmacist', now() - interval '1 hour'),
             ('M-1','M-DIS','ok','','pharm@example.org','pharmacist', now() - interval '100 minute'),
             ('M-1','M-DIS','issue','ISSUE-NOTE-SECRET','pharm@example.org','pharmacist', now() - interval '90 minute'),
             ('M-1','M-DIS','dismiss','DISMISS-NOTE-SECRET','senior@example.org','senior', now() - interval '60 minute');
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at) VALUES
             ('DDInter9901','DDInter9902','issue','PAIR-NOTE-SECRET','%s','{}','senior@example.org','senior', now() - interval '30 minute'),
             ('DDInter9901','DDInter9902','reviewed','','%s','{}','senior@example.org','senior', now() - interval '10 minute');
            """.formatted("0".repeat(64), new PublicPairReviews.Pair("DDInter9901", "DDInter9902", "major", List.of("monitor"),
                "SECRET-TEXT-2", "SECRET-MGMT-2").hash()));
        exec(pg, sql.toString());
    }

    @Autowired WebTestClient web;

    private String get(String uri, Object... vars) {
        return new String(web.get().uri(uri, vars).exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(),
            StandardCharsets.UTF_8);
    }
    private static void clean(String body, String where) {
        for (String m : MARKERS) assertThat(body).as(where + " leaks " + m).doesNotContain(m);
        assertThat(body).as(where).doesNotContain("reviewStatus", "\"issue\"", "\"changed\"", "dismiss", "@example.org");
    }

    @Test void search() {
        clean(get("/v1/search?q={q}", "hush"), "search hush");
        clean(get("/v1/search?q={q}", "secretolin"), "search secretolin");
        clean(get("/v1/search?q={q}", "secretolinp"), "search suggestion");
        web.get().uri("/v1/search?q={q}", "hush").exchange().expectBody()
            .jsonPath("$.data.counts.substances").isEqualTo(0)
            .jsonPath("$.data.products.length()").isEqualTo(6)
            .jsonPath("$.data.products[*].hidden").value(v -> assertThat(v.toString()).doesNotContain("false"));
        // no hidden record is ever an approved search row; Hushdis (dismissed) is a stub like the others
        assertThat(get("/v1/search?q={q}", "hush")).doesNotContain("\"status\":\"approved\"");
        assertThat(get("/v1/search?q={q}", "hushdis")).contains("\"conceptId\":\"M-DIS\"", "\"status\":\"not_reviewed\"");
        web.get().uri("/v1/search?q={q}", "secretolin").exchange().expectBody().jsonPath("$.data.total").isEqualTo(0);
    }

    @Test void productDetailAndInteractions() {
        for (String id : HIDDEN) {
            String detail = get("/v1/products/{id}", id);
            clean(detail, "product " + id);
            assertThat(detail).contains("\"hidden\":true", "\"batchId\":\"M-1\"");
            clean(get("/v1/products/{id}/interactions", id), "interactions " + id);
        }
        assertThat(get("/v1/products/{id}", "M-REM")).contains("\"status\":\"removed\"");
        assertThat(get("/v1/products/{id}", "M-ISS")).contains("\"status\":\"not_reviewed\"");
        // a dismissed issue is pending: the pre-dismissal ok never publishes it (§5.2, D57)
        assertThat(get("/v1/products/{id}", "M-DIS")).contains("\"status\":\"not_reviewed\"").doesNotContain("verification");
        assertThat(get("/v1/products/{id}/interactions", "M-DIS")).contains("\"status\":\"not_reviewed\"").doesNotContain("partners");
        String pub = get("/v1/products/{id}/interactions", "M-PUB");
        clean(pub, "Pubol's interactions");
        web.get().uri("/v1/products/M-PUB/interactions").exchange().expectBody().jsonPath("$.data.totalPartners").isEqualTo(0);
        clean(get("/v1/products/{id}", "M-PUB"), "Pubol's detail");
    }

    @Test void clinicalDrugs() {
        for (int n = 2; n <= 7; n++)
            web.get().uri("/v1/clinical-drugs/BDC-00090" + n).exchange().expectStatus().isNotFound();
        clean(get("/v1/clinical-drugs/{id}", "BDC-000901"), "BDC-000901");
    }

    @Test void substancesAndTheirInteractions() {
        for (int n = 2; n <= 7; n++) {
            String stub = get("/v1/substances/{id}", "BDS-00090" + n);
            assertThat(stub).contains("\"hidden\":true").doesNotContain("reviewStatus", "codes", "products", "DDInter", "XM9M0");
            String list = get("/v1/substances/{id}/interactions", "BDS-00090" + n);
            assertThat(list).contains("\"hidden\":true").doesNotContain("items", "SECRET-");
        }
        String pubolin = get("/v1/substances/{id}", "BDS-000901");
        // F9: the public product list carries "reviewStatus":"ok" for approved products only (P1 contract); any other value leaks
        web.get().uri("/v1/substances/BDS-000901").exchange().expectBody()
            .jsonPath("$.data.products[*].reviewStatus").value(v -> assertThat((List<?>) v).isNotEmpty().allMatch("ok"::equals));
        clean(pubolin.replace("\"reviewStatus\":\"ok\"", ""), "Pubolin");
        String items = get("/v1/substances/{id}/interactions", "BDS-000901");
        clean(items.replaceAll("SECRET-(TEXT|MGMT)-\\d", "DDINTER-OWN-TEXT"), "Pubolin's pairs");   // DDInter's own text for DDInter's own pairs is public (P9)
        assertThat(items).doesNotContain("\"state\":\"reviewed\"");
        web.get().uri("/v1/substances/BDS-000901/interactions").exchange().expectBody()
            .jsonPath("$.data.items.length()").isEqualTo(6)
            .jsonPath("$.data.items[*].partnerBdsId").value(v -> assertThat(v.toString()).doesNotContain("BDS-"))
            .jsonPath("$.data.items[*].pairReview.state").value(v -> assertThat(v.toString()).doesNotContain("issue"))
            // §7.4: Pubolin + Secretolin-P has a current senior review, but its partner is not public: never served
            .jsonPath("$.data.items[?(@.partnerBdsId == null)].pairReview.state")
                .value(v -> assertThat((List<?>) v).isNotEmpty().allMatch("not_reviewed"::equals))
            .jsonPath("$.data.items[?(@.partnerBdsId == null)].pairReview.reviewedAt")
                .value(v -> assertThat((List<?>) v).isNotEmpty().allMatch(java.util.Objects::isNull));
    }

    @Test void suggest() {
        String hush = get("/v1/products/suggest?q={q}", "hush");
        clean(hush, "suggest hush");
        assertThat(hush).contains("\"status\":\"not_reviewed\"").doesNotContain("\"status\":\"approved\"");
        assertThat(get("/v1/products/suggest?q={q}", "hushdis")).contains("\"conceptId\":\"M-DIS\"", "\"status\":\"not_reviewed\"");
        web.get().uri("/v1/products/suggest?q={q}", "secretolin").exchange().expectBody().jsonPath("$.data.length()").isEqualTo(0);
    }

    @Test void stats() {
        clean(get("/v1/stats"), "stats");
        // only Pubol is public: neither the dismissed record nor any other hidden one is counted as approved
        web.get().uri("/v1/stats").exchange().expectBody().jsonPath("$.data.approvedProducts").isEqualTo(1);
    }

    @Test void checker() {
        String body = new String(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of("M-PUB", "M-PEND", "M-ENG", "M-ISS", "M-BACK", "M-REM", "M-DIS"))).exchange()
            .expectStatus().isOk().expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(1)
            .jsonPath("$.data.alerts.length()").isEqualTo(0)
            .jsonPath("$.data.notReviewed.length()").isEqualTo(6)
            .jsonPath("$.data.notReviewed[5].conceptId").isEqualTo("M-DIS")
            .jsonPath("$.data.summary.medicines").isEqualTo(7)
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        clean(body, "checker");
    }
}
