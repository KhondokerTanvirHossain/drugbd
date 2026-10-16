package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PairReviewRule.Decision;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.PublicPairReviews.Pair;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.4 P1C public rules (D53): reviewed with its date, or not_reviewed; changed and issue never leave the API. */
class PublicPairReviewsTest {
    static final Instant AT = Instant.parse("2026-10-16T05:20:00Z");
    static final Pair WA = new Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"), "Bleeding risk.", "Avoid.");
    static final Pair AW = new Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null);

    static Decision d(long id, String decision, String hash, int minutes) {
        return new Decision(id, decision, "issue".equals(decision) ? "a note" : "", hash, null, AT.plusSeconds(60L * minutes), false);
    }

    @Test void theHashIsPairContentsHashOfTheCleanedContent() {
        assertThat(WA.hash()).isEqualTo(PairContent.hash("DDInter1951", "DDInter20",
            new PairContent.Content("major", List.of("Avoid", "Monitor"), "Bleeding risk.", "Avoid.")));
        // DDInter placeholders hash like no text (PairContent cleans them)
        assertThat(new Pair("DDInter14", "DDInter1951", "moderate", null, "None", " - ").hash()).isEqualTo(AW.hash());
        assertThat(WA.key()).isEqualTo("DDInter1951|DDInter20");
    }

    @Test void codesHoldsBothSidesOfEveryPair() {
        assertThat(PublicPairReviews.codes(List.of(WA, AW))).containsExactlyInAnyOrder("DDInter1951", "DDInter20", "DDInter14");
        assertThat(PublicPairReviews.codes(List.of())).isEmpty();
    }

    @Test void reviewedOnlyForACurrentReviewAndNeverAnIssueOrAChange() {
        Map<String, List<Decision>> decisions = Map.of(
            WA.key(), List.of(d(1, "reviewed", WA.hash(), 0)),
            AW.key(), List.of(d(2, "reviewed", AW.hash(), 0), d(3, "issue", AW.hash(), 5)));
        Map<String, PairReviewRule.PublicReview> m = PublicPairReviews.of(List.of(WA, AW), decisions);
        assertThat(m.get(WA.key())).isEqualTo(new PairReviewRule.PublicReview("reviewed", AT));
        assertThat(m.get(AW.key())).as("an issue is never named in public").isEqualTo(PublicPairReviews.NONE);
        // reviewed, then DDInter changed the pair: the stored hash is stale
        assertThat(PublicPairReviews.of(List.of(WA), Map.of(WA.key(), List.of(d(1, "reviewed", "0".repeat(64), 0)))).get(WA.key()))
            .isEqualTo(PublicPairReviews.NONE);
    }

    @Test void aPairWithNoDecisionIsNotReviewedAndARepeatIsKeptOnce() {
        Map<String, PairReviewRule.PublicReview> m = PublicPairReviews.of(List.of(WA, WA, AW), Map.of());
        assertThat(m).containsOnlyKeys(WA.key(), AW.key());
        assertThat(m.values()).containsOnly(PublicPairReviews.NONE);
        assertThat(PublicPairReviews.NONE).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
    }

    @Test void thePublicFormCarriesNoNoteRoleOrEmail() {
        assertThat(java.util.Arrays.stream(PairReviewRule.PublicReview.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("state", "reviewedAt");
    }
}
