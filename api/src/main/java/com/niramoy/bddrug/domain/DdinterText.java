package com.niramoy.bddrug.domain;

import java.util.Locale;
import java.util.Set;

/**
 * DDInter free text (interaction, management, disease text, food description/management). DDInter prints "None"
 * (or "-", or nothing) where it has no text; served as-is, "None" next to an alert can read as "no interaction".
 * The ETL stores such values as NULL; this is the API's defence in depth for rows stored before that rule.
 */
public final class DdinterText {
    private DdinterText() {}

    /** The same list as the ETL's {@code clean_text}, compared after strip(), case-insensitive. */
    static final Set<String> PLACEHOLDERS = Set.of("none", "null", "n/a", "na", "-", "--", "");

    /** The text, stripped; null when it is null, blank or a placeholder. */
    public static String clean(String value) {
        if (value == null) return null;
        String text = value.strip();
        return PLACEHOLDERS.contains(text.toLowerCase(Locale.ROOT)) ? null : text;
    }
}
