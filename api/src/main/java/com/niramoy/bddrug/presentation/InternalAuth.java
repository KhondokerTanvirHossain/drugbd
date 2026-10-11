package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.domain.Scope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * The internal token shared with the web server (env {@code INTERNAL_API_TOKEN}). Writes and {@code scope=all}
 * reads need the {@value #HEADER} header to match it; a header that is present must match even on public reads.
 * The API refuses to start when the token is unset or shorter than {@value #MIN_LENGTH} characters.
 * Neither the token nor a submitted header value is ever logged or echoed.
 */
@Component
public class InternalAuth {
    public static final String HEADER = "X-Internal-Token";
    public static final int MIN_LENGTH = 32;

    private final byte[] expected;

    public InternalAuth(@Value("${bddrug.internal-api-token:}") String token) {
        if (token == null || token.length() < MIN_LENGTH)
            throw new IllegalStateException("INTERNAL_API_TOKEN must be set to at least " + MIN_LENGTH +
                                            " characters; refusing to start");
        this.expected = sha256(token);
    }

    /** Constant-time: both sides are hashed to fixed-length digests, then compared with MessageDigest.isEqual. */
    boolean matches(String provided) {
        return provided != null && MessageDigest.isEqual(expected, sha256(provided));
    }

    /** Throws UnauthorizedException (401) unless the header carries the token. */
    public void require(String header) {
        if (!matches(header)) throw new UnauthorizedException();
    }

    /** True when the header carries the token, false when there is no header; a wrong header is a 401. */
    public boolean present(String header) {
        if (header == null) return false;
        require(header);
        return true;
    }

    /** {@code public} (the default) or {@code all}; {@code all} needs the token. */
    public Scope scope(String scope, String header) {
        boolean internal = present(header);
        if (scope == null || scope.equals("public")) return Scope.PUBLIC;
        if (!scope.equals("all")) throw new InvalidQueryException("scope", "scope must be public or all");
        if (!internal) throw new UnauthorizedException();
        return Scope.ALL;
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
