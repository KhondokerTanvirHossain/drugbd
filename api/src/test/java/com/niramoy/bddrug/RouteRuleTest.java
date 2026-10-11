package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.RouteRule;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class RouteRuleTest {
    static final List<DdinterCode> CHLORAMPHENICOL = List.of(
        new DdinterCode("DDInter353", "otic"), new DdinterCode("DDInter351", "systemic"),
        new DdinterCode("DDInter352", "ophthalmic"));

    @Test void exactRouteMatchIsNotAssumed() {
        var choice = RouteRule.choose(CHLORAMPHENICOL, "ophthalmic").orElseThrow();
        assertThat(choice.codes()).extracting(DdinterCode::code).containsExactly("DDInter352");
        assertThat(choice.routeAssumed()).isFalse();
    }
    @Test void systemicProductWithSystemicEntryIsNotAssumed() {
        var choice = RouteRule.choose(CHLORAMPHENICOL, "systemic").orElseThrow();
        assertThat(choice.codes()).extracting(DdinterCode::code).containsExactly("DDInter351");
        assertThat(choice.routeAssumed()).isFalse();
    }
    @Test void missingRouteEntryFallsBackToSystemicAndIsAssumed() {
        var choice = RouteRule.choose(List.of(new DdinterCode("DDInter1951", "systemic")), "ophthalmic").orElseThrow();
        assertThat(choice.codes()).extracting(DdinterCode::code).containsExactly("DDInter1951");
        assertThat(choice.routeAssumed()).isTrue();
    }
    @Test void unknownRouteFallsBackToSystemicOrAnyAndIsAssumed() {
        var choice = RouteRule.choose(CHLORAMPHENICOL, null).orElseThrow();
        assertThat(choice.codes()).extracting(DdinterCode::code).containsExactly("DDInter351");
        assertThat(choice.routeAssumed()).isTrue();
        var any = RouteRule.choose(List.of(new DdinterCode("DDInter7", "any"), new DdinterCode("DDInter8", "otic")), "nasal")
            .orElseThrow();
        assertThat(any.codes()).extracting(DdinterCode::code).containsExactly("DDInter7");
        assertThat(any.routeAssumed()).isTrue();
    }
    @Test void onlyOtherRouteEntriesMeansNoUsableEntry() {
        assertThat(RouteRule.choose(List.of(new DdinterCode("DDInter353", "otic")), "systemic")).isEmpty();
        assertThat(RouteRule.choose(List.of(new DdinterCode("DDInter353", "otic")), null)).isEmpty();
        assertThat(RouteRule.choose(List.of(), "systemic")).isEmpty();
    }
    @Test void severalEntriesInTheChosenTierAreSortedByNumericId() {
        var choice = RouteRule.choose(List.of(new DdinterCode("DDInter100", "systemic"), new DdinterCode("DDInter20", "systemic")),
            "systemic").orElseThrow();
        assertThat(choice.codes()).extracting(DdinterCode::code).containsExactly("DDInter20", "DDInter100");
    }
}
