package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The PublicVisibilityMatrixIntegrationTest fixtures with the switch on (show mode, §7.4.1, §11.3, D74), on every public
 * endpoint. Visible and labelled: pending, engineer checked, back in review and dismissed (not_reviewed), issue and the
 * failed stage (problem), Pubol (approved). Hidden: removed (Hushrem), the DGDA load failure (Hushnf, stub status
 * unavailable) and the product in no batch (Hushnob): their markers never appear anywhere. No response ever carries a
 * decision, a note, a role or an email.
 */
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=true")
class PublicVisibilityMatrixShowUnreviewedIntegrationTest extends PublicVisibilityMatrixIntegrationTest {
    static final List<String> HIDDEN_NOW = List.of("M-REM", "M-NF", "M-NOB");
    static final Map<String, String> LABELS = Map.of("M-PEND", "not_reviewed", "M-ENG", "not_reviewed", "M-ISS", "problem",
        "M-BACK", "not_reviewed", "M-DIS", "not_reviewed", "M-FAIL", "problem");
    /** The hidden fixtures' own data (digits 6, 8 and a; Secretolin-R, -N, -O). */
    static final List<String> HIDDEN_MARKERS = List.of("Secretolin-R", "Secretolin-N", "Secretolin-O",
        "BDS-000906", "BDS-000908", "BDS-00090a", "BDC-000906", "BDC-000908", "BDC-00090a", "XM9M06", "XM9M08", "XM9M0a");

    static void showClean(String body, String where) {
        for (String m : HIDDEN_MARKERS) assertThat(body).as(where + " leaks " + m).doesNotContain(m);
        for (String m : ALWAYS_SECRET) assertThat(body).as(where + " leaks " + m).doesNotContain(m);
        assertThat(body).as(where).doesNotContain("\"issue\"", "\"changed\"", "dismiss", "decidedAt", "reviewerRole");
        assertThat(body).as(where).doesNotContain("\"status\":\"fail\"", "no clinical drug for the strength");
    }

