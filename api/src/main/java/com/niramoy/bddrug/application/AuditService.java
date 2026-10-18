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
    /**
     * §5.15, §7.5: the web's events. pair_decision and pair_decision_rejected are the API's own (pair decision path).
     * qa_read (§7.9.6) is written by the web's QA API route handlers, with no actor.
     */
    public static final Set<String> WEB_EVENTS =
        Set.of("sign_in", "sign_in_denied", "sign_out", "review_open", "evidence_open", "decision_denied", "senior_open", "qa_read");
    public static final Set<String> ROLES = Set.of("pharmacist", "engineer", "senior", "user");
    /**
     * senior_open targets a substance (`BDS-…`) or the pair queue (its `show` value). ddinter_pair is written by the API only.
     * qa_read targets a qa_route, `{label}/{route}` or `{route}` (§7.9.6): a key label and a route name, never the key.
     */
    public static final Set<String> TARGET_TYPES = Set.of("batch_item", "flag", "substance", "pair_queue", "qa_route");
    public static final int TARGET_ID_MAX = 200;
    /** An id (a flag id, a batch id or a concept id) or a batch item `{batchId}/{conceptId}`; never free text (§5.15). */
    private static final Pattern TARGET_ID =
        Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,98}(/[A-Za-z0-9][A-Za-z0-9._:-]{0,98})?");
    /**
     * A qa_route target (§7.9.6): an optional key label (the §7.9.1 label rule) and one of the five route names, so a path id
     * or a query value can never be recorded for a QA read. TARGET_ID stays unchanged for every other target type.
     */
    private static final Pattern QA_TARGET_ID =
        Pattern.compile("([a-z0-9][a-z0-9_-]{0,31}/)?(batches|batch|record|records|pairs)");
    public static final String QA_READ = "qa_read", QA_ROUTE = "qa_route";
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
        boolean qa = QA_READ.equals(event);
        // qa_read always targets a qa_route and never has an actor (no email, no role); a qa_route is qa_read's only.
        if (qa != QA_ROUTE.equals(targetType))
            throw new InvalidQueryException("targetType", "qa_read targets a qa_route, and only qa_read does");
        if (qa && email != null) throw new InvalidQueryException("actorEmail", "qa_read has no actor");
        if (qa && role != null) throw new InvalidQueryException("actorRole", "qa_read has no actor");
        if (qa && (targetId == null || !QA_TARGET_ID.matcher(targetId).matches()))
            throw new InvalidQueryException("targetId", "targetId must be a QA route, with or without a key label");
        if (!qa && targetId != null && !TARGET_ID.matcher(targetId).matches())
            throw new InvalidQueryException("targetId", "targetId must be an id or a batch item id pair");
        if (r.outcome() == null || !OUTCOME.matcher(r.outcome()).matches())
            throw new InvalidQueryException("outcome", "outcome must be 1-32 lower-case letters or underscores");
        if (r.requestId() == null || !UUID_TEXT.matcher(r.requestId()).matches())
            throw new InvalidQueryException("requestId", "requestId must be a UUID");
        return new AuditEvent(event, email, role, targetType, targetId, r.outcome(), UUID.fromString(r.requestId()));
    }
}
