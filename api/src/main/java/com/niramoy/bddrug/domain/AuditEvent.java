package com.niramoy.bddrug.domain;
import java.util.UUID;

/** One row of ops.audit_event (§5.15). No IP addresses and no free text from forms. */
public record AuditEvent(String event, String actorEmail, String actorRole, String targetType, String targetId,
                         String outcome, UUID requestId) {}
