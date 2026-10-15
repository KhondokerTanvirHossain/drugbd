package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.StageNotes;
import com.niramoy.bddrug.domain.StageNotes.Note;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.3 "Stage notes": split on "; " only for a warn DDInter note; classify each part; fail notes stay whole. */
class StageNotesTest {
    @Test void aWarnDdinterNoteIsSplitAndEachPartClassified() {
        String note = "DDInter text not found for DDInter14/DDInter79; DDInter DDInter20 matched by name only; "
            + "DDInter route assumed: DDInter351 (systemic) used for topical; No DDInter entry for route otic; "
            + "something the pipeline added later";
        assertThat(StageNotes.parse("ddinter", "warn", note)).containsExactly(
            new Note("text_missing", "DDInter text not found for DDInter14/DDInter79", null, null),
            new Note("name_only", "DDInter DDInter20 matched by name only", "DDInter20", null),
            new Note("route_assumed", "DDInter route assumed: DDInter351 (systemic) used for topical", "DDInter351", "topical"),
            new Note("no_route_entry", "No DDInter entry for route otic", null, "otic"),
            new Note("other", "something the pipeline added later", null, null));
    }

    @Test void unknownRouteNotesCarryANullRoute() {
        assertThat(StageNotes.parse("ddinter", "warn",
                "DDInter route assumed: DDInter1951 (systemic) used for unknown route; No DDInter entry for unknown route"))
            .containsExactly(
                new Note("route_assumed", "DDInter route assumed: DDInter1951 (systemic) used for unknown route", "DDInter1951", null),
                new Note("no_route_entry", "No DDInter entry for unknown route", null, null));
    }

    @Test void theNoDataSentenceIsItsOwnKind() {
        assertThat(StageNotes.parse("ddinter", "warn", "No interaction data in DDInter for this substance"))
            .containsExactly(new Note("no_data", "No interaction data in DDInter for this substance", null, null));
    }

    @Test void failNotesAndOtherStagesAreKeptWhole() {
        assertThat(StageNotes.parse("ddinter", "fail", "error: RuntimeError: a; b"))
            .containsExactly(new Note("other", "error: RuntimeError: a; b", null, null));
        assertThat(StageNotes.parse("ddinter", "fail", "DDInter pair list incomplete for DDInter352"))
            .containsExactly(new Note("other", "DDInter pair list incomplete for DDInter352", null, null));
        assertThat(StageNotes.parse("substances", "warn", "approx RxNav match; second clause"))
            .containsExactly(new Note("other", "approx RxNav match; second clause", null, null));
    }

    @Test void emptyNotesGiveNoNotes() {
        assertThat(StageNotes.parse("dgda", "ok", "")).isEmpty();
        assertThat(StageNotes.parse("dgda", "ok", null)).isEmpty();
        assertThat(StageNotes.parse("ddinter", "warn", "   ")).isEmpty();
    }

    @Test void aPatternMustMatchTheWholePart() {
        assertThat(StageNotes.parse("ddinter", "warn", "Note: DDInter text not found for DDInter14/DDInter79").get(0).kind())
            .isEqualTo("other");
        assertThat(StageNotes.parse("ddinter", "warn", "DDInter text not found for DDInter14/DDInter79 (retry)").get(0).kind())
            .isEqualTo("other");
        assertThat(List.of(StageNotes.TEXT_MISSING, StageNotes.NAME_ONLY, StageNotes.NO_DATA, StageNotes.ROUTE_ASSUMED,
            StageNotes.NO_ROUTE_ENTRY, StageNotes.OTHER))
            .containsExactly("text_missing", "name_only", "no_data", "route_assumed", "no_route_entry", "other");
    }
}
