package com.niramoy.bddrug.domain;
import java.util.List;
import java.util.Map;

/** Response shapes of the senior review endpoints (spec §7.7). None carries an email. */
public final class SeniorViews {
    private SeniorViews() {}

    public record Side(String bdsId, String name) {}
    /** One side's DDInter entry; {@code source} is its DDInter link (§5.17.2 item 2: "Each id carries its DDInter SourceLink"). */
    public record EntryRef(String name, String routeScope, SourceLinks.Source source) {}
    public record Brand(String conceptId, String tradeName, String batchId, String displayStatus, String side) {}
    public record BrandCounts(int a, int b, int batches) {}
    public record PairVersion(String contentHash, Long lastPairReviewId) {}
    public record PairView(String ddinterA, String ddinterB, Side substanceA, Side substanceB, EntryRef entryA, EntryRef entryB,
                           String severity, List<String> actions, String interaction, String management, SourceLinks.Source source,
                           boolean applies, List<Brand> brands, BrandCounts brandCounts, PairReviewRule.Review review,
                           List<PairReviewRule.Change> changes, List<PairReviewRule.HistoryEntry> history, PairVersion version) {}
    public record PairsPage(int total, Map<String, Integer> counts, List<PairView> items) {}

    public record SubstanceRow(String bdsId, String name, int brands, int batches, int pairsToReview, int majorPairsToReview) {}
    public record SubstancesPage(int total, List<SubstanceRow> items) {}

    public record Name(String name, String type, String source) {}
    public record Clinical(String bdcId, String displayName, String route) {}
    public record Chosen(String ddinterId, String routeScope, boolean routeAssumed) {}
    /** {@code reason}: no_data, not_run or no_route when nothing is chosen; null otherwise. */
    public record BrandRow(String conceptId, String tradeName, String batchId, String displayStatus, Clinical clinicalDrug,
                           String strengthText, List<Chosen> chosen, String reason) {}
    public record PairList(int total, List<PairView> items) {}
    public record SubstanceDetail(String bdsId, String name, List<Name> names, List<IngredientSummary.Code> codes, String coverage,
                                  List<IngredientSummary.Entry> entries, List<BrandRow> brands, PairList pairs) {}

    public record PairOutcome(String ddinterA, String ddinterB, PairReviewRule.Review review, PairVersion version, boolean replayed) {}
}
