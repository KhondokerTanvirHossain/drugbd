package com.niramoy.bddrug.domain;
import java.time.Instant;

/**
 * One row of the append-only review history ({@code ops.review_decision}).
 * {@code reviewerEmail} is personal data: it is null unless the caller holds the internal token.
 */
public record ReviewDecision(long id, String decision, String note, String reviewerEmail, String reviewerRole,
                             Instant decidedAt) {}
