package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * §7.4 P9: a page of a public substance's DDInter pairs, every entry's counts, and each pair's public review state and
 * DDInter link. Under public scope, partnerBdsId is null when the partner substance is not public (its DDInter name stays:
 * it is DDInter's), and then pairReview is not_reviewed with no date: a pair review is served only for pairs between
 * public products (§7.4).
 */
public record SubstanceInteractions(String bdsId, List<Substance.Entry> counts, int total, int page, int size, List<Item> items,
                                   String review) {
    /** partnerReview (§7.4.1): the partner substance's carried label, null when partnerBdsId is null. */
    public record Item(String partnerName, String partnerBdsId, String ddinterA, String ddinterB, String routeScope, String severity,
                       List<String> actions, String interaction, String management, PairReviewRule.PublicReview pairReview,
                       String sourceUrl, String partnerReview) {
        public Item {
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }
}
