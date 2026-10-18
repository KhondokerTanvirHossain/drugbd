package com.niramoy.bddrug.domain;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;

/**
 * Self-service QA keys (spec §7.10.2, D67): who may own one, the name rule, the per-owner limits, the lifetime and the status.
 * Pure rules: the adapter applies the limits inside the creation transaction, and the status is computed with the database
 * clock (the row's {@code now()}), never the API host's.
 */
public final class QaKeyRule {
    private QaKeyRule() {}

    /** The roles that may use QA tools and own a working key (§7.10.1). Pharmacists and readers may not. */
    public static final Set<String> OWNER_ROLES = Set.of("qa", "engineer", "senior");
    /** At most 5 active keys per owner, and at most 10 created per owner in any rolling 24 hours (revoked ones count). */
    public static final int ACTIVE_MAX = 5, DAILY_MAX = 10;
    /** The owner's list: newest first, at most 50. */
    public static final int LIST_MAX = 50;
    public static final int NAME_MAX = 40;
    /** 90 days, written as hours so no time-zone rule can move it (V9's qa_key_lifetime check). */
    public static final Duration LIFETIME = Duration.ofHours(2160);

    public static boolean mayOwn(String role) {
        return role != null && OWNER_ROLES.contains(role);
    }

    /**
     * The white space JavaScript's {@code String.prototype.trim()} removes (WhiteSpace and LineTerminator), so the web and the
     * API trim a name identically. It includes every space Java's {@code strip()} removes except U+001C–U+001F, which are
     * control characters here and so refuse the name instead.
     */
    static boolean isTrimmed(int c) {
        return c == '\t' || c == '\n' || c == 0x0B || c == '\f' || c == '\r' || c == ' ' || c == 0xA0 || c == 0x1680
            || (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
    }

    /**
     * A control character a name may not hold: C0 (U+0000–U+001F), DEL and C1 (U+007F–U+009F), and the line and paragraph
     * separators U+2028 and U+2029, which PostgreSQL's {@code [[:cntrl:]]} (V9's name check) also counts as control characters
     * in a UTF-8 locale, so the API refuses them as a 400 before the database would.
     */
    static boolean isControl(int c) {
        return c <= 0x1F || (c >= 0x7F && c <= 0x9F) || c == 0x2028 || c == 0x2029;
    }

    /** The name trimmed of white space, or null when it is empty, longer than 40 code points, or holds a control character. */
    public static String name(String raw) {
        if (raw == null) return null;
        int start = 0, end = raw.length();
        while (start < end && isTrimmed(raw.codePointAt(start))) start += Character.charCount(raw.codePointAt(start));
        while (end > start && isTrimmed(raw.codePointBefore(end))) end -= Character.charCount(raw.codePointBefore(end));
        String s = raw.substring(start, end);
        int n = s.codePointCount(0, s.length());
        if (n < 1 || n > NAME_MAX) return null;
        if (s.codePoints().anyMatch(QaKeyRule::isControl)) return null;
        return s;
    }

    /** {@code revoked} when revoked (it wins over expiry); else {@code expired} once {@code expiresAt <= now}; else {@code active}. */
    public static String status(Instant revokedAt, Instant expiresAt, Instant now) {
        if (revokedAt != null) return "revoked";
        if (!expiresAt.isAfter(now)) return "expired";
        return "active";
    }
}
