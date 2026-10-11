package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * What an anonymous visitor gets for a record no pharmacist has approved yet: its name and review status, no data.
 * Never "not found" and never empty data, so "not yet reviewed" is not mistaken for "nothing known".
 */
public sealed interface HiddenRecord {
    record Product(String conceptId, String tradeName, String reviewStatus) implements HiddenRecord {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
    record Substance(String bdsId, String preferredName, String reviewStatus) implements HiddenRecord {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
}
