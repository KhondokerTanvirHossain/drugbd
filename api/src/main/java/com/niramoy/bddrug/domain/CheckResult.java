package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * POST /v1/interactions/check (§7.4 extended CheckResult). Counts follow §6.7.2 rule 5: only substance pairs of two
 * different approved products count; same-product and same-BDS pairs are listed but never counted. noData is kept for
 * compatibility (every approved product substance that cannot be checked).
 */
public record CheckResult(Summary summary, List<CheckedProduct> products, List<Alert> alerts, List<NoInteraction> noInteraction,
                          List<NotChecked> notChecked, List<Duplicate> duplicates, List<NoData> noData, List<NotReviewed> notReviewed) {
    public record Summary(int medicines, int totalPairs, int checkedPairs, int alertPairs, int noInteractionPairs, int notCheckedPairs,
                          int notReviewed, BySeverity bySeverity) {}
    public record BySeverity(int major, int moderate, int minor, int unknown) {}
    /** route: the clinical drug's route, null when the product has none (the checker's route-assumed lines name it). */
    public record CheckedProduct(String conceptId, String tradeName, String route, List<SubstanceCoverage> substances) {}
    /** ddinter: the chosen entries (the Chloramphenicol fix), empty when the substance cannot be checked. */
    public record SubstanceCoverage(String bdsId, String name, String coverage, List<Chosen> ddinter) {}
    public record Chosen(String ddinterId, String name, String routeScope, boolean routeAssumed) {}
    /** routeScope: the side's chosen entry's route; null when it has none. bdsId null: no substance mapping. */
    public record Side(String conceptId, String tradeName, String bdsId, String name, String routeScope) {}
    public record Alert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                        boolean routeAssumed, String ddinterA, String ddinterB, String interactionId, String source,
                        PairReviewRule.PublicReview pairReview) {
        /** A DDInter placeholder ("None", "-", blank) is no text: null, never shown as if it were advice. */
        public Alert {
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }
    /** Checked: both chosen entries have a full stored list, and DDInter lists no interaction between them (§6.7.2). */
    public record NoInteraction(Side a, Side b, String ddinterA, String ddinterB) {}
    /** side "a" or "b": the side the reason applies to; same_product names both ingredients of one product. */
    public record NotChecked(Side a, Side b, String reason, String side) {}
    public record Duplicate(String bdsId, String name, List<String> conceptIds) {}
    public record NoData(String conceptId, String bdsId, String name) {}
    /** A product left out because no pharmacist has approved it (public scope). Never "not found", never dropped. */
    public record NotReviewed(String conceptId, String tradeName) {}
}
