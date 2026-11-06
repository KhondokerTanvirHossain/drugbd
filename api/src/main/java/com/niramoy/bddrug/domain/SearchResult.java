package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * GET /v1/search (§7.4 P1–P4, §7.4.1). products holds ProductHit (visible: approved, and in show mode every other visible
 * product, each with its review label) and StubHit (hidden: trade name and DAR matches only, so search never reveals a
 * hidden composition, D16). counts covers the whole result, not the page.
 */
public record SearchResult(String query, long total, boolean hasMore, Counts counts, List<SubstanceHit> substances,
                           List<Object> products, String suggestion) {
    public record Counts(long substances, long products) {}
    public record KeyCodes(List<String> atc, List<String> rxcui) {}
    public record SubstanceHit(String bdsId, String preferredName, String matchedName, String matchedNameType, List<String> otherNameTypes,
                               String coverage, List<String> ddinterIds, KeyCodes keyCodes, long approvedProductCount,
                               long productCount, String review) {}
    public record ClinicalRef(String bdcId, String displayName) {}
    public record ProductHit(String conceptId, String tradeName, String darNumber, String company, String dosageForm,
                             String genericContentRaw, ClinicalRef clinicalDrug, String matchedOn, String matchedName, String status,
                             String review) {}
    public record StubHit(String conceptId, String tradeName, String status) {
        @JsonProperty("hidden") public boolean hidden() { return true; }
    }
}
