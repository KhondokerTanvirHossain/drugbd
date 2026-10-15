package com.niramoy.bddrug;

import com.niramoy.bddrug.application.ReviewQueryService;
import com.niramoy.bddrug.domain.SourceLinks;
import com.niramoy.bddrug.domain.SourceLinks.Source;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.time.Instant;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.6.6, every pattern with the pilot codes (§11.3 SourceLinksTest). No test ever calls the sites. */
class SourceLinksTest {
    static final Instant AT = Instant.parse("2026-10-12T21:40:00Z");

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "RXCUI|161|https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=161|RxNav",
        "ATC|N02BE01|https://atcddd.fhi.no/atc_ddd_index/?code=N02BE01&showdescription=no|WHO ATC/DDD Index",
        "ATC|B01AA03|https://atcddd.fhi.no/atc_ddd_index/?code=B01AA03&showdescription=no|WHO ATC/DDD Index",
        "ATC|N02|https://atcddd.fhi.no/atc_ddd_index/?code=N02&showdescription=no|WHO ATC/DDD Index",
        "DRUGBANK|DB00316|https://go.drugbank.com/drugs/DB00316|DrugBank",
        "SNOMEDCT|387517004|https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm=387517004|RxNav (SNOMED CT search)",
        "ICD11_XM|XM5DJ7|https://icd.who.int/browse/latest-release/mms/en|Search ICD-11 for XM5DJ7",
        "DDINTER|DDInter14|https://ddinter2.scbdd.com/server/drug-detail/DDInter14/|DDInter 2.0",
        "DDINTER|DDInter352|https://ddinter2.scbdd.com/server/drug-detail/DDInter352/|DDInter 2.0",
    })
    void everyPatternLinksThePageTheSpecNames(String system, String code, String url, String label) {
        assertThat(SourceLinks.code(system, code, AT)).contains(new Source(url, label, AT));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        // quoted: @CsvSource trims unquoted values, and the trailing space is the point of this case
        "RXCUI|'161 '", "RXCUI|12345678901", "RXCUI|16a", "ATC|n02be01", "ATC|N02BE0", "DRUGBANK|DB0031", "DRUGBANK|db00316",
        "SNOMEDCT|12345", "ICD11_XM|XM5DJ", "ICD11_XM|xm5dj7", "DDINTER|DDINTER14", "DDINTER|DDInter1234567", "DDINTER|DDInter14/../x",
        "LOINC|1234-5",
    })
    void aCodeThatFailsItsPatternGetsNoLink(String system, String code) {
        assertThat(SourceLinks.code(system, code, AT)).isEmpty();
        assertThat(SourceLinks.code(system, null, AT)).isEmpty();
    }

    @Test void aPaddedCodeGetsNoLink() {
        assertThat(SourceLinks.code("RXCUI", "161 ", AT)).isEmpty();
        assertThat(SourceLinks.code("RXCUI", " 161", AT)).isEmpty();
    }

    @Test void thePairLinkNeedsANumericInteractionIdAndHasNoFetchTime() {
        assertThat(SourceLinks.pair("3039")).contains(new Source("https://ddinter2.scbdd.com/server/interact/3039/",
            "Full record in DDInter 2.0", null));
        assertThat(SourceLinks.pair(null)).isEmpty();
        assertThat(SourceLinks.pair("IA-1")).isEmpty();
        assertThat(SourceLinks.pair("1234567890")).isEmpty();
    }

    @Test void theBrandLinkIsTheOclConceptEncodedAsEncodeUriComponentDoes() {
        assertThat(SourceLinks.brand("186-0030-006--napa", AT)).isEqualTo(new Source(
            "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/", "DGDA register (OCL)", AT));
        assertThat(SourceLinks.oclUrl("a b(c)~!'")).endsWith("/concepts/a%20b(c)~!'/");
        assertThat(SourceLinks.oclUrl("x/y?z")).endsWith("/concepts/x%2Fy%3Fz/");
        assertThat(ReviewQueryService.sourceUrl("x/y?z")).isEqualTo(SourceLinks.oclUrl("x/y?z"));
        assertThat(SourceLinks.brand("W-1", null).fetchedAt()).isNull();
    }
}
