package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * Spec §5.17 "Pair review state": the one pure function that maps a pair's decisions (ops.pair_review) and its current
 * content hash to its state. Every reviewer and public endpoint uses it. The latest decision L (by time, then id):
 * none → not_reviewed; L reviewed with an equal hash → reviewed; L reviewed with another hash → changed (DDInter changed
 * the severity, actions or text after the review, PO D5); L issue → issue, whatever changed since. The public form is
 * coarse (D53): reviewed only when reviewed; changed, issue and not_reviewed are all not_reviewed, with no date.
 */
public final class PairReviewRule {
    private PairReviewRule() {}

    public static final String NOT_REVIEWED = "not_reviewed", REVIEWED = "reviewed", CHANGED = "changed", ISSUE = "issue";

    /** One ops.pair_review row; {@code mine} is decided by the caller (the reviewer email equals the viewer's). */
    public record Decision(long id, String decision, String note, String contentHash, PairContent.Content content,
                           Instant decidedAt, boolean mine) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Review(String state, Instant at, boolean mine, String note) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PublicReview(String state, Instant reviewedAt) {}
    public record Change(String field, String atReview, String now) {}
    public record HistoryEntry(String decision, Instant at, String note, boolean mine, boolean changedAfter) {}

    private static final Comparator<Decision> ORDER = Comparator.comparing(Decision::decidedAt).thenComparingLong(Decision::id);

    private static Decision latest(List<Decision> decisions) {
        return decisions.stream().max(ORDER).orElse(null);
    }

    public static Review review(List<Decision> decisions, String currentHash) {
        Decision l = latest(decisions);
        if (l == null) return new Review(NOT_REVIEWED, null, false, null);
        if (ISSUE.equals(l.decision())) return new Review(ISSUE, l.decidedAt(), l.mine(), l.note());
        return new Review(l.contentHash().equals(currentHash) ? REVIEWED : CHANGED, l.decidedAt(), l.mine(), null);
    }

    public static PublicReview publicReview(List<Decision> decisions, String currentHash) {
        Review r = review(decisions, currentHash);
        return REVIEWED.equals(r.state()) ? new PublicReview(REVIEWED, r.at()) : new PublicReview(NOT_REVIEWED, null);
    }

    /** "What changed in DDInter" (§5.17.2 item 6): the fields that differ between L's stored content and now. */
    public static List<Change> changes(List<Decision> decisions, PairContent.Content now, String currentHash) {
        Decision l = latest(decisions);
        if (l == null || !CHANGED.equals(review(decisions, currentHash).state()) || l.content() == null) return List.of();
        PairContent.Content then = l.content();
        List<Change> out = new ArrayList<>();
        if (!Objects.equals(then.severity(), now.severity())) out.add(new Change("Severity", then.severity(), now.severity()));
        if (!then.actions().equals(now.actions()))
            out.add(new Change("Actions", String.join(", ", then.actions()), String.join(", ", now.actions())));
        if (!Objects.equals(then.interaction(), now.interaction()))
            out.add(new Change("Interaction text", then.interaction(), now.interaction()));
        if (!Objects.equals(then.management(), now.management()))
            out.add(new Change("Management text", then.management(), now.management()));
        return List.copyOf(out);
    }

    /** "Pair history", oldest first; {@code changedAfter} when the pair's content differs from what that decision saw. */
    public static List<HistoryEntry> history(List<Decision> decisions, String currentHash) {
        return decisions.stream().sorted(ORDER).map(d -> new HistoryEntry(d.decision(), d.decidedAt(),
            ISSUE.equals(d.decision()) ? d.note() : null, d.mine(), REVIEWED.equals(d.decision()) && !d.contentHash().equals(currentHash)))
            .toList();
    }

    /** The newest pair_review id (the version's lastPairReviewId), or null. */
    public static Long lastId(List<Decision> decisions) {
        return decisions.stream().map(Decision::id).max(Long::compare).orElse(null);
    }
}
