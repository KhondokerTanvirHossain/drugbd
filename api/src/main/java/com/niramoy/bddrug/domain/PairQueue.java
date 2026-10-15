package com.niramoy.bddrug.domain;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Spec §5.17.1, pure: which pairs a filter shows, the counts per filter (they follow the scope, not the severity), and the
 * order: severity rank (Major, Moderate, Minor, unknown), applying before non-applying, state (changed, issue, not
 * reviewed, reviewed), then substance A's name, then substance B's name.
 */
public final class PairQueue {
    private PairQueue() {}

    public static final List<String> SHOWS = List.of("todo", "changed", "issue", "reviewed", "all");
    public static final List<String> SCOPES = List.of("all", "applies");
    public static final List<String> SEVERITIES = List.of("major", "moderate", "minor", "unknown");
    private static final List<String> STATE_ORDER = List.of("changed", "issue", "not_reviewed", "reviewed");

    public record Entry(String ddinterA, String ddinterB, String severity, String bdsA, String nameA, String bdsB, String nameB,
                        boolean applies, String state) {
        public String key() { return ddinterA + "|" + ddinterB; }
    }

    /** Any value other than major, moderate or minor is unknown (never merged with Minor). */
    public static String severityOf(String severity) {
        return "major".equals(severity) || "moderate".equals(severity) || "minor".equals(severity) ? severity : "unknown";
    }

    public static boolean inShow(String show, String state) {
        return switch (show) {
            case "todo" -> "not_reviewed".equals(state) || "changed".equals(state);
            case "all" -> true;
            default -> show.equals(state);
        };
    }

    public static boolean inScope(String scope, Entry e) { return !"applies".equals(scope) || e.applies(); }

    public static final Comparator<Entry> ORDER = Comparator
        .comparingInt((Entry e) -> SEVERITIES.indexOf(severityOf(e.severity())))
        .thenComparing(e -> !e.applies())
        .thenComparingInt(e -> STATE_ORDER.indexOf(e.state()))
        .thenComparing(e -> e.nameA().toLowerCase(Locale.ROOT))
        .thenComparing(e -> e.nameB().toLowerCase(Locale.ROOT))
        .thenComparing(Entry::ddinterA).thenComparing(Entry::ddinterB);

    public static Map<String, Integer> counts(List<Entry> entries, String scope) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (String show : SHOWS)
            out.put(show, (int) entries.stream().filter(e -> inScope(scope, e) && inShow(show, e.state())).count());
        return out;
    }

    public static List<Entry> select(List<Entry> entries, String show, String scope, String severity) {
        return entries.stream().filter(e -> inScope(scope, e)).filter(e -> inShow(show, e.state()))
            .filter(e -> severity == null || severityOf(e.severity()).equals(severity)).sorted(ORDER).toList();
    }
}
