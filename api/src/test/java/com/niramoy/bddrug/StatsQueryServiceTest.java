package com.niramoy.bddrug;

import com.niramoy.bddrug.application.StatsQueryService;
import com.niramoy.bddrug.application.port.StatsQueryPort.BatchRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.DecisionRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.ItemRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.Totals;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SiteStats;
import com.niramoy.bddrug.domain.SiteStats.BatchStats;
import com.niramoy.bddrug.domain.SiteStats.ItemStats;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** The pure §7.4 assembly: exampleUsable, the counts that skip removed items, and the batch order. */
class StatsQueryServiceTest {
    private static final Instant RUN = Instant.parse("2026-10-11T21:28:00Z");
    private static final Totals TOTALS = new Totals(10, 11, 1, 9);

    private static ItemRow item(String batch, String concept, String review, boolean removed, boolean productPublic) {
        return new ItemRow(batch, concept, "Trade " + concept, review, RUN, removed, productPublic);
    }

    private static DecisionRow decision(String batch, String concept, long id, String d, String role, Instant at) {
        return new DecisionRow(batch, concept, new ReviewDecision(id, d, null, null, role, at));
    }

    @Test void exampleUsableFollowsTheDisplayStatusAndTheBatchFile() {
        SiteStats s = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("B", "in_review")), List.of(
                item("B", "a", "pending", false, false),   // nothing decided: usable
                item("B", "b", "issue", false, false),     // a reviewer reported an issue after the run: withdrawn
                item("B", "c", "issue", false, false),     // the pipeline's own issue (no decision): display status pending, usable
                item("B", "d", "ok", true, false),         // removed from the batch file: withdrawn
                item("B", "e", "pending", false, false),   // an issue before the latest run no longer counts: usable
                item("B", "f", "ok", false, true)),        // approved and public
            List.of(decision("B", "b", 1, "issue", "pharmacist", RUN.plusSeconds(60)),
                    decision("B", "e", 2, "issue", "engineer", RUN.minusSeconds(60)),
                    decision("B", "f", 3, "ok", "pharmacist", RUN.plusSeconds(60))));
        List<ItemStats> items = s.batches().get(0).items();
        assertThat(items).extracting(ItemStats::conceptId).containsExactly("a", "b", "c", "d", "e", "f");
        assertThat(items).extracting(ItemStats::exampleUsable).containsExactly(true, false, true, false, true, true);
        assertThat(items).extracting(ItemStats::status)
            .containsExactly("not_reviewed", "not_reviewed", "not_reviewed", "not_reviewed", "not_reviewed", "approved");
        assertThat(items).extracting(ItemStats::tradeName).startsWith("Trade a");
    }

    @Test void countsOnlyItemsStillInTheBatchFile() {
        BatchStats b = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("B", "in_review")), List.of(
                item("B", "a", "ok", false, true), item("B", "b", "ok", true, true), item("B", "c", "pending", false, false)),
            List.of()).batches().get(0);
        assertThat(b.itemCount()).isEqualTo(2);
        assertThat(b.approved()).isEqualTo(1);
        assertThat(b.items()).hasSize(3);
    }

    @Test void aDecisionOnTheSameRecordInAnotherBatchDoesNotWithdrawIt() {
        SiteStats s = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("X", "in_review"), new BatchRow("Y", "in_review")),
            List.of(item("X", "a", "pending", false, false), item("Y", "a", "issue", false, false)),
            List.of(decision("Y", "a", 1, "issue", "pharmacist", RUN.plusSeconds(60))));
        assertThat(s.batches().get(0).items().get(0).exampleUsable()).isTrue();
        assertThat(s.batches().get(1).items().get(0).exampleUsable()).isFalse();
    }

    @Test void keepsTheBatchOrderListsAnEmptyBatchAndCarriesTheTotals() {
        SiteStats s = StatsQueryService.assemble(TOTALS, List.of(new BatchRow("new", "in_review"), new BatchRow("old", "approved")),
            List.of(item("old", "a", "ok", false, true)), List.of());
        assertThat(s.batches()).extracting(BatchStats::batchId).containsExactly("new", "old");
        assertThat(s.batches().get(0).items()).isEmpty();
        assertThat(s.batches().get(0).itemCount()).isZero();
        assertThat(s.batches().get(1).status()).isEqualTo("approved");
        assertThat(s.registerProducts()).isEqualTo(39196);
        assertThat(List.of(s.productsLoaded(), s.substances(), s.approvedProducts(), s.inReviewProducts())).containsExactly(10L, 11L, 1L, 9L);
    }
}
