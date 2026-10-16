package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InteractionCheckService;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.application.port.CheckQueryPort.CheckData;
import com.niramoy.bddrug.application.port.CheckQueryPort.IngredientRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.ProductRow;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.RouteRule;
import com.niramoy.bddrug.domain.Scope;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §6.7.2 rules 1–4 are one rule, cited by §5.6.2 (the desk's batch pairs) and used by the public checker; the not-checked
 * logic is shared "so the two never disagree". It lives in BatchPairs.reason (why a substance cannot be checked) and
 * BatchPairs.reasonOnThisSide (which side's reason a pair shows). The checker calls both and keeps no copy.
 */
class NotCheckedRuleGuardTest {
    static final Path MAIN = Path.of("src/main/java/com/niramoy/bddrug");
    static final Path CHECKER = MAIN.resolve("application/InteractionCheckService.java");
    static final Path RULE_HOME = MAIN.resolve("domain/BatchPairs.java");

    static final DdinterCode SYS = new DdinterCode("DDInter1", "systemic");
    static final RouteRule.Choice CHOSEN = new RouteRule.Choice(List.of(SYS), false);
    static final Set<String> COMPLETE = Set.of("DDInter1");

    @Test void theReasonMatrix() {
        assertThat(BatchPairs.reason(null, "full", CHOSEN, COMPLETE)).isEqualTo("unmapped");
        assertThat(BatchPairs.reason(null, "not_run", null, COMPLETE)).isEqualTo("unmapped");
        assertThat(BatchPairs.reason("BDS-1", "none", null, COMPLETE)).isEqualTo("no_data");
        assertThat(BatchPairs.reason("BDS-1", "not_run", null, COMPLETE)).isEqualTo("not_run");
        assertThat(BatchPairs.reason("BDS-1", "partial", null, COMPLETE)).isEqualTo("not_run");
        assertThat(BatchPairs.reason("BDS-1", null, null, COMPLETE)).isEqualTo("not_run");
        assertThat(BatchPairs.reason("BDS-1", "full", null, COMPLETE)).isEqualTo("no_route");
        assertThat(BatchPairs.reason("BDS-1", "full", CHOSEN, Set.of())).isEqualTo("not_run");      // D41: no full stored list
        assertThat(BatchPairs.reason("BDS-1", "full", CHOSEN, COMPLETE)).isNull();
    }

    @Test void theSideRule() {
        assertThat(BatchPairs.reasonOnThisSide("no_route", null)).isTrue();
        assertThat(BatchPairs.reasonOnThisSide(null, "no_route")).isFalse();
        assertThat(BatchPairs.reasonOnThisSide("no_data", "no_route")).isTrue();
        assertThat(BatchPairs.reasonOnThisSide("no_route", "no_data")).isFalse();
        assertThat(BatchPairs.reasonOnThisSide("unmapped", "not_run")).isTrue();
        for (String r : BatchPairs.REASON_ORDER)
            assertThat(BatchPairs.reasonOnThisSide(r, r)).as("a tie stays on this side: " + r).isTrue();
    }

    @Test void aTieShowsTheFirstSideOnTheChecker() {
        CheckQueryPort port = ids -> Mono.just(new CheckData(
            List.of(new ProductRow("D", "Motigut", "Domperidone 10 mg", "systemic", "ok"),
                new ProductRow("O", "Omep", "Omeprazole 20 mg", "systemic", "ok")),
            List.of(new IngredientRow("D", "XMD", "Domperidone", "BDS-4", "Domperidone", "none"),
                new IngredientRow("O", "XMO", "Omeprazole", "BDS-5", "Omeprazole", "none")),
            Map.of(), Set.of(), List.of()));
        CheckResult r = new InteractionCheckService(port).check(List.of("D", "O"), Scope.PUBLIC).block();
        assertThat(r.notChecked()).singleElement()
            .extracting(CheckResult.NotChecked::reason, CheckResult.NotChecked::side).containsExactly("no_data", "a");
    }

    @Test void aTieShowsThisSideOnTheDesk() {
        var d = new BatchPairs.Substance("BDS-4", "Domperidone", "none", List.of());
        var o = new BatchPairs.Substance("BDS-5", "Omeprazole", "none", List.of());
        BatchPairs.Result r = BatchPairs.compute("D", List.of(new BatchPairs.Product("D", "Motigut", 1, "systemic", List.of(d)),
            new BatchPairs.Product("O", "Omep", 2, "systemic", List.of(o))), List.of(), Set.of());
        assertThat(r.notChecked()).singleElement()
            .extracting(BatchPairs.NotChecked::reason, BatchPairs.NotChecked::side).containsExactly("no_data", "this");
    }

    static boolean restatesTheRule(String source) {
        return source.contains("REASON_ORDER.indexOf") || source.contains("\"no_route\"") || source.contains("\"no_data\"");
    }

    @Test void theCheckerKeepsNoCopyOfTheRule() throws IOException {
        String checker = Files.readString(CHECKER);
        assertThat(restatesTheRule(checker)).as("InteractionCheckService restates §6.7.2 rule 1 or the tie-break").isFalse();
        assertThat(checker).contains("BatchPairs.reason(", "BatchPairs.reasonOnThisSide(");
        String home = Files.readString(RULE_HOME);
        assertThat(home.split("REASON_ORDER\\.indexOf", -1)).as("the tie-break is stated once, in reasonOnThisSide").hasSize(3);
        assertThat(home).contains("public static String reason(", "public static boolean reasonOnThisSide(");
    }

    @Test void theGuardCatchesACopy() {
        assertThat(restatesTheRule("BatchPairs.REASON_ORDER.indexOf(a.reason())")).isTrue();
        assertThat(restatesTheRule("if (\"none\".equals(coverage)) return \"no_data\";")).isTrue();
        assertThat(restatesTheRule("BatchPairs.reasonOnThisSide(a.reason(), b.reason())")).isFalse();
    }
}
