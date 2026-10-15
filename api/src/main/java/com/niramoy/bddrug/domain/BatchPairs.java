package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Spec §5.6.2: the open record's DDInter pairs with the other current records of its batch ({@link #compute}) and with
 * the latest current item of every product held in another batch ({@link #computeFor}), with RouteRule applied on both
 * sides per record route (D14), and the pairs it cannot check (§6.7.2 rules 1–4). Both walk the same per-partner rule
 * ({@link #walk}), so they never disagree. A pair of usable sides with no stored row is "no interaction listed" and is
 * not returned here; only the batch count needs it.
 */
public final class BatchPairs {
    private BatchPairs() {}

    public record Substance(String bdsId, String name, String coverage, List<DdinterCode> codes) {}
    public record Product(String conceptId, String tradeName, int index, String route, List<Substance> substances) {}
    public record PairRow(String ddinterA, String ddinterB, String nameA, String nameB, String severity, List<String> actions,
                          String interaction, String management, String interactionId) {
        public PairRow(String ddinterA, String ddinterB, String nameA, String nameB, String severity, List<String> actions,
                       String interaction, String management) {
            this(ddinterA, ddinterB, nameA, nameB, severity, actions, interaction, management, null);
        }
    }
    public record PartnerRef(String conceptId, String tradeName, int index) {}
    public record Pair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance,
                       String severity, List<String> actions, String interaction, String management, List<PartnerRef> partners,
                       @JsonIgnore String interactionId, SourceLinks.Source source, PairReviewRule.Review pairReview) {
        public Pair with(SourceLinks.Source source, PairReviewRule.Review pairReview) {
            return new Pair(ddinterA, ddinterB, nameA, nameB, substance, partnerSubstance, severity, actions, interaction,
                management, partners, interactionId, source, pairReview);
        }
    }
    public record NotChecked(String substance, String partnerSubstance, List<PartnerRef> partners, String reason, String side,
                             String route) {}
    public record Result(int totalBatchPairs, List<Pair> pairs, List<NotChecked> notChecked) {}

    // ---- §7.3 otherPairs
    public record OtherProduct(String conceptId, String tradeName, String batchId, boolean approved, String route,
                               List<Substance> substances) {}
    public record OtherPartner(String conceptId, String tradeName, String batchId, boolean approved) {}
    public record OtherPair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance,
                            String partnerBdsId, String severity, List<String> actions, String interaction, String management,
                            @JsonIgnore String interactionId, SourceLinks.Source source, PairReviewRule.Review pairReview,
                            List<OtherPartner> partners, int partnerCount) {
        public OtherPair with(SourceLinks.Source source, PairReviewRule.Review pairReview) {
            return new OtherPair(ddinterA, ddinterB, nameA, nameB, substance, partnerSubstance, partnerBdsId, severity, actions,
                interaction, management, interactionId, source, pairReview, partners, partnerCount);
        }
    }
    public record OtherNotChecked(String substance, String partnerSubstance, String partnerBdsId, List<OtherPartner> partners,
                                  int partnerCount, String reason, String side, String route) {}
    public record OtherResult(List<OtherPair> pairs, List<OtherNotChecked> notChecked, int otherBatches) {}

    /** §5.6.2: at most this many partners per pair or line are sent; partnerCount gives the total. */
    public static final int PARTNERS_SHOWN = 5;

    /** When both sides are unusable, the first reason in this list wins (this side on a tie). */
    public static final List<String> REASON_ORDER = List.of("no_data", "unmapped", "not_run", "no_route");
    private static final List<String> SEVERITY_ORDER = List.of("major", "moderate", "minor");

    private record Use(List<String> chosen, String reason) {}

    static Use use(Substance s, String route, Set<String> complete) {
        if (s.bdsId() == null) return new Use(List.of(), "unmapped");
        if ("none".equals(s.coverage())) return new Use(List.of(), "no_data");
        if (!"full".equals(s.coverage())) return new Use(List.of(), "not_run");
        Optional<RouteRule.Choice> choice = RouteRule.choose(s.codes(), route);
        if (choice.isEmpty()) return new Use(List.of(), "no_route");
        List<String> ids = choice.get().codes().stream().map(DdinterCode::code).toList();
        return complete.containsAll(ids) ? new Use(ids, null) : new Use(List.of(), "not_run");
    }

    private static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }
    private static boolean sameSubstance(Substance s, Substance t) { return s.bdsId() != null && s.bdsId().equals(t.bdsId()); }
    private static int severityRank(String s) { int i = SEVERITY_ORDER.indexOf(s); return i < 0 ? SEVERITY_ORDER.size() : i; }

    /** What one partner product contributes: a stored pair, or a line it cannot check. */
    private interface Visitor {
        void pair(PairRow row, Substance mine, Substance theirs);
        void notChecked(Substance mine, Substance theirs, String reason, boolean thisSide, String route);
    }

    /** The one per-partner rule: RouteRule on both sides, REASON_ORDER for unusable sides, the same substance skipped. */
    private static void walk(Product me, String partnerRoute, List<Substance> partnerSubstances, Map<String, PairRow> byKey,
                             Set<String> complete, Visitor v) {
        for (Substance s : me.substances())
            for (Substance t : partnerSubstances) {
                if (sameSubstance(s, t)) continue;
                Use us = use(s, me.route(), complete), ut = use(t, partnerRoute, complete);
                if (us.reason() == null && ut.reason() == null) {
                    for (String a : us.chosen())
                        for (String b : ut.chosen()) {
                            PairRow row = byKey.get(key(a, b));
                            if (row != null) v.pair(row, s, t);
                        }
                    continue;
                }
                boolean thisSide = ut.reason() == null || (us.reason() != null
                    && REASON_ORDER.indexOf(us.reason()) <= REASON_ORDER.indexOf(ut.reason()));
                v.notChecked(s, t, thisSide ? us.reason() : ut.reason(), thisSide, thisSide ? me.route() : partnerRoute);
            }
    }

    private static Map<String, PairRow> byKey(List<PairRow> rows) {
        Map<String, PairRow> out = new LinkedHashMap<>();
        for (PairRow r : rows) out.put(key(r.ddinterA(), r.ddinterB()), r);
        return out;
    }

    public static Result compute(String conceptId, List<Product> products, List<PairRow> rows, Set<String> complete) {
        Map<String, PairRow> byKey = byKey(rows);

        Set<String> batch = new HashSet<>();
        for (int i = 0; i < products.size(); i++)
            for (int j = i + 1; j < products.size(); j++)
                for (Substance s : products.get(i).substances())
                    for (Substance t : products.get(j).substances()) {
                        if (sameSubstance(s, t)) continue;
                        Use us = use(s, products.get(i).route(), complete), ut = use(t, products.get(j).route(), complete);
                        if (us.reason() != null || ut.reason() != null) continue;
                        for (String a : us.chosen()) for (String b : ut.chosen()) if (byKey.containsKey(key(a, b))) batch.add(key(a, b));
                    }

        Product me = products.stream().filter(p -> p.conceptId().equals(conceptId)).findFirst().orElse(null);
        if (me == null) return new Result(batch.size(), List.of(), List.of());

        Map<String, Pair> pairs = new LinkedHashMap<>();
        Map<String, NotChecked> notChecked = new LinkedHashMap<>();
        for (Product q : products) {
            if (q == me) continue;
            PartnerRef partner = new PartnerRef(q.conceptId(), q.tradeName(), q.index());
            walk(me, q.route(), q.substances(), byKey, complete, new Visitor() {
                @Override public void pair(PairRow row, Substance s, Substance t) {
                    String k = key(row.ddinterA(), row.ddinterB());
                    Pair old = pairs.get(k);
                    pairs.put(k, old == null
                        ? new Pair(row.ddinterA(), row.ddinterB(), row.nameA(), row.nameB(), s.name(), t.name(), row.severity(),
                            row.actions(), row.interaction(), row.management(), List.of(partner), row.interactionId(), null, null)
                        : withPartner(old, partner));
                }
                @Override public void notChecked(Substance s, Substance t, String reason, boolean thisSide, String route) {
                    String side = thisSide ? "this" : "partner";
                    // Spec §5.6.2/§6.7.3: the line names the route of the record the reason applies to, so partners that
                    // differ by route must not merge (a null route stays apart from a named one).
                    String k = s.name() + "|" + t.name() + "|" + reason + "|" + side + (thisSide ? "" : "|" + String.valueOf(q.route()));
                    NotChecked old = notChecked.get(k);
                    notChecked.put(k, old == null
                        ? new NotChecked(s.name(), t.name(), List.of(partner), reason, side, route)
                        : new NotChecked(old.substance(), old.partnerSubstance(), plus(old.partners(), partner), reason, side, old.route()));
                }
            });
        }
        List<Substance> own = me.substances();
        for (int i = 0; i < own.size(); i++)
            for (int j = i + 1; j < own.size(); j++)
                if (!sameSubstance(own.get(i), own.get(j)))
                    notChecked.put(own.get(i).name() + "|" + own.get(j).name() + "|same_product",
                        new NotChecked(own.get(i).name(), own.get(j).name(), List.of(), "same_product", "this", me.route()));

        List<Pair> sorted = new ArrayList<>(pairs.values());
        sorted.sort(Comparator.comparingInt((Pair x) -> severityRank(x.severity()))
            .thenComparing(x -> x.partnerSubstance().toLowerCase(Locale.ROOT))
            .thenComparing(Pair::ddinterA).thenComparing(Pair::ddinterB));
        return new Result(batch.size(), List.copyOf(sorted), List.copyOf(notChecked.values()));
    }

    /** A pair or line of {@link #computeFor} while it collects its partners (all of one status). */
    private static final class Acc {
        final PairRow row; final Substance mine, theirs; final String reason, side, route; final boolean approved;
        final List<OtherPartner> partners = new ArrayList<>();
        final Set<String> seen = new HashSet<>();
        Acc(PairRow row, Substance mine, Substance theirs, String reason, String side, String route, boolean approved) {
            this.row = row; this.mine = mine; this.theirs = theirs; this.reason = reason; this.side = side; this.route = route;
            this.approved = approved;
        }
        void add(OtherPartner p) { if (seen.add(p.conceptId())) partners.add(p); }
        List<OtherPartner> shown() {
            return partners.stream().sorted(PARTNER_ORDER).limit(PARTNERS_SHOWN).toList();
        }
    }

    private static final Comparator<OtherPartner> PARTNER_ORDER = Comparator.comparing(OtherPartner::batchId)
        .thenComparing(p -> p.tradeName().toLowerCase(Locale.ROOT)).thenComparing(OtherPartner::conceptId);

    /**
     * §7.3 otherPairs, linear: only me × partners, never partner × partner, and no batch-wide count. {@code partners} is the
     * latest current item of every product held in another batch (none of them in this batch). Entries are kept apart by
     * partner status, so the desk's two groups ("With approved medicines", "… not yet approved") read them as given.
     */
    public static OtherResult computeFor(Product me, List<OtherProduct> partners, List<PairRow> rows, Set<String> complete) {
        Map<String, PairRow> byKey = byKey(rows);
        Map<String, Acc> pairs = new LinkedHashMap<>(), lines = new LinkedHashMap<>();
        for (OtherProduct q : partners) {
            OtherPartner ref = new OtherPartner(q.conceptId(), q.tradeName(), q.batchId(), q.approved());
            walk(me, q.route(), q.substances(), byKey, complete, new Visitor() {
                @Override public void pair(PairRow row, Substance s, Substance t) {
                    pairs.computeIfAbsent(key(row.ddinterA(), row.ddinterB()) + "|" + q.approved(),
                        k -> new Acc(row, s, t, null, null, null, q.approved())).add(ref);
                }
                @Override public void notChecked(Substance s, Substance t, String reason, boolean thisSide, String route) {
                    String side = thisSide ? "this" : "partner";
                    String k = s.name() + "|" + t.name() + "|" + reason + "|" + side + (thisSide ? "" : "|" + String.valueOf(route))
                        + "|" + q.approved();
                    lines.computeIfAbsent(k, x -> new Acc(null, s, t, reason, side, route, q.approved())).add(ref);
                }
            });
        }
        List<OtherPair> outPairs = pairs.values().stream()
            .map(a -> new OtherPair(a.row.ddinterA(), a.row.ddinterB(), a.row.nameA(), a.row.nameB(), a.mine.name(), a.theirs.name(),
                a.theirs.bdsId(), a.row.severity(), a.row.actions(), a.row.interaction(), a.row.management(), a.row.interactionId(),
                null, null, a.shown(), a.partners.size()))
            .sorted(Comparator.comparingInt((OtherPair x) -> severityRank(x.severity()))
                .thenComparing(x -> x.partnerSubstance().toLowerCase(Locale.ROOT))
                .thenComparing(OtherPair::ddinterA).thenComparing(OtherPair::ddinterB)
                .thenComparing(x -> !x.partners().get(0).approved()))
            .toList();
        List<OtherNotChecked> outLines = lines.values().stream()
            .map(a -> new OtherNotChecked(a.mine.name(), a.theirs.name(), a.theirs.bdsId(), a.shown(), a.partners.size(), a.reason,
                a.side, a.route))
            .toList();
        int batches = (int) partners.stream().map(OtherProduct::batchId).distinct().count();
        return new OtherResult(outPairs, outLines, batches);
    }

    /**
     * §7.3 partnerScope of a text-missing pair (a, b) for a record that chooses {@code mine}, where {@code others} are the
     * ids chosen by the other current products of its batch: batch when others hold the partner side (either side when
     * mine holds both); else same_product when mine holds both; else other.
     */
    public static String partnerScope(String a, String b, Set<String> mine, Set<String> others) {
        boolean bothMine = mine.contains(a) && mine.contains(b);
        String partner = mine.contains(a) ? b : a;
        boolean inBatch = bothMine ? others.contains(a) || others.contains(b) : others.contains(partner);
        if (inBatch) return "batch";
        return bothMine ? "same_product" : "other";
    }

    private static Pair withPartner(Pair p, PartnerRef ref) {
        return new Pair(p.ddinterA(), p.ddinterB(), p.nameA(), p.nameB(), p.substance(), p.partnerSubstance(), p.severity(),
            p.actions(), p.interaction(), p.management(), plus(p.partners(), ref), p.interactionId(), p.source(), p.pairReview());
    }

    private static List<PartnerRef> plus(List<PartnerRef> list, PartnerRef ref) {
        if (list.contains(ref)) return list;
        List<PartnerRef> out = new ArrayList<>(list);
        out.add(ref);
        out.sort(Comparator.comparingInt(PartnerRef::index));
        return List.copyOf(out);
    }
}
