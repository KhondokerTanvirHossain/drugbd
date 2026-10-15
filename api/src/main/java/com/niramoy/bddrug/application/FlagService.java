package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.FlagPort;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagAudit;
import com.niramoy.bddrug.domain.FlagPage;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Problem reports and partner access requests (both are flags, D17). Validation only: the port writes each flag and its
 * audit row (flag_created, partner_request or flag_resolved, spec §5.15) in one transaction. The message is never audited.
 */
@Service
public class FlagService {
    public static final Set<String> TARGET_TYPES = Set.of("product", "substance", "batch_item", "check", "other");
    public static final Set<String> STATUSES = Set.of("open", "resolved");
    public static final int MESSAGE_MIN = 5, MESSAGE_MAX = 2000, TARGET_ID_MAX = 200;
    public static final int PAGE_SIZE_MAX = 50, PAGE_MAX = 10_000;
    public static final String PARTNER_TARGET = FlagAudit.PARTNER_TARGET;
    private static final Pattern UUID_TEXT =
        Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern DIGITS = Pattern.compile("^[0-9]{1,6}$");

    private final FlagPort port;
    public FlagService(FlagPort port) { this.port = port; }

    public record Request(String targetType, String targetId, String message, String reporterEmail, String requestId) {}

    public Mono<Flag> create(Request r) {
        return Mono.fromCallable(() -> {
            String type = Validate.oneOf(r.targetType(), TARGET_TYPES, "targetType");
            String target = Validate.text(r.targetId(), 1, TARGET_ID_MAX, "targetId");
            String message = Validate.text(r.message(), MESSAGE_MIN, MESSAGE_MAX, "message");
            String email = Validate.email(r.reporterEmail(), "reporterEmail");
            UUID rid = requestId(r.requestId());
            return new Object[]{type, target, message, email, rid};
        }).flatMap(v -> port.create((String) v[0], (String) v[1], (String) v[2], (String) v[3], (UUID) v[4]));
    }

    /** All parameters arrive as text so every malformed value is a 400 on its own field. */
    public Mono<FlagPage> list(String status, String targetType, String targetId, String excludeTargetId, String page,
                               String size) {
        return Mono.fromCallable(() -> new Object[]{
                Validate.oneOf(status == null ? "open" : status, STATUSES, "status"),
                targetTypes(targetType),
                targetId == null ? null : Validate.text(targetId, 1, TARGET_ID_MAX, "targetId"),
                excludeTargetId == null ? null : Validate.text(excludeTargetId, 1, TARGET_ID_MAX, "excludeTargetId"),
                number(page, 0, 0, PAGE_MAX, "page"),
                number(size, PAGE_SIZE_MAX, 1, PAGE_SIZE_MAX, "size")})
            .flatMap(v -> {
                @SuppressWarnings("unchecked") List<String> types = (List<String>) v[1];
                return port.list((String) v[0], types, (String) v[2], (String) v[3], (Integer) v[4], (Integer) v[5]);
            });
    }

    public Mono<Flag> resolve(long id, String resolvedBy, String requestId) {
        return Mono.fromCallable(() -> new Object[]{Validate.email(resolvedBy, "resolvedBy"), requestId(requestId)})
            .flatMap(v -> port.resolve(id, (String) v[0], (UUID) v[1]));
    }

    private static List<String> targetTypes(String value) {
        if (value == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String t : value.split(",", -1)) out.add(Validate.oneOf(t, TARGET_TYPES, "targetType"));
        return List.copyOf(out);
    }

    private static int number(String value, int fallback, int min, int max, String field) {
        if (value == null) return fallback;
        if (!DIGITS.matcher(value).matches()) throw new InvalidQueryException(field, field + " must be a whole number");
        int n = Integer.parseInt(value);
        if (n < min || n > max) throw new InvalidQueryException(field, field + " must be " + min + "-" + max);
        return n;
    }

    /** The web's request id (spec §5.15); a fresh one when the caller sent none. */
    private static UUID requestId(String value) {
        if (value == null) return UUID.randomUUID();
        if (!UUID_TEXT.matcher(value).matches()) throw new InvalidQueryException("requestId", "requestId must be a UUID");
        return UUID.fromString(value);
    }
}
