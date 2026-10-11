package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.*;

/** A batch at a glance: stage outcomes, review progress, what warned or failed, recent runs and the change since the last full run. */
public record BatchReport(String batchId, Map<String, StageCounts> counts, ReviewCounts review, List<ItemNote> warnings,
                          List<ItemNote> fails, List<Run> runs, Map<String, StageCounts> deltaVsPrevious) {

    public static final List<String> STAGE_ORDER = List.of("dgda", "substances", "clinical", "ddinter");

    public record StageCounts(int ok, int warn, int fail) {
        public static final StageCounts ZERO = new StageCounts(0, 0, 0);
        StageCounts minus(StageCounts o) { return new StageCounts(ok - o.ok, warn - o.warn, fail - o.fail); }
    }
    public record ReviewCounts(int pending, int ok, int issue) {}
    public record ItemNote(String conceptId, String stage, String note) {}
    /** conceptIds is empty for a full run. */
    public record Run(long id, Instant runAt, List<String> stages, Map<String, StageCounts> counts, List<String> conceptIds) {}

    /** Pipeline order first (dgda, substances, clinical, ddinter), any other stage after, by name. */
    public static final Comparator<String> BY_STAGE = Comparator
        .comparingInt((String s) -> STAGE_ORDER.contains(s) ? STAGE_ORDER.indexOf(s) : STAGE_ORDER.size())
        .thenComparing(Comparator.naturalOrder());

    public static Map<String, StageCounts> ordered(Map<String, StageCounts> counts) {
        Map<String, StageCounts> out = new LinkedHashMap<>();
        counts.keySet().stream().sorted(BY_STAGE).forEach(k -> out.put(k, counts.get(k)));
        return out;
    }

    /** latest minus previous per stage; a stage missing from one side counts as zero there. */
    public static Map<String, StageCounts> delta(Map<String, StageCounts> latest, Map<String, StageCounts> previous) {
        Set<String> stages = new TreeSet<>(BY_STAGE);
        stages.addAll(latest.keySet());
        stages.addAll(previous.keySet());
        Map<String, StageCounts> out = new LinkedHashMap<>();
        for (String s : stages)
            out.put(s, latest.getOrDefault(s, StageCounts.ZERO).minus(previous.getOrDefault(s, StageCounts.ZERO)));
        return out;
    }
}
