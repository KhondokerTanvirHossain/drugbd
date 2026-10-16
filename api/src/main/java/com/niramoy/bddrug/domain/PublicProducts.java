package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.*;

/**
 * Assembles the public product detail (§7.4) from facts the adapter reads. Pure. The one rule it adds: a DDInter
 * "text not found" pair is named only when both its entries are carried by public products, and the raw text_missing
 * notes are dropped, because the pipeline wrote them against every product of the batch, approved or not (§7.4
 * visibility rule; Review Focus 1).
 */
public final class PublicProducts {
    private PublicProducts() {}

    public static final String SOURCE = "DGDA register";
    public static final List<String> STAGES = List.of("dgda", "substances", "clinical", "ddinter");

    /** textMissing: evidence.text_missing as [a, b] pairs (the ddinter stage only). */
    public record StageRow(String stage, String status, String note, List<String[]> textMissing) {}

    /**
     * pairSeverity is keyed "a|b" with a < b as stored; publicEntryIds holds every DDInter id chosen-or-not of a substance
     * that a public product carries; summaries follow the DGDA ingredient rows.
     */
    public record Facts(String batchId, Instant extractedAt, Instant approvedAt, Instant oclFetchedAt, List<StageRow> stages,
                        Map<String, String> entryNames, Map<String, String> pairSeverity, Set<String> publicEntryIds,
                        int otherBrandsCount, List<IngredientSummary> summaries) {}

    public static PublicProduct assemble(Product p, Facts f) {
        return new PublicProduct(p.conceptId(), p.darNumber(), p.tradeName(), p.company(), p.dosageForm(), p.genericContentRaw(),
            p.qualityFlag(), p.ingredients(), p.parseStatus(), p.parseNote(), clinical(p.clinicalDrug(), f.summaries()),
            new PublicProduct.Verification("approved", "pharmacist", f.approvedAt()),
            new PublicProduct.Provenance(f.batchId(), f.extractedAt(), SOURCE, SourceLinks.brand(p.conceptId(), f.oclFetchedAt()),
                stages(f)),
            f.otherBrandsCount());
    }

    /**
     * The verification line's date (§6.5, spec gap 10): the newest ok by a pharmacist or senior pharmacist among the latest
     * item's counted decisions: those after the item's run stamp and after the latest dismissal since it (§5.2, D57, the
     * boundary ApprovalRule applies). When none counts, the record is public through an approval carried to this stamp
     * (§8.3.1 item 8), so the stamp dates it. Pass only the latest item's decisions: other batches' items never date it.
     */
    public static Instant approvedAt(List<ReviewDecision> latestItemDecisions, Instant extractedAt) {
        List<ReviewDecision> since = latestItemDecisions.stream()
            .filter(d -> extractedAt == null || d.decidedAt().isAfter(extractedAt))
            .sorted(Comparator.comparing(ReviewDecision::decidedAt).thenComparingLong(ReviewDecision::id)).toList();
        int start = 0;
        for (int i = 0; i < since.size(); i++) if (ApprovalRule.DISMISS.equals(since.get(i).decision())) start = i + 1;
        Instant at = null;
        for (ReviewDecision d : since.subList(start, since.size()))
            if (ApprovalRule.OK.equals(d.decision()) && ApprovalRule.actsAsPharmacist(d.reviewerRole())) at = d.decidedAt();
        return at != null ? at : extractedAt;
    }

    private static PublicProduct.Clinical clinical(ClinicalDrug cd, List<IngredientSummary> summaries) {
        if (cd == null) return null;
        Map<String, IngredientSummary> byBds = new HashMap<>();
        for (IngredientSummary s : summaries) if (s.bdsId() != null) byBds.putIfAbsent(s.bdsId(), s);
        return new PublicProduct.Clinical(cd.bdcId(), cd.displayName(), cd.doseForm(), cd.route(), cd.ingredients().stream()
            .map(i -> new PublicProduct.ClinicalItem(i.bdsId(), i.name(), i.strengthValue(), i.strengthUnit(), i.perValue(),
                i.perUnit(), i.ddinter(), byBds.get(i.bdsId())))
            .toList());
    }

    private static List<PublicProduct.Stage> stages(Facts f) {
        List<PublicProduct.Stage> out = new ArrayList<>();
        for (String stage : STAGES)
            for (StageRow s : f.stages()) {
                if (!stage.equals(s.stage())) continue;
                List<StageNotes.Note> notes = StageNotes.parse(s.stage(), s.status(), s.note()).stream()
                    .filter(n -> !StageNotes.TEXT_MISSING.equals(n.kind())).toList();
                List<PublicProduct.TextMissing> missing = new ArrayList<>();
                for (String[] m : s.textMissing()) {
                    if (!f.publicEntryIds().contains(m[0]) || !f.publicEntryIds().contains(m[1])) continue;
                    String a = m[0].compareTo(m[1]) < 0 ? m[0] : m[1], b = a.equals(m[0]) ? m[1] : m[0];
                    missing.add(new PublicProduct.TextMissing(m[0], f.entryNames().getOrDefault(m[0], m[0]), m[1],
                        f.entryNames().getOrDefault(m[1], m[1]), f.pairSeverity().get(a + "|" + b)));
                }
                out.add(new PublicProduct.Stage(s.stage(), s.status(), List.copyOf(notes), List.copyOf(missing)));
            }
        return List.copyOf(out);
    }
}
