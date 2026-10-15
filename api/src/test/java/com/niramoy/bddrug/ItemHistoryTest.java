package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.ItemHistory;
import com.niramoy.bddrug.domain.ItemHistory.Decision;
import com.niramoy.bddrug.domain.ItemHistory.Entry;
import com.niramoy.bddrug.domain.ItemHistory.Reopen;
import com.niramoy.bddrug.domain.ItemHistory.Snapshot;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §5.6.5: one extract entry per run_id, at the last stamp of that run; reopen from the last two groups. */
class ItemHistoryTest {
    static final Instant T0 = Instant.parse("2026-10-11T21:27:17Z");
    static Instant t(int minutes) { return T0.plusSeconds(60L * minutes); }
    static final UUID RUN_1 = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID RUN_2 = UUID.fromString("00000000-0000-0000-0000-000000000002");
    static final UUID RUN_3 = UUID.fromString("00000000-0000-0000-0000-000000000003");

    @Test void aFullRunWritesFourSnapshotsAndShowsOneExtractEntry() {
        List<Snapshot> four = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(2), RUN_1, "rerun"),
            new Snapshot(t(3), RUN_1, "rerun"), new Snapshot(t(4), RUN_1, "rerun"));
        ItemHistory.Result r = ItemHistory.build(List.of(t(0)), four, List.of(), t(4));
        assertThat(r.history()).containsExactly(
            new Entry("run", t(0), null, null, null, null, null, null),
            new Entry("extract", t(4), "run", null, null, null, null, null));
        assertThat(r.reopen()).isNull();
    }

    @Test void aLaterRunIsARerunAndReopensTheRecord() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(2), RUN_1, "rerun"),
            new Snapshot(t(30), RUN_2, "rerun"));
        List<Decision> decisions = List.of(new Decision(7, "ok", "", "pharmacist", t(10), true));
        ItemHistory.Result r = ItemHistory.build(List.of(t(0)), snaps, decisions, t(30));
        assertThat(r.history()).containsExactly(
            new Entry("run", t(0), null, null, null, null, null, null),
            new Entry("extract", t(2), "run", null, null, null, null, null),
            new Entry("decision", t(10), null, "pharmacist", "ok", "", false, true, "rerun", null),
            new Entry("extract", t(30), "rerun", null, null, null, null, null));
        assertThat(r.reopen()).isEqualTo(new Reopen("rerun", t(30), t(2), true));
    }

    @Test void aGroupOfSharedChangesKeepsThatReason() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(20), RUN_2, "shared_change"));
        ItemHistory.Result r = ItemHistory.build(List.of(), snaps, List.of(), t(20));
        assertThat(r.history().get(1)).isEqualTo(new Entry("extract", t(20), "shared_change", null, null, null, null, null));
        assertThat(r.reopen()).isEqualTo(new Reopen("shared_change", t(20), t(1), true));
    }

    @Test void aMixedGroupIsARerun() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"),
            new Snapshot(t(20), RUN_3, "shared_change"), new Snapshot(t(21), RUN_3, "rerun"));
        assertThat(ItemHistory.build(List.of(), snaps, List.of(), t(21)).reopen().reason()).isEqualTo("rerun");
    }

    @Test void decisionsAfterTheStampCountAndOnlyTheViewersAreMine() {
        List<Snapshot> one = List.of(new Snapshot(t(1), RUN_1, "run"));
        List<Decision> ds = List.of(new Decision(1, "ok", "", "engineer", t(5), false),
            new Decision(2, "issue", "strength should read 5 mg", "pharmacist", t(6), true));
        List<Entry> h = ItemHistory.build(List.of(), one, ds, t(1)).history();
        assertThat(h).extracting(Entry::kind).containsExactly("extract", "decision", "decision");
        assertThat(h.get(1).counts()).isTrue();
        assertThat(h.get(1).mine()).isFalse();
        assertThat(h.get(2).note()).isEqualTo("strength should read 5 mg");
        assertThat(h.get(2).mine()).isTrue();
    }

    @Test void anItemWithAStampButNoSnapshotShowsOneExtractEntry() {
        ItemHistory.Result r = ItemHistory.build(List.of(), List.of(), List.of(), t(3));
        assertThat(r.history()).containsExactly(new Entry("extract", t(3), "run", null, null, null, null, null));
        assertThat(r.reopen()).isNull();
    }

    @Test void diffIsUnavailableWhenTheCurrentStampHasNoSnapshot() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run"), new Snapshot(t(9), RUN_2, "rerun"));
        assertThat(ItemHistory.build(List.of(), snaps, List.of(), t(12)).reopen())
            .isEqualTo(new Reopen("rerun", t(12), t(1), false));
    }

    @Test void entriesAtTheSameInstantKeepRunExtractDecisionOrder() {
        List<Snapshot> one = List.of(new Snapshot(t(1), RUN_1, "run"));
        List<Decision> ds = List.of(new Decision(1, "ok", "", "pharmacist", t(1), false));
        assertThat(ItemHistory.build(List.of(t(1)), one, ds, null).history())
            .extracting(Entry::kind).containsExactly("run", "extract", "decision");
    }

    // ---- P1C: why a decision no longer counts (§5.6.5), and the carried approval line (§8.3.1 item 8)

    @Test void decisionsAtOrBeforeTheLatestDismissalNoLongerCountButTheDismissalDoes() {
        List<Snapshot> one = List.of(new Snapshot(t(1), RUN_1, "run"));
        List<Decision> ds = List.of(new Decision(1, "ok", "", "pharmacist", t(0), false),
            new Decision(2, "ok", "", "pharmacist", t(5), false),
            new Decision(3, "issue", "route should be otic", "engineer", t(6), false),
            new Decision(4, "dismiss", "the report misread it", "senior", t(7), true),
            new Decision(5, "issue", "a second report", "pharmacist", t(8), false));
        List<Entry> h = ItemHistory.build(List.of(), one, ds, t(1)).history().stream().filter(e -> e.kind().equals("decision")).toList();
        assertThat(h).extracting(Entry::decision, Entry::counts, Entry::uncountedBy).containsExactly(
            org.assertj.core.groups.Tuple.tuple("ok", false, "rerun"),        // before the stamp: the re-run suffix wins
            org.assertj.core.groups.Tuple.tuple("ok", false, "dismiss"),
            org.assertj.core.groups.Tuple.tuple("issue", false, "dismiss"),
            org.assertj.core.groups.Tuple.tuple("dismiss", true, null),
            org.assertj.core.groups.Tuple.tuple("issue", true, null));
        assertThat(h.get(2).note()).isEqualTo("route should be otic");   // the reporter's note stays
        assertThat(h.get(3).mine()).isTrue();
    }

    @Test void aCarriedApprovalNamesItsBatchOnTheExtractEntry() {
        List<Snapshot> snaps = List.of(new Snapshot(t(1), RUN_1, "run", "0001-pilot"));
        assertThat(ItemHistory.build(List.of(), snaps, List.of(), t(1)).history())
            .containsExactly(new Entry("extract", t(1), "run", null, null, null, null, null, null, "0001-pilot"));
    }
}
