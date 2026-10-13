package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.AuditPort;
import com.niramoy.bddrug.domain.AuditEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Audit events posted by the web server (§5.15, §7.5). The API writes decision and decision_rejected itself, in the
 * decision path, and those rows drive request idempotency, so the web may not post them. Flag events come from
 * FlagService. Nothing here is logged: rows hold team-only emails.
 */
@Service
public class AuditService {
    public static final Set<String> WEB_EVENTS =
        Set.of("sign_in", "sign_in_denied", "sign_out", "review_open", "evidence_open", "decision_denied");
    public static final Set<String> ROLES = Set.of("pharmacist", "engineer", "user");
    public static final Set<String> TARGET_TYPES = Set.of("batch_item", "flag");
    public static final int TARGET_ID_MAX = 200;
    private static final Pattern OUTCOME = Pattern.compile("[a-z_]{1,32}");
    private static final Pattern UUID_TEXT =
        Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    private final AuditPort port;
    public AuditService(AuditPort port) { this.port = port; }

    public record Request(String event, String actorEmail, String actorRole, String targetType, String targetId,
                          String outcome, String requestId) {}

    public Mono<Long> record(Request r) {
        return Mono.fromCallable(() -> validate(r)).flatMap(port::append);
    }

    static AuditEvent validate(Request r) {
        String event = Validate.oneOf(r.event(), WEB_EVENTS, "event");
        String email = r.actorEmail() == null ? null : Validate.email(r.actorEmail(), "actorEmail");
        String role = r.actorRole() == null ? null : Validate.oneOf(r.actorRole(), ROLES, "actorRole");
        String targetType = r.targetType() == null ? null : Validate.oneOf(r.targetType(), TARGET_TYPES, "targetType");
        String targetId = r.targetId() == null ? null : Validate.text(r.targetId(), 1, TARGET_ID_MAX, "targetId");
        if (r.outcome() == null || !OUTCOME.matcher(r.outcome()).matches())
            throw new InvalidQueryException("outcome", "outcome must be 1-32 lower-case letters or underscores");
        if (r.requestId() == null || !UUID_TEXT.matcher(r.requestId()).matches())
            throw new InvalidQueryException("requestId", "requestId must be a UUID");
        return new AuditEvent(event, email, role, targetType, targetId, r.outcome(), UUID.fromString(r.requestId()));
    }
}
