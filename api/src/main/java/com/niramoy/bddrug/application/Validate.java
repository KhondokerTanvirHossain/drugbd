package com.niramoy.bddrug.application;
import java.util.Set;

/** Input checks for write requests. Messages never echo the submitted value (it may be an email). */
final class Validate {
    private Validate() {}
    static final int MAX_EMAIL = 320;

    /** Length in characters (code points), as Postgres counts it, so Bengali text is measured the same way. */
    static int length(String s) { return s.codePointCount(0, s.length()); }

    static String stripped(String s) { return s == null ? "" : s.strip(); }

    static String oneOf(String value, Set<String> allowed, String field) {
        if (value == null || !allowed.contains(value))
            throw new InvalidQueryException(field, field + " must be one of " + String.join(", ", allowed.stream().sorted().toList()));
        return value;
    }

    static String text(String value, int min, int max, String field) {
        String s = stripped(value);
        int n = length(s);
        if (n < min || n > max) throw new InvalidQueryException(field, field + " must be " + min + "-" + max + " characters");
        return s;
    }

    /** The one email predicate: what {@code email} accepts is exactly what an audit row may record. */
    static boolean isEmail(String stripped) {
        return !stripped.isEmpty() && stripped.contains("@") && stripped.length() <= MAX_EMAIL;
    }

    static String email(String value, String field) {
        String s = stripped(value);
        if (!isEmail(s)) throw new InvalidQueryException(field, field + " must be an email address");
        return s;
    }
}
