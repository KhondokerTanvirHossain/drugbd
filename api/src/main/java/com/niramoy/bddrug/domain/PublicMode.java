package com.niramoy.bddrug.domain;
import java.util.Locale;

/**
 * Which records the public site shows (spec §7.4.1, D74, PO 06/11/2026): approved records only, or every visible record
 * with its public review label ("show mode"). One server setting owned by the API, PUBLIC_SHOWS_UNREVIEWED, read once at
 * start (PublicModeConfig). Unset or empty is approved-only, the safe default; anything but true or false is refused, so a
 * typo never picks a mode. There is no way to change it at run time.
 */
public enum PublicMode {
    APPROVED_ONLY("approved_only"), SHOW_UNREVIEWED("show_unreviewed");

    public static final String INVALID = "PUBLIC_SHOWS_UNREVIEWED must be true or false";
    private final String wire;
    PublicMode(String wire) { this.wire = wire; }

    /** The name a public read sends (GET /v1/public-mode, /v1/stats publicMode). */
    public String wire() { return wire; }

    public boolean showsUnreviewed() { return this == SHOW_UNREVIEWED; }

    public static PublicMode fromSetting(String value) {
        String v = value == null ? "" : value.strip().toLowerCase(Locale.ROOT);
        return switch (v) {
            case "" , "false" -> APPROVED_ONLY;
            case "true" -> SHOW_UNREVIEWED;
            default -> throw new IllegalStateException(INVALID);
        };
    }
}
