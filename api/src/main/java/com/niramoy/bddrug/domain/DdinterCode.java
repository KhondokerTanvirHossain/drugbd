package com.niramoy.bddrug.domain;
import java.util.Comparator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** One of a substance's DDInter entries: the DDInter id and the route it covers. */
public record DdinterCode(String code, String routeScope) {
    private static final Pattern DIGITS = Pattern.compile("\\d+");

    /** DDInter20 before DDInter100: numeric part first, then the full id. */
    public static final Comparator<String> ID_ORDER = Comparator
        .comparingLong(DdinterCode::numericPart).thenComparing(Comparator.naturalOrder());

    static long numericPart(String id) {
        Matcher m = DIGITS.matcher(id);
        if (!m.find()) return 0;
        String digits = m.group();
        return digits.length() > 18 ? Long.MAX_VALUE : Long.parseLong(digits);
    }
}
