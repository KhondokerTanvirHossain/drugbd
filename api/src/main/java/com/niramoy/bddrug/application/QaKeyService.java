package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.QaKeyPort;
import com.niramoy.bddrug.domain.QaKeyRule;
import com.niramoy.bddrug.domain.QaKeys;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Self-service QA keys (spec §7.10.3): validation (400 INVALID_QUERY with the field) and the QaKeyRule rules; the port writes
 * each key and its audit row in one transaction. The API never sees a key, only its SHA-256 hash, and holds no role list of
 * its own: the web re-reads the owner's role from REVIEWERS (§7.10.4). Nothing here logs a body: it holds an email and a hash.
 */
@Service
public class QaKeyService {
    private static final Pattern HASH = Pattern.compile("^[0-9a-f]{64}$");
    private static final Pattern ID = Pattern.compile("^[1-9][0-9]{0,17}$");
    private static final Pattern UUID_TEXT =
        Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    public static final String VIEWER_HEADER = "X-Viewer-Email";

    private final QaKeyPort port;
    public QaKeyService(QaKeyPort port) { this.port = port; }

    public record CreateRequest(String ownerEmail, String ownerRole, String name, String keyHash, String requestId) {}
    public record RevokeRequest(String ownerEmail, String ownerRole, String requestId) {}
    public record VerifyRequest(String keyHash) {}

    public Mono<QaKeys.Key> create(CreateRequest r) {
        return Mono.fromCallable(() -> new Object[]{owner(r.ownerEmail(), "ownerEmail"), role(r.ownerRole()), name(r.name()),
                hash(r.keyHash()), requestId(r.requestId())})
            .flatMap(v -> port.create((String) v[0], (String) v[1], (String) v[2], (String) v[3], (UUID) v[4],
                QaKeyRule.ACTIVE_MAX, QaKeyRule.DAILY_MAX))
            .map(QaKeys.Key::of);
    }

    public Mono<QaKeys.Key> revoke(String id, RevokeRequest r) {
        return Mono.fromCallable(() -> new Object[]{id(id), owner(r == null ? null : r.ownerEmail(), "ownerEmail"),
                role(r == null ? null : r.ownerRole()), requestId(r == null ? null : r.requestId())})
            .flatMap(v -> port.revoke((Long) v[0], (String) v[1], (String) v[2], (UUID) v[3]))
            .map(QaKeys.Key::of);
    }

    public Mono<QaKeys.Page> list(String viewerEmail) {
        return Mono.fromCallable(() -> owner(viewerEmail, VIEWER_HEADER))
            .flatMap(email -> port.list(email, QaKeyRule.LIST_MAX))
            .map(rows -> new QaKeys.Page(rows.stream().map(QaKeys.Key::of).toList()));
    }

    /** One answer for an unknown, revoked and expired key: 404 field=keyHash (§7.10.3). */
    public Mono<QaKeys.Verified> verify(VerifyRequest r) {
        return Mono.fromCallable(() -> hash(r == null ? null : r.keyHash()))
            .flatMap(port::verify)
            .switchIfEmpty(Mono.error(() -> new NotFoundException("keyHash", "QA key not found")));
    }

    /** Completes for any existing key (touched or not); 404 field=id only for an id that does not exist. */
    public Mono<Void> touch(String id) {
        return Mono.fromCallable(() -> id(id))
            .flatMap(port::touch)
            .flatMap(found -> found ? Mono.<Void>empty() : Mono.error(new NotFoundException("id", "QA key not found")));
    }

    /** Validate.email, then lower-cased (the database stores and compares lower(owner_email)); 3–320 characters, no control. */
    static String owner(String value, String field) {
        String email = Validate.email(value, field).toLowerCase(Locale.ROOT);
        if (email.length() < 3 || !Validate.isEmail(email) || Validate.hasControl(email))
            throw new InvalidQueryException(field, field + " must be an email address");
        return email;
    }

    static String role(String value) {
        if (!QaKeyRule.mayOwn(value))
            throw new InvalidQueryException("ownerRole", "ownerRole must be one of engineer, qa, senior");
        return value;
    }

    static String name(String value) {
        String name = QaKeyRule.name(value);
        if (name == null)
            throw new InvalidQueryException("name", "name must be 1-" + QaKeyRule.NAME_MAX + " characters with no control characters");
        return name;
    }

    static String hash(String value) {
        if (value == null || !HASH.matcher(value).matches())
            throw new InvalidQueryException("keyHash", "keyHash must be 64 lower-case hex characters");
        return value;
    }

    static long id(String value) {
        if (value == null || !ID.matcher(value).matches()) throw new InvalidQueryException("id", "id must be a positive whole number");
        return Long.parseLong(value);
    }

    static UUID requestId(String value) {
        if (value == null || !UUID_TEXT.matcher(value).matches()) throw new InvalidQueryException("requestId", "requestId must be a UUID");
        return UUID.fromString(value);
    }
}
