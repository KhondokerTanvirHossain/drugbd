package com.niramoy.bddrug.adapter.persistence;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.4: "partnerBdsId is null when the partner substance is not public", and P9 serves a pair review only for pairs
 * between public products. The substance detail and P9 read that rule, and the both-sides pair union it runs over, from
 * one place in R2dbcSubstanceAdapter (partnerBdsIdSql, SIDES_CTE), so the two surfaces cannot drift apart.
 */
class PartnerVisibilityRuleGuardTest {
    static final Path ADAPTER = Path.of("src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcSubstanceAdapter.java");

    static int occurrences(String haystack, String needle) {
        int n = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length())) n++;
        return n;
    }

    @Test void publicScopeLooksThePartnerUpAmongPublicSubstancesOnly() {
        assertThat(R2dbcSubstanceAdapter.partnerBdsIdSql(true)).isEqualTo(
            "(SELECT min(c.bds_id) FROM curated.substance_code c JOIN pubsub ps ON ps.bds_id = c.bds_id "
                + "WHERE c.system = 'DDINTER' AND c.code = s.partner_id)");
        assertThat(R2dbcSubstanceAdapter.partnerBdsIdSql(false)).isEqualTo(
            "(SELECT min(c.bds_id) FROM curated.substance_code c WHERE c.system = 'DDINTER' AND c.code = s.partner_id)");
    }

    @Test void sidesCarriesBothStoredCodesAndThePartnerSide() {
        String sides = R2dbcSubstanceAdapter.SIDES_CTE;
        assertThat(sides).startsWith(", sides AS (").contains("p.ddinter_a, p.ddinter_b, p.ddinter_b AS partner_id",
            "p.partner_name_b AS partner_name", "ON p.ddinter_a = m.code", "UNION ALL", "ON p.ddinter_b = m.code");
    }

    @Test void theRuleAndTheUnionAreWrittenOnce() throws IOException {
        String source = Files.readString(ADAPTER);
        assertThat(occurrences(source, "JOIN pubsub ps ON ps.bds_id = c.bds_id")).as("partner visibility subquery").isEqualTo(1);
        assertThat(occurrences(source, "JOIN curated.ddinter_pair p ON p.ddinter_b = m.code")).as("sides union").isEqualTo(1);
        assertThat(occurrences(source, "partnerBdsIdSql(publicOnly)")).as("both readers use the rule").isEqualTo(2);
        assertThat(occurrences(source, "MINE_CTE + SIDES_CTE")).as("both readers use the union").isEqualTo(2);
    }
}
