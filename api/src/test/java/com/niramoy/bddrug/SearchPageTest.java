package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.SearchPage;
import com.niramoy.bddrug.domain.SearchPage.Plan;
import com.niramoy.bddrug.domain.SearchPage.Slice;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class SearchPageTest {
    @Test void firstPageTakesSubstancesThenApprovedThenStubs() {
        assertThat(SearchPage.plan(3, 10, 30, 0, 20)).isEqualTo(new Plan(new Slice(0, 3), new Slice(0, 10), new Slice(0, 7)));
    }
    @Test void aLaterPageContinuesWhereTheLastStopped() {
        assertThat(SearchPage.plan(3, 10, 30, 20, 20)).isEqualTo(new Plan(Slice.NONE, Slice.NONE, new Slice(7, 20)));
        assertThat(SearchPage.plan(25, 10, 0, 20, 20)).isEqualTo(new Plan(new Slice(20, 5), new Slice(0, 10), Slice.NONE));
    }
    @Test void pastTheEndIsEmpty() {
        assertThat(SearchPage.plan(1, 1, 1, 20, 20)).isEqualTo(new Plan(Slice.NONE, Slice.NONE, Slice.NONE));
    }
}
