package com.niramoy.bddrug.domain;

/** §7.4 P16 row. matched: the synonym or substance name the row was found by, and the substance it names; null for trade name or DAR. */
public record SuggestRow(String conceptId, String tradeName, String dosageForm, String status, String clinicalDisplayName, Matched matched) {
    public record Matched(String name, String substance) {}
}
