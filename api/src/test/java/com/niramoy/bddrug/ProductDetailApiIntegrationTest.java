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
 * §7.4 P5/P6/P7/P15 against PilotSeed. N-1 (Napa), W-1 (Warin), C-CAP (Chloramex) and N-2 (Ace) are approved in batch
 * D-1; A-1 (Ecosprin) and N-3 (Fast) are pending there. Napa's ddinter stage notes text missing with warfarin (public) and
 * with aspirin (A-1 only: never public). W-1 also has an older item in D-0 with a later ok; C-CAP was approved, reported,
 * dismissed by a senior and approved again. Every row is seeded here, so no test depends on another's order.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductDetailApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO raw.ocl_concept (source, concept_id, payload, fetched_at) VALUES ('DGDA-Drugs','N-1','{}','2026-10-11T21:00:00Z');
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status)
              VALUES ('N-2','012','Ace','Square','Tablet','Paracetamol 500 mg','BDC-000006','parsed'),
                     ('N-3','013','Fast','Acme','Tablet','Paracetamol 500 mg','BDC-000006','parsed');
            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('D-0', 1, '2026-10-10T21:27:00Z'), ('D-1', 6, '2026-10-11T21:27:00Z');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at) VALUES
             ('D-0','DGDA-Drugs','W-1','ok','2026-10-10T21:28:00Z'),
             ('D-1','DGDA-Drugs','N-1','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','W-1','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','A-1','pending','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','C-CAP','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','N-2','ok','2026-10-11T21:28:00Z'),
             ('D-1','DGDA-Drugs','N-3','pending','2026-10-11T21:28:00Z');
            INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role, decided_at) VALUES
             ('D-1','N-1','ok','','eng@example.org','engineer','2026-10-14T04:00:00Z'),
             ('D-1','N-1','ok','','senior@example.org','senior','2026-10-14T05:20:00Z'),
             ('D-1','W-1','ok','','pharm@example.org','pharmacist','2026-10-14T06:00:00Z'),
             ('D-0','W-1','ok','','pharm@example.org','pharmacist','2026-10-15T09:00:00Z'),
             ('D-1','C-CAP','ok','','pharm@example.org','pharmacist','2026-10-13T08:00:00Z'),
             ('D-1','C-CAP','issue','Strength looks wrong','pharm@example.org','pharmacist','2026-10-13T08:30:00Z'),
             ('D-1','C-CAP','dismiss','The strength matches the register','senior@example.org','senior','2026-10-13T09:00:00Z'),
             ('D-1','C-CAP','ok','','pharm@example.org','pharmacist','2026-10-13T10:00:00Z');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES
             ('D-1','N-1','dgda','ok','','{}'), ('D-1','N-1','substances','ok','','{}'), ('D-1','N-1','clinical','ok','','{}'),
             ('D-1','N-1','ddinter','warn','DDInter text not found for DDInter14/DDInter1951; DDInter text not found for DDInter14/DDInter20',
              '{"text_missing": [["DDInter14","DDInter1951"],["DDInter14","DDInter20"]]}');
            """);
    }

    @Autowired WebTestClient web;

    private String napa() {
        return new String(web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
    }

    @Test void verificationProvenanceAndOtherBrands() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.hidden").doesNotExist()
            .jsonPath("$.data.reviewStatus").doesNotExist()
            .jsonPath("$.data.verification.status").isEqualTo("approved")
            .jsonPath("$.data.verification.role").isEqualTo("pharmacist")              // a senior's approval reads as a pharmacist's (D49)
            .jsonPath("$.data.verification.approvedAt").isEqualTo("2026-10-14T05:20:00Z")   // the latest counting ok, never the engineer's
            .jsonPath("$.data.provenance.batchId").isEqualTo("D-1")
            .jsonPath("$.data.provenance.extractedAt").isEqualTo("2026-10-11T21:28:00Z")
            .jsonPath("$.data.provenance.source").isEqualTo("DGDA register")
            .jsonPath("$.data.provenance.sourceLink.url").value(u -> assertThat((String) u).endsWith("/concepts/N-1/"))
            .jsonPath("$.data.provenance.stages.length()").isEqualTo(4)
            .jsonPath("$.data.provenance.stages[0].stage").isEqualTo("dgda")
            .jsonPath("$.data.provenance.stages[3].stage").isEqualTo("ddinter")
            .jsonPath("$.data.otherBrandsCount").isEqualTo(1)                         // N-2 (approved); never N-3 (pending)
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.bdsId").isEqualTo("BDS-000005")
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.coverage.coverage").isEqualTo("full")
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.ddinter.chosen[0].ddinterId").isEqualTo("DDInter14");
    }

    @Test void codesCarryTheirSourceLinks() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.clinicalDrug.ingredients[0].summary.codes[?(@.system == 'RXCUI')].source.url")
            // a filter answers a JSON array, whose toString() escapes "/", so assert on its one element
            .value(u -> assertThat((java.util.List<?>) u).singleElement().asString().contains("RxNav/search?searchBy=RXCUI&searchTerm=161"));
    }

    // Review Focus 1
    @Test void privatePartnerNeverNamedInTheStageCard() {
        web.get().uri("/v1/products/N-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.provenance.stages[3].status").isEqualTo("warn")
            .jsonPath("$.data.provenance.stages[3].textMissing.length()").isEqualTo(1)
            .jsonPath("$.data.provenance.stages[3].textMissing[0].nameB").isEqualTo("Warfarin")
            .jsonPath("$.data.provenance.stages[3].textMissing[0].severity").isEqualTo("moderate");
        assertThat(napa()).doesNotContain("DDInter20", "Acetylsalicylic acid", "Aspirin", "Ecosprin", "text_missing");
    }

    // Spec gap 10: only the latest item's decisions date the line; a later ok on an older batch's item never does
    @Test void theVerificationDateComesFromTheLatestItemOnly() {
        web.get().uri("/v1/products/W-1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.provenance.batchId").isEqualTo("D-1")
            .jsonPath("$.data.verification.approvedAt").isEqualTo("2026-10-14T06:00:00Z");
    }

    // §5.2, D57: approved, reported, dismissed by a senior, approved again: the new approval dates it, and nothing of the
    // issue or the dismissal is served
    @Test void afterADismissalTheNewApprovalDatesTheLine() {
        String body = new String(web.get().uri("/v1/products/C-CAP").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.verification.status").isEqualTo("approved")
            .jsonPath("$.data.verification.approvedAt").isEqualTo("2026-10-13T10:00:00Z")
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("dismiss", "Strength looks wrong", "The strength matches the register", "@example.org");
    }

    @Test void scopeAllStillAnswersTheInternalProduct() {
        internal(web).get().uri("/v1/products/A-1?scope=all").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.reviewStatus").isEqualTo("pending")
            .jsonPath("$.data.verification").doesNotExist();
    }
}
