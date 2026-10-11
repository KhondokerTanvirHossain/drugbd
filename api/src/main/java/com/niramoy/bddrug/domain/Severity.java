package com.niramoy.bddrug.domain;
import java.util.List;

/** DDInter severities, most severe first; anything else ranks with 'unknown'. */
public final class Severity {
    private Severity() {}
    public static final List<String> ORDER = List.of("major", "moderate", "minor", "unknown");

    public static int rank(String severity) {
        int i = ORDER.indexOf(severity);
        return i < 0 ? ORDER.size() - 1 : i;
    }
}
