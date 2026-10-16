package com.niramoy.bddrug.domain;
import java.util.*;

/**
 * The coarse public pair review state (§7.4 P1C public rules, D53) of a page of pairs. P1C's PairReviewRule decides it
 * and P1C's PairReviewReader reads ops.pair_review; this helper only keys the pairs, hashes each one's current content
 * with PairContent and maps the decisions. Pure. Never a gate: the pair and its text are served whatever this says (G3).
 */
public final class PublicPairReviews {
    private PublicPairReviews() {}

    public static final PairReviewRule.PublicReview NONE = new PairReviewRule.PublicReview(PairReviewRule.NOT_REVIEWED, null);

    /** A stored DDInter pair (ddinterA < ddinterB, as curated.ddinter_pair and ops.pair_review store it) with its content. */
    public record Pair(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction,
                       String management) {
        public String key() { return ddinterA + "|" + ddinterB; }
        public String hash() {
            return PairContent.hash(ddinterA, ddinterB, new PairContent.Content(severity, actions, interaction, management));
        }
    }

    /** Both entries of every pair: PairReviewReader.forCodes reads each pair whose two entries are in this set. */
    public static Set<String> codes(Collection<Pair> pairs) {
        Set<String> out = new TreeSet<>();
        for (Pair p : pairs) { out.add(p.ddinterA()); out.add(p.ddinterB()); }
        return out;
    }

    /** One public review per distinct pair, in input order; decisions are P1C's, keyed "a|b". */
    public static Map<String, PairReviewRule.PublicReview> of(Collection<Pair> pairs, Map<String, List<PairReviewRule.Decision>> decisions) {
        Map<String, PairReviewRule.PublicReview> out = new LinkedHashMap<>();
        for (Pair p : pairs)
            if (!out.containsKey(p.key()))
                out.put(p.key(), PairReviewRule.publicReview(decisions.getOrDefault(p.key(), List.of()), p.hash()));
        return out;
    }
}
