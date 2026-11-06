package com.niramoy.bddrug.domain;
import java.util.Collection;

/**
 * A visible record's public review label (spec §7.4.1, D74), computed in SQL by ReviewSql.label: "approved" (a pharmacist
 * approved it and the approval is current), "problem" (not approved, with an open reviewer issue or a failed check) or
 * "not_reviewed" (any other record that is not approved). It is the only review detail a public read carries. Pure.
 */
public final class PublicReview {
    private PublicReview() {}

    public static final String APPROVED = "approved", NOT_REVIEWED = "not_reviewed", PROBLEM = "problem";

    private static int badness(String label) {
        return PROBLEM.equals(label) ? 2 : NOT_REVIEWED.equals(label) ? 1 : 0;
    }

    /** The worst label of a group (problem over not_reviewed over approved); null for no labels. */
    public static String worst(Collection<String> labels) {
        String out = null;
        for (String l : labels) if (l != null && (out == null || badness(l) > badness(out))) out = l;
        return out;
    }

    /**
     * The label a substance or clinical drug carries from the visible products that carry it (ReviewSql.CARRIED_LABEL):
     * approved when any is approved, otherwise problem when any is problem, otherwise not_reviewed; null for none.
     */
    public static String carried(Collection<String> labels) {
        if (labels.stream().noneMatch(java.util.Objects::nonNull)) return null;
        if (labels.contains(APPROVED)) return APPROVED;
        return labels.contains(PROBLEM) ? PROBLEM : NOT_REVIEWED;
    }

    public static boolean approved(String label) { return APPROVED.equals(label); }
}
