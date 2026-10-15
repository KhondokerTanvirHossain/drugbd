package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairContent.Content;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PairReviewRule.Decision;
import com.niramoy.bddrug.domain.PairReviewRule.Review;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.17 "Pair review state": the latest pair decision L and the current content hash give the state (§11.3). */
class PairReviewRuleTest {
    static final Instant T = Instant.parse("2026-10-16T05:00:00Z");
    static final Content V1 = new Content("moderate", List.of("Metabolism"), "Text one.", null);
    static final Content V2 = new Content("major", List.of("Metabolism"), "Text one.", null);
    static final String H1 = PairContent.hash("DDInter14", "DDInter1951", V1), H2 = PairContent.hash("DDInter14", "DDInter1951", V2);

    static Decision d(long id, String decision, String note, Content c, int minutes, boolean mine) {
        return new Decision(id, decision, note, PairContent.hash("DDInter14", "DDInter1951", c), c, T.plusSeconds(60L * minutes), mine);
    }

    @Test void noDecisionIsNotReviewed() {
        assertThat(PairReviewRule.review(List.of(), H1)).isEqualTo(new Review("not_reviewed", null, false, null));
        assertThat(PairReviewRule.publicReview(List.of(), H1)).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
        assertThat(PairReviewRule.lastId(List.of())).isNull();
    }

    @Test void reviewedWhileTheHashIsUnchanged() {
        List<Decision> ds = List.of(d(1, "reviewed", "", V1, 0, true));
        assertThat(PairReviewRule.review(ds, H1)).isEqualTo(new Review("reviewed", T, true, null));
        assertThat(PairReviewRule.publicReview(ds, H1)).isEqualTo(new PairReviewRule.PublicReview("reviewed", T));
        assertThat(PairReviewRule.changes(ds, V1, H1)).isEmpty();
    }

    @Test void aSeverityActionOrTextChangeIsChanged() {
        List<Decision> ds = List.of(d(1, "reviewed", "", V1, 0, false));
        assertThat(PairReviewRule.review(ds, H2)).isEqualTo(new Review("changed", T, false, null));
        assertThat(PairReviewRule.publicReview(ds, H2)).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
        assertThat(PairReviewRule.changes(ds, V2, H2)).containsExactly(new PairReviewRule.Change("Severity", "moderate", "major"));
        Content texts = new Content("moderate", List.of("Metabolism", "Synergy"), "Text two.", "Monitor.");
        assertThat(PairReviewRule.changes(ds, texts, PairContent.hash("DDInter14", "DDInter1951", texts))).containsExactly(
            new PairReviewRule.Change("Actions", "Metabolism", "Metabolism, Synergy"),
            new PairReviewRule.Change("Interaction text", "Text one.", "Text two."),
            new PairReviewRule.Change("Management text", null, "Monitor."));
    }

    @Test void aPartnerNameChangeIsNotAChange() {
        // partner display names are not part of the content: the same content hashes the same
        assertThat(PairReviewRule.review(List.of(d(1, "reviewed", "", V1, 0, false)), PairContent.hash("DDInter14", "DDInter1951",
            new Content("moderate", List.of("Metabolism"), "Text one.", null))).state()).isEqualTo("reviewed");
    }

    @Test void anIssueStaysAnIssueAfterAChangeAndCarriesItsNote() {
        List<Decision> ds = List.of(d(1, "reviewed", "", V1, 0, false), d(2, "issue", "Text says avoid; severity is Minor", V1, 5, true));
        assertThat(PairReviewRule.review(ds, H1)).isEqualTo(new Review("issue", T.plusSeconds(300), true, "Text says avoid; severity is Minor"));
        assertThat(PairReviewRule.review(ds, H2).state()).isEqualTo("issue");
        assertThat(PairReviewRule.publicReview(ds, H1)).isEqualTo(new PairReviewRule.PublicReview("not_reviewed", null));
    }

    @Test void theLatestDecisionWinsByTimeThenIdWhateverTheInputOrder() {
        List<Decision> ds = List.of(d(3, "reviewed", "", V1, 9, false), d(2, "issue", "first an issue", V1, 1, false));
        assertThat(PairReviewRule.review(ds, H1).state()).isEqualTo("reviewed");
        assertThat(PairReviewRule.lastId(ds)).isEqualTo(3L);
        Decision sameTimeLowerId = d(4, "issue", "same time, later id", V1, 9, false);
        assertThat(PairReviewRule.review(List.of(sameTimeLowerId, d(3, "reviewed", "", V1, 9, false)), H1).state()).isEqualTo("issue");
    }

    @Test void historyIsOldestFirstAndMarksReviewsTheDataChangedAfter() {
        List<Decision> ds = List.of(d(2, "issue", "check the text", V1, 5, false), d(1, "reviewed", "", V1, 0, true));
        assertThat(PairReviewRule.history(ds, H2)).containsExactly(
            new PairReviewRule.HistoryEntry("reviewed", T, null, true, true),
            new PairReviewRule.HistoryEntry("issue", T.plusSeconds(300), "check the text", false, false));
        assertThat(PairReviewRule.history(ds, H1).get(0).changedAfter()).isFalse();
    }
}
