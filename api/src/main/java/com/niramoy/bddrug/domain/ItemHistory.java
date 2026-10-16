package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A record's history (spec §5.6.5) and its reopen reason (§5.11, §7.3), from snapshots and decisions.
 * Every stage of one ETL invocation stamps the item with the same run_id, so the snapshots of a run collapse into one
 * {@code extract} entry at the run's last stamp. Its reason: {@code run} when the group holds the item's first snapshot,
 * {@code shared_change} when every snapshot in it is shared_change, {@code rerun} otherwise.
 */
public final class ItemHistory {
    private ItemHistory() {}

    /** {@code carriedFrom}: the batch whose approval the stamp carried (payload carried_from, §8.3.1 item 8), or null. */
    public record Snapshot(Instant extractedAt, UUID runId, String reason, String carriedFrom) {
        public Snapshot(Instant extractedAt, UUID runId, String reason) { this(extractedAt, runId, reason, null); }
    }
    /** {@code mine} is decided by the caller (the decision's email equals the viewer's, case-insensitively). */
    public record Decision(long id, String decision, String note, String role, Instant decidedAt, boolean mine) {}
    /**
     * {@code uncountedBy} says why {@code counts} is false: "rerun" (at or before the run stamp) or "dismiss" (after the
     * stamp, at or before the latest dismissal since it, §5.6.5). {@code carriedFrom} is set on an extract entry.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Entry(String kind, Instant at, String reason, String role, String decision, String note, Boolean counts,
                        Boolean mine, String uncountedBy, String carriedFrom) {
        public Entry(String kind, Instant at, String reason, String role, String decision, String note, Boolean counts, Boolean mine) {
            this(kind, at, reason, role, decision, note, counts, mine, null, null);
        }
    }
    public record Reopen(String reason, Instant at, Instant previousExtractedAt, boolean diffAvailable) {}
    public record Result(List<Entry> history, Reopen reopen) {}

    private record Group(Instant at, String reason, String carriedFrom) {}
    private static final Comparator<Decision> CHRONOLOGICAL = Comparator.comparing(Decision::decidedAt).thenComparingLong(Decision::id);

    private static final Map<String, Integer> KIND_ORDER = Map.of("run", 0, "extract", 1, "decision", 2);

    public static Result build(List<Instant> fullRuns, List<Snapshot> snapshots, List<Decision> decisions, Instant extractedAt) {
        List<Group> groups = groups(snapshots, extractedAt);
        List<Entry> out = new ArrayList<>();
        for (Instant at : fullRuns) out.add(new Entry("run", at, null, null, null, null, null, null));
        for (Group g : groups) out.add(new Entry("extract", g.at(), g.reason(), null, null, null, null, null, null, g.carriedFrom()));
        Decision boundary = decisions.stream()
            .filter(d -> "dismiss".equals(d.decision()) && (extractedAt == null || d.decidedAt().isAfter(extractedAt)))
            .max(CHRONOLOGICAL).orElse(null);
        for (Decision d : decisions) {
            boolean afterStamp = extractedAt == null || d.decidedAt().isAfter(extractedAt);
            boolean beforeBoundary = boundary != null && d.id() != boundary.id() && CHRONOLOGICAL.compare(d, boundary) < 0;
            boolean counts = afterStamp && !beforeBoundary;
            String uncountedBy = !afterStamp ? "rerun" : beforeBoundary ? "dismiss" : null;
            out.add(new Entry("decision", d.decidedAt(), null, d.role(), d.decision(), d.note(), counts, d.mine(), uncountedBy, null));
        }
        out.sort(Comparator.comparing(Entry::at).thenComparing(e -> KIND_ORDER.get(e.kind())));
        Reopen reopen = null;
        if (groups.size() >= 2) {
            Group current = groups.get(groups.size() - 1), previous = groups.get(groups.size() - 2);
            boolean currentHasSnapshot = snapshots.stream().anyMatch(s -> s.extractedAt().equals(extractedAt));
            reopen = new Reopen("shared_change".equals(current.reason()) ? "shared_change" : "rerun",
                extractedAt == null ? current.at() : extractedAt, previous.at(), currentHasSnapshot);
        }
        return new Result(List.copyOf(out), reopen);
    }

    private static List<Group> groups(List<Snapshot> snapshots, Instant extractedAt) {
        if (snapshots.isEmpty()) return extractedAt == null ? List.of() : List.of(new Group(extractedAt, "run", null));
        Instant first = snapshots.stream().map(Snapshot::extractedAt).min(Comparator.naturalOrder()).orElseThrow();
        Map<UUID, List<Snapshot>> byRun = new LinkedHashMap<>();
        for (Snapshot s : snapshots) byRun.computeIfAbsent(s.runId(), k -> new ArrayList<>()).add(s);
        List<Group> out = new ArrayList<>();
        for (List<Snapshot> run : byRun.values()) {
            Instant last = run.stream().map(Snapshot::extractedAt).max(Comparator.naturalOrder()).orElseThrow();
            String reason = run.stream().anyMatch(s -> s.extractedAt().equals(first)) ? "run"
                : run.stream().allMatch(s -> "shared_change".equals(s.reason())) ? "shared_change" : "rerun";
            String carried = run.stream().map(Snapshot::carriedFrom).filter(java.util.Objects::nonNull).findFirst().orElse(null);
            out.add(new Group(last, reason, carried));
        }
        out.sort(Comparator.comparing(Group::at));
        return out;
    }
}
