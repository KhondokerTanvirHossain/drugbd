package com.niramoy.bddrug.domain;
import java.util.*;

/**
 * §6.5 "With other approved medicines" and §7.4 P10 (D60): this product's DDInter pairs with every other public product
 * of any batch, grouped by partner substance, with RouteRule on both sides (BatchPairs.use, one rule). Pure. Linear in
 * partners × substances; no batch-wide count.
 */
public final class PublicPairs {
    private PublicPairs() {}

    public static final int PAGE_SIZE = 20, BRANDS_MAX = 50;
    public static final String SOURCE = "DDInter 2.0";

    public record Partner(String conceptId, String tradeName, String route, List<BatchPairs.Substance> substances) {}
    public record Row(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction, String management) {
        public Row {
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }
    public record SubstanceRef(String bdsId, String name) {}
    public record Brand(String conceptId, String tradeName) {}
    public record Pair(SubstanceRef substance, SubstanceRef partnerSubstance, String severity, List<String> actions, String interaction,
                       String management, String ddinterA, String ddinterB, boolean routeAssumed, String source,
                       PairReviewRule.PublicReview pairReview, List<Brand> brands, int brandCount) {}
    /** route: the partner brands' route for no_route (they share it), else null. */
    public record NotChecked(SubstanceRef substance, SubstanceRef partnerSubstance, String reason, String route, List<Brand> brands,
                             int brandCount) {}
    public record Result(String conceptId, int page, int totalPartners, List<Pair> partners, List<NotChecked> notChecked) {}

    private static final Comparator<Brand> BRAND_ORDER = Comparator
        .comparing((Brand b) -> b.tradeName().toLowerCase(Locale.ROOT)).thenComparing(Brand::conceptId);

    private static final class Brands {
        final Map<String, Brand> byId = new LinkedHashMap<>();
        void add(Brand b) { byId.putIfAbsent(b.conceptId(), b); }
        List<Brand> capped() { return byId.values().stream().sorted(BRAND_ORDER).limit(BRANDS_MAX).toList(); }
    }
    private static final class PairAcc {
        final Row row; final Brands brands = new Brands(); boolean assumed;
        PairAcc(Row row) { this.row = row; }
    }
    private static final class NcAcc {
        final String reason, route; final Brands brands = new Brands();
        NcAcc(String reason, String route) { this.reason = reason; this.route = route; }
    }
    private static final class Group {
        final SubstanceRef substance, partner;
        final Map<String, PairAcc> pairs = new LinkedHashMap<>();
        final Map<String, NcAcc> notChecked = new LinkedHashMap<>();
        Group(SubstanceRef substance, SubstanceRef partner) { this.substance = substance; this.partner = partner; }
        int rank() {
            if (!pairs.isEmpty()) return pairs.values().stream().mapToInt(p -> Severity.rank(p.row.severity())).min().orElse(3);
            return notChecked.containsKey("no_data") ? 4 : 5;
        }
    }

    private static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }
    private static SubstanceRef ref(BatchPairs.Substance s) { return new SubstanceRef(s.bdsId(), s.name()); }
    private static boolean assumed(BatchPairs.Substance s, String route) {
        return RouteRule.choose(s.codes(), route).map(RouteRule.Choice::routeAssumed).orElse(false);
    }

    public static Result compute(String conceptId, String route, List<BatchPairs.Substance> mine, List<Partner> partners, List<Row> rows,
                                 Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews, int page) {
        Map<String, Row> byKey = new HashMap<>();
        for (Row r : rows) byKey.put(key(r.ddinterA(), r.ddinterB()), r);
        Map<String, Group> groups = new LinkedHashMap<>();
        for (BatchPairs.Substance s : mine) {
            BatchPairs.Use us = BatchPairs.use(s, route, complete);
            if (us.reason() != null) continue;
            boolean sAssumed = assumed(s, route);
            for (Partner q : partners) {
                if (q.conceptId().equals(conceptId)) continue;
                Brand brand = new Brand(q.conceptId(), q.tradeName());
                for (BatchPairs.Substance t : q.substances()) {
                    if (t.bdsId() != null && t.bdsId().equals(s.bdsId())) continue;
                    String gk = s.bdsId() + "|" + (t.bdsId() != null ? t.bdsId() : "name:" + t.name());
                    Group g = groups.computeIfAbsent(gk, k -> new Group(ref(s), ref(t)));
                    BatchPairs.Use ut = BatchPairs.use(t, q.route(), complete);
                    if (ut.reason() != null) {
                        String r = ut.reason(), rt = "no_route".equals(r) ? q.route() : null;
                        g.notChecked.computeIfAbsent(r + "|" + rt, k -> new NcAcc(r, rt)).brands.add(brand);
                        continue;
                    }
                    boolean tAssumed = assumed(t, q.route());
                    for (String a : us.chosen())
                        for (String b : ut.chosen()) {
                            Row row = byKey.get(key(a, b));
                            if (row == null) continue;
                            PairAcc acc = g.pairs.computeIfAbsent(key(a, b), k -> new PairAcc(row));
                            acc.brands.add(brand);
                            acc.assumed |= sAssumed || tAssumed;
                        }
                }
            }
        }
        List<Group> ordered = groups.values().stream().filter(g -> !g.pairs.isEmpty() || !g.notChecked.isEmpty())
            .sorted(Comparator.comparingInt(Group::rank)
                .thenComparing(g -> g.partner.name().toLowerCase(Locale.ROOT))
                .thenComparing(g -> g.substance.name().toLowerCase(Locale.ROOT)))
            .toList();
        int from = Math.min(page * PAGE_SIZE, ordered.size()), to = Math.min(from + PAGE_SIZE, ordered.size());
        List<Pair> pairs = new ArrayList<>();
        List<NotChecked> notChecked = new ArrayList<>();
        for (Group g : ordered.subList(from, to)) {
            g.pairs.values().stream()
                .sorted(Comparator.comparingInt((PairAcc p) -> Severity.rank(p.row.severity()))
                    .thenComparing(p -> p.row.ddinterA()).thenComparing(p -> p.row.ddinterB()))
                .forEach(p -> pairs.add(new Pair(g.substance, g.partner, p.row.severity(), p.row.actions(), p.row.interaction(),
                    p.row.management(), p.row.ddinterA(), p.row.ddinterB(), p.assumed, SOURCE,
                    reviews.getOrDefault(p.row.ddinterA() + "|" + p.row.ddinterB(), PublicPairReviews.NONE),
                    p.brands.capped(), p.brands.byId.size())));
            g.notChecked.values().stream()
                .sorted(Comparator.comparingInt((NcAcc n) -> BatchPairs.REASON_ORDER.indexOf(n.reason))
                    .thenComparing(n -> String.valueOf(n.route)))
                .forEach(n -> notChecked.add(new NotChecked(g.substance, g.partner, n.reason, n.route, n.brands.capped(),
                    n.brands.byId.size())));
        }
        return new Result(conceptId, page, ordered.size(), List.copyOf(pairs), List.copyOf(notChecked));
    }
}
