package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * review (§7.4.1): the label the substance carries from the visible products in {@code products}
 * (PublicReview.carried); each product, clinical drug and pair partner carries its own.
 */
public record Substance(String bdsId, String preferredName, List<SubstanceName> names, List<SubstanceCode> codes,
                        Coverage coverage, List<ProductRef> products, List<Interaction> interactions,
                        List<Disease> diseases, List<Food> foods, List<Entry> entries, List<ClinicalDrugRef> clinicalDrugs,
                        String review) {

    /** Served when the DDInter stage has not written a coverage row: still "no data", never "no interactions". */
    public static final String NOT_LOADED_NOTE = "DDInter mapping has not run for this substance";

    public record Coverage(String coverage, String note) {}
    /** reviewStatus: "ok" when approved, otherwise "pending" (never "issue"); review: the public label, null when hidden. */
    public record ProductRef(String conceptId, String tradeName, String company, String reviewStatus, String review) {}
    /** One DDInter entry of the substance with its severity counts (both sides of every stored pair) and its link (§6.6). */
    public record Entry(String ddinterId, String name, String routeScope, IngredientSummary.Counts counts, int diseaseCount,
                        int foodCount, SourceLinks.Source sourceLink) {}
    /** A clinical drug that contains the substance (visible ones only under public scope), with its carried label. */
    public record ClinicalDrugRef(String bdcId, String displayName, String review) {}
    /**
     * routeScope is the route of this substance's DDInter entry the pair belongs to. partnerReview: the partner substance's
     * carried label (§7.4.1), null when partnerBdsId is null.
     */
    public record Interaction(String partnerName, String partnerBdsId, String severity, List<String> actions,
                              String interactionId, String routeScope, String partnerReview) {}
    /** text is null when DDInter has none (a placeholder such as "None" included). */
    public record Disease(String diseaseName, String severity, String text, List<String> refs,
                          String interactionId, String routeScope) {
        public Disease { text = DdinterText.clean(text); }
    }
    /** description / management are null when DDInter has none (a placeholder such as "None" included). */
    public record Food(String food, String severity, String mechanism, String description, String management,
                       List<String> refs, String interactionId, String routeScope) {
        public Food {
            description = DdinterText.clean(description);
            management = DdinterText.clean(management);
        }
    }
}
