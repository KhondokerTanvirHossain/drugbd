package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PublicMode;
import com.niramoy.bddrug.domain.PublicReview;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** §7.4.1 (D74): the switch's parsing and the label order. Pure. */
class PublicModeTest {
    @Test void unsetOrEmptyIsApprovedOnly() {
        assertThat(PublicMode.fromSetting(null)).isEqualTo(PublicMode.APPROVED_ONLY);
        assertThat(PublicMode.fromSetting("")).isEqualTo(PublicMode.APPROVED_ONLY);
        assertThat(PublicMode.fromSetting("   ")).isEqualTo(PublicMode.APPROVED_ONLY);
    }

    @Test void trueAndFalseInAnyCase() {
        assertThat(PublicMode.fromSetting("true")).isEqualTo(PublicMode.SHOW_UNREVIEWED);
        assertThat(PublicMode.fromSetting("TRUE")).isEqualTo(PublicMode.SHOW_UNREVIEWED);
        assertThat(PublicMode.fromSetting(" false ")).isEqualTo(PublicMode.APPROVED_ONLY);
        assertThat(PublicMode.fromSetting("False")).isEqualTo(PublicMode.APPROVED_ONLY);
    }

    @Test void anyOtherValueIsRefused() {
        for (String bad : List.of("yes", "1", "ture", "on"))
            assertThatThrownBy(() -> PublicMode.fromSetting(bad)).as(bad)
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("PUBLIC_SHOWS_UNREVIEWED must be true or false");
    }

    @Test void wireNames() {
        assertThat(PublicMode.APPROVED_ONLY.wire()).isEqualTo("approved_only");
        assertThat(PublicMode.SHOW_UNREVIEWED.wire()).isEqualTo("show_unreviewed");
        assertThat(PublicMode.SHOW_UNREVIEWED.showsUnreviewed()).isTrue();
        assertThat(PublicMode.APPROVED_ONLY.showsUnreviewed()).isFalse();
    }

    @Test void worstPrefersProblemThenNotReviewed() {
        assertThat(PublicReview.worst(List.of(PublicReview.APPROVED, PublicReview.NOT_REVIEWED))).isEqualTo(PublicReview.NOT_REVIEWED);
        assertThat(PublicReview.worst(List.of(PublicReview.NOT_REVIEWED, PublicReview.PROBLEM, PublicReview.APPROVED)))
            .isEqualTo(PublicReview.PROBLEM);
        assertThat(PublicReview.worst(List.of(PublicReview.APPROVED))).isEqualTo(PublicReview.APPROVED);
        assertThat(PublicReview.worst(List.of())).isNull();
    }

    @Test void carriedPrefersApprovedThenProblem() {
        assertThat(PublicReview.carried(List.of(PublicReview.PROBLEM, PublicReview.APPROVED))).isEqualTo(PublicReview.APPROVED);
        assertThat(PublicReview.carried(List.of(PublicReview.NOT_REVIEWED, PublicReview.PROBLEM))).isEqualTo(PublicReview.PROBLEM);
        assertThat(PublicReview.carried(List.of(PublicReview.NOT_REVIEWED))).isEqualTo(PublicReview.NOT_REVIEWED);
        assertThat(PublicReview.carried(List.of())).isNull();
    }
}