    @Test @Override void search() {
        showClean(get("/v1/search?q={q}", "hush"), "search hush");
        showClean(get("/v1/search?q={q}", "secretolin"), "search secretolin");
        web.get().uri("/v1/search?q={q}", "hush").exchange().expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(9)
            .jsonPath("$.data.products[?(@.hidden == true)].conceptId").isEqualTo(List.of("M-NF", "M-NOB", "M-REM"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-REM')].status").isEqualTo(List.of("removed"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-NF')].status").isEqualTo(List.of("unavailable"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-NOB')].status").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-ISS')].review").isEqualTo(List.of("problem"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-FAIL')].review").isEqualTo(List.of("problem"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-DIS')].review").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-DIS')].status").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.products[?(@.conceptId == 'M-PEND')].clinicalDrug.bdcId").isEqualTo(List.of("BDC-000902"));
        // a visible product is found by its substance and its generic content too; a hidden one never is
        web.get().uri("/v1/search?q={q}", "secretolin").exchange().expectBody()
            .jsonPath("$.data.counts.substances").isEqualTo(6)
            .jsonPath("$.data.substances[?(@.bdsId == 'BDS-000904')].review").isEqualTo(List.of("problem"))
            .jsonPath("$.data.substances[?(@.bdsId == 'BDS-000902')].productCount").isEqualTo(List.of(1))
            .jsonPath("$.data.substances[?(@.bdsId == 'BDS-000902')].approvedProductCount").isEqualTo(List.of(0))
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("M-BACK", "M-DIS", "M-ENG", "M-FAIL", "M-ISS", "M-PEND"));
        // the spelling index follows the visible set (§7.4.1): a visible substance's name is suggested
        web.get().uri("/v1/search?q={q}", "secretolinp").exchange().expectBody()
            .jsonPath("$.data.total").isEqualTo(0).jsonPath("$.data.suggestion").isEqualTo("Secretolin-P");
        web.get().uri("/v1/search?q={q}", "77.77 mg").exchange().expectBody()
            .jsonPath("$.data.products[*].hidden").value(v -> assertThat(v.toString()).doesNotContain("true"));
    }

    @Test @Override void productDetailAndInteractions() {
        LABELS.forEach((id, label) -> {
            String detail = get("/v1/products/{id}", id);
            showClean(detail, "product " + id);
            assertThat(detail).as(id).contains("\"review\":\"" + label + "\"", "\"verification\":null", "Hush Pharma")
                .doesNotContain("\"hidden\"");
            String p10 = get("/v1/products/{id}/interactions", id);
            showClean(p10, "interactions " + id);
            assertThat(p10).contains("\"review\":\"" + label + "\"");
        });
        // §7.4.1 Privacy, §11.3: a problem record's stage results are withheld whole, so nothing says a check failed or names
        // the stage; a not-reviewed record keeps its stage notes (§6.10)
        for (String id : List.of("M-FAIL", "M-ISS")) {
            String detail = get("/v1/products/{id}", id);
            assertThat(detail).as(id).contains("\"stages\":[]")
                .doesNotContain("\"status\":\"fail\"", "no clinical drug for the strength", "\"stage\":");
        }
        assertThat(get("/v1/products/{id}", "M-PEND")).contains("\"stage\":\"clinical\"", "route assumed");
        assertThat(get("/v1/products/{id}", "M-REM")).contains("\"status\":\"removed\"", "\"hidden\":true");
        assertThat(get("/v1/products/{id}", "M-NF")).contains("\"status\":\"unavailable\"", "\"hidden\":true", "\"batchId\":\"M-1\"");
        assertThat(get("/v1/products/{id}", "M-NOB")).contains("\"status\":\"not_reviewed\"", "\"hidden\":true", "\"batchId\":null");
        for (String id : HIDDEN_NOW) {
            showClean(get("/v1/products/{id}", id), "stub " + id);
            assertThat(get("/v1/products/{id}/interactions", id)).contains("\"hidden\":true").doesNotContain("partners");
        }
        String pub = get("/v1/products/{id}/interactions", "M-PUB");
        showClean(pub, "Pubol's interactions");
        web.get().uri("/v1/products/M-PUB/interactions").exchange().expectBody()
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.totalPartners").isEqualTo(6)
            .jsonPath("$.data.partners[?(@.partnerSubstance.bdsId == 'BDS-000904')].partnerReview").isEqualTo(List.of("problem"))
            .jsonPath("$.data.partners[?(@.partnerSubstance.bdsId == 'BDS-000902')].partnerReview").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.partners[?(@.partnerSubstance.bdsId == 'BDS-000902')].brands[0].review").isEqualTo(List.of("not_reviewed"))
            .jsonPath("$.data.partners[?(@.partnerSubstance.bdsId == 'BDS-000902')].pairReview.state").isEqualTo(List.of("reviewed"));
        String detail = get("/v1/products/{id}", "M-PUB");
        showClean(detail, "Pubol's detail");
        assertThat(detail).contains("\"review\":\"approved\"", "\"verification\":{\"status\":\"approved\",\"role\":\"pharmacist\"");
    }

    @Test @Override void clinicalDrugs() {
        LABELS.forEach((id, label) -> {
            String n = id.equals("M-PEND") ? "2" : id.equals("M-ENG") ? "3" : id.equals("M-ISS") ? "4" : id.equals("M-BACK") ? "5"
                : id.equals("M-DIS") ? "7" : "9";
            String body = get("/v1/clinical-drugs/{id}", "BDC-00090" + n);
            showClean(body, "BDC-00090" + n);
            assertThat(body).contains("\"review\":\"" + label + "\"", "\"conceptId\":\"" + id + "\"");
        });
        for (String n : List.of("6", "8", "a"))
            web.get().uri("/v1/clinical-drugs/BDC-00090" + n).exchange().expectStatus().isNotFound();
        assertThat(get("/v1/clinical-drugs/{id}", "BDC-000901")).contains("\"review\":\"approved\"");
    }

    @Test @Override void substancesAndTheirInteractions() {
        for (String n : List.of("2", "3", "4", "5", "7", "9")) {
            String body = get("/v1/substances/{id}", "BDS-00090" + n);
            showClean(body, "substance " + n);
            assertThat(body).doesNotContain("\"hidden\"").contains("\"review\":\"" + (n.equals("4") || n.equals("9") ? "problem" : "not_reviewed") + "\"");
            showClean(get("/v1/substances/{id}/interactions", "BDS-00090" + n), "P9 " + n);
        }
        for (String n : List.of("6", "8", "a")) {
            assertThat(get("/v1/substances/{id}", "BDS-00090" + n)).contains("\"hidden\":true").doesNotContain("codes", "products", "XM9M0");
            assertThat(get("/v1/substances/{id}/interactions", "BDS-00090" + n)).contains("\"hidden\":true").doesNotContain("items");
        }
        String items = get("/v1/substances/{id}/interactions", "BDS-000901");
        showClean(items.replaceAll("Secretolin-[RNO]", "x"), "Pubolin's pairs");   // DDInter's own partner names are public (P9)
        web.get().uri("/v1/substances/BDS-000901/interactions").exchange().expectBody()
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.items.length()").isEqualTo(9)
            .jsonPath("$.data.items[?(@.partnerBdsId == 'BDS-000904')].partnerReview").isEqualTo(List.of("problem"))
            .jsonPath("$.data.items[?(@.partnerBdsId == 'BDS-000902')].pairReview.state").isEqualTo(List.of("reviewed"))
            .jsonPath("$.data.items[?(@.partnerBdsId == null)].partnerReview").value(v -> assertThat((List<?>) v).hasSize(3)
                .allMatch(java.util.Objects::isNull));
        web.get().uri("/v1/substances/BDS-000901").exchange().expectBody()
            .jsonPath("$.data.review").isEqualTo("approved")
            .jsonPath("$.data.interactions[?(@.partnerBdsId == 'BDS-000909')].partnerReview").isEqualTo(List.of("problem"));
    }

    @Test @Override void suggest() {
        String hush = get("/v1/products/suggest?q={q}", "hush");
        showClean(hush, "suggest hush");
        web.get().uri("/v1/products/suggest?q={q}", "hush").exchange().expectBody()
            .jsonPath("$.data.length()").isEqualTo(6)
            .jsonPath("$.data[?(@.conceptId == 'M-ISS')].review").isEqualTo(List.of("problem"))
            .jsonPath("$.data[?(@.conceptId == 'M-PEND')].clinicalDisplayName").isEqualTo(List.of("Secretolin-P 77.77 mg tablet"))
            .jsonPath("$.data[*].conceptId").value(v -> assertThat(v.toString()).doesNotContain("M-REM", "M-NF", "M-NOB"));
        // matched as a full hit is: by substance name
        web.get().uri("/v1/products/suggest?q={q}", "secretolin-p").exchange().expectBody()
            .jsonPath("$.data[0].conceptId").isEqualTo("M-PEND");
    }

    /** P17: the visible products, each with its label; removed, the load failure and no batch are never listed or counted. */
    @Test @Override void browse() {
        for (String uri : List.of("/v1/products/browse", "/v1/products/browse?letter=H", "/v1/products/browse?letter=P",
                                  "/v1/products/browse?letter=S"))
            showClean(get(uri), uri);
        web.get().uri("/v1/products/browse").exchange().expectBody()
            .jsonPath("$.data.total").isEqualTo(7)
            .jsonPath("$.data.letters[?(@.letter == 'H')].count").isEqualTo(List.of(6));
        web.get().uri("/v1/products/browse?letter=H").exchange().expectBody()
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("M-BACK", "M-DIS", "M-ENG", "M-FAIL", "M-ISS", "M-PEND"))
            .jsonPath("$.data.products[*].status").value(v -> assertThat((List<?>) v).hasSize(6).allMatch("not_reviewed"::equals));
        LABELS.forEach((id, label) -> web.get().uri("/v1/products/browse?letter=H").exchange().expectBody()
            .jsonPath("$.data.products[?(@.conceptId == '" + id + "')].review").isEqualTo(List.of(label)));
    }

    @Test @Override void stats() {
        showClean(get("/v1/stats"), "stats");
        web.get().uri("/v1/stats").exchange().expectBody()
            .jsonPath("$.data.publicMode").isEqualTo("show_unreviewed")
            .jsonPath("$.data.approvedProducts").isEqualTo(1)
            .jsonPath("$.data.batches[0].items[?(@.conceptId == 'M-NF')].hidden").isEqualTo(List.of(true))
            .jsonPath("$.data.batches[0].items[?(@.conceptId == 'M-FAIL')].review").isEqualTo(List.of("problem"))
            .jsonPath("$.data.batches[0].items[?(@.conceptId == 'M-FAIL')].status").isEqualTo(List.of("not_reviewed"));
    }

    @Test @Override void checker() {
        String body = new String(web.post().uri("/v1/interactions/check").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("conceptIds", List.of("M-PUB", "M-PEND", "M-ENG", "M-ISS", "M-BACK", "M-REM", "M-DIS", "M-NF", "M-FAIL",
                "M-NOB"))).exchange()
            .expectStatus().isOk().expectBody()
            .jsonPath("$.data.products.length()").isEqualTo(7)
            .jsonPath("$.data.notReviewed[*].conceptId").isEqualTo(List.of("M-REM", "M-NF", "M-NOB"))
            .jsonPath("$.data.summary.medicines").isEqualTo(10)
            .jsonPath("$.data.summary.notApproved").isEqualTo(6)
            .jsonPath("$.data.alerts.length()").isEqualTo(6)
            .jsonPath("$.data.alerts[?(@.b.conceptId == 'M-ISS' || @.a.conceptId == 'M-ISS')].severity").isEqualTo(List.of("major"))
            .returnResult().getResponseBody(), StandardCharsets.UTF_8);
        showClean(body, "checker");
    }
}
