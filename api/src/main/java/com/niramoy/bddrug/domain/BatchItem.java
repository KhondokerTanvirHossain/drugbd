package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;

/** extractedAt is the record's latest pipeline run; the review form echoes it back so a stale decision is refused. */
public record BatchItem(String conceptId, String review, String note, Product extracted, String sourceJson,
                        List<StageResult> stages, Instant extractedAt) {}
