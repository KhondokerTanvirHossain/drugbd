package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.Instant;
import java.util.List;

/** One batch record for the review desk (spec §7.3). No email anywhere: history carries roles and {@code mine}. */
public record ReviewItem(String batchId, String conceptId, int index, int total, String displayStatus, String review,
                         ReviewViews.Version version, BatchInfo batch, Brand brand, List<DgdaIngredient> dgdaIngredients,
                         Clinical clinicalDrug, List<IngredientSummary> ingredients, List<Stage> stages,
                         BatchPairs.Result batchPairs, @JsonRawValue String sourceJson, String sourceUrl,
                         List<ItemHistory.Entry> history, ItemHistory.Reopen reopen) {
    public record BatchInfo(Instant runAt, int itemCount, String status) {}
    public record Brand(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                        String genericContentRaw, String qualityFlag, String parseStatus, String parseNote) {}
    public record DgdaIngredient(String xmCode, String name) {}
    public record Clinical(String bdcId, String displayName, String doseForm, String route, String signature) {}
    public record TextMissingPair(String ddinterA, String nameA, String ddinterB, String nameB, String severity, boolean inBatch) {}
    public record Stage(String stage, String status, List<StageNotes.Note> notes, List<TextMissingPair> textMissing,
                        @JsonRawValue String evidence) {}
}
