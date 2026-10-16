package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * What a public read gets for a record that is not public (§7.4): never "not found" and never empty data, so "not yet
 * reviewed" is not mistaken for "nothing known". A product stub names its status ("not_reviewed", or "removed" when its
 * latest batch item left the batch file) and the batch it is in; a substance stub its name. The internal review status
 * is never sent, so no public response names "issue".
 */
public sealed interface HiddenRecord {
    String NOT_REVIEWED = "not_reviewed", REMOVED = "removed";

    /** batchId is null only for a product that is in no batch at all. */
    record Product(String conceptId, String tradeName, String status, String batchId) implements HiddenRecord {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
    record Substance(String bdsId, String preferredName) implements HiddenRecord {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
}
