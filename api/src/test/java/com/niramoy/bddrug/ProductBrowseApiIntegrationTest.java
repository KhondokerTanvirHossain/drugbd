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
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §6.11.3 P17 {@code GET /v1/products/browse} (D75) in approved-only mode (the switch off, §7.4.1);
 * ProductBrowseShowUnreviewedIntegrationTest runs the same fixtures with the switch on.
 * <ul>
 *   <li>approved: W-1 Warin, N-1 Napa, N-2 Napa (the same name: concept id decides), E-LOW "ecoflam" (a lower-case first
 *       letter, filed under E), Z-NUM "5-Fluro", Z-BN "নাপা" and Z-ACC "Écran" (all three under 0-9), and the 55 Bulk rows
 *       (B, more than one page);</li>
 *   <li>visible in show mode only: A-1 Ecosprin and W-2 Coumarol (pending: not_reviewed), C-EYE Optimycin (an open issue:
 *       problem), C-CAP Chloramex (pending with a failed stage: problem), Z-SYM "(Bracket)" (pending, under 0-9);</li>
 *   <li>hidden in both modes: D-1 Motigut (approved, then removed from its batch file), X-NOMAP Herbex ("not found at
 *       source") and X-NAD Xenadrug ("not a registered Drug product"), the DGDA load failures, and A-NOBDC Asprin Plus and
 *       X-NOSUB Newdrug, in no batch.</li>
 * </ul>
 */
@Testcontainers
@SpringBootTest(properties = "bddrug.public-shows-unreviewed=false")
@AutoConfigureWebTestClient
class ProductBrowseApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    static final List<String> HIDDEN = List.of("D-1", "X-NOMAP", "X-NAD", "A-NOBDC", "X-NOSUB");
    static final List<String> UNAPPROVED = List.of("A-1", "W-2", "C-EYE", "C-CAP", "Z-SYM");

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO curated.brand_product
              (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status, parse_note) VALUES
             ('N-2','N02','Napa','Other Pharma','Tablet','Paracetamol 500 mg','BDC-000006','parsed',NULL),
             ('E-LOW','E01','ecoflam','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL),
             ('Z-NUM','Z01','5-Fluro','Test Pharma','Cream','Herb 1 mg',NULL,'parsed',NULL),
             ('Z-BN','Z02','নাপা','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL),
             ('Z-ACC','Z03','Écran','Test Pharma','Lotion','Herb 1 mg',NULL,'parsed',NULL),
             ('Z-SYM','Z04','(Bracket)','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL),
             ('X-NAD','X02','Xenadrug','Test Pharma','Tablet','Herb 1 mg',NULL,'parsed',NULL);
            INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, bdc_id, parse_status, parse_note)
             SELECT 'BK-' || lpad(i::text, 2, '0'), 'BK' || lpad(i::text, 2, '0'), 'Bulk' || lpad(i::text, 2, '0'), 'Test Pharma', 'Tablet',
                    'Herb 1 mg', NULL, 'parsed', NULL
             FROM generate_series(1, 55) i;

            INSERT INTO ops.batch (batch_id, item_count, run_at) VALUES ('BR-1', 15, now() - interval '1 hour'), ('BR-2', 55, now()),
             ('BR-rm', 1, now() - interval '2 hour');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES
             ('BR-1','DGDA-Drugs','W-1','ok',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','N-1','ok',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','N-2','ok',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','E-LOW','ok',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','Z-NUM','ok',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','Z-BN','ok',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','Z-ACC','ok',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','A-1','pending',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','W-2','pending',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','C-EYE','issue',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','C-CAP','pending',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','Z-SYM','pending',NULL, now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','X-NOMAP','issue','not found at source', now() - interval '1 hour'),
             ('BR-1','DGDA-Drugs','X-NAD','issue','not a registered Drug product', now() - interval '1 hour'),
             ('BR-rm','DGDA-Drugs','D-1','ok','removed from batch file', now() - interval '2 hour');
            INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note) VALUES
             ('BR-1','C-CAP','clinical','fail','no clinical drug'), ('BR-1','C-CAP','dgda','ok','found'),
             ('BR-1','W-1','dgda','warn','spelling'), ('BR-1','X-NOMAP','dgda','fail','not found at source');
            INSERT INTO ops.batch_item (batch_id, source, concept_id, review, extracted_at)
             SELECT 'BR-2', 'DGDA-Drugs', 'BK-' || lpad(i::text, 2, '0'), 'ok', now() FROM generate_series(1, 55) i;
            """);
    }

    @Autowired WebTestClient web;

    static String str(byte[] body) { return new String(body, StandardCharsets.UTF_8); }

    /** Every concept id the list holds, page after page (at most 10), with no letter. */
    List<String> everyListedId() {
        List<String> ids = new ArrayList<>();
        boolean[] more = {true};
        for (int page = 0; page <= 9 && more[0]; page++)
            web.get().uri("/v1/products/browse?page={p}", page).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.data.products[*].conceptId").value(v -> ((List<?>) v).forEach(id -> ids.add((String) id)))
                .jsonPath("$.data.hasMore").value(v -> more[0] = (Boolean) v);
        return ids;
    }

    /** Approved-only mode: the approved products, each in the §6.3 product hit form with label approved. */
    @Test void onlyVisibleProductsAreListedWithTheirLabels() {
        List<String> ids = everyListedId();
        assertThat(ids).hasSize(62).doesNotHaveDuplicates().doesNotContainAnyElementsOf(HIDDEN).doesNotContainAnyElementsOf(UNAPPROVED);
        web.get().uri("/v1/products/browse?letter=N").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("N-1", "N-2"))
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Napa")
            .jsonPath("$.data.products[0].darNumber").isEqualTo("008")
            .jsonPath("$.data.products[0].company").isEqualTo("Beximco Pharmaceuticals Ltd")
            .jsonPath("$.data.products[0].dosageForm").isEqualTo("Tablet")
            .jsonPath("$.data.products[0].genericContentRaw").isEqualTo("Paracetamol 500 mg")
            .jsonPath("$.data.products[0].clinicalDrug.bdcId").isEqualTo("BDC-000006")
            .jsonPath("$.data.products[0].clinicalDrug.displayName").isEqualTo("Acetaminophen 500 mg tablet")
            .jsonPath("$.data.products[0].status").isEqualTo("approved")
            .jsonPath("$.data.products[0].review").isEqualTo("approved")
            .jsonPath("$.data.products[0].matchedOn").doesNotExist()
            .jsonPath("$.data.products[0].hidden").doesNotExist();
        web.get().uri("/v1/products/browse?letter=E").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[0].clinicalDrug").value(v -> assertThat(v).isNull());
    }

    /** Removed records, DGDA load failures and products in no batch are never listed, in any letter. */
    @Test void removedLoadFailuresAndProductsInNoBatchAreNeverListed() {
        for (String letter : List.of("M", "H", "X", "A", "N")) {
            String body = str(web.get().uri("/v1/products/browse?letter={l}", letter).exchange().expectStatus().isOk()
                .expectBody().returnResult().getResponseBody());
            assertThat(body).as(letter).doesNotContain("Motigut", "Herbex", "Xenadrug", "Asprin Plus", "Newdrug", "\"hidden\"", "\"issue\"");
        }
        web.get().uri("/v1/products/browse?letter=M").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(0).jsonPath("$.data.products.length()").isEqualTo(0);
        web.get().uri("/v1/products/browse?letter=X").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(0).jsonPath("$.data.products.length()").isEqualTo(0);
    }

    /** A–Z by the upper-cased first letter; a lower-case first letter is filed under its capital; every other name is 0-9. */
    @Test void lettersGroupByFirstLetterWithALowerCaseLetterAndThe09Bucket() {
        web.get().uri("/v1/products/browse?letter=e").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.letter").isEqualTo("E")
            .jsonPath("$.data.products[*].conceptId").isEqualTo(expectedE());
        web.get().uri("/v1/products/browse?letter=0-9").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.letter").isEqualTo("0-9")
            .jsonPath("$.data.products[*].conceptId")
            .value(ids -> assertThat(new ArrayList<Object>((List<?>) ids)).containsExactlyInAnyOrderElementsOf(expected09()));
        web.get().uri("/v1/products/browse?letter=W").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].conceptId").isEqualTo(expectedW());
    }

    List<String> expectedE() { return List.of("E-LOW"); }
    List<String> expected09() { return List.of("Z-NUM", "Z-BN", "Z-ACC"); }
    List<String> expectedW() { return List.of("W-1"); }

    /** The 27 entries, A…Z then 0-9, counting visible products (zeros included); total; hasMore past 50 rows. */
    @Test void lettersCountsTotalAndHasMore() {
        String all = str(web.get().uri("/v1/products/browse").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.letter").value(v -> assertThat(v).isNull())
            .jsonPath("$.data.page").isEqualTo(0)
            .jsonPath("$.data.letters.length()").isEqualTo(27)
            .jsonPath("$.data.letters[*].letter").isEqualTo(letterKeys())
            .jsonPath("$.data.letters[*].count").isEqualTo(expectedCounts())
            .jsonPath("$.data.total").isEqualTo(expectedCounts().stream().mapToInt(Integer::intValue).sum())
            .jsonPath("$.data.hasMore").isEqualTo(true)
            .jsonPath("$.data.products.length()").isEqualTo(50)
            .returnResult().getResponseBody());
        assertThat(all).contains("\"letter\":null,");
        web.get().uri("/v1/products/browse?letter=B").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(55)
            .jsonPath("$.data.hasMore").isEqualTo(true)
            .jsonPath("$.data.products.length()").isEqualTo(50)
            .jsonPath("$.data.products[0].tradeName").isEqualTo("Bulk01")
            .jsonPath("$.data.products[49].tradeName").isEqualTo("Bulk50");
        web.get().uri("/v1/products/browse?letter=B&page=1").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.page").isEqualTo(1)
            .jsonPath("$.data.total").isEqualTo(55)
            .jsonPath("$.data.hasMore").isEqualTo(false)
            .jsonPath("$.data.products[*].tradeName").isEqualTo(List.of("Bulk51", "Bulk52", "Bulk53", "Bulk54", "Bulk55"));
        web.get().uri("/v1/products/browse?letter=B&page=9").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.total").isEqualTo(55)
            .jsonPath("$.data.hasMore").isEqualTo(false)
            .jsonPath("$.data.products.length()").isEqualTo(0);
    }

    static List<String> letterKeys() {
        List<String> keys = new ArrayList<>(IntStream.rangeClosed('A', 'Z').mapToObj(c -> String.valueOf((char) c)).toList());
        keys.add("0-9");
        return keys;
    }

    /** Approved-only: B 55 (Bulk), E 1 (ecoflam), N 2 (Napa twice), W 1 (Warin), 0-9 3. */
    List<Integer> expectedCounts() {
        return counts(java.util.Map.of("B", 55, "E", 1, "N", 2, "W", 1, "0-9", 3));
    }

    static List<Integer> counts(java.util.Map<String, Integer> nonZero) {
        return letterKeys().stream().map(k -> nonZero.getOrDefault(k, 0)).toList();
    }

    /**
     * lower(trade_name), then trade_name, then concept_id, across pages. Only orders that hold under any collation are
     * asserted (the database's collation places digits, symbols and accents).
     */
    @Test void theSortOrderIsLowerTradeNameThenTradeNameThenConceptId() {
        List<String> ids = everyListedId();
        List<String> bulk = IntStream.rangeClosed(1, 55).mapToObj(i -> String.format("BK-%02d", i)).toList();
        assertThat(ids).containsSubsequence(bulk).containsSubsequence(inOrder());
        assertThat(ids.subList(ids.indexOf("BK-01"), ids.indexOf("BK-55") + 1)).isEqualTo(bulk);
        web.get().uri("/v1/products/browse?letter=N").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.products[*].conceptId").isEqualTo(List.of("N-1", "N-2"));
    }

    /** Collation-independent orders among the listed products (a lower-case name sorts by its letters, not its case). */
    List<String> inOrder() { return List.of("BK-55", "E-LOW", "N-1", "N-2", "W-1"); }

    @Test void pageOutside0To9AndAnUnknownLetterAre400() {
        web.get().uri("/v1/products/browse?page=10").exchange().expectStatus().isBadRequest().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo("page")
            .jsonPath("$.data").doesNotExist();
        web.get().uri("/v1/products/browse?page=-1").exchange().expectStatus().isBadRequest().expectBody()
            .jsonPath("$.errors[0].field").isEqualTo("page");
        web.get().uri("/v1/products/browse?page=x").exchange().expectStatus().isBadRequest().expectBody()
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY");
        for (String bad : List.of("AB", "1", "%", "ক", "0–9"))
            web.get().uri("/v1/products/browse?letter={l}", bad).exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo("letter");
        web.get().uri("/v1/products/browse?letter=").exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.data.letter").value(v -> assertThat(v).isNull()).jsonPath("$.data.total").isEqualTo(expectedCounts().stream().mapToInt(Integer::intValue).sum());
    }

    /** Public data only: no token needed, but a present one must match, as for /suggest; the literal path is not a concept id. */
    @Test void aWrongInternalTokenIsRefusedAndTheRightOneChangesNothing() {
        web.get().uri("/v1/products/browse").header(HEADER, "not-the-token").exchange().expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED").jsonPath("$.data").doesNotExist();
        web.get().uri("/v1/products/suggest?q=napa").header(HEADER, "not-the-token").exchange().expectStatus().isUnauthorized();
        String anonymous = str(web.get().uri("/v1/products/browse?letter=N").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.letters").isNotEmpty().returnResult().getResponseBody());
        String internal = str(internal(web).get().uri("/v1/products/browse?letter=N&scope=all").exchange().expectStatus().isOk()
            .expectBody().returnResult().getResponseBody());
        assertThat(internal.replaceAll("\"metadata\":\\{[^}]*}", "")).isEqualTo(anonymous.replaceAll("\"metadata\":\\{[^}]*}", ""));
    }
}
