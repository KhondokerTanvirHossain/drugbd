package com.niramoy.bddrug.domain;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The pipeline's stage note, split and classified for the web (spec §7.3 "Stage notes", D13). Only a DDInter note whose
 * stage status is {@code warn} is split on "; "; every other note, including every fail note, is one part. Each part is
 * matched against the whole-string patterns below; anything else is {@code other} and is shown verbatim.
 */
public final class StageNotes {
    private StageNotes() {}

    public static final String TEXT_MISSING = "text_missing", NAME_ONLY = "name_only", NO_DATA = "no_data",
        ROUTE_ASSUMED = "route_assumed", NO_ROUTE_ENTRY = "no_route_entry", OTHER = "other";

    /** {@code ddinterId} for name_only and route_assumed; {@code route} for route_assumed and no_route_entry (null = unknown). */
    public record Note(String kind, String text, String ddinterId, String route) {}

    private static final Pattern TEXT = Pattern.compile("^DDInter text not found for (DDInter\\d+)/(DDInter\\d+)$");
    private static final Pattern NAME = Pattern.compile("^DDInter (DDInter\\d+) matched by name only$");
    private static final Pattern NODATA = Pattern.compile("^No interaction data in DDInter for this substance$");
    private static final Pattern ASSUMED_UNKNOWN =
        Pattern.compile("^DDInter route assumed: (DDInter\\d+) \\((\\w+)\\) used for unknown route$");
    private static final Pattern ASSUMED = Pattern.compile("^DDInter route assumed: (DDInter\\d+) \\((\\w+)\\) used for (\\w+)$");
    private static final Pattern NO_ROUTE_UNKNOWN = Pattern.compile("^No DDInter entry for unknown route$");
    private static final Pattern NO_ROUTE = Pattern.compile("^No DDInter entry for route (\\w+)$");

    public static List<Note> parse(String stage, String status, String note) {
        if (note == null || note.isBlank()) return List.of();
        String[] parts = "ddinter".equals(stage) && "warn".equals(status) ? note.split("; ") : new String[]{note};
        List<Note> out = new ArrayList<>();
        for (String p : parts) if (!p.isBlank()) out.add(classify(p));
        return List.copyOf(out);
    }

    static Note classify(String text) {
        Matcher m;
        if (TEXT.matcher(text).matches()) return new Note(TEXT_MISSING, text, null, null);
        if ((m = NAME.matcher(text)).matches()) return new Note(NAME_ONLY, text, m.group(1), null);
        if (NODATA.matcher(text).matches()) return new Note(NO_DATA, text, null, null);
        if ((m = ASSUMED_UNKNOWN.matcher(text)).matches()) return new Note(ROUTE_ASSUMED, text, m.group(1), null);
        if ((m = ASSUMED.matcher(text)).matches()) return new Note(ROUTE_ASSUMED, text, m.group(1), m.group(3));
        if (NO_ROUTE_UNKNOWN.matcher(text).matches()) return new Note(NO_ROUTE_ENTRY, text, null, null);
        if ((m = NO_ROUTE.matcher(text)).matches()) return new Note(NO_ROUTE_ENTRY, text, null, m.group(1));
        return new Note(OTHER, text, null, null);
    }
}
