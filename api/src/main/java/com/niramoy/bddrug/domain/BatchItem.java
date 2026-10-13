package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;

/**
 * extractedAt is the record's latest pipeline run and lastDecisionId the newest decision's id (null when none); the
 * review form echoes both, so the API can refuse a decision on a re-run record or after another reviewer's decision.
 */
public record BatchItem(String conceptId, String review, String note, Product extracted, String sourceJson,
                        List<StageResult> stages, Instant extractedAt, Long lastDecisionId) {}
