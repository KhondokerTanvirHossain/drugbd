package com.niramoy.bddrug.domain;
import java.util.List;

public record Substance(String bdsId, String preferredName, List<SubstanceName> names, List<SubstanceCode> codes,
                        Coverage coverage, List<ProductRef> products, List<Interaction> interactions,
                        List<Disease> diseases, List<Food> foods) {

    /** Served when the DDInter stage has not written a coverage row: still "no data", never "no interactions". */
    public static final String NOT_LOADED_NOTE = "DDInter mapping has not run for this substance";

    public record Coverage(String coverage, String note) {}
    public record ProductRef(String conceptId, String tradeName, String company, String reviewStatus) {}
    /** routeScope is the route of this substance's DDInter entry the pair belongs to. */
    public record Interaction(String partnerName, String partnerBdsId, String severity, List<String> actions,
                              String interactionId, String routeScope) {}
    public record Disease(String diseaseName, String severity, String text, List<String> refs,
                          String interactionId, String routeScope) {}
    public record Food(String food, String severity, String mechanism, String description, String management,
                       List<String> refs, String interactionId, String routeScope) {}
}
