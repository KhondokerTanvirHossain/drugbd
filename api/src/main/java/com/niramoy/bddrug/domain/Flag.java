package com.niramoy.bddrug.domain;
import java.time.Instant;

/** A problem report from a signed-in user. Served only to internal-token callers: it holds emails. */
public record Flag(long id, String targetType, String targetId, String message, String reporterEmail, String status,
                   Instant createdAt, Instant resolvedAt, String resolvedBy) {}
