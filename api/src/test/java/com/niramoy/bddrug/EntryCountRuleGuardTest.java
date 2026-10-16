package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §6.5 item 4, §6.6, §7.3: the per-entry DDInter counts (severity buckets over both sides of the stored pair, disease and
 * food counts) are one rule, kept in IngredientSummaryReader.entries. The product page, the senior substance page and the
 * public substance page all read it, so the eye-drop 112/654 numbers (§5.6.1) cannot drift between pages.
 */
class EntryCountRuleGuardTest {
    static final Path DIR = Path.of("src/main/java/com/niramoy/bddrug/adapter/persistence");
    static final String RULE_HOME = "IngredientSummaryReader.java";

    static boolean restatesTheEntryCountRule(String source) {
        return source.contains("FILTER (WHERE s.severity")
            || source.contains("count(*) FROM curated.ddinter_disease")
            || source.contains("count(*) FROM curated.ddinter_food");
    }

    @Test void onlyIngredientSummaryReaderCountsEntries() throws IOException {
        List<String> offenders = new ArrayList<>();
        try (Stream<Path> files = Files.list(DIR)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".java")).sorted().toList()) {
                String name = f.getFileName().toString();
                if (!name.equals(RULE_HOME) && restatesTheEntryCountRule(Files.readString(f))) offenders.add(name);
            }
        }
        assertThat(offenders).isEmpty();
        assertThat(restatesTheEntryCountRule(Files.readString(DIR.resolve(RULE_HOME)))).as("the rule lives in " + RULE_HOME).isTrue();
    }

    @Test void theSubstanceAdapterReadsTheRule() throws IOException {
        assertThat(Files.readString(DIR.resolve("R2dbcSubstanceAdapter.java"))).contains("new IngredientSummaryReader(db)", ".entries(");
    }

    @Test void theGuardCatchesACopy() {
        assertThat(restatesTheEntryCountRule("count(s.severity) FILTER (WHERE s.severity = 'major') AS major")).isTrue();
        assertThat(restatesTheEntryCountRule("(SELECT count(*) FROM curated.ddinter_food x WHERE x.ddinter_id = e.id)")).isTrue();
        assertThat(restatesTheEntryCountRule("entryReader.entries(codes)")).isFalse();
    }
}
